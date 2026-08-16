---
title: Three.js 2.5D renderer
type: feat
date: 2026-08-17
revision: 4
status: revised-after-three-audit-rounds
spec: docs/specs/2026-08-16-threejs-2-5d-renderer.md
gating: none — every decision is pre-made in section 1
---

# Three.js 2.5D Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second world renderer that draws the existing 2D world frame as tilted
low-resolution box geometry, without changing simulation, maps, saves, or character art.

**Architecture:** `src/render/three25/` consumes the same `WorldFrameState` the 2D renderer
consumes. `src/render/world-frame.ts` is never edited; `WorldScene.tsx` inflates the frame request
instead. Tiles map to the XZ plane, walls and props extrude to boxes, characters stay upright
billboards. The 2D renderer stays in the build as the rollback path.

**Tech Stack:** TypeScript strict with `noUncheckedIndexedAccess`, `three@0.185.1`, Jest
(`--runInBand`), `tsx` scripts, Expo / React Native Web, Electron.

**Spec:** `docs/specs/2026-08-16-threejs-2-5d-renderer.md` (revision 2, audited twice)

---

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include this section.

- **Frozen, never edited:** `src/domain`, `src/world`, `src/ai`, `content/`,
  `src/render/world-frame.ts`, `src/render/three/world-renderer.ts`.
- **Owned change files:**
  - `src/render/WorldScene.tsx` — frame inflation, picking, overlay anchors
  - `src/render/ThreeWorldSurface.tsx` — renderer mount branch
  - `src/render/GameSurfaceShell.tsx:130` — `webgl2Ready` gate
  - `src/render/camera-motion.ts` — clamp branches
  - `src/render/camera.ts` — additive only
  - `src/application/RendererReadiness.ts:92` — returned `rendererKind`
  - `electron/preload/index.ts:106` — smoke renderer whitelist
  - `electron/main/index.ts:120` — smoke renderer whitelist
  - `electron/ipc/contracts.ts:53` — readiness `rendererKind` literal

  **Revised after audit.** Revision 1 allowed one `electron/` line. That was unimplementable:
  `electron/main/index.ts:120` throws on an unknown renderer flag, and `contracts.ts:53` pins
  `rendererKind: z.literal('threejs-2d')`, so every packaged 2.5D smoke would have failed at
  startup. Packaged smokes are the only proof the 2.5D renderer actually draws, so the electron
  freeze widens rather than dropping them. These five extra files are the complete list — anything
  beyond them is a scope breach.
- `npm run check:boundaries` must pass after every task with no rule relaxed.
- Characters stay upright four-direction billboards. No character sprite is created or modified.
  `npm run art:check` must stay green with no regeneration.
- Save schema stays `v7`. No migration. No `layoutRevision` change.
- Pixel rules are absolute: `NearestFilter`, `generateMipmaps = false`, `flatShading: true`,
  integer scaling, no anti-aliasing, no PBR maps, no metalness above `0`.
- Box geometry only. No heightmaps, no displacement maps, no imported model files.
- Orthographic camera only. No perspective. No camera rotation or orbit.
- Production `rendererForEnvironment()` returns `'threejs-2d'` until final acceptance.
  The 2D renderer is the rollback path and its full test suite must stay green after every task.
- Two-space indent, `Readonly<{...}>` types, named exports. No linter or formatter in this repo —
  match surrounding style by hand.
- Commit after every task. Never commit with a red suite.

---

## 1. Pre-made decisions

The spec deferred four decisions to stage gates. This plan is ungated, so all four are made here.

| Decision | Value | Why | If you disagree later |
|---|---|---|---|
| Camera yaw | **`0`** | Yaw is the sole source of the hard projection math. At yaw 0 the ground projection is a two-line affine, clamping reuses `clampCamera`, and facing selection needs no change. | Task 11 leaves a spike-yaw screenshot for comparison. Switching costs roughly two to three weeks and rewrites Tasks 4, 13, 15, 16. |
| Camera elevation | **`40.65°`** | Derived from the spike camera: position `(8.2, 12.5, 11.5)`, target `(0, 0.2, -0.25)`, so elevation is `atan(12.3 / 14.33)`. | `GROUND_TILT_DEGREES` in Task 4 is a single tunable constant. Change it and rerun Task 4's tests. |
| Draw-call ceiling | **`40` total, `16` atlas** | The 2D spec's `24`/`12` cannot hold: the lit path adds a shadow pass and boxes add batches. `40` is provisional and deliberately generous. | Task 20 measures the real number and tightens the constant. |
| Shadow path default | **fallback (no lights)** | Deterministic, and it holds 60 FPS everywhere. The lit path ships alongside and is selected explicitly. | Flip `DEFAULT_SHADOW_PATH` in Task 22 after reading Task 20's frame report. |

**Assumption I am proceeding on:** the target look survives yaw `0`. The spike panel has yaw, so
the straight-on tilt will read differently. Task 11 renders both so you can judge in the morning.
Nothing blocks on it.

---

## 2. File structure

| File | Responsibility |
|---|---|
| `src/render/three25/projection.ts` | Ground-plane affine, tilt constants, tile↔screen at yaw 0 |
| `src/render/three25/recipes.ts` | Sprite-id → box recipe table, wall height |
| `src/render/three25/scene-builder.ts` | `WorldFrameState` → mesh descriptors, no three.js types |
| `src/render/three25/mesh-cache.ts` | Tile-window delta tracking, add/remove only |
| `src/render/three25/billboards.ts` | Instanced character quads, facing, district tint |
| `src/render/three25/occlusion.ts` | Wall→roof-group derivation, near-wall culling |
| `src/render/three25/lighting.ts` | Lit and fallback path descriptors, lamp-prop lights |
| `src/render/three25/world-renderer-25.ts` | three.js surface: camera, materials, draw loop |
| `src/render/three25/inflation.ts` | Viewport inflation used by `WorldScene.tsx` |
| `src/render/three25/__tests__/` | One test file per module above |

The mount point is **not** a new file. `src/render/ThreeWorldSurface.tsx:40` is the only place the
app constructs a renderer, and Task 11 Step 6 branches it. Without that branch nothing else in this
plan is observable.

`scene-builder.ts`, `projection.ts`, `recipes.ts`, `occlusion.ts`, and `inflation.ts` are pure —
no three.js import. That keeps most logic testable without a WebGL context. Only
`world-renderer-25.ts` and `billboards.ts` touch three.js.

---

# Stage 0 — Foundation

## Task 0: Revoke the shadow-map rule in writing

**Files:**
- Modify: `CLAUDE.md` (the 2.5D paragraph in `## Architecture`)
- Modify: `docs/specs/2026-08-14-threejs-2d-renderer-port.md` section 4

Spec section 4 requires this before the lit path may ship. No task did it, so Task 18 would have
built a shadow-map path that standing repo rules forbid. Documentation only — no code, no tests.

- [ ] **Step 1: Confirm what the rule currently says**

Run: `grep -n "Shadow maps are allowed" CLAUDE.md`

It reads "allowed only in the 2.5D lit path, per spec section 8.7". That is already the revocation
— `CLAUDE.md` was updated on 2026-08-17 alongside the spec. Confirm it, do not rewrite it.

- [ ] **Step 2: Confirm the port spec amendment**

Run: `grep -n "Amended 2026-08-17" docs/specs/2026-08-14-threejs-2d-renderer-port.md`

Section 4 carries an amendment banner naming the three items the 2.5D spec moves: the isometric or
perspective camera line, 2.5D room geometry, and dynamic lights or real-time shadow maps. Confirm
it is present.

- [ ] **Step 3: If either is missing, add it and commit**

If a grep returns nothing, the 2.5D folder is not the one those edits landed in. Write the
revocation before any later task builds a lit path:

```bash
git add CLAUDE.md docs/specs/2026-08-14-threejs-2d-renderer-port.md
git commit -m "docs: revoke the shadow-map ban for the 2.5D lit path"
```

If both greps hit, this task is already satisfied. Record that and move on — do not edit either
file again.

---

## Task 1: Widen `RendererKind` and add 2.5D selection

**Files:**
- Modify: `src/render/renderer-selection.ts:1-10`
- Modify: `src/render/__tests__/renderer-selection.test.ts:3-9`
- Test: `src/render/__tests__/renderer-selection.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `type RendererKind = 'threejs-2d' | 'threejs-2-5d'`;
  `rendererForEnvironment(input: { hostname: string; search: string; smokeMode: boolean; smokeRenderer?: RendererKind }): RendererKind`;
  `selectedRenderer(): RendererKind`

- [ ] **Step 1: Replace the stale test**

The existing test asserts there is only one renderer. Replace lines 3-9 of
`src/render/__tests__/renderer-selection.test.ts` with:

```ts
describe('renderer selection', () => {
  const base = { hostname: 'localhost', search: '', smokeMode: false } as const;

  test('production always gets the 2D renderer', () => {
    expect(rendererForEnvironment({ ...base, hostname: 'siworld.example' })).toBe('threejs-2d');
    expect(rendererForEnvironment({ ...base, hostname: 'siworld.example', search: '?testRenderer=2-5d' })).toBe('threejs-2d');
  });

  test('honours the local development override', () => {
    expect(rendererForEnvironment({ ...base, search: '?testRenderer=2-5d' })).toBe('threejs-2-5d');
    expect(rendererForEnvironment({ ...base, search: '?testRenderer=2d' })).toBe('threejs-2d');
    expect(rendererForEnvironment({ ...base, search: '?testRenderer=bogus' })).toBe('threejs-2d');
  });

  test('honours the packaged smoke override only in smoke mode', () => {
    expect(rendererForEnvironment({ ...base, hostname: 'siworld.example', smokeMode: true, smokeRenderer: 'threejs-2-5d' })).toBe('threejs-2-5d');
    expect(rendererForEnvironment({ ...base, hostname: 'siworld.example', smokeRenderer: 'threejs-2-5d' })).toBe('threejs-2d');
  });

  test('defaults to the 2D renderer with no window', () => {
    expect(selectedRenderer()).toBe('threejs-2d');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runInBand --runTestsByPath src/render/__tests__/renderer-selection.test.ts`
Expected: FAIL — `rendererForEnvironment` currently takes no arguments and returns a literal.

- [ ] **Step 3: Write the implementation**

Replace lines 1-10 of `src/render/renderer-selection.ts` with:

```ts
export type RendererKind = 'threejs-2d' | 'threejs-2-5d';

const RENDERER_QUERY: Readonly<Record<string, RendererKind>> = {
  '2d': 'threejs-2d',
  '2-5d': 'threejs-2-5d',
};

/**
 * Mirrors `toneMappingForEnvironment` below: the override is unsaved, local-or-smoke only, and
 * production always gets the shipping renderer. The 2D path stays the rollback path until the
 * 2.5D acceptance gate in docs/specs/2026-08-16-threejs-2-5d-renderer.md section 16 passes.
 */
export function rendererForEnvironment(input: Readonly<{
  hostname: string;
  search: string;
  smokeMode: boolean;
  smokeRenderer?: RendererKind;
}>): RendererKind {
  if (input.smokeMode && input.smokeRenderer) return input.smokeRenderer;
  const local = input.hostname === 'localhost' || input.hostname === '127.0.0.1';
  if (!local) return 'threejs-2d';
  const requested = new URLSearchParams(input.search).get('testRenderer');
  return (requested !== null ? RENDERER_QUERY[requested] : undefined) ?? 'threejs-2d';
}

export function selectedRenderer(): RendererKind {
  if (typeof window === 'undefined' || !window.location) return 'threejs-2d';
  return rendererForEnvironment({
    hostname: window.location.hostname,
    search: window.location.search,
    smokeMode: window.siWorldSmokeMode === true,
    smokeRenderer: window.siWorldTestRenderer,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --runInBand --runTestsByPath src/render/__tests__/renderer-selection.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Fix the readiness call sites**

`src/application/__tests__/renderer-readiness.test.ts` uses `'threejs-2d'` as fixture data only —
no change needed. Search for callers of the old zero-argument form:

Run: `grep -rn "rendererForEnvironment(" --include='*.ts' --include='*.tsx' src electron`
Update every call site to pass the input object. If a caller has no `window`, use `selectedRenderer()`.

- [ ] **Step 6: Run the full suite and boundaries**

Run: `npm test && npm run typecheck && npm run check:boundaries`
Expected: all green. The 2D path is untouched.

- [ ] **Step 7: Commit**

```bash
git add src/render/renderer-selection.ts src/render/__tests__/renderer-selection.test.ts
git commit -m "feat(render): widen RendererKind for the 2.5D path"
```

---

## Task 2: Accept `threejs-2-5d` in the preload whitelist

**Files:**
- Modify: `electron/preload/index.ts:105-108`
- Modify: `src/application/DesktopBridge.ts:51` (type only, if it narrows)
- Test: `tests/electron/security.test.ts`

**Interfaces:**
- Consumes: `RendererKind` from Task 1
- Produces: `window.siWorldTestRenderer?: RendererKind` accepting `'threejs-2-5d'`

This is one of three permitted `electron/` diffs. Task 2b changes the other two
(`electron/main/index.ts:120` and `electron/ipc/contracts.ts:53`). The Global Constraints list is
authoritative; do not stop at this file.

- [ ] **Step 1: Write the failing test**

Append to `tests/electron/security.test.ts`:

```ts
test('the preload renderer whitelist accepts both renderers and no dead values', () => {
  const source = readFileSync(join(__dirname, '../../electron/preload/index.ts'), 'utf8');
  expect(source).toContain("smokeRenderer === 'threejs-2d'");
  expect(source).toContain("smokeRenderer === 'threejs-2-5d'");
  expect(source).not.toContain("smokeRenderer === 'skia'");
});
```

If `readFileSync` and `join` are not already imported in that file, add them from `node:fs` and
`node:path`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runInBand --runTestsByPath tests/electron/security.test.ts`
Expected: FAIL — the file still contains `'skia'` and lacks `'threejs-2-5d'`.

- [ ] **Step 3: Edit the whitelist**

Replace line 106 of `electron/preload/index.ts`:

```ts
if (process.argv.includes('--si-world-smoke-mode=1') && (smokeRenderer === 'threejs-2d' || smokeRenderer === 'threejs-2-5d')) {
```

`'skia'` is dead — the 2D port's Stage 7 removed Skia.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --runInBand --runTestsByPath tests/electron/security.test.ts`
Expected: PASS.

- [ ] **Step 5: Build Electron main and run the full suite**

Run: `npm run build:electron && npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add electron/preload/index.ts tests/electron/security.test.ts
git commit -m "feat(electron): allow the 2.5D renderer in smoke mode"
```

---

## Task 2b: Unpin `threejs-2d` from main, contracts, and readiness

**Files:**
- Modify: `electron/main/index.ts:120`
- Modify: `electron/ipc/contracts.ts:53`
- Modify: `src/application/RendererReadiness.ts:92`
- Modify: `src/render/GameSurfaceShell.tsx:130`
- Test: `src/application/__tests__/renderer-readiness.test.ts`

**Interfaces:**
- Consumes: `RendererKind` from Task 1
- Produces: a readiness report that accepts either renderer kind

Four places hard-pin the 2D renderer. Every one of them fails a packaged 2.5D run. Fix all four in
one task — they are one logical change and splitting them leaves the build red between commits.

- [ ] **Step 1: Write the failing test**

Append to `src/application/__tests__/renderer-readiness.test.ts`:

The helper is `createRendererWorldReadyReport` (`src/application/RendererReadiness.ts:62`), used at
`src/application/__tests__/renderer-readiness.test.ts:35`. Revision 2 invented the name
`buildRendererReadyReport`; that does not exist.

Read `renderer-readiness.test.ts:29-40` and copy its exact call shape, then change only the kind:

```ts
test('accepts a 2.5D world readiness report', () => {
  const report = createRendererWorldReadyReport({
    // ...every field the neighbouring test passes, copied verbatim...
    rendererKind: 'threejs-2-5d',
  });
  expect(report.rendererKind).toBe('threejs-2-5d');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runInBand --runTestsByPath src/application/__tests__/renderer-readiness.test.ts`
Expected: FAIL — `RendererReadiness.ts:92` returns the literal `'threejs-2d'`.

- [ ] **Step 3: Widen the main-process whitelist**

`electron/main/index.ts:120` currently reads:

```ts
if (smokeRenderer !== undefined && (!smokeMode || !['skia', 'threejs-2d'].includes(smokeRenderer))) {
  throw new Error('Test renderer is available only to smoke runs as skia or threejs-2d.');
}
```

Replace with:

```ts
if (smokeRenderer !== undefined && (!smokeMode || !['threejs-2d', 'threejs-2-5d'].includes(smokeRenderer))) {
  throw new Error('Test renderer is available only to smoke runs as threejs-2d or threejs-2-5d.');
}
```

`'skia'` is dead here for the same reason it was dead in the preload.

- [ ] **Step 4: Widen the readiness contract**

`electron/ipc/contracts.ts:53`: change `rendererKind: z.literal('threejs-2d')` to
`rendererKind: z.enum(['threejs-2d', 'threejs-2-5d'])`.

Leave `webgl2Ready: z.literal(true)` and `worldFrameReady: z.literal(true)` alone. Both renderers
need a real WebGL 2 context and a presented frame; those are not renderer-specific.

- [ ] **Step 5: Thread the kind through readiness**

`src/application/RendererReadiness.ts:92` returns a hardcoded kind:

```ts
  return { ...common, rendererKind: 'threejs-2d', webgl2Ready: true };
```

Change it to return the measured `rendererKind` from its input instead of the literal.

**The input type must widen too.** `RendererReadiness.ts:65` currently declares
`rendererKind: 'threejs-2d'` as a literal. Revision 2 said "add it if it is not already there",
which an agent reads as "it is there, nothing to do" — and then Step 8's `npm run typecheck` fails,
because `'threejs-2-5d'` is not assignable to that literal. Change line 65 to
`rendererKind: RendererKind` and import the type from `src/render/renderer-selection`.

- [ ] **Step 6: Fix the `webgl2Ready` gate**

`src/render/GameSurfaceShell.tsx:130`:

```tsx
          webgl2Ready: rendererKind === 'threejs-2d' && canvas.getContext('webgl2') !== null,
```

That reports `false` for every 2.5D run, so readiness could never pass. Replace with:

```tsx
          webgl2Ready: canvas.getContext('webgl2') !== null,
```

The renderer-kind check added nothing — both renderers require WebGL 2.

- [ ] **Step 7: Run test to verify it passes**

Run: `npx jest --runInBand --runTestsByPath src/application/__tests__/renderer-readiness.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the full suite and build Electron**

Run: `npm run build:electron && npm test && npm run typecheck && npm run check:boundaries`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add electron/main/index.ts electron/ipc/contracts.ts src/application/RendererReadiness.ts src/render/GameSurfaceShell.tsx src/application/__tests__/renderer-readiness.test.ts
git commit -m "feat(render): unpin the renderer kind from readiness and main"
```

---

## Task 3: Capture the 2D baseline

**Files:**
- Create: `scripts/verification/capture-2d-baseline.ts`
- Create: `artifacts/phase-25d/stage-0/` (output)

**Interfaces:**
- Consumes: nothing
- Produces: `artifacts/phase-25d/stage-0/baseline.json` with `{ commit, renderer, drawCounts }`,
  where `drawCounts` is read from the world frame, not from a GPU counter

Every later performance claim compares against this file. Capture it before any 2.5D code exists.

**Corrected after audit.** Revision 1 promised `frameMs: { median, p95 }` and said "the smoke
driver fills it". No existing driver writes to this file, so that field would have stayed empty and
Task 22's "compare frame timings against the Task 3 baseline" would have compared against nothing.
This task now captures only what it can actually produce: `WorldFrameState.drawCounts`, which the
frame already computes. Frame timings come from the packaged smoke's own report in Step 4.

- [ ] **Step 1: Write the script**

```ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT_ROOT = process.argv.includes('--output-root')
  ? process.argv[process.argv.indexOf('--output-root') + 1]!
  : 'artifacts/phase-25d/stage-0';

function commitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

mkdirSync(OUTPUT_ROOT, { recursive: true });
writeFileSync(
  join(OUTPUT_ROOT, 'baseline.json'),
  `${JSON.stringify({ commit: commitSha(), renderer: 'threejs-2d', capturedAt: null }, null, 2)}\n`,
);
console.log(`Wrote ${join(OUTPUT_ROOT, 'baseline.json')}`);
```

Do not call `Date.now()` here; this repo's determinism rules forbid unseeded time in generated output. Step 4 replaces this stub body with the real capture.

- [ ] **Step 2: Add the npm script**

In `package.json` scripts, after `qualify:renderer`:

```json
"capture:2d-baseline": "tsx scripts/verification/capture-2d-baseline.ts",
```

- [ ] **Step 3: Run it**

Run: `npm run capture:2d-baseline`
Expected: `Wrote artifacts/phase-25d/stage-0/baseline.json`

- [ ] **Step 4: Capture `drawCounts` in process — do not run a packaged smoke**

Revision 2 called `npm run smoke:art-quality -- --output-root artifacts/phase-25d/stage-0/...`.
That **throws**. `scripts/electron/run-art-quality-package-smoke.ts:20-27` passes an
`allowedRootPrefixes` list to `resolveEvidenceOutputRoot`, and it contains only
`artifacts/phase-24/art-quality/phase-28-prototype` through `phase-32-final`. Any other root is
rejected by `scripts/verification/evidence-output.ts:60`. That smoke is also a 20-minute
visible-window suite, which is the wrong tool for a draw-count baseline.

Build the frame in process instead — no Electron, no window, no packaging:

```ts
import { WORLD_MAP_CATALOG } from '../../src/application/runtime/map-catalog';
import { createInitialState } from '../../src/domain/state/initial-state';
import { buildWorldFrameState } from '../../src/render/world-frame';

const frame = buildWorldFrameState(
  WORLD_MAP_CATALOG.northwest_residential,
  createInitialState(),
  {},
  'down',
  0,
);
writeFileSync(
  join(OUTPUT_ROOT, 'baseline.json'),
  `${JSON.stringify({ commit: commitSha(), renderer: 'threejs-2d', drawCounts: frame.drawCounts }, null, 2)}\n`,
);
```

`WorldFrameState.drawCounts` is `Readonly<Record<WorldLayer | 'total', number>>`, already computed
by the frame. This is the only number Task 22 compares against, and Task 22 says so.

Frame **timings** are not captured here and Task 22 must not claim them. The 2.5D frame report in
Task 20 measures its own timings against nothing but the 60 FPS floor.

- [ ] **Step 5: Commit**

```bash
git add scripts/verification/capture-2d-baseline.ts package.json artifacts/phase-25d/stage-0
git commit -m "chore(verify): capture the 2D renderer baseline before 2.5D work"
```

---

# Stage 1 — Static Villa

## Task 4: Ground projection at yaw 0

**Files:**
- Create: `src/render/three25/projection.ts`
- Test: `src/render/three25/__tests__/projection.test.ts`

**Interfaces:**
- Consumes: `CameraState`, `ViewportSize` from `src/render/camera`
- Produces:
  - `GROUND_TILT_DEGREES: number`
  - `GROUND_Z_SCALE: number`
  - `worldToScreenTilted(camera: CameraState, world: { x: number; y: number }): { x: number; y: number }`
  - `screenToWorldTilted(camera: CameraState, screen: { x: number; y: number }): { x: number; y: number }`
  - `screenToTileTilted(camera: CameraState, screen: { x: number; y: number }, tileSize?: number): TilePoint`
  - `tileCenterWorld(tile: TilePoint, tileSize?: number): { x: number; y: number }`

At yaw 0 the ground projection is a vertical scale and nothing else. World `y` (the 2D screen-down
axis) becomes scene `z` and compresses by `sin(elevation)`.

- [ ] **Step 1: Write the failing test**

```ts
import {
  GROUND_Z_SCALE,
  screenToTileTilted,
  screenToWorldTilted,
  tileCenterWorld,
  worldToScreenTilted,
} from '../projection';

const CAMERA = { x: 320, y: 256, zoom: 1 } as const;

describe('tilted ground projection at yaw 0', () => {
  test('compresses the depth axis and leaves the horizontal axis alone', () => {
    const screen = worldToScreenTilted(CAMERA, { x: 352, y: 288 });
    expect(screen.x).toBeCloseTo(32, 6);
    expect(screen.y).toBeCloseTo(32 * GROUND_Z_SCALE, 6);
  });

  test('screenToWorldTilted inverts worldToScreenTilted', () => {
    const world = { x: 417.5, y: 903.25 };
    const back = screenToWorldTilted(CAMERA, worldToScreenTilted(CAMERA, world));
    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.y).toBeCloseTo(world.y, 6);
  });

  test.each([1, 1.5, 2, 3] as const)('round-trips every tile centre at %ix', (zoom) => {
    const camera = { x: 0, y: 0, zoom };
    for (let y = 0; y < 48; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const tile = { x, y };
        const screen = worldToScreenTilted(camera, tileCenterWorld(tile));
        expect(screenToTileTilted(camera, screen)).toEqual(tile);
      }
    }
  });

  test('the depth scale matches the spike camera elevation', () => {
    // spike camera (8.2, 12.5, 11.5) -> target (0, 0.2, -0.25):
    // horizontal 14.33, vertical 12.3, elevation atan(12.3 / 14.33) = 40.65 degrees.
    expect(GROUND_Z_SCALE).toBeCloseTo(Math.sin((40.65 * Math.PI) / 180), 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/projection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { CameraState } from '../camera';
import type { TilePoint } from '../../world/maps/schema';

/**
 * Elevation of the 2.5D camera above the ground plane, in degrees.
 *
 * Derived from the spike camera in spikes/001-threejs-pixel-villa/scene.js: position
 * (8.2, 12.5, 11.5) looking at (0, 0.2, -0.25) gives a horizontal run of 14.33 and a rise of 12.3,
 * so the elevation is atan(12.3 / 14.33). This is the calibration knob for the whole 2.5D look —
 * lowering it deepens the view and raises the frame inflation cost in `inflation.ts`.
 */
export const GROUND_TILT_DEGREES = 40.65;

/** How much the depth axis compresses on screen. Horizontal is unscaled at yaw 0. */
export const GROUND_Z_SCALE = Math.sin((GROUND_TILT_DEGREES * Math.PI) / 180);

export function worldToScreenTilted(
  camera: CameraState,
  world: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  return {
    x: (world.x - camera.x) * camera.zoom,
    y: (world.y - camera.y) * GROUND_Z_SCALE * camera.zoom,
  };
}

export function screenToWorldTilted(
  camera: CameraState,
  screen: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  return {
    x: camera.x + screen.x / camera.zoom,
    y: camera.y + screen.y / (GROUND_Z_SCALE * camera.zoom),
  };
}

export function screenToTileTilted(
  camera: CameraState,
  screen: Readonly<{ x: number; y: number }>,
  tileSize = 32,
): TilePoint {
  const world = screenToWorldTilted(camera, screen);
  return { x: Math.floor(world.x / tileSize), y: Math.floor(world.y / tileSize) };
}

/**
 * Tile CENTRE, not corner. A corner is the shared boundary of four tiles, so flooring a projected
 * corner is float-flaky. Every round-trip assertion uses this.
 */
export function tileCenterWorld(
  tile: TilePoint,
  tileSize = 32,
): Readonly<{ x: number; y: number }> {
  return { x: tile.x * tileSize + tileSize / 2, y: tile.y * tileSize + tileSize / 2 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/projection.test.ts`
Expected: PASS, 7 tests (the `test.each` counts as 4).

- [ ] **Step 5: Commit**

```bash
git add src/render/three25/projection.ts src/render/three25/__tests__/projection.test.ts
git commit -m "feat(three25): ground projection at yaw 0"
```

---

## Task 5: Prop recipes and wall height

**Files:**
- Create: `src/render/three25/recipes.ts`
- Test: `src/render/three25/__tests__/recipes.test.ts`

**Interfaces:**
- Consumes: `ATLAS_INDEX` from `src/render/atlas`
- Produces:
  - `type BoxRecipe = Readonly<{ x: number; y: number; z: number; width: number; height: number; depth: number; tint?: string }>`
  - `type PropRecipe = Readonly<{ boxes: readonly BoxRecipe[]; consumes?: readonly string[] }>`
  - `WALL_HEIGHT_TILES: number`
  - `PROP_RECIPES: Readonly<Record<string, PropRecipe>>`
  - `FLAT_SPRITES: ReadonlySet<string>`
  - `recipeFor(spriteId: string): PropRecipe | undefined`

Units are tiles. A `1×1×1` box fills one tile footprint and stands one tile tall. `y` is the box
centre height above the floor.

- [ ] **Step 1: Write the failing test**

```ts
import { ATLAS_INDEX } from '../../atlas';
import { CONSUMED_SPRITES, FLAT_SPRITES, PROP_RECIPES, WALL_HEIGHT_TILES, isResolved, recipeFor } from '../recipes';

const LANDMARKS = Object.entries(ATLAS_INDEX.sprites)
  .filter(([, cell]) => cell.category === 'object-landmark')
  .map(([id]) => id);

describe('prop recipes', () => {
  test('the atlas still has landmark sprites to cover', () => {
    expect(LANDMARKS.length).toBeGreaterThan(0);
  });

  test('every landmark sprite resolves to a recipe, a consumed sibling, or an explicit flat entry', () => {
    const unresolved = LANDMARKS.filter((id) => !isResolved(id));
    expect(unresolved).toEqual([]);
  });

  test('every official multi-tile group has one owning recipe', () => {
    for (const [group, parts] of Object.entries(ATLAS_INDEX.multiTileCompositions)) {
      const ids = parts.map((part) => `tile.${part}`);
      const owners = ids.filter((id) => recipeFor(id) !== undefined);
      expect({ group, owners: owners.length }).toEqual({ group, owners: 1 });
      const consumed = recipeFor(owners[0]!)!.consumes ?? [];
      expect([...consumed].sort()).toEqual(ids.filter((id) => id !== owners[0]).sort());
    }
  });

  test('every recipe key exists in the atlas', () => {
    const orphans = Object.keys(PROP_RECIPES).filter((id) => !(id in ATLAS_INDEX.sprites));
    expect(orphans).toEqual([]);
  });

  test('every flat entry exists in the atlas', () => {
    const orphans = [...FLAT_SPRITES].filter((id) => !(id in ATLAS_INDEX.sprites));
    expect(orphans).toEqual([]);
  });

  test('no recipe is empty and no box has non-positive extent', () => {
    for (const [id, recipe] of Object.entries(PROP_RECIPES)) {
      expect(recipe.boxes.length).toBeGreaterThan(0);
      for (const box of recipe.boxes) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
        expect(box.depth).toBeGreaterThan(0);
      }
    }
  });

  test('wall height matches the spike', () => {
    expect(WALL_HEIGHT_TILES).toBeCloseTo(1.45, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/recipes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
export type BoxRecipe = Readonly<{
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  tint?: string;
}>;

export type PropRecipe = Readonly<{
  boxes: readonly BoxRecipe[];
  /** Sibling sprite ids this recipe already draws, so the builder skips them. */
  consumes?: readonly string[];
}>;

/** Matches the spike wall box height. See spikes/001-threejs-pixel-villa/scene.js:109. */
export const WALL_HEIGHT_TILES = 1.45;

const seat = (width: number, depth: number): BoxRecipe =>
  ({ x: 0, y: 0.18, z: 0, width, height: 0.36, depth });

/**
 * ponytail: hand-authored table, not generated. 62 landmark sprites is small enough that a
 * generator would cost more than it saves. If the landmark count passes ~200, generate it from a
 * content field instead.
 */
/**
 * Real atlas ids, verified against assets/generated/atlas-index.json. Every landmark sprite is
 * `tile.*` and 32x32 — there are no `object.*` ids in this atlas.
 *
 * Multi-tile objects are the norm, not the exception. Two-tile pairs use `-left` / `-right`;
 * four-tile groups use `-nw` / `-ne` / `-sw` / `-se`. The north-west or left sprite owns the
 * recipe and consumes its siblings, so the group draws as one object instead of two or four
 * disconnected boxes.
 */
export const PROP_RECIPES: Readonly<Record<string, PropRecipe>> = Object.freeze({
  // Two-tile pair running EAST. Boxes are offset from the LEFT tile's centre, so a 2-tile object
  // centres at x: 0.5, not x: 0. Revision 2 had the sofa at x: 0 and it sat half a tile west.
  'tile.sofa-left': {
    boxes: [
      { x: 0.5, y: 0.18, z: 0, width: 1.9, height: 0.36, depth: 0.85 },
      { x: 0.5, y: 0.52, z: -0.32, width: 1.9, height: 0.32, depth: 0.22 },
      { x: -0.38, y: 0.44, z: 0, width: 0.16, height: 0.5, depth: 0.85 },
      { x: 1.38, y: 0.44, z: 0, width: 0.16, height: 0.5, depth: 0.85 },
    ],
    consumes: ['tile.sofa-right'],
  },
  'tile.table-left': {
    boxes: [
      { x: 0.5, y: 0.46, z: 0, width: 1.9, height: 0.09, depth: 0.7 },
      { x: -0.28, y: 0.23, z: 0, width: 0.09, height: 0.46, depth: 0.6 },
      { x: 1.28, y: 0.23, z: 0, width: 0.09, height: 0.46, depth: 0.6 },
    ],
    consumes: ['tile.table-right'],
  },
  // The bed runs EAST, not south: content/maps/northwest.json places villa-bed as
  // tile.bed-head@0,0 and tile.bed-foot@1,0. Revision 2 extruded on z and drew it rotated 90
  // degrees into the neighbouring tile, in the exact interior Stage 1 targets.
  'tile.bed-head': {
    boxes: [
      { x: 0.5, y: 0.22, z: 0, width: 1.9, height: 0.44, depth: 0.9 },
      { x: -0.4, y: 0.55, z: 0, width: 0.12, height: 0.66, depth: 0.9 },
    ],
    consumes: ['tile.bed-foot'],
  },
  // Single tile.
  'tile.fixture-lamp': {
    boxes: [
      { x: 0, y: 0.05, z: 0, width: 0.26, height: 0.1, depth: 0.26 },
      { x: 0, y: 0.5, z: 0, width: 0.07, height: 0.8, depth: 0.07 },
      { x: 0, y: 1.0, z: 0, width: 0.32, height: 0.24, depth: 0.32 },
    ],
  },
  'tile.fixture-planter': {
    boxes: [
      { x: 0, y: 0.16, z: 0, width: 0.55, height: 0.32, depth: 0.55 },
      { x: 0, y: 0.55, z: 0, width: 0.7, height: 0.5, depth: 0.7 },
    ],
  },
  'tile.mooring-bollard': {
    boxes: [{ x: 0, y: 0.2, z: 0, width: 0.3, height: 0.4, depth: 0.3 }],
  },
  // Four-tile group. The north-west sprite owns it and consumes the other three.
  'tile.landmark-fountain-nw': {
    boxes: [
      { x: 0.5, y: 0.18, z: 0.5, width: 2.0, height: 0.36, depth: 2.0 },
      { x: 0.5, y: 0.6, z: 0.5, width: 0.5, height: 0.6, depth: 0.5 },
    ],
    consumes: [
      'tile.landmark-fountain-ne',
      'tile.landmark-fountain-sw',
      'tile.landmark-fountain-se',
    ],
  },
});

/** Sprites that stay flat floor decals on purpose. Not an oversight. */
export const FLAT_SPRITES: ReadonlySet<string> = new Set<string>([]);

export function recipeFor(spriteId: string): PropRecipe | undefined {
  return PROP_RECIPES[spriteId];
}

/** Every sprite some other recipe already draws. These need no recipe of their own. */
export const CONSUMED_SPRITES: ReadonlySet<string> = new Set(
  Object.values(PROP_RECIPES).flatMap((recipe) => recipe.consumes ?? []),
);

/**
 * Coverage rule. A landmark sprite is handled when it owns a recipe, is consumed by one, or is
 * deliberately flat. Revision 2's test missed the middle case, so every `-right` and corner sprite
 * counted as unresolved — and the only way to make it pass was to dump them into `FLAT_SPRITES`,
 * which would have drawn half of every sofa, table, bed, and fountain as a floor decal.
 */
export function isResolved(spriteId: string): boolean {
  return recipeFor(spriteId) !== undefined ||
    CONSUMED_SPRITES.has(spriteId) ||
    FLAT_SPRITES.has(spriteId);
}
```

**Use `ATLAS_INDEX.multiTileCompositions` as the work list.** The atlas already declares all 13
official groups (`assets/generated/atlas-index.json`), with part names lacking the `tile.` prefix:

```
sunward-sofa, sunward-table, sunward-fountain, harbor-ferry, parked-car-cyan,
parked-car-coral, harbor-cargo-crane, harbor-cargo-stack, harbor-pallet-rack,
sunset-market-canopy, sunset-produce-stall, sunset-food-stall, sunset-market-fountain
```

Every one needs exactly one owning recipe that consumes its siblings. The starter table above
covers three; the coverage test names the other ten.

- [ ] **Step 4: Run test to verify it fails on coverage**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/recipes.test.ts`
Expected: the coverage test FAILS and prints the unresolved sprite ids. That list is your work list.

- [ ] **Step 5: Fill the table until coverage passes**

For each id in the failure output, do exactly one of:

- **Owns a group** — add a recipe with `consumes` listing its siblings from
  `ATLAS_INDEX.multiTileCompositions`. Offsets are from the owning tile's centre, so a two-tile
  east-west object centres at `x: 0.5` and a 2×2 group centres at `x: 0.5, z: 0.5`.
- **Is consumed** — do nothing. `CONSUMED_SPRITES` resolves it automatically.
- **Stands alone** — add a single-tile recipe.
- **Is genuinely flat** — add it to `FLAT_SPRITES`. Use this only for ground markings, never to
  silence a failing sibling.

Check a sprite's footprint before choosing extents:

```bash
node -e "const a=require('./assets/generated/atlas-index.json'); console.log(a.multiTileCompositions)"
```

Rule of thumb: anything a character walks past should stand up; anything a character walks over
stays flat.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/recipes.test.ts`
Expected: PASS, 7 tests, `unresolved` and `orphans` both empty.

- [ ] **Step 7: Commit**

```bash
git add src/render/three25/recipes.ts src/render/three25/__tests__/recipes.test.ts
git commit -m "feat(three25): prop box recipes with two-way atlas coverage"
```

---

## Task 6: Frame inflation

**Files:**
- Create: `src/render/three25/inflation.ts`
- Test: `src/render/three25/__tests__/inflation.test.ts`

**Interfaces:**
- Consumes: `GROUND_Z_SCALE`, `WALL_HEIGHT_TILES`
- Produces: `inflatedViewport(viewport: ViewportSize, zoom: number): ViewportSize`

`world-frame.ts` culls to an axis-aligned tile rectangle from the 2D affine. At yaw 0 the tilted
view reaches `1 / GROUND_Z_SCALE` further down the depth axis, and wall tops project further still.
`WorldScene.tsx` asks for a taller viewport so the returned window covers what is actually drawn.

- [ ] **Step 1: Write the failing test**

```ts
import { GROUND_Z_SCALE } from '../projection';
import { inflatedViewport } from '../inflation';

const VIEWPORT = { width: 1280, height: 720 } as const;

describe('frame inflation for the tilted view', () => {
  test('leaves the horizontal axis alone at yaw 0', () => {
    expect(inflatedViewport(VIEWPORT, 1).width).toBe(VIEWPORT.width);
  });

  test('covers the depth stretch plus wall height', () => {
    const inflated = inflatedViewport(VIEWPORT, 1);
    expect(inflated.height).toBeGreaterThanOrEqual(VIEWPORT.height / GROUND_Z_SCALE);
  });

  test('adds more world rows at higher zoom, never fewer', () => {
    const low = inflatedViewport(VIEWPORT, 1);
    const high = inflatedViewport(VIEWPORT, 3);
    expect(high.height / 3).toBeGreaterThanOrEqual(VIEWPORT.height / 3 / GROUND_Z_SCALE);
    expect(low.height).toBeGreaterThan(high.height / 3);
  });

  test('returns whole pixels', () => {
    const inflated = inflatedViewport({ width: 1279, height: 719 }, 1.5);
    expect(Number.isInteger(inflated.width)).toBe(true);
    expect(Number.isInteger(inflated.height)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/inflation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { ViewportSize } from '../camera';
import { GROUND_Z_SCALE } from './projection';
import { WALL_HEIGHT_TILES } from './recipes';

const TILE_SIZE = 32;

/**
 * Over-fetching is cheap; void inside the view is a bug. This deliberately asks for more than the
 * exact footprint: the depth stretch, plus two tiles of wall-top headroom, plus the one-tile margin
 * `visibleTileBounds` already applies.
 *
 * ponytail: a flat conservative margin, not an exact projected bound. Tighten it only if Task 20's
 * frame report shows the extra placements actually cost frames.
 */
export function inflatedViewport(viewport: ViewportSize, zoom: number): ViewportSize {
  const headroomWorldPixels = (WALL_HEIGHT_TILES + 2) * TILE_SIZE;
  return {
    width: viewport.width,
    height: Math.ceil(viewport.height / GROUND_Z_SCALE + headroomWorldPixels * zoom),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/inflation.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it into `WorldScene.tsx`**

At `src/render/WorldScene.tsx:1364`, the `viewInput` object passes `viewport: surface`. Change it to:

```tsx
      viewport: renderer2_5d ? inflatedViewport(surface, renderCamera.zoom) : surface,
```

Add `renderer2_5d` above the `useMemo`, from the Task 1 selector:

```tsx
  const renderer2_5d = selectedRenderer() === 'threejs-2-5d';
```

Add `renderer2_5d` to the `useMemo` dependency array.

- [ ] **Step 6: Run the full suite**

Run: `npm test && npm run typecheck && npm run check:boundaries`
Expected: green. With the 2D renderer selected, `inflatedViewport` is never called, so every 2D
frame test is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/render/three25/inflation.ts src/render/three25/__tests__/inflation.test.ts src/render/WorldScene.tsx
git commit -m "feat(three25): inflate the frame request for the tilted footprint"
```

---

## Task 7: Scene builder — floors

**Files:**
- Create: `src/render/three25/scene-builder.ts`
- Test: `src/render/three25/__tests__/scene-builder.test.ts`

**Interfaces:**
- Consumes: `WorldFrameState` from `src/render/world-frame`
- Produces:
  - `type QuadDescriptor = Readonly<{ id: string; sprite: string; source: AtlasRectangle; x: number; z: number; width: number; depth: number; tint: string; opacity: number }>`
  - `type BoxDescriptor = Readonly<{ id: string; sprite: string; source: AtlasRectangle; x: number; y: number; z: number; width: number; height: number; depth: number; tint: string }>`
  - `type SceneDescriptor = Readonly<{ floors: readonly QuadDescriptor[]; boxes: readonly BoxDescriptor[] }>`
  - `buildFloorQuads(frame: WorldFrameState): readonly QuadDescriptor[]`

Pure. No three.js import — that keeps it testable without a WebGL context and keeps
`check:boundaries` quiet.

- [ ] **Step 1: Write the failing test**

```ts
import { buildFloorQuads } from '../scene-builder';
import { buildWorldFrameState } from '../../world-frame';
import { indoorFrame } from './fixtures';

describe('floor quads', () => {
  const frame = indoorFrame();

  test('emits one quad per floor placement', () => {
    expect(buildFloorQuads(frame)).toHaveLength(frame.floors.length + frame.groundDetails.length);
  });

  test('places quads on tile coordinates, not world pixels', () => {
    const first = buildFloorQuads(frame)[0]!;
    const source = frame.floors[0]!;
    expect(first.x).toBeCloseTo(source.tile.x, 6);
    expect(first.z).toBeCloseTo(source.tile.y, 6);
  });

  test('every quad is exactly one tile', () => {
    for (const quad of buildFloorQuads(frame)) {
      expect(quad.width).toBeCloseTo(1, 6);
      expect(quad.depth).toBeCloseTo(1, 6);
    }
  });

  test('carries the atlas source rect through unchanged', () => {
    expect(buildFloorQuads(frame)[0]!.source).toEqual(frame.floors[0]!.source);
  });
});
```

- [ ] **Step 2: Create the fixture helper**

`loadFixtureMap` and `loadFixtureState` do **not** exist in this repo. Revision 2 invented them.
Create `src/render/three25/__tests__/fixtures.ts` with the real pattern, copied from
`src/render/__tests__/world-frame.test.ts:32-37` and `:187`:

```ts
// WORLD_MAP_CATALOG lives in src/application/runtime/map-catalog.ts, NOT src/world/maps/catalog.ts.
// That file exports a builder, not the catalog.
import { WORLD_MAP_CATALOG } from '../../../application/runtime/map-catalog';
import { createInitialState } from '../../../domain/state/initial-state';
import { WorldStateSchema } from '../../../domain/state/schema';
import type { MovementDirection } from '../../atlas';
import { buildWorldFrameState, type WorldFrameState } from '../../world-frame';

export const FIXTURE_MAP = WORLD_MAP_CATALOG.northwest_residential;

/**
 * The default protagonist spawns at tile (18,18), which is INSIDE the villa
 * (interior x:9 y:8 w:16 h:16). So this frame always has `hiddenRoofGroupId` set to
 * 'protagonist-villa-roof' and `visibleRoofGroupIds` EMPTY — there is only one roof group on this
 * map. Do not write a test that reads `visibleRoofGroupIds[0]`; it is `undefined`.
 */
export function indoorFrame(facing: MovementDirection = 'down'): WorldFrameState {
  return buildWorldFrameState(FIXTURE_MAP, createInitialState(), {}, facing, 0);
}

/**
 * Same map, protagonist outside the villa, so no roof group is occupied.
 *
 * `worldPosition` is `{ mapId, tileX, tileY }` — not `{ x, y }`. Spreading the wrong keys compiles
 * and silently leaves the protagonist indoors, which makes Task 17's outdoor test fail with a
 * misleading count. Tile (17,25) is the outside variant used at `world-frame.test.ts:41-48`.
 */
export function outdoorFrame(facing: MovementDirection = 'down'): WorldFrameState {
  const initial = createInitialState();
  const outside = WorldStateSchema.parse({
    ...initial,
    protagonist: {
      ...initial.protagonist,
      worldPosition: { mapId: 'northwest_residential', tileX: 17, tileY: 25 },
    },
  });
  return buildWorldFrameState(FIXTURE_MAP, outside, {}, facing, 0);
}
```

**Every later task uses `indoorFrame()` or `outdoorFrame()`.** Replace every
`buildWorldFrameState(loadFixtureMap(), loadFixtureState(), {}, 'down', 0)` in Tasks 7 through 18
with `indoorFrame()`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/scene-builder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```ts
import type { AtlasRectangle } from '../atlas';
import type { WorldFloorPlacement, WorldFrameState } from '../world-frame';

export type QuadDescriptor = Readonly<{
  id: string;
  sprite: string;
  source: AtlasRectangle;
  x: number;
  z: number;
  width: number;
  depth: number;
  tint: string;
  opacity: number;
}>;

export type BoxDescriptor = Readonly<{
  id: string;
  sprite: string;
  source: AtlasRectangle;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  tint: string;
}>;

export type SceneDescriptor = Readonly<{
  floors: readonly QuadDescriptor[];
  boxes: readonly BoxDescriptor[];
}>;

function floorQuad(placement: WorldFloorPlacement): QuadDescriptor {
  return {
    id: placement.id,
    sprite: placement.sprite,
    source: placement.source,
    x: placement.tile.x,
    z: placement.tile.y,
    width: 1,
    depth: 1,
    tint: placement.color,
    opacity: placement.opacity,
  };
}

export function buildFloorQuads(frame: WorldFrameState): readonly QuadDescriptor[] {
  return [...frame.floors, ...frame.groundDetails].map(floorQuad);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/scene-builder.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/render/three25/scene-builder.ts src/render/three25/__tests__/
git commit -m "feat(three25): build floor quads from the world frame"
```

---

## Task 8: Scene builder — walls

**Files:**
- Modify: `src/render/three25/scene-builder.ts`
- Modify: `src/render/three25/__tests__/scene-builder.test.ts`

**Interfaces:**
- Consumes: `WALL_HEIGHT_TILES` from `./recipes`
- Produces: `buildWallBoxes(frame: WorldFrameState): readonly BoxDescriptor[]`

- [ ] **Step 1: Write the failing test**

Append to `src/render/three25/__tests__/scene-builder.test.ts`:

```ts
import { buildWallBoxes } from '../scene-builder';
import { WALL_HEIGHT_TILES } from '../recipes';

describe('wall boxes', () => {
  const frame = indoorFrame();

  test('emits one box per wall placement', () => {
    expect(buildWallBoxes(frame)).toHaveLength(frame.walls.length);
  });

  // Task 17 adds near-wall culling inside buildWallBoxes. When it does, it MUST update the
  // assertion above to subtract hiddenWallTiles(frame).size, or this test goes red at Task 17's
  // commit. The default fixture spawns the protagonist indoors, so culling is active.

  test('stands every wall at the same height, centred on its half', () => {
    for (const box of buildWallBoxes(frame)) {
      expect(box.height).toBeCloseTo(WALL_HEIGHT_TILES, 6);
      expect(box.y).toBeCloseTo(WALL_HEIGHT_TILES / 2, 6);
    }
  });

  test('keeps walls inside a one-tile footprint', () => {
    for (const box of buildWallBoxes(frame)) {
      expect(box.width).toBeLessThanOrEqual(1);
      expect(box.depth).toBeLessThanOrEqual(1);
    }
  });

  test('does not emit a box for a door tile', () => {
    const doorTiles = new Set(frame.doors.map((door) => `${door.tile.x},${door.tile.y}`));
    for (const box of buildWallBoxes(frame)) {
      expect(doorTiles.has(`${box.x},${box.z}`)).toBe(false);
    }
  });

  // This test is vacuous today and that is fine — it is a regression guard, not a discovery.
  // `compileWalls` (src/world/maps/compiler.ts:154-157) already skips opening tiles, so door
  // tiles never reach frame.walls. Keep the filter in the implementation anyway: it costs one
  // Set lookup and it stops a future frame change from putting walls back into doorways.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/scene-builder.test.ts`
Expected: FAIL — `buildWallBoxes` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/render/three25/scene-builder.ts`:

```ts
import { WALL_HEIGHT_TILES } from './recipes';

/**
 * One box per wall tile. Merging adjacent runs into longer boxes is a Task 20 optimisation, not a
 * correctness requirement — `adjacencyMask` is already on the placement when that time comes.
 *
 * ponytail: per-tile boxes, O(walls) meshes. Merge runs by mask if Task 20 shows a draw-call problem.
 */
export function buildWallBoxes(frame: WorldFrameState): readonly BoxDescriptor[] {
  const doorTiles = new Set(frame.doors.map((door) => `${door.tile.x},${door.tile.y}`));
  return frame.walls
    .filter((wall) => !doorTiles.has(`${wall.tile.x},${wall.tile.y}`))
    .map((wall) => ({
      id: wall.id,
      sprite: wall.sprite,
      source: wall.source,
      x: wall.tile.x,
      y: WALL_HEIGHT_TILES / 2,
      z: wall.tile.y,
      width: 1,
      height: WALL_HEIGHT_TILES,
      depth: 1,
      tint: wall.color,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/scene-builder.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render/three25/scene-builder.ts src/render/three25/__tests__/scene-builder.test.ts
git commit -m "feat(three25): extrude wall boxes from the world frame"
```

---

## Task 9: Scene builder — props from recipes

**Files:**
- Modify: `src/render/three25/scene-builder.ts`
- Modify: `src/render/three25/__tests__/scene-builder.test.ts`

**Interfaces:**
- Consumes: `recipeFor`, `FLAT_SPRITES` from `./recipes`
- Produces: `buildPropBoxes(frame: WorldFrameState): readonly BoxDescriptor[]`;
  `buildScene(frame: WorldFrameState): SceneDescriptor`

- [ ] **Step 1: Write the failing test**

```ts
import { buildPropBoxes, buildScene } from '../scene-builder';
import { FLAT_SPRITES, recipeFor } from '../recipes';

describe('prop boxes', () => {
  const frame = indoorFrame();

  test('emits one box per recipe box, offset to the prop tile', () => {
    const expected = frame.props.reduce(
      (total, prop) => total + (recipeFor(prop.sprite)?.boxes.length ?? 0),
      0,
    );
    expect(buildPropBoxes(frame)).toHaveLength(expected);
  });

  test('skips sprites consumed by a sibling recipe', () => {
    const ids = new Set(buildPropBoxes(frame).map((box) => box.id));
    for (const prop of frame.props) {
      const consumed = frame.props.some((other) => recipeFor(other.sprite)?.consumes?.includes(prop.sprite));
      if (consumed) expect([...ids].some((id) => id.startsWith(prop.id))).toBe(false);
    }
  });

  test('never guesses a box for an unknown sprite', () => {
    for (const prop of frame.props) {
      if (recipeFor(prop.sprite) === undefined) {
        expect(isResolved(prop.sprite)).toBe(true);
      }
    }
  });

  test('buildScene returns floors and every box source', () => {
    const scene = buildScene(frame);
    expect(scene.floors).toHaveLength(frame.floors.length + frame.groundDetails.length);
    expect(scene.boxes.length).toBe(
      buildWallBoxes(frame).length + buildPropBoxes(frame).length + buildRoofBoxes(frame).length,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/scene-builder.test.ts`
Expected: FAIL — `buildPropBoxes` is not exported.

- [ ] **Step 3: Write the implementation**

```ts
import { recipeFor } from './recipes';

export function buildPropBoxes(frame: WorldFrameState): readonly BoxDescriptor[] {
  const consumed = new Set<string>();
  for (const prop of frame.props) {
    for (const sibling of recipeFor(prop.sprite)?.consumes ?? []) consumed.add(sibling);
  }
  const boxes: BoxDescriptor[] = [];
  for (const prop of frame.props) {
    if (consumed.has(prop.sprite)) continue;
    const recipe = recipeFor(prop.sprite);
    if (recipe === undefined) continue;
    recipe.boxes.forEach((box, index) => {
      boxes.push({
        id: `${prop.id}#${index}`,
        sprite: prop.sprite,
        source: prop.source,
        x: prop.tile.x + 0.5 + box.x,
        y: box.y,
        z: prop.tile.y + 0.5 + box.z,
        width: box.width,
        height: box.height,
        depth: box.depth,
        tint: box.tint ?? prop.color,
      });
    });
  }
  return boxes;
}

/**
 * A roof group draws as one flat lid at wall height. The frame already removes the occupied
 * group's roofs, so anything still in `frame.roofs` should be drawn.
 */
export function buildRoofBoxes(frame: WorldFrameState): readonly BoxDescriptor[] {
  return frame.roofs.map((roof) => ({
    id: roof.id,
    sprite: roof.sprite,
    source: roof.source,
    x: roof.tile.x,
    y: WALL_HEIGHT_TILES + 0.06,
    z: roof.tile.y,
    width: 1,
    height: 0.12,
    depth: 1,
    tint: roof.color,
  }));
}

/**
 * Doors are a separate frame list from props (`world-frame.ts:965`), so nothing else draws them.
 * Without this, every villa doorway in Stage 1 is an open hole in the wall.
 *
 * A door is a low box filling the wall gap: full tile footprint, roughly two-thirds wall height,
 * with the existing door sprite as its face texture. Open doors draw shorter so the gap reads as
 * passable.
 */
export function buildDoorBoxes(frame: WorldFrameState): readonly BoxDescriptor[] {
  return frame.doors.map((door) => {
    const height = door.sprite.includes('open') ? WALL_HEIGHT_TILES * 0.25 : WALL_HEIGHT_TILES * 0.7;
    return {
      id: door.id,
      sprite: door.sprite,
      source: door.source,
      x: door.tile.x,
      y: height / 2,
      z: door.tile.y,
      width: 1,
      height,
      depth: 0.36,
      tint: door.color,
    };
  });
}

export function buildScene(frame: WorldFrameState): SceneDescriptor {
  return {
    floors: buildFloorQuads(frame),
    boxes: [
      ...buildWallBoxes(frame),
      ...buildPropBoxes(frame),
      ...buildDoorBoxes(frame),
      ...buildRoofBoxes(frame),
    ],
  };
}
```

Add one door test:

```ts
test('doors fill their gap and open doors sit lower', () => {
  const doors = buildDoorBoxes(frame);
  expect(doors).toHaveLength(frame.doors.length);
  for (const door of doors) expect(door.height).toBeLessThan(WALL_HEIGHT_TILES);
});
```

Update the `buildScene` count assertion to include `buildDoorBoxes(frame).length`.

**Roof lids, added after audit.** Revision 1 had no task building roof geometry at all, while
Stage 3's gate exercises roof hiding. Lids sit just above wall height so a roof reads as capping
its walls. Add one test:

```ts
test('roof lids sit above the walls and vanish with the occupied group', () => {
  for (const lid of buildRoofBoxes(frame)) expect(lid.y).toBeGreaterThan(WALL_HEIGHT_TILES);
  const inside = { ...frame, roofs: [] } as const;
  expect(buildRoofBoxes(inside)).toHaveLength(0);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/scene-builder.test.ts`
Expected: PASS, 14 tests (4 floors + 4 walls + 4 props + 2 roofs).

- [ ] **Step 5: Commit**

```bash
git add src/render/three25/scene-builder.ts src/render/three25/__tests__/scene-builder.test.ts
git commit -m "feat(three25): build prop and roof boxes from the recipe table"
```

---

## Task 10: Mesh cache with window-delta rebuild

**Files:**
- Create: `src/render/three25/mesh-cache.ts`
- Test: `src/render/three25/__tests__/mesh-cache.test.ts`

**Interfaces:**
- Consumes: `SceneDescriptor`, `BoxDescriptor`, `QuadDescriptor` from `./scene-builder`
- Produces:
  - `type CacheDelta = Readonly<{ added: readonly string[]; removed: readonly string[]; unchanged: number }>`
  - `class SceneCache { sync(scene: SceneDescriptor, mapHash: string): CacheDelta; clear(): void; size(): number }`

The frame returns a moving tile window, so its "static" lists change on every pan. Rebuilding all
geometry each frame fails the performance gate. The cache adds and removes only the delta.

- [ ] **Step 1: Write the failing test**

```ts
import { SceneCache } from '../mesh-cache';

const quad = (id: string) => ({
  id, sprite: 'tile.floor', source: { x: 0, y: 0, width: 32, height: 32 } as never,
  x: 0, z: 0, width: 1, depth: 1, tint: '#ffffffff', opacity: 1,
});
const scene = (ids: readonly string[]) => ({ floors: ids.map(quad), boxes: [] });

describe('scene cache', () => {
  test('adds everything on the first sync', () => {
    const cache = new SceneCache();
    const delta = cache.sync(scene(['a', 'b', 'c']), 'map-1');
    expect(delta.added).toEqual(['a', 'b', 'c']);
    expect(delta.removed).toEqual([]);
    expect(cache.size()).toBe(3);
  });

  test('an identical sync changes nothing', () => {
    const cache = new SceneCache();
    cache.sync(scene(['a', 'b']), 'map-1');
    const delta = cache.sync(scene(['a', 'b']), 'map-1');
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(delta.unchanged).toBe(2);
  });

  test('a one-tile pan touches only the delta', () => {
    const cache = new SceneCache();
    cache.sync(scene(['a', 'b', 'c']), 'map-1');
    const delta = cache.sync(scene(['b', 'c', 'd']), 'map-1');
    expect(delta.added).toEqual(['d']);
    expect(delta.removed).toEqual(['a']);
    expect(delta.unchanged).toBe(2);
  });

  test('a map change drops everything', () => {
    const cache = new SceneCache();
    cache.sync(scene(['a', 'b']), 'map-1');
    const delta = cache.sync(scene(['a', 'b']), 'map-2');
    expect(delta.added).toEqual(['a', 'b']);
    expect(delta.removed).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/mesh-cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { SceneDescriptor } from './scene-builder';

export type CacheDelta = Readonly<{
  added: readonly string[];
  removed: readonly string[];
  unchanged: number;
}>;

/**
 * Tracks which descriptor ids are currently realised as meshes.
 *
 * The world frame hands back a moving tile window, so its lists churn on every pan. Diffing by id
 * turns that churn into a small add/remove delta. The renderer owns the actual three.js objects;
 * this class only decides what changed.
 */
export class SceneCache {
  private live = new Set<string>();
  private mapHash: string | undefined;

  sync(scene: SceneDescriptor, mapHash: string): CacheDelta {
    const next = new Set<string>();
    for (const floor of scene.floors) next.add(floor.id);
    for (const box of scene.boxes) next.add(box.id);

    if (mapHash !== this.mapHash) {
      const removed = [...this.live];
      this.live = next;
      this.mapHash = mapHash;
      return { added: [...next], removed, unchanged: 0 };
    }

    const added: string[] = [];
    const removed: string[] = [];
    let unchanged = 0;
    for (const id of next) {
      if (this.live.has(id)) unchanged += 1;
      else added.push(id);
    }
    for (const id of this.live) if (!next.has(id)) removed.push(id);

    this.live = next;
    return { added, removed, unchanged };
  }

  clear(): void {
    this.live.clear();
    this.mapHash = undefined;
  }

  size(): number {
    return this.live.size;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/mesh-cache.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render/three25/mesh-cache.ts src/render/three25/__tests__/mesh-cache.test.ts
git commit -m "feat(three25): diff scene descriptors into add/remove deltas"
```

---

## Task 11: three.js surface and the yaw comparison

**Files:**
- Create: `src/render/three25/world-renderer-25.ts`
- Create: `scripts/verification/capture-yaw-comparison.ts`
- Test: `src/render/three25/__tests__/world-renderer-25.test.ts`

**Interfaces:**
- Consumes: `SceneCache`, `buildScene`, `GROUND_TILT_DEGREES`
- Produces:
  - `cameraForYaw(yawDegrees: number, distance: number): OrthographicCamera`
  - `createWorldRenderer25(canvas, atlasUrl, onReady, onContextStateChange, toneMapping, options?): Promise<WorldRenderer25>`
  - `type WorldRenderer25Evidence = { rendererKind: 'threejs-2-5d'; drawCalls: number; meshCount: number; yawDegrees: number }`
  - `type WorldRenderer25 = { setFrame(frame: WorldFrameState): void; start(): void; evidence(): WorldRenderer25Evidence; dispose(): void }`

**Signature note, corrected twice.** Mirror `ThreeWorldRenderer.create` at
`src/render/three/world-renderer.ts:562`, which takes
`(canvas, atlasUrl, matchLegacyColors, onReady, onContextStateChange, toneMapping)`. Revision 1
omitted `atlasUrl`, which would have left the agent inventing texture loading. The 2.5D renderer
drops `matchLegacyColors` — it has no legacy colours to match — and adds
`options?: { yawDegrees?: number }`, defaulting to `0`.

**The method names are not negotiable.** Revision 2 defined `render(frame)` and claimed both
renderers "satisfy the same shape". They do not. `ThreeWorldRenderer`'s public surface is
`setFrame` (`:594`), `start` (`:598`), `evidence` (`:628`), and `dispose` (`:666`), and
`ThreeWorldSurface.tsx:47-71` calls every one of them — plus a second effect at `:75` calling
`rendererRef.current?.setFrame(frame)`. A `render(frame)` interface is a type error at five call
sites. `WorldRenderer25` must expose the same four methods.

**`evidence()` carries `drawCalls`.** That is what makes Task 20 measurable. The surface already
publishes `window.siWorldThreeRendererEvidence = () => renderer.evidence()`
(`ThreeWorldSurface.tsx:55`), so folding the draw-call count into the evidence object gives the
measurement script something to read without inventing a second hook.

This is the first file that imports `three`. Keep it thin: camera, materials, mesh lifecycle,
draw loop. Every decision that can be tested without WebGL already lives in the pure modules.

- [ ] **Step 1: Write the failing test**

```ts
import { cameraForYaw } from '../world-renderer-25';
import { GROUND_TILT_DEGREES } from '../projection';

describe('2.5D camera placement', () => {
  test('sits at the configured elevation with no yaw by default', () => {
    const camera = cameraForYaw(0, 10);
    expect(camera.position.x).toBeCloseTo(0, 6);
    const horizontal = Math.hypot(camera.position.x, camera.position.z);
    const elevation = (Math.atan2(camera.position.y, horizontal) * 180) / Math.PI;
    expect(elevation).toBeCloseTo(GROUND_TILT_DEGREES, 4);
  });

  test('yaw rotates the camera around the target without changing elevation', () => {
    const camera = cameraForYaw(35, 10);
    const horizontal = Math.hypot(camera.position.x, camera.position.z);
    const elevation = (Math.atan2(camera.position.y, horizontal) * 180) / Math.PI;
    expect(elevation).toBeCloseTo(GROUND_TILT_DEGREES, 4);
    expect(camera.position.x).toBeGreaterThan(0);
  });

  test('is orthographic, never perspective', () => {
    expect(cameraForYaw(0, 10).type).toBe('OrthographicCamera');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/world-renderer-25.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the camera helper**

```ts
import { OrthographicCamera } from 'three';
import { GROUND_TILT_DEGREES } from './projection';

/**
 * Places the orthographic camera at a fixed elevation and the given yaw, looking at the origin.
 *
 * Production ships yaw 0 — see the plan's section 1. The yaw argument exists so Task 11's
 * comparison capture can render the spike angle from the same scene, and so a later decision to
 * switch is a constant change rather than a rewrite.
 */
export function cameraForYaw(yawDegrees: number, distance: number): OrthographicCamera {
  const camera = new OrthographicCamera(-distance, distance, distance, -distance, 0.1, distance * 8);
  const elevation = (GROUND_TILT_DEGREES * Math.PI) / 180;
  const yaw = (yawDegrees * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * distance;
  camera.position.set(Math.sin(yaw) * horizontal, Math.sin(elevation) * distance, Math.cos(yaw) * horizontal);
  camera.lookAt(0, 0, 0);
  return camera;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/world-renderer-25.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the renderer body**

Revision 2 listed only material constants here and left the agent to invent the rest. Write the
whole thing:

```ts
export type WorldRenderer25Evidence = Readonly<{
  rendererKind: 'threejs-2-5d';
  drawCalls: number;
  meshCount: number;
  yawDegrees: number;
}>;

export type WorldRenderer25 = Readonly<{
  setFrame(frame: WorldFrameState): void;
  start(): void;
  evidence(): WorldRenderer25Evidence;
  dispose(): void;
}>;

export async function createWorldRenderer25(
  canvas: HTMLCanvasElement,
  atlasUrl: string,
  onReady: () => void,
  onContextStateChange: (state: 'lost' | 'restored' | 'timed-out') => void,
  toneMapping: ToneMappingKind = 'aces',
  options: Readonly<{ yawDegrees?: number }> = {},
): Promise<WorldRenderer25> {
  const yawDegrees = options.yawDegrees ?? 0;
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = toneMapping === 'aces' ? ACESFilmicToneMapping : NoToneMapping;

  const texture = await loadAtlasTexture(atlasUrl);
  const scene = new Scene();
  let camera = cameraForYaw(yawDegrees, 12);

  // Stage 1 ships lights. MeshStandardMaterial with no light source renders pure black, so
  // without this the villa is an empty frame and every capture task is worthless.
  scene.add(new HemisphereLight('#f5dcb0', '#202824', 1.7));

  const cache = new SceneCache();
  const meshes = new Map<string, Mesh>();
  let frame: WorldFrameState | undefined;
  let running = false;

  const applyFrame = (next: WorldFrameState): void => {
    frame = next;

    // 1. Match the drawing buffer to the frame, exactly as the 2D path does at
    //    src/render/three/world-renderer.ts:708-710. Without this the canvas stays 300x150.
    const buffer = threeDrawingBufferSize(next.viewport, next.devicePixelRatio);
    renderer.setSize(buffer.width, buffer.height, false);

    // 2. Place the camera over the frame's visible window. cameraForYaw looks at the ORIGIN, so
    //    on its own it shows the north-west corner of the map, never the protagonist.
    const halfWidth = next.viewport.width / next.camera.zoom / TILE_SIZE / 2;
    const centreX = next.camera.x / TILE_SIZE + halfWidth;
    const centreZ = next.camera.y / TILE_SIZE + next.viewport.height / next.camera.zoom / TILE_SIZE / 2;
    camera = cameraForYaw(yawDegrees, Math.max(halfWidth, 4));
    camera.position.x += centreX;
    camera.position.z += centreZ;
    camera.lookAt(centreX, 0, centreZ);
    camera.updateProjectionMatrix();

    // 3. Add and remove only the delta.
    const delta = cache.sync(buildScene(next), next.mapHash);
    for (const id of delta.removed) {
      const mesh = meshes.get(id);
      if (!mesh) continue;
      scene.remove(mesh);
      mesh.geometry.dispose();
      meshes.delete(id);
    }
    for (const descriptor of addedDescriptors(next, delta.added)) {
      const mesh = buildMesh(descriptor, texture, material);
      scene.add(mesh);
      meshes.set(descriptor.id, mesh);
    }
  };

  const onLost = (event: Event): void => { event.preventDefault(); onContextStateChange('lost'); };
  const onRestored = (): void => { onContextStateChange('restored'); if (frame) applyFrame(frame); };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  return {
    setFrame: applyFrame,
    start: () => {
      if (running) return;
      running = true;
      let presented = false;
      renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
        // onReady means "a frame is on screen", and readiness reports worldFramePresented from it.
        // Calling it inside start() lets a smoke screenshot an empty canvas.
        if (!presented) { presented = true; onReady(); }
      });
    },
    evidence: () => ({
      rendererKind: 'threejs-2-5d',
      drawCalls: renderer.info.render.calls,
      meshCount: meshes.size,
      yawDegrees,
    }),
    dispose: () => {
      running = false;
      renderer.setAnimationLoop(null);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      for (const mesh of meshes.values()) mesh.geometry.dispose();
      texture.dispose();
      renderer.dispose();
      cache.clear();
    },
  };
}
```

**The three helpers the body calls, written out.** An agent will not invent a correct atlas UV
unwrap for `BoxGeometry`, so it is specified here.

```ts
async function loadAtlasTexture(atlasUrl: string): Promise<Texture> {
  const texture = await new TextureLoader().loadAsync(atlasUrl);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  return texture;
}

/**
 * Rewrites a geometry's UV attribute so every face samples one atlas cell.
 * `PlaneGeometry` has 4 vertices; `BoxGeometry` has 24 (4 per face), so the same remap covers both
 * — every face gets the same cell, which is what a top-textured box wants.
 */
function applyAtlasUvs(geometry: BufferGeometry, source: AtlasRectangle, atlas: Texture): void {
  const width = atlas.image.width as number;
  const height = atlas.image.height as number;
  const u0 = source.x / width;
  const u1 = (source.x + source.width) / width;
  const v0 = 1 - (source.y + source.height) / height;
  const v1 = 1 - source.y / height;
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, u0 + uv.getX(index) * (u1 - u0), v0 + uv.getY(index) * (v1 - v0));
  }
  uv.needsUpdate = true;
}

function buildMesh(
  descriptor: QuadDescriptor | BoxDescriptor,
  atlas: Texture,
  material: MeshStandardMaterial,
): Mesh {
  const isBox = 'height' in descriptor;
  const geometry = isBox
    ? new BoxGeometry(descriptor.width, descriptor.height, descriptor.depth)
    : new PlaneGeometry(descriptor.width, descriptor.depth).rotateX(-Math.PI / 2);
  applyAtlasUvs(geometry, descriptor.source, atlas);
  const mesh = new Mesh(geometry, material);
  mesh.position.set(descriptor.x, isBox ? descriptor.y : 0, descriptor.z);
  return mesh;
}
```

**`x` and `z` are the mesh CENTRE in tile units, for floors and boxes alike.** `buildFloorQuads`
in Task 7 emits `x: placement.tile.x`, which is the tile *corner*. Change it to
`placement.tile.x + 0.5` and `placement.tile.y + 0.5` in the same commit as this step, or floors sit
half a tile north-west of the furniture standing on them.

**Request a WebGL 2 context explicitly**, the way the 2D path does at `world-renderer.ts:570-576`,
and throw if it is missing. `new WebGLRenderer({ canvas })` may hand back WebGL 1, and after Task 2b
`GameSurfaceShell.tsx:130` reports `webgl2Ready: canvas.getContext('webgl2') !== null` — a WebGL 1
context makes that `null` and every packaged 2.5D run fails readiness.

Imports for this file: `WebGLRenderer, Scene, Mesh, BoxGeometry, PlaneGeometry, BufferGeometry,
MeshStandardMaterial, HemisphereLight, OrthographicCamera, TextureLoader, Texture, NearestFilter,
ClampToEdgeWrapping, SRGBColorSpace, ACESFilmicToneMapping, NoToneMapping` from `three`, plus
`WorldFrameState` from `../world-frame`, `ToneMappingKind` from `../renderer-selection`,
`AtlasRectangle` from `../atlas`, and `threeDrawingBufferSize` from `../three/coordinate-contract`.

Every material is `new MeshStandardMaterial({ flatShading: true, roughness: 0.88, metalness: 0, map: texture })`,
built once and shared by every mesh — one material, not one per box. Render at a low internal
resolution and scale by an integer factor. `renderer.setAnimationLoop` is the loop — do not write a
bare `requestAnimationFrame`, it will not stop on dispose.

**Do not reuse `ThreeRendererEvidence`.** That type pins `rendererKind: 'threejs-2d'`
(`src/render/three/world-renderer.ts:464`) and lives in a frozen file. `WorldRenderer25Evidence` is
a separate type, published on a separate window hook in Step 6.

- [ ] **Step 6: Mount it — without this step nothing else in the plan is real**

The app draws through `ThreeWorldRenderer.create` at `src/render/ThreeWorldSurface.tsx:40`. Nothing
else mounts a renderer. Until this branch exists, `?testRenderer=2-5d` still draws 2D, and every
later capture task would produce 2D screenshots labelled 2.5D.

In `src/render/ThreeWorldSurface.tsx`, three things change. Copy this exactly — the `.then` body is
the real one from `:47-56`, not a placeholder.

**a. Widen the ref type at `:21`.** It is `useRef<ThreeWorldRenderer | undefined>` today:

```tsx
type MountedRenderer = Pick<ThreeWorldRenderer, 'setFrame' | 'start' | 'dispose'>;
const rendererRef = useRef<MountedRenderer | undefined>(undefined);
```

`WorldRenderer25` satisfies `MountedRenderer` structurally. `evidence()` is deliberately excluded —
the two evidence shapes differ, so it is called inside the branch, not through the ref.

**b. Branch the construction and keep the whole `.then` body:**

```tsx
    const kind = selectedRenderer();
    const atlasUrl = Asset.fromModule(atlasImage).uri;
    const created: Promise<MountedRenderer> = kind === 'threejs-2-5d'
      ? createWorldRenderer25(
          canvas,
          atlasUrl,
          () => onReadyRef.current(),
          (state) => onContextStateChangeRef.current(state),
          selectedToneMapping(),
          { yawDegrees: selectedYawDegrees() },
        )
      : ThreeWorldRenderer.create(
          canvas,
          atlasUrl,
          matchLegacyColors,
          () => onReadyRef.current(),
          (state) => onContextStateChangeRef.current(state),
          selectedToneMapping(),
        );
    void created.then((renderer) => {
      if (disposed) {
        renderer.dispose();
        return;
      }
      rendererRef.current = renderer;
      renderer.setFrame(frameRef.current);
      renderer.start();
      if (window.siWorldSmokeMode === true || local) {
        if (kind === 'threejs-2-5d') {
          window.siWorld25dEvidence = () => (renderer as WorldRenderer25).evidence();
        } else {
          window.siWorldThreeRendererEvidence = () => (renderer as ThreeWorldRenderer).evidence();
        }
      }
    }).catch((error: unknown) => {
      if (!disposed) onContextStateChangeRef.current('timed-out');
      console.error(`SI_WORLD_THREE_RENDERER_FAILURE ${error instanceof Error ? error.message : String(error)}`);
    });
```

Add `delete window.siWorld25dEvidence;` beside the existing delete in the cleanup at `:66`.

**c. Declare the new hook and the yaw selector.** `window.siWorld25dEvidence?: () => WorldRenderer25Evidence`
goes in `src/application/DesktopBridge.ts` beside `siWorldThreeRendererEvidence` at `:81`. That file
is not frozen.

`selectedYawDegrees()` lives in `renderer-selection.ts` next to `selectedToneMapping`: localhost
`?testYaw=<number>` only, clamped to `0`–`60`, defaulting to `0`. That is how Step 8's comparison
script renders the spike angle without a new Electron flag.

The frame effect at `:70` (`rendererRef.current?.setFrame(frame)`) needs no change — `setFrame` is
on `MountedRenderer`.

- [ ] **Step 7: Prove the mount actually switched**

```ts
test('the surface constructs the 2.5D renderer when it is selected', () => {
  // Assert on the module-level selection, not on a WebGL context: jest has no canvas.
  expect(rendererForEnvironment({ hostname: 'localhost', search: '?testRenderer=2-5d', smokeMode: false }))
    .toBe('threejs-2-5d');
});
```

**Do not try to load `http://localhost:8081`.** Revision 2 said to. An unattended agent has no dev
server and no browser session, so that step would strand it.

The real end-to-end proof is the `window.siWorld25dEvidence` hook: it exists only on the 2.5D path,
so its presence proves the branch was taken. Task 19's packaged smokes assert it, and Task 20 reads
`drawCalls` from it. Until Task 19 exists, the Jest assertion above plus a green
`npm run typecheck` is the whole gate for this step.

- [ ] **Step 8: Write the yaw comparison script**

`scripts/verification/capture-yaw-comparison.ts` renders the same villa frame twice — once at
`yawDegrees: 0`, once at `35` — and writes both PNGs plus a side-by-side to
`artifacts/phase-25d/stage-1/yaw-comparison/`.

**Serve the web export on `127.0.0.1`; do not load the packaged app.** `selectedYawDegrees()` and
`?testRenderer` are localhost-only overrides, and a packaged build loads over `app://game/` where
the hostname is `'game'`. Loading the package would produce two identical yaw-0 images and the
morning comparison would be made on wrong evidence.

```bash
npm run export:web
npx http-server dist -p 8099 &     # any static server; the hidden window loads 127.0.0.1:8099
```

Then load `http://127.0.0.1:8099/?testRenderer=2-5d&testYaw=0` and again with `testYaw=35`. Both
overrides work, and no Electron flag is needed.

Follow the hidden-window rules in `AGENTS.md`: `show: false`, background throttling disabled,
audio muted before load, capture with `stayHidden: true`, and close every Electron process and the
static server on both success and failure.

- [ ] **Step 9: Run it**

Run: `npx tsx scripts/verification/capture-yaw-comparison.ts --output-root artifacts/phase-25d/stage-1/yaw-comparison`
Expected: three PNGs written.

**This does not block.** Production stays at yaw 0. The images are for a human to look at later.

- [ ] **Step 10: Run the full suite**

Run: `npm test && npm run typecheck && npm run check:boundaries`
Expected: green.

- [ ] **Step 11: Commit**

```bash
git add src/render/three25/ src/render/ThreeWorldSurface.tsx src/render/renderer-selection.ts src/application/DesktopBridge.ts scripts/verification/capture-yaw-comparison.ts artifacts/phase-25d/stage-1
git commit -m "feat(three25): mount the tilted orthographic renderer and capture the yaw comparison"
```

---

# Stage 2 — Walking Villa

## Task 12: Instanced character billboards

**Files:**
- Create: `src/render/three25/billboards.ts`
- Test: `src/render/three25/__tests__/billboards.test.ts`

**Interfaces:**
- Consumes: `WorldCharacterPlacement` from `src/render/world-frame`
- Produces:
  - `type BillboardDescriptor = Readonly<{ id: string; source: AtlasRectangle; x: number; z: number; width: number; height: number; tint: string }>`
  - `buildBillboards(frame: WorldFrameState): readonly BillboardDescriptor[]`

`THREE.Sprite` is banned here: it does not batch, and the 2D port spec forbids one `Sprite` per
drawn thing. Characters render as camera-facing quads in one instanced batch sharing the atlas
texture and one material.

- [ ] **Step 1: Write the failing test**

```ts
import { buildBillboards } from '../billboards';

describe('character billboards', () => {
  const frame = indoorFrame();

  test('emits one billboard per character', () => {
    expect(buildBillboards(frame)).toHaveLength(frame.characters.length);
  });

  test('anchors at the contact point, not the quad corner', () => {
    const billboard = buildBillboards(frame)[0]!;
    const character = frame.characters[0]!;
    expect(billboard.x).toBeCloseTo(character.shadowWorldX / 32, 6);
    expect(billboard.z).toBeCloseTo(character.shadowWorldY / 32, 6);
  });

  test('keeps the authored pixel aspect ratio', () => {
    for (const billboard of buildBillboards(frame)) {
      const source = billboard.source;
      expect(billboard.width / billboard.height).toBeCloseTo(source.width / source.height, 4);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/billboards.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { AtlasRectangle } from '../atlas';
import type { WorldFrameState } from '../world-frame';

const TILE_SIZE = 32;

export type BillboardDescriptor = Readonly<{
  id: string;
  source: AtlasRectangle;
  x: number;
  z: number;
  width: number;
  height: number;
  tint: string;
}>;

/**
 * The frame's `worldX`/`worldY` is the 2D quad's top-left after scale, lean, bob, and impact
 * offsets. `shadowWorldX`/`shadowWorldY` is the contact point the frame already computed, which is
 * what a billboard must stand on. Placing from `tile` instead would pop every 32 pixels.
 */
export function buildBillboards(frame: WorldFrameState): readonly BillboardDescriptor[] {
  return frame.characters.map((character) => ({
    id: character.id,
    source: character.source,
    x: character.shadowWorldX / TILE_SIZE,
    z: character.shadowWorldY / TILE_SIZE,
    width: (character.source.width * character.scale) / TILE_SIZE,
    height: (character.source.height * character.scale) / TILE_SIZE,
    tint: character.color,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --runInBand --runTestsByPath src/render/three25/__tests__/billboards.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Render them as one instanced batch**

In `world-renderer-25.ts`, add a single `InstancedMesh` over a unit quad, with per-instance UV
offsets from `source` and per-instance tint. Face the camera by copying the camera quaternion each
frame.

**Do not assert `drawCalls()` in Jest.** `renderer.info.render.calls` needs a real WebGL context
and a completed render; `jest.config.js` uses `testEnvironment: 'node'`, so there is none. Assert
the batching at the descriptor level instead, which is pure:

```ts
test('twenty characters produce one instanced batch', () => {
  const many = { ...frame, characters: Array.from({ length: 20 }, (_, index) => ({
    ...frame.characters[0]!, id: `npc-${index}`,
  })) } as const;
  expect(buildBillboards(many)).toHaveLength(20);
  expect(new Set(buildBillboards(many).map((billboard) => billboard.source.sourceId)).size)
    .toBeLessThanOrEqual(1);
});
```

The real `drawCalls()` ceiling is measured in Task 20's packaged run, where a WebGL context exists.

- [ ] **Step 6: Run the full suite and commit**

```bash
npm test && npm run typecheck && npm run check:boundaries
git add src/render/three25/billboards.ts src/render/three25/__tests__/billboards.test.ts src/render/three25/world-renderer-25.ts
git commit -m "feat(three25): instanced character billboards"
```

---

## Task 13: Facing selection and district tint

**Files:**
- Modify: `src/render/three25/billboards.ts`
- Modify: `src/render/three25/__tests__/billboards.test.ts`

**Interfaces:**
- Produces: `tintForLighting(base: string, lighting: DistrictLighting, atmosphere: WorldAtmosphere): string`

At yaw 0 facing selection is unchanged from 2D — the frame already picked the right atlas cell
against the world axis, and the camera shares that axis. **No facing code is written.** Assert it.

Unlit billboards do need tinting, or characters stay full-bright at night.

- [ ] **Step 1: Write the failing test**

**Type warning, from the audit.** `DistrictLighting.shelterShade` is a **`string`** hex colour
(`src/render/district-lighting.ts:18`), not a number. Day/night intensity lives in
`lighting.sun`, which is a `WorldSun` (`src/render/atmosphere.ts:40`) carrying
`elevation: number` — `0` at night through `1` at solar noon. Drive the tint from `sun.elevation`.

```ts
import { tintForLighting } from '../billboards';

describe('billboard tint', () => {
  const frame = indoorFrame();

  test('facing needs no 2.5D branch at yaw 0', () => {
    const rear = indoorFrame('up');
    expect(buildBillboards(rear)[0]!.source).not.toEqual(buildBillboards(frame)[0]!.source);
  });

  test('darkens as the sun drops', () => {
    const night = { ...frame.lighting, sun: { ...frame.lighting.sun, elevation: 0 } } as const;
    const noon = { ...frame.lighting, sun: { ...frame.lighting.sun, elevation: 1 } } as const;
    expect(tintForLighting('#ffffffff', night)).not.toBe(tintForLighting('#ffffffff', noon));
  });

  test('is identity at solar noon', () => {
    const noon = { ...frame.lighting, sun: { ...frame.lighting.sun, elevation: 1 } } as const;
    expect(tintForLighting('#ffffffff', noon)).toBe('#ffffffff');
  });

  test('never returns a colour brighter than the input', () => {
    const night = { ...frame.lighting, sun: { ...frame.lighting.sun, elevation: 0 } } as const;
    const tinted = tintForLighting('#808080ff', night);
    expect(Number.parseInt(tinted.slice(1, 3), 16)).toBeLessThanOrEqual(0x80);
  });
});
```

- [ ] **Step 2: Run, implement, run, commit**

Run the test, watch it fail. Implement `tintForLighting(base: string, lighting: DistrictLighting)`
— **two arguments**, matching the tests above.

Mix toward `lighting.sun.shadowColor` by `1 - lighting.sun.elevation`, using `mixHex` from
`src/render/atmosphere.ts:114`.

**Not toward `lighting.accent`.** Accents are bright — northwest is `'#ffc45c'`
(`district-lighting.ts:30`) — so mixing toward the accent makes billboards *brighter* at night and
fails test 4. `sun.shadowColor` is the dark target, and `mixHex` is identity at amount `0`, so test
3 still passes at solar noon.

Rerun, then:

```bash
git add src/render/three25/billboards.ts src/render/three25/__tests__/billboards.test.ts
git commit -m "feat(three25): tint billboards with district lighting"
```

---

## Task 14: Click projection in `WorldScene.tsx`

**Files:**
- Modify: `src/render/WorldScene.tsx` (11 call sites)
- Modify: `src/render/camera.ts` (additive)
- Test: `src/render/three25/__tests__/picking.test.ts`

**Interfaces:**
- Consumes: `screenToTileTilted`, `worldToScreenTilted` from `./projection`
- Produces: `isScreenPointInsideMapTilted(camera, screen, mapPixels): boolean`

`WorldScene.tsx` calls `worldToScreen` six times, `isScreenPointInsideMap` three times, and
`screenToTile` twice. NPC picking uses a screen-space box around `worldToScreen(camera, foot)`.
Overlay anchors at `:1488-1522` use the same call. Every one needs a branch.

- [ ] **Step 1: Write the failing test**

```ts
import { isScreenPointInsideMapTilted } from '../projection';

const MAP_PIXELS = { width: 2048, height: 1536 } as const;

describe('tilted hit testing', () => {
  test('accepts a point over the map', () => {
    expect(isScreenPointInsideMapTilted({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 100 }, MAP_PIXELS)).toBe(true);
  });

  test('rejects a point past the far edge', () => {
    expect(isScreenPointInsideMapTilted({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 1_000_000 }, MAP_PIXELS)).toBe(false);
  });

  test('rejects negative screen coordinates outside the map', () => {
    expect(isScreenPointInsideMapTilted({ x: 0, y: 0, zoom: 1 }, { x: -50, y: -50 }, MAP_PIXELS)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, implement in `projection.ts`, run**

`isScreenPointInsideMapTilted` unprojects with `screenToWorldTilted` and bounds-checks against
`mapPixels`, mirroring `isScreenPointInsideMap`.

- [ ] **Step 3: Branch every `WorldScene.tsx` call site**

Add one helper near the top of the component:

```tsx
  const project = renderer2_5d ? worldToScreenTilted : worldToScreen;
  const unproject = renderer2_5d ? screenToTileTilted : screenToTile;
  const insideMap = renderer2_5d ? isScreenPointInsideMapTilted : isScreenPointInsideMap;
```

Then replace the direct calls. Grep to confirm none are missed:

Run: `grep -n "worldToScreen(\|screenToTile(\|isScreenPointInsideMap(" src/render/WorldScene.tsx`
Expected: no hits outside the three helper definitions.

- [ ] **Step 4: Run the full suite and commit**

```bash
npm test && npm run typecheck && npm run check:boundaries
git add src/render/WorldScene.tsx src/render/three25/
git commit -m "feat(three25): branch picking and overlay anchors for the tilted view"
```

---

## Task 15: Camera clamping and the skirt

**Files:**
- Modify: `src/render/camera-motion.ts:226,292`
- Create: `src/render/three25/clamp.ts`
- Test: `src/render/three25/__tests__/clamp.test.ts`

**Interfaces:**
- Produces: `clampCameraTilted(camera, viewport, mapPixels): CameraState`

At zoom 1 the tilted footprint is taller than a `48`-tile map, so no clamp can avoid void. That is
expected. The camera centres on the oversized axis, exactly like `clampCamera:22-25` already does,
and the renderer paints a skirt outside the map bounds.

- [ ] **Step 1: Write the failing test**

```ts
import { clampCameraTilted } from '../clamp';

const VIEWPORT = { width: 1280, height: 720 } as const;
const MAP_PIXELS = { width: 2048, height: 1536 } as const;

describe('tilted camera clamp', () => {
  test('centres the depth axis when the footprint exceeds the map', () => {
    const clamped = clampCameraTilted({ x: 0, y: -9999, zoom: 1 }, VIEWPORT, MAP_PIXELS);
    const alsoClamped = clampCameraTilted({ x: 0, y: 9999, zoom: 1 }, VIEWPORT, MAP_PIXELS);
    expect(clamped.y).toBeCloseTo(alsoClamped.y, 6);
  });

  test('clamps normally at zoom 3 where the footprint fits', () => {
    const clamped = clampCameraTilted({ x: -9999, y: 0, zoom: 3 }, VIEWPORT, MAP_PIXELS);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
  });

  test('never returns a zoom outside the world range', () => {
    expect(() => clampCameraTilted({ x: 0, y: 0, zoom: 4 }, VIEWPORT, MAP_PIXELS)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run, implement, run**

`clampCameraTilted` reuses `clampCamera` with the depth extent divided by `GROUND_Z_SCALE`.

- [ ] **Step 3: Branch every clamp path, not just `camera-motion.ts`**

Revision 2 branched only `camera-motion.ts:226` and `:292`. **The player camera does not go through
those lines.** They cover the camera director; ordinary pan, zoom, centre, and resize all reach
`clampCamera` inside `camera.ts` through other entry points. A defaulted flag on `camera-motion`
alone leaves the walking villa on the 2D clamp — with every 2D test still green, so nothing tells
the agent it is wrong.

The full list, from `src/render/WorldScene.tsx`:

| Call | Lines |
|---|---|
| `clampCamera` | `:331`, `:1311` |
| `panCamera` | `:1078` |
| `zoomCameraAt` | `:646`, `:1083`, `:1098` |
| `centerCameraOnTile` / `centerCameraOnWorld` | `:332`, `:718`, `:754`, `:834`, `:959`, `:1093`, `:1745` |
| `resizeCameraPreservingCenter` | `:595` |

plus `camera-motion.ts:226`, `:292`, and `followWindowTarget` → `clampCamera` (`camera.ts:133`),
used by `sampleCameraDirector` at `WorldScene.tsx:404-410`.

**Thread one clamp function, not a boolean.** Add an optional
`clamp: ClampFn = clampCamera` parameter to each of those `camera.ts` exports, where
`type ClampFn = (camera: CameraState, viewport: ViewportSize, mapPixels: ViewportSize) => CameraState`.
Existing callers and every existing test compile untouched because the default is the current
behaviour.

**Not always last.** `centerCameraOnTile` already ends with `tileSize = 32` (`camera.ts:68-74`).
Appending `clamp` after it means `WorldScene.tsx` passes a function where `tileSize` is expected,
and typecheck fails. Put `clamp` **before** `tileSize`:

```ts
export function centerCameraOnTile(
  tile: TilePoint,
  zoom: number,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
  clamp: ClampFn = clampCamera,
  tileSize = 32,
): CameraState
```

`followWindowTarget` has the same shape — its existing optional `deadZoneRatio` precedes the new
parameter, so its two call sites in `camera-motion.ts` (`:283`, `:321`) must pass `deadZoneRatio`
explicitly.

**`CameraDirectorInput` needs a `clamp` field.** `camera-motion.ts:90-96` has none, so
`sampleCameraDirector` cannot receive one. Add `clamp?: ClampFn`, default it to `clampCamera`, and
thread it. Do **not** hard-switch `:226`/`:292` to `clampCameraTilted` — that turns
`camera-motion.test.ts` red.

In `WorldScene.tsx`, define the pair once **at the top of the component**, beside the existing
`rendererKind` prop at `:288`:

```tsx
  const renderer2_5d = rendererKind === 'threejs-2-5d';
  const clamp = renderer2_5d ? clampCameraTilted : clampCamera;
```

It must be above line 331, which is the first clamp site. Task 6 introduced `renderer2_5d` near
`:1350` for the inflation branch — move that definition here rather than declaring it twice, and do
not call `selectedRenderer()` a second time. `rendererKind` is already a prop and is currently
declared but unread.

Then pass `clamp` at all fourteen sites plus the two in `camera-motion.ts`. Verify none are missed:

```bash
grep -cn "clampCamera\|panCamera\|zoomCameraAt\|centerCameraOn\|resizeCameraPreservingCenter\|followWindowTarget" src/render/WorldScene.tsx src/render/camera-motion.ts
```

- [ ] **Step 4: Paint the skirt**

In `world-renderer-25.ts`, add one large ground quad below the floor tiles, tinted from
`frame.lighting.accent`. It fills everything outside the map bounds.

- [ ] **Step 5: Run the full suite and commit**

```bash
npm test && npm run typecheck && npm run check:boundaries
git add src/render/three25/clamp.ts src/render/three25/__tests__/clamp.test.ts src/render/camera.ts src/render/camera-motion.ts src/render/WorldScene.tsx src/render/three25/world-renderer-25.ts
git commit -m "feat(three25): tilted camera clamp with skirt fill"
```

---

# Stage 3 — Occlusion and Lighting

## Task 16: Wall to roof-group derivation

**Files:**
- Create: `src/render/three25/occlusion.ts`
- Test: `src/render/three25/__tests__/occlusion.test.ts`

**Interfaces:**
- Produces: `wallRoofGroups(frame: WorldFrameState): ReadonlyMap<string, string>` keyed `"x,y"` → roof group id

`WorldWallPlacement` carries only `tile` and `adjacencyMask`. Roof group ids ride on `roofs`, and
the occupied group's roofs are filtered out of the frame entirely. Membership is derived from
`shelterCells` and `roofedCells`, which the frame does carry.

**Group-id rule, made explicit after audit.** Neither `shelterCells` nor `roofedCells` carries a
group id — they are bare rectangles (`world-frame.ts:1125`). So the ids this function returns are
**synthetic and derived**, not read from the frame:

- A wall adjacent to a `shelterCells` rectangle takes `frame.hiddenRoofGroupId` as its group. There
  is only ever one occupied group, and `shelterCells` describes exactly it.
- A wall adjacent to a `roofedCells` rectangle takes the id of the `frame.roofs` entry whose tile
  falls inside that rectangle.
- A wall adjacent to neither is unassigned and never culled.

Write it exactly that way. The tests below assume it, and a different derivation would pass some of
them by accident.

- [ ] **Step 1: Write the failing test**

```ts
import { wallRoofGroups } from '../occlusion';

describe('wall to roof-group derivation', () => {
  const frame = indoorFrame();

  test('assigns every wall bordering a shelter cell to a group', () => {
    const groups = wallRoofGroups(frame);
    const bordering = frame.walls.filter((wall) => frame.shelterCells.some((cell) =>
      wall.tile.x >= cell.x - 1 && wall.tile.x <= cell.x + cell.width &&
      wall.tile.y >= cell.y - 1 && wall.tile.y <= cell.y + cell.height));
    for (const wall of bordering) {
      expect(groups.has(`${wall.tile.x},${wall.tile.y}`)).toBe(true);
    }
  });

  test('leaves free-standing outdoor walls unassigned', () => {
    const groups = wallRoofGroups(frame);
    expect(groups.size).toBeLessThan(frame.walls.length);
  });

  test('is stable when the occupied group has no roofs in the frame', () => {
    // The default fixture is ALREADY indoors: hiddenRoofGroupId is 'protagonist-villa-roof' and
    // frame.roofs excludes it. Emptying roofs entirely must not change shelter-derived membership,
    // because shelterCells is what assigns the occupied group.
    const noRoofs = { ...frame, roofs: [] } as const;
    const shelterDerived = (source: WorldFrameState) =>
      [...wallRoofGroups(source).values()].filter((id) => id === source.hiddenRoofGroupId).length;
    expect(shelterDerived(noRoofs)).toBe(shelterDerived(frame));
  });
});
```

**Fixture reality, from the audit.** `createInitialState()` spawns the protagonist at tile
`(18,18)` (`src/domain/state/generated-layout.ts:10-15`), inside the villa interior
`x:9 y:8 w:16 h:16` (`content/maps/northwest.json`). Northwest has exactly one roof group. So on
`indoorFrame()`:

- `hiddenRoofGroupId === 'protagonist-villa-roof'`
- `visibleRoofGroupIds` is **empty**

Revision 2's tests read `frame.visibleRoofGroupIds[0]`, which is `undefined` on this map — they
would have passed while exercising nothing. Never index that array in a test on this fixture. Use
`hiddenRoofGroupId` for the occupied case and `outdoorFrame()` for the unoccupied case.

- [ ] **Step 2: Run, implement, run, commit**

Derive by testing each wall tile for adjacency to a `shelterCells` or `roofedCells` rectangle, then
mapping that rectangle to its group. The third test is the important one: it proves the derivation
does not depend on `roofs`, which vanish when the player is inside.

```bash
git add src/render/three25/occlusion.ts src/render/three25/__tests__/occlusion.test.ts
git commit -m "feat(three25): derive wall roof-group membership from shelter cells"
```

---

## Task 17: Near-wall culling

**Files:**
- Modify: `src/render/three25/occlusion.ts`
- Modify: `src/render/three25/__tests__/occlusion.test.ts`

**Interfaces:**
- Produces: `hiddenWallTiles(frame: WorldFrameState): ReadonlySet<string>`

At yaw 0 the near walls are the map-south edge of a roof group — the side between the camera and
the room interior.

- [ ] **Step 1: Write the failing test**

```ts
describe('near-wall culling', () => {
  test('hides nothing when the player is outdoors', () => {
    expect(hiddenWallTiles(outdoorFrame()).size).toBe(0);
  });

  test('hides only walls of the occupied group', () => {
    const inside = indoorFrame();          // already indoors — see Task 16
    expect(inside.hiddenRoofGroupId).toBeDefined();
    const groups = wallRoofGroups(inside);
    for (const key of hiddenWallTiles(inside)) {
      expect(groups.get(key)).toBe(inside.hiddenRoofGroupId);
    }
  });

  test('hides at least one wall when indoors', () => {
    expect(hiddenWallTiles(indoorFrame()).size).toBeGreaterThan(0);
  });

  test('is idempotent across repeated frames', () => {
    const inside = indoorFrame();
    expect([...hiddenWallTiles(inside)]).toEqual([...hiddenWallTiles(inside)]);
  });
});
```

- [ ] **Step 2: Run, implement, run**

A wall is a near wall when no other wall tile of the same group sits at a greater `tile.y` in the
same column. Filter those ids out in `buildWallBoxes`.

**This turns Task 8's first test red.** `buildWallBoxes(frame)).toHaveLength(frame.walls.length)`
stops holding the moment culling lands, because `indoorFrame()` occupies a roof group. Update that
assertion in the same commit:

```ts
    expect(buildWallBoxes(frame)).toHaveLength(frame.walls.length - hiddenWallTiles(frame).size);
```

Run `npm test` — not just the occlusion file — before committing this task. Global Constraints
forbid committing with a red suite, and this is the one task in the plan that reaches back and
breaks an earlier task's test.

- [ ] **Step 3: Commit**

```bash
git add src/render/three25/occlusion.ts src/render/three25/__tests__/occlusion.test.ts src/render/three25/scene-builder.ts
git commit -m "feat(three25): hide near walls of the occupied roof group"
```

---

## Task 18: Lit and fallback shadow paths

**Files:**
- Create: `src/render/three25/lighting.ts`
- Test: `src/render/three25/__tests__/lighting.test.ts`

**Interfaces:**
- Produces:
  - `type ShadowPath = 'lit' | 'fallback'`
  - `DEFAULT_SHADOW_PATH: ShadowPath`
  - `lampLights(frame: WorldFrameState): readonly { x: number; z: number; color: string; intensity: number }[]`
  - `blobShadows(frame: WorldFrameState): readonly QuadDescriptor[]`

Lamps come from **lamp props**, matching `LAMP_SPRITE_IDS` in the 2D renderer — not from
`DistrictLighting.pools`, which are district-level outdoor washes.

Character blob shadows render in **both** paths. Billboard quads do not cast into a shadow map;
the spike hand-places a blob for exactly this reason.

- [ ] **Step 1: Write the failing test**

```ts
import { DEFAULT_SHADOW_PATH, LAMP_SPRITE_IDS_25D, blobShadows, lampLights } from '../lighting';

describe('2.5D lighting', () => {
  const frame = indoorFrame();

  test('lamp lights come from lamp props, not district pools', () => {
    const lights = lampLights(frame);
    const lampProps = frame.props.filter((prop) => LAMP_SPRITE_IDS_25D.has(prop.sprite));
    expect(lights).toHaveLength(lampProps.length);
  });

  test('blob shadows exist for every character in both paths', () => {
    expect(blobShadows(frame)).toHaveLength(frame.characters.length);
  });

  test('the default path is the deterministic fallback', () => {
    expect(DEFAULT_SHADOW_PATH).toBe('fallback');
  });
});
```

**Do not export `LAMP_SPRITE_IDS` from `src/render/three/world-renderer.ts`.** Revision 1 said that
was allowed. It is not: that file is frozen in the Global Constraints, and Task 22 Step 2 gates on
its diff being empty. An agent that exports it would strand itself at a failing gate with nobody to
arbitrate.

Copy the set into `lighting.ts` and add a source-text equality test, the same pattern Task 2 uses
for the preload whitelist:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LAMP_SPRITE_IDS_25D } from '../lighting';

test('the 2.5D lamp set matches the 2D renderer source', () => {
  const source = readFileSync(resolve(__dirname, '../../three/world-renderer.ts'), 'utf8');
  for (const id of LAMP_SPRITE_IDS_25D) {
    expect(source).toContain(`'${id}'`);
  }
  const declared = source.match(/const LAMP_SPRITE_IDS[\s\S]*?\]\)/u)?.[0] ?? '';
  const count = (declared.match(/'tile\.[a-z0-9-]+'/gu) ?? []).length;
  expect(LAMP_SPRITE_IDS_25D.size).toBe(count);
});
```

The count assertion is what catches drift: adding a lamp to the 2D set without adding it here fails
the build.

- [ ] **Step 2: Run, implement, run**

- [ ] **Step 3: Wire it into the renderer — building the descriptors is not enough**

`lampLights` and `blobShadows` are pure functions. Nothing calls them, so on its own this task
changes no pixels and Task 19's lit smoke cannot prove spec 8.7.

In `world-renderer-25.ts`, inside `applyFrame`:

```ts
    const path = shadowPathForEnvironment(...);   // 'lit' | 'fallback', from Task 19 Step 1
    syncLampLights(scene, lampLights(next), path);
    syncBlobShadows(scene, blobShadows(next));    // BOTH paths — billboards cannot cast
```

and at construction, when `path === 'lit'`, add the directional sun and enable the shadow map:

```ts
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = BasicShadowMap;     // hard, aliased, reads as pixel art
    const sun = new DirectionalLight(next.lighting.sun.light, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(256, 256);
```

`BasicShadowMap` at 256 is deliberate. Soft PCF shadows read as smooth 3D and break the pixel-art
rules in section 9.

- [ ] **Step 4: Commit**

```bash
git add src/render/three25/lighting.ts src/render/three25/__tests__/lighting.test.ts src/render/three25/world-renderer-25.ts
git commit -m "feat(three25): lamp-prop lights and blob shadows in both paths"
```

---

## Task 19: Explicit path selection and per-path smokes

**Files:**
- Create: `scripts/electron/run-25d-lit-smoke.ts`
- Create: `scripts/electron/run-25d-fallback-smoke.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ShadowPath` from `./lighting`
- Produces: `npm run smoke:25d:lit`, `npm run smoke:25d:fallback`

Path selection is **explicit**, never a runtime FPS probe. It mirrors `siWorldTestRenderer`:
a localhost query parameter plus a smoke-mode global.

- [ ] **Step 1: Add the selector and its flag plumbing**

`shadowPathForEnvironment(input)` in `lighting.ts`, same shape as `rendererForEnvironment`.
Test production default, localhost override, smoke override.

**The smoke flag needs three edits, all in already-owned files.** Copy the `smokeVfxMode` pattern
at `electron/preload/index.ts:101-104`:

```ts
const smokeShadowPath = process.argv.find((argument) => argument.startsWith('--si-world-shadow-path='))?.split('=')[1];
if (process.argv.includes('--si-world-smoke-mode=1') && (smokeShadowPath === 'lit' || smokeShadowPath === 'fallback')) {
  contextBridge.exposeInMainWorld('siWorldShadowPath', smokeShadowPath);
}
```

Then declare `siWorldShadowPath?: ShadowPath` on the `Window` interface in
`src/application/DesktopBridge.ts`, beside `siWorldTestRenderer` at `:51`.

`electron/preload/index.ts` is already on the owned list — the `:106` annotation there names the
line Task 2 changes, not a limit on the file. `DesktopBridge.ts` is not frozen. No main-process
change is needed: main only validates flags it forwards, and this one is read in the renderer.

`security.test.ts`'s bridge-key assertions are unaffected; this is a window global, not a bridge
method.

- [ ] **Step 2: Write both smoke scripts**

Copy the structure of `scripts/electron/run-art-quality-package-smoke.ts`. Each launches the
packaged app with `--si-world-smoke-mode=1 --si-world-test-renderer=threejs-2-5d` plus its shadow
path flag, captures screenshots, and writes evidence.

Follow `AGENTS.md`: hidden windows, `stayHidden: true`, audio muted, every process closed on
failure.

- [ ] **Step 3: Add both to `verify`, not `verify:ci-build`**

`verify:ci-build` is deliberately the headless gate with no `package:electron` and no packaged
smokes — `CLAUDE.md` calls it "the CI gate, minus the packaged smokes". Adding a packaged smoke
there would fail for want of a packaged app and turn a headless gate into a visible-window one.

Add both to `verify`, which already packages first. Each smoke needs a fresh
`npm run package:electron` before it runs; chain them after the existing packaging step rather
than as standalone entries.

Both paths run on every `verify`. That is what stops the fallback path from rotting into dead code.

- [ ] **Step 4: Commit**

```bash
git add scripts/electron/run-25d-lit-smoke.ts scripts/electron/run-25d-fallback-smoke.ts package.json src/render/three25/lighting.ts
git commit -m "feat(three25): explicit shadow path selection with a smoke per path"
```

---

# Stage 4 — One Street

## Task 20: Outdoor scale and the draw-call ceiling

**Files:**
- Create: `scripts/verification/measure-25d-draw-calls.ts`
- Create: `src/render/three25/ceilings.ts`
- Test: `src/render/three25/__tests__/ceilings.test.ts`

**Interfaces:**
- Produces: `DRAW_CALL_CEILING: number`, `ATLAS_DRAW_CALL_CEILING: number`

The 2D spec's `24`/`12` cannot hold. This plan sets `40`/`16` provisionally in section 1. Measure
the real number, then tighten the constant to the measurement plus 25% headroom.

- [ ] **Step 1: Write the failing test**

```ts
import { ATLAS_DRAW_CALL_CEILING, DRAW_CALL_CEILING } from '../ceilings';

describe('2.5D draw-call ceilings', () => {
  test('are tighter than the provisional numbers once measured', () => {
    expect(DRAW_CALL_CEILING).toBeLessThanOrEqual(40);
    expect(ATLAS_DRAW_CALL_CEILING).toBeLessThanOrEqual(16);
  });

  test('leave room for the lit path shadow pass', () => {
    expect(DRAW_CALL_CEILING).toBeGreaterThan(ATLAS_DRAW_CALL_CEILING);
  });
});
```

- [ ] **Step 2: Measure on the busiest outdoor map at zoom 1**

Run: `npx tsx scripts/verification/measure-25d-draw-calls.ts --output-root artifacts/phase-25d/stage-4`

The script drives a hidden packaged window and reads `window.siWorld25dEvidence()` — the hook Task
11 Step 6 publishes — across a scripted pan, reporting the maximum `drawCalls` for both shadow
paths.

**Not `window.siWorldThreeRendererEvidence`.** That hook is typed to `ThreeRendererEvidence`, whose
`rendererKind` is the literal `'threejs-2d'` in a frozen file, and `electron/main/index.ts:1132`
only collects it when `effectiveRenderer === 'threejs-2d'`. The 2.5D path has its own hook for
exactly this reason.

Pass `--output-root` through `resolveEvidenceOutputRoot` with `allowedRootPrefixes:
['artifacts/phase-25d']`, so this script can write where Task 3 could not.

- [ ] **Step 3: Set the constants from the measurement**

If the measured maximum exceeds `40`, do **not** raise the ceiling. Merge wall runs by
`adjacencyMask` in `buildWallBoxes` first — the `ponytail:` comment there marks it as the intended
optimisation.

- [ ] **Step 4: Run the full suite and commit**

```bash
npm test && npm run typecheck && npm run check:boundaries
git add src/render/three25/ceilings.ts src/render/three25/__tests__/ceilings.test.ts scripts/verification/measure-25d-draw-calls.ts artifacts/phase-25d/stage-4
git commit -m "feat(three25): measure and lock 2.5D draw-call ceilings"
```

---

## Task 21: ART-04 walk readability and its fallback

**Files:**
- Create: `scripts/verification/capture-art04-25d.ts`
- Modify: `scripts/art/character-source.ts` (only if the capture fails)

**Interfaces:**
- Produces: `artifacts/phase-25d/stage-4/art04/` comparison board

`spec.md:321` and `ART-04` record that front-facing horizontal walk readability is unresolved in
the shipped 2D game. A tilt makes more movement read as sideways. This task tests it and applies
the spec's own fallback if it fails.

- [ ] **Step 1: Capture horizontal walk at native 1×**

Run: `npx tsx scripts/verification/capture-art04-25d.ts --output-root artifacts/phase-25d/stage-4/art04`

Render the protagonist walking left and right across a lit interior, eight frames each, at zoom 1,
in both renderers side by side.

- [ ] **Step 2: Capture only — do not regenerate art in this run**

Revision 2 said "judge it against the 2D baseline", which is a human checkpoint. Revision 3 swung
the other way and applied the mirrored three-quarter fallback unconditionally. **Both were wrong.**

Regenerating the atlas is the highest-blast-radius change in the whole plan:

- Global Constraints say "No character sprite is created or modified. `art:check` must stay green
  with no regeneration." Regenerating contradicts the plan's own rule.
- `tests/fixtures/rendering/world-frame-v1.json` pins `atlasHash` per case. Any regeneration turns
  `src/render/__tests__/world-frame.test.ts` red, breaking "the 2D suite stays green after every
  task."
- `art:check` runs the builder then `git diff --exit-code`, so Task 22's closeout fails unless the
  regenerated output, `scripts/art/character-source.ts`, and the refreshed fixtures all land in one
  commit.

**The decision is pre-made: capture the board, change no art.** Nothing downstream in this plan
consumes the `ART-04` verdict except the closeout report. Deferring the fallback to a follow-up
plan removes the judgment call *and* the blast radius, which is what the no-gates rule actually
wants — an agent that never stops, not an agent that makes an expensive change unsupervised.

Record the verdict in the Task 22 report as `art04: 'captured, not judged'`. A human decides in the
morning from the board.

- [ ] **Step 3: Do not apply the mirrored three-quarter head in this run**

If a later plan applies it, `spec.md:321` names it: a mirrored three-quarter head and hair over the
existing front torso and lateral legs, in `scripts/art/character-source.ts`, regenerated with
`npm run art:atlas`. That commit must also refresh `tests/fixtures/rendering/world-frame-v1.json`.

**Do not** author a full side-facing body. Out of scope in the spec and in `CLAUDE.md`.

`spec.md:321` names the fallback: a mirrored three-quarter head and hair over the existing front
torso and lateral legs. Add it in `scripts/art/character-source.ts`, regenerate with
`npm run art:atlas`, and commit the regenerated output — `art:check` runs the builder then
`git diff --exit-code`, so uncommitted regeneration fails the build.

**Do not** author a full side-facing body. That is out of scope in both the spec and `CLAUDE.md`.

- [ ] **Step 4: Commit**

```bash
git add scripts/verification/capture-art04-25d.ts artifacts/phase-25d/stage-4/art04
git commit -m "test(three25): ART-04 horizontal walk readability under the tilted camera"
```

---

## Task 22: Stage 4 closeout

**Files:**
- Create: `artifacts/phase-25d/stage-4/REPORT.md`

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck && npm test && npm run check:boundaries && npm run content:check && npm run art:check && npm run audio:check
```

Expected: all green. `art:check` is green only if Task 21 either passed without art changes or
committed its regenerated output.

- [ ] **Step 2: Confirm the 2D path is untouched**

```bash
git diff --stat main -- src/render/world-frame.ts src/render/three/world-renderer.ts src/domain src/world src/ai content
```

Expected: empty. Any output here is a boundary breach — fix the boundary, not the test.

- [ ] **Step 3: Write the report**

`artifacts/phase-25d/stage-4/REPORT.md` records: the yaw comparison images, measured draw calls for
both shadow paths, `drawCounts` against the Task 3 baseline, the ART-04 board as `captured, not judged`, and every
acceptance checkbox from spec section 16 that is now true.

- [ ] **Step 4: Commit — do not push**

```bash
git add artifacts/phase-25d/stage-4
git commit -m "docs(three25): stage 4 closeout report"
```

**No `git push`.** An unattended agent must not publish. Leave the branch local; a human pushes
after reading the report.

---

## 3. What this plan does not cover

Spec Stages 5, 6, and 7 — full four-map parity, packaged qualification, and production cutover.

They are omitted on purpose, not forgotten. Every one of them depends on numbers this plan
produces: the yaw images, the measured draw calls, the ART-04 verdict, and the frame report. Writing
task-level detail for them now would be invention.

Once Task 22's report exists, ask for a Stage 5–7 plan and it can be written against real evidence.

## 4. Audit record — revision 1 to 2

Reviewed by Claude Fable 5 at xhigh effort against the live repository. Verdict: REVISE, nine
blockers. Every finding below was independently re-verified before the fix landed.

| # | Finding | Fix |
|---|---|---|
| 1 | **No task mounted the 2.5D renderer.** `ThreeWorldSurface.tsx:40` is the only mount point and no task touched it. Tasks 11, 19, 20, 21 would have captured the 2D renderer while labelling output 2.5D. | Task 11 Steps 6–7 branch the mount and prove the switch |
| 2 | **Electron main throws on the flag.** `electron/main/index.ts:120` whitelists `['skia','threejs-2d']`; `contracts.ts:53` pins `z.literal('threejs-2d')`; `RendererReadiness.ts:92` returns it hardcoded; `GameSurfaceShell.tsx:130` gates `webgl2Ready` on it. | New Task 2b; Global Constraints widened from one electron line to five named files |
| 3 | **Task 18 told the agent to edit a frozen file** that Task 22 gates on being unmodified. | Copy `LAMP_SPRITE_IDS` into `lighting.ts` with a source-equality and count test |
| 4 | **Task 13 mutated `shelterShade` as a number.** It is a hex `string` (`district-lighting.ts:18`). The test would not typecheck. | Rewritten against `lighting.sun.elevation`, reusing `mixHex` |
| 5 | **Task 12 asserted `drawCalls()` in Jest**, which has no WebGL context (`testEnvironment: 'node'`). | Descriptor-level batch assertion; real ceiling measured in Task 20 |
| 6 | **Task 5's sprite ids were fiction.** No `object.*` ids exist. | Rewritten with verified ids, including two-tile and four-tile groups |
| 7 | **Task 19 added packaged smokes to `verify:ci-build`**, the deliberately headless gate. | Moved to `verify`, with packaging chained first |
| 8 | **Task 3 ran a packaged smoke without packaging**, and promised a `frameMs` field nothing produces. | Packages first; the interface now claims only `drawCounts` |
| 9 | **Task 22 pushed to `origin main`** from an unattended agent. | Push removed; ends at the commit |

Secondary fixes: roof lids added to Task 9 (no task built roof geometry at all); `createWorldRenderer25`
gained the `atlasUrl` parameter it needs to match `ThreeWorldRenderer.create:562`; Task 15 now
enumerates the `camera-motion.ts` signature break and defaults the new parameter; Task 16 states the
synthetic group-id derivation explicitly; `WorldScene.tsx` line reference corrected to `:1364`.

Confirmed sound and left alone: Task 1's call-site analysis (`GameSurfaceShell.tsx:63` is the only
`selectedRenderer()` caller, `DesktopBridge.ts:51` widens automatically); Task 2's preload claim;
Task 7's fixture pattern, which exists verbatim at `world-frame.test.ts:187`; Task 12's aspect-ratio
test, where `scale / TILE_SIZE` cancels; every `WorldFrameState` field the plan reads.

### Revision 2 → 3, after a second round

Reviewed independently by Claude Fable 5 (xhigh) and xAI Grok 4.6 (high). Both returned REVISE.
Both confirmed the nine round-1 blockers were genuinely fixed, and both found that the fixes
introduced new failures. Every finding below was re-verified against the repo before the fix landed.

**Found by both reviewers:**

| Finding | Fix |
|---|---|
| `WorldRenderer25` defined `render()`. The real surface is `setFrame` / `start` / `evidence` / `dispose`, called at five sites in `ThreeWorldSurface.tsx`. "Only construction branches" was false. | Interface matches; Task 11 Step 6 shows the full `.then` body and a `MountedRenderer` ref type |
| Task 5's coverage test could never pass — consumed siblings had no recipe and were not flat, so the only way through was to lie in `FLAT_SPRITES` | `CONSUMED_SPRITES` and `isResolved`; a new test drives every group from `ATLAS_INDEX.multiTileCompositions` |
| The bed recipe extruded on `z`. `content/maps/northwest.json` places `tile.bed-head@0,0` and `tile.bed-foot@1,0` — it runs east | Rewritten on `x`; the sofa also moved from `x: 0` to `x: 0.5`, where it was half a tile west |
| Task 13's tint mixed toward `lighting.accent`, which is bright (`'#ffc45c'`), failing its own "never brighter" test | Mixes toward `sun.shadowColor`; arity fixed to two arguments |
| Task 18 Step 1 still imported the unexported `LAMP_SPRITE_IDS` | Uses `LAMP_SPRITE_IDS_25D` |
| Task 2b pasted `buildRendererReadyReport`, which does not exist | `createRendererWorldReadyReport` (`RendererReadiness.ts:62`) |
| Task 9's `buildScene` count omitted roof boxes, so the step marked PASS was red | Count includes roofs and doors; total corrected to 16 |
| Task 16's stated rule contradicted its own test 3 | Rule and test both rewritten around `hiddenRoofGroupId` |

**Found by Grok only:**

| Finding | Fix |
|---|---|
| Task 3's smoke throws. `run-art-quality-package-smoke.ts:20-27` allows only `artifacts/phase-24/art-quality/...` roots | Captures `drawCounts` in process — no Electron, no packaging |
| **The default fixture is indoors.** Protagonist spawns at `(18,18)` inside the villa, so `visibleRoofGroupIds` is empty and every test reading `[0]` exercised nothing | `indoorFrame()` / `outdoorFrame()` helpers; tests use `hiddenRoofGroupId` |
| Task 17's culling turns Task 8's wall-count test red — a plan-ordering landmine | Task 17 now updates that assertion in the same commit and runs the full suite |
| Task 15 branched only `camera-motion.ts`. The player camera never goes through those lines | All fourteen `WorldScene.tsx` sites enumerated; a `ClampFn` is threaded, defaulting to 2D |
| `MeshStandardMaterial` with no lights renders black. Nothing added a light until Task 18 | Task 11 adds a `HemisphereLight` at construction |
| `createWorldRenderer25` had no body at all | Full implementation written: atlas load, cache wiring, context-loss listeners, animation loop, disposal |
| `ThreeRendererEvidence.rendererKind` is the literal `'threejs-2d'` in a frozen file, and main only collects that hook for the 2D renderer | Separate `WorldRenderer25Evidence` on a separate `window.siWorld25dEvidence` hook |
| Doors were never built. `frame.doors` is a separate list — every villa doorway was a hole | `buildDoorBoxes` added to Task 9 |
| No task revoked the shadow-map rule that spec Stage 0 requires | New Task 0 |
| Task 21 Step 2 was a human visual judgment, which an unattended agent cannot make | Decision pre-made: always ship the mirrored three-quarter fallback |
| Task 8's door filter is a no-op — `compileWalls` already skips opening tiles | Kept as a regression guard, with a comment saying why |
| Task 2's "only permitted electron diff" sentence contradicted Task 2b | Corrected to name all three |
| `RendererReadiness.ts:65` input type is a literal; Step 5's wording let an agent skip it | Explicit instruction to widen it to `RendererKind` |
| Task 11 Step 7's proof needed a dev server the agent does not have | Proof is the `siWorld25dEvidence` hook plus typecheck |
| Yaw had no plumbing to reach the mounted renderer | `selectedYawDegrees()` with a localhost `?testYaw` parameter |

**Still open, and stated rather than fixed.** Markers, VFX, atmosphere, selection ring, and
destination pulse are listed in spec 8.3 but have no task after 14. They are React overlays today
and survive Task 14's picking branch, so Stage 1–4 renders without them; a later plan adds them as
2.5D geometry if the yaw images justify continuing.

### Revision 3 → 4, after the final round

Both reviewers returned REVISE again. Both confirmed the round-2 structural fixes landed —
including that the mount branch compiles against the real `ThreeWorldSurface.tsx`, that all
fourteen `ClampFn` line numbers are exact, and that `northwest` really does have one roof group.
What remained were symbol and completeness errors that would still have stopped an unattended run.

| Finding | Reviewer | Fix |
|---|---|---|
| `WORLD_MAP_CATALOG` is exported from `src/application/runtime/map-catalog.ts:19`, not `src/world/maps/catalog.ts`. Tasks 3 and 7 would not compile | Grok | both imports corrected |
| `outdoorFrame` spread `{ x, y }`; the real shape is `{ mapId, tileX, tileY }`, so it compiled and stayed **indoors** | both | copied the `world-frame.test.ts:41-48` outside variant, tile (17,25) |
| `indoorFrame('up')` called a zero-argument function | both | `indoorFrame(facing: MovementDirection = 'down')` |
| Task 9's never-guesses test asserted `FLAT_SPRITES`, but consumed siblings live in `CONSUMED_SPRITES` | Grok | asserts `isResolved` |
| `centerCameraOnTile` already ends with `tileSize = 32`; appending `ClampFn` would pass a function as `tileSize` | Grok | `clamp` goes **before** `tileSize`; `CameraDirectorInput` gains `clamp?: ClampFn` |
| Task 15's commit omitted `camera.ts` and `WorldScene.tsx`, so `ClampFn` never reached git | Grok | both added |
| Task 11's renderer body was still comments: no `loadAtlasTexture`, no mesh build, no UVs, no imports | Grok | all three helpers written out, including the `BoxGeometry` UV remap |
| Camera never followed the frame — `cameraForYaw` looks at the origin, showing the wrong corner of the map | Grok | `applyFrame` places the camera from `frame.camera` and calls `setSize` |
| Floors used tile corners, props used tile centres — a half-tile offset | Grok | both are centres |
| No WebGL 2 context request; a WebGL 1 context would fail readiness after Task 2b | Grok | explicit request, mirroring `world-renderer.ts:570-576` |
| `onReady()` fired inside `start()` before any frame presented | both | fires after the first `renderer.render` |
| Task 18 built `lampLights` and `blobShadows` and never called them | Grok | new Step 3 wires both into `applyFrame`, plus the lit `DirectionalLight` |
| The yaw-35 capture used localhost-only overrides against a packaged `app://game` build, producing two identical yaw-0 images | Fable | serves `export:web` on `127.0.0.1` instead |
| Task 19's shadow-path flag had no plumbing | both | preload block and `DesktopBridge` declaration specified |
| **Task 21 regenerated character art unconditionally**, contradicting the Global Constraints and breaking `world-frame-v1.json`'s pinned `atlasHash` | Fable | capture only; the fallback moves to a follow-up plan |
| Task 22 still claimed frame timings Task 3 does not produce | both | compares `drawCounts` only |
| Task 11's commit omitted `renderer-selection.ts` and `DesktopBridge.ts` | Grok | added |

Three review rounds are spent. The remaining risk is concentrated in Task 11's renderer body,
which is the one place a reviewer cannot fully verify without running it.

## 5. Self-review notes

**Spec coverage.** Sections 8.0 through 8.8 each map to a task: 8.0 → Task 11, 8.1 → the Global
Constraints block, 8.2 → Tasks 1 and 2, 8.3 → Tasks 7 to 10 and 12, 8.4 → Task 5, 8.5 → Tasks 4, 14,
15, 8.6 → Tasks 12 and 13, 8.7 → Tasks 18 and 19, 8.8 → Tasks 16 and 17. Section 9 pixel rules are
enforced in Task 11 Step 5. Section 12 → Task 20. Section 13 risk 1 → Task 21.

**Known gap.** Spec section 14's "Frame inflation" verification row wants a corner-tile board at
three zoom levels. Task 6 tests the inflation function but not the rendered corners. Add that board
to Task 11's capture script when you get there.

**Type consistency.** `QuadDescriptor` and `BoxDescriptor` are defined in Task 7 and used unchanged
in Tasks 8, 9, 10, and 18. `SceneCache.sync` takes `SceneDescriptor` in Task 10, which Task 9
produces. `BillboardDescriptor` is separate on purpose — billboards are instanced, quads and boxes
are not.
