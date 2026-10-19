import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, InterleavedBuffer, InterleavedBufferAttribute, Vector3, Mesh, MeshStandardMaterial } from 'three';
import { createRenderOffsetLayer } from './render-offset-layer';

describe('render offset layer', () => {
  it('adds offsets after morph evaluation and restores pure kinematic resources immediately', () => {
    const geometry=new BufferGeometry();
    geometry.setAttribute('position',new Float32BufferAttribute([0,0,0],3));
    const material=new MeshStandardMaterial();
    const mesh=new Mesh(geometry,material);
    const layer=createRenderOffsetLayer(mesh);
    layer.apply(new Float32Array([0.1,0.2,0.3]));
    expect(mesh.geometry).not.toBe(geometry);
    expect(geometry.getAttribute('simulationOffset')).toBeUndefined();
    const shader={vertexShader:'#include <begin_vertex>\n#include <morphtarget_vertex>',fragmentShader:'',uniforms:{}};
    mesh.material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0],{} as Parameters<typeof material.onBeforeCompile>[1]);
    expect(shader.vertexShader).toContain('#include <morphtarget_vertex>\ntransformed += simulationOffset;');
    layer.apply();
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBe(material);
    expect(mesh.frustumCulled).toBe(true);
    layer.apply(new Float32Array([0,0,0])); // Re-enable without reloading.
    expect(mesh.geometry.getAttribute('simulationOffset').count).toBe(1);
    layer.dispose();
    geometry.dispose(); material.dispose();
  });
  it('rejects non-finite and wrong-sized displacement buffers', () => {
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([0,0,0],3));
    const mesh=new Mesh(geometry,new MeshStandardMaterial());const layer=createRenderOffsetLayer(mesh);
    expect(()=>layer.apply(new Float32Array([NaN,0,0]))).toThrow();
    expect(()=>layer.apply(new Float32Array(0))).toThrow();
    layer.dispose(); geometry.dispose();mesh.material.dispose();
  });
});

it('preserves quantized morph accessors at distinct offsets of a shared GLB buffer', () => {
  const bytes = new ArrayBuffer(32);
  new Uint16Array(bytes, 0, 4).set([100, 200, 300, 0]);
  new Int16Array(bytes, 16, 4).set([10, -20, 30, 0]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new InterleavedBufferAttribute(new InterleavedBuffer(new Uint16Array(bytes, 0, 4), 4), 3, 0));
  geometry.morphAttributes.position = [new InterleavedBufferAttribute(new InterleavedBuffer(new Int16Array(bytes, 16, 4), 4), 3, 0)];
  geometry.morphTargetsRelative = true;
  const mesh = new Mesh(geometry, new MeshStandardMaterial());
  mesh.morphTargetInfluences = [0.9];
  const before = mesh.getVertexPosition(0, new Vector3()).toArray();
  const layer = createRenderOffsetLayer(mesh);
  layer.apply(new Float32Array([0, 0, 0]));
  expect(mesh.getVertexPosition(0, new Vector3()).toArray()).toEqual(before);
  expect(mesh.geometry.morphAttributes.position![0].getY(0)).toBe(-20);
  layer.apply();
  expect(mesh.geometry).toBe(geometry);
  expect(mesh.getVertexPosition(0, new Vector3()).toArray()).toEqual(before);
  layer.dispose(); geometry.dispose(); mesh.material.dispose();
});
