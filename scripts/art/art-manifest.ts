import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

export const ART_CATEGORY_IDS = [
  'ground-base',
  'ground-transition',
  'ground-decal',
  'wall-door',
  'roof',
  'object-landmark',
  'world-character',
  'world-character-eyes',
  'portrait',
  'effect-reserve',
] as const;

export type ArtCategoryId = typeof ART_CATEGORY_IDS[number];

const CategorySchema = z.object({
  maximumCount: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict();

export const ArtManifestSchema = z.object({
  schemaVersion: z.literal(1),
  artRevision: z.number().int().positive(),
  toolVersion: z.string().min(1),
  indexVersion: z.literal(3),
  publicIdPrefixes: z.array(z.string().min(1)).min(1),
  limits: z.object({
    maximumWidth: z.literal(1024),
    maximumHeight: z.literal(1024),
    maximumRawAreaRatio: z.literal(0.75),
    maximumPackedAreaRatio: z.literal(0.8),
    gutter: z.literal(1),
  }).strict(),
  categories: z.object(Object.fromEntries(
    ART_CATEGORY_IDS.map((category) => [category, CategorySchema]),
  ) as Record<ArtCategoryId, typeof CategorySchema>).strict(),
}).strict();

export type ArtManifest = z.infer<typeof ArtManifestSchema>;

const MaterialRecipeFileSchema = z.object({
  schemaVersion: z.literal(1),
  artRevision: z.number().int().positive(),
  materials: z.array(z.object({
    publicBaseSprite: z.string().min(1),
    publicVariantSprites: z.array(z.string().min(1)).min(2).max(8),
    mapVariantSprites: z.record(z.string().min(1), z.array(z.string().min(1)).min(2).max(8)).default({}),
  }).passthrough()),
}).passthrough();
const RoofRecipeFileSchema = z.object({
  schemaVersion: z.literal(1),
  artRevision: z.number().int().positive(),
  defaultRecipe: z.object({
    publicSprites: z.object({
      base: z.string().min(1),
      edge: z.string().min(1),
      corner: z.string().min(1),
    }).strict(),
  }).passthrough(),
}).passthrough();
const DecalRecipeFileSchema = z.object({
  schemaVersion: z.literal(1),
  artRevision: z.number().int().positive(),
  families: z.array(z.object({ publicSprites: z.array(z.string().min(1)) }).passthrough()),
}).passthrough();
const TransitionRecipeFileSchema = z.object({
  schemaVersion: z.literal(1),
  artRevision: z.number().int().positive(),
  families: z.array(z.object({
    id: z.string().min(1),
    publicSpritePrefix: z.string().min(1),
  }).passthrough()).min(2),
}).passthrough();

export type ArtPresentationRecipeManifest = Readonly<{
  artRevision: number;
  publicSpriteIds: readonly string[];
}>;
export type ArtPresentationRuntimeRecipes = Readonly<{
  schemaVersion: 1;
  artRevision: number;
  materials: Readonly<z.infer<typeof MaterialRecipeFileSchema>['materials']>;
  defaultRoof: z.infer<typeof RoofRecipeFileSchema>['defaultRecipe'];
  decalFamilies: Readonly<z.infer<typeof DecalRecipeFileSchema>['families']>;
  transitionFamilies: Readonly<z.infer<typeof TransitionRecipeFileSchema>['families']>;
}>;

function readJson(root: string, relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8')) as unknown;
}

export function loadArtManifest(root = process.cwd()): ArtManifest {
  return ArtManifestSchema.parse(JSON.parse(
    readFileSync(resolve(root, 'assets/source/art/manifest.json'), 'utf8'),
  ) as unknown);
}

export function loadArtPresentationRecipeManifest(root = process.cwd()): ArtPresentationRecipeManifest {
  const runtime = loadArtPresentationRuntimeRecipes(root);
  const publicSpriteIds = [
    ...runtime.materials.flatMap(({ publicVariantSprites }) => publicVariantSprites),
    ...runtime.materials.flatMap(({ mapVariantSprites }) => Object.values(mapVariantSprites).flat()),
    ...Object.values(runtime.defaultRoof.publicSprites),
    ...runtime.decalFamilies.flatMap(({ publicSprites }) => publicSprites),
    ...runtime.transitionFamilies.flatMap(({ publicSpritePrefix }) =>
      Array.from({ length: 15 }, (_unused, index) => `${publicSpritePrefix}-${(index + 1).toString(16)}`)),
  ];
  return Object.freeze({
    artRevision: runtime.artRevision,
    publicSpriteIds: Object.freeze([...new Set(publicSpriteIds)].sort()),
  });
}

export function loadArtPresentationRuntimeRecipes(root = process.cwd()): ArtPresentationRuntimeRecipes {
  const materials = MaterialRecipeFileSchema.parse(readJson(root, 'assets/source/art/material-recipes.json'));
  const roof = RoofRecipeFileSchema.parse(readJson(root, 'assets/source/art/roof-recipes.json'));
  const decals = DecalRecipeFileSchema.parse(readJson(root, 'assets/source/art/decal-recipes.json'));
  const transitions = TransitionRecipeFileSchema.parse(readJson(root, 'assets/source/art/transition-recipes.json'));
  if (
    materials.artRevision !== roof.artRevision ||
    materials.artRevision !== decals.artRevision ||
    materials.artRevision !== transitions.artRevision
  ) {
    throw new Error('Art presentation source revisions do not match.');
  }
  return Object.freeze({
    schemaVersion: 1,
    artRevision: materials.artRevision,
    materials: Object.freeze(materials.materials),
    defaultRoof: Object.freeze(roof.defaultRecipe),
    decalFamilies: Object.freeze(decals.families),
    transitionFamilies: Object.freeze(transitions.families),
  });
}
