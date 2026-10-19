import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

// Pinned default FaceCap identity, independent of the generated asset's header.
export const EXPECTED_FACECAP_HASH = '6bfce6d0fcbb5839f5102b79733007859fef7c5df6d9eb49e2264542810b5f64';
export const EXPECTED_FACECAP_VERTICES = 2694;

export async function verifyCommittedSoftTissue(projectRoot, distDir) {
  const relativePath = 'data/facecap-soft-tissue.bin';
  const committed = await readFile(path.join(projectRoot, 'public', relativePath));
  const server = await createServer({ root: projectRoot, configFile: false, optimizeDeps: { noDiscovery: true, entries: [] },
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { validateSoftTissueAsset } = await server.ssrLoadModule('/src/domain/simulation/soft-tissue-asset.ts');
    const asset = validateSoftTissueAsset(Uint8Array.from(committed).buffer,
      EXPECTED_FACECAP_HASH, EXPECTED_FACECAP_VERTICES);
    if (distDir) {
      const published = await readFile(path.join(distDir, relativePath));
      assert(committed.equals(published), 'Built soft-tissue asset differs from committed bytes');
    }
    return asset;
  } finally {
    await server.close();
  }
}
