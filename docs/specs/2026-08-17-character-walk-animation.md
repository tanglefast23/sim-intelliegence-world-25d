# Character walk animation and blink

Status: draft
Date: 2026-08-17
Branch: `feat/character-walk-animation`
Amends: `docs/specs/2026-08-16-threejs-2-5d-renderer.md` lines 147, 151, 351 (section 8.6), and 607;
`docs/specs/2026-08-12-protagonist-weighted-wobble.md`; `docs/specs/2026-08-11-natural-movement.md`
section 6.2.

## 1. Summary

World characters do not animate. They slide.

The atlas reserves eight cells per character — `front-1`, `front-2`, `rear-1`, `rear-2`, `left-1`,
`left-2`, `right-1`, `right-2` — and four are byte-for-byte duplicates of the other four. The runtime
already selects between them:

```
src/world/pathfinding/movement.ts:512
  walkFrame: Math.floor(travelDistance / 32) % 2 as 0 | 1,
```

The selection is distance-based: one flip per 32-pixel tile of travel. It already ships and it
already drives both renderers. The swap is invisible only because both cells hold the same pixels.

This spec fills the duplicate cells with a real second pose, and adds a blink overlay.

`WALK_FRAME_MILLISECONDS` (145) is stored on the atlas index and range-checked in `atlas-bill.test.ts`.
Nothing flips frames on a timer. Do not design against it.

## 2. What the sprite actually contains today

Verified in `scripts/art/character-source.ts`. An earlier draft assumed a limbed, layer-composed
character and was wrong throughout.

```
worldBodyCommands()   rect C 5,18,14,1   rect C 4,19,16,5
                      rect C 5,24,14,3   rect C 6,27,12,1      <- torso, four solid rects
                      S [4,24] [19,24]   L [3,24] [20,24]      <- "arms": four pixels
                      c [8,18] [15,18]                          <- collar, two pixels

worldLegCommands()    rect D 7,28,10,1   rect K 7,29,10,1      <- "rounded base", two rows
                      frontFrames:   [roundedBase, roundedBase] <- both frames identical
                      lateralFrames: [roundedBase, roundedBase]

eyes                  rect W 7,13,4,2    rect W 13,13,4,2      <- eye whites, rows 13-14
```

There are no arms and no legs. There is a torso block, four hand pixels, and a two-row rounded base.
`composeFrontFrame()` then re-stamps those same four hand pixels after every layer, skipped for
`resident-16`.

`check-generated-art.ts:59` enforces the resulting non-animation:

```
if (!rectanglePixels(atlas, first).equals(rectanglePixels(atlas, second))) {
  throw new Error(`${characterId} ${direction} cells must be byte-identical ...`);
```

## 3. Goals

1. Legs read as alternating across the two walk frames.
2. Arms swing across the two walk frames.
3. A walking character reads as turning into the direction of travel. This is already satisfied by
   the existing `leanX`; no new art is drawn for it. See 5.3.
4. Characters blink.
5. One drawing style, generated from `CharacterLook` like every other layer.
6. Both renderers animate, from the same art.

## 4. Non-goals

- No per-part rig, no paper-doll decomposition, no coverage masks, no runtime part offsets. The
  sprite has no parts to separate.
- No third walk frame.
- No change to the 24x30 cell, the 32x32 tile, `NearestFilter`, or 1x/2x/3x zoom.
- No eight-direction art.
- No portrait change.

## 5. Design

### 5.1 What "legs" and "arms" mean at this size

Honest scope, because both reviewers flagged the first draft for overselling it.

**Legs** are rows 27-29. Frame 0 keeps the current rounded base. Frame 1 shifts that run by one or
two pixels and takes a small bite out of row 27, so the base reads as two feet alternating rather
than one rounded blob. `full-cast-art.test.ts:198-202` requires a single painted run at rows 28-29
in **both** frames, and the kept rounded base satisfies it.

**Arms** are new pixels drawn at the torso sides, at rows the row-24 post-pass does not touch. The
existing four hand pixels at `[3,24] [4,24] [19,24] [20,24]` **do not move**. `composeFrontFrame()`
re-stamps them after every layer, so moving them in `worldBodyCommands()` would be undone, and
drawing them in both places would double them.

`torsoAndClothing` is `StaticLayerSchema` — one command list, no frame index. Frame-indexed arms
therefore cannot live in that layer without a schema change. Instead `composeFrontFrame(source,
frameIndex)` draws the frame's arm pixels after the static torso, the same way it already draws the
row-24 stamp.

One stride pose serves all 35 characters. Per-build leg shapes were considered and dropped: `look.build`
has no use anywhere in `character-source.ts` today, so keying limbs off it is new machinery for a
two-pixel difference.

**Arm swing is front and rear only.** A lateral arm would have to clear the outfit-pattern pixels
that `lateralBodyCommands` already paints at x6-x7, and there is no room at this cell size. The
lateral frames animate on the feet alone.

**The swing points are `[3,23]` and `[19,25]`, and they only paint empty cells.** The low point is
x19 rather than x20 because the torso narrows to x5-18 at row 25: an arm at x20 leaves x19
transparent and the hand reads as detached from the body.

Eleven looks already occupy one of the two at idle — four at `[3,23]` (mina-park, resident-08,
resident-16, sora-tan) and eight at `[19,25]`, including the protagonist through its own
`luggage-strap`. Those costume pixels win, so those characters swing one arm instead of two.
mina-park occupies both and swings neither; its walk comes from the feet alone.

### 5.2 The four emit paths

`build-world-atlas.ts:119-129` writes every `-2` cell from a frame-0 compose. Each path needs its own
fix.

| Path | Today | Change |
|---|---|---|
| Front | `composeFrontFrame(source, 0)` for both cells | Pass 1 for `front-2` |
| Rear | `deriveRearFrame(front, source)` twice | Derive `rear-2` from the frame-1 front |
| Lateral | `composeLateralFrame(source, dir, 0)` twice; `_frameIndex` is unused | Honour the parameter |
| Protagonist | `protagonistReferenceFrames()` overrides all eight cells | Author four new frame-1 cells, plus one eye band = five |

The protagonist is the only character whose art is hand-authored. It needs four new authored token
frames, plus one authored eye band (section 5.4). That is five hand-drawn cells, and the only pixel
work in this spec.

### 5.3 Head turn

`movementPresentation()` already returns `leanX` of -1 on `left` frame 1 and +1 on `right` frame 1,
shifting the whole sprite. That is the turn cue, and it shipped before this work. Nothing is added.

**A one-pixel head shift in the art was tried and removed.** It tore holes. The head is the top
layer and the lateral body starts at row 18, so rows 16-17 are head, hair and accessory only —
moving them exposes cells that never had paint underneath. Measured across the cast: seven of
thirty-five characters gained interior holes in the face, and all thirty-five showed a notch where
the head's trailing edge pulled away. resident-19 lost pixels at [15,17] and [16,16]; resident-08
lost its collar pixel at [8,17].

There is no honest backfill. Skin fattens the neck, cloth invents a collar, and copying the old
pixel smears. `full-cast-art.test.ts` now asserts that no stride frame opens an interior hole the
idle frame did not have, which is the check that was missing when this was first written.

### 5.4 Blink

Blink is an **eye-band overlay**, not a second full body cell.

A full 24x30 blink cell per character costs 35 cells, which takes the atlas forecast from 0.7215 to
0.7493 against a 0.75 cap — 100% of the remaining budget, measured, not estimated. An eye band of
rows 12-14 is 24x3, costing about 4,550 raw pixels total and landing near 0.7258.

**Rows 12-14, not 12-16.** The mouth is `s` at `[11,14]` and `[12,15]`. A band reaching row 15 erases
the mouth, and a blink that collapses the face is worse than no blink. Row 14 still carries the mouth
pixel at `[11,14]`, so the band reproduces that pixel unchanged — the overlay replaces the whole
three-row strip, not just the eye pixels.

Sprite id `character.${id}.eyes`, matching the existing `character.` prefix in `publicIdPrefixes`.
`kind` stays `'world-character'`; only `category` needs a new union member.

**Slice the band from a full closed-eye compose; do not draw a standalone band.** Several looks paint
inside rows 12-14 from other layers — `star-glasses` puts an accent pixel at `[10,14]`, and
`window-glasses` covers the eye region entirely. A standalone "closed lashes" band would pop those
accessory pixels off for 290 ms. Composing the whole cell with eyes closed and then cutting rows 12-14
keeps every other layer in the band exactly as the body cell has it.

Selection is a pure function of values already on the frame:

```
blink = !reducedMotion
     && placement.sprite.endsWith('.front-1')
     && phase(animationTimestampMilliseconds, stableTupleHash([visualId])) is inside the closed window
```

**Use `placement.sprite`, not `placement.source`.** `source` is an `AtlasRectangle` whose `sourceId`
is the character id (`linda`), not the frame name. The frame name is `placement.sprite`
(`character.linda.front-1`). A predicate on `source` cannot see the suffix.

**Front only.** The band is drawn from the front-facing eyes at `W 7,13,4,2` and `W 13,13,4,2`. A bare
`*-1` test also matches `rear-1`, `left-1`, and `right-1`. Rear has no eyes at all — `deriveRearFrame`
turns the face into hair — and lateral eyes are a different drawing from `lateralHeadCommands`.
Stamping the front band on those facings is a visible bug.

**The `.front-1` test replaces "idle only".** `WorldCharacterPlacement` carries no `moving`, no
`pose`, and no `walkFrame` — idle is decided inside `buildWorldFrameState()` at `world-frame.ts:876`
and never reaches the renderer. The sprite suffix is the only predicate available without adding a
frame field.

The consequence, stated plainly: **characters blink on even front-facing strides.** That is
acceptable; people blink while walking. Characters holding a talk pose on `poseFrame` 1 show a `-2`
sprite while stationary and will not blink during it.

Closed window is 290 ms of `animationTimestampMilliseconds`, on a per-character period seeded by
`stableTupleHash([visualId])` so a crowd does not blink in unison.

**The overlay quad must be lifted off the contact point.** `buildBillboards` sets
`z: character.shadowWorldY / TILE_SIZE` and takes height from `source.height`, so a quad stands on the
character's feet. A three-row cell placed at that anchor is a stamp on the shoes. The cell's bottom
row is 14 and the body cell's bottom row is 29, so the overlay lifts by `(29 - 14) * scale` = `15 *
scale` world pixels.

It is baked after the body into the same geometry and material, so it wins under `LessEqual` depth and
draw calls do not change. It exists only while a character is blinking.

`animationTimestampMilliseconds` is `world-frame.ts:233`. `reducedMotion` is `world-frame.ts:232`.
`stableTupleHash` is exported from `src/world/presentation/material-selection.ts`. No field is added
to `WorldFrameState` or `WorldCharacterPlacement`.

## 6. Contract changes

Complete list. Every entry was verified in this worktree. Missing any one of them fails a gate.

### 6.1 Pair-identity assertions that must invert

| File | Assertion |
|---|---|
| `scripts/art/check-generated-art.ts:59` | atlas cells of a pair byte-identical |
| `scripts/art/__tests__/atlas-generation.test.ts:152` | `composeFrontFrame(0)` equals frame 1 |
| `scripts/art/__tests__/atlas-generation.test.ts:183-184` | `leftOne === leftTwo`, `rightOne === rightTwo` |
| `scripts/art/__tests__/full-cast-art.test.ts:300` | `composeFrontFrame(0)` equals frame 1 |
| `scripts/art/__tests__/full-cast-art.test.ts:203-204` | `legs.frontFrames[1]` and `lateralFrames[1]` equal frame 0 |
| `scripts/art/__tests__/protagonist-reference.test.ts:22-27` | "one stable supplied pose for both atlas cells" |
| `scripts/art/character-style-score.ts:222-226` | `stablePose` requires frame 0 equals frame 1 on front and both laterals |

`character-style-score.ts` is the dangerous one. `stablePose` feeds `stableFloatingPose`, `passed`
requires every `renderedChecks` flag, and `full-cast-art.test.ts:212` asserts `passed` for the whole
roster. The protagonist is already exempt at `source.id === 'protagonist'`; the other 34 are not.
`stablePose` must be redefined as "frame 0 is the idle silhouette and both frames keep open margins
and a rounded base", not "the frames are equal".

### 6.2 Shape pins that the new art moves

| File | Pin |
|---|---|
| `full-cast-art.test.ts:193-196` | hand pixels at `[4,24]`/`[19,24]`; rows 25-27 painted widths exactly `[14,14,12]` |
| `full-cast-art.test.ts:198-202` | a single painted run at rows 28-29 for both leg frames |

Frame-1 legs that carve row 27 break the width pin. Keep rows 25-26 at width 14 and adjust the pin
for row 27, or keep row 27 untouched and put the whole leg change in rows 28-29.

### 6.3 Count and area pins

| File | Pin | New value |
|---|---|---|
| `atlas-generation.test.ts:70` | `artRevision` 15 | 16 |
| `atlas-generation.test.ts:72` | 612 sprites | 647 |
| `atlas-generation.test.ts:80` | `forecast.rawRectangleArea` 756_574 | recomputed |
| `atlas-budget.test.ts:21` | `forecast.cellCount` 749 | 784 |
| `atlas-budget.test.ts:22,35` | `rawRectangleArea` 756_574 | recomputed |
| `src/render/__tests__/atlas-bill.test.ts:21` | `artRevision` 15 | 16 |

`atlas-generation.test.ts:75` `transparentPartCells` **stays 138**. World-character cells are written
with `cellClass: null` (`build-world-atlas.ts:138`), and the eye cells must be too. Giving them
`transparent-part` would file blink cells in the wall and furniture list.

### 6.4 Revision lockstep

`build-world-atlas.ts:288` throws if the presentation recipes disagree with the manifest, so bumping
`ART_REVISION` alone fails the build. All of these move 15 to 16 together:

- `src/render/atlas.ts` `ART_REVISION`
- `assets/source/art/manifest.json`
- `assets/source/art/material-recipes.json`
- `assets/source/art/roof-recipes.json`
- `assets/source/art/decal-recipes.json`
- `assets/source/art/transition-recipes.json`
- `src/world/presentation/generated-recipes.json` (builder output; must match)
- `scripts/art/check-generated-art.ts:6` import and `:20` `REQUIRED_GENERATED_ARTIFACTS`, both
  pointing at `revision-15-pixel-hashes.json`
- new `assets/source/art/revision-16-pixel-hashes.json` via `npm run art:baseline`
- `scripts/art/__tests__/sunward-art.test.ts` and `tier-b-art.test.ts` (`ART_PRESENTATION_REVISION`)

### 6.5 New atlas category

`world-character-eyes`, 24x3, `maximumCount` 35. Touches:

- `assets/source/art/manifest.json` categories
- `scripts/art/art-manifest.ts` `ART_CATEGORY_IDS` and the strict schema
- `src/render/atlas.ts` `AtlasRectangle.category` union
- `scripts/art/check-generated-art.ts` — its 24x30 assertion must skip this category

### 6.6 Fixture

`tests/fixtures/rendering/world-frame-v1.json` — **regenerate the whole expected block**, not just
`atlasHash`. `frameSummary()` (`src/render/__tests__/world-frame.test.ts:72-77`) hashes the entire
frame, and every placement embeds its atlas `source` rect. Adding 35 cells repacks the atlas and moves
rects, so `frameHash` changes for every case.

### 6.7 Documents

- `docs/specs/2026-08-16-threejs-2-5d-renderer.md` line 147 (pins "`612` sprites, art revision `15`:
  `280` `world-character`"), line 151 ("No character sprite is redrawn"), line 351 (section 8.6 "No
  character art is created or modified"), and line 607 ("`art:check` is green with no regeneration").
- `docs/specs/2026-08-12-protagonist-weighted-wobble.md` required identical pairs so the body floats
  with no false step. Authoring protagonist frame-1 cells undoes that deliberately. Either keep the
  protagonist's pairs identical, or record that wobble-plus-step is reviewed together at step 4.
- `docs/specs/2026-08-11-natural-movement.md` section 6.2 carries the old differ-except-protagonist
  rule.

`addOutwardContour` (`build-world-atlas.ts:142`) needs no change; it runs per cell on the finished
bitmap, so each new frame gets its own contour.

## 7. Acceptance gates

1. `npm run art:check` is green. (Not a bare `git diff --exit-code`, which fails on any dirty file;
   `art:check` already diffs the generated paths.)
2. Every character's two cells per direction **differ**, and every world-character cell is still
   24x30. The inverted rule in `check-generated-art.ts`.
3. `createAtlasBudgetReport()` **forecast** ratios inside `maximumRawAreaRatio` 0.75 and
   `maximumPackedAreaRatio` 0.8. The gate is on the forecast, which fills every category to its
   `maximumCount` — not on the actual. Current forecast raw is 0.7215.
4. `npm test` green, including the regenerated `world-frame-v1.json`.
5. `npm run typecheck` and `npm run check:boundaries` green.
6. `DRAW_CALL_CEILING` 10 and `ATLAS_DRAW_CALL_CEILING` 5 in `src/render/three25/ceilings.ts` still
   hold.
7. `npm run verify:first-hour` replays unchanged. The domain is untouched.
8. A capture of a walking character at 1x, 2x, and 3x, reviewed against
   `docs/25d-scene-playbook.md`. Human judgement, not automated.

## 8. Rollout

1. Measure the atlas forecast with the eye-band category added and no art changes. Confirms gate 3
   before any art work.
2. **Bump the revision to 16 first**, with the full lockstep in 6.4, and write the initial
   `revision-16-pixel-hashes.json`. Then front frame 1: legs and arms. Regenerate, review `front-1`
   against `front-2`.
3. Lateral frames. Feet only; the turn cue is the existing `leanX`.
4. Rear frames.
5. Protagonist: four authored frame-1 cells, plus its authored eye band at step 7.
6. Remaining contract updates, fixtures, document amendments.
7. Blink overlay, last.

The revision bump leads because steps 2 to 5 each regenerate the atlas and rewrite the pixel-hash
baseline. Bumping at the end would mean editing `revision-15-pixel-hashes.json` in place four times,
which defeats the point of revisioning. Each step updates the revision-16 baseline and the world-frame
fixture before the next starts.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Two poses at 24x30 read as a jitter, not a walk | Frame 0 stays the current silhouette, so the change is additive and reversible. Reviewed at step 2 before the other three paths are touched. |
| `stablePose` redefinition weakens a real quality gate | It keeps the margin and rounded-base checks and drops only the equality clause. |
| Protagonist wobble plus a real step reads as a double bounce | Reviewed together at step 5. The fallback is keeping the protagonist's pairs identical. |
| A moved head or hair tears a hole, because nothing is drawn behind it | Why the lateral head shift was removed. `full-cast-art.test.ts` asserts no stride frame opens an interior hole. |
| Blink misfires on walking characters | Accepted and documented. People blink while walking. |
| The other session on `feat/threejs-2-5d-renderer` also regenerates the atlas | Separate branch, separate worktree. Conflicts land in generated files, which are rebuilt rather than merged. |

## 10. Assumptions

1. **Both renderers get the walk.** The art is shared, so this is not optional.
2. **Blink is 2.5D only.** The eye-band cell sits in the shared atlas but the selection branch stays
   out of the 2D rollback path.
3. **Frame 0 stays the idle pose.** Standing characters look exactly as they do now.
4. **The protagonist's five new cells are hand-authored.** Its frames are not generated from
   `CharacterLook`.
5. **Blink rides the `-1` sprite suffix.** No frame field is added; walking characters blink.
