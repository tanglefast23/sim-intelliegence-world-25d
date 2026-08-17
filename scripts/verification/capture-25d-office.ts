import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';

/**
 * The Ledger Annex, shot the same way the four districts are, so it is judged to the same bar.
 *
 * Four frames rather than one, because this is the first INTERIOR built for the 2.5D path and the
 * things that can go wrong there are not the things that go wrong outdoors:
 *
 * - `cubicles-night` is the scene. Fourteen troffers, twelve partitions and thirteen clerks under
 *   an overhead key. This is the frame the rubric is scored against.
 * - `cubicles-noon` is the control. The sun does the work and the panels sit near-off, so a colour
 *   or material fault that the night rig would hide shows here instead. A capture round that
 *   changes a lighting constant and cannot see it at night can always see it at noon.
 * - `hall-night` is the spine: a yaw-45 frame down the hallway with cubicle faces to the north and
 *   the kitchen and manager doors to the south. It is the shot that fails if the rooms read as one
 *   undifferentiated grey box.
 * - `cubicles-night-fallback` is the no-lights path. Spec 8.7 requires it to ship and to be
 *   judged, and an interior is where it is most likely to collapse: with the point lights gone,
 *   only the hemisphere floor stands between a windowless room and a black plate.
 *
 * The player is relocated through `office-kettle-steam` because that is how a capture reaches a map
 * it does not spawn on, then moved onto the tile the shot is actually composed around. The kettle
 * is in the kitchen and the scene is the cubicle farm; standing where the effect is would frame a
 * counter.
 */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-6/office',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

const NIGHT = 1245;
const NOON = 720;

/** Mid-cycle for every recipe. Step 0 is before any steam has risen. */
const VFX_STEP = 2;

/**
 * The aisle between the SECOND and THIRD cubicle rows.
 *
 * Measured, not chosen by eye. From the first aisle at y = 12 a zoom-3 frame looks over the north
 * wall at y = 6 and puts a wedge of unlit exterior in the top corner — which is correct for the
 * world (there are no lot lamps) and wrong for a composition: it cost 0.13 dead fraction and
 * pushed pooling to 2.16 against a 1.9 ceiling, by adding void rather than by pooling the light.
 */
const CUBICLE_VIEW = { x: 20, y: 17 } as const;

/** Mid-hallway, so the frame carries cubicle faces north and two doorways south. */
const HALL_VIEW = { x: 24, y: 24 } as const;

const office = { mapId: 'west_office', effectId: 'office-kettle-steam' } as const;

void captureScenes(
  [
    {
      name: 'cubicles-night', shadowPath: 'lit', zoom: 3, minute: NIGHT, centreOnPlayer: true,
      vfxStep: VFX_STEP, district: office, standOnTile: CUBICLE_VIEW,
    },
    {
      name: 'cubicles-noon', shadowPath: 'lit', zoom: 3, minute: NOON, centreOnPlayer: true,
      vfxStep: VFX_STEP, district: office, standOnTile: CUBICLE_VIEW,
    },
    {
      name: 'hall-night', shadowPath: 'lit', zoom: 3, minute: NIGHT, centreOnPlayer: true,
      vfxStep: VFX_STEP, district: office, standOnTile: HALL_VIEW,
    },
    {
      name: 'cubicles-night-fallback', shadowPath: 'fallback', zoom: 3, minute: NIGHT,
      centreOnPlayer: true, vfxStep: VFX_STEP, district: office, standOnTile: CUBICLE_VIEW,
    },
  ],
  evidenceRoot,
).then((scenes) => {
  writeFileSync(
    join(evidenceRoot, 'office.json'),
    `${JSON.stringify({ schemaVersion: 1, scenes }, null, 2)}\n`,
  );
  for (const scene of scenes) {
    console.log(`${scene.name}: ${String(scene.evidence.drawCalls)} draw calls, ${String(scene.evidence.meshCount)} descriptors`);
  }
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
