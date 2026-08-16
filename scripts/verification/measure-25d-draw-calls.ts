import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ATLAS_DRAW_CALL_CEILING, DRAW_CALL_CEILING } from '../../src/render/three25/ceilings';
import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';

/**
 * Measures the real draw-call cost of the 2.5D renderer, on both shadow paths.
 *
 * The plan's section 1 set 40/16 provisionally and deliberately generously. This is what replaces
 * the guess with a number.
 *
 * **Reads `window.siWorld25dEvidence()`, not `siWorldThreeRendererEvidence`.** The latter is typed
 * to `ThreeRendererEvidence`, whose `rendererKind` is the literal `'threejs-2d'` in a frozen file,
 * and `electron/main/index.ts` only collects it for the 2D renderer. The 2.5D path has its own
 * hook for exactly this reason.
 *
 * Every scene is the villa start position at the app's own automatic zoom for a 1280x720 surface,
 * which is the busiest frame the renderer draws on this map: interior geometry, the surrounding
 * terrace and the cast all in one window. Yaw 35 is included because it pulls in the widest tile
 * window of any angle the renderer can be asked for.
 *
 * **No scripted pan, on purpose.** After the merge in Task 11 the count is structural rather than
 * view-dependent — the renderer bakes a fixed set of batches, so panning changes how much geometry
 * is inside them, not how many there are. The identical descriptor count and identical call count
 * across both yaws is the evidence for that. A pan would sample emptier windows, not busier ones.
 */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-4',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

async function main(): Promise<void> {
  const scenes = await captureScenes(
    [
      { name: 'measure-yaw0-fallback', yawDegrees: 0, shadowPath: 'fallback' },
      { name: 'measure-yaw0-lit', yawDegrees: 0, shadowPath: 'lit' },
      { name: 'measure-yaw35-fallback', yawDegrees: 35, shadowPath: 'fallback' },
      { name: 'measure-yaw35-lit', yawDegrees: 35, shadowPath: 'lit' },
    ],
    evidenceRoot,
  );

  const maximum = Math.max(...scenes.map((scene) => scene.evidence.drawCalls));
  const maximumAtlas = Math.max(...scenes.map((scene) => scene.evidence.atlasDrawCalls));
  const maximumDescriptors = Math.max(...scenes.map((scene) => scene.evidence.meshCount));

  const report = {
    schemaVersion: 1 as const,
    ceiling: DRAW_CALL_CEILING,
    atlasCeiling: ATLAS_DRAW_CALL_CEILING,
    maximumDrawCalls: maximum,
    maximumAtlasDrawCalls: maximumAtlas,
    maximumDescriptors,
    // What the ceilings would be set to from this run: the measured maximum, plus room for one
    // extra pass and one material split.
    recommendedCeiling: maximum + 2,
    recommendedAtlasCeiling: maximumAtlas + 2,
    scenes: scenes.map((scene) => ({
      name: scene.name,
      yawDegrees: scene.evidence.yawDegrees,
      shadowPath: scene.evidence.shadowPath,
      drawCalls: scene.evidence.drawCalls,
      atlasDrawCalls: scene.evidence.atlasDrawCalls,
      descriptors: scene.evidence.meshCount,
      screenshot: scene.screenshot,
    })),
  };

  const output = join(evidenceRoot, 'draw-calls.json');
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${output}`);
  for (const scene of scenes) {
    console.log(
      `  ${scene.name}: ${String(scene.evidence.drawCalls)} draw calls`
      + ` (${String(scene.evidence.atlasDrawCalls)} atlas), ${String(scene.evidence.meshCount)} descriptors`,
    );
  }
  console.log(`Maximum ${String(maximum)} total / ${String(maximumAtlas)} atlas.`);
  console.log(`Ceilings ${String(DRAW_CALL_CEILING)} / ${String(ATLAS_DRAW_CALL_CEILING)}; this run recommends ${String(maximum + 2)} / ${String(maximumAtlas + 2)}.`);

  if (maximum > DRAW_CALL_CEILING || maximumAtlas > ATLAS_DRAW_CALL_CEILING) {
    // A breach means a NEW pass, a new material, or a mesh that stopped being merged - the count
    // is structural, so it is not "too much geometry". Fold the work into the existing batches
    // before raising the ceiling.
    throw new Error(
      `Measured ${String(maximum)} total / ${String(maximumAtlas)} atlas draw calls, over `
      + `${String(DRAW_CALL_CEILING)} / ${String(ATLAS_DRAW_CALL_CEILING)}. Something added a pass, `
      + 'a material, or an unmerged mesh. Fold it into the existing batches before raising these.',
    );
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
