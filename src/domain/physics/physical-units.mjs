export function validatePhysicalUnits(metadata) {
  const scale = metadata.normalization?.scale;
  const units = metadata.units;
  if (!Number.isFinite(scale) || scale <= 0 ||
      !Number.isFinite(units?.metresPerSourceUnit) || units.metresPerSourceUnit <= 0 ||
      !Array.isArray(units.verticalAxis) || units.verticalAxis.length !== 3 ||
      !units.verticalAxis.every(Number.isFinite) ||
      Math.abs(Math.hypot(...units.verticalAxis) - 1) > 1e-6) {
    throw new Error('Invalid simulation physical units; regenerate the asset');
  }
}

/** One proxy unit spans normalization.scale source units. */
export function metresToProxyUnits(metres, metadata) {
  validatePhysicalUnits(metadata);
  if (!Number.isFinite(metres)) throw new Error('Non-finite physical quantity');
  return metres / (metadata.units.metresPerSourceUnit * metadata.normalization.scale);
}

/** Time remains seconds, so acceleration uses the same length conversion. */
export function metresPerSecondSquaredToProxyUnits(acceleration, metadata) {
  return metresToProxyUnits(acceleration, metadata);
}
