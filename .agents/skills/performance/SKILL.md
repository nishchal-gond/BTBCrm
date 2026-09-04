---
name: performance
description: Performance engineering for the Trading Academy CRM — Next.js server components and code splitting, dynamic imports for 3D, WebGL resource and texture budgets, device pixel ratio capping, PostgreSQL query and index tuning, and caching. Use when adding heavy dependencies, building the globe or large tables, or when load time, frame rate, bundle size, or query latency needs to be measured or improved.
---

# Performance

## When to use

Adding a heavy dependency, building the globe or any 3D surface, building large tables
or lists, writing queries, or investigating slow loads, dropped frames, large bundles,
or slow database responses.

## Principle: a beautiful dashboard must stay fast

This product is dense, dark, and 3D-heavy — exactly the profile that becomes slow by
accident. Performance is a design constraint, checked while building, not a cleanup
task afterwards.

## Budgets

Treat these as acceptance criteria, measured on a mid-range laptop over a throttled
connection — not on the dev machine:

| Metric                            | Budget                     |
| --------------------------------- | -------------------------- |
| LCP (dashboard)                   | < 2.5s                     |
| INP                               | < 200ms                    |
| CLS                               | < 0.1                      |
| Initial JS (excluding 3D chunk)   | < 250KB gzipped            |
| Globe sustained frame rate        | ≥ 50fps desktop, ≥ 30 mobile |
| p95 list query                    | < 200ms                    |
| Time to interactive KPI rail      | before the globe finishes loading |

## Responsibilities

1. Keep the server/client boundary low so the initial bundle stays small.
2. Keep the heavy dependencies — Three.js, R3F, drei, Mapbox, FullCalendar — out of
   the shared chunk and behind route-scoped dynamic imports.
3. Hold the globe's frame budget through texture, draw-call, and DPR discipline, and
   reclaim GPU memory on unmount.
4. Push filtering, sorting, and aggregation into PostgreSQL, with indexes that match
   the real queries — including every RLS predicate column.
5. Choose caching per route deliberately, and never let client-scoped data reach a
   shared cache.
6. Measure before and after, on representative hardware, and report the numbers.

## Rules

### Next.js

- Server Components by default. `"use client"` only on components that genuinely need
  interactivity, and pushed as far down the tree as possible — a client boundary at the
  page level ships the whole page to the browser.
- Fetch on the server. Avoid client-side waterfalls; parallelize independent fetches.
- Use Suspense boundaries so the shell and KPI rail paint before slow regions resolve.
- Stream where it helps; do not block the whole page on the heaviest query.
- Choose caching deliberately per route: static where possible, revalidated where data
  is periodic, dynamic where it must be live. Do not accept the default without thinking.
- `next/image` for all raster images, with explicit dimensions to prevent layout shift.
- `next/font` for self-hosted fonts, subset to the characters used, with
  `display: swap`. Preload only the faces used above the fold.
- Route-level code splitting is automatic; verify it is actually happening with the
  bundle analyzer rather than assuming.

### Bundle discipline

- Run the bundle analyzer before and after adding any dependency over ~20KB.
- Reject a dependency when a small amount of local code, a native platform API, or an
  existing dependency covers the need.
- Import narrowly (`import { x } from 'lib/x'`), never a whole library for one helper.
- Prefer `Intl` for date, number, and currency formatting over a formatting library.
- Watch for duplicated transitive dependencies and multiple versions of the same package.
- Three.js, R3F, drei, Mapbox, and FullCalendar are all large — every one of them is
  dynamically imported and route-scoped, never in the shared chunk.

### 3D and WebGL

- `dynamic(() => import(...), { ssr: false })` for every canvas. The 3D chunk must not
  be in the initial payload of any route that does not render 3D.
- Cap `devicePixelRatio` — `dpr={[1, 2]}`. Uncapped DPR on a 3× display renders nine
  times the pixels for no perceptible gain.
- `frameloop="demand"` with `invalidate()` for scenes static between interactions.
  The globe rotates, so it runs continuously — but it must pause rendering entirely
  when off-screen (`IntersectionObserver`) or when the tab is hidden.
- **Textures dominate the memory budget.** Size to on-screen need. Compress with
  KTX2/Basis. Generate mipmaps. Keep anisotropy modest. A 4K Earth albedo for a
  600px-tall globe is waste.
- Load textures progressively: a low-resolution Earth first so the globe appears
  immediately, then swap in full resolution.
- Reuse geometries and materials; use instancing for repeated markers.
- Zero allocation in `useFrame` — hoist scratch `Vector3`/`Quaternion` objects.
- Keep draw calls and real-time lights low. Prefer emissive materials over extra lights.
- Post-processing is expensive; add only with a measured before/after frame cost.
- Dispose everything on unmount and verify with `renderer.info` across remounts —
  a leak here degrades the session over time, not immediately.
- Offer a quality tier: reduce texture resolution, marker effects, and DPR on
  low-memory or low-core devices.

### Data and queries

- Select explicit columns. Never `select *` on client or event tables.
- Paginate every list. Prefer keyset (cursor) pagination over `offset` for large sets —
  `offset` degrades linearly.
- Push filtering, sorting, and aggregation into PostgreSQL. Never fetch broadly and
  filter in JavaScript — it is both slow and a security anti-pattern in this product.
- Avoid N+1: fetch related data with joins or a single batched query, not per-row.
- Index foreign keys used in filters and joins, and **every column an RLS policy tests**
  — an unindexed RLS predicate turns each access into a scan.
- Composite indexes ordered to match the real predicate and sort.
- Verify with `explain (analyze, buffers)` against realistic row counts. Look for
  sequential scans on large tables and mis-estimated row counts.
- Derived deposit totals: aggregate in SQL, not by fetching all transactions to the
  client. If aggregation becomes hot, use a materialized view with a documented
  refresh strategy.
- Calendar queries are always bounded by a date range and use the
  `(starts_at, ends_at)` index. Never fetch all events.
- Expand recurring events for the queried window only.

### Rendering large lists

- Virtualize lists beyond a few hundred rows.
- Stable keys; avoid index keys on reorderable data.
- Memoize expensive rows, but measure first — `memo` on cheap components costs more
  than it saves.
- Debounce search input and cancel superseded requests.
- Reserve space for async content so nothing shifts.

### Caching

- Cache at the level that fits the data: static assets aggressively and immutably,
  reference data (programs, users) for minutes, client data not at all across users.
- **Never cache a response containing client data in a shared or CDN cache.** Scoped
  data must be per-user or uncached — a shared cache is a cross-tenant leak.
- Revalidate on mutation rather than polling on a short interval.
- Market session state is computed client-side from the clock; it does not need a
  network round trip.

### Measurement

- Measure before optimizing. Profile, do not guess at the bottleneck.
- Lighthouse and Web Vitals on the real deployment, throttled.
- React Profiler for render cost; `renderer.info` and `stats` for 3D.
- `explain analyze` for queries.
- Record the before and after numbers in the report. An optimization without a
  measurement is a guess.

## Anti-patterns

- `"use client"` at the top of a page, shipping the whole tree to the browser.
- Three.js, Mapbox, or FullCalendar in the shared/initial bundle.
- Uncapped `devicePixelRatio`.
- 4K textures for small viewports; uncompressed PNG texture sets.
- Allocating objects inside `useFrame`.
- Rendering the globe while off-screen or in a hidden tab.
- Skipping disposal, leaking GPU memory across route changes.
- `select *`, then filtering in JavaScript.
- `offset` pagination over large tables.
- N+1 queries per row.
- Unindexed RLS predicate columns.
- Fetching an entire calendar year to render one week.
- Caching client-scoped responses in a shared cache.
- Polling every second for data that changes hourly.
- Optimizing without a measurement, or reporting an optimization without numbers.

## Quality checklist

- [ ] Client boundaries pushed down; page shells are Server Components.
- [ ] Bundle analyzer run; initial JS within budget; 3D/map/calendar chunks split out.
- [ ] Every canvas dynamically imported with `ssr: false`.
- [ ] `dpr` capped; rendering paused off-screen and on hidden tabs.
- [ ] Textures sized, compressed, mipmapped; progressive load for the Earth.
- [ ] Geometry/material reuse and instancing for markers; no per-frame allocation.
- [ ] Disposal verified via `renderer.info` across mount/unmount cycles.
- [ ] Quality tier for low-power devices.
- [ ] Explicit column selection; all lists paginated; keyset where large.
- [ ] Filtering, sorting, aggregation in SQL; no N+1.
- [ ] Foreign keys and RLS predicate columns indexed; `explain analyze` reviewed.
- [ ] Calendar queries date-bounded; recurrence expanded per window.
- [ ] No client-scoped data in a shared cache.
- [ ] Large lists virtualized; search debounced; no layout shift.
- [ ] Measured on a mid-range machine over a throttled connection.
- [ ] Before/after numbers recorded in the report.
