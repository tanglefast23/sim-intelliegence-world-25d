import { Vector3 } from 'three';

import { rendererForEnvironment } from '../../renderer-selection';
import { buildBillboards } from '../billboards';
import {
  CAMERA_YAW_DEGREES,
  GROUND_TILT_DEGREES,
  screenToWorldTilted,
  worldToScreenTilted,
} from '../projection';
import { PROP_RECIPES } from '../recipes';
import { buildScene } from '../scene-builder';
import {
  bakeGroundStains, bakeBillboardGeometry, bakeLampPools, bakeSceneGeometry, cameraForYaw, frameCamera } from '../world-renderer-25';
import { closedBlinkTimestamp, indoorFrame, pixelIndoorFrame } from './fixtures';

describe('2.5D camera placement', () => {
  test('sits at the configured elevation at yaw 0', () => {
    const camera = cameraForYaw(0, 10);
    expect(camera.position.x).toBeCloseTo(0, 6);
    const horizontal = Math.hypot(camera.position.x, camera.position.z);
    const elevation = (Math.atan2(camera.position.y, horizontal) * 180) / Math.PI;
    expect(elevation).toBeCloseTo(GROUND_TILT_DEGREES, 4);
  });

  test('yaw rotates the camera around the target without changing elevation', () => {
    const camera = cameraForYaw(CAMERA_YAW_DEGREES, 10);
    const horizontal = Math.hypot(camera.position.x, camera.position.z);
    const elevation = (Math.atan2(camera.position.y, horizontal) * 180) / Math.PI;
    expect(elevation).toBeCloseTo(GROUND_TILT_DEGREES, 4);
    expect(camera.position.x).toBeGreaterThan(0);
  });

  test('is orthographic, never perspective', () => {
    expect(cameraForYaw(0, 10).type).toBe('OrthographicCamera');
  });
});

describe('baked scene geometry', () => {
  const frame = indoorFrame();
  const scene = buildScene(frame);
  const ATLAS = 1024;

  /**
   * The whole reason the renderer bakes instead of building one Mesh per descriptor. A villa
   * interior emits thousands of descriptors; at one draw call each the plan's ceiling of 40 is
   * unreachable by nearly two orders of magnitude.
   */
  test('collapses thousands of descriptors into four geometries', () => {
    expect(scene.floors.length + scene.boxes.length).toBeGreaterThan(500);
    const baked = bakeSceneGeometry(scene, ATLAS, ATLAS);
    expect(Object.keys(baked)).toEqual(['floors', 'boxes', 'flatBoxes', 'glowBoxes']);
  });

  test('emits four vertices and six indices per floor quad', () => {
    const baked = bakeSceneGeometry(scene, ATLAS, ATLAS);
    expect(baked.floors.getAttribute('position').count).toBe(scene.floors.length * 4);
    expect(baked.floors.getIndex()!.count).toBe(scene.floors.length * 6);
  });

  test('emits twenty-four vertices and thirty-six indices per box', () => {
    const baked = bakeSceneGeometry(scene, ATLAS, ATLAS);
    const textured = scene.boxes.filter((box) => box.flatShade !== true).length;
    const flat = scene.boxes
      .filter((box) => box.flatShade === true && box.glow !== true).length;
    const glow = scene.boxes.filter((box) => box.flatShade === true && box.glow === true).length;
    expect(baked.boxes.getAttribute('position').count).toBe(textured * 24);
    expect(baked.flatBoxes.getAttribute('position').count).toBe(flat * 24);
    expect(baked.glowBoxes.getAttribute('position').count).toBe(glow * 24);
    // Every box lands in exactly one batch: no descriptor is dropped and none is drawn twice.
    expect(textured + flat + glow).toBe(scene.boxes.length);
  });

  /**
   * A lamp head is the ONLY thing that may skip lighting. If a recipe ever marks a wall, a crate
   * or a sofa as `glow`, it renders at full brightness in a dark room and the pooled-light read
   * the whole scene depends on is gone.
   */
  test('only lamps and lit signs opt out of lighting', () => {
    // Derived from the recipes, not from one fixture's props: the villa frame has no neon, so a
    // guard checked against it alone passed while downtown's fourteen glowing signs went unchecked.
    for (const [sprite, recipe] of Object.entries(PROP_RECIPES)) {
      if (!recipe.boxes.some((box) => box.glow === true)) continue;
      // `ceiling-panel` joins the list because its plate IS the office light. The water cooler
      // does not: a plastic jug that glows is a lamp nobody authored.
      expect(sprite).toMatch(/lamp|lantern|sign-neon|sign-sunset-market|ceiling-panel/u);
    }
    expect(Object.values(PROP_RECIPES).filter((recipe) =>
      recipe.boxes.some((box) => box.glow === true)).length).toBeGreaterThan(6);
  });

  test('carries uv and vertex colour so one material can tint every sprite', () => {
    const baked = bakeSceneGeometry(scene, ATLAS, ATLAS);
    for (const geometry of [baked.floors, baked.boxes]) {
      expect(geometry.getAttribute('uv').count).toBe(geometry.getAttribute('position').count);
      expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
      expect(geometry.getAttribute('normal').count).toBe(geometry.getAttribute('position').count);
    }
  });

  test('lays floors flat on the ground plane', () => {
    const baked = bakeSceneGeometry(scene, ATLAS, ATLAS);
    const position = baked.floors.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      expect(position.getY(index)).toBe(0);
    }
  });

  test('keeps every uv inside the atlas, inset off the cell boundary', () => {
    const baked = bakeSceneGeometry(scene, ATLAS, ATLAS);
    const uv = baked.boxes.getAttribute('uv');
    for (let index = 0; index < uv.count; index += 1) {
      expect(uv.getX(index)).toBeGreaterThan(0);
      expect(uv.getX(index)).toBeLessThan(1);
      expect(uv.getY(index)).toBeGreaterThan(0);
      expect(uv.getY(index)).toBeLessThan(1);
    }
  });

  test('uses a 32-bit index when a batch passes the 16-bit vertex limit', () => {
    const baked = bakeSceneGeometry(scene, ATLAS, ATLAS);
    const floors = baked.floors;
    const wide = floors.getAttribute('position').count > 65_535;
    expect(floors.getIndex()!.array instanceof Uint32Array).toBe(wide);
  });

  test('an empty scene bakes without error', () => {
    const baked = bakeSceneGeometry({ floors: [], boxes: [] }, ATLAS, ATLAS);
    expect(baked.floors.getAttribute('position').count).toBe(0);
    expect(baked.boxes.getIndex()!.count).toBe(0);
  });
});

describe('the surface mounts the 2.5D renderer when it is selected', () => {
  // Assert on the module-level selection, not on a WebGL context: jest has no canvas.
  test('the localhost override resolves to the 2.5D kind', () => {
    expect(rendererForEnvironment({ hostname: 'localhost', search: '?testRenderer=2-5d', smokeMode: false }))
      .toBe('threejs-2-5d');
  });
});

/**
 * The camera and the projection are two descriptions of the same mapping. If they disagree, every
 * click lands somewhere other than where the player aimed and nothing in either module is wrong on
 * its own. These tests pin them to each other.
 */
describe('frameCamera agrees with the ground projection', () => {
  const SURFACE = { width: 1280, height: 720 } as const;

  const framed = (cameraState: { x: number; y: number; zoom: number }) => {
    const camera = cameraForYaw(0, 10);
    frameCamera(camera, cameraState, SURFACE, CAMERA_YAW_DEGREES);
    camera.updateMatrixWorld(true);
    return camera;
  };

  /** Where a world point lands in normalised device coordinates, straight from the real camera. */
  const project = (camera: ReturnType<typeof framed>, world: { x: number; y: number }) => {
    const point = new Vector3(world.x / 32, 0, world.y / 32);
    point.project(camera);
    return point;
  };

  test.each([
    { x: 0, y: 0, zoom: 1 },
    { x: 640, y: 512, zoom: 1 },
    { x: 128, y: 96, zoom: 2 },
  ])('puts the projection screen centre at the centre of the frustum ($x,$y,$zoom)', (cameraState) => {
    const camera = framed(cameraState);
    // The world point that screenToWorldTilted maps to the middle of the surface.
    const centre = screenToWorldTilted(cameraState, { x: SURFACE.width / 2, y: SURFACE.height / 2 });
    const ndc = project(camera, centre);
    expect(ndc.x).toBeCloseTo(0, 5);
    expect(ndc.y).toBeCloseTo(0, 5);
  });

  test('puts the top-left of the surface at the top-left of the frustum', () => {
    const cameraState = { x: 320, y: 256, zoom: 1 };
    const camera = framed(cameraState);
    const corner = screenToWorldTilted(cameraState, { x: 0, y: 0 });
    const ndc = project(camera, corner);
    expect(ndc.x).toBeCloseTo(-1, 5);
    expect(ndc.y).toBeCloseTo(1, 5);
  });

  test('scales with zoom exactly as worldToScreenTilted does', () => {
    const cameraState = { x: 100, y: 100, zoom: 2 };
    const camera = framed(cameraState);
    const world = { x: 100 + 320, y: 100 + 180 };
    const ndc = project(camera, world);
    const screen = worldToScreenTilted(cameraState, world);
    // NDC x of -1..1 spans the full surface width.
    expect((ndc.x + 1) / 2 * SURFACE.width).toBeCloseTo(screen.x, 4);
    expect((1 - ndc.y) / 2 * SURFACE.height).toBeCloseTo(screen.y, 4);
  });
});

describe('character billboards bake into one upright batch', () => {
  // The camera's right vector flattened onto the ground, and world up. Not the camera's up.
  const RIGHT = { x: 1, y: 0, z: 0 } as const;
  const UP = { x: 0, y: 1, z: 0 } as const;
  // Pinned to a closed blink window. indoorFrame() faces `down`, so its sprite is `front-1`
  // and it is eligible to blink; at timestamp 0 the exact vertex counts below would depend on a
  // hash rather than on the bake.
  const restingFrame = (): ReturnType<typeof pixelIndoorFrame> => ({
    ...pixelIndoorFrame(),
    animationTimestampMilliseconds: closedBlinkTimestamp('protagonist'),
  });
  const billboards = buildBillboards(restingFrame());

  test('emits four vertices and six indices per character', () => {
    const geometry = bakeBillboardGeometry(billboards, RIGHT, UP, 1024, 1024);
    expect(geometry.getAttribute('position').count).toBe(billboards.length * 4);
    expect(geometry.getIndex()!.count).toBe(billboards.length * 6);
  });

  test('stands the quad ON its anchor rather than centring it', () => {
    const geometry = bakeBillboardGeometry(billboards, RIGHT, UP, 1024, 1024);
    const position = geometry.getAttribute('position');
    // Corners 0 and 1 are the bottom edge and sit on the ground plane.
    expect(position.getY(0)).toBeCloseTo(0, 6);
    expect(position.getY(1)).toBeCloseTo(0, 6);
    // Corners 2 and 3 are the top edge and stand above it.
    expect(position.getY(2)).toBeGreaterThan(0);
    expect(position.getY(3)).toBeGreaterThan(0);
  });

  /**
   * The card stands straight up. Leaning it into the view plane would stop it being parallel to
   * the vertical wall and door faces beside it, and a character in a doorway would read as
   * falling toward the viewer.
   */
  test('keeps the quad world-vertical, never leaning into the view plane', () => {
    const geometry = bakeBillboardGeometry(billboards, RIGHT, UP, 1024, 1024);
    const position = geometry.getAttribute('position');
    // Bottom-left and top-left share a column: same x and same z, differing only in height.
    expect(position.getZ(3)).toBeCloseTo(position.getZ(0), 6);
    expect(position.getX(3)).toBeCloseTo(position.getX(0), 6);
    expect(position.getY(3)).toBeGreaterThan(position.getY(0));
  });

  test('turns to the camera bearing on the horizontal axis', () => {
    const bearing = { x: Math.SQRT1_2, y: 0, z: -Math.SQRT1_2 } as const;
    const geometry = bakeBillboardGeometry(billboards, bearing, UP, 1024, 1024);
    const position = geometry.getAttribute('position');
    // Yawed right vector, so the bottom edge runs diagonally across the ground plane...
    expect(position.getZ(1)).not.toBeCloseTo(position.getZ(0), 3);
    // ...while the card still stands straight up.
    expect(position.getZ(3)).toBeCloseTo(position.getZ(0), 6);
  });

  test('draws the sprite at its authored world height, uncorrected for tilt', () => {
    const geometry = bakeBillboardGeometry(billboards, RIGHT, UP, 1024, 1024);
    const position = geometry.getAttribute('position');
    // Every vertical surface in the scene foreshortens by the same factor, so characters keep
    // their proportion against the walls. Compensating only characters would break that.
    expect(position.getY(3) - position.getY(0)).toBeCloseTo(billboards[0]!.height, 6);
  });

  test('centres the quad horizontally on the contact point', () => {
    const geometry = bakeBillboardGeometry(billboards, RIGHT, UP, 1024, 1024);
    const position = geometry.getAttribute('position');
    const anchor = billboards[0]!;
    expect((position.getX(0) + position.getX(1)) / 2).toBeCloseTo(anchor.x, 6);
  });

  test('can change chair occlusion without changing the authored anchor', () => {
    const depth = { x: 0.2, y: 0.4, z: 0.6 } as const;
    const biased = [{ ...billboards[0]!, depthBias: 0.5 }];
    const base = bakeBillboardGeometry([{ ...biased[0]!, depthBias: 0 }], RIGHT, UP, 1024, 1024, depth)
      .getAttribute('position');
    const shifted = bakeBillboardGeometry(biased, RIGHT, UP, 1024, 1024, depth).getAttribute('position');
    expect(shifted.getX(0) - base.getX(0)).toBeCloseTo(0.1, 6);
    expect(shifted.getY(0) - base.getY(0)).toBeCloseTo(0.2, 6);
    expect(shifted.getZ(0) - base.getZ(0)).toBeCloseTo(0.3, 5);
  });

  test('twenty characters still bake into one geometry', () => {
    const frame = restingFrame();
    const many = {
      ...frame,
      // No ground details: this asserts the CHARACTER count, and vegetation shares the batch.
      groundDetails: [],
      characters: Array.from({ length: 20 }, (_, index) => ({ ...frame.characters[0]!, id: `npc-${index}` })),
    };
    const geometry = bakeBillboardGeometry(buildBillboards(many), RIGHT, UP, 1024, 1024);
    expect(geometry.getAttribute('position').count).toBe(80);
  });

  test('an empty cast bakes without error', () => {
    const geometry = bakeBillboardGeometry([], RIGHT, UP, 1024, 1024);
    expect(geometry.getAttribute('position').count).toBe(0);
  });
});

describe('per-face texturing in the bake', () => {
  const ATLAS = 1024;
  const box = (extra: Record<string, unknown>) => ({
    id: 'b', sprite: 's',
    source: { x: 0, y: 0, width: 32, height: 32 } as never,
    x: 0, y: 0.5, z: 0, width: 1, height: 1, depth: 1, tint: '#ffffffff',
    ...extra,
  });

  test('vertical faces sample sideSource, horizontal faces sample source', () => {
    const geometry = bakeSceneGeometry(
      { floors: [], boxes: [box({ sideSource: { x: 512, y: 512, width: 32, height: 32 } })] },
      ATLAS, ATLAS,
    ).boxes;
    const uv = geometry.getAttribute('uv');
    // BOX_FACES order is +X, -X, +Y, -Y, +Z, -Z; face 2 is the top.
    const topU = uv.getX(2 * 4);
    const sideU = uv.getX(0);
    expect(topU).toBeLessThan(0.1);
    expect(sideU).toBeGreaterThan(0.4);
  });

  test('a flat-shaded box spans each face 0..1 so the sketch tile stretches across it', () => {
    // Flat boxes used to collapse every face to a single atlas texel. Since Joe's 2026-08-19
    // call to draw the prop surfaces, `flatMaterial` carries the charcoal tile and each face
    // needs the full UV square to wear it.
    const geometry = bakeSceneGeometry({ floors: [], boxes: [box({ flatShade: true })] }, ATLAS, ATLAS).flatBoxes;
    const uv = geometry.getAttribute('uv');
    expect(uv.count).toBe(24);
    for (let face = 0; face < 6; face += 1) {
      const us = [0, 1, 2, 3].map((corner) => uv.getX(face * 4 + corner));
      const vs = [0, 1, 2, 3].map((corner) => uv.getY(face * 4 + corner));
      expect(Math.min(...us)).toBe(0);
      expect(Math.max(...us)).toBe(1);
      expect(Math.min(...vs)).toBe(0);
      expect(Math.max(...vs)).toBe(1);
    }
  });

  /**
   * The two visible SIDES must differ, and lighting cannot make them differ.
   *
   * A hemisphere light blends sky and ground by the face normal, so all four vertical faces of a
   * box take an identical mix, and after dusk the sun is down to 0.15 and cannot separate them
   * either. So away from a lamp the baked shade is the only thing giving a box two tones, and
   * without it every prop at yaw 45 loses its vertical edge and reads flat.
   *
   * The TOP is deliberately left equal to the near side. Real lighting does separate a horizontal
   * face from a vertical one — that is exactly what `normal.y` drives — so shading it here as well
   * is the double-darkening this renderer bans.
   */
  test('the two camera-facing sides differ, and the top is left to the lights', () => {
    const geometry = bakeSceneGeometry({ floors: [], boxes: [box({})] }, ATLAS, ATLAS).boxes;
    const color = geometry.getAttribute('color');
    const shadeOf = (faceIndex: number) => color.getX(faceIndex * 4);
    const top = shadeOf(2);
    const east = shadeOf(0);
    const south = shadeOf(4);
    expect(east).toBeGreaterThan(south);
    expect(south).toBeGreaterThan(0);
    expect(top).toBeCloseTo(east, 9);
  });

  /**
   * A glow box IS the light, so its authored tint has to reach the pixels untouched. It was baking
   * with the default face shade, which drew every lamp head's two visible faces at 82% and 66% of
   * the authored glow while three comments claimed otherwise.
   */
  test('a glow box takes no face shade at all', () => {
    const geometry = bakeSceneGeometry(
      { floors: [], boxes: [box({ flatShade: true, glow: true, tint: '#ffffff' })] },
      ATLAS,
      ATLAS,
    ).glowBoxes;
    const color = geometry.getAttribute('color');
    expect(color.count).toBe(24);
    for (let index = 0; index < color.count; index += 1) {
      expect(color.getX(index)).toBeCloseTo(1, 9);
      expect(color.getY(index)).toBeCloseTo(1, 9);
      expect(color.getZ(index)).toBeCloseTo(1, 9);
    }
  });

  test('a box with no sideSource still textures every face', () => {
    const geometry = bakeSceneGeometry({ floors: [], boxes: [box({})] }, ATLAS, ATLAS).boxes;
    expect(geometry.getAttribute('uv').count).toBe(24);
  });
});

describe('flat-shaded boxes bake into their own batch', () => {
  const ATLAS = 1024;
  const make = (flatShade?: boolean) => ({
    id: 'b', sprite: 's', source: { x: 0, y: 0, width: 32, height: 32 } as never,
    x: 0, y: 0.5, z: 0, width: 1, height: 1, depth: 1, tint: '#ffffffff',
    ...(flatShade === undefined ? {} : { flatShade }),
  });

  /**
   * The atlas holds no white texel, so a colour drawn through the shared mapped material always
   * has a sprite multiplied into it. Furniture needs its own unmapped material for its measured
   * dominant colour to render true - which means its own geometry.
   */
  test('splits textured boxes from flat boxes', () => {
    const baked = bakeSceneGeometry(
      { floors: [], boxes: [make(true), make(), make(true)] }, ATLAS, ATLAS,
    );
    expect(baked.flatBoxes.getAttribute('position').count).toBe(2 * 24);
    expect(baked.boxes.getAttribute('position').count).toBe(1 * 24);
  });

  test('an all-textured scene leaves the flat batch empty', () => {
    const baked = bakeSceneGeometry({ floors: [], boxes: [make()] }, ATLAS, ATLAS);
    expect(baked.flatBoxes.getAttribute('position').count).toBe(0);
  });
});

describe('lamp light pools', () => {
  const pool = {
    id: 'pool-a', sprite: 'lamp-pool',
    source: { x: 0, y: 0, width: 0, height: 0 } as never,
    x: 5, z: 7, width: 3.2, depth: 3.2, tint: '#ffd9a0', opacity: 0.5,
  };

  /** A quad would give a square of light. A lamp does not do that. */
  test('bakes a radial fan, not a quad', () => {
    const geometry = bakeLampPools([pool]);
    expect(geometry.getAttribute('position').count).toBe(18);
    expect(geometry.getIndex()!.count).toBe(16 * 3);
  });

  test('is bright at the centre and black at the rim, so additive gives a falloff', () => {
    const color = bakeLampPools([pool]).getAttribute('color');
    expect(color.getX(0)).toBeGreaterThan(0);
    for (let index = 1; index < color.count; index += 1) {
      expect(color.getX(index)).toBe(0);
    }
  });

  test('sits above the floor so it never z-fights the tiles it brightens', () => {
    const position = bakeLampPools([pool]).getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      expect(position.getY(index)).toBeGreaterThan(0);
    }
  });

  test('every rim vertex is one radius from the centre', () => {
    const position = bakeLampPools([pool]).getAttribute('position');
    for (let index = 1; index < position.count; index += 1) {
      const distance = Math.hypot(position.getX(index) - pool.x, position.getZ(index) - pool.z);
      expect(distance).toBeCloseTo(pool.width / 2, 5);
    }
  });

  test('an empty lamp list bakes without error', () => {
    expect(bakeLampPools([]).getAttribute('position').count).toBe(0);
  });
});

/**
 * A shadow that ends on a hard straight edge reads as a dark tile someone forgot to remove. These
 * baked as square floor quads with one uniform colour until a capture made that plain.
 */
describe('ground stains fade at the rim', () => {
  const stain = {
    id: 'blob-1',
    sprite: 'blob-shadow',
    source: { x: 0, y: 0, width: 0, height: 0 },
    x: 4,
    z: 6,
    width: 0.8,
    depth: 0.5,
    tint: '#101018cc',
    opacity: 1,
  } as unknown as Parameters<typeof bakeGroundStains>[0][number];

  test('carries FOUR colour components, so the rim can be transparent', () => {
    const color = bakeGroundStains([stain]).getAttribute('color');
    expect(color.itemSize).toBe(4);
  });

  test('is opaque at the centre and fully transparent at every rim vertex', () => {
    const color = bakeGroundStains([stain]).getAttribute('color');
    expect(color.getW(0)).toBeCloseTo(0xcc / 255, 6);
    for (let index = 1; index < color.count; index += 1) expect(color.getW(index)).toBe(0);
  });

  test('is an ellipse: every rim vertex sits on the width and depth radii', () => {
    const position = bakeGroundStains([stain]).getAttribute('position');
    for (let index = 1; index < position.count; index += 1) {
      const dx = (position.getX(index) - stain.x) / (stain.width / 2);
      const dz = (position.getZ(index) - stain.z) / (stain.depth / 2);
      expect(dx * dx + dz * dz).toBeCloseTo(1, 5);
    }
  });

  test('sits above the floor it darkens and below the lamp pools', () => {
    const position = bakeGroundStains([stain]).getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      expect(position.getY(index)).toBeGreaterThan(0);
      expect(position.getY(index)).toBeLessThan(0.02);
    }
  });

  test('an empty list bakes without error', () => {
    expect(bakeGroundStains([]).getAttribute('color').count).toBe(0);
  });

  describe('the selection ring', () => {
    const ring = { x: 3, z: 5, radius: 0.5, width: 0.1, tint: '#f1c65b', opacity: 1 };

    test('is an annulus: every vertex sits on the inner or the outer radius', () => {
      const position = bakeGroundStains([], [], undefined, [ring]).getAttribute('position');
      expect(position.count).toBeGreaterThan(0);
      for (let index = 0; index < position.count; index += 1) {
        const distance = Math.hypot(position.getX(index) - ring.x, position.getZ(index) - ring.z);
        expect(Math.min(Math.abs(distance - 0.45), Math.abs(distance - 0.55))).toBeCloseTo(0, 6);
      }
    });

    test('is opaque at every vertex, unlike the stains that fade at the rim', () => {
      const color = bakeGroundStains([], [], undefined, [ring]).getAttribute('color');
      for (let index = 0; index < color.count; index += 1) expect(color.getW(index)).toBe(1);
    });

    test('sits above the blob shadow under the same character', () => {
      const stain = { ...ring, sprite: 'blob', width: 0.8, depth: 0.5, opacity: 1, id: 'blob' } as never;
      const position = bakeGroundStains([stain], [], undefined, [ring]).getAttribute('position');
      const stainY = position.getY(0);
      const ringY = position.getY(position.count - 1);
      expect(ringY).toBeGreaterThan(stainY);
      expect(ringY).toBeLessThan(0.02);
    });
  });
});
