import { create } from 'zustand';
import { appConfig } from '@/config/env';
import { DEFAULT_PHYSICS_SETTINGS, PHYSICS_PRESETS, PHYSICS_SETTING_RANGES, type PhysicsPreset, type PhysicsSettings } from '@/domain/physics/physics-settings';

export interface PhysicsState {
  enabled: boolean;
  debugOverlay: boolean;
  setDebugOverlay(enabled: boolean): void;
  settings: PhysicsSettings;
  preset: PhysicsPreset | 'custom';
  setPreset(preset: PhysicsPreset): void;
  resetRequest: number;
  setEnabled(enabled: boolean): void;
  setSetting(key: keyof PhysicsSettings, value: number): void;
  resetSimulation(): void;
}
export const usePhysicsState = create<PhysicsState>((set) => ({
  enabled: appConfig.deformationProvider === 'xpbd-soft-tissue',
  settings: { ...DEFAULT_PHYSICS_SETTINGS },
  preset: 'physical',
  setPreset: preset => {
    if (!Object.hasOwn(PHYSICS_PRESETS, preset)) return;
    set({ preset, settings: { ...PHYSICS_PRESETS[preset] } });
  },
  resetRequest: 0,
  debugOverlay: false,
  setDebugOverlay: debugOverlay => set({debugOverlay}),
  setEnabled: enabled => set({ enabled }),
  setSetting: (key, value) => {
    if (!Number.isFinite(value) || !Object.hasOwn(PHYSICS_SETTING_RANGES, key)) return;
    const { min, max } = PHYSICS_SETTING_RANGES[key];
    set(state => ({ preset: 'custom', settings: { ...state.settings, [key]: Math.max(min, Math.min(max, value)) } }));
  },
  resetSimulation: () => set(state => ({ resetRequest: state.resetRequest + 1 })),
}));
