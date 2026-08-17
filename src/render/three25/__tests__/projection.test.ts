import {
  CAMERA_YAW_DEGREES,
  GROUND_TILT_DEGREES,
  GROUND_Z_SCALE,
  groundFootprint,
  screenToTileTilted,
  screenToWorldTilted,
  tileCenterWorld,
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
