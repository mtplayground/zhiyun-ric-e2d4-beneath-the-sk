import { useShallow } from 'zustand/react/shallow';

import {
  useControlState,
  type ActivationKey,
  type ActivationValues,
  type ControlMode,
  type ControlReadout,
  type ControlState,
} from '@/state/control-state';

export const useActivePoseLabel = () =>
  useControlState((state) => state.activePoseLabel);

export const useActiveControlMode = () =>
  useControlState((state) => state.activeControlMode);

export const useCurrentFrameIndex = () =>
  useControlState((state) => state.currentFrameIndex);

export const useActivationValues = () =>
  useControlState((state) => state.activationValues);

export const useControlReadout = (): ControlReadout =>
  useControlState(
    useShallow((state) => ({
      activePoseLabel: state.activePoseLabel,
      activeControlMode: state.activeControlMode,
      currentFrameIndex: state.currentFrameIndex,
      activationValues: state.activationValues,
    })),
  );

export const controlActions = {
  setActiveControlMode: (mode: ControlMode) =>
    useControlState.getState().setActiveControlMode(mode),
  setActivePose: (
    poseLabel: string,
    options?: Parameters<ControlState['setActivePose']>[1],
  ) => useControlState.getState().setActivePose(poseLabel, options),
  setActivationValue: (key: ActivationKey, value: number, mode?: ControlMode) =>
    useControlState.getState().setActivationValue(key, value, mode),
  setActivationValues: (
    values: ActivationValues,
    options?: Parameters<ControlState['setActivationValues']>[1],
  ) => useControlState.getState().setActivationValues(values, options),
  setCurrentFrameIndex: (frameIndex: number) =>
    useControlState.getState().setCurrentFrameIndex(frameIndex),
  resetToNeutral: () => useControlState.getState().resetToNeutral(),
};
