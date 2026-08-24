import { z } from 'zod';

import { VFX_STEP_MILLISECONDS } from './types';
import {
  WEATHER_MAX_MARKS,
  WEATHER_REDUCED_MOTION_MAX_MARKS,
  WEATHER_REVISION,
} from './weather';

const TileKeySchema = z.string().regex(/^\d+,\d+$/u);
const WeatherMarkSchema = z.object({
  worldX: z.number().finite().nonnegative(),
  worldY: z.number().finite().nonnegative(),
  heightAboveGround: z.number().finite().positive(),
  width: z.number().int().positive().max(8),
  height: z.number().int().positive().max(8),
  color: z.string().regex(/^#[0-9a-f]{6}$/u),
  opacity: z.number().min(0).max(1),
}).strict().readonly();

export const WeatherEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  weatherRevision: z.literal(WEATHER_REVISION),
  source: z.enum(['auto', 'forced']),
  kind: z.enum(['clear', 'rain', 'snow']),
  absoluteMinute: z.number().int().nonnegative(),
  slotStartMinute: z.number().int().nonnegative(),
  reducedMotion: z.boolean(),
  running: z.boolean(),
  liveMarks: z.number().int().nonnegative().max(WEATHER_MAX_MARKS),
  droppedMarks: z.number().int().nonnegative(),
  clippedMarks: z.number().int().nonnegative(),
  sampleStep: z.number().int().nonnegative(),
  updateRateHz: z.number().nonnegative().max(1_000 / VFX_STEP_MILLISECONDS),
  sampleHash: z.string().regex(/^[0-9a-f]{8}$/u),
  marks: z.array(WeatherMarkSchema).max(WEATHER_MAX_MARKS).readonly(),
  interiorTileKeys: z.array(TileKeySchema).readonly(),
  doorTileKeys: z.array(TileKeySchema).readonly(),
  camera: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().positive(),
  }).strict().readonly(),
}).strict().superRefine((value, context) => {
  const issue = (message: string): void => context.addIssue({ code: 'custom', message });
  if (value.liveMarks !== value.marks.length) issue('Weather live mark count does not match its marks.');
  if (value.reducedMotion && value.liveMarks > WEATHER_REDUCED_MOTION_MAX_MARKS) {
    issue('Reduced-motion weather exceeds its mark cap.');
  }
  if (value.kind === 'clear' && (
    value.liveMarks !== 0 || value.sampleStep !== 0 || value.updateRateHz !== 0
  )) {
    issue('Clear weather must have zero live marks, sample step, and update rate.');
  }
  if (value.reducedMotion && (value.sampleStep !== 0 || value.updateRateHz !== 0)) {
    issue('Reduced-motion weather must have zero sample step and update rate.');
  }
  if (!value.running && value.updateRateHz !== 0) issue('Stopped weather must have zero update rate.');
  if (
    value.kind !== 'clear' && !value.reducedMotion && value.running &&
    value.updateRateHz !== 1_000 / VFX_STEP_MILLISECONDS
  ) {
    issue('Running precipitation must use the ambient update rate.');
  }
}).readonly();

export type WeatherEvidence = z.infer<typeof WeatherEvidenceSchema>;

export function parseWeatherEvidence(input: unknown): WeatherEvidence {
  return WeatherEvidenceSchema.parse(input);
}
