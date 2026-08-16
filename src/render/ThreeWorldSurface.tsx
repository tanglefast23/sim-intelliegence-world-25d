import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Asset } from 'expo-asset';

import type { ViewportSize } from './camera';
import type { WorldFrameState } from './world-frame';
import { selectedRenderer, selectedToneMapping, selectedYawDegrees } from './renderer-selection';
import { ThreeWorldRenderer } from './three/world-renderer';
import { createWorldRenderer25, type WorldRenderer25 } from './three25/world-renderer-25';

const atlasImage = require('../../assets/generated/world-atlas.png') as number;

/**
 * The two renderers share these three methods and nothing else. `evidence()` is deliberately
 * excluded: the shapes differ, so it is published inside the construction branch rather than
 * called back through this ref.
 */
type MountedRenderer = Pick<ThreeWorldRenderer, 'setFrame' | 'start' | 'dispose'>;

export function ThreeWorldSurface({
  frame,
  onContextStateChange,
  onReady,
  surface,
}: Readonly<{
  frame: WorldFrameState;
  onContextStateChange: (state: 'lost' | 'restored' | 'timed-out') => void;
  onReady: () => void;
  /**
   * The real surface, in CSS pixels. Not `frame.viewport`: on the 2.5D path the frame request is
   * deliberately inflated so the cull window covers the tilted footprint.
   */
  surface: ViewportSize;
}>) {
  const frameRef = useRef(frame);
  const rendererRef = useRef<MountedRenderer | undefined>(undefined);
  const onReadyRef = useRef(onReady);
  const onContextStateChangeRef = useRef(onContextStateChange);
  const surfaceRef = useRef(surface);
  frameRef.current = frame;
  onReadyRef.current = onReady;
  onContextStateChangeRef.current = onContextStateChange;
  surfaceRef.current = surface;

  useEffect(() => {
    const host = document.querySelector('#threejs-world-canvas');
    if (!(host instanceof HTMLElement)) throw new Error('Three.js canvas host is missing.');
    const canvas = document.createElement('canvas');
    const kind = selectedRenderer();
    canvas.setAttribute('aria-label', kind === 'threejs-2-5d' ? 'Three.js 2.5D world canvas' : 'Three.js 2D world canvas');
    canvas.style.display = 'block';
    canvas.style.height = '100%';
    canvas.style.width = '100%';
    host.append(canvas);
    let disposed = false;
    const local = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const matchLegacyColors = window.siWorldSmokeMode === true || local;
    const atlasUrl = Asset.fromModule(atlasImage).uri;
    const created: Promise<MountedRenderer> = kind === 'threejs-2-5d'
      ? createWorldRenderer25(
        canvas,
        atlasUrl,
        () => surfaceRef.current,
        () => onReadyRef.current(),
        (state) => onContextStateChangeRef.current(state),
        selectedToneMapping(),
        { yawDegrees: selectedYawDegrees() },
      )
      : ThreeWorldRenderer.create(
        canvas,
        atlasUrl,
        matchLegacyColors,
        () => onReadyRef.current(),
        (state) => onContextStateChangeRef.current(state),
        selectedToneMapping(),
      );
    void created.then((renderer) => {
      if (disposed) {
        renderer.dispose();
        return;
      }
      rendererRef.current = renderer;
      renderer.setFrame(frameRef.current);
      renderer.start();
      if (window.siWorldSmokeMode === true || local) {
        if (kind === 'threejs-2-5d') {
          window.siWorld25dEvidence = () => (renderer as WorldRenderer25).evidence();
        } else {
          window.siWorldThreeRendererEvidence = () => (renderer as ThreeWorldRenderer).evidence();
        }
      }
    }).catch((error: unknown) => {
      if (!disposed) onContextStateChangeRef.current('timed-out');
      console.error(`SI_WORLD_THREE_RENDERER_FAILURE ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => {
      disposed = true;
      delete window.siWorldThreeRendererEvidence;
      delete window.siWorld25dEvidence;
      rendererRef.current?.dispose();
      rendererRef.current = undefined;
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setFrame(frame);
  }, [frame]);

  return <View nativeID="threejs-world-canvas" pointerEvents="none" style={styles.canvas} />;
}

const styles = StyleSheet.create({
  canvas: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
});
