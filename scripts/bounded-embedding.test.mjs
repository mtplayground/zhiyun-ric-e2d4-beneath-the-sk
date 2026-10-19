import { describe, expect, it } from 'vitest';
import { buildEmbedding, applyRegionAnnotations, encode, hash } from './generate-soft-tissue.mjs';
import { EMBEDDING_OUTSIDE, EMBEDDING_EXCLUDED, validateBoundedEmbedding } from '../src/domain/physics/bounded-embedding.mjs';
import { embedSimulationOffsets } from '../src/domain/physics/render-embedding';
import { loadSoftTissueAsset } from '../src/domain/simulation/soft-tissue-asset';

// Positive tetrahedron, with two explicit pairs of unit thickness.
const nodes=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],tetrahedra=[[0,1,2,3]],pairs=[[0,3],[1,2]];
const metadata={normalization:{center:[0,0,0],scale:1},units:{metresPerSourceUnit:1,verticalAxis:[0,1,0]}};
const face=(positions,regions=positions.map(()=>'skin'))=>({...metadata,positions,regions});
const packed=result=>({...result,nodes:nodes.flat(),tetrahedra:tetrahedra.flat(),pairs:pairs.flat(),labels:[0,0,1,2],metadata:{...metadata,embeddingPolicy:{maxOffsetFraction:0.5},counts:{renderVertices:result.embedding.length}},embedding:result.embedding.flat()});

describe('bounded nearest-point embedding',()=>{
  it('flags outside vertices, stores clamped weights and fades continuously with distance',()=>{
    const p=[[0.1,0.1,0.1],[0.2,0.2,-0.01],[0.2,0.2,-0.1],[0.2,0.2,-2],[0.2,0.2,-0.000001]];
    const result=buildEmbedding(face(p),nodes,tetrahedra,pairs,{outsideToleranceMetres:0.00001});
    expect(result.embeddingFlags).toEqual([0,EMBEDDING_OUTSIDE,EMBEDDING_OUTSIDE,EMBEDDING_OUTSIDE,0]);
    expect(result.embeddingFade[1]).toBeGreaterThan(result.embeddingFade[2]);expect(result.embeddingFade[3]).toBe(0);
    expect(result.embeddingFade[4]).toBe(1);
    for(const [, ...weights] of result.embedding) {
      expect(weights.every(w=>w>=0&&w<=1)).toBe(true);expect(weights.reduce((a,b)=>a+b,0)).toBeCloseTo(1,6);
    }
    expect(result.embedding[1][4]).toBe(0); // no negative/extrapolated Z weight
  });

  it('excludes teeth, eyes and inner mouth and gives positional copies identical complete records',()=>{
    const result=buildEmbedding(face([[0.1,0.1,0.1],[0.1,0.1,0.1],[0.2,0.1,0.1],[0.3,0.1,0.1],[0.4,0.1,0.1]],['skin','inner-mouth','teeth','eyes','skin']),nodes,tetrahedra,pairs);
    expect(result.embedding[0]).toEqual(result.embedding[1]);
    for(const property of ['embeddingFlags','embeddingFade','embeddingThickness','embeddingMaxOffsets']) expect(result[property][0]).toBe(result[property][1]);
    expect(result.embeddingFlags.slice(0,4).every(flag=>Boolean(flag&EMBEDDING_EXCLUDED))).toBe(true);
    const proxy=packed(result),target=new Float64Array(12),simulated=new Float64Array(12).fill(100);
    expect(Array.from(embedSimulationOffsets(proxy,simulated,target)).slice(0,12)).toEqual(Array(12).fill(0));
  });

  it('assigns identical inside and outside records to repeated accessor positions including the last vertex',()=>{
    const result=buildEmbedding(face([[0.1,0.1,0.1],[0.2,0.2,-0.1],[0.1,0.1,0.1],[0.2,0.2,-0.1]]),nodes,tetrahedra,pairs);
    for(const property of ['embedding','embeddingFlags','embeddingFade','embeddingThickness','embeddingMaxOffsets']) {
      expect(result[property][0]).toEqual(result[property][2]);expect(result[property][1]).toEqual(result[property][3]);
    }
    const target=new Float64Array(12),simulated=Float64Array.from({length:12},(_,i)=>i/10);
    const offsets=embedSimulationOffsets(packed(result),simulated,target);
    expect(Array.from(offsets.slice(0,3))).toEqual(Array.from(offsets.slice(6,9)));
    expect(Array.from(offsets.slice(3,6))).toEqual(Array.from(offsets.slice(9,12)));
  });

  it('fails generation for excessive displacement envelopes and extrapolating coefficients',()=>{
    const proxy=packed(buildEmbedding(face([[0.1,0.1,0.1]]),nodes,tetrahedra,pairs));
    expect(()=>validateBoundedEmbedding({...proxy,embeddingMaxOffsets:[proxy.embeddingThickness[0]]},0.5)).toThrow('exceeds local tissue');
    expect(()=>validateBoundedEmbedding({...proxy,embedding:[0,-1,2,0,0]},0.5)).toThrow('Extrapolated');
    expect(()=>buildEmbedding(face([[0,0,0]]),nodes,tetrahedra,pairs,{maxOffsetFraction:2})).toThrow('options');
  });

  it('requires source-bound anatomical annotations with exact counts, including the last record',()=>{
    const f=face([[0,0,0],[1,0,0]]);delete f.regions;
    expect(()=>buildEmbedding(f,nodes,tetrahedra,pairs)).toThrow('Missing or ambiguous');
    expect(()=>applyRegionAnnotations(f,{sourceHash:'wrong',regions:['skin','skin']},'source')).toThrow('source hash');
    expect(()=>applyRegionAnnotations(f,{sourceHash:'source',regions:['skin']},'source')).toThrow('last vertex');
    expect(()=>applyRegionAnnotations(f,{sourceHash:'source',regions:['skin','unknown']},'source')).toThrow('ambiguous');
    expect(applyRegionAnnotations(f,{sourceHash:'source',regions:['skin','inner-mouth']},'source').regions.at(-1)).toBe('inner-mouth');
  });

  it('round-trips policy sections byte-exactly and rejects stale assets and tampered caps',async()=>{
    const result=buildEmbedding(face([[0.1,0.1,0.1],[0.2,0.2,-0.1]]),nodes,tetrahedra,pairs);
    const asset={...result,nodes,tetrahedra,pairs,labels:[0,0,1,2],masses:[1,1,1,1],edges:[[0,1]],embeddingPolicy:{maxOffsetFraction:0.5,outsideToleranceMetres:0.00001,fadeDistanceThicknesses:1}};
    const source=new Uint8Array([1,2,3]);
    expect(()=>encode({...asset,embeddingMaxOffsets:[100,100]},{...metadata,sourceHash:hash(source)})).toThrow('exceeds local tissue');
    const bytes=encode(asset,{...metadata,sourceHash:hash(source)});
    expect(hash(encode(asset,{...metadata,sourceHash:hash(source)}))).toBe(hash(bytes));
    const buffer=b=>Uint8Array.from(b).buffer;
    const loaded=await loadSoftTissueAsset(buffer(bytes),buffer(source),2);
    expect(Array.from(loaded.embeddingFlags)).toEqual(result.embeddingFlags);
    expect(loaded.embeddingMaxOffsets.at(-1)).toBe(result.embeddingMaxOffsets.at(-1));
    const headerSize=bytes.readUInt32LE(4),header=JSON.parse(bytes.subarray(8,8+headerSize).toString());
    const corrupted=Buffer.from(bytes),section=header.sections.find(s=>s.name==='embeddingMaxOffsets');
    corrupted.writeDoubleLE(100,8+headerSize+section.offset);
    await expect(loadSoftTissueAsset(buffer(corrupted),buffer(source),2)).rejects.toThrow('exceeds local tissue');
    const old=Buffer.from(bytes);old.write(bytes.subarray(8,8+headerSize).toString().replace('"version":3','"version":2'),8);
    await expect(loadSoftTissueAsset(buffer(old),buffer(source),2)).rejects.toThrow('version 3');
  });
});
