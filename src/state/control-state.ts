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
const sliderPoseLabel = 'Slider Mix';
const initialFrameIndex = 0;
const initialControlMode: ControlMode = 'preset';
const activationEpsilon = 0.001;

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
      .map(([key, value]) => [key, clampActivation(value)] as const)
      .filter(([, value]) => value > activationEpsilon),
  );
}

function neutralReadoutForMode(mode: ControlMode): ControlReadout {
  return {
    activePoseLabel: neutralPoseLabel,
    activeControlMode: mode,
    currentFrameIndex: initialFrameIndex,
    activationValues: {},
  };
}

export const useControlState = create<ControlState>((set) => ({
  ...initialControlState,
  setActiveControlMode: (mode) => {
    set((state) => {
      if (state.activeControlMode === mode) {
        return state;
      }

      return neutralReadoutForMode(mode);
    });
  },
  setActivePose: (poseLabel, options) => {
    const normalizedPoseLabel = poseLabel.trim() || neutralPoseLabel;

    set((state) => ({
      activePoseLabel: normalizedPoseLabel,
      activeControlMode: options?.mode ?? state.activeControlMode,
      currentFrameIndex:
        options?.frameIndex === undefined
          ? options?.mode && options.mode !== state.activeControlMode
            ? initialFrameIndex
            : state.currentFrameIndex
          : normalizeFrameIndex(options.frameIndex),
      activationValues:
        options?.activationValues === undefined
          ? options?.mode && options.mode !== state.activeControlMode
            ? {}
            : state.activationValues
          : normalizeActivationValues(options.activationValues),
    }));
  },
  setActivationValue: (key, value, mode = 'slider') => {
    const normalizedKey = key.trim();

    if (!normalizedKey) {
      return;
    }

    set((state) => {
      const activationValues = normalizeActivationValues({
        ...(mode === state.activeControlMode ? state.activationValues : {}),
        [normalizedKey]: value,
      });

      return {
        activePoseLabel:
          mode === 'slider' && Object.keys(activationValues).length > 0
            ? sliderPoseLabel
            : neutralPoseLabel,
        activeControlMode: mode,
        currentFrameIndex:
          mode === state.activeControlMode
            ? state.currentFrameIndex
            : initialFrameIndex,
        activationValues,
      };
    });
  },
  setActivationValues: (values, options) => {
    set((state) => {
      const acceptsActivationValues =
        options?.mode === undefined || options.mode === state.activeControlMode;
      const activePoseIsNeutral = state.activePoseLabel
        .toLowerCase()
        .includes('neutral');

      return {
        activeControlMode: state.activeControlMode,
        currentFrameIndex:
          options?.frameIndex === undefined
            ? state.currentFrameIndex
            : normalizeFrameIndex(options.frameIndex),
        activationValues: activePoseIsNeutral
          ? {}
          : acceptsActivationValues
            ? normalizeActivationValues(values)
            : state.activationValues,
      };
    });
  },
  setCurrentFrameIndex: (frameIndex) => {
    set({ currentFrameIndex: normalizeFrameIndex(frameIndex) });
  },
  resetToNeutral: () => {
    set({
      activePoseLabel: neutralPoseLabel,
      activeControlMode: initialControlMode,
      currentFrameIndex: initialFrameIndex,
      activationValues: {},
    });
  },
}));
