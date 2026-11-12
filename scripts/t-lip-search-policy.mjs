/** Deterministic grid; bilateral values map to the two FaceCap side morphs. */
export const searchGrid = {
  jawOpen: [0, 0.0025, 0.005, 0.01, 0.02, 0.04, 0.08, 0.12],
  mouthUpperUp: [0, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1],
  mouthLowerDown: [0, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1],
  mouthRollUpper: [0, 0.05, 0.1, 0.2, 0.4, 0.7, 1],
};
export const searchLimits = {
  minimumMiddleGapMetres: 0.002,
  maximumCentralGapMetres: 0.012,
  maximumJawOpen: 0.12,
  maximumAAJawFraction: 0.25,
};
export function candidateWeights(jawOpen, mouthUpperUp, mouthLowerDown, mouthRollUpper) {
  return { jawOpen, mouthUpperUpLeft: mouthUpperUp, mouthUpperUpRight: mouthUpperUp,
    mouthLowerDownLeft: mouthLowerDown, mouthLowerDownRight: mouthLowerDown, mouthRollUpper };
}
export function geometryRejections(row, neutral, aaJawOpen) {
  const reasons = [];
  if (row.intersection !== null) reasons.push('lip-intersection');
  if (!row.centralGapsMetres.every(gap => Number.isFinite(gap) && gap >= searchLimits.minimumMiddleGapMetres)) reasons.push('middle-gap-below-2mm');
  if (!Number.isFinite(row.upperForwardExtentMinusLowerMetres) || row.upperForwardExtentMinusLowerMetres > neutral.upperForwardExtentMinusLowerMetres) reasons.push('overhang-exceeds-neutral');
  if (!row.centralGapsMetres.every(gap => gap <= searchLimits.maximumCentralGapMetres)) reasons.push('opening-too-large');
  if (row.weights.jawOpen > searchLimits.maximumJawOpen || row.weights.jawOpen > aaJawOpen * searchLimits.maximumAAJawFraction) reasons.push('jaw-too-close-to-aa');
  return reasons;
}
/** Geometry rank: smallest opening above 2 mm, then least total activation.
 * This ranks a review shortlist; it never certifies teeth visibility or T appearance. */
export function compareCandidates(a, b) {
  return Math.max(...a.centralGapsMetres) - Math.max(...b.centralGapsMetres) ||
    Object.values(a.weights).reduce((s, v) => s + v, 0) - Object.values(b.weights).reduce((s, v) => s + v, 0) ||
    a.id - b.id;
}
