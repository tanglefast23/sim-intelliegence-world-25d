import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { WORLD_MAP_CATALOG } from '../../src/application/runtime/map-catalog';
import { captureScenes, type SceneRequest } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';
import { tileCenterWorld, worldToScreenTilted } from '../../src/render/three25/projection';

/**
 * Proves click-to-move works at the shipped isometric yaw, end to end.
 *
 * The projection and the camera are pinned to each other by unit tests. What no unit test can
 * cover is the whole chain: a real pointer event, on the real input surface, through the branched
 * picking in `WorldScene.tsx`, into a movement request, and on to arrival.
 *
 * **The first version of this test was inconclusive, and the way it failed is worth keeping.** It
 * clicked three fixed mid-screen pixels, waited 1200 ms and read the committed player tile. All
 * three reported the same tile, which looked like the clicks being ignored. They were not: the
 * start camera sits on the outdoor anchor, so all three pixels named far outdoor tiles, and every
 * route from the indoor spawn to any of them leaves through the same villa door. A fixed-time read
 * caught all three on the shared prefix. The test could not tell a working click from a dead one.
 *
 * So this version asserts the three things that actually distinguish them:
 *
 * 1. The requested TARGET is the tile that was clicked. Only a click can set it — nothing in the
 *    codebase walks the protagonist on its own, so a non-null target is proof of the click alone.
 * 2. The status is `moving`, not `unreachable`. `requestMovement` records a target either way, so
 *    the coordinate alone does not prove a route exists.
 * 3. The player ARRIVES at that tile. This is the claim the original test wanted to make.
 *
 * Plus a negative control, because 1-3 all run through the same `screenToTileTilted` the app uses:
 * a self-consistent sign error in the projection would satisfy every one of them. The control
 * clicks a point that is off-map under the TILTED inverse while landing inside the map under the
 * 2D one, and requires that no movement is requested. That is what proves the tilted picking pair
 * is the one actually wired in, rather than merely that some coherent maths ran.
 */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-5/click',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

const MAP_ID = 'northwest_residential';
const SPAWN = { x: 18, y: 18 };
const map = WORLD_MAP_CATALOG[MAP_ID]!;

const tileKey = (tile: Readonly<{ x: number; y: number }>): string => `${String(tile.x)},${String(tile.y)}`;

/**
 * Whether a tile is safe to click and expect a plain walk to it.
 *
 * `resolveClickTarget` prefers npc, then object, then floor, and the object branch redirects to an
 * approach tile rather than the tile itself. A tile that fails any of these would make the target
 * legitimately differ from the clicked tile, which would force the assertion to be relaxed into
 * something that no longer proves anything.
 */
function isPlainFloor(tile: Readonly<{ x: number; y: number }>): boolean {
  if (tile.x < 1 || tile.y < 1 || tile.x >= map.source.width - 1 || tile.y >= map.source.height - 1) {
    return false;
  }
  const key = tileKey(tile);
  if (map.blockedKeys.has(key)) return false;
  if (map.partOwnersByTile.has(key)) return false;
  if ([...map.doorById.values()].some((door) => tileKey(door.tile) === key)) return false;
  // Arrival on a portal arms a neighbourhood transfer, which would move the player again after the
  // assertion and turn a pass into a flake.
  if ([...map.portalById.values()].some((portal) => tileKey(portal.tile) === key)) return false;
  return !(tile.x === SPAWN.x && tile.y === SPAWN.y);
}

/** Two indoor tiles on different bearings from the spawn, so one route cannot satisfy both. */
const CANDIDATES: readonly Readonly<{ name: string; tile: Readonly<{ x: number; y: number }> }>[] = [
  { name: 'click-southeast', tile: { x: 22, y: 22 } },
  { name: 'click-west', tile: { x: 16, y: 19 } },
  { name: 'click-north', tile: { x: 19, y: 16 } },
  { name: 'click-southwest', tile: { x: 15, y: 21 } },
];

/**
 * A screen point that is off-map under the tilted inverse but inside it under the 2D one.
 *
 * Derived rather than hardcoded, so it stays a valid control if the camera or the map moves.
 */
function negativeControlPoint(
  camera: Readonly<{ x: number; y: number; zoom: number }>,
  viewport: Readonly<{ width: number; height: number }>,
): Readonly<{ x: number; y: number }> | undefined {
  const mapPixels = { width: map.source.width * 32, height: map.source.height * 32 };
  for (let y = 40; y < viewport.height - 40; y += 8) {
    for (let x = 40; x < viewport.width - 40; x += 8) {
      // The 2D inverse: a plain divide by zoom, no rotation and no depth compression.
      const flat = { x: camera.x + x / camera.zoom, y: camera.y + y / camera.zoom };
      const insideFlat = flat.x >= 0 && flat.y >= 0
        && flat.x < mapPixels.width && flat.y < mapPixels.height;
      if (!insideFlat) continue;
      const u = x / camera.zoom;
      const v = y / (Math.sin(Math.PI / 6) * camera.zoom);
      const cos = Math.cos(Math.PI / 4);
      const sin = Math.sin(Math.PI / 4);
      const tilted = { x: camera.x + u * cos + v * sin, y: camera.y - u * sin + v * cos };
      const insideTilted = tilted.x >= 0 && tilted.y >= 0
        && tilted.x < mapPixels.width && tilted.y < mapPixels.height;
      if (!insideTilted) return { x, y };
    }
  }
  return undefined;
}

const VIEWPORT = { width: 1280, height: 720 };

async function main(): Promise<void> {
  const usable = CANDIDATES.filter((candidate) => isPlainFloor(candidate.tile));
  if (usable.length < 2) {
    throw new Error(
      `Only ${String(usable.length)} of ${String(CANDIDATES.length)} candidate tiles are plain floor. `
      + 'Content moved under this test: pick new tiles that pass isPlainFloor.',
    );
  }
  const skipped = CANDIDATES.filter((candidate) => !isPlainFloor(candidate.tile));
  for (const candidate of skipped) {
    console.log(`skipping ${candidate.name} at ${tileKey(candidate.tile)}: not plain floor`);
  }

  const scenes: SceneRequest[] = usable.map((candidate) => ({
    name: candidate.name,
    shadowPath: 'lit' as const,
    centreOnPlayer: true,
    freezeNpcMotion: true,
    clickTile: candidate.tile,
  }));

  const positives = await captureScenes(scenes, evidenceRoot, VIEWPORT);

  const results = positives.map((scene, index) => {
    const candidate = usable[index]!;
    const click = scene.click!;
    const parsed = /World camera (-?[\d.]+),(-?[\d.]+) at ([\d.]+)x/u.exec(click.cameraLabel);
    if (!parsed) throw new Error(`${scene.name} could not read the camera label: ${click.cameraLabel}`);
    const camera = { x: Number(parsed[1]), y: Number(parsed[2]), zoom: Number(parsed[3]) };
    // The page inlined the forward projection. Redo it here through the real module and require
    // the same pixel, so the inlined copy can never drift from what the app picks with.
    const projected = worldToScreenTilted(camera, tileCenterWorld(candidate.tile));
    const expected = { x: Math.round(projected.x), y: Math.round(projected.y) };
    // And redo `eventPoint` exactly as WorldInput does, from the coordinates the page really used,
    // so a fractional bounding rect cannot silently shift the pick by a pixel.
    const eventPointX = Math.floor(click.dispatched.clientX - click.dispatched.boxLeft);
    const eventPointY = Math.floor(click.dispatched.clientY - click.dispatched.boxTop);
    return {
      name: scene.name,
      camera,
      tile: tileKey(candidate.tile),
      clickedAt: click.at,
      expectedPixel: expected,
      eventPoint: { x: eventPointX, y: eventPointY },
      targetBefore: click.targetBefore,
      target: click.target,
      status: click.status,
      arrived: click.arrived,
      arrivedAfterMs: click.arrivedAfterMs,
      tileBefore: click.tileBefore,
      tileAfter: click.destination,
    };
  });

  // The negative control needs a camera, and the camera is only known once a scene has run.
  const control = negativeControlPoint(results[0]!.camera, VIEWPORT);
  let controlResult: Readonly<{ at: { x: number; y: number }; target: string | null }> | undefined;
  if (control) {
    const [scene] = await captureScenes(
      [{
        name: 'click-off-map-control',
        shadowPath: 'lit',
        centreOnPlayer: true,
        freezeNpcMotion: true,
        clickPixel: control,
      }],
      evidenceRoot,
      VIEWPORT,
    );
    controlResult = { at: scene!.click!.at, target: scene!.click!.target };
  }

  writeFileSync(
    join(evidenceRoot, 'click.json'),
    `${JSON.stringify({
      schemaVersion: 2,
      results,
      control: controlResult ?? null,
      // Stated, not hidden: this test lives entirely on the INPUT side. A wrong yaw in the scene
      // builder with correct picking would pass every assertion here. Render parity is the
      // screenshot captures' job, not this one's.
      knownGap: 'Input-side only. Does not prove the drawn scene uses the same yaw as the picking.',
    }, null, 2)}\n`,
  );

  const failures: string[] = [];
  for (const result of results) {
    console.log(
      `${result.name}: tile ${result.tile} -> pixel ${String(result.clickedAt.x)},${String(result.clickedAt.y)}; `
      + `target ${result.target ?? 'null'}; status ${result.status ?? 'null'}; `
      + `player ${result.tileBefore} -> ${result.tileAfter}`
      + (result.arrived ? ` (arrived in ${String(result.arrivedAfterMs)}ms)` : ' (DID NOT ARRIVE)'),
    );
    if (result.clickedAt.x !== result.expectedPixel.x || result.clickedAt.y !== result.expectedPixel.y) {
      failures.push(`${result.name}: page clicked ${String(result.clickedAt.x)},${String(result.clickedAt.y)} but the projection module says ${String(result.expectedPixel.x)},${String(result.expectedPixel.y)}`);
    }
    if (result.eventPoint.x !== result.clickedAt.x || result.eventPoint.y !== result.clickedAt.y) {
      failures.push(`${result.name}: eventPoint would read ${String(result.eventPoint.x)},${String(result.eventPoint.y)} for a click at ${String(result.clickedAt.x)},${String(result.clickedAt.y)}`);
    }
    if (result.target !== result.tile) {
      failures.push(`${result.name}: requested target is ${result.target ?? 'null'}, expected ${result.tile}`);
    }
    if (result.status !== 'moving') {
      failures.push(`${result.name}: status is ${result.status ?? 'null'}, expected moving`);
    }
    if (!result.arrived) failures.push(`${result.name}: never arrived at ${result.tile}`);
  }
  if (controlResult) {
    console.log(`control: pixel ${String(controlResult.at.x)},${String(controlResult.at.y)} -> target ${controlResult.target ?? 'null'}`);
    if (controlResult.target !== null) {
      failures.push(`control: a point that is off-map under the tilted inverse still requested ${controlResult.target}`);
    }
  } else {
    console.log('control: no screen point is off-map under the tilted inverse and on-map under the 2D one; skipped');
  }

  if (failures.length > 0) throw new Error(`Click-to-move failed at yaw 45:\n- ${failures.join('\n- ')}`);
  console.log(`Click-to-move verified at yaw 45 across ${String(results.length)} tiles.`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
