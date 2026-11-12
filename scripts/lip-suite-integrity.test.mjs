import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = new URL('../docs/lip-suite/', import.meta.url);
const sourceHash = '6bfce6d0fcbb5839f5102b79733007859fef7c5df6d9eb49e2264542810b5f64';

test('all measurement/search evidence and both screenshot references retain their bytes', async () => {
  const hashes = JSON.parse(await readFile(new URL('integrity.json', directory), 'utf8'));
  assert.deepEqual(Object.keys(hashes).sort(), ['before.json', 'composition-repairs.json', 'contact-repairs.json', 'measurements.json', 'repairs.json']);
  for (const [file, expected] of Object.entries(hashes)) {
    assert.equal(createHash('sha256').update(await readFile(new URL(file, directory))).digest('hex'), expected, file);
  }
  const references = new URL('../e2e/post-revert-visual.spec.ts-snapshots/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('integrity.json', references), 'utf8'));
  assert.equal(manifest.sourceHash, sourceHash);
  assert.deepEqual(Object.keys(manifest.hashes).sort(), ['phoneme-t-front-chromium-linux.png', 'phoneme-t-profile-chromium-linux.png']);
  assert.equal(manifest.maxDiffPixels, 100);
  for (const [file, expected] of Object.entries(manifest.hashes)) {
    assert.equal(createHash('sha256').update(await readFile(new URL(file, references))).digest('hex'), expected, file);
  }
});

test('the complete captured preset/slider matrix meets the unchanged strict limits, including the last row', async () => {
  const report = JSON.parse(await readFile(new URL('measurements.json', directory), 'utf8'));
  assert.equal(report.sourceHash, sourceHash);
  assert.equal(report.minimumOpenGapMetres, 0.002);
  assert.ok(Number.isFinite(report.neutralOverhangMetres));
  assert.equal(new Set(report.presetIds).size, report.presetIds.length);
  assert.deepEqual(report.results.filter(row => !row.id.startsWith('slider-')).map(row => row.id), report.presetIds);
  const sliderCount = 2 ** report.sliderControlIds.length;
  assert.deepEqual(report.results.filter(row => row.id.startsWith('slider-')).map(row => row.id), Array.from({ length: sliderCount }, (_, i) => `slider-${i}`));
  assert.equal(report.results.length, report.presetIds.length + sliderCount);
  assert.equal(report.results.at(-1).id, `slider-${sliderCount - 1}`);
  for (const row of report.results) {
    assert.ok(row.id && row.label && row.weights);
    assert.equal(row.intersection, null, row.id);
    assert.ok(Number.isFinite(row.minimumGapMetres) && row.minimumGapMetres >= row.requiredGapMetres, row.id);
    assert.ok(Number.isFinite(row.upperForwardExtentMinusLowerMetres) && row.upperForwardExtentMinusLowerMetres <= report.neutralOverhangMetres, row.id);
  }
  assert.equal(report.results.find(row => row.id === 'phoneme-t').requiredGapMetres, 0.002);
});

test('repair evidence includes every trial and the final joint slider decision', async () => {
  for (const file of ['repairs.json', 'contact-repairs.json']) {
    const report = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
    assert.equal(report.sourceHash, sourceHash);
    for (const repair of report.repairs) {
      assert.ok(repair.trials.length > 0);
      repair.trials.forEach((row, index) => {
        assert.equal(row.id, index);
        assert.ok(Number.isFinite(row.minimumGapMetres));
        assert.ok(Number.isFinite(row.upperForwardExtentMinusLowerMetres));
        assert.ok(Array.isArray(row.rejections));
      });
      if (repair.selected) assert.deepEqual(repair.selected.rejections, []);
    }
  }
  const joint = JSON.parse(await readFile(new URL('composition-repairs.json', directory), 'utf8'));
  assert.equal(joint.sourceHash, sourceHash);
  assert.equal(joint.selected.length, 3);
  assert.equal(joint.tried.at(-1).endpoints.length, 8);
  assert.ok(joint.tried.at(-1).endpoints.every(row => row.valid));
});
