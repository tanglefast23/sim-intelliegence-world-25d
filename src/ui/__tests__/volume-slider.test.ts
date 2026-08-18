import { clampStep, volumeForKey } from '../VolumeSlider';

it('snaps a drag position to the nearest 5 percent step and clamps it', () => {
  expect(clampStep(62 / 200)).toBe(0.3);
  expect(clampStep(500 / 200)).toBe(1);
  expect(clampStep(-20 / 200)).toBe(0);
});

it('steps with arrow keys and ignores other keys', () => {
  expect(volumeForKey(0.8, 'ArrowRight')).toBe(0.85);
  expect(volumeForKey(0.8, 'ArrowDown')).toBe(0.75);
  expect(volumeForKey(1, 'ArrowUp')).toBe(1);
  expect(volumeForKey(0, 'ArrowLeft')).toBe(0);
  expect(volumeForKey(0.8, 'Enter')).toBeNull();
});
