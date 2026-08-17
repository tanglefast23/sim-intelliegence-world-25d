import type { WorldFrameState } from '../world-frame';
import type { QuadDescriptor } from './scene-builder';
import { LAMP_GLOW_COLORS } from './recipes';

const TILE_SIZE = 32;

export type ShadowPath = 'lit' | 'fallback';

/**
 * The default path.
 *
 * Chosen as `lit` from the Stage 4 yaw comparison: the hard aliased cast shadows read as pixel art
 * and give the boxes their weight, which is the whole point of the tilt. Cost is one extra draw
 * call, measured — 6 against a ceiling of 8.
 *
 * **The frame-rate cost is NOT measured.** The plan originally defaulted to `fallback` on the
 * grounds that it "holds 60 FPS everywhere", and nothing in this work produced a frame-time number.
 * The fallback still ships, is still deterministic, and is still one query parameter away
 * (`?testShadowPath=fallback`) — so this is reversible the moment a measurement says otherwise.
 *
 * Selection stays explicit either way. Never a runtime FPS probe: that would make the picture
 * depend on the machine that drew it.
 */
export const DEFAULT_SHADOW_PATH: ShadowPath = 'lit';

/**
 * Copied from `LAMP_SPRITE_IDS` in `src/render/three/world-renderer.ts`.
 *
 * That file is frozen by the plan's Global Constraints and the Stage 4 closeout gates on its diff
 * being empty, so it cannot export the set. A test asserts this copy matches the source text and
 * has the same size, so adding a lamp there without adding it here fails the build.
 */
export const LAMP_SPRITE_IDS_25D: ReadonlySet<string> = new Set([
  'tile.fixture-lamp',
  'tile.fixture-dock-lamp-amber',
  'tile.fixture-dock-lamp-cold',
  'tile.fixture-festival-lantern',
  'tile.fixture-neon-lamp-cyan',
  'tile.fixture-neon-lamp-magenta',
]);

export type LampLight = Readonly<{
  id: string;
  x: number;
  z: number;
  color: string;
  intensity: number;
}>;

/**
 * Point lights at lamp PROPS, not at `DistrictLighting.pools`.
 *
 * The pools are district-level outdoor washes — they describe where the district glows, not where a
 * lamp stands. A light placed from a pool would float in the middle of a plaza with no object under
 * it. Lamp props are the things a player can see are lit.
 *
 * `lampMix` rises from 0 in full day to 1 at deep night, so lamps fade in as the sun goes rather
 * than snapping on.
 */
export function lampLights(frame: WorldFrameState): readonly LampLight[] {
  return frame.props
    .filter((prop) => LAMP_SPRITE_IDS_25D.has(prop.sprite))
    .map((prop) => ({
      id: `lamp-${prop.id}`,
      x: prop.tile.x + 0.5,
      z: prop.tile.y + 0.5,
      // The lamp's OWN glow colour, not the district accent. Under the accent an amber dock lamp
      // threw a teal pool: the source and the light it cast disagreed, and the harbour read as one
      // cold monochrome with warm dots floating in it. Falls back to the accent for a lamp sprite
      // with no recipe glow, which none has today.
      color: LAMP_GLOW_COLORS[prop.sprite] ?? frame.lighting.accent,
      // Strong at night, near-off in daylight. A lamp has to be the brightest thing in a
      // dark frame, or the scene reads as uniformly dim rather than pooled.
      intensity: 0.2 + frame.lighting.sun.lampMix * 11,
    }));
}

/**
 * A flat blob under every character, in BOTH shadow paths.
 *
 * Billboards do not cast into a shadow map — a camera-facing card has no meaningful silhouette from
 * the sun's direction, and the spike hand-places a blob for exactly this reason. So the lit path
 * gets real shadows from the boxes and blobs from the characters, and the fallback gets blobs only.
 *
 * The frame already computed the contact point and the cast offset, so this reads them rather than
 * re-deriving where a character's feet are.
 */
export function blobShadows(frame: WorldFrameState): readonly QuadDescriptor[] {
  return frame.characterShadows.map((shadow) => ({
    id: `blob-${shadow.id}`,
    sprite: 'blob-shadow',
    // Blobs are untextured: the renderer draws them with a plain material, so the source rect is
    // only here to satisfy the shared descriptor shape.
    source: { x: 0, y: 0, width: 0, height: 0 } as QuadDescriptor['source'],
    x: (shadow.worldX + shadow.castX) / TILE_SIZE,
    z: (shadow.worldY + shadow.castY) / TILE_SIZE,
    width: 0.82,
    depth: 0.5,
    tint: shadow.color,
    opacity: 1,
  }));
}

/**
 * A soft warm disc on the floor under each lamp.
 *
 * The lamp head glows, but a glowing head alone does not read as a light SOURCE - the reference
 * room is lit by visible pools on the floor, and without them a lamp is just a bright cube on a
 * stick. The point lights cannot supply this: flat furniture and floors either ignore them or are
 * too coarsely lit to show a falloff at this tile size.
 *
 * Drawn additively, so a pool brightens whatever is under it rather than painting over it, and
 * fades out with the sun exactly as the lamps fade in.
 */
export function lampPools(frame: WorldFrameState): readonly QuadDescriptor[] {
  const strength = frame.lighting.sun.lampMix;
  if (strength <= 0.01) return [];
  return lampLights(frame).map((lamp) => ({
    id: `pool-${lamp.id}`,
    sprite: 'lamp-pool',
    source: { x: 0, y: 0, width: 0, height: 0 } as QuadDescriptor['source'],
    x: lamp.x,
    z: lamp.z,
    width: 3.2,
    depth: 3.2,
    tint: lamp.color,
    opacity: 0.5 * strength,
  }));
}

/**
 * Which shadow path to draw, chosen explicitly.
 *
 * Same shape as `rendererForEnvironment`: a localhost query override and a smoke-mode global, with
 * production pinned to `DEFAULT_SHADOW_PATH`. Never a runtime FPS probe — the plan and the spec
 * both require the choice to be explicit so a capture is reproducible.
 */
export function shadowPathForEnvironment(input: Readonly<{
  hostname: string;
  search: string;
  smokeMode: boolean;
  smokeShadowPath?: ShadowPath;
}>): ShadowPath {
  if (input.smokeMode && input.smokeShadowPath) return input.smokeShadowPath;
  const local = input.hostname === 'localhost' || input.hostname === '127.0.0.1';
  if (!local) return DEFAULT_SHADOW_PATH;
  const requested = new URLSearchParams(input.search).get('testShadowPath');
  return requested === 'lit' || requested === 'fallback' ? requested : DEFAULT_SHADOW_PATH;
}

export function selectedShadowPath(): ShadowPath {
  if (typeof window === 'undefined' || !window.location) return DEFAULT_SHADOW_PATH;
  return shadowPathForEnvironment({
    hostname: window.location.hostname,
    search: window.location.search,
    smokeMode: window.siWorldSmokeMode === true,
    smokeShadowPath: window.siWorldShadowPath,
  });
}
