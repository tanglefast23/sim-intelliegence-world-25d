import { MAX_WORLD_ZOOM, MIN_WORLD_ZOOM } from '../domain/presentation/world-zoom';
import {
  MAX_MOVEMENT_FRAME_MS,
  routeMotionProgress,
  type WorldPoint,
} from '../world/movement/motion-clock';
import { stableTupleHash } from '../world/presentation/material-selection';
import {
  CAMERA_DEAD_ZONE_RATIO,
  clampCamera,
  followWindowTarget,
  frameCameraOn,
  type CameraState,
  type ClampFn,
  type ScreenInsets,
  type ViewportSize,
} from './camera';

/**
 * Follow uses frame-rate independent exponential smoothing, `k = 1 - exp(-decay * dt)`, so the
 * camera settles at the same rate at 60 Hz and 144 Hz.
 */
export const CAMERA_FOLLOW_DECAY_PER_SECOND = 9;
/** Below this the camera is set straight to the target, which also stops the clock. */
export const CAMERA_SETTLE_SCREEN_PX = 0.5;

/**
 * Impact envelope, fixed by docs/specs/2026-08-11-skia-procedural-vfx.md section 9.9: 2 world
 * pixels ordinary, 4 world pixels strong authored, 70-180 ms, no oscillating shake loop. Trauma
 * only ever decreases and floors at zero, so the offset is a decaying impulse by construction.
 * With `shake = trauma^2`, trauma 1.0 is the 4 px strong maximum and trauma 0.707 the 2 px
 * ordinary one, which keeps both ceilings on one constant.
 */
export const MAX_SHAKE_WORLD_PX = 4;
/** The section 9.9 ceiling. Every part of the impact envelope is derived from this one number. */
export const IMPACT_MAX_DURATION_MS = 180;
/** Trauma 1.0 reaches exactly zero at the ceiling. */
export const TRAUMA_DECAY_PER_SECOND = 1_000 / IMPACT_MAX_DURATION_MS;
/** The recoil kick decays faster than the shake and is cut off at the same ceiling. */
export const KICK_DECAY_MS = 60;
/** Feel only; amplitude is capped separately. */
export const SHAKE_FREQUENCY_HZ = 22;

const SHAKE_NOISE_SEED_X = 0x5ca1ab1e;
const SHAKE_NOISE_SEED_Y = 0x0dd1e5;
const UINT32_MAXIMUM = 0xffff_ffff;
const MAX_SHOTS_PER_STEP = 8;
const ZERO_OFFSET: WorldPoint = Object.freeze({ x: 0, y: 0 });

export type CameraEase = 'linear' | 'in' | 'out' | 'in-out';

export type CameraShot =
  | Readonly<{
    kind: 'focus';
    /** One point centres it; two or more frame their bounding box. */
    points: readonly WorldPoint[];
    /** Omitted keeps the current zoom. Quantised to the 5% world-zoom lattice. */
    zoom?: number;
    /** Screen pixels the interface occupies on each edge. */
    insets?: ScreenInsets;
    durationMs: number;
    ease?: CameraEase;
  }>
  | Readonly<{ kind: 'hold'; durationMs: number }>
  | Readonly<{ kind: 'impulse'; trauma: number; direction?: WorldPoint }>;

/**
 * A scripted scene drives the camera through this handle. `play` replaces the queue, `impulse`
 * layers trauma onto whatever the camera is already doing, and the follow state in force before
 * the queue started is restored when it drains.
 */
export type CameraDirector = Readonly<{
  play: (shots: readonly CameraShot[]) => void;
  push: (shot: CameraShot) => void;
  impulse: (trauma: number, direction?: WorldPoint) => void;
  cancel: () => void;
  isPlaying: () => boolean;
}>;

export type CameraMotion = Readonly<{
  followArmed: boolean;
  followRestore: boolean;
  trauma: number;
  kick: WorldPoint;
  kickAgeMs: number;
  noisePhaseMs: number;
  shots: readonly CameraShot[];
  shotElapsedMs: number;
  shotFrom: CameraState | undefined;
}>;

export type CameraDirectorInput = Readonly<{
  deltaMs: number;
  followPoint: WorldPoint;
  viewport: ViewportSize;
  mapPixels: ViewportSize;
  reducedMotion: boolean;
  /**
   * How the director clamps to the map. Defaults to `clampCamera`, so the 2D path and every
   * existing test are unchanged; the tilted renderer passes `clampCameraTilted`.
   */
  clamp?: ClampFn;
}>;

export type CameraDirectorSample = Readonly<{
  motion: CameraMotion;
  /** The base camera: persisted, hit-tested, and never carrying the shake offset. */
  camera: CameraState;
  /** Presentation-only shake and recoil, in world pixels. Added at frame-build time. */
  offset: WorldPoint;
  /** False when nothing is left to animate, so the caller can stop its clock. */
  active: boolean;
}>;

export const INITIAL_CAMERA_MOTION: CameraMotion = Object.freeze({
  followArmed: false,
  followRestore: false,
  trauma: 0,
  kick: ZERO_OFFSET,
  kickAgeMs: 0,
  noisePhaseMs: 0,
  shots: Object.freeze([]),
  shotElapsedMs: 0,
  shotFrom: undefined,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Rounds to the 5% lattice `assertWorldZoom` enforces, so a zoom ramp never throws. */
export function quantiseWorldZoom(zoom: number): number {
  return clamp(Math.round(zoom * 20) / 20, MIN_WORLD_ZOOM, MAX_WORLD_ZOOM);
}

/**
 * Smoothed value noise over an integer lattice. Per-frame random reads as fizz; smoothed noise is
 * what the trauma model calls for, and this needs no dependency.
 */
function valueNoise(seed: number, position: number): number {
  const index = Math.floor(position);
  const progress = position - index;
  const start = stableTupleHash([seed, index]) / UINT32_MAXIMUM * 2 - 1;
  const end = stableTupleHash([seed, index + 1]) / UINT32_MAXIMUM * 2 - 1;
  return start + (end - start) * progress * progress * (3 - 2 * progress);
}

function easeProgress(progress: number, ease: CameraEase = 'in-out'): number {
  return routeMotionProgress(
    progress,
    ease === 'in' || ease === 'in-out',
    ease === 'out' || ease === 'in-out',
  );
}

function unitVector(direction: WorldPoint): WorldPoint {
  const length = Math.hypot(direction.x, direction.y);
  return length === 0 ? ZERO_OFFSET : { x: direction.x / length, y: direction.y / length };
}

function sameCamera(left: CameraState, right: CameraState): boolean {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

export function armFollow(motion: CameraMotion): CameraMotion {
  return { ...motion, followArmed: true, followRestore: true };
}

export function suspendFollow(motion: CameraMotion): CameraMotion {
  return { ...motion, followArmed: false, followRestore: false };
}

export function applyImpulse(
  motion: CameraMotion,
  trauma: number,
  direction?: WorldPoint,
): CameraMotion {
  return {
    ...motion,
    trauma: clamp(motion.trauma + trauma, 0, 1),
    kick: direction ? unitVector(direction) : ZERO_OFFSET,
    kickAgeMs: 0,
  };
}

export function playShots(motion: CameraMotion, shots: readonly CameraShot[]): CameraMotion {
  // An empty queue must not disarm follow. Without this, playShots would clear followArmed and
  // stash a restore that sampleCameraDirector only replays while shots remain, so play([]) left
  // follow off with no path back except the manual Center action.
  if (shots.length === 0) return cancelShots(motion);
  return {
    ...motion,
    followArmed: false,
    followRestore: motion.shots.length > 0 ? motion.followRestore : motion.followArmed,
    shots: [...shots],
    shotElapsedMs: 0,
    shotFrom: undefined,
  };
}

export function pushShot(motion: CameraMotion, shot: CameraShot): CameraMotion {
  return motion.shots.length === 0
    ? playShots(motion, [shot])
    : { ...motion, shots: [...motion.shots, shot] };
}

export function cancelShots(motion: CameraMotion): CameraMotion {
  return {
    ...motion,
    followArmed: motion.shots.length > 0 ? motion.followRestore : motion.followArmed,
    shots: [],
    shotElapsedMs: 0,
    shotFrom: undefined,
  };
}

function focusCamera(
  shot: Extract<CameraShot, { kind: 'focus' }>,
  from: CameraState,
  input: CameraDirectorInput,
  eased: number,
): CameraState {
  const targetZoom = shot.zoom === undefined
    ? from.zoom
    : quantiseWorldZoom(from.zoom + (shot.zoom - from.zoom) * eased);
  const target = frameCameraOn(
    shot.points,
    targetZoom,
    input.viewport,
    input.mapPixels,
    shot.insets,
    input.clamp ?? clampCamera,
  );
  return (input.clamp ?? clampCamera)({
    zoom: targetZoom,
    x: from.x + (target.x - from.x) * eased,
    y: from.y + (target.y - from.y) * eased,
  }, input.viewport, input.mapPixels);
}

/**
 * One pure step of the camera clock: drains finished shots, advances the running one or eases
 * follow, and decays the impact offset. No React, no DOM, no clock of its own — the caller owns
 * the frame time, which is what lets a scripted scene replay the same beat in a test.
 */
export function sampleCameraDirector(
  motion: CameraMotion,
  camera: CameraState,
  input: CameraDirectorInput,
): CameraDirectorSample {
  const deltaMs = clamp(input.deltaMs, 0, MAX_MOVEMENT_FRAME_MS);
  const seconds = deltaMs / 1_000;
  let nextCamera = camera;
  // Floored, not just clamped: float residue of 1e-17 would read as "still shaking" and keep the
  // caller's clock awake for ever.
  const decayed = motion.trauma - TRAUMA_DECAY_PER_SECOND * seconds;
  let trauma = decayed > 1e-6 ? decayed : 0;
  let kick = motion.kick;
  let kickAgeMs = motion.kickAgeMs + deltaMs;
  let shots = motion.shots;
  let shotElapsedMs = motion.shotElapsedMs + deltaMs;
  let shotFrom = motion.shotFrom;
  let followArmed = motion.followArmed;

  for (let guard = 0; guard < MAX_SHOTS_PER_STEP; guard += 1) {
    const shot = shots[0];
    if (!shot) break;
    if (shot.kind === 'impulse') {
      const impulsed = applyImpulse({ ...motion, trauma, kick, kickAgeMs }, shot.trauma, shot.direction);
      trauma = impulsed.trauma;
      kick = impulsed.kick;
      kickAgeMs = impulsed.kickAgeMs;
    } else if (shotElapsedMs < shot.durationMs) {
      break;
    } else {
      if (shot.kind === 'focus') nextCamera = focusCamera(shot, shotFrom ?? nextCamera, input, 1);
      shotElapsedMs -= shot.durationMs;
    }
    shots = shots.slice(1);
    shotFrom = undefined;
  }

  const running = shots[0];
  if (running && running.kind === 'focus') {
    shotFrom ??= nextCamera;
    const progress = running.durationMs <= 0 ? 1 : shotElapsedMs / running.durationMs;
    nextCamera = focusCamera(running, shotFrom, input, easeProgress(clamp(progress, 0, 1), running.ease));
  } else if (shots.length === 0) {
    if (motion.shots.length > 0) followArmed = motion.followRestore;
    if (followArmed) {
      const target = followWindowTarget(
        nextCamera, input.followPoint, input.viewport, input.mapPixels,
        CAMERA_DEAD_ZONE_RATIO, input.clamp ?? clampCamera,
      );
      const errorX = target.x - nextCamera.x;
      const errorY = target.y - nextCamera.y;
      const errorScreenPx = Math.hypot(errorX, errorY) * nextCamera.zoom;
      if (errorScreenPx > CAMERA_SETTLE_SCREEN_PX && !input.reducedMotion) {
        // Travel at least one screen pixel. Without the floor, a small eased step rounds away on
        // the screen-pixel lattice and the camera stalls short of the target for good.
        const travelPx = Math.max(1, errorScreenPx * (1 - Math.exp(-CAMERA_FOLLOW_DECAY_PER_SECOND * seconds)));
        const ratio = Math.min(1, travelPx / errorScreenPx);
        nextCamera = (input.clamp ?? clampCamera)({
          ...nextCamera,
          x: nextCamera.x + errorX * ratio,
          y: nextCamera.y + errorY * ratio,
        }, input.viewport, input.mapPixels);
      } else if (errorX !== 0 || errorY !== 0) {
        nextCamera = target;
      }
    }
  }

  const noisePhaseMs = motion.noisePhaseMs + deltaMs;
  const kickSpent = (kick.x === 0 && kick.y === 0) || kickAgeMs >= IMPACT_MAX_DURATION_MS;
  const kickFactor = kickSpent ? 0 : Math.exp(-kickAgeMs / KICK_DECAY_MS);
  const shake = trauma * trauma;
  let offset = ZERO_OFFSET;
  if (!input.reducedMotion && (shake > 0 || kickFactor > 0.01)) {
    const phase = noisePhaseMs / 1_000 * SHAKE_FREQUENCY_HZ;
    const offsetX = MAX_SHAKE_WORLD_PX * (shake * valueNoise(SHAKE_NOISE_SEED_X, phase) + kick.x * kickFactor);
    const offsetY = MAX_SHAKE_WORLD_PX * (shake * valueNoise(SHAKE_NOISE_SEED_Y, phase) + kick.y * kickFactor);
    const magnitude = Math.hypot(offsetX, offsetY);
    const scale = magnitude > MAX_SHAKE_WORLD_PX ? MAX_SHAKE_WORLD_PX / magnitude : 1;
    offset = { x: offsetX * scale, y: offsetY * scale };
  }

  // Settled is a sub-pixel threshold, not exact equality: snapping the camera to the screen
  // lattice can leave the focus a fraction outside the window edge, and an equality test would
  // then keep the clock awake forever.
  const settledTarget = followArmed && shots.length === 0
    ? followWindowTarget(
      nextCamera, input.followPoint, input.viewport, input.mapPixels,
      CAMERA_DEAD_ZONE_RATIO, input.clamp ?? clampCamera,
    )
    : nextCamera;
  const followSettled = Math.hypot(settledTarget.x - nextCamera.x, settledTarget.y - nextCamera.y) *
    nextCamera.zoom <= CAMERA_SETTLE_SCREEN_PX;
  return {
    motion: { ...motion, followArmed, trauma, kick, kickAgeMs, noisePhaseMs, shots, shotElapsedMs, shotFrom },
    camera: sameCamera(camera, nextCamera) ? camera : nextCamera,
    offset,
    active: shots.length > 0 || trauma > 0 || kickFactor > 0.01 || !followSettled,
  };
}

/** Evidence for `#world-camera-motion-state`; the camera label keeps its own grammar. */
export function cameraMotionLabel(motion: CameraMotion): string {
  const shot = motion.shots[0];
  return `Camera follow ${motion.followArmed ? 'armed' : 'suspended'}; shake ${motion.trauma.toFixed(2)}; ` +
    `shot ${shot?.kind ?? 'none'}; queue ${motion.shots.length}`;
}
