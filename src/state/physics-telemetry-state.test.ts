import { beforeEach, describe, expect, it } from 'vitest';
import { physicsStatusLabel, usePhysicsTelemetry } from './physics-telemetry-state';

beforeEach(() => usePhysicsTelemetry.getState().clear());

describe('physics status from runtime diagnostics', () => {
  it('stays inactive during startup and identifies each ready backend', () => {
    const store = usePhysicsTelemetry.getState();
    store.inactive('Starting physics');
    expect(usePhysicsTelemetry.getState().status.active).toBe(false);
    store.diagnose({ code: 'worker', message: 'Ready' });
    expect(physicsStatusLabel(usePhysicsTelemetry.getState().status)).toBe('Active · worker');
    store.diagnose({ code: 'fallback', message: 'Worker unavailable; using main thread' });
    expect(physicsStatusLabel(usePhysicsTelemetry.getState().status)).toBe('Active · main-thread fallback');
  });

  it('shows short reasons for rejected assets, missing meshes and startup failures', () => {
    const store = usePhysicsTelemetry.getState();
    store.diagnose({ code: 'worker', message: 'Ready' });
    store.diagnose({ code: 'asset-error', message: 'Simulation asset does not match the render face mesh' });
    expect(physicsStatusLabel(usePhysicsTelemetry.getState().status)).toBe('Inactive · Invalid or mismatched proxy asset');
    expect(usePhysicsTelemetry.getState().snapshot).toBeNull();
    store.inactive('Missing face mesh');
    expect(physicsStatusLabel(usePhysicsTelemetry.getState().status)).toBe('Inactive · Missing face mesh');
    store.inactive('Worker startup failure');
    expect(physicsStatusLabel(usePhysicsTelemetry.getState().status)).toBe('Inactive · Worker startup failure');
  });

  it('preserves the backend through recovery resets and clears it on disable', () => {
    const store = usePhysicsTelemetry.getState();
    store.diagnose({ code: 'fallback', message: 'Ready' });
    store.diagnose({ code: 'reset', message: 'Recovered non-finite sample' });
    expect(usePhysicsTelemetry.getState().status).toEqual({ active: true, backend: 'main-thread fallback' });
    store.diagnose({ code: 'solver-error', message: 'Backend failed' });
    expect(usePhysicsTelemetry.getState().status.active).toBe(false);
    store.clear();
    expect(usePhysicsTelemetry.getState().status).toEqual({ active: false, reason: 'Physics disabled' });
  });
});
