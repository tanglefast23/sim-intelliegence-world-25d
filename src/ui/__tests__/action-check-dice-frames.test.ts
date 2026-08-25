import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { PNG } from 'pngjs';

import manifest from '../../../assets/generated/action-check-dice.json';
import {
  ACTION_CHECK_DICE_CANONICAL_FINALS,
  ACTION_CHECK_DICE_ORIENTATIONS,
} from '../../render/pencil/action-check-dice';

const FRAME_IDS = [
  ...ACTION_CHECK_DICE_ORIENTATIONS.map(({ frameId }) => frameId),
  'soft-flight-shadow', 'strong-contact-shadow',
] as const;
type ManifestFrame = (typeof manifest.frames)[keyof typeof manifest.frames];
const manifestFrames = manifest.frames as unknown as Readonly<Record<string, ManifestFrame>>;

describe('Action Check KinderGrimm atlas', () => {
  test('the approved runtime atlas matches its manifest and contains every frame', () => {
    const source = readFileSync('assets/generated/action-check-dice.png');
    const recipeSource = readFileSync('src/render/pencil/action-check-dice.ts');
    const atlas = PNG.sync.read(source);
    expect(createHash('sha256').update(source).digest('hex')).toBe(manifest.atlasSha256);
    expect(createHash('sha256').update(recipeSource).digest('hex')).toBe(manifest.recipeSha256);
    expect(manifest.version).toBe(2);
    expect(manifest.status).toBe('approved');
    expect(Object.keys(manifest.frames)).toEqual(FRAME_IDS);
    expect(manifest.canonicalFinals).toEqual(ACTION_CHECK_DICE_CANONICAL_FINALS);
    expect(atlas.width).toBe(manifest.canvas.width * FRAME_IDS.length);
    expect(atlas.height).toBe(manifest.canvas.height);

    for (const frameId of FRAME_IDS) {
      const frame = manifestFrames[frameId]!;
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

  test('all visible triples are proper rotations of one right-handed physical die', () => {
    expect(ACTION_CHECK_DICE_ORIENTATIONS).toHaveLength(24);
    expect(new Set(ACTION_CHECK_DICE_ORIENTATIONS.map(({ frameId }) => frameId)).size).toBe(24);
    expect(ACTION_CHECK_DICE_ORIENTATIONS).toContainEqual(expect.objectContaining({ top: 1, left: 2, right: 3 }));
    expect(ACTION_CHECK_DICE_ORIENTATIONS).not.toContainEqual(expect.objectContaining({ top: 1, left: 3, right: 2 }));
    for (const top of [1, 2, 3, 4, 5, 6] as const) {
      const final = ACTION_CHECK_DICE_CANONICAL_FINALS[top];
      expect(ACTION_CHECK_DICE_ORIENTATIONS.find(({ frameId }) => frameId === final)?.top).toBe(top);
    }
  });
});
