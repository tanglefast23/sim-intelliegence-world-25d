import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';
import { tileCenterWorld, worldToScreenTilted } from '../../src/render/three25/projection';

/** Is the harbour water emitter actually on screen when its fixture is captured? */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-5/bisect',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

const EMITTER = { x: 55, y: 30 };
const VIEWPORT = { width: 1280, height: 720 };

void captureScenes(
  [{
    name: 'water-frame-probe', shadowPath: 'lit', zoom: 3, minute: 1245, centreOnPlayer: true,
    vfxStep: 2, district: { mapId: 'southeast_docks', effectId: 'harbor-water-glint-north' },
    standOnTile: { x: 55, y: 33 },
    // Any point: the click is only here because it is the one hook that reports the live camera.
    clickPixel: { x: 8, y: 8 },
  }],
  evidenceRoot,
).then(([scene]) => {
  const parsed = /World camera (-?[\d.]+),(-?[\d.]+) at ([\d.]+)x/u.exec(scene!.click!.cameraLabel);
  if (!parsed) throw new Error(`Unreadable camera: ${scene!.click!.cameraLabel}`);
  const camera = { x: Number(parsed[1]), y: Number(parsed[2]), zoom: Number(parsed[3]) };
  const screen = worldToScreenTilted(camera, tileCenterWorld(EMITTER));
  const inside = screen.x >= 0 && screen.y >= 0
    && screen.x < VIEWPORT.width && screen.y < VIEWPORT.height;
  console.log(`player tile ${scene!.click!.tileBefore}`);
  console.log(`camera ${camera.x},${camera.y} at ${camera.zoom}x`);
  console.log(`emitter ${EMITTER.x},${EMITTER.y} projects to ${Math.round(screen.x)},${Math.round(screen.y)}`);
  console.log(inside ? 'ON SCREEN - the clamp is not the cause' : 'OFF SCREEN - the camera never framed it');
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
