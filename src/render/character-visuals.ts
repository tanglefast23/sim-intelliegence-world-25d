import { CHARACTER_IDS, type CharacterId } from './atlas';

/**
 * Which character sheet an NPC state id draws with.
 *
 * This lives apart from `WorldScene` because it is a content mapping, not rendering: it needs a
 * test, and a test that has to mount a React component to check a string lookup is a test nobody
 * writes. `WorldScene` imports it rather than owning it.
 *
 * The default is a literal id match, and that default is what makes new cast silently wrong. The
 * Ledger Annex clerks are `clerk_01`..`clerk_12`, which become `clerk-01`..`clerk-12`, which are in
 * no atlas — so without the rule below every one of them falls through to `generic-resident` and
 * the office renders twelve identical people in twelve cubicles. Nothing throws.
 *
 * The clerk's own number picks the borrowed sheet, so the twelve are distinct by construction
 * rather than by a hand-kept table that can drift out of step with the cast.
 */
const CLERK_VISUAL_PATTERN = /^clerk_(\d{2})$/u;

const BORROWED_VISUALS: Readonly<Record<string, CharacterId>> = {
  office_manager: 'resident-13',
};

export function visualIdForNpc(stateId: string): CharacterId {
  const candidate = stateId.replaceAll('_', '-') as CharacterId;
  if (CHARACTER_IDS.includes(candidate)) return candidate;

  const clerkNumber = CLERK_VISUAL_PATTERN.exec(stateId)?.[1];
  if (clerkNumber !== undefined) {
    const borrowed = `resident-${clerkNumber}` as CharacterId;
    if (CHARACTER_IDS.includes(borrowed)) return borrowed;
  }

  const named = BORROWED_VISUALS[stateId];
  if (named !== undefined && CHARACTER_IDS.includes(named)) return named;

  return 'generic-resident';
}

/**
 * Which way an NPC faces when it is standing still.
 *
 * The default is `down`, which is right for an actor loitering in a street and wrong for one at a
 * desk. The Ledger Annex clerks never walk — their four schedule blocks are all the same tile — so
 * without this every one of the thirteen stands with their back to the desk they are working at,
 * facing the aisle. Spec 12.3: desks sit on the north side of the module, clerks stand south of the
 * desk and face up into it.
 *
 * Returns undefined for everyone else, so a walking actor keeps the direction its movement gives it
 * and no other cast is touched.
 */
export function idleFacingForNpc(stateId: string): 'up' | undefined {
  return CLERK_VISUAL_PATTERN.test(stateId) || stateId === 'office_manager' ? 'up' : undefined;
}
