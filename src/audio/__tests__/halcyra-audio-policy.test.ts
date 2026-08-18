import {
  ambienceTrackId,
  doorSoundsForTransition,
  footstepSurface,
  musicTrackId,
  relationshipSound,
} from '../halcyra-audio-policy';
import { createInitialState } from '../../domain/state/initial-state';

describe('Halcyra audio routing', () => {
  test('routes district day, night, ambience, and ground materials', () => {
    expect(musicTrackId('northwest_residential', 600)).toBe('music_sunward_day');
    expect(musicTrackId('northeast_downtown', 1_100)).toBe('music_neon_night');
    expect(ambienceTrackId('southeast_docks')).toBe('ambience_greywake_loop');
    expect(footstepSurface('warm-sand')).toBe('sand');
    expect(footstepSurface('dock-boardwalk')).toBe('wood');
    expect(footstepSurface('dark-asphalt')).toBe('asphalt');
    expect(footstepSurface('villa-floor')).toBe('indoor');
    expect(footstepSurface('pale-concrete')).toBe('stone');
  });

  test('covers day, night, and ambience for every district', () => {
    const maps = [
      'northwest_residential',
      'northeast_downtown',
      'southwest_commercial',
      'southeast_docks',
    ] as const;
    expect(maps.flatMap((mapId) => [
      musicTrackId(mapId, 600),
      musicTrackId(mapId, 1_100),
      ambienceTrackId(mapId),
    ])).toEqual([
      'music_sunward_day', 'music_sunward_night', 'ambience_sunward_loop',
      'music_neon_day', 'music_neon_night', 'ambience_neon_loop',
      'music_saffron_day', 'music_saffron_night', 'ambience_saffron_loop',
      'music_greywake_day', 'music_greywake_night', 'ambience_greywake_loop',
    ]);
  });

  test('plays the office track in the office at every hour', () => {
    expect(musicTrackId('west_office', 600)).toBe('music_office');
    expect(musicTrackId('west_office', 1_100)).toBe('music_office');
    expect(ambienceTrackId('west_office')).toBe('ambience_sunward_loop');
  });

  test('selects one relationship sound from the net score change', () => {
    const before = createInitialState().relationships;
    const linda = before.linda!;
    const positive = { ...before, linda: { ...linda, values: { ...linda.values, trust: linda.values.trust + 1 } } };
    const negative = { ...before, linda: { ...linda, values: { ...linda.values, trust: linda.values.trust - 1 } } };
    expect(relationshipSound(before, positive)).toBe('relationship-positive');
    expect(relationshipSound(before, negative)).toBe('relationship-negative');
    expect(relationshipSound(before, before)).toBeUndefined();
  });

  test('starts door sounds on the first opening and closing frames', () => {
    expect(doorSoundsForTransition({}, { bedroom: 'opening' })).toEqual(['open']);
    expect(doorSoundsForTransition({ bedroom: 'opening' }, { bedroom: 'open' })).toEqual([]);
    expect(doorSoundsForTransition({ bedroom: 'open' }, { bedroom: 'closing' })).toEqual(['close']);
  });
});
