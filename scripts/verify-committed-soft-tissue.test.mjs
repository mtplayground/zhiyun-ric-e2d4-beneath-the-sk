import { describe, it, expect } from 'vitest';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCommittedSoftTissue, EXPECTED_FACECAP_HASH, EXPECTED_FACECAP_VERTICES } from './verify-committed-soft-tissue.mjs';
import { validateSoftTissueAsset } from '../src/domain/simulation/soft-tissue-asset';

const root = fileURLToPath(new URL('../', import.meta.url));
const bytes = () => readFile(new URL('../public/data/facecap-soft-tissue.bin', import.meta.url));
const validate = binary => validateSoftTissueAsset(Uint8Array.from(binary).buffer,
  EXPECTED_FACECAP_HASH, EXPECTED_FACECAP_VERTICES);
function editHeader(binary, change) {
  const end = 8 + binary.readUInt32LE(4);
  const header = JSON.parse(binary.subarray(8, end).toString());
  change(header);
  const encoded = Buffer.from(JSON.stringify(header));
  const prefix = Buffer.from(binary.subarray(0, 8));
  prefix.writeUInt32LE(encoded.length, 4);
  return Buffer.concat([prefix, encoded, binary.subarray(end)]);
}

describe('static build FaceCap acceptance', () => {
  it('accepts the committed binary through the runtime validator without fetching the mesh', async () => {
    const asset = await verifyCommittedSoftTissue(root);
    expect(asset.metadata.counts.renderVertices).toBe(EXPECTED_FACECAP_VERTICES);
    expect(asset.masses.at(-1)).toBeGreaterThan(0);
    expect(asset.embedding.slice(-5).every(Number.isFinite)).toBe(true);
  });

  it('rejects old formats, incorrect source identity/counts and truncated payloads', async () => {
    const binary = await bytes();
    expect(() => validate(editHeader(binary, h => { h.version = 2; }))).toThrow('regenerate');
    expect(() => validate(editHeader(binary, h => { h.sourceHash = '0'.repeat(64); }))).toThrow('does not match');
    expect(() => validate(editHeader(binary, h => { h.counts.renderVertices--; }))).toThrow('does not match');
    expect(() => validate(binary.subarray(0, -1))).toThrow('section');
    const invalidMass = Buffer.from(binary);
    const end = 8 + invalidMass.readUInt32LE(4);
    const header = JSON.parse(invalidMass.subarray(8, end).toString());
    const section = header.sections.find(s => s.name === 'masses');
    invalidMass.writeDoubleLE(NaN, end + section.offset + section.bytes - 8);
    expect(() => validate(invalidMass)).toThrow('SI masses');
  });

  it('requires the published binary to match the committed bytes exactly', async () => {
    const dist = await mkdtemp(path.join(tmpdir(), 'facecap-static-'));
    try {
      await mkdir(path.join(dist, 'data'));
      await writeFile(path.join(dist, 'data/facecap-soft-tissue.bin'), await bytes());
      await expect(verifyCommittedSoftTissue(root, dist)).resolves.toBeDefined();
      await writeFile(path.join(dist, 'data/facecap-soft-tissue.bin'), 'invalid');
      await expect(verifyCommittedSoftTissue(root, dist)).rejects.toThrow('differs');
    } finally {
      await rm(dist, { recursive: true, force: true });
    }
  });
});
