import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { reduceCommand } from '../commands/reducer';
import { DomainCommandSchema } from '../commands/types';
import { applyInjuredEscape } from '../consequences/defeat';
import { resolveActionCheck } from '../action-check';
import {
  LINDA_QUEST,
  assertNpcDeathPermitted,
  inspectLindaQuestContext,
  lindaContextActions,
} from '../quests/quest-machine';
import { createInitialState } from '../state/initial-state';
import { WorldStateSchema, type WorldState } from '../state/schema';
import { WORLD_MAP_CATALOG } from '../../application/runtime/map-catalog';
import { advanceActiveNpcMovement, movementForNpc } from '../../world/schedules/active-movement';

const fixture = JSON.parse(readFileSync(resolve('tests/fixtures/quests/phase-11.json'), 'utf8')) as {
  villaTile: { x: number; y: number };
  witnessTile: { x: number; y: number };
  injuredEscape: { healthCost: number; timeMinutes: number };
  protect: { reward: number; velvetTideDelta: number };
  betray: { reward: number; velvetTideDelta: number };
};

function command(state: WorldState, type: string, body: Record<string, unknown>, suffix: string) {
  return DomainCommandSchema.parse({
    type,
    commandId: `command-quest-${suffix}`,
    eventId: `event-quest-${suffix}`,
    scheduledMinute: state.clock.absoluteMinute,
    priority: 75,
    ...body,
  });
}

function nearLinda(state: WorldState): WorldState {
  const presence = state.npcs.linda?.presence;
  if (!presence || presence.kind !== 'active_local') throw new Error('Linda must be locally active for this test.');
  return WorldStateSchema.parse({
    ...state,
    protagonist: {
      ...state.protagonist,
      locationId: presence.locationId,
      worldPosition: { mapId: presence.mapId, tileX: presence.tileX - 1, tileY: presence.tileY },
    },
  });
}

type VillaOptions = Readonly<{
  health?: number;
  confidence?: number;
  witness?: boolean;
  firstAid?: boolean;
  securityReport?: boolean;
  authoredWitness?: boolean;
}>;

function atVilla(state: WorldState, options: VillaOptions = {}): WorldState {
  return WorldStateSchema.parse({
    ...state,
    protagonist: {
      ...state.protagonist,
      health: options.health ?? state.protagonist.health,
      confidence: options.confidence ?? state.protagonist.confidence,
      locationId: 'northwest_residential',
      worldPosition: {
        mapId: 'northwest_residential', tileX: fixture.villaTile.x, tileY: fixture.villaTile.y,
      },
    },
    inventory: {
      ...state.inventory,
      items: options.firstAid ? { ...state.inventory.items, first_aid_kit: 1 } : state.inventory.items,
    },
    npcs: options.witness ? {
      ...state.npcs,
      generic_resident: {
        ...state.npcs.generic_resident,
        presence: {
          kind: 'active_local', mapId: 'northwest_residential', locationId: 'linda_villa',
          tileX: fixture.witnessTile.x, tileY: fixture.witnessTile.y,
        },
      },
    } : state.npcs,
  });
}

function startedState(base = createInitialState()): WorldState {
  const positioned = nearLinda(base);
  return reduceCommand(positioned, command(positioned, 'start-linda-quest', {
    requestNpcId: 'linda',
  }, `start-r${positioned.revision}`)).state;
}

function moveResidentToAuthoredGoal(base: WorldState): WorldState {
  let state = WorldStateSchema.parse({
    ...base,
    npcs: {
      ...base.npcs,
      generic_resident: {
        ...base.npcs.generic_resident,
        scheduleGoal: {
          mapId: 'northwest_residential', locationId: 'linda_villa', activityId: 'work',
          tileX: fixture.witnessTile.x, tileY: fixture.witnessTile.y, scheduledMinute: 480,
        },
      },
    },
  });
  let movement = movementForNpc(state, 'generic_resident');
  if (!movement) throw new Error('Generic resident has no authored movement goal.');
  for (let step = 0; step < 30 && state.npcs.generic_resident?.scheduleGoal; step += 1) {
    ({ movement, worldState: state } = advanceActiveNpcMovement(
      WORLD_MAP_CATALOG.northwest_residential,
      movement,
      state,
      'generic_resident',
    ));
  }
  if (state.npcs.generic_resident?.scheduleGoal) throw new Error('Generic resident did not reach the authored witness tile.');
  return state;
}

function discoveredState(base = createInitialState(), options: VillaOptions = {}): WorldState {
  const started = startedState(base);
  const prepared = options.securityReport
    ? reduceCommand(started, command(started, 'purchase-social-option', {
      offerId: 'security_report',
    }, `security-r${started.revision}`)).state
    : started;
  const scheduled = options.authoredWitness ? moveResidentToAuthoredGoal(prepared) : prepared;
  const positioned = atVilla(scheduled, options);
  return reduceCommand(positioned, command(positioned, 'discover-linda-villa', {}, `discover-r${positioned.revision}`)).state;
}

describe('Phase 11 Linda quest and consequences', () => {
  test('QUEST-01 exposes three authored terminal approaches with clear cause and consequence previews', () => {
    expect(LINDA_QUEST.approaches.map(({ id }) => id)).toEqual(['protect_linda', 'betray_linda', 'withdraw']);
    for (const approach of LINDA_QUEST.approaches) {
      expect(approach.cause.length).toBeGreaterThan(10);
      expect(approach.result.length).toBeGreaterThan(10);
      expect(approach.socialConsequence.length).toBeGreaterThan(10);
      expect(approach.routeConsequence.length).toBeGreaterThan(10);
    }
    const initialActions = lindaContextActions(nearLinda(createInitialState()), 'linda');
    expect(initialActions).toEqual([expect.objectContaining({ id: 'start', enabled: true })]);
  });

  test('QUEST-01 only Linda can offer the quest and the protagonist must be near her', () => {
    const far = createInitialState();
    expect(lindaContextActions(far, 'linda')).toEqual([
      expect.objectContaining({ id: 'start', enabled: false, disabledReason: expect.stringContaining('near Linda') }),
    ]);
    expect(() => reduceCommand(far, command(far, 'start-linda-quest', {
      requestNpcId: 'linda',
    }, 'start-too-far'))).toThrow('must be near Linda');
    const close = nearLinda(far);
    expect(() => reduceCommand(close, command(close, 'start-linda-quest', {
      requestNpcId: 'generic_resident',
    }, 'start-wrong-npc'))).toThrow('Only Linda');
  });

  test('a Phase 10 save hydrates the new ambient quest target when Linda offers the quest', () => {
    const current = createInitialState();
    const legacy = WorldStateSchema.parse({
      ...current,
      npcs: Object.fromEntries(Object.entries(current.npcs).filter(([id]) => id !== 'linda_boyfriend')),
      relationships: Object.fromEntries(Object.entries(current.relationships).filter(([id]) => id !== 'linda_boyfriend')),
    });
    const started = startedState(legacy);
    expect(started.schemaVersion).toBe(7);
    expect(started.npcs.linda_boyfriend).toEqual(expect.objectContaining({ condition: 'alive', tier: 'ambient' }));
    expect(started.relationships.linda_boyfriend).toEqual(expect.objectContaining({
      compatibility: { social: false, romantic: false }, stage: 'stranger',
    }));
  });

  test('QUEST-03 starts with a vague unmarked lead, then exact scene discovery adds a persistent marker', () => {
    const started = startedState();
    expect(started.quests.linda_boyfriend_check?.status).toBe('active');
    expect(started.journal.journal_linda_boyfriend).toEqual(expect.objectContaining({
      locationPrecision: 'vague', markerVisible: false, source: { type: 'npc_report', sourceId: 'linda' },
    }));
    expect(started.inventory.items.first_aid_kit).toBe(1);
    const discovered = discoveredState();
    expect(discovered.journal.journal_linda_boyfriend).toEqual(expect.objectContaining({
      locationPrecision: 'exact', locationId: 'linda_villa', markerVisible: true,
      source: { type: 'scene_observation', sourceId: 'linda_villa_arrival' },
    }));
    const reloaded = WorldStateSchema.parse(JSON.parse(JSON.stringify(discovered)) as unknown);
    expect(reloaded.journal.journal_linda_boyfriend?.markerVisible).toBe(true);
  });

  test('QUEST-08 evaluates position, equipment, Health, preparation, witnesses, and quest state', () => {
    const started = startedState();
    expect(() => reduceCommand(started, command(started, 'resolve-linda-quest', {
      approachId: 'protect_linda',
    }, 'protect-before-discovery'))).toThrow('exact Linda villa discovery');

    const weak = discoveredState(createInitialState(), { health: 45, confidence: 20, witness: true, firstAid: true });
    const weakContext = inspectLindaQuestContext(weak);
    expect(weakContext).toEqual(expect.objectContaining({
      positionReady: true,
      healthReady: false,
      confidenceReady: false,
      equipmentIds: ['first_aid_kit'],
      preparationFlagIds: [],
      witnessNpcIds: ['generic_resident', 'resident_01', 'resident_02'],
      readinessScore: 1,
    }));
    const prepared = WorldStateSchema.parse({
      ...weak,
      quests: {
        ...weak.quests,
        linda_boyfriend_check: {
          ...weak.quests.linda_boyfriend_check,
          flagIds: [...weak.quests.linda_boyfriend_check!.flagIds, 'security_report_purchased'].sort(),
        },
      },
    });
    expect(inspectLindaQuestContext(prepared).readinessScore).toBe(2);
  });

  test('QUEST-07 security report changes the exact Action Check odds without predicting a result', () => {
    const unprepared = discoveredState(createInitialState(), { authoredWitness: true });
    const unpreparedProtect = lindaContextActions(unprepared).find(({ id }) => id === 'protect_linda');
    expect(inspectLindaQuestContext(unprepared)).toEqual(expect.objectContaining({
      readinessScore: 3,
      equipmentIds: ['first_aid_kit'],
      preparationFlagIds: [],
      witnessNpcIds: ['generic_resident', 'resident_01', 'resident_02'],
    }));
    expect(unpreparedProtect).toEqual(expect.objectContaining({
      actionCheck: expect.objectContaining({ modifier: 3, target: 9, successesOutOf36: 26, witnessCount: 3 }),
    }));
    const purchased = reduceCommand(unprepared, command(unprepared, 'purchase-social-option', {
      offerId: 'security_report',
    }, 'security-prediction')).state;
    const preparedProtect = lindaContextActions(purchased).find(({ id }) => id === 'protect_linda');
    expect(inspectLindaQuestContext(purchased).readinessScore).toBe(4);
    expect(preparedProtect).toEqual(expect.objectContaining({
      actionCheck: expect.objectContaining({ modifier: 4, target: 9, successesOutOf36: 30 }),
    }));
  });

  test('QUEST-02 protect outcome applies one atomic reward, relationship, faction, evidence, and journal transaction', () => {
    const ready = discoveredState(createInitialState(), { securityReport: true, authoredWitness: true });
    const moneyBefore = ready.inventory.money;
    const result = reduceCommand(ready, command(ready, 'resolve-linda-quest', {
      approachId: 'protect_linda',
    }, 'protect-success'));
    expect(result.event).toEqual(expect.objectContaining({
      type: 'linda-quest-resolved', approachId: 'protect_linda', resultId: 'linda_protected',
      terminalStatus: 'resolved', factionDelta: fixture.protect.velvetTideDelta,
      rewardAmount: fixture.protect.reward, policeFrom: 'none', policeTo: 'noticed',
    }));
    expect(result.state.inventory.money).toBe(moneyBefore + fixture.protect.reward);
    expect(result.state.prng).toEqual(resolveActionCheck(ready.prng, 4, 9).prng);
    expect(result.state.relationships.linda?.values).toEqual({ familiarity: 13, trust: 12, attraction: 1 });
    expect(result.state.factions.velvet_tide).toEqual(expect.objectContaining({ standing: -10, revealed: true }));
    expect(result.state.quests.linda_boyfriend_check).toEqual(expect.objectContaining({
      status: 'resolved', flagIds: expect.arrayContaining(['linda_protected', 'linda_relationship_resolved', 'velvet_tide_lead']),
    }));
    expect(result.state.evidence.evidence_linda_protected).toEqual(expect.objectContaining({
      actionId: 'protect_linda', witnessNpcIds: ['generic_resident', 'resident_01', 'resident_02'], status: 'noticed',
    }));
    expect(result.state.npcs.linda_boyfriend?.condition).toBe('injured');
    expect(result.state.journal.journal_linda_boyfriend?.outcomeReceipts).toEqual([
      expect.objectContaining({ id: 'receipt_linda_protected', outcome: 'success' }),
    ]);
    expect(result.state.verbalMissions.linda_marchetti_purse_sale).toBeDefined();
    expect(result.state.verbalMissions.priya_off_island_assessment).toBeUndefined();

    const duplicate = reduceCommand(result.state, command(ready, 'resolve-linda-quest', {
      approachId: 'protect_linda',
    }, 'protect-success'));
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.state).toEqual(result.state);
    const terminalDuplicate = reduceCommand(result.state, command(result.state, 'resolve-linda-quest', {
      approachId: 'protect_linda',
    }, 'protect-new-event'));
    expect(terminalDuplicate).toEqual(expect.objectContaining({ duplicate: true, event: result.event }));
    expect(WorldStateSchema.parse(JSON.parse(JSON.stringify(result.state)) as unknown)).toEqual(result.state);
  });

  test('QUEST-02 betrayal pays once, opens Velvet Tide, damages trust, and closes Linda romance', () => {
    const initial = createInitialState();
    const social = WorldStateSchema.parse({
      ...initial,
      relationships: {
        ...initial.relationships,
        linda: { ...initial.relationships.linda, values: { familiarity: 20, trust: 15, attraction: 10 } },
      },
    });
    const ready = discoveredState(social);
    const result = reduceCommand(ready, command(ready, 'resolve-linda-quest', {
      approachId: 'betray_linda',
    }, 'betray'));
    expect(result.event).toEqual(expect.objectContaining({
      resultId: 'linda_betrayed', factionDelta: fixture.betray.velvetTideDelta, rewardAmount: fixture.betray.reward,
    }));
    expect(result.state.prng).toEqual(ready.prng);
    expect(result.state.relationships.linda?.values).toEqual({ familiarity: 25, trust: 0, attraction: 0 });
    expect(result.state.relationships.linda?.rejections).toContainEqual(expect.objectContaining({
      reasonId: 'betrayed_linda', kind: 'permanent_boundary', resolved: false,
    }));
    expect(result.state.relationships.linda?.policy.stageRules.find(({ stage }) => stage === 'dating')?.unavailable).toBe(true);
    expect(result.state.factions.velvet_tide).toEqual(expect.objectContaining({ standing: 15, revealed: true }));
    expect(result.state.verbalMissions.linda_marchetti_purse_sale).toBeUndefined();
    expect(result.state.verbalMissions.priya_off_island_assessment).toBeUndefined();
  });

  test('QUEST-01 withdraw is terminal, records its reason, and changes the relationship without invented punishment', () => {
    const started = startedState();
    const result = reduceCommand(started, command(started, 'resolve-linda-quest', {
      approachId: 'withdraw',
    }, 'withdraw'));
    expect(result.event).toEqual(expect.objectContaining({
      approachId: 'withdraw', resultId: 'linda_help_withdrawn', terminalStatus: 'withdrawn',
      rewardAmount: 0, healthDelta: 0, timeDeltaMinutes: 0, factionDelta: 0,
    }));
    expect(result.state.prng).toEqual(started.prng);
    expect(result.state.relationships.linda?.values.familiarity).toBe(7);
    expect(result.state.quests.linda_boyfriend_check?.status).toBe('withdrawn');
    expect(result.state.evidence).toEqual({});
    expect(result.state.policeAttention).toBe('none');
    expect(result.state.verbalMissions.linda_marchetti_purse_sale).toBeDefined();
  });

  test('QUEST-09 injured_escape applies the locked survival floor and four-hour cost exactly once', () => {
    const initial = createInitialState();
    const failureSeed = WorldStateSchema.parse({ ...initial, prng: { ...initial.prng, cursor: 0 } });
    const ready = discoveredState(failureSeed, { health: 30, confidence: 10 });
    const minuteBefore = ready.clock.absoluteMinute;
    const result = reduceCommand(ready, command(ready, 'resolve-linda-quest', {
      approachId: 'protect_linda',
    }, 'injured-escape'));
    expect(result.event).toEqual(expect.objectContaining({
      resultId: 'injured_escape', terminalStatus: 'failed',
      healthDelta: -fixture.injuredEscape.healthCost, timeDeltaMinutes: fixture.injuredEscape.timeMinutes,
      actionCheck: { dice: [2, 1], modifier: 1, target: 9, total: 4, success: false },
    }));
    expect(result.state.protagonist.health).toBe(5);
    expect(result.state.clock.absoluteMinute).toBe(minuteBefore + fixture.injuredEscape.timeMinutes);
    expect(result.state.quests.linda_boyfriend_check?.status).toBe('failed');
    expect(result.state.playerKnowledge.priya_injury_transport_evidence).toBeDefined();
    expect(result.state.verbalMissions.linda_marchetti_purse_sale).toBeDefined();
    expect(result.state.verbalMissions.priya_off_island_assessment).toBeDefined();
    const duplicate = reduceCommand(result.state, command(ready, 'resolve-linda-quest', {
      approachId: 'protect_linda',
    }, 'injured-escape'));
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.state.protagonist.health).toBe(5);
    expect(duplicate.state.clock.absoluteMinute).toBe(result.state.clock.absoluteMinute);
    const reloaded = WorldStateSchema.parse(JSON.parse(JSON.stringify(result.state)) as unknown);
    expect(reloaded.protagonist.health).toBe(5);
    expect(reloaded.clock.absoluteMinute).toBe(minuteBefore + fixture.injuredEscape.timeMinutes);
    const floorState = WorldStateSchema.parse({
      ...createInitialState(),
      protagonist: { ...createInitialState().protagonist, health: 10 },
    });
    expect(applyInjuredEscape(floorState).state.protagonist.health).toBe(1);
  });

  test('QUEST-10 witnessed crime advances through noticed, questioned, wanted, and arrest-on-sight hooks', () => {
    const ready = discoveredState(createInitialState(), { securityReport: true, authoredWitness: true });
    const noticed = reduceCommand(ready, command(ready, 'resolve-linda-quest', {
      approachId: 'protect_linda',
    }, 'witnessed')).state;
    expect(noticed.policeAttention).toBe('noticed');
    const questioned = reduceCommand(noticed, command(noticed, 'advance-police-attention', {
      evidenceId: 'evidence_linda_protected', hook: 'officer_contact',
    }, 'questioned'));
    expect(questioned.event).toEqual(expect.objectContaining({ from: 'noticed', to: 'questioned' }));
    expect(questioned.state.evidence.evidence_linda_protected?.status).toBe('linked');
    const wanted = reduceCommand(questioned.state, command(questioned.state, 'advance-police-attention', {
      evidenceId: 'evidence_linda_protected', hook: 'ignored_summons',
    }, 'wanted')).state;
    expect(wanted.policeAttention).toBe('wanted');
    const arrest = reduceCommand(wanted, command(wanted, 'advance-police-attention', {
      evidenceId: 'evidence_linda_protected', hook: 'wanted_encounter',
    }, 'arrest')).state;
    expect(arrest.policeAttention).toBe('arrest-on-sight');
    expect(() => reduceCommand(createInitialState(), command(createInitialState(), 'advance-police-attention', {
      evidenceId: 'missing_evidence', hook: 'officer_contact',
    }, 'missing-evidence'))).toThrow('witnessed unresolved evidence');
  });

  test('NPC death is rejected unless both the quest and exact outcome permit it', () => {
    expect(() => assertNpcDeathPermitted(LINDA_QUEST.approaches[0]!.success, 'dead')).toThrow('does not permit NPC death');
    expect(() => assertNpcDeathPermitted(LINDA_QUEST.approaches[0]!.success, 'injured')).not.toThrow();
  });

  test('generated conversation state cannot start, resolve, reward, or reveal the quest', () => {
    const initial = createInitialState();
    const conversation = reduceCommand(initial, command(initial, 'commit-conversation', {
      conversationId: 'conversation_cannot_author_quest',
      npcId: 'linda',
      knowledge: [],
      unlockedInterestIds: [],
      unlockedIds: ['velvet_tide_lead'],
      memories: [],
    }, 'conversation-authority')).state;
    expect(conversation.quests.linda_boyfriend_check).toEqual(initial.quests.linda_boyfriend_check);
    expect(conversation.inventory.money).toBe(initial.inventory.money);
    expect(conversation.factions.velvet_tide?.revealed).toBe(false);
    expect(conversation.evidence).toEqual({});
  });
});
