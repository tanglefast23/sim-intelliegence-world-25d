import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PNG } from 'pngjs';

/**
 * Objective numbers for a captured 2.5D frame, so an art round can be told from noise.
 *
 * Judging a render by eye works for "is this better" and fails for "is this 0.1 better". Three
 * rounds of this pass changed a constant, re-captured, and could not see a difference that the
 * numbers showed plainly — and one round changed a constant that the numbers showed did nothing at
 * all, which is how a wrong hypothesis survived to be stacked on.
 *
 * Four measures, chosen because each maps to a rubric criterion in docs/25d-scene-playbook.md:
 *
 * - `deadFraction` — pixels too dark to carry information. Criterion 5, colour survives, and
 *   criterion 8, density. This is the one that catches "half the frame is a black plate".
 * - `meanLuminance` — overall exposure. Moves when a lighting constant moves; if it does not, the
 *   constant did nothing and the hypothesis behind it was wrong.
 * - `meanSaturation` — colourfulness. Criterion 6. A scene that desaturates at night has lost its
 *   palette rather than dimmed it.
 * - `detail` — mean absolute luminance step between neighbouring pixels. Criterion 7, material
 *   variety. A flat plastic slab scores near zero; a textured brick wall scores high.
 *
 * The HUD is excluded by cropping. It is bright, fully saturated and static, so leaving it in
 * would flatter every frame equally and mask the change being measured.
 */
export type FrameScore = Readonly<{
  name: string;
  deadFraction: number;
  /** Fraction of 8x8 blocks whose BRIGHTEST pixel is still under the cut: a true black plate. */
  flatDeadFraction: number;
  meanLuminance: number;
  meanSaturation: number;
  detail: number;
}>;

/**
 * The HUD panel, the bottom hint bar and the frame border, as FRACTIONS of the capture.
 *
 * Fractions, not pixels. The first version hardcoded a 1280x720 crop, and when a capture came back
 * at 2560x1376 the window silently moved to the top-left quadrant — mostly HUD — and reported wild
 * swings on every metric that read as a huge art regression. A scorer that is wrong about WHERE it
 * is looking is worse than no scorer, because its numbers still look like measurements.
 */
const CROP = Object.freeze({ top: 0.264, bottom: 0.896, left: 0.0125, right: 0.9875 });

export function scoreFrame(name: string, pngBytes: Buffer): FrameScore {
  const png = PNG.sync.read(pngBytes);
  const top = Math.round(png.height * CROP.top);
  const bottom = Math.round(png.height * CROP.bottom);
  const left = Math.round(png.width * CROP.left);
  const right = Math.round(png.width * CROP.right);
  const luminanceAt = (x: number, y: number): number => {
    const index = (y * png.width + x) * 4;
    return (png.data[index]! + png.data[index + 1]! + png.data[index + 2]!) / 3;
  };
  let count = 0;
  let dead = 0;
  let luminanceTotal = 0;
  let saturationTotal = 0;
  let stepTotal = 0;
  let stepCount = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = (y * png.width + x) * 4;
      const red = png.data[index]!;
      const green = png.data[index + 1]!;
      const blue = png.data[index + 2]!;
      const luminance = (red + green + blue) / 3;
      const high = Math.max(red, green, blue);
      const low = Math.min(red, green, blue);
      count += 1;
      luminanceTotal += luminance;
      // Saturation as chroma over peak, so a dark-but-coloured pixel still counts as coloured.
      saturationTotal += high === 0 ? 0 : (high - low) / high;
      if (luminance < 20) dead += 1;
      if (x + 1 < right) {
        stepTotal += Math.abs(luminanceAt(x + 1, y) - luminance);
        stepCount += 1;
      }
    }
  }
  const round = (value: number): number => Math.round(value * 1000) / 1000;
  // A block counts as flat-dead only if its BRIGHTEST pixel is still under the cut. That separates
  // a featureless black plate from a region that is dark but carries texture — a distinction
  // `deadFraction` alone cannot make, and one that cost three captures to settle by hand.
  const BLOCK = 8;
  let deadBlocks = 0;
  let blocks = 0;
  for (let y = top; y + BLOCK <= bottom; y += BLOCK) {
    for (let x = left; x + BLOCK <= right; x += BLOCK) {
      let peak = 0;
      for (let dy = 0; dy < BLOCK; dy += 1) {
        for (let dx = 0; dx < BLOCK; dx += 1) peak = Math.max(peak, luminanceAt(x + dx, y + dy));
      }
      blocks += 1;
      if (peak < 20) deadBlocks += 1;
    }
  }
  return {
    name,
    deadFraction: round(dead / count),
    flatDeadFraction: round(deadBlocks / Math.max(1, blocks)),
    meanLuminance: round(luminanceTotal / count),
    meanSaturation: round(saturationTotal / count),
    detail: round(stepTotal / Math.max(1, stepCount)),
  };
}

function main(): void {
  const [directory, comparison] = process.argv.slice(2);
  if (!directory) {
    console.error('Usage: tsx scripts/verification/score-25d-frames.ts <capture-dir> [previous-dir]');
    process.exitCode = 1;
    return;
  }
  const score = (root: string): readonly FrameScore[] => readdirSync(root)
    .filter((file) => file.endsWith('.png'))
    .sort()
    .map((file) => scoreFrame(file.replace(/\.png$/u, ''), readFileSync(join(root, file))));

  const current = score(directory);
  const previous = comparison ? new Map(score(comparison).map((one) => [one.name, one])) : undefined;

  const pad = (value: string, width: number): string => value.padEnd(width);
  const num = (value: number, width: number): string => value.toFixed(3).padStart(width);
  console.log(`${pad('frame', 24)}${pad('dead', 9)}${pad('flat', 9)}${pad('lum', 9)}${pad('sat', 9)}detail`);
  for (const one of current) {
    const before = previous?.get(one.name);
    const delta = (now: number, then: number | undefined): string =>
      then === undefined ? '' : ` (${now - then >= 0 ? '+' : ''}${(now - then).toFixed(3)})`;
    console.log(
      pad(one.name, 24)
      + num(one.deadFraction, 6) + delta(one.deadFraction, before?.deadFraction) + '  '
      + num(one.flatDeadFraction, 6) + delta(one.flatDeadFraction, before?.flatDeadFraction) + '  '
      + num(one.meanLuminance, 7) + delta(one.meanLuminance, before?.meanLuminance) + '  '
      + num(one.meanSaturation, 6) + delta(one.meanSaturation, before?.meanSaturation) + '  '
      + num(one.detail, 6) + delta(one.detail, before?.detail),
    );
  }
  writeFileSync(
    join(directory, 'scores.json'),
    `${JSON.stringify({ schemaVersion: 1, scores: current }, null, 2)}\n`,
  );
}

if (process.argv[1]?.endsWith('score-25d-frames.ts')) main();
