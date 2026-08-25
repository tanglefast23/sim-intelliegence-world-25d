import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('new-game world opening', () => {
  test('uses the protagonist tile and has no legacy showcase cast', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/render/WorldScene.tsx'), 'utf8');
    expect(source).toContain('centerCameraOnTile(initialTile, initialZoom');
    expect(source).not.toContain('OPENING_CAST_TILES');
    expect(source).not.toContain('openingShowcase');
    expect(source).not.toContain('{ x: 22, y: 27 }');
  });
});
