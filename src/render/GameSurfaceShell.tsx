import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { getDesktopBridge } from '../application/DesktopBridge';
import { createRendererShellReadyReport, createRendererWorldReadyReport } from '../application/RendererReadiness';

// The Skia modules read global.CanvasKit when their module body evaluates, so the game screen
// must stay behind a dynamic import until CanvasKit has loaded on the temporary Skia path.
// WithSkiaWeb provided this property before Stage 5; keeping it is what lets the Three.js path
// skip CanvasKit entirely without breaking the Skia path.
const LazyDevHarnessScreen = lazy(async () => ({
  default: (await import('../ui/dev-harness/DevHarnessScreen')).DevHarnessScreen,
}));
const LazyGameScreen = lazy(async () => ({ default: (await import('../application/GameScreen')).GameScreen }));
import { OUTER_MARGIN, responsiveSurface, SURFACE_BORDER } from './responsive-layout';
import type { ViewportSize } from './camera';
import { selectedRenderer } from './renderer-selection';

function hasNoNodeAccess(): boolean {
  const candidate = globalThis as typeof globalThis & {
    Buffer?: unknown;
    module?: unknown;
    require?: unknown;
  };
  return (
    typeof candidate.require === 'undefined' &&
    typeof candidate.module === 'undefined' &&
    typeof candidate.Buffer === 'undefined'
  );
}

function localhostDevHarnessMode(): boolean {
  if (typeof window === 'undefined') return false;
  const localHost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
  return localHost && new URLSearchParams(window.location.search).get('devHarness') === '1';
}

type GameSurfaceShellProps = Readonly<{
  assetsLoaded: boolean;
}>;

function afterNextPaint(): Promise<void> {
  return new Promise((resolvePaint) => requestAnimationFrame(() => resolvePaint()));
}

async function afterTwoPaints(): Promise<void> {
  await afterNextPaint();
  await afterNextPaint();
}

/**
 * Stage 5: the renderer-neutral game-surface shell. It replaces SkiaProof and the root
 * WithSkiaWeb mount, so the default shipping path never loads CanvasKit. The surface backdrop
 * was a Skia Canvas drawing a single solid rect, which a plain View reproduces exactly.
 * Readiness reporting, surface measurement, dev-harness routing and the public proof-node IDs
 * keep their existing meaning.
 */
export default function GameSurfaceShell({ assetsLoaded }: GameSurfaceShellProps) {
  const devHarnessMode = typeof window !== 'undefined' && (
    window.siWorldDevHarnessMode === true || localhostDevHarnessMode()
  );
  const windowDimensions = useWindowDimensions();
  const rendererKind = selectedRenderer();
  const [surface, setSurface] = useState<ViewportSize>(() => responsiveSurface(
    Math.max(1, windowDimensions.width),
    Math.max(1, windowDimensions.height),
  ).surface);
  const [runtime, setRuntime] = useState('Browser proof');
  const [worldReady, setWorldReady] = useState(false);
  const reportedShell = useRef(false);
  const reportedWorld = useRef(false);
  const markWorldReady = useCallback(() => setWorldReady(true), []);

  useEffect(() => {
    if (devHarnessMode) markWorldReady();
  }, [devHarnessMode, markWorldReady]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge || !assetsLoaded || reportedShell.current) return;
    reportedShell.current = true;
    const common = {
      appUrl: window.location.href,
      assetsLoaded,
      bridgeKeys: Object.keys(window.siWorldDesktop ?? {}).sort(),
      nodeAccessBlocked: hasNoNodeAccess(),
    };
    void afterTwoPaints()
      .then(async () => {
        const report = createRendererShellReadyReport(common);
        return Promise.all([bridge.getRuntimeInfo(), bridge.reportRendererReady(report)]);
      })
      .then(([info]) => setRuntime(`Electron ${info.electronVersion} · sandboxed`))
      .catch((error: unknown) => {
        reportedShell.current = false;
        const detail = error instanceof Error ? error.message : String(error);
        setRuntime(`Desktop bridge rejected shell readiness: ${detail}`);
        console.error(`SI_WORLD_RENDERER_READY_FAILURE ${detail}`);
      });
  }, [assetsLoaded]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge || !worldReady || reportedWorld.current || devHarnessMode) return;
    reportedWorld.current = true;
    void afterTwoPaints()
      .then(() => {
        // Only the renderer's own canvas may answer for readiness.
        //
        // The previous lookup fell back to the largest visible canvas, so a leftover or default
        // surface could satisfy the size check. Worse, getContext('webgl2') CREATES a context when
        // none exists, so probing an unrelated canvas both invented the evidence and could pin a
        // default context that made the renderer's own later getContext fail. Asking the canvas the
        // renderer already configured returns that same context and creates nothing.
        const canvas = document.querySelector<HTMLCanvasElement>('#threejs-world-canvas canvas');
        if (!canvas) {
          reportedWorld.current = false;
          throw new Error('The world renderer canvas is not mounted, so world readiness is unproven.');
        }
        const report = createRendererWorldReadyReport({
          appUrl: window.location.href,
          assetsLoaded,
          bridgeKeys: Object.keys(window.siWorldDesktop ?? {}).sort(),
          canvasHeight: canvas.height,
          canvasWidth: canvas.width,
          nodeAccessBlocked: hasNoNodeAccess(),
          rendererKind,
          // worldReady is set by the renderer surface after it presents, so this is measured.
          worldFramePresented: worldReady,
          // Both renderers require WebGL 2, so the renderer-kind check added nothing and reported
          // false for every 2.5D run.
          webgl2Ready: canvas.getContext('webgl2') !== null,
        });
        return bridge.reportRendererReady(report);
      })
      .catch((error: unknown) => {
        reportedWorld.current = false;
        const detail = error instanceof Error ? error.message : String(error);
        setRuntime(`Desktop bridge rejected world readiness: ${detail}`);
        console.error(`SI_WORLD_RENDERER_READY_FAILURE ${detail}`);
      });
  }, [assetsLoaded, devHarnessMode, rendererKind, worldReady]);

  const measureSurface = useCallback((event: LayoutChangeEvent) => {
    const width = Math.max(1, Math.floor(event.nativeEvent.layout.width));
    const height = Math.max(1, Math.floor(event.nativeEvent.layout.height));
    setSurface((current) => current.width === width && current.height === height ? current : { width, height });
  }, []);

  return (
    <View style={styles.screen}>
      <View
        nativeID="active-surface-canvas"
        pointerEvents="none"
        style={StyleSheet.flatten([styles.surfaceCanvas, surface])}
      />
      <View style={styles.surfaceFrame}>
        <View nativeID="active-game-surface" onLayout={measureSurface} style={styles.surface}>
          {devHarnessMode
            ? (
              <Suspense fallback={null}>
                <LazyDevHarnessScreen surface={surface} />
              </Suspense>
            )
            : (
              <Suspense fallback={null}>
                <LazyGameScreen onWorldReady={markWorldReady} rendererKind={rendererKind} surface={surface} />
              </Suspense>
            )}
        </View>
      </View>
      {__DEV__ ? <Text nativeID="development-runtime" style={styles.runtime}>{runtime}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  runtime: {
    color: '#7f9784',
    fontFamily: 'Silkscreen',
    fontSize: 12,
    bottom: 4,
    position: 'absolute',
    right: 12,
  },
  surfaceCanvas: {
    backgroundColor: '#17201b',
    left: OUTER_MARGIN + SURFACE_BORDER,
    position: 'absolute',
    top: OUTER_MARGIN + SURFACE_BORDER,
  },
  screen: {
    alignItems: 'center',
    backgroundColor: '#17201b',
    flex: 1,
    padding: OUTER_MARGIN,
  },
  surface: { flex: 1, minHeight: 1, minWidth: 1, width: '100%' },
  surfaceFrame: {
    borderColor: '#0f1412',
    borderWidth: SURFACE_BORDER,
    flex: 1,
    overflow: 'hidden',
    width: '100%',
  },
});
