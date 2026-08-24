import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ALARM_CLOCK_HEIGHT,
  ALARM_CLOCK_RECIPE,
  ALARM_CLOCK_WIDTH,
  bakeAlarmClockFrame,
  type AlarmClockAnchorId,
  type AlarmClockView,
} from '../../src/render/pencil/alarm-clock';
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

const OUTPUT_ROOT = resolve('artifacts/kindergrimm-alarm-clock');
const DARK = parseHexColor('#17151b');
const LIGHT = parseHexColor('#e6e0cf');
const PAPER = parseHexColor('#f6f1e5');
const INK = parseHexColor('#1f1d1a');
const MUTED = parseHexColor('#887d71');
const ANCHOR = parseHexColor('#58d7d9');
const WORLD_WIDTH = ALARM_CLOCK_RECIPE.world.frame.width;
const WORLD_HEIGHT = ALARM_CLOCK_RECIPE.world.frame.height;

function bitmap(data: Uint8ClampedArray): Bitmap {
  return { width: ALARM_CLOCK_WIDTH, height: ALARM_CLOCK_HEIGHT, data: Buffer.from(data) };
}

function nearest(source: Bitmap, width: number, height: number): Bitmap {
  const target = createBitmap(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(source.width - 1, Math.floor((x + 0.5) * source.width / width));
      const sy = Math.min(source.height - 1, Math.floor((y + 0.5) * source.height / height));
      const sourceOffset = (sy * source.width + sx) * 4;
      setPixel(target, x, y, [
        source.data[sourceOffset]!,
        source.data[sourceOffset + 1]!,
        source.data[sourceOffset + 2]!,
        source.data[sourceOffset + 3]!,
      ]);
    }
  }
  return target;
}

function over(source: Bitmap, target: Bitmap, targetX: number, targetY: number, scale = 1): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * 4;
      const alpha = source.data[sourceOffset + 3]! / 255;
      if (alpha === 0) continue;
      const targetOffset = ((targetY + y * scale) * target.width + targetX + x * scale) * 4;
      const color: Rgba = [
        Math.round(source.data[sourceOffset]! * alpha + target.data[targetOffset]! * (1 - alpha)),
        Math.round(source.data[sourceOffset + 1]! * alpha + target.data[targetOffset + 1]! * (1 - alpha)),
        Math.round(source.data[sourceOffset + 2]! * alpha + target.data[targetOffset + 2]! * (1 - alpha)),
        255,
      ];
      fillRect(target, targetX + x * scale, targetY + y * scale, scale, scale, color);
    }
  }
}

function border(bitmap: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(bitmap, x, y, width, 1, color);
  fillRect(bitmap, x, y + height - 1, width, 1, color);
  fillRect(bitmap, x, y, 1, height, color);
  fillRect(bitmap, x + width - 1, y, 1, height, color);
}

function reviewCard(
  output: Bitmap,
  sprite: Bitmap,
  x: number,
  label: string,
  background: Rgba,
  contactRow: number,
): void {
  fillRect(output, x, 28, 104, 78, background);
  drawText(output, label, x + 7, 34, background === DARK ? PAPER : INK);
  const tileX = x + 36;
  const tileY = 61;
  border(output, tileX, tileY, 32, 32, background === DARK ? MUTED : parseHexColor('#a39789'));
  const spriteY = tileY + 32 - contactRow;
  over(sprite, output, tileX, spriteY);
}

function buildNativeReview(front: Bitmap, side: Bitmap): Bitmap {
  const output = createBitmap(448, 118, parseHexColor('#2a2730'));
  drawText(output, 'MODERN DIGITAL ALARM CLOCK / ONE 32X32 WORLD TILE', 12, 8, PAPER, 2);
  const frontContact = Math.round(ALARM_CLOCK_RECIPE.views.front.groundContact.y * WORLD_HEIGHT / ALARM_CLOCK_HEIGHT);
  const sideContact = Math.round(ALARM_CLOCK_RECIPE.views.side.groundContact.y * WORLD_HEIGHT / ALARM_CLOCK_HEIGHT);
  reviewCard(output, front, 8, 'FRONT DARK', DARK, frontContact);
  reviewCard(output, front, 116, 'FRONT LIGHT', LIGHT, frontContact);
  reviewCard(output, side, 224, 'SIDE DARK', DARK, sideContact);
  reviewCard(output, side, 332, 'SIDE LIGHT', LIGHT, sideContact);
  return output;
}

const ANCHOR_NUMBERS: Readonly<Record<AlarmClockAnchorId, string>> = {
  snooze: '1', hour: '2', minute: '3', alarm: '4', power: '5',
};

function marker(output: Bitmap, x: number, y: number, number: string): void {
  fillRect(output, x - 5, y - 1, 11, 3, ANCHOR);
  fillRect(output, x - 1, y - 5, 3, 11, ANCHOR);
  drawText(output, number, x + 7, y - 4, ANCHOR);
}

function markView(output: Bitmap, view: AlarmClockView, originX: number, originY: number): void {
  for (const [id, point] of Object.entries(ALARM_CLOCK_RECIPE.views[view].anchors)) {
    marker(output, originX + point.x * 2, originY + point.y * 2, ANCHOR_NUMBERS[id as AlarmClockAnchorId]);
  }
}

function buildAnchorOverlay(front: Bitmap, side: Bitmap): Bitmap {
  const output = createBitmap(448, 192, DARK);
  drawText(output, 'INTERACTION ANCHORS / SOURCE PIXELS', 12, 8, PAPER, 2);
  drawText(output, 'FRONT', 16, 27, PAPER);
  drawText(output, 'SIDE', 240, 27, PAPER);
  over(front, output, 16, 37, 2);
  over(side, output, 240, 37, 2);
  markView(output, 'front', 16, 37);
  markView(output, 'side', 240, 37);
  drawText(output, '1 SNOOZE  2 HOUR  3 MINUTE', 12, 172, ANCHOR);
  drawText(output, '4 ALARM   5 POWER', 250, 172, ANCHOR);
  return output;
}

function sha256(bitmap: Bitmap): string {
  return createHash('sha256').update(bitmap.data).digest('hex');
}

function assertPixels(view: AlarmClockView, frame: Bitmap): void {
  const declared = ALARM_CLOCK_RECIPE.views[view].transparentBounds;
  let left = frame.width;
  let top = frame.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const offset = (y * frame.width + x) * 4;
      if (frame.data[offset + 3] === 0) {
        if (frame.data[offset] !== 0 || frame.data[offset + 1] !== 0 || frame.data[offset + 2] !== 0) {
          throw new Error(`${view} has RGB data in a transparent pixel.`);
        }
        continue;
      }
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error(`${view} rendered no visible pixels.`);
  if (
    left < declared.x || top < declared.y ||
    right >= declared.x + declared.width || bottom >= declared.y + declared.height
  ) throw new Error(`${view} exceeds its declared transparent bounds.`);
}

function assertRecipe(front: Bitmap, side: Bitmap): void {
  if (ALARM_CLOCK_RECIPE.time !== '7:00') throw new Error('The alarm-clock time must be 7:00.');
  if (JSON.stringify(ALARM_CLOCK_RECIPE.display) !== JSON.stringify({
    digits: [
      { digit: '7', x: 26, y: 26 },
      { digit: '0', x: 46, y: 26 },
      { digit: '0', x: 60, y: 26 },
    ],
    colon: { x: 41, dotYs: [32, 39] },
  })) throw new Error('The alarm-clock 7:00 glyph layout changed.');
  const snooze = ALARM_CLOCK_RECIPE.views.front.anchors.snooze;
  if (snooze.x < 31 || snooze.x > 65 || snooze.y < 10 || snooze.y > 18) {
    throw new Error('The snooze anchor must stay inside the largest button.');
  }
  if (ALARM_CLOCK_RECIPE.orderedParts.join(',') !== 'contact-shadow,feet,case,screen,time,buttons') {
    throw new Error('The alarm-clock part order changed.');
  }
  for (const view of ['front', 'side'] as const) {
    const bounds = ALARM_CLOCK_RECIPE.views[view].transparentBounds;
    for (const [id, anchor] of Object.entries(ALARM_CLOCK_RECIPE.views[view].anchors)) {
      if (anchor.x < bounds.x || anchor.x >= bounds.x + bounds.width || anchor.y < bounds.y || anchor.y >= bounds.y + bounds.height) {
        throw new Error(`${view} anchor ${id} is outside the declared transparent bounds.`);
      }
    }
  }
  assertPixels('front', front);
  assertPixels('side', side);
  const again = [bitmap(bakeAlarmClockFrame('front')), bitmap(bakeAlarmClockFrame('side'))];
  if (sha256(front) !== sha256(again[0]!) || sha256(side) !== sha256(again[1]!)) {
    throw new Error('Alarm-clock regeneration is not deterministic.');
  }
}

function write(name: string, image: Bitmap): string {
  const path = resolve(OUTPUT_ROOT, name);
  writeFileSync(path, encodePng(image), { flush: true });
  return path;
}

function main(): void {
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  const front = bitmap(bakeAlarmClockFrame('front'));
  const side = bitmap(bakeAlarmClockFrame('side'));
  assertRecipe(front, side);
  const frontNative = nearest(front, WORLD_WIDTH, WORLD_HEIGHT);
  const sideNative = nearest(side, WORLD_WIDTH, WORLD_HEIGHT);
  const review1x = buildNativeReview(frontNative, sideNative);
  const review3x = createBitmap(review1x.width * 3, review1x.height * 3, DARK);
  blitScaled(review1x, review3x, 0, 0, 3);

  const files = [
    write('alarm-clock-front.png', front),
    write('alarm-clock-side.png', side),
    write('alarm-clock-front-native.png', frontNative),
    write('alarm-clock-side-native.png', sideNative),
    write('alarm-clock-anchors.png', buildAnchorOverlay(front, side)),
    write('alarm-clock-review-1x.png', review1x),
    write('alarm-clock-review-3x.png', review3x),
  ];
  writeFileSync(resolve(OUTPUT_ROOT, 'recipe.json'), `${JSON.stringify(ALARM_CLOCK_RECIPE, null, 2)}\n`, { flush: true });
  writeFileSync(resolve(OUTPUT_ROOT, 'evidence.json'), `${JSON.stringify({
    deterministic: true,
    sourceFrames: {
      front: { width: front.width, height: front.height, sha256: sha256(front) },
      side: { width: side.width, height: side.height, sha256: sha256(side) },
    },
    worldFrames: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    files: files.map((path) => path.slice(OUTPUT_ROOT.length + 1)),
  }, null, 2)}\n`, { flush: true });
  process.stdout.write(`${files.join('\n')}\n`);
}

main();
