import { StyleSheet, View } from 'react-native';

/**
 * Selection ring, destination pulse, journal pins and the failed-click X, in SCREEN pixels.
 *
 * The 2D renderer draws these four as composite batches of its own (`selection-ring`,
 * `destination-pulse`, `journal-markers`, `failure-marker` in `three/world-renderer.ts`). The 2.5D
 * renderer draws world geometry only and never reads those frame fields, so on `?testRenderer=2-5d`
 * a journal entry printed `PINNED` with nothing on the map, a click showed no pulse, a rejected
 * click showed no X, and the selected character had no ring — the protagonist gets no nameplate
 * either, so selection had no visible state at all.
 *
 * These are player affordances, not world geometry: in 2D three of the four composite ABOVE
 * everything, so a DOM overlay reproduces the same stacking. The caller projects; this file only
 * paints. That keeps the tilted projection in one place and mirrors how `ZoneGate` is fed.
 *
 * The one fidelity gap against 2D: the selection ring composites under characters there and over
 * them here. A ring at the foot is barely occluded either way, and closing it would mean baking
 * ground geometry into `three25`.
 */
export type WorldMarkerVisuals = Readonly<{
  selectionRing: Readonly<{ x: number; y: number; radiusX: number; radiusY: number; color: string; strokeWidth: number }>;
  /** An ellipse, not a circle: the pulse lies on the ground, so the depth axis is compressed. */
  destinationPulse?: Readonly<{ x: number; y: number; radiusX: number; radiusY: number; color: string; opacity: number }>;
  /** `x`/`y` is the pin's FOOT — the point on the ground it names. */
  journalPins: readonly Readonly<{ key: string; x: number; y: number; darkColor: string; lightColor: string }>[];
  failure?: Readonly<{ x: number; y: number; radius: number; color: string }>;
}>;

/** Pin head offset from the foot, in 2D world pixels — `three/world-renderer.ts` uses the same. */
const PIN_HEAD_X = -10;
const PIN_HEAD_Y = -30;
/** Where the stalk meets the ground, relative to the foot, in 2D world pixels. */
const PIN_TAIL_X = -4;
const PIN_TAIL_Y = -5;

type BarProps = Readonly<{
  color: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  width: number;
}>;

/** A straight stroke between two screen points, as one rotated View. */
function Bar({ color, fromX, fromY, toX, toY, width }: BarProps) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  return (
    <View
      style={{
        backgroundColor: color,
        height: width,
        left: fromX + dx / 2 - length / 2,
        position: 'absolute',
        top: fromY + dy / 2 - width / 2,
        transform: [{ rotate: `${(Math.atan2(dy, dx) * 180) / Math.PI}deg` }],
        width: length,
      }}
    />
  );
}

type DotProps = Readonly<{ color: string; radius: number; x: number; y: number; opacity?: number }>;

function Dot({ color, opacity, radius, x, y }: DotProps) {
  return (
    <View
      style={{
        backgroundColor: color,
        borderRadius: radius,
        height: radius * 2,
        left: x - radius,
        opacity,
        position: 'absolute',
        top: y - radius,
        width: radius * 2,
      }}
    />
  );
}

export function WorldMarkerOverlay({ markers, zoom }: Readonly<{ markers: WorldMarkerVisuals; zoom: number }>) {
  const { destinationPulse, failure, journalPins, selectionRing } = markers;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      nativeID="world-markers"
      pointerEvents="none"
      style={styles.overlay}
    >
      <View
        style={{
          borderColor: selectionRing.color,
          borderRadius: Math.max(selectionRing.radiusX, selectionRing.radiusY),
          borderWidth: selectionRing.strokeWidth,
          height: selectionRing.radiusY * 2,
          left: selectionRing.x - selectionRing.radiusX,
          position: 'absolute',
          top: selectionRing.y - selectionRing.radiusY,
          width: selectionRing.radiusX * 2,
        }}
      />
      {destinationPulse ? (
        <View
          style={{
            backgroundColor: destinationPulse.color,
            borderRadius: Math.max(destinationPulse.radiusX, destinationPulse.radiusY),
            height: destinationPulse.radiusY * 2,
            left: destinationPulse.x - destinationPulse.radiusX,
            opacity: destinationPulse.opacity,
            position: 'absolute',
            top: destinationPulse.y - destinationPulse.radiusY,
            width: destinationPulse.radiusX * 2,
          }}
        />
      ) : null}
      {journalPins.map((pin) => {
        const headX = pin.x + PIN_HEAD_X * zoom;
        const headY = pin.y + PIN_HEAD_Y * zoom;
        const tailX = pin.x + PIN_TAIL_X * zoom;
        const tailY = pin.y + PIN_TAIL_Y * zoom;
        return (
          <View key={pin.key} style={styles.overlay}>
            <Bar color={pin.darkColor} fromX={headX} fromY={headY + 4 * zoom} toX={tailX} toY={tailY} width={4 * zoom} />
            <Bar color={pin.lightColor} fromX={headX} fromY={headY + 4 * zoom} toX={tailX} toY={tailY} width={2 * zoom} />
            <Dot color={pin.darkColor} radius={7 * zoom} x={headX} y={headY} />
            <Dot color={pin.lightColor} radius={5 * zoom} x={headX} y={headY} />
            <Dot color={pin.darkColor} radius={2 * zoom} x={headX} y={headY} />
          </View>
        );
      })}
      {failure ? (
        <View style={styles.overlay}>
          <Bar
            color={failure.color}
            fromX={failure.x - failure.radius}
            fromY={failure.y - failure.radius}
            toX={failure.x + failure.radius}
            toY={failure.y + failure.radius}
            width={3}
          />
          <Bar
            color={failure.color}
            fromX={failure.x + failure.radius}
            fromY={failure.y - failure.radius}
            toX={failure.x - failure.radius}
            toY={failure.y + failure.radius}
            width={3}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
});
