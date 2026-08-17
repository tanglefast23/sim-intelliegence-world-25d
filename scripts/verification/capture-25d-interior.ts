import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';

/**
 * The acceptance shot: the villa INTERIOR at the shipped yaw, zoomed in.
 *
 * Every capture before this one was exterior, so the target look - a room, matching the spike
 * reference - was unproven exactly where it matters.
 */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-4/interior',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

void captureScenes(
  [
    { name: 'villa-interior-lit', shadowPath: 'lit', zoom: 3 },
    { name: 'villa-interior-fallback', shadowPath: 'fallback', zoom: 3 },
  ],
  evidenceRoot,
).then((scenes) => {
  for (const scene of scenes) {
    console.log(`${scene.name}: yaw ${String(scene.evidence.yawDegrees)}, ${String(scene.evidence.drawCalls)} draw calls`);
  }
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
