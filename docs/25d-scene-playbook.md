# 2.5D Scene Playbook

How to take any location in this game to a 10/10 render.

Give a location — "office building", "night market", "subway platform" — and work this document
top to bottom. Every step is a bounded action with a number you can check. Every trap in section 9
cost a real capture round to find; read that section before you start, not after.

**Target look:** dark world, bright objects, one warm pocket of light, hard pixel shadows,
readable colour on every surface. Pixel art rules are absolute and never traded for realism.

---

## 1. The rating rubric

Score the capture out of 10. Ten criteria, one point each. A scene ships at **9.4 or higher**.

| # | Criterion | Fails when |
|---|---|---|
| 1 | **Depth reads** | Boxes show two faces. A box showing one face is top-down with chunky edges. |
| 2 | **Structure reads** | Walls stand tall enough to enclose. Props have visible mass, not floor decals. |
| 3 | **Light falls on things** | A prop near a lamp is brighter than the same prop far from one. |
| 4 | **Shadows are hard** | Aliased, single-step edges. Any soft gradient breaks the pixel rules. |
| 5 | **Colour survives** | Every object keeps its own hue at night. No black slabs, no grey mush. |
| 6 | **Colour matches** | Furniture, walls, floor and characters sit in ONE palette and one light. Nothing looks pasted in from a different scene. |
| 7 | **Material variety** | Wood, brick, metal and fabric are distinguishable. Not one plastic. |
| 8 | **Density** | No large empty region. The frame has foreground, middle and background. |
| 9 | **Character legible** | The player is always visible, never a silhouette, never lost in the set. |
| 10 | **Pixel discipline** | Nearest filter, integer scale, flat shading, no anti-aliasing, no smooth normals. |

Criterion 6 is the strictest and the easiest to lose. A scene can pass 1–5 and still look wrong
because one class of object took a different darkening curve from everything around it. Check it
by naming the brightest and darkest object in frame and asking whether one light explains both.

**Stop rule.** Iterate until a round scores 9.4+ AND gains only 0.1 over the previous round.
Two rounds of 0.1 gain means the remaining gap is not in the renderer.

---

## 2. Constraints — read before touching anything

**Frozen. Do not edit:**
`src/domain`, `src/world`, `src/ai`, `content/`, `src/render/world-frame.ts`,
`src/render/three/world-renderer.ts` (the 2D rollback path).

This matters more than it sounds. **You cannot add geometry to a map.** If a location is sparse,
you cannot place a crate there. You change how existing placements are DRAWN — the recipe, the
colour, the light — never what exists. Section 8 is how you handle a sparse location.

**No new art.** The atlas is generated and `art:check` must stay green. Every material in this
playbook comes from reinterpreting sprites already in the atlas.

**Pixel rules, absolute:** `NearestFilter`, no mipmaps, `anisotropy: 1`, `flatShading: true`,
`alphaTest: 0.5` (never `transparent` for cutouts), integer scaling, no anti-aliasing.

**Camera rules:** orthographic only. No perspective, no free orbit, no heightmaps, no displacement
maps, no imported models. Authored box heights are allowed. Characters stay upright four-direction
billboards in both renderers.

**Draw-call ceiling: 10 total, 5 atlas** (`src/render/three25/ceilings.ts`). The scene bakes into
merged batches, so the count moves only when you add a BATCH, a PASS or a MATERIAL — never when you
add geometry. A breach means you added one of those three. Fold the work into an existing batch
before raising the ceiling, and if you raise it, name the batch and why it could not join another.

---

## 3. Phase 1 — Camera

Both values live in `src/render/three25/projection.ts` and everything derives from them.

1. **Yaw 45°** (`CAMERA_YAW_DEGREES`). At yaw 0 every box shows exactly one face and the picture
   reads as top-down. At 45 every box shows two. This is the single largest step from "flat" to
   "2.5D" and nothing else substitutes for it.
2. **Elevation 30°** (`GROUND_TILT_DEGREES`). Vertical faces stay 87% as tall on screen as in world
   space, which is what makes a wall read as a wall. Higher elevation shows mostly box tops.

Changing either is safe: the projection, `inflation.ts`, `clamp.ts` and the near-wall rule in
`occlusion.ts` all derive from the constants rather than assuming a value. Three things must move
together if you do change them, or the scene silently breaks:

- **Frame inflation** — a tilted view sees further, so the frame request must be taller.
- **Camera clamp** — the visible ground is a ROTATED rectangle, so its bounding box is wider AND
  deeper than the screen. Clamp the footprint corner, then recover the anchor.
- **Near-wall culling** — cull the shelter sides whose outward normal faces the viewer, so the
  player sees into the room they stand in. Derive "facing" from the yaw, never from a hardcoded
  compass direction.

---

## 4. Phase 2 — Geometry

A location looks good when its objects have mass. That comes from box recipes in
`src/render/three25/recipes.ts`.

1. **Walls at 1.45 tiles** (`WALL_HEIGHT_TILES`). Tall enough to enclose, short enough not to hide
   the room.
2. **One recipe per sprite.** A recipe is a list of boxes in tile units, relative to the tile
   centre. Build furniture from 2–5 boxes, not one slab. A bench is a seat plus a back rail. A lamp
   is footing, stem, head. A single box per prop is what "furniture looks like slabs" means.
3. **Structure must be visible from above.** The camera looks down 30°, so uprights hidden inside a
   shelf span are invisible. Put a rack's uprights at the shelf CORNERS and trim the shelf so the
   frame shows. This is the difference between a structure and a painted plate.
4. **Wall side faces need the opaque variant.** Wall sprites are top-down stamps with transparent
   margins — `tile.wall-villa-5` is 81% opaque. Mapped onto a vertical face and cut by `alphaTest`,
   those margins punch holes straight through the wall. Use the family's fully-connected `-f`
   variant for `sideSource` (96% opaque).
5. **Doors must face their doorway.** The frame resolves the axis into the sprite id
   (`-vertical` / `-horizontal`). Read it. A door slab turned broadside leaves the gap open on one
   side and a stub sticking out the other.
6. **Multi-tile props: owner-consumes fails for ragged runs.** A group placed as `left@0 right@1
   left@2` has no single owner. Those groups need per-tile recipes — see `RUN_FORMING_GROUPS`.
   Derive the set from the map JSON in a test; do not hand-list it.

---

## 5. Phase 3 — Colour

This is where criterion 6 is won or lost. **Every surface class must take the same light and the
same darkening curve.** One class on a different curve is instantly visible.

1. **Measure the sprite's colour, excluding outline.** A modal colour by raw pixel count returns
   the OUTLINE for thin objects — a lamp post is mostly outline by count, so it came back near
   black and every lamp, crate and planter rendered black. Exclude pixels below luminance 55.
   The measured table is `PROP_FLAT_COLORS`.
2. **Lift dark paint to a readable floor.** `readableTint(tint, floor = 190)` scales channels
   rather than adding grey, so the hue survives. Pure black is left alone (no divide by zero).
3. **Authored tints and measured tints must take the SAME curve.** This one inconsistency is what
   made two whole districts look unfinished while the villa looked done. If authored colours skip
   the night mix and measured ones take the full mix, the scene splits into two palettes.
4. **A tint is PAINT, not appearance.** For a lit surface, the tint is the albedo and the scene's
   lights decide how dark it reads. Mixing the day cycle into the tint as well darkens twice.
   Only UNLIT surfaces (characters, lamp heads) carry the day cycle in their tint — characters via
   `tintForLighting(colour, lighting, UNLIT_NIGHT_STRENGTH)` with `UNLIT_NIGHT_STRENGTH = 0.18`.
5. **Reinterpret floor sprites for the corner camera.** A tile authored to read from directly
   overhead can look flat at 30°. `FLOOR_SOURCE_OVERRIDES` swaps one atlas cell for another already
   in the atlas — the villa's grey-brown tile borrows `tile.boardwalk`'s warm planks. No new art.
6. **Never let a character go dark.** Test it: at midnight the player's brightest channel stays
   above 0x80. A black silhouette is the one thing a player must never get.

---

## 6. Phase 4 — Lighting

The reference look is **dark world, bright objects, one warm pocket**. Four lights make it.

1. **Hemisphere (sky) light.** `'#f5dcb0'` sky over `'#4a4a44'` ground, intensity 1.1 on the lit
   path (1.7 on the fallback, which has no sun).
   - The GROUND colour is what lights a VERTICAL face — a hemisphere light blends sky and ground by
     the face normal, so lamp posts, crate sides and sofa arms all sit near the midpoint. Too dark
     a ground colour crushes every vertical to black.
   - **Night floor 0.62 of day**, not 0.09. This is the only thing between a prop far from any lamp
     and pure black. Curve: `day * (0.62 + 0.38 * elevation)`.
2. **Directional sun**, `'#ffefdb'` at `0.15 + elevation * 3.2`. Three things must be set or it
   does nothing, and each failed silently once:
   - `castShadow` on the light AND `castShadow`/`receiveShadow` on the meshes.
   - Aim `sun.target` at what is ON SCREEN. The camera position sits 256 tiles back along the view
     axis; aiming at it puts the sun far behind the visible footprint.
   - Call `sun.shadow.camera.updateProjectionMatrix()` after setting the frustum. Without it three
     keeps its default −5..5 box and every value you set is dead.
3. **Shadow map: `BasicShadowMap` at 256, frustum ±40 tiles.** Hard and aliased on purpose. PCF
   reads as smooth 3D and breaks the pixel rules. Set `normalBias` (0.35) for thin geometry.
4. **Point lights at lamps.** `distance 11, decay 1.4`, intensity `0.2 + lampMix * 11`. A lamp must
   be the brightest thing in a dark frame or the scene reads as uniformly dim. Distance and decay
   matter as much as intensity: at `distance 7, decay 2` a lamp lit only the tile it stood on.
5. **Lamp heads must be UNLIT.** The point light sits inside the head box, so every face normal
   points away from it and a lit head renders black. Give them an explicit `glow` flag and their
   own unlit batch. Guard it with a test: only lamp fixtures may set `glow`.
6. **Additive light pools on the floor**, radius 3.2 tiles, opacity `0.5 * lampMix`, no depth write.
   Additive brightens the floor instead of painting a flat disc over it.
7. **Blob shadows under characters, in BOTH paths.** A camera-facing billboard has no meaningful
   silhouette from the sun's direction, so it can never cast into the shadow map. Blobs are the
   only shadow a character gets. Give the blob material `vertexColors` or every blob ignores the
   frame's shadow tint and draws white.
8. **Ship a no-lights fallback path.** It must hold 60 FPS and carry its own packaged smoke. Path
   selection is explicit, never a runtime FPS probe.

**Two darkeners will stack if you let them.** `FACE_SHADE` (`[0.82, 0.82, 1, 0.6, 0.66, 0.66]`)
fakes lighting by darkening a box's sides so it reads as a box with no light in the scene.
Multiplied into a surface a real light already shades, it darkens twice. Lit boxes take
`LIT_FACE_SHADE` (`[0.96, 0.96, 1, 0.9, 0.93, 0.93]`) — just enough for an edge.

---

## 7. Phase 5 — Staging

A correct render of a boring frame still scores badly. Criterion 8 is about composition.

1. **Crush everything outside the room toward the void.** `shelteredTint` mixes toward `#07070b` by
   `0.35 + 0.6 * night`. This gives an open map the enclosed-stage read without inventing a wall
   the simulation does not have. It is the cheapest large score gain available.
2. **Props take HALF that crush.** At full strength the night factor reaches 0.95 and the crush
   stops pushing a prop back and starts deleting it — terrace lamp posts became floating heads over
   black sticks. Ground and buildings take the full crush; objects on them do not.
3. **A skirt fills everything outside the map bounds.** At zoom 1 the tilted footprint is taller
   than the map, so no clamp can avoid seeing past the edge. The skirt is what the player sees
   there instead of the clear colour.
4. **Frame the dense part of the location.** Centre on the player and pick a time of day. Night at
   minute 1245 gives the pooled-light look; noon proves colour correctness. Capture both — noon is
   your control when something looks wrong.

**Do not use distance fog.** The camera is orthographic and sits 256 tiles back, so every fragment
is at effectively the same depth: any useful density blackens the entire frame. Measured, not
assumed. The void crush in step 1 does the job fog was reached for.

---

## 8. Phase 6 — The verification loop

Never judge from the code. Capture, look, measure, change one thing, capture again.

1. `npm run typecheck`
2. `npm run export:web`
3. `npx tsx scripts/verification/capture-25d-districts.ts --output-root artifacts/phase-25d/<new-dir>`
4. Read the PNGs. Score against section 1.
5. Crop and upscale anything suspicious. A 3× nearest-neighbour crop of one prop settles arguments
   that staring at the full frame cannot. Standard deviation inside a region is your flatness
   number: a textured floor reads sd ≈ 17, a flat plastic box reads sd ≈ 0 within a face.
6. Change ONE thing. Re-capture. If the image does not change, your hypothesis was wrong — do not
   stack another guess on top of it.
7. `npm test`, `npm run check:boundaries`, then commit.

**Electron rules:** hidden windows only (`show: false`, `stayHidden: true`), audio muted before
content loads, background throttling off, every process closed on success AND failure. Never full
screen, foreground input, `moveTop` or always-on-top. Drive the UI through
`webContents.executeJavaScript` and `sendInputEvent`, never the host keyboard or mouse.

**Bisect a dark scene with three captures:** lit at night, fallback at night, lit at noon. Noon
tells you the pipeline is correct. Fallback tells you whether the sun and shadow map are to blame.
The night-lit shot alone tells you nothing.

**Evidence is DOM-visible on purpose.** `#world-state`, `#world-camera-state`,
`#world-movement-state`, `#world-geometry-state` and friends carry state in `aria-label` on hidden
nodes. Changing a label format breaks smokes — update both sides together. The smoke-only labels
appear only when `window.siWorldSmokeMode === true`.

---

## 9. Traps

Every one of these cost a capture round. The right-hand column is what settled it.

| Symptom | Real cause | How it was settled |
|---|---|---|
| Furniture looks like plastic | Props drawn unlit while walls and floors are lit | Lamp-adjacent and far props were identical colour |
| Lit furniture goes black | Three darkeners stacking: `FACE_SHADE`, tint day-cycle, `shelteredTint` at 0.95 | Noon capture showed correct colour |
| Lamp head renders black | Point light is INSIDE the head box; all normals face away | Head bright when unlit, black when lit |
| Lamp post renders black | `shelteredTint` at full strength outside the room | Docks (no shelter cells) had a different cause |
| Every prop black | Modal colour by pixel count returns the OUTLINE for thin sprites | Recomputed excluding luminance < 55 |
| Two districts look unfinished | Authored tints skipped the night mix, measured tints took the full mix | One curve for both fixed two districts at once |
| Whole frame black | `FogExp2` under an orthographic camera 256 tiles back | Removed fog entirely; capture came back |
| Lit path has no shadows | `castShadow` unset, sun aimed at the camera, frustum set without `updateProjectionMatrix` | Three separate fixes, all silent |
| 2345 draw calls | One `Mesh` per descriptor | Merged baked geometry: 2 calls from 4000 descriptors |
| Walls striped or holed | Transparent margins on top-down wall sprites cut by `alphaTest` | Use the `-f` opaque family variant for sides |
| Hole punched in a wall | "Greatest tile.y per column" hit an interior partition | Generalised to camera-facing sides |
| Billboards lean | Card oriented to the view plane instead of world-vertical | World-vertical, yaw-facing only |
| Production renders yaw 0 | `selectedYawDegrees()` defaulted to 0 instead of `CAMERA_YAW_DEGREES` | Defaulting a derived constant to 0 is a bug, not a safe fallback |
| Blob shadows white | Material missing `vertexColors` | — |
| Flat-shade colour wrong | UV landed on a texel boundary | Snap to texel centre |

**Reviewers are not oracles.** A reviewer once diagnosed dark props as shadow acne; measurement
showed the lit path was BRIGHTER than the fallback with fewer near-black pixels. Another correctly
refuted a "schedule walk" diagnosis by proving no protagonist schedule mover exists. Take the
evidence, not the verdict.

---

## 10. Worked example — "Office building"

1. **Constraints.** Find the map and district. List the sprites the frame emits there. You may not
   add a desk that content does not place.
2. **Camera.** Nothing to do — yaw 45 / elevation 30 are global.
3. **Geometry.** Write recipes for every office sprite with none. Desk = top slab + two pedestals.
   Chair = seat + back + stem + base. Partition = tall thin box at `WALL_HEIGHT_TILES * 0.7`.
   Filing cabinet = body + three drawer-front strips. Check each from above: is any part hidden
   inside another?
4. **Colour.** Measure modal colour per sprite excluding luminance < 55. Add to `PROP_FLAT_COLORS`.
   Run `readableTint`. Author tints only where one prop needs two materials — a desk's pale top
   over a dark pedestal. Verify authored and measured take the same curve.
5. **Lighting.** Offices are ceiling-lit, so the pooled-lamp look is wrong. Raise the hemisphere
   night floor for this district, or map ceiling fixtures to point lights at greater height and
   larger `distance`. Keep lamp heads `glow`.
6. **Staging.** If the floor plate is open, `shelterCells` will crush the surround — check the
   capture actually frames desks and not empty carpet. Pick the densest spot.
7. **Loop.** Capture night and noon. Score. Change one thing. Repeat until 9.4+ with a 0.1 gain.
8. **Verify.** `npm test`, `check:boundaries`, draw calls under 10, `art:check` green. Commit.

---

## 11. Quick reference

| Thing | Value | File |
|---|---|---|
| Camera yaw | 45° | `three25/projection.ts` |
| Camera elevation | 30° | `three25/projection.ts` |
| Wall height | 1.45 tiles | `three25/recipes.ts` |
| Face shade, unlit | `[0.82, 0.82, 1, 0.6, 0.66, 0.66]` | `three25/world-renderer-25.ts` |
| Face shade, lit | `[0.96, 0.96, 1, 0.9, 0.93, 0.93]` | `three25/world-renderer-25.ts` |
| Sky light | `#f5dcb0` over `#4a4a44`, 1.1 lit / 1.7 fallback | `three25/world-renderer-25.ts` |
| Sky night floor | 0.62 of day | `three25/world-renderer-25.ts` |
| Sun | `#ffefdb`, `0.15 + elevation * 3.2` | `three25/world-renderer-25.ts` |
| Shadow map | `BasicShadowMap` 256, frustum ±40, normalBias 0.35 | `three25/world-renderer-25.ts` |
| Lamp point light | distance 11, decay 1.4, `0.2 + lampMix * 11` | `three25/lighting.ts` |
| Lamp pool | radius 3.2 tiles, opacity `0.5 * lampMix`, additive | `three25/lighting.ts` |
| Void colour | `#07070b` | `three25/world-renderer-25.ts`, `three25/scene-builder.ts` |
| Outside-room crush | `0.35 + 0.6 * night`, props at 0.5 strength | `three25/scene-builder.ts` |
| Readable floor | luminance 190 | `three25/billboards.ts` |
| Unlit night strength | 0.18 | `three25/billboards.ts` |
| Modal colour cutoff | exclude luminance < 55 | `three25/recipes.ts` |
| Draw-call ceiling | 10 total, 5 atlas | `three25/ceilings.ts` |
| Alpha cutout | `alphaTest: 0.5`, never `transparent` | `three25/world-renderer-25.ts` |
| Night capture minute | 1245 | `scripts/verification/capture-25d-districts.ts` |
