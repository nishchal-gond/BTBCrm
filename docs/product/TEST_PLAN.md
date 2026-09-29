# Test Plan

What must be proven before any part of this product is called complete.

Permission semantics come from [PERMISSIONS.md](PERMISSIONS.md); policies from
[AUTHORIZATION.md](AUTHORIZATION.md).

---

## 1. Principle

Code compiling is not evidence it works. Types passing is not evidence the query
returns the right rows. A rendered UI is not evidence the permission holds.

**Run it. Try to break it. Report what actually happened, including what was skipped.**

## 2. Test levels

| Level | Tool | Proves |
| ----- | ---- | ------ |
| **L1 — Database** | SQL / `pgTAP` against a seeded database | Policies do what they claim, independent of any application code |
| **L2 — API** | Supabase JS with each user's session, **React bypassed** | RLS holds against a hostile client — *the test that matters* |
| **L3 — UI** | Playwright as each user | The product behaves correctly for real people |
| **L4 — Unit** | Vitest | Timezone logic, session state, aggregation, formatting, recurrence |

**A permission that passes only at L3 is not implemented.** L3 proves the UI hides a
button. L2 proves the database refuses the data. Only L2 is a security test.

## 3. Seeded users

| User | Role | Purpose |
| ---- | ---- | ------- |
| `admin@test` | `admin` | Full-access baseline |
| `sales_a@test` | `sales` | Owns `CL-000001` (lead) and `CL-000002` (converted) |
| `sales_b@test` | `sales` | **Must not see** either |
| `mentor_a@test` | `mentor` | Assigned to `CL-000002` |
| `mentor_b@test` | `mentor` | **Must not see** `CL-000002` |

`sales_b` and `mentor_b` exist for exactly one reason: to fail loudly when RLS
regresses.

Seeded via a `service_role` script (the one sanctioned use), deterministic, reset
between suite runs.

## 4. Permission matrix — the priority suite

Every case runs at **L1, L2, and L3**. This suite gates every release.

### 4.1 Client visibility

| # | Actor | Action | Expected |
| - | ----- | ------ | -------- |
| P1 | `sales_a` | read `CL-000001` | ✅ 1 row |
| P2 | `sales_b` | read `CL-000001` by id | **0 rows** |
| P3 | `sales_b` | list clients | `CL-000001`/`CL-000002` **absent** |
| P4 | `sales_b` | search `"CL-000001"` | **0 results, no "hidden" hint** |
| P5 | `sales_b` | GET `/clients/CL-000001` | not-found; **no name in body, `<title>`, or OG metadata** |
| P6 | `mentor_a` | read `CL-000002` | ✅ 1 row |
| P7 | `mentor_b` | read `CL-000002` | **0 rows** |
| P8 | `mentor_a` | read `CL-000001` (not assigned) | **0 rows** |
| P9 | `admin` | read both | ✅ |

### 4.2 Indirect access — the paths people forget

| # | Actor | Action | Expected |
| - | ----- | ------ | -------- |
| P10 | `sales_b` | read `deposits` where `client_id = CL-000002` | **0 rows** |
| P11 | `sales_b` | read `calendar_events` where `client_id = CL-000002` | **0 rows** |
| P12 | `sales_b` | read `tasks` where `client_id = CL-000002` | **0 rows** |
| P13 | `sales_b` | read `enrollments` for `CL-000002` | **0 rows** |
| P14 | `sales_b` | read `client_status_history` for `CL-000002` | **0 rows** |
| P15 | `sales_b` | read `audit_log` where `entity_id = CL-000002` | **0 rows** |
| P16 | `sales_b` | read `client_deposit_totals` view | **0 rows** for others' clients |

> P10–P16 are where RLS most often leaks. The `clients` policy is written carefully;
> dependent tables get less attention and a view can silently bypass its base table's
> policy if `security_invoker` is not set.

### 4.3 Escalation and ownership

| # | Actor | Action | Expected |
| - | ----- | ------ | -------- |
| P17 | `sales_a` | `update profiles set role='admin' where id=self` | **rejected** |
| P18 | `sales_a` | `update profiles set is_active=...` on self | **rejected** |
| P19 | `sales_a` | change another user's role | **rejected** |
| P20 | `sales_b` | `update clients set sales_owner_id=self` | **rejected** |
| P21 | `sales_a` | reassign own client to `sales_b` | **rejected** |
| P22 | `mentor_a` | change `mentor_owner_id` | **rejected** |
| P23 | `admin` | reassign ownership | ✅ + audit row |

### 4.4 Immutability

| # | Actor | Action | Expected |
| - | ----- | ------ | -------- |
| P24 | any | update `clients.client_ref` | **rejected by trigger** |
| P25 | any | update `clients.created_by` | **rejected** |
| P26 | `sales_a` | update a `deposits` row | **rejected — no policy** |
| P27 | `sales_a` | delete a `deposits` row | **rejected** |
| P28 | **`admin`** | update a `deposits` row | **rejected** |
| P29 | **`admin`** | update an `audit_log` row | **rejected** |
| P30 | **`admin`** | delete an `audit_log` row | **rejected** |
| P31 | any | insert into `audit_log` directly | **rejected** |
| P32 | any | delete a client | **rejected — no policy** |

> P28–P30 assert that **admins are not exempt**. An audit trail an admin can rewrite
> proves nothing.

### 4.5 Calendar and availability

| # | Actor | Action | Expected |
| - | ----- | ------ | -------- |
| P33 | `sales_a` | create `company_meeting` | **rejected** |
| P34 | `sales_b` | read `sales_a`'s client appointment | **0 rows** |
| P35 | `sales_b` | call `busy_ranges(mentor_a, …)` | ✅ — **exactly 2 columns** |
| P36 | `sales_b` | assert `busy_ranges` result has no `title`/`client_id` | **column count = 2** |
| P37 | `sales_a` | link event to `CL-000003` (not owned) | **rejected** |
| P38 | any | read company meeting | ✅ |

### 4.6 Schema-level gates

| # | Check | Expected |
| - | ----- | -------- |
| P39 | Every `public` table has `rowsecurity = true` | **11/11** |
| P40 | Every `insert`/`update` policy has a `with check` | **all** |
| P41 | Every RLS predicate column has an index | **9/9** |
| P42 | Built client bundle contains no service-role key | **no match** |
| P43 | No `for all` policies exist | **none** |
| P44 | Every `security definer` function sets `search_path = ''` | **all** |

P39–P44 run in CI on every commit. They are cheap and catch the most dangerous class of
mistake.

## 5. Functional tests

### 5.1 Conversion — the core invariant

```
Given  CL-000184, status mentor_assigned,
       created_by=Priya, sales_owner_id=Priya, mentor_owner_id=Michael
When   Michael converts
Then   count(clients) is UNCHANGED          ← no duplicate person
  and  client_ref            = 'CL-000184'  ← unchanged
  and  created_by            = Priya        ← unchanged
  and  sales_owner_id        = Priya        ← unchanged
  and  mentor_owner_id       = Michael
  and  converted_by          = Michael
  and  converted_at          is set
  and  status                = 'converted'
  and  client_status_history has a new row
  and  audit_log             has a 'convert' row
```

Additional: conversion dialog states the ID is retained; reversal is admin-only with a
reason and writes audit; forward-only transitions enforced by constraint.

### 5.2 Deposits

- Derived total equals `sum(amount)` after each insert.
- No `total_deposits` column is written anywhere — grep asserts it does not exist.
- A refund is a negative `refund` entry; the total decreases; the original row is
  **unchanged**.
- `payment` with negative amount → rejected by `check`.
- Currency code renders (`AED 25,000`), monospace, right-aligned, tabular.

### 5.3 Duplicate prevention

- Create with an existing normalized email → blocked at **UI** and by **unique index**.
- Same for phone.
- UI surfaces the existing `CL-000184` and offers to open it.
- Merge keeps the **older** ref, repoints all children, marks the loser `dormant`
  (never deletes), writes audit on both.

### 5.4 Timezones — DST is the test

| # | Scenario | Expected |
| - | -------- | -------- |
| T1 | Weekly 09:00 `Asia/Dubai` across a DST boundary elsewhere | stays 09:00 GST |
| T2 | Weekly 09:00 `Europe/London` across the UK clock change | **stays 09:00 local**; the UTC instant shifts |
| T3 | "This and following" edit on a DST-crossing series | earlier occurrences unshifted |
| T4 | All-day event viewed from another timezone | **does not shift** |
| T5 | Event zone ≠ display zone | both shown: `17:00 GST (13:00 GMT)` |
| T6 | `grep -rE '\+0?4:00|\* *4 * 3600'` over `src/` | **no matches** |

T2 is the test that catches offset-based date math. If it passes, the timezone model is
probably right; if it is missing, assume it is wrong.

### 5.5 Globe

| # | Check | Expected |
| - | ----- | -------- |
| G1 | Seven cities render with correct local times | matches `Intl` reference |
| G2 | Session states on a weekday | correct per §3 hours |
| G3 | Session states on a **weekend** | all `CLOSED` |
| G4 | Session states on a **DST-shifted date** | correct |
| G5 | Dubai marked `LOCAL HQ` and visually primary | ✅ |
| G6 | Frame rate, mid-range hardware | ≥ 50fps desktop |
| G7 | WebGL disabled | `<CityList>` fallback, **functional** |
| G8 | Context loss (`WEBGL_lose_context`) | recovers or degrades cleanly |
| G9 | Mount → unmount → remount ×5 | `renderer.info` geometry/texture back to baseline |
| G10 | `prefers-reduced-motion` | no idle rotation, no pulses, no orbitals |
| G11 | Keyboard city selection | works; announced via live region |
| G12 | Far-side markers | occluded, not drawn through the Earth |

## 6. UI states

Every data surface, with each state **deliberately forced**:

| State | How to force | Assert |
| ----- | ------------ | ------ |
| Loading | throttle to Slow 3G | skeleton matches layout; **CLS < 0.1**; no page spinner |
| Empty (first run) | seed zero rows | explains what belongs here; offers the action |
| Empty (filtered) | apply an excluding filter | **names the filter**; offers to clear |
| Error | kill the connection mid-request | states what failed; offers retry; **no leak** |
| Stale | delay a refresh | last-updated shown |
| No permission | sign in as `sales_b` | reveals nothing |

## 7. Visual and accessibility

- Contrast **measured** with a tool: text ≥ 4.5:1, UI boundaries ≥ 3:1.
- Focus ring visible on every interactive element; `outline-none` without replacement
  is a failure.
- Full keyboard walkthrough: tables, dialogs, calendar, globe city list.
- Colour never alone — every semantic colour paired with a word or icon.
- Monospace + tabular on every ID, time, and currency; columns align.
- `AED` present on every currency figure.
- Tokens only — grep for stock Tailwind palette classes and arbitrary values
  (`bg-gray-`, `text-blue-`, `p-[`), expect **no matches**.
- Rendered at **1440 / 1024 / 390**; mobile ordering correct; console clean.

## 8. Automated suites

### Playwright (L2 + L3)

Built. `apps/app/e2e`, run with `bun run --filter=app e2e`. Specs are named
`*.e2e.ts`, not `*.spec.ts`, so `bun test` and Playwright never claim each other's
files.

```
apps/app/e2e/
├── people.ts                       sessions, the API caller, shared locators
├── permissions/
│   ├── client-visibility.e2e.ts    a client is visible to three people
│   ├── money.e2e.ts                a mentor never sees money
│   ├── immutability.e2e.ts         what nobody may do, admin included
│   ├── calendar-privacy.e2e.ts     busy ranges carry times and nothing else
│   └── business-lines.e2e.ts       a line is a wall, not a label
├── client-journey.e2e.ts           list, search, filter, record, conversion
├── money-and-schedule.e2e.ts       the ledger, the schedule, the overview
├── keyboard.e2e.ts                 focus rings, focus trapping, Escape, arrows
├── responsive.e2e.ts               ten widths, overflow, touch targets
└── console.e2e.ts                  every route, four widths, a silent console
```

`people.ts` mints a real session per seeded role by shelling out to
`bun run --filter=api dev:session`, so every spec runs as a real signed-in person
rather than a mocked one. `callApi` hits the tRPC endpoint directly with that
cookie, which is how the permission specs prove a refusal survives the UI being
bypassed. `mentorAssignedClient` builds its own client, qualifies it and gives
it a mentor, so the conversion spec never depends on a row an earlier run has
already converted.

`signIn` also injects one rule hiding the React Query devtools. They mount only
under `next dev`, they are absent from every build the product ships, and at
375px their floating button sits on top of the pagination control. Nothing else
about the page is altered.

Two projects, `desktop` at 1440 and `mobile` at 375 with touch emulation.
`responsive.e2e.ts` and `console.e2e.ts` drive their own viewports and run in
`desktop` only.

`console.e2e.ts` walks eighteen routes and the six client-record tabs at 375,
768, 1024 and 1440 as an administrator. It fails on any console error, any
uncaught page error, and any response of 400 or worse. It is how a hydration
mismatch or a broken route is caught rather than being noticed by a person.

The `permissions/` directory is the non-negotiable core — it may never be skipped,
quarantined, or marked flaky-tolerant.

Not built: `duplicates`, `calendar-recurrence` and `globe`, because recurrence and
the globe are not built either.

### Vitest (L4)

Timezone and session-state computation · deposit aggregation · `client_ref` formatting
and validation · RRULE expansion including DST · Zod schemas (accept valid, **reject
malformed and reject extra fields**) · currency and time formatters.

### CI gates

```
1. typecheck + lint
2. vitest
3. schema gates P39–P44          ← fail fast, cheapest, most dangerous class
4. build + bundle budget check
5. migrate + seed
6. playwright permissions/       ← before anything else e2e
7. playwright remaining
8. lighthouse (deployed preview)
```

## 9. Test quality rules

- **Assert the requirement, not the implementation.** Re-read the spec before writing
  the assertion.
- **Every test must be observed to fail first.** A test never seen red proves nothing.
- **No snapshot tests of whole pages.** They pass through real regressions and fail on
  whitespace.
- **Deterministic**: fixed clock for time-dependent tests, seeded data, no sleeps, no
  reliance on ordering.
- **Every fixed bug gets a regression test** reproducing the original failure.
- Permission tests may **never** be skipped to unblock a release.

## 10. Reporting

State what was verified, how, and what was not:

> Converted `CL-000184` as `mentor_a`. Client count 247 → 247. `client_ref` unchanged.
> `created_by` still `sales_a`. `converted_by` = `mentor_a`, `converted_at` set.
> Verified directly in Postgres.
> As `sales_b`: absent from list, direct URL not-found with no name in body or
> `<title>`, direct Supabase select returned 0 rows.
> `npx playwright test e2e/permissions/` → 34 passed (12.1s) [output pasted]
> **Not tested**: conversion reversal (not implemented). Globe frame rate not measured
> this pass.

Never: "Conversion works as expected."

## 11. Definition of done

A feature is complete only when **all** of these hold:

- [ ] Functional behaviour verified against the written requirement
- [ ] Permission cases pass at **L1, L2, and L3** — L2 mandatory
- [ ] Denial reveals nothing in body, `<title>`, or metadata
- [ ] Loading, empty, filtered-empty, error, stale, and no-permission states forced and reviewed
- [ ] Real browser at 1440 / 1024 / 390; console clean
- [ ] Contrast and focus verified with tools
- [ ] Vitest and Playwright suites passing, **output pasted**
- [ ] Regression test added for any bug fixed
- [ ] Report states what was **not** tested

If any box is unchecked, the feature is **not done**, and it is not reported as done.

---

## Open questions

1. **`pgTAP` vs plain SQL assertions** for L1 — `pgTAP` gives better output but is
   another dependency in the migration pipeline. L2 covers the same ground from the
   client side; L1 may be trimmed to the schema gates (P39–P44) only.
2. **Seed data volume** — the permission suite needs 5 users and ~10 clients. Performance
   testing needs realistic volume (~10k clients). These are probably two different seed
   scripts.
3. **Visual regression testing** is not specified. Playwright screenshot comparison is
   cheap to add but noisy on a dense dark UI; deferred pending a stable design.
