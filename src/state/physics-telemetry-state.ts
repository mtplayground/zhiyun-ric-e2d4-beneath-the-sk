import { create } from 'zustand';
import type { PhysicsSnapshot } from '@/domain/physics/physics-telemetry';
export const usePhysicsTelemetry = create<{
  snapshot: PhysicsSnapshot | null;
  publish(snapshot: PhysicsSnapshot): void;
  clear(): void;
}>((set)=>({
  snapshot:null,
  publish:snapshot=>set({snapshot}),
  clear:()=>set({snapshot:null}),
}));
