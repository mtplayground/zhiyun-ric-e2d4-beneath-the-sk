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
  const measure = (weights: Record<string, number>, id: number, regional = true) => {
      const posed = computePosedSurfacePositions(surface, weights);
      const upper = triangles(posed, lipRegions.upper, `candidate-${id}`);
      const lower = triangles(posed, lipRegions.lower, `candidate-${id}`);
      // Every candidate receives global and all regional distance/intersection checks.
      const global = inspectLipSurfaces(upper, lower);
      const forward = (rows: typeof upper) => Math.max(...rows.flatMap(t => [t.triangle.a.z, t.triangle.b.z, t.triangle.c.z]));
      const regions = (regional ? slabs : []).map(slab => ({ name: slab.name,
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

/** Repair other presets with the same four controls and real-surface kernel.
 * Staged search preserves the original jaw and expressive controls when possible.
 * Press/funnel and acceptance limits stay fixed. Contact fallback explicitly
 * records any closure reduction after the four-control search is exhausted. */
export async function searchPresetRepairs(failedIds: { id: string; requiredGapMetres: number; originalWeights?: Record<string, number> }[]) {
  const context = await createMeasurements();
  const poses = failedIds.map(({ id, requiredGapMetres, originalWeights }) => {
    const pose = findPoseMappingById(id);
    if (!pose) throw new Error(`Missing preset ${id}`);
    return { pose, requiredGapMetres, originalWeights };
  });
  const unique = (values: number[]) => [...new Set(values)];
  const repairs = [];
  for (const { pose, requiredGapMetres, originalWeights } of poses) {
    const base = originalWeights ?? getPoseWeights(pose, 'kinematic-blendshape');
    const jaw = base.jawOpen ?? 0, up = base.mouthUpperUpLeft ?? 0, down = base.mouthLowerDownLeft ?? 0;
    const hasClosure = (base.mouthClose ?? 0) > 0 || (base.mouthPressLeft ?? 0) > 0 || (base.mouthPressRight ?? 0) > 0;
    const trials = [];
    let feasible: typeof trials = [];
    const jaws = unique([jaw, ...[0.75, 0.5, 0.25].map(f => jaw * f), 0.02, 0.04, 0.08, 0.12, 0.24, 0.4]);
    for (const jawValue of jaws) {
      // Small repairs precede broad upper/lower search. No central maximum for
      // non-T presets: AA must remain an open vowel.
      const stages = [
        { up: [up], down: [down] },
        { up: [up], down: hasClosure ? [down] : unique([down, 0.005, 0.02, 0.08, 0.16, 0.32, 0.64, 1]) },
        { up: hasClosure ? [up] : unique([up, 0, 0.08, 0.16, 0.32, 0.64, 1]), down: hasClosure ? [down] : unique([down, 0, 0.02, 0.08, 0.16, 0.32, 0.64, 1]) },
      ];
      for (let stage = 0; stage < stages.length; stage++) {
        const stageRows = [];
        for (const upper of stages[stage].up) for (const lower of stages[stage].down)
          for (const roll of unique([base.mouthRollUpper ?? 0, 0.05, 0.1, 0.2, 0.4, 0.7, 1])) {
            const weights = { ...base, ...candidateWeights(jawValue, upper, lower, roll) };
            const row = context.measure(weights, trials.length, false);
            const rejections = [];
            if (row.intersection) rejections.push('intersection');
            if (row.minimumGapMetres < requiredGapMetres) rejections.push('gap-below-required');
            if (row.upperForwardExtentMinusLowerMetres > context.neutral.upperForwardExtentMinusLowerMetres) rejections.push('overhang');
            if ((weights.mouthClose ?? 0) > jawValue) rejections.push('closure-exceeds-jaw');
            const score = Object.keys(weights).reduce((sum, key) => sum + (weights[key] - (base[key] ?? 0)) ** 2, 0);
            const trial = { ...row, rejections, score, stage, jawValue };
            trials.push(trial); stageRows.push(trial);
          }
        feasible = stageRows.filter(row => !row.rejections.length).sort((a, b) => a.score - b.score || a.id - b.id);
        if (feasible.length) break;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (feasible.length) break;
    }
    // Contact poses can be overclosed even when all four T controls are
    // exhausted. Search closure reductions explicitly, retaining lower-roll,
    // funnel and all expressive controls; record these trials separately.
    if (!feasible.length && hasClosure) {
      for (const closure of [0.75, 0.5, 0.25, 0].map(f => (base.mouthClose ?? 0) * f)) {
        for (const jawValue of jaws) for (const roll of [0, 0.05, 0.1, 0.2, 0.4, 0.7, 1]) {
          const weights = { ...base, jawOpen: jawValue, mouthClose: closure, mouthRollUpper: roll };
          const row = context.measure(weights, trials.length, false);
          const rejections = [];
          if (row.intersection) rejections.push('intersection');
          if (row.minimumGapMetres < requiredGapMetres) rejections.push('gap-below-required');
          if (row.upperForwardExtentMinusLowerMetres > context.neutral.upperForwardExtentMinusLowerMetres) rejections.push('overhang');
          if (closure > jawValue) rejections.push('closure-exceeds-jaw');
          const score = Object.keys(weights).reduce((sum, key) => sum + (weights[key] - (base[key] ?? 0)) ** 2, 0);
          trials.push({ ...row, rejections, score, stage: 3, jawValue });
        }
        feasible = trials.filter(row => !row.rejections.length).sort((a, b) => a.score - b.score || a.id - b.id);
        if (feasible.length) break;
      }
    }
    repairs.push({ id: pose.id, original: base, selected: feasible[0] ?? null, alternatives: feasible.slice(0, 20), trials });
  }
  return { sourceHash: context.sourceHash, neutral: context.neutral, repairs };
}

/** Search feasible action repairs jointly: additive slider endpoints must pass too. */
export async function searchActionCompositions(repairs: { id: string; alternatives: { weights: Record<string, number>; score: number }[] }[]) {
  const context = await createMeasurements();
  const ids = ['au-12-smile', 'au-22-lip-funneler', 'au-25-lips-part'];
  const alternatives = ids.map(id => repairs.find(r => r.id === id)?.alternatives);
  if (alternatives.some(rows => !rows?.length)) throw new Error('Action search alternatives missing');
  const combinations = alternatives[0]!.flatMap(a => alternatives[1]!.flatMap(b => alternatives[2]!.map(c => ({ rows: [a, b, c], score: a.score + b.score + c.score })))).sort((a, b) => a.score - b.score);
  const tried = [];
  for (const combination of combinations) {
    const endpoints = [];
    for (let mask = 0; mask < 8; mask++) {
      const weights: Record<string, number> = {};
      combination.rows.forEach((row, bit) => {
        if (!(mask & (1 << bit))) return;
        for (const [name, value] of Object.entries(row.weights)) weights[name] = Math.min(1, (weights[name] ?? 0) + value);
      });
      const row = context.measure(weights, mask, false);
      const requiredGapMetres = mask & 6 ? 0.002 : 0;
      endpoints.push({ ...row, requiredGapMetres,
        valid: !row.intersection && row.minimumGapMetres >= requiredGapMetres && row.upperForwardExtentMinusLowerMetres <= context.neutral.upperForwardExtentMinusLowerMetres });
    }
    tried.push({ score: combination.score, endpoints });
    if (endpoints.every(row => row.valid)) return { sourceHash: context.sourceHash, selected: ids.map((id, i) => ({ id, weights: combination.rows[i].weights })), tried };
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { sourceHash: context.sourceHash, selected: null, tried };
}
