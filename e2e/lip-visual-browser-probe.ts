/** Playwright-only camera control; uses the application's existing renderer. */
import { _roots } from '@react-three/fiber';
import { Vector3 } from 'three';

export async function setLipCaptureView(view: 'front' | 'profile') {
  const canvas = document.querySelector('canvas');
  const state = canvas && _roots.get(canvas)?.store.getState();
  if (!state) throw new Error('No loaded viewport for lip capture');
  const target = new Vector3(0, 0.12, 0);
  state.camera.position.copy(target).add(view === 'profile'
    ? new Vector3(4.4, 0, 0) : new Vector3(0, 0, 4.4));
  state.camera.lookAt(target);
  state.camera.updateMatrixWorld(true);
  state.invalidate();
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const direction = state.camera.position.clone().sub(target).normalize();
  return { direction: direction.toArray(), canvasWidth: canvas!.width, canvasHeight: canvas!.height };
}
