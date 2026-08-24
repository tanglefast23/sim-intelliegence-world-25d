import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ATLAS_INDEX, atlasRectangle, type CharacterId } from '../render/atlas';
import { AtlasSprite } from '../ui/AtlasSprite';
import type { ViewportSize } from '../render/camera';
import { automaticUiScale } from '../render/responsive-layout';
import { CharacterPortrait } from '../ui/CharacterPortrait';
import { uiMetrics } from '../ui/ui-metrics';
import { useReducedMotion } from './accessibility';
import { normalizePlayerName } from './new-game-name';
import { useMenuMusic } from '../audio/halcyra-audio';

type NewGameFlowProps = Readonly<{
  audioEnabled?: boolean;
  busy: boolean;
  error?: string;
  onStart: (displayName: string) => void;
  surface: ViewportSize;
}>;


function VistaCharacter({
  characterId,
  displayName,
  scale,
}: Readonly<{ characterId: CharacterId; displayName: string; scale: number }>) {
  const frame = ATLAS_INDEX.characters[characterId].frames['front-1']!;
  const source = atlasRectangle(frame);
  return (
    <View accessibilityLabel={displayName} style={[styles.vistaCharacter, { height: 30 * scale, width: 24 * scale }]}>
      <View style={[styles.characterShadow, { width: 18 * scale }]} />
      <AtlasSprite
        height={source.height}
        scale={scale}
        width={source.width}
        x={source.x}
        y={source.y}
      />
    </View>
  );
}

function IslandBackdrop({ compact }: Readonly<{ compact: boolean }>) {
  const reducedMotion = useReducedMotion();
  const tide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) return undefined;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(tide, { duration: 4_800, easing: Easing.inOut(Easing.sin), toValue: 1, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(tide, { duration: 4_800, easing: Easing.inOut(Easing.sin), toValue: 0, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, tide]);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.backdrop}>
      <View style={styles.sky} />
      <View style={styles.sunHalo} />
      <View style={styles.sun} />
      <View style={[styles.cloud, styles.cloudNear]} />
      <Animated.View style={[styles.cloud, styles.cloudFar, !reducedMotion && { transform: [{ translateX: tide.interpolate({ inputRange: [0, 1], outputRange: [-6, 8] }) }] }]} />
      <View style={styles.horizonGlow} />
      <View style={styles.sea} />
      <Animated.View style={[styles.tide, { opacity: tide.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.65] }), transform: [{ translateX: tide.interpolate({ inputRange: [0, 1], outputRange: [-14, 20] }) }] }]} />
      <View style={styles.distantIsland} />
      <View style={styles.skyline}>
        <View style={[styles.skylineTower, { height: 30 }]} />
        <View style={[styles.skylineTower, { height: 48 }]} />
        <View style={[styles.skylineTower, { height: 36 }]} />
        <View style={[styles.skylineTower, { height: 58 }]} />
        <View style={[styles.skylineTower, { height: 40 }]} />
      </View>
      <View style={styles.island} />
      <View style={styles.cliffLight} />
      <View style={styles.villa}>
        <View style={styles.villaRoof} />
        <Animated.View style={[styles.villaWindow, !reducedMotion && { opacity: tide.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }]} />
        <Animated.View style={[styles.villaWindow, styles.villaWindowSecond, !reducedMotion && { opacity: tide.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] }) }]} />
        <View style={styles.villaDoor} />
      </View>
      <View style={[styles.palm, styles.palmLeft]}><View style={styles.palmCrown} /></View>
      <View style={[styles.palm, styles.palmRight]}><View style={styles.palmCrown} /></View>
      <Animated.View style={[styles.observer, !reducedMotion && { transform: [{ translateY: tide.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }] }]}>
        <VistaCharacter characterId="linda-boyfriend" displayName="Unknown observer" scale={compact ? 1.5 : 2} />
        {!compact ? <Text style={styles.observerLabel}>UNKNOWN</Text> : null}
      </Animated.View>
      <View style={styles.protagonist}>
        <VistaCharacter characterId="protagonist" displayName="Your character" scale={compact ? 2 : 3} />
        <Text style={styles.protagonistLabel}>YOU · NEW RESIDENT</Text>
      </View>
      <View style={styles.arrivalTag}>
        <Text style={styles.arrivalKicker}>ARRIVAL WINDOW</Text>
        <Text style={styles.arrivalValue}>DAY 1 · 07:00 · SUNWARD BAY</Text>
      </View>
      {!compact ? <View style={styles.sceneLabel}><Text style={styles.sceneLabelText}>SUNWARD VILLAS · HALCYRA ISLAND</Text></View> : null}
      <View style={styles.vignetteTop} />
      <View style={styles.vignetteBottom} />
    </View>
  );
}

export function NewGameFlow({ audioEnabled = false, busy, error, onStart, surface }: NewGameFlowProps) {
  const [draft, setDraft] = useState('');
  useMenuMusic(audioEnabled);
  const metrics = uiMetrics(automaticUiScale(surface));
  const compact = surface.width < 900;
  const showCast = surface.width >= 1_180;
  const displayName = normalizePlayerName(draft);
  const start = () => {
    if (!busy && displayName) onStart(displayName);
  };

  return (
    <View accessibilityLabel="New life on Halcyra Island" nativeID="new-game-flow" style={[styles.screen, surface]}>
      <IslandBackdrop compact={compact} />
      <View style={[styles.card, compact ? styles.cardCompact : styles.cardWide, { padding: metrics.padding * 2 }]}>
        <View style={styles.cardRule} />
        <Text style={[styles.eyebrow, { fontSize: metrics.secondaryText }]}>RESIDENCY BOARD · INVITATION 01</Text>
        <Text accessibilityRole="header" style={[styles.title, { fontSize: compact ? 28 : 38 }]}>WELCOME TO{`\n`}HALCYRA</Text>
        <Text style={styles.tagline}>PARADISE HAS PERFECT MEMORY.</Text>
        <Text style={[styles.copy, { fontSize: metrics.panelText, lineHeight: Math.round(metrics.panelText * 1.55) }]}>
          Your villa waits above Sunward Bay. Halcyra pays you $800 each week. Everyone remembers who arrives—and who watches.
        </Text>
        <View style={styles.offerRow}>
          <View style={styles.offerItem}><Text style={styles.offerLabel}>THE PRIZE</Text><Text style={styles.offerValue}>ONE YEAR · $800/WEEK</Text></View>
          <View style={styles.offerItem}><Text style={styles.offerLabel}>THE CATCH</Text><Text style={styles.offerValue}>EVERYONE REMEMBERS</Text></View>
        </View>
        <Text style={[styles.label, { fontSize: metrics.secondaryText }]}>WHAT SHOULD THE ISLAND CALL YOU?</Text>
        <TextInput
          accessibilityLabel="Player name"
          autoCapitalize="words"
          autoCorrect={false}
          editable={!busy}
          maxLength={32}
          onChangeText={setDraft}
          onSubmitEditing={start}
          placeholder="YOUR NAME"
          placeholderTextColor="#776b59"
          returnKeyType="done"
          style={[styles.input, { fontSize: metrics.conversationText, minHeight: metrics.primaryControl }]}
          value={draft}
        />
        {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityLabel="Start life on Halcyra"
          accessibilityRole="button"
          disabled={busy || !displayName}
          onPress={start}
          style={({ pressed }) => [styles.button, { minHeight: metrics.primaryControl }, pressed && styles.buttonPressed, (busy || !displayName) && styles.buttonDisabled]}
        >
          <Text style={[styles.buttonText, { fontSize: metrics.persistentText }]}>{busy ? 'PREPARING VILLA…' : 'CLAIM YOUR VILLA  →'}</Text>
        </Pressable>
        <Text style={[styles.note, { fontSize: metrics.secondaryText }]}>No tutorial. Follow your curiosity. Decide who deserves your trust.</Text>
      </View>
      {showCast ? (
        <View nativeID="new-game-cast" style={styles.cast}>
          <Text style={styles.castKicker}>YOUR NEW NEIGHBORS</Text>
          <View style={styles.castRow}>
            <View><CharacterPortrait displayName="Linda Shore" expression="joy" npcId="linda" /><Text style={styles.castName}>LINDA</Text></View>
            <View><CharacterPortrait displayName="Rafael Cruz" npcId="rafael_cruz" /><Text style={styles.castName}>RAFAEL</Text></View>
            <View><CharacterPortrait displayName="Mina Park" expression="upset" npcId="mina_park" /><Text style={styles.castName}>MINA</Text></View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  arrivalKicker: { color: '#8f8067', fontFamily: 'Silkscreen', fontSize: 7, marginBottom: 4 },
  arrivalTag: { backgroundColor: '#161a17e8', borderTopColor: '#f1c65b', borderTopWidth: 2, bottom: 32, left: '48%', paddingHorizontal: 12, paddingVertical: 9, position: 'absolute' },
  arrivalValue: { color: '#e7c787', fontFamily: 'Silkscreen', fontSize: 8 },
  backdrop: { bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0 },
  button: { alignItems: 'center', backgroundColor: '#f1c65b', borderBottomColor: '#9c6338', borderBottomWidth: 4, justifyContent: 'center', marginTop: 16, paddingHorizontal: 18 },
  buttonDisabled: { backgroundColor: '#665139', borderBottomColor: '#493927', opacity: 0.85 },
  buttonPressed: { borderBottomWidth: 1, transform: [{ translateY: 3 }] },
  buttonText: { color: '#211d1a', fontFamily: 'Silkscreen', letterSpacing: 0.7 },
  card: { backgroundColor: '#211b17f2', borderColor: '#c58b4b', borderLeftWidth: 4, borderRightWidth: 1, borderWidth: 1, shadowColor: '#060a08', shadowOffset: { height: 14, width: 12 }, shadowOpacity: 0.62, shadowRadius: 0 },
  cardCompact: { maxWidth: 620, width: '88%' },
  cardRule: { backgroundColor: '#f1c65b', height: 3, marginBottom: 18, width: 52 },
  cardWide: { left: '6%', maxWidth: 570, position: 'absolute', width: '46%' },
  cast: { backgroundColor: '#161a17e8', borderColor: '#76573d', borderTopWidth: 2, bottom: 35, padding: 12, position: 'absolute', right: '6%' },
  castKicker: { color: '#e7c787', fontFamily: 'Silkscreen', fontSize: 9, letterSpacing: 1.1, marginBottom: 8 },
  castName: { backgroundColor: '#211d1a', color: '#d6c19a', fontFamily: 'Silkscreen', fontSize: 8, paddingVertical: 4, textAlign: 'center' },
  castRow: { flexDirection: 'row', gap: 8 },
  characterShadow: { backgroundColor: '#10130e66', bottom: 0, height: 6, left: '12%', position: 'absolute', transform: [{ skewX: '-24deg' }] },
  cliffLight: { backgroundColor: '#bd814b', bottom: '14%', height: '7%', position: 'absolute', right: '-3%', transform: [{ rotate: '-5deg' }], width: '45%' },
  cloud: { backgroundColor: '#f5dd9d42', height: 6, position: 'absolute' },
  cloudFar: { right: '5%', top: '22%', width: '23%' },
  cloudNear: { right: '29%', top: '15%', width: '14%' },
  copy: { color: '#ead8b4', fontFamily: 'Georgia', marginTop: 18, maxWidth: 470 },
  distantIsland: { backgroundColor: '#435746', bottom: '38%', height: '8%', left: '47%', position: 'absolute', transform: [{ skewX: '-24deg' }], width: '24%' },
  error: { color: '#ff9b85', fontFamily: 'Silkscreen', fontSize: 10, lineHeight: 17, marginTop: 10 },
  eyebrow: { color: '#c89b5e', fontFamily: 'Silkscreen', letterSpacing: 1.2 },
  horizonGlow: { backgroundColor: '#e5a75c55', height: '18%', left: 0, position: 'absolute', right: 0, top: '35%' },
  input: { backgroundColor: '#121612', borderColor: '#9f754b', borderWidth: 2, color: '#fff0c7', fontFamily: 'Silkscreen', paddingHorizontal: 12 },
  island: { backgroundColor: '#274331', bottom: '12%', height: '24%', position: 'absolute', right: '-4%', transform: [{ rotate: '-5deg' }], width: '53%' },
  label: { color: '#d6c19a', fontFamily: 'Silkscreen', letterSpacing: 0.7, marginBottom: 8, marginTop: 24 },
  note: { color: '#ad9b7c', fontFamily: 'Georgia', lineHeight: 17, marginTop: 12, textAlign: 'center' },
  observer: { alignItems: 'center', bottom: '35%', opacity: 0.82, position: 'absolute', right: '8%', zIndex: 4 },
  observerLabel: { backgroundColor: '#161a17d9', color: '#ef9b78', fontFamily: 'Silkscreen', fontSize: 7, marginTop: 2, paddingHorizontal: 5, paddingVertical: 3 },
  offerItem: { flex: 1 },
  offerLabel: { color: '#8f8067', fontFamily: 'Silkscreen', fontSize: 7, marginBottom: 4 },
  offerRow: { borderBottomColor: '#554431', borderBottomWidth: 1, borderTopColor: '#554431', borderTopWidth: 1, flexDirection: 'row', gap: 14, marginTop: 16, paddingVertical: 10 },
  offerValue: { color: '#e7c787', fontFamily: 'Silkscreen', fontSize: 8 },
  palm: { backgroundColor: '#172c23', height: 115, position: 'absolute', width: 10 },
  palmCrown: { backgroundColor: '#1d3929', borderRadius: 40, height: 42, left: -24, position: 'absolute', top: -18, transform: [{ skewX: '-18deg' }], width: 60 },
  palmLeft: { bottom: '27%', right: '36%', transform: [{ rotate: '-8deg' }] },
  palmRight: { bottom: '26%', right: '12%', transform: [{ rotate: '6deg' }] },
  protagonist: { alignItems: 'center', bottom: '10%', position: 'absolute', right: '31%', zIndex: 5 },
  protagonistLabel: { backgroundColor: '#161a17e8', borderLeftColor: '#f1c65b', borderLeftWidth: 2, color: '#f4d992', fontFamily: 'Silkscreen', fontSize: 7, marginTop: 3, paddingHorizontal: 7, paddingVertical: 4 },
  sceneLabel: { borderLeftColor: '#f1c65b', borderLeftWidth: 2, bottom: 18, paddingLeft: 8, position: 'absolute', right: '6%' },
  sceneLabelText: { color: '#cbb88f', fontFamily: 'Silkscreen', fontSize: 8, letterSpacing: 1 },
  screen: { alignItems: 'center', backgroundColor: '#101914', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  sea: { backgroundColor: '#1d4b4c', bottom: 0, height: '50%', left: 0, position: 'absolute', right: 0 },
  sky: { backgroundColor: '#273d35', bottom: '48%', left: 0, position: 'absolute', right: 0, top: 0 },
  skyline: { alignItems: 'flex-end', bottom: '47%', flexDirection: 'row', gap: 4, height: 60, left: '48%', opacity: 0.7, position: 'absolute' },
  skylineTower: { backgroundColor: '#304b40', width: 18 },
  sun: { backgroundColor: '#f1c65b', borderRadius: 54, height: 108, position: 'absolute', right: '12%', top: '10%', width: 108 },
  sunHalo: { backgroundColor: '#eaa25438', borderRadius: 84, height: 168, position: 'absolute', right: '9.6%', top: '5.7%', width: 168 },
  tagline: { color: '#f1c65b', fontFamily: 'Georgia', fontSize: 13, fontStyle: 'italic', letterSpacing: 1.8, marginTop: 8 },
  tide: { backgroundColor: '#e9ca8c', bottom: '28%', height: 2, position: 'absolute', right: '5%', width: '42%' },
  title: { color: '#fff0c7', fontFamily: 'Silkscreen', letterSpacing: 1, lineHeight: 45, marginTop: 8, textShadowColor: '#0a0e0b', textShadowOffset: { height: 4, width: 4 }, textShadowRadius: 0 },
  vignetteBottom: { backgroundColor: '#08100b88', bottom: 0, height: 22, left: 0, position: 'absolute', right: 0 },
  vignetteTop: { backgroundColor: '#08100b88', height: 18, left: 0, position: 'absolute', right: 0, top: 0 },
  vistaCharacter: { position: 'relative' },
  villa: { backgroundColor: '#e1c28c', bottom: '29%', height: 102, position: 'absolute', right: '17%', width: 210 },
  villaDoor: { backgroundColor: '#46362c', bottom: 0, height: 55, left: 88, position: 'absolute', width: 35 },
  villaRoof: { backgroundColor: '#a85039', height: 22, left: -8, position: 'absolute', right: -8, top: -13, transform: [{ skewX: '-20deg' }] },
  villaWindow: { backgroundColor: '#e5a75c', borderColor: '#3e4e43', borderWidth: 4, height: 32, left: 26, position: 'absolute', top: 31, width: 38 },
  villaWindowSecond: { left: undefined, right: 25 },
});
