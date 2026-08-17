import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { app, BrowserWindow, ipcMain, net, protocol, session } from 'electron';

import { ConversationService } from '../../src/ai/conversation/service';
import { FileCharacterWritingStore } from '../../src/ai/registry/file-writing-store';
import { WORLD_MAP_CATALOG } from '../../src/application/runtime/map-catalog';
import { CHARACTER_IDS } from '../../src/render/atlas';
import { coalescedResizeDelay, responsiveSurface } from '../../src/render/responsive-layout';
import { ALL_MAP_PARITY_CASES } from '../../src/render/three/all-map-parity';
import { EXPECTED_VFX_ANCHORS } from '../../src/render/vfx/fixtures';
import { registerConversationIpc } from '../conversation/ipc';
import { FileVerbalMissionContentStore } from '../conversation/file-verbal-mission-content-store';
import { registerRuntimeIpc, type RendererReadyReport } from '../ipc/contracts';
import { BundledConversationInference } from '../model/conversation-inference';
import { runPackagedModelSmoke } from '../model/model-smoke';
import { registerPersistenceIpc } from '../persistence/ipc';
import { registerPresentationPreferencesIpc } from '../persistence/presentation-preferences-ipc';
import {
  PresentationPreferencesRepository,
  presentationPreferencesPathForUserData,
} from '../persistence/presentation-preferences';
import { SaveRepository, saveRootForUserData } from '../persistence/save-repository';
import {
  APP_URL,
  WEBGL2_PROBE_URL,
  createAppProtocolHandler,
  registerAppSchemePrivileges,
} from '../protocol/app-protocol';
import { lockWebContents, lockedWebPreferences } from './security';
import { captureLoadingSmokeFrame, captureNonEmptySmokeFrame } from './smoke-capture';

registerAppSchemePrivileges(protocol);

const smokeMode = process.env.SI_WORLD_SMOKE === '1';
const devHarnessMode = process.env.SI_WORLD_DEV_HARNESS === '1';
const devHarnessRoot = process.env.SI_WORLD_DEV_HARNESS_ROOT;
const modelSmokeMode = process.env.SI_WORLD_MODEL_SMOKE === '1';
const smokeExpectsModel = process.env.SI_WORLD_SMOKE_EXPECT_MODEL === '1';
const webgl2ProbeMode = process.env.SI_WORLD_WEBGL2_PROBE === '1';
const naturalMovementSmokeMode = process.env.SI_WORLD_NATURAL_MOVEMENT_SMOKE === '1';
const rendererParitySmokeMode = process.env.SI_WORLD_RENDERER_PARITY_SMOKE === '1';
const rendererAllMapsSmokeMode = process.env.SI_WORLD_RENDERER_ALL_MAPS_SMOKE === '1';
const naturalMovementReducedMode = process.env.SI_WORLD_NATURAL_MOVEMENT_REDUCED === '1';
const responsiveSmokeMode = process.env.SI_WORLD_RESPONSIVE_SMOKE === '1';
const responsiveHighDpiMode = process.env.SI_WORLD_RESPONSIVE_HIGH_DPI === '1';
const fullCastPortraitSmokeMode = process.env.SI_WORLD_FULL_CAST_PORTRAIT_SMOKE === '1';
const proceduralVfxSmokeMode = process.env.SI_WORLD_PROCEDURAL_VFX_SMOKE === '1';
const daySweepSmokeMode = process.env.SI_WORLD_DAY_SWEEP_SMOKE === '1';
const proceduralVfxReducedMode = process.env.SI_WORLD_PROCEDURAL_VFX_REDUCED === '1';
const tierBArtSmokeMode = process.env.SI_WORLD_TIER_B_ART_SMOKE === '1';
const responsiveArtMode = process.env.SI_WORLD_ART_MODE;
const smokeVfxMode = process.env.SI_WORLD_VFX_MODE;
const smokeRenderer = process.env.SI_WORLD_TEST_RENDERER;
// Stage 6: the world renders with the production renderer when a smoke requests none, so every
// renderer-specific guard must read the effective renderer rather than the raw request. Reading
// the raw value let a default run label its output threejs-2d while skipping the Three.js checks.
const effectiveRenderer = smokeRenderer ?? 'threejs-2d';
// Stage 4: unsaved, smoke-only tone-mapping override so no-tone parity and ACES both rerun.
const smokeToneMapping = process.env.SI_WORLD_TEST_TONE_MAPPING;
const presentationSeedSmokeMode = process.env.SI_WORLD_PRESENTATION_SEED_SMOKE === '1';
const presentationRestartSmokeMode = process.env.SI_WORLD_PRESENTATION_RESTART_SMOKE === '1';
const saveMigrationSmokeMode = process.env.SI_WORLD_SAVE_MIGRATION_SMOKE === '1';
const saveReloadSmokeMode = process.env.SI_WORLD_SAVE_RELOAD_SMOKE === '1';
if (process.platform !== 'darwin' && process.platform !== 'win32') {
  throw new Error(`Unsupported release platform: ${process.platform}.`);
}
const runtimePlatform = process.platform;
const responsiveDeviceScaleFactor = Number(process.env.SI_WORLD_RESPONSIVE_DEVICE_SCALE_FACTOR ?? '1');
if (![1, 1.25, 1.5, 2].includes(responsiveDeviceScaleFactor)) {
  throw new Error('Responsive smoke device scale factor must be 1, 1.25, 1.5, or 2.');
}
if (process.env.SI_WORLD_RESPONSIVE_DEVICE_SCALE_FACTOR !== undefined && !responsiveSmokeMode) {
  throw new Error('Responsive smoke device scale factor requires responsive smoke mode.');
}
if (webgl2ProbeMode && !smokeMode) {
  throw new Error('The WebGL 2 probe requires smoke mode.');
}
if (smokeMode && devHarnessMode) {
  throw new Error('The developer harness and automated smoke mode cannot run together.');
}
if (devHarnessRoot && (!devHarnessMode || !isAbsolute(devHarnessRoot))) {
  throw new Error('SI_WORLD_DEV_HARNESS_ROOT requires dev harness mode and an absolute path.');
}
const processStartedAt = performance.now();
let smokeFinished = false;
let rendererShellReady = false;
let smokePreparationPromise: Promise<void> | undefined;
let smokePreparationError: unknown;
let activeMainWindow: BrowserWindow | undefined;
let conversationService: ConversationService | undefined;
let conversationInference: BundledConversationInference | undefined;
let quitCleanupStarted = false;
let quitCleanupFinished = false;

const smokeUserData = process.env.SI_WORLD_SMOKE_USER_DATA;
if (smokeMode && smokeUserData) {
  if (!isAbsolute(smokeUserData)) throw new Error('Smoke user-data path must be absolute.');
  app.setPath('userData', smokeUserData);
}

if (smokeMode) {
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('mute-audio');
}

if (responsiveArtMode !== undefined && (!responsiveSmokeMode || !['legacy', 'enhanced'].includes(responsiveArtMode))) {
  throw new Error('Art mode is available only to responsive smoke as legacy or enhanced.');
}

if (smokeVfxMode !== undefined && (!smokeMode || !['circle', 'procedural'].includes(smokeVfxMode))) {
  throw new Error('VFX mode is available only to smoke runs as circle or procedural.');
}

if (smokeToneMapping !== undefined && (!smokeMode || !['none', 'aces'].includes(smokeToneMapping))) {
  throw new Error('SI_WORLD_TEST_TONE_MAPPING requires smoke mode and must be none or aces.');
}
if (smokeRenderer !== undefined && (!smokeMode || !['threejs-2d', 'threejs-2-5d'].includes(smokeRenderer))) {
  throw new Error('Test renderer is available only to smoke runs as threejs-2d or threejs-2-5d.');
}

if (naturalMovementReducedMode || proceduralVfxReducedMode) {
  app.commandLine.appendSwitch('force-prefers-reduced-motion', 'reduce');
} else if (naturalMovementSmokeMode || proceduralVfxSmokeMode) {
  app.commandLine.appendSwitch('force-prefers-no-reduced-motion');
}

const waitForSmokeRetry = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function writeSmokeScreenshot(screenshotPath: string, image: Awaited<ReturnType<BrowserWindow['webContents']['capturePage']>>): Promise<Buffer> {
  const buffer = image.toPNG();
  await writeFile(screenshotPath, buffer, { flush: true });
  return buffer;
}

async function captureSmokeScreenshot(
  window: BrowserWindow,
  screenshotPath: string,
  deadlineMilliseconds?: number,
  rect?: Readonly<{ x: number; y: number; width: number; height: number }>,
): Promise<Buffer> {
  const image = await captureNonEmptySmokeFrame(
    () => window.webContents.capturePage(rect, { stayHidden: true }),
    waitForSmokeRetry,
    { deadlineMilliseconds },
  );
  return writeSmokeScreenshot(screenshotPath, image);
}

async function captureLoadingSmokeScreenshot(window: BrowserWindow, screenshotPath: string): Promise<Buffer> {
  const loadingVisible = (): Promise<boolean> => window.webContents.executeJavaScript(
    `Boolean(document.querySelector('#loading-shell'))`,
    true,
  ) as Promise<boolean>;
  const { frame: image, loadingShellObserved } = await captureLoadingSmokeFrame(
    () => window.webContents.capturePage(undefined, { stayHidden: true }),
    loadingVisible,
    waitForSmokeRetry,
  );
  process.stdout.write(`SI_WORLD_SMOKE_LOADING_SHELL_OBSERVED ${String(loadingShellObserved)}\n`);
  return writeSmokeScreenshot(screenshotPath, image);
}

async function waitForRendererPaint(window: BrowserWindow): Promise<void> {
  const painted = window.webContents.executeJavaScript(
    `Promise.race([
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))),
      new Promise((resolve) => setTimeout(() => resolve(false), 1_000)),
    ])`,
    true,
  ) as Promise<boolean>;
  await window.webContents.capturePage(undefined, { stayHidden: true });
  await window.webContents.capturePage(undefined, { stayHidden: true });
  if (!await painted) throw new Error('Hidden renderer did not produce two paint frames.');
}

async function captureDistinctSmokeScreenshot(
  window: BrowserWindow,
  screenshotPath: string,
  previousBuffers: readonly Buffer[],
  timeoutMilliseconds = 2_000,
): Promise<Buffer> {
  const deadline = Date.now() + timeoutMilliseconds;
  do {
    await waitForRendererPaint(window);
    if (Date.now() >= deadline) break;
    const buffer = await captureSmokeScreenshot(window, screenshotPath, deadline);
    if (previousBuffers.every((previous) => !buffer.equals(previous))) return buffer;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
  } while (Date.now() < deadline);
  throw new Error(`Screenshot did not change before timeout: ${screenshotPath}`);
}

type SurfaceBounds = Readonly<{ x: number; y: number; width: number; height: number }>;

async function rendererText(window: BrowserWindow, selector: string): Promise<string> {
  return window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`,
    true,
  ) as Promise<string>;
}

async function cameraLabel(window: BrowserWindow): Promise<string> {
  return window.webContents.executeJavaScript(
    `document.querySelector('#world-camera-state')?.getAttribute('aria-label') ?? ''`,
    true,
  ) as Promise<string>;
}

async function cameraMotionLabel(window: BrowserWindow): Promise<string> {
  return window.webContents.executeJavaScript(
    `document.querySelector('#world-camera-motion-state')?.getAttribute('aria-label') ?? ''`,
    true,
  ) as Promise<string>;
}

/**
 * Why this timeout reports so much.
 *
 * `package-windows-x64` has failed every recorded CI run with a single line: "Camera motion never
 * matched. Last label: Camera follow suspended; shake 0.24; shot none; queue 0". That message names
 * neither which wait failed nor why, and five different waits share it, so reading it cost an hour
 * and still produced a wrong first diagnosis.
 *
 * The `shake 0.24` is the tell. Trauma starts at 0 and the only impulse in the smoke is `0.8`, so
 * `0.8 - (1000 / IMPACT_MAX_DURATION_MS) * seconds = 0.24` puts the freeze about 101 ms after that
 * impulse — which is the `shake 0.00` wait, not the `follow armed` wait it was assumed to be.
 * Trauma above zero also keeps `sampleCameraDirector` returning `active`, so the clock should have
 * kept running. Something stopped the frames, and none of the three candidates — a lost GL context,
 * a dead `requestAnimationFrame`, or a swallowed key — can be told apart from the message alone.
 *
 * So on timeout this asks the renderer directly. It never runs on a passing wait.
 */
async function cameraMotionDiagnostics(window: BrowserWindow): Promise<string> {
  try {
    return await window.webContents.executeJavaScript(`new Promise((resolve) => {
      const overlay = document.querySelector('#world-renderer-recovery-overlay');
      const started = Date.now();
      let frames = 0;
      const tick = () => {
        frames += 1;
        if (frames < 2 && Date.now() - started < 500) { requestAnimationFrame(tick); return; }
        resolve([
          'recoveryOverlay=' + (overlay ? JSON.stringify(overlay.textContent ?? '') : 'absent'),
          'framesIn500ms=' + frames,
          'documentHidden=' + document.hidden,
          'visibility=' + document.visibilityState,
        ].join(' '));
      };
      requestAnimationFrame(tick);
      // requestAnimationFrame never firing is itself the answer, so this cannot wait on it alone.
      setTimeout(() => resolve([
        'recoveryOverlay=' + (overlay ? JSON.stringify(overlay.textContent ?? '') : 'absent'),
        'framesIn500ms=' + frames,
        'documentHidden=' + document.hidden,
        'visibility=' + document.visibilityState,
      ].join(' ')), 600);
    })`, true) as string;
  } catch (error: unknown) {
    return `diagnostics failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function waitForCameraMotion(
  window: BrowserWindow,
  matches: (label: string) => boolean,
  timeoutMilliseconds = 4_000,
  waitName = 'unnamed',
): Promise<string> {
  const deadline = Date.now() + timeoutMilliseconds;
  let label = '';
  while (Date.now() < deadline) {
    label = await cameraMotionLabel(window);
    if (matches(label)) return label;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  const diagnostics = await cameraMotionDiagnostics(window);
  throw new Error(
    `Camera motion never matched "${waitName}" within ${timeoutMilliseconds}ms. ` +
    `Last label: ${label} | ${diagnostics}`,
  );
}

/**
 * Wait until the camera stops moving.
 *
 * Follow eases, so it keeps travelling for several frames after the hero stops walking. Sampling
 * the camera the instant `reachWorldTile` returns catches it mid-ease, and any later assertion
 * against that sample races the remaining travel.
 */
async function waitForCameraStill(
  window: BrowserWindow,
  timeoutMilliseconds = 4_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMilliseconds;
  let previous = await cameraLabel(window);
  while (Date.now() < deadline) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
    const current = await cameraLabel(window);
    if (current === previous) return current;
    previous = current;
  }
  throw new Error(`Camera never settled. Last label: ${previous}`);
}

async function roofLabel(window: BrowserWindow): Promise<string> {
  return window.webContents.executeJavaScript(
    `document.querySelector('#world-roof-state')?.getAttribute('aria-label') ?? ''`,
    true,
  ) as Promise<string>;
}

async function waitForRoofLabel(
  window: BrowserWindow,
  expectedLabel: 'Villa roof restored' | 'Villa roof hidden',
  timeoutMilliseconds = 6_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastLabel = '';
  while (Date.now() < deadline) {
    lastLabel = await roofLabel(window);
    if (lastLabel === expectedLabel) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for roof label ${expectedLabel}. Last label: ${lastLabel}`);
}

async function worldStateLabel(window: BrowserWindow): Promise<string> {
  return window.webContents.executeJavaScript(
    `document.querySelector('#world-state')?.getAttribute('aria-label') ?? ''`,
    true,
  ) as Promise<string>;
}

async function npcStateLabel(window: BrowserWindow): Promise<string> {
  return window.webContents.executeJavaScript(
    `document.querySelector('#world-npc-state')?.getAttribute('aria-label') ?? ''`,
    true,
  ) as Promise<string>;
}

async function questStateLabel(window: BrowserWindow): Promise<string> {
  return window.webContents.executeJavaScript(
    `document.querySelector('#world-quest-state')?.getAttribute('aria-label') ?? ''`,
    true,
  ) as Promise<string>;
}

async function protagonistStateLabel(window: BrowserWindow): Promise<string> {
  return window.webContents.executeJavaScript(
    `document.querySelector('#world-protagonist-state')?.getAttribute('aria-label') ?? ''`,
    true,
  ) as Promise<string>;
}

async function waitForSelector(window: BrowserWindow, selector: string, timeoutMilliseconds = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const found = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
      true,
    ) as boolean;
    if (found) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for renderer selector: ${selector}`);
}

async function waitForSelectorMissing(window: BrowserWindow, selector: string, timeoutMilliseconds = 6_000): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const found = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
      true,
    ) as boolean;
    if (!found) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for renderer selector to close: ${selector}`);
}

function parseWorldStateLabel(label: string): Readonly<{ mapName: string; x: number; y: number; minute: number; speed: number }> {
  const match = /^(.*); tile (\d+),(\d+); minute (\d+); speed (\d+)(?:;.*)?$/u.exec(label);
  if (!match) throw new Error(`Invalid world-state label: ${label}`);
  return { mapName: match[1]!, x: Number(match[2]), y: Number(match[3]), minute: Number(match[4]), speed: Number(match[5]) };
}

async function waitForWorldState(
  window: BrowserWindow,
  predicate: (state: ReturnType<typeof parseWorldStateLabel>) => boolean,
  timeoutMilliseconds = 6_000,
): Promise<ReturnType<typeof parseWorldStateLabel>> {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastState = parseWorldStateLabel(await worldStateLabel(window));
  while (Date.now() < deadline) {
    lastState = parseWorldStateLabel(await worldStateLabel(window));
    if (predicate(lastState)) return lastState;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for world state. Last state: ${JSON.stringify(lastState)}`);
}

function parseLindaTile(label: string): Readonly<{ x: number; y: number }> {
  const match = /^Linda (-?\d+),(-?\d+);/u.exec(label);
  if (!match || Number(match[1]) < 0 || Number(match[2]) < 0) throw new Error(`Linda is not active: ${label}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

async function surfaceBounds(window: BrowserWindow): Promise<SurfaceBounds> {
  return window.webContents.executeJavaScript(`(() => {
    const element = document.querySelector('#world-input-viewport');
    if (!(element instanceof HTMLElement)) throw new Error('World input viewport is missing.');
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  })()`, true) as Promise<SurfaceBounds>;
}

async function surfaceLayoutDiagnostic(window: BrowserWindow): Promise<Record<string, unknown>> {
  return window.webContents.executeJavaScript(`(() => {
    const rect = (element) => element instanceof HTMLElement
      ? (() => { const value = element.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height }; })()
      : null;
    const gameSurface = document.querySelector('#active-game-surface');
    const worldSurface = document.querySelector('#world-input-viewport');
    const worldCanvasHost = document.querySelector('#world-canvas');
    const worldCanvas = worldCanvasHost instanceof HTMLCanvasElement
      ? worldCanvasHost
      : worldCanvasHost?.querySelector('canvas');
    return {
      document: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      window: {
        innerWidth: globalThis.innerWidth,
        innerHeight: globalThis.innerHeight,
        visualViewportWidth: globalThis.visualViewport?.width ?? null,
        visualViewportHeight: globalThis.visualViewport?.height ?? null,
        screenWidth: globalThis.screen.width,
        screenHeight: globalThis.screen.height,
      },
      body: rect(document.body),
      root: rect(document.querySelector('#root')),
      gameSurfaceFrame: rect(gameSurface?.parentElement),
      gameSurface: rect(gameSurface),
      worldSurface: rect(worldSurface),
      worldSurfaceClass: worldSurface instanceof HTMLElement ? worldSurface.className : null,
      worldSurfaceInlineStyle: worldSurface instanceof HTMLElement ? worldSurface.getAttribute('style') : null,
      worldSurfaceMatches: document.querySelectorAll('#world-input-viewport').length,
      worldCanvas: worldCanvas instanceof HTMLCanvasElement ? {
        backingWidth: worldCanvas.width,
        backingHeight: worldCanvas.height,
        rect: rect(worldCanvas),
      } : null,
      surfaceProp: document.querySelector('#world-surface-state')?.getAttribute('aria-label') ?? null,
      cameraState: document.querySelector('#world-camera-state')?.getAttribute('aria-label') ?? null,
      responsiveState: document.querySelector('#world-responsive-state')?.getAttribute('aria-label') ?? null,
    };
  })()`, true) as Promise<Record<string, unknown>>;
}

function parseCameraLabel(label: string): Readonly<{ x: number; y: number; zoom: number }> {
  const match = /^World camera (-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?) at (\d+(?:\.\d+)?)x$/u.exec(label);
  if (!match) throw new Error(`Invalid camera label: ${label}`);
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

async function clickZoomButton(window: BrowserWindow, zoom: 1 | 2 | 3): Promise<void> {
  await window.webContents.executeJavaScript(`(async () => {
    let value = document.querySelector('#world-ui-zoom-value');
    const settings = document.querySelector('[aria-label="Open display settings"]');
    if (!(value instanceof HTMLElement)) {
      if (!(settings instanceof HTMLElement)) throw new Error('Display settings button is missing.');
      settings.click();
      const deadline = Date.now() + 2_000;
      while (!(document.querySelector('#world-ui-zoom-value') instanceof HTMLElement) && Date.now() < deadline) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      }
      value = document.querySelector('#world-ui-zoom-value');
    }
    if (!(value instanceof HTMLElement)) throw new Error('World zoom value is missing.');
    const currentPercentage = Number.parseInt(value.textContent ?? '', 10);
    const targetPercentage = ${zoom * 100};
    if (!Number.isFinite(currentPercentage)) throw new Error('World zoom value is invalid.');
    const label = targetPercentage > currentPercentage ? 'Increase world zoom' : 'Decrease world zoom';
    const button = document.querySelector('[aria-label="' + label + '"]');
    const clicks = Math.abs(targetPercentage - currentPercentage) / 10;
    if (!Number.isInteger(clicks)) throw new Error('World zoom cannot reach the requested ten-percent step.');
    if (clicks > 0 && !(button instanceof HTMLElement)) throw new Error(label + ' button is missing.');
    for (let index = 0; index < clicks; index += 1) button.click();
  })()`, true);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
}

async function captureTierBMapZoomSet(
  window: BrowserWindow,
  directory: string,
  label: 'downtown' | 'commercial' | 'ferry',
  oneXBuffer: Buffer,
): Promise<Buffer> {
  await writeFile(join(directory, `world-${label}-1x.png`), oneXBuffer, { flush: true });
  const buffers = [oneXBuffer];
  for (const zoom of [2, 3] as const) {
    await clickZoomButton(window, zoom);
    buffers.push(await captureDistinctSmokeScreenshot(
      window,
      join(directory, `world-${label}-${zoom}x.png`),
      buffers,
      4_000,
    ));
  }
  await clickZoomButton(window, 1);
  return buffers.at(-1) as Buffer;
}

async function clickUiScaleButton(window: BrowserWindow, percentage: 100 | 125 | 150): Promise<void> {
  await clickAriaButton(window, `Set ${percentage} percent interface scale`);
}

async function responsiveEvidence(window: BrowserWindow): Promise<Record<string, unknown>> {
  const evidence = await window.webContents.executeJavaScript(
    `window.siWorldMeasureResponsiveEvidence?.() ?? null`,
    true,
  ) as Record<string, unknown> | null;
  if (!evidence) throw new Error('Responsive evidence is missing.');
  return evidence;
}

async function vfxEvidence(window: BrowserWindow): Promise<Record<string, unknown>> {
  const label = await window.webContents.executeJavaScript(
    `document.querySelector('#world-vfx-state')?.getAttribute('aria-label') ?? ''`,
    true,
  ) as string;
  if (!label) throw new Error('VFX evidence is missing.');
  return JSON.parse(label) as Record<string, unknown>;
}

async function waitForVfxEvidence(
  window: BrowserWindow,
  predicate: (evidence: Record<string, unknown>) => boolean,
  timeoutMilliseconds = 10_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastEvidence: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    lastEvidence = await vfxEvidence(window);
    if (predicate(lastEvidence)) return lastEvidence;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for VFX evidence. Last evidence: ${JSON.stringify(lastEvidence)}`);
}

async function geometryEvidence(window: BrowserWindow): Promise<Readonly<{
  mapId: string;
  start: Readonly<{
    protagonist: Readonly<{ x: number; y: number }>;
    movementTarget: Readonly<{ x: number; y: number }>;
  }>;
  roof: Readonly<{ exteriorTile: Readonly<{ x: number; y: number }> }>;
}>> {
  const label = await window.webContents.executeJavaScript(
    `document.querySelector('#world-geometry-state')?.getAttribute('aria-label') ?? ''`,
    true,
  ) as string;
  if (!label) throw new Error('Stable smoke geometry evidence is missing.');
  const candidate = JSON.parse(label) as Record<string, unknown>;
  const start = candidate.start as Record<string, unknown> | undefined;
  const protagonist = start?.protagonist as Record<string, unknown> | undefined;
  const movementTarget = start?.movementTarget as Record<string, unknown> | undefined;
  const roof = candidate.roof as Record<string, unknown> | undefined;
  const exteriorTile = roof?.exteriorTile as Record<string, unknown> | undefined;
  if (
    candidate.mapId !== 'northwest_residential' ||
    !Number.isInteger(protagonist?.x) || !Number.isInteger(protagonist?.y) ||
    !Number.isInteger(movementTarget?.x) || !Number.isInteger(movementTarget?.y) ||
    !Number.isInteger(exteriorTile?.x) || !Number.isInteger(exteriorTile?.y)
  ) {
    throw new Error('Stable smoke geometry evidence is invalid.');
  }
  return candidate as unknown as Readonly<{
    mapId: string;
    start: Readonly<{
      protagonist: Readonly<{ x: number; y: number }>;
      movementTarget: Readonly<{ x: number; y: number }>;
    }>;
    roof: Readonly<{ exteriorTile: Readonly<{ x: number; y: number }> }>;
  }>;
}

async function waitForResponsiveEvidence(
  window: BrowserWindow,
  predicate: (evidence: Record<string, unknown>) => boolean,
  timeoutMilliseconds = 6_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMilliseconds;
  let last: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    await waitForRendererPaint(window);
    try {
      last = await responsiveEvidence(window);
      if (predicate(last)) return last;
    } catch {
      // The first responsive evidence is emitted after two rendered frames.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  const diagnostic = await surfaceLayoutDiagnostic(window);
  throw new Error(
    `Responsive evidence did not reach the expected state. ` +
    `Last: ${JSON.stringify(last)} Layout: ${JSON.stringify(diagnostic)}`,
  );
}

async function resizeContentAndWait(
  window: BrowserWindow,
  width: number,
  height: number,
  timeoutMilliseconds = 6_000,
): Promise<SurfaceBounds> {
  if (window.isMaximized()) {
    window.unmaximize();
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  window.setContentSize(width, height);
  const expected = responsiveSurface(width, height).surface;
  const deadline = Date.now() + timeoutMilliseconds;
  let last = await surfaceBounds(window);
  while (Date.now() < deadline) {
    last = await surfaceBounds(window);
    if (Math.abs(last.width - expected.width) <= 1 && Math.abs(last.height - expected.height) <= 1) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, coalescedResizeDelay() * 2));
      const settled = await surfaceBounds(window);
      if (Math.abs(settled.width - expected.width) <= 1 && Math.abs(settled.height - expected.height) <= 1) {
        await waitForRendererPaint(window);
        return settled;
      }
      last = settled;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  const diagnostic = await surfaceLayoutDiagnostic(window);
  throw new Error(
    `Responsive surface did not reach ${expected.width}x${expected.height}. ` +
    `Last: ${JSON.stringify(last)} Layout: ${JSON.stringify(diagnostic)}`,
  );
}

async function clickAriaButton(window: BrowserWindow, label: string): Promise<void> {
  const result = await window.webContents.executeJavaScript(`(() => {
    try {
      const button = Array.from(document.querySelectorAll('[aria-label]')).find(
        (element) => (element.getAttribute('aria-label') ?? '').toLowerCase() === ${JSON.stringify(label)}.toLowerCase(),
      );
      if (!(button instanceof HTMLElement)) return { clicked: false, error: null };
      button.click();
      return { clicked: true, error: null };
    } catch (error) {
      return { clicked: false, error: error instanceof Error ? error.stack ?? error.message : String(error) };
    }
  })()`, true) as Readonly<{ clicked: boolean; error: string | null }>;
  if (result.error) throw new Error(`Button ${label} failed: ${result.error}`);
  if (!result.clicked) throw new Error(`Button is missing: ${label}`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
}

async function waitForWorldTile(
  window: BrowserWindow,
  tile: Readonly<{ x: number; y: number }>,
  timeoutMilliseconds = 6_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastLabel = '';
  while (Date.now() < deadline) {
    lastLabel = await worldStateLabel(window);
    const state = parseWorldStateLabel(lastLabel);
    if (state.x === tile.x && state.y === tile.y) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for tile ${tile.x},${tile.y}. Last state: ${lastLabel}`);
}

async function waitForWorldLocation(
  window: BrowserWindow,
  mapName: string,
  tile: Readonly<{ x: number; y: number }>,
  timeoutMilliseconds = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastLabel = '';
  while (Date.now() < deadline) {
    lastLabel = await worldStateLabel(window);
    const state = parseWorldStateLabel(lastLabel);
    if (state.mapName === mapName && state.x === tile.x && state.y === tile.y) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for ${mapName} tile ${tile.x},${tile.y}. Last state: ${lastLabel}`);
}

async function waitForWorldMinuteStable(
  window: BrowserWindow,
  stableMilliseconds = 1_500,
  timeoutMilliseconds = 8_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  let stableSince = Date.now();
  let lastMinute = parseWorldStateLabel(await worldStateLabel(window)).minute;
  while (Date.now() < deadline) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    const minute = parseWorldStateLabel(await worldStateLabel(window)).minute;
    if (minute !== lastMinute) {
      lastMinute = minute;
      stableSince = Date.now();
      continue;
    }
    if (Date.now() - stableSince >= stableMilliseconds) return;
  }
  throw new Error(`Timed out waiting for the world clock to pause. Last minute: ${lastMinute}`);
}

async function waitForRendererText(
  window: BrowserWindow,
  selector: string,
  expectedText: string,
  timeoutMilliseconds = 6_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastText = '';
  while (Date.now() < deadline) {
    lastText = await rendererText(window, selector);
    if (lastText.includes(expectedText)) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for ${selector} to include ${expectedText}. Last text: ${lastText}`);
}

async function waitForAriaButtonEnabled(
  window: BrowserWindow,
  label: string,
  timeoutMilliseconds = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const enabled = await window.webContents.executeJavaScript(`(() => {
      const button = Array.from(document.querySelectorAll('[aria-label]')).find(
        (element) => (element.getAttribute('aria-label') ?? '').toLowerCase() === ${JSON.stringify(label)}.toLowerCase(),
      );
      return button instanceof HTMLElement && button.getAttribute('aria-disabled') !== 'true' &&
        !('disabled' in button && button.disabled === true);
    })()`, true) as boolean;
    if (enabled) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out waiting for enabled button: ${label}`);
}

async function conversationTranscriptMeasure(window: BrowserWindow): Promise<number> {
  return window.webContents.executeJavaScript(`(() => {
    const transcript = document.querySelector('#conversation-transcript');
    if (!(transcript instanceof HTMLElement)) throw new Error('Conversation transcript is missing.');
    return transcript.textContent?.length ?? 0;
  })()`, true) as Promise<number>;
}

async function waitForConversationTurnComplete(
  window: BrowserWindow,
  priorTranscriptChildCount: number,
  timeoutMilliseconds = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastChildCount = priorTranscriptChildCount;
  while (Date.now() < deadline) {
    const state = await window.webContents.executeJavaScript(`(() => {
      const transcript = document.querySelector('#conversation-transcript');
      const endButton = Array.from(document.querySelectorAll('[aria-label]')).find(
        (element) => element.getAttribute('aria-label') === 'End conversation',
      );
      if (!(transcript instanceof HTMLElement) || !(endButton instanceof HTMLElement)) {
        return { childCount: 0, endEnabled: false };
      }
      const endEnabled = endButton.getAttribute('aria-disabled') !== 'true' &&
        !('disabled' in endButton && endButton.disabled === true);
      return { childCount: transcript.textContent?.length ?? 0, endEnabled };
    })()`, true) as Readonly<{ childCount: number; endEnabled: boolean }>;
    lastChildCount = state.childCount;
    if (state.endEnabled && state.childCount >= priorTranscriptChildCount + 2) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(
    `Timed out waiting for a completed conversation turn. Transcript children: ${lastChildCount}; prior: ${priorTranscriptChildCount}`,
  );
}

function sendMouseClick(window: BrowserWindow, x: number, y: number): void {
  window.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
}

function sendKey(window: BrowserWindow, keyCode: 'Enter' | 'F' | 'Q' | 'Escape'): void {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode });
}


async function clickWorldTile(window: BrowserWindow, tile: Readonly<{ x: number; y: number }>): Promise<void> {
  const bounds = await surfaceBounds(window);
  const camera = parseCameraLabel(await cameraLabel(window));
  const x = bounds.x + (tile.x * 32 + 16 - camera.x) * camera.zoom;
  const y = bounds.y + (tile.y * 32 + 16 - camera.y) * camera.zoom;
  if (x < bounds.x || y < bounds.y || x >= bounds.x + bounds.width || y >= bounds.y + bounds.height) {
    throw new Error(`Tile ${tile.x},${tile.y} is outside the visible camera.`);
  }
  sendMouseClick(window, x, y);
}

async function dispatchWorldTileClick(window: BrowserWindow, tile: Readonly<{ x: number; y: number }>): Promise<void> {
  await window.webContents.executeJavaScript(`(() => {
    const element = document.querySelector('#world-input-surface');
    if (!(element instanceof HTMLElement)) throw new Error('World input surface is missing.');
    const viewport = element.querySelector('#world-input-viewport');
    if (!(viewport instanceof HTMLElement)) throw new Error('World input viewport is missing.');
    // Read the camera in the page rather than round-tripping it: a following camera can move
    // between an out-of-process read and the click.
    const label = document.querySelector('#world-camera-state')?.getAttribute('aria-label') ?? '';
    const parsed = /^World camera (-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?) at (\\d+(?:\\.\\d+)?)x$/u.exec(label);
    if (!parsed) throw new Error('Invalid camera label: ' + label);
    const camera = { x: Number(parsed[1]), y: Number(parsed[2]), zoom: Number(parsed[3]) };
    const bounds = viewport.getBoundingClientRect();
    const clientX = bounds.left + (${tile.x} * 32 + 16 - camera.x) * camera.zoom;
    const clientY = bounds.top + (${tile.y} * 32 + 16 - camera.y) * camera.zoom;
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX, clientY, pointerId: 91 }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX, clientY, pointerId: 91 }));
  })()`, true);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
}

const WORLD_ROUTE_ATTEMPT_TIMEOUT_MS = 60_000;

async function reachWorldTile(
  window: BrowserWindow,
  tile: Readonly<{ x: number; y: number }>,
  options: Readonly<{ nativeClick?: boolean; timeoutMilliseconds?: number }> = {},
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    if (options.nativeClick) await clickWorldTile(window, tile);
    else await dispatchWorldTileClick(window, tile);
    try {
      await waitForWorldTile(window, tile, options.timeoutMilliseconds ?? WORLD_ROUTE_ATTEMPT_TIMEOUT_MS);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

async function reachWorldLocation(
  window: BrowserWindow,
  sourceTile: Readonly<{ x: number; y: number }>,
  destinationMapName: string,
  destinationTile: Readonly<{ x: number; y: number }>,
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    await dispatchWorldTileClick(window, sourceTile);
    try {
      await waitForWorldLocation(window, destinationMapName, destinationTile, WORLD_ROUTE_ATTEMPT_TIMEOUT_MS);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

type MovementSmokeActor = Readonly<{
  committed: Readonly<{ x: number; y: number }>;
  visualFoot: Readonly<{ x: number; y: number }>;
  direction: 'up' | 'down' | 'left' | 'right';
  walkFrame: 0 | 1;
  status: 'idle' | 'moving' | 'waiting' | 'unreachable';
  target?: Readonly<{ x: number; y: number }> | null;
  curveActive: boolean;
  horizontalRunDistance?: number;
  protagonistWobbleDegrees?: number;
  /** Null when the actor was culled from the frame, so nothing was drawn for it. */
  gaitBobPixels?: number | null;
  renderedAngleDegrees?: number | null;
  footPlantIndex?: number | null;
}>;

type MovementSmokeState = Readonly<{
  reducedMotion: boolean;
  player: MovementSmokeActor;
  npcs: Readonly<Record<string, MovementSmokeActor>>;
}>;

type MovementSmokeSample = MovementSmokeState & Readonly<{
  evidenceTag?: 'interruption';
}>;

async function movementSmokeState(window: BrowserWindow): Promise<MovementSmokeState> {
  const label = await window.webContents.executeJavaScript(
    `document.querySelector('#world-movement-state')?.getAttribute('aria-label') ?? ''`,
    true,
  ) as string;
  if (!label) throw new Error('Natural-movement smoke evidence is missing.');
  const candidate = JSON.parse(label) as MovementSmokeState;
  if (
    !candidate.player || !candidate.npcs || typeof candidate.reducedMotion !== 'boolean' ||
    !Number.isFinite(candidate.player.visualFoot?.x) || !Number.isFinite(candidate.player.visualFoot?.y)
  ) throw new Error('Natural-movement smoke evidence is invalid.');
  return candidate;
}

async function waitForMovementSmokeState(
  window: BrowserWindow,
  predicate: (state: MovementSmokeState) => boolean,
  timeoutMilliseconds = 12_000,
): Promise<MovementSmokeState> {
  const deadline = Date.now() + timeoutMilliseconds;
  let last: MovementSmokeState | undefined;
  while (Date.now() < deadline) {
    await waitForRendererPaint(window);
    last = await movementSmokeState(window);
    if (predicate(last)) return last;
  }
  throw new Error(`Natural-movement smoke state timed out. Last: ${JSON.stringify(last)}`);
}

type RendererParityState = Readonly<{
  mapId: string;
  mapHash: string;
  presentationHash: string;
  atlasHash: string;
  camera: Readonly<{ x: number; y: number; zoom: number }>;
  viewport: Readonly<{ width: number; height: number }>;
  devicePixelRatio: number;
  hiddenRoofGroupId: string | null;
  characters: readonly Readonly<{ id: string; worldX: number; worldY: number }>[];
  doors: readonly Record<string, unknown>[];
  doorPhases: Readonly<Record<string, string>>;
  movement: Readonly<{ direction: string; status: string; walkFrame: number }>;
  selectionRing: Readonly<{ worldX: number; worldY: number }>;
  destinationPulse: Record<string, unknown> | null;
  journalMarkers: readonly Record<string, unknown>[];
  failureMarker: Record<string, unknown> | null;
  visibleEffectIds: readonly string[];
  fallbackEmitterIds: readonly string[];
}>;

async function rendererParityState(window: BrowserWindow): Promise<RendererParityState> {
  const label = await window.webContents.executeJavaScript(
    `document.querySelector('#world-renderer-parity-state')?.getAttribute('aria-label') ?? ''`,
    true,
  ) as string;
  if (!label) throw new Error('Renderer parity state is missing.');
  return JSON.parse(label) as RendererParityState;
}

async function waitForRendererParityState(
  window: BrowserWindow,
  predicate: (state: RendererParityState) => boolean,
  timeoutMilliseconds = 12_000,
): Promise<RendererParityState> {
  const deadline = Date.now() + timeoutMilliseconds;
  let last: RendererParityState | undefined;
  while (Date.now() < deadline) {
    await waitForRendererPaint(window);
    last = await rendererParityState(window);
    if (predicate(last)) return last;
  }
  throw new Error(`Renderer parity state timed out. Last: ${JSON.stringify(last)}`);
}

async function captureRendererParitySmoke(
  window: BrowserWindow,
  directory: string,
): Promise<Record<string, unknown>> {
  await mkdir(directory, { recursive: true });
  await resizeContentAndWait(window, 1_280, 720);
  await clickZoomButton(window, 1);
  if (parseWorldStateLabel(await worldStateLabel(window)).speed === 0) await clickAriaButton(window, 'Set 1x time');

  const fixtures: Record<string, unknown>[] = [];
  const capture = async (id: string): Promise<void> => {
    await window.webContents.executeJavaScript('window.siWorldFreezeRendererParityFrame?.()', true);
    await waitForRendererPaint(window);
    await waitForRendererPaint(window);
    const screenshot = `${id}-${effectiveRenderer}-1x.png`;
    const state = await rendererParityState(window);
    await captureSmokeScreenshot(window, join(directory, screenshot));
    fixtures.push({ id, screenshot, state });
  };

  await reachWorldTile(window, { x: 17, y: 25 });
  await clickAriaButton(window, 'Pause time');
  sendKey(window, 'F');
  await waitForRendererPaint(window);
  await waitForRoofLabel(window, 'Villa roof restored');
  await capture('villa-exterior-idle');

  await window.webContents.executeJavaScript("window.siWorldOpenRendererMotionFixture?.('door-transition')", true);
  await waitForRendererParityState(window, ({ doorPhases }) => (
    Object.values(doorPhases).some((phase) => phase === 'opening')
  ));
  await capture('villa-door-transition');
  await clickAriaButton(window, 'Set 1x time');
  await reachWorldTile(window, { x: 17, y: 23 });
  await clickAriaButton(window, 'Pause time');
  await waitForRoofLabel(window, 'Villa roof hidden');
  await capture('villa-interior-roof-hidden');

  await window.webContents.executeJavaScript("window.siWorldOpenRendererMotionFixture?.('walk-east-frame-1')", true);
  await waitForRendererParityState(window, ({ movement }) => (
    movement.status === 'moving' && movement.direction === 'right' && movement.walkFrame === 1
  ));
  await capture('villa-walk-east-frame-1');
  await clickAriaButton(window, 'Set 1x time');
  await waitForWorldTile(window, { x: 20, y: 23 });

  const selectionNpcTile = { x: 27, y: 28 };
  await reachWorldTile(window, { x: selectionNpcTile.x + 1, y: selectionNpcTile.y });
  await clickAriaButton(window, 'Pause time');
  await dispatchWorldTileClick(window, selectionNpcTile);
  await waitForRendererParityState(window, ({ characters, selectionRing }) => {
    const selectedNpc = characters.find(({ id }) => id === 'generic_resident');
    return selectedNpc !== undefined && selectionRing.worldX === selectedNpc.worldX + 12 &&
      selectionRing.worldY === selectedNpc.worldY + 27;
  });
  await capture('villa-selected-npc');

  await window.webContents.executeJavaScript('window.siWorldOpenRendererFeedbackFixture?.()', true);
  await waitForRendererParityState(window, (state) => (
    state.destinationPulse !== null && state.journalMarkers.length > 0 && state.failureMarker !== null
  ));
  await capture('villa-destination-journal-failure');

  let contextLifecycle: Record<string, unknown> | null = null;
  if (effectiveRenderer === 'threejs-2d') {
    const before = await window.webContents.executeJavaScript('window.siWorldThreeRendererEvidence?.()', true) as Record<string, unknown>;
    const supported = await window.webContents.executeJavaScript(`(() => {
      const canvas = document.querySelector('#threejs-world-canvas canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
      if (!extension) return false;
      extension.loseContext();
      setTimeout(() => extension.restoreContext(), 250);
      return true;
    })()`, true) as boolean;
    if (!supported) throw new Error('Three.js context lifecycle smoke requires WEBGL_lose_context.');
    await waitForSelector(window, '#world-renderer-recovery-overlay', 4_000);
    await waitForSelectorMissing(window, '#world-renderer-recovery-overlay', 8_000);
    await waitForRendererPaint(window);
    const after = await window.webContents.executeJavaScript('window.siWorldThreeRendererEvidence?.()', true) as Record<string, unknown>;
    contextLifecycle = { supported, lossOverlayObserved: true, restored: true, before, after };
  }

  return {
    schemaVersion: 1,
    rendererKind: effectiveRenderer,
    fixtures,
    contextLifecycle,
  };
}

/**
 * One scene per district, held still while only the sun moves.
 *
 * The continuous day sweep is the one claim in the lighting work that a unit test cannot make:
 * "the light sweeps across the day" is a picture or it is a sentence. Each district is captured at
 * the same camera, the same zoom and the same fixture at four times of day, so any difference
 * between the four frames is the sun and nothing else.
 */
const DAY_SWEEP_MINUTES = Object.freeze([360, 720, 1_080, 1_320]);
const DAY_SWEEP_SCENES = Object.freeze([
  { mapId: 'northwest_residential', effectId: 'patio-fire' },
  { mapId: 'northeast_downtown', effectId: 'club-neon-east' },
  { mapId: 'southwest_commercial', effectId: 'courtyard-insects' },
  { mapId: 'southeast_docks', effectId: 'yard-steam' },
] as const);

async function captureDaySweepSmoke(
  window: BrowserWindow,
  directory: string,
): Promise<Record<string, unknown>> {
  await mkdir(directory, { recursive: true });
  await startResponsiveSmokeGame(window);
  if (parseWorldStateLabel(await worldStateLabel(window)).speed !== 0) {
    await clickAriaButton(window, 'Pause time');
  }
  await clickZoomButton(window, 1);
  // INTERIOR FIRST, before any fixture walks the player across the island.
  //
  // No VFX fixture can frame this: every authored effect on every map sits outdoors, so opening
  // one would walk the player out of the building. The packaged new game starts on the patio, not
  // on the villa floor, so the player is walked to the middle of the roofed room. A roofed room
  // must NOT track the sun, so these four frames are the check that indoor shadows and indoor
  // floor hue hold still while the sixteen outdoor ones sweep.
  //
  // The player already STARTS on the villa floor at 18,18; it is the camera that starts elsewhere
  // and only follows once the player moves. Time is paused here, so walking is not an option —
  // centring is, and it needs no movement at all.
  sendKey(window, 'F');
  await waitForRendererPaint(window);
  const interiorFrames: Record<string, unknown>[] = [];
  for (const minute of DAY_SWEEP_MINUTES) {
    await window.webContents.executeJavaScript(`window.siWorldSetSmokeMinute?.(${minute})`, true);
    await waitForWorldState(window, (state) => state.minute % 1_440 === minute % 1_440, 10_000);
    await waitForRendererPaint(window);
    await waitForRendererPaint(window);
    const screenshot = `villa-interior-minute-${minute.toString().padStart(4, '0')}.png`;
    await captureSmokeScreenshot(window, join(directory, screenshot));
    interiorFrames.push({ minute, screenshot, camera: parseCameraLabel(await cameraLabel(window)) });
  }

  const frames: Record<string, unknown>[] = [];
  for (const scene of DAY_SWEEP_SCENES) {
    for (const minute of DAY_SWEEP_MINUTES) {
      await window.webContents.executeJavaScript(
        `window.siWorldOpenVfxFixture?.(${JSON.stringify(scene.mapId)}, ${JSON.stringify(scene.effectId)}, ${minute})`,
        true,
      );
      await waitForVfxEvidence(window, (candidate) => candidate.mapId === scene.mapId);
      await waitForWorldState(window, (state) => state.minute % 1_440 === minute % 1_440, 10_000);
      await waitForRendererPaint(window);
      await waitForRendererPaint(window);
      const screenshot = `${scene.mapId}-minute-${minute.toString().padStart(4, '0')}.png`;
      await captureSmokeScreenshot(window, join(directory, screenshot));
      frames.push({
        ...scene,
        minute,
        screenshot,
        camera: parseCameraLabel(await cameraLabel(window)),
      });
    }
  }
  if (frames.length !== DAY_SWEEP_SCENES.length * DAY_SWEEP_MINUTES.length) {
    throw new Error(`Day sweep captured ${frames.length} frames.`);
  }
  return {
    schemaVersion: 1,
    minutes: [...DAY_SWEEP_MINUTES],
    frames,
    interiorFrames,
  };
}

async function captureRendererAllMapsSmoke(
  window: BrowserWindow,
  directory: string,
): Promise<Record<string, unknown>> {
  await mkdir(directory, { recursive: true });
  const devicePixelRatio = await window.webContents.executeJavaScript('window.devicePixelRatio', true) as number;
  // Stage 3 amendment 2026-08-15: each packaged window owns one DPR and one VFX mode.
  const vfxMode = smokeVfxMode === 'circle' ? 'circle' : 'procedural';
  const cases = ALL_MAP_PARITY_CASES.filter((entry) => (
    entry.devicePixelRatio === devicePixelRatio && entry.vfxMode === vfxMode
  ));
  if (cases.length === 0) {
    throw new Error(`No all-map parity cases are locked for DPR ${devicePixelRatio} in ${vfxMode} mode.`);
  }
  if (parseWorldStateLabel(await worldStateLabel(window)).speed !== 0) await clickAriaButton(window, 'Pause time');

  const fixtures: Record<string, unknown>[] = [];
  for (const entry of cases) {
    await resizeContentAndWait(window, entry.viewport.width, entry.viewport.height);
    await clickZoomButton(window, entry.zoom);
    await window.webContents.executeJavaScript(
      `window.siWorldOpenVfxFixture?.(${JSON.stringify(entry.mapId)}, ${JSON.stringify(entry.effectId)})`,
      true,
    );
    await waitForVfxEvidence(window, (candidate) => (
      candidate.mapId === entry.mapId &&
      Array.isArray(candidate.visibleEmitterIds) &&
      candidate.visibleEmitterIds.includes(entry.effectId)
    ));
    await window.webContents.executeJavaScript('window.siWorldFreezeRendererParityFrame?.()', true);
    const state = await waitForRendererParityState(window, (candidate) => (
      candidate.mapId === entry.mapId &&
      candidate.camera.zoom === entry.zoom &&
      candidate.devicePixelRatio === entry.devicePixelRatio
    ));
    await waitForRendererPaint(window);
    await waitForRendererPaint(window);
    const screenshot = `${entry.id}-${effectiveRenderer}.png`;
    await captureSmokeScreenshot(window, join(directory, screenshot));
    const rendererEvidence = effectiveRenderer === 'threejs-2d'
      ? await window.webContents.executeJavaScript('window.siWorldThreeRendererEvidence?.() ?? null', true) as Record<string, unknown> | null
      : null;
    if (effectiveRenderer === 'threejs-2d' && !rendererEvidence) {
      throw new Error(`Three.js renderer evidence is missing for ${entry.id}.`);
    }
    fixtures.push({ ...entry, screenshot, state, rendererEvidence });
  }

  const zoomSampling = devicePixelRatio === 1 && vfxMode === 'procedural'
    ? await captureRendererZoomSampling(window, join(directory, 'zoom'))
    : null;
  return {
    schemaVersion: 1,
    rendererKind: effectiveRenderer,
    devicePixelRatio,
    vfxMode,
    fixtures,
    zoomSampling,
  };
}

/**
 * Stage 3 amendment 2026-08-15: every saved zoom now yields a rendered crop as well as
 * presentation evidence, so the report can prove pixels instead of texture settings alone.
 * The crop rect is fixed and identical for both renderers.
 */
const ZOOM_SAMPLING_CROP = Object.freeze({ x: 560, y: 280, width: 160, height: 160 });

async function captureRendererZoomSampling(
  window: BrowserWindow,
  directory: string,
): Promise<Record<string, unknown>> {
  await resizeContentAndWait(window, 1_280, 720);
  await mkdir(directory, { recursive: true });
  // Center the camera so the fixed crop holds the player for both renderers.
  sendKey(window, 'F');
  await waitForRendererPaint(window);
  const samples: Record<string, unknown>[] = [];
  for (let index = 0; index <= 40; index += 1) {
    const zoom = Math.round((1 + index * 0.05) * 100) / 100;
    await window.webContents.executeJavaScript(`window.siWorldSetRendererTestZoom?.(${zoom})`, true);
    await waitForRendererParityState(window, (state) => state.camera.zoom === zoom);
    const deadline = Date.now() + 4_000;
    let evidence: Record<string, unknown> | null = null;
    while (Date.now() < deadline) {
      await waitForRendererPaint(window);
      evidence = await window.webContents.executeJavaScript(
        'window.siWorldThreeRendererEvidence?.() ?? null',
        true,
      ) as Record<string, unknown> | null;
      if (effectiveRenderer !== 'threejs-2d' || evidence?.presentedZoom === zoom) break;
    }
    if (effectiveRenderer === 'threejs-2d' && evidence?.presentedZoom !== zoom) {
      throw new Error(`Three.js did not present saved zoom ${zoom}.`);
    }
    const crop = `zoom-${zoom.toFixed(2)}-${effectiveRenderer}.png`;
    await waitForRendererPaint(window);
    await captureSmokeScreenshot(window, join(directory, crop), undefined, ZOOM_SAMPLING_CROP);
    samples.push({
      zoom,
      inputStep: Number.isInteger(zoom * 10),
      savedBoundary: true,
      crop,
      ...(smokeRenderer === 'threejs-2d' && evidence ? {
        presentedZoom: evidence.presentedZoom,
        atlasSampling: evidence.atlasSampling,
      } : {}),
    });
  }
  return { schemaVersion: 1, crop: ZOOM_SAMPLING_CROP, samples };
}

async function startMovementSmokeSampling(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(`(() => {
    if (globalThis.__siWorldMovementSampler) {
      throw new Error('Natural-movement sampling is already active.');
    }
    const element = document.querySelector('#world-movement-state');
    if (!(element instanceof HTMLElement)) {
      throw new Error('Natural-movement smoke evidence is missing.');
    }
    const sampler = { samples: [], observer: null };
    globalThis.__siWorldMovementSampler = sampler;
    const record = (label) => {
      if (label && sampler.samples.length < 900) sampler.samples.push(JSON.parse(label));
    };
    sampler.observer = new MutationObserver((records) => {
      for (const mutation of records) record(mutation.oldValue ?? '');
      record(element.getAttribute('aria-label') ?? '');
    });
    sampler.observer.observe(element, {
      attributeFilter: ['aria-label'],
      attributeOldValue: true,
      attributes: true,
    });
    record(element.getAttribute('aria-label') ?? '');
  })()`, true);
}

async function stopMovementSmokeSampling(window: BrowserWindow): Promise<MovementSmokeState[]> {
  return window.webContents.executeJavaScript(`(() => {
    const sampler = globalThis.__siWorldMovementSampler;
    if (!sampler) throw new Error('Natural-movement sampling was not started.');
    sampler.observer.disconnect();
    delete globalThis.__siWorldMovementSampler;
    return sampler.samples;
  })()`, true) as Promise<MovementSmokeState[]>;
}

async function captureMovementPass(
  window: BrowserWindow,
  directory: string,
  mode: 'standard' | 'reduced',
): Promise<Record<string, unknown>> {
  await startResponsiveSmokeGame(window);
  await clickZoomButton(window, 1);
  await clickAriaButton(window, 'Set 1x time');
  await waitForWorldState(window, (state) => state.speed === 1, 10_000);
  const npcMotionFixture = await window.webContents.executeJavaScript(`(() => {
    if (typeof window.siWorldStartNaturalMovementFixture !== 'function') {
      throw new Error('Natural-movement NPC fixture is unavailable.');
    }
    return window.siWorldStartNaturalMovementFixture();
  })()`, true) as unknown;
  if (JSON.stringify(npcMotionFixture) !== JSON.stringify({
    npcId: 'linda', source: 'fixture', target: { x: 23, y: 28 },
  })) throw new Error('Natural-movement NPC fixture returned an invalid descriptor.');
  await waitForRendererPaint(window);

  const start = { x: 18, y: 18 };
  const target = { x: 22, y: 22 };
  await startMovementSmokeSampling(window);
  await dispatchWorldTileClick(window, target);
  const samples: MovementSmokeSample[] = [];
  const screenshotNames: string[] = [];
  const screenshotBuffers: Buffer[] = [];

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await waitForRendererPaint(window);
    const sample = await movementSmokeState(window);
    if (sample.player.status === 'moving' && screenshotNames.length < (mode === 'standard' ? 4 : 1)) {
      const name = `${mode}-1x-frame-${String(screenshotNames.length + 1).padStart(2, '0')}.png`;
      screenshotBuffers.push(await captureDistinctSmokeScreenshot(
        window,
        join(directory, name),
        screenshotBuffers,
        4_000,
      ));
      screenshotNames.push(name);
    }
    const atTarget = sample.player.committed.x === target.x && sample.player.committed.y === target.y;
    if (atTarget && sample.player.status === 'idle') break;
  }
  const lastRouteSample = await movementSmokeState(window);
  if (lastRouteSample.player.committed.x !== target.x || lastRouteSample.player.committed.y !== target.y) {
    throw new Error(`Natural-movement package pass did not reach the diagonal target. Last: ${JSON.stringify(lastRouteSample.player)}`);
  }
  const routeSamples = await stopMovementSmokeSampling(window);
  samples.push(...routeSamples);

  let interruptionObserved = false;
  let rendererFps: number | null = null;
  let displayRafFps: number | null = null;
  if (mode === 'standard') {
    for (const zoom of [2, 3] as const) {
      await clickZoomButton(window, zoom);
      const destination = zoom === 2 ? start : target;
      await dispatchWorldTileClick(window, destination);
      await waitForMovementSmokeState(window, (state) => state.player.status === 'moving');
      const name = `standard-${zoom}x-moving.png`;
      screenshotBuffers.push(await captureDistinctSmokeScreenshot(window, join(directory, name), screenshotBuffers, 4_000));
      screenshotNames.push(name);
      await waitForMovementSmokeState(window, (state) => (
        state.player.status === 'idle' &&
        state.player.committed.x === destination.x && state.player.committed.y === destination.y
      ));
    }

    await dispatchWorldTileClick(window, start);
    await waitForMovementSmokeState(window, (state) => state.player.status === 'moving');
    await startMovementSmokeSampling(window);
    await dispatchWorldTileClick(window, { x: 24, y: 22 });
    const interrupted = await waitForMovementSmokeState(window, (state) => (
      state.player.status === 'moving' && state.player.target?.x === 24 && state.player.target.y === 22
    ));
    samples.push({ ...interrupted, evidenceTag: 'interruption' });
    interruptionObserved = interrupted.player.committed.x !== 24 || interrupted.player.committed.y !== 22;
    const interruptName = 'standard-interruption.png';
    screenshotBuffers.push(await captureDistinctSmokeScreenshot(window, join(directory, interruptName), screenshotBuffers, 4_000));
    screenshotNames.push(interruptName);
    await waitForMovementSmokeState(window, (state) => (
      state.player.status === 'idle' && state.player.committed.x === 24 && state.player.committed.y === 22
    ), 20_000);
    samples.push(...await stopMovementSmokeSampling(window));

    await clickZoomButton(window, 1);
    await dispatchWorldTileClick(window, { x: 40, y: 36 });
    await waitForMovementSmokeState(window, (state) => state.player.status === 'moving');
    const performance = await measureRendererFps(window, 2_000);
    rendererFps = performance.rendererFps;
    displayRafFps = performance.displayRafFps;
    const crowdName = 'standard-crowd-performance.png';
    screenshotBuffers.push(await captureDistinctSmokeScreenshot(window, join(directory, crowdName), screenshotBuffers, 4_000));
    screenshotNames.push(crowdName);
  }

  const emittedSamples = samples.map((sample) => ({
    ...sample,
    npcs: Object.fromEntries(
      Object.entries(sample.npcs).filter(([, movement]) => movement.status === 'moving'),
    ),
  }));
  return {
    schemaVersion: 4,
    mode,
    npcMotionSource: 'fixture',
    npcMotionNpcId: 'linda',
    samples: emittedSamples,
    firstSegmentUniquePositions: new Set(emittedSamples.filter(({ player }) => (
      player.committed.x === start.x && player.committed.y === start.y
    )).map(({ player }) => `${player.visualFoot.x},${player.visualFoot.y}`)).size,
    curveObserved: emittedSamples.some(({ player }) => player.curveActive),
    interruptionObserved,
    playerWalkFrames: [...new Set(emittedSamples.map(({ player }) => player.walkFrame))].sort(),
    npcWalkFrames: [...new Set(emittedSamples.flatMap(({ npcs }) => (
      Object.values(npcs).map(({ walkFrame }) => walkFrame)
    )))].sort(),
    rendererFps,
    displayRafFps,
    screenshotNames,
  };
}

async function panWorld(window: BrowserWindow, deltaX: number, deltaY: number): Promise<void> {
  const bounds = await surfaceBounds(window);
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  window.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(start.x), y: Math.round(start.y), button: 'middle', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(start.x + deltaX), y: Math.round(start.y + deltaY), button: 'middle' });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(start.x + deltaX), y: Math.round(start.y + deltaY), button: 'middle', clickCount: 1 });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
  await waitForRendererPaint(window);
}

type ResponsiveSmokeTarget = Readonly<{ width: number; height: number }>;

const RESPONSIVE_SMOKE_TARGETS: readonly ResponsiveSmokeTarget[] = [
  { width: 1_280, height: 720 },
  { width: 1_440, height: 900 },
  { width: 1_920, height: 1_080 },
  { width: 2_560, height: 1_440 },
  { width: 1_600, height: 720 },
];

const FULL_CAST_PORTRAIT_IDS = CHARACTER_IDS;

function cameraCenter(camera: Readonly<{ x: number; y: number; zoom: number }>, bounds: SurfaceBounds) {
  return {
    x: Math.round((camera.x + bounds.width / camera.zoom / 2) * 100) / 100,
    y: Math.round((camera.y + bounds.height / camera.zoom / 2) * 100) / 100,
  };
}

async function measureRendererFps(window: BrowserWindow, durationMilliseconds = 2_000): Promise<Readonly<{
  rendererFps: number;
  displayRafFps: number;
  medianFrameTimeMilliseconds: number;
  sampledFrames: number;
  cameraChangeFrames: number;
}>> {
  return await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const surface = document.querySelector('#world-input-surface');
      if (!surface) {
        reject(new Error('World input surface is missing for active-render measurement.'));
        return;
      }
      const startedAt = performance.now();
      const frames = [];
      let cameraChangeFrames = 0;
      let lastCamera = document.querySelector('#world-camera-state')?.getAttribute('aria-label') ?? '';
      let panDirection = 6;
      const frame = (now) => {
        frames.push(now);
        const camera = document.querySelector('#world-camera-state')?.getAttribute('aria-label') ?? '';
        if (camera !== lastCamera) {
          cameraChangeFrames += 1;
          lastCamera = camera;
        }
        if (now - startedAt >= ${durationMilliseconds}) {
          const duration = frames.length > 1 ? frames[frames.length - 1] - frames[0] : 0;
          const displayRafFps = duration > 0 ? (frames.length - 1) * 1000 / duration : 0;
          const rendererFps = duration > 0 ? cameraChangeFrames * 1000 / duration : 0;
          const intervals = frames.slice(1).map((value, index) => value - frames[index]).sort((left, right) => left - right);
          const middle = Math.floor(intervals.length / 2);
          const medianFrameTimeMilliseconds = intervals.length === 0
            ? 0
            : intervals.length % 2 === 0
              ? (intervals[middle - 1] + intervals[middle]) / 2
              : intervals[middle];
          resolve({
            rendererFps: Math.round(rendererFps * 100) / 100,
            displayRafFps: Math.round(displayRafFps * 100) / 100,
            medianFrameTimeMilliseconds: Math.round(medianFrameTimeMilliseconds * 1000) / 1000,
            sampledFrames: frames.length,
            cameraChangeFrames,
          });
          return;
        }
        surface.dispatchEvent(new CustomEvent('si-world-active-pan-proof', {
          detail: { x: 0, y: panDirection },
        }));
        panDirection = -panDirection;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    })`, true) as Readonly<{
      rendererFps: number;
      displayRafFps: number;
      medianFrameTimeMilliseconds: number;
      sampledFrames: number;
      cameraChangeFrames: number;
    }>;
}

async function startResponsiveSmokeGame(window: BrowserWindow): Promise<void> {
  await waitForSelector(window, '#new-game-flow, #world-state');
  const active = await window.webContents.executeJavaScript("Boolean(document.querySelector('#world-state'))", true) as boolean;
  if (active) return;
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[aria-label="Player name"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('Player name input is missing.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'MATRIX');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  })()`, true);
  sendKey(window, 'Enter');
  await waitForSelector(window, '#world-state', 20_000);
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 1');
  await clickAriaButton(window, 'Pause time');
}

async function openLindaConversationForResponsiveSmoke(window: BrowserWindow): Promise<Record<string, unknown>> {
  const lindaTile = parseLindaTile(await npcStateLabel(window));
  const approachTile = { x: lindaTile.x + 1, y: lindaTile.y };
  await clickAriaButton(window, 'Set 1x time');
  await reachWorldTile(window, approachTile);
  await clickAriaButton(window, 'Pause time');
  await dispatchWorldTileClick(window, lindaTile);
  await waitForAriaButtonEnabled(window, 'Talk to Linda');
  await clickAriaButton(window, 'Talk to Linda');
  await waitForSelector(window, '#world-ui-quest-offer-panel, #world-ui-conversation-panel');
  if (await window.webContents.executeJavaScript(`Boolean(document.querySelector('#world-ui-quest-offer-panel'))`, true) as boolean) {
    await clickAriaButton(window, "Accept Linda's request");
    await waitForSelectorMissing(window, '#world-ui-quest-offer-panel');
    await clickAriaButton(window, 'Talk to Linda');
  }
  await waitForRendererText(window, '#world-ui-conversation-panel', 'TIME PAUSED');
  return waitForResponsiveEvidence(window, (evidence) => {
    const panel = evidence.activePanel as { id?: unknown; rect?: { width?: unknown; height?: unknown } } | null;
    const input = evidence.conversationInput as { width?: unknown; height?: unknown } | null;
    return panel?.id === 'world-ui-conversation-panel' && Number(panel.rect?.width) > 0 &&
      Number(panel.rect?.height) > 0 && Number(input?.width) > 0 && Number(input?.height) > 0;
  });
}

async function captureFullCastPortraitMatrix(
  window: BrowserWindow,
  directory: string,
): Promise<readonly Record<string, unknown>[]> {
  if (responsiveHighDpiMode) throw new Error('Full-cast portrait smoke must use the ordinary responsive shell.');
  await resizeContentAndWait(window, 1_440, 900, 10_000);
  const entries: Record<string, unknown>[] = [];
  const portraitDirectory = join(directory, 'full-cast-portraits');
  await mkdir(portraitDirectory, { recursive: true });

  for (const uiScale of [1, 1.25, 1.5] as const) {
    const percentage = uiScale === 1 ? 100 : uiScale === 1.25 ? 125 : 150;
    await clickUiScaleButton(window, percentage);
    await waitForResponsiveEvidence(window, (evidence) => evidence.uiScale === uiScale);
    for (const characterId of FULL_CAST_PORTRAIT_IDS) {
      await window.webContents.executeJavaScript(
        `window.siWorldOpenConversationFixture?.(${JSON.stringify(characterId)})`,
        true,
      );
      await waitForSelector(window, `#conversation-portrait-${characterId}`, 10_000);
      await waitForSelector(window, `#conversation-portrait-${characterId}-ready`, 10_000);
      await waitForRendererText(window, '#world-ui-conversation-panel', 'TIME PAUSED', 10_000);
      await waitForRendererPaint(window);
      await waitForRendererPaint(window);
      const evidence = await waitForResponsiveEvidence(window, (candidate) => (
        candidate.uiScale === uiScale &&
        (candidate.activePanel as { id?: unknown } | null)?.id === 'world-ui-conversation-panel' &&
        candidate.conversationInput !== null
      ));
      const geometry = await window.webContents.executeJavaScript(`(() => {
        const portrait = document.querySelector(${JSON.stringify(`#conversation-portrait-${characterId}`)});
        const input = document.querySelector('[aria-label="Conversation message"]');
        const transcript = document.querySelector('#conversation-transcript');
        if (!(portrait instanceof HTMLElement) || !(input instanceof HTMLElement) || !(transcript instanceof HTMLElement)) {
          throw new Error('Full-cast portrait fixture is incomplete.');
        }
        const rectangle = (element) => {
          const value = element.getBoundingClientRect();
          return { x: value.x, y: value.y, width: value.width, height: value.height };
        };
        return {
          portraitRect: rectangle(portrait),
          inputRect: rectangle(input),
          transcriptFontSize: Number.parseFloat(getComputedStyle(transcript).fontSize),
        };
      })()`, true) as Record<string, unknown>;
      const screenshot = `full-cast-portraits/${percentage}-${characterId}.png`;
      await captureSmokeScreenshot(window, join(directory, screenshot));
      entries.push({ characterId, uiScale, screenshot, evidence, ...geometry });
      await window.webContents.executeJavaScript('window.siWorldCloseConversationFixture?.()', true);
      await waitForSelectorMissing(window, '#world-ui-conversation-panel');
    }
  }
  return entries;
}

async function captureResponsiveSmoke(
  window: BrowserWindow,
  directory: string,
): Promise<Record<string, unknown>> {
  await startResponsiveSmokeGame(window);
  const geometry = await geometryEvidence(window);
  const targets = responsiveHighDpiMode ? [RESPONSIVE_SMOKE_TARGETS[3]!] : RESPONSIVE_SMOKE_TARGETS;
  const targetReports: Record<string, unknown>[] = [];
  let clickAlternate = false;

  for (const target of targets) {
    const label = `${target.width}x${target.height}`;
    process.stdout.write(`SI_WORLD_RESPONSIVE_PROGRESS ${label}\n`);
    const beforeBounds = await surfaceBounds(window);
    const beforeCamera = parseCameraLabel(await cameraLabel(window));
    const centerBefore = cameraCenter(beforeCamera, beforeBounds);
    const bounds = await resizeContentAndWait(window, target.width, target.height, 10_000);
    const afterResizeEvidence = await waitForResponsiveEvidence(window, (evidence) => {
      const content = evidence.content as { width?: unknown; height?: unknown } | undefined;
      const candidateSurface = evidence.surface as { width?: unknown; height?: unknown } | undefined;
      const overflow = evidence.overflow as { body?: unknown; surface?: unknown } | undefined;
      return content?.width === target.width && content.height === target.height &&
        typeof candidateSurface?.width === 'number' && typeof candidateSurface.height === 'number' &&
        Math.abs(candidateSurface.width - bounds.width) <= 1 &&
        Math.abs(candidateSurface.height - bounds.height) <= 1 &&
        overflow?.body === false && overflow.surface === false;
    }, 10_000);
    const afterCamera = parseCameraLabel(await cameraLabel(window));
    const centerAfter = cameraCenter(afterCamera, bounds);

    const zoomScreenshots: string[] = [];
    const zoomBuffers: Buffer[] = [];
    for (const zoom of [1, 2, 3] as const) {
      await clickZoomButton(window, zoom);
      await waitForResponsiveEvidence(window, (evidence) => evidence.selectedWorldZoom === zoom);
      const screenshotPath = join(directory, `${label}-${zoom}x.png`);
      zoomBuffers.push(await captureDistinctSmokeScreenshot(window, screenshotPath, zoomBuffers, 4_000));
      zoomScreenshots.push(`${label}-${zoom}x.png`);
    }
    await clickZoomButton(window, 1);
    const clickedTile = clickAlternate ? geometry.start.protagonist : geometry.start.movementTarget;
    clickAlternate = !clickAlternate;
    await clickAriaButton(window, 'Set 1x time');
    await waitForWorldState(window, (state) => state.speed === 1, 10_000);
    await reachWorldTile(window, clickedTile);
    await clickAriaButton(window, 'Pause time');
    await waitForWorldState(window, (state) => state.speed === 0, 10_000);

    const conversationEvidence = await openLindaConversationForResponsiveSmoke(window);
    const conversationScreenshot = join(directory, `${label}-conversation.png`);
    await captureDistinctSmokeScreenshot(window, conversationScreenshot, zoomBuffers, 4_000);
    await clickAriaButton(window, 'Cancel conversation');
    await waitForSelectorMissing(window, '#world-ui-conversation-panel');

    targetReports.push({
      requested: target,
      measuredSurface: bounds,
      centerBefore,
      centerAfter,
      clickedTile,
      afterResizeEvidence,
      conversationEvidence,
      screenshots: { zoom: zoomScreenshots, conversation: `${label}-conversation.png` },
    });
  }

  const fullCastPortraitMatrix = fullCastPortraitSmokeMode
    ? await captureFullCastPortraitMatrix(window, directory)
    : null;

  let maximumLoad: Record<string, unknown> | null = null;
  if (responsiveHighDpiMode) {
    await clickZoomButton(window, 1);
    await clickAriaButton(window, 'Set 1x time');
    await waitForWorldState(window, (state) => state.speed === 1, 10_000);
    await reachWorldTile(window, geometry.roof.exteriorTile);
    await clickAriaButton(window, 'Pause time');
    await waitForWorldState(window, (state) => state.speed === 0, 10_000);
    await waitForRoofLabel(window, 'Villa roof restored', 10_000);
    const evidence = await waitForResponsiveEvidence(window, (candidate) =>
      candidate.selectedWorldZoom === 1 && candidate.roofState === 'restored');
    const drawCounts = evidence.drawCounts as Record<string, number> | undefined;
    const ordinaryLayers = ['floor', 'prop', 'shadow', 'character', 'effect', 'wall', 'roof'];
    const allOrdinaryLayersEnabled = ordinaryLayers.every((layer) => Number(drawCounts?.[layer]) > 0);
    const rendererMeasurement = await measureRendererFps(window);
    const roundedFps = Math.round(rendererMeasurement.rendererFps);
    const qualificationRequired = process.env.SI_WORLD_SMOKE_PROFILE === 'qualification';
    if (Number(evidence.devicePixelRatio) < 2) throw new Error('High-DPI smoke did not reach device pixel ratio 2.');
    if (!allOrdinaryLayersEnabled) {
      throw new Error(`Maximum-load smoke did not include every ordinary world layer: ${JSON.stringify(drawCounts)}`);
    }
    if (qualificationRequired && roundedFps < 60) {
      throw new Error(`Maximum-load active-render rounded FPS is below 60: ${roundedFps}.`);
    }
    const screenshotName = 'maximum-load.png';
    await captureSmokeScreenshot(window, join(directory, screenshotName));
    maximumLoad = {
      evidence,
      ...rendererMeasurement,
      roundedFps,
      qualificationRequired,
      allOrdinaryLayersEnabled,
      screenshot: screenshotName,
    };
  } else {
    await clickZoomButton(window, 3);
    await clickUiScaleButton(window, 125);
    await waitForResponsiveEvidence(window, (evidence) => evidence.selectedWorldZoom === 3 && evidence.uiScale === 1.25);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
  }

  return {
    schemaVersion: 1,
    highDpi: responsiveHighDpiMode,
    requestedDeviceScaleFactor: responsiveDeviceScaleFactor,
    geometry,
    targets: targetReports,
    fullCastPortraitMatrix,
    maximumLoad,
  };
}

async function captureProceduralVfxSmoke(
  window: BrowserWindow,
  directory: string,
): Promise<Record<string, unknown>> {
  await startResponsiveSmokeGame(window);
  await clickAriaButton(window, 'Set 1x time');
  await waitForWorldState(window, (state) => state.speed === 1, 10_000);
  const mode = smokeVfxMode === 'circle' ? 'circle' : 'procedural';
  const motionMode = proceduralVfxReducedMode ? 'reduced' : 'standard';
  const anchorReports: Record<string, unknown>[] = [];

  for (const anchor of EXPECTED_VFX_ANCHORS) {
    await window.webContents.executeJavaScript(
      `window.siWorldOpenVfxFixture?.(${JSON.stringify(anchor.mapId)}, ${JSON.stringify(anchor.id)})`,
      true,
    );
    const fixtureEvidence = await waitForVfxEvidence(window, (candidate) => (
      candidate.mapId === anchor.mapId &&
      Array.isArray(candidate.visibleEmitterIds) &&
      candidate.visibleEmitterIds.includes(anchor.id) &&
      candidate.mode === mode &&
      candidate.reducedMotion === proceduralVfxReducedMode
    ));
    const screenshots: string[] = [];
    for (const zoom of [1, 2, 3] as const) {
      await clickZoomButton(window, zoom);
      await window.webContents.executeJavaScript(
        `window.siWorldOpenVfxFixture?.(${JSON.stringify(anchor.mapId)}, ${JSON.stringify(anchor.id)})`,
        true,
      );
      await waitForVfxEvidence(window, (candidate) => (
        candidate.mapId === anchor.mapId &&
        Array.isArray(candidate.visibleEmitterIds) &&
        candidate.visibleEmitterIds.includes(anchor.id)
      ));
      await window.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))', true);
      const name = `${anchor.mapId}-${anchor.id}-${mode}-${motionMode}-${zoom}x.png`;
      await captureSmokeScreenshot(window, join(directory, name));
      screenshots.push(name);
    }
    anchorReports.push({
      ...anchor,
      fixtureEvidence,
      camera: parseCameraLabel(await cameraLabel(window)),
      screenshots,
    });
  }

  const pauseAnchor = EXPECTED_VFX_ANCHORS.find(({ id }) => id === 'patio-fire');
  if (!pauseAnchor) throw new Error('The patio-fire VFX fixture is missing.');
  await clickZoomButton(window, 1);
  await window.webContents.executeJavaScript(
    `window.siWorldOpenVfxFixture?.(${JSON.stringify(pauseAnchor.mapId)}, ${JSON.stringify(pauseAnchor.id)})`,
    true,
  );
  const activeBefore = await waitForVfxEvidence(window, (candidate) => candidate.mapId === pauseAnchor.mapId);
  if (mode === 'procedural') {
    await waitForVfxEvidence(window, (candidate) => (
      candidate.mapId === pauseAnchor.mapId &&
      Number(candidate.ageStep) > Number(activeBefore.ageStep)
    ));
  } else {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 450));
  }
  await clickAriaButton(window, 'Pause time');
  await waitForWorldState(window, (state) => state.speed === 0, 10_000);
  const pausedBefore = await vfxEvidence(window);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 450));
  const pausedAfter = await vfxEvidence(window);
  if (pausedBefore.ageStep !== pausedAfter.ageStep) {
    throw new Error(`VFX age advanced while paused: ${String(pausedBefore.ageStep)} to ${String(pausedAfter.ageStep)}.`);
  }
  const pausedScreenshot = `patio-fire-${mode}-${motionMode}-paused.png`;
  await captureSmokeScreenshot(window, join(directory, pausedScreenshot));
  await clickAriaButton(window, 'Set 1x time');
  await waitForWorldState(window, (state) => state.speed === 1, 10_000);
  await window.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))', true);
  const resumedEvidence = await vfxEvidence(window);
  const resumedScreenshot = `patio-fire-${mode}-${motionMode}-resumed.png`;
  await captureSmokeScreenshot(window, join(directory, resumedScreenshot));

  const rendererMeasurement = await measureRendererFps(window);
  const roundedFps = Math.round(rendererMeasurement.rendererFps);
  if (process.env.SI_WORLD_SMOKE_PROFILE === 'qualification' && roundedFps < 60) {
    throw new Error(`Procedural VFX package smoke is below 60 rounded FPS: ${roundedFps}.`);
  }

  return {
    schemaVersion: 1,
    mode,
    motionMode,
    artPresentation: await window.webContents.executeJavaScript(
      `document.querySelector('#world-art-presentation')?.getAttribute('aria-label') ?? ''`,
      true,
    ) as string,
    contentSize: Object.freeze((() => {
      const [width, height] = window.getContentSize();
      return { width, height };
    })()),
    devicePixelRatio: await window.webContents.executeJavaScript('window.devicePixelRatio', true) as number,
    anchors: anchorReports,
    pause: {
      frozen: true,
      ageStep: pausedAfter.ageStep,
      pausedScreenshot,
      resumedAgeStep: resumedEvidence.ageStep,
      resumedScreenshot,
    },
    maximumLoad: {
      ...rendererMeasurement,
      roundedFps,
      evidence: resumedEvidence,
    },
  };
}

async function capturePresentationPreferenceSmoke(
  window: BrowserWindow,
  mode: 'seed' | 'restart',
): Promise<Record<string, unknown>> {
  if (mode === 'seed') {
    await startResponsiveSmokeGame(window);
    await clickZoomButton(window, 3);
    await clickUiScaleButton(window, 125);
  } else {
    await waitForSelector(window, '#world-state', 20_000);
  }
  const evidence = await waitForResponsiveEvidence(
    window,
    (candidate) => candidate.selectedWorldZoom === 3 && candidate.uiScale === 1.25,
    20_000,
  );
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 700));
  return { mode, evidence };
}

async function captureSaveMigrationSmoke(
  window: BrowserWindow,
  mode: 'migration' | 'reload',
): Promise<Record<string, unknown>> {
  await waitForSelector(window, '#world-state', 20_000);
  const expectedSaveStatus = mode === 'migration' ? 'MIGRATED GEN 8' : 'LOADED GEN 8';
  await waitForRendererText(window, '#world-save-status', expectedSaveStatus, 20_000);
  const loaded = await window.webContents.executeJavaScript(
    `window.siWorldDesktop?.loadSave('slot-001')`,
    true,
  ) as Record<string, unknown>;
  return {
    mode,
    expectedSaveStatus,
    visibleSaveStatus: await rendererText(window, '#world-save-status'),
    loaded,
    worldStateLabel: await worldStateLabel(window),
  };
}

type WorldSmokeBootstrap = Readonly<{ newGameFlow: boolean; newGameText: string }>;
let worldSmokeBootstrap: WorldSmokeBootstrap | undefined;

async function beginWorldSmoke(window: BrowserWindow, directory: string): Promise<WorldSmokeBootstrap> {
  const progress = (stage: string): void => {
    process.stdout.write(`SI_WORLD_SMOKE_PROGRESS ${stage}\n`);
  };
  progress('new-game');
  await waitForSelector(window, '#new-game-flow');
  await captureSmokeScreenshot(window, join(directory, 'world-new-game.png'));
  const newGameText = (await rendererText(window, '#new-game-flow')).replace(/\s+/gu, ' ').trim();
  const newGameFlow = newGameText.includes('WELCOME TO HALCYRA') && newGameText.includes('$800');
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[aria-label="Player name"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('Player name input is missing.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'MISTAKE');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  })()`, true);
  sendKey(window, 'Enter');
  await waitForSelector(window, '#world-state', 20_000);
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 1');
  return { newGameFlow, newGameText };
}

async function captureWorldSmoke(window: BrowserWindow, directory: string): Promise<Record<string, boolean | number | string>> {
  const progress = (stage: string): void => {
    process.stdout.write(`SI_WORLD_SMOKE_PROGRESS ${stage}\n`);
  };
  const bootstrap = worldSmokeBootstrap ?? await beginWorldSmoke(window, directory);
  const { newGameFlow, newGameText } = bootstrap;
  const geometry = await geometryEvidence(window);
  const protagonistLabel = await protagonistStateLabel(window);
  const stableProtagonist = protagonistLabel.includes('Protagonist protagonist') && protagonistLabel.includes('name MISTAKE');
  const allowanceReceipt = protagonistLabel.includes('allowance 800') && protagonistLabel.includes('money 800') &&
    (await rendererText(window, '#world-ui-help')).includes('$800 WEEKLY ALLOWANCE RECEIVED');
  const newGameSave = (await rendererText(window, '#world-save-status')).includes('SAVED GEN 1');
  const accessibilityPolicy = await window.webContents.executeJavaScript(`(() => {
    const policy = document.querySelector('#si-world-accessibility');
    return policy instanceof HTMLStyleElement && policy.textContent.includes(':focus-visible') &&
      policy.textContent.includes('prefers-reduced-motion: reduce');
  })()`, true) as boolean;

  const zoomLabels: string[] = [];
  const zoomBuffers: Buffer[] = [];
  for (const zoom of [1, 2, 3] as const) {
    await clickZoomButton(window, zoom);
    zoomLabels.push(await cameraLabel(window));
    zoomBuffers.push(await captureDistinctSmokeScreenshot(
      window,
      join(directory, `world-${zoom}x.png`),
      zoomBuffers,
    ));
  }
  const zoomButtons = zoomLabels.every((label, index) => label.endsWith(`at ${index + 1}x`));

  await clickZoomButton(window, 2);
  const responsiveBoundsBefore = await surfaceBounds(window);
  const responsiveCameraBefore = parseCameraLabel(await cameraLabel(window));
  const responsiveCenterBefore = {
    x: responsiveCameraBefore.x + responsiveBoundsBefore.width / responsiveCameraBefore.zoom / 2,
    y: responsiveCameraBefore.y + responsiveBoundsBefore.height / responsiveCameraBefore.zoom / 2,
  };
  const resizedBounds = await resizeContentAndWait(window, 1_440, 900);
  const resizedCamera = parseCameraLabel(await cameraLabel(window));
  const resizedCenter = {
    x: resizedCamera.x + resizedBounds.width / resizedCamera.zoom / 2,
    y: resizedCamera.y + resizedBounds.height / resizedCamera.zoom / 2,
  };
  const resizeCamera = resizedCamera.zoom === 2 &&
    Math.abs(resizedCenter.x - responsiveCenterBefore.x) <= 1 &&
    Math.abs(resizedCenter.y - responsiveCenterBefore.y) <= 1;
  const responsiveDto = await waitForResponsiveEvidence(window, (evidence) => {
    const content = evidence.content as { width?: number; height?: number } | undefined;
    const measuredSurface = evidence.surface as { width?: number; height?: number } | undefined;
    return content?.width === 1_440 && content.height === 900 &&
      Math.abs(Number(measuredSurface?.width) - resizedBounds.width) <= 1 &&
      Math.abs(Number(measuredSurface?.height) - resizedBounds.height) <= 1;
  });
  const coverage = responsiveDto.coverage as { width?: number; height?: number } | undefined;
  const responsiveSurface = Number(coverage?.width) >= 0.9 && Number(coverage?.height) >= 0.85 &&
    responsiveDto.automaticWorldZoom === 1 && responsiveDto.selectedWorldZoom === 2;
  await clickUiScaleButton(window, 150);
  const scaledDto = await waitForResponsiveEvidence(window, (evidence) => evidence.uiScale === 1.5);
  const uiScaleControls = scaledDto.minimumFontSize === 17 && scaledDto.minimumPointerTarget === 54;
  await clickUiScaleButton(window, 100);
  await resizeContentAndWait(window, 1_280, 720);

  progress('camera-and-movement');
  await clickZoomButton(window, 2);
  let bounds = await surfaceBounds(window);
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await reachWorldTile(window, { x: 19, y: 20 });
  const movedText = await rendererText(window, '#world-ui-location');
  const movement = movedText.includes('TILE 19,20');

  const beforePan = await cameraLabel(window);
  window.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(center.x), y: Math.round(center.y), button: 'middle', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(center.x + 32), y: Math.round(center.y), button: 'middle' });
  await waitForRendererPaint(window);
  window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(center.x + 96), y: Math.round(center.y), button: 'middle' });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  window.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(center.x + 96), y: Math.round(center.y), button: 'middle', clickCount: 1 });
  await waitForRendererPaint(window);
  const afterPan = await cameraLabel(window);
  const beforePanState = parseCameraLabel(beforePan);
  const afterPanState = parseCameraLabel(afterPan);
  const middlePan = Math.abs(afterPanState.x - (beforePanState.x - 48)) <= 0.02 &&
    Math.abs(afterPanState.y - beforePanState.y) <= 0.02 && afterPanState.zoom === beforePanState.zoom;

  sendKey(window, 'F');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
  const afterCenter = await cameraLabel(window);
  // The camera snaps to a whole screen pixel, so the expectation is on that lattice too.
  const expectedCenteredCamera = {
    x: Math.round((19 * 32 + 16 - bounds.width / 2 / 2) * 2) / 2,
    y: Math.round((20 * 32 + 29 - bounds.height / 2 / 2) * 2) / 2,
  };
  const centeredState = parseCameraLabel(afterCenter);
  const centerKey = afterCenter !== afterPan && centeredState.zoom === 2 &&
    Math.abs(centeredState.x - expectedCenteredCamera.x) <= 0.02 &&
    Math.abs(centeredState.y - expectedCenteredCamera.y) <= 0.02;

  bounds = await surfaceBounds(window);
  const wheelX = Math.round(bounds.x + bounds.width / 2);
  const wheelY = Math.round(bounds.y + bounds.height / 2);
  window.webContents.sendInputEvent({
    type: 'mouseWheel', x: wheelX, y: wheelY, deltaY: 100, canScroll: false,
  });
  await waitForRendererPaint(window);
  const wheelZoom = (await cameraLabel(window)).endsWith('at 2.1x');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  const presentationAfterWheel = await window.webContents.executeJavaScript(
    'window.siWorldDesktop?.loadPresentationPreferences()',
    true,
  ) as Readonly<{ worldZoom?: number }>;
  const gradualZoomPersistence = presentationAfterWheel.worldZoom === 2.1;

  // Camera follow, impact and the scripted director. Zoom 2 matters: four tiles is 256 screen
  // pixels there, which clears the dead zone; at zoom 1 it would not and the camera would
  // correctly stay put.
  await clickZoomButton(window, 2);
  sendKey(window, 'F');
  const followArmedLabel = await waitForCameraMotion(window, (label) => label.includes('follow armed'), 4_000, 'follow armed');
  const cameraBeforeFollow = parseCameraLabel(await cameraLabel(window));
  await reachWorldTile(window, { x: 16, y: 25 });
  const cameraAfterFollow = parseCameraLabel(await cameraLabel(window));
  const followCamera = followArmedLabel.includes('follow armed') &&
    Math.abs(cameraAfterFollow.x - cameraBeforeFollow.x) > 1 &&
    Math.abs(cameraAfterFollow.y - cameraBeforeFollow.y) > 1;

  // Sample only once follow has finished easing, or the pan assertion below races the remaining
  // travel and both the x and y clauses drift.
  const cameraBeforePanSuspend = parseCameraLabel(await waitForCameraStill(window));
  await panWorld(window, 24, 0);
  const followSuspendedLabel = await waitForCameraMotion(window, (label) => label.includes('follow suspended'), 4_000, 'follow suspended');
  // Walking with follow suspended must leave the camera exactly where the pan left it. This also
  // returns the hero to 19,20, which the cancel check below depends on.
  await reachWorldTile(window, { x: 19, y: 20 });
  const cameraAfterPanSuspend = parseCameraLabel(await cameraLabel(window));
  const pannedX = cameraBeforePanSuspend.x - 24 / cameraBeforePanSuspend.zoom;
  const followSuspends = followSuspendedLabel.includes('follow suspended') &&
    Math.abs(cameraAfterPanSuspend.x - pannedX) <= 0.02 &&
    Math.abs(cameraAfterPanSuspend.y - cameraBeforePanSuspend.y) <= 0.02;
  const followSuspendsDiagnostic = followSuspends ? '' : [
    `label=${JSON.stringify(followSuspendedLabel)}`,
    `before=${cameraBeforePanSuspend.x},${cameraBeforePanSuspend.y}@${cameraBeforePanSuspend.zoom}`,
    `after=${cameraAfterPanSuspend.x},${cameraAfterPanSuspend.y}@${cameraAfterPanSuspend.zoom}`,
    `expectedX=${pannedX}`,
    `dx=${cameraAfterPanSuspend.x - pannedX}`,
    `dy=${cameraAfterPanSuspend.y - cameraBeforePanSuspend.y}`,
  ].join(' ');

  const cameraBeforeImpulse = await cameraLabel(window);
  const shakenLabel = await window.webContents.executeJavaScript(`new Promise((resolve) => {
    window.siWorldCameraDirector?.impulse(0.8, { x: 1, y: 0 });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resolve(document.querySelector('#world-camera-motion-state')?.getAttribute('aria-label') ?? '');
    }));
  })`, true) as string;
  await waitForCameraMotion(window, (label) => label.includes('shake 0.00'), 2_000, 'shake decays to 0.00');
  // The impact offset is presentation only: the base camera, which is what gets persisted and
  // hit-tested, is untouched by it.
  const impactShake = shakenLabel.includes('shake 0.') && await cameraLabel(window) === cameraBeforeImpulse;

  await window.webContents.executeJavaScript(`window.siWorldCameraDirector?.play([
    { kind: 'focus', points: [{ x: 23 * 32 + 16, y: 24 * 32 + 29 }], durationMs: 320, ease: 'in-out' },
    { kind: 'hold', durationMs: 80 },
  ])`, true);
  const shotLabel = await waitForCameraMotion(window, (label) => label.includes('shot focus'), 4_000, 'shot focus');
  await waitForCameraMotion(window, (label) => label.includes('shot none'), 4_000, 'shot queue drains');
  const directedCamera = parseCameraLabel(await cameraLabel(window));
  const directedBounds = await surfaceBounds(window);
  const cameraDirector = shotLabel.includes('queue 2') &&
    Math.abs((23 * 32 + 16 - directedCamera.x) * directedCamera.zoom - directedBounds.width / 2) <= 1 &&
    Math.abs((24 * 32 + 29 - directedCamera.y) * directedCamera.zoom - directedBounds.height / 2) <= 1;

  await clickZoomButton(window, 2);
  sendKey(window, 'F');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  bounds = await surfaceBounds(window);
  sendMouseClick(window, bounds.x + bounds.width / 2 - 4 * 32 * 2, bounds.y + bounds.height / 2);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 35));
  sendKey(window, 'Escape');
  const cancelStart = await rendererText(window, '#world-ui-location');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 350));
  const cancelKey = (await rendererText(window, '#world-ui-location')) === cancelStart && cancelStart.includes('TILE 19,20');

  const beforeUi = await rendererText(window, '#world-ui-location');
  await clickZoomButton(window, 1);
  const afterUi = await rendererText(window, '#world-ui-location');
  const tilePattern = /TILE \d+,\d+/u;
  const uiClickThrough = beforeUi.match(tilePattern)?.[0] === afterUi.match(tilePattern)?.[0];

  await reachWorldTile(window, geometry.roof.exteriorTile, {
    nativeClick: true,
  });
  await waitForRoofLabel(window, 'Villa roof restored');
  const outsideText = await rendererText(window, '#world-ui-location');
  const roofRestore = outsideText.includes(`TILE ${geometry.roof.exteriorTile.x},${geometry.roof.exteriorTile.y}`) &&
    await roofLabel(window) === 'Villa roof restored';
  let previousWorldBuffer = await captureDistinctSmokeScreenshot(
    window,
    join(directory, 'world-roof-restored.png'),
    [zoomBuffers[0]!],
  );

  progress('villa-interior');
  await reachWorldTile(window, { x: 15, y: 23 }, { nativeClick: true });
  await waitForRoofLabel(window, 'Villa roof hidden');
  const roofEntry = (await rendererText(window, '#world-ui-location')).includes('TILE 15,23') &&
    await roofLabel(window) === 'Villa roof hidden';

  const beforePause = parseWorldStateLabel(await worldStateLabel(window));
  await clickAriaButton(window, 'Pause time');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_100));
  const afterPause = parseWorldStateLabel(await worldStateLabel(window));
  const pausedClock = afterPause.minute === beforePause.minute && afterPause.speed === 0;

  await clickAriaButton(window, 'Set 2x time');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_100));
  const afterFast = parseWorldStateLabel(await worldStateLabel(window));
  const doubleSpeedClock = afterFast.speed === 2 && afterFast.minute - afterPause.minute >= 2 && afterFast.minute - afterPause.minute <= 4;

  await reachWorldTile(window, { x: 14, y: 13 });
  const bedroomReached = (await rendererText(window, '#world-ui-location')).includes('TILE 14,13');
  await clickAriaButton(window, 'Pause time');
  const beforeNap = parseWorldStateLabel(await worldStateLabel(window));
  await clickAriaButton(window, 'Nap for two hours');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  const afterNap = parseWorldStateLabel(await worldStateLabel(window));
  const nap = bedroomReached && afterNap.minute === beforeNap.minute + 120 && (await rendererText(window, '#world-ui-help')).includes('NAP COMPLETE');

  let napCount = 0;
  let beforeOvernight = afterNap;
  while (beforeOvernight.minute % 1_440 < 20 * 60 && napCount < 6) {
    await clickAriaButton(window, 'Nap for two hours');
    beforeOvernight = parseWorldStateLabel(await worldStateLabel(window));
    napCount += 1;
  }
  await clickAriaButton(window, 'Sleep until 8 AM');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
  const afterOvernight = parseWorldStateLabel(await worldStateLabel(window));
  const overnightSleep = afterOvernight.minute > beforeOvernight.minute && afterOvernight.minute % 1_440 === 8 * 60;
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 2');
  const sleepAutosave = (await rendererText(window, '#world-save-status')).includes('SAVED GEN 2');

  progress('neighborhood-loop');
  await clickAriaButton(window, 'Set 2x time');
  await waitForWorldState(window, (state) => state.speed === 2, 10_000);
  await reachWorldTile(window, { x: 16, y: 25 });
  await clickZoomButton(window, 1);
  await panWorld(window, -500, 0);
  await panWorld(window, -500, 0);
  await reachWorldLocation(window, { x: 63, y: 24 }, 'Neon Crescent', { x: 0, y: 24 });
  const afterTravel = parseWorldStateLabel(await worldStateLabel(window));
  const travel = afterTravel.mapName === 'Neon Crescent' && afterTravel.x === 0 && afterTravel.y === 24;
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 3');
  const travelAutosave = (await rendererText(window, '#world-save-status')).includes('SAVED GEN 3');
  previousWorldBuffer = await captureDistinctSmokeScreenshot(
    window, join(directory, 'world-downtown.png'), [previousWorldBuffer],
  );
  if (tierBArtSmokeMode) {
    previousWorldBuffer = await captureTierBMapZoomSet(window, directory, 'downtown', previousWorldBuffer);
  }

  await panWorld(window, 0, -500);
  await reachWorldLocation(window, { x: 32, y: 47 }, 'Greywake Harbor', { x: 32, y: 0 });
  const docks = parseWorldStateLabel(await worldStateLabel(window));
  await panWorld(window, 0, -500);
  await panWorld(window, -500, 0);
  const ferryMap = WORLD_MAP_CATALOG.southeast_docks;
  const ferryObject = ferryMap.source.objects.find(({ id }) => id === 'ferry-landmark');
  const ferryCamera = parseCameraLabel(await cameraLabel(window));
  const ferrySurface = await surfaceBounds(window);
  const ferryVisible = ferryObject?.renderParts.some(({ offset }) => {
    const x = (ferryObject.anchor.x + offset.x) * 32;
    const y = (ferryObject.anchor.y + offset.y) * 32;
    return x >= ferryCamera.x && x < ferryCamera.x + ferrySurface.width / ferryCamera.zoom &&
      y >= ferryCamera.y && y < ferryCamera.y + ferrySurface.height / ferryCamera.zoom;
  }) === true;
  const closedFerry = docks.mapName === 'Greywake Harbor' && ferryVisible &&
    ferryObject?.interactions.length === 0;
  previousWorldBuffer = await captureDistinctSmokeScreenshot(
    window, join(directory, 'world-ferry.png'), [previousWorldBuffer],
  );
  if (tierBArtSmokeMode) {
    previousWorldBuffer = await captureTierBMapZoomSet(window, directory, 'ferry', previousWorldBuffer);
  }

  await panWorld(window, 500, 0);
  await reachWorldLocation(window, { x: 0, y: 24 }, 'Saffron Bazaar', { x: 63, y: 24 });
  const commercial = parseWorldStateLabel(await worldStateLabel(window));
  previousWorldBuffer = await captureDistinctSmokeScreenshot(
    window, join(directory, 'world-commercial.png'), [previousWorldBuffer],
  );
  if (tierBArtSmokeMode) {
    previousWorldBuffer = await captureTierBMapZoomSet(window, directory, 'commercial', previousWorldBuffer);
  }

  await panWorld(window, 500, 500);
  await reachWorldLocation(window, { x: 32, y: 0 }, 'Sunward Villas', { x: 32, y: 47 });
  const loopCompleteState = parseWorldStateLabel(await worldStateLabel(window));
  const allNeighborhoods = commercial.mapName === 'Saffron Bazaar' &&
    loopCompleteState.mapName === 'Sunward Villas' && loopCompleteState.x === 32 && loopCompleteState.y === 47;
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 6');
  const allTravelAutosaves = (await rendererText(window, '#world-save-status')).includes('SAVED GEN 6');
  previousWorldBuffer = await captureDistinctSmokeScreenshot(
    window, join(directory, 'world-loop-complete.png'), [previousWorldBuffer],
  );

  progress('conversation');
  await clickZoomButton(window, 1);
  await panWorld(window, 0, 500);
  const lindaTile = parseLindaTile(await npcStateLabel(window));
  const questOfferApproachTile = { x: lindaTile.x + 1, y: lindaTile.y };
  await reachWorldTile(window, questOfferApproachTile);
  await dispatchWorldTileClick(window, lindaTile);
  const talkLabels = await window.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('[aria-label^="Talk to "]')).map((element) => element.getAttribute('aria-label'))`,
    true,
  ) as readonly (string | null)[];
  if (!talkLabels.some((label) => label?.toLowerCase() === 'talk to linda')) {
    throw new Error(`Linda selection failed: talk ${JSON.stringify(talkLabels)}; NPC ${await npcStateLabel(window)}; world ${await worldStateLabel(window)}`);
  }
  await clickAriaButton(window, 'Talk to Linda');
  await waitForRendererText(window, '#world-ui-quest-offer-panel', 'YES · HELP LINDA');
  await waitForRendererText(window, '#world-ui-quest-offer-panel', 'MISTAKE');
  await waitForRendererText(window, '#world-ui-quest-offer-panel', 'NO · NOT NOW');
  await waitForSelector(window, '#conversation-portrait-protagonist-ready');
  await waitForSelector(window, '#conversation-portrait-linda-ready');
  const questOfferText = await rendererText(window, '#world-ui-quest-offer-panel');
  const portraitsReady = await window.webContents.executeJavaScript(`Boolean(
    document.querySelector('#conversation-portrait-protagonist-ready') &&
    document.querySelector('#conversation-portrait-linda-ready')
  )`, true) as boolean;
  const questOfferDialogue = questOfferText.includes('LINDA') && questOfferText.includes('MISTAKE') &&
    questOfferText.includes('YES · HELP LINDA') && questOfferText.includes('NO · NOT NOW') && portraitsReady;
  const questOfferMinute = parseWorldStateLabel(await worldStateLabel(window)).minute;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_100));
  const questOfferPause = parseWorldStateLabel(await worldStateLabel(window)).minute === questOfferMinute;
  previousWorldBuffer = await captureDistinctSmokeScreenshot(
    window, join(directory, 'world-linda-offer.png'), [previousWorldBuffer],
  );
  await window.webContents.executeJavaScript(`window.siWorldSetAuthoredDialogueFixture?.('linda-boyfriend')`, true);
  await waitForRendererText(window, '#world-ui-quest-offer-panel', 'MARCUS VALE');
  await waitForRendererPaint(window);
  await captureSmokeScreenshot(window, join(directory, 'world-marcus-dialogue.png'));
  await clickAriaButton(window, 'Ask Marcus Vale what happened');
  await waitForSelectorMissing(window, '#world-ui-quest-offer-panel');
  if ((await questStateLabel(window)).includes('Linda quest active')) {
    throw new Error('Asking Marcus incorrectly started Linda quest.');
  }
  await window.webContents.executeJavaScript(`window.siWorldSetAuthoredDialogueFixture?.()`, true);
  await waitForRendererText(window, '#world-ui-quest-offer-panel', 'YES · HELP LINDA');
  await clickAriaButton(window, "Accept Linda's request");
  await waitForSelectorMissing(window, '#world-ui-quest-offer-panel');
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 7');
  const questStarted = (await questStateLabel(window)).includes('Linda quest active');
  await clickAriaButton(window, 'Talk to Linda');
  await waitForRendererText(window, '#world-ui-conversation-panel', 'TIME PAUSED');
  await waitForRendererText(window, '#world-audio-caption', 'GREETING CHIRP');
  const audioCaptions = (await rendererText(window, '#world-audio-caption')).includes('GREETING CHIRP');
  await waitForWorldMinuteStable(window);
  const conversationPause = (await rendererText(window, '#world-ui-conversation-panel')).includes('TIME PAUSED');
  const cameraBeforeConversationInput = await cameraLabel(window);
  const locationBeforeConversationInput = await rendererText(window, '#world-ui-location');
  await window.webContents.executeJavaScript(`(() => {
    const overlay = document.querySelector('#world-ui-conversation-overlay');
    if (!(overlay instanceof HTMLElement)) throw new Error('Conversation overlay is missing.');
    const bounds = overlay.getBoundingClientRect();
    const clientX = bounds.left + 20;
    const clientY = bounds.top + 20;
    overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX, clientY, pointerId: 92 }));
    overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 1, clientX, clientY, pointerId: 93 }));
    overlay.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: 1, clientX: clientX + 100, clientY, pointerId: 93 }));
    overlay.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 1, clientX: clientX + 100, clientY, pointerId: 93 }));
    overlay.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX, clientY, deltaY: -100 }));
  })()`, true);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  const conversationInputLocked = cameraBeforeConversationInput === await cameraLabel(window) &&
    locationBeforeConversationInput === await rendererText(window, '#world-ui-location');
  const conversationSocialNavLocked = !(await window.webContents.executeJavaScript(
    `Boolean(document.querySelector('#world-ui-social-nav'))`, true,
  ));
  const promptIdeasContextual = (await rendererText(window, '#conversation-prompt-suggestions')).trim().length === 0;
  const responsiveTranscriptCount = await conversationTranscriptMeasure(window);
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[aria-label="Conversation message"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('Conversation input is missing.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'KEEP THIS DRAFT');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`, true);
  await resizeContentAndWait(window, 1_440, 900);
  await clickUiScaleButton(window, 150);
  const conversationResponsiveDto = await waitForResponsiveEvidence(
    window,
    (evidence) => evidence.uiScale === 1.5 &&
      (evidence.activePanel as { id?: string } | null)?.id === 'world-ui-conversation-panel',
  );
  const responsiveDraft = await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[aria-label="Conversation message"]');
    return input instanceof HTMLInputElement ? input.value : '';
  })()`, true) as string;
  const conversationResponsiveState = responsiveDraft === 'KEEP THIS DRAFT' &&
    await conversationTranscriptMeasure(window) === responsiveTranscriptCount &&
    conversationResponsiveDto.conversationInput !== null &&
    (await rendererText(window, '#world-ui-conversation-panel')).includes('TIME PAUSED');
  await clickUiScaleButton(window, 100);
  await resizeContentAndWait(window, 1_280, 720);
  const transcriptChildrenBeforeFirstTurn = await conversationTranscriptMeasure(window);
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[aria-label="Conversation message"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('Conversation input is missing.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'I have a cat');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`, true);
  const generationMetrics = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const button = Array.from(document.querySelectorAll('[aria-label]')).find(
      (element) => element.getAttribute('aria-label') === 'Send conversation message',
    );
    if (!(button instanceof HTMLElement)) {
      reject(new Error('Send conversation button is missing.'));
      return;
    }
    const startedAt = performance.now();
    const frameTimes = [];
    let feedbackMilliseconds = null;
    let finished = false;
    let feedbackObserver = null;
    const recordFeedback = () => {
      const thinking = Boolean(document.querySelector('[aria-label="NPC is thinking"]'));
      if (thinking && feedbackMilliseconds === null) {
        feedbackMilliseconds = Math.max(0, performance.now() - startedAt);
      }
      return thinking;
    };
    const finish = (timedOut) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      feedbackObserver?.disconnect();
      const measuredFrames = frameTimes.filter((time) => time >= startedAt + (feedbackMilliseconds ?? 0));
      const duration = measuredFrames.length > 1
        ? measuredFrames[measuredFrames.length - 1] - measuredFrames[0]
        : 0;
      const rendererFps = duration > 0 ? ((measuredFrames.length - 1) * 1000) / duration : 0;
      resolve({ feedbackMilliseconds, rendererFps, sampledFrames: measuredFrames.length, timedOut });
    };
    const timeout = setTimeout(() => finish(true), 30000);
    feedbackObserver = new MutationObserver(recordFeedback);
    feedbackObserver.observe(document.body, { childList: true, subtree: true });
    button.click();
    recordFeedback();
    const frame = (now) => {
      frameTimes.push(now);
      const thinking = recordFeedback();
      const measuredFrameCount = feedbackMilliseconds === null
        ? 0
        : frameTimes.filter((time) => time >= startedAt + feedbackMilliseconds).length;
      if (feedbackMilliseconds !== null && !thinking && measuredFrameCount >= 2) {
        finish(false);
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  })`, true) as Readonly<{
    feedbackMilliseconds: number | null;
    rendererFps: number;
    sampledFrames: number;
    timedOut: boolean;
  }>;
  const conversationFeedbackMilliseconds = Math.round((generationMetrics.feedbackMilliseconds ?? 99_999) * 100) / 100;
  const rendererFpsDuringGeneration = Math.round(generationMetrics.rendererFps * 100) / 100;
  const conversationBuffered = !generationMetrics.timedOut && conversationFeedbackMilliseconds <= 100;
  progress('conversation-first-turn-complete');
  await waitForConversationTurnComplete(window, transcriptChildrenBeforeFirstTurn);
  const transcript = await rendererText(window, '#conversation-transcript');
  const modelStatus = await rendererText(window, '#conversation-model-status');
  const conversationFallback = smokeExpectsModel
    ? modelStatus.includes('REPLY RECEIVED') && !modelStatus.includes('SAFE REPLY')
    : transcript.includes('I lost the thread') && !transcript.includes('jsonSchema');
  const modelFailureFeedback = smokeExpectsModel
    ? modelStatus.includes('REPLY RECEIVED') && !modelStatus.includes('SAFE REPLY')
    : modelStatus.includes('SAFE REPLY USED');
  const firstFreeTextTurnSource = smokeExpectsModel ? 'model' : 'authored-fallback';
  const transcriptChildrenBeforeInvitation = await conversationTranscriptMeasure(window);
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[aria-label="Conversation message"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('Conversation input is missing.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'Would you like to visit my villa?');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`, true);
  await clickAriaButton(window, 'Send conversation message');
  await waitForConversationTurnComplete(window, transcriptChildrenBeforeInvitation);
  await waitForAriaButtonEnabled(window, 'End conversation');
  const invitationStatus = await rendererText(window, '#conversation-model-status');
  const invitationTranscript = await rendererText(window, '#conversation-transcript');
  const structuredInvitation = smokeExpectsModel
    ? (invitationStatus.includes('REPLY RECEIVED') || invitationStatus.includes('AUTHORED REPLY USED')) &&
      !invitationStatus.includes('SAFE REPLY')
    : invitationTranscript.includes('current situation');
  const structuredInvitationSource = invitationStatus.includes('REPLY RECEIVED')
    ? 'model'
    : 'authored-structured';
  previousWorldBuffer = await captureDistinctSmokeScreenshot(
    window, join(directory, 'world-conversation.png'), [previousWorldBuffer],
  );
  progress('conversation-second-turn-complete');
  await clickAriaButton(window, 'End conversation');
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 8');
  const conversationCommitSave = !(await window.webContents.executeJavaScript(
    `Boolean(document.querySelector('#world-ui-conversation-panel'))`, true,
  )) && (await rendererText(window, '#world-save-status')).includes('SAVED GEN 8');
  await clickAriaButton(window, 'Open relationships');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  const relationshipText = await rendererText(window, '#world-ui-relationship-panel');
  const relationshipPanel = ['FAMILIARITY', 'TRUST', 'ATTRACTION'].every((label) => relationshipText.includes(label)) &&
    ['STRANGER', 'ACQUAINTANCE', 'FRIEND', 'DATING', 'PARTNER', 'ENGAGED', 'MARRIED']
      .some((stage) => relationshipText.includes(stage));
  const hiddenFaction = relationshipText.includes('OTHER NETWORKS REMAIN HIDDEN') && !relationshipText.includes('VELVET TIDE');
  previousWorldBuffer = await captureDistinctSmokeScreenshot(
    window, join(directory, 'world-social.png'), [previousWorldBuffer],
  );
  await clickAriaButton(window, 'Close relationships');
  const currentLindaTile = parseLindaTile(await npcStateLabel(window));
  const lindaApproachTile = { x: currentLindaTile.x + 1, y: currentLindaTile.y };
  await reachWorldTile(window, lindaApproachTile);
  await dispatchWorldTileClick(window, currentLindaTile);
  await clickAriaButton(window, 'Open quests');
  await waitForRendererText(window, '#world-ui-journal-panel', 'LINDA · REJECTED');
  const journalInvitation = (await rendererText(window, '#world-ui-journal-panel')).includes('LINDA · REJECTED');
  await clickAriaButton(window, 'Buy villa security report');
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 9');
  const socialPurchase = (await rendererText(window, '#world-ui-journal-panel')).includes('SECURITY REPORT PURCHASED') &&
    (await rendererText(window, '#world-save-status')).includes('SAVED GEN 9');
  previousWorldBuffer = await captureDistinctSmokeScreenshot(
    window, join(directory, 'world-journal.png'), [previousWorldBuffer],
  );
  await clickAriaButton(window, 'Close quests');
  progress('quest');
  const questPreparationPreserved = (await questStateLabel(window)).includes('flags security_report_purchased');
  await reachWorldTile(window, { x: 22, y: 28 });
  sendKey(window, 'Q');
  await waitForRendererText(window, '#world-ui-journal-panel', 'QUESTS');
  const questShortcut = (await rendererText(window, '#world-ui-journal-panel')).includes('QUEST 01');
  await clickAriaButton(window, "Confirm Linda's villa");
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 10');
  const choiceText = await rendererText(window, '#world-ui-journal-panel');
  const questChoicePreview = choiceText.includes('PROTECT LINDA') && choiceText.includes('BETRAY LINDA') &&
    choiceText.includes('WITHDRAW') && choiceText.includes('ACTION') && choiceText.includes('RESULT') &&
    choiceText.includes('SOCIAL') && choiceText.includes('ROUTE');
  previousWorldBuffer = await captureDistinctSmokeScreenshot(
    window, join(directory, 'world-linda-quest.png'), [previousWorldBuffer],
  );
  await clickAriaButton(window, 'Protect Linda');
  const consequenceCaption = (await rendererText(window, '#world-audio-caption')).includes('CONSEQUENCE TONE');
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 11');
  const questLabel = await questStateLabel(window);
  const questOutcome = questLabel.includes('Linda quest resolved') && questLabel.includes('linda_protected') &&
    questLabel.includes('police noticed') && questLabel.includes('evidence 1') &&
    (await rendererText(window, '#world-ui-help')).includes('LINDA PROTECTED');
  const questAutosave = (await rendererText(window, '#world-save-status')).includes('SAVED GEN 11');
  previousWorldBuffer = await captureDistinctSmokeScreenshot(
    window, join(directory, 'world-linda-outcome.png'), [previousWorldBuffer],
  );
  await clickAriaButton(window, 'Close quests');
  await clickAriaButton(window, 'Open quests');
  await clickAriaButton(window, 'Answer police questions');
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 12');
  await clickAriaButton(window, 'Ignore police summons');
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 13');
  await clickAriaButton(window, 'Trigger wanted encounter');
  await waitForRendererText(window, '#world-save-status', 'SAVED GEN 14');
  const policeHooks = (await questStateLabel(window)).includes('police arrest-on-sight') &&
    (await rendererText(window, '#world-ui-journal-panel')).includes('POLICE · ARREST-ON-SIGHT');
  previousWorldBuffer = await captureDistinctSmokeScreenshot(
    window, join(directory, 'world-police.png'), [previousWorldBuffer],
  );
  const loaded = await window.webContents.executeJavaScript(
    `window.siWorldDesktop?.loadSave('slot-001')`,
    true,
  ) as Readonly<{
    status?: string;
    saveGeneration?: number;
    state?: Readonly<{
      protagonist?: Readonly<{ id?: string; displayName?: string }>;
      quests?: Readonly<Record<string, Readonly<{ status?: string }>>>;
      policeAttention?: string;
    }>;
  }>;
  const saveReload = loaded.status === 'unchanged' && loaded.saveGeneration === 14 &&
    loaded.state?.protagonist?.id === 'protagonist' && loaded.state.protagonist.displayName === 'MISTAKE' &&
    loaded.state.quests?.linda_boyfriend_check?.status === 'resolved' && loaded.state.policeAttention === 'arrest-on-sight';
  progress('complete');
  return {
    newGameFlow, stableProtagonist, allowanceReceipt, newGameSave, accessibilityPolicy,
    responsiveSurface, responsiveSurfaceDiagnostic: responsiveSurface ? '' : JSON.stringify(responsiveDto),
    resizeCamera, uiScaleControls,
    zoomButtons, movement, middlePan, wheelZoom, gradualZoomPersistence, centerKey, cancelKey, uiClickThrough,
    followCamera, followSuspends, followSuspendsDiagnostic, impactShake, cameraDirector,
    roofRestore, roofEntry,
    pausedClock, doubleSpeedClock, nap, overnightSleep, sleepAutosave, travel, travelAutosave,
    closedFerry, allNeighborhoods, allTravelAutosaves,
    conversationPause, conversationInputLocked, conversationSocialNavLocked, conversationResponsiveState, promptIdeasContextual, conversationBuffered,
    conversationFeedbackMilliseconds, rendererFpsDuringGeneration,
    rendererFpsSampledFrames: generationMetrics.sampledFrames,
    conversationFallback, firstFreeTextTurnSource, modelFailureFeedback, audioCaptions, conversationCommitSave,
    structuredInvitation, structuredInvitationSource, relationshipPanel, hiddenFaction, journalInvitation, socialPurchase,
    questOfferDialogue, questOfferPause, questStarted, questPreparationPreserved, questShortcut,
    questChoicePreview, questOutcome, questAutosave, consequenceCaption, policeHooks, saveReload,
  };
}

async function emitWebgl2Probe(window: BrowserWindow): Promise<void> {
  if (!webgl2ProbeMode || smokeFinished) return;
  const available = await window.webContents.executeJavaScript(`(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return context !== null;
  })()`, true) as boolean;
  if (!available) throw new Error('Packaged renderer could not create a WebGL 2 context.');
  smokeFinished = true;
  process.stdout.write(`SI_WORLD_WEBGL2_PROBE_RESULT ${JSON.stringify({
    schemaVersion: 1,
    available,
    appUrl: window.webContents.getURL(),
    architecture: process.arch,
    platform: process.platform,
  })}\n`);
  setTimeout(() => app.quit(), 50);
}

async function emitSmokeResult(report: RendererReadyReport, window: BrowserWindow): Promise<void> {
  if (!smokeMode || smokeFinished || webgl2ProbeMode) {
    return;
  }
  if (report.phase === 'shell') {
    if (rendererShellReady) return;
    rendererShellReady = true;
    process.stdout.write(`SI_WORLD_RENDERER_SHELL_READY ${JSON.stringify({
      milliseconds: Math.round((performance.now() - processStartedAt) * 100) / 100,
    })}\n`);
    smokePreparationPromise = (async () => {
      if (saveMigrationSmokeMode || saveReloadSmokeMode || presentationRestartSmokeMode) return;
      const worldScreenshotDirectory = process.env.SI_WORLD_SMOKE_WORLD_SCREENSHOT_DIR;
      if (!naturalMovementSmokeMode && !responsiveSmokeMode && !proceduralVfxSmokeMode &&
          !presentationSeedSmokeMode && worldScreenshotDirectory) {
        worldSmokeBootstrap = await beginWorldSmoke(window, worldScreenshotDirectory);
      } else {
        await startResponsiveSmokeGame(window);
      }
    })().catch((error: unknown) => { smokePreparationError = error; });
    return;
  }
  if (!rendererShellReady) throw new Error('World readiness arrived before shell readiness.');
  // Stage 6: Three.js is the production renderer, so a smoke that requests none expects it.
  const expectedRenderer = effectiveRenderer;
  if (report.rendererKind !== expectedRenderer) {
    throw new Error(`Expected ${expectedRenderer} readiness but received ${report.rendererKind}.`);
  }
  await smokePreparationPromise;
  if (smokePreparationError) throw smokePreparationError;
  smokeFinished = true;
  process.stdout.write(`SI_WORLD_RENDERER_READY ${JSON.stringify({
    milliseconds: Math.round((performance.now() - processStartedAt) * 100) / 100,
  })}\n`);
  if (saveMigrationSmokeMode || saveReloadSmokeMode) {
    const mode = saveMigrationSmokeMode ? 'migration' : 'reload';
    const migrationResult = await captureSaveMigrationSmoke(window, mode);
    const migrationScreenshot = process.env.SI_WORLD_SAVE_MIGRATION_SCREENSHOT;
    if (!migrationScreenshot || !isAbsolute(migrationScreenshot)) {
      throw new Error('Save-migration smoke screenshot path must be absolute.');
    }
    await captureSmokeScreenshot(window, migrationScreenshot);
    process.stdout.write(`SI_WORLD_SAVE_MIGRATION_SMOKE_RESULT ${JSON.stringify(migrationResult)}\n`);
  } else if (presentationSeedSmokeMode || presentationRestartSmokeMode) {
    const mode = presentationSeedSmokeMode ? 'seed' : 'restart';
    const presentationResult = await capturePresentationPreferenceSmoke(window, mode);
    const presentationScreenshot = process.env.SI_WORLD_PRESENTATION_SCREENSHOT;
    if (!presentationScreenshot || !isAbsolute(presentationScreenshot)) {
      throw new Error('Presentation smoke screenshot path must be absolute.');
    }
    await captureSmokeScreenshot(window, presentationScreenshot);
    process.stdout.write(`SI_WORLD_PRESENTATION_SMOKE_RESULT ${JSON.stringify(presentationResult)}\n`);
  } else if (proceduralVfxSmokeMode) {
    const vfxDirectory = process.env.SI_WORLD_PROCEDURAL_VFX_SCREENSHOT_DIR;
    if (!vfxDirectory || !isAbsolute(vfxDirectory)) {
      throw new Error('Procedural-VFX smoke screenshot directory must be absolute.');
    }
    const vfxResult = await captureProceduralVfxSmoke(window, vfxDirectory);
    process.stdout.write(`SI_WORLD_PROCEDURAL_VFX_SMOKE_RESULT ${JSON.stringify(vfxResult)}\n`);
  } else if (daySweepSmokeMode) {
    const daySweepDirectory = process.env.SI_WORLD_DAY_SWEEP_SCREENSHOT_DIR;
    if (!daySweepDirectory || !isAbsolute(daySweepDirectory)) {
      throw new Error('Day-sweep smoke screenshot directory must be absolute.');
    }
    const daySweepResult = await captureDaySweepSmoke(window, daySweepDirectory);
    process.stdout.write(`SI_WORLD_DAY_SWEEP_SMOKE_RESULT ${JSON.stringify(daySweepResult)}\n`);
  } else if (rendererAllMapsSmokeMode) {
    const parityDirectory = process.env.SI_WORLD_RENDERER_PARITY_SCREENSHOT_DIR;
    if (!parityDirectory || !isAbsolute(parityDirectory)) {
      throw new Error('All-map renderer smoke screenshot directory must be absolute.');
    }
    const parityResult = await captureRendererAllMapsSmoke(window, parityDirectory);
    process.stdout.write(`SI_WORLD_RENDERER_ALL_MAPS_SMOKE_RESULT ${JSON.stringify(parityResult)}\n`);
  } else if (rendererParitySmokeMode) {
    const parityDirectory = process.env.SI_WORLD_RENDERER_PARITY_SCREENSHOT_DIR;
    if (!parityDirectory || !isAbsolute(parityDirectory)) {
      throw new Error('Renderer-parity smoke screenshot directory must be absolute.');
    }
    const parityResult = await captureRendererParitySmoke(window, parityDirectory);
    process.stdout.write(`SI_WORLD_RENDERER_PARITY_SMOKE_RESULT ${JSON.stringify(parityResult)}\n`);
  } else if (naturalMovementSmokeMode) {
    const naturalMovementDirectory = process.env.SI_WORLD_NATURAL_MOVEMENT_SCREENSHOT_DIR;
    if (!naturalMovementDirectory || !isAbsolute(naturalMovementDirectory)) {
      throw new Error('Natural-movement smoke screenshot directory must be absolute.');
    }
    const mode = naturalMovementReducedMode ? 'reduced' : 'standard';
    const movementResult = await captureMovementPass(window, naturalMovementDirectory, mode);
    process.stdout.write(`SI_WORLD_NATURAL_MOVEMENT_SMOKE_RESULT ${JSON.stringify(movementResult)}\n`);
  } else if (responsiveSmokeMode) {
    const responsiveDirectory = process.env.SI_WORLD_RESPONSIVE_SCREENSHOT_DIR;
    if (!responsiveDirectory || !isAbsolute(responsiveDirectory)) {
      throw new Error('Responsive smoke screenshot directory must be absolute.');
    }
    const responsiveResult = await captureResponsiveSmoke(window, responsiveDirectory);
    process.stdout.write(`SI_WORLD_RESPONSIVE_SMOKE_RESULT ${JSON.stringify(responsiveResult)}\n`);
  } else {
    const worldScreenshotDirectory = process.env.SI_WORLD_SMOKE_WORLD_SCREENSHOT_DIR;
    if (worldScreenshotDirectory) {
      const worldResult = await captureWorldSmoke(window, worldScreenshotDirectory);
      process.stdout.write(`SI_WORLD_WORLD_SMOKE_RESULT ${JSON.stringify(worldResult)}\n`);
    }
  }
  const screenshotPath = process.env.SI_WORLD_SMOKE_SCREENSHOT;
  if (screenshotPath) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    await captureSmokeScreenshot(window, screenshotPath);
  }
  process.stdout.write(`SI_WORLD_SMOKE_RESULT ${JSON.stringify(report)}\n`);
  setTimeout(() => app.quit(), 50);
}

async function createMainWindow(): Promise<void> {
  const applicationRoot = devHarnessRoot ?? app.getAppPath();
  const distributionRoot = join(applicationRoot, 'dist');
  const preloadPath = join(applicationRoot, 'build/electron/preload/index.js');

  await protocol.handle(
    'app',
    createAppProtocolHandler(distributionRoot, (fileUrl) => net.fetch(fileUrl)),
  );

  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (_details, callback) => callback({ cancel: true }),
  );

  const presentationPreferences = new PresentationPreferencesRepository(
    presentationPreferencesPathForUserData(app.getPath('userData')),
  );
  const initialPresentation = await presentationPreferences.load();
  const window = new BrowserWindow({
    backgroundColor: '#17201b',
    enableLargerThanScreen: smokeMode,
    height: initialPresentation.windowSize?.height ?? 720,
    minHeight: 640,
    minWidth: 960,
    show: !smokeMode,
    title: devHarnessMode ? 'SI World · Dev Harness' : 'SI World',
    useContentSize: true,
    webPreferences: {
      ...lockedWebPreferences(preloadPath),
      ...(smokeMode ? { backgroundThrottling: false } : {}),
      additionalArguments: [
        ...(smokeMode ? [
          '--si-world-smoke-mode=1',
          ...(!naturalMovementSmokeMode ? ['--si-world-freeze-npc-motion=1'] : []),
          ...(responsiveArtMode ? [`--si-world-art-mode=${responsiveArtMode}`] : []),
          ...(smokeVfxMode ? [`--si-world-vfx-mode=${smokeVfxMode}`] : []),
          ...(smokeRenderer ? [`--si-world-test-renderer=${smokeRenderer}`] : []),
          ...(smokeToneMapping ? [`--si-world-test-tone-mapping=${smokeToneMapping}`] : []),
        ] : []),
        ...(devHarnessMode ? ['--si-world-dev-harness=1'] : []),
      ],
    },
    width: initialPresentation.windowSize?.width ?? 1280,
  });
  activeMainWindow = window;
  if (smokeMode) window.webContents.setAudioMuted(true);
  // Renderer errors reach stderr in every mode, not just smoke. A renderer exception unmounts the
  // React tree and leaves an empty window, and while this was smoke-only that failure produced no
  // output at all — the app looked alive, every process was up, and the log was empty.
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error' || details.message.includes('SI_WORLD_RENDERER_READY_FAILURE')) {
      process.stderr.write(`SI_WORLD_RENDERER_CONSOLE ${details.message}\n`);
    }
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    process.stderr.write(`SI_WORLD_RENDER_PROCESS_GONE ${JSON.stringify(details)}\n`);
  });
  window.webContents.on('unresponsive', () => {
    process.stderr.write('SI_WORLD_RENDERER_UNRESPONSIVE\n');
  });
  window.removeMenu();
  registerRuntimeIpc(
    ipcMain,
    {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      packaged: app.isPackaged,
      platform: runtimePlatform,
    },
    (report) => {
      void emitSmokeResult(report, window).catch((error: unknown) => {
        process.stderr.write(`SI_WORLD_SMOKE_FAILURE ${String(error)}\n`);
        app.exit(1);
      });
    },
  );
  const contentRoot = app.isPackaged ? join(process.resourcesPath, 'content') : join(applicationRoot, 'content');
  conversationInference = new BundledConversationInference(app, process.resourcesPath);
  conversationService = new ConversationService(
    conversationInference,
    new FileCharacterWritingStore(contentRoot),
    smokeExpectsModel
      ? (diagnostic) => process.stdout.write(`SI_WORLD_CONVERSATION_DIAGNOSTIC ${JSON.stringify(diagnostic)}\n`)
      : undefined,
    new FileVerbalMissionContentStore(contentRoot),
  );
  registerConversationIpc(ipcMain, conversationService);
  window.webContents.once('destroyed', () => conversationService?.abortAll());
  const saveRepository = new SaveRepository(
    saveRootForUserData(app.getPath('userData')),
    WORLD_MAP_CATALOG,
  );
  registerPersistenceIpc(ipcMain, {
    loadSave: (slotId) => saveRepository.load(slotId),
    migrateSave: (request) => saveRepository.migrate(request),
    requestSave: (request) => saveRepository.save(request),
  });
  registerPresentationPreferencesIpc(ipcMain, presentationPreferences);
  let presentationResizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.on('resize', () => {
    if (presentationResizeTimer) clearTimeout(presentationResizeTimer);
    presentationResizeTimer = setTimeout(() => {
      const [width, height] = window.getContentSize();
      void presentationPreferences.saveWindowSize({ width, height }).catch((error: unknown) => {
        process.stderr.write(`SI_WORLD_PRESENTATION_SAVE_FAILURE ${String(error)}\n`);
      });
    }, 180);
  });
  window.once('closed', () => {
    if (presentationResizeTimer) clearTimeout(presentationResizeTimer);
  });
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (smokeMode && !smokeFinished) {
      smokeFinished = true;
      process.stderr.write(`SI_WORLD_SMOKE_FAILURE ${errorCode} ${errorDescription}\n`);
      app.exit(1);
    }
  });
  window.webContents.on('did-finish-load', () => {
    if (webgl2ProbeMode) {
      void emitWebgl2Probe(window).catch((error: unknown) => {
        smokeFinished = true;
        process.stderr.write(`SI_WORLD_SMOKE_FAILURE ${String(error)}\n`);
        app.exit(1);
      });
      return;
    }
    if (devHarnessMode) {
      void window.webContents.executeJavaScript(`JSON.stringify({
        enabled: window.siWorldDevHarnessMode === true,
        hash: window.location.hash,
      })`, true).then((proof) => {
        process.stdout.write(`SI_WORLD_DEV_HARNESS_BOOT ${String(proof)}\n`);
      });
    }
    const loadingScreenshotPath = process.env.SI_WORLD_SMOKE_LOADING_SCREENSHOT;
    if (smokeMode && loadingScreenshotPath) {
      // The loading shell needs a moment to mount, and the resource gate holds it for about
      // 500 ms in smoke mode. Capturing at zero fired before the shell existed, which made the
      // tolerant path record the ready frame and produced identical loading and ready evidence.
      setTimeout(() => {
        void captureLoadingSmokeScreenshot(window, loadingScreenshotPath).catch((error: unknown) => {
          smokeFinished = true;
          process.stderr.write(`SI_WORLD_SMOKE_FAILURE ${String(error)}\n`);
          app.exit(1);
        });
      }, 150);
    }
  });
  await window.loadURL(webgl2ProbeMode ? WEBGL2_PROBE_URL : devHarnessMode ? `${APP_URL}#/dev` : APP_URL);
}

app.on('web-contents-created', (_event, contents) => lockWebContents(contents));

app
  .whenReady()
  .then(async () => {
    if (modelSmokeMode) {
      const report = await runPackagedModelSmoke(app, process.resourcesPath);
      process.stdout.write(`SI_WORLD_MODEL_SMOKE_RESULT ${JSON.stringify(report)}\n`);
      app.quit();
      return;
    }
    await createMainWindow();
  })
  .catch((error: unknown) => {
    process.stderr.write(`SI_WORLD_BOOT_FAILURE ${String(error)}\n`);
    app.exit(1);
  });

app.on('window-all-closed', () => app.quit());

app.on('before-quit', (event) => {
  if (!conversationInference || quitCleanupFinished) return;
  event.preventDefault();
  if (quitCleanupStarted) return;
  quitCleanupStarted = true;
  conversationService?.abortAll();
  void conversationInference.stop().finally(() => {
    quitCleanupFinished = true;
    app.quit();
  });
});

if (smokeMode) {
  setTimeout(() => {
    if (!smokeFinished) {
      void activeMainWindow?.webContents.executeJavaScript(`(() => ({
        bodyText: document.body?.innerText?.slice(0, 1000) ?? '',
        canvasCount: document.querySelectorAll('canvas').length,
        ids: Array.from(document.querySelectorAll('[id]')).map((element) => element.id).filter(Boolean).slice(0, 100),
        loading: Boolean(document.querySelector('#loading-shell')),
        newGame: Boolean(document.querySelector('#new-game-flow')),
      }))()`, true).then((diagnostic) => {
        process.stderr.write(`SI_WORLD_RENDERER_READY_TIMEOUT_DIAGNOSTIC ${JSON.stringify(diagnostic)}\n`);
      }).catch((error: unknown) => {
        process.stderr.write(`SI_WORLD_RENDERER_READY_TIMEOUT_DIAGNOSTIC_FAILED ${String(error)}\n`);
      }).finally(() => {
        process.stderr.write('SI_WORLD_SMOKE_FAILURE renderer readiness timeout\n');
        app.exit(1);
      });
    }
  }, 30_000);
}
