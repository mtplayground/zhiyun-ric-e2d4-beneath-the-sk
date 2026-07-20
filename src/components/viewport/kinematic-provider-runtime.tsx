import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';

import { appConfig } from '@/config/env';
import {
  getProviderRegistryEntry,
  type BlendshapeWeights,
  type DeformationProvider,
} from '@/domain/providers';
import {
  controlActions,
  useActivationValues,
  useActiveControlMode,
  useActivePoseLabel,
} from '@/state';

import type { LoadedHeadAsset } from './gltf-head-loader';

type KinematicProviderRuntimeProps = {
  asset: LoadedHeadAsset | null;
  assetUrl: string;
};

type BlendshapeTransition = {
  fromWeights: BlendshapeWeights;
  targetWeights: BlendshapeWeights;
  poseLabel: string;
  startFrameIndex: number;
};

const transitionFrameCount = 18;
const weightEpsilon = 0.0001;

function weightsNearlyEqual(
  left: BlendshapeWeights,
  right: BlendshapeWeights,
  epsilon = weightEpsilon,
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const key of keys) {
    if (Math.abs((left[key] ?? 0) - (right[key] ?? 0)) > epsilon) {
      return false;
    }
  }

  return true;
}

function poseIdFromLabel(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, '-') || 'neutral';
}

function createSelectedProvider(): DeformationProvider {
  return getProviderRegistryEntry(
    appConfig.deformationProvider,
  ).createProvider();
}

export default function KinematicProviderRuntime({
  asset,
  assetUrl,
}: KinematicProviderRuntimeProps) {
  const activePoseLabel = useActivePoseLabel();
  const activeControlMode = useActiveControlMode();
  const activationValues = useActivationValues();
  const provider = useMemo(createSelectedProvider, []);
  const initializedRef = useRef(false);
  const frameIndexRef = useRef(0);
  const currentWeightsRef = useRef<BlendshapeWeights>({});
  const providerLastWeightsRef = useRef<BlendshapeWeights>({});
  const latestPoseLabelRef = useRef(activePoseLabel);
  const latestControlModeRef = useRef(activeControlMode);
  const latestActivationValuesRef = useRef(activationValues);
  const transitionRef = useRef<BlendshapeTransition | null>(null);

  useEffect(() => {
    latestPoseLabelRef.current = activePoseLabel;
    latestActivationValuesRef.current = activationValues;

    if (!asset || !initializedRef.current) {
      return;
    }

    if (weightsNearlyEqual(activationValues, providerLastWeightsRef.current)) {
      return;
    }

    transitionRef.current = {
      fromWeights: currentWeightsRef.current,
      targetWeights: activationValues,
      poseLabel: activePoseLabel,
      startFrameIndex: frameIndexRef.current,
    };
  }, [activePoseLabel, activationValues, asset]);

  useEffect(() => {
    latestControlModeRef.current = activeControlMode;
  }, [activeControlMode]);

  useEffect(() => {
    if (!asset) {
      initializedRef.current = false;
      currentWeightsRef.current = {};
      providerLastWeightsRef.current = {};
      transitionRef.current = null;
      return;
    }

    try {
      const initialBlendshapeWeights = asset.readBlendshapeWeights();
      provider.initialize({
        assetUrl,
        availableBlendshapes: asset.morphTargetNames,
        initialBlendshapeWeights,
      });
      currentWeightsRef.current = initialBlendshapeWeights;
      providerLastWeightsRef.current = initialBlendshapeWeights;
      initializedRef.current = true;
      transitionRef.current = weightsNearlyEqual(
        latestActivationValuesRef.current,
        initialBlendshapeWeights,
      )
        ? null
        : {
            fromWeights: initialBlendshapeWeights,
            targetWeights: latestActivationValuesRef.current,
            poseLabel: latestPoseLabelRef.current,
            startFrameIndex: frameIndexRef.current,
          };
    } catch (error) {
      initializedRef.current = false;
      transitionRef.current = null;
      console.error('Failed to initialize deformation provider', error);
    }

    return () => {
      provider.dispose?.();
      initializedRef.current = false;
      transitionRef.current = null;
    };
  }, [asset, assetUrl, provider]);

  useFrame(() => {
    frameIndexRef.current += 1;
    const frameIndex = frameIndexRef.current;
    const transition = transitionRef.current;

    if (!asset || !initializedRef.current || !transition) {
      controlActions.setCurrentFrameIndex(frameIndex);
      return;
    }

    const elapsedFrames = frameIndex - transition.startFrameIndex;
    const progress = Math.min(
      1,
      Math.max(0, elapsedFrames / transitionFrameCount),
    );
    const frame = provider.evaluateFrame({
      targetPose: {
        id: poseIdFromLabel(transition.poseLabel),
        label: transition.poseLabel,
        blendshapeWeights: transition.targetWeights,
      },
      progress,
      frameIndex,
      previousBlendshapeWeights: transition.fromWeights,
    });

    asset.applyBlendshapeWeights(frame.blendshapeWeights);
    currentWeightsRef.current = frame.blendshapeWeights;
    providerLastWeightsRef.current = frame.blendshapeWeights;
    controlActions.setActivationValues(frame.blendshapeWeights, {
      frameIndex: frame.frameIndex,
      mode: latestControlModeRef.current,
    });

    if (progress >= 1) {
      transitionRef.current = null;
    }
  });

  return null;
}
