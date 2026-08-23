import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  bakeGeneratedVampireFrames,
  bakeRiggedGeneratedVampireFrames,
  buildGeneratedVampireLayout,
  renderRiggedGeneratedVampireFrame,
} from '../../src/render/pencil/generated-vampire';
import { bakeSeatedVampireFrames } from '../../src/render/pencil/seated-vampire';
import { PENCIL_HEIGHT, PENCIL_WIDTH } from '../../src/render/pencil/vampire';
import type { VampireFacing, VampirePose } from '../../src/render/pencil/pose';
import type { PencilRigIntent } from '../../src/render/world-frame';
import { drawText } from './build-review-sheet';
import { blitScaled, createBitmap, encodePng, setPixel, type Bitmap, type Rgba } from './png';

const FACINGS = ['front', 'rear', 'left', 'right'] as const;
const IDLE_INDEXES = [0, 9, 18, 27] as const;
const SCALE = 2;
const LABEL_HEIGHT = 28;
const ROW_HEIGHT = PENCIL_HEIGHT * SCALE + LABEL_HEIGHT;
const PAPER = [246, 241, 229, 255] as const;

function bitmap(frame: Uint8ClampedArray): Bitmap {
  return { width: PENCIL_WIDTH, height: PENCIL_HEIGHT, data: Buffer.from(frame) };
}

function render(
  facing: VampireFacing,
  pose: Partial<Pick<VampirePose, 'gait' | 'moving'>> = {},
  intent?: PencilRigIntent,
  reducedMotion = false,
): Uint8ClampedArray {
  return renderRiggedGeneratedVampireFrame({
    facing,
    gait: pose.gait ?? 0,
    moving: pose.moving ?? false,
  }, 0, reducedMotion, intent);
}

function paintRow(
  output: Bitmap,
  row: number,
  label: string,
  frames: readonly Uint8ClampedArray[],
  background: Rgba = PAPER,
): void {
  const rowY = row * ROW_HEIGHT;
  for (let y = rowY; y < rowY + ROW_HEIGHT; y += 1) {
    for (let x = 0; x < output.width; x += 1) setPixel(output, x, y, background);
  }
  drawText(output, label, 8, rowY + 8, [31, 29, 26, 255], 2);
  frames.forEach((frame, column) => {
    blitScaled(bitmap(frame), output, column * PENCIL_WIDTH * SCALE, rowY + LABEL_HEIGHT, SCALE);
  });
}

function main(): void {
  const oldFrames = bakeGeneratedVampireFrames();
  const rigFrames = bakeRiggedGeneratedVampireFrames();
  const seatedFrames = bakeSeatedVampireFrames(buildGeneratedVampireLayout());
  const output = createBitmap(PENCIL_WIDTH * SCALE * 4, ROW_HEIGHT * 9, PAPER);

  paintRow(output, 0, 'OLD RECIPE / FRONT REAR LEFT RIGHT', IDLE_INDEXES.map((index) => oldFrames[index]!));
  paintRow(output, 1, 'RIG IDLE / FRONT REAR LEFT RIGHT', IDLE_INDEXES.map((index) => rigFrames[index]!));
  paintRow(output, 2, 'WALK GAIT 0 / FRONT REAR LEFT RIGHT', FACINGS.map((facing) => render(facing, { moving: true, gait: 0 })));
  paintRow(output, 3, 'WALK GAIT 1 / FRONT REAR LEFT RIGHT', FACINGS.map((facing) => render(facing, { moving: true, gait: 1 })));
  paintRow(output, 4, 'SEATED / FRONT REAR LEFT RIGHT', FACINGS.map((_, index) => seatedFrames[index * 3]!));
  paintRow(output, 5, 'REACH / LEFT NEAR LEFT FAR RIGHT NEAR RIGHT FAR', [
    render('front', {}, { reach: { hand: 'left', target: { x: 27, y: 87 } } }),
    render('front', {}, { reach: { hand: 'left', target: { x: 8, y: 61 } } }),
    render('front', {}, { reach: { hand: 'right', target: { x: 93, y: 87 } } }),
    render('front', {}, { reach: { hand: 'right', target: { x: 112, y: 61 } } }),
  ]);
  paintRow(output, 6, 'LANTERN / LEFT CARRY RIGHT CARRY LEFT REACH RIGHT REACH', [
    render('front', {}, { heldItem: { item: 'brass-lantern', hand: 'left' } }),
    render('front', {}, { heldItem: { item: 'brass-lantern', hand: 'right' } }),
    render('front', {}, { reach: { hand: 'left', target: { x: 26, y: 74 } }, heldItem: { item: 'brass-lantern', hand: 'left' } }),
    render('front', {}, { reach: { hand: 'right', target: { x: 94, y: 74 } }, heldItem: { item: 'brass-lantern', hand: 'right' } }),
  ], [213, 202, 136, 255]);
  paintRow(output, 7, 'COLLISION / HEAD LEFT HEAD RIGHT TORSO LEFT TORSO RIGHT', [
    render('front', {}, { reach: { hand: 'left', target: { x: 60, y: 40 } } }),
    render('front', {}, { reach: { hand: 'right', target: { x: 60, y: 40 } } }),
    render('front', {}, { reach: { hand: 'left', target: { x: 60, y: 104 } } }),
    render('front', {}, { reach: { hand: 'right', target: { x: 60, y: 104 } } }),
  ]);
  paintRow(output, 8, 'HAIR FOLLOW / WALK 0 WALK 1 REDUCED 0 REDUCED 1', [
    render('right', { moving: true, gait: 0 }),
    render('right', { moving: true, gait: 1 }),
    render('right', { moving: true, gait: 0 }, undefined, true),
    render('right', { moving: true, gait: 1 }, undefined, true),
  ]);

  const directory = resolve('artifacts/kindergrimm-vampire/rig');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, 'vampire-rig-review.png');
  writeFileSync(path, encodePng(output));
  process.stdout.write(`${path}\n`);
}

main();
