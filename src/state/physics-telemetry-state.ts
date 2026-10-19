import { create } from 'zustand';
import type { PhysicsSnapshot } from '@/domain/physics/physics-telemetry';
import type { PhysicsDiagnostic } from '@/domain/physics/physics-protocol';

export type PhysicsStatus =
  | { active: true; backend: 'worker' | 'main-thread fallback' }
  | { active: false; reason: string };

export function physicsStatusLabel(status: PhysicsStatus) {
  return status.active ? `Active · ${status.backend}` : `Inactive · ${status.reason}`;
}

export const usePhysicsTelemetry = create<{
  snapshot: PhysicsSnapshot | null;
  status: PhysicsStatus;
  diagnose(diagnostic: PhysicsDiagnostic): void;
  inactive(reason: string): void;
  publish(snapshot: PhysicsSnapshot): void;
  clear(): void;
}>((set) => ({
  snapshot: null,
  status: { active: false, reason: 'Physics disabled' },
  diagnose: diagnostic => set(state => {
    if (diagnostic.code === 'worker' || diagnostic.code === 'fallback') {
      return { status: { active: true, backend: diagnostic.code === 'worker' ? 'worker' : 'main-thread fallback' } };
    }
    // A numerical reset recovers on the same backend; it does not stop physics.
    if (diagnostic.code === 'reset') return state;
    return { snapshot: null, status: { active: false, reason: diagnostic.code === 'asset-error'
      ? 'Invalid or mismatched proxy asset'
      : 'Worker startup failure' } };
  }),
  inactive: reason => set({ snapshot: null, status: { active: false, reason } }),
  publish: snapshot => set({ snapshot }),
  clear: () => set({ snapshot: null, status: { active: false, reason: 'Physics disabled' } }),
}));
