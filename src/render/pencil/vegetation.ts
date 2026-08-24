import { CHARCOAL, GRAPHITE, type Medium, type Rgb } from './media';
import { hashSeed, Sketch, type Point } from './sketch';
import type { QuadDescriptor } from '../three25/scene-builder';
import type { WorldFrameState } from '../world-frame';

export const VEGETATION_IDS = [
  'canopy-tree',
  'young-palm',
  'sapling',
  'flowering-shrub',
] as const;

export type VegetationId = typeof VEGETATION_IDS[number];
export type VegetationView = 'front' | 'side';

const WIDTH = 120;
const HEIGHT = 180;
const CONTACT = { x: 60, y: 166 } as const;

type Blob = Readonly<{
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  shade: 'leaf' | 'leafDark' | 'leafLight';
}>;

type Frond = Readonly<{ x: number; y: number; width: number; shade: Blob['shade'] }>;

type VegetationRecipe = Readonly<{
  assetId: VegetationId;
  brief: string;
  seed: number;
  world: Readonly<{
    width: number;
    height: number;
    collision: Readonly<{ width: number; depth: number }>;
    contactShadow: Readonly<{ x: number; z: number; width: number; depth: number }>;
  }>;
  views: Readonly<Record<VegetationView, Readonly<{
    transparentBounds: Readonly<{ x: number; y: number; width: number; height: number }>;
    groundContact: typeof CONTACT;
    crown: readonly Blob[];
    fronds?: readonly Frond[];
  }>>>;
}>;

const colors = {
  trunk: [111, 72, 42] as Rgb,
  trunkDark: [70, 48, 34] as Rgb,
  leaf: [92, 126, 63] as Rgb,
  leafDark: [57, 91, 52] as Rgb,
  leafLight: [137, 156, 83] as Rgb,
  flower: [211, 126, 92] as Rgb,
} as const;

export const VEGETATION_RECIPE = {
  version: 1,
  status: 'integrated',
  brief: 'Organic KinderGrimm trees and bushes for the active SI World 2.5D renderer.',
  upstreamCommit: 'de339ad739d8cbd28ff2dd4a940af38c0ede86c8',
  medium: 'graphite-and-charcoal',
  canvas: { width: WIDTH, height: HEIGHT },
  tileSize: 32,
  orderedParts: ['trunk-or-root', 'rear-foliage', 'front-foliage', 'flowers', 'contour'],
  interactionAnchors: {},
  colors,
  assets: {
    'canopy-tree': {
      assetId: 'canopy-tree',
      brief: 'Broad old shade tree with a leaning trunk and five uneven crown masses.',
      seed: 2501,
      world: {
        width: 1.75, height: 2.5, collision: { width: 1, depth: 1 },
        contactShadow: { x: 0.06, z: 0.06, width: 0.72, depth: 0.34 },
      },
      views: {
        front: {
          transparentBounds: { x: 4, y: 4, width: 115, height: 166 }, groundContact: CONTACT,
          crown: [
            { x: 36, y: 67, rx: 29, ry: 34, rot: -0.18, shade: 'leafDark' },
            { x: 65, y: 45, rx: 36, ry: 38, rot: 0.08, shade: 'leafLight' },
            { x: 89, y: 69, rx: 27, ry: 32, rot: 0.18, shade: 'leaf' },
            { x: 55, y: 84, rx: 35, ry: 32, rot: -0.08, shade: 'leaf' },
            { x: 84, y: 92, rx: 29, ry: 28, rot: 0.1, shade: 'leafDark' },
          ],
        },
        side: {
          transparentBounds: { x: 10, y: 3, width: 105, height: 167 }, groundContact: CONTACT,
          crown: [
            { x: 40, y: 65, rx: 27, ry: 35, rot: -0.12, shade: 'leafDark' },
            { x: 66, y: 43, rx: 31, ry: 37, rot: 0.1, shade: 'leafLight' },
            { x: 83, y: 72, rx: 29, ry: 34, rot: 0.14, shade: 'leaf' },
            { x: 57, y: 88, rx: 32, ry: 29, rot: -0.08, shade: 'leaf' },
          ],
        },
      },
    },
    'young-palm': {
      assetId: 'young-palm',
      brief: 'Small wind-bent palm with a narrow trunk and six loose fronds.',
      seed: 2502,
      world: {
        width: 1.55, height: 2.15, collision: { width: 1, depth: 1 },
        contactShadow: { x: 0.05, z: 0.05, width: 0.46, depth: 0.22 },
      },
      views: {
        front: {
          transparentBounds: { x: 18, y: 22, width: 87, height: 148 }, groundContact: CONTACT,
          crown: [],
          fronds: [
            { x: 12, y: 43, width: 13, shade: 'leafDark' },
            { x: 26, y: 25, width: 14, shade: 'leaf' },
            { x: 54, y: 18, width: 15, shade: 'leafLight' },
            { x: 84, y: 27, width: 14, shade: 'leaf' },
            { x: 108, y: 48, width: 13, shade: 'leafDark' },
            { x: 75, y: 62, width: 14, shade: 'leaf' },
          ],
        },
        side: {
          transparentBounds: { x: 24, y: 23, width: 76, height: 147 }, groundContact: CONTACT,
          crown: [],
          fronds: [
            { x: 19, y: 40, width: 13, shade: 'leafDark' },
            { x: 42, y: 20, width: 14, shade: 'leafLight' },
            { x: 72, y: 19, width: 14, shade: 'leaf' },
            { x: 101, y: 43, width: 13, shade: 'leafDark' },
            { x: 73, y: 61, width: 13, shade: 'leaf' },
          ],
        },
      },
    },
    sapling: {
      assetId: 'sapling',
      brief: 'Young crooked tree with a thin trunk and three soft crown masses.',
      seed: 2503,
      world: {
        width: 1.05, height: 1.5, collision: { width: 1, depth: 1 },
        contactShadow: { x: 0.04, z: 0.04, width: 0.38, depth: 0.2 },
      },
      views: {
        front: {
          transparentBounds: { x: 15, y: 25, width: 92, height: 145 }, groundContact: CONTACT,
          crown: [
            { x: 42, y: 73, rx: 24, ry: 28, rot: -0.16, shade: 'leafDark' },
            { x: 66, y: 58, rx: 29, ry: 31, rot: 0.08, shade: 'leafLight' },
            { x: 82, y: 84, rx: 23, ry: 26, rot: 0.14, shade: 'leaf' },
          ],
        },
        side: {
          transparentBounds: { x: 20, y: 27, width: 80, height: 143 }, groundContact: CONTACT,
          crown: [
            { x: 45, y: 75, rx: 22, ry: 28, rot: -0.12, shade: 'leafDark' },
            { x: 67, y: 59, rx: 27, ry: 30, rot: 0.1, shade: 'leafLight' },
            { x: 76, y: 88, rx: 21, ry: 24, rot: 0.12, shade: 'leaf' },
          ],
        },
      },
    },
    'flowering-shrub': {
      assetId: 'flowering-shrub',
      brief: 'Low broad bush with six leaf clumps and a restrained coral flower scatter.',
      seed: 2504,
      world: {
        width: 1.2, height: 0.82, collision: { width: 1, depth: 1 },
        contactShadow: { x: 0.06, z: 0.06, width: 0.76, depth: 0.36 },
      },
      views: {
        front: {
          transparentBounds: { x: 3, y: 72, width: 112, height: 95 }, groundContact: CONTACT,
          crown: [
            { x: 26, y: 126, rx: 20, ry: 25, rot: -0.12, shade: 'leafDark' },
            { x: 45, y: 109, rx: 25, ry: 29, rot: 0.1, shade: 'leaf' },
            { x: 68, y: 103, rx: 27, ry: 30, rot: -0.06, shade: 'leafLight' },
            { x: 90, y: 119, rx: 22, ry: 27, rot: 0.14, shade: 'leaf' },
            { x: 50, y: 139, rx: 27, ry: 24, rot: 0.02, shade: 'leafDark' },
            { x: 79, y: 140, rx: 26, ry: 23, rot: -0.08, shade: 'leaf' },
          ],
        },
        side: {
          transparentBounds: { x: 9, y: 78, width: 97, height: 90 }, groundContact: CONTACT,
          crown: [
            { x: 33, y: 127, rx: 22, ry: 25, rot: -0.1, shade: 'leafDark' },
            { x: 53, y: 108, rx: 26, ry: 29, rot: 0.08, shade: 'leafLight' },
            { x: 78, y: 116, rx: 25, ry: 27, rot: 0.12, shade: 'leaf' },
            { x: 55, y: 139, rx: 28, ry: 23, rot: -0.06, shade: 'leafDark' },
            { x: 82, y: 141, rx: 21, ry: 21, rot: 0.08, shade: 'leaf' },
          ],
        },
      },
    },
  } satisfies Record<VegetationId, VegetationRecipe>,
} as const;

export const VEGETATION_WIDTH = WIDTH;
export const VEGETATION_HEIGHT = HEIGHT;

export function vegetationIdForSprite(sprite: string): VegetationId | undefined {
  return VEGETATION_IDS.find((id) => sprite === `tile.decal-${id}`);
}

function closed(points: readonly Point[]): readonly Point[] {
  return [...points, points[0]!];
}

function mass(sketch: Sketch, points: readonly Point[], color: Rgb, medium: Medium, edge = 2): void {
  medium.tone(sketch, points, { style: 'scribble', angle: sketch.jr(-0.3, 0.3), gap: 1.15 });
  medium.skin(sketch, points, color, { alpha: 0.72, paper: false, underdraw: false });
  medium.edge(sketch, closed(points), edge);
}

function trunk(sketch: Sketch, id: VegetationId, view: VegetationView): void {
  if (id === 'flowering-shrub') {
    for (const x of [42, 59, 76]) sketch.stroke([{ x: 60, y: 164 }, { x, y: 124 }], 3.2, 0.48);
    return;
  }
  const top = id === 'canopy-tree' ? 78 : id === 'young-palm' ? 55 : 91;
  const lean = view === 'front' ? 7 : 11;
  const half = id === 'canopy-tree' ? 10 : id === 'young-palm' ? 6 : 5;
  const points = sketch.smooth([
    { x: 47, y: 166 }, { x: 56, y: 154 }, { x: 60 + lean - half, y: top },
    { x: 60 + lean + half, y: top }, { x: 68, y: 154 }, { x: 75, y: 166 },
    { x: 61, y: 162 },
  ]);
  mass(sketch, points, colors.trunk, GRAPHITE, 2.2);
  GRAPHITE.skin(sketch, sketch.smooth([
    { x: 57, y: 159 }, { x: 60 + lean - 1, y: top + 4 },
    { x: 60 + lean + half, y: top }, { x: 65, y: 157 },
  ]), colors.trunkDark, { alpha: 0.28, paper: false, underdraw: false });
  sketch.sline([{ x: 48, y: 166 }, { x: 37, y: 169 }], 2.2, 0.55);
  sketch.sline([{ x: 73, y: 166 }, { x: 84, y: 169 }], 2.2, 0.55);
}

function foliage(sketch: Sketch, recipe: VegetationRecipe, view: VegetationView): void {
  const data = recipe.views[view];
  if (data.fronds) {
    const root = { x: view === 'front' ? 67 : 70, y: 58 };
    for (const frond of data.fronds) {
      const dx = frond.x - root.x;
      const dy = frond.y - root.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length * frond.width;
      const ny = dx / length * frond.width;
      const leaf = sketch.smooth([
        root,
        { x: root.x + dx * 0.45 + nx, y: root.y + dy * 0.45 + ny },
        { x: frond.x, y: frond.y },
        { x: root.x + dx * 0.45 - nx, y: root.y + dy * 0.45 - ny },
      ]);
      mass(sketch, leaf, colors[frond.shade], CHARCOAL, 1.8);
    }
    return;
  }
  for (const blob of data.crown) {
    mass(
      sketch,
      sketch.blobPts(blob.x, blob.y, blob.rx, blob.ry, blob.rot, 0.85),
      colors[blob.shade],
      CHARCOAL,
      recipe.assetId === 'flowering-shrub' ? 1.8 : 2.2,
    );
  }
}

function flowers(sketch: Sketch, recipe: VegetationRecipe, view: VegetationView): void {
  if (recipe.assetId !== 'flowering-shrub') return;
  const count = view === 'front' ? 9 : 7;
  for (let index = 0; index < count; index += 1) {
    const x = sketch.jr(view === 'front' ? 23 : 32, view === 'front' ? 98 : 90);
    const y = sketch.jr(100, 141);
    const dot = sketch.blobPts(x, y, sketch.jr(2.1, 3.2), sketch.jr(1.7, 2.6), 0, 0.3);
    GRAPHITE.skin(sketch, dot, colors.flower, { alpha: 0.9, paper: false, underdraw: false });
    GRAPHITE.edge(sketch, closed(dot), 0.8);
  }
}

export function bakeVegetationFrame(id: VegetationId, view: VegetationView): Uint8ClampedArray {
  const recipe = VEGETATION_RECIPE.assets[id];
  const sketch = new Sketch(WIDTH, HEIGHT);
  sketch.boil(hashSeed(VEGETATION_RECIPE.brief, recipe.seed, view));
  trunk(sketch, id, view);
  foliage(sketch, recipe, view);
  flowers(sketch, recipe, view);
  return sketch.data;
}

const cachedFrames = new Map<string, Uint8ClampedArray>();

export function vegetationFrame(id: VegetationId, view: VegetationView): Uint8ClampedArray {
  const key = `${id}:${view}`;
  let frame = cachedFrames.get(key);
  if (!frame) {
    frame = bakeVegetationFrame(id, view);
    cachedFrames.set(key, frame);
  }
  return frame;
}

export function blitVegetationFrame(
  target: Uint8ClampedArray,
  id: VegetationId,
  view: VegetationView,
  targetWidth: number,
  targetX: number,
): void {
  const source = vegetationFrame(id, view);
  for (let y = 0; y < HEIGHT; y += 1) {
    const sourceStart = y * WIDTH * 4;
    const targetStart = (y * targetWidth + targetX) * 4;
    target.set(source.subarray(sourceStart, sourceStart + WIDTH * 4), targetStart);
  }
}

export function vegetationContactShadows(frame: WorldFrameState): readonly QuadDescriptor[] {
  return frame.groundDetails.flatMap((detail) => {
    const id = vegetationIdForSprite(detail.sprite);
    if (!id) return [];
    const shadow = VEGETATION_RECIPE.assets[id].world.contactShadow;
    return [{
      id: `vegetation-contact-${detail.id}`,
      sprite: 'contact-shadow',
      source: { x: 0, y: 0, width: 0, height: 0 } as QuadDescriptor['source'],
      x: detail.tile.x + 0.5 + shadow.x,
      z: detail.tile.y + 0.5 + shadow.z,
      width: shadow.width,
      depth: shadow.depth,
      tint: frame.lighting.shadow.color,
      opacity: 1,
    }];
  });
}
