import type { ReactNode } from 'react';

import { DEFAULT_PRESENTATION_PREFERENCES } from '../../application/presentation/preferences';
import { parseWorldState } from '../../domain/state/schema';
import { centerCameraOnTile, type ViewportSize } from '../../render/camera';
import { WorldScene } from '../../render/WorldScene';
import type { DevHarnessRoutableEntry } from './route';
import { devHarnessGoldenHourState } from './scenario-state';

export interface DevHarnessCase {
  readonly id: string;
  readonly label: string;
  readonly note?: string;
}

export interface DevHarnessEntry extends DevHarnessRoutableEntry {
  readonly title: string;
  readonly summary: string;
  readonly cases: readonly DevHarnessCase[];
  readonly render: (caseId: string, surface: ViewportSize) => ReactNode;
}

const MAP_PIXELS = { width: 64 * 32, height: 48 * 32 } as const;

function vampireWalkState() {
  const base = devHarnessGoldenHourState('northwest_residential');
  return parseWorldState({
    ...base,
    clock: { ...base.clock, selectedSpeed: 1 },
  });
}

const vampireScene: DevHarnessEntry = {
  id: 'vampire-scene',
  group: 'World',
  title: 'Vampire in Sunward Villas',
  summary: 'You are the pencil vampire. Click a tile to walk.',
  cases: [{
    id: 'walk',
    label: 'WALK',
    note: 'Click the ground. The player is vampire-01. Speed is 1 so the walk loop runs.',
  }],
  render: (_caseId, surface) => {
    const state = vampireWalkState();
    const tile = {
      x: state.protagonist.worldPosition.tileX,
      y: state.protagonist.worldPosition.tileY,
    };
    const camera = centerCameraOnTile(tile, 3, surface, MAP_PIXELS);
    return (
      <WorldScene
        forceAmbientMotion
        initialFeedback="DEV HARNESS · CLICK TO WALK"
        initialPresentationPreferences={{
          ...DEFAULT_PRESENTATION_PREFERENCES,
          worldZoom: 3,
          camera: { mapId: 'northwest_residential', x: Math.round(camera.x), y: Math.round(camera.y) },
        }}
        initialSaveGeneration={null}
        initialSaveStatus="DEV HARNESS · NO DISK SAVE"
        initialState={state}
        newGame={false}
        onPresentationPreferencesChange={() => undefined}
        persistenceDisabled
        surface={surface}
      />
    );
  },
};

export const DEV_HARNESS_ENTRIES: readonly DevHarnessEntry[] = Object.freeze([
  vampireScene,
]);
