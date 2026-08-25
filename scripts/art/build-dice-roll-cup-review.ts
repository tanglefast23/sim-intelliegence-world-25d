import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DICE_ROLL_CUP_HEIGHT,
  DICE_ROLL_CUP_RECIPE,
  DICE_ROLL_CUP_WIDTH,
  bakeDiceRollCupFrame,
  type DiceRollCupView,
} from '../../src/render/pencil/dice-roll-cup';
import { drawText } from './build-review-sheet';
import { blitScaled, createBitmap, encodePng, fillRect, parseHexColor, type Bitmap } from './png';

const ROOT = resolve('artifacts/kindergrimm-dice-roll-cup');
const DARK = parseHexColor('#171214');
const PAPER = parseHexColor('#f5e6c8');
const CYAN = parseHexColor('#54d6d8');

function bitmap(data: Uint8ClampedArray): Bitmap {
  return { width: DICE_ROLL_CUP_WIDTH, height: DICE_ROLL_CUP_HEIGHT, data: Buffer.from(data) };
}

function over(source: Bitmap, target: Bitmap, x: number, y: number): void {
  for (let sy = 0; sy < source.height; sy += 1) for (let sx = 0; sx < source.width; sx += 1) {
    const sourceOffset = (sy * source.width + sx) * 4;
    if (source.data[sourceOffset + 3] === 0) continue;
    const targetOffset = ((y + sy) * target.width + x + sx) * 4;
    target.data.set(source.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
  }
}

function sha256(frame: Bitmap): string {
  return createHash('sha256').update(frame.data).digest('hex');
}

function validate(view: DiceRollCupView, frame: Bitmap): void {
  const bounds = DICE_ROLL_CUP_RECIPE.views[view].transparentBounds;
  let left = frame.width; let top = frame.height; let right = -1; let bottom = -1;
  for (let y = 0; y < frame.height; y += 1) for (let x = 0; x < frame.width; x += 1) {
    const offset = (y * frame.width + x) * 4;
    if (frame.data[offset + 3] === 0) {
      if (frame.data[offset] || frame.data[offset + 1] || frame.data[offset + 2]) throw new Error(`${view} has RGB in a transparent pixel.`);
      continue;
    }
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left || left < bounds.x || top < bounds.y || right >= bounds.x + bounds.width || bottom >= bounds.y + bounds.height) {
    throw new Error(`${view} exceeds declared transparent bounds: ${left},${top} to ${right},${bottom}.`);
  }
  for (const [id, point] of Object.entries(DICE_ROLL_CUP_RECIPE.views[view].anchors)) {
    if (point.x < bounds.x || point.x >= bounds.x + bounds.width || point.y < bounds.y || point.y >= bounds.y + bounds.height) {
      throw new Error(`${view} anchor ${id} is outside declared bounds.`);
    }
  }
  if (sha256(frame) !== sha256(bitmap(bakeDiceRollCupFrame(view)))) throw new Error(`${view} is not deterministic.`);
}

function review(front: Bitmap, side: Bitmap): Bitmap {
  const output = createBitmap(360, 210, DARK);
  drawText(output, 'DICE CUP / KINDERGRIMM PENCIL RECIPE', 12, 10, PAPER, 2);
  drawText(output, 'FRONT', 24, 38, PAPER);
  drawText(output, 'SIDE', 202, 38, PAPER);
  over(front, output, 10, 45);
  over(side, output, 190, 45);
  for (const [view, originX] of [['front', 10], ['side', 190]] as const) {
    for (const [id, point] of Object.entries(DICE_ROLL_CUP_RECIPE.views[view].anchors)) {
      fillRect(output, originX + point.x - 4, 45 + point.y, 9, 1, CYAN);
      fillRect(output, originX + point.x, 41 + point.y, 1, 9, CYAN);
      drawText(output, id.toUpperCase(), originX + point.x + 6, 42 + point.y, CYAN);
    }
  }
  return output;
}

function write(name: string, image: Bitmap): string {
  const path = resolve(ROOT, name);
  writeFileSync(path, encodePng(image), { flush: true });
  return path;
}

function main(): void {
  mkdirSync(ROOT, { recursive: true });
  const front = bitmap(bakeDiceRollCupFrame('front'));
  const side = bitmap(bakeDiceRollCupFrame('side'));
  validate('front', front); validate('side', side);
  const review1x = review(front, side);
  const review3x = createBitmap(review1x.width * 3, review1x.height * 3, DARK);
  blitScaled(review1x, review3x, 0, 0, 3);
  const files = [
    write('dice-roll-cup-front.png', front),
    write('dice-roll-cup-side.png', side),
    write('dice-roll-cup-anchors.png', review1x),
    write('dice-roll-cup-review-1x.png', review1x),
    write('dice-roll-cup-review-3x.png', review3x),
  ];
  writeFileSync(resolve(ROOT, 'recipe.json'), `${JSON.stringify(DICE_ROLL_CUP_RECIPE, null, 2)}\n`, { flush: true });
  writeFileSync(resolve(ROOT, 'evidence.json'), `${JSON.stringify({
    deterministic: true,
    frames: { front: { sha256: sha256(front) }, side: { sha256: sha256(side) } },
    files: files.map((path) => path.slice(ROOT.length + 1)),
  }, null, 2)}\n`, { flush: true });
  process.stdout.write(`${files.join('\n')}\n`);
}

main();
