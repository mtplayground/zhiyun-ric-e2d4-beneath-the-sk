import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { generate, encode, readFace, hash, determinant, faceFrame, physicalUnits, offsetFailure, validateOffset, prepareSurface } from './generate-soft-tissue.mjs';
import { loadSoftTissueAsset } from '../src/domain/simulation/soft-tissue-asset';

const fixture = {normalization:{center:[0,0,0],scale:1},units:{metresPerSourceUnit:1,verticalAxis:[0,0,1]},positions:[[0,0,0],[1,0,0],[0,1,0]],indices:[0,1,2]};
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
    expect(()=>generate(fixture,{thicknessMetres:0})).toThrow();
    expect(()=>generate({...fixture,positions:[[0,0,0],[1,0,0],[2,0,0]],indices:[0,1,2]},{target:12})).toThrow();
  });
  it('reproduces the recorded 12 mm failure from the exact source and rejects the retained legacy binary', async () => {
    const committed=await readFile(new URL('../public/data/facecap-soft-tissue.bin',import.meta.url));
    const failure=JSON.parse(await readFile(new URL('../docs/soft-tissue-generation-failure.json',import.meta.url),'utf8'));
    expect(hash(committed)).toBe(failure.retainedAssetSha256);
    const response=await fetch(failure.source);
    expect(response.ok).toBe(true);
    const source=Buffer.from(await response.arrayBuffer());
    expect(hash(source)).toBe(failure.sourceHash);
    const face=await readFace(source,failure.options);
    expect(face.positions).toHaveLength(failure.renderVertices);
    expect(face.positions.at(-1).every(Number.isFinite)).toBe(true);
    const topology=JSON.parse(await readFile(new URL('../docs/facecap-topology.json',import.meta.url),'utf8'));
    expect(topology.sourceHash).toBe(hash(source));
    const {topologyReport}=prepareSurface(face,failure.options);
    for(const key of ['beforeNormalSplit','beforeCreaseWeld','afterCreaseWeld']) expect(topologyReport[key]).toEqual(topology[key]);
    expect(topologyReport.beforeNormalSplit.foreheadGroups).toBe(0);
    expect(topologyReport.beforeCreaseWeld.foreheadGroups).toBeGreaterThan(0);
    expect(topologyReport.afterCreaseWeld.disconnectedGroups).toBe(0);
    try {
      generate(face,failure.options);
      expect.fail('The recorded source must fail at 12 mm until its geometry is repaired');
    } catch(error) {
      expect(error.diagnostic).toEqual(failure.diagnostic);
    }
    await expect(loadSoftTissueAsset(buffer(committed),buffer(source),face.positions.length)).rejects.toThrow('regenerate as version 2');
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

describe('version 2 SI layer data', () => {
  it('stores explicit ordered outer/inner pairs and positive volume-lumped SI masses including the last node', async () => {
    const asset=generate(fixture,{target:12});
    expect(asset.pairs).toHaveLength(3);
    const used=new Set();
    for(const [outer,inner] of asset.pairs) {
      used.add(outer);used.add(inner);
      expect(Math.hypot(...asset.nodes[outer].map((v,i)=>v-asset.nodes[inner][i]))).toBeCloseTo(0.012,7);
    }
    expect(used.size).toBe(asset.nodes.length);
    const reference=Array(asset.nodes.length).fill(0);
    for(const t of asset.tetrahedra) {
      const kg=determinant(...t.map(i=>asset.nodes[i]))/6*1000;
      for(const i of t) reference[i]+=kg/4;
    }
    expect(asset.masses).toEqual(reference);
    expect(asset.masses.reduce((a,b)=>a+b,0)).toBeCloseTo(6,5);
    expect(asset.masses.at(-1)).toBeGreaterThan(0);
    const source=new Uint8Array([1,2,3]);
    const metadata={sourceHash:hash(source),units:fixture.units,normalization:fixture.normalization};
    const bytes=encode(asset,metadata);
    const loaded=await loadSoftTissueAsset(buffer(bytes),buffer(source),3);
    expect(Array.from(loaded.pairs)).toEqual(asset.pairs.flat());
    expect(Array.from(loaded.masses)).toEqual(asset.masses);
    expect(hash(encode(asset,metadata))).toBe(hash(bytes));
    const legacy=Buffer.from(bytes);
    const headerLength=legacy.readUInt32LE(4);
    const header=legacy.subarray(8,8+headerLength).toString().replace('"version":2','"version":1');
    legacy.write(header,8);
    await expect(loadSoftTissueAsset(buffer(legacy),buffer(source),3)).rejects.toThrow('regenerate as version 2');
    for(const bad of [{...asset,pairs:[[0,0],[1,4],[2,5]]},{...asset,masses:[NaN,...asset.masses.slice(1)]}]) {
      await expect(loadSoftTissueAsset(buffer(encode(bad,metadata)),buffer(source),3)).rejects.toThrow('Invalid simulation');
    }
  });
  it('reports complete offset diagnostics without guessing anatomical annotations', () => {
    const error=offsetFailure(fixture,fixture.positions,[0,1,2],7,0.012,'fixture failure');
    expect(error.diagnostic).toMatchObject({proxyTriangleIndex:7,sourceTriangleIndex:0,
      centroidProxy:[1/3,1/3,0],normal:[0,0,1],requestedThicknessMetres:0.012,
      requestedThicknessProxy:0.012,nearestFacialRegion:'unknown: source has no anatomical region annotations'});
    const nodes=[...fixture.positions,[0,0,-0.012],[0,1,-0.012],[1,0,-0.012]];
    expect(()=>validateOffset(fixture,nodes,[0,1,2],3,0.012)).toThrow('Inner triangle folded');
  });
});
