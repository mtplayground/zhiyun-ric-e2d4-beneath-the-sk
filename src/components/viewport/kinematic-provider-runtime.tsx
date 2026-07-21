import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';

import { appConfig } from '@/config/env';
import {
  cachedTransitionFrameCount,
  getCachedTransitionFrame,
} from '@/domain/precompute';
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
  onDiagnosticChange: (diagnostic: ProviderRuntimeDiagnostic | null) => void;
};

type BlendshapeTransition = {
  fromWeights: BlendshapeWeights;
  targetWeights: BlendshapeWeights;
  fromPoseLabel: string;
  poseLabel: string;
  startFrameIndex: number;
};

export type ProviderRuntimeDiagnosticTone =
  'cyan' | 'green' | 'amber' | 'destructive';

export type ProviderRuntimeDiagnostic = {
  label: string;
  message: string;
  tone: ProviderRuntimeDiagnosticTone;
  requestedCount: number;
  compatibleCount: number;
  missingBlendshapeNames: string[];
};

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

function createCompatibilityDiagnostic({
  asset,
  poseLabel,
  targetWeights,
}: {
  asset: LoadedHeadAsset;
  poseLabel: string;
  targetWeights: BlendshapeWeights;
}): ProviderRuntimeDiagnostic {
  const availableBlendshapeNames = new Set(asset.morphTargetNames);
  const requestedBlendshapeNames = Object.entries(targetWeights)
    .filter(([, value]) => Math.abs(value) > weightEpsilon)
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
  const missingBlendshapeNames = requestedBlendshapeNames.filter(
    (name) => !availableBlendshapeNames.has(name),
  );
  const compatibleCount =
    requestedBlendshapeNames.length - missingBlendshapeNames.length;

  if (asset.morphTargetNames.length === 0) {
    return {
      label: 'No Morph Targets',
      message:
        'Loaded mesh has no morph targets; the rest-pose reference remains visible.',
      tone: 'destructive',
      requestedCount: requestedBlendshapeNames.length,
      compatibleCount: 0,
      missingBlendshapeNames,
    };
  }

  if (requestedBlendshapeNames.length === 0) {
    return {
      label: 'Rest Pose',
      message:
        'Neutral pose active; all compatible blendshape influences clear.',
      tone: 'green',
      requestedCount: 0,
      compatibleCount: 0,
      missingBlendshapeNames: [],
    };
  }

  if (compatibleCount === 0) {
    return {
      label: 'No Compatible Weights',
      message: `${poseLabel} targets ${requestedBlendshapeNames.length} blendshapes that are not present on this mesh.`,
      tone: 'amber',
      requestedCount: requestedBlendshapeNames.length,
      compatibleCount,
      missingBlendshapeNames,
    };
  }

  if (missingBlendshapeNames.length > 0) {
    const sampleMissingNames = missingBlendshapeNames.slice(0, 4).join(', ');

    return {
      label: 'Partial Blendshape Match',
      message: `${compatibleCount}/${requestedBlendshapeNames.length} blendshape targets available; missing ${sampleMissingNames}.`,
      tone: 'amber',
      requestedCount: requestedBlendshapeNames.length,
      compatibleCount,
      missingBlendshapeNames,
    };
  }

  return {
    label: 'Blendshape Match',
    message: `${compatibleCount} compatible blendshape targets driving the mesh.`,
    tone: 'green',
    requestedCount: requestedBlendshapeNames.length,
    compatibleCount,
    missingBlendshapeNames: [],
  };
}

export default function KinematicProviderRuntime({
  asset,
  assetUrl,
  onDiagnosticChange,
}: KinematicProviderRuntimeProps) {
  const activePoseLabel = useActivePoseLabel();
  const activeControlMode = useActiveControlMode();
  const activationValues = useActivationValues();
  const provider = useMemo(createSelectedProvider, []);
  const initializedRef = useRef(false);
  const frameIndexRef = useRef(0);
  const currentWeightsRef = useRef<BlendshapeWeights>({});
  const providerLastWeightsRef = useRef<BlendshapeWeights>({});
  const currentPoseLabelRef = useRef(activePoseLabel);
  const latestPoseLabelRef = useRef(activePoseLabel);
  const latestControlModeRef = useRef(activeControlMode);
  const latestActivationValuesRef = useRef(activationValues);
  const latestDiagnosticPoseLabelRef = useRef(activePoseLabel);
  const onDiagnosticChangeRef = useRef(onDiagnosticChange);
  const transitionRef = useRef<BlendshapeTransition | null>(null);

  useEffect(() => {
    onDiagnosticChangeRef.current = onDiagnosticChange;
  }, [onDiagnosticChange]);

  useEffect(() => {
    latestPoseLabelRef.current = activePoseLabel;
    latestActivationValuesRef.current = activationValues;
    const poseLabelChanged =
      latestDiagnosticPoseLabelRef.current !== activePoseLabel;

    if (!asset || !initializedRef.current) {
      return;
    }

    if (
      !poseLabelChanged &&
      weightsNearlyEqual(activationValues, providerLastWeightsRef.current)
    ) {
      return;
    }

    latestDiagnosticPoseLabelRef.current = activePoseLabel;
    onDiagnosticChangeRef.current(
      createCompatibilityDiagnostic({
        asset,
        poseLabel: activePoseLabel,
        targetWeights: activationValues,
      }),
    );

    transitionRef.current = {
      fromWeights: currentWeightsRef.current,
      targetWeights: activationValues,
      fromPoseLabel: currentPoseLabelRef.current,
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
      onDiagnosticChangeRef.current(null);
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
      currentPoseLabelRef.current = latestPoseLabelRef.current;
      latestDiagnosticPoseLabelRef.current = latestPoseLabelRef.current;
      initializedRef.current = true;
      onDiagnosticChangeRef.current(
        createCompatibilityDiagnostic({
          asset,
          poseLabel: latestPoseLabelRef.current,
          targetWeights: latestActivationValuesRef.current,
        }),
      );
      transitionRef.current = weightsNearlyEqual(
        latestActivationValuesRef.current,
        initialBlendshapeWeights,
      )
        ? null
        : {
            fromWeights: initialBlendshapeWeights,
            targetWeights: latestActivationValuesRef.current,
            fromPoseLabel: currentPoseLabelRef.current,
            poseLabel: latestPoseLabelRef.current,
            startFrameIndex: frameIndexRef.current,
          };
    } catch (error) {
      initializedRef.current = false;
      transitionRef.current = null;
      onDiagnosticChangeRef.current({
        label: 'Provider Error',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to initialize deformation provider.',
        tone: 'destructive',
        requestedCount: 0,
        compatibleCount: 0,
        missingBlendshapeNames: [],
      });
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
      Math.max(0, elapsedFrames / cachedTransitionFrameCount),
    );
    const cachedFrame = getCachedTransitionFrame({
      providerId: appConfig.deformationProvider,
      fromPoseLabel: transition.fromPoseLabel,
      toPoseLabel: transition.poseLabel,
      fromWeights: transition.fromWeights,
      frameOffset: elapsedFrames,
    });
    const evaluatedFrame = cachedFrame
      ? {
          ...cachedFrame,
          frameIndex,
          progress,
        }
      : provider.evaluateFrame({
          targetPose: {
            id: poseIdFromLabel(transition.poseLabel),
            label: transition.poseLabel,
            blendshapeWeights: transition.targetWeights,
          },
          progress,
          frameIndex,
          previousBlendshapeWeights: transition.fromWeights,
        });

    asset.applyBlendshapeWeights(evaluatedFrame.blendshapeWeights);
    currentWeightsRef.current = evaluatedFrame.blendshapeWeights;
    providerLastWeightsRef.current = evaluatedFrame.blendshapeWeights;
    controlActions.setActivationValues(evaluatedFrame.blendshapeWeights, {
      frameIndex: evaluatedFrame.frameIndex,
      mode: latestControlModeRef.current,
    });

    if (progress >= 1) {
      currentPoseLabelRef.current = transition.poseLabel;
      transitionRef.current = null;
    }
  });

  return null;
}
