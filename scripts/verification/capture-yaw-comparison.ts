import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveEvidenceOutputRoot } from './evidence-output';

/**
 * Renders the same villa frame at yaw 0 and yaw 35 so a human can judge whether the target look
 * survives the straight-on tilt this plan ships.
 *
 * **Serves the web export on 127.0.0.1 rather than loading the packaged app.** `?testRenderer` and
 * `?testYaw` are localhost-only overrides, and a packaged build loads over `app://game/` where the
 * hostname is `'game'` — loading the package would silently produce two identical yaw-0 images and
 * the comparison would be made on wrong evidence.
 *
 * Follows the hidden-window rules: `show: false`, background throttling disabled, audio muted
 * before content loads, `capturePage` on a window that never appears, and every process closed on
 * success and on failure. Nothing here touches the desktop.
 */
const YAWS = [0, 35] as const;
const PORT = 8099;
const VIEWPORT = { width: 1280, height: 720 } as const;
const READY_TIMEOUT_MS = 60_000;

const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-1/yaw-comparison',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

const distRoot = resolve(process.cwd(), 'dist');
if (!existsSync(join(distRoot, 'index.html'))) {
  throw new Error('dist/index.html is missing. Run `npm run export:web` first.');
}

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
function startStaticServer(): Promise<Server> {
  const server = createServer((request, response) => {
    const requested = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
    const relative = normalize(requested === '/' ? '/index.html' : requested).replace(/^(\.\.[/\\])+/u, '');
    const file = join(distRoot, relative);
    if (!file.startsWith(distRoot) || !existsSync(file)) {
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
 * A standalone main script is what keeps this task inside its budget: the packaged app's main
 * process is frozen apart from the five lines the plan names, and adding a bespoke capture mode
 * there would be a scope breach.
 */
function mainScript(outputDirectory: string): string {
  return `
const { app, BrowserWindow } = require('electron');
const { join } = require('node:path');
const { writeFileSync } = require('node:fs');

const yaws = ${JSON.stringify(YAWS)};
const outputDirectory = ${JSON.stringify(outputDirectory)};

app.commandLine.appendSwitch('force-device-scale-factor', '1');

// One window, reloaded per yaw. Destroying and recreating raced the loopback server and the
// second load failed with ERR_FAILED.
let sharedWindow;

function ensureWindow() {
  if (sharedWindow) return sharedWindow;
  sharedWindow = new BrowserWindow({
    show: false,
    width: ${VIEWPORT.width},
    height: ${VIEWPORT.height},
    webPreferences: {
      backgroundThrottling: false,
      offscreen: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  sharedWindow.webContents.setAudioMuted(true);
  return sharedWindow;
}

async function captureYaw(yaw, shadowPath = 'fallback') {
  const window = ensureWindow();
  await window.loadURL(\`http://127.0.0.1:${PORT}/?testRenderer=2-5d&testYaw=\${yaw}&testShadowPath=\${shadowPath}\`);

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
        setter.call(input, 'YAW CAPTURE');
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

  const deadline = Date.now() + ${READY_TIMEOUT_MS};
  let evidence;
  while (Date.now() < deadline) {
    evidence = await window.webContents.executeJavaScript(
      'window.siWorld25dEvidence ? window.siWorld25dEvidence() : null',
    );
    if (evidence) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!evidence) {
    throw new Error(\`The 2.5D renderer never published evidence at yaw \${yaw}.\`);
  }
  // Two paints after readiness, so the capture is of a presented frame.
  await new Promise((r) => setTimeout(r, 750));
  const image = await window.webContents.capturePage(undefined, { stayHidden: true });
  writeFileSync(join(outputDirectory, \`yaw-\${yaw}-\${shadowPath}.png\`), image.toPNG());
  return evidence;
}

app.whenReady().then(async () => {
  const report = [];
  try {
    for (const yaw of yaws) report.push({ yaw, shadowPath: 'fallback', evidence: await captureYaw(yaw, 'fallback') });
    report.push({ yaw: 0, shadowPath: 'lit', evidence: await captureYaw(0, 'lit') });
    console.log('SI_WORLD_YAW_COMPARISON_RESULT ' + JSON.stringify(report));
    app.exit(0);
  } catch (error) {
    console.error('SI_WORLD_YAW_COMPARISON_FAILURE ' + (error && error.message ? error.message : String(error)));
    app.exit(1);
  }
});
`;
}

async function main(): Promise<void> {
  mkdirSync(evidenceRoot, { recursive: true });
  const server = await startStaticServer();
  const workspace = mkdtempSync(join(tmpdir(), 'si-world-yaw-'));
  const userData = join(workspace, 'user-data');
  mkdirSync(userData, { recursive: true });
  writeFileSync(join(workspace, 'main.js'), mainScript(evidenceRoot));
  writeFileSync(join(workspace, 'package.json'), JSON.stringify({ name: 'si-world-yaw', main: 'main.js' }));

  const electron = resolve(process.cwd(), 'node_modules/.bin/electron');
  try {
    const report = await new Promise<string>((resolveRun, rejectRun) => {
      const child = spawn(electron, [workspace, `--user-data-dir=${userData}`], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 180_000);
      child.once('error', (error) => { clearTimeout(timeout); rejectRun(error); });
      child.once('close', (code) => {
        clearTimeout(timeout);
        const line = stdout.split(/\r?\n/u).find((candidate) => candidate.startsWith('SI_WORLD_YAW_COMPARISON_RESULT '));
        if (code !== 0 || !line) {
          rejectRun(new Error(`Yaw capture exited with ${String(code)}.\n${stderr.slice(-4000)}\n${stdout.slice(-4000)}`));
          return;
        }
        resolveRun(line.slice('SI_WORLD_YAW_COMPARISON_RESULT '.length));
      });
    });

    writeFileSync(
      join(evidenceRoot, 'yaw-comparison.json'),
      `${JSON.stringify({ schemaVersion: 1, viewport: VIEWPORT, captures: JSON.parse(report) }, null, 2)}\n`,
    );
    for (const yaw of YAWS) console.log(`Wrote ${join(evidenceRoot, `yaw-${yaw}-fallback.png`)}`);
    console.log(`Wrote ${join(evidenceRoot, 'yaw-0-lit.png')}`);
    console.log(`Wrote ${join(evidenceRoot, 'yaw-comparison.json')}`);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(workspace, { force: true, recursive: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
