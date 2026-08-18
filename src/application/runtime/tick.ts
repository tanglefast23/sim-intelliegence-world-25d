import { reduceCommand } from '../../domain/commands/reducer';
import { DomainCommandSchema } from '../../domain/commands/types';
import type { WorldState } from '../../domain/state/schema';

function commandSuffix(state: WorldState, kind: string): string {
  return `${kind}-${state.revision + 1}-${state.clock.absoluteMinute}`;
}

export function tickWorld(state: WorldState, realMilliseconds: number): WorldState {
  const suffix = commandSuffix(state, 'tick');
  return reduceCommand(state, DomainCommandSchema.parse({
    type: 'advance-simulation',
    commandId: `command-${suffix}`,
    eventId: `event-${suffix}`,
    scheduledMinute: state.clock.absoluteMinute,
    priority: 0,
    realMilliseconds,
  })).state;
}

export function setWorldSpeed(state: WorldState, speed: 0 | 1 | 2): WorldState {
  const suffix = commandSuffix(state, `speed-${speed}`);
  return reduceCommand(state, DomainCommandSchema.parse({
    type: 'set-simulation-speed',
    commandId: `command-${suffix}`,
    eventId: `event-${suffix}`,
    scheduledMinute: state.clock.absoluteMinute,
    priority: 0,
    speed,
  })).state;
}

export function sleepWorld(state: WorldState, mode: 'nap' | 'overnight'): WorldState {
  const suffix = commandSuffix(state, `sleep-${mode}`);
  return reduceCommand(state, DomainCommandSchema.parse({
    type: 'sleep-protagonist',
    commandId: `command-${suffix}`,
    eventId: `event-${suffix}`,
    scheduledMinute: state.clock.absoluteMinute,
    priority: 0,
    mode,
  })).state;
}

/** Dev-mode only. Advances the world to `toMinute`, snapping NPCs to their schedules. */
export function jumpWorldToMinute(state: WorldState, toMinute: number): WorldState {
  const suffix = commandSuffix(state, `dev-jump-${toMinute}`);
  return reduceCommand(state, DomainCommandSchema.parse({
    type: 'dev-jump-to-minute',
    commandId: `command-${suffix}`,
    eventId: `event-${suffix}`,
    scheduledMinute: state.clock.absoluteMinute,
    priority: 0,
    toMinute,
  })).state;
}
