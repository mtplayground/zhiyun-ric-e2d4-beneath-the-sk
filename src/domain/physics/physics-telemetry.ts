import { metresToProxyUnits, type UnitMetadata } from './physical-units';
import type { PoseProxy } from './pose-target-mapper';
export interface SolverTiming {
  solverTimeMs: number;
  simulationRateHz: number;
  nonFiniteResets: number;
}
export interface PhysicsTelemetry extends SolverTiming {
  /** SI metres, relative to the matching submitted pose targets, over all nodes. */
  maxDisplacement: number;
  meanPoseError: number;
  nodePoseDistancesMetres: Float64Array;
}
export interface PhysicsSnapshot {
  proxy: PoseProxy & { edges: ArrayLike<number>; metadata: PoseProxy['metadata'] & UnitMetadata };
  positions: Float64Array;
  poseTargets: Float64Array;
  telemetry: PhysicsTelemetry;
}
export function measureDisplacement(positions: ArrayLike<number>, targets: ArrayLike<number>, metadata: UnitMetadata) {
  if (positions.length !== targets.length || positions.length % 3 !== 0) throw new Error('Telemetry sample dimensions differ');
  const metresPerProxyUnit=1/metresToProxyUnits(1,metadata);
  const nodePoseDistancesMetres=new Float64Array(positions.length/3);
  let maxDisplacement=0,totalError=0;
  for(let node=0;node<nodePoseDistancesMetres.length;node++) {
    const i=node*3;
    const distance=Math.hypot(positions[i]-targets[i],positions[i+1]-targets[i+1],positions[i+2]-targets[i+2])*metresPerProxyUnit;
    if(!Number.isFinite(distance)) throw new Error('Non-finite telemetry sample');
    nodePoseDistancesMetres[node]=distance;
    maxDisplacement=Math.max(maxDisplacement,distance);
    totalError+=distance;
  }
  return {maxDisplacement,meanPoseError:nodePoseDistancesMetres.length?totalError/nodePoseDistancesMetres.length:0,nodePoseDistancesMetres};
}
