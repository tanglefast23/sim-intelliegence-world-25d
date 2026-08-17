import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';

/**
 * One night shot per district, so every part of the city can be judged to the same bar.
 *
 * The protagonist only spawns in the villa, so the other three are reached through the app's own
 * VFX fixture, which relocates the player to frame an effect.
 */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-4/districts',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

const NIGHT = 1245;

void captureScenes(
  [
    { name: 'northwest-villa', shadowPath: 'lit', zoom: 3, minute: NIGHT, centreOnPlayer: true },
    {
      name: 'northeast-downtown', shadowPath: 'lit', zoom: 3, minute: NIGHT, centreOnPlayer: true,
      district: { mapId: 'northeast_downtown', effectId: 'club-neon-west' },
    },
    {
      name: 'southwest-commercial', shadowPath: 'lit', zoom: 3, minute: NIGHT, centreOnPlayer: true,
      district: { mapId: 'southwest_commercial', effectId: 'courtyard-steam-west' },
    },
    {
      name: 'southeast-docks', shadowPath: 'lit', zoom: 3, minute: NIGHT, centreOnPlayer: true,
      district: { mapId: 'southeast_docks', effectId: 'yard-steam' },
    },
  ],
  evidenceRoot,
).then((scenes) => {
  writeFileSync(
    join(evidenceRoot, 'districts.json'),
    `${JSON.stringify({ schemaVersion: 1, scenes }, null, 2)}\n`,
  );
  for (const scene of scenes) {
    console.log(`${scene.name}: ${String(scene.evidence.drawCalls)} draw calls, ${String(scene.evidence.meshCount)} descriptors`);
  }
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
