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
    // Night, centred on the protagonist: the reference is a dark room lit by a lamp, so a
    // daylight street shot cannot be judged against it.
    { name: 'villa-interior-night', shadowPath: 'lit', zoom: 3, minute: 1245, centreOnPlayer: true },
    { name: 'villa-interior-day', shadowPath: 'lit', zoom: 3, centreOnPlayer: true },
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
