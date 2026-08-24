---
title: "Safely port camera fixes and 2.5D weather"
type: feat
date: 2026-08-24
source_repository: tanglefast23/sim-intelliegence-world
target_repository: tanglefast23/sim-intelliegence-world-25d
---

# Safely port camera fixes and 2.5D weather

## Goal

Transfer the useful non-dice work from the retired repository into the active `25d` project.

Deliver two separate pull requests:

1. A small camera and packaged-smoke bug-fix pull request.
2. A deterministic rain and snow pull request built for the 2.5D renderer.

Do not cherry-pick retired commits `81c3200` or `89d74bf`. Their surrounding code targets the retired renderer and older smoke harness.

## Hard boundaries

- Ignore every Action Check and dice file.
- Wait until the Action Check pull request is merged into `origin/main`.
- A local Action Check commit is not enough.
- Do not stash, reset, clean, switch, or reuse the current dirty checkout.
- Do not copy files from the dirty checkout into either transfer worktree.
- Start each pull request from the latest verified `origin/main`.
- Keep the camera fix and weather feature in separate pull requests.
- Do not run visible Electron commands on the user's desktop.

Protected Action Check paths include:

- `src/domain/action-check.ts`
- `src/ui/ActionCheckOverlay.tsx`
- `src/ui/action-check-copy.ts`
- `src/ui/__tests__/action-check.test.ts`
- `docs/plans/2026-08-23-feat-action-check-dice-plan.md`
- `docs/specs/2026-08-23-action-check-dice-*.md`

Shared files such as `WorldScene.tsx` and `electron/main/index.ts` can change only from a clean post-merge baseline.

## Current safety state

The active checkout is `codex/action-check-dice` at `002a043`. Pull request #24 is open.

The checkout also contains unrelated dirty KinderGrimm art work and this untracked plan. Do not
stage or commit the plan on the Action Check branch. Do not reuse that branch for transfer work.

Two transfer-adjacent files remain dirty from the separate art session:

- `src/render/three25/world-renderer-25.ts`
- `AGENTS.md`

The current `origin/main` snapshot is `1c92aa1`. It does not contain Action Check. This is evidence
only. It is not the transfer baseline.

## Grok 4.6 audit reconciliation

Confirmed and applied:

- Replace the impossible full-tile zero-pixel weather rule with strict world-space anchor clipping.
- Give the loading-shell wait an explicit timeout result and a unit test.

Rejected after local verification:

- The active checkout is not clean. It contains the in-progress Action Check and art work listed above.
- `bakeGroundStains()` is not limited to flat stains. Its `marks` input already bakes upright,
  camera-facing `VfxQuad` entries into the existing alpha batch.
- Running both transfers at once is not safer. One clean worktree at a time reduces overlap while
  another session owns the dirty Action Check checkout.

Second-audit safeguards applied:

- Never create the camera worktree from stale local `main`; use the recorded `origin/main` SHA.
- Use a named sibling worktree path and verify it does not exist first.
- Derive the interior screenshot inset from projected weather-quad bounds and require useful area.

## Step 1: Establish the clean baseline

1. Confirm the Action Check pull request is merged remotely.
2. Run `git fetch origin --prune` in the `25d` repository.
3. Record `git rev-parse origin/main`.
4. Record `git status --short --branch` in the dirty checkout.
5. Record `git worktree list --porcelain`.
6. Confirm the two proposed worktree paths do not exist.
7. Create only the camera worktree first, from the recorded SHA.

Camera worktree path:

```text
/Users/joemacprom5/Documents/Vibecode/Sim Intelliegence World 25d-camera-transfer
```

Creation command, where `<sha>` is the recorded post-Action-Check `origin/main` SHA:

```bash
git worktree add -b codex/port-camera-smoke-fixes \
  "/Users/joemacprom5/Documents/Vibecode/Sim Intelliegence World 25d-camera-transfer" \
  <sha>
```

Suggested branch:

```text
codex/port-camera-smoke-fixes
```

Do not create the weather worktree until the camera pull request is merged.

## Pull request A: Camera and smoke timing fixes

### Scope

Port only the missing root fixes from retired PR #35.

Keep the newer `25d` frame-driving waits. They are stronger than the retired versions.

### A1. Remove the camera's movement-only delta clamp

Change:

- `src/render/camera-motion.ts`
- `src/render/__tests__/camera-motion.test.ts`

Implementation:

- Remove the unused `MAX_MOVEMENT_FRAME_MS` import.
- Replace the `50 ms` clamp with `Math.max(0, input.deltaMs)`.
- Do not change either caller.
- Add one regression test using a `2,000 ms` frame.
- Prove the impact envelope finishes during that frame.
- Keep the existing negative-delta protection.

This shared fix covers:

- `src/render/WorldScene.tsx`
- `src/ui/dev-harness/shooting-scene.ts`

Do not add separate guards to those callers.

### A2. Remove the fixed loading-shell delay

Change:

- `electron/main/index.ts`
- `electron/main/smoke-capture.ts`
- `tests/electron/package-smoke.test.ts`

Implementation:

- Add a bounded, renderer-neutral `waitForLoadingShell()` in `smoke-capture.ts`.
- Poll for `#loading-shell` every `20 ms` for at most `400 ms`.
- Replace the fixed `150 ms` timer with that wait.
- Return `true` when the shell appears.
- Return `false` after `400 ms`; continue with the tolerant capture and report the observation as false.
- Keep `captureLoadingSmokeFrame()` as the capture authority.
- Keep all captures hidden with `stayHidden: true`.
- Unit-test both the observed and timed-out paths without starting Electron.

Do not change `waitForCameraMotion()` or `waitForCameraStill()`.

### A3. Make both screenshot comparisons use the observation flag

Current `25d` code still validates loading-versus-ready before it reads `SI_WORLD_SMOKE_LOADING_SHELL_OBSERVED`.

Change:

- `scripts/electron/package-smoke-utils.ts`
- `scripts/electron/run-package-smoke.ts`
- `tests/electron/package-smoke.test.ts`

Implementation:

- Parse the observation line before either screenshot comparison.
- Fail if the observation line is missing or malformed.
- Pass the boolean into `validateScreenshotEvidence()`.
- Reuse the existing `requireDifferentBytes` option.
- When the shell was not observed, allow identical valid PNGs.
- Always reject empty, invalid, or undersized PNGs.

### A4. Camera pull-request verification

Run only non-visible local checks:

```bash
npx jest --runInBand --runTestsByPath \
  src/render/__tests__/camera-motion.test.ts \
  tests/electron/package-smoke.test.ts
npm run check:boundaries
npm run typecheck
npm run build:electron
npm run test:electron:unit
npm test
```

Do not run these locally:

- `npm run smoke:electron`
- `npm run test:electron`
- `npm run verify`

Let CI run packaged Windows and macOS smokes. Require both to pass before merge.

### A5. Camera acceptance criteria

- [ ] A `2,000 ms` frame completes the impact envelope.
- [ ] The two existing camera-motion callers remain unchanged.
- [ ] The loading capture waits for the shell instead of sleeping `150 ms`.
- [ ] A loading shell that never appears times out after `400 ms` and follows the tolerant capture path.
- [ ] A fast boot can produce identical valid loading and ready images without failing.
- [ ] Missing observation evidence fails loudly.
- [ ] Invalid PNG evidence still fails.
- [ ] No existing frame-driving wait is replaced.
- [ ] Local unit, boundary, type, Electron build, and full Jest checks pass.
- [ ] Remote packaged-smoke CI passes.

## Step 2: Rebase safety before weather

After pull request A merges:

1. Fetch `origin` again.
2. Record the merged `origin/main` SHA.
3. Create a second clean worktree from that SHA.
4. Use branch `codex/port-weather-25d`.
5. Confirm no Action Check diff appears against the new baseline.

Weather worktree path:

```text
/Users/joemacprom5/Documents/Vibecode/Sim Intelliegence World 25d-weather-transfer
```

## Pull request B: Deterministic 2.5D weather

### B1. Preserve the product contract

Weather remains presentation-only.

It must add no:

- gameplay effects;
- save fields or migrations;
- presentation preferences;
- domain random-number calls;
- assets or dependencies;
- audio;
- network access;
- dynamic imports;
- asynchronous loading;
- second animation clock.

Update `spec.md` with one short paragraph that locks this boundary.

Do not copy the retired independent specifications, audits, or renderer plan.

### B2. Add the pure weather schedule and sampler

Add:

- `src/render/vfx/weather.ts`
- `src/render/vfx/weather-evidence.ts`
- `src/render/vfx/__tests__/weather.test.ts`
- `src/render/vfx/__tests__/weather-evidence.test.ts`

Reuse:

- `stableTupleHash()` from `src/world/presentation/material-selection.ts`;
- `VFX_STEP_MILLISECONDS` from `src/render/vfx/types.ts`;
- the retired seven-day `clear`, `rain`, and rare `snow` schedule;
- normal and reduced-motion caps of `64` and `16` marks.

Define every neutral-layer unit as a world pixel.

Each mark contains:

- `worldX` and `worldY` as its stable ground anchor;
- `heightAboveGround` as its falling position;
- glyph width and height;
- color and opacity.

Animate falling through `heightAboveGround`.

Do not move rain south across the ground. That old 2D movement becomes diagonal sliding in the tilted view.

Clear weather must return before grid sampling.

### B3. Add weather to the shared world frame

Change:

- `src/render/world-frame.ts`
- `src/render/__tests__/world-frame.test.ts`

Implementation:

- Select weather from `state.clock.absoluteMinute`.
- Use the existing ambient `vfxAgeStep`.
- Add optional `WorldFrameState.weather` data only when weather is active.
- Keep clear frame JSON and locked hashes unchanged.
- Reconstruct identical weather from the same saved time and VFX step.
- Do not write weather into saved state.

Clip only the currently revealed roof group's interior cells and doors tied to that group.

Visible roofs can still receive visible precipitation above them. Do not create dry holes over every roofed building.

Test entry and exit:

- weather is absent inside the revealed interior and matching doorway;
- weather returns after the player exits and the roof is restored.

### B4. Convert marks for the 2.5D renderer

Change:

- `src/render/three25/vfx-25.ts`
- `src/render/three25/__tests__/vfx-25.test.ts`

Implementation:

- Convert world pixels to tile units only in `vfx-25.ts`.
- Convert each mark into an upright, camera-facing `VfxQuad`.
- Clamp each mark above the floor.
- Put rain and snow in the existing alpha VFX batch.
- Reuse the `marks` input of `bakeGroundStains()`. That input already supports upright quads.
- Add no mesh, material, texture, pass, or draw call.

Do not change `src/render/three25/world-renderer-25.ts` unless a failing test proves the existing batch cannot carry the marks.

Do not change `src/render/three/world-renderer.ts`.

### B5. Reuse the ambient controller and publish strict evidence

Change:

- `src/render/WorldScene.tsx`
- `src/render/vfx/__tests__/world-scene-integration.test.ts`
- `scripts/verification/import-boundaries.ts`

Implementation:

- Reuse `advanceAmbientVfxClock()`.
- Do not add a weather clock or timer.
- Freeze weather when ambient VFX is paused or renderer-suspended.
- Make reduced-motion weather static from its first frame.
- Add `weather.ts` to the renderer-neutral boundary list.
- Publish validated weather evidence after the frame is built.
- Add a localhost-only `?testWeather=clear|rain|snow` override.
- Ignore that query outside `localhost` and `127.0.0.1`.

Do not add Electron preload or desktop-bridge weather plumbing.

### B6. Extend the existing hidden capture harness

Change:

- `scripts/verification/hidden-window-capture.ts`
- `package.json`

Add:

- an optional weather kind on each hidden scene request;
- a localhost `testWeather` query value;
- shot-time weather evidence;
- a small `smoke:25d:weather` script;
- an optional capture-wide reduced-motion switch for the reduced-motion run.

Make existing hidden scenes explicitly default to `clear`. This protects their locked captures from scheduled weather.

Keep the harness rules:

- `show: false`;
- `backgroundThrottling: false`;
- audio muted before content loads;
- `capturePage(..., { stayHidden: true })`;
- close every Electron process after success or failure.

### B7. Hidden weather evidence

Use the same map, minute, camera, zoom, and pinned VFX step for each paired comparison.

Capture:

1. Forced clear outdoors.
2. Forced rain outdoors.
3. Forced snow outdoors.
4. The same forced rain twice.
5. Forced clear and rain inside the revealed villa.
6. Forced clear and rain at its matching doorway.
7. Reduced-motion rain.
8. Rain on both fallback and lit shadow paths.

Derive interior and door masks from compiled map data and the current 2.5D projection. Do not hardcode screen rectangles.

Use world-space clipping as the source of truth:

- reject every mark whose ground anchor is inside the revealed roof group's interior cells;
- reject every mark whose ground anchor is inside a door cell tied to that roof group;
- assert those anchor sets are empty in `world-frame` tests;
- project each active weather quad's four vertices with the capture camera, including its
  `heightAboveGround`, and measure its screen-space bounds around the projected ground anchor;
- erode the projected interior mask by the maximum measured left, right, top, and bottom reach;
- require the inset mask to retain at least `25%` of the original interior pixels and at least
  `64` pixels; fail evidence setup if it does not;
- use structural anchor evidence for narrow door cells when that inset would be empty.

Use the already-installed PNG tooling. Add no image dependency.

Require:

- outdoor rain and snow differ from clear;
- repeated pinned rain PNGs have the same hash;
- the inset revealed-interior mask has zero changed pixels;
- revealed-interior and matching-door anchor sets contain no weather marks;
- reduced-motion rain is static and has at most `16` marks;
- normal rain and snow have at most `64` marks;
- both shadow paths show weather;
- draw calls do not increase against the paired clear frame;
- total and atlas calls stay within the checked-in ceilings.

The current ceilings are `DRAW_CALL_CEILING = 14` and `ATLAS_DRAW_CALL_CEILING = 5`. Tests must read the constants instead of copying these numbers.

### B8. Weather verification

Run focused checks first:

```bash
npx jest --runInBand --runTestsByPath \
  src/render/__tests__/world-frame.test.ts \
  src/render/vfx/__tests__/weather.test.ts \
  src/render/vfx/__tests__/weather-evidence.test.ts \
  src/render/vfx/__tests__/world-scene-integration.test.ts \
  src/render/three25/__tests__/vfx-25.test.ts
npm run check:boundaries
npm run typecheck
npm test
npm run export:web
npm run smoke:25d:weather
npm run measure:25d-draw-calls
npm run smoke:25d:fallback
npm run smoke:25d:lit
npm run verify:ci-build
```

The 2.5D capture and measurement commands use the hidden harness. Confirm this before running them.

Do not run `npm run verify` locally.

### B9. Weather acceptance criteria

- [ ] Schedule boundaries and seven-day rollover match the retired contract.
- [ ] A large time jump selects the destination slot directly.
- [ ] Identical saved time and VFX step reconstruct identical weather.
- [ ] Clear weather exits before sampling and adds no frame field.
- [ ] Rain and snow fall vertically in the 2.5D view.
- [ ] Panning keeps surviving world anchors stable.
- [ ] Paused and suspended weather does not advance.
- [ ] Reduced-motion weather is static and capped at `16` marks.
- [ ] Normal weather is capped at `64` marks.
- [ ] Revealed interiors and their matching doors contain no weather anchors.
- [ ] The safe inset of the revealed-interior screenshot contains no changed pixels.
- [ ] Weather returns after leaving the revealed interior.
- [ ] Weather uses the existing alpha batch.
- [ ] No draw call, mesh, material, pass, asset, or dependency is added.
- [ ] The legacy renderer remains unchanged.
- [ ] Save files and preferences remain unchanged.
- [ ] Focused, full, boundary, type, export, hidden-capture, and CI checks pass.

## Step 3: Remote closeout

Close each pull request independently.

For each pull request:

1. Confirm the worktree is clean.
2. Push the branch.
3. Verify local `HEAD` equals the remote branch SHA.
4. Wait for required CI checks.
5. Merge only after every required check passes.
6. Verify the merge commit is reachable from `origin/main`.
7. Remove only the transfer worktree after merge.

After both merges:

- verify the original dirty checkout still contains its owner's work;
- report both merge SHAs;
- report every check actually run;
- report any skipped visible or human checks;
- do not clean, commit, or include unrelated paths.

## Rollback

The two pull requests must remain independently revertible.

- Reverting camera fixes restores only camera and smoke timing behavior.
- Reverting weather removes only presentation data and rendering.
- Weather needs no save rollback because it adds no persisted data.

## References

- Retired camera PR: https://github.com/tanglefast23/sim-intelliegence-world/pull/35
- Retired weather PR: https://github.com/tanglefast23/sim-intelliegence-world/pull/36
- Existing ambient clock: `src/render/vfx/clock.ts`
- Existing 2.5D VFX adapter: `src/render/three25/vfx-25.ts`
- Existing hidden harness: `scripts/verification/hidden-window-capture.ts`
- Current draw-call ceilings: `src/render/three25/ceilings.ts`
