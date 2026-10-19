import { afterEach, describe, expect, it } from 'vitest';
import { usePhysicsState } from './physics-state';
import { DEFAULT_PHYSICS_SETTINGS, PHYSICS_PRESETS, toSolverSettings } from '@/domain/physics/physics-settings';
import { SOLVER_DEFAULTS } from '@/domain/physics/xpbd-solver';
import { useControlState } from './control-state';
const initial=usePhysicsState.getState();
afterEach(()=>usePhysicsState.setState(initial));
describe('SI physics controls',()=>{
  it('starts at 9.81 m/s² and reciprocal retuned stiffness defaults',()=>{
    expect(initial.settings).toEqual({edgeStiffness:10000,skinPoseStiffness:50,innerPoseStiffness:50000,damping:12,gravityAcceleration:9.81});
    const solver=toSolverSettings(DEFAULT_PHYSICS_SETTINGS);
    expect(solver.distanceCompliance).toBeCloseTo(SOLVER_DEFAULTS.distanceCompliance,12);
    expect(solver.poseCompliance).toBeCloseTo(SOLVER_DEFAULTS.poseCompliance,12);
    expect(solver.innerPoseCompliance).toBeCloseTo(SOLVER_DEFAULTS.innerPoseCompliance,12);
    expect(solver.gravityStrength).toBe(1);
  });
  it('selects complete presets, marks individual edits Custom, and restores Physical',()=>{
    expect(initial.preset).toBe('physical');
    initial.setPreset('visible-demonstration');
    expect(usePhysicsState.getState().preset).toBe('visible-demonstration');
    expect(usePhysicsState.getState().settings).toEqual({edgeStiffness:200,skinPoseStiffness:20,innerPoseStiffness:50000,damping:8,gravityAcceleration:98.1});
    initial.setSetting('damping',NaN);
    expect(usePhysicsState.getState().preset).toBe('visible-demonstration');
    initial.setSetting('gravityAcceleration',0);
    expect(usePhysicsState.getState().preset).toBe('custom');
    initial.setPreset('physical');
    expect(usePhysicsState.getState().settings).toEqual(DEFAULT_PHYSICS_SETTINGS);
    expect(PHYSICS_PRESETS['visible-demonstration'].gravityAcceleration).toBe(98.1);
  });
  it.each(['physical','visible-demonstration'] as const)('keeps the %s preset across reset and disable/enable',preset=>{
    initial.setPreset(preset);
    const settings=usePhysicsState.getState().settings;
    initial.resetSimulation();
    initial.setEnabled(false);initial.setEnabled(true);
    expect(usePhysicsState.getState().preset).toBe(preset);
    expect(usePhysicsState.getState().settings).toBe(settings);
  });
  it('keeps Custom across reset',()=>{
    initial.setSetting('damping',4);
    initial.resetSimulation();
    expect(usePhysicsState.getState().preset).toBe('custom');
    expect(usePhysicsState.getState().settings.damping).toBe(4);
  });

  it('converts higher stiffness into lower compliance and SI acceleration into the host ratio',()=>{
    const settings={...DEFAULT_PHYSICS_SETTINGS,edgeStiffness:20000,skinPoseStiffness:100,innerPoseStiffness:100000,gravityAcceleration:19.62};
    const solver=toSolverSettings(settings);
    expect(solver.distanceCompliance).toBeCloseTo(0.00005);
    expect(solver.poseCompliance).toBeCloseTo(0.01);
    expect(solver.innerPoseCompliance).toBeCloseTo(0.00001);
    expect(solver.gravityStrength).toBe(2);
    expect(toSolverSettings({...settings,gravityAcceleration:0}).gravityStrength).toBe(0);
    expect(solver.gravity).toBeUndefined();
  });
  it('clamps SI values, keeps pose stiffness finite, and ignores invalid inputs',()=>{
    initial.setSetting('gravityAcceleration',1000);expect(usePhysicsState.getState().settings.gravityAcceleration).toBe(196.2);
    initial.setSetting('gravityAcceleration',-1);expect(usePhysicsState.getState().settings.gravityAcceleration).toBe(0);
    initial.setSetting('damping',NaN);expect(usePhysicsState.getState().settings.damping).toBe(12);
    initial.setSetting('skinPoseStiffness',0);expect(usePhysicsState.getState().settings.skinPoseStiffness).toBe(5);
    initial.setSetting('innerPoseStiffness',Infinity);expect(usePhysicsState.getState().settings.innerPoseStiffness).toBe(50000);
    expect(()=>toSolverSettings({...DEFAULT_PHYSICS_SETTINGS,edgeStiffness:0})).toThrow();
  });
  it('preserves SI tuning across disable/enable and reset without touching expressions',()=>{
    const controls=useControlState.getState();initial.setSetting('gravityAcceleration',2.5);initial.setSetting('innerPoseStiffness',60000);
    initial.setEnabled(false);initial.setEnabled(true);
    const settings=usePhysicsState.getState().settings;
    initial.resetSimulation();initial.resetSimulation();
    expect(usePhysicsState.getState().settings).toBe(settings);
    expect(settings.gravityAcceleration).toBe(2.5);expect(settings.innerPoseStiffness).toBe(60000);
    expect(usePhysicsState.getState().resetRequest).toBe(initial.resetRequest+2);
    expect(useControlState.getState()).toBe(controls);
    expect(Object.keys(settings).some(key=>/jaw|skull/i.test(key))).toBe(false);
  });
});


it('resets optional offset debug views on disable without touching solver settings',()=>{
  const state=usePhysicsState.getState(),settings=state.settings;
  state.setEnabled(true);state.setOffsetMagnification(50);state.setOffsetHeatmap(true);
  expect(usePhysicsState.getState().offsetMagnification).toBe(50);
  expect(usePhysicsState.getState().offsetHeatmap).toBe(true);
  expect(usePhysicsState.getState().settings).toBe(settings);
  state.setEnabled(false);state.setEnabled(true);
  expect(usePhysicsState.getState().offsetMagnification).toBe(1);
  expect(usePhysicsState.getState().offsetHeatmap).toBe(false);
  expect(usePhysicsState.getState().settings).toBe(settings);
});
