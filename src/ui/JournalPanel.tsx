import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ContextQuestAction } from '../domain/quests/quest-machine';
import type { WorldState } from '../domain/state/schema';
import type { ViewportSize } from '../render/camera';
import { responsivePanelLayout, responsiveSideSheetWidth, type UiScale } from '../render/responsive-layout';
import { CharacterPortrait } from './CharacterPortrait';
import { questActionCopy } from './quest-action-copy';
import { actionCheckPreview } from './action-check-copy';
import { UI_LAYER } from './ui-layers';
import { uiMetrics } from './ui-metrics';

type JournalPanelProps = Readonly<{
  accent: string;
  actions: readonly ContextQuestAction[];
  contextActions: readonly ContextQuestAction[];
  state: WorldState;
  onAction: (actionId: ContextQuestAction['id']) => void;
  onDismiss: () => void;
  onPurchaseSecurityReport: () => void;
  onAdvancePolice: () => void;
  surface: ViewportSize;
  uiScale: UiScale;
  actionsDisabled?: boolean;
}>;

function label(id: string): string {
  return id.replaceAll('_', ' ').toUpperCase();
}

function timeLabel(absoluteMinute: number): string {
  const day = Math.floor(absoluteMinute / 1_440) + 1;
  const time = absoluteMinute % 1_440;
  return `DAY ${day} ${Math.floor(time / 60).toString().padStart(2, '0')}:${(time % 60).toString().padStart(2, '0')}`;
}

function sourceLabel(source: WorldState['journal'][string]['source']): string {
  return `${source.type.replaceAll('_', ' ')} · ${label(source.sourceId)}`;
}

function locationLabel(entry: WorldState['journal'][string]): string {
  if (entry.locationPrecision === 'exact') return label(entry.locationId ?? 'confirmed location');
  return entry.locationPrecision === 'vague' ? 'SEARCH AREA' : 'LOCATION UNKNOWN';
}

function caseContact(entry: WorldState['journal'][string]): Readonly<{ id: string; name: string }> {
  return entry.subject.kind === 'quest' && entry.subject.questId === 'linda_boyfriend_check'
    ? { id: 'linda', name: 'LINDA' }
    : { id: entry.source.sourceId, name: label(entry.source.sourceId) };
}

function questTitle(entry: WorldState['journal'][string]): string {
  return entry.subject.kind === 'quest' && entry.subject.questId === 'linda_boyfriend_check'
    ? "CHECK ON LINDA'S BOYFRIEND"
    : entry.subject.kind === 'quest' ? label(entry.subject.questId) : entry.summary.toUpperCase();
}

export function JournalPanel({ accent, actions, actionsDisabled = false, contextActions, state, onAction, onDismiss, onPurchaseSecurityReport, onAdvancePolice, surface, uiScale }: JournalPanelProps) {
  const entries = Object.values(state.journal);
  const questEntries = entries.filter((entry) => entry.subject.kind === 'quest');
  const invitations = Object.values(state.invitations);
  const purchased = state.quests.linda_boyfriend_check?.flagIds.includes('security_report_purchased') ?? false;
  const policeAction = state.policeAttention === 'noticed'
    ? { label: 'Answer police questions', result: 'Attention becomes QUESTIONED. Evidence becomes linked.' }
    : state.policeAttention === 'questioned'
      ? { label: 'Ignore police summons', result: 'Attention becomes WANTED.' }
      : state.policeAttention === 'wanted'
        ? { label: 'Trigger wanted encounter', result: 'Attention becomes ARREST-ON-SIGHT.' }
        : undefined;
  const panelLayout = responsivePanelLayout(surface, uiScale);
  const docked = !panelLayout.compact;
  const metrics = uiMetrics(uiScale);
  const bodyText = { fontSize: metrics.panelText, lineHeight: Math.round(metrics.panelText * 1.45) };
  return (
    <View nativeID="world-ui-journal-overlay" style={[styles.overlay, docked && styles.overlayDocked]}>
      <View
        accessibilityLabel="Quests"
        nativeID="world-ui-journal-panel"
        style={[
          styles.panel,
          docked && styles.panelDocked,
          {
            borderColor: accent,
            height: docked ? surface.height : panelLayout.height,
            padding: metrics.padding,
            width: docked ? responsiveSideSheetWidth(surface, uiScale) : panelLayout.width,
          },
        ]}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { fontSize: metrics.secondaryText }]}>PRIVATE CASEBOARD · Q</Text>
            <Text style={[styles.title, { color: accent, fontSize: metrics.titleText }]}>QUESTS</Text>
          </View>
          <Pressable accessibilityLabel="Close quests" disabled={actionsDisabled} nativeID="world-close-quests" onPress={onDismiss} role="button" style={[styles.close, { minHeight: metrics.pointerTarget }, actionsDisabled && styles.questActionDisabled]}>
            <Text style={[styles.closeText, { fontSize: metrics.secondaryText }]}>CLOSE</Text>
          </Pressable>
        </View>
        <View style={styles.summary}>
          <View style={styles.summaryItem}><Text style={[styles.summaryValue, bodyText]}>{questEntries.length}</Text><Text style={[styles.summaryLabel, { fontSize: metrics.secondaryText }]}>QUESTS</Text></View>
          <View style={styles.summaryItem}><Text style={[styles.summaryValue, bodyText]}>{invitations.length}</Text><Text style={[styles.summaryLabel, { fontSize: metrics.secondaryText }]}>VISITS</Text></View>
          <View style={styles.summaryItem}><Text style={[styles.summaryValue, bodyText]}>{Object.keys(state.evidence).length}</Text><Text style={[styles.summaryLabel, { fontSize: metrics.secondaryText }]}>EVIDENCE</Text></View>
        </View>
        <ScrollView contentContainerStyle={styles.body} style={styles.bodyScroll}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.section, bodyText]}>ACCEPTED QUESTS</Text>
          <Text style={[styles.caseNumber, { fontSize: metrics.secondaryText }]}>HALCYRA CASEBOARD</Text>
        </View>
        {entries.length === 0 ? <Text style={[styles.muted, bodyText]}>NO QUESTS ACCEPTED YET</Text> : entries.map((entry, index) => {
          const contact = caseContact(entry);
          const questNumber = entry.subject.kind === 'quest'
            ? questEntries.findIndex((candidate) => candidate.id === entry.id) + 1
            : 0;
          const entryActions = entry.subject.kind === 'quest' && entry.subject.questId === 'linda_boyfriend_check'
            ? actions.filter(({ id }) => id !== 'start')
            : [];
          return <View key={entry.id} style={[styles.card, { borderLeftColor: accent }]}>
            <View style={[styles.casePin, { backgroundColor: accent }]} />
            <Text style={[styles.leadIndex, { color: accent }]}>
              {questNumber > 0 ? `QUEST ${String(questNumber).padStart(2, '0')}` : `LEAD ${String(index + 1).padStart(2, '0')}`}
            </Text>
            <View style={styles.leadHeader}>
              <View>
                <CharacterPortrait displayName={contact.name} npcId={contact.id} />
                <Text style={[styles.contactLabel, { backgroundColor: accent }]}>{contact.name}</Text>
              </View>
              <View style={styles.leadIdentity}>
                <Text style={[styles.source, { fontSize: metrics.secondaryText }]}>REQUESTED BY {contact.name}</Text>
                <Text style={styles.sourceProof}>{sourceLabel(entry.source)}</Text>
                <Text style={[styles.cardTitle, bodyText]}>{questTitle(entry)}</Text>
                {entry.subject.kind === 'quest' ? <Text style={[styles.objective, bodyText]}>{entry.summary}</Text> : null}
                <View style={styles.stamps}>
                  <Text style={[styles.stamp, { borderColor: accent, color: accent }]}>{entry.resolutionState.toUpperCase()}</Text>
                  <Text style={styles.stamp}>{entry.locationPrecision.toUpperCase()}</Text>
                </View>
              </View>
            </View>
            <View style={styles.evidenceConnector} />
            <View style={styles.leadEvidence}>
              <View style={styles.locationThumbnail}>
                <View style={styles.thumbnailStreet} />
                <View style={styles.thumbnailBuilding} />
                <View style={[styles.thumbnailPin, { backgroundColor: accent }]} />
                <Text style={styles.thumbnailLabel}>{locationLabel(entry)}</Text>
              </View>
              <View style={styles.leadMeta}>
                <Text style={[styles.metaLabel, { fontSize: metrics.secondaryText }]}>LOCATION</Text>
                <Text style={[styles.detail, bodyText]}>{locationLabel(entry)}{entry.markerVisible ? ' · PINNED' : ''}</Text>
                <Text style={[styles.metaLabel, { fontSize: metrics.secondaryText }]}>DEADLINE</Text>
                <Text style={[entry.deadlineMinute === undefined ? styles.muted : styles.deadline, bodyText]}>
                  {entry.deadlineMinute === undefined ? 'OPEN-ENDED · NO DEADLINE' : timeLabel(entry.deadlineMinute)}
                </Text>
              </View>
            </View>
            <View style={styles.consequenceRow}>
              <Text style={styles.consequenceLabel}>CONSEQUENCES</Text>
              {([
                ['R', label(state.relationships[contact.id]?.stage ?? 'unknown')],
                ['P', state.policeAttention.toUpperCase()],
                ['E', String(Object.keys(state.evidence).length)],
              ] as const).map(([icon, value]) => (
                <View key={icon} style={styles.consequenceStamp}>
                  <Text style={[styles.consequenceIcon, { backgroundColor: accent }]}>{icon}</Text>
                  <Text style={styles.consequenceText}>{value}</Text>
                </View>
              ))}
            </View>
            {entryActions.length > 0 ? (
              <View style={[styles.questActions, { borderLeftColor: accent }]}>
                <Text style={[styles.questActionsTitle, { color: accent }]}>QUEST ACTIONS</Text>
                {entryActions.map((action) => {
                  const copy = questActionCopy(action, state.protagonist.displayName);
                  const check = actionCheckPreview(action);
                  return <View key={action.id} style={styles.questAction}>
                    <Pressable
                      accessibilityHint={check?.accessibilityText ?? [copy.result, action.socialConsequence, action.routeConsequence].join('. ')}
                      accessibilityLabel={action.label}
                      disabled={!action.enabled || actionsDisabled}
                      nativeID={`world-quest-action-${action.id.replaceAll('_', '-')}`}
                      onPress={() => onAction(action.id)}
                      role="button"
                      style={({ pressed }) => [styles.questActionButton, { minHeight: metrics.pointerTarget }, (!action.enabled || actionsDisabled) && styles.questActionDisabled, pressed && styles.questActionPressed]}
                    >
                      <Text style={[styles.questActionButtonText, { fontSize: metrics.secondaryText }]}>{action.label.toUpperCase()}</Text>
                    </Pressable>
                    <Text style={[styles.actionLine, bodyText]}>ACTION · {copy.action}</Text>
                    {check ? <>
                      <Text style={[styles.actionReadiness, bodyText]}>ACTION CHECK · 2d6 + {check.modifier} VS {check.target}</Text>
                      <Text style={[styles.actionReadiness, bodyText]}>{check.chance}</Text>
                      <Text style={[styles.actionSocial, bodyText]}>{check.successStakes}</Text>
                      <Text style={[styles.actionRoute, bodyText]}>{check.failureStakes}</Text>
                    </> : <>
                      <Text style={[styles.actionLine, bodyText]}>RESULT · {copy.result}</Text>
                      <Text style={[styles.actionSocial, bodyText]}>SOCIAL · {action.socialConsequence}</Text>
                      <Text style={[styles.actionRoute, bodyText]}>ROUTE · {action.routeConsequence}</Text>
                    </>}
                    {action.disabledReason ? <Text style={[styles.actionDisabledReason, bodyText]}>{action.disabledReason.toUpperCase()}</Text> : null}
                  </View>;
                })}
              </View>
            ) : null}
          </View>
        })}
        {contextActions.length > 0 ? (
          <View style={styles.contextActions}>
            <Text style={[styles.section, bodyText]}>VERBAL MISSION ACTIONS</Text>
            {contextActions.map((action) => {
              const copy = questActionCopy(action, state.protagonist.displayName);
              return <View key={action.id} style={styles.questAction}>
                <Pressable
                  accessibilityLabel={action.label}
                  disabled={!action.enabled || actionsDisabled}
                  onPress={() => onAction(action.id)}
                  role="button"
                  style={({ pressed }) => [styles.questActionButton, { minHeight: metrics.pointerTarget }, (!action.enabled || actionsDisabled) && styles.questActionDisabled, pressed && styles.questActionPressed]}
                >
                  <Text style={[styles.questActionButtonText, { fontSize: metrics.secondaryText }]}>{action.label.toUpperCase()}</Text>
                </Pressable>
                <Text style={[styles.actionLine, bodyText]}>ACTION · {copy.action}</Text>
                <Text style={[styles.actionLine, bodyText]}>RESULT · {copy.result}</Text>
              </View>;
            })}
          </View>
        ) : null}
        <Text style={[styles.section, bodyText]}>HOME INVITATIONS</Text>
        {invitations.length === 0 ? <Text style={[styles.muted, bodyText]}>NO VISITS SCHEDULED</Text> : invitations.map((invitation) => (
          <Text key={invitation.id} style={[styles.detail, bodyText]}>
            {label(invitation.npcId)} · {invitation.status.toUpperCase()}
            {invitation.scheduledMinute !== undefined ? ` · ${timeLabel(invitation.scheduledMinute)}` : ''}
            {invitation.counterProposedMinute !== undefined ? ` · COUNTER ${timeLabel(invitation.counterProposedMinute)}` : ''}
          </Text>
        ))}
        <Text style={[styles.section, bodyText]}>OPTIONAL PREPARATION</Text>
        <Pressable
          accessibilityLabel="Buy villa security report"
          disabled={actionsDisabled || purchased || state.inventory.money < 60}
          onPress={onPurchaseSecurityReport}
          role="button"
          style={[styles.purchase, { minHeight: metrics.pointerTarget }, purchased && styles.purchaseDone, actionsDisabled && styles.questActionDisabled]}
        >
          <Text style={[styles.purchaseText, bodyText]}>{purchased ? 'SECURITY REPORT PURCHASED' : 'BUY VILLA SECURITY REPORT · $60'}</Text>
        </Pressable>
        <Text style={[styles.section, bodyText]}>CONSEQUENCES</Text>
        <Text style={[styles.detail, bodyText]}>POLICE · {state.policeAttention.toUpperCase()}</Text>
        <Text style={[styles.detail, bodyText]}>EVIDENCE · {Object.keys(state.evidence).length}</Text>
        {policeAction ? (
          <Pressable accessibilityLabel={policeAction.label} disabled={actionsDisabled} onPress={onAdvancePolice} role="button" style={[styles.policeAction, { minHeight: metrics.pointerTarget }, actionsDisabled && styles.questActionDisabled]}>
            <Text style={[styles.purchaseText, bodyText]}>{policeAction.label.toUpperCase()}</Text>
            <Text style={[styles.detail, bodyText]}>{policeAction.result}</Text>
          </Pressable>
        ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionDisabledReason: { color: '#e07a62', fontFamily: 'Silkscreen', marginTop: 5 },
  actionLine: { color: '#c3b18f', fontFamily: 'Silkscreen', marginTop: 5 },
  actionReadiness: { color: '#f1c65b', fontFamily: 'Silkscreen', marginTop: 5 },
  actionRoute: { color: '#d6a45d', fontFamily: 'Silkscreen', marginTop: 5 },
  actionSocial: { color: '#8fc59a', fontFamily: 'Silkscreen', marginTop: 5 },
  card: { backgroundColor: '#10130f', borderLeftColor: '#d3a04c', borderLeftWidth: 3, marginTop: 8, padding: 10 },
  body: { paddingBottom: 18 },
  bodyScroll: { flex: 1, minHeight: 0 },
  cardTitle: { color: '#fff0c7', fontFamily: 'Silkscreen', fontSize: 9 },
  caseNumber: { color: '#756a58', fontFamily: 'Silkscreen' },
  casePin: { borderColor: '#fff0c7', borderRadius: 4, borderWidth: 1, height: 8, position: 'absolute', right: 9, top: 9, width: 8 },
  close: { backgroundColor: '#10130f', borderColor: '#76573d', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  closeText: { color: '#c3b18f', fontFamily: 'Silkscreen', fontSize: 8 },
  detail: { color: '#bda77e', fontFamily: 'Silkscreen', fontSize: 8, marginTop: 6 },
  deadline: { color: '#f0b36c', fontFamily: 'Silkscreen', marginTop: 4 },
  evidenceConnector: { borderLeftColor: '#5b4d3a', borderLeftWidth: 1, height: 10, marginLeft: 40 },
  eyebrow: { color: '#c89b5e', fontFamily: 'Silkscreen', fontSize: 8 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  muted: { color: '#897b67', fontFamily: 'Silkscreen', fontSize: 8, marginTop: 7 },
  objective: { color: '#bda77e', fontFamily: 'Silkscreen', marginTop: 6 },
  consequenceLabel: { color: '#827561', fontFamily: 'Silkscreen', fontSize: 7, marginRight: 'auto' },
  consequenceIcon: { color: '#171914', fontFamily: 'Silkscreen', fontSize: 6, paddingHorizontal: 3, paddingVertical: 2 },
  consequenceRow: { alignItems: 'center', borderTopColor: '#40382d', borderTopWidth: 1, flexDirection: 'row', gap: 4, marginTop: 10, paddingTop: 8 },
  consequenceStamp: { alignItems: 'center', borderColor: '#594b3a', borderWidth: 1, flexDirection: 'row', gap: 3, padding: 2 },
  consequenceText: { color: '#b79c76', fontFamily: 'Silkscreen', fontSize: 6 },
  contextActions: { marginTop: 8 },
  contactLabel: { color: '#171914', fontFamily: 'Silkscreen', fontSize: 6, marginTop: -16, paddingVertical: 3, position: 'relative', textAlign: 'center' },
  leadEvidence: { flexDirection: 'row', gap: 10, marginTop: 10 },
  leadHeader: { flexDirection: 'row', gap: 10 },
  leadIdentity: { flex: 1, minWidth: 0 },
  leadIndex: { fontFamily: 'Silkscreen', fontSize: 6, position: 'absolute', right: 22, top: 10 },
  leadMeta: { flex: 1, minWidth: 0 },
  locationThumbnail: { backgroundColor: '#292820', borderColor: '#5d513e', borderWidth: 1, height: 74, overflow: 'hidden', position: 'relative', width: 118 },
  metaLabel: { color: '#746957', fontFamily: 'Silkscreen', marginTop: 1 },
  overlay: { alignItems: 'center', backgroundColor: '#100d0acc', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0, zIndex: UI_LAYER.sideSheet },
  overlayDocked: { alignItems: 'flex-end', backgroundColor: '#090b081f', justifyContent: 'flex-start' },
  panel: { backgroundColor: '#181914f7', borderColor: '#c58b4b', borderWidth: 1 },
  panelDocked: { borderLeftWidth: 3, shadowColor: '#070906', shadowOffset: { height: 8, width: -8 }, shadowOpacity: 0.65, shadowRadius: 0 },
  policeAction: { backgroundColor: '#4b2d2d', borderColor: '#d3765d', borderWidth: 1, marginTop: 8, padding: 10 },
  purchase: { alignItems: 'center', backgroundColor: '#6f4931', borderColor: '#d6a45d', borderWidth: 1, marginTop: 8, padding: 10 },
  purchaseDone: { backgroundColor: '#324a37' },
  purchaseText: { color: '#fff0c7', fontFamily: 'Silkscreen', fontSize: 8 },
  questAction: { backgroundColor: '#1a1612ee', marginTop: 8, padding: 8 },
  questActionButton: { backgroundColor: '#75452f', borderColor: '#e0ad5c', borderWidth: 1, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  questActionButtonText: { color: '#fff0c7', fontFamily: 'Silkscreen' },
  questActionDisabled: { backgroundColor: '#3a342d', borderColor: '#665f55', opacity: 0.65 },
  questActionPressed: { opacity: 0.78, transform: [{ translateY: 2 }] },
  questActions: { borderLeftWidth: 2, marginLeft: 14, marginTop: 12, paddingLeft: 10 },
  questActionsTitle: { fontFamily: 'Silkscreen', fontSize: 7 },
  section: { color: '#d3a04c', fontFamily: 'Silkscreen', fontSize: 9, marginTop: 16 },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  source: { color: '#8f826d', fontFamily: 'Silkscreen', marginBottom: 6 },
  sourceProof: { color: '#655d4f', fontFamily: 'Silkscreen', fontSize: 6, marginBottom: 5 },
  stamp: { borderColor: '#665139', borderWidth: 1, color: '#bda77e', fontFamily: 'Silkscreen', fontSize: 6, paddingHorizontal: 5, paddingVertical: 3 },
  stamps: { flexDirection: 'row', gap: 4, marginTop: 8 },
  summary: { backgroundColor: '#10130f', borderColor: '#514838', borderWidth: 1, flexDirection: 'row', marginTop: 14, paddingVertical: 8 },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryLabel: { color: '#8f826d', fontFamily: 'Silkscreen', fontSize: 8, marginTop: 1 },
  summaryValue: { color: '#fff0c7', fontFamily: 'Georgia', fontWeight: '700' },
  thumbnailBuilding: { backgroundColor: '#8b6845', height: 30, left: 12, position: 'absolute', top: 12, width: 42 },
  thumbnailLabel: { backgroundColor: '#10130fdd', bottom: 0, color: '#d6c19a', fontFamily: 'Silkscreen', fontSize: 6, left: 0, padding: 4, position: 'absolute', right: 0 },
  thumbnailPin: { borderColor: '#fff0c7', borderRadius: 5, borderWidth: 1, height: 10, position: 'absolute', right: 20, top: 19, width: 10 },
  thumbnailStreet: { backgroundColor: '#48453b', height: 16, position: 'absolute', right: -8, top: 31, transform: [{ rotate: '-24deg' }], width: 84 },
  title: { color: '#f1c65b', fontFamily: 'Silkscreen', fontSize: 18, marginTop: 3 },
});
