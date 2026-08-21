import type { AtlasRectangle } from '../atlas';
import { CHARACTER_CONTACT_OFFSET, tintForLighting, UNLIT_NIGHT_STRENGTH } from '../three25/billboards';
import type { BillboardDescriptor } from '../three25/billboards';
import type { WorldCharacterPlacement, WorldFrameState } from '../world-frame';
import { poseFromSprite, vampireSheetIndex } from './pose';
import {
  bakePencilCharacterFrames,
  bakeSeatedPencilCharacterFrames,
  isPencilVisualId,
  PENCIL_CHARACTER_RECIPES,
  PENCIL_VISUAL_IDS,
  type PencilVisualId,
} from './characters';
import {
  bakeVampireFrames,
  BOIL_FRAMES,
  PENCIL_CONTACT_ROW,
  PENCIL_HEIGHT,
  PENCIL_WIDTH,
  WORLD_CELL_HEIGHT,
  WORLD_CELL_WIDTH,
} from './vampire';
import { bakeSeatedVampireFrames, seatedVampireFrameIndex } from './seated-vampire';
import { seatedFrameIndex } from './seated';

const TILE_SIZE = 32;
const MARCUS_WORLD_SCALE = 1.25;

export function pencilWorldScale(visualId: PencilVisualId): number {
  return visualId === 'linda-boyfriend' ? MARCUS_WORLD_SCALE : 1;
}

/** World pixels of empty sheet below the boot soles. Sink the quad by this or he floats. */
const CONTACT_SINK_WORLD_PIXELS = ((PENCIL_HEIGHT - PENCIL_CONTACT_ROW) / PENCIL_HEIGHT) * WORLD_CELL_HEIGHT;
const SEATED_VISIBLE_RATIO = 0.82;
const SEATED_LIFT_TILES = 0.08;
/** Pull an authored sitter off the tile's standing foot edge and into the chair pan. */
export const AUTHORED_SEAT_DEPTH_TILES = 0.4;
/** Lower an authored sitter into the chair pan by about seven pixels at the shipping zoom. */
const AUTHORED_SEAT_DROP_TILES = 0.1;
/** Pull a front-facing sitter over the seat and back without changing its screen position. */
const AUTHORED_FRONT_SEAT_LAYER_TILES = 0.5;
/** Tomas's sheet may drape over the foreground armrest. */
const GHOST_SHEET_OVER_CHAIR_LAYER_TILES = 0.9;
const REAR_CHAIR_OCCLUSION_TOP = 84;
const REAR_CHAIR_FOOT_REVEAL = 142;

export const PENCIL_TEXTURE_WIDTH = PENCIL_WIDTH * PENCIL_VISUAL_IDS.length;

export const PENCIL_SOURCE: AtlasRectangle = {
  x: 0,
  y: 0,
  width: PENCIL_WIDTH,
  height: PENCIL_HEIGHT,
  kind: 'world-character',
  sourceId: 'vampire-01-pencil',
  cellClass: null,
  wallAdjacencyMask: null,
  category: 'world-character',
  visibility: 'public',
};

let cachedFrames: readonly Uint8ClampedArray[] | undefined;
let cachedSeatedVampireFrames: readonly Uint8ClampedArray[] | undefined;
const cachedCharacterFrames = new Map<PencilVisualId, readonly Uint8ClampedArray[]>();
const cachedSeatedCharacterFrames = new Map<PencilVisualId, readonly Uint8ClampedArray[]>();

export const AUTHORED_SEATED_VISUAL_IDS = new Set<PencilVisualId>([
  'vampire-01',
  'linda-boyfriend',
  'devon-price',
  'rafael-cruz',
  'tomas-reed',
  'priya-nair',
  'sora-tan',
  'resident-01',
  'resident-02',
  'elise-moreau',
]);

export function vampirePencilFrames(): readonly Uint8ClampedArray[] {
  cachedFrames ??= bakeVampireFrames();
  return cachedFrames;
}

export function pencilCharacterFrames(visualId: PencilVisualId): readonly Uint8ClampedArray[] {
  if (visualId === 'vampire-01') return vampirePencilFrames();
  let frames = cachedCharacterFrames.get(visualId);
  if (!frames) {
    frames = bakePencilCharacterFrames(PENCIL_CHARACTER_RECIPES[visualId]);
    cachedCharacterFrames.set(visualId, frames);
  }
  return frames;
}

export function pencilSource(visualId: PencilVisualId): AtlasRectangle {
  return {
    ...PENCIL_SOURCE,
    x: PENCIL_VISUAL_IDS.indexOf(visualId) * PENCIL_WIDTH,
    sourceId: `${visualId}-pencil`,
  };
}

export function vampireBoilIndex(animationTimestampMilliseconds: number, reducedMotion = false): number {
  if (reducedMotion) return 0;
  const fps = 1.15;
  return Math.floor(animationTimestampMilliseconds / 1000 * fps) % BOIL_FRAMES;
}

export function pencilBillboards(frame: WorldFrameState): readonly BillboardDescriptor[] {
  return frame.characters
    .filter((character) => isPencilVisualId(character.visualId))
    .map((character) => {
      const scale = character.scale * pencilWorldScale(character.visualId as PencilVisualId);
      const seated = character.pose === 'seated';
      const visualId = character.visualId as PencilVisualId;
      const hasAuthoredSeat = seated && AUTHORED_SEATED_VISUAL_IDS.has(visualId);
      const chairOccludesBody = hasAuthoredSeat && poseFromSprite(character.sprite).facing === 'rear';
      const source = pencilSource(visualId);
      const visibleHeight = seated && !hasAuthoredSeat ? Math.floor(source.height * SEATED_VISIBLE_RATIO) : source.height;
      return {
      id: `pencil-${character.id}`,
      source: seated ? { ...source, height: visibleHeight } : source,
      x: (character.shadowWorldX + CHARACTER_CONTACT_OFFSET) / TILE_SIZE,
      z: character.shadowWorldY / TILE_SIZE - (hasAuthoredSeat ? AUTHORED_SEAT_DEPTH_TILES : 0),
      width: (WORLD_CELL_WIDTH * scale) / TILE_SIZE,
      height: (WORLD_CELL_HEIGHT * scale * (visibleHeight / source.height)) / TILE_SIZE,
      tint: tintForLighting(character.color, frame.lighting, UNLIT_NIGHT_STRENGTH),
      lift: seated && !hasAuthoredSeat
        ? SEATED_LIFT_TILES
        : -(CONTACT_SINK_WORLD_PIXELS * scale) / TILE_SIZE - (hasAuthoredSeat ? AUTHORED_SEAT_DROP_TILES : 0),
      depthBias: hasAuthoredSeat && !chairOccludesBody
        ? visualId === 'tomas-reed'
          ? GHOST_SHEET_OVER_CHAIR_LAYER_TILES
          : AUTHORED_FRONT_SEAT_LAYER_TILES
        : 0,
      };
    });
}

export function blitPencilFrame(
  target: Uint8ClampedArray,
  character: WorldCharacterPlacement,
  animationTimestampMilliseconds: number,
  reducedMotion = false,
  targetWidth = PENCIL_WIDTH,
  targetX = 0,
): void {
  if (!isPencilVisualId(character.visualId)) return;
  const pose = poseFromSprite(character.sprite, character.moving && !reducedMotion);
  const boil = vampireBoilIndex(animationTimestampMilliseconds, reducedMotion);
  if (character.visualId === 'vampire-01' && character.pose === 'seated') {
    cachedSeatedVampireFrames ??= bakeSeatedVampireFrames();
    const seated = cachedSeatedVampireFrames[seatedVampireFrameIndex(pose.facing, boil)]
      ?? cachedSeatedVampireFrames[0]!;
    blitSeatedFrame(target, seated, pose.facing === 'rear', targetWidth, targetX);
    return;
  }
  if (character.pose === 'seated' && AUTHORED_SEATED_VISUAL_IDS.has(character.visualId)) {
    let frames = cachedSeatedCharacterFrames.get(character.visualId);
    if (!frames) {
      frames = bakeSeatedPencilCharacterFrames(PENCIL_CHARACTER_RECIPES[character.visualId]);
      cachedSeatedCharacterFrames.set(character.visualId, frames);
    }
    const seated = frames[seatedFrameIndex(pose.facing, boil)] ?? frames[0]!;
    blitSeatedFrame(target, seated, pose.facing === 'rear', targetWidth, targetX);
    return;
  }
  const index = vampireSheetIndex(pose, boil);
  const frames = pencilCharacterFrames(character.visualId);
  const src = frames[index] ?? frames[0]!;
  if (targetWidth === PENCIL_WIDTH && targetX === 0) {
    target.set(src);
    return;
  }
  for (let y = 0; y < PENCIL_HEIGHT; y += 1) {
    const sourceStart = y * PENCIL_WIDTH * 4;
    const targetStart = (y * targetWidth + targetX) * 4;
    target.set(src.subarray(sourceStart, sourceStart + PENCIL_WIDTH * 4), targetStart);
  }
}

function blitSeatedFrame(
  target: Uint8ClampedArray,
  source: Uint8ClampedArray,
  rear: boolean,
  targetWidth: number,
  targetX: number,
): void {
  for (let y = 0; y < PENCIL_HEIGHT; y += 1) {
    const targetStart = (y * targetWidth + targetX) * 4;
    const targetEnd = targetStart + PENCIL_WIDTH * 4;
    if (rear && y >= REAR_CHAIR_OCCLUSION_TOP && y < REAR_CHAIR_FOOT_REVEAL) {
      target.fill(0, targetStart, targetEnd);
      continue;
    }
    const sourceStart = y * PENCIL_WIDTH * 4;
    target.set(source.subarray(sourceStart, sourceStart + PENCIL_WIDTH * 4), targetStart);
  }
}
