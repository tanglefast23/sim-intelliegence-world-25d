import {
  EYE_BAND,
  PORTRAIT_CELL,
  WORLD_CELL,
  composeEyeBand,
  composeFrontFrame,
  composePortrait,
  drawTokenCommands,
  emptyTokenFrame,
  getCharacterGeometryCommandSets,
  getCharacterIdentityCommandSets,
  loadCharacterSources,
  type CharacterSource,
  type DrawCommand,
  type TokenFrame,
} from '../character-source';
import { composeLateralFrame, getLateralIdentityCommandSets } from '../lateral-legs';
import { parseHexColor } from '../png';
import { deriveRearFrame } from '../rear-frame';
import { protagonistReferenceFrames } from '../protagonist-reference';
import { CHARACTER_LOOKS } from '../character-look-roster';
import type { SecondaryFeature } from '../character-look-roster';
import {
  PROTAGONIST_STYLE_PASS_SCORE,
  scoreCharacterAgainstProtagonist,
} from '../character-style-score';

function alphaSignature(commands: readonly DrawCommand[]): string {
  return JSON.stringify(commands.map((command) => command.kind === 'rect'
    ? { kind: command.kind, x: command.x, y: command.y, width: command.width, height: command.height }
    : { kind: command.kind, points: command.points }));
}

function layerSignatures(source: CharacterSource): Readonly<Record<string, string>> {
  return {
    legs: alphaSignature([
      ...source.sourceLayers.legs.frontFrames.flat(),
      ...source.sourceLayers.legs.lateralFrames.flat(),
    ]),
    torsoAndClothing: alphaSignature(source.sourceLayers.torsoAndClothing.commands),
    headAndFace: alphaSignature(source.sourceLayers.headAndFace.commands),
    hair: alphaSignature(source.sourceLayers.hair.commands),
    accessory: alphaSignature(source.sourceLayers.accessory.commands),
    heldItem: alphaSignature(source.sourceLayers.heldItem?.commands ?? []),
  };
}

function painted(frame: TokenFrame): Set<string> {
  return new Set(frame.flatMap((row, y) => [...row].flatMap((token, x) => token === '.' ? [] : [`${x},${y}`])));
}

function layerFrame(commands: readonly DrawCommand[]): TokenFrame {
  const frame = emptyTokenFrame(WORLD_CELL.width, WORLD_CELL.height);
  drawTokenCommands(frame, commands);
  return frame;
}

function commandFrame(commands: readonly DrawCommand[], width: number, height: number): TokenFrame {
  const frame = emptyTokenFrame(width, height);
  drawTokenCommands(frame, commands);
  return frame;
}

function paintedWidth(row: string): number {
  const columns = [...row].flatMap((token, x) => token === '.' ? [] : [x]);
  return columns.length === 0 ? 0 : Math.max(...columns) - Math.min(...columns) + 1;
}

function luminance(hex: string): number {
  const [red, green, blue] = parseHexColor(hex);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function commandTokens(commands: readonly DrawCommand[]): Set<string> {
  return new Set(commands.map(({ token }) => token));
}

function paintedRuns(row: string): number {
  let runs = 0;
  let painting = false;
  for (const token of row) {
    if (token !== '.' && !painting) runs += 1;
    painting = token !== '.';
  }
  return runs;
}

describe('full-cast shared-source character art', () => {
  const sources = loadCharacterSources();
  const namedSources = sources.filter(({ kind }) => kind === 'named');

  test('keeps one authoritative source for all thirty-six production people', () => {
    expect(sources.map(({ id }) => id)).toEqual(CHARACTER_LOOKS.map(({ id }) => id).sort());
    expect(sources).toHaveLength(36);
    expect(namedSources).toHaveLength(10);
    expect(new Set(sources.map(({ signatureOddity }) => signatureOddity.id)).size).toBe(36);
  });

  test('draws vampire fangs as a readable object below the blink band', () => {
    const look = CHARACTER_LOOKS.find(({ id }) => id === 'vampire-01')!;
    const features = getCharacterIdentityCommandSets(look);
    expect(features.primaryWorld).toEqual([
      { kind: 'rect', token: 'K', x: 10, y: 15, width: 4, height: 1 },
      { kind: 'pixels', token: 'W', points: [[10, 16], [13, 16]] },
    ]);
    // Every fang row sits below EYE_BAND, so a blink cannot rewrite it.
    for (const y of [15, 16]) expect(y).toBeGreaterThanOrEqual(EYE_BAND.top + EYE_BAND.height);
    // The fangs must contrast with the face they sit on. The first version painted the mouth
    // colour onto the mouth, so the oddity was invisible and this assertion is the guard.
    const source = sources.find(({ id }) => id === 'vampire-01')!;
    const frame = composeFrontFrame(source, 0);
    expect(frame[15]?.slice(10, 14)).toBe('KKKK');
    expect(frame[16]?.[10]).toBe('W');
    expect(frame[16]?.[13]).toBe('W');
    expect(source.palette.W).not.toBe(source.palette.S);
    expect(source.palette.K).not.toBe(source.palette.S);
  });

  test('walks the vampire on two separate feet in both frames', () => {
    const source = sources.find(({ id }) => id === 'vampire-01')!;
    const [standing, striding] = [composeFrontFrame(source, 0), composeFrontFrame(source, 1)];
    // Two feet with a gap in BOTH frames. The rest of the cast still shows a solid bar on frame 0,
    // which is why its walk reads as no leg motion.
    expect(standing[29]).toBe('.......KKKK..KKKK.......');
    expect(striding[29]).toBe('.......KKK..KKKKK.......');
    // Row 28 is the contact-shadow anchor and must not move between frames.
    expect(standing[28]).toBe(striding[28]);
  });

  test('keeps the half cape below the head box on every wearer', () => {
    const wearers = CHARACTER_LOOKS.filter(({ secondary }) => secondary === 'half-cape');
    expect(wearers.map(({ id }) => id).sort()).toEqual(['resident-17', 'vampire-01']);
    for (const look of wearers) {
      const source = sources.find(({ id }) => id === look.id)!;
      const frame = composeFrontFrame(source, 0);
      // The head box is rows 4-17. A 7px accent slab used to start at row 16 and cover the jaw.
      for (const y of [16, 17]) {
        expect(frame[y]?.slice(4, 11)).not.toContain('A');
      }
    }
  });

  test('keeps the accepted protagonist eyes and Linda dress in production art', () => {
    const protagonistLook = CHARACTER_LOOKS.find(({ id }) => id === 'protagonist')!;
    const protagonist = sources.find(({ id }) => id === 'protagonist')!;
    expect(protagonistLook.hairColor).toBe('ink');
    expect('eyes' in protagonistLook ? protagonistLook.eyes : undefined).toBe('angled-small');
    expect(protagonist.palette.H).toBe('#16121f');
    const portrait = composePortrait(protagonist, 'rest');
    for (const y of [13, 14]) {
      expect(portrait[y]?.slice(7, 11)).toBe('WKWD');
      expect(portrait[y]?.slice(13, 17)).toBe('WKWD');
    }

    const lindaLook = CHARACTER_LOOKS.find(({ id }) => id === 'linda')!;
    expect(lindaLook.secondary).toBe('flared-dress');
    const lindaDress = commandFrame(
      getCharacterIdentityCommandSets(lindaLook).secondaryWorld,
      WORLD_CELL.width,
      WORLD_CELL.height,
    );
    expect(paintedWidth(lindaDress[19] as string)).toBeLessThan(paintedWidth(lindaDress[25] as string));
  });

  test('codes two fixed visual features for every production person', () => {
    const secondaryKeywords: Readonly<Record<SecondaryFeature, string>> = {
      'tiny-waist-jacket': 'jacket',
      'shoulder-recorder': 'recorder',
      'long-scarf': 'scarf',
      'flared-dress': 'dress',
      'towel-sleeve': 'towel',
      'clinic-pockets': 'pockets',
      'luggage-strap': 'strap',
      'cook-apron-ladle': 'ladle',
      'asymmetric-sleeves': 'sleeve',
      'permit-pouch': 'pouch',
      'bow-tie': 'bow tie',
      'rain-cape': 'cape',
      'big-black-boots': 'boots',
      'bright-cuff': 'cuff',
      'guitar-case': 'guitar case',
      'short-jacket': 'jacket',
      'double-braids': 'braids',
      'flared-coat': 'coat',
      'opposite-ponytail': 'ponytail',
      'split-tunic': 'tunic',
      'round-vest-button': 'vest',
      'side-fastened-jacket': 'jacket',
      'tiny-waist-belt': 'belt',
      'charm-bracelet': 'bracelet',
      'half-cape': 'cape',
      'suspenders': 'suspenders',
      'pearl-necklace': 'necklace',
      'star-cuff': 'cuff',
      'large-necklace': 'necklace',
      'thin-ponytail': 'ponytail',
    };
    for (const source of sources) {
      const look = CHARACTER_LOOKS.find(({ id }) => id === source.id);
      expect(look).toBeDefined();
      expect(source.identityFeatures.map(({ id }) => id)).toEqual([look?.oddity, look?.secondary]);
      if (!look) continue;
      const features = getCharacterIdentityCommandSets(look);
      for (const commands of [
        features.primaryWorld,
        features.secondaryWorld,
        features.primaryPortrait,
        features.secondaryPortrait,
      ]) {
        const height = commands === features.primaryPortrait || commands === features.secondaryPortrait
          ? PORTRAIT_CELL.height
          : WORLD_CELL.height;
        expect(painted(commandFrame(commands, WORLD_CELL.width, height)).size).toBeGreaterThanOrEqual(4);
      }
      expect(alphaSignature(features.primaryWorld)).not.toEqual(alphaSignature(features.secondaryWorld));
      expect(look.supportingFeature.toLowerCase()).toContain(secondaryKeywords[look.secondary]);
      const secondaryLayer = look?.secondaryLayer;
      expect(secondaryLayer).toBeDefined();
      if (secondaryLayer) {
        expect(source.sourceLayers[secondaryLayer]?.commands.length ?? 0).toBeGreaterThan(0);
        expect(source.portraitLayers[secondaryLayer]?.commands.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  test('locks the rounded shoulder, arm, and weighted-base grammar for all thirty-six people', () => {
    for (const look of CHARACTER_LOOKS) {
      const geometry = getCharacterGeometryCommandSets(look);
      const portrait = commandFrame(geometry.portraitBody, PORTRAIT_CELL.width, PORTRAIT_CELL.height);
      const shoulderWidths = [16, 17, 18, 19, 20].map((row) => paintedWidth(portrait[row] as string));
      expect(shoulderWidths[0]).toBeLessThan(shoulderWidths[1] as number);
      expect(shoulderWidths[1]).toBeLessThan(shoulderWidths[2] as number);
      expect(shoulderWidths[2]).toBeLessThan(shoulderWidths[3] as number);
      expect(shoulderWidths[4]).toBeGreaterThanOrEqual(16);

      const worldBody = commandFrame(geometry.worldBody, WORLD_CELL.width, WORLD_CELL.height);
      expect(new Set([16, 17, 18, 19, 20, 21, 22, 23, 24].map(
        (row) => paintedWidth(worldBody[row] as string),
      )).size).toBeGreaterThanOrEqual(2);
      expect(worldBody[24]?.[4]).toBe('S');
      expect(worldBody[24]?.[19]).toBe('S');
      expect([25, 26, 27].map((row) => paintedWidth(worldBody[row] as string)))
        .toEqual([14, 14, 12]);

      // Frame 0 is the idle pose and keeps one run on both rows. Frame 1 splits row 29 into
      // two feet while row 28 stays a single run, so the contact shadow keeps one anchor and
      // shadowWorldY does not move.
      const [idleLegs, strideLegs] = geometry.legs.frontFrames.map(
        (frameCommands) => commandFrame(frameCommands, WORLD_CELL.width, WORLD_CELL.height),
      );
      expect(paintedRuns(idleLegs![28] as string)).toBe(1);
      // A redrawn look shows two feet on the idle frame too; the queued-for-redraw cast still
      // shows one solid run, which is why its walk reads as no leg motion.
      expect(paintedRuns(idleLegs![29] as string)).toBe(look.id === 'vampire-01' ? 2 : 1);
      expect(paintedRuns(strideLegs![28] as string)).toBe(1);
      expect(paintedRuns(strideLegs![29] as string)).toBe(2);
      expect(geometry.legs.frontFrames[1]).not.toEqual(geometry.legs.frontFrames[0]);
    }
  });

  test('the stride frame opens no hole the idle frame did not have', () => {
    // A hole is a transparent cell with paint on both sides of it in the same row. The stride
    // may move pixels, but it must not tear a gap in a face or a torso.
    //
    // This is the assertion that was missing when the lateral stride shifted the head by a
    // pixel: seven characters gained interior holes and nothing failed, because the margin
    // check only looks at columns 0 and 23 and the pair check only asks that the frames differ.
    const interiorHoles = (frame: TokenFrame): number => {
      let holes = 0;
      for (const row of frame) {
        for (let x = 1; x < WORLD_CELL.width - 1; x += 1) {
          if (row[x] !== '.') continue;
          const left = row.slice(0, x).replace(/\./gu, '');
          const right = row.slice(x + 1).replace(/\./gu, '');
          if (left.length > 0 && right.length > 0) holes += 1;
        }
      }
      return holes;
    };
    for (const source of sources) {
      const pairs = [
        [composeFrontFrame(source, 0), composeFrontFrame(source, 1)],
        [composeLateralFrame(source, 'left', 0), composeLateralFrame(source, 'left', 1)],
        [composeLateralFrame(source, 'right', 0), composeLateralFrame(source, 'right', 1)],
      ] as const;
      for (const [idle, stride] of pairs) {
        // The stride's own foot gap is a deliberate hole on the contact row, so compare the
        // rows above it.
        const above = (frame: TokenFrame): TokenFrame => frame.slice(0, WORLD_CELL.height - 1) as TokenFrame;
        expect(interiorHoles(above(stride))).toBeLessThanOrEqual(interiorHoles(above(idle)));
      }
    }
  });

  test('closes the eyes in the blink band while preserving every other pixel', () => {
    for (const source of sources) {
      const band = composeEyeBand(source);
      const base = protagonistReferenceFrames(source.id)?.['front-1'] ?? composeFrontFrame(source, 0);
      expect(band).toHaveLength(EYE_BAND.height);
      let changed = 0;
      for (let index = 0; index < band.length; index += 1) {
        const before = base[EYE_BAND.top + index] as string;
        const after = band[index] as string;
        expect(after).toHaveLength(WORLD_CELL.width);
        for (let x = 0; x < WORLD_CELL.width; x += 1) {
          if (before[x] === after[x]) continue;
          changed += 1;
          // Only eye whites and their pupil tokens may move, and only inside the eye columns.
          // This is what keeps star-glasses' accent at [10,14], window-glasses' frame, and the
          // mouth pixel at [11,14] intact through a blink.
          expect([7, 8, 9, 10, 13, 14, 15, 16]).toContain(x);
          expect(['W', 'K', 'D']).toContain(before[x]);
        }
      }
      expect(changed).toBeGreaterThan(0);
    }
  });

  test('passes every character against the protagonist proportion bar in roster order', () => {
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const scores = CHARACTER_LOOKS.map(({ id }) => scoreCharacterAgainstProtagonist(sourceById.get(id)!));
    expect(scores.map(({ characterId }) => characterId)).toEqual(CHARACTER_LOOKS.map(({ id }) => id));
    expect(scores.every(({ identityRetained }) => identityRetained)).toBe(true);
    expect(scores.every(({ passed }) => passed)).toBe(true);
    expect(Math.min(...scores.map(({ score }) => score))).toBeGreaterThanOrEqual(PROTAGONIST_STYLE_PASS_SCORE);
  });

  test('gives every named pair two non-color layer differences and varied torso silhouettes', () => {
    for (let left = 0; left < namedSources.length; left += 1) {
      for (let right = left + 1; right < namedSources.length; right += 1) {
        const leftSignatures = layerSignatures(namedSources[left] as CharacterSource);
        const rightSignatures = layerSignatures(namedSources[right] as CharacterSource);
        const differences = Object.keys(leftSignatures).filter(
          (layer) => leftSignatures[layer] !== rightSignatures[layer],
        );
        expect(differences.length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(new Set(namedSources.map((source) => layerSignatures(source).torsoAndClothing)).size).toBeGreaterThanOrEqual(7);
  });

  test.each(namedSources.map((source) => [source.id, source] as const))(
    '%s generates distinct rest, joy, and upset portraits',
    (_id, source) => {
      expect(composePortrait(source, 'rest')).not.toEqual(composePortrait(source, 'joy'));
      expect(composePortrait(source, 'rest')).not.toEqual(composePortrait(source, 'upset'));
      expect(composePortrait(source, 'joy')).not.toEqual(composePortrait(source, 'upset'));
    },
  );

  test.each(sources.map((source) => [source.id, source] as const))(
    '%s documents identity features that survive every direction',
    (_id, source) => {
      expect(source.identityFeatures.length).toBeGreaterThanOrEqual(2);
      const feature = source.identityFeatures.find(({ visibleIn }) => (
        ['front', 'rear', 'left', 'right'] as const
      ).every((direction) => visibleIn.includes(direction)));
      expect(feature).toBeDefined();
      const look = CHARACTER_LOOKS.find(({ id }) => id === source.id)!;
      const identity = getCharacterIdentityCommandSets(look);
      const frontFeaturePixels = [identity.primaryWorld, identity.secondaryWorld].map(
        (commands) => painted(layerFrame(commands)),
      );
      expect(frontFeaturePixels.every((pixels) => pixels.size > 0)).toBe(true);
      const front = composeFrontFrame(source, 0);
      const directionalCases = [
        [front, frontFeaturePixels],
        [deriveRearFrame(front, source), frontFeaturePixels],
        [composeLateralFrame(source, 'left', 0), Object.values(getLateralIdentityCommandSets(source, 'left')).map(
          (commands) => painted(layerFrame(commands)),
        )],
        [composeLateralFrame(source, 'right', 0), Object.values(getLateralIdentityCommandSets(source, 'right')).map(
          (commands) => painted(layerFrame(commands)),
        )],
      ] as const;
      for (const [frame, featurePixelSets] of directionalCases) {
        const composedPixels = painted(frame);
        expect(featurePixelSets.some((featurePixels) => (
          [...featurePixels].some((pixel) => composedPixels.has(pixel))
        ))).toBe(true);
      }
    },
  );

  test.each(sources.map((source) => [source.id, source] as const))(
    '%s keeps world and portrait identity layers in agreement',
    (_id, source) => {
      const front = composeFrontFrame(source, 0).join('');
      const portrait = composePortrait(source).join('');
      for (const token of Object.values(source.identityTokens)) {
        expect(front).toContain(token);
        expect(portrait).toContain(token);
      }
      for (const feature of source.identityFeatures.filter(({ visibleIn }) => visibleIn.includes('front'))) {
        const worldCommands = source.sourceLayers[feature.layer]?.commands ?? [];
        const portraitCommands = source.portraitLayers[feature.layer]?.commands ?? [];
        expect(worldCommands.length).toBeGreaterThan(0);
        expect(portraitCommands.length).toBeGreaterThan(0);
        const worldTokens = commandTokens(worldCommands);
        const portraitTokens = commandTokens(portraitCommands);
        expect([...worldTokens].some((token) => portraitTokens.has(token))).toBe(true);
      }
    },
  );

  test.each(sources.map((source) => [source.id, source] as const))(
    '%s keeps a stable rounded base, margins, portrait contour room, and hair value separation',
    (_id, source) => {
      const frontOne = composeFrontFrame(source, 0);
      const frontTwo = composeFrontFrame(source, 1);
      expect(frontOne).not.toEqual(frontTwo);

      // The stride swings an arm into [3,23] and [20,25], but ONLY where the cell is empty.
      // Six looks already occupy one of those at idle: giant-gloves, single-bell-sleeve and
      // towel-sleeve cover [3,23]; towel-sleeve, luggage-strap and guitar-case cover [20,25],
      // and luggage-strap is the protagonist's own supporting feature. Costume pixels win.
      for (const [x, y] of [[3, 23], [19, 25]] as const) {
        const idleToken = frontOne[y]?.[x];
        expect(frontTwo[y]?.[x]).toBe(idleToken === '.' ? 'L' : idleToken);
      }
      // resident-16 skips the row-24 hand stamp entirely, because its feature covers that row.
      if (source.id !== 'resident-16') {
        expect(frontTwo[24]?.[3]).toBe('L');
        expect(frontTwo[24]?.[4]).toBe('S');
        expect(frontTwo[24]?.[19]).toBe('S');
        expect(frontTwo[24]?.[20]).toBe('L');
      }
      const idleFrames = [
        frontOne,
        deriveRearFrame(frontOne, source),
        composeLateralFrame(source, 'left', 0),
        composeLateralFrame(source, 'right', 0),
      ];
      const strideFrames = [
        frontTwo,
        deriveRearFrame(frontTwo, source),
        composeLateralFrame(source, 'left', 1),
        composeLateralFrame(source, 'right', 1),
      ];
      for (const frame of [...idleFrames, ...strideFrames]) {
        expect(painted(frame).size).toBeGreaterThan(40);
        expect([...frame[0] as string].every((token) => token === '.')).toBe(true);
        expect(frame.every((row) => row[0] === '.' && row[WORLD_CELL.width - 1] === '.')).toBe(true);
      }
      // Row 29 is the contact row. A redrawn look shows two feet on the front and rear idle so the
      // walk reads; the queued-for-redraw cast keeps one rounded run there. The lateral idle uses
      // the shared rounded base either way and splits only on its own stride.
      const idleFrontRuns = source.id === 'vampire-01' ? 2 : 1;
      for (const frame of [frontOne, deriveRearFrame(frontOne, source)]) {
        expect(paintedRuns(frame[WORLD_CELL.height - 1] as string)).toBe(idleFrontRuns);
      }
      for (const frame of [composeLateralFrame(source, 'left', 0), composeLateralFrame(source, 'right', 0)]) {
        expect(paintedRuns(frame[WORLD_CELL.height - 1] as string)).toBe(1);
      }
      for (const frame of strideFrames) {
        expect(paintedRuns(frame[WORLD_CELL.height - 1] as string)).toBe(2);
      }
      const portrait = composePortrait(source);
      expect(source.portraitCell).toEqual({ width: 24, height: 29 });
      expect(painted(portrait).size).toBeGreaterThan(200);
      expect([...portrait[0] as string].every((token) => token === '.')).toBe(true);
      expect(portrait.every((row) => row[0] === '.' && row[PORTRAIT_CELL.width - 1] === '.')).toBe(true);
      const hair = source.palette[source.identityTokens.hair] as string;
      const skin = source.palette[source.identityTokens.skin] as string;
      expect(Math.abs(luminance(hair) - luminance(skin))).toBeGreaterThanOrEqual(24);
    },
  );
});
