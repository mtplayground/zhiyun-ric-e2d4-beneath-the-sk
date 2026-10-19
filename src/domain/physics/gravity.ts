import { metresPerSecondSquaredToProxyUnits, type UnitMetadata } from './physical-units';
import type { Vec3 } from './xpbd-solver';

/** Called once per loaded asset. Subsequent strength changes scale this vector. */
export function gravityFromMetadata(metadata: UnitMetadata): Vec3 {
  const acceleration = metresPerSecondSquaredToProxyUnits(-9.81, metadata);
  return metadata.units.verticalAxis.map(value => value === 0 ? 0 : value * acceleration) as [number, number, number];
}
