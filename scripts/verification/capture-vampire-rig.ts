import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { captureScenes } from './hidden-window-capture';

async function main(): Promise<void> {
  const outputRoot = resolve('artifacts/kindergrimm-vampire/rig/world');
  const evidence = await captureScenes([{
    name: 'vampire-lantern-reach',
    district: { mapId: 'west_office', effectId: 'office-kettle-steam' },
    standOnTile: { x: 20, y: 15 },
    playerVisualId: 'vampire-01',
    playerFacing: 'front',
    playerRigIntent: {
      reach: { hand: 'right', target: { x: 94, y: 74 } },
      heldItem: { item: 'brass-lantern', hand: 'right' },
    },
    hideNpcs: true,
    hideHud: true,
    centreOnPlayer: true,
    zoom: 3,
    minute: 720,
    freezeNpcMotion: true,
  }], outputRoot, { width: 900, height: 720 });
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(resolve(outputRoot, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

void main();
