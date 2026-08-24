# Pencil Character Rig v1 Implementation Plan

**Spec:** `docs/specs/2026-08-23-pencil-character-rig.md`
**Branch:** `codex/kindergrimm-character-rig`
**Pilot:** `vampire-01`

## Guardrails

- Keep the existing Three.js 2.5D renderer and pencil atlas contract.
- Produce one complete `120x180` RGBA frame.
- Add no runtime dependency.
- Keep world movement and collision tile-based.
- Support one production `vampire-01` actor.
- Ignore reach and holding while seated in v1.
- Preserve the approved face, pointed collar, palette, clothing, proportions, and foot contact.
- Use hidden and silent visual verification only.

## Pre-implementation evidence gate

Before rig source edits, run `npx tsx scripts/verification/capture-seated-vampire.ts rig-before front 3 0`. Preserve its screenshot and existing renderer evidence as the pre-rig comparison. The helper keeps Electron hidden and muted.

## Step 1 — Add the render intent contract

**Files**

- Modify `src/render/world-frame.ts`.
- Modify `src/render/WorldScene.tsx`.
- Modify `src/application/DesktopBridge.ts`.
- Modify `src/render/__tests__/world-frame.test.ts` or the closest existing world-frame test.
- Modify `src/content/__tests__/production-content.test.ts`.

**Work**

1. Add `PencilRigIntent` structurally beside the world-frame character types. Use inline `{ x: number; y: number }` and string unions. Do not import from `src/render/pencil/` because `world-frame.ts` is renderer-neutral.
2. Limit the v1 held-item union to `brass-lantern`.
3. Define `reach.target` as final `120x180` canvas pixels.
4. Add optional `rigIntent` to `WorldActor`, the player presentation input, and `WorldCharacterPlacement`.
5. Copy the intent through `buildWorldFrameState()` without converting it.
6. Add capture-only state and `window.siWorldSetPlayerRigIntent` beside the existing player pose fixture.
7. Do not save the fixture or add it to gameplay state.
8. Add a production-content test that NPC visual mapping never adds another `vampire-01`; the player remains the single production owner.

**Checks**

- Existing callers compile without supplying an intent.
- World-frame tests prove exact optional-field copying.
- Invalid or missing intent still produces the normal character placement.
- The renderer-neutral import-boundary scan still passes.

## Step 2 — Build the pure joint solver

**Files**

- Add `src/render/pencil/vampire-rig.ts`.
- Add `src/render/pencil/__tests__/vampire-rig.test.ts`.

**Work**

1. Define the fifteen joint IDs from the master spec.
2. Author standing and seated base points, two walk-phase joint offsets, a carry pose for each facing and hand, and an elbow bend direction for each facing.
3. Accept the tuned layout as an argument. Every shipping caller passes `buildGeneratedVampireLayout()`.
4. Map authored points through `F.body(...)` or `F.head(...)` once, then perform all solver and collision work in final `120x180` canvas pixels.
5. Choose the mapped base points from facing and `CharacterPose`.
6. If seated, discard reach and held-item intent before any arm action.
7. If reduced motion, use idle geometry and skip gait. Otherwise apply the authored offsets for the existing two gait phases when moving.
8. If an item is held without reach, apply the authored carry pose. Otherwise solve the two-segment reach and blend it by clamped `weight`.
9. Treat a non-finite reach target as missing reach. Clamp only weight to `0..1`, reach radius, joint angles, and frame margins.
10. Add the head ellipse, torso capsule, and lantern volume circle.
11. Project the lantern circle against the head and torso, back-solve the hand through the grip offset, re-solve the elbow at fixed segment lengths, project the hand against head and torso, clamp arm limits, and recheck both volumes. The hand does not collide with its own item.
12. Apply planted-foot correction for standing and walking. Keep the hip planted while seated.
13. Fall back to the carry or base arm when no safe reachable point exists.
14. Calculate discrete hair follow last.
15. Return resolved joints, near/far side order, hair offset, grip point, and grip angle.

**Checks**

- Reachable targets finish within one pixel.
- Unreachable and invalid targets stay finite.
- `NaN` and infinite targets return the same pose as missing reach.
- Elbows bend correctly in every facing.
- Post-correction shoulder-to-elbow and elbow-to-hand lengths stay within one pixel of their authored lengths.
- Both hands can reach.
- Hand and lantern finish outside protected regions.
- Planted feet do not move during an upper-body action.
- Seated hips stay fixed.
- Hold-only, reach-plus-hold, and reduced-motion reach follow the fixed evaluation order.
- Hair offset and angle are zero under reduced motion and non-zero for a moving gait in every facing.
- Equal inputs return deep-equal joint results.

## Step 3 — Draw articulated limbs, hair, and lantern

**Files**

- Modify `src/render/pencil/parts/arms.ts`.
- Modify `src/render/pencil/parts/legs.ts`.
- Modify `src/render/pencil/parts/hair.ts`.
- Add `src/render/pencil/parts/lantern.ts`.
- Modify `src/render/pencil/generated-vampire.ts`.
- Modify `src/render/pencil/seated-vampire.ts`.
- Modify `src/render/pencil/__tests__/seated-vampire.test.ts`.

**Work**

1. Keep the current public `drawArms()` and `drawLegs()` behavior for fallback frames.
2. Expose the smallest point-based helpers needed to draw one resolved arm, hand, upper leg, lower leg, and boot.
3. Make the rigged leg path consume hip, knee, and foot points. Keep `drawLegs()` unchanged for fallback frames.
4. Draw standing far limbs before the body and near limbs after the body where the facing requires it.
5. Draw seated frames in the current eleven-layer order: far leg segments and boot, torso, near leg segments and boot, far arm, head and hair, near arm, collar.
6. Draw a rear hand blob only for the active reaching or holding hand.
7. Add discrete hair angle/offset options derived only from facing, moving, gait, boil, and reduced motion.
8. Draw the lantern from its stable recipe, grip point, grip angle, and selected hand layer.
9. Add `drawRiggedVampireFrame()` that draws core art plus resolved limbs, hair, collar, and optional lantern into one `Sketch`.
10. Make idle, walk, and seated rig frames use the same joint evaluator.
11. Preserve the current rear-chair masking behavior.
12. Make the seated head call the same recipe-parameterized head drawers as the standing generated vampire.
13. Make the seated collar call the approved asymmetric pointed-collar drawer.

**Checks**

- Complete RGBA output length is always `120 * 180 * 4`.
- The pointed collar and current face drawers are unchanged.
- The tuned seated bake uses `buildGeneratedVampireLayout()` and keeps the existing contact-row assertion.
- Lantern depth follows the chosen near/far hand.
- Rear reach and hold show one connected grip hand.
- Hair never exposes a scalp gap.

## Step 4 — Integrate the rig with the existing frame cache

**Files**

- Modify `src/render/pencil/generated-vampire.ts`.
- Modify `src/render/pencil/billboard.ts`.
- Modify `src/render/pencil/__tests__/vampire-parts.test.ts`.
- Modify `src/render/pencil/__tests__/generated-vampire.test.ts`.

**Work**

1. Bake normal idle and walk sheets through the rig with the existing frame order.
2. Bake seated frames through the same evaluator while keeping the existing seated frame index.
3. Select the rigged vampire path only for `vampire-01`.
4. Keep the current generated and seated frame functions as fallback references.
5. Add one last-frame dynamic cache for reach or held-item intent.
6. Round reach coordinates to whole canvas pixels before building its key.
7. Include facing, gait, pose, boil, reduced motion, reach hand, target, weight, held item, and held hand in the key.
8. Replace the cached dynamic frame on a new key. Do not create a growing map.
9. On invalid input, render the normal rig frame.
10. On a rig render error, log once and copy the matching old frame.
11. Keep non-vampire frame selection unchanged.
12. Leave the existing chair depth, lift, and rear occlusion logic in `pencilBillboards()` unchanged.

**Checks**

- Existing sheet indices still select the expected facing and gait.
- A repeated dynamic key returns the same frame object. A focused spy or test counter proves one composition for repeated identical keys and one additional composition after a key change.
- A different hand, target, reduced-motion flag, or item changes the key.
- Composing the same pose, intent, and reduced-motion input twice returns identical RGBA bytes.
- The reduced-motion rig frame uses zero hair follow and the idle-hair bytes.
- Non-vampire tests remain unchanged and pass.
- The Three.js world renderer needs no source change.

## Step 5 — Add deterministic visual evidence

**Files**

- Add `scripts/art/write-vampire-rig-review.ts`.
- Add `scripts/verification/capture-vampire-rig.ts` using the existing hidden capture helper.
- Modify `scripts/verification/hidden-window-capture.ts`.
- Add generated files under `artifacts/kindergrimm-vampire/rig/`.

**Work**

1. Write the complete review set: old baseline in four facings; rigged idle in four facings; both walk gaits in four facings; seated in four facings; left and right reach at near and far targets; lantern carry; lantern reach; hair follow beside reduced-motion hair; and a deliberate face-overlap target.
2. Label each fixture with facing, action, hand, and reduced-motion state.
3. Use the capture-only rig-intent hook for one hidden in-world lantern or reach frame.
4. Add optional `playerRigIntent` to the shared `SceneRequest` and call `window.siWorldSetPlayerRigIntent(...)` beside the existing pose and facing fixture calls.
5. Keep Electron hidden, muted, and closed after capture.
6. Record the existing `drawCalls`, `atlasDrawCalls`, and `frameP95Ms` evidence beside the capture. Compare it with the pre-rig hidden baseline.

**Checks**

- Artifacts are real outputs from the changed renderer.
- No visible window opens.
- No audio plays.
- Existing renderer evidence shows no added draw call and no material frame-time regression.

## Step 6 — Verify the complete slice

Run in this order:

1. `npx jest --runInBand --runTestsByPath src/render/pencil/__tests__/vampire-rig.test.ts src/render/pencil/__tests__/seated-vampire.test.ts src/render/pencil/__tests__/generated-vampire.test.ts src/render/pencil/__tests__/vampire-parts.test.ts`
2. `npm run typecheck`
3. `npx tsx scripts/art/write-vampire-rig-review.ts`
4. `SI_VAMPIRE_RIG_BENCHMARK=1 npx jest --runInBand --runTestsByPath src/render/pencil/__tests__/vampire-rig.test.ts`. The gated case warms 20 frames and measures 200 frames. Report p95; target `<= 2 ms` on this Mac, with no cross-machine CI assertion.
5. `npm test -- --runInBand`
6. `npm run content:check`
7. `npm run validate:content`
8. `npm run art:check`
9. `npm run check:boundaries`
10. `npm run export:web`
11. `npx tsx scripts/verification/capture-vampire-rig.ts`

If a project generator changes files outside this plan, inspect them and include only required byproducts.

## Step 7 — Final review and delivery

1. Give Grok the full branch diff for a read-only implementation audit.
2. Verify each finding against source and tests.
3. Apply only confirmed fixes.
4. Rerun the affected focused checks, type check, full tests, art checks, export, and hidden renderer evidence.
5. Inspect `git diff --check`, the final diff, and the file list.
6. Commit the complete KinderGrimm integration, art update, rig, tests, specs, plans, and verified artifacts on the feature branch.
7. Push the feature branch.
8. Open one pull request to `main` with the spec, audit history, implementation summary, checks, performance result, and visual artifacts.

## Done when

- The seven base rig capabilities work for `vampire-01`.
- The normal world and art remain intact.
- The current flat-frame renderer contract remains intact.
- Tests and hidden evidence prove the result.
- Grok's final confirmed findings are fixed.
- The branch is committed, pushed, and has an open PR.

## Plan audit decision log

### Round 1 — Opus 5 and Grok

Accepted all confirmed findings:

- pass `buildGeneratedVampireLayout()` into the solver;
- make the pose order match the master spec exactly;
- make point-based upper/lower leg drawing mandatory;
- run seated-vampire contact tests in the focused gate;
- preserve the eleven-layer seated order and existing chair descriptor rules;
- place the one-vampire invariant in production-content tests;
- add the exact visual fixture set from the spec;
- use existing renderer evidence instead of adding a pencil-mesh field;
- add a runnable, environment-gated local benchmark case;
- test full RGBA determinism directly.

### Round 2 — Opus 5 and Grok

Accepted:

- keep `PencilRigIntent` structural so `world-frame.ts` stays renderer-neutral;
- map authored points once before all solver work;
- author walk offsets, carry poses, and elbow directions explicitly;
- include the lantern circle in collision correction;
- test cache identity and the number of compositions;
- test the tuned seated layout and preserve its contact window;
- reuse the recipe-tuned face and asymmetric pointed collar while seated;
- add direct reduced-motion hair checks;
- give the review, benchmark, and hidden capture exact commands;
- capture renderer evidence before rig source edits.

Rejected:

- changing reduced-motion no-intent walking back to a gait frame. Current `blitPencilFrame()` calls `poseFromSprite(sprite, moving && !reducedMotion)`, so reduced motion already selects the idle stance. The plan preserves that behavior.

### Round 3 — Opus 5 and Grok

Accepted all remaining findings:

- extend the shared hidden-capture request with optional player rig intent;
- complete the lantern-to-hand-to-elbow correction sequence before the final overlap recheck;
- test that corrected arm segment lengths remain fixed;
- treat non-finite reach targets as no reach and test equality with the no-intent pose.

The third round found no need for a renderer replacement, dependency, editor, physics engine, or broader gameplay change.
