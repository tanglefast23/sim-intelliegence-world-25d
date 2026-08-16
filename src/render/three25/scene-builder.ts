import type { AtlasRectangle } from '../atlas';
import type { WorldFloorPlacement, WorldFrameState } from '../world-frame';

/**
 * A flat one-tile lid on the ground plane.
 *
 * `x` and `z` are the mesh CENTRE in tile units, the same convention boxes use. The frame gives
 * tile corners, so the builder adds half a tile.
 */
export type QuadDescriptor = Readonly<{
  id: string;
  sprite: string;
  source: AtlasRectangle;
  x: number;
  z: number;
  width: number;
  depth: number;
  tint: string;
  opacity: number;
}>;

/** An extruded box. `x`/`z` are the centre in tile units; `y` is the centre height above the floor. */
export type BoxDescriptor = Readonly<{
  id: string;
  sprite: string;
  source: AtlasRectangle;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  tint: string;
}>;

export type SceneDescriptor = Readonly<{
  floors: readonly QuadDescriptor[];
  boxes: readonly BoxDescriptor[];
}>;

function floorQuad(placement: WorldFloorPlacement): QuadDescriptor {
  return {
    id: placement.id,
    sprite: placement.sprite,
    source: placement.source,
    x: placement.tile.x + 0.5,
    z: placement.tile.y + 0.5,
    width: 1,
    depth: 1,
    tint: placement.color,
    opacity: placement.opacity,
  };
}

export function buildFloorQuads(frame: WorldFrameState): readonly QuadDescriptor[] {
  return [...frame.floors, ...frame.groundDetails].map(floorQuad);
}
