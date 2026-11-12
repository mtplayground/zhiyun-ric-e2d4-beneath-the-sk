/** Loaded only by Playwright through Vite, never by the application. */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Mesh, Vector3 } from 'three';
import { readMorphFaceSurface } from '../src/domain/physics/mesh-pose-target-driver';
import { computePosedSurfacePositions } from '../src/domain/physics/pose-target-mapper';
import { allPoseMappings, actionUnitPoseMappings, getPoseWeights } from '../src/domain/poses/pose-library';

const source = 'https://threejs.org/examples/models/gltf/facecap.glb';
const sourceHash = '6bfce6d0fcbb5839f5102b79733007859fef7c5df6d9eb49e2264542810b5f64';
// Neutral inner vermilion edges, paired by lateral position. Accessor IDs are
// bound to the exact source hash, not selected again after deformation.
const pairs = [
  { label: 'left outer-middle', upper: 1448, lower: 1414 },
  { label: 'left middle', upper: 1449, lower: 1413 },
  { label: 'left near-center', upper: 1451, lower: 1094 },
  { label: 'center', upper: 1453, lower: 1095 },
  { label: 'right near-center', upper: 1462, lower: 1096 },
  { label: 'right middle', upper: 1464, lower: 1098 },
  { label: 'right outer-middle', upper: 1466, lower: 1100 },
];
export async function measureLipGaps() {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`FaceCap fetch failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(v => v.toString(16).padStart(2, '0')).join('');
  if (hash !== sourceHash) throw new Error(`FaceCap bytes changed: ${hash}; reselect lip landmarks explicitly`);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // Geometry needs no textures: avoid requiring a GPU/transcoder for this CPU check.
  const view = new DataView(bytes), jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)));
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const binStart = 20 + jsonLength;
  const binary = new Uint8Array(bytes, binStart + 8, view.getUint32(binStart, true));
  const blobUrl = URL.createObjectURL(new Blob([binary]));
  json.buffers[0].uri = blobUrl;
  const gltf = await loader.parseAsync(JSON.stringify(json), new URL('.', source).href)
    .finally(() => URL.revokeObjectURL(blobUrl));
  const faces: Mesh[] = [];
  gltf.scene.traverse(object => { if (object instanceof Mesh && object.geometry.morphAttributes.position?.length) faces.push(object); });
  if (faces.length !== 1) throw new Error(`Expected one FaceCap face, found ${faces.length}`);
  gltf.scene.updateMatrixWorld(true);
  const face = faces[0], surface = readMorphFaceSurface(face);
  // glTF world Y is vertical; original world units are metres. Do not use the
  // viewport's display normalization or assume local Y is face-up.
  const vertical = new Vector3(0, 1, 0).transformDirection(face.matrixWorld.clone().invert());
  const metresPerUnit = new Vector3().setFromMatrixScale(face.matrixWorld).x;
  const gap = (positions: ArrayLike<number>, upper: number, lower: number) =>
    new Vector3().fromArray(Array.from(positions).slice(upper * 3, upper * 3 + 3))
      .sub(new Vector3().fromArray(Array.from(positions).slice(lower * 3, lower * 3 + 3)))
      .dot(vertical) * metresPerUnit;
  const neutralGaps = pairs.map(pair => gap(surface.positions, pair.upper, pair.lower));
  if (neutralGaps.some(value => !Number.isFinite(value) || value < 0 || value > 0.003)) {
    throw new Error(`Invalid neutral lip landmarks: ${JSON.stringify(neutralGaps)}`);
  }
  const cases = allPoseMappings.map(pose => ({ id: pose.id, label: pose.label, weights: getPoseWeights(pose, 'kinematic-blendshape') }));
  const controls = actionUnitPoseMappings.filter(pose =>
    Object.keys(getPoseWeights(pose, 'kinematic-blendshape')).some(name => /^(jaw|mouth)/.test(name)));
  // Every 0/1 endpoint of mouth/jaw AU sliders, using the UI's additive,
  // clamped basis-weight composition, including neutral and all-on.
  for (let mask = 0; mask < 2 ** controls.length; mask++) {
    const weights: Record<string, number> = {};
    const labels: string[] = [];
    controls.forEach((pose, bit) => {
      if (!(mask & (1 << bit))) return;
      labels.push(pose.code);
      for (const [name, value] of Object.entries(getPoseWeights(pose, 'kinematic-blendshape'))) {
        weights[name] = Math.min(1, (weights[name] ?? 0) + value);
      }
    });
    cases.push({ id: `slider-${mask}`, label: `Sliders ${labels.join(' + ') || 'neutral'}`, weights });
  }
  return {
    source, sourceHash, toleranceMetres: 0.0001, pairs, neutralGaps,
    results: cases.map(pose => {
      const posed = computePosedSurfacePositions(surface, pose.weights);
      return { id: pose.id, label: pose.label, gaps: pairs.map(pair => ({ position: pair.label, metres: gap(posed, pair.upper, pair.lower) })) };
    }),
  };
}
