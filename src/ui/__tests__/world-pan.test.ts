import { panCamera } from '../../render/camera';
import {
  KEYBOARD_PAN_MAXIMUM_FRAME_MILLISECONDS,
  KEYBOARD_PAN_PIXELS_PER_SECOND,
  isPanArrowKey,
  keyboardPanDelta,
} from '../world-pan';

const VIEWPORT = { width: 900, height: 640 } as const;
const MAP_PIXELS = { width: 4000, height: 4000 } as const;
const CAMERA = { x: 1000, y: 1000, zoom: 1 } as const;

/** One 60Hz frame, comfortably under the stall cap. */
const FRAME = 16;
const FRAME_STEP = KEYBOARD_PAN_PIXELS_PER_SECOND * FRAME / 1000;

function panned(keys: readonly string[], elapsed = FRAME) {
  return panCamera(CAMERA, keyboardPanDelta(new Set(keys), elapsed), VIEWPORT, MAP_PIXELS);
}

describe('space and arrow world panning', () => {
  test('accepts only the four arrow keys', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(isPanArrowKey(key)).toBe(true);
    }
    for (const key of [' ', 'Space', 'w', 'Enter', 'ArrowUpLeft']) {
      expect(isPanArrowKey(key)).toBe(false);
    }
  });

  test('scrolls the view the way the arrow points', () => {
    // `panCamera` subtracts the delta, so the camera must end up right of where it started when
    // ArrowRight is held. Getting this sign backwards is the whole risk in this file.
    expect(panned(['ArrowRight']).x).toBeGreaterThan(CAMERA.x);
    expect(panned(['ArrowLeft']).x).toBeLessThan(CAMERA.x);
    expect(panned(['ArrowDown']).y).toBeGreaterThan(CAMERA.y);
    expect(panned(['ArrowUp']).y).toBeLessThan(CAMERA.y);
  });

  test('scales the step by the frame time', () => {
    expect(keyboardPanDelta(new Set(['ArrowRight']), FRAME)).toEqual({ x: -FRAME_STEP, y: 0 });
    expect(keyboardPanDelta(new Set(['ArrowDown']), FRAME / 2)).toEqual({ x: 0, y: -FRAME_STEP / 2 });
    // Sixty frames of travel equals one second at the declared speed.
    expect(FRAME_STEP * (1000 / FRAME)).toBeCloseTo(KEYBOARD_PAN_PIXELS_PER_SECOND);
  });

  test('cancels opposite keys and combines perpendicular ones', () => {
    expect(keyboardPanDelta(new Set(['ArrowLeft', 'ArrowRight']), FRAME)).toEqual({ x: 0, y: 0 });
    expect(keyboardPanDelta(new Set(['ArrowUp', 'ArrowDown']), FRAME)).toEqual({ x: 0, y: 0 });
    expect(keyboardPanDelta(new Set(['ArrowUp', 'ArrowRight']), FRAME)).toEqual({
      x: -FRAME_STEP,
      y: FRAME_STEP,
    });
  });

  test('stays still with no arrow held', () => {
    expect(keyboardPanDelta(new Set(), FRAME)).toEqual({ x: 0, y: 0 });
    expect(keyboardPanDelta(new Set(['KeyW']), FRAME)).toEqual({ x: 0, y: 0 });
  });

  test('clamps a stalled frame so the camera cannot jump', () => {
    const stalled = keyboardPanDelta(new Set(['ArrowRight']), 5_000);
    const capped = keyboardPanDelta(new Set(['ArrowRight']), KEYBOARD_PAN_MAXIMUM_FRAME_MILLISECONDS);
    expect(stalled).toEqual(capped);
    expect(keyboardPanDelta(new Set(['ArrowRight']), -20)).toEqual({ x: 0, y: 0 });
  });
});
