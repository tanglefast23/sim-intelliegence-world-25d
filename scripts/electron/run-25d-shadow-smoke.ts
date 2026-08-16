import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureScenes } from '../verification/hidden-window-capture';
import { resolveEvidenceOutputRoot } from '../verification/evidence-output';
import { DRAW_CALL_CEILING } from '../../src/render/three25/ceilings';

/**
 * One smoke per shadow path, so neither path can rot into dead code.
 *
 * Both run on every `verify`. The fallback is what production ships; the lit path is selected
 * explicitly and would otherwise go unexercised until someone turned it on and found it broken.
 *
 * **Not a packaged smoke.** A packaged capture needs a bespoke mode in `electron/main/index.ts`,
 * which the plan's Global Constraints freeze. This drives the real renderer in a real hidden
 * Electron window with a real WebGL 2 context, over the web export served on loopback — the
 * `app://game/` protocol and the desktop bridge are the parts it does not cover.
 */
const path = process.argv.includes('--lit') ? 'lit' : 'fallback';
const evidenceRoot = resolveEvidenceOutputRoot(
  process.argv.slice(2).filter((argument) => argument !== '--lit' && argument !== '--fallback'),
  {
    defaultRelative: `artifacts/phase-25d/stage-3/${path}`,
    allowedRootPrefixes: ['artifacts/phase-25d'],
  },
);

async function main(): Promise<void> {
  const scenes = await captureScenes(
    [
      { name: `villa-${path}`, yawDegrees: 0, shadowPath: path },
    ],
    evidenceRoot,
  );

  /** A villa frame emits over two thousand descriptors, so anything near zero is a stub. */
  const MINIMUM_DESCRIPTORS = 500;

  for (const scene of scenes) {
    if (scene.evidence.rendererKind !== 'threejs-2-5d') {
      throw new Error(`${scene.name} rendered ${scene.evidence.rendererKind}, not the 2.5D renderer.`);
    }
    // The assertion that gives two smokes a reason to exist. `scene.shadowPath` is only the query
    // that was sent; `scene.evidence.shadowPath` is what the renderer built. Without comparing
    // them, an ignored override would run the fallback twice, both smokes would pass, and the lit
    // path could rot unnoticed.
    if (scene.evidence.shadowPath !== path) {
      throw new Error(
        `${scene.name} asked for the ${path} path and the renderer built ${scene.evidence.shadowPath}.`,
      );
    }
    if (scene.evidence.shadowMapEnabled !== (path === 'lit')) {
      throw new Error(
        `${scene.name} on the ${path} path reported shadowMapEnabled ${String(scene.evidence.shadowMapEnabled)}.`,
      );
    }
    if (scene.evidence.yawDegrees !== 0) {
      throw new Error(`${scene.name} rendered at yaw ${String(scene.evidence.yawDegrees)}; production ships yaw 0.`);
    }
    if (scene.evidence.drawCalls > DRAW_CALL_CEILING) {
      throw new Error(
        `${scene.name} used ${String(scene.evidence.drawCalls)} draw calls, over the ceiling of ${String(DRAW_CALL_CEILING)}.`,
      );
    }
    if (scene.evidence.meshCount < MINIMUM_DESCRIPTORS) {
      throw new Error(
        `${scene.name} drew only ${String(scene.evidence.meshCount)} descriptors; a villa frame emits thousands.`,
      );
    }
    if (statSync(join(evidenceRoot, scene.screenshot)).size === 0) {
      throw new Error(`${scene.name} wrote an empty screenshot.`);
    }
  }

  const report = { schemaVersion: 1 as const, shadowPath: path, ceiling: DRAW_CALL_CEILING, scenes };
  const output = join(evidenceRoot, 'smoke.json');
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${output}`);
  for (const scene of scenes) {
    console.log(`  ${scene.name}: ${String(scene.evidence.drawCalls)} draw calls, ${String(scene.evidence.meshCount)} descriptors`);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
