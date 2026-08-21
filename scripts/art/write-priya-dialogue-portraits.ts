import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { blitScaled, createBitmap, encodePng, fillRect, type Bitmap, type Rgba } from './png';

export type PriyaPortraitExpression = 'rest' | 'joy' | 'upset';

const OUTPUT_WIDTH = 754;
const OUTPUT_HEIGHT = 900;
const SCALE = 31;
const EXPRESSIONS: readonly PriyaPortraitExpression[] = ['rest', 'joy', 'upset'];

const C = {
  ink: [26, 23, 29, 255],
  hair: [35, 31, 40, 255],
  hairLift: [78, 66, 84, 255],
  bone: [239, 226, 194, 255],
  boneMid: [209, 191, 157, 255],
  boneShade: [157, 139, 113, 255],
  cavity: [45, 40, 47, 255],
  teal: [70, 128, 130, 255],
  tealLift: [91, 155, 155, 255],
  charcoal: [72, 65, 76, 255],
  cyan: [57, 221, 225, 255],
  cyanLight: [174, 255, 251, 255],
} as const satisfies Record<string, Rgba>;

function rect(bitmap: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(bitmap, x, y, width, height, color);
}

function span(bitmap: Bitmap, y: number, left: number, right: number, color: Rgba): void {
  rect(bitmap, left, y, right - left + 1, 1, color);
}

function drawHair(bitmap: Bitmap): void {
  span(bitmap, 1, 12, 17, C.hair);
  span(bitmap, 2, 14, 19, C.hair);
  span(bitmap, 3, 16, 20, C.hair);
  for (let y = 4; y <= 12; y += 1) span(bitmap, y, 17, 21 + (y > 7 ? 1 : 0), C.hair);
  span(bitmap, 4, 18, 20, C.hairLift);
  span(bitmap, 6, 20, 21, C.hairLift);
  span(bitmap, 9, 19, 20, C.hairLift);

  const braid = [
    [18, 12, 4, 3], [19, 14, 4, 3], [18, 16, 4, 3], [19, 18, 4, 3],
    [18, 20, 4, 3], [19, 22, 3, 3], [18, 24, 3, 3], [19, 26, 2, 2],
  ] as const;
  braid.forEach(([x, y, width, height], index) => {
    rect(bitmap, x, y, width, height, C.hair);
    rect(bitmap, x + (index % 2), y, 1, height - 1, C.hairLift);
  });
}

function drawTorso(bitmap: Bitmap): void {
  rect(bitmap, 2, 20, 4, 8, C.boneMid);
  rect(bitmap, 19, 20, 3, 8, C.boneMid);
  rect(bitmap, 3, 20, 2, 7, C.bone);
  rect(bitmap, 19, 20, 2, 7, C.bone);

  rect(bitmap, 10, 18, 3, 11, C.bone);
  rect(bitmap, 11, 19, 1, 10, C.boneShade);
  for (const y of [20, 22, 24, 26]) {
    span(bitmap, y, 6, 17, C.bone);
    span(bitmap, y + 1, 7, 16, C.boneMid);
    rect(bitmap, 6, y, 1, 2, C.boneShade);
    rect(bitmap, 17, y, 1, 2, C.boneShade);
  }

  const leftTop = [[3, 19, 6], [3, 20, 6], [4, 21, 5], [4, 22, 4], [4, 23, 3]] as const;
  const rightTop = [[14, 19, 5], [15, 20, 4], [16, 21, 3], [17, 22, 2], [18, 23, 1]] as const;
  leftTop.forEach(([x, y, width]) => rect(bitmap, x, y, width, 1, y === 19 ? C.tealLift : C.teal));
  rightTop.forEach(([x, y, width]) => rect(bitmap, x, y, width, 1, y === 19 ? C.tealLift : C.teal));

  rect(bitmap, 5, 17, 5, 3, C.charcoal);
  rect(bitmap, 14, 17, 5, 3, C.charcoal);
  rect(bitmap, 9, 18, 6, 3, C.charcoal);
  rect(bitmap, 11, 18, 2, 3, C.ink);
}

function drawSkull(bitmap: Bitmap): void {
  const spans = [
    [1, 6, 15], [2, 4, 17], [3, 3, 18], [4, 2, 19], [5, 2, 19], [6, 2, 19],
    [7, 2, 19], [8, 2, 19], [9, 2, 19], [10, 3, 18], [11, 3, 18], [12, 4, 17],
    [13, 5, 16],
  ] as const;
  spans.forEach(([y, left, right]) => span(bitmap, y, left, right, C.bone));
  span(bitmap, 2, 5, 8, C.boneMid);
  span(bitmap, 3, 3, 5, C.boneMid);
  for (let y = 4; y <= 11; y += 1) rect(bitmap, 2, y, 1, 1, C.boneShade);
  for (let y = 3; y <= 12; y += 1) rect(bitmap, 18, y, 1, 1, C.boneShade);
  span(bitmap, 12, 4, 6, C.boneMid);
  span(bitmap, 12, 15, 17, C.boneShade);

  rect(bitmap, 4, 6, 5, 4, C.cavity);
  rect(bitmap, 5, 5, 3, 1, C.cavity);
  rect(bitmap, 11, 6, 5, 4, C.cavity);
  rect(bitmap, 12, 5, 3, 1, C.cavity);
  rect(bitmap, 8, 10, 4, 3, C.cavity);
  rect(bitmap, 9, 9, 2, 1, C.cavity);
  rect(bitmap, 8, 12, 1, 1, C.boneMid);
  rect(bitmap, 11, 12, 1, 1, C.boneMid);
}

function drawJaw(bitmap: Bitmap, expression: PriyaPortraitExpression): void {
  const shift = expression === 'upset' ? 1 : 0;
  const top = expression === 'joy' ? 15 : 14;
  span(bitmap, top, 6 + shift, 16 + shift, C.boneMid);
  span(bitmap, top + 1, 7 + shift, 15 + shift, expression === 'joy' ? C.cavity : C.bone);
  span(bitmap, top + 2, 7 + shift, 15 + shift, C.bone);
  span(bitmap, top + 3, 8 + shift, 14 + shift, C.boneShade);
  for (const x of [8, 10, 12, 14]) rect(bitmap, x + shift, top, 1, expression === 'joy' ? 3 : 2, C.cavity);
}

function drawPupils(bitmap: Bitmap, expression: PriyaPortraitExpression): void {
  if (expression === 'joy') {
    rect(bitmap, 5, 7, 2, 2, C.cyanLight);
    rect(bitmap, 12, 7, 2, 2, C.cyanLight);
    rect(bitmap, 6, 8, 1, 1, C.cyan);
    rect(bitmap, 13, 8, 1, 1, C.cyan);
    return;
  }
  if (expression === 'upset') {
    rect(bitmap, 6, 6, 1, 3, C.cyan);
    rect(bitmap, 13, 7, 1, 3, C.cyan);
    return;
  }
  rect(bitmap, 6, 7, 1, 2, C.cyan);
  rect(bitmap, 13, 7, 1, 2, C.cyan);
}

export function buildPriyaDialoguePortrait(expression: PriyaPortraitExpression): Bitmap {
  const logical = createBitmap(24, 29);
  drawHair(logical);
  drawTorso(logical);
  drawSkull(logical);
  drawJaw(logical, expression);
  drawPupils(logical, expression);

  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, Math.floor((OUTPUT_WIDTH - logical.width * SCALE) / 2), 0, SCALE);
  return output;
}

export function writePriyaDialoguePortraits(root = process.cwd()): readonly string[] {
  const paths = EXPRESSIONS.map((expression) => {
    const suffix = expression === 'rest' ? '' : `.${expression}`;
    const path = resolve(root, 'assets/source/dialogue-portraits', `priya-nair${suffix}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(buildPriyaDialoguePortrait(expression)));
    return path;
  });
  return paths;
}

if (require.main === module) {
  process.stdout.write(`${writePriyaDialoguePortraits().join('\n')}\n`);
}
