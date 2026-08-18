import type { TokenFrame } from './character-source';

export const PROTAGONIST_REFERENCE_FRAME_IDS = [
  'front-1',
  'front-2',
  'rear-1',
  'rear-2',
  'left-1',
  'left-2',
  'right-1',
  'right-2',
] as const;

export type ProtagonistReferenceFrameId = typeof PROTAGONIST_REFERENCE_FRAME_IDS[number];

const FRONT = [
  '........................',
  '........................',
  '..........KKKD....KK....',
  '.......KKHhhhHK...KhK...',
  '.....KKHhhhhhhhKKKhhK...',
  '....KHhHHhHHHhhHHhhHK...',
  '....HhHHHhHHHHHhhhHHK...',
  '...KhhHHHHhhhhhhhHHK....',
  '...KHHHHHHHhhhhhHHKK....',
  '...KHHHKsKHHHHHHHKKHK...',
  '...KHHHsssKKKHHHKKHHH...',
  '...KHHKsKKSsssKKssHK....',
  '....KKsSSSSSSSSSSsKK....',
  '...KsKSWKWDSSWKWDSKsK...',
  '...KsKSWKWDSSWKWDSKsK...',
  '....KsSSSSSSSSSSSSsK....',
  '.....KsSSSSssSSSSsK.....',
  '.....KssSSSSSSSsssK.....',
  '....KACKsssssssHKCCK....',
  '...KCCACCCCCCCCCCCCCH...',
  '...KCCCACCCCCCCCCCCCK...',
  '...KCCCAaCCCCCCCCCCCH...',
  '...KCCCCAaCCCCCCCCCCK...',
  '...KCCCCCAACCCCCCCCCH...',
  '...KsCCCCCAACCCCCCCsH...',
  '....KCCCCCCCACCCCCCK....',
  '....KCCCCCCCCAACCCAH....',
  '.....KCCCCCCCCCAAAK.....',
  '......KHHHHHHHHHHK......',
  '.......KKKKKKKKKh.......',
] as const satisfies TokenFrame;

const REAR = [
  '........................',
  '........................',
  '...........KK...........',
  '...KKK...KKhhhKKh.......',
  '...KhhKKKHhhhhhhHK......',
  '...KHhHHhhhhhhhhhHK.....',
  '....KHHhhhhhhhhhhhHK....',
  '.....KHhhhhhhhhhhhhK....',
  '.....KhhhhhhhhhhhhhHK...',
  '....KHhhhhhhhhhhhhhHK...',
  '....KHhhhhhhhhhhhhHHK...',
  '.....KHhhhhhhhhhhhHKK...',
  '.....KHHHHhhhhhhhHHKH...',
  '....KsKHHHHhHHHHHHKsK...',
  '....KsKHHHHHHHHHHHKsK...',
  '.....KKHHHHHHHHHHHKK....',
  '......KKHHHHHHHHHHK.....',
  '......KCKKKKKKKKKCK.....',
  '.....KCACCCCCCCCCCCK....',
  '....KCCCACCCCCCCCCCCK...',
  '....KCCCCACCCCCCCCCCK...',
  '....KCCCCCACCCCCCCCCK...',
  '....KCCCCCCACCCCCCCCK...',
  '....KCCCCCCCACCCCCCCK...',
  '....KsCCCCCCCAACCCCsH...',
  '.....KCCCCCCCCCAACCKH...',
  '.....KCCCCCCCCCCCAAK....',
  '......KCCCCCCCCCCCKH....',
  '.......KHHHHHHHHHKK.....',
  '........KKKKKKKKK.......',
] as const satisfies TokenFrame;

const LEFT = [
  '........................',
  '....KK..................',
  '...KhH...hhhhKK.........',
  '...KhhK.KHhhhhHKK.......',
  '...KHhHKHhhhhhhhHKK.....',
  '....KHhHHhhhhhhhhhHK....',
  '....KHHhHHHhhhhHHhhK....',
  '....KKHhhhhhhhhhhhhhK...',
  '.....KHHHhHHhhhhhhHHK...',
  '.....KKKKKHHHhhhhhHHK...',
  '......KsssKHHHHHHHHHK...',
  '......KsKKsKHHHHHHHHK...',
  '......KSssSsHKKKHHHH....',
  '......KSKWSSHKSsKHHK....',
  '.....KSSKWSSKssSKHK.....',
  '......KSSSSSSSsKHHK.....',
  '......KsSSSSSsssKK......',
  '.......KsssssHKCC.......',
  '.......KKKKCCCCCCK......',
  '.......KCCCCCCCCAK......',
  '.......KCCCCCCCACCH.....',
  '.......KCCCCCCDACCK.....',
  '.......KCCCCCAACCCK.....',
  '.......KCCCCCCCCCCK.....',
  '.......KCCCCCCCCCCK.....',
  '.......KAsSSsCCCCCK.....',
  '.......KAKAsHCCCCK......',
  '........HAKHCCCCK.......',
  '........KHHHHHHK........',
  '.........KKKKKK.........',
] as const satisfies TokenFrame;

const RIGHT = [
  '........................',
  '..................KK....',
  '...........hhHH...KhK...',
  '.......KKKHhhhhKKKHhK...',
  '......KhhHhhhhhhHKhHK...',
  '.....HhhhhhhhhhhHHHHK...',
  '....KhhhhHhhhHHHhhHHK...',
  '...KHhhhhhhhHHhhhhHK....',
  '...KHhhhhhhHHHHHHHHK....',
  '...KHhhhhhhHHHKKKHKK....',
  '...KHHHHHHHHKKssssK.....',
  '...KHHHHHHHHKssKKs......',
  '....HHHHKKHKsSSsss......',
  '....KHHKsSHssSSKSs......',
  '....HHHKSsssSSSKSSK.....',
  '.....KHHKsSSSSSSSs......',
  '......KKssssSSSSSs......',
  '......DCCHsssssssK......',
  '......KACCCCCKKKKK......',
  '......HCACCCCCCCCK......',
  '.....KCCCACCCCCCCK......',
  '.....KCCCACCCCCCCK......',
  '.....KCCCCCCCCCCCK......',
  '.....KCCCCCCCCCCCK......',
  '.....KCCCCCCCCChCK......',
  '.....KCCCCKsSLSHAK......',
  '......KCCCCHsAsACK......',
  '.......KCCCCHKKCH.......',
  '........KHHHHHHK........',
  '.........KKKKKK.........',
] as const satisfies TokenFrame;

/**
 * Derives a stride pose from an authored idle frame.
 *
 * The protagonist's eight cells are hand-authored token rows, so the generated cast's
 * `composeFrontFrame` path never touches them. Rather than hand-drawing four more frames and
 * risking a protagonist that walks differently from everyone else, the same two edits are
 * applied here: split the contact row into two feet, and swing an arm into any free cell.
 *
 * The gap is off-centre so the feet read as mid-stride rather than as standing with the feet
 * apart, matching `STRIDE_GAP` in `character-source.ts`.
 *
 * No head shift on the lateral frames. Every other character leads the turn with a one-pixel
 * head offset, but the protagonist already has its own turn character from the 15-degree
 * weighted wobble, and stacking both reads as a lurch.
 *
 * `carveStrideGap` and `paintEmptyPoints` are reimplemented rather than imported, because
 * `character-source.ts` imports this module for the eye band and the cycle would be real.
 */
function strideFrom(
  frame: TokenFrame,
  gap: Readonly<{ from: number; to: number }>,
): TokenFrame {
  const armPoints: readonly (readonly [number, number])[] = [[3, 23], [20, 25]];
  const rows = frame.map((row) => [...row]);
  for (const [x, y] of armPoints) {
    const cells = rows[y];
    if (cells && cells[x] === '.') cells[x] = 'L';
  }
  const contact = rows[frame.length - 1];
  if (contact) {
    for (let x = gap.from; x <= gap.to; x += 1) contact[x] = '.';
  }
  return rows.map((cells) => cells.join('')) as unknown as TokenFrame;
}

const FRONT_STRIDE = strideFrom(FRONT, { from: 10, to: 11 });
const REAR_STRIDE = strideFrom(REAR, { from: 11, to: 12 });
const LEFT_STRIDE = strideFrom(LEFT, { from: 11, to: 12 });
const RIGHT_STRIDE = strideFrom(RIGHT, { from: 11, to: 12 });

const PROTAGONIST_REFERENCE_FRAMES: Readonly<Record<ProtagonistReferenceFrameId, TokenFrame>> =
  Object.freeze({
    'front-1': FRONT,
    'front-2': FRONT_STRIDE,
    'rear-1': REAR,
    'rear-2': REAR_STRIDE,
    'left-1': LEFT,
    'left-2': LEFT_STRIDE,
    'right-1': RIGHT,
    'right-2': RIGHT_STRIDE,
  });

export function protagonistReferenceFrames(
  characterId: string,
): Readonly<Record<ProtagonistReferenceFrameId, TokenFrame>> | undefined {
  return characterId === 'protagonist' ? PROTAGONIST_REFERENCE_FRAMES : undefined;
}
