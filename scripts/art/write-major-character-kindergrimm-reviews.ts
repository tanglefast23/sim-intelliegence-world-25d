import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  bakeCurrentMajorCharacterFrames,
  bakeMajorCharacterCandidateFrames,
  MAJOR_CHARACTER_IDS,
  majorCharacterRigData,
  renderMajorCharacterCandidateFrame,
  renderMajorCharacterWireframe,
  type MajorCharacterId,
} from '../../src/render/pencil/generated-major-characters';
import {
  bakeGeneratedLindaFrames,
} from '../../src/render/pencil/generated-linda';
import {
  bakeGeneratedMinaFrames,
} from '../../src/render/pencil/generated-mina';
import { PENCIL_CHARACTER_RECIPES } from '../../src/render/pencil/characters';
import { buildPencilLayout } from '../../src/render/pencil/layout';
import { drawLiteralGoblin } from '../../src/render/pencil/parts/goblin';
import { type VampireFacing, type VampirePose } from '../../src/render/pencil/pose';
import { hashSeed, Sketch } from '../../src/render/pencil/sketch';
import { PENCIL_HEIGHT, PENCIL_WIDTH } from '../../src/render/pencil/vampire';
import { drawText } from './build-review-sheet';
import { blitScaled, createBitmap, encodePng, setPixel, type Bitmap, type Rgba } from './png';

const FACINGS = ['front', 'rear', 'left', 'right'] as const;
const IDLE_INDEXES = [0, 9, 18, 27] as const;
const LABEL_HEIGHT = 26;
const PAPER = [246, 241, 229, 255] as const;
const NAMES: Readonly<Record<MajorCharacterId, string>> = {
  'devon-price': 'DEVON PRICE',
  'rafael-cruz': 'RAFAEL CRUZ',
  'linda-boyfriend': 'MARCUS VALE',
  'tomas-reed': 'TOMAS REED',
  'priya-nair': 'PRIYA NAIR',
  'sora-tan': 'SORA TAN',
  'elise-moreau': 'ELISE MOREAU',
  'resident-01': 'CALDER NINE',
};

type ReviewFrames = Readonly<{
  current: readonly Uint8ClampedArray[];
  candidate: readonly Uint8ClampedArray[];
  rig: readonly Uint8ClampedArray[];
  walk0: readonly Uint8ClampedArray[];
  walk1: readonly Uint8ClampedArray[];
}>;

function pose(facing: VampireFacing, gait: 0 | 1, moving: boolean): VampirePose {
  return { facing, gait, moving };
}

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

function fill(output: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) setPixel(output, px, py, color);
  }
}

function paintRow(
  output: Bitmap,
  scale: number,
  x: number,
  y: number,
  label: string,
  frames: readonly Uint8ClampedArray[],
  silhouettes = false,
): void {
  const width = PENCIL_WIDTH * scale * 4;
  const height = PENCIL_HEIGHT * scale + LABEL_HEIGHT;
  fill(output, x, y, width, height, PAPER);
  drawText(output, label, x + 6, y + 7, [31, 29, 26, 255], scale > 1 ? 2 : 1);
  frames.forEach((frame, column) => {
    blitScaled(
      silhouettes ? silhouette(frame) : bitmap(frame),
      output,
      x + column * PENCIL_WIDTH * scale,
      y + LABEL_HEIGHT,
      scale,
    );
  });
}

function reviewFrames(id: MajorCharacterId): ReviewFrames {
  return {
    current: bakeCurrentMajorCharacterFrames(id),
    candidate: bakeMajorCharacterCandidateFrames(id),
    rig: FACINGS.map((facing) => renderMajorCharacterWireframe(id, pose(facing, 0, false))),
    walk0: FACINGS.map((facing) => renderMajorCharacterCandidateFrame(id, pose(facing, 0, true))),
    walk1: FACINGS.map((facing) => renderMajorCharacterCandidateFrame(id, pose(facing, 1, true))),
  };
}

function idles(frames: readonly Uint8ClampedArray[]): readonly Uint8ClampedArray[] {
  return IDLE_INDEXES.map((index) => frames[index]!);
}

function writePng(directory: string, filename: string, output: Bitmap): string {
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, filename);
  writeFileSync(path, encodePng(output));
  return path;
}

function writeDetailed(id: MajorCharacterId, frames: ReviewFrames, scale: 1 | 3): string {
  const rowHeight = PENCIL_HEIGHT * scale + LABEL_HEIGHT;
  const output = createBitmap(PENCIL_WIDTH * scale * 4, rowHeight * 6, PAPER);
  paintRow(output, scale, 0, 0, `${NAMES[id]} CURRENT / FRONT REAR LEFT RIGHT`, idles(frames.current));
  paintRow(output, scale, 0, rowHeight, 'KINDERGRIMM CANDIDATE / FRONT REAR LEFT RIGHT', idles(frames.candidate));
  paintRow(output, scale, 0, rowHeight * 2, 'RIG / BLUE JOINT RED HAND GREEN CONTACT GOLD FACE', frames.rig);
  paintRow(output, scale, 0, rowHeight * 3, 'WALK GAIT 0 / FRONT REAR LEFT RIGHT', frames.walk0);
  paintRow(output, scale, 0, rowHeight * 4, 'WALK GAIT 1 / FRONT REAR LEFT RIGHT', frames.walk1);
  paintRow(
    output,
    scale,
    0,
    rowHeight * 5,
    `SILHOUETTE / ${majorCharacterRigData(id).partOrder.length} ORDERED PARTS`,
    idles(frames.candidate),
    true,
  );
  return writePng(resolve('artifacts/kindergrimm-characters', id), `${id}-review-${scale}x.png`, output);
}

function writeStandalone(
  id: MajorCharacterId,
  filename: string,
  label: string,
  frames: readonly Uint8ClampedArray[],
): string {
  const scale = 3;
  const output = createBitmap(PENCIL_WIDTH * scale * 4, PENCIL_HEIGHT * scale + LABEL_HEIGHT, PAPER);
  paintRow(output, scale, 0, 0, label, frames);
  return writePng(resolve('artifacts/kindergrimm-characters', id), filename, output);
}

const reviewed = new Map<MajorCharacterId, ReviewFrames>();
const files: string[] = [];
for (const id of MAJOR_CHARACTER_IDS) {
  const frames = reviewFrames(id);
  reviewed.set(id, frames);
  files.push(writeDetailed(id, frames, 1));
  files.push(writeDetailed(id, frames, 3));
  files.push(writeStandalone(id, `${id}-current-3x.png`, `${NAMES[id]} CURRENT / FRONT REAR LEFT RIGHT`, idles(frames.current)));
  files.push(writeStandalone(id, `${id}-kindergrimm-3x.png`, `${NAMES[id]} KINDERGRIMM / FRONT REAR LEFT RIGHT`, idles(frames.candidate)));
  files.push(writeStandalone(id, `${id}-rig-data-3x.png`, `${NAMES[id]} RIG / FRONT REAR LEFT RIGHT`, frames.rig));
}

const overviewScale = 2;
const overviewRowHeight = PENCIL_HEIGHT * overviewScale + LABEL_HEIGHT;
const blockWidth = PENCIL_WIDTH * overviewScale * 4;
const blockHeight = overviewRowHeight * 3;
const overview = createBitmap(blockWidth * 2, blockHeight * 4, PAPER);
MAJOR_CHARACTER_IDS.forEach((id, index) => {
  const frames = reviewed.get(id)!;
  const x = (index % 2) * blockWidth;
  const y = Math.floor(index / 2) * blockHeight;
  paintRow(overview, overviewScale, x, y, `${NAMES[id]} CURRENT`, idles(frames.current));
  paintRow(overview, overviewScale, x, y + overviewRowHeight, `${NAMES[id]} KINDERGRIMM`, idles(frames.candidate));
  paintRow(overview, overviewScale, x, y + overviewRowHeight * 2, `${NAMES[id]} RIG DATA`, frames.rig);
});
files.push(writePng(resolve('artifacts/kindergrimm-characters'), 'remaining-major-characters-review-2x.png', overview));

const profileIds = ['devon-price', 'rafael-cruz', 'linda-boyfriend', 'tomas-reed', 'sora-tan'] as const;
const profileScale = 3;
const profileRowHeight = PENCIL_HEIGHT * profileScale + LABEL_HEIGHT;
const profileReview = createBitmap(PENCIL_WIDTH * profileScale * 4, profileRowHeight * profileIds.length, PAPER);
profileIds.forEach((id, index) => {
  const frames = reviewed.get(id)!;
  paintRow(
    profileReview,
    profileScale,
    0,
    index * profileRowHeight,
    `${NAMES[id]} / CURRENT LEFT RIGHT / REVISED LEFT RIGHT`,
    [frames.current[18]!, frames.current[27]!, frames.candidate[18]!, frames.candidate[27]!],
  );
});
files.push(writePng(resolve('artifacts/kindergrimm-characters'), 'profile-revisions-3x.png', profileReview));

const lindaCurrent = bakeGeneratedLindaFrames();
const lindaCandidate = bakeGeneratedLindaFrames(true);
const minaCurrent = bakeGeneratedMinaFrames();
const minaCandidate = bakeGeneratedMinaFrames(true);
const goblinRecipe = PENCIL_CHARACTER_RECIPES['resident-02'];
const goblinLayout = buildPencilLayout(goblinRecipe.shape, goblinRecipe.palette);
const goblinFrame = (facing: 'left' | 'right', revised: boolean): Uint8ClampedArray => {
  const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
  sketch.boil(hashSeed('resident-02', 'profile-review', facing));
  drawLiteralGoblin(sketch, goblinLayout, { facing, gait: 0, moving: false }, { dressed: true, sideProfile: revised });
  return sketch.data;
};
const pair = (
  current: readonly Uint8ClampedArray[],
  candidate: readonly Uint8ClampedArray[],
): readonly Uint8ClampedArray[] => [current[18]!, current[27]!, candidate[18]!, candidate[27]!];
const allProfiles: readonly Readonly<{ name: string; frames: readonly Uint8ClampedArray[] }>[] = [
  { name: 'LINDA', frames: pair(lindaCurrent, lindaCandidate) },
  { name: 'MARCUS VALE', frames: pair(reviewed.get('linda-boyfriend')!.current, reviewed.get('linda-boyfriend')!.candidate) },
  { name: 'MINA PARK', frames: pair(minaCurrent, minaCandidate) },
  { name: 'DEVON PRICE', frames: pair(reviewed.get('devon-price')!.current, reviewed.get('devon-price')!.candidate) },
  { name: 'RAFAEL CRUZ', frames: pair(reviewed.get('rafael-cruz')!.current, reviewed.get('rafael-cruz')!.candidate) },
  { name: 'TOMAS REED', frames: pair(reviewed.get('tomas-reed')!.current, reviewed.get('tomas-reed')!.candidate) },
  { name: 'PRIYA NAIR', frames: pair(reviewed.get('priya-nair')!.current, reviewed.get('priya-nair')!.candidate) },
  { name: 'SORA TAN', frames: pair(reviewed.get('sora-tan')!.current, reviewed.get('sora-tan')!.candidate) },
  { name: 'ELISE MOREAU', frames: pair(reviewed.get('elise-moreau')!.current, reviewed.get('elise-moreau')!.candidate) },
  { name: 'CALDER NINE', frames: pair(reviewed.get('resident-01')!.current, reviewed.get('resident-01')!.candidate) },
  { name: 'GOBLIN RESIDENT', frames: [goblinFrame('left', false), goblinFrame('right', false), goblinFrame('left', true), goblinFrame('right', true)] },
];
const allProfileBlockWidth = PENCIL_WIDTH * profileScale * 4;
const allProfileReview = createBitmap(allProfileBlockWidth * 2, profileRowHeight * Math.ceil(allProfiles.length / 2), PAPER);
allProfiles.forEach((entry, index) => paintRow(
  allProfileReview,
  profileScale,
  (index % 2) * allProfileBlockWidth,
  Math.floor(index / 2) * profileRowHeight,
  `${entry.name} / CURRENT LEFT RIGHT / REVISED LEFT RIGHT`,
  entry.frames,
));
files.push(writePng(resolve('artifacts/kindergrimm-characters'), 'all-character-profile-fixes-3x.png', allProfileReview));

process.stdout.write(`${files.join('\n')}\n`);
