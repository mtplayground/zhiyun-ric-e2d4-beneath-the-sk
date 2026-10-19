import { usePhysicsState } from '@/state/physics-state';
import { toSolverSettings } from '@/domain/physics/physics-settings';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';

import type { PhysicsDiagnostic } from '@/domain/physics/physics-protocol';
import { appConfig } from '@/config/env';
import {
  cachedTransitionFrameCount,
  getCachedTransitionFrame,
} from '@/domain/precompute';
import {
  auditBlendshapeWeights,
  auditPoseLibrary,
  findPoseAuditByLabel,
  type PoseAuditResult,
  type PoseLibraryAuditSummary,
} from '@/domain/poses';
import {
  getProviderRegistryEntry,
  type BlendshapeWeights,
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
  physicsEnabled: boolean;
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
  unsupportedBlendshapeNames: string[];
  activePoseAudit: PoseAuditResult | null;
  libraryAudit: PoseLibraryAuditSummary | null;
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

function createCompatibilityDiagnostic({
  asset,
  poseLabel,
  targetWeights,
}: {
  asset: LoadedHeadAsset;
  poseLabel: string;
  targetWeights: BlendshapeWeights;
}): ProviderRuntimeDiagnostic {
  const libraryAudit = auditPoseLibrary({
    providerId: appConfig.deformationProvider,
    availableBlendshapes: asset.morphTargetNames,
  });
  const activePoseAudit =
    findPoseAuditByLabel(libraryAudit, poseLabel) ??
    auditBlendshapeWeights({
      poseId: poseIdFromLabel(poseLabel),
      label: poseLabel,
      weights: targetWeights,
      availableBlendshapes: asset.morphTargetNames,
    });
  const requestedCount =
    activePoseAudit.activeCount + activePoseAudit.missingCount;
  const compatibleCount = activePoseAudit.activeCount;
  const missingBlendshapeNames = [...activePoseAudit.missingBlendshapeNames];
  const unsupportedBlendshapeNames = [
    ...activePoseAudit.unsupportedBlendshapeNames,
  ];
  const auditSummary = `${libraryAudit.supportedPoseCount} supported / ${libraryAudit.partialPoseCount} partial / ${libraryAudit.unsupportedPoseCount} unsupported presets`;

  if (asset.morphTargetNames.length === 0) {
    return {
      label: 'No Morph Targets',
      message: `Loaded mesh has no morph targets; pose audit found ${libraryAudit.totalPoseCount} presets with no compatible targets.`,
      tone: 'destructive',
      requestedCount,
      compatibleCount: 0,
      missingBlendshapeNames,
      unsupportedBlendshapeNames,
      activePoseAudit,
      libraryAudit,
    };
  }

  if (activePoseAudit.status === 'neutral') {
    return {
      label: 'Rest Pose',
      message: `Neutral pose active; all compatible blendshape influences clear. Library audit: ${auditSummary}.`,
      tone: 'green',
      requestedCount: 0,
      compatibleCount: 0,
      missingBlendshapeNames: [],
      unsupportedBlendshapeNames,
      activePoseAudit,
      libraryAudit,
    };
  }

  if (activePoseAudit.status === 'unsupported') {
    return {
      label: 'Unsupported Preset',
      message: `${poseLabel} has no active morph-target matches on this mesh. Library audit: ${auditSummary}.`,
      tone: 'amber',
      requestedCount,
      compatibleCount,
      missingBlendshapeNames,
      unsupportedBlendshapeNames,
      activePoseAudit,
      libraryAudit,
    };
  }

  if (activePoseAudit.status === 'partial') {
    const sampleMissingNames = missingBlendshapeNames.slice(0, 4).join(', ');
    const sampleUnsupportedNames = unsupportedBlendshapeNames
      .slice(0, 4)
      .join(', ');
    const sampleIssue =
      sampleMissingNames || sampleUnsupportedNames || 'inactive weights';

    return {
      label: 'Partial Blendshape Match',
      message: `${compatibleCount}/${activePoseAudit.referencedCount} referenced targets active for ${poseLabel}; check ${sampleIssue}. Library audit: ${auditSummary}.`,
      tone: 'amber',
      requestedCount,
      compatibleCount,
      missingBlendshapeNames,
      unsupportedBlendshapeNames,
      activePoseAudit,
      libraryAudit,
    };
  }

  return {
    label: 'Blendshape Match',
    message: `${compatibleCount} compatible blendshape targets driving ${poseLabel}. Library audit: ${auditSummary}.`,
    tone: 'green',
    requestedCount,
    compatibleCount,
    missingBlendshapeNames: [],
    unsupportedBlendshapeNames,
    activePoseAudit,
    libraryAudit,
  };
}

export default function KinematicProviderRuntime({
  asset,
  assetUrl,
  physicsEnabled,
  onDiagnosticChange,
}: KinematicProviderRuntimeProps) {
  const activePoseLabel = useActivePoseLabel();
  const activeControlMode = useActiveControlMode();
  const activationValues = useActivationValues();
  const physicsSettings = usePhysicsState(state => state.settings);
  const resetRequest = usePhysicsState(state => state.resetRequest);
  const lastResetRequestRef = useRef(resetRequest);
  const physicsSettingsRef = useRef(physicsSettings);
  physicsSettingsRef.current = physicsSettings;
  const providerId = physicsEnabled ? 'xpbd-soft-tissue' : 'kinematic-blendshape';
  const provider = useMemo(() => getProviderRegistryEntry(providerId).createProvider(), [providerId]);
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
  const physicsDiagnosticRef = useRef<PhysicsDiagnostic | null>(null);
  const transitionRef = useRef<BlendshapeTransition | null>(null);

  useEffect(() => {
    onDiagnosticChangeRef.current = diagnostic => {
      const physics = physicsDiagnosticRef.current;
      onDiagnosticChange(diagnostic && physics ? {
        ...diagnostic,
        label: physics.code === 'worker' ? 'Physics Active' : physics.code === 'fallback' ? 'Physics Fallback' : 'Physics Diagnostic',
        message: physics.message,
        tone: physics.code === 'asset-error' || physics.code === 'solver-error' ? 'destructive' : physics.code === 'worker' ? 'green' : 'amber',
      } : diagnostic);
    };
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

    const isNeutralPose = activePoseLabel.toLowerCase().includes('neutral');

    if (isNeutralPose || Object.keys(activationValues).length === 0) {
      asset.applyBlendshapeWeights({});
      currentWeightsRef.current = {};
      providerLastWeightsRef.current = {};
      currentPoseLabelRef.current = activePoseLabel;
      transitionRef.current = null;
      return;
    }

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
    physicsDiagnosticRef.current = null;
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
        physics: physicsEnabled && asset.physics ? {
          ...asset.physics,
          simProxyUrl: appConfig.assets.simProxyUrl,
          settings: toSolverSettings(physicsSettingsRef.current),
          onDiagnostic: diagnostic => {
            physicsDiagnosticRef.current = diagnostic;
            const base = createCompatibilityDiagnostic({ asset, poseLabel: latestPoseLabelRef.current, targetWeights: latestActivationValuesRef.current });
            onDiagnosticChangeRef.current({ ...base,
              label: diagnostic.code === 'worker' ? 'Physics Active' : diagnostic.code === 'fallback' ? 'Physics Fallback' : 'Physics Diagnostic',
              message: diagnostic.message,
              tone: diagnostic.code === 'asset-error' || diagnostic.code === 'solver-error' ? 'destructive' : diagnostic.code === 'worker' ? 'green' : 'amber',
            });
          },
        } : undefined,
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
      if (physicsEnabled && !asset.physics) {
        physicsDiagnosticRef.current = { code: 'asset-error', message: 'Physics requires exactly one morph-bearing face primitive.' };
        const base = createCompatibilityDiagnostic({ asset, poseLabel: latestPoseLabelRef.current, targetWeights: latestActivationValuesRef.current });
        onDiagnosticChangeRef.current({ ...base, label: 'Physics Unavailable', tone: 'destructive', message: 'Physics requires exactly one morph-bearing face primitive.' });
      }
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
        unsupportedBlendshapeNames: [],
        activePoseAudit: null,
        libraryAudit: null,
      });
      console.error('Failed to initialize deformation provider', error);
    }

    return () => {
      provider.dispose?.();
      asset.applyVertexDeltas();
      physicsDiagnosticRef.current = null;
      initializedRef.current = false;
      transitionRef.current = null;
    };
  }, [asset, assetUrl, provider, physicsEnabled]);

  useEffect(() => {
    provider.configurePhysics?.(toSolverSettings(physicsSettings));
  }, [provider, physicsSettings]);

  useEffect(() => {
    if (lastResetRequestRef.current === resetRequest) return;
    lastResetRequestRef.current = resetRequest;
    provider.updateVertexDeltas?.(currentWeightsRef.current);
    provider.resetSimulation?.();
    asset?.applyVertexDeltas();
  }, [resetRequest, provider, asset]);

  useFrame(() => {
    frameIndexRef.current += 1;
    const frameIndex = frameIndexRef.current;
    const transition = transitionRef.current;

    if (asset && initializedRef.current && !transition) {
      asset.applyVertexDeltas(provider.updateVertexDeltas?.(currentWeightsRef.current));
    }
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
      providerId,
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
    asset.applyVertexDeltas(cachedFrame
      ? provider.updateVertexDeltas?.(evaluatedFrame.blendshapeWeights)
      : evaluatedFrame.vertexDeltas);
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
