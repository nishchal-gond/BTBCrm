# Design System — Dubai Financial Command Center

Tokens, typography, color, components, and states. The philosophy and the reject-list
live in the `trading-academy-design` skill; this document is the concrete values.

---

## 1. Identity in one line

The operating console of a premium trading academy in Dubai: **institutional trading
desk × private banking × Dubai luxury technology**. Dense, dark, warm-accented, calm.
Built to be looked at for eight hours, not for eight seconds.

## 2. Color tokens

Dark-only. There is no light theme in v1 — an operations console used in a dim room
does not need one, and maintaining two palettes doubles the surface for inconsistency.

### Surfaces

| Token | Value | Use |
| ----- | ----- | --- |
| `--surface-canvas` | `#0A0C0F` | Page background |
| `--surface-panel` | `#101418` | Sidebar, primary panels |
| `--surface-raised` | `#161B21` | Cards, table headers, active nav |
| `--surface-overlay` | `#1D242B` | Dialogs, popovers, dropdowns |
| `--surface-input` | `#0D1114` | Form fields — recessed, not raised |
| `--surface-hover` | `#1A2027` | Row and control hover |

Elevation comes from **stepping up this ramp plus a 1px border**. Not from shadows.
A shadow on a near-black surface reads as smudge, not lift.

### Borders

| Token | Value | Use |
| ----- | ----- | --- |
| `--border-subtle` | `#1E252C` | Table row dividers, quiet separation |
| `--border-default` | `#2A333C` | Panel edges, input borders |
| `--border-strong` | `#3A4550` | Focused input, emphasised boundary |

### Foreground

| Token | Value | Contrast on canvas | Use |
| ----- | ----- | ------------------ | --- |
| `--fg-primary` | `#E8EDF2` | 15.8:1 | Values, headings, body |
| `--fg-secondary` | `#98A4B0` | 7.4:1 | Supporting text |
| `--fg-tertiary` | `#6B7885` | 4.6:1 | Labels — **at the floor, do not go lower** |
| `--fg-disabled` | `#4A555F` | 2.6:1 | Disabled only; never for readable text |

`--fg-tertiary` at 4.6:1 is the lowest contrast permitted for any text a user must
read. Low contrast is a hierarchy technique that stops at WCAG AA.

### Accent — brushed gold

One accent family. Used for: active nav rule, primary action, focus ring, and at most
one emphasised figure per screen.

| Token | Value | Use |
| ----- | ----- | --- |
| `--accent` | `#C9A227` | Primary accent (10.1:1 on canvas) |
| `--accent-hover` | `#DDB53A` | Hover |
| `--accent-press` | `#B08E1F` | Active |
| `--accent-muted` | `rgba(201,162,39,0.12)` | Selected row, subtle fill |
| `--accent-border` | `rgba(201,162,39,0.35)` | Accent-bordered surfaces |
| `--accent-fg` | `#0A0C0F` | Text **on** an accent fill |

### Semantic — data only, never decoration

| Token | Value | Meaning |
| ----- | ----- | ------- |
| `--positive` | `#3FB68B` | Gain, market open, success, paid |
| `--negative` | `#E0574F` | Loss, market closed, error, overdue |
| `--warning` | `#E0A23F` | Pre/post session, attention, pending |
| `--info` | `#4A90C4` | Neutral information |

Each has a `-muted` variant at 12% for badge fills and a `-border` at 35%.

**Colour never carries meaning alone.** Every semantic use is paired with a word or an
icon: `● OPEN`, not a green dot alone. This serves colour-blind users and screenshot
legibility equally.

### Full screen palette

Surface ramp + foreground ramp + one accent + four semantics. **Nothing else.** No
per-category colours, no chart rainbow, no decorative hues.

## 3. Typography

| Role | Family | Fallback |
| ---- | ------ | -------- |
| UI | **Geist** | Inter, system-ui, sans-serif |
| Data | **Geist Mono** | JetBrains Mono, ui-monospace, monospace |

Self-hosted via `next/font/local`, subset to Latin, `display: swap`. Only the weights
used above the fold are preloaded.

### Scale

| Token | Size / line-height | Use |
| ----- | ------------------ | --- |
| `--text-2xs` | 11 / 14 | Table micro-labels, badges |
| `--text-xs` | 12 / 16 | Labels, metadata, captions |
| `--text-sm` | 13 / 18 | **Table body — the workhorse** |
| `--text-base` | 14 / 20 | Body, form fields |
| `--text-md` | 16 / 24 | Section headings |
| `--text-lg` | 20 / 28 | Page titles |
| `--text-xl` | 28 / 34 | KPI values |
| `--text-2xl` | 40 / 44 | Hero figures — sparingly |

Weights: 400 body, 500 emphasis, 600 headings and KPI values. Nothing heavier.

### The label / value pattern

The core typographic move of the product:

```
NEW LEADS TODAY          ← --text-2xs, 500, uppercase,
                            0.08em tracking, --fg-tertiary
23                       ← --text-xl, 600, MONO, tabular, --fg-primary
+4 vs yesterday          ← --text-xs, --positive
```

The eye lands on the value. The label is a whisper.

### Monospace is mandatory for

Client IDs (`CL-000184`) · times (`20:42:18`) · currency (`AED 25,000`) · percentages ·
counts · timestamps · every numeric table column.

```css
font-variant-numeric: tabular-nums;
font-feature-settings: 'tnum' 1, 'zero' 1;
```

Tabular figures are not optional — without them, digits in a column do not align and
the table stops being scannable.

**Currency always carries its code.** `AED 25,000`. Never bare `25,000`, never `$`.

## 4. Spacing, radius, elevation

**Spacing** — 8px base, 4px half-step:
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. No arbitrary values. `p-[13px]` is a defect.

**Radius** — `--radius-sm 2px` (badges, chips) · `--radius-md 4px` (buttons, inputs) ·
`--radius-lg 6px` (cards, panels) · `--radius-xl 8px` (dialogs). Nothing rounder.
Pill-rounded cards read as consumer app.

**Elevation** — four levels, all surface-step plus border:

| Level | Surface | Border | Shadow |
| ----- | ------- | ------ | ------ |
| 0 canvas | `--surface-canvas` | — | none |
| 1 panel | `--surface-panel` | `--border-subtle` | none |
| 2 raised | `--surface-raised` | `--border-default` | none |
| 3 overlay | `--surface-overlay` | `--border-default` | `0 8px 24px rgba(0,0,0,.5)` |

**Only level 3 uses a shadow**, and only because a floating overlay genuinely needs to
separate from everything beneath it.

## 5. Motion

| Token | Value | Use |
| ----- | ----- | --- |
| `--dur-fast` | 120ms | Hover, focus, colour |
| `--dur-base` | 180ms | Dropdowns, tooltips, chips |
| `--dur-slow` | 240ms | Dialogs, drawers, panels |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Transforms |

**Animate `opacity` and `transform` only.** Never `height`, `width`, `top`, or `left`
in a list — that is a layout thrash per frame.

Nothing loops in peripheral vision except the globe's idle rotation and live market
indicators. No skeleton shimmer sweep; skeletons use a slow opacity pulse.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Plus a JS `useReducedMotion` hook for the globe, which disables idle rotation, marker
pulses, orbital indicators, and camera easing.

## 6. Component specifications

### Button

| Variant | Surface | Border | Foreground |
| ------- | ------- | ------ | ---------- |
| Primary | `--accent` | none | `--accent-fg` |
| Secondary | `--surface-raised` | `--border-default` | `--fg-primary` |
| Ghost | transparent | none | `--fg-secondary` |
| Destructive | transparent | `--negative` @35% | `--negative` |

Heights 28 / 32 / 36. Radius `--radius-md`. `--text-sm`, weight 500.
**One primary button per view.**

### Input

`--surface-input` (recessed — inputs sit *into* the page), `--border-default`, height
32, radius `--radius-md`. Focus: `--border-strong` + a 2px `--accent` ring at 2px
offset. Error: `--negative` border with the message below, never colour alone.

Labels sit above at `--text-xs` / `--fg-secondary`. No placeholder-as-label.

### Table — the most important component

```
┌──────────────────────────────────────────────────────────────┐
│ CLIENT ID   NAME        STATUS    OWNER   MENTOR    DEPOSITS │ ← sticky, --surface-raised
├──────────────────────────────────────────────────────────────┤ ← --border-default
│ CL-000184   Rahul S.    ● Student Priya   Michael  AED 25,000│ ← 36px, --text-sm
│ CL-000185   Aisha K.    ● Lead    Priya   —             AED 0│
└──────────────────────────────────────────────────────────────┘
```

- Row height 36 (comfortable) / 30 (dense toggle)
- Dividers `--border-subtle`. **No zebra striping** — it fights density
- Hover `--surface-hover`; selected `--accent-muted` with a 2px accent left rule
- Numeric and ID columns right-aligned, monospace, tabular
- Sticky header; horizontal scroll only within the table's own container
- Unassigned renders as `—` in `--fg-tertiary`, never a blank cell
- Below 1024px: priority cards, not a horizontal scroller

### Status badge

`--text-2xs`, 500, uppercase, 0.06em tracking, radius `--radius-sm`, padding 2/6.
Semantic `-muted` fill + `-border`. **Always a dot plus a word.**

| Status | Colour |
| ------ | ------ |
| Lead | `--info` |
| Qualified | `--info` |
| Mentor assigned | `--warning` |
| Converted | `--positive` |
| Student | `--positive` |
| Lost | `--negative` |
| Dormant | `--fg-tertiary` |

### KPI cell

Not a card. A cell in a hairline-divided rail:

```
┌──────────────────┬──────────────────┬──────────────────┐
│ NEW LEADS        │ CONVERSIONS      │ DEPOSITS MTD     │
│ 23               │ 7                │ AED 412,500      │
│ +4 vs yesterday  │ −1 vs last month │ +12% vs target   │
└──────────────────┴──────────────────┴──────────────────┘
```

Every cell is clickable, navigating to the filtered list that produced it. Every cell
carries a comparison. **No icons in coloured circles.**

### Dialog

`--surface-overlay`, `--border-default`, `--radius-xl`, level-3 shadow. Backdrop
`rgba(10,12,15,0.72)` with a 2px blur — restraint, not glassmorphism. Focus trapped
and restored. Escape closes unless there are unsaved changes.

### Client ID

```tsx
<ClientRef value="CL-000184" />
// mono · --text-sm · --fg-primary · copy on click · toast confirm
```

One component, used everywhere a ref appears.

### Money

```tsx
<Money amount={25000} currency="AED" />  // → AED 25,000
```

Mono, tabular, right-aligned. Currency code always. `Intl.NumberFormat`, never a
formatting library.

### Time

```tsx
<Time value={iso} tz="Asia/Dubai" format="time" />  // → 20:42 GST
```

Mono. `Intl.DateTimeFormat` with an IANA ID. **Never a hardcoded offset.** When the
event's zone differs from the display zone, both are shown: `17:00 GST (13:00 GMT)`.

## 7. Required states

Every data surface ships all four. They are components, not afterthoughts.

**Loading** — skeletons matching the real layout's shape and density. Slow opacity
pulse, no shimmer sweep. No layout shift on arrival. Never a centered page spinner.

**Empty** — icon (line, 24px, `--fg-tertiary`), a sentence explaining what belongs
here, and the action that fills it. If a filter caused it, **name the filter** and
offer to clear it.

**Error** — `--negative` border at 35%, states what failed, offers retry. Never a stack
trace. Never data from a record the user cannot see.

**Stale / partial** — a small monospace "updated 20:42" with a refresh affordance. If
data is behind, say so rather than showing a confident wrong number.

## 8. Accessibility

- Text ≥ 4.5:1; large text and UI boundaries ≥ 3:1. **Measured, not judged.**
- 2px `--accent` focus ring at 2px offset on every interactive element. `outline-none`
  without a replacement is a defect.
- Full keyboard operation: tables, dialogs, menus, calendar, and globe city selection.
- Semantic HTML. `<button>` for actions — never a `<div>` with `onClick`.
- Live regions for async changes: save confirmations, filter result counts, globe city
  selection.
- Colour never alone. Every semantic colour pairs with a word or icon.
- Touch targets ≥ 44px on mobile; hover-only affordances have a tap equivalent.

## 9. shadcn/ui

shadcn is **copied-in source**, which is why it was chosen — it can be edited, not just
themed around. Before any component is used:

1. Rewrite its colour references to project tokens.
2. Reset radius to the project scale.
3. Replace the focus ring.
4. Tighten default padding to project density.
5. Remove shadow utilities in favour of surface + border.

**A screen that reads as "default shadcn" is a failure**, and the `visual-designer`
agent rejects it.

## 10. Tailwind configuration

Tokens are CSS custom properties on `:root`; Tailwind's theme maps to them so
`bg-panel`, `text-fg-secondary`, and `border-subtle` are the only way to reach a colour.

The **stock Tailwind palette is disabled** — `colors` is replaced, not extended. This
makes `bg-gray-800` and `text-blue-500` compile errors rather than review findings,
which is far more reliable than a guideline.

Spacing is restricted to the scale in §4 for the same reason.

---

## Open decisions

1. **Geist licensing and metrics** must be confirmed before implementation; Inter +
   JetBrains Mono is the fallback pairing if anything blocks it.
2. **Accent contrast on `--surface-overlay`** — `#C9A227` on `#1D242B` should be
   verified at 4.5:1 for small text; if it falls short, small accent text on overlays
   uses `--accent-hover` instead.
3. **Dense row toggle** — specified at 30px but not yet validated against the longest
   realistic client name at `--text-sm`.
4. **No light theme in v1.** If one is ever required, every colour must already be a
   token (it is), but the ramp inversion is not designed and would need a full pass.
