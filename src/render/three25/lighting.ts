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
    .map((prop) => {
      // One id, used for BOTH the light and its pool. Hashing the prop id here and the descriptor
      // id in `lampPools` gave a lamp and the light on the floor under it two different flickers,
      // which reads as two lights rather than one.
      const id = `lamp-${prop.id}`;
      return {
      id,
      x: prop.tile.x + 0.5,
      z: prop.tile.y + 0.5,
      // The lamp's OWN glow colour, not the district accent. Under the accent an amber dock lamp
      // threw a teal pool: the source and the light it cast disagreed, and the harbour read as one
      // cold monochrome with warm dots floating in it. Falls back to the accent for a lamp sprite
      // with no recipe glow, which none has today.
      color: LAMP_GLOW_COLORS[prop.sprite] ?? frame.lighting.accent,
      // Strong at night, near-off in daylight. A lamp has to be the brightest thing in a
      // dark frame, or the scene reads as uniformly dim rather than pooled.
      intensity: (0.2 + frame.lighting.sun.lampMix * 11)
        * lampFlicker(id, frame.vfxAgeStep),
      };
    });
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
  const sheltered = (worldX: number, worldY: number): boolean => frame.shelterCells.some((cell) => {
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
    return tileX >= cell.x && tileX < cell.x + cell.width
      && tileY >= cell.y && tileY < cell.y + cell.height;
  });
  return frame.characterShadows.map((shadow) => {
    const cast = blobCastOffset(frame, shadow, sheltered(shadow.worldX, shadow.worldY));
    return {
    id: `blob-${shadow.id}`,
    sprite: 'blob-shadow',
    // Blobs are untextured: the renderer draws them with a plain material, so the source rect is
    // only here to satisfy the shared descriptor shape.
    source: { x: 0, y: 0, width: 0, height: 0 } as QuadDescriptor['source'],
    x: (shadow.worldX + cast.x) / TILE_SIZE,
    z: (shadow.worldY + cast.y) / TILE_SIZE,
    width: 0.82,
    depth: 0.5,
    tint: shadow.color,
    opacity: 1,
    };
  });
}



/**
 * How far a lamp's brightness swings, as a fraction of its steady value.
 *
 * Small on purpose. A still night scene reads as a render rather than a place, and a lamp that
 * never varies is the largest single reason why — but a lamp that swings hard reads as a fault in
 * the lamp. 12% is enough to notice out of the corner of an eye and not enough to look broken.
 */
const LAMP_FLICKER_RANGE = 0.12;

/**
 * A deterministic brightness multiplier for one lamp at one animation step.
 *
 * Deterministic twice over. Same lamp and same step always give the same number, so a capture is
 * reproducible and a frame-diffing smoke does not see noise; and the value is stepped on the VFX
 * lattice rather than continuous, so the flicker is a pixel-art blink rather than a smooth fade.
 *
 * **Never apply this to a glow box's tint.** `sceneSignature` hashes box tints, so flickering one
 * would force a full rebake of the merged world every step — the most expensive operation in the
 * renderer, run several times a second, to make a lamp head wobble. The light and its floor pool
 * carry the flicker instead; both are rebuilt every frame anyway, so they cost nothing.
 */
export function lampFlicker(id: string, ageStep: number): number {
  let hash = 0x81_1c_9d_c5;
  const mix = (value: number): void => {
    hash = Math.imul(hash ^ (value | 0), 0x01_00_01_93);
  };
  for (let index = 0; index < id.length; index += 1) mix(id.charCodeAt(index));
  mix(ageStep);
  // >>> 0 first: the multiply leaves a signed 32-bit value, and a negative would bias the result.
  // Centred on 1, so the swing averages out. A one-sided flicker is not an animation, it is a
  // brightness cut: measured, dimming only cost every district 1-2.5 mean luminance and lifted
  // saturation by up to 0.10, which is the signature of a global exposure change rather than of a
  // lamp that blinks.
  return 1 + (((hash >>> 0) % 1000) / 1000 - 0.5) * LAMP_FLICKER_RANGE;
}

/** Above this lamp mix the lamps own the scene, so they own its shadows and its key light too. */
export const LAMP_KEY_THRESHOLD = 0.6;

/**
 * Where the night's key light should come FROM, in tiles, or undefined if the sun still owns it.
 *
 * After dusk the only shadow-casting light was a directional sun at 0.15 intensity aimed along the
 * day cycle's vector, while the lamps did all the visible lighting and cast nothing at all. So
 * objects sat in a warm pool with a hard shadow pointing away from a light that was not lighting
 * them — and "hard aliased pixel shadows" is a stated pillar of the look, not a detail.
 *
 * The CENTROID of the lamps in frame, not the nearest one. A centroid moves smoothly as the window
 * pans, where a nearest-lamp pick jumps the whole scene's shadows the moment the ranking changes.
 * One directional cannot serve three lamps honestly either way; the centroid is the choice that
 * lies least and never pops.
 */
export function nightKeyOrigin(
  frame: WorldFrameState,
): Readonly<{ x: number; z: number }> | undefined {
  if (frame.lighting.sun.lampMix < LAMP_KEY_THRESHOLD) return undefined;
  const lamps = lampLights(frame);
  if (lamps.length === 0) return undefined;
  let x = 0;
  let z = 0;
  for (const lamp of lamps) {
    x += lamp.x;
    z += lamp.z;
  }
  // Deliberately NO colour. Tinting the key to the lamps was measured and cost the harbour 0.18
  // saturation, because amber on amber kills the warm-on-cool contrast that district reads by.
  // Returning a colour nobody uses is one hookup away from undoing that.
  return { x: x / lamps.length, z: z / lamps.length };
}

/**
 * The direction a character's blob should stretch, away from whatever is lighting them.
 *
 * The frame offsets every blob by the day cycle's sun vector. After dusk that vector belongs to a
 * light at 0.15 intensity, so six characters standing around a magenta lamp all had identical ovals
 * pointing the same wrong way. This is a required companion of `nightKeyOrigin`, not an alternative
 * to it: if box shadows radiate from the lamps while blobs point along the dead sun, the frame
 * contradicts itself more loudly than either error does alone.
 *
 * Indoors the blob keeps the frame's own offset. A room is lit from a fixture overhead, which rakes
 * nothing, and the short indoor blob is already right.
 */
export function blobCastOffset(
  frame: WorldFrameState,
  shadow: Readonly<{ worldX: number; worldY: number; castX: number; castY: number }>,
  insideShelter: boolean,
): Readonly<{ x: number; y: number }> {
  if (insideShelter || frame.lighting.sun.lampMix < LAMP_KEY_THRESHOLD) {
    return { x: shadow.castX, y: shadow.castY };
  }
  const lamps = lampLights(frame);
  if (lamps.length === 0) return { x: shadow.castX, y: shadow.castY };
  const tileX = shadow.worldX / TILE_SIZE;
  const tileZ = shadow.worldY / TILE_SIZE;
  let nearest = lamps[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const lamp of lamps) {
    const dx = lamp.x - tileX;
    const dz = lamp.z - tileZ;
    const squared = dx * dx + dz * dz;
    if (squared < bestDistance) {
      bestDistance = squared;
      nearest = lamp;
    }
  }
  const distance = Math.sqrt(bestDistance);
  if (distance < 0.01) return { x: 0, y: 0 };
  // Longer the further away the lamp is, the way a real cast lengthens, and capped so a character
  // at the edge of a pool does not trail a shadow across the whole yard.
  const reach = Math.min(0.42 + distance * 0.16, 1.1) * TILE_SIZE;
  return {
    x: ((tileX - nearest.x) / distance) * reach,
    y: ((tileZ - nearest.z) / distance) * reach,
  };
}

/**
 * How far south of a cluster's base `world-frame.ts` anchors a prop shadow, in world pixels.
 *
 * `propShadows` is authored for the 2D renderer, where the strip sits below the sprite's feet. On
 * the ground plane that offset is a translation away from the object, so it has to come back off.
 */
const PROP_SHADOW_ANCHOR_OFFSET = 25;

/**
 * Half a tile, added back after removing the anchor offset.
 *
 * Removing the 25px recovers the southernmost sprite's own origin, which is the tile's NORTH edge,
 * not its centre. Boxes stand on tile centres, so a stain placed at the edge covers only the far
 * 27% of the object it belongs to — the same detached-stain failure as before, half a tile smaller.
 */
const HALF_TILE = TILE_SIZE / 2;

/**
 * A dark contact stain under every prop that stands on the floor.
 *
 * The single most visible amateur tell in the 2.5D frames was that nothing sat on the ground. A
 * sofa, a crate stack and a lamp post all floated a hair above their own tile, because the only
 * shadow in the scene came from a directional sun that is nearly off after dusk — and the 2.5D path
 * never read `frame.propShadows`, which the 2D path has always drawn.
 *
 * A contact stain, not a cast: a small ellipse under the footprint that says "this object touches
 * here". It does not point anywhere, so it cannot disagree with the lamps the way the sun's rake
 * does, and it works in both shadow paths and at every hour.
 *
 * Rides in the blob batch, which already bakes flat ground quads every frame. Zero draw calls.
 */
export function propContactShadows(frame: WorldFrameState): readonly QuadDescriptor[] {
  return frame.propShadows.map((shadow) => ({
    id: `contact-${shadow.id}`,
    sprite: 'contact-shadow',
    source: { x: 0, y: 0, width: 0, height: 0 } as QuadDescriptor['source'],
    // `worldX` is the cluster's LEFT EDGE and `worldY` is its base pushed 25px south, because the
    // 2D renderer draws this as a strip anchored under a sprite. Read as a centre — which is what
    // every other descriptor in this file carries — every stain lands low and to the right of the
    // object it belongs to, detached from it. That is exactly how it looked.
    x: (shadow.worldX + shadow.width / 2) / TILE_SIZE,
    z: (shadow.worldY - PROP_SHADOW_ANCHOR_OFFSET + HALF_TILE) / TILE_SIZE,
    // Deliberately smaller than the lamp pool it sits inside. A stain wider than the object reads
    // as a cast shadow from a light that is not there. `long` marks the tall casters - lamps, neon,
    // planters, palms - which get a slightly bigger stain because they meet the ground on a stem.
    width: (shadow.width / TILE_SIZE) * (shadow.long ? 0.7 : 0.9),
    depth: (shadow.width / TILE_SIZE) * (shadow.long ? 0.42 : 0.54),
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
    // The pool dims with its own lamp. A lamp that flickers while the light on the floor under it
    // holds steady reads as two lights, not one.
    opacity: 0.5 * strength * lampFlicker(lamp.id, frame.vfxAgeStep),
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
