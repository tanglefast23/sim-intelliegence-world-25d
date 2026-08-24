# Action Check Dice: Master Spec

Date: 2026-08-23

Status: revised after one Opus and Grok audit round; KinderGrimm visual approval pending

## 1. Goal

Add a reusable Action Check for actions with uncertain success.

The player rolls two six-sided dice. The dice roll into the screen center and settle on the authoritative result.

The first Action Check is `protect_linda` in the Linda quest. `betray_linda` and `withdraw` remain immediate choices.

## 2. Player rule

The rule is:

`die one + die two + modifier >= target`

For `protect_linda`:

- Dice: `2d6`, with an unmodified range of `2–12`.
- Modifier: the existing `readinessScore`, from `0` to `4`.
- Target: `9`.
- Success: use the existing `linda_protected` effect.
- Failure: use the existing `injured_escape` effect.
- Exact ties succeed.
- There are no critical results, partial results, rerolls, or advantage rules.

The success chances are:

| Readiness | Needed on 2d6 | Success chance |
|---:|---:|---:|
| +0 | 9+ | 10/36, 27.8% |
| +1 | 8+ | 15/36, 41.7% |
| +2 | 7+ | 21/36, 58.3% |
| +3 | 6+ | 26/36, 72.2% |
| +4 | 5+ | 30/36, 83.3% |

A later roll consumes new random values. A fair roll can repeat an earlier pair.

## 3. Full decision surface

Pressing `PROTECT LINDA` opens the Action Check overlay. It does not roll yet.

Before ROLL, the overlay shows:

- `ROLL 2d6 · RANGE 2–12`
- `READINESS +N`
- Health, Confidence, First Aid, and Security Report as ready or missing
- `TARGET 9`
- `SUCCEED IF 2d6 + N >= 9`
- The exact success chance as both a fraction and percentage
- Success stakes: Linda protected, reward, relationship changes, faction change, NPC result, and witness or police result
- Failure stakes: injured escape, Health loss, time loss, no reward, relationship changes, and witness or police result
- ROLL and CANCEL buttons

CANCEL closes the overlay without changing game state or PRNG state.

The Journal card must teach the same rule before the overlay opens. Replace the current guaranteed `PREDICTED` result and `READINESS N/4` threshold copy with:

- `ACTION CHECK · 2d6 + N VS 9`
- `CHANCE X/36 · Y%`
- a short success-stakes line
- a short failure-stakes line

Remove the authored statement that good preparation guarantees success and poor preparation guarantees failure. No player-facing surface can describe the retired binary readiness gate.

Re-author the persisted success and failure `reason` strings in both quest JSON copies. They must describe the Action Check result without claiming the player was prepared or unprepared.

## 4. Authoritative outcome

Only domain code can roll the dice.

The Action Check helper restores `createPrng(state.prng)`. It calls `nextInt(6) + 1` twice in this fixed order:

1. Left die
2. Right die

It returns:

- `dice: [left, right]`
- `modifier`
- `target`
- `total`
- `success`
- the advanced PRNG snapshot

The `protect_linda` approach owns a small authored Action Check definition. It contains `dice: "2d6"`, `modifier: "readiness"`, and `target: 9`.

Add the optional definition to the strict `QuestApproachSchema`. Add the same authored data to both quest JSON copies:

- `content/quests/linda-boyfriend.json`
- `src/domain/quests/linda-boyfriend.json`

Remove the retired `readiness.minimumScore` field from the strict readiness schema and both JSON copies. The Action Check target replaces that threshold.

The quest schema must also enforce the current content invariant:

- `protect_linda` has the `2d6` readiness Action Check and a defeat effect.
- `betray_linda` and `withdraw` have neither an Action Check nor a defeat effect.
- The target is an integer.

Invalid content must fail during content validation, not during the player action.

`planLindaQuestOutcome` uses this definition. It selects the existing success or defeat effect from the roll result.

The reducer commits the advanced PRNG state and quest consequences together. The `linda-quest-resolved` event stores an optional nested `actionCheck` record.

Optional event data keeps old saved ledgers valid. No world-state field, schema bump, or save migration is required. Old terminal events without `actionCheck` data stay historical and never reopen the Action Check.

The UI never calls `Math.random`. It animates the values from the committed domain event.

## 5. Commit and interruption rules

ROLL is the single commit point.

When ROLL is pressed:

1. Disable ROLL and CANCEL.
2. Cancel current player movement.
3. Resolve and commit the domain command once.
4. Start the major-quest autosave.
5. Animate the committed dice.
6. Show the total and result.
7. Enable CONTINUE.

If the command throws while the quest is still active and no matching event exists, do not animate. Close the overlay, keep the quest available, and show the existing `QUEST BLOCKED` feedback. PRNG state remains unchanged.

If the quest is already terminal, the Journal offers no Action Check action. A current protect resolution must include `actionCheck`; a missing record is an invariant error. Never describe a committed terminal quest as still available.

The overlay blocks world input, movement updates, and world ticks while open.

If saving fails, the roll still stays authoritative in memory. The normal save failure message remains visible after CONTINUE.

If the app closes after ROLL, the saved quest outcome remains authoritative. Version one does not resume an interrupted roll animation.

## 6. Visual design and KinderGrimm production method

The dice are one deterministic KinderGrimm object family. Authoring and baking happen only in the canonical `Sim Intelliegence World 25d` checkout. The current checkout ships the Action Check overlay.

All art-authority paths below are relative to the canonical `Sim Intelliegence World 25d` checkout.

Authority order:

1. This spec.
2. `docs/art/kindergrimm-asset-authoring.md`.
3. `docs/art/kindergrimm-upstream.md`.
4. Pinned KinderGrimm source commit `de339ad739d8cbd28ff2dd4a940af38c0ede86c8`.
5. SI World's active pencil `Sketch`, graphite medium, layout, and nearest object recipe.
6. `docs/art/halcyra-art-bible.md` for scale, light, depth, contact, and placement.

The production asset must come from a reviewed code recipe. Generic image generation can supply concept reference only. Hand-edited PNG files and the retired block-pixel dice geometry are not production sources.

The recipe records:

- asset ID, short brief, version, review status, and deterministic seed;
- source canvas size and transparent bounds;
- ground-contact point and ordered part list;
- warm bone, sand, brown, dark umber, and near-black brown material colors;
- one isometric die frame for each top value from `1` through `6`;
- one soft flight-shadow frame and one strong contact-shadow frame;
- stable top-face, center, and ground-contact layout anchors;
- no interaction anchor, collision footprint, or world depth split because the overlay dice are not clickable world props.

Each view uses simple authored masses, medium-owned tone, skin, and edge passes, and deterministic seeded pencil variation. The final output is a flat RGBA frame for the existing renderer.

After visual approval, the 25d builder exports two generated runtime files into this shipping checkout:

- `assets/generated/action-check-dice.png`: one atlas containing the six die frames and two shadow frames;
- `assets/generated/action-check-dice.json`: frame rectangles, anchors, pinned upstream commit, recipe SHA-256, and atlas SHA-256.

These generated files are locked runtime payloads, not hand-edited production sources. The shipping checkout does not copy or run the KinderGrimm `Sketch` pipeline. The overlay loads the atlas through the installed `expo-asset` package and uses the JSON frame map.

Visual requirements:

- Shape: small isometric cubes with top, left, and right faces visible.
- Style: low-resolution 2.5D pencil objects that remain clear at native `1x` scale.
- Body top: warm bone near `#F2E3C3`.
- Lit left face: sand near `#D4B98A`.
- Shaded right face: brown near `#9A744D`.
- Edge: dark warm umber near `#4A301F`, applied by the graphite medium.
- Pips: near-black brown near `#2B1A12`.
- Light: upper-left, with one restrained cream edge.
- Shadow: attached contact shadow below and to the right.
- Finish: matte, slightly worn, and visibly hand-drawn. No gloss, bloom, casino trim, or realistic texture.

The authoritative value is the top face. Side pips and tumble views are decorative and deterministic.

The overlay uses the existing dark plate, amber border, and Silkscreen font. The world dims under a warm translucent scrim.

The browser Canvas 2D API only composites the baked RGBA frames inside the React Native Web overlay. It does not draw the production dice geometry.

Before integration, generate one review sheet that shows all six die frames and both shadow frames at native `1x` and nearest-neighbor `3x` on dark and light backgrounds. Show transparent bounds and ground contact. Get visual approval before exporting the runtime files or replacing the current dice frames.

## 7. Animation

Normal motion lasts about `1,650 ms` before CONTINUE appears.

- `0–500 ms`: both dice enter from opposite upper sides on shallow downward arcs.
- Before landing, `frame = floor(elapsedMs / 90) % 6 + 1` selects the left die frame. The right die uses the same sequence offset by three frames.
- `0–780 ms`: the left die uses that fixed tumble sequence with the soft flight shadow.
- `0–900 ms`: the right die uses that fixed tumble sequence with the soft flight shadow.
- `780 ms`: the left die locks its authoritative face and lands.
- `900 ms`: the right die locks its authoritative face and lands.
- At landing, switch to the strong contact shadow. Compress only the die frame by two base-scale pixels for `70 ms`, then move it up two pixels for one `75 ms` rebound. Canvas performs these image transforms. It does not alter or redraw asset pixels. A landed die never changes face.
- `1,100 ms`: show `left + right + modifier = total`.
- `1,350 ms`: stamp `SUCCESS` or `FAILURE` with text and an icon.
- `1,650 ms`: enable CONTINUE.

The animation uses a monotonic presentation clock. It never changes the result.

Reduced motion skips entry, tumble, squash, and rebound. It shows settled dice and arithmetic immediately, the result by `120 ms`, and enables CONTINUE at `180 ms`.

No new sound file is required. Existing press and consequence sounds can play through the normal audio policy. Tests remain muted.

## 8. Responsive behavior

- Center the pair in the available game surface.
- Keep the decision copy above or beside the dice, based on available height.
- Keep all buttons at the existing minimum pointer target.
- Scale the pixel canvas at integer steps when space allows.
- On a small surface, reduce the die size before hiding any rule or stake text.
- Never cover ROLL, CANCEL, CONTINUE, or the result arithmetic.

## 9. Accessibility

- The complete rule and stakes exist as text before ROLL.
- ROLL, CANCEL, and CONTINUE are keyboard-focusable buttons with clear labels.
- The result is text and symbol based. Color is not the only signal.
- Focus moves to ROLL when the preview opens.
- Tab and Shift+Tab stay inside the overlay while it is open.
- World and Journal controls behind the scrim are disabled.
- Focus returns to PROTECT LINDA after CANCEL.
- If an active command fails and closes the overlay, focus returns to the still-mounted PROTECT LINDA button.
- After CONTINUE, focus moves to the still-mounted Journal close button.
- A blocked current resolution closes the overlay and returns focus to PROTECT LINDA.
- The result uses a polite live region. It announces both dice, modifier, total, target, and success or failure.
- Escape acts as CANCEL before ROLL. It does nothing during the roll. It acts as CONTINUE after the result is ready.
- Reduced motion keeps all information and removes the physical tumble.
- Canvas art is decorative. Accessible text carries the meaning.

## 10. Evidence and acceptance

Add `#world-action-check-state` as a hidden evidence node.

It reports:

- phase: `idle`, `preview`, `rolling`, or `result`
- check ID
- dice after commit
- modifier
- target
- total
- success
- reduced-motion state
- current PRNG cursor in every phase
- the complete preview summary before commit

Build the decision copy with a pure UI projection. The overlay, Journal card, accessibility text, and evidence node reuse that projection. Node-based Jest tests verify its range, modifier inputs, target, rule, odds, and both stakes without a component-rendering dependency.

Headless acceptance requires:

1. Opening and cancelling the preview does not change PRNG state.
2. A roll consumes exactly two saved PRNG values.
3. The same starting PRNG state produces the same dice and result.
4. The next check starts from the advanced PRNG state.
5. Each die stays in `1–6`.
6. A total equal to target succeeds.
7. Success and failure select the existing authored effects.
8. Non-check actions do not consume PRNG state.
9. The pure pre-roll projection and hidden preview evidence show range, modifier inputs, target, rule, odds, and both stakes.
10. Reduced motion shows the same final information without tumble.
11. Seeded Linda quest tests force and preserve both `linda_protected` and `injured_escape` branches.
12. The first-hour harness asserts left die `3`, right die `5`, readiness `+4`, and `linda_protected`. Regenerate its golden fixture without changing that successful opening-hour outcome.
13. Update the packaged Electron smoke so its Linda sequence presses PROTECT LINDA, ROLL, and CONTINUE before checking the resolved quest and save generation.
14. Content build/check, content validation, TypeScript, import boundaries, focused Jest suites, the first-hour replay, web export, and the packaged Electron smoke pass.
15. Add a smoke-only `window.siWorldPinActionCheck(timeMs)` hook. It pins the presentation clock without changing outcome data.
16. The Action Check capture pass forces no reduced motion and confirms `reducedMotion: false` in `#world-action-check-state`.
17. The exported pure timeline reports `showArithmetic` at `1,100 ms`, `showResult` at `1,350 ms`, and `canContinue` at `1,650 ms`. Reduced motion reports those states at `0 ms`, `120 ms`, and `180 ms`.
18. In the 25d checkout, recipe tests prove the same seed and frame regenerate byte-identical RGBA, all six faces and both shadows exist, transparent pixels have RGB `0,0,0`, and visible pixels stay inside declared bounds. The builder records the recipe and atlas SHA-256 values.
19. In this shipping checkout, a focused test confirms the committed atlas matches the manifest SHA-256 and that every manifest frame is inside the atlas.
20. The reviewed KinderGrimm sheet shows all six die frames and both shadow frames at native `1x` and nearest-neighbor `3x` on dark and light backgrounds, with transparent bounds and ground contact visible.
21. The hidden preview capture verifies the complete pre-roll decision surface; it does not require dice. Hidden Electron captures pinned at `450 ms`, `900 ms`, `1,100 ms`, `1,350 ms`, and `1,650 ms` verify mid-tumble, landing, arithmetic, result, and ready states. Captures must not use sleeps or take desktop focus.
22. Old saves containing terminal events without `actionCheck` data load without migration and offer no new Action Check.

## 11. Non-goals

- No general character skill system.
- No dice inventory or customization.
- No physics engine.
- No perspective camera or Three.js mesh dice.
- No new dependency.
- No online randomness.
- No LLM control over outcomes.
- No advantage, disadvantage, critical rules, rerolls, or partial success.
- No animation-resume state in version one.
