import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { processCommandQueue } from '../commands/queue';
import { reduceCommand } from '../commands/reducer';
import { DomainCommandSchema, type DomainCommand } from '../commands/types';
import { canEnterStage, applyRelationshipDelta } from '../relationships/relationship';
import { applyFactionDelta } from '../economy/faction';
import { advanceClock } from '../clock/clock';
import { createInitialState } from '../state/initial-state';
import { generatePromptView } from '../state/prompt-view';
import { EVENT_HISTORY_LIMIT, WorldStateSchema } from '../state/schema';

function loadCommandStream(): DomainCommand[] {
  const path = resolve(process.cwd(), 'tests/fixtures/domain/command-stream.json');
  return (JSON.parse(readFileSync(path, 'utf8')) as unknown[]).map((command) => DomainCommandSchema.parse(command));
}

describe('deterministic domain contracts', () => {
  test('the same initial state and command stream produce byte-identical state and ledger', () => {
    const first = processCommandQueue(createInitialState('Joe'), loadCommandStream());
    const second = processCommandQueue(createInitialState('Joe'), loadCommandStream());

    expect(JSON.stringify(first.state)).toBe(JSON.stringify(second.state));
    expect(JSON.stringify(first.state.eventLedger)).toBe(JSON.stringify(second.state.eventLedger));
    expect(first.state.eventLedger.map(({ commandId }) => commandId)).toEqual([
      'command-faction',
      'command-relationship',
      'command-clock',
    ]);
  });

  test('a duplicate event ID is an exact no-op', () => {
    const initial = createInitialState();
    const command = loadCommandStream()[0];
    expect(command).toBeDefined();
    const first = reduceCommand(initial, command!);
    const duplicateCommand = DomainCommandSchema.parse({
      ...command,
      commandId: 'command-retry',
    });
    const duplicate = reduceCommand(first.state, duplicateCommand);

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.event).toEqual(first.event);
    expect(duplicate.state).toBe(first.state);
    expect(JSON.stringify(duplicate.state)).toBe(JSON.stringify(first.state));
  });

  test('event history stays bounded and valid', () => {
    let state = createInitialState();
    for (let index = 0; index <= EVENT_HISTORY_LIMIT; index += 1) {
      state = reduceCommand(state, DomainCommandSchema.parse({
        type: 'set-simulation-speed',
        commandId: `command-speed-${index}`,
        eventId: `event-speed-${index}`,
        scheduledMinute: index,
        priority: 0,
        speed: index % 2 === 0 ? 1 : 2,
      })).state;
    }
    expect(state.eventLedger).toHaveLength(EVENT_HISTORY_LIMIT);
    expect(state.eventReceipts).toHaveLength(EVENT_HISTORY_LIMIT + 1);
    expect(state.eventLedger[0]?.sequence).toBe(1);
    expect(WorldStateSchema.parse(state)).toEqual(state);
    const duplicate = reduceCommand(state, DomainCommandSchema.parse({
      type: 'set-simulation-speed', commandId: 'command-speed-retry', eventId: 'event-speed-0',
      scheduledMinute: 0, priority: 0, speed: 2,
    }));
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.state).toBe(state);
  });

  test('one pause token cannot resume another pause token', () => {
    const commands: DomainCommand[] = [
      DomainCommandSchema.parse({ type: 'add-pause-token', commandId: 'command-pause-a', eventId: 'event-pause-a', scheduledMinute: 0, priority: 0, token: 'pause:conversation:linda' }),
      DomainCommandSchema.parse({ type: 'add-pause-token', commandId: 'command-pause-b', eventId: 'event-pause-b', scheduledMinute: 0, priority: 1, token: 'pause:transition:docks' }),
      DomainCommandSchema.parse({ type: 'remove-pause-token', commandId: 'command-resume-a', eventId: 'event-resume-a', scheduledMinute: 1, priority: 0, token: 'pause:conversation:linda' }),
      DomainCommandSchema.parse({ type: 'advance-clock', commandId: 'command-paused-clock', eventId: 'event-paused-clock', scheduledMinute: 2, priority: 0, realMilliseconds: 5_000 }),
    ];

    const result = processCommandQueue(createInitialState(), commands);
    expect(result.state.clock.pauseTokens).toEqual(['pause:transition:docks']);
    expect(result.state.clock.absoluteMinute).toBe(420);
    expect(result.state.clock.subMinuteMilliseconds).toBe(0);
  });

  test('the reducer never mutates command or state aliases', () => {
    const initial = createInitialState();
    const before = JSON.stringify(initial);
    const command = loadCommandStream()[2];
    expect(command).toBeDefined();
    const commandBefore = JSON.stringify(command);
    const result = reduceCommand(initial, command!);

    expect(JSON.stringify(initial)).toBe(before);
    expect(JSON.stringify(command)).toBe(commandBefore);
    expect(result.state).not.toBe(initial);
    expect(result.state.relationships).not.toBe(initial.relationships);
  });

  test('relationship and faction bounds clamp and reject oversized deltas', () => {
    expect(applyRelationshipDelta(
      { familiarity: 99, trust: 1, attraction: 0 },
      { familiarity: 3, trust: -3, attraction: 0 },
      'conversation',
    )).toEqual({
      values: { familiarity: 100, trust: 0, attraction: 0 },
      appliedDelta: { familiarity: 1, trust: -1, attraction: 0 },
    });
    expect(() => applyRelationshipDelta(
      { familiarity: 0, trust: 0, attraction: 0 },
      { familiarity: 4, trust: 0, attraction: 0 },
      'conversation',
    )).toThrow('between -3 and 3');
    expect(applyFactionDelta(95, 10, 'ordinary')).toEqual({ standing: 100, appliedDelta: 5 });
    expect(() => applyFactionDelta(0, 26, 'major')).toThrow('between -25 and 25');
  });

  test('clock arithmetic rejects every safe-integer overflow path', () => {
    expect(() => advanceClock({
      absoluteMinute: 0,
      subMinuteMilliseconds: 999,
      selectedSpeed: 1,
      pauseTokens: [],
    }, Number.MAX_SAFE_INTEGER)).toThrow('Accumulated clock input exceeds');
    expect(() => advanceClock({
      absoluteMinute: Number.MAX_SAFE_INTEGER,
      subMinuteMilliseconds: 0,
      selectedSpeed: 1,
      pauseTokens: [],
    }, 1_000)).toThrow('Absolute clock minute exceeds');
  });

  test('romance needs floors, compatibility, consent, and authored milestone events', () => {
    const permission = {
      sociallyCompatible: true,
      romanticallyCompatible: true,
      directConsent: true,
      authoredEvent: false,
      blockingCircumstance: false,
      unavailable: false,
    };
    expect(canEnterStage({ familiarity: 40, trust: 35, attraction: 30 }, 'dating', permission)).toBe(true);
    expect(canEnterStage({ familiarity: 70, trust: 65, attraction: 55 }, 'engaged', permission)).toBe(false);
    expect(canEnterStage(
      { familiarity: 70, trust: 65, attraction: 55 },
      'engaged',
      { ...permission, authoredEvent: true },
    )).toBe(true);
    expect(canEnterStage(
      { familiarity: 30, trust: 20, attraction: 0 },
      'friend',
      { ...permission, sociallyCompatible: false },
    )).toBe(false);
    expect(() => canEnterStage(
      { familiarity: 40, trust: 35, attraction: 30 },
      'dating',
      permission,
      { familiarity: 0, trust: 0, attraction: 0 },
    )).toThrow('cannot weaken engine floors');
  });

  test('prompt Markdown is disposable and regeneration cannot change state', () => {
    const state = createInitialState('Joe');
    const before = JSON.stringify(state);
    const first = generatePromptView(state);
    let disposableFile = first;
    disposableFile = '';
    const regenerated = generatePromptView(state);

    expect(disposableFile).toBe('');
    expect(regenerated).toBe(first);
    expect(JSON.stringify(state)).toBe(before);
    expect(regenerated).toContain('not authoritative game state');
  });
});
