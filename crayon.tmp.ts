import { writeFileSync } from 'node:fs';
import { createBitmap, encodePng, setPixel } from './scripts/art/png';
import { GRAPHITE } from './src/render/pencil/media';
import { Sketch, hashSeed, polygonSpans, type Point } from './src/render/pencil/sketch';

const N = 64;
const ring: readonly Point[] = [
  { x: -8, y: -8 }, { x: N + 8, y: -8 }, { x: N + 8, y: N + 8 }, { x: -8, y: N + 8 },
];

function pencil(): Uint8ClampedArray {
  const s = new Sketch(N, N);
  s.boil(hashSeed('a', 1));
  s.fillPaper();
  GRAPHITE.tone(s, ring, { style: 'scribble', paper: false, pen: 0.75, gap: 2.4 });
  return s.data;
}

/** Smooth value noise, tiling on `period`, so the deposit varies in PATCHES not per pixel. */
function noiseField(s: Sketch, cells: number): (x: number, y: number) => number {
  const grid: number[] = [];
  for (let i = 0; i < cells * cells; i += 1) grid.push(s.j());
  const at = (cx: number, cy: number) => grid[((cy + cells) % cells) * cells + ((cx + cells) % cells)]!;
  return (x: number, y: number) => {
    const gx = (x / N) * cells, gy = (y / N) * cells;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
    const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
}

/**
 * Crayon: a blunt wax stick dragged over paper tooth. Broad soft bands, and the deposit is
 * modulated by COARSE noise so the stick skips in visible patches, leaving the page showing
 * through. That patchiness at a readable scale is what separates crayon from static.
 */
function crayon(strength: number, cells: number): Uint8ClampedArray {
  const s = new Sketch(N, N);
  s.boil(hashSeed('crayon', strength * 100 + cells));
  s.fillPaper();
  const tooth = noiseField(s, cells);
  const angle = 0.28;
  for (const [a, b] of polygonSpans(ring, angle, 5.0, s.j())) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const half = s.jr(2.4, 3.6);
    for (let t = 0; t < len; t += 0.6) {
      const px = a.x + (b.x - a.x) * (t / len);
      const py = a.y + (b.y - a.y) * (t / len);
      for (let w = -half; w <= half; w += 0.7) {
        const x = px + nx * w, y = py + ny * w;
        // Coarse tooth decides whether the wax caught here at all.
        const catchAt = tooth(x, y);
        if (catchAt < 0.42) continue;
        // Softer at the band's edges, like a rounded stick.
        const falloff = 1 - Math.abs(w) / (half + 0.6);
        s.put(x, y, 31, 29, 26, (catchAt - 0.42) * 0.55 * falloff * strength);
      }
    }
  }
  return s.data;
}

const tiles: Readonly<{ label: string; data: Uint8ClampedArray }>[] = [
  { label: 'pencil (today)', data: pencil() },
  { label: 'crayon coarse', data: crayon(1.0, 5) },
  { label: 'crayon finer', data: crayon(1.0, 9) },
];
const colours: (readonly [number, number, number])[] = [
  [58, 107, 48], [176, 138, 94], [140, 165, 155], [232, 212, 154],
];
const S = 3, W = N * S;
const sheet = createBitmap(colours.length * (W + 8) + 8, tiles.length * (W + 8) + 8, [110, 102, 94, 255]);
tiles.forEach((tile, row) => {
  colours.forEach((colour, col) => {
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
      const o = (y * N + x) * 4;
      const px = [
        Math.min(255, Math.round(colour[0] * (tile.data[o]! / 246))),
        Math.min(255, Math.round(colour[1] * (tile.data[o + 1]! / 241))),
        Math.min(255, Math.round(colour[2] * (tile.data[o + 2]! / 229))),
        255,
      ] as const;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        setPixel(sheet, 8 + col * (W + 8) + x * S + sx, 8 + row * (W + 8) + y * S + sy, px);
      }
    }
  });
});
writeFileSync('crayon.tmp.png', encodePng(sheet));
process.stdout.write('ok\n');
