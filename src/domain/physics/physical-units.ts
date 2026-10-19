/** Directions are expressed in the normalized face-local proxy frame. */
export interface PhysicalUnits {
  metresPerSourceUnit: number;
  verticalAxis: number[];
}
export interface UnitMetadata {
  normalization: { scale: number };
  units: PhysicalUnits;
}

export { validatePhysicalUnits, metresToProxyUnits, metresPerSecondSquaredToProxyUnits } from './physical-units.mjs';
