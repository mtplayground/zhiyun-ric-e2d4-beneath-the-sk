import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geometryRejections, candidateWeights, compareCandidates } from './t-lip-search-policy.mjs';

const neutral = { upperForwardExtentMinusLowerMetres: 0.026 };
const base = () => ({ id: 1, weights: candidateWeights(0.01, 0.005, 0, 0.1), intersection: null,
  centralGapsMetres: [0.002, 0.003, 0.0025], upperForwardExtentMinusLowerMetres: 0.025 });

test('2mm is inclusive, but even one middle side below it rejects the candidate', () => {
  const row = base();
  assert.deepEqual(geometryRejections(row, neutral, 0.9), []);
  row.centralGapsMetres[2] = 0.001999;
  assert.ok(geometryRejections(row, neutral, 0.9).includes('middle-gap-below-2mm'));
});

test('intersection, excessive overhang, and AA-like opening each veto acceptance', () => {
  for (const change of [
    { intersection: { upper: 1, lower: 2 } },
    { upperForwardExtentMinusLowerMetres: 0.02600001 },
    { weights: candidateWeights(0.9, 0, 0, 0) },
    { centralGapsMetres: [0.02, 0.02, 0.02] },
    { centralGapsMetres: [NaN, 0.003, 0.004] },
  ]) assert.ok(geometryRejections({ ...base(), ...change }, neutral, 0.9).length > 0);
});

test('ranking prefers slight parting to a larger feasible opening', () => {
  const small = base();
  const large = { ...base(), id: 0, centralGapsMetres: [0.008, 0.009, 0.01] };
  assert.ok(compareCandidates(small, large) < 0);
});
