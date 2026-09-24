# Permissions Matrix

The authoritative action-by-action permission table. Roles are defined in
[USER_ROLES.md](USER_ROLES.md).

**This table is the six-role model, and it matches `packages/db/src/access.ts`.**
The implementation is the one thing that runs, so the matrix below is written from
it. `STACK_MAPPING.md` §2 says why there is no RLS on this stack: Prisma connects as
one database role, so authorization lives in one server module that every tRPC
procedure calls. References to `supabase/migrations/` and to RLS policies are
historical — read them as "the access module".

**Legend**

| Symbol | Meaning |
| ------ | ------- |
| ✅ | Permitted |
| 🔶 | Permitted **only for records they own** (`salesOwnerId` or `mentorOwnerId` = them, or a team they manage) |
| ❌ | Denied — and for reads, denial means *the row does not exist*, not an error |
| 🔒 | Denied to **everyone**, including admins |

Every ✅/🔶 in this table maps to a capability in `packages/db/src/access.ts`, and
every ❌ has a negative test in `apps/api/test/`.

**The six roles.** `ADMIN` · `SALES_MANAGER` · `SALES` · `MENTOR_MANAGER` ·
`MENTOR` · `FINANCE`. A manager is scoped to the members of a team they manage, so
every 🔶 for a manager means "their own and their team's". Columns below fold the two
manager roles into their side; where a manager differs, the cell says so.

---

## 1. Clients

| Action                                  | Admin | Sales | Mentor | Finance |
| --------------------------------------- | :---: | :---: | :----: | :-----: |
| List clients                            | ✅ all | 🔶 own | 🔶 assigned | ✅ all, read only |
| View client detail                      | ✅ | 🔶 | 🔶 | ✅ read only |
| Search clients (name, `CL-000184`, email)| ✅ | 🔶 | 🔶 | ✅ |
| Create lead                             | ✅ | ✅ | ❌ | ❌ |
| Edit client details                     | ✅ | 🔶 | 🔶 | ❌ |
| Change status forward                   | ✅ | 🔶 | 🔶 | ❌ |
| Change status backward (pre-conversion) | ✅ | 🔶 + reason | 🔶 + reason | ❌ |
| Change status backward (post-conversion)| ✅ + reason | ❌ | ❌ | ❌ |
| Become a student (`CONVERTED → STUDENT`) | 🔒 — enrol instead, §3 | 🔒 | 🔒 | 🔒 |
| Assign / change `salesOwnerId`          | ✅ | ❌, manager 🔶 | ❌ | ❌ |
| Assign `mentorOwnerId` (first time)     | ✅ | 🔶 | ❌ | ❌ |
| Change `mentorOwnerId` (reassign)       | ✅ | ❌ | ❌ | ❌ |
| Convert                                 | ✅ | ❌ | 🔶 | ❌ |
| Reverse a conversion                    | ✅ + reason | ❌ | ❌ | ❌ |
| Convert again after a reversal          | ✅ | ❌ | 🔶 | ❌ |
| Edit `clientRef`                        | 🔒 | 🔒 | 🔒 | 🔒 |
| Edit `createdById`                      | 🔒 | 🔒 | 🔒 | 🔒 |
| Edit `convertedById` / `convertedAt`    | 🔒 | 🔒 | 🔒 | 🔒 |
| Delete a client                         | 🔒 | 🔒 | 🔒 | 🔒 |

**Sales assigns the first mentor; only an admin moves the client to a different
one.** `clients.assignMentor` is held by admin, sales and sales manager.
`clients.reassignMentor` is held by admin alone, and `assignMentor` demands it the
moment the client already has a different mentor. This settles the open decision in
`AUTHORIZATION.md` §Open 1: the sales owner may ask for a mentor without waiting for
an admin, and the blanket ban on moving ownership stays intact.

**A conversion happens once and the stamp is permanent.** `client_guard_immutable`
refuses any change to `convertedAt` or `convertedById` once they are set. An admin
may walk a converted client back to `MENTOR_ASSIGNED` with a reason; the stamp
survives that, and converting again does not write a second one. The status history
records both moves.

**`CONVERTED → STUDENT` is not a status change.** `clients.setStatus` refuses it, and
`client_student_needs_enrollment` refuses it at the database too. A client becomes a
student by being enrolled on a programme, in one transaction — see §3.

**Cross-owner denial — the core assertions:**

- `sales_b` querying `sales_a`'s client → **0 rows**, at the API level, not just the UI
- `mentor_b` querying `mentor_a`'s client → **0 rows**
- Direct URL `/clients/CL-000184` for a non-owner → not-found, with **no name in the
  response body, page title, or metadata**

## 2. Deposits

**A mentor never sees money.** This was the one place where this document and
`packages/db/src/access.ts` disagreed, and it is settled in favour of the narrower
rule, because `USER_ROLES.md` states it as a decision already taken: *"Financial
access is narrower than client access: `can_access_financials()` deliberately
excludes mentors. A mentor teaches; they do not need payment history."* Least
privilege agrees, and `FINANCE` — a role the three-role table predates — exists to
hold the money side. The table below is the implementation.

| Action                          | Admin | Sales | Mentor | Finance |
| ------------------------------- | :---: | :---: | :----: | :-----: |
| View deposits for a client      | ✅ | 🔶 sales-owned | ❌ | ✅ all |
| View global deposits list       | ✅ | 🔶 own clients only | ❌ | ✅ all |
| Record a payment                | ✅ | 🔶 | ❌ | ✅ |
| Record a refund / adjustment    | ✅ | ❌ | ❌ | ✅ |
| Verify an entry                 | ✅ | ❌ | ❌ | ✅ |
| Edit a deposit row              | 🔒 | 🔒 | 🔒 | 🔒 |
| Delete a deposit row            | 🔒 | 🔒 | 🔒 | 🔒 |
| View derived client total       | ✅ | 🔶 | ❌ | ✅ |

`canAccessFinancials` fails closed on the whole mentor side before it looks at
ownership, so a mentor assigned to a client reads that client and not its ledger.
The Deposits tab on the client record and the Deposits item in the navigation are
both hidden for a mentor, and `deposits.*` refuses a direct call with `FORBIDDEN`.

The ledger is append-only for **everyone**. `deposit_append_only` refuses every
`UPDATE` that changes a recorded field, `deposit_no_delete` refuses every `DELETE`,
and there is no update or delete procedure. Corrections are `ADJUSTMENT` entries
that reference the original, on the same client, enforced by
`deposit_corrects_same_client`. `deposit_ledger_currency` pins every row to `AED`,
because a derived total across two currencies is a wrong number.

## 3. Students and enrollments

| Action                          | Admin | Sales | Mentor | Finance |
| ------------------------------- | :---: | :---: | :----: | :-----: |
| List students                   | ✅ all | 🔶 own | 🔶 assigned | ✅ read only |
| View enrollment                 | ✅ | 🔶 | 🔶 | ✅ |
| Create enrollment               | ✅ | ❌ | 🔶 | ❌ |
| Edit enrollment / progress      | ✅ | ❌ | 🔶 | ❌ |
| Pause and resume                | ✅ | ❌ | 🔶 | ❌ |
| Mark completed / withdrawn      | ✅ | ❌ | 🔶 | ❌ |
| Reassign the enrolment's mentor | ✅ | ❌ | 🔶 | ❌ |
| Delete enrollment               | 🔒 | 🔒 | 🔒 | 🔒 |

Enrollments carry no personal data — only program, cohort, mentor, and progress.

**An enrolment is withdrawn, never deleted.** The three-role table gave an admin a
delete; it is withdrawn here, because every other history in this product is
immutable and because deleting the enrolment of a `STUDENT` would leave a student
with no enrolment — the exact state `client_student_needs_enrollment` exists to
prevent. `enrollment_no_delete` refuses it at the database.
`enrollment_guard_immutable` also pins `clientId`, `programId`, `enrolledAt` and
`createdById`: moving a student to a different programme is a withdrawal and a new
enrolment, so the history says what actually happened.

**One open enrolment per client.** `enrollment_one_open_per_client` is a partial
unique index on `("clientId") WHERE "closedAt" IS NULL`, and `enrollment_close_stamp`
maintains `closedAt` from the status. A paused enrolment still holds the slot, so a
second enrolment is refused while the first is on hold. Two concurrent enrolments
resolve to one row and one `409`.

**Enrolling is what makes a student.** `programs.enroll` writes the enrolment and
moves `CONVERTED → STUDENT` in one transaction, so the trigger that demands an active
enrolment sees it. `enrollment_needs_converted_client` refuses an enrolment for
anyone who has not converted, and `enrollment_is_academy` refuses one on the real
estate side.

## 4. Programs

| Action              | Admin | Sales | Mentor | Finance |
| ------------------- | :---: | :---: | :----: | :-----: |
| View programs       | ✅ | ✅ | ✅ | ✅ |
| Create program      | ✅ | ❌ | ❌ | ❌ |
| Edit program        | ✅ | ❌ | ❌ | ❌ |
| Retire program      | ✅ | ❌ | ❌ | ❌ |
| Delete program      | 🔒 | 🔒 | 🔒 | 🔒 |

Reference data. Retired rather than deleted — enrollments reference them, and
`program_no_delete` refuses the delete. A programme cannot be retired while anybody
is still on it: the procedure counts open enrolments and refuses with a `409` that
names the number.

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

| Layer | Enforces | Is the guarantee? |
| ----- | -------- | ----------------- |
| `packages/db/src/access.ts` | every 🔶 and ❌ in this document | **Yes** |
| Check constraints and triggers | 🔒 rows, and every invariant SQL can state | **Yes** |
| tRPC procedures | input validation, then one call into the access module | Defense in depth |
| Route layouts | admin-only route groups | UX |
| Client components | hiding unusable controls | UX only |

**Nothing in the bottom three rows may be the only thing standing between a user and a
record.**

There is no RLS on this stack. `STACK_MAPPING.md` §2 explains why, and what replaces
it: one module, called by every read and every write, with a test that greps for
procedures that skip it — `apps/api/test/domain-guard.spec.ts`. It asserts that every
domain router carries `ActorMiddleware`, that every domain service builds its `where`
from `clientScope` or `eventScope`, that no service tests a role name of its own, that
no delete procedure exists on the ledger, and that every constraint and trigger this
document names is present in a migration. The database still carries every invariant it can express —
immutability, append-only, one-open-enrolment, the conversion chain — as constraints
and triggers, so a bug in the application cannot corrupt a row.

---

## 12. Test obligations

Every ❌ and 🔒 above is a test case. The non-negotiable set:

1. `sales_b` reads `sales_a`'s client → not found, in the list and by reference
2. `mentor_b` reads `mentor_a`'s client → not found
3. `sales_b` reads `sales_a`'s client's deposits → not found
4. A mentor reads any client's deposits → forbidden, on their own client too
5. `sales_b` reads `sales_a`'s client's calendar events → not found
6. `sales_b` reads `sales_a`'s client's status history → not found
7. `sales_a` sets own `role = ADMIN` → rejected
8. `sales_a` sets own `isActive` → rejected
9. `sales_b` sets `salesOwnerId = self` on any client → rejected
10. Sales moves a client to a different mentor → rejected
11. Any user updates a `deposit` row → rejected
12. Any user deletes a `deposit` row → rejected
13. Any user updates a `clientRef` → rejected
14. Any user deletes a client → rejected
15. Any user deletes an enrolment or a programme → rejected
16. A second open enrolment on one client → rejected
17. A status move straight to `STUDENT` → rejected, at the API and at the database
18. An enrolment for a client who has not converted → rejected at the database
19. A client entered straight as a `STUDENT` → rejected at the database
20. Busy ranges return times only, never a title or a client
21. Non-owner hitting `/clients/CL-000184` → no name in body, `<title>`, or metadata
22. A salesperson creates a company event → rejected
23. A member who is not a workspace admin writes a workspace setting → rejected

Full specification in [TEST_PLAN.md](TEST_PLAN.md).
