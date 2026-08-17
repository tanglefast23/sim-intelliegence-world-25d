import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, hostname, platform, release, tmpdir, totalmem } from 'node:os';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';

import { parseSaveEnvelope } from '../../electron/persistence/save-format';
import { resolveTestedCommit } from '../qualification/tested-commit';
import { resolveEvidenceSource } from '../qualification/evidence-source';
import { resolveEvidenceOutputRoot } from '../verification/evidence-output';
import { WEBGL2_PROBE_URL } from '../../electron/protocol/app-protocol';

import {
  evaluateRendererFps,
  findPackageArchive,
  findPackagedExecutable,
  parseSmokeResult,
  validatePackageListing,
  validateScreenshotBuffers,
  validateScreenshotEvidence,
  validateWorldZoomEvidence,
} from './package-smoke-utils';

const commandArguments = process.argv.slice(2);
const webgl2Probe = commandArguments.includes('--webgl2-probe');
const expectedArchitectureArguments = commandArguments.filter((argument) => argument.startsWith('--expect-arch='));
if (expectedArchitectureArguments.length > 1) throw new Error('Only one expected architecture can be supplied.');
const expectedArchitecture = expectedArchitectureArguments[0]?.slice('--expect-arch='.length) ?? process.arch;
if (!['arm64', 'x64'].includes(expectedArchitecture)) {
  throw new Error('Expected architecture must be arm64 or x64.');
}

const outputRoot = process.env.SI_WORLD_PACKAGE_OUTPUT_ROOT
  ? resolve(process.cwd(), process.env.SI_WORLD_PACKAGE_OUTPUT_ROOT)
  : join(process.cwd(), 'out');
const testedCommit = resolveTestedCommit();
const executable = findPackagedExecutable(outputRoot);
const archive = findPackageArchive(outputRoot);
const asarCli = join(process.cwd(), 'node_modules/@electron/asar/bin/asar.js');
const listing = execFileSync(process.execPath, [asarCli, 'list', archive], {
  encoding: 'utf8',
  maxBuffer: 10_000_000,
});
validatePackageListing(listing);
const screenshotDirectory = resolveEvidenceOutputRoot(commandArguments, {
  allowedFlags: ['--webgl2-probe', '--expect-arch=arm64', '--expect-arch=x64'],
  defaultRelative: 'output/verification/package-smoke',
});
const screenshotPath = join(screenshotDirectory, 'packaged-electron.png');
const loadingScreenshotPath = join(screenshotDirectory, 'packaged-loading.png');
const newGameScreenshotPath = join(screenshotDirectory, 'world-new-game.png');
const worldZoomPaths = [1, 2, 3].map((zoom) => join(screenshotDirectory, `world-${zoom}x.png`));
const roofScreenshotPath = join(screenshotDirectory, 'world-roof-restored.png');
const downtownScreenshotPath = join(screenshotDirectory, 'world-downtown.png');
const ferryScreenshotPath = join(screenshotDirectory, 'world-ferry.png');
const commercialScreenshotPath = join(screenshotDirectory, 'world-commercial.png');
const loopScreenshotPath = join(screenshotDirectory, 'world-loop-complete.png');
const questOfferScreenshotPath = join(screenshotDirectory, 'world-linda-offer.png');
const conversationScreenshotPath = join(screenshotDirectory, 'world-conversation.png');
const socialScreenshotPath = join(screenshotDirectory, 'world-social.png');
const journalScreenshotPath = join(screenshotDirectory, 'world-journal.png');
const questScreenshotPath = join(screenshotDirectory, 'world-linda-quest.png');
const questOutcomeScreenshotPath = join(screenshotDirectory, 'world-linda-outcome.png');
const policeScreenshotPath = join(screenshotDirectory, 'world-police.png');
const tierBArtSmokeMode = process.env.SI_WORLD_TIER_B_ART_SMOKE === '1';
const tierBZoomPaths = ['downtown', 'commercial', 'ferry'].flatMap((label) =>
  [1, 2, 3].map((zoom) => join(screenshotDirectory, `world-${label}-${zoom}x.png`)));
mkdirSync(screenshotDirectory, { recursive: true });
const smokeUserData = mkdtempSync(join(tmpdir(), 'si-world-smoke-'));
rmSync(loadingScreenshotPath, { force: true });
rmSync(screenshotPath, { force: true });
rmSync(newGameScreenshotPath, { force: true });
worldZoomPaths.forEach((path) => rmSync(path, { force: true }));
rmSync(roofScreenshotPath, { force: true });
rmSync(downtownScreenshotPath, { force: true });
rmSync(ferryScreenshotPath, { force: true });
rmSync(commercialScreenshotPath, { force: true });
rmSync(loopScreenshotPath, { force: true });
rmSync(questOfferScreenshotPath, { force: true });
rmSync(conversationScreenshotPath, { force: true });
rmSync(socialScreenshotPath, { force: true });
rmSync(journalScreenshotPath, { force: true });
rmSync(questScreenshotPath, { force: true });
rmSync(questOutcomeScreenshotPath, { force: true });
rmSync(policeScreenshotPath, { force: true });
tierBZoomPaths.forEach((path) => rmSync(path, { force: true }));
const child = spawn(executable, [], {
  detached: false,
  env: {
    ...process.env,
    SI_WORLD_SMOKE: '1',
    ...(webgl2Probe ? { SI_WORLD_WEBGL2_PROBE: '1' } : {
      SI_WORLD_SMOKE_LOADING_SCREENSHOT: loadingScreenshotPath,
      SI_WORLD_SMOKE_SCREENSHOT: screenshotPath,
      SI_WORLD_SMOKE_WORLD_SCREENSHOT_DIR: screenshotDirectory,
    }),
    SI_WORLD_SMOKE_USER_DATA: smokeUserData,
  },
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let stdout = '';
let stderr = '';
const appendBounded = (current: string, chunk: Buffer): string =>
  `${current}${chunk.toString('utf8')}`.slice(-1_000_000);
child.stdout.on('data', (chunk: Buffer) => {
  stdout = appendBounded(stdout, chunk);
  const progressLines = chunk.toString('utf8').split(/\r?\n/u)
    .filter((line) => line.startsWith('SI_WORLD_SMOKE_PROGRESS '));
  progressLines.forEach((line) => process.stderr.write(`${line}\n`));
});
child.stderr.on('data', (chunk: Buffer) => {
  stderr = appendBounded(stderr, chunk);
});

let timedOut = false;
const FULL_WORLD_SMOKE_TIMEOUT_MS = 1_200_000;
const timeout = setTimeout(() => {
  timedOut = true;
  child.kill('SIGKILL');
}, FULL_WORLD_SMOKE_TIMEOUT_MS);
child.once('error', (error) => {
  clearTimeout(timeout);
  rmSync(smokeUserData, { force: true, recursive: true });
  throw error;
});
child.once('close', (code) => {
  clearTimeout(timeout);
  if (code !== 0) {
    rmSync(smokeUserData, { force: true, recursive: true });
    throw new Error(
      `Packaged app ${timedOut ? `timed out after ${FULL_WORLD_SMOKE_TIMEOUT_MS / 1_000} seconds` : `exited with ${String(code)}`}. ` +
      `${stderr.slice(-2_000)} ${stdout.slice(-4_000)}`,
    );
  }
  if (webgl2Probe) {
    rmSync(smokeUserData, { force: true, recursive: true });
    const prefix = 'SI_WORLD_WEBGL2_PROBE_RESULT ';
    const line = stdout.split(/\r?\n/u).find((candidate) => candidate.startsWith(prefix));
    if (!line) throw new Error('Packaged app did not emit WebGL 2 probe evidence.');
    const probe = JSON.parse(line.slice(prefix.length)) as Record<string, unknown>;
    if (probe.available !== true) throw new Error('Packaged WebGL 2 probe did not pass.');
    if (probe.appUrl !== WEBGL2_PROBE_URL) throw new Error('Packaged WebGL 2 probe did not load the trusted probe URL.');
    if (probe.architecture !== expectedArchitecture) {
      throw new Error(`Packaged architecture ${String(probe.architecture)} did not match ${expectedArchitecture}.`);
    }
    writeFileSync(join(screenshotDirectory, 'webgl2-probe.json'), `${JSON.stringify({
      ...probe,
      testedCommit,
    }, null, 2)}\n`, { encoding: 'utf8', flush: true });
    process.stdout.write(`Packaged WebGL 2 probe: ${JSON.stringify(probe)}\n`);
    return;
  }
  const autosaveDirectory = join(smokeUserData, 'si-world', 'save-slots', 'slot-001', 'autosaves');
  const majorQuestAutosave = readdirSync(autosaveDirectory)
    .filter((name) => /^autosave-[0-9]{12}\.json$/u.test(name))
    .map((name) => parseSaveEnvelope(JSON.parse(readFileSync(join(autosaveDirectory, name), 'utf8')) as unknown))
    .some((envelope) => envelope.trigger === 'major_quest' &&
      envelope.state.quests.linda_boyfriend_check?.status === 'resolved');
  rmSync(smokeUserData, { force: true, recursive: true });
  const report = parseSmokeResult(stdout);
  validateScreenshotEvidence(loadingScreenshotPath, screenshotPath);
  /**
   * The loading capture is deliberately tolerant: `captureLoadingSmokeFrame` grabs the current
   * frame even when `#loading-shell` has already gone, and records that by emitting
   * `SI_WORLD_SMOKE_LOADING_SHELL_OBSERVED false`. On a fast boot the current frame IS the new-game
   * screen, so demanding that it differ from the new-game capture asserts something that cannot be
   * true, and ARM64 fails on runner speed rather than on a defect.
   *
   * So the byte comparison only runs when the shell was actually captured. The PNG and dimension
   * checks still run either way, and the flag is echoed so a future flake is diagnosable from the
   * CI log alone.
   */
  const observedPrefix = 'SI_WORLD_SMOKE_LOADING_SHELL_OBSERVED ';
  const observedLine = stdout.split(/\r?\n/u).find((candidate) => candidate.startsWith(observedPrefix));
  const loadingShellObserved = observedLine?.slice(observedPrefix.length).trim() === 'true';
  process.stdout.write(`${observedPrefix}${String(loadingShellObserved)}\n`);
  validateScreenshotBuffers(
    readFileSync(loadingScreenshotPath),
    readFileSync(newGameScreenshotPath),
    { requireSameDimensions: false, requireDifferentBytes: loadingShellObserved },
  );
  validateScreenshotBuffers(readFileSync(newGameScreenshotPath), readFileSync(worldZoomPaths[0]!));
  validateWorldZoomEvidence(worldZoomPaths);
  validateScreenshotBuffers(
    readFileSync(worldZoomPaths[0]!),
    readFileSync(roofScreenshotPath),
    { requireSameDimensions: false },
  );
  const worldResultLine = stdout.split(/\r?\n/u).find((line) => line.startsWith('SI_WORLD_WORLD_SMOKE_RESULT '));
  if (!worldResultLine) throw new Error('Packaged app did not emit world input evidence.');
  const worldResult = JSON.parse(worldResultLine.slice('SI_WORLD_WORLD_SMOKE_RESULT '.length)) as Record<string, unknown>;
  const conversationDiagnostics = stdout.split(/\r?\n/u)
    .filter((line) => line.startsWith('SI_WORLD_CONVERSATION_DIAGNOSTIC '));
  worldResult.questAutosave = worldResult.questAutosave === true && majorQuestAutosave;
  for (const key of [
    'newGameFlow', 'stableProtagonist', 'allowanceReceipt', 'newGameSave', 'accessibilityPolicy',
    'responsiveSurface', 'resizeCamera', 'uiScaleControls',
    'zoomButtons', 'movement', 'middlePan', 'wheelZoom', 'gradualZoomPersistence', 'centerKey', 'cancelKey', 'uiClickThrough',
    'followCamera', 'followSuspends', 'impactShake', 'cameraDirector',
    'roofRestore', 'roofEntry', 'pausedClock', 'doubleSpeedClock', 'nap', 'overnightSleep', 'sleepAutosave',
    'travel', 'travelAutosave',
    'closedFerry', 'allNeighborhoods', 'allTravelAutosaves',
    'conversationPause', 'conversationInputLocked', 'conversationSocialNavLocked', 'conversationResponsiveState', 'promptIdeasContextual', 'conversationBuffered', 'conversationFallback', 'modelFailureFeedback', 'audioCaptions', 'conversationCommitSave',
    'structuredInvitation', 'relationshipPanel', 'hiddenFaction', 'journalInvitation', 'socialPurchase',
    'questOfferDialogue', 'questOfferPause', 'questStarted', 'questPreparationPreserved', 'questShortcut',
    'questChoicePreview', 'questOutcome', 'questAutosave', 'consequenceCaption', 'policeHooks', 'saveReload',
  ]) {
    if (worldResult[key] !== true) {
      throw new Error(
        `Packaged world input check failed: ${key}. ${JSON.stringify(worldResult)} ` +
        `diagnostics=${JSON.stringify(conversationDiagnostics)}`,
      );
    }
  }
  const feedbackMilliseconds = Number(worldResult.conversationFeedbackMilliseconds);
  const rendererFps = Number(worldResult.rendererFpsDuringGeneration);
  if (!Number.isFinite(feedbackMilliseconds) || feedbackMilliseconds > 100) {
    throw new Error(`Packaged non-text feedback exceeded 100 ms: ${String(worldResult.conversationFeedbackMilliseconds)}`);
  }
  const rendererFpsEvidence = evaluateRendererFps(
    worldResult.rendererFpsDuringGeneration,
    process.env.SI_WORLD_SMOKE_PROFILE,
  );
  if (!Number.isInteger(worldResult.rendererFpsSampledFrames) || Number(worldResult.rendererFpsSampledFrames) < 2) {
    throw new Error(`Packaged renderer FPS sample is incomplete: ${String(worldResult.rendererFpsSampledFrames)} frames.`);
  }
  worldResult.rendererFpsEvidence = rendererFpsEvidence;
  if (readFileSync(worldZoomPaths[0]!).equals(readFileSync(worldZoomPaths[2]!))) {
    throw new Error('Packaged 1x and 3x world evidence is identical.');
  }
  validateScreenshotBuffers(readFileSync(roofScreenshotPath), readFileSync(downtownScreenshotPath));
  validateScreenshotBuffers(readFileSync(downtownScreenshotPath), readFileSync(ferryScreenshotPath));
  validateScreenshotBuffers(readFileSync(ferryScreenshotPath), readFileSync(commercialScreenshotPath));
  validateScreenshotBuffers(readFileSync(commercialScreenshotPath), readFileSync(loopScreenshotPath));
  validateScreenshotBuffers(readFileSync(loopScreenshotPath), readFileSync(questOfferScreenshotPath));
  validateScreenshotBuffers(readFileSync(questOfferScreenshotPath), readFileSync(conversationScreenshotPath));
  validateScreenshotBuffers(readFileSync(conversationScreenshotPath), readFileSync(socialScreenshotPath));
  validateScreenshotBuffers(readFileSync(socialScreenshotPath), readFileSync(journalScreenshotPath));
  validateScreenshotBuffers(readFileSync(journalScreenshotPath), readFileSync(questScreenshotPath));
  validateScreenshotBuffers(readFileSync(questScreenshotPath), readFileSync(questOutcomeScreenshotPath));
  validateScreenshotBuffers(readFileSync(questOutcomeScreenshotPath), readFileSync(policeScreenshotPath));
  if (tierBArtSmokeMode) {
    for (const label of ['downtown', 'commercial', 'ferry']) {
      validateWorldZoomEvidence([1, 2, 3].map((zoom) =>
        join(screenshotDirectory, `world-${label}-${zoom}x.png`)));
    }
  }
  const qualificationReportPath = process.env.SI_WORLD_QUALIFICATION_REPORT;
  if (qualificationReportPath) {
    if (!rendererFpsEvidence.thresholdRequired) {
      throw new Error('A qualification report requires the qualification package smoke profile.');
    }
    const readyLine = stdout.split(/\r?\n/u).find((line) => line.startsWith('SI_WORLD_RENDERER_READY '));
    if (!readyLine) throw new Error('Packaged app did not emit renderer-ready timing.');
    const ready = JSON.parse(readyLine.slice('SI_WORLD_RENDERER_READY '.length)) as { milliseconds?: unknown };
    const rendererReadyMilliseconds = Number(ready.milliseconds);
    if (!Number.isFinite(rendererReadyMilliseconds) || rendererReadyMilliseconds <= 0) {
      throw new Error('Packaged renderer-ready timing is invalid.');
    }
    mkdirSync(resolve(qualificationReportPath, '..'), { recursive: true });
    writeFileSync(qualificationReportPath, `${JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      evidenceSource: resolveEvidenceSource([
        'electron/main/index.ts',
        'scripts/electron/package-smoke-utils.ts',
        'scripts/electron/run-package-smoke.ts',
        'src/ai/conversation/service.ts',
        'src/render/WorldScene.tsx',
        'src/ui/ConversationPanel.tsx',
      ]),
      testedCommit,
      qualificationProfile: process.env.SI_WORLD_QUALIFICATION_PROFILE ?? 'development-high-end',
      hardware: {
        platform: platform(), release: release(), architecture: arch(),
        processor: cpus()[0]?.model ?? 'unknown', logicalCpuCount: cpus().length,
        memoryBytes: totalmem(), hostFingerprint: createHash('sha256').update(hostname()).digest('hex'),
      },
      package: { executableName: basename(executable), bundledModelRuntime: process.env.SI_WORLD_MODEL_RESOURCE_DIR ? true : false },
      measurements: {
        rendererReadyMilliseconds,
        nonTextFeedbackMilliseconds: feedbackMilliseconds,
        rendererFpsDuringGeneration: rendererFps,
        rendererFpsSampledFrames: worldResult.rendererFpsSampledFrames,
      },
      worldChecks: worldResult,
      thresholds: {
        nonTextFeedback: feedbackMilliseconds <= 100,
        rendererFps: rendererFpsEvidence.thresholdPassed,
        rendererFpsRequired: rendererFpsEvidence.thresholdRequired,
      },
      limitations: process.env.SI_WORLD_MODEL_RESOURCE_DIR
        ? []
        : ['The renderer used the authored no-model fallback. Run the same package smoke with SI_WORLD_MODEL_RESOURCE_DIR for integrated model evidence.'],
    }, null, 2)}\n`, { encoding: 'utf8', flush: true });
  }
  process.stdout.write(
    `Packaged Electron smoke: ${JSON.stringify(report)} world=${JSON.stringify(worldResult)} loading=${loadingScreenshotPath} ready=${screenshotPath}\n`,
  );
});
