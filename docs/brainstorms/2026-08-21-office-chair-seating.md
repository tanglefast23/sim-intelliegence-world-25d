# Office chairs and seated workers

## Decision

Add one textured 2.5D swivel chair to every cubicle and the manager desk. The chairs share the existing worker tiles and do not block movement.

The 12 clerks and office manager use one seated world pose while idle at their desks. The pose keeps the original character scale, removes the standing leg region, and places the remaining body on the chair. Walking, reactions, and characters outside the office keep their existing poses.

## Why this route

A full bone rig would change every approved character renderer. It is not needed for a rear-facing desk pose. A whole-sprite scale would make heads and torsos shrink and would not look seated. Cropping the standing contact region keeps the approved upper-body art unchanged and lets the chair provide the missing lower-body silhouette.

## Acceptance

- The cubicle farm has 12 chairs.
- The manager desk has one chair.
- Chairs have separate cushion, back, arm, pedestal, and rolling-base geometry.
- Chair tiles remain walkable.
- Idle office workers align with chair seats.
- Moving or reacting workers do not use the seated pose.
