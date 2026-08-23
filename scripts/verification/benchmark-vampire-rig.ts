import { performance } from 'node:perf_hooks';

import { renderRiggedGeneratedVampireFrame } from '../../src/render/pencil/generated-vampire';

const pose = { facing: 'front', gait: 0, moving: false } as const;
const intent = {
  reach: { hand: 'right', target: { x: 90, y: 78 } },
  heldItem: { item: 'brass-lantern', hand: 'right' },
} as const;
const samples: number[] = [];

for (let index = 0; index < 220; index += 1) {
  const start = performance.now();
  renderRiggedGeneratedVampireFrame(pose, index % 3, false, intent);
  if (index >= 20) samples.push(performance.now() - start);
}

samples.sort((left, right) => left - right);
process.stdout.write(`VAMPIRE_RIG_P95_MS:${samples[Math.floor(samples.length * 0.95)]!}\n`);
