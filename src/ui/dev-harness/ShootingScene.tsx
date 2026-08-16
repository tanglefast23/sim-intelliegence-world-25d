import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { WORLD_MAP_CATALOG } from '../../application/runtime/map-catalog';
import { useReducedMotion } from '../../application/accessibility';
import { parseWorldState } from '../../domain/state/schema';
import { createInitialState } from '../../domain/state/initial-state';
import type { ViewportSize } from '../../render/camera';
import { ThreeWorldSurface } from '../../render/ThreeWorldSurface';
import { sampleTransientVfx } from '../../render/vfx/transient';
import { buildWorldFrameState, type WorldActors } from '../../render/world-frame';
import {
  buildShootingSceneTrace,
  officerAt,
  protagonistAt,
  shootingSceneAbsoluteMinute,
  shootingSceneCameraAt,
  shootingSceneCues,
  shootingScenePalette,
  initialShootingSceneCameraStep,
  stepShootingSceneCamera,
  OFFICER_TILE,
  PROTAGONIST_TILE,
  SCENE_TOTAL_MS,
  SHOOTING_SCENE_MAP_ID,
  type ShootingSceneVariant,
} from './shooting-scene';

/**
 * The scripted shooting scene, rendered.
 *
 * It builds its own frames through `buildWorldFrameState` and hands them to `ThreeWorldSurface`,
 * so it never mounts `WorldScene` and needs no runtime, save or persistence. Every beat it needs —
 * actor pose, poseProgress, poseDirection, camera, absolute minute — is already a parameter of
 * `buildWorldFrameState`, so this component adds no new rendering surface.
 *
 * The timeline itself lives in `shooting-scene.ts` and is asserted there. This file only turns a
 * clock into calls on it.
 */
export function ShootingScene({
  surface,
  variant,
}: Readonly<{ surface: ViewportSize; variant: ShootingSceneVariant }>) {
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = variant === 'reduced-motion' || systemReducedMotion;
  const [elapsedMs, setElapsedMs] = useState(0);
  const stepRef = useRef(initialShootingSceneCameraStep(surface, reducedMotion));
  /** Set by `siWorldPinShootingScene`; freezes the scene at one instant for a capture. */
  const pinnedMs = useRef<number | undefined>(undefined);

  const map = WORLD_MAP_CATALOG[SHOOTING_SCENE_MAP_ID];
  const absoluteMinute = shootingSceneAbsoluteMinute(variant);
  const cues = useMemo(() => shootingSceneCues(), []);
  const palette = useMemo(() => shootingScenePalette(variant), [variant]);

  const state = useMemo(() => {
    const initial = createInitialState('DEV PLAYER');
    return parseWorldState({
      ...initial,
      clock: { ...initial.clock, absoluteMinute, selectedSpeed: 0 },
      protagonist: {
        ...initial.protagonist,
        locationId: SHOOTING_SCENE_MAP_ID,
        worldPosition: {
          mapId: SHOOTING_SCENE_MAP_ID,
          tileX: PROTAGONIST_TILE.x,
          tileY: PROTAGONIST_TILE.y,
        },
      },
      npcs: Object.fromEntries(Object.entries(initial.npcs).map(([id, npc]) => [
        id,
        id === 'tomas_reed'
          ? {
            ...npc,
            presence: {
              kind: 'active_local',
              mapId: SHOOTING_SCENE_MAP_ID,
              locationId: SHOOTING_SCENE_MAP_ID,
              tileX: OFFICER_TILE.x,
              tileY: OFFICER_TILE.y,
            },
          }
          : npc,
      ])),
    });
  }, [absoluteMinute]);

  // Reset when the case changes, so switching variants replays from the top.
  useEffect(() => {
    stepRef.current = initialShootingSceneCameraStep(surface, reducedMotion);
    pinnedMs.current = undefined;
    setElapsedMs(0);
  }, [reducedMotion, surface, variant]);

  /**
   * Lets a capture step the scene instead of watching it.
   *
   * `requestAnimationFrame` is throttled to a standstill in a hidden or backgrounded window, which
   * is exactly where every screenshot is taken, so a scene that only advances on rAF cannot be
   * captured at all. `window.siWorldPinShootingScene(ms)` pins the scene to one instant. Same
   * idiom as the eight existing `siWorld*Fixture` hooks on WorldScene.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.siWorldPinShootingScene = (timeMs) => {
      const pinned = Math.max(0, Math.min(SCENE_TOTAL_MS, timeMs));
      pinnedMs.current = pinned;
      setElapsedMs(pinned);
      return pinned;
    };
    return () => {
      delete window.siWorldPinShootingScene;
    };
  }, []);

  useEffect(() => {
    if (pinnedMs.current !== undefined) return undefined;
    let animationFrame = 0;
    let previousTime: number | undefined;
    let sceneMs = 0;
    const animate = (time: number) => {
      if (pinnedMs.current !== undefined) return;
      const rawDelta = previousTime === undefined ? 0 : Math.min(50, time - previousTime);
      previousTime = time;
      // Loops, so the scene can be watched repeatedly without reloading the harness.
      sceneMs = sceneMs + rawDelta > SCENE_TOTAL_MS ? 0 : sceneMs + rawDelta;
      if (sceneMs === 0) stepRef.current = initialShootingSceneCameraStep(surface, reducedMotion);
      stepRef.current = stepShootingSceneCamera(stepRef.current, sceneMs, rawDelta, surface, reducedMotion);
      setElapsedMs(sceneMs);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [reducedMotion, surface]);

  // A pinned scene replays the camera from zero, so the captured frame carries the zoom and shake
  // it would have had at that instant rather than the camera's start state.
  const pinnedCamera = useMemo(
    () => pinnedMs.current === undefined ? undefined : shootingSceneCameraAt(elapsedMs, surface, reducedMotion),
    [elapsedMs, reducedMotion, surface],
  );

  const frame = useMemo(() => {
    const officer = officerAt(elapsedMs);
    const protagonist = protagonistAt(elapsedMs);
    const vfx = sampleTransientVfx(cues, elapsedMs, reducedMotion, palette);
    const actors: WorldActors = {
      tomas_reed: {
        tile: OFFICER_TILE,
        visualId: 'tomas-reed',
        direction: 'left',
        pose: officer.pose,
        poseProgress: officer.poseProgress,
        poseDirection: officer.poseDirection,
        reducedMotion,
      },
    };
    return buildWorldFrameState(map, state, actors, 'right', 0, {
      visualFoot: { x: PROTAGONIST_TILE.x * 32 + 16, y: PROTAGONIST_TILE.y * 32 + 29 },
      walkFrame: 0,
      moving: false,
      reducedMotion,
      pose: protagonist.pose,
      poseProgress: protagonist.poseProgress,
      poseDirection: protagonist.poseDirection,
    }, {
      camera: (pinnedCamera ?? stepRef.current).camera,
      viewport: surface,
      devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
      artMode: 'enhanced',
      movements: [],
      selectedFoot: { x: PROTAGONIST_TILE.x * 32 + 16, y: PROTAGONIST_TILE.y * 32 + 29 },
      destinationPulseElapsedMs: 0,
      reducedMotion,
      animationTimestampMilliseconds: elapsedMs,
      vfxAgeStep: 0,
      vfxMode: 'procedural',
      transientEffects: vfx.rects,
      transientGlows: vfx.glows,
    });
  }, [cues, elapsedMs, map, palette, pinnedCamera, reducedMotion, state, surface]);

  const evidence = useMemo(() => JSON.stringify({
    schemaVersion: 1,
    variant,
    elapsedMs: Math.round(elapsedMs),
    trace: buildShootingSceneTrace(variant).peakRectCount,
    transientRects: frame.transientEffects?.length ?? 0,
    transientGlows: frame.transientGlows?.length ?? 0,
  }), [elapsedMs, frame, variant]);

  return (
    <View nativeID="shooting-scene" style={[styles.root, surface]}>
      <ThreeWorldSurface frame={frame} onContextStateChange={() => undefined} onReady={() => undefined} surface={surface} />
      <View
        accessibilityLabel={evidence}
        nativeID="world-shooting-scene-state"
        pointerEvents="none"
        style={styles.proofState}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative' },
  proofState: { height: 1, opacity: 0, position: 'absolute', width: 1 },
});
