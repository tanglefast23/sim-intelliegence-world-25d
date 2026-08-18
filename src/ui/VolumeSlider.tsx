import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { UiMetrics } from './ui-metrics';

const STEP = 0.05;

export const clampStep = (raw: number) => Math.max(0, Math.min(1, Math.round(raw * 20) / 20));

/** Next volume for an arrow key, or null when the key is not a slider key. */
export function volumeForKey(value: number, key: string): number | null {
  if (key === 'ArrowLeft' || key === 'ArrowDown') return clampStep(value - STEP);
  if (key === 'ArrowRight' || key === 'ArrowUp') return clampStep(value + STEP);
  return null;
}

export function VolumeSlider({
  accent,
  label,
  metrics,
  nativeID,
  onChange,
  onPressSound,
  value,
}: Readonly<{
  accent: string;
  label: string;
  metrics: UiMetrics;
  nativeID: string;
  onChange: (value: number) => void;
  onPressSound: () => void;
  value: number;
}>) {
  const trackWidth = useRef(0);
  const percent = Math.round(value * 100);
  const trackHeight = Math.round(12 * metrics.scale);
  const knobWidth = Math.round(10 * metrics.scale);
  const knobHeight = trackHeight + Math.round(6 * metrics.scale);
  const scrub = (locationX: number) => {
    if (trackWidth.current <= 0) return;
    onChange(clampStep(locationX / trackWidth.current));
  };
  // react-native-web supports keyboard props on View; the react-native types do not.
  const keyboardProps = {
    focusable: true,
    onKeyDown: (event: { key: string; preventDefault: () => void }) => {
      const next = volumeForKey(value, event.key);
      if (next === null) return;
      event.preventDefault();
      onPressSound();
      onChange(next);
    },
    tabIndex: 0,
  } as object;
  return (
    <View nativeID={nativeID} style={styles.row}>
      <Text style={[styles.label, { fontSize: metrics.secondaryText, width: Math.round(62 * metrics.scale) }]}>{label}</Text>
      <View
        accessibilityLabel={`${label} volume ${percent} percent`}
        accessibilityValue={{ max: 100, min: 0, now: percent }}
        onLayout={(event) => { trackWidth.current = event.nativeEvent.layout.width; }}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => { onPressSound(); scrub(event.nativeEvent.locationX); }}
        onResponderMove={(event) => scrub(event.nativeEvent.locationX)}
        onStartShouldSetResponder={() => true}
        role="slider"
        style={[styles.hitArea, { height: metrics.pointerTarget }]}
        {...keyboardProps}
      >
        <View style={[styles.track, { height: trackHeight }]}>
          <View style={[styles.fill, { backgroundColor: accent, transform: [{ scaleX: value }] }]} />
        </View>
        <View
          style={[styles.knob, {
            backgroundColor: accent,
            height: knobHeight,
            left: `${percent}%`,
            marginLeft: -Math.round(knobWidth / 2),
            top: Math.round((metrics.pointerTarget - knobHeight) / 2),
            width: knobWidth,
          }]}
        />
      </View>
      <Text style={[styles.value, { fontSize: metrics.secondaryText, width: Math.round(38 * metrics.scale) }]}>{percent}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, transformOrigin: 'left center' },
  hitArea: { flex: 1, justifyContent: 'center' },
  knob: { borderColor: '#fff0c7', borderWidth: 1, position: 'absolute' },
  label: { color: '#bda77e', fontFamily: 'Silkscreen' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  track: { backgroundColor: '#3b372d', borderColor: '#514838', borderWidth: 1, overflow: 'hidden' },
  value: { color: '#fff0c7', fontFamily: 'Silkscreen', textAlign: 'right' },
});
