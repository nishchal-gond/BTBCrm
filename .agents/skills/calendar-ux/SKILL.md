---
name: calendar-ux
description: Company calendar UX for the Trading Academy CRM — month/week/day/agenda views, sales and mentor and company filters, client-linked events, recurrence, availability, timezone-aware scheduling in Asia/Dubai, and privacy between owners. Use when building or reviewing the Company Calendar module, event creation, scheduling, or any date/time interaction.
---

# Calendar UX — Company Calendar

## When to use

Work on the Company Calendar module: views, filters, event creation and editing,
recurrence, availability, timezone handling, or any place a date and time is picked,
stored, or displayed in this project.

## Principle: native to the product

The calendar is a core module, not an embedded widget. FullCalendar (or equivalent)
supplies mechanics — event layout, drag, view switching — and **everything visible is
restyled to the Dubai Financial Command Center language**. A user must not be able to
tell which third-party library is underneath.

## Responsibilities

1. Provide month, week, day, and agenda views that all feel like one product.
2. Filter the company's schedule down to what each role needs to see.
3. Handle timezones correctly and visibly.
4. Link events to clients without leaking clients across owners.
5. Make scheduling fast: create, move, and reschedule with minimal friction.

## Required views

- **Month** — density overview. Events as compact bars, colored by type, with a
  per-day overflow indicator ("+4 more") rather than clipping.
- **Week** — the working default for sales and mentors. Time grid, current-time
  indicator, overlapping events laid out side by side.
- **Day** — dense single-day detail with full event content.
- **Agenda** — a chronological list. This is the mobile default and the accessible
  path; it must be complete, not a degraded fallback.

View choice persists per user.

## Required filters

- **All**
- **Sales** — sales calls and sales-owned events
- **Mentors** — mentor sessions
- **Company** — company meetings, internal training, company-wide items
- **My schedule** — events where the user is organizer or attendee
- **My clients** — events referencing clients the user owns

Filters are combinable, reflected in the URL (shareable, back-button safe), and
persist per user. The active filter is always visible; an empty result states which
filter caused it and offers to clear it.

## Event types

- sales call
- client appointment
- mentor session
- company meeting
- internal training
- onboarding
- review
- other operational event

Each type has a consistent color **and** a text label or icon. Color alone never
carries the type. Keep the type palette within the project's restrained range —
distinguishable, desaturated, not a rainbow.

## Rules

### Timezone handling

- Store every event as `timestamptz` (UTC internally) plus the **IANA timezone ID**
  the event was created in. Storing an offset is not sufficient — a recurring event
  crossing a DST boundary needs the ID.
- Company timezone is `Asia/Dubai`. Default display timezone is the company timezone
  unless the user sets otherwise.
- The active display timezone is **always labelled** in the calendar header.
- When an event's own timezone differs from the display timezone, show both:
  `17:00 GST (13:00 GMT)`.
- Times render in monospace.
- Never hardcode a UTC offset anywhere.
- All-day events are date-only and do not shift with timezone.

### Event creation and editing

- Creating: click an empty slot, or drag a range, or use a primary action. All three
  open the same form.
- Required: title, type, start, end, timezone. Optional: client link, attendees,
  location or meeting link, description, recurrence.
- **Client link** — searchable by name or `CL-000184`, and the search returns only
  clients the creator can access. Once linked, the event surfaces on that client's
  Schedule tab.
- Drag to move and resize to change duration, with an immediate optimistic update and
  a clean rollback plus explanation if the server rejects it.
- Editing a recurring event always asks: this occurrence / this and following / all.
- Deleting asks the same, and asks for confirmation.

### Recurrence

- Support daily, weekly, monthly, and custom rules; store as a standard recurrence
  rule, not as pre-generated rows.
- Expand occurrences for display only, within the queried window.
- Exceptions (a moved or cancelled single occurrence) are stored as overrides against
  the series.
- Recurrence must be evaluated in the event's own timezone so a 09:00 weekly session
  stays at 09:00 local across DST.
- Show a plain-language summary in the form: "Every Tuesday at 09:00 GST, until 30 Jun".

### Availability and conflicts

- When scheduling with a mentor or salesperson, show their busy blocks — **busy only**,
  with no title or client detail unless the viewer may see that event.
- Warn on double-booking at the point of creation rather than rejecting after submit.
- Support working-hours boundaries per user; out-of-hours slots are visually muted and
  selectable with a confirmation.

### Privacy

- A salesperson sees their own events, company events, and events for clients they
  own. They do not see another salesperson's client meetings.
- A mentor sees their sessions, company events, and events for their assigned clients.
- An admin sees everything.
- **This is enforced by RLS on the events table.** The filter chips are a convenience
  layer over data the database already scoped.
- Where a busy block is shown for availability, the payload must contain only the time
  range and a busy flag — never the title, client, or notes.

### Styling

- Restyle every part: grid lines to hairline borders on project surfaces, event chips
  to project radii and type scale, the current-time indicator to the accent color,
  headers and toolbars replaced with project components.
- Replace the library's default toolbar entirely — view switcher, date navigation,
  filters, and timezone label are project components.
- Dense but calm: small type, tight padding, clear time-column alignment.

### Responsive and accessible

- Desktop defaults to week. Tablet defaults to week with reduced density. Mobile
  defaults to agenda; month is available but read-only-ish (tap a day to open agenda).
- Keyboard: navigate periods, move focus between events, open and edit an event, and
  create at a focused slot — all without a mouse.
- Events are real focusable elements with accessible names including time, type, and
  counterpart.
- Drag-and-drop has a keyboard equivalent (open the event and edit the time).
- Screen-reader users get the agenda view as a fully equivalent path.
- The current-time indicator and event type colors meet contrast requirements.

## Anti-patterns

- An unmodified FullCalendar with default fonts, blue events, and its stock toolbar.
- Storing local wall-clock times without a timezone, or storing a numeric offset.
- Hardcoding `+04:00` for Dubai.
- Pre-generating thousands of rows for a recurring series.
- Editing a recurring event without asking about scope.
- Showing another owner's client name inside an availability busy block.
- Filtering visible events in React over a full company fetch.
- Month view that clips events with no overflow affordance.
- A mobile month grid with unreadable 6px event chips.
- Drag-and-drop as the only way to reschedule.
- Type conveyed by color alone.
- An empty calendar that gives no hint which filter emptied it.

## Quality checklist

- [ ] Month, week, day, and agenda all implemented and visually consistent.
- [ ] All six filters present, combinable, URL-reflected, and persisted.
- [ ] Every event type has a color **and** a label; palette stays restrained.
- [ ] Events stored as `timestamptz` plus IANA timezone ID.
- [ ] Display timezone labelled in the header; dual times shown when they differ.
- [ ] No hardcoded UTC offsets anywhere.
- [ ] Times rendered in monospace.
- [ ] Client link searches only accessible clients and appears on the client's
      Schedule tab.
- [ ] Recurrence stored as a rule with overrides; DST-safe in the event's timezone.
- [ ] Recurring edit and delete both ask occurrence / following / all.
- [ ] Availability exposes busy-only data; no titles or client info leaked.
- [ ] Event visibility enforced by RLS, verified with a second sales user.
- [ ] Library styling fully replaced — no stock toolbar, fonts, or colors.
- [ ] Full keyboard operation, including creating and rescheduling.
- [ ] Verified at ~1440, ~1024, ~390 with agenda as the mobile default.
- [ ] Designed empty, loading, and error states naming the active filter.
