# Per-part character rig (2.5D world sprites)

Status: draft
Date: 2026-08-17
Supersedes: nothing. Amends `docs/specs/2026-08-16-threejs-2-5d-renderer.md` section on character
billboards, and the `spec.md` line 319 statement that no character sprite is created or modified.

## 1. Summary

World characters are drawn today as one flattened 24x30 atlas cell per direction per walk frame.
The art is already authored in six layers — `legs`, `torsoAndClothing`, `headAndFace`, `hair`,
`accessory`, `heldItem` — and `composeFrontFrame()` flattens them at build time.

This spec stops flattening for the 2.5D path. Each layer becomes its own tight-cropped atlas cell.
The 2.5D renderer assembles them per frame as a small rig of quads that can move independently. That
buys arm swing, blinking, and a head turn without any new character art style, and without touching
the 2D path.

A seventh layer, `arms`, is added. Arms are currently baked into `torsoAndClothing`.

## 2. Goals

- Arms swing with the walk cycle, in the same two-frame cadence the legs already use.
- Characters blink.
- The head shifts by one pixel as a character turns, and settles when it stops.
- Legs stay a separate part, so their existing two frames keep working unchanged.
- One drawing style. No sprite is redrawn by hand; the arm layer is generated from the existing
  `CharacterLook` fields the same way every other layer already is.
- The 2D path is untouched and stays the rollback path.

## 3. Non-goals

- No change to the 24x30 cell, the 32x32 tile, `NearestFilter`, or the 1x/2x/3x zoom rule.
- No eight-direction art. Characters stay upright four-direction billboards.
- No per-part rotation. See section 7.
- No portrait changes. Conversation portraits keep their existing three expressions.
- No new character in the roster.
- No skeletal animation format, no bone hierarchy, no imported rig.

## 4. Inherited constraints

These are not negotiable and every later section is written to satisfy them.

| Constraint | Source | Consequence here |
|---|---|---|
| Determinism is the contract | `CLAUDE.md`, `src/domain/prng.ts` | Blink phase is a pure function of data already in the frame. No `Math.random()`, no wall clock. |
| `WorldFrameState` is frozen and hashed | `world-frame.ts`, `frameSummary()` | Adding fields to the character placement changes golden hashes. See section 8. |
| Layer purity | `scripts/verification/import-boundaries.ts` | The rig lives in `src/render/three25/`. `src/domain` and `src/world` gain nothing. |
| Generated art is gated | `npm run art:check` then `git diff --exit-code` | Regenerated atlas and index must be committed in the same change. |
| Atlas ceiling is 1024x1024 | `assets/source/art/manifest.json` `limits` | Part cells must be proven to fit. See section 6. |
| One draw call for all characters | `three25/billboards.ts` | Parts bake into the same geometry and material. A part is a quad, never a `Mesh`. |
| The 2D path must stay green | `CLAUDE.md` | Flattened frames keep being emitted and keep being what `threejs-2d` reads. |

## 5. Part decomposition

Seven parts per character per direction:

| Part | Frames | Source |
|---|---|---|
| `legs` | 2 | `sourceLayers.legs.frontFrames` / `lateralFrames`, unchanged |
| `arms` | 2 | new layer, split out of `torsoAndClothing` |
| `torso` | 1 | `sourceLayers.torsoAndClothing` minus the arm pixels |
| `head` | 2 (eyes open, eyes closed) | `sourceLayers.headAndFace` |
| `hair` | 1 | `sourceLayers.hair` |
| `accessory` | 1 | `sourceLayers.accessory` |
| `heldItem` | 0 or 1 | `sourceLayers.heldItem`, optional today and stays optional |

Each part cell is cropped to its tight bounding box and carries its offset inside the 24x30 cell, so
the renderer can place it without storing empty pixels.

### 5.1 The arms layer

`buildCharacterSource()` generates `torsoAndClothing` from `build`, `outfitPattern`, and the clothing
ramp. The arm pixels are produced by the same code path. Splitting them means emitting those
commands into a separate `arms` layer instead of appending them to the torso, then authoring a
second arm frame that is the first shifted and reshaped for the opposite swing.

Two arm frames per direction, selected by the same `walkFrame` index that already selects the legs.
Frame 0 is the current rest arms. Frame 1 is the swing.

Characters whose `secondaryLayer` or `oddityLayer` is `torsoAndClothing` keep those features on the
torso, never on the arms. A feature that reads as part of the sleeve is authored into the arms layer
explicitly, per character, by id — there are seven such looks today and they are listed in the
implementation plan, not here.

### 5.2 Hair lighting

`applyConnectedHairLighting()` runs on the **composited** frame using a hair-only mask. It replaces
hair-token pixels with connected light and shadow planes. It cannot be run per layer, because the
component search walks the composite, and because `accessory` and `heldItem` draw after `hair` and
can occupy hair-mask positions.

The build therefore keeps composing exactly as it does now, and then slices the lit composite:

1. Compose the flattened frame with the current code, including hair lighting and the shoe row.
2. Build a coverage mask per layer, recording which layer last wrote each pixel.
3. Cut the lit composite into part cells using those masks.

This makes the reassembly property in section 9 hold by construction rather than by luck.

### 5.3 The shoe row

`composeFrontFrame()` draws an `L`/`S` pixel pair at row 24 after every layer, skipped for
`resident-16`. Under the coverage mask that row belongs to whichever layer last wrote it, which is
not meaningful. The shoe row is assigned to `legs` explicitly, and `resident-16` keeps its exception.

## 6. Atlas

A new category, `world-character-part`, is added to `assets/source/art/manifest.json`. The existing
`world-character` category is unchanged: the eight flattened frames per character keep being emitted,
because `threejs-2d` and every current smoke read them.

Part cell count, per character: 4 directions x (2 legs + 2 arms + 1 torso + 2 head + 1 hair +
1 accessory + up to 1 held item) = up to 40. Across 35 characters that is up to 1400 cells.

Cell count is not the binding limit; area is. Part cells are tight-cropped, so the seven parts of one
direction together cover close to the pixels of one flattened cell rather than seven of them, and the
shared parts are stored once instead of twice per direction.

**This is a forecast, not a measurement.** The implementation must run `npm run art:atlas` and read
the real numbers out of `createAtlasBudgetReport()` before any renderer work starts. The gate is the
manifest's own limits: `maximumRawAreaRatio` 0.75 and `maximumPackedAreaRatio` 0.8 inside 1024x1024,
against the current 1024x595. If the forecast fails, the fallback order is:

1. Drop the `heldItem` part for characters whose held item never moves, and keep it flattened into
   the torso.
2. Share `hair` and `accessory` cells between `left` and `right` by mirroring at runtime.
3. Stop emitting flattened frames for characters that never appear in a 2D-path smoke.

Option 3 is last because it couples the two paths.

`ART_REVISION` in `src/render/atlas.ts` is bumped, and a new `revision-N-pixel-hashes.json` is
written, because the atlas image changes.

## 7. Motion vocabulary

The rig root keeps exactly the transform a character has today: `worldX`, `worldY`, `scale`,
`rotationDegrees` about `pivot`. Characters already rotate up to `MAX_COMPOSED_ANGLE_DEGREES` = 16
about the foot line, and the protagonist wobbles to 15. None of that changes.

Parts add **integer pixel offsets in sprite space only**, applied before the rig root transform.

Per-part rotation is excluded for two reasons, and this is a design decision, not a platform limit:

- A rotated arm separates from a fixed shoulder. Closing that gap needs a joint model, which is the
  skeletal system this spec exists to avoid.
- Each independently rotated part resamples separately under `NearestFilter`, so a 24x30 character
  gains one shimmering seam per part instead of one for the whole body.

The vocabulary is therefore:

| Motion | Parts moved | Amount | Driver |
|---|---|---|---|
| Arm swing | `arms` | frame swap, plus 0 or 1 px vertical | `walkFrame`, already in `MovementState` |
| Blink | `head` | frame swap | section 8 |
| Head turn | `head`, `hair`, `accessory` | 0 or 1 px horizontal | sign of `gaitTurnLeanDegrees` |
| Stride bob | rig root | unchanged | `gaitBobPixels`, already applied |
| Lean | rig root | unchanged | `movementPresentation().leanX` |

Every offset is an integer. Fractional offsets are a defect, and section 9 gates on it.

## 8. Determinism, evidence, and the frame

Blink must not change `WorldFrameState`. `frameSummary()` hashes the frame and `verify:first-hour`
replays a golden run against it; adding a blink field breaks that golden run for a purely visual
effect.

Blink is therefore computed inside `src/render/three25/` from values the frame already carries:

```
blinkPhase(characterId, absoluteMinute, subMinuteProgress)
```

It is a pure function. It uses the existing `stableTupleHash` over the character id to give each
character its own offset, so a crowd does not blink in unison. Same inputs, same output, always.

The same rule applies to arm frame and head offset: both are derived from `MovementState` values the
frame already carries. **No new field is added to `WorldCharacterPlacement`.**

Renderer evidence changes are additive. A new hidden node, `#world-rig-state`, reports the per-part
offsets actually drawn for the protagonist. Existing nodes — `#world-state`, `#world-camera-state`,
`#world-movement-state`, `#world-geometry-state` — keep their current label format, because changing
one breaks its smoke. The new node gets its own packaged smoke.

## 9. Acceptance gates

The change is not done until all of these pass.

1. **Reassembly is pixel-identical.** For every character, every direction, and every walk frame, the
   part cells composited at zero offset with eyes open produce exactly the bytes of the corresponding
   flattened `world-character` cell. This is a Jest test over the generated atlas, not a smoke. It is
   the gate that proves splitting changed nothing.
2. **Atlas budget passes.** `npm run art:check` is green and `createAtlasBudgetReport()` is inside
   `maximumRawAreaRatio` and `maximumPackedAreaRatio`.
3. **Offsets are integers.** A unit test asserts every part offset the rig emits is an integer at
   1x, 2x, and 3x zoom.
4. **Draw calls do not increase.** The 2.5D character pass stays at the count recorded in
   `artifacts/phase-25d/stage-4/draw-calls.json`.
5. **60 FPS holds** on the existing 2.5D performance smoke with a full street of characters.
6. **The 2D path is byte-identical.** `npm run test:electron` and the 2D smokes produce the same
   screenshots as before the change.
7. **Determinism holds.** `npm run verify:first-hour` replays the golden run unchanged.
8. **Typecheck and boundaries.** `npm run typecheck`, `npm run check:boundaries`, `npm test`.

## 10. Rollout

1. Art build emits part cells. Nothing reads them. Gate 1 and 2 pass.
2. `three25` gains the rig and draws parts at zero offset. Output is visually identical to the
   flattened billboard. Gates 3, 4, 6 pass.
3. Motion is switched on one channel at a time — arms, then blink, then head turn — each with its
   own capture.
4. The protagonist runs the rig first. The roster follows in the same change once gate 1 covers all
   35 characters.

Per-part rigging is a capability of the 2.5D path, which `rendererForEnvironment()` does not yet
return. There is no production exposure at any step.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Atlas does not fit | Measured before renderer work starts, with a three-step fallback in section 6. |
| Arm split changes silhouettes | Gate 1 fails loudly if a single pixel moves. |
| Seams between parts at 2x/3x | Integer offsets only, and parts are cut from one lit composite so their edges already agree. |
| Blink reads as a glitch at 24x30 | Blink is a two-frame swap held for one frame time; tunable, and off is a valid setting. |
| Evidence label drift breaks smokes | New node only. No existing label format changes. |

## 12. Assumptions

Stated because they were decided without asking, and any of them may be overridden.

1. **2.5D only.** The 2D path keeps flattened cells forever. Rejected the alternative of moving both
   paths, because it puts the rollback path at risk for no visual gain.
2. **Arms are generated, not hand-authored.** Justified by `loadCharacterSources()` building all 35
   characters from `CHARACTER_LOOKS` in code.
3. **Blink is renderer-local.** Justified by the golden-run hash.
4. **The rig root keeps whole-body rotation.** No behaviour change for existing motion.
5. **Head turn is one pixel.** `spec.md` line 319 already sanctions a one-pixel lean and shift, so
   this needs no new licence.
