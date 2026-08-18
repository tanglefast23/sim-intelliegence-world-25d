import { z } from 'zod';

import { HomeInvitationRequestSchema } from '../invitations/schema';
import { JournalEntrySchema } from '../quests/journal';
import { RelationshipDeltaSchema, RelationshipStageSchema } from '../relationships/relationship';
import { CommandIdSchema, EventIdSchema, PauseTokenSchema, StableIdSchema } from '../state/ids';
import { SimulationSpeedSchema } from '../clock/clock';
import { KnowledgeRecordSchema } from '../state/models';
import { PoliceHookSchema } from '../consequences/police';
import {
  RecordPlayerKnowledgeBodySchema,
  VerbalMissionOutcomeCommandSchema,
} from '../verbal-missions/commands';

const CommandBaseSchema = z.object({
  commandId: CommandIdSchema,
  eventId: EventIdSchema,
  scheduledMinute: z.number().int().nonnegative(),
  priority: z.number().int().min(-100).max(100),
}).strict();

export const DomainCommandSchema = z.discriminatedUnion('type', [
  CommandBaseSchema.extend({
    type: z.literal('advance-clock'),
    realMilliseconds: z.number().int().nonnegative(),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('add-pause-token'),
    token: PauseTokenSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('remove-pause-token'),
    token: PauseTokenSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('apply-relationship-delta'),
    npcId: StableIdSchema,
    delta: RelationshipDeltaSchema,
    source: z.enum(['conversation', 'quest']),
    reason: z.string().trim().min(1).max(160),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('apply-faction-delta'),
    factionId: StableIdSchema,
    delta: z.number().int(),
    scale: z.enum(['ordinary', 'major']),
    reason: z.string().trim().min(1).max(160),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('request-relationship-stage'),
    npcId: StableIdSchema,
    targetStage: RelationshipStageSchema.exclude(['stranger']),
    actionId: StableIdSchema,
    authoredEvent: z.boolean(),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('respond-home-invitation'),
    request: HomeInvitationRequestSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('cancel-home-invitation'),
    invitationId: StableIdSchema,
    reasonId: StableIdSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('reveal-faction'),
    factionId: StableIdSchema,
    discoveryFlagId: StableIdSchema,
    sourceType: z.enum(['scene_observation', 'authored_event']),
    sourceId: StableIdSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('upsert-journal-entry'),
    entry: JournalEntrySchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('purchase-social-option'),
    offerId: StableIdSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('start-linda-quest'),
    requestNpcId: StableIdSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('discover-linda-villa'),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('resolve-linda-quest'),
    approachId: z.enum(['protect_linda', 'betray_linda', 'withdraw']),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('advance-police-attention'),
    evidenceId: StableIdSchema,
    hook: PoliceHookSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('move-protagonist'),
    mapId: StableIdSchema,
    locationId: StableIdSchema,
    tileX: z.number().int().min(0).max(63),
    tileY: z.number().int().min(0).max(47),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('set-simulation-speed'),
    speed: SimulationSpeedSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('advance-simulation'),
    realMilliseconds: z.number().int().nonnegative(),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('sleep-protagonist'),
    mode: z.enum(['nap', 'overnight']),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('dev-jump-to-minute'),
    toMinute: z.number().int().nonnegative(),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('apply-quest-reward'),
    rewardKind: z.enum(['ordinary', 'dangerous']),
    amount: z.number().int().nonnegative(),
    questId: StableIdSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('move-npc'),
    npcId: StableIdSchema,
    mapId: StableIdSchema,
    tileX: z.number().int().min(0).max(63),
    tileY: z.number().int().min(0).max(47),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('complete-npc-goal'),
    npcId: StableIdSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('depart-npc-transfer'),
    npcId: StableIdSchema,
    transferId: StableIdSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('transition-protagonist'),
    originMapId: StableIdSchema,
    destinationMapId: StableIdSchema,
    sourcePortalId: StableIdSchema,
    destinationEntranceId: StableIdSchema,
    tileX: z.number().int().min(0).max(63),
    tileY: z.number().int().min(0).max(47),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('commit-conversation'),
    conversationId: StableIdSchema,
    npcId: StableIdSchema,
    knowledge: z.array(KnowledgeRecordSchema).max(16),
    unlockedInterestIds: z.array(StableIdSchema).max(16),
    unlockedIds: z.array(StableIdSchema).max(16),
    memories: z.array(z.object({
      subjectId: StableIdSchema,
      summary: z.string().trim().min(1).max(240),
      importancePermille: z.number().int().min(0).max(1_000),
    }).strict()).max(8),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('offer-verbal-mission'),
    missionId: StableIdSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('apply-verbal-mission-outcome'),
    ...VerbalMissionOutcomeCommandSchema.shape,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('withdraw-verbal-mission'),
    missionId: StableIdSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('record-player-knowledge'),
    ...RecordPlayerKnowledgeBodySchema.shape,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('record-fact-disclosure'),
    missionId: StableIdSchema,
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('purchase-unique-object'),
    missionId: StableIdSchema,
    confirmedAmount: z.number().int().nonnegative(),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('create-scheduled-commitment'),
    missionId: StableIdSchema,
    commitmentId: StableIdSchema,
    commitmentMinute: z.number().int().nonnegative(),
  }).strict(),
  CommandBaseSchema.extend({
    type: z.literal('resolve-scheduled-commitment'),
    commitmentId: StableIdSchema,
  }).strict(),
]);

export type DomainCommand = z.infer<typeof DomainCommandSchema>;
