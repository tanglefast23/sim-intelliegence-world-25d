import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  APP_CONTENT_SECURITY_POLICY,
  createAppProtocolHandler,
  registerAppSchemePrivileges,
  resolveAppRequest,
} from '../../electron/protocol/app-protocol';
import {
  IPC_CHANNELS,
  IpcRateLimiter,
  RendererReadySchema,
  RuntimeInfoSchema,
  registerRuntimeIpc,
} from '../../electron/ipc/contracts';
import { isTrustedAppUrl, lockedWebPreferences, lockWebContents } from '../../electron/main/security';
import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { PERSISTENCE_IPC_CHANNELS, registerPersistenceIpc } from '../../electron/persistence/ipc';
import { createInitialState } from '../../src/domain/state/initial-state';

describe('secure Electron boundary', () => {
  test('locked renderer preferences are explicit', () => {
    expect(lockedWebPreferences('/safe/preload.js')).toEqual(
      expect.objectContaining({
        allowRunningInsecureContent: false,
        contextIsolation: true,
        nodeIntegration: false,
        preload: '/safe/preload.js',
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
      }),
    );
  });

  test('the app scheme is privileged without bypassing CSP or CORS', () => {
    const registerSchemesAsPrivileged = jest.fn();
    registerAppSchemePrivileges({ registerSchemesAsPrivileged });

    expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
      expect.objectContaining({
        scheme: 'app',
        privileges: expect.objectContaining({
          bypassCSP: false,
          corsEnabled: false,
          secure: true,
          standard: true,
          supportFetchAPI: true,
        }),
      }),
    ]);
  });

  test.each([
    'https://example.com/',
    'file:///tmp/index.html',
    'app://evil/',
    'app://user@game/',
    'app://game:8123/',
    'not a url',
  ])('unexpected navigation is rejected: %s', (candidate) => {
    expect(isTrustedAppUrl(candidate)).toBe(false);
  });

  test('only the exact app scheme and host are trusted', () => {
    expect(isTrustedAppUrl('app://game/')).toBe(true);
    expect(isTrustedAppUrl('app://game/_expo/chunk.js')).toBe(true);
  });

  test('web contents deny outside navigation, all windows, and all webviews', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const setWindowOpenHandler = jest.fn();
    const contents = {
      on: jest.fn((eventName: string, handler: (...args: unknown[]) => void) => {
        handlers.set(eventName, handler);
      }),
      setWindowOpenHandler,
    } as unknown as WebContents;
    lockWebContents(contents);

    const outsideEvent = { preventDefault: jest.fn() };
    handlers.get('will-navigate')?.(outsideEvent, 'https://example.com/');
    expect(outsideEvent.preventDefault).toHaveBeenCalledTimes(1);

    const insideEvent = { preventDefault: jest.fn() };
    handlers.get('will-navigate')?.(insideEvent, 'app://game/next');
    expect(insideEvent.preventDefault).not.toHaveBeenCalled();

    const webviewEvent = { preventDefault: jest.fn() };
    handlers.get('will-attach-webview')?.(webviewEvent);
    expect(webviewEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(setWindowOpenHandler.mock.calls[0]?.[0]()).toEqual({ action: 'deny' });
  });

  test.each([
    'app://game/%2e%2e/secret',
    'app://game/%2E%2E%2Fsecret',
    'app://game/folder%5csecret',
    'app://evil/index.html',
    'app://game:9999/index.html',
  ])('protocol traversal or authority mismatch is rejected: %s', (requestUrl) => {
    expect(resolveAppRequest(requestUrl, '/safe/dist').ok).toBe(false);
  });

  test('protocol maps root and asset paths inside dist', () => {
    expect(resolveAppRequest('app://game/', '/safe/dist')).toEqual({
      ok: true,
      filePath: '/safe/dist/index.html',
    });
    expect(resolveAppRequest('app://game/_expo/chunk.js', '/safe/dist')).toEqual({
      ok: true,
      filePath: '/safe/dist/_expo/chunk.js',
    });
  });

  test('protocol denies mutation methods before file access', async () => {
    const fetchFile = jest.fn<Promise<Response>, [string]>();
    const handler = createAppProtocolHandler('/safe/dist', fetchFile);
    const response = await handler(new Request('app://game/', { method: 'POST' }));

    expect(response.status).toBe(405);
    expect(fetchFile).not.toHaveBeenCalled();
  });

  test('successful protocol responses retain CSP and nosniff headers', async () => {
    const handler = createAppProtocolHandler('/safe/dist', async () =>
      new Response('ok', { headers: { 'Content-Type': 'text/plain' }, status: 200 }),
    );
    const response = await handler(new Request('app://game/index.html'));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(response.headers.get('Content-Security-Policy')).toBe(APP_CONTENT_SECURITY_POLICY);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  test('CSP rejects WebAssembly evaluation now that CanvasKit is gone', () => {
    expect(APP_CONTENT_SECURITY_POLICY).not.toContain("'wasm-unsafe-eval'");
    expect(APP_CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
    expect(APP_CONTENT_SECURITY_POLICY).toContain("connect-src 'self'");
    expect(APP_CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(APP_CONTENT_SECURITY_POLICY).not.toMatch(/https?:/u);
  });

  test('IPC response and readiness payloads are closed', () => {
    expect(() =>
      RuntimeInfoSchema.parse({
        appVersion: '0.1.0',
        electronVersion: '43.3.0',
        extra: 'no',
        packaged: true,
        platform: 'darwin',
      }),
    ).toThrow();
    expect(() =>
      RendererReadySchema.parse({
        appUrl: 'app://game/',
        assetsLoaded: true,
        bridgeKeys: [
          'abortConversation', 'beginConversation', 'endConversation', 'getRuntimeInfo',
          'loadPresentationPreferences', 'loadSave', 'migrateSave', 'reportRendererReady', 'requestSave',
          'savePresentationPreferences', 'sendConversationTurn',
        ],
        canvasKitReady: true,
        nodeAccessBlocked: false,
      }),
    ).toThrow();
  });

  test('IPC handlers reject non-main-frame senders, extra payloads, and request floods', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: jest.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerRuntimeIpc(
      ipcMain,
      { appVersion: '0.1.0', electronVersion: '43.3.0', packaged: true, platform: 'darwin' },
      jest.fn(),
    );

    const mainFrame = { url: 'app://game/' };
    const trustedEvent = {
      sender: { id: 1, mainFrame },
      senderFrame: mainFrame,
    } as unknown as IpcMainInvokeEvent;
    expect(() =>
      handlers.get(IPC_CHANNELS.getRuntimeInfo)?.(trustedEvent, { unexpected: true }),
    ).toThrow('Unexpected IPC payload');

    const childFrame = { url: 'app://game/' };
    const childEvent = {
      sender: { id: 2, mainFrame },
      senderFrame: childFrame,
    } as unknown as IpcMainInvokeEvent;
    expect(() => handlers.get(IPC_CHANNELS.getRuntimeInfo)?.(childEvent)).toThrow(
      'trusted main frame',
    );

    const limiter = new IpcRateLimiter(2, 1_000);
    limiter.assertAllowed(7, 100);
    limiter.assertAllowed(7, 101);
    expect(() => limiter.assertAllowed(7, 102)).toThrow('rate exceeded');
  });

  test('preload exposes no raw IPC object or arbitrary invoke method', () => {
    const preload = readFileSync(resolve('electron/preload/index.ts'), 'utf8');
    expect(preload).toContain("contextBridge.exposeInMainWorld('siWorldDesktop', desktopBridge)");
    expect(preload).toContain("getRuntimeInfo: 'si-world:get-runtime-info'");
    expect(preload).toContain("loadPresentationPreferences: 'si-world:load-presentation-preferences'");
    expect(preload).toContain("reportRendererReady: 'si-world:report-renderer-ready'");
    expect(preload).toContain("loadSave: 'si-world:load-save'");
    expect(preload).toContain("requestSave: 'si-world:request-save'");
    expect(preload).toContain("savePresentationPreferences: 'si-world:save-presentation-preferences'");
    expect(preload).toContain("migrateSave: 'si-world:migrate-save'");
    expect(preload).toContain("beginConversation: 'si-world:begin-conversation'");
    expect(preload).toContain("sendConversationTurn: 'si-world:send-conversation-turn'");
    expect(preload).toContain("readVerbalMissionTurn: 'si-world:read-verbal-mission-turn'");
    expect(preload).toContain("completeVerbalMissionTurn: 'si-world:complete-verbal-mission-turn'");
    expect(preload).toContain("confirmVerbalMissionGoal: 'si-world:confirm-verbal-mission-goal'");
    expect(preload).toContain("endConversation: 'si-world:end-conversation'");
    expect(preload).toContain("abortConversation: 'si-world:abort-conversation'");
    expect(preload).toMatch(/import type \{ RendererReadyReport, RuntimeInfo \}/u);
    expect(preload).not.toMatch(/import \{[^}]*IPC_CHANNELS/u);
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer/u);
    expect(preload).not.toContain('invoke: ipcRenderer.invoke');
  });

  test('persistence IPC is main-frame-only, typed, size-bounded, and path-closed', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipcMain = {
      handle: jest.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    const requestSave = jest.fn(async () => ({
      status: 'saved' as const,
      slotId: 'slot-001' as const,
      saveGeneration: 1,
      checksum: 'a'.repeat(64),
      maintenanceWarnings: [],
    }));
    const loadSave = jest.fn(async () => ({ status: 'empty' as const, slotId: 'slot-001' as const }));
    const migrateSave = jest.fn(async () => ({
      status: 'migrated' as const,
      sourceSlotId: 'slot-001' as const,
      targetSlotId: 'slot-002' as const,
      saveGeneration: 1,
      checksum: 'b'.repeat(64),
      stateSchemaVersion: 4,
      maintenanceWarnings: [],
    }));
    registerPersistenceIpc(ipcMain, { requestSave, loadSave, migrateSave });

    const mainFrame = { url: 'app://game/' };
    const trustedEvent = {
      sender: { id: 41, mainFrame },
      senderFrame: mainFrame,
    } as unknown as IpcMainInvokeEvent;
    const savePayload = {
      slotId: 'slot-001',
      expectedSaveGeneration: null,
      trigger: 'manual',
      state: createInitialState(),
    };
    await expect(handlers.get(PERSISTENCE_IPC_CHANNELS.requestSave)?.(trustedEvent, savePayload)).resolves.toEqual(
      expect.objectContaining({ status: 'saved', saveGeneration: 1 }),
    );
    expect(requestSave).toHaveBeenCalledTimes(1);
    await expect(handlers.get(PERSISTENCE_IPC_CHANNELS.loadSave)?.(trustedEvent, '../escape')).rejects.toThrow();
    await expect(
      handlers.get(PERSISTENCE_IPC_CHANNELS.requestSave)?.(trustedEvent, 'x'.repeat(2 * 1_024 * 1_024)),
    ).rejects.toThrow('size limit');
    await expect(handlers.get(PERSISTENCE_IPC_CHANNELS.migrateSave)?.(trustedEvent, {
      sourceSlotId: 'slot-001',
      targetSlotId: 'slot-001',
      nextGenerationId: 'generation-migrated-001',
    })).rejects.toThrow('must differ');

    const childFrame = { url: 'app://game/' };
    const childEvent = {
      sender: { id: 42, mainFrame },
      senderFrame: childFrame,
    } as unknown as IpcMainInvokeEvent;
    await expect(handlers.get(PERSISTENCE_IPC_CHANNELS.loadSave)?.(childEvent, 'slot-001')).rejects.toThrow(
      'trusted main frame',
    );
  });

  test('release CI stays on macOS and Windows with hardware rendering', () => {
    const workflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
    const forgeConfig = readFileSync(resolve('forge.config.ts'), 'utf8');
    const mainProcess = readFileSync(resolve('electron/main/index.ts'), 'utf8');
    expect(workflow).not.toContain('--no-sandbox');
    expect(forgeConfig).toContain("const packagedApplicationName = 'SI World'");
    expect(mainProcess).not.toContain('app.disableHardwareAcceleration()');
    expect(mainProcess).toContain("'--si-world-smoke-mode=1'");
    expect(mainProcess).toContain("'--si-world-freeze-npc-motion=1'");
    expect(mainProcess).toContain('`--si-world-art-mode=${responsiveArtMode}`');
    const preload = readFileSync(resolve('electron/preload/index.ts'), 'utf8');
    expect(preload).toContain("process.argv.includes('--si-world-smoke-mode=1')");
    expect(preload).toContain("process.argv.includes('--si-world-freeze-npc-motion=1')");
    expect(preload).toContain("contextBridge.exposeInMainWorld('siWorldArtMode', smokeArtMode)");
  });

  test('CI packages platform shells without overwriting historical evidence', () => {
    const workflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain("branches: [main, 'codex/threejs-stage-*']");
    expect(workflow).toContain('runs-on: macos-15');
    expect(workflow).toContain('runs-on: macos-15-intel');
    expect(workflow).toContain('npm run verify:ci-build');
    expect(workflow).toContain('npm run package:mac:arm64');
    expect(workflow).toContain('--webgl2-probe --expect-arch=arm64');
    expect(workflow).toContain('SI_WORLD_PACKAGE_TARGET_ARCH: x64');
    expect(workflow).toContain('npm run package:mac:x64');
    expect(workflow).toContain('--webgl2-probe --expect-arch=x64');
    expect(workflow).toContain('npm run sign:test:mac');
    // Stage 7: Intel macOS is qualified by packaging, signing and a recorded WebGL 2 probe.
    // Its GPU blocklists WebGL 2 and no renderer survives without it, so functional coverage
    // moved to the ARM64 job. See artifacts/threejs-2d/stage-7/INTEL-WEBGL2.md.
    expect(workflow).toContain('--output-root output/verification/ci/macos-x64-intel/webgl2');
    expect(workflow).toContain('Record packaged WebGL 2 availability on Intel hardware');
    expect(workflow).toContain('runs-on: windows-2025');
    expect(workflow).toContain('npm run package:windows:x64');
    expect(workflow).toContain('./scripts/qualification/sign-windows-test.ps1');
    expect(workflow).toContain(
      'node --import tsx scripts/electron/run-package-smoke.ts --output-root output/verification/ci/windows-x64/package',
    );
    expect(workflow).toContain(
      'node --import tsx scripts/electron/run-natural-movement-package-smoke.ts --output-root output/verification/ci/windows-x64/natural-movement',
    );
    expect(workflow).not.toContain(
      'npm run smoke:electron -- --output-root output/verification/ci/windows-x64/package',
    );
    expect(workflow).toContain('--output-root output/verification/ci/windows-x64/package');
    expect(workflow).toContain('--output-root output/verification/ci/windows-x64/natural-movement');
    expect(workflow).not.toMatch(/artifacts\/phase-(?:14|22|23)/u);
    expect(workflow.match(/SI_WORLD_SMOKE_PROFILE: platform-shell/gu)).toHaveLength(10);
    const windowsSigner = readFileSync(resolve('scripts/qualification/sign-windows-test.ps1'), 'utf8');
    expect(windowsSigner).toContain("Windows Kits\\10\\bin");
    expect(windowsSigner).toContain('Get-AuthenticodeSignature');
    expect(windowsSigner).toContain("$signature.Status -eq 'UnknownError'");
    expect(windowsSigner).toContain("$signature.StatusMessage -match 'root certificate.+not trusted'");
    expect(windowsSigner).toContain("$signature.Status -notin @('Valid', 'NotTrusted') -and -not $expectedUntrustedRoot");
    expect(windowsSigner).toContain("$tamperedSignature.Status -ne 'HashMismatch'");
    expect(windowsSigner).not.toContain('CurrentUser\\Root');
    expect(windowsSigner).not.toContain('certutil.exe');
    expect(workflow).toContain('timeout-minutes: 2');
  });
});

describe('smoke renderer whitelist', () => {
  test('the preload renderer whitelist accepts both renderers and no dead values', () => {
    const source = readFileSync(resolve('electron/preload/index.ts'), 'utf8');
    expect(source).toContain("smokeRenderer === 'threejs-2d'");
    expect(source).toContain("smokeRenderer === 'threejs-2-5d'");
    expect(source).not.toContain("smokeRenderer === 'skia'");
  });
});
