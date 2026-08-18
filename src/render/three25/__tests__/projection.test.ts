import {
  CAMERA_YAW_DEGREES,
  GROUND_TILT_DEGREES,
  GROUND_Z_SCALE,
  GROUND_TILE_TRANSFORM,
  groundFootprint,
  screenToTileTilted,
  screenToWorldTilted,
  tileCenterWorld,
  tiltedFacing,
  worldToScreenTilted,
} from '../projection';
import { selectedYawDegrees, yawForEnvironment } from '../../renderer-selection';

const CAMERA = { x: 320, y: 256, zoom: 1 } as const;

describe('tilted isometric ground projection', () => {
  /**
   * At yaw 0 this was a pure vertical scale. At yaw 45 both world axes contribute to both screen
   * axes, which is exactly what makes a box show two faces instead of one.
   */
  test('rotates by the camera yaw, then compresses the depth axis', () => {
    const yaw = (CAMERA_YAW_DEGREES * Math.PI) / 180;
    const screen = worldToScreenTilted(CAMERA, { x: 352, y: 288 });
    expect(screen.x).toBeCloseTo(32 * Math.cos(yaw) - 32 * Math.sin(yaw), 6);
    expect(screen.y).toBeCloseTo((32 * Math.sin(yaw) + 32 * Math.cos(yaw)) * GROUND_Z_SCALE, 6);
  });

  test('moving due east and due south both move the point down-screen', () => {
    // The signature of an isometric view: neither world axis is purely horizontal on screen.
    const east = worldToScreenTilted(CAMERA, { x: 352, y: 256 });
    const south = worldToScreenTilted(CAMERA, { x: 320, y: 288 });
    expect(east.y).toBeGreaterThan(0);
    expect(south.y).toBeGreaterThan(0);
    expect(east.x).toBeGreaterThan(0);
    expect(south.x).toBeLessThan(0);
  });

  test('screenToWorldTilted inverts worldToScreenTilted', () => {
    const world = { x: 417.5, y: 903.25 };
    const back = screenToWorldTilted(CAMERA, worldToScreenTilted(CAMERA, world));
    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.y).toBeCloseTo(world.y, 6);
  });

  test.each([1, 1.5, 2, 3] as const)('round-trips every tile centre at %ix', (zoom) => {
    const camera = { x: 0, y: 0, zoom };
    for (let y = 0; y < 48; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const tile = { x, y };
        const screen = worldToScreenTilted(camera, tileCenterWorld(tile));
        expect(screenToTileTilted(camera, screen)).toEqual(tile);
      }
    }
  });

  test('the depth scale follows the camera elevation', () => {
    expect(GROUND_Z_SCALE).toBeCloseTo(Math.sin((GROUND_TILT_DEGREES * Math.PI) / 180), 6);
    // 30 degrees, lowered from the spike's 40.65 so vertical faces read as walls rather than edges.
    expect(GROUND_TILT_DEGREES).toBe(30);
    expect(CAMERA_YAW_DEGREES).toBe(45);
  });

  test('the ground footprint grows on BOTH axes under rotation', () => {
    // A rotated rectangle has a bigger axis-aligned bounding box than the rectangle itself. This
    // is why inflation and clamping cannot treat the horizontal axis as untouched any more.
    const footprint = groundFootprint({ width: 1280, height: 720 }, 1);
    expect(footprint.width).toBeGreaterThan(1280);
    expect(footprint.height).toBeGreaterThan(720 / GROUND_Z_SCALE * 0.5);
  });
});

describe('the shipped camera angle', () => {
  /**
   * The selector must default to the designed angle, not to 0. Everything else - the projection,
   * the clamp, the near-wall rule - derives from CAMERA_YAW_DEGREES, so a selector that returns 0
   * would render the one angle the design was moved away from and only a query parameter would
   * bring it back.
   */
  test('production gets the designed yaw, not zero', () => {
    expect(yawForEnvironment({ hostname: 'siworld.example', search: '' })).toBe(CAMERA_YAW_DEGREES);
    expect(yawForEnvironment({ hostname: 'localhost', search: '' })).toBe(CAMERA_YAW_DEGREES);
    expect(selectedYawDegrees()).toBe(CAMERA_YAW_DEGREES);
    expect(CAMERA_YAW_DEGREES).not.toBe(0);
  });

  test('a localhost override still works, for captures', () => {
    expect(yawForEnvironment({ hostname: 'localhost', search: '?testYaw=0' })).toBe(0);
    expect(yawForEnvironment({ hostname: 'siworld.example', search: '?testYaw=0' })).toBe(CAMERA_YAW_DEGREES);
  });
});

describe('billboard facing under the tilted camera', () => {
  const walking = (from: { x: number; y: number }, to: { x: number; y: number }) =>
    ({ player: to, previousTile: undefined, segment: { from, to, elapsedMs: 0, durationMs: 1 } } as const);
  const stoppedAfter = (from: { x: number; y: number }, to: { x: number; y: number }) =>
    ({ player: to, previousTile: from, segment: undefined } as const);
  const origin = { x: 4, y: 4 };

  /**
   * The bug this exists for. A grid diagonal is the step that travels HORIZONTALLY across a yaw-45
   * screen, and `movementDirection()` collapses every diagonal to up or down, so the 2.5D path drew
   * the front and rear cells for every visibly sideways walk.
   */
  test('grid diagonals that read as sideways select the lateral cells', () => {
    expect(tiltedFacing('up', walking(origin, { x: 5, y: 3 }))).toBe('right');
    expect(tiltedFacing('down', walking(origin, { x: 3, y: 5 }))).toBe('left');
  });

  test('grid diagonals that read as vertical keep the front and rear cells', () => {
    expect(tiltedFacing('up', walking(origin, { x: 3, y: 3 }))).toBe('up');
    expect(tiltedFacing('down', walking(origin, { x: 5, y: 5 }))).toBe('down');
  });

  /** Depth compression: a cardinal is 26.6 degrees off horizontal on screen, not 45. */
  test('every grid cardinal reads as lateral, because the depth axis is compressed', () => {
    expect(tiltedFacing('right', walking(origin, { x: 5, y: 4 }))).toBe('right');
    expect(tiltedFacing('up', walking(origin, { x: 4, y: 3 }))).toBe('right');
    expect(tiltedFacing('left', walking(origin, { x: 3, y: 4 }))).toBe('left');
    expect(tiltedFacing('down', walking(origin, { x: 4, y: 5 }))).toBe('left');
  });

  /** No pop at the end of a route: the last walked step outlives `segment`. */
  test('a stopped actor keeps the facing it walked in on', () => {
    for (const step of [{ x: 5, y: 3 }, { x: 3, y: 3 }, { x: 5, y: 5 }, { x: 4, y: 3 }]) {
      expect(tiltedFacing('up', stoppedAfter(origin, step)))
        .toBe(tiltedFacing('up', walking(origin, step)));
    }
  });

  test('an actor that has never walked rotates its authored idle facing', () => {
    expect(tiltedFacing('down')).toBe('left');
    expect(tiltedFacing('up')).toBe('right');
    expect(tiltedFacing('up', { player: origin, previousTile: origin, segment: undefined })).toBe('up');
  });
});

describe('the ground-tile overlay transform', () => {
  /**
   * The travel pad in `ZoneGate` is a plain square View, so on the tilted path it only lands on the
   * tile it marks if this transform reproduces the projection. Applied in React Native's order -
   * right entry first - to each corner offset of a tile, it must give the same screen offsets
   * `worldToScreenTilted` gives for that tile's corners. Reversing the two entries passes no case.
   */
  test('maps a square overlay onto the projected tile', () => {
    const TILE_SIZE = 32;
    const tile = { x: 4, y: 7 } as const;
    const center = tileCenterWorld(tile, TILE_SIZE);
    const centerScreen = worldToScreenTilted(CAMERA, center);

    const scaleY = GROUND_TILE_TRANSFORM[0].scaleY;
    const yawRadians = (Number.parseFloat(GROUND_TILE_TRANSFORM[1].rotate) * Math.PI) / 180;
    const apply = (x: number, y: number): readonly [number, number] => {
      const rotatedX = x * Math.cos(yawRadians) - y * Math.sin(yawRadians);
      const rotatedY = x * Math.sin(yawRadians) + y * Math.cos(yawRadians);
      return [rotatedX, rotatedY * scaleY];
    };

    const corners: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    corners.forEach(([signX, signY]) => {
      const offsetX = (signX * TILE_SIZE) / 2;
      const offsetY = (signY * TILE_SIZE) / 2;
      const projected = worldToScreenTilted(CAMERA, { x: center.x + offsetX, y: center.y + offsetY });
      const [transformedX, transformedY] = apply(offsetX, offsetY);
      expect(transformedX).toBeCloseTo(projected.x - centerScreen.x, 6);
      expect(transformedY).toBeCloseTo(projected.y - centerScreen.y, 6);
    });
  });
});
