import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  bakeVegetationFrame,
  VEGETATION_HEIGHT,
  VEGETATION_IDS,
  VEGETATION_RECIPE,
  VEGETATION_WIDTH,
  type VegetationId,
  type VegetationView,
} from '../../src/render/pencil/vegetation';
import { drawText } from './build-review-sheet';
import {
  blitScaled,
  createBitmap,
  encodePng,
  fillRect,
  parseHexColor,
  setPixel,
  type Bitmap,
  type Rgba,
} from './png';

const OUTPUT_ROOT = resolve('artifacts/kindergrimm-vegetation');
const PAPER = parseHexColor('#f6f1e5');
const INK = parseHexColor('#1f1d1a');
const DARK = parseHexColor('#17151b');
const GRASS = parseHexColor('#78834a');
const GRASS_DARK = parseHexColor('#606c3b');
const GRID = parseHexColor('#9aa26d');
const CONTACT = parseHexColor('#58d7d9');

function bitmap(data: Uint8ClampedArray): Bitmap {
  return { width: VEGETATION_WIDTH, height: VEGETATION_HEIGHT, data: Buffer.from(data) };
}

function nearest(source: Bitmap, width: number, height: number): Bitmap {
  const target = createBitmap(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(source.width - 1, Math.floor((x + 0.5) * source.width / width));
      const sy = Math.min(source.height - 1, Math.floor((y + 0.5) * source.height / height));
      const from = (sy * source.width + sx) * 4;
      setPixel(target, x, y, [
        source.data[from]!, source.data[from + 1]!, source.data[from + 2]!, source.data[from + 3]!,
      ]);
    }
  }
  return target;
}

function over(source: Bitmap, target: Bitmap, x: number, y: number): void {
  for (let sy = 0; sy < source.height; sy += 1) {
    for (let sx = 0; sx < source.width; sx += 1) {
      const from = (sy * source.width + sx) * 4;
      const alpha = source.data[from + 3]! / 255;
      if (alpha === 0) continue;
      const tx = x + sx;
      const ty = y + sy;
      if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
      const to = (ty * target.width + tx) * 4;
      setPixel(target, tx, ty, [
        Math.round(source.data[from]! * alpha + target.data[to]! * (1 - alpha)),
        Math.round(source.data[from + 1]! * alpha + target.data[to + 1]! * (1 - alpha)),
        Math.round(source.data[from + 2]! * alpha + target.data[to + 2]! * (1 - alpha)),
        255,
      ]);
    }
  }
}

function line(bitmap: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(bitmap, x, y, width, 1, color);
  fillRect(bitmap, x, y + height - 1, width, 1, color);
  fillRect(bitmap, x, y, 1, height, color);
  fillRect(bitmap, x + width - 1, y, 1, height, color);
}

function marker(bitmap: Bitmap, x: number, y: number): void {
  fillRect(bitmap, x - 5, y - 1, 11, 3, CONTACT);
  fillRect(bitmap, x - 1, y - 5, 3, 11, CONTACT);
}

function buildNativeReview(frames: Readonly<Record<string, Bitmap>>): Bitmap {
  const cardWidth = 204;
  const output = createBitmap(cardWidth * VEGETATION_IDS.length + 8, 176, DARK);
  drawText(output, 'KINDERGRIMM VEGETATION / 32PX WORLD SCALE / FRONT + SIDE', 12, 7, PAPER, 2);
  for (const [index, id] of VEGETATION_IDS.entries()) {
    const x = 4 + index * cardWidth;
    fillRect(output, x + 4, 29, cardWidth - 8, 138, GRASS);
    for (let gx = x + 4; gx < x + cardWidth - 8; gx += 32) fillRect(output, gx, 29, 1, 138, GRID);
    for (let gy = 39; gy < 167; gy += 32) fillRect(output, x + 4, gy, cardWidth - 8, 1, GRID);
    fillRect(output, x + 4, 149, cardWidth - 8, 18, GRASS_DARK);
    drawText(output, id.toUpperCase(), x + 10, 34, INK);
    for (const [viewIndex, view] of (['front', 'side'] as const).entries()) {
      const recipe = VEGETATION_RECIPE.assets[id];
      const width = Math.round(recipe.world.width * 32);
      const height = Math.round(recipe.world.height * 32);
      const scaled = nearest(frames[`${id}-${view}`]!, width, height);
      const anchorX = x + (viewIndex === 0 ? 58 : 148);
      const groundY = 151;
      const contact = recipe.views[view].groundContact;
      const left = Math.round(anchorX - contact.x * width / VEGETATION_WIDTH);
      const top = Math.round(groundY - contact.y * height / VEGETATION_HEIGHT);
      over(scaled, output, left, top);
      marker(output, anchorX, groundY);
      drawText(output, view.toUpperCase(), anchorX - 16, 156, PAPER);
    }
  }
  return output;
}

function buildAnchorSheet(frames: Readonly<Record<string, Bitmap>>): Bitmap {
  const cardWidth = 244;
  const cardHeight = 384;
  const output = createBitmap(cardWidth * VEGETATION_IDS.length, cardHeight * 2, DARK);
  for (const [column, id] of VEGETATION_IDS.entries()) {
    for (const [row, view] of (['front', 'side'] as const).entries()) {
      const x = column * cardWidth;
      const y = row * cardHeight;
      const frame = frames[`${id}-${view}`]!;
      const data = VEGETATION_RECIPE.assets[id].views[view];
      drawText(output, `${id.toUpperCase()} / ${view.toUpperCase()}`, x + 8, y + 8, PAPER);
      over(nearest(frame, 240, 360), output, x + 2, y + 22);
      line(
        output,
        x + 2 + data.transparentBounds.x * 2,
        y + 22 + data.transparentBounds.y * 2,
        data.transparentBounds.width * 2,
        data.transparentBounds.height * 2,
        GRID,
      );
      marker(output, x + 2 + data.groundContact.x * 2, y + 22 + data.groundContact.y * 2);
    }
  }
  return output;
}

function sha256(bitmap: Bitmap): string {
  return createHash('sha256').update(bitmap.data).digest('hex');
}

function assertFrame(id: VegetationId, view: VegetationView, frame: Bitmap): void {
  const bounds = VEGETATION_RECIPE.assets[id].views[view].transparentBounds;
  let visible = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const offset = (y * frame.width + x) * 4;
      const alpha = frame.data[offset + 3]!;
      if (alpha === 0) {
        if (frame.data[offset] !== 0 || frame.data[offset + 1] !== 0 || frame.data[offset + 2] !== 0) {
          throw new Error(`${id}/${view} has RGB in a transparent pixel.`);
        }
        continue;
      }
      visible += 1;
      if (x < bounds.x || x >= bounds.x + bounds.width || y < bounds.y || y >= bounds.y + bounds.height) {
        throw new Error(`${id}/${view} exceeds its transparent bounds at ${x},${y}.`);
      }
    }
  }
  if (visible === 0) throw new Error(`${id}/${view} rendered no pixels.`);
  const again = bitmap(bakeVegetationFrame(id, view));
  if (sha256(frame) !== sha256(again)) throw new Error(`${id}/${view} is not deterministic.`);
}

function write(name: string, image: Bitmap): string {
  const path = resolve(OUTPUT_ROOT, name);
  writeFileSync(path, encodePng(image), { flush: true });
  return path;
}

function main(): void {
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  const frames: Record<string, Bitmap> = {};
  const files: string[] = [];
  const evidence: Record<string, unknown> = {};
  for (const id of VEGETATION_IDS) {
    for (const view of ['front', 'side'] as const) {
      const frame = bitmap(bakeVegetationFrame(id, view));
      assertFrame(id, view, frame);
      frames[`${id}-${view}`] = frame;
      files.push(write(`${id}-${view}.png`, frame));
      evidence[`${id}-${view}`] = {
        width: frame.width,
        height: frame.height,
        sha256: sha256(frame),
        transparentBounds: VEGETATION_RECIPE.assets[id].views[view].transparentBounds,
        groundContact: VEGETATION_RECIPE.assets[id].views[view].groundContact,
        world: VEGETATION_RECIPE.assets[id].world,
      };
    }
  }
  const native = buildNativeReview(frames);
  const enlarged = createBitmap(native.width * 3, native.height * 3, DARK);
  blitScaled(native, enlarged, 0, 0, 3);
  files.push(write('vegetation-review-native.png', native));
  files.push(write('vegetation-review-3x.png', enlarged));
  files.push(write('vegetation-anchor-sheet.png', buildAnchorSheet(frames)));
  writeFileSync(resolve(OUTPUT_ROOT, 'recipe.json'), `${JSON.stringify(VEGETATION_RECIPE, null, 2)}\n`, { flush: true });
  writeFileSync(resolve(OUTPUT_ROOT, 'evidence.json'), `${JSON.stringify({
    status: 'integrated', deterministic: true, integrated: true, frames: evidence,
  }, null, 2)}\n`, { flush: true });
  process.stdout.write(`${files.join('\n')}\n`);
}

main();
