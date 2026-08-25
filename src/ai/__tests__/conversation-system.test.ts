import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { RecordedInferencePort } from '../../application/effects/InferencePort';
import { NpcRulesSchema } from '../../content/schemas/registry';
import { createInitialState } from '../../domain/state/initial-state';
import { WorldStateSchema } from '../../domain/state/schema';
import { PRODUCTION_FULL_AI_CAST } from '../../domain/state/production-cast';
import { ConversationService } from '../conversation/service';
import { ConversationTransaction, conversationCommitEventId } from '../conversation/transaction';
import { conversationPromptSuggestions, detectStructuredConversationAction } from '../conversation/intent';
import { parseCharacterKnowledgeMarkdown } from '../knowledge/character-knowledge';
import { classifyQuestionScope, parseWorldKnowledgeMarkdown } from '../knowledge/world-knowledge';
import { buildPromptProjection, MAX_PROMPT_BYTES, promptUtf8Bytes } from '../projection/prompt-projection';
import { ambientDialogue, buildSceneRegistry, type CharacterWriting } from '../registry/scene-registry';
import { FileCharacterWritingStore } from '../registry/file-writing-store';
import { buildTurnCandidateRegistry, isPositiveFirstPersonCatClaim } from '../registry/turn-candidates';
import { deterministicPolicyDecision } from '../policy/content-policy';
import {
  conversationResponseJsonSchemaForScene,
  parseConversationResponseJson,
} from '../schemas/conversation-response';

const fixture = (name: string): string => readFileSync(resolve('tests/fixtures/ai', name), 'utf8');
const policyAllow = JSON.stringify({ decision: 'allow', category: 'allowed_fictional_adult' });
const writingStore = new FileCharacterWritingStore(resolve('content'));

async function serviceWith(responses: readonly (string | Error | ((signal?: AbortSignal) => Promise<string>))[]) {
  const inference = new RecordedInferencePort(responses);
  return { inference, service: new ConversationService(inference, writingStore) };
}

describe('validated local conversation system', () => {
  test('concurrent begins cannot open two conversations', async () => {
    const linda = await writingStore.get('linda');
    let releaseWriting: ((writing: CharacterWriting) => void) | undefined;
    const pendingWriting = new Promise<CharacterWriting>((resolveWriting) => { releaseWriting = resolveWriting; });
    const service = new ConversationService(new RecordedInferencePort([]), { get: () => pendingWriting });
    const first = service.begin({ conversationId: 'conversation-race-1', npcId: 'linda', state: createInitialState() });
    await expect(service.begin({
      conversationId: 'conversation-race-2', npcId: 'linda', state: createInitialState(),
    })).rejects.toThrow('Only one active conversation');
    releaseWriting?.(linda);
    await expect(first).resolves.toEqual(expect.objectContaining({ kind: 'active' }));
    expect(service.activeSessionCount).toBe(1);
  });

  test('closed response parsing rejects unknown, duplicate, oversized, and truncated JSON', () => {
    expect(parseConversationResponseJson(fixture('refusal.json')).intent).toBe('refuse');
    const valid = JSON.parse(fixture('refusal.json')) as Record<string, unknown>;
    expect(() => parseConversationResponseJson(JSON.stringify({ ...valid, unknown: true }))).toThrow();
    expect(() => parseConversationResponseJson(fixture('duplicate-response.txt'))).toThrow('Duplicate JSON key');
    expect(() => parseConversationResponseJson(fixture('truncated-response.txt'))).toThrow();
    expect(() => parseConversationResponseJson(`{"padding":"${'x'.repeat(9_000)}"}`)).toThrow('byte limit');
  });

  test('one hundred safe schema fixtures parse as closed first-generation responses', () => {
    const base = JSON.parse(fixture('refusal.json')) as Record<string, unknown>;
    for (let index = 0; index < 100; index += 1) {
      const parsed = parseConversationResponseJson(JSON.stringify({
        ...base,
        dialogue: `Capability fixture ${index}: concise fictional-adult dialogue.`,
      }));
      expect(parsed.dialogue).toContain(`fixture ${index}`);
    }
  });

  test('cat-claim grammar restricts player evidence before local validation', async () => {
    const state = createInitialState();
    const linda = await writingStore.get('linda');
    const registry = buildSceneRegistry(state, linda, {
      sceneObservationIds: [], npcReportIds: [], authoredEventIds: [],
    });
    const turnCandidates = buildTurnCandidateRegistry(registry, 'I have a cat');
    const schema = conversationResponseJsonSchemaForScene(
      registry,
      turnCandidates,
      ['turn-cat-grammar'],
      { sourceId: 'turn-cat-grammar', evidenceText: 'I have a cat' },
    ) as {
      properties?: Readonly<Record<string, unknown>>;
    };
    const knowledge = schema.properties?.knowledgeCandidates as {
      items?: { properties?: Record<string, { enum?: unknown[]; type?: unknown; anyOf?: unknown }> };
    };
    expect(knowledge.items?.properties?.candidateType?.enum).toEqual(['held_belief']);
    expect(knowledge.items?.properties?.sourceType?.enum).toEqual(['player_message']);
    expect(knowledge.items?.properties?.sourceId?.enum).toEqual(['turn-cat-grammar']);
    expect(knowledge.items?.properties?.assertedValue?.enum).toEqual([true]);
    expect(knowledge.items?.properties?.evidenceText?.type).toBe('string');
    expect(knowledge.items?.properties?.evidenceText?.enum).toEqual(['I have a cat']);
    expect(knowledge.items?.properties?.evidenceText?.anyOf).toBeUndefined();
  });

  test('prompt projection is deterministic, bounded, and excludes another NPC private state', async () => {
    const privateFixture = JSON.parse(fixture('second-named-npc/private-knowledge.json')) as { privateSummary: string };
    const linda = await writingStore.get('linda');
    const state = WorldStateSchema.parse({
      ...createInitialState(),
      npcs: {
        ...createInitialState().npcs,
        mara: {
          id: 'mara', tier: 'full_ai',
          presence: { kind: 'active_local', mapId: 'northwest_residential', locationId: 'northwest_residential', tileX: 30, tileY: 30 },
          knowledge: [], unlockedInterestIds: [], unlockedIds: [],
          memories: [{ subjectId: 'private_secret', summary: privateFixture.privateSummary, importancePermille: 900, eventId: 'event-mara-secret' }],
        },
      },
      relationships: {
        ...createInitialState().relationships,
        mara: {
          npcId: 'mara', values: { familiarity: 0, trust: 0, attraction: 0 }, stage: 'stranger',
          rejections: [], compatibility: { social: true, romantic: false },
          policy: { romanticEligibleAtStart: false, hardBoundaries: [], stageRules: [] },
        },
      },
    });
    const registry = buildSceneRegistry(state, linda, { sceneObservationIds: [], npcReportIds: [], authoredEventIds: [] });
    const input = {
      state, character: linda, registry,
      staged: { knowledge: [], unlockedInterestIds: [], unlockedIds: [], memories: [] },
      recentTurns: Array.from({ length: 40 }, (_, index) => ({ speaker: 'player' as const, text: `Old turn ${index} ${'x'.repeat(200)}` })),
      playerMessage: `Hello ${'z'.repeat(6_000)}`,
      turnId: 'turn-budget-1',
    };
    const first = buildPromptProjection(input);
    expect(buildPromptProjection(input)).toBe(first);
    expect(promptUtf8Bytes(first)).toBeLessThanOrEqual(MAX_PROMPT_BYTES);
    expect(first).not.toContain(privateFixture.privateSummary);
  });

  test('Halcyra public knowledge retrieves the clothes section without unrelated civic facts', async () => {
    const linda = await writingStore.get('linda');
    const state = createInitialState();
    const registry = buildSceneRegistry(state, linda, {
      sceneObservationIds: [], npcReportIds: [], authoredEventIds: [],
    });
    const prompt = buildPromptProjection({
      state,
      character: linda,
      registry,
      staged: { knowledge: [], unlockedInterestIds: [], unlockedIds: [], memories: [] },
      recentTurns: [{ speaker: 'player', text: 'Where can I buy clothes in this city?' }],
      playerMessage: 'Does that market sell shoes?',
      turnId: 'turn-halcyra-shopping',
    });
    expect(prompt).toContain('WORLD FRAME: Halcyra Island');
    expect(prompt).toContain('QUESTION SCOPE: local_halcyra');
    expect(prompt).toContain('go southwest to the commercial district');
    expect(prompt).not.toContain('main offices of the island administration');
  });

  test('cat instructions are present only when the active registry supports all four Linda IDs', async () => {
    const state = createInitialState();
    for (const npcId of ['linda', ...PRODUCTION_FULL_AI_CAST.map(({ id }) => id)]) {
      const character = await writingStore.get(npcId);
      const registry = buildSceneRegistry(state, character, {
        sceneObservationIds: [], npcReportIds: [], authoredEventIds: [],
      });
      const prompt = buildPromptProjection({
        state,
        character,
        registry,
        staged: { knowledge: [], unlockedInterestIds: [], unlockedIds: [], memories: [] },
        recentTurns: [],
        playerMessage: 'I have a cat.',
        turnId: `turn-${npcId}-cat-isolation`,
      });
      if (npcId === 'linda') {
        expect(registry.factIds).toContain('protagonist_has_cat');
        expect(registry.interestIds).toContain('cats');
        expect(registry.unlockIds).toContain('cats_common_interest');
        expect(registry.memorySubjectIds).toContain('protagonist_cat');
        expect(prompt).toContain('propose fact protagonist_has_cat=true');
        expect(prompt).toContain('memory subject protagonist_cat');
      } else {
        expect(registry.factIds).not.toContain('protagonist_has_cat');
        expect(registry.interestIds).not.toContain('cats');
        expect(registry.unlockIds).not.toContain('cats_common_interest');
        expect(registry.memorySubjectIds).not.toContain('protagonist_cat');
        expect(prompt).not.toContain('propose fact protagonist_has_cat=true');
        expect(prompt).not.toContain('memory subject protagonist_cat');
      }
    }
  });

  test.each([
    ['Where is China?', 'real_world', undefined],
    ['Where can I eat in china?', 'real_world', undefined],
    ['Where can I eat in paris?', 'real_world', undefined],
    ['Where should I go in tokyo?', 'real_world', undefined],
    ['Where can I eat near Paris?', 'real_world', undefined],
    ['Where can I have some fun tonight?', 'local_halcyra', 'downtown entertainment district'],
    ['Where can I eat?', 'local_halcyra', 'commercial district'],
    ['Where can I eat in the evening?', 'local_halcyra', 'commercial district'],
    ['Where can I buy clothes near the spa?', 'local_halcyra', 'shopping malls'],
    ['Where can I eat in the residential district?', 'local_halcyra', 'commercial district'],
    ['Where can I have fun in the northeast?', 'local_halcyra', 'downtown entertainment district'],
    ['Where can I relax in the northwest?', 'local_halcyra', 'residential and relaxation district'],
    ['Where should I go?', 'local_halcyra', 'residential and relaxation district'],
    ['Where should I go in the morning?', 'local_halcyra', 'residential and relaxation district'],
    ['Where should I go in China?', 'real_world', undefined],
    ['Where did you go to school?', 'personal_npc', undefined],
    ['Who runs the Velvet Tide?', 'concealed_or_unknown', undefined],
  ])('question scope routes %s to %s', async (message, expectedScope, expectedLocalFact) => {
    const linda = await writingStore.get('linda');
    const state = createInitialState();
    const registry = buildSceneRegistry(state, linda, {
      sceneObservationIds: [], npcReportIds: [], authoredEventIds: [],
    });
    expect(classifyQuestionScope(message, [])).toBe(expectedScope);
    const prompt = buildPromptProjection({
      state,
      character: linda,
      registry,
      staged: { knowledge: [], unlockedInterestIds: [], unlockedIds: [], memories: [] },
      recentTurns: [],
      playerMessage: message,
      turnId: `turn-scope-${expectedScope}`,
    });
    expect(prompt).toContain(`QUESTION SCOPE: ${expectedScope}`);
    expect(prompt).toContain('poorly educated but socially clever');
    expect(prompt).toContain('China is a country in East Asia');
    expect(prompt).toContain('If the NPC does not know or is unsure');
    if (expectedLocalFact) expect(prompt).toContain(expectedLocalFact);
    else expect(prompt).not.toContain('go southwest to the commercial district');
  });

  test('an earlier Halcyra turn does not make an unrelated academic question local', () => {
    expect(classifyQuestionScope('What is quantum field theory?', [
      { speaker: 'player', text: 'Where can I have fun on Halcyra?' },
    ])).toBe('real_world');
    expect(classifyQuestionScope('What about there?', [
      { speaker: 'player', text: 'Where can I have fun on Halcyra?' },
    ])).toBe('local_halcyra');
  });

  test('the current player dialogue is repeated as the final generation message', async () => {
    const message = 'Do you know where China is?';
    const { inference, service } = await serviceWith([fixture('refusal.json'), policyAllow]);
    await service.begin({ conversationId: 'conversation-current-dialogue', npcId: 'linda', state: createInitialState() });
    await service.turn({
      conversationId: 'conversation-current-dialogue', turnId: 'turn-current-dialogue', message,
    });
    expect(inference.requests[0]?.messages[1]?.role).toBe('user');
    expect(inference.requests[0]?.messages[1]?.content).toContain(JSON.stringify(message));
    expect(inference.requests[0]?.messages[1]?.content).toContain('respond directly to this current player turn');
  });

  test('unauthored real-world geography relative to Halcyra requires correction', async () => {
    const base = JSON.parse(fixture('refusal.json')) as Record<string, unknown>;
    const first = JSON.stringify({ ...base, dialogue: 'China is east of here.' });
    const corrected = JSON.stringify({ ...base, dialogue: 'China is a country in East Asia.' });
    const { inference, service } = await serviceWith([first, corrected, policyAllow]);
    await service.begin({
      conversationId: 'conversation-grounded-geography', npcId: 'linda', state: createInitialState(),
    });
    const result = await service.turn({
      conversationId: 'conversation-grounded-geography', turnId: 'turn-grounded-geography',
      message: 'Do you know where China is?',
    });
    expect(result).toEqual(expect.objectContaining({
      source: 'corrected-model', dialogue: 'China is a country in East Asia.',
    }));
    expect(inference.requests[1]?.messages.at(-1)?.content).toContain('direction, distance, or travel time');
  });

  test('knowledge Markdown and world frame fail closed on malformed authored content', () => {
    expect(() => parseCharacterKnowledgeMarkdown('# Knowledge Profile\n\n## Reasoning style\nOnly one section.')).toThrow('Education and experience');
    const worldSource = readFileSync(resolve('content/world/HalcyraIsland.md'), 'utf8');
    expect(parseWorldKnowledgeMarkdown(worldSource).sections.slice(0, 2).map(({ id }) => id)).toEqual(['world-frame', 'overview']);
    expect(() => parseWorldKnowledgeMarkdown(worldSource.replace('## World frame', '## Missing frame'))).toThrow('World frame and Overview');
  });

  test('per-turn schema removes persistent candidate IDs from a recall-only turn', async () => {
    const { inference, service } = await serviceWith([fixture('refusal.json'), policyAllow]);
    await service.begin({ conversationId: 'conversation-schema-1', npcId: 'linda', state: createInitialState() });
    await service.turn({ conversationId: 'conversation-schema-1', turnId: 'turn-schema-1', message: 'What do you remember about me?' });
    const schema = inference.requests[0]?.jsonSchema as {
      properties?: Record<string, { maxItems?: number; enum?: unknown[] }>;
    };
    expect(schema.properties?.knowledgeCandidates?.maxItems).toBe(0);
    expect(schema.properties?.interestCandidateIds?.maxItems).toBe(0);
    expect(schema.properties?.memoryCandidates?.maxItems).toBe(0);
    expect(schema.properties?.unlockCandidateIds?.maxItems).toBe(0);
    expect(schema.properties?.actionId?.enum).not.toContain('ask_date');
    expect(schema.properties?.actionId?.enum).not.toContain('invite_home');
  });

  test('cat belief, common interest, unlock, and memory stage then commit atomically', async () => {
    const { service } = await serviceWith([fixture('valid-cat.json'), policyAllow]);
    const base = createInitialState();
    const begun = await service.begin({ conversationId: 'conversation-linda-1', npcId: 'linda', state: base });
    expect(begun.kind).toBe('active');
    if (begun.kind !== 'active') throw new Error('Expected active conversation.');
    expect(begun.pausedState.clock.pauseTokens).toEqual([expect.stringMatching(/^pause:conversation:[a-f0-9]+$/u)]);
    expect(base.npcs.linda?.knowledge).toEqual([]);

    const turn = await service.turn({ conversationId: 'conversation-linda-1', turnId: 'turn-linda-1', message: 'I have a cat' });
    expect(turn).toEqual(expect.objectContaining({ source: 'model', stagedChangeCount: 5 }));
    expect(base.npcs.linda?.knowledge).toEqual([]);

    const committed = service.end('conversation-linda-1');
    expect(committed.clock.pauseTokens).toEqual([]);
    expect(committed.eventLedger.find(({ type }) => type === 'conversation-committed')).toEqual(expect.objectContaining({ type: 'conversation-committed', knowledgeCount: 1, interestCount: 1, unlockCount: 1, memoryCount: 1 }));
    expect(committed.npcs.linda?.knowledge[0]).toEqual(expect.objectContaining({
      factId: 'protagonist_has_cat', epistemicState: 'held_belief', truthStatus: 'contradicted',
    }));
    expect(committed.npcs.linda?.unlockedInterestIds).toEqual(['cats']);
    expect(committed.npcs.linda?.unlockedIds).toEqual(['cats_common_interest']);
    expect(committed.relationships.linda?.values.familiarity).toBe(6);
    const reloaded = WorldStateSchema.parse(JSON.parse(JSON.stringify(committed)) as unknown);
    expect(reloaded.npcs.linda?.memories[0]?.summary).toContain('claim to have a cat');
  });

  test('repeated cat statement cannot duplicate common-interest state', async () => {
    const firstRun = await serviceWith([fixture('valid-cat.json'), policyAllow]);
    await firstRun.service.begin({ conversationId: 'conversation-linda-1', npcId: 'linda', state: createInitialState() });
    await firstRun.service.turn({ conversationId: 'conversation-linda-1', turnId: 'turn-linda-1', message: 'I have a cat' });
    const first = firstRun.service.end('conversation-linda-1');
    const secondRun = await serviceWith([fixture('valid-cat.json'), policyAllow]);
    await secondRun.service.begin({ conversationId: 'conversation-linda-2', npcId: 'linda', state: first });
    const turn = await secondRun.service.turn({ conversationId: 'conversation-linda-2', turnId: 'turn-linda-1', message: 'I have a cat' });
    expect(turn.stagedChangeCount).toBe(1);
    const second = secondRun.service.end('conversation-linda-2');
    expect(second.npcs.linda?.unlockedInterestIds).toEqual(['cats']);
    expect(second.npcs.linda?.unlockedIds).toEqual(['cats_common_interest']);
    expect(second.npcs.linda?.memories).toHaveLength(1);
  });

  test('authoritative truth is separate from a sourced belief', async () => {
    const state = WorldStateSchema.parse({
      ...createInitialState(), inventory: { ...createInitialState().inventory, items: { cat: 1 } },
    });
    const { service } = await serviceWith([fixture('valid-cat.json'), policyAllow]);
    await service.begin({ conversationId: 'conversation-truth-1', npcId: 'linda', state });
    await service.turn({ conversationId: 'conversation-truth-1', turnId: 'turn-linda-1', message: 'I have a cat' });
    const committed = service.end('conversation-truth-1');
    expect(committed.npcs.linda?.knowledge[0]?.truthStatus).toBe('verified');
    expect(committed.inventory.items.cat).toBe(1);
  });

  test('false-belief fixture contradicts world truth without changing it', async () => {
    const { service } = await serviceWith([fixture('false-belief.json'), policyAllow]);
    const state = createInitialState();
    await service.begin({ conversationId: 'conversation-lie-1', npcId: 'linda', state });
    await service.turn({ conversationId: 'conversation-lie-1', turnId: 'turn-linda-1', message: 'I have a cat' });
    const committed = service.end('conversation-lie-1');
    expect(committed.npcs.linda?.knowledge[0]?.truthStatus).toBe('contradicted');
    expect(committed.inventory.items.cat).toBeUndefined();
  });

  test('invalid first output receives one compact correction retry', async () => {
    const { inference, service } = await serviceWith([fixture('invalid-id.json'), fixture('refusal.json'), policyAllow]);
    await service.begin({ conversationId: 'conversation-correction-1', npcId: 'linda', state: createInitialState() });
    const result = await service.turn({ conversationId: 'conversation-correction-1', turnId: 'turn-linda-1', message: 'I have a cat' });
    expect(result.source).toBe('corrected-model');
    expect(inference.requests).toHaveLength(3);
    expect(inference.requests[1]?.messages.at(-1)?.content).toContain('prior object was invalid');
  });

  test('an exact player-message echo is rejected and corrected before display', async () => {
    const message = 'Does that market have interesting people?';
    const baseResponse = JSON.parse(fixture('refusal.json')) as Record<string, unknown>;
    const echo = JSON.stringify({ ...baseResponse, dialogue: message, actionId: 'ask_follow_up' });
    const corrected = JSON.stringify({
      ...baseResponse,
      dialogue: 'The commercial district draws all kinds of people. Go southwest and see for yourself.',
      actionId: 'ask_follow_up',
    });
    const { inference, service } = await serviceWith([echo, corrected, policyAllow]);
    await service.begin({ conversationId: 'conversation-no-echo', npcId: 'linda', state: createInitialState() });
    const result = await service.turn({
      conversationId: 'conversation-no-echo', turnId: 'turn-no-echo', message,
    });
    expect(result.source).toBe('corrected-model');
    expect(result.dialogue).toContain('commercial district');
    expect(result.dialogue).not.toBe(message);
    expect(inference.requests).toHaveLength(3);
  });

  test.each(['invalid-id.json', 'hostile-boundary.json', 'high-impact.json'])(
    'two invalid generations use no-change fallback and no persistent proposal: %s',
    async (name) => {
      const { inference, service } = await serviceWith([fixture(name), fixture(name)]);
      const state = createInitialState();
      await service.begin({ conversationId: `conversation-fallback-${name.split('.')[0]}`, npcId: 'linda', state });
      const result = await service.turn({ conversationId: `conversation-fallback-${name.split('.')[0]}`, turnId: 'turn-linda-1', message: 'I have a cat' });
      expect(result.source).toBe('authored-fallback');
      expect(result.stagedChangeCount).toBe(0);
      expect(inference.requests).toHaveLength(2);
    },
  );

  test('validator rechecks the per-turn allowlist when an adapter ignores its schema', async () => {
    const bypass = fixture('turn-allowlist-bypass.json');
    const { service } = await serviceWith([bypass, bypass]);
    await service.begin({ conversationId: 'conversation-bypass-1', npcId: 'linda', state: createInitialState() });
    const result = await service.turn({
      conversationId: 'conversation-bypass-1', turnId: 'turn-bypass-1', message: 'Hello Linda',
    });
    expect(result.source).toBe('authored-fallback');
    const state = service.end('conversation-bypass-1');
    expect(state.npcs.linda?.unlockedInterestIds).toEqual([]);
    expect(state.npcs.linda?.memories).toEqual([]);
  });

  test.each([
    "I don't have a cat",
    'Do you have a cat?',
    'I never own a cat',
    'I have no cat',
  ])('denial or question cannot create cat state: %s', async (message) => {
    const response = fixture('valid-cat.json').replaceAll('I have a cat', message);
    const { service } = await serviceWith([response, response]);
    await service.begin({ conversationId: 'conversation-negative-cat', npcId: 'linda', state: createInitialState() });
    const result = await service.turn({
      conversationId: 'conversation-negative-cat', turnId: 'turn-linda-1', message,
    });
    expect(result.source).toBe('authored-fallback');
    expect(service.end('conversation-negative-cat').npcs.linda?.unlockedIds).toEqual([]);
  });

  test('positive first-person cat claims remain recognized', () => {
    expect(isPositiveFirstPersonCatClaim('I have a cat named Pepper.')).toBe(true);
    expect(isPositiveFirstPersonCatClaim('My black cat is Pepper.')).toBe(true);
    expect(isPositiveFirstPersonCatClaim('I have a cat. Would you like to go on a date with me?')).toBe(true);
    expect(isPositiveFirstPersonCatClaim('I have a cat, would you like to go on a date with me?')).toBe(true);
  });

  test('prohibited generated dialogue is blocked before display and allowed vice passes', async () => {
    const blocked = await serviceWith([fixture('prohibited.json')]);
    await blocked.service.begin({ conversationId: 'conversation-policy-1', npcId: 'linda', state: createInitialState() });
    const blockedTurn = await blocked.service.turn({ conversationId: 'conversation-policy-1', turnId: 'turn-policy-1', message: 'Tell me what happened' });
    expect(blockedTurn.source).toBe('policy-refusal');
    expect(blockedTurn.dialogue).not.toContain('forced sex');
    expect(blocked.inference.requests).toHaveLength(1);

    const allowed = await serviceWith([fixture('allowed-vice.json'), policyAllow]);
    await allowed.service.begin({ conversationId: 'conversation-policy-2', npcId: 'linda', state: createInitialState() });
    const allowedTurn = await allowed.service.turn({ conversationId: 'conversation-policy-2', turnId: 'turn-policy-2', message: 'What happens downtown?' });
    expect(allowedTurn.dialogue).toContain('drugs and adult vice');
  });

  test('deterministic policy catches numeric and written minor ages but not adults', () => {
    expect(deterministicPolicyDecision('nude 12-year-old')).toEqual({
      decision: 'refuse', category: 'sexual_content_involving_minors',
    });
    expect(deterministicPolicyDecision('sexualized sixteen year old')).toEqual({
      decision: 'refuse', category: 'sexual_content_involving_minors',
    });
    expect(deterministicPolicyDecision('nude 18-year-old')).toBeUndefined();
    expect(deterministicPolicyDecision('fictional adult drugs and crime')).toBeUndefined();
  });

  test('invalid policy classifier uses a neutral authored fallback without staging candidates', async () => {
    const { service } = await serviceWith([fixture('valid-cat.json'), '{"decision":"allow","category":"wrong"}']);
    await service.begin({ conversationId: 'conversation-policy-3', npcId: 'linda', state: createInitialState() });
    const result = await service.turn({ conversationId: 'conversation-policy-3', turnId: 'turn-linda-1', message: 'I have a cat' });
    expect(result.source).toBe('authored-fallback');
    expect(result.stagedChangeCount).toBe(0);
    expect(service.end('conversation-policy-3').npcs.linda?.knowledge).toEqual([]);
  });

  test('full generation is buffered and a crash discards all staged state', async () => {
    const delayedFixture = JSON.parse(fixture('delayed.json')) as { delayMilliseconds: number; responseFixture: string };
    const crashFixture = JSON.parse(fixture('crash.json')) as { failure: string; expectedOutcome: string };
    expect(crashFixture).toEqual({ failure: 'renderer_loss', expectedOutcome: 'discard_staged_transaction' });
    let release: ((source: string) => void) | undefined;
    const delayed = new Promise<string>((resolveResponse) => {
      setTimeout(() => { release = resolveResponse; }, delayedFixture.delayMilliseconds);
    });
    const { service } = await serviceWith([() => delayed, policyAllow]);
    const base = createInitialState();
    await service.begin({ conversationId: 'conversation-crash-1', npcId: 'linda', state: base });
    let settled = false;
    const pending = service.turn({ conversationId: 'conversation-crash-1', turnId: 'turn-linda-1', message: 'I have a cat' }).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayedFixture.delayMilliseconds + 5));
    expect(settled).toBe(false);
    release?.(fixture(delayedFixture.responseFixture));
    await pending;
    const restored = service.abort('conversation-crash-1');
    expect(restored).toEqual(base);
    expect(restored.npcs.linda?.knowledge).toEqual([]);
  });

  test('aborting a conversation cancels its pending inference', async () => {
    let inferenceSignal: AbortSignal | undefined;
    const { service } = await serviceWith([(signal) => {
      inferenceSignal = signal;
      return new Promise<string>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }]);
    const base = createInitialState();
    await service.begin({ conversationId: 'conversation-abort-1', npcId: 'linda', state: base });
    const pending = service.turn({
      conversationId: 'conversation-abort-1', turnId: 'turn-abort-1', message: 'Tell me about the island.',
    });
    await Promise.resolve();
    expect(service.abort('conversation-abort-1')).toEqual(base);
    await expect(pending).rejects.toBeDefined();
    expect(inferenceSignal?.aborted).toBe(true);
  });

  test('structured relationship action records authored rejection only after atomic conversation commit', async () => {
    const rejected = await serviceWith([JSON.stringify({
      dialogue: 'No, I am still dealing with my current relationship.', emotion: 'wary', intent: 'end_conversation', actionId: 'ask_date',
      knowledgeCandidates: [], interestCandidateIds: [], memoryCandidates: [], unlockCandidateIds: [], highImpactCandidates: [],
    }), policyAllow]);
    const base = createInitialState();
    await rejected.service.begin({ conversationId: 'conversation-date-reject', npcId: 'linda', state: base });
    const result = await rejected.service.turn({
      conversationId: 'conversation-date-reject', turnId: 'turn-date-reject',
      message: 'Would you like to go on a date with me?',
    });
    expect(result).toEqual(expect.objectContaining({
      source: 'model',
      socialOutcome: { kind: 'relationship_stage', accepted: false, targetStage: 'dating', reasonId: 'current_relationship' },
    }));
    expect(rejected.inference.requests).toHaveLength(2);
    expect(rejected.service.abort('conversation-date-reject')).toEqual(base);
  });

  test('a structured ask is decided before the normal conversation point is staged', async () => {
    const initial = createInitialState();
    const almostReady = WorldStateSchema.parse({
      ...initial,
      npcs: {
        ...initial.npcs,
        linda: { ...initial.npcs.linda, unlockedIds: ['cats_common_interest', 'linda_relationship_resolved'] },
      },
      relationships: {
        ...initial.relationships,
        linda: {
          ...initial.relationships.linda,
          values: { familiarity: 39, trust: 35, attraction: 30 },
          stage: 'friend',
        },
      },
    });
    const { service } = await serviceWith([JSON.stringify({
      dialogue: 'No. That is not where we are.', emotion: 'wary', intent: 'end_conversation', actionId: 'ask_date',
      knowledgeCandidates: [], interestCandidateIds: [], memoryCandidates: [], unlockCandidateIds: [], highImpactCandidates: [],
    }), policyAllow]);
    await service.begin({ conversationId: 'conversation-date-floor', npcId: 'linda', state: almostReady });
    const result = await service.turn({
      conversationId: 'conversation-date-floor', turnId: 'turn-date-floor',
      message: 'Would you like to go on a date with me?',
    });
    expect(result.socialOutcome).toEqual({
      kind: 'relationship_stage', accepted: false, targetStage: 'dating', reasonId: 'relationship_requirements_unmet',
    });
    const committed = service.end('conversation-date-floor');
    expect(committed.relationships.linda).toEqual(expect.objectContaining({
      stage: 'friend', values: { familiarity: 40, trust: 36, attraction: 31 },
    }));
  });

  test('validated home invitation is deterministic, model-free, and persists on clean end', async () => {
    const initial = createInitialState();
    const ready = WorldStateSchema.parse({
      ...initial,
      npcs: {
        ...initial.npcs,
        linda: { ...initial.npcs.linda, unlockedIds: ['cats_common_interest', 'linda_relationship_resolved'] },
      },
      relationships: {
        ...initial.relationships,
        linda: {
          ...initial.relationships.linda,
          values: { familiarity: 40, trust: 35, attraction: 30 },
          stage: 'acquaintance',
        },
      },
    });
    const { inference, service } = await serviceWith([JSON.stringify({
      dialogue: 'Yes, I would like to visit your villa.', emotion: 'warm', intent: 'end_conversation', actionId: 'invite_home',
      knowledgeCandidates: [], interestCandidateIds: [], memoryCandidates: [], unlockCandidateIds: [], highImpactCandidates: [],
    }), policyAllow]);
    await service.begin({ conversationId: 'conversation-invite-accept', npcId: 'linda', state: ready });
    const result = await service.turn({
      conversationId: 'conversation-invite-accept', turnId: 'turn-invite-accept',
      message: 'Would you like to visit my villa?',
    });
    expect(result).toEqual(expect.objectContaining({
      source: 'model',
      socialOutcome: expect.objectContaining({ kind: 'home_invitation', status: 'accepted', scheduledMinute: 1_140 }),
    }));
    expect(inference.requests).toHaveLength(2);
    const committed = service.end('conversation-invite-accept');
    expect(Object.values(committed.invitations)).toEqual([
      expect.objectContaining({ npcId: 'linda', status: 'accepted', scheduledMinute: 1_140 }),
    ]);
  });

  test('structured decisions use earlier staged unlocks and cannot flip during commit', () => {
    const initial = createInitialState();
    const ready = WorldStateSchema.parse({
      ...initial,
      npcs: {
        ...initial.npcs,
        linda: { ...initial.npcs.linda, unlockedIds: ['cats_common_interest'] },
      },
      relationships: {
        ...initial.relationships,
        linda: {
          ...initial.relationships.linda,
          values: { familiarity: 40, trust: 35, attraction: 30 },
          stage: 'acquaintance',
        },
      },
    });
    const transaction = new ConversationTransaction(ready, 'conversation-preview-unlock', 'linda');
    transaction.stage({
      dialogue: 'I am ready to change that situation.', emotion: 'neutral', intent: 'continue_conversation', actionId: null,
      knowledge: [], unlockedInterestIds: [], unlockedIds: ['linda_relationship_resolved'], memories: [],
    });
    const stagedEvent = transaction.stageStructuredAction({ kind: 'home_invitation', proposedMinute: 600 });
    expect(stagedEvent).toEqual(expect.objectContaining({ type: 'home-invitation-responded', outcome: 'accepted' }));
    expect(() => transaction.stage({
      dialogue: 'Another turn.', emotion: 'neutral', intent: 'continue_conversation', actionId: null,
      knowledge: [], unlockedInterestIds: [], unlockedIds: [], memories: [],
    })).toThrow('End the conversation');
    const committed = transaction.commit();
    expect(Object.values(committed.invitations)).toEqual([
      expect.objectContaining({ status: 'accepted', scheduledMinute: 600 }),
    ]);
  });

  test('typed social intent supports natural phrasing without treating discussion as an action', () => {
    const state = createInitialState();
    for (const message of [
      'Would you like to go out with me?',
      'Can I take you on a date?',
      'Do you want to go on a date with me?',
    ]) {
      expect(detectStructuredConversationAction(message, state, 'linda')).toEqual({
        kind: 'relationship_stage', targetStage: 'dating', actionId: 'ask_date',
      });
    }
    for (const message of [
      'Would you like to visit my villa?',
      'Do you want to come over?',
      'How about visiting my home?',
    ]) {
      expect(detectStructuredConversationAction(message, state, 'linda')).toEqual({
        kind: 'home_invitation', proposedMinute: 1_140,
      });
    }
    expect(detectStructuredConversationAction('What do you think about dating on this island?', state, 'linda')).toBeUndefined();
    expect(detectStructuredConversationAction('Tell me about your villa.', state, 'linda')).toBeUndefined();

    const countered = WorldStateSchema.parse({
      ...state,
      invitations: {
        invitation_counter: {
          id: 'invitation_counter', npcId: 'linda', sourceConversationId: 'conversation_counter',
          actionId: 'invite_home', destinationLocationId: 'protagonist_villa', destinationMapId: 'northwest_residential',
          proposedMinute: 600, counterProposedMinute: 660, durationMinutes: 120,
          status: 'countered', responseReasonId: 'schedule_conflict', feedback: 'Try the later time.',
        },
      },
    });
    expect(detectStructuredConversationAction('Would you like to visit my villa?', countered, 'linda')).toEqual({
      kind: 'home_invitation', proposedMinute: 660,
    });
  });

  test('an unconventional direct request has a deterministic outcome', async () => {
    const authoritativeReply = JSON.stringify({
      dialogue: 'No, I am still dealing with my current relationship.', emotion: 'wary', intent: 'end_conversation', actionId: 'ask_date',
      knowledgeCandidates: [], interestCandidateIds: [], memoryCandidates: [], unlockCandidateIds: [], highImpactCandidates: [],
    });
    const { inference, service } = await serviceWith([authoritativeReply, policyAllow]);
    const base = createInitialState();
    await service.begin({ conversationId: 'conversation-model-intent', npcId: 'linda', state: base });
    const result = await service.turn({
      conversationId: 'conversation-model-intent', turnId: 'turn-model-intent',
      message: 'I keep thinking that you and I might be good together over dinner sometime.',
    });
    expect(result).toEqual(expect.objectContaining({
      source: 'model',
      dialogue: 'No, I am still dealing with my current relationship.',
      socialOutcome: { kind: 'relationship_stage', accepted: false, targetStage: 'dating', reasonId: 'current_relationship' },
    }));
    expect(inference.requests).toHaveLength(2);
    expect(service.abort('conversation-model-intent')).toEqual(base);
  });

  test.each([
    ['ask_date', 'What do you think about dating on this island?'],
    ['ask_date', 'Do you think we should date people from the city?'],
    ['invite_home', 'Tell me about your villa.'],
    ['invite_home', 'What makes my villa different from your home?'],
  ])('topic discussion cannot become a model-owned %s action', async (actionId, message) => {
    const attemptedAction = JSON.stringify({
      dialogue: 'I treated a topic as a request.', emotion: 'neutral', intent: 'continue_conversation', actionId,
      knowledgeCandidates: [], interestCandidateIds: [], memoryCandidates: [], unlockCandidateIds: [], highImpactCandidates: [],
    });
    const { service } = await serviceWith([attemptedAction, attemptedAction]);
    await service.begin({ conversationId: `conversation-topic-${actionId}`, npcId: 'linda', state: createInitialState() });
    const result = await service.turn({
      conversationId: `conversation-topic-${actionId}`, turnId: `turn-topic-${actionId}`, message,
    });
    expect(result.source).toBe('authored-fallback');
    const committed = service.end(`conversation-topic-${actionId}`);
    expect(committed.invitations).toEqual({});
    expect(committed.relationships.linda?.rejections).toEqual(createInitialState().relationships.linda?.rejections);
  });

  test('a combined fact and unconventional date request commits both validated paths', async () => {
    const message = 'I have a cat. Would you like to go on a date with me?';
    const recognition = JSON.stringify({
      dialogue: 'I like cats too, but I am not ready to date.', emotion: 'warm', intent: 'ask_question', actionId: 'ask_date',
      knowledgeCandidates: [{
        candidateType: 'held_belief', factId: 'protagonist_has_cat', assertedValue: true,
        sourceType: 'player_message', sourceId: 'turn-combined-social', evidenceText: 'I have a cat',
      }],
      interestCandidateIds: ['cats'],
      memoryCandidates: [{
        subjectId: 'protagonist_cat', summary: 'Linda heard the protagonist claim to have a cat.',
        importancePermille: 600, sourceId: 'turn-combined-social',
      }],
      unlockCandidateIds: ['cats_common_interest'], highImpactCandidates: [],
    });
    const authoritativeReply = JSON.stringify({
      dialogue: 'No, I am still dealing with my current relationship.', emotion: 'wary', intent: 'end_conversation', actionId: 'ask_date',
      knowledgeCandidates: [], interestCandidateIds: [], memoryCandidates: [], unlockCandidateIds: [], highImpactCandidates: [],
    });
    const { service } = await serviceWith([recognition, authoritativeReply, policyAllow]);
    await service.begin({ conversationId: 'conversation-combined-social', npcId: 'linda', state: createInitialState() });
    const result = await service.turn({
      conversationId: 'conversation-combined-social', turnId: 'turn-combined-social', message,
    });
    expect(result.stagedChangeCount).toBeGreaterThanOrEqual(6);
    const committed = service.end('conversation-combined-social');
    expect(committed.npcs.linda?.knowledge).toHaveLength(1);
    expect(committed.npcs.linda?.unlockedInterestIds).toEqual(['cats']);
    expect(committed.npcs.linda?.unlockedIds).toEqual(['cats_common_interest']);
    expect(committed.npcs.linda?.memories).toHaveLength(1);
  });

  test('a combined fact and social request keeps deterministic facts when both model proposals fail', async () => {
    const message = 'I have a cat. Would you like to go on a date with me?';
    const { service } = await serviceWith([fixture('invalid-id.json'), fixture('invalid-id.json')]);
    await service.begin({ conversationId: 'conversation-combined-fallback', npcId: 'linda', state: createInitialState() });
    const result = await service.turn({
      conversationId: 'conversation-combined-fallback', turnId: 'turn-combined-fallback', message,
    });
    expect(result).toEqual(expect.objectContaining({
      source: 'authored-structured',
      stagedChangeCount: expect.any(Number),
      socialOutcome: expect.objectContaining({ kind: 'relationship_stage', accepted: false }),
    }));
    expect(result.stagedChangeCount).toBeGreaterThanOrEqual(6);
    const committed = service.end('conversation-combined-fallback');
    expect(committed.npcs.linda?.knowledge).toHaveLength(1);
    expect(committed.npcs.linda?.unlockedInterestIds).toEqual(['cats']);
    expect(committed.npcs.linda?.unlockedIds).toEqual(['cats_common_interest']);
    expect(committed.npcs.linda?.memories).toHaveLength(1);
  });

  test('contextual prompt ideas appear only for viable branches and disappear after success', () => {
    expect(conversationPromptSuggestions(createInitialState(), 'linda')).toEqual([]);
    const initial = createInitialState();
    const viable = WorldStateSchema.parse({
      ...initial,
      npcs: {
        ...initial.npcs,
        linda: { ...initial.npcs.linda, unlockedIds: ['cats_common_interest', 'linda_relationship_resolved'] },
      },
      relationships: {
        ...initial.relationships,
        linda: {
          ...initial.relationships.linda,
          values: { familiarity: 40, trust: 35, attraction: 30 },
          stage: 'friend',
        },
      },
    });
    expect(conversationPromptSuggestions(viable, 'linda').map(({ id }) => id)).toEqual(['ask_out', 'invite_home']);
    const afterSuccess = WorldStateSchema.parse({
      ...viable,
      relationships: { ...viable.relationships, linda: { ...viable.relationships.linda, stage: 'dating' } },
      invitations: {
        successful_visit: {
          id: 'successful_visit', npcId: 'linda', sourceConversationId: 'conversation_successful_visit',
          actionId: 'invite_home', destinationLocationId: 'protagonist_villa', destinationMapId: 'northwest_residential',
          proposedMinute: 1_140, scheduledMinute: 1_140, durationMinutes: 120, status: 'completed',
          responseReasonId: 'visit_arrived', feedback: 'The visitor arrived at the villa.',
        },
      },
    });
    expect(conversationPromptSuggestions(afterSuccess, 'linda')).toEqual([]);
  });

  test('turn results refresh prompt ideas from the staged transaction preview', async () => {
    const initial = createInitialState();
    const catUnlocksDate = WorldStateSchema.parse({
      ...initial,
      npcs: {
        ...initial.npcs,
        linda: { ...initial.npcs.linda, unlockedIds: ['linda_relationship_resolved'] },
      },
      relationships: {
        ...initial.relationships,
        linda: {
          ...initial.relationships.linda,
          values: { familiarity: 40, trust: 35, attraction: 30 },
          stage: 'friend',
        },
      },
    });
    expect(conversationPromptSuggestions(catUnlocksDate, 'linda').map(({ id }) => id)).not.toContain('ask_out');
    const { service } = await serviceWith([fixture('valid-cat.json'), policyAllow]);
    await service.begin({ conversationId: 'conversation-refresh-pills', npcId: 'linda', state: catUnlocksDate });
    const result = await service.turn({
      conversationId: 'conversation-refresh-pills', turnId: 'turn-linda-1', message: 'I have a cat',
    });
    expect(result.promptSuggestions.map(({ id }) => id)).toContain('ask_out');
  });

  test('validated mutual conversation advances reachable non-romantic stages at their floors', () => {
    const initial = createInitialState();
    const acquaintanceReady = WorldStateSchema.parse({
      ...initial,
      relationships: {
        ...initial.relationships,
        linda: { ...initial.relationships.linda, values: { familiarity: 9, trust: 0, attraction: 0 } },
      },
    });
    const acquaintance = new ConversationTransaction(acquaintanceReady, 'conversation-auto-acquaintance', 'linda');
    acquaintance.stageMutualInteraction();
    expect(acquaintance.commit().relationships.linda?.stage).toBe('acquaintance');

    const friendReady = WorldStateSchema.parse({
      ...initial,
      relationships: {
        ...initial.relationships,
        linda: {
          ...initial.relationships.linda,
          values: { familiarity: 30, trust: 20, attraction: 0 },
          stage: 'acquaintance',
        },
      },
    });
    const friend = new ConversationTransaction(friendReady, 'conversation-auto-friend', 'linda');
    friend.stageMutualInteraction();
    expect(friend.commit().relationships.linda?.stage).toBe('friend');
  });

  test('ordinary validated conversations reach friend without injected relationship values', () => {
    let state = createInitialState();
    for (let index = 0; index < 25; index += 1) {
      const transaction = new ConversationTransaction(state, `conversation-natural-${index}`, 'linda');
      transaction.stageMutualInteraction();
      state = transaction.commit();
    }
    expect(state.relationships.linda).toEqual(expect.objectContaining({
      stage: 'friend',
      values: { familiarity: 30, trust: 25, attraction: 25 },
    }));
  });

  test('ambient residents use authored dialogue, no model call, no pause, and no memory', async () => {
    const { inference, service } = await serviceWith([]);
    const state = createInitialState();
    const result = await service.begin({ conversationId: 'conversation-resident-1', npcId: 'generic_resident', state });
    expect(result.kind).toBe('ambient');
    expect(result.kind === 'ambient' && result.dialogue).toBe(ambientDialogue('generic_resident', state.clock.absoluteMinute));
    expect(result.kind === 'ambient' && result.state).toEqual(state);
    expect(inference.requests).toHaveLength(0);
    expect(state.npcs.generic_resident?.memories).toEqual([]);
  });

  test('ending and aborting release active character context for later conversations', async () => {
    const { service } = await serviceWith([]);
    await service.begin({ conversationId: 'conversation-release-1', npcId: 'linda', state: createInitialState() });
    expect(service.activeSessionCount).toBe(1);
    service.abort('conversation-release-1');
    expect(service.activeSessionCount).toBe(0);
    await service.begin({ conversationId: 'conversation-release-2', npcId: 'linda', state: createInitialState() });
    service.end('conversation-release-2');
    expect(service.activeSessionCount).toBe(0);
  });

  test('transaction cannot commit ambient resident conversational memory', () => {
    expect(() => new ConversationTransaction(
      createInitialState(), 'conversation-ambient-guard', 'generic_resident',
    )).toThrow('full-AI NPC');
  });

  test('commit IDs distinguish normalized names and collisions never report success', () => {
    expect(conversationCommitEventId('conversation-a_b', 0)).not.toBe(
      conversationCommitEventId('conversation-a-b', 0),
    );
    const base = createInitialState();
    const collisionId = conversationCommitEventId('conversation-collision', base.revision);
    const collisionState = WorldStateSchema.parse({
      ...base,
      eventReceipts: [collisionId],
      eventLedger: [{
        type: 'clock-advanced', eventId: collisionId, commandId: 'command-preexisting', sequence: 0,
        absoluteMinute: base.clock.absoluteMinute, fromMinute: base.clock.absoluteMinute,
        toMinute: base.clock.absoluteMinute, consumedRealMilliseconds: 0,
      }],
    });
    const transaction = new ConversationTransaction(collisionState, 'conversation-collision', 'linda');
    expect(() => transaction.commit()).toThrow('collided');
    expect(transaction.discard()).toEqual(collisionState);
  });
});
