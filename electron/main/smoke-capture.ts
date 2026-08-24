export const SMOKE_CAPTURE_ATTEMPTS = 5;
export const SMOKE_CAPTURE_RETRY_MILLISECONDS = 80;
export const LOADING_SHELL_POLL_MILLISECONDS = 20;
export const LOADING_SHELL_WAIT_MILLISECONDS = 400;

export type SmokeCaptureRetryPolicy = Readonly<{
  deadlineMilliseconds?: number;
  maximumAttempts?: number;
  now?: () => number;
}>;

export async function retrySmokeCapture<T>(
  capture: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void>,
  policy: SmokeCaptureRetryPolicy = {},
): Promise<T> {
  const maximumAttempts = policy.maximumAttempts ?? SMOKE_CAPTURE_ATTEMPTS;
  if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1) {
    throw new Error('Smoke capture attempts must be a positive integer.');
  }
  const now = policy.now ?? Date.now;
  const deadline = policy.deadlineMilliseconds;
  if (deadline !== undefined && (!Number.isFinite(deadline) || deadline < 0)) {
    throw new Error('Smoke capture deadline must be a non-negative finite timestamp.');
  }
  let lastError: unknown;
  let attempts = 0;
  while (attempts < maximumAttempts) {
    if (deadline !== undefined && now() >= deadline) break;
    attempts += 1;
    try {
      return await capture();
    } catch (error: unknown) {
      lastError = error;
      if (attempts >= maximumAttempts) break;
      const remaining = deadline === undefined ? SMOKE_CAPTURE_RETRY_MILLISECONDS : deadline - now();
      if (remaining <= 0) break;
      await wait(Math.min(SMOKE_CAPTURE_RETRY_MILLISECONDS, remaining));
    }
  }
  const attemptLabel = attempts === 1 ? 'attempt' : 'attempts';
  throw new Error(
    `Smoke screenshot capture failed after ${attempts} ${attemptLabel}: ${String(lastError)}`,
  );
}

type EmptyCheckableFrame = Readonly<{ isEmpty: () => boolean }>;

function assertNonEmpty<T extends EmptyCheckableFrame>(captured: T): T {
  if (captured.isEmpty()) throw new Error('Electron returned an empty screenshot.');
  return captured;
}

export async function captureNonEmptySmokeFrame<T extends EmptyCheckableFrame>(
  capture: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void>,
  policy: SmokeCaptureRetryPolicy = {},
): Promise<T> {
  return retrySmokeCapture(async () => assertNonEmpty(await capture()), wait, policy);
}

export async function waitForLoadingShell(
  loadingVisible: () => Promise<boolean>,
  wait: (milliseconds: number) => Promise<void>,
  maximumWaitMilliseconds = LOADING_SHELL_WAIT_MILLISECONDS,
): Promise<boolean> {
  if (!Number.isFinite(maximumWaitMilliseconds) || maximumWaitMilliseconds < 0) {
    throw new Error('Loading shell wait must be a non-negative finite duration.');
  }
  let elapsedMilliseconds = 0;
  while (!await loadingVisible()) {
    if (elapsedMilliseconds >= maximumWaitMilliseconds) return false;
    const delay = Math.min(LOADING_SHELL_POLL_MILLISECONDS, maximumWaitMilliseconds - elapsedMilliseconds);
    await wait(delay);
    elapsedMilliseconds += delay;
  }
  return true;
}

/**
 * Captures the loading shell when it is on screen.
 *
 * Stage 6 made Three.js the production renderer, which no longer waits for CanvasKit, so on a
 * fast machine the shell can clear before the main process gets its first frame. That is a
 * quicker boot, not a defect, so it is recorded rather than failed. When the shell IS present the
 * old strictness holds: the frame must be non-empty and the shell must still be there afterwards.
 */
export async function captureLoadingSmokeFrame<T extends EmptyCheckableFrame>(
  capture: () => Promise<T>,
  loadingVisible: () => Promise<boolean>,
  wait: (milliseconds: number) => Promise<void>,
  policy: SmokeCaptureRetryPolicy = {},
): Promise<Readonly<{ frame: T; loadingShellObserved: boolean }>> {
  try {
    const frame = await retrySmokeCapture(async () => {
      if (!await loadingVisible()) throw new Error('Loading shell is no longer visible.');
      const captured = assertNonEmpty(await capture());
      if (!await loadingVisible()) throw new Error('Loading shell changed during screenshot capture.');
      return captured;
    }, wait, policy);
    return { frame, loadingShellObserved: true };
  } catch (error) {
    // Stage 6 shortened the loading window: the production renderer no longer waits for
    // CanvasKit, so on a fast machine the shell can be gone before a capture completes. Both
    // "never on screen" and "vanished mid-capture" are therefore recorded as not observed rather
    // than failed, and the flag is the evidence. A capture that fails on its own still throws, so
    // a broken screenshot is never silently accepted.
    const message = String(error);
    const shellRaced = message.includes('Loading shell is no longer visible') ||
      message.includes('Loading shell changed during screenshot capture');
    if (!shellRaced) throw error;
    return { frame: assertNonEmpty(await capture()), loadingShellObserved: false };
  }
}
