import type { WorldFrameState } from '../world-frame';
import type { QuadDescriptor } from './scene-builder';
import { CHARACTER_CONTACT_OFFSET } from './billboards';
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

/**
 * Ceiling troffers. A SEPARATE set from the lamp posts, on purpose.
 *
 * An office is ceiling-lit, and the pooled-post night model is the wrong default for it: fourteen
 * posts' worth of amber at 20 degrees turns a fluorescent room into a sunset. These sit higher and
 * read cooler.
 *
 * They do NOT fall off wider, and they are not individually weaker. Both were true of the first
 * office round and both were wrong: a ten-tile reach at decay 1.2 had every panel in the farm
 * lighting every tile of it, which is a flat plate, not a ceiling grid. A troffer now reaches
 * eight tiles at 1.5 and carries its own cell — see the constants below for the measured trade.
 *
 * Kept out of `LAMP_SPRITE_IDS_25D` because that set is a verified copy of the frozen 2D
 * renderer's. Adding a ceiling sprite there would demand an edit to a file the Stage 4 closeout
 * gates on being unchanged.
 */
export const CEILING_SPRITE_IDS_25D: ReadonlySet<string> = new Set([
  'tile.fixture-ceiling-panel',
]);

/** The troffer's own diffuser colour: cool white, not the district accent and not lamp amber. */
const CEILING_LIGHT_COLOR = '#d8e4f0';

/** Matches the glow plate in `PROP_RECIPES`, so the light sits in the fixture that shows it. */
const CEILING_LIGHT_HEIGHT = 1.33;

export type LampLight = Readonly<{
  id: string;
  x: number;
  z: number;
  color: string;
  intensity: number;
  /**
   * How high the point sits, and which falloff and pool it carries. A post lights a pocket; a
   * troffer lights the cell of the grid it belongs to. The renderer reads this rather than
   * inferring a kind from the sprite.
   */
  kind: 'post' | 'ceiling';
  y: number;
  distance: number;
  decay: number;
  poolRadius: number;
  poolOpacity: number;
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
  return [...postLights(frame), ...ceilingLights(frame)];
}

/**
 * Troffer flicker is +/-2%, not the post's +/-6%.
 *
 * A fluorescent tube does flutter, and a completely steady ceiling reads as a render rather than a
 * room. But an office where fourteen panels visibly blink looks broken rather than atmospheric, so
 * the amplitude is a third of a lamp's and lands under conscious notice.
 */
const CEILING_FLICKER_SHARE = 1 / 3;

/**
 * How many troffers become POINT LIGHTS at once.
 *
 * `frame.props` is the whole map's props, not a camera window, so one panel per desk plus panels in
 * every other room is 56 lights on the office — four times the fourteen the spec budgeted, and it
 * budgeted fourteen because downtown's neon already showed what a lit-material recompile per light
 * costs. Content should not have to ration fixtures to protect the renderer.
 *
 * So the FIXTURES are unlimited and the LIGHTS are capped. Every panel still draws, and its glow
 * plate still reads at full brightness, because a glow box is unlit batched geometry and costs
 * nothing. Only the nearest ones to the camera actually cast, which are the only ones whose falloff
 * a player can see anyway.
 *
 * Selection is by distance to the PROTAGONIST and then by id, so it is deterministic: a tie that
 * resolved by array order would make the lit set flicker as props were rebuilt.
 *
 * The protagonist, not `frame.camera`. That field is the viewport's top-left CORNER in world
 * pixels, not its centre, so ranking by it biased the whole lit set into one corner of the screen
 * and measured as a hallway that had gone dark at the far end — dead fraction 0.032 to 0.137.
 * The subject of the frame is the honest centre, and every capture is composed around it.
 */
const MAX_CEILING_POINT_LIGHTS = 24;

function ceilingLights(frame: WorldFrameState): readonly LampLight[] {
  const subject = frame.characters.find(({ id }) => id === 'protagonist')?.tile
    ?? frame.characters[0]?.tile;
  const focusX = (subject?.x ?? 0) + 0.5;
  const focusZ = (subject?.y ?? 0) + 0.5;
  const nearest = frame.props
    .filter((prop) => CEILING_SPRITE_IDS_25D.has(prop.sprite))
    .map((prop) => {
      const dx = prop.tile.x + 0.5 - focusX;
      const dz = prop.tile.y + 0.5 - focusZ;
      return { prop, distance: dx * dx + dz * dz };
    })
    .sort((left, right) => left.distance - right.distance
      || (left.prop.id < right.prop.id ? -1 : left.prop.id > right.prop.id ? 1 : 0))
    .slice(0, MAX_CEILING_POINT_LIGHTS)
    .map(({ prop }) => prop);
  return nearest
    .map((prop) => {
      const id = `ceiling-${prop.id}`;
      const flicker = 1 + (lampFlicker(id, frame.vfxAgeStep) - 1) * CEILING_FLICKER_SHARE;
      return {
        id,
        kind: 'ceiling' as const,
        x: prop.tile.x + 0.5,
        z: prop.tile.y + 0.5,
        y: CEILING_LIGHT_HEIGHT,
        color: CEILING_LIGHT_COLOR,
        // 14, which is STRONGER than a lamp post's 11. That reverses the first office round, and
        // it is the direct consequence of the tightening below: a panel that reaches eight tiles
        // instead of ten and falls off at 1.5 instead of 1.2 lights its own five-tile cell nearly
        // alone, where the old one was one of a dozen contributors to every tile in the farm.
        // Weak-each was correct for a flood and starves a grid.
        //
        // Measured on `cubicles-night`, holding the tightened falloff and the twelve-panel ceiling:
        //
        //     7.5  dead 0.069  pool 2.219  lum 61.5  detail 2.270
        //     9.5  dead 0.061  pool 2.162  lum 67.4  detail 2.408
        //     11.5 dead 0.054  pool 2.105  lum 72.9  detail 2.526
        //     14   dead 0.049  pool 2.056  lum 79.1  detail 2.653
        //
        // Every column improves together, which is the signature of a scene that was underexposed
        // rather than one being flooded — a flood shows up as luminance rising while pooling rises
        // with it. `hall-night` pooling turns back up at 14 (1.775 -> 1.786), so that is the knee
        // and the reason this stops here rather than at 16.
        intensity: (0.6 + frame.lighting.sun.lampMix * 14) * flicker,
        // Reach of EIGHT tiles falling off at 1.5, not ten at 1.2.
        //
        // The wide-and-soft numbers came from the first office round and they overshot: the panels
        // sit five tiles apart, so a ten-tile window meant every fixture in the farm lit every tile
        // of it, and the twenty-four nearest lights summed to one even plate. The capture showed a
        // floor with no falloff anywhere on it — the flood the pooling metric exists to catch, and
        // the reason six aisle panels had to be authored to fill walkways no single panel owned.
        //
        // Eight still overlaps the neighbours at five tiles, so the grid stays continuous and a
        // clerk never walks through a hole; the steeper decay is what puts a gradient back inside
        // that overlap. At 1.2 a panel is 70% as bright three tiles out as it is underneath, which
        // is not a light, it is an ambient term with a position. Six tiles at 1.7 was tried and is
        // too tight the other way: the aisles went to dead 0.100 and the hall to 0.179.
        distance: 8,
        decay: 1.5,
        poolRadius: 4,
        poolOpacity: 0.28,
      };
    });
}

function postLights(frame: WorldFrameState): readonly LampLight[] {
  return frame.props
    .filter((prop) => LAMP_SPRITE_IDS_25D.has(prop.sprite))
    .map((prop) => {
      // One id, used for BOTH the light and its pool. Hashing the prop id here and the descriptor
      // id in `lampPools` gave a lamp and the light on the floor under it two different flickers,
      // which reads as two lights rather than one.
      const id = `lamp-${prop.id}`;
      return {
      id,
      kind: 'post' as const,
      x: prop.tile.x + 0.5,
      z: prop.tile.y + 0.5,
      y: 1,
      distance: 11,
      decay: 1.4,
      poolRadius: 3.2,
      poolOpacity: 0.5,
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
 * How hard a character blob is pushed past the frame's shadow alpha.
 *
 * `lighting.shadow.color` carries roughly 0.19-0.32 alpha, and the blob fades that to zero at the
 * rim, so at authored strength a character read as standing on nothing. Characters are the one
 * thing in the scene with no cast shadow of their own — a billboard has no silhouette for the
 * shadow map — so their blob has to carry the whole contact cue on its own.
 *
 * Prop stains keep the authored alpha: they sit under boxes that DO cast, and doubling both put a
 * second dark ring under every crate.
 */
const BLOB_SHADOW_STRENGTH = 1.9;

/**
 * How far the sky light is allowed to take the night's lamp colour — and zero indoors.
 *
 * A neon street lights its own sky, so after dusk the hemisphere borrows the hue of the most
 * saturated lamp in frame. A room has no sky, so under a roof it borrows nothing. The office was
 * taking a night tint through its own ceiling, and taking it from `frame.props`, which is the WHOLE
 * MAP — so the colour came from fixtures in rooms the player cannot see.
 *
 * `shelterCells` is populated only while the player occupies a roof group, which makes it the same
 * indoor test `indoorOverheadKeyOrigin` uses. Sharing the test is the point: a frame that kills the
 * rake but keeps the skyglow is still lighting an interior as though it were outdoors.
 */
export function skyglowMix(frame: WorldFrameState): number {
  if (frame.shelterCells.length > 0) return 0;
  return 0.45 * frame.lighting.sun.lampMix;
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
    // HALF the cast, so the ellipse still touches the feet while reaching away from the light. A
    // full offset translates the whole blob off the character: at four tiles from a lamp they get a
    // detached oval and nothing under them, which is worse than the symmetric blob it replaced.
    // `CHARACTER_CONTACT_OFFSET` because `worldX` is the strip's LEFT EDGE — without it the lean
    // starts 7 pixels west of the feet, so the character got the blob's transparent rim and the
    // shadow read as missing entirely.
    x: (shadow.worldX + CHARACTER_CONTACT_OFFSET + cast.x / 2) / TILE_SIZE,
    z: (shadow.worldY + cast.y / 2) / TILE_SIZE,
    // And it lengthens along the cast rather than staying a fixed oval, which is what "stretches
    // away from the light" has to mean: a shadow gets longer as the light gets lower and further.
    width: 0.82 + Math.abs(cast.x) / TILE_SIZE,
    depth: 0.5 + Math.abs(cast.y) / TILE_SIZE,
    tint: shadow.color,
    opacity: BLOB_SHADOW_STRENGTH,
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
  const lamps = lampLights(frame).filter(({ kind }) => kind === 'post');
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
/**
 * The centroid of the ceiling troffers in frame, when the player is standing under them.
 *
 * A ceiling-lit room must not rake. `nightKeyOrigin` places the key nine tiles out at 20 degrees,
 * which is right for a street of lamp posts and wrong for an office: it turns a fluorescent room
 * into a sunset and throws desk shadows the length of the aisle. Under troffers the key comes
 * straight down instead, and shadows become tight puddles under desks and partitions.
 *
 * Returns nothing when only floor lamps are in frame, so the villa at night keeps the short indoor
 * behaviour it already has and this cannot steal its lamp key.
 */
export function indoorOverheadKeyOrigin(
  frame: WorldFrameState,
): Readonly<{ x: number; z: number }> | undefined {
  // `shelterCells` is populated only while the player occupies a roof group, so it IS the indoor
  // test. Taking a caller-supplied boolean instead is one wrong argument away from raking a room.
  if (frame.shelterCells.length === 0 || frame.lighting.sun.lampMix < LAMP_KEY_THRESHOLD) return undefined;
  const ceiling = lampLights(frame).filter(({ kind }) => kind === 'ceiling');
  if (ceiling.length === 0) return undefined;
  let x = 0;
  let z = 0;
  for (const light of ceiling) {
    x += light.x;
    z += light.z;
  }
  return { x: x / ceiling.length, z: z / ceiling.length };
}

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
    width: lamp.poolRadius,
    depth: lamp.poolRadius,
    tint: lamp.color,
    // The pool dims with its own lamp. A lamp that flickers while the light on the floor under it
    // holds steady reads as two lights, not one.
    opacity: lamp.poolOpacity * strength * lampFlicker(lamp.id, frame.vfxAgeStep),
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
