import { CHARACTER_IDS, type CharacterId } from './atlas';

/**
 * Which character sheet an NPC state id draws with.
 *
 * This lives apart from `WorldScene` because it is a content mapping, not rendering: it needs a
 * test, and a test that has to mount a React component to check a string lookup is a test nobody
 * writes. `WorldScene` imports it rather than owning it.
 *
 * Office state ids do not match the authored character ids. Keep the explicit mapping here so each
 * seated worker uses the correct creature sheet instead of silently falling back to a generic
 * resident. Nothing throws when that fallback happens, so this table is covered by content tests.
 */
const BORROWED_VISUALS: Readonly<Record<string, CharacterId>> = {
  clerk_01: 'linda-boyfriend',
  clerk_02: 'devon-price',
  clerk_03: 'rafael-cruz',
  clerk_04: 'tomas-reed',
  clerk_05: 'priya-nair',
  clerk_06: 'sora-tan',
  clerk_07: 'resident-02',
  clerk_08: 'elise-moreau',
  office_manager: 'resident-01',
};
const OFFICE_SEAT_IDS = new Set(Object.keys(BORROWED_VISUALS));

export function visualIdForNpc(stateId: string): CharacterId {
  const candidate = stateId.replaceAll('_', '-') as CharacterId;
  if (CHARACTER_IDS.includes(candidate)) return candidate;

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
  return OFFICE_SEAT_IDS.has(stateId) ? 'up' : undefined;
}

export function isOfficeSeatNpc(stateId: string): boolean {
  return OFFICE_SEAT_IDS.has(stateId);
}
