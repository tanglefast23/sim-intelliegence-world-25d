import { GRAPHITE } from './media';
import { hashSeed, Sketch, type Point } from './sketch';

/**
 * The drawn skin for the 2.5D prop boxes.
 *
 * Joe's call, 2026-08-19: the box geometry stays — bins, signs, box-trees and lamps keep their
 * 2.5D shapes — but their faces stop being smooth. This bakes one GREYSCALE charcoal tile:
 * opaque paper with charcoal strokes over it. `flatMaterial` multiplies it with the existing
 * per-face vertex colours, so paper-bright texels render the prop's authored colour and every
 * stroke darkens it. Nothing about the colour system, lighting or shadow path changes.
 *
 * Greyscale-on-paper is what makes one tile serve every prop. A coloured tile would fight the
 * vertex tint; a multiplied tile IS the tint's texture.
 */
export const PROP_TILE_SIZE = 64;

/**
 * One frame, deliberately. A three-frame boiling world shipped on 2026-08-19 and Joe pulled it
 * the same day — everything shimmering was too distracting. The boil belongs to characters
 * only. The scribble stroke stays: that is what separates the grain from ruled hatching.
 *
 * Graphite, not charcoal: charcoal's tone always sheds stipple dust, and on box faces the dust
 * read as freckles. And the tile is NORMALISED so its average is exactly paper — a multiply-only
 * texture can only darken, and the raw scribble averaged ~0.75, which crushed the bush greens
 * and the brown trunk bases to black. After normalising, the grain is pure contrast: strokes
 * darken, the paper between them lifts, and a prop's average colour is exactly what was authored.
 */
export function bakePropSketchTile(frame = 0): Uint8ClampedArray {
  const sketch = new Sketch(PROP_TILE_SIZE, PROP_TILE_SIZE);
  sketch.boil(hashSeed('prop-sketch-tile', frame));
  sketch.fillPaper();
  // The ring overshoots the tile so strokes run through the edges instead of framing them —
  // a visible margin would draw a border on every box face.
  const over = 6;
  const ring: readonly Point[] = [
    { x: -over, y: -over },
    { x: PROP_TILE_SIZE + over, y: -over },
    { x: PROP_TILE_SIZE + over, y: PROP_TILE_SIZE + over },
    { x: -over, y: PROP_TILE_SIZE + over },
  ];
  // pen 0.75 keeps every stroke under the crumb gate: crumbs and bites on a box face read
  // as freckles, which Joe flagged twice.
  GRAPHITE.tone(sketch, ring, { style: 'scribble', paper: false, pen: 0.75 });
  const data = sketch.data;
  // Compress the contrast toward paper BEFORE normalising. A stroke texel multiplies whatever
  // colour it lands on, and at full strength (~0.6) it turns an already-dark trunk base black.
  // At 0.5 strength a stroke costs at most ~20% of the colour underneath.
  const STRENGTH = 0.5;
  for (let offset = 0; offset < data.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const paperValue = channel === 0 ? 246 : channel === 1 ? 241 : 229;
      const value = data[offset + channel] ?? 0;
      data[offset + channel] = Math.round(paperValue + (value - paperValue) * STRENGTH);
    }
  }
  let sum = 0;
  let count = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    sum += data[offset] ?? 0;
    count += 1;
  }
  const gain = count === 0 ? 1 : (246 * count) / Math.max(1, sum);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = Math.min(255, Math.round((data[offset] ?? 0) * gain));
    data[offset + 1] = Math.min(255, Math.round((data[offset + 1] ?? 0) * gain));
    data[offset + 2] = Math.min(255, Math.round((data[offset + 2] ?? 0) * gain));
  }
  return data;
}
