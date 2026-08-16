import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';

/**
 * Renders the same villa frame at yaw 0 and yaw 35 so a human can judge whether the target look
 * survives the straight-on tilt this plan ships, plus one lit-path frame beside the fallback.
 *
 * This does not block anything. Production stays at yaw 0 on the fallback path; the images exist
 * for a person to look at.
 */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-1/yaw-comparison',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

async function main(): Promise<void> {
  const scenes = await captureScenes(
    [
      { name: 'yaw-0-fallback', yawDegrees: 0, shadowPath: 'fallback' },
      { name: 'yaw-35-fallback', yawDegrees: 35, shadowPath: 'fallback' },
      { name: 'yaw-0-lit', yawDegrees: 0, shadowPath: 'lit' },
    ],
    evidenceRoot,
  );

  const output = join(evidenceRoot, 'yaw-comparison.json');
  writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, captures: scenes }, null, 2)}\n`);
  for (const scene of scenes) {
    console.log(`Wrote ${join(evidenceRoot, scene.screenshot)} (${String(scene.evidence.drawCalls)} draw calls)`);
  }
  console.log(`Wrote ${output}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
