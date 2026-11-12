/** Loaded only by Playwright through Vite, never by the application. */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Box3, Mesh, Triangle, Vector3 } from 'three';
import { lipRegions } from './facecap-lip-regions';
import { inspectLipSurfaces } from './lip-surface-geometry';
import { readMorphFaceSurface } from '../src/domain/physics/mesh-pose-target-driver';
import { computePosedSurfacePositions } from '../src/domain/physics/pose-target-mapper';
import { allPoseMappings, actionUnitPoseMappings, getPoseWeights } from '../src/domain/poses/pose-library';

const source = 'https://threejs.org/examples/models/gltf/facecap.glb';
const sourceHash = '6bfce6d0fcbb5839f5102b79733007859fef7c5df6d9eb49e2264542810b5f64';
// Open-mouth intent is explicit: neutral/brow/lid/cheek-only poses and
// labiodental V need no positive clearance. Sliders with AU 25 do.
const openPresets = new Set([
  'au-22-lip-funneler', 'au-25-lips-part', 'expression-smile',
  'expression-frown', 'expression-mouth', 'expression-pucker',
  'phoneme-n', 'phoneme-aa', 'phoneme-iy', 'phoneme-t',
  'phoneme-eh', 'phoneme-uw', 'phoneme-y',
]);
const minimumOpenGapMetres = 0.0001; // 0.1 mm; strictly positive, no crossing tolerance.
export async function loadLipMeasurementMesh() {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`FaceCap fetch failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(v => v.toString(16).padStart(2, '0')).join('');
  if (hash !== sourceHash) throw new Error(`FaceCap bytes changed: ${hash}; reselect lip triangle regions explicitly`);
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
  const index = face.geometry.getIndex();
  if (!index) throw new Error('Expected indexed FaceCap triangles');
  const triangles = (positions: ArrayLike<number>, ordinals: readonly number[], preset: string) => ordinals.map(ordinal => {
    const vertices = [0, 1, 2].map(corner => {
      const vertex = index.getX(ordinal * 3 + corner);
      return new Vector3(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2])
        .applyMatrix4(face.matrixWorld);
    });
    const triangle = new Triangle(vertices[0], vertices[1], vertices[2]);
    if (triangle.getArea() <= 1e-16) throw new Error(`${preset}: degenerate lip triangle ${ordinal}`);
    return { ordinal, triangle, bounds: new Box3().setFromPoints(vertices) };
  });
  return { source, sourceHash, surface, triangles, face };
}

export async function measureLipGaps() {
  const { source, sourceHash, surface, triangles } = await loadLipMeasurementMesh();
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
    source, sourceHash, minimumOpenGapMetres, regions: lipRegions,
    results: cases.map(pose => {
      const posed = computePosedSurfacePositions(surface, pose.weights);
      const needsClearance = openPresets.has(pose.id) ||
        (pose.id.startsWith('slider-') && (pose.weights.jawOpen ?? 0) >= 0.58);
      return {
        id: pose.id, label: pose.label,
        requiredGapMetres: needsClearance ? minimumOpenGapMetres : 0,
        ...inspectLipSurfaces(triangles(posed, lipRegions.upper, pose.label), triangles(posed, lipRegions.lower, pose.label)),
      };
    }),
  };
}
