import { expect, it } from 'vitest';
import { NODE_COLORS, updateDebugPositions, updateDebugPoseErrors } from './physics-debug-geometry';

it('uses three visual label colors and draws edges in face accessor space',()=>{
  expect(new Set(NODE_COLORS.map(c=>c.join(','))).size).toBe(3);
  const proxy={nodes:[0,0,0,1,0,0],labels:[1,2],pairs:[0,1],tetrahedra:[],embedding:[],edges:[0,1],metadata:{normalization:{center:[10,20,30],scale:2},counts:{renderVertices:0}}};
  const nodes=new Float32Array(6), edges=new Float32Array(6);
  updateDebugPositions(proxy,[0,0,0,1,0,-0.5],nodes,edges);
  expect(Array.from(nodes)).toEqual([10,20,30,12,20,29]);
  expect(Array.from(edges)).toEqual([10,20,30,12,20,29]);
});

it('draws a target residual for every node and stores SI distance attributes through the last node',()=>{
  const proxy={nodes:[0,0,0,1,0,0],labels:[0,2],pairs:[0,1],tetrahedra:[],embedding:[],edges:[0,1],metadata:{normalization:{center:[10,20,30],scale:2},counts:{renderVertices:0}}};
  const lines=new Float32Array(12),distances=new Float32Array(2);
  updateDebugPoseErrors(proxy,[0,0,0,1,0,-0.5],[0,0,0,1,0,0],[0,0.01],lines,distances);
  expect(Array.from(lines)).toEqual([10,20,30,10,20,30,12,20,29,12,20,30]);
  expect(distances[0]).toBe(0);expect(distances[1]).toBeCloseTo(0.01);
  const reordered=new Float32Array(12),otherDistances=new Float32Array(2);
  updateDebugPoseErrors({...proxy,labels:[2,0]},[0,0,0,1,0,-0.5],[0,0,0,1,0,0],[0,0.01],reordered,otherDistances);
  expect(reordered).toEqual(lines);expect(otherDistances).toEqual(distances);
  expect(()=>updateDebugPoseErrors(proxy,[0,0,0],[],[],lines,distances)).toThrow('dimensions');
});
