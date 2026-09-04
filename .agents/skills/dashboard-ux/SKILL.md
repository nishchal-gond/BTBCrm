---
name: dashboard-ux
description: Executive dashboard design for the Trading Academy CRM — five-second comprehension, KPIs that drive decisions, today's schedule, globe integration, progressive disclosure, and avoiding widget overload. Use when building or reviewing the dashboard route, its KPI tiles, activity feeds, schedule strip, or any summary surface.
---

# Dashboard UX

## When to use

Work on the dashboard route or any summary/overview surface: KPI selection and
layout, the schedule strip, activity feeds, pipeline summaries, and the integration
of the 3D globe into the page composition.

## Principle: five-second comprehension

A director opens this screen between meetings. In five seconds they must know:

1. Is the business on track today? (pipeline and deposits movement)
2. What is happening right now? (live markets, today's schedule)
3. Does anything need me? (overdue tasks, unassigned leads, stalled conversions)

Anything that does not serve one of those three questions is a candidate for removal.

## Responsibilities

1. Choose the small set of KPIs that actually change behavior.
2. Compose the globe and the operational data into one coherent page.
3. Enforce a strict visual hierarchy so scanning works.
4. Keep density high and clutter low through progressive disclosure.
5. Make every number traceable to the screen that explains it.

## Rules

### KPI selection

- **Six KPIs maximum** above the fold. Fewer is usually better.
- Every KPI must pass: *if this number moved, would someone do something differently
  today?* If not, cut it.
- Every KPI carries a **comparison** — vs. yesterday, vs. last week, vs. target.
  A bare number without a reference point is not information.
- Every KPI is **clickable**, navigating to the filtered list that produced it.
  "New Leads: 23" goes to Leads filtered to today.
- Candidate KPIs for this product: new leads today, qualified leads, conversions this
  month, deposits received (period total, derived from transactions), active students,
  overdue tasks, unassigned leads, scheduled sessions today.
- Currency KPIs show the code: `AED 25,000`. Monospace, tabular figures.

### Composition

- The globe is the hero and anchors the page — typically a dominant panel with the
  operational rail beside or beneath it. Asymmetric split (roughly 60/40 or 70/30),
  not equal quadrants.
- A thin KPI rail sits above or alongside the globe: compact, aligned, monospace
  values, small tracked labels. Not four big cards with icons in colored circles.
- **Today's schedule** is a first-class region — the next few events with time, type,
  counterpart, and client link. This is the second thing a user looks at.
- **Needs attention** region: overdue tasks, unassigned leads, stalled conversions.
  Empty is a good state here and should look intentional and calm, not blank.
- Recent activity is secondary — condensed, scannable, further down or in a side rail.

### Hierarchy

- Three visual tiers only: hero (globe), primary (KPIs, schedule, attention),
  secondary (activity, minor summaries). Nothing competes across tiers.
- Values dominate labels. Labels are small, tracked, low-contrast; values are large
  and high-contrast.
- One accent color, used for at most two things on the page.
- Separation by hairline borders and surface steps, not by shadowed floating cards.

### Progressive disclosure

- Show the headline number; reveal the breakdown on interaction (hover for a tooltip,
  click through to the full view).
- Do not put a full table on the dashboard. Put the top few rows and a link.
- Collapsible regions remember their state per user.

### Live data

- Time-sensitive figures (market sessions, today's counts) refresh on a sensible
  interval and show a subtle last-updated indicator.
- Stale or failed refresh is shown, not hidden behind a last-good value.
- Loading uses skeletons shaped like the real content. Never a full-page spinner.

### Personalization by role

- **Admin** sees company-wide figures.
- **Sales** sees their own pipeline, their schedule, their clients.
- **Mentor** sees their assigned students, their sessions.
- The dashboard reads scoped data through RLS — it does not fetch everything and
  filter in React.

### Responsive

- At ~1024 the globe keeps hero status but reduces height; the rail moves beneath it.
- At ~390 the order becomes: today's schedule → needs attention → KPIs → globe.
  On a phone, "what's next" beats "spinning Earth".
- KPI rail becomes a two-column grid, never a horizontal scroller.

## Anti-patterns

- Widget overload: twelve cards, none of which anyone reads.
- Four identical stat cards with icons in colored circles.
- A number with no comparison and no drill-through.
- Vanity metrics (total records ever, page views) that drive no decision.
- Decorative charts: two-slice donuts, three-point area charts, sparklines encoding
  nothing.
- A full data table embedded in the dashboard.
- Equal-weight quadrant grids with no hierarchy.
- Duplicate information in three places on one screen.
- Real-time counters that tick for effect.
- Fetching all clients and filtering in the browser.
- A blank white area where the empty state should be.

## Quality checklist

- [ ] Three questions (on track? / happening now? / needs me?) answerable in five seconds.
- [ ] Six or fewer KPIs, each with a comparison and a drill-through.
- [ ] Every KPI would change someone's behavior if it moved.
- [ ] Currency shows `AED`; all numerics monospace and tabular.
- [ ] Globe integrated as hero, composition asymmetric and deliberate.
- [ ] Today's schedule present and prominent.
- [ ] "Needs attention" region present, with a designed empty state.
- [ ] Exactly three visual tiers; one accent used sparingly.
- [ ] Data scoped by role at the database layer, not in React.
- [ ] Skeleton loading matching real layout; stale/error states visible.
- [ ] Verified at ~1440, ~1024, ~390 with a sensible mobile ordering.
- [ ] Nothing on the page is decorative-only.
