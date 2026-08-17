import northeastMapJson from '../../../content/maps/northeast.json';
import northwestMapJson from '../../../content/maps/northwest.json';
import southeastMapJson from '../../../content/maps/southeast.json';
import southwestMapJson from '../../../content/maps/southwest.json';
import westMapJson from '../../../content/maps/west.json';
import productionLocations from '../../../content/world/locations/production.json';
import prototypeLocations from '../../../content/world/locations/prototype.json';
import { ATLAS_INDEX } from '../../render/atlas';
import { buildWorldMapV2Catalog } from '../../world/maps/catalog';
import { ART_PRESENTATION_REVISION } from '../../world/presentation/recipes';

if (ART_PRESENTATION_REVISION !== ATLAS_INDEX.artRevision) {
  throw new Error('Art presentation recipes do not match the runtime atlas revision.');
}

const LOCATION_NEIGHBORHOOD_BY_ID = new Map(
  [...prototypeLocations, ...productionLocations].map(({ id, neighborhoodId }) => [id, neighborhoodId]),
);

export const WORLD_MAP_CATALOG = buildWorldMapV2Catalog({
  northwest_residential: northwestMapJson,
  northeast_downtown: northeastMapJson,
  southwest_commercial: southwestMapJson,
  southeast_docks: southeastMapJson,
  west_office: westMapJson,
}, {
  locationNeighborhoodById: LOCATION_NEIGHBORHOOD_BY_ID,
  knownSprites: new Set(ATLAS_INDEX.tiles),
  visualBoundsBySprite: Object.fromEntries(Object.entries(ATLAS_INDEX.sprites).map(([sprite, rectangle]) => [
    sprite,
    { left: 0, top: 0, right: rectangle.width, bottom: rectangle.height },
  ])),
  validateDensity: true,
});
