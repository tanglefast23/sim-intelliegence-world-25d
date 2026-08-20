import type { Sketch } from '../sketch';
import { buildVampireLayout, type VampireLayout } from '../layout';
import type { VampirePose } from '../pose';
import { drawCloak, drawCollar } from './cloak';
import { drawLegs } from './legs';
import { drawArms } from './arms';
import { drawSkull } from './skull';
import { drawEars } from './ears';
import { drawHair } from './hair';
import { drawEyes } from './eyes';
import { drawNose } from './nose';
import { drawFangs } from './fangs';

export type VampirePartId =
  | 'cloak'
  | 'legs'
  | 'arms'
  | 'skull'
  | 'collar'
  | 'ears'
  | 'hair'
  | 'eyes'
  | 'nose'
  | 'fangs';

export type VampirePart = Readonly<{
  id: VampirePartId;
  draw: (sketch: Sketch, layout: VampireLayout, pose: VampirePose) => void;
}>;

/** Behind first, in front last. */
export const VAMPIRE_PARTS: readonly VampirePart[] = [
  { id: 'cloak', draw: drawCloak },
  { id: 'legs', draw: drawLegs },
  { id: 'arms', draw: drawArms },
  { id: 'skull', draw: drawSkull },
  { id: 'collar', draw: drawCollar },
  { id: 'ears', draw: drawEars },
  { id: 'hair', draw: drawHair },
  { id: 'eyes', draw: drawEyes },
  { id: 'nose', draw: drawNose },
  { id: 'fangs', draw: drawFangs },
];

export const VAMPIRE_PART_IDS = VAMPIRE_PARTS.map((part) => part.id);

export const IDLE_POSE: VampirePose = { facing: 'front', gait: 0, moving: false };

export function drawVampireCharacter(
  sketch: Sketch,
  layout: VampireLayout = buildVampireLayout(),
  pose: VampirePose = IDLE_POSE,
): void {
  for (const part of VAMPIRE_PARTS) {
    part.draw(sketch, layout, pose);
  }
}
