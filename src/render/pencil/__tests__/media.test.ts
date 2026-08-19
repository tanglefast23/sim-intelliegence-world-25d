import { DENSITY, GRAPHITE } from '../media';
import { polygonSpans, Sketch, type Point } from '../sketch';

const RECT: readonly Point[] = [
  { x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 },
];

function sample(sketch: Sketch): Readonly<{
  solid: number; dark: number; light: number; spread: number; mean: number;
}> {
  let solid = 0;
  let dark = 0;
  let light = 0;
  let sum = 0;
  let count = 0;
  let min = 255;
  let max = 0;
  // Sample the rect interior, inset so contour effects do not blur the measurement.
  for (let y = 26; y < 74; y += 1) {
    for (let x = 26; x < 74; x += 1) {
      const offset = (y * sketch.width + x) * 4;
      if ((sketch.data[offset + 3] as number) > 200) solid += 1;
      if ((sketch.data[offset + 3] as number) < 40) continue;
      const red = sketch.data[offset] as number;
      count += 1;
      sum += red;
      if (red < 140) dark += 1;
      if (red > 185) light += 1;
      if (red < min) min = red;
      if (red > max) max = red;
    }
  }
  return { solid, dark, light, spread: max - min, mean: count ? sum / count : 0 };
}

function toned(style: keyof typeof DENSITY): Sketch {
  const sketch = new Sketch(100, 100);
  sketch.boil(7);
  GRAPHITE.tone(sketch, RECT, { style });
  return sketch;
}

describe('the graphite medium', () => {
  test('carries the density table from the reference', () => {
    expect(DENSITY).toEqual({ black: 1, hatch: 0.72, scribble: 0.62, stipple: 0.5, light: 0.34 });
    expect(GRAPHITE.underdraw).toBe(true);
  });

  test('a mass is never flat: even black keeps paper in the gaps', () => {
    // This is the audit's misapplication 1. A flat fill has zero paper-coloured interior pixels;
    // the reference's densest swatch still shows the page through the scribble.
    const black = sample(toned('black'));
    expect(black.dark).toBeGreaterThan(500);
    // Light pixels inside the mass are the paper showing through the scribble. A flat fill has
    // zero of these and a spread near zero.
    expect(black.light).toBeGreaterThan(60);
    expect(black.spread).toBeGreaterThan(80);
  });

  test('density orders the styles', () => {
    const darkOf = (style: keyof typeof DENSITY) => sample(toned(style)).dark;
    expect(darkOf('black')).toBeGreaterThan(darkOf('hatch'));
    expect(darkOf('hatch')).toBeGreaterThan(darkOf('light'));
  });

  test('tone carries the character paper by default', () => {
    // Misapplication 3: our sprite is transparent over the world, so without a carried paper the
    // hatch gaps would show the floor through his chest.
    // With paper the interior is near-solid coverage; without it the gaps stay transparent.
    expect(sample(toned('hatch')).solid).toBeGreaterThan(48 * 48 * 0.9);
    const bare = new Sketch(100, 100);
    bare.boil(7);
    GRAPHITE.tone(bare, RECT, { style: 'hatch', paper: false });
    expect(sample(bare).solid).toBeLessThan(48 * 48 * 0.6);
  });

  test('a wash is translucent and hatches under itself', () => {
    const washed = new Sketch(100, 100);
    washed.boil(7);
    GRAPHITE.skin(washed, RECT, [182, 16, 22], {});
    const wash = sample(washed);
    // Blended with paper, never the raw colour — that is what makes it a wash.
    expect(wash.mean).toBeGreaterThan(182);
    // And the underdraw pencil shows through: the interior is textured, not flat.
    expect(wash.spread).toBeGreaterThan(30);
  });

  test('polygonSpans stays inside the polygon', () => {
    for (const [a, b] of polygonSpans(RECT, 0.6, 3)) {
      for (const pt of [a, b]) {
        expect(pt.x).toBeGreaterThanOrEqual(19);
        expect(pt.x).toBeLessThanOrEqual(81);
        expect(pt.y).toBeGreaterThanOrEqual(19);
        expect(pt.y).toBeLessThanOrEqual(81);
      }
    }
    expect(polygonSpans(RECT, 0.6, 3).length).toBeGreaterThan(10);
  });
});
