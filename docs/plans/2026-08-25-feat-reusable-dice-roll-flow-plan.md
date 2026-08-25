---
title: "feat: Add reusable dice roll flow"
type: feat
date: 2026-08-25
status: implemented-and-final-grok-audited
spec: docs/specs/2026-08-25-reusable-dice-roll-flow-master-spec.md
---

# Reusable Dice Roll Flow Implementation Plan

## Overview

Replace the two current dice presentations with one shared flow:

`cup → ROLL IT → bottom-entry tumble → impact → raw total → 2.5-second hold → consumer result`

The implementation reuses the existing deterministic `2d6` domain roll and approved pencil dice. It adds a deterministic KinderGrimm cup, valid physical die orientations, two supplied SFX files, and one shared UI timeline.

The first consumers are:

- the new-game alarm intro;
- the Linda Action Check.

## Locked decisions

- Work only in the active 25d checkout.
- Keep the current branch and preserve unrelated work.
- Grok always runs at `xhigh`.
- Do not call Fable.
- Use at most two Grok-and-Opus plan-review rounds.
- Do not change domain odds, modifiers, targets, events, or save schema.
- Show the raw sum during the shared flow.
- Show consumer-specific grade or success UI after shared completion.
- Use 24 proper rotations of canonical top `1`, left `2`, right `3`.
- Keep the current atlas filename for compatibility.
- Use one embedded shared component, not a modal framework.
- Require visual approval of the cup review sheet before production promotion.

## Local research

External research is not needed. The repository already contains the required patterns:

- Shared roll renderer: `src/ui/DiceRollCanvas.tsx`
- Alarm consumer: `src/ui/AlarmIntroOverlay.tsx`
- Action Check consumer: `src/ui/ActionCheckOverlay.tsx`
- Deterministic roll: `src/domain/action-check.ts`
- New-game state/save boundary: `src/application/GameScreen.tsx`
- Action Check command boundary: `src/render/WorldScene.tsx`
- Dice recipe: `src/render/pencil/action-check-dice.ts`
- Dice builder: `scripts/art/build-action-check-dice-review.ts`
- Alarm prop recipe pattern: `src/render/pencil/alarm-clock.ts`
- Alarm review-sheet pattern: `scripts/art/build-alarm-clock-review.ts`
- Window smoke hooks: `src/application/DesktopBridge.ts`
- Packaged startup helper: `electron/main/index.ts`
- Hidden capture helper: `scripts/verification/hidden-window-capture.ts`

## Phase 1: Add valid cube orientation data

### Files

- Modify `src/render/pencil/action-check-dice.ts`
- Modify `scripts/art/build-action-check-dice-review.ts`
- Modify `src/ui/DiceRollCanvas.tsx` in the same phase so runtime lookups stay valid
- Modify `src/ui/__tests__/action-check-dice-frames.test.ts`
- Regenerate `assets/generated/action-check-dice.png`
- Regenerate `assets/generated/action-check-dice.json`
- Regenerate `artifacts/kindergrimm-action-check-dice/*`

### Work

- [ ] Define the canonical physical die with opposite pairs `1–6`, `2–5`, `3–4`.
- [ ] Define the canonical visible corner as top `1`, left `2`, right `3`.
- [ ] Generate the 24 proper cube rotations in code.
- [ ] Reject reflected triples.
- [ ] Emit stable keys in the form `die-t{top}-l{left}-r{right}`.
- [ ] Keep one canonical final key for each top result `1–6`.
- [ ] Draw pips on top, left, and right faces for every orientation.
- [ ] Preserve the current silhouette, palette, pencil medium, anchors, and shadows.
- [ ] Remove the current invalid `SIDE_FACES` lookup.
- [ ] Bump the manifest to version `2`.
- [ ] Add canonical-final keys to the manifest.
- [ ] Update `DiceRollCanvas` to select version-2 orientation keys before removing `die-1` through `die-6`.
- [ ] Keep both live consumers renderable at the end of this phase.
- [ ] Update the builder for 24 orientation frames plus two shadows.
- [ ] Keep deterministic recipe and atlas SHA-256 checks.
- [ ] Generate review sheets that make all three visible face values readable.

### Focused checks

- [ ] Exactly 24 unique proper rotations exist.
- [ ] Each rotation maps six face identities to six directions once.
- [ ] Every visible triple comes from the canonical rotation group.
- [ ] Six canonical final keys exist and end on the requested top value.
- [ ] All frames stay inside transparent bounds.
- [ ] Every frame reproduces the same RGBA hash on a second build.
- [ ] The committed atlas and recipe hashes match the manifest.

## Phase 2: Build the KinderGrimm dice cup

### Files

- Add `src/render/pencil/dice-roll-cup.ts`
- Add `scripts/art/build-dice-roll-cup-review.ts`
- Add `artifacts/kindergrimm-dice-roll-cup/*`
- Add a focused cup recipe test under `src/ui/__tests__/`

### Work

- [ ] Reuse `Sketch`, `GRAPHITE`, `hashSeed`, and the existing prop recipe structure.
- [ ] Pin asset ID `dice-roll-cup-01` and upstream commit `de339ad739d8cbd28ff2dd4a940af38c0ede86c8`.
- [ ] Draw front and side views from one deterministic recipe.
- [ ] Use a strong inverted leather-cup silhouette.
- [ ] Draw ordered shadow, opening, body, rim, seams, hatching, and edge passes.
- [ ] Add `button`, `center`, and `groundContact` anchors.
- [ ] Declare transparent bounds.
- [ ] Keep transparent pixels free of RGB data.
- [ ] Generate native, enlarged, and anchor-overlay review sheets.
- [ ] Write structured `artifacts/kindergrimm-dice-roll-cup/recipe.json` and `evidence.json`.
- [ ] Rebuild twice and compare hashes.
- [ ] Expose `bakeDiceRollCupFrame('front')` for the runtime, matching the alarm-clock pattern.

### Provisional art review

- [ ] Generate and inspect the review sheet before runtime work.
- [ ] Render the front recipe directly at runtime; do not add a separate production cup atlas.
- [ ] Mark the recipe provisional until the Phase 7 hidden capture exists.
- [ ] Do not call the cup approved from the isolated sheet alone.

## Phase 3: Prepare and verify the two SFX assets

### Files

- Add `assets/source/audio/sfx_dice_cup_shake.mp3`
- Add `assets/source/audio/sfx_dice_land.mp3`
- Add `docs/audio/dice-roll-sfx-measurement.json`
- Add `scripts/audio/measure-dice-roll-sfx.ts`

### Work

- [ ] Verify the source files still match their pinned SHA-256 values.
- [ ] Leave the source files in Downloads unchanged.
- [ ] Create production copies with FFmpeg `loudnorm` targeting `-16 LUFS` and `-1.5 dBTP`.
- [ ] Do not gate on loudness range because each cue is about 2.09 seconds.
- [ ] Measure the supplied and production files with the same command.
- [ ] Record source-provenance hashes and measurements separately from production hashes and measurements.
- [ ] Require at least `3 LU` gain for each production cue.
- [ ] Keep production true peak at or below `-1.5 dBTP`.
- [ ] Inspect for decode errors.
- [ ] Make the measurement script invoke FFmpeg on the committed production MP3s.
- [ ] Make the script assert production hashes and measured values against the JSON record.
- [ ] Compare committed production loudness with the recorded source loudness; do not require Downloads files after creation.

### Focused checks

- [ ] Both committed files decode.
- [ ] Both hashes match the measurement record.
- [ ] Both clips are louder by the required measured amount.
- [ ] Neither clip exceeds the true-peak limit.
- [ ] `tsx scripts/audio/measure-dice-roll-sfx.ts` passes without reading Downloads.

## Phase 4: Implement the shared timeline and canvas

### Files

- Add `src/ui/DiceRollFlow.tsx`
- Modify `src/ui/DiceRollCanvas.tsx`
- Add `src/ui/__tests__/dice-roll-flow.test.ts`

### Shared API

Use one controlled component with the smallest required props:

```ts
type DiceRollCommitResult = 'committed' | 'retry' | 'abort';

type DiceRollFlowProps = Readonly<{
  audioEnabled: boolean;
  dice?: readonly [number, number];
  onComplete: () => void;
  onPhaseChange?: (phase: DiceRollFlowPhase) => void;
  onRoll: () => DiceRollCommitResult;
  reducedMotion: boolean;
  surface: ViewportSize;
}>;
```

The consumer owns its dialog and cancel control. The shared component owns `ROLL IT`, motion, audio, and result timing.

`onRoll` is synchronous and returns an explicit result. `committed` keeps the latch closed and waits for controlled dice. `retry` resets the latch, shows concise retry copy, and returns focus to `ROLL IT`. `abort` performs no shared recovery because the consumer unmounts the flow and restores its own focus. An unexpected throw is treated as `retry`.

### Timeline work

- [ ] Add pure timeline constants and a sampler.
- [ ] Use phases `cup`, `rolling`, `result-hold`, and `exiting`.
- [ ] Keep the cup phase indefinite.
- [ ] Guard `ROLL IT` per successful commit.
- [ ] Handle explicit `committed`, `retry`, and `abort` results.
- [ ] Treat an unexpected synchronous `onRoll` throw as `retry`.
- [ ] Start motion only after controlled dice arrive.
- [ ] Gate the rolling clock on both committed dice and dice-image readiness.
- [ ] Hold a stable pre-roll or loading frame if the dice image is late. Never complete an invisible roll.
- [ ] Pause active elapsed time during real visibility loss or renderer suspension.
- [ ] Treat hidden smoke mode as active.
- [ ] Add reduced-motion timing with the same 2.5-second hold.
- [ ] Fire `onComplete` once from the live, unpinned clock.
- [ ] Cancel animation frames and timers on unmount.

### Cup UI work

- [ ] Bake the provisional front cup frame with `bakeDiceRollCupFrame('front')`.
- [ ] Animate a short uneven rock and shift under normal motion.
- [ ] Show decorative pencil motion lines on both sides.
- [ ] Keep the cup still under reduced motion.
- [ ] Read the `button` anchor from `DICE_ROLL_CUP_RECIPE` and overlay `ROLL IT` there.
- [ ] Use stable nodes `#dice-roll-flow-root` and `#dice-roll-flow-roll`.
- [ ] Keep a minimum `48 × 48` button target.

### Dice UI work

- [ ] Make both dice enter from below the flow area.
- [ ] Use different arcs, tumble rates, and contact times.
- [ ] Select only manifest orientation keys.
- [ ] Use a deterministic visual sequence based on result and die index.
- [ ] End on the canonical frame for each rolled top value.
- [ ] Add separate contacts, rebounds, shadow changes, and settle.
- [ ] Add a local impact ring, radial lines, flecks, and small group recoil.
- [ ] Keep the world camera unchanged.
- [ ] Show the raw sum large after settle.
- [ ] Hold full opacity for exactly `2,500 ms`.
- [ ] Keep both settled dice visible during the hold.

### Audio work

- [ ] Use one cup-shake player and one landing player.
- [ ] Start one shake loop only in the cup phase.
- [ ] Set shake volume to `clamp(0.80 × sfx)`.
- [ ] Stop and rewind shake on `ROLL IT` and unmount.
- [ ] Play landing once at the main final impact.
- [ ] Set landing volume to `clamp(1.00 × sfx)`.
- [ ] Play landing at the reduced-motion impact flash.
- [ ] Do not replay audio during smoke pinning.
- [ ] Let audio failure fall back to silent visual play.
- [ ] Pause and rewind both the shake and landing players on unmount.

### Accessibility work

- [ ] Use accessible label `Roll the dice` with visible text `ROLL IT`.
- [ ] Hide the cup art, motion lines, and impact decoration from the accessibility tree.
- [ ] Focus `ROLL IT` on cup entry.
- [ ] Focus the shared root after activation.
- [ ] Announce dice and raw sum once when the large number is fully visible.
- [ ] Do not create a nested dialog.

### Focused checks

- [ ] Normal event ordering matches the spec.
- [ ] Reduced motion keeps the full result hold.
- [ ] Double activation calls `onRoll` once.
- [ ] Result arrival starts one timeline.
- [ ] A late dice image holds the flow and cannot fire `onComplete`.
- [ ] One-shot audio latches cannot replay on render or pin.
- [ ] Hidden smoke mode can advance.
- [ ] Real visibility loss pauses and resumes elapsed time.

## Phase 5: Integrate the new-game alarm consumer

### Files

- Modify `src/application/GameScreen.tsx`
- Modify `src/ui/AlarmIntroOverlay.tsx`
- Modify `src/ui/__tests__/alarm-intro.test.ts`
- Modify `src/application/__tests__/game-screen.test.tsx`

### Work

- [ ] Add a `snoozed` intro state without changing the save schema.
- [ ] Change snooze to stop the alarm and enter the cup stage.
- [ ] Do not consume PRNG on snooze.
- [ ] Add a separate `ROLL IT` callback that commits `rollTwoDice` once.
- [ ] Start the existing save request after the committed roll.
- [ ] Keep the committed dice and PRNG across save retry.
- [ ] Embed `DiceRollFlow` inside the existing alarm dialog.
- [ ] Keep Escape as a no-op for the full intro.
- [ ] Trap Tab and Shift+Tab inside the alarm dialog.
- [ ] Replace the snooze-only Tab handler with phase-aware live targets: `#dice-roll-flow-roll`, then `#dice-roll-flow-root`, then Retry Save only after the shared flow and grade hold.
- [ ] Keep `#alarm-intro-overlay` focusable and always mounted as the grade/saving fallback target.
- [ ] Keep the dialog accessibility label on the snooze prompt, then a cup prompt, then grade-only after shared completion.
- [ ] Do not expose dice or grade in the dialog label at commit time.
- [ ] Return `retry` if the alarm commit fails before dice exist; re-enable `ROLL IT`, show retry copy, and return focus.
- [ ] If save fails during the shared flow, defer Retry Save until flow and grade finish.
- [ ] Keep Retry Save unmounted or inaccessible until the shared flow and grade hold finish, so it cannot steal focus mid-roll.
- [ ] After shared completion, show `Bad`, `okay`, or `Good` for `900 ms`.
- [ ] Announce only the grade at this stage.
- [ ] Fade to the vampire home only after grade hold and save success.

### Focused checks

- [ ] Snooze consumes no PRNG.
- [ ] `ROLL IT` consumes one roll.
- [ ] Double press consumes one roll.
- [ ] Save contains the advanced PRNG.
- [ ] Save retry keeps identical dice.
- [ ] Escape never closes the intro.
- [ ] Save failure exposes one usable retry control after the flow.
- [ ] The dialog label does not announce the committed result before the shared hold.
- [ ] Tab always resolves to a control that exists in the current phase.
- [ ] Grade bands and 900 ms hold remain exact.

## Phase 6: Integrate the Action Check consumer

### Files

- Modify `src/ui/ActionCheckOverlay.tsx`
- Modify `src/ui/__tests__/action-check.test.ts`
- Modify `src/render/WorldScene.tsx` for audio, phase evidence, and focus targets
- Update Action Check packaged smoke assertions in `electron/main/index.ts`

### Work

- [ ] Keep the current preview copy, chance, inputs, and stakes.
- [ ] Embed the shared cup in the current Action Check dialog.
- [ ] Keep `CANCEL` and Escape only before `ROLL IT`.
- [ ] Commit the existing command on `ROLL IT`.
- [ ] Thread `audioEnabled` from `WorldScene` through `ActionCheckOverlay` into `DiceRollFlow`.
- [ ] Hide cancel and make Escape a no-op during the shared flow.
- [ ] After shared completion, show existing modifier arithmetic and success/failure copy.
- [ ] Keep `CONTINUE` and Escape-as-Continue in the result phase.
- [ ] Keep the existing story consequence after Continue.
- [ ] Return `abort` on command failure, close the overlay, and restore focus to Protect Linda.
- [ ] Restore focus to Close Quests after Continue.
- [ ] Remove the duplicated Action Check dice timeline.

### Focused checks

- [ ] Domain modifier, target, total, and success logic are unchanged.
- [ ] Existing result announcement copy remains correct after shared completion.
- [ ] Escape behavior matches preview, shared flow, and result phases.
- [ ] Tab and Shift+Tab stay inside the dialog.
- [ ] Consumer focus restoration remains exact.

## Phase 7: Update smoke hooks and hidden captures

### Files

- Modify `src/application/DesktopBridge.ts`
- Modify `electron/preload/index.ts` only if the smoke allowlist needs the new hook
- Modify `electron/main/index.ts`
- Modify `scripts/verification/hidden-window-capture.ts`
- Modify `tests/electron/package-smoke.test.ts` where source-contract assertions change

### Work

- [ ] Add `window.siWorldPinDiceRollFlow(timeMs: number | null)` typing.
- [ ] Pin without audio or completion.
- [ ] Release with `null` and resume live time from the pinned point.
- [ ] Delegate consumer pin hooks for shared-roll times.
- [ ] Publish shared phase and elapsed-time evidence.
- [ ] Rewrite `completeAlarmIntroForSmoke` to click snooze, wait for `#dice-roll-flow-roll`, then click it.
- [ ] Confirm both `startResponsiveSmokeGame` and `beginWorldSmoke` route through the rewritten helper.
- [ ] Rewrite hidden-window-capture startup with the same sequence.
- [ ] Wait for committed result and `SAVED GEN 1` only after `ROLL IT`.
- [ ] Move the alarm grade-label assertion until after shared completion.
- [ ] Delete legacy `siWorldPinAlarmIntro(2550)` completion skips.
- [ ] Move Action Check arithmetic and result assertions after shared completion.
- [ ] Change Action Check smoke activation and focus assertions to `Roll the dice` and `#dice-roll-flow-root`.
- [ ] Pin only flight, impact, settle, and number stages; do not treat `1650 ms` as completion.
- [ ] Release the shared pin, then wait for the Action Check `result` phase.
- [ ] Capture only shared cup, flight, impact, settle, and total-hold stages with shared pins.
- [ ] Release pins before waiting for completion.
- [ ] After release, capture alarm grade and Action Check result from their live consumer phases without a shared pin.
- [ ] Drive every renderer poll in this flow with `waitForRendererPaint(window)` before reading state, including snooze-to-cup, post-ROLL-IT save/result, and post-release completion waits.
- [ ] Give post-release timeouts enough room for the shared `4,850 ms` flow plus consumer result work.
- [ ] Keep every Electron verification window hidden and muted before load.

### Final KinderGrimm cup approval

- [ ] Take the hidden in-game cup-stage capture from the runtime recipe.
- [ ] Show the isolated review sheet and hidden runtime capture together.
- [ ] Get user approval for silhouette, material, scale, button overlap, and motion-line clearance.
- [ ] Apply only requested art corrections.
- [ ] Rebuild recipe and evidence after any correction.
- [ ] Do not call the cup approved or proceed to Git closeout before this gate passes.

## Phase 8: Verification

### Narrow checks first

- [ ] Run the dice recipe and cup recipe tests.
- [ ] Run `tsx scripts/audio/measure-dice-roll-sfx.ts`.
- [ ] Run `src/ui/__tests__/dice-roll-flow.test.ts`.
- [ ] Run updated alarm and Action Check tests.
- [ ] Run updated GameScreen tests.
- [ ] Run affected Electron source-contract tests.

### Broader checks

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run export:web`.
- [ ] Run `npm test -- --runInBand` if focused checks pass.
- [ ] Run the safe hidden capture path for required stages.
- [ ] Inspect each captured frame.
- [ ] Confirm no Electron process remains after checks.

### Visual acceptance

- [ ] Cup silhouette reads instantly as a shaking dice cup.
- [ ] `ROLL IT` appears on the cup and stays easy to press.
- [ ] Motion lines read without covering the button.
- [ ] Dice start below the screen and settle near the middle.
- [ ] Every visible orientation is physically valid.
- [ ] Impact cues are clear but do not obscure pips.
- [ ] The raw total is large and dominant for 2.5 seconds.
- [ ] Normal and `960 × 640` layouts do not clip.
- [ ] Reduced motion is stable and readable.

## Phase 9: Final Grok audit and Git closeout

- [ ] Run one `grok-audit` attempt at `xhigh` against the complete branch diff from `origin/main`.
- [ ] Do not retry a failed or filler audit.
- [ ] Verify every Grok finding locally.
- [ ] Apply only confirmed in-scope fixes.
- [ ] Re-run checks affected by those fixes.
- [ ] Inspect `git status -sb` and the final diff.
- [ ] Commit with a descriptive message.
- [ ] Push the current branch.
- [ ] Open a pull request against `main`.
- [ ] Report PR and CI state without merging.

## Risks and controls

| Risk | Control |
|---|---|
| Invalid mirrored die faces | Generate all frames from one proper rotation group and test membership |
| Double input rerolls | Parent and shared one-shot guards |
| Shake loop stacks | One player, phase-owned effect, cleanup test |
| Landing sound replays | Threshold latch independent of render count |
| Hidden smoke freezes | Smoke-mode active clock plus explicit pin/release |
| Real background skip loses hold | Pause accumulated active time outside smoke mode |
| Save failure rerolls alarm | Save the committed result once and retry only persistence |
| Nested modal breaks focus | Embed the shared flow inside existing dialogs |
| Art drifts from KinderGrimm | Deterministic recipe, review sheet, approval, hashes |
| SFX clips or stays too quiet | Measured source treatment and clamped runtime gain |

## Done definition

The work is complete when both current consumers use the same approved cup-to-result flow, all stated checks pass, hidden captures prove the required stages, one Grok audit is reconciled, the branch is committed and pushed, and a pull request is open against `main`.

## Council review record

- Round 1: Grok 4.6 at `xhigh` and Opus completed. Confirmed findings were applied for runtime key ordering, paint-driven hidden waits, Action Check audio, commit failure, repeatable SFX checks, smoke timing, cup evidence, and alarm focus.
- Round 2: Grok 4.6 at `xhigh` and Opus completed. Confirmed findings were applied for explicit commit results, provisional cup sequencing, recipe-backed runtime cup loading, shared versus consumer capture timing, paint-first polling, fallback focus, late dice loading, and full audio cleanup.
- The two-round limit is exhausted. No third plan review was run.

## Final implementation audit record

- Grok 4.6 completed the one allowed final audit at `xhigh`.
- Five findings were confirmed and fixed: Action Check focus fallback, alarm button roles and focus routing, silent smoke pinning, the full dice announcement, and renderer-suspension timing.
- Final verification passed typecheck, 160 test suites, web export, SFX measurement, and the hidden Electron dice-flow capture.
