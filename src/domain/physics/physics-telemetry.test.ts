import { expect, it, vi } from 'vitest';
import { measureDisplacement } from './physics-telemetry';
import { startPhysicsLoop } from './physics-loop';

it('measures maximum residual across nodes and mean following error over skin only',()=>{
  const metrics=measureDisplacement([3,4,0, 0,0,2, 0,0,0],[0,0,0, 0,0,0, 0,0,0],[0,0,1]);
  expect(metrics).toEqual({maxDisplacement:5,meanPoseError:3.5});
  expect(measureDisplacement([1,0,0],[1,0,0],[2])).toEqual({maxDisplacement:0,meanPoseError:0});
  expect(()=>measureDisplacement([NaN,0,0],[0,0,0],[0])).toThrow();
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
