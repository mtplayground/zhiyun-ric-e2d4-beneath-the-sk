import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { generate, encode, readFace, hash, determinant, faceFrame, physicalUnits } from './generate-soft-tissue.mjs';
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
    const binary=encode(asset,{sourceHash:hash(source),normalization:{center:[0,0,0],scale:1},units:{metresPerSourceUnit:1,verticalAxis:[0,0,1]}});
    await expect(loadSoftTissueAsset(buffer(binary),buffer(source),4)).resolves.toBeDefined();
    for(const units of [undefined,{metresPerSourceUnit:0,verticalAxis:[0,0,1]},{metresPerSourceUnit:1,verticalAxis:[0,0,2]}]) {
      const invalid=encode(asset,{sourceHash:hash(source),normalization:{center:[0,0,0],scale:1},units});
      await expect(loadSoftTissueAsset(buffer(invalid),buffer(source),4)).rejects.toThrow('physical units');
    }
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
    const face=await readFace(source,metadata.options);
    expect(face.units).toEqual(metadata.units);
    expect(face.normalization).toEqual(metadata.normalization);
    const asset=generate(face,metadata.options);
    expect(asset.nodes.length).toBe(metadata.counts.nodes);
    expect(asset.tetrahedra.length).toBe(metadata.counts.tetrahedra);
    expect(asset.edges.length).toBe(metadata.counts.edges);
    expect(asset.embedding.length).toBe(face.positions.length);
    expect(asset.embedding.at(-1).every(Number.isFinite)).toBe(true);
    expect(hash(encode(asset,metadata))).toBe(hash(committed));
    await expect(loadSoftTissueAsset(buffer(committed),buffer(source),face.positions.length)).resolves.toBeDefined();
  },120000);
});

describe('physical face frame', () => {
  const scene = (transform={}) => ({scene:0,scenes:[{nodes:[0]}],nodes:[{...transform,children:[1]},{mesh:0}]});
  it('composes parent transforms and maps world Y into local coordinates', () => {
    const frame=faceFrame(scene({rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2],scale:[0.01,0.01,0.01]}),0);
    expect(frame.metresPerSourceUnit).toBeCloseTo(0.01);
    expect(frame.verticalAxis[0]).toBeCloseTo(0);
    expect(frame.verticalAxis[1]).toBeCloseTo(0);
    expect(frame.verticalAxis[2]).toBeCloseTo(-1);
  });
  it('supports node matrices, signed axes and rejects ambiguous or distorted instances', () => {
    const matrix=[1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1];
    expect(faceFrame(scene({matrix}),0).verticalAxis[2]).toBeCloseTo(-1);
    expect(()=>faceFrame(scene({scale:[1,2,1]}),0)).toThrow('uniform');
    const duplicate=scene();duplicate.nodes[0].mesh=0;
    expect(()=>faceFrame(duplicate,0)).toThrow('one face instance');
  });
  it('checks both measured dimensions and requires explicit scale for implausible glTF units', () => {
    const positions=[[0,0,0],[160,240,20]];
    const frame={metresPerSourceUnit:1,verticalAxis:[0,1,0],rightAxis:[1,0,0]};
    expect(()=>physicalUnits(positions,frame)).toThrow('--metres-per-source-unit');
    const units=physicalUnits(positions,frame,0.001);
    expect(units.measurements).toEqual({widthMetres:0.16,heightMetres:0.24});
    expect(units.scaleSource).toBe('explicit');
    expect(physicalUnits(positions,{...frame,metresPerSourceUnit:0.001}).scaleSource).toBe('gltf');
    for(const invalid of [0,-1,NaN,Infinity]) expect(()=>physicalUnits(positions,frame,invalid)).toThrow();
    expect(()=>physicalUnits([[0,0,0],[0.01,0.24,0]],frame)).toThrow('Implausible');
  });
});
