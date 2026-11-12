/** Playwright-only stable mouth views using the application's real renderer. */
import { _roots } from '@react-three/fiber';
import { Box3, Mesh, Vector3 } from 'three';
import { lipRegions } from './facecap-lip-regions';
import { appConfig } from '../src/config/env';

export async function setLipCaptureView(view: 'front' | 'profile') {
  if (appConfig.assets.faceMeshUrl !== 'https://threejs.org/examples/models/gltf/facecap.glb') {
    throw new Error('Lip references require the default real FaceCap mesh');
  }
  const canvas = document.querySelector('canvas');
  const state = canvas && _roots.get(canvas)?.store.getState();
  if (!state) throw new Error('No loaded viewport for lip capture');
  const faces: Mesh[] = [];
  state.scene.traverse(object => { if (object instanceof Mesh && object.geometry.morphAttributes.position?.length) faces.push(object); });
  if (faces.length !== 1) throw new Error(`Expected one FaceCap face, got ${faces.length}`);
  const face = faces[0], position = face.geometry.getAttribute('position'), index = face.geometry.getIndex()!;
  state.scene.updateMatrixWorld(true);
  const bounds = new Box3();
  for (const ordinal of [...lipRegions.upper, ...lipRegions.lower]) for (let corner = 0; corner < 3; corner++) {
    const vertex = index.getX(ordinal * 3 + corner);
    bounds.expandByPoint(new Vector3(position.getX(vertex), position.getY(vertex), position.getZ(vertex)).applyMatrix4(face.matrixWorld));
  }
  const target = bounds.getCenter(new Vector3());
  const camera = state.camera.clone();
  camera.position.copy(target).add(view === 'profile' ? new Vector3(1.35, 0, 0) : new Vector3(0, 0, 1.35));
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  // Freeze after poseReady. Orbit controls otherwise re-aim the camera between
  // capture and assertion. Each view explicitly renders the real scene once.
  state.setFrameloop('never');
  state.gl.render(state.scene, camera);
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const direction = camera.position.clone().sub(target).normalize();
  return { direction: direction.toArray(), canvasWidth: canvas!.width, canvasHeight: canvas!.height };
}
