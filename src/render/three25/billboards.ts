import type { AtlasRectangle } from '../atlas';
import { mixHex } from '../atmosphere';
import type { DistrictLighting } from '../district-lighting';
import type { WorldFrameState } from '../world-frame';

const TILE_SIZE = 32;

export type BillboardDescriptor = Readonly<{
  id: string;
  source: AtlasRectangle;
  x: number;
  z: number;
  width: number;
  height: number;
  tint: string;
}>;

/**
 * Characters stay upright four-direction billboards in both renderers. Only world geometry becomes
 * boxes; no character sprite is created or modified.
 *
 * The frame's `worldX`/`worldY` is the 2D quad's top-left after scale, lean, bob and impact
 * offsets. `shadowWorldX`/`shadowWorldY` is the contact point the frame already computed, which is
 * what a billboard must stand on — placing from `tile` instead would pop every 32 pixels.
 *
 * `THREE.Sprite` is banned here: it does not batch, and the 2D port spec forbids one `Sprite` per
 * drawn thing. These descriptors bake into one geometry sharing the atlas and one material, which
 * costs the same single draw call an `InstancedMesh` would.
 */
/**
 * Ground decals that are not flat things.
 *
 * A decal is a sprite stamped on a tile, and for sand ripples, pebbles, shells and leaf litter that
 * is exactly right — they ARE marks on the ground. Vegetation is not. A tree authored as a decal
 * reads perfectly under a top-down camera and lies down like a felled log under a corner one, which
 * is what the residential district looked like: thirty trees, twenty-five palms, seventeen saplings
 * and sixteen shrubs, all flat on the grass.
 *
 * They become upright billboards rather than boxes, for the same reason characters do: the sprite
 * IS the art, and a tree extruded into a box would be a green cube. Standing the authored pixels up
 * keeps every one of them.
 */
const STANDING_DECAL_SPRITES: ReadonlySet<string> = new Set([
  'tile.decal-canopy-tree',
  'tile.decal-young-palm',
  'tile.decal-sapling',
  'tile.decal-flowering-shrub',
]);

/** Whether this ground detail should stand up instead of lying on the floor. */
export function isStandingDecal(sprite: string): boolean {
  return STANDING_DECAL_SPRITES.has(sprite);
}

export function buildBillboards(frame: WorldFrameState): readonly BillboardDescriptor[] {
  const characters = frame.characters.map((character) => ({
    id: character.id,
    source: character.source,
    x: character.shadowWorldX / TILE_SIZE,
    z: character.shadowWorldY / TILE_SIZE,
    width: (character.source.width * character.scale) / TILE_SIZE,
    height: (character.source.height * character.scale) / TILE_SIZE,
    // Capped, like the furniture: an unlit sprite has no light to lift it back up, and a
    // protagonist who becomes a black silhouette after dusk is unusable.
    tint: tintForLighting(character.color, frame.lighting, UNLIT_NIGHT_STRENGTH),
  }));

  // Vegetation joins the batch the characters already use, so standing it up costs no draw call.
  const vegetation = frame.groundDetails
    .filter((detail) => isStandingDecal(detail.sprite))
    .map((detail) => ({
      id: `decal-${detail.id}`,
      source: detail.source,
      // The tile's CONTACT point, not its origin: a billboard stands on the ground at the middle of
      // its tile, and placing it at the corner would sink half the trunk into the neighbouring one.
      x: detail.tile.x + 0.5,
      z: detail.tile.y + 0.5,
      width: detail.source.width / TILE_SIZE,
      height: detail.source.height / TILE_SIZE,
      tint: tintForLighting(detail.color, frame.lighting, UNLIT_NIGHT_STRENGTH),
    }));

  return [...characters, ...vegetation];
}

/**
 * Darkens a billboard tint as the sun drops.
 *
 * Unlit billboards need this or characters stay full-bright at night while the boxes around them
 * go dark. The 2D path gets the same effect from its own tint attribute.
 *
 * Mixes toward `sun.shadowColor`, NOT toward `lighting.accent`. Accents are bright — northwest is
 * `'#ffc45c'` — so mixing toward the accent would make billboards *brighter* at night, which is
 * the opposite of the intent. `mixHex` is identity at amount `0`, so solar noon returns the input
 * unchanged.
 *
 * Only the RGB is mixed. `sun.shadowColor` is a translucent `'#2f223e51'`, and mixing all four
 * bytes would drag the character's alpha toward `0x51` — fading the cast out as the sun sets
 * instead of darkening it.
 */
export function tintForLighting(
  base: string,
  lighting: DistrictLighting,
  /**
   * How far toward the shadow colour a moonless midnight is allowed to pull.
   *
   * 1 is right for a LIT surface, where the scene's own lights lift it back up. An UNLIT surface -
   * flat-shaded furniture - has nothing to lift it, so a full mix drives every piece of furniture
   * to near-black and the room loses its colour entirely. Cap it well short.
   */
  strength = 1,
): string {
  const alpha = base.length > 7 ? base.slice(7) : '';
  const amount = (1 - lighting.sun.elevation) * strength;
  const mixed = mixHex(base.slice(0, 7), lighting.sun.shadowColor.slice(0, 7), amount);
  return `${mixed}${alpha}`;
}

/**
 * How far unlit furniture darkens at night. See `tintForLighting`.
 *
 * 0.18, not 0.4. An AUTHORED box tint skips this mix entirely - it is art direction, not paint -
 * so at 0.4 the villa's authored furniture popped while every district's measured furniture went
 * to mud, and the two halves of the city stopped matching. A gentle curve keeps them in the same
 * range while still reading as night.
 */
export const UNLIT_NIGHT_STRENGTH = 0.18;

/**
 * Lifts a colour until it is readable on an UNLIT surface.
 *
 * Flat furniture carries no light, and ACES crushes the low end hard, so a sprite's true paint at
 * luminance 80 lands as a near-black slab. That is fine in the villa, where lamps light the walls
 * behind the furniture and give it a silhouette — and it is why the market stalls and cargo stacks
 * read as featureless blocks in districts with fewer lamps.
 *
 * Scales the whole colour rather than adding grey, so the hue survives. `floor` is in the same
 * 0-255 space as the channels.
 *
 * The floor has to clear everything stacked on top of the paint, not just the paint: a 0.4 mix
 * toward the shadow colour, then a face shade as low as 0.6, then ACES crushing the low end. A
 * cargo crate at luminance 116 survives all three as a near-black slab, which is why the harbour
 * read as empty ground with lamps in it.
 *
 * 190 is set against the villa's authored tints, which are the bar: pale timber sits at 155 and
 * skips the night mix, so a measured colour has to start higher to land in the same place.
 */
const READABLE_FLOOR = 190;
export function readableTint(tint: string, floor = READABLE_FLOOR): string {
  const alpha = tint.length > 7 ? tint.slice(7) : '';
  const channels = [1, 3, 5].map((at) => Number.parseInt(tint.slice(at, at + 2), 16));
  const luminance = (channels[0]! + channels[1]! + channels[2]!) / 3;
  if (luminance >= floor || luminance === 0) return tint;
  const scale = floor / luminance;
  const lifted = channels
    .map((value) => Math.min(255, Math.round(value * scale)).toString(16).padStart(2, '0'))
    .join('');
  return `#${lifted}${alpha}`;
}
