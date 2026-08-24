import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { PNG } from 'pngjs';

import manifest from '../../../assets/generated/action-check-dice.json';

const FRAME_IDS = [
  'die-1', 'die-2', 'die-3', 'die-4', 'die-5', 'die-6',
  'soft-flight-shadow', 'strong-contact-shadow',
] as const;

describe('Action Check KinderGrimm atlas', () => {
  test('the approved runtime atlas matches its manifest and contains every frame', () => {
    const source = readFileSync('assets/generated/action-check-dice.png');
    const recipeSource = readFileSync('src/render/pencil/action-check-dice.ts');
    const atlas = PNG.sync.read(source);
    expect(createHash('sha256').update(source).digest('hex')).toBe(manifest.atlasSha256);
    expect(createHash('sha256').update(recipeSource).digest('hex')).toBe(manifest.recipeSha256);
    expect(manifest.status).toBe('approved');
    expect(Object.keys(manifest.frames)).toEqual(FRAME_IDS);
    expect(atlas.width).toBe(manifest.canvas.width * FRAME_IDS.length);
    expect(atlas.height).toBe(manifest.canvas.height);

    for (const frameId of FRAME_IDS) {
      const frame = manifest.frames[frameId];
      const contact = frame.anchors.groundContact;
      expect(contact.x).toBeGreaterThanOrEqual(0);
      expect(contact.x).toBeLessThan(frame.width);
      expect(contact.y).toBeGreaterThanOrEqual(0);
      expect(contact.y).toBeLessThan(frame.height);
      let visible = false;
      for (let y = frame.y; y < frame.y + frame.height && !visible; y += 1) {
        for (let x = frame.x; x < frame.x + frame.width; x += 1) {
          if (atlas.data[(y * atlas.width + x) * 4 + 3] !== 0) {
            visible = true;
            break;
          }
        }
      }
      expect(visible).toBe(true);
    }
  });
});
