---
title: Three.js 2D renderer port
type: refactor
date: 2026-08-14
status: approved-after-three-rounds
target: top-down Three.js 2D
---

# Three.js 2D renderer port specification

## 1. Decision

SI World will replace its Skia world renderer with a top-down Three.js 2D renderer.

The target is the middle panel in `spikes/001-threejs-pixel-villa/comparison-three-way.png`.
It is not the isometric 2.5D panel.
The user has approved this top-down visual direction and authorized autonomous delivery.
No later stage waits for another subjective approval.

The port keeps the current game, simulation, maps, saves, UI, audio, and Electron shell.
It replaces the rendering layer and then removes the old renderer stack.

This specification supersedes renderer-only Skia requirements in `spec.md` and `docs/specs/2026-08-11-skia-procedural-vfx.md`.
It also supersedes earlier recommendations against an engine change.
Their simulation, accessibility, timing, performance, lifecycle, and rollback contracts still apply.

The port is complete only after every gate in this specification passes.
Until then, the current Skia renderer remains the rollback path.

No engineering process can promise zero defects.
This specification instead prevents a big-bang cutover, locks behavior before work starts, and requires evidence at every stage.

## 2. Why this decision changed

The earlier renderer review found no measured reason to migrate.
The new Three.js villa spike adds a player-visible reason: richer top-down light, shadow, and room depth while keeping 2D art.

The spike is evidence for the visual direction only.
It is not production code and does not prove:

- movement or input;
- camera pan, resize, and gradual zoom;
- full maps or map transfers;
- depth sorting and roof occlusion;
- procedural effects;
- saves and restart behavior;
- browser export or packaged Electron behavior;
- maximum-load performance;
- WebGL resource cleanup or context recovery.

The comparison is not geometry-matched.
The Three.js room uses a different arrangement and camera.
Its gain comes from content composition, additive glow sprites, duplicate shadow sprites, and tone mapping as well as the renderer.

The port must compare the same compiled map, state, camera, atlas, clock, and viewport before it credits Three.js with a visual gain.

The production port must prove all of those items before cutover.

## 3. Goals

1. Keep SI World a top-down 2D pixel game.
2. Match every current game behavior before adding visual gains.
3. Reach the approved Three.js 2D villa look with restrained lighting and pixel shadows.
4. Preserve the pure TypeScript simulation boundary.
5. Preserve browser playtesting and hidden Electron verification.
6. Preserve existing saves and display preferences.
7. Hold 60 FPS in the current maximum-load qualification.
8. Remove Skia, CanvasKit, old renderer code, old renderer checks, and obsolete package artifacts after cutover.

## 4. Non-goals

> **Amended 2026-08-17.** `docs/specs/2026-08-16-threejs-2-5d-renderer.md` amends the three items
> marked below. They remain non-goals **for this 2D port and for the shipping 2D renderer**. They
> are in scope for the separate 2.5D renderer, which is a second display path and does not modify
> the 2D one. Every other item on this list stands unchanged for both renderers.

The port will not add:

- an isometric or perspective camera; *(2.5D uses a tilted **orthographic** camera; perspective and isometric stay banned in both)*
- 2.5D room geometry; *(amended — in scope for the 2.5D renderer only)*
- 3D models, physics, navigation, or collision; *(imported model files stay banned in both; 2.5D uses generated box geometry only)*
- PBR materials, bloom, depth of field, or post-processing chains;
- dynamic Three.js lights or real-time shadow maps; *(amended — in scope for the 2.5D lit path only, with a mandatory no-lights fallback)*
- a map editor;
- React Three Fiber or another scene framework;
- new map geometry, props, routes, interactions, quests, or NPC logic;
- a save-schema or `layoutRevision` change;
- mobile-native support;
- a permanent second renderer or player-facing renderer switch.

## 5. Locked current baseline

The following contracts are authoritative for the port.

### 5.1 Product and art

- World tiles remain `32×32` logical pixels.
- World characters remain `24×30` atlas cells.
- The world remains top-down and orthographic.
- Character art remains upright billboard art.
- Sampling remains nearest-neighbor with no mipmaps.
- Whole-pixel placement remains the target.
- `1×`, `2×`, and `3×` remain the strict crispness review scales.
- Fractional zoom may repeat or skip pixels, but it must never blur them.
- Wheel and HUD input keep the current `10%` step.
- Previously saved zoom values on `5%` boundaries remain valid and render correctly.
- Lighting stays restrained and comes from the upper-left visual direction.
- Room purpose, people, routes, doors, and activity stay more readable than decoration.

### 5.2 Game behavior

- Click-to-move, pathfinding, collision, and object approach selection do not change.
- Middle-button drag pans the camera.
- The mouse wheel changes zoom at the pointer.
- `F` centers the camera.
- `Q`, Escape, HUD controls, panels, and conversation input do not change.
- Doors keep their existing closed, opening, open, and closing timing.
- Same-map interiors keep the current roof hide and restore rules.
- Movement direction, walk frames, talk poses, reactions, wobble, and reduced motion do not change.
- Selection, destination, journal, failure, and interaction feedback remain visible.
- Simulation ticks, schedules, quests, conversations, audio, and saves remain renderer-independent.

The smoke-only `legacy` and `enhanced` art modes remain a qualification contract until final acceptance.
They change ground presentation only.
They must keep identical non-presentation draw counts, state, camera, and fixture inputs.
For Three.js, `staticBatchCount` means the submitted static ground-atlas batch groups before dynamic props, actors, markers, and effects.
Legacy uses one static ground batch.
Enhanced may add at most one ground-detail batch.

### 5.3 Data and compatibility

- `WorldState` remains authoritative.
- The renderer never mutates domain or world state.
- Existing saves load without migration caused by this port.
- Save version, engine version, content version, map geometry hashes, and `layoutRevision` do not change for renderer-only work.
- Presentation preference schema version `1` remains valid.
- Saved camera coordinates and world zoom keep the same logical meaning.
- The temporary renderer selector is not saved in a game save or presentation preferences.

### 5.4 Runtime and security

- Browser development remains first-class.
- Expo continues to export the web build.
- Electron Forge continues to package macOS and Windows builds.
- The packaged app continues to use `app://game/`.
- `nodeIntegration` remains off.
- `contextIsolation`, sandboxing, CSP, and navigation locks remain on.
- No remote texture, script, font, shader, model, or renderer asset is allowed.
- Audio stays muted in automated Electron checks.
- Electron checks stay hidden unless a native-window behavior truly requires otherwise.

### 5.5 Baseline evidence recorded on 2026-08-14

- `npm run spike:threejs:check`: passed.
- `npm run typecheck`: passed.
- `npm run check:boundaries`: passed.
- Seven focused suites passed with 85 tests.
- The focused suites covered the atlas, camera, world frame, responsive layout, renderer readiness, package smoke, and Electron security.

The implementation plan must add a fresh full-suite baseline before renderer changes start.

## 6. Target architecture

### 6.1 Authority boundary

The dependency direction remains:

```text
domain + world
    ↓
application runtime
    ↓
pure world render frame
    ↓
Three.js 2D surface
    ↓
React Native Web UI overlays
    ↓
Electron shell
```

`src/domain/` and `src/world/` must not import Three.js, React, Electron, Expo, or renderer files.
The boundary checker must add `three` to the forbidden packages for those pure roots.
It must use a separate renderer-neutral manifest, initially containing `src/render/world-frame.ts`, `src/render/atlas.ts`, `src/render/depth.ts`, `src/render/protagonist-wobble.ts`, `src/render/camera.ts`, `src/render/journal-markers.ts`, `src/render/district-lighting.ts`, `src/render/atmosphere.ts`, `src/render/smoke-geometry.ts`, `src/render/vfx/procedural-effects.ts`, `src/render/vfx/clock.ts`, `src/render/vfx/seed.ts`, and `src/render/vfx/types.ts`.
Any pure render module imported by the frame must enter that manifest in the same change.
Manifest files may import each other, `src/domain/`, `src/world/`, and generated atlas JSON.
They must reject `three`, React, React Native, DOM, Electron, Expo, `src/application/`, `src/ui/`, and Three.js surface imports.
`WorldScene.tsx` may import a renderer surface component, but it must not import `three` or own a Three.js object.

### 6.2 World scene ownership

`WorldScene` remains the game-screen controller during the port.
It continues to own:

- authoritative runtime state;
- movement advancement;
- camera state;
- input callbacks;
- save and autosave requests;
- panels, dialogue, HUD, and feedback;
- smoke-test state labels.

Render-list construction moves behind one pure render-frame function.
Both temporary renderers consume that same immutable frame.

The implementation extends the existing renderer-neutral `src/render/world-frame.ts` contract first.
It must not create a competing second frame model unless a measured limitation requires a specification amendment.

This split is required.
Duplicating controller logic inside a second renderer is forbidden.

### 6.3 Pure world render frame

The frame contains only serializable renderer inputs:

- map and presentation hashes;
- camera and viewport;
- visible floor, transition, decal, prop, door, wall, character, effect, and roof entries;
- exact atlas cell IDs and source rectangles;
- logical world positions, pivots, rotations, scales, colors, and opacity;
- explicit layer and grounded-depth order;
- shadow, threshold, marker, and light primitives;
- roof visibility and shelter cells;
- reduced-motion state;
- the controller-sampled animation timestamp and fixed VFX age step;
- draw counts and stable IDs for evidence.

The frame must not contain Three.js objects, React nodes, DOM nodes, callbacks, timers, or mutable shared arrays.

Given the same validated inputs, the frame must be deeply equal after save reload and app restart.

### 6.4 Three.js surface

The production surface uses Three.js directly.
It does not add React Three Fiber.

It owns one:

- `WebGLRenderer`;
- `Scene`;
- `OrthographicCamera`;
- loaded world-atlas texture;
- small generated glow texture;
- bounded set of shared materials;
- bounded set of atlas and primitive batch geometries;
- animation-frame loop.

The surface is created once per mount.
It is not recreated for normal React renders, movement frames, zoom, resize, map changes, or panel changes.
The loop only presents the latest immutable world render frame.
It never advances simulation, movement, pose, door, roof, transfer, or VFX time.
`WorldScene` samples all time once, builds one frame, and gives that same frame to either renderer.

### 6.5 Coordinate contract

Game coordinates remain unchanged: `x` grows right and `y` grows down.

The Three.js adapter performs the only axis conversion:

```text
threeX = worldX
threeY = -worldY
```

The orthographic camera uses:

```text
left   = camera.x
right  = camera.x + surface.width / camera.zoom
top    = -camera.y
bottom = -(camera.y + surface.height / camera.zoom)
```

Every camera change calls `updateProjectionMatrix()`.
Input continues to use the existing screen-to-world and screen-to-tile functions.
Three.js raycasting is not used for gameplay input.

This preserves current click priorities and avoids a second hit-testing system.

## 7. Rendering contract

### 7.1 Renderer settings

The initial production settings are:

```text
renderer: WebGLRenderer
WebGL requirement: WebGL 2
antialias: false
alpha: false
powerPreference: high-performance
outputColorSpace: SRGBColorSpace
pixelRatio: exact tested devicePixelRatio
canvas CSS size: logical surface size
drawing buffer: logical surface size × devicePixelRatio
```

The parity renderer uses no tone mapping.
The visual-enhancement phase may enable ACES filmic tone mapping only after the Stage 2 fixed-camera acceptance manifest passes.
Exposure remains a recorded calibration value, not a hidden magic number.
From that phase onward, smoke and browser-test capture retain an unsaved `none | aces` override so no-tone parity and production-ACES contrast can both be rerun.
Production ignores this override outside test or smoke mode.

### 7.2 Atlas texture

Production loads `assets/generated/world-atlas.png` once.
It uses the existing generated atlas index.

The texture contract is:

```text
colorSpace = SRGBColorSpace
magFilter = NearestFilter
minFilter = NearestFilter
generateMipmaps = false
anisotropy = 1
wrapS = ClampToEdgeWrapping
wrapT = ClampToEdgeWrapping
```

The production renderer must use the atlas directly with UV coordinates.
It must not copy every sprite into a separate canvas or create one texture per sprite.
That spike technique is forbidden in production.

Atlas extrusion, bounds, public IDs, transparent RGB, and no-bleed checks remain unchanged.

### 7.3 Batching and draw order

Visible atlas cells are written into quad batches.
The renderer must not create one `Sprite`, material, geometry, or texture per tile.

The core world layers remain:

```text
floor → prop → shadow → character → effect → wall → roof
```

The full composite order is locked as:

```text
floor and ground detail
→ doors and door wear
→ contact shadows and thresholds
→ selection ring
→ grounded props and characters
→ effects
→ walls
→ roofs
→ shelter shade
→ district lighting
→ atmosphere
→ destination pulse
→ journal markers
→ failure marker
→ React Native Web selection marker and UI
```

The current Skia renderer matches the core world layers and the pre-port composite order.
The port intentionally moves destination, journal, and failure feedback above shelter shade, district lighting, and atmosphere.

Each entry has an explicit layer value.
Grounded entries alone use ground-contact depth with a stable-ID tiebreak.

Grounded props and characters keep the existing ground-contact sort and stable-ID tiebreak.
Transparent atlas batches use explicit render order with depth writing disabled.
The port must not rely on Three.js transparent-object sorting for gameplay order.
Set `renderer.sortObjects = false`.
Insert and submit batches in full composite order, assign matching `renderOrder` values, and disable depth testing and depth writing for transparent 2D batches.
No target layer may depend on default transparency sorting or incidental `z` values.

At maximum load:

- there is one world-atlas texture;
- there is at most one glow texture;
- atlas rendering uses no more than 12 draw calls;
- all world rendering, including primitives and effects, uses no more than 24 draw calls;
- no rendered tile owns a standalone GPU material.

If a measured scene cannot meet these limits, the specification must be amended before work continues.
The implementation may not silently relax them.

### 7.4 Pixel placement

The frame preserves logical positions from current movement and camera code.
The renderer converts them to drawing-buffer pixels without linear filtering.

The following cases must have no blur or atlas bleed:

- DPR `1`, `1.25`, `1.5`, and `2`;
- zoom `1×`, `2×`, and `3×`;
- every `10%` input step and compatible saved values on `5%` boundaries;
- pan at every map edge;
- resize at each supported window size;
- stationary, walking, talking, and wobbling characters.

Native `1×` frames are the primary art evidence.
Enlarged `3×` crops are debugging evidence only.
The full-map matrix uses `1×`, `2×`, and `3×`.
A packaged Three.js zoom-sampling smoke renders every `0.05` value from `1.00` through `3.00`.
It records the presented zoom and live atlas sampling state after each frame.
The committed Stage 0 `zoom-sampling-v1.json` remains a comparator self-test, not live renderer evidence.

### 7.5 Lighting and shadow target

The port first reaches visual parity.
Only then does it add the approved Three.js 2D look.

The approved enhancement uses flat GPU layers:

- current authored contact shadows;
- current upper-left long-shadow direction;
- threshold and wall-base accents;
- district tint;
- small additive pixel glow sprites at authored lamp and effect positions;
- restrained shelter shade;
- existing atmosphere treatment.

It does not use dynamic lights, real-time shadow maps, 3D normals, blur, bloom, or a post-processing framework.

The spike label “GPU light map” is not a production contract.
The production design is a screen-space lighting overlay built from batched quads and existing deterministic lighting data.

Stage 0 creates `scripts/qualification/compare-renderer-frames.ts`, its focused tests, and the visual-acceptance manifest schema.
The tool consumes matched PNG captures plus renderer-neutral JSON masks.
The manifest records source commit, fixture, camera, DPR, zoom, tone mapping, exposure, important-object masks, and named light and shadow sample regions.

For each sRGB channel normalized to `0..1`, linearize with:

```text
linear(c) = c / 12.92                                  when c <= 0.04045
linear(c) = ((c + 0.055) / 1.055) ^ 2.4              otherwise
luminance = 0.2126 × linear(r) + 0.7152 × linear(g) + 0.0722 × linear(b)
contrast = (max(maskMedian, ringMedian) + 0.05) / (min(maskMedian, ringMedian) + 0.05)
```

The local background ring is two logical pixels around the mask at native `1×`.
It excludes other required masks and transparent pixels.
Masks come from stable frame IDs, logical bounds, and the atlas alpha footprint for player, NPC, active door, route, selection, destination, journal, and failure feedback.

No-tone-mapping parity passes only when:

- every matched Skia baseline mask first reaches `1.05` absolute local contrast; a lower value invalidates the mask instead of passing by ratio;
- required mask IDs, logical bounds, hit bounds, and visible pixel coverage match exactly;
- outside required masks, no more than `0.5%` of pixels have any sRGB channel delta above `2/255`;
- no required-mask pixel has an sRGB channel delta above `8/255`;
- every contrast ratio meets the hard readability floor below.

Stage 3 evidence amendment, dated 2026-08-15:

Native raster parity means DPR `1` at zoom `1×`.
It keeps the exact per-pixel limits above.

Scaled raster parity covers every other DPR or zoom.
Skia and WebGL use different edge-coverage rules even after their drawing-buffer size, camera, and CSS placement match.
Scaled frames therefore keep exact state, hashes, mask IDs, logical bounds, hit bounds, visible coverage, and the `90%` contrast floor, while using these raster-neutral full-frame RGB limits:

- mean absolute channel delta no greater than `1/255`;
- root mean square channel delta no greater than `3/255`;
- no more than `0.2%` of comparable pixels have a maximum RGB channel delta above `32/255`.

Both-transparent pixels are excluded from those three measurements.
Native player and active-door readability masks keep the Stage 2 atlas-silhouette footprint.
Scaled player masks use the full opaque atlas footprint so enlarged interiors contribute to the `90%` contrast check.
The report still records native outside-mask and required-mask deltas for every scaled frame, but does not use them as scaled pass/fail gates.
Any threshold change requires a dated specification amendment with captured evidence before code changes.

Stage 3 audit amendment, dated 2026-08-15:

The final Stage 3 Opus audit found four measurement defects and one ownership defect.
This amendment defines their replacements before the comparator changes.

**Three.js feedback ownership stays a Stage 4 move.**

The ownership finding asked Stage 3 to draw destination, journal, and failure feedback
from Three.js instead of the shared Skia overlay.
A Stage 3 Fable audit proved that move breaks the locked composite order.
`DistrictLightingOverlay` and `AtmosphereOverlay` are React siblings mounted after the
Three.js canvas, and no sibling sets a stacking order, so DOM order is paint order.
Feedback drawn inside the Three.js canvas therefore composites BELOW lighting and
atmosphere, while the Skia overlay composites above them.
That inverts the order this specification locks and would diverge under any non-neutral
lighting.

Stage 3 therefore keeps feedback in the shared above-lighting overlay.
Stage 4 already owns the correct sequence: task 7 stops mounting the three React overlays
on the Three.js path, and task 6 then draws feedback after all lighting and atmosphere
batches. Feedback ownership moves there, with the same zoom `1`, `2`, and `3` geometry
check.

While that move is pending, the three Stage 3 feedback masks — `destination-pulse`,
`journal-*`, and `failure-marker` — are drawn by the same shared Skia overlay on both
sides. They therefore prove that feedback still renders, not that Three.js renders it.
Stage 3 records that limit here rather than in the fixture schema, and Stage 4 makes
those masks renderer-discriminating.

**Scaled parity gains bounded mask-local limits.**

The full-frame raster-neutral limits above stay unchanged.
They are a frame average, so a small mask can drift far while the frame still passes.
The native `8/255` per-pixel maximum stays forbidden for scaled frames, because measured Skia and WebGL edge coverage makes it invalid.
Scaled frames therefore add these bounded limits, measured over required-mask pixels only:

- mask mean absolute RGB channel delta no greater than `10/255`;
- mask RGB root mean square channel delta no greater than `20/255`;
- no more than `12%` of mask pixels have a maximum RGB channel delta above `32/255`.

Scaled frames also gain one outside-mask ceiling:

- no more than `12%` of outside-mask pixels have any channel delta above `2/255`.

The measured maxima from the passing Stage 3 captures were `8.4167`, `17.4373`, `0.10442`, and `0.10372`.
Each ceiling therefore keeps evidence margin above the observed worst case.
Native DPR `1`, zoom `1×` gates stay exactly as written above.

**Saved-zoom evidence must compare rendered images.**

The Stage 3 zoom report recorded presented zoom and atlas texture settings only.
Those prove frame presentation and sampling state, not rendered pixels.
Zoom sampling therefore runs for both Skia and Three.js at DPR `1`.
At every value from `1.00` through `3.00` in `0.05` steps, both renderers capture the same fixed player crop from the hidden packaged window.
The main-process crop geometry is identical between renderers.
The runner decodes the paired PNG crops and measures them with the exported comparator RGB helper.
It records per-zoom mean absolute RGB delta, RMSE, and ratio above delta `32`, and fails any zoom above the approved native or scaled metric.

Zoom-crop limits are whole-crop averages and are NOT the mask-local ceilings above.
The player sprite covers a small share of a `160×160` crop, so mask-local ceilings would let a badly wrong sprite pass.
Zoom `1` at DPR `1` is a native raster comparison and keeps the native limits `1`, `3`, and `0.002`.
Every other saved zoom uses crop limits derived from the observed crop maxima with margin:

- mean absolute RGB channel delta no greater than `3/255`, against an observed `1.85`;
- RGB root mean square channel delta no greater than `12/255`, against an observed `7.86`;
- no more than `4%` of crop pixels above delta `32`, against an observed `0.0204`.

Raw zoom crops stay in ignored `output/` scratch space.
The measured report is committed.

**Visible coverage becomes content-derived readable coverage.**

Visible coverage counted non-transparent canvas pixels.
Every packaged screenshot is opaque, so that count could never fall and proved nothing about sprite presence.
Readable coverage replaces it and uses the existing two-logical-pixel ring median.
A mask pixel is readable when its local contrast against that ring median is at least `1.02`.

- Native frames keep the exact readable-pixel set and count.
- Scaled frames keep at least `95%` of baseline readable coverage.

The measured scaled minimum retention was about `0.9861`, so `95%` keeps evidence margin.
The existing `1.05` minimum baseline median contrast and `90%` contrast-retention rules stay unchanged.
The report records baseline readable pixels, candidate readable pixels, and retention.

**The finite parity manifest gains a fallback-rendering case.**

The procedural-VFX package report covers fallback behavior separately.
The Stage 3 parity fixture set never exercised the Three.js fallback-circle batch.
Locked all-map cases therefore carry `vfxMode: 'procedural' | 'circle'`.
One DPR `1` circle-mode case uses the known visible `patio-fire` effect.
The all-map package runner launches only the required DPR and mode combinations.
Renderer parity state gains `fallbackEffectIds` from `worldFrame.fallbackEffects`, and the fallback case asserts its locked effect is present.
Both renderers capture that case and it joins the committed fixture set.
The procedural cases stay unchanged.

Stage 4 audit amendment, dated 2026-08-16:

Native raster parity above assumes both renderers feed the same compositing path.
Stage 4 deliberately ends that for district lighting and atmosphere.
Skia composites those as React overlay layers over the canvas, in float, rounding once.
Three.js draws them inside the canvas, blending into an eight-bit framebuffer.
About `0.8%` of pixels then land on a different integer, with no visible or structural difference.

Measurement established this is not a defect.
Layer stacking, alpha quantization, and premultiplied alpha were each tested and excluded.
Precomposing the bands in sRGB gave results identical to blending them separately, which is expected because sRGB source-over is associative.
The remaining difference cannot be removed without a floating-point render target and a single resolve, which section 7.1 forbids.

A frame whose layer ownership moved therefore qualifies under the raster-neutral RGB family already approved for scaled frames:

- mean absolute channel delta no greater than `1/255`;
- root mean square channel delta no greater than `3/255`;
- no more than `0.2%` of comparable pixels above a maximum RGB channel delta of `32/255`.

No threshold is relaxed and no new number is introduced.
This selects which approved gate applies to a deliberately changed configuration, exactly as scaled frames already do.
Every other rule is unchanged: required mask IDs, logical bounds, hit bounds, readable coverage, the `1.05` minimum baseline contrast, and the `90%` contrast-retention floor all still apply per pixel-set.
The manifest records the change with `compositingChanged: true`, so no frame can silently take the relaxed path.

Measured on the Stage 4 villa fixtures: mean `0.327` to `0.358`, RMSE `0.848` to `0.936`, ratio above delta 32 `0.00005` to `0.000205`.
Those sit three to ten times inside the limits.

Stage 5 audit amendment, dated 2026-08-16:

Stage 5 moves the destination, journal and failure feedback into the renderer, so
`compositingChanged` now also covers those masks.

Mask-local per-pixel limits assume both sides rasterize the same way.
A moved vector layer does not: Skia antialiased its strokes, and the Three.js batches draw hard-edged geometry by design.
On a moved-layer frame the mask-local limits are therefore not applied.

Readability is still enforced per mask, and nothing about it is relaxed:

- required mask IDs, logical bounds and hit bounds still match exactly;
- readable coverage still holds its native exact-set rule and its scaled `95%` retention rule;
- the `1.05` minimum baseline contrast and the `90%` contrast-retention floor still apply.

Measured on the Stage 5 failure marker after the renderer defect below was fixed: retained contrast `0.9887` against the `0.9` floor, readable coverage `136` against a baseline of `135`.
A focused test proves a frame without `compositingChanged` still receives the mask-local limits.

That defect is worth recording, because it was the real cause rather than any threshold.
`addLine` emits its quad wound by segment direction, so a line running the other way was back-facing, and the material's default `FrontSide` culled it.
The failure marker rendered as four corner blobs with a hole through its middle, and its mask median sat on background.
Setting `DoubleSide` restored it and moved retained contrast from `0.5977` to `0.9887`.

Stage 0 proves the tool with one identical-image pass fixture and one deliberately changed fail fixture.
Stage 2 records the first matched Skia and Three.js results with `NoToneMapping`.
ACES is forbidden until no-tone-mapping parity passes.

The hard readability floor is:

- player, NPC, active door, route, selection, destination, journal, and failure masks keep at least `90%` of their matched Skia local-luminance contrast;
- their hit bounds, visible pixel coverage, and frame IDs do not shrink or disappear;
- nearest-neighbor and atlas-bleed checks pass;
- lamp centers are brighter than their recorded unlit comparison regions;
- authored long shadows remain pixel-edged and extend lower-right from the upper-left light direction;
- shelter, district tint, and atmosphere never cover a required feedback mask.

Codex is the autonomous visual decider under the user's direction.
It inspects the decoded native `1×` captures and the manifest.
The stage-specific Fable audit reviews the manifest, implementation, and evidence contract.
If any locked threshold regresses, the stage fails and must be fixed or rolled back without asking the user to intervene.

### 7.6 Effects

Procedural VFX keep their current deterministic seeds, geometry sampling, culling, step rate, and reduced-motion rules.
Only the drawing adapter changes.

The renderer converts sampled rectangles and fallback circles into one dynamic primitive batch.
It does not move VFX timing or randomness into Three.js.

The existing VFX evidence schema remains valid unless a named schema revision is approved.

### 7.7 Roofs and shelter

Roof group selection remains in pure game/presentation code.
The renderer draws only the visible roof entries in the render frame.

Entering a valid same-map interior hides the entered roof group.
Leaving restores it.
Walls, floors, furniture, NPCs, doors, and input remain active.

Shelter shade is rendered from the same interior cells and district lighting data.
It cannot alter collision or roof ownership.

### 7.8 UI and portraits

HUD, panels, dialogue, text input, focus, accessibility nodes, and layout remain React Native Web UI.
They are not moved into WebGL.

Skia-backed portraits and new-game atlas previews must be replaced before Skia is removed.
They should use the existing atlas through the smallest web-compatible crop method.
They must not create extra WebGL renderers or contexts per portrait.

The current portrait IDs, expressions, scale choices, labels, and layout remain unchanged.

## 8. Input and accessibility

`WorldInput` remains the only world pointer and keyboard listener.
The Three.js canvas does not install a second gameplay input system.

The port must preserve:

- click priority: UI, NPC, object, interaction, floor;
- exact NPC bounds based on the visual foot;
- pointer-anchored wheel zoom;
- middle-button pointer capture and pan;
- keyboard locks while panels or conversation input are active;
- minimum pointer targets and text sizes;
- reduced-motion behavior;
- live region announcements;
- all existing smoke-test selectors and labels, except the generic renderer-ready field described below.

The canvas receives an accessible label through its existing world wrapper.
The canvas itself is not a replacement for accessible DOM state.

## 9. Loading, readiness, failure, and cleanup

### 9.1 Loading

The loading shell uses renderer-neutral copy.
Shell readiness and world-renderer readiness are separate contracts.

Shell readiness means fonts, generated world-atlas and audio resources, the secure desktop bridge, and the new-game or load-game UI are usable.
The new-game menu can become shell-ready without creating a world or WebGL context.

World-renderer readiness starts only after an active game has produced a world render frame.
The app then loads the world atlas and Three.js renderer before reporting world-renderer readiness.

The atlas SHA-256 check remains mandatory.
World-renderer readiness always requires:

- the atlas has loaded and decoded;
- the canvas has a non-zero logical and drawing-buffer size;
- one non-blank world frame renders;
- the secure desktop bridge matches its closed contract.

The temporary Skia variant also requires CanvasKit readiness.
The Three.js variant also requires WebGL 2 and successful shader compilation.

Package smoke must prove this sequence:

```text
shell ready → start or load game → active world frame → world renderer ready
```

Both readiness signals use the existing `si-world:report-renderer-ready` IPC channel.
The shell report starts smoke automation.
Automation may start or load the game, but it must wait for the world report before reading world pixels, performance, or renderer evidence.
Stage 2 changes `src/application/game-readiness.ts`, the temporary reporter in `src/render/SkiaProof.tsx`, `electron/main/index.ts`, the preload bridge, smoke parsers, and readiness tests atomically.

### 9.2 Readiness contract

Stage 2 replaces the current report with a closed, temporary discriminated union.
An unsaved `SI_WORLD_TEST_RENDERER=skia|threejs-2d` flag selects the packaged smoke renderer only when smoke mode is active.
Browser development and test harnesses use `?testRenderer=skia|threejs-2d`.
Production ignores the flag and keeps the stage's approved default.
Neither selector is persisted.

Both variants contain:

```text
schemaVersion: 2
phase: "shell" | "world"
appUrl: "app://game/"
assetsLoaded: true
bridgeKeys: the existing exact tuple
nodeAccessBlocked: true
```

The shell variant also contains `shellReady: true`.
The temporary Skia world variant contains:

```text
phase: "world"
rendererKind: "skia"
canvasKitReady: true
worldFrameReady: true
```

The Three.js world variant contains:

```text
rendererKind: "threejs-2d"
webgl2Ready: true
worldFrameReady: true
```

The strict Zod union, renderer report builder, main-process phase controller, preload type, security assertions, renderer-readiness tests, and package-smoke tests change together in Stage 2.
The existing IPC channel and bridge key remain unchanged.
Stage 5 transfers reporting into the renderer-neutral root shell without changing the report schema.
Stage 7 removes the test flag, Skia variant, `canvasKitReady`, and every Skia-only parser branch.

| Stage | Readiness state |
|---|---|
| 0–1 | current Skia report |
| 2–4 | schema 2 shell plus temporary `skia | threejs-2d` world variants |
| 5 | same schema 2 variants reported by the renderer-neutral shell |
| 6 | production fixed to Three.js; Skia variant limited to smoke and development |
| 7 | schema 2 shell plus Three.js world only; no selector or Skia parser |

No save or persistence schema uses this field.

### 9.3 WebGL failure

If WebGL 2 is unavailable, initialization fails with a clear loading-shell message.
Production does not silently fall back to Skia after decommission.

On `webglcontextlost`:

1. prevent the default destructive loss behavior;
2. stop the render loop;
3. pause simulation ticks, movement, pose and VFX advancement, transfers, autosaves, manual saves, and world input;
4. show a non-interactive renderer recovery overlay;
5. keep authoritative game state and persistent files unchanged;
6. rebuild GPU resources from the latest immutable render frame after `webglcontextrestored`;
7. require a non-blank frame before resuming input, saves, and time advancement.

The bounded recovery window is `10 seconds`.
If restore does not complete within it, keep the game paused and show a restart message.
Do not invent a save write during renderer loss.

### 9.4 Cleanup

Unmount and renderer replacement must cancel animation frames and remove listeners.
They must dispose every owned geometry, material, texture, and render target.
They must then dispose the renderer.

Map changes reuse shared renderer resources.
They do not create another WebGL context.

Smoke evidence records Three.js `renderer.info` before and after repeated map changes and remounts.
Geometry, texture, and program counts must return to their expected bounded values.

## 10. Performance gates

All comparisons use the same source commit, package, machine, window, DPR, zoom, camera, and fixture.

The final renderer must pass:

- rounded `60 FPS` during the current maximum-load scene;
- rounded `60 FPS` during local-model generation on qualified hardware;
- no more than `10%` median-frame-time regression against the same-package Skia baseline;
- no repeated long frame above `50 ms` during ordinary pan, zoom, or map entry;
- current natural-movement qualification;
- current responsive high-DPI qualification;
- fixed evidence at DPR `1`, `1.25`, `1.5`, and `2`;
- the draw-call and resource ceilings in section 7.3;
- no growth after 20 map transfers, 20 zoom cycles, and 10 world-surface remounts.

The Skia and Three.js comparison must be captured before Skia removal.
After removal, the locked report remains the rollback evidence.

## 11. Security gates

Three.js is bundled locally as a pinned runtime dependency.
Runtime CDN imports are forbidden.

The port must preserve every current Electron security invariant.
The CanvasKit-specific positive assertion for `'wasm-unsafe-eval'` is replaced when that permission is removed.
It must also prove:

- no Node global is visible in the renderer;
- no navigation, window, webview, or remote origin is allowed;
- no shader source or asset is loaded from a remote origin;
- no new IPC channel is needed for rendering;
- no renderer state enters authoritative saves;
- production CSP contains only the permissions still required after CanvasKit removal.
- Release and runtime qualification targets browser, macOS ARM64, macOS x64, and Windows x64 only.
- Do not add renderer flags, probes, packaging, or jobs for another operating system.
- Run platform-neutral checks in the macOS ARM64 CI job before packaging.

After CanvasKit is removed, `'wasm-unsafe-eval'` must be removed unless another reviewed runtime still requires it.
The final packaged app must pass with the tighter CSP.

## 12. Staged delivery and stop gates

Every implementation stage ends with the same closeout:

1. run its named verification;
2. ask Claude Fable 5 for a read-only audit of that stage only;
3. verify each finding locally and fix confirmed defects;
4. rerun the affected verification;
5. commit the stage, merge it into the integration branch, and prune its branch only after Git proves containment and a clean state.

### Stage 0: baseline and ownership

Record the current commit, dirty paths, generated hashes, full test result, browser export, hidden packaged smoke, fixed cameras, and maximum-load performance.

Before Stage 1:

- parameterize the responsive package smoke device-scale factor;
- capture Skia baselines at DPR `1`, `1.25`, `1.5`, and `2`;
- implement and self-test the contrast, mask, and pixel-difference qualification tool defined in section 7.5;
- commit the visual-acceptance manifest schema and baseline masks before Three.js renders a game frame;
- remove non-release-platform CI and run platform-neutral checks in the macOS ARM64 job;
- prove packaged WebGL 2 creation on macOS ARM64, macOS x64, and Windows x64 before frame extraction;
- add a macOS ARM64 package-and-smoke job with an explicit `arm64` runtime architecture assertion.

Commit one fixture manifest for every comparison.
Each fixture locks the compiled map hash, save or world-state hash, camera, sampled animation time, roof state, zoom, viewport, DPR, renderer, and source commit.

Gate:

- all baseline evidence is complete;
- the last qualified Skia baseline commit SHA is recorded as the rollback authority with source, lockfile, world-atlas, and content hashes;
- an immutable local tag may alias that SHA for convenience, but the tag is not authoritative;
- user-owned spike changes remain intact;
- no port code has changed simulation, maps, saves, or content.

Stop if the current baseline is already failing.
Fix or explicitly classify that failure before starting the port.

### Stage 1: shared frame and time ownership

Extend the existing pure world render frame while Skia remains the only renderer.
Move render-list assembly behind that frame without changing current Skia output.
Make `WorldScene` the single owner of simulation, movement, pose, door, roof, transfer, and VFX timing.

Gate:

- render-frame tests cover every layer, overlay, stable order, and sampled time value;
- current Skia fixtures and behavior stay unchanged;
- state, geometry, presentation, and atlas hashes match expectations;
- controller and frame code contain no Three.js objects;
- a renderer cannot advance time or mutate authoritative state.

Stop if extracting the frame changes game behavior or requires renderer-specific game rules.

### Stage 2: in-app playable villa and dual-renderer parity

Mount one Three.js 2D surface inside the real Expo web and Electron runtime.
Use the production atlas directly.
Move the pinned `three` package into runtime `dependencies` when this shipped surface first exists.
Run Skia and Three.js from the same immutable frame through a temporary development selector.
Implement the section 9 two-phase readiness schema and unsaved test renderer flag in this stage.
After parity passes, add one villa-only, development-only fixed-camera preview of the approved flat lighting, glow, and shadow treatment.
The preview uses the same frame, atlas, geometry, camera, scale, and viewport as Skia.

Gate:

- player can move, pan, zoom, select, enter the villa, and leave it;
- the roof hides and restores;
- browser export and hidden packaged Electron checks pass;
- packaged smoke proves shell then world readiness for both temporary `skia` and `threejs-2d` variants;
- WebGL cleanup and context restore have focused checks;
- no per-sprite textures or per-tile objects exist;
- camera, hit testing, movement, doors, roofs, markers, and sampled animation time match;
- renderer selection is not persisted or exposed to players;
- the matched preview shows the approved richer light, shadow, and room depth without reducing route, door, NPC, or selection readability;
- the preview adds no production framework or renderer-specific game rule.

If this stage fails, stop and keep Skia.
Do not continue because the static spike looked good.

### Stage 3: full Three.js parity

Complete all maps, props, walls, characters, shadows, doors, roofs, markers, and fallback effects.
Port every procedural VFX kind to the Three.js primitive batch in this stage.

Gate:

- every existing renderer behavior matrix case passes;
- the section 7.5 no-tone-mapping comparator passes at DPR `1`, `1.25`, `1.5`, and `2`; viewports `1280×720`, `1440×900`, `1920×1080`, `2560×1440`, and `1600×720`; the committed maximum-load viewport; and zoom `1×`, `2×`, `3×`;
- the hidden packaged Three.js smoke presents all 41 saved zoom boundaries and reports nearest atlas minification and magnification, disabled mipmaps, anisotropy `1`, and clamp-to-edge wrapping at every sample;
- browser and packaged input behavior match;
- save load, map transfer, restart, and reduced motion pass;
- no visual enhancement hides a parity defect.

### Stage 4: approved 2D lighting enhancement

Add the restrained GPU lighting overlay, pixel glows, and final shadow treatment.
Enable ACES only in this stage, after the locked no-tone-mapping parity report passes.

Gate:

- matched before/after fixed cameras preserve the Stage 2 visual gain across all four maps;
- native `1×` readability stays within the art bible;
- door, route, NPC, selection, and room-purpose clarity do not regress;
- performance and draw-call gates pass;
- no post-processing framework or shadow-map system was added.

### Stage 5: effects, portraits, proofs, and lifecycle

Qualify procedural effects and port the remaining Skia-backed atlas views.
Update responsive evidence, package smoke, and art review tooling.
Re-express the smoke-only `legacy` and `enhanced` ground render lists through the shared frame.
Redefine `staticBatchCount` as the Three.js static ground-atlas batch count, keep its `0..1` enhanced-minus-legacy limit, and rerun the art-mode comparison.
Replace `SkiaProof.tsx` and the root `WithSkiaWeb` mount with one renderer-neutral game-surface shell.
Transfer responsive surface measurement, readiness reporting, dev-harness routing, and the `active-surface-canvas`, `active-game-surface`, and `development-runtime` proof nodes without changing their public meaning.
Migrate the shell resource gate and package listing from the phase-2 proof image and tone to the generated world atlas and generated vocal-cue audio.

Gate:

- the default shipping path does not load or require Skia or CanvasKit;
- the temporary development selector may still reach the qualified Skia renderer until Stage 7, but production cannot select it;
- every renderer and package suite passes against Three.js;
- repeated map changes, remounts, and context restore keep resource counts bounded;
- screenshots are decoded and checked for dimensions, non-blank pixels, and expected change.

### Stage 6: production cutover

Make Three.js the only production world renderer.
Keep the qualified-Skia rollback commit SHA recorded at Stage 0.

Gate:

- full `npm run verify` passes with hidden Electron windows;
- macOS ARM64, macOS x64, and Windows x64 package jobs pass;
- a real packaged runtime smoke passes on macOS ARM64, macOS x64, and Windows x64;
- the macOS ARM64 CI package and runtime smoke pass with `process.arch === "arm64"`;
- the same Stage 6 package records no more than 10 percent median-frame-time regression from its temporary Skia smoke variant to Three.js;
- platform-neutral CI checks pass in the macOS ARM64 job before packaging;
- model-generation rendering holds the locked FPS gate on named qualified hardware;
- the final package contains the correct atlas and Three.js bundle;
- the final fixed-camera and playable evidence matches the approved top-down direction and every locked readability gate.

### Stage 7: old renderer removal

Remove obsolete renderer code and package weight only after Stage 6 passes.

Gate:

- the deletion inventory in section 13 is complete;
- a clean install, browser export, package build, and full verification pass after deletion;
- final bundles contain no Skia or CanvasKit artifact;
- the recorded rollback commit SHA remains a valid commit and an ancestor of the merged integration history;
- a clean-worktree restore drill packages that SHA and passes the recorded Skia smoke suite;
- the record contains the source commit, lockfile hash, world-atlas hash, and content hash rather than unstable signed-package bytes.

## 13. Mandatory old-build removal

The final port must remove all obsolete Skia and CanvasKit parts.

### 13.1 Dependencies and package files

Remove:

- `@shopify/react-native-skia` from `package.json` and `package-lock.json`;
- `setup:skia-web`;
- `proof:check` and its calls from `verify` and `verify:ci-build`;
- `proof:assets` and `setup:skia-web` calls from `export:web`;
- `public/canvaskit.wasm`;
- `assets/proof/phase2-atlas.png` and `assets/proof/phase2-tone.wav` after `App.tsx` and `scripts/electron/package-smoke-utils.ts` use the generated world atlas and generated vocal-cue audio instead;
- Skia-only package assertions;
- stale transitive packages that disappear after a clean `npm install`.

Also remove `react-native-reanimated`, `react-native-worklets`, and `zustand` if a final import and script audit confirms they have no remaining runtime or tooling consumers.
They are currently renderer-era or unused stack declarations, not protected product contracts.

Move `three` from `devDependencies` to pinned runtime `dependencies`.

### 13.2 Application and renderer code

Remove or replace:

- `WithSkiaWeb` and CanvasKit loading from `App.tsx`;
- `src/render/SkiaProof.tsx`;
- Skia drawing in `src/render/WorldScene.tsx`;
- `src/render/DistrictLightingOverlay.tsx` after its behavior moves into the Three.js surface;
- `src/render/vfx/ProceduralMapEffects.tsx` after its pure geometry is rendered by Three.js;
- `src/render/AtlasProof.tsx` if no final qualification imports it;
- Skia drawing in `src/application/NewGameFlow.tsx`;
- Skia drawing in `src/ui/CharacterPortrait.tsx`;
- Skia-only transforms, sampling constants, hooks, imports, and wrapper styles;
- temporary renderer flags, adapters, duplicate fixtures, and parity-only code after cutover.

Preserve the exact public proof-node IDs and label formats used by Electron smoke scripts unless the same change updates every parser and test atomically.

The pure atlas index, world frame, camera, depth, VFX geometry, art recipes, and art builders remain.
They are renderer-independent and still required.

### 13.3 Tests and tooling

Delete or rewrite tests that assert Skia syntax instead of player behavior.
Keep and retarget tests for:

- atlas reachability and no bleed;
- camera and input;
- world-frame order;
- doors and roofs;
- movement and reduced motion;
- renderer readiness;
- responsive layout;
- VFX evidence;
- package screenshots and FPS;
- security and CSP.

Remove obsolete CanvasKit bundle checks.
Add final bundle checks that reject `canvaskit.wasm`, Skia packages, and Skia module strings.
Update `electron/protocol/app-protocol.ts` and `tests/electron/security.test.ts` atomically so the final CSP rejects `'wasm-unsafe-eval'` and the test proves its absence.
When `src/render/vfx/ProceduralMapEffects.tsx` is deleted, replace its hard-coded entry in `scripts/electron/run-procedural-vfx-package-smoke.ts` and every sibling evidence-source list with the final Three.js VFX modules in the same change.

Remove the `proof:assets` script, `scripts/electron/build-proof-assets.ts`, and proof-only builders after the shell resource gate, package listing, and final qualification no longer consume their outputs.
Keep no generated proof file solely because an old command once produced it.

### 13.4 Documentation and notices

Update:

- `spec.md` stack and acceptance criteria;
- renderer and packaging references in release documents;
- third-party notices;
- qualification status and provenance;
- commands that still mention CanvasKit or Skia.

Do not rewrite historical audit or evidence documents.
They remain records of the build that produced them.

### 13.5 What stays

Do not remove these working systems merely because the renderer changed:

- Expo and React Native Web application hosting;
- React Native UI and accessibility;
- Electron Forge and secure `app://game/` packaging;
- Zod and strict TypeScript;
- Expo Audio;
- the generated world atlas and its builders;
- pure domain, world, pathfinding, maps, schedules, AI, saves, and content;
- hidden Electron capture and smoke infrastructure.

Deleting these systems would turn a renderer port into an engine rewrite.
That is outside this specification.

## 14. Verification matrix

| Area | Required cases | Required proof |
|---|---|---|
| Atlas | every public cell, gutters, alpha, bounds | generated checks and native `1×` board |
| Camera | pan, center, edges, resize, pointer zoom | unit tests and packaged input smoke |
| Input | NPC, object, floor, blocked route, panel lock | deterministic tests and packaged smoke |
| Movement | four directions, two frames, curve, interruption | fixed trace and hidden packaged frames |
| Doors | closed, opening, open, closing | unit test and hidden packaged sequence |
| Roofs | outside, doorway, inside, leave, reload | state proof and screenshots |
| Maps | all four maps and transfers | fixture matrix and package smoke |
| Depth | tall props, actors, walls, roof | front/behind boards and order tests |
| Lighting | district times, shelter, lamps, shadows | fixed native `1×` comparisons |
| VFX | every kind, fallback, culling, reduced motion | evidence schema and package smoke |
| UI | HUD, panels, dialogue, portraits, scales | accessibility tests and screenshots |
| Saves | fresh start, load, autosave, restart | save qualification with unchanged schema |
| Performance | normal, maximum load, model generation | same-package frame report |
| Lifecycle | remount, transfer loop, context loss | resource-count report and recovery smoke |
| Security | CSP, app protocol, bridge, no Node | Electron security suites |
| Packaging | browser, macOS ARM64/x64, Windows x64 | clean exported and packaged artifacts |
| Removal | dependency, source, bundle, wasm absence | clean-install audit and package inventory |

## 15. Final acceptance criteria

The port is accepted only when all items are true.

- [ ] The production game uses top-down Three.js 2D.
- [ ] The production game does not use the isometric 2.5D renderer.
- [ ] Simulation, maps, pathfinding, saves, AI, audio, and UI behavior remain unchanged.
- [ ] Existing saves load without a renderer-caused migration.
- [ ] All four maps render and play correctly.
- [ ] Camera, input, movement, doors, roofs, effects, markers, selection, and reduced motion pass.
- [ ] The final matched visual comparison meets the approved top-down direction and locked readability gates.
- [ ] Browser export remains usable for playtesting.
- [ ] Hidden packaged Electron verification passes.
- [ ] Performance and resource gates pass.
- [ ] Security and accessibility gates pass.
- [ ] Three.js is local, pinned, and the only world-renderer runtime dependency.
- [ ] Skia and CanvasKit code, dependencies, scripts, artifacts, CSP allowances, and stale checks are removed.
- [ ] Temporary dual-renderer and parity code is removed.
- [ ] The clean final package contains no `canvaskit.wasm` or Skia module.
- [ ] The recorded rollback commit SHA preserves the last qualified Skia build in merged Git history.
- [ ] A local tag, when present, resolves to that exact SHA.
- [ ] A clean-worktree restore drill packages that SHA and passes the recorded Skia smoke suite.
- [ ] The rollback record preserves its source commit, lockfile, world-atlas, and content hashes.
- [ ] `npm run verify` passes after the deletion phase.

## 16. Rollback rules

Each stage ends in a reviewable commit.
Do not mix stages in one commit.

Before the Stage 5 root-shell replacement, rollback means selecting the qualified Skia path and reverting only the failed stage.
From the Stage 5 root-shell replacement onward, rollback means restoring the qualified Skia commit SHA recorded at Stage 0.
After deletion, rollback means restoring that same SHA.

The rollback SHA must remain a valid commit and an ancestor of merged integration history before deletion.
An immutable local tag is only a convenient alias.
Pushing that tag is outside this task unless separately authorized.
If unrelated work merges after the baseline, rebase or merge the port, rerun the affected baseline matrix, and record a new qualified rollback SHA before continuing.
The deletion gate includes a restore in a separate clean worktree, packaging, and the recorded Skia smoke suite.

Rollback never restores a partial renderer, changes save data, or deletes player files.

Stop the port when any of these occurs:

- a shared frame needs renderer-specific game rules;
- a save, layout, route, or simulation hash changes without a separate approved reason;
- WebGL resource counts grow across the lifecycle loop;
- browser or packaged input differs from current behavior;
- native `1×` art becomes blurry or less readable;
- maximum-load or model-generation FPS fails;
- the visual gain no longer justifies the remaining risk;
- the matched playable result loses the approved visual gain.

## 17. External technical basis

- [Three.js OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html) documents orthographic projection for 2D scenes and requires `updateProjectionMatrix()` after camera changes.
- [Three.js texture guidance](https://threejs.org/manual/en/textures.html) recommends texture atlases for performance and documents nearest filtering for pixel art.
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) requires WebGL 2, exposes logical and drawing-buffer sizing, and warns that transparent sorting can fail, so this port locks manual composite order.
- [Three.js disposal guidance](https://threejs.org/manual/en/how-to-dispose-of-objects.html) requires explicit disposal of geometries, materials, textures, render targets, and renderers.

## 18. Council review record

The user changed the review membership to Claude Fable 5 and Claude Opus 5 only.
Grok was excluded from these three specification rounds.
A later one-round Grok exception applies only to implementation-plan round 3 and is recorded in the plan.

### Round 1: completed and resolved

Both reviewers completed at `xhigh` effort against the same read-only scope.
Codex verified every retained finding against the repository before editing this specification.

- `2/2`: split shell/world readiness would deadlock packaged smoke. Fixed with two report phases on the existing IPC channel and one atomic migration list.
- `2/2`: the readiness contract was not fully shaped. Fixed with a complete strict schema-version-2 union.
- `1/2 Fable`: Stage 2 asked parity output to prove the visual gain. Fixed with a matched, development-only villa lighting preview.
- `1/2 Fable`: DPR `1.25` and `1.5` lacked Skia capture tooling. Fixed by moving harness parameterization and capture into Stage 0.
- `1/2 Fable`: signed-package byte hashes were not reproducible. Fixed with source/resource hashes plus a clean-worktree packaged smoke drill.
- `1/2 Opus`: a non-target runner's software WebGL path was assumed. This work was later superseded and removed when release targets narrowed.
- `1/2 Opus`: the root `WithSkiaWeb` shell had no migration owner. Fixed by assigning its renderer-neutral replacement and proof responsibilities to Stage 5.
- `1/2 Opus`: phase-2 proof assets were active startup dependencies. Fixed by requiring the shell and package listing migration before deletion.
- `1/2 Opus`: the frame-purity gate was not enforced by the current boundary checker. Fixed by extending the checked file set.

No reviewer claim was accepted by vote alone.

### Round 2: completed and resolved

Both reviewers completed at `xhigh` effort against the same corrected-spec scope.
Codex verified all retained findings locally.

- `2/2`: cleanup would delete `proof:assets` while `export:web` and verification still called it. Fixed with an atomic script and caller removal list.
- `2/2`: tag-based rollback began before a qualified tag existed. Fixed by creating the immutable Skia tag in Stage 0 and making the rollback windows exclusive.
- `1/2 Opus`: the first frame-module boundary rule would reject legitimate relative imports. Fixed with a distinct explicit manifest and allowed-import rule.
- `1/2 Opus`: `legacy`/`enhanced` art-mode and `staticBatchCount` contracts had no migration owner. Fixed in the baseline and Stage 5.
- `1/2 Opus`: autonomous visual acceptance lacked a decider and measurable floor. Fixed with a locked native-`1×` manifest, numeric readability floor, Codex inspection, and phase Opus audit.

### Round 3: completed and resolved

Fable completed with no confirmed findings.
Opus completed with five findings, all locally checked before amendment.

- The CanvasKit CSP assertion and CSP source now change atomically.
- A prior non-target operating-system smoke amendment was later superseded and removed.
- The renderer-neutral manifest now covers existing frame-input modules and all future pure imports.
- VFX evidence-source lists now migrate with deleted renderer files.
- Stage 3 parity now uses the Stage 0 comparator, masks, tolerances, and autonomous decider.

The user then supplied final review advice, incorporated without adding a fourth round:

- readiness migration and temporary unsaved `skia | threejs-2d` variants moved to Stage 2;
- destination, journal, and failure feedback moved above lighting and atmosphere;
- contrast math, masks, and the pass/fail tool moved to Stage 0;
- parity is locked to `NoToneMapping` before ACES enhancement;
- draw-order terminology is split into core world layers and full composite order;
- the recorded commit SHA is rollback authority and the local tag is only an alias;
- transparent ordering is manual, explicit, and independent of Three.js default sorting.

Exactly three Fable/Opus rounds are complete.
This specification is approved for implementation planning.

### Post-review SpecFlow correction

A final implementation-order check made three non-product corrections before plan review:

- procedural VFX implementation moved to Stage 3 so full parity is truthful;
- the readiness lifecycle is locked stage by stage;
- the viewport matrix and missing macOS ARM64 CI job are explicit.

### Post-review user scope change

The user narrowed release and CI targets to macOS and Windows after plan-review round 2.
All non-target operating-system jobs, renderer proof, software-rendering work, and release gates were removed.
Platform-neutral checks run in the macOS ARM64 job.
