import { loadSoftTissueAsset } from '../simulation/soft-tissue-asset';
import { startPhysicsLoop } from './physics-loop';
import type { PhysicsDiagnostic, PhysicsRequest, PhysicsResponse, WorkerSolverOptions } from './physics-protocol';
import type { SolverFrame, StepResult } from './xpbd-solver';

const assets = new Map<string, Promise<ArrayBuffer>>();
function assetBytes(url: string) {
  let pending = assets.get(url);
  if (!pending) {
    pending = fetch(url).then(response => {
      if (!response.ok) throw new Error(`Simulation asset HTTP ${response.status}`);
      return response.arrayBuffer();
    }).catch(error => { assets.delete(url); throw error; });
    assets.set(url, pending);
  }
  return pending;
}
export interface PhysicsWorker {
  onmessage: ((event: MessageEvent<PhysicsResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: PhysicsRequest, transfer?: Transferable[]): void;
  terminate(): void;
}
export interface PhysicsHostOptions {
  /** Exact GLB bytes used to load the current render face, not a separate fetch. */
  sourceMesh: ArrayBuffer;
  renderVertexCount: number;
  assetUrl?: string;
  solver?: Omit<WorkerSolverOptions, 'positions' | 'labels' | 'edges'>;
  fallbackSubsteps?: number;
  onPositions(positions: Float64Array, result: StepResult): void;
  onDiagnostic?(diagnostic: PhysicsDiagnostic): void;
  workerFactory?: () => PhysicsWorker;
}
export interface PhysicsHost {
  ready: Promise<void>;
  sendFrame(frame: SolverFrame): void;
  dispose(): void;
}

/** Dispose immediately on disable/unmount, including while ready is pending. */
export function createPhysicsHost(options: PhysicsHostOptions): PhysicsHost {
  let disposed = false;
  let worker: PhysicsWorker | undefined;
  let fallback: ReturnType<typeof startPhysicsLoop> | undefined;
  let solverOptions: WorkerSolverOptions | undefined;
  let latest: SolverFrame | undefined;
  let frameInFlight = false;
  let workerReady = false;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let frameVersion = 0;
  let sentVersion = -1;
  const diagnostic = (code: PhysicsDiagnostic['code'], message: string) => {
    if (!disposed) options.onDiagnostic?.({ code, message });
  };
  function stopWorker() {
    clearTimeout(startupTimer);
    if (!worker) return;
    const previous = worker;
    worker = undefined;
    previous.onmessage = previous.onerror = previous.onmessageerror = null;
    try { previous.postMessage({ type: 'stop' }); } catch { /* terminate also stops timers */ }
    previous.terminate();
  }
  function output(positions: Float64Array, result: StepResult) {
    if (disposed) return;
    if (result.reset) diagnostic('reset', result.reason);
    options.onPositions(positions, result);
  }
  function flush() {
    if (!worker || !workerReady || frameInFlight || !latest || sentVersion === frameVersion) return;
    const poseTargets = Float64Array.from(latest.poseTargets);
    frameInFlight = true;
    sentVersion = frameVersion;
    worker.postMessage({ type: 'frame', frame: { ...latest, poseTargets } }, [poseTargets.buffer]);
  }
  function startFallback(reason: string) {
    if (disposed || fallback || !solverOptions) return;
    stopWorker();
    workerReady = false;
    const requested = solverOptions.substeps ?? 4;
    const substeps = Math.max(1, Math.min(options.fallbackSubsteps ?? 2, Math.max(1, requested - 1)));
    fallback = startPhysicsLoop({ ...solverOptions, substeps }, output, error => diagnostic('solver-error', String(error)));
    if (latest) fallback.setFrame(latest);
    diagnostic('fallback', `${reason}; using main-thread physics with ${substeps} substep(s)`);
  }
  const ready = (async () => {
    try {
      const bytes = await assetBytes(options.assetUrl ?? `${import.meta.env.BASE_URL}data/facecap-soft-tissue.bin`);
      if (disposed) return;
      const asset = await loadSoftTissueAsset(bytes, options.sourceMesh, options.renderVertexCount);
      if (disposed) return;
      solverOptions = { ...options.solver, positions: asset.nodes, labels: asset.labels, edges: asset.edges };
      try {
        worker = options.workerFactory ? options.workerFactory() : new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          if (disposed) return;
          try {
            if (data.type === 'ready') {
              clearTimeout(startupTimer);
              workerReady = true;
              diagnostic('worker', 'Physics running in a dedicated worker');
              flush();
            } else if (data.type === 'frame-accepted') {
              frameInFlight = false;
              flush();
            } else if (data.type === 'positions') {
              output(data.positions, data.result);
              worker?.postMessage({ type: 'ack' });
            } else startFallback(data.message);
          } catch (error) { startFallback(String(error)); }
        };
        worker.onerror = event => { event.preventDefault(); startFallback(event.message || 'Worker failed'); };
        worker.onmessageerror = () => startFallback('Worker message could not be decoded');
        startupTimer = setTimeout(() => startFallback('Worker startup timed out'), 5000);
        worker.postMessage({ type: 'init', options: solverOptions });
      } catch (error) { startFallback(error instanceof Error ? error.message : 'Workers unavailable'); }
    } catch (error) {
      diagnostic('asset-error', error instanceof Error ? error.message : String(error));
      throw error;
    }
  })();
  return {
    ready,
    sendFrame(frame) {
      if (disposed) return;
      latest = { poseTargets: Float64Array.from(frame.poseTargets), jawTransform: frame.jawTransform && [...frame.jawTransform], skullTransform: frame.skullTransform && [...frame.skullTransform] };
      frameVersion++;
      try {
        fallback?.setFrame(latest);
        flush();
      } catch (error) { diagnostic('solver-error', String(error)); }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopWorker();
      fallback?.stop();
      fallback = undefined;
      latest = undefined;
    },
  };
}
