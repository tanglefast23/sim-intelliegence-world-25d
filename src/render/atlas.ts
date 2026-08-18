import atlasIndexJson from '../../assets/generated/atlas-index.json';

export const CHARACTER_IDS = [
  'devon-price',
  'elise-moreau',
  'generic-resident',
  'linda',
  'linda-boyfriend',
  'mina-park',
  'priya-nair',
  'protagonist',
  'rafael-cruz',
  'resident-01',
  'resident-02',
  'resident-03',
  'resident-04',
  'resident-05',
  'resident-06',
  'resident-07',
  'resident-08',
  'resident-09',
  'resident-10',
  'resident-11',
  'resident-12',
  'resident-13',
  'resident-14',
  'resident-15',
  'resident-16',
  'resident-17',
  'resident-18',
  'resident-19',
  'resident-20',
  'resident-21',
  'resident-22',
  'resident-23',
  'resident-24',
  'sora-tan',
  'tomas-reed',
] as const;
export type CharacterId = typeof CHARACTER_IDS[number];
export const MOVEMENT_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type MovementDirection = typeof MOVEMENT_DIRECTIONS[number];
export const ZOOM_LEVELS = [1, 2, 3] as const;
export type ZoomLevel = typeof ZOOM_LEVELS[number];
export const WALK_FRAME_MILLISECONDS = 145;
export const ART_REVISION = 16;

export type AtlasRectangle = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'world-character' | 'portrait' | 'tile';
  sourceId: string;
  cellClass: 'ground' | 'transparent-part' | null;
  wallAdjacencyMask: number | null;
  category: 'ground-base' | 'ground-transition' | 'ground-decal' | 'wall-door' | 'roof' |
    'object-landmark' | 'world-character' | 'world-character-eyes' | 'portrait' | 'effect-reserve';
  visibility: 'public' | 'internal-review';
}>;

export type RuntimeAtlasIndex = Readonly<{
  version: 3;
  artRevision: number;
  toolVersion: string;
  image: Readonly<{ width: number; height: number; colorType: 'rgba'; gutter: 1; sha256: string }>;
  tileSize: 32;
  worldCell: Readonly<{ width: 24; height: 30 }>;
  walkFrameMilliseconds: 145;
  zoomLevels: readonly [1, 2, 3];
  sprites: Readonly<Record<string, AtlasRectangle>>;
  publicSpriteIds: readonly string[];
  internalReviewSpriteIds: readonly string[];
  characters: Readonly<Record<CharacterId, Readonly<{
    displayName: string;
    portrait: string;
    portraits: Readonly<Record<string, string>>;
    frames: Readonly<Record<string, string>>;
    /** The closed-eye band overlaid during a blink. 24x3, rows 12-14 of the idle front cell. */
    eyes: string;
    sourceLayers: readonly string[];
  }>>>;
  tiles: readonly string[];
  groundCells: readonly string[];
  transparentPartCells: readonly string[];
  presentationCells: readonly string[];
  walls: Readonly<Record<string, readonly string[]>>;
  multiTileCompositions: Readonly<Record<string, readonly string[]>>;
}>;

export const ATLAS_INDEX = atlasIndexJson as unknown as RuntimeAtlasIndex;

if (
  ATLAS_INDEX.version !== 3 ||
  ATLAS_INDEX.artRevision !== ART_REVISION ||
  ATLAS_INDEX.image.colorType !== 'rgba' ||
  ATLAS_INDEX.image.gutter !== 1 ||
  !/^[0-9a-f]{64}$/u.test(ATLAS_INDEX.image.sha256) ||
  ATLAS_INDEX.walkFrameMilliseconds !== WALK_FRAME_MILLISECONDS ||
  ATLAS_INDEX.worldCell.width !== 24 ||
  ATLAS_INDEX.worldCell.height !== 30
) {
  throw new Error('Generated atlas does not satisfy the revisioned runtime contract.');
}

const publicSpriteIds = new Set(ATLAS_INDEX.publicSpriteIds);
const internalReviewSpriteIds = new Set(ATLAS_INDEX.internalReviewSpriteIds);
if (
  publicSpriteIds.size !== ATLAS_INDEX.publicSpriteIds.length ||
  internalReviewSpriteIds.size !== ATLAS_INDEX.internalReviewSpriteIds.length ||
  [...publicSpriteIds].some((id) => internalReviewSpriteIds.has(id)) ||
  publicSpriteIds.size + internalReviewSpriteIds.size !== Object.keys(ATLAS_INDEX.sprites).length ||
  ATLAS_INDEX.publicSpriteIds.some((id) => ATLAS_INDEX.sprites[id]?.visibility !== 'public') ||
  ATLAS_INDEX.internalReviewSpriteIds.some((id) => ATLAS_INDEX.sprites[id]?.visibility !== 'internal-review') ||
  Object.entries(ATLAS_INDEX.sprites).some(([id, rectangle]) =>
    rectangle.visibility === 'public' ? !publicSpriteIds.has(id) : !internalReviewSpriteIds.has(id))
) {
  throw new Error('Generated atlas visibility lists do not cover every sprite exactly once.');
}

export function atlasRectangle(name: string): AtlasRectangle {
  const rectangle = ATLAS_INDEX.sprites[name];
  if (!rectangle) {
    throw new Error(`Unknown atlas cell: ${name}`);
  }
  return rectangle;
}

export function characterFrameName(
  characterId: CharacterId,
  direction: MovementDirection,
  frame: 0 | 1,
): string {
  const facing = direction === 'up' ? 'rear' : direction === 'down' ? 'front' : direction;
  return `character.${characterId}.${facing}-${frame + 1}`;
}

export type MovementPresentation = Readonly<{
  sprite: string;
  leanX: -1 | 0 | 1;
  bounceY: -1 | 0;
  shadowX: -1 | 0 | 1;
}>;

export function movementPresentation(
  characterId: CharacterId,
  direction: MovementDirection,
  frame: 0 | 1,
): MovementPresentation {
  const leanX = frame === 1 && direction === 'left' ? -1 : frame === 1 && direction === 'right' ? 1 : 0;
  return {
    sprite: characterFrameName(characterId, direction, frame),
    leanX,
    bounceY: frame === 1 ? -1 : 0,
    shadowX: leanX,
  };
}

export function talkingBob(frame: 0 | 1): 0 | -1 {
  return frame === 1 ? -1 : 0;
}

export function assertZoomLevel(candidate: number): ZoomLevel {
  if (candidate !== 1 && candidate !== 2 && candidate !== 3) {
    throw new Error('Prototype zoom must be exactly 1x, 2x, or 3x.');
  }
  return candidate;
}

export const ATLAS_PROOF_BILL = ATLAS_INDEX.publicSpriteIds;

export type AtlasProofPlacement = Readonly<{
  sprite: string;
  x: number;
  y: number;
  scale: ZoomLevel;
}>;

export type AtlasProofShadow = Readonly<{
  x: number;
  y: number;
  width: number;
  scale: ZoomLevel;
}>;

const PROOF_PANELS: readonly Readonly<{
  x: number;
  y: number;
  scale: ZoomLevel;
  columns: number;
  rows: number;
}>[] = [
  { x: 18, y: 18, scale: 1, columns: 9, rows: 10 },
  { x: 310, y: 18, scale: 2, columns: 5, rows: 3 },
  { x: 680, y: 18, scale: 3, columns: 3, rows: 2 },
];

export function buildAtlasProofScene(frame: 0 | 1): Readonly<{
  sprites: readonly AtlasProofPlacement[];
  shadows: readonly AtlasProofShadow[];
}> {
  const sprites: AtlasProofPlacement[] = [];
  const shadows: AtlasProofShadow[] = [];
  const proofTiles = ATLAS_PROOF_BILL.filter((name) => atlasRectangle(name).cellClass === 'ground');
  const proofCast = ATLAS_PROOF_BILL.filter((name) => atlasRectangle(name).cellClass !== 'ground');
  const directions: readonly MovementDirection[] = ['right', 'left', 'up'];
  for (const panel of PROOF_PANELS) {
    for (let row = 0; row < panel.rows; row += 1) {
      for (let column = 0; column < panel.columns; column += 1) {
        sprites.push({
          sprite: proofTiles[(row * panel.columns + column) % proofTiles.length] as string,
          x: panel.x + column * 32 * panel.scale,
          y: panel.y + row * 32 * panel.scale,
          scale: panel.scale,
        });
      }
    }
    CHARACTER_IDS.forEach((characterId, characterIndex) => {
      const direction = directions[characterIndex % directions.length] as MovementDirection;
      const movement = movementPresentation(characterId, direction, frame);
      const tileX = Math.min(characterIndex + 1, panel.columns - 1);
      const tileY = Math.min(characterIndex % panel.rows, panel.rows - 1);
      const baseX = panel.x + tileX * 32 * panel.scale + 4 * panel.scale;
      const baseY = panel.y + tileY * 32 * panel.scale + 2 * panel.scale;
      shadows.push({
        x: baseX + (4 + movement.shadowX) * panel.scale,
        y: baseY + 27 * panel.scale,
        width: 16 * panel.scale,
        scale: panel.scale,
      });
      sprites.push({
        sprite: movement.sprite,
        x: baseX + movement.leanX * panel.scale,
        y: baseY + movement.bounceY * panel.scale,
        scale: panel.scale,
      });
    });
  }
  proofCast.forEach((sprite, index) => {
    sprites.push({
      sprite,
      x: 24 + (index % 9) * 62,
      y: 330 + Math.floor(index / 9) * 86,
      scale: 2,
    });
  });
  return { sprites, shadows };
}
