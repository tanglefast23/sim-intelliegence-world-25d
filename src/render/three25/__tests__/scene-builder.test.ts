import { ATLAS_INDEX } from '../../atlas';
import { hiddenWallTiles } from '../occlusion';
import { WALL_HEIGHT_TILES, isResolved, recipeFor } from '../recipes';
import {
  buildDoorBoxes,
  buildFloorQuads,
  buildPropBoxes,
  buildRoofBoxes,
  buildScene,
  buildWallBoxes,
} from '../scene-builder';
import { indoorFrame, outdoorFrame } from './fixtures';

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

describe('wall boxes', () => {
  const frame = indoorFrame();

  // The default fixture spawns the protagonist indoors, so near-wall culling is active here.
  test('emits one box per wall placement, less the culled near walls', () => {
    expect(hiddenWallTiles(frame).size).toBeGreaterThan(0);
    expect(buildWallBoxes(frame)).toHaveLength(frame.walls.length - hiddenWallTiles(frame).size);
  });

  test('emits every wall when the player is outdoors and nothing is culled', () => {
    const outdoors = outdoorFrame();
    expect(hiddenWallTiles(outdoors).size).toBe(0);
    expect(buildWallBoxes(outdoors)).toHaveLength(outdoors.walls.length);
  });

  test('never emits a box for a culled tile', () => {
    const hidden = hiddenWallTiles(frame);
    for (const box of buildWallBoxes(frame)) {
      expect(hidden.has(`${box.x - 0.5},${box.z - 0.5}`)).toBe(false);
    }
  });

  test('stands every wall at the same height, centred on its half', () => {
    for (const box of buildWallBoxes(frame)) {
      expect(box.height).toBeCloseTo(WALL_HEIGHT_TILES, 6);
      expect(box.y).toBeCloseTo(WALL_HEIGHT_TILES / 2, 6);
    }
  });

  test('keeps walls inside a one-tile footprint, centred like the floors', () => {
    for (const box of buildWallBoxes(frame)) {
      expect(box.width).toBeLessThanOrEqual(1);
      expect(box.depth).toBeLessThanOrEqual(1);
      // Centred on the tile, so the fractional part is exactly a half. Subtracting the floor
      // rather than taking `% 1` keeps this right for a negative tile index.
      expect(box.x - Math.floor(box.x)).toBeCloseTo(0.5, 6);
      expect(box.z - Math.floor(box.z)).toBeCloseTo(0.5, 6);
    }
  });

  test('carries each wall own atlas rect and tint, not a shared default', () => {
    const byId = new Map(frame.walls.map((wall) => [wall.id, wall]));
    for (const box of buildWallBoxes(frame)) {
      const wall = byId.get(box.id)!;
      expect(box.source).toEqual(wall.source);
      expect(box.tint).toBe(wall.color);
      expect(box.sprite).toBe(wall.sprite);
    }
  });

  // This test is vacuous today and that is fine — it is a regression guard, not a discovery.
  // `compileWalls` already skips opening tiles, so door tiles never reach frame.walls.
  test('does not emit a box for a door tile', () => {
    const doorTiles = new Set(frame.doors.map((door) => `${door.tile.x},${door.tile.y}`));
    expect(doorTiles.size).toBeGreaterThan(0);
    for (const box of buildWallBoxes(frame)) {
      expect(doorTiles.has(`${box.x - 0.5},${box.z - 0.5}`)).toBe(false);
    }
  });
});

describe('prop, door and roof boxes', () => {
  const frame = indoorFrame();

  test('the villa fixture actually has props and doors to build', () => {
    expect(frame.props.length).toBeGreaterThan(0);
    expect(frame.doors.length).toBeGreaterThan(0);
  });

  test('emits one box per recipe box, offset to the prop tile', () => {
    const consumed = new Set(
      frame.props.flatMap((prop) => [...(recipeFor(prop.sprite)?.consumes ?? [])]),
    );
    const expected = frame.props.reduce(
      (total, prop) => total + (consumed.has(prop.sprite) ? 0 : recipeFor(prop.sprite)?.boxes.length ?? 0),
      0,
    );
    expect(buildPropBoxes(frame)).toHaveLength(expected);
  });

  test('skips sprites consumed by a sibling recipe', () => {
    const ids = buildPropBoxes(frame).map((box) => box.id);
    for (const prop of frame.props) {
      const consumed = frame.props.some((other) => recipeFor(other.sprite)?.consumes?.includes(prop.sprite));
      if (consumed) expect(ids.some((id) => id.startsWith(`${prop.id}#`))).toBe(false);
    }
  });

  test('never guesses a box for an unknown sprite', () => {
    for (const prop of frame.props) {
      if (recipeFor(prop.sprite) === undefined) {
        expect(isResolved(prop.sprite)).toBe(true);
      }
    }
  });

  test('offsets a recipe box from the prop tile centre', () => {
    const owner = frame.props.find((prop) => recipeFor(prop.sprite) !== undefined)!;
    const recipe = recipeFor(owner.sprite)!;
    const first = buildPropBoxes(frame).find((box) => box.id === `${owner.id}#0`)!;
    expect(first.x).toBeCloseTo(owner.tile.x + 0.5 + recipe.boxes[0]!.x, 6);
    expect(first.z).toBeCloseTo(owner.tile.y + 0.5 + recipe.boxes[0]!.z, 6);
    expect(first.y).toBeCloseTo(recipe.boxes[0]!.y, 6);
  });

  test('doors fill their gap and stand on the floor', () => {
    const doors = buildDoorBoxes(frame);
    expect(doors).toHaveLength(frame.doors.length);
    for (const door of doors) {
      expect(door.height).toBeLessThan(WALL_HEIGHT_TILES);
      expect(door.y).toBeCloseTo(door.height / 2, 6);
    }
  });

  test('a door slab lies IN its wall, spanning the wall axis and thin across it', () => {
    // The villa has doors on both axes, so this exercises both branches.
    const byId = new Map(frame.doors.map((door) => [door.id, door]));
    const axes = new Set<string>();
    for (const box of buildDoorBoxes(frame)) {
      const vertical = byId.get(box.id)!.sprite.endsWith('-vertical');
      axes.add(vertical ? 'vertical' : 'horizontal');
      expect({ id: box.id, long: vertical ? box.depth : box.width }).toEqual({ id: box.id, long: 1 });
      expect({ id: box.id, thin: vertical ? box.width : box.depth }).toEqual({ id: box.id, thin: 0.36 });
    }
    expect([...axes].sort()).toEqual(['horizontal', 'vertical']);
  });

  test('a passable door draws shorter than a closed one', () => {
    const closed = frame.doors[0]!;
    const swap = (sprite: string) =>
      buildDoorBoxes({ ...frame, doors: [{ ...closed, sprite }] })[0]!.height;
    expect(swap('tile.open-door-horizontal')).toBeLessThan(swap('tile.closed-door-horizontal'));
    expect(swap('tile.opening-door-horizontal')).toBeLessThan(swap('tile.closed-door-horizontal'));
    // 'opening' contains the letters 'open', but 'closed-locked' must stay tall regardless.
    expect(swap('tile.closed-locked-door-horizontal')).toBe(swap('tile.closed-door-horizontal'));
  });

  test('every door state and axis this builder branches on exists in the atlas', () => {
    // Drift guard: renaming a door sprite upstream must fail here, not silently draw every door
    // broadside or full height.
    for (const state of ['closed', 'closed-locked', 'open', 'opening']) {
      for (const axis of ['horizontal', 'vertical']) {
        expect({ id: `tile.${state}-door-${axis}`, inAtlas: `tile.${state}-door-${axis}` in ATLAS_INDEX.sprites })
          .toEqual({ id: `tile.${state}-door-${axis}`, inAtlas: true });
      }
    }
  });

  test('roof lids cap the walls, one per roof tile', () => {
    // The indoor fixture occupies the only roof group, so its roofs list is empty. The outdoor
    // fixture is the one that actually has roofs to draw.
    const outdoors = outdoorFrame();
    expect(outdoors.roofs.length).toBeGreaterThan(0);
    const lids = buildRoofBoxes(outdoors);
    expect(lids).toHaveLength(outdoors.roofs.length);
    const byId = new Map(outdoors.roofs.map((roof) => [roof.id, roof]));
    for (const lid of lids) {
      const roof = byId.get(lid.id)!;
      expect(lid.x).toBeCloseTo(roof.tile.x + 0.5, 6);
      expect(lid.z).toBeCloseTo(roof.tile.y + 0.5, 6);
      expect(lid.height).toBeCloseTo(0.12, 6);
      // The lid's underside rests on the wall tops rather than floating above them.
      expect(lid.y - lid.height / 2).toBeCloseTo(WALL_HEIGHT_TILES, 6);
    }
  });

  test('roof lids vanish with the occupied group', () => {
    expect(frame.hiddenRoofGroupId).toBeDefined();
    expect(buildRoofBoxes(frame)).toHaveLength(0);
  });

  test('every descriptor id is unique on a frame that has roofs too', () => {
    const scene = buildScene(outdoorFrame());
    const ids = [...scene.floors.map((quad) => quad.id), ...scene.boxes.map((box) => box.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('buildScene returns floors and every box source', () => {
    const scene = buildScene(frame);
    expect(scene.floors).toHaveLength(frame.floors.length + frame.groundDetails.length);
    expect(scene.boxes.length).toBe(
      buildWallBoxes(frame).length
      + buildPropBoxes(frame).length
      + buildDoorBoxes(frame).length
      + buildRoofBoxes(frame).length,
    );
  });

  test('every descriptor id in one scene is unique', () => {
    const scene = buildScene(frame);
    const ids = [...scene.floors.map((quad) => quad.id), ...scene.boxes.map((box) => box.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('face texturing', () => {
  const frame = indoorFrame();

  /**
   * The load-bearing one. Wall sprites are top-down stamps with transparent margins — measured,
   * `tile.wall-villa-5` is 81% opaque and `tile.wall-villa-a` 84%. Mapped onto a vertical face and
   * cut by `alphaTest: 0.5`, that punches holes straight through the wall: grass shows through the
   * courtyard. The `-f` variant is the same brick at 96% opaque.
   */
  test('walls take an opaque side texture from their own family', () => {
    const boxes = buildWallBoxes(frame);
    expect(boxes.length).toBeGreaterThan(0);
    const byId = new Map(frame.walls.map((wall) => [wall.id, wall]));
    let substituted = 0;
    for (const box of boxes) {
      const wall = byId.get(box.id)!;
      const solid = `${wall.sprite.replace(/-[0-9a-f]$/u, '')}-f`;
      if (wall.sprite === solid) {
        // Already the fully-connected variant, so it is its own side texture.
        expect({ id: box.id, side: box.sideSource }).toEqual({ id: box.id, side: undefined });
        continue;
      }
      expect(box.sideSource).toEqual(ATLAS_INDEX.sprites[solid]);
      substituted += 1;
    }
    // The villa is mostly partial-adjacency walls, so this is the common case, not an edge one.
    expect(substituted).toBeGreaterThan(boxes.length / 2);
  });

  test('an already-solid wall keeps its own cell on every face', () => {
    const solid = buildWallBoxes(frame).filter((box) => box.sideSource === undefined);
    expect(solid.length).toBeGreaterThan(0);
  });

  test('the side texture is a different cell from the top texture', () => {
    const box = buildWallBoxes(frame).find((candidate) => candidate.sideSource !== undefined)!;
    expect(box.sideSource).not.toEqual(box.source);
  });

  test('furniture draws flat-shaded, walls and roofs do not', () => {
    for (const box of buildPropBoxes(frame)) expect(box.flatShade).toBe(true);
    for (const box of buildWallBoxes(frame)) expect(box.flatShade).toBeUndefined();
    for (const box of buildRoofBoxes(outdoorFrame())) expect(box.flatShade).toBeUndefined();
  });
});
