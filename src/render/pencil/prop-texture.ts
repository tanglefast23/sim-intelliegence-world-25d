import { CHARCOAL } from './media';
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
  CHARCOAL.tone(sketch, ring, { style: 'scribble', paper: false });
  return sketch.data;
}
