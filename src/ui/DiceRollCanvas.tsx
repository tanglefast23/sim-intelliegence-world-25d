import { useEffect, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import { StyleSheet, View } from 'react-native';

import actionCheckDiceAtlasJson from '../../assets/generated/action-check-dice.json';

const diceImageModule = require('../../assets/generated/action-check-dice.png') as number;

type DiceFrameId = `die-${1 | 2 | 3 | 4 | 5 | 6}` | 'soft-flight-shadow' | 'strong-contact-shadow';
type DiceFrame = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  anchors: Readonly<{ groundContact: Readonly<{ x: number; y: number }> }>;
}>;
const frames = actionCheckDiceAtlasJson.frames as Readonly<Record<DiceFrameId, DiceFrame>>;

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
  return reducedMotion ? 1 : Math.min(1, Math.max(0, elapsedMs) / 500);
}

export function sampleDiceRollTimeline(elapsedMs: number, reducedMotion: boolean): DiceRollTimeline {
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
  face: number,
  pose: Readonly<{ landed: boolean; rebound: number; squash: number }>,
): void {
  const shadow = frames[pose.landed ? 'strong-contact-shadow' : 'soft-flight-shadow'];
  drawFrame(context, image, shadow, centerX + 9 - shadow.anchors.groundContact.x, 220 - shadow.anchors.groundContact.y);
  const die = frames[`die-${face}` as DiceFrameId];
  const height = die.height - pose.squash;
  drawFrame(
    context, image, die,
    centerX - die.anchors.groundContact.x,
    210 - flightHeight + pose.rebound - die.anchors.groundContact.y * height / die.height,
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
  const leftFace = timeline.leftLanded ? dice[0] : (tumble % 6) + 1;
  const rightFace = timeline.rightLanded ? dice[1] : ((tumble + 3) % 6) + 1;
  const entry = diceRollEntryProgress(timeline.elapsedMs, reducedMotion, true);
  const arc = Math.round(Math.sin(entry * Math.PI) * 55);
  drawDie(context, image, Math.round(-80 + 235 * entry), arc, leftFace, landingPose(timeline.elapsedMs, 780, reducedMotion));
  drawDie(context, image, Math.round(600 - 235 * entry), arc, rightFace, landingPose(timeline.elapsedMs, 900, reducedMotion));
}

export function DiceRollCanvas({
  compact = false,
  dice,
  elapsedMs,
  nativeID = 'dice-roll-canvas',
  reducedMotion,
}: Readonly<{
  compact?: boolean;
  dice?: readonly [number, number];
  elapsedMs: number;
  nativeID?: string;
  reducedMotion: boolean;
}>) {
  const [image, setImage] = useState<HTMLImageElement>();
  const canvasElement = useRef<HTMLCanvasElement | undefined>(undefined);
  const timeline = sampleDiceRollTimeline(elapsedMs, reducedMotion);

  useEffect(() => {
    const loaded = new window.Image();
    let mounted = true;
    loaded.onload = () => { if (mounted) setImage(loaded); };
    loaded.src = Asset.fromModule(diceImageModule).uri;
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const host = document.querySelector(`#${nativeID}`);
    if (!(host instanceof HTMLElement)) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = 520;
    canvas.height = 260;
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
  canvas: { alignSelf: 'center', aspectRatio: 2, maxWidth: 520, width: '94%' },
  compact: { maxWidth: 360 },
});
