---
name: database-architecture
description: PostgreSQL and Supabase schema design for the Trading Academy CRM — the single permanent client record, ownership foreign keys, transaction-based deposits, constraints, indexes, migrations, and audit logging. Use when designing or changing tables, columns, relationships, constraints, indexes, migrations, views, functions, or triggers.
---

# Database Architecture — PostgreSQL / Supabase

## When to use

Any schema work: new tables, columns, relationships, constraints, indexes, migrations,
views, functions, triggers, or query shape decisions. Load `security` alongside this
whenever RLS is involved — which is on every table holding client data.

## Principle: the client record is central and singular

One person = one row = one permanent `client_id`, for the whole lifecycle. Lead status
and student status are **attributes of that row**, not separate entities with copied
personal data.

```
Client (the person — permanent ID)
├── Sales Owner        → users
├── Mentor Owner       → users
├── Student enrollment → programs
├── Deposits           → transactions (many)
├── Calendar Events    → many, optional client reference
├── Tasks              → many
└── Audit History      → many
```

## Responsibilities

1. Model the domain so duplicate people are structurally impossible.
2. Express every business rule the database can express as a constraint.
3. Keep money as an auditable transaction ledger.
4. Index for the queries the product actually runs.
5. Write forward-only, reviewable, reversible-by-design migrations.
6. Make every meaningful change auditable.

## Rules

### The client table

- One table for people. Personal data (name, email, phone, country) lives here and
  **only** here.
- `id uuid primary key default gen_random_uuid()` for referential integrity.
- A separate human-facing `client_ref` (`CL-000184`) — generated from a sequence,
  `not null unique`, **immutable** (enforce with a trigger that rejects updates).
- `status` as a constrained enum or a `check`-guarded text column covering the
  lifecycle: `lead`, `qualified`, `mentor_assigned`, `converted`, `student`, plus any
  terminal states (`lost`, `dormant`).
- Ownership and provenance columns, all `references users(id)`:
  `created_by` (not null), `sales_owner_id`, `mentor_owner_id`, `converted_by`.
- `converted_at timestamptz`.
- `created_at timestamptz not null default now()`, `updated_at timestamptz` maintained
  by trigger.
- Consistency constraints, e.g.: `converted_at` and `converted_by` are both null or
  both set; a `converted` or `student` status requires `mentor_owner_id`,
  `converted_by`, and `converted_at` to be present.
- Duplicate prevention: unique indexes on normalized email and normalized phone
  (case-folded, whitespace-stripped), as partial indexes ignoring nulls.
- There is **no** `students` table holding name/email/phone. Student-specific data
  (enrollment, cohort, progress) lives in an `enrollments` table keyed by `client_id`.

### Deposits

- `deposits` is an append-only transaction ledger: `id`, `client_id` (fk, not null),
  `amount numeric(14,2) not null`, `currency text not null default 'AED'`,
  `method`, `reference`, `occurred_at timestamptz not null`,
  `recorded_by references users(id)`, `created_at`.
- **Never** a mutable `total_deposits` column on `clients` as the source of truth.
- Totals come from a view or aggregate query. If read performance ever demands it, use
  a materialized view or a trigger-maintained cache column that is explicitly
  documented as derived and rebuildable — never hand-edited.
- Money is `numeric`, never `float`. Amounts are positive; corrections are separate
  adjusting entries (negative amounts allowed only via an explicit `type` column), so
  the ledger is never rewritten.
- Index `(client_id, occurred_at desc)`.

### Ownership and users

- `users` mirrors `auth.users` via a profile table keyed by the auth user id, holding
  `role` (`admin`, `sales`, `mentor`), name, and status.
- Role is a constrained value, stored server-side, never derived from a JWT claim the
  client can influence.
- Reassignment updates the owner column and writes an audit row — it does not delete
  and recreate the client.

### Calendar events

- `calendar_events`: `starts_at timestamptz not null`, `ends_at timestamptz not null`,
  `timezone text not null` (IANA ID), `event_type` (constrained),
  `organizer_id references users(id)`, `client_id references clients(id)` **nullable**,
  `is_all_day boolean`, recurrence rule column, and a series/parent reference for
  overrides.
- `check (ends_at > starts_at)`.
- Index `(starts_at, ends_at)`, plus `(organizer_id, starts_at)` and
  `(client_id, starts_at)`.
- Do not pre-generate recurring occurrences as rows.

### Tasks

- `tasks`: `assignee_id`, optional `client_id`, `due_at timestamptz`, `status`,
  `priority`, `created_by`. Index `(assignee_id, status, due_at)`.

### Audit log

- `audit_log`: `id`, `actor_id`, `entity_type`, `entity_id`, `action`,
  `changed_fields jsonb` (before/after), `occurred_at timestamptz not null default now()`,
  optional `reason`.
- Written by database triggers on the tables that matter (clients, deposits, ownership
  changes, role changes) so it cannot be bypassed by an application code path.
- Append-only: no update or delete grants for anyone, including admins.
- Index `(entity_type, entity_id, occurred_at desc)` and `(actor_id, occurred_at desc)`.

### Constraints

Push rules into the database wherever it can express them:

- `not null` on everything that is genuinely required.
- Foreign keys on every relationship, with deliberate `on delete` behavior
  (`restrict` for clients referenced by deposits; `set null` for optional links).
- `check` constraints for enums, positive amounts, valid ranges, and cross-column
  consistency.
- `unique` for natural keys and duplicate prevention.
- Do not rely on application code to maintain an invariant the database can hold.

### Indexes

- Index every foreign key used in a filter or join.
- Index the columns RLS policies test (`sales_owner_id`, `mentor_owner_id`) — an RLS
  predicate runs on every row access and an unindexed one is a full scan per query.
- Composite indexes ordered to match real query predicates and sorts.
- Partial indexes for common filtered subsets (e.g. open leads, unassigned clients).
- Verify with `explain (analyze, buffers)` against realistic row counts. Do not add
  indexes speculatively; do not skip them for the hot paths.

### Migrations

- Every schema change is a migration file in version control. No changes made only
  through the Supabase dashboard.
- Forward-only, small, and single-purpose. Name them descriptively.
- Additive first for anything with live data: add nullable column → backfill →
  add constraint → switch reads → drop old. Never a destructive change in one step.
- Include the RLS policy changes for a table **in the same migration** that creates or
  alters it, so a table never exists unprotected.
- Wrap in a transaction where PostgreSQL allows; note explicitly where it cannot
  (e.g. `create index concurrently`).
- Test the migration against a copy of realistic data before it runs anywhere real.
- Consider the rollback path before writing the migration, even if forward-only.

### Types and conventions

- `snake_case` for tables and columns. Plural table names.
- `timestamptz` for every point in time. Never `timestamp` without time zone.
  Never store local wall-clock time in a bare text or timestamp column.
- `numeric` for money. `uuid` for ids. `text` over `varchar(n)` unless a length rule
  is genuinely a business rule.
- `jsonb` only for genuinely unstructured data — never as a way to avoid modeling.

## Anti-patterns

- A `students` table duplicating name, email, or phone from `clients`.
- Creating a new row on conversion.
- A mutable `total_deposits` column treated as truth.
- `float` or `money` for currency amounts.
- `timestamp without time zone`, or storing offsets instead of IANA IDs.
- Missing foreign keys "for flexibility".
- Business rules enforced only in TypeScript.
- Tables created without RLS, "to be added later".
- Unindexed columns referenced by RLS policies.
- Pre-generated recurring calendar rows.
- Mutable or deletable audit rows.
- Schema changes made in the dashboard and never captured as a migration.
- `select *` in application queries against wide tables.
- Soft-delete flags without partial indexes, quietly degrading every query.

## Quality checklist

- [ ] Exactly one table holds personal data; no duplicate person representation.
- [ ] `client_ref` unique, not null, and immutable by trigger.
- [ ] Ownership columns present, foreign-keyed, and preserved through conversion.
- [ ] Cross-column consistency constraints on conversion fields.
- [ ] Duplicate prevention enforced by unique indexes on normalized email/phone.
- [ ] Deposits are an append-only `numeric` ledger; totals derived.
- [ ] Calendar events store `timestamptz` plus IANA timezone ID; recurrence as a rule.
- [ ] Audit log written by triggers, append-only, no update/delete grants.
- [ ] Every foreign key indexed; RLS predicate columns indexed.
- [ ] Query plans checked with `explain analyze` on realistic volumes.
- [ ] RLS enabled and policies created in the same migration as the table.
- [ ] Migrations in version control, single-purpose, additive-first, tested on a copy.
- [ ] No `timestamp`, no `float` money, no `select *` on hot paths.
