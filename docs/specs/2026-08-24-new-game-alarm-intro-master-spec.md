# New Game Alarm Intro: Master Spec

Date: 2026-08-24

Status: Council review complete after exactly two rounds; implementation not started

## 1. Goal

Replace the current new-game jump into the world with one short alarm intro.

After the player presses START, show a very large alarm clock at `7:00`. The alarm repeats until the player presses its large snooze button. Snooze commits one `2d6` roll. The screen shows a grade, fades out, and opens the vampire's home with the vampire visible.

This intro applies only to a new game. A loaded save skips it.

## 2. Exact player sequence

1. The player completes `NewGameFlow` and presses START.
2. The alarm intro fills the screen. The world is not mounted behind it.
3. The clock face reads `7:00`.
4. A large arrow points at the clock's largest button.
5. Text above the arrow reads exactly `HIT SNOOZE!`.
6. Sound-emission lines appear on both sides of the clock.
7. The supplied alarm sound starts at once, then restarts every 2.5 seconds.
8. The player presses the snooze button.
9. The sound stops immediately. The same press commits one `2d6` roll.
10. The existing dice animation shows the two committed dice and their total.
11. The grade appears with the exact text in section 5.
12. After a short hold, the whole intro fades out.
13. The world opens inside `protagonist_villa`, centered on the vampire at its real starting tile.

There is no separate ROLL or CONTINUE button. Snooze is the only roll commit.

## 3. Alarm screen

Add one full-screen `AlarmIntroOverlay` owned by `GameScreen`.

Use the existing deterministic alarm recipe in `src/render/pencil/alarm-clock.ts`. Change its brief, display, and review assertion from `7:30` to `7:00`. Keep the existing front view and dominant snooze button.

The current `drawTime` incorrectly draws four digits. Replace that hard-coded sequence with this three-glyph layout on the existing 96 by 66 front canvas:

- draw `7` at `x=26`, `y=26`;
- draw the colon at `x=41`, with dots centered at `y=32` and `y=39`;
- draw the first `0` at `x=46`, `y=26`;
- draw the second `0` at `x=60`, `y=26`.

Declare this display sequence and its positions once in the recipe. `drawTime` and the review builder must read that same data. This centers `7:00` inside the existing display rectangle and prevents metadata from disagreeing with the pixels.

At runtime:

- Bake the front frame once.
- Put its RGBA bytes into a DOM canvas.
- Scale the canvas with nearest-neighbor sampling.
- Target about `88vw`, with a height cap for short screens.
- Keep the whole clock visible on phone, tablet, and desktop layouts.
- Do not add an image library or a second alarm asset pipeline.

The clock is the dominant object. The snooze button must remain the largest button on it. The visible button uses the recipe geometry. Center a transparent Pressable on the recipe's snooze anchor and expand only its hit area to at least 44 by 44 CSS pixels. The expanded hit area must not overlap another action.

The arrow points down to the snooze button. `HIT SNOOZE!` sits above the arrow. The arrow and text cannot cover `7:00`.

The sound-emission lines pulse while the alarm is active. With reduced motion, they remain visible but static.

The alarm recipe is currently marked `review`. Regenerate its review sheet after changing the time. The builder must assert the three glyphs and their positions, then compare repeated bakes for deterministic bytes. Visual approval must confirm that the baked pixels read `7:00` before calling the art final. This does not require a new character-art interview.

## 4. Alarm audio

Source file:

`/Users/joemacprom5/Library/Mobile Documents/com~apple~CloudDocs/sounds/notification-sound-269266.webm`

Verified source facts:

- WebM with Opus audio
- 48 kHz stereo
- 3.142 seconds
- 42,610 bytes
- SHA-256 `a2c98f255bb7d3361419221351559f721450f034f886a9d80ef106b8cb34f614`

Copy the source bytes unchanged to:

`assets/source/audio/sfx_alarm_clock.webm`

Use the installed `expo-audio` player. Do not create overlapping players.

Playback rules:

- Start at alarm time `0 ms`.
- At `2500 ms`, pause the same player, seek it to zero, and play again.
- Repeat at `5000 ms`, `7500 ms`, and later 2.5-second boundaries.
- On snooze or unmount, clear the 2.5-second timer permanently. Then pause and seek the same player to zero.
- On app background, disabled audio, or zero SFX volume, pause and seek to zero, and suspend the pending timer without ending the alarm state.
- When the app becomes active or audible again before snooze, play immediately and start a fresh 2.5-second cadence.
- At each boundary, recheck active app state, `audioEnabled`, and SFX volume before playing or scheduling the next boundary.
- Respect `audioEnabled` and the current SFX volume.
- A zero SFX volume stays silent.
- The START gesture arms browser audio before this screen appears.

The source is longer than 2.5 seconds. Pausing, seeking, and restarting the same player intentionally cuts off its tail. This meets the requested 2.5-second repeat without overlapping sounds or leaving a scheduled restart alive.

The Electron content policy already permits self-hosted media. Still verify WebM import and playback with the real web export and packaged hidden smoke. Transcode only if one of those real checks fails. Do not add a second format speculatively.

## 5. Dice roll and grade

Reuse the existing Action Check dice artwork and animation. Do not copy its canvas code into the alarm overlay.

Extract only the reusable dice stage needed to display an authoritative dice pair. Keep the current Action Check behavior and timing unchanged.

Extract a small domain helper from `resolveActionCheck`:

`rollTwoDice(prng) -> { dice: [left, right], total, prng }`

It must restore the supplied PRNG state, call `nextInt(6) + 1` twice in left-to-right order, and return the advanced snapshot. `resolveActionCheck` must call this helper and then apply its existing modifier, target, and success rule.

The alarm roll is raw `2d6`. It has no modifier, target, success state, reroll, or critical rule.

Grade the total with one exhaustive function:

| Total | Exact grade text |
|---:|---|
| 2–4 | `Bad` |
| 5–8 | `okay` |
| 9–12 | `Good` |

Show both the numeric total and the grade. Preserve the lower-case `okay` exactly.

Disable the snooze action synchronously on its first activation. Pointer, touch, Enter, Space, and repeated events cannot create a second roll.

## 6. Seed and persistence

The roll is authoritative within the running new-game session. It becomes durable when the first save succeeds.

Change `createInitialState` to accept an optional seed. Keep `0x51_57_01` as its default so existing domain tests remain deterministic.

Production START obtains one unsigned 32-bit seed with `crypto.getRandomValues`. Smoke mode supplies the fixed default seed. Do not use `Math.random`.

Delay the first save until after snooze:

1. START creates the initial state in memory and opens the alarm.
2. Snooze calls `rollTwoDice` once.
3. Replace the state's PRNG snapshot with the returned advanced snapshot.
4. Start the first `requestSave` with expected generation `null`.
5. Run the dice animation while the save is in progress.
6. Fade to the world only after the result hold is complete and the save succeeded.

The grade does not need a new persisted field or event. The advanced PRNG snapshot is the durable effect. The grade is introductory feedback only.

Interruption rules:

- If the app closes before snooze, no save exists. START appears again next time.
- If it closes after snooze but before the first save succeeds, no durable game exists. START appears again and a new roll is allowed.
- If it closes after the first save, the loaded save skips the alarm. The roll cannot repeat because the advanced PRNG snapshot was saved.
- If saving fails, keep the committed dice and grade visible. Show `RETRY SAVE`.
- `RETRY SAVE` retries the same state and expected generation. It never rolls again.
- Loaded, migrated, incompatible, and corrupt save paths keep their current behavior.

Within one running session, snooze and every save retry use the same committed result. This uses the successful first save as the intro-completion marker. Do not add a schema flag, migration, or second save.

## 7. Time and world opening

Make `7:00` the actual new-game time.

Change the initial clock from `08:00` to `07:00`. Change the New Game arrival card to `DAY 1 · 07:00 · SUNWARD BAY`. This prevents the alarm from showing 7:00 and the world immediately jumping to 8:00.

Initial NPC placement must match 07:00. Replace the hard-coded 08:00 lookup in `createProductionNpcs` with the schedule block active at the supplied initial minute. The active block is the last block whose start is not after the minute, with wraparound to the previous day's final block. Pass 07:00 from `createInitialState`. Place Linda and `generic_resident` from the same active-block rule instead of hard-coding `linda_relax` and `generic_work`.

`insertMissingProductionCast` is the other `createProductionNpcs` caller. It must pass the loaded state's minute of day. On an already-current save, this repair path must remain a byte-level no-op.

The existing protagonist starts in `protagonist_villa` at the generated protagonist tile. Keep that location and tile authoritative.

Replace the current new-game camera override at `{ x: 22, y: 27 }` with the protagonist's actual starting tile. Keep the current close new-game zoom.

Remove the old `openingShowcase` cast and its opening-only interaction branches. The alarm intro replaces that opening. Do not create a second vampire, a parallel opening mode, or a new map.

When the fade completes:

- Mount `WorldScene` once.
- Show `northwest_residential` inside `protagonist_villa`.
- Center the camera on the protagonist.
- Use the existing protagonist vampire visual.
- Resume normal world input, time, audio, saving, and camera behavior.

## 8. Timing and motion

Normal-motion timing:

| Phase | Duration |
|---|---:|
| Alarm waits for player | Unbounded |
| Existing dice tumble | 1650 ms |
| Grade hold after dice settle | 900 ms |
| Full overlay fade | 500 ms |

The result can appear at the existing dice reveal point. Do not make the player wait for the save after the animation unless the save is still pending.

Reduced-motion timing:

- Sound lines are static.
- Dice settle within 180 ms using the existing reduced-motion path.
- Keep the grade readable for 900 ms.
- Replace the 500 ms fade with an immediate cut or the project's shortest reduced-motion transition.

## 9. Accessibility and input

The intro is a modal dialog.

- Dialog label: `Alarm clock showing 7:00. Hit snooze.`
- Button label: `Snooze alarm`.
- Focus the snooze button when the dialog mounts.
- Keep its hit target at least 44 by 44 CSS pixels.
- Enter and Space activate it.
- The dialog is non-dismissable. Escape and backdrop input do nothing and cannot unmount it.
- Hide the arrow and sound lines from accessibility APIs.
- Do not repeat alarm status through a live region every 2.5 seconds.
- After the roll commits, update the dialog label or announce the total and exact grade once.
- Keep text and button contrast readable over the clock and background.

After save failure, move focus to `RETRY SAVE` and announce the error once. Snooze and `RETRY SAVE` are the only actions in this dialog.

## 10. State shape

Extend `BootState` with one intro state rather than putting intro state inside `WorldScene`.

It needs only:

- the in-memory `WorldState`;
- presentation preferences;
- alarm phase;
- committed dice and grade, when present;
- save status and error;
- a guard that prevents a second roll.

Keep timer and player objects in component refs. Do not put interval handles or audio objects in game state.

Do not mount the full world behind the alarm. This avoids hidden world ticks, music, input, and camera work before the intro ends.

## 11. Existing files to change

Implementation should stay close to these paths:

- `src/application/GameScreen.tsx`
- `src/application/NewGameFlow.tsx`
- `src/domain/state/initial-state.ts`
- `src/domain/state/production-cast.ts`
- `src/domain/action-check.ts`
- the current Action Check dice overlay or its smallest reusable child
- one new alarm intro UI component
- `src/render/pencil/alarm-clock.ts`
- `scripts/art/build-alarm-clock-review.ts`
- `src/render/WorldScene.tsx`
- `electron/main/index.ts`
- `scripts/verification/hidden-window-capture.ts`
- `src/application/runtime/first-hour-golden.ts`
- `tests/fixtures/first-hour/golden.json`
- focused tests for these paths
- `assets/source/audio/sfx_alarm_clock.webm`

Do not add a dependency, save migration, second alarm renderer, or universal animation framework.

## 12. Tests

Add the smallest tests that prove these contracts:

### Domain

- `rollTwoDice` consumes exactly two PRNG draws in left-to-right order.
- The returned total equals both dice.
- `resolveActionCheck` keeps its existing modifier and success behavior.
- Grade boundaries are `2/4`, `5/8`, and `9/12`.
- Every integer from 2 through 12 returns one exact grade.
- Initial state is 07:00.
- Default seeds stay deterministic.

### Application and UI

- Empty save shows New Game; START shows the alarm instead of the world.
- Loaded save skips the alarm.
- The clock reads `7:00` and copy reads `HIT SNOOZE!`.
- Pure snooze state logic proves a double press commits one roll and one save.
- A pure alarm scheduler, tested with fake timers, proves starts at 0, 2500, and 5000 ms and cancels before cleanup.
- Snooze, unmount, background, disabled audio, and zero volume stop or suppress audio.
- Grade text preserves exact casing.
- Save failure keeps the result. Retry saves without rerolling.
- The world mounts only after save success and the result timing finishes.
- Pure timeline sampling proves reduced motion removes pulses and shortens dice/fade motion.
- Source assertions pin exact copy where a mounted component test is not already available.
- The hidden Electron path proves initial focus, the 44 by 44 hit area, non-dismissable Escape, one result announcement, decorative hidden nodes, double activation, and the world mount.
- Pure failure-state logic exposes `RETRY SAVE` as the focus target. A source assertion pins the matching focus effect. Do not add renderer save-fault injection only for this check.

Do not add a component-test dependency for this feature. Use pure exported helpers and the existing hidden Electron checks.

### Art and world

- Alarm baking is deterministic. The declared and rendered glyph layout is exactly `7:00`.
- The snooze anchor still falls inside the dominant button.
- New-game camera starts on the protagonist tile.
- The old opening cast is absent.
- The vampire visual is present inside the home.
- The New Game card says `DAY 1 · 07:00 · SUNWARD BAY`.
- Linda and the production cast start in their schedule block active at 07:00.

### Export and hidden Electron checks

- Run `npm run check:boundaries`.
- Run `npm run typecheck`.
- Run focused Jest tests, then the full Jest suite.
- Run `npm run export:web` to prove the WebM asset is bundled.
- Run the Electron unit tests.
- Update both packaged Electron start helpers, `startResponsiveSmokeGame` and `beginWorldSmoke`, to wait for `#alarm-intro-snooze`, activate it, wait for `SAVED GEN 1`, then wait for `#world-state`.
- Update `scripts/verification/hidden-window-capture.ts` to activate `#alarm-intro-snooze` after START, then continue waiting for `window.siWorld25dEvidence`. This HTTP path has no desktop bridge and must not wait for `SAVED GEN 1`.
- Run `npm run verify:first-hour`. Set its start minute from the initial state's clock, regenerate `tests/fixtures/first-hour/golden.json`, and confirm its Action Check dice after the time and schedule changes.
- Keep Electron smoke windows hidden and audio muted before content loads.
- Run the safe hidden 25d smoke checks that cover the changed startup path.
- Confirm every Electron process exits after each check.

Smoke mode uses the fixed seed. It must not depend on one random grade.

## 13. Acceptance criteria

The feature is complete when:

1. A new game opens the alarm before the world.
2. The large clock shows `7:00`.
3. `HIT SNOOZE!` and its arrow clearly point to the largest button.
4. Visible sound lines show that the clock is ringing.
5. The supplied sound restarts every 2.5 seconds until snooze.
6. Snooze stops sound and commits exactly one authoritative `2d6` roll.
7. Totals 2–4 show `Bad`, 5–8 show `okay`, and 9–12 show `Good`.
8. Save failure cannot reroll or lose the committed result within the running session. The result becomes durable after the first save succeeds.
9. After the short result sequence, the intro fades to the vampire inside its home.
10. The world clock and New Game card both begin at 07:00.
11. Existing Action Checks behave as before.
12. Loaded saves do not replay the intro.
13. Keyboard, touch, focus, reduced-motion, mute, and app-background behavior pass.
14. Web export and hidden Electron checks prove the supplied WebM works in the real build.
15. No new dependency, save migration, duplicate dice system, or duplicate vampire is added.

## 14. Council questions

Opus 5 and Grok 4.6 must check:

- whether delayed first save can lose or duplicate the roll;
- whether the PRNG seed and smoke override are deterministic where required;
- whether 07:00 conflicts with schedules or tests;
- whether the alarm audio loop can overlap, survive unmount, or bypass mute;
- whether existing dice code can be reused without changing Action Checks;
- whether the world opens on the real protagonist tile inside the home;
- whether the old opening showcase should be removed;
- whether the supplied WebM should remain unchanged unless real export fails;
- whether all user copy, grades, timing, accessibility, and reduced-motion rules are testable.

Only confirmed defects should change this spec. Larger frameworks and speculative fallbacks are out of scope.

## 15. Council audit record

### Round 1 — Opus 5 and Grok 4.6

Both reviewers returned `CHANGES_REQUIRED`.

Accepted fixes:

- define the actual three-glyph `7:00` render layout and validate it beyond the metadata string;
- clear the repeat timer before every audio cleanup and pause before each 2.5-second restart;
- state that a crash before the first successful save can start a new game and roll again;
- make the modal non-dismissable and add one result announcement;
- expand only the transparent snooze hit area to 44 by 44 CSS pixels;
- align Linda and the production cast with the schedule active at 07:00;
- update both the packaged Electron and HTTP hidden-window new-game helpers;
- update and run the first-hour golden gate;
- use pure helper tests and existing hidden Electron checks instead of adding a component-test dependency.

No round-1 finding required a dependency, save migration, second save, duplicate dice system, or new world opening.

### Round 2 — Opus 5 and Grok 4.6

Both reviewers returned `CHANGES_REQUIRED`.

Accepted final fixes:

- name both packaged Electron start helpers instead of referring to one helper;
- apply the 07:00 active-block rule to `generic_resident`;
- include `src/domain/state/production-cast.ts` and pass loaded time through its save-repair caller;
- test retry focus through pure state and source evidence instead of adding save-fault machinery;
- suspend and rearm the alarm cadence across background or mute instead of ending it before snooze.

The final spec incorporates every confirmed finding from both rounds. Per the requested two-round limit, these last edits were not sent through a third Council round.
