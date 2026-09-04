# Product Architecture

**Trading Academy CRM / Operations Platform**
Company base: Dubai, UAE · Company timezone: `Asia/Dubai`
Status: **architecture phase — no application code written yet**

---

## 1. What this product is

An internal operations console for a premium trading academy. Sales staff source and
qualify leads; mentors take those people through a program; the business tracks money,
schedule, and accountability across both.

It is **not** a trading platform. It executes no trades, connects to no broker, and
carries no market data feed beyond exchange session state used for situational context.

## 2. Users

Three roles, defined fully in [USER_ROLES.md](USER_ROLES.md):

| Role     | Population | Primary job                                              |
| -------- | ---------- | -------------------------------------------------------- |
| `admin`  | few        | Runs the business. Sees everything. Assigns and reassigns.|
| `sales`  | many       | Sources leads, qualifies, hands to mentors, closes.       |
| `mentor` | many       | Teaches assigned students, runs sessions, tracks progress.|

## 3. Modules (v1)

| # | Module           | Route root      | Core entity        |
| - | ---------------- | --------------- | ------------------ |
| 1 | Dashboard        | `/dashboard`    | — (aggregate)      |
| 2 | Market Globe     | `/dashboard`    | — (static config)  |
| 3 | Leads            | `/leads`        | `clients` (pre-conversion) |
| 4 | Clients          | `/clients`      | `clients`          |
| 5 | Sales Team       | `/sales-team`   | `profiles`         |
| 6 | Mentors          | `/mentors`      | `profiles`         |
| 7 | Students         | `/students`     | `clients` (post-conversion) + `enrollments` |
| 8 | Programs         | `/programs`     | `programs`         |
| 9 | Deposits         | `/deposits`     | `deposits`         |
| 10| Company Calendar | `/calendar`     | `calendar_events`  |
| 11| Tasks            | `/tasks`        | `tasks`            |
| 12| Users / Roles    | `/settings/users` | `profiles`       |
| 13| Settings         | `/settings`     | `app_settings`     |
| 14| Audit Logs       | `/audit`        | `audit_log`        |

**Leads, Clients, and Students are three views of one table.** This is the single most
important structural fact in the product. See §5.

### Explicitly out of scope for v1

Communication center · trading support · trade execution · broker integration ·
trading signals · advanced analytics · social/community · AI features.

No table, column, route, or component may be added "in preparation" for these.

## 4. System shape

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ React Server  │  │ Client comps │  │ WebGL canvas │  │
│  │ Component     │  │ (interactive)│  │ (globe)      │  │
│  │ output (HTML) │  │              │  │ dynamic,     │  │
│  │               │  │              │  │ ssr:false    │  │
│  └───────────────┘  └──────────────┘  └──────────────┘  │
└───────────────┬─────────────────────────────────────────┘
                │ httpOnly session cookie
┌───────────────▼─────────────────────────────────────────┐
│  Next.js on Vercel (App Router)                         │
│  ┌──────────────────┐  ┌────────────────────────────┐   │
│  │ Server Components│  │ Server Actions / Route      │   │
│  │ — all reads      │  │ Handlers — all writes       │   │
│  │ — Supabase SSR   │  │ — Zod validation            │   │
│  │   client, user   │  │ — re-derive user from       │   │
│  │   JWT attached   │  │   session, never from body  │   │
│  └────────┬─────────┘  └───────────┬────────────────┘   │
└───────────┼────────────────────────┼────────────────────┘
            │ PostgREST, user JWT    │
┌───────────▼────────────────────────▼────────────────────┐
│  Supabase                                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  ROW LEVEL SECURITY  ← the authorization boundary  │  │
│  └───────────────────────┬───────────────────────────┘  │
│  ┌──────────┐  ┌─────────▼────────┐  ┌──────────────┐   │
│  │ Auth     │  │ PostgreSQL       │  │ Storage      │   │
│  │          │  │ + triggers/audit │  │ (bucket RLS) │   │
│  └──────────┘  └──────────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**The authorization boundary is inside PostgreSQL, not in Next.js.** Every read carries
the end user's JWT to PostgREST, and RLS decides what rows come back. The application
layer adds validation, UX, and defense in depth — never the primary guarantee. See
[AUTHORIZATION.md](AUTHORIZATION.md).

### Layer responsibilities

| Layer                | Owns                                                    | Must never                          |
| -------------------- | ------------------------------------------------------- | ----------------------------------- |
| PostgreSQL + RLS     | Who can see/change which row. Data integrity.            | Trust the app to filter             |
| Server Components    | Reading scoped data, rendering                          | Fetch broadly and filter in JS      |
| Server Actions       | Validating and performing writes                        | Accept identity from the request    |
| Client Components    | Interaction, optimistic UI, hiding unusable controls     | Be the only permission check        |
| WebGL canvas         | The globe                                               | Block first paint                   |

## 5. The central data fact

**One human = one row in `clients` = one permanent `client_ref` (`CL-000184`).**

```
        ┌───────────────────────────────────────────────┐
        │              clients (one person)             │
        │  client_ref  CL-000184   ← permanent, forever │
        └───────────────────────────────────────────────┘
             │
   status:   lead → qualified → mentor_assigned → converted → student
             │
   module:   ──── Leads ────────────────────┤├──── Students ────
                       (also visible in Clients throughout)
```

Leads is `clients` filtered to pre-conversion statuses. Students is `clients` filtered
to post-conversion statuses joined to `enrollments`. Clients is the unfiltered view.

Conversion is an `UPDATE` on one row. It never inserts a person. Full lifecycle in
[DATABASE.md §4](DATABASE.md) and the module UX in the `crm-ux` skill.

## 6. Ownership model

Every client carries five provenance columns, all foreign keys to `profiles`:

| Column            | Set when                   | Ever cleared? |
| ----------------- | -------------------------- | ------------- |
| `created_by`      | row is inserted            | **never**     |
| `sales_owner_id`  | assigned (usually creator) | reassign only |
| `mentor_owner_id` | mentor assigned            | reassign only |
| `converted_by`    | conversion                 | **never**     |
| `converted_at`    | conversion                 | **never**     |

> Priya creates Rahul → `created_by = Priya`, `sales_owner_id = Priya`.
> Michael closes Rahul → `mentor_owner_id = Michael`, `converted_by = Michael`,
> `converted_at = now()`. **Same row. Still `CL-000184`. Priya keeps her credit.**

Visibility derives from `sales_owner_id` and `mentor_owner_id`. See
[PERMISSIONS.md](PERMISSIONS.md).

## 7. Entity relationships (conceptual)

```
                          profiles (users)
                          ▲   ▲   ▲   ▲
          created_by ─────┘   │   │   └───── converted_by
                  sales_owner─┘   └─mentor_owner
                          │
                     ┌────┴─────┐
                     │ clients  │◄──── the person, permanent ID
                     └────┬─────┘
        ┌─────────┬───────┼────────┬──────────┬───────────┐
        ▼         ▼       ▼        ▼          ▼           ▼
  enrollments  deposits  tasks  calendar_  client_    audit_log
        │      (ledger)         events     status_
        ▼                       (client_   history
    programs                     id opt.)
```

Physical schema in [DATABASE.md](DATABASE.md).

## 8. Stack decisions

| Layer      | Choice                        | Why                                                    |
| ---------- | ----------------------------- | ------------------------------------------------------ |
| Framework  | Next.js App Router, TS        | Server Components keep the client bundle small next to a heavy 3D chunk |
| Styling    | Tailwind + shadcn/ui          | shadcn is copied-in source, so it can be fully restyled to the design language |
| 3D         | Three.js + R3F + drei         | Declarative scene graph composes with React state       |
| Maps       | Mapbox GL JS                  | Only where real geography is needed — **not** the globe |
| Animation  | Motion                        | Layout-aware transitions with reduced-motion support    |
| Backend    | Supabase (Postgres/Auth/Storage) | RLS lets authorization live in the database, which is the product's core security requirement |
| Calendar   | FullCalendar                  | Mature recurrence and time-grid mechanics; fully restyled |
| Testing    | Playwright + Vitest           | Playwright can run multi-user permission tests as separate browser contexts |
| Deployment | Vercel                        | First-class App Router support                          |

**Version note:** all versions are pinned at implementation time against current
documentation (context7 / official docs), not from memory.

## 9. Data flow patterns

**Read** — Server Component → Supabase SSR client (user JWT) → RLS filters → render.
No client-side owner filtering, ever.

**Write** — Client form → Zod (UX) → Server Action → re-derive user server-side →
same Zod schema (authoritative) → explicit authorization check → mutation → RLS
`with check` → trigger writes audit → `revalidatePath`.

**Globe** — static city config in TS + client clock. Zero network calls for session
state. Never a database table; see [3D_ARCHITECTURE.md](3D_ARCHITECTURE.md).

## 10. Cross-cutting rules

- **Time** — every timestamp `timestamptz`. Every display uses an IANA ID. No
  hardcoded UTC offsets anywhere in the codebase, ever.
- **Money** — `numeric(14,2)`, currency code always shown (`AED 25,000`), totals
  always derived from the `deposits` ledger.
- **Identity** — `client_ref` is immutable and appears in every view of a person.
- **Audit** — written by database triggers, not application code, so no code path can
  skip it.
- **Honesty** — no mock data presented as real; nothing reported complete while its
  backend is stubbed, its RLS is missing, or its tests have not run.

## 11. Document map

| Document | Covers |
| -------- | ------ |
| [DATABASE.md](DATABASE.md) | Tables, columns, constraints, indexes, triggers, migrations |
| [AUTHORIZATION.md](AUTHORIZATION.md) | RLS policy design, helper functions, per-table policies |
| [PERMISSIONS.md](PERMISSIONS.md) | The permission matrix, role × resource × action |
| [USER_ROLES.md](USER_ROLES.md) | Role definitions, capabilities, assignment rules |
| [SECURITY.md](SECURITY.md) | Threat model, secrets, sessions, denial behavior, storage |
| [ROUTES.md](ROUTES.md) | Route tree, layouts, screen structure, navigation |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Tokens, type, color, components, states |
| [3D_ARCHITECTURE.md](3D_ARCHITECTURE.md) | Globe scene graph, cities, sessions, fallback |
| [CALENDAR.md](CALENDAR.md) | Views, filters, recurrence, timezones, availability |
| [PERFORMANCE.md](PERFORMANCE.md) | Budgets, splitting, 3D cost, query tuning |
| [TEST_PLAN.md](TEST_PLAN.md) | Permission matrix tests, functional, visual, regression |

## 12. Build order (not yet started)

1. Supabase project, schema migrations, RLS policies, seed users — *nothing renders*
2. Auth shell, layouts, design tokens
3. Clients / Leads / Students (the lifecycle core)
4. Deposits ledger
5. Calendar
6. Tasks, Programs, Sales Team, Mentors
7. Dashboard shell + KPIs
8. Globe
9. Users/Roles, Settings, Audit
10. Hardening: full permission suite, performance pass, visual pass

The globe is deliberately late. It is the most visible feature and the least
load-bearing; building it first would produce a demo instead of a product.

---

## Open decisions

Recorded rather than silently assumed:

1. **Client URL identifier** — `client_ref` (`/clients/CL-000184`) is chosen for
   operator usability. It is sequential and therefore enumerable; RLS makes
   enumeration return nothing, so the exposure is a row-count inference at worst.
   Documented in [ROUTES.md](ROUTES.md) and [SECURITY.md](SECURITY.md).
2. **No `manager` role in v1** — only `admin`, `sales`, `mentor`. A sales manager who
   needs team-wide visibility is currently an `admin`. Flagged in
   [USER_ROLES.md](USER_ROLES.md) as the most likely first extension.
3. **Exchange trading hours** — the seed table in [3D_ARCHITECTURE.md](3D_ARCHITECTURE.md)
   must be verified against each exchange's published calendar before launch, and
   holiday closures are out of scope for v1 (weekends are handled).
