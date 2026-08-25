import { createHash } from 'node:crypto';

import { DICE_ROLL_CUP_RECIPE, bakeDiceRollCupFrame } from '../../render/pencil/dice-roll-cup';

test('dice cup is deterministic and keeps its interaction anchors', () => {
  const first = bakeDiceRollCupFrame('front');
  const second = bakeDiceRollCupFrame('front');
  expect(createHash('sha256').update(first).digest('hex')).toBe(createHash('sha256').update(second).digest('hex'));
  expect(DICE_ROLL_CUP_RECIPE.assetId).toBe('dice-roll-cup-01');
  expect(DICE_ROLL_CUP_RECIPE.views.front.anchors.button).toEqual({ x: 80, y: 89 });
  expect(first.some((value) => value !== 0)).toBe(true);
});
