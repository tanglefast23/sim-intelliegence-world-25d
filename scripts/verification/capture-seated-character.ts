import { resolve } from 'node:path';

import type { CharacterId } from '../../src/render/atlas';
import { captureScenes } from './hidden-window-capture';

const visualId = (process.argv[2] ?? 'vampire-01') as CharacterId;
const tag = process.argv[3] ?? visualId;
const requestedFacing = process.argv[4];
const facing = requestedFacing === 'front' || requestedFacing === 'left' || requestedFacing === 'right'
  ? requestedFacing
  : 'rear';

async function main(): Promise<void> {
  await captureScenes([{
    name: `${tag}-${facing}`,
    district: { mapId: 'west_office', effectId: 'office-kettle-steam' },
    standOnTile: { x: 20, y: 15 },
    playerPose: 'seated',
    playerVisualId: visualId,
    playerFacing: facing,
    hideNpcs: true,
    hideHud: true,
    centreOnPlayer: true,
    zoom: 3,
    minute: 720,
    freezeNpcMotion: true,
  }], resolve('artifacts/phase-25d/office', `seated-${tag}-${facing}`), { width: 900, height: 720 });
}

void main();
