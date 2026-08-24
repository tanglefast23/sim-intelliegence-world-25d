import { captureScenes } from './hidden-window-capture';
import { resolveEvidenceOutputRoot } from './evidence-output';

/** The residential garden by day, where the flat-lying trees were most obvious. */
const evidenceRoot = resolveEvidenceOutputRoot(process.argv.slice(2), {
  defaultRelative: 'artifacts/phase-25d/stage-5/bisect',
  allowedRootPrefixes: ['artifacts/phase-25d'],
});

void captureScenes(
  [{
    name: 'garden-day', shadowPath: 'lit', zoom: 3, minute: 720, centreOnPlayer: true,
    standOnTile: { x: 31, y: 26 },
  }],
  evidenceRoot,
).then(([scene]) => {
  console.log(`${scene!.name}: ${String(scene!.evidence.drawCalls)} draw calls`);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
