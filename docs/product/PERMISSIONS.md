# Permissions Matrix

The authoritative action-by-action permission table. Roles are defined in
[USER_ROLES.md](USER_ROLES.md); the RLS policies that enforce these rows are in
[AUTHORIZATION.md](AUTHORIZATION.md).

**Legend**

| Symbol | Meaning |
| ------ | ------- |
| ✅ | Permitted |
| 🔶 | Permitted **only for records they own** (`sales_owner_id` or `mentor_owner_id` = them) |
| ❌ | Denied — and for reads, denial means *the row does not exist*, not an error |
| 🔒 | Denied to **everyone**, including admins |

Every ✅/🔶 in this table must map to a policy in `supabase/migrations/`, and every ❌
must have a corresponding negative test in [TEST_PLAN.md](TEST_PLAN.md).

---

## 1. Clients

| Action                                  | Admin | Sales | Mentor |
| --------------------------------------- | :---: | :---: | :----: |
| List clients                            | ✅ all | 🔶 own | 🔶 assigned |
| View client detail                      | ✅ | 🔶 | 🔶 |
| Search clients (name, `CL-000184`, email)| ✅ | 🔶 | 🔶 |
| Create lead                             | ✅ | ✅ | ❌ |
| Edit client details                     | ✅ | 🔶 | 🔶 |
| Change status forward                   | ✅ | 🔶 | 🔶 |
| Change status backward (pre-conversion) | ✅ | 🔶 + reason | ❌ |
| Change status backward (post-conversion)| ✅ + reason | ❌ | ❌ |
| Assign / change `sales_owner_id`        | ✅ | ❌ | ❌ |
| Assign `mentor_owner_id` (first time)   | ✅ | 🔶 via `assign_mentor()` * | ❌ |
| Change `mentor_owner_id` (reassign)     | ✅ | ❌ | ❌ |
| Convert to student                      | ✅ | ❌ | 🔶 |
| Reverse a conversion                    | ✅ + reason | ❌ | ❌ |
| Merge duplicates                        | ✅ | ❌ | ❌ |
| Edit `client_ref`                       | 🔒 | 🔒 | 🔒 |
| Edit `created_by`                       | 🔒 | 🔒 | 🔒 |
| Edit `converted_by` / `converted_at`    | 🔒 | 🔒 | 🔒 |
| Delete a client                         | 🔒 | 🔒 | 🔒 |

\* Pending the open decision in [AUTHORIZATION.md](AUTHORIZATION.md) §Open 1. If the
`assign_mentor()` function is not built, this cell becomes ❌ and mentor assignment is
admin-only.

**Cross-owner denial — the core assertions:**

- `sales_b` querying `sales_a`'s client → **0 rows**, at the API level, not just the UI
- `mentor_b` querying `mentor_a`'s client → **0 rows**
- Direct URL `/clients/CL-000184` for a non-owner → not-found, with **no name in the
  response body, page title, or metadata**

## 2. Deposits

| Action                          | Admin | Sales | Mentor |
| ------------------------------- | :---: | :---: | :----: |
| View deposits for a client      | ✅ | 🔶 | 🔶 |
| View global deposits list       | ✅ | 🔶 own clients only | 🔶 assigned only |
| Record a payment                | ✅ | 🔶 | 🔶 |
| Record a refund / adjustment    | ✅ | ❌ | ❌ |
| Edit a deposit row              | 🔒 | 🔒 | 🔒 |
| Delete a deposit row            | 🔒 | 🔒 | 🔒 |
| View derived client total       | ✅ | 🔶 | 🔶 |

The ledger is append-only for **everyone**. There is no `update` or `delete` policy on
`deposits`, and `update, delete` are additionally revoked from `authenticated`.
Corrections are `adjustment` entries referencing the original.

## 3. Students and enrollments

| Action                          | Admin | Sales | Mentor |
| ------------------------------- | :---: | :---: | :----: |
| List students                   | ✅ all | 🔶 own | 🔶 assigned |
| View enrollment                 | ✅ | 🔶 | 🔶 |
| Create enrollment               | ✅ | ❌ | 🔶 |
| Edit enrollment / progress      | ✅ | ❌ | 🔶 |
| Mark completed / withdrawn      | ✅ | ❌ | 🔶 |
| Delete enrollment               | ✅ | ❌ | ❌ |

Enrollments carry no personal data — only program, cohort, mentor, and progress.

## 4. Programs

| Action              | Admin | Sales | Mentor |
| ------------------- | :---: | :---: | :----: |
| View programs       | ✅ | ✅ | ✅ |
| Create program      | ✅ | ❌ | ❌ |
| Edit program        | ✅ | ❌ | ❌ |
| Deactivate program  | ✅ | ❌ | ❌ |
| Delete program      | 🔒 | 🔒 | 🔒 |

Reference data. Deactivated rather than deleted — enrollments reference them.

## 5. Calendar

| Action                                    | Admin | Sales | Mentor |
| ----------------------------------------- | :---: | :---: | :----: |
| View own events                           | ✅ | ✅ | ✅ |
| View events they are an attendee of       | ✅ | ✅ | ✅ |
| View company events / internal training   | ✅ | ✅ | ✅ |
| View events referencing an owned client   | ✅ | 🔶 | 🔶 |
| View **another owner's** client events    | ✅ | ❌ | ❌ |
| View another user's **busy ranges**       | ✅ | ✅ | ✅ |
| View another user's event **details**     | ✅ | ❌ | ❌ |
| Create sales call / client appointment    | ✅ | 🔶 | ❌ |
| Create mentor session / review            | ✅ | ❌ | 🔶 |
| Create onboarding                         | ✅ | 🔶 | 🔶 |
| Create company meeting / internal training| ✅ | ❌ | ❌ |
| Link an event to a client                 | ✅ | 🔶 | 🔶 |
| Edit own event                            | ✅ | ✅ | ✅ |
| Edit another user's event                 | ✅ | ❌ | ❌ |
| Respond to an invitation (own response)   | ✅ | ✅ | ✅ |
| Delete own event                          | ✅ | ✅ | ✅ |
| Delete another user's event               | ✅ | ❌ | ❌ |

> **The busy-range row is the sharpest boundary in the product.** Everyone may learn
> that a mentor is occupied 14:00–15:00; only entitled users may learn *who with* or
> *about what*. Served by `app.busy_ranges()`, which returns exactly two columns.
> Any endpoint that returns full event objects for scheduling is a leak.

## 6. Tasks

| Action                        | Admin | Sales | Mentor |
| ----------------------------- | :---: | :---: | :----: |
| View own assigned tasks       | ✅ | ✅ | ✅ |
| View tasks they created       | ✅ | ✅ | ✅ |
| View tasks on an owned client | ✅ | 🔶 | 🔶 |
| View all tasks                | ✅ | ❌ | ❌ |
| Create task for self          | ✅ | ✅ | ✅ |
| Create task for another user  | ✅ | ❌ | ❌ |
| Link task to a client         | ✅ | 🔶 | 🔶 |
| Edit assigned / created task  | ✅ | ✅ | ✅ |
| Reassign a task               | ✅ | ❌ | ❌ |
| Delete a task they created    | ✅ | ✅ | ✅ |

## 7. Users, roles, and team pages

| Action                                | Admin | Sales | Mentor |
| ------------------------------------- | :---: | :---: | :----: |
| View user directory (name, role)      | ✅ | ✅ | ✅ |
| View Sales Team / Mentors list pages  | ✅ | ✅ | ✅ |
| View a colleague's client list        | ✅ | ❌ | ❌ |
| View a colleague's performance figures| ✅ | ❌ | ❌ |
| Access `/settings/users`              | ✅ | ❌ | ❌ |
| Create a user                         | ✅ | ❌ | ❌ |
| Change **another** user's role        | ✅ | ❌ | ❌ |
| Change **own** role                   | 🔒 | 🔒 | 🔒 |
| Change own `is_active`                | 🔒 | 🔒 | 🔒 |
| Deactivate a user                     | ✅ | ❌ | ❌ |
| Edit own name / phone / timezone      | ✅ | ✅ | ✅ |
| Delete a user                         | 🔒 | 🔒 | 🔒 |

> **No user may change their own role — including admins.** The
> `profiles_update_self` policy pins `role` and `is_active` for self-updates. An admin
> changes another admin's role; nobody self-promotes. This closes the role-escalation
> path structurally rather than by convention.

The Sales Team and Mentors pages are **directory pages** for non-admins: name, role,
availability for scheduling. The per-person client list and performance figures are
admin-only.

## 8. Audit log

| Action                             | Admin | Sales | Mentor |
| ---------------------------------- | :---: | :---: | :----: |
| View `/audit` (global log)         | ✅ | ❌ | ❌ |
| View Activity tab on an owned client| ✅ | 🔶 | 🔶 |
| Write an audit entry directly      | 🔒 | 🔒 | 🔒 |
| Edit an audit entry                | 🔒 | 🔒 | 🔒 |
| Delete an audit entry              | 🔒 | 🔒 | 🔒 |

Only `security definer` triggers write here. `insert, update, delete` are revoked from
`authenticated` entirely.

## 9. Settings

| Action                          | Admin | Sales | Mentor |
| ------------------------------- | :---: | :---: | :----: |
| View company settings           | ✅ | ✅ | ✅ |
| Edit company settings           | ✅ | ❌ | ❌ |
| Edit own profile preferences    | ✅ | ✅ | ✅ |

## 10. Dashboard scope

The dashboard renders the same components against differently-scoped data. Scoping
comes from RLS — the queries are identical, the results differ.

| Region              | Admin sees        | Sales sees              | Mentor sees             |
| ------------------- | ----------------- | ----------------------- | ----------------------- |
| KPI rail            | company-wide      | own pipeline            | assigned students       |
| Today's schedule    | own + company     | own + company           | own + company           |
| Needs attention     | incl. unassigned clients, users pending reassignment | own overdue tasks, stale leads | own overdue tasks, sessions |
| Recent activity     | company-wide      | own clients             | assigned clients        |
| Market globe        | identical for all — static config, no client data |

## 11. Enforcement summary

| Layer               | Enforces                                     | Is the guarantee? |
| ------------------- | -------------------------------------------- | ----------------- |
| PostgreSQL RLS      | every 🔶 and ❌ in this document              | **Yes**           |
| `security definer` fns | the single definition of client access     | **Yes**           |
| Table grants        | 🔒 rows (`revoke update, delete`)             | **Yes**           |
| Server Actions      | input validation + explicit ownership checks  | Defense in depth  |
| Route layouts       | admin-only route groups                       | UX                |
| Client components   | hiding unusable controls                      | UX only           |

**Nothing in the bottom three rows may be the only thing standing between a user and a
record.**

---

## 12. Test obligations

Every ❌ and 🔒 above is a test case. The non-negotiable set:

1. `sales_b` reads `sales_a`'s client → 0 rows (UI **and** direct Supabase query)
2. `mentor_b` reads `mentor_a`'s client → 0 rows (both levels)
3. `sales_b` reads `sales_a`'s client's deposits → 0 rows
4. `sales_b` reads `sales_a`'s client's calendar events → 0 rows
5. `sales_b` reads `sales_a`'s client's tasks → 0 rows
6. `sales_b` reads `sales_a`'s client's audit entries → 0 rows
7. `sales_a` sets own `role = 'admin'` → rejected
8. `sales_a` sets own `is_active` → rejected
9. `sales_b` sets `sales_owner_id = self` on any client → rejected
10. `sales_a` updates a `deposits` row → rejected
11. `sales_a` deletes a `deposits` row → rejected
12. `admin` updates an `audit_log` row → rejected
13. `admin` deletes an `audit_log` row → rejected
14. Any user updates a `client_ref` → rejected
15. `app.busy_ranges()` returns exactly two columns
16. Non-owner hitting `/clients/CL-000184` → no name in body, `<title>`, or metadata
17. `sales_a` creates a `company_meeting` → rejected
18. Any user deletes a client → rejected

Full specification in [TEST_PLAN.md](TEST_PLAN.md).
