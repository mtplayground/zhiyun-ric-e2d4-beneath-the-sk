import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { generate, encode, readFace, hash, determinant } from './generate-soft-tissue.mjs';
import { loadSoftTissueAsset } from '../src/domain/simulation/soft-tissue-asset';

const fixture = {positions:[[0,0,0],[1,0,0],[0,1,0]],indices:[0,1,2]};
const buffer = b => Uint8Array.from(b).buffer;
describe('soft tissue proxy', () => {
  it('creates positive tetrahedra, distinct attachments, edges and complete nearest embeddings', async () => {
    const face={...fixture,positions:[...fixture.positions,[0.2,0.2,0.2]]};
    const asset=generate(face,{target:12,upAxis:1,mouthLine:0.5});
    expect(asset.tetrahedra).toHaveLength(3);
    for(const tet of asset.tetrahedra) expect(determinant(...tet.map(i=>asset.nodes[i]))).toBeGreaterThan(1e-12);
    expect(new Set(asset.labels)).toEqual(new Set([0,1,2]));
    expect(asset.embedding).toHaveLength(4);
    for(const [index,...weights] of asset.embedding) {
      expect(index).toBeLessThan(asset.tetrahedra.length);
      expect(weights.reduce((a,b)=>a+b,0)).toBeCloseTo(1);
      expect(weights.every(Number.isFinite)).toBe(true);
    }
    const source=new Uint8Array([1,2,3]);
    const binary=encode(asset,{sourceHash:hash(source)});
    await expect(loadSoftTissueAsset(buffer(binary),buffer(source),4)).resolves.toBeDefined();
    await expect(loadSoftTissueAsset(buffer(binary),buffer(new Uint8Array([4])),4)).rejects.toThrow('does not match');
    await expect(loadSoftTissueAsset(buffer(binary),buffer(source),3)).rejects.toThrow('does not match');
  });
  it('rejects invalid parameters and degenerate surfaces', () => {
    expect(()=>generate(fixture,{thickness:0})).toThrow();
    expect(()=>generate({positions:[[0,0,0],[1,0,0],[2,0,0]],indices:[0,1,2]},{target:12})).toThrow();
  });
  it('reproduces the committed asset byte for byte from the exact upstream source, including the last embedding', async () => {
    const committed=await readFile(new URL('../public/data/facecap-soft-tissue.bin',import.meta.url));
    const metadata=JSON.parse(committed.subarray(8,8+committed.readUInt32LE(4)).toString());
    const response=await fetch(metadata.source);
    expect(response.ok).toBe(true);
    const source=Buffer.from(await response.arrayBuffer());
    expect(hash(source)).toBe(metadata.sourceHash);
    const face=await readFace(source);
    const asset=generate(face,metadata.options);
    expect(asset.embedding.length).toBe(face.positions.length);
    expect(asset.embedding.at(-1).every(Number.isFinite)).toBe(true);
    expect(hash(encode(asset,metadata))).toBe(hash(committed));
    await expect(loadSoftTissueAsset(buffer(committed),buffer(source),face.positions.length)).resolves.toBeDefined();
  },120000);
});
