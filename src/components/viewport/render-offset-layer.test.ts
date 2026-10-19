import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  Box3, Sphere, BufferGeometry, DynamicDrawUsage, Float32BufferAttribute, InterleavedBuffer,
  InterleavedBufferAttribute, Vector3, Mesh, MeshStandardMaterial, ShaderLib,
} from 'three';
import { createRenderOffsetLayer } from './render-offset-layer';

function fixture(culling=true) {
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute([0,0,0,1,1,1],3));
  geometry.morphAttributes.position=[new Float32BufferAttribute([0,0,1,0,0,2],3)];
  geometry.morphTargetsRelative=true;
  const material=new MeshStandardMaterial(),mesh: Mesh=new Mesh(geometry,material);
  mesh.frustumCulled=culling;
  return {geometry,material,mesh,layer:createRenderOffsetLayer(mesh)};
}
const digest=(bytes:ArrayBuffer)=>createHash('sha256').update(Buffer.from(bytes)).digest('hex');

describe('render offset layer',()=>{
  it.each([true,false])('preserves geometry/accessor identity and restores culling=%s without disposing loaded resources',culling=>{
    const {geometry,material,mesh,layer}=fixture(culling);
    const attributes=geometry.attributes,morphs=geometry.morphAttributes;
    const position=geometry.getAttribute('position'),morph=geometry.morphAttributes.position![0];
    const cloneGeometry=vi.spyOn(geometry,'clone').mockImplementation(()=>{throw Error('Geometry must never be cloned');});
    const geometryDispose=vi.spyOn(geometry,'dispose'),materialDispose=vi.spyOn(material,'dispose');
    for(let cycle=0;cycle<3;cycle++) {
      const input=new Float32Array([0.1,0.2,0.3,0.4,0.5,0.6]);
      layer.apply(input);
      expect(mesh.geometry).toBe(geometry);expect(geometry.attributes).toBe(attributes);expect(geometry.morphAttributes).toBe(morphs);
      expect(geometry.getAttribute('position')).toBe(position);expect(geometry.morphAttributes.position![0]).toBe(morph);
      expect(mesh.material).not.toBe(material);expect(mesh.frustumCulled).toBe(false);
      const copiedMaterial=mesh.material as MeshStandardMaterial,dispose=vi.spyOn(copiedMaterial,'dispose');
      const offset=geometry.getAttribute('simulationOffset') as Float32BufferAttribute;
      expect(offset.usage).toBe(DynamicDrawUsage);
      expect(offset.array).not.toBe(input);expect(Array.from(offset.array)).toEqual(Array.from(input));
      input.fill(7);expect(offset.getX(0)).toBeCloseTo(0.1);
      layer.apply(new Float32Array(6));
      expect(geometry.getAttribute('simulationOffset')).toBe(offset);
      expect(mesh.material).toBe(copiedMaterial);
      expect(offset.version).toBe(2);
      layer.apply(); // Off or reset: release only the offset attribute/material.
      expect(geometry.hasAttribute('simulationOffset')).toBe(false);
      expect(mesh.geometry).toBe(geometry);expect(mesh.material).toBe(material);expect(mesh.frustumCulled).toBe(culling);
      expect(dispose).toHaveBeenCalledOnce();layer.apply();expect(dispose).toHaveBeenCalledOnce();
    }
    layer.dispose();layer.dispose();layer.apply(new Float32Array(6));
    expect(geometry.hasAttribute('simulationOffset')).toBe(false);
    expect(cloneGeometry).not.toHaveBeenCalled();expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();
  });

  it('applies the offset after morph displacement and preserves material shader hooks',()=>{
    const {geometry,material,mesh,layer}=fixture();
    const hook=vi.fn((shader:{vertexShader:string})=>{shader.vertexShader='// original hook\n'+shader.vertexShader;});
    material.onBeforeCompile=hook;material.customProgramCacheKey=()=> 'original-program';
    layer.apply(new Float32Array(6));
    const copied=mesh.material as MeshStandardMaterial;
    const shader={vertexShader:ShaderLib.standard.vertexShader,fragmentShader:'',uniforms:{}};
    copied.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0],{} as Parameters<typeof material.onBeforeCompile>[1]);
    expect(hook).toHaveBeenCalledOnce();expect(hook.mock.contexts[0]).toBe(copied);
    expect(shader.vertexShader).toContain('// original hook');
    expect(shader.vertexShader).toContain('#include <morphtarget_vertex>\ntransformed += simulationOffset;');
    expect(shader.vertexShader.indexOf('transformed += simulationOffset;')).toBeLessThan(shader.vertexShader.indexOf('#include <project_vertex>'));
    expect(copied.customProgramCacheKey()).toBe('original-program:xpbd-offset-v2');
    layer.dispose();expect(mesh.material).toBe(material);expect(material.onBeforeCompile).toBe(hook);
    expect(geometry.getAttribute('simulationOffset')).toBeUndefined();
  });

  it('copies all materials and cleans up only those copies',()=>{
    const {geometry,material,mesh}=fixture();
    const second=new MeshStandardMaterial(),originals=[material,second];mesh.material=originals;
    const layer=createRenderOffsetLayer(mesh);layer.apply(new Float32Array(6));
    const copies=mesh.material as MeshStandardMaterial[];
    expect(copies).toHaveLength(2);expect(copies[0]).not.toBe(material);expect(copies[1]).not.toBe(second);
    const copiedDisposes=copies.map(m=>vi.spyOn(m,'dispose'));
    const originalDisposes=originals.map(m=>vi.spyOn(m,'dispose'));
    layer.dispose();expect(mesh.material).toBe(originals);
    copiedDisposes.forEach(spy=>expect(spy).toHaveBeenCalledOnce());originalDisposes.forEach(spy=>expect(spy).not.toHaveBeenCalled());
    expect(mesh.geometry).toBe(geometry);
  });

  it('rejects invalid buffers and reserved attributes without altering loaded resources',()=>{
    const {geometry,material,mesh,layer}=fixture();
    for(const values of [new Float32Array(0),new Float32Array([NaN,0,0,0,0,0]),new Float32Array([Infinity,0,0,0,0,0])]) expect(()=>layer.apply(values)).toThrow('Invalid face vertex offsets');
    expect(mesh.material).toBe(material);expect(mesh.frustumCulled).toBe(true);
    const reserved=new Float32BufferAttribute(new Float32Array(6),3);geometry.setAttribute('simulationOffset',reserved);
    expect(()=>layer.apply(new Float32Array(6))).toThrow('already has');
    layer.dispose();expect(geometry.getAttribute('simulationOffset')).toBe(reserved);
  });

  it('rolls back material-clone failures without disposing the original geometry',()=>{
    const {geometry,material,mesh}=fixture();const second=new MeshStandardMaterial();mesh.material=[material,second];
    const copied=material.clone(),dispose=vi.spyOn(copied,'dispose');
    vi.spyOn(material,'clone').mockReturnValue(copied);vi.spyOn(second,'clone').mockImplementation(()=>{throw Error('clone failed');});
    const layer=createRenderOffsetLayer(mesh);
    expect(()=>layer.apply(new Float32Array(6))).toThrow('clone failed');
    expect(dispose).toHaveBeenCalledOnce();expect(mesh.geometry).toBe(geometry);expect(mesh.material).toEqual([material,second]);
    expect(geometry.hasAttribute('simulationOffset')).toBe(false);expect(mesh.frustumCulled).toBe(true);
  });
});

it.each([true,false])('preserves shared quantized/interleaved morph bytes and kinematic results with zero offsets (relative=%s)',relative=>{
  // Separate typed views into one backing GLB buffer reproduce the FaceCap case.
  const bytes=new ArrayBuffer(96);
  new Uint16Array(bytes,0,8).set([100,200,300,0,400,500,600,0]);
  new Int16Array(bytes,32,8).set([10,-20,30,0,-40,50,-60,0]);
  new Int16Array(bytes,64,8).set([70,80,-90,0,100,-110,120,0]);
  const position=new InterleavedBufferAttribute(new InterleavedBuffer(new Uint16Array(bytes,0,8),4),3,0,true);
  const morphs=[32,64].map(offset=>new InterleavedBufferAttribute(new InterleavedBuffer(new Int16Array(bytes,offset,8),4),3,0,true));
  const geometry=new BufferGeometry();geometry.setAttribute('position',position);geometry.morphAttributes.position=morphs;geometry.morphTargetsRelative=relative;
  const mesh=new Mesh(geometry,new MeshStandardMaterial()),layer=createRenderOffsetLayer(mesh);
  const attributes=geometry.attributes,morphAttributes=geometry.morphAttributes;
  const beforeHash=digest(bytes),arrays=[position,...morphs].map(a=>a.array),data=[position,...morphs].map(a=>a.data);
  const accessorClones=[position,...morphs].map(a=>vi.spyOn(a,'clone'));
  for(const weights of [[0,0],[0.9,0],[0.2,0.7],[1,1],[0.33,0.51]]) {
    mesh.morphTargetInfluences=weights;
    const kinematic=[0,1].map(vertex=>mesh.getVertexPosition(vertex,new Vector3()).toArray());
    layer.apply(new Float32Array(6));
    expect(mesh.geometry).toBe(geometry);expect(geometry.attributes).toBe(attributes);expect(geometry.morphAttributes).toBe(morphAttributes);
    expect(geometry.getAttribute('position')).toBe(position);expect(geometry.morphAttributes.position).toBe(morphs);
    [position,...morphs].forEach((a,i)=>{expect(a.array).toBe(arrays[i]);expect(a.data).toBe(data[i]);expect(a.array.buffer).toBe(bytes);});
    for(const vertex of [0,1]) expect(mesh.getVertexPosition(vertex,new Vector3()).toArray()).toEqual(kinematic[vertex]);
    expect(digest(bytes)).toBe(beforeHash);
    expect(geometry.morphAttributes.position![1].getZ(1)).toBe(morphs[1].getZ(1)); // last component/accessor retained
    layer.apply();expect(geometry.hasAttribute('simulationOffset')).toBe(false);
    for(const vertex of [0,1]) expect(mesh.getVertexPosition(vertex,new Vector3()).toArray()).toEqual(kinematic[vertex]);
  }
  accessorClones.forEach(spy=>expect(spy).not.toHaveBeenCalled());
  layer.dispose();expect(digest(bytes)).toBe(beforeHash);
});

it('leaves normals, morph normals, indices and loaded bounds intact through zero-offset reset',()=>{
  const {geometry,mesh,layer}=fixture();
  const normal=new Float32BufferAttribute([0,0,1,0,0,1],3);
  const morphNormal=new Float32BufferAttribute([0,0.1,0,0,0.2,0],3);
  geometry.setAttribute('normal',normal);geometry.morphAttributes.normal=[morphNormal];geometry.setIndex([0,1,0]);
  geometry.boundingBox=new Box3(new Vector3(-1,-1,-1),new Vector3(2,2,2));
  geometry.boundingSphere=new Sphere(new Vector3(0.5,0.5,0.5),3);
  const index=geometry.index,box=geometry.boundingBox,sphere=geometry.boundingSphere,morphNormals=geometry.morphAttributes.normal;
  const attributes=geometry.attributes,bytes=[normal.array.slice(),morphNormal.array.slice(),index!.array.slice()];
  mesh.morphTargetInfluences=[0.6];
  const kinematic=[0,1].map(i=>mesh.getVertexPosition(i,new Vector3()).toArray());
  layer.apply(new Float32Array(6));
  expect(mesh.geometry).toBe(geometry);expect(geometry.attributes).toBe(attributes);
  expect(geometry.getAttribute('normal')).toBe(normal);expect(geometry.morphAttributes.normal).toBe(morphNormals);
  expect(geometry.morphAttributes.normal[0]).toBe(morphNormal);
  expect(geometry.index).toBe(index);expect(geometry.boundingBox).toBe(box);expect(geometry.boundingSphere).toBe(sphere);
  for(const i of [0,1]) expect(mesh.getVertexPosition(i,new Vector3()).toArray()).toEqual(kinematic[i]);
  layer.apply();
  expect(normal.array).toEqual(bytes[0]);expect(morphNormal.array).toEqual(bytes[1]);expect(index!.array).toEqual(bytes[2]);
  expect(geometry.getAttribute('simulationOffset')).toBeUndefined();layer.dispose();
});
