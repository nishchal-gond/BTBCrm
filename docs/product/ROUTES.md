# Routes and Screen Structure

Next.js App Router. Route groups, layouts, screen composition, and navigation.

Design language in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md); access rules in
[PERMISSIONS.md](PERMISSIONS.md).

---

## 1. Route tree

```
app/
├── layout.tsx                          root: fonts, theme, providers
├── (auth)/
│   ├── layout.tsx                      centered, no chrome
│   ├── login/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
│
├── (app)/                              authenticated shell
│   ├── layout.tsx                      sidebar + topbar + session
│   │
│   ├── dashboard/page.tsx              globe + KPI rail + schedule
│   │
│   ├── leads/
│   │   ├── page.tsx                    pre-conversion clients
│   │   └── new/page.tsx                create lead (also a modal route)
│   │
│   ├── clients/
│   │   ├── page.tsx                    all accessible clients
│   │   └── [clientRef]/
│   │       ├── layout.tsx              persistent header + tab nav
│   │       ├── page.tsx                → Overview
│   │       ├── sales/page.tsx
│   │       ├── student/page.tsx
│   │       ├── deposits/page.tsx
│   │       ├── schedule/page.tsx
│   │       └── activity/page.tsx
│   │
│   ├── students/page.tsx               post-conversion + enrollment
│   ├── sales-team/
│   │   ├── page.tsx
│   │   └── [userId]/page.tsx           admin: book + performance
│   ├── mentors/
│   │   ├── page.tsx
│   │   └── [userId]/page.tsx
│   ├── programs/
│   │   ├── page.tsx
│   │   └── [programId]/page.tsx
│   ├── deposits/page.tsx               global ledger, RLS-scoped
│   ├── calendar/page.tsx               view/date/filters in searchParams
│   ├── tasks/page.tsx
│   │
│   ├── settings/
│   │   ├── layout.tsx                  settings sub-nav
│   │   ├── page.tsx                    → profile
│   │   ├── profile/page.tsx            all roles
│   │   ├── company/page.tsx            admin write, all read
│   │   └── users/page.tsx              admin only
│   │
│   └── audit/page.tsx                  admin only
│
├── not-found.tsx
└── error.tsx
```

Plus per-segment `loading.tsx` and `error.tsx` on every data-backed route — they are
part of the route contract, not optional polish.

## 2. Route groups

**`(auth)`** — no sidebar, no session requirement. Centered card on the canvas
background. Redirects to `/dashboard` if already signed in.

**`(app)`** — the console shell. Its `layout.tsx` is a Server Component that reads the
session and profile once and passes role and identity down. Middleware has already
guaranteed a session exists; this layout fetches the profile.

`/settings/users` and `/audit` additionally check `role === 'admin'` in their layout
and call `notFound()` otherwise. **This is UX, not enforcement** — the data behind them
is protected by RLS regardless. It exists so admins-only pages fail cleanly rather than
rendering an empty table.

## 3. The `(app)` shell

```
┌──────────────────────────────────────────────────────────────────┐
│ ┌────────┐ ┌───────────────────────────────────────────────────┐ │
│ │        │ │ TOPBAR                                            │ │
│ │  SIDE  │ │  breadcrumb · ⌘K search · Dubai clock · avatar     │ │
│ │  NAV   │ ├───────────────────────────────────────────────────┤ │
│ │        │ │                                                   │ │
│ │ 224px  │ │  PAGE                                             │ │
│ │        │ │  max-width 1600, gutter 32                        │ │
│ │        │ │                                                   │ │
│ └────────┘ └───────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**Sidebar** — 224px, `--surface-panel`, hairline right border. Grouped:

| Group      | Items                                        | Visible to |
| ---------- | -------------------------------------------- | ---------- |
| —          | Dashboard                                    | all        |
| Pipeline   | Leads · Clients · Students                   | all        |
| People     | Sales Team · Mentors                         | all        |
| Operations | Programs · Deposits · Calendar · Tasks       | all        |
| Admin      | Users · Audit Log                            | admin only |
| —          | Settings                                     | all        |

Active item: accent left rule (2px) + raised surface + primary foreground. Not a filled
pill. Collapses to a 56px icon rail below 1280px; becomes a drawer below 1024px.

**Topbar** — 56px. Breadcrumb left; command palette (⌘K) center-right; a live
`Asia/Dubai` clock in monospace; avatar menu right. The clock is the company's shared
reference point and reinforces the timezone-aware identity.

**Command palette** — jump to a module, or search clients by name / `CL-000184` /
email. Results are RLS-scoped: a salesperson searching another owner's client gets
nothing, with no hint that anything was hidden.

## 4. Screen structure

### `/dashboard`

```
┌─────────────────────────────────────────────────────────────────┐
│  KPI RAIL — 6 compact cells, monospace values, hairline dividers │
├──────────────────────────────────────┬──────────────────────────┤
│                                      │  TODAY                   │
│         MARKET GLOBE                 │  next events, monospace  │
│         hero, ~62% width             │  times, client links     │
│         min-height 520               ├──────────────────────────┤
│                                      │  NEEDS ATTENTION         │
│  city list rail below/beside —       │  overdue, unassigned,    │
│  the keyboard + fallback path        │  stalled                 │
├──────────────────────────────────────┴──────────────────────────┤
│  RECENT ACTIVITY — condensed, secondary                          │
└─────────────────────────────────────────────────────────────────┘
```

Asymmetric ~62/38. Three tiers: globe (hero), KPI + today + attention (primary),
activity (secondary). Scoping per role is in [PERMISSIONS.md §10](PERMISSIONS.md).

**Mobile order:** Today → Needs attention → KPIs → Globe. On a phone, "what's next"
beats a spinning Earth.

### `/leads`, `/clients`, `/students`

One table component, three predicates.

```
┌─────────────────────────────────────────────────────────────────┐
│  H1 + count          [ saved views ]  [ filters ]  [ + New ]    │
├─────────────────────────────────────────────────────────────────┤
│  filter chips — reflected in searchParams, shareable            │
├─────────────────────────────────────────────────────────────────┤
│  CL-000184 │ Rahul S. │ ● Student │ Priya │ Michael │ AED 25,000│
│  ─────────────────────────────────────────────────────────────  │
│  sticky header · dense rows · monospace ref + money · row hover │
├─────────────────────────────────────────────────────────────────┤
│  keyset pagination                                              │
└─────────────────────────────────────────────────────────────────┘
```

Default sort is **urgency**, not alphabetical: oldest untouched lead first on `/leads`,
`last_activity_at desc` on `/clients`.

Below 1024px rows become prioritized cards — never a horizontally scrolling 12-column
table.

### `/clients/[clientRef]`

The `layout.tsx` holds a **persistent header** across all six tabs:

```
┌─────────────────────────────────────────────────────────────────┐
│  Rahul Sharma            CL-000184 ⧉        ● Student           │
│  Sales: Priya  ·  Mentor: Michael  ·  Created 12 Mar 2026       │
│  [ Log deposit ] [ Schedule ] [ Add task ]           [ ⋯ ]      │
├─────────────────────────────────────────────────────────────────┤
│  Overview │ Sales │ Student │ Deposits │ Schedule │ Activity    │
└─────────────────────────────────────────────────────────────────┘
```

`CL-000184` is monospace, copyable, and present on every tab. The ownership line never
disappears — it is the answer to "whose client is this?" at all times.

| Tab | Content |
| --- | ------- |
| **Overview** | Identity, contact, status, full ownership chain, program, derived deposit total, next event |
| **Sales** | Source, qualification notes, `client_status_history` timeline, sales activity, conversion record |
| **Student** | Enrollment, program, cohort, mentor, progress, session history. Present but inactive pre-conversion — the path stays visible |
| **Deposits** | Derived total above an immutable transaction list. `AED` monospace |
| **Schedule** | Past and upcoming `calendar_events` where `client_id` matches |
| **Activity** | `audit_log` for this client — actor, action, before/after, timestamp |

Sales users land on Sales, mentors on Student, admins on Overview — but every tab is
reachable by all of them. One page, not role-forked views.

**`clientRef` in the URL** — chosen for operator usability; the enumeration tradeoff is
accepted and documented in [SECURITY.md §8](SECURITY.md). A ref the user cannot access
resolves to `not-found` with **no name in the body, `<title>`, or metadata**.

### `/calendar`

```
┌─────────────────────────────────────────────────────────────────┐
│  ‹ Aug 2026 ›   [Month|Week|Day|Agenda]        GST (Asia/Dubai) │
├─────────────────────────────────────────────────────────────────┤
│  All · Sales · Mentors · Company · My schedule · My clients      │
├─────────────────────────────────────────────────────────────────┤
│  time grid — fully restyled FullCalendar                        │
└─────────────────────────────────────────────────────────────────┘
```

View, date, and filters live in `searchParams` — shareable, back-button safe. Display
timezone is always labelled. Full model in [CALENDAR.md](CALENDAR.md).

### `/deposits`

Global ledger, RLS-scoped: admins see everything, sales and mentors see only their
clients' entries. Period total above; date range, method, and owner filters. Every row
links to its client.

### `/sales-team`, `/mentors`

Directory for non-admins: name, role, and scheduling availability. The per-person
client book and performance figures on `[userId]` are **admin-only**.

### `/settings/users` and `/audit`

Admin-only. Users: create, role-change, deactivate — with a **mandatory reassignment
prompt** when deactivating someone who still owns active clients. Audit: filterable by
entity, actor, action, and date, showing before/after diffs. Read-only for everyone.

## 5. Navigation and state conventions

| Concern | Convention |
| ------- | ---------- |
| Filters, sort, page, tab | `searchParams` — shareable and back-safe |
| Cursor pagination | `?after=<cursor>` |
| Create / edit forms | Intercepting route modal on desktop; full page on mobile; both work as direct URLs |
| Destructive confirms | Dialog stating exactly what changes |
| Post-mutation | `revalidatePath` on the affected segment |
| Breadcrumb | Module → record, with `CL-000184` as the record label |

## 6. Loading, empty, and error

Every data-backed route ships all four. They are route files, not afterthoughts.

- **`loading.tsx`** — skeletons matching the real layout's shape and density. Never a
  centered full-page spinner. No layout shift when data arrives.
- **Empty** — names the filter that produced it and offers to clear it. A first-run
  empty state instead offers the action that fills it.
- **`error.tsx`** — per segment, with retry. States what failed. Never a stack trace,
  never data from a record the user cannot see.
- **`not-found.tsx`** — identical for "does not exist" and "no access".

## 7. Responsive

| Width | Sidebar | Dashboard | Tables | Calendar |
| ----- | ------- | --------- | ------ | -------- |
| ≥1440 | 224px full | globe hero, 62/38 | full columns | week |
| 1024–1439 | 56px icon rail | globe reduced, rail below | fewer columns | week, reduced density |
| 768–1023 | drawer | stacked, globe below fold | priority cards | day |
| <768 | drawer | Today → Attention → KPI → Globe | cards | **agenda** |

Agenda is the mobile calendar default and the accessible path — a complete equivalent,
not a degraded fallback.

## 8. Rendering strategy

| Route | Strategy | Why |
| ----- | -------- | --- |
| `(auth)/*` | Static | No user data |
| `/dashboard` | Dynamic, Suspense per region | Live, user-scoped; shell and KPIs paint before the globe chunk loads |
| List routes | Dynamic | RLS-scoped, filter-dependent |
| `/clients/[clientRef]/*` | Dynamic | Scoped |
| `/calendar` | Dynamic | Scoped, range-dependent |
| `/programs` | Dynamic, short revalidate | Reference data, but small |
| `/settings/*`, `/audit` | Dynamic | Scoped |

**No client-scoped route is ever statically cached or served from a shared/CDN cache.**
That would be a cross-user leak, not a performance optimization. See
[PERFORMANCE.md](PERFORMANCE.md).

The globe is `dynamic(..., { ssr: false })` inside a Suspense boundary, so the entire
3D chunk is out of the dashboard's initial payload and the KPI rail is interactive
before Three.js has downloaded.

---

## Open decisions

1. **`/leads` vs `/clients` overlap** — Leads is `/clients` with a status filter.
   Keeping both is a deliberate concession to how sales staff think about their day,
   at the cost of two routes over one table. If it causes confusion in use, `/leads`
   becomes a saved view on `/clients`.
2. **`/students` similarly** may collapse into a saved view.
3. **Client tab deep-linking** is specified as sub-routes (`/clients/CL-000184/sales`)
   rather than `?tab=sales`, so each tab is independently loadable and cacheable. This
   costs six route files per client; the alternative is one file with a search param.
   Sub-routes are chosen for streaming granularity.
