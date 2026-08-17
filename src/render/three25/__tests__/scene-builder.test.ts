import { ATLAS_INDEX } from '../../atlas';
import { hiddenWallTiles } from '../occlusion';
import { WALL_HEIGHT_TILES, isResolved, recipeFor } from '../recipes';
import {
  shelteredTint,
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

  test('carries the atlas source rect through, unless the 2.5D path reinterprets it', () => {
    const quads = buildFloorQuads(frame);
    const plain = frame.floors.findIndex((floor) => floor.sprite !== 'tile.villa-floor');
    expect(plain).toBeGreaterThanOrEqual(0);
    expect(quads[plain]!.source).toEqual(frame.floors[plain]!.source);
  });

  /**
   * The villa floor is a grey-brown square tile authored to read from overhead. Under a corner
   * camera the reference material is warm planks, and the atlas already has them.
   */
  test('the villa floor borrows the boardwalk planks', () => {
    const index = frame.floors.findIndex((floor) => floor.sprite === 'tile.villa-floor');
    expect(index).toBeGreaterThanOrEqual(0);
    const quad = buildFloorQuads(frame)[index]!;
    expect(quad.source).toEqual(ATLAS_INDEX.sprites['tile.boardwalk']);
    expect(quad.source).not.toEqual(frame.floors[index]!.source);
    // The sprite id is untouched, so nothing downstream thinks the map changed.
    expect(quad.sprite).toBe('tile.villa-floor');
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
      // Its own colour, crushed toward the void if it stands outside the occupied room.
      expect(box.tint).toBe(shelteredTint(wall.color, wall.tile, frame));
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

  /**
   * Small furniture is flat-shaded and large furniture carries its sprite's grain. The split is by
   * SIZE because a 32-pixel core stretched across a 0.07-tile lamp post is mud, while the same core
   * across a near-full-tile crate is the texture that separates a crate from a painted block.
   */
  test('small furniture is flat-shaded, big furniture is textured, walls and roofs never flat', () => {
    const props = buildPropBoxes(frame);
    for (const box of props) {
      expect(box.flatShade).toBe(box.width < 0.45 || box.depth < 0.45 || box.gain === undefined);
    }
    for (const box of buildWallBoxes(frame)) expect(box.flatShade).toBeUndefined();
    for (const box of buildRoofBoxes(outdoorFrame())) expect(box.flatShade).toBeUndefined();
  });

  /**
   * A textured box samples the sprite's largest fully-OPAQUE rectangle, never the whole cell. The
   * cell has transparent margins, and `alphaTest` would turn those into holes punched straight
   * through the furniture.
   */
  test('a textured prop samples a strict sub-rectangle of its sprite cell', () => {
    const textured = buildPropBoxes(outdoorFrame()).filter((box) => box.gain !== undefined);
    expect(textured.length).toBeGreaterThan(0);
    for (const box of textured) {
      const cell = ATLAS_INDEX.sprites[box.sprite]!;
      expect(box.source.x).toBeGreaterThanOrEqual(cell.x);
      expect(box.source.y).toBeGreaterThanOrEqual(cell.y);
      expect(box.source.x + box.source.width).toBeLessThanOrEqual(cell.x + cell.width);
      expect(box.source.y + box.source.height).toBeLessThanOrEqual(cell.y + cell.height);
      // The gain has to lift, never darken: it cancels the sprite's own brightness out of the tint.
      expect(box.gain!).toBeGreaterThan(1);
    }
  });

  /** An authored colour must render as authored, so it can never be multiplied by a sprite. */
  test('authored tints and glow boxes are never textured', () => {
    for (const box of buildPropBoxes(outdoorFrame())) {
      if (box.glow === true) expect(box.gain).toBeUndefined();
    }
  });
});

describe('door and fallback side texturing', () => {
  const frame = indoorFrame();

  /**
   * Door sprites are 80% opaque, the same trap the walls had. A door stands in a wall GAP, so its
   * transparent margins show straight through the building rather than onto a wall behind it.
   */
  test('doors take an opaque side texture from a neighbouring wall', () => {
    const doors = buildDoorBoxes(frame);
    expect(doors.length).toBeGreaterThan(0);
    for (const door of doors) {
      expect({ id: door.id, hasSide: door.sideSource !== undefined })
        .toEqual({ id: door.id, hasSide: true });
      expect(door.sideSource).not.toEqual(door.source);
    }
  });

  test('a wall family with no solid variant falls back to its own cell', () => {
    // wallSideSource returns undefined rather than an invalid rect, and the bake then reuses
    // `source` on the vertical faces.
    const invented = { ...frame, walls: [{ ...frame.walls[0]!, sprite: 'tile.not-a-wall-family' }] };
    expect(buildWallBoxes(invented)[0]!.sideSource).toBeUndefined();
  });
});

describe('the world outside the room falls away', () => {
  const frame = indoorFrame();

  /**
   * The single thing that makes an open map read as an enclosed stage. The capture already IS the
   * villa interior, but the grass beyond the east wall used to render at the same brightness as
   * the sofa, so the eye read one continuous terrace instead of a room.
   */
  test('crushes a tile outside the occupied room toward the void', () => {
    const cell = frame.shelterCells[0]!;
    const outside = { x: cell.x + cell.width + 6, y: cell.y + cell.height + 6 };
    const crushed = shelteredTint('#ffffffff', outside, frame);
    expect(crushed).not.toBe('#ffffffff');
    expect(Number.parseInt(crushed.slice(1, 3), 16)).toBeLessThan(0xcc);
  });

  test('leaves the room itself, and its wall ring, alone', () => {
    const cell = frame.shelterCells[0]!;
    expect(shelteredTint('#ffffffff', { x: cell.x + 2, y: cell.y + 2 }, frame)).toBe('#ffffffff');
    // The ring is inside, or the room's own walls would be crushed with the outdoors.
    expect(shelteredTint('#ffffffff', { x: cell.x - 1, y: cell.y + 2 }, frame)).toBe('#ffffffff');
  });

  test('crushes harder at night than by day', () => {
    const cell = frame.shelterCells[0]!;
    const outside = { x: cell.x + cell.width + 6, y: cell.y + cell.height + 6 };
    const at = (elevation: number) => Number.parseInt(shelteredTint('#ffffffff', outside, {
      ...frame,
      lighting: { ...frame.lighting, sun: { ...frame.lighting.sun, elevation } },
    }).slice(1, 3), 16);
    expect(at(0)).toBeLessThan(at(1));
  });

  test('an outdoor frame has no room, so nothing is crushed', () => {
    const outdoors = outdoorFrame();
    expect(outdoors.shelterCells).toHaveLength(0);
    expect(shelteredTint('#ffffffff', { x: 0, y: 0 }, outdoors)).toBe('#ffffffff');
  });
});

/**
 * The jitter exists so a stack of identical crates stops reading as one moulded mass. It must stay
 * small enough to read as one material, and it must be stable: a factor that moved between frames
 * would make every prop shimmer on a pan, and one that moved between runs would make two captures
 * incomparable.
 */
describe('per-prop brightness variation', () => {
  const frame = outdoorFrame();

  test('is deterministic: the same frame twice gives the same tints', () => {
    expect(buildPropBoxes(frame).map((box) => box.tint))
      .toEqual(buildPropBoxes(frame).map((box) => box.tint));
  });

  test('separates neighbours: props of one sprite do not all share a tint', () => {
    const bySprite = new Map<string, Set<string>>();
    for (const box of buildPropBoxes(frame)) {
      if (box.glow === true) continue;
      const seen = bySprite.get(box.sprite) ?? new Set<string>();
      seen.add(box.tint);
      bySprite.set(box.sprite, seen);
    }
    const repeated = [...bySprite].filter(([, tints]) => tints.size > 1);
    expect(repeated.length).toBeGreaterThan(0);
  });

  /** A lamp head at 92% or 108% reads as a lamp of a different wattage, not as variety. */
  test('glow boxes are exempt, so every lamp head of one sprite matches', () => {
    const byGlowSprite = new Map<string, Set<string>>();
    for (const box of buildPropBoxes(frame)) {
      if (box.glow !== true) continue;
      const seen = byGlowSprite.get(box.sprite) ?? new Set<string>();
      seen.add(box.tint);
      byGlowSprite.set(box.sprite, seen);
    }
    expect(byGlowSprite.size).toBeGreaterThan(0);
    for (const [, tints] of byGlowSprite) expect(tints.size).toBe(1);
  });
});
