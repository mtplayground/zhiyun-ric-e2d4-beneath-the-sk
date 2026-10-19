import { afterEach, describe, expect, it } from 'vitest';
import { usePhysicsState } from './physics-state';
import { DEFAULT_PHYSICS_SETTINGS, toSolverSettings } from '@/domain/physics/physics-settings';
import { useControlState } from './control-state';
const initial = usePhysicsState.getState();
afterEach(() => usePhysicsState.setState(initial));
describe('physics controls', () => {
  it('shares enabled state, preserves settings across off/on, and leaves pose controls alone', () => {
    const controls = useControlState.getState();
    initial.setEnabled(true);
    initial.setSetting('damping', 4);
    initial.setEnabled(false);
    initial.setEnabled(true);
    expect(usePhysicsState.getState().enabled).toBe(true);
    expect(usePhysicsState.getState().settings.damping).toBe(4);
    expect(useControlState.getState()).toBe(controls);
  });
  it('clamps settings and ignores non-finite input', () => {
    initial.setSetting('gravityStrength', 100);
    expect(usePhysicsState.getState().settings.gravityStrength).toBe(20);
    initial.setSetting('damping', -5);
    expect(usePhysicsState.getState().settings.damping).toBe(0);
    initial.setSetting('damping', NaN);
    expect(usePhysicsState.getState().settings.damping).toBe(0);
  });
  it('requests repeatable resets without resetting settings or the pose', () => {
    initial.setSetting('poseCompliance', 0.02);
    const settings = usePhysicsState.getState().settings;
    const controls = useControlState.getState();
    initial.resetSimulation();initial.resetSimulation();
    expect(usePhysicsState.getState().resetRequest).toBe(initial.resetRequest+2);
    expect(usePhysicsState.getState().settings).toBe(settings);
    expect(useControlState.getState()).toBe(controls);
  });
  it('scales gravity downward in upright FaceCap coordinates', () => {
    expect(toSolverSettings(DEFAULT_PHYSICS_SETTINGS).gravity).toEqual([0,0,-0.5]);
    expect(toSolverSettings({...DEFAULT_PHYSICS_SETTINGS,gravityStrength:20}).gravity).toEqual([0,0,-10]);
    expect(toSolverSettings({...DEFAULT_PHYSICS_SETTINGS,gravityStrength:0}).gravity![2]).toBeCloseTo(0);
  });
});
