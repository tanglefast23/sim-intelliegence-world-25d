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

### The frame carries more than you are drawing

**Before anything else, list the fields on `WorldFrameState` and check which ones your renderer
actually reads.** The 2.5D path silently ignored three of them for its entire life:

| Field | What was lost |
|---|---|
| `effects` | Every ambient VFX. Club neon, courtyard steam, yard steam, water glint, patio fire. |
| `transientEffects` | Footfall dust, click ripples, blood, muzzle flashes. |
| `transientGlows` | Every one-shot light. |
| `propShadows` | Every prop's ground contact, so the whole scene floated. |

Three of the four district captures are deliberately framed on a VFX fixture. One caption read
`COURTYARD-STEAM-WEST` over a courtyard with no steam, for months, and nobody noticed because the
evidence label counted rects the renderer never drew. `grep` for each field name under your renderer
directory. A field with zero hits is a feature you are not shipping.

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
5. **A tint on a MAPPED surface multiplies the sprite. It cannot brighten dark art.**
   Floors, walls and roofs draw through the atlas material, so their tint is a multiplier and
   `#ffffff` is the identity. Forcing every floor tint to white changed a capture by zero pixels.
   If a surface is too dark, the sprite is dark — the only renderer-side lever that could lift it is
   a linear vertex colour above 1.0, which a hex tint cannot express. Props are different: their
   material is unmapped, so their tint IS the colour.
6. **Reinterpret floor sprites for the corner camera.** A tile authored to read from directly
   overhead can look flat at 30°. `FLOOR_SOURCE_OVERRIDES` swaps one atlas cell for another already
   in the atlas — the villa's grey-brown tile borrows `tile.boardwalk`'s warm planks. No new art.
7. **Never let a character go dark.** Test it: at midnight the player's brightest channel stays
   above 0x80. A black silhouette is the one thing a player must never get.

---

## 6. Phase 4 — Lighting

The reference look is **dark world, bright objects, one warm pocket**. Four lights make it.

1. **Hemisphere (sky) light.** `'#f5dcb0'` sky over `'#4a4a44'` ground, intensity 1.1 on the lit
   path (1.7 on the fallback, which has no sun).
   - The GROUND colour is what lights a VERTICAL face — a hemisphere light blends sky and ground by
     the face normal, so lamp posts, crate sides and sofa arms all sit near the midpoint. Too dark
     a ground colour crushes every vertical to black.
   - **Night floor 0.78 of day**, not 0.09. This is the only thing between a prop far from any lamp
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
5. **A lamp casts ITS OWN colour, never the district accent.** Derive the point-light colour from
   the glow box in the lamp's own recipe (`LAMP_GLOW_COLORS`). Taking the district accent made an
   amber dock lamp throw a teal pool, and the whole harbour read as one cold monochrome with warm
   dots floating in it. This was the largest single gain of the district pass.
6. **Skyglow: after dusk, tint the sky light by the MOST SATURATED lamp in frame.** A neon
   street lights its own sky. Two traps, both measured:
   - Do not tint by the district accent. It gained saturation in three districts and lost more than
     it gained in the harbour, whose accent is teal while its lamps are amber. Tinting a scene's sky
     with the complement of the light in it cancels the warm-on-cool contrast that makes it read.
   - Do not AVERAGE the lamps either. A neon street's cyan and magenta lamps average to grey, so the
     most colourful scene in the game tinted its own sky with no colour at all.
   - Rescale the glow colour to the day sky's brightness before mixing. An accent or lamp tint is
     chosen to be saturated, not bright, so a raw mix moves EXPOSURE as well as hue: it cost 2-5
     luminance everywhere and raised the dead fraction it was added to cut.
7. **Anything that IS a light must emit, and must take no face shade.** A glow box's authored tint
   has to reach the pixels unchanged — that is the whole reason the unlit batch exists. Bake glow
   boxes with a flat `[1,1,1,1,1,1]`; the default face shade drew every lamp head's two visible
   faces at 82% and 66% of its glow. Then look for what ELSE should be emitting: neon signs, lit
   windows, screens. Downtown had fourteen neon signs drawn as painted planks — more emitting
   surface than all its lamp posts together. Give them a `glow` panel, but do NOT add them to the
   lamp set: that set drives the point lights, and fourteen more would recompile every lit material
   on the frame a lamp enters the window.
8. **Lamp heads must be UNLIT.** The point light sits inside the head box, so every face normal
   points away from it and a lit head renders black. Give them an explicit `glow` flag and their
   own unlit batch. Guard it with a test: only lamp fixtures may set `glow`.
9. **Additive light pools on the floor**, radius 3.2 tiles, opacity `0.5 * lampMix`, no depth write.
   Additive brightens the floor instead of painting a flat disc over it.
10. **Blob shadows under characters, in BOTH paths.** A camera-facing billboard has no meaningful
   silhouette from the sun's direction, so it can never cast into the shadow map. Blobs are the
   only shadow a character gets. Give the blob material `vertexColors` or every blob ignores the
   frame's shadow tint and draws white.
11. **Whatever lights the scene must cast its shadows.** After dusk the lamps do the lighting, so
    the lamps must own the shadow direction — otherwise objects sit in a warm pool with a hard
    shadow pointing away from a light that is not lighting them, which is worse than no shadow.
    Move the ONE directional to the CENTROID of the lamps in frame. A centroid moves smoothly on a
    pan; a nearest-lamp pick jumps every shadow in the scene the moment the ranking changes. Never
    give a point light `castShadow` — that is a second shadow map, and a lamp head sits inside its
    own light and self-shadows.
12. **The key MOVES to the lamps; it does not take their colour.** Measured: tinting it to match
    cost the harbour 0.18 saturation, because amber on amber kills the warm-on-cool contrast that
    district reads by. A key bright enough to carve a shadow is bright enough to repaint everything
    it touches. Colour belongs to the point lights and the pools, which are per-lamp and local.
13. **Character blobs must follow the same light.** They are a required companion of the night key,
    not an alternative: box shadows radiating from the lamps while every blob points along a dead
    sun contradicts itself more loudly than either error alone. Keep the short indoor blob inside
    shelter cells — a room is lit from a fixture overhead, which rakes nothing.
14. **A ground mark fades at the rim.** Bake stains and blobs as radial fans with a FOUR-component
    colour attribute, so the rim is transparent while the centre is not. Baked as square quads with
    one flat colour they read as a dark tile someone forgot to remove: nothing else in a scene has a
    hard straight edge like that. With an RGB attribute the only alpha is a material-wide scalar,
    and every mark in the frame has to share it.
15. **A shadow record authored for a 2D overlay is not a 3D centre.** `propShadows.worldX` is the
    cluster's LEFT EDGE and `worldY` its base pushed 25px south, because the 2D renderer draws it as
    a strip under a sprite. Read as a centre, every stain lands low and to the right of its object,
    detached, with nothing above it.
16. **Flicker the light and its pool, never the glow-box tint.** `sceneSignature` hashes box tints,
    so a tint flicker forces a full rebake of the merged world every step. Hash from (lamp id,
    animation step) so it is deterministic for smokes, and use ONE id for both the light and its
    pool — hashing two different keys gives a lamp and the light on the floor under it separate
    flickers, which reads as two lights. **Centre the swing on 1.** A one-sided flicker is not an
    animation, it is an exposure cut, and it measures like one.
17. **Ship a no-lights fallback path.** It must hold 60 FPS and carry its own packaged smoke. Path
   selection is explicit, never a runtime FPS probe.

**Converting 2D VFX to 2.5D is per KIND, never one rule.** The 2D kit is authored in screen space
for a top-down camera, where "up the screen", "north" and "up in the air" are one direction. Under a
corner camera they are three, and which one an effect meant is a property of that effect:

- `rise` — the authored vertical offset is HEIGHT. Fire and steam go up.
- `spread` — it is north-south POSITION. Two fireflies one above the other in 2D are two fireflies a
  stride apart on the ground. Same for a band of water glints. Spending that offset on height turned
  a harbour's shoreline into a fence of light standing on the water.
- `fixed` — the effect belongs at a known height on the object it decorates. Derive it from that
  object's recipe, never guess: a neon sign panel centres at 1.01 tiles, a palm canopy at 1.65.

**Additive is for light; alpha is for matter.** This is not a look preference. Forcing everything
additive DELETES marks — blood is `#5e1a18` and dust is drawn in the shadow colour, and a dark colour
added to a lit floor contributes nothing at all. Two marks the spec calls critical were vanishing
structurally, not merely looking faint.

**An emitter's `bounds` is a cull box, not a ground contact.** Its bottom extent differs per kind.
Using it as the ground line slides every effect south, which at yaw 45 is toward the camera.

**Pin the ambient phase for captures; do not force the clock.** The VFX clock only advances while
time runs, so a paused capture always shows step 0 — no steam risen, no flame flickered. Forcing the
clock to run instead makes the frame depend on when the screenshot landed, which is exactly the
timing noise a frame-diffing scorer must not have.

**Two darkeners will stack if you let them.** `FACE_SHADE` (`[0.82, 0.82, 1, 0.6, 0.66, 0.66]`)
fakes lighting by darkening a box's sides so it reads as a box with no light in the scene.
Multiplied into a surface a real light already shades, it darkens twice.

**Every lit batch must take the lit table — check them all.** Fixing this for furniture and leaving
it on walls means the double-darkener is still on every building in the game. Walls, doors and roofs
are lit too.

**But a lit box still needs a SIDE split, and only a side split.** `LIT_FACE_SHADE` is
`[1, 1, 1, 1, 0.82, 0.82]`. A hemisphere light blends sky and ground by `normal.y`, so all four
vertical faces of a box take an identical mix, and after dusk the sun is down to 0.15 and cannot
separate them either — away from a lamp this table is the only thing giving a box two tones, and
without it every prop at yaw 45 loses its vertical edge. Leave the TOP at 1: real lighting does
separate a horizontal face from a vertical one, so shading it here as well is the double-darkening
again. A first attempt kept every face within 3% of 1, which is below notice and separated nothing.

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
4. **Stand the player in the light, in the dense part.** Where a VFX fixture happens to be is not
   where a district photographs best — one capture framed 70% empty yard with its cargo half out of
   shot. Pick the tile by counting render parts and lamps inside the window the frame actually
   shows, and require it within about three tiles of a lamp. Density alone dropped one district's
   mean luminance by 50: a dense corner with no light in it is a dark corner. And a count is not a
   composition — the densest lamp-lit window in one district is an empty plaza. Look at the result.
5. **Frame the dense part of the location.** Centre on the player and pick a time of day. Night at
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
4. `npx tsx scripts/verification/score-25d-frames.ts <dir> <previous-dir>` — four numbers per
   frame with deltas against the previous round: dead-pixel fraction, mean luminance, mean
   saturation, and a neighbour-step detail measure. Each maps to a rubric criterion. Judging by eye
   works for "is this better" and fails for "is this 0.1 better".
5. Read the PNGs. Score against section 1.
6. Crop and upscale anything suspicious. A 3× nearest-neighbour crop of one prop settles arguments
   that staring at the full frame cannot. Standard deviation inside a region is your flatness
   number: a textured floor reads sd ≈ 17, a flat plastic box reads sd ≈ 0 within a face.
7. Change ONE thing. Re-capture. If the image does not change, your hypothesis was wrong — do not
   stack another guess on top of it.
8. `npm test`, `npm run check:boundaries`, then commit.

**Electron rules:** hidden windows only (`show: false`, `stayHidden: true`), audio muted before
content loads, background throttling off, every process closed on success AND failure. Never full
screen, foreground input, `moveTop` or always-on-top. Drive the UI through
`webContents.executeJavaScript` and `sendInputEvent`, never the host keyboard or mouse.

**Pin the capture size, and never crop by hardcoded pixels.** `capturePage` returns DEVICE pixels,
so a host whose display scale is not 1 hands back a 2× image even with `--force-device-scale-factor=1`.
One round came back doubled; the scorer's fixed 1280×720 crop then sat over the top-left quadrant,
mostly HUD, and reported an art regression that had not happened. The harness now resizes to the
requested viewport and the scorer crops by fraction. A scorer that is wrong about WHERE it is
looking is worse than no scorer, because its numbers still look like measurements.

**Your metrics cannot see a flood, so add one that can.** Every lighting lever raises mean luminance
and cuts dead pixels. A district that lit its whole courtyard evenly therefore measured BEST of four
while looking worst against the rubric's own premise — dark world, bright objects, one warm pocket —
because nothing measured the pocket. Report a pooling ratio: the 90th-percentile block luminance
over the median block's. An even flood sits near 1.4; a scene with real pools sits above 2. Treat any
change that raises luminance and cuts dead pixels together as suspect until the ratio agrees.

**A test that recomputes the code's own formula tests nothing.** A contact-shadow test asserted the
same expression the renderer uses and compared it to itself. It passed for two rounds while every
stain sat half a tile behind its object — the visible symptom disappeared and the feature quietly
stopped rendering. Assert against the WORLD: the stain must land inside the prop's own footprint.

**A hook existing is not its output reaching a pixel.** The capture pipeline asserted that every
smoke hook was present and never that the frame changed. The renderer drew no VFX at all for its
entire life underneath that. Capture the thing itself and look at it.

**Read the evidence at SHOT time.** It was read once at boot, before zoom, district, minute, staging
and the VFX pin, so four different districts reported identical draw calls and descriptor counts —
the spawn frame — and a ceiling breach in any of them would never have surfaced.

**A null result needs a positive control.** "I changed X and nothing moved" has two causes: X does
nothing, or the change never reached the render. Distinguish them before drawing a conclusion. The
cheap control is one change that MUST be visible — move the skirt plane to `y = 5` so it covers the
frame — and confirm the capture changes. Four probes in one round were read as evidence before this
control was run, and one of them was wrong. Checking the bundle hash is not enough on its own: the
renderer lives in `dist/_expo/static/js/web/__common-*.js`, not in `index-*.js`, so watching the
index hash shows a stale build that is not stale.

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
| Amber lamp throws a teal pool | Point light took the district accent, not the lamp's own glow | Largest single gain of the district pass |
| Skyglow costs luminance | Accent mixed raw; an accent is saturated, not bright, so it moves exposure | Rescale to the day sky's brightness first |
| Skyglow helps 3 districts, hurts 1 | Tinted by accent, which is the COMPLEMENT of the lamps in the harbour | Average the lamps in frame instead |
| A whole third of a frame is near-black | The ground SPRITE is dark; tint multiplies it, so `#ffffff` is the identity | Forcing every floor tint to white changed zero pixels |
| Awning floats in mid-air | Recipe had a counter and a canopy and no posts | The eye catches this before it reads anything else |
| A stack reads as one moulded mass | Identical sprites carry one measured colour | Per-prop brightness jitter hashed from the prop id |
| "My change did nothing" | The probe never reached the render | Run the `y = 5` skirt positive control before believing it |
| Lamp head looks dull | Glow boxes baked with the default `FACE_SHADE` | Two visible faces at 82% and 66% of the authored glow |
| A neon district still reads dim | Signs drawn as painted planks, not emitters | 14 signs vs 20 lamp posts — more emitting surface unused |
| Walls darker than furniture | The lit face table was applied to the flat batch only | The double-darkener stayed on every wall in the game |
| Metrics swing wildly with no visible change | The capture resolution doubled; the scorer's crop is in pixels | Compare PNG dimensions before believing a delta |
| A box reads flat at night | Face shade within 3% of 1 — below notice | Only the two visible SIDES need to differ |
| A whole feature is missing | The renderer never reads that frame field | `grep` each `WorldFrameState` field; zero hits is a feature not shipped |
| A shadow floats near its object | A 2D strip anchor read as a 3D centre | Left edge, and 25px south of the base |
| A shadow ends on a hard straight edge | Baked as a square quad with one flat colour | Radial fan, four-component colour, transparent rim |
| Blood and dust vanish | Drawn additively; a dark colour adds nothing to a lit floor | Matter needs alpha, light needs additive |
| Water glints stand up | One orientation rule applied to every effect kind | The offset is depth for `spread` kinds, height for `rise` |
| A neon bloom sits at knee height | Anchored to the cull box bottom instead of the sign | Derive the height from the object's own recipe |
| A capture framed on a fixture shows no effect | The VFX clock is paused, so the phase is 0 | Pin the step; do not force the clock |
| Flicker changes the whole frame's exposure | One-sided swing — it only dims | Centre it on 1 |
| A lamp and its pool blink separately | Two different hash keys for one lamp | One id for both |
| Staging by density goes dark | A dense corner with no lamp is a dark corner | Require the tile near a light |
| A pinned animation phase drifts | The render loop recomputes it from the clock every frame | The HUD clock in the capture read 3 minutes past the request |
| Evidence is identical across scenes | It was read at boot, before any staging | Four districts, one descriptor count |
| A stain hides behind its prop | The 2D anchor recovers the tile's NORTH edge, not its centre | Add half a tile |
| A test passes while the feature is broken | It recomputes the code's own formula | Assert against the world, not the expression |
| A courtyard floods and nothing complains | Signs counted as lights for the crush but light nothing | The crush and the lights must share one definition |
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
| Sky light | `#f5dcb0` over `#4a4a44`, 1.1 lit / 1.7 fallback | `three25/world-renderer-25.ts` |
| Sky night floor | 0.78 of day | `three25/world-renderer-25.ts` |
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
| Face shade, lit (all lit batches) | `[1, 1, 1, 1, 0.82, 0.82]` | `three25/world-renderer-25.ts` |
| Lamp light colour | the lamp's own recipe glow (`LAMP_GLOW_COLORS`) | `three25/recipes.ts` |
| Skyglow | `0.45 * lampMix` toward the mean lamp colour, brightness-rescaled | `three25/world-renderer-25.ts` |
| Prop jitter | ±8%, hashed from the prop id, glow boxes exempt | `three25/scene-builder.ts` |
| Crate lid rim | `#d8c49a` | `three25/recipes.ts` |
| Face shade, glow | `[1, 1, 1, 1, 1, 1]` — none | `three25/world-renderer-25.ts` |
| Floor albedo gain | `tile.dark-asphalt` 1.9, `tile.neon-floor` 1.7 | `three25/scene-builder.ts` |
| Neon sign glow | `#d98cff` downtown, `#ffc46b` market | `three25/recipes.ts` |
| Frame scorer | `score-25d-frames.ts <dir> [previous]` | `scripts/verification/` |
| Capture size | pinned to the requested viewport | `hidden-window-capture.ts` |
| Night key | lamp centroid above `lampMix` 0.6, day colour, 0.65 | `three25/world-renderer-25.ts` |
| Lamp flicker | ±6% centred on 1, on light and pool only | `three25/lighting.ts` |
| VFX modes | `rise` / `spread` / `fixed` per kind | `three25/vfx-25.ts` |
| Prop core threshold | 0.45 tiles; smaller stays flat-shaded | `three25/scene-builder.ts` |
| Outdoor night crush | 0.46 over 4→15 tiles from the nearest emitter | `three25/scene-builder.ts` |
| Capture VFX step | 2 | `capture-25d-districts.ts` |
| Floor lift ceiling | only art below luminance 52 is lifted | `three25/scene-builder.ts` |
| Pooling ratio | 90th-percentile block over median; flood ≈1.4, pocket >2 | `score-25d-frames.ts` |
| VFX proof capture | `capture-25d-vfx.ts` | `scripts/verification/` |
| Renderer bundle | `dist/_expo/static/js/web/__common-*.js` | — |
| Night capture minute | 1245 | `scripts/verification/capture-25d-districts.ts` |
