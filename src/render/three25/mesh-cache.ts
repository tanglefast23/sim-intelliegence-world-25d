import type { SceneDescriptor } from './scene-builder';

export type CacheDelta = Readonly<{
  added: readonly string[];
  removed: readonly string[];
  unchanged: number;
}>;

/**
 * Tracks which descriptor ids are currently realised as meshes.
 *
 * The world frame hands back a moving tile window, so its "static" lists churn on every pan.
 * Rebuilding all geometry each frame fails the performance gate; diffing by id turns that churn
 * into a small add/remove delta. The renderer owns the actual three.js objects — this class only
 * decides what changed.
 *
 * A map change drops everything: ids are only unique within one map, so carrying them across a
 * neighbourhood transfer would keep stale meshes alive under colliding names.
 *
 * **The caller must apply `removed` before `added`.** After a map change the same id can appear in
 * both lists — that is deliberate, and it is what forces the renderer to dispose map A's mesh
 * before creating map B's mesh under the same name. Applying `added` first overwrites the map
 * entry and leaks the old geometry; filtering the overlap out would keep the stale mesh forever.
 */
export class SceneCache {
  private live = new Set<string>();
  private mapHash: string | undefined;

  sync(scene: SceneDescriptor, mapHash: string): CacheDelta {
    const next = new Set<string>();
    for (const floor of scene.floors) next.add(floor.id);
    for (const box of scene.boxes) next.add(box.id);

    if (mapHash !== this.mapHash) {
      const removed = [...this.live];
      this.live = next;
      this.mapHash = mapHash;
      return { added: [...next], removed, unchanged: 0 };
    }

    const added: string[] = [];
    const removed: string[] = [];
    let unchanged = 0;
    for (const id of next) {
      if (this.live.has(id)) unchanged += 1;
      else added.push(id);
    }
    for (const id of this.live) if (!next.has(id)) removed.push(id);

    this.live = next;
    return { added, removed, unchanged };
  }

  clear(): void {
    this.live.clear();
    this.mapHash = undefined;
  }

  size(): number {
    return this.live.size;
  }
}
