import { expect, it } from 'vitest';
import { embedSimulationOffsets } from './render-embedding';
import type { PoseProxy } from './pose-target-mapper';

const proxy:PoseProxy={nodes:new Float32Array(12),labels:[0,0,1,2],pairs:[0,2,1,3],tetrahedra:[0,1,2,3],
  embedding:[0,1,0,0,0,0,0,0,0,1],embeddingFlags:[0,1],embeddingFade:[1,0.5],embeddingThickness:[0.012,0.012],embeddingMaxOffsets:[0.006,0.006],
  metadata:{embeddingPolicy:{maxOffsetFraction:0.5},counts:{renderVertices:2},normalization:{center:[0,0,0],scale:3}}};
it('applies residuals, distance fade and local-thickness bounds through the last vertex',()=>{
  const target=Float64Array.from({length:12},(_,i)=>i);
  expect(Array.from(embedSimulationOffsets(proxy,target,target))).toEqual([0,0,0,0,0,0]);
  const simulated=target.slice();simulated[11]+=0.004;
  expect(embedSimulationOffsets(proxy,simulated,target)[5]).toBeCloseTo(0.006);
  simulated[11]+=1000;
  expect(Math.hypot(...embedSimulationOffsets(proxy,simulated,target).slice(3))).toBeLessThanOrEqual(0.018);
  simulated[11]=NaN;expect(()=>embedSimulationOffsets(proxy,simulated,target)).toThrow('Non-finite');
});
it('bounds arbitrary directions after float32 rounding and excludes anatomical regions exactly',()=>{
  const targets=new Float64Array(12);
  for(let i=1;i<50;i++) {
    const simulated=Float64Array.from({length:12},(_,axis)=>Math.sin(i+axis)*1e6);
    const offsets=embedSimulationOffsets(proxy,simulated,targets);
    expect(Math.hypot(...offsets.slice(0,3))).toBeLessThanOrEqual(0.018);
    expect(Math.hypot(...offsets.slice(3))).toBeLessThanOrEqual(0.018);
  }
  const excluded={...proxy,embeddingFlags:[2,3],embeddingFade:[0,0],embeddingMaxOffsets:[0,0]};
  expect(Array.from(embedSimulationOffsets(excluded,new Float64Array(12).fill(1e10),targets))).toEqual([0,0,0,0,0,0]);
  expect(()=>embedSimulationOffsets({...proxy,embeddingFlags:undefined},targets,targets)).toThrow('regenerate');
  expect(()=>embedSimulationOffsets({...proxy,embeddingMaxOffsets:[1,1]},targets,targets)).toThrow('bounded');
  expect(()=>embedSimulationOffsets({...proxy,embedding:[0,-1,2,0,0,0,0,0,0,1]},targets,targets)).toThrow('Extrapolated');
});
