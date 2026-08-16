import { createRendererShellReadyReport, createRendererWorldReadyReport } from '../RendererReadiness';

const commonMeasurements = {
  appUrl: 'app://game/',
  assetsLoaded: true,
  bridgeKeys: [
    'abortConversation', 'beginConversation', 'completeVerbalMissionTurn', 'confirmVerbalMissionGoal',
    'endConversation', 'getRuntimeInfo',
    'loadPresentationPreferences', 'loadSave', 'migrateSave', 'readVerbalMissionTurn',
    'reportRendererReady', 'requestSave', 'savePresentationPreferences', 'sendConversationTurn',
  ],
  nodeAccessBlocked: true,
} as const;

describe('renderer readiness measurements', () => {
  test('creates the shell report before a world canvas exists', () => {
    expect(createRendererShellReadyReport(commonMeasurements)).toEqual({
      ...commonMeasurements,
      bridgeKeys: [...commonMeasurements.bridgeKeys],
      schemaVersion: 2,
      phase: 'shell',
      shellReady: true,
    });
  });

  // The report echoes the measured renderer kind. Both renderers need a real WebGL 2 context and
  // a presented frame, so those two stay literal.
  test.each([
    {
      rendererKind: 'threejs-2d' as const,
      webgl2Ready: true,
      worldFramePresented: true,
      expected: { rendererKind: 'threejs-2d', webgl2Ready: true },
    },
    {
      rendererKind: 'threejs-2-5d' as const,
      webgl2Ready: true,
      worldFramePresented: true,
      expected: { rendererKind: 'threejs-2-5d', webgl2Ready: true },
    },
  ])('creates the strict $rendererKind world report', ({ expected, ...renderer }) => {
    expect(createRendererWorldReadyReport({
      ...commonMeasurements,
      canvasHeight: 160,
      canvasWidth: 320,
      ...renderer,
    })).toEqual({
      ...commonMeasurements,
      bridgeKeys: [...commonMeasurements.bridgeKeys],
      schemaVersion: 2,
      phase: 'world',
      worldFrameReady: true,
      ...expected,
    });
  });

  test.each([
    { ...commonMeasurements, assetsLoaded: false },
    { ...commonMeasurements, nodeAccessBlocked: false },
    { ...commonMeasurements, appUrl: 'https://example.com/' },
    { ...commonMeasurements, bridgeKeys: ['getRuntimeInfo'] },
  ])('rejects incomplete or untrusted shell measurements', (measurements) => {
    expect(() => createRendererShellReadyReport(measurements)).toThrow();
  });

  test('rejects empty canvases and missing WebGL 2', () => {
    expect(() => createRendererWorldReadyReport({
      ...commonMeasurements,
      canvasHeight: 160,
      canvasWidth: 0,
      rendererKind: 'threejs-2d',
    })).toThrow('measurable canvas');
    expect(() => createRendererWorldReadyReport({
      ...commonMeasurements,
      canvasHeight: 160,
      canvasWidth: 320,
      rendererKind: 'threejs-2d',
      worldFramePresented: true,
    })).toThrow('WebGL 2');

    // A renderer that never drew must not be able to report world readiness.
    expect(() => createRendererWorldReadyReport({
      ...commonMeasurements,
      canvasHeight: 160,
      canvasWidth: 320,
      rendererKind: 'threejs-2d',
      webgl2Ready: true,
    })).toThrow('has not presented a frame');
  });
});
