import {
  GROUND_Z_SCALE,
  screenToTileTilted,
  screenToWorldTilted,
  tileCenterWorld,
  worldToScreenTilted,
} from '../projection';

const CAMERA = { x: 320, y: 256, zoom: 1 } as const;

describe('tilted ground projection at yaw 0', () => {
  test('compresses the depth axis and leaves the horizontal axis alone', () => {
    const screen = worldToScreenTilted(CAMERA, { x: 352, y: 288 });
    expect(screen.x).toBeCloseTo(32, 6);
    expect(screen.y).toBeCloseTo(32 * GROUND_Z_SCALE, 6);
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

  test('the depth scale matches the spike camera elevation', () => {
    // spike camera (8.2, 12.5, 11.5) -> target (0, 0.2, -0.25):
    // horizontal 14.33, vertical 12.3, elevation atan(12.3 / 14.33) = 40.65 degrees.
    expect(GROUND_Z_SCALE).toBeCloseTo(Math.sin((40.65 * Math.PI) / 180), 6);
  });
});
