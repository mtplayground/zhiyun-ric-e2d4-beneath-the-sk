import type { SolverSettings } from './xpbd-solver';

export interface PhysicsSettings {
  tissueCompliance: number;
  poseCompliance: number;
  damping: number;
  gravityStrength: number;
}
export const DEFAULT_PHYSICS_SETTINGS: Readonly<PhysicsSettings> = Object.freeze({
  tissueCompliance: 0.00001, poseCompliance: 0.0001, damping: 1, gravityStrength: 1,
});
export const PHYSICS_SETTING_RANGES = {
  tissueCompliance: { min: 0, max: 0.01, step: 0.00001 },
  poseCompliance: { min: 0, max: 0.1, step: 0.0001 },
  damping: { min: 0, max: 20, step: 0.1 },
  gravityStrength: { min: 0, max: 20, step: 0.1 },
} as const;
export function toSolverSettings(settings: PhysicsSettings): SolverSettings {
  return {
    distanceCompliance: settings.tissueCompliance,
    poseCompliance: settings.poseCompliance,
    damping: settings.damping,
    // Proxy-space acceleration: the maximum gives 10 face extents/s². FaceCap
    // is upright along local Z; scene normalization must not rotate this vector.
    gravity: [0, 0, -0.5 * settings.gravityStrength],
  };
}
