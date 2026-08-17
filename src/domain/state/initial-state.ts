import { createPrng } from '../prng';
import { ENGINE_VERSION } from '../version';
import { PROTOTYPE_ECONOMY_POLICY } from '../economy/economy';
import {
  CONTENT_VERSION,
  MODEL_CONTRACT_VERSION,
  PROMPT_VERSION,
  STATE_SCHEMA_VERSION,
  parseWorldState,
  type WorldState,
} from './schema';
import {
  createProductionNpcs,
  createProductionRelationships,
  createProductionSchedules,
} from './production-cast';
import { GENERATED_LAYOUT } from './generated-layout';

const ACTORS = GENERATED_LAYOUT.actorTiles;
const SCHEDULE_TILES = GENERATED_LAYOUT.scheduleTiles;

export function createInitialState(displayName = 'Player'): WorldState {
  const prng = createPrng(0x51_57_01);
  const productionSchedules = createProductionSchedules();
  return parseWorldState({
    schemaVersion: STATE_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    contentVersion: CONTENT_VERSION,
    promptVersion: PROMPT_VERSION,
    modelContractVersion: MODEL_CONTRACT_VERSION,
    modelPin: {
      id: 'qwen3.5-4b',
      sourceRevision: '851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a',
      artifactSha256: '32c8ff2d0972cc26d4c1f99d6655c7e0d4814bae9c23093a9213e23fd36e3d14',
    },
    generationId: 'generation-prototype-001',
    revision: 0,
    layoutRevisions: GENERATED_LAYOUT.layoutRevisions,
    layoutMigrationEvidence: [],
    prng: prng.snapshot(),
    clock: {
      absoluteMinute: 8 * 60,
      subMinuteMilliseconds: 0,
      selectedSpeed: 1,
      pauseTokens: [],
    },
    protagonist: {
      id: 'protagonist',
      displayName,
      energy: 100,
      health: 100,
      confidence: 50,
      locationId: 'protagonist_villa',
      worldPosition: {
        mapId: ACTORS.protagonist.mapId,
        tileX: ACTORS.protagonist.x,
        tileY: ACTORS.protagonist.y,
      },
    },
    npcs: {
      linda: {
        id: 'linda',
        tier: 'full_ai',
        presence: {
          kind: 'active_local', mapId: ACTORS.linda.mapId, locationId: SCHEDULE_TILES.linda_relax.locationId,
          tileX: SCHEDULE_TILES.linda_relax.x, tileY: SCHEDULE_TILES.linda_relax.y,
        },
        knowledge: [],
        unlockedInterestIds: [],
        unlockedIds: [],
        memories: [],
      },
      generic_resident: {
        id: 'generic_resident',
        tier: 'ambient',
        presence: {
          kind: 'active_local', mapId: ACTORS.generic_resident.mapId, locationId: 'northwest_residential',
          tileX: SCHEDULE_TILES.generic_work.x, tileY: SCHEDULE_TILES.generic_work.y,
        },
        knowledge: [],
        unlockedInterestIds: [],
        unlockedIds: [],
        memories: [],
      },
      linda_boyfriend: {
        id: 'linda_boyfriend',
        tier: 'ambient',
        condition: 'alive',
        presence: {
          kind: 'inactive', mapId: ACTORS.linda_boyfriend.mapId, locationId: 'linda_villa',
          tileX: ACTORS.linda_boyfriend.x, tileY: ACTORS.linda_boyfriend.y,
        },
        knowledge: [],
        unlockedInterestIds: [],
        unlockedIds: [],
        memories: [],
      },
      ...createProductionNpcs(productionSchedules),
    },
    relationships: {
      linda: {
        npcId: 'linda',
        values: { familiarity: 5, trust: 0, attraction: 0 },
        stage: 'stranger',
        rejections: [
          {
            reasonId: 'current_relationship', kind: 'changeable_circumstance', sourceActionId: 'ask_date',
            circumstanceFlagId: 'linda_relationship_resolved', resolved: false,
          },
          {
            reasonId: 'home_visit_not_safe', kind: 'changeable_circumstance', sourceActionId: 'invite_home',
            circumstanceFlagId: 'linda_relationship_resolved', resolved: false,
          },
        ],
        compatibility: { social: true, romantic: true },
        policy: {
          romanticEligibleAtStart: false,
          hardBoundaries: [
            { id: 'no_aggressive_flirting', scope: 'romantic', blockedActionIds: ['aggressive_flirt'] },
          ],
          stageRules: [
            { stage: 'dating', unavailable: false, requiredFlagIds: ['cats_common_interest'] },
          ],
        },
      },
      generic_resident: {
        npcId: 'generic_resident',
        values: { familiarity: 0, trust: 0, attraction: 0 },
        stage: 'stranger',
        rejections: [
          {
            reasonId: 'not_romantically_compatible', kind: 'permanent_boundary',
            sourceActionId: 'ask_date', resolved: false,
          },
        ],
        compatibility: { social: true, romantic: false },
        policy: { romanticEligibleAtStart: false, hardBoundaries: [], stageRules: [] },
      },
      linda_boyfriend: {
        npcId: 'linda_boyfriend',
        values: { familiarity: 0, trust: 0, attraction: 0 },
        stage: 'stranger',
        rejections: [],
        compatibility: { social: false, romantic: false },
        policy: {
          romanticEligibleAtStart: false,
          hardBoundaries: [],
          stageRules: [{ stage: 'dating', unavailable: true, requiredFlagIds: [] }],
        },
      },
      ...createProductionRelationships(),
    },
    inventory: { money: PROTOTYPE_ECONOMY_POLICY.weeklyAllowance, items: {}, homeStorageItems: {} },
    economy: {
      weeklyAllowance: PROTOTYPE_ECONOMY_POLICY.weeklyAllowance,
      basicDailyCost: PROTOTYPE_ECONOMY_POLICY.basicDailyCost,
      nextAllowanceMinute: 7 * 1_440,
      nextBasicCostMinute: 1_440,
    },
    factions: {
      island_administration: { id: 'island_administration', standing: 0, revealed: true },
      velvet_tide: { id: 'velvet_tide', standing: 0, revealed: false },
    },
    quests: {
      linda_boyfriend_check: { id: 'linda_boyfriend_check', status: 'locked', flagIds: [] },
    },
    journal: {},
    invitations: {},
    maps: {
      northwest_residential: { id: 'northwest_residential', active: true, unlocked: true, discoveredEntranceIds: ['protagonist_villa'] },
      northeast_downtown: { id: 'northeast_downtown', active: false, unlocked: true, discoveredEntranceIds: [] },
      southwest_commercial: { id: 'southwest_commercial', active: false, unlocked: true, discoveredEntranceIds: [] },
      southeast_docks: { id: 'southeast_docks', active: false, unlocked: true, discoveredEntranceIds: ['ferry_terminal'] },
      west_office: { id: 'west_office', active: false, unlocked: true, discoveredEntranceIds: ['ledger_annex'] },
    },
    schedules: {
      linda_daily: {
        id: 'linda_daily',
        npcId: 'linda',
        blocks: [
          { startMinuteOfDay: 0, locationId: SCHEDULE_TILES.linda_home.locationId, activityId: 'sleep', mapId: SCHEDULE_TILES.linda_home.mapId, tileX: SCHEDULE_TILES.linda_home.x, tileY: SCHEDULE_TILES.linda_home.y },
          { startMinuteOfDay: 480, locationId: SCHEDULE_TILES.linda_relax.locationId, activityId: 'relax', mapId: SCHEDULE_TILES.linda_relax.mapId, tileX: SCHEDULE_TILES.linda_relax.x, tileY: SCHEDULE_TILES.linda_relax.y },
          { startMinuteOfDay: 720, locationId: SCHEDULE_TILES.linda_shop.locationId, activityId: 'shop', mapId: SCHEDULE_TILES.linda_shop.mapId, tileX: SCHEDULE_TILES.linda_shop.x, tileY: SCHEDULE_TILES.linda_shop.y },
          { startMinuteOfDay: 1_080, locationId: SCHEDULE_TILES.linda_home.locationId, activityId: 'home', mapId: SCHEDULE_TILES.linda_home.mapId, tileX: SCHEDULE_TILES.linda_home.x, tileY: SCHEDULE_TILES.linda_home.y },
        ],
      },
      generic_daily: {
        id: 'generic_daily',
        npcId: 'generic_resident',
        blocks: [
          { startMinuteOfDay: 0, locationId: SCHEDULE_TILES.generic_home.locationId, activityId: 'sleep', mapId: SCHEDULE_TILES.generic_home.mapId, tileX: SCHEDULE_TILES.generic_home.x, tileY: SCHEDULE_TILES.generic_home.y },
          { startMinuteOfDay: 480, locationId: SCHEDULE_TILES.generic_work.locationId, activityId: 'work', mapId: SCHEDULE_TILES.generic_work.mapId, tileX: SCHEDULE_TILES.generic_work.x, tileY: SCHEDULE_TILES.generic_work.y },
          { startMinuteOfDay: 720, locationId: SCHEDULE_TILES.generic_meal.locationId, activityId: 'meal', mapId: SCHEDULE_TILES.generic_meal.mapId, tileX: SCHEDULE_TILES.generic_meal.x, tileY: SCHEDULE_TILES.generic_meal.y },
          { startMinuteOfDay: 1_080, locationId: SCHEDULE_TILES.generic_nightlife.locationId, activityId: 'nightlife', mapId: SCHEDULE_TILES.generic_nightlife.mapId, tileX: SCHEDULE_TILES.generic_nightlife.x, tileY: SCHEDULE_TILES.generic_nightlife.y },
        ],
      },
      ...productionSchedules,
    },
    transfers: {},
    evidence: {},
    playerKnowledge: {},
    worldObjects: { linda_marchetti_purse: { objectId: 'linda_marchetti_purse', ownerId: 'linda' } },
    verbalMissions: {},
    commitments: {},
    policeAttention: 'none',
    eventReceipts: [],
    eventLedger: [],
  });
}
