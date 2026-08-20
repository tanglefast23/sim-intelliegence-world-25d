import { movementPresentation } from '../../atlas';
import { createInitialState } from '../../../domain/state/initial-state';
import { WORLD_MAP_CATALOG } from '../../../application/runtime/map-catalog';
import { buildWorldFrameState } from '../../world-frame';
import { buildVampireLayout, SHEET_WIDTH } from '../layout';
import { drawVampireCharacter, VAMPIRE_PART_IDS, VAMPIRE_PARTS } from '../parts';
import {
  bakeVampireFrames,
  BOIL_FRAMES,
  PENCIL_CONTACT_ROW,
  PENCIL_HEIGHT,
  PENCIL_WIDTH,
  VAMPIRE_SHEET_FRAMES,
  WORLD_CELL_HEIGHT,
} from '../vampire';
import { poseFromSprite, screenSideForAttachment, VAMPIRE_FACINGS, vampireSheetIndex } from '../pose';
import { hashSeed, Sketch } from '../sketch';
import { blitPencilFrame, pencilBillboards, vampireBoilIndex, vampirePencilFrames } from '../billboard';

const MAP = WORLD_MAP_CATALOG.northwest_residential;

describe('vampire pencil character', () => {
  test('movementPresentation walks vampire-01 on the existing sheet', () => {
    expect(movementPresentation('vampire-01', 'up', 0).sprite).toBe('character.vampire-01.rear-1');
    expect(movementPresentation('vampire-01', 'down', 1).sprite).toBe('character.vampire-01.front-2');
    expect(movementPresentation('vampire-01', 'left', 0)).toMatchObject({
      sprite: 'character.vampire-01.left-1', leanX: 0, bounceY: 0, shadowX: 0,
    });
    expect(movementPresentation('vampire-01', 'right', 1)).toMatchObject({
      sprite: 'character.vampire-01.right-2', leanX: 1, bounceY: -1, shadowX: 1,
    });
  });

  test('the player visualId is vampire-01 and still leans on a walk frame', () => {
    const idle = buildWorldFrameState(MAP, createInitialState(), {}, 'down', 0);
    const walking = buildWorldFrameState(
      MAP,
      createInitialState(),
      {},
      'right',
      1,
      { visualFoot: { x: 592, y: 606 }, walkFrame: 1, moving: true, reducedMotion: false, horizontalRunDistance: 16 },
    );
    const player = idle.characters.find(({ id }) => id === 'protagonist')!;
    const step = walking.characters.find(({ id }) => id === 'protagonist')!;
    expect(player.visualId).toBe('vampire-01');
    expect(player.sprite).toBe('character.vampire-01.front-1');
    expect(step.sprite).toBe('character.vampire-01.right-2');
    expect(step.angleDegrees).not.toBe(0);
  });

  test('layout F publishes the anchors parts read', () => {
    const F = buildVampireLayout();
    expect(F.cx).toBe(SHEET_WIDTH / 2);
    // The eye offset scales with the head AND the sheet, so pin the relationship rather than any
    // authored number. It sits inside the skull's half width and outside the midline.
    expect(F.L.eyeX(1)).toBeCloseTo(-F.L.eyeX(-1));
    expect(F.L.eyeX(1)).toBeGreaterThan(0);
    expect(F.L.eyeX(1)).toBeLessThan(F.w);
    expect(F.L.my).toBeGreaterThan(F.L.eyeY);
    expect(F.B.floorY).toBeGreaterThan(F.B.hipY);
    expect(F.lwMain).toBeGreaterThan(F.lwThin);
  });

  test('the part registry is behind-first and complete', () => {
    expect(VAMPIRE_PART_IDS).toEqual([
      'cloak', 'legs', 'arms', 'skull', 'collar', 'ears', 'hair', 'eyes', 'nose', 'fangs',
    ]);
    expect(VAMPIRE_PARTS).toHaveLength(10);
  });

  test('sheet has a three-boil idle and two walk gaits for every facing', () => {
    const once = bakeVampireFrames();
    expect(once).toHaveLength(VAMPIRE_SHEET_FRAMES);
    expect(once).toHaveLength(VAMPIRE_FACINGS.length * 3 * BOIL_FRAMES);
    expect(once[0]!.length).toBe(PENCIL_WIDTH * PENCIL_HEIGHT * 4);
    const idleIndexes = VAMPIRE_FACINGS.map((facing) => vampireSheetIndex({ facing, gait: 0, moving: false }, 0));
    expect(idleIndexes).toEqual([0, 9, 18, 27]);
    expect(new Set(idleIndexes).size).toBe(VAMPIRE_FACINGS.length);
    const [frontIdle, rearIdle, leftIdle, rightIdle] = idleIndexes;
    expect([...once[frontIdle!]!]).not.toEqual([...once[rearIdle!]!]);
    expect([...once[leftIdle!]!]).not.toEqual([...once[rightIdle!]!]);
    const front = vampireSheetIndex({ facing: 'front', gait: 0, moving: true }, 0);
    const rear = vampireSheetIndex({ facing: 'rear', gait: 0, moving: true }, 0);
    const left = vampireSheetIndex({ facing: 'left', gait: 0, moving: true }, 0);
    const right = vampireSheetIndex({ facing: 'right', gait: 0, moving: true }, 0);
    const step = vampireSheetIndex({ facing: 'front', gait: 1, moving: true }, 0);
    expect([...once[front]!]).not.toEqual([...once[rear]!]);
    expect([...once[left]!]).not.toEqual([...once[right]!]);
    expect([...once[front]!]).not.toEqual([...once[step]!]);
  });

  test('poseFromSprite reads the walk sprite', () => {
    expect(poseFromSprite('character.vampire-01.rear-1')).toEqual({ facing: 'rear', gait: 0, moving: false });
    expect(poseFromSprite('character.vampire-01.right-2', true)).toEqual({ facing: 'right', gait: 1, moving: true });
  });

  test('body-local sides project consistently through every facing', () => {
    expect(VAMPIRE_FACINGS.map((facing) => screenSideForAttachment('right', facing, 'trailing'))).toEqual([-1, 1, 1, -1]);
    expect(VAMPIRE_FACINGS.map((facing) => screenSideForAttachment('left', facing, 'leading'))).toEqual([1, -1, -1, 1]);
  });

  test('a part draw uses the same seed crumbs', () => {
    const left = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
    const right = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
    left.boil(hashSeed('vampire-01', 'front', 'parts', 0));
    right.boil(hashSeed('vampire-01', 'front', 'parts', 0));
    drawVampireCharacter(left);
    drawVampireCharacter(right);
    expect([...left.data]).toEqual([...right.data]);
  });

  test('pencil billboards swap the facing sheet onto the player', () => {
    const frame = buildWorldFrameState(MAP, createInitialState(), {}, 'left', 1, {
      visualFoot: { x: 592, y: 606 }, walkFrame: 1, moving: true, reducedMotion: false, horizontalRunDistance: 16,
    });
    const pencils = pencilBillboards({
      ...frame,
      animationTimestampMilliseconds: 0,
    });
    const player = frame.characters.find(({ id }) => id === 'protagonist')!;
    expect(pencils).toHaveLength(1);
    expect(player.sprite).toBe('character.vampire-01.left-2');
    expect(vampireBoilIndex(0)).toBe(0);
    expect(vampireBoilIndex(2000)).toBe(vampireBoilIndex(2000) % BOIL_FRAMES);

    const target = new Uint8ClampedArray(PENCIL_WIDTH * PENCIL_HEIGHT * 4);
    blitPencilFrame(target, player, 0);
    const index = vampireSheetIndex({ facing: 'left', gait: 1, moving: true }, 0);
    expect([...target]).toEqual([...vampirePencilFrames()[index]!]);
  });

  test('reduced motion pins the current facing to idle boil frame zero', () => {
    const frame = buildWorldFrameState(MAP, createInitialState(), {}, 'right', 1, {
      visualFoot: { x: 592, y: 606 }, walkFrame: 1, moving: true, reducedMotion: true, horizontalRunDistance: 16,
    });
    const player = frame.characters.find(({ id }) => id === 'protagonist')!;
    const target = new Uint8ClampedArray(PENCIL_WIDTH * PENCIL_HEIGHT * 4);
    blitPencilFrame(target, player, 2000, true);
    const expected = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
    expected.boil(hashSeed('vampire-01', 'right', 'idle', 0));
    drawVampireCharacter(expected, buildVampireLayout(), { facing: 'right', gait: 0, moving: false });
    expect(player.sprite).toBe('character.vampire-01.right-1');
    expect([...target]).toEqual([...expected.data]);
    expect(vampireBoilIndex(2000, true)).toBe(0);
  });

  test('the quad sinks so the boot soles stand on the contact point, not the empty sheet bottom', () => {
    const frame = buildWorldFrameState(MAP, createInitialState(), {}, 'down', 0);
    const [pencil] = pencilBillboards({ ...frame, animationTimestampMilliseconds: 0 });
    const player = frame.characters.find(({ id }) => id === 'protagonist')!;

    // Sheet row of the quad's bottom edge once the lift is applied. The soles live at
    // PENCIL_CONTACT_ROW, so the quad has to reach exactly that far past the ground.
    const rowsBelowGround = (-pencil!.lift / pencil!.height) * PENCIL_HEIGHT;
    expect(pencil!.lift).toBeLessThan(0);
    expect(rowsBelowGround).toBeCloseTo(PENCIL_HEIGHT - PENCIL_CONTACT_ROW, 6);
    expect(pencil!.lift).toBeCloseTo(-(52 / 360) * WORLD_CELL_HEIGHT * player.scale / 32, 6);
  });
});
