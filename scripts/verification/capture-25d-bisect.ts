import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';

/** Same docks frame on both shadow paths, so a dark prop can be blamed on the sun or cleared of it. */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-5/bisect',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});
const NIGHT = 1245;
const district = { mapId: 'southeast_docks', effectId: 'yard-steam' } as const;

void captureScenes(
  [
    { name: 'docks-lit', shadowPath: 'lit', zoom: 3, minute: NIGHT, centreOnPlayer: true, district },
    { name: 'docks-fallback', shadowPath: 'fallback', zoom: 3, minute: NIGHT, centreOnPlayer: true, district },
    { name: 'docks-lit-noon', shadowPath: 'lit', zoom: 3, minute: 720, centreOnPlayer: true, district },
  ],
  evidenceRoot,
).then((scenes) => {
  for (const scene of scenes) console.log(`${scene.name}: ${scene.evidence.shadowPath}, ${String(scene.evidence.drawCalls)} calls`);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
