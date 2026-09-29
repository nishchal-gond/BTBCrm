# Stack mapping — the product specification on this codebase

The documents in this folder were written for a Next.js + Supabase build. This
repository is a different base: a Turborepo monorepo with a NestJS + tRPC API,
Prisma on PostgreSQL, Better Auth, and an eve research agent. The specification
stands. This document says how each part of it lands on this stack, what is
already here, what is not, and in what order the rest is built.

When this document and another `docs/product/*.md` disagree on **mechanism**,
this document wins. When they disagree on **product behaviour**, the other
document wins and this one is wrong.

---

## 1. Layer mapping

| Specification says | On this codebase |
| --- | --- |
| Supabase Auth, `auth.users` | Better Auth (`packages/auth`). Google, Microsoft, or SSO. `ALLOWED_SIGN_IN` is the front door. |
| `profiles` (role, name, timezone) | A new `StaffProfile` model, one per `User`: `role`, `timezone`, `teamId`, `isActive`. Product roles do not live on Better Auth's `Member.role`. |
| Row Level Security as the authorization boundary | **Not available through Prisma.** Authorization lives in one server module, `packages/db/src/access/`, that every tRPC procedure calls. See §2. |
| Server Components read, Server Actions write | The Next.js app reads and writes through tRPC procedures in `apps/api`. Pages are still server components; they call the API, not the database. |
| PostgREST with the user JWT | tRPC context carries the session user. Every procedure derives identity from the session, never from the input. |
| Supabase Storage with bucket RLS | Vercel Blob (`BLOB_READ_WRITE_TOKEN`). Uploads go through an API procedure that checks access first. |
| Triggers write `audit_log` | Kept. Prisma migrations are plain SQL, so the triggers, sequences, check constraints and immutability guards in `DATABASE.md` are written into the migration files unchanged. |
| FullCalendar | Not used. The CRM-New build already replaced it with `rrule` + `luxon` occurrence expansion. That code is portable. See §5. |
| Vitest + Playwright | `bun test` for unit and integration, Playwright for browser. The permission suite in `TEST_PLAN.md` becomes tRPC integration tests that call procedures as different users. |
| Vercel | Same. |

## 2. Authorization without RLS

The specification's strongest rule is that the database, not the application,
decides what a user sees. Prisma connects as one database role and does not set
a per-request Postgres role, so RLS policies keyed on `auth.uid()` do nothing
here.

The replacement is one module with one job:

```
packages/db/src/access/
  client-scope.ts     clientWhere(actor): Prisma.ClientWhereInput
  can.ts              can(actor, action, resource): boolean, from PERMISSIONS.md
  actor.ts            Actor = { userId, role, teamId } parsed from the session
```

Rules:

- **Every read of `Client`, `Deposit`, `Enrollment`, `Task` and `CompanyEvent`
  spreads `clientWhere(actor)` into its `where`.** A query that touches these
  tables without it is a security bug. A test greps for it.
- **Every write checks `can()` first**, then loads the target through
  `clientWhere(actor)` so a user cannot write to a row they cannot read.
- **Ownership changes are three procedures** — `assignSalesOwner`,
  `assignMentor`, `convertClient` — each in a transaction that validates the
  caller, validates the target, updates the one row, and writes the status
  history. Nothing else updates the ownership columns.
- **Deposits have no update and no delete procedure.** The migration also adds a
  trigger that raises on `UPDATE` or `DELETE` of `deposit`, so a future bug
  cannot edit history either.
- **The permission suite runs as real users.** For each role × resource ×
  action in `PERMISSIONS.md`, a test signs in as that role and calls the
  procedure. Denied means a `FORBIDDEN` tRPC error, not an empty result.

Hardening later, as an ADR: Postgres RLS is still reachable from Prisma by
running each request inside a transaction that sets `request.jwt.claims`, the
way PostgREST does. That is a second lock on the same door. It is not the first
lock, because the pooled connection model makes it easy to get wrong.

## 3. Entity mapping

| Specification table | Prisma model | Notes |
| --- | --- | --- |
| `profiles` | `StaffProfile` (new) | `userId` unique → `User`. `role` enum `admin`, `sales_manager`, `sales`, `mentor_manager`, `mentor`, `finance`. `timezone` IANA text. `teamId`. |
| `teams` | `Team` (new) | From the CRM-New build's manager deviation. A manager is scoped to their team. |
| `clients` | `Client` (new) | The central table. `clientRef` from a Postgres sequence with default `'CL-' \|\| lpad(...)`, immutable by trigger. All five provenance columns. All check constraints from `DATABASE.md` §5.2. Partial unique indexes on normalised email and phone. |
| `programs` | `Program` (new) | Reference data. Admin writes. |
| `enrollments` | `Enrollment` (new) | One active per client, by partial unique index. No personal data. |
| `deposits` | `Deposit` (new) | Append-only ledger. `amount` `Decimal(14,2)`, `currency` default `AED`, `entryType` enum. Totals from a SQL view `client_deposit_totals`, read through `$queryRaw` and parsed with Zod. |
| `calendar_events`, `event_attendees` | `CompanyEvent`, `CompanyEventAttendee` (new) | The base's `CalendarEvent` is a Google or Outlook sync mirror keyed on `iCalUid`. It stays as an import source. Company events are a separate model with `type`, `timezone`, `rrule`, `clientId`, `ownerId`, `visibility`. |
| `tasks` | `Task` (new) | Status and priority enums, `clientId` optional, `assigneeId`, `dueAt`. |
| `client_status_history` | `ClientStatusHistory` (new) | Written by trigger on `client.status` change. |
| `audit_log` | `AuditLog` (new) | Written by triggers on every table above. Read-only from the API. |
| `app_settings` | `AppSetting` (exists) | Reused. |

**Not mapped, and deliberately.** The base's `Company`, `Deal`, `DealContact`,
`Contact`, `ContactFact`, `ContactBrief` and `CompanyEnrichment` are a B2B sales
model. The Trading Academy sells to people, not accounts. They are not the
client record and must not become it. The `Client` model is new and standalone.

## 4. What the base already gives us

| Spec module | Status on this codebase |
| --- | --- |
| Auth shell, sign-in, allow-list, session | **Built.** `apps/app/app/(landing)/sign-in`, `packages/auth`. |
| App layout, sidebar, command palette, record sheets, tables with URL state | **Built** for companies, contacts and deals. The shell and table machinery are reusable. The entities are not. |
| Design tokens | **Not the product's.** `packages/ui` still carries the base's flat white and green palette. `DESIGN_SYSTEM.md` defines the dark Dubai Financial Command Center tokens that replace it. |
| Users and roles | **Phase 1 built.** `StaffProfile`, `Team`, the access module in `@crm/db/access`, `ActorMiddleware` and the `staff.*` procedures. See `docs/api.md`, *Staff roles and the actor*. No admin screen yet. |
| Settings | **Built** for the base's concerns (connections, SSO, general). Product settings are not. |
| Company calendar | **Not built.** Google and Outlook calendar sync exists as data; there is no calendar UI and no company events. |
| Clients, leads, students, programs, deposits, tasks, audit log, dashboard, globe | **Not built.** |
| Research agent, agent builder, Slack, website tracking, form intake | **Built, and outside v1 scope.** They run only when their keys are set. Do not extend them in v1. Decide in an ADR whether the agent builder and tracking modules are removed or kept dormant. |

## 5. Portable code from the CRM-New build

`C:\Users\USER\Pictures\CRM-New` holds a partial Supabase build of this product.
Its React and Supabase glue does not port. These files do, with import paths
changed:

| File | Goes to | What it is |
| --- | --- | --- |
| `src/lib/market-cities.ts` | `packages/validation/src/market-cities.ts` | The globe's city and exchange session table. Static config, no network. |
| `src/lib/market-session.ts` | same package | Open, closed and pre-market state from an IANA timezone and a clock. |
| `src/lib/calendar/occurrences.ts` | `packages/validation/src/calendar-occurrences.ts` | `rrule` + `luxon` recurrence expansion, DST-correct, under test. |
| `src/lib/permissions.ts` | `packages/db/src/access/can.ts` | The role × resource × action matrix as code. |
| `src/lib/format.ts` | `packages/ui/src/lib/format.ts` | `AED 25,000`, `CL-000184`, timezone-aware date display. |
| `src/components/globe/*` | `apps/app/components/globe/` | The React Three Fiber globe: shader Earth, terminator, atmosphere, city markers. Needs `three`, `@react-three/fiber`, `@react-three/drei` added to `apps/app`. |
| `tests/unit/*` | beside the ported modules | Vitest specs for timezone, sessions and recurrence. Convert to `bun:test`. |
| `supabase/migrations/0003_clients.sql`, `0005_deposits.sql` | Prisma migration SQL | The check constraints, sequences, immutability and append-only triggers, and the totals view. The RLS policies in those files are dropped. |
| `scripts/invariants.ts`, `scripts/rls-verify.ts` | `apps/api/test/permissions/` | The assertions become tRPC integration tests. The 15 business invariants port as written. |

## 6. Build order

The order in `PRODUCT_ARCHITECTURE.md` §12, with the base taken into account.

1. **Roles and access.** `StaffProfile`, `Team`, `packages/db/src/access.ts`,
   `ActorMiddleware`, `requireCapability`, and the permission suite skeleton.
   Nothing renders yet. This comes first because every later procedure depends
   on it. **Built.** Six roles, as the CRM-New build decided.
2. **Design tokens.** Replace the base palette in `packages/ui` with
   `DESIGN_SYSTEM.md`. Dark by default. This is one file and it changes every
   screen, so it happens before screens are built.
3. **Clients, leads, students.** The `Client` model and migration with all
   constraints and triggers. tRPC: list with scope, get, create, update, the
   three ownership procedures, status transitions. UI: Leads, Clients and
   Students as three views of one table, the client detail sheet with tabs.
   **Schema built.** `Client`, `ClientStatusHistory`, `staffProfile.verticals`,
   seven check constraints and five triggers. The procedures and the screens
   are not built. The business line lives on `client.vertical` from the first
   migration — see [VERTICALS.md](VERTICALS.md).
4. **Deposits ledger.** Model, view, record and adjustment procedures, per-client
   and global ledger screens. **Built.** `Deposit`, five check constraints and
   three triggers, including one that refuses every update and one that refuses
   every delete. Totals are derived by aggregate, not by the view §5.5 names —
   Prisma maps views read-only behind a preview flag, and an aggregate carries
   the same guarantee with no stored column anywhere.
5. **Programs and enrollments.** **Built.** `Program` and `Enrollment`, one
   *open* enrolment per client by a partial unique index keyed on a
   trigger-maintained `closedAt`, so a paused enrolment still holds the slot.
   `client_student_needs_enrollment` closes the `CONVERTED → STUDENT` gap: a
   client becomes a student by enrolling, never on entry and never by a bare
   status move. `enrollment_needs_converted_client` closes the other side.
   Nothing here is deleted: `enrollment_no_delete`, `program_no_delete` and
   `enrollment_guard_immutable` say so at the database.
6. **Company calendar.** **Partly built.** `CompanyEvent` and
   `CompanyEventAttendee` exist with their constraints and triggers, and the
   `events.*` procedures cover a client's schedule, invitations, cancellation
   and busy ranges. The client record's Schedule tab runs on them. The calendar
   *module* — month, week, day and agenda views, filters, and RRULE occurrence
   expansion — is not built, and the model carries no recurrence columns,
   because a rule nothing expands is scaffolding. Adding them is a migration on
   a small table when the views are built.
7. **Tasks, sales team, mentors.**
8. **Dashboard shell and KPIs.** **Partly built.** `/[slug]` is the academy
   overview: a KPI rail, needs-attention, what is booked next, where everybody
   is, and the latest status moves, all scoped by `clientScope(actor)` as
   `PERMISSIONS.md` §10 describes. The globe and the charts are not built. See
   [adrs/overview-screen.md](../../adrs/overview-screen.md).
9. **Globe.**
10. **Users and roles admin, settings, audit log.** `staff.setVerticals` exists
    so an administrator can move somebody between business lines; the admin
    screen does not.
11. **Hardening.** **Partly built.** The permission suite is
    `apps/app/e2e/permissions/`, five specs run against real sessions for each
    seeded role, plus `apps/api/test/*.integration.spec.ts` at the service
    level. Responsive and keyboard suites are `apps/app/e2e/responsive.e2e.ts`
    and `keyboard.e2e.ts`. The performance pass is not done.
12. **Retire the B2B modules.** Companies, deals, contacts and the agent
    surfaces that depend on them, by ADR. The deals *dashboard* is already
    retired — see [adrs/overview-screen.md](../../adrs/overview-screen.md).

## 7. Open decisions

Raise these. Do not pick silently.

1. **Agent app in v1.** The specification excludes AI features. The base ships a
   research agent that is off without keys. Keep it dormant, or remove
   `apps/agent` and every surface that depends on it before the domain build?
   The research **key** is settled: it is optional, and the onboarding step can
   be deferred — see `docs/environment.md`.
2. **Retirement timing for companies, contacts and deals.** Remove before
   building `Client`, so the domain is clean, or after, so the shell keeps a
   working reference during the build?
5. **RLS as a second lock.** Whether to add per-request Postgres claims later.

### Settled

3. ~~**Client URL identifier.**~~ `clientRef`. `/clients/CL-000184` is the
   route, the reference is copyable on every screen, and a non-owner opening it
   gets a not-found page with the name nowhere in the body, the title or the
   metadata — there is a test for exactly that.
4. ~~**Six roles or three.**~~ Six. `PERMISSIONS.md` is rewritten against
   `packages/db/src/access.ts`, and `USER_ROLES.md` carries the banner saying
   the same. The sharpest consequence is that a mentor never sees money.
