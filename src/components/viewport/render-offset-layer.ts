import { BufferAttribute, InterleavedBufferAttribute, Float32BufferAttribute, type Mesh, type Material } from 'three';

// Clone each accessor independently. Three's shared-buffer clone cache loses
// byte offsets when GLB accessors view different ranges of the same ArrayBuffer.
function cloneAccessor(attribute: BufferAttribute | InterleavedBufferAttribute): BufferAttribute {
  if (!(attribute instanceof InterleavedBufferAttribute)) return attribute.clone();
  const values = attribute.array.slice(0, attribute.count * attribute.itemSize);
  for (let vertex = 0; vertex < attribute.count; vertex++) {
    for (let component = 0; component < attribute.itemSize; component++) {
      values[vertex * attribute.itemSize + component] = attribute.array[vertex * attribute.data.stride + attribute.offset + component];
    }
  }
  return new BufferAttribute(values, attribute.itemSize, attribute.normalized);
}

/** Shader offset is added after morph evaluation, so absolute and relative morph
 * targets both preserve the original kinematic pose without base-weight scaling. */
export function createRenderOffsetLayer(mesh: Mesh) {
  const originalGeometry = mesh.geometry, originalMaterial = mesh.material;
  const originalCulling = mesh.frustumCulled;
  let attribute: Float32BufferAttribute | undefined;
  let materials: Material[] = [];
  function clear() {
    if (!attribute) return;
    mesh.geometry.dispose();
    materials.forEach(material => material.dispose());
    mesh.geometry = originalGeometry;
    mesh.material = originalMaterial;
    mesh.frustumCulled = originalCulling;
    attribute = undefined; materials = [];
  }
  return {
    apply(offsets?: Float32Array) {
      if (!offsets) { clear(); return; }
      if (offsets.length !== originalGeometry.getAttribute('position').count * 3 || !offsets.every(Number.isFinite)) throw new Error('Invalid face vertex offsets');
      if (!attribute) {
        mesh.geometry = originalGeometry.clone();
        mesh.geometry.attributes = Object.fromEntries(Object.entries(originalGeometry.attributes).map(([name, value]) => [name, cloneAccessor(value)]));
        mesh.geometry.morphAttributes = Object.fromEntries(Object.entries(originalGeometry.morphAttributes).map(([name, values]) => [name, values.map(cloneAccessor)]));
        attribute = new Float32BufferAttribute(new Float32Array(offsets.length), 3);
        mesh.geometry.setAttribute('simulationOffset', attribute);
        materials = (Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial]).map(original => {
          const material = original.clone();
          material.onBeforeCompile = (shader, renderer) => {
            original.onBeforeCompile.call(material, shader, renderer);
            shader.vertexShader = 'attribute vec3 simulationOffset;\n' + shader.vertexShader.replace(
              '#include <morphtarget_vertex>',
              '#include <morphtarget_vertex>\ntransformed += simulationOffset;',
            );
          };
          material.customProgramCacheKey = () => `${original.customProgramCacheKey()}:xpbd-offset-v1`;
          return material;
        });
        mesh.material = Array.isArray(originalMaterial) ? materials : materials[0];
        mesh.frustumCulled = false; // Original bounds do not include dynamic offsets.
      }
      attribute.array.set(offsets);
      attribute.needsUpdate = true;
    },
    dispose: clear,
  };
}
