import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { searchGrid, geometryRejections, compareCandidates, candidateWeights } from './t-lip-search-policy.mjs';
const directory = new URL('../docs/t-lip-search/', import.meta.url);

test('search report and rendered review artifacts retain their exact bytes', async () => {
  for (const manifest of ['integrity.json', 'capture-integrity.json']) {
    const hashes = JSON.parse(await readFile(new URL(manifest, directory), 'utf8'));
    assert.ok(Object.keys(hashes).length > 0);
    for (const [file, hash] of Object.entries(hashes)) {
      assert.equal(createHash('sha256').update(await readFile(new URL(file, directory))).digest('hex'), hash, file);
    }
  }
});

test('every grid tuple, including the last, has complete measurements and reproducible vetoes', async () => {
  const report = JSON.parse(await readFile(new URL('results.json', directory), 'utf8'));
  assert.equal(report.sourceHash, '6bfce6d0fcbb5839f5102b79733007859fef7c5df6d9eb49e2264542810b5f64');
  assert.deepEqual(report.grid, searchGrid);
  assert.equal(report.tried, Object.values(searchGrid).reduce((n, values) => n * values.length, 1));
  assert.equal(report.rows.length, report.tried);
  let id = 0;
  for (const jaw of searchGrid.jawOpen) for (const upper of searchGrid.mouthUpperUp)
    for (const lower of searchGrid.mouthLowerDown) for (const roll of searchGrid.mouthRollUpper) {
      const row = report.rows[id];
      assert.equal(row.id, id++);
      assert.deepEqual(row.weights, candidateWeights(jaw, upper, lower, roll));
      assert.ok(Number.isFinite(row.minimumGapMetres));
      assert.ok(Number.isFinite(row.upperForwardExtentMinusLowerMetres));
      assert.equal(row.centralGapsMetres.length, 3);
      assert.deepEqual(row.regions.map(region => region.name), ['front', 'middle', 'corner']);
      assert.deepEqual(row.regions.map(region => region.sides.length), [1, 2, 2]);
      for (const region of row.regions) for (const side of region.sides) assert.ok(Number.isFinite(side.minimumGapMetres));
      assert.deepEqual(row.rejections, geometryRejections(row, report.neutral, report.aaWeights.jawOpen));
    }
  const feasible = report.rows.filter(row => row.rejections.length === 0).sort(compareCandidates);
  assert.equal(report.geometryFeasible, feasible.length);
  assert.deepEqual(report.shortlist, feasible.slice(0, 8).map(row => row.id));
});

test('selected candidate has acceptable geometry and recorded appearance evidence', async () => {
  const report = JSON.parse(await readFile(new URL('results.json', directory), 'utf8'));
  const selection = JSON.parse(await readFile(new URL('selection.json', directory), 'utf8'));
  const captures = JSON.parse(await readFile(new URL('captures.json', directory), 'utf8'));
  assert.equal(selection.sourceHash, report.sourceHash);
  assert.equal(captures.sourceHash, report.sourceHash);
  const row = report.rows[selection.selectedId];
  assert.deepEqual(row.weights, selection.weights);
  assert.deepEqual(row.rejections, []);
  assert.deepEqual(selection.appearance, { slightlyParted: true, upperTeethJustVisible: true, clearlyDifferentFromAA: true });
  for (const file of selection.evidence) {
    assert.ok(captures.captures.some(capture => capture.file === file));
    await readFile(new URL(file, directory));
  }
});
