import {
  WORLD_CELL,
  composeFrontFrame,
  getCharacterIdentityCommandSets,
  type CharacterSource,
  type TokenFrame,
} from './character-source';
import { CHARACTER_LOOKS, type CharacterLook } from './character-look-roster';
import { composeLateralFrame, getLateralIdentityCommandSets } from './lateral-legs';
import { protagonistReferenceFrames } from './protagonist-reference';
import { deriveRearFrame } from './rear-frame';

export const PROTAGONIST_STYLE_PASS_SCORE = 9.7;

type Direction = 'front' | 'rear' | 'left' | 'right';

export type CharacterStyleScore = Readonly<{
  characterId: string;
  displayName: string;
  score: number;
  passed: boolean;
  identityRetained: boolean;
  categories: Readonly<{
    hairRendering: number;
    eyesAndBrows: number;
    mouth: number;
    hands: number;
    accessoryPlacement: number;
    directionalFacing: number;
    identityRetention: number;
    stableFloatingPose: number;
  }>;
  renderedChecks: Readonly<Record<
    'hairValues' | 'frontEyes' | 'frontBrows' | 'mouth' | 'frontHands' |
    'leftProfile' | 'rightProfile' | 'rearFacing' | 'stablePose',
    boolean
  >>;
  intentionalOcclusions: readonly string[];
}>;

const CATEGORY_WEIGHTS = Object.freeze({
  hairRendering: 2,
  eyesAndBrows: 1.75,
  mouth: 1,
  hands: 1,
  accessoryPlacement: 1,
  directionalFacing: 2,
  identityRetention: 0.75,
  stableFloatingPose: 0.5,
});

const INTENTIONAL_FRONT_EYE_OCCLUSION: Readonly<Record<string, string>> = Object.freeze({
  linda: 'cloud-sized side hair crosses the left eye',
  'sora-tan': 'the bob fringe crosses the left eye',
  'resident-09': 'the bob and giant bow cross the left eye',
  'resident-17': 'the one-ear cap and long hair cross the left eye',
  'resident-20': 'the star glasses cross the eye boxes',
});

const INTENTIONAL_PROFILE_EYE_OCCLUSION: Readonly<Record<string, string>> = Object.freeze({
  protagonist: 'the authored swept forelock covers the right profile eye',
  linda: 'the side-cloud hair covers the profile eye',
  'resident-06': 'the straw hat and braids cover the profile eye',
  'resident-17': 'the one-ear cap partly covers the profile eye',
  'resident-21': 'the side braid covers the profile eye',
  'resident-22': 'the near braid covers the profile eye',
});

function lookFor(source: CharacterSource): CharacterLook {
  const look = CHARACTER_LOOKS.find(({ id }) => id === source.id);
  if (!look) throw new Error(`Missing character look for ${source.id}.`);
  return look;
}

function renderedFrames(source: CharacterSource): Readonly<Record<Direction, TokenFrame>> {
  const authored = protagonistReferenceFrames(source.id);
  if (authored) {
    return {
      front: authored['front-1'],
      rear: authored['rear-1'],
      left: authored['left-1'],
      right: authored['right-1'],
    };
  }
  const front = composeFrontFrame(source, 0);
  return {
    front,
    rear: deriveRearFrame(front, source),
    left: composeLateralFrame(source, 'left', 0),
    right: composeLateralFrame(source, 'right', 0),
  };
}

function tokensIn(
  frame: TokenFrame,
  rows: readonly number[],
  columns: readonly number[],
): string[] {
  return rows.flatMap((row) => columns.map((column) => frame[row]?.[column] ?? '.'));
}

function tokenCount(tokens: readonly string[], accepted: ReadonlySet<string>): number {
  return tokens.filter((token) => accepted.has(token)).length;
}

function commandPoints(commands: readonly import('./character-source').DrawCommand[]): readonly (readonly [number, number, string])[] {
  return commands.flatMap((command) => command.kind === 'pixels'
    ? command.points.map(([x, y]) => [x, y, command.token] as const)
    : Array.from({ length: command.width * command.height }, (_unused, index) => [
      command.x + index % command.width,
      command.y + Math.floor(index / command.width),
      command.token,
    ] as const));
}

function renderedFeatureVisible(
  frame: TokenFrame,
  commands: readonly import('./character-source').DrawCommand[],
): boolean {
  return commandPoints(commands).some(([x, y, token]) => {
    const rendered = frame[y]?.[x];
    if (['H', 'h', 'K'].includes(token)) return ['H', 'h', 'K'].includes(rendered as string);
    return rendered === token;
  });
}

function hasConnectedHighlight(frame: TokenFrame): boolean {
  for (let y = 0; y < Math.min(18, frame.length); y += 1) {
    for (let x = 0; x < (frame[y]?.length ?? 0); x += 1) {
      if (frame[y]?.[x] !== 'h') continue;
      if (
        frame[y]?.[x + 1] === 'h' || frame[y]?.[x - 1] === 'h' ||
        frame[y + 1]?.[x] === 'h' || frame[y - 1]?.[x] === 'h'
      ) return true;
    }
  }
  return false;
}

function hairValuesPass(frames: Readonly<Record<Direction, TokenFrame>>, look: CharacterLook): boolean {
  if (look.hair === 'bald') return true;
  return Object.values(frames).every((frame) => {
    const hairRegion = frame.slice(0, 18).join('');
    return hairRegion.includes('H') && hairRegion.includes('h') &&
      hairRegion.includes('K') && hasConnectedHighlight(frame);
  });
}

function eyeWhiteCount(frame: TokenFrame, direction: 'front' | 'left' | 'right'): number {
  const columns = direction === 'front'
    ? Array.from({ length: 14 }, (_unused, index) => index + 5)
    : Array.from({ length: 18 }, (_unused, index) => index + 3);
  return tokenCount(tokensIn(frame, [13, 14], columns), new Set(['W']));
}

function browPass(frame: TokenFrame, source: CharacterSource): boolean {
  const browTokens = tokensIn(frame, [11], Array.from({ length: 12 }, (_unused, index) => index + 6));
  const visible = tokenCount(browTokens, new Set(['H', 'h', 'K']));
  return visible >= 4 || source.id in INTENTIONAL_FRONT_EYE_OCCLUSION;
}

function mouthPass(frame: TokenFrame, look: CharacterLook): boolean {
  const mouth = tokensIn(frame, [16], [10, 11, 12, 13]);
  const visibleLip = tokenCount(mouth, new Set(['s', 'K']));
  return visibleLip >= 2 || ['curl-moustache', 'spiral-moustache'].includes(look.oddity);
}

function handPass(frame: TokenFrame, direction: Direction, look: CharacterLook, characterId: string): boolean {
  const handRegion = tokensIn(
    frame,
    [23, 24, 25, 26],
    Array.from({ length: 20 }, (_unused, index) => index + 2),
  );
  const skinPixels = tokenCount(handRegion, new Set(['S', 's', 'L']));
  if (direction === 'rear') return true;
  if (characterId === 'protagonist') return skinPixels >= (direction === 'front' ? 2 : 3);
  if (look.oddity === 'giant-gloves') return tokenCount(handRegion, new Set(['A', 'a'])) >= 8;
  return skinPixels >= (direction === 'front' ? 4 : 3);
}

function silhouette(frame: TokenFrame): string {
  return frame.map((row) => [...row].map((token) => token === '.' ? '.' : '#').join('')).join('\n');
}

function openMargins(frame: TokenFrame): boolean {
  return [...(frame[0] ?? '')].every((token) => token === '.') &&
    frame.every((row) => row[0] === '.' && row[WORLD_CELL.width - 1] === '.');
}

function roundedBase(frame: TokenFrame): boolean {
  const bottom = frame.at(-1) ?? '';
  const painted = [...bottom].filter((token) => token !== '.').length;
  return painted >= 6 && painted <= 12;
}

function categoryScore(pass: boolean, weight: number): number {
  return pass ? weight : 0;
}

export function scoreCharacterAgainstProtagonist(source: CharacterSource): CharacterStyleScore {
  const look = lookFor(source);
  const frames = renderedFrames(source);
  const frontEyeOcclusion = INTENTIONAL_FRONT_EYE_OCCLUSION[source.id];
  const profileEyeOcclusion = INTENTIONAL_PROFILE_EYE_OCCLUSION[source.id];
  const frontEyes = eyeWhiteCount(frames.front, 'front') >= 8 || Boolean(frontEyeOcclusion);
  const frontBrows = browPass(frames.front, source);
  const leftProfile = eyeWhiteCount(frames.left, 'left') >= 2 || Boolean(profileEyeOcclusion);
  const rightProfile = eyeWhiteCount(frames.right, 'right') >= 2 || Boolean(profileEyeOcclusion);
  const mouth = mouthPass(frames.front, look);
  const frontHands = handPass(frames.front, 'front', look, source.id);
  const sideHands = handPass(frames.left, 'left', look, source.id) && handPass(frames.right, 'right', look, source.id);
  const rearEyeRegion = tokensIn(
    frames.rear,
    [12, 13, 14, 15],
    Array.from({ length: 16 }, (_unused, index) => index + 4),
  );
  const rearFacing = tokenCount(rearEyeRegion, new Set(['W'])) === 0;
  const hairValues = hairValuesPass(frames, look);
  const directionsDistinct = silhouette(frames.front) !== silhouette(frames.left) &&
    silhouette(frames.front) !== silhouette(frames.right) &&
    frames.front.slice(12, 16).join('') !== frames.rear.slice(12, 16).join('');
  /**
   * Frame 0 is the idle pose; frame 1 is the stride and is REQUIRED to differ. This used to
   * assert equality, which is precisely what kept every character sliding instead of walking.
   * The margin and rounded-base checks in `stableFloatingPose` below still carry the quality
   * bar this name refers to.
   *
   */
  const stablePose = (
    composeFrontFrame(source, 0).join('\n') !== composeFrontFrame(source, 1).join('\n') &&
    composeLateralFrame(source, 'left', 0).join('\n') !== composeLateralFrame(source, 'left', 1).join('\n') &&
    composeLateralFrame(source, 'right', 0).join('\n') !== composeLateralFrame(source, 'right', 1).join('\n')
  );
  const stableFloatingPose = stablePose && Object.values(frames).every(
    (frame) => openMargins(frame) && roundedBase(frame),
  );
  const identity = getCharacterIdentityCommandSets(look);
  const leftIdentity = getLateralIdentityCommandSets(source, 'left');
  const rightIdentity = getLateralIdentityCommandSets(source, 'right');
  const identityRetained = source.id === 'protagonist' || (
    source.identityFeatures.length >= 2 &&
    [identity.primaryWorld, identity.secondaryWorld].every((commands) => renderedFeatureVisible(frames.front, commands)) &&
    [leftIdentity.primary, leftIdentity.secondary].some((commands) => renderedFeatureVisible(frames.left, commands)) &&
    [rightIdentity.primary, rightIdentity.secondary].some((commands) => renderedFeatureVisible(frames.right, commands)) &&
    [identity.primaryWorld, identity.secondaryWorld].some((commands) => renderedFeatureVisible(frames.rear, commands))
  );
  const accessoryPlacement = identityRetained && frontEyes && frontBrows && mouth && leftProfile && rightProfile;
  const directionalFacing = directionsDistinct && leftProfile && rightProfile && rearFacing;

  const renderedChecks = {
    hairValues,
    frontEyes,
    frontBrows,
    mouth,
    frontHands,
    leftProfile,
    rightProfile,
    rearFacing,
    stablePose,
  };
  const categories = {
    hairRendering: categoryScore(hairValues, CATEGORY_WEIGHTS.hairRendering),
    eyesAndBrows: categoryScore(frontEyes && frontBrows, CATEGORY_WEIGHTS.eyesAndBrows),
    mouth: categoryScore(mouth, CATEGORY_WEIGHTS.mouth),
    hands: categoryScore(frontHands && sideHands, CATEGORY_WEIGHTS.hands),
    accessoryPlacement: categoryScore(accessoryPlacement, CATEGORY_WEIGHTS.accessoryPlacement),
    directionalFacing: categoryScore(directionalFacing, CATEGORY_WEIGHTS.directionalFacing),
    identityRetention: categoryScore(identityRetained, CATEGORY_WEIGHTS.identityRetention),
    stableFloatingPose: categoryScore(stableFloatingPose, CATEGORY_WEIGHTS.stableFloatingPose),
  };
  const score = Math.round(Object.values(categories).reduce((sum, value) => sum + value, 0) * 100) / 100;
  const intentionalOcclusions = [frontEyeOcclusion, profileEyeOcclusion].filter(
    (reason): reason is string => Boolean(reason),
  );

  return {
    characterId: source.id,
    displayName: source.displayName,
    score,
    passed: score >= PROTAGONIST_STYLE_PASS_SCORE && Object.values(renderedChecks).every(Boolean),
    identityRetained,
    categories,
    renderedChecks,
    intentionalOcclusions,
  };
}
