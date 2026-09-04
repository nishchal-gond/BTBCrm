---
name: globe-design
description: The interactive 3D Earth on the Trading Academy CRM dashboard — real globe geometry, day/night terminator, atmospheric glow, glowing city market-session markers, camera focus transitions, idle rotation, and IANA timezone handling. Use when building, styling, debugging, or reviewing the market globe, its city markers, labels, contextual cards, or session logic.
---

# Globe Design — Interactive Global Market Globe

## When to use

Any work on the dashboard globe: Earth mesh and textures, atmosphere, day/night,
city markers, hover and selection, labels and contextual cards, camera focus,
idle rotation, market session state, or the globe's fallback. Load `3d-design`
alongside this for the underlying R3F rules.

## Principle: hero interaction, not widget

The globe is the centerpiece of the dashboard. It occupies a commanding share of the
viewport and is the thing a user reaches for to answer "what's happening in the world
right now?" It is not a 200px decorative sphere in the corner of a card grid.

It must feel like an executive briefing display: calm, slow, precise, alive.

## Responsibilities

1. Render a genuine 3D Earth with credible lighting and atmosphere.
2. Encode live market session state per city, correctly, from IANA timezone data.
3. Make city selection a smooth, cinematic, reversible interaction.
4. Give every globe capability a keyboard and non-WebGL equivalent.
5. Hold frame rate on mid-range hardware and on resize.

## Cities

**Primary: Dubai** — visually distinguished as the local HQ (larger node, accent-
colored, always labelled).

| City      | IANA timezone         |
| --------- | --------------------- |
| Dubai     | `Asia/Dubai`          |
| London    | `Europe/London`       |
| New York  | `America/New_York`    |
| Tokyo     | `Asia/Tokyo`          |
| Singapore | `Asia/Singapore`      |
| Hong Kong | `Asia/Hong_Kong`      |
| Sydney    | `Australia/Sydney`    |

**Never hardcode UTC offsets.** Derive local time and session state from the IANA ID
with `Intl.DateTimeFormat` / a timezone-aware library. Offsets shift with DST; a
hardcoded `+4` is a bug waiting for October.

Marker content follows this shape:

```
DUBAI
20:42 GST
LOCAL HQ

LONDON
17:42 BST
OPEN

NEW YORK
12:42 EDT
OPEN

TOKYO
01:42 JST
CLOSED
```

Line 1: city, uppercase, tracked. Line 2: local time + abbreviation, **monospace**.
Line 3: session state.

## Required capabilities

- rotation (idle and user-driven)
- orbit / drag interaction
- zoom, within constrained bounds
- smooth eased camera movement to a focused city
- city selection
- city hover
- market session state per city
- day/night appearance driven by real sun position
- atmospheric lighting
- idle rotation that pauses on interaction and resumes after a quiet delay
- responsive behavior across viewport sizes
- WebGL fallback
- reduced-motion support

## Rules

### Earth

- Sphere with sufficient segments for a clean silhouette at the largest render size
  (64–96 typically) — no faceted edges, no wasteful 256.
- Layered maps: albedo/day, night-lights emissive, specular/ocean mask, and a subtle
  normal or bump. Keep the palette desaturated and dark so markers and UI read on top.
- Landmass should be legible but not touristic — this is a data surface, not an atlas.
  No country border labels, no political fills.
- Slight axial tilt reads as real; a perfectly upright sphere reads as a diagram.

### Day/night terminator

- Compute the sun direction from actual UTC time and date. The terminator must move
  and must tilt correctly with the season.
- Blend day albedo to night-lights emissive across a soft terminator band — a hard
  line looks broken.
- Night side is not black: city lights plus a faint ambient keep it readable.
- Recompute on a slow interval (per minute is ample), not per frame.

### Atmosphere

- A backside-rendered shell with a fresnel falloff — thin, cool, brightest at the limb.
- Subtle. The atmosphere frames the planet; it does not glow like a neon ring.
- Additive blending, depth write off, rendered after the Earth.

### City markers

Markers must **not** look like ordinary map pins. Use:

- **Glowing nodes** — small emissive spheres or discs sitting on the surface, sized by
  importance (Dubai largest), colored by session state.
- **Subtle pulses** — a slow, low-amplitude expand-and-fade ring on open markets.
  Slow. One pulse every few seconds, not a strobe. Disabled under reduced motion.
- **Connected orbital indicators** — a thin arc or ring segment orbiting the node,
  reinforcing that this is a live system. Constant, slow angular velocity.
- **Elegant labels** — DOM text (via drei `<Html>` or an overlay layer), small,
  tracked, monospace for the time line, with a hairline leader line to the node.
- **Contextual cards** — on hover or selection, a compact panel with city, local time,
  session state, session open/close times, and relevant local counts (e.g. clients,
  scheduled events). Positioned to avoid occluding the node.

Marker rules:

- Markers on the far side of the globe are occluded or heavily dimmed — never drawn
  through the Earth.
- Label collision must be handled: when nodes crowd, drop to node-only and reveal the
  label on hover.
- Session state color is paired with a text state word — color alone never carries it.

### Market session state

- Derive `OPEN` / `CLOSED` / `PRE` / `POST` from each exchange's real local trading
  hours, evaluated in that city's IANA timezone.
- Account for weekends. Account for the fact that "today" differs by city.
- Dubai is additionally marked `LOCAL HQ` regardless of session state.
- Recompute on a timer (per minute), and re-render only the affected markers.

### Camera and interaction

- **Idle rotation**: slow constant Y-axis rotation (a full turn in the order of a
  minute or more). Pauses immediately on pointer down or focus, resumes after a few
  seconds of quiet, easing back in rather than snapping.
- **Focus transition**: selecting a city eases the camera to frame that city, rotating
  the globe so the city faces the viewer and moving the camera in. 800–1200ms,
  ease-in-out, interruptible by a new selection.
- **Deselect** returns to the neutral framing and resumes idle rotation.
- Damped orbit; constrained polar angle and zoom; pan disabled.
- Hover raises the node, brightens the glow, and shows the label — a cheap,
  instantaneous response distinct from selection.

### Responsive

- The globe scales with its container; camera distance and marker/label scale adapt so
  the composition holds at every width.
- On narrow viewports the globe stays a hero but yields height; labels reduce to the
  focused city plus Dubai, with the rest available in the accompanying list.
- Handle resize by updating camera aspect and renderer size — never by remounting.

### Fallback and accessibility

- Without WebGL: a designed panel listing all seven cities with local time and session
  state, using the same typography and states. Fully functional, not an apology.
- Keyboard: the city list beside or beneath the globe is focusable; selecting a city
  there drives the same camera focus. Arrow-key traversal between cities.
- Selection changes announced in a live region.
- Under `prefers-reduced-motion`: no idle rotation, no pulses, no orbital motion;
  camera changes become instant or near-instant.

## Anti-patterns

- A small decorative globe in a stat card.
- Classic teardrop map pins, or oversized markers that dwarf the planet.
- Fast strobing pulses or rapid spinning.
- Neon wireframe globe, hexagon-grid Earth, or particle-swarm Earth.
- Arc "connection" lines flying between cities with no data meaning.
- Country borders and political labels.
- Hardcoded UTC offsets, or a static terminator.
- Markers visible through the far side of the globe.
- Camera snapping instantly between cities.
- Recomputing sun position or session state every frame.
- Shipping with no non-WebGL path.
- Full-screen bloom to make it "pop".

## Quality checklist

- [ ] Globe is a hero-scale element on the dashboard.
- [ ] Day/night terminator derived from real UTC time and correct for the season.
- [ ] All seven cities present; Dubai visually primary and marked `LOCAL HQ`.
- [ ] Local times and session states derived from IANA IDs — zero hardcoded offsets.
- [ ] Weekend and pre/post sessions handled.
- [ ] Time lines rendered in monospace.
- [ ] Markers are glowing nodes with pulses, orbital indicators, and leader-line
      labels — no map pins.
- [ ] Far-side markers occluded; label collisions handled.
- [ ] Session state paired with a text word, not color alone.
- [ ] Idle rotation pauses on interaction and eases back after quiet.
- [ ] Focus transitions eased, reversible, and interruptible.
- [ ] Orbit damped and constrained; pan disabled.
- [ ] Resize handled without remount; composition holds at ~1440, ~1024, ~390.
- [ ] WebGL-absent fallback is a designed, functional city list.
- [ ] Keyboard selection path works; changes announced.
- [ ] `prefers-reduced-motion` removes idle rotation, pulses, and orbital motion.
- [ ] Frame rate measured on mid-range hardware.
