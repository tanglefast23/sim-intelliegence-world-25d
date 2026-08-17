import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PNG } from 'pngjs';

import { RendererReadySchema, type RendererReadyReport } from '../../electron/ipc/contracts';
import { isTrustedAppUrl } from '../../electron/main/security';
import { APP_URL } from '../../electron/protocol/app-protocol';

const RESULT_PREFIX = 'SI_WORLD_SMOKE_RESULT ';

function targetPackageArchitecture(): string {
  const architecture = process.env.SI_WORLD_PACKAGE_TARGET_ARCH ?? process.arch;
  if (architecture !== 'arm64' && architecture !== 'x64') {
    throw new Error(`Unsupported packaged architecture: ${architecture}.`);
  }
  return architecture;
}

export type PackageSmokeProfile = 'qualification' | 'platform-shell';

export interface RendererFpsEvidence {
  measuredFps: number;
  profile: PackageSmokeProfile;
  thresholdFps: number;
  thresholdPassed: boolean;
  thresholdRequired: boolean;
}

export function evaluateRendererFps(
  value: unknown,
  requestedProfile?: string,
): RendererFpsEvidence {
  const profile = requestedProfile ?? 'qualification';
  if (profile !== 'qualification' && profile !== 'platform-shell') {
    throw new Error(`Unknown package smoke profile: ${profile}.`);
  }
  const measuredFps = Number(value);
  if (!Number.isFinite(measuredFps) || measuredFps <= 0) {
    throw new Error(`Packaged renderer FPS measurement is invalid: ${String(value)}`);
  }
  const thresholdFps = 60;
  const thresholdPassed = Math.round(measuredFps) >= thresholdFps;
  const thresholdRequired = profile === 'qualification';
  if (thresholdRequired && !thresholdPassed) {
    throw new Error(`Packaged renderer did not hold a rounded 60 FPS during generation: ${String(value)}`);
  }
  return { measuredFps, profile, thresholdFps, thresholdPassed, thresholdRequired };
}

function filesUnder(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const entryPath = join(path, entry);
    return statSync(entryPath).isDirectory() ? filesUnder(entryPath) : [entryPath];
  });
}

function belongsToPackageTarget(filePath: string, platform: string, architecture: string): boolean {
  return filePath.replaceAll('\\', '/').includes(`-${platform}-${architecture}/`);
}

export function findPackagedExecutable(
  outputRoot: string,
  platform = process.platform,
  architecture = targetPackageArchitecture(),
): string {
  const candidates = filesUnder(outputRoot).filter((filePath) => {
    const name = basename(filePath).toLowerCase();
    if (!belongsToPackageTarget(filePath, platform, architecture)) return false;
    if (platform === 'darwin') {
      return filePath.includes('.app/Contents/MacOS/') && name === 'si-world';
    }
    if (platform === 'win32') {
      return name === 'si-world.exe';
    }
    throw new Error(`Unsupported packaged platform: ${platform}.`);
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one packaged executable, found ${candidates.length}.`);
  }
  const executable = candidates[0];
  if (!executable) {
    throw new Error('Packaged executable was not found.');
  }
  return executable;
}

export function findPackageArchive(
  outputRoot: string,
  platform = process.platform,
  architecture = targetPackageArchitecture(),
): string {
  const candidates = filesUnder(outputRoot).filter((filePath) =>
    basename(filePath) === 'app.asar' && belongsToPackageTarget(filePath, platform, architecture));
  if (candidates.length !== 1 || !candidates[0]) {
    throw new Error(`Expected one app.asar archive, found ${candidates.length}.`);
  }
  return candidates[0];
}

export function validatePackageListing(listing: string): void {
  const entries = new Set(
    listing.split(/\r?\n/u).filter(Boolean).map((entry) => entry.replaceAll('\\', '/')),
  );
  const required = [
    '/build/electron/main/index.js',
    '/build/electron/main/smoke-capture.js',
    '/build/electron/preload/index.js',
    '/build/electron/persistence/save-repository.js',
    '/build/src/domain/state/schema.js',
    '/dist/index.html',
    '/dist/webgl2-probe.html',
    '/node_modules/zod/package.json',
    '/node_modules/three/package.json',
  ];
  for (const requiredEntry of required) {
    if (!entries.has(requiredEntry)) {
      throw new Error(`Packaged archive is missing ${requiredEntry}.`);
    }
  }

  const requiredResourcePatterns = [
    /^\/dist\/assets\/assets\/generated\/world-atlas\.[a-f0-9]+\.png$/u,
    /^\/dist\/assets\/assets\/generated\/audio\/greeting\.[a-f0-9]+\.wav$/u,
    /^\/dist\/assets\/assets\/generated\/audio\/laugh\.[a-f0-9]+\.wav$/u,
    /^\/dist\/assets\/assets\/generated\/audio\/sigh\.[a-f0-9]+\.wav$/u,
    /^\/dist\/assets\/assets\/generated\/audio\/consequence\.[a-f0-9]+\.wav$/u,
    /^\/dist\/assets\/node_modules\/@expo-google-fonts\/silkscreen\/400Regular\/Silkscreen_400Regular\.[a-f0-9]+\.ttf$/u,
  ];
  for (const pattern of requiredResourcePatterns) {
    if (![...entries].some((entry) => pattern.test(entry))) {
      throw new Error(`Packaged archive is missing required resource matching ${String(pattern)}.`);
    }
  }

  const forbiddenPrefixes = [
    '/artifacts/',
    '/audits/',
    '/docs/',
    '/electron/',
    '/scripts/',
    '/src/',
    '/tests/',
    '/node_modules/expo/',
    '/node_modules/react-native/',
  ];
  const leakedEntry = [...entries].find((entry) =>
    forbiddenPrefixes.some((prefix) => entry.startsWith(prefix)),
  );
  if (leakedEntry) {
    throw new Error(`Packaged archive contains excluded source or dependency: ${leakedEntry}.`);
  }
}

export function parseSmokeResult(stdout: string): RendererReadyReport {
  const line = stdout
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith(RESULT_PREFIX));
  if (!line) {
    throw new Error('Packaged app did not emit a renderer readiness result.');
  }
  const report = RendererReadySchema.parse(JSON.parse(line.slice(RESULT_PREFIX.length)));
  if (report.phase !== 'world') throw new Error('Packaged app did not emit world renderer readiness.');
  if (!isTrustedAppUrl(report.appUrl) || report.appUrl !== APP_URL) {
    throw new Error('Packaged app reported an untrusted renderer URL.');
  }
  return report;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_SCREENSHOT_WIDTH = 640;
const MIN_SCREENSHOT_HEIGHT = 360;

function assertScreenshot(buffer: Buffer, label: string): Readonly<{ width: number; height: number }> {
  if (!buffer.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE)) {
    throw new Error(`${label} screenshot is not a PNG.`);
  }
  let decoded: PNG;
  try {
    decoded = PNG.sync.read(buffer);
  } catch (error) {
    throw new Error(`${label} screenshot is not a valid PNG.`, { cause: error });
  }
  if (decoded.width < MIN_SCREENSHOT_WIDTH || decoded.height < MIN_SCREENSHOT_HEIGHT) {
    throw new Error(
      `${label} screenshot dimensions are too small: ${decoded.width}x${decoded.height}.`,
    );
  }
  return { width: decoded.width, height: decoded.height };
}

export function validateScreenshotBuffers(
  loading: Buffer,
  ready: Buffer,
  options: Readonly<{ requireSameDimensions?: boolean; requireDifferentBytes?: boolean }> = {},
): void {
  const loadingDimensions = assertScreenshot(loading, 'Loading');
  const readyDimensions = assertScreenshot(ready, 'Ready');
  const requireSameDimensions = options.requireSameDimensions ?? true;
  if (requireSameDimensions && (
    loadingDimensions.width !== readyDimensions.width ||
    loadingDimensions.height !== readyDimensions.height
  )) {
    throw new Error(
      `Loading and ready screenshot dimensions do not match: ` +
      `${loadingDimensions.width}x${loadingDimensions.height} vs ${readyDimensions.width}x${readyDimensions.height}.`,
    );
  }
  // Off only when the caller knows the loading shell was never captured, so the two frames are the
  // same screen by construction and inequality would prove nothing.
  if ((options.requireDifferentBytes ?? true) && loading.equals(ready)) {
    throw new Error('Loading and ready screenshots are identical.');
  }
}

export function validateScreenshotEvidence(loadingPath: string, readyPath: string): void {
  validateScreenshotBuffers(
    readFileSync(loadingPath),
    readFileSync(readyPath),
    { requireSameDimensions: false },
  );
}

export function validateWorldZoomBuffers(zoomBuffers: readonly Buffer[]): void {
  if (zoomBuffers.length !== 3) throw new Error('World zoom evidence requires exactly three screenshots.');
  const dimensions = zoomBuffers.map((buffer, index) =>
    assertScreenshot(buffer, `World ${index + 1}x`));
  const firstDimensions = dimensions[0]!;
  if (dimensions.some(({ width, height }) =>
    width !== firstDimensions.width || height !== firstDimensions.height)) {
    throw new Error('World zoom screenshot dimensions do not match.');
  }
  for (let left = 0; left < zoomBuffers.length; left += 1) {
    for (let right = left + 1; right < zoomBuffers.length; right += 1) {
      if (zoomBuffers[left]?.equals(zoomBuffers[right]!) === true) {
        throw new Error('World zoom screenshots must be distinct.');
      }
    }
  }
}

export function validateWorldZoomEvidence(paths: readonly string[]): void {
  validateWorldZoomBuffers(paths.map((path) => readFileSync(path)));
}
