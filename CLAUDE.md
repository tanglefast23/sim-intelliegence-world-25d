# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Verification policy

`AGENTS.md` is authoritative for Electron testing. Protect the user's desktop.

- Use headless verification by default.
- Treat `npm run smoke:*`, `npm run test:electron`, and `npm run verify` as visible-window commands
  unless their background behavior is confirmed first.
- Do not run `npm run dev:harness` during routine testing. It opens a visible Electron window.
- When Electron fidelity is required, create hidden windows with `show: false`, disable background
  throttling when rendering matters, mute audio before content loads, and capture with
  `stayHidden: true`.
- Never use full screen, foreground input, audible sound, focus calls, `moveTop`, or always-on-top.
- Close every Electron process started by a test, including after failures.

In practice:

- Default to Jest, `tsc --noEmit`, and the `tsx` scripts under `scripts/`. They need no window.
- When real Electron behaviour is required, prefer a hidden renderer. Packaged smoke scripts drive
  a real `BrowserWindow` and may be visible, so do not run them routinely.
- Smoke runs drive the UI through `webContents.executeJavaScript` and `sendInputEvent`, not through
  the host keyboard or mouse. Keep it that way.

## `package-windows-x64` is red on main. It is not your change.

**Before debugging any CI failure, check whether `main` already fails it.**

```bash
gh run list --branch main --limit 5
gh run view <id> --json jobs --jq '.jobs[] | select(.conclusion=="failure") | .name'
```

`package-windows-x64` has failed **every recorded run** of this repository and has never passed. It
always fails the same step, `Verify Windows x64 packaged art-quality world subset`, with the same
message:

```
Camera motion never matched. Last label: Camera follow suspended; shake 0.24; shot none; queue 0
```

A green PR here means macOS green and Windows red. Do not treat Windows red as a regression, do not
revert work to chase it, and do not bury an unrelated fix for it inside a feature branch.

Two traps inside that one message, both of which cost real time:

- **It does not name which wait failed.** Five `waitForCameraMotion` calls share it. Assuming it is
  the first one produces a confident wrong diagnosis.
- **`shake 0.24` identifies the wait arithmetically.** Trauma starts at `0` and the smoke's only
  impulse is `0.8`, decaying at `1000 / IMPACT_MAX_DURATION_MS`. So `0.8 − 5.556t = 0.24` gives
  `t ≈ 101 ms`, which puts the freeze at the shake-decay wait, not the `follow armed` wait.

[AGENTS.md](AGENTS.md) carries the full diagnosis and the decision table for fixing it.

## Commands

```bash
npm ci                    # install locked deps (Node >= 22.13, npm 10.9.8)
npm run typecheck         # tsc --noEmit (renderer + shared)
npm test                  # jest --runInBand
npm run verify            # full gate with visible-window commands; run only when that behavior is allowed
npm run verify:ci-build   # the CI gate, minus the packaged smokes
```

Single test file or single case:

```bash
npx jest --runInBand --runTestsByPath tests/electron/security.test.ts
npx jest --runInBand -t "migrates a v5 envelope"
```

Electron build and packaged smokes (each needs a fresh package first):

```bash
npm run dev:harness       # visible dev harness; do not run during routine testing
npm run package:electron  # export:web + build:electron + electron-forge package
npm run smoke:electron    # packaged renderer readiness, screenshots, world/conversation evidence
npm run test:electron     # unit electron tests + package + package smoke + movement smoke
```

Other smokes: `smoke:natural-movement`, `smoke:art-quality`, `smoke:procedural-vfx`,
`smoke:responsive` (`:high-dpi`, `:qualification`), `smoke:presentation-restart`,
`smoke:save-migration`, `smoke:day-sweep`. Each accepts `-- --output-root <dir>`.

Generated-asset gates run the builder and then `git diff --exit-code`, so regenerated output must be
committed: `content:check`, `art:check`, `audio:check`, `proof:check`. To regenerate, run the
matching builder (`content:build`, `art:atlas`, `audio:build`, `proof:assets`).

## Architecture

**three.js here is a 2D compositor today. A 2.5D renderer is specified but not built.**
`rendererForEnvironment()` ([src/render/renderer-selection.ts](src/render/renderer-selection.ts))
currently returns the literal `'threejs-2d'`. Stage 0 of the 2.5D spec widens that union to
`'threejs-2d' | 'threejs-2-5d'`. Production stays on `'threejs-2d'` until the 2.5D acceptance gate
passes. The 2D path is the rollback path and must stay green.

The 2D path ([src/render/three/world-renderer.ts](src/render/three/world-renderer.ts)) draws
textured quads through an `OrthographicCamera` with `NearestFilter` on a generated sprite atlas,
compositing the ordered batches in `COMPOSITE_BATCHES`. Do not change it while 2.5D is in progress.

The 2.5D path will live in `src/render/three25/` and does not exist yet. It draws the same
`WorldFrameState` as box geometry under a tilted `OrthographicCamera`. **Boxes with authored
heights are allowed.** Heightmaps, displacement maps, imported models, perspective cameras, and
free camera orbit are not. Pixel rules are absolute: `NearestFilter`, integer scaling, flat
shading, no anti-aliasing. **Characters stay upright four-direction billboards in both renderers**
(`spec.md` line 319); no character sprite is redrawn and eight-direction art is out of scope. Only
world geometry becomes boxes. Shadow maps are allowed only in the 2.5D lit path, per spec section 8.7:
a no-lights fallback with flat blob shadows must also ship, hold 60 FPS, and carry its own packaged
smoke, and path selection is explicit rather than a runtime FPS probe.

**To take any location to a 10/10 render, follow
[docs/25d-scene-playbook.md](docs/25d-scene-playbook.md).** It carries the rating rubric, the
camera / geometry / colour / lighting / staging phases with their measured constants, the capture
loop, and a trap table where every entry cost a real capture round. Read its trap section before
changing any 2.5D art, not after.

See [docs/specs/2026-08-16-threejs-2-5d-renderer.md](docs/specs/2026-08-16-threejs-2-5d-renderer.md).
It supersedes the top-down renderer statements in `spec.md` (lines 66, 295) and amends the 2.5D and
lighting non-goals in `docs/specs/2026-08-14-threejs-2d-renderer-port.md` section 4.

**Three processes, one codebase.** The renderer is an Expo / React Native Web app exported to
`dist/` and loaded in Electron over a custom `app://game/` protocol
([electron/protocol/app-protocol.ts](electron/protocol/app-protocol.ts)) — never `file://` or HTTP.
Electron main owns the filesystem, save files, presentation preferences, and the bundled
`llama-server` child process. A narrow typed preload exposes `window.siWorldDesktop`, described by
[src/application/DesktopBridge.ts](src/application/DesktopBridge.ts); raw `ipcRenderer` is never
exposed.

**Layer purity is enforced, not conventional.** `src/domain` and `src/world` are pure roots.
`npm run check:boundaries` ([scripts/verification/import-boundaries.ts](scripts/verification/import-boundaries.ts))
fails the build if they import Node builtins, `electron`, `expo*`, React, React Native, `three`,
Skia, Reanimated, or `zustand`, or reach into `electron/`, `src/application/`, `src/render/`, or
`src/ui/`.
Simulation logic goes in the pure roots; effects go in `src/application/effects` behind ports.

Layer map:

| Path | Role |
|---|---|
| `src/domain` | Deterministic state, clock, quests, relationships, economy, save schema + migrations |
| `src/world` | Maps, pathfinding, movement, schedules, neighborhood transfers |
| `src/application` | Runtime tick, autosave, readiness gates, ports, top-level screens |
| `src/render` | three.js 2D and (planned) 2.5D world scenes, atlas, camera, VFX, evidence emitters |
| `src/ui` | HUD, panels, input surfaces, dev harness |
| `src/ai` | Conversation service, prompt projection, knowledge, Zod response schemas, inference adapters |
| `electron/` | Main, preload, IPC contracts, persistence, model supervisor, protocol, security |
| `scripts/` | `tsx` builders, smoke drivers, qualification evidence writers |

**Determinism is the contract.** State is seeded PRNG (`src/domain/prng.ts`,
`PRNG_VERSION` in [src/domain/version.ts](src/domain/version.ts)). The LLM proposes; validation in
`src/ai/validation` and `src/domain/consequences` decides. `verify:first-hour` replays a golden run.

**Content is authored JSON, then generated TypeScript.** `content/` holds authored registries, maps,
characters, and quests. `npm run content:build` emits `src/domain/state/generated-layout.ts`,
`src/world/transfers/generated-routes.ts`, `src/ai/registry/generated-browser-writing.ts`, and save
fixtures. Never hand-edit a file whose header says `Generated by scripts/...`.

**Saves are versioned envelopes.** Current chain is v1→v7 in `src/domain/state/migrations/`.
Writes go through [electron/persistence/write-queue.ts](electron/persistence/write-queue.ts) with a
checksum and recovery path. Adding a schema field means a new migration step plus fixtures under
`tests/fixtures/saves/`.

**Renderer evidence is DOM-visible on purpose.** The world exposes state through `aria-label` on
hidden nodes (`#world-state`, `#world-camera-state`, `#world-camera-motion-state`,
`#world-movement-state`, `#world-responsive-state`, `#world-vfx-state`, `#world-geometry-state`,
`#world-shooting-scene-state`, `#world-audio-caption`). Responsive smoke refreshes
its label from the live DOM before reading the same evidence. Changing a label format breaks smokes —
update both sides together.

**Model runtime.** One shared `llama-server` per session on loopback with a per-run port and key
([electron/model/](electron/model/)). Never one instance per NPC. The renderer never sees the URL or
key. Packaged model binaries live outside ASAR via `SI_WORLD_MODEL_RESOURCE_DIR` and resolve from
`process.resourcesPath`.

**Electron security is locked and tested.** [electron/main/security.ts](electron/main/security.ts)
pins `contextIsolation`, `sandbox`, `nodeIntegration: false`, `devTools: false`, denies new windows
and webviews, and rejects navigation outside `app://game`. `tests/electron/security.test.ts` guards
it; do not relax these to make debugging easier.

## Repository conventions

- [spec.md](spec.md) is the authoritative product and technical specification. Check it before
  changing behaviour, then `docs/specs/` for the feature-level spec and `docs/plans/` for the plan.
- Work is organised in numbered phases. Evidence lands in `artifacts/phase-NN/`; external reviews
  land in `audits/`. Historical evidence roots are write-protected by
  [scripts/verification/evidence-output.ts](scripts/verification/evidence-output.ts), so pass a new
  `--output-root` rather than overwriting an old phase.
- TypeScript is strict with `noUncheckedIndexedAccess`. There is no linter or formatter — match the
  surrounding style (two-space indent, `Readonly<{...}>` types, named exports).
- Electron main compiles separately via `electron/tsconfig.json` into `build/`; the root
  `tsconfig.json` excludes `electron/`. Run both `typecheck` and `build:electron` after touching
  shared code.
