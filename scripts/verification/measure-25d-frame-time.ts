import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';

/**
 * CPU frame time for both shadow paths, in the districts that stress them hardest.
 *
 * `DEFAULT_SHADOW_PATH` is `lit`, so the shadow map ships to players, and until now nothing in the
 * repository measured what it costs. The map was raised from 256 over a 80-tile frustum to 1024
 * over 44 — eight times the texel density — on the strength of how the shadows looked, with no
 * number attached. A cost nobody measures is a cost nobody notices until a player does.
 *
 * **What this can and cannot tell you.** It measures the interval between rendered frames, which
 * while the renderer keeps up is simply the display's refresh period. So it detects DROPPED FRAMES
 * and it cannot price anything: a 120Hz host reads 8.3ms on any settings that keep up and a 60Hz
 * host reads 16.7ms on the same settings. It must never be used to bless a shadow-map size.
 *
 * Timing `renderer.render()` is not the alternative. That call returns as soon as it has queued its
 * commands, so it reports 0.2ms whatever the GPU is doing. Pricing the GPU properly needs a timer
 * query extension, which is not wired up here.
 *
 * The check is therefore a RATIO: p95 against the same run's median. A renderer that is keeping up
 * has them nearly equal whatever the refresh rate is, and a renderer that is not shows a p95 well
 * above its own median. That is host-independent, which an absolute 16.7ms threshold is not.
 */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-5/frame-time',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

/**
 * How far the 95th percentile may sit above the median before frames are being missed.
 *
 * A ratio, not a millisecond threshold: an absolute budget would pass or fail on the host's refresh
 * rate rather than on the renderer. 1.5 catches a stutter and tolerates ordinary scheduler jitter.
 */
const MAX_P95_OVER_MEDIAN = 1.5;

const DISTRICTS = [
  { name: 'downtown', mapId: 'northeast_downtown', effectId: 'club-neon-west' },
  { name: 'harbour', mapId: 'southeast_docks', effectId: 'yard-steam' },
] as const;

void captureScenes(
  DISTRICTS.flatMap((district) => ([
    {
      name: `${district.name}-lit`, shadowPath: 'lit' as const, zoom: 1, minute: 1245,
      centreOnPlayer: true, district: { mapId: district.mapId, effectId: district.effectId },
    },
    {
      name: `${district.name}-fallback`, shadowPath: 'fallback' as const, zoom: 1, minute: 1245,
      centreOnPlayer: true, district: { mapId: district.mapId, effectId: district.effectId },
    },
  ])),
  evidenceRoot,
).then((scenes) => {
  const rows = scenes.map((scene) => ({
    name: scene.name,
    shadowPath: scene.evidence.shadowPath,
    frameMedianMs: scene.evidence.frameMedianMs,
    frameP95Ms: scene.evidence.frameP95Ms,
    frameSamples: scene.evidence.frameSamples,
    drawCalls: scene.evidence.drawCalls,
  }));
  writeFileSync(
    join(evidenceRoot, 'frame-time.json'),
    `${JSON.stringify({
      schemaVersion: 2,
      maxP95OverMedian: MAX_P95_OVER_MEDIAN,
      note: 'Interval between frames. A dropped-frame check, not a cost measure.',
      rows,
    }, null, 2)}\n`,
  );
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(22)} median ${String(row.frameMedianMs).padStart(6)}ms  `
      + `p95 ${String(row.frameP95Ms).padStart(6)}ms  over ${String(row.frameSamples)} frames`,
    );
  }
  const ratio = (row: typeof rows[number]): number =>
    row.frameMedianMs <= 0 ? 0 : row.frameP95Ms / row.frameMedianMs;
  const worst = rows.reduce((best, row) => ratio(row) > ratio(best) ? row : best);
  console.log(
    `Worst p95/median: ${worst.name} at ${ratio(worst).toFixed(2)}x `
    + `(limit ${String(MAX_P95_OVER_MEDIAN)}x). Absolute numbers are the host's refresh rate.`,
  );
  if (worst.frameSamples < 30) {
    throw new Error(`Only ${String(worst.frameSamples)} frames sampled; the measurement is not trustworthy.`);
  }
  if (ratio(worst) > MAX_P95_OVER_MEDIAN) {
    throw new Error(`${worst.name} spikes to ${ratio(worst).toFixed(2)}x its own median frame interval: frames are being dropped.`);
  }
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
