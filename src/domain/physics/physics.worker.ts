import { startPhysicsLoop } from './physics-loop';
import type { PhysicsRequest, PhysicsResponse } from './physics-protocol';

// Local structural type avoids mixing DOM and WebWorker global TS libraries.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PhysicsRequest>) => void) | null;
  postMessage(message: PhysicsResponse, transfer?: Transferable[]): void;
  close(): void;
};
let loop: ReturnType<typeof startPhysicsLoop> | undefined;
let awaitingAck = false;
let pendingReset: Extract<PhysicsResponse, { type: 'positions' }>['result'] = { reset: false };
function fail(error: unknown) {
  loop?.stop();
  scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
}
scope.onmessage = ({ data }) => {
  try {
    switch (data.type) {
      case 'init':
        loop?.stop();
        awaitingAck = false;
        pendingReset = { reset: false };
        loop = startPhysicsLoop(data.options, (positions, result, poseTargets) => {
          if (result.reset) pendingReset = result;
          if (awaitingAck) return;
          awaitingAck = true;
          scope.postMessage({ type: 'positions', positions, poseTargets, result: pendingReset }, [positions.buffer as ArrayBuffer, poseTargets.buffer as ArrayBuffer]);
          pendingReset = { reset: false };
        }, fail);
        scope.postMessage({ type: 'ready' });
        break;
      case 'frame':
        if (!loop) throw new Error('Physics worker not initialized');
        loop.setFrame(data.frame);
        scope.postMessage({ type: 'frame-accepted' });
        break;
      case 'configure': loop?.configure(data.settings); break;
      case 'reset': loop?.reset(); break;
      case 'ack': awaitingAck = false; break;
      case 'stop': loop?.stop(); loop = undefined; scope.close(); break;
    }
  } catch (error) { fail(error); }
};
