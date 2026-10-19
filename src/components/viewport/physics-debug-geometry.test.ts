import { expect, it } from 'vitest';
import { NODE_COLORS, updateDebugPositions } from './physics-debug-geometry';

it('colors skin, skull and jaw distinctly and draws edges in face accessor space',()=>{
  expect(new Set(NODE_COLORS.map(c=>c.join(','))).size).toBe(3);
  const proxy={nodes:[0,0,0,1,0,0],labels:[1,2],pairs:[0,1],tetrahedra:[],embedding:[],edges:[0,1],metadata:{normalization:{center:[10,20,30],scale:2},counts:{renderVertices:0}}};
  const nodes=new Float32Array(6), edges=new Float32Array(6);
  updateDebugPositions(proxy,[0,0,0,1,0,-0.5],nodes,edges);
  expect(Array.from(nodes)).toEqual([10,20,30,12,20,29]);
  expect(Array.from(edges)).toEqual([10,20,30,12,20,29]);
});
