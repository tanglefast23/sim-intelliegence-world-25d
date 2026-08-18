import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  WORLD_CELL,
  addOutwardContour,
  composeEyeBand,
  composeFrontFrame,
  loadCharacterSources,
  loadMultiTileCompositions,
  loadPresentationCellSources,
  loadTransparentPartSources,
  loadTileSources,
  loadWallSources,
  renderDoorVariant,
  renderTile,
  renderWallVariant,
  tokenFrameToBitmap,
  type CharacterSource,
  type TokenFrame,
} from './character-source';
import { buildPortraitEntries } from './build-portrait-atlas';
import {
  loadArtManifest,
  loadArtPresentationRecipeManifest,
  loadArtPresentationRuntimeRecipes,
  type ArtCategoryId,
  type ArtPresentationRuntimeRecipes,
} from './art-manifest';
import { createAtlasBudgetReport, type AtlasBudgetReport } from './atlas-budget';
import { packAtlasRectangles } from './atlas-pack';
import { composeLateralFrame } from './lateral-legs';
import { protagonistReferenceFrames, type ProtagonistReferenceFrameId } from './protagonist-reference';
import {
  blit,
  blitWithExtrudedGutter,
  createBitmap,
  decodePng,
  encodePng,
  parseHexColor,
  setPixel,
  type Bitmap,
} from './png';
import { deriveRearFrame } from './rear-frame';

export const ATLAS_GUTTER = 1;
export const WALK_FRAME_MILLISECONDS = 145;
export const ZOOM_LEVELS = [1, 2, 3] as const;

export const WALK_DIRECTIONS = ['front', 'rear', 'left', 'right'] as const;
export const WALK_FRAMES = [1, 2] as const;

type Entry = Readonly<{
  name: string;
  sourceId: string;
  kind: 'world-character' | 'portrait' | 'tile';
  category: ArtCategoryId;
  visibility: 'public' | 'internal-review';
  cellClass: 'ground' | 'transparent-part' | null;
  wallAdjacencyMask: number | null;
  bitmap: Bitmap;
}>;

export type AtlasRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  kind: Entry['kind'];
  category: ArtCategoryId;
  visibility: Entry['visibility'];
  sourceId: string;
  cellClass: Entry['cellClass'];
  wallAdjacencyMask: number | null;
}>;

export type AtlasIndex = Readonly<{
  version: 3;
  artRevision: number;
  toolVersion: string;
  image: Readonly<{
    width: number;
    height: number;
    colorType: 'rgba';
    gutter: 1;
    sha256: string;
  }>;
  tileSize: 32;
  worldCell: typeof WORLD_CELL;
  walkFrameMilliseconds: 145;
  zoomLevels: typeof ZOOM_LEVELS;
  sprites: Readonly<Record<string, AtlasRect>>;
  publicSpriteIds: readonly string[];
  internalReviewSpriteIds: readonly string[];
  characters: Readonly<Record<string, Readonly<{
    displayName: string;
    portrait: string;
    portraits: Readonly<Record<string, string>>;
    frames: Readonly<Record<string, string>>;
    eyes: string;
    sourceLayers: readonly ['legs', 'torso-and-clothing', 'head-and-face', 'hair', 'accessory', 'held-item'];
  }>>>;
  tiles: readonly string[];
  groundCells: readonly string[];
  transparentPartCells: readonly string[];
  presentationCells: readonly string[];
  walls: Readonly<Record<string, readonly string[]>>;
  multiTileCompositions: Readonly<Record<string, readonly string[]>>;
}>;

export type AtlasGenerationReport = AtlasBudgetReport & Readonly<{
  indexVersion: 3;
  toolVersion: string;
  imageSha256: string;
  publicSpriteCount: number;
  internalReviewSpriteCount: number;
}>;

function worldEntries(source: CharacterSource): Entry[] {
  const front = composeFrontFrame(source, 0);
  const frontStride = composeFrontFrame(source, 1);
  const generatedFrames: Readonly<Record<ProtagonistReferenceFrameId, TokenFrame>> = {
    'front-1': front,
    'front-2': frontStride,
    'rear-1': deriveRearFrame(front, source),
    'rear-2': deriveRearFrame(frontStride, source),
    'left-1': composeLateralFrame(source, 'left', 0),
    'left-2': composeLateralFrame(source, 'left', 1),
    'right-1': composeLateralFrame(source, 'right', 0),
    'right-2': composeLateralFrame(source, 'right', 1),
  };
  const authoredFrames = protagonistReferenceFrames(source.id);
  const tokenFrames = authoredFrames ?? generatedFrames;
  const frameEntries: Entry[] = Object.entries(tokenFrames).map(([frame, tokens]) => ({
    name: `character.${source.id}.${frame}`,
    sourceId: source.id,
    kind: 'world-character' as const,
    category: 'world-character' as const,
    visibility: 'public' as const,
    cellClass: null,
    wallAdjacencyMask: null,
    bitmap: authoredFrames
      ? tokenFrameToBitmap(tokens, source.palette)
      : addOutwardContour(
        tokenFrameToBitmap(tokens, source.palette),
        parseHexColor(source.palette.K as string),
        true,
      ),
  }));
  /**
   * The blink overlay: rows 12-14 of the idle front cell with the eyes closed.
   *
   * No `addOutwardContour`. A contour on a three-row strip would draw an outline through the
   * middle of the face; the band's transparent edges let the body cell's own contour show
   * through instead. `cellClass` stays `null` like every other character cell, so these never
   * land in `transparentPartCells`, which is a wall and tile list.
   */
  const eyeBand: Entry = {
    name: `character.${source.id}.eyes`,
    sourceId: source.id,
    kind: 'world-character' as const,
    category: 'world-character-eyes' as const,
    visibility: 'public' as const,
    cellClass: null,
    wallAdjacencyMask: null,
    bitmap: tokenFrameToBitmap(composeEyeBand(source), source.palette),
  };
  return [...frameEntries, eyeBand];
}

function renderTransitionMask(
  familyId: string,
  mask: number,
  palette: Readonly<{ light: string; mid: string; shade: string }>,
): Bitmap {
  const bitmap = createBitmap(32, 32);
  const recipeColor = (source: string): readonly [number, number, number, number] => {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(source);
    if (!match) return parseHexColor(source);
    return [1, 2, 3, 4].map((index) => Number.parseInt(match[index] as string, 16)) as unknown as readonly [number, number, number, number];
  };
  const colors = [recipeColor(palette.light), recipeColor(palette.mid), recipeColor(palette.shade)] as const;
  const edges = [
    { bits: 1 | 2, axis: 'horizontal', fixed: 0, direction: 1 },
    { bits: 2 | 4, axis: 'vertical', fixed: 31, direction: -1 },
    { bits: 4 | 8, axis: 'horizontal', fixed: 31, direction: -1 },
    { bits: 8 | 1, axis: 'vertical', fixed: 0, direction: 1 },
  ] as const;
  const connectedBits = new Set<number>();
  for (const edge of edges) {
    if ((mask & edge.bits) !== edge.bits) continue;
    for (const bit of [1, 2, 4, 8]) if ((edge.bits & bit) !== 0) connectedBits.add(bit);
    for (let position = 0; position < 32; position += 1) {
      const softGap = familyId === 'soft' && (position + edge.bits * 3) % 11 <= 1;
      if (softGap) continue;
      const softWave = familyId === 'soft' ? ((position * 5 + edge.bits) % 7 === 0 ? 1 : 0) : 0;
      const thickness = familyId === 'soft' ? 2 : 4;
      for (let depth = 0; depth < thickness; depth += 1) {
        const fixed = edge.fixed + edge.direction * (depth + softWave);
        if (fixed < 0 || fixed >= 32) continue;
        const x = edge.axis === 'horizontal' ? position : fixed;
        const y = edge.axis === 'horizontal' ? fixed : position;
        setPixel(bitmap, x, y, colors[Math.min(depth, 2)] as readonly [number, number, number, number]);
      }
    }
  }
  const corners = [
    { bit: 1, originX: 0, originY: 0, directionX: 1, directionY: 1 },
    { bit: 2, originX: 31, originY: 0, directionX: -1, directionY: 1 },
    { bit: 4, originX: 31, originY: 31, directionX: -1, directionY: -1 },
    { bit: 8, originX: 0, originY: 31, directionX: 1, directionY: -1 },
  ] as const;
  for (const corner of corners) {
    if ((mask & corner.bit) === 0 || connectedBits.has(corner.bit)) continue;
    for (let localY = 0; localY < 9; localY += 1) {
      for (let localX = 0; localX < 9; localX += 1) {
        const distance = localX + localY;
        const inBand = distance >= 5 && distance <= (familyId === 'soft' ? 6 : 8);
        const softGap = familyId === 'soft' && (localX * 3 + localY * 5 + corner.bit) % 9 === 0;
        if (!inBand || softGap) continue;
        setPixel(
          bitmap,
          corner.originX + localX * corner.directionX,
          corner.originY + localY * corner.directionY,
          colors[Math.min(distance - 5, 2)] as readonly [number, number, number, number],
        );
      }
    }
  }
  return bitmap;
}

function cropBitmap(source: Bitmap, x: number, y: number, width: number, height: number): Bitmap {
  const output = createBitmap(width, height);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * source.width + x) * 4;
    source.data.copy(output.data, row * width * 4, sourceStart, sourceStart + width * 4);
  }
  return output;
}

function composeAndSplitMultiTileEntries(
  entries: readonly Entry[],
  compositions: ReturnType<typeof loadMultiTileCompositions>,
): Entry[] {
  const bySourceId = new Map(entries.map((entry) => [entry.sourceId, entry]));
  const replacements = new Map<string, Bitmap>();
  for (const composition of compositions) {
    const composed = createBitmap(composition.columns * 32, composition.rows * 32);
    composition.partIds.forEach((partId, index) => {
      const entry = bySourceId.get(partId);
      if (!entry) throw new Error(`${composition.id} cannot compose missing atlas part ${partId}.`);
      blit(entry.bitmap, composed, (index % composition.columns) * 32, Math.floor(index / composition.columns) * 32);
    });
    composition.partIds.forEach((partId, index) => {
      replacements.set(partId, cropBitmap(
        composed,
        (index % composition.columns) * 32,
        Math.floor(index / composition.columns) * 32,
        32,
        32,
      ));
    });
  }
  return entries.map((entry) => ({ ...entry, bitmap: replacements.get(entry.sourceId) ?? entry.bitmap }));
}

function pack(entries: readonly Entry[], maximumWidth: number, maximumHeight: number): {
  bitmap: Bitmap;
  sprites: Record<string, AtlasRect>;
} {
  const result = packAtlasRectangles(entries.map((entry) => ({
    id: entry.name,
    width: entry.bitmap.width,
    height: entry.bitmap.height,
  })), { maximumWidth, maximumHeight, gutter: ATLAS_GUTTER });
  const bitmap = createBitmap(result.width, result.height);
  const entriesByName = new Map(entries.map((entry) => [entry.name, entry]));
  const sprites: Record<string, AtlasRect> = {};
  for (const placement of result.placements) {
    const entry = entriesByName.get(placement.id);
    if (!entry) throw new Error(`Atlas pack returned unknown cell ${placement.id}.`);
    blitWithExtrudedGutter(entry.bitmap, bitmap, placement.x, placement.y, ATLAS_GUTTER);
    sprites[entry.name] = {
      x: placement.x,
      y: placement.y,
      width: entry.bitmap.width,
      height: entry.bitmap.height,
      kind: entry.kind,
      category: entry.category,
      visibility: entry.visibility,
      sourceId: entry.sourceId,
      cellClass: entry.cellClass,
      wallAdjacencyMask: entry.wallAdjacencyMask,
    };
  }
  return { bitmap, sprites };
}

export function buildAtlas(root = process.cwd()): {
  png: Buffer;
  index: AtlasIndex;
  report: AtlasGenerationReport;
  presentationRecipes: ArtPresentationRuntimeRecipes;
} {
  const manifest = loadArtManifest(root);
  const presentationRecipes = loadArtPresentationRecipeManifest(root);
  const presentationRuntimeRecipes = loadArtPresentationRuntimeRecipes(root);
  /**
   * The recipe revision may lag the atlas revision, but never lead it.
   *
   * These two numbers mean different things. The manifest's `artRevision` versions the atlas
   * image. The recipes' `artRevision` becomes `ART_PRESENTATION_REVISION`, which is a SEED:
   * `material-selection.ts` hashes it to choose a ground material per tile. Moving the recipe
   * revision therefore reshuffles procedural ground art across every map — measured, not
   * theoretical: bumping both together produced a 9-tile diagonal stamp run against the 4-tile
   * limit in `sunward-art.test.ts`.
   *
   * So a change that touches only character cells bumps the atlas revision and leaves the recipe
   * revision alone. Leading is still an error: recipes newer than the atlas mean the atlas was
   * built from stale inputs.
   */
  if (presentationRecipes.artRevision > manifest.artRevision) {
    throw new Error('Art presentation recipes are newer than the atlas art revision.');
  }
  const characters = loadCharacterSources(root);
  const groundCells = loadTileSources(root);
  const wallSources = loadWallSources(root);
  const transparentParts = loadTransparentPartSources(root);
  const presentationCells = loadPresentationCellSources(root);
  const multiTileCompositions = loadMultiTileCompositions(root);
  const groundEntries: Entry[] = groundCells.map((tile) => ({
    name: `tile.${tile.id}`,
    sourceId: tile.id,
    kind: 'tile' as const,
    category: 'ground-base' as const,
    visibility: 'public' as const,
    cellClass: 'ground' as const,
    wallAdjacencyMask: null,
    bitmap: renderTile(tile),
  }));
  const wallEntries: Entry[] = wallSources.flatMap((wall) =>
    Array.from({ length: 16 }, (_unused, adjacencyMask) => ({
      name: `tile.wall-${wall.id}-${adjacencyMask.toString(16)}`,
      sourceId: wall.id,
      kind: 'tile' as const,
      category: 'wall-door' as const,
      visibility: 'public' as const,
      cellClass: 'transparent-part' as const,
      wallAdjacencyMask: adjacencyMask,
      bitmap: renderWallVariant(wall, adjacencyMask),
    })),
  );
  const rawPartEntries: Entry[] = transparentParts.flatMap((part) => {
    const variants = part.role === 'door'
      ? [
        { suffix: '', bitmap: renderDoorVariant(part, 'horizontal') },
        { suffix: '-horizontal', bitmap: renderDoorVariant(part, 'horizontal') },
        { suffix: '-vertical', bitmap: renderDoorVariant(part, 'vertical') },
      ]
      : [{ suffix: '', bitmap: renderTile(part) }];
    return variants.map(({ suffix, bitmap }) => ({
      name: `tile.${part.id}${suffix}`,
      sourceId: part.id,
      kind: 'tile' as const,
      category: part.role === 'door' ? 'wall-door' as const : 'object-landmark' as const,
      visibility: 'public' as const,
      cellClass: 'transparent-part' as const,
      wallAdjacencyMask: null,
      bitmap,
    }));
  });
  const partEntries = composeAndSplitMultiTileEntries(rawPartEntries, multiTileCompositions);
  const authoredPresentationEntries: Entry[] = presentationCells.map((cell) => ({
    name: `tile.${cell.id}`,
    sourceId: cell.id,
    kind: 'tile' as const,
    category: cell.role === 'roof' ? 'roof' as const : 'ground-decal' as const,
    visibility: 'public' as const,
    cellClass: cell.backgroundToken ? 'ground' as const : 'transparent-part' as const,
    wallAdjacencyMask: null,
    bitmap: renderTile(cell),
  }));
  const transitionEntries: Entry[] = presentationRuntimeRecipes.transitionFamilies.flatMap((family) =>
    Array.from({ length: 15 }, (_unused, index) => {
      const mask = index + 1;
      return {
        name: `${family.publicSpritePrefix}-${mask.toString(16)}`,
        sourceId: family.id,
        kind: 'tile' as const,
        category: 'ground-transition' as const,
        visibility: 'public' as const,
        cellClass: 'transparent-part' as const,
        wallAdjacencyMask: null,
        bitmap: renderTransitionMask(
          family.id,
          mask,
          family.palette as Readonly<{ light: string; mid: string; shade: string }>,
        ),
      };
    }),
  );
  const presentationEntries = [...authoredPresentationEntries, ...transitionEntries];
  const tileEntries = [...groundEntries, ...wallEntries, ...partEntries, ...presentationEntries];
  const atlasTileNames = new Set(tileEntries.map(({ name }) => name));
  const missingPresentationSprites = presentationRecipes.publicSpriteIds.filter((name) => !atlasTileNames.has(name));
  if (missingPresentationSprites.length > 0) {
    throw new Error(`Art presentation recipes reference missing public cells: ${missingPresentationSprites.join(', ')}`);
  }
  const entries: Entry[] = [
    ...tileEntries,
    ...characters.flatMap(worldEntries),
    ...buildPortraitEntries(characters).map((entry) => ({
      ...entry,
      category: 'portrait' as const,
      visibility: 'public' as const,
      cellClass: null,
      wallAdjacencyMask: null,
    })),
  ];
  const budget = createAtlasBudgetReport(entries.map((entry) => ({
    id: entry.name,
    category: entry.category,
    width: entry.bitmap.width,
    height: entry.bitmap.height,
  })), manifest);
  const { bitmap, sprites } = pack(entries, manifest.limits.maximumWidth, manifest.limits.maximumHeight);
  if (bitmap.width !== budget.actual.width || bitmap.height !== budget.actual.height) {
    throw new Error('Atlas budget and production packer dimensions disagree.');
  }
  const png = encodePng(bitmap);
  const imageSha256 = createHash('sha256').update(png).digest('hex');
  const publicSpriteIds = Object.keys(sprites).filter((name) => sprites[name]?.visibility === 'public');
  const internalReviewSpriteIds = Object.keys(sprites).filter((name) => sprites[name]?.visibility === 'internal-review');
  const index: AtlasIndex = {
    version: 3,
    artRevision: manifest.artRevision,
    toolVersion: manifest.toolVersion,
    image: {
      width: bitmap.width,
      height: bitmap.height,
      colorType: 'rgba',
      gutter: ATLAS_GUTTER,
      sha256: imageSha256,
    },
    tileSize: 32,
    worldCell: WORLD_CELL,
    walkFrameMilliseconds: WALK_FRAME_MILLISECONDS,
    zoomLevels: ZOOM_LEVELS,
    sprites,
    publicSpriteIds,
    internalReviewSpriteIds,
    characters: Object.fromEntries(characters.map((character) => [character.id, {
      displayName: character.displayName,
      portrait: `portrait.${character.id}`,
      portraits: Object.fromEntries(Object.keys(character.portraitExpressions).map((expression) => [
        expression,
        expression === 'rest' ? `portrait.${character.id}` : `portrait.${character.id}.${expression}`,
      ])),
      frames: Object.fromEntries(WALK_DIRECTIONS.flatMap((direction) =>
        WALK_FRAMES.map((frame) => [
          `${direction}-${frame}`,
          `character.${character.id}.${direction}-${frame}`,
        ]),
      )),
      eyes: `character.${character.id}.eyes`,
      sourceLayers: [
        'legs',
        'torso-and-clothing',
        'head-and-face',
        'hair',
        'accessory',
        'held-item',
      ] as const,
    }])),
    tiles: tileEntries.map(({ name }) => name),
    groundCells: groundEntries.map(({ name }) => name),
    transparentPartCells: [...wallEntries, ...partEntries].map(({ name }) => name),
    presentationCells: presentationEntries.map(({ name }) => name),
    walls: Object.fromEntries(wallSources.map(({ id }) => [
      id,
      Array.from({ length: 16 }, (_unused, adjacencyMask) =>
        `tile.wall-${id}-${adjacencyMask.toString(16)}`),
    ])),
    multiTileCompositions: Object.fromEntries(multiTileCompositions.map(({ id, partIds }) => [id, partIds])),
  };
  const report: AtlasGenerationReport = {
    ...budget,
    indexVersion: 3,
    toolVersion: manifest.toolVersion,
    imageSha256,
    publicSpriteCount: publicSpriteIds.length,
    internalReviewSpriteCount: internalReviewSpriteIds.length,
  };
  validateAtlasArtifacts(png, index, report, root);
  return { png, index, report, presentationRecipes: presentationRuntimeRecipes };
}

export function validateAtlasArtifacts(
  png: Buffer,
  index: AtlasIndex,
  report: AtlasGenerationReport,
  root = process.cwd(),
): void {
  const manifest = loadArtManifest(root);
  const decoded = decodePng(png);
  const digest = createHash('sha256').update(png).digest('hex');
  if (index.version !== manifest.indexVersion || report.indexVersion !== manifest.indexVersion) {
    throw new Error('Atlas index version does not match the art manifest.');
  }
  if (index.artRevision !== manifest.artRevision || report.artRevision !== manifest.artRevision) {
    throw new Error('Atlas art revision does not match the art manifest.');
  }
  if (index.toolVersion !== manifest.toolVersion || report.toolVersion !== manifest.toolVersion) {
    throw new Error('Atlas tool version does not match the art manifest.');
  }
  if (
    decoded.width !== index.image.width || decoded.height !== index.image.height ||
    decoded.width > manifest.limits.maximumWidth || decoded.height > manifest.limits.maximumHeight
  ) {
    throw new Error('Atlas image dimensions do not match the index or hard limit.');
  }
  if (digest !== index.image.sha256 || digest !== report.imageSha256) {
    throw new Error('Atlas PNG digest does not match the index and report.');
  }
  const allIds = Object.keys(index.sprites);
  const publicIds = new Set(index.publicSpriteIds);
  const internalIds = new Set(index.internalReviewSpriteIds);
  if (
    publicIds.size !== index.publicSpriteIds.length ||
    internalIds.size !== index.internalReviewSpriteIds.length ||
    [...publicIds].some((id) => internalIds.has(id)) ||
    publicIds.size + internalIds.size !== allIds.length
  ) {
    throw new Error('Atlas public and internal sprite lists do not cover the index exactly once.');
  }
  for (const id of index.publicSpriteIds) {
    if (index.sprites[id]?.visibility !== 'public') {
      throw new Error(`Public atlas ID ${id} is missing or has the wrong visibility.`);
    }
    if (!manifest.publicIdPrefixes.some((prefix) => id.startsWith(prefix))) {
      throw new Error(`Public atlas ID ${id} does not satisfy the manifest policy.`);
    }
  }
  for (const id of index.internalReviewSpriteIds) {
    if (index.sprites[id]?.visibility !== 'internal-review') {
      throw new Error(`Internal atlas ID ${id} is missing or has the wrong visibility.`);
    }
  }
  for (const [id, rectangle] of Object.entries(index.sprites)) {
    if (
      (rectangle.visibility === 'public' && !publicIds.has(id)) ||
      (rectangle.visibility === 'internal-review' && !internalIds.has(id))
    ) {
      throw new Error(`Atlas cell ${id} is absent from its declared visibility list.`);
    }
    if (
      rectangle.x < ATLAS_GUTTER || rectangle.y < ATLAS_GUTTER ||
      rectangle.x + rectangle.width + ATLAS_GUTTER > decoded.width ||
      rectangle.y + rectangle.height + ATLAS_GUTTER > decoded.height
    ) {
      throw new Error(`Atlas cell ${id} or its gutter is outside the image.`);
    }
  }
  for (let offset = 0; offset < decoded.data.length; offset += 4) {
    if (
      decoded.data[offset + 3] === 0 &&
      (decoded.data[offset] !== 0 || decoded.data[offset + 1] !== 0 || decoded.data[offset + 2] !== 0)
    ) {
      throw new Error('Atlas has uncontrolled RGB under a transparent pixel.');
    }
  }
}

export function writeAtlas(root = process.cwd()): void {
  const outputDirectory = resolve(root, 'assets/generated');
  const runtimeRecipeDirectory = resolve(root, 'src/world/presentation');
  const { png, index, report, presentationRecipes } = buildAtlas(root);
  mkdirSync(outputDirectory, { recursive: true });
  mkdirSync(runtimeRecipeDirectory, { recursive: true });
  const candidateId = `${process.pid}-${randomUUID()}`;
  const candidates = {
    png: resolve(outputDirectory, `.world-atlas.${candidateId}.tmp`),
    index: resolve(outputDirectory, `.atlas-index.${candidateId}.tmp`),
    presentationRecipes: resolve(runtimeRecipeDirectory, `.generated-recipes.${candidateId}.tmp`),
    report: resolve(outputDirectory, `.atlas-report.${candidateId}.tmp`),
  };
  try {
    writeFileSync(candidates.png, png, { flush: true });
    writeFileSync(candidates.index, `${JSON.stringify(index, null, 2)}\n`, { encoding: 'utf8', flush: true });
    writeFileSync(candidates.presentationRecipes, `${JSON.stringify(presentationRecipes, null, 2)}\n`, { encoding: 'utf8', flush: true });
    writeFileSync(candidates.report, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flush: true });
    const candidatePng = readFileSync(candidates.png);
    const candidateIndex = JSON.parse(readFileSync(candidates.index, 'utf8')) as AtlasIndex;
    const candidatePresentationRecipes = JSON.parse(readFileSync(candidates.presentationRecipes, 'utf8')) as ArtPresentationRuntimeRecipes;
    const candidateReport = JSON.parse(readFileSync(candidates.report, 'utf8')) as AtlasGenerationReport;
    validateAtlasArtifacts(candidatePng, candidateIndex, candidateReport, root);
    if (JSON.stringify(candidatePresentationRecipes) !== JSON.stringify(presentationRecipes)) {
      throw new Error('Art presentation runtime recipe candidate is incomplete.');
    }
    renameSync(candidates.png, resolve(outputDirectory, 'world-atlas.png'));
    renameSync(candidates.report, resolve(outputDirectory, 'atlas-report.json'));
    renameSync(candidates.presentationRecipes, resolve(runtimeRecipeDirectory, 'generated-recipes.json'));
    renameSync(candidates.index, resolve(outputDirectory, 'atlas-index.json'));
  } finally {
    Object.values(candidates).forEach((path) => rmSync(path, { force: true }));
  }
  process.stdout.write(
    `World atlas: ${index.image.width}x${index.image.height}, ${index.publicSpriteIds.length} public RGBA cells, ` +
    `${(report.forecast.packedAreaRatio * 100).toFixed(1)}% forecast packed area.\n`,
  );
}

if (require.main === module) {
  writeAtlas();
}
