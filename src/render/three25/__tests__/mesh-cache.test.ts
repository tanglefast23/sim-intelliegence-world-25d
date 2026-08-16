import { SceneCache } from '../mesh-cache';
import type { QuadDescriptor, SceneDescriptor } from '../scene-builder';
import { buildScene } from '../scene-builder';
import { indoorFrame } from './fixtures';

const quad = (id: string): QuadDescriptor => ({
  id,
  sprite: 'tile.floor',
  source: { x: 0, y: 0, width: 32, height: 32 } as QuadDescriptor['source'],
  x: 0,
  z: 0,
  width: 1,
  depth: 1,
  tint: '#ffffffff',
  opacity: 1,
});

const scene = (ids: readonly string[]): SceneDescriptor => ({ floors: ids.map(quad), boxes: [] });

describe('scene cache', () => {
  test('adds everything on the first sync', () => {
    const cache = new SceneCache();
    const delta = cache.sync(scene(['a', 'b', 'c']), 'map-1');
    expect(delta.added).toEqual(['a', 'b', 'c']);
    expect(delta.removed).toEqual([]);
    expect(cache.size()).toBe(3);
  });

  test('an identical sync changes nothing', () => {
    const cache = new SceneCache();
    cache.sync(scene(['a', 'b']), 'map-1');
    const delta = cache.sync(scene(['a', 'b']), 'map-1');
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(delta.unchanged).toBe(2);
  });

  test('a one-tile pan touches only the delta', () => {
    const cache = new SceneCache();
    cache.sync(scene(['a', 'b', 'c']), 'map-1');
    const delta = cache.sync(scene(['b', 'c', 'd']), 'map-1');
    expect(delta.added).toEqual(['d']);
    expect(delta.removed).toEqual(['a']);
    expect(delta.unchanged).toBe(2);
  });

  test('a map change drops everything, reusing nothing', () => {
    const cache = new SceneCache();
    cache.sync(scene(['a', 'b']), 'map-1');
    const delta = cache.sync(scene(['a', 'b']), 'map-2');
    // The same id in both lists is deliberate: map-1's 'a' is not map-2's 'a', so the renderer
    // must dispose the old mesh before creating the new one under that name.
    expect(delta.added).toEqual(['a', 'b']);
    expect(delta.removed).toEqual(['a', 'b']);
    expect(delta.unchanged).toBe(0);
  });

  test('an empty scene removes everything and holds nothing', () => {
    const cache = new SceneCache();
    cache.sync(scene(['a', 'b']), 'map-1');
    const delta = cache.sync(scene([]), 'map-1');
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual(['a', 'b']);
    expect(delta.unchanged).toBe(0);
    expect(cache.size()).toBe(0);
  });

  test('clear forces the next sync to rebuild, even on the same map', () => {
    const cache = new SceneCache();
    cache.sync(scene(['a', 'b']), 'map-1');
    cache.clear();
    expect(cache.size()).toBe(0);
    const delta = cache.sync(scene(['a', 'b']), 'map-1');
    expect(delta.added).toEqual(['a', 'b']);
    expect(delta.unchanged).toBe(0);
  });

  test('counts boxes as well as floors', () => {
    const cache = new SceneCache();
    const frame = indoorFrame();
    const built = buildScene(frame);
    const delta = cache.sync(built, frame.mapHash);
    expect(delta.added).toHaveLength(built.floors.length + built.boxes.length);
    expect(cache.size()).toBe(built.floors.length + built.boxes.length);
  });

  /**
   * The whole point of the cache. A real villa frame resynced unchanged must produce an empty
   * delta, or every pan rebuilds thousands of meshes and the frame budget is gone.
   */
  test('a real villa scene resyncs with no work', () => {
    const cache = new SceneCache();
    const frame = indoorFrame();
    cache.sync(buildScene(frame), frame.mapHash);
    const delta = cache.sync(buildScene(frame), frame.mapHash);
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(delta.unchanged).toBeGreaterThan(0);
  });
});
