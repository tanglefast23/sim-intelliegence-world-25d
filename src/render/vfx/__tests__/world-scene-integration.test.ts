import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { WORLD_LAYER_ORDER } from '../../world-frame';

describe('WorldScene procedural VFX integration', () => {
  // Stage 7 removed Skia. The scene is the controller plus the Three.js renderer.
  // Read inside each test, never in the describe body: a collection-time read of a deleted file
  // throws ENOENT while Jest still reports the suite as passing, which is how two suites hid
  // their own failure during the Skia removal.
  const scene = (): string => [
    readFileSync(resolve(process.cwd(), 'src/render/WorldScene.tsx'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src/render/three/world-renderer.ts'), 'utf8'),
  ].join('\n');
  const responsiveEvidence = (): string => readFileSync(resolve(process.cwd(), 'src/render/responsive-evidence.ts'), 'utf8');

  test('preserves the seven-layer order and existing responsive evidence version', () => {
    expect(WORLD_LAYER_ORDER).toEqual(['floor', 'prop', 'shadow', 'character', 'effect', 'wall', 'roof']);
    expect(responsiveEvidence()).toContain('schemaVersion: 1');
    expect(scene()).toContain('drawCounts');
    expect(scene()).toContain('const drawCounts = worldFrame.drawCounts;');
    expect(scene()).toContain('window.siWorldMeasureResponsiveEvidence = () =>');
  });

  test('keeps circle mode smoke-only and does not mount the procedural driver in that mode', () => {
    expect(scene()).toContain("const vfxMode = smokeMode && window.siWorldVfxMode === 'circle'");
    // Stage 7: circle mode is a frame-level decision, and the renderer draws whatever the frame says.
    expect(scene()).toContain("vfxMode === 'procedural'");
    expect(scene()).toContain("this.#set('effects'");
    expect(scene()).toContain("window.siWorldVfxMode === 'circle'");
  });

  test('keeps time in the controller and gives the renderer sampled geometry only', () => {
    expect(scene()).toContain('const speed = effectiveSpeed(runtime.worldState.clock);');
    expect(scene()).toContain("const ambientRunning = !rendererSuspended && vfxMode === 'procedural' && (forceAmbientMotion || speed > 0);");
    expect(scene()).toContain('advanceAmbientVfxClock');
    expect(scene()).toContain('animationTimestampMilliseconds: rendererParityPulseFrozen ? 0 : vfxClock.current.ageMilliseconds');
    expect(scene()).toContain('vfxAgeStep: rendererParityPulseFrozen ? 0 : vfxAgeStep');
    expect(scene()).toContain('frame.effects');
    expect(scene()).toContain('worldFrame.fallbackEffects');
  });

  test('publishes separate strict VFX evidence without changing save or preference data', () => {
    expect(scene()).toContain('nativeID="world-vfx-state"');
    expect(scene()).toContain('parseVfxEvidence');
    expect(scene()).not.toMatch(/save.*vfx|presentationPreferences.*vfx/iu);
  });

  test('keeps weather on the shared clock with local-only overrides and clear test defaults', () => {
    expect(scene()).toContain("['localhost', '127.0.0.1'].includes(window.location.hostname)");
    expect(scene()).toContain("localhostWeatherOverride() ?? (smokeMode || devHarnessMode ? 'clear' : undefined)");
    expect(scene()).toContain('weatherOverride,');
    expect(scene()).toContain('nativeID="world-weather-state"');
    expect(scene()).toContain('parseWeatherEvidence');
    expect(scene()).toContain('running: ambientRunning');
    expect(scene()).not.toMatch(/weatherClock|setInterval\([^)]*weather/iu);
  });
});
