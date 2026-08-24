import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ACTION_CHECK_DICE_FRAME_IDS,
  ACTION_CHECK_DICE_HEIGHT,
  ACTION_CHECK_DICE_RECIPE,
  ACTION_CHECK_DICE_WIDTH,
  bakeActionCheckDiceFrame,
  type ActionCheckDiceFrameId,
} from '../../src/render/pencil/action-check-dice';
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

const OUTPUT_ROOT = resolve('artifacts/kindergrimm-action-check-dice');
const PRODUCTION_ROOT = resolve('assets/generated');
const PROMOTE = process.argv.includes('--promote');
const DARK = parseHexColor('#17151b');
const LIGHT = parseHexColor('#e6e0cf');
const PAPER = parseHexColor('#f6f1e5');
const INK = parseHexColor('#1f1d1a');
const MUTED = parseHexColor('#887d71');
const GUIDE = parseHexColor('#58d7d9');
const CARD_WIDTH = 272;
const CARD_HEIGHT = 154;

function bitmap(data: Uint8ClampedArray): Bitmap {
  return { width: ACTION_CHECK_DICE_WIDTH, height: ACTION_CHECK_DICE_HEIGHT, data: Buffer.from(data) };
}

function sha256(source: Uint8Array | string): string {
  return createHash('sha256').update(source).digest('hex');
}

function over(source: Bitmap, target: Bitmap, targetX: number, targetY: number): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * 4;
      const alpha = source.data[sourceOffset + 3]! / 255;
      if (alpha === 0) continue;
      const targetOffset = ((targetY + y) * target.width + targetX + x) * 4;
      const color: Rgba = [
        Math.round(source.data[sourceOffset]! * alpha + target.data[targetOffset]! * (1 - alpha)),
        Math.round(source.data[sourceOffset + 1]! * alpha + target.data[targetOffset + 1]! * (1 - alpha)),
        Math.round(source.data[sourceOffset + 2]! * alpha + target.data[targetOffset + 2]! * (1 - alpha)),
        255,
      ];
      setPixel(target, targetX + x, targetY + y, color);
    }
  }
}

function border(target: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(target, x, y, width, 1, color);
  fillRect(target, x, y + height - 1, width, 1, color);
  fillRect(target, x, y, 1, height, color);
  fillRect(target, x + width - 1, y, 1, height, color);
}

function guide(target: Bitmap, frameId: ActionCheckDiceFrameId, originX: number, originY: number): void {
  const metadata = ACTION_CHECK_DICE_RECIPE.frames[frameId];
  const bounds = metadata.transparentBounds;
  border(target, originX + bounds.x, originY + bounds.y, bounds.width, bounds.height, GUIDE);
  const contact = metadata.anchors.groundContact;
  fillRect(target, originX + contact.x - 6, originY + contact.y, 13, 1, GUIDE);
  fillRect(target, originX + contact.x, originY + contact.y - 6, 1, 13, GUIDE);
}

function reviewCard(target: Bitmap, frameId: ActionCheckDiceFrameId, source: Bitmap, x: number, y: number): void {
  drawText(target, frameId.replaceAll('-', ' ').toUpperCase(), x + 4, y + 2, PAPER);
  const imageY = y + 18;
  fillRect(target, x + 4, imageY, ACTION_CHECK_DICE_WIDTH, ACTION_CHECK_DICE_HEIGHT, DARK);
  fillRect(target, x + 136, imageY, ACTION_CHECK_DICE_WIDTH, ACTION_CHECK_DICE_HEIGHT, LIGHT);
  border(target, x + 4, imageY, ACTION_CHECK_DICE_WIDTH, ACTION_CHECK_DICE_HEIGHT, MUTED);
  border(target, x + 136, imageY, ACTION_CHECK_DICE_WIDTH, ACTION_CHECK_DICE_HEIGHT, MUTED);
  over(source, target, x + 4, imageY);
  over(source, target, x + 136, imageY);
  guide(target, frameId, x + 4, imageY);
  guide(target, frameId, x + 136, imageY);
}

function buildReview(frames: ReadonlyMap<ActionCheckDiceFrameId, Bitmap>): Bitmap {
  const output = createBitmap(CARD_WIDTH * 4 + 16, CARD_HEIGHT * 2 + 30, parseHexColor('#2a2730'));
  drawText(output, 'ACTION CHECK DICE / KINDERGRIMM GRAPHITE / DARK + LIGHT', 12, 8, PAPER, 2);
  ACTION_CHECK_DICE_FRAME_IDS.forEach((frameId, index) => {
    reviewCard(output, frameId, frames.get(frameId)!, 8 + index % 4 * CARD_WIDTH, 28 + Math.floor(index / 4) * CARD_HEIGHT);
  });
  return output;
}

function buildAtlas(frames: ReadonlyMap<ActionCheckDiceFrameId, Bitmap>): Bitmap {
  const atlas = createBitmap(ACTION_CHECK_DICE_WIDTH * ACTION_CHECK_DICE_FRAME_IDS.length, ACTION_CHECK_DICE_HEIGHT);
  ACTION_CHECK_DICE_FRAME_IDS.forEach((frameId, index) => {
    blitScaled(frames.get(frameId)!, atlas, index * ACTION_CHECK_DICE_WIDTH, 0, 1);
  });
  return atlas;
}

function assertFrame(frameId: ActionCheckDiceFrameId, source: Bitmap): void {
  const bounds = ACTION_CHECK_DICE_RECIPE.frames[frameId].transparentBounds;
  let visible = 0;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4;
      const alpha = source.data[offset + 3]!;
      if (alpha === 0) {
        if (source.data[offset] !== 0 || source.data[offset + 1] !== 0 || source.data[offset + 2] !== 0) {
          throw new Error(`${frameId} has RGB data in a transparent pixel.`);
        }
        continue;
      }
      visible += 1;
      if (x < bounds.x || x >= bounds.x + bounds.width || y < bounds.y || y >= bounds.y + bounds.height) {
        throw new Error(`${frameId} exceeds its declared transparent bounds at ${x},${y}.`);
      }
    }
  }
  if (visible === 0) throw new Error(`${frameId} rendered no visible pixels.`);
  const regenerated = bitmap(bakeActionCheckDiceFrame(frameId));
  if (sha256(source.data) !== sha256(regenerated.data)) {
    throw new Error(`${frameId} is not deterministic.`);
  }
}

function assertRecipe(frames: ReadonlyMap<ActionCheckDiceFrameId, Bitmap>): void {
  if (ACTION_CHECK_DICE_FRAME_IDS.length !== 8) throw new Error('The recipe must contain six dice and two shadows.');
  if (ACTION_CHECK_DICE_RECIPE.upstreamCommit !== 'de339ad739d8cbd28ff2dd4a940af38c0ede86c8') {
    throw new Error('The pinned KinderGrimm commit changed.');
  }
  for (const frameId of ACTION_CHECK_DICE_FRAME_IDS) assertFrame(frameId, frames.get(frameId)!);
  const dieHashes = new Set(ACTION_CHECK_DICE_FRAME_IDS.slice(0, 6).map((frameId) => sha256(frames.get(frameId)!.data)));
  if (dieHashes.size !== 6) throw new Error('The six die faces are not distinct.');
  if (sha256(frames.get('soft-flight-shadow')!.data) === sha256(frames.get('strong-contact-shadow')!.data)) {
    throw new Error('The soft and strong shadow frames must be distinct.');
  }
}

function writePng(name: string, source: Bitmap): { path: string; pngSha256: string } {
  const path = resolve(OUTPUT_ROOT, name);
  const png = encodePng(source);
  writeFileSync(path, png, { flush: true });
  return { path, pngSha256: sha256(png) };
}

function main(): void {
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  const frames = new Map(ACTION_CHECK_DICE_FRAME_IDS.map((frameId) => [frameId, bitmap(bakeActionCheckDiceFrame(frameId))]));
  assertRecipe(frames);

  const review1x = buildReview(frames);
  const review3x = createBitmap(review1x.width * 3, review1x.height * 3);
  blitScaled(review1x, review3x, 0, 0, 3);
  const atlas = buildAtlas(frames);
  const frameFiles = ACTION_CHECK_DICE_FRAME_IDS.map((frameId) => writePng(`${frameId}.png`, frames.get(frameId)!));
  const atlasFile = writePng('action-check-dice-atlas-review.png', atlas);
  const reviewFiles = [
    writePng('action-check-dice-review-1x.png', review1x),
    writePng('action-check-dice-review-3x.png', review3x),
  ];
  const recipeJson = `${JSON.stringify(ACTION_CHECK_DICE_RECIPE, null, 2)}\n`;
  const recipeSource = readFileSync(resolve('src/render/pencil/action-check-dice.ts'));
  writeFileSync(resolve(OUTPUT_ROOT, 'recipe.json'), recipeJson, { flush: true });
  writeFileSync(resolve(OUTPUT_ROOT, 'evidence.json'), `${JSON.stringify({
    deterministic: true,
    recipeSha256: sha256(recipeSource),
    recipeDataSha256: sha256(recipeJson),
    atlas: {
      width: atlas.width,
      height: atlas.height,
      pngSha256: atlasFile.pngSha256,
      frames: Object.fromEntries(ACTION_CHECK_DICE_FRAME_IDS.map((frameId, index) => [frameId, {
        x: index * ACTION_CHECK_DICE_WIDTH,
        y: 0,
        width: ACTION_CHECK_DICE_WIDTH,
        height: ACTION_CHECK_DICE_HEIGHT,
        anchors: ACTION_CHECK_DICE_RECIPE.frames[frameId].anchors,
        rgbaSha256: sha256(frames.get(frameId)!.data),
      }])),
    },
    files: [...frameFiles, atlasFile, ...reviewFiles].map(({ path, pngSha256 }) => ({
      path: path.slice(OUTPUT_ROOT.length + 1),
      pngSha256,
    })),
  }, null, 2)}\n`, { flush: true });
  if (PROMOTE) {
    mkdirSync(PRODUCTION_ROOT, { recursive: true });
    const framesById = Object.fromEntries(ACTION_CHECK_DICE_FRAME_IDS.map((frameId, index) => [frameId, {
      x: index * ACTION_CHECK_DICE_WIDTH,
      y: 0,
      width: ACTION_CHECK_DICE_WIDTH,
      height: ACTION_CHECK_DICE_HEIGHT,
      anchors: ACTION_CHECK_DICE_RECIPE.frames[frameId].anchors,
    }]));
    writeFileSync(resolve(PRODUCTION_ROOT, 'action-check-dice.png'), readFileSync(atlasFile.path), { flush: true });
    writeFileSync(resolve(PRODUCTION_ROOT, 'action-check-dice.json'), `${JSON.stringify({
      version: 1,
      assetId: ACTION_CHECK_DICE_RECIPE.assetId,
      status: ACTION_CHECK_DICE_RECIPE.status,
      upstreamCommit: ACTION_CHECK_DICE_RECIPE.upstreamCommit,
      canvas: ACTION_CHECK_DICE_RECIPE.canvas,
      recipeSha256: sha256(recipeSource),
      atlasSha256: atlasFile.pngSha256,
      frames: framesById,
    }, null, 2)}\n`, { flush: true });
  }
  process.stdout.write(`${[...frameFiles, atlasFile, ...reviewFiles].map(({ path }) => path).join('\n')}\n`);
}

main();
