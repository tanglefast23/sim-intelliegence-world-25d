import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';

/**
 * One tight shot per VFX fixture, to prove the effects actually reach the screen.
 *
 * The 2.5D renderer drew no VFX at all for its entire life, and nothing caught it: the evidence
 * label counted rects the renderer never drew, and the district captures were framed on fixtures
 * that rendered nothing while their captions named the effect. A hook existing is not the same as
 * its output reaching a pixel.
 *
 * Separate from the district captures on purpose. Those are judged on composition, and standing
 * beside a two-pixel steam plume is not a composition — a pass that tried cost the harbour 0.95 of
 * detail. This file stands ON each fixture and asks only whether the effect is there.
 */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-5/vfx',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

const NIGHT = 1245;
const VFX_STEP = 2;

/** Each fixture, and a tile beside it that keeps the emitter mid-frame. */
const FIXTURES = [
  { name: 'vfx-patio-fire', mapId: 'northwest_residential', effectId: 'patio-fire', tile: { x: 27, y: 34 } },
  { name: 'vfx-yard-steam', mapId: 'southeast_docks', effectId: 'yard-steam', tile: { x: 21, y: 34 } },
  { name: 'vfx-courtyard-steam', mapId: 'southwest_commercial', effectId: 'courtyard-steam-west', tile: { x: 11, y: 36 } },
  { name: 'vfx-club-neon', mapId: 'northeast_downtown', effectId: 'club-neon-west', tile: { x: 16, y: 22 } },
  { name: 'vfx-harbor-water', mapId: 'southeast_docks', effectId: 'harbor-water-glint-north', tile: { x: 53, y: 30 } },
] as const;

void captureScenes(
  FIXTURES.map((fixture) => ({
    name: fixture.name,
    shadowPath: 'lit' as const,
    zoom: 3,
    minute: NIGHT,
    centreOnPlayer: true,
    vfxStep: VFX_STEP,
    district: { mapId: fixture.mapId, effectId: fixture.effectId },
    standOnTile: fixture.tile,
  })),
  evidenceRoot,
).then((scenes) => {
  writeFileSync(
    join(evidenceRoot, 'vfx.json'),
    `${JSON.stringify({ schemaVersion: 1, scenes }, null, 2)}\n`,
  );
  for (const scene of scenes) {
    console.log(`${scene.name}: ${String(scene.evidence.drawCalls)} draw calls, ${String(scene.evidence.meshCount)} descriptors`);
  }
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
