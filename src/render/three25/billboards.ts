import type { AtlasRectangle } from '../atlas';
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
    tint: character.color,
  }));
}
