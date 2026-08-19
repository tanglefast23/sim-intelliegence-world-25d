import { hashSeed, Sketch } from './sketch';
import { buildVampireLayout } from './layout';
import { drawVampireCharacter } from './parts';
import { VAMPIRE_FACINGS, VAMPIRE_STATES, type VampirePose } from './pose';

export const PENCIL_WIDTH = 240;
export const PENCIL_HEIGHT = 360;
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
export const PENCIL_CONTACT_ROW = 308;
export const VAMPIRE_SHEET_FRAMES = VAMPIRE_FACINGS.length * VAMPIRE_STATES.length * BOIL_FRAMES;

export function drawVampire(
  sketch: Sketch,
  pose: VampirePose = { facing: 'front', gait: 0, moving: false },
): void {
  drawVampireCharacter(sketch, buildVampireLayout(), pose);
}

export function bakeVampireFrames(): readonly Uint8ClampedArray[] {
  const frames: Uint8ClampedArray[] = [];
  // Facing, then state, then boil. `vampireSheetIndex` assumes exactly this order.
  for (const facing of VAMPIRE_FACINGS) {
    for (const state of VAMPIRE_STATES) {
      for (let boil = 0; boil < BOIL_FRAMES; boil += 1) {
        const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
        sketch.boil(hashSeed('vampire-01', facing, state.moving ? state.gait : 'idle', boil));
        drawVampire(sketch, { facing, gait: state.gait, moving: state.moving });
        frames.push(sketch.data);
      }
    }
  }
  return frames;
}
