/** Capture an experiment without modifying application state or presets. */
import { appConfig } from '../src/config/env';
import { interpolateBlendshapeWeights } from '../src/domain/providers/kinematic-blendshape-provider';
import { _roots } from '@react-three/fiber';
import { Box3, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { lipRegions } from '../e2e/facecap-lip-regions';

export function captureSearchPose(weights: Record<string, number>, view: 'front' | 'profile') {
  if (appConfig.assets.faceMeshUrl !== 'https://threejs.org/examples/models/gltf/facecap.glb') throw new Error('Appearance capture requires the default FaceCap URL');
  const canvas = document.querySelector('canvas');
  const state = canvas && _roots.get(canvas)?.store.getState();
  if (!state) throw new Error('Viewport not ready');
  const faces: Mesh[] = [];
  state.scene.traverse(o => { if (o instanceof Mesh && o.geometry.morphAttributes.position?.length) faces.push(o); });
  if (faces.length !== 1) throw new Error(`Expected one real face; got ${faces.length}`);
  const face = faces[0];
  const original = [...face.morphTargetInfluences!];
  const dictionary = face.morphTargetDictionary!;
  try {
    const evaluated = interpolateBlendshapeWeights({ fromWeights: {}, targetWeights: weights, progress: 1, availableBlendshapes: new Set(Object.keys(dictionary)) });
    for (const [name, index] of Object.entries(dictionary)) face.morphTargetInfluences![index] = evaluated[name] ?? 0;
    state.scene.updateMatrixWorld(true);
    const bounds = new Box3();
    const index = face.geometry.getIndex()!;
    for (const ordinal of [...lipRegions.upper, ...lipRegions.lower]) for (let c = 0; c < 3; c++) {
      bounds.expandByPoint(face.getVertexPosition(index.getX(ordinal * 3 + c), new Vector3()).applyMatrix4(face.matrixWorld));
    }
    // Fixed frame based on neutral lip center; avoid changing scale per candidate.
    const saved = [...face.morphTargetInfluences!];
    face.morphTargetInfluences!.fill(0);
    const neutralBounds = new Box3();
    for (const ordinal of [...lipRegions.upper, ...lipRegions.lower]) for (let c = 0; c < 3; c++) {
      neutralBounds.expandByPoint(face.getVertexPosition(index.getX(ordinal * 3 + c), new Vector3()).applyMatrix4(face.matrixWorld));
    }
    face.morphTargetInfluences!.splice(0, saved.length, ...saved);
    const target = neutralBounds.getCenter(new Vector3());
    const camera = state.camera.clone() as PerspectiveCamera;
    camera.position.copy(target).add(view === 'front' ? new Vector3(0, 0, 1.35) : new Vector3(1.35, 0, 0));
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    state.gl.render(state.scene, camera);
    return { png: canvas!.toDataURL('image/png'), weights: Object.fromEntries(Object.entries(dictionary).filter(([, i]) => face.morphTargetInfluences![i] > 0).map(([name, i]) => [name, face.morphTargetInfluences![i]])), bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
  } finally {
    face.morphTargetInfluences!.splice(0, original.length, ...original);
    state.invalidate();
  }
}
