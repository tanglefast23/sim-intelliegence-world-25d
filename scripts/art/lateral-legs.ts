import {
  LATERAL_STRIDE_GAP,
  WORLD_CELL,
  carveStrideGap,
  drawTokenCommands,
  emptyTokenFrame,
  getCharacterIdentityCommandSets,
  type CharacterSource,
  type DrawCommand,
  type TokenFrame,
} from './character-source';
import { CHARACTER_LOOKS, type CharacterLook } from './character-look-roster';
import { applyConnectedHairLighting } from './hair-lighting';

function rect(token: string, x: number, y: number, width: number, height: number): DrawCommand {
  return { kind: 'rect', token, x, y, width, height };
}

function pixels(token: string, points: readonly (readonly [number, number])[]): DrawCommand {
  return { kind: 'pixels', token, points: points.map(([x, y]) => [x, y]) };
}

function mirrorCommand(command: DrawCommand): DrawCommand {
  if (command.kind === 'rect') {
    return { ...command, x: WORLD_CELL.width - command.x - command.width };
  }
  return {
    ...command,
    points: command.points.map(([x, y]) => [WORLD_CELL.width - 1 - x, y]),
  };
}

function orient(commands: readonly DrawCommand[], direction: 'left' | 'right'): DrawCommand[] {
  return direction === 'left' ? [...commands] : commands.map(mirrorCommand);
}

/** The lowest row still counted as part of the head, for the stride's head shift. */
const HEAD_REGION_BOTTOM = 17;

/**
 * Shifts only the commands that sit wholly on the head.
 *
 * Face-mounted accessories — glasses, hats, ear defenders, a moustache — have to travel with
 * the head or they trail it by a pixel and sit off-centre on the face. Torso accessories like
 * the luggage strap and the guitar case must not move. A command that spans both regions, such
 * as a long scarf, stays put rather than tearing in half.
 */
function shiftHeadRegion(commands: readonly DrawCommand[], dx: number): DrawCommand[] {
  if (dx === 0) return [...commands];
  return commands.map((command) => {
    const onHead = command.kind === 'rect'
      ? command.y + command.height - 1 <= HEAD_REGION_BOTTOM
      : command.points.every(([, y]) => y <= HEAD_REGION_BOTTOM);
    return onHead ? (shiftCommands([command], dx, 0)[0] as DrawCommand) : command;
  });
}

/** Translates draw commands by whole pixels. Fractional offsets are not representable. */
function shiftCommands(commands: readonly DrawCommand[], dx: number, dy: number): DrawCommand[] {
  if (dx === 0 && dy === 0) return [...commands];
  return commands.map((command) => (command.kind === 'rect'
    ? { ...command, x: command.x + dx, y: command.y + dy }
    : {
      ...command,
      points: command.points.map(([x, y]) => [x + dx, y + dy] as [number, number]),
    }));
}

function lookFor(source: CharacterSource): CharacterLook {
  const look = CHARACTER_LOOKS.find(({ id }) => id === source.id);
  if (!look) throw new Error(`Missing character look for ${source.id}.`);
  return look;
}

function profileCommand(command: DrawCommand): DrawCommand {
  const projectX = (x: number): number => Math.max(5, Math.min(19, Math.round(7 + x * 0.5)));
  if (command.kind === 'rect') {
    const left = projectX(command.x);
    const right = projectX(command.x + command.width - 1);
    return rect(command.token, left, command.y, Math.max(1, right - left + 1), command.height);
  }
  return pixels(command.token, command.points.map(([x, y]) => [projectX(x), y] as const));
}

function profileCommands(commands: readonly DrawCommand[]): DrawCommand[] {
  return commands.map(profileCommand);
}

function lateralHeadCommands(): DrawCommand[] {
  return [
    rect('S', 8, 7, 9, 1),
    rect('S', 7, 8, 11, 8),
    rect('S', 8, 16, 9, 1),
    rect('s', 9, 17, 7, 1),
    pixels('S', [[6, 12], [6, 13], [6, 14]]),
    pixels('L', [[7, 9], [7, 10], [6, 12]]),
    pixels('s', [[16, 12], [17, 13], [16, 14]]),
    pixels('H', [[7, 11], [8, 11], [9, 11]]),
    rect('K', 8, 13, 1, 2),
    rect('W', 9, 13, 1, 2),
    pixels('s', [[9, 15]]),
    rect('s', 8, 16, 2, 1),
  ];
}

function lateralBodyCommands(look: CharacterLook, frameIndex: 0 | 1): DrawCommand[] {
  const patterns: readonly DrawCommand[][] = [
    [rect('c', 10, 19, 5, 3), pixels('A', [[12, 23]])],
    [pixels('A', [[9, 18], [10, 20], [11, 21], [12, 23], [13, 25]])],
    [rect('A', 11, 18, 4, 2), pixels('a', [[12, 20]])],
    [rect('c', 9, 24, 7, 2), rect('A', 9, 20, 3, 4)],
    [rect('A', 7, 19, 3, 6), rect('c', 15, 19, 3, 6)],
    [rect('c', 8, 19, 9, 3), pixels('A', [[9, 19], [14, 24]])],
  ];
  return [
    rect('C', 9, 18, 7, 1),
    rect('C', 7, 19, 11, 5),
    rect('C', 8, 24, 9, 3),
    rect('C', 9, 27, 7, 1),
    ...(patterns[look.outfitPattern] as DrawCommand[]),
    pixels('c', [[9, 18], [15, 18]]),
    pixels('L', [[6, 24]]),
    pixels('S', [[7, 24], [7, 25]]),
    pixels('s', [[7, 26]]),
    // Row 28 stays one painted run so the contact shadow keeps a single anchor. Row 29 splits
    // into two feet on the stride. Lateral feet are 7 wide at x=9, unlike the front's 10 at
    // x=7, so the front stride commands cannot be reused here.
    rect('D', 9, 28, 7, 1),
    ...(frameIndex === 1
      ? [rect('K', 9, 29, 2, 1), rect('K', 13, 29, 3, 1)]
      : [rect('K', 9, 29, 7, 1)]),
  ];
}

function textured(
  shape: readonly DrawCommand[],
  highlights: readonly (readonly [number, number])[],
  shadows: readonly (readonly [number, number])[],
): DrawCommand[] {
  return [...shape, pixels('h', highlights), pixels('K', shadows)];
}

function lateralHairCommands(look: CharacterLook): DrawCommand[] {
  switch (look.hair) {
    case 'bald': return [pixels('H', [[16, 7], [17, 8]]), pixels('h', [[16, 7]])];
    case 'swept': return textured(
      [rect('H', 8, 3, 10, 5), rect('H', 15, 6, 4, 6), pixels('H', [[7, 4], [6, 5], [7, 6]])],
      [[8, 4], [9, 4], [10, 5], [12, 5], [15, 4], [17, 6], [17, 9]],
      [[11, 7], [14, 7], [16, 10], [18, 11]],
    );
    case 'side-cloud': return textured(
      [rect('H', 8, 3, 9, 5), rect('H', 14, 5, 6, 14), rect('H', 7, 6, 3, 9)],
      [[9, 4], [11, 5], [15, 6], [17, 8], [16, 11], [18, 14], [16, 17]],
      [[12, 7], [15, 9], [18, 11], [15, 15], [18, 18]],
    );
    case 'stacked-bun': return textured(
      [rect('H', 8, 5, 10, 4), rect('H', 11, 2, 7, 4), rect('H', 13, 1, 4, 2)],
      [[14, 1], [12, 3], [14, 4], [9, 6], [12, 7], [16, 6]],
      [[12, 5], [16, 5], [10, 8], [15, 8]],
    );
    case 'crop': return textured(
      [rect('H', 8, 4, 10, 4), rect('H', 15, 7, 3, 3)],
      [[9, 4], [11, 5], [13, 4], [15, 5], [16, 7]],
      [[10, 7], [13, 7], [16, 8]],
    );
    case 'bob': return textured(
      [rect('H', 8, 4, 10, 5), rect('H', 15, 7, 5, 9), rect('H', 7, 7, 3, 6)],
      [[9, 4], [11, 5], [14, 5], [17, 7], [16, 10], [18, 13]],
      [[11, 8], [15, 8], [17, 12], [18, 15]],
    );
    case 'flat-top': return textured(
      [rect('H', 9, 2, 10, 6), rect('H', 8, 4, 2, 4), rect('H', 16, 7, 3, 3)],
      [[10, 2], [11, 2], [13, 3], [15, 3], [17, 2], [16, 5]],
      [[10, 6], [13, 5], [16, 6], [18, 7]],
    );
    case 'high-bun': return textured(
      [rect('H', 8, 5, 10, 4), rect('H', 12, 1, 6, 5)],
      [[13, 1], [14, 2], [12, 4], [9, 6], [13, 6], [16, 6]],
      [[12, 5], [16, 5], [10, 8], [15, 8]],
    );
    case 'low-part': return textured(
      [rect('H', 8, 4, 10, 4), rect('H', 15, 6, 4, 5)],
      [[9, 4], [11, 5], [13, 5], [15, 4], [17, 7]],
      [[12, 7], [15, 7], [17, 10]],
    );
    case 'question': return textured(
      [rect('H', 8, 4, 9, 4), pixels('H', [[15, 3], [17, 2], [19, 3], [19, 5], [17, 6]])],
      [[9, 4], [11, 5], [15, 4], [17, 2], [18, 4]],
      [[12, 7], [16, 6], [19, 5]],
    );
    case 'quiff': return textured(
      [rect('H', 8, 4, 10, 4), pixels('H', [[7, 3], [8, 2], [10, 3], [16, 2], [18, 3]])],
      [[8, 2], [9, 3], [11, 5], [15, 4], [16, 2]],
      [[10, 7], [14, 7], [17, 6]],
    );
    case 'pompadour': return textured(
      [rect('H', 9, 4, 9, 4), rect('H', 12, 2, 7, 3)],
      [[13, 2], [14, 2], [12, 4], [15, 4], [10, 6]],
      [[11, 7], [15, 7], [18, 4]],
    );
    case 'twin-buns': return textured(
      [rect('H', 8, 4, 10, 5), rect('H', 6, 3, 5, 5), rect('H', 15, 2, 6, 6)],
      [[7, 4], [9, 5], [16, 3], [18, 3], [13, 5]],
      [[10, 8], [15, 7], [19, 6]],
    );
    case 'long': return textured(
      [rect('H', 8, 4, 10, 5), rect('H', 14, 7, 6, 15), rect('H', 7, 7, 3, 7)],
      [[9, 4], [11, 5], [15, 6], [17, 8], [16, 12], [18, 16], [17, 20]],
      [[12, 8], [16, 10], [18, 14], [16, 18], [19, 21]],
    );
    case 'mohawk': return textured(
      [rect('H', 11, 1, 6, 8), rect('H', 15, 6, 3, 4)],
      [[13, 1], [12, 3], [14, 4], [13, 6], [16, 7]],
      [[11, 7], [15, 8], [17, 9]],
    );
    case 'braids': return textured(
      [rect('H', 8, 4, 10, 4), rect('H', 15, 7, 5, 13), rect('H', 7, 7, 3, 8)],
      [[9, 4], [12, 5], [16, 8], [17, 11], [16, 15], [18, 18]],
      [[11, 7], [16, 10], [18, 13], [16, 19]],
    );
    case 'bowl': return textured(
      [rect('H', 8, 4, 10, 5), rect('H', 15, 7, 4, 5)],
      [[9, 4], [11, 5], [14, 5], [16, 6], [17, 8]],
      [[10, 8], [13, 8], [16, 10]],
    );
    case 'spikes': return textured(
      [rect('H', 8, 5, 10, 4), pixels('H', [[8, 3], [10, 2], [12, 4], [14, 2], [16, 3], [18, 2]])],
      [[10, 2], [11, 5], [14, 2], [16, 4], [17, 6]],
      [[10, 8], [13, 8], [16, 8]],
    );
    case 'side-fan': return textured(
      [rect('H', 8, 5, 9, 4), pixels('H', [[16, 4], [18, 3], [20, 4], [20, 6], [18, 8]])],
      [[9, 5], [12, 6], [17, 4], [19, 4], [18, 7]],
      [[11, 8], [15, 8], [20, 6]],
    );
    case 'ponytail': return textured(
      [rect('H', 8, 4, 10, 4), rect('H', 16, 6, 5, 9)],
      [[9, 4], [12, 5], [15, 5], [18, 7], [19, 10], [18, 13]],
      [[11, 7], [16, 7], [20, 12], [18, 14]],
    );
  }
}

function customProfileOddity(look: CharacterLook): DrawCommand[] | undefined {
  switch (look.oddity) {
    case 'tower-flat-top': return [
      rect('H', 11, 1, 7, 1), rect('H', 10, 2, 9, 2), rect('H', 9, 4, 11, 3),
      rect('h', 12, 1, 5, 1), rect('h', 11, 2, 5, 1), rect('h', 10, 4, 4, 1), rect('h', 14, 5, 4, 1),
      pixels('K', [[11, 4], [12, 4], [13, 4], [14, 5], [15, 5], [16, 5], [17, 6]]),
    ];
    case 'umbrella-hat': return [
      pixels('A', [[14, 1], [12, 2], [13, 2], [15, 2], [16, 2], [10, 3], [11, 3], [17, 3], [18, 3]]),
      rect('A', 8, 4, 12, 1), pixels('a', [[10, 4], [14, 4], [18, 4]]), rect('A', 14, 5, 1, 3),
    ];
    case 'window-glasses': return [
      rect('K', 6, 12, 6, 1), rect('K', 6, 15, 6, 1),
      rect('K', 6, 13, 1, 2), rect('K', 11, 13, 1, 2),
    ];
    case 'curl-moustache': return [pixels('H', [[6, 16], [7, 15], [8, 16], [9, 17], [10, 16], [11, 15]])];
    case 'square-ear-defenders': return [rect('A', 16, 8, 4, 8), rect('K', 17, 9, 2, 6), rect('A', 12, 6, 6, 2)];
    case 'lantern-chin': return [rect('s', 7, 17, 5, 2), pixels('s', [[8, 19], [9, 20], [10, 19]])];
    case 'tiny-hat-high-collar': return [rect('A', 12, 1, 4, 2), rect('A', 15, 13, 5, 8)];
    case 'tower-beanie': return [
      pixels('A', [[10, 6], [9, 5], [10, 3], [11, 2], [12, 1], [15, 1], [17, 3], [18, 5], [17, 6]]),
      rect('A', 16, 12, 3, 14),
    ];
    case 'spiral-moustache': return [pixels('H', [[6, 16], [7, 15], [9, 15], [10, 16], [9, 17], [7, 17], [11, 16]])];
    case 'monocle-chain': return [
      rect('A', 6, 12, 6, 1), rect('A', 6, 15, 6, 1), rect('A', 6, 13, 1, 2), rect('A', 11, 13, 1, 2),
      pixels('A', [[11, 16], [13, 18], [14, 20], [14, 23], [15, 25]]),
    ];
    case 'wing-collar': return [pixels('a', [[6, 16], [7, 17], [8, 18], [9, 19], [18, 16], [17, 17], [16, 18], [15, 19]])];
    case 'one-ear-cap': return [rect('A', 9, 2, 9, 4), rect('A', 15, 5, 4, 9)];
    case 'veil-cap': return [rect('A', 11, 2, 6, 3), rect('A', 17, 4, 4, 15), pixels('a', [[18, 7], [19, 10], [18, 14]])];
    case 'star-glasses': return [pixels('A', [[6, 13], [8, 13], [9, 11], [10, 13], [12, 13], [10, 15], [9, 17], [8, 15]])];
    case 'shoulder-bird': return [rect('A', 16, 16, 5, 6), pixels('a', [[17, 15], [18, 14], [19, 15], [20, 18]]), pixels('K', [[19, 16]])];
    case 'triple-braid': return [
      rect('H', 12, 1, 3, 7),
      rect('H', 16, 7, 3, 12),
      pixels('h', [[13, 2], [13, 4], [17, 8], [17, 11], [17, 15]]),
      pixels('K', [[14, 6], [18, 10], [18, 14], [18, 18]]),
    ];
    case 'double-goggles': return [
      rect('A', 9, 6, 9, 3), rect('W', 11, 7, 5, 2),
      rect('A', 6, 12, 6, 1), rect('A', 6, 15, 6, 1), rect('A', 6, 13, 1, 2), rect('A', 11, 13, 1, 2),
    ];
    case 'shell-shoulders': return [
      rect('A', 15, 18, 6, 5),
      pixels('a', [[16, 19], [17, 18], [19, 20], [18, 22]]),
    ];
    default: return undefined;
  }
}

function customProfileSecondary(look: CharacterLook): DrawCommand[] | undefined {
  switch (look.secondary) {
    case 'opposite-ponytail': return [rect('H', 4, 6, 3, 7), pixels('h', [[5, 7], [5, 8], [5, 10]]), pixels('K', [[6, 11], [6, 12]])];
    default: return undefined;
  }
}

export function getLateralIdentityCommandSets(
  source: CharacterSource,
  direction: 'left' | 'right',
): Readonly<{ primary: readonly DrawCommand[]; secondary: readonly DrawCommand[] }> {
  const look = lookFor(source);
  const identity = getCharacterIdentityCommandSets(look);
  const primary = customProfileOddity(look) ?? profileCommands(identity.primaryWorld);
  const secondary = customProfileSecondary(look) ?? profileCommands(identity.secondaryWorld);
  return {
    primary: orient(primary, direction),
    secondary: orient(secondary, direction),
  };
}

function identityLayerCommands(look: CharacterLook, layer: CharacterLook['oddityLayer']): DrawCommand[] {
  const identity = getCharacterIdentityCommandSets(look);
  const primary = look.oddityLayer === layer
    ? (customProfileOddity(look) ?? profileCommands(identity.primaryWorld))
    : [];
  const secondary = look.secondaryLayer === layer
    ? (customProfileSecondary(look) ?? profileCommands(identity.secondaryWorld))
    : [];
  return [...primary, ...secondary];
}

export function composeLateralFrame(
  source: CharacterSource,
  direction: 'left' | 'right',
  frameIndex: 0 | 1,
): TokenFrame {
  const look = lookFor(source);
  const frame = emptyTokenFrame(WORLD_CELL.width, WORLD_CELL.height);
  const draw = (commands: readonly DrawCommand[]): void => drawTokenCommands(frame, orient(commands, direction));
  // `source.sourceLayers.legs` is deliberately NOT drawn here. This compose has never read it;
  // lateral feet come from `lateralBodyCommands` itself, at a different width and offset than
  // the front legs. Drawing the legs layer underneath would add base pixels to the idle frame
  // and then have the body's own base overdraw the stride gap.
  draw(lateralBodyCommands(look, frameIndex));
  draw(identityLayerCommands(look, 'torsoAndClothing'));
  /**
   * The head leads the body into the turn on the stride frame, stacking with the existing
   * `movementPresentation().leanX` so the head moves two pixels while the torso moves one.
   *
   * Shifted BEFORE `orient`: `orient(commands, 'left')` is the identity, so the unoriented art
   * is the left-facing drawing, and a left-facing walker travels toward -x. One -1 therefore
   * leads the turn on left and mirrors to +1 — also leading — on right.
   */
  const headShift = frameIndex === 1 ? -1 : 0;
  const hairCommands = [...lateralHairCommands(look), ...identityLayerCommands(look, 'hair')];
  const shiftedHead = shiftCommands(lateralHeadCommands(), headShift, 0);
  const shiftedHair = shiftCommands(hairCommands, headShift, 0);
  draw(shiftedHead);
  draw(shiftedHair);
  draw(shiftHeadRegion(identityLayerCommands(look, 'accessory'), headShift));
  draw(identityLayerCommands(look, 'heldItem'));
  const hairMask = emptyTokenFrame(WORLD_CELL.width, WORLD_CELL.height);
  drawTokenCommands(hairMask, orient(shiftedHair, direction));
  applyConnectedHairLighting(frame, hairMask, 22);
  // Carved last, for the same reason the front frame carves: big-black-boots and resident-16's
  // feature both repaint row 29 from a later layer and would close the split.
  if (frameIndex === 1) carveStrideGap(frame, LATERAL_STRIDE_GAP);
  return frame;
}
