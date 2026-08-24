import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  evaluateRendererFps,
  findPackageArchive,
  findPackagedExecutable,
  parseLoadingShellObserved,
  parseSmokeResult,
  validatePackageListing,
  validateScreenshotBuffers,
  validateWorldZoomBuffers,
} from '../../scripts/electron/package-smoke-utils';
import { resolveEvidenceOutputRoot } from '../../scripts/verification/evidence-output';
import { PNG } from 'pngjs';

import {
  captureLoadingSmokeFrame,
  captureNonEmptySmokeFrame,
  LOADING_SHELL_POLL_MILLISECONDS,
  retrySmokeCapture,
  SMOKE_CAPTURE_RETRY_MILLISECONDS,
  waitForLoadingShell,
} from '../../electron/main/smoke-capture';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function screenshot(width: number, height: number, fill: number): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(fill);
  return PNG.sync.write(png);
}

describe('packaged Electron smoke evidence', () => {
  test('keeps smoke windows hidden, muted, and hidden during capture', () => {
    const main = readFileSync(join(process.cwd(), 'electron/main/index.ts'), 'utf8');
    expect(main).toContain("app.commandLine.appendSwitch('mute-audio')");
    expect(main).toContain("app.commandLine.appendSwitch('force-prefers-no-reduced-motion')");
    expect(main).toContain('show: !smokeMode');
    expect(main).toContain('backgroundThrottling: false');
    expect(main).toContain('window.webContents.setAudioMuted(true)');
    expect(main).toContain('capturePage(undefined, { stayHidden: true })');
    expect(main).toContain('await waitForLoadingShell(loadingVisible, waitForSmokeRetry);');
  });

  test('runs the packaged WebGL 2 probe before renderer asset readiness', () => {
    const main = readFileSync(join(process.cwd(), 'electron/main/index.ts'), 'utf8');
    const runner = readFileSync(join(process.cwd(), 'scripts/electron/run-package-smoke.ts'), 'utf8');
    const responsiveSmoke = readFileSync(join(process.cwd(), 'scripts/electron/run-responsive-package-smoke.ts'), 'utf8');
    expect(main).toContain("window.webContents.on('did-finish-load'");
    expect(main).toContain('void emitWebgl2Probe(window)');
    expect(main).toContain('async function reachWorldTile(');
    expect(main).toContain('async function reachWorldLocation(');
    expect(main).toContain('const WORLD_ROUTE_ATTEMPT_TIMEOUT_MS = 60_000;');
    expect(main).toContain('setTimeout(resolveDelay, coalescedResizeDelay() * 2)');
    expect(main).toContain('Math.abs(Number(measuredSurface?.width) - resizedBounds.width) <= 1');
    expect(main).toContain("document.querySelector('#world-surface-state')?.getAttribute('aria-label')");
    expect(main).toContain('window.siWorldMeasureResponsiveEvidence?.() ?? null');
    expect(main.match(/await window\.webContents\.capturePage\(undefined, \{ stayHidden: true \}\);/gu)).toHaveLength(2);
    expect(main).toContain('for (let attempt = 0; attempt < 2; attempt += 1) {');
    expect(main.match(/await completeAlarmIntroForSmoke\(window\);/gu)).toHaveLength(2);
    expect(main).toContain('window.siWorldAlarmAudioEvidence?.() ?? null');
    expect(main).toContain("contract.dialogLabel !== 'Alarm clock showing 7:00. Hit snooze.'");
    expect(main).toContain("throw new Error('Hidden renderer did not produce two paint frames after two attempts.');");
    expect(main).toContain('while (Date.now() < deadline) {\n    await waitForRendererPaint(window);\n    try {');
    expect(main).toContain("button: 'middle' });\n  await waitForRendererPaint(window);\n  window.webContents.sendInputEvent({ type: 'mouseMove'");
    expect(main).toContain("button: 'middle', clickCount: 1 });\n  await waitForRendererPaint(window);\n  const afterPan");
    expect(main).toContain("type: 'mouseWheel', x: wheelX, y: wheelY, deltaY: 100, canScroll: false");
    expect(main).toContain("canScroll: false,\n  });\n  await waitForRendererPaint(window);\n  const wheelZoom");
    expect(main).toContain('options.timeoutMilliseconds ?? WORLD_ROUTE_ATTEMPT_TIMEOUT_MS');
    expect(main).toContain('destinationTile, WORLD_ROUTE_ATTEMPT_TIMEOUT_MS');
    expect(main.match(/await startMovementSmokeSampling\(window\);/gu)).toHaveLength(2);
    expect(main.match(/await stopMovementSmokeSampling\(window\)/gu)).toHaveLength(2);
    expect(main).toContain('attributeOldValue: true');
    expect(main).toContain('sampler.observer.disconnect()');
    expect(main).toContain('if (attempt === 3) throw error;');
    expect(runner).toContain('const FULL_WORLD_SMOKE_TIMEOUT_MS = 1_200_000;');
    expect(responsiveSmoke).toContain("process.env.SI_WORLD_SMOKE_PROFILE === 'platform-shell'\n  ? 1_200_000\n  : 300_000");
    expect(main).toContain('webgl2ProbeMode ? WEBGL2_PROBE_URL');
    expect(runner).toContain('probe.appUrl !== WEBGL2_PROBE_URL');
    expect(main).toContain('new MutationObserver(recordFeedback)');
    expect(main).toContain("await waitForRendererText(window, '#world-ui-quest-offer-panel', 'MISTAKE');");
    expect(main).toContain("await waitForSelector(window, '#conversation-portrait-linda-ready');");
  });

  test('uses explicit output roots and rejects immutable historical evidence', () => {
    const root = join(tmpdir(), 'si-world-evidence-root');
    expect(resolveEvidenceOutputRoot([], { defaultRelative: 'output/verification/package' }, root))
      .toBe(join(root, 'output/verification/package'));
    expect(resolveEvidenceOutputRoot(
      ['--high-dpi', '--output-root', 'artifacts/phase-24/art-quality/phase-26-foundation'],
      { allowedFlags: ['--high-dpi'] },
      root,
    )).toBe(join(root, 'artifacts/phase-24/art-quality/phase-26-foundation'));
    expect(() => resolveEvidenceOutputRoot(
      ['--output-root', 'artifacts/phase-22/responsive'],
      {},
      root,
    )).toThrow('Historical evidence is immutable');
    expect(() => resolveEvidenceOutputRoot(
      ['artifacts/phase-24/new'],
      {},
      root,
    )).toThrow('Use --output-root');
    expect(() => resolveEvidenceOutputRoot([], { required: true }, root)).toThrow('requires --output-root');
  });

  test('protects the frozen Skia captures under artifacts/threejs-2d', () => {
    // These are the only record of a Skia-versus-Three.js comparison that can no longer be made.
    // Until this guard existed, a capture run pointed here would have overwritten them silently.
    const root = join(tmpdir(), 'si-world-evidence-root');
    expect(() => resolveEvidenceOutputRoot(
      ['--output-root', 'artifacts/threejs-2d/stage-6/captures/all-maps'],
      {},
      root,
    )).toThrow('Historical evidence is immutable');
    expect(() => resolveEvidenceOutputRoot(
      ['--output-root', 'artifacts/threejs-2d'],
      {},
      root,
    )).toThrow('Historical evidence is immutable');
    // The re-baseline root sits outside that tree and must stay writable, or phase 0.1 cannot run.
    expect(resolveEvidenceOutputRoot(
      ['--output-root', 'artifacts/visual-polish/baseline'],
      {},
      root,
    )).toBe(join(root, 'artifacts/visual-polish/baseline'));
  });

  test('passes the requested device scale factor on the packaged process command line', () => {
    const responsiveSmoke = readFileSync(
      join(process.cwd(), 'scripts/electron/run-responsive-package-smoke.ts'),
      'utf8',
    );
    expect(responsiveSmoke).toContain('`--force-device-scale-factor=${requestedDeviceScaleFactor}`');
    expect(responsiveSmoke).toContain("[1, 1.25, 1.5, 2].includes(requestedDeviceScaleFactor)");
  });

  test('selects the current platform and architecture from a multi-target output root', () => {
    const root = mkdtempSync(join(tmpdir(), 'si-world-package-targets-'));
    try {
      const armExecutable = join(root, 'SI World-darwin-arm64', 'SI World.app', 'Contents', 'MacOS', 'si-world');
      const x64Executable = join(root, 'SI World-darwin-x64', 'SI World.app', 'Contents', 'MacOS', 'si-world');
      const armArchive = join(root, 'SI World-darwin-arm64', 'SI World.app', 'Contents', 'Resources', 'app.asar');
      const x64Archive = join(root, 'SI World-darwin-x64', 'SI World.app', 'Contents', 'Resources', 'app.asar');
      for (const file of [armExecutable, x64Executable, armArchive, x64Archive]) {
        mkdirSync(join(file, '..'), { recursive: true });
        writeFileSync(file, 'fixture');
      }
      expect(findPackagedExecutable(root, 'darwin', 'arm64')).toBe(armExecutable);
      expect(findPackagedExecutable(root, 'darwin', 'x64')).toBe(x64Executable);
      expect(findPackageArchive(root, 'darwin', 'arm64')).toBe(armArchive);
      expect(findPackageArchive(root, 'darwin', 'x64')).toBe(x64Archive);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test('selects a cross-architecture package for a release smoke', () => {
    const root = mkdtempSync(join(tmpdir(), 'si-world-package-cross-arch-'));
    const previousArchitecture = process.env.SI_WORLD_PACKAGE_TARGET_ARCH;
    try {
      const executable = join(root, 'SI World-darwin-x64', 'SI World.app', 'Contents', 'MacOS', 'si-world');
      const archive = join(root, 'SI World-darwin-x64', 'SI World.app', 'Contents', 'Resources', 'app.asar');
      for (const file of [executable, archive]) {
        mkdirSync(join(file, '..'), { recursive: true });
        writeFileSync(file, 'fixture');
      }
      process.env.SI_WORLD_PACKAGE_TARGET_ARCH = 'x64';
      expect(findPackagedExecutable(root, 'darwin')).toBe(executable);
      expect(findPackageArchive(root, 'darwin')).toBe(archive);
      process.env.SI_WORLD_PACKAGE_TARGET_ARCH = 'invalid';
      expect(() => findPackagedExecutable(root, 'darwin')).toThrow('Unsupported packaged architecture');
    } finally {
      if (previousArchitecture === undefined) delete process.env.SI_WORLD_PACKAGE_TARGET_ARCH;
      else process.env.SI_WORLD_PACKAGE_TARGET_ARCH = previousArchitecture;
      rmSync(root, { force: true, recursive: true });
    }
  });

  test('retries transient screenshot failures but keeps a bounded failure', async () => {
    let attempts = 0;
    const waits: number[] = [];
    await expect(retrySmokeCapture(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('UnknownVizError');
        return 'captured';
      },
      async (milliseconds) => { waits.push(milliseconds); },
    )).resolves.toBe('captured');
    expect(attempts).toBe(3);
    expect(waits).toEqual([SMOKE_CAPTURE_RETRY_MILLISECONDS, SMOKE_CAPTURE_RETRY_MILLISECONDS]);

    let failedAttempts = 0;
    await expect(retrySmokeCapture(
      async () => {
        failedAttempts += 1;
        throw new Error('permanent');
      },
      async () => undefined,
      { maximumAttempts: 2 },
    )).rejects.toThrow('failed after 2 attempts');
    expect(failedAttempts).toBe(2);
  });

  test('rejects empty frames and never accepts a late non-loading frame', async () => {
    let emptyAttempts = 0;
    await expect(captureNonEmptySmokeFrame(
      async () => ({ isEmpty: () => ++emptyAttempts < 3 }),
      async () => undefined,
    )).resolves.toEqual(expect.objectContaining({ isEmpty: expect.any(Function) }));
    expect(emptyAttempts).toBe(3);

    await expect(captureNonEmptySmokeFrame(
      async () => ({ isEmpty: () => true }),
      async () => undefined,
      { maximumAttempts: 2 },
    )).rejects.toThrow('Electron returned an empty screenshot');

    let loading = true;
    let captureAttempts = 0;
    await expect(captureLoadingSmokeFrame(
      async () => {
        captureAttempts += 1;
        loading = false;
        throw new Error('UnknownVizError');
      },
      async () => loading,
      async () => undefined,
      { maximumAttempts: 3 },
    )).rejects.toThrow('UnknownVizError');
    expect(captureAttempts).toBe(2);

    const loadingChecks = [true, false];
    await expect(captureLoadingSmokeFrame(
      async () => ({ isEmpty: () => false }),
      async () => loadingChecks.shift() ?? false,
      async () => undefined,
      { maximumAttempts: 1 },
    )).resolves.toEqual({
      frame: expect.objectContaining({ isEmpty: expect.any(Function) }),
      loadingShellObserved: false,
    });

    await expect(captureLoadingSmokeFrame(
      async () => ({ isEmpty: () => false }),
      async () => true,
      async () => undefined,
      { maximumAttempts: 1 },
    )).resolves.toEqual({
      frame: expect.objectContaining({ isEmpty: expect.any(Function) }),
      loadingShellObserved: true,
    });

    // Stage 6: the production renderer clears the shell sooner, so a shell that was never on
    // screen is recorded rather than failed. A capture that fails on its own still throws.
    await expect(captureLoadingSmokeFrame(
      async () => ({ isEmpty: () => false }),
      async () => false,
      async () => undefined,
      { maximumAttempts: 1 },
    )).resolves.toEqual({
      frame: expect.objectContaining({ isEmpty: expect.any(Function) }),
      loadingShellObserved: false,
    });
  });

  test('waits up to the loading-shell deadline without starting Electron', async () => {
    const observedWaits: number[] = [];
    let observedChecks = 0;
    await expect(waitForLoadingShell(
      async () => ++observedChecks === 3,
      async (milliseconds) => { observedWaits.push(milliseconds); },
    )).resolves.toBe(true);
    expect(observedWaits).toEqual([LOADING_SHELL_POLL_MILLISECONDS, LOADING_SHELL_POLL_MILLISECONDS]);

    const timedOutWaits: number[] = [];
    await expect(waitForLoadingShell(
      async () => false,
      async (milliseconds) => { timedOutWaits.push(milliseconds); },
      40,
    )).resolves.toBe(false);
    expect(timedOutWaits).toEqual([20, 20]);
  });

  test('stops retries when the caller deadline expires', async () => {
    let now = 0;
    let attempts = 0;
    const waits: number[] = [];
    await expect(retrySmokeCapture(
      async () => {
        attempts += 1;
        now = 500;
        throw new Error('capture failed');
      },
      async (milliseconds) => { waits.push(milliseconds); },
      { deadlineMilliseconds: 400, now: () => now },
    )).rejects.toThrow('failed after 1 attempt');
    expect(attempts).toBe(1);
    expect(waits).toEqual([]);
  });

  test('keeps renderer FPS qualification strict while recording hosted shell measurements', () => {
    const main = readFileSync(join(process.cwd(), 'electron/main/index.ts'), 'utf8');
    const runner = readFileSync(join(process.cwd(), 'scripts/electron/run-package-smoke.ts'), 'utf8');
    expect(evaluateRendererFps(60)).toEqual(expect.objectContaining({
      profile: 'qualification', thresholdPassed: true, thresholdRequired: true,
    }));
    expect(() => evaluateRendererFps(19.99)).toThrow('rounded 60 FPS');
    expect(evaluateRendererFps(19.99, 'platform-shell')).toEqual(expect.objectContaining({
      measuredFps: 19.99, profile: 'platform-shell', thresholdPassed: false, thresholdRequired: false,
    }));
    expect(() => evaluateRendererFps(0, 'platform-shell')).toThrow('measurement is invalid');
    expect(() => evaluateRendererFps(0)).toThrow('measurement is invalid');
    expect(() => evaluateRendererFps(-1, 'platform-shell')).toThrow('measurement is invalid');
    expect(() => evaluateRendererFps('unknown', 'platform-shell')).toThrow('measurement is invalid');
    expect(() => evaluateRendererFps(60, 'weakened')).toThrow('Unknown package smoke profile');
    expect(main).toContain('measuredFrameCount >= 2');
    expect(runner).toContain('rendererFpsSampledFrames');
  });

  test('accepts one complete renderer readiness report', () => {
    const stdout = [
      'startup',
      `SI_WORLD_SMOKE_RESULT ${JSON.stringify({
        schemaVersion: 2,
        phase: 'world',
        appUrl: 'app://game/',
        assetsLoaded: true,
        bridgeKeys: [
        'abortConversation', 'beginConversation', 'completeVerbalMissionTurn', 'confirmVerbalMissionGoal',
        'endConversation', 'getRuntimeInfo',
        'loadPresentationPreferences', 'loadSave', 'migrateSave', 'readVerbalMissionTurn',
        'reportRendererReady', 'requestSave', 'savePresentationPreferences', 'sendConversationTurn',
        ],
        webgl2Ready: true,
        nodeAccessBlocked: true,
        rendererKind: 'threejs-2d',
        worldFrameReady: true,
      })}`,
    ].join('\n');

    // Stage 7 removed the Skia world variant with CanvasKit itself.
    expect(parseSmokeResult(stdout)).toEqual(
      expect.objectContaining({
        assetsLoaded: true,
        webgl2Ready: true,
        nodeAccessBlocked: true,
      }),
    );
  });

  test('rejects missing or weakened proof', () => {
    expect(() => parseSmokeResult('startup only')).toThrow('did not emit');
    expect(() =>
      parseSmokeResult(
        `SI_WORLD_SMOKE_RESULT ${JSON.stringify({
          appUrl: 'app://game/',
          schemaVersion: 2,
          phase: 'world',
          assetsLoaded: true,
          bridgeKeys: [
            'abortConversation', 'beginConversation', 'completeVerbalMissionTurn', 'confirmVerbalMissionGoal',
            'endConversation', 'getRuntimeInfo',
            'loadPresentationPreferences', 'loadSave', 'migrateSave', 'readVerbalMissionTurn',
            'reportRendererReady', 'requestSave', 'savePresentationPreferences', 'sendConversationTurn',
          ],
          webgl2Ready: false,
          nodeAccessBlocked: true,
          rendererKind: 'threejs-2d',
          worldFrameReady: true,
        })}`,
      ),
    ).toThrow();
    expect(() =>
      parseSmokeResult(
        `SI_WORLD_SMOKE_RESULT ${JSON.stringify({
          appUrl: 'https://example.com/',
          schemaVersion: 2,
          phase: 'world',
          assetsLoaded: true,
          bridgeKeys: [
            'abortConversation', 'beginConversation', 'completeVerbalMissionTurn', 'confirmVerbalMissionGoal',
            'endConversation', 'getRuntimeInfo',
            'loadPresentationPreferences', 'loadSave', 'migrateSave', 'readVerbalMissionTurn',
            'reportRendererReady', 'requestSave', 'savePresentationPreferences', 'sendConversationTurn',
          ],
          webgl2Ready: true,
          nodeAccessBlocked: true,
          rendererKind: 'threejs-2d',
          worldFrameReady: true,
        })}`,
      ),
    ).toThrow('untrusted renderer URL');
  });

  test('requires runtime files and rejects project-source leaks', () => {
    const requiredListing = [
      '/build/electron/main/index.js',
      '/build/electron/main/smoke-capture.js',
      '/build/electron/preload/index.js',
      '/build/electron/persistence/save-repository.js',
      '/build/src/domain/state/schema.js',
      '/dist/index.html',
      '/dist/webgl2-probe.html',
      '/dist/assets/assets/generated/world-atlas.abc123.png',
      '/dist/assets/assets/generated/audio/greeting.abc123.wav',
      '/dist/assets/assets/generated/audio/laugh.abc123.wav',
      '/dist/assets/assets/generated/audio/sigh.abc123.wav',
      '/dist/assets/assets/generated/audio/consequence.abc123.wav',
      '/dist/assets/assets/source/audio/sfx_alarm_clock.abc123.webm',
      '/dist/assets/node_modules/@expo-google-fonts/silkscreen/400Regular/Silkscreen_400Regular.abc123.ttf',
      '/node_modules/zod/package.json',
      '/node_modules/three/package.json',
    ].join('\n');
    expect(() => validatePackageListing(requiredListing)).not.toThrow();
    expect(() => validatePackageListing(requiredListing.replaceAll('/', '\\'))).not.toThrow();
    expect(() => validatePackageListing(`${requiredListing}\n/src/domain/prng.ts`)).toThrow(
      'excluded source',
    );
    expect(() => validatePackageListing(requiredListing.replace('/dist/index.html\n', ''))).toThrow(
      'missing /dist/index.html',
    );
    expect(() => validatePackageListing(
      requiredListing.replace('/build/electron/main/smoke-capture.js\n', ''),
    )).toThrow('missing /build/electron/main/smoke-capture.js');
  });

  test('requires two distinct non-empty PNG screenshots', () => {
    const loading = screenshot(640, 360, 1);
    const ready = screenshot(640, 360, 2);

    expect(() => validateScreenshotBuffers(loading, ready)).not.toThrow();
    expect(loading.byteLength).toBeLessThan(4_096);
    expect(() => validateScreenshotBuffers(Buffer.alloc(20), ready)).toThrow('not a PNG');
    expect(() => validateScreenshotBuffers(
      Buffer.concat([PNG_SIGNATURE, Buffer.from('invalid')]),
      ready,
    )).toThrow('not a valid PNG');
    expect(() => validateScreenshotBuffers(screenshot(320, 180, 1), ready)).toThrow(
      'dimensions are too small',
    );
    expect(() => validateScreenshotBuffers(screenshot(800, 450, 1), ready)).toThrow(
      'dimensions do not match',
    );
    expect(() => validateScreenshotBuffers(
      screenshot(800, 450, 1),
      ready,
      { requireSameDimensions: false },
    )).not.toThrow();
    expect(() => validateScreenshotBuffers(loading, loading)).toThrow('identical');
    expect(() => validateScreenshotBuffers(
      loading,
      loading,
      { requireDifferentBytes: false },
    )).not.toThrow();
  });

  test('requires explicit loading-shell observation evidence', () => {
    expect(parseLoadingShellObserved('SI_WORLD_SMOKE_LOADING_SHELL_OBSERVED true\n')).toBe(true);
    expect(parseLoadingShellObserved('SI_WORLD_SMOKE_LOADING_SHELL_OBSERVED false\n')).toBe(false);
    expect(() => parseLoadingShellObserved('')).toThrow('did not emit loading-shell observation');
    expect(() => parseLoadingShellObserved('SI_WORLD_SMOKE_LOADING_SHELL_OBSERVED maybe\n'))
      .toThrow('invalid loading-shell observation');
  });

  test('requires three distinct world zoom PNG screenshots', () => {
    const zooms = [1, 2, 3].map((fill) => screenshot(640, 360, fill));
    expect(() => validateWorldZoomBuffers(zooms)).not.toThrow();
    expect(() => validateWorldZoomBuffers(zooms.slice(0, 2))).toThrow('exactly three');
    expect(() => validateWorldZoomBuffers([
      screenshot(320, 180, 1), zooms[1]!, zooms[2]!,
    ])).toThrow('dimensions are too small');
    expect(() => validateWorldZoomBuffers([
      Buffer.concat([PNG_SIGNATURE, Buffer.from('invalid')]), zooms[1]!, zooms[2]!,
    ])).toThrow('not a valid PNG');
    expect(() => validateWorldZoomBuffers([
      screenshot(800, 450, 1), zooms[1]!, zooms[2]!,
    ])).toThrow('dimensions do not match');
    expect(() => validateWorldZoomBuffers([zooms[0]!, zooms[0]!, zooms[2]!])).toThrow('must be distinct');
  });
});
