import { describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, Vector3 } from 'three';
import { createPoseTargetMapper, jawRotation, type PoseProxy, type PoseSurface } from './pose-target-mapper';
import { createMeshPoseTargetDriver } from './mesh-pose-target-driver';
import { createKinematicBlendshapeProvider } from '../providers/kinematic-blendshape-provider';
import { allPoseMappings, getKeyboardPoseEntries, getPoseWeights, findPoseMappingById } from '../poses/pose-library';
import { IDENTITY_TRANSFORM } from './xpbd-solver';

const proxy: PoseProxy = {
  nodes: [0,0,0, 1,0,0, 0,0,1, 0,-1,-1, 1,1,0],
  labels: [0,0,1,2,0],
  tetrahedra: [0,1,2,3],
  embedding: [0,1,0,0,0, 0,0,1,0,0, 0,0.5,0.5,0,0],
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
const array = (values: ArrayLike<number>) => Array.from(values);
function close(actual: ArrayLike<number>, expected: ArrayLike<number>) {
  expect(actual.length).toBe(expected.length);
  array(expected).forEach((v,i)=>expect(actual[i]).toBeCloseTo(v, 10));
}
function transform(m: readonly number[], p: number[]) {
  return [0,1,2].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);
}

describe('pose target mapper', () => {
  it('keeps Neutral exactly at proxy rest despite projected embeddings', () => {
    const result = createPoseTargetMapper(surface,proxy).map({});
    expect(array(result.poseTargets)).toEqual(array(proxy.nodes));
    expect(array(result.surfacePositions)).toEqual(array(surface.positions));
    close(result.jawTransform!, IDENTITY_TRANSFORM);
    expect(result.skullTransform).toBe(IDENTITY_TRANSFORM);
  });

  it('maps Smile through embedding weights, normalization and uncovered-node fallback', () => {
    const mapper = createPoseTargetMapper(surface,proxy);
    const result = mapper.map({mouthSmileLeft: 1, mouthSmileRight: 1});
    // Uniform one-source-unit displacement becomes 0.5 in normalized proxy space.
    close(array(result.poseTargets).slice(0,6), [0,0,0.5, 1,0,0.5]);
    close(array(result.poseTargets).slice(12), [1,1,0.5]);
    close(array(result.poseTargets).slice(6,12), array(proxy.nodes).slice(6,12));
    const asymmetric = mapper.map({mouthSmileLeft:1});
    expect(asymmetric.poseTargets[2]).toBeGreaterThan(asymmetric.poseTargets[5]);
    expect(array(proxy.nodes)).toEqual([0,0,0,1,0,0,0,0,1,0,-1,-1,1,1,0]);
  });

  it('drives AA jaw nodes with a rigid pivot rotation and keeps skull nodes fixed', () => {
    const mapper = createPoseTargetMapper(surface,proxy);
    const aa = findPoseMappingById('phoneme-aa')!;
    const result = mapper.map(getPoseWeights(aa,'kinematic-blendshape'));
    close(array(result.poseTargets).slice(6,9), [0,0,1]);
    close(array(result.poseTargets).slice(9,12), transform(result.jawTransform!, [0,-1,-1]));
    expect(result.poseTargets[11]).toBeLessThan(-1);
    const pivot = [0,0.05,0.02];
    close(transform(result.jawTransform!,pivot),pivot);
    const p = [0.1,-0.5,-0.2], q = [0.7,0.2,0.6];
    const rp = transform(result.jawTransform!,p), rq=transform(result.jawTransform!,q);
    expect(Math.hypot(...rp.map((v,i)=>v-rq[i]))).toBeCloseTo(Math.hypot(...p.map((v,i)=>v-q[i])));
  });

  it('matches the provider transition exactly without double smoothing', () => {
    const provider = createKinematicBlendshapeProvider();
    provider.initialize({assetUrl:'test',availableBlendshapes:Object.keys(surface.morphTargets),initialBlendshapeWeights:{}});
    const mapper = createPoseTargetMapper(surface,proxy);
    const input = { frameIndex: 3, progress: 0.3, previousBlendshapeWeights:{jawOpen:0.1}, targetPose:{id:'test',label:'test',blendshapeWeights:{jawOpen:0.9,mouthSmileLeft:0.5}} };
    const expected = mapper.map(provider.evaluateFrame(input).blendshapeWeights);
    close(mapper.evaluateFrame(input).poseTargets, expected.poseTargets);
    close(mapper.evaluateFrame(input).jawTransform!, expected.jawTransform!);
  });

  it('covers every preset and keyboard entry with the same mapper and accepts slider weights', () => {
    const names = new Set(allPoseMappings.flatMap(p=>Object.keys(getPoseWeights(p,'kinematic-blendshape'))));
    const morphTargets = Object.fromEntries([...names].map((name,i)=>[name,Array.from({length:9},(_,axis)=>(axis%3===i%3?0.01:0))]));
    const mapper = createPoseTargetMapper({...surface,morphTargets},proxy);
    for(const pose of [...allPoseMappings,...getKeyboardPoseEntries().map(entry=>entry.pose)]) {
      const result=mapper.map(getPoseWeights(pose,'kinematic-blendshape'));
      expect(array(result.poseTargets).every(Number.isFinite)).toBe(true);
      close(array(result.poseTargets).slice(6,9),[0,0,1]);
    }
    expect(mapper.map({jawOpen:0.23}).jawTransform).not.toEqual(mapper.map({jawOpen:0.51}).jawTransform);
  });

  it('uses provider alias max/clamping rules and rejects malformed embeddings', () => {
    const mapper=createPoseTargetMapper(surface,proxy);
    close(mapper.map({jawOpen:0.3,jaw_open:0.7}).poseTargets,mapper.map({jawOpen:0.7}).poseTargets);
    close(mapper.map({jawOpen:Infinity,mouthSmileLeft:-1,missing:1}).poseTargets,proxy.nodes);
    close(jawRotation(2),jawRotation(1));
    expect(()=>createPoseTargetMapper(surface,{...proxy,embedding:[...array(proxy.embedding).slice(0,-1),NaN]})).toThrow('embedding');
    expect(()=>createPoseTargetMapper(surface,{...proxy,tetrahedra:[0,1,2,99]})).toThrow('index');
    expect(()=>createPoseTargetMapper({...surface,positions:[0,0,0]},proxy)).toThrow('dimensions');
    expect(()=>jawRotation(1,{axis:[0,0,0]})).toThrow();
  });

  it.each([true,false])('evaluates the same posed surface as Three (relative=%s) and reads live applied influences', relative => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position',new Float32BufferAttribute(array(surface.positions),3));
    geometry.morphAttributes.position = Object.values(surface.morphTargets).map(delta=>new Float32BufferAttribute(array(delta).map((v,i)=>relative?v:v+surface.positions[i]),3));
    geometry.morphTargetsRelative=relative;
    const mesh = new Mesh(geometry);
    mesh.morphTargetDictionary = Object.fromEntries(Object.keys(surface.morphTargets).map((name,i)=>[name,i]));
    mesh.morphTargetInfluences=[0.2,0.6,0.9];
    const send=vi.fn();
    const driver=createMeshPoseTargetDriver(mesh,proxy,send);
    const result=driver.update();
    for(let i=0;i<3;i++) close(array(result.surfacePositions).slice(i*3,i*3+3),mesh.getVertexPosition(i,new Vector3()).toArray());
    expect(send).toHaveBeenCalledWith(result);
    mesh.morphTargetInfluences.fill(0);
    close(driver.update().poseTargets,proxy.nodes);
    geometry.dispose();
  });
});
