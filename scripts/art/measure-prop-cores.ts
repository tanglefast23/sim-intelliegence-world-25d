import { readFileSync } from 'node:fs';

import { PNG } from 'pngjs';

import { ATLAS_INDEX } from '../../src/render/atlas';
import { PROP_RECIPES } from '../../src/render/three25/recipes';

/**
 * Measures the largest fully-opaque rectangle inside each prop sprite, and its mean colour.
 *
 * The 2.5D path draws furniture as flat single-colour boxes, which is the last thing separating it
 * from the reference: real crates and counters have grain. Mapping the sprite onto the box faces is
 * the obvious fix and does not work naively — prop sprites have transparent margins, and `alphaTest`
 * turns those into holes punched straight through the furniture.
 *
 * The opaque CORE has no transparent texel in it by construction, so a box face UV'd to the core
 * samples grain and never a hole. This script emits the table; it is not run at build time, and its
 * output is pasted into `PROP_CORES` in `recipes.ts` the same way `PROP_FLAT_COLORS` was measured.
 *
 * Run with: npx tsx scripts/art/measure-prop-cores.ts
 */
type Core = Readonly<{ x: number; y: number; width: number; height: number; area: number }>;

const ATLAS_PATH = 'assets/generated/world-atlas.png';

/** Alpha below this counts as transparent. Cutouts are hard-edged, so there is no middle ground. */
const OPAQUE_ALPHA = 250;

/** A core smaller than this is not worth mapping: stretched over a box face it is mud, not grain. */
const MINIMUM_CORE_AREA = 64;

function largestOpaqueRectangle(
  png: PNG,
  rect: Readonly<{ x: number; y: number; width: number; height: number }>,
): Core {
  const heights = new Array<number>(rect.width).fill(0);
  let best: Core = { x: 0, y: 0, width: 0, height: 0, area: 0 };
  for (let row = 0; row < rect.height; row += 1) {
    for (let column = 0; column < rect.width; column += 1) {
      const alpha = png.data[((rect.y + row) * png.width + rect.x + column) * 4 + 3]!;
      heights[column] = alpha >= OPAQUE_ALPHA ? heights[column]! + 1 : 0;
    }
    // Largest rectangle in a histogram, once per row. O(width) with a monotonic stack.
    const stack: { start: number; value: number }[] = [];
    for (let column = 0; column <= rect.width; column += 1) {
      const value = column === rect.width ? 0 : heights[column]!;
      let start = column;
      while (stack.length > 0 && stack[stack.length - 1]!.value >= value) {
        const top = stack.pop()!;
        const area = top.value * (column - top.start);
        if (area > best.area) {
          best = {
            x: top.start,
            y: row - top.value + 1,
            width: column - top.start,
            height: top.value,
            area,
          };
        }
        start = top.start;
      }
      stack.push({ start, value });
    }
  }
  return best;
}

function main(): void {
  const png = PNG.sync.read(readFileSync(ATLAS_PATH));
  const lines: string[] = [];
  let skipped = 0;
  for (const sprite of Object.keys(PROP_RECIPES).sort()) {
    const rect = ATLAS_INDEX.sprites[sprite];
    if (!rect) {
      console.error(`${sprite}: not in the atlas`);
      continue;
    }
    const core = largestOpaqueRectangle(png, rect);
    if (core.area < MINIMUM_CORE_AREA) {
      skipped += 1;
      continue;
    }
    let count = 0;
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let y = 0; y < core.height; y += 1) {
      for (let x = 0; x < core.width; x += 1) {
        const index = ((rect.y + core.y + y) * png.width + rect.x + core.x + x) * 4;
        red += png.data[index]!;
        green += png.data[index + 1]!;
        blue += png.data[index + 2]!;
        count += 1;
      }
    }
    const luminance = (red + green + blue) / (3 * count);
    lines.push(
      `  '${sprite}': { x: ${String(core.x)}, y: ${String(core.y)}, `
      + `width: ${String(core.width)}, height: ${String(core.height)}, `
      + `luminance: ${luminance.toFixed(1)} },`,
    );
  }
  console.log(lines.join('\n'));
  console.error(`\n${String(lines.length)} sprites have a usable core; ${String(skipped)} are too thin.`);
}

main();
