import { describe, expect, it } from 'vitest';
import { readMilestoneProxy } from './physics-test-fixture';
import { XpbdSolver } from './xpbd-solver';
import { jawRotation } from './pose-target-mapper';
import { embedSimulationOffsets } from './render-embedding';
import { measureDisplacement } from './physics-telemetry';

const {asset}=readMilestoneProxy();
function solver(substeps=4) {
  return new XpbdSolver({positions:asset.nodes,edges:asset.edges,labels:asset.labels,substeps,iterations:2,gravity:[0,0,0],distanceCompliance:0.001,poseCompliance:0.0001,damping:8});
}
describe('committed physics milestone asset',()=>{
  it('has complete topology and finite embeddings through the last render vertex',()=>{
    const {counts}=asset.metadata;
    expect(asset.nodes.length).toBe(counts.nodes*3);
    expect(asset.labels.length).toBe(counts.nodes);
    expect(asset.edges.length).toBe(counts.edges*2);
    expect(asset.tetrahedra.length).toBe(counts.tetrahedra*4);
    expect(asset.embedding.length).toBe(counts.renderVertices*5);
    expect(new Set(Array.from(asset.labels))).toEqual(new Set([0,1,2]));
    for(let i=0;i<asset.tetrahedra.length;i+=4) {
      const p=[0,1,2,3].map(corner=>{const node=asset.tetrahedra[i+corner];return [asset.nodes[node*3],asset.nodes[node*3+1],asset.nodes[node*3+2]];});
      const a=p[1].map((v,k)=>v-p[0][k]),b=p[2].map((v,k)=>v-p[0][k]),c=p[3].map((v,k)=>v-p[0][k]);
      const det=a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
      expect(det).toBeGreaterThan(1e-12);
    }
    for(let vertex=0;vertex<counts.renderVertices;vertex++) {
      const i=vertex*5,tet=asset.embedding[i];
      expect(Number.isInteger(tet)).toBe(true);expect(tet).toBeGreaterThanOrEqual(0);expect(tet).toBeLessThan(counts.tetrahedra);
      const weights=[1,2,3,4].map(corner=>asset.embedding[i+corner]);
      expect(weights.every(Number.isFinite)).toBe(true);
      expect(weights.reduce((a,b)=>a+b,0)).toBeCloseTo(1,5);
    }
    expect(embedSimulationOffsets(asset,asset.nodes,asset.nodes)).toEqual(new Float32Array(counts.renderVertices*3));
  });
  it.each([2,4])('remains finite and deterministic through repeated jaw/skin transitions (%s substeps)',substeps=>{
    const a=solver(substeps),b=solver(substeps);
    for(let frame=0;frame<24;frame++) {
      const weight=(frame%12)/11;
      const targets=Float64Array.from(asset.nodes,(value,i)=>asset.labels[Math.floor(i/3)]===0&&i%3===2?value+0.01*Math.sin(frame/4):value);
      const input={poseTargets:targets,jawTransform:jawRotation(weight)};
      expect(a.step(input)).toEqual({reset:false});expect(b.step(input)).toEqual({reset:false});
      expect(a.positions).toEqual(b.positions);
      expect(a.positions.every(Number.isFinite)).toBe(true);
      expect(embedSimulationOffsets(asset,a.positions,a.getPoseTargets()).every(Number.isFinite)).toBe(true);
      for(let node=0;node<asset.labels.length;node++) if(asset.labels[node]===1) {
        for(let axis=0;axis<3;axis++) expect(a.positions[node*3+axis]).toBe(asset.nodes[node*3+axis]);
      }
    }
  },120000);
  it('settles a disturbed skin node and recovers corrupt state without losing the current pose',()=>{
    const simulation=solver(2);
    const skin=Array.from(asset.labels).findIndex(label=>label===0);
    simulation.positions[skin*3]+=0.02;
    const before=measureDisplacement(simulation.positions,asset.nodes,asset.labels).maxDisplacement;
    for(let frame=0;frame<60;frame++) expect(simulation.step({poseTargets:asset.nodes}).reset).toBe(false);
    expect(measureDisplacement(simulation.positions,asset.nodes,asset.labels).maxDisplacement).toBeLessThan(before);
    const target=Float64Array.from(asset.nodes);
    target[skin*3]+=0.005;
    simulation.velocities[skin*3]=NaN;
    expect(simulation.step({poseTargets:target}).reset).toBe(true);
    expect(simulation.positions).toEqual(target);
    expect(simulation.velocities.every(v=>v===0)).toBe(true);
  },120000);
});
