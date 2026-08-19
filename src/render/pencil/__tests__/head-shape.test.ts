import { HEAD_SHAPES, HEAD_ROUND, headRadius, headRingPoints } from '../head-shape';
import { buildVampireLayout } from '../layout';
import { drawVampireCharacter } from '../parts';
import { hashSeed, Sketch } from '../sketch';
import { PENCIL_HEIGHT, PENCIL_WIDTH } from '../vampire';

function silhouette(shape: (typeof HEAD_SHAPES)[number]): string {
  const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
  sketch.boil(hashSeed('vampire-01', 'front', 'idle', 0));
  drawVampireCharacter(sketch, buildVampireLayout(shape), { facing: 'front', gait: 0, moving: false });
  const rows: string[] = [];
  for (let y = 0; y < PENCIL_HEIGHT; y += 4) {
    let row = '';
    for (let x = 0; x < PENCIL_WIDTH; x += 4) {
      row += (sketch.data[(y * PENCIL_WIDTH + x) * 4 + 3] as number) > 8 ? '#' : '.';
    }
    rows.push(row);
  }
  return rows.join('\n');
}

describe('head shape family', () => {
  test('carries the nine words from the reference', () => {
    expect([...HEAD_SHAPES]).toEqual([
      'round', 'square', 'tall', 'drop', 'pear', 'lump', 'wide', 'bumpy', 'wonky',
    ]);
  });

  test('the vampire is tall by default', () => {
    expect(buildVampireLayout().shape).toBe('tall');
    expect(buildVampireLayout('square').shape).toBe('square');
  });

  test('every shape draws a different head', () => {
    // Before this existed the skull was one hardcoded polygon, so every character we drew would
    // have worn the vampire's head.
    const seen = new Map<string, string>();
    for (const shape of HEAD_SHAPES) {
      const art = silhouette(shape);
      const clash = [...seen.entries()].find(([, other]) => other === art);
      expect(clash).toBeUndefined();
      seen.set(shape, art);
    }
  });

  test('square is boxy and round is not', () => {
    // A superellipse holds its radius into the corners; a circle does not.
    const corner = Math.PI / 4;
    expect(headRadius('square', corner)).toBeGreaterThan(1.2);
    expect(headRadius('round', corner)).toBe(1);
  });

  test('pear swells the jaw and lump swells the crown', () => {
    // y is down, so sin > 0 is the jaw. Getting this backwards silently swaps the two shapes.
    const jaw = Math.PI / 2;
    const crown = -Math.PI / 2;
    expect(headRadius('pear', jaw)).toBeGreaterThan(headRadius('pear', crown));
    expect(headRadius('lump', crown)).toBeGreaterThan(headRadius('lump', jaw));
  });

  test('never slides all the way onto the maths', () => {
    // At round 1 the silhouette stops looking drawn.
    expect(HEAD_ROUND).toBeLessThan(1);
    expect(HEAD_ROUND).toBeGreaterThan(0.8);
    const ring = headRingPoints('square', { round: HEAD_ROUND });
    expect(ring).toHaveLength(24);
  });

  test('the profile keeps the head width it has from the front', () => {
    const widest = (profileDir: -1 | 0 | 1) => {
      const ring = headRingPoints('tall', { profileDir });
      const xs = ring.map(({ dx }) => dx);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(widest(1)).toBeGreaterThan(widest(0) * 0.8);
    expect(widest(-1)).toBeGreaterThan(widest(0) * 0.8);
  });
});
