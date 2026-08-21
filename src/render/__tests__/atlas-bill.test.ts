import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ATLAS_INDEX,
  ATLAS_PROOF_BILL,
  CHARACTER_IDS,
  WALK_FRAME_MILLISECONDS,
  assertZoomLevel,
  buildAtlasProofScene,
  movementPresentation,
} from '../atlas';
import { WORLD_MAP_CATALOG } from '../../application/runtime/map-catalog';

describe('runtime atlas bill and movement contract', () => {
  test('makes every generated atlas cell reachable', () => {
    expect(new Set(ATLAS_PROOF_BILL)).toEqual(new Set(Object.keys(ATLAS_INDEX.sprites)));
    const renderedNames = buildAtlasProofScene(0).sprites.map(({ sprite }) => sprite);
    expect(new Set(renderedNames)).toEqual(new Set(Object.keys(ATLAS_INDEX.sprites)));
    expect(ATLAS_INDEX.version).toBe(3);
    expect(ATLAS_INDEX.artRevision).toBe(21);
    expect(ATLAS_INDEX.publicSpriteIds).toEqual(Object.keys(ATLAS_INDEX.sprites));
    expect(ATLAS_INDEX.internalReviewSpriteIds).toEqual([]);
    expect(ATLAS_INDEX.tiles).toHaveLength(285);
    expect(ATLAS_INDEX.groundCells).toHaveLength(81);
    expect(ATLAS_INDEX.transparentPartCells).toHaveLength(144);
    expect(ATLAS_INDEX.presentationCells).toHaveLength(60);
    expect(new Set([
      ...ATLAS_INDEX.groundCells,
      ...ATLAS_INDEX.transparentPartCells,
      ...ATLAS_INDEX.presentationCells,
    ]))
      .toEqual(new Set(ATLAS_INDEX.tiles));
    for (const name of ATLAS_INDEX.groundCells) {
      expect(ATLAS_INDEX.sprites[name]).toMatchObject({ cellClass: 'ground', wallAdjacencyMask: null });
    }
    for (const names of Object.values(ATLAS_INDEX.walls)) {
      expect(names).toHaveLength(16);
      names.forEach((name, wallAdjacencyMask) => {
        expect(ATLAS_INDEX.sprites[name]).toMatchObject({ cellClass: 'transparent-part', wallAdjacencyMask });
      });
    }
    for (const characterId of CHARACTER_IDS) {
      expect(Object.keys(ATLAS_INDEX.characters[characterId].frames)).toHaveLength(8);
      expect(ATLAS_INDEX.characters[characterId].portrait).toBe(`portrait.${characterId}`);
      expect(ATLAS_INDEX.characters[characterId].portraits.rest).toBe(`portrait.${characterId}`);
    }
    expect(ATLAS_INDEX.characters.protagonist.portraits).toEqual({
      rest: 'portrait.protagonist',
      joy: 'portrait.protagonist.joy',
      upset: 'portrait.protagonist.upset',
    });
    expect(ATLAS_INDEX.characters['generic-resident'].portraits).toEqual({ rest: 'portrait.generic-resident' });
  });

  test('selects rear, front, left, and right pairs with authored profile bodies', () => {
    expect(movementPresentation('protagonist', 'up', 0).sprite).toContain('.rear-1');
    expect(movementPresentation('protagonist', 'down', 1).sprite).toContain('.front-2');
    expect(movementPresentation('protagonist', 'left', 0)).toMatchObject({
      sprite: 'character.protagonist.left-1', leanX: 0, bounceY: 0, shadowX: 0,
    });
    expect(movementPresentation('protagonist', 'right', 1)).toMatchObject({
      sprite: 'character.protagonist.right-2', leanX: 1, bounceY: -1, shadowX: 1,
    });
    expect(movementPresentation('linda', 'right', 1)).toMatchObject({
      sprite: 'character.linda.right-2', leanX: 1, bounceY: -1, shadowX: 1,
    });
    expect(movementPresentation('vampire-01', 'right', 1)).toMatchObject({
      sprite: 'character.vampire-01.right-2', leanX: 1, bounceY: -1, shadowX: 1,
    });
    expect(WALK_FRAME_MILLISECONDS).toBeGreaterThanOrEqual(130);
    expect(WALK_FRAME_MILLISECONDS).toBeLessThanOrEqual(160);
  });

  test('accepts only the three integer prototype zoom levels', () => {
    expect([1, 2, 3].map(assertZoomLevel)).toEqual([1, 2, 3]);
    expect(() => assertZoomLevel(0.5)).toThrow('exactly');
    expect(() => assertZoomLevel(4)).toThrow('exactly');
  });

  // World bodies and the new-game vista keep nearest-neighbour atlas sampling. Dialogue portraits
  // use their large authored PNGs, which are already nearest-neighbour enlarged pixel art.
  test('uses one image per surface and no runtime layer composition', () => {
    const portrait = readFileSync(resolve(process.cwd(), 'src/ui/CharacterPortrait.tsx'), 'utf8');
    const sprite = readFileSync(resolve(process.cwd(), 'src/ui/AtlasSprite.tsx'), 'utf8');
    const newGame = readFileSync(resolve(process.cwd(), 'src/application/NewGameFlow.tsx'), 'utf8');
    const runtime = readFileSync(resolve(process.cwd(), 'src/render/atlas.ts'), 'utf8');
    const renderer = readFileSync(resolve(process.cwd(), 'src/render/three/world-renderer.ts'), 'utf8');
    // The world atlas keeps nearest-neighbour sampling with no mipmaps on the GPU path.
    expect(renderer).toContain('NearestFilter');
    expect(renderer).toContain('generateMipmaps = false');
    // The neutral crop keeps nearest-neighbour sampling and creates no extra drawing surface.
    expect(sprite).toContain('pixelated');
    expect(sprite.match(/<Image\b/gu)).toHaveLength(1);
    expect(portrait.match(/<Image\b/gu)).toHaveLength(1);
    expect(portrait).toContain('portraits[identityId]');
    expect(newGame.match(/<AtlasSprite\b/gu)).toHaveLength(1);
    for (const source of [portrait, newGame, sprite, renderer]) {
      expect(source).not.toContain('shopify/react-native-skia');
    }
    expect(runtime).not.toMatch(/assets\/source|scripts\/art|composeFrontFrame|drawTokenCommands/u);
    expect(portrait).not.toMatch(/scripts\/art|composeFrontFrame|drawTokenCommands/u);
  });

  test('uses one immutable presentation index and a bounded static ground-detail batch', () => {
    // Stage 7 removed Skia. The scene is now the controller plus the Three.js renderer.
    const scene = [
      readFileSync(resolve(process.cwd(), 'src/render/WorldScene.tsx'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'src/render/three/world-renderer.ts'), 'utf8'),
    ].join('\n');
    const frame = readFileSync(resolve(process.cwd(), 'src/render/world-frame.ts'), 'utf8');
    const map = WORLD_MAP_CATALOG.northwest_residential;
    expect(Object.isFrozen(map.presentation)).toBe(true);
    expect(Object.isFrozen(map.presentation.ground)).toBe(true);
    expect(map.presentation.ground).toBe(WORLD_MAP_CATALOG.northwest_residential.presentation.ground);
    // The atlas ceiling is 12 draws. Counting #set( proves nothing: it counts every batch setter,
    // not atlas draws, so a regression that adds setters stays green. Assert the renderer's real
    // atlas batch list instead, which is what atlasDrawCalls actually counts.
    const atlasBatches = scene.match(/'(floor-and-ground-detail|doors|grounded-props-and-characters|walls|roofs)'/gu) ?? [];
    expect(new Set(atlasBatches).size).toBe(5);
    expect(new Set(atlasBatches).size).toBeLessThanOrEqual(12);
    expect(frame).toContain('map.presentation.transitions');
    expect(frame).toContain('map.presentation.decals');
    expect(frame).toContain('map.presentation.roofs');
    expect(`${scene}\n${frame}`).not.toContain("sprite: 'tile.boardwalk'");
    expect(`${scene}\n${frame}`).not.toContain('color="#4b211f55"');
    const publicIds = new Set(ATLAS_INDEX.publicSpriteIds);
    expect(map.presentation.ground.every(({ sprite }) => publicIds.has(sprite))).toBe(true);
    expect(map.presentation.roofs.every(({ sprite }) => publicIds.has(sprite))).toBe(true);
  });

  test('draws broad character shadows and places the selection ring behind characters', () => {
    // Stage 7 removed Skia. The scene is now the controller plus the Three.js renderer.
    const scene = [
      readFileSync(resolve(process.cwd(), 'src/render/WorldScene.tsx'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'src/render/three/world-renderer.ts'), 'utf8'),
    ].join('\n');
    // Stage 7: the same contract now lives in the Three.js batches. Character shadows keep their
    // broad cast, and the selection ring still sits behind grounded props and characters.
    expect(scene).toContain('9, frame.lighting.shadow.color');
    expect(scene).toContain('11, 3.5, character.color');
    expect(scene.indexOf("'selection-ring'")).toBeGreaterThan(scene.indexOf("'contact-shadows-and-thresholds'"));
    expect(scene.indexOf("'selection-ring'")).toBeLessThan(scene.indexOf("'grounded-props-and-characters'"));
  });

  test('collapses the self card until the player selects someone interesting', () => {
    // Stage 7 removed Skia. The scene is now the controller plus the Three.js renderer.
    const scene = [
      readFileSync(resolve(process.cwd(), 'src/render/WorldScene.tsx'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'src/render/three/world-renderer.ts'), 'utf8'),
    ].join('\n');
    expect(scene).toContain("compact={selected === 'protagonist' && reactionId !== 'protagonist'}");
  });
});
