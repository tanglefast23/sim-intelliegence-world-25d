import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PENCIL_CHARACTER_RECIPES } from '../../src/render/pencil/characters';
import {
  bakeGeneratedLindaFrames,
  LINDA_PART_IDS,
  renderGeneratedLindaFrame,
  renderLindaWireframe,
} from '../../src/render/pencil/generated-linda';
import { buildPencilLayout } from '../../src/render/pencil/layout';
import { drawLiteralBigfoot } from '../../src/render/pencil/parts/bigfoot';
import { VAMPIRE_FACINGS, type VampirePose } from '../../src/render/pencil/pose';
import { hashSeed, Sketch } from '../../src/render/pencil/sketch';
import { BOIL_FRAMES, PENCIL_HEIGHT, PENCIL_WIDTH } from '../../src/render/pencil/vampire';
import { drawText } from './build-review-sheet';
import { blitScaled, createBitmap, encodePng, setPixel, type Bitmap, type Rgba } from './png';

const FACINGS = ['front', 'rear', 'left', 'right'] as const;
const IDLE_INDEXES = [0, 9, 18, 27] as const;
const LABEL_HEIGHT = 26;
const PAPER = [246, 241, 229, 255] as const;

function bitmap(frame: Uint8ClampedArray): Bitmap {
  return { width: PENCIL_WIDTH, height: PENCIL_HEIGHT, data: Buffer.from(frame) };
}

function silhouette(frame: Uint8ClampedArray): Bitmap {
  const output = bitmap(frame);
  for (let offset = 0; offset < output.data.length; offset += 4) {
    if (output.data[offset + 3] === 0) continue;
    output.data[offset] = 24;
    output.data[offset + 1] = 22;
    output.data[offset + 2] = 26;
    output.data[offset + 3] = 255;
  }
  return output;
}

function pose(facing: typeof FACINGS[number], gait: 0 | 1, moving: boolean): VampirePose {
  return { facing, gait, moving };
}

function bakeCurrentLindaFrames(): readonly Uint8ClampedArray[] {
  const recipe = PENCIL_CHARACTER_RECIPES.linda;
  const layout = buildPencilLayout(recipe.shape, recipe.palette);
  return VAMPIRE_FACINGS.flatMap((facing) => [false, true].flatMap((moving) => (
    (moving ? [0, 1] : [0]).flatMap((gait) => Array.from({ length: BOIL_FRAMES }, (_, boil) => {
      const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
      sketch.boil(hashSeed(recipe.visualId, facing, moving ? gait : 'idle', boil));
      drawLiteralBigfoot(sketch, layout, { facing, moving, gait: gait as 0 | 1 });
      return sketch.data;
    }))
  )));
}

function paintRow(
  output: Bitmap,
  scale: number,
  row: number,
  label: string,
  frames: readonly Uint8ClampedArray[],
  background: Rgba = PAPER,
  silhouettes = false,
): void {
  const rowHeight = PENCIL_HEIGHT * scale + LABEL_HEIGHT;
  const rowY = row * rowHeight;
  for (let y = rowY; y < rowY + rowHeight; y += 1) {
    for (let x = 0; x < output.width; x += 1) setPixel(output, x, y, background);
  }
  drawText(output, label, 6, rowY + 7, [31, 29, 26, 255], scale > 1 ? 2 : 1);
  frames.forEach((frame, column) => {
    blitScaled(silhouettes ? silhouette(frame) : bitmap(frame), output, column * PENCIL_WIDTH * scale, rowY + LABEL_HEIGHT, scale);
  });
}

function writeReview(scale: number, filename: string): string {
  const current = bakeCurrentLindaFrames();
  const generated = bakeGeneratedLindaFrames(true);
  const rowHeight = PENCIL_HEIGHT * scale + LABEL_HEIGHT;
  const output = createBitmap(PENCIL_WIDTH * scale * 4, rowHeight * 6, PAPER);

  paintRow(output, scale, 0, 'CURRENT / FRONT REAR LEFT RIGHT', IDLE_INDEXES.map((index) => current[index]!));
  paintRow(output, scale, 1, 'KINDERGRIMM IDLE / FRONT REAR LEFT RIGHT', IDLE_INDEXES.map((index) => generated[index]!));
  paintRow(output, scale, 2, 'WIREFRAME / BLUE JOINT RED HAND GREEN CONTACT GOLD FACE', FACINGS.map((facing) => renderLindaWireframe(pose(facing, 0, false), true)));
  paintRow(output, scale, 3, 'WALK GAIT 0 / FRONT REAR LEFT RIGHT', FACINGS.map((facing) => renderGeneratedLindaFrame(pose(facing, 0, true), 0, true)));
  paintRow(output, scale, 4, 'WALK GAIT 1 / FRONT REAR LEFT RIGHT', FACINGS.map((facing) => renderGeneratedLindaFrame(pose(facing, 1, true), 0, true)));
  paintRow(output, scale, 5, `SILHOUETTE / ${LINDA_PART_IDS.length} ORDERED PARTS`, IDLE_INDEXES.map((index) => generated[index]!), PAPER, true);

  const directory = resolve('artifacts/kindergrimm-characters/linda');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, filename);
  writeFileSync(path, encodePng(output));
  return path;
}

function writeFacingSheet(filename: string, label: string, frames: readonly Uint8ClampedArray[]): string {
  const scale = 3;
  const output = createBitmap(PENCIL_WIDTH * scale * 4, PENCIL_HEIGHT * scale + LABEL_HEIGHT, PAPER);
  paintRow(output, scale, 0, label, frames);
  const directory = resolve('artifacts/kindergrimm-characters/linda');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, filename);
  writeFileSync(path, encodePng(output));
  return path;
}

process.stdout.write(`${writeReview(1, 'linda-review-1x.png')}\n`);
process.stdout.write(`${writeReview(3, 'linda-review-3x.png')}\n`);
const current = bakeCurrentLindaFrames();
const updated = bakeGeneratedLindaFrames(true);
process.stdout.write(`${writeFacingSheet('linda-current-3x.png', 'CURRENT / FRONT REAR LEFT RIGHT', IDLE_INDEXES.map((index) => current[index]!))}\n`);
process.stdout.write(`${writeFacingSheet('linda-kindergrimm-3x.png', 'KINDERGRIMM / FRONT REAR LEFT RIGHT', IDLE_INDEXES.map((index) => updated[index]!))}\n`);
process.stdout.write(`${writeFacingSheet('linda-rig-data-3x.png', 'RIG DATA / FRONT REAR LEFT RIGHT', FACINGS.map((facing) => renderLindaWireframe(pose(facing, 0, false), true)))}\n`);
