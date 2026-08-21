import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { blitScaled, createBitmap, encodePng, fillRect, type Bitmap, type Rgba } from './png';

export type TomasPortraitExpression = 'rest' | 'joy' | 'upset';

const OUTPUT_WIDTH = 754;
const OUTPUT_HEIGHT = 900;
const SCALE = 31;
const EXPRESSIONS: readonly TomasPortraitExpression[] = ['rest', 'joy', 'upset'];

const C = {
  ink: [28, 27, 31, 255],
  sheet: [245, 243, 233, 255],
  sheetMid: [218, 216, 207, 255],
  sheetShade: [180, 181, 179, 255],
  hole: [25, 24, 29, 255],
  tag: [233, 231, 221, 255],
} as const satisfies Record<string, Rgba>;

function rect(bitmap: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(bitmap, x, y, width, height, color);
}

function span(bitmap: Bitmap, y: number, left: number, right: number, color: Rgba): void {
  rect(bitmap, left, y, right - left + 1, 1, color);
}

function drawSheet(bitmap: Bitmap): void {
  const spans = [
    [1, 9, 14], [2, 7, 16], [3, 5, 18], [4, 4, 19], [5, 4, 19], [6, 4, 19],
    [7, 4, 19], [8, 4, 19], [9, 4, 19], [10, 4, 19], [11, 4, 19], [12, 4, 19],
    [13, 4, 19], [14, 3, 20], [15, 1, 22], [16, 0, 23], [17, 0, 23], [18, 1, 22],
    [19, 2, 21], [20, 3, 20], [21, 3, 20], [22, 2, 21], [23, 1, 22], [24, 1, 22],
    [25, 0, 23], [26, 0, 23], [27, 0, 23], [28, 0, 23],
  ] as const;
  spans.forEach(([y, left, right]) => span(bitmap, y, left, right, C.sheet));
  spans.forEach(([y, left, right]) => {
    rect(bitmap, left, y, 1, 1, C.ink);
    rect(bitmap, right, y, 1, 1, C.ink);
  });
  span(bitmap, 1, 8, 15, C.ink);

  rect(bitmap, 6, 5, 1, 6, C.sheetMid);
  rect(bitmap, 7, 18, 1, 6, C.sheetMid);
  rect(bitmap, 11, 2, 1, 7, C.sheetShade);
  rect(bitmap, 12, 18, 1, 7, C.sheetShade);
  rect(bitmap, 17, 4, 1, 7, C.sheetMid);
  rect(bitmap, 18, 20, 1, 6, C.sheetMid);
}

function drawEyeHoles(bitmap: Bitmap, expression: TomasPortraitExpression): void {
  if (expression === 'joy') {
    span(bitmap, 6, 6, 8, C.hole);
    rect(bitmap, 5, 7, 5, 5, C.hole);
    span(bitmap, 12, 6, 8, C.hole);
    span(bitmap, 7, 15, 17, C.hole);
    rect(bitmap, 14, 8, 5, 5, C.hole);
    span(bitmap, 13, 15, 17, C.hole);
    return;
  }
  if (expression === 'upset') {
    span(bitmap, 6, 7, 9, C.hole);
    rect(bitmap, 6, 7, 4, 5, C.hole);
    span(bitmap, 12, 7, 9, C.hole);
    span(bitmap, 8, 14, 16, C.hole);
    rect(bitmap, 15, 9, 3, 5, C.hole);
    span(bitmap, 14, 16, 17, C.hole);
    return;
  }
  span(bitmap, 6, 6, 8, C.hole);
  rect(bitmap, 5, 7, 5, 6, C.hole);
  span(bitmap, 13, 6, 8, C.hole);
  span(bitmap, 7, 15, 17, C.hole);
  rect(bitmap, 14, 8, 5, 6, C.hole);
  span(bitmap, 14, 15, 17, C.hole);
}

function drawPermitTag(bitmap: Bitmap): void {
  rect(bitmap, 19, 22, 3, 4, C.sheetShade);
  rect(bitmap, 20, 23, 2, 2, C.tag);
}

export function buildTomasDialoguePortrait(expression: TomasPortraitExpression): Bitmap {
  const logical = createBitmap(24, 29);
  drawSheet(logical);
  drawEyeHoles(logical, expression);
  drawPermitTag(logical);

  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, Math.floor((OUTPUT_WIDTH - logical.width * SCALE) / 2), 0, SCALE);
  return output;
}

export function writeTomasDialoguePortraits(root = process.cwd()): readonly string[] {
  return EXPRESSIONS.map((expression) => {
    const suffix = expression === 'rest' ? '' : `.${expression}`;
    const path = resolve(root, 'assets/source/dialogue-portraits', `tomas-reed${suffix}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(buildTomasDialoguePortrait(expression)));
    return path;
  });
}

if (require.main === module) {
  process.stdout.write(`${writeTomasDialoguePortraits().join('\n')}\n`);
}
