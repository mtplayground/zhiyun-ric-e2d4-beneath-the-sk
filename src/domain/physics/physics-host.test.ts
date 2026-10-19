import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPhysicsHost, type PhysicsWorker } from './physics-host';
import { startPhysicsLoop } from './physics-loop';
import { loadSoftTissueAsset } from '../simulation/soft-tissue-asset';
import type { PhysicsRequest, PhysicsResponse } from './physics-protocol';

vi.mock('../simulation/soft-tissue-asset', () => ({ loadSoftTissueAsset: vi.fn() }));
class FakeWorker implements PhysicsWorker {
  onmessage: PhysicsWorker['onmessage'] = null;
  onerror: PhysicsWorker['onerror'] = null;
  onmessageerror: PhysicsWorker['onmessageerror'] = null;
  postMessage = vi.fn<(message: PhysicsRequest, transfer?: Transferable[]) => void>();
  terminate = vi.fn();
  emit(data: PhysicsResponse) { this.onmessage?.({ data } as MessageEvent<PhysicsResponse>); }
}
const asset = {
  metadata: { version: 1, sourceHash: '', counts: { nodes: 1, tetrahedra: 0, edges: 0, renderVertices: 1 }, sections: [], normalization: { center: [0, 0, 0], scale: 1 } },
  tetrahedra: new Uint32Array(), embedding: new Float32Array([0, 1, 0, 0, 0]), nodes: new Float32Array([0, 0, 0]), labels: new Uint8Array([0]), edges: new Uint32Array(),
};
let sequence = 0;
const hosts: ReturnType<typeof createPhysicsHost>[] = [];
function setup(factory: () => PhysicsWorker = () => { throw Error('Workers unavailable'); }) {
  const onPositions = vi.fn(), onDiagnostic = vi.fn();
  const sourceMesh = new ArrayBuffer(4);
  const options = { assetUrl: `/proxy-${sequence++}.bin`, sourceMesh, renderVertexCount: 1,
    onPositions, onDiagnostic, workerFactory: factory,
    solver: { timestep: 0.01, substeps: 4, gravity: [0, 0, 0] as const, poseCompliance: 0 },
  };
  const host = createPhysicsHost(options);
  hosts.push(host);
  return { host, options, onPositions, onDiagnostic };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.mocked(loadSoftTissueAsset).mockResolvedValue(asset);
});
afterEach(() => {
  hosts.splice(0).forEach(h => h.dispose());
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

describe('physics host', () => {
  it('validates against the loaded face bytes and vertex count before initializing the worker', async () => {
    const worker = new FakeWorker();
    const { host, options, onPositions } = setup(() => worker);
    await host.ready;
    expect(loadSoftTissueAsset).toHaveBeenCalledWith(expect.any(ArrayBuffer), options.sourceMesh, 1);
    expect(worker.postMessage.mock.calls[0][0].type).toBe('init');
    host.sendFrame({ poseTargets: [1, 2, 3] });
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    worker.emit({ type: 'ready' });
    const [message, transfer] = worker.postMessage.mock.calls[1];
    expect(message.type).toBe('frame');
    if (message.type !== 'frame') throw Error('Expected frame');
    expect(transfer).toEqual([(message.frame.poseTargets as Float64Array).buffer]);
    worker.emit({ type: 'positions', positions: new Float64Array([1, 2, 3]), result: { reset: false } });
    expect(onPositions).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'ack' });
  });

  it('coalesces frame messages while preserving caller array ownership', async () => {
    const worker = new FakeWorker();
    const { host } = setup(() => worker);
    await host.ready; worker.emit({ type: 'ready' });
    const targets = new Float64Array([1, 0, 0]);
    host.sendFrame({ poseTargets: targets });
    host.sendFrame({ poseTargets: [2, 0, 0] });
    host.sendFrame({ poseTargets: [3, 0, 0] });
    expect(worker.postMessage.mock.calls.filter(([m]) => m.type === 'frame')).toHaveLength(1);
    expect(targets.byteLength).toBe(24);
    worker.emit({ type: 'frame-accepted' });
    const message = worker.postMessage.mock.calls.at(-1)![0];
    expect(message.type === 'frame' && Array.from(message.frame.poseTargets)).toEqual([3, 0, 0]);
  });

  it('falls back with reduced substeps and stops all timers on disposal', async () => {
    const { host, onPositions, onDiagnostic } = setup();
    host.sendFrame({ poseTargets: [1, 2, 3] });
    await host.ready;
    expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ code: 'fallback', message: expect.stringContaining('2 substep') }));
    vi.advanceTimersByTime(20);
    expect(Array.from(onPositions.mock.calls.at(-1)![0])).toEqual([1, 2, 3]);
    host.dispose();
    const count = onPositions.mock.calls.length;
    vi.advanceTimersByTime(100);
    expect(onPositions).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back on asynchronous worker failure and startup timeout', async () => {
    const worker = new FakeWorker();
    const first = setup(() => worker); await first.host.ready;
    worker.onerror?.({ message: 'blocked', preventDefault() {} } as ErrorEvent);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(first.onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ code: 'fallback' }));
    const stalled = new FakeWorker();
    const second = setup(() => stalled); await second.host.ready;
    vi.advanceTimersByTime(5000);
    expect(stalled.terminate).toHaveBeenCalledOnce();
    expect(second.onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ code: 'fallback', message: expect.stringContaining('timed out') }));
  });

  it('reports mismatched assets and never starts a solver', async () => {
    vi.mocked(loadSoftTissueAsset).mockRejectedValueOnce(Error('Simulation asset does not match the render face mesh'));
    const factory = vi.fn(() => new FakeWorker());
    const { host, onDiagnostic } = setup(factory);
    await expect(host.ready).rejects.toThrow('does not match');
    expect(factory).not.toHaveBeenCalled();
    expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ code: 'asset-error' }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('loads a shared asset URL once but validates each loaded face separately', async () => {
    const first = setup(); await first.host.ready;
    const second = createPhysicsHost(first.options); hosts.push(second); await second.ready;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(loadSoftTissueAsset).toHaveBeenCalledTimes(2);
  });

  it('cancels initialization on unmount and terminates an active worker on disable', async () => {
    const factory = vi.fn(() => new FakeWorker());
    const first = setup(factory); first.host.dispose(); await first.host.ready;
    expect(factory).not.toHaveBeenCalled();
    const worker = new FakeWorker();
    const second = setup(() => worker); await second.host.ready;
    second.host.dispose(); second.host.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('uses a fixed timestep and releases a standalone loop', () => {
  const output = vi.fn();
  const loop = startPhysicsLoop({ positions: [0, 0, 0], labels: [0], timestep: 0.01, substeps: 1, iterations: 1, gravity: [0, -10, 0], damping: 0, poseCompliance: 1e20 }, output, cause => { throw cause; });
  vi.advanceTimersByTime(20);
  expect(output.mock.calls.at(-1)![0][1]).toBeCloseTo(-0.003);
  loop.stop(); expect(vi.getTimerCount()).toBe(0);
});
