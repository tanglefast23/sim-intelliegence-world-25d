import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  WEATHER_MAX_MARKS,
  WEATHER_REDUCED_MOTION_MAX_MARKS,
  sampleWeatherGeometry,
  visualWeatherAt,
  type WeatherProfile,
} from '../weather';

const RAIN = Object.freeze({ revision: 1, kind: 'rain', slotStartMinute: 720 } as const);
const SNOW = Object.freeze({ revision: 1, kind: 'snow', slotStartMinute: 4_320 } as const);
const WORLD_RECT = Object.freeze({ left: 0, top: 0, right: 960, bottom: 640 });

function sample(profile: WeatherProfile, overrides: Partial<Parameters<typeof sampleWeatherGeometry>[0]> = {}) {
  return sampleWeatherGeometry({
    profile,
    mapId: 'northwest_residential',
    mapPixels: { width: 2_048, height: 1_536 },
    worldRect: WORLD_RECT,
    ageStep: 7,
    reducedMotion: false,
    protectedTileKeys: new Set(),
    ...overrides,
  });
}

describe('weather schedule', () => {
  test('uses the authored repeating seven-day table', () => {
    const expected = [
      ['clear', 'clear', 'clear', 'rain', 'clear', 'clear'],
      ['clear', 'clear', 'clear', 'clear', 'rain', 'clear'],
      ['rain', 'clear', 'clear', 'clear', 'clear', 'snow'],
      ['clear', 'clear', 'clear', 'rain', 'rain', 'clear'],
      ['clear', 'rain', 'clear', 'clear', 'clear', 'clear'],
      ['clear', 'clear', 'clear', 'clear', 'clear', 'rain'],
      ['snow', 'clear', 'clear', 'clear', 'rain', 'clear'],
    ] as const;
    expected.forEach((day, dayIndex) => day.forEach((kind, slotIndex) => {
      expect(visualWeatherAt((dayIndex * 24 + slotIndex * 4) * 60).kind).toBe(kind);
    }));
    const first = visualWeatherAt(12 * 60);
    const nextWeek = visualWeatherAt(7 * 24 * 60 + 12 * 60);
    expect(nextWeek.kind).toBe(first.kind);
    expect(nextWeek.slotStartMinute - first.slotStartMinute).toBe(10_080);
  });

  test('rejects invalid minutes and uses no runtime randomness or wall clock', () => {
    expect(() => visualWeatherAt(-1)).toThrow('non-negative safe integer');
    expect(() => visualWeatherAt(1.5)).toThrow('non-negative safe integer');
    const source = readFileSync(resolve(process.cwd(), 'src/render/vfx/weather.ts'), 'utf8');
    expect(source).not.toMatch(/Math\.random|Date\.now|performance\.now/u);
  });
});

describe('weather geometry', () => {
  test('returns one frozen clear result after input validation', () => {
    const clear = visualWeatherAt(8 * 60);
    const first = sample(clear);
    expect(sample(clear, { ageStep: 99 })).toBe(first);
    expect(first).toEqual({ marks: [], droppedMarks: 0, clippedMarks: 0 });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.marks)).toBe(true);
    expect(() => sample(clear, { ageStep: -1 })).toThrow('age step');
    expect(() => sample(clear, { worldRect: { left: 0, top: 0, right: 0, bottom: 1 } })).toThrow('world bounds');
  });

  test('is deterministic, frozen, bounded, and uses the locked glyphs', () => {
    const rain = sample(RAIN);
    const snow = sample(SNOW);
    expect(sample(RAIN)).toEqual(rain);
    expect(rain.marks.length).toBeGreaterThan(0);
    expect(snow.marks.length).toBeGreaterThan(0);
    expect(rain.marks.length).toBeLessThanOrEqual(WEATHER_MAX_MARKS);
    expect(snow.marks.length).toBeLessThanOrEqual(WEATHER_MAX_MARKS);
    expect(rain.marks.every(({ width, height, color, opacity }) => (
      width === 1 && height === 8 && color === '#8fa8c8' && opacity === 0.4
    ))).toBe(true);
    expect(snow.marks.every(({ width, height, color, opacity }) => (
      width === height && [1, 2].includes(width) && color === '#e8eef5' && opacity === 0.55
    ))).toBe(true);
    expect(Object.isFrozen(rain)).toBe(true);
    expect(rain.marks.every(Object.isFrozen)).toBe(true);
  });

  test('falls through height only and keeps ground anchors fixed', () => {
    const first = sample(RAIN, { ageStep: 1 });
    const later = sample(RAIN, { ageStep: 2 });
    expect(later.marks.map(({ worldX, worldY }) => ({ worldX, worldY })))
      .toEqual(first.marks.map(({ worldX, worldY }) => ({ worldX, worldY })));
    expect(later.marks.map(({ heightAboveGround }) => heightAboveGround))
      .not.toEqual(first.marks.map(({ heightAboveGround }) => heightAboveGround));
  });

  test('makes reduced motion static, sparse, and shape-distinct', () => {
    const rain = sample(RAIN, { reducedMotion: true, ageStep: 0 });
    const snow = sample(SNOW, { reducedMotion: true, ageStep: 0 });
    expect(sample(RAIN, { reducedMotion: true, ageStep: 500 })).toEqual(rain);
    expect(sample(SNOW, { reducedMotion: true, ageStep: 500 })).toEqual(snow);
    expect(rain.marks.length).toBeLessThanOrEqual(WEATHER_REDUCED_MOTION_MAX_MARKS);
    expect(snow.marks.length).toBeLessThanOrEqual(WEATHER_REDUCED_MOTION_MAX_MARKS);
    expect(rain.marks.every(({ width, height }) => width === 1 && height === 8)).toBe(true);
    expect(snow.marks.every(({ width, height }) => width === 1 && height === 1)).toBe(true);
  });

  test('clips protected ground anchors and attributes counters correctly', () => {
    const baseline = sample(RAIN, { worldRect: { left: 0, top: 0, right: 384, bottom: 288 } });
    const target = baseline.marks[0];
    expect(target).toBeDefined();
    const key = `${Math.floor((target?.worldX ?? 0) / 32)},${Math.floor((target?.worldY ?? 0) / 32)}`;
    const clipped = sample(RAIN, {
      worldRect: { left: 0, top: 0, right: 384, bottom: 288 },
      protectedTileKeys: new Set([key]),
    });
    expect(clipped.clippedMarks).toBeGreaterThan(0);
    expect(clipped.marks).not.toContainEqual(target);

    const capped = sample(RAIN, { worldRect: { left: -2_000, top: -2_000, right: 4_000, bottom: 4_000 } });
    expect(capped.marks).toHaveLength(WEATHER_MAX_MARKS);
    expect(capped.droppedMarks).toBeGreaterThan(0);
    expect(capped.marks.every(({ worldX, worldY }) => (
      worldX >= 0 && worldY >= 0 && worldX < 2_048 && worldY < 1_536
    ))).toBe(true);
  });

  test('keeps surviving world anchors stable while panning', () => {
    const first = sample(RAIN, { worldRect: { left: 0, top: 0, right: 800, bottom: 500 } });
    const panned = sample(RAIN, { worldRect: { left: 20, top: 10, right: 820, bottom: 510 } });
    const firstKeys = new Set(first.marks.map(({ worldX, worldY }) => `${worldX},${worldY}`));
    expect(panned.marks.filter(({ worldX, worldY }) => firstKeys.has(`${worldX},${worldY}`)).length)
      .toBeGreaterThan(0);
  });
});
