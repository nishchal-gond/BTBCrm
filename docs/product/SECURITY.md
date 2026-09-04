# Security

Covers everything around the authorization boundary: threat model, secrets, sessions,
input handling, denial behavior, storage, and auditing.

The boundary itself — RLS policy design — is in [AUTHORIZATION.md](AUTHORIZATION.md).
The action matrix is in [PERMISSIONS.md](PERMISSIONS.md).

---

## 1. What is being protected

| Asset | Sensitivity | Consequence of exposure |
| ----- | ----------- | ----------------------- |
| Client personal data (name, email, phone, country) | High | Privacy breach; UAE PDPL exposure |
| Client financial records (`deposits`) | High | Financial privacy breach |
| Ownership relationships | Medium | Reveals commercial structure, enables poaching |
| Calendar event content | Medium | Reveals client relationships and business activity |
| User roles and directory | Low | Names and roles are internal-public |
| Audit log | High | Reveals the full history of everything above |

The primary adversary is not an anonymous internet attacker. It is **an authenticated
salesperson trying to see another salesperson's book** — a motivated insider with valid
credentials, a browser devtools console, and the public anon key.

## 2. Threat model

| # | Threat | Mitigation | Where |
| - | ------ | ---------- | ----- |
| T1 | Sales B queries Sales A's clients via the Supabase JS client directly, bypassing the UI | RLS `clients_select` | [AUTH §4.2](AUTHORIZATION.md) |
| T2 | Sales B reaches client data indirectly through `deposits`, `calendar_events`, `tasks`, or `audit_log` | Every dependent table's policy calls `app.can_access_client()` | [AUTH §4](AUTHORIZATION.md) |
| T3 | User escalates their own role to `admin` | `profiles_update_self` `with check` pins `role` and `is_active` | [AUTH §4.1](AUTHORIZATION.md) |
| T4 | User reassigns a client to themselves | `clients_update` `with check` (or `before update` trigger) blocks non-admin ownership change | [AUTH §4.2](AUTHORIZATION.md) |
| T5 | `service_role` key leaks to the browser, bypassing all RLS | Key never in a `NEXT_PUBLIC_*` var or client component; CI grep gate | §4 |
| T6 | Availability lookup leaks another owner's client meetings | `app.busy_ranges()` returns two columns only | [AUTH §4.5](AUTHORIZATION.md) |
| T7 | 403/404 page leaks the client's name in body, `<title>`, or OG metadata | Denial is indistinguishable from nonexistence; metadata resolved after the access check | §7 |
| T8 | Server Action trusts a `userId` or `role` from the request body | User re-derived from the session server-side, always | §6 |
| T9 | Financial history rewritten to hide a mistake | No `update`/`delete` policy on `deposits`; grants revoked | [AUTH §4.3](AUTHORIZATION.md) |
| T10 | Audit trail edited to hide an action | No `update`/`delete` on `audit_log` for anyone; written by trigger | [AUTH §4.10](AUTHORIZATION.md) |
| T11 | New table shipped without RLS, world-readable via anon key | Policies in the same migration as the table; CI check for RLS-less tables | §3 |
| T12 | Client documents in Storage readable by URL | Bucket policies mirror the client rule; signed short-lived URLs; no public buckets | §9 |
| T13 | Session token stolen from `localStorage` by XSS | httpOnly cookies via Supabase SSR helpers; tokens never in JS-readable storage | §5 |
| T14 | `security definer` helper hijacked via `search_path` | Every such function sets `search_path = ''` and fully qualifies names | [AUTH §3.1](AUTHORIZATION.md) |
| T15 | Client enumeration via sequential `client_ref` in the URL | Accepted risk — RLS returns nothing; see §8 | §8 |
| T16 | Credential stuffing / brute force on login | Supabase Auth rate limits + application rate limit on auth routes | §5 |

## 3. RLS as a shipping gate

Rules that are not negotiable:

- **RLS is enabled on every table in `public`.** Including lookup tables. A table
  without RLS is readable by anyone holding the anon key, which is published in the
  client bundle by design.
- **Policies ship in the same migration as the table.** There must never be a window,
  in any environment, where a table exists without them.
- **CI gate:** a check that queries `pg_tables` for any `public` table with
  `rowsecurity = false` and fails the build. This is cheap and catches the single most
  dangerous mistake in the product.
- **Second CI gate:** fail if any table has an `insert` or `update` policy without a
  `with check` clause.

## 4. Secrets

| Key | Where it may appear | Where it must never appear |
| --- | ------------------- | -------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` | anywhere | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anywhere | — (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only modules, Vercel env | any `NEXT_PUBLIC_*` var, any client component, any response body, any log, any commit |
| `MAPBOX_TOKEN` | client (URL-restricted token) | — (must be domain-scoped in the Mapbox console) |

**The anon key is safe only because RLS is correct.** It is not a secret and must not
be treated as one; treating it as a secret creates false confidence. Every RLS gap is a
public data leak, full stop.

**`service_role` bypasses RLS entirely.** Its use is exceptional. Every call site must:

1. live in a server-only module (marked `import 'server-only'`),
2. carry a comment justifying why RLS cannot serve the case,
3. perform its own explicit authorization check, because nothing else is protecting it.

Expected legitimate uses in v1: the dev seed script, and possibly the duplicate-merge
operation. Nothing else.

**CI gate:** grep the built client bundle for the service-role key pattern and for
`SUPABASE_SERVICE_ROLE`; fail on any hit.

`.env*` is gitignored. `.env.example` carries names and empty values only.

## 5. Authentication and sessions

- Supabase Auth with email/password. Session in **httpOnly, secure, sameSite=lax
  cookies** via the Supabase SSR helpers.
- **Tokens are never in `localStorage` or `sessionStorage`** — that is the difference
  between an XSS being a bug and an XSS being an account takeover.
- Session is validated **on the server** on every request. A client-held claim is
  untrusted input.
- Middleware refreshes the session and redirects unauthenticated requests to `/login`.
  Middleware handles **authentication only** — authorization is RLS.
- Sign-out clears the session server-side, not just the cookie client-side.
- Password reset via Supabase's flow; reset tokens single-use and short-lived.
- Rate limiting on `/login`, `/forgot-password`, and client search. Supabase provides
  baseline auth limits; the application adds its own on the search endpoint, which is
  the cheapest enumeration vector.
- **MFA is not in v1.** Recorded as a gap, not an oversight — see §12.

## 6. Server-side authorization and input

Every Server Action and Route Handler:

1. **Re-derives the user from the session.** Never reads `userId`, `role`, `ownerId`,
   or any identity claim from the request body, query string, or headers.
2. **Validates input with a Zod schema** — the same schema the client form uses, but
   the server's run is the authoritative one. Client validation is UX.
3. **Authorizes the specific action**, not just authentication. "Is logged in" is not
   "may convert this client".
4. **Adds an explicit ownership check** for operations that change ownership, status,
   or money — two independent gates on the operations that matter most.
5. Uses the Supabase query builders. Raw SQL, if ever necessary, is parameterized —
   never string-interpolated.

Additional input rules:

- Normalize and bound every string (trim, max length) before it reaches the database.
- Validate `redirect` / `next` parameters against an allowlist of internal paths.
- Reject unexpected fields rather than ignoring them (`.strict()` on schemas), so a
  crafted body cannot smuggle `sales_owner_id` into an update.

## 7. Denial behavior

**A record the user cannot access must be indistinguishable from one that does not
exist.**

- Same response for "no access" and "not found". No 403-vs-404 distinction reaches the
  user.
- The error page, page `<title>`, breadcrumbs, and OpenGraph metadata contain **no data
  from the record**. This means metadata must be generated *after* the access check
  resolves, not from a separate unguarded query — a common and easy leak.
- Search returns no hint that a matching record exists elsewhere. No "1 result hidden".
- Server logs may record the attempt with full detail. The response may not.
- Failed authorization attempts are logged server-side for review.

## 8. Accepted risk: sequential client refs in URLs

`/clients/CL-000184` is chosen over a UUID because operators paste these references
into tickets, messages, and browser bars, and the ref is the product's identity concept.

**The exposure:** refs are sequential, so an authenticated user can infer the total
number of clients in the system by probing.

**Why it is accepted:** RLS returns nothing for records they do not own, so probing
yields a count, not data. Total client count is not sensitive to an employee.

**Conditions on the acceptance:**

- Denial must be uniform (§7) — a different response for "exists but denied" would turn
  a count inference into a targeted enumeration.
- Rate limiting on the client detail route.
- If the product ever serves multiple tenants, this decision must be revisited before
  that ships.

## 9. Storage

- Client documents live in a **private** bucket. No public buckets, ever.
- **Storage RLS is separate from table RLS and must be written explicitly** — enabling
  RLS on `clients` does nothing for `storage.objects`. Bucket policies mirror the
  client access rule by parsing `client_id` from the object path and calling
  `app.can_access_client()`.
- Object paths are `clients/{client_id}/{uuid}-{filename}` — `client_id` in the path is
  what the policy tests.
- Downloads use **signed URLs with a short expiry**, generated server-side after an
  access check.
- Uploads are validated for content type and size server-side. Filenames are sanitized;
  the stored name is a UUID, with the original kept as metadata.

## 10. Data handling

- Select **explicit columns**. No `select *` on `clients` or `calendar_events` — it
  makes every future column a potential leak.
- **Never log** personal data, financial amounts, tokens, session cookies, or full
  request bodies. Log identifiers and outcomes.
- **Never put** client identifiers or personal data in URL query strings where
  avoidable, and never in third-party analytics or error-tracking payloads.
- If error tracking is added, scrub `email`, `phone`, `first_name`, `last_name`,
  `amount`, and cookie headers before send.
- No client data in a shared or CDN cache — see [PERFORMANCE.md](PERFORMANCE.md).
  A shared cache holding scoped data is a cross-user leak, not a performance detail.

## 11. Auditing

Written by `security definer` triggers, so no application path can skip it. Covers:
client creation, status change, ownership assignment and reassignment, conversion,
conversion reversal, deposit entry, enrollment change, role change, user deactivation.

Each row records actor, entity, action, before/after values, timestamp, and reason
where required.

**Append-only for everyone including admins.** `insert, update, delete` revoked from
`authenticated`; no policies exist for those operations. An admin who can rewrite the
audit trail is an audit trail that proves nothing.

Retention: indefinite in v1. Audit rows are small and the table is append-only; a
retention policy can be added later without schema change.

## 12. Known gaps in v1

Stated plainly rather than left implicit:

1. **No MFA.** Password-only authentication for accounts that can read every client's
   personal and financial data. This is the largest security gap in v1. Supabase Auth
   supports TOTP; enabling it for `admin` accounts should be the first
   post-launch security item.
2. **No IP allowlisting or device binding.** A stolen password is full access.
3. **No field-level encryption.** Personal and financial data is protected by RLS and
   Supabase's at-rest encryption, not by application-level encryption. Adequate for the
   threat model; would not be for cardholder data, which this product does not store.
4. **No automated PDPL/GDPR erasure flow.** Erasure would need an anonymize-in-place
   design preserving `client_ref` and the ledger. Not designed.
5. **No penetration test.** The RLS suite in [TEST_PLAN.md](TEST_PLAN.md) is thorough
   for the modeled threats; it is not a substitute for adversarial testing by someone
   who did not write the policies.
6. **Holiday-aware market sessions are out of scope**, so globe session state can be
   wrong on exchange holidays. Not a security issue, listed here because it is a
   correctness gap that looks like one to a user.

## 13. Pre-launch checklist

- [ ] RLS enabled on all 11 `public` tables; CI gate in place
- [ ] `force row level security` on `clients`, `deposits`, `audit_log`
- [ ] Every `insert`/`update` policy has a `with check`; CI gate in place
- [ ] All RLS predicate columns indexed
- [ ] `service_role` absent from the client bundle; CI grep gate in place
- [ ] All `security definer` functions set `search_path = ''` and fully qualify names
- [ ] `update, delete` revoked on `deposits` and `audit_log`
- [ ] Self-role-change blocked and tested
- [ ] Non-admin ownership change blocked and tested
- [ ] `busy_ranges` returns exactly two columns
- [ ] Denial uniform; no data in error body, `<title>`, or metadata
- [ ] Storage bucket private, policies written, signed URLs only
- [ ] Rate limits on auth routes and client search
- [ ] `.env` gitignored; no secrets in git history
- [ ] Audit triggers cover all nine event types
- [ ] Full permission suite from [TEST_PLAN.md](TEST_PLAN.md) passing, **including the
      direct-Supabase level**
- [ ] Known gaps in §12 reviewed and accepted by the business, in writing
