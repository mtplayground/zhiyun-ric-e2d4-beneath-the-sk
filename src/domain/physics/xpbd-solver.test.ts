import { PHYSICS_PRESETS, toSolverSettings } from './physics-settings';
import { describe, expect, it } from 'vitest';
import {
  DistanceConstraint, PoseTargetConstraint, XpbdSolver,
  type ConstraintContext, type SolverOptions, type XpbdConstraint,
} from './xpbd-solver';

function context(positions: number[], masses: number[], timestep = 0.1): ConstraintContext {
  return {
    positions: Float64Array.from(positions), velocities: new Float64Array(positions.length),
    inverseMasses: Float64Array.from(masses), timestep,
    poseTargets: new Float64Array(positions.length),
  };
}
const base: SolverOptions = {
  positions: [0,0,0,0,0,-0.05], masses: [0.002,0.003], pairs: [0,1], gravity: [0,0,0],
  damping: 0, timestep: 0.1, substeps: 1, iterations: 1,
};

describe('XPBD constraints', () => {
  it('uses inverse mass weighting and distance compliance / h²', () => {
    const state = context([0, 0, 0, 2, 0, 0], [1, 3]);
    const constraint = new DistanceConstraint(0, 1, 1, 0.04);
    constraint.project(state); // alpha = 4, delta lambda = -1/8
    expect(state.positions[0]).toBeCloseTo(0.125);
    expect(state.positions[3]).toBeCloseTo(1.625);
    // Accumulated multiplier prevents repeated iterations stiffening compliance.
    constraint.project(state);
    expect(state.positions[0]).toBeCloseTo(0.125);
  });

  it('preserves fixed particles and enforces a hard rest length', () => {
    const state = context([0, 0, 0, 2, 0, 0], [0, 1]);
    new DistanceConstraint(0, 1, 1).project(state);
    expect(Array.from(state.positions)).toEqual([0, 0, 0, 1, 0, 0]);
  });

  it('recovers a collapsed edge deterministically without division by zero', () => {
    const state = context([0, 0, 0, 0, 0, 0], [1, 1]);
    new DistanceConstraint(0, 1, 1).project(state);
    expect(state.positions[0] - state.positions[3]).toBeCloseTo(1);
    expect(state.positions.every(Number.isFinite)).toBe(true);
  });

  it('uses independent axis multipliers for compliant pose targets', () => {
    const state = context([1, 2, 3], [1]);
    const constraint = new PoseTargetConstraint(0, 0.01);
    constraint.project(state); // alpha = 1
    [0.5, 1, 1.5].forEach((v, i) => expect(state.positions[i]).toBeCloseTo(v));
    constraint.project(state);
    [0.5, 1, 1.5].forEach((v, i) => expect(state.positions[i]).toBeCloseTo(v));
    constraint.reset();
    constraint.project(state);
    [0.25, 0.5, 0.75].forEach((v, i) => expect(state.positions[i]).toBeCloseTo(v));
  });
});

describe('XpbdSolver', () => {
  it('uses every stored SI mass and applies soft targets to both paired nodes', () => {
    const solver=new XpbdSolver({...base,poseCompliance:0.02,innerPoseCompliance:0.00002});
    expect(Array.from(solver.inverseMasses)).toEqual([500,1/0.003]);
    solver.step({poseTargets:[1,0,0,1,0,-0.05]});
    expect(solver.positions[0]).toBeGreaterThan(0);
    expect(solver.positions[0]).toBeLessThan(1);
    expect(solver.positions[3]).toBeGreaterThan(solver.positions[0]);
    expect(solver.positions[3]).toBeLessThan(1);
    expect(solver.velocities[3]).toBeGreaterThan(0);
  });

  it('sets all edge lengths from the submitted pose, including inner and layer edges',()=>{
    const positions=[0,0,0,1,0,0,0,0,-0.05,1,0,-0.05];
    const targets=[0,0,0,2,0.4,0.3,0,0,-0.05,2,0.4,0.25];
    const edges=[0,1,2,3,0,2,1,3,0,3,1,2];
    const solver=new XpbdSolver({...base,positions,masses:[0.001,0.002,0.003,0.004],pairs:[0,2,1,3],edges,substeps:4,iterations:5});
    solver.reset({poseTargets:targets});
    for(let i=0;i<20;i++) expect(solver.step()).toEqual({reset:false});
    expect(Array.from(solver.positions)).toEqual(targets);
    expect(solver.velocities.every(v=>v===0)).toBe(true);
  });

  it.each(['physical','visible-demonstration','custom'] as const)('preserves the exact resting pose with gravity off for %s',preset=>{
    const settings=preset==='custom'
      ? {...PHYSICS_PRESETS.physical,skinPoseStiffness:37,edgeStiffness:700,damping:3}
      : PHYSICS_PRESETS[preset];
    const {gravityStrength,...solverSettings}=toSolverSettings({...settings,gravityAcceleration:0});
    expect(gravityStrength).toBe(0);
    const positions=[0,0,0,1,0,0,0,0,-0.05,1,0,-0.05];
    const targets=[0,0,0,2,0.4,0.3,0,0,-0.05,2,0.4,0.25];
    const solver=new XpbdSolver({...base,...solverSettings,gravity:[0,0,0],positions,
      masses:[0.001,0.002,0.003,0.004],pairs:[0,2,1,3],edges:[0,1,2,3,0,2,1,3,0,3,1,2],substeps:4,iterations:5});
    solver.reset({poseTargets:targets});
    for(let frame=0;frame<120;frame++) expect(solver.step()).toEqual({reset:false});
    expect(Array.from(solver.positions)).toEqual(targets);
    expect(solver.velocities.every(v=>v===0)).toBe(true);
  });

  it('updates edge targets once per submission, before any substeps',()=>{
    const solver=new XpbdSolver({...base,edges:[0,1],substeps:4});
    const first=[0,0,0,1,0,0];solver.reset({poseTargets:first});
    first[3]=20; // caller mutation cannot change submitted targets
    solver.step();
    expect(Array.from(solver.positions)).toEqual([0,0,0,1,0,0]);
    solver.reset({poseTargets:[0,0,0,2,0,0]});
    solver.step();expect(Array.from(solver.positions)).toEqual([0,0,0,2,0,0]);
  });

  it('integrates gravity on inner and outer nodes and damps velocity',()=>{
    const solver=new XpbdSolver({...base,poseCompliance:1e20,innerPoseCompliance:1e20,gravity:[0,-10,0],substeps:2});
    solver.step({poseTargets:base.positions});
    expect(solver.positions[1]).toBeCloseTo(-0.075);
    expect(solver.positions[4]).toBeCloseTo(-0.075);
    const damped=new XpbdSolver({...base,poseCompliance:1e20,innerPoseCompliance:1e20,damping:Math.log(2)/0.1});
    damped.velocities[0]=2;damped.velocities[3]=2;
    damped.step();expect(damped.velocities[0]).toBeCloseTo(1);expect(damped.velocities[3]).toBeCloseTo(1);
  });

  it('applies independent live skin and inner stiffness without replacing state',()=>{
    const solver=new XpbdSolver({...base,poseCompliance:1e20,innerPoseCompliance:1e20});
    const positions=solver.positions,velocities=solver.velocities;
    solver.configure({poseCompliance:1,innerPoseCompliance:0.00001,damping:4});
    solver.step({poseTargets:[1,0,0,1,0,-0.05]});
    expect(solver.positions).toBe(positions);expect(solver.velocities).toBe(velocities);
    expect(solver.positions[3]).toBeGreaterThan(solver.positions[0]);
    expect(()=>solver.configure({poseCompliance:0})).toThrow('soft');
    expect(()=>solver.configure({innerPoseCompliance:0})).toThrow('soft');
  });

  it('recovers every node to the current finite target, clears velocities and restores masses',()=>{
    const solver=new XpbdSolver(base),targets=[1,2,3,4,5,6];
    solver.positions[0]=NaN;solver.velocities[5]=Infinity;solver.inverseMasses[1]=0;
    expect(solver.step({poseTargets:targets}).reset).toBe(true);
    expect(Array.from(solver.positions)).toEqual(targets);
    expect(solver.velocities.every(v=>v===0)).toBe(true);
    expect(solver.inverseMasses[1]).toBe(1/0.003);
    expect(solver.step()).toEqual({reset:false});
    expect(solver.reset({poseTargets:[0,0,0,1,1,1]})).toEqual({reset:true,reason:'Simulation reset requested'});
    expect(Array.from(solver.positions)).toEqual([0,0,0,1,1,1]);
  });

  it('retains finite target coordinates and recovers from extension constraint failure',()=>{
    const solver=new XpbdSolver(base);solver.reset({poseTargets:[1,2,3,4,5,6]});
    expect(solver.step({poseTargets:[NaN,4,Infinity,4,5,6]}).reset).toBe(true);
    expect(Array.from(solver.positions)).toEqual([1,4,3,4,5,6]);
    const extra: XpbdConstraint={reset(){},project(state){state.positions[0]=Infinity;}};
    const extended=new XpbdSolver({...base,constraints:[extra]});
    expect(extended.step().reset).toBe(true);expect(Array.from(extended.positions)).toEqual(base.positions);
  });

  it('is deterministic across changes in the submitted expression',()=>{
    const a=new XpbdSolver({...base,edges:[0,1]}),b=new XpbdSolver({...base,edges:[0,1]});
    for(let i=0;i<30;i++) {
      const frame={poseTargets:[i/30,0,0,i/30,0,-0.05]};
      expect(a.step(frame)).toEqual(b.step(frame));expect(a.positions).toEqual(b.positions);expect(a.velocities).toEqual(b.velocities);
    }
  });

  it('rejects hard pins, invalid masses, malformed pairs and invalid configuration',()=>{
    for(const patch of [{masses:[0,1]},{masses:[-1,1]},{masses:[NaN,1]},{masses:[Infinity,1]},
      {pairs:[0,0]},{pairs:[0,2]},{pairs:[]},{poseCompliance:0},{innerPoseCompliance:0},{poseCompliance:NaN},
      {timestep:0},{substeps:1.5},{iterations:0},{damping:-1},{edges:[0,2]},{edges:[0]},{positions:[Infinity,0,0,0,0,0]}]) {
      expect(()=>new XpbdSolver({...base,...patch})).toThrow();
    }
    expect(()=>new XpbdSolver(base).step({poseTargets:[]})).toThrow('dimensions');
  });
});
