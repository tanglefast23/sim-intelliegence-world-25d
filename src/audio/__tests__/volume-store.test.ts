import { parsePresentationPreferences } from '../../application/presentation/preferences';
import { audioVolumes, setAudioVolumes } from '../volume-store';

describe('audio volume store', () => {
  afterEach(() => setAudioVolumes({ music: 1, sfx: 1 }));

  it('clamps to the 0 to 1 range in 5 percent steps', () => {
    setAudioVolumes({ music: 1.4, sfx: -0.2 });
    expect(audioVolumes()).toEqual({ music: 1, sfx: 0 });
    setAudioVolumes({ music: 0.333, sfx: 0.62 });
    expect(audioVolumes()).toEqual({ music: 0.35, sfx: 0.6 });
  });

  it('patches one channel without disturbing the other', () => {
    setAudioVolumes({ music: 0.5 });
    setAudioVolumes({ sfx: 0.25 });
    expect(audioVolumes()).toEqual({ music: 0.5, sfx: 0.25 });
  });

  it('notifies subscribers only when a value changes', () => {
    // The store feeds useSyncExternalStore, so a no-op write must not re-render the HUD.
    setAudioVolumes({ music: 0.5, sfx: 0.5 });
    expect(audioVolumes()).toEqual({ music: 0.5, sfx: 0.5 });
    const before = audioVolumes();
    setAudioVolumes({ music: 0.5 });
    expect(audioVolumes()).toBe(before);
  });
});

describe('presentation preferences volumes', () => {
  it('defaults a preferences file written before the volume sliders shipped', () => {
    const preferences = parsePresentationPreferences({
      schemaVersion: 1,
      worldZoom: null,
      uiScale: 1.25,
      camera: null,
      windowSize: null,
    });
    expect(preferences.musicVolume).toBe(1);
    expect(preferences.sfxVolume).toBe(1);
    expect(preferences.uiScale).toBe(1.25);
  });
});
