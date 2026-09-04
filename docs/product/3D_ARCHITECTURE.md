# 3D Architecture — Market Globe

The interactive 3D Earth on the dashboard. Scene graph, city model, market-session
logic, camera behaviour, fallback, and accessibility.

Frame and memory budgets are in [PERFORMANCE.md](PERFORMANCE.md); visual tokens in
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

---

## 1. Position in the product

The globe is a **hero interaction**, not a widget. It occupies roughly 62% of the
dashboard's primary width at ≥1440px with a minimum height of 520px, and it answers one
question: *what is happening in the world's markets right now, and where are we in
relation to it?*

It carries **no client data**. It is identical for every user regardless of role, which
means it needs no RLS consideration and can never leak anything.

## 2. Component tree

```
app/(app)/dashboard/page.tsx            Server Component
└── <MarketGlobePanel>                  client boundary
    ├── <GlobeCanvas>                   dynamic(ssr:false) — the 3D chunk
    │   └── <Canvas dpr={[1,2]}>
    │       ├── <SceneLighting>         key / fill / rim
    │       ├── <Earth>                 sphere, day+night+specular+normal
    │       │   └── <Terminator>        sun-direction uniform
    │       ├── <Atmosphere>            backside fresnel shell
    │       ├── <CityMarkers>           instanced nodes + pulses + orbitals
    │       ├── <CameraRig>             idle rotation, focus transitions
    │       └── <OrbitControls>         damped, constrained, no pan
    ├── <CityLabelLayer>                DOM overlay — leader lines + labels
    ├── <CityContextCard>               DOM — hover/selection detail
    └── <CityList>                      DOM — keyboard path AND fallback
```

**Everything textual is DOM.** No 3D text meshes: DOM is sharper, accessible,
selectable, and free.

`<CityList>` is not a secondary feature. It is simultaneously the keyboard navigation
path, the screen-reader path, and the no-WebGL fallback — one component serving three
requirements, which is why it must be designed properly rather than bolted on.

## 3. Cities

Static TypeScript configuration in `lib/market-cities.ts`. **Not a database table** —
seven rows that change roughly never, needed at first paint, where a round trip would
be pure cost.

| City | IANA timezone | Lat | Lon | Exchange |
| ---- | ------------- | --- | --- | -------- |
| **Dubai** | `Asia/Dubai` | 25.2048 | 55.2708 | DFM |
| London | `Europe/London` | 51.5074 | −0.1278 | LSE |
| New York | `America/New_York` | 40.7128 | −74.0060 | NYSE |
| Tokyo | `Asia/Tokyo` | 35.6762 | 139.6503 | TSE |
| Singapore | `Asia/Singapore` | 1.3521 | 103.8198 | SGX |
| Hong Kong | `Asia/Hong_Kong` | 22.3193 | 114.1694 | HKEX |
| Sydney | `Australia/Sydney` | −33.8688 | 151.2093 | ASX |

**Dubai is primary**: larger node, accent-coloured, always labelled, tagged `LOCAL HQ`
regardless of session state.

### Trading hours — seed values, verification required

> ⚠️ **These are seed values and must be verified against each exchange's published
> calendar before launch.** Trading hours change (TSE extended its close in 2024; the
> UAE moved to a Mon–Fri week in 2022). Shipping unverified hours means the globe
> confidently displays wrong information — worse than displaying none.

| Exchange | Local hours | Days | Lunch break |
| -------- | ----------- | ---- | ----------- |
| DFM | 10:00–14:00 | Mon–Fri | — |
| LSE | 08:00–16:30 | Mon–Fri | — |
| NYSE | 09:30–16:00 | Mon–Fri | — |
| TSE | 09:00–15:30 | Mon–Fri | 11:30–12:30 |
| SGX | 09:00–17:00 | Mon–Fri | 12:00–13:00 |
| HKEX | 09:30–16:00 | Mon–Fri | 12:00–13:00 |
| ASX | 10:00–16:00 | Mon–Fri | — |

**Exchange holidays are out of scope for v1.** Weekends are handled. This gap is
recorded in [SECURITY.md §12](SECURITY.md) because a wrong `OPEN` badge on a holiday
looks like a bug to a user even though it is a documented limitation.

## 4. Session state

```ts
type SessionState = 'OPEN' | 'CLOSED' | 'PRE' | 'POST' | 'BREAK';
```

Derived **entirely client-side** from the browser clock and the IANA timezone ID.
No network call, no database, no server round trip.

```ts
// Correct: derive local wall-clock parts from the IANA ID.
const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: city.tz, hour12: false,
  weekday: 'short', hour: '2-digit', minute: '2-digit',
}).formatToParts(now);
```

**Never** compute an offset and add it. `new Date(utc + 4*3600e3)` is wrong for eight
months of the year in London and wrong for the DST transition weekend everywhere.

Rules:

- Recompute on a **60-second interval**, not per frame. Session state changes at most a
  few times a day; polling it at 60fps is 3,600× the necessary work.
- Only markers whose state actually changed re-render.
- "Today" differs by city — Sydney can be Tuesday while New York is Monday. Weekday is
  read from the city's own zone, never derived from the viewer's.
- Dubai additionally carries `LOCAL HQ`.

### Marker content

```
DUBAI              LONDON             NEW YORK           TOKYO
20:42 GST          17:42 BST          12:42 EDT          01:42 JST
LOCAL HQ           OPEN               OPEN               CLOSED
```

Line 1: city, uppercase, tracked, `--text-2xs`.
Line 2: local time + zone abbreviation, **monospace**.
Line 3: session state — **word plus colour, never colour alone**.

| State | Colour |
| ----- | ------ |
| `OPEN` | `--positive` |
| `CLOSED` | `--fg-tertiary` |
| `PRE` / `POST` | `--warning` |
| `BREAK` | `--warning` |
| Dubai `LOCAL HQ` | `--accent` |

## 5. Earth

- Sphere, 96 segments — clean silhouette at the largest render size without waste.
- ~23.4° axial tilt. A perfectly upright sphere reads as a diagram, not a planet.
- Layered maps: day albedo, night-lights emissive, specular/ocean mask, subtle normal.
- Palette desaturated and dark so markers and DOM labels read on top. This is a data
  surface, not an atlas.
- **No country borders, no political fills, no place labels** other than the seven
  market cities.

### Day/night terminator

- Sun direction computed from **real UTC time and date**, so the terminator both moves
  through the day and tilts correctly with the season.
- Day albedo blends to night-lights emissive across a **soft band**. A hard line looks
  broken.
- Night side is never black — city lights plus faint ambient keep landmass readable.
- Recomputed on the same 60-second tick as session state.

### Atmosphere

Backside-rendered shell with a fresnel falloff: thin, cool, brightest at the limb.
Additive blending, `depthWrite: false`, rendered after the Earth.

**Subtle.** It frames the planet. It is not a neon ring.

## 6. City markers

Markers must not look like map pins. Four elements:

1. **Glowing node** — small emissive disc/sphere on the surface. Sized by importance
   (Dubai largest), coloured by session state. Instanced.
2. **Pulse** — slow expand-and-fade ring on `OPEN` markets. **One pulse every ~4
   seconds**, low amplitude. Slow enough to read as a heartbeat, not a strobe.
   Disabled under reduced motion.
3. **Orbital indicator** — a thin arc segment orbiting the node at constant slow
   angular velocity, signalling a live system. Disabled under reduced motion.
4. **Label** — DOM text with a hairline leader line to the node.

Rules:

- **Far-side markers are occluded**, never drawn through the Earth. Dot-product test
  against the camera direction; fade out through the limb rather than popping.
- **Label collision handling**: when nodes crowd (Hong Kong / Singapore at certain
  angles), drop to node-only and reveal the label on hover or focus.
- Hover raises the node, brightens the glow, shows the label — instantaneous, and
  visually distinct from selection.
- Selection shows the `<CityContextCard>`, positioned to avoid occluding its own node.

## 7. Camera

| Behaviour | Specification |
| --------- | ------------- |
| Projection | Perspective, FOV 40° — long-lens framing reads cinematic; wide FOV reads as a game |
| Idle rotation | Constant Y-axis, one full turn per ~90s |
| Idle pause | Immediate on pointer-down or canvas focus |
| Idle resume | After 4s of quiet, **eased back in** — never a snap |
| Orbit | Damped (`dampingFactor 0.05`), polar clamped to 25°–155° |
| Zoom | Constrained so the user can neither lose the globe nor enter it |
| Pan | **Disabled** |
| Focus transition | 1000ms, `ease-in-out`, rotates the target city to face the viewer and moves the camera in |
| Interruptible | Yes — a new selection retargets from the current position |
| Deselect | Returns to neutral framing, resumes idle |

Camera targets are stored as data so transitions stay declarative and interruptible.

## 8. Fallback and resilience

**WebGL absent** — feature-detect before mounting the canvas. Render `<CityList>` as a
designed panel: all seven cities, local time, session state, same typography and
semantic colours. **A real feature, not an apology.** No "your browser is not
supported" message.

**Context loss** — handle `webglcontextlost` / `webglcontextrestored`. On loss, show
the fallback and attempt restore. Never leave a blank rectangle.

**Error boundary** — wraps the canvas; any throw degrades to the fallback.

**Low-capability devices** — `navigator.deviceMemory` / `hardwareConcurrency` select a
quality tier: reduced texture resolution, disabled orbital indicators, `dpr` capped
at 1.

## 9. Accessibility

- Canvas has `role="img"` and an `aria-label` summarising current global session state.
- **`<CityList>` is the keyboard path.** Arrow-key traversal, Enter to select, which
  drives the same camera focus as a click. It is always in the DOM — not a fallback
  that appears only on failure.
- Selection changes announced through an `aria-live="polite"` region:
  *"London selected. 17:42 BST. Market open."*
- Under `prefers-reduced-motion`: no idle rotation, no pulses, no orbital motion;
  camera changes become instant.
- Every marker colour is paired with its state word.
- The globe is fully skippable in tab order — a keyboard user reaching the dashboard
  should not have to traverse a 3D scene to get to their schedule.

## 10. Rendering discipline

- Canvas `dynamic(() => import(...), { ssr: false })`. Three.js does not run on the
  server, and the 3D chunk must not be in the dashboard's initial payload.
- `dpr={[1, 2]}` — uncapped DPR on a 3× display renders nine times the pixels for no
  perceptible gain.
- **Rendering pauses** when the canvas is off-screen (`IntersectionObserver`) or the
  tab is hidden (`visibilitychange`). The globe rotates, so `frameloop="demand"` does
  not apply — but a rotating globe nobody is looking at is pure waste.
- **Zero allocation in `useFrame`** — scratch `Vector3` / `Quaternion` hoisted to
  module scope and mutated.
- **No React state written per frame.** Frame-loop state lives in refs.
- Motion driven by `delta`, never frame count.
- Geometries and materials reused; markers instanced.
- Textures: sized to on-screen need, KTX2/Basis compressed, mipmapped, modest
  anisotropy. **Progressive load** — a low-resolution Earth appears immediately, full
  resolution swaps in after.
- Full disposal on unmount, verified via `renderer.info` across mount/unmount cycles.

Numeric budgets in [PERFORMANCE.md](PERFORMANCE.md).

## 11. Responsive

| Width | Globe |
| ----- | ----- |
| ≥1440 | Hero, ~62% width, min-height 520. All seven labels (collision-permitting) |
| 1024–1439 | Reduced height ~420, city list moves beneath |
| 768–1023 | Below the fold, ~360 height, labels reduced to Dubai + focused city |
| <768 | Last section. City list is primary; globe is secondary and may be collapsed by default |

Resize updates camera aspect and renderer size. **Never a remount** — that would
reallocate every texture.

## 12. Mapbox — not this

Mapbox GL JS is in the stack for **genuine geographic function only** (a real map of
client locations, if that is ever built). The globe is Three.js. These are separate
concerns and Mapbox must not be loaded on the dashboard route.

---

## Open decisions

1. **Exchange hours must be verified** against each exchange's published calendar
   before launch. The table in §3 is a seed, not a source of truth.
2. **Holiday calendars** are out of scope for v1. If added, they belong in
   `app_settings` or a small static file — not a table, and not a third-party API call
   on the dashboard's critical path.
3. **Earth texture source and licensing** unresolved. NASA Blue Marble and Black Marble
   are public domain and the likely choice; final resolution tier to be set against the
   texture-memory budget in [PERFORMANCE.md](PERFORMANCE.md).
4. **Zone abbreviations** (`GST`, `BST`, `EDT`) come from `Intl` `timeZoneName: 'short'`,
   which is locale-dependent and occasionally gives `GMT+4` rather than `GST`. If the
   output is unacceptable, a small static abbreviation map per city is the fallback —
   still derived from the IANA ID for the offset, never hardcoding the offset itself.
