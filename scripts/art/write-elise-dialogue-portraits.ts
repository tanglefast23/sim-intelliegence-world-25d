import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { blitScaled, createBitmap, encodePng, fillRect, type Bitmap, type Rgba } from './png';

export type ElisePortraitExpression = 'rest' | 'joy' | 'upset';

const OUTPUT_WIDTH = 754;
const OUTPUT_HEIGHT = 900;
const SCALE = 31;
const EXPRESSIONS: readonly ElisePortraitExpression[] = ['rest', 'joy', 'upset'];

const C = {
  ink: [31, 29, 30, 255],
  flesh: [143, 155, 131, 255],
  fleshLight: [173, 181, 166, 255],
  ash: [158, 168, 157, 255],
  moss: [101, 116, 94, 255],
  cavity: [49, 45, 43, 255],
  eye: [173, 126, 72, 255],
  hair: [92, 46, 34, 255],
  hairLight: [139, 70, 47, 255],
  metal: [185, 191, 184, 255],
  metalShade: [105, 111, 108, 255],
  mustard: [173, 128, 46, 255],
  mustardLight: [206, 162, 67, 255],
  charcoal: [61, 53, 66, 255],
  red: [181, 46, 44, 255],
  redDark: [100, 34, 39, 255],
} as const satisfies Record<string, Rgba>;

function rect(bitmap: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(bitmap, x, y, width, height, color);
}

function span(bitmap: Bitmap, y: number, left: number, right: number, color: Rgba): void {
  rect(bitmap, left, y, right - left + 1, 1, color);
}

function drawTorso(bitmap: Bitmap): void {
  rect(bitmap, 8, 17, 10, 8, C.flesh);
  rect(bitmap, 8, 17, 1, 7, C.ink);
  rect(bitmap, 17, 17, 1, 7, C.ink);
  span(bitmap, 21, 8, 17, C.ink);
  rect(bitmap, 11, 18, 1, 4, C.ash);
  rect(bitmap, 14, 18, 1, 4, C.moss);

  const jacket = [
    [19, 2, 7], [20, 1, 8], [21, 1, 7], [22, 1, 7], [23, 0, 7],
    [24, 0, 6], [25, 0, 6], [26, 0, 6], [27, 0, 6], [28, 0, 6],
  ] as const;
  jacket.forEach(([y, left, right]) => span(bitmap, y, left, right, y < 21 ? C.mustardLight : C.mustard));
  jacket.forEach(([y, left]) => rect(bitmap, left, y, 1, 1, C.ink));
  const rightJacket = [
    [19, 16, 22], [20, 17, 23], [21, 18, 23], [22, 18, 23], [23, 18, 23],
    [24, 18, 23], [25, 18, 23], [26, 18, 23], [27, 18, 23], [28, 18, 23],
  ] as const;
  rightJacket.forEach(([y, left, right]) => span(bitmap, y, left, right, y < 21 ? C.mustardLight : C.mustard));
  rightJacket.forEach(([y, , right]) => rect(bitmap, right, y, 1, 1, C.ink));
  for (let step = 0; step < 8; step += 1) rect(bitmap, 7 + step, 20 + Math.floor(step * 0.75), 1, 1, C.charcoal);

  rect(bitmap, 19, 18, 5, 10, C.redDark);
  rect(bitmap, 20, 18, 4, 9, C.red);
  rect(bitmap, 21, 20, 2, 3, C.charcoal);
  rect(bitmap, 21, 25, 1, 1, C.metal);
  rect(bitmap, 19, 18, 5, 1, C.ink);

  rect(bitmap, 5, 19, 3, 1, C.metalShade);
  rect(bitmap, 4, 18, 1, 3, C.metalShade);
  rect(bitmap, 3, 19, 3, 1, C.metalShade);
  rect(bitmap, 4, 19, 1, 1, C.metal);
  rect(bitmap, 17, 19, 2, 1, C.metalShade);
  rect(bitmap, 18, 17, 4, 4, C.metalShade);
  rect(bitmap, 19, 18, 2, 2, C.metal);
}

function drawHead(bitmap: Bitmap): void {
  const spans = [
    [2, 4, 18], [3, 2, 20], [4, 1, 21], [5, 1, 21], [6, 1, 21], [7, 1, 21],
    [8, 1, 21], [9, 1, 21], [10, 1, 21], [11, 1, 21], [12, 1, 21], [13, 1, 21],
    [14, 2, 21], [15, 3, 21], [16, 4, 21], [17, 6, 20],
  ] as const;
  spans.forEach(([y, left, right]) => span(bitmap, y, left, right, C.flesh));
  spans.forEach(([y, left, right]) => {
    rect(bitmap, left, y, 1, 1, C.ink);
    rect(bitmap, right, y, 1, 1, C.ink);
  });
  span(bitmap, 2, 4, 18, C.ink);
  span(bitmap, 17, 6, 20, C.ink);

  rect(bitmap, 2, 3, 7, 6, C.ash);
  rect(bitmap, 3, 8, 6, 6, C.ash);
  rect(bitmap, 2, 4, 1, 8, C.fleshLight);
  rect(bitmap, 18, 12, 3, 4, C.moss);

  rect(bitmap, 11, 2, 1, 3, C.ink);
  rect(bitmap, 10, 4, 1, 2, C.ink);
  rect(bitmap, 8, 5, 2, 1, C.ink);
  rect(bitmap, 7, 6, 1, 2, C.ink);
  rect(bitmap, 5, 8, 2, 1, C.ink);
  rect(bitmap, 4, 9, 1, 4, C.ink);
  rect(bitmap, 3, 11, 3, 1, C.ink);
  rect(bitmap, 18, 13, 1, 4, C.ink);
  rect(bitmap, 17, 15, 3, 1, C.ink);
}

function drawHair(bitmap: Bitmap): void {
  rect(bitmap, 5, 1, 5, 1, C.hair);
  rect(bitmap, 6, 0, 3, 1, C.hairLight);
  rect(bitmap, 13, 1, 5, 1, C.hair);
  rect(bitmap, 14, 0, 3, 1, C.hairLight);
  rect(bitmap, 2, 1, 3, 3, C.hair);
  rect(bitmap, 3, 0, 2, 2, C.hairLight);
  rect(bitmap, 1, 2, 2, 2, C.hair);
}

function drawEyesAndBrows(bitmap: Bitmap, expression: ElisePortraitExpression): void {
  const leftBrowY = expression === 'joy' ? 6 : expression === 'upset' ? 8 : 7;
  const rightBrowY = expression === 'upset' ? 7 : 6;
  rect(bitmap, 1, leftBrowY, 9, 2, C.moss);
  rect(bitmap, 2, leftBrowY, 7, 1, C.ash);
  rect(bitmap, 11, rightBrowY, 11, 2, C.moss);
  rect(bitmap, 12, rightBrowY, 9, 1, C.ash);
  if (expression === 'upset') {
    rect(bitmap, 2, 7, 3, 1, C.ink);
    rect(bitmap, 18, 6, 3, 1, C.ink);
  }

  rect(bitmap, 4, 10, 5, 4, C.cavity);
  rect(bitmap, 5, 11, 2, 2, C.eye);
  rect(bitmap, 6, 11, 1, 1, C.fleshLight);
  rect(bitmap, 13, 9, 5, 4, C.cavity);
  rect(bitmap, 14, 10, 2, 2, C.eye);
  rect(bitmap, 15, 10, 1, 1, C.fleshLight);
}

function drawNoseAndMouth(bitmap: Bitmap, expression: ElisePortraitExpression): void {
  rect(bitmap, 11, 10, 2, 5, C.moss);
  rect(bitmap, 13, 12, 2, 3, C.ash);
  rect(bitmap, 14, 14, 3, 1, C.ink);
  if (expression === 'joy') {
    rect(bitmap, 9, 15, 7, 1, C.ink);
    rect(bitmap, 11, 16, 6, 1, C.ink);
    rect(bitmap, 16, 15, 2, 1, C.ink);
    return;
  }
  if (expression === 'upset') {
    rect(bitmap, 9, 16, 9, 2, C.ink);
    rect(bitmap, 11, 16, 1, 1, C.metal);
    rect(bitmap, 15, 16, 1, 1, C.metal);
    return;
  }
  rect(bitmap, 9, 16, 9, 1, C.ink);
  rect(bitmap, 16, 15, 2, 1, C.ink);
}

export function buildEliseDialoguePortrait(expression: ElisePortraitExpression): Bitmap {
  const logical = createBitmap(24, 29);
  drawTorso(logical);
  drawHead(logical);
  drawHair(logical);
  drawEyesAndBrows(logical, expression);
  drawNoseAndMouth(logical, expression);

  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, Math.floor((OUTPUT_WIDTH - logical.width * SCALE) / 2), 0, SCALE);
  return output;
}

export function writeEliseDialoguePortraits(root = process.cwd()): readonly string[] {
  return EXPRESSIONS.map((expression) => {
    const suffix = expression === 'rest' ? '' : `.${expression}`;
    const path = resolve(root, 'assets/source/dialogue-portraits', `elise-moreau${suffix}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(buildEliseDialoguePortrait(expression)));
    return path;
  });
}

if (require.main === module) {
  process.stdout.write(`${writeEliseDialoguePortraits().join('\n')}\n`);
}
