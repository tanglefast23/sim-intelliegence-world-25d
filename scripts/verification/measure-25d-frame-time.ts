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
 * Reports the median and the 95th percentile. The mean is the wrong statistic: a renderer that
 * averages 8ms and stalls to 40 once a second reads as smooth in a mean and as a stutter to a
 * player.
 */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-5/frame-time',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

/** 60 FPS. The renderer's own CPU work has to fit well inside this, not merely inside it. */
const BUDGET_MILLISECONDS = 16.7;

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
    `${JSON.stringify({ schemaVersion: 1, budgetMilliseconds: BUDGET_MILLISECONDS, rows }, null, 2)}\n`,
  );
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(22)} median ${String(row.frameMedianMs).padStart(6)}ms  `
      + `p95 ${String(row.frameP95Ms).padStart(6)}ms  over ${String(row.frameSamples)} frames`,
    );
  }
  const worst = rows.reduce((best, row) => row.frameP95Ms > best.frameP95Ms ? row : best);
  console.log(`Worst p95: ${worst.name} at ${String(worst.frameP95Ms)}ms against a ${String(BUDGET_MILLISECONDS)}ms budget.`);
  if (worst.frameSamples < 30) {
    throw new Error(`Only ${String(worst.frameSamples)} frames sampled; the measurement is not trustworthy.`);
  }
  if (worst.frameP95Ms > BUDGET_MILLISECONDS) {
    throw new Error(`${worst.name} spends ${String(worst.frameP95Ms)}ms at p95, over the ${String(BUDGET_MILLISECONDS)}ms budget for 60 FPS.`);
  }
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
