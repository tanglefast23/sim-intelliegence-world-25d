import { Vector3 } from 'three';

import { rendererForEnvironment } from '../../renderer-selection';
import { buildBillboards } from '../billboards';
import { GROUND_TILT_DEGREES, screenToWorldTilted, worldToScreenTilted } from '../projection';
import { buildScene } from '../scene-builder';
import { bakeBillboardGeometry, bakeSceneGeometry, cameraForYaw, frameCamera } from '../world-renderer-25';
import { indoorFrame } from './fixtures';

describe('2.5D camera placement', () => {
  test('sits at the configured elevation with no yaw by default', () => {
    const camera = cameraForYaw(0, 10);
    expect(camera.position.x).toBeCloseTo(0, 6);
    const horizontal = Math.hypot(camera.position.x, camera.position.z);
    const elevation = (Math.atan2(camera.position.y, horizontal) * 180) / Math.PI;
    expect(elevation).toBeCloseTo(GROUND_TILT_DEGREES, 4);
  });

  test('yaw rotates the camera around the target without changing elevation', () => {
    const camera = cameraForYaw(35, 10);
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
  test('collapses thousands of descriptors into two geometries', () => {
    expect(scene.floors.length + scene.boxes.length).toBeGreaterThan(500);
    const baked = bakeSceneGeometry(scene, ATLAS, ATLAS);
    expect(Object.keys(baked)).toEqual(['floors', 'boxes']);
  });

  test('emits four vertices and six indices per floor quad', () => {
    const baked = bakeSceneGeometry(scene, ATLAS, ATLAS);
    expect(baked.floors.getAttribute('position').count).toBe(scene.floors.length * 4);
    expect(baked.floors.getIndex()!.count).toBe(scene.floors.length * 6);
  });

  test('emits twenty-four vertices and thirty-six indices per box', () => {
    const baked = bakeSceneGeometry(scene, ATLAS, ATLAS);
    expect(baked.boxes.getAttribute('position').count).toBe(scene.boxes.length * 24);
    expect(baked.boxes.getIndex()!.count).toBe(scene.boxes.length * 36);
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
    frameCamera(camera, { ...indoorFrame(), camera: cameraState }, SURFACE, 0);
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
  const billboards = buildBillboards(indoorFrame());

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

  test('twenty characters still bake into one geometry', () => {
    const frame = indoorFrame();
    const many = {
      ...frame,
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
