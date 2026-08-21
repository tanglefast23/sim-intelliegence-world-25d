import { resolve } from 'node:path';

import type { CharacterId } from '../../src/render/atlas';
import { captureScenes, type SceneRequest } from './hidden-window-capture';

const cast = [
  ['linda-boyfriend', 'marcus'],
  ['devon-price', 'devon'],
  ['rafael-cruz', 'rafael'],
  ['tomas-reed', 'tomas'],
  ['priya-nair', 'priya'],
  ['sora-tan', 'sora'],
  ['resident-01', 'calder'],
  ['resident-02', 'milo'],
  ['elise-moreau', 'elise'],
] as const satisfies readonly (readonly [CharacterId, string])[];

const scenes: SceneRequest[] = cast.flatMap(([visualId, name]) => (
  (['rear', 'front'] as const).map((facing) => ({
    name: `${name}-${facing}`,
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
  }))
));

void captureScenes(
  scenes,
  resolve('artifacts/phase-25d/office/seated-cast-final'),
  { width: 900, height: 720 },
);
