import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { blitScaled, createBitmap, encodePng, fillRect, type Bitmap, type Rgba } from './png';

export type RafaelPortraitExpression = 'rest' | 'joy' | 'upset';

const OUTPUT_WIDTH = 754;
const OUTPUT_HEIGHT = 900;
const EXPRESSIONS: readonly RafaelPortraitExpression[] = ['rest', 'joy', 'upset'];

const C = {
  ink: [31, 29, 26, 255],
  skin: [130, 157, 72, 255],
  skinLight: [164, 187, 95, 255],
  skinShade: [91, 119, 58, 255],
  skinDeep: [61, 82, 42, 255],
  eye: [47, 46, 32, 255],
  eyeLight: [220, 192, 91, 255],
  hair: [55, 42, 30, 255],
  hairLight: [83, 57, 37, 255],
  apron: [220, 209, 176, 255],
  apronShade: [184, 166, 128, 255],
  cloth: [73, 58, 44, 255],
  gold: [184, 136, 44, 255],
  goldLight: [224, 181, 73, 255],
  tusk: [245, 238, 216, 255],
  metal: [154, 157, 148, 255],
  metalLight: [211, 213, 204, 255],
} as const satisfies Record<string, Rgba>;

function rect(bitmap: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(bitmap, x, y, width, height, color);
}

function span(bitmap: Bitmap, y: number, left: number, right: number, color: Rgba): void {
  rect(bitmap, left, y, right - left + 1, 1, color);
}

function drawDialogueHead(bitmap: Bitmap): void {
  for (const [y, left, right] of [
    [4, 7, 20], [5, 5, 22], [6, 4, 23], [7, 3, 24], [8, 3, 24],
    [9, 3, 24], [10, 3, 24], [11, 3, 24], [12, 3, 24], [13, 3, 24],
    [14, 2, 25], [15, 2, 25], [16, 2, 25], [17, 2, 25], [18, 3, 24],
    [19, 4, 23], [20, 5, 22], [21, 7, 20],
  ] as const) span(bitmap, y, left, right, C.skin);
  for (let y = 7; y <= 18; y += 1) {
    rect(bitmap, y < 14 ? 3 : 2, y, 1, 1, C.ink);
    rect(bitmap, y < 14 ? 24 : 25, y, 1, 1, C.ink);
  }
  rect(bitmap, 4, 8, 2, 9, C.skinLight);
  rect(bitmap, 22, 9, 2, 9, C.skinShade);
  span(bitmap, 19, 6, 21, C.skinShade);

  span(bitmap, 10, 0, 3, C.skinShade);
  span(bitmap, 11, 0, 3, C.skin);
  span(bitmap, 12, 1, 3, C.skinDeep);
  span(bitmap, 10, 24, 27, C.skinShade);
  span(bitmap, 11, 24, 27, C.skin);
  span(bitmap, 12, 24, 26, C.skinDeep);

  span(bitmap, 3, 11, 16, C.hair);
  span(bitmap, 2, 12, 15, C.hair);
  rect(bitmap, 14, 1, 2, 2, C.hair);
  span(bitmap, 3, 13, 15, C.hairLight);
}

function drawDialogueFace(bitmap: Bitmap, expression: RafaelPortraitExpression): void {
  if (expression === 'joy') {
    span(bitmap, 9, 6, 10, C.ink);
    span(bitmap, 9, 17, 21, C.ink);
    span(bitmap, 11, 7, 10, C.eye);
    span(bitmap, 11, 17, 20, C.eye);
  } else {
    span(bitmap, expression === 'upset' ? 8 : 9, 6, 10, C.ink);
    span(bitmap, expression === 'upset' ? 8 : 9, 17, 21, C.ink);
    rect(bitmap, 7, 10, 4, 4, C.eye);
    rect(bitmap, 17, 10, 4, 4, C.eye);
    rect(bitmap, 8, 11, 2, 2, C.eyeLight);
    rect(bitmap, 18, 11, 2, 2, C.eyeLight);
  }

  rect(bitmap, 9, 13, 10, 4, C.skinShade);
  rect(bitmap, 10, 13, 8, 2, C.skinLight);
  rect(bitmap, 11, 15, 2, 1, C.skinDeep);
  rect(bitmap, 15, 15, 2, 1, C.skinDeep);
  rect(bitmap, 7, 16, 14, 4, C.skinShade);
  span(bitmap, 17, 8, 19, C.ink);
  if (expression === 'joy') span(bitmap, 18, 10, 17, C.tusk);
  else if (expression === 'upset') span(bitmap, 19, 10, 17, C.ink);
  else span(bitmap, 18, 10, 17, C.ink);
  rect(bitmap, 7, 16, 2, 4, C.tusk);
  rect(bitmap, 8, 15, 1, 2, C.tusk);
  rect(bitmap, 19, 16, 2, 4, C.tusk);
  rect(bitmap, 19, 15, 1, 2, C.tusk);
}

function drawDialogueBody(bitmap: Bitmap): void {
  span(bitmap, 22, 10, 17, C.skinShade);
  span(bitmap, 23, 5, 22, C.skin);
  span(bitmap, 24, 3, 24, C.skin);
  rect(bitmap, 2, 25, 24, 7, C.skin);
  rect(bitmap, 2, 27, 4, 5, C.skinShade);
  rect(bitmap, 22, 27, 4, 5, C.skinLight);
  rect(bitmap, 8, 24, 12, 8, C.apron);
  rect(bitmap, 8, 24, 2, 8, C.apronShade);
  span(bitmap, 29, 8, 19, C.cloth);
  span(bitmap, 30, 8, 19, C.cloth);
  rect(bitmap, 13, 29, 3, 2, C.gold);
  rect(bitmap, 25, 23, 1, 9, C.gold);
  rect(bitmap, 24, 22, 3, 3, C.metal);
  rect(bitmap, 25, 22, 1, 1, C.metalLight);
}

export function buildRafaelDialoguePortrait(expression: RafaelPortraitExpression): Bitmap {
  const logical = createBitmap(28, 32);
  drawDialogueHead(logical);
  drawDialogueFace(logical, expression);
  drawDialogueBody(logical);
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, Math.floor((OUTPUT_WIDTH - logical.width * 26) / 2), 34, 26);
  return output;
}

function drawCinematicHead(bitmap: Bitmap): void {
  for (const [y, left, right] of [
    [5, 17, 30], [6, 13, 34], [7, 10, 37], [8, 8, 39], [9, 7, 40],
    [10, 6, 41], [11, 5, 42], [12, 5, 42], [13, 5, 42], [14, 5, 42],
    [15, 5, 42], [16, 5, 42], [17, 5, 42], [18, 5, 42], [19, 5, 42],
    [20, 4, 43], [21, 4, 43], [22, 4, 43], [23, 4, 43], [24, 4, 43],
    [25, 4, 43], [26, 4, 43], [27, 4, 43], [28, 4, 43], [29, 5, 42],
    [30, 5, 42], [31, 6, 41], [32, 7, 40], [33, 9, 38], [34, 12, 35],
  ] as const) span(bitmap, y, left, right, C.skin);
  for (let y = 10; y <= 29; y += 1) {
    rect(bitmap, y < 20 ? 5 : 4, y, 1, 1, C.ink);
    rect(bitmap, y < 20 ? 42 : 43, y, 1, 1, C.ink);
  }
  rect(bitmap, 6, 11, 3, 16, C.skinLight);
  rect(bitmap, 39, 12, 3, 17, C.skinShade);
  span(bitmap, 31, 9, 38, C.skinShade);
  span(bitmap, 32, 12, 35, C.skinShade);

  span(bitmap, 16, 0, 5, C.skinShade);
  span(bitmap, 17, 0, 5, C.skin);
  span(bitmap, 18, 1, 5, C.skinLight);
  span(bitmap, 19, 2, 5, C.skinDeep);
  span(bitmap, 16, 42, 47, C.skinShade);
  span(bitmap, 17, 42, 47, C.skin);
  span(bitmap, 18, 42, 46, C.skinLight);
  span(bitmap, 19, 42, 45, C.skinDeep);

  span(bitmap, 4, 18, 29, C.hair);
  span(bitmap, 3, 20, 27, C.hair);
  span(bitmap, 2, 22, 26, C.hair);
  rect(bitmap, 24, 0, 3, 3, C.hair);
  span(bitmap, 4, 21, 27, C.hairLight);
}

function drawCinematicFace(bitmap: Bitmap): void {
  rect(bitmap, 11, 15, 10, 2, C.ink);
  rect(bitmap, 27, 15, 10, 2, C.ink);
  rect(bitmap, 12, 17, 9, 7, C.eye);
  rect(bitmap, 27, 17, 9, 7, C.eye);
  rect(bitmap, 14, 18, 4, 4, C.eyeLight);
  rect(bitmap, 29, 18, 4, 4, C.eyeLight);
  rect(bitmap, 15, 18, 2, 2, C.goldLight);
  rect(bitmap, 30, 18, 2, 2, C.goldLight);

  rect(bitmap, 16, 22, 16, 7, C.skinShade);
  rect(bitmap, 18, 22, 12, 3, C.skinLight);
  rect(bitmap, 18, 26, 4, 2, C.skinDeep);
  rect(bitmap, 27, 26, 4, 2, C.skinDeep);
  rect(bitmap, 10, 27, 28, 7, C.skinShade);
  span(bitmap, 30, 13, 35, C.ink);
  span(bitmap, 31, 16, 32, C.ink);
  span(bitmap, 25, 13, 14, C.tusk);
  span(bitmap, 26, 12, 14, C.tusk);
  span(bitmap, 27, 11, 14, C.tusk);
  span(bitmap, 28, 11, 15, C.tusk);
  span(bitmap, 29, 10, 15, C.tusk);
  span(bitmap, 30, 10, 15, C.tusk);
  span(bitmap, 31, 10, 15, C.tusk);
  span(bitmap, 25, 34, 35, C.tusk);
  span(bitmap, 26, 34, 36, C.tusk);
  span(bitmap, 27, 34, 37, C.tusk);
  span(bitmap, 28, 33, 37, C.tusk);
  span(bitmap, 29, 33, 38, C.tusk);
  span(bitmap, 30, 33, 38, C.tusk);
  span(bitmap, 31, 33, 38, C.tusk);
  rect(bitmap, 7, 25, 3, 3, C.skinDeep);
  rect(bitmap, 38, 25, 3, 3, C.skinDeep);
}

function drawCinematicBody(bitmap: Bitmap): void {
  rect(bitmap, 18, 35, 12, 5, C.skinShade);
  span(bitmap, 39, 10, 37, C.skin);
  span(bitmap, 40, 7, 40, C.skin);
  span(bitmap, 41, 4, 43, C.skin);
  rect(bitmap, 2, 42, 44, 14, C.skin);
  rect(bitmap, 2, 46, 7, 10, C.skinShade);
  rect(bitmap, 39, 46, 7, 10, C.skinLight);
  rect(bitmap, 13, 39, 22, 17, C.apron);
  rect(bitmap, 13, 41, 4, 15, C.apronShade);
  rect(bitmap, 31, 42, 4, 14, C.apronShade);
  span(bitmap, 50, 13, 34, C.cloth);
  span(bitmap, 51, 13, 34, C.cloth);
  rect(bitmap, 21, 50, 6, 3, C.gold);
  rect(bitmap, 43, 39, 2, 17, C.gold);
  span(bitmap, 34, 42, 45, C.metal);
  span(bitmap, 35, 40, 47, C.metal);
  span(bitmap, 36, 39, 47, C.metal);
  span(bitmap, 37, 39, 47, C.metal);
  span(bitmap, 38, 40, 46, C.metal);
  span(bitmap, 39, 42, 45, C.metal);
  span(bitmap, 35, 42, 45, C.metalLight);
  span(bitmap, 36, 42, 46, C.skinDeep);
  span(bitmap, 37, 42, 46, C.skinDeep);
}

export function buildRafaelCinematicPortrait(): Bitmap {
  const logical = createBitmap(48, 56);
  drawCinematicHead(logical);
  drawCinematicFace(logical);
  drawCinematicBody(logical);
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const scale = 15;
  blitScaled(logical, output, Math.floor((OUTPUT_WIDTH - logical.width * scale) / 2), 30, scale);
  return output;
}

export function writeRafaelDialoguePortraits(root = process.cwd()): readonly string[] {
  const paths = EXPRESSIONS.map((expression) => {
    const suffix = expression === 'rest' ? '' : `.${expression}`;
    const path = resolve(root, 'assets/source/dialogue-portraits', `rafael-cruz${suffix}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(buildRafaelDialoguePortrait(expression)));
    return path;
  });
  const cinematicPath = resolve(root, 'assets/source/dialogue-portraits/rafael-cruz.cinematic.png');
  writeFileSync(cinematicPath, encodePng(buildRafaelCinematicPortrait()));
  return [...paths, cinematicPath];
}

if (require.main === module) {
  process.stdout.write(`${writeRafaelDialoguePortraits().join('\n')}\n`);
}
