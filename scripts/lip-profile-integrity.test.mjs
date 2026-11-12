import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = new URL('../docs/lip-profile/', import.meta.url);
test('committed profile data and images match their byte hashes', async () => {
  const hashes = JSON.parse(await readFile(new URL('integrity.json', directory), 'utf8'));
  assert.deepEqual(Object.keys(hashes).sort(), ['measurements.json', 'neutral.svg', 'phoneme-t.svg']);
  for (const [file, expected] of Object.entries(hashes)) {
    const bytes = await readFile(new URL(file, directory));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
  }
  const report = JSON.parse(await readFile(new URL('measurements.json', directory), 'utf8'));
  assert.equal(report.sourceHash, '6bfce6d0fcbb5839f5102b79733007859fef7c5df6d9eb49e2264542810b5f64');
  assert.deepEqual(report.results.map(row => row.id), ['neutral', 'phoneme-t']);
  for (const row of report.results) {
    assert.deepEqual(row.regions.map(region => region.name), ['front', 'middle', 'corner']);
    for (const region of row.regions) {
      assert.ok(Number.isFinite(region.minimumGapMetres));
      for (const side of region.sides) {
        assert.ok(Number.isFinite(side.minimumGapMetres));
        assert.ok(Number.isFinite(side.upperForwardExtentMinusLowerMetres));
        assert.equal(typeof side.sideProjectionOverlaps, 'boolean');
      }
    }
  }
});
