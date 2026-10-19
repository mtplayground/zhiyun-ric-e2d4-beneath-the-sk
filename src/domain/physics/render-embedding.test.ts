import { expect, it } from 'vitest';
import { embedSimulationOffsets } from './render-embedding';
import type { PoseProxy } from './pose-target-mapper';

it('embeds the residual only, including the last render vertex', () => {
  const proxy: PoseProxy={nodes:new Float32Array(12), labels:[0,0,1,2],pairs:[0,2,1,3],tetrahedra:[0,1,2,3],embedding:[0,1,0,0,0, 0,0,0,0,1],metadata:{counts:{renderVertices:2},normalization:{center:[0,0,0],scale:3}}};
  const target=Float64Array.from({length:12},(_,i)=>i);
  expect(Array.from(embedSimulationOffsets(proxy,target,target))).toEqual([0,0,0,0,0,0]);
  const simulated=target.slice(); simulated[11]+=0.5;
  expect(Array.from(embedSimulationOffsets(proxy,simulated,target))).toEqual([0,0,0,0,0,1.5]);
  simulated[11]=NaN;
  expect(()=>embedSimulationOffsets(proxy,simulated,target)).toThrow('Non-finite');
});
