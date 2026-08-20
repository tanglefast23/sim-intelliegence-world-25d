import type { AtlasRectangle } from '../atlas';
import { CHARACTER_CONTACT_OFFSET, tintForLighting, UNLIT_NIGHT_STRENGTH } from '../three25/billboards';
import type { BillboardDescriptor } from '../three25/billboards';
import type { WorldCharacterPlacement, WorldFrameState } from '../world-frame';
import { poseFromSprite, vampireSheetIndex } from './pose';
import {
  bakePencilCharacterFrames,
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

const TILE_SIZE = 32;

/** World pixels of empty sheet below the boot soles. Sink the quad by this or he floats. */
const CONTACT_SINK_WORLD_PIXELS = ((PENCIL_HEIGHT - PENCIL_CONTACT_ROW) / PENCIL_HEIGHT) * WORLD_CELL_HEIGHT;

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
const cachedCharacterFrames = new Map<PencilVisualId, readonly Uint8ClampedArray[]>();

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
    .map((character) => ({
      id: `pencil-${character.id}`,
      source: pencilSource(character.visualId as PencilVisualId),
      x: (character.shadowWorldX + CHARACTER_CONTACT_OFFSET) / TILE_SIZE,
      z: character.shadowWorldY / TILE_SIZE,
      width: (WORLD_CELL_WIDTH * character.scale) / TILE_SIZE,
      height: (WORLD_CELL_HEIGHT * character.scale) / TILE_SIZE,
      tint: tintForLighting(character.color, frame.lighting, UNLIT_NIGHT_STRENGTH),
      lift: -(CONTACT_SINK_WORLD_PIXELS * character.scale) / TILE_SIZE,
    }));
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
  const index = vampireSheetIndex(pose, vampireBoilIndex(animationTimestampMilliseconds, reducedMotion));
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
