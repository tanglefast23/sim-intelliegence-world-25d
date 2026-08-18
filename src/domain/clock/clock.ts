import { z } from 'zod';

import { PauseTokenSchema } from '../state/ids';

export const SimulationSpeedSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type SimulationSpeed = z.infer<typeof SimulationSpeedSchema>;

export const ClockStateSchema = z.object({
  absoluteMinute: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  subMinuteMilliseconds: z.number().int().min(0).max(999),
  selectedSpeed: SimulationSpeedSchema,
  pauseTokens: z.array(PauseTokenSchema).refine((tokens) => new Set(tokens).size === tokens.length, {
    message: 'Pause tokens must be unique.',
  }),
}).strict();
export type ClockState = z.infer<typeof ClockStateSchema>;

export function effectiveSpeed(clock: ClockState): SimulationSpeed {
  return clock.pauseTokens.length > 0 ? 0 : clock.selectedSpeed;
}

export function advanceClock(
  clock: ClockState,
  realMilliseconds: number,
): Readonly<{ clock: ClockState; advancedMinutes: number }> {
  if (!Number.isSafeInteger(realMilliseconds) || realMilliseconds < 0) {
    throw new RangeError('Real milliseconds must be a non-negative safe integer.');
  }
  const scaledMilliseconds = realMilliseconds * effectiveSpeed(clock);
  if (!Number.isSafeInteger(scaledMilliseconds)) {
    throw new RangeError('Scaled clock input exceeds the safe integer range.');
  }
  const accumulated = clock.subMinuteMilliseconds + scaledMilliseconds;
  if (!Number.isSafeInteger(accumulated)) {
    throw new RangeError('Accumulated clock input exceeds the safe integer range.');
  }
  const advancedMinutes = Math.floor(accumulated / 1_000);
  const nextAbsoluteMinute = clock.absoluteMinute + advancedMinutes;
  if (!Number.isSafeInteger(nextAbsoluteMinute)) {
    throw new RangeError('Absolute clock minute exceeds the safe integer range.');
  }
  return {
    clock: {
      ...clock,
      absoluteMinute: nextAbsoluteMinute,
      subMinuteMilliseconds: accumulated % 1_000,
      pauseTokens: [...clock.pauseTokens],
    },
    advancedMinutes,
  };
}

/**
 * Dev-mode time-jump targets, as minutes of day.
 *
 * Each one lands on a boundary the lighting art already switches on: the four `worldAtmosphere`
 * buckets, plus peak sun. 780 is peak, not 720 — `worldSun` elevation is
 * `sin(PI * (minute - 300) / 960)`, which is exactly 1 at the sunrise/sunset midpoint.
 */
export const DEV_TIME_PRESETS = [0, 300, 570, 780, 1_020, 1_260] as const;

/** Next absolute minute at `minuteOfDay`, wrapping to the following day when already past. */
export function nextMinuteOfDay(absoluteMinute: number, minuteOfDay: number): number {
  if (!Number.isSafeInteger(absoluteMinute) || absoluteMinute < 0) {
    throw new RangeError('Absolute minute must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > 1_439) {
    throw new RangeError('Minute of day must be a safe integer in 0..1439.');
  }
  const target = Math.floor(absoluteMinute / 1_440) * 1_440 + minuteOfDay;
  return target > absoluteMinute ? target : target + 1_440;
}

export function clockParts(absoluteMinute: number): Readonly<{
  day: number;
  hour: number;
  minute: number;
}> {
  if (!Number.isSafeInteger(absoluteMinute) || absoluteMinute < 0) {
    throw new RangeError('Absolute minute must be a non-negative safe integer.');
  }
  return {
    day: Math.floor(absoluteMinute / 1_440) + 1,
    hour: Math.floor((absoluteMinute % 1_440) / 60),
    minute: absoluteMinute % 60,
  };
}
