import { useCallback, useEffect, useRef, useState } from 'react';

import { rollTwoDice } from '../domain/action-check';
import { createInitialState, INITIAL_STATE_SEED } from '../domain/state/initial-state';
import { useAudioEnabled, useInterfaceSounds } from '../audio/halcyra-audio';
import { setAudioVolumes } from '../audio/volume-store';
import type { WorldState } from '../domain/state/schema';
import { WorldScene } from '../render/WorldScene';
import { WorldErrorBoundary } from '../ui/WorldErrorBoundary';
import type { RendererKind } from '../render/renderer-selection';
import { getSavePort } from './SavePort';
import { LoadingShell } from './LoadingShell';
import { NewGameFlow } from './NewGameFlow';
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  type PresentationPreferences,
  type RendererPresentationPatch,
} from './presentation/preferences';
import type { ViewportSize } from '../render/camera';
import { AlarmIntroOverlay, type AlarmIntroRoll } from '../ui/AlarmIntroOverlay';

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
  | Readonly<{
    status: 'intro';
    state: WorldState;
    preferences: PresentationPreferences;
    roll?: AlarmIntroRoll;
    saveStatus: 'idle' | 'saving' | 'saved' | 'failed';
    saveGeneration?: number;
    saveError?: string;
  }>
  | Readonly<{ status: 'active'; session: GameSession }>
  | Readonly<{ status: 'failed'; detail: string }>;

type GameScreenProps = Readonly<{ onWorldReady: () => void; rendererKind: RendererKind; surface: ViewportSize }>;

export function newGameSeed(
  smokeMode: boolean,
  fillRandom: (values: Uint32Array<ArrayBuffer>) => Uint32Array<ArrayBuffer> = (values) => globalThis.crypto.getRandomValues(values),
): number {
  if (smokeMode) return INITIAL_STATE_SEED;
  return fillRandom(new Uint32Array(1))[0]!;
}

export function GameScreen({ onWorldReady, rendererKind, surface }: GameScreenProps) {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });
  const startingNewGame = useRef(false);
  const introRollCommitted = useRef(false);
  const introSaveInFlight = useRef(false);
  const audioEnabled = useAudioEnabled();
  const playInterfaceSound = useInterfaceSounds(audioEnabled);

  useEffect(() => {
    const savePort = getSavePort();
    let active = true;
    void Promise.all([savePort.loadSave('slot-001'), savePort.loadPresentationPreferences()]).then(([result, preferences]) => {
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

  const saveIntro = useCallback((intro: Extract<BootState, { status: 'intro' }>) => {
    if (!intro.roll || introSaveInFlight.current) return;
    introSaveInFlight.current = true;
    void getSavePort().requestSave({
      slotId: 'slot-001', expectedSaveGeneration: null, trigger: 'manual', state: intro.state,
    }).then((result) => {
      introSaveInFlight.current = false;
      setBoot((current) => {
        if (current.status !== 'intro' || current.state !== intro.state) return current;
        if (result.status === 'saved') {
          return { ...current, saveStatus: 'saved', saveGeneration: result.saveGeneration, saveError: undefined };
        }
        return {
          ...current,
          saveStatus: 'failed',
          saveError: 'The island is not at a stable save boundary. Retry the same save.',
        };
      });
    }).catch(() => {
      introSaveInFlight.current = false;
      setBoot((current) => current.status === 'intro' && current.state === intro.state
        ? { ...current, saveStatus: 'failed', saveError: 'The save write failed. Retry the same save.' }
        : current);
    });
  }, []);

  const startNewGame = useCallback((displayName: string) => {
    if (startingNewGame.current) return;
    startingNewGame.current = true;
    introRollCommitted.current = false;
    playInterfaceSound('confirm');
    const smokeMode = typeof window !== 'undefined' && window.siWorldSmokeMode === true;
    const state = createInitialState(displayName, newGameSeed(smokeMode));
    const preferences = boot.status === 'new' ? boot.preferences : DEFAULT_PRESENTATION_PREFERENCES;
    setBoot({ status: 'intro', state, preferences, saveStatus: 'idle' });
  }, [boot, playInterfaceSound]);

  const snoozeAlarm = useCallback(() => {
    if (boot.status !== 'intro' || introRollCommitted.current) return;
    introRollCommitted.current = true;
    const rolled = rollTwoDice(boot.state.prng);
    const intro: Extract<BootState, { status: 'intro' }> = {
      ...boot,
      state: { ...boot.state, prng: rolled.prng },
      roll: { dice: rolled.dice, total: rolled.total },
      saveStatus: 'saving',
      saveError: undefined,
    };
    setBoot(intro);
    saveIntro(intro);
  }, [boot, saveIntro]);

  const retryIntroSave = useCallback(() => {
    if (boot.status !== 'intro' || !boot.roll || boot.saveStatus !== 'failed' || introSaveInFlight.current) return;
    const intro: Extract<BootState, { status: 'intro' }> = { ...boot, saveStatus: 'saving', saveError: undefined };
    setBoot(intro);
    saveIntro(intro);
  }, [boot, saveIntro]);

  const completeIntro = useCallback(() => {
    if (boot.status !== 'intro' || !boot.roll || boot.saveStatus !== 'saved' || boot.saveGeneration === undefined) return;
    setBoot({
      status: 'active',
      session: {
        key: `new-${boot.saveGeneration}`,
        saveGeneration: boot.saveGeneration,
        saveStatus: `SAVED GEN ${boot.saveGeneration}`,
        state: boot.state,
        worldFeedback: 'WELCOME TO HALCYRA · $800 WEEKLY ALLOWANCE RECEIVED.',
        preferences: boot.preferences,
        newGame: true,
      },
    });
  }, [boot]);

  const savePresentationPreferences = useCallback((patch: RendererPresentationPatch) => {
    void getSavePort().savePresentationPreferences(patch);
  }, []);

  if (boot.status === 'loading') return <LoadingShell detail="Checking your Halcyra save…" surface={surface} />;
  if (boot.status === 'failed') return <LoadingShell detail={boot.detail} failed surface={surface} />;
  if (boot.status === 'new') {
    return <NewGameFlow audioEnabled={audioEnabled} busy={boot.busy} error={boot.error} onStart={startNewGame} surface={surface} />;
  }
  if (boot.status === 'intro') {
    return <AlarmIntroOverlay
      audioEnabled={audioEnabled}
      onComplete={completeIntro}
      onRetry={retryIntroSave}
      onSnooze={snoozeAlarm}
      roll={boot.roll}
      saveError={boot.saveError}
      saveGeneration={boot.saveGeneration}
      saveStatus={boot.saveStatus}
      surface={surface}
    />;
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
