import type { UnitMetadata } from './physical-units';
export function validatePhysicalUnits(metadata: UnitMetadata): void;
export function metresToProxyUnits(metres: number, metadata: UnitMetadata): number;
export function metresPerSecondSquaredToProxyUnits(acceleration: number, metadata: UnitMetadata): number;
