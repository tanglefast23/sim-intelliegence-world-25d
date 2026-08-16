---
title: Three.js 2.5D renderer
type: feat
date: 2026-08-16
revised: 2026-08-17
revision: 2
status: draft-revised-after-two-audits
target: tilted-orthographic Three.js 2.5D
supersedes-partially: docs/specs/2026-08-14-threejs-2d-renderer-port.md
---

# Three.js 2.5D renderer specification

## 1. Decision

SI World adds a second world renderer that draws the existing 2D world frame as tilted
low-resolution 3D geometry.

The target is the right panel in `spikes/001-threejs-pixel-villa/comparison-three-way.png`,
produced by `spikes/001-threejs-pixel-villa/scene.js`.

The 2.5D renderer is a **display layer only**. Simulation, maps, pathfinding, saves, AI, audio,
and UI do not change.

The current 2D renderer stays in the build as the rollback path until the final acceptance gate
passes. This specification does not authorize its removal.

This work is not authorized to start. It requires the rule revocation in section 4 and the yaw
decision in section 8.0.

## 2. What this is not

This is **not** isometric.

There are no diamond tiles and no 2:1 projection. The world stays a square `64×48` tile grid at
`32` world pixels per tile. The camera is a `THREE.OrthographicCamera` at a fixed tilt.

Any audit finding that assumes diamond tiles, an 8-direction character atlas, a new map schema,
or a save migration is out of scope.

## 3. The boundary claim, corrected

Revision 1 claimed `src/render/world-frame.ts` could stay frozen because `WorldFrameState`
carries everything a 2.5D renderer needs. **Two independent audits found that claim wrong.** The
corrected position:

`WorldFrameState` does not carry the world. It carries a **2D-projection-culled window** of it.

```377:383:src/render/world-frame.ts
function visibleTileBounds(camera: CameraState, viewport: ViewportSize, margin = 1): VisibleTileBounds {
  return {
    minimumX: Math.floor(camera.x / TILE_SIZE) - margin,
    minimumY: Math.floor(camera.y / TILE_SIZE) - margin,
    maximumX: Math.ceil((camera.x + viewport.width / camera.zoom) / TILE_SIZE) + margin,
    maximumY: Math.ceil((camera.y + viewport.height / camera.zoom) / TILE_SIZE) + margin,
  };
}
```

Floors, walls, props, roofs (`:934-941`), characters (`:935`), and VFX (`:982-989`) all filter
through this axis-aligned rectangle. A tilted camera sees a taller footprint, so tiles inside the
tilted view fall outside the window and render as void. Walls are `1.45` tiles tall, so wall tops
project beyond the `1`-tile margin and pop at the screen edge.

**Resolution: the frame stays frozen, and `WorldScene.tsx` inflates the request.**

`WorldScene.tsx` builds the frame and already controls `viewInput` (`:1350-1379`). In 2.5D mode it
passes an inflated `viewport` so the returned window covers the tilted footprint plus wall height.
`world-frame.ts` needs no edit.

Costs, which revision 1 did not carry and which are now in the section 15 estimate:

- More placements are built per frame than are drawn.
- VFX culling widens with the same inflation.
- The static-list cache at `world-frame.ts:674` is keyed on the tile window, so panning churns it
  at the inflated rate.
- Section 8.3's "static geometry must not rebuild per frame" is **false as written** and is
  restated there.

This is the honest answer to revision 1's own audit question 1.

## 4. Required rule revocation

Revision 1 listed four revocations. One was overstated and is withdrawn.

`CLAUDE.md:69` says: "never add perspective cameras, displaced meshes, or shadow maps." A tilted
**orthographic** camera is not a perspective camera. The tilt needs no revocation.

| Rule | File | Status |
|---|---|---|
| No shadow maps | `CLAUDE.md:69` | **must be revoked** if the lit path ships |
| Always 2D art direction | user memory `halcyra-locked-style-rule` | **must be revoked** |
| No isometric or 2.5D geometry, no dynamic lights or shadow maps | `docs/specs/2026-08-14-threejs-2d-renderer-port.md` section 4 | **must be amended** |
| No perspective camera | `CLAUDE.md:69`, 2D spec section 4 | not triggered — tilt is orthographic |

The 2D port specification stays authoritative for every contract this document does not restate.
Its non-goals list is amended, not deleted.

## 5. Goals

1. Reach the target look for one interior and one street.
2. Keep `src/domain`, `src/world`, `src/ai`, and `content/` untouched.
3. Keep `src/render/world-frame.ts` untouched.
4. Reuse the existing atlas for floors, walls, doors, and characters.
5. Keep both renderers selectable until final acceptance.
6. Hold the `60 FPS` floor.
7. Keep existing saves loading with no migration and no `layoutRevision` change.

## 6. Non-goals

No diamond tiles. No camera rotation, orbit, or free pitch. No elevation field in `content/` or
`src/world`. No stairs, ramps, or multi-storey buildings. No new map geometry, props, routes,
quests, or NPC logic. No redrawn or 8-direction character art. No save-schema change. No physics
or 3D collision. No imported model files. No bloom, depth of field, or SSAO. No React Three
Fiber. No player-facing renderer switch in shipped builds.

## 7. Locked baseline

Verified in the worktree on 2026-08-17, after two audits corrected revision 1.

### 7.1 Render layer

- `three@0.185.1`, pinned and local. Runtime CDN imports stay forbidden.
- `rendererForEnvironment()` returns the literal `'threejs-2d'`.
- `src/render/three/world-renderer.ts` composites **`20`** batches in `COMPOSITE_BATCHES`
  (`:72-102`). Revision 1 said 21.
- `src/render/world-frame.ts` is `1142` lines, emits `WorldFrameState` schema version `1`.
- `src/render/WorldScene.tsx` is `1915` lines and owns frame building and picking.
- Tone mapping is ACES in production, overridable to `none` by smoke mode **or** a localhost
  `?testToneMapping` query parameter (`renderer-selection.ts:24-27`). Revision 1 said smoke only.
- `LAMP_SPRITE_IDS` (`world-renderer.ts:42`) already special-cases lamp props for glow.

### 7.2 World and content

- Four maps, each `64×48` tiles, `32` world pixels per tile.
- No elevation field in `src/world/maps/schema.ts`.
- `screenToTile` is `Math.floor((camera + screen / zoom) / 32)`.
- `clampCamera` clamps an axis-aligned rectangle, with a centred branch when the view exceeds the
  map (`camera.ts:22-25`).
- World zoom is `1.0`–`3.0`, saved in `0.05` steps, stepped in the UI by `0.1`.
- **Save chain is `v1`→`v7`.** `STATE_SCHEMA_VERSION = 7`, and `src/domain/state/migrations/`
  contains `v6-to-v7.ts`. Revision 1 said v6, inheriting a stale line from `CLAUDE.md:108`, now
  corrected.

### 7.3 Atlas

`612` sprites, art revision `15`: `280` `world-character`, `81` `ground-base`, `76` `wall-door`,
`62` `object-landmark`, `53` `portrait`, `30` `ground-transition`, `27` `ground-decal`, `3` `roof`.

`280` = `35` characters × `4` facings × `2` walk frames. `zoomLevels: [1,2,3]` is nearest-neighbour
scale, not authored copies. No character sprite is redrawn by this work.

### 7.4 Verification surface

- `719` static `it(`/`test(` sites across `106` test files. This is a static count before `.each`
  expansion, so the executed total is higher. Revision 1's "623" was wrong.
- **`14`** scripts under `scripts/electron/`, plus a `__tests__` directory. Revision 1 said 15.
- `#world-camera-state` prints `World camera ${x},${y} at ${zoom}x` (`WorldScene.tsx:1630`).
- `#world-geometry-state` is `buildSmokeGeometryEvidence(map)`, derived from map tiles.
- Neither label encodes quad positions. Both survive a projection change.

### 7.5 Existing hooks this work reuses

- `siWorldTestRenderer` already exists on `DesktopBridge.ts:51` and in the preload.
- The preload whitelist is hard-coded to `'skia' | 'threejs-2d'` (`electron/preload/index.ts:106-108`).
  See section 8.2. The `'skia'` value is dead — Skia was removed in the 2D port's Stage 7.

### 7.6 Spike status

`spikes/001-threejs-pixel-villa/README.md` records verdict `PARTIAL`. It does not prove movement,
camera panning, roof occlusion, full-map rendering, or packaged performance. It is evidence for
visual direction only.

The spike hand-places a blob shadow mesh under its protagonist (`scene.js:209-216`). See section
8.7 — this is not decoration, it is a workaround for a hard three.js limit.

## 8. Target architecture

### 8.0 Yaw decision — Stage 1 gate

**This decision changes the estimate by weeks. It is made at the end of Stage 1, on rendered
evidence, not now.**

The spike camera carries roughly `35°` of yaw as well as tilt:

```17:19:spikes/001-threejs-pixel-villa/scene.js
const camera = new THREE.OrthographicCamera(-6.2, 6.2, 6.2, -6.2, 0.1, 100);
camera.position.set(8.2, 12.5, 11.5);
camera.lookAt(0, 0.2, -0.25);
```

Yaw is where nearly all of the section 8.5 difficulty comes from.

| | Yaw = 0 (recommended) | Spike yaw ≈ 35° |
|---|---|---|
| Ground footprint | axis-aligned, stretched ~1.54× vertically | rotated parallelogram |
| `screenToTileTilted` | two-line affine | full unprojection |
| `clampCameraTilted` | `clampCamera` with a stretched vertical extent | rotated-footprint clamp, section 8.5 |
| Frame inflation (section 3) | fixed vertical margin | margin on all four axes |
| Facing selection | stays world-axis, unchanged from 2D | camera-relative, section 8.6 |
| Look | straight-on tilt; loses the corner-diagonal angle | matches the target panel |
| Stages 0–4 estimate | `3`–`6` weeks | `5`–`8` weeks |

Stage 1 renders the same villa at both yaw values and the decision is made from the two images.
Recommendation is yaw = 0 unless the side-by-side shows a look gap worth two to three weeks.

Every section below is written for yaw = 0 and marks what changes if the spike yaw is chosen.

### 8.1 Authority boundary

| Path | Status |
|---|---|
| `src/domain`, `src/world`, `src/ai`, `content/` | **frozen** |
| `src/render/world-frame.ts` | **frozen** — inflation happens at the caller, section 3 |
| `src/render/three/world-renderer.ts` | **frozen** — 2D path |
| `src/render/camera.ts` | additive only, section 8.5 |
| `src/render/WorldScene.tsx` | **owned change file** — frame inflation, picking, overlay anchors |
| `src/render/camera-motion.ts` | **owned change file** — every `clampCamera` call branches |
| `electron/preload/index.ts` | **owned change file** — one-line whitelist, section 8.2 |
| `src/render/three25/` | new |

Revision 1 omitted the last three rows. `WorldScene.tsx` is the largest file this work touches and
was unowned.

`npm run check:boundaries` must keep passing with no rule relaxed. If the 2.5D renderer needs
anything from `src/world` that `WorldFrameState` does not carry and that `WorldScene.tsx` cannot
supply, that is a scope breach and the stage stops.

### 8.2 Renderer selection

`RendererKind` becomes `'threejs-2d' | 'threejs-2-5d'`.

- Production returns `'threejs-2d'` until the section 16 gate passes.
- A localhost `?testRenderer=2-5d` query parameter selects 2.5D in development.
- Smoke mode selects 2.5D through `window.siWorldTestRenderer`.

**The preload whitelist must be edited.** It currently accepts only `'skia' | 'threejs-2d'`:

```106:108:electron/preload/index.ts
const smokeRenderer = process.argv.find((argument) => argument.startsWith('--si-world-test-renderer='))?.split('=')[1];
if (process.argv.includes('--si-world-smoke-mode=1') && (smokeRenderer === 'skia' || smokeRenderer === 'threejs-2d')) {
  contextBridge.exposeInMainWorld('siWorldTestRenderer', smokeRenderer);
}
```

The localhost query parameter cannot substitute: packaged builds load over `app://game`, so
`hostname` is never localhost, and packaged smokes are exactly where 2.5D must be provable.

Required change: accept `'threejs-2d' | 'threejs-2-5d'` and drop the dead `'skia'` value. This is
the **only** permitted `electron/` diff. Revision 1's "electron/ has no diff" acceptance criterion
was unachievable and is corrected in section 16.

The override stays unsaved. It never enters a save file or a display preference.

### 8.3 Scene construction

Tiles map to the XZ plane, one scene unit per tile. Scene `+Y` is up.

**Actors and markers place from continuous coordinates, not tiles.** Revision 1 used
`worldToScene(tile)`, which would pop movement every `32` pixels. Characters already carry
continuous `worldX`/`worldY`.

`worldX`/`worldY` is the quad's top-left after scale, lean, bob, and impact offsets
(`world-frame.ts:907-928`). The ground anchor used by the 2.5D renderer is:

`footX = shadowWorldX`, `footZ = shadowWorldY`

taken from `WorldCharacterPlacement.shadowWorldX`/`shadowWorldY`, which the frame already computes
as the contact point. Sub-pixel lateral shadow shift is not in the frame; the resulting error is
under one pixel and is accepted.

| Frame input | Scene output |
|---|---|
| `floors`, `groundDetails` | one textured quad per tile on the XZ plane at `y = 0` |
| `walls`, `wallBases` | extruded box, `adjacencyMask` drives run merging |
| `doors` | wall gap plus a low box, existing door sprite as the face texture |
| `props` | recipe from section 8.4 |
| `characters` | instanced billboard quad at the foot anchor, section 8.6 |
| `roofs` | box lid over the roof group, hidden via `hiddenRoofGroupId` |
| `selectionRing`, `destinationPulse`, `failureMarker`, `journalMarkers` | flat quad on the floor plane at `worldX`/`worldY` ÷ 32 |
| `atmosphere` | unchanged screen-space overlay |
| `propShadows`, `characterShadows` | flat floor quads in **both** shadow paths, section 8.7 |
| `effects`, `transientEffects`, `transientGlows` | camera-facing quads at the frame's ground position |

**Geometry rebuild rule, corrected.** Revision 1 said static geometry must not rebuild per frame.
That is false while the frame is a moving tile window: the returned lists change on every pan.

The rule is instead: static world geometry rebuilds only when the **inflated tile window** changes
or `mapHash`/`presentationHash` changes. The 2.5D renderer keeps its own tile-keyed mesh cache and
adds or removes only the delta. Rebuilding the whole map's geometry on a one-tile pan fails Stage 1.

### 8.4 Prop recipes and heights

Revision 1 proposed one box per sprite. Both audits rejected it: the target sofa is several boxes —
seat, back, arms — and a single box reads as cardboard.

`src/render/three25/recipes.ts` exports a frozen table keyed by atlas sprite id. Each entry is a
short list of boxes in tile units with an optional side texture. Wall height is one constant, draft
`1.45` scene units.

- Covers the `62` `object-landmark` sprites plus doors.
- Multi-tile objects (`sofa-left` + `sofa-right`) are one recipe keyed on the left sprite, with the
  right sprite marked as consumed.
- Any sprite absent from the table renders as a flat floor decal, never a guessed box.
- No `content/` schema change, no regeneration gate.

**Orphan check.** Sprite ids are generated strings, so an art regeneration can rename one and
silently orphan a recipe. The coverage check asserts **both** directions: every
`object-landmark` sprite resolves to a recipe or an explicit flat entry, **and** every recipe key
exists in `ATLAS_INDEX`. A missing key fails the build.

**Do not gate on a pixel-diff against the spike panel.** The spike room is hand-arranged with
different furniture and a different camera. It is a look reference, not a golden image. The Stage 1
gate is a human side-by-side, and the pixel-art rules in section 9 are the mechanical gate.

### 8.5 Click projection and camera clamping

`screenToTile` is not modified. A 2.5D sibling is added.

At yaw = 0 the ground projection is an axis-aligned affine with a vertical stretch, so
`screenToTileTilted` and `worldToScreenTilted` are two-line functions.

**`WorldScene.tsx` is the real work, not `camera.ts`.** It currently calls `worldToScreen` six
times, `isScreenPointInsideMap` three times, and `screenToTile` twice. NPC picking uses a
screen-space box around `worldToScreen(camera, foot)`, not `worldClickCandidates`. Overlay anchors
for the selection marker, failure marker, and area highlights are positioned the same way
(`:1488-1522`). Every one of these needs a 2.5D branch.

`camera-motion.ts` clamps through `clampCamera` at `:226` and `:292`. Both branch.

**Round-trip invariant, restated at tile centres.** Projecting a tile corner lands on the shared
boundary of four tiles, which floors unstably. The gate is:

`screenToTileTilted(worldToScreenTilted(centreOf(tile))) === tile`

for every tile, every map, at zoom `1.0`, `2.0`, and `3.0`.

**Void policy — the "no map edge shows void" invariant is infeasible and is withdrawn.** At zoom 1
on a `1280×720` viewport the tilted footprint is taller than the map's `48` tiles, so no clamp can
avoid void. The 2D `clampCamera` already has a centred-when-oversized branch; the 2.5D equivalent
must state a policy explicitly. Required: a skirt colour fills outside the map bounds, matching the
district's ground tone, and the camera centres on the oversized axis rather than clamping to an
impossible bound. At zoom 3 the clamp is feasible, but the reachable centre region shrinks by the
footprint's vertical protrusion, so corner tiles sit further off-centre than in 2D. Document that
in the camera evidence.

`CameraState` keeps `{ x, y, zoom }` and `#world-camera-state` keeps its format.

### 8.6 Characters

No character art is created or modified.

**Instanced billboard quads, not `THREE.Sprite`.** The 2D port spec section 7.3 states: "The
renderer must not create one `Sprite`, material, geometry, or texture per tile," and caps atlas
rendering at `12` draw calls with `24` total. `THREE.Sprite` does not batch — one draw call per
character would breach both. Characters render as camera-facing quads in a single instanced batch
sharing the atlas texture and one material.

Facing selection keeps the `spec.md` rule set: rear pair for predominantly upward movement, front
pair for downward, generated lateral pair for left and right. At yaw = 0 this resolves against the
world axis exactly as 2D does, with no change. **If the spike yaw is chosen at the 8.0 gate**,
facing resolves against the camera-relative motion vector instead, and that variant needs its own
test.

**Billboards must take district tint.** Unlit quads stay full-bright at night. The renderer applies
the frame's `lighting` and `atmosphere` values as a vertex tint, matching what the 2D path already
does to grounded sprites.

Open risk, tracked in section 13: `spec.md:321` and `ART-04` (`spec.md:1087`) record that
front-facing horizontal walk readability is **still unresolved** in the shipped 2D game. Full side
profiles were deliberately cut. A tilt makes more movement read as sideways, so this work stresses
that open risk. The spec's own fallback is a mirrored three-quarter head over the existing torso and
lateral legs. A full side body stays out of scope.

### 8.7 Lighting and shadows

Two paths must both exist and both ship.

**Lit path**: one `HemisphereLight`, one shadow-casting `DirectionalLight`, and lamp lights driven
by **lamp props**, not district pools. `DistrictLighting.pools` is a small set of district-level
preset points for outdoor washes; real room lamps are prop sprites, and the 2D renderer already
identifies them through `LAMP_SPRITE_IDS` (`world-renderer.ts:42`). The 2.5D path uses the same set.

**Fallback path**: no dynamic lights, no shadow map, `propShadows` and `characterShadows` drawn as
flat floor quads.

**Character blob shadows survive in BOTH paths.** Billboard quads do not render into a shadow map.
The spike proves this by hand-placing a `CircleGeometry` blob under its protagonist
(`scene.js:209-216`). Revision 1 said the lit path replaces `characterShadows`; that would leave
every character floating. The lit path keeps the blob quads and adds the directional shadow for
boxes only.

**Path selection is explicit, not measured at runtime.** Revision 1 auto-selected the fallback when
a live FPS gate failed. That is nondeterministic and clashes with this repo's evidence culture.
Instead:

- The path is chosen by an explicit override, mirroring `siWorldTestRenderer`.
- The default ships from a qualification-time, per-machine-class decision recorded in evidence.
- **One packaged smoke runs each path on every CI run**, so neither rots.

`district-shadows` and `sprite-shadows` batches are not reprojected. In the lit path they are
replaced for boxes. In the fallback path they are drawn flat.

### 8.8 Near-wall occlusion

The only genuinely new system. The spike does not solve it — its room has no near walls modelled.

At yaw = 0 the near walls are the map-south side of any roof group. Their outward normal is known at
build time.

**Wall→roof-group membership is not in the frame, and must be derived.** `WorldWallPlacement` carries
`tile` and `adjacencyMask` only. Roof-group ids ride on `roofs`, and the occupied group's roofs are
filtered out of the frame entirely (`world-frame.ts:658-659`). The renderer derives membership by
testing wall tiles for adjacency to `shelterCells` and `roofedCells`, both of which the frame does
carry. That derivation must be written and unit-tested before Stage 3, or section 8.1's stop
condition fires on this feature.

Required behaviour:

- Near walls of the roof group the protagonist occupies are hidden or lowered.
- Roof hiding keeps using `hiddenRoofGroupId` and `visibleRoofGroupIds`.
- Outdoor near walls of unentered buildings stay drawn.
- Entering, standing in a doorway, leaving, and reloading each produce a stable, non-flickering
  state.

## 9. Pixel-art constraints

- `NearestFilter` on every texture, `generateMipmaps = false`.
- `flatShading: true` on every `MeshStandardMaterial`.
- Render at a low internal resolution, then scale by an integer factor. No anti-aliasing.
- No PBR maps, no normal maps, no metalness above `0`.
- Box geometry only. No bevels, no rounded corners, no imported models.

If the result reads as smooth 3D rather than chunky pixel art, the stage fails.

## 10. What breaks, honestly

| Surface | Effect |
|---|---|
| `src/render/__tests__/` quad assertions | ~20 files pin the 2D path and keep passing. 2.5D tests are additive. |
| `#world-camera-state`, `#world-geometry-state` | unchanged, verified |
| `WorldScene.tsx` picking and overlay anchors | 11 call sites branch |
| `camera-motion.ts` | 2 clamp call sites branch |
| `electron/preload/index.ts` | one-line whitelist change |
| Draw-call ceilings | 2D ceilings will not hold, section 12 |
| `sprite-shadows`, `district-shadows` | replaced for boxes in the lit path, flat in the fallback |
| Near-wall occlusion | new, no prior art |
| Save files | untouched, chain stays `v1`→`v7` |
| `content:check`, `art:check`, `audio:check`, `proof:check` | untouched, must stay green |

## 11. Staged delivery and stop gates

Each stage ends with `npm run typecheck`, `npm test`, `npm run check:boundaries`, and named
evidence in `artifacts/phase-NN/`. A stage that fails its gate stops the work.

### Stage 0: baseline and rule revocation

Record 2D baseline frames, frame timings, and resource counts. Revoke the rules in section 4. Land
`RendererKind` as a two-member union with production still on `'threejs-2d'`. Land the preload
whitelist change.

Gate: `npm run verify:ci-build` passes. Production behaviour is unchanged.

### Stage 1: static villa and the yaw decision

One interior. Floors, walls, doors, props from the recipe table. Frame inflation from
`WorldScene.tsx`. No movement, no input, no lighting beyond ambient.

Gate: the villa renders from real `WorldFrameState` data, not hand-placed boxes. Geometry rebuilds
only on window delta. **Both yaw values rendered side by side and the section 8.0 decision made and
recorded.**

### Stage 2: walking villa

Billboard instancing, facing selection, district tint, click projection, camera pan and zoom,
`WorldScene.tsx` picking branches, `camera-motion.ts` clamp branches.

Gate: the round-trip invariant holds at tile centres for every tile at zoom 1, 2, and 3. A
protagonist walks all four directions with no foot slide worse than the 2D baseline, and no popping
at tile boundaries. **This stage tests the `ART-04` open risk. If horizontal walk fails, apply the
mirrored three-quarter fallback or stop the work.**

### Stage 3: occlusion and lighting

Wall→roof-group derivation, near-wall culling, roof hiding, lamp-prop lights, both shadow paths
including blob quads in each.

Gate: enter, doorway, inside, leave, and reload are stable with no flicker. Both paths render and
both have a packaged smoke.

### Stage 4: one street

One exterior region. Outdoor scale, draw calls, view distance at zoom 1, skirt fill outside map
bounds.

Gate: draw calls and resource counts stay inside the **2.5D-specific** ceilings set in section 12.

**Hard stop.** Stages 0–4 are the bounded scope. The whole-game decision is made here on evidence.

### Stage 5: full parity

All four maps, all effects, all markers, portraits, map transfers, presentation restart.

### Stage 6: qualification

Packaged Electron, performance, responsive, high-DPI, save migration, day sweep, security.

### Stage 7: cutover decision

Flip production selection. The 2D renderer stays in the build for one release. Its removal needs a
separate specification.

## 12. Performance gates

The 2D port's ceilings — `12` atlas draw calls, `24` total — **will not hold** and are not
inherited. The lit path adds a full shadow-map pass, and even instanced billboards add batches. The
2D spec itself requires amendment when a measured scene cannot meet its limits.

2.5D-specific ceilings, set before Stage 4 and measured at Stage 1:

- one world-atlas texture, at most one glow texture, unchanged;
- no rendered tile owns a standalone GPU material, unchanged;
- characters render in **one** instanced batch, not one draw call each;
- static world geometry merges to a bounded number of batches per material;
- a numeric total ceiling is set from the Stage 1 measurement and locked before Stage 4.

Same source commit, package, machine, window, DPR, zoom, camera, and fixture as the 2D baseline.
Both paths must hold:

- rounded `60 FPS` in the maximum-load scene;
- rounded `60 FPS` during local-model generation on qualified hardware;
- no repeated frame above `50 ms` during pan, zoom, or map entry;
- no resource growth after 20 map transfers, 20 zoom cycles, and 10 world-surface remounts;
- fixed evidence at DPR `1`, `1.25`, `1.5`, and `2`.

If the lit path misses a gate, the fallback must pass it. Shipping the fallback is acceptable.
Shipping neither is not.

## 13. Open risks

1. **Horizontal walk readability.** `ART-04` is unresolved in the shipped 2D game. Tested at Stage
   2. Fallback is the mirrored three-quarter head. Most likely cause of the work stopping.
2. **Near-wall occlusion.** No prior art, not solved by the spike, and needs a derivation the frame
   does not supply directly. Tested at Stage 3.
3. **Frame inflation cost.** Over-fetched placements and static-list churn on every pan. Measured at
   Stage 1 and again at Stage 4 outdoors.
4. **Shadow-map cost in packaged Electron.** Mitigated by the mandatory fallback and its own smoke.
5. **Outdoor draw calls.** The spike is one small room. A `64×48` exterior at zoom 1 is different.
6. **Recipe table quality.** `62` sprites get hand-authored box recipes. Cheap to change, but a bad
   table reads as cardboard — the exact failure the spike avoided.
7. **Dual-renderer maintenance.** Every render change until Stage 7 costs twice.

## 14. Verification matrix

| Area | Required cases | Required proof |
|---|---|---|
| Frame purity | `world-frame.ts` unchanged | git diff empty for that file |
| Boundaries | no new `src/world` or `src/domain` import | `npm run check:boundaries` |
| Frame inflation | tilted footprint fully covered at every zoom, no void inside the view | corner-tile board at zoom 1, 2, 3 |
| Geometry churn | rebuild only on window delta | mesh-rebuild counter over a 40-tile pan |
| Projection | round-trip at tile centres, all maps, zoom 1–3 | deterministic unit test |
| Camera | pan, centre, edges, resize, pointer zoom, skirt fill | unit tests and packaged smoke |
| Input | NPC, object, floor, blocked route, panel lock | deterministic tests and packaged smoke |
| Overlays | selection marker, failure marker, area highlights anchored correctly | screenshot board |
| Characters | four facings, two frames, one instanced batch, district tint | trace, draw-call count, night board |
| Walk readability | horizontal walk at native `1×` | `ART-04` comparison board |
| Recipes | every landmark resolves; every recipe key exists in `ATLAS_INDEX` | two-way coverage check |
| Occlusion | outside, doorway, inside, leave, reload | state proof and screenshots |
| Lighting | district times, shelter, lamp props, both paths, blob shadows in each | fixed native `1×` comparisons |
| Shadow paths | each path has its own packaged smoke on every CI run | two smoke artifacts |
| Pixel look | nearest filter, integer scale, flat shading | human side-by-side, not spike pixel-diff |
| VFX | every kind, fallback, culling, reduced motion | evidence schema and package smoke |
| Saves | fresh start, load, autosave, restart, no migration | save qualification, schema stays `v7` |
| Performance | normal, maximum load, model generation, both paths | same-package frame report |
| Lifecycle | remount, transfer loop, context loss | resource-count report and recovery smoke |
| Security | CSP, app protocol, bridge, no Node, preload whitelist | Electron security suites |
| Rollback | 2D renderer still selectable and passing | full 2D suite green after every stage |

## 15. Effort

Estimates assume one focused developer and the boundary in section 8.1.

**The headline number depends on the section 8.0 yaw decision.**

| Stage | Yaw = 0 | Spike yaw |
|---|---|---|
| 0 baseline, revocation, preload | 2–3 days | 2–3 days |
| 1 static villa, inflation, yaw A/B | 1–1.5 weeks | 1–1.5 weeks |
| 2 walking villa, picking branches | 1–1.5 weeks | 2–3 weeks |
| 3 occlusion and lighting | 1–1.5 weeks | 1.5–2 weeks |
| 4 one street | 0.5–1 week | 1–1.5 weeks |
| **Stages 0–4** | **3–6 weeks** | **5–8 weeks** |
| 5 full parity | 3–4 weeks | 4–5 weeks |
| 6 qualification | 2 weeks | 2 weeks |
| 7 cutover | 3–5 days | 3–5 days |
| **Whole game** | **8–11 weeks focused** | **11–15 weeks focused** |

Elapsed time for the whole game remains `3`–`5` months at either yaw.

## 16. Final acceptance criteria

- [ ] The rules in section 4 are revoked in writing.
- [ ] The section 8.0 yaw decision is recorded with both Stage 1 images.
- [ ] `src/domain`, `src/world`, `src/ai`, and `content/` have no diff.
- [ ] `src/render/world-frame.ts` has no diff.
- [ ] The only `electron/` diff is the `electron/preload/index.ts` whitelist line.
- [ ] No character sprite is added or modified. `art:check` is green with no regeneration.
- [ ] Saves load with no migration. The save chain stays `v1`→`v7`.
- [ ] The round-trip invariant holds at tile centres on all four maps at every zoom step.
- [ ] No void appears inside the tilted view at any zoom; outside-map area shows the skirt fill.
- [ ] Static geometry rebuilds only on tile-window delta.
- [ ] Characters render in one instanced batch and take district tint.
- [ ] Blob shadows render in both the lit and fallback paths.
- [ ] Both shadow paths have a packaged smoke that runs on every CI run.
- [ ] Recipe coverage passes in both directions.
- [ ] Near-wall occlusion is stable across enter, doorway, inside, leave, and reload.
- [ ] 2.5D draw-call ceilings are set from Stage 1 measurement and met at Stage 4.
- [ ] Performance gates pass on at least the fallback path.
- [ ] The result reads as chunky pixel art, not smooth 3D.
- [ ] `ART-04` horizontal walk readability passes, or the mirrored three-quarter fallback ships.
- [ ] The 2D renderer is still selectable and its full suite is green.
- [ ] `npm run verify` passes.

## 17. Rollback rules

The 2D renderer is the rollback path and is not removed by this work.

Rollback at any stage is one change: `rendererForEnvironment()` returns `'threejs-2d'`.

Because `world-frame.ts` is frozen, the 2D path cannot be broken by 2.5D work. Any stage that turns
a 2D test red is a boundary breach, and the fix is the boundary, not the test.

The one shared file is `WorldScene.tsx`. Every 2.5D branch there must be behind the renderer
selection, and the 2D path must be provably untouched by a green 2D suite after every stage.

## 18. Audit record

### Revision 1 → 2, after two independent audits

Both audits verified claims against the worktree rather than the draft. Both returned REVISE.

**Convergent findings — both audits, independently:**

| Finding | Effect on spec |
|---|---|
| `visibleTileBounds` is an axis-aligned 2D cull; the frozen-frame claim was wrong | section 3 rewritten; resolved by caller-side inflation |
| `WorldScene.tsx` owns the picking and was not in the boundary table | section 8.1 rows added; section 8.5 rewritten |
| `COMPOSITE_BATCHES` is 20, not 21 | section 7.1 |
| Test-case count wrong | section 7.4, now 719 static sites |

**Second audit only:**

| Finding | Effect on spec |
|---|---|
| Save chain is `v7`, not `v6` | section 7.2; also fixed the stale `CLAUDE.md:108` line |
| `worldToScene(tile)` would pop walking every 32 px | section 8.3 now places from continuous coordinates |
| One box per sprite reads as cardboard | section 8.4 recipe table |
| Lamps are props, not `DistrictLighting.pools` | section 8.7 |
| `CLAUDE.md` forbids perspective cameras, not tilt | section 4 revocation withdrawn |

**Fable audit only:**

| Finding | Effect on spec |
|---|---|
| `electron/preload/index.ts` whitelist is hard-coded; the "no electron diff" criterion was unachievable | section 8.2 carve-out; section 16 corrected |
| Yaw is the dominant cost driver; yaw = 0 dissolves most of section 8.5 | **section 8.0 added** — the single largest change in this revision |
| `clampCameraTilted`'s "no void" invariant is infeasible at zoom 1 | section 8.5 void policy |
| `THREE.Sprite` cannot cast into a shadow map; the spike hand-places a blob | section 8.7 — blob quads in both paths |
| Sprites do not batch; the 2D 12/24 draw-call ceilings will break | section 8.6 instancing; section 12 new ceilings |
| Runtime FPS auto-fallback is nondeterministic | section 8.7 explicit override plus per-path smokes |
| Wall→roof-group membership is not in the frame | section 8.8 derivation from `shelterCells` |
| Unlit billboards stay bright at night | section 8.6 district tint |
| Recipe keys can orphan on art regeneration | section 8.4 two-way coverage check |
| `scripts/electron/` holds 14 scripts | section 7.4 |
| Tone mapping is also overridable by localhost query parameter | section 7.1 |
| Static-list churn contradicts the no-rebuild rule | section 8.3 rebuild rule corrected |

**Conflict resolved.** The second audit said to unfreeze `visibleTileBounds`. Fable found a legal
alternative: inflate `viewInput.viewport` from `WorldScene.tsx`, which is not frozen. Fable's
approach is taken because it preserves the boundary, and its cost is now carried in sections 3, 13,
and 15.

**Estimate movement.** Revision 1 said `8`–`11` weeks unconditionally. Revision 2 makes it
conditional on yaw: `8`–`11` at yaw = 0, `11`–`15` at the spike yaw. Stages 0–4 move from a flat
`3`–`6` weeks to `3`–`6` at yaw = 0 and `5`–`8` at the spike yaw.

**Carried from revision 1, unchanged and endorsed by both audits.** Not isometric. `src/world`,
`src/domain`, and saves frozen. Four-direction billboards with no new art. Dual renderer with
production on 2D. Mandatory shadow fallback. Hard stop after one villa and one street. `ART-04` as
a stop gate. Rules revoked in writing first.

## 19. Audit questions for the next round

Revision 1's question 1 is answered in section 3 and closed.

1. Is caller-side inflation genuinely enough, or does some frame consumer clamp to the real viewport
   downstream of `viewInput`?
2. At yaw = 0, does the look justify the project at all? If the Stage 1 A/B says no, the spike-yaw
   column in section 15 is the real estimate.
3. Is deriving wall→roof-group membership from `shelterCells` adjacency correct for L-shaped and
   nested roof groups?
4. Does the instanced-billboard requirement in section 8.6 conflict with the reduced-motion or
   accessibility paths that currently special-case character rendering?
5. Is a per-machine-class default for the shadow path recordable in this repo's evidence format, or
   does it need a new artifact type?
6. Section 12 defers the numeric draw-call ceiling to a Stage 1 measurement. Is deferring a ceiling
   acceptable, or does Stage 0 need a provisional number to fail against?
