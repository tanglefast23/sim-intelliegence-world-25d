import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PNG } from 'pngjs';

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
 *
 * It distinguishes two failures that need opposite fixes and look identical in a screenshot:
 * geometry never BUILT, which is the catastrophe that actually shipped and fails this script, and
 * geometry built but too faint to survive the floor under it, which warns. Measured today: fire 16
 * quads, club neon 4, yard steam 2, courtyard steam 8, harbour water 6 — all built, and the last
 * two invisible over bright ground.
 */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-5/vfx',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

const NIGHT = 1245;
const VFX_STEP = 2;

/**
 * How many pixels must differ from the no-effect control before an effect counts as rendered.
 *
 * Low, because these are small effects: a steam plume is a handful of wisps. High enough that
 * compression noise or a one-pixel jitter cannot pass for a plume.
 */
const MINIMUM_CHANGED_PIXELS = 60;

/** Pixels differing by more than a rounding step between two same-size captures. */
function changedPixelCount(left: Buffer, right: Buffer): number {
  const a = PNG.sync.read(left);
  const b = PNG.sync.read(right);
  if (a.width !== b.width || a.height !== b.height) return 0;
  let changed = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    if (Math.abs(a.data[index]! - b.data[index]!) > 2
      || Math.abs(a.data[index + 1]! - b.data[index + 1]!) > 2
      || Math.abs(a.data[index + 2]! - b.data[index + 2]!) > 2) {
      changed += 1;
    }
  }
  return changed;
}

/**
 * Each fixture, and an UNBLOCKED tile that keeps the emitter in OPEN frame.
 *
 * North-west of the emitter, not south-east. At yaw 45 that puts the effect down and right of the
 * player, clear of the HUD panel in the top-left. Standing on the other side sent a steam plume up
 * behind that panel, where it read as a faint 3,000-pixel difference through translucent chrome and
 * looked, in the screenshot, like nothing at all.
 *
 * The water glint stands three tiles back rather than two: everything nearer it is water, and
 * `siWorldStandOnTile` now refuses a blocked tile instead of accepting it and framing somewhere
 * else, which is how a fixture came to be photographed with its own effect out of shot.
 */
const FIXTURES = [
  { name: 'vfx-patio-fire', mapId: 'northwest_residential', effectId: 'patio-fire', tile: { x: 27, y: 34 } },
  { name: 'vfx-yard-steam', mapId: 'southeast_docks', effectId: 'yard-steam', tile: { x: 19, y: 30 } },
  { name: 'vfx-courtyard-steam', mapId: 'southwest_commercial', effectId: 'courtyard-steam-west', tile: { x: 9, y: 32 } },
  { name: 'vfx-club-neon', mapId: 'northeast_downtown', effectId: 'club-neon-west', tile: { x: 16, y: 22 } },
  { name: 'vfx-harbor-water', mapId: 'southeast_docks', effectId: 'harbor-water-glint-north', tile: { x: 55, y: 33 } },
] as const;

void captureScenes(
  [...FIXTURES.map((fixture) => ({
    name: fixture.name,
    shadowPath: 'lit' as const,
    zoom: 3 as const,
    minute: NIGHT,
    centreOnPlayer: true,
    vfxStep: VFX_STEP,
    district: { mapId: fixture.mapId, effectId: fixture.effectId },
    standOnTile: fixture.tile,
  })),
  // The control: identical staging, with the VFX mode switched to the non-procedural fallback so
  // no ambient geometry is emitted at all. Anything that differs between the pair IS the effect.
  ...FIXTURES.map((fixture) => ({
    name: `control-${fixture.name}`,
    shadowPath: 'lit' as const,
    zoom: 3 as const,
    minute: NIGHT,
    centreOnPlayer: true,
    vfxStep: VFX_STEP,
    suppressVfx: true,
    district: { mapId: fixture.mapId, effectId: fixture.effectId },
    standOnTile: fixture.tile,
  }))],
  evidenceRoot,
).then((scenes) => {
  writeFileSync(
    join(evidenceRoot, 'vfx.json'),
    `${JSON.stringify({ schemaVersion: 2, scenes }, null, 2)}\n`,
  );

  /**
   * The effect has to be VISIBLE, not merely requested.
   *
   * Logging draw calls proved nothing: `meshCount` counts floors and boxes, so no VFX ever entered
   * it, and the renderer drew none of them at all for its entire life underneath exactly that kind
   * of check. This compares each fixture's frame against a control captured with the same staging
   * and the effects suppressed, and requires the pixels to differ.
   */
  const differing = scenes.filter((scene) => !scene.name.startsWith('control-')).map((scene) => {
    const shot = readFileSync(join(evidenceRoot, scene.screenshot));
    const control = readFileSync(join(evidenceRoot, `control-${scene.screenshot}`));
    return {
      name: scene.name,
      quads: scene.evidence.vfxAdditiveQuads + scene.evidence.vfxAlphaQuads,
      changedPixels: changedPixelCount(shot, control),
    };
  });
  for (const row of differing) {
    console.log(
      `${row.name.padEnd(24)} ${String(row.quads).padStart(4)} quads built, `
      + `${String(row.changedPixels).padStart(6)} pixels differ from the no-effect control`,
    );
  }
  // Two different failures, reported apart, because they need opposite fixes.
  const unbuilt = differing.filter((row) => row.quads === 0);
  const invisible = differing.filter((row) => row.quads > 0 && row.changedPixels < MINIMUM_CHANGED_PIXELS);
  if (unbuilt.length > 0) {
    throw new Error(
      `No VFX geometry was built for: ${unbuilt.map((row) => row.name).join(', ')}. `
      + 'The emitter is not reaching the frame at all - check the staging and the cull window.',
    );
  }
  if (invisible.length > 0) {
    // A WARNING, not a failure. Geometry that is built and faint is a legitimate authoring state -
    // a steam wisp is two pixels of 65% cream and it is meant to be subtle. The failure this script
    // exists for is geometry that is never built at all, which is how the 2.5D path shipped with no
    // VFX whatsoever. Conflating the two would make the check cry wolf until someone turned it off.
    console.warn(
      `WARNING: built but not visible against their own ground: ${invisible.map((row) => row.name).join(', ')}. `
      + 'Check OCCLUSION before reaching for width. Both steam fixtures failed this way and neither '
      + 'was faint: their emitters sit on the food stall the plume comes off, so the wisps rendered '
      + 'INSIDE a 1.35-tile counter. Widening made it worse, because a wider quad fell further '
      + 'within the box. A minimum height that clears the stall took the courtyard from 0 to 3,453. '
      + 'The harbour water glint is the one still unexplained: its quads build, they change nothing '
      + 'in the world, and the leading suspicion is that the camera clamp near the map edge holds '
      + 'the view back so the emitter never enters frame.',
    );
  }
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
