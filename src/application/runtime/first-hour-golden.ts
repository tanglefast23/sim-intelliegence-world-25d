import { reduceCommand } from '../../domain/commands/reducer';
import { DomainCommandSchema } from '../../domain/commands/types';
import { LINDA_QUEST } from '../../domain/quests/quest-machine';
import { createInitialState } from '../../domain/state/initial-state';
import { WorldStateSchema, type WorldState } from '../../domain/state/schema';
import { advanceActiveNpcMovement, movementForNpc } from '../../world/schedules/active-movement';
import { createMovementState, requestMovement } from '../../world/pathfinding/movement';
import { WORLD_MAP_CATALOG } from './map-catalog';
import { tickWorld } from './tick';
import { advanceWorldMovement } from './world-runtime';

export type FirstHourSummary = Readonly<{
  version: 1;
  protagonist: Readonly<{ id: string; displayName: string; mapId: string; tileX: number; tileY: number }>;
  startMinute: number;
  endMinute: number;
  energy: number;
  health: number;
  money: number;
  quest: Readonly<{ status: string; flags: readonly string[]; outcome: string }>;
  linda: Readonly<{ familiarity: number; trust: number; attraction: number }>;
  velvetTide: Readonly<{ revealed: boolean; standing: number }>;
  policeAttention: string;
  evidenceIds: readonly string[];
  journalMarkerVisible: boolean;
  revision: number;
}>;

function command(state: WorldState, type: string, body: Record<string, unknown>, id: string) {
  return DomainCommandSchema.parse({
    type,
    commandId: `command-first-hour-${id}`,
    eventId: `event-first-hour-${id}`,
    scheduledMinute: state.clock.absoluteMinute,
    priority: 75,
    ...body,
  });
}

function walkProtagonist(state: WorldState, x: number, y: number): WorldState {
  const map = WORLD_MAP_CATALOG.northwest_residential;
  const start = state.protagonist.worldPosition;
  let movement = requestMovement(map, createMovementState({ x: start.tileX, y: start.tileY }), { x, y });
  let current = state;
  for (let step = 0; step < 128 && movement.status === 'moving'; step += 1) {
    ({ movement, worldState: current } = advanceWorldMovement(map, movement, current));
  }
  if (movement.player.x !== x || movement.player.y !== y) throw new Error('First-hour protagonist route did not finish.');
  return current;
}

function placeAuthoredWitness(state: WorldState): WorldState {
  let movement = movementForNpc(state, 'generic_resident');
  if (!movement) throw new Error('First-hour witness is not active.');
  let current = state;
  for (let step = 0; step < 64 && current.npcs.generic_resident?.scheduleGoal; step += 1) {
    ({ movement, worldState: current } = advanceActiveNpcMovement(
      WORLD_MAP_CATALOG.northwest_residential,
      movement,
      current,
      'generic_resident',
    ));
  }
  if (current.npcs.generic_resident?.scheduleGoal) throw new Error('First-hour witness route did not finish.');
  return current;
}

export function summarizeFirstHour(state: WorldState, startMinute = 480): FirstHourSummary {
  const quest = state.quests.linda_boyfriend_check;
  const linda = state.relationships.linda;
  const velvetTide = state.factions.velvet_tide;
  const journal = state.journal.journal_linda_boyfriend;
  if (!quest || !linda || !velvetTide || !journal) throw new Error('First-hour state is incomplete.');
  return {
    version: 1,
    protagonist: {
      id: state.protagonist.id,
      displayName: state.protagonist.displayName,
      mapId: state.protagonist.worldPosition.mapId,
      tileX: state.protagonist.worldPosition.tileX,
      tileY: state.protagonist.worldPosition.tileY,
    },
    startMinute,
    endMinute: state.clock.absoluteMinute,
    energy: state.protagonist.energy,
    health: state.protagonist.health,
    money: state.inventory.money,
    quest: {
      status: quest.status,
      flags: [...quest.flagIds].sort(),
      outcome: journal.outcomeReceipts.at(-1)?.outcome ?? 'missing',
    },
    linda: { ...linda.values },
    velvetTide: { revealed: velvetTide.revealed, standing: velvetTide.standing },
    policeAttention: state.policeAttention,
    evidenceIds: Object.keys(state.evidence).sort(),
    journalMarkerVisible: journal.markerVisible,
    revision: state.revision,
  };
}

export function runFirstHourGolden(displayName = 'MISTAKE'): Readonly<{
  state: WorldState;
  summary: FirstHourSummary;
}> {
  const startMinute = 8 * 60;
  let state = createInitialState(displayName);
  const linda = state.npcs.linda?.presence;
  if (!linda || linda.kind !== 'active_local') throw new Error('First-hour Linda is not active.');
  state = walkProtagonist(state, linda.tileX + 1, linda.tileY);
  state = reduceCommand(state, command(state, 'start-linda-quest', { requestNpcId: 'linda' }, 'start')).state;
  state = reduceCommand(state, command(state, 'purchase-social-option', { offerId: 'security_report' }, 'security')).state;
  state = placeAuthoredWitness(state);
  state = walkProtagonist(
    state,
    LINDA_QUEST.targetTile.x - LINDA_QUEST.maximumActionDistance,
    LINDA_QUEST.targetTile.y,
  );
  state = reduceCommand(state, command(state, 'discover-linda-villa', {}, 'discover')).state;
  const protect = reduceCommand(state, command(state, 'resolve-linda-quest', { approachId: 'protect_linda' }, 'protect'));
  if (protect.event?.type !== 'linda-quest-resolved' ||
      protect.event.resultId !== 'linda_protected' ||
      JSON.stringify(protect.event.actionCheck) !== JSON.stringify({
        dice: [3, 5], modifier: 4, target: 9, total: 12, success: true,
      })) {
    throw new Error('First-hour Action Check must roll 3 and 5 with Readiness +4 and protect Linda.');
  }
  state = protect.state;
  state = tickWorld(state, 60 * 1_000);
  state = WorldStateSchema.parse(JSON.parse(JSON.stringify(state)) as unknown);
  return { state, summary: summarizeFirstHour(state, startMinute) };
}
