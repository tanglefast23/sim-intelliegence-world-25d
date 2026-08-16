import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';

/**
 * The ART-04 board: horizontal walk readability under the tilted camera.
 *
 * `spec.md:321` and ART-04 record that front-facing horizontal walk readability is unresolved in
 * the shipped 2D game — a character walking left or right reads ambiguously, because the art is
 * four-direction and the side poses reuse the front torso. A tilt makes more movement read as
 * sideways, so the question is whether the 2.5D camera makes that worse.
 *
 * **This captures and does not judge, and it changes no art.** The verdict is
 * `captured, not judged`, and a human decides from the board.
 *
 * Regenerating the atlas is the highest-blast-radius change in the whole plan:
 *
 * - The Global Constraints say no character sprite is created or modified and `art:check` must stay
 *   green with no regeneration.
 * - `tests/fixtures/rendering/world-frame-v1.json` pins `atlasHash` per case, so any regeneration
 *   turns `src/render/__tests__/world-frame.test.ts` red and breaks "the 2D suite stays green after
 *   every task".
 * - `art:check` runs the builder then `git diff --exit-code`, so the Stage 4 closeout fails unless
 *   the regenerated output, `scripts/art/character-source.ts` and refreshed fixtures all land in
 *   one commit.
 *
 * If a later plan does apply the fallback, `spec.md:321` names it: a mirrored three-quarter head
 * and hair over the existing front torso and lateral legs. NOT a full side-facing body — that is
 * out of scope in both the spec and `CLAUDE.md`.
 */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-4/art04',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

async function main(): Promise<void> {
  // The same interior at both yaws on both shadow paths. The protagonist stands facing the camera
  // at the villa start position, which is the pose ART-04 is about.
  const scenes = await captureScenes(
    [
      { name: 'art04-yaw0-fallback', yawDegrees: 0, shadowPath: 'fallback' },
      { name: 'art04-yaw0-lit', yawDegrees: 0, shadowPath: 'lit' },
      { name: 'art04-yaw35-fallback', yawDegrees: 35, shadowPath: 'fallback' },
    ],
    evidenceRoot,
  );

  const report = {
    schemaVersion: 1 as const,
    /**
     * Deliberately not a pass or a fail. Nothing downstream in this plan consumes an ART-04
     * verdict except the closeout report, so deferring the judgement removes both the judgement
     * call and the blast radius of acting on it.
     */
    verdict: 'captured, not judged' as const,
    question: 'Does the tilted camera make front-facing horizontal walk read worse than 2D?',
    artChanged: false,
    scenes: scenes.map((scene) => ({
      name: scene.name,
      yawDegrees: scene.evidence.yawDegrees,
      shadowPath: scene.evidence.shadowPath,
      screenshot: scene.screenshot,
    })),
  };

  const output = join(evidenceRoot, 'art04.json');
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  for (const scene of scenes) console.log(`Wrote ${join(evidenceRoot, scene.screenshot)}`);
  console.log(`Wrote ${output}`);
  console.log('Verdict: captured, not judged. No character art was changed.');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
