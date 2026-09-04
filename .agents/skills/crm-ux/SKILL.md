---
name: crm-ux
description: Lead-to-client-to-student lifecycle UX for the Trading Academy CRM — one permanent Client ID, ownership preservation through conversion, client detail tabs, pipeline views, assignment flows, and audit visibility. Use when building or reviewing Leads, Clients, Students, Sales Team, Mentors, Programs, Deposits, or any conversion or assignment interaction.
---

# CRM UX — Lead → Client → Student

## When to use

Any work on Leads, Clients, Students, Sales Team, Mentors, Programs, Deposits, or the
conversion and assignment flows that connect them.

## Principle: one person, one ID, forever

```
Lead → Qualified Lead → Mentor Assigned → Converted → Student
```

This is a **status progression on a single record**, not a migration between tables.
Rahul the lead and Rahul the student are the same row, the same `CL-000184`, the same
history. The UI must make this obvious — a user should never wonder whether they are
looking at a duplicate.

## Responsibilities

1. Keep the Client ID permanent, prominent, and constant across every view.
2. Preserve and display the full ownership chain through conversion.
3. Make conversion a confident, well-explained, auditable action.
4. Give every client a single detail page that serves sales, mentors, and admins.
5. Prevent duplicate people at the point of entry.

## Rules

### Client ID

- Format `CL-000184`. Monospace, everywhere, always.
- Visible on the client detail header, in list rows, in search results, on deposits,
  on calendar events that reference a client, and in audit entries.
- Copyable with one click.
- Never changes. Never regenerated. Not derived from status.
- Searchable directly — typing `CL-000184` or `184` finds the person.

### Ownership fields — always visible, never lost

| Field             | Displayed as                          |
| ----------------- | ------------------------------------- |
| `created_by`      | "Created by Priya · 12 Mar 2026"      |
| `sales_owner_id`  | "Sales owner: Priya"                  |
| `mentor_owner_id` | "Mentor: Michael"                     |
| `converted_by`    | "Converted by Michael"                |
| `converted_at`    | "Converted 04 Apr 2026, 14:22 GST"    |

- Conversion **adds** mentor and conversion fields. It never clears `created_by` or
  `sales_owner_id`. Priya keeps her credit permanently.
- Reassignment changes the current owner but is recorded in the audit log with the
  previous owner, the new owner, who did it, and when.
- Unassigned ownership is an explicit, visible state (`Unassigned`) with an action to
  fix it — not a blank cell.

### Client detail page

One page, six tabs:

- **Overview** — identity, Client ID, status, ownership chain, contact details, key
  dates, program, deposit total (derived), next scheduled event.
- **Sales** — lead source, qualification notes, pipeline stage history, sales
  activities, conversion record.
- **Student** — enrolled program, cohort, mentor, progress, session history. Present
  but clearly inactive for pre-conversion clients — not hidden, so the path is visible.
- **Deposits** — transaction list (date, amount with `AED`, method, reference,
  recorded by), with the derived total displayed above it. Individual records are
  immutable; corrections are adjusting entries.
- **Schedule** — calendar events referencing this client, past and upcoming.
- **Activity** — the audit trail: status changes, ownership changes, field edits,
  deposits, with actor and timestamp.

Header persists across tabs: name, `CL-000184`, status badge, sales owner, mentor,
primary actions.

### Status and conversion

- Status is a single visible badge with a consistent color-plus-word treatment.
- The conversion action is deliberate: a dialog that states what will change
  (status → Converted, mentor recorded, `converted_by` and `converted_at` stamped),
  confirms the mentor assignment, and requires explicit confirmation.
- The dialog must say plainly: *this does not create a new record; the client keeps
  `CL-000184`.*
- Conversion is auditable and reversible only by an admin, with a reason recorded.
- Backward status moves are possible but logged and require a reason.

### Duplicate prevention

- On lead creation, check email and phone against existing clients **before** insert
  and surface a match inline: "A client with this email already exists — `CL-000184`,
  Rahul S., sales owner Priya." Offer to open it.
- The database enforces this too (unique constraints / partial indexes). The UI check
  is convenience; the constraint is the guarantee.
- Provide an admin merge flow that preserves the older Client ID and moves history,
  rather than deleting either record.

### Lists and pipeline

- Dense tables with sticky headers, aligned monospace numerics, saved filters, and
  column choice. Row hover reveals quick actions.
- Default sort favors urgency (oldest untouched lead, nearest deadline), not
  alphabetical.
- Bulk assignment is available to admins and clearly scoped — the selection count is
  shown in the confirm dialog.
- Kanban pipeline view is optional and secondary; the table is the primary tool for
  operators.
- Empty states name the filter that produced them and offer to clear it.

### Visibility in the UI

- The list a salesperson sees contains only their clients — because RLS returned only
  those rows, not because React filtered them.
- If a user reaches a client they cannot access, show a clean "not found or no access"
  state. Do not reveal that the record exists, who owns it, or any field of it.
- UI permission checks hide controls the user cannot use. They are never the
  enforcement.

### Deposits

- Always a list of transactions. The total is derived and labelled as derived.
- Each deposit: date (timezone-aware), amount `AED 25,000` monospace, method,
  reference, recorded-by, linked client `CL-000184`.
- Never expose an editable "total deposits" field.

## Anti-patterns

- Creating a student record on conversion, leaving the lead behind.
- A separate `students` table duplicating name, email, and phone.
- Losing `created_by` or `sales_owner_id` when a mentor is assigned.
- A Client ID that changes with status, or that is a raw UUID shown to users.
- Client ID in a proportional font, misaligned in table columns.
- Ownership shown only on an admin screen.
- A one-click conversion with no confirmation and no audit entry.
- Blank cells for unassigned ownership.
- Fetching all clients and filtering by owner in the browser.
- A 404 page that leaks the client's name.
- Separate detail pages for "lead view" and "student view" of the same person.
- A mutable deposit total column.
- Alphabetical default sort on an operational work queue.

## Quality checklist

- [ ] Conversion changes status on the existing row and creates no second person record.
- [ ] `CL-000184` is monospace, permanent, prominent, copyable, and searchable.
- [ ] `created_by`, `sales_owner_id`, `mentor_owner_id`, `converted_by`, `converted_at`
      all preserved and visible after conversion.
- [ ] Conversion dialog explains the change and states the ID is retained.
- [ ] Every status and ownership change written to the audit log with actor and time.
- [ ] Client detail has Overview / Sales / Student / Deposits / Schedule / Activity
      with a persistent header.
- [ ] Duplicate detection on create, backed by a database constraint.
- [ ] Lists scoped by RLS, not by client-side filtering.
- [ ] No-access state reveals nothing about the record.
- [ ] Deposits are transactions; totals derived and labelled.
- [ ] Currency shows `AED`; all IDs, amounts, and times monospace.
- [ ] Timestamps timezone-aware, displayed in the viewer's or company timezone
      consistently and labelled.
- [ ] Tables dense, sortable, filterable, keyboard-navigable, with designed empty states.
