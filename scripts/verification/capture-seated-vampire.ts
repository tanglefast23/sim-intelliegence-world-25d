import { resolve } from 'node:path';

import { captureScenes } from './hidden-window-capture';

const tag = process.argv[2] ?? 'baseline';
const requestedFacing = process.argv[3];
const facing = requestedFacing === 'rear' || requestedFacing === 'left' || requestedFacing === 'right'
  ? requestedFacing
  : 'front';
const zoom = process.argv[4] === '2' ? 2 : 3;
const yawDegrees = process.argv[5] === '0' ? 0 : undefined;

async function main(): Promise<void> {
  await captureScenes([{
    name: `vampire-chair-${tag}`,
    district: { mapId: 'west_office', effectId: 'office-kettle-steam' },
    ...(yawDegrees === undefined ? {} : { yawDegrees }),
    standOnTile: { x: 20, y: 15 },
    playerPose: 'seated',
    playerFacing: facing,
    hideNpcs: true,
    hideHud: true,
    centreOnPlayer: true,
    zoom,
    minute: 720,
    freezeNpcMotion: true,
  }], resolve('artifacts/phase-25d/office', `vampire-seated-${tag}`), { width: 900, height: 720 });
}

void main();
