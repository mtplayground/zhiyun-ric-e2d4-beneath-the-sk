import { SOLVER_DEFAULTS } from './xpbd-solver';
import type { PhysicsHostSettings } from './physics-host';

/** Product settings use SI units; XPBD compliance stays an implementation detail. */
export interface PhysicsSettings {
  edgeStiffness: number;
  skinPoseStiffness: number;
  innerPoseStiffness: number;
  damping: number;
  gravityAcceleration: number;
}
export const DEFAULT_PHYSICS_SETTINGS: Readonly<PhysicsSettings> = Object.freeze({
  edgeStiffness: Number((1 / SOLVER_DEFAULTS.distanceCompliance).toPrecision(12)),
  skinPoseStiffness: Number((1 / SOLVER_DEFAULTS.poseCompliance).toPrecision(12)),
  innerPoseStiffness: Number((1 / SOLVER_DEFAULTS.innerPoseCompliance).toPrecision(12)),
  damping: SOLVER_DEFAULTS.damping,
  gravityAcceleration: 9.81,
});
export type PhysicsPreset = 'physical' | 'visible-demonstration';
export const PHYSICS_PRESETS: Readonly<Record<PhysicsPreset, Readonly<PhysicsSettings>>> = Object.freeze({
  physical: DEFAULT_PHYSICS_SETTINGS,
  'visible-demonstration': Object.freeze({
    ...DEFAULT_PHYSICS_SETTINGS,
    gravityAcceleration: 98.1,
    skinPoseStiffness: 20,
    edgeStiffness: 200,
    damping: 8,
  }),
});

export const PHYSICS_SETTING_RANGES = {
  edgeStiffness: { min: 100, max: 1000000, step: 100 },
  skinPoseStiffness: { min: 5, max: 1000, step: 1 },
  innerPoseStiffness: { min: 10000, max: 1000000, step: 1000 },
  damping: { min: 0, max: 20, step: 0.1 },
  gravityAcceleration: { min: 0, max: 196.2, step: 0.01 },
} as const;
export function toSolverSettings(settings: PhysicsSettings): PhysicsHostSettings {
  for (const key of Object.keys(PHYSICS_SETTING_RANGES) as (keyof PhysicsSettings)[]) {
    if (!Number.isFinite(settings[key]) || settings[key] < 0 || (key.endsWith('Stiffness') && settings[key] === 0)) throw new Error(`Invalid physics setting ${key}`);
  }
  return {
    distanceCompliance: 1 / settings.edgeStiffness,
    poseCompliance: 1 / settings.skinPoseStiffness,
    innerPoseCompliance: 1 / settings.innerPoseStiffness,
    damping: settings.damping,
    // The host already caches SI gravity for this asset; scale it without a
    // second length conversion or an assumed face-local axis.
    gravityStrength: settings.gravityAcceleration / 9.81,
  };
}
