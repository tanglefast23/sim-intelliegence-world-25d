# Reusable Dice Roll Flow — Master Specification

**Status:** Final after two council rounds; Grok round 2 was rejected as schema filler
**Date:** 2026-08-25
**Project:** Sim Intelligence World 25d
**Target branch:** `codex/new-game-alarm-intro`

## 1. Summary

Every visible two-dice roll must use one shared presentation flow.

The flow starts with a KinderGrimm pencil dice cup. The cup shakes until the player presses `ROLL IT`. The supplied cup-shaking sound repeats while the cup shakes.

After the press, two dice fly upward from below the screen. They tumble toward the middle of the screen. Every visible die orientation must obey a standard six-sided die. The dice bounce, settle, and trigger the supplied landing sound and visible impact cues.

The raw sum of both dice then appears as a large number. The number stays fully visible for 2.5 seconds. The flow then animates away and returns control to the feature that requested the roll.

The new-game alarm intro and the existing Action Check are the first two consumers. Future features must call the same shared flow instead of building another dice animation.

## 2. Goals

- Give every visible `2d6` roll the same cup, sound, dice, impact, number, and exit sequence.
- Keep the domain roll deterministic and separate from presentation.
- Reuse the approved KinderGrimm dice style.
- Add a deterministic KinderGrimm dice cup.
- Show physically valid visible die faces during every tumble frame.
- Make both supplied effects clearly louder than the current alarm effect presentation.
- Preserve the player’s SFX setting and mute state.
- Work with mouse, keyboard, small windows, reduced motion, and screen readers.
- Keep the current new-game save boundary safe.
- Replace the duplicated alarm and Action Check roll timelines with one shared timeline.

## 3. Non-goals

- Do not change the `2d6` probability distribution.
- Do not change Action Check modifiers, targets, or consequences.
- Do not add dice choices, rerolls, advantage, disadvantage, or dice physics.
- Do not use a physics engine or a new runtime dependency.
- Do not render generic 3D dice that conflict with the pencil style.
- Do not consume extra gameplay PRNG values for visual motion.
- Do not add a skip button for the normal motion path.
- Do not change global music or SFX preference ranges.
- Do not add the cup as a world prop or collision object.
- Do not edit the pinned KinderGrimm upstream repository.

## 4. Source assets

The user supplied these two source files:

- `ElevenLabs_Shaking_dice_in_a_cup,_anticipation_builds.mp3`
- `dice_land.mp3`

Source provenance:

| Cue | External source path | SHA-256 |
|---|---|---|
| Cup shake | `/Users/joemacprom5/Downloads/ElevenLabs_Shaking_dice_in_a_cup,_anticipation_builds.mp3` | `d9ba8af22031a1996cb11457a18d9c87834bc9d5efc11d401b53a2d00051f74e` |
| Dice land | `/Users/joemacprom5/Downloads/dice_land.mp3` | `14cdea424509ecac46fd686e9691d6ee9b637ad1b8d0f01e7f7c5c105ff2d730` |

Create production copies with stable repository names:

- `assets/source/audio/sfx_dice_cup_shake.mp3`
- `assets/source/audio/sfx_dice_land.mp3`

Keep the user’s source files unchanged. Production copies may use non-clipping loudness treatment. Do not print or store metadata that is unrelated to the game.

Measured source facts:

- Both files are about `2.09` seconds long.
- The shake file peaks near `-0.3 dBFS` and has a mean near `-25.9 dB`.
- The land file peaks near `-7.2 dBFS` and has a mean near `-41.2 dB`.
- The files have different SHA-256 hashes and are not duplicates.

## 5. Shared user flow

### 5.1 Enter

1. A consumer requests a visible `2d6` roll.
2. The shared flow takes focus and blocks world input.
3. The cup stage appears.
4. The shaking sound starts when audio is enabled and the player has SFX volume above zero.
5. Focus moves to `ROLL IT`.

No die values are generated during the cup stage.

### 5.2 Cup stage

- Show one large cup near the center.
- Draw the cup from a deterministic KinderGrimm recipe.
- Use a warm graphite, paper, leather, and ink palette that matches the approved dice.
- Place a visible `ROLL IT` button over the cup’s named button anchor.
- Keep at least a `48 × 48` logical-pixel pointer target.
- Rock and shift the cup in a short repeating motion.
- Show pencil motion lines on both sides.
- Use an uneven hand-drawn cadence rather than a smooth mechanical pendulum.
- Keep the cup stage active until the player presses `ROLL IT`.
- Do not auto-roll.

The shake sound repeats for the full cup stage. A loop boundary must not restart more than one player or stack two copies.

### 5.3 Roll activation

`ROLL IT` is single-use per successful commit.

On the first valid activation:

1. Disable the button immediately.
2. Stop and rewind the cup-shaking sound.
3. Ask the consumer to commit exactly one domain roll.
4. Receive the committed two die values.
5. Start the shared roll timeline.

Extra pointer, keyboard, or synthetic activations must not consume more PRNG values.

### 5.4 Dice flight and tumble

- Both dice begin below the bottom edge of the visible flow area.
- Their starting positions are close together, as if released from the cup.
- They travel upward and separate into two resting positions near the middle.
- The paths use different arcs, timing, and rotation direction.
- Each die changes through valid cube orientations while it tumbles.
- The motion must look irregular, but its visual sequence must be deterministic for the committed result.
- The motion may use the rolled values and die index as a presentation seed.
- The motion must not read or advance the gameplay PRNG.
- The final top faces must equal the committed die values.
- The dice must stay inside the responsive safe area after entering the screen.

The current side-entry animation is replaced. Both dice must enter from the bottom.

### 5.5 Valid die orientations

Use a standard right-handed `d6` layout:

- Opposite faces are `1–6`, `2–5`, and `3–4`.
- The canonical visible corner is top `1`, left `2`, right `3`.
- Read around that shared corner, the winding is `1 → 2 → 3`.
- Every other orientation must be a proper rotation of this one die. Reflections are invalid.
- Every visible top, left, and right face combination must be possible on one physical cube.
- Pip layouts must keep their correct face identity while the cube tumbles.
- The animation must never fake a tumble by changing only the top number while leaving impossible side faces.

Use deterministic baked pencil orientation frames. A physics engine is not required. A practical atlas can contain the 24 rotational orientations of one cube plus the existing flight and contact shadows.

The final orientation for each top result can use one canonical valid rotation. Earlier frames can walk through a deterministic pseudo-random sequence of the 24 valid orientations.

The current `SIDE_FACES` table in `src/render/pencil/action-check-dice.ts` is not authority for the new atlas. It mixes reflected triples for some top values. Replace it with triples generated from the canonical die’s 24 proper rotations. Preserve the established material, mass, color, pips, and pencil character, but do not preserve invalid side-face identities.

### 5.6 Landing and impact

- The dice make a few readable contacts before they stop.
- Their main contacts do not happen on the same frame.
- Each die briefly squashes or compresses its contact shadow.
- Each die rebounds and loses height.
- Both dice settle near the middle without overlap.
- Play the landing sound once for the pair at the main final impact.
- Never play one landing sound per animation frame.

Visible impact cues must include:

- a fast contact-shadow change;
- a short pencil impact ring or burst;
- a few paper or graphite flecks;
- short radial impact lines;
- a small local recoil of the dice group.

Do not shake or move the saved world camera. The effect belongs to the overlay only.

### 5.7 Large number

After both dice have fully settled:

1. Compute the raw visible roll as `die one + die two`.
2. Bring the total into the center with a short scale-and-opacity entrance.
3. Keep the total fully visible for exactly `2,500 ms`.
4. Keep both settled dice visible behind or below the number.
5. Animate the shared flow away.
6. Call the consumer completion callback once.

The shared flow shows only the raw dice sum. Modifiers, targets, grades, success labels, and story consequences belong to the consumer after this flow completes.

## 6. Timing contract

The normal-motion timeline uses these target windows. Small tuning is allowed during visual review if event order and the 2.5-second hold stay fixed.

| Event | Target time after `ROLL IT` |
|---|---:|
| Dice appear from below | `0 ms` |
| Fast flight and tumble | `0–900 ms` |
| First main die contact | about `1,000 ms` |
| Second main die contact and landing SFX | about `1,150 ms` |
| Small rebounds and extra rolls | `1,150–1,650 ms` |
| Both dice fully settled | about `1,700 ms` |
| Large number fully visible | about `1,950 ms` |
| Required full-opacity hold | `1,950–4,450 ms` |
| Exit animation | about `4,450–4,850 ms` |
| Consumer completion callback | about `4,850 ms` |

The cup stage has no time limit.

The presentation clock advances only while the flow is visible and active. If the document becomes hidden or the renderer suspends, pause accumulated presentation time. Resume from the saved active elapsed time. Do not jump over the landing cue or the 2.5-second result hold. In smoke mode, treat the sanctioned hidden Electron window as active because its paired captures drive rendering.

## 7. Reduced motion

Reduced motion keeps the interaction and result clear without simulated flight or repeated shaking.

- Keep the cup still.
- Show static motion-line art at lower contrast.
- Keep the shaking sound loop unless audio is muted.
- On `ROLL IT`, cross-fade the dice into their settled positions.
- At about `80 ms`, use one brief static impact flash instead of bounce, spin, or recoil.
- Play the landing sound once with that impact flash.
- Make the large raw total fully visible by about `180 ms`.
- Keep the total fully visible from about `180–2,680 ms`.
- Use a short opacity exit and complete by about `2,980 ms`.

Reduced motion must not shorten the information-reading hold.

## 8. Audio contract

### 8.1 Cup shake

- Start only during the cup stage.
- Repeat until `ROLL IT`, unmount, mute, or SFX volume zero.
- Use one player instance.
- Stop and rewind before dice flight begins.
- Resume correctly if audio becomes enabled while the cup remains visible.
- Do not restart on unrelated component renders.

### 8.2 Landing

- Use a separate player instance.
- Play once at the pair’s main final impact.
- Rewind before reuse.
- Guard against repeated React effects and pinned smoke frames.

### 8.3 Loudness

- Respect the global SFX setting.
- Create non-clipping production copies with FFmpeg loudness normalization at `-16 LUFS` integrated and no more than `-1.5 dBTP`.
- Verify each production copy is measurably louder than its supplied source with the same FFmpeg measurement command.
- The production integrated loudness must improve by at least `3 LU` without exceeding the true-peak limit.
- Target about `0.80 × sfx` for the shake cue.
- Target up to `1.00 × sfx` for the landing cue.
- Clamp the final player volume to `0–1`.
- Do not change the user’s saved SFX preference.
- Do not allow audible clipping after source treatment and runtime gain.

Audio failure must never block the roll or its consequence.

The supplied files are provenance inputs. The committed production copies and their measured loudness report are the reproducible game assets.

## 9. KinderGrimm cup asset

Create a deterministic UI prop recipe with:

- asset ID `dice-roll-cup-01`;
- pinned KinderGrimm commit `de339ad739d8cbd28ff2dd4a940af38c0ede86c8`;
- graphite medium;
- front and side review views;
- one strong inverted-cup silhouette;
- worn warm-brown leather or heavy paper material;
- a dark opening, rim, seams, hatch tone, and contact shadow;
- named anchors `button`, `center`, and `groundContact`;
- declared transparent bounds;
- deterministic seed;
- ordered parts and stable layout anchors.

The runtime needs the front view. The side view is review evidence. This is a UI-only prop, so it has no world collision footprint or depth split.

Required evidence:

- recipe source;
- structured recipe JSON;
- native review sheet;
- enlarged review sheet;
- anchor overlay;
- deterministic hashes;
- hidden in-game capture of the cup stage before final approval.

Do not use generic image generation as final art.

### 9.1 Valid-orientation dice atlas

Extend the approved `action-check-dice-01` recipe into version `2` rather than replacing its visual language.

- Keep the pinned KinderGrimm commit, graphite medium, canvas size, transparent bounds, anchors, shadows, palette, and ordered pencil passes.
- Replace the six top-only frame keys with 24 orientation keys using `die-t{top}-l{left}-r{right}`.
- Generate the key set from proper cube rotations of the canonical top `1`, left `2`, right `3` die.
- Keep `soft-flight-shadow` and `strong-contact-shadow` as separate frames.
- Generate one canonical final-orientation lookup for each top result `1–6`.
- Update `assets/generated/action-check-dice.json` to manifest version `2` with the new frame table, recipe SHA-256, atlas SHA-256, and canonical-final lookup.
- Regenerate the existing manifest-SHA test. Do not remove or weaken it.
- Update the KinderGrimm action-check-dice recipe JSON, evidence JSON, atlas review, native review, enlarged review, and individual orientation evidence.
- Prove all 24 orientation RGBA outputs and both shadows are deterministic and unique where required.

The atlas name remains for compatibility. The runtime flow is generic and must not expose Action Check wording.

## 10. Shared presentation architecture

Add one reusable component that owns the full visual and audio sequence. The exact name can follow local conventions; `DiceRollFlow` is the preferred name.

Embed this component inside each consumer’s existing overlay. Do not create a second `role="dialog"`, nested modal, or new overlay layer. The alarm intro and Action Check each keep one modal dialog and their own outer focus trap.

The shared component owns:

- cup rendering;
- cup motion and motion lines;
- `ROLL IT`;
- cup-shake audio lifecycle;
- dice canvas;
- valid orientation selection;
- flight, contact, rebound, and settle timing;
- landing audio lifecycle;
- impact cues;
- large raw-total display;
- 2.5-second hold;
- exit animation;
- the stable `ROLL IT` focus target and the focusable flow root used during motion;
- reduced-motion behavior;
- pinned smoke timing;
- one-shot completion guards.

The consumer owns:

- when the flow opens;
- the deterministic domain roll;
- any modifier or target;
- save or command commitment;
- the result grade or success consequence;
- what happens after the shared completion callback.
- the single dialog, `aria-modal`, Tab trap, pre-roll cancel rule, and post-flow focus target.

Use controlled result data:

- Before `ROLL IT`, no result exists.
- `onRoll` asks the parent to commit one result.
- The parent passes the committed dice back.
- The component never calls `Math.random` for gameplay.
- `onComplete` fires once after the exit.
- The component reports `cup`, `rolling`, `result-hold`, and `exiting` phase changes to its consumer.

Do not build a general modal framework, event bus, queue, registry, or dice service. Two current consumers justify one shared component and one shared timeline, not a new UI platform.

## 11. Consumer integration

### 11.1 New-game alarm intro

The alarm sequence becomes:

1. Show the large `7:00` clock.
2. Repeat the alarm every `2.5` seconds.
3. The player presses snooze.
4. Stop the alarm.
5. Permanently unmount the alarm clock and snooze control for this intro.
6. Enter the shared cup stage without rolling yet.
7. The player presses `ROLL IT`.
8. Commit one `2d6` result and the updated PRNG state.
9. Start the save request for that committed state.
10. Play the shared dice flow.
11. After the shared flow completes, show the alarm grade for `900 ms`:
    - `2–4`: `Bad`
    - `5–8`: `okay`
    - `9–12`: `Good`
12. Announce only `{grade}.` when the grade appears. The shared flow already announced the dice and raw sum.
13. Keep the existing safe save boundary. Do not enter the world before save success.
14. Fade into the vampire’s home with the vampire present.

Snooze must not consume the roll. `ROLL IT` consumes it.

If saving fails, keep the same committed result. `RETRY SAVE` must never reroll.

The alarm intro stays non-dismissable. Escape is a no-op during the clock, cup, roll, grade, saving, and retry states. If saving fails during the shared timeline, finish the shared timeline and grade hold first. Then show `RETRY SAVE` and move focus to it. If saving is still active after the grade hold, show the current saving status and wait. Fade only after both the grade hold and save success.

If the alarm roll commit throws before returning dice, no PRNG state was committed. Re-enable `ROLL IT`, show a concise retry message, and return focus to the button. A successful commit still disables it permanently for that intro.

This spec replaces the old rule that snooze itself commits the roll. It supersedes the snooze-commit and old roll-timing requirements in `docs/specs/2026-08-24-new-game-alarm-intro-master-spec.md`.

### 11.2 Action Check

- Keep the current title, rule, chance, inputs, and stakes before the roll.
- Replace the current plain `ROLL` and side-entry dice canvas with the embedded shared cup stage.
- Keep cancel available only before `ROLL IT`.
- `ROLL IT` commits the current Action Check exactly once.
- The shared large number shows the raw two-dice sum.
- After the shared flow completes, show the existing modifier arithmetic, `SUCCESS` or `FAILURE`, and `CONTINUE` result phase.
- Escape is a no-op during the shared rolling, result-hold, and exit phases.
- Escape activates Continue only after the Action Check result phase appears.
- `CONTINUE` starts the existing story consequence and restores focus to Close Quests.
- If the domain command throws on `ROLL IT`, close the Action Check and restore focus to Protect Linda. Do not invent dice or leave a failed cup stage open.
- Do not reroll when the overlay closes, retries a save, or restores focus.

| Action Check phase | Visible content | Available actions |
|---|---|---|
| Preview and cup | Existing title, rules, chance, inputs, stakes, cup, `ROLL IT` | `ROLL IT`, `CANCEL`, Escape cancels |
| Shared roll | Dice flow only within the same dialog | No cancel; Escape no-op |
| Result | Existing modifier arithmetic and `SUCCESS` or `FAILURE` | `CONTINUE`; Escape continues |

Existing smoke assertions at the old `1,100`, `1,350`, and `1,650 ms` points must move to the new post-flow result phase. The domain calculation and copy do not change.

## 12. Focus, input, and accessibility

- The flow is modal while active.
- World movement, camera, panels, and other actions stay blocked.
- Focus enters on the stable shared node `#dice-roll-flow-roll`.
- The button supports pointer, Enter, and Space.
- The button has the accessible label `Roll the dice` while visible text stays `ROLL IT`.
- The cup and decorative motion lines are hidden from the accessibility tree.
- During flight, keep focus on the stable shared node `#dice-roll-flow-root` inside the consumer dialog.
- Do not allow Escape to cancel after `ROLL IT`.
- A consumer may allow Escape before the roll, as Action Check does.
- Announce `{die one} plus {die two} equals {raw sum}` once when the large number becomes fully visible at the normal `1,950 ms` threshold or reduced-motion `180 ms` threshold.
- Do not announce every tumble face.
- Tab and Shift+Tab stay inside the consumer dialog during cup, roll, result hold, and exit, including after `ROLL IT` becomes disabled.
- Restore focus to Protect Linda after Action Check cancel or commit failure, Close Quests after Action Check Continue, and `RETRY SAVE` after an alarm save failure.
- Keep text readable at the smallest supported Electron window of `960 × 640` logical pixels.
- Prevent horizontal clipping at high DPI.

## 13. Responsive layout

- Base the flow on the actual overlay surface, not global window assumptions.
- Scale the cup down before reducing the `ROLL IT` target.
- Keep the dice resting group centered.
- Keep both dice and the large total inside a safe inset of at least `12` logical pixels.
- Preserve the large total as the strongest visual element.
- Use the approved pencil art without smoothing.
- Test normal and compact layouts.

## 14. State and failure rules

- Guard `ROLL IT` against double activation.
- Never create two shake loops.
- Never play the landing cue more than once.
- Cancel all animation frames and timers on unmount.
- Pause and rewind both players on unmount.
- If the dice image is late, hold the roll stage until it is ready or show a stable fallback. Do not complete an invisible roll.
- If audio is late or fails, continue silently.
- If the consumer rejects the roll commit, return to a stable pre-roll error state without inventing dice.
- If the app loses focus during a roll, preserve the committed result and resume from elapsed presentation time without rerolling.
- Smoke pinning must not cause audio replay or completion callbacks.
- Expose `window.siWorldPinDiceRollFlow(timeMs: number | null)` in smoke mode. A number pins the shared presentation clock without playing audio or firing `onComplete`. `null` releases the pin and resumes the live clock from the pinned elapsed time. `onComplete` can fire only from the released live clock.
- Existing `window.siWorldPinActionCheck` and `window.siWorldPinAlarmIntro` delegate their shared-roll times to `siWorldPinDiceRollFlow`.
- Expose the shared phase and elapsed time in a stable evidence node. Include `cup`, `rolling`, `result-hold`, and `exiting`.

## 15. Tests

### 15.1 Shared timeline tests

- Cup stage has no automatic end.
- No roll exists before activation.
- Normal timeline orders flight, two contacts, settle, number entry, 2.5-second hold, and exit.
- Reduced motion keeps the 2.5-second hold.
- Completion becomes true only after exit.
- Negative elapsed time clamps safely.

### 15.2 Die orientation tests

- Generate exactly 24 unique rotational cube orientations.
- Every rotation record maps the six face identities to six cube directions exactly once, even though a rendered frame shows only three faces.
- Opposite pairs remain `1–6`, `2–5`, and `3–4`.
- Every rendered `(top, left, right)` triple belongs to the 24 triples generated by proper rotations of canonical top `1`, left `2`, right `3`.
- No reflected triple is accepted.
- Hidden faces are implied by the fixed opposite pairs; do not require a three-visible-face frame to draw all six faces.
- Each final result from `1` through `6` has a valid canonical orientation.
- Tumble sequences finish on the requested top face.
- Visual sequencing does not change domain PRNG state.

### 15.3 Audio tests

- Shake starts once when the cup is ready.
- Shake repeats while the cup is active.
- Shake stops and rewinds on `ROLL IT`.
- Shake stops when muted or unmounted.
- Landing plays once at the main impact.
- Re-rendering and smoke pinning do not replay landing.
- Both player volumes respect and clamp the global SFX value.
- FFmpeg measurement proves each production cue gains at least `3 LU`, targets `-16 LUFS`, and stays at or below `-1.5 dBTP`. Loudness range is out of scope because both cues are shorter than three seconds.

### 15.4 Interaction tests

- Double activation commits one roll.
- Action Check can cancel only before the roll.
- Escape cannot cancel during flight or result hold.
- Final live-region text is announced once.
- Focus enters and exits correctly.
- Tab and Shift+Tab remain inside both consumer dialogs before and after `ROLL IT`.

### 15.5 Alarm integration tests

- Snooze enters the cup stage without consuming PRNG.
- `ROLL IT` advances PRNG once.
- The saved state contains the advanced PRNG.
- Save retry keeps the same dice.
- Grade bands remain exact.
- World entry waits for roll completion and save success.

### 15.6 Action Check integration tests

- Existing preview facts remain visible before the roll.
- `ROLL IT` commits one Action Check.
- The shared total is the raw dice sum.
- Existing modifier, target, and success logic remain unchanged.
- Existing consequence begins after shared completion.
- Existing modifier arithmetic, success/failure text, Continue action, Escape result behavior, and named focus restoration remain intact.

### 15.7 Art and runtime verification

- Rebuild the cup and dice assets twice and compare hashes.
- Verify transparent pixels contain no hidden RGB data.
- Verify declared bounds and anchors.
- Run focused Jest tests and `npm run typecheck`.
- Run `npm run export:web`.
- Use the approved hidden Electron capture path with audio muted before load.
- Capture the cup stage, mid-flight, main impact, settled dice, large number, and post-flow consumer state.
- Update `startResponsiveSmokeGame` and `beginWorldSmoke` in `electron/main/index.ts` to press snooze, wait for `#dice-roll-flow-roll`, press it, and only then wait for the committed roll and `SAVED GEN 1`.
- Update `scripts/verification/hidden-window-capture.ts` with the same two-step snooze then `ROLL IT` startup.
- Use `window.siWorldPinDiceRollFlow(timeMs)` for deterministic mid-flight, impact, settled, and number captures. Release with `window.siWorldPinDiceRollFlow(null)` before waiting for completion. Do not use sleep-only capture timing.
- Do not open a visible Electron window during routine verification.

## 16. Acceptance criteria

- [ ] Both current dice consumers use one shared flow component and timeline.
- [ ] The alarm does not roll until `ROLL IT` is activated.
- [ ] The cup is deterministic KinderGrimm production art.
- [ ] The cup visibly shakes with motion lines under normal motion.
- [ ] The shake effect repeats only while the cup stage is active.
- [ ] Both dice enter from below the screen.
- [ ] The dice visibly tumble through valid physical orientations.
- [ ] Both final top faces match the committed result.
- [ ] The dice make several readable contacts and settle near the middle.
- [ ] One landing sound and clear visual impact cues occur at the main impact.
- [ ] Both production effects meet the measured loudness target, and their runtime gains exceed the current alarm’s `0.34 × sfx` gain while respecting SFX settings.
- [ ] The raw sum appears large and holds fully visible for 2.5 seconds.
- [ ] Consumer-specific consequences start after the shared flow exits.
- [ ] Double input cannot reroll or replay one-shot effects.
- [ ] Reduced motion removes shaking, flight, spin, and bounce but keeps result timing.
- [ ] Alarm save failure cannot reroll.
- [ ] Action Check rules and outcomes remain unchanged.
- [ ] Focus, keyboard, live-region, and compact-window checks pass.
- [ ] Deterministic art checks, focused tests, typecheck, web export, and hidden Electron captures pass.

## 17. Rollout and compatibility

- This is a presentation refactor plus one new prop asset and two supplied SFX assets.
- It does not require a save schema migration.
- Existing saves remain compatible.
- Existing domain events keep their current shape.
- The old `DiceRollCanvas` may be evolved in place or wrapped by the shared flow.
- Preserve existing approved dice appearance where possible while adding valid orientation frames.
- Remove obsolete duplicated roll timelines only after both consumers use the shared flow.

## 18. Assumptions

- “The number” means the raw sum visible on the two dice.
- “Correct sides” means standard physical `d6` opposite-face and adjacency rules.
- “A few rolls” means readable contacts and rebounds, not a physics simulation.
- The two supplied MP3 files are approved source effects.
- The current alarm grade bands remain required after the shared roll.
- The current Action Check preview and domain rules remain required.
- Future visible rolls use `2d6` unless a later request expands this component.

## 19. Open questions

No product choice blocks implementation. Timing and cup scale may receive small visual tuning after review without changing the flow contract.

## 20. Council review record

- Round 1: Grok 4.6 at `xhigh` and Opus completed. Confirmed findings were applied for smoke startup, atlas evidence, cube chirality, consumer state, capture pinning, focus containment, and measurable audio.
- Round 2: Opus completed. Its confirmed findings were applied for hidden smoke timing, pin release, alarm commit recovery, short-cue loudness measurement, and duplicate announcements.
- Round 2: Grok returned schema filler. The wrapper rejected it with exit code `6`. No retry or third round was used.
