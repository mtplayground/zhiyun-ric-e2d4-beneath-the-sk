import { expect, it, vi } from 'vitest';
import { measureDisplacement } from './physics-telemetry';
import { startPhysicsLoop } from './physics-loop';

const metadata={normalization:{scale:2},units:{metresPerSourceUnit:0.001,verticalAxis:[0,1,0]}};
it('records every node distance in metres and includes the inner layer in aggregate errors',()=>{
  const metrics=measureDisplacement([3,4,0,0,0,2,0,0,0],[0,0,0,0,0,0,0,0,0],metadata);
  expect(Array.from(metrics.nodePoseDistancesMetres)).toEqual([0.01,0.004,0]);
  expect(metrics.maxDisplacement).toBeCloseTo(0.01);
  expect(metrics.meanPoseError).toBeCloseTo(0.014/3);
  const last=measureDisplacement([0,0,0,0,0,2],[0,0,0,0,0,0],metadata);
  expect(last.nodePoseDistancesMetres[1]).toBeCloseTo(0.004);
  expect(last.meanPoseError).toBeCloseTo(0.002);
  expect(measureDisplacement([1,0,0],[1,0,0],metadata).nodePoseDistancesMetres[0]).toBe(0);
});
it('rejects malformed/non-finite samples and missing physical calibration',()=>{
  expect(()=>measureDisplacement([NaN,0,0],[0,0,0],metadata)).toThrow();
  expect(()=>measureDisplacement([0,0],[0,0],metadata)).toThrow('dimensions');
  expect(()=>measureDisplacement([0,0,0],[],metadata)).toThrow('dimensions');
  expect(()=>measureDisplacement([0,0,0],[0,0,0],{...metadata,normalization:{scale:0}})).toThrow('physical units');
});
it('reports effective fixed-step rate and counts numerical resets but not manual resets',()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});
  const output=vi.fn();
  const loop=startPhysicsLoop({positions:[0,0,0,0,0,-0.05],masses:[0.002,0.003],pairs:[0,1],gravity:[0,0,0],timestep:0.01},output,error=>{throw error;});
  try {
    vi.advanceTimersByTime(100);
    expect(output.mock.calls.at(-1)![3].simulationRateHz).toBeCloseTo(100);
    expect(output.mock.calls.at(-1)![3].solverTimeMs).toBeGreaterThanOrEqual(0);
    loop.reset();
    expect(output.mock.calls.at(-1)![3].nonFiniteResets).toBe(0);
    loop.setFrame({poseTargets:[NaN,0,0,0,0,-0.05]});
    vi.advanceTimersByTime(10);
    const [positions,result,targets,timing]=output.mock.calls.at(-1)!;
    expect(result.reset).toBe(true);
    expect(timing.nonFiniteResets).toBe(1);
    expect(Array.from(positions).every(Number.isFinite)).toBe(true);
    expect(Array.from(targets).every(Number.isFinite)).toBe(true);
  } finally {loop.stop();vi.useRealTimers();}
});
