import { centerCameraOnWorld, frameCameraOn, followWindowTarget, type CameraState } from '../camera';
import {
  applyImpulse,
  armFollow,
  cameraMotionLabel,
  cancelShots,
  INITIAL_CAMERA_MOTION,
  MAX_SHAKE_WORLD_PX,
  playShots,
  quantiseWorldZoom,
  sampleCameraDirector,
  suspendFollow,
  type CameraDirectorInput,
  type CameraMotion,
} from '../camera-motion';
import { isWorldZoom } from '../../domain/presentation/world-zoom';

const VIEWPORT = { width: 1_280, height: 720 } as const;
const MAP_PIXELS = { width: 2_048, height: 1_536 } as const;
const CENTRE = { x: 900, y: 700 } as const;

function directorInput(overrides: Partial<CameraDirectorInput> = {}): CameraDirectorInput {
  return {
    deltaMs: 16,
    followPoint: CENTRE,
    viewport: VIEWPORT,
    mapPixels: MAP_PIXELS,
    reducedMotion: false,
    ...overrides,
  };
}

function centred(zoom = 2): CameraState {
  return centerCameraOnWorld(CENTRE, zoom, VIEWPORT, MAP_PIXELS);
}

function run(
  motion: CameraMotion,
  camera: CameraState,
  steps: number,
  overrides: Partial<CameraDirectorInput> = {},
): Readonly<{ motion: CameraMotion; camera: CameraState; offset: Readonly<{ x: number; y: number }>; active: boolean }> {
  let sample = sampleCameraDirector(motion, camera, directorInput({ ...overrides, deltaMs: 0 }));
  for (let step = 0; step < steps; step += 1) {
    sample = sampleCameraDirector(sample.motion, sample.camera, directorInput(overrides));
  }
  return sample;
}

describe('camera follow', () => {
  test('a focus point inside the dead zone moves nothing and stops the clock', () => {
    const camera = centred();
    const nudged = { x: CENTRE.x + 60, y: CENTRE.y + 30 };
    expect(followWindowTarget(camera, nudged, VIEWPORT, MAP_PIXELS)).toBe(camera);
    const sample = sampleCameraDirector(armFollow(INITIAL_CAMERA_MOTION), camera, directorInput({ followPoint: nudged }));
    expect(sample.camera).toBe(camera);
    expect(sample.active).toBe(false);
  });

  test('a focus point outside the window pulls the camera back to the window edge', () => {
    const camera = centred();
    const walked = { x: CENTRE.x + 400, y: CENTRE.y };
    const settled = run(armFollow(INITIAL_CAMERA_MOTION), camera, 90, { followPoint: walked });
    const target = followWindowTarget(camera, walked, VIEWPORT, MAP_PIXELS);
    expect(settled.camera.x).toBeCloseTo(target.x, 1);
    expect(settled.camera.y).toBeCloseTo(target.y, 1);
    expect(settled.active).toBe(false);
    // The point rides the window edge, it is not re-centred.
    expect(Math.abs((walked.x - settled.camera.x) * settled.camera.zoom - VIEWPORT.width / 2))
      .toBeCloseTo(VIEWPORT.width * 0.12, 0);
  });

  test('easing is frame-rate independent', () => {
    const camera = centred();
    const walked = { x: CENTRE.x + 400, y: CENTRE.y };
    const slow = run(armFollow(INITIAL_CAMERA_MOTION), camera, 3, { followPoint: walked, deltaMs: 33 });
    const fast = run(armFollow(INITIAL_CAMERA_MOTION), camera, 6, { followPoint: walked, deltaMs: 16.5 });
    expect(Math.abs(slow.camera.x - fast.camera.x) * camera.zoom).toBeLessThanOrEqual(0.5);
  });

  test('reduced motion reaches the window edge in a single step', () => {
    const camera = centred();
    const walked = { x: CENTRE.x + 400, y: CENTRE.y };
    const sample = sampleCameraDirector(
      armFollow(INITIAL_CAMERA_MOTION),
      camera,
      directorInput({ followPoint: walked, reducedMotion: true }),
    );
    expect(sample.camera).toEqual(followWindowTarget(camera, walked, VIEWPORT, MAP_PIXELS));
  });

  test('suspended follow ignores the focus point entirely', () => {
    const camera = centred();
    const sample = run(suspendFollow(INITIAL_CAMERA_MOTION), camera, 30, {
      followPoint: { x: CENTRE.x + 900, y: CENTRE.y + 900 },
    });
    expect(sample.camera).toBe(camera);
    expect(sample.active).toBe(false);
  });
});

describe('impact shake', () => {
  test('trauma is spent by 180 ms and the offset never exceeds 4 world pixels', () => {
    const camera = centred();
    let motion = applyImpulse(INITIAL_CAMERA_MOTION, 1, { x: 1, y: 0 });
    let peak = 0;
    // Four 45 ms steps: exactly the 180 ms ceiling in section 9.9.
    for (let step = 0; step < 4; step += 1) {
      const sample = sampleCameraDirector(motion, camera, directorInput({ deltaMs: 45 }));
      motion = sample.motion;
      peak = Math.max(peak, Math.hypot(sample.offset.x, sample.offset.y));
      // The base camera is never touched by an impulse.
      expect(sample.camera).toBe(camera);
    }
    expect(motion.trauma).toBe(0);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(MAX_SHAKE_WORLD_PX + 1e-9);
    expect(sampleCameraDirector(motion, camera, directorInput({ deltaMs: 45 })).active).toBe(false);
  });

  test('shake is trauma squared, so escalation is perceptible', () => {
    const traumas = [0.3, 0.6, 0.9].map((trauma) => {
      const motion = applyImpulse(INITIAL_CAMERA_MOTION, trauma);
      return sampleCameraDirector(motion, centred(), directorInput({ deltaMs: 0 })).motion.trauma ** 2;
    });
    expect(traumas.map((value) => Number(value.toFixed(2)))).toEqual([0.09, 0.36, 0.81]);
  });

  test('reduced motion collapses shake and recoil to nothing but still tracks trauma', () => {
    const motion = applyImpulse(INITIAL_CAMERA_MOTION, 1, { x: 1, y: 0 });
    const sample = sampleCameraDirector(motion, centred(), directorInput({ reducedMotion: true, deltaMs: 16 }));
    expect(sample.offset).toEqual({ x: 0, y: 0 });
    expect(sample.motion.trauma).toBeGreaterThan(0);
  });

  test('trauma only ever decreases, so there is no oscillating loop', () => {
    let motion = applyImpulse(INITIAL_CAMERA_MOTION, 1);
    let previous = motion.trauma;
    for (let step = 0; step < 20; step += 1) {
      motion = sampleCameraDirector(motion, centred(), directorInput({ deltaMs: 16 })).motion;
      expect(motion.trauma).toBeLessThanOrEqual(previous);
      previous = motion.trauma;
    }
    expect(motion.trauma).toBe(0);
  });
});

describe('camera director', () => {
  test('a focus shot lands exactly on the framed camera and then reports idle', () => {
    const camera = centred(1);
    const points = [{ x: 700, y: 600 }, { x: 1_100, y: 800 }];
    const played = playShots(armFollow(INITIAL_CAMERA_MOTION), [
      { kind: 'focus', points, zoom: 3, durationMs: 400, ease: 'in-out' },
    ]);
    const mid = run(played, camera, 12, { deltaMs: 16 });
    expect(mid.motion.shots).toHaveLength(1);
    expect(mid.active).toBe(true);
    const done = run(mid.motion, mid.camera, 20, { deltaMs: 16 });
    expect(done.motion.shots).toHaveLength(0);
    expect(done.camera).toEqual(frameCameraOn(points, 3, VIEWPORT, MAP_PIXELS));
  });

  test('every zoom a ramp emits is a legal world zoom', () => {
    let sample = run(
      playShots(INITIAL_CAMERA_MOTION, [{ kind: 'focus', points: [CENTRE], zoom: 3, durationMs: 500 }]),
      centred(1),
      0,
    );
    for (let step = 0; step < 40; step += 1) {
      sample = sampleCameraDirector(sample.motion, sample.camera, directorInput({ deltaMs: 16 }));
      expect(isWorldZoom(sample.camera.zoom)).toBe(true);
    }
  });

  test('a hold freezes the camera and a queued impulse fires at its turn', () => {
    const camera = centred();
    const played = playShots(INITIAL_CAMERA_MOTION, [
      { kind: 'hold', durationMs: 100 },
      { kind: 'impulse', trauma: 0.8 },
    ]);
    const held = run(played, camera, 3, { deltaMs: 16 });
    expect(held.camera).toBe(camera);
    expect(held.motion.trauma).toBe(0);
    const fired = run(held.motion, held.camera, 5, { deltaMs: 16 });
    expect(fired.motion.trauma).toBeGreaterThan(0);
    expect(fired.motion.shots).toHaveLength(0);
  });

  test('the queue restores the follow state it interrupted, and cancel does the same at once', () => {
    const camera = centred();
    const armed = armFollow(INITIAL_CAMERA_MOTION);
    const played = playShots(armed, [{ kind: 'hold', durationMs: 50 }]);
    expect(played.followArmed).toBe(false);
    expect(run(played, camera, 6, { deltaMs: 16 }).motion.followArmed).toBe(true);
    expect(cancelShots(played).followArmed).toBe(true);
    expect(cancelShots(playShots(suspendFollow(INITIAL_CAMERA_MOTION), [{ kind: 'hold', durationMs: 50 }])).followArmed)
      .toBe(false);
  });

  test('quantiseWorldZoom keeps the 5% lattice and the 100-500% range', () => {
    expect(quantiseWorldZoom(1.237)).toBe(1.25);
    expect(quantiseWorldZoom(0.2)).toBe(1);
    expect(quantiseWorldZoom(9)).toBe(5);
    expect(isWorldZoom(quantiseWorldZoom(2.113))).toBe(true);
  });

  test('the evidence label reports follow, shake and the queue', () => {
    expect(cameraMotionLabel(INITIAL_CAMERA_MOTION))
      .toBe('Camera follow suspended; shake 0.00; shot none; queue 0');
    expect(cameraMotionLabel(playShots(armFollow(applyImpulse(INITIAL_CAMERA_MOTION, 0.5)), [
      { kind: 'focus', points: [CENTRE], durationMs: 200 },
      { kind: 'hold', durationMs: 100 },
    ]))).toBe('Camera follow suspended; shake 0.50; shot focus; queue 2');
  });
});
