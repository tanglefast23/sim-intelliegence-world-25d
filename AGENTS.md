# AGENTS.md

Authoritative for Electron testing and for CI failures that are not yours.

`CLAUDE.md` summarises this file. Where the two disagree, this one wins.

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

## `package-windows-x64` has never passed

**Check `main` before you debug any CI failure.**

```bash
gh run list --branch main --limit 5
gh run view <id> --json jobs --jq '.jobs[] | select(.conclusion=="failure") | .name'
```

Every recorded run of this repository has failed `package-windows-x64`, on the same step, with a
byte-identical message:

```
Verify Windows x64 packaged art-quality world subset without model qualification claims
SI_WORLD_SMOKE_FAILURE Error: Camera motion never matched.
Last label: Camera follow suspended; shake 0.24; shot none; queue 0
```

macOS ARM64 passes the same step. `package-macos-x64` and `package-macos-x64-functional` never run
it — only `ci.yml` lines 62 and 202 do, so "macOS is green" is not evidence that your change is
fine on that step.

**A green PR here means macOS green, Windows red.** That is the normal state. Do not revert work to
chase it, and do not fix it inside a feature branch — it predates every current branch.

### Reading that message without guessing

Two things make it misleading:

**It never says which wait failed.** Five `waitForCameraMotion` calls share the message — `follow
armed`, `follow suspended`, `shake 0.00`, `shot focus`, `shot queue drains`. Picking the first one
is how you get a confident wrong answer.

**`shake 0.24` tells you, arithmetically.** Trauma starts at `0` and the only impulse in the smoke
is `0.8`. Decay is `TRAUMA_DECAY_PER_SECOND = 1000 / IMPACT_MAX_DURATION_MS = 5.556/s`, so:

```
0.8 − 5.556 × t = 0.24   →   t ≈ 101 ms
```

The freeze is ~101 ms after that impulse, which is the **shake-decay** wait. Trauma above zero also
keeps `sampleCameraDirector` returning `active`, so the camera clock should still have been running.
Something stopped the frames.

### The three candidates, and how to tell them apart

- A lost WebGL context. `WorldScene.tsx` passes `disabled={rendererSuspended}` to `WorldInput`, and
  `rendererSuspended` is `rendererContextState !== 'ready'`. That kills all world input, `F`
  included.
- A dead `requestAnimationFrame`. Note that a lost context does **not** stop rAF — the renderer
  keeps scheduling frames and only skips drawing.
- A key that never reached the handler.

The message cannot separate them, which is why `waitForCameraMotion` now names its wait and, on
timeout only, reports the recovery overlay, frames observed in 500 ms, and document visibility.

Read one Windows log, then decide:

| Windows reports | Conclusion |
|---|---|
| `recoveryOverlay` present, or `framesIn500ms=0` | GPU or compositor. Apply the `package-macos-x64` precedent below |
| Context ready and frames alive, follow still suspended | A real Windows input bug. Moving the smoke would hide it |

### The precedent for a GPU-blocklisted runner

`ci.yml` around line 116 already documents this for `package-macos-x64`: that runner's GPU
blocklists WebGL 2, `Stage 0 task 19` forbids a software-rendering flag, so the job is qualified by
packaging, signing and a **recorded** WebGL 2 probe, and functional coverage moves to ARM64. The gap
is written down in `artifacts/threejs-2d/stage-7/INTEL-WEBGL2.md`.

If Windows turns out to be the same problem, apply the same shape. One thing to know first:
`scripts/qualification/__tests__/art-quality-final-manifest.test.ts:193-198` asserts that
`package-windows-x64` keeps `SI_WORLD_TIER_B_ART_SMOKE: '1'`, so moving the smoke off Windows fails
that test too.

## Known product bug, filed here so it is not lost

`WorldInput.handleKey` returns early on `disabled` **before** handling Escape. Because `disabled` is
`rendererSuspended`, a player whose GL context drops mid-conversation cannot press Escape to back
out; the overlay only offers `RESTORING GRAPHICS…`. Walk, pan and zoom should stay blocked. Escape
and Q should not.
