import { usePhysicsState } from '@/state/physics-state';
import { usePhysicsTelemetry } from '@/state/physics-telemetry-state';

export const OFFSET_HEATMAP_MAX_MM = 6;
import { DynamicDrawUsage, Float32BufferAttribute, type Mesh, type Material } from 'three';

/** Offset the loaded geometry after morph evaluation. Base/morph accessors and
 * their shared compressed buffers remain owned by the original glTF asset. */
export function createRenderOffsetLayer(mesh: Mesh) {
  const geometry = mesh.geometry, originalMaterial = mesh.material;
  const originalCulling = mesh.frustumCulled;
  let attribute: Float32BufferAttribute | undefined;
  let materials: Material[] = [];
  let disposed = false;
  let debugKey = '';
  const magnificationUniform = { value: 1 };
  const millimetresUniform = { value: 0 };
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
      const state = usePhysicsState.getState();
      const factor = state.enabled ? state.offsetMagnification : 1;
      const heatmap = state.enabled && state.offsetHeatmap;
      const nextDebugKey = `${factor !== 1}:${heatmap}`;
      if (attribute && nextDebugKey !== debugKey) clear();
      debugKey = nextDebugKey;
      magnificationUniform.value = factor;
      // Raw render offsets are in source units. Use the calibrated SI metadata,
      // never the display factor or the glTF scene's implausible physical scale.
      if (heatmap) millimetresUniform.value = (usePhysicsTelemetry.getState().snapshot?.proxy.metadata.units.metresPerSourceUnit ?? 0) * 1000;
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
              if (factor !== 1) shader.uniforms.offsetMagnification = magnificationUniform;
              if (heatmap) {
                shader.uniforms.offsetMillimetres = millimetresUniform;
                shader.vertexShader = 'uniform float offsetMillimetres;\nvarying float offsetDistanceMm;\n' + shader.vertexShader;
                shader.fragmentShader = 'varying float offsetDistanceMm;\n' + shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
                  float offsetHeat = clamp(offsetDistanceMm / ${OFFSET_HEATMAP_MAX_MM.toFixed(1)}, 0.0, 1.0);
                  outgoingLight = mix(vec3(0.0, 0.2, 1.0), vec3(1.0, 0.1, 0.0), offsetHeat);
                  #include <opaque_fragment>`);
              }
              if (factor !== 1) shader.vertexShader = 'uniform float offsetMagnification;\n' + shader.vertexShader;
              shader.vertexShader = 'attribute vec3 simulationOffset;\n' + shader.vertexShader.replace(
                morphChunk,
                morphChunk + (heatmap ? '\noffsetDistanceMm = length(simulationOffset) * offsetMillimetres;' : '') + (factor !== 1 ? '\ntransformed += simulationOffset * offsetMagnification;' : '\ntransformed += simulationOffset;'),
              );
            };
            material.customProgramCacheKey = () => `${original.customProgramCacheKey()}:xpbd-offset-v2${factor !== 1 || heatmap ? `:debug:${debugKey}` : ''}`;
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
