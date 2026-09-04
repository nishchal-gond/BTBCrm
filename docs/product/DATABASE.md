# Database Architecture

PostgreSQL via Supabase. Design phase — no migrations written yet.

Companion documents: [AUTHORIZATION.md](AUTHORIZATION.md) (RLS policies for every
table below), [PERMISSIONS.md](PERMISSIONS.md) (the matrix those policies implement).

---

## 1. Principles

1. **One human = one row in `clients`.** No table other than `clients` stores a
   person's name, email, or phone.
2. **`client_ref` is permanent and immutable.** Enforced by trigger, not convention.
3. **Money is a ledger.** `deposits` is append-only; totals are derived.
4. **The database enforces the rules it can express.** Constraints over application code.
5. **RLS ships with the table.** Policies are in the same migration that creates the
   table — a table never exists unprotected in any environment.
6. **Every timestamp is `timestamptz`.** Calendar events additionally store an IANA ID.
7. **Audit is written by triggers**, so no application path can bypass it.

## 2. Relationship map

```
                            ┌──────────────┐
                            │ auth.users   │  (Supabase-managed)
                            └──────┬───────┘
                                   │ 1:1
                            ┌──────▼───────┐
                            │  profiles    │  role, name, timezone
                            └──┬─┬─┬─┬─┬───┘
       created_by ────────────┘ │ │ │ └──────────── converted_by
       sales_owner_id ──────────┘ │ └────────────── mentor_owner_id
                                  │
                          ┌───────▼────────┐
                          │    clients     │  ← client_ref CL-000184
                          └───┬──┬──┬──┬──┬┘
              ┌───────────────┘  │  │  │  └──────────────┐
              │         ┌────────┘  │  └──────┐          │
              ▼         ▼           ▼         ▼          ▼
       enrollments  deposits     tasks   calendar_  client_status_
              │     (ledger)              events      history
              ▼                              │
          programs                    event_attendees

                          audit_log  (polymorphic: entity_type + entity_id)
                          app_settings
```

Eleven tables. No `students` table, no `leads` table — those are **views over
`clients`**, not storage.

## 3. Enumerated types

Postgres enums (stable, small, rarely changed):

```sql
create type user_role     as enum ('admin', 'sales', 'mentor');
create type client_status as enum ('lead','qualified','mentor_assigned',
                                   'converted','student','lost','dormant');
create type event_type    as enum ('sales_call','client_appointment','mentor_session',
                                   'company_meeting','internal_training','onboarding',
                                   'review','other');
create type deposit_entry as enum ('payment','refund','adjustment');
create type task_status   as enum ('open','in_progress','blocked','done','cancelled');
create type task_priority as enum ('low','normal','high','urgent');
create type enrollment_status as enum ('active','paused','completed','withdrawn');
```

Adding an enum value is a cheap migration (`alter type ... add value`); removing one is
not. Values are chosen deliberately.

## 4. Client lifecycle

```
   ┌──────┐   qualify   ┌───────────┐  assign mentor  ┌─────────────────┐
   │ lead │────────────►│ qualified │────────────────►│ mentor_assigned │
   └──┬───┘             └─────┬─────┘                 └────────┬────────┘
      │                       │                                │ convert
      │                       │                                ▼
      │                       │                        ┌───────────┐
      │                       │                        │ converted │
      │                       │                        └─────┬─────┘
      │                       │                              │ enrollment created
      │  lost                 │  lost                        ▼
      └───────┬───────────────┘                        ┌──────────┐
              ▼                                        │ student  │
          ┌──────┐        ┌─────────┐                  └──────────┘
          │ lost │        │ dormant │◄─── inactivity, any stage
          └──────┘        └─────────┘
```

**Every transition is an `UPDATE` on one row.** No transition inserts a person.

| Transition                      | Requires                                        |
| ------------------------------- | ----------------------------------------------- |
| `lead → qualified`              | sales owner set                                 |
| `qualified → mentor_assigned`   | `mentor_owner_id` set                           |
| `mentor_assigned → converted`   | sets `converted_by`, `converted_at`             |
| `converted → student`           | an `enrollments` row exists                     |
| any → `lost` / `dormant`        | reason recorded in `client_status_history`      |
| backward move                   | reason required; admin-only for post-conversion |

Every transition writes a `client_status_history` row **and** an `audit_log` row, both
by trigger.

## 5. Tables

### 5.1 `profiles`

Mirrors `auth.users`. Role lives **here**, server-side — never in JWT metadata the
user can edit.

| Column        | Type          | Notes                                    |
| ------------- | ------------- | ---------------------------------------- |
| `id`          | `uuid` PK     | `references auth.users(id) on delete restrict` |
| `full_name`   | `text`        | not null                                 |
| `email`       | `text`        | not null unique (mirror of auth)         |
| `role`        | `user_role`   | not null, default `'sales'`              |
| `is_active`   | `boolean`     | not null default true                    |
| `timezone`    | `text`        | not null default `'Asia/Dubai'`, IANA ID |
| `phone`       | `text`        | null                                     |
| `created_at`  | `timestamptz` | not null default `now()`                 |
| `updated_at`  | `timestamptz` | maintained by trigger                    |

- `check (timezone = any(...))` is impractical; validate the IANA ID in the app and by
  a `check` that it resolves via `now() at time zone timezone` in a trigger.
- Deactivation sets `is_active = false`. Profiles are **never deleted** — they are
  referenced by `created_by` on historical clients.
- Sales Team and Mentors modules are `profiles` filtered by `role`.

### 5.2 `clients` — the central table

| Column             | Type            | Notes                                              |
| ------------------ | --------------- | -------------------------------------------------- |
| `id`               | `uuid` PK       | `default gen_random_uuid()`                        |
| `client_ref`       | `text`          | **not null unique**, `CL-000184`, **immutable**     |
| `first_name`       | `text`          | not null, `check (length(btrim(first_name)) > 0)`  |
| `last_name`        | `text`          | not null                                            |
| `email`            | `text`          | null                                                |
| `phone`            | `text`          | null                                                |
| `email_norm`       | `text`          | generated: `lower(btrim(email))`                    |
| `phone_norm`       | `text`          | generated: digits only, E.164-ish                   |
| `country`          | `text`          | ISO 3166-1 alpha-2                                  |
| `city`             | `text`          | null                                                |
| `status`           | `client_status` | not null default `'lead'`                           |
| `source`           | `text`          | lead source                                         |
| `created_by`       | `uuid`          | **not null** `→ profiles(id)`                       |
| `sales_owner_id`   | `uuid`          | null `→ profiles(id)`                               |
| `mentor_owner_id`  | `uuid`          | null `→ profiles(id)`                               |
| `converted_by`     | `uuid`          | null `→ profiles(id)`                               |
| `converted_at`     | `timestamptz`   | null                                                |
| `last_activity_at` | `timestamptz`   | touched by trigger on related writes                |
| `created_at`       | `timestamptz`   | not null default `now()`                            |
| `updated_at`       | `timestamptz`   | trigger                                             |

**`client_ref` generation**

```sql
create sequence client_ref_seq start 1;
-- default: 'CL-' || lpad(nextval('client_ref_seq')::text, 6, '0')
```

Immutability by trigger:

```sql
create trigger clients_ref_immutable before update on clients
  for each row when (old.client_ref is distinct from new.client_ref)
  execute function raise_immutable_column();
```

**Constraints**

```sql
-- conversion fields move together
check ((converted_at is null) = (converted_by is null))

-- post-conversion statuses require the full chain
check (
  status not in ('converted','student')
  or (mentor_owner_id is not null
      and converted_by is not null
      and converted_at is not null)
)

-- mentor_assigned onward requires a mentor
check (status not in ('mentor_assigned','converted','student')
       or mentor_owner_id is not null)

-- at least one contact channel
check (email is not null or phone is not null)
```

**Duplicate prevention**

```sql
create unique index clients_email_norm_uniq on clients (email_norm)
  where email_norm is not null and status <> 'lost';
create unique index clients_phone_norm_uniq on clients (phone_norm)
  where phone_norm is not null and status <> 'lost';
```

Partial on `status <> 'lost'` so a lost lead does not permanently block a genuine
re-entry — but a re-entry is still an **update to the existing row** (status back to
`lead`), preserving `client_ref`, not a new insert. The admin merge flow
([§9](#9-merging-duplicates)) handles anything the index missed.

**Indexes**

```sql
create index on clients (sales_owner_id);      -- RLS predicate
create index on clients (mentor_owner_id);     -- RLS predicate
create index on clients (status, created_at desc);
create index on clients (sales_owner_id, status, last_activity_at desc);
create index on clients (created_by);
create index clients_unassigned on clients (created_at)
  where sales_owner_id is null;
-- trigram index on name for search
create index on clients using gin ((first_name || ' ' || last_name) gin_trgm_ops);
```

The first two are **mandatory** — they are the columns every RLS policy tests, and an
unindexed RLS predicate turns every row access into a scan.

### 5.3 `programs`

| Column         | Type            | Notes                       |
| -------------- | --------------- | --------------------------- |
| `id`           | `uuid` PK       |                             |
| `code`         | `text`          | not null unique             |
| `name`         | `text`          | not null                    |
| `description`  | `text`          |                             |
| `duration_weeks` | `int`         | `check (> 0)`               |
| `price_aed`    | `numeric(14,2)` | `check (>= 0)`              |
| `is_active`    | `boolean`       | not null default true       |
| `created_at`   | `timestamptz`   |                             |

Reference data. Readable by all authenticated users; writable by admin only.

### 5.4 `enrollments`

Student-specific data. **No personal data here** — it lives in `clients`.

| Column        | Type                | Notes                                |
| ------------- | ------------------- | ------------------------------------ |
| `id`          | `uuid` PK           |                                      |
| `client_id`   | `uuid`              | not null `→ clients(id) on delete restrict` |
| `program_id`  | `uuid`              | not null `→ programs(id) on delete restrict` |
| `mentor_id`   | `uuid`              | `→ profiles(id)`                     |
| `cohort`      | `text`              |                                      |
| `status`      | `enrollment_status` | not null default `'active'`          |
| `enrolled_at` | `timestamptz`       | not null default `now()`             |
| `completed_at`| `timestamptz`       |                                      |
| `notes`       | `text`              |                                      |

```sql
create unique index enrollments_one_active
  on enrollments (client_id) where status = 'active';
create index on enrollments (client_id);
create index on enrollments (mentor_id, status);
```

One active enrollment per client. History is preserved by completed/withdrawn rows.

### 5.5 `deposits` — append-only ledger

| Column        | Type            | Notes                                      |
| ------------- | --------------- | ------------------------------------------ |
| `id`          | `uuid` PK       |                                            |
| `client_id`   | `uuid`          | not null `→ clients(id) on delete restrict`|
| `entry_type`  | `deposit_entry` | not null default `'payment'`               |
| `amount`      | `numeric(14,2)` | not null, see constraint below             |
| `currency`    | `text`          | not null default `'AED'`, `check (length = 3)` |
| `method`      | `text`          | bank transfer, card, cash, …               |
| `reference`   | `text`          | external reference                         |
| `occurred_at` | `timestamptz`   | not null                                   |
| `recorded_by` | `uuid`          | not null `→ profiles(id)`                  |
| `note`        | `text`          |                                            |
| `created_at`  | `timestamptz`   | not null default `now()`                   |

```sql
check ((entry_type = 'payment' and amount > 0)
    or (entry_type = 'refund'  and amount < 0)
    or (entry_type = 'adjustment'))
create index on deposits (client_id, occurred_at desc);
create index on deposits (occurred_at desc);
create index on deposits (recorded_by);
```

**Append-only.** No `update` or `delete` policy exists for any role — see
[AUTHORIZATION.md](AUTHORIZATION.md). A mistake is corrected by an `adjustment` entry
that references the original, never by editing history.

**Totals are derived:**

```sql
create view client_deposit_totals as
select client_id,
       sum(amount)               as total_aed,
       count(*) filter (where entry_type = 'payment') as payment_count,
       max(occurred_at)          as last_deposit_at
from deposits group by client_id;
```

The view inherits RLS from `deposits` (declare it `security_invoker = true`). There is
**no** `total_deposits` column on `clients`.

### 5.6 `calendar_events`

| Column                | Type          | Notes                                          |
| --------------------- | ------------- | ---------------------------------------------- |
| `id`                  | `uuid` PK     |                                                |
| `title`               | `text`        | not null                                       |
| `description`         | `text`        |                                                |
| `event_type`          | `event_type`  | not null                                       |
| `starts_at`           | `timestamptz` | not null                                       |
| `ends_at`             | `timestamptz` | not null                                       |
| `timezone`            | `text`        | not null — **IANA ID**, e.g. `Asia/Dubai`      |
| `is_all_day`          | `boolean`     | not null default false                         |
| `organizer_id`        | `uuid`        | not null `→ profiles(id)`                      |
| `client_id`           | `uuid`        | **nullable** `→ clients(id) on delete restrict`|
| `location`            | `text`        |                                                |
| `recurrence_rule`     | `text`        | RFC 5545 RRULE; null for single events         |
| `series_id`           | `uuid`        | `→ calendar_events(id)`; set on overrides      |
| `override_start_date` | `date`        | which occurrence this row overrides            |
| `is_cancelled`        | `boolean`     | not null default false                         |
| `created_by`          | `uuid`        | not null `→ profiles(id)`                      |
| `created_at` / `updated_at` | `timestamptz` |                                          |

```sql
check (ends_at > starts_at)
check ((series_id is null) = (override_start_date is null))
check (recurrence_rule is null or series_id is null)  -- a series master is not an override
create index on calendar_events (starts_at, ends_at);
create index on calendar_events (organizer_id, starts_at);
create index on calendar_events (client_id, starts_at) where client_id is not null;
create index on calendar_events (series_id) where series_id is not null;
```

**Recurrence is stored as a rule, never as pre-generated rows.** Occurrences are
expanded for the queried window only. Exceptions are override rows pointing at
`series_id`. Full model in [CALENDAR.md](CALENDAR.md).

Storing both `timestamptz` **and** the IANA `timezone` is deliberate: the instant
answers "when", the zone answers "what wall-clock time did the organizer mean" — which
recurrence expansion needs to survive DST.

### 5.7 `event_attendees`

| Column    | Type   | Notes                                    |
| --------- | ------ | ---------------------------------------- |
| `event_id`| `uuid` | not null `→ calendar_events(id) on delete cascade` |
| `user_id` | `uuid` | not null `→ profiles(id)`                |
| `response`| `text` | `check in ('pending','accepted','declined','tentative')` |

Primary key `(event_id, user_id)`. Index on `(user_id)` — it is an RLS predicate.

### 5.8 `tasks`

| Column        | Type            | Notes                                  |
| ------------- | --------------- | -------------------------------------- |
| `id`          | `uuid` PK       |                                        |
| `title`       | `text`          | not null                               |
| `description` | `text`          |                                        |
| `assignee_id` | `uuid`          | not null `→ profiles(id)`              |
| `client_id`   | `uuid`          | nullable `→ clients(id) on delete restrict` |
| `due_at`      | `timestamptz`   |                                        |
| `status`      | `task_status`   | not null default `'open'`              |
| `priority`    | `task_priority` | not null default `'normal'`            |
| `created_by`  | `uuid`          | not null `→ profiles(id)`              |
| `completed_at`| `timestamptz`   |                                        |
| `created_at`  | `timestamptz`   |                                        |

```sql
check ((status = 'done') = (completed_at is not null))
create index on tasks (assignee_id, status, due_at);
create index on tasks (client_id) where client_id is not null;
create index tasks_overdue on tasks (due_at)
  where status in ('open','in_progress','blocked');
```

### 5.9 `client_status_history`

| Column        | Type            | Notes                            |
| ------------- | --------------- | -------------------------------- |
| `id`          | `uuid` PK       |                                  |
| `client_id`   | `uuid`          | not null `→ clients(id)`         |
| `from_status` | `client_status` | null on creation                 |
| `to_status`   | `client_status` | not null                         |
| `changed_by`  | `uuid`          | not null `→ profiles(id)`        |
| `reason`      | `text`          | required for backward/lost moves |
| `changed_at`  | `timestamptz`   | not null default `now()`         |

Written by trigger on `clients` status change. Powers the Sales tab timeline.
Index `(client_id, changed_at desc)`.

### 5.10 `audit_log`

| Column           | Type          | Notes                                    |
| ---------------- | ------------- | ---------------------------------------- |
| `id`             | `bigserial` PK|                                          |
| `actor_id`       | `uuid`        | `→ profiles(id)`; null for system actions|
| `entity_type`    | `text`        | not null — `client`, `deposit`, `profile`, `calendar_event`, `task`, `enrollment` |
| `entity_id`      | `uuid`        | not null                                 |
| `action`         | `text`        | `insert`, `update`, `delete`, `convert`, `reassign`, `role_change` |
| `changed_fields` | `jsonb`       | `{field: {before, after}}`               |
| `reason`         | `text`        |                                          |
| `occurred_at`    | `timestamptz` | not null default `now()`                 |

```sql
create index on audit_log (entity_type, entity_id, occurred_at desc);
create index on audit_log (actor_id, occurred_at desc);
create index on audit_log (occurred_at desc);
```

**Append-only for everyone, including admin.** No `update` or `delete` policy is
written, and `revoke update, delete on audit_log from authenticated` is explicit.

Written by `security definer` triggers on `clients`, `deposits`, `profiles`,
`enrollments`, `calendar_events`, and `tasks` — so no application code path can skip it.

### 5.11 `app_settings`

| Column       | Type          | Notes                     |
| ------------ | ------------- | ------------------------- |
| `key`        | `text` PK     |                           |
| `value`      | `jsonb`       | not null                  |
| `updated_by` | `uuid`        | `→ profiles(id)`          |
| `updated_at` | `timestamptz` |                           |

Admin-write, all-read. Holds company timezone default, business hours, lead-source
list, and similar operational configuration.

## 6. What is deliberately *not* a table

**Market cities** — the seven globe cities are static configuration in TypeScript
(`lib/market-cities.ts`). They change roughly never, are needed at first paint, and a
database round trip for them would be pure cost. See
[3D_ARCHITECTURE.md](3D_ARCHITECTURE.md).

**Leads / Students** — filtered views over `clients`, expressed as query predicates,
not tables and not materialized views.

## 7. Triggers

| Trigger                        | On                     | Does                                          |
| ------------------------------ | ---------------------- | --------------------------------------------- |
| `set_updated_at`               | all mutable tables     | maintains `updated_at`                        |
| `clients_ref_immutable`        | `clients` update       | rejects any `client_ref` change               |
| `clients_status_history`       | `clients` update       | writes `client_status_history` on status change|
| `clients_conversion_stamp`     | `clients` update       | on entry to `converted`, stamps `converted_by = auth.uid()`, `converted_at = now()` if not set |
| `audit_row_change`             | 6 tables               | writes `audit_log` with before/after diff     |
| `touch_client_activity`        | deposits, events, tasks| updates `clients.last_activity_at`            |
| `profiles_role_change_audit`   | `profiles` update      | writes a `role_change` audit row              |

All audit triggers are `security definer` with `set search_path = ''` so they can write
to `audit_log` regardless of the caller's RLS, without becoming an injection surface.

## 8. Migration strategy

- Every change is a file in `supabase/migrations/`, timestamped, single-purpose.
  **No schema change is ever made only in the Supabase dashboard.**
- **RLS ships with the table.** `create table` + `enable row level security` + all four
  policies in the same migration. There is never a window where a table exists
  unprotected.
- Additive-first for live data: add nullable → backfill → add constraint → switch reads
  → drop old. Never a destructive change in one step.
- `create index concurrently` cannot run in a transaction — those go in their own
  migration with a comment saying why.
- Every migration is tested against a copy of realistic data before it runs anywhere real.
- The rollback path is written into the migration's header comment even though
  migrations are forward-only.

Initial sequence:

```
0001_extensions.sql            pgcrypto, pg_trgm
0002_types.sql                 enums
0003_profiles.sql              + RLS + auth trigger
0004_clients.sql               + client_ref sequence + RLS + constraints
0005_programs.sql              + RLS
0006_enrollments.sql           + RLS
0007_deposits.sql              + RLS (no update/delete policies) + totals view
0008_calendar_events.sql       + attendees + RLS
0009_tasks.sql                 + RLS
0010_client_status_history.sql + RLS
0011_audit_log.sql             + revoke + triggers across tables
0012_app_settings.sql          + RLS
0013_indexes_concurrent.sql    trigram + any concurrent builds
0014_seed_dev.sql              dev-only: 5 test users, programs, sample clients
```

## 9. Merging duplicates

If two rows for one human survive the constraints, admins get a merge that:

1. Keeps the **older** `client_ref` (the person's real, permanent ID).
2. Repoints `deposits`, `enrollments`, `tasks`, `calendar_events`,
   `client_status_history` to the surviving `client_id`.
3. Preserves the earliest `created_by` / `created_at`.
4. Marks the loser `status = 'dormant'` with a `merged_into` reference — **never
   deletes it**, so any external reference to the retired ref still resolves.
5. Writes a `merge` audit row on both.

## 10. Conventions

`snake_case`, plural tables · `uuid` PKs (`bigserial` for `audit_log` only, where
insert volume and ordering matter) · `text` over `varchar(n)` unless a length is a real
business rule · `numeric` for money, never `float` or `money` · `timestamptz` always,
never bare `timestamp` · `jsonb` only for genuinely unstructured data
(`audit_log.changed_fields`, `app_settings.value`).

---

## Open questions for implementation

1. **Soft-delete for clients** — currently none; `lost`/`dormant` cover the cases. If a
   GDPR-style erasure requirement appears, it needs a design (anonymize in place,
   preserving `client_ref` and the ledger) rather than a `deleted_at` column.
2. **`phone_norm` normalization** — needs a deterministic rule (probably E.164 with a
   default region of `AE`) before the unique index can be trusted.
3. **Deposit currency** — schema supports multi-currency; v1 UI assumes `AED` only.
   Reporting across currencies is not designed.
