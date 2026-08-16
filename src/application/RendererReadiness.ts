import type { RendererReadyReport } from '../../electron/ipc/contracts';
import type { RendererKind } from '../render/renderer-selection';

const EXPECTED_BRIDGE_KEYS = [
  'abortConversation',
  'beginConversation',
  'completeVerbalMissionTurn',
  'confirmVerbalMissionGoal',
  'endConversation',
  'getRuntimeInfo',
  'loadPresentationPreferences',
  'loadSave',
  'migrateSave',
  'readVerbalMissionTurn',
  'reportRendererReady',
  'requestSave',
  'savePresentationPreferences',
  'sendConversationTurn',
] as const;

export type RendererReadinessMeasurements = Readonly<{
  appUrl: string;
  assetsLoaded: boolean;
  bridgeKeys: readonly string[];
  canvasHeight: number;
  canvasWidth: number;
  nodeAccessBlocked: boolean;
}>;

function validateCommon(measurements: Omit<RendererReadinessMeasurements, 'canvasHeight' | 'canvasWidth'>): void {
  if (measurements.appUrl !== 'app://game/') {
    throw new Error('Renderer is not at the packaged app root.');
  }
  if (!measurements.assetsLoaded) {
    throw new Error('Packaged renderer assets are not ready.');
  }
  if (!measurements.nodeAccessBlocked) {
    throw new Error('A Node global is visible in the renderer.');
  }
  if (
    measurements.bridgeKeys.length !== EXPECTED_BRIDGE_KEYS.length ||
    !EXPECTED_BRIDGE_KEYS.every((key, index) => measurements.bridgeKeys[index] === key)
  ) {
    throw new Error('Desktop bridge surface does not match the locked contract.');
  }
}

export function createRendererShellReadyReport(
  measurements: Omit<RendererReadinessMeasurements, 'canvasHeight' | 'canvasWidth'>,
): RendererReadyReport {
  validateCommon(measurements);
  return {
    schemaVersion: 2,
    phase: 'shell',
    appUrl: measurements.appUrl,
    assetsLoaded: true,
    bridgeKeys: [...EXPECTED_BRIDGE_KEYS] as [...typeof EXPECTED_BRIDGE_KEYS],
    nodeAccessBlocked: true,
    shellReady: true,
  };
}

export function createRendererWorldReadyReport(
  measurements: RendererReadinessMeasurements & Readonly<{
    rendererKind: RendererKind;
    webgl2Ready?: boolean;
    /**
     * Set only when the renderer has actually presented a world frame. Previously worldFrameReady
     * was synthesised as true from a positive canvas size, so a renderer that never drew could
     * still ship a schema-valid ready report.
     */
    worldFramePresented?: boolean;
  }>,
): RendererReadyReport {
  validateCommon(measurements);
  if (measurements.canvasWidth <= 0 || measurements.canvasHeight <= 0) {
    throw new Error('The world renderer did not create a measurable canvas.');
  }
  const common = {
    schemaVersion: 2 as const,
    phase: 'world' as const,
    appUrl: measurements.appUrl,
    assetsLoaded: true as const,
    bridgeKeys: [...EXPECTED_BRIDGE_KEYS] as [...typeof EXPECTED_BRIDGE_KEYS],
    nodeAccessBlocked: true as const,
    worldFrameReady: true as const,
  };
  if (measurements.worldFramePresented !== true) {
    throw new Error('The world renderer has not presented a frame, so world readiness is unproven.');
  }
  if (measurements.webgl2Ready !== true) throw new Error('Three.js did not create a WebGL 2 context.');
  return { ...common, rendererKind: 'threejs-2d', webgl2Ready: true };
}
