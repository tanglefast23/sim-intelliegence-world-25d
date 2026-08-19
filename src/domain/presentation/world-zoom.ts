export const MIN_WORLD_ZOOM = 1;
/**
 * 5, not 3. The tilted camera compresses the depth axis by `GROUND_Z_SCALE`, so a tile that was 3
 * screen pixels tall per world pixel at the old ceiling is only 1.5 — the 2.5D view reads a full
 * stop further out than the 2D view did at the same number. Raising the ceiling gives back the
 * close-up the flat renderer had.
 *
 * `NearestFilter` and integer-free scaling both hold here: the atlas is point-sampled, so a higher
 * zoom enlarges pixels rather than blurring them.
 */
export const MAX_WORLD_ZOOM = 5;
export const WORLD_ZOOM_STEP = 0.1;

const SAVED_WORLD_ZOOM_STEP = 0.05;
const ZOOM_STEPS_PER_UNIT = Math.round(1 / SAVED_WORLD_ZOOM_STEP);
const FLOAT_TOLERANCE = 1e-8;

export function isWorldZoom(candidate: unknown): candidate is number {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return false;
  if (candidate < MIN_WORLD_ZOOM || candidate > MAX_WORLD_ZOOM) return false;
  return Math.abs(candidate * ZOOM_STEPS_PER_UNIT - Math.round(candidate * ZOOM_STEPS_PER_UNIT)) <
    FLOAT_TOLERANCE;
}

export function assertWorldZoom(candidate: number): number {
  if (!isWorldZoom(candidate)) {
    throw new RangeError('World zoom must be from 100% to 500% in 5% increments.');
  }
  return Math.round(candidate * 100) / 100;
}

export function stepWorldZoom(current: number, direction: -1 | 1): number {
  const next = assertWorldZoom(current) + direction * WORLD_ZOOM_STEP;
  const clamped = Math.min(MAX_WORLD_ZOOM, Math.max(MIN_WORLD_ZOOM, next));
  return Math.round(clamped * 100) / 100;
}

export function worldZoomPercentage(zoom: number): number {
  return Math.round(assertWorldZoom(zoom) * 100);
}
