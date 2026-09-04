# Calendar Architecture

The Company Calendar module: views, filters, recurrence, timezone handling,
availability, and privacy between owners.

Schema in [DATABASE.md §5.6](DATABASE.md); policies in
[AUTHORIZATION.md §4.5](AUTHORIZATION.md).

---

## 1. Principle

The calendar is a **core module**, not an embedded widget. FullCalendar supplies
mechanics — time-grid layout, overlap resolution, drag interaction, view switching.
Everything visible is replaced with project components. A user must not be able to tell
which library is underneath.

## 2. Views

| View | Purpose | Default for |
| ---- | ------- | ----------- |
| **Month** | Density overview. Compact bars, `+N more` overflow — never clipped | — |
| **Week** | The working view. Time grid, current-time indicator, side-by-side overlaps | Desktop, tablet |
| **Day** | Dense single-day detail with full event content | Small tablet |
| **Agenda** | Chronological list — **complete, not degraded** | Mobile, screen readers |

View choice persists per user. Agenda is simultaneously the mobile default and the
accessible path, so it must be a first-class implementation.

## 3. Filters

Six chips, combinable, reflected in `searchParams` (shareable, back-button safe), and
persisted per user:

| Filter | Predicate |
| ------ | --------- |
| **All** | everything RLS returns |
| **Sales** | `event_type in ('sales_call','client_appointment')` |
| **Mentors** | `event_type in ('mentor_session','review')` |
| **Company** | `event_type in ('company_meeting','internal_training')` |
| **My schedule** | organizer = me **or** I am an attendee |
| **My clients** | `client_id` in clients I own |

The active filter is always visible. An empty result **names the filter that caused it**
and offers to clear it — never a blank grid.

> Filters narrow what RLS already returned. They are not the security boundary. A
> salesperson selecting "All" sees their own events plus company events, because that
> is all the database gave them.

## 4. Event types

| Type | Colour | Created by |
| ---- | ------ | ---------- |
| `sales_call` | `--info` | sales, admin |
| `client_appointment` | `--info` | sales, admin |
| `mentor_session` | `--positive` | mentor, admin |
| `review` | `--positive` | mentor, admin |
| `company_meeting` | `--accent` | **admin only** |
| `internal_training` | `--accent` | **admin only** |
| `onboarding` | `--warning` | sales, mentor, admin |
| `other` | `--fg-secondary` | all |

Eight types across five colours — deliberately fewer colours than types, because the
grouping (sales / mentor / company / operational) is what matters at a glance.

**Every chip carries a type label or icon.** Colour never carries the type alone.

## 5. Timezone model

The single most error-prone area of this module.

### Storage

Every event stores **both**:

| Column | Holds | Answers |
| ------ | ----- | ------- |
| `starts_at timestamptz` | the instant, UTC internally | *when* |
| `timezone text` | IANA ID, e.g. `Asia/Dubai` | *what wall-clock time was meant* |

**A `timestamptz` alone is not sufficient.** A weekly 09:00 Dubai session and a weekly
09:00 London session are the same instant apart in July and a different instant apart
in January. Recurrence expansion needs the zone to reproduce the intended wall-clock
time on the other side of a DST transition. An offset is not sufficient either — an
offset is a *result*, the IANA ID is the *rule*.

### Display

- Default display zone is the company zone, `Asia/Dubai`, overridable per user in
  `profiles.timezone`.
- **The active display timezone is always labelled** in the calendar header:
  `GST (Asia/Dubai)`.
- When an event's own zone differs from the display zone, **both are shown**:
  `17:00 GST (13:00 GMT)`.
- All times render in monospace with tabular figures.
- All-day events are date-only and **do not shift** with timezone.

### Absolute rule

**No hardcoded UTC offsets anywhere in the codebase.** Not `+04:00`, not
`* 4 * 3600e3`, not a constant named `DUBAI_OFFSET`. Formatting is `Intl.DateTimeFormat`
with an IANA ID; arithmetic across zones uses a timezone-aware library.

A CI grep for offset-shaped literals is cheap and worth having.

## 6. Recurrence

### Model

- Stored as an **RFC 5545 RRULE** string on the series master row.
- **Occurrences are never pre-generated as rows.** Expansion happens for the queried
  window only.
- An exception (a moved or cancelled single occurrence) is a **separate row** with
  `series_id` pointing at the master and `override_start_date` naming which occurrence
  it replaces.
- `is_cancelled = true` on an override represents a deleted single occurrence.

```
calendar_events
├── id: A   rrule: FREQ=WEEKLY;BYDAY=TU   series_id: null   ← master
├── id: B   series_id: A   override_start_date: 2026-10-27  ← moved occurrence
└── id: C   series_id: A   override_start_date: 2026-11-03  ← is_cancelled
             is_cancelled: true
```

### Expansion

1. Query masters and overrides overlapping the window (indexed on
   `(starts_at, ends_at)` and `(series_id)`).
2. Expand each RRULE **in the event's own `timezone`**, so a 09:00 weekly session stays
   at 09:00 local across a DST boundary rather than drifting to 08:00 or 10:00.
3. Replace expanded occurrences with their overrides by `override_start_date`.
4. Drop cancelled occurrences.
5. Convert to the display timezone last.

Expansion is bounded: a maximum horizon and a maximum occurrence count per series, so a
malformed or unbounded rule cannot produce an unbounded response.

### Editing

Editing or deleting a recurring event **always** asks:

- **This occurrence** → creates or updates an override row
- **This and following** → truncates the master with an `UNTIL`, creates a new series
- **All** → updates the master; overrides are preserved unless the user opts to reset

The form shows a plain-language summary: *"Every Tuesday at 09:00 GST, until 30 Jun"*.

## 7. Event creation

Three entry points — click an empty slot, drag a range, or the primary action — all
opening the same form.

| Field | Required | Notes |
| ----- | -------- | ----- |
| Title | ✅ | |
| Type | ✅ | Company types are admin-only, per policy |
| Start / End | ✅ | `ends_at > starts_at` enforced by `check` |
| Timezone | ✅ | Defaults to the user's zone; IANA ID |
| Client | — | **Search returns only clients the creator can access** |
| Attendees | — | From the user directory |
| Location / link | — | |
| Recurrence | — | Rule builder with plain-language preview |
| Description | — | |

**Client linking** searches by name or `CL-000184` against RLS-scoped results. Once
linked, the event appears on that client's Schedule tab. The `events_insert` policy
independently re-checks `app.can_access_client(client_id)`, so a crafted request cannot
link an event to a client the creator cannot see.

**Drag to move / resize to extend** apply optimistically with a real rollback path and
a user-visible explanation if the server rejects the change. Drag is never the only way
to reschedule — the form always works, which is also the keyboard path.

## 8. Availability

Scheduling with a mentor or salesperson requires knowing when they are busy. It does
**not** require knowing what they are busy with.

Served by `app.busy_ranges(user_id, from, to)` — a `security definer` function
returning **exactly two columns**: `starts_at`, `ends_at`.

```
Michael, Tue 14 Apr
  ├── 09:00–10:00  ████ busy
  ├── 11:30–12:00  ████ busy
  └── 15:00–16:30  ████ busy
```

No title. No client. No description. No event type.

**Any endpoint that returns full event objects for scheduling purposes is a data leak**,
and it is the specific leak this design exists to prevent — a salesperson must not be
able to enumerate a colleague's client meetings by opening the scheduling assistant.

Additionally:

- Double-booking produces a **warning at the point of creation**, not a rejection after
  submit.
- Working-hours boundaries per user (`app_settings` default, profile override);
  out-of-hours slots are visually muted and selectable with a confirmation.

## 9. Privacy

| Viewer | Sees |
| ------ | ---- |
| Admin | everything |
| Sales | own events, events they attend, company events, events on **their** clients |
| Mentor | own sessions, events they attend, company events, events on **assigned** clients |

A salesperson does **not** see another salesperson's client meetings. Enforced by the
`events_select` policy, not by the filter chips.

Full matrix in [PERMISSIONS.md §5](PERMISSIONS.md).

## 10. Styling

FullCalendar's default appearance is replaced entirely:

| Library default | Replaced with |
| --------------- | ------------- |
| Toolbar | Project header: view switcher, date nav, filter chips, timezone label |
| Grid lines | `--border-subtle` hairlines on project surfaces |
| Event chips | `--radius-sm`, `--text-2xs`, semantic muted fill + border, type label |
| Fonts | Geist / Geist Mono |
| Now indicator | 1px `--accent` line with a 4px dot at the gutter |
| Buttons | Project `Button` component |
| Popovers | Project `Dialog` / `Popover` |

Time-column labels are monospace and right-aligned so hour boundaries align optically.

## 11. Accessibility

- **Agenda view is the fully equivalent screen-reader path** — not a reduced fallback.
- Every event is a focusable element with an accessible name carrying time, type, and
  counterpart: *"Mentor session, 09:00 to 10:00 GST, Rahul Sharma, CL-000184"*.
- Keyboard: navigate periods, move focus between events, open, edit, and create at a
  focused slot — all without a mouse.
- Drag-and-drop has a keyboard equivalent (open the event, edit the time).
- The current-time indicator and all event type colours meet contrast requirements.
- Filter changes announce the new result count through a live region.

## 12. Performance

- **Every query is bounded by a date range.** Never fetch all events.
- Uses the `(starts_at, ends_at)` index; a view change refetches only the new window.
- Recurrence expands for the visible window only, with a hard occurrence cap.
- Month view for a busy company can still be large — overflow is `+N more` with a
  popover, not a thousand rendered chips.
- FullCalendar is a **route-scoped dynamic import**. It must not appear in the shared
  bundle; no other route loads it.
- The calendar route is dynamic and user-scoped — **never statically cached, never in a
  shared or CDN cache**.

See [PERFORMANCE.md](PERFORMANCE.md).

## 13. Test obligations

From [TEST_PLAN.md](TEST_PLAN.md), the calendar-specific set:

1. A weekly 09:00 `Asia/Dubai` session holds 09:00 across a DST boundary.
2. A weekly 09:00 `Europe/London` session holds 09:00 local when UK clocks change —
   the instant shifts, the wall-clock time does not.
3. Editing "this and following" on a DST-crossing series does not shift earlier
   occurrences.
4. `sales_b` cannot read `sales_a`'s client-linked events — **direct Supabase query**,
   not just the UI.
5. `app.busy_ranges()` returns exactly two columns, verified by column count.
6. Drag-to-move rejected by the server rolls back visibly with an explanation.
7. Recurring delete asks occurrence / following / all.
8. Month overflow shows `+N more`; nothing is silently clipped.
9. Agenda view exposes every event the grid views do.
10. A grep for hardcoded UTC offsets finds nothing.

---

## Open decisions

1. **Recurrence library** — expansion must be RRULE-correct *and* IANA-timezone-aware.
   FullCalendar's own `rrule` plugin, `rrule.js` with a timezone wrapper, and
   `Temporal`-based expansion are the candidates. Verify current behaviour against
   documentation before choosing; DST-correct RRULE expansion is the deciding criterion,
   not API convenience.
2. **Attendee invitations** — `event_attendees` supports responses, but no notification
   mechanism exists (communication is out of v1 scope). Responses are set in-app only.
   Whether that is useful without notifications is a product question.
3. **Working hours** — per-user override is specified but the UI for setting it is not
   designed. May default to a single company-wide setting in v1.
4. **Month view event cap** — `+N more` threshold not yet chosen; needs testing against
   realistic event volume.
