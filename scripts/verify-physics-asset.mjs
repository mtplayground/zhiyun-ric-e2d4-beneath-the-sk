import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { hash, readFace, determinant } from './generate-soft-tissue.mjs';

// Release acceptance is separate from tests of legacy-asset rejection. A passing
// rejection test must never qualify an unusable committed asset for deployment.
const bytes = await readFile(new URL('../public/data/facecap-soft-tissue.bin', import.meta.url));
const integrity = JSON.parse(await readFile(new URL('../docs/facecap-asset-integrity.json', import.meta.url), 'utf8'));
assert.equal(hash(bytes), integrity.assetSha256, 'Committed binary bytes differ from the integrity report');
const metadata = JSON.parse(bytes.subarray(8, 8 + bytes.readUInt32LE(4)).toString());
assert.equal(metadata.version, 3, 'Committed FaceCap proxy must be version 3; regenerate the full 12 mm layer');
assert.equal(metadata.options.thicknessMetres, 0.012);
const response = await fetch(metadata.source);
assert(response.ok, 'Source mesh must be available for byte-integrity validation');
const source = Buffer.from(await response.arrayBuffer());
assert.equal(hash(source), metadata.sourceHash, 'Exact source GLB bytes changed');
const face = await readFace(source, metadata.options);
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { loadSoftTissueAsset } = await server.ssrLoadModule('/src/domain/simulation/soft-tissue-asset.ts');
  const asset = await loadSoftTissueAsset(Uint8Array.from(bytes).buffer, Uint8Array.from(source).buffer, face.positions.length);
  assert.deepEqual(metadata.counts, integrity.counts);
  if (face.simulationMask) {
    let excluded = 0;
    face.simulationMask.forEach((eligible, vertex) => {
      if (eligible) return;
      excluded++;
      assert(asset.embeddingFlags[vertex] & 2, `Missing exclusion at render vertex ${vertex}`);
      assert.equal(asset.embeddingFade[vertex], 0);
      assert.equal(asset.embeddingMaxOffsets[vertex], 0);
    });
    assert.equal(excluded, integrity.selectionPolicy.excludedVertices);
  }
  const metresPerProxy = metadata.units.metresPerSourceUnit * metadata.normalization.scale;
  const expectedMasses = new Float64Array(metadata.counts.nodes);
  for (let i = 0; i < asset.pairs.length; i += 2) {
    const a = asset.pairs[i], b = asset.pairs[i + 1];
    const distance = Math.hypot(...[0, 1, 2].map(axis => asset.nodes[a * 3 + axis] - asset.nodes[b * 3 + axis])) * metresPerProxy;
    assert(Math.abs(distance - 0.012) < 1e-7, `Pair ${i / 2} does not preserve 12 mm thickness`);
  }
  for (let i = 0; i < asset.tetrahedra.length; i += 4) {
    const indices = Array.from(asset.tetrahedra.slice(i, i + 4));
    const volume = determinant(...indices.map(node => Array.from(asset.nodes.slice(node * 3, node * 3 + 3)))) / 6;
    assert(volume > 1e-12 / 6, `Invalid tetrahedron ${i / 4}`);
    for (const node of indices) expectedMasses[node] += volume * metresPerProxy ** 3 * 1000 / 4;
  }
  expectedMasses.forEach((mass, node) => assert(Math.abs(asset.masses[node] - mass) < Math.max(1e-12, mass * 1e-9), `SI mass mismatch at node ${node}`));
  assert.equal(asset.embedding.length, face.positions.length * 5);
  assert(asset.embedding.slice(-5).every(Number.isFinite), 'Last render vertex must have an embedding');
  console.log(`PHYSICS_ASSET: passed (${metadata.counts.nodes} nodes; ${face.positions.length} render vertices; exact source hash)`);
} finally {
  await server.close();
}
