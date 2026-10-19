import type { PoseProxy } from './pose-target-mapper';
export interface SolverTiming {
  solverTimeMs: number;
  simulationRateHz: number;
  nonFiniteResets: number;
}
export interface PhysicsTelemetry extends SolverTiming {
  /** Distances in normalized proxy (face-extent) units, relative to pose targets. */
  maxDisplacement: number;
  meanPoseError: number;
}
export interface PhysicsSnapshot {
  proxy: PoseProxy & { edges: ArrayLike<number> };
  positions: Float64Array;
  telemetry: PhysicsTelemetry;
}
export function measureDisplacement(positions: ArrayLike<number>, targets: ArrayLike<number>, labels: ArrayLike<number>) {
  if (positions.length !== targets.length || positions.length !== labels.length*3) throw new Error('Telemetry sample dimensions differ');
  let maxDisplacement=0, totalError=0, skinCount=0;
  for(let node=0;node<labels.length;node++) {
    const i=node*3;
    const distance=Math.hypot(positions[i]-targets[i],positions[i+1]-targets[i+1],positions[i+2]-targets[i+2]);
    if(!Number.isFinite(distance)) throw new Error('Non-finite telemetry sample');
    maxDisplacement=Math.max(maxDisplacement,distance);
    if(labels[node]===0) {totalError+=distance;skinCount++;}
  }
  return {maxDisplacement,meanPoseError:skinCount?totalError/skinCount:0};
}
