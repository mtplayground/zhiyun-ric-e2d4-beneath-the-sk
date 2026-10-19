import { DynamicDrawUsage, Float32BufferAttribute, type Mesh, type Material } from 'three';

/** Offset the loaded geometry after morph evaluation. Base/morph accessors and
 * their shared compressed buffers remain owned by the original glTF asset. */
export function createRenderOffsetLayer(mesh: Mesh) {
  const geometry = mesh.geometry, originalMaterial = mesh.material;
  const originalCulling = mesh.frustumCulled;
  let attribute: Float32BufferAttribute | undefined;
  let materials: Material[] = [];
  let disposed = false;
  function clear() {
    if (!attribute) return;
    if (geometry.getAttribute('simulationOffset') === attribute) geometry.deleteAttribute('simulationOffset');
    mesh.material = originalMaterial;
    mesh.frustumCulled = originalCulling;
    materials.forEach(material => material.dispose());
    attribute = undefined;
    materials = [];
  }
  return {
    apply(offsets?: Float32Array) {
      if (disposed) return;
      if (!offsets) { clear(); return; }
      if (mesh.geometry !== geometry) throw new Error('Face geometry changed while applying simulation offsets');
      if (offsets.length !== geometry.getAttribute('position').count * 3 || !offsets.every(Number.isFinite)) throw new Error('Invalid face vertex offsets');
      if (!attribute) {
        if (geometry.hasAttribute('simulationOffset')) throw new Error('Face geometry already has a simulationOffset attribute');
        attribute = new Float32BufferAttribute(new Float32Array(offsets.length), 3).setUsage(DynamicDrawUsage);
        try {
          for (const original of Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial]) {
            const material = original.clone();
            materials.push(material);
            material.onBeforeRender = original.onBeforeRender;
            material.onBeforeCompile = (shader, renderer) => {
              original.onBeforeCompile.call(material, shader, renderer);
              const morphChunk = '#include <morphtarget_vertex>';
              if (!shader.vertexShader.includes(morphChunk)) throw new Error('Face shader has no morph-target insertion point');
              shader.vertexShader = 'attribute vec3 simulationOffset;\n' + shader.vertexShader.replace(
                morphChunk,
                morphChunk + '\ntransformed += simulationOffset;',
              );
            };
            material.customProgramCacheKey = () => `${original.customProgramCacheKey()}:xpbd-offset-v2`;
          }
          geometry.setAttribute('simulationOffset', attribute);
          mesh.material = Array.isArray(originalMaterial) ? materials : materials[0];
          mesh.frustumCulled = false; // Loaded bounds do not include simulation motion.
        } catch (error) { clear(); throw error; }
      }
      attribute.array.set(offsets);
      attribute.needsUpdate = true;
    },
    dispose() { clear(); disposed = true; },
  };
}
