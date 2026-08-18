import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { UiMetrics } from './ui-metrics';

const STEP = 0.05;

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
  const step = (direction: -1 | 1) => {
    onPressSound();
    onChange(Math.max(0, Math.min(1, Math.round((value + direction * STEP) * 20) / 20)));
  };
  const scrub = (locationX: number) => {
    if (trackWidth.current <= 0) return;
    onChange(Math.max(0, Math.min(1, Math.round((locationX / trackWidth.current) * 20) / 20)));
  };
  return (
    <View nativeID={nativeID} style={styles.row}>
      <Text style={[styles.label, { fontSize: metrics.secondaryText, width: Math.round(62 * metrics.scale) }]}>{label}</Text>
      <Pressable
        accessibilityLabel={`Decrease ${label.toLowerCase()} volume`}
        disabled={value <= 0}
        onPress={() => step(-1)}
        role="button"
        style={({ pressed }) => [styles.stepButton, { height: metrics.pointerTarget, width: Math.round(24 * metrics.scale) }, value <= 0 && styles.disabled, pressed && styles.pressed]}
      >
        <Text style={[styles.stepText, { fontSize: metrics.secondaryText }]}>−</Text>
      </Pressable>
      <View
        accessibilityLabel={`${label} volume ${percent} percent`}
        accessibilityValue={{ max: 100, min: 0, now: percent }}
        onLayout={(event) => { trackWidth.current = event.nativeEvent.layout.width; }}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => scrub(event.nativeEvent.locationX)}
        onResponderMove={(event) => scrub(event.nativeEvent.locationX)}
        onStartShouldSetResponder={() => true}
        role="slider"
        style={[styles.track, { height: Math.round(10 * metrics.scale) }]}
      >
        <View style={[styles.fill, { backgroundColor: accent, transform: [{ scaleX: value }] }]} />
      </View>
      <Pressable
        accessibilityLabel={`Increase ${label.toLowerCase()} volume`}
        disabled={value >= 1}
        onPress={() => step(1)}
        role="button"
        style={({ pressed }) => [styles.stepButton, { height: metrics.pointerTarget, width: Math.round(24 * metrics.scale) }, value >= 1 && styles.disabled, pressed && styles.pressed]}
      >
        <Text style={[styles.stepText, { fontSize: metrics.secondaryText }]}>+</Text>
      </Pressable>
      <Text style={[styles.value, { fontSize: metrics.secondaryText, width: Math.round(38 * metrics.scale) }]}>{percent}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.35 },
  fill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, transformOrigin: 'left center' },
  label: { color: '#bda77e', fontFamily: 'Silkscreen' },
  pressed: { opacity: 0.78, transform: [{ translateY: 1 }] },
  row: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  stepButton: { alignItems: 'center', borderColor: '#665139', borderWidth: 1, justifyContent: 'center' },
  stepText: { color: '#e1ca9f', fontFamily: 'Silkscreen' },
  track: { backgroundColor: '#3b372d', borderColor: '#514838', borderWidth: 1, flex: 1, overflow: 'hidden' },
  value: { color: '#fff0c7', fontFamily: 'Silkscreen', textAlign: 'right' },
});
