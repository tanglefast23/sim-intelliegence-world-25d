import { useEffect, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import actionCheckDiceAtlasJson from '../../assets/generated/action-check-dice.json';
import type { ActionCheckResult } from '../domain/action-check';
import type { ViewportSize } from '../render/camera';
import type { UiScale } from '../render/responsive-layout';
import { UI_LAYER } from './ui-layers';
import { uiMetrics } from './ui-metrics';
import type { ActionCheckPreview } from './action-check-copy';

const actionCheckDiceImage = require('../../assets/generated/action-check-dice.png') as number;

type DiceFrameId = `die-${1 | 2 | 3 | 4 | 5 | 6}` | 'soft-flight-shadow' | 'strong-contact-shadow';
type DiceFrame = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  anchors: Readonly<{ groundContact: Readonly<{ x: number; y: number }> }>;
}>;
const diceFrames = actionCheckDiceAtlasJson.frames as Readonly<Record<DiceFrameId, DiceFrame>>;

export type ActionCheckPhase = 'preview' | 'rolling' | 'result';

export function escapeActionForPhase(phase: ActionCheckPhase): 'cancel' | 'continue' | 'none' {
  return phase === 'preview' ? 'cancel' : phase === 'result' ? 'continue' : 'none';
}

export function actionCheckEntryProgress(elapsedMs: number, reducedMotion: boolean, hasResult: boolean): number {
  if (!hasResult) return 0;
  return reducedMotion ? 1 : Math.min(1, Math.max(0, elapsedMs) / 500);
}

export function actionCheckResultAnnouncement(result: ActionCheckResult): string {
  return `${result.dice[0]} + ${result.dice[1]} + ${result.modifier} = ${result.total}. Target ${result.target}. ${result.success ? 'Success' : 'Failure'}.`;
}

export type ActionCheckTimeline = Readonly<{
  elapsedMs: number;
  leftLanded: boolean;
  rightLanded: boolean;
  showArithmetic: boolean;
  showResult: boolean;
  canContinue: boolean;
}>;

export function sampleActionCheckTimeline(elapsedMs: number, reducedMotion: boolean): ActionCheckTimeline {
  const time = Math.max(0, elapsedMs);
  if (reducedMotion) {
    return {
      elapsedMs: Math.min(time, 180), leftLanded: true, rightLanded: true,
      showArithmetic: true, showResult: time >= 120, canContinue: time >= 180,
    };
  }
  return {
    elapsedMs: Math.min(time, 1_650),
    leftLanded: time >= 780,
    rightLanded: time >= 900,
    showArithmetic: time >= 1_100,
    showResult: time >= 1_350,
    canContinue: time >= 1_650,
  };
}

type DieLandingPose = Readonly<{ landed: boolean; rebound: number; squash: number }>;

function landingPose(elapsedMs: number, landedAt: number, reducedMotion: boolean): DieLandingPose {
  if (reducedMotion) return { landed: true, rebound: 0, squash: 0 };
  const age = elapsedMs - landedAt;
  if (age < 0) return { landed: false, rebound: 0, squash: 0 };
  if (age < 70) return { landed: true, rebound: 0, squash: 2 };
  if (age < 145) return { landed: true, rebound: -2, squash: 0 };
  return { landed: true, rebound: 0, squash: 0 };
}

function drawFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  frame: DiceFrame,
  x: number,
  y: number,
  width = frame.width,
  height = frame.height,
): void {
  context.drawImage(image, frame.x, frame.y, frame.width, frame.height, x, y, width, height);
}

function drawDie(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  centerX: number,
  flightHeight: number,
  face: number,
  pose: DieLandingPose,
): void {
  const shadow = diceFrames[pose.landed ? 'strong-contact-shadow' : 'soft-flight-shadow'];
  drawFrame(
    context,
    image,
    shadow,
    centerX + 9 - shadow.anchors.groundContact.x,
    220 - shadow.anchors.groundContact.y,
  );
  const die = diceFrames[`die-${face}` as DiceFrameId];
  const height = die.height - pose.squash;
  const scaleY = height / die.height;
  drawFrame(
    context,
    image,
    die,
    centerX - die.anchors.groundContact.x,
    210 - flightHeight + pose.rebound - die.anchors.groundContact.y * scaleY,
    die.width,
    height,
  );
}

function drawDice(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | undefined,
  result: ActionCheckResult | undefined,
  timeline: ActionCheckTimeline,
  reducedMotion: boolean,
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!image || !result) return;
  context.imageSmoothingEnabled = false;
  const tumble = Math.floor(timeline.elapsedMs / 90);
  const leftFace = timeline.leftLanded ? result.dice[0] : (tumble % 6) + 1;
  const rightFace = timeline.rightLanded ? result.dice[1] : ((tumble + 3) % 6) + 1;
  const entry = actionCheckEntryProgress(timeline.elapsedMs, reducedMotion, true);
  const leftX = Math.round(-80 + 235 * entry);
  const rightX = Math.round(600 - 235 * entry);
  const arc = Math.round(Math.sin(entry * Math.PI) * 55);
  drawDie(context, image, leftX, arc, leftFace, landingPose(timeline.elapsedMs, 780, reducedMotion));
  drawDie(context, image, rightX, arc, rightFace, landingPose(timeline.elapsedMs, 900, reducedMotion));
}

export function ActionCheckOverlay({
  accent,
  preview,
  result,
  reducedMotion,
  surface,
  uiScale,
  onCancel,
  onContinue,
  onPhaseChange,
  onRoll,
}: Readonly<{
  accent: string;
  preview: ActionCheckPreview;
  result?: ActionCheckResult;
  reducedMotion: boolean;
  surface: ViewportSize;
  uiScale: UiScale;
  onCancel: () => void;
  onContinue: () => void;
  onPhaseChange: (phase: ActionCheckPhase) => void;
  onRoll: () => void;
}>) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [diceAtlas, setDiceAtlas] = useState<HTMLImageElement>();
  const canvasElement = useRef<HTMLCanvasElement | undefined>(undefined);
  const pinned = useRef(false);
  const timeline = sampleActionCheckTimeline(elapsedMs, reducedMotion);
  const phase: ActionCheckPhase = !result ? 'preview' : timeline.canContinue ? 'result' : 'rolling';
  const metrics = uiMetrics(uiScale);
  const compact = surface.height < 680;
  const resultLabel = result?.success ? '✓ SUCCESS' : '× FAILURE';
  const arithmetic = result ? `${result.dice[0]} + ${result.dice[1]} + ${result.modifier} = ${result.total} · TARGET ${result.target}` : '';

  useEffect(() => onPhaseChange(phase), [onPhaseChange, phase]);
  useEffect(() => {
    const target = phase === 'preview'
      ? '#action-check-roll'
      : phase === 'result'
        ? '#action-check-continue'
        : '#world-action-check-overlay';
    document.querySelector<HTMLElement>(target)?.focus();
  }, [phase]);
  useEffect(() => {
    if (!result) {
      pinned.current = false;
      setElapsedMs(0);
      return undefined;
    }
    pinned.current = false;
    const startedAt = performance.now();
    const endAt = reducedMotion ? 180 : 1_650;
    let frame = 0;
    const step = (time: number) => {
      if (pinned.current) return;
      setElapsedMs(time - startedAt);
      if (time - startedAt < endAt) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, result]);
  useEffect(() => {
    const image = new window.Image();
    let mounted = true;
    image.onload = () => { if (mounted) setDiceAtlas(image); };
    image.src = Asset.fromModule(actionCheckDiceImage).uri;
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const host = document.querySelector('#action-check-canvas');
    if (!(host instanceof HTMLElement)) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = 520;
    canvas.height = 260;
    canvas.style.display = 'block';
    canvas.style.height = '100%';
    canvas.style.imageRendering = 'pixelated';
    canvas.style.width = '100%';
    host.append(canvas);
    canvasElement.current = canvas;
    return () => {
      canvasElement.current = undefined;
      canvas.remove();
    };
  }, []);
  useEffect(() => {
    if (canvasElement.current) drawDice(canvasElement.current, diceAtlas, result, timeline, reducedMotion);
  }, [diceAtlas, reducedMotion, result, timeline]);
  useEffect(() => {
    if (window.siWorldSmokeMode !== true) return undefined;
    window.siWorldPinActionCheck = (timeMs: number) => {
      const pinnedTime = Math.max(0, Math.min(reducedMotion ? 180 : 1_650, timeMs));
      pinned.current = true;
      setElapsedMs(pinnedTime);
      return pinnedTime;
    };
    return () => { delete window.siWorldPinActionCheck; };
  }, [reducedMotion]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        const action = escapeActionForPhase(phase);
        if (action === 'cancel') onCancel();
        else if (action === 'continue') onContinue();
        return;
      }
      if (event.key !== 'Tab') return;
      event.stopPropagation();
      event.preventDefault();
      if (phase === 'rolling') {
        document.querySelector<HTMLElement>('#world-action-check-overlay')?.focus();
        return;
      }
      const controls = [...document.querySelectorAll<HTMLElement>('#world-action-check-overlay [role="button"]')]
        .filter((control) => control.getAttribute('aria-disabled') !== 'true');
      if (controls.length === 0) return;
      const current = controls.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? (current <= 0 ? controls.length - 1 : current - 1)
        : (current < 0 || current === controls.length - 1 ? 0 : current + 1);
      controls[next]?.focus();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel, onContinue, phase]);

  return <View
    accessibilityLabel={preview.accessibilityText}
    aria-modal
    nativeID="world-action-check-overlay"
    role="dialog"
    style={styles.scrim}
    tabIndex={-1}
  >
    <View style={[styles.panel, { borderColor: accent, maxHeight: surface.height - 24, padding: metrics.padding, width: Math.min(surface.width - 24, 720) }]}>
      <Text style={[styles.eyebrow, { color: accent }]}>ACTION CHECK</Text>
      <Text style={[styles.title, compact && styles.titleCompact]}>{preview.title}</Text>
      <View style={[styles.rulePlate, compact && styles.rulePlateCompact]}>
        <Text style={styles.rule}>{preview.range}</Text>
        <Text style={styles.rule}>{preview.readiness}</Text>
        <Text style={styles.ruleStrong}>{preview.rule}</Text>
        <Text style={styles.chance}>{preview.chance}</Text>
        <Text style={styles.inputs}>{preview.inputs}</Text>
      </View>
      <View nativeID="action-check-canvas" pointerEvents="none" style={[styles.canvas, compact && styles.canvasCompact]} />
      {result && timeline.showArithmetic ? <Text style={styles.arithmetic}>{arithmetic}</Text> : null}
      {result && timeline.showResult ? <Text style={[styles.result, result.success ? styles.success : styles.failure]}>{resultLabel}</Text> : null}
      <Text accessibilityLiveRegion="polite" style={styles.liveRegion}>
        {result && timeline.showResult ? actionCheckResultAnnouncement(result) : ''}
      </Text>
      {!result ? <View style={styles.stakes}>
        <Text style={styles.successStake}>{preview.successStakes}</Text>
        <Text style={styles.failureStake}>{preview.failureStakes}</Text>
      </View> : null}
      <View style={styles.buttons}>
        {phase === 'preview' ? <>
          <Pressable accessibilityLabel="Roll action check" nativeID="action-check-roll" onPress={onRoll} role="button" style={[styles.primaryButton, { minHeight: metrics.pointerTarget }]}>
            <Text style={styles.buttonText}>ROLL</Text>
          </Pressable>
          <Pressable accessibilityLabel="Cancel action check" nativeID="action-check-cancel" onPress={onCancel} role="button" style={[styles.secondaryButton, { minHeight: metrics.pointerTarget }]}>
            <Text style={styles.buttonText}>CANCEL</Text>
          </Pressable>
        </> : phase === 'result' ? <Pressable accessibilityLabel="Continue after action check" nativeID="action-check-continue" onPress={onContinue} role="button" style={[styles.primaryButton, { minHeight: metrics.pointerTarget }]}>
          <Text style={styles.buttonText}>CONTINUE</Text>
        </Pressable> : <Text style={styles.rolling}>ROLLING…</Text>}
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  arithmetic: { color: '#FFF0C7', fontFamily: 'Silkscreen', fontSize: 13, marginTop: 2, textAlign: 'center' },
  buttonText: { color: '#FFF0C7', fontFamily: 'Silkscreen', fontSize: 10 },
  buttons: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 10 },
  canvas: { alignSelf: 'center', aspectRatio: 2, maxWidth: 520, width: '94%' },
  canvasCompact: { maxWidth: 360 },
  chance: { color: '#F1C65B', fontFamily: 'Silkscreen', fontSize: 10, marginTop: 5, textAlign: 'center' },
  eyebrow: { fontFamily: 'Silkscreen', fontSize: 8, textAlign: 'center' },
  failure: { backgroundColor: '#5A2C26', borderColor: '#E07A62' },
  failureStake: { backgroundColor: '#281816', borderColor: '#7A3C32', borderWidth: 1, color: '#E6A08D', flex: 1, fontFamily: 'Silkscreen', fontSize: 7, lineHeight: 13, padding: 8 },
  inputs: { color: '#C3B18F', fontFamily: 'Silkscreen', fontSize: 7, lineHeight: 12, marginTop: 5, textAlign: 'center' },
  liveRegion: { height: 1, opacity: 0, overflow: 'hidden', width: 1 },
  panel: { backgroundColor: '#181512F7', borderWidth: 2, overflow: 'hidden', shadowColor: '#2B1A12', shadowOffset: { height: 10, width: 10 }, shadowOpacity: 0.75, shadowRadius: 0 },
  primaryButton: { alignItems: 'center', backgroundColor: '#75452F', borderColor: '#E0AD5C', borderWidth: 2, justifyContent: 'center', minWidth: 130, paddingHorizontal: 18 },
  result: { alignSelf: 'center', borderWidth: 2, color: '#FFF0C7', fontFamily: 'Silkscreen', fontSize: 15, marginTop: 8, paddingHorizontal: 14, paddingVertical: 7 },
  rolling: { color: '#F1C65B', fontFamily: 'Silkscreen', fontSize: 10, padding: 12 },
  rule: { color: '#D4B98A', fontFamily: 'Silkscreen', fontSize: 8, textAlign: 'center' },
  rulePlate: { backgroundColor: '#100D0A', borderColor: '#4A301F', borderWidth: 1, marginTop: 9, padding: 9 },
  rulePlateCompact: { marginTop: 5, padding: 5 },
  ruleStrong: { color: '#FFF0C7', fontFamily: 'Silkscreen', fontSize: 10, marginTop: 5, textAlign: 'center' },
  scrim: { alignItems: 'center', backgroundColor: '#2B1A12B8', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0, zIndex: UI_LAYER.cutscene },
  secondaryButton: { alignItems: 'center', backgroundColor: '#30251E', borderColor: '#9A744D', borderWidth: 2, justifyContent: 'center', minWidth: 130, paddingHorizontal: 18 },
  stakes: { borderTopColor: '#4A301F', borderTopWidth: 1, flexDirection: 'row', gap: 8, marginTop: 4, paddingTop: 8 },
  success: { backgroundColor: '#304631', borderColor: '#8FC59A' },
  successStake: { backgroundColor: '#17231A', borderColor: '#3C6747', borderWidth: 1, color: '#9FD0A8', flex: 1, fontFamily: 'Silkscreen', fontSize: 7, lineHeight: 13, padding: 8 },
  title: { color: '#F2E3C3', fontFamily: 'Silkscreen', fontSize: 16, marginTop: 3, textAlign: 'center' },
  titleCompact: { fontSize: 12 },
});
