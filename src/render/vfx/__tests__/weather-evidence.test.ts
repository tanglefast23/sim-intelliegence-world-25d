import { VFX_STEP_MILLISECONDS } from '../types';
import { parseWeatherEvidence } from '../weather-evidence';

const MARK = {
  worldX: 320,
  worldY: 640,
  heightAboveGround: 96,
  width: 1,
  height: 8,
  color: '#8fa8c8',
  opacity: 0.4,
} as const;
const ACTIVE = {
  schemaVersion: 1,
  weatherRevision: 1,
  source: 'auto',
  kind: 'rain',
  absoluteMinute: 720,
  slotStartMinute: 720,
  reducedMotion: false,
  running: true,
  liveMarks: 1,
  droppedMarks: 0,
  clippedMarks: 2,
  sampleStep: 5,
  updateRateHz: 1_000 / VFX_STEP_MILLISECONDS,
  sampleHash: '1234abcd',
  marks: [MARK],
  interiorTileKeys: ['9,8'],
  doorTileKeys: ['17,24'],
  camera: { x: 100, y: 200, zoom: 2 },
} as const;

describe('weather evidence', () => {
  test('accepts active, paused, clear, and reduced-motion records', () => {
    expect(parseWeatherEvidence(ACTIVE)).toEqual(ACTIVE);
    expect(parseWeatherEvidence({ ...ACTIVE, running: false, updateRateHz: 0 })).toBeDefined();
    expect(parseWeatherEvidence({
      ...ACTIVE,
      kind: 'clear',
      liveMarks: 0,
      marks: [],
      sampleStep: 0,
      updateRateHz: 0,
    })).toBeDefined();
    expect(parseWeatherEvidence({
      ...ACTIVE,
      kind: 'snow',
      reducedMotion: true,
      sampleStep: 0,
      updateRateHz: 0,
    })).toBeDefined();
  });

  test('rejects unknown fields and conditional rule violations', () => {
    expect(() => parseWeatherEvidence({ ...ACTIVE, extra: true })).toThrow();
    expect(() => parseWeatherEvidence({ ...ACTIVE, liveMarks: 2 })).toThrow('does not match');
    expect(() => parseWeatherEvidence({ ...ACTIVE, running: false })).toThrow('zero update rate');
    expect(() => parseWeatherEvidence({
      ...ACTIVE,
      reducedMotion: true,
      liveMarks: 17,
      marks: Array.from({ length: 17 }, () => MARK),
      sampleStep: 0,
      updateRateHz: 0,
    })).toThrow('cap');
    expect(() => parseWeatherEvidence({ ...ACTIVE, kind: 'clear' })).toThrow('Clear weather');
    expect(() => parseWeatherEvidence({ ...ACTIVE, updateRateHz: 0 })).toThrow('ambient update rate');
  });
});
