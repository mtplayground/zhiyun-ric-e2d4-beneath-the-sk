import { describe, expect, it } from 'vitest';
import {
  DistanceConstraint, IDENTITY_TRANSFORM, PoseTargetConstraint, XpbdSolver,
  type ConstraintContext, type SolverOptions, type XpbdConstraint,
} from './xpbd-solver';

function context(positions: number[], masses: number[], timestep = 0.1): ConstraintContext {
  return {
    positions: Float64Array.from(positions), velocities: new Float64Array(positions.length),
    inverseMasses: Float64Array.from(masses), timestep,
    poseTargets: new Float64Array(positions.length),
  };
}
const translate = (x: number, y: number, z: number) => {
  const matrix = [...IDENTITY_TRANSFORM];
  matrix[12] = x; matrix[13] = y; matrix[14] = z;
  return matrix;
};
const base: SolverOptions = {
  positions: [0, 0, 0], labels: [0], gravity: [0, 0, 0],
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
  it('moves skull and jaw nodes by separate rest-space transforms at zero inverse mass', () => {
    const solver = new XpbdSolver({ ...base, positions: [1, 0, 0, 0, 1, 0, 0, 0, 0], labels: [1, 2, 0], inverseMasses: [9, 9, 1], poseCompliance: 0, substeps: 3 });
    const rotation = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1];
    const frame = { poseTargets: [9, 9, 9, 9, 9, 9, 0, 0, 2], skullTransform: rotation, jawTransform: translate(0, -2, 0) };
    expect(solver.step(frame)).toEqual({ reset: false });
    expect(Array.from(solver.inverseMasses)).toEqual([0, 0, 1]);
    expect(Array.from(solver.positions)).toEqual([2, 1, 0, 0, -1, 0, 0, 0, 2]);
    solver.step(frame); // transforms must not accumulate
    expect(Array.from(solver.positions)).toEqual([2, 1, 0, 0, -1, 0, 0, 0, 2]);
    expect(Array.from(solver.velocities.slice(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('integrates gravity over configurable fixed substeps and damps velocity', () => {
    // Zero inverse mass skin stays fixed; freely moving skin has negligible pose pull.
    const solver = new XpbdSolver({ ...base, poseCompliance: 1e20, gravity: [0, -10, 0], substeps: 2 });
    solver.step({ poseTargets: [0, 0, 0] });
    expect(solver.positions[1]).toBeCloseTo(-0.075);
    expect(solver.velocities[1]).toBeCloseTo(-1);
    const damped = new XpbdSolver({ ...base, poseCompliance: 1e20, damping: Math.log(2) / 0.1 });
    damped.velocities[0] = 2;
    damped.step({ poseTargets: [0, 0, 0] });
    expect(damped.velocities[0]).toBeCloseTo(1);
    const fixed = new XpbdSolver({ ...base, inverseMasses: [0], gravity: [0, -10, 0] });
    fixed.step({ poseTargets: [2, 2, 2] });
    expect(Array.from(fixed.positions)).toEqual([0, 0, 0]);
  });

  it('makes stronger compliant pose pulls and remains deterministic over repeated frames', () => {
    const stiff = new XpbdSolver({ ...base, poseCompliance: 0.001 });
    const soft = new XpbdSolver({ ...base, poseCompliance: 1 });
    stiff.step({ poseTargets: [1, 0, 0] }); soft.step({ poseTargets: [1, 0, 0] });
    expect(stiff.positions[0]).toBeGreaterThan(soft.positions[0]);
    const options = { ...base, positions: [0, 0, 0, 1, 0, 0], labels: [1, 0], edges: [0, 1], substeps: 4, iterations: 3, distanceCompliance: 0.001 };
    const a = new XpbdSolver(options), b = new XpbdSolver(options);
    for (let i = 0; i < 30; i++) {
      const frame = { poseTargets: [0, 0, 0, 1, i / 30, 0], skullTransform: translate(i / 100, 0, 0) };
      expect(a.step(frame)).toEqual(b.step(frame));
      expect(a.positions).toEqual(b.positions);
      expect(a.velocities).toEqual(b.velocities);
    }
  });

  it('resets corrupt state to the current pose, clears velocity and resumes', () => {
    const solver = new XpbdSolver(base);
    solver.positions[0] = NaN; solver.velocities[2] = Infinity;
    expect(solver.step({ poseTargets: [1, 2, 3] }).reset).toBe(true);
    expect(Array.from(solver.positions)).toEqual([1, 2, 3]);
    expect(Array.from(solver.velocities)).toEqual([0, 0, 0]);
    expect(solver.step({ poseTargets: [1, 2, 3] })).toEqual({ reset: false });
  });

  it('uses last finite target coordinates for invalid targets and reports invalid transforms', () => {
    const solver = new XpbdSolver({ ...base, poseCompliance: 0 });
    solver.step({ poseTargets: [1, 2, 3] });
    expect(solver.step({ poseTargets: [NaN, 4, Infinity] }).reset).toBe(true);
    expect(Array.from(solver.positions)).toEqual([1, 4, 3]);
    expect(solver.step({ poseTargets: [3, 2, 1], jawTransform: [NaN] }).reset).toBe(true);
    expect(Array.from(solver.positions)).toEqual([3, 2, 1]);
  });

  it('supports additional constraints and recovers from non-finite constraint output', () => {
    let resets = 0;
    const extra: XpbdConstraint = {
      reset() { resets++; },
      project(state) { state.positions[0] = Infinity; },
    };
    const solver = new XpbdSolver({ ...base, constraints: [extra] });
    expect(solver.step({ poseTargets: [4, 5, 6] }).reset).toBe(true);
    expect(Array.from(solver.positions)).toEqual([4, 5, 6]);
    expect(resets).toBe(2); // start substep plus recovery
  });

  it('detects finite-input arithmetic overflow and restores attachments on reset', () => {
    const solver = new XpbdSolver({ ...base, positions: [1, 0, 0, 0, 0, 0], labels: [1, 0], gravity: [Number.MAX_VALUE, 0, 0], timestep: 2 });
    const result = solver.step({ poseTargets: [1, 0, 0, 3, 2, 1], skullTransform: translate(2, 0, 0) });
    expect(result.reset).toBe(true);
    expect(Array.from(solver.positions)).toEqual([3, 0, 0, 3, 2, 1]);
    expect(solver.velocities.every(v => v === 0)).toBe(true);
  });

  it('rejects malformed topology and invalid configuration before stepping', () => {
    for (const patch of [{ timestep: 0 }, { substeps: 1.5 }, { iterations: 0 }, { damping: -1 }, { poseCompliance: NaN }, { inverseMasses: [-1] }, { edges: [0, 2] }, { edges: [0] }, { labels: [7] }, { positions: [Infinity, 0, 0] }]) {
      expect(() => new XpbdSolver({ ...base, ...patch })).toThrow();
    }
    expect(() => new XpbdSolver(base).step({ poseTargets: [] })).toThrow('dimensions');
  });
});

it('applies live gravity, damping and pose compliance without replacing particle state', () => {
  const solver = new XpbdSolver({ ...base, poseCompliance:1e20 });
  solver.velocities[0]=2;
  const positions=solver.positions, velocities=solver.velocities;
  solver.configure({gravity:[0,-10,0],damping:Math.log(2)/0.1,poseCompliance:1e20,distanceCompliance:0.01});
  expect(solver.positions).toBe(positions);expect(solver.velocities).toBe(velocities);
  expect(solver.velocities[0]).toBe(2);
  solver.step({poseTargets:[0,0,0]});
  expect(solver.velocities[0]).toBeCloseTo(1);
  expect(solver.positions[1]).toBeCloseTo(-0.1);
  solver.configure({poseCompliance:0});
  solver.step({poseTargets:[1,2,3]});
  expect(Array.from(solver.positions)).toEqual([1,2,3]);
});

it('applies live tissue compliance and resets to current attachments with zero velocity', () => {
  const solver=new XpbdSolver({...base,positions:[0,0,0,1,0,0],labels:[1,0],edges:[0,1],poseCompliance:1e20});
  solver.positions[3]=2;
  solver.configure({distanceCompliance:1});
  solver.step({poseTargets:[0,0,0,1,0,0]});
  expect(solver.positions[3]).toBeGreaterThan(1.9);
  solver.configure({distanceCompliance:0});
  solver.step({poseTargets:[0,0,0,1,0,0]});
  expect(solver.positions[3]).toBeCloseTo(1);
  const result=solver.reset({poseTargets:[0,0,0,2,3,4],skullTransform:translate(1,0,0)});
  expect(result).toEqual({reset:true,reason:'Simulation reset requested'});
  expect(Array.from(solver.positions)).toEqual([1,0,0,2,3,4]);
  expect(Array.from(solver.velocities)).toEqual([0,0,0,0,0,0]);
});
