---
name: security
description: Authorization and data protection for the Trading Academy CRM — Supabase Auth, PostgreSQL Row Level Security as the enforcement layer, role and record-level permissions, server-side validation, audit logging, and preventing client-data leakage between sales owners and mentors. Use when touching auth, RLS policies, API routes, server actions, queries, roles, or anything that reads or writes client data.
---

# Security — Auth, RLS, and Authorization

## When to use

Any work touching authentication, authorization, RLS policies, API routes, server
actions, Supabase queries, roles, permissions, environment variables, or data that
belongs to a specific client. In practice: nearly every backend change.

## Principle: the database is the security boundary

**Never trust frontend checks.** A React permission check hides a button. It does not
protect a row. Anyone can open devtools, call the API directly, or craft a Supabase
query from the console.

Authorization lives in **PostgreSQL Row Level Security**. Everything above it — server
actions, API routes, React guards — is defense in depth and UX, never the guarantee.

## The access rule

A client record is accessible to exactly:

| Who                  | Condition                       |
| -------------------- | ------------------------------- |
| Admin                | always                          |
| Assigned Sales Owner | `sales_owner_id = auth.uid()`   |
| Assigned Mentor      | `mentor_owner_id = auth.uid()`  |

- Another salesperson: **no access**.
- Another mentor: **no access**.
- No access means the row does not exist as far as that user's queries are concerned.

Every table carrying client-derived data (deposits, calendar events, tasks, enrollments,
audit entries) inherits this rule through its `client_id`.

## Responsibilities

1. Enable RLS on every table and write policies before the table carries data.
2. Keep role determination server-side and untamperable.
3. Validate and authorize on the server for every mutation.
4. Keep secrets out of the client bundle.
5. Ensure denial leaks nothing.
6. Make privileged actions auditable.

## Rules

### RLS

- `alter table ... enable row level security` on **every** table in the public schema,
  including lookup and join tables. A table without RLS is publicly readable through
  the anon key.
- Also `force row level security` on sensitive tables so the table owner is not exempt.
- Write **separate policies per operation** — `select`, `insert`, `update`, `delete`.
  A single `for all` policy almost always grants more than intended.
- Policies are created in the **same migration** as the table. A table must never exist
  in any environment without its policies.
- Encapsulate the access rule in a `security definer` helper function
  (e.g. `can_access_client(client_id uuid)`) with a locked `search_path`, and call it
  from policies so the rule is defined once.
- Role lookup inside policies reads the server-side profile table, not a JWT claim the
  client can set.
- `insert` and `update` policies need `with check` as well as `using` — otherwise a
  user can reassign a row to themselves or hand it to someone else.
- Index every column an RLS predicate tests.

### Roles

- Roles: `admin`, `sales`, `mentor`. Stored in a server-controlled profile table.
- **Role is never read from client-supplied data**, never from `user_metadata` the user
  can update, and never from a request header or body.
- Role changes are admin-only, audited, and take effect server-side immediately.
- No role escalation path: a user must not be able to update their own role row.
  Enforce with an RLS policy, not application logic.

### Supabase keys

- The `service_role` key bypasses RLS entirely. It must **never** appear in client
  code, in any `NEXT_PUBLIC_*` variable, in a client component, or in a response body.
- Server-only usage of `service_role` is exceptional, justified in a comment, and
  paired with its own explicit authorization check — because RLS is not protecting it.
- The anon key is public by design; it is safe **only** because RLS is correct. Treat
  every RLS gap as a public data leak.
- Never commit `.env` files. Keep `.env.example` with names and no values.

### Server-side authorization

- Every server action and API route re-derives the user from the session on the server.
  Never accept a `userId`, `role`, or `ownerId` from the request body.
- Validate every input with a schema (Zod or equivalent) at the server boundary before
  it reaches the database.
- Authorize the specific action, not just authentication: "is logged in" is not
  "may convert this client".
- Ownership-changing operations (assign, reassign, convert) get explicit checks in
  addition to RLS.
- Use parameterized queries and the Supabase client's builders. If raw SQL is ever
  necessary, parameterize it — never interpolate user input.
- Rate-limit auth endpoints, search, and anything expensive.

### Denial behavior

- An inaccessible record returns the same response as a nonexistent one. Do not
  distinguish 403 from 404 to the user.
- Error messages, page titles, breadcrumbs, and metadata must not echo data from a
  record the user cannot see.
- Server logs may record the attempt with detail; the response must not.
- Availability lookups return busy time ranges only — never titles, clients, or notes
  from another owner's events.

### Sensitive data

- Personal data (name, email, phone, financial records) is returned only to users
  entitled to it. Select explicit columns; avoid `select *` on client tables.
- Do not log personal or financial data, tokens, or full request bodies.
- Do not put client identifiers or personal data in URL query strings where avoidable;
  never in third-party analytics.
- Uploaded files in Supabase Storage need bucket policies mirroring the client access
  rule. Storage RLS is separate from table RLS and must be written explicitly.
- Use signed, short-lived URLs for private files. No public buckets for client documents.

### Auditing

- Log to `audit_log` via database triggers: client creation, status changes, ownership
  assignment and reassignment, conversion, deposit entry, role changes, and permission
  changes.
- Records include actor, entity, action, before/after values, and timestamp.
- Append-only — no update or delete grants, for anyone.
- Failed authorization attempts are logged server-side for review.

### Sessions

- Use Supabase Auth session handling with httpOnly cookies via the SSR helpers.
  Do not store tokens in `localStorage`.
- Refresh and revalidate on the server; treat any client-held claim as untrusted input.
- Sign-out must clear the session server-side.

## Anti-patterns

- Enforcing visibility only with `if (user.role === 'admin')` in React.
- `.eq('sales_owner_id', userId)` in the client as the only scoping — trivially removed.
- A table without RLS, "we'll add it later".
- One `for all` policy standing in for four.
- `using` without a matching `with check` on insert/update.
- Reading role from `user_metadata`, a JWT claim, or a request body.
- `service_role` key in a `NEXT_PUBLIC_` variable or any client-reachable code.
- A 403 that reveals the client's name, or a 404 whose page title contains it.
- Availability endpoints returning full event objects.
- Logging request bodies containing personal or financial data.
- Public Storage buckets for client documents.
- Audit rows that admins can edit or delete.
- Trusting `redirect` or `next` parameters without validation.
- Raw SQL built by string interpolation.

## Quality checklist

- [ ] RLS enabled (and forced where appropriate) on every public-schema table.
- [ ] Separate `select` / `insert` / `update` / `delete` policies per table.
- [ ] `with check` present on every insert and update policy.
- [ ] Access rule centralized in a `security definer` function with a fixed `search_path`.
- [ ] Role read only from the server-side profile table; self-role-update blocked by policy.
- [ ] RLS predicate columns indexed.
- [ ] Policies shipped in the same migration as their table.
- [ ] `service_role` key absent from all client-reachable code and public env vars.
- [ ] Every server action re-derives the user server-side and validates input by schema.
- [ ] Ownership-changing actions have explicit authorization checks.
- [ ] Denial is indistinguishable from nonexistence; no data echoed in errors or metadata.
- [ ] Availability responses carry busy ranges only.
- [ ] Storage bucket policies mirror the client access rule; private files use signed URLs.
- [ ] Audit triggers cover creation, status, ownership, conversion, deposits, roles.
- [ ] Audit table append-only with no update/delete grants.
- [ ] **Verified empirically**: a second sales user cannot read the first's client via
      the API or a direct Supabase query. A mentor cannot read an unassigned client.
      Tested, not assumed.
