import { createPoseTargetMapper, type PoseProxy } from './pose-target-mapper';
import type { SolverFrame } from './xpbd-solver';

/** Structural subset of Three's mesh/attribute API; no Three runtime dependency. */
interface PositionAttribute {
  count: number;
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
}
export interface MorphFaceMesh {
  geometry: {
    getAttribute(name: string): PositionAttribute | undefined;
    morphAttributes: { position?: PositionAttribute[] };
    morphTargetsRelative: boolean;
  };
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
}
function packed(attribute: PositionAttribute) {
  const values = new Float64Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    values[i*3] = attribute.getX(i);
    values[i*3+1] = attribute.getY(i);
    values[i*3+2] = attribute.getZ(i);
  }
  return values;
}

/** Call update() after the kinematic provider has applied weights each render
 * frame, including frames without a transition. Send targets to the existing
 * host with frame => host.sendFrame(frame). Select the morph-bearing face mesh,
 * not rigid eyes/teeth. Geometry is captured once, influences read live. */
export function createMeshPoseTargetDriver(
  mesh: MorphFaceMesh,
  proxy: PoseProxy,
  sendFrame: (frame: SolverFrame) => void,
) {
  const surface = readMorphFaceSurface(mesh);
  const mapper = createPoseTargetMapper({
    ...surface,
  }, proxy);
  return {
    mapper,
    update() {
      const weights = Object.fromEntries(Object.entries(mesh.morphTargetDictionary ?? {}).map(([name, index]) => [name, mesh.morphTargetInfluences?.[index] ?? 0]));
      const frame = mapper.map(weights);
      sendFrame(frame);
      return frame;
    },
  };
}

export function readMorphFaceSurface(mesh: MorphFaceMesh) {
  const position = mesh.geometry.getAttribute('position');
  if (!position) throw new Error('Face mesh has no position attribute');
  const dictionary = { ...mesh.morphTargetDictionary };
  const attributes = mesh.geometry.morphAttributes.position ?? [];
  const morphTargets: Record<string, Float64Array> = {};
  for (const [name, index] of Object.entries(dictionary)) {
    if (!Number.isInteger(index) || index < 0 || !attributes[index]) throw new Error(`Missing face morph attribute ${name}`);
    morphTargets[name] = packed(attributes[index]);
  }
  return { positions: packed(position), morphTargets,
    morphTargetsRelative: mesh.geometry.morphTargetsRelative };
}
