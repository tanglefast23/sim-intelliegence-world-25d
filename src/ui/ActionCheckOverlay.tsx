import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ActionCheckResult } from '../domain/action-check';
import type { ViewportSize } from '../render/camera';
import type { UiScale } from '../render/responsive-layout';
import type { ActionCheckPreview } from './action-check-copy';
import { DiceRollFlow, type DiceRollCommitResult } from './DiceRollFlow';
import { diceRollEntryProgress, sampleDiceRollTimeline } from './DiceRollCanvas';
import { UI_LAYER } from './ui-layers';
import { uiMetrics } from './ui-metrics';

export type ActionCheckPhase = 'preview' | 'rolling' | 'result';

export function escapeActionForPhase(phase: ActionCheckPhase): 'cancel' | 'continue' | 'none' {
  return phase === 'preview' ? 'cancel' : phase === 'result' ? 'continue' : 'none';
}

export function actionCheckEntryProgress(elapsedMs: number, reducedMotion: boolean, hasResult: boolean): number {
  return diceRollEntryProgress(elapsedMs, reducedMotion, hasResult);
}

export function actionCheckResultAnnouncement(result: ActionCheckResult): string {
  return `${result.dice[0]} + ${result.dice[1]} + ${result.modifier} = ${result.total}. Target ${result.target}. ${result.success ? 'Success' : 'Failure'}.`;
}

export function sampleActionCheckTimeline(elapsedMs: number, reducedMotion: boolean) {
  return sampleDiceRollTimeline(elapsedMs, reducedMotion);
}

export function ActionCheckOverlay({
  accent, active, audioEnabled, preview, result, reducedMotion, surface, uiScale,
  onCancel, onContinue, onPhaseChange, onRoll,
}: Readonly<{
  accent: string;
  active: boolean;
  audioEnabled: boolean;
  preview: ActionCheckPreview;
  result?: ActionCheckResult;
  reducedMotion: boolean;
  surface: ViewportSize;
  uiScale: UiScale;
  onCancel: () => void;
  onContinue: () => void;
  onPhaseChange: (phase: ActionCheckPhase) => void;
  onRoll: () => DiceRollCommitResult;
}>) {
  const [flowComplete, setFlowComplete] = useState(false);
  const phase: ActionCheckPhase = !result ? 'preview' : flowComplete ? 'result' : 'rolling';
  const metrics = uiMetrics(uiScale);
  const compact = surface.height < 680;
  const resultLabel = result?.success ? '✓ SUCCESS' : '× FAILURE';
  const arithmetic = result ? `${result.dice[0]} + ${result.dice[1]} + ${result.modifier} = ${result.total} · TARGET ${result.target}` : '';

  useEffect(() => onPhaseChange(phase), [onPhaseChange, phase]);
  useEffect(() => {
    const target = phase === 'result' ? '#action-check-continue' : phase === 'preview' ? '#dice-roll-flow-roll' : '#dice-roll-flow-root';
    document.querySelector<HTMLElement>(target)?.focus();
  }, [phase]);
  useEffect(() => {
    if (window.siWorldSmokeMode !== true) return undefined;
    window.siWorldPinActionCheck = (timeMs: number) => window.siWorldPinDiceRollFlow?.(timeMs) ?? 0;
    return () => { delete window.siWorldPinActionCheck; };
  }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        const action = escapeActionForPhase(phase);
        if (action === 'cancel') onCancel(); else if (action === 'continue') onContinue();
        return;
      }
      if (event.key !== 'Tab') return;
      event.preventDefault(); event.stopPropagation();
      const controls = [...document.querySelectorAll<HTMLElement>('#world-action-check-overlay [role="button"]')]
        .filter((control) => control.getAttribute('aria-disabled') !== 'true');
      if (controls.length === 0) { document.querySelector<HTMLElement>('#dice-roll-flow-root')?.focus(); return; }
      const current = controls.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current < 0 || current === controls.length - 1 ? 0 : current + 1);
      controls[next]?.focus();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel, onContinue, phase]);

  return <View accessibilityLabel={preview.accessibilityText} aria-modal nativeID="world-action-check-overlay" role="dialog" style={styles.scrim} tabIndex={-1}>
    <View style={[styles.panel, { borderColor: accent, maxHeight: surface.height - 24, padding: metrics.padding, width: Math.min(surface.width - 24, 720) }]}>
      <Text style={[styles.eyebrow, { color: accent }]}>ACTION CHECK</Text>
      <Text style={[styles.title, compact && styles.titleCompact]}>{preview.title}</Text>
      {phase === 'preview' ? <>
        <View style={[styles.rulePlate, compact && styles.rulePlateCompact]}>
          <Text style={styles.rule}>{preview.range}</Text><Text style={styles.rule}>{preview.readiness}</Text>
          <Text style={styles.ruleStrong}>{preview.rule}</Text><Text style={styles.chance}>{preview.chance}</Text>
          <Text style={styles.inputs}>{preview.inputs}</Text>
        </View>
        <View style={styles.stakes}><Text style={styles.successStake}>{preview.successStakes}</Text><Text style={styles.failureStake}>{preview.failureStakes}</Text></View>
      </> : null}
      {phase !== 'result' ? <DiceRollFlow active={active} audioEnabled={audioEnabled && active} dice={result?.dice} onComplete={() => setFlowComplete(true)} onRoll={onRoll} reducedMotion={reducedMotion} surface={surface} /> : <>
        <Text style={styles.arithmetic}>{arithmetic}</Text>
        <Text style={[styles.result, result?.success ? styles.success : styles.failure]}>{resultLabel}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.liveRegion}>{result ? actionCheckResultAnnouncement(result) : ''}</Text>
        <View style={styles.buttons}><Pressable accessibilityLabel="Continue after action check" nativeID="action-check-continue" onPress={onContinue} role="button" style={[styles.primaryButton, { minHeight: metrics.pointerTarget }]}>
          <Text style={styles.buttonText}>CONTINUE</Text>
        </Pressable></View>
      </>}
      {phase === 'preview' ? <View style={styles.buttons}><Pressable accessibilityLabel="Cancel action check" nativeID="action-check-cancel" onPress={onCancel} role="button" style={[styles.secondaryButton, { minHeight: metrics.pointerTarget }]}>
        <Text style={styles.buttonText}>CANCEL</Text>
      </Pressable></View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  arithmetic: { color: '#FFF0C7', fontFamily: 'Silkscreen', fontSize: 13, marginTop: 24, textAlign: 'center' },
  buttonText: { color: '#FFF0C7', fontFamily: 'HFMSilkscreenBold', fontSize: 10 },
  buttons: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 10 },
  chance: { color: '#F1C65B', fontFamily: 'Silkscreen', fontSize: 10, marginTop: 5, textAlign: 'center' },
  eyebrow: { fontFamily: 'HFMSilkscreenBold', fontSize: 8, textAlign: 'center' },
  failure: { backgroundColor: '#5A2C26', borderColor: '#E07A62' },
  failureStake: { backgroundColor: '#281816', borderColor: '#7A3C32', borderWidth: 1, color: '#E6A08D', flex: 1, fontFamily: 'Silkscreen', fontSize: 7, lineHeight: 13, padding: 8 },
  inputs: { color: '#C3B18F', fontFamily: 'Silkscreen', fontSize: 7, lineHeight: 12, marginTop: 5, textAlign: 'center' },
  liveRegion: { height: 1, opacity: 0, overflow: 'hidden', width: 1 },
  panel: { backgroundColor: '#181512F7', borderWidth: 2, overflow: 'hidden', shadowColor: '#2B1A12', shadowOffset: { height: 10, width: 10 }, shadowOpacity: 0.75, shadowRadius: 0 },
  primaryButton: { alignItems: 'center', backgroundColor: '#75452F', borderColor: '#E0AD5C', borderWidth: 2, justifyContent: 'center', minWidth: 130, paddingHorizontal: 18 },
  result: { alignSelf: 'center', borderWidth: 2, color: '#FFF0C7', fontFamily: 'HFMSilkscreenBold', fontSize: 15, marginTop: 18, paddingHorizontal: 14, paddingVertical: 7 },
  rule: { color: '#D4B98A', fontFamily: 'Silkscreen', fontSize: 8, textAlign: 'center' },
  rulePlate: { backgroundColor: '#100D0A', borderColor: '#4A301F', borderWidth: 1, marginTop: 9, padding: 9 },
  rulePlateCompact: { marginTop: 5, padding: 5 },
  ruleStrong: { color: '#FFF0C7', fontFamily: 'HFMSilkscreenBold', fontSize: 10, marginTop: 5, textAlign: 'center' },
  scrim: { alignItems: 'center', backgroundColor: '#2B1A12B8', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0, zIndex: UI_LAYER.cutscene },
  secondaryButton: { alignItems: 'center', backgroundColor: '#30251E', borderColor: '#9A744D', borderWidth: 2, justifyContent: 'center', minWidth: 130, paddingHorizontal: 18 },
  stakes: { borderTopColor: '#4A301F', borderTopWidth: 1, flexDirection: 'row', gap: 8, marginTop: 4, paddingTop: 8 },
  success: { backgroundColor: '#304631', borderColor: '#8FC59A' },
  successStake: { backgroundColor: '#17231A', borderColor: '#3C6747', borderWidth: 1, color: '#9FD0A8', flex: 1, fontFamily: 'Silkscreen', fontSize: 7, lineHeight: 13, padding: 8 },
  title: { color: '#F2E3C3', fontFamily: 'HFMSilkscreenBold', fontSize: 16, marginTop: 3, textAlign: 'center' },
  titleCompact: { fontSize: 12 },
});
