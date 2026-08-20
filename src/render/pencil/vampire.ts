import { hashSeed, Sketch } from './sketch';
import { buildVampireLayout, SHEET_HEIGHT, SHEET_WIDTH } from './layout';
import { drawVampireCharacter } from './parts';
import { VAMPIRE_FACINGS, VAMPIRE_SHEET_LENGTH, type VampirePose } from './pose';

export const PENCIL_WIDTH = SHEET_WIDTH;
export const PENCIL_HEIGHT = SHEET_HEIGHT;
export const BOIL_FRAMES = 3;
export const WORLD_CELL_WIDTH = 42;
export const WORLD_CELL_HEIGHT = 60;
/**
 * Sheet row the boot soles stand on.
 *
 * The 240x360 sheet is drawing space, not a character cell. `buildVampireLayout` puts the soles at
 * `bootY + 18`, and the planted foot of a stride drops 6 rows further, so 52 rows of empty canvas
 * sit below the feet. `bakeBillboardGeometry` stands a quad's BOTTOM on the contact point, so those
 * rows read as air and the vampire hovers above his own selection ring and shadow. Every other
 * character sprite is authored feet-to-cell-bottom and needs no such offset.
 *
 * The cloak hem is drawn below this row on purpose; it sinks into the floor, which is what a hem
 * dragging on the ground does.
 */
export const PENCIL_CONTACT_ROW = Math.round(308 * (SHEET_HEIGHT / 360));
export const VAMPIRE_SHEET_FRAMES = VAMPIRE_SHEET_LENGTH;

export function drawVampire(
  sketch: Sketch,
  pose: VampirePose = { facing: 'front', gait: 0, moving: false },
): void {
  drawVampireCharacter(sketch, buildVampireLayout(), pose);
}

export function bakeVampireFrames(): readonly Uint8ClampedArray[] {
  const frames: Uint8ClampedArray[] = [];
  // Facing-major: idle first, then both walk gaits. `vampireSheetIndex` assumes this order.
  for (const facing of VAMPIRE_FACINGS) {
    for (let boil = 0; boil < BOIL_FRAMES; boil += 1) {
      const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
      sketch.boil(hashSeed('vampire-01', facing, 'idle', boil));
      drawVampire(sketch, { facing, gait: 0, moving: false });
      frames.push(sketch.data);
    }
    for (const gait of [0, 1] as const) {
      for (let boil = 0; boil < BOIL_FRAMES; boil += 1) {
        const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
        sketch.boil(hashSeed('vampire-01', facing, gait, boil));
        drawVampire(sketch, { facing, gait, moving: true });
        frames.push(sketch.data);
      }
    }
  }
  return frames;
}
