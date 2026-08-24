import { z } from 'zod';

import { createPrng, type PrngState } from './prng';

const DieFaceSchema = z.number().int().min(1).max(6);

export const ActionCheckDefinitionSchema = z.object({
  dice: z.literal('2d6'),
  modifier: z.literal('readiness'),
  target: z.number().int().min(2).max(16),
}).strict();

export const ActionCheckResultSchema = z.object({
  dice: z.tuple([DieFaceSchema, DieFaceSchema]),
  modifier: z.number().int(),
  target: z.number().int(),
  total: z.number().int(),
  success: z.boolean(),
}).strict();

export type ActionCheckDefinition = z.infer<typeof ActionCheckDefinitionSchema>;
export type ActionCheckResult = z.infer<typeof ActionCheckResultSchema>;

export function rollTwoDice(prng: PrngState): Readonly<{
  dice: [number, number];
  total: number;
  prng: PrngState;
}> {
  const random = createPrng(prng);
  const dice: [number, number] = [random.nextInt(6) + 1, random.nextInt(6) + 1];
  return { dice, total: dice[0] + dice[1], prng: random.snapshot() };
}

export function resolveActionCheck(
  prng: PrngState,
  modifier: number,
  target: number,
): Readonly<{ result: ActionCheckResult; prng: PrngState }> {
  if (!Number.isSafeInteger(modifier)) throw new RangeError('Action Check modifier must be an integer.');
  if (!Number.isSafeInteger(target)) throw new RangeError('Action Check target must be an integer.');
  const roll = rollTwoDice(prng);
  const total = roll.total + modifier;
  return {
    result: ActionCheckResultSchema.parse({ dice: roll.dice, modifier, target, total, success: total >= target }),
    prng: roll.prng,
  };
}

export function successesOutOf36(modifier: number, target: number): number {
  let successes = 0;
  for (let left = 1; left <= 6; left += 1) {
    for (let right = 1; right <= 6; right += 1) {
      if (left + right + modifier >= target) successes += 1;
    }
  }
  return successes;
}
