import { browserPersistence, type BrowserPersistence } from './effects/browser-persistence';
import { getDesktopBridge } from './DesktopBridge';

/**
 * The save surface shared by the Electron build and the web build.
 *
 * Deliberately narrower than `DesktopBridge`: it carries saves and presentation preferences and
 * nothing else. Renderer readiness stays on `getDesktopBridge()` because
 * `createRendererShellReadyReport` requires `app://game/`, which a web origin can never satisfy.
 */
export type SavePort = BrowserPersistence;

export function getSavePort(): SavePort {
  return getDesktopBridge() ?? browserPersistence;
}
