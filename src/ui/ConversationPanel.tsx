import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type {
  BeginConversationResult,
  ConfirmVerbalMissionGoalRequest,
  ConfirmVerbalMissionGoalResult,
  ConversationPort,
  ReadVerbalMissionTurnResult,
} from '../application/effects/ConversationPort';
import { useReducedMotion } from '../application/accessibility';
import { conversationPromptSuggestions } from '../ai/conversation/intent';
import { cueForConversationTurn, type VocalCueId } from '../audio/vocal-cue-policy';
import type { WorldState } from '../domain/state/schema';
import type { ViewportSize } from '../render/camera';
import { responsivePanelLayout, type UiScale } from '../render/responsive-layout';
import {
  authoredBeginFallback,
  conversationGenerationNote,
  conversationIdentity,
  portraitExpressionForEmotion,
  portraitExpressionForMissionReaction,
} from './conversation-feedback';
import { CharacterPortrait } from './CharacterPortrait';
import { UI_LAYER } from './ui-layers';
import { uiMetrics } from './ui-metrics';
import { VerbalMissionConfirmation, VerbalMissionFeedback } from './VerbalMissionFeedback';

type MissionRead = Extract<ReadVerbalMissionTurnResult, { kind: 'decided' }>;
type VerbalMissionSummary = NonNullable<Extract<BeginConversationResult, { kind: 'active' }>['verbalMission']>;
type Line =
  | Readonly<{ speaker: 'player' | 'npc'; text: string }>
  | Readonly<{ speaker: 'reaction'; result: MissionRead }>;
type ConversationPanelProps = Readonly<{
  accent: string;
  npcId: string;
  fixtureDisplayName?: string;
  fixtureMode?: boolean;
  locationName: string;
  port: ConversationPort;
  state: WorldState;
  onPausedState: (state: WorldState) => void;
  onStableState: (state: WorldState, committed: boolean) => void;
  onDismiss: () => void;
  onVocalCue: (cue: VocalCueId) => void;
  surface: ViewportSize;
  uiScale: UiScale;
}>;

function idPart(source: string): string {
  return source.replaceAll('_', '-').replace(/[^a-z0-9-]/gu, '-').slice(0, 28);
}

export function ConversationPanel({
  accent, npcId, fixtureDisplayName, fixtureMode = false, locationName, port, state, onPausedState, onStableState,
  onDismiss, onVocalCue, surface, uiScale,
}: ConversationPanelProps) {
  const initialState = useRef(state);
  const reducedMotion = useReducedMotion();
  const conversationId = useMemo(
    () => `conversation-${idPart(npcId)}-${initialState.current.revision}-${initialState.current.clock.absoluteMinute}`,
    [npcId],
  );
  const [displayName, setDisplayName] = useState(npcId);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<'opening' | 'ready' | 'generating' | 'reacting' | 'confirming' | 'revealing' | 'action-complete' | 'ambient' | 'failed'>('opening');
  const [reveal, setReveal] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [generationNote, setGenerationNote] = useState('OPENING CONVERSATION…');
  const [portraitExpression, setPortraitExpression] = useState<'rest' | 'joy' | 'upset'>('rest');
  const [suggestions, setSuggestions] = useState(() => conversationPromptSuggestions(initialState.current, npcId));
  const [verbalMission, setVerbalMission] = useState<VerbalMissionSummary>();
  const [missionRead, setMissionRead] = useState<MissionRead>();
  const [missionSettlement, setMissionSettlement] = useState<ConfirmVerbalMissionGoalResult>();
  const turnNumber = useRef(0);
  const active = useRef(false);
  const closing = useRef(false);
  const revealTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pendingReveal = useRef<Readonly<{ dialogue: string; nextStatus: 'ready' | 'action-complete' }> | undefined>(undefined);
  const transcriptRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const panelLayout = responsivePanelLayout(surface, uiScale);
  const metrics = uiMetrics(uiScale);

  useEffect(() => {
    if (fixtureMode) {
      setDisplayName(fixtureDisplayName ?? npcId);
      setLines([{ speaker: 'npc', text: `You made it to ${locationName}. It looks calm at this hour, but don't mistake quiet for safe.` }]);
      setSuggestions([
        { id: 'ask_out', label: 'ASK ABOUT HALCYRA', suggestedText: 'What should I know about Halcyra?' },
        { id: 'invite_home', label: 'MENTION THE WATCHER', suggestedText: 'Who was watching the villa?' },
      ]);
      setGenerationNote(`LINDA · ${locationName.toUpperCase()} · GOLDEN HOUR`);
      setPortraitExpression('upset');
      setStatus('ready');
      return undefined;
    }
    let mounted = true;
    void port.beginConversation({ conversationId, npcId, state: initialState.current }).then((result) => {
      if (!mounted) {
        if (result.kind === 'active') void port.abortConversation({ conversationId });
        return;
      }
      setDisplayName(result.displayName);
      if (result.kind === 'ambient') {
        setLines([{ speaker: 'npc', text: result.dialogue }]);
        setGenerationNote('AUTHORED AMBIENT DIALOGUE');
        setStatus('ambient');
      } else {
        active.current = true;
        onPausedState(result.pausedState);
        setLines([{ speaker: 'npc', text: result.greeting }]);
        if (result.verbalMission) {
          setVerbalMission(result.verbalMission);
          setSuggestions([]);
          setGenerationNote('VERBAL MISSION READY');
        } else {
          setGenerationNote('READY TO TALK');
        }
        setStatus('ready');
      }
      onVocalCue('greeting');
    }).catch(() => {
      if (mounted) {
        const fallback = authoredBeginFallback(npcId);
        setDisplayName(fallback.displayName);
        setLines([{ speaker: 'npc', text: fallback.dialogue }]);
        setGenerationNote('CONVERSATION OPENED WITH A SAFE REPLY');
        setStatus('ambient');
        onVocalCue('sigh');
      }
    });
    return () => {
      mounted = false;
      if (revealTimer.current) clearInterval(revealTimer.current);
      if (active.current && !closing.current) void port.abortConversation({ conversationId });
    };
  }, [conversationId, fixtureDisplayName, fixtureMode, locationName, npcId, onPausedState, onVocalCue, port]);

  useEffect(() => {
    if (status === 'ready') inputRef.current?.focus();
  }, [status]);

  const finishReveal = () => {
    const pending = pendingReveal.current;
    if (!pending) return;
    if (revealTimer.current) clearInterval(revealTimer.current);
    revealTimer.current = undefined;
    pendingReveal.current = undefined;
    setLines((current) => [...current, { speaker: 'npc', text: pending.dialogue }]);
    setReveal('');
    setStatus(pending.nextStatus);
  };

  const showReply = (dialogue: string, nextStatus: 'ready' | 'action-complete') => {
    if (reducedMotion) {
      setLines((current) => [...current, { speaker: 'npc', text: dialogue }]);
      setStatus(nextStatus);
      return;
    }
    setStatus('revealing');
    setReveal('');
    pendingReveal.current = { dialogue, nextStatus };
    let index = 0;
    if (revealTimer.current) clearInterval(revealTimer.current);
    revealTimer.current = setInterval(() => {
      index += 1;
      setReveal(dialogue.slice(0, index));
      if (index >= dialogue.length) finishReveal();
    }, 12);
  };

  const sendMessage = async (message: string) => {
    if (!active.current || status !== 'ready' || !message) return;
    turnNumber.current += 1;
    const turnId = `turn-${idPart(npcId)}-${turnNumber.current}`;
    setConfirmDiscard(false);
    setDraft('');
    setLines((current) => [...current, { speaker: 'player', text: message }]);
    setStatus('generating');
    let missionOutcomeDecided = false;
    try {
      if (verbalMission) {
        const [read] = await Promise.all([
          port.readVerbalMissionTurn({ conversationId, turnId, message }),
          new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 180)),
        ]);
        if (read.kind === 'clarify') {
          setLines((current) => [...current, { speaker: 'npc', text: read.dialogue }]);
          setGenerationNote('A CLEARER REQUEST IS NEEDED');
          setStatus('ready');
          return;
        }
        missionOutcomeDecided = true;
        setMissionRead(read);
        setLines((current) => [...current, { speaker: 'reaction', result: read }]);
        setPortraitExpression(portraitExpressionForMissionReaction(read.portraitId));
        if (read.cueId) onVocalCue(read.cueId);
        setGenerationNote('REACTION SHOWN · REPLY PENDING');
        setStatus('reacting');
        await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
        const reply = await port.completeVerbalMissionTurn({ conversationId, turnId });
        setGenerationNote(conversationGenerationNote(reply.source));
        showReply(reply.dialogue, 'ready');
        return;
      }
      const [result] = await Promise.all([
        port.sendConversationTurn({ conversationId, turnId, message }),
        new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 180)),
      ]);
      setGenerationNote(conversationGenerationNote(result.source));
      setPortraitExpression(portraitExpressionForEmotion(result.emotion));
      const cue = cueForConversationTurn(result);
      if (cue) onVocalCue(cue);
      setSuggestions(result.promptSuggestions);
      showReply(result.dialogue, result.intent === 'end_conversation' ? 'action-complete' : 'ready');
    } catch {
      if (verbalMission && missionOutcomeDecided) {
        setGenerationNote('REACTION SAVED · REPLY UNAVAILABLE');
        setStatus('action-complete');
        return;
      }
      setLines((current) => [...current, { speaker: 'npc', text: 'I cannot talk right now.' }]);
      setGenerationNote('SAFE REPLY USED');
      onVocalCue('sigh');
      setStatus('ready');
    }
  };

  const send = async () => {
    const message = draft.trim();
    if (!message) return;
    setDraft('');
    await sendMessage(message);
  };

  const confirmMission = async () => {
    const confirmation = missionRead?.confirmation;
    if (!confirmation || status !== 'ready') return;
    const request: ConfirmVerbalMissionGoalRequest = confirmation.goalKind === 'disclose_fact'
      ? { conversationId, goalKind: confirmation.goalKind }
      : confirmation.goalKind === 'buy_object'
        ? { conversationId, goalKind: confirmation.goalKind, confirmedAmount: confirmation.confirmedAmount }
        : { conversationId, goalKind: confirmation.goalKind, scheduledMinute: confirmation.scheduledMinute };
    setStatus('confirming');
    setGenerationNote('CHECKING FINAL TERMS…');
    try {
      const result = await port.confirmVerbalMissionGoal(request);
      setMissionSettlement(result);
      setGenerationNote(result.kind === 'confirmed' ? 'OUTCOME RECORDED' : 'FINAL ACTION NOT RECORDED');
      setStatus('action-complete');
      if (result.kind === 'confirmed') onVocalCue('consequence');
    } catch {
      setGenerationNote('CONFIRMATION DELIVERY FAILED · TRY AGAIN');
      setStatus('ready');
    }
  };

  const close = async (commit: boolean) => {
    if (closing.current) return;
    closing.current = true;
    if (revealTimer.current) {
      clearInterval(revealTimer.current);
      revealTimer.current = undefined;
    }
    pendingReveal.current = undefined;
    try {
      if (active.current) {
        const result = commit
          ? await port.endConversation({ conversationId })
          : await port.abortConversation({ conversationId });
        active.current = false;
        onStableState(result.state, commit);
      }
    } finally {
      onDismiss();
    }
  };

  const cancel = () => {
    if (verbalMission) {
      void close(missionRead !== undefined || missionSettlement !== undefined);
      return;
    }
    if (active.current && turnNumber.current > 0 && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    void close(false);
  };
  const stateNpcId = npcId.replaceAll('-', '_');
  const relationship = state.relationships[stateNpcId];
  const activity = state.npcs[stateNpcId]?.scheduleGoal?.activityId.replaceAll('_', ' ') ?? 'present';
  const identity = conversationIdentity(npcId, locationName);
  const missionBusy = verbalMission !== undefined && ['generating', 'reacting', 'confirming', 'revealing'].includes(status);
  const headerActionLabel = missionSettlement ? 'END' : verbalMission && missionRead ? 'WALK AWAY' : confirmDiscard ? 'DISCARD?' : 'CANCEL';
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (!missionBusy) cancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [missionBusy, cancel]);

  return (
    <View nativeID="world-ui-conversation-overlay" style={styles.overlay}>
      <View
        accessibilityLabel={`Conversation with ${displayName}`}
        nativeID="world-ui-conversation-panel"
        style={[styles.panel, { borderColor: accent, height: Math.min(panelLayout.height, Math.round(540 * uiScale)), padding: metrics.padding, width: panelLayout.width }]}
      >
        <View style={[styles.accentRule, { backgroundColor: accent }]} />
        <View style={styles.header}>
          <View style={styles.headerIdentity}>
            <View style={[styles.portraitFrame, { borderColor: accent }]}><CharacterPortrait displayName={displayName} expression={portraitExpression} npcId={npcId} scale={3} /></View>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { fontSize: metrics.secondaryText }]}>{verbalMission ? 'VERBAL MISSION' : 'CONVERSATION'}{active.current ? ' · TIME PAUSED' : ''}</Text>
              <Text style={[styles.name, { color: accent, fontSize: metrics.titleText }]}>{displayName.toUpperCase()}</Text>
              <View style={styles.identityRow}>
                {verbalMission ? (
                  <>
                    <Text style={styles.identityChip}>{verbalMission.goalKind.replaceAll('_', ' ').toUpperCase()}</Text>
                    <Text style={styles.identityChip}>ROOM {(missionRead?.roomState ?? verbalMission.roomState).toUpperCase()}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.identityChip}>{identity.role}</Text>
                    <Text style={styles.identityChip}>{relationship?.stage.toUpperCase() ?? 'RESIDENT'}</Text>
                    <Text style={styles.identityChip}>{activity.toUpperCase()}</Text>
                  </>
                )}
              </View>
              <Text style={styles.knownFact}>KNOWN · {identity.fact}</Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel={missionSettlement ? 'End conversation' : verbalMission && missionRead ? 'Walk away and save this reaction' : 'Cancel conversation'}
            accessibilityState={{ disabled: missionBusy }}
            disabled={missionBusy}
            onPress={missionSettlement ? () => void close(true) : cancel}
            role="button"
            style={({ pressed }) => [styles.smallButton, { minHeight: metrics.pointerTarget }, pressed && styles.buttonPressed, missionBusy && styles.disabled]}
          >
            <Text style={[styles.smallButtonText, { fontSize: metrics.secondaryText }]}>{headerActionLabel}</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[styles.transcriptContent, { padding: metrics.padding }]}
          nativeID="conversation-transcript"
          onContentSizeChange={() => transcriptRef.current?.scrollToEnd({ animated: false })}
          ref={transcriptRef}
          style={styles.transcript}
        >
          <View style={styles.sceneLine}>
            <Text style={[styles.sceneLabel, { color: accent }]}>SCENE</Text>
            <Text style={[styles.sceneText, { fontSize: metrics.secondaryText, lineHeight: Math.round(metrics.secondaryText * 1.5) }]}>MEETING AT {locationName.toUpperCase()} · {portraitExpression.toUpperCase()}</Text>
            <Text accessibilityElementsHidden nativeID="conversation-model-status" style={styles.modelStatus}>{generationNote}</Text>
          </View>
          {lines.map((line, index) => line.speaker === 'reaction' ? (
            <VerbalMissionFeedback accent={accent} key={`${line.speaker}-${index}`} result={line.result} uiScale={uiScale} />
          ) : (
            <View key={`${line.speaker}-${index}`} style={[styles.lineCard, line.speaker === 'npc' ? styles.npcCard : styles.playerCard]}>
              <Text style={styles.speaker}>{line.speaker === 'npc' ? displayName.toUpperCase() : 'YOU'}</Text>
              <Text
                style={[
                  line.speaker === 'npc' ? styles.npcLine : styles.playerLine,
                  { fontSize: metrics.conversationText, lineHeight: Math.round(metrics.conversationText * 1.5) },
                ]}
              >
                {line.text}
              </Text>
            </View>
          ))}
          {status === 'generating' ? <Text accessibilityLabel="NPC is thinking" style={[styles.thinking, { fontSize: metrics.conversationText }]}>●  ●  ●</Text> : null}
          {status === 'reacting' ? <Text accessibilityLabel="NPC is preparing a reply" style={[styles.thinking, { fontSize: metrics.conversationText }]}>FINDING THE WORDS…</Text> : null}
          {status === 'revealing' ? (
            <Pressable accessibilityLabel="Show full reply" onPress={finishReveal} role="button">
              <Text style={[styles.npcLine, { fontSize: metrics.conversationText, lineHeight: Math.round(metrics.conversationText * 1.5) }]}>{displayName}: {reveal}</Text>
            </Pressable>
          ) : null}
          {missionRead?.confirmation ? (
            <VerbalMissionConfirmation
              accent={accent}
              busy={status !== 'ready'}
              busyLabel={status === 'confirming' ? 'CHECKING TERMS…' : 'WAIT FOR REPLY…'}
              confirmation={missionRead.confirmation}
              onConfirm={() => void confirmMission()}
              settlement={missionSettlement}
              uiScale={uiScale}
            />
          ) : null}
          {status === 'failed' ? <Text style={[styles.error, { fontSize: metrics.panelText }]}>CONVERSATION COULD NOT START</Text> : null}
        </ScrollView>
        {status === 'ambient' || status === 'failed' ? (
          <Pressable accessibilityLabel="Close dialogue" onPress={() => void close(false)} role="button" style={({ pressed }) => [styles.endButton, { minHeight: metrics.primaryControl }, pressed && styles.buttonPressed]}>
            <Text style={[styles.endText, { fontSize: metrics.persistentText }]}>CLOSE</Text>
          </Pressable>
        ) : (
          status === 'action-complete' ? (
            <View style={styles.actionCompleteRow}>
              <Text style={[styles.actionComplete, { fontSize: metrics.secondaryText }]}>
                {verbalMission
                  ? missionSettlement?.kind === 'confirmed'
                    ? 'OUTCOME RECORDED · END TO RETURN TO THE WORLD'
                    : missionSettlement?.kind === 'rejected'
                      ? 'FINAL ACTION NOT RECORDED · PROGRESS SAVED'
                      : 'REACTION SAVED · END TO RETURN TO THE WORLD'
                  : 'ACTION RECORDED · END OR CANCEL THIS CONVERSATION'}
              </Text>
              <Pressable accessibilityLabel="End conversation" onPress={() => void close(true)} role="button" style={({ pressed }) => [styles.endButton, { minHeight: metrics.primaryControl }, pressed && styles.buttonPressed]}>
                <Text style={[styles.endText, { fontSize: metrics.persistentText }]}>END</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.responseLabel}>{verbalMission ? 'YOUR WORDS · SAY IT YOUR WAY' : 'YOUR RESPONSE · CHOOSE OR WRITE FREELY'}</Text>
              {suggestions.length > 0 ? <View nativeID="conversation-prompt-suggestions" style={styles.actionRow}>
                {suggestions.map((suggestion) => (
                  <Pressable
                    accessibilityLabel={`Use ${suggestion.label.toLowerCase()} prompt idea`}
                    disabled={status !== 'ready'}
                    key={suggestion.id}
                    onPress={() => setDraft(suggestion.suggestedText)}
                    role="button"
                    style={({ pressed }) => [styles.actionButton, { minHeight: metrics.pointerTarget }, draft === suggestion.suggestedText && { borderColor: accent, borderWidth: 2 }, pressed && styles.buttonPressed, status !== 'ready' && styles.disabled]}
                  >
                    <Text style={[styles.actionText, { color: draft === suggestion.suggestedText ? accent : '#e2bf76', fontSize: metrics.secondaryText }]}>{suggestion.label}</Text>
                  </Pressable>
                ))}
              </View> : null}
              <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel="Conversation message"
                editable={status === 'ready'}
                maxLength={500}
                onChangeText={setDraft}
                onSubmitEditing={() => void send()}
                placeholder="TYPE WHAT YOU WANT TO SAY…"
                placeholderTextColor="#7e6f5b"
                ref={inputRef}
                style={[styles.input, { fontSize: metrics.conversationText, minHeight: metrics.primaryControl }]}
                value={draft}
              />
              <Pressable accessibilityLabel="Send conversation message" disabled={status !== 'ready' || draft.trim().length === 0} onPress={() => void send()} role="button" style={({ pressed }) => [styles.sendButton, { minHeight: metrics.primaryControl }, pressed && styles.buttonPressed, (status !== 'ready' || draft.trim().length === 0) && styles.disabled]}>
                <Text style={[styles.sendText, { fontSize: metrics.persistentText }]}>SAY</Text>
              </Pressable>
              <Pressable accessibilityLabel="End conversation" disabled={missionBusy || status === 'generating' || status === 'revealing'} onPress={() => void close(true)} role="button" style={({ pressed }) => [styles.endButton, { minHeight: metrics.primaryControl }, pressed && styles.buttonPressed, (missionBusy || status === 'generating' || status === 'revealing') && styles.disabled]}>
                <Text style={[styles.endText, { fontSize: metrics.persistentText }]}>END</Text>
              </Pressable>
              </View>
            </>
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  accentRule: { height: 3, left: 0, position: 'absolute', right: 0, top: 0 },
  actionComplete: { color: '#e2bf76', fontFamily: 'Silkscreen', fontSize: 8, marginTop: 12 },
  actionCompleteRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  actionButton: { borderColor: '#8b6846', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  actionText: { color: '#e2bf76', fontFamily: 'Silkscreen', fontSize: 8 },
  buttonPressed: { opacity: 0.78, transform: [{ translateY: 2 }] },
  endButton: { alignItems: 'center', backgroundColor: '#6f4931', borderColor: '#d6a45d', borderWidth: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: 14 },
  endText: { color: '#fff0c7', fontFamily: 'Silkscreen', fontSize: 9 },
  disabled: { opacity: 0.4 },
  error: { color: '#ef725b', fontFamily: 'Silkscreen', fontSize: 10 },
  eyebrow: { color: '#c89b5e', fontFamily: 'Silkscreen', fontSize: 8 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerCopy: { flexShrink: 1, marginLeft: 12 },
  headerIdentity: { alignItems: 'center', flexDirection: 'row', flexShrink: 1 },
  identityChip: { borderColor: '#66513b', borderWidth: 1, color: '#b7a080', fontFamily: 'Silkscreen', fontSize: 7, paddingHorizontal: 6, paddingVertical: 3 },
  identityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  input: { backgroundColor: '#181512', borderColor: '#76573d', borderWidth: 1, color: '#fff0c7', flex: 1, fontFamily: 'Silkscreen', fontSize: 10, minHeight: 38, paddingHorizontal: 10 },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  name: { color: '#f1c65b', fontFamily: 'Silkscreen', fontSize: 18, marginTop: 3 },
  lineCard: { borderLeftWidth: 3, marginBottom: 10, maxWidth: '88%', paddingHorizontal: 12, paddingVertical: 10 },
  knownFact: { color: '#c3b18f', fontFamily: 'Silkscreen', fontSize: 8, marginTop: 7 },
  modelStatus: { display: 'none' },
  npcCard: { alignSelf: 'flex-start', backgroundColor: '#29231b', borderLeftColor: '#c58b4b' },
  npcLine: { color: '#fff0c7', fontFamily: 'Silkscreen', fontSize: 10, lineHeight: 17, marginBottom: 8 },
  overlay: { alignItems: 'center', backgroundColor: '#100d0acc', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0, zIndex: UI_LAYER.conversation },
  panel: { backgroundColor: '#252019', borderColor: '#c58b4b', borderWidth: 2, shadowColor: '#090704', shadowOffset: { height: 12, width: 12 }, shadowOpacity: 0.7, shadowRadius: 0 },
  playerLine: { color: '#9fc58e', fontFamily: 'Silkscreen', fontSize: 10, lineHeight: 17, marginBottom: 8 },
  playerCard: { alignSelf: 'flex-end', backgroundColor: '#1d2820', borderLeftColor: '#78a77b' },
  portraitFrame: { borderWidth: 2, height: 138, padding: 1, width: 126 },
  responseLabel: { color: '#7f6d55', fontFamily: 'Silkscreen', fontSize: 7, letterSpacing: 0.5, marginTop: 10 },
  sendButton: { alignItems: 'center', backgroundColor: '#d3a04c', justifyContent: 'center', minHeight: 38, paddingHorizontal: 16 },
  sendText: { color: '#211d1a', fontFamily: 'Silkscreen', fontSize: 10 },
  sceneLabel: { fontFamily: 'Silkscreen', fontSize: 7, marginRight: 8 },
  sceneLine: { alignItems: 'center', flexDirection: 'row', marginBottom: 12 },
  sceneText: { color: '#9d8768', flex: 1, fontFamily: 'Silkscreen', fontSize: 9, lineHeight: 15 },
  smallButton: { borderColor: '#76573d', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  smallButtonText: { color: '#c3b18f', fontFamily: 'Silkscreen', fontSize: 8 },
  speaker: { color: '#9d8768', fontFamily: 'Silkscreen', fontSize: 7, marginBottom: 5 },
  thinking: { color: '#f1c65b', fontFamily: 'Silkscreen', fontSize: 10, letterSpacing: 5 },
  transcript: { backgroundColor: '#181512', borderColor: '#493b2d', borderWidth: 1, flex: 1, marginTop: 12, minHeight: 96 },
  transcriptContent: { flexGrow: 1 },
});
