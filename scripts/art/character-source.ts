import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import {
  CHARACTER_LOOKS,
  type CharacterLook,
  type PortraitExpression,
} from './character-look-roster';
import { applyConnectedHairLighting } from './hair-lighting';
// Runtime import, but not a cycle: protagonist-reference.ts imports only `type TokenFrame`
// from this module, and type imports are erased.
import { protagonistReferenceFrames } from './protagonist-reference';
import { createBitmap, decodePng, fillRect, parseHexColor, setPixel, type Bitmap, type Rgba } from './png';

export const WORLD_CELL = { width: 24, height: 30 } as const;
export const PORTRAIT_CELL = { width: 24, height: 29 } as const;
export const TILE_CELL = { width: 32, height: 32 } as const;

const TokenSchema = z.string().regex(/^[A-Za-z0-9]$/u);
const ColorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu);
const DirectionSchema = z.enum(['front', 'rear', 'left', 'right']);

const RectCommandSchema = z.object({
  kind: z.literal('rect'),
  token: TokenSchema,
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict();

const PixelsCommandSchema = z.object({
  kind: z.literal('pixels'),
  token: TokenSchema,
  points: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])).min(1),
}).strict();

export const DrawCommandSchema = z.discriminatedUnion('kind', [RectCommandSchema, PixelsCommandSchema]);
export type DrawCommand = z.infer<typeof DrawCommandSchema>;

const StaticLayerSchema = z.object({ commands: z.array(DrawCommandSchema) }).strict();
const FrameLayerSchema = z.object({
  frontFrames: z.tuple([z.array(DrawCommandSchema), z.array(DrawCommandSchema)]),
  lateralFrames: z.tuple([z.array(DrawCommandSchema), z.array(DrawCommandSchema)]),
}).strict();

const SourceLayersSchema = z.object({
  legs: FrameLayerSchema,
  torsoAndClothing: StaticLayerSchema,
  headAndFace: StaticLayerSchema,
  hair: StaticLayerSchema,
  accessory: StaticLayerSchema,
  heldItem: StaticLayerSchema.optional(),
}).strict();

const PortraitLayersSchema = z.object({
  legs: StaticLayerSchema,
  torsoAndClothing: StaticLayerSchema,
  headAndFace: StaticLayerSchema,
  hair: StaticLayerSchema,
  accessory: StaticLayerSchema,
  heldItem: StaticLayerSchema.optional(),
}).strict();

export const CharacterSourceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]+$/u),
  displayName: z.string().min(1).max(40),
  kind: z.enum(['named', 'ambient']),
  cell: z.object({ width: z.literal(24), height: z.literal(30) }).strict(),
  portraitCell: z.object({ width: z.literal(24), height: z.literal(29) }).strict(),
  palette: z.record(TokenSchema, ColorSchema),
  identityTokens: z.object({ hair: TokenSchema, clothing: TokenSchema, skin: TokenSchema }).strict(),
  identityFeatures: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]+$/u),
    description: z.string().min(1).max(120),
    layer: z.enum(['torsoAndClothing', 'hair', 'accessory', 'heldItem']),
    visibleIn: z.array(DirectionSchema).min(1).max(4),
  }).strict()).min(2).max(6),
  rearStyle: z.object({
    head: TokenSchema,
    lower: TokenSchema,
    clothing: TokenSchema,
    torsoDetailTokens: z.array(TokenSchema),
  }).strict(),
  signatureOddity: z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]+$/u),
    description: z.string().min(1).max(180),
    supportingFeature: z.string().min(1).max(180),
  }).strict(),
  sourceLayers: SourceLayersSchema,
  portraitLayers: PortraitLayersSchema,
  portraitExpressions: z.object({
    rest: StaticLayerSchema,
    joy: StaticLayerSchema.optional(),
    upset: StaticLayerSchema.optional(),
  }).strict(),
}).strict();

export type CharacterSource = z.infer<typeof CharacterSourceSchema>;
export type TokenFrame = string[];

const BaseTileSourceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]+$/u),
  palette: z.record(TokenSchema, ColorSchema),
  commands: z.array(DrawCommandSchema),
});

export const GroundCellSourceSchema = BaseTileSourceSchema.extend({
  cellClass: z.literal('ground'),
  backgroundToken: TokenSchema,
}).strict();
export type GroundCellSource = z.infer<typeof GroundCellSourceSchema>;

export const TransparentPartSourceSchema = BaseTileSourceSchema.extend({
  cellClass: z.literal('transparent-part'),
  role: z.enum(['door', 'furniture', 'sign', 'fixture', 'plant', 'landmark']),
}).strict();
export type TransparentPartSource = z.infer<typeof TransparentPartSourceSchema>;

export const PresentationCellSourceSchema = BaseTileSourceSchema.extend({
  cellClass: z.literal('presentation'),
  role: z.enum(['transition', 'decal', 'roof']),
  backgroundToken: TokenSchema.optional(),
}).strict();
export type PresentationCellSource = z.infer<typeof PresentationCellSourceSchema>;

const MultiTileCompositionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]+$/u),
  columns: z.number().int().min(2).max(4),
  rows: z.number().int().min(1).max(4),
  partIds: z.array(z.string().regex(/^[a-z][a-z0-9-]+$/u)).min(2).max(16),
}).strict().refine(({ columns, rows, partIds }) => partIds.length === columns * rows, {
  message: 'Multi-tile composition part count must match its grid.',
});
export type MultiTileComposition = z.infer<typeof MultiTileCompositionSchema>;

const WallModulesSchema = z.object({
  north: z.array(DrawCommandSchema),
  east: z.array(DrawCommandSchema),
  south: z.array(DrawCommandSchema),
  west: z.array(DrawCommandSchema),
  core: z.array(DrawCommandSchema),
}).strict();

const WallPaletteSourceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]+$/u),
  palette: z.record(TokenSchema, ColorSchema),
  modules: WallModulesSchema.optional(),
}).strict();

export type WallSource = Readonly<{
  id: string;
  palette: Readonly<Record<string, string>>;
  modules: z.infer<typeof WallModulesSchema>;
}>;

export type TileSource = GroundCellSource | TransparentPartSource | PresentationCellSource;

const TileCollectionSchema = z.object({
  version: z.literal(2),
  tiles: z.array(GroundCellSourceSchema).min(8).max(96),
  parts: z.array(TransparentPartSourceSchema).min(1),
  presentationCells: z.array(PresentationCellSourceSchema).max(96).default([]),
  multiTileCompositions: z.array(MultiTileCompositionSchema).max(16).default([]),
  wallModules: WallModulesSchema,
  wallPalettes: z.array(WallPaletteSourceSchema).default([]),
}).strict();

type TileCollection = z.infer<typeof TileCollectionSchema>;

function loadTileCollections(root: string): TileCollection[] {
  const directory = resolve(root, 'assets/source/tiles');
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => TileCollectionSchema.parse(
      JSON.parse(readFileSync(resolve(directory, name), 'utf8')) as unknown,
    ));
}

function validateTileSource(source: TileSource): void {
  assertCommandBounds(source.commands, TILE_CELL.width, TILE_CELL.height);
  for (const command of source.commands) {
    if (!source.palette[command.token]) {
      throw new Error(`${source.id} uses missing palette token ${command.token}.`);
    }
  }
  if (
    (source.cellClass === 'ground' || source.cellClass === 'presentation') &&
    source.backgroundToken &&
    !source.palette[source.backgroundToken]
  ) {
    throw new Error(`${source.id} uses missing background token ${source.backgroundToken}.`);
  }
}

function assertUniqueSourceIds(label: string, ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} source IDs must be unique.`);
  }
}

function assertCommandBounds(commands: readonly DrawCommand[], width: number, height: number): void {
  for (const command of commands) {
    if (command.kind === 'rect') {
      if (command.x + command.width > width || command.y + command.height > height) {
        throw new Error(`Rectangle exceeds ${width}x${height}.`);
      }
    } else if (command.points.some(([x, y]) => x >= width || y >= height)) {
      throw new Error(`Pixel command exceeds ${width}x${height}.`);
    }
  }
}

const SKIN_COLORS = {
  porcelain: ['#f7c9a9', '#d99578', '#ffe0c5'],
  sand: ['#dca078', '#a96550', '#f4bd92'],
  warm: ['#b86f4f', '#7b4437', '#dc936c'],
  copper: ['#925438', '#603326', '#ba7550'],
  deep: ['#633922', '#3d231c', '#8d5836'],
} as const;

const HAIR_COLORS = {
  ink: ['#16121f', '#3d3544'],
  espresso: ['#35231f', '#644035'],
  umber: ['#2b211e', '#6d4535'],
  auburn: ['#71372f', '#a7543d'],
  gold: ['#d0a23a', '#f0c760'],
  silver: ['#6c6971', '#a9a4a2'],
  teal: ['#164f54', '#2e7d79'],
} as const;

const CLOTHING_COLORS = {
  teal: ['#197279', '#42a2a0'],
  coral: ['#b84e52', '#e46d69'],
  plum: ['#673d70', '#96639c'],
  mustard: ['#9a6e24', '#d29d3b'],
  navy: ['#263b58', '#456683'],
  rose: ['#9a4e70', '#ca7591'],
  cream: ['#cbbf9d', '#eee0ba'],
  rust: ['#8b472d', '#c26b3c'],
  sage: ['#64775d', '#91a47c'],
  charcoal: ['#3f3b46', '#67616f'],
} as const;

const ACCENT_COLORS = {
  gold: ['#d7a62b', '#f2cf59'],
  cyan: ['#58b8c8', '#9edfe6'],
  red: ['#b83a3a', '#ed6a57'],
  pink: ['#cd5f95', '#f19bb9'],
  lime: ['#7da83d', '#b8d966'],
  cream: ['#d8cda9', '#fff0c9'],
  violet: ['#7158a5', '#aa8bd5'],
} as const;

function rectCommand(
  token: string,
  x: number,
  y: number,
  width: number,
  height: number,
): DrawCommand {
  return { kind: 'rect', token, x, y, width, height };
}

function pixelsCommand(token: string, points: readonly (readonly [number, number])[]): DrawCommand {
  return { kind: 'pixels', token, points: points.map(([x, y]) => [x, y]) };
}

function characterPalette(look: CharacterLook): Record<string, string> {
  const skin = SKIN_COLORS[look.skin];
  const hair = HAIR_COLORS[look.hairColor];
  const clothing = CLOTHING_COLORS[look.clothing];
  const accent = ACCENT_COLORS[look.accent];
  return {
    K: '#211c27',
    S: skin[0],
    s: skin[1],
    L: skin[2],
    H: hair[0],
    h: hair[1],
    C: clothing[0],
    c: clothing[1],
    A: accent[0],
    a: accent[1],
    W: '#f5eee0',
    D: '#494052',
  };
}

function headBounds(_look: CharacterLook): Readonly<{
  left: number;
  right: number;
  top: number;
  bottom: number;
}> {
  return { left: 4, right: 19, top: 4, bottom: 17 };
}

function portraitHeadCommands(look: CharacterLook): DrawCommand[] {
  const { left, right, top, bottom } = headBounds(look);
  const width = right - left + 1;
  const commands: DrawCommand[] = [
    rectCommand('S', left + 1, top, width - 2, 1),
    rectCommand('S', left, top + 1, width, bottom - top - 1),
    rectCommand('S', left + 1, bottom, width - 2, 1),
    pixelsCommand('s', [
      [left + 2, bottom - 1], [left + 3, bottom - 1],
      [right - 3, bottom - 1], [right - 2, bottom - 1],
    ]),
    rectCommand('s', left + 2, bottom, width - 4, 1),
    pixelsCommand('L', [[left + 1, top + 2], [left + 1, top + 3]]),
  ];
  return commands;
}

function portraitExpressionCommands(expression: PortraitExpression, look: CharacterLook): DrawCommand[] {
  if (expression === 'joy') {
    return [
      pixelsCommand('K', [[7, 11], [8, 12], [9, 11], [14, 11], [15, 12], [16, 11], [11, 14], [12, 14]]),
      rectCommand('K', 9, 15, 6, 2),
      rectCommand('W', 11, 15, 2, 1),
    ];
  }
  if (expression === 'upset') {
    return [
      pixelsCommand('K', [[6, 10], [7, 11], [8, 11], [9, 12], [14, 12], [15, 11], [16, 11], [17, 10], [11, 14], [12, 14]]),
      rectCommand('K', 10, 16, 4, 1),
      pixelsCommand('K', [[9, 17], [14, 17]]),
    ];
  }
  void look;
  return [
    pixelsCommand('H', [[7, 11], [8, 11], [9, 11], [14, 11], [15, 11], [16, 11]]),
    rectCommand('W', 7, 13, 4, 2),
    rectCommand('W', 13, 13, 4, 2),
    rectCommand('K', 8, 13, 1, 2),
    rectCommand('K', 14, 13, 1, 2),
    rectCommand('D', 10, 13, 1, 2),
    rectCommand('D', 16, 13, 1, 2),
    pixelsCommand('s', [[11, 14], [12, 15]]),
    rectCommand('s', 10, 16, 4, 1),
  ];
}

function worldHeadCommands(look: CharacterLook): DrawCommand[] {
  return [...portraitHeadCommands(look), ...portraitExpressionCommands('rest', look)];
}

function worldHairCommands(look: CharacterLook): DrawCommand[] {
  switch (look.hair) {
    case 'bald': return [pixelsCommand('H', [[6, 7], [17, 7]])];
    case 'swept': return [rectCommand('H', 5, 3, 12, 5), rectCommand('H', 4, 6, 4, 5), pixelsCommand('h', [[7, 4], [8, 4], [9, 4], [16, 5], [17, 6], [18, 6]])];
    case 'side-cloud': return [rectCommand('H', 5, 3, 12, 5), rectCommand('H', 3, 6, 5, 13), rectCommand('H', 16, 5, 4, 14), pixelsCommand('h', [[5, 5], [4, 8], [18, 7], [18, 10]])];
    case 'stacked-bun': return [rectCommand('H', 6, 4, 12, 5), rectCommand('H', 9, 2, 6, 3), rectCommand('H', 10, 1, 4, 2), pixelsCommand('h', [[11, 1], [10, 3], [8, 5]])];
    case 'crop': return [rectCommand('H', 6, 4, 12, 4), pixelsCommand('h', [[7, 4], [10, 4], [13, 5], [16, 4]])];
    case 'bob': return [rectCommand('H', 5, 4, 14, 5), rectCommand('H', 4, 7, 4, 8), rectCommand('H', 16, 7, 4, 8), pixelsCommand('h', [[7, 5], [17, 6]])];
    case 'flat-top': return [rectCommand('H', 5, 2, 14, 6), rectCommand('h', 7, 2, 10, 2)];
    case 'high-bun': return [rectCommand('H', 6, 5, 12, 4), rectCommand('H', 9, 1, 6, 5), pixelsCommand('h', [[10, 2], [11, 1], [8, 6]])];
    case 'low-part': return [rectCommand('H', 6, 4, 12, 4), rectCommand('H', 5, 6, 4, 4), pixelsCommand('h', [[12, 4], [13, 4], [14, 4], [15, 5]])];
    case 'question': return [rectCommand('H', 6, 4, 11, 4), pixelsCommand('H', [[16, 3], [17, 2], [18, 2], [19, 3], [19, 4], [18, 5], [17, 5], [17, 6]])];
    case 'quiff': return [rectCommand('H', 6, 4, 12, 4), pixelsCommand('H', [[7, 3], [8, 2], [9, 2], [10, 3], [16, 3], [17, 2], [18, 2]])];
    case 'pompadour': return [rectCommand('H', 7, 4, 10, 4), rectCommand('H', 9, 2, 7, 3), rectCommand('h', 11, 2, 4, 1)];
    case 'twin-buns': return [rectCommand('H', 7, 4, 10, 5), rectCommand('H', 3, 3, 5, 5), rectCommand('H', 16, 3, 5, 5), pixelsCommand('h', [[4, 4], [17, 4]])];
    case 'long': return [rectCommand('H', 5, 4, 14, 5), rectCommand('H', 4, 7, 4, 14), rectCommand('H', 16, 7, 4, 14), pixelsCommand('h', [[6, 5], [17, 8], [17, 12]])];
    case 'mohawk': return [rectCommand('H', 9, 1, 6, 8), pixelsCommand('h', [[10, 2], [11, 1], [12, 1], [13, 2]])];
    case 'braids': return [rectCommand('H', 6, 4, 12, 4), rectCommand('H', 4, 7, 3, 12), rectCommand('H', 17, 7, 3, 12), pixelsCommand('h', [[5, 10], [18, 12]])];
    case 'bowl': return [rectCommand('H', 5, 4, 14, 5), rectCommand('H', 4, 7, 4, 4), rectCommand('H', 16, 7, 4, 4)];
    case 'spikes': return [rectCommand('H', 6, 5, 12, 4), pixelsCommand('H', [[6, 3], [8, 2], [10, 4], [12, 2], [14, 3], [17, 2], [18, 4]])];
    case 'side-fan': return [rectCommand('H', 6, 5, 10, 4), pixelsCommand('H', [[16, 4], [17, 3], [18, 2], [19, 3], [20, 4], [19, 5], [18, 6], [17, 7]])];
    case 'ponytail': return [rectCommand('H', 6, 4, 12, 4), rectCommand('H', 17, 6, 4, 8), pixelsCommand('h', [[18, 7], [19, 9]])];
  }
}

function worldHairTextureCommands(look: CharacterLook): DrawCommand[] {
  const texture = (highlights: readonly (readonly [number, number])[], shadows: readonly (readonly [number, number])[]) => [
    pixelsCommand('h', highlights),
    pixelsCommand('K', shadows),
  ];
  switch (look.hair) {
    case 'bald': return [];
    case 'swept': return texture(
      [[6, 4], [7, 4], [8, 5], [9, 5], [10, 6], [11, 6], [14, 4], [15, 4], [16, 5], [5, 8], [6, 9]],
      [[7, 7], [10, 7], [13, 7], [15, 6], [6, 10]],
    );
    case 'side-cloud': return texture(
      [[6, 4], [7, 4], [10, 5], [13, 6], [4, 8], [5, 11], [4, 14], [18, 7], [17, 10], [18, 13], [17, 16]],
      [[7, 7], [15, 7], [6, 13], [17, 14], [5, 17]],
    );
    case 'stacked-bun': return texture(
      [[11, 1], [12, 1], [10, 3], [11, 3], [8, 5], [9, 5], [12, 6], [15, 5]],
      [[10, 4], [14, 4], [8, 8], [12, 8], [16, 7]],
    );
    case 'crop': return texture(
      [[7, 4], [8, 4], [10, 5], [12, 4], [14, 5], [16, 4]],
      [[8, 7], [11, 7], [14, 7], [17, 6]],
    );
    case 'bob': return texture(
      [[7, 4], [8, 4], [11, 5], [14, 5], [17, 6], [5, 9], [6, 12], [18, 9], [17, 12]],
      [[8, 8], [12, 8], [15, 8], [6, 14], [17, 14]],
    );
    case 'flat-top': return texture(
      [[7, 2], [8, 2], [9, 2], [10, 2], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3], [15, 3], [7, 5], [8, 5]],
      [[9, 4], [10, 4], [11, 4], [12, 5], [13, 5], [14, 5], [15, 6]],
    );
    case 'high-bun': return texture(
      [[10, 1], [11, 2], [12, 2], [10, 4], [8, 6], [11, 6], [15, 6]],
      [[9, 5], [14, 5], [8, 8], [12, 8], [16, 8]],
    );
    case 'low-part': return texture(
      [[7, 4], [8, 4], [10, 5], [13, 4], [14, 4], [15, 5], [6, 7]],
      [[11, 6], [12, 6], [8, 7], [15, 7], [6, 9]],
    );
    case 'question': return texture(
      [[7, 4], [8, 4], [10, 5], [13, 5], [16, 3], [18, 2], [18, 5]],
      [[9, 7], [13, 7], [16, 6], [19, 4]],
    );
    case 'quiff': return texture(
      [[7, 3], [8, 2], [9, 3], [11, 5], [13, 5], [16, 3], [17, 2]],
      [[8, 6], [11, 7], [14, 7], [17, 6]],
    );
    case 'pompadour': return texture(
      [[10, 2], [11, 2], [12, 3], [14, 3], [9, 5], [12, 5], [15, 5]],
      [[9, 4], [15, 4], [10, 7], [14, 7]],
    );
    case 'twin-buns': return texture(
      [[4, 4], [5, 4], [17, 4], [18, 4], [9, 5], [12, 5], [14, 6]],
      [[6, 7], [17, 7], [9, 8], [14, 8]],
    );
    case 'long': return texture(
      [[7, 4], [8, 4], [11, 5], [14, 6], [5, 9], [6, 12], [5, 16], [18, 9], [17, 13], [18, 17]],
      [[8, 8], [13, 8], [6, 15], [17, 15], [6, 19], [17, 19]],
    );
    case 'mohawk': return texture(
      [[11, 1], [12, 1], [10, 3], [11, 4], [13, 5], [12, 7]],
      [[9, 6], [14, 6], [10, 8], [13, 8]],
    );
    case 'braids': return texture(
      [[7, 4], [9, 5], [12, 4], [15, 5], [5, 9], [5, 13], [18, 10], [18, 14]],
      [[8, 7], [13, 7], [5, 16], [18, 17]],
    );
    case 'bowl': return texture(
      [[7, 4], [8, 4], [10, 5], [13, 5], [16, 4], [5, 8], [18, 8]],
      [[8, 8], [11, 8], [14, 8], [6, 10], [17, 10]],
    );
    case 'spikes': return texture(
      [[6, 3], [8, 2], [10, 5], [12, 2], [14, 3], [17, 2], [16, 6]],
      [[8, 7], [11, 7], [14, 7], [17, 7]],
    );
    case 'side-fan': return texture(
      [[8, 5], [10, 5], [13, 6], [16, 4], [18, 2], [19, 4], [18, 6]],
      [[9, 8], [13, 8], [16, 7], [20, 4]],
    );
    case 'ponytail': return texture(
      [[7, 4], [9, 5], [12, 4], [15, 5], [18, 7], [19, 9], [18, 12]],
      [[8, 7], [12, 7], [16, 7], [19, 13]],
    );
  }
}

function worldBodyCommands(look: CharacterLook): DrawCommand[] {
  const body = [
    rectCommand('C', 5, 18, 14, 1),
    rectCommand('C', 4, 19, 16, 5),
    rectCommand('C', 5, 24, 14, 3),
    rectCommand('C', 6, 27, 12, 1),
  ];
  const arms = [
    pixelsCommand('S', [[4, 24], [19, 24]]),
    pixelsCommand('L', [[3, 24], [20, 24]]),
    pixelsCommand('c', [[8, 18], [15, 18]]),
  ];
  const patterns: DrawCommand[][] = [
    [rectCommand('c', 7, 19, 10, 3), pixelsCommand('A', [[11, 23], [12, 23]])],
    [pixelsCommand('A', [[6, 18], [7, 19], [8, 20], [9, 21], [10, 22], [11, 23], [12, 24], [13, 25], [14, 26]])],
    [rectCommand('A', 10, 18, 4, 2), pixelsCommand('a', [[11, 20], [12, 20]])],
    [rectCommand('c', 6, 24, 12, 2), rectCommand('A', 7, 20, 4, 4), rectCommand('A', 13, 20, 4, 4)],
    [rectCommand('A', 4, 19, 4, 6), rectCommand('c', 16, 19, 4, 6)],
    [rectCommand('c', 5, 19, 14, 3), pixelsCommand('A', [[6, 19], [17, 19], [11, 24], [12, 24]])],
  ];
  return [...body, ...(patterns[look.outfitPattern] as DrawCommand[]), ...arms];
}

function portraitBodyCommands(look: CharacterLook): DrawCommand[] {
  const [left, right] = [2, 21] as const;
  const width = right - left + 1;
  return [
    rectCommand('C', 9, 16, 6, 1),
    rectCommand('C', 7, 17, 10, 1),
    rectCommand('C', 5, 18, 14, 1),
    rectCommand('C', 3, 19, 18, 1),
    rectCommand('C', left, 20, width, 9),
    rectCommand('c', left, 22, 2, 7),
    rectCommand('c', right - 1, 21, 2, 8),
    rectCommand('c', left + 2, 28, Math.max(2, width - 4), 1),
    ...(look.outfitPattern === 1
      ? [pixelsCommand('A', [[8, 18], [9, 19], [10, 20], [11, 21], [12, 22], [13, 23]])]
      : look.outfitPattern === 2
        ? [rectCommand('A', 10, 17, 4, 3)]
        : look.outfitPattern === 3
          ? [rectCommand('A', left + 3, 22, 4, 4), rectCommand('A', right - 6, 22, 4, 4)]
          : look.outfitPattern === 4
            ? [rectCommand('A', left, 20, 4, 8), rectCommand('c', right - 3, 20, 4, 8)]
            : look.outfitPattern === 5
              ? [rectCommand('c', left + 1, 20, width - 2, 3), rectCommand('A', 10, 24, 4, 2)]
              : [rectCommand('A', 10, 23, 4, 2)]),
  ];
}

function worldLegCommands(): CharacterSource['sourceLayers']['legs'] {
  const roundedBase = [
    rectCommand('D', 7, 28, 10, 1),
    rectCommand('K', 7, 29, 10, 1),
  ];
  /**
   * The stride pose.
   *
   * Row 28 stays one painted run so the contact shadow keeps a single anchor and
   * `shadowWorldY` does not move. Row 29 splits into two feet with a two-pixel gap. That gap
   * is the whole leg animation at this cell size, and it is enough because it alternates
   * against the arm swing in `composeFrontFrame`.
   *
   * Before this, both frames were the same commands and every walk cell was a byte-for-byte
   * duplicate of its pair — the "rounded floating movement" the old atlas check enforced.
   */
  const stride = [
    rectCommand('D', 7, 28, 10, 1),
    // Asymmetric on purpose: a 3px trailing foot and a 5px leading foot read as mid-stride,
    // where an even split either side of centre just reads as standing with the feet apart.
    rectCommand('K', 7, 29, 3, 1),
    rectCommand('K', 12, 29, 5, 1),
  ];
  return {
    frontFrames: [[...roundedBase], [...stride]],
    lateralFrames: [[...roundedBase], [...stride]],
  };
}

function oddityCommands(look: CharacterLook): DrawCommand[] {
  switch (look.oddity) {
    case 'tower-flat-top': return [
      rectCommand('H', 7, 1, 10, 1), rectCommand('H', 6, 2, 12, 2), rectCommand('H', 5, 4, 14, 2),
      rectCommand('h', 8, 1, 7, 1), rectCommand('h', 7, 2, 6, 1),
      rectCommand('h', 7, 3, 4, 1), rectCommand('h', 12, 3, 4, 1),
      pixelsCommand('K', [[9, 4], [10, 4], [11, 4], [12, 5], [13, 5], [14, 5], [15, 5]]),
    ];
    case 'question-forelock': return [pixelsCommand('H', [[15, 4], [16, 2], [18, 1], [20, 2], [20, 4], [18, 5], [17, 7]])];
    case 'window-glasses': return [
      rectCommand('K', 6, 12, 6, 1), rectCommand('K', 6, 15, 6, 1),
      rectCommand('K', 6, 13, 1, 2), rectCommand('K', 11, 13, 1, 2),
      rectCommand('K', 12, 12, 6, 1), rectCommand('K', 12, 15, 6, 1),
      rectCommand('K', 12, 13, 1, 2), rectCommand('K', 17, 13, 1, 2),
      rectCommand('K', 11, 13, 2, 1),
    ];
    case 'cloud-side-hair': return [rectCommand('H', 2, 5, 5, 15), rectCommand('H', 17, 4, 5, 16), pixelsCommand('h', [[3, 7], [4, 11], [20, 6], [19, 10], [20, 14]])];
    case 'spa-stone-bun': return [rectCommand('H', 8, 3, 8, 4), rectCommand('H', 9, 1, 6, 3), rectCommand('h', 10, 1, 4, 1)];
    case 'crossed-hair-sticks': return [pixelsCommand('A', [[5, 1], [7, 2], [9, 3], [11, 4], [13, 4], [15, 3], [17, 2], [19, 1]])];
    case 'prize-forelock': return [pixelsCommand('H', [[7, 3], [9, 2], [11, 1], [14, 1], [16, 2], [18, 3], [20, 4], [21, 5], [19, 6]]), pixelsCommand('h', [[10, 2], [13, 2], [16, 3], [19, 4]])];
    case 'curl-moustache': return [pixelsCommand('H', [[5, 15], [6, 16], [7, 17], [8, 16], [9, 15], [10, 16], [11, 17], [12, 17], [13, 17], [14, 16], [15, 15], [16, 16], [17, 17], [18, 16], [19, 15]])];
    case 'blade-collar': return [pixelsCommand('A', [[2, 16], [3, 17], [4, 18], [5, 19], [6, 20], [21, 16], [20, 17], [19, 18], [18, 19], [17, 20]])];
    case 'square-ear-defenders': return [rectCommand('A', 3, 7, 4, 8), rectCommand('A', 17, 7, 4, 8), rectCommand('K', 4, 8, 2, 6), rectCommand('K', 18, 8, 2, 6)];
    case 'tiny-pompadour': return [rectCommand('H', 10, 1, 5, 3), rectCommand('h', 12, 1, 2, 1)];
    case 'umbrella-hat': return [
      pixelsCommand('A', [[12, 1], [10, 2], [11, 2], [13, 2], [14, 2], [8, 3], [9, 3], [15, 3], [16, 3], [6, 4], [7, 4], [17, 4], [18, 4]]),
      rectCommand('A', 4, 5, 16, 1), pixelsCommand('a', [[6, 5], [10, 5], [14, 5], [18, 5]]),
      rectCommand('A', 12, 6, 1, 2),
    ];
    case 'planet-buns': return [rectCommand('H', 2, 2, 6, 6), rectCommand('H', 16, 2, 6, 6), pixelsCommand('h', [[3, 3], [17, 3]])];
    case 'moon-cap': return [pixelsCommand('A', [[6, 2], [8, 1], [10, 1], [12, 2], [13, 3], [12, 4], [10, 5], [8, 5], [6, 4], [5, 3]])];
    case 'giant-satchel': return [pixelsCommand('A', [[6, 15], [8, 17], [10, 19], [12, 21], [14, 23]]), rectCommand('A', 13, 18, 8, 9), rectCommand('a', 15, 20, 4, 3)];
    case 'lantern-chin': return [rectCommand('s', 9, 17, 6, 2), pixelsCommand('s', [[10, 19], [11, 20], [12, 20], [13, 20], [14, 19]])];
    case 'wide-straw-hat': return [rectCommand('A', 2, 3, 20, 3), rectCommand('a', 7, 1, 10, 3)];
    case 'tiny-hat-high-collar': return [rectCommand('A', 10, 1, 4, 2), rectCommand('A', 3, 13, 4, 8), rectCommand('A', 17, 13, 4, 8)];
    case 'single-bell-sleeve': return [rectCommand('C', 2, 17, 6, 8), rectCommand('c', 3, 18, 4, 3), rectCommand('S', 18, 17, 2, 6)];
    case 'giant-head-bow': return [pixelsCommand('A', [[3, 3], [4, 2], [5, 2], [6, 3], [7, 4], [8, 5], [16, 5], [17, 4], [18, 3], [19, 2], [20, 2], [21, 3], [12, 4]])];
    case 'tower-beanie': return [pixelsCommand('A', [[8, 6], [7, 5], [8, 3], [9, 2], [10, 1], [13, 1], [15, 2], [16, 4], [15, 6]]), rectCommand('A', 16, 12, 3, 13)];
    case 'side-fan-hair': return [pixelsCommand('H', [[16, 2], [18, 1], [20, 2], [21, 4], [20, 6], [18, 7], [16, 8]]), pixelsCommand('h', [[19, 3], [19, 5]])];
    case 'spiral-moustache': return [pixelsCommand('H', [[4, 16], [5, 15], [7, 15], [8, 16], [7, 17], [5, 17], [10, 16], [11, 17], [12, 17], [13, 16], [16, 16], [17, 15], [19, 15], [20, 16], [19, 17], [17, 17]])];
    case 'monocle-chain': return [
      rectCommand('A', 12, 12, 6, 1), rectCommand('A', 12, 15, 6, 1),
      rectCommand('A', 12, 13, 1, 2), rectCommand('A', 17, 13, 1, 2),
      pixelsCommand('A', [[17, 16], [18, 18], [17, 20], [16, 22], [15, 24]]),
    ];
    case 'wing-collar': return [pixelsCommand('a', [[3, 14], [4, 15], [5, 16], [6, 17], [7, 18], [20, 14], [19, 15], [18, 16], [17, 17], [16, 18]])];
    case 'loop-backpack': return [pixelsCommand('A', [[5, 17], [4, 15], [4, 10], [5, 7], [7, 5], [9, 4], [15, 4], [17, 5], [19, 7], [20, 10], [20, 16], [19, 18]])];
    case 'giant-gloves': return [rectCommand('A', 2, 18, 6, 7), rectCommand('A', 16, 18, 6, 7), rectCommand('a', 3, 19, 4, 3), rectCommand('a', 17, 19, 4, 3)];
    case 'one-ear-cap': return [rectCommand('A', 6, 2, 12, 4), rectCommand('A', 4, 5, 4, 9)];
    case 'soft-mohawk': return [pixelsCommand('H', [[9, 5], [9, 3], [10, 1], [12, 1], [14, 2], [16, 3], [17, 5], [16, 7]]), pixelsCommand('h', [[11, 2], [14, 3]])];
    case 'veil-cap': return [rectCommand('A', 9, 2, 6, 3), rectCommand('A', 18, 4, 3, 14), pixelsCommand('a', [[19, 6], [19, 9], [19, 13]])];
    case 'star-glasses': return [
      rectCommand('A', 6, 12, 5, 1), rectCommand('A', 6, 15, 5, 1),
      pixelsCommand('A', [[5, 13], [6, 14], [8, 11], [10, 14], [11, 13], [8, 16]]),
      rectCommand('A', 13, 12, 5, 1), rectCommand('A', 13, 15, 5, 1),
      pixelsCommand('A', [[12, 13], [13, 14], [15, 11], [17, 14], [18, 13], [15, 16]]),
      rectCommand('A', 11, 13, 2, 1),
    ];
    case 'shoulder-bird': return [rectCommand('A', 18, 16, 4, 6), pixelsCommand('a', [[18, 15], [19, 14], [20, 15], [21, 18]]), pixelsCommand('K', [[20, 16]])];
    case 'triple-braid': return [rectCommand('H', 3, 6, 3, 13), rectCommand('H', 10, 1, 3, 7), rectCommand('H', 18, 6, 3, 13), pixelsCommand('h', [[4, 9], [11, 3], [19, 9]])];
    case 'double-goggles': return [
      rectCommand('A', 4, 6, 16, 3), rectCommand('W', 6, 7, 5, 2), rectCommand('W', 14, 7, 5, 2),
      rectCommand('A', 6, 12, 6, 1), rectCommand('A', 6, 15, 6, 1),
      rectCommand('A', 6, 13, 1, 2), rectCommand('A', 11, 13, 1, 2),
      rectCommand('A', 12, 12, 6, 1), rectCommand('A', 12, 15, 6, 1),
      rectCommand('A', 12, 13, 1, 2), rectCommand('A', 17, 13, 1, 2),
    ];
    case 'shell-shoulders': return [
      rectCommand('A', 2, 18, 6, 5), rectCommand('A', 16, 18, 6, 5),
      pixelsCommand('a', [[3, 19], [4, 18], [6, 20], [5, 22], [17, 20], [18, 18], [20, 19], [19, 22]]),
    ];
    default: throw new Error(`Unknown character oddity ${look.oddity}.`);
  }
}

function secondaryWorldCommands(look: CharacterLook): DrawCommand[] {
  switch (look.secondary) {
    case 'tiny-waist-jacket': return [pixelsCommand('a', [[7, 17], [9, 19], [11, 21], [16, 17], [14, 19], [12, 21]]), rectCommand('A', 8, 23, 8, 1)];
    case 'shoulder-recorder': return [pixelsCommand('A', [[7, 16], [9, 18], [11, 20], [13, 22]]), rectCommand('A', 17, 17, 4, 7), rectCommand('K', 18, 18, 2, 2)];
    case 'long-scarf': return [rectCommand('A', 8, 17, 8, 2), rectCommand('A', 16, 18, 3, 9), pixelsCommand('a', [[17, 19], [18, 21], [17, 24], [18, 26]])];
    case 'flared-dress': return [rectCommand('C', 7, 19, 10, 2), rectCommand('C', 6, 21, 12, 2), rectCommand('C', 5, 23, 14, 3), rectCommand('c', 5, 25, 14, 1), pixelsCommand('A', [[9, 18], [14, 18]])];
    case 'towel-sleeve': return [rectCommand('W', 3, 17, 5, 8), rectCommand('D', 4, 19, 3, 1), rectCommand('A', 17, 21, 4, 5)];
    case 'clinic-pockets': return [rectCommand('W', 6, 21, 5, 4), rectCommand('W', 13, 21, 5, 4), pixelsCommand('A', [[7, 22], [14, 22]])];
    case 'luggage-strap': return [pixelsCommand('A', [[6, 16], [8, 17], [9, 19], [11, 20], [12, 22], [14, 23], [15, 25]]), rectCommand('A', 17, 20, 5, 8), rectCommand('a', 18, 22, 3, 2)];
    case 'cook-apron-ladle': return [rectCommand('W', 8, 18, 8, 7), rectCommand('D', 18, 16, 1, 9), rectCommand('D', 17, 24, 3, 2), pixelsCommand('A', [[11, 20], [12, 20]])];
    case 'asymmetric-sleeves': return [rectCommand('C', 3, 17, 3, 8), rectCommand('S', 18, 18, 2, 4), rectCommand('A', 3, 24, 3, 1)];
    case 'permit-pouch': return [pixelsCommand('A', [[7, 16], [9, 18], [11, 20], [13, 22]]), rectCommand('A', 14, 20, 6, 6), rectCommand('K', 16, 21, 2, 1)];
    case 'bow-tie': return [pixelsCommand('A', [[8, 18], [9, 17], [11, 19], [12, 18], [13, 19], [15, 17], [16, 18]]), rectCommand('a', 11, 18, 3, 2)];
    case 'rain-cape': return [rectCommand('C', 5, 17, 14, 3), rectCommand('C', 4, 20, 16, 4), rectCommand('C', 3, 24, 18, 2), rectCommand('c', 4, 25, 16, 1)];
    case 'big-black-boots': return [rectCommand('D', 5, 25, 14, 3), rectCommand('K', 6, 28, 12, 1), rectCommand('K', 7, 29, 10, 1), pixelsCommand('A', [[7, 26], [16, 26]])];
    case 'bright-cuff': return [rectCommand('A', 4, 20, 3, 3), pixelsCommand('a', [[5, 21]]), rectCommand('C', 18, 18, 2, 5)];
    case 'guitar-case': return [pixelsCommand('A', [[6, 16], [8, 17], [10, 19], [12, 21], [14, 23]]), rectCommand('D', 17, 15, 4, 13), rectCommand('K', 16, 18, 6, 7), rectCommand('A', 18, 16, 2, 2)];
    case 'short-jacket': return [rectCommand('c', 6, 17, 12, 5), rectCommand('A', 7, 21, 10, 1), pixelsCommand('a', [[11, 18], [12, 18]])];
    case 'double-braids': return [rectCommand('H', 4, 8, 3, 12), rectCommand('H', 17, 8, 3, 12), pixelsCommand('h', [[5, 11], [5, 15], [18, 11], [18, 15]])];
    case 'flared-coat': return [rectCommand('C', 8, 18, 8, 2), rectCommand('C', 6, 20, 12, 2), rectCommand('C', 4, 22, 16, 4), pixelsCommand('A', [[11, 20], [12, 20]])];
    case 'opposite-ponytail': return [rectCommand('H', 3, 6, 4, 8), pixelsCommand('h', [[4, 7], [5, 10], [4, 13]])];
    case 'split-tunic': return [rectCommand('c', 5, 18, 7, 7), rectCommand('A', 12, 18, 7, 7), rectCommand('K', 11, 18, 2, 7)];
    case 'round-vest-button': return [rectCommand('c', 7, 17, 10, 8), pixelsCommand('A', [[11, 18], [12, 18], [11, 21], [12, 21]])];
    case 'side-fastened-jacket': return [pixelsCommand('A', [[15, 17], [15, 19], [15, 21], [15, 23]]), rectCommand('c', 6, 17, 3, 8)];
    case 'tiny-waist-belt': return [rectCommand('D', 8, 22, 8, 1), pixelsCommand('A', [[11, 22], [12, 22]])];
    case 'charm-bracelet': return [rectCommand('A', 18, 21, 3, 1), pixelsCommand('a', [[18, 23], [20, 24], [21, 22]])];
    case 'half-cape': return [rectCommand('A', 4, 16, 7, 10), rectCommand('a', 5, 18, 2, 7), pixelsCommand('A', [[11, 17], [12, 18]])];
    case 'suspenders': return [rectCommand('A', 8, 17, 2, 8), rectCommand('A', 14, 17, 2, 8), rectCommand('a', 9, 23, 6, 1)];
    case 'pearl-necklace': return [pixelsCommand('W', [[8, 16], [9, 17], [10, 18], [11, 18], [12, 18], [13, 18], [14, 17], [15, 16]]), pixelsCommand('A', [[11, 19], [12, 19]])];
    case 'star-cuff': return [pixelsCommand('A', [[18, 19], [19, 20], [21, 20], [20, 21], [21, 22], [19, 22], [18, 23], [18, 21], [17, 20]])];
    case 'large-necklace': return [pixelsCommand('A', [[6, 16], [7, 18], [8, 19], [9, 20], [10, 21], [11, 22], [12, 22], [13, 21], [14, 20], [15, 19], [16, 18], [17, 16]]), rectCommand('a', 10, 22, 4, 3)];
    case 'thin-ponytail': return [pixelsCommand('H', [[18, 6], [19, 8], [20, 10], [20, 12], [19, 14], [20, 16], [19, 18]]), pixelsCommand('h', [[20, 11], [19, 17]])];
  }
}

function secondaryPortraitCommands(look: CharacterLook): DrawCommand[] {
  if (look.secondary === 'big-black-boots') {
    return [
      rectCommand('D', 7, 23, 4, 5),
      rectCommand('D', 13, 23, 4, 5),
      rectCommand('K', 6, 27, 5, 2),
      rectCommand('K', 13, 27, 5, 2),
    ];
  }
  return secondaryWorldCommands(look).filter((command) => (
    command.kind === 'rect'
      ? command.y + command.height <= PORTRAIT_CELL.height
      : command.points.every(([, y]) => y < PORTRAIT_CELL.height)
  ));
}

function portraitTransform(commands: readonly DrawCommand[]): DrawCommand[] {
  return commands.map((command) => {
    if (command.kind === 'rect') {
      return rectCommand(command.token, command.x, command.y, command.width, command.height);
    }
    return pixelsCommand(command.token, command.points);
  });
}

export function getCharacterIdentityCommandSets(look: CharacterLook): Readonly<{
  primaryWorld: readonly DrawCommand[];
  secondaryWorld: readonly DrawCommand[];
  primaryPortrait: readonly DrawCommand[];
  secondaryPortrait: readonly DrawCommand[];
}> {
  const primaryWorld = oddityCommands(look);
  return Object.freeze({
    primaryWorld,
    secondaryWorld: secondaryWorldCommands(look),
    primaryPortrait: portraitTransform(primaryWorld),
    secondaryPortrait: secondaryPortraitCommands(look),
  });
}

export function getCharacterGeometryCommandSets(look: CharacterLook): Readonly<{
  worldBody: readonly DrawCommand[];
  portraitBody: readonly DrawCommand[];
  legs: CharacterSource['sourceLayers']['legs'];
}> {
  return Object.freeze({
    worldBody: worldBodyCommands(look),
    portraitBody: portraitBodyCommands(look),
    legs: worldLegCommands(),
  });
}

function buildCharacterSource(look: CharacterLook): CharacterSource {
  const baseHair = worldHairCommands(look);
  const geometry = getCharacterGeometryCommandSets(look);
  const body = geometry.worldBody;
  const features = getCharacterIdentityCommandSets(look);
  const oddity = features.primaryWorld;
  const secondary = features.secondaryWorld;
  const layerCommands = {
    torsoAndClothing: [
      ...body,
      ...(look.oddityLayer === 'torsoAndClothing' ? oddity : []),
      ...(look.secondaryLayer === 'torsoAndClothing' ? secondary : []),
    ],
    hair: [
      ...baseHair,
      ...(look.oddityLayer === 'hair' ? oddity : []),
      ...(look.secondaryLayer === 'hair' ? secondary : []),
      ...worldHairTextureCommands(look),
    ],
    accessory: [
      ...(look.oddityLayer === 'accessory' ? oddity : []),
      ...(look.secondaryLayer === 'accessory' ? secondary : []),
    ],
    heldItem: [
      ...(look.oddityLayer === 'heldItem' ? oddity : []),
      ...(look.secondaryLayer === 'heldItem' ? secondary : []),
    ],
  };
  const portraitOddity = features.primaryPortrait;
  const portraitHair = portraitTransform([...baseHair, ...worldHairTextureCommands(look)]);
  const portraitSecondary = features.secondaryPortrait;
  const portraitLayerCommands = {
    torsoAndClothing: [
      ...geometry.portraitBody,
      ...(look.oddityLayer === 'torsoAndClothing' ? portraitOddity : []),
      ...(look.secondaryLayer === 'torsoAndClothing' ? portraitSecondary : []),
    ],
    hair: [
      ...portraitHair,
      ...(look.oddityLayer === 'hair' ? portraitOddity : []),
      ...(look.secondaryLayer === 'hair' ? portraitSecondary : []),
    ],
    accessory: [
      ...(look.oddityLayer === 'accessory' ? portraitOddity : []),
      ...(look.secondaryLayer === 'accessory' ? portraitSecondary : []),
    ],
    heldItem: [
      ...(look.oddityLayer === 'heldItem' ? portraitOddity : []),
      ...(look.secondaryLayer === 'heldItem' ? portraitSecondary : []),
    ],
  };
  const expressions = Object.fromEntries(look.expressions.map((expression) => [
    expression,
    { commands: portraitExpressionCommands(expression, look) },
  ])) as CharacterSource['portraitExpressions'];
  return CharacterSourceSchema.parse({
    id: look.id,
    displayName: look.displayName,
    kind: look.kind,
    cell: WORLD_CELL,
    portraitCell: PORTRAIT_CELL,
    palette: characterPalette(look),
    identityTokens: { hair: 'H', clothing: 'C', skin: 'S' },
    identityFeatures: [
      {
        id: look.oddity,
        description: look.signatureOddity,
        layer: look.oddityLayer,
        visibleIn: ['front', 'rear', 'left', 'right'],
      },
      {
        id: look.secondary,
        description: look.supportingFeature,
        layer: look.secondaryLayer,
        visibleIn: ['front', 'rear', 'left', 'right'],
      },
    ],
    rearStyle: { head: 'H', lower: 's', clothing: 'C', torsoDetailTokens: ['c', 'A', 'a'] },
    signatureOddity: {
      id: look.oddity,
      description: look.signatureOddity,
      supportingFeature: look.supportingFeature,
    },
    sourceLayers: {
      legs: geometry.legs,
      torsoAndClothing: { commands: layerCommands.torsoAndClothing },
      headAndFace: { commands: worldHeadCommands(look) },
      hair: { commands: layerCommands.hair },
      accessory: { commands: layerCommands.accessory },
      heldItem: { commands: layerCommands.heldItem },
    },
    portraitLayers: {
      legs: { commands: [] },
      torsoAndClothing: { commands: portraitLayerCommands.torsoAndClothing },
      headAndFace: { commands: portraitHeadCommands(look) },
      hair: { commands: portraitLayerCommands.hair },
      accessory: { commands: portraitLayerCommands.accessory },
      heldItem: { commands: portraitLayerCommands.heldItem },
    },
    portraitExpressions: expressions,
  });
}

function validateCharacter(source: CharacterSource): CharacterSource {
  const worldCommands = [
    ...source.sourceLayers.legs.frontFrames.flat(),
    ...source.sourceLayers.legs.lateralFrames.flat(),
    ...source.sourceLayers.torsoAndClothing.commands,
    ...source.sourceLayers.headAndFace.commands,
    ...source.sourceLayers.hair.commands,
    ...source.sourceLayers.accessory.commands,
    ...(source.sourceLayers.heldItem?.commands ?? []),
  ];
  const portraitCommands = [
    ...Object.values(source.portraitLayers).flatMap((layer) => layer?.commands ?? []),
    ...Object.values(source.portraitExpressions).flatMap((layer) => layer?.commands ?? []),
  ];
  assertCommandBounds(worldCommands, WORLD_CELL.width, WORLD_CELL.height);
  assertCommandBounds(portraitCommands, PORTRAIT_CELL.width, PORTRAIT_CELL.height);
  for (const command of [...worldCommands, ...portraitCommands]) {
    if (!source.palette[command.token]) {
      throw new Error(`${source.id} uses missing palette token ${command.token}.`);
    }
  }
  if (new Set(source.identityFeatures.map(({ id }) => id)).size !== source.identityFeatures.length) {
    throw new Error(`${source.id} identity feature IDs must be unique.`);
  }
  if (source.kind === 'named' && (!source.portraitExpressions.joy || !source.portraitExpressions.upset)) {
    throw new Error(`${source.id} must generate rest, joy, and upset portraits.`);
  }
  if (!source.identityFeatures.some(({ visibleIn }) => (
    ['front', 'rear', 'left', 'right'] as const
  ).every((direction) => visibleIn.includes(direction)))) {
    throw new Error(`${source.id} must document one identity feature in all four directions.`);
  }
  for (const frameIndex of [0, 1] as const) {
    const frame = composeFrontFrame(source, frameIndex);
    if (
      [...frame[0] as string].some((token) => token !== '.') ||
      frame.some((row) => row[0] !== '.' || row[WORLD_CELL.width - 1] !== '.')
    ) {
      throw new Error(`${source.id} must keep top, left, and right source margins open.`);
    }
  }
  const portrait = composePortrait(source);
  if (
    [...portrait[0] as string].some((token) => token !== '.') ||
    portrait.some((row) => row[0] !== '.' || row[PORTRAIT_CELL.width - 1] !== '.')
  ) {
    throw new Error(`${source.id} portrait must keep top, left, and right contour margins open.`);
  }
  return source;
}

export function loadCharacterSources(root = process.cwd()): CharacterSource[] {
  void root;
  const sources = CHARACTER_LOOKS
    .map(buildCharacterSource)
    .map(validateCharacter)
    .sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const ids = sources.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Character source IDs must be unique.');
  }
  const oddities = sources.map(({ signatureOddity }) => signatureOddity.id);
  if (new Set(oddities).size !== oddities.length) {
    throw new Error('Character signature oddities must be unique.');
  }
  return sources;
}

export function loadTileSources(root = process.cwd()): GroundCellSource[] {
  const sources = loadTileCollections(root).flatMap(({ tiles }) => tiles);
  sources.forEach(validateTileSource);
  assertUniqueSourceIds('Ground cell', sources.map(({ id }) => id));
  return sources;
}

export function loadTransparentPartSources(root = process.cwd()): TransparentPartSource[] {
  const sources = loadTileCollections(root).flatMap(({ parts }) => parts);
  sources.forEach(validateTileSource);
  assertUniqueSourceIds('Transparent part', sources.map(({ id }) => id));
  return sources;
}

export function loadPresentationCellSources(root = process.cwd()): PresentationCellSource[] {
  const sources = loadTileCollections(root).flatMap(({ presentationCells }) => presentationCells);
  sources.forEach(validateTileSource);
  assertUniqueSourceIds('Presentation cell', sources.map(({ id }) => id));
  return sources;
}

export function loadMultiTileCompositions(root = process.cwd()): MultiTileComposition[] {
  const collections = loadTileCollections(root);
  const compositions = collections.flatMap(({ multiTileCompositions }) => multiTileCompositions);
  assertUniqueSourceIds('Multi-tile composition', compositions.map(({ id }) => id));
  const partIds = new Set(collections.flatMap(({ parts }) => parts.map(({ id }) => id)));
  for (const composition of compositions) {
    for (const partId of composition.partIds) {
      if (!partIds.has(partId)) throw new Error(`${composition.id} references missing part ${partId}.`);
    }
  }
  return compositions;
}

export function loadWallSources(root = process.cwd()): WallSource[] {
  const sources = loadTileCollections(root).flatMap(({ wallModules, wallPalettes }) =>
    wallPalettes.map(({ id, palette, modules }) => ({ id, palette, modules: modules ?? wallModules })),
  );
  assertUniqueSourceIds('Wall palette', sources.map(({ id }) => id));
  for (const source of sources) {
    const commands = Object.values(source.modules).flat();
    assertCommandBounds(commands, TILE_CELL.width, TILE_CELL.height);
    for (const command of commands) {
      if (!source.palette[command.token]) {
        throw new Error(`Wall ${source.id} uses missing palette token ${command.token}.`);
      }
    }
  }
  return sources;
}

export function emptyTokenFrame(width: number, height: number): TokenFrame {
  return Array.from({ length: height }, () => '.'.repeat(width));
}

export function drawTokenCommands(frame: TokenFrame, commands: readonly DrawCommand[]): void {
  const height = frame.length;
  const width = frame[0]?.length ?? 0;
  assertCommandBounds(commands, width, height);
  const setToken = (x: number, y: number, token: string): void => {
    const row = [...(frame[y] as string)];
    row[x] = token;
    frame[y] = row.join('');
  };
  for (const command of commands) {
    if (command.kind === 'rect') {
      for (let y = command.y; y < command.y + command.height; y += 1) {
        for (let x = command.x; x < command.x + command.width; x += 1) {
          setToken(x, y, command.token);
        }
      }
    } else {
      for (const [x, y] of command.points) {
        setToken(x, y, command.token);
      }
    }
  }
}

export function tokenFrameToBitmap(frame: readonly string[], palette: Readonly<Record<string, string>>): Bitmap {
  const bitmap = createBitmap(frame[0]?.length ?? 0, frame.length);
  for (let y = 0; y < frame.length; y += 1) {
    for (let x = 0; x < (frame[y]?.length ?? 0); x += 1) {
      const token = frame[y]?.[x];
      if (token && token !== '.') {
        const color = palette[token];
        if (!color) {
          throw new Error(`Token frame uses missing palette token ${token}.`);
        }
        setPixel(bitmap, x, y, parseHexColor(color));
      }
    }
  }
  return bitmap;
}

export function addOutwardContour(
  source: Bitmap,
  color: Rgba,
  keepBottomRowOpen = false,
): Bitmap {
  const output = { width: source.width, height: source.height, data: Buffer.from(source.data) };
  const painted = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= source.width || y >= source.height) return false;
    return source.data[(y * source.width + x) * 4 + 3] !== 0;
  };
  for (let y = 0; y < source.height; y += 1) {
    if (keepBottomRowOpen && y === source.height - 1) continue;
    for (let x = 0; x < source.width; x += 1) {
      if (painted(x, y)) continue;
      if (painted(x - 1, y) || painted(x + 1, y) || painted(x, y - 1) || painted(x, y + 1)) {
        setPixel(output, x, y, color);
      }
    }
  }
  return output;
}

function staticWorldLayers(source: CharacterSource): readonly DrawCommand[][] {
  return [
    source.sourceLayers.torsoAndClothing.commands,
    source.sourceLayers.headAndFace.commands,
    source.sourceLayers.hair.commands,
    source.sourceLayers.accessory.commands,
    source.sourceLayers.heldItem?.commands ?? [],
  ];
}

/**
 * The two-pixel gap that turns the rounded base into two feet on the stride frame.
 *
 * The lateral gap sits at x11-12 rather than x10-11 because the lateral base is narrower and
 * offset. It is also symmetric about the cell centre, so `mirrorCommand` maps {11,12} back onto
 * itself and one carve serves both facings.
 */
export const STRIDE_GAP = { row: 29, from: 10, to: 11 } as const;
export const LATERAL_STRIDE_GAP = { row: 29, from: 11, to: 12 } as const;

/**
 * Clears a stride gap after every layer has drawn.
 *
 * The base is painted early, so anything later filling row 29 closes the split back up:
 * `big-black-boots` emits `rect K 7,29,10,1` from a static layer, and resident-16's feature
 * covers the same row. Carving last makes the stride survive whatever draws over the contact
 * row, the same way the hand stamp is applied last.
 */
export function carveStrideGap(
  frame: TokenFrame,
  gap: Readonly<{ row: number; from: number; to: number }> = STRIDE_GAP,
): void {
  const row = frame[gap.row];
  if (row === undefined) return;
  const cells = [...row];
  for (let x = gap.from; x <= gap.to; x += 1) cells[x] = '.';
  frame[gap.row] = cells.join('');
}

/**
 * The stride's swinging arm pixels: one high on the left, one low on the right.
 *
 * `torsoAndClothing` is a `StaticLayerSchema` — one command list with no frame index — so the
 * swing cannot live in that layer. These sit outside the torso rects, at rows the row-24 hand
 * stamp does not touch, which is why the hands themselves never move.
 */
const WORLD_STRIDE_ARM_POINTS: readonly (readonly [number, number])[] = [[3, 23], [20, 25]];

/**
 * Paints a token only where the cell is still empty.
 *
 * Six looks already occupy a swing cell at idle: `giant-gloves` (A 2,18,6,7),
 * `single-bell-sleeve` (C 2,17,6,8) and `towel-sleeve` (W 3,17,5,8) at [3,23];
 * `towel-sleeve` (A 17,21,4,5), `luggage-strap` (A 17,20,5,8) and `guitar-case`
 * (D 17,15,4,13) at [20,25]. Overwriting them would erase costume on every stride, and
 * `luggage-strap` is the protagonist's own supporting feature. `towel-sleeve` occupies both,
 * so mina-park swings neither arm and takes its walk from the feet alone.
 */
function paintEmptyPoints(
  frame: TokenFrame,
  token: string,
  points: readonly (readonly [number, number])[],
): void {
  for (const [x, y] of points) {
    const row = frame[y];
    if (row === undefined || row[x] !== '.') continue;
    const cells = [...row];
    cells[x] = token;
    frame[y] = cells.join('');
  }
}

export function composeFrontFrame(source: CharacterSource, frameIndex: 0 | 1): TokenFrame {
  const frame = emptyTokenFrame(WORLD_CELL.width, WORLD_CELL.height);
  drawTokenCommands(frame, source.sourceLayers.legs.frontFrames[frameIndex]);
  for (const commands of staticWorldLayers(source)) {
    drawTokenCommands(frame, commands);
  }
  if (frameIndex === 1) {
    paintEmptyPoints(frame, 'L', WORLD_STRIDE_ARM_POINTS);
    carveStrideGap(frame);
  }
  const hairMask = emptyTokenFrame(WORLD_CELL.width, WORLD_CELL.height);
  drawTokenCommands(hairMask, source.sourceLayers.hair.commands);
  applyConnectedHairLighting(frame, hairMask, 21);
  if (source.id !== 'resident-16') {
    drawTokenCommands(frame, [
      pixelsCommand('L', [[3, 24], [20, 24]]),
      pixelsCommand('S', [[4, 24], [19, 24]]),
    ]);
  }
  return frame;
}

/** Rows of the 24x30 cell that the blink overlay replaces. */
export const EYE_BAND = { top: 12, height: 3 } as const;

/** Columns the eye whites occupy: `rect W 7,13,4,2` and `rect W 13,13,4,2`. */
const EYE_COLUMNS: readonly number[] = [7, 8, 9, 10, 13, 14, 15, 16];

/**
 * The idle front frame with the eyes closed, cut to rows 12-14.
 *
 * Sliced from a full compose rather than drawn standalone. Several looks paint inside these
 * rows from other layers — `star-glasses` puts an accent at [10,14], `window-glasses` frames
 * the whole eye region — and a standalone band would pop those pixels off for the length of a
 * blink. Only `W`, `K` and `D` inside the eye columns are rewritten, so accessory tokens and
 * the mouth pixel at [11,14] survive untouched.
 *
 * Rows 12-14, not 12-16: the mouth sits at [11,14] and [12,15], and a band reaching row 15
 * would erase it. A blink that collapses the face is worse than no blink.
 *
 * The protagonist's atlas cell is its AUTHORED front-1, not this generated compose, so the
 * band is sliced from the same source the body cell uses or the eye region would swap to a
 * different face mid-blink.
 */
export function composeEyeBand(source: CharacterSource): TokenFrame {
  const base = protagonistReferenceFrames(source.id)?.['front-1'] ?? composeFrontFrame(source, 0);
  const closed = base.map((row, y) => {
    if (y < 13 || y > 14) return row;
    const cells = [...row];
    for (const x of EYE_COLUMNS) {
      if (['W', 'K', 'D'].includes(cells[x] as string)) cells[x] = y === 13 ? 'K' : 's';
    }
    return cells.join('');
  });
  return closed.slice(EYE_BAND.top, EYE_BAND.top + EYE_BAND.height) as unknown as TokenFrame;
}

export function composePortrait(
  source: CharacterSource,
  expression: PortraitExpression = 'rest',
): TokenFrame {
  const frame = emptyTokenFrame(PORTRAIT_CELL.width, PORTRAIT_CELL.height);
  for (const layerName of ['legs', 'torsoAndClothing', 'headAndFace'] as const) {
    const layer = source.portraitLayers[layerName];
    if (layer) {
      drawTokenCommands(frame, layer.commands);
    }
  }
  const expressionLayer = source.portraitExpressions[expression];
  if (!expressionLayer) {
    throw new Error(`${source.id} does not define the ${expression} portrait expression.`);
  }
  drawTokenCommands(frame, expressionLayer.commands);
  for (const layerName of ['hair', 'accessory', 'heldItem'] as const) {
    const layer = source.portraitLayers[layerName];
    if (layer) drawTokenCommands(frame, layer.commands);
  }
  const hairMask = emptyTokenFrame(PORTRAIT_CELL.width, PORTRAIT_CELL.height);
  drawTokenCommands(hairMask, source.portraitLayers.hair.commands);
  applyConnectedHairLighting(frame, hairMask, 21);
  return frame;
}

const ENVIRONMENT_PALETTES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  'warm-sand': Object.freeze({ B: '#789657', L: '#9ab96c', D: '#587444', P: '#3f5638' }),
  'dune-grass': Object.freeze({ B: '#927d50', L: '#aa955f', G: '#65834a', g: '#3e5b38', D: '#6b5c40' }),
  'villa-floor': Object.freeze({ B: '#51443e', L: '#68574e', D: '#3b3431', K: '#282629' }),
  'spa-stone': Object.freeze({ B: '#68645c', L: '#858077', D: '#514e49', K: '#393837' }),
  'plaza-paver': Object.freeze({ B: '#6c5a50', L: '#887267', D: '#54463f', K: '#3b3331' }),
  boardwalk: Object.freeze({ B: '#674c3d', L: '#876650', D: '#49372f', K: '#2d2523' }),
  'shallow-water': Object.freeze({ B: '#355f63', L: '#507b79', W: '#91aaa0', D: '#29494f' }),
  'garden-soil': Object.freeze({ B: '#514238', L: '#6b5748', D: '#38322f', G: '#5c6947', g: '#3c4735' }),
  'pale-concrete': Object.freeze({ B: '#8d877d', L: '#a39d91', D: '#716d66', K: '#5d5a56' }),
  'dark-asphalt': Object.freeze({ B: '#252832', L: '#353a48', D: '#191c24', Y: '#b99955' }),
  'neon-paver': Object.freeze({ B: '#555b66', L: '#717985', D: '#424852', K: '#303540' }),
  'neon-floor': Object.freeze({ B: '#302a38', L: '#44394d', D: '#24232d', K: '#191b23' }),
  'city-lot': Object.freeze({ B: '#383d47', L: '#4f5661', D: '#2c3038', K: '#22252c' }),
});

let terrainDetailTextureCache: Bitmap | undefined;

function terrainDetailTexture(): Bitmap {
  terrainDetailTextureCache ??= decodePng(readFileSync(resolve(
    process.cwd(),
    'assets/source/art/terrain-detail-source.png',
  )));
  return terrainDetailTextureCache;
}

function sampledTerrainLuminance(sourceId: string, x: number, y: number): number {
  const texture = terrainDetailTexture();
  const seed = stableArtSeed(`generated-terrain:${sourceId}`);
  const sampleStride = 5;
  const sampleSpan = TILE_CELL.width * sampleStride + 2;
  const startX = seed % Math.max(1, texture.width - sampleSpan);
  const startY = (seed >>> 12) % Math.max(1, texture.height - sampleSpan);
  let luminance = 0;
  for (let sampleY = 0; sampleY < 2; sampleY += 1) {
    for (let sampleX = 0; sampleX < 2; sampleX += 1) {
      const textureX = startX + x * sampleStride + sampleX;
      const textureY = startY + y * sampleStride + sampleY;
      const offset = (textureY * texture.width + textureX) * 4;
      luminance +=
        (texture.data[offset] as number) * 0.2126 +
        (texture.data[offset + 1] as number) * 0.7152 +
        (texture.data[offset + 2] as number) * 0.0722;
    }
  }
  return luminance / 4;
}

function sourceFamily(sourceId: string): string {
  return sourceId.replace(/-[b-d]$/u, '');
}

function stableArtSeed(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function noiseHash(seed: number, x: number, y: number): number {
  let value = seed ^ Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x7f4a, 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function shiftColor(color: Rgba, amount: number): Rgba {
  return [
    clampChannel(color[0] + amount),
    clampChannel(color[1] + amount * 0.92),
    clampChannel(color[2] + amount * 0.78),
    color[3],
  ];
}

function paletteForTile(source: TileSource): Readonly<Record<string, string>> {
  if (source.cellClass !== 'ground') return source.palette;
  const override = ENVIRONMENT_PALETTES[sourceFamily(source.id)];
  return override ? Object.freeze({ ...source.palette, ...override }) : source.palette;
}

function addGroundMaterialTexture(
  bitmap: Bitmap,
  source: GroundCellSource,
  palette: Readonly<Record<string, string>>,
): Bitmap {
  const base = parseHexColor(palette[source.backgroundToken] as string);
  const seed = stableArtSeed(`ground:${source.id}`);
  const natural = [
    'warm-sand', 'dune-grass', 'garden-soil', 'sunset-cobble', 'sunset-paver',
  ].includes(sourceFamily(source.id));
  const roughExterior = [
    'neon-paver', 'dark-asphalt', 'city-lot', 'harbor-yard', 'harbor-concrete',
    'harbor-quay', 'dock-route', 'dock-boardwalk', 'sunset-cobble', 'sunset-paver',
    'sunset-promenade', 'sunset-mosaic',
  ].includes(sourceFamily(source.id));
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const offset = (y * bitmap.width + x) * 4;
      if (
        bitmap.data[offset] !== base[0] || bitmap.data[offset + 1] !== base[1] ||
        bitmap.data[offset + 2] !== base[2] || bitmap.data[offset + 3] !== 255
      ) continue;
      const broad = (noiseHash(seed, Math.floor(x / 5), Math.floor(y / 5)) % 17) - 8;
      const fine = (noiseHash(seed ^ 0x5bd1e995, x, y) % 9) - 4;
      const grainRoll = noiseHash(seed ^ 0x27d4eb2d, x, y) % 100;
      const grain = natural && grainRoll < 13
        ? (grainRoll % 2 === 0 ? -11 : 8)
        : roughExterior && grainRoll < 10
          ? (grainRoll % 2 === 0 ? -8 : 6)
          : 0;
      let mottle = 0;
      if (natural || roughExterior) {
        for (let patch = 0; patch < 3; patch += 1) {
          const patchSeed = seed ^ Math.imul(patch + 1, 0x45d9f3b);
          const centerX = 5 + (noiseHash(patchSeed, 1, 0) % 23);
          const centerY = 5 + (noiseHash(patchSeed, 0, 1) % 23);
          const radiusX = 8 + (noiseHash(patchSeed, 2, 0) % 8);
          const radiusY = 7 + (noiseHash(patchSeed, 0, 2) % 9);
          const distance = ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2;
          if (distance < 1) {
            const direction = (noiseHash(patchSeed, 3, 3) & 1) === 0 ? -1 : 1;
            mottle += direction * (1 - distance) * (natural ? 5 + patch * 2 : 4 + patch);
          }
        }
      }
      const edgeFade = 0.55 + Math.min(0.45, Math.max(0, Math.min(x, y, 31 - x, 31 - y) / 7));
      const interiorTile = ['villa-floor', 'neon-floor', 'dock-floor', 'sunset-floor'].includes(sourceFamily(source.id));
      const generatedDetail = (sampledTerrainLuminance(source.id, x, y) - 155.9) *
        (natural ? 0.44 : interiorTile ? 0.2 : roughExterior ? 0.34 : 0.11);
      setPixel(bitmap, x, y, shiftColor(
        base,
        broad * 0.7 + fine * 0.55 + grain * 0.8 +
          (mottle * (natural ? 1.15 : 0.95) + generatedDetail) * edgeFade,
      ));
    }
  }
  return bitmap;
}

function addInteriorTileGrid(
  bitmap: Bitmap,
  palette: Readonly<Record<string, string>>,
): Bitmap {
  const grout = parseHexColor(palette.K as string);
  const innerEdge = parseHexColor(palette.D as string);
  for (let coordinate = 0; coordinate < TILE_CELL.width; coordinate += 1) {
    setPixel(bitmap, coordinate, 0, grout);
    setPixel(bitmap, 0, coordinate, grout);
  }
  for (let coordinate = 2; coordinate < TILE_CELL.width; coordinate += 1) {
    setPixel(bitmap, coordinate, 1, innerEdge);
    setPixel(bitmap, 1, coordinate, innerEdge);
  }
  return bitmap;
}

function paintEllipse(
  bitmap: Bitmap,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  color: Rgba,
  seed = 0,
): void {
  const left = Math.max(0, Math.floor(centerX - radiusX));
  const right = Math.min(bitmap.width - 1, Math.ceil(centerX + radiusX));
  const top = Math.max(0, Math.floor(centerY - radiusY));
  const bottom = Math.min(bitmap.height - 1, Math.ceil(centerY + radiusY));
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const normalizedX = (x - centerX) / Math.max(1, radiusX);
      const normalizedY = (y - centerY) / Math.max(1, radiusY);
      const edgeJitter = ((noiseHash(seed, x, y) % 9) - 4) / 45;
      if (normalizedX * normalizedX + normalizedY * normalizedY <= 1 + edgeJitter) {
        setPixel(bitmap, x, y, color);
      }
    }
  }
}

function paintLine(
  bitmap: Bitmap,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: Rgba,
  thickness = 1,
): void {
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY), 1);
  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(fromX + ((toX - fromX) * step) / steps);
    const y = Math.round(fromY + ((toY - fromY) * step) / steps);
    for (let offsetY = 0; offsetY < thickness; offsetY += 1) {
      for (let offsetX = 0; offsetX < thickness; offsetX += 1) {
        if (x + offsetX < bitmap.width && y + offsetY < bitmap.height) {
          setPixel(bitmap, x + offsetX, y + offsetY, color);
        }
      }
    }
  }
}

function renderEnvironmentDecal(sourceId: string): Bitmap | undefined {
  const bitmap = createBitmap(TILE_CELL.width, TILE_CELL.height);
  const shadow: Rgba = [35, 31, 27, 105];
  if (sourceId === 'decal-sand-ripple') {
    paintEllipse(bitmap, 16, 22, 15, 10, [76, 67, 48, 34], 0);
    paintEllipse(bitmap, 16, 25, 11, 3, shadow, 1);
    const dark = parseHexColor('#435c38');
    const mid = parseHexColor('#64804a');
    const light = parseHexColor('#8fa15b');
    [[7, 24, 10, 12], [11, 25, 13, 9], [15, 25, 17, 10], [19, 25, 23, 13], [23, 25, 26, 15]]
      .forEach(([x1, y1, x2, y2]) => paintLine(bitmap, x1!, y1!, x2!, y2!, dark));
    [[9, 24, 12, 15], [14, 25, 15, 13], [18, 25, 20, 14], [22, 25, 24, 17]]
      .forEach(([x1, y1, x2, y2]) => paintLine(bitmap, x1!, y1!, x2!, y2!, mid));
    paintLine(bitmap, 15, 22, 17, 13, light);
    return bitmap;
  }
  if (sourceId === 'decal-sand-pebbles') {
    const stones = [
      { x: 8, y: 22, rx: 4, ry: 3 }, { x: 16, y: 17, rx: 3, ry: 2 },
      { x: 23, y: 23, rx: 5, ry: 3 }, { x: 26, y: 14, rx: 2, ry: 2 },
    ];
    for (const [index, stone] of stones.entries()) {
      paintEllipse(bitmap, stone.x + 1, stone.y + 2, stone.rx + 1, stone.ry, shadow, 10 + index);
      paintEllipse(bitmap, stone.x, stone.y, stone.rx, stone.ry, parseHexColor('#62584c'), 20 + index);
      paintEllipse(bitmap, stone.x - 1, stone.y - 1, Math.max(1, stone.rx - 2), 1, parseHexColor('#968570'), 30 + index);
    }
    return bitmap;
  }
  if (sourceId === 'decal-sand-shells') {
    paintEllipse(bitmap, 16, 22, 15, 9, [65, 62, 41, 32], 39);
    paintEllipse(bitmap, 16, 24, 12, 4, shadow, 40);
    const dark = parseHexColor('#2c5038');
    const mid = parseHexColor('#4f7448');
    const light = parseHexColor('#7e9a59');
    [[8, 20, 6, 5], [13, 17, 7, 6], [19, 19, 8, 6], [24, 16, 5, 5], [16, 22, 9, 6]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, dark, 50 + index));
    [[10, 18, 5, 4], [17, 16, 6, 5], [23, 18, 5, 4], [15, 22, 6, 4]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, mid, 60 + index));
    [[11, 16, 3, 2], [18, 14, 3, 2], [24, 17, 2, 2]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, light, 70 + index));
    return bitmap;
  }
  if (sourceId === 'decal-grass-tuft') {
    paintEllipse(bitmap, 16, 26, 12, 3, shadow, 80);
    const dark = parseHexColor('#334333');
    const mid = parseHexColor('#566748');
    const light = parseHexColor('#78805a');
    for (let index = 0; index < 13; index += 1) {
      const rootX = 6 + index * 2;
      const tipX = rootX + ((index % 3) - 1) * 3;
      const tipY = 10 + (index * 7) % 9;
      paintLine(bitmap, rootX, 26, tipX, tipY, index % 4 === 0 ? light : index % 2 === 0 ? mid : dark);
    }
    return bitmap;
  }
  if (sourceId === 'decal-leaf-litter') {
    paintEllipse(bitmap, 16, 23, 14, 6, [70, 55, 39, 25], 170);
    const leaves = [
      { x: 6, y: 20, color: '#7e5335' }, { x: 11, y: 25, color: '#a16b3e' },
      { x: 16, y: 18, color: '#6f713f' }, { x: 20, y: 24, color: '#b07b45' },
      { x: 26, y: 19, color: '#80543a' }, { x: 29, y: 25, color: '#697243' },
      { x: 4, y: 27, color: '#a77b4c' }, { x: 22, y: 15, color: '#8e623b' },
    ];
    leaves.forEach((leaf, index) => {
      paintEllipse(bitmap, leaf.x + 1, leaf.y + 1, 3, 2, [42, 35, 29, 90], 180 + index);
      paintEllipse(bitmap, leaf.x, leaf.y, 2, 2, parseHexColor(leaf.color), 190 + index);
      setPixel(bitmap, leaf.x, Math.max(0, leaf.y - 1), parseHexColor('#c29a5b'));
    });
    return bitmap;
  }
  if (sourceId === 'decal-sapling') {
    paintEllipse(bitmap, 16, 29, 10, 3, shadow, 200);
    paintLine(bitmap, 14, 29, 17, 14, parseHexColor('#3d2e29'), 4);
    paintLine(bitmap, 16, 29, 18, 14, parseHexColor('#75533a'), 2);
    const dark = parseHexColor('#294b36');
    const mid = parseHexColor('#4d7548');
    const light = parseHexColor('#7f9f5b');
    [[8, 13, 7, 6], [14, 8, 8, 7], [21, 11, 8, 7], [16, 16, 10, 6]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, dark, 210 + index));
    [[10, 11, 4, 4], [16, 6, 5, 4], [22, 10, 5, 4], [16, 14, 6, 4]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, mid, 220 + index));
    [[15, 5, 3, 2], [22, 8, 3, 2], [11, 9, 2, 2]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, light, 230 + index));
    return bitmap;
  }
  if (sourceId === 'decal-young-palm') {
    paintEllipse(bitmap, 17, 29, 10, 3, shadow, 240);
    paintLine(bitmap, 14, 29, 17, 12, parseHexColor('#3d2e29'), 4);
    paintLine(bitmap, 16, 29, 18, 12, parseHexColor('#80573a'), 2);
    const dark = parseHexColor('#285039');
    const mid = parseHexColor('#4f7d48');
    const light = parseHexColor('#88a557');
    const fronds = [[17, 12, 2, 7], [17, 12, 6, 3], [17, 12, 12, 5], [17, 12, 28, 8], [17, 12, 30, 13], [17, 12, 26, 18], [17, 12, 8, 18], [17, 12, 3, 14]];
    fronds.forEach(([x1, y1, x2, y2], index) => {
      paintLine(bitmap, x1!, y1!, x2!, y2!, dark, 3);
      paintLine(bitmap, x1!, y1!, x2!, y2!, index % 3 === 0 ? light : mid, 1);
    });
    paintEllipse(bitmap, 17, 12, 4, 3, mid, 250);
    return bitmap;
  }
  if (sourceId === 'decal-flowering-shrub') {
    paintEllipse(bitmap, 16, 26, 12, 4, shadow, 260);
    const dark = parseHexColor('#2b5038');
    const mid = parseHexColor('#527a49');
    const light = parseHexColor('#83a25b');
    [[7, 21, 7, 5], [13, 17, 8, 7], [20, 18, 8, 7], [25, 22, 6, 5], [16, 23, 10, 6]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, dark, 270 + index));
    [[10, 18, 5, 4], [17, 15, 6, 5], [23, 19, 5, 4], [16, 22, 7, 4]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, mid, 280 + index));
    [[11, 17], [16, 13], [21, 18], [25, 21], [14, 22], [19, 23]].forEach(([x, y], index) => {
      const flower = parseHexColor(index % 2 === 0 ? '#efb04e' : '#df6f62');
      paintEllipse(bitmap, x!, y!, 2, 2, flower, 290 + index);
      setPixel(bitmap, x!, Math.max(0, y! - 1), parseHexColor('#ffe09a'));
    });
    paintEllipse(bitmap, 12, 16, 3, 2, light, 300);
    return bitmap;
  }
  if (sourceId === 'decal-canopy-tree') {
    paintEllipse(bitmap, 17, 29, 13, 3, shadow, 301);
    paintLine(bitmap, 13, 30, 16, 13, parseHexColor('#3b2d29'), 6);
    paintLine(bitmap, 16, 30, 18, 13, parseHexColor('#79543b'), 3);
    paintLine(bitmap, 17, 17, 9, 12, parseHexColor('#5d4134'), 2);
    paintLine(bitmap, 17, 16, 25, 11, parseHexColor('#5d4134'), 2);
    const deep = parseHexColor('#244432');
    const dark = parseHexColor('#31583a');
    const mid = parseHexColor('#4f7847');
    const light = parseHexColor('#80a158');
    [[5, 13, 9, 7], [10, 7, 10, 8], [18, 6, 11, 9], [27, 11, 8, 7], [14, 15, 12, 8], [23, 16, 10, 7]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, deep, 302 + index));
    [[7, 11, 7, 5], [13, 6, 8, 6], [21, 7, 9, 6], [26, 12, 6, 5], [16, 14, 9, 6]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, dark, 312 + index));
    [[11, 7, 5, 4], [18, 5, 6, 4], [24, 9, 5, 4], [14, 12, 6, 4]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, mid, 322 + index));
    paintEllipse(bitmap, 17, 4, 4, 2, light, 332);
    paintEllipse(bitmap, 9, 9, 3, 2, light, 333);
    return bitmap;
  }
  if (sourceId === 'decal-neon-light-cyan' || sourceId === 'decal-neon-light-magenta') {
    const cyan = sourceId.endsWith('cyan');
    const glow: Rgba = cyan ? [40, 216, 220, 42] : [240, 90, 215, 42];
    const bright = parseHexColor(cyan ? '#68f6f3' : '#ff8bea');
    paintEllipse(bitmap, 16, 21, 15, 9, glow, 310);
    paintEllipse(bitmap, 16, 22, 10, 5, [glow[0], glow[1], glow[2], 30], 311);
    paintLine(bitmap, 8, 24, 23, 20, [bright[0], bright[1], bright[2], 120]);
    return bitmap;
  }
  if (sourceId === 'decal-neon-litter') {
    const colors = ['#e86dce', '#61d8d6', '#d5b85e', '#77718d'];
    [[6, 22], [12, 17], [20, 24], [26, 14], [28, 27]].forEach(([x, y], index) => {
      const color = parseHexColor(colors[index % colors.length]!);
      fillRect(bitmap, x!, y!, index % 2 === 0 ? 3 : 2, 2, color);
      setPixel(bitmap, x! + 1, Math.max(0, y! - 1), shiftColor(color, 25));
    });
    return bitmap;
  }
  if (sourceId === 'decal-neon-puddle') {
    paintEllipse(bitmap, 16, 23, 14, 6, [18, 23, 36, 115], 320);
    paintEllipse(bitmap, 14, 21, 9, 3, [62, 92, 119, 90], 321);
    paintLine(bitmap, 8, 20, 18, 19, [73, 220, 218, 135]);
    paintLine(bitmap, 19, 24, 26, 23, [229, 87, 205, 110]);
    return bitmap;
  }
  if (sourceId === 'decal-neon-manhole') {
    paintEllipse(bitmap, 16, 22, 11, 7, [19, 20, 28, 150], 330);
    paintEllipse(bitmap, 16, 20, 10, 7, parseHexColor('#303542'), 331);
    paintEllipse(bitmap, 16, 19, 7, 4, parseHexColor('#4b5161'), 332);
    for (let x = 11; x <= 21; x += 5) paintLine(bitmap, x, 16, x, 23, parseHexColor('#242833'));
    paintLine(bitmap, 9, 19, 23, 19, parseHexColor('#242833'));
    return bitmap;
  }
  if (sourceId === 'decal-neon-planter') {
    paintEllipse(bitmap, 16, 29, 12, 3, shadow, 340);
    fillRect(bitmap, 6, 21, 20, 9, parseHexColor('#211d2b'));
    fillRect(bitmap, 8, 22, 16, 6, parseHexColor('#5a376a'));
    fillRect(bitmap, 9, 22, 14, 1, parseHexColor('#a253a7'));
    const dark = parseHexColor('#254d4d');
    const mid = parseHexColor('#3f7972');
    const light = parseHexColor('#65c2aa');
    [[8, 18, 7, 5], [14, 13, 8, 7], [21, 16, 8, 6], [17, 20, 10, 5]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, dark, 350 + index));
    [[11, 15, 5, 4], [17, 11, 5, 4], [23, 15, 5, 4]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, mid, 360 + index));
    paintEllipse(bitmap, 16, 10, 3, 2, light, 370);
    setPixel(bitmap, 12, 14, parseHexColor('#6ff5ed'));
    setPixel(bitmap, 21, 14, parseHexColor('#ff75df'));
    return bitmap;
  }
  return undefined;
}

function renderOrganicPlant(sourceId: string): Bitmap | undefined {
  if (sourceId !== 'plant-palm' && sourceId !== 'fixture-planter') return undefined;
  const bitmap = createBitmap(TILE_CELL.width, TILE_CELL.height);
  const shadow: Rgba = [28, 25, 23, 125];
  if (sourceId === 'plant-palm') {
    paintEllipse(bitmap, 17, 28, 11, 3, shadow, 90);
    paintLine(bitmap, 14, 29, 17, 10, parseHexColor('#3e3029'), 5);
    paintLine(bitmap, 16, 29, 18, 10, parseHexColor('#74543a'), 2);
    const dark = parseHexColor('#294a35');
    const mid = parseHexColor('#4b7548');
    const light = parseHexColor('#7e9e59');
    [[5, 9, 10, 5], [9, 4, 9, 6], [16, 5, 11, 7], [24, 9, 8, 5], [12, 12, 10, 6], [21, 13, 9, 5]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, dark, 100 + index));
    [[7, 7, 7, 3], [13, 3, 7, 4], [20, 6, 8, 4], [25, 10, 5, 3], [14, 11, 7, 4]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, mid, 110 + index));
    [[10, 5, 4, 2], [18, 5, 4, 2], [23, 8, 3, 2]]
      .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, light, 120 + index));
    return bitmap;
  }
  paintEllipse(bitmap, 16, 29, 12, 3, shadow, 130);
  const outline = parseHexColor('#332926');
  for (let y = 18; y < 31; y += 1) {
    const inset = Math.floor((y - 18) / 5);
    for (let x = 5 + inset; x < 27 - inset; x += 1) setPixel(bitmap, x, y, outline);
  }
  for (let y = 20; y < 28; y += 1) {
    for (let x = 7; x < 25; x += 1) setPixel(bitmap, x, y, parseHexColor('#6b4436'));
  }
  paintLine(bitmap, 8, 20, 24, 20, parseHexColor('#9a6750'), 2);
  const dark = parseHexColor('#294c36');
  const mid = parseHexColor('#4e7549');
  const light = parseHexColor('#7e9c5b');
  [[8, 16, 7, 7], [14, 11, 8, 9], [21, 15, 8, 7], [17, 18, 9, 6]]
    .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, dark, 140 + index));
  [[10, 13, 5, 5], [16, 9, 5, 6], [22, 13, 5, 5]]
    .forEach(([x, y, rx, ry], index) => paintEllipse(bitmap, x!, y!, rx!, ry!, mid, 150 + index));
  paintEllipse(bitmap, 15, 7, 3, 3, light, 160);
  return bitmap;
}

export function renderTile(source: TileSource): Bitmap {
  const organicPlant = source.cellClass === 'transparent-part' ? renderOrganicPlant(source.id) : undefined;
  if (organicPlant) return organicPlant;
  const environmentalDecal = source.cellClass === 'presentation' ? renderEnvironmentDecal(source.id) : undefined;
  if (environmentalDecal) return environmentalDecal;
  const backgroundToken = source.cellClass === 'ground'
    ? source.backgroundToken
    : source.cellClass === 'presentation'
      ? source.backgroundToken
      : undefined;
  const palette = paletteForTile(source);
  const frame = backgroundToken
    ? Array.from({ length: TILE_CELL.height }, () => backgroundToken.repeat(TILE_CELL.width))
    : emptyTokenFrame(TILE_CELL.width, TILE_CELL.height);
  const naturalGround = source.cellClass === 'ground' && [
    'warm-sand', 'dune-grass', 'garden-soil', 'sunset-cobble', 'sunset-paver',
  ].includes(sourceFamily(source.id));
  const interiorTile = source.cellClass === 'ground' && [
    'villa-floor', 'neon-floor', 'dock-floor', 'sunset-floor',
  ].includes(sourceFamily(source.id));
  const proceduralAsphalt = source.cellClass === 'ground' && sourceFamily(source.id) === 'dark-asphalt';
  const proceduralExterior = source.cellClass === 'ground' && [
    'neon-paver', 'city-lot', 'sunset-promenade', 'sunset-mosaic', 'harbor-yard', 'harbor-concrete',
    'harbor-quay', 'dock-route',
  ].includes(sourceFamily(source.id));
  if (!naturalGround && !interiorTile && !proceduralAsphalt && !proceduralExterior) {
    drawTokenCommands(frame, source.commands);
  }
  const bitmap = tokenFrameToBitmap(frame, palette);
  if (source.cellClass !== 'ground') return bitmap;
  const textured = addGroundMaterialTexture(bitmap, source, palette);
  return interiorTile ? addInteriorTileGrid(textured, palette) : textured;
}

export type DoorOrientation = 'horizontal' | 'vertical';

export function renderDoorVariant(
  source: TransparentPartSource,
  orientation: DoorOrientation,
): Bitmap {
  if (source.role !== 'door') throw new Error(`${source.id} is not a door source.`);
  const bitmap = createBitmap(TILE_CELL.width, TILE_CELL.height);
  const outline = parseHexColor('#261c1d');
  const cavity = parseHexColor('#312629');
  const recess = parseHexColor('#493431');
  const panel = parseHexColor('#765043');
  const cap = parseHexColor('#9b6b56');
  const highlight = parseHexColor('#bd8a67');
  const hardware = parseHexColor(source.id === 'closed-locked-door' ? '#d6b45d' : '#2c2325');
  const open = source.id === 'open-door';
  const opening = source.id === 'opening-door';
  const seed = stableArtSeed(`door:${source.id}:${orientation}`);
  if (open || opening) {
    const depth = opening ? 12 : 7;
    if (orientation === 'horizontal') {
      fillRect(bitmap, 0, 4, depth, 24, outline);
      fillRect(bitmap, 32 - depth, 4, depth, 24, outline);
      fillRect(bitmap, 1, 6, depth - 2, 20, cavity);
      fillRect(bitmap, 33 - depth, 6, depth - 2, 20, cavity);
      fillRect(bitmap, 2, 7, depth - 4, 17, panel);
      fillRect(bitmap, 34 - depth, 7, depth - 4, 17, panel);
      fillRect(bitmap, 3, 8, 1, 15, cap);
      fillRect(bitmap, 28, 8, 1, 15, cap);
      fillRect(bitmap, 2, 28, 28, 2, [outline[0], outline[1], outline[2], 135]);
    } else {
      fillRect(bitmap, 4, 0, 24, depth, outline);
      fillRect(bitmap, 4, 32 - depth, 24, depth, outline);
      fillRect(bitmap, 6, 1, 20, depth - 2, cavity);
      fillRect(bitmap, 6, 33 - depth, 20, depth - 2, cavity);
      fillRect(bitmap, 7, 2, 17, depth - 4, panel);
      fillRect(bitmap, 7, 34 - depth, 17, depth - 4, panel);
      fillRect(bitmap, 8, 3, 15, 1, cap);
      fillRect(bitmap, 8, 28, 15, 1, cap);
      fillRect(bitmap, 28, 2, 2, 28, [outline[0], outline[1], outline[2], 135]);
    }
  } else if (orientation === 'horizontal') {
    // The cavity touches both wall ends. The door slabs do not: they sit inside
    // the opening so the assembly reads as a recessed fixture, not painted wall.
    fillRect(bitmap, 0, 4, 32, 24, outline);
    fillRect(bitmap, 1, 6, 30, 20, cavity);
    fillRect(bitmap, 1, 6, 3, 20, recess);
    fillRect(bitmap, 28, 6, 3, 20, recess);
    fillRect(bitmap, 2, 7, 1, 17, cap);
    fillRect(bitmap, 29, 7, 1, 17, cap);
    fillRect(bitmap, 4, 7, 24, 2, outline);
    fillRect(bitmap, 4, 26, 24, 2, outline);
    const leftPanel = { x: 5, width: 11 };
    const rightPanel = { x: 15, width: 12 };
    for (const doorPanel of [leftPanel, rightPanel]) {
      fillRect(bitmap, doorPanel.x, 9, doorPanel.width, 17, outline);
      fillRect(bitmap, doorPanel.x + 1, 11, doorPanel.width - 2, 13, panel);
      fillRect(bitmap, doorPanel.x + 2, 12, doorPanel.width - 4, 2, cap);
      fillRect(bitmap, doorPanel.x + 1, 24, doorPanel.width - 2, 1, recess);
    }
    fillRect(bitmap, 13, 16, 1, 4, hardware);
    fillRect(bitmap, 17, 16, 1, 4, hardware);
    fillRect(bitmap, 2, 28, 28, 2, [outline[0], outline[1], outline[2], 135]);
  } else {
    fillRect(bitmap, 4, 0, 24, 32, outline);
    fillRect(bitmap, 6, 1, 20, 30, cavity);
    fillRect(bitmap, 6, 1, 20, 3, recess);
    fillRect(bitmap, 6, 28, 20, 3, recess);
    fillRect(bitmap, 7, 2, 17, 1, cap);
    fillRect(bitmap, 7, 29, 17, 1, cap);
    fillRect(bitmap, 7, 4, 2, 24, outline);
    fillRect(bitmap, 24, 4, 2, 24, outline);
    const topPanel = { y: 5, height: 11 };
    const bottomPanel = { y: 15, height: 12 };
    for (const doorPanel of [topPanel, bottomPanel]) {
      fillRect(bitmap, 9, doorPanel.y, 15, doorPanel.height, outline);
      fillRect(bitmap, 10, doorPanel.y + 1, 13, doorPanel.height - 2, panel);
      fillRect(bitmap, 11, doorPanel.y + 2, 11, 2, cap);
      fillRect(bitmap, 22, doorPanel.y + 1, 1, doorPanel.height - 2, recess);
    }
    fillRect(bitmap, 14, 13, 5, 1, hardware);
    fillRect(bitmap, 14, 17, 5, 1, hardware);
    fillRect(bitmap, 28, 2, 2, 28, [outline[0], outline[1], outline[2], 135]);
  }
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const offset = (y * bitmap.width + x) * 4;
      if (bitmap.data[offset + 3] !== 255) continue;
      const color: Rgba = [
        bitmap.data[offset] as number,
        bitmap.data[offset + 1] as number,
        bitmap.data[offset + 2] as number,
        255,
      ];
      setPixel(bitmap, x, y, shiftColor(color, ((noiseHash(seed, x, y) % 5) - 2) * 0.45));
    }
  }
  return bitmap;
}

export function renderWallVariant(source: WallSource, adjacencyMask: number): Bitmap {
  if (!Number.isInteger(adjacencyMask) || adjacencyMask < 0 || adjacencyMask > 15) {
    throw new Error('Wall adjacency mask must be an integer from 0 through 15.');
  }
  const ramps = {
    villa: ['#261c1d', '#47302d', '#6b483d', '#936552', '#bd8a67'],
    downtown: ['#14151e', '#28263a', '#423851', '#624466', '#d069d5'],
    commercial: ['#211d1b', '#3c3028', '#5b4737', '#80654b', '#a18562'],
    civic: ['#192027', '#2d3942', '#465761', '#667985', '#8e9ba0'],
  } as const;
  const [outline, shadowColor, faceColor, capColor, highlightColor] = ramps[source.id as keyof typeof ramps] ?? ramps.villa;
  const shape = Array.from({ length: TILE_CELL.height }, () => Array.from({ length: TILE_CELL.width }, () => false));
  const mark = (x: number, y: number, width: number, height: number): void => {
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) shape[row]![column] = true;
    }
  };
  mark(4, 4, 24, 24);
  if ((adjacencyMask & 1) !== 0) mark(4, 0, 24, 17);
  if ((adjacencyMask & 2) !== 0) mark(15, 4, 17, 24);
  if ((adjacencyMask & 4) !== 0) mark(4, 15, 24, 17);
  if ((adjacencyMask & 8) !== 0) mark(0, 4, 17, 24);
  const connectedShape = (x: number, y: number): boolean => {
    if (x >= 0 && x < TILE_CELL.width && y >= 0 && y < TILE_CELL.height) return shape[y]![x] ?? false;
    if (y < 0) return (adjacencyMask & 1) !== 0 && x >= 4 && x < 28;
    if (x >= TILE_CELL.width) return (adjacencyMask & 2) !== 0 && y >= 4 && y < 28;
    if (y >= TILE_CELL.height) return (adjacencyMask & 4) !== 0 && x >= 4 && x < 28;
    if (x < 0) return (adjacencyMask & 8) !== 0 && y >= 4 && y < 28;
    return false;
  };

  const bitmap = createBitmap(TILE_CELL.width, TILE_CELL.height);
  const seed = stableArtSeed(`wall:${source.id}:${adjacencyMask}`);
  for (let y = 0; y < TILE_CELL.height; y += 1) {
    for (let x = 0; x < TILE_CELL.width; x += 1) {
      if (!shape[y]![x]) continue;
      const shadowX = x + 2;
      const shadowY = y + 3;
      if (shadowX < TILE_CELL.width && shadowY < TILE_CELL.height && !shape[shadowY]![shadowX]) {
        const shadow = parseHexColor(outline);
        setPixel(bitmap, shadowX, shadowY, [shadow[0], shadow[1], shadow[2], 150]);
      }
    }
  }
  for (let y = 0; y < TILE_CELL.height; y += 1) {
    for (let x = 0; x < TILE_CELL.width; x += 1) {
      if (!shape[y]![x]) continue;
      const boundary = !connectedShape(x, y - 1) || !connectedShape(x, y + 1) ||
        !connectedShape(x - 1, y) || !connectedShape(x + 1, y);
      if (boundary) {
        setPixel(bitmap, x, y, parseHexColor(outline));
        continue;
      }
      const hasHorizontalRun = (adjacencyMask & 10) !== 0;
      const hasVerticalRun = (adjacencyMask & 5) !== 0;
      const southFace = (hasHorizontalRun || !hasVerticalRun) && y >= 13;
      const eastFace = hasVerticalRun && x >= 19;
      const face = southFace || eastFace;
      const southMortarRow = southFace && (y === 19 || y === 25);
      const southBrickRow = y < 19 ? 0 : y < 25 ? 1 : 2;
      const southMortarColumn = southFace && !southMortarRow &&
        (x + (southBrickRow % 2) * 6) % 12 === 7;
      const eastMortar = eastFace && !southFace && x === 19;
      const mortar = southMortarRow || southMortarColumn || eastMortar;
      const base = parseHexColor(mortar ? shadowColor : face ? faceColor : capColor);
      const texture = ((noiseHash(seed, x, y) % 9) - 4) * (face ? 0.9 : 0.55);
      setPixel(bitmap, x, y, shiftColor(base, texture));
      const capHighlight = !face && (
        ((hasHorizontalRun || !hasVerticalRun) && y === 6) ||
        (hasVerticalRun && x === 6)
      );
      if (capHighlight && (x + y + seed) % 7 !== 0) {
        setPixel(bitmap, x, y, parseHexColor(highlightColor));
      }
    }
  }
  return bitmap;
}
