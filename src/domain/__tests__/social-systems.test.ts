import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateFactionAccess } from '../factions/faction';
import { reduceCommand } from '../commands/reducer';
import { DomainCommandSchema } from '../commands/types';
import { createInitialState } from '../state/initial-state';
import { GENERATED_LAYOUT } from '../state/generated-layout';
import { WorldStateSchema, type WorldState } from '../state/schema';
import { simulateWorldInterval } from '../../world/schedules/simulation';
import { cancelInvitation } from '../invitations/planner';
import { InvitationStateSchema } from '../invitations/schema';

const fixture = JSON.parse(readFileSync(resolve('tests/fixtures/social/phase-10.json'), 'utf8')) as {
  vagueLead: Record<string, unknown>;
  exactLead: Record<string, unknown>;
  invitation: { acceptedMinute: number; conflictMinute: number; durationMinutes: number };
};

function command(state: WorldState, type: string, body: Record<string, unknown>, suffix: string) {
  return DomainCommandSchema.parse({
    type,
    commandId: `command-social-${suffix}`,
    eventId: `event-social-${suffix}`,
    scheduledMinute: state.clock.absoluteMinute,
    priority: 50,
    ...body,
  });
}

function resolvedLindaState(): WorldState {
  const state = createInitialState();
  return WorldStateSchema.parse({
    ...state,
    npcs: {
      ...state.npcs,
      linda: { ...state.npcs.linda, unlockedIds: ['cats_common_interest', 'linda_relationship_resolved'] },
    },
    relationships: {
      ...state.relationships,
      linda: {
        ...state.relationships.linda,
        values: { familiarity: 40, trust: 35, attraction: 30 },
        stage: 'acquaintance',
      },
    },
  });
}

describe('Phase 10 social systems', () => {
  test('a replan-required invitation can be cancelled without a scheduled minute', () => {
    const invitation = InvitationStateSchema.parse({
      id: 'invitation_replan_cancel', npcId: 'linda', sourceConversationId: 'conversation_replan_cancel',
      actionId: 'invite_home', destinationLocationId: 'protagonist_villa', destinationMapId: 'northwest_residential',
      proposedMinute: 900, durationMinutes: 120, status: 'replan_required', responseReasonId: 'travel_unavailable',
      feedback: 'Replan after arrival.',
    });
    expect(cancelInvitation(invitation, 'player_cancelled')).toEqual(expect.objectContaining({
      status: 'cancelled', scheduledMinute: 900,
    }));
  });

  test('relationship values change independently and one eligible next stage requires an authored action', () => {
    const initial = createInitialState();
    const changed = reduceCommand(initial, command(initial, 'apply-relationship-delta', {
      npcId: 'linda', delta: { familiarity: 3, trust: -2, attraction: 1 }, source: 'conversation',
      reason: 'Independent social signal fixture',
    }, 'independent-values')).state;
    expect(changed.relationships.linda?.values).toEqual({ familiarity: 8, trust: 0, attraction: 1 });

    const eligible = WorldStateSchema.parse({
      ...changed,
      relationships: {
        ...changed.relationships,
        linda: { ...changed.relationships.linda, values: { familiarity: 10, trust: 0, attraction: 1 } },
      },
    });
    const transitioned = reduceCommand(eligible, command(eligible, 'request-relationship-stage', {
      npcId: 'linda', targetStage: 'acquaintance', actionId: 'greet', authoredEvent: false,
    }, 'acquaintance'));
    expect(transitioned.event).toEqual(expect.objectContaining({ accepted: true, fromStage: 'stranger', targetStage: 'acquaintance' }));
    expect(transitioned.state.relationships.linda?.stage).toBe('acquaintance');
  });

  test('high values cannot bypass a circumstance, direct stage order, or a permanent boundary', () => {
    const high = WorldStateSchema.parse({
      ...createInitialState(),
      relationships: {
        ...createInitialState().relationships,
        linda: {
          ...createInitialState().relationships.linda,
          values: { familiarity: 100, trust: 100, attraction: 100 },
          stage: 'friend',
        },
      },
    });
    const circumstance = reduceCommand(high, command(high, 'request-relationship-stage', {
      npcId: 'linda', targetStage: 'dating', actionId: 'ask_date', authoredEvent: false,
    }, 'circumstance'));
    expect(circumstance.event).toEqual(expect.objectContaining({ accepted: false, reasonId: 'current_relationship' }));
    expect(circumstance.state.relationships.linda?.stage).toBe('friend');

    const boundary = reduceCommand(high, command(high, 'request-relationship-stage', {
      npcId: 'linda', targetStage: 'dating', actionId: 'aggressive_flirt', authoredEvent: false,
    }, 'boundary'));
    const repeated = reduceCommand(boundary.state, command(boundary.state, 'request-relationship-stage', {
      npcId: 'linda', targetStage: 'dating', actionId: 'aggressive_flirt', authoredEvent: false,
    }, 'boundary-repeat'));
    expect(repeated.event).toEqual(expect.objectContaining({ accepted: false, reasonId: 'no_aggressive_flirting' }));
    expect(repeated.state.relationships.linda?.rejections.filter(({ reasonId }) => reasonId === 'no_aggressive_flirting')).toHaveLength(1);
    expect(() => WorldStateSchema.parse({
      ...high,
      relationships: {
        ...high.relationships,
        linda: {
          ...high.relationships.linda,
          rejections: [{
            reasonId: 'missing_resolution_path', kind: 'changeable_circumstance', sourceActionId: 'ask_date', resolved: false,
          }],
        },
      },
    })).toThrow('resolving flag');
  });

  test('a resolving unlock immediately clears changeable rejection records', () => {
    const initial = createInitialState();
    const unlocked = reduceCommand(initial, command(initial, 'commit-conversation', {
      conversationId: 'conversation-resolution',
      npcId: 'linda',
      knowledge: [],
      unlockedInterestIds: [],
      unlockedIds: ['linda_relationship_resolved'],
      memories: [],
    }, 'resolve-rejections')).state;
    expect(unlocked.relationships.linda?.rejections.filter(({ kind }) => kind === 'changeable_circumstance')).toEqual([
      expect.objectContaining({ reasonId: 'current_relationship', resolved: true }),
      expect.objectContaining({ reasonId: 'home_visit_not_safe', resolved: true }),
    ]);
  });

  test('relationship, rejection, knowledge, belief, and major memory state survives JSON reload', () => {
    const state = createInitialState();
    const candidate = WorldStateSchema.parse({
      ...state,
      relationships: {
        ...state.relationships,
        linda: { ...state.relationships.linda, values: { familiarity: 22, trust: 7, attraction: 3 }, stage: 'acquaintance' },
      },
      npcs: {
        ...state.npcs,
        linda: {
          ...state.npcs.linda,
          knowledge: [{
            factId: 'protagonist_has_cat', assertedValue: true, epistemicState: 'held_belief', truthStatus: 'contradicted',
            source: { type: 'player_message', sourceId: 'turn_reload', evidenceText: 'I have a cat' },
          }],
          memories: [{ subjectId: 'linda_boyfriend', summary: 'Linda asked for careful help.', importancePermille: 900, eventId: 'event-major-memory' }],
        },
      },
    });
    const reloaded = WorldStateSchema.parse(JSON.parse(JSON.stringify(candidate)) as unknown);
    expect(reloaded.relationships.linda).toEqual(candidate.relationships.linda);
    expect(reloaded.npcs.linda?.knowledge).toEqual(candidate.npcs.linda?.knowledge);
    expect(reloaded.npcs.linda?.memories).toEqual(candidate.npcs.linda?.memories);
  });

  test('hidden faction access requires reveal, standing, and an authoritative quest flag', () => {
    const gate = { id: 'velvet_tide_back_room', factionId: 'velvet_tide', minimumStanding: 10, requiredQuestFlagIds: ['velvet_tide_lead'] };
    const initial = createInitialState();
    expect(evaluateFactionAccess(initial.factions.velvet_tide, gate, new Set())).toEqual({ allowed: false, reason: 'hidden' });
    expect(() => reduceCommand(initial, command(initial, 'reveal-faction', {
      factionId: 'velvet_tide', discoveryFlagId: 'velvet_tide_lead', sourceType: 'authored_event', sourceId: 'quest_outcome',
    }, 'reveal-without-flag'))).toThrow('authoritative quest flag');

    const flagged = WorldStateSchema.parse({
      ...initial,
      quests: { ...initial.quests, linda_boyfriend_check: { ...initial.quests.linda_boyfriend_check, flagIds: ['velvet_tide_lead'] } },
      factions: { ...initial.factions, velvet_tide: { ...initial.factions.velvet_tide, standing: 10 } },
    });
    const revealed = reduceCommand(flagged, command(flagged, 'reveal-faction', {
      factionId: 'velvet_tide', discoveryFlagId: 'velvet_tide_lead', sourceType: 'authored_event', sourceId: 'quest_outcome',
    }, 'reveal')).state;
    expect(evaluateFactionAccess(revealed.factions.velvet_tide, gate, new Set(['velvet_tide_lead']))).toEqual({ allowed: true, reason: 'allowed' });
  });

  test('journal progresses from vague text without a marker to exact validated location and reloads', () => {
    const initial = createInitialState();
    const vague = reduceCommand(initial, command(initial, 'upsert-journal-entry', { entry: fixture.vagueLead }, 'journal-vague')).state;
    expect(vague.journal.linda_villa_lead).toEqual(expect.objectContaining({ locationPrecision: 'vague', markerVisible: false }));
    const exact = reduceCommand(vague, command(vague, 'upsert-journal-entry', { entry: fixture.exactLead }, 'journal-exact')).state;
    expect(exact.journal.linda_villa_lead).toEqual(expect.objectContaining({ locationPrecision: 'exact', locationId: 'linda_villa', markerVisible: true }));
    expect(WorldStateSchema.parse(JSON.parse(JSON.stringify(exact))).journal.linda_villa_lead).toEqual(exact.journal.linda_villa_lead);
    expect(() => reduceCommand(initial, command(initial, 'upsert-journal-entry', {
      entry: { ...fixture.exactLead, source: { type: 'npc_report', sourceId: 'unverified_report' } },
    }, 'journal-overdisclosure'))).toThrow('authoritative non-report evidence');
  });

  test('optional social purchase grants one practical flag and charges exactly once', () => {
    const initial = createInitialState();
    const first = reduceCommand(initial, command(initial, 'purchase-social-option', { offerId: 'security_report' }, 'purchase'));
    expect(first.state.inventory.money).toBe(initial.inventory.money - 60);
    expect(first.state.quests.linda_boyfriend_check?.flagIds).toContain('security_report_purchased');
    const second = reduceCommand(first.state, command(first.state, 'purchase-social-option', { offerId: 'security_report' }, 'purchase-repeat'));
    expect(second.state.inventory.money).toBe(first.state.inventory.money);
    expect(second.event).toEqual(expect.objectContaining({ changed: false, amount: 0 }));
  });

  test('invitation can reject, counter, accept, reserve cross-map travel, and cancel without teleporting', () => {
    const initial = createInitialState();
    const rejected = reduceCommand(initial, command(initial, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_rejected', npcId: 'linda', sourceConversationId: 'conversation_rejected',
        proposedMinute: fixture.invitation.acceptedMinute, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-rejected'));
    expect(rejected.event).toEqual(expect.objectContaining({ outcome: 'rejected', reasonId: 'home_visit_not_safe' }));
    const repeatedRejected = reduceCommand(rejected.state, command(rejected.state, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_rejected_repeat', npcId: 'linda', sourceConversationId: 'conversation_rejected_repeat',
        proposedMinute: fixture.invitation.acceptedMinute, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-rejected-repeat'));
    expect(repeatedRejected.event).toEqual(expect.objectContaining({ outcome: 'rejected', changed: false }));
    expect(Object.keys(repeatedRejected.state.invitations)).toEqual(['invitation_rejected']);

    const ready = resolvedLindaState();
    const readyAfterRejection = WorldStateSchema.parse({
      ...ready,
      invitations: repeatedRejected.state.invitations,
    });
    const acceptedAfterResolution = reduceCommand(readyAfterRejection, command(readyAfterRejection, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_after_resolution', npcId: 'linda', sourceConversationId: 'conversation_after_resolution',
        proposedMinute: fixture.invitation.acceptedMinute, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-after-resolution'));
    expect(acceptedAfterResolution.event).toEqual(expect.objectContaining({ outcome: 'accepted', changed: true }));
    const countered = reduceCommand(ready, command(ready, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_countered', npcId: 'linda', sourceConversationId: 'conversation_countered',
        proposedMinute: fixture.invitation.conflictMinute, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-countered'));
    expect(countered.event).toEqual(expect.objectContaining({ outcome: 'countered', reasonId: 'schedule_conflict' }));
    expect(countered.state.invitations.invitation_countered?.counterProposedMinute).toBeGreaterThan(fixture.invitation.conflictMinute);
    const counterProposedMinute = countered.state.invitations.invitation_countered?.counterProposedMinute;
    if (counterProposedMinute === undefined) throw new Error('Counter proposal is missing.');
    const acceptedCounter = reduceCommand(countered.state, command(countered.state, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_counter_accepted', npcId: 'linda', sourceConversationId: 'conversation_counter_accepted',
        proposedMinute: counterProposedMinute, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-counter-accepted'));
    expect(acceptedCounter.event).toEqual(expect.objectContaining({ outcome: 'accepted', changed: true }));
    expect(acceptedCounter.state.invitations.invitation_countered?.status).toBe('countered');
    expect(acceptedCounter.state.invitations.invitation_counter_accepted?.status).toBe('accepted');

    const crossMap = WorldStateSchema.parse({
      ...ready,
      npcs: {
        ...ready.npcs,
        linda: {
          ...ready.npcs.linda,
          presence: { kind: 'active_local', mapId: 'southwest_commercial', locationId: 'southwest_commercial', tileX: 15, tileY: 16 },
        },
      },
    });
    const accepted = reduceCommand(crossMap, command(crossMap, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_accepted', npcId: 'linda', sourceConversationId: 'conversation_accepted',
        proposedMinute: fixture.invitation.acceptedMinute, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-accepted'));
    expect(accepted.event).toEqual(expect.objectContaining({ outcome: 'accepted' }));
    expect(accepted.state.npcs.linda?.presence).toEqual(crossMap.npcs.linda?.presence);
    expect(accepted.state.transfers).toEqual({});
    expect(accepted.state.invitations.invitation_accepted).toEqual(expect.objectContaining({ status: 'accepted' }));
    expect(accepted.state.invitations.invitation_accepted?.transferId).toBeUndefined();

    const repeated = reduceCommand(accepted.state, command(accepted.state, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_repeat', npcId: 'linda', sourceConversationId: 'conversation_repeat',
        proposedMinute: fixture.invitation.acceptedMinute, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-repeat'));
    expect(repeated.event).toEqual(expect.objectContaining({ changed: false }));
    expect(Object.keys(repeated.state.invitations)).toEqual(['invitation_accepted']);

    const cancelled = reduceCommand(accepted.state, command(accepted.state, 'cancel-home-invitation', {
      invitationId: 'invitation_accepted', reasonId: 'player_cancelled',
    }, 'invite-cancel'));
    expect(cancelled.state.invitations.invitation_accepted?.status).toBe('cancelled');
    expect(cancelled.state.transfers['transfer-invitation-invitation_accepted']).toBeUndefined();
  });

  test('reserved invitation travel starts only when due and completes the invitation on arrival', () => {
    const ready = resolvedLindaState();
    const crossMap = WorldStateSchema.parse({
      ...ready,
      clock: { ...ready.clock, absoluteMinute: 480 },
      npcs: {
        ...ready.npcs,
        linda: {
          ...ready.npcs.linda,
          presence: { kind: 'active_local', mapId: 'southwest_commercial', locationId: 'southwest_commercial', tileX: 15, tileY: 16 },
        },
      },
    });
    const accepted = reduceCommand(crossMap, command(crossMap, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_timed', npcId: 'linda', sourceConversationId: 'conversation_timed',
        proposedMinute: fixture.invitation.acceptedMinute, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-timed')).state;
    const beforeDeparture = simulateWorldInterval({
      state: accepted, toAbsoluteMinute: 569, toSubMinuteMilliseconds: 0, awake: true, frameMovement: false,
    }).state;
    expect(beforeDeparture.transfers['transfer-invitation-invitation_timed']).toBeUndefined();
    expect(beforeDeparture.npcs.linda?.presence).toEqual(crossMap.npcs.linda?.presence);

    const departed = simulateWorldInterval({
      state: beforeDeparture, toAbsoluteMinute: 570, toSubMinuteMilliseconds: 0, awake: true, frameMovement: false,
    }).state;
    expect(departed.transfers['transfer-invitation-invitation_timed']?.status).toBe('in_transit');
    expect(departed.transfers['transfer-invitation-invitation_timed']).toEqual(expect.objectContaining({
      destinationGoalTileX: GENERATED_LAYOUT.homeVisitTile.x,
      destinationGoalTileY: GENERATED_LAYOUT.homeVisitTile.y,
    }));
    expect(departed.npcs.linda?.presence).toEqual({ kind: 'in_transit', transferId: 'transfer-invitation-invitation_timed' });

    const arrived = simulateWorldInterval({
      state: departed, toAbsoluteMinute: 600, toSubMinuteMilliseconds: 0, awake: true, frameMovement: false,
    }).state;
    expect(arrived.transfers['transfer-invitation-invitation_timed']).toBeUndefined();
    expect(arrived.invitations.invitation_timed).toEqual(expect.objectContaining({ status: 'completed', transferId: undefined }));
  });

  test('an invitation owns an NPC when departure and a routine schedule start on the same minute', () => {
    const ready = resolvedLindaState();
    const accepted = reduceCommand(ready, command(ready, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_same_minute', npcId: 'linda', sourceConversationId: 'conversation_same_minute',
        proposedMinute: fixture.invitation.acceptedMinute, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-same-minute')).state;
    const collision = WorldStateSchema.parse({
      ...accepted,
      schedules: {
        ...accepted.schedules,
        linda_daily: {
          ...accepted.schedules.linda_daily,
          blocks: accepted.schedules.linda_daily!.blocks.map((block, index) => (
            index === 2 ? { ...block, startMinuteOfDay: 570 } : block
          )),
        },
      },
    });
    const beforeDeparture = simulateWorldInterval({
      state: collision, toAbsoluteMinute: 569, toSubMinuteMilliseconds: 0, awake: true, frameMovement: false,
    }).state;
    const departed = simulateWorldInterval({
      state: beforeDeparture, toAbsoluteMinute: 570, toSubMinuteMilliseconds: 0, awake: true, frameMovement: false,
    }).state;
    expect(departed.invitations.invitation_same_minute).toEqual(expect.objectContaining({
      status: 'accepted', preparedAtMinute: 570,
    }));
    expect(departed.npcs.linda?.presence).toEqual(beforeDeparture.npcs.linda?.presence);
    expect(departed.transfers).toEqual({});
  });

  test('invitation departure replaces an existing visible routine transfer for the same NPC', () => {
    const ready = resolvedLindaState();
    const commercial = WorldStateSchema.parse({
      ...ready,
      protagonist: {
        ...ready.protagonist,
        locationId: 'southwest_commercial',
        worldPosition: { mapId: 'southwest_commercial', tileX: 15, tileY: 16 },
      },
      maps: Object.fromEntries(Object.entries(ready.maps).map(([id, map]) => [
        id, { ...map, active: id === 'southwest_commercial' },
      ])),
      npcs: {
        ...ready.npcs,
        linda: {
          ...ready.npcs.linda,
          presence: { kind: 'active_local', mapId: 'southwest_commercial', locationId: 'southwest_commercial', tileX: 15, tileY: 16 },
        },
      },
    });
    const accepted = reduceCommand(commercial, command(commercial, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_replaces_transfer', npcId: 'linda', sourceConversationId: 'conversation_replaces_transfer',
        proposedMinute: 1_140, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-replaces-transfer')).state;
    const routineTravel = simulateWorldInterval({
      state: accepted, toAbsoluteMinute: 1_080, toSubMinuteMilliseconds: 0, awake: true, frameMovement: true,
    }).state;
    expect(Object.values(routineTravel.transfers)).toEqual([
      expect.objectContaining({ npcId: 'linda', status: 'approaching_exit' }),
    ]);
    const invitationTravel = simulateWorldInterval({
      state: routineTravel, toAbsoluteMinute: 1_110, toSubMinuteMilliseconds: 0, awake: true, frameMovement: true,
    }).state;
    expect(Object.values(invitationTravel.transfers)).toEqual([
      expect.objectContaining({
        id: 'transfer-invitation-invitation_replaces_transfer', npcId: 'linda', status: 'approaching_exit',
      }),
    ]);
    expect(invitationTravel.npcs.linda?.scheduleGoal).toEqual(expect.objectContaining({
      sourceInvitationId: 'invitation_replaces_transfer',
    }));
  });

  test('an accepted invitation blocks routine transit that would overlap its departure', () => {
    const ready = resolvedLindaState();
    const commercial = WorldStateSchema.parse({
      ...ready,
      npcs: {
        ...ready.npcs,
        linda: {
          ...ready.npcs.linda,
          presence: { kind: 'inactive', mapId: 'southwest_commercial', locationId: 'southwest_commercial', tileX: 17, tileY: 17 },
        },
      },
    });
    const accepted = reduceCommand(commercial, command(commercial, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_blocks_overlap', npcId: 'linda', sourceConversationId: 'conversation_blocks_overlap',
        proposedMinute: 1_120, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-blocks-overlap')).state;
    expect(accepted.invitations.invitation_blocks_overlap?.status).toBe('accepted');
    const beforeDeparture = simulateWorldInterval({
      state: accepted, toAbsoluteMinute: 1_080, toSubMinuteMilliseconds: 0, awake: true, frameMovement: false,
    }).state;
    expect(beforeDeparture.transfers).toEqual({});
    expect(beforeDeparture.npcs.linda?.presence).toEqual(commercial.npcs.linda?.presence);
    const departed = simulateWorldInterval({
      state: beforeDeparture, toAbsoluteMinute: 1_090, toSubMinuteMilliseconds: 0, awake: true, frameMovement: false,
    }).state;
    expect(departed.invitations.invitation_blocks_overlap).toEqual(expect.objectContaining({
      status: 'accepted', transferId: 'transfer-invitation-invitation_blocks_overlap',
    }));
    expect(departed.npcs.linda?.presence).toEqual({
      kind: 'in_transit', transferId: 'transfer-invitation-invitation_blocks_overlap',
    });
  });

  test('active invitation departure uses the normal travel goal and respects routine schedule travel before departure', () => {
    const ready = resolvedLindaState();
    const commercial = WorldStateSchema.parse({
      ...ready,
      protagonist: {
        ...ready.protagonist,
        locationId: 'southwest_commercial',
        worldPosition: { mapId: 'southwest_commercial', tileX: 15, tileY: 16 },
      },
      maps: Object.fromEntries(Object.entries(ready.maps).map(([id, map]) => [id, { ...map, active: id === 'southwest_commercial' }])),
      npcs: {
        ...ready.npcs,
        linda: {
          ...ready.npcs.linda,
          presence: { kind: 'active_local', mapId: 'southwest_commercial', locationId: 'southwest_commercial', tileX: 15, tileY: 16 },
        },
      },
    });
    const accepted = reduceCommand(commercial, command(commercial, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_active', npcId: 'linda', sourceConversationId: 'conversation_active',
        proposedMinute: fixture.invitation.acceptedMinute, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-active')).state;
    const activated = simulateWorldInterval({
      state: accepted, toAbsoluteMinute: 570, toSubMinuteMilliseconds: 0, awake: true, frameMovement: true,
    }).state;
    expect(activated.transfers['transfer-invitation-invitation_active']?.status).toBe('approaching_exit');
    expect(activated.npcs.linda?.scheduleGoal).toEqual(expect.objectContaining({ activityId: 'travel', scheduledMinute: 570 }));

    const goal = activated.npcs.linda?.scheduleGoal;
    if (!goal) throw new Error('Active invitation travel goal is missing.');
    const atExit = WorldStateSchema.parse({
      ...activated,
      clock: { ...activated.clock, absoluteMinute: 575 },
      npcs: {
        ...activated.npcs,
        linda: {
          ...activated.npcs.linda,
          presence: {
            kind: 'active_local', mapId: goal.mapId, locationId: goal.locationId,
            tileX: goal.tileX, tileY: goal.tileY,
          },
        },
      },
    });
    expect(() => reduceCommand(atExit, command(atExit, 'complete-npc-goal', {
      npcId: 'linda',
    }, 'invite-active-wrong-completion'))).toThrow('depart-npc-transfer');
    expect(atExit.invitations.invitation_active?.status).toBe('accepted');
    const departedAtExit = reduceCommand(atExit, command(atExit, 'depart-npc-transfer', {
      npcId: 'linda', transferId: 'transfer-invitation-invitation_active',
    }, 'invite-active-departed')).state;
    expect(departedAtExit.transfers['transfer-invitation-invitation_active']).toEqual(expect.objectContaining({
      status: 'in_transit', departureMinute: 575, arrivalMinute: 600,
    }));

    const transitionedDuringApproach = reduceCommand(atExit, command(atExit, 'transition-protagonist', {
      originMapId: 'southwest_commercial', destinationMapId: 'northwest_residential',
      sourcePortalId: 'portal_invitation_test', destinationEntranceId: 'entrance_invitation_test',
      tileX: 18, tileY: 18,
    }, 'invite-active-transition')).state;
    expect(transitionedDuringApproach.transfers['transfer-invitation-invitation_active']).toEqual(expect.objectContaining({
      status: 'in_transit', departureMinute: 575, arrivalMinute: 600,
    }));

    const laterRequest = reduceCommand(commercial, command(commercial, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_superseded', npcId: 'linda', sourceConversationId: 'conversation_superseded',
        proposedMinute: 1_140, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-superseded')).state;
    const beforeRoutineTravel = simulateWorldInterval({
      state: laterRequest, toAbsoluteMinute: 720, toSubMinuteMilliseconds: 0, awake: true, frameMovement: false,
    }).state;
    expect(beforeRoutineTravel.invitations.invitation_superseded?.status).toBe('accepted');
    const prepared = simulateWorldInterval({
      state: beforeRoutineTravel, toAbsoluteMinute: 1_110, toSubMinuteMilliseconds: 0, awake: true, frameMovement: false,
    }).state;
    expect(prepared.transfers['transfer-invitation-invitation_superseded']).toBeUndefined();
    expect(prepared.invitations.invitation_superseded).toEqual(expect.objectContaining({
      status: 'accepted', preparedAtMinute: 1_110,
    }));
    expect(prepared.invitations.invitation_superseded?.transferId).toBeUndefined();
    const completed = simulateWorldInterval({
      state: prepared, toAbsoluteMinute: 1_140, toSubMinuteMilliseconds: 0, awake: true, frameMovement: false,
    }).state;
    expect(completed.invitations.invitation_superseded?.status).toBe('completed');
  });

  test('an accepted invitation owns travel across overlapping routine schedule milestones', () => {
    const ready = resolvedLindaState();
    const crossMap = WorldStateSchema.parse({
      ...ready,
      npcs: {
        ...ready.npcs,
        linda: {
          ...ready.npcs.linda,
          presence: { kind: 'active_local', mapId: 'southwest_commercial', locationId: 'southwest_commercial', tileX: 15, tileY: 16 },
        },
      },
    });
    const accepted = reduceCommand(crossMap, command(crossMap, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_schedule_overlap', npcId: 'linda', sourceConversationId: 'conversation_schedule_overlap',
        proposedMinute: 1_100, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-schedule-overlap')).state;
    const arrived = simulateWorldInterval({
      state: accepted, toAbsoluteMinute: 1_100, toSubMinuteMilliseconds: 0, awake: true, frameMovement: false,
    }).state;
    expect(arrived.invitations.invitation_schedule_overlap?.status).toBe('completed');
    expect(arrived.transfers).toEqual({});

    const activeCommercial = WorldStateSchema.parse({
      ...accepted,
      protagonist: {
        ...accepted.protagonist,
        locationId: 'southwest_commercial',
        worldPosition: { mapId: 'southwest_commercial', tileX: 15, tileY: 16 },
      },
      maps: Object.fromEntries(Object.entries(accepted.maps).map(([id, map]) => [
        id, { ...map, active: id === 'southwest_commercial' },
      ])),
    });
    const approaching = simulateWorldInterval({
      state: activeCommercial, toAbsoluteMinute: 1_080, toSubMinuteMilliseconds: 0, awake: true, frameMovement: true,
    }).state;
    expect(approaching.invitations.invitation_schedule_overlap?.status).toBe('accepted');
    expect(approaching.transfers['transfer-invitation-invitation_schedule_overlap']?.status).toBe('approaching_exit');
    expect(approaching.npcs.linda?.scheduleGoal).toEqual(expect.objectContaining({
      activityId: 'travel', sourceInvitationId: 'invitation_schedule_overlap',
    }));
  });

  test('same-map invitation walks locally when visible, completes off-screen, and permits a later new request', () => {
    const ready = resolvedLindaState();
    const accepted = reduceCommand(ready, command(ready, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_local', npcId: 'linda', sourceConversationId: 'conversation_local',
        proposedMinute: fixture.invitation.acceptedMinute, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-local')).state;
    const prepared = simulateWorldInterval({
      state: accepted, toAbsoluteMinute: 570, toSubMinuteMilliseconds: 0, awake: true, frameMovement: true,
    }).state;
    const started = simulateWorldInterval({
      state: prepared, toAbsoluteMinute: 600, toSubMinuteMilliseconds: 0, awake: true, frameMovement: true,
    }).state;
    expect(started.npcs.linda?.scheduleGoal).toEqual(expect.objectContaining({
      activityId: 'home_visit', sourceInvitationId: 'invitation_local',
      tileX: GENERATED_LAYOUT.homeVisitTile.x, tileY: GENERATED_LAYOUT.homeVisitTile.y,
    }));

    const completed = simulateWorldInterval({
      state: prepared, toAbsoluteMinute: 600, toSubMinuteMilliseconds: 0, awake: true, frameMovement: false,
    }).state;
    expect(completed.invitations.invitation_local?.status).toBe('completed');
    const replay = reduceCommand(completed, command(completed, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_local', npcId: 'linda', sourceConversationId: 'conversation_local',
        proposedMinute: fixture.invitation.acceptedMinute, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-local-replay'));
    expect(replay.event).toEqual(expect.objectContaining({ outcome: 'completed', changed: false }));
    const later = reduceCommand(completed, command(completed, 'respond-home-invitation', {
      request: {
        invitationId: 'invitation_after_completed', npcId: 'linda', sourceConversationId: 'conversation_after_completed',
        proposedMinute: 1_140, durationMinutes: fixture.invitation.durationMinutes,
      },
    }, 'invite-after-completed'));
    expect(later.event).toEqual(expect.objectContaining({ type: 'home-invitation-responded', changed: true }));
  });
});
