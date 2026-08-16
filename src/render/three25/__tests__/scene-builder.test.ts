import { buildFloorQuads } from '../scene-builder';
import { indoorFrame } from './fixtures';

describe('floor quads', () => {
  const frame = indoorFrame();

  test('emits one quad per floor placement', () => {
    expect(buildFloorQuads(frame)).toHaveLength(frame.floors.length + frame.groundDetails.length);
  });

  test('places quads on tile CENTRES, not tile corners', () => {
    // Props offset from the tile centre, so a floor on the corner would sit half a tile north-west
    // of the furniture standing on it.
    const first = buildFloorQuads(frame)[0]!;
    const source = frame.floors[0]!;
    expect(first.x).toBeCloseTo(source.tile.x + 0.5, 6);
    expect(first.z).toBeCloseTo(source.tile.y + 0.5, 6);
  });

  test('every quad is exactly one tile', () => {
    for (const quad of buildFloorQuads(frame)) {
      expect(quad.width).toBeCloseTo(1, 6);
      expect(quad.depth).toBeCloseTo(1, 6);
    }
  });

  test('carries the atlas source rect through unchanged', () => {
    expect(buildFloorQuads(frame)[0]!.source).toEqual(frame.floors[0]!.source);
  });

  test('ids stay unique so the mesh cache can diff them', () => {
    const quads = buildFloorQuads(frame);
    expect(new Set(quads.map((quad) => quad.id)).size).toBe(quads.length);
  });
});
