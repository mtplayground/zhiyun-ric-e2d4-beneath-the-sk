import { useCallback, useEffect, useRef } from 'react';
import { createPhysicsHost, type PhysicsHost, type PhysicsHostOptions } from './physics-host';
import type { SolverFrame } from './xpbd-solver';

/** The viewport calls sendFrame each render after producing proxy pose targets.
 * Keep sourceMesh and solver configuration stable for the lifetime of a mesh.
 * No simulation asset is fetched and no worker exists while disabled. */
export function usePhysicsHost(enabled: boolean, options: PhysicsHostOptions) {
  const host = useRef<PhysicsHost | null>(null);
  const callbacks = useRef(options);
  callbacks.current = options;
  const { sourceMesh, renderVertexCount, assetUrl, solver, fallbackSubsteps, workerFactory } = options;
  useEffect(() => {
    if (!enabled) return;
    const instance = createPhysicsHost({
      sourceMesh, renderVertexCount, assetUrl, solver, fallbackSubsteps, workerFactory,
      onAssetReady: asset => callbacks.current.onAssetReady?.(asset),
      onPositions: (...args) => callbacks.current.onPositions(...args),
      onDiagnostic: diagnostic => callbacks.current.onDiagnostic?.(diagnostic),
    });
    host.current = instance;
    // The host already reports loading/validation errors as diagnostics.
    void instance.ready.catch(() => {});
    return () => {
      instance.dispose();
      if (host.current === instance) host.current = null;
    };
  }, [enabled, sourceMesh, renderVertexCount, assetUrl, solver, fallbackSubsteps, workerFactory]);
  return useCallback((frame: SolverFrame) => host.current?.sendFrame(frame), []);
}
