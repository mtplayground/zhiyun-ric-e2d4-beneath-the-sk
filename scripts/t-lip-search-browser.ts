/** Vite-only CPU experiment on the real source; never imported by the app. */
import { createMorphTargetNameResolver } from '../src/domain/poses/morph-target-aliases';
import { loadLipMeasurementMesh } from '../e2e/lip-gap-browser-probe';
import { lipRegions } from '../e2e/facecap-lip-regions';
import { clipLipSlab, lipProfileBands, profileMetrics } from '../e2e/lip-profile-measurement';
import { inspectLipSurfaces } from '../e2e/lip-surface-geometry';
import { computePosedSurfacePositions } from '../src/domain/physics/pose-target-mapper';
import { findPoseMappingById, getPoseWeights } from '../src/domain/poses/pose-library';
// @ts-expect-error Experimental Node/browser shared policy is plain JavaScript.
import { searchGrid, searchLimits, candidateWeights, geometryRejections, compareCandidates } from './t-lip-search-policy.mjs';

async function createMeasurements() {
  const { source, sourceHash, surface, triangles } = await loadLipMeasurementMesh();
  const resolve = createMorphTargetNameResolver(Object.keys(surface.morphTargets));
  for (const name of ['jawOpen', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthRollUpper']) {
    if (!resolve(name)) throw new Error(`Missing required FaceCap morph ${name}`);
  }
  const upperNeutral = triangles(surface.positions, lipRegions.upper, 'neutral');
  const lowerNeutral = triangles(surface.positions, lipRegions.lower, 'neutral');
  const { slabs } = lipProfileBands(upperNeutral, lowerNeutral);
  const neutral = profileMetrics(upperNeutral, lowerNeutral);
  const aa = findPoseMappingById('phoneme-aa');
  if (!aa) throw new Error('AA missing');
  const aaWeights = getPoseWeights(aa, 'kinematic-blendshape');
  const measure = (weights: Record<string, number>, id: number) => {
      const posed = computePosedSurfacePositions(surface, weights);
      const upper = triangles(posed, lipRegions.upper, `candidate-${id}`);
      const lower = triangles(posed, lipRegions.lower, `candidate-${id}`);
      // Every candidate receives global and all regional distance/intersection checks.
      const global = inspectLipSurfaces(upper, lower);
      const forward = (rows: typeof upper) => Math.max(...rows.flatMap(t => [t.triangle.a.z, t.triangle.b.z, t.triangle.c.z]));
      const regions = slabs.map(slab => ({ name: slab.name,
        sides: slab.ranges.map(([min, max]) => inspectLipSurfaces(clipLipSlab(upper, min, max), clipLipSlab(lower, min, max))) }));
      const row = { id, weights, ...global, upperForwardExtentMinusLowerMetres: forward(upper) - forward(lower),
        regions, centralGapsMetres: regions.filter(r => r.name !== 'corner').flatMap(r => r.sides.map(s => s.minimumGapMetres)) };
    return { ...row, rejections: geometryRejections(row, neutral, aaWeights.jawOpen) };
  };
  return { source, sourceHash, slabs, aaWeights, neutral, measure };
}

export async function measureCurrentT() {
  const context = await createMeasurements();
  const pose = findPoseMappingById('phoneme-t');
  if (!pose) throw new Error('Missing T');
  return { sourceHash: context.sourceHash, neutral: context.neutral,
    result: context.measure(getPoseWeights(pose, 'kinematic-blendshape'), -1) };
}

export async function searchTWeights() {
  const { source, sourceHash, slabs, aaWeights, neutral, measure } = await createMeasurements();
  const rows = [];
  let id = 0;
  for (const jaw of searchGrid.jawOpen) for (const up of searchGrid.mouthUpperUp)
    for (const down of searchGrid.mouthLowerDown) for (const roll of searchGrid.mouthRollUpper) {
      rows.push(measure(candidateWeights(jaw, up, down, roll), id++));
      if (id % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
  const feasible = rows.filter(row => row.rejections.length === 0).sort(compareCandidates);
  const closest = [...rows].sort((a, b) => a.rejections.length - b.rejections.length ||
    Math.max(0, a.upperForwardExtentMinusLowerMetres - neutral.upperForwardExtentMinusLowerMetres) -
    Math.max(0, b.upperForwardExtentMinusLowerMetres - neutral.upperForwardExtentMinusLowerMetres) || compareCandidates(a, b))[0];
  return { source, sourceHash, regions: lipRegions, slabs, grid: searchGrid, limits: searchLimits,
    aaWeights, neutral, tried: rows.length, geometryFeasible: feasible.length,
    shortlist: feasible.slice(0, 8).map(row => row.id),
    appearanceShortlist: [...new Set(searchGrid.mouthUpperUp.flatMap((up: number) => {
      const group = feasible.filter(row => row.weights.mouthUpperUpLeft === up);
      return group.length ? [group[0].id, [...group].sort((a, b) => compareCandidates(b, a))[0].id] : [];
    }))], closestId: closest.id,
    selectedId: null, appearanceStatus: 'Not assessed by geometry; rendered review required', rows };
}
