import { describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, Vector3 } from 'three';
import { createPoseTargetMapper, type PoseProxy, type PoseSurface } from './pose-target-mapper';
import { createMeshPoseTargetDriver } from './mesh-pose-target-driver';
import { createKinematicBlendshapeProvider } from '../providers/kinematic-blendshape-provider';
import { allPoseMappings, getKeyboardPoseEntries, getPoseWeights, findPoseMappingById } from '../poses/pose-library';
import { XpbdSolver } from './xpbd-solver';

const proxy: PoseProxy = {
  nodes: [0,0,0, 1,0,0, 0,0,-0.05, 1,0,-0.05, 1,1,0, 1,1,-0.05],
  labels: [0,0,1,2,0,2], pairs: [0,2,1,3,4,5],
  tetrahedra: [0,1,2,3], embedding: [0,1,0,0,0, 0,0,1,0,0, 0,0.5,0.5,0,0],
  metadata: { normalization: { center: [10,20,30], scale: 2 }, counts: { renderVertices: 3 } },
};
const surface: PoseSurface = {
  positions: [10,20,30, 12,20,30, 11,22,30], morphTargetsRelative: true,
  morphTargets: {
    mouthSmile_L: [0,0,1, 0,0,0, 0,0,0.5],
    mouthSmile_R: [0,0,0, 0,0,1, 0,0,0.5],
    jaw_open: [0,-1,-1, 0,-1,-1, 0,-1,-1],
  },
};
const array=(values:ArrayLike<number>)=>Array.from(values);
function close(actual:ArrayLike<number>,expected:ArrayLike<number>) {
  expect(actual.length).toBe(expected.length);
  array(expected).forEach((v,i)=>expect(actual[i]).toBeCloseTo(v,10));
}
function pairedDisplacement(targets:ArrayLike<number>,p:PoseProxy=proxy) {
  for(let i=0;i<p.pairs.length;i+=2) {
    const outer=p.pairs[i],inner=p.pairs[i+1];
    for(let axis=0;axis<3;axis++) expect(targets[inner*3+axis]-p.nodes[inner*3+axis]).toBeCloseTo(targets[outer*3+axis]-p.nodes[outer*3+axis],12);
  }
}

describe('pose target mapper',()=>{
  it('keeps Neutral at rest and moves both layers with the expression',()=>{
    const mapper=createPoseTargetMapper(surface,proxy);
    expect(array(mapper.map({}).poseTargets)).toEqual(array(proxy.nodes));
    const result=mapper.map({mouthSmileLeft:1,mouthSmileRight:1});
    close(array(result.poseTargets).slice(0,6),[0,0,0.5,1,0,0.5]);
    close(array(result.poseTargets).slice(12),[1,1,0.5,1,1,0.45]);
    pairedDisplacement(result.poseTargets);
    const asymmetric=mapper.map({mouthSmileLeft:1});
    expect(asymmetric.poseTargets[2]).toBeGreaterThan(asymmetric.poseTargets[5]);
  });

  it('gets jaw motion only from the blendshape and explicit pair table, independent of labels',()=>{
    const mapped=createPoseTargetMapper(surface,{...proxy,labels:[2,1,0,0,1,0]}).map({jawOpen:1});
    for(let node=0;node<6;node++) close(array(mapped.poseTargets).slice(node*3,node*3+3),[proxy.nodes[node*3],proxy.nodes[node*3+1]-0.5,proxy.nodes[node*3+2]-0.5]);
    pairedDisplacement(mapped.poseTargets);
    expect(Object.keys(mapped).sort()).toEqual(['poseTargets','surfacePositions']);
    const noJaw=createPoseTargetMapper({...surface,morphTargets:{}},proxy).map({jawOpen:1});
    close(noJaw.poseTargets,proxy.nodes);
  });

  it.each([0,0.2,0.9,1])('uses jawOpen=%s only as a linear morph weight, with no hidden transform',weight=>{
    const targets=createPoseTargetMapper(surface,proxy).map({jawOpen:weight});
    for(let node=0;node<6;node++) {
      expect(targets.poseTargets[node*3]).toBeCloseTo(proxy.nodes[node*3],12);
      expect(targets.poseTargets[node*3+1]).toBeCloseTo(proxy.nodes[node*3+1]-weight/2,12);
      expect(targets.poseTargets[node*3+2]).toBeCloseTo(proxy.nodes[node*3+2]-weight/2,12);
    }
    expect(Object.keys(targets).sort()).toEqual(['poseTargets','surfacePositions']);
  });

  it('pools covered/uncovered coincident skin nodes and carries the result to their inner partners',()=>{
    const p:PoseProxy={...proxy,nodes:[...array(proxy.nodes),0,0,0,0,0,-0.05],labels:[...array(proxy.labels),0,1],pairs:[...array(proxy.pairs),6,7]};
    const targets=createPoseTargetMapper(surface,p).map({mouthSmileLeft:1}).poseTargets;
    close(array(targets).slice(18,21),array(targets).slice(0,3));
    pairedDisplacement(targets,p);
  });

  it('averages tied render accessors for an uncovered outer node',()=>{
    const s:PoseSurface={...surface,positions:[10,20,30,10,20,30,11,22,30],morphTargets:{mouthSmile_L:[0,0,1,0,0,3,0,0,0]}};
    const p:PoseProxy={...proxy,nodes:[...array(proxy.nodes).slice(0,12),0.1,0,0,0.1,0,-0.05]};
    const targets=createPoseTargetMapper(s,p).map({mouthSmileLeft:1}).poseTargets;
    close(array(targets).slice(12),[0.1,0,1,0.1,0,0.95]);pairedDisplacement(targets,p);
  });

  it('matches provider transition weights without smoothing twice',()=>{
    const provider=createKinematicBlendshapeProvider();
    provider.initialize({assetUrl:'test',availableBlendshapes:Object.keys(surface.morphTargets),initialBlendshapeWeights:{}});
    const mapper=createPoseTargetMapper(surface,proxy);
    const input={frameIndex:3,progress:0.3,previousBlendshapeWeights:{jawOpen:0.1},targetPose:{id:'test',label:'test',blendshapeWeights:{jawOpen:0.9,mouthSmileLeft:0.5}}};
    close(mapper.evaluateFrame(input).poseTargets,mapper.map(provider.evaluateFrame(input).blendshapeWeights).poseTargets);
  });

  it.each([
    ['Neutral',getPoseWeights(findPoseMappingById('phoneme-neutral')!,'kinematic-blendshape')],
    ['Smile',getPoseWeights(findPoseMappingById('expression-smile')!,'kinematic-blendshape')],
    ['AA',getPoseWeights(findPoseMappingById('phoneme-aa')!,'kinematic-blendshape')],
    ['Slider mix',{jawOpen:0.37,mouthSmileLeft:0.28,mouthSmileRight:0.63}],
  ] as const)('starts at exact full-target equilibrium without corrections or velocities: %s',(_name,weights)=>{
    const frame=createPoseTargetMapper(surface,proxy).map(weights);
    for(let i=0;i<proxy.pairs.length;i+=2) for(let axis=0;axis<3;axis++) {
      const outer=proxy.pairs[i]*3+axis,inner=proxy.pairs[i+1]*3+axis;
      expect(frame.poseTargets[inner]).toBe(proxy.nodes[inner]+(frame.poseTargets[outer]-proxy.nodes[outer]));
    }
    const simulation=new XpbdSolver({positions:frame.poseTargets,pairs:proxy.pairs,masses:[0.002,0.003,0.004,0.005,0.006,0.007],
      edges:[0,1,2,3,0,2,1,3,0,3,1,2,1,4,3,5,4,5],gravity:[0,0,0],substeps:4,iterations:5});
    expect(simulation.inverseMasses.every(w=>w>0&&Number.isFinite(w))).toBe(true);
    for(let i=0;i<10;i++) expect(simulation.step(frame)).toEqual({reset:false});
    expect(simulation.positions).toEqual(frame.poseTargets);
    expect(simulation.velocities.every(v=>v===0)).toBe(true);
    expect(Object.keys(frame).sort()).toEqual(['poseTargets','surfacePositions']);
  });

  it('is exact zero-gravity equilibrium for every preset, keyboard entry and slider mix',()=>{
    const names=new Set(allPoseMappings.flatMap(p=>Object.keys(getPoseWeights(p,'kinematic-blendshape'))));
    names.add('jawOpen');
    const morphTargets=Object.fromEntries([...names].map((name,i)=>[name,Array.from({length:9},(_,axis)=>axis%3===i%3?0.01*(1+Math.floor(axis/3)):0)]));
    const mapper=createPoseTargetMapper({...surface,morphTargets},proxy);
    const solver=new XpbdSolver({positions:proxy.nodes,pairs:proxy.pairs,masses:[0.002,0.003,0.004,0.005,0.006,0.007],
      edges:[0,1,2,3,0,2,1,3,0,3,1,2,1,4,3,5,4,5],gravity:[0,0,0],substeps:4,iterations:5});
    const presets=[...allPoseMappings,...getKeyboardPoseEntries().map(entry=>entry.pose)].map(p=>getPoseWeights(p,'kinematic-blendshape'));
    const mixes=Array.from({length:21},(_,i)=>Object.fromEntries([...names].map((name,k)=>[name,((i*7+k*3)%21)/20])));
    for(const weights of [{},...presets,...mixes]) {
      const frame=mapper.map(weights);pairedDisplacement(frame.poseTargets);
      solver.reset(frame);
      for(let step=0;step<3;step++) expect(solver.step()).toEqual({reset:false});
      expect(solver.positions).toEqual(frame.poseTargets);
      expect(solver.velocities.every(v=>v===0)).toBe(true);
    }
  });

  it('uses alias max/clamping rules and rejects invalid pair tables and embeddings',()=>{
    const mapper=createPoseTargetMapper(surface,proxy);
    close(mapper.map({jawOpen:0.3,jaw_open:0.7}).poseTargets,mapper.map({jawOpen:0.7}).poseTargets);
    close(mapper.map({jawOpen:Infinity,mouthSmileLeft:-1,missing:1}).poseTargets,proxy.nodes);
    expect(()=>createPoseTargetMapper(surface,{...proxy,pairs:[0,0,1,3,4,5]})).toThrow('pairing');
    expect(()=>createPoseTargetMapper(surface,{...proxy,embedding:[...array(proxy.embedding).slice(0,-1),NaN]})).toThrow('embedding');
    expect(()=>createPoseTargetMapper(surface,{...proxy,tetrahedra:[0,1,2,99]})).toThrow('index');
  });

  it.each([true,false])('matches Three posed positions and live influences (relative=%s)',relative=>{
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(array(surface.positions),3));
    geometry.morphAttributes.position=Object.values(surface.morphTargets).map(delta=>new Float32BufferAttribute(array(delta).map((v,i)=>relative?v:v+surface.positions[i]),3));
    geometry.morphTargetsRelative=relative;
    const mesh=new Mesh(geometry);mesh.morphTargetDictionary=Object.fromEntries(Object.keys(surface.morphTargets).map((name,i)=>[name,i]));mesh.morphTargetInfluences=[0.2,0.6,0.9];
    const send=vi.fn(),driver=createMeshPoseTargetDriver(mesh,proxy,send),result=driver.update();
    for(let i=0;i<3;i++) close(array(result.surfacePositions).slice(i*3,i*3+3),mesh.getVertexPosition(i,new Vector3()).toArray());
    expect(send).toHaveBeenCalledWith(result);pairedDisplacement(result.poseTargets);
    mesh.morphTargetInfluences.fill(0);close(driver.update().poseTargets,proxy.nodes);geometry.dispose();
  });
});
