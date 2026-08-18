import { reduceCommand } from '../../commands/reducer';
import { DomainCommandSchema } from '../../commands/types';
import { createInitialState } from '../../state/initial-state';
import { parseWorldState, type WorldState } from '../../state/schema';
import type { VerbalMissionState } from '../state';
import {
  LINDA_PURSE_MISSION_ID,
  PRIYA_ASSESSMENT_COMMITMENT_ID,
  PRIYA_ASSESSMENT_MISSION_ID,
  TOMAS_FERRY_MISSION_ID,
  planOfferVerbalMission,
} from '../goal-planners';

function command(type: string, suffix: string, body: Record<string, unknown> = {}) {
  return DomainCommandSchema.parse({
    type,
    commandId: `command-${suffix}`,
    eventId: `event-${suffix}`,
    scheduledMinute: 0,
    priority: 0,
    ...body,
  });
}

function availableState(missionId: string): WorldState {
  const initial = createInitialState();
  if (missionId === TOMAS_FERRY_MISSION_ID) return initial;
  return parseWorldState({
    ...initial,
    quests: {
      ...initial.quests,
      linda_boyfriend_check: {
        id: 'linda_boyfriend_check',
        status: missionId === PRIYA_ASSESSMENT_MISSION_ID ? 'failed' : 'resolved',
        flagIds: missionId === PRIYA_ASSESSMENT_MISSION_ID ? ['linda_protect_failed'] : [],
      },
    },
  });
}

function readyState(missionId: string, exactTerm: number | null = null): WorldState {
  const offered = planOfferVerbalMission(availableState(missionId), missionId).state;
  const mission = offered.verbalMissions[missionId]!;
  let ready: VerbalMissionState = {
    ...mission,
    status: 'active',
    concerns: mission.concerns.map((concern) => ({ ...concern, state: 'resolved' as const })),
  };
  if (ready.goalKind === 'buy_object') {
    ready = {
      ...ready,
      terms: { ...ready.terms, currentOffer: exactTerm },
      creditedMoves: exactTerm === null ? [] : [{
        leverId: `offer_${exactTerm}`, concernId: 'payment', supportFactIds: [], offerAmount: exactTerm,
      }],
    };
  } else if (ready.goalKind === 'schedule_cooperation') {
    ready = {
      ...ready,
      terms: { ...ready.terms, proposedMinute: exactTerm },
      creditedMoves: exactTerm === null ? [] : [{
        leverId: `schedule_${exactTerm}`, concernId: 'capacity', supportFactIds: [], offerAmount: null,
      }],
    };
  }
  return parseWorldState({
    ...offered,
    verbalMissions: { ...offered.verbalMissions, [missionId]: ready },
  });
}

function agreementState(): WorldState {
  return reduceCommand(readyState(PRIYA_ASSESSMENT_MISSION_ID, 600), command(
    'create-scheduled-commitment',
    'priya-agreement',
    {
      missionId: PRIYA_ASSESSMENT_MISSION_ID,
      commitmentId: PRIYA_ASSESSMENT_COMMITMENT_ID,
      commitmentMinute: 600,
    },
  )).state;
}

describe('Verbal Mission commands', () => {
  test('offers once, moves available to active, rejects stale outcomes, and withdraws explicitly', () => {
    const offer = command('offer-verbal-mission', 'offer-tomas', { missionId: TOMAS_FERRY_MISSION_ID });
    const offered = reduceCommand(createInitialState(), offer);
    expect(offered.event).toEqual(expect.objectContaining({ type: 'verbal-mission-offered' }));
    expect(offered.state.verbalMissions[TOMAS_FERRY_MISSION_ID]?.status).toBe('available');

    const repeatedOffer = reduceCommand(offered.state, command(
      'offer-verbal-mission', 'offer-tomas-again', { missionId: TOMAS_FERRY_MISSION_ID },
    ));
    expect(repeatedOffer.duplicate).toBe(true);
    expect(repeatedOffer.state).toBe(offered.state);
    expect(repeatedOffer.event).toBe(offered.event);

    const expectedMission = offered.state.verbalMissions[TOMAS_FERRY_MISSION_ID]!;
    const nextMission = {
      ...expectedMission,
      status: 'active' as const,
      concerns: expectedMission.concerns.map((concern) => ({ ...concern, state: 'eased' as const })),
    };
    const applied = reduceCommand(offered.state, command('apply-verbal-mission-outcome', 'tomas-outcome', {
      outcomeId: 'tomas_first_progress', outcome: 'progress', reactionId: 'tomas_considers',
      expectedMission, nextMission,
    }));
    expect(applied.state.verbalMissions[TOMAS_FERRY_MISSION_ID]?.status).toBe('active');
    expect(applied.event).toEqual(expect.objectContaining({ fromStatus: 'available', toStatus: 'active' }));

    const repeatedOutcome = reduceCommand(applied.state, command('apply-verbal-mission-outcome', 'tomas-outcome-retry', {
      outcomeId: 'tomas_first_progress', outcome: 'progress', reactionId: 'tomas_considers',
      expectedMission, nextMission,
    }));
    expect(repeatedOutcome.duplicate).toBe(true);
    expect(repeatedOutcome.state).toBe(applied.state);
    expect(repeatedOutcome.event).toBe(applied.event);

    expect(() => reduceCommand(applied.state, command('apply-verbal-mission-outcome', 'tomas-stale', {
      outcomeId: 'tomas_second_progress', outcome: 'progress', reactionId: 'tomas_considers',
      expectedMission, nextMission,
    }))).toThrow('expected state is stale');

    const withdrawn = reduceCommand(applied.state, command(
      'withdraw-verbal-mission', 'withdraw-tomas', { missionId: TOMAS_FERRY_MISSION_ID },
    ));
    expect(withdrawn.state.verbalMissions[TOMAS_FERRY_MISSION_ID]).toEqual(expect.objectContaining({
      status: 'withdrawn', terminalResultId: 'player_withdrew', roomState: 'done',
    }));
    const repeatedWithdrawal = reduceCommand(withdrawn.state, command(
      'withdraw-verbal-mission', 'withdraw-tomas-again', { missionId: TOMAS_FERRY_MISSION_ID },
    ));
    expect(repeatedWithdrawal.duplicate).toBe(true);
    expect(repeatedWithdrawal.event).toBe(withdrawn.event);
  });

  test('records Tomas disclosure, journal, knowledge, and relationship atomically', () => {
    const state = readyState(TOMAS_FERRY_MISSION_ID);
    const result = reduceCommand(state, command(
      'record-fact-disclosure', 'close-tomas', { missionId: TOMAS_FERRY_MISSION_ID },
    ));
    expect(result.state.verbalMissions[TOMAS_FERRY_MISSION_ID]).toEqual(expect.objectContaining({
      status: 'resolved', terminalResultId: 'tomas_ferry_disclosed',
    }));
    expect(result.state.playerKnowledge.ferry_after_dark_route).toEqual(expect.objectContaining({
      assertedValue: 'southeast_night_ferry',
    }));
    expect(result.state.relationships.tomas_reed?.values).toEqual({ familiarity: 2, trust: 2, attraction: 0 });
    expect(result.state.journal.journal_tomas_after_dark_ferry?.outcomeReceipts).toContainEqual(expect.objectContaining({
      id: 'receipt_tomas_ferry_disclosed', outcome: 'success',
    }));

    const duplicate = reduceCommand(result.state, command(
      'record-fact-disclosure', 'close-tomas-again', { missionId: TOMAS_FERRY_MISSION_ID },
    ));
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.state).toBe(result.state);
    expect(duplicate.event).toBe(result.event);
    expect(() => reduceCommand(state, command('purchase-unique-object', 'wrong-family', {
      missionId: TOMAS_FERRY_MISSION_ID, confirmedAmount: 80,
    }))).toThrow('goal-family closer');
  });

  test('records only authored player knowledge and keeps its first write', () => {
    const record = {
      factId: 'linda_purse_independence_story', assertedValue: true,
      epistemicState: 'observed_fact', truthStatus: 'verified',
      source: { type: 'authored_event', sourceId: 'linda_purse_story' },
    } as const;
    const first = reduceCommand(createInitialState(), command(
      'record-player-knowledge', 'record-linda-story', { record },
    ));
    const duplicate = reduceCommand(first.state, command(
      'record-player-knowledge', 'record-linda-story-again', { record },
    ));
    expect(first.state.playerKnowledge.linda_purse_independence_story).toEqual(record);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.state).toBe(first.state);
    expect(duplicate.event).toBe(first.event);
  });

  test('rejects closers from every other goal family', () => {
    expect(() => reduceCommand(readyState(LINDA_PURSE_MISSION_ID, 80), command(
      'record-fact-disclosure', 'linda-disclosure', { missionId: LINDA_PURSE_MISSION_ID },
    ))).toThrow('goal-family closer');
    expect(() => reduceCommand(readyState(PRIYA_ASSESSMENT_MISSION_ID, 600), command(
      'purchase-unique-object', 'priya-purchase', {
        missionId: PRIYA_ASSESSMENT_MISSION_ID, confirmedAmount: 80,
      },
    ))).toThrow('goal-family closer');
    expect(() => reduceCommand(readyState(TOMAS_FERRY_MISSION_ID), command(
      'create-scheduled-commitment', 'tomas-schedule', {
        missionId: TOMAS_FERRY_MISSION_ID,
        commitmentId: PRIYA_ASSESSMENT_COMMITMENT_ID,
        commitmentMinute: 600,
      },
    ))).toThrow('goal-family closer');
  });

  test.each([
    [79, 'refused'],
    [80, 'linda_purse_sold'],
    [99, 'linda_purse_sold'],
    [100, 'paid_too_much'],
  ] as const)('applies Linda price $%s as %s', (amount, expected) => {
    const state = readyState(LINDA_PURSE_MISSION_ID, amount);
    const candidate = command('purchase-unique-object', `buy-linda-${amount}`, {
      missionId: LINDA_PURSE_MISSION_ID, confirmedAmount: amount,
    });
    if (expected === 'refused') {
      expect(() => reduceCommand(state, candidate)).toThrow('not ready to confirm');
      expect(state.inventory.money).toBe(800);
      expect(state.worldObjects.linda_marchetti_purse?.ownerId).toBe('linda');
      return;
    }
    const result = reduceCommand(state, candidate);
    expect(result.state.inventory.money).toBe(800 - amount);
    expect(result.state.worldObjects.linda_marchetti_purse?.ownerId).toBe('protagonist');
    expect(result.state.verbalMissions[LINDA_PURSE_MISSION_ID]?.terminalResultId).toBe(expected);
    expect(result.state.verbalMissions[LINDA_PURSE_MISSION_ID]?.status).toBe(
      expected === 'paid_too_much' ? 'failed' : 'resolved',
    );
    const duplicate = reduceCommand(result.state, command('purchase-unique-object', `buy-linda-${amount}-again`, {
      missionId: LINDA_PURSE_MISSION_ID, confirmedAmount: amount,
    }));
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.state).toBe(result.state);
    expect(duplicate.event).toBe(result.event);
  });

  test('Linda purchase rechecks funds, ownership, and the credited amount', () => {
    const ready = readyState(LINDA_PURSE_MISSION_ID, 99);
    const poor = parseWorldState({ ...ready, inventory: { ...ready.inventory, money: 50 } });
    const sold = parseWorldState({
      ...ready,
      worldObjects: {
        ...ready.worldObjects,
        linda_marchetti_purse: { objectId: 'linda_marchetti_purse', ownerId: 'protagonist' },
      },
    });
    const purchase = command('purchase-unique-object', 'buy-linda-recheck', {
      missionId: LINDA_PURSE_MISSION_ID, confirmedAmount: 99,
    });
    expect(() => reduceCommand(poor, purchase)).toThrow('not ready to confirm');
    expect(() => reduceCommand(sold, purchase)).toThrow('not ready to confirm');
    expect(() => reduceCommand(ready, command('purchase-unique-object', 'buy-linda-mismatch', {
      missionId: LINDA_PURSE_MISSION_ID, confirmedAmount: 98,
    }))).toThrow('must match');
  });

  test('Priya agreement stays pending, can delay, and later resolves from world state', () => {
    const agreed = agreementState();
    expect(agreed.commitments[PRIYA_ASSESSMENT_COMMITMENT_ID]?.status).toBe('agreed');
    expect(agreed.verbalMissions[PRIYA_ASSESSMENT_MISSION_ID]).toEqual(expect.objectContaining({
      status: 'active', terminalResultId: null,
    }));
    const repeatedAgreement = reduceCommand(agreed, command(
      'create-scheduled-commitment', 'priya-agreement-again', {
        missionId: PRIYA_ASSESSMENT_MISSION_ID,
        commitmentId: PRIYA_ASSESSMENT_COMMITMENT_ID,
        commitmentMinute: 600,
      },
    ));
    expect(repeatedAgreement.duplicate).toBe(true);
    expect(repeatedAgreement.state).toBe(agreed);
    expect(repeatedAgreement.event).toBe(agreed.eventLedger.at(-1));

    const injured = parseWorldState({
      ...agreed,
      clock: { ...agreed.clock, absoluteMinute: 600 },
      npcs: { ...agreed.npcs, priya_nair: { ...agreed.npcs.priya_nair!, condition: 'injured' } },
    });
    const delayed = reduceCommand(injured, command('resolve-scheduled-commitment', 'delay-priya', {
      commitmentId: PRIYA_ASSESSMENT_COMMITMENT_ID,
    }));
    expect(delayed.state.commitments[PRIYA_ASSESSMENT_COMMITMENT_ID]).toEqual(expect.objectContaining({
      status: 'delayed', reasonId: 'medical_delay', scheduledMinute: 660,
    }));
    expect(delayed.state.verbalMissions[PRIYA_ASSESSMENT_MISSION_ID]?.status).toBe('active');

    const recovered = parseWorldState({
      ...delayed.state,
      clock: { ...delayed.state.clock, absoluteMinute: 660 },
      npcs: { ...delayed.state.npcs, priya_nair: { ...delayed.state.npcs.priya_nair!, condition: 'alive' } },
    });
    const honoured = reduceCommand(recovered, command('resolve-scheduled-commitment', 'honour-priya', {
      commitmentId: PRIYA_ASSESSMENT_COMMITMENT_ID,
    }));
    expect(honoured.state.commitments[PRIYA_ASSESSMENT_COMMITMENT_ID]?.status).toBe('honoured');
    expect(honoured.state.verbalMissions[PRIYA_ASSESSMENT_MISSION_ID]).toEqual(expect.objectContaining({
      status: 'resolved', terminalResultId: 'priya_assessment_honoured',
    }));
    const duplicate = reduceCommand(honoured.state, command('resolve-scheduled-commitment', 'honour-priya-again', {
      commitmentId: PRIYA_ASSESSMENT_COMMITMENT_ID,
    }));
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.event).toBe(honoured.event);
  });

  test('Priya reneges when a participant is unavailable', () => {
    const agreed = agreementState();
    const unavailable = parseWorldState({
      ...agreed,
      clock: { ...agreed.clock, absoluteMinute: 600 },
      npcs: {
        ...agreed.npcs,
        linda_boyfriend: { ...agreed.npcs.linda_boyfriend!, condition: 'dead' },
      },
    });
    const result = reduceCommand(unavailable, command('resolve-scheduled-commitment', 'renege-priya', {
      commitmentId: PRIYA_ASSESSMENT_COMMITMENT_ID,
    }));
    expect(result.state.commitments[PRIYA_ASSESSMENT_COMMITMENT_ID]).toEqual(expect.objectContaining({
      status: 'reneged', reasonId: 'participant_unavailable',
    }));
    expect(result.state.verbalMissions[PRIYA_ASSESSMENT_MISSION_ID]).toEqual(expect.objectContaining({
      status: 'failed', terminalResultId: 'priya_assessment_reneged',
    }));
  });

  test('Priya reneges when an injury lasts through the authored deadline', () => {
    const agreed = agreementState();
    const missed = parseWorldState({
      ...agreed,
      clock: { ...agreed.clock, absoluteMinute: 840 },
      npcs: { ...agreed.npcs, priya_nair: { ...agreed.npcs.priya_nair!, condition: 'injured' } },
    });
    const result = reduceCommand(missed, command('resolve-scheduled-commitment', 'deadline-priya', {
      commitmentId: PRIYA_ASSESSMENT_COMMITMENT_ID,
    }));
    expect(result.state.commitments[PRIYA_ASSESSMENT_COMMITMENT_ID]).toEqual(expect.objectContaining({
      status: 'reneged', reasonId: 'assessment_deadline_missed',
    }));
  });

  test.each([
    ['advance-clock', { realMilliseconds: 120_000 }],
    ['advance-simulation', { realMilliseconds: 120_000 }],
    ['sleep-protagonist', { mode: 'nap' }],
    // 600 is not arbitrary: agreementState() starts at 480 and the assertion below expects 600.
    ['dev-jump-to-minute', { toMinute: 600 }],
  ])('resolves due commitments after %s', (type, body) => {
    const result = reduceCommand(agreementState(), command(type, `time-${type}`, body));
    expect(result.state.clock.absoluteMinute).toBe(600);
    expect(result.state.commitments[PRIYA_ASSESSMENT_COMMITMENT_ID]?.status).toBe('honoured');
    expect(result.state.eventLedger.at(-1)).toEqual(expect.objectContaining({
      type: 'scheduled-commitment-resolved', result: 'honoured',
    }));
  });
});
