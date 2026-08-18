import { z } from 'zod';

import { StableIdSchema } from '../../domain/state/ids';

export const NeighborhoodIdSchema = z.enum([
  'northwest_residential',
  'northeast_downtown',
  'southwest_commercial',
  'southeast_docks',
  'west_office',
]);

export const WorldLocationSchema = z.object({
  schemaVersion: z.literal(1),
  id: StableIdSchema,
  displayName: z.string().trim().min(1).max(80),
  neighborhoodId: NeighborhoodIdSchema,
  kind: z.enum(['neighborhood', 'home', 'business', 'civic', 'transport']),
  adjacentLocationIds: z.array(StableIdSchema),
}).strict();

export const WorldFactionSchema = z.object({
  schemaVersion: z.literal(1),
  id: StableIdSchema,
  displayName: z.string().trim().min(1).max(80),
}).strict();

export const WorldCharacterSchema = z.object({
  schemaVersion: z.literal(1),
  id: StableIdSchema,
  displayName: z.string().trim().min(1).max(80),
  tier: z.enum(['protagonist', 'full_ai', 'ambient']),
  homeLocationId: StableIdSchema,
  factionIds: z.array(StableIdSchema),
}).strict();

export type WorldLocation = z.infer<typeof WorldLocationSchema>;
export type WorldFaction = z.infer<typeof WorldFactionSchema>;
export type WorldCharacter = z.infer<typeof WorldCharacterSchema>;
