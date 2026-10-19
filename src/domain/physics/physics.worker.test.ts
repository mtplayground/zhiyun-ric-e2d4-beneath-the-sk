import { afterEach, expect, it, vi } from 'vitest';
import type { PhysicsRequest, PhysicsResponse } from './physics-protocol';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('transfers worker positions, bounds outstanding output and closes its timer', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const messages: PhysicsResponse[] = [];
  const scope = {
    onmessage: null as ((event: MessageEvent<PhysicsRequest>) => void) | null,
    close: vi.fn(),
    postMessage: vi.fn((message: PhysicsResponse, transfer: Transferable[] = []) => {
      messages.push(structuredClone(message, { transfer }));
    }),
  };
  vi.stubGlobal('self', scope);
  vi.resetModules();
  await import('./physics.worker');
  const send = (data: PhysicsRequest) => scope.onmessage!({ data } as MessageEvent<PhysicsRequest>);
  send({ type: 'init', options: { positions: [0, 0, 0], labels: [0], timestep: 0.01, substeps: 1, iterations: 1, gravity: [0, 0, 0], poseCompliance: 0 } });
  expect(messages[0]).toEqual({ type: 'ready' });
  send({ type: 'frame', frame: { poseTargets: new Float64Array([1, 2, 3]) } });
  vi.advanceTimersByTime(10);
  const output = messages.find(m => m.type === 'positions');
  expect(output?.type === 'positions' && Array.from(output.positions)).toEqual([1, 2, 3]);
  const transferred = scope.postMessage.mock.calls.find(([m]) => m.type === 'positions')!;
  expect(transferred[1]).toHaveLength(2);
  expect((transferred[1]![0] as ArrayBuffer).byteLength).toBe(0);
  vi.advanceTimersByTime(50);
  expect(messages.filter(m => m.type === 'positions')).toHaveLength(1);
  send({ type: 'ack' });
  vi.advanceTimersByTime(10);
  expect(messages.filter(m => m.type === 'positions')).toHaveLength(2);
  send({ type: 'ack' });
  send({ type: 'configure', settings: { poseCompliance: 0.01, damping: 3, gravity: [0,0,-5], distanceCompliance: 0.02 } });
  send({ type: 'frame', frame: { poseTargets: new Float64Array([4,5,6]) } });
  send({ type: 'reset' });
  const reset = messages.at(-1)!;
  expect(reset.type).toBe('positions');
  if (reset.type === 'positions') {
    expect(Array.from(reset.positions)).toEqual([4,5,6]);
    expect(reset.result.reset).toBe(true);
  }
  send({ type: 'stop' });
  expect(scope.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
