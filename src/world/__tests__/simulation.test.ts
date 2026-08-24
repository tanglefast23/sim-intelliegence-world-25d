import { reduceCommand } from '../../domain/commands/reducer';
import { DomainCommandSchema } from '../../domain/commands/types';
import { createInitialState } from '../../domain/state/initial-state';
import { WorldStateSchema, type WorldState } from '../../domain/state/schema';
import { sleepWorld, setWorldSpeed, tickWorld } from '../../application/runtime/tick';
import { simulateWorldInterval } from '../schedules/simulation';

function stateAtMinute(absoluteMinute: number, patch: Partial<WorldState> = {}): WorldState {
  const state = createInitialState();
  return WorldStateSchema.parse({
    ...state,
    ...patch,
    clock: { ...state.clock, absoluteMinute, subMinuteMilliseconds: 0 },
  });
}

function pause(state: WorldState): WorldState {
  return reduceCommand(state, DomainCommandSchema.parse({
    type: 'add-pause-token',
    commandId: `command-pause-test-${state.revision}`,
    eventId: `event-pause-test-${state.revision}`,
    scheduledMinute: state.clock.absoluteMinute,
    priority: 0,
    token: 'pause:menu:test',
  })).state;
}

describe('world simulation', () => {
  test('pause, 1x, and 2x advance one authoritative clock without double ticks', () => {
    const initial = createInitialState();
    const atOne = tickWorld(initial, 1_000);
    expect(atOne.clock.absoluteMinute).toBe(421);
    const atTwoSpeed = tickWorld(setWorldSpeed(atOne, 2), 1_000);
    expect(atTwoSpeed.clock.absoluteMinute).toBe(423);
    const paused = tickWorld(pause(atTwoSpeed), 10_000);
    expect(paused.clock.absoluteMinute).toBe(423);
    expect(paused.eventLedger.at(-1)).toEqual(expect.objectContaining({
      type: 'simulation-advanced', fromMinute: 423, toMinute: 423,
    }));
  });

  test('awake time drains Energy slowly and never drains Health', () => {
    const result = tickWorld(createInitialState(), 60_000);
    expect(result.protagonist.energy).toBe(99);
    expect(result.protagonist.health).toBe(100);
    expect(result.eventLedger.at(-1)).toEqual(expect.objectContaining({
      type: 'simulation-advanced',
      energyDelta: -1,
      milestoneIds: expect.arrayContaining(['energy-protagonist-480']),
    }));
  });

  test('a nap advances two hours and restores exactly 25 Energy without awake drain', () => {
    const source = stateAtMinute(480, {
      protagonist: { ...createInitialState().protagonist, energy: 50 },
    });
    const result = sleepWorld(source, 'nap');
    expect(result.clock).toEqual(expect.objectContaining({ absoluteMinute: 600, subMinuteMilliseconds: 0 }));
    expect(result.protagonist.energy).toBe(75);
    expect(result.protagonist.health).toBe(100);
    expect(result.eventLedger.at(-1)).toEqual(expect.objectContaining({ type: 'sleep-completed', mode: 'nap', energyDelta: 25 }));
  });

  test('overnight sleep is gated after 8 PM, wakes at 8 AM, and restores 80 Energy', () => {
    expect(() => sleepWorld(createInitialState(), 'overnight')).toThrow('only after 8:00 PM');
    const source = stateAtMinute(20 * 60, {
      protagonist: { ...createInitialState().protagonist, energy: 10 },
    });
    const result = sleepWorld(source, 'overnight');
    expect(result.clock.absoluteMinute).toBe(1_440 + 8 * 60);
    expect(result.protagonist.energy).toBe(90);
    expect(result.eventLedger.at(-1)).toEqual(expect.objectContaining({ type: 'sleep-completed', mode: 'overnight' }));
  });

  test('inactive transfer departs, arrives once, and survives a save round trip', () => {
    const initial = createInitialState();
    const source = stateAtMinute(719, {
      npcs: {
        ...initial.npcs,
        linda: {
          ...initial.npcs.linda!,
          presence: { kind: 'inactive', mapId: 'northwest_residential', locationId: 'northwest_residential', tileX: 28, tileY: 30 },
          scheduleGoal: undefined,
        },
      },
    });
    const departed = tickWorld(source, 1_000);
    const transfer = Object.values(departed.transfers).find(({ npcId }) => npcId === 'linda')!;
    expect(transfer).toEqual(expect.objectContaining({
      status: 'in_transit',
      npcId: 'linda',
      originMapId: 'northwest_residential',
      destinationMapId: 'southwest_commercial',
      departureMinute: 720,
      arrivalMinute: 750,
    }));
    expect(departed.npcs.linda?.presence).toEqual({ kind: 'in_transit', transferId: transfer.id });

    const loaded = WorldStateSchema.parse(JSON.parse(JSON.stringify(departed)) as unknown);
    const arrived = tickWorld(loaded, 30_000);
    expect(arrived.transfers).toEqual({});
    expect(arrived.npcs.linda?.presence).toEqual({
      kind: 'inactive', mapId: 'southwest_commercial', locationId: 'southwest_commercial', tileX: 17, tileY: 17,
    });
  });

  test('a later schedule supersedes a blocked approaching transfer without duplication', () => {
    const initial = createInitialState();
    const approaching = tickWorld(stateAtMinute(719, {
      schedules: { linda_daily: initial.schedules.linda_daily! },
      npcs: {
        ...initial.npcs,
        generic_resident: {
          ...initial.npcs.generic_resident!,
          presence: { kind: 'inactive', mapId: 'northwest_residential', locationId: 'northwest_residential', tileX: 29, tileY: 33 },
          scheduleGoal: undefined,
        },
      },
    }), 1_000);
    expect(Object.values(approaching.transfers).find(({ npcId }) => npcId === 'linda')?.status).toBe('approaching_exit');
    const beforeHomeBlock = WorldStateSchema.parse({
      ...approaching,
      clock: { ...approaching.clock, absoluteMinute: 1_079, subMinuteMilliseconds: 0 },
    });
    const superseded = tickWorld(beforeHomeBlock, 1_000);
    expect(Object.values(superseded.transfers).filter(({ npcId }) => npcId === 'linda')).toEqual([]);
    expect(superseded.npcs.linda?.scheduleGoal).toEqual(expect.objectContaining({
      activityId: 'home', mapId: 'northwest_residential', tileX: 23, tileY: 28,
    }));
  });

  test('large jumps process equal timestamps by priority and stable ID', () => {
    const result = simulateWorldInterval({
      state: createInitialState(),
      toAbsoluteMinute: 7 * 1_440,
      toSubMinuteMilliseconds: 0,
      awake: true,
      frameMovement: false,
    });
    expect(result.state.inventory.money).toBe(900);
    expect(result.state.protagonist.energy).toBe(0);
    const sameMinute = result.milestoneIds.filter((id) => id.endsWith('-10080'));
    expect(sameMinute).toEqual([
      'energy-protagonist-10080',
      'economy-basic-cost-10080',
      'economy-allowance-10080',
    ]);
    expect(result.state.economy.nextBasicCostMinute).toBe(8 * 1_440);
    expect(result.state.economy.nextAllowanceMinute).toBe(14 * 1_440);
  });

  test('ordinary and dangerous reward ratios are enforced exactly', () => {
    const reward = (state: WorldState, rewardKind: 'ordinary' | 'dangerous', amount: number) => reduceCommand(
      state,
      DomainCommandSchema.parse({
        type: 'apply-quest-reward',
        commandId: `command-reward-${rewardKind}-${amount}`,
        eventId: `event-reward-${rewardKind}-${amount}`,
        scheduledMinute: state.clock.absoluteMinute,
        priority: 0,
        rewardKind,
        amount,
        questId: 'linda_boyfriend_check',
      }),
    ).state;
    expect(reward(createInitialState(), 'ordinary', 800).inventory.money).toBe(1_600);
    expect(() => reward(createInitialState(), 'ordinary', 801)).toThrow('one weekly allowance');
    expect(reward(createInitialState(), 'dangerous', 2_400).inventory.money).toBe(3_200);
    expect(() => reward(createInitialState(), 'dangerous', 799)).toThrow('one to three weekly allowances');
    expect(() => reward(createInitialState(), 'dangerous', 2_401)).toThrow('one to three weekly allowances');
  });
});
