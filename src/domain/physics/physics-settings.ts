import { SOLVER_DEFAULTS } from './xpbd-solver';
import type { PhysicsHostSettings } from './physics-host';

export interface PhysicsSettings {
  tissueCompliance: number;
  poseCompliance: number;
  innerPoseCompliance: number;
  damping: number;
  gravityStrength: number;
}
export const DEFAULT_PHYSICS_SETTINGS: Readonly<PhysicsSettings> = Object.freeze({
  tissueCompliance: SOLVER_DEFAULTS.distanceCompliance, poseCompliance: SOLVER_DEFAULTS.poseCompliance, innerPoseCompliance: SOLVER_DEFAULTS.innerPoseCompliance, damping: SOLVER_DEFAULTS.damping, gravityStrength: 1,
});
export const PHYSICS_SETTING_RANGES = {
  tissueCompliance: { min: 0, max: 0.01, step: 0.00001 },
  poseCompliance: { min: 0.001, max: 0.2, step: 0.0001 },
  innerPoseCompliance: { min: 0.000001, max: 0.0001, step: 0.000001 },
  damping: { min: 0, max: 20, step: 0.1 },
  gravityStrength: { min: 0, max: 20, step: 0.1 },
} as const;
export function toSolverSettings(settings: PhysicsSettings): PhysicsHostSettings {
  return {
    distanceCompliance: settings.tissueCompliance,
    poseCompliance: settings.poseCompliance,
    damping: settings.damping,
    innerPoseCompliance: settings.innerPoseCompliance,
    gravityStrength: settings.gravityStrength,
  };
}
