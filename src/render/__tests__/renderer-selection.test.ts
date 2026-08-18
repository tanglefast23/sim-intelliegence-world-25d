import { rendererForEnvironment, selectedRenderer, toneMappingForEnvironment } from '../renderer-selection';

describe('renderer selection', () => {
  const base = { hostname: 'localhost', search: '', smokeMode: false } as const;

  test('production always gets the 2.5D renderer and ignores the query override', () => {
    expect(rendererForEnvironment({ ...base, hostname: 'siworld.example' })).toBe('threejs-2-5d');
    expect(rendererForEnvironment({ ...base, hostname: 'siworld.example', search: '?testRenderer=2d' })).toBe('threejs-2-5d');
  });

  test('honours the local development override back to the 2D rollback path', () => {
    expect(rendererForEnvironment({ ...base, search: '?testRenderer=2d' })).toBe('threejs-2d');
    expect(rendererForEnvironment({ ...base, search: '?testRenderer=2-5d' })).toBe('threejs-2-5d');
    expect(rendererForEnvironment({ ...base, search: '?testRenderer=bogus' })).toBe('threejs-2-5d');
  });

  // Smoke mode stays on the explicit 2D default so `effectiveRenderer` in electron/main/index.ts
  // keeps naming smoke evidence after the renderer that actually drew it.
  test('smoke mode defaults to 2D and honours the packaged override only in smoke mode', () => {
    expect(rendererForEnvironment({ ...base, hostname: 'siworld.example', smokeMode: true })).toBe('threejs-2d');
    expect(rendererForEnvironment({ ...base, hostname: 'siworld.example', smokeMode: true, smokeRenderer: 'threejs-2-5d' })).toBe('threejs-2-5d');
    expect(rendererForEnvironment({ ...base, hostname: 'siworld.example', smokeRenderer: 'threejs-2d' })).toBe('threejs-2-5d');
  });

  test('the dev harness defaults to 2.5D and can be sent back to 2D', () => {
    const harness = { ...base, hostname: 'game', devHarnessMode: true } as const;
    expect(rendererForEnvironment(harness)).toBe('threejs-2-5d');
    expect(rendererForEnvironment({ ...harness, smokeRenderer: 'threejs-2d' })).toBe('threejs-2d');
    expect(rendererForEnvironment({ ...harness, smokeRenderer: 'threejs-2-5d' })).toBe('threejs-2-5d');
  });

  test('defaults to the 2D renderer with no window', () => {
    expect(selectedRenderer()).toBe('threejs-2d');
  });
});

// Stage 4: the tone-mapping override is unsaved and test-only; production always gets ACES.
describe('tone mapping selection', () => {
  const base = { hostname: 'localhost', search: '', smokeMode: false } as const;

  test('defaults to ACES in production', () => {
    expect(toneMappingForEnvironment({ ...base, hostname: 'siworld.example' })).toBe('aces');
    expect(toneMappingForEnvironment({ ...base, hostname: 'siworld.example', search: '?testToneMapping=none' })).toBe('aces');
  });

  test('honours the local development override', () => {
    expect(toneMappingForEnvironment({ ...base, search: '?testToneMapping=none' })).toBe('none');
    expect(toneMappingForEnvironment({ ...base, search: '?testToneMapping=aces' })).toBe('aces');
    expect(toneMappingForEnvironment({ ...base, search: '?testToneMapping=bogus' })).toBe('aces');
  });

  test('honours the packaged smoke override only in smoke mode', () => {
    expect(toneMappingForEnvironment({ ...base, smokeMode: true, smokeToneMapping: 'none' })).toBe('none');
    expect(toneMappingForEnvironment({ ...base, hostname: 'siworld.example', smokeMode: true, smokeToneMapping: 'none' })).toBe('none');
    expect(toneMappingForEnvironment({ ...base, hostname: 'siworld.example', smokeToneMapping: 'none' })).toBe('aces');
  });
});
