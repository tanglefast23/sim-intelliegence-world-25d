# AGENTS.md

Authoritative for Electron testing and for CI failures that are not yours.

`CLAUDE.md` summarises this file. Where the two disagree, this one wins.

## Character art policy

- Every character world body uses the 2.5D pencil method in
  `docs/art/character-sprite-design2.0.md`. This applies to the protagonist, named characters,
  ambient characters, and future characters.
- Never create, recast, or approve a `24x30` atlas character as a world-body deliverable. Existing
  atlas character cells are legacy compatibility data until the pencil migration removes them.
- Dialogue portraits use the existing vampire dialogue-portrait style. They are not pencil-body
  sheets. Keep each portrait and pencil body synchronized through one approved character brief.
- A named creature must use literal archetype anatomy before clothing or accessories are added.
  Do not draw a standard human skull, torso, arms, and legs, then add a creature symbol or costume.
  The brief must define the creature's skull or face, torso, limbs and ground contact, surface or
  material, and canonical archetype features. These rules apply to both the world body and portrait.
- A public-domain creature archetype can use its recognizable anatomy. Keep the interpretation
  original and do not copy the exact costume or silhouette of one film, game, or illustration.
- Mark human-template creature art as a rejected prototype. Do not call it approved or complete.
  Replace one character at a time and keep the rejected status until both body and portrait pass.
- The environment atlas remains active for ground, buildings, props, effects, and other world art.
  Do not interpret the character rule as permission to remove the environment atlas.
- A second pencil world identity requires Gate A in `character-sprite-design2.0.md`. Complete the
  authoring interview and obtain approval before starting that architecture work.
- For a multi-character request, complete and approve one character interview at a time. Reuse
  answers from an approved plan and ask the user only for missing creative decisions.

## Electron testing protects the user's desktop

An agent runs on someone's machine while they are using it. A window that steals focus, plays audio,
or goes full screen is a real interruption, not a test detail.

- Default to Jest, `tsc --noEmit`, and the `tsx` scripts under `scripts/`. None need a window.
- Treat `npm run smoke:*`, `npm run test:electron`, and `npm run verify` as **visible-window**
  commands unless you have confirmed otherwise by reading the script.
- Do not run `npm run dev:harness` during routine testing. It opens a visible window. Run it only
  when the user asks to see the app.
- When Electron fidelity is required, use a hidden window: `show: false`, `backgroundThrottling:
  false` when rendering matters, audio muted before content loads, and `capturePage` with
  `stayHidden: true`.
- Never use full screen, foreground input, audible sound, focus calls, `moveTop`, or always-on-top.
- Close every Electron process a test starts, including after a failure.

### Which smokes are safe to run

`scripts/verification/hidden-window-capture.ts` follows the hidden-window rules, so anything built
on it is safe. `smoke:25d:lit` and `smoke:25d:fallback` both use it — verified by reading, not
assumed.

Check before running anything else:

```bash
grep -n "show:\|stayHidden\|setAudioMuted" scripts/verification/hidden-window-capture.ts
```

## The Windows camera freeze — solved, and what it teaches

**Check `main` before you debug any CI failure.** That rule is evergreen:

```bash
gh run list --branch main --limit 5
gh run view <id> --json jobs --jq '.jobs[] | select(.conclusion=="failure") | .name'
```

`package-windows-x64` failed every recorded run of this repository until 2026-08-18 — always the
same step, always `Camera motion never matched ... shake 0.24`. Run `32065610791` was the first
fully green CI run in the repo's history. The fix chain is three commits on PR #3: `44b1afe`
(diagnostics), `70cb099` (the fix), `fdeef2a` (a job budget sized for a run that finishes).

### The durable lesson

**A hidden `BrowserWindow` on the Windows runner is not composited.** `requestAnimationFrame`
never fires while JS timers keep running. Measured there: `framesIn500ms=0` with
`documentHidden=false` and no lost-context overlay. macOS composites hidden windows; Windows does
not.

Consequences, and the rules they impose:

- Anything advancing on rAF — the camera clock, trauma decay, follow easing, pan flushing in
  `WorldInput` — freezes mid-flight and looks stable.
- **Any wait that polls renderer state without driving a frame will hang or lie.** A poll loop
  reading a frozen label sees the same value twice and calls it "settled". `waitForCameraStill`
  did exactly that: it returned a camera stopped mid-follow-ease, and the leftover ease leaked
  into the next pan measurement as `dx=-1.5`.
- `capturePage` is what forces a hidden window to produce a frame. `waitForRendererPaint` is the
  blessed helper (paired captures plus a rAF race); `waitForCameraMotion` and
  `waitForCameraStill` show the pattern: **paint first, then read**. `package-smoke.test.ts` pins
  the raw `capturePage` pattern to that one helper — reuse it, do not add bare calls.

### How it was diagnosed, kept as a worked example

The original error named neither the wait nor the cause, and five waits shared it. The tell was
arithmetic: trauma starts at 0, the only impulse is `0.8`, decay is `1000 / IMPACT_MAX_DURATION_MS
= 5.556/s`, so `0.8 − 5.556t = 0.24` puts the freeze ~101 ms after the impulse — the shake-decay
wait, not the first wait in the file. The first confident diagnosis (a lost GL context) was wrong,
and only instrumentation settled it: on timeout, `waitForCameraMotion` now names its wait and
reports the recovery overlay, frames observed in 500 ms, and document visibility. When a wait
fails, read that payload before theorising.

## Known product bug, filed here so it is not lost

`WorldInput.handleKey` returns early on `disabled` **before** handling Escape. Because `disabled` is
`rendererSuspended`, a player whose GL context drops mid-conversation cannot press Escape to back
out; the overlay only offers `RESTORING GRAPHICS…`. Walk, pan and zoom should stay blocked. Escape
and Q should not.
