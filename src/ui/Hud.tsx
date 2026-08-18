import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { WorldState } from '../domain/state/schema';
import { UI_SCALES, type UiScale } from '../render/responsive-layout';
import { UI_LAYER } from './ui-layers';
import { uiMetrics } from './ui-metrics';
import { VolumeSlider } from './VolumeSlider';

function clockLabel(absoluteMinute: number): string {
  const day = Math.floor(absoluteMinute / 1_440) + 1;
  const minuteOfDay = absoluteMinute % 1_440;
  const hours = Math.floor(minuteOfDay / 60).toString().padStart(2, '0');
  const minutes = (minuteOfDay % 60).toString().padStart(2, '0');
  return `DAY ${day} · ${hours}:${minutes}`;
}

type HudProps = Readonly<{
  state: WorldState;
  mapName: string;
  areaName: string;
  zoom: number;
  saveStatus: string;
  accent: string;
  availableWidth: number;
  hidden: boolean;
  uiScale: UiScale;
  onSpeed: (speed: 0 | 1 | 2) => void;
  onJournal: () => void;
  onSocial: () => void;
  onSave: () => void;
  saveDisabled: boolean;
  onZoom: (direction: -1 | 1) => void;
  zoomOutDisabled: boolean;
  zoomInDisabled: boolean;
  onUiScale: (scale: UiScale) => void;
  musicVolume: number;
  sfxVolume: number;
  onMusicVolume: (value: number) => void;
  onSfxVolume: (value: number) => void;
  onPressSound: () => void;
}>;

export function Hud({
  state, mapName, areaName, zoom, saveStatus, accent, availableWidth, hidden, uiScale, onSpeed,
  onJournal, onSocial, onSave, saveDisabled, onZoom, zoomOutDisabled, zoomInDisabled, onUiScale,
  musicVolume, sfxVolume, onMusicVolume, onSfxVolume, onPressSound,
}: HudProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const metrics = uiMetrics(uiScale);
  // Scale rather than width so the meter change composites instead of laying out. The track clips.
  const energyScale = Math.max(0, Math.min(100, state.protagonist.energy)) / 100;
  const healthScale = Math.max(0, Math.min(100, state.protagonist.health)) / 100;
  return (
    <View
      nativeID="world-ui-hud"
      pointerEvents={hidden ? 'none' : 'auto'}
      style={[styles.hud, hidden && styles.hidden, { borderLeftColor: accent, padding: metrics.padding, width: Math.min(availableWidth - 28, Math.round(540 * uiScale)) }]}
    >
      <View style={styles.topRow}>
        <View style={styles.locationRow}>
          <View>
            <Text style={[styles.eyebrow, { fontSize: metrics.secondaryText }]}>{mapName.toUpperCase()}</Text>
            <Text style={[styles.area, { fontSize: metrics.persistentText }]}>{areaName}</Text>
          </View>
          <View style={[styles.locationMark, { backgroundColor: accent }]} />
        </View>
        <View style={styles.timeBlock}>
          <View style={styles.row}>
            <Text style={[styles.clock, { fontSize: metrics.panelText }]}>{clockLabel(state.clock.absoluteMinute)}</Text>
            <Text style={[styles.money, { fontSize: metrics.persistentText }]}>${state.inventory.money}</Text>
          </View>
          <View nativeID="world-ui-speed" style={styles.speedRow}>
            <Text style={[styles.speedLabel, { fontSize: metrics.secondaryText }]}>TIME</Text>
            {([0, 1, 2] as const).map((speed) => (
              <Pressable
                accessibilityLabel={speed === 0 ? 'Pause time' : `Set ${speed}x time`}
                key={speed}
                onPress={() => { onPressSound(); onSpeed(speed); }}
                role="button"
                style={({ pressed }) => [
                  styles.speedButton,
                  { height: metrics.pointerTarget, width: metrics.pointerTarget },
                  state.clock.selectedSpeed === speed && [styles.speedActive, { backgroundColor: accent }],
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={[styles.speedText, { fontSize: metrics.secondaryText }, state.clock.selectedSpeed === speed && styles.speedTextActive]}>
                  {speed === 0 ? 'II' : `${speed}×`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
        <View style={[styles.meters, { gap: metrics.gap }]}>
          <View style={styles.meter}>
            <View style={styles.meterHeader}>
              <Text style={[styles.meterLabel, { fontSize: metrics.secondaryText }]}>ENERGY</Text>
              <Text style={[styles.meterValue, { fontSize: metrics.secondaryText }]}>{state.protagonist.energy}</Text>
            </View>
            <View style={styles.track}><View nativeID="world-ui-energy-fill" style={[styles.fillEnergy, { transform: [{ scaleX: energyScale }] }]} /></View>
          </View>
          <View style={styles.meter}>
            <View style={styles.meterHeader}>
              <Text style={[styles.meterLabel, { fontSize: metrics.secondaryText }]}>HEALTH</Text>
              <Text style={[styles.meterValue, { fontSize: metrics.secondaryText }]}>{state.protagonist.health}</Text>
            </View>
            <View style={styles.track}><View nativeID="world-ui-health-fill" style={[styles.fillHealth, { transform: [{ scaleX: healthScale }] }]} /></View>
          </View>
        </View>
      <View style={styles.hudFooter}>
        <View style={styles.identity}>
          <Text style={[styles.resident, { fontSize: metrics.secondaryText }]}>{state.protagonist.displayName.toUpperCase()}</Text>
          <Text nativeID="world-save-status" style={[styles.saveStatus, { fontSize: metrics.secondaryText }]}>{saveStatus.toUpperCase()}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityLabel="Open quests" onPress={onJournal} role="button" style={({ pressed }) => [styles.actionButton, { minHeight: metrics.pointerTarget }, pressed && styles.buttonPressed]}><Text style={[styles.actionText, { fontSize: metrics.secondaryText }]}>QUESTS · Q</Text></Pressable>
          <Pressable accessibilityLabel="Open relationships" onPress={onSocial} role="button" style={({ pressed }) => [styles.actionButton, { minHeight: metrics.pointerTarget }, pressed && styles.buttonPressed]}><Text style={[styles.actionText, { fontSize: metrics.secondaryText }]}>SOCIAL</Text></Pressable>
          <Pressable accessibilityLabel="Save game" disabled={saveDisabled} onPress={() => { onPressSound(); onSave(); }} role="button" style={({ pressed }) => [styles.actionButton, { minHeight: metrics.pointerTarget }, saveDisabled && styles.disabled, pressed && styles.buttonPressed]}><Text style={[styles.actionText, { fontSize: metrics.secondaryText }]}>SAVE</Text></Pressable>
          <Pressable accessibilityLabel="Open display and audio settings" onPress={() => { onPressSound(); setSettingsOpen((open) => !open); }} role="button" style={({ pressed }) => [styles.settingsButton, { minHeight: metrics.pointerTarget }, settingsOpen && styles.settingsActive, pressed && styles.buttonPressed]}><Text style={[styles.settingsText, { fontSize: metrics.secondaryText }]}>SETTINGS</Text></Pressable>
        </View>
      </View>
      {settingsOpen ? (
        <View accessibilityLabel="Display and audio settings" nativeID="world-ui-display-settings" style={styles.settingsDrawer}>
          <View nativeID="world-ui-zoom" style={styles.settingRow}>
            <Text style={[styles.settingLabel, { fontSize: metrics.secondaryText }]}>VIEW</Text>
            <Pressable accessibilityLabel="Decrease world zoom" disabled={zoomOutDisabled} onPress={() => { onPressSound(); onZoom(-1); }} role="button" style={({ pressed }) => [styles.settingButton, { height: metrics.pointerTarget }, zoomOutDisabled && styles.disabled, pressed && styles.buttonPressed]}><Text style={[styles.settingText, { fontSize: metrics.secondaryText }]}>−</Text></Pressable>
            <Text nativeID="world-ui-zoom-value" style={[styles.settingValue, { fontSize: metrics.secondaryText }]}>{Math.round(zoom * 100)}%</Text>
            <Pressable accessibilityLabel="Increase world zoom" disabled={zoomInDisabled} onPress={() => { onPressSound(); onZoom(1); }} role="button" style={({ pressed }) => [styles.settingButton, { height: metrics.pointerTarget }, zoomInDisabled && styles.disabled, pressed && styles.buttonPressed]}><Text style={[styles.settingText, { fontSize: metrics.secondaryText }]}>+</Text></Pressable>
          </View>
          <View nativeID="world-ui-scale" style={styles.settingRow}>
            <Text style={[styles.settingLabel, { fontSize: metrics.secondaryText }]}>UI SCALE</Text>
            {UI_SCALES.map((scale) => (
              <Pressable accessibilityLabel={`Set ${Math.round(scale * 100)} percent interface scale`} key={scale} onPress={() => { onPressSound(); onUiScale(scale); }} role="button" style={({ pressed }) => [styles.scaleButton, { minHeight: metrics.pointerTarget }, uiScale === scale && styles.settingsActive, pressed && styles.buttonPressed]}><Text style={[styles.settingText, { fontSize: metrics.secondaryText }]}>{Math.round(scale * 100)}%</Text></Pressable>
            ))}
          </View>
          <VolumeSlider
            accent={accent}
            label="MUSIC"
            metrics={metrics}
            nativeID="world-ui-music-volume"
            onChange={onMusicVolume}
            onPressSound={onPressSound}
            value={musicVolume}
          />
          <VolumeSlider
            accent={accent}
            label="SFX"
            metrics={metrics}
            nativeID="world-ui-sfx-volume"
            onChange={onSfxVolume}
            onPressSound={onPressSound}
            value={sfxVolume}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: { alignItems: 'center', borderColor: '#665139', borderWidth: 1, justifyContent: 'center', minHeight: 30, paddingHorizontal: 8 },
  actionText: { color: '#e1ca9f', fontFamily: 'Silkscreen', fontSize: 8 },
  actions: { flexDirection: 'row', gap: 4 },
  area: { color: '#fff0c7', fontFamily: 'Georgia', fontWeight: '700', marginTop: 1 },
  buttonPressed: { opacity: 0.78, transform: [{ translateY: 1 }] },
  clock: { color: '#f1c65b', fontFamily: 'Silkscreen' },
  disabled: { opacity: 0.35 },
  eyebrow: { color: '#dfa85e', fontFamily: 'Silkscreen' },
  fillEnergy: { backgroundColor: '#d9ad56', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, transformOrigin: 'left center' },
  fillHealth: { backgroundColor: '#74a97b', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, transformOrigin: 'left center' },
  hud: {
    backgroundColor: '#181914f4', borderBottomColor: '#ad7640', borderBottomWidth: 2,
    borderLeftColor: '#d3a04c', borderLeftWidth: 3, left: 14, position: 'absolute', shadowColor: '#070906',
    shadowOffset: { height: 7, width: 7 }, shadowOpacity: 0.58, shadowRadius: 0, top: 0, zIndex: UI_LAYER.hud,
  },
  hudFooter: { alignItems: 'center', borderTopColor: '#514838', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 9, paddingTop: 7 },
  hidden: { display: 'none' },
  identity: { gap: 2 },
  locationMark: { backgroundColor: '#f1c65b', height: 4, marginTop: 4, width: 22 },
  locationRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', minWidth: 0 },
  meter: { flex: 1 },
  meterHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  meterLabel: { color: '#bda77e', fontFamily: 'Silkscreen' },
  meterValue: { color: '#fff0c7', fontFamily: 'Silkscreen' },
  meters: { flexDirection: 'row', marginTop: 8 },
  money: { color: '#fff0c7', fontFamily: 'Silkscreen' },
  resident: { color: '#fff0c7', fontFamily: 'Silkscreen' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  saveStatus: { color: '#80755f', fontFamily: 'Silkscreen', fontSize: 7 },
  scaleButton: { alignItems: 'center', borderColor: '#665139', borderWidth: 1, justifyContent: 'center', minHeight: 28, paddingHorizontal: 7 },
  settingButton: { alignItems: 'center', borderColor: '#665139', borderWidth: 1, height: 28, justifyContent: 'center', width: 32 },
  settingLabel: { color: '#bda77e', fontFamily: 'Silkscreen', fontSize: 8, width: 62 },
  settingRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  settingText: { color: '#e1ca9f', fontFamily: 'Silkscreen', fontSize: 8 },
  settingValue: { color: '#fff0c7', fontFamily: 'Silkscreen', fontSize: 8, textAlign: 'center', width: 44 },
  settingsActive: { backgroundColor: '#745837', borderColor: '#dfa85e' },
  settingsButton: { alignItems: 'center', borderColor: '#493f31', borderWidth: 1, justifyContent: 'center', minHeight: 30, paddingHorizontal: 7 },
  settingsDrawer: { borderTopColor: '#514838', borderTopWidth: 1, gap: 6, marginTop: 8, paddingTop: 8 },
  settingsText: { color: '#95866c', fontFamily: 'Silkscreen', fontSize: 7 },
  speedActive: { backgroundColor: '#f1c65b', borderColor: '#fff0c7' },
  speedButton: { alignItems: 'center', borderColor: '#665139', borderWidth: 1, justifyContent: 'center' },
  speedLabel: { color: '#dfa85e', fontFamily: 'Silkscreen', marginRight: 3 },
  speedRow: { alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'flex-end', marginTop: 7 },
  speedText: { color: '#d6c19a', fontFamily: 'Silkscreen' },
  speedTextActive: { color: '#211d1a' },
  timeBlock: { marginLeft: 14, minWidth: 178 },
  topRow: { flexDirection: 'row' },
  track: { backgroundColor: '#3b372d', height: 4, marginTop: 3, overflow: 'hidden' },
});
