import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { decodePng } from './png';

/**
 * Turns a crayon texture image into the tiling greyscale tile the props multiply.
 *
 * Joe supplied an AI-generated crayon texture on 2026-08-19, after four attempts at synthesising
 * the mark from strokes missed: they read as ruled lines or as static. An image carries the wax's
 * actual grain, which is what stroke synthesis kept failing to produce.
 *
 * What ships is not the image. It is stripped to luminance, box-filtered 1344x690 down to 48x48,
 * contrast-halved and mirrored — a derived grain field, not a picture.
 *
 * **Why greyscale.** The source is green, but props are green, brown, teal and cream. Stripping
 * to luminance and multiplying means ONE texture serves every colour: bright wax passes the
 * prop's own colour through, dark tooth darkens it. A colour texture would fight the tint.
 *
 * **Why normalised.** A multiply can only darken. The tile's mean is forced to paper white so a
 * prop's AVERAGE colour comes out exactly as authored — texture without a colour shift. This is
 * the bug that crushed the bushes to black twice before.
 *
 * **Why mirrored.** A photograph does not tile; its edges would show as a grid across the world.
 * Mirroring makes every edge match its neighbour by construction.
 *
 * Run: npm run art:crayon
 */
const SOURCE = 'assets/source/art/crayon.png';
const OUTPUT = 'src/render/pencil/generated-crayon-tile.ts';
/** Quarter of the final tile: the output mirrors to 2x this on both axes. */
const QUARTER = 96;
/** Paper white, matching PAPER in sketch.ts — the identity value for a multiply. */
const PAPER_WHITE = 246;
/**
 * What the DARKEST wax texel does to a prop's colour, as a fraction of paper.
 *
 * 0.62 means the deepest grain renders a prop at 62% of its authored colour. Stated as a number
 * because this is the value that crushed the bushes to black twice when it was implicit: the mean
 * being right protects the average, never the extremes.
 */
const DARKEST = Math.round(246 * 0.62);

function main(root = process.cwd()): void {
  const sourcePath = resolve(root, SOURCE);
  if (!existsSync(sourcePath)) {
    throw new Error(
      `Missing ${SOURCE}. Save the crayon texture there as a PNG, then run npm run art:crayon.`,
    );
  }
  const image = decodePng(readFileSync(sourcePath));

  /**
   * CROP at native resolution. Do not downsample.
   *
   * The first version box-filtered 1344x690 down to the tile, averaging ~14x7 source pixels per
   * texel — which destroys precisely the fine wax grain this whole exercise is for. Measured, it
   * left a 24x24 face window with a spread of 34/255, invisible on a mid-green. A native crop
   * keeps every grain the artist's texture has.
   */
  const originX = Math.max(0, Math.floor((image.width - QUARTER) / 2));
  const originY = Math.max(0, Math.floor((image.height - QUARTER) / 2));
  const quarter = new Float64Array(QUARTER * QUARTER);
  for (let ty = 0; ty < QUARTER; ty += 1) {
    for (let tx = 0; tx < QUARTER; tx += 1) {
      const sx = Math.min(image.width - 1, originX + tx);
      const sy = Math.min(image.height - 1, originY + ty);
      const offset = (sy * image.width + sx) * 4;
      // Rec. 709 luma. The source is green, so a plain channel average would read its hue as
      // brightness and bias the whole texture.
      quarter[ty * QUARTER + tx] = 0.2126 * (image.data[offset] ?? 0)
        + 0.7152 * (image.data[offset + 1] ?? 0)
        + 0.0722 * (image.data[offset + 2] ?? 0);
    }
  }
  // Stretch the crop's own range to full black-to-white before the contrast cap below. A crayon
  // scan occupies a narrow band of luminance; without this, capping starts from almost no range.
  let cropMin = 255;
  let cropMax = 0;
  for (const value of quarter) {
    if (value < cropMin) cropMin = value;
    if (value > cropMax) cropMax = value;
  }
  const span = Math.max(1, cropMax - cropMin);
  for (let i = 0; i < quarter.length; i += 1) {
    quarter[i] = ((quarter[i] ?? cropMin) - cropMin) / span * 255;
  }

  // Mirror into a seamless tile: [q | flipX] over [flipY | flipXY].
  const size = QUARTER * 2;
  const tile = new Float64Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = x < QUARTER ? x : size - 1 - x;
      const sy = y < QUARTER ? y : size - 1 - y;
      tile[y * size + x] = quarter[sy * QUARTER + sx] ?? PAPER_WHITE;
    }
  }

  /**
   * Map to the multiply range: mean lands exactly on paper, darkest on DARKEST, brightest on 255.
   *
   * Piecewise on purpose. The earlier version scaled by a single gain and clamped at 255, so the
   * bright half clipped and dragged the mean down to 225 — an 8% darkening of every prop, which
   * is precisely the colour shift this tile must not cause. Mapping each half to its own target
   * cannot clip, so the mean is exact and the darkest texel's effect is a stated number.
   */
  let mean = 0;
  for (const value of tile) mean += value;
  mean /= tile.length;
  let low = 255;
  let high = 0;
  for (const value of tile) {
    if (value < low) low = value;
    if (value > high) high = value;
  }
  const bytes: number[] = [];
  for (let i = 0; i < tile.length; i += 1) {
    const value = tile[i] ?? mean;
    const mapped = value < mean
      ? PAPER_WHITE - ((mean - value) / Math.max(1, mean - low)) * (PAPER_WHITE - DARKEST)
      : PAPER_WHITE + ((value - mean) / Math.max(1, high - mean)) * (255 - PAPER_WHITE);
    bytes.push(Math.max(0, Math.min(255, Math.round(mapped))));
  }

  const rows: string[] = [];
  for (let i = 0; i < bytes.length; i += 32) {
    rows.push(`  ${bytes.slice(i, i + 32).join(',')},`);
  }
  const output = `/**
 * Generated by scripts/art/build-crayon-tile.ts. Do not hand-edit.
 *
 * A photographed crayon texture, reduced to a seamless greyscale tile with a paper-white mean so
 * multiplying it over a prop colour adds grain without shifting the colour.
 */
export const CRAYON_TILE_SIZE = ${size};

export const CRAYON_TILE: readonly number[] = [
${rows.join('\n')}
];
`;
  writeFileSync(resolve(root, OUTPUT), output, { encoding: 'utf8', flush: true });
  process.stdout.write(`Crayon tile: ${OUTPUT} (${size}x${size})\n`);
}

main();
