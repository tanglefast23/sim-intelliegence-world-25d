import { DEV_TIME_PRESETS, nextMinuteOfDay } from '../clock/clock';
import { reduceCommand } from '../commands/reducer';
import { DomainCommandSchema } from '../commands/types';
import { createInitialState } from '../state/initial-state';
import { WorldStateSchema, type WorldState } from '../state/schema';

function jump(state: WorldState, toMinute: number, suffix = `${toMinute}`): WorldState {
  return reduceCommand(state, DomainCommandSchema.parse({
    type: 'dev-jump-to-minute',
    commandId: `command-dev-jump-${suffix}`,
    eventId: `event-dev-jump-${suffix}`,
    scheduledMinute: state.clock.absoluteMinute,
    priority: 0,
    toMinute,
  })).state;
}

function npcTile(state: WorldState, npcId: string): string {
  const presence = state.npcs[npcId]?.presence;
  if (!presence) return 'missing';
  if (presence.kind === 'in_transit') return `transit:${presence.transferId}`;
  return `${presence.kind}:${presence.mapId}:${presence.tileX},${presence.tileY}`;
}

describe('nextMinuteOfDay', () => {
  test('wraps to the next day when the target is already past', () => {
    // Day 1 17:10 -> day 2 09:30.
    expect(nextMinuteOfDay(1_030, 570)).toBe(2_010);
  });

  test('stays on the same day when the target is still ahead', () => {
    expect(nextMinuteOfDay(600, 1_020)).toBe(1_020);
  });

  test('wraps a full day when already sitting on the preset', () => {
    expect(nextMinuteOfDay(780, 780)).toBe(2_220);
  });

  test('rejects a minute of day outside 0..1439', () => {
    expect(() => nextMinuteOfDay(600, -1)).toThrow(RangeError);
    expect(() => nextMinuteOfDay(600, 1_440)).toThrow(RangeError);
    expect(() => nextMinuteOfDay(600, 12.5)).toThrow(RangeError);
  });

  test('every preset is a valid minute of day', () => {
    for (const preset of DEV_TIME_PRESETS) {
      expect(nextMinuteOfDay(0, preset)).toBeGreaterThan(0);
    }
  });
});

describe('dev-jump-to-minute', () => {
  test('lands exactly on the target minute', () => {
    const state = jump(createInitialState(), 1_020);
    expect(state.clock.absoluteMinute).toBe(1_020);
    expect(state.clock.subMinuteMilliseconds).toBe(0);
  });

  test('advances a full day without throwing', () => {
    // Scale is already proven by the 7-day simulateWorldInterval run in
    // src/world/__tests__/simulation.test.ts. This asserts the command reaches the same range.
    const initial = createInitialState();
    const state = jump(initial, initial.clock.absoluteMinute + 1_440);
    expect(state.clock.absoluteMinute).toBe(initial.clock.absoluteMinute + 1_440);
    expect(state.revision).toBeGreaterThan(initial.revision);
  });

  test('leaves protagonist energy untouched across twelve hours', () => {
    const initial = createInitialState();
    const state = jump(initial, initial.clock.absoluteMinute + 720);
    expect(state.protagonist.energy).toBe(initial.protagonist.energy);
  });

  test('snaps linda to her scheduled tile instead of walking her', () => {
    const initial = createInitialState();
    const state = jump(initial, initial.clock.absoluteMinute + 720);
    expect(npcTile(state, 'linda')).not.toBe(npcTile(initial, 'linda'));
    expect(state.npcs.linda?.scheduleGoal).toBeUndefined();
  });

  test('rejects a target at or before the current minute', () => {
    const initial = createInitialState();
    expect(() => jump(initial, initial.clock.absoluteMinute)).toThrow(/must be in the future/);
    expect(() => jump(initial, initial.clock.absoluteMinute - 1, 'past')).toThrow(/must be in the future/);
  });

  test('rejects a jump while a pause token is held', () => {
    const initial = createInitialState();
    const paused: WorldState = {
      ...initial,
      clock: { ...initial.clock, pauseTokens: ['conversation'] },
    };
    expect(() => jump(paused, 1_020)).toThrow(/stable unpaused world/);
  });

  test('survives a JSON round trip, so the new event needs no migration', () => {
    const state = jump(createInitialState(), 1_020);
    expect(state.eventLedger.at(-1)).toEqual(expect.objectContaining({ type: 'dev-time-jumped' }));
    expect(() => WorldStateSchema.parse(JSON.parse(JSON.stringify(state)))).not.toThrow();
  });
});
