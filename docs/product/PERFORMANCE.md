# Performance

Budgets, measurement method, and the specific decisions that keep a dark, dense,
3D-heavy console fast.

---

## 1. Why this needs a document

This product has the exact profile that becomes slow by accident: a WebGL hero on the
landing route, four large libraries (Three.js, drei, FullCalendar, Mapbox), dense
tables, and RLS predicates evaluated on every row access.

None of that is a problem if it is budgeted from the start. All of it is a problem if
performance is a cleanup task at the end.

## 2. Budgets

Measured on a **mid-range laptop** (integrated graphics, 4 cores) over a **throttled
connection** (Fast 3G / 4× CPU slowdown) — not on the development machine.

| Metric | Budget | Notes |
| ------ | ------ | ----- |
| LCP (dashboard) | < 2.5s | LCP element is the KPI rail, **not** the globe |
| INP | < 200ms | |
| CLS | < 0.1 | Skeletons must match real layout |
| Initial JS, excl. 3D chunk | < 250KB gzipped | |
| 3D chunk | < 600KB gzipped | Loads after first paint |
| Earth textures, total | < 6MB | Compressed, progressive |
| Globe sustained frame rate | ≥ 50fps desktop / ≥ 30fps mobile | |
| Globe draw calls | < 60 | |
| Time to interactive KPI rail | **Before the globe chunk finishes** | |
| p95 list query | < 200ms | At realistic row counts |
| p95 calendar week query | < 250ms | Including recurrence expansion |

**The LCP element is deliberately not the globe.** A user must be able to read today's
numbers while Three.js is still downloading. If the globe is ever the LCP element, the
dashboard's rendering strategy is wrong.

## 3. Next.js

### Server/client boundary

- Server Components by default. `"use client"` only where interactivity requires it,
  **pushed to the leaf**.
- A `"use client"` at the top of a page ships the entire subtree to the browser. This
  is the single most common way a Next.js bundle doubles.
- Data fetching on the server; client components receive data as props.
- Suspense boundaries per dashboard region so the shell and KPI rail paint before the
  slower regions resolve.

### Route-level splitting

| Library | Loaded on | Method |
| ------- | --------- | ------ |
| Three.js / R3F / drei | `/dashboard` only | `dynamic(..., { ssr: false })` |
| FullCalendar | `/calendar` only | route-scoped dynamic import |
| Mapbox GL | nowhere in v1 | not installed until a real map exists |

**None of these may appear in the shared chunk.** Verified with the bundle analyzer, in
CI, not by inspection.

### Caching strategy

| Route | Strategy |
| ----- | -------- |
| `(auth)/*` | Static |
| `/programs` | Dynamic, short revalidate — reference data |
| Everything client-scoped | **Dynamic, never cached** |

**No client-scoped response may enter a shared or CDN cache.** A shared cache holding
RLS-scoped data serves one user's clients to another. This is a security control that
happens to live in the performance document — see [SECURITY.md](SECURITY.md).

Cache invalidation is `revalidatePath` on mutation, never short-interval polling.

### Assets

- `next/font/local` for Geist and Geist Mono, Latin subset, `display: swap`. Only
  above-the-fold weights preloaded.
- `next/image` with explicit dimensions everywhere — no layout shift.
- `Intl` for all date, number, and currency formatting. **No formatting library** is
  worth its bundle cost for this.

## 4. Bundle discipline

- Run the bundle analyzer **before and after** any dependency over ~20KB.
- Reject a dependency when local code, a platform API, or an existing dependency covers
  the need.
- Import narrowly — `import { x } from 'lib/x'`, never the whole library for one helper.
- Watch for duplicated transitive dependencies and multiple versions of one package.
- CI gate: fail the build if the shared chunk exceeds budget, or if `three` /
  `@fullcalendar` appear in it.

## 5. 3D and WebGL

The globe's full architecture is in [3D_ARCHITECTURE.md](3D_ARCHITECTURE.md). The cost
controls:

| Control | Specification | Why |
| ------- | ------------- | --- |
| Dynamic import | `ssr: false`, route-scoped | Three.js does not run on the server and must not block first paint |
| `dpr` | `[1, 2]` | Uncapped DPR on a 3× display renders **9× the pixels** for no perceptible gain |
| Off-screen pause | `IntersectionObserver` | A rotating globe nobody is looking at is pure waste |
| Hidden-tab pause | `visibilitychange` | Same, for background tabs |
| Frame allocation | **Zero** — scratch `Vector3`/`Quaternion` hoisted | Per-frame allocation is GC pressure at 60Hz |
| Per-frame state | Refs only, never `setState` | A `setState` per frame is a React render per frame |
| Time base | `delta`, never frame count | Framerate-independent motion |
| Session recompute | 60s interval | Session state changes a few times a day; computing it at 60fps is 3,600× the work |
| Terminator recompute | 60s interval | Same reasoning |
| Textures | Sized to need, KTX2/Basis, mipmapped | Textures dominate GPU memory |
| Progressive load | Low-res Earth first, full-res swap | Globe appears immediately |
| Instancing | City markers instanced | 7 markers × 3 elements is 21 draw calls otherwise |
| Reuse | Shared geometries and materials | |
| Disposal | Full, verified via `renderer.info` | A leak degrades the session over time, not immediately |
| Quality tiers | `deviceMemory` / `hardwareConcurrency` | Reduced textures, no orbitals, `dpr` 1 on weak devices |

**Texture budget is the number to watch.** A 4K Earth albedo for a 600px-tall globe is
waste measured in megabytes and milliseconds. Size to the largest realistic render size,
not to what was available for download.

**Disposal verification** is a specific test, not a hope: capture `renderer.info`
geometry and texture counts before mount, while mounted, and after unmount. They must
return to baseline across repeated mount/unmount cycles.

## 6. Database and queries

### Query rules

- **Explicit columns.** No `select *` on `clients` or `calendar_events`.
- **Every list paginated.** Keyset (cursor) pagination over `offset` for large sets —
  `offset` degrades linearly as users page deeper.
- **Filtering, sorting, and aggregation in SQL.** Never fetch broadly and filter in
  JavaScript. In this product that is both slow and a security anti-pattern.
- **No N+1.** Related data via join or a single batched query, never per-row.
- Calendar queries always date-bounded; recurrence expanded per window with a hard cap.
- Deposit totals aggregated in SQL via `client_deposit_totals`, never by fetching all
  transactions to the client.

### RLS cost

This is the performance concern unique to this architecture.

**Every column an RLS predicate tests must be indexed.** An unindexed RLS predicate
turns every row access into a sequential scan — the policy is correct and the product
is unusable.

Required (from [AUTHORIZATION.md §3.2](AUTHORIZATION.md)):

```
clients (sales_owner_id)        clients (mentor_owner_id)
deposits (client_id)            enrollments (client_id)
tasks (assignee_id)             tasks (client_id)
calendar_events (organizer_id)  calendar_events (client_id)
event_attendees (user_id)
```

The `app.can_access_client()` helper is declared `stable` so the planner can hoist it
rather than re-evaluating per row. Verify this is actually happening in the plan — a
`stable` function still called per row on a large scan is the failure mode to watch for.

### Verification

`explain (analyze, buffers)` against **realistic row counts**, not an empty dev
database. Look for:

- sequential scans on `clients`, `deposits`, `calendar_events`
- row-count mis-estimates (a sign the planner needs statistics or a different index)
- the RLS predicate appearing as a per-row filter rather than an index condition

Composite indexes ordered to match the real predicate and sort — e.g.
`clients (sales_owner_id, status, last_activity_at desc)` serves a salesperson's
default list in one index scan.

## 7. Rendering large lists

- Virtualize beyond a few hundred rows.
- Stable keys; never index keys on sortable or reorderable data.
- Memoize expensive rows — but **measure first**. `memo` on a cheap component costs
  more than it saves.
- Debounce search input; cancel superseded requests.
- Reserve space for async content so nothing shifts.

## 8. Measurement

**Measure before optimizing. Profile; do not guess at the bottleneck.**

| Concern | Tool |
| ------- | ---- |
| Bundle | `@next/bundle-analyzer` |
| Web Vitals | Lighthouse on the real deployment, throttled |
| Render cost | React Profiler |
| 3D | `renderer.info`, `stats.js`, browser GPU profiler |
| Queries | `explain (analyze, buffers)` |
| Real users | Vercel Analytics |

**Record before and after numbers in every performance report.** An optimization
without a measurement is a guess, and the `3d-engineer` and `frontend-engineer` agents
are required to report numbers rather than adjectives.

## 9. Anti-patterns

- `"use client"` at page level, shipping the whole tree
- Three.js, FullCalendar, or Mapbox in the shared bundle
- Uncapped `devicePixelRatio`
- 4K textures for small viewports; uncompressed PNG texture sets
- Allocating inside `useFrame`
- Rendering the globe off-screen or in a hidden tab
- Skipping disposal — GPU memory growing across route changes
- `select *`, then filtering in JavaScript
- `offset` pagination over large tables
- N+1 queries
- **Unindexed RLS predicate columns**
- Fetching a year of events to render one week
- **Client-scoped data in a shared cache**
- Polling every second for data that changes hourly
- Optimizing without measurement, or reporting one without numbers

## 10. Pre-launch checklist

- [ ] Client boundaries pushed to leaves; page shells are Server Components
- [ ] Bundle analyzer run; shared chunk within budget
- [ ] `three`, `@fullcalendar` absent from the shared chunk — CI gate in place
- [ ] Globe canvas `dynamic(..., { ssr: false })`
- [ ] `dpr` capped at `[1, 2]`
- [ ] Rendering pauses off-screen and on hidden tabs
- [ ] Textures compressed, sized, mipmapped; progressive Earth load
- [ ] Markers instanced; no per-frame allocation; no per-frame `setState`
- [ ] Disposal verified via `renderer.info` across repeated mount/unmount
- [ ] Quality tier for low-memory devices
- [ ] All RLS predicate columns indexed — verified in `pg_indexes`
- [ ] `explain analyze` reviewed on realistic data for every list query
- [ ] All lists paginated; keyset where large
- [ ] Calendar queries date-bounded; recurrence capped
- [ ] No client-scoped route cached statically or in a shared cache
- [ ] Lighthouse run on the deployed app, throttled, meeting §2
- [ ] Frame rate measured on mid-range hardware, not the dev machine
- [ ] Before/after numbers recorded

---

## Open questions

1. **Realistic data volumes are unknown.** Budgets assume roughly 10k clients, 50k
   deposits, 100k events. If the real scale is an order of magnitude larger, keyset
   pagination and the composite index choices need revisiting before launch.
2. **Earth texture resolution tier** is unresolved pending source selection — see
   [3D_ARCHITECTURE.md](3D_ARCHITECTURE.md) open decision 3. The 6MB budget in §2 is
   the constraint that decision must satisfy.
3. **`stable` function hoisting under RLS** should be confirmed empirically early —
   if PostgreSQL calls `app.can_access_client()` per row on `deposits` scans, the
   policy may need restructuring into a join-friendly form.
