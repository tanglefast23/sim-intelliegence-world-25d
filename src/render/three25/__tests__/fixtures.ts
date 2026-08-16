// WORLD_MAP_CATALOG lives in src/application/runtime/map-catalog.ts, NOT src/world/maps/catalog.ts.
// That file exports a builder, not the catalog.
import { WORLD_MAP_CATALOG } from '../../../application/runtime/map-catalog';
import { createInitialState } from '../../../domain/state/initial-state';
import { WorldStateSchema } from '../../../domain/state/schema';
import type { MovementDirection } from '../../atlas';
import { buildWorldFrameState, type WorldFrameState } from '../../world-frame';

export const FIXTURE_MAP = WORLD_MAP_CATALOG.northwest_residential;

/**
 * The default protagonist spawns at tile (18,18), which is INSIDE the villa
 * (interior x:9 y:8 w:16 h:16). So this frame always has `hiddenRoofGroupId` set to
 * 'protagonist-villa-roof' and `visibleRoofGroupIds` EMPTY — there is only one roof group on this
 * map. Do not write a test that reads `visibleRoofGroupIds[0]`; it is `undefined`.
 */
export function indoorFrame(facing: MovementDirection = 'down'): WorldFrameState {
  return buildWorldFrameState(FIXTURE_MAP, createInitialState(), {}, facing, 0);
}

/**
 * Same map, protagonist outside the villa, so no roof group is occupied.
 *
 * `worldPosition` is `{ mapId, tileX, tileY }` — not `{ x, y }`. Spreading the wrong keys compiles
 * and silently leaves the protagonist indoors, which makes Task 17's outdoor test fail with a
 * misleading count. Tile (17,25) is the outside variant used at `world-frame.test.ts:41-48`.
 */
export function outdoorFrame(facing: MovementDirection = 'down'): WorldFrameState {
  const initial = createInitialState();
  const outside = WorldStateSchema.parse({
    ...initial,
    protagonist: {
      ...initial.protagonist,
      worldPosition: { mapId: 'northwest_residential', tileX: 17, tileY: 25 },
    },
  });
  return buildWorldFrameState(FIXTURE_MAP, outside, {}, facing, 0);
}
