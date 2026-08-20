import type { CharacterSource, TokenFrame } from './character-source';
import { CHARACTER_LOOKS, type CharacterLook } from './character-look-roster';
import { applyConnectedHairLighting } from './hair-lighting';

const SHOE_BAND_TOP = 25;
const SOLE_FOR: Readonly<Record<string, string>> = { W: 'D' };

function lookFor(source: CharacterSource): CharacterLook {
  const look = CHARACTER_LOOKS.find(({ id }) => id === source.id);
  if (!look) throw new Error(`Missing character look for ${source.id}.`);
  return look;
}

function paintedColumns(row: string): number[] {
  return [...row].flatMap((token, column) => token === '.' ? [] : [column]);
}

function shoeGroups(rows: readonly string[]): { start: number; end: number }[] {
  const width = rows[0]?.length ?? 0;
  const groups: { start: number; end: number }[] = [];
  for (let column = 0; column < width; column += 1) {
    const isShoe = rows.slice(SHOE_BAND_TOP).some((row) => SOLE_FOR[row[column] as string]);
    if (!isShoe) continue;
    const previous = groups.at(-1);
    if (previous && previous.end === column - 1) previous.end = column;
    else groups.push({ start: column, end: column });
  }
  return groups;
}

function bottomShoeRow(rows: readonly string[], group: { start: number; end: number }): number {
  let bottom = -1;
  for (let row = SHOE_BAND_TOP; row < rows.length; row += 1) {
    for (let column = group.start; column <= group.end; column += 1) {
      if (SOLE_FOR[rows[row]?.[column] as string]) bottom = row;
    }
  }
  return bottom;
}

function withRearSole(rows: readonly string[]): string[] {
  const groups = shoeGroups(rows);
  if (groups.length < 2) return [...rows];
  const bottoms = groups.map((group) => bottomShoeRow(rows, group));
  const nearest = Math.max(...bottoms);
  if (bottoms.every((bottom) => bottom === nearest)) return [...rows];
  const nearColumns = groups
    .filter((_group, index) => bottoms[index] === nearest)
    .flatMap((group) => Array.from(
      { length: group.end - group.start + 1 },
      (_unused, offset) => group.start + offset,
    ));
  return rows.map((source, row) => {
    if (row < SHOE_BAND_TOP) return source;
    const tokens = [...source];
    for (const column of nearColumns) {
      const sole = SOLE_FOR[tokens[column] as string];
      if (sole) tokens[column] = sole;
    }
    return tokens.join('');
  });
}

function rearHairBottom(look: CharacterLook): number {
  if (look.hair === 'bald') return -1;
  if (['flat-top', 'crop', 'low-part', 'question', 'quiff', 'pompadour', 'mohawk', 'spikes', 'side-fan'].includes(look.hair)) {
    return 11;
  }
  if (['swept', 'bowl', 'high-bun', 'stacked-bun', 'twin-buns'].includes(look.hair)) return 13;
  return 17;
}

/**
 * Builds a true rear head from the front silhouette. Face pixels become the
 * back hair or scalp while authored hair edges and accessories stay intact.
 */
export function deriveRearFrame(front: readonly string[], source: CharacterSource): TokenFrame {
  const look = lookFor(source);
  const detailTokens = new Set(source.rearStyle.torsoDetailTokens);
  const hairBottom = rearHairBottom(look);
  const rear = front.map((row, rowIndex) => {
    const columns = paintedColumns(row);
    if (columns.length < 3) return row;
    const first = columns[0] as number;
    const last = columns.at(-1) as number;
    const tokens = [...row];
    if (rowIndex >= 4 && rowIndex <= 17) {
      for (let column = first + 1; column < last; column += 1) {
        const token = tokens[column] as string;
        const backHead = rowIndex <= hairBottom ? 'H' : rowIndex >= 16 ? 's' : 'S';
        if (
          token === 'S' || token === 's' || token === 'L' || token === 'W' || token === 'D' ||
          (look.hair !== 'bald' && (token === 'H' || token === 'h' || token === 'K')) ||
          (look.hair === 'bald' && (token === 'H' || token === 'h' || token === 'K') && rowIndex >= 10)
        ) {
          tokens[column] = backHead;
        }
      }
    } else if (rowIndex >= 18 && rowIndex <= 22) {
      for (let column = first + 1; column < last; column += 1) {
        if (detailTokens.has(tokens[column] as string)) tokens[column] = source.rearStyle.clothing;
      }
    }
    return tokens.join('');
  });
  const withSole = withRearSole(rear);
  // A real left/right asymmetry flips on the rear view. Most legacy looks are intentionally
  // front-projected, so keep the correction scoped to the approved anatomical collar.
  const oriented = look.oddity === 'asymmetric-high-collar'
    ? withSole.map((row) => [...row].reverse().join(''))
    : withSole;
  applyConnectedHairLighting(oriented, [...oriented], hairBottom);
  return oriented;
}
