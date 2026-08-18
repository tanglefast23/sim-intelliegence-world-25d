import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { UiScale } from '../render/responsive-layout';
import { CharacterPortrait } from './CharacterPortrait';
import type { SelectedCharacterSummary } from './selected-character';
import { UI_LAYER } from './ui-layers';
import { uiMetrics } from './ui-metrics';

export function SelectedCharacterCard({
  accent,
  availableWidth,
  compact = false,
  onCenter,
  onTalk,
  pose,
  summary,
  uiScale,
}: Readonly<{
  accent: string;
  availableWidth: number;
  compact?: boolean;
  onCenter: () => void;
  onTalk?: () => void;
  pose: 'idle' | 'reaction' | 'talk';
  summary: SelectedCharacterSummary;
  uiScale: UiScale;
}>) {
  const metrics = uiMetrics(uiScale);
  const px = (base: number) => Math.round(base * uiScale);
  const poseLabel = pose === 'reaction' ? 'REACTION POSE' : pose === 'talk' ? 'TALKING POSE' : 'IDLE POSE';
  if (compact) return (
    <View
      accessibilityLabel={`${summary.displayName}. Mood ${summary.mood}. Activity ${summary.activity}.`}
      nativeID="world-ui-character-card"
      style={[styles.compactCard, { borderLeftColor: accent, gap: px(14), paddingHorizontal: px(10), paddingVertical: px(8) }]}
    >
      <View>
        <Text style={[styles.compactName, { color: accent, fontSize: px(14) }]}>{summary.displayName.toUpperCase()}</Text>
        <Text style={[styles.compactState, { fontSize: px(7), marginTop: px(2) }]}>{summary.mood} · {summary.activity}</Text>
      </View>
      <Pressable accessibilityLabel={`Center view on ${summary.displayName}`} onPress={onCenter} role="button" style={({ pressed }) => [styles.compactButton, { minHeight: px(30), paddingHorizontal: px(12) }, pressed && styles.pressed]}>
        <Text style={[styles.secondaryButtonText, { fontSize: px(8) }]}>CENTER</Text>
      </Pressable>
    </View>
  );
  return (
    <View
      accessibilityLabel={`${summary.displayName}. ${poseLabel}. Mood ${summary.mood}. Activity ${summary.activity}. Relationship ${summary.relationship}. Destination ${summary.destination}.`}
      nativeID="world-ui-character-card"
      style={[styles.card, { borderLeftColor: accent, gap: px(10), padding: px(8), width: Math.min(availableWidth - 28, Math.round(390 * uiScale)) }]}
    >
      <View style={[styles.portraitWrap, { borderColor: accent, height: px(90), width: px(82) }, pose === 'reaction' && styles.portraitReaction, pose === 'talk' && styles.portraitTalk]}>
        <CharacterPortrait
          displayName={summary.displayName}
          expression={summary.portraitExpression}
          npcId={summary.id}
        />
        <View style={[styles.moodBadge, { backgroundColor: accent, paddingHorizontal: px(5), paddingVertical: px(3) }]}><Text style={[styles.moodText, { fontSize: px(7) }]}>{summary.mood}</Text></View>
      </View>
      <View style={styles.details}>
        <Text style={[styles.selectedLabel, { fontSize: px(7) }]}>CURRENT FOCUS · {poseLabel}</Text>
        <Text numberOfLines={1} style={[styles.name, { fontSize: metrics.titleText }]}>{summary.displayName}</Text>
        <Text numberOfLines={1} style={[styles.relationship, { color: accent, fontSize: metrics.secondaryText }]}>{summary.relationship}</Text>
        <View style={[styles.rule, { marginVertical: px(5) }]} />
        <View style={[styles.factRow, { marginTop: px(4) }]}><Text style={[styles.factLabel, { fontSize: px(7), width: px(42) }]}>NOW</Text><Text numberOfLines={1} style={[styles.factValue, { fontSize: px(8) }]}>{summary.activity}</Text></View>
        <View style={[styles.factRow, { marginTop: px(4) }]}><Text style={[styles.factLabel, { fontSize: px(7), width: px(42) }]}>GOING</Text><Text numberOfLines={2} style={[styles.factValue, { fontSize: px(8) }]}>{summary.destination}</Text></View>
        <View style={[styles.actions, { gap: px(6), marginTop: px(8) }]}>
          <Pressable accessibilityLabel={`Center view on ${summary.displayName}`} onPress={onCenter} role="button" style={({ pressed }) => [styles.secondaryButton, { minHeight: px(28) }, pressed && styles.pressed]}>
            <Text style={[styles.secondaryButtonText, { fontSize: px(8) }]}>CENTER</Text>
          </Pressable>
          {onTalk ? (
            <Pressable accessibilityLabel={`Talk to ${summary.displayName}`} onPress={onTalk} role="button" style={({ pressed }) => [styles.primaryButton, { backgroundColor: accent, minHeight: px(28) }, pressed && styles.pressed]}>
              <Text style={[styles.primaryButtonText, { fontSize: px(8) }]}>TALK</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  card: {
    backgroundColor: '#171914f5', borderBottomColor: '#7f5a35', borderBottomWidth: 3,
    borderLeftColor: '#f1c65b', borderLeftWidth: 3, bottom: 42, flexDirection: 'row',
    gap: 10, left: 14, padding: 8, position: 'absolute', shadowColor: '#070906',
    shadowOffset: { height: 7, width: 7 }, shadowOpacity: 0.62, shadowRadius: 0, zIndex: UI_LAYER.card,
  },
  compactButton: { alignItems: 'center', borderColor: '#76573d', borderWidth: 1, justifyContent: 'center', minHeight: 30, paddingHorizontal: 12 },
  compactCard: {
    alignItems: 'center', backgroundColor: '#171914f5', borderBottomColor: '#7f5a35', borderBottomWidth: 3,
    borderLeftWidth: 3, bottom: 42, flexDirection: 'row', gap: 14, justifyContent: 'space-between',
    left: 14, paddingHorizontal: 10, paddingVertical: 8, position: 'absolute', shadowColor: '#070906',
    shadowOffset: { height: 5, width: 5 }, shadowOpacity: 0.62, shadowRadius: 0, zIndex: UI_LAYER.card,
  },
  compactName: { fontFamily: 'Georgia', fontSize: 14, fontWeight: '700' },
  compactState: { color: '#dec69a', fontFamily: 'Silkscreen', fontSize: 7, marginTop: 2 },
  details: { flex: 1, minWidth: 0 },
  factLabel: { color: '#8e8069', fontFamily: 'Silkscreen', fontSize: 7, width: 42 },
  factRow: { flexDirection: 'row', marginTop: 4 },
  factValue: { color: '#dec69a', flex: 1, fontFamily: 'Silkscreen', fontSize: 8 },
  moodBadge: { bottom: 0, left: 0, paddingHorizontal: 5, paddingVertical: 3, position: 'absolute', right: 0 },
  moodText: { color: '#211d1a', fontFamily: 'Silkscreen', fontSize: 7, textAlign: 'center' },
  name: { color: '#fff0c7', fontFamily: 'Georgia', fontWeight: '700', textTransform: 'uppercase' },
  portraitWrap: { borderWidth: 1, height: 90, width: 82 },
  portraitReaction: { transform: [{ rotate: '-2deg' }, { translateY: -3 }] },
  portraitTalk: { transform: [{ translateY: -1 }] },
  pressed: { opacity: 0.76, transform: [{ translateY: 1 }] },
  primaryButton: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 28 },
  primaryButtonText: { color: '#211d1a', fontFamily: 'Silkscreen', fontSize: 8 },
  relationship: { fontFamily: 'Silkscreen', marginTop: 2 },
  rule: { backgroundColor: '#514838', height: 1, marginVertical: 5 },
  secondaryButton: { alignItems: 'center', borderColor: '#76573d', borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 28 },
  secondaryButtonText: { color: '#d6c19a', fontFamily: 'Silkscreen', fontSize: 8 },
  selectedLabel: { color: '#8e8069', fontFamily: 'Silkscreen', fontSize: 7, letterSpacing: 0.6 },
});
