import type { WorldState } from './schema';
import { GENERATED_LAYOUT } from './generated-layout';

export const PRODUCTION_FULL_AI_CAST = [
  {
    id: 'mina_park', visualId: 'mina-park', displayName: 'Mina Park', role: 'spa manager',
    homeLocationId: 'mina_spa', businessDisplayName: 'Shoreglass Spa', factionIds: ['island_administration'], romantic: true,
    position: GENERATED_LAYOUT.actorTiles.mina_park, interestId: 'wellness', memorySubjectId: 'protagonist_wellness',
    work: GENERATED_LAYOUT.workTiles.mina_park,
  },
  {
    id: 'rafael_cruz', visualId: 'rafael-cruz', displayName: 'Rafael Cruz', role: 'chef and cafe owner',
    homeLocationId: 'rafael_cafe', businessDisplayName: "Rafael's Cafe", factionIds: [], romantic: false,
    position: GENERATED_LAYOUT.actorTiles.rafael_cruz, interestId: 'cooking', memorySubjectId: 'protagonist_food',
    work: GENERATED_LAYOUT.workTiles.rafael_cruz,
  },
  {
    id: 'sora_tan', visualId: 'sora-tan', displayName: 'Sora Tan', role: 'boutique manager',
    homeLocationId: 'sora_boutique', businessDisplayName: "Sora's Boutique", factionIds: [], romantic: true,
    position: GENERATED_LAYOUT.actorTiles.sora_tan, interestId: 'fashion', memorySubjectId: 'protagonist_style',
    work: GENERATED_LAYOUT.workTiles.sora_tan,
  },
  {
    id: 'devon_price', visualId: 'devon-price', displayName: 'Devon Price', role: 'bartender',
    homeLocationId: 'devon_bar', businessDisplayName: 'Low Lantern Bar', factionIds: ['velvet_tide'], romantic: false,
    position: GENERATED_LAYOUT.actorTiles.devon_price, interestId: 'nightlife', memorySubjectId: 'protagonist_nightlife',
    work: GENERATED_LAYOUT.workTiles.devon_price,
  },
  {
    id: 'priya_nair', visualId: 'priya-nair', displayName: 'Priya Nair', role: 'clinic doctor',
    homeLocationId: 'priya_clinic', businessDisplayName: 'Halcyra Clinic', factionIds: ['island_administration'], romantic: true,
    position: GENERATED_LAYOUT.actorTiles.priya_nair, interestId: 'medicine', memorySubjectId: 'protagonist_health',
    work: GENERATED_LAYOUT.workTiles.priya_nair,
  },
  {
    id: 'tomas_reed', visualId: 'tomas-reed', displayName: 'Tomas Reed', role: 'marina clerk',
    homeLocationId: 'tomas_marina', businessDisplayName: 'Public Marina Office', factionIds: ['island_administration'], romantic: false,
    position: GENERATED_LAYOUT.actorTiles.tomas_reed, interestId: 'boating', memorySubjectId: 'protagonist_boating',
    work: GENERATED_LAYOUT.workTiles.tomas_reed,
  },
  {
    id: 'elise_moreau', visualId: 'elise-moreau', displayName: 'Elise Moreau', role: 'local journalist',
    homeLocationId: 'elise_studio', businessDisplayName: 'Elise Moreau Studio', factionIds: [], romantic: true,
    position: GENERATED_LAYOUT.actorTiles.elise_moreau, interestId: 'journalism', memorySubjectId: 'protagonist_story',
    work: GENERATED_LAYOUT.workTiles.elise_moreau,
  },
] as const;

type NpcState = WorldState['npcs'][string];
type RelationshipState = WorldState['relationships'][string];
type ScheduleState = WorldState['schedules'][string];
type Place = Readonly<{ mapId: string; locationId: string; x: number; y: number }>;

const DISTRICT_HUBS = [
  {
    mapId: 'northwest_residential',
    hubs: [[22, 30], [25, 31], [28, 31], [31, 30], [39, 28], [52, 30]],
  },
  {
    mapId: 'northeast_downtown',
    hubs: [[17, 16], [21, 16], [16, 21], [18, 21], [20, 21], [22, 21]],
  },
  {
    mapId: 'southwest_commercial',
    hubs: [[9, 36], [12, 36], [15, 36], [19, 38], [23, 38], [25, 36]],
  },
  {
    mapId: 'southeast_docks',
    hubs: [[37, 34], [40, 34], [43, 34], [46, 34], [50, 34], [53, 34]],
  },
] as const;

function place(mapId: string, point: readonly [number, number], locationId = mapId): Place {
  return { mapId, locationId, x: point[0], y: point[1] };
}

export const PRODUCTION_AMBIENT_RESIDENTS = DISTRICT_HUBS.flatMap((district, districtIndex) => (
  district.hubs.map((home, localIndex) => {
    const number = String(districtIndex * district.hubs.length + localIndex + 1).padStart(2, '0');
    return Object.freeze({
      id: `resident_${number}`,
      displayName: `Resident ${number}`,
      position: place(district.mapId, home),
      work: place(district.mapId, district.hubs[(localIndex + 2) % district.hubs.length]!),
      social: place(district.mapId, district.hubs[(localIndex + 4) % district.hubs.length]!),
    });
  })
));

/**
 * The Ledger Annex staff: twelve clerks at twelve desks, plus the manager.
 *
 * Stand tiles are the same grid `westMap()` derives its cubicles from — column west edges 8, 13,
 * 18, 23 and row north edges 8, 13, 18, with the stand at `(west + 2, north + 2)`. Written as the
 * grid rather than twelve literal pairs so a module that moves cannot leave a clerk standing in a
 * partition.
 *
 * They sleep at their desks. The spec calls that a staging lie and accepts it for v1: an office
 * with no homes authored for its staff is better than thirteen commuters walking a route that
 * `routeBetween` cannot yet solve in one leg.
 */
const OFFICE_CUBICLE_COLUMN_WEST = [8, 13, 18, 23] as const;
const OFFICE_CUBICLE_ROW_NORTH = [8, 13, 18] as const;

export const PRODUCTION_OFFICE_STAFF = [
  ...OFFICE_CUBICLE_ROW_NORTH.flatMap((north, rowIndex) => (
    OFFICE_CUBICLE_COLUMN_WEST.map((west, columnIndex) => {
      const number = String(rowIndex * OFFICE_CUBICLE_COLUMN_WEST.length + columnIndex + 1).padStart(2, '0');
      const desk = place('west_office', [west + 2, north + 2], 'ledger_annex');
      return Object.freeze({
        id: `clerk_${number}`,
        displayName: `Clerk ${number}`,
        position: desk,
        work: desk,
        social: place('west_office', [25, 31], 'ledger_annex'),
      });
    })
  )),
  Object.freeze({
    id: 'office_manager',
    displayName: 'Annex Manager',
    position: place('west_office', [12, 32], 'ledger_annex'),
    work: place('west_office', [12, 32], 'ledger_annex'),
    social: place('west_office', [25, 31], 'ledger_annex'),
  }),
] as const;

const NAMED_LIFE: Readonly<Record<string, Readonly<{ home: Place; social: Place; evening: Place }>>> = {
  mina_park: {
    home: place('northwest_residential', [34, 15], 'mina_spa'),
    social: place('northwest_residential', [34, 32]),
    evening: place('northwest_residential', [45, 41]),
  },
  rafael_cruz: {
    home: place('southwest_commercial', [50, 41]),
    social: place('southwest_commercial', [21, 38]),
    evening: place('southwest_commercial', [22, 41]),
  },
  sora_tan: {
    home: place('southwest_commercial', [10, 19]),
    social: place('southwest_commercial', [17, 36]),
    evening: place('southwest_commercial', [24, 41]),
  },
  devon_price: {
    home: place('northeast_downtown', [10, 17]),
    social: place('northeast_downtown', [20, 18]),
    evening: place('northeast_downtown', [19, 18]),
  },
  priya_nair: {
    home: place('southeast_docks', [10, 16]),
    social: place('southeast_docks', [40, 34]),
    evening: place('southeast_docks', [40, 38]),
  },
  tomas_reed: {
    home: place('southeast_docks', [46, 34]),
    social: place('southeast_docks', [45, 34]),
    evening: place('southeast_docks', [48, 38]),
  },
  elise_moreau: {
    home: place('northeast_downtown', [17, 38]),
    social: place('northeast_downtown', [45, 38]),
    evening: place('northeast_downtown', [46, 38]),
  },
};

function blankNpc(
  id: string,
  tier: NpcState['tier'],
  position: Readonly<{ mapId: string; locationId: string; x: number; y: number }>,
): NpcState {
  return {
    id,
    tier,
    presence: {
      kind: position.mapId === 'northwest_residential' ? 'active_local' : 'inactive',
      mapId: position.mapId, locationId: position.locationId,
      tileX: position.x, tileY: position.y,
    },
    knowledge: [],
    unlockedInterestIds: [],
    unlockedIds: [],
    memories: [],
  };
}

export function createProductionNpcs(
  schedules: Readonly<Record<string, ScheduleState>> = createProductionSchedules(),
): Record<string, NpcState> {
  const atEight = (id: string) => schedules[`${id}_daily`]!.blocks.find(({ startMinuteOfDay }) => (
    startMinuteOfDay === 480
  ))!;
  const initialPlace = (id: string): Place => {
    const block = atEight(id);
    return { mapId: block.mapId, locationId: block.locationId, x: block.tileX, y: block.tileY };
  };
  return Object.fromEntries([
    ...PRODUCTION_FULL_AI_CAST.map((character) => [
      character.id,
      blankNpc(character.id, 'full_ai', initialPlace(character.id)),
    ] as const),
    ...PRODUCTION_AMBIENT_RESIDENTS.map((resident) => [
      resident.id,
      blankNpc(resident.id, 'ambient', initialPlace(resident.id)),
    ] as const),
    ...PRODUCTION_OFFICE_STAFF.map((staff) => [
      staff.id,
      blankNpc(staff.id, 'ambient', initialPlace(staff.id)),
    ] as const),
  ]);
}

export function createProductionRelationships(): Record<string, RelationshipState> {
  return Object.fromEntries(PRODUCTION_FULL_AI_CAST.map((character) => {
    const rejections = character.romantic ? [] : [{
      reasonId: 'not_romantically_compatible',
      kind: 'permanent_boundary' as const,
      sourceActionId: 'ask_date',
      resolved: false,
    }];
    return [character.id, {
      npcId: character.id,
      values: { familiarity: 0, trust: 0, attraction: 0 },
      stage: 'stranger' as const,
      rejections,
      compatibility: { social: true, romantic: character.romantic },
      policy: {
        romanticEligibleAtStart: false,
        hardBoundaries: [
          { id: 'no_aggressive_flirting', scope: 'romantic' as const, blockedActionIds: ['aggressive_flirt'] },
        ],
        stageRules: [{ stage: 'dating' as const, unavailable: !character.romantic, requiredFlagIds: [] }],
      },
    }] as const;
  }));
}

function residentSchedule(
  id: string,
  home: Place,
  work: Place,
  social: Place,
): ScheduleState {
  return {
    id: `${id}_daily`,
    npcId: id,
    blocks: [
      { startMinuteOfDay: 0, locationId: home.locationId, activityId: 'sleep', mapId: home.mapId, tileX: home.x, tileY: home.y },
      { startMinuteOfDay: 480, locationId: work.locationId, activityId: 'work', mapId: work.mapId, tileX: work.x, tileY: work.y },
      { startMinuteOfDay: 720, locationId: social.locationId, activityId: 'socialize', mapId: social.mapId, tileX: social.x, tileY: social.y },
      { startMinuteOfDay: 1_080, locationId: home.locationId, activityId: 'evening', mapId: home.mapId, tileX: home.x, tileY: home.y },
    ],
  };
}

/**
 * Four blocks, all of them on the clerk's own stand tile.
 *
 * Deliberately NOT `residentSchedule`. That one sends everyone to a social tile at midday, and the
 * office staff share one — so at 12:00 all thirteen clerks walked out of their cubicles and piled
 * onto a single tile beside the water cooler. The spec's whole staging is that they stay at their
 * desks; an office whose workers abandon it at lunch is not the scene that was asked for.
 *
 * Sleeping at the desk is a staging lie the spec takes on purpose: it is cheaper than thirteen
 * homes on Sunward, and it keeps a night capture populated. A later pass may give them homes and a
 * commute, and that pass also has to stop `routeBetween('west_office', 'southeast_docks')` from
 * throwing.
 */
function officeSchedule(id: string, desk: Place): ScheduleState {
  // Field order matters, which is not obvious and cost a debugging round. The load path decides
  // whether a save needs rewriting by comparing `JSON.stringify` of the schedules, so a block that
  // carries identical DATA in a different key order reads as changed. Emitting `activityId` before
  // `locationId` here made every clean load report itself migrated and re-save. Keep this in the
  // same order as `residentSchedule` above.
  const at = (startMinuteOfDay: number, activityId: string) => ({
    startMinuteOfDay,
    locationId: desk.locationId,
    activityId,
    mapId: desk.mapId,
    tileX: desk.x,
    tileY: desk.y,
  });
  return {
    id: `${id}_daily`,
    npcId: id,
    blocks: [at(0, 'sleep'), at(480, 'work'), at(720, 'work'), at(1_320, 'evening')],
  };
}

export function createProductionSchedules(): Record<string, ScheduleState> {
  const named = PRODUCTION_FULL_AI_CAST.map((character) => {
    const life = NAMED_LIFE[character.id]!;
    return [character.id + '_daily', {
    id: character.id + '_daily',
    npcId: character.id,
    blocks: [
      { startMinuteOfDay: 0, locationId: life.home.locationId, activityId: 'sleep', mapId: life.home.mapId, tileX: life.home.x, tileY: life.home.y },
      { startMinuteOfDay: 480, locationId: character.work.locationId, activityId: 'work', mapId: character.work.mapId, tileX: character.work.x, tileY: character.work.y },
      { startMinuteOfDay: 720, locationId: life.social.locationId, activityId: 'socialize', mapId: life.social.mapId, tileX: life.social.x, tileY: life.social.y },
      { startMinuteOfDay: 1_080, locationId: life.evening.locationId, activityId: 'evening', mapId: life.evening.mapId, tileX: life.evening.x, tileY: life.evening.y },
    ],
  } satisfies ScheduleState] as const;
  });
  const ambient = PRODUCTION_AMBIENT_RESIDENTS.map((resident) => {
    const schedule = residentSchedule(resident.id, resident.position, resident.work, resident.social);
    return [schedule.id, schedule] as const;
  });
  const office = PRODUCTION_OFFICE_STAFF.map((staff) => {
    const schedule = officeSchedule(staff.id, staff.work);
    return [schedule.id, schedule] as const;
  });
  return Object.fromEntries([...named, ...ambient, ...office]);
}

/**
 * Both halves of the production-cast repair, in the order a caller with no layout step needs.
 *
 * `save-repository.ts` does NOT use this: it has a layout-recovery step in the middle and calls
 * the two halves either side of it, because they belong on opposite sides. See each one.
 */
export function migrateProductionSchedules(state: WorldState): WorldState {
  return insertMissingProductionCast(refreshProductionSchedules(state));
}

/**
 * Overwrite the schedules the save already has with the authored ones.
 *
 * This must run BEFORE `recoverWorldLayout`, and the order is the whole point. Recovery moves
 * schedule BLOCK tiles when a layout change leaves one on a blocked cell
 * (`layout-recovery.ts` walks `draft.schedules`), and this function writes the authored tile back.
 * Run it after recovery and it silently undoes exactly the repair recovery just made, putting an
 * actor's work tile back inside whatever new wall now stands there.
 */
export function refreshProductionSchedules(state: WorldState): WorldState {
  const production = createProductionSchedules();
  const schedules = { ...state.schedules };
  for (const [id, schedule] of Object.entries(production)) {
    if (schedules[id]) schedules[id] = schedule;
  }
  return { ...state, schedules };
}

/**
 * Add the production actors and schedules a save has never seen, and nothing else.
 *
 * This must run AFTER `recoverWorldLayout`, for the opposite reason: an office clerk's schedule
 * names `west_office`, and `WorldStateSchema` rejects a block on a map the save does not have.
 * Recovery is what inserts that map record, so inserting the cast before it writes a save that
 * will not parse.
 *
 * Insertion is deliberately paired. The schema also rejects a schedule whose NPC is missing, so
 * the NPC and its schedule arrive together or not at all.
 */
export function insertMissingProductionCast(state: WorldState): WorldState {
  const production = createProductionSchedules();
  const productionNpcs = createProductionNpcs(production);
  const schedules = { ...state.schedules };
  const npcs = { ...state.npcs };
  for (const [id, schedule] of Object.entries(production)) {
    if (schedules[id]) continue;
    const npc = productionNpcs[schedule.npcId];
    if (!npc || schedule.blocks.some(({ mapId }) => !state.maps[mapId])) continue;
    schedules[id] = schedule;
    npcs[schedule.npcId] ??= npc;
  }
  return { ...state, npcs, schedules };
}

/**
 * Counts as FORMULAS, not literals. The office added thirteen ambient actors, and a literal here
 * would have to be re-derived by hand every time the cast changes — which is exactly how a count
 * test starts asserting a number nobody can explain.
 */
export const PRODUCTION_CAST_COUNTS = Object.freeze({
  fullAi: PRODUCTION_FULL_AI_CAST.length + 1,
  ambient: PRODUCTION_AMBIENT_RESIDENTS.length + PRODUCTION_OFFICE_STAFF.length + 2,
  totalNpcs: PRODUCTION_FULL_AI_CAST.length + PRODUCTION_AMBIENT_RESIDENTS.length
    + PRODUCTION_OFFICE_STAFF.length + 3,
});
