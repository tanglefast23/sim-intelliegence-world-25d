import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

export type ZoneGateCell = Readonly<{ key: string; left: number; top: number }>;

export type ZoneGateVisual = Readonly<{
  id: string;
  label: string;
  armed: boolean;
  cells: readonly ZoneGateCell[];
  labelX: number;
  labelY: number;
}>;

type ZoneGateOverlayProps = Readonly<{
  accent: string;
  /**
   * Shears each square pad into the shape a tile actually projects to. Undefined on the 2D path,
   * where a tile is an axis-aligned square already; the tilted path passes a rotate-and-flatten
   * that turns the square into the same diamond the renderer draws the tile as. `cells` are
   * positioned from the tile centre whenever this is set, because the transform pivots there.
   */
  cellTransform?: ViewStyle['transform'];
  gates: readonly ZoneGateVisual[];
  size: number;
  viewport: Readonly<{ width: number; height: number }>;
}>;

const LABEL_WIDTH = 152;

function onScreen(gate: ZoneGateVisual, size: number, viewport: Readonly<{ width: number; height: number }>): boolean {
  // One `size` of slack on every edge: a sheared pad reaches wider than its untransformed box, so a
  // tight test drops the pad that is half on screen — the one the player is walking onto.
  return gate.cells.some((cell) => (
    cell.left + size * 2 > 0 && cell.left < viewport.width + size
    && cell.top + size * 2 > 0 && cell.top < viewport.height + size
  ));
}

/** Paints the travel pad in front of each map portal and names the neighborhood it leads to. */
export function ZoneGateOverlay({ accent, cellTransform, gates, size, viewport }: ZoneGateOverlayProps) {
  const visible = gates.filter((gate) => onScreen(gate, size, viewport));
  if (visible.length === 0) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      nativeID="world-zone-gates"
      pointerEvents="none"
      style={styles.overlay}
    >
      {visible.map((gate) => (
        <View key={gate.id} style={styles.overlay}>
          {gate.cells.map((cell) => (
            <View
              key={`${gate.id}:${cell.key}`}
              style={[styles.cell, {
                backgroundColor: `${accent}${gate.armed ? '59' : '2e'}`,
                borderColor: `${accent}${gate.armed ? 'b3' : '5c'}`,
                height: size,
                left: cell.left,
                top: cell.top,
                transform: cellTransform,
                width: size,
              }]}
            />
          ))}
          <View style={[styles.nameplate, {
            borderBottomColor: accent,
            left: Math.round(gate.labelX - LABEL_WIDTH / 2),
            top: Math.round(gate.labelY),
          }]}>
            <Text numberOfLines={1} style={styles.name}>{`→ ${gate.label.toUpperCase()}`}</Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {gate.armed ? 'ENTERING…' : 'STAND HERE TO TRAVEL'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { borderWidth: 1, position: 'absolute' },
  name: { color: '#fff0c7', fontFamily: 'Silkscreen', fontSize: 9 },
  nameplate: {
    alignItems: 'center',
    backgroundColor: '#10130fe8',
    borderBottomWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
    position: 'absolute',
    width: LABEL_WIDTH,
  },
  overlay: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  subtitle: { color: '#9fc58e', fontFamily: 'Silkscreen', fontSize: 7, marginTop: 2 },
});
