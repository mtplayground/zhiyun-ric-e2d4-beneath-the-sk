import { create } from 'zustand';

export type ControlMode = 'preset' | 'keyboard' | 'slider';

export type ActivationKey = string;

export type ActivationValues = Record<ActivationKey, number>;

export type ControlReadout = {
  activePoseLabel: string;
  activeControlMode: ControlMode;
  currentFrameIndex: number;
  activationValues: ActivationValues;
};

type SetPoseOptions = {
  mode?: ControlMode;
  frameIndex?: number;
  activationValues?: ActivationValues;
};

export type ControlState = ControlReadout & {
  setActiveControlMode: (mode: ControlMode) => void;
  setActivePose: (poseLabel: string, options?: SetPoseOptions) => void;
  setActivationValue: (
    key: ActivationKey,
    value: number,
    mode?: ControlMode,
  ) => void;
  setActivationValues: (
    values: ActivationValues,
    options?: Pick<SetPoseOptions, 'mode' | 'frameIndex'>,
  ) => void;
  setCurrentFrameIndex: (frameIndex: number) => void;
  resetToNeutral: () => void;
};

const neutralPoseLabel = 'Neutral';
const initialFrameIndex = 0;
const initialControlMode: ControlMode = 'preset';

export const initialControlState: ControlReadout = {
  activePoseLabel: neutralPoseLabel,
  activeControlMode: initialControlMode,
  currentFrameIndex: initialFrameIndex,
  activationValues: {},
};

export function clampActivation(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function normalizeFrameIndex(frameIndex: number) {
  if (!Number.isFinite(frameIndex)) {
    return initialFrameIndex;
  }

  return Math.max(0, Math.floor(frameIndex));
}

export function normalizeActivationValues(values: ActivationValues) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([key]) => key.trim().length > 0)
      .map(([key, value]) => [key, clampActivation(value)]),
  );
}

export const useControlState = create<ControlState>((set) => ({
  ...initialControlState,
  setActiveControlMode: (mode) => {
    set({ activeControlMode: mode });
  },
  setActivePose: (poseLabel, options) => {
    const normalizedPoseLabel = poseLabel.trim() || neutralPoseLabel;

    set((state) => ({
      activePoseLabel: normalizedPoseLabel,
      activeControlMode: options?.mode ?? state.activeControlMode,
      currentFrameIndex:
        options?.frameIndex === undefined
          ? state.currentFrameIndex
          : normalizeFrameIndex(options.frameIndex),
      activationValues:
        options?.activationValues === undefined
          ? state.activationValues
          : normalizeActivationValues(options.activationValues),
    }));
  },
  setActivationValue: (key, value, mode = 'slider') => {
    const normalizedKey = key.trim();

    if (!normalizedKey) {
      return;
    }

    set((state) => ({
      activeControlMode: mode,
      activationValues: {
        ...state.activationValues,
        [normalizedKey]: clampActivation(value),
      },
    }));
  },
  setActivationValues: (values, options) => {
    set((state) => ({
      activeControlMode: options?.mode ?? state.activeControlMode,
      currentFrameIndex:
        options?.frameIndex === undefined
          ? state.currentFrameIndex
          : normalizeFrameIndex(options.frameIndex),
      activationValues: normalizeActivationValues(values),
    }));
  },
  setCurrentFrameIndex: (frameIndex) => {
    set({ currentFrameIndex: normalizeFrameIndex(frameIndex) });
  },
  resetToNeutral: () => {
    set(initialControlState);
  },
}));
