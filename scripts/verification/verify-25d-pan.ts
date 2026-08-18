import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';
import { groundFootprintBounds, screenToWorldTilted } from '../../src/render/three25/projection';

/**
 * Proves middle-drag pan works on the shipping renderer, end to end.
 *
 * The packaged smoke's `middlePan` check runs against the 2D renderer, because smoke mode defaults
 * to `threejs-2d` and names its evidence after that. Production ships 2.5D. So the path players
 * actually pan on had no input coverage at all, and it shipped broken twice: first because the flat
 * `panCamera` rule slid the ground diagonally under a yawed camera, then because the clamp kept the
 * map fully covering the screen, which at the default 1x zoom left 125 x 387 world pixels of travel
 * on a 1280x720 window. Both times the unit tests were green.
 *
 * Two drags, because there are two ways for this to be dead:
 *
 * 1. A long drag from mid-screen must move the camera FAR, not a few pixels. The assertion is
 *    against the drag actually requested — `screenToWorldTilted` says what world delta a screen
 *    delta means — with a tolerance for the clamp stopping the tail of it.
 * 2. A drag that STARTS over void must still pan. `handlePointerDown` used to gate every button on
 *    "is there map under the cursor", which is right for a click on the world and wrong for a
 *    camera control: it refused the very drag that pans back off the edge. Drag 1 pushes the camera
 *    to its stop precisely so drag 2 can start on the void that exposes.
 *
 * If drag 1 does not actually expose void under drag 2's start pixel, this reports inconclusive
 * rather than passing — a check that silently degrades to "clicked on the map again" is the failure
 * mode the click proof already had to be rescued from.
 */
const VIEWPORT = { width: 1280, height: 720 } as const;
/** Mirrors `MAP_PIXELS` in `WorldScene.tsx`. Every map in the catalogue is this size. */
const MAP_PIXELS = { width: 64 * 32, height: 48 * 32 } as const;
/**
 * A long drag toward the north-west, chosen to clear two traps that both mimic a broken pan.
 *
 * A move sent past the window edge is dropped whole: the first run dragged to x=1540 on a
 * 1280-wide window, delivered half the distance, and read exactly like a clamp stopping early. And
 * a press that lands on the HUD is ignored by `isUiTarget`, so starting at 200,160 — under the
 * location chip — reported a camera that had not moved at all. So: start clear of the HUD, and end
 * inside the window.
 */
const LONG_FROM = { x: 400, y: 300 } as const;
const LONG_DRAG = { x: 800, y: 380 } as const;
/** Void after the long drag: this pixel unprojects west of the map's western edge. */
const VOID_START = { x: 300, y: 200 } as const;
const VOID_DRAG = { x: -240, y: -140 } as const;

const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-5/pan',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

function worldAt(camera: Readonly<{ x: number; y: number; zoom: number }>, screen: Readonly<{ x: number; y: number }>) {
  return screenToWorldTilted(camera, screen);
}

function isVoid(camera: Readonly<{ x: number; y: number; zoom: number }>, screen: Readonly<{ x: number; y: number }>): boolean {
  const world = worldAt(camera, screen);
  return world.x < 0 || world.y < 0 || world.x >= MAP_PIXELS.width || world.y >= MAP_PIXELS.height;
}

async function main(): Promise<void> {
  const [scene] = await captureScenes(
    [{ name: 'pan', freezeNpcMotion: true, panDrag: [
      { from: LONG_FROM, by: LONG_DRAG },
      { from: VOID_START, by: VOID_DRAG },
    ] }],
    evidenceRoot,
    VIEWPORT,
  );
  const drags = scene?.pan;
  if (!drags || drags.length !== 2) throw new Error(`Expected two drags, got ${JSON.stringify(drags)}`);
  const [long, fromVoid] = drags as [typeof drags[number], typeof drags[number]];

  // Drag 1: the camera should travel most of what the drag asked for.
  const wanted = screenToWorldTilted({ x: 0, y: 0, zoom: long.before.zoom }, LONG_DRAG);
  const movedX = long.before.x - long.after.x;
  const movedY = long.before.y - long.after.y;
  const askedFor = Math.hypot(wanted.x, wanted.y);
  const travelled = Math.hypot(movedX, movedY);
  const footprint = groundFootprintBounds(VIEWPORT, long.before.zoom);
  const longEnough = travelled >= askedFor * 0.9;

  // Drag 2: must have started over void, and must have moved the camera.
  const startedOverVoid = isVoid(long.after, VOID_START);
  const voidTravel = Math.hypot(fromVoid.after.x - fromVoid.before.x, fromVoid.after.y - fromVoid.before.y);
  const panFromVoid = voidTravel > 1;

  const report = {
    viewport: VIEWPORT,
    zoom: long.before.zoom,
    footprint: { width: footprint.width, height: footprint.height },
    longDrag: { ...long, askedForWorld: askedFor, travelledWorld: travelled, longEnough },
    voidDrag: { ...fromVoid, startedOverVoid, travelledWorld: voidTravel, panFromVoid },
  };
  writeFileSync(join(evidenceRoot, 'pan-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  if (!longEnough) {
    throw new Error(`Middle-drag travelled ${travelled.toFixed(1)} world px of the ${askedFor.toFixed(1)} asked for.`);
  }
  if (!startedOverVoid) {
    throw new Error(
      `Inconclusive: ${VOID_START.x},${VOID_START.y} is still on the map after the first drag, so the void case never ran.`,
    );
  }
  if (!panFromVoid) throw new Error('A middle-drag started over void did not move the camera.');
  console.log(`Pan verified: ${travelled.toFixed(1)} world px dragged, and a drag from void moved ${voidTravel.toFixed(1)}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
