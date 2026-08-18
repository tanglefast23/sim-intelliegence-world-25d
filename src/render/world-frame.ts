import type { WorldState } from '../domain/state/schema';
import {
  groundSpriteAtV2,
  roofGroupAtV2,
  type CompiledDoorV2,
  type CompiledMapV2,
} from '../world/maps/compiled-v2';
import { tileKey, type TilePoint } from '../world/maps/schema';
import type { MapId } from '../world/maps/catalog';
import { doorMotionPhase, type MovementDirection, type MovementState } from '../world/pathfinding/movement';
import { presentationGroundAt } from '../world/presentation/art-presentation';
import { stableTupleHash } from '../world/presentation/material-selection';
import { visualBoundsIntersectTileWindow } from '../world/presentation/visual-bounds';
import { mapEffectVisible, worldAtmosphere, type WorldAtmosphere } from './atmosphere';
import {
  ATLAS_INDEX,
  atlasRectangle,
  movementPresentation,
  type AtlasRectangle,
  type CharacterId,
} from './atlas';
import type { CameraState, ViewportSize } from './camera';
import { compareDepth, compareGroundedDepth, WORLD_DEPTH } from './depth';
import { districtLighting, type DistrictLighting } from './district-lighting';
import { journalMapMarkers, type JournalMapMarker } from './journal-markers';
import { snapWorldPoint } from '../world/movement/motion-clock';
import type { TurnCurve } from '../world/movement/turn-curve';
import {
  gaitAngleDegrees,
  gaitBobPixels,
  gaitStopLeanDegrees,
  gaitTurnLeanDegrees,
} from './gait';
import { downPose, fallPose, impactPose, recoilPose, type ImpactPose } from './impact-motion';
import { PROTAGONIST_WOBBLE_PIVOT, protagonistWobbleDegrees } from './protagonist-wobble';
import { sampleVfxGeometry, vfxBoundsIntersectWorldRect } from './vfx/procedural-effects';
import { partitionVfxEmitters } from './vfx/seed';
import {
  VFX_STEP_MILLISECONDS,
  VFX_ROLE_COLORS,
  type AuthoredMapEffect,
  type VfxGeometry,
  type VfxKind,
  type VfxMode,
  type VfxPrimitiveRole,
  type TransientVfxGlow,
  type TransientVfxRect,
} from './vfx/types';

const TILE_SIZE = 32;
const WHITE = '#ffffffff';
const MAP_HASHES = new WeakMap<CompiledMapV2, string>();
const STATIC_FRAME_LISTS = new WeakMap<CompiledMapV2, Map<string, StaticFrameLists>>();

export const WORLD_LAYER_ORDER = [
  'floor',
  'prop',
  'shadow',
  'character',
  'effect',
  'wall',
  'roof',
] as const;

export const WORLD_COMPOSITE_ORDER = [
  'floor-and-ground-detail',
  'doors-and-door-wear',
  'contact-shadows-and-thresholds',
  'selection-ring',
  'grounded-props-and-characters',
  'effects',
  'walls',
  'roofs',
  'shelter-shade',
  'district-lighting',
  'atmosphere',
  'destination-pulse',
  'journal-markers',
  'failure-marker',
  'selection-marker-and-ui',
] as const;

export type WorldLayer = typeof WORLD_LAYER_ORDER[number];
export type WorldCompositeLayer = typeof WORLD_COMPOSITE_ORDER[number];
export type CharacterPose = 'idle' | 'reaction' | 'talk' | 'impact' | 'recoil' | 'falling' | 'down';
export type WorldArtMode = 'enhanced' | 'legacy';
export type WorldPoint = Readonly<{ x: number; y: number }>;

type WorldAtlasPlacement = Readonly<{
  id: string;
  sprite: string;
  source: AtlasRectangle;
  worldX: number;
  worldY: number;
  pivot: WorldPoint;
  rotationDegrees: number;
  scale: number;
  color: string;
  opacity: number;
  layer: WorldLayer;
  layerValue: number;
}>;

export type WorldFloorPlacement = WorldAtlasPlacement & Readonly<{
  tile: TilePoint;
  mask: number | null;
  kind: 'floor' | 'transition' | 'decal';
}>;

export type WorldPropPlacement = WorldAtlasPlacement & Readonly<{
  isDoor: boolean;
  objectId: string;
  tile: TilePoint;
}>;

export type WorldWallPlacement = WorldAtlasPlacement & Readonly<{
  adjacencyMask: number;
  exposedBase: boolean;
  tile: TilePoint;
}>;

export type WorldRoofPlacement = WorldAtlasPlacement & Readonly<{
  roofGroupId: string;
  tile: TilePoint;
}>;

export type WorldCharacterPlacement = WorldAtlasPlacement & Readonly<{
  visualId: CharacterId;
  tile: TilePoint;
  shadowWorldX: number;
  shadowWorldY: number;
  angleDegrees: number;
  /**
   * The stride bob already folded into `worldY`, in world pixels, post-snap.
   *
   * Carried on the placement for the same reason `angleDegrees` is: the evidence node must report
   * what was drawn, not a recomputation that can drift away from it.
   */
  gaitBobPixels: number;
}>;

export type WorldGroundedEntry = Readonly<{
  groundY: number;
  id: string;
  kind: 'character' | 'prop';
}>;

export type WorldPropShadow = Readonly<{
  id: string;
  long: boolean;
  width: number;
  worldX: number;
  worldY: number;
  color: string;
}>;

export type WorldCharacterShadow = Readonly<{
  id: string;
  worldX: number;
  worldY: number;
  castX: number;
  castY: number;
  color: string;
}>;

export type WorldDoorPrimitive = Readonly<{
  id: string;
  worldX: number;
  worldY: number;
  horizontal: boolean;
  darkColor: string;
  lightColor: string;
}>;

export type WorldWallBase = Readonly<{
  id: string;
  worldX: number;
  worldY: number;
  darkColor: string;
  lightColor: string;
}>;

export type WorldJournalMarker = JournalMapMarker & Readonly<{
  darkColor: string;
  lightColor: string;
}>;

export type WorldFallbackEffect = Readonly<{
  id: string;
  kind: VfxKind;
  tile: TilePoint;
  worldX: number;
  worldY: number;
  color: string;
}>;

export type WorldFrameView = Readonly<{
  camera: CameraState;
  viewport: ViewportSize;
  devicePixelRatio: number;
  artMode: WorldArtMode;
  movements: readonly MovementState[];
  selectedFoot: WorldPoint;
  destinationMarker?: TilePoint;
  destinationPulseElapsedMs: number;
  failureTile?: TilePoint;
  reducedMotion: boolean;
  animationTimestampMilliseconds: number;
  vfxAgeStep: number;
  vfxMode: VfxMode;
  /**
   * Sampled one-shot geometry. Optional and left UNDEFINED when empty, not an empty array:
   * `frameSummary()` hashes `JSON.stringify(frame)` and `JSON.stringify` omits undefined keys, so an
   * idle frame stays byte-identical to the locked fixture. Same pattern as `destinationPulse`.
   */
  transientEffects?: readonly TransientVfxRect[];
  transientGlows?: readonly TransientVfxGlow[];
}>;

export type WorldFrameState = Readonly<{
  schemaVersion: 1;
  mapId: string;
  mapHash: string;
  presentationHash: string;
  atlasHash: string;
  stateRevision: number;
  camera: CameraState;
  viewport: ViewportSize;
  devicePixelRatio: number;
  /** The map's extent in tiles. Ground light sizes its corner lattice from this. */
  mapTiles: Readonly<{ width: number; height: number }>;
  reducedMotion: boolean;
  animationTimestampMilliseconds: number;
  vfxAgeStep: number;
  layerOrder: readonly WorldLayer[];
  compositeOrder: readonly WorldCompositeLayer[];
  floors: readonly WorldFloorPlacement[];
  groundDetails: readonly WorldFloorPlacement[];
  props: readonly WorldPropPlacement[];
  doors: readonly WorldPropPlacement[];
  characters: readonly WorldCharacterPlacement[];
  effects: readonly VfxGeometry[];
  effectRoleColors: Readonly<Record<VfxPrimitiveRole, string>>;
  fallbackEffects: readonly WorldFallbackEffect[];
  /** One-shot geometry. Undefined rather than empty when idle — see `WorldFrameView`. */
  transientEffects?: readonly TransientVfxRect[];
  transientGlows?: readonly TransientVfxGlow[];
  walls: readonly WorldWallPlacement[];
  roofs: readonly WorldRoofPlacement[];
  groundedOrder: readonly WorldGroundedEntry[];
  propShadows: readonly WorldPropShadow[];
  characterShadows: readonly WorldCharacterShadow[];
  doorWear: readonly WorldDoorPrimitive[];
  thresholds: readonly WorldDoorPrimitive[];
  wallBases: readonly WorldWallBase[];
  selectionRing: Readonly<{
    id: 'selection-ring';
    worldX: number;
    worldY: number;
    radiusX: number;
    radiusY: number;
    color: string;
    strokeWidth: number;
  }>;
  destinationPulse?: Readonly<{
    id: 'destination-pulse';
    worldX: number;
    worldY: number;
    opacity: number;
    radius: number;
    color: string;
  }>;
  journalMarkers: readonly WorldJournalMarker[];
  failureMarker?: Readonly<{
    id: 'failure-marker';
    worldX: number;
    worldY: number;
    radiusPixels: number;
    color: string;
  }>;
  hiddenRoofGroupId?: string;
  visibleRoofGroupIds: readonly string[];
  shelterCells: readonly Readonly<{ x: number; y: number; width: number; height: number }>[];
  roofedCells: readonly Readonly<{ x: number; y: number; width: number; height: number }>[];
  lighting: DistrictLighting;
  atmosphere: WorldAtmosphere;
  visibleEffectIds: readonly string[];
  culledEffectIds: readonly string[];
  fallbackEmitterIds: readonly string[];
  drawCounts: Readonly<Record<WorldLayer | 'total', number>>;
}>;

export type WorldActor = Readonly<{
  tile: TilePoint;
  visualId: CharacterId;
  direction?: MovementDirection;
  visualFoot?: WorldPoint;
  walkFrame?: 0 | 1;
  moving?: boolean;
  reducedMotion?: boolean;
  horizontalRunDistance?: number;
  pose?: CharacterPose;
  poseFrame?: 0 | 1;
  /** Route-accumulated travel, the gait's stride clock. See `gait.ts`. */
  travelDistance?: number;
  /** The actor's latched turn curve, for the momentum lean into a corner. */
  turnCurve?: TurnCurve;
  /** Progress through the route's FINAL segment. Undefined on any other segment. */
  stopProgress?: number;
  /** 0..1 through the current impact, recoil or fall beat. Driven by the scripted scene. */
  poseProgress?: number;
  /** Direction the force travels in screen x. */
  poseDirection?: -1 | 1;
}>;

export type WorldActors = Readonly<Record<string, WorldActor>>;

type VisibleTileBounds = Readonly<{
  minimumX: number;
  minimumY: number;
  maximumX: number;
  maximumY: number;
}>;

type StaticFrameLists = Readonly<{
  floors: readonly WorldFloorPlacement[];
  groundDetails: readonly WorldFloorPlacement[];
  props: readonly WorldPropPlacement[];
  walls: readonly WorldWallPlacement[];
  roofs: readonly WorldRoofPlacement[];
}>;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function cloneAtlasRectangle(sprite: string): AtlasRectangle {
  return { ...atlasRectangle(sprite) };
}

function worldMapHash(map: CompiledMapV2): string {
  const cached = MAP_HASHES.get(map);
  if (cached) return cached;
  const hash = stableTupleHash([JSON.stringify(map.source)]).toString(16).padStart(8, '0');
  MAP_HASHES.set(map, hash);
  return hash;
}

function placement(
  input: Readonly<{
    id: string;
    sprite: string;
    worldX: number;
    worldY: number;
    layer: WorldLayer;
    scale?: number;
    pivot?: WorldPoint;
    rotationDegrees?: number;
  }>,
): WorldAtlasPlacement {
  return {
    ...input,
    source: cloneAtlasRectangle(input.sprite),
    pivot: { ...(input.pivot ?? { x: 0, y: 0 }) },
    rotationDegrees: input.rotationDegrees ?? 0,
    scale: input.scale ?? 1,
    color: WHITE,
    opacity: 1,
    layerValue: WORLD_DEPTH[input.layer],
  };
}

function visibleTileBounds(camera: CameraState, viewport: ViewportSize, margin = 1): VisibleTileBounds {
  return {
    minimumX: Math.floor(camera.x / TILE_SIZE) - margin,
    minimumY: Math.floor(camera.y / TILE_SIZE) - margin,
    maximumX: Math.ceil((camera.x + viewport.width / camera.zoom) / TILE_SIZE) + margin,
    maximumY: Math.ceil((camera.y + viewport.height / camera.zoom) / TILE_SIZE) + margin,
  };
}

function isVisible(tile: TilePoint, bounds: VisibleTileBounds): boolean {
  return tile.x >= bounds.minimumX && tile.x <= bounds.maximumX &&
    tile.y >= bounds.minimumY && tile.y <= bounds.maximumY;
}

function propShadowWidth(sprite: string): number {
  if (/(counter|sofa|table|stall|bench|rack|cargo|ferry|crane|canopy|car)/u.test(sprite)) return 26;
  if (sprite.includes('flowering-market-planter')) return 18;
  if (/(lamp|sign|palm|planter|bollard)/u.test(sprite)) return 12;
  return 18;
}

/**
 * Handoff technique 4: authored object scale, from the pixel-villa spike.
 *
 * Every prop drew at exactly its authored pixel size, so a sofa carried the same visual weight as
 * the floor tile beneath it. The spike gave furniture presence by drawing it slightly larger, and
 * that is the whole of this table.
 *
 * Keyed by sprite id and gated on membership, NOT on `scale !== 1`. Multi-tile floors already pass
 * a composition scale through `placement()`, so a shift applied to anything scaled would move the
 * ground itself.
 */
const PROP_SCALE: Readonly<Record<string, number>> = {
  'tile.fixture-planter': 1.08,
  'tile.flowering-market-planter': 1.08,
  'tile.decal-neon-planter': 1.08,
  'tile.table-left': 1.08,
  'tile.table-right': 1.08,
  'tile.sofa-left': 1.12,
  'tile.sofa-right': 1.12,
};

/**
 * Scale about the BOTTOM CENTRE, so the prop keeps its feet on the floor.
 *
 * `addAtlasPlacement` maps the quad to worldX..worldX + width x scale with y growing down, so a
 * top-left anchor grows the sprite down and right and sinks its feet below the ground line.
 *
 * Returns a NEW object. The static placement lists are deep-frozen and cached, so mutating in
 * place throws in strict mode.
 */
/**
 * Handoff technique 4b: the authored character scale from the pixel-villa spike.
 *
 * The spike used 1.22. This ships 7/6, and the reason is a hard constraint rather than taste.
 *
 * 24 x 1.22 = 29.28 and 30 x 1.22 = 36.6. A fractional sprite SIZE puts the quad's far edges on
 * fractional world coordinates no matter where the near edge is anchored, so whole-pixel placement
 * is broken by the scale itself and no choice of anchor rescues it. 7/6 maps the 24x30 protagonist
 * to exactly 28x35, which is the nearest ratio to the spike's intent that keeps both edges whole.
 *
 * The shifts are whole pixels for the same reason, and they are chosen to make the FOOT exact:
 *
 *   worldY - 5 + 30 x 7/6 = worldY + 30   the foot line is invariant, exactly
 *   worldX - 2 + 12 x 7/6 = worldX + 12   the pivot's x is invariant, exactly
 *   worldY - 5 + 29 x 7/6 = worldY + 28.833   the pivot's y drifts 0.167 logical pixels
 *
 * Something has to give between whole-pixel placement, the foot line and the rotation pivot. The
 * pivot's y is what gives, by a sixth of a pixel, because it is the only one of the three that is
 * neither a locked constraint nor visible as a figure standing on a floor.
 */
export const CHARACTER_SCALE = 7 / 6;
const CHARACTER_SHIFT_X = 2;
const CHARACTER_SHIFT_Y = 5;

export function withAuthoredCharacterScale(
  worldX: number,
  worldY: number,
): Readonly<{ worldX: number; worldY: number; scale: number }> {
  return {
    worldX: worldX - CHARACTER_SHIFT_X,
    worldY: worldY - CHARACTER_SHIFT_Y,
    scale: CHARACTER_SCALE,
  };
}

export function withAuthoredPropScale(prop: WorldPropPlacement): WorldPropPlacement {
  const scale = PROP_SCALE[prop.sprite];
  if (scale === undefined) return prop;
  return {
    ...prop,
    scale,
    worldX: prop.worldX - (scale - 1) * prop.source.width / 2,
    worldY: prop.worldY - (scale - 1) * prop.source.height,
  };
}

/**
 * Every tile under a roof, expanded from interior cell rectangles to tile keys.
 *
 * `shelterCells` alone is NOT the indoor set. It holds only the interior of the roof group the
 * player has ENTERED, so the moment they step outside it empties and every indoor prop starts
 * casting sun shadows again. This frame builds the set straight from `map.source.roofGroups`, so
 * it is complete whatever the player is standing in; the renderer, which sees only the frame,
 * rebuilds the same set from `shelterCells` united with `roofedCells`.
 */
export function shelteredTileKeys(
  cells: readonly Readonly<{ x: number; y: number; width: number; height: number }>[],
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const cell of cells) {
    for (let y = cell.y; y < cell.y + cell.height; y += 1) {
      for (let x = cell.x; x < cell.x + cell.width; x += 1) keys.add(`${x},${y}`);
    }
  }
  return keys;
}

/**
 * Indoors the sun is occluded, so a character's cast collapses to the anchor and only the tuned
 * contact ellipse remains. Overhead lamps do not rake, and a sun-directional shadow in a roofed
 * room is simply wrong: it swung west at dawn and east at dusk under a roof the light never
 * crossed.
 *
 * ponytail: no per-lamp shadow casting indoors — the lamp glow carries the room. Add real
 * lamp-relative casts only if a room reads flat once the glow work lands.
 */
const INDOOR_CHARACTER_CAST = Object.freeze({ x: 5, y: 1 });

function propShadows(
  props: readonly WorldPropPlacement[],
  color: string,
  sheltered: ReadonlySet<string>,
): readonly WorldPropShadow[] {
  const groups = new Map<string, WorldPropPlacement[]>();
  for (const prop of props) {
    if (prop.isDoor) continue;
    const parts = groups.get(prop.objectId);
    if (parts) parts.push(prop);
    else groups.set(prop.objectId, [prop]);
  }
  return [...groups].flatMap(([id, parts]) => {
    const remaining = new Set(parts);
    const clusters: WorldPropPlacement[][] = [];
    while (remaining.size > 0) {
      const seed = remaining.values().next().value as WorldPropPlacement;
      const cluster = [seed];
      remaining.delete(seed);
      for (let index = 0; index < cluster.length; index += 1) {
        const current = cluster[index]!;
        for (const candidate of remaining) {
          if (Math.abs(current.worldX - candidate.worldX) <= TILE_SIZE && Math.abs(current.worldY - candidate.worldY) <= TILE_SIZE) {
            cluster.push(candidate);
            remaining.delete(candidate);
          }
        }
      }
      clusters.push(cluster);
    }
    return clusters.map((cluster, index) => {
      const bottom = Math.max(...cluster.map(({ worldY }) => worldY));
      const feet = cluster.filter(({ worldY }) => worldY === bottom);
      const left = Math.min(...feet.map(({ worldX }) => worldX));
      const right = Math.max(...feet.map(({ sprite, worldX }) => worldX + propShadowWidth(sprite)));
      return {
        id: `${id}-${index}`,
        // A long shadow IS the sun's shadow, so a sheltered cluster does not get one. The flat
        // base strip still draws, which is what keeps an indoor lamp sitting on the floor.
        long: !cluster.some(({ tile }) => sheltered.has(tileKey(tile))) &&
          cluster.some(({ sprite }) => /(lamp|neon|planter|sign|tree|palm|sapling)/u.test(sprite)),
        width: right - left,
        worldX: left,
        worldY: bottom + 25,
        color,
      };
    });
  });
}

function staticFrameLists(
  map: CompiledMapV2,
  artMode: WorldArtMode,
  visibility: VisibleTileBounds,
  visibleRoofGroupIds: readonly string[],
): StaticFrameLists {
  const key = [
    artMode,
    visibility.minimumX,
    visibility.minimumY,
    visibility.maximumX,
    visibility.maximumY,
    visibleRoofGroupIds.join(','),
  ].join(':');
  let mapCache = STATIC_FRAME_LISTS.get(map);
  const cached = mapCache?.get(key);
  if (cached) return cached;

  // ONE QUAD PER TILE, ALWAYS AT 1:1.
  //
  // This used to find uniform 2x2 or 3x3 composition blocks and draw a single 32x32 sprite
  // MAGNIFIED across the whole block. That made ground texels two or three times the size of the
  // prop and character texels standing on them, and it varied tile by tile — 89% of downtown's
  // floor quads were already 1:1 while its blocks were not — so a single screen carried two
  // different ground resolutions at once.
  //
  // It also contradicted the art spec, which is what settled it:
  // `docs/specs/2026-08-11-art-quality.md` records the selected ground variant PER TILE (:480) and
  // rules out "a visible repeating mega-tile" (:266). A 32x32 sprite blown up to 96x96 is exactly
  // that. So this is a drift fix, not new art detail, and the locked minimalist style is intact.
  //
  // `compositionSize` and `logicalVariantId` are deliberately left alone in `src/world`, so the
  // presentation hash, `content:check` and `art:check` are all untouched. Only the DRAW changes.
  const floors: WorldFloorPlacement[] = [];
  for (let y = 0; y < map.source.height; y += 1) {
    for (let x = 0; x < map.source.width; x += 1) {
      const tile = { x, y };
      const cell = presentationGroundAt(map.presentation, tile, map.source.width);
      if (!visualBoundsIntersectTileWindow(tile, cell.visualBounds, visibility)) continue;
      const sprite = artMode === 'legacy' ? groundSpriteAtV2(map, tile) : cell.sprite;
      floors.push({
        ...placement({ id: `floor-${x}-${y}`, sprite, worldX: x * TILE_SIZE, worldY: y * TILE_SIZE, layer: 'floor' }),
        tile,
        mask: null,
        kind: 'floor',
      });
    }
  }

  const groundDetails: WorldFloorPlacement[] = artMode === 'legacy' ? [] : [
    ...map.presentation.transitions.flatMap((transition) => transition.sprite ? [{
      id: transition.id,
      kind: 'transition' as const,
      mask: transition.cornerMask,
      offsetX: 0,
      offsetY: 0,
      sprite: transition.sprite,
      tile: transition.tile,
    }] : []),
    ...map.presentation.decals.map((decal) => ({
      id: decal.id,
      kind: 'decal' as const,
      mask: null,
      offsetX: decal.offsetX,
      offsetY: decal.offsetY,
      sprite: decal.sprite,
      tile: decal.tile,
    })),
  ].filter(({ tile, sprite }) => visualBoundsIntersectTileWindow(
    tile,
    map.presentation.visualBoundsBySprite[sprite] ?? { left: 0, top: 0, right: 32, bottom: 32 },
    visibility,
  )).map((detail) => ({
    ...placement({
      id: detail.id,
      sprite: detail.sprite,
      worldX: detail.tile.x * TILE_SIZE + detail.offsetX,
      worldY: detail.tile.y * TILE_SIZE + detail.offsetY,
      layer: 'floor',
    }),
    tile: { ...detail.tile },
    mask: detail.mask,
    kind: detail.kind,
  }));
  const props = [...map.objectPartById.values()].filter(({ tile, sprite }) => visualBoundsIntersectTileWindow(
    tile,
    map.presentation.visualBoundsBySprite[sprite] ?? { left: 0, top: 0, right: 32, bottom: 32 },
    visibility,
  )).map((part): WorldPropPlacement => ({
    ...placement({ id: part.id, sprite: part.sprite, worldX: part.tile.x * TILE_SIZE, worldY: part.tile.y * TILE_SIZE, layer: 'prop' }),
    isDoor: false,
    objectId: part.objectId,
    tile: { ...part.tile },
  }));
  const walls = map.wallTiles.filter(({ tile }) => isVisible(tile, visibility))
    .sort((left, right) => compareWorldLayerTiles(WORLD_DEPTH.wall, left, right))
    .map((wall): WorldWallPlacement => ({
      ...placement({ id: wall.id, sprite: wall.sprite, worldX: wall.tile.x * TILE_SIZE, worldY: wall.tile.y * TILE_SIZE, layer: 'wall' }),
      adjacencyMask: wall.adjacencyMask,
      exposedBase: !map.wallTiles.some(({ tile }) => tile.x === wall.tile.x && tile.y === wall.tile.y + 1),
      tile: { ...wall.tile },
    }));
  const roofs = map.presentation.roofs
    .filter(({ roofGroupId }) => visibleRoofGroupIds.includes(roofGroupId))
    .filter(({ tile, visualBounds }) => visualBoundsIntersectTileWindow(tile, visualBounds, visibility))
    .map((roof): WorldRoofPlacement => ({
      ...placement({ id: roof.id, sprite: roof.sprite, worldX: roof.tile.x * TILE_SIZE, worldY: roof.tile.y * TILE_SIZE, layer: 'roof' }),
      roofGroupId: roof.roofGroupId,
      tile: { ...roof.tile },
    }));
  const built = deepFreeze({ floors, groundDetails, props, walls, roofs });
  if (!mapCache) {
    mapCache = new Map();
    STATIC_FRAME_LISTS.set(map, mapCache);
  }
  // ponytail: 32 recent tile windows bound memory; revisit only if camera profiling shows churn.
  // Halved from 64 when floors went 1:1: each cached window now holds about two and a half times
  // the placements it used to, so the same bound would hold about two and a half times the memory.
  if (mapCache.size >= 32) mapCache.delete(mapCache.keys().next().value as string);
  mapCache.set(key, built);
  return built;
}

function effectColor(kind: VfxKind): string {
  return kind === 'fire' ? '#f07832'
    : kind === 'insects' ? '#ffe889'
      : kind === 'leaves' ? '#e0a14e'
        : kind === 'neon' ? '#ff67d9'
          : kind === 'palm' ? '#86a451'
            : kind === 'steam' ? '#fff0d6'
              : kind === 'water' ? '#8ef1e6'
                : '#f5dd9d';
}

export function compareWorldLayerTiles(
  layer: number,
  left: Readonly<{ id: string; tile: TilePoint }>,
  right: Readonly<{ id: string; tile: TilePoint }>,
): number {
  return compareDepth(
    { id: left.id, layer, tileY: left.tile.y },
    { id: right.id, layer, tileY: right.tile.y },
  );
}

export function doorSpriteForFrame(
  door: CompiledDoorV2,
  movements: readonly MovementState[],
): string {
  if (door.initialState !== 'closed-unlocked') return door.sprite;
  const phases = movements.map((movement) => doorMotionPhase(movement, door.id));
  const open = phases.includes('open') || movements.some((movement) => (
    tileKey(movement.player) === tileKey(door.tile)
  ));
  if (open) return door.sprite.replace('closed-door', 'open-door');
  return phases.some((phase) => phase === 'opening' || phase === 'closing')
    ? door.sprite.replace('closed-door', 'opening-door')
    : door.sprite;
}

/**
 * The scripted shooting scene's pose, or undefined for every ordinary pose.
 *
 * `falling` and `down` are NOT zeroed under reduced motion: a shot character left standing upright
 * is a state error, not a reduction in motion. `fallPose` snaps to the terminal angle instead.
 */
function impactMotionPose(
  pose: CharacterPose,
  poseProgress: number,
  poseDirection: -1 | 1,
  reducedMotion: boolean,
): ImpactPose | undefined {
  const input = { poseProgress, poseDirection, reducedMotion };
  if (pose === 'impact') return impactPose(input);
  if (pose === 'recoil') return recoilPose(input);
  if (pose === 'falling') return fallPose(input);
  if (pose === 'down') return downPose(poseDirection);
  return undefined;
}

export const DESTINATION_PULSE_MS = 520;

export function destinationPulseFrame(elapsedMs: number): Readonly<{
  complete: boolean;
  opacity: number;
  radius: number;
}> {
  const progress = Math.max(0, Math.min(1, elapsedMs / DESTINATION_PULSE_MS));
  const phase = progress === 1 ? 1 : (progress * 2) % 1;
  return {
    complete: progress === 1,
    opacity: 0.72 * (1 - phase),
    radius: 3 + 13 * phase,
  };
}

export function buildWorldFrameState(
  map: CompiledMapV2,
  state: WorldState,
  actors: WorldActors,
  direction: MovementDirection,
  frame: 0 | 1,
  playerPresentation?: Readonly<{
    visualFoot: WorldPoint;
    walkFrame: 0 | 1;
    moving: boolean;
    reducedMotion: boolean;
    horizontalRunDistance?: number;
    pose?: CharacterPose;
    poseFrame?: 0 | 1;
    travelDistance?: number;
    turnCurve?: TurnCurve;
    stopProgress?: number;
    poseProgress?: number;
    poseDirection?: -1 | 1;
  }>,
  viewInput?: Partial<WorldFrameView>,
): WorldFrameState {
  const playerPosition = state.protagonist.worldPosition;
  if (playerPosition.mapId !== map.source.id) {
    throw new Error(`World frame map ${map.source.id} does not own the protagonist.`);
  }
  const playerTile = { x: playerPosition.tileX, y: playerPosition.tileY };
  const playerFoot = playerPresentation?.visualFoot ?? {
    x: playerTile.x * TILE_SIZE + 16,
    y: playerTile.y * TILE_SIZE + 29,
  };
  const view: WorldFrameView = {
    camera: { x: 0, y: 0, zoom: 1 },
    viewport: { width: map.source.width * TILE_SIZE, height: map.source.height * TILE_SIZE },
    devicePixelRatio: 1,
    artMode: 'enhanced',
    movements: [],
    selectedFoot: playerFoot,
    destinationPulseElapsedMs: 0,
    reducedMotion: playerPresentation?.reducedMotion ?? false,
    animationTimestampMilliseconds: 0,
    vfxAgeStep: 0,
    vfxMode: 'procedural',
    ...viewInput,
  };
  if (!Number.isFinite(view.animationTimestampMilliseconds) || view.animationTimestampMilliseconds < 0) {
    throw new Error('Frame animation time must be a finite non-negative number.');
  }
  if (!Number.isInteger(view.vfxAgeStep) || view.vfxAgeStep < 0) {
    throw new Error('Frame VFX age step must be a non-negative integer.');
  }
  const characterInputs: Readonly<{
    id: string;
    visualId: CharacterId;
    tile: TilePoint;
    direction: MovementDirection;
    visualFoot?: WorldPoint;
    walkFrame: 0 | 1;
    moving: boolean;
    reducedMotion: boolean;
    horizontalRunDistance: number;
    pose: CharacterPose;
    poseFrame: 0 | 1;
    travelDistance: number;
    turnCurve?: TurnCurve;
    stopProgress?: number;
    poseProgress: number;
    poseDirection: -1 | 1;
  }>[] = [
    {
      id: 'protagonist',
      visualId: 'protagonist',
      tile: playerTile,
      direction,
      visualFoot: playerPresentation?.visualFoot,
      walkFrame: playerPresentation?.walkFrame ?? frame,
      moving: playerPresentation?.moving ?? frame === 1,
      reducedMotion: playerPresentation?.reducedMotion ?? false,
      horizontalRunDistance: playerPresentation?.horizontalRunDistance ?? 0,
      pose: playerPresentation?.pose ?? 'idle',
      poseFrame: playerPresentation?.poseFrame ?? 0,
      travelDistance: playerPresentation?.travelDistance ?? 0,
      turnCurve: playerPresentation?.turnCurve,
      stopProgress: playerPresentation?.stopProgress,
      poseProgress: playerPresentation?.poseProgress ?? 0,
      poseDirection: playerPresentation?.poseDirection ?? 1,
    },
    ...Object.entries(actors).sort(([left], [right]) => left.localeCompare(right, 'en')).map(([id, actor]) => ({
      id,
      visualId: actor.visualId,
      tile: actor.tile,
      direction: actor.direction ?? 'down',
      visualFoot: actor.visualFoot,
      walkFrame: actor.walkFrame ?? 0,
      moving: actor.moving ?? false,
      reducedMotion: actor.reducedMotion ?? false,
      horizontalRunDistance: actor.horizontalRunDistance ?? 0,
      pose: actor.pose ?? 'idle',
      poseFrame: actor.poseFrame ?? 0,
      travelDistance: actor.travelDistance ?? 0,
      turnCurve: actor.turnCurve,
      stopProgress: actor.stopProgress,
      poseProgress: actor.poseProgress ?? 0,
      poseDirection: actor.poseDirection ?? 1,
    })),
  ];
  const allCharacters = characterInputs.map(({
    id,
    visualId,
    tile,
    direction: actorDirection,
    visualFoot,
    walkFrame,
    moving,
    reducedMotion,
    horizontalRunDistance,
    pose,
    poseFrame,
    travelDistance,
    turnCurve,
    stopProgress,
    poseProgress,
    poseDirection,
  }): WorldCharacterPlacement => {
    // Reduced motion pins the idle pose. It already zeroes lean, bob and bounce below, but the
    // frame index itself used to be safe to leave alone because both cells of a pair held the
    // same pixels. They carry a real walk cycle now, so without this a reduced-motion player
    // gets the stepping they asked not to see.
    const actorFrame = reducedMotion ? 0 : moving ? walkFrame : pose === 'idle' ? 0 : poseFrame;
    const presentation = movementPresentation(visualId, actorDirection, actorFrame);
    const foot = visualFoot ?? { x: tile.x * TILE_SIZE + 16, y: tile.y * TILE_SIZE + 29 };
    const leanX = reducedMotion ? 0 : presentation.leanX;
    const poseLift = reducedMotion || moving ? 0 : pose === 'reaction' ? -2 : poseFrame === 1 ? -1 : 0;
    // The gait bob is snapped HERE rather than with the foot. `snapWorldPoint` already put the foot
    // on the device-pixel lattice back in the scene, before this builder ran, so snapping the bob on
    // its own keeps the sum on that same lattice and the sprite never lands between texels.
    const gaitBob = snapWorldPoint(
      { x: 0, y: gaitBobPixels({ travelDistance, moving, reducedMotion }) },
      view.camera.zoom,
      view.devicePixelRatio,
    ).y;
    const impact = impactMotionPose(pose, poseProgress, poseDirection, reducedMotion);
    const bounceY = reducedMotion ? 0 : presentation.bounceY + poseLift + gaitBob;
    const shadowX = reducedMotion ? 0 : presentation.shadowX;
    const walkAngleDegrees = gaitAngleDegrees(
      protagonistWobbleDegrees({
        direction: actorDirection,
        status: 'moving',
        horizontalRunDistance,
        reducedMotion,
      }),
      gaitTurnLeanDegrees({ turnCurve, foot, reducedMotion }),
      gaitStopLeanDegrees({ direction: actorDirection, stopProgress, reducedMotion }),
    );
    const angleDegrees = impact
      ? impact.angleDegrees
      : moving
        ? walkAngleDegrees
        : reducedMotion ? 0 : pose === 'reaction' ? -4 : pose === 'talk' && poseFrame === 1 ? 2 : 0;
    return {
      // Technique 4b is applied HERE, in the character mapper, and NOT through the prop shift.
      // The prop shift is bounds-based; a character must scale about its wobble pivot or the
      // rotation centre moves with the size.
      ...placement({
        id,
        sprite: presentation.sprite,
        layer: 'character',
        pivot: PROTAGONIST_WOBBLE_PIVOT,
        rotationDegrees: angleDegrees,
        ...withAuthoredCharacterScale(
          foot.x - 12 + leanX + (impact?.offsetX ?? 0),
          foot.y - 27 + bounceY + (impact?.offsetY ?? 0),
        ),
      }),
      visualId,
      tile: { ...tile },
      shadowWorldX: foot.x - 7 + shadowX,
      shadowWorldY: foot.y,
      angleDegrees,
      gaitBobPixels: reducedMotion ? 0 : gaitBob,
    };
  }).sort((left, right) => left.shadowWorldY - right.shadowWorldY || left.id.localeCompare(right.id, 'en'));
  const hiddenRoofGroupId = roofGroupAtV2(map, playerTile);
  const visibleRoofGroupIds = map.source.roofGroups
    .filter(({ id }) => id !== hiddenRoofGroupId)
    .map(({ id }) => id);
  const visibility = visibleTileBounds(view.camera, view.viewport);
  const characters = allCharacters.filter(({ tile }) => isVisible(tile, visibility));
  const { floors, groundDetails, props: staticProps, walls, roofs } = staticFrameLists(
    map,
    view.artMode,
    visibility,
    visibleRoofGroupIds,
  );

  const allProps: WorldPropPlacement[] = [
    ...staticProps,
    ...[...map.doorById.values()].filter(({ tile, sprite }) => visualBoundsIntersectTileWindow(
      tile,
      map.presentation.visualBoundsBySprite[sprite] ?? { left: 0, top: 0, right: 32, bottom: 32 },
      visibility,
    )).map((door): WorldPropPlacement => {
      const sprite = doorSpriteForFrame(door, view.movements);
      return {
        ...placement({ id: door.id, sprite, worldX: door.tile.x * TILE_SIZE, worldY: door.tile.y * TILE_SIZE, layer: 'prop' }),
        isDoor: true,
        objectId: door.id,
        tile: { ...door.tile },
      };
    }),
  ].sort((left, right) => compareWorldLayerTiles(WORLD_DEPTH.prop, left, right));
  // The authored scale is applied HERE, to the rendered list only.
  //
  // `allProps` stays unscaled, and `propShadows` reads it further down. That ordering is
  // load-bearing: `propShadows` derives its position from each prop's `worldY`, so scaling the
  // shared list would carry every contact shadow up with the origin and detach it from the feet it
  // belongs to. Doors are excluded because a door is not furniture.
  const props = allProps.filter(({ isDoor }) => !isDoor).map(withAuthoredPropScale);
  const doors = allProps.filter(({ isDoor }) => isDoor);
  const groundedOrder: WorldGroundedEntry[] = [
    ...props.map((prop) => ({ groundY: (prop.tile.y + 1) * TILE_SIZE, id: prop.id, kind: 'prop' as const })),
    ...characters.map((character) => ({ groundY: character.shadowWorldY, id: character.id, kind: 'character' as const })),
  ].sort(compareGroundedDepth);

  const lightingSource = districtLighting(map.source.id as MapId, state.clock.absoluteMinute);
  const lighting: DistrictLighting = {
    ...lightingSource,
    casters: lightingSource.casters.map((caster) => ({ ...caster })),
    pools: lightingSource.pools.map((pool) => ({ ...pool })),
    shadow: { ...lightingSource.shadow },
    sun: { ...lightingSource.sun },
  };
  const atmosphere = { ...worldAtmosphere(state.clock.absoluteMinute) };
  const activeEffects = map.source.effects.filter((effect) => mapEffectVisible(effect.kind, state.clock.absoluteMinute));
  const vfxViewport = {
    left: view.camera.x - TILE_SIZE,
    top: view.camera.y - TILE_SIZE,
    right: view.camera.x + view.viewport.width / view.camera.zoom + TILE_SIZE,
    bottom: view.camera.y + view.viewport.height / view.camera.zoom + TILE_SIZE,
  };
  const visibleEffects = activeEffects.filter((effect) => vfxBoundsIntersectWorldRect(effect, vfxViewport));
  const culledEffects = activeEffects.filter((effect) => !vfxBoundsIntersectWorldRect(effect, vfxViewport));
  const emitters = partitionVfxEmitters(map.source.id, visibleEffects);
  const effects = view.vfxMode === 'procedural'
    ? emitters.valid.map((emitter) => sampleVfxGeometry(
      emitter,
      view.vfxAgeStep * VFX_STEP_MILLISECONDS,
      view.reducedMotion,
    ))
    : [];
  const fallbackSource: readonly AuthoredMapEffect[] = view.vfxMode === 'procedural'
    ? emitters.fallback
    : visibleEffects;
  const fallbackEffects = fallbackSource.map((effect): WorldFallbackEffect => ({
    id: effect.id,
    kind: effect.kind,
    tile: { ...effect.tile },
    worldX: effect.tile.x * TILE_SIZE + 16,
    worldY: effect.tile.y * TILE_SIZE + 16,
    color: effectColor(effect.kind),
  }));
  const shelteredKeys = shelteredTileKeys(
    map.source.roofGroups.flatMap(({ interiorCells }) => interiorCells),
  );
  const characterShadows = characters.map((character): WorldCharacterShadow => {
    const indoors = shelteredKeys.has(tileKey(character.tile));
    return {
      id: character.id,
      worldX: character.shadowWorldX,
      worldY: character.shadowWorldY,
      castX: indoors ? INDOOR_CHARACTER_CAST.x : lighting.shadow.x,
      castY: indoors ? INDOOR_CHARACTER_CAST.y : lighting.shadow.y,
      color: lighting.shadow.color,
    };
  });
  const doorAnchors = doors.map((door) => {
    const openingId = map.doorById.get(door.id)?.openingId;
    return {
      id: door.id,
      worldX: door.worldX,
      worldY: door.worldY,
      horizontal: map.wallOpeningById.get(openingId ?? '')?.orientation !== 'vertical',
    };
  });
  const journalMarkers = journalMapMarkers(state.journal, map).map((marker) => ({
    ...marker,
    tile: { ...marker.tile },
    darkColor: '#201915',
    lightColor: '#f1c65b',
  }));
  const pulse = view.destinationMarker ? destinationPulseFrame(view.destinationPulseElapsedMs) : undefined;
  const counts = {
    floor: floors.length + groundDetails.length,
    prop: allProps.length,
    shadow: characters.length,
    character: characters.length,
    effect: visibleEffects.length,
    wall: walls.length,
    roof: roofs.length,
  };
  const frameState: WorldFrameState = {
    schemaVersion: 1,
    mapId: map.source.id,
    mapHash: worldMapHash(map),
    presentationHash: map.presentation.hash,
    atlasHash: ATLAS_INDEX.image.sha256,
    stateRevision: state.revision,
    camera: { ...view.camera },
    viewport: { ...view.viewport },
    devicePixelRatio: view.devicePixelRatio,
    mapTiles: { width: map.source.width, height: map.source.height },
    reducedMotion: view.reducedMotion,
    animationTimestampMilliseconds: view.animationTimestampMilliseconds,
    vfxAgeStep: view.vfxAgeStep,
    layerOrder: [...WORLD_LAYER_ORDER],
    compositeOrder: [...WORLD_COMPOSITE_ORDER],
    floors,
    groundDetails,
    props,
    doors,
    characters,
    effects,
    effectRoleColors: { ...VFX_ROLE_COLORS },
    fallbackEffects,
    // Undefined, never [], when idle. See the field comment on `WorldFrameView`.
    ...(view.transientEffects?.length ? { transientEffects: view.transientEffects.map((entry) => ({ ...entry })) } : {}),
    ...(view.transientGlows?.length ? { transientGlows: view.transientGlows.map((entry) => ({ ...entry })) } : {}),
    walls,
    roofs,
    groundedOrder,
    // Reads the UNSCALED allProps, so a scaled prop keeps its shadow under its feet.
    propShadows: propShadows(allProps, lighting.shadow.color, shelteredKeys),
    characterShadows,
    doorWear: doorAnchors.map((primitive) => ({
      ...primitive,
      darkColor: '#2c26204f',
      lightColor: '#f0c16a3d',
    })),
    thresholds: doorAnchors.map((primitive) => ({
      ...primitive,
      darkColor: '#15120f8c',
      lightColor: `${lighting.accent}8c`,
    })),
    wallBases: walls.filter(({ exposedBase }) => exposedBase).map((wall) => ({
      id: wall.id,
      worldX: wall.worldX,
      worldY: wall.worldY,
      darkColor: '#1714109c',
      lightColor: `${lighting.accent}52`,
    })),
    selectionRing: {
      id: 'selection-ring',
      worldX: view.selectedFoot.x,
      worldY: view.selectedFoot.y,
      radiusX: 17 * Math.min(1.5, view.camera.zoom) / view.camera.zoom,
      radiusY: 9 * Math.min(1.5, view.camera.zoom) / view.camera.zoom,
      color: lighting.accent,
      strokeWidth: 3,
    },
    destinationPulse: view.destinationMarker && pulse ? {
      id: 'destination-pulse',
      worldX: view.destinationMarker.x * TILE_SIZE + 16,
      worldY: view.destinationMarker.y * TILE_SIZE + 29,
      opacity: pulse.opacity,
      radius: pulse.radius,
      color: '#f5dd9d',
    } : undefined,
    journalMarkers,
    failureMarker: view.failureTile ? {
      id: 'failure-marker',
      worldX: view.failureTile.x * TILE_SIZE + 16,
      worldY: view.failureTile.y * TILE_SIZE + 16,
      radiusPixels: 7,
      color: '#ef5b43',
    } : undefined,
    hiddenRoofGroupId,
    visibleRoofGroupIds,
    shelterCells: map.source.roofGroups.find(({ id }) => id === hiddenRoofGroupId)?.interiorCells.map((cell) => ({ ...cell })) ?? [],
    // Interior cells of roof groups that are still presented. The player cannot see into these
    // rooms, so a renderer must not spill their lamp light outward.
    roofedCells: map.source.roofGroups
      .filter(({ id }) => visibleRoofGroupIds.includes(id))
      .flatMap(({ interiorCells }) => interiorCells.map((cell) => ({ ...cell }))),
    lighting,
    atmosphere,
    visibleEffectIds: visibleEffects.map(({ id }) => id).sort((left, right) => left.localeCompare(right, 'en')),
    culledEffectIds: culledEffects.map(({ id }) => id).sort((left, right) => left.localeCompare(right, 'en')),
    fallbackEmitterIds: emitters.fallback.map(({ id }) => id).sort((left, right) => left.localeCompare(right, 'en')),
    drawCounts: {
      ...counts,
      total: Object.values(counts).reduce((total, count) => total + count, 0),
    },
  };
  return deepFreeze(frameState);
}
