import { stableTupleHash } from '../../world/presentation/material-selection';
import type { VfxWorldRect } from './types';

export const WEATHER_REVISION = 1 as const;
export const WEATHER_SLOT_MINUTES = 240 as const;
export const WEATHER_MAX_MARKS = 64 as const;
export const WEATHER_REDUCED_MOTION_MAX_MARKS = 16 as const;
export const WEATHER_GRID_SIZE = 96 as const;

export const WEATHER_KINDS = ['clear', 'rain', 'snow'] as const;
export type WeatherKind = typeof WEATHER_KINDS[number];

export type WeatherProfile = Readonly<{
  revision: 1;
  kind: WeatherKind;
  slotStartMinute: number;
}>;

/** World-pixel geometry. The ground anchor never moves; falling changes height only. */
export type WeatherMark = Readonly<{
  worldX: number;
  worldY: number;
  heightAboveGround: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}>;

export type WeatherGeometry = Readonly<{
  marks: readonly WeatherMark[];
  droppedMarks: number;
  clippedMarks: number;
}>;

const WEEK = Object.freeze([
  ['clear', 'clear', 'clear', 'rain', 'clear', 'clear'],
  ['clear', 'clear', 'clear', 'clear', 'rain', 'clear'],
  ['rain', 'clear', 'clear', 'clear', 'clear', 'snow'],
  ['clear', 'clear', 'clear', 'rain', 'rain', 'clear'],
  ['clear', 'rain', 'clear', 'clear', 'clear', 'clear'],
  ['clear', 'clear', 'clear', 'clear', 'clear', 'rain'],
  ['snow', 'clear', 'clear', 'clear', 'rain', 'clear'],
] as const);

const EMPTY_MARKS: readonly WeatherMark[] = Object.freeze([]);
const CLEAR_GEOMETRY: WeatherGeometry = Object.freeze({
  marks: EMPTY_MARKS,
  droppedMarks: 0,
  clippedMarks: 0,
});
const FALL_HEIGHT_PIXELS = 96;
const MINIMUM_HEIGHT_PIXELS = 24;

export function isWeatherKind(value: unknown): value is WeatherKind {
  return typeof value === 'string' && WEATHER_KINDS.includes(value as WeatherKind);
}

export function visualWeatherAt(absoluteMinute: number): WeatherProfile {
  if (!Number.isSafeInteger(absoluteMinute) || absoluteMinute < 0) {
    throw new Error('Weather minute must be a non-negative safe integer.');
  }
  const slot = Math.floor(absoluteMinute / WEATHER_SLOT_MINUTES);
  const dayRow = Math.floor(slot / 6) % WEEK.length;
  const kind = WEEK[dayRow]?.[slot % 6];
  if (!kind) throw new Error('Weather schedule slot is missing.');
  return Object.freeze({
    revision: WEATHER_REVISION,
    kind,
    slotStartMinute: slot * WEATHER_SLOT_MINUTES,
  });
}

type Candidate = Readonly<{
  seed: number;
  gridX: number;
  gridY: number;
  mark: WeatherMark;
}>;

function markFor(
  kind: Exclude<WeatherKind, 'clear'>,
  seed: number,
  gridX: number,
  gridY: number,
  ageStep: number,
  reducedMotion: boolean,
): WeatherMark {
  const width = kind === 'rain' || reducedMotion ? 1 : seed % 2 === 0 ? 2 : 1;
  const height = kind === 'rain' ? 8 : width;
  const horizontalRange = WEATHER_GRID_SIZE - width - 8;
  const verticalRange = WEATHER_GRID_SIZE - 8;
  const worldX = gridX * WEATHER_GRID_SIZE + 4 + (Math.floor(seed / WEATHER_GRID_SIZE) % horizontalRange);
  const worldY = gridY * WEATHER_GRID_SIZE + 4 + (Math.floor(seed / 7) % verticalRange);
  const speed = kind === 'rain' ? 12 : 4;
  const phase = (Math.floor(seed / 13) + (reducedMotion ? 0 : ageStep * speed)) % FALL_HEIGHT_PIXELS;
  return Object.freeze({
    worldX,
    worldY,
    heightAboveGround: MINIMUM_HEIGHT_PIXELS + FALL_HEIGHT_PIXELS - 1 - phase,
    width,
    height,
    color: kind === 'rain' ? '#8fa8c8' : '#e8eef5',
    opacity: kind === 'rain' ? 0.4 : 0.55,
  });
}

export function sampleWeatherGeometry(input: Readonly<{
  profile: WeatherProfile;
  mapId: string;
  mapPixels: Readonly<{ width: number; height: number }>;
  worldRect: VfxWorldRect;
  ageStep: number;
  reducedMotion: boolean;
  protectedTileKeys: ReadonlySet<string>;
}>): WeatherGeometry {
  const { profile, mapId, mapPixels, worldRect, ageStep, reducedMotion, protectedTileKeys } = input;
  if (!Number.isSafeInteger(ageStep) || ageStep < 0) {
    throw new Error('Weather age step must be a non-negative safe integer.');
  }
  if (
    !Number.isFinite(worldRect.left) || !Number.isFinite(worldRect.top) ||
    !Number.isFinite(worldRect.right) || !Number.isFinite(worldRect.bottom) ||
    worldRect.right <= worldRect.left || worldRect.bottom <= worldRect.top
  ) {
    throw new Error('Weather world bounds must be finite and positive.');
  }
  if (
    !Number.isFinite(mapPixels.width) || !Number.isFinite(mapPixels.height) ||
    mapPixels.width <= 0 || mapPixels.height <= 0
  ) {
    throw new Error('Weather map bounds must be finite and positive.');
  }
  if (
    profile.revision !== WEATHER_REVISION || !isWeatherKind(profile.kind) ||
    !Number.isSafeInteger(profile.slotStartMinute) || profile.slotStartMinute < 0
  ) {
    throw new Error('Weather profile is invalid.');
  }
  if (mapId.length === 0) throw new Error('Weather map ID is required.');
  if (profile.kind === 'clear') return CLEAR_GEOMETRY;

  const left = Math.max(0, worldRect.left);
  const top = Math.max(0, worldRect.top);
  const right = Math.min(mapPixels.width, worldRect.right);
  const bottom = Math.min(mapPixels.height, worldRect.bottom);
  if (right <= left || bottom <= top) {
    return Object.freeze({ marks: EMPTY_MARKS, droppedMarks: 0, clippedMarks: 0 });
  }

  const candidates: Candidate[] = [];
  let clippedMarks = 0;
  const minimumGridX = Math.floor(left / WEATHER_GRID_SIZE);
  const maximumGridX = Math.floor((right - 1) / WEATHER_GRID_SIZE);
  const minimumGridY = Math.floor(top / WEATHER_GRID_SIZE);
  const maximumGridY = Math.floor((bottom - 1) / WEATHER_GRID_SIZE);
  for (let gridY = minimumGridY; gridY <= maximumGridY; gridY += 1) {
    for (let gridX = minimumGridX; gridX <= maximumGridX; gridX += 1) {
      const seed = stableTupleHash([
        WEATHER_REVISION,
        mapId,
        profile.kind,
        profile.slotStartMinute,
        gridX,
        gridY,
      ]);
      const selected = reducedMotion
        ? seed % 8 === 0
        : profile.kind === 'rain' ? seed % 2 === 0 : seed % 3 === 0;
      if (!selected) continue;
      const mark = markFor(profile.kind, seed, gridX, gridY, ageStep, reducedMotion);
      if (
        mark.worldX < left || mark.worldX >= right || mark.worldY < top || mark.worldY >= bottom ||
        mark.worldX >= mapPixels.width || mark.worldY >= mapPixels.height
      ) continue;
      const anchorKey = `${Math.floor(mark.worldX / 32)},${Math.floor(mark.worldY / 32)}`;
      if (protectedTileKeys.has(anchorKey)) {
        clippedMarks += 1;
        continue;
      }
      candidates.push({ seed, gridX, gridY, mark });
    }
  }

  const cap = reducedMotion ? WEATHER_REDUCED_MOTION_MAX_MARKS : WEATHER_MAX_MARKS;
  candidates.sort((leftCandidate, rightCandidate) => (
    leftCandidate.seed - rightCandidate.seed ||
    leftCandidate.gridY - rightCandidate.gridY ||
    leftCandidate.gridX - rightCandidate.gridX
  ));
  return Object.freeze({
    marks: Object.freeze(candidates.slice(0, cap).map(({ mark }) => mark)),
    droppedMarks: Math.max(0, candidates.length - cap),
    clippedMarks,
  });
}
