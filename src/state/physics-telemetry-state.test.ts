import { afterEach, expect, it } from 'vitest';
import { usePhysicsTelemetry } from './physics-telemetry-state';
import { measureDisplacement, type PhysicsSnapshot } from '@/domain/physics/physics-telemetry';
afterEach(()=>usePhysicsTelemetry.getState().clear());
it('keeps node-indexed SI distances and matching target positions without attachment state',()=>{
  const proxy={nodes:[0,0,0,1,0,0],pairs:[0,1],labels:[2,0],edges:[0,1],tetrahedra:[],embedding:[],
    metadata:{normalization:{center:[0,0,0],scale:2},counts:{renderVertices:0},units:{metresPerSourceUnit:0.001,verticalAxis:[0,1,0]}}};
  const positions=new Float64Array([0,0,0,1,0,2]),poseTargets=Float64Array.from(proxy.nodes);
  const snapshot:PhysicsSnapshot={proxy,positions,poseTargets,telemetry:{solverTimeMs:1,simulationRateHz:60,nonFiniteResets:0,...measureDisplacement(positions,poseTargets,proxy.metadata)}};
  usePhysicsTelemetry.getState().publish(snapshot);
  const sample=usePhysicsTelemetry.getState().snapshot!;
  expect(sample.poseTargets).toBe(poseTargets);
  expect(Array.from(sample.telemetry.nodePoseDistancesMetres)).toEqual([0,0.004]);
  expect(sample.telemetry.meanPoseError).toBeCloseTo(0.002);
  expect(Object.keys(sample).some(key=>/jaw|attachment/i.test(key))).toBe(false);
  usePhysicsTelemetry.getState().clear();expect(usePhysicsTelemetry.getState().snapshot).toBeNull();
});
