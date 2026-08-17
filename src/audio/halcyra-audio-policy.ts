import type { RelationshipState } from '../domain/relationships/relationship';
import type { MapId } from '../world/maps/catalog';
import type { DoorMotionPhase } from '../world/pathfinding/movement';
import { worldAtmosphere } from '../render/atmosphere';

export type DistrictAudioId = 'sunward' | 'neon' | 'saffron' | 'greywake';
export type MusicTrackId = `music_${DistrictAudioId}_${'day' | 'night'}`;
export type AmbienceTrackId = `ambience_${DistrictAudioId}_loop`;
export type FootstepSurface = 'sand' | 'stone' | 'asphalt' | 'wood' | 'indoor';
export type RelationshipSound = 'relationship-positive' | 'relationship-negative';
export type DoorSound = 'open' | 'close';

const DISTRICT_BY_MAP: Readonly<Record<MapId, DistrictAudioId>> = {
  northwest_residential: 'sunward',
  northeast_downtown: 'neon',
  southwest_commercial: 'saffron',
  southeast_docks: 'greywake',
  // Reuse sunward rather than author a fifth ambience track; the office is a v1 interior.
  west_office: 'sunward',
};

const WOOD_MATERIALS = new Set(['boardwalk', 'dock-boardwalk']);
const INDOOR_MATERIALS = new Set(['villa-floor', 'neon-floor', 'sunset-floor', 'dock-floor']);
const SAND_MATERIALS = new Set(['warm-sand', 'dune-grass', 'garden-soil']);
const ASPHALT_MATERIALS = new Set([
  'dark-asphalt',
  'road-crosswalk-horizontal',
  'road-crosswalk-vertical',
  'road-center-horizontal',
  'road-center-vertical',
  'dock-route',
  'dock-crosswalk-horizontal',
  'dock-center-horizontal',
  'dock-center-vertical',
]);

export function districtAudioId(mapId: MapId): DistrictAudioId {
  return DISTRICT_BY_MAP[mapId];
}

export function musicTrackId(mapId: MapId, absoluteMinute: number): MusicTrackId {
  const period = worldAtmosphere(absoluteMinute).period;
  const time = period === 'dusk' || period === 'night' ? 'night' : 'day';
  return `music_${districtAudioId(mapId)}_${time}`;
}

export function ambienceTrackId(mapId: MapId): AmbienceTrackId {
  return `ambience_${districtAudioId(mapId)}_loop`;
}

export function footstepSurface(materialId: string): FootstepSurface {
  if (WOOD_MATERIALS.has(materialId)) return 'wood';
  if (INDOOR_MATERIALS.has(materialId)) return 'indoor';
  if (SAND_MATERIALS.has(materialId)) return 'sand';
  if (ASPHALT_MATERIALS.has(materialId)) return 'asphalt';
  return 'stone';
}

export function doorSoundsForTransition(
  previous: Readonly<Record<string, DoorMotionPhase>>,
  current: Readonly<Record<string, DoorMotionPhase>>,
): readonly DoorSound[] {
  const phases = Object.entries(current);
  return [
    phases.some(([doorId, phase]) => phase === 'opening' && previous[doorId] !== 'opening') ? 'open' : undefined,
    phases.some(([doorId, phase]) => phase === 'closing' && previous[doorId] !== 'closing') ? 'close' : undefined,
  ].filter((sound): sound is DoorSound => sound !== undefined);
}

function relationshipTotal(relationship: RelationshipState | undefined): number {
  if (!relationship) return 0;
  const { attraction, familiarity, trust } = relationship.values;
  return attraction + familiarity + trust;
}

export function relationshipSound(
  previous: WorldRelationships,
  current: WorldRelationships,
): RelationshipSound | undefined {
  const ids = new Set([...Object.keys(previous), ...Object.keys(current)]);
  let delta = 0;
  for (const id of ids) delta += relationshipTotal(current[id]) - relationshipTotal(previous[id]);
  if (delta > 0) return 'relationship-positive';
  if (delta < 0) return 'relationship-negative';
  return undefined;
}

export type WorldRelationships = Readonly<Record<string, RelationshipState>>;
