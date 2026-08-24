# Action Check Dice Implementation Plan

Date: 2026-08-23

Status: revised after one Opus and Grok audit round; KinderGrimm visual approval pending

Source: `docs/specs/2026-08-23-action-check-dice-master-spec.md`

## Scope lock

Implement one reusable `2d6 + modifier >= target` domain helper and one player-visible check: `protect_linda`.

Do not add a dependency, save field, migration, physics system, Three.js mesh, audio file, or general skill system.

## Step 1: Add the domain roll and authored check

Files:

- Add `src/domain/action-check.ts`.
- Update `src/domain/commands/reducer.ts`.
- Update `src/domain/quests/quest-machine.ts`.
- Update `src/domain/events/types.ts`.
- Update `content/quests/linda-boyfriend.json`.
- Update `src/domain/quests/linda-boyfriend.json`.

Work:

1. Add a strict Action Check definition schema for `2d6`, readiness, and integer target.
2. Add a pure resolver that restores `state.prng`, draws left then right, evaluates `>=`, and returns the advanced snapshot.
3. Add a pure exact `successesOutOf36` helper for preview odds.
4. Make `protect_linda` own target `9` and a defeat effect.
5. Enforce that only `protect_linda` has the Action Check and defeat effect.
6. Remove `readiness.minimumScore` and all binary-threshold selection.
7. Update the two JSON copies together. Make result and reason copy dice-neutral.
8. Store the advanced PRNG in the same atomic quest result state.
9. Add optional `actionCheck` evidence to `linda-quest-resolved`.
10. Return the prior ledger event from the reducer's general duplicate-event path. This reuses the existing `latestEvent` helper.
11. In `resolve-linda-quest`, return the latest matching quest event when the quest is already terminal. Do this before planning a new outcome.
12. Stop `lindaContextActions` from emitting `PREDICTED`, `READINESS N/4`, or other protect-specific display strings.

Checks:

- Add focused resolver cases to `src/domain/__tests__/prng.test.ts`.
- Update `src/domain/__tests__/linda-quest.test.ts` for exact success, exact failure, event evidence, PRNG advance, duplicate reuse, and no PRNG use on other approaches.
- Run content validation and the focused domain tests.

## Step 2: Build one pure preview and one overlay

Files:

- Add `src/ui/ActionCheckOverlay.tsx`.
- Add `src/ui/action-check-copy.ts`.
- Add `src/ui/__tests__/action-check.test.ts`.
- Add `src/render/pencil/action-check-dice.ts` in the canonical `Sim Intelliegence World 25d` checkout.
- Add `scripts/art/build-action-check-dice-review.ts` in that checkout.
- Add `assets/generated/action-check-dice.png` to this shipping checkout after visual approval.
- Add `assets/generated/action-check-dice.json` to this shipping checkout after visual approval.
- Add `src/ui/__tests__/action-check-dice-frames.test.ts` to this shipping checkout.
- Update `src/application/DesktopBridge.ts`.
- Update `src/ui/JournalPanel.tsx`.
- Update `src/ui/quest-action-copy.ts`.
- Update `src/ui/ui-layers.ts` only if the existing cutscene layer cannot be reused.

Work:

1. Build one pure preview projection from the protect action data.
2. Reuse it for Journal result copy, overlay copy, accessibility text, and hidden evidence.
3. Build one deterministic KinderGrimm object recipe with the pinned source commit, source bounds, ground contact, ordered parts, stable layout anchors, and a fixed seed.
4. Reuse the active pencil `Sketch` and graphite medium. Add only the narrow die drawer that is missing.
5. Bake one RGBA die frame for each top value, plus soft flight and strong contact shadows.
6. Generate a review sheet at native `1x` and nearest-neighbor `3x` on dark and light backgrounds. Show bounds and ground contact.
7. Get visual approval before exporting runtime files or replacing the current dice frames in the overlay.
8. Export one PNG atlas and one JSON manifest into this shipping checkout. Record the pinned upstream commit, recipe SHA-256, atlas SHA-256, frame rectangles, and anchors.
9. Load the generated atlas through the installed `expo-asset` package. Keep Canvas 2D only as its compositor.
10. Export the pure timeline sampler with `showArithmetic`, `showResult`, and `canContinue`.
11. Cycle faces every `90 ms`; offset the right die by three frames; lock each committed face only at its landing.
12. Composite the soft flight shadow before landing and the strong contact shadow after landing.
13. Apply the two-pixel squash and rebound only as Canvas image transforms.
14. Use committed faces for the final frame. Decorative frames cannot consume gameplay PRNG.
15. Add reduced-motion output that shows arithmetic at `0 ms`, result at `120 ms`, and CONTINUE at `180 ms`.
16. Keep ROLL and CANCEL in preview. Keep only CONTINUE after commit.
17. Trap Tab inside the overlay. Focus ROLL on open.
18. Use a polite live region for the result.
19. Expose `siWorldPinActionCheck(timeMs)` only in smoke mode.
20. Escape triggers CANCEL in preview, does nothing while rolling, and triggers CONTINUE after the result.
21. Render the shared preview projection in the Journal card.
22. Add stable focus targets for PROTECT LINDA and Close quests. Disable Journal actions while the overlay is open.

Checks:

- Test odds copy, complete stakes, timeline boundaries, final faces, reduced motion, and Escape phase behavior in node-based Jest.
- In 25d, prove byte-identical recipe regeneration, all six faces, both shadows, clean transparent pixels, declared bounds, and recorded recipe and atlas hashes.
- In this checkout, prove the committed atlas matches the manifest hash and every frame stays inside the atlas.
- Do not add a component-test dependency.

## Step 3: Wire the overlay into the existing quest flow

File:

- Update `src/render/WorldScene.tsx`.

Work:

1. Intercept only `protect_linda` before the existing quest command dispatch.
2. Opening and cancelling preview must not change state or PRNG.
3. On ROLL, disable controls, cancel movement, dispatch once, and require a committed quest event.
4. Commit state and start the existing major-quest autosave before animation.
5. Give the committed event to `ActionCheckOverlay`.
6. Stop world ticks, movement frames, portal travel, and world input while the overlay is open.
7. If an active quest command fails, close the overlay, use existing `QUEST BLOCKED` feedback, and return focus to PROTECT LINDA.
8. If the reducer reports a duplicate or the quest is already terminal, use the returned prior event and show its result.
9. If that prior event has no `actionCheck` data, show its committed `resultId` as text only, do not roll, and focus Close quests.
10. After CANCEL, return focus to PROTECT LINDA.
11. After CONTINUE, return focus to Close quests.
12. Keep the consequence cue and result feedback after the visual result.
13. Add `#world-action-check-state` with the preview or committed evidence, including the current PRNG cursor in every phase.

Checks:

- Extend existing accessibility and UI-copy tests.
- Run typecheck and import boundaries.

## Step 4: Repair deterministic fixtures and hidden smoke proof

Files:

- Update `src/application/runtime/first-hour-golden.ts`.
- Regenerate `tests/fixtures/first-hour/golden.json` only if its stored event count or summary changes.
- Update `electron/main/index.ts`.
- Update `scripts/electron/run-package-smoke.ts`.

Work:

1. Assert the opening-hour pair is left `3`, right `5`, readiness `+4`, and success.
2. Keep the canonical first hour on `linda_protected`.
3. Change the packaged smoke sequence to PROTECT LINDA, ROLL, pinned captures, and CONTINUE.
4. Force no reduced motion for the Action Check capture run.
5. Assert preview, rolling, landing, arithmetic, result, ready, save generation, quest result, and consequence caption.
6. Capture the pre-roll preview without dice. Pin and capture `450 ms`, `900 ms`, `1,100 ms`, `1,350 ms`, and `1,650 ms` with `stayHidden: true`.
7. Do not use sleeps to select animation frames.
8. Add every new Action Check result key to the smoke result validator.
9. Remove stale Action Check captures before the run and validate every new capture.
10. Verify initial focus, trapped Tab, CANCEL focus return, blocked-command focus return, and CONTINUE focus return through the hidden renderer.
11. Prove Tab changes focus from ROLL to CANCEL and cycles back to ROLL. Prove Shift+Tab cycles in reverse. A stationary focus target fails.
12. Press Escape in preview. Assert the overlay closes, focus returns to PROTECT LINDA, PRNG stays unchanged, and save generation stays unchanged.
13. Reopen and ROLL. Press Escape while rolling and assert it does nothing. Pin the result, press Escape, and assert it performs CONTINUE.

Checks:

- `npm run verify:first-hour`
- `npm run export:web`
- `npm run build:electron`
- Package the app.
- Run the packaged smoke in its existing hidden-window mode.
- Inspect the preview and five pinned capture files.

## Step 5: Final gates

Run in this order:

1. In 25d, run the focused KinderGrimm dice recipe test and review builder. Confirm its recorded atlas hash matches the exported shipping manifest.
2. In this checkout, run focused Action Check, frame-manifest, Linda quest, accessibility, and UI tests.
3. `npm run content:check` with a temporary Git index. Copy the current real index byte-for-byte, add only the intentional quest JSON edit to the copy, run the gate with `GIT_INDEX_FILE` set, then delete the copy. Confirm the real index is byte-for-byte unchanged. This keeps every other gated path visible to `git diff`.
4. `npm run validate:content`
5. `npm run check:boundaries`
6. `npm run typecheck`
7. `npm test -- --runInBand`
8. `npm run verify:first-hour`
9. `npm run export:web`
10. `npm run build:electron`
11. Hidden package and smoke verification.

Stop and fix the first failing gate. Preserve all unrelated work.
