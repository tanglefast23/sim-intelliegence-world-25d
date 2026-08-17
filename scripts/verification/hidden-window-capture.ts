import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

import { CAMERA_YAW_DEGREES, GROUND_Z_SCALE } from '../../src/render/three25/projection';

/**
 * Drives the 2.5D renderer in a real Electron window with a real WebGL 2 context, and captures it.
 *
 * **Serves the web export on 127.0.0.1 rather than loading the packaged app.** `?testRenderer`,
 * `?testYaw` and `?testShadowPath` are localhost-only overrides, and a packaged build loads over
 * `app://game/` where the hostname is `'game'` — loading the package would silently ignore every
 * override and capture the wrong thing.
 *
 * **This is deliberately not a packaged smoke.** A packaged capture needs a bespoke mode in
 * `electron/main/index.ts`, and the plan's Global Constraints freeze that file apart from one named
 * line. What this does exercise is the real renderer, the real GPU path and the real readiness
 * hook; what it does not exercise is the `app://game/` protocol and the desktop bridge.
 *
 * Follows the hidden-window rules: `show: false`, background throttling disabled, audio muted
 * before content loads, `capturePage` with `stayHidden: true`, and every process closed on success
 * and on failure. Nothing here touches the desktop.
 */
export type SceneRequest = Readonly<{
  /** Written as `<name>.png` under the output root. */
  name: string;
  yawDegrees?: number;
  shadowPath?: 'lit' | 'fallback';
  /**
   * A TILE to click, to verify click-to-move end to end.
   *
   * A tile, not a pixel. Unprojecting a chosen pixel only tests whatever tile that pixel happens
   * to land on: at the start camera the obvious mid-screen points are far outdoor tiles, and every
   * route to them shares the villa exit, so three different clicks produced the same committed
   * tile and the test proved nothing. Forward-projecting a chosen tile CENTRE is controlled — the
   * caller filters the tile for walkability first, and a centre sits far from any tile boundary so
   * a one-pixel rounding wobble can never flip the answer.
   */
  clickTile?: Readonly<{ x: number; y: number }>;
  /**
   * A raw screen PIXEL to click, for the negative control only.
   *
   * The point is chosen to unproject off-map under the tilted inverse while landing inside the map
   * under the 2D one. Asserting that no movement is requested proves the tilted `insideMap` and
   * `unproject` pair is the one actually wired in — not merely that some self-consistent maths ran.
   */
  clickPixel?: Readonly<{ x: number; y: number }>;
  /** Stop NPCs walking, so a tile filtered as NPC-free at selection time is still free at click. */
  freezeNpcMotion?: boolean;
  /** World zoom, through the app's own test hook. Use 3 to frame an interior. */
  zoom?: 1 | 2 | 3;
  /** Absolute world minute, to capture a scene at night rather than at the 08:00 spawn. */
  minute?: number;
  /** Centre the camera on the protagonist, so the shot frames the room they are standing in. */
  centreOnPlayer?: boolean;
  /**
   * Relocate the protagonist to another map, through the app's own VFX fixture.
   *
   * That fixture exists to frame an effect, and relocating the player is how it does it - which is
   * also the only way to photograph a district the protagonist does not spawn in.
   */
  district?: Readonly<{ mapId: string; effectId: string }>;
}>;

export type SceneEvidence = Readonly<{
  name: string;
  yawDegrees: number;
  shadowPath: string;
  screenshot: string;
  evidence: Readonly<{
    rendererKind: string;
    drawCalls: number;
    meshCount: number;
    yawDegrees: number;
    shadowPath: string;
    shadowMapEnabled: boolean;
    atlasDrawCalls: number;
  }>;
  /** Present only when the scene asked for a click. */
  click?: Readonly<{
    /** The viewport-relative pixel the page actually dispatched at. */
    at: Readonly<{ x: number; y: number }>;
    /** The exact client coordinates and rect used, so Node can redo `eventPoint` byte for byte. */
    dispatched: Readonly<{ clientX: number; clientY: number; boxLeft: number; boxTop: number }>;
    cameraLabel: string;
    tileBefore: string;
    targetBefore: string | null;
    /** `movement.pendingTarget ?? movement.target` right after the click. Null if none was set. */
    target: string | null;
    status: string | null;
    /** Whether the committed player tile ever reached the requested tile. */
    arrived: boolean;
    arrivedAfterMs: number | null;
    destination: string;
  }>;
}>;

const PORT = 8099;
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

/** Loopback-only static server. Any path that escapes `dist/` is refused, not clamped. */
function startStaticServer(distRoot: string): Promise<Server> {
  const server = createServer((request, response) => {
    const requested = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
    const relative = normalize(requested === '/' ? '/index.html' : requested).replace(/^(\.\.[/\\])+/u, '');
    const file = join(distRoot, relative);
    // The trailing separator matters: without it a sibling `dist-evil` would pass the prefix test.
    if ((file !== distRoot && !file.startsWith(`${distRoot}${sep}`)) || !existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen(PORT, '127.0.0.1', () => resolveServer(server));
  });
}

/**
 * The Electron entry point, generated rather than checked in.
 *
 * A standalone main script is what keeps these captures inside the plan's budget: the packaged
 * app's main process is frozen apart from the lines the plan names.
 */
function mainScript(
  outputDirectory: string,
  scenes: readonly SceneRequest[],
  viewport: Readonly<{ width: number; height: number }>,
  readyTimeoutMs: number,
): string {
  return `
const { app, BrowserWindow } = require('electron');
const { join } = require('node:path');
const { writeFileSync } = require('node:fs');
const preloadPath = join(__dirname, 'capture-preload.js');

const scenes = ${JSON.stringify(scenes)};
const outputDirectory = ${JSON.stringify(outputDirectory)};
const viewport = ${JSON.stringify(viewport)};

// Taken from the real projection module in the tsx process, never re-derived here. The click test
// forward-projects a tile centre inside the page, and these three numbers are what make that
// inlined maths the SAME maths the app picks with rather than a second implementation of it.
const YAW_COS = ${String(Math.cos((CAMERA_YAW_DEGREES * Math.PI) / 180))};
const YAW_SIN = ${String(Math.sin((CAMERA_YAW_DEGREES * Math.PI) / 180))};
const GROUND_Z_SCALE = ${String(GROUND_Z_SCALE)};

app.commandLine.appendSwitch('force-device-scale-factor', '1');

// Electron reports an uncaught main-process exception by opening a modal dialog. In a hidden-window
// capture that both hangs the run - nothing is there to click OK - and puts a window on the user's
// desktop, which the verification rules forbid. Exit loudly on stderr instead.
process.on('uncaughtException', (error) => {
  console.error('SI_WORLD_25D_CAPTURE_FAILURE ' + (error && error.message ? error.message : String(error)));
  process.exit(1);
});
process.on('unhandledRejection', (error) => {
  console.error('SI_WORLD_25D_CAPTURE_FAILURE ' + String(error));
  process.exit(1);
});

// One window, reloaded per scene. Destroying and recreating raced the loopback server and the
// second load failed with ERR_FAILED.
let sharedWindow;

function ensureWindow() {
  if (sharedWindow) return sharedWindow;
  sharedWindow = new BrowserWindow({
    show: false,
    width: ${viewport.width},
    height: ${viewport.height},
    webPreferences: {
      backgroundThrottling: false,
      offscreen: false,
      contextIsolation: true,
      nodeIntegration: false,
      // WorldScene registers its siWorld*Fixture hooks only when siWorldSmokeMode is true, and the
      // packaged preload is what normally sets that. Served over http there is no preload, so the
      // camera and clock hooks never existed and an interior capture silently framed the street.
      preload: preloadPath,
    },
  });
  sharedWindow.webContents.setAudioMuted(true);
  return sharedWindow;
}

async function capture(scene) {
  const window = ensureWindow();
  // Omitting yaw exercises the app's own default rather than pinning one.
  const yawQuery = scene.yawDegrees === undefined ? '' : '&testYaw=' + scene.yawDegrees;
  const shadowPath = scene.shadowPath === undefined ? 'fallback' : scene.shadowPath;
  await window.loadURL(
    'http://127.0.0.1:${PORT}/?testRenderer=2-5d&testShadowPath=' + shadowPath + yawQuery,
  );

  // The web export boots to the title screen, so the world - and the renderer - do not exist until
  // a new game starts. Served over http there is no desktop bridge, so starting one is a pure
  // client-side transition with no save write.
  await window.webContents.executeJavaScript(\`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const input = document.querySelector('input[aria-label="Player name"]');
      const start = document.querySelector('[aria-label="Start life on Halcyra"]');
      if (input && start) {
        // React tracks the previous value on the DOM node, so assigning .value directly is
        // swallowed. Going through the prototype setter is what makes the change event stick.
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'CAPTURE');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(120);
        start.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        start.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        start.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      }
      await wait(250);
    }
    throw new Error('The new-game flow never rendered.');
  })()\`);

  const deadline = Date.now() + ${readyTimeoutMs};
  let evidence;
  while (Date.now() < deadline) {
    evidence = await window.webContents.executeJavaScript(
      'window.siWorld25dEvidence ? window.siWorld25dEvidence() : null',
    );
    if (evidence) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!evidence) {
    throw new Error('The 2.5D renderer never published evidence for scene ' + scene.name + '.');
  }
  if (scene.zoom) {
    // Fail loudly. A missing hook used to return null and the capture silently framed the wide
    // exterior while claiming to be an interior.
    const zoomed = await window.webContents.executeJavaScript(
      'typeof window.siWorldSetRendererTestZoom === "function"'
      + ' ? { ok: true, zoom: window.siWorldSetRendererTestZoom(' + scene.zoom + ') }'
      + ' : { ok: false, keys: Object.keys(window).filter((k) => k.indexOf("siWorld") === 0) }',
    );
    if (!zoomed.ok) {
      throw new Error('siWorldSetRendererTestZoom is missing. siWorld hooks present: ' + JSON.stringify(zoomed.keys));
    }
    await new Promise((r) => setTimeout(r, 900));
  }

  if (scene.district) {
    const moved = await window.webContents.executeJavaScript(
      'typeof window.siWorldOpenVfxFixture === "function"'
      + ' ? (window.siWorldOpenVfxFixture("' + scene.district.mapId + '", "' + scene.district.effectId + '"'
      + (scene.minute === undefined ? '' : ', ' + scene.minute) + '), true) : false',
    );
    if (!moved) throw new Error('siWorldOpenVfxFixture is missing.');
    await new Promise((r) => setTimeout(r, 1400));
  }

  if (scene.minute !== undefined) {
    const timed = await window.webContents.executeJavaScript(
      'typeof window.siWorldSetSmokeMinute === "function"'
      + ' ? (window.siWorldSetSmokeMinute(' + scene.minute + '), true) : false',
    );
    if (!timed) throw new Error('siWorldSetSmokeMinute is missing.');
    await new Promise((r) => setTimeout(r, 900));
  }

  if (scene.centreOnPlayer) {
    // The app's own Center control, driven by its key binding: the surface listens for "f".
    await window.webContents.executeJavaScript(
      '(() => { const e = { key: "f", code: "KeyF", bubbles: true };'
      + ' window.dispatchEvent(new KeyboardEvent("keydown", e));'
      + ' window.dispatchEvent(new KeyboardEvent("keyup", e)); return true; })()',
    );
    await new Promise((r) => setTimeout(r, 900));
  }

  // Settle after readiness, so the capture is of a presented frame.
  await new Promise((r) => setTimeout(r, 750));

  let click;
  if (scene.clickTile || scene.clickPixel) {
    const clickScript = [
      'const TILE_TARGET = ' + JSON.stringify(scene.clickTile ?? null) + ';',
      'const PIXEL_TARGET = ' + JSON.stringify(scene.clickPixel ?? null) + ';',
      'const YAW_COS = ' + String(YAW_COS) + ';',
      'const YAW_SIN = ' + String(YAW_SIN) + ';',
      'const GROUND_Z_SCALE = ' + String(GROUND_Z_SCALE) + ';',
      '(async () => {',
      '  const wait = (ms) => new Promise((r) => setTimeout(r, ms));',
      '  const label = (id) => { const n = document.querySelector(\"#\" + id); return n ? (n.getAttribute(\"aria-label\") || \"\") : \"\"; };',
      '  const tile = () => { const t = label(\"world-state\"); const i = t.indexOf(\"tile \"); return i < 0 ? \"\" : t.slice(i + 5).split(\";\")[0].trim(); };',
      '  const movement = () => { const t = label(\"world-movement-state\"); if (!t) return null; try { return JSON.parse(t); } catch (e) { return null; } };',
      '  const targetOf = () => { const m = movement(); const t = m && m.player ? m.player.target : null; return t ? (t.x + \",\" + t.y) : null; };',
      '  const statusOf = () => { const m = movement(); return m && m.player ? m.player.status : null; };',
      '  if (!document.querySelector(\"#world-movement-state\")) throw new Error(\"world-movement-state is missing: smoke mode is off, so every target read would be a vacuous null\");',
      '  const surface = document.querySelector(\"#world-input-surface\");',
      '  const viewport = document.querySelector(\"#world-input-viewport\");',
      '  if (!surface || !viewport) throw new Error(\"world input surface or viewport is missing\");',
      '  const cameraLabel = label(\"world-camera-state\");',
      '  const parsed = /World camera (-?[0-9.]+),(-?[0-9.]+) at ([0-9.]+)x/.exec(cameraLabel);',
      '  if (!parsed) throw new Error(\"camera label unreadable: \" + cameraLabel);',
      '  const cameraX = Number(parsed[1]), cameraY = Number(parsed[2]), zoom = Number(parsed[3]);',
      '  const box = viewport.getBoundingClientRect();',
      '  let px, py;',
      '  if (TILE_TARGET) {',
      '    const worldX = TILE_TARGET.x * 32 + 16, worldY = TILE_TARGET.y * 32 + 16;',
      '    const dx = worldX - cameraX, dy = worldY - cameraY;',
      '    px = Math.round((dx * YAW_COS - dy * YAW_SIN) * zoom);',
      '    py = Math.round((dx * YAW_SIN + dy * YAW_COS) * GROUND_Z_SCALE * zoom);',
      '    if (px < 48 || py < 48 || px > box.width - 48 || py > box.height - 48) throw new Error(\"target tile projects off screen at \" + px + \",\" + py);',
      '  } else { px = PIXEL_TARGET.x; py = PIXEL_TARGET.y; }',
      '  const tileBefore = tile();',
      '  const targetBefore = targetOf();',
      '  if (label(\"world-camera-state\") !== cameraLabel) throw new Error(\"camera moved between the label read and the dispatch\");',
      '  const clientX = box.left + px, clientY = box.top + py;',
      '  const point = { clientX: clientX, clientY: clientY, bubbles: true, button: 0, pointerId: 1, isPrimary: true };',
      '  surface.dispatchEvent(new PointerEvent(\"pointerdown\", point));',
      '  surface.dispatchEvent(new PointerEvent(\"pointerup\", point));',
      '  let target = null, status = null;',
      '  for (let i = 0; i < 25 && target === null; i += 1) { await wait(20); target = targetOf(); status = statusOf(); }',
      '  let arrived = false, arrivedAfterMs = null;',
      '  if (TILE_TARGET && target !== null) {',
      '    const want = TILE_TARGET.x + \",\" + TILE_TARGET.y;',
      '    for (let waited = 0; waited < 12000 && !arrived; waited += 60) { await wait(60); if (tile() === want) { arrived = true; arrivedAfterMs = waited; } }',
      '  }',
      '  return { at: { x: px, y: py }, dispatched: { clientX: clientX, clientY: clientY, boxLeft: box.left, boxTop: box.top }, cameraLabel: cameraLabel, tileBefore: tileBefore, targetBefore: targetBefore, target: target, status: status, arrived: arrived, arrivedAfterMs: arrivedAfterMs, destination: tile() };',
      '})()',
    // The doubled backslash is on purpose. This block lives inside the template literal that
    // GENERATES main.js, so a single escape here emits a REAL newline into main.js and splits the
    // string literal in half. That is a SyntaxError, and Electron reports one by opening a modal
    // dialog on the desktop: a broken run and a broken hidden-window rule at the same time.
    ].join('\\n');
    click = await window.webContents.executeJavaScript(clickScript);
  }

  // Pinned to the requested viewport. capturePage returns DEVICE pixels, and a host whose display
  // scale is not 1 hands back a 2x image even with --force-device-scale-factor=1. That silently
  // doubled a district round: the frame scorer's crop was still in 1280x720 pixels, so it measured
  // the top-left quadrant and reported an art regression that had not happened. Resizing here keeps
  // every capture comparable to every other one regardless of the machine it ran on.
  // No backticks in this comment on purpose - it lives inside the template literal that GENERATES
  // main.js, so one would end that literal and produce a SyntaxError.
  const raw = await window.webContents.capturePage(undefined, { stayHidden: true });
  const size = raw.getSize();
  const image = (size.width === viewport.width && size.height === viewport.height)
    ? raw
    : raw.resize({ width: viewport.width, height: viewport.height, quality: 'good' });
  const screenshot = scene.name + '.png';
  writeFileSync(join(outputDirectory, screenshot), image.toPNG());
  return { name: scene.name, yawDegrees: evidence.yawDegrees, shadowPath, screenshot, evidence, click };
}

app.whenReady().then(async () => {
  const report = [];
  try {
    for (const scene of scenes) report.push(await capture(scene));
    console.log('SI_WORLD_25D_CAPTURE_RESULT ' + JSON.stringify(report));
    app.exit(0);
  } catch (error) {
    console.error('SI_WORLD_25D_CAPTURE_FAILURE ' + (error && error.message ? error.message : String(error)));
    app.exit(1);
  }
});
`;
}

export async function captureScenes(
  scenes: readonly SceneRequest[],
  outputRoot: string,
  viewport: Readonly<{ width: number; height: number }> = { width: 1280, height: 720 },
  readyTimeoutMs = 60_000,
): Promise<readonly SceneEvidence[]> {
  const distRoot = resolve(process.cwd(), 'dist');
  if (!existsSync(join(distRoot, 'index.html'))) {
    throw new Error('dist/index.html is missing. Run `npm run export:web` first.');
  }

  mkdirSync(outputRoot, { recursive: true });
  const server = await startStaticServer(distRoot);
  // Everything after the listen goes inside the try, or a throw while writing the workspace leaves
  // the server holding the port.
  let workspace: string | undefined;
  try {
    // A const for the closure below: TypeScript will not narrow the outer `let` inside it.
    const directory = mkdtempSync(join(tmpdir(), 'si-world-25d-'));
    workspace = directory;
    const userData = join(directory, 'user-data');
    mkdirSync(userData, { recursive: true });
    writeFileSync(join(directory, 'main.js'), mainScript(outputRoot, scenes, viewport, readyTimeoutMs));
    // Exposes the one flag the app's own test hooks are gated on. Nothing else.
    writeFileSync(
      join(directory, 'capture-preload.js'),
      "const { contextBridge } = require('electron');\n"
      + "contextBridge.exposeInMainWorld('siWorldSmokeMode', true);\n"
      // NPCs walk on their schedules, so a tile filtered as NPC-free when the click point was
      // chosen can have someone standing on it by the time the click lands - and an NPC under the
      // point makes handlePrimary open a conversation instead of moving.
      + (scenes.some((scene) => scene.freezeNpcMotion === true)
        ? "contextBridge.exposeInMainWorld('siWorldFreezeNpcMotion', true);\n" : ''),
    );
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'si-world-25d-capture', main: 'main.js' }));

    const electron = resolve(process.cwd(), 'node_modules/.bin/electron');
    const raw = await new Promise<string>((resolveRun, rejectRun) => {
      const child = spawn(electron, [directory, `--user-data-dir=${userData}`], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 300_000);
      child.once('error', (error) => {
        clearTimeout(timeout);
        // An Electron that started and then errored would otherwise outlive this process.
        child.kill('SIGKILL');
        rejectRun(error);
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        const prefix = 'SI_WORLD_25D_CAPTURE_RESULT ';
        const line = stdout.split(/\r?\n/u).find((candidate) => candidate.startsWith(prefix));
        if (code !== 0 || !line) {
          rejectRun(new Error(`2.5D capture exited with ${String(code)}.\n${stderr.slice(-4000)}\n${stdout.slice(-4000)}`));
          return;
        }
        resolveRun(line.slice(prefix.length));
      });
    });
    return JSON.parse(raw) as readonly SceneEvidence[];
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    if (workspace) rmSync(workspace, { force: true, recursive: true });
  }
}
