# Authorization — Row Level Security Design

The authorization boundary of this product is **inside PostgreSQL**. This document is
the policy design. [PERMISSIONS.md](PERMISSIONS.md) is the matrix these policies
implement; [SECURITY.md](SECURITY.md) covers everything around them.

> ## Implementation notes — where the shipped policies differ
>
> Both open decisions in this document were resolved, and empirical testing
> found two defects in the design as written here. The authoritative source is
> `supabase/migrations/0008`–`0010`; run `npm run db:gates && npm run db:rls`.
>
> **1. Ownership columns use column-level privileges, not `with check`.**
> The design proposed constraining ownership changes in a `with check` clause.
> That is not sufficient — and worse, the obvious implementation is a silent
> no-op: PostgreSQL treats a table-level `UPDATE` grant as covering every
> column, so `revoke update (sales_owner_id) …` against it does nothing.
> Empirical testing caught `sales_a` successfully rewriting `mentor_owner_id`.
> The shipped fix revokes table-level `UPDATE` on `clients` entirely and grants
> back only the editable columns. `authenticated` therefore holds **no**
> privilege on the ownership and provenance columns, and the `assign_*` RPCs
> are the only door.
>
> **2. The guard trigger must NOT be `SECURITY DEFINER`.**
> Inside a `SECURITY DEFINER` function `current_user` becomes the function
> owner, so a `current_user <> 'authenticated'` check always passes and the
> guard is inert. It ships as `SECURITY INVOKER`.
>
> **3. Calendar policies use helper functions to break a policy cycle.**
> `events_select` needs "am I an attendee?" and `attendees_select` needs "may I
> see the event?". Written as plain subqueries the two recurse and PostgreSQL
> raises `42P17`. `app.is_event_attendee()` and `app.event_organizer()` are
> `SECURITY DEFINER` specifically to break that cycle.
>
> **4. Open Decision 1 resolved as option (b)**: `assign_mentor()` is callable
> by the client's sales owner. Open Decision 2 resolved in favour of the
> trigger form.
>
> **5. Six roles, not three** — see [USER_ROLES.md](USER_ROLES.md). Every
> policy below gains manager and finance branches via `app.manages_user()`,
> `app.is_finance()` and `app.can_access_financials()`.

---

## 1. The rule

A client record is accessible to exactly:

| Who                  | Condition                      |
| -------------------- | ------------------------------ |
| Admin                | always                         |
| Assigned sales owner | `sales_owner_id = auth.uid()`  |
| Assigned mentor      | `mentor_owner_id = auth.uid()` |

Everyone else: **the row does not exist**. Not "forbidden" — absent. Another
salesperson's query returns zero rows, not an error.

Every table carrying client-derived data inherits this rule through `client_id`.

## 2. Why the database, not the application

A React check hides a button. A `.eq('sales_owner_id', userId)` in a client component
is a filter the user can delete from their own devtools. The anon key is public by
design; Supabase exposes PostgREST directly. **If RLS is wrong, the data is public.**

Consequence: an RLS gap is not a bug of the same class as a UI bug. It is a data breach.

## 3. Structure

### 3.1 Helper functions

The rule is defined **once**, in `security definer` functions with a locked
`search_path`, and called from every policy. Duplicating the predicate across twenty
policies guarantees they drift.

```sql
-- Current user's role, read from the server-side profiles table.
-- NEVER from JWT metadata, which the user can modify via the auth API.
create function app.current_role() returns user_role
  language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() and is_active $$;

create function app.is_admin() returns boolean
  language sql stable security definer set search_path = ''
as $$ select app.current_role() = 'admin' $$;

-- The single definition of client visibility.
create function app.can_access_client(p_client_id uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client_id
      and ( app.is_admin()
         or c.sales_owner_id  = auth.uid()
         or c.mentor_owner_id = auth.uid() )
  )
$$;
```

**Why `security definer`:** `app.can_access_client` reads `clients` from inside a
policy on `deposits`. Without `security definer` that read would itself be filtered by
the `clients` policy — correct here by luck, but fragile, and it forces a nested policy
evaluation on every row. `set search_path = ''` (with fully-qualified names) prevents
search-path hijacking, which is the classic `security definer` attack.

**Why `stable`:** lets the planner call it once per statement rather than per row where
possible. Combined with the indexes below, this is what keeps RLS affordable.

### 3.2 Mandatory indexes

Every column an RLS predicate tests **must** be indexed. Without them, every row access
becomes a sequential scan and the policy is a performance incident:

```sql
clients (sales_owner_id)          -- required
clients (mentor_owner_id)         -- required
deposits (client_id)              -- required
enrollments (client_id)           -- required
tasks (assignee_id)               -- required
tasks (client_id)                 -- required
calendar_events (organizer_id)    -- required
calendar_events (client_id)       -- required
event_attendees (user_id)         -- required
profiles (id)                     -- PK, already indexed
```

### 3.3 Policy rules

- **RLS enabled on every table** in `public`, including lookup tables. A table without
  RLS is world-readable through the anon key.
- **`force row level security`** on `clients`, `deposits`, and `audit_log` so even the
  table owner is subject to policy.
- **One policy per operation.** Never `for all` — it silently grants more than intended.
- **`with check` on every `insert` and `update`.** `using` controls which rows you can
  *see* to modify; `with check` controls what the row may *become*. Without it, a
  salesperson can `update clients set sales_owner_id = <self>` on a row they can
  already see, or hand a row to someone else.
- **Policies ship in the same migration as the table.**

## 4. Policies by table

### 4.1 `profiles`

```sql
alter table profiles enable row level security;

-- Everyone authenticated can see the directory (names, roles) —
-- needed for owner labels, assignment pickers, attendee lists.
create policy profiles_select on profiles for select to authenticated
  using (true);

-- Only admins create profiles. (Normal signup goes through the
-- auth.users trigger, which is security definer and bypasses this.)
create policy profiles_insert on profiles for insert to authenticated
  with check (app.is_admin());

-- A user may update their own profile but NOT their own role or active flag.
create policy profiles_update_self on profiles for update to authenticated
  using  (id = auth.uid())
  with check (
    id = auth.uid()
    and role      = (select role      from profiles where id = auth.uid())
    and is_active = (select is_active from profiles where id = auth.uid())
  );

-- Admins may update anyone, including roles.
create policy profiles_update_admin on profiles for update to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- No delete policy. Profiles are deactivated, never deleted —
-- they are referenced by created_by on historical clients.
```

> The `profiles_update_self` `with check` is the **role-escalation defense**. It is the
> single most important `with check` in the schema.

### 4.2 `clients`

```sql
alter table clients enable row level security;
alter table clients force  row level security;

create policy clients_select on clients for select to authenticated
  using ( app.is_admin()
       or sales_owner_id  = auth.uid()
       or mentor_owner_id = auth.uid() );

-- Sales and admins create leads. The creator must be honest about who they are,
-- and cannot create a row already owned by someone else.
create policy clients_insert on clients for insert to authenticated
  with check (
    app.current_role() in ('admin','sales')
    and created_by = auth.uid()
    and (app.is_admin() or sales_owner_id = auth.uid())
    and (app.is_admin() or mentor_owner_id is null)
    and converted_by is null and converted_at is null
  );

-- Owners may edit their own clients but may NOT reassign ownership.
-- Admins may do both.
create policy clients_update on clients for update to authenticated
  using ( app.is_admin()
       or sales_owner_id  = auth.uid()
       or mentor_owner_id = auth.uid() )
  with check (
    app.is_admin()
    or (
         -- still visible to me after the change
         (sales_owner_id = auth.uid() or mentor_owner_id = auth.uid())
         -- and I did not change who owns it
     and sales_owner_id  = (select sales_owner_id  from clients where id = clients.id)
     and mentor_owner_id = (select mentor_owner_id from clients where id = clients.id)
     and created_by      = (select created_by      from clients where id = clients.id)
    )
  );

-- No delete policy for anyone. Clients are never deleted;
-- they become 'lost' or 'dormant'.
```

> **Reassignment is admin-only, by policy.** A salesperson cannot pull a client to
> themselves and cannot push one away. The mentor-assignment step of the lifecycle is
> therefore an admin action or a `security definer` function with its own explicit
> check — decided at implementation, documented either way.

Note the `with check` subqueries read the **pre-update** row inside `with check`; in
practice this is expressed with a `before update` trigger guard instead, because
referencing `OLD` is clearer than a self-subquery. Both are specified so the
implementer picks one deliberately — the trigger form is preferred.

### 4.3 `deposits`

```sql
alter table deposits enable row level security;
alter table deposits force  row level security;

create policy deposits_select on deposits for select to authenticated
  using (app.can_access_client(client_id));

create policy deposits_insert on deposits for insert to authenticated
  with check (
    app.can_access_client(client_id)
    and recorded_by = auth.uid()
  );

-- NO update policy.  NO delete policy.  Deliberate.
-- Corrections are 'adjustment' entries, never edits.
```

Plus the belt-and-braces grant revocation:

```sql
revoke update, delete on deposits from authenticated;
```

### 4.4 `enrollments`

```sql
create policy enrollments_select on enrollments for select to authenticated
  using (app.can_access_client(client_id));

create policy enrollments_insert on enrollments for insert to authenticated
  with check (app.is_admin() or app.can_access_client(client_id));

create policy enrollments_update on enrollments for update to authenticated
  using  (app.can_access_client(client_id))
  with check (app.can_access_client(client_id));
```

### 4.5 `calendar_events`

The most nuanced table: an event is visible if you organize it, attend it, it is a
company event, or it references a client you can access.

```sql
create policy events_select on calendar_events for select to authenticated
  using (
       app.is_admin()
    or organizer_id = auth.uid()
    or event_type in ('company_meeting','internal_training')
    or exists (select 1 from event_attendees a
               where a.event_id = calendar_events.id and a.user_id = auth.uid())
    or (client_id is not null and app.can_access_client(client_id))
  );

create policy events_insert on calendar_events for insert to authenticated
  with check (
    created_by = auth.uid()
    and (organizer_id = auth.uid() or app.is_admin())
    and (client_id is null or app.can_access_client(client_id))
    and (event_type not in ('company_meeting','internal_training') or app.is_admin())
  );

create policy events_update on calendar_events for update to authenticated
  using  (app.is_admin() or organizer_id = auth.uid())
  with check (
    (app.is_admin() or organizer_id = auth.uid())
    and (client_id is null or app.can_access_client(client_id))
  );

create policy events_delete on calendar_events for delete to authenticated
  using (app.is_admin() or organizer_id = auth.uid());
```

**Availability is not covered by these policies** — showing that a mentor is busy at
14:00 must not require read access to the event. It is served by a dedicated
`security definer` function that returns time ranges only:

```sql
create function app.busy_ranges(p_user_id uuid, p_from timestamptz, p_to timestamptz)
  returns table (starts_at timestamptz, ends_at timestamptz)
  language sql stable security definer set search_path = ''
as $$
  select e.starts_at, e.ends_at
  from public.calendar_events e
  where e.organizer_id = p_user_id
    and e.is_cancelled = false
    and e.starts_at < p_to and e.ends_at > p_from
$$;
```

It returns **two columns**. No title, no client, no description. This is the only
sanctioned way to read across an ownership boundary, and its narrowness is the point.

### 4.6 `event_attendees`

```sql
create policy attendees_select on event_attendees for select to authenticated
  using (exists (select 1 from calendar_events e where e.id = event_id));
  -- the events policy already filters what is visible

create policy attendees_write on event_attendees for insert to authenticated
  with check (exists (select 1 from calendar_events e
                      where e.id = event_id
                        and (e.organizer_id = auth.uid() or app.is_admin())));

create policy attendees_respond on event_attendees for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

### 4.7 `tasks`

```sql
create policy tasks_select on tasks for select to authenticated
  using ( app.is_admin()
       or assignee_id = auth.uid()
       or created_by  = auth.uid()
       or (client_id is not null and app.can_access_client(client_id)) );

create policy tasks_insert on tasks for insert to authenticated
  with check ( created_by = auth.uid()
           and (client_id is null or app.can_access_client(client_id)) );

create policy tasks_update on tasks for update to authenticated
  using  (app.is_admin() or assignee_id = auth.uid() or created_by = auth.uid())
  with check ( app.is_admin()
            or ( (assignee_id = auth.uid() or created_by = auth.uid())
             and (client_id is null or app.can_access_client(client_id)) ) );

create policy tasks_delete on tasks for delete to authenticated
  using (app.is_admin() or created_by = auth.uid());
```

### 4.8 `client_status_history`

```sql
create policy csh_select on client_status_history for select to authenticated
  using (app.can_access_client(client_id));
-- No insert/update/delete policies: written only by a security definer trigger.
```

### 4.9 `programs` and `app_settings`

```sql
create policy programs_select on programs for select to authenticated using (true);
create policy programs_write  on programs for insert to authenticated
  with check (app.is_admin());
create policy programs_update on programs for update to authenticated
  using (app.is_admin()) with check (app.is_admin());
-- same shape for app_settings
```

Reference data. No client information, readable by all authenticated users.

### 4.10 `audit_log`

```sql
alter table audit_log enable row level security;
alter table audit_log force  row level security;

-- Admins see everything; others see only entries for clients they can access.
create policy audit_select on audit_log for select to authenticated
  using ( app.is_admin()
       or (entity_type = 'client' and app.can_access_client(entity_id)) );

-- NO insert policy for authenticated — only the security definer triggers write here.
-- NO update policy.  NO delete policy.  For anyone, including admins.
revoke insert, update, delete on audit_log from authenticated;
```

## 5. Policy summary

| Table                   | select | insert | update | delete |
| ----------------------- | ------ | ------ | ------ | ------ |
| `profiles`              | all authenticated | admin | self (not role) / admin | **none** |
| `clients`               | admin / sales owner / mentor | admin, sales | owners (not reassign) / admin | **none** |
| `deposits`              | client access | client access | **none** | **none** |
| `enrollments`           | client access | client access | client access | admin |
| `calendar_events`       | organizer / attendee / company / client access | self-organized | organizer / admin | organizer / admin |
| `event_attendees`       | via event | organizer / admin | self (response only) | organizer / admin |
| `tasks`                 | assignee / creator / client access | self-created | assignee / creator / admin | creator / admin |
| `client_status_history` | client access | **trigger only** | **none** | **none** |
| `programs`              | all authenticated | admin | admin | **none** |
| `app_settings`          | all authenticated | admin | admin | **none** |
| `audit_log`             | admin / own clients | **trigger only** | **none** | **none** |

Eleven tables, RLS enabled on all eleven. Six tables have **no delete policy at all** —
this product does not delete history.

## 6. Application-layer authorization

RLS is the guarantee. These layers exist on top of it and never replace it:

1. **Middleware** — session present, else redirect to `/login`. Authentication only.
2. **Layouts** — role gate on admin-only route groups (`/settings/users`, `/audit`).
   A convenience so admins-only pages 404 cleanly; the data behind them is protected
   by RLS regardless.
3. **Server Actions** — re-derive the user from the session (never from the body),
   validate with Zod, and for ownership-changing operations perform an explicit check
   *in addition to* the policy. Two independent gates on the operations that matter.
4. **Client components** — hide controls the user cannot use. Pure UX.

## 7. Testing obligation

**A policy that has not been tested with a second user is not implemented.**

For every client-scoped resource, [TEST_PLAN.md](TEST_PLAN.md) requires assertions at
two levels:

1. Through the UI as each seeded user.
2. **Directly against Supabase with the React layer bypassed** — this is the test that
   actually proves RLS.

Non-negotiable assertions:

- Sales B cannot read Sales A's client — not in lists, search, direct ID, or via
  `deposits` / `calendar_events` / `tasks` / `audit_log`.
- Mentor B cannot read a client they are not assigned to.
- No user can update their own `role`.
- No non-admin can change `sales_owner_id` or `mentor_owner_id`.
- No one can update or delete a `deposits` or `audit_log` row.
- `busy_ranges` returns only two columns.

---

## Open decisions

1. **Mentor assignment path** — the `clients_update` policy blocks non-admin
   reassignment, which also blocks a salesperson setting `mentor_owner_id` during
   normal handoff. Two options: (a) admin performs assignment, or (b) a
   `security definer` `assign_mentor(client_id, mentor_id)` function callable by the
   client's sales owner with its own check. **(b) is recommended** — it matches the
   real workflow while keeping the blanket reassignment ban.
2. **`with check` on `clients_update`** — specified above as self-subqueries for
   clarity, but a `before update` trigger comparing `OLD`/`NEW` is the preferred
   implementation. Pick one; do not implement both.
3. **Admin visibility of audit for non-client entities** — currently non-admins see
   audit rows only for clients. Whether a salesperson should see audit entries for
   their own tasks and events is undecided; defaulting to no.
