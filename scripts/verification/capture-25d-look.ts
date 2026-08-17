import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';

/** One frame at the shipped defaults, to look at the current art. */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-4/look',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

void captureScenes([{ name: 'look-lit', shadowPath: 'lit' }], evidenceRoot)
  .then((scenes) => {
    for (const scene of scenes) {
      console.log(`${scene.name}: yaw ${String(scene.evidence.yawDegrees)}, ${String(scene.evidence.drawCalls)} draw calls`);
    }
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
