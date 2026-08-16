import northeastMapJson from '../../../../content/maps/northeast.json';
import northwestMapJson from '../../../../content/maps/northwest.json';
import southeastMapJson from '../../../../content/maps/southeast.json';
import southwestMapJson from '../../../../content/maps/southwest.json';
import { ATLAS_INDEX } from '../../atlas';
import {
  CONSUMED_SPRITES,
  FLAT_SPRITES,
  PROP_RECIPES,
  RUN_FORMING_GROUPS,
  WALL_HEIGHT_TILES,
  isResolved,
  recipeFor,
} from '../recipes';

const LANDMARKS = Object.entries(ATLAS_INDEX.sprites)
  .filter(([, cell]) => cell.category === 'object-landmark')
  .map(([id]) => id);

const CONTENT_MAPS = [northwestMapJson, northeastMapJson, southwestMapJson, southeastMapJson];

/** Where each part of a group sits relative to the owning part, by its index in the group. */
const PART_DELTAS: Readonly<Record<number, readonly Readonly<{ x: number; y: number }>[]>> = {
  2: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
  4: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
};

/**
 * A group forms a run when some placed object uses its parts in anything other than complete,
 * disjoint units. Owner-and-consume is only safe when every owning placement finds all of its
 * siblings at the exact expected offsets and no placement is left over — otherwise the owner's
 * multi-tile box overhangs a tile nobody placed, or overlaps the next copy of itself.
 *
 * `sunward-table` fails because a stall run is `left@0 right@1 left@2`: the second `left` has no
 * partner. `harbor-ferry` fails because it is `left@0 left@1 right@2 right@3`: equal part counts,
 * but the first `left` finds no `right` beside it.
 */
function groupsPlacedAsRuns(): ReadonlySet<string> {
  const runs = new Set<string>();
  for (const [group, parts] of Object.entries(ATLAS_INDEX.multiTileCompositions)) {
    const ids = parts.map((part) => `tile.${part}`);
    const deltas = PART_DELTAS[parts.length];
    if (!deltas) throw new Error(`Unhandled group size for ${group}: ${parts.length}`);

    for (const map of CONTENT_MAPS) {
      for (const object of map.objects) {
        const placed = object.renderParts.filter((renderPart) => ids.includes(renderPart.sprite));
        if (placed.length === 0) continue;

        const unmatched = new Set(placed.map((part) => `${part.sprite}@${part.offset.x},${part.offset.y}`));
        for (const owner of placed.filter((part) => part.sprite === ids[0])) {
          const wanted = ids.map((id, index) =>
            `${id}@${owner.offset.x + deltas[index]!.x},${owner.offset.y + deltas[index]!.y}`);
          if (!wanted.every((key) => unmatched.has(key))) continue;
          for (const key of wanted) unmatched.delete(key);
        }
        if (unmatched.size > 0) runs.add(group);
      }
    }
  }
  return runs;
}

describe('prop recipes', () => {
  test('the atlas still has landmark sprites to cover', () => {
    expect(LANDMARKS.length).toBeGreaterThan(0);
  });

  test('every landmark sprite resolves to a recipe, a consumed sibling, or an explicit flat entry', () => {
    const unresolved = LANDMARKS.filter((id) => !isResolved(id));
    expect(unresolved).toEqual([]);
  });

  /**
   * `groupsPlacedAsRuns` reads `parts[0]` as the west or north-west owner and the rest in
   * `PART_DELTAS` order. That is a property of the atlas, not of this file, so lock it: reorder a
   * composition upstream and sofas would start counting as runs with nothing to say why.
   */
  test('every composition lists its parts owner-first in delta order', () => {
    const SUFFIXES: Readonly<Record<number, readonly string[]>> = {
      2: ['-left', '-right'],
      4: ['-nw', '-ne', '-sw', '-se'],
    };
    for (const [group, parts] of Object.entries(ATLAS_INDEX.multiTileCompositions)) {
      const expected = SUFFIXES[parts.length];
      expect({ group, size: expected !== undefined }).toEqual({ group, size: true });
      parts.forEach((part, index) => {
        expect({ group, part, ends: part.endsWith(expected![index]!) })
          .toEqual({ group, part, ends: true });
      });
    }
  });

  test('nothing is both drawn and consumed, or both drawn and flat', () => {
    const drawn = new Set(Object.keys(PROP_RECIPES));
    expect([...CONSUMED_SPRITES].filter((id) => drawn.has(id))).toEqual([]);
    expect([...FLAT_SPRITES].filter((id) => drawn.has(id))).toEqual([]);
    expect([...FLAT_SPRITES].filter((id) => CONSUMED_SPRITES.has(id))).toEqual([]);
  });

  test('RUN_FORMING_GROUPS matches what the content maps actually place', () => {
    expect([...RUN_FORMING_GROUPS].sort()).toEqual([...groupsPlacedAsRuns()].sort());
  });

  test('every official multi-tile group is owned as a unit or built tile by tile', () => {
    for (const [group, parts] of Object.entries(ATLAS_INDEX.multiTileCompositions)) {
      const ids = parts.map((part) => `tile.${part}`);
      const owners = ids.filter((id) => recipeFor(id) !== undefined);

      if (RUN_FORMING_GROUPS.has(group)) {
        // Every part draws its own tile, and nothing is consumed.
        expect({ group, owners: owners.length }).toEqual({ group, owners: ids.length });
        for (const id of ids) expect({ group, id, consumes: recipeFor(id)!.consumes }).toEqual({ group, id, consumes: undefined });
        continue;
      }

      expect({ group, owners: owners.length }).toEqual({ group, owners: 1 });
      const consumed = recipeFor(owners[0]!)!.consumes ?? [];
      expect([...consumed].sort()).toEqual(ids.filter((id) => id !== owners[0]).sort());
    }
  });

  /**
   * A canopy eave, palm fronds and a stall awning are meant to spill past the tile they stand on.
   * A whole tile of overhang is not spill, it is a modelling error — a box sized for a footprint
   * the object does not have. A fifth of a tile separates the two.
   */
  const SPILL_TOLERANCE_TILES = 0.2;

  function overhang(low: number, high: number, minimum: number, maximum: number): number {
    return Math.max(0, minimum - low, high - maximum);
  }

  test('no box overhangs its own footprint by more than a fifth of a tile', () => {
    const owners = new Map<string, number>();
    for (const [group, parts] of Object.entries(ATLAS_INDEX.multiTileCompositions)) {
      if (RUN_FORMING_GROUPS.has(group)) continue;
      const ids = parts.map((part) => `tile.${part}`);
      owners.set(ids.find((id) => recipeFor(id) !== undefined)!, parts.length);
    }
    // The bed is an unofficial two-tile east pair with the same owner shape.
    owners.set('tile.bed-head', 2);

    for (const [id, recipe] of Object.entries(PROP_RECIPES)) {
      // A group owner spans its whole group: two tiles east, or 2x2.
      const span = owners.get(id);
      const maximumX = span === undefined ? 0.5 : 1.5;
      const maximumZ = span === 4 ? 1.5 : 0.5;
      for (const box of recipe.boxes) {
        const x = overhang(box.x - box.width / 2, box.x + box.width / 2, -0.5, maximumX);
        const z = overhang(box.z - box.depth / 2, box.z + box.depth / 2, -0.5, maximumZ);
        expect({ id, axis: 'x', within: x <= SPILL_TOLERANCE_TILES + 1e-9 })
          .toEqual({ id, axis: 'x', within: true });
        expect({ id, axis: 'z', within: z <= SPILL_TOLERANCE_TILES + 1e-9 })
          .toEqual({ id, axis: 'z', within: true });
      }
    }
  });

  test('every recipe key exists in the atlas', () => {
    const orphans = Object.keys(PROP_RECIPES).filter((id) => !(id in ATLAS_INDEX.sprites));
    expect(orphans).toEqual([]);
  });

  test('every flat entry exists in the atlas', () => {
    const orphans = [...FLAT_SPRITES].filter((id) => !(id in ATLAS_INDEX.sprites));
    expect(orphans).toEqual([]);
  });

  test('no recipe is empty and no box has non-positive extent', () => {
    for (const [, recipe] of Object.entries(PROP_RECIPES)) {
      expect(recipe.boxes.length).toBeGreaterThan(0);
      for (const box of recipe.boxes) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
        expect(box.depth).toBeGreaterThan(0);
      }
    }
  });

  test('wall height matches the spike', () => {
    expect(WALL_HEIGHT_TILES).toBeCloseTo(1.45, 6);
  });
});
