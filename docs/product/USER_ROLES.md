# User Roles

> ## ⚠️ SUPERSEDED BY IMPLEMENTATION
>
> This document specified **three** roles. The shipped system has **six**, plus
> a `teams` table, because the "sales manager gap" recorded in Open Decision 1
> below was resolved rather than deferred.
>
> **Implemented roles:** `admin`, `sales_manager`, `sales`, `mentor_manager`,
> `mentor`, `finance` — see `supabase/migrations/0001_extensions_and_types.sql`.
>
> **Manager scope** is the team, not the company. A `sales_manager` reaches
> clients whose sales owner is on a team they manage, via `app.manages_user()`
> in `0008_authz_helpers.sql`. They do **not** receive user administration,
> global audit access, or unrestricted financial access.
>
> **Finance** reads financial records across all clients but is read-only on
> client records, and is the only non-admin role that may verify deposits.
>
> **Financial access is narrower than client access**: `can_access_financials()`
> deliberately excludes mentors. A mentor teaches; they do not need payment
> history.
>
> **This banner outranks the body.** Where §3 or §4 below still describes the
> three-role world — deposits for a mentor, most of all — the banner is what
> runs. `PERMISSIONS.md` is the six-role table, reconciled against
> `packages/db/src/access.ts`, and it is the one to read.
>
> The rest of this document remains accurate on ownership, provenance and
> lifecycle semantics.

Stored in `profiles.role` as a `user_role` enum — **server-side, never in JWT
metadata the user can edit**.

Companion documents: [PERMISSIONS.md](PERMISSIONS.md) (the action matrix),
[AUTHORIZATION.md](AUTHORIZATION.md) (the policies that enforce it).

---

## 1. Why only three

The access rule the business actually stated is ownership-based, not hierarchy-based:
a client belongs to a salesperson and a mentor, and those two people plus admins can
see it. That needs three roles. Adding a fourth speculatively would mean writing RLS
policies for a workflow nobody has described yet.

The gap this creates is recorded honestly in §6.

## 2. `admin`

**Who:** operations lead, business owner, a small number of people.

**Sees:** everything. All clients regardless of ownership, all deposits, all events,
all tasks, all audit history.

**Does:**

- Creates, deactivates, and role-changes users
- Assigns and **reassigns** `sales_owner_id` and `mentor_owner_id` — the only role that
  can move ownership freely
- Creates and edits programs
- Creates company-wide calendar events (`company_meeting`, `internal_training`)
- Reverses a conversion (with a recorded reason)
- Merges duplicate clients
- Reads the audit log in full
- Edits company settings

**Cannot:**

- Edit or delete a `deposits` row — corrections are adjustment entries
- Edit or delete an `audit_log` row
- Delete a client or a profile

> Admins are not exempt from immutability. `force row level security` on `clients`,
> `deposits`, and `audit_log` means the table owner is subject to policy too.

**Population:** keep it small. Every admin is a full read of every client's personal
and financial data.

## 3. `sales`

**Who:** the salespeople who source and qualify leads.

**Sees:** clients where `sales_owner_id = auth.uid()`. Plus company calendar events,
the user directory (names and roles), programs, and their own tasks.

**Does not see:** another salesperson's clients. Not in a list, not in search, not by
direct URL, not through deposits, events, tasks, or audit. The rows do not exist for
them.

**Does:**

- Creates leads (`created_by` and `sales_owner_id` both become them)
- Edits their own clients' details and status through the pre-conversion lifecycle
- Records deposits against their own clients
- Creates sales calls and client appointments for their own clients
- Requests mentor assignment (see §5 and the open decision in
  [AUTHORIZATION.md](AUTHORIZATION.md))
- Manages their own tasks
- Sees mentor **busy ranges** for scheduling — times only, never titles or clients

**Cannot:**

- Reassign `sales_owner_id` or `mentor_owner_id` — not to themselves, not to anyone
- See or edit another salesperson's client
- Create company-wide events
- Change their own role or active flag
- Edit or delete deposits
- Access `/settings/users` or `/audit`

**Permanence:** a salesperson's `created_by` credit on a client is permanent. It
survives conversion, mentor assignment, and reassignment. Priya stays on `CL-000184`
forever.

## 4. `mentor`

**Who:** the mentors who teach converted students.

**Sees:** clients where `mentor_owner_id = auth.uid()`. Plus company events, the
directory, programs, and their own tasks.

**Does not see:** clients assigned to another mentor, or leads nobody has assigned them.

**Does:**

- Reads and edits assigned clients' student-side data
- Manages `enrollments` for assigned clients — program, cohort, progress, completion
- Creates mentor sessions and reviews for assigned clients
- Manages their own tasks
- Is recorded as `converted_by` when they close a conversion

**Cannot:**

- See an unassigned client, or another mentor's client
- **See money at all.** Not a deposit, not a total, not the Deposits page. The
  banner at the top of this document is the decision, and
  `canAccessFinancials` in `packages/db/src/access.ts` is where it lives.
- Reassign ownership
- Create company-wide events
- Change their own role
- Access `/settings/users` or `/audit`

**Note on conversion:** a mentor becoming `converted_by` does not displace the sales
owner. Both credits coexist on the same row permanently.

## 5. Overlap: a client with two owners

A converted client has both a `sales_owner_id` and a `mentor_owner_id`. Both people
have full read and write access to that one record simultaneously.

```
        CL-000184  (Rahul)
        ├── sales_owner_id  = Priya   ──► full access
        ├── mentor_owner_id = Michael ──► full access
        ├── created_by      = Priya   ──► permanent credit, not an access grant
        └── converted_by    = Michael ──► permanent credit, not an access grant
```

**`created_by` and `converted_by` are provenance, not permission.** If Priya is later
reassigned off this client, she loses access but keeps the `created_by` credit and
stays visible in the audit trail. This distinction matters: the record of who did what
must outlive the current assignment.

The client detail page is one page for both owners — tabs, not separate views. Sales
lands on the Sales tab, mentors on the Student tab, but each can reach all of them.

## 6. Assignment and lifecycle rules

| Event                     | Effect                                                    |
| ------------------------- | --------------------------------------------------------- |
| Salesperson creates lead  | `created_by` and `sales_owner_id` = them                   |
| Admin assigns sales owner | `sales_owner_id` changes; audit row with before/after       |
| Mentor assigned           | `mentor_owner_id` set; status → `mentor_assigned`           |
| Conversion                | `converted_by` + `converted_at` stamped; status → `converted`|
| Sales reassignment        | `sales_owner_id` changes; **`created_by` untouched**        |
| Mentor reassignment       | `mentor_owner_id` changes; **`converted_by` untouched**     |
| User deactivated          | `is_active = false`; their clients need reassignment        |

**Deactivating a user does not orphan their clients.** The profile row stays (it is
referenced by `created_by` on historical records), and the deactivation flow must
prompt the admin to reassign the departing user's active clients. Until reassigned,
those clients are visible to admins only — which is correct, but should be surfaced as
a "needs attention" item on the admin dashboard rather than left silent.

## 7. Role changes

- Admin-only, through `/settings/users`.
- Enforced by the `profiles_update_self` `with check`, which pins `role` and
  `is_active` to their current values for self-updates. This is the role-escalation
  defense and it is a policy, not application logic.
- Every change writes a `role_change` audit row via trigger.
- Takes effect on the next request — the role is read from `profiles` on every policy
  evaluation, not cached in a token.
- **A role change does not move client ownership.** Promoting a salesperson to mentor
  leaves their `sales_owner_id` clients exactly where they are. Reassignment is a
  separate, deliberate action.

## 8. Seeded users for development and testing

[TEST_PLAN.md](TEST_PLAN.md) requires five accounts, and the permission suite is built
on them:

| User      | Role     | Purpose                                       |
| --------- | -------- | --------------------------------------------- |
| `admin`   | `admin`  | Full-access baseline                          |
| `sales_a` | `sales`  | Owns test clients                             |
| `sales_b` | `sales`  | **Must not** see `sales_a`'s clients          |
| `mentor_a`| `mentor` | Assigned to `sales_a`'s converted client      |
| `mentor_b`| `mentor` | **Must not** see `mentor_a`'s client          |

`sales_b` and `mentor_b` exist for one reason: to fail loudly if RLS regresses.

---

## Open decisions

1. **No `manager` role in v1.** A sales manager who needs to see their whole team's
   pipeline currently has to be an `admin` — which also grants user management, audit
   access, and every client's financial data. This is the least comfortable compromise
   in the design and the most likely first extension. When it is added it needs a
   `team_id` on `profiles` and an `app.manages(user_id)` helper joining the existing
   `can_access_client` predicate; the policy structure already accommodates it.

2. ~~**Mentor assignment permission.**~~ **Settled.** The sales owner sets the first
   mentor; only an admin moves the client to a different one. Two capabilities,
   `clients.assignMentor` and `clients.reassignMentor`, and `assignMentor` demands
   the second the moment the client already has a different mentor. The blanket
   reassignment ban stays intact. See `PERMISSIONS.md` §1.

3. **Mentor visibility before conversion.** A mentor currently sees a client the moment
   `mentor_owner_id` is set — i.e. at `mentor_assigned`, before conversion. That is
   intended (they need to see who they are about to take on), but it means mentors can
   see pre-conversion sales notes. If sales notes should stay private to sales, they
   need a separate table with its own policy rather than a column on `clients`.
