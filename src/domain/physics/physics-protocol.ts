import type { SolverTiming } from './physics-telemetry';
import type { SolverFrame, SolverOptions, SolverSettings, StepResult } from './xpbd-solver';

export type WorkerSolverOptions = Omit<SolverOptions, 'constraints'>;
export type PhysicsRequest =
  | { type: 'init'; options: WorkerSolverOptions }
  | { type: 'frame'; frame: SolverFrame }
  | { type: 'configure'; settings: SolverSettings }
  | { type: 'reset' }
  | { type: 'ack' }
  | { type: 'stop' };
export type PhysicsResponse =
  | { type: 'ready' }
  | { type: 'frame-accepted' }
  | { type: 'positions'; positions: Float64Array; poseTargets: Float64Array; timing?: SolverTiming; result: StepResult }
  | { type: 'error'; message: string };
export type PhysicsDiagnostic = {
  code: 'worker' | 'fallback' | 'asset-error' | 'solver-error' | 'reset';
  message: string;
};
