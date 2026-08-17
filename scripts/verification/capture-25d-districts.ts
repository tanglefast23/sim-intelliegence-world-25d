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

/**
 * The ambient VFX phase to pin.
 *
 * Step 0 is the phase where nothing has happened yet: no steam has risen, no flame has flickered,
 * no glint has moved. Three of these four captures are framed on a fixture, so scoring at step 0
 * scores an effect that is not showing. Step 2 is mid-cycle for every recipe.
 */
const VFX_STEP = 2;

/**
 * Where the protagonist stands for each capture.
 *
 * Chosen by counting render parts and lamps inside the window a zoom-3 frame actually shows, not by
 * eye, and required to be within about three tiles of a lamp. The fixtures these captures use to
 * reach a map put the player wherever the effect is, which framed the harbour on 70% empty yard
 * with its cargo half out of shot.
 *
 * Density alone is not enough. A first pass picked the densest windows and ignored the lamps, and
 * dropped the harbour's mean luminance by 50 - a dense corner with no light in it is a dark corner.
 * The scene is built around pooled light, so the player has to stand in a pool.
 */

void captureScenes(
  [
    {
      name: 'northwest-villa', shadowPath: 'lit', zoom: 3, minute: NIGHT, centreOnPlayer: true,
      vfxStep: VFX_STEP, standOnTile: { x: 16, y: 19 },
    },
    {
      name: 'northeast-downtown', shadowPath: 'lit', zoom: 3, minute: NIGHT, centreOnPlayer: true, vfxStep: VFX_STEP,
      district: { mapId: 'northeast_downtown', effectId: 'club-neon-west' },
      standOnTile: { x: 17, y: 17 },
    },
    {
      name: 'southwest-commercial', shadowPath: 'lit', zoom: 3, minute: NIGHT, centreOnPlayer: true, vfxStep: VFX_STEP,
      // No `standOnTile`: the steam fixture's own placement already frames the stall row, and the
      // densest-window pick landed in an empty plaza. A tile count is not a composition.
      district: { mapId: 'southwest_commercial', effectId: 'courtyard-steam-west' },
    },
    {
      name: 'southeast-docks', shadowPath: 'lit', zoom: 3, minute: NIGHT, centreOnPlayer: true, vfxStep: VFX_STEP,
      district: { mapId: 'southeast_docks', effectId: 'yard-steam' },
      standOnTile: { x: 46, y: 37 },
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
