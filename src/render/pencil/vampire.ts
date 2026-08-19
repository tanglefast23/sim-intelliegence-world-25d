import { hashSeed, Sketch } from './sketch';
import { buildVampireLayout } from './layout';
import { drawVampireCharacter } from './parts';
import { VAMPIRE_FACINGS, type VampirePose } from './pose';

export const PENCIL_WIDTH = 240;
export const PENCIL_HEIGHT = 360;
export const BOIL_FRAMES = 3;
export const WORLD_CELL_WIDTH = 42;
export const WORLD_CELL_HEIGHT = 60;
export const VAMPIRE_SHEET_FRAMES = VAMPIRE_FACINGS.length * 2 * BOIL_FRAMES;

export function drawVampire(sketch: Sketch, pose: VampirePose = { facing: 'front', gait: 0 }): void {
  drawVampireCharacter(sketch, buildVampireLayout(), pose);
}

export function bakeVampireFrames(): readonly Uint8ClampedArray[] {
  const frames: Uint8ClampedArray[] = [];
  for (const facing of VAMPIRE_FACINGS) {
    for (const gait of [0, 1] as const) {
      for (let boil = 0; boil < BOIL_FRAMES; boil += 1) {
        const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
        sketch.boil(hashSeed('vampire-01', facing, gait, boil));
        drawVampire(sketch, { facing, gait });
        frames.push(sketch.data);
      }
    }
  }
  return frames;
}
