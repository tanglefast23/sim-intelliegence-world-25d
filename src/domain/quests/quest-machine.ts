import { z } from 'zod';

import lindaBoyfriendJson from './linda-boyfriend.json';
import { createCrimeEvidence, nearbyWitnessNpcIds } from '../consequences/evidence';
import { applyInjuredEscape } from '../consequences/defeat';
import { noticeWitnessedCrime, type PoliceAttention } from '../consequences/police';
import { validateQuestReward } from '../economy/economy';
import { applyFactionDelta } from '../factions/faction';
import { upsertJournalEntry, type JournalEntry } from './journal';
import { applyRelationshipDelta, upsertRejection } from '../relationships/relationship';
import { StableIdSchema } from '../state/ids';
import { GENERATED_LAYOUT } from '../state/generated-layout';
import { parseWorldState, type WorldState } from '../state/schema';
import {
  ActionCheckDefinitionSchema,
  resolveActionCheck,
  successesOutOf36,
  type ActionCheckResult,
} from '../action-check';

const RelationshipDeltaSchema = z.object({
  familiarity: z.number().int().min(-15).max(15),
  trust: z.number().int().min(-15).max(15),
  attraction: z.number().int().min(-15).max(15),
}).strict();

const QuestEffectSchema = z.object({
  id: StableIdSchema,
  terminalStatus: z.enum(['resolved', 'failed', 'withdrawn']),
  reason: z.string().trim().min(1).max(240),
  relationshipDelta: RelationshipDeltaSchema,
  futureAvailability: z.enum(['unchanged', 'close_linda_romance']),
  factionDelta: z.object({
    factionId: StableIdSchema,
    delta: z.number().int(),
    scale: z.enum(['ordinary', 'major']),
    reveal: z.boolean(),
  }).strict().optional(),
  reward: z.object({ kind: z.enum(['ordinary', 'dangerous']), amount: z.number().int().nonnegative() }).strict().optional(),
  questFlagIds: z.array(StableIdSchema),
  journalSummary: z.string().trim().min(1).max(500),
  journalOutcome: z.enum(['success', 'failure', 'withdrawn']),
  defeatPackageId: z.literal('injured_escape').optional(),
  npcEffect: z.object({
    condition: z.enum(['alive', 'injured', 'dead']),
    deathPermitted: z.boolean(),
  }).strict(),
}).strict();

export const LindaQuestApproachIdSchema = z.enum(['protect_linda', 'betray_linda', 'withdraw']);

const QuestApproachSchema = z.object({
  id: LindaQuestApproachIdSchema,
  label: z.string().trim().min(1).max(80),
  cause: z.string().trim().min(1).max(240),
  result: z.string().trim().min(1).max(240),
  socialConsequence: z.string().trim().min(1).max(240),
  routeConsequence: z.string().trim().min(1).max(240),
  violent: z.boolean(),
  requiresExactDiscovery: z.boolean(),
  actionCheck: ActionCheckDefinitionSchema.optional(),
  success: QuestEffectSchema,
  defeat: QuestEffectSchema.optional(),
}).strict();

export const LindaQuestDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.literal('linda_boyfriend_check'),
  requestNpcId: z.literal('linda'),
  targetNpcId: z.literal('linda_boyfriend'),
  targetMapId: z.literal('northwest_residential'),
  targetLocationId: z.literal('linda_villa'),
  targetTile: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
  maximumActionDistance: z.number().int().positive(),
  npcDeathPermitted: z.boolean(),
  start: z.object({
    journalEntryId: StableIdSchema,
    summary: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(240),
    grantedItem: z.object({ id: StableIdSchema, count: z.number().int().positive().max(10) }).strict(),
  }).strict(),
  discovery: z.object({
    flagId: StableIdSchema,
    summary: z.string().trim().min(1).max(500),
    sourceId: StableIdSchema,
  }).strict(),
  readiness: z.object({
    healthAtLeast: z.number().int().min(1).max(100),
    confidenceAtLeast: z.number().int().min(1).max(100),
    equipmentIds: z.array(StableIdSchema).min(1),
    preparationFlagIds: z.array(StableIdSchema).min(1),
  }).strict(),
  approaches: z.array(QuestApproachSchema).length(3),
}).strict().superRefine((definition, context) => {
  const ids = definition.approaches.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Quest approach IDs must be unique.' });
  if (!definition.approaches.some(({ violent, defeat }) => violent && defeat?.defeatPackageId === 'injured_escape')) {
    context.addIssue({ code: 'custom', message: 'The quest requires one injured_escape violence branch.' });
  }
  for (const approach of definition.approaches) {
    const ownsCheck = approach.id === 'protect_linda';
    if (Boolean(approach.actionCheck) !== ownsCheck || Boolean(approach.defeat) !== ownsCheck) {
      context.addIssue({ code: 'custom', message: 'Only protect_linda must own the Action Check and defeat outcome.' });
    }
  }
  for (const approach of definition.approaches) {
    for (const effect of [approach.success, approach.defeat].filter((candidate): candidate is z.infer<typeof QuestEffectSchema> => Boolean(candidate))) {
      if (effect.npcEffect.condition === 'dead' && (!definition.npcDeathPermitted || !effect.npcEffect.deathPermitted)) {
        context.addIssue({ code: 'custom', message: `Quest effect ${effect.id} requests an unpermitted NPC death.` });
      }
    }
  }
});

export type LindaQuestDefinition = z.infer<typeof LindaQuestDefinitionSchema>;
export type LindaQuestApproachId = z.infer<typeof QuestApproachSchema>['id'];
type QuestEffect = z.infer<typeof QuestEffectSchema>;

export function resolveLindaQuestDefinition(candidate: unknown): LindaQuestDefinition {
  const target = GENERATED_LAYOUT.actorTiles.linda_boyfriend;
  return LindaQuestDefinitionSchema.parse({
    ...(typeof candidate === 'object' && candidate !== null ? candidate : {}),
    targetMapId: target.mapId,
    targetLocationId: target.locationId,
    targetTile: { x: target.x, y: target.y },
  });
}

export const LINDA_QUEST = resolveLindaQuestDefinition(lindaBoyfriendJson);

function questTargetNpc(state: WorldState): WorldState['npcs'][string] {
  return state.npcs[LINDA_QUEST.targetNpcId] ?? {
    id: LINDA_QUEST.targetNpcId,
    tier: 'ambient',
    condition: 'alive',
    presence: {
      kind: 'inactive', mapId: LINDA_QUEST.targetMapId, locationId: LINDA_QUEST.targetLocationId,
      tileX: LINDA_QUEST.targetTile.x, tileY: LINDA_QUEST.targetTile.y,
    },
    knowledge: [],
    unlockedInterestIds: [],
    unlockedIds: [],
    memories: [],
  };
}

function questTargetRelationship(state: WorldState): WorldState['relationships'][string] {
  return state.relationships[LINDA_QUEST.targetNpcId] ?? {
    npcId: LINDA_QUEST.targetNpcId,
    values: { familiarity: 0, trust: 0, attraction: 0 },
    stage: 'stranger',
    rejections: [],
    compatibility: { social: false, romantic: false },
    policy: {
      romanticEligibleAtStart: false,
      hardBoundaries: [],
      stageRules: [{ stage: 'dating', unavailable: true, requiredFlagIds: [] }],
    },
  };
}

function questFlagSet(state: WorldState): Set<string> {
  return new Set(Object.values(state.quests).flatMap(({ flagIds }) => flagIds));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function distanceFromTarget(state: WorldState): number {
  const position = state.protagonist.worldPosition;
  if (position.mapId !== LINDA_QUEST.targetMapId) return Number.POSITIVE_INFINITY;
  return Math.abs(position.tileX - LINDA_QUEST.targetTile.x) + Math.abs(position.tileY - LINDA_QUEST.targetTile.y);
}

export type LindaQuestContext = Readonly<{
  positionReady: boolean;
  healthReady: boolean;
  confidenceReady: boolean;
  equipmentIds: readonly string[];
  preparationFlagIds: readonly string[];
  witnessNpcIds: readonly string[];
  readinessScore: number;
}>;

export function inspectLindaQuestContext(state: WorldState): LindaQuestContext {
  const flags = questFlagSet(state);
  const equipmentIds = LINDA_QUEST.readiness.equipmentIds.filter((id) => (state.inventory.items[id] ?? 0) > 0);
  const preparationFlagIds = LINDA_QUEST.readiness.preparationFlagIds.filter((id) => flags.has(id));
  const healthReady = state.protagonist.health >= LINDA_QUEST.readiness.healthAtLeast;
  const confidenceReady = state.protagonist.confidence >= LINDA_QUEST.readiness.confidenceAtLeast;
  const witnessNpcIds = nearbyWitnessNpcIds(
    state,
    LINDA_QUEST.targetMapId,
    LINDA_QUEST.targetTile,
    5,
    new Set([LINDA_QUEST.requestNpcId, LINDA_QUEST.targetNpcId]),
  );
  return {
    positionReady: distanceFromTarget(state) <= LINDA_QUEST.maximumActionDistance,
    healthReady,
    confidenceReady,
    equipmentIds,
    preparationFlagIds,
    witnessNpcIds,
    readinessScore: Number(healthReady) + Number(confidenceReady) + Number(equipmentIds.length > 0) + Number(preparationFlagIds.length > 0),
  };
}

export type QuestStartPlan = Readonly<{
  state: WorldState;
  reason: string;
  journalEntryId: string;
  grantedItemId: string;
  grantedItemCount: number;
}>;

function distanceFromRequestNpc(state: WorldState): number {
  const position = state.protagonist.worldPosition;
  const presence = state.npcs[LINDA_QUEST.requestNpcId]?.presence;
  if (!presence || presence.kind !== 'active_local' || presence.mapId !== position.mapId) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(position.tileX - presence.tileX) + Math.abs(position.tileY - presence.tileY);
}

export function planLindaQuestStart(state: WorldState, requestNpcId: string): QuestStartPlan {
  const quest = state.quests[LINDA_QUEST.id];
  if (!quest || quest.status !== 'locked') throw new Error('Linda can offer this quest only once from its locked state.');
  if (requestNpcId !== LINDA_QUEST.requestNpcId) throw new Error('Only Linda can offer this quest.');
  if (!state.npcs[LINDA_QUEST.requestNpcId]) throw new Error('Linda is missing from authoritative world state.');
  if (distanceFromRequestNpc(state) > LINDA_QUEST.maximumActionDistance) {
    throw new Error('The protagonist must be near Linda to accept her request.');
  }
  const entry: JournalEntry = {
    id: LINDA_QUEST.start.journalEntryId,
    subject: { kind: 'quest', questId: LINDA_QUEST.id },
    summary: LINDA_QUEST.start.summary,
    locationPrecision: 'vague',
    markerVisible: false,
    source: { type: 'npc_report', sourceId: LINDA_QUEST.requestNpcId },
    resolutionState: 'open',
    outcomeReceipts: [],
  };
  const existingItemCount = state.inventory.items[LINDA_QUEST.start.grantedItem.id] ?? 0;
  const itemCount = Math.max(existingItemCount, LINDA_QUEST.start.grantedItem.count);
  return {
    state: parseWorldState({
      ...state,
      npcs: { ...state.npcs, [LINDA_QUEST.targetNpcId]: questTargetNpc(state) },
      relationships: {
        ...state.relationships,
        [LINDA_QUEST.targetNpcId]: questTargetRelationship(state),
      },
      inventory: {
        ...state.inventory,
        items: { ...state.inventory.items, [LINDA_QUEST.start.grantedItem.id]: itemCount },
      },
      quests: { ...state.quests, [quest.id]: { ...quest, status: 'active' } },
      journal: { ...state.journal, [entry.id]: entry },
    }),
    reason: LINDA_QUEST.start.reason,
    journalEntryId: entry.id,
    grantedItemId: LINDA_QUEST.start.grantedItem.id,
    grantedItemCount: itemCount - existingItemCount,
  };
}

export type QuestDiscoveryPlan = Readonly<{ state: WorldState; journalEntryId: string; changed: boolean }>;

export function planLindaVillaDiscovery(state: WorldState): QuestDiscoveryPlan {
  const quest = state.quests[LINDA_QUEST.id];
  if (!quest || quest.status !== 'active') throw new Error('Linda villa discovery requires the active quest.');
  if (distanceFromTarget(state) > LINDA_QUEST.maximumActionDistance) {
    throw new Error('The protagonist must be at Linda villa to confirm its exact location.');
  }
  const current = state.journal[LINDA_QUEST.start.journalEntryId];
  if (!current) throw new Error('The active Linda quest is missing its journal entry.');
  const alreadyDiscovered = quest.flagIds.includes(LINDA_QUEST.discovery.flagId);
  const entry = upsertJournalEntry(current, {
    ...current,
    summary: LINDA_QUEST.discovery.summary,
    locationPrecision: 'exact',
    locationId: LINDA_QUEST.targetLocationId,
    markerVisible: true,
    source: { type: 'scene_observation', sourceId: LINDA_QUEST.discovery.sourceId },
  });
  return {
    state: parseWorldState({
      ...state,
      quests: {
        ...state.quests,
        [quest.id]: { ...quest, flagIds: uniqueSorted([...quest.flagIds, LINDA_QUEST.discovery.flagId]) },
      },
      journal: { ...state.journal, [entry.id]: entry },
    }),
    journalEntryId: entry.id,
    changed: !alreadyDiscovered,
  };
}

function closeLindaRomance(state: WorldState, relationship: WorldState['relationships'][string]) {
  if (!relationship) throw new Error('Linda relationship state is missing.');
  const rejection = {
    reasonId: 'betrayed_linda',
    kind: 'permanent_boundary' as const,
    sourceActionId: 'ask_date',
    resolved: false,
  };
  return {
    ...relationship,
    rejections: upsertRejection(relationship.rejections, rejection),
    policy: {
      ...relationship.policy,
      stageRules: relationship.policy.stageRules.map((rule) => rule.stage === 'dating' ? { ...rule, unavailable: true } : rule),
    },
  };
}

export function assertNpcDeathPermitted(effect: QuestEffect, requestedCondition: 'alive' | 'injured' | 'dead'): void {
  if (requestedCondition === 'dead' && (!LINDA_QUEST.npcDeathPermitted || !effect.npcEffect.deathPermitted)) {
    throw new Error('This authored quest outcome does not permit NPC death.');
  }
}

export type QuestOutcomePlan = Readonly<{
  state: WorldState;
  approachId: LindaQuestApproachId;
  resultId: string;
  terminalStatus: 'resolved' | 'failed' | 'withdrawn';
  reason: string;
  relationshipDelta: Readonly<{ familiarity: number; trust: number; attraction: number }>;
  factionId?: string;
  factionDelta: number;
  rewardAmount: number;
  healthDelta: number;
  timeDeltaMinutes: number;
  evidenceId?: string;
  witnessNpcIds: readonly string[];
  policeFrom: PoliceAttention;
  policeTo: PoliceAttention;
  actionCheck?: ActionCheckResult;
}>;

export function planLindaQuestOutcome(state: WorldState, approachId: LindaQuestApproachId): QuestOutcomePlan {
  const quest = state.quests[LINDA_QUEST.id];
  if (!quest || quest.status !== 'active') throw new Error('A Linda quest outcome requires the active unresolved quest.');
  const approach = LINDA_QUEST.approaches.find(({ id }) => id === approachId);
  if (!approach) throw new Error(`Unknown Linda quest approach: ${approachId}`);
  const context = inspectLindaQuestContext(state);
  if (approach.requiresExactDiscovery) {
    if (!quest.flagIds.includes(LINDA_QUEST.discovery.flagId)) throw new Error('This approach requires the exact Linda villa discovery.');
    if (!context.positionReady) throw new Error('This approach requires the protagonist at Linda villa.');
  }
  const check = approach.actionCheck
    ? resolveActionCheck(state.prng, context.readinessScore, approach.actionCheck.target)
    : undefined;
  const defeated = check ? !check.result.success : false;
  const effect = defeated ? approach.defeat : approach.success;
  if (!effect) throw new Error('The contextual quest branch has no authored outcome.');
  assertNpcDeathPermitted(effect, effect.npcEffect.condition);

  let baseState = check ? parseWorldState({ ...state, prng: check.prng }) : state;
  let healthDelta = 0;
  let timeDeltaMinutes = 0;
  if (effect.defeatPackageId === 'injured_escape') {
    const defeat = applyInjuredEscape(baseState);
    baseState = defeat.state;
    healthDelta = defeat.healthDelta;
    timeDeltaMinutes = defeat.timeDeltaMinutes;
  }

  const relationship = baseState.relationships[LINDA_QUEST.requestNpcId];
  if (!relationship) throw new Error('Linda relationship state is missing.');
  const relationshipResult = applyRelationshipDelta(relationship.values, effect.relationshipDelta, 'quest');
  let nextRelationship = { ...relationship, values: relationshipResult.values };
  if (effect.futureAvailability === 'close_linda_romance') {
    nextRelationship = closeLindaRomance(baseState, nextRelationship);
  }

  let factionDelta = 0;
  let factions = baseState.factions;
  if (effect.factionDelta) {
    const faction = baseState.factions[effect.factionDelta.factionId];
    if (!faction) throw new Error(`Unknown quest faction: ${effect.factionDelta.factionId}`);
    const factionResult = applyFactionDelta(faction.standing, effect.factionDelta.delta, effect.factionDelta.scale);
    factionDelta = factionResult.appliedDelta;
    factions = {
      ...factions,
      [faction.id]: { ...faction, standing: factionResult.standing, revealed: effect.factionDelta.reveal || faction.revealed },
    };
  }

  const rewardAmount = effect.reward ? validateQuestReward(effect.reward.kind, effect.reward.amount) : 0;
  const money = baseState.inventory.money + rewardAmount;
  if (!Number.isSafeInteger(money)) throw new RangeError('Linda quest reward exceeds the safe money range.');
  const nextQuest = {
    ...quest,
    status: effect.terminalStatus,
    flagIds: uniqueSorted([...quest.flagIds, ...effect.questFlagIds]),
  };
  const currentJournal = baseState.journal[LINDA_QUEST.start.journalEntryId];
  if (!currentJournal) throw new Error('The active Linda quest is missing its journal entry.');
  const receiptId = `receipt_${effect.id}`;
  const journal = upsertJournalEntry(currentJournal, {
    ...currentJournal,
    summary: effect.journalSummary,
    source: { type: 'authored_event', sourceId: effect.id },
    resolutionState: 'resolved',
    outcomeReceipts: [{ id: receiptId, summary: effect.reason, outcome: effect.journalOutcome }],
  });

  let evidenceId: string | undefined;
  let evidence = baseState.evidence;
  const policeFrom = baseState.policeAttention;
  let policeTo = policeFrom;
  if (approach.violent) {
    evidenceId = `evidence_${effect.id}`;
    const record = createCrimeEvidence({
      id: evidenceId,
      actionId: approach.id,
      locationId: LINDA_QUEST.targetLocationId,
      witnessNpcIds: context.witnessNpcIds,
      createdAtMinute: state.clock.absoluteMinute,
    });
    evidence = { ...evidence, [record.id]: record };
    policeTo = noticeWitnessedCrime(policeFrom, record.witnessNpcIds.length);
  }

  const targetNpc = baseState.npcs[LINDA_QUEST.targetNpcId];
  if (!targetNpc) throw new Error('Linda boyfriend is missing from authoritative world state.');
  const nextState = parseWorldState({
    ...baseState,
    relationships: { ...baseState.relationships, [nextRelationship.npcId]: nextRelationship },
    factions,
    inventory: { ...baseState.inventory, money },
    quests: { ...baseState.quests, [nextQuest.id]: nextQuest },
    journal: { ...baseState.journal, [journal.id]: journal },
    npcs: {
      ...baseState.npcs,
      [targetNpc.id]: { ...targetNpc, condition: effect.npcEffect.condition },
    },
    evidence,
    policeAttention: policeTo,
  });
  return {
    state: nextState,
    approachId,
    resultId: effect.id,
    terminalStatus: effect.terminalStatus,
    reason: effect.reason,
    relationshipDelta: relationshipResult.appliedDelta,
    ...(effect.factionDelta ? { factionId: effect.factionDelta.factionId } : {}),
    factionDelta,
    rewardAmount,
    healthDelta,
    timeDeltaMinutes,
    ...(evidenceId ? { evidenceId } : {}),
    witnessNpcIds: context.witnessNpcIds,
    policeFrom,
    policeTo,
    ...(check ? { actionCheck: check.result } : {}),
  };
}

export type ContextQuestAction = Readonly<{
  id: string;
  label: string;
  cause: string;
  result: string;
  socialConsequence: string;
  routeConsequence: string;
  actionCheck?: Readonly<{
    dice: '2d6';
    modifier: number;
    target: number;
    successesOutOf36: number;
    healthReady: boolean;
    confidenceReady: boolean;
    equipmentReady: boolean;
    preparationReady: boolean;
    witnessCount: number;
  }>;
  enabled: boolean;
  disabledReason?: string;
}>;

export function lindaContextActions(state: WorldState, selectedNpcId?: string): ContextQuestAction[] {
  const quest = state.quests[LINDA_QUEST.id];
  if (!quest) return [];
  if (quest.status === 'locked') {
    const nearLinda = distanceFromRequestNpc(state) <= LINDA_QUEST.maximumActionDistance;
    return selectedNpcId === LINDA_QUEST.requestNpcId ? [{
      id: 'start',
      label: 'Accept Linda\'s request',
      cause: LINDA_QUEST.start.reason,
      result: 'A vague lead enters the journal. The exact villa stays unmarked until the player finds it.',
      socialConsequence: 'Linda trusts the player with a dangerous personal problem.',
      routeConsequence: 'This opens the first risky quest.',
      enabled: nearLinda,
      ...(!nearLinda ? { disabledReason: 'Move near Linda to accept her request.' } : {}),
    }] : [];
  }
  if (quest.status !== 'active') return [];
  const context = inspectLindaQuestContext(state);
  const discovered = quest.flagIds.includes(LINDA_QUEST.discovery.flagId);
  if (!discovered && context.positionReady) {
    return [{
      id: 'discover',
      label: 'Confirm Linda\'s villa',
      cause: 'Inspect the villa row at the location Linda described.',
      result: 'The journal gains the exact address and map marker.',
      socialConsequence: 'No relationship value changes yet.',
      routeConsequence: 'The three terminal approaches become available.',
      enabled: true,
    }, {
      id: 'withdraw',
      label: 'Withdraw',
      cause: LINDA_QUEST.approaches[2]!.cause,
      result: LINDA_QUEST.approaches[2]!.result,
      socialConsequence: LINDA_QUEST.approaches[2]!.socialConsequence,
      routeConsequence: LINDA_QUEST.approaches[2]!.routeConsequence,
      enabled: true,
    }];
  }
  if (!discovered) {
    const withdraw = LINDA_QUEST.approaches.find(({ id }) => id === 'withdraw')!;
    return [{
      id: withdraw.id,
      label: withdraw.label,
      cause: withdraw.cause,
      result: withdraw.result,
      socialConsequence: withdraw.socialConsequence,
      routeConsequence: withdraw.routeConsequence,
      enabled: true,
    }];
  }
  return LINDA_QUEST.approaches.map((approach) => {
    const isProtect = approach.id === 'protect_linda';
    return {
      id: approach.id,
      label: approach.label,
      cause: approach.cause,
      result: approach.result,
      socialConsequence: approach.socialConsequence,
      routeConsequence: approach.routeConsequence,
      ...(isProtect ? {
        actionCheck: {
          dice: '2d6' as const,
          modifier: context.readinessScore,
          target: approach.actionCheck!.target,
          successesOutOf36: successesOutOf36(context.readinessScore, approach.actionCheck!.target),
          healthReady: context.healthReady,
          confidenceReady: context.confidenceReady,
          equipmentReady: context.equipmentIds.length > 0,
          preparationReady: context.preparationFlagIds.length > 0,
          witnessCount: context.witnessNpcIds.length,
        },
      } : {}),
      enabled: !approach.requiresExactDiscovery || context.positionReady,
      ...(!approach.requiresExactDiscovery || context.positionReady ? {} : { disabledReason: 'Go to Linda villa to use this approach.' }),
    };
  });
}
