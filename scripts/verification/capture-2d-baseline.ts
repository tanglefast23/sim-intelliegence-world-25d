import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { WORLD_MAP_CATALOG } from '../../src/application/runtime/map-catalog';
import { createInitialState } from '../../src/domain/state/initial-state';
import { buildWorldFrameState } from '../../src/render/world-frame';
import { resolveEvidenceOutputRoot } from './evidence-output';

/**
 * Records what the 2D renderer draws, before any 2.5D code exists. Task 22 of
 * docs/plans/2026-08-17-feat-threejs-2-5d-renderer-plan.md compares the 2.5D scene against this
 * file.
 *
 * Only `drawCounts` is captured, because only `drawCounts` is something this process can actually
 * measure. Frame timings need a real GPU and a running window, so they come from the packaged
 * smoke's own report instead — never from here.
 *
 * The frame is built in process. No Electron, no packaging, no window. The default view covers the
 * whole map, so the counts are the full-map totals rather than one camera's window.
 */
const OUTPUT_ROOT = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-0',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

function commitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

const frame = buildWorldFrameState(
  WORLD_MAP_CATALOG.northwest_residential,
  createInitialState(),
  {},
  'down',
  0,
);

// No Date.now(). Unseeded time in generated output breaks this repo's determinism rules, and the
// commit sha already says when this was taken.
const baseline = {
  commit: commitSha(),
  renderer: 'threejs-2d',
  mapId: 'northwest_residential',
  drawCounts: frame.drawCounts,
};

mkdirSync(OUTPUT_ROOT, { recursive: true });
const output = join(OUTPUT_ROOT, 'baseline.json');
writeFileSync(output, `${JSON.stringify(baseline, null, 2)}\n`);
console.log(`Wrote ${output}`);
