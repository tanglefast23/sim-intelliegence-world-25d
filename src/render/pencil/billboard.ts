import type { AtlasRectangle } from '../atlas';
import { CHARACTER_CONTACT_OFFSET, tintForLighting, UNLIT_NIGHT_STRENGTH } from '../three25/billboards';
import type { BillboardDescriptor } from '../three25/billboards';
import type { WorldCharacterPlacement, WorldFrameState } from '../world-frame';
import { poseFromSprite, vampireSheetIndex } from './pose';
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

export function vampirePencilFrames(): readonly Uint8ClampedArray[] {
  cachedFrames ??= bakeVampireFrames();
  return cachedFrames;
}

export function vampireBoilIndex(animationTimestampMilliseconds: number): number {
  const fps = 1.15;
  return Math.floor(animationTimestampMilliseconds / 1000 * fps) % BOIL_FRAMES;
}

export function pencilBillboards(frame: WorldFrameState): readonly BillboardDescriptor[] {
  return frame.characters
    .filter((character) => character.visualId === 'vampire-01')
    .map((character) => ({
      id: `pencil-${character.id}`,
      source: PENCIL_SOURCE,
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
): void {
  const pose = poseFromSprite(character.sprite, character.moving);
  const index = vampireSheetIndex(pose, vampireBoilIndex(animationTimestampMilliseconds));
  const src = vampirePencilFrames()[index] ?? vampirePencilFrames()[0]!;
  target.set(src);
}
