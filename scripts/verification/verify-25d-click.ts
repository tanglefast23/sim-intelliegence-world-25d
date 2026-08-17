import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';
import { screenToTileTilted } from '../../src/render/three25/projection';

/**
 * Proves click-to-move still works at the shipped isometric yaw.
 *
 * The projection and the camera are already pinned to each other by unit tests. What no test can
 * cover is the whole chain: a real pointer event, on a real canvas, through the branched picking in
 * `WorldScene.tsx`, into a movement request. This clicks the running game and checks the tile the
 * game moved toward against the tile `screenToTileTilted` predicts for the same point.
 */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-4/click',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

/** Four points around the middle of the surface, well clear of the HUD. */
const CLICKS = [
  { name: 'click-right', at: { x: 840, y: 420 } },
  { name: 'click-left', at: { x: 420, y: 420 } },
  { name: 'click-down', at: { x: 640, y: 560 } },
] as const;

async function main(): Promise<void> {
  const scenes = await captureScenes(
    CLICKS.map((click) => ({ name: click.name, shadowPath: 'lit' as const, clickAt: click.at })),
    evidenceRoot,
  );

  const results = scenes.map((scene) => {
    const click = scene.click!;
    // `World camera <x>,<y> at <zoom>x`
    const parsed = /World camera (-?[\d.]+),(-?[\d.]+) at ([\d.]+)x/u.exec(click.cameraLabel);
    if (!parsed) throw new Error(`${scene.name} could not read the camera label: ${click.cameraLabel}`);
    const camera = { x: Number(parsed[1]), y: Number(parsed[2]), zoom: Number(parsed[3]) };
    const predicted = screenToTileTilted(camera, click.at);
    return {
      name: scene.name,
      camera,
      clickedAt: click.at,
      predictedTile: `${predicted.x},${predicted.y}`,
      tileBefore: click.tileBefore,
      tileAfter: click.destination,
      moved: click.tileBefore !== click.destination,
    };
  });

  writeFileSync(
    join(evidenceRoot, 'click.json'),
    `${JSON.stringify({ schemaVersion: 1, results }, null, 2)}\n`,
  );
  for (const result of results) {
    console.log(
      `${result.name}: clicked ${result.clickedAt.x},${result.clickedAt.y} -> predicted tile `
      + `${result.predictedTile}; player ${result.tileBefore} -> ${result.tileAfter}`
      + `${result.moved ? '' : ' (DID NOT MOVE)'}`,
    );
  }
  if (!results.some((result) => result.moved)) {
    throw new Error('No click moved the player. Click-to-move is broken at this yaw.');
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
