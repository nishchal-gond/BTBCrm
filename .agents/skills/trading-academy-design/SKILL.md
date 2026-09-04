---
name: trading-academy-design
description: The Dubai Financial Command Center visual language for the Trading Academy CRM — dark premium fintech, restrained color, monospace financial data, dense but calm layouts. Use when building or reviewing ANY user-facing screen, component, layout, color choice, typography decision, spacing decision, or motion in this project. Also use when a UI risks looking like a generic SaaS admin, template dashboard, or default shadcn app.
---

# Trading Academy Design — Dubai Financial Command Center

## When to use

Load this before writing or reviewing any UI in this project: pages, components,
layouts, tables, forms, empty states, loading states, error states, color tokens,
typography, spacing, or motion. If a pixel will be seen by a user, this applies.

## The identity

This product is the operating console of a premium trading academy headquartered in
Dubai. It should feel like:

- an **institutional trading desk** — dense, live, authoritative, built for operators
- **private banking** — discreet, expensive, unhurried, quietly confident
- **premium fintech** — precise numbers, sharp type, no decoration for its own sake
- **Dubai luxury technology** — warm metal against deep dark, restraint over flash

The user is a professional looking at this screen for eight hours. It must reward
long attention, not first-glance novelty.

## Responsibilities

1. Define and defend the token layer: color, type scale, spacing scale, radii,
   borders, elevation, motion durations.
2. Ensure every screen has one clear primary focus and a deliberate reading order.
3. Ensure financial data, IDs, and times are typeset as data, not as prose.
4. Ensure empty, loading, and error states are designed — never afterthoughts.
5. Ensure accessibility and responsive behavior ship with the design, not after it.
6. Reject generic output before it enters the codebase.

## Rules

### Color

- Base is a deep, slightly cool near-black — not pure `#000`, not slate-blue-gray.
  Build a 5–7 step surface ramp (canvas → panel → raised → overlay) and use elevation
  through **surface steps and 1px borders**, not shadows.
- **One** accent family. A warm metallic (brushed gold / bronze) is the house accent,
  used sparingly — active nav, primary CTA, focus ring, key figure emphasis.
- Semantic colors are functional only: positive (gain/open), negative (loss/closed),
  warning, info. They appear on data, never as decoration.
- Total palette on any one screen: background ramp + foreground ramp + **one** accent
  + semantics. Nothing else.
- No purple-to-pink gradient. No rainbow category colors. No neon glow as a base style.

### Typography

- Two families: a premium UI sans (geometric-humanist, high legibility at 12–14px)
  and a **monospace** for all numeric and identifier data.
- Monospace is mandatory for: client IDs (`CL-000184`), times (`20:42:18`), currency
  (`AED 25,000`), percentages, counts, timestamps, and anything in a table numeric
  column. Numbers must align vertically; use tabular figures.
- Currency always carries its code: `AED 25,000`, not `25,000` or `$25,000`.
- Establish a real type scale (roughly 11 / 12 / 13 / 14 / 16 / 20 / 28 / 40) and
  use weight and color for hierarchy before reaching for size.
- Labels are small, uppercase-tracked, and low-contrast. Values are large and high
  contrast. The eye should land on the value first.

### Layout and density

- High information density is the goal, achieved through **tight, consistent spacing
  and hairline separation** — not through shrinking everything.
- Use an 8px spacing base with a 4px half-step. No arbitrary values.
- Asymmetric compositions where they serve the content: a 60/40 or 70/30 split with a
  dominant primary panel beats four equal quadrants.
- Borders are 1px, low-contrast, and do real work separating regions. Prefer a border
  over a shadow. Prefer a surface step over a border where possible.
- Radii are small and consistent (4–8px). Large pill-rounded cards read as consumer
  app, not trading desk.
- Tables are first-class citizens: sticky headers, aligned numerics, row hover, dense
  row height, no zebra striping.

### Motion

- Motion is confirmation and continuity, never entertainment.
- 120–240ms, ease-out for entrances, ease-in-out for transforms.
- Animate opacity and transform only. Never animate layout properties in a list.
- Nothing loops forever in the user's peripheral vision except the globe's idle
  rotation and live market state indicators.
- Honor `prefers-reduced-motion` — reduce to opacity-only or disable entirely.

### States

Every data surface ships four states, all designed:

- **Loading** — skeletons matching the real layout's shape and density. Never a
  centered spinner on a full page.
- **Empty** — explains what belongs here and offers the action that fills it. Never
  a shrug illustration and "No data".
- **Error** — says what failed and what the user can do. Offers retry. Never a raw
  stack trace or a bare "Something went wrong".
- **Partial / stale** — if data is cached or a live figure is behind, say so.

### Accessibility

- Text contrast ≥ 4.5:1; large text and UI boundaries ≥ 3:1. Low-contrast is a
  *hierarchy* technique, and it stops at the WCAG floor.
- Visible focus ring on every interactive element, using the accent.
- Full keyboard operation for tables, dialogs, menus, and the calendar.
- Color never carries meaning alone — pair it with an icon, label, or shape.
- Semantic HTML and correct ARIA on custom widgets.

### Responsive

- Design at three real widths minimum: ~1440 (primary), ~1024, ~390.
- Dense tables become prioritized card lists on narrow screens — not horizontal
  scroll of a 12-column table.
- Nothing critical hides behind hover only; hover has no mobile equivalent.

### shadcn/ui

shadcn is a starting point that must be restyled through project tokens before use.
A screen that reads as "default shadcn" is a failure. Override radius, borders,
surface colors, focus rings, and density in the token layer, not per-component.

## Anti-patterns — reject on sight

- Generic SaaS admin chrome: white/light-gray card grid, blue primary, drop shadows.
- Four identical stat cards in a row with an icon in a colored circle.
- Purple-gradient startup UI, or any gradient used as a surface treatment.
- Glassmorphism as a default panel style (heavy blur + translucent white borders).
- Giant rounded cards with generous padding and three words of content.
- Rainbow category palettes; ten hues on one screen.
- Neon glow on everything; emissive text.
- Decorative charts with no information value — sparklines that encode nothing,
  donut charts of two categories, area charts of three points.
- Emoji as UI iconography.
- Centered full-page spinners.
- Hero sections and marketing-site patterns inside an operations console.
- `text-gray-500` on `bg-gray-100` and other stock-Tailwind-palette defaults.
- Animated gradient borders, floating particles, mesh backgrounds.

## Quality checklist

Before any UI is considered done:

- [ ] Screen has one unmistakable primary focus and a deliberate reading order.
- [ ] All colors come from project tokens; no ad-hoc hex, no stock Tailwind palette.
- [ ] Exactly one accent family in use; semantics only on data.
- [ ] All IDs, times, currency, and table numerics are monospace with tabular figures.
- [ ] Currency shows its code (`AED`).
- [ ] Spacing is on the 8/4 scale throughout; no arbitrary pixel values.
- [ ] Elevation comes from surface steps and 1px borders, not shadows.
- [ ] Loading, empty, error, and stale states all exist and are designed.
- [ ] Contrast measured, not guessed. Focus rings visible everywhere.
- [ ] Keyboard-operable end to end.
- [ ] Verified in a real browser at ~1440, ~1024, and ~390.
- [ ] `prefers-reduced-motion` respected.
- [ ] Could not be mistaken for a default shadcn dashboard or a template.
