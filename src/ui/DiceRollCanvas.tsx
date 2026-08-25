import { useEffect, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import { StyleSheet, View } from 'react-native';

import actionCheckDiceAtlasJson from '../../assets/generated/action-check-dice.json';

const diceImageModule = require('../../assets/generated/action-check-dice.png') as number;

type DieFace = 1 | 2 | 3 | 4 | 5 | 6;
type DieOrientationFrameId = `die-t${DieFace}-l${DieFace}-r${DieFace}`;
type DiceFrameId = DieOrientationFrameId | 'soft-flight-shadow' | 'strong-contact-shadow';
type DiceFrame = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  anchors: Readonly<{ groundContact: Readonly<{ x: number; y: number }> }>;
}>;
type DiceManifest = Readonly<{
  canonicalFinals: Readonly<Record<`${DieFace}`, DieOrientationFrameId>>;
  frames: Readonly<Record<DiceFrameId, DiceFrame>>;
}>;
const manifest = actionCheckDiceAtlasJson as unknown as DiceManifest;
const frames = manifest.frames;
const orientationFrameIds = Object.keys(frames).filter((frameId): frameId is DieOrientationFrameId => (
  frameId.startsWith('die-t')
));

function dieFaceKey(value: number): `${DieFace}` {
  if (!Number.isSafeInteger(value) || value < 1 || value > 6) throw new RangeError(`Invalid die face: ${value}`);
  return `${value as DieFace}`;
}

export type DiceRollTimeline = Readonly<{
  elapsedMs: number;
  leftLanded: boolean;
  rightLanded: boolean;
  showArithmetic: boolean;
  showResult: boolean;
  canContinue: boolean;
}>;

export function diceRollEntryProgress(elapsedMs: number, reducedMotion: boolean, hasResult: boolean): number {
  if (!hasResult) return 0;
  return reducedMotion ? 1 : Math.min(1, Math.max(0, elapsedMs) / 1_150);
}

export function sampleDiceRollTimeline(elapsedMs: number, reducedMotion: boolean): DiceRollTimeline {
  const time = Math.max(0, elapsedMs);
  if (reducedMotion) {
    return {
      elapsedMs: Math.min(time, 2_980), leftLanded: time >= 80, rightLanded: time >= 80,
      showArithmetic: time >= 180, showResult: time >= 180, canContinue: time >= 2_980,
    };
  }
  return {
    elapsedMs: Math.min(time, 4_850),
    leftLanded: time >= 1_000,
    rightLanded: time >= 1_150,
    showArithmetic: time >= 1_950,
    showResult: time >= 1_950,
    canContinue: time >= 4_850,
  };
}

function landingPose(elapsedMs: number, landedAt: number, reducedMotion: boolean) {
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
  frameId: DieOrientationFrameId,
  pose: Readonly<{ landed: boolean; rebound: number; squash: number }>,
): void {
  const shadow = frames[pose.landed ? 'strong-contact-shadow' : 'soft-flight-shadow'];
  drawFrame(context, image, shadow, centerX + 9 - shadow.anchors.groundContact.x, 280 - shadow.anchors.groundContact.y);
  const die = frames[frameId];
  const height = die.height - pose.squash;
  drawFrame(
    context, image, die,
    centerX - die.anchors.groundContact.x,
    270 - flightHeight + pose.rebound - die.anchors.groundContact.y * height / die.height,
    die.width, height,
  );
}

function drawDice(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | undefined,
  dice: readonly [number, number] | undefined,
  timeline: DiceRollTimeline,
  reducedMotion: boolean,
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!image || !dice) return;
  context.imageSmoothingEnabled = false;
  const tumble = Math.floor(timeline.elapsedMs / 90);
  const leftFrame = timeline.leftLanded
    ? manifest.canonicalFinals[dieFaceKey(dice[0])]
    : orientationFrameIds[(tumble * 5 + dice[0]) % orientationFrameIds.length]!;
  const rightFrame = timeline.rightLanded
    ? manifest.canonicalFinals[dieFaceKey(dice[1])]
    : orientationFrameIds[(tumble * 7 + dice[1] + 9) % orientationFrameIds.length]!;
  const entry = diceRollEntryProgress(timeline.elapsedMs, reducedMotion, true);
  const arc = Math.round(Math.sin(entry * Math.PI) * 78);
  const bottomEntry = -240 * (1 - entry) + arc;
  drawDie(context, image, Math.round(170 + 40 * entry), bottomEntry, leftFrame, landingPose(timeline.elapsedMs, 1_000, reducedMotion));
  drawDie(context, image, Math.round(350 - 40 * entry), bottomEntry * 0.88, rightFrame, landingPose(timeline.elapsedMs, 1_150, reducedMotion));
}

export function DiceRollCanvas({
  compact = false,
  dice,
  elapsedMs,
  nativeID = 'dice-roll-canvas',
  onReady,
  reducedMotion,
}: Readonly<{
  compact?: boolean;
  dice?: readonly [number, number];
  elapsedMs: number;
  nativeID?: string;
  onReady?: () => void;
  reducedMotion: boolean;
}>) {
  const [image, setImage] = useState<HTMLImageElement>();
  const canvasElement = useRef<HTMLCanvasElement | undefined>(undefined);
  const onReadyRef = useRef(onReady);
  const timeline = sampleDiceRollTimeline(elapsedMs, reducedMotion);

  onReadyRef.current = onReady;

  useEffect(() => {
    const loaded = new window.Image();
    let mounted = true;
    loaded.onload = () => { if (mounted) { setImage(loaded); onReadyRef.current?.(); } };
    loaded.src = Asset.fromModule(diceImageModule).uri;
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const host = document.querySelector(`#${nativeID}`);
    if (!(host instanceof HTMLElement)) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = 520;
    canvas.height = 520;
    Object.assign(canvas.style, { display: 'block', height: '100%', imageRendering: 'pixelated', width: '100%' });
    host.append(canvas);
    canvasElement.current = canvas;
    return () => { canvasElement.current = undefined; canvas.remove(); };
  }, [nativeID]);
  useEffect(() => {
    if (canvasElement.current) drawDice(canvasElement.current, image, dice, timeline, reducedMotion);
  }, [dice, image, reducedMotion, timeline]);

  return <View nativeID={nativeID} pointerEvents="none" style={[styles.canvas, compact && styles.compact]} />;
}

const styles = StyleSheet.create({
  canvas: { alignSelf: 'center', height: 520, maxWidth: 520, width: '94%' },
  compact: { height: 360, maxWidth: 360 },
});
