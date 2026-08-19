import { INK, PAPER, polygonSpans, type Point, type Sketch } from './sketch';

export type Rgb = readonly [number, number, number];

/**
 * The medium layer, ported from the reference's `src/media.js` contract.
 *
 * A part never picks graphite or paint. It asks the medium for a mass (`tone`), colour on a face
 * (`skin`) and a closing contour (`edge`), and the medium answers in its own vocabulary. A part
 * that filled a polygon itself would stay flat while the rest of the character turned to pencil —
 * which is exactly what happened here: the audit (design doc 6.9) found 46 flat fills and no
 * medium, and that was the whole visual gap against the reference.
 *
 * Only graphite exists so far. Ink, watercolour, oil, charcoal and marker are named by the
 * reference and can join behind the same contract.
 */

/** A part's one opinion about a mass: how dark. Never how to make it dark. */
export const DENSITY = { black: 1, hatch: 0.72, scribble: 0.62, stipple: 0.5, light: 0.34 } as const;
export type ToneStyle = keyof typeof DENSITY;

export type ToneOptions = Readonly<{
  style?: ToneStyle;
  /**
   * Rotates the style's stroke direction for this mass. Without it every mass hatches at the
   * same diagonal and the parts merge into one continuous texture — the audit loop's loop-2
   * finding. Hair wants near-horizontal waves; a cloak wants a different hand than the face.
   */
  angle?: number;
  /**
   * Lay the character's own paper under the mass first. Defaults to true.
   *
   * The reference composites on cream, so its hatch gaps read as paper. Our sprite is transparent
   * over the game world — without a carried paper base, gaps would show grass through his chest
   * and the graphite would land on dark floors instead of cream. Pass false only for a mass that
   * sits on another mass, like shading on a face.
   */
  paper?: boolean;
}>;

export type WashOptions = Readonly<{
  /** Wash opacity. Washes are translucent by definition; near-1 is only for tiny highlights. */
  alpha?: number;
  paper?: boolean;
  /** Whether pencil construction hatches under the wash. Defaults to the medium's `underdraw`. */
  underdraw?: boolean;
}>;

export type Medium = Readonly<{
  id: 'graphite';
  /** Does pencil construction still read underneath a wash? True for graphite. */
  underdraw: boolean;
  tone: (s: Sketch, pts: readonly Point[], o?: ToneOptions) => void;
  skin: (s: Sketch, pts: readonly Point[], col: Rgb, o?: WashOptions) => void;
  edge: (s: Sketch, pts: readonly Point[], w: number) => void;
}>;

/** How translucent the carried paper is. Slightly under 1 so the world faintly grounds the card. */
const PAPER_ALPHA = 0.94;

type HatchPass = Readonly<{ angle: number; spacing: number; lw: number; alpha: number; chained?: boolean }>;

/**
 * Each style is strokes, never a fill. Tuned for the 120x180 sheet: spacing under ~2 stops
 * reading as lines, and `lw >= 1.2` crosses the crumb gate in `stroke()` so the dense passes shed
 * graphite on their own.
 */
const TONE_PASSES: Readonly<Record<Exclude<ToneStyle, 'stipple'>, readonly HatchPass[]>> = {
  // Calibrated against the reference's swatches, which are far LIGHTER than they look in
  // memory: ink at 62% over cream is mid-grey, and even black keeps flecks of page. The first
  // version double-crosshatched at lw 1.6 and stacked to near-solid black — the flat fill
  // sneaking back in through density. Thin lines, real gaps.
  black: [
    { angle: 0.14, spacing: 2.0, lw: 1.05, alpha: 0.62, chained: true },
    { angle: 1.88, spacing: 2.8, lw: 0.85, alpha: 0.45 },
  ],
  hatch: [{ angle: -1.05, spacing: 2.6, lw: 0.8, alpha: 0.5 }],
  scribble: [{ angle: 0.12, spacing: 2.4, lw: 0.9, alpha: 0.55, chained: true }],
  light: [{ angle: -1.05, spacing: 3.6, lw: 0.6, alpha: 0.26 }],
};

function paper(s: Sketch, pts: readonly Point[]): void {
  s.fill(pts, PAPER, PAPER_ALPHA);
}

function hatchPass(s: Sketch, pts: readonly Point[], pass: HatchPass): void {
  // The whole mass shares one hand angle per pass, wobbled per boil frame.
  const angle = pass.angle + s.jr(-0.09, 0.09);
  const spans = polygonSpans(pts, angle, pass.spacing, s.j());
  if (pass.chained) {
    // A real scribble is ONE line that never leaves the paper: adjacent rows join into a
    // zigzag and the whole chain is stroked as a single wandering ribbon. Separate parallel
    // strokes read as ruled hatching, which was the loop-4 gap against the reference.
    let chain: Point[] = [];
    let row = 0;
    for (const [a, b] of spans) {
      const [from, to] = row % 2 === 0 ? [a, b] : [b, a];
      chain.push(
        { x: from.x + s.jr(-0.5, 0.5), y: from.y + s.jr(-0.5, 0.5) },
        { x: to.x + s.jr(-0.5, 0.5), y: to.y + s.jr(-0.5, 0.5) },
      );
      row += 1;
      if (chain.length >= 12) {
        s.stroke(chain, pass.lw * s.jr(0.85, 1.12), pass.alpha * s.jr(0.85, 1.15));
        chain = [];
      }
    }
    if (chain.length >= 2) s.stroke(chain, pass.lw * s.jr(0.85, 1.12), pass.alpha * s.jr(0.85, 1.15));
    return;
  }
  for (const [a, b] of spans) {
    const jittered: Point[] = [
      { x: a.x + s.jr(-0.7, 0.7), y: a.y + s.jr(-0.7, 0.7) },
      { x: b.x + s.jr(-0.7, 0.7), y: b.y + s.jr(-0.7, 0.7) },
    ];
    s.stroke(jittered, pass.lw * s.jr(0.85, 1.12), pass.alpha * s.jr(0.85, 1.15));
  }
}

function stipple(s: Sketch, pts: readonly Point[]): void {
  const spans = polygonSpans(pts, 0, 2.4, s.j());
  for (const [a, b] of spans) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    for (let travelled = s.jr(0, 2.4); travelled < length; travelled += 2.4) {
      if (s.j() > 0.5) continue;
      const t = travelled / length;
      s.put(
        a.x + (b.x - a.x) * t + s.jr(-0.6, 0.6),
        a.y + (b.y - a.y) * t + s.jr(-0.6, 0.6),
        INK[0], INK[1], INK[2], s.jr(0.25, 0.5),
      );
    }
  }
}

function tone(s: Sketch, pts: readonly Point[], o: ToneOptions = {}): void {
  if (o.paper !== false) paper(s, pts);
  const style = o.style ?? 'scribble';
  if (style === 'stipple') {
    stipple(s, pts);
    return;
  }
  for (const pass of TONE_PASSES[style]) {
    hatchPass(s, pts, o.angle === undefined ? pass : { ...pass, angle: pass.angle + o.angle });
  }
}

function skin(s: Sketch, pts: readonly Point[], col: Rgb, o: WashOptions = {}): void {
  if (o.paper !== false) paper(s, pts);
  // Construction first, wash over it, so the pencil shows through the colour. That is underdraw.
  if (o.underdraw !== false) {
    for (const pass of TONE_PASSES.light) hatchPass(s, pts, pass);
  }
  s.fill(pts, col, o.alpha ?? 0.38);
}

function edge(s: Sketch, pts: readonly Point[], w: number): void {
  s.broken(pts, w);
}

export const GRAPHITE: Medium = { id: 'graphite', underdraw: true, tone, skin, edge };
