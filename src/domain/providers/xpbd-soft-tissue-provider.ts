import { measureDisplacement, type PhysicsSnapshot } from '../physics/physics-telemetry';
import { createKinematicBlendshapeProvider } from './kinematic-blendshape-provider';
import type { BlendshapeWeights, DeformationProvider, VertexDeltaFrame } from './deformation-provider';
import { createPhysicsHost, type PhysicsHost } from '../physics/physics-host';
import { createPoseTargetMapper } from '../physics/pose-target-mapper';
import { embedSimulationOffsets } from '../physics/render-embedding';

export function createXpbdSoftTissueProvider(): DeformationProvider {
  const kinematic = createKinematicBlendshapeProvider();
  let host: PhysicsHost | undefined;
  let mapper: ReturnType<typeof createPoseTargetMapper> | undefined;
  let proxy: PhysicsSnapshot['proxy'] | undefined;
  let offsets: Float32Array | undefined;
  let generation = 0;
  let currentWeights: BlendshapeWeights = {};
  const dispose = () => {
    generation++;
    host?.dispose(); host = undefined;
    mapper = undefined; proxy = undefined; offsets = undefined;
    kinematic.dispose?.();
  };
  const updateVertexDeltas = (weights: BlendshapeWeights): VertexDeltaFrame | undefined => {
    currentWeights = { ...weights };
    if (mapper && host) host.sendFrame(mapper.map(weights));
    return offsets ? { positions: offsets } : undefined;
  };
  return {
    id: 'xpbd-soft-tissue',
    label: 'XPBD soft-tissue provider',
    initialize(context) {
      dispose();
      kinematic.initialize(context);
      currentWeights = { ...context.initialBlendshapeWeights };
      const token = generation;
      const physics = context.physics;
      if (physics) {
        host = createPhysicsHost({
          sourceMesh: physics.sourceMesh,
          renderVertexCount: physics.surface.positions.length / 3,
          assetUrl: physics.simProxyUrl,
          solver: physics.settings,
          onAssetReady(asset) {
            if (token !== generation) return;
            proxy = asset;
            mapper = createPoseTargetMapper(physics.surface, asset);
          },
          onPositions(positions, result, poseTargets, timing) {
            if (token !== generation || !proxy) return;
            // Recovery should display the exact kinematic pose immediately.
            offsets = result.reset ? undefined : embedSimulationOffsets(proxy, positions, poseTargets);
            if (timing) physics.onSnapshot?.({ proxy, positions, poseTargets,
              telemetry: { ...timing, ...measureDisplacement(positions, poseTargets, proxy.metadata) } });
          },
          onDiagnostic: diagnostic => {
            if (token === generation) physics.onDiagnostic?.(diagnostic);
          },
        });
        void host.ready.then(() => {
          if (token === generation) updateVertexDeltas(currentWeights);
        }).catch(() => { /* host reports validation/loading diagnostics */ });
      }
      return { providerId: 'xpbd-soft-tissue', availableBlendshapes: [...context.availableBlendshapes] };
    },
    evaluateFrame(input) {
      const frame = kinematic.evaluateFrame(input);
      return { ...frame, vertexDeltas: updateVertexDeltas(frame.blendshapeWeights) };
    },
    configurePhysics: settings => host?.configure(settings),
    resetSimulation: () => {
      offsets = undefined;
      if (mapper && host) host.sendFrame(mapper.map(currentWeights));
      host?.reset();
    },
    updateVertexDeltas,
    precompute: poses => kinematic.precompute!(poses),
    dispose,
  };
}
