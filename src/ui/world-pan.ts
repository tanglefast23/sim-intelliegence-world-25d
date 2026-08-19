export type ScreenPoint = Readonly<{ x: number; y: number }>;

/** Screen pixels per second that Space + an arrow key pans the world. */
export const KEYBOARD_PAN_PIXELS_PER_SECOND = 900;

/** Longest frame the keyboard pan will integrate, so a stalled tab cannot jump the camera. */
export const KEYBOARD_PAN_MAXIMUM_FRAME_MILLISECONDS = 64;

export const PAN_ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const;
export type PanArrowKey = typeof PAN_ARROW_KEYS[number];

export function isPanArrowKey(key: string): key is PanArrowKey {
  return (PAN_ARROW_KEYS as readonly string[]).includes(key);
}

/**
 * The screen delta for one frame of Space + arrow panning.
 *
 * `panCamera` subtracts this delta from the camera, so the sign is inverted against the key:
 * `ArrowRight` returns a negative x, which moves the camera right and scrolls the view right.
 * That is the arrow-key convention.
 *
 * The pointer paths deliberately keep the opposite feel. They pass the raw pointer delta straight
 * through, so a drag grabs the map and the world follows the cursor.
 *
 * Opposite keys cancel. A diagonal runs at the full rate on each axis rather than a normalised
 * one, which matches how the middle-drag behaves when the mouse moves diagonally.
 */
export function keyboardPanDelta(
  heldKeys: ReadonlySet<string>,
  elapsedMilliseconds: number,
): ScreenPoint {
  const frame = Math.min(
    Math.max(0, elapsedMilliseconds),
    KEYBOARD_PAN_MAXIMUM_FRAME_MILLISECONDS,
  );
  const step = KEYBOARD_PAN_PIXELS_PER_SECOND * frame / 1000;
  return {
    x: (heldKeys.has('ArrowLeft') ? step : 0) - (heldKeys.has('ArrowRight') ? step : 0),
    y: (heldKeys.has('ArrowUp') ? step : 0) - (heldKeys.has('ArrowDown') ? step : 0),
  };
}
