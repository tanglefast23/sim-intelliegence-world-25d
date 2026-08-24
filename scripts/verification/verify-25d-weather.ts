import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PNG } from 'pngjs';

import { ATLAS_DRAW_CALL_CEILING, DRAW_CALL_CEILING } from '../../src/render/three25/ceilings';
import {
  CAMERA_RIGHT_ON_GROUND,
  GROUND_HEIGHT_SCALE,
  screenToWorldTilted,
  worldToScreenTilted,
} from '../../src/render/three25/projection';
import { WEATHER_MAX_MARKS, WEATHER_REDUCED_MOTION_MAX_MARKS } from '../../src/render/vfx/weather';
import { captureScenes, type SceneEvidence, type SceneRequest } from './hidden-window-capture';

const VIEWPORT = { width: 1280, height: 720 } as const;
const VFX_STEP = 4;
const OUTSIDE = { x: 17, y: 25 } as const;
const DOOR = { x: 17, y: 24 } as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pngHash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function changedPixels(leftPath: string, rightPath: string, mask?: Uint8Array): number {
  const left = PNG.sync.read(readFileSync(leftPath));
  const right = PNG.sync.read(readFileSync(rightPath));
  assert(left.width === right.width && left.height === right.height, 'Weather PNG dimensions differ.');
  let changed = 0;
  for (let pixel = 0; pixel < left.width * left.height; pixel += 1) {
    if (mask && mask[pixel] !== 1) continue;
    const index = pixel * 4;
    if (
      Math.abs(left.data[index]! - right.data[index]!) > 2 ||
      Math.abs(left.data[index + 1]! - right.data[index + 1]!) > 2 ||
      Math.abs(left.data[index + 2]! - right.data[index + 2]!) > 2
    ) changed += 1;
  }
  return changed;
}

function sceneByName(scenes: readonly SceneEvidence[], name: string): SceneEvidence {
  const scene = scenes.find((candidate) => candidate.name === name);
  if (!scene) throw new Error(`Weather capture ${name} is missing.`);
  return scene;
}

function assertNoProtectedAnchors(scene: SceneEvidence): void {
  const protectedKeys = new Set([...scene.weather.interiorTileKeys, ...scene.weather.doorTileKeys]);
  const leaked = scene.weather.marks.find(({ worldX, worldY }) => (
    protectedKeys.has(`${Math.floor(worldX / 32)},${Math.floor(worldY / 32)}`)
  ));
  assert(!leaked, `${scene.name} placed weather inside a revealed interior or tied doorway.`);
}

/**
 * Pixels whose possible precipitation anchors remain inside the revealed interior.
 * This is the plan's non-vacuous inset: it uses the actual camera and quad bounds.
 */
function safeInteriorMask(scene: SceneEvidence): Readonly<{ mask: Uint8Array; original: number; inset: number }> {
  const interior = new Set(scene.weather.interiorTileKeys);
  assert(interior.size > 0, 'The interior weather scene did not reveal a roof group.');
  assert(scene.weather.marks.length > 0, 'The interior rain scene built no marks.');
  const { camera, marks } = scene.weather;
  const groundMask = new Uint8Array(VIEWPORT.width * VIEWPORT.height);
  let original = 0;
  for (let y = 0; y < VIEWPORT.height; y += 1) {
    for (let x = 0; x < VIEWPORT.width; x += 1) {
      const world = screenToWorldTilted(camera, { x: x + 0.5, y: y + 0.5 });
      if (!interior.has(`${Math.floor(world.x / 32)},${Math.floor(world.y / 32)}`)) continue;
      groundMask[y * VIEWPORT.width + x] = 1;
      original += 1;
    }
  }

  let horizontalReach = 0;
  let minimumGroundOffset = Number.POSITIVE_INFINITY;
  let maximumGroundOffset = 0;
  for (const mark of marks) {
    const anchor = worldToScreenTilted(camera, { x: mark.worldX, y: mark.worldY });
    const edge = worldToScreenTilted(camera, {
      x: mark.worldX + CAMERA_RIGHT_ON_GROUND.x * mark.width / 2,
      y: mark.worldY + CAMERA_RIGHT_ON_GROUND.y * mark.width / 2,
    });
    horizontalReach = Math.max(horizontalReach, Math.abs(edge.x - anchor.x));
    minimumGroundOffset = Math.min(
      minimumGroundOffset,
      (mark.heightAboveGround - mark.height / 2) * GROUND_HEIGHT_SCALE * camera.zoom,
    );
    maximumGroundOffset = Math.max(
      maximumGroundOffset,
      (mark.heightAboveGround + mark.height / 2) * GROUND_HEIGHT_SCALE * camera.zoom,
    );
  }

  const leftRight = Math.ceil(horizontalReach) + 1;
  const top = Math.max(0, Math.floor(minimumGroundOffset) - 1);
  const bottom = Math.ceil(maximumGroundOffset) + 1;
  const mask = new Uint8Array(groundMask.length);
  let inset = 0;
  for (let y = 0; y < VIEWPORT.height; y += 1) {
    for (let x = 0; x < VIEWPORT.width; x += 1) {
      if (groundMask[y * VIEWPORT.width + x] !== 1) continue;
      let safe = true;
      for (let anchorY = y + top; safe && anchorY <= y + bottom; anchorY += 1) {
        for (let anchorX = x - leftRight; anchorX <= x + leftRight; anchorX += 1) {
          if (
            anchorX < 0 || anchorY < 0 || anchorX >= VIEWPORT.width || anchorY >= VIEWPORT.height ||
            groundMask[anchorY * VIEWPORT.width + anchorX] !== 1
          ) {
            safe = false;
            break;
          }
        }
      }
      if (!safe) continue;
      mask[y * VIEWPORT.width + x] = 1;
      inset += 1;
    }
  }
  assert(inset >= 64 && inset >= original * 0.25, `Interior inset is too small: ${inset}/${original} pixels.`);
  return { mask, original, inset };
}

function common(name: string, weather: 'clear' | 'rain' | 'snow'): SceneRequest {
  return {
    name,
    weather,
    shadowPath: 'fallback',
    zoom: 3,
    minute: 720,
    centreOnPlayer: true,
    freezeNpcMotion: true,
    hideHud: true,
    vfxStep: VFX_STEP,
  };
}

async function main(): Promise<void> {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'si-world-weather-'));
  try {
    const normalRequests: SceneRequest[] = [
      { ...common('outside-clear-fallback', 'clear'), standOnTile: OUTSIDE },
      { ...common('outside-rain-fallback', 'rain'), standOnTile: OUTSIDE },
      { ...common('outside-rain-repeat-fallback', 'rain'), standOnTile: OUTSIDE },
      { ...common('outside-snow-fallback', 'snow'), standOnTile: OUTSIDE },
      common('inside-clear-fallback', 'clear'),
      common('inside-rain-fallback', 'rain'),
      { ...common('door-clear-fallback', 'clear'), standOnTile: DOOR },
      { ...common('door-rain-fallback', 'rain'), standOnTile: DOOR },
      { ...common('outside-clear-lit', 'clear'), standOnTile: OUTSIDE, shadowPath: 'lit' },
      { ...common('outside-rain-lit', 'rain'), standOnTile: OUTSIDE, shadowPath: 'lit' },
    ];
    const normalRoot = join(temporaryRoot, 'normal');
    const scenes = await captureScenes(normalRequests, normalRoot, VIEWPORT);
    const reducedRoot = join(temporaryRoot, 'reduced');
    const reduced = await captureScenes([
      { ...common('reduced-rain-a', 'rain'), standOnTile: OUTSIDE, reducedMotion: true, vfxStep: 0 },
      { ...common('reduced-rain-b', 'rain'), standOnTile: OUTSIDE, reducedMotion: true, vfxStep: 20 },
    ], reducedRoot, VIEWPORT);

    const pathFor = (root: string, scene: SceneEvidence): string => join(root, scene.screenshot);
    const outsideClear = sceneByName(scenes, 'outside-clear-fallback');
    const outsideRain = sceneByName(scenes, 'outside-rain-fallback');
    const repeatedRain = sceneByName(scenes, 'outside-rain-repeat-fallback');
    const outsideSnow = sceneByName(scenes, 'outside-snow-fallback');
    const insideClear = sceneByName(scenes, 'inside-clear-fallback');
    const insideRain = sceneByName(scenes, 'inside-rain-fallback');
    const doorRain = sceneByName(scenes, 'door-rain-fallback');
    const litClear = sceneByName(scenes, 'outside-clear-lit');
    const litRain = sceneByName(scenes, 'outside-rain-lit');
    const reducedA = sceneByName(reduced, 'reduced-rain-a');
    const reducedB = sceneByName(reduced, 'reduced-rain-b');

    for (const scene of [...scenes, ...reduced]) {
      assert(scene.evidence.drawCalls <= DRAW_CALL_CEILING, `${scene.name} exceeded the draw-call ceiling.`);
      assert(scene.evidence.atlasDrawCalls <= ATLAS_DRAW_CALL_CEILING, `${scene.name} exceeded the atlas ceiling.`);
      assertNoProtectedAnchors(scene);
    }
    for (const scene of [outsideRain, repeatedRain, outsideSnow, insideRain, doorRain, litRain]) {
      assert(scene.weather.liveMarks > 0 && scene.weather.liveMarks <= WEATHER_MAX_MARKS, `${scene.name} has an invalid mark count.`);
    }
    assert(outsideRain.weather.sampleHash === repeatedRain.weather.sampleHash, 'Repeated rain geometry changed.');
    assert(
      pngHash(pathFor(normalRoot, outsideRain)) === pngHash(pathFor(normalRoot, repeatedRain)),
      'Repeated pinned rain PNGs changed.',
    );
    assert(changedPixels(pathFor(normalRoot, outsideClear), pathFor(normalRoot, outsideRain)) > 0, 'Fallback rain is not visible.');
    assert(changedPixels(pathFor(normalRoot, outsideClear), pathFor(normalRoot, outsideSnow)) > 0, 'Fallback snow is not visible.');
    assert(changedPixels(pathFor(normalRoot, litClear), pathFor(normalRoot, litRain)) > 0, 'Lit rain is not visible.');
    for (const [clear, weather] of [[outsideClear, outsideRain], [litClear, litRain]] as const) {
      assert(weather.evidence.drawCalls === clear.evidence.drawCalls, `${weather.name} added a draw call.`);
      assert(weather.evidence.atlasDrawCalls === clear.evidence.atlasDrawCalls, `${weather.name} changed atlas calls.`);
    }

    const interior = safeInteriorMask(insideRain);
    assert(
      changedPixels(pathFor(normalRoot, insideClear), pathFor(normalRoot, insideRain), interior.mask) === 0,
      'Rain changed pixels inside the safe revealed-interior inset.',
    );
    assert(doorRain.weather.doorTileKeys.length > 0, 'The doorway scene published no tied door keys.');
    assert(reducedA.weather.reducedMotion && reducedB.weather.reducedMotion, 'Reduced motion was not active.');
    assert(reducedA.weather.liveMarks <= WEATHER_REDUCED_MOTION_MAX_MARKS, 'Reduced rain exceeded its mark cap.');
    assert(reducedA.weather.sampleHash === reducedB.weather.sampleHash, 'Reduced rain moved between VFX steps.');
    console.log(JSON.stringify({
      normalMarks: { rain: outsideRain.weather.liveMarks, snow: outsideSnow.weather.liveMarks },
      reducedMarks: reducedA.weather.liveMarks,
      interiorPixels: { original: interior.original, inset: interior.inset, changed: 0 },
      drawCalls: outsideRain.evidence.drawCalls,
      atlasDrawCalls: outsideRain.evidence.atlasDrawCalls,
    }));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
