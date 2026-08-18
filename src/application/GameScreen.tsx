import { useCallback, useEffect, useState } from 'react';

import { createInitialState } from '../domain/state/initial-state';
import { useAudioEnabled, useInterfaceSounds } from '../audio/halcyra-audio';
import { setAudioVolumes } from '../audio/volume-store';
import type { WorldState } from '../domain/state/schema';
import { WorldScene } from '../render/WorldScene';
import { WorldErrorBoundary } from '../ui/WorldErrorBoundary';
import type { RendererKind } from '../render/renderer-selection';
import { getDesktopBridge } from './DesktopBridge';
import { LoadingShell } from './LoadingShell';
import { NewGameFlow } from './NewGameFlow';
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  type PresentationPreferences,
  type RendererPresentationPatch,
} from './presentation/preferences';
import type { ViewportSize } from '../render/camera';

type GameSession = Readonly<{
  key: string;
  saveGeneration: number | null;
  saveStatus: string;
  state: WorldState;
  worldFeedback: string;
  preferences: PresentationPreferences;
  newGame: boolean;
}>;

type BootState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'new'; busy: boolean; preferences: PresentationPreferences; error?: string }>
  | Readonly<{ status: 'active'; session: GameSession }>
  | Readonly<{ status: 'failed'; detail: string }>;

type GameScreenProps = Readonly<{ onWorldReady: () => void; rendererKind: RendererKind; surface: ViewportSize }>;

export function GameScreen({ onWorldReady, rendererKind, surface }: GameScreenProps) {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });
  const audioEnabled = useAudioEnabled();
  const playInterfaceSound = useInterfaceSounds(audioEnabled);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setBoot({ status: 'new', busy: false, preferences: DEFAULT_PRESENTATION_PREFERENCES });
      return;
    }
    let active = true;
    void Promise.all([bridge.loadSave('slot-001'), bridge.loadPresentationPreferences()]).then(([result, preferences]) => {
      if (!active) return;
      setAudioVolumes({ music: preferences.musicVolume, sfx: preferences.sfxVolume });
      if (result.status === 'unchanged' || result.status === 'migrated') {
        setBoot({
          status: 'active',
          session: {
            key: `save-${result.saveGeneration}`,
            saveGeneration: result.saveGeneration,
            saveStatus: `${result.status === 'migrated' ? 'MIGRATED' : 'LOADED'} GEN ${result.saveGeneration}`,
            state: result.state,
            worldFeedback: `WELCOME BACK, ${result.state.protagonist.displayName.toUpperCase()}.`,
            preferences,
            newGame: false,
          },
        });
      } else if (result.status === 'empty') {
        setBoot({ status: 'new', busy: false, preferences });
      } else if (result.status === 'incompatible') {
        setBoot({
          status: 'failed',
          detail: `This save uses an incompatible game or content version. ${result.incompatibleCandidateCount} file${result.incompatibleCandidateCount === 1 ? '' : 's'} were preserved.`,
        });
      } else if (result.status === 'corrupt') {
        setBoot({
          status: 'failed',
          detail: `Save recovery found ${result.corruptCandidateCount} damaged file${result.corruptCandidateCount === 1 ? '' : 's'}. The files were preserved.`,
        });
      } else {
        setBoot({
          status: 'failed',
          detail: 'The save layout could not migrate to this island build. Every source file was preserved.',
        });
      }
    }).catch(() => {
      if (active) setBoot({ status: 'failed', detail: 'The save service did not answer. Your existing files were not changed.' });
    });
    return () => { active = false; };
  }, []);

  const startNewGame = useCallback((displayName: string) => {
    playInterfaceSound('confirm');
    const state = createInitialState(displayName);
    const bridge = getDesktopBridge();
    const preferences = boot.status === 'new' ? boot.preferences : DEFAULT_PRESENTATION_PREFERENCES;
    setBoot({ status: 'new', busy: true, preferences });
    if (!bridge) {
      setBoot({
        status: 'active',
        session: {
          key: 'browser-session',
          saveGeneration: null,
          saveStatus: 'BROWSER · NO DISK SAVE',
          state,
          worldFeedback: 'WELCOME TO HALCYRA · $800 WEEKLY ALLOWANCE RECEIVED.',
          preferences,
          newGame: true,
        },
      });
      return;
    }
    void bridge.requestSave({
      slotId: 'slot-001', expectedSaveGeneration: null, trigger: 'manual', state,
    }).then((result) => {
      if (result.status !== 'saved') {
        setBoot({ status: 'new', busy: false, error: 'The island could not create a stable save. Try again.', preferences });
        return;
      }
      setBoot({
        status: 'active',
        session: {
          key: `new-${result.saveGeneration}`,
          saveGeneration: result.saveGeneration,
          saveStatus: `SAVED GEN ${result.saveGeneration}`,
          state,
          worldFeedback: 'WELCOME TO HALCYRA · $800 WEEKLY ALLOWANCE RECEIVED.',
          preferences,
          newGame: true,
        },
      });
    }).catch(() => {
      setBoot({ status: 'new', busy: false, error: 'The save write failed. No new game was started.', preferences });
    });
  }, [boot, playInterfaceSound]);

  const savePresentationPreferences = useCallback((patch: RendererPresentationPatch) => {
    const bridge = getDesktopBridge();
    if (bridge) void bridge.savePresentationPreferences(patch);
  }, []);

  if (boot.status === 'loading') return <LoadingShell detail="Checking your Halcyra save…" surface={surface} />;
  if (boot.status === 'failed') return <LoadingShell detail={boot.detail} failed surface={surface} />;
  if (boot.status === 'new') {
    return <NewGameFlow audioEnabled={audioEnabled} busy={boot.busy} error={boot.error} onStart={startNewGame} surface={surface} />;
  }
  return (
    <WorldErrorBoundary key={`boundary-${boot.session.key}`}>
      <WorldScene
        initialFeedback={boot.session.worldFeedback}
        initialSaveGeneration={boot.session.saveGeneration}
        initialSaveStatus={boot.session.saveStatus}
        initialState={boot.session.state}
        initialPresentationPreferences={boot.session.preferences}
        audioEnabled={audioEnabled}
        newGame={boot.session.newGame}
        onPresentationPreferencesChange={savePresentationPreferences}
        onWorldReady={onWorldReady}
        playInterfaceSound={playInterfaceSound}
        rendererKind={rendererKind}
        surface={surface}
        key={boot.session.key}
      />
    </WorldErrorBoundary>
  );
}
