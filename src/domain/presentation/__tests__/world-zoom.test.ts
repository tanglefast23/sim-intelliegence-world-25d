import {
  MAX_WORLD_ZOOM,
  MIN_WORLD_ZOOM,
  assertWorldZoom,
  isWorldZoom,
  stepWorldZoom,
  worldZoomPercentage,
} from '../world-zoom';

describe('world zoom', () => {
  test('accepts only five-percent choices inside the supported range', () => {
    expect([1, 1.05, 1.55, 2, 2.95, 3, 4.5, 5].every(isWorldZoom)).toBe(true);
    expect([0.95, 1.53, 5.05, Number.NaN, Number.POSITIVE_INFINITY].some(isWorldZoom)).toBe(false);
    expect(assertWorldZoom(1.55)).toBe(1.55);
    expect(() => assertWorldZoom(1.53)).toThrow('5% increments');
  });

  test('jumps by ten percent without floating-point drift or leaving the range', () => {
    expect(stepWorldZoom(1, -1)).toBe(MIN_WORLD_ZOOM);
    expect(stepWorldZoom(1, 1)).toBe(1.1);
    expect(stepWorldZoom(1.1, 1)).toBe(1.2);
    expect(stepWorldZoom(1.55, 1)).toBe(1.65);
    expect(stepWorldZoom(MAX_WORLD_ZOOM, 1)).toBe(MAX_WORLD_ZOOM);
    expect(worldZoomPercentage(stepWorldZoom(1.5, 1))).toBe(160);
  });
});
