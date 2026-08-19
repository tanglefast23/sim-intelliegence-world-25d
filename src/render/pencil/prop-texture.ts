import { CRAYON_TILE, CRAYON_TILE_SIZE } from './generated-crayon-tile';

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
export const PROP_TILE_SIZE = CRAYON_TILE_SIZE;

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
export function bakePropSketchTile(): Uint8ClampedArray {
  /**
   * The crayon grain, straight from the generated tile.
   *
   * Four attempts at SYNTHESISING crayon from strokes came first and all failed: `light` read as
   * ruled lines, `black` crushed every prop, sparse `scribble` read as thin pencil, and a
   * per-pixel dropout read as television static. Wax grain is not a set of strokes, and drawing
   * it as strokes is what kept missing. The image supplies the grain directly.
   *
   * Already greyscale, seamless and mean-normalised by the builder, so this is a straight copy
   * into RGBA: R=G=B=grain, and the multiply in the renderer adds texture without shifting a
   * prop's colour.
   */
  const data = new Uint8ClampedArray(CRAYON_TILE_SIZE * CRAYON_TILE_SIZE * 4);
  for (let i = 0; i < CRAYON_TILE.length; i += 1) {
    const value = CRAYON_TILE[i] ?? 246;
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return data;
}
