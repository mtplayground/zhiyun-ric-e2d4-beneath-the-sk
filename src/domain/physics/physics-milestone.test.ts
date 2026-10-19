import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readMilestoneProxy } from './physics-test-fixture';
import { XpbdSolver } from './xpbd-solver';
import { embedSimulationOffsets } from './render-embedding';

const path=new URL('../../../public/data/facecap-soft-tissue.bin',import.meta.url);
const bytes=readFileSync(path);
const metadata=JSON.parse(bytes.toString('utf8',8,8+bytes.readUInt32LE(4)));
describe('committed physics milestone asset',()=>{
  it('requires a usable committed version 3 asset with all paired SI masses',()=>{
    expect(metadata.version).toBe(3);
    const {asset}=readMilestoneProxy();
    expect(asset.pairs.length).toBe(asset.metadata.counts.nodes);
    expect(asset.masses.length).toBe(asset.metadata.counts.nodes);
    expect(Array.from(asset.masses).every(m=>m>0&&Number.isFinite(m))).toBe(true);
    expect(asset.masses.at(-1)).toBeGreaterThan(0);
  });

  it('keeps zero residual on valid SI data with all three edge classes at a mixed pose',()=>{
    const nodes=[0,0,0,1,0,0,0,0,-0.05,1,0,-0.05],pairs=[0,2,1,3];
    const targets=[0.1,0.2,0.3,1.2,-0.3,0.4,0.1,0.2,0.25,1.2,-0.3,0.35];
    const proxy={nodes,pairs,embeddingFlags:[0,0],embeddingFade:[1,1],embeddingThickness:[0.05,0.05],embeddingMaxOffsets:[0.025,0.025],labels:[0,0,1,2],tetrahedra:[0,1,2,3],embedding:[0,1,0,0,0,0,0,1,0,0],
      metadata:{embeddingPolicy:{maxOffsetFraction:0.5},normalization:{center:[0,0,0],scale:2},counts:{renderVertices:2}}};
    const a=new XpbdSolver({positions:nodes,pairs,masses:[0.002,0.003,0.004,0.005],edges:[0,1,2,3,0,2,1,3,0,3,1,2],gravity:[0,0,0]});
    a.reset({poseTargets:targets});
    for(let frame=0;frame<60;frame++) expect(a.step()).toEqual({reset:false});
    expect(Array.from(a.positions)).toEqual(targets);
    expect(a.velocities.every(v=>v===0)).toBe(true);
    expect(embedSimulationOffsets(proxy,a.positions,targets)).toEqual(new Float32Array(6));
  });
});
