import { WORLD_MAP_CATALOG } from '../../application/runtime/map-catalog';
import { roofGroupAtV2 } from '../../world/maps/compiled-v2';
import { tileKey } from '../../world/maps/schema';
import { buildSmokeGeometryEvidence } from '../smoke-geometry';

describe('stable packaged-smoke geometry evidence', () => {
  test('derives named Sunward targets from the compiled map authority', () => {
    const map = WORLD_MAP_CATALOG.northwest_residential;
    const evidence = buildSmokeGeometryEvidence(map);
    expect(evidence.mapId).toBe('northwest_residential');
    expect(evidence.map).toEqual({ widthTiles: 64, heightTiles: 48, tileSize: 32 });
    expect(evidence.start.protagonist).toEqual(map.source.spawns.protagonist);
    expect(evidence.start.cameraAnchor).toEqual(map.source.startComposition?.cameraAnchor);
    expect(map.blockedKeys.has(tileKey(evidence.start.movementTarget))).toBe(false);
    expect(map.staticSolidOwnerByTile.get(tileKey(evidence.blockedSolid.tile))).toEqual(expect.objectContaining({
      id: evidence.blockedSolid.id,
      kind: evidence.blockedSolid.kind,
    }));
    expect(map.blockedKeys.has(tileKey(evidence.openDoor.tile))).toBe(false);
    expect(map.interactionById.get(evidence.interaction.id)?.approachTiles).toEqual(evidence.interaction.approachTiles);
    expect(evidence.portals.map(({ id }) => id)).toEqual(['to-commercial', 'to-downtown', 'to-office']);
    expect(evidence.locations.map(({ id }) => id)).toEqual([
      'linda_villa', 'mina_spa', 'northwest_residential', 'protagonist_villa',
    ]);
    expect(map.roofGroupById.get(evidence.roof.id)?.interiorKeys.has(tileKey(evidence.roof.interiorTile))).toBe(true);
    expect(map.blockedKeys.has(tileKey(evidence.roof.exteriorTile))).toBe(false);
    expect(roofGroupAtV2(map, evidence.roof.exteriorTile)).toBeUndefined();
  });
});
