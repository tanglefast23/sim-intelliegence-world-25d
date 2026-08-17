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
export function buildBillboards(frame: WorldFrameState): readonly BillboardDescriptor[] {
  return frame.characters.map((character) => ({
    id: character.id,
    source: character.source,
    x: character.shadowWorldX / TILE_SIZE,
    z: character.shadowWorldY / TILE_SIZE,
    width: (character.source.width * character.scale) / TILE_SIZE,
    height: (character.source.height * character.scale) / TILE_SIZE,
    tint: tintForLighting(character.color, frame.lighting),
  }));
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

/** How far unlit furniture darkens at night. See `tintForLighting`. */
export const UNLIT_NIGHT_STRENGTH = 0.4;
