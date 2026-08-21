import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { blitScaled, createBitmap, encodePng, fillRect, type Bitmap, type Rgba } from './png';

export type LindaPortraitExpression = 'rest' | 'joy' | 'upset';

const OUTPUT_WIDTH = 754;
const OUTPUT_HEIGHT = 900;
const DIALOGUE_SCALE = 31;
const EXPRESSIONS: readonly LindaPortraitExpression[] = ['rest', 'joy', 'upset'];

const C = {
  ink: [27, 24, 22, 255],
  furDeep: [50, 34, 25, 255],
  fur: [77, 50, 35, 255],
  furMid: [108, 70, 45, 255],
  furLight: [145, 96, 58, 255],
  muzzle: [143, 104, 77, 255],
  muzzleLight: [184, 145, 110, 255],
  eye: [184, 166, 91, 255],
} as const satisfies Record<string, Rgba>;

function rect(bitmap: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(bitmap, x, y, width, height, color);
}

function span(bitmap: Bitmap, y: number, left: number, right: number, color: Rgba): void {
  rect(bitmap, left, y, right - left + 1, 1, color);
}

function drawDialogueBody(bitmap: Bitmap): void {
  rect(bitmap, 3, 20, 18, 9, C.furDeep);
  rect(bitmap, 5, 19, 14, 10, C.fur);
  rect(bitmap, 7, 20, 2, 8, C.furMid);
  rect(bitmap, 15, 20, 2, 8, C.furMid);
  rect(bitmap, 2, 21, 4, 7, C.fur);
  rect(bitmap, 19, 21, 4, 7, C.furDeep);

  // Long mane fur hangs from both sides and continues into the torso and arms.
  rect(bitmap, 1, 4, 5, 21, C.furDeep);
  rect(bitmap, 2, 7, 3, 20, C.fur);
  rect(bitmap, 18, 4, 5, 21, C.furDeep);
  rect(bitmap, 20, 7, 3, 20, C.fur);
  for (const [x, y] of [
    [2, 7], [1, 11], [3, 15], [1, 19], [3, 23], [18, 7], [21, 10], [19, 14], [21, 18], [19, 22], [20, 25],
  ] as const) {
    rect(bitmap, x, y, 2, 2, C.furMid);
  }
  for (const x of [7, 11, 15]) rect(bitmap, x, 20, 1, 8, C.furMid);
}

function drawDialogueHead(bitmap: Bitmap): void {
  const head = [
    [2, 7, 16], [3, 5, 18], [4, 4, 19], [5, 3, 20], [6, 3, 20],
    [7, 2, 20], [8, 2, 20], [9, 2, 20], [10, 2, 20], [11, 2, 20],
    [12, 3, 19], [13, 3, 19], [14, 4, 18], [15, 5, 17], [16, 6, 16],
    [17, 7, 15], [18, 8, 14], [19, 9, 13],
  ] as const;
  head.forEach(([y, left, right]) => span(bitmap, y, left, right, C.fur));
  head.forEach(([y, left, right]) => {
    rect(bitmap, left, y, 1, 1, C.furDeep);
    rect(bitmap, right, y, 1, 1, C.ink);
  });
  span(bitmap, 3, 7, 12, C.furMid);
  span(bitmap, 4, 5, 9, C.furMid);

  const face = [
    [6, 6, 16], [7, 5, 17], [8, 5, 17], [9, 5, 17], [10, 5, 17],
    [11, 5, 17], [12, 6, 16], [13, 6, 16], [14, 7, 15], [15, 8, 14],
    [16, 8, 14],
  ] as const;
  face.forEach(([y, left, right]) => span(bitmap, y, left, right, C.furMid));
  span(bitmap, 7, 5, 17, C.furDeep);
  span(bitmap, 8, 6, 16, C.furDeep);

  span(bitmap, 11, 7, 15, C.muzzle);
  span(bitmap, 12, 6, 16, C.muzzle);
  span(bitmap, 13, 6, 16, C.muzzleLight);
  span(bitmap, 14, 7, 15, C.muzzle);
  span(bitmap, 15, 8, 14, C.muzzle);
  rect(bitmap, 9, 10, 5, 3, C.ink);
  span(bitmap, 10, 10, 12, C.furDeep);
}

function drawDialogueExpression(bitmap: Bitmap, expression: LindaPortraitExpression): void {
  if (expression === 'upset') {
    span(bitmap, 8, 6, 9, C.ink);
    span(bitmap, 7, 14, 17, C.ink);
  } else {
    span(bitmap, 8, 6, 9, C.ink);
    span(bitmap, 8, 14, 17, C.ink);
  }

  if (expression === 'joy') {
    span(bitmap, 9, 7, 9, C.eye);
    span(bitmap, 9, 14, 16, C.eye);
    span(bitmap, 15, 9, 13, C.ink);
    span(bitmap, 16, 10, 12, C.ink);
    return;
  }

  rect(bitmap, 7, 9, 3, 2, C.ink);
  rect(bitmap, 14, 9, 3, 2, C.ink);
  rect(bitmap, 8, 9, 1, 1, C.eye);
  rect(bitmap, 15, 9, 1, 1, C.eye);
  if (expression === 'upset') {
    span(bitmap, 15, 9, 13, C.ink);
    span(bitmap, 14, 10, 12, C.ink);
  } else {
    span(bitmap, 15, 9, 13, C.ink);
  }
}

function drawCinematicShag(bitmap: Bitmap): void {
  const leftShag = [
    [3, 6, 9], [4, 4, 8], [5, 3, 8], [6, 2, 7], [7, 2, 7],
    [8, 1, 6], [9, 1, 6], [10, 1, 6], [11, 0, 6], [12, 0, 5],
    [13, 0, 5], [14, 0, 5], [15, 0, 5], [16, 0, 5], [17, 0, 5],
    [18, 0, 5], [19, 1, 6], [20, 0, 6], [21, 1, 7], [22, 0, 7],
    [23, 1, 8], [24, 0, 8], [25, 1, 9], [26, 0, 9], [27, 1, 9],
    [28, 0, 10], [29, 1, 10],
  ] as const;
  const shag = [
    [2, 17, 20], [3, 16, 22], [4, 16, 23], [5, 17, 24], [6, 17, 25],
    [7, 18, 25], [8, 18, 25], [9, 19, 25], [10, 19, 25], [11, 19, 25],
    [12, 19, 25], [13, 20, 25], [14, 20, 25], [15, 20, 25], [16, 20, 25],
    [17, 20, 25], [18, 20, 24], [19, 20, 25], [20, 19, 24], [21, 20, 25],
    [22, 19, 24], [23, 20, 25], [24, 19, 24], [25, 20, 25], [26, 19, 24],
    [27, 20, 24], [28, 19, 23], [29, 20, 23],
  ] as const;
  leftShag.forEach(([y, left, right]) => span(bitmap, y, left, right, C.furDeep));
  shag.forEach(([y, left, right]) => span(bitmap, y, left, right, C.furDeep));
  for (const [x, y] of [
    [5, 5], [2, 8], [4, 12], [1, 16], [4, 20], [2, 24], [5, 27],
    [18, 4], [21, 6], [19, 10], [22, 13], [20, 17], [22, 20], [20, 24], [21, 28],
  ] as const) {
    rect(bitmap, x, y, 2, 3, C.furMid);
  }
}

function drawCinematicBody(bitmap: Bitmap): void {
  span(bitmap, 21, 7, 19, C.furDeep);
  span(bitmap, 22, 5, 21, C.fur);
  span(bitmap, 23, 3, 22, C.fur);
  rect(bitmap, 2, 24, 22, 8, C.furDeep);
  rect(bitmap, 7, 23, 4, 9, C.furMid);
  rect(bitmap, 15, 23, 4, 9, C.furMid);

  [5, 9, 13, 17, 21].forEach((x, index) => rect(bitmap, x, 23, 1, 9, index % 2 === 0 ? C.furMid : C.fur));

}

function drawCinematicHand(bitmap: Bitmap): void {
  // Her anatomical-left forearm rises from the shag, keeping the broad hand above the UI choices.
  rect(bitmap, 21, 17, 4, 10, C.furMid);
  rect(bitmap, 19, 13, 7, 6, C.furMid);
  rect(bitmap, 17, 15, 3, 3, C.furLight);
  rect(bitmap, 19, 9, 1, 5, C.furLight);
  rect(bitmap, 21, 8, 1, 6, C.furLight);
  rect(bitmap, 23, 8, 1, 6, C.furLight);
  rect(bitmap, 25, 9, 1, 5, C.furLight);
  span(bitmap, 18, 20, 24, C.furDeep);
}

function drawCinematicHead(bitmap: Bitmap): void {
  const head = [
    [3, 8, 18], [4, 6, 20], [5, 5, 21], [6, 4, 22], [7, 3, 22],
    [8, 3, 22], [9, 2, 22], [10, 2, 22], [11, 2, 22], [12, 2, 22],
    [13, 2, 22], [14, 2, 22], [15, 2, 21], [16, 3, 21], [17, 3, 21],
    [18, 4, 20], [19, 5, 20], [20, 6, 19], [21, 7, 18], [22, 9, 17],
  ] as const;
  head.forEach(([y, left, right]) => span(bitmap, y, left, right, C.fur));
  head.forEach(([y, left, right]) => {
    rect(bitmap, left, y, 1, 1, C.furDeep);
    rect(bitmap, right, y, 1, 1, C.ink);
  });
  span(bitmap, 4, 8, 14, C.furMid);
  span(bitmap, 5, 6, 10, C.furMid);

  // Three-quarter face: the short muzzle projects left, while the shag stays behind it.
  span(bitmap, 7, 6, 18, C.furMid);
  span(bitmap, 8, 5, 18, C.furMid);
  rect(bitmap, 4, 9, 15, 7, C.furMid);
  span(bitmap, 9, 5, 18, C.furDeep);
  span(bitmap, 10, 6, 17, C.furDeep);
  span(bitmap, 12, 3, 15, C.muzzle);
  span(bitmap, 13, 1, 16, C.muzzle);
  span(bitmap, 14, 0, 16, C.muzzleLight);
  span(bitmap, 15, 1, 16, C.muzzle);
  span(bitmap, 16, 3, 15, C.muzzle);
  span(bitmap, 17, 5, 14, C.muzzle);

  rect(bitmap, 3, 12, 5, 3, C.ink);
  span(bitmap, 12, 4, 6, C.furDeep);
  rect(bitmap, 7, 10, 4, 3, C.ink);
  rect(bitmap, 8, 10, 1, 1, C.eye);
  rect(bitmap, 14, 10, 3, 3, C.ink);
  rect(bitmap, 14, 10, 1, 1, C.eye);
  span(bitmap, 16, 5, 12, C.ink);
  span(bitmap, 17, 7, 11, C.ink);

  rect(bitmap, 5, 18, 2, 2, C.furLight);
  rect(bitmap, 15, 15, 2, 3, C.furLight);
  rect(bitmap, 17, 7, 2, 2, C.furLight);
}

export function buildLindaDialoguePortrait(expression: LindaPortraitExpression): Bitmap {
  const logical = createBitmap(24, 29);
  drawDialogueBody(logical);
  drawDialogueHead(logical);
  drawDialogueExpression(logical, expression);

  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, Math.floor((OUTPUT_WIDTH - logical.width * DIALOGUE_SCALE) / 2), 0, DIALOGUE_SCALE);
  return output;
}

export function buildLindaCinematicPortrait(): Bitmap {
  const logical = createBitmap(26, 32);
  drawCinematicShag(logical);
  drawCinematicBody(logical);
  drawCinematicHead(logical);
  drawCinematicHand(logical);

  const scale = 28;
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(
    logical,
    output,
    Math.floor((OUTPUT_WIDTH - logical.width * scale) / 2),
    Math.floor((OUTPUT_HEIGHT - logical.height * scale) / 2),
    scale,
  );
  return output;
}

export function writeLindaDialoguePortraits(root = process.cwd()): readonly string[] {
  const paths = EXPRESSIONS.map((expression) => {
    const suffix = expression === 'rest' ? '' : `.${expression}`;
    const path = resolve(root, 'assets/source/dialogue-portraits', `linda${suffix}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(buildLindaDialoguePortrait(expression)));
    return path;
  });
  const cinematicPath = resolve(root, 'assets/source/dialogue-portraits/linda.cinematic.png');
  writeFileSync(cinematicPath, encodePng(buildLindaCinematicPortrait()));
  return [...paths, cinematicPath];
}

if (require.main === module) {
  process.stdout.write(`${writeLindaDialoguePortraits().join('\n')}\n`);
}
