---
name: 3d-design
description: Three.js and React Three Fiber architecture for the Trading Academy CRM — scene structure, cameras, lighting, materials, animation loops, WebGL fallbacks, disposal, and reduced-motion support. Use when building, reviewing, or debugging any 3D scene, R3F component, shader, camera rig, or drei helper in this project.
---

# 3D Design — React Three Fiber

## When to use

Any work involving Three.js, React Three Fiber, `@react-three/drei`, shaders, canvas
setup, camera behavior, WebGL context handling, or 3D performance in this project.
For the market globe specifically, load `globe-design` alongside this.

## Principle: 3D is a defining characteristic, not decoration

3D in this product exists to make global market state legible at a glance. Every 3D
element must answer: *what does the third dimension let the user understand that a flat
chart could not?* If there is no answer, it should not be 3D.

The aesthetic is **institutional and cinematic** — a mission-control display, an
executive briefing surface. It is not a game, not cyberpunk, not a demo reel.

## Responsibilities

1. Structure R3F scenes as ordinary React component trees with clear boundaries.
2. Keep the render loop cheap and allocation-free.
3. Guarantee the app works when WebGL is unavailable or the context is lost.
4. Dispose every resource the component created.
5. Make 3D content reachable and understandable without a mouse.
6. Hold a stable frame budget on mid-range laptops, not just the dev machine.

## Rules

### Scene architecture

- One `<Canvas>` per 3D surface. Do not nest canvases; do not mount several heavy
  canvases on one route.
- Scene graph is a React tree: `<Canvas>` → lighting rig → subject → effects →
  controls. Group logically (`<Earth>`, `<CityMarkers>`, `<Atmosphere>`).
- The `<Canvas>` component and everything under it live behind
  `next/dynamic` with `ssr: false`. Three.js does not run on the server.
- State that the render loop reads lives in refs or a store read imperatively —
  **not** in React state that re-renders on every frame.
- Keep DOM overlays (labels, cards, legends) as real DOM layered over the canvas.
  HTML text is sharper, accessible, and cheaper than 3D text.

### Cameras

- Prefer `PerspectiveCamera` with a modest FOV (35–50°) — long-lens framing reads as
  cinematic; wide FOV reads as a video game.
- Camera moves are choreographed and eased, never instant snaps. 600–1200ms with an
  ease-in-out for a focus transition.
- Damped orbit controls (`enableDamping`, `dampingFactor ≈ 0.05`). Constrain polar
  angle and zoom range so the user cannot lose the subject or fly inside it.
- Disable pan by default on a globe — orbit and zoom only.
- Store camera targets as data so transitions are declarative and interruptible.

### Lighting

- Three-light logic: a key directional light, a low-intensity fill or hemisphere, and
  a rim light to separate the subject from the dark background.
- Use an HDR environment (`<Environment>`) for physically plausible material response,
  at low intensity. Keep the background transparent or a project-token color.
- `ACESFilmicToneMapping`, correct color space, exposure tuned once and kept.
- Emissive materials for markers and glow — not more lights. Every additional real-time
  light costs.
- No lens flares, no god rays, no volumetric fog as a style choice.

### Materials

- `MeshStandardMaterial` by default; `MeshPhysicalMaterial` only when clearcoat or
  transmission is genuinely needed.
- Prefer material properties (roughness, metalness, emissive) over post-processing.
- Custom shaders only where a stock material cannot express the effect. Comment the
  intent of any GLSL.
- Textures: power-of-two, compressed (KTX2/Basis) where possible, sized to on-screen
  need — not 4K because it was available. Generate mipmaps; set anisotropy modestly.
- Reuse geometries and materials across instances. Never create either inside
  `useFrame`.

### Animation

- All frame work in `useFrame`. Nothing on `setInterval`/`requestAnimationFrame`
  outside R3F's loop.
- Use `delta`, not frame count, for time-based motion so speed is framerate-independent.
- Zero allocation inside `useFrame`: hoist `Vector3`/`Quaternion`/`Matrix4` scratch
  objects to module or ref scope and mutate them.
- Mutate `ref.current` directly; do not `setState` per frame.
- Use `invalidate()` with `frameloop="demand"` for scenes that are static between
  interactions.

### WebGL fallback and resilience

- Feature-detect WebGL before mounting the canvas. If unavailable, render a designed
  2D fallback that conveys the same information (for the globe: a list or flat map of
  city market states). The fallback is a real feature, not an error message.
- Handle `webglcontextlost` / `webglcontextrestored`. On loss, show the fallback and
  attempt restore; never leave a blank rectangle.
- Wrap 3D in an error boundary that degrades to the fallback.
- Respect a low-power or `deviceMemory`-constrained device by reducing quality tier
  rather than failing.

### Accessibility and reduced motion

- Read `prefers-reduced-motion`. When set: stop idle rotation, shorten or remove
  camera transitions, keep the scene static and readable.
- Every interactive 3D object has a keyboard-reachable DOM equivalent. A city marker
  must be selectable from a focusable list, not only by clicking a mesh.
- Announce selection changes via a live region.
- The canvas itself gets a meaningful `aria-label` and a text summary of its content.

### Disposal

- Dispose geometries, materials, textures, and render targets on unmount.
- Remove event listeners; cancel in-flight loaders.
- Verify with `renderer.info` that geometry/texture counts return to baseline after
  unmount and remount.

## Anti-patterns

- Gaming or cyberpunk visual language: neon wireframes, scanlines, glitch effects,
  chromatic aberration, heavy bloom, hexagon grids, HUD brackets.
- 3D used where a table or chart communicates better.
- 3D text meshes for labels.
- `setState` inside `useFrame`.
- Allocating vectors, colors, or arrays per frame.
- Loading a 4K texture for a 400px-tall element.
- Uncapped `devicePixelRatio` on high-DPI displays.
- Orbit controls with no constraints, letting the user fly inside the mesh.
- Multiple heavy canvases mounted on a single route.
- Shipping without a non-WebGL path.
- Post-processing stacks added "because it looks better" without a frame-cost check.

## Quality checklist

- [ ] Every 3D element justifies the third dimension.
- [ ] Canvas dynamically imported, `ssr: false`.
- [ ] No per-frame allocation; scratch objects hoisted.
- [ ] No React state written from `useFrame`.
- [ ] `delta`-based motion.
- [ ] Camera constrained; transitions eased and interruptible.
- [ ] `devicePixelRatio` capped (typically `[1, 2]`).
- [ ] Textures sized and compressed appropriately; geometry/material instances reused.
- [ ] WebGL absence and context loss both produce the designed 2D fallback.
- [ ] `prefers-reduced-motion` honored.
- [ ] Keyboard path to every 3D interaction; live region for selection.
- [ ] Full disposal verified via `renderer.info` across mount/unmount cycles.
- [ ] Frame budget measured on a mid-range machine, not only the dev machine.
- [ ] Reads as institutional and cinematic, not as a game.
