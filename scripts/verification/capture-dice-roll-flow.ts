import { resolve } from 'node:path';

import { captureScenes } from './hidden-window-capture';

const output = resolve('artifacts/dice-roll-flow');

void captureScenes([{ name: 'new-game-dice-roll', alarmScreenshot: true, shadowPath: 'fallback' }], output)
  .then((scenes) => process.stdout.write(`${JSON.stringify(scenes, null, 2)}\n`))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
