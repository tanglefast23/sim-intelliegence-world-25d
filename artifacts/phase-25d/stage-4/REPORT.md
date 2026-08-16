# Three.js 2.5D renderer — Stage 4 closeout

Plan: `docs/plans/2026-08-17-feat-threejs-2-5d-renderer-plan.md` (revision 4)
Spec: `docs/specs/2026-08-16-threejs-2-5d-renderer.md`
Branch: `feat/threejs-2-5d-renderer`, 22 commits off `main`

**The renderer draws, and it draws inside budget.** Sections 1, 3 and 4 are command output from
this closeout. Section 7 is code and spec inspection, not a measurement — it is labelled as such.

**This report does not authorise Stages 5–7.** It supplies the draw-call budget and proves the
renderer works on one map. Frame rate, packaged qualification, three of the four maps, and the
visual judgement on look are all still open. Section 10 says exactly what is and is not unblocked.

---

## 1. Gates — all run for this closeout

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 1224 passed, 117 suites |
| `npm run check:boundaries` | valid |
| `npm run content:check` | clean |
| `npm run art:check` | clean, **no regeneration** |
| `npm run audio:check` | clean |
| `npm run build:electron` | clean |
| `npm run smoke:25d:fallback` | pass → `artifacts/phase-25d/stage-3/fallback/smoke.json` |
| `npm run smoke:25d:lit` | pass → `artifacts/phase-25d/stage-3/lit/smoke.json` |

Both smokes are **unpackaged** — see gap 1.

Production `rendererForEnvironment()` still returns `'threejs-2d'`. The 2.5D path is reachable only
through a localhost `?testRenderer=2-5d` override or a smoke-mode flag.

## 2. Frozen roots took no edits

```
git diff --stat main -- src/render/world-frame.ts src/render/three/world-renderer.ts \
  src/domain src/world src/ai content
```

Empty.

`electron/` is a separate matter: it took the five diffs the Global Constraints permit, plus the
shadow-path flag in `electron/preload/index.ts`, a file that list already owns. It is changed, and
changed within the allowance.

## 3. Draw calls

`npm run measure:25d-draw-calls`, villa start position, both shadow paths, yaw 0 and yaw 35:

| Scene | Draw calls | Atlas draw calls | Descriptors |
|---|---|---|---|
| yaw 0, fallback | 5 | 3 | 2120 |
| yaw 0, lit | 6 | 3 | 2120 |
| yaw 35, fallback | 5 | 3 | 2120 |
| yaw 35, lit | 6 | 3 | 2120 |

**Maximum 6 draw calls / 3 atlas draw calls.**

Ceilings are `DRAW_CALL_CEILING = 8` and `ATLAS_DRAW_CALL_CEILING = 5`. Those are chosen, not
measured: the measured maxima are 6 and 3, and the slack is a judgement call sized to let one extra
pass and one material split land before anything fails. **The plan's provisional 40/16 was retired
by this work, so "inside budget" means inside the budget this plan set from its own measurement,
not inside the number the plan started with.**

The renderer draws five batches — floors, boxes, billboards, the skirt and blob shadows. The lit
path adds a sixth call for the shadow pass. The count is structural, which is why both yaws report
the same number.

**This is the payoff from the one deliberate deviation in the plan.** The plan specified one `Mesh`
per descriptor with a shared material. One `Mesh` is one draw call, so on this pose that design
would have cost **2120 draw calls** against the plan's own ceiling of 40 — over fifty times the
budget. The renderer bakes merged `BufferGeometry` instead, with per-descriptor tint in a
vertex-colour attribute so a single material still covers every sprite.

## 4. Scene size against the 2D renderer

Same villa pose, same 1280×720 surface, camera centred on the spawn tile:

| Renderer | Visible-window count |
|---|---|
| 2D, `frame.drawCounts.total` | 1655 placements |
| 2.5D, scene descriptors | 2120 descriptors |

The 2.5D figure is higher because a prop that was one 2D quad becomes several boxes, and doors and
roof lids are geometry that the 2D path composites differently. Both are counts of things to draw
in one window, so they are comparable in scale — but they are not the same unit, and neither is a
draw call. The 2D path composites its 1655 placements into about 12 batches; the 2.5D path bakes
its 2120 descriptors into 5.

**Archived separately: the Task 3 baseline.** `artifacts/phase-25d/stage-0/baseline.json`, captured
at commit `d502b5c` before any 2.5D code existed, records the **whole-map** 2D layer counts —
floor 3913, prop 110, wall 129, shadow 1, character 1, effect 8, roof 0, total 4162. That is a
full-map figure and must not be divided against any windowed number above.

**Frame timings are not reported.** Task 3 could not capture them without a GPU and a running
window, and this report will not claim numbers nothing produced.

## 5. Yaw comparison — awaiting a human

`artifacts/phase-25d/stage-1/yaw-comparison/`

- `yaw-0-fallback.png` — what the plan ships
- `yaw-35-fallback.png` — the spike angle, for comparison
- `yaw-0-lit.png` — the lit path at the shipping yaw

Production stays at yaw 0 on the fallback path. **Nobody has judged whether the target look
survives the straight-on tilt.** That judgement is an input to Stage 5, not an output of this stage.

## 6. ART-04 — awaiting a human

`artifacts/phase-25d/stage-4/art04/` — three frames, verdict **`captured, not judged`**.

No character art was created or modified, and `art:check` is green with no regeneration. If a later
plan applies the fallback, `spec.md:321` names it: a mirrored three-quarter head and hair over the
existing front torso and lateral legs. Not a full side-facing body.

## 7. Spec section 16 acceptance — by inspection, not measurement

Every row here is read from the code and the spec unless it names a command.

| Item | State |
|---|---|
| Same `WorldFrameState`, no simulation change | true |
| Box geometry only, no heightmaps or models | true |
| Orthographic camera, no perspective, no orbit | true |
| `NearestFilter`, no mipmaps, flat shading, no AA | true |
| Characters stay upright four-direction billboards | true |
| Save schema unchanged at v7 | true |
| 2D path is the rollback path and stays green | true — `npm test`, §1 |
| Draw calls inside budget | true — 6 against 8; see §3 on where 8 came from |
| Lit and fallback paths both ship and both smoke | true, via **unpackaged** per-path smokes |
| Production still selects `threejs-2d` | true |
| Four-map parity | **not attempted** — only `northwest_residential` was exercised |
| Packaged qualification over `app://game/` | **not attempted** — gap 1 |
| 60 FPS measured under load | **not measured** |
| Look judged acceptable at yaw 0 | **not judged** — §5, §6 |

## 8. Known gaps

1. **The per-path smokes are not packaged smokes.** A packaged capture needs a bespoke mode inside
   `electron/main/index.ts`, which the Global Constraints freeze and §2 gates on. Worse, a packaged
   build loads over `app://game/` where the hostname is `'game'`, so every localhost-only override
   would be silently ignored and the smoke would capture a default 2D frame while claiming to test
   2.5D. The smokes drive the real renderer in a real hidden Electron window with a real WebGL 2
   context, over the web export on loopback. What they do not cover is the `app://game/` protocol
   and the desktop bridge.

2. **Pan and centre still use 2D screen maths on the depth axis.** `panCamera` moves by
   `screenDelta / zoom` and `centerCameraOnWorld` offsets by `viewport / zoom / 2`; under the tilt
   both should divide by `zoom * GROUND_Z_SCALE`. Vertical pan therefore does not track the cursor
   exactly and centring is a few tiles off. Clamping and picking are correct; this is a projection
   concern the plan scoped out of Task 15.

3. **Frame rate is unmeasured.** Nothing in this plan produced a frame-time number.

4. **One map, one pose.** Everything measured here is `northwest_residential` at the villa start
   position. The other three maps have never been rendered by this renderer.

5. **Markers, VFX, atmosphere, the selection ring and the destination pulse** are still React
   overlays. They survive the picking branch and render, but they are not 2.5D geometry.

6. **Double-thick south walls would keep their inner course.** Near-wall culling removes the single
   shelter perimeter row. No current map has a double wall.

## 9. What review caught

Every task went through one Grok 4.6 review round at high effort. The findings that changed shipped
behaviour, rather than comments or tests:

- **Doors had no facing.** A fixed `width: 1, depth: 0.36` slab only fills a doorway on one axis; on
  the other it stood broadside, leaving the gap open and a stub through the wall. The frame already
  resolves the axis into the sprite id.
- **Near-wall culling punched a hole mid-villa.** "The wall with the greatest `tile.y` in its
  column" falls through to an interior partition in a column whose south wall is a doorway. Measured
  before the fix: tile (17,14), a partition in the middle of the building.
- **The surface was captured once at construction**, so a window resize never reached the drawing
  buffer or the frustum.
- **Billboards leaned into the view plane**, so a character in a doorway read as falling toward the
  viewer instead of standing parallel to the wall beside it.
- **The lit path produced no shadows at all**: `castShadow`/`receiveShadow` were never set, the sun
  aimed at a point roughly 194 tiles behind the visible footprint, and the shadow camera's frustum
  was assigned without `updateProjectionMatrix`, leaving three's default −5..5 box in force.
- **Blob shadows ignored their tint** — the material lacked `vertexColors` — and dropped their alpha,
  stamping a solid dark oval under every character.
- **Overlay anchors lost their pixel rounding** on the tilted path, blurring pixel-art overlays off
  the grid.
- **Neither per-path smoke proved which path ran.** Both reported the query they sent rather than
  what the renderer built, so an ignored override would have passed both. The evidence hook now
  publishes the built path — and that assertion caught a stale `dist/` on its first run.
- **Tinting billboards faded them out at dusk** instead of darkening them, because `sun.shadowColor`
  is translucent and the mix dragged alpha with it.

Two findings were checked and refuted with map data: that `harbor-cargo-stack` is not placed as a
ragged run (four warehouse objects place `left@0 right@1 left@2`), and the plan's own clamp-test
premise (at 1280×720 over a 2048×1536 map the tilted footprint is 1105px, well inside the map, so
nothing centres).

## 10. What this unblocks, and what it does not

**Unblocked by evidence in this report:**

- The draw-call budget. 8 total / 5 atlas, set from measurement, enforced by two smokes on every
  `verify`.
- The merged-geometry design. Proven necessary and proven sufficient on the villa pose.
- Both shadow paths existing, selectable explicitly, and each covered by its own smoke.

**Still required before Stages 5–7, and NOT supplied here:**

1. **A human looks at the images.** The yaw pair (§5) and the ART-04 board (§6) are unjudged. Files
   on disk are not acceptance. Four-map parity and production cutover both assume the look is
   agreed, and it is not yet.
2. **A frame-rate measurement.** The 60 FPS gate is untouched. Nothing here can stand in for it.
3. **A decision about `electron/main/index.ts`.** Packaged qualification over `app://game/` cannot
   be done without a bespoke capture mode in that file. This plan froze it and §2 gates on it, so
   continuing means deliberately changing that constraint. That is a decision to take, not a script
   to write.
4. **The other three maps.** Only `northwest_residential` has ever been rendered.

Ask for a Stage 5–7 plan once items 1 and 3 have answers.
