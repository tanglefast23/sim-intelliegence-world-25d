# New Game Alarm Intro Implementation Plan

Date: 2026-08-24

Status: implemented, locally verified, Grok-audited, and packaged-qualified; publication pending

Source: `docs/specs/2026-08-24-new-game-alarm-intro-master-spec.md`

## Scope lock

Implement the audited new-game alarm intro in the canonical 25d checkout.

START opens a large `7:00` alarm. The supplied sound restarts every 2.5 seconds until snooze. Snooze commits one authoritative `2d6` roll, shows `Bad`, `okay`, or `Good`, saves the advanced PRNG state once, then fades to the vampire inside `protagonist_villa`.

Do not add a dependency, save migration, second save, duplicate dice renderer, duplicate vampire, new map, or replacement opening mode.

## Step 1: Make the roll, seed, clock, and schedules authoritative

Files:

- Update `src/domain/action-check.ts`.
- Update `src/domain/state/initial-state.ts`.
- Update `src/domain/state/production-cast.ts`.
- Update `src/domain/__tests__/prng.test.ts`.
- Update schedule and production-content tests affected by the 07:00 start.

Work:

- [x] Extract `rollTwoDice(prng)` from `resolveActionCheck`. Return the pair, raw total, and advanced snapshot.
- [x] Keep `resolveActionCheck` as the existing wrapper that applies modifier, target, and success.
- [x] Export the existing fixed initial seed and let `createInitialState(displayName, seed)` accept an optional unsigned 32-bit seed.
- [x] Change the initial clock to `07:00`.
- [x] Reuse `activeScheduleBlock` from `src/world/schedules/schedule.ts` for the production cast, Linda, and `generic_resident` initial placement. Do not add another schedule selector.
- [x] Pass 07:00 from `createInitialState`.
- [x] Pass the loaded state's minute of day from `insertMissingProductionCast`.
- [x] Preserve the existing active-map rule and the save-repair no-op contract.

Checks:

- [x] Prove `rollTwoDice` consumes exactly two draws in left-to-right order.
- [x] Prove `resolveActionCheck` returns the same current result for the default seed.
- [x] Prove seed injection is deterministic and rejects invalid seed data through the existing PRNG contract.
- [x] Prove Linda, `generic_resident`, and production NPCs start in the block active at 07:00.
- [x] Prove production-cast repair remains idempotent on a current save.

## Step 2: Fix the alarm recipe and extract the existing dice stage

Files:

- Update `src/render/pencil/alarm-clock.ts`.
- Update `scripts/art/build-alarm-clock-review.ts`.
- Add `src/ui/DiceRollCanvas.tsx`.
- Update `src/ui/ActionCheckOverlay.tsx`.
- Update `src/ui/__tests__/action-check.test.ts`.
- Update or add the focused alarm recipe test.

Work:

- [x] Change the alarm metadata and brief from `7:30` to `7:00`. Preserve seed `730` because changing it alters the approved clock body.
- [x] Declare one recipe-owned three-glyph layout: `7` at x=26, colon at x=41, zeroes at x=46 and x=60, all at the audited y positions.
- [x] Make `drawTime` read the declared layout instead of hard-coded four digits.
- [x] Make the review builder assert the glyphs and positions, repeated-bake byte equality, snooze anchor, and button bounds.
- [x] Run `npx tsx scripts/art/build-alarm-clock-review.ts`, then inspect its native and enlarged frames.
- [x] Move only the existing dice atlas load, canvas creation, and draw functions into `DiceRollCanvas`. Its input is `{ dice, elapsedMs, reducedMotion }`; it never requires modifier, target, success, or alarm-specific data.
- [x] Move the existing pure 1650/180 ms timeline with the shared dice stage. Re-export its current helpers from `ActionCheckOverlay` so existing callers do not change.
- [x] Make `ActionCheckOverlay` use the shared stage without changing its preview, roll, result, focus, Escape, or timing behavior.

Checks:

- [x] The alarm recipe produces deterministic RGBA bytes and declares exactly `7:00`.
- [x] The regenerated review sheet visibly reads `7:00`.
- [x] Existing Action Check timeline and UI tests remain unchanged in meaning.
- [x] The generated dice atlas and manifest remain byte-for-byte unchanged.

## Step 3: Build the alarm overlay and one-player audio cadence

Files:

- Add `src/ui/AlarmIntroOverlay.tsx`.
- Add `src/ui/__tests__/alarm-intro.test.ts`.
- Copy the supplied bytes to `assets/source/audio/sfx_alarm_clock.webm`.

Work:

- [x] Render a full-screen, non-dismissable dialog in the existing warm pencil-game language.
- [x] Set the exact dialog label `Alarm clock showing 7:00. Hit snooze.` and exact button label `Snooze alarm`. Backdrop input does nothing.
- [x] Bake the alarm front frame once into a DOM canvas. Scale it with nearest-neighbor sampling and keep it fully visible.
- [x] Put exact `HIT SNOOZE!` copy above a down arrow aimed at the recipe snooze anchor.
- [x] Draw decorative sound-emission lines on both sides. Pulse them only when reduced motion is off.
- [x] Center one transparent Pressable on the snooze anchor. Keep its CSS target at least 44 by 44 pixels.
- [x] Focus `#alarm-intro-snooze` on mount. Trap focus, block Escape, and hide decorative nodes from accessibility APIs.
- [x] Export pure `alarmGrade(total)` and alarm timeline helpers. Preserve exact `Bad`, `okay`, and `Good` casing.
- [x] Use `DiceRollCanvas` for the committed pair and total.
- [x] Announce the total and grade once when the result appears.
- [x] Announce a save error once when focusing `RETRY SAVE`.
- [x] Hold the settled result for 900 ms. Fade for 500 ms, or cut on reduced motion, only after save success.
- [x] Keep a pending or failed save on the result screen. Focus `RETRY SAVE` after failure.
- [x] Use one installed `expo-audio` player for the supplied WebM.
- [x] Play immediately, then recursively restart after 2500 ms by pausing, seeking to zero, and playing the same player.
- [x] Permanently cancel on snooze and unmount.
- [x] Suspend on background, disabled audio, or zero SFX volume. Resume immediately with a fresh cadence when audible again before snooze.
- [x] Guard every awaited seek with a cadence generation or cancelled ref. A stale continuation cannot play or reschedule after snooze, suspension, or unmount.
- [x] Never create an overlapping player or a live-region announcement for each ring.

Checks:

- [x] Test every total from 2 through 12 and all grade boundaries.
- [x] Test normal and reduced-motion result/fade boundaries.
- [x] Use fake timers and a fake player to prove starts at 0, 2500, and 5000 ms, plus cancel, suspend, and resume. Resolve a delayed seek after snooze, suspension, and unmount to prove it stays stopped.
- [x] Test exact dialog, button, result, and retry copy through pure helpers and existing renderer tests.
- [x] Confirm the copied audio SHA-256 is `a2c98f255bb7d3361419221351559f721450f034f886a9d80ef106b8cb34f614`.

## Step 4: Put the intro into the boot and first-save flow

Files:

- Update `src/application/GameScreen.tsx`.
- Update `src/application/NewGameFlow.tsx`.
- Update `src/application/__tests__/game-screen.test.tsx`.
- Update `src/application/__tests__/new-game-flow.test.ts`.

Work:

- [x] Add one `intro` branch to `BootState`. Keep the world unmounted in this branch.
- [x] Change START to create the 07:00 state in memory and show the alarm without saving.
- [x] Use the fixed seed when `window.siWorldSmokeMode` is true. Otherwise use one unsigned 32-bit value from `crypto.getRandomValues`.
- [x] Preserve the existing global pointer/key gesture arming in `useAudioEnabled`. START is that gesture; the overlay-owned player starts only when the armed flag is true.
- [x] Keep the existing synchronous START guard.
- [x] On the first snooze, call `rollTwoDice` once, replace the state's PRNG snapshot, disable snooze, and request the first save with expected generation `null`.
- [x] Store the committed pair and state in the intro branch before starting the async save.
- [x] Ignore duplicate snooze input and duplicate save callbacks.
- [x] Treat thrown writes and `deferred` results as retryable failure. A deferred result means no write occurred because pause tokens block the boundary; keep the same state and pair, then retry only that save after the boundary is stable.
- [x] Keep `BootState` in intro through dice settle, 900 ms hold, and the complete 500 ms fade or reduced-motion cut. Only the overlay completion callback after save success creates the active session and mounts `WorldScene` once.
- [x] Keep loaded, migrated, corrupt, incompatible, and presentation-preference paths unchanged.
- [x] Change the arrival card to `DAY 1 · 07:00 · SUNWARD BAY`.

Checks:

- [x] Update the current `react-test-renderer` GameScreen test to prove START does not save.
- [x] Prove two START calls create one intro.
- [x] Prove two snooze calls create one roll and one first save.
- [x] Prove saved state has the advanced PRNG snapshot.
- [x] Prove failure and retry use the same pair and state.
- [x] Prove active world state appears only after save success and overlay completion.
- [x] Prove a loaded save never mounts the alarm.
- [x] Prove smoke seed is fixed and production seed uses injected cryptographic bytes.

## Step 5: Replace the old opening and repair every smoke starter

Files:

- Update `src/render/WorldScene.tsx`.
- Update focused WorldScene source or integration tests.
- Update `electron/main/index.ts`.
- Update `scripts/verification/hidden-window-capture.ts`.
- Update `scripts/electron/package-smoke-utils.ts` if its resource listing does not already prove the WebM is packaged.

Work:

- [x] Remove `OPENING_CAST_TILES`, `OPENING_CAST_IDS`, the `openingShowcase` state, forced actor injection, and opening-only conversation branches.
- [x] Center every new game on `initialTile`. Keep the current close new-game zoom.
- [x] Keep the protagonist location, existing vampire visual, map, and normal world behavior unchanged.
- [x] Add one shared packaged-Electron helper that waits for and activates `#alarm-intro-snooze`.
- [x] Give the overlay a stable `#alarm-intro-save-status` label so hidden checks can observe save completion before `WorldScene` exists.
- [x] Before snooze, record initial focus, 44 by 44 bounds, decorative `aria-hidden`, and Escape survival. Double-activate snooze and prove one committed result and save.
- [x] In smoke mode only, expose alarm audio evidence for successful load/play and advancing player time. Electron remains muted at the window level.
- [x] Use the helper from both `startResponsiveSmokeGame` and `beginWorldSmoke`. Drive renderer paint, wait for `#alarm-intro-save-status` to read `SAVED GEN 1`, then wait for `#world-state` and its existing save-status proof.
- [x] Add `.webm: audio/webm` to the HTTP capture server MIME map.
- [x] Update the HTTP hidden-window starter to snooze after START, drive paired hidden captures while the alarm animation waits, then wait for `window.siWorld25dEvidence` without a desktop-save-status wait.
- [x] Keep every smoke window hidden, audio muted before content loads, and paint-driven waits intact.

Checks:

- [x] Source tests prove the false `{ x: 22, y: 27 }` anchor and opening cast are gone.
- [x] Hidden evidence proves the camera begins on the real protagonist tile inside `protagonist_villa`.
- [x] Packaged and HTTP helpers both pass the alarm without timeouts.
- [x] No new bare `capturePage` polling call is added.
- [x] Packaged resource validation and the exported web output both include the alarm WebM.
- [x] Packaged smoke fails on alarm load/play rejection and proves the real player advanced while the window stayed muted.

## Step 6: Repair deterministic fixtures and run focused verification

Files:

- Update `src/application/runtime/first-hour-golden.ts`.
- Update `src/application/__tests__/first-hour.test.ts` if its start-minute contract changes.
- Regenerate `tests/fixtures/first-hour/golden.json` through the existing script.
- Regenerate `tests/fixtures/saves/valid-v5-envelope.json`.
- Regenerate `tests/fixtures/saves/stale-v6-envelope.json`.
- Update only tests made stale by the intentional 07:00 schedule change.

Work:

- [x] Derive the executed first-hour start minute from `createInitialState` and move the summary default from 08:00 to 07:00.
- [x] Reproduce the completed intro before the first-hour commands: call `rollTwoDice`, store its advanced PRNG snapshot, and keep the raw intro result out of the event ledger.
- [x] Re-pin the first-hour in-source Action Check guard to the recomputed post-intro pair, modifier, total, and outcome before asking the verifier to print a summary. Keep the guard strict.
- [x] Move the `summarizeFirstHour` default and `runFirstHourGolden` local start minute together.
- [x] Re-run the first-hour flow and inspect any changed schedule, dice, event, or end-minute evidence.
- [x] Run `npm run verify:first-hour`, copy its printed actual summary only after explaining each intended change, then update `tests/fixtures/first-hour/golden.json` with that exact JSON. The verifier has no update flag.
- [x] Do not weaken unrelated assertions to make the new time pass.

Focused gates:

- [x] Alarm, Action Check, PRNG, initial-state, production-cast, GameScreen, NewGameFlow, and WorldScene tests pass.
- [x] Run `npm run content:build` to regenerate save fixtures derived from `createInitialState`.
- [x] Run `npm run content:check` and commit every intentional generated fixture change.
- [x] `npm run check:boundaries` passes.
- [x] `npm run typecheck` passes.
- [x] `npm run verify:first-hour` passes.
- [x] `npm run export:web` proves the WebM bundles.

## Step 7: Run full and practical acceptance gates

Run in this order. Stop and fix the first failure.

- [x] Run the full Jest suite with `npm test -- --runInBand`.
- [x] Run `npm run test:electron:unit`.
- [x] Run `npm run build:electron`.
- [x] Run `npm run smoke:25d:lit` and `npm run smoke:25d:fallback`. These are approved hidden-window smokes.
- [x] Run the smallest packaged hidden smoke that exercises `beginWorldSmoke` and `startResponsiveSmokeGame` without opening a visible window.
- [x] Capture one phone-sized and one desktop-sized hidden alarm screenshot with audio muted.
- [x] Inspect both screenshots for `7:00`, arrow alignment, sound lines, large snooze target, exact text, full-clock visibility, and viewport fit.
- [x] Confirm every Electron process exits after each check.
- [x] Run `git diff --check` and review the exact scoped diff.

## Step 8: Review and publication

- [x] Run Grok 4.6 at `xhigh` over the completed implementation and tests.
- [x] Verify every Grok claim locally.
- [x] Fix only confirmed in-scope findings.
- [x] Re-run the checks affected by those fixes.
- [x] Mark every completed checkbox in this plan.
- [x] Stage only the alarm feature, its audited spec and plan, supplied audio, generated review artifact if tracked by project convention, `tests/fixtures/first-hour/golden.json`, the two regenerated save fixtures, and their tests.
- [x] Commit with one conventional feature message.
- [ ] Push `codex/new-game-alarm-intro` to `origin`.
- [ ] Confirm local and remote branch SHAs match.

## Council audit record

### Round 1 — Opus 5 and Grok 4.6 at xhigh

Opus returned `CHANGES_REQUIRED`. The first broad Grok call used all 48 turns and returned cancelled without final JSON, so the runner rejected it. A bounded, tool-free Grok retry over the complete plan and spec returned `FINDINGS`.

Accepted:

- regenerate and stage both save fixtures derived from `createInitialState`;
- add `content:build` and `content:check` to the gates;
- re-pin the strict first-hour Action Check guard after consuming the intro roll;
- keep the world unmounted through the completed fade;
- state the exact dialog, snooze, result, and save-error accessibility contracts;
- wait for overlay `SAVED GEN 1` before the packaged world mount.

Rejected:

- Grok described `deferred` as an in-flight first save. The repository returns `deferred` only when blocking pause tokens prevent a write. No later success callback exists, so retrying the same advanced state cannot duplicate that attempt.

### Final implementation audit — Grok 4.6 at xhigh

Grok returned two findings.

Accepted:

- add the React Native Web-supported `aria-hidden` prop to the prompt and sound-line decorations. The prior native-only props did not meet the packaged DOM contract.

Rejected:

- Grok described a possible interrupted fade. No current code path stops or replaces the fade animation. Hidden Windows checks drive the required paint frames until the fade completes, so the claimed stuck state was not reproducible.

## Packaged qualification record

The first packaged run exposed two stale assumptions in the test path. The alarm player could load after the first cadence attempt, and the later Action Check still expected the pre-intro PRNG pair. The final implementation subscribes to the installed Expo Audio load status, captures the existing global gesture gate before controls can stop propagation, and expects the audited post-intro `[6, 3]` pair.

Final clean-commit results:

- `npm run smoke:electron`: passed, including muted real-player advance, alarm accessibility, save generation 1, fade, world mount, and all legacy world checks.
- `npm run smoke:responsive`: passed at 1280x720, 1440x900, 1920x1080, 2560x1440, and 1600x720.

### Round 2 — Opus 5 and Grok 4.6 at xhigh

Skipped at the user's request after round 1. Implementation starts now.
