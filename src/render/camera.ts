import type { TilePoint } from '../world/maps/schema';
import { assertWorldZoom } from '../domain/presentation/world-zoom';

export type CameraState = Readonly<{ x: number; y: number; zoom: number }>;
export type ViewportSize = Readonly<{ width: number; height: number }>;
export type ScreenInsets = Readonly<{ left: number; right: number; top: number; bottom: number }>;

export const ZERO_SCREEN_INSETS: ScreenInsets = Object.freeze({ left: 0, right: 0, top: 0, bottom: 0 });

/** Half-extent of the follow dead zone, as a fraction of the viewport. Keren's "camera-window". */
export const CAMERA_DEAD_ZONE_RATIO = 0.12;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function cameraAxisBounds(viewportPixels: number, mapPixels: number, zoom: number): Readonly<{
  minimum: number;
  maximum: number;
}> {
  const visibleWorldPixels = viewportPixels / zoom;
  if (visibleWorldPixels >= mapPixels) {
    const centered = (mapPixels - visibleWorldPixels) / 2;
    return { minimum: centered, maximum: centered };
  }
  return { minimum: 0, maximum: mapPixels - visibleWorldPixels };
}

/**
 * Snaps to a whole screen pixel rather than a whole world pixel. At zoom 1 the two are the same
 * lattice, so nothing changes; above it, a world-pixel snap would move the camera in 2- and
 * 3-screen-pixel steps while `snapWorldPoint` glides sprites along the finer device lattice, which
 * reads as judder under any eased camera motion. `worldToScreen` and the three.js renderer both
 * already round to whole screen pixels, so this puts the camera on the lattice the render path
 * always used.
 */
/**
 * How a camera is clamped to the map. Threaded rather than branched on a boolean so the tilted
 * renderer can supply its own rule without any camera helper knowing a renderer kind exists.
 * Every parameter defaults to `clampCamera`, so existing callers and tests are untouched.
 */
export type ClampFn = (
  camera: CameraState,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
) => CameraState;

export function clampCamera(
  camera: CameraState,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
): CameraState {
  const zoom = assertWorldZoom(camera.zoom);
  const horizontal = cameraAxisBounds(viewport.width, mapPixels.width, zoom);
  const vertical = cameraAxisBounds(viewport.height, mapPixels.height, zoom);
  return {
    zoom,
    x: Math.round(clamp(camera.x, horizontal.minimum, horizontal.maximum) * zoom) / zoom,
    y: Math.round(clamp(camera.y, vertical.minimum, vertical.maximum) * zoom) / zoom,
  };
}

export function resizeCameraPreservingCenter(
  camera: CameraState,
  oldViewport: ViewportSize,
  nextViewport: ViewportSize,
  nextZoom: number,
  mapPixels: ViewportSize,
  clamp: ClampFn = clampCamera,
): CameraState {
  const centerWorldX = camera.x + oldViewport.width / camera.zoom / 2;
  const centerWorldY = camera.y + oldViewport.height / camera.zoom / 2;
  return clamp({
    zoom: nextZoom,
    x: centerWorldX - nextViewport.width / nextZoom / 2,
    y: centerWorldY - nextViewport.height / nextZoom / 2,
  }, nextViewport, mapPixels);
}

export function centerCameraOnTile(
  tile: TilePoint,
  zoom: number,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
  // BEFORE tileSize on purpose. Appended after it, every existing caller that omits both would be
  // fine, but a caller passing `clamp` would be passing a function where a number is expected.
  clamp: ClampFn = clampCamera,
  tileSize = 32,
): CameraState {
  return centerCameraOnWorld({ x: tile.x * tileSize + tileSize / 2, y: tile.y * tileSize + tileSize / 2 }, zoom, viewport, mapPixels, clamp);
}

export function centerCameraOnWorld(
  point: Readonly<{ x: number; y: number }>,
  zoom: number,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
  clamp: ClampFn = clampCamera,
): CameraState {
  return clamp({
    zoom,
    x: point.x - viewport.width / zoom / 2,
    y: point.y - viewport.height / zoom / 2,
  }, viewport, mapPixels);
}

/**
 * Centres the bounding box of `points` inside the viewport rectangle reduced by `insets`, keeping
 * the current zoom. With no insets and one point this is exactly `centerCameraOnWorld`.
 */
export function frameCameraOn(
  points: readonly Readonly<{ x: number; y: number }>[],
  zoom: number,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
  insets: ScreenInsets = ZERO_SCREEN_INSETS,
  clamp: ClampFn = clampCamera,
): CameraState {
  if (points.length === 0) throw new RangeError('Framing needs at least one world point.');
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const centerWorldX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerWorldY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const freeCenterX = (insets.left + viewport.width - insets.right) / 2;
  const freeCenterY = (insets.top + viewport.height - insets.bottom) / 2;
  return clamp({
    zoom,
    x: centerWorldX - freeCenterX / zoom,
    y: centerWorldY - freeCenterY / zoom,
  }, viewport, mapPixels);
}

/**
 * Camera-window follow: while the focus point is inside the centred dead zone the camera does not
 * move at all, so single steps never shove the view. Outside it, the camera that puts the point
 * back on the nearest window edge is returned; easing toward that target is the caller's job.
 */
export function followWindowTarget(
  camera: CameraState,
  focus: Readonly<{ x: number; y: number }>,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
  deadZoneRatio: number = CAMERA_DEAD_ZONE_RATIO,
  clamp: ClampFn = clampCamera,
): CameraState {
  const offsetX = (focus.x - camera.x) * camera.zoom - viewport.width / 2;
  const offsetY = (focus.y - camera.y) * camera.zoom - viewport.height / 2;
  const overflowX = Math.sign(offsetX) * Math.max(0, Math.abs(offsetX) - viewport.width * deadZoneRatio);
  const overflowY = Math.sign(offsetY) * Math.max(0, Math.abs(offsetY) - viewport.height * deadZoneRatio);
  if (overflowX === 0 && overflowY === 0) return camera;
  return clamp({
    ...camera,
    x: camera.x + overflowX / camera.zoom,
    y: camera.y + overflowY / camera.zoom,
  }, viewport, mapPixels);
}

export function panCamera(
  camera: CameraState,
  screenDelta: Readonly<{ x: number; y: number }>,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
  clamp: ClampFn = clampCamera,
): CameraState {
  return clamp({
    ...camera,
    x: camera.x - screenDelta.x / camera.zoom,
    y: camera.y - screenDelta.y / camera.zoom,
  }, viewport, mapPixels);
}

export function zoomCameraAt(
  camera: CameraState,
  nextZoomCandidate: number,
  anchor: Readonly<{ x: number; y: number }>,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
  clamp: ClampFn = clampCamera,
): CameraState {
  const nextZoom = assertWorldZoom(nextZoomCandidate);
  const worldX = camera.x + anchor.x / camera.zoom;
  const worldY = camera.y + anchor.y / camera.zoom;
  return clamp({
    zoom: nextZoom,
    x: worldX - anchor.x / nextZoom,
    y: worldY - anchor.y / nextZoom,
  }, viewport, mapPixels);
}

export function screenToTile(
  camera: CameraState,
  screen: Readonly<{ x: number; y: number }>,
  tileSize = 32,
): TilePoint {
  return {
    x: Math.floor((camera.x + screen.x / camera.zoom) / tileSize),
    y: Math.floor((camera.y + screen.y / camera.zoom) / tileSize),
  };
}

export function worldToScreen(
  camera: CameraState,
  world: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  return {
    x: Math.round((world.x - camera.x) * camera.zoom),
    y: Math.round((world.y - camera.y) * camera.zoom),
  };
}

export function isScreenPointInsideMap(
  camera: CameraState,
  screen: Readonly<{ x: number; y: number }>,
  mapPixels: ViewportSize,
): boolean {
  const worldX = camera.x + screen.x / camera.zoom;
  const worldY = camera.y + screen.y / camera.zoom;
  return worldX >= 0 && worldY >= 0 && worldX < mapPixels.width && worldY < mapPixels.height;
}
