# Action Check Dice: Independent Council Specs

Date: 2026-08-23

Council status: complete.

- Claude Fable 5, `xhigh`
- Claude Opus 5, `xhigh`
- Grok 4.6, `high`

All three reviewers received the same repository, request, and art brief. They worked independently.

## Shared request

Design two six-sided dice for uncertain action outcomes. The dice must match Halcyra's low-resolution isometric 2.5D world. They must roll into the screen center, settle smoothly, and show authoritative results. The first action is `protect_linda`.

## Claude Fable 5 candidate

- Rule: `2d6 + readiness >= 10`.
- `readiness` is the existing zero-to-four score.
- The player sees odds, inputs, target, and both outcomes before rolling.
- The domain consumes two values from saved `state.prng`.
- The result event stores both dice, modifier, target, total, and success.
- The overlay replays the committed result in about 1.4 seconds.
- Dice use pre-rendered, three-face isometric pixel sprites.
- Reduced motion shows settled dice almost at once.
- Old saves remain valid through optional event fields.

## Claude Opus 5 candidate

- Rule: `2d6 + readiness >= 8`.
- Natural 12 always succeeds. Natural 2 always fails.
- The decision surface appears before the roll.
- Saved `state.prng` is the only outcome source.
- The result is stored in the existing quest-resolution event.
- The overlay uses isometric pixel dice without a new rendering engine.
- Existing saves need no state-schema change.
- Tests cover deterministic replay, exact-threshold success, reduced motion, and complete pre-roll copy.

## Grok 4.6 candidate

- Rule: `2d6 + readiness >= 8`.
- No critical success, critical failure, or partial outcome.
- The player sees each readiness input and both consequence packages.
- The visual uses a three-face bone-colored cube with hard top-left light.
- The normal animation lasts about 1.5 seconds. Reduced motion skips travel and tumble.
- Grok proposed a separate committed-check state and a save-schema migration.
- The dice settle before the quest outcome is applied.
- A hidden evidence node supports headless checks.

## Orchestrator decisions

- Use target `9`. It keeps preparation important without making full preparation nearly automatic.
- Use no critical rules. The visible inequality remains the whole rule.
- Store the roll on the existing quest event. Do not add pending state or a save migration.
- Resolve and save when ROLL is pressed. The animation presents the committed event.
- Use procedural Canvas 2D pixel art. Do not add atlas work, 3D meshes, physics, or dependencies.
- A fair later roll can repeat a prior pair. The saved PRNG advances for every check.
- Pause local world input and ticking while the overlay is open.
