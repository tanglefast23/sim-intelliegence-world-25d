import { hashSeed, Sketch } from '../sketch';

describe('kindergrimm pencil sketch', () => {
  test('same seed redraws the same vampire crumbs', () => {
    const left = new Sketch(64, 80);
    const right = new Sketch(64, 80);
    left.boil(hashSeed('vampire-01', 'front', 0));
    right.boil(hashSeed('vampire-01', 'front', 0));
    const pts = left.blobPts(32, 32, 16, 20, 0, 0.4);
    left.stroke(pts, 2.4);
    right.stroke(pts, 2.4);
    expect([...left.data]).toEqual([...right.data]);
  });

  test('a ribbon stroke paints ink without staying paper', () => {
    const sketch = new Sketch(48, 48);
    sketch.boil(7);
    sketch.stroke([{ x: 8, y: 24 }, { x: 40, y: 24 }], 3);
    const ink = [...sketch.data].filter((_value, index) => index % 4 === 0 && (sketch.data[index] ?? 255) < 80).length;
    expect(ink).toBeGreaterThan(20);
  });
});
