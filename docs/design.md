# Design — Rules for AI Agents

- /packages/ui is the single source of truth for all UI.
- Always use shared shadcn components from /packages/ui.
- Do not override component styles with className.
- Do not introduce custom border radii, spacing, colours, shadows, or other visual deviations.
- Corners are rounded, from the scale only: `rounded-sm` (2px) for badges and
  chips, `rounded-md` (4px) for buttons, inputs and segments, `rounded-lg`
  (6px) for cards and panels, `rounded-xl` (8px) for dialogs. Nothing rounder.
  Never a literal radius at the call site.
- `rounded-none` is still correct in one case: an element that must join its
  neighbour edge to edge. The input inside an input group, the middle cells of
  a selected date range, and the drawer handle are the existing examples.
- If a component needs a new variant or style, implement it in /packages/ui so the entire application stays consistent.

## Colour

Dark only. There is no light theme. The concrete values are
[docs/product/DESIGN_SYSTEM.md](product/DESIGN_SYSTEM.md) §2; this section says
how to reach them.

A colour comes from a token or it does not exist. The stock Tailwind palette is
switched off in `packages/ui/src/styles/globals.css`, so `bg-gray-800` and
`text-blue-500` produce nothing at all rather than a review finding.

Four groups, and nothing else:

- **Surfaces** — `bg-surface-canvas` · `bg-surface-panel` · `bg-surface-raised`
  · `bg-surface-overlay` · `bg-surface-input` · `bg-surface-hover`. Elevation is
  a step up this ramp plus a 1px border. Only a floating overlay carries a
  shadow.
- **Borders** — `border-subtle` for row dividers, `border-border` for panel and
  card edges, `border-input` for the edge that identifies a control,
  `border-strong` for a hovered or emphasised control. The first two are
  decoration and stay quiet. The last two are measured at 3:1 on every surface.
- **Foreground** — `text-fg-primary` · `text-fg-secondary` · `text-fg-tertiary`
  · `text-fg-disabled`. `--fg-tertiary` is the contrast floor for text a user
  must read.
- **Accent and semantics** — one gold accent (`bg-accent`, `text-accent`,
  `ring-accent`) for the active rule, the primary action and the focus ring;
  `positive` · `negative` · `warning` · `info` for data only, each with a
  `-muted` fill, a `-border`, and an `-on-muted` text colour for use on that
  fill. Hover and active fills come from `-hover` and `-press` tokens. Never
  re-derive a state with `color-mix` at the call site: a darkened accent falls
  below 4.5:1 against its own foreground.

**Only two things are filled**: the accent for the action you want, and
`destructive` for the one you cannot undo. Everything else — secondary, outline,
ghost — is a step on the surface ramp.

Colour never carries meaning alone. Every semantic use is paired with a word or
an icon.

The shadcn aliases (`--background`, `--card`, `--primary`, `--muted`, and the
rest) are kept as a compatibility layer over these tokens so copied-in shadcn
source keeps working. New code reaches for the product names above.
