import { advanceClock } from '../clock/clock';
import { addPauseToken, removePauseToken } from '../clock/pause';
import { sleepEnergyRestore, sleepTargetMinute } from '../clock/sleep';
import { applyFactionDelta } from '../factions/faction';
import { PROTOTYPE_ECONOMY_POLICY, validateQuestReward } from '../economy/economy';
import type { DomainEvent } from '../events/types';
import {
  cancelInvitation,
  completeLocalInvitation,
  planHomeInvitation,
  replanInvitationForTransfer,
} from '../invitations/planner';
import { socialPurchase } from '../quests/purchases';
import { upsertJournalEntry } from '../quests/journal';
import { applyRelationshipDelta, requestRelationshipStage, resolveChangeableRejections } from '../relationships/relationship';
import { EVENT_HISTORY_LIMIT, type WorldState } from '../state/schema';
import { DomainCommandSchema, type DomainCommand } from './types';
import { simulateWorldInterval } from '../../world/schedules/simulation';
import { advancePoliceAttention } from '../consequences/police';
import {
  LINDA_QUEST,
  planLindaQuestOutcome,
  planLindaQuestStart,
  planLindaVillaDiscovery,
} from '../quests/quest-machine';
import { validateAppliedMissionOutcome } from '../verbal-missions/commands';
import {
  automaticCommitmentCommand,
  dueCommitmentIds,
  planCommitmentResolution,
} from '../verbal-missions/commitments';
import {
  LINDA_PURSE_MISSION_ID,
  PRIYA_ASSESSMENT_MISSION_ID,
  TOMAS_FERRY_MISSION_ID,
  authoredPlayerKnowledgeRecord,
  planFactDisclosure,
  planOfferVerbalMission,
  planRecordPlayerKnowledge,
  planScheduledCommitment,
  planUniqueObjectPurchase,
  planWithdrawVerbalMission,
} from '../verbal-missions/goal-planners';

export type CommandResult = Readonly<{
  state: WorldState;
  event?: DomainEvent;
  duplicate: boolean;
}>;

function commitEvent(state: WorldState, event: DomainEvent, patch: Partial<WorldState>): CommandResult {
  const candidate: WorldState = { ...state, ...patch };
  const questFlagIds = allQuestFlagIds(candidate);
  const relationships = Object.fromEntries(Object.entries(candidate.relationships).map(([npcId, relationship]) => [
    npcId,
    {
      ...relationship,
      rejections: resolveChangeableRejections(
        relationship.rejections,
        new Set([...questFlagIds, ...(candidate.npcs[npcId]?.unlockedIds ?? [])]),
      ),
    },
  ]));
  const nextState: WorldState = {
    ...candidate,
    relationships,
    revision: state.revision + 1,
    eventReceipts: [...state.eventReceipts, event.eventId],
    eventLedger: [...state.eventLedger, event].slice(-EVENT_HISTORY_LIMIT),
  };
  return { state: nextState, event, duplicate: false };
}

function eventBase(state: WorldState, command: DomainCommand, absoluteMinute: number) {
  return {
    eventId: command.eventId,
    commandId: command.commandId,
    sequence: (state.eventLedger.at(-1)?.sequence ?? -1) + 1,
    absoluteMinute,
  } as const;
}

function allQuestFlagIds(state: WorldState): Set<string> {
  return new Set(Object.values(state.quests).flatMap(({ flagIds }) => flagIds));
}

function socialFlagIds(state: WorldState, npcId: string): Set<string> {
  return new Set([...allQuestFlagIds(state), ...(state.npcs[npcId]?.unlockedIds ?? [])]);
}

function latestEvent(state: WorldState, predicate: (event: DomainEvent) => boolean): DomainEvent | undefined {
  for (let index = state.eventLedger.length - 1; index >= 0; index -= 1) {
    const event = state.eventLedger[index];
    if (event && predicate(event)) return event;
  }
  return undefined;
}

function duplicateResult(state: WorldState, event?: DomainEvent): CommandResult {
  return { state, ...(event ? { event } : {}), duplicate: true };
}

function settleDueCommitments(result: CommandResult): CommandResult {
  let settled = result.state;
  for (const commitmentId of dueCommitmentIds(settled)) {
    settled = reduceCommand(
      settled,
      automaticCommitmentCommand(commitmentId, settled.clock.absoluteMinute),
    ).state;
  }
  return { ...result, state: settled };
}

function offerMissions(result: CommandResult, missionIds: readonly string[]): CommandResult {
  let offered = result.state;
  for (const missionId of missionIds) {
    if (offered.verbalMissions[missionId]) continue;
    const missionSlug = missionId.replaceAll('_', '-');
    try {
      offered = reduceCommand(offered, DomainCommandSchema.parse({
        type: 'offer-verbal-mission',
        commandId: `command-auto-offer-${missionSlug}-r${offered.revision}`,
        eventId: `event-auto-offer-${missionSlug}-r${offered.revision}`,
        scheduledMinute: offered.clock.absoluteMinute,
        priority: 60,
        missionId,
      })).state;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('is not available')) throw error;
    }
  }
  return { ...result, state: offered };
}

function recordInjuredEscapeEvidence(result: CommandResult): CommandResult {
  if (result.event?.type !== 'linda-quest-resolved' || result.event.resultId !== 'injured_escape') return result;
  const record = authoredPlayerKnowledgeRecord('priya_injury_transport_evidence');
  const recorded = reduceCommand(result.state, DomainCommandSchema.parse({
    type: 'record-player-knowledge',
    commandId: `command-injured-escape-evidence-r${result.state.revision}`,
    eventId: `event-injured-escape-evidence-r${result.state.revision}`,
    scheduledMinute: result.state.clock.absoluteMinute,
    priority: 65,
    record,
  }));
  return { ...result, state: recorded.state };
}

export function resolveDueCommitments(state: WorldState): WorldState {
  return settleDueCommitments({ state, duplicate: false }).state;
}

export function reduceCommand(state: WorldState, candidate: DomainCommand): CommandResult {
  const command = DomainCommandSchema.parse(candidate);
  if (state.eventReceipts.includes(command.eventId)) {
    return duplicateResult(state);
  }

  switch (command.type) {
    case 'advance-clock': {
      const result = advanceClock(state.clock, command.realMilliseconds);
      const event: DomainEvent = {
        ...eventBase(state, command, result.clock.absoluteMinute),
        type: 'clock-advanced',
        fromMinute: state.clock.absoluteMinute,
        toMinute: result.clock.absoluteMinute,
        consumedRealMilliseconds: command.realMilliseconds,
      };
      return settleDueCommitments(commitEvent(state, event, { clock: result.clock }));
    }
    case 'add-pause-token': {
      const result = addPauseToken(state.clock, command.token);
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'pause-token-added',
        token: command.token,
        changed: result.changed,
      };
      return commitEvent(state, event, { clock: result.clock });
    }
    case 'remove-pause-token': {
      const result = removePauseToken(state.clock, command.token);
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'pause-token-removed',
        token: command.token,
        changed: result.changed,
      };
      return commitEvent(state, event, { clock: result.clock });
    }
    case 'apply-relationship-delta': {
      const relationship = state.relationships[command.npcId];
      if (!relationship) throw new Error(`Unknown relationship NPC: ${command.npcId}`);
      const result = applyRelationshipDelta(relationship.values, command.delta, command.source);
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'relationship-changed',
        npcId: command.npcId,
        familiarityDelta: result.appliedDelta.familiarity,
        trustDelta: result.appliedDelta.trust,
        attractionDelta: result.appliedDelta.attraction,
        reason: command.reason,
      };
      return commitEvent(state, event, {
        relationships: {
          ...state.relationships,
          [command.npcId]: { ...relationship, values: result.values },
        },
      });
    }
    case 'apply-faction-delta': {
      const faction = state.factions[command.factionId];
      if (!faction) throw new Error(`Unknown faction: ${command.factionId}`);
      const result = applyFactionDelta(faction.standing, command.delta, command.scale);
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'faction-standing-changed',
        factionId: command.factionId,
        delta: result.appliedDelta,
        reason: command.reason,
      };
      return commitEvent(state, event, {
        factions: {
          ...state.factions,
          [command.factionId]: { ...faction, standing: result.standing },
        },
      });
    }
    case 'request-relationship-stage': {
      const relationship = state.relationships[command.npcId];
      if (!relationship) throw new Error(`Unknown relationship NPC: ${command.npcId}`);
      const decision = requestRelationshipStage(
        relationship,
        command.targetStage,
        command.actionId,
        socialFlagIds(state, command.npcId),
        command.authoredEvent,
      );
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'relationship-stage-requested',
        npcId: command.npcId,
        fromStage: relationship.stage,
        targetStage: command.targetStage,
        accepted: decision.accepted,
        reasonId: decision.reasonId,
      };
      return commitEvent(state, event, {
        relationships: { ...state.relationships, [command.npcId]: decision.relationship },
      });
    }
    case 'respond-home-invitation': {
      const plan = planHomeInvitation(state, command.request);
      const transfers = { ...state.transfers };
      if (plan.transfer) transfers[plan.transfer.id] = plan.transfer;
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'home-invitation-responded',
        invitationId: plan.invitation.id,
        npcId: plan.invitation.npcId,
        outcome: plan.invitation.status as 'accepted' | 'rejected' | 'countered' | 'replan_required',
        reasonId: plan.invitation.responseReasonId,
        changed: plan.changed,
        ...(plan.invitation.transferId ? { transferId: plan.invitation.transferId } : {}),
      };
      return commitEvent(state, event, {
        invitations: { ...state.invitations, [plan.invitation.id]: plan.invitation },
        relationships: { ...state.relationships, [plan.relationship.npcId]: plan.relationship },
        npcs: { ...state.npcs, [plan.npc.id]: plan.npc },
        transfers,
      });
    }
    case 'cancel-home-invitation': {
      const current = state.invitations[command.invitationId];
      if (!current) throw new Error(`Unknown invitation: ${command.invitationId}`);
      if (current.status === 'cancelled') {
        const event: DomainEvent = {
          ...eventBase(state, command, state.clock.absoluteMinute),
          type: 'home-invitation-cancelled', invitationId: current.id, reasonId: command.reasonId, changed: false,
        };
        return commitEvent(state, event, {});
      }
      const cancelled = cancelInvitation(current, command.reasonId);
      const transfers = { ...state.transfers };
      const reservedTransfer = current.transferId ? transfers[current.transferId] : undefined;
      if (reservedTransfer?.status === 'in_transit') {
        throw new Error('An invitation cannot be cancelled after its visitor has departed.');
      }
      if (current.transferId) delete transfers[current.transferId];
      const npc = state.npcs[current.npcId];
      const nextNpc = npc?.scheduleGoal?.sourceInvitationId === current.id ||
        (reservedTransfer?.status === 'approaching_exit' && npc?.scheduleGoal?.activityId === 'travel')
        ? { ...npc, scheduleGoal: undefined }
        : npc;
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'home-invitation-cancelled', invitationId: current.id, reasonId: command.reasonId, changed: true,
      };
      return commitEvent(state, event, {
        invitations: { ...state.invitations, [current.id]: cancelled },
        transfers,
        ...(nextNpc ? { npcs: { ...state.npcs, [nextNpc.id]: nextNpc } } : {}),
      });
    }
    case 'reveal-faction': {
      const faction = state.factions[command.factionId];
      if (!faction) throw new Error(`Unknown faction: ${command.factionId}`);
      if (!allQuestFlagIds(state).has(command.discoveryFlagId)) {
        throw new Error('Faction discovery requires its authoritative quest flag.');
      }
      const changed = !faction.revealed;
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'faction-revealed', factionId: faction.id, discoveryFlagId: command.discoveryFlagId,
        sourceType: command.sourceType, sourceId: command.sourceId, changed,
      };
      return commitEvent(state, event, {
        factions: { ...state.factions, [faction.id]: { ...faction, revealed: true } },
      });
    }
    case 'upsert-journal-entry': {
      if (command.entry.subject.kind !== 'quest') {
        throw new Error('Verbal Mission journal entries require their mission command.');
      }
      const questId = command.entry.subject.questId;
      const quest = state.quests[questId];
      if (!quest) throw new Error(`Unknown journal quest: ${questId}`);
      const current = state.journal[command.entry.id];
      const entry = upsertJournalEntry(current, command.entry);
      const changed = JSON.stringify(current) !== JSON.stringify(entry);
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'journal-entry-upserted', entryId: entry.id, questId,
        locationPrecision: entry.locationPrecision, markerVisible: entry.markerVisible, changed,
      };
      return commitEvent(state, event, { journal: { ...state.journal, [entry.id]: entry } });
    }
    case 'purchase-social-option': {
      const offer = socialPurchase(command.offerId);
      const quest = state.quests[offer.questId];
      if (!quest) throw new Error(`Unknown purchase quest: ${offer.questId}`);
      const alreadyPurchased = quest.flagIds.includes(offer.grantedQuestFlagId);
      if (!alreadyPurchased && state.inventory.money < offer.cost) throw new Error('Not enough money for this social option.');
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'social-option-purchased', offerId: offer.id, questId: offer.questId,
        grantedQuestFlagId: offer.grantedQuestFlagId, amount: alreadyPurchased ? 0 : offer.cost,
        changed: !alreadyPurchased,
      };
      return commitEvent(state, event, alreadyPurchased ? {} : {
        inventory: { ...state.inventory, money: state.inventory.money - offer.cost },
        quests: {
          ...state.quests,
          [quest.id]: { ...quest, flagIds: [...quest.flagIds, offer.grantedQuestFlagId].sort() },
        },
      });
    }
    case 'start-linda-quest': {
      const plan = planLindaQuestStart(state, command.requestNpcId);
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'linda-quest-started',
        questId: LINDA_QUEST.id,
        requestNpcId: LINDA_QUEST.requestNpcId,
        journalEntryId: plan.journalEntryId,
        reason: plan.reason,
        grantedItemId: plan.grantedItemId,
        grantedItemCount: plan.grantedItemCount,
      };
      return commitEvent(state, event, plan.state);
    }
    case 'discover-linda-villa': {
      const plan = planLindaVillaDiscovery(state);
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'linda-villa-discovered',
        questId: LINDA_QUEST.id,
        journalEntryId: plan.journalEntryId,
        changed: plan.changed,
      };
      return commitEvent(state, event, plan.state);
    }
    case 'resolve-linda-quest': {
      const plan = planLindaQuestOutcome(state, command.approachId);
      const event: DomainEvent = {
        ...eventBase(state, command, plan.state.clock.absoluteMinute),
        type: 'linda-quest-resolved',
        questId: LINDA_QUEST.id,
        approachId: plan.approachId,
        resultId: plan.resultId,
        terminalStatus: plan.terminalStatus,
        reason: plan.reason,
        familiarityDelta: plan.relationshipDelta.familiarity,
        trustDelta: plan.relationshipDelta.trust,
        attractionDelta: plan.relationshipDelta.attraction,
        ...(plan.factionId ? { factionId: plan.factionId } : {}),
        factionDelta: plan.factionDelta,
        rewardAmount: plan.rewardAmount,
        healthDelta: plan.healthDelta,
        timeDeltaMinutes: plan.timeDeltaMinutes,
        ...(plan.evidenceId ? { evidenceId: plan.evidenceId } : {}),
        witnessNpcIds: [...plan.witnessNpcIds],
        policeFrom: plan.policeFrom,
        policeTo: plan.policeTo,
      };
      return offerMissions(
        recordInjuredEscapeEvidence(settleDueCommitments(commitEvent(state, event, plan.state))),
        [LINDA_PURSE_MISSION_ID, PRIYA_ASSESSMENT_MISSION_ID],
      );
    }
    case 'advance-police-attention': {
      const evidence = state.evidence[command.evidenceId];
      if (!evidence || evidence.witnessNpcIds.length === 0 || !['noticed', 'linked'].includes(evidence.status)) {
        throw new Error('Police escalation requires witnessed unresolved evidence.');
      }
      const from = state.policeAttention;
      if (!['noticed', 'questioned', 'wanted'].includes(from)) {
        throw new Error(`Police attention ${from} cannot use an escalation hook.`);
      }
      const to = advancePoliceAttention(from, command.hook);
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'police-attention-advanced',
        evidenceId: evidence.id,
        hook: command.hook,
        from: from as 'noticed' | 'questioned' | 'wanted',
        to,
      };
      return commitEvent(state, event, {
        policeAttention: to,
        evidence: {
          ...state.evidence,
          [evidence.id]: { ...evidence, status: 'linked' },
        },
      });
    }
    case 'move-protagonist': {
      const from = state.protagonist.worldPosition;
      const deltaX = Math.abs(command.tileX - from.tileX);
      const deltaY = Math.abs(command.tileY - from.tileY);
      if (
        command.mapId !== from.mapId ||
        Math.max(deltaX, deltaY) !== 1
      ) {
        throw new Error('Local protagonist movement must be one adjacent tile on the current map.');
      }
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'protagonist-moved',
        mapId: command.mapId,
        locationId: command.locationId,
        fromTileX: from.tileX,
        fromTileY: from.tileY,
        toTileX: command.tileX,
        toTileY: command.tileY,
      };
      return commitEvent(state, event, {
        protagonist: {
          ...state.protagonist,
          locationId: command.locationId,
          worldPosition: { mapId: command.mapId, tileX: command.tileX, tileY: command.tileY },
        },
      });
    }
    case 'set-simulation-speed': {
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'simulation-speed-changed',
        fromSpeed: state.clock.selectedSpeed,
        toSpeed: command.speed,
      };
      return commitEvent(state, event, { clock: { ...state.clock, selectedSpeed: command.speed } });
    }
    case 'advance-simulation': {
      const advanced = advanceClock(state.clock, command.realMilliseconds);
      const simulation = simulateWorldInterval({
        state,
        toAbsoluteMinute: advanced.clock.absoluteMinute,
        toSubMinuteMilliseconds: advanced.clock.subMinuteMilliseconds,
        awake: true,
        frameMovement: advanced.advancedMinutes <= 2,
      });
      const event: DomainEvent = {
        ...eventBase(state, command, simulation.state.clock.absoluteMinute),
        type: 'simulation-advanced',
        fromMinute: state.clock.absoluteMinute,
        toMinute: simulation.state.clock.absoluteMinute,
        consumedRealMilliseconds: command.realMilliseconds,
        milestoneIds: [...simulation.milestoneIds],
        energyDelta: simulation.energyDelta,
        moneyDelta: simulation.moneyDelta,
      };
      return settleDueCommitments(commitEvent(state, event, simulation.state));
    }
    case 'sleep-protagonist': {
      if (state.clock.pauseTokens.length > 0) throw new Error('Sleep requires a stable unpaused world.');
      const toMinute = sleepTargetMinute(state.clock.absoluteMinute, command.mode);
      const simulation = simulateWorldInterval({
        state,
        toAbsoluteMinute: toMinute,
        toSubMinuteMilliseconds: 0,
        awake: false,
        frameMovement: false,
      });
      const restore = sleepEnergyRestore(command.mode);
      const nextEnergy = Math.min(100, simulation.state.protagonist.energy + restore);
      const energyDelta = nextEnergy - state.protagonist.energy;
      const event: DomainEvent = {
        ...eventBase(state, command, toMinute),
        type: 'sleep-completed',
        mode: command.mode,
        fromMinute: state.clock.absoluteMinute,
        toMinute,
        energyDelta,
        milestoneIds: [...simulation.milestoneIds],
      };
      return settleDueCommitments(commitEvent(state, event, {
        ...simulation.state,
        protagonist: { ...simulation.state.protagonist, energy: nextEnergy },
      }));
    }
    case 'dev-jump-to-minute': {
      // Dev tool. `awake: false` is a cheat on purpose: a developer inspecting the map at 03:00
      // should not pay the energy a real night awake would cost. The resulting state is therefore
      // not one normal play can reach. Everything else settles exactly as it would in play.
      if (state.clock.pauseTokens.length > 0) throw new Error('Time jump requires a stable unpaused world.');
      if (command.toMinute <= state.clock.absoluteMinute) throw new Error('Time jump target must be in the future.');
      const simulation = simulateWorldInterval({
        state,
        toAbsoluteMinute: command.toMinute,
        toSubMinuteMilliseconds: 0,
        awake: false,
        frameMovement: false,
      });
      const event: DomainEvent = {
        ...eventBase(state, command, command.toMinute),
        type: 'dev-time-jumped',
        fromMinute: state.clock.absoluteMinute,
        toMinute: command.toMinute,
        milestoneIds: [...simulation.milestoneIds],
      };
      return settleDueCommitments(commitEvent(state, event, simulation.state));
    }
    case 'apply-quest-reward': {
      const amount = validateQuestReward(command.rewardKind, command.amount);
      const money = state.inventory.money + amount;
      if (!Number.isSafeInteger(money)) throw new RangeError('Quest reward exceeds the safe money range.');
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'quest-reward-applied',
        rewardKind: command.rewardKind,
        amount,
        questId: command.questId,
      };
      return commitEvent(state, event, { inventory: { ...state.inventory, money } });
    }
    case 'move-npc': {
      const npc = state.npcs[command.npcId];
      if (!npc || npc.presence.kind !== 'active_local' || npc.presence.mapId !== command.mapId) {
        throw new Error('Only an active local NPC can move on its owned map.');
      }
      const deltaX = Math.abs(command.tileX - npc.presence.tileX);
      const deltaY = Math.abs(command.tileY - npc.presence.tileY);
      if (Math.max(deltaX, deltaY) !== 1) {
        throw new Error('Local NPC movement must be one adjacent tile.');
      }
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'npc-moved',
        npcId: npc.id,
        mapId: command.mapId,
        fromTileX: npc.presence.tileX,
        fromTileY: npc.presence.tileY,
        toTileX: command.tileX,
        toTileY: command.tileY,
      };
      return commitEvent(state, event, {
        npcs: {
          ...state.npcs,
          [npc.id]: { ...npc, presence: { ...npc.presence, tileX: command.tileX, tileY: command.tileY } },
        },
      });
    }
    case 'complete-npc-goal': {
      const npc = state.npcs[command.npcId];
      const goal = npc?.scheduleGoal;
      if (
        !npc || !goal || npc.presence.kind !== 'active_local' ||
        npc.presence.mapId !== goal.mapId || npc.presence.tileX !== goal.tileX || npc.presence.tileY !== goal.tileY
      ) {
        throw new Error('NPC goal completion requires the NPC at the exact goal tile.');
      }
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'npc-goal-completed',
        npcId: npc.id,
        activityId: goal.activityId,
        locationId: goal.locationId,
      };
      const nextNpc = { ...npc, presence: { ...npc.presence, locationId: goal.locationId } };
      delete nextNpc.scheduleGoal;
      const transfers = Object.fromEntries(Object.entries(state.transfers).filter(([, transfer]) => (
        transfer.npcId !== npc.id || transfer.status !== 'approaching_exit'
      )));
      const removedTransfer = Object.values(state.transfers).find((transfer) => (
        transfer.npcId === npc.id && transfer.status === 'approaching_exit'
      ));
      const invitationOwnedTransfer = removedTransfer && goal.sourceInvitationId
        ? state.invitations[goal.sourceInvitationId]?.transferId === removedTransfer.id
        : false;
      if (goal.activityId === 'travel' && invitationOwnedTransfer) {
        throw new Error('Invitation travel must complete through depart-npc-transfer.');
      }
      let invitations = removedTransfer
        ? replanInvitationForTransfer(
          state.invitations,
          removedTransfer.id,
          'travel_goal_replaced',
          'The visitor could not reach the reserved exit. Choose another time.',
        )
        : state.invitations;
      if (goal.sourceInvitationId) {
        invitations = completeLocalInvitation(invitations, goal.sourceInvitationId);
      }
      return commitEvent(state, event, { npcs: { ...state.npcs, [npc.id]: nextNpc }, transfers, invitations });
    }
    case 'depart-npc-transfer': {
      const npc = state.npcs[command.npcId];
      const transfer = state.transfers[command.transferId];
      if (
        !npc || !transfer || transfer.npcId !== npc.id || transfer.status !== 'approaching_exit' ||
        npc.presence.kind !== 'active_local' || !npc.scheduleGoal || npc.scheduleGoal.activityId !== 'travel' ||
        npc.presence.tileX !== npc.scheduleGoal.tileX || npc.presence.tileY !== npc.scheduleGoal.tileY
      ) {
        throw new Error('NPC transfer departure requires its approaching NPC at the exit.');
      }
      const departureMinute = state.clock.absoluteMinute;
      const invitation = Object.values(state.invitations).find(({ transferId }) => transferId === transfer.id);
      const arrivalMinute = invitation && transfer.arrivalMinute > departureMinute
        ? transfer.arrivalMinute
        : departureMinute + PROTOTYPE_ECONOMY_POLICY.npcTravelMinutes;
      const event: DomainEvent = {
        ...eventBase(state, command, departureMinute),
        type: 'npc-transfer-departed',
        npcId: npc.id,
        transferId: transfer.id,
        originMapId: transfer.originMapId,
        destinationMapId: transfer.destinationMapId,
        arrivalMinute,
      };
      return commitEvent(state, event, {
        npcs: { ...state.npcs, [npc.id]: { ...npc, presence: { kind: 'in_transit', transferId: transfer.id } } },
        transfers: {
          ...state.transfers,
          [transfer.id]: { ...transfer, status: 'in_transit', departureMinute, arrivalMinute },
        },
      });
    }
    case 'transition-protagonist': {
      const position = state.protagonist.worldPosition;
      if (
        position.mapId !== command.originMapId ||
        !state.maps[command.destinationMapId] ||
        !state.maps[command.originMapId]?.active
      ) {
        throw new Error('Protagonist transition does not match the active source map.');
      }
      const npcs = structuredClone(state.npcs);
      const transfers = structuredClone(state.transfers);
      for (const transfer of Object.values(transfers)) {
        if (transfer.status === 'approaching_exit' && transfer.originMapId === command.originMapId) {
          const npc = npcs[transfer.npcId];
          if (!npc) throw new Error(`Transition lost approaching NPC ${transfer.npcId}.`);
          transfer.status = 'in_transit';
          transfer.departureMinute = state.clock.absoluteMinute;
          const invitation = Object.values(state.invitations).find(({ transferId }) => transferId === transfer.id);
          if (!invitation || transfer.arrivalMinute <= state.clock.absoluteMinute) {
            transfer.arrivalMinute = state.clock.absoluteMinute + PROTOTYPE_ECONOMY_POLICY.npcTravelMinutes;
          }
          npc.presence = { kind: 'in_transit', transferId: transfer.id };
        }
      }
      for (const npc of Object.values(npcs)) {
        if (npc.presence.kind === 'active_local' && npc.presence.mapId === command.originMapId) {
          npc.presence = { ...npc.presence, kind: 'inactive' };
        } else if (npc.presence.kind === 'inactive' && npc.presence.mapId === command.destinationMapId) {
          npc.presence = { ...npc.presence, kind: 'active_local' };
        }
      }
      const maps = Object.fromEntries(Object.entries(state.maps).map(([id, map]) => [id, {
        ...map,
        active: id === command.destinationMapId,
        discoveredEntranceIds: id === command.destinationMapId
          ? [...new Set([...map.discoveredEntranceIds, command.destinationEntranceId])]
          : map.discoveredEntranceIds,
      }]));
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'protagonist-transitioned',
        originMapId: command.originMapId,
        destinationMapId: command.destinationMapId,
        sourcePortalId: command.sourcePortalId,
        destinationEntranceId: command.destinationEntranceId,
        tileX: command.tileX,
        tileY: command.tileY,
      };
      const result = commitEvent(state, event, {
        protagonist: {
          ...state.protagonist,
          locationId: command.destinationMapId,
          worldPosition: { mapId: command.destinationMapId, tileX: command.tileX, tileY: command.tileY },
        },
        maps,
        npcs,
        transfers,
      });
      return command.destinationMapId === 'southeast_docks'
        ? offerMissions(result, [TOMAS_FERRY_MISSION_ID])
        : result;
    }
    case 'commit-conversation': {
      const npc = state.npcs[command.npcId];
      if (!npc || npc.tier !== 'full_ai') {
        throw new Error('Conversation persistence requires a full-AI NPC.');
      }
      const knowledge = [...npc.knowledge];
      for (const candidate of command.knowledge) {
        const duplicate = knowledge.some((record) => (
          record.factId === candidate.factId &&
          record.source.type === candidate.source.type &&
          record.source.sourceId === candidate.source.sourceId
        ));
        if (!duplicate) knowledge.push(candidate);
      }
      const unlockedInterestIds = [...new Set([...npc.unlockedInterestIds, ...command.unlockedInterestIds])].sort();
      const unlockedIds = [...new Set([...npc.unlockedIds, ...command.unlockedIds])].sort();
      const memories = [...npc.memories];
      for (const candidate of command.memories) {
        if (!memories.some((record) => record.subjectId === candidate.subjectId && record.summary === candidate.summary)) {
          memories.push({ ...candidate, eventId: command.eventId });
        }
      }
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'conversation-committed',
        conversationId: command.conversationId,
        npcId: command.npcId,
        knowledgeCount: knowledge.length - npc.knowledge.length,
        interestCount: unlockedInterestIds.length - npc.unlockedInterestIds.length,
        unlockCount: unlockedIds.length - npc.unlockedIds.length,
        memoryCount: memories.length - npc.memories.length,
      };
      return commitEvent(state, event, {
        npcs: {
          ...state.npcs,
          [npc.id]: { ...npc, knowledge, unlockedInterestIds, unlockedIds, memories },
        },
      });
    }
    case 'offer-verbal-mission': {
      const plan = planOfferVerbalMission(state, command.missionId);
      if (!plan.changed) {
        return duplicateResult(state, latestEvent(state, (event) => (
          event.type === 'verbal-mission-offered' && event.missionId === command.missionId
        )));
      }
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'verbal-mission-offered',
        missionId: plan.mission.missionId,
        npcId: plan.mission.npcId,
        journalEntryId: plan.journalEntryId,
      };
      return commitEvent(state, event, plan.state);
    }
    case 'apply-verbal-mission-outcome': {
      const prior = latestEvent(state, (event) => (
        event.type === 'verbal-mission-outcome-applied' && event.outcomeId === command.outcomeId
      ));
      if (prior) {
        if (prior.type !== 'verbal-mission-outcome-applied' || prior.missionId !== command.expectedMission.missionId) {
          throw new Error(`Outcome ID ${command.outcomeId} belongs to another Verbal Mission.`);
        }
        return duplicateResult(state, prior);
      }
      const current = state.verbalMissions[command.expectedMission.missionId];
      if (!current || JSON.stringify(current) !== JSON.stringify(command.expectedMission)) {
        throw new Error('Verbal Mission outcome expected state is stale.');
      }
      const next = validateAppliedMissionOutcome(current, command.nextMission);
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'verbal-mission-outcome-applied',
        missionId: next.missionId,
        outcomeId: command.outcomeId,
        outcome: command.outcome,
        reactionId: command.reactionId,
        fromStatus: current.status as 'available' | 'active',
        toStatus: 'active',
      };
      return commitEvent(state, event, {
        verbalMissions: { ...state.verbalMissions, [next.missionId]: next },
      });
    }
    case 'withdraw-verbal-mission': {
      const plan = planWithdrawVerbalMission(state, command.missionId);
      if (!plan.changed) {
        return duplicateResult(state, latestEvent(state, (event) => (
          event.type === 'verbal-mission-withdrawn' && event.missionId === command.missionId
        )));
      }
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'verbal-mission-withdrawn',
        missionId: command.missionId,
        resultId: plan.resultId,
        journalReceiptId: plan.journalReceiptId,
      };
      return commitEvent(state, event, plan.state);
    }
    case 'record-player-knowledge': {
      const plan = planRecordPlayerKnowledge(state, command.record);
      if (!plan.changed) {
        return duplicateResult(state, latestEvent(state, (event) => (
          event.type === 'player-knowledge-recorded' && event.factId === command.record.factId
        )));
      }
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'player-knowledge-recorded',
        factId: plan.record.factId,
        sourceId: plan.record.source.sourceId,
        changed: true,
      };
      return commitEvent(state, event, plan.state);
    }
    case 'record-fact-disclosure': {
      const plan = planFactDisclosure(state, command.missionId);
      if (!plan.changed) {
        return duplicateResult(state, latestEvent(state, (event) => (
          event.type === 'fact-disclosure-recorded' && event.missionId === command.missionId
        )));
      }
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'fact-disclosure-recorded',
        missionId: command.missionId,
        factId: plan.factId,
        resultId: plan.resultId,
        journalReceiptId: plan.journalReceiptId,
        familiarityDelta: plan.relationshipDelta.familiarity,
        trustDelta: plan.relationshipDelta.trust,
        attractionDelta: plan.relationshipDelta.attraction,
      };
      return commitEvent(state, event, plan.state);
    }
    case 'purchase-unique-object': {
      const purchaseMission = state.verbalMissions[command.missionId];
      const objectId = purchaseMission?.goalKind === 'buy_object'
        ? purchaseMission.terms.objectId
        : undefined;
      const plan = planUniqueObjectPurchase(state, command.missionId, command.confirmedAmount);
      if (!plan.changed) {
        return duplicateResult(state, latestEvent(state, (event) => (
          event.type === 'unique-object-purchased' && event.missionId === command.missionId
        )));
      }
      if (!objectId) throw new Error('Unique purchase lost its object.');
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'unique-object-purchased',
        missionId: command.missionId,
        objectId,
        amount: plan.amount,
        resultId: plan.resultId,
        journalReceiptId: plan.journalReceiptId,
        familiarityDelta: plan.relationshipDelta.familiarity,
        trustDelta: plan.relationshipDelta.trust,
        attractionDelta: plan.relationshipDelta.attraction,
      };
      return commitEvent(state, event, plan.state);
    }
    case 'create-scheduled-commitment': {
      const plan = planScheduledCommitment(
        state,
        command.missionId,
        command.commitmentId,
        command.commitmentMinute,
      );
      if (!plan.changed) {
        return duplicateResult(state, latestEvent(state, (event) => (
          event.type === 'scheduled-commitment-created' && event.commitmentId === command.commitmentId
        )));
      }
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'scheduled-commitment-created',
        missionId: command.missionId,
        commitmentId: plan.commitment.commitmentId,
        scheduledMinute: plan.commitment.scheduledMinute,
        journalReceiptId: plan.journalReceiptId,
        familiarityDelta: plan.relationshipDelta.familiarity,
        trustDelta: plan.relationshipDelta.trust,
        attractionDelta: plan.relationshipDelta.attraction,
      };
      return commitEvent(state, event, plan.state);
    }
    case 'resolve-scheduled-commitment': {
      const current = state.commitments[command.commitmentId];
      if (!current) throw new Error(`Unknown commitment: ${command.commitmentId}`);
      if (current.status === 'honoured' || current.status === 'reneged') {
        return duplicateResult(state, latestEvent(state, (event) => (
          event.type === 'scheduled-commitment-resolved' &&
          event.commitmentId === command.commitmentId && event.result === current.status
        )));
      }
      const plan = planCommitmentResolution(state, command.commitmentId);
      if (!plan.changed) {
        return duplicateResult(state, latestEvent(state, (event) => (
          event.type === 'scheduled-commitment-resolved' && event.commitmentId === command.commitmentId
        )));
      }
      const event: DomainEvent = {
        ...eventBase(state, command, state.clock.absoluteMinute),
        type: 'scheduled-commitment-resolved',
        missionId: plan.commitment.missionId,
        commitmentId: plan.commitment.commitmentId,
        result: plan.result,
        ...(plan.reasonId ? { reasonId: plan.reasonId } : {}),
        ...('scheduledMinute' in plan.commitment ? { scheduledMinute: plan.commitment.scheduledMinute } : {}),
        journalReceiptId: plan.journalReceiptId,
        familiarityDelta: plan.relationshipDelta.familiarity,
        trustDelta: plan.relationshipDelta.trust,
        attractionDelta: plan.relationshipDelta.attraction,
      };
      return commitEvent(state, event, plan.state);
    }
  }
}
