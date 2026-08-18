import type { WorldMapV2Catalog } from '../../world/maps/catalog';

export const EXPECTED_VFX_ANCHORS = Object.freeze([
  Object.freeze({ mapId: 'northeast_downtown', id: 'club-neon-east', kind: 'neon', x: 22, y: 20 }),
  Object.freeze({ mapId: 'northeast_downtown', id: 'club-neon-west', kind: 'neon', x: 16, y: 20 }),
  Object.freeze({ mapId: 'northwest_residential', id: 'beach-sparkle', kind: 'sparkle', x: 50, y: 40 }),
  Object.freeze({ mapId: 'northwest_residential', id: 'garden-insects', kind: 'insects', x: 31, y: 26 }),
  Object.freeze({ mapId: 'northwest_residential', id: 'patio-fire', kind: 'fire', x: 27, y: 32 }),
  Object.freeze({ mapId: 'northwest_residential', id: 'patio-leaves', kind: 'leaves', x: 30, y: 30 }),
  Object.freeze({ mapId: 'northwest_residential', id: 'patio-palm', kind: 'palm', x: 35, y: 31 }),
  Object.freeze({ mapId: 'northwest_residential', id: 'shoreline-water-glint-center', kind: 'water', x: 50, y: 44 }),
  Object.freeze({ mapId: 'northwest_residential', id: 'shoreline-water-glint-east', kind: 'water', x: 57, y: 43 }),
  Object.freeze({ mapId: 'northwest_residential', id: 'shoreline-water-glint-west', kind: 'water', x: 42, y: 43 }),
  Object.freeze({ mapId: 'southeast_docks', id: 'harbor-water-glint-north', kind: 'water', x: 55, y: 30 }),
  Object.freeze({ mapId: 'southeast_docks', id: 'harbor-water-glint-south', kind: 'water', x: 53, y: 40 }),
  Object.freeze({ mapId: 'southeast_docks', id: 'yard-steam', kind: 'steam', x: 21, y: 32 }),
  Object.freeze({ mapId: 'southwest_commercial', id: 'courtyard-insects', kind: 'insects', x: 25, y: 35 }),
  Object.freeze({ mapId: 'southwest_commercial', id: 'courtyard-steam-east', kind: 'steam', x: 14, y: 39 }),
  Object.freeze({ mapId: 'southwest_commercial', id: 'courtyard-steam-west', kind: 'steam', x: 11, y: 34 }),
  // No `office-cooler-steam`. A water cooler dispenses chilled water, so the plume was wrong on its
  // own terms as well as being one of the two wisps that drew on top of the annex roof.
  Object.freeze({ mapId: 'west_office', id: 'office-kettle-steam', kind: 'steam', x: 31, y: 28 }),
] as const);

export function catalogueVfxAnchors(catalog: WorldMapV2Catalog) {
  return Object.values(catalog).flatMap((map) => map.source.effects.map((effect) => ({
    mapId: map.source.id,
    id: effect.id,
    kind: effect.kind,
    x: effect.tile.x,
    y: effect.tile.y,
  }))).sort((left, right) => (
    left.mapId.localeCompare(right.mapId, 'en') || left.id.localeCompare(right.id, 'en')
  ));
}
