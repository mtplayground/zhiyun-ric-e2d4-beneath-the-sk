import { interpolateBlendshapeWeights } from '../providers/kinematic-blendshape-provider';
import { createMorphTargetNameResolver } from '../poses/morph-target-aliases';
import type { DeformationFrameInput } from '../providers/deformation-provider';
import { IDENTITY_TRANSFORM, type SolverFrame, type Vec3 } from './xpbd-solver';

export interface PoseSurface {
  /** Packed neutral accessor positions, before node/scene transforms. */
  positions: ArrayLike<number>;
  morphTargets: Readonly<Record<string, ArrayLike<number>>>;
  morphTargetsRelative: boolean;
}
export interface PoseProxy {
  nodes: ArrayLike<number>;
  labels: ArrayLike<number>;
  tetrahedra: ArrayLike<number>;
  /** Records: tetrahedron index followed by four barycentric weights. */
  embedding: ArrayLike<number>;
  metadata: { normalization: { center: number[]; scale: number }; counts: { renderVertices: number } };
}
export interface JawSettings {
  /** Pivot and axis in normalized, face-local proxy space. FaceCap is Z-up. */
  pivot?: Vec3;
  axis?: Vec3;
  maxAngle?: number;
}
const clamp = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const finite = (values: ArrayLike<number>) => Array.from(values).every(Number.isFinite);

export function jawRotation(weight: number, settings: JawSettings = {}): number[] {
  const pivot = settings.pivot ?? [0, 0.05, 0.02];
  const axis = settings.axis ?? [1, 0, 0];
  const angle = settings.maxAngle ?? Math.PI / 7.2; // 25 degrees at jawOpen=1
  const length = Math.hypot(...axis);
  if (!finite(pivot) || !finite(axis) || !Number.isFinite(angle) || !Number.isFinite(length) || length < 1e-12) throw new Error('Invalid jaw settings');
  const [x, y, z] = axis.map(v => v / length);
  const a = clamp(weight) * angle, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  const m = [
    t*x*x+c, t*x*y+s*z, t*x*z-s*y, 0,
    t*x*y-s*z, t*y*y+c, t*y*z+s*x, 0,
    t*x*z+s*y, t*y*z-s*x, t*z*z+c, 0,
    0, 0, 0, 1,
  ];
  for (let i = 0; i < 3; i++) m[12+i] = pivot[i] - (m[i]*pivot[0]+m[4+i]*pivot[1]+m[8+i]*pivot[2]);
  return m;
}

/** Transpose-embedding displacement transfer. Neutral targets equal proxy rest
 * nodes even when nearest-tetrahedron embedding projects the render surface. */
export function createPoseTargetMapper(surface: PoseSurface, proxy: PoseProxy, jaw: JawSettings = {}) {
  const rest = Float64Array.from(surface.positions);
  const nodes = Float64Array.from(proxy.nodes);
  const labels = Array.from(proxy.labels);
  const tetrahedra = Array.from(proxy.tetrahedra);
  const embedding = Array.from(proxy.embedding);
  const { center, scale } = proxy.metadata.normalization;
  const count = rest.length / 3;
  if (!Number.isInteger(count) || count === 0 || count !== proxy.metadata.counts.renderVertices || nodes.length % 3 || labels.length * 3 !== nodes.length || embedding.length !== count * 5 || tetrahedra.length % 4) throw new Error('Pose mapper dimensions do not match simulation asset');
  if (!finite(rest) || !finite(nodes) || center.length !== 3 || !finite(center) || !Number.isFinite(scale) || scale <= 0 || labels.some(l => ![0,1,2].includes(l))) throw new Error('Invalid pose mapper geometry');
  const morphs = Object.fromEntries(Object.entries(surface.morphTargets).map(([name, values]) => {
    if (values.length !== rest.length || !finite(values)) throw new Error(`Invalid morph target ${name}`);
    return [name, Float64Array.from(values)];
  }));
  const available = new Set(Object.keys(morphs));
  const resolve = createMorphTargetNameResolver(available);
  const jawName = resolve('jawOpen');
  const relative = surface.morphTargetsRelative;
  const contributors: { render: number; node: number; weight: number }[] = [];
  const totals = new Float64Array(labels.length);
  for (const node of tetrahedra) if (!Number.isInteger(node) || node < 0 || node >= labels.length) throw new Error('Invalid embedding node index');
  for (let vertex = 0; vertex < count; vertex++) {
    const record = vertex * 5, tet = embedding[record];
    const weights = embedding.slice(record+1, record+5);
    if (!Number.isInteger(tet) || tet < 0 || tet * 4 + 3 >= tetrahedra.length || !finite(weights) || weights.some(w => w < -1e-6 || w > 1+1e-6) || Math.abs(weights.reduce((a,b)=>a+b,0)-1)>1e-5) throw new Error('Invalid render embedding');
    for (let corner = 0; corner < 4; corner++) {
      const node = tetrahedra[tet*4+corner], weight = Math.max(0, weights[corner]);
      if (labels[node] !== 0 || weight === 0) continue;
      contributors.push({ render: vertex, node, weight });
      totals[node] += weight;
    }
  }
  // Some coarse skin nodes receive no embedding coefficient (notably crease
  // splits). Transfer their nearest neutral render vertex displacement instead.
  const nearest = new Map<number, number>();
  labels.forEach((label, node) => {
    if (label !== 0 || totals[node] > 1e-12) return;
    let best = Infinity, index = 0;
    for (let vertex = 0; vertex < count; vertex++) {
      let distance = 0;
      for (let axis = 0; axis < 3; axis++) distance += ((rest[vertex*3+axis]-center[axis])/scale-nodes[node*3+axis])**2;
      if (distance < best) { best = distance; index = vertex; }
    }
    nearest.set(node, index);
  });
  jawRotation(0, jaw); // Validate settings eagerly and copy caller-owned settings.
  const copyVector = (v: Vec3): Vec3 => [v[0], v[1], v[2]];
  const settings: JawSettings = { pivot: copyVector(jaw.pivot ?? [0,0.05,0.02]), axis: copyVector(jaw.axis ?? [1,0,0]), maxAngle: jaw.maxAngle };
  const map = (weights: Record<string, number>): SolverFrame & { surfacePositions: Float64Array } => {
    // Reuse provider alias resolution, clamping, duplicate-alias max and epsilon.
    // Already evaluated transition weights must not be smoothed a second time.
    const evaluated = interpolateBlendshapeWeights({ fromWeights: {}, targetWeights: weights, progress: 1, availableBlendshapes: available });
    const posed = rest.slice();
    for (const [name, weight] of Object.entries(evaluated)) {
      const morph = morphs[name];
      for (let i = 0; i < posed.length; i++) posed[i] += weight * (relative ? morph[i] : morph[i]-rest[i]);
    }
    const delta = Float64Array.from(posed, (v,i)=>(v-rest[i])/scale);
    if (!finite(posed) || !finite(delta)) throw new Error('Non-finite posed surface');
    const targets = nodes.slice();
    const displacement = new Float64Array(nodes.length);
    for (const { render, node, weight } of contributors) {
      for (let axis = 0; axis < 3; axis++) displacement[node*3+axis] += weight * delta[render*3+axis];
    }
    labels.forEach((label, node) => {
      if (label !== 0) return;
      for (let axis = 0; axis < 3; axis++) targets[node*3+axis] += totals[node] > 1e-12 ? displacement[node*3+axis]/totals[node] : delta[nearest.get(node)!*3+axis];
    });
    const jawTransform = jawRotation(jawName ? evaluated[jawName] ?? 0 : 0, settings);
    labels.forEach((label, node) => {
      if (label !== 2) return;
      for (let axis = 0; axis < 3; axis++) targets[node*3+axis] = jawTransform[axis]*nodes[node*3]+jawTransform[4+axis]*nodes[node*3+1]+jawTransform[8+axis]*nodes[node*3+2]+jawTransform[12+axis];
    });
    if (!finite(targets)) throw new Error('Non-finite proxy targets');
    return { poseTargets: targets, surfacePositions: posed, skullTransform: IDENTITY_TRANSFORM, jawTransform };
  };
  return {
    /** Use the current provider output for preset, keyboard, slider and cached frames. */
    map,
    /** Alternative entry point for an unevaluated provider transition. */
    evaluateFrame(input: DeformationFrameInput) {
      return map(interpolateBlendshapeWeights({ fromWeights: input.previousBlendshapeWeights, targetWeights: input.targetPose.blendshapeWeights, progress: input.progress, availableBlendshapes: available }));
    },
  };
}
