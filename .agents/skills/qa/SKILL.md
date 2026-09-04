---
name: qa
description: Verification standards for the Trading Academy CRM — functional correctness, RLS and permission testing with multiple real users, real-browser inspection, responsive checks, empty/loading/error state coverage, and regression testing with Playwright and Vitest. Use before claiming any work is complete, and whenever behavior needs to be proven rather than assumed.
---

# QA — Verify, Do Not Assume

## When to use

Before reporting any task complete. After any change to auth, RLS, ownership, money,
or timezone handling. Whenever a claim about behavior is about to be made.

## Principle: proof, not plausibility

Code compiling is not evidence it works. Types passing is not evidence the query
returns the right rows. A rendered UI is not evidence the permission holds.

**Run it. Look at it. Try to break it.** Then report what actually happened, including
what you did not test.

## Responsibilities

1. Verify functional behavior against the requirement, not against the implementation.
2. Prove permission boundaries with multiple real users.
3. Inspect UI in a real browser at real widths.
4. Cover the states nobody builds: empty, loading, error, stale, partial.
5. Protect against regression with automated tests on the paths that matter.

## Rules

### Permission and RLS testing — the highest priority

This is the test suite that matters most in this product.

Maintain at least five seeded test users: **admin**, **sales A**, **sales B**,
**mentor A**, **mentor B**.

For every client-scoped resource, assert:

- Sales A can read and update their own client.
- **Sales B cannot read Sales A's client** — not in a list, not by direct ID, not via
  search, not via a related resource (deposits, events, tasks, audit).
- Mentor A can read their assigned client.
- **Mentor B cannot read a client they are not assigned to.**
- Admin can read all.
- No user can change their own role.
- No user can reassign a client to themselves.

Test at **two levels**:

1. Through the UI, as each user.
2. **Directly against the API / Supabase client**, bypassing the React layer entirely.
   This is the test that proves RLS rather than a UI guard. A permission that only
   passes level 1 is not implemented.

Also assert that denial reveals nothing: no name in the error, the page title, or
metadata.

### Functional testing

- Test against the stated requirement. Re-read it before writing the assertion.
- **Conversion**: after converting, assert the client count did not increase, the
  `client_ref` is unchanged, and `created_by` / `sales_owner_id` are intact while
  `mentor_owner_id` / `converted_by` / `converted_at` are now set.
- **Deposits**: assert the derived total equals the sum of transactions after adding,
  and that no mutable total column is being written.
- **Duplicate prevention**: attempt to create a client with an existing email and phone;
  assert both the UI warning and the database constraint.
- **Timezones**: test across a DST boundary. A weekly 09:00 Dubai session and a weekly
  09:00 London session must both hold their local time after the London clocks change.
  Assert no hardcoded offsets exist (`grep` for them).
- **Calendar**: recurring edit scope (this / following / all), drag-to-move rollback on
  server rejection, availability payload contains no titles.
- Edge cases: empty strings, very long names, unicode names, leading/trailing
  whitespace, duplicate submissions, expired sessions mid-action, concurrent edits.

### Browser verification

For any significant UI work, in a real browser:

1. Run the app.
2. Load the page and look at it.
3. Check layout at ~1440, ~1024, ~390.
4. Perform the interaction — click, drag, type, submit, cancel.
5. Check the console for errors and warnings.
6. Check the network tab for failed, duplicated, or oversized requests.
7. Fix what is wrong.
8. Repeat until it is right.

A screenshot or a described observation is the evidence. "It should render correctly"
is not a QA result.

### State coverage

Every data surface, verified in all states:

- **Loading** — skeletons match the real layout; no full-page spinner; no layout shift
  when data arrives.
- **Empty** — designed, explains what belongs there, names the active filter if one
  caused it, offers the action that resolves it.
- **Error** — designed, states what failed, offers retry, leaks nothing.
- **Partial / stale** — surfaced honestly.
- **No permission** — reveals nothing.

Force each state deliberately (throttle the network, kill the connection, seed zero
rows, sign in as an unauthorized user). Do not assume they work because the code exists.

### Visual consistency

- Colors from tokens; no ad-hoc hex; no stock Tailwind palette leakage.
- Spacing on the 8/4 scale.
- IDs, times, and currency in monospace with tabular alignment; `AED` present.
- Focus rings visible on every interactive element; tab order sensible.
- Contrast measured with a tool, not judged by eye.
- Compare against sibling screens — a new page must look like it belongs.

### 3D and globe

- Frame rate on a mid-range machine, not just the dev machine.
- WebGL disabled → the designed fallback appears and is functional.
- Context loss simulated (`WEBGL_lose_context`) → recovers or degrades cleanly.
- Mount / unmount / remount → `renderer.info` geometry and texture counts return to
  baseline.
- `prefers-reduced-motion` on → idle rotation, pulses, and orbital motion stop.
- Keyboard path to city selection works; selection announced.
- City times and session states cross-checked against real local time, including a
  weekend and a DST-shifted date.

### Automated tests

- **Playwright** for e2e: authentication, the permission matrix (as separate users),
  conversion, deposit entry, calendar create/edit/recurrence, and the critical
  navigation paths. Permission tests are the non-negotiable core of the suite.
- **Vitest** for units with real logic: timezone and session-state computation,
  deposit aggregation, `client_ref` formatting, recurrence expansion, validation schemas.
- Tests assert behavior, not implementation detail. No snapshot tests of whole pages.
- Tests must be able to fail: write the assertion, see it fail, then make it pass.
- Every fixed bug gets a regression test reproducing it.
- Deterministic: fixed clock for time-dependent tests, seeded data, no reliance on
  ordering, no sleeps.
- Run the full suite before claiming completion. Paste real output.

### Reporting

State exactly what was verified, how, and what was not:

> Converted `CL-000184` as mentor Michael. Client count unchanged (247 → 247),
> `client_ref` unchanged, `created_by` still Priya, `converted_by` = Michael,
> `converted_at` set. Verified in Supabase directly.
> Signed in as Sales B: client absent from list, direct URL returns not-found with no
> name leaked, direct Supabase select returns 0 rows.
> **Not tested**: mentor reassignment after conversion. Playwright spec not yet written.

Never: "Conversion works as expected."

## Anti-patterns

- Declaring done because it compiles or types pass.
- Testing permissions only through the UI.
- Testing with a single user account.
- Asserting the implementation instead of the requirement.
- Snapshot tests standing in for behavior tests.
- Tests that were never seen to fail.
- Skipping empty, loading, and error states because "they're simple".
- Checking only the dev machine, only Chrome, only 1440px.
- Ignoring console warnings.
- Time-dependent tests using the real clock.
- Reporting a summary without the actual output.
- Silently omitting what was not tested.

## Quality checklist

- [ ] Requirement re-read; assertions written against it.
- [ ] Permission matrix tested with admin, sales A, sales B, mentor A, mentor B.
- [ ] Cross-user denial proven **at the API/Supabase level**, not only the UI.
- [ ] Denial leaks no data in body, title, or metadata.
- [ ] Conversion asserted: no duplicate row, ID retained, full ownership chain intact.
- [ ] Deposit totals asserted as derived sums.
- [ ] Duplicate creation blocked at both UI and database.
- [ ] Timezone behavior tested across a DST boundary; no hardcoded offsets found.
- [ ] Real browser inspection at ~1440, ~1024, ~390 with clean console and network.
- [ ] Empty, loading, error, stale, and no-permission states each forced and reviewed.
- [ ] Contrast and focus verified with tools.
- [ ] Globe: frame rate, WebGL fallback, context loss, disposal, reduced motion,
      keyboard path, and time/session accuracy all checked.
- [ ] Playwright permission suite passing; Vitest units passing.
- [ ] Regression test added for every bug fixed.
- [ ] Report states what was verified, how, and what was not.
