import type {
  BlendshapeName,
  BlendshapeWeights,
  DeformationFrame,
  DeformationFrameInput,
  DeformationProvider,
  DeformationProviderContext,
  DeformationProviderReadyState,
  DeformationTargetPose,
  DeformationWarmupResult,
} from './deformation-provider';
import { createMorphTargetNameResolver } from '@/domain/poses/morph-target-aliases';

const providerId = 'kinematic-blendshape';
const providerLabel = 'Kinematic blendshape provider';
const activationEpsilon = 0.0001;

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function smoothProgress(value: number) {
  const progress = clamp01(value);

  return progress * progress * (3 - 2 * progress);
}

function normalizeWeights(weights: BlendshapeWeights): BlendshapeWeights {
  return Object.fromEntries(
    Object.entries(weights)
      .filter(([name]) => name.trim().length > 0)
      .map(([name, value]) => [name, clamp01(value)]),
  );
}

function remapBlendshapeWeights(
  weights: BlendshapeWeights,
  resolveBlendshapeName:
    ((name: BlendshapeName) => BlendshapeName | null) | null,
): BlendshapeWeights {
  const normalizedWeights = normalizeWeights(weights);

  if (!resolveBlendshapeName) {
    return normalizedWeights;
  }

  const remappedWeights = new Map<BlendshapeName, number>();

  Object.entries(normalizedWeights).forEach(([name, value]) => {
    const resolvedName = resolveBlendshapeName(name);

    if (!resolvedName) {
      return;
    }

    remappedWeights.set(
      resolvedName,
      Math.max(remappedWeights.get(resolvedName) ?? 0, value),
    );
  });

  return Object.fromEntries(remappedWeights);
}

function buildInterpolatedKeys(
  fromWeights: BlendshapeWeights,
  targetWeights: BlendshapeWeights,
) {
  const keys = new Set([
    ...Object.keys(fromWeights),
    ...Object.keys(targetWeights),
  ]);

  return [...keys].sort((a, b) => a.localeCompare(b));
}

export function interpolateBlendshapeWeights({
  fromWeights,
  targetWeights,
  progress,
  resolveBlendshapeName,
  availableBlendshapes,
}: {
  fromWeights: BlendshapeWeights;
  targetWeights: BlendshapeWeights;
  progress: number;
  resolveBlendshapeName?:
    ((name: BlendshapeName) => BlendshapeName | null) | null;
  availableBlendshapes?: ReadonlySet<BlendshapeName> | null;
}): BlendshapeWeights {
  const blendshapeResolver =
    resolveBlendshapeName ??
    (availableBlendshapes
      ? createMorphTargetNameResolver(availableBlendshapes)
      : null);
  const normalizedFrom = remapBlendshapeWeights(
    fromWeights,
    blendshapeResolver,
  );
  const normalizedTarget = remapBlendshapeWeights(
    targetWeights,
    blendshapeResolver,
  );
  const blendFactor = smoothProgress(progress);
  const keys = buildInterpolatedKeys(normalizedFrom, normalizedTarget);

  return Object.fromEntries(
    keys
      .map((key) => {
        const from = normalizedFrom[key] ?? 0;
        const target = normalizedTarget[key] ?? 0;
        const value = from + (target - from) * blendFactor;

        return [key, clamp01(value)] as const;
      })
      .filter(([, value]) => value > activationEpsilon),
  );
}

export function createKinematicBlendshapeProvider(): DeformationProvider {
  let availableBlendshapes: readonly BlendshapeName[] = [];
  let resolveBlendshapeName:
    ((name: BlendshapeName) => BlendshapeName | null) | null = null;
  let initialized = false;

  const initialize = (
    context: DeformationProviderContext,
  ): DeformationProviderReadyState => {
    availableBlendshapes = [...context.availableBlendshapes].sort((a, b) =>
      a.localeCompare(b),
    );
    resolveBlendshapeName =
      availableBlendshapes.length > 0
        ? createMorphTargetNameResolver(availableBlendshapes)
        : null;
    initialized = true;

    return {
      providerId,
      availableBlendshapes,
    };
  };

  const evaluateFrame = (input: DeformationFrameInput): DeformationFrame => {
    const targetPose: DeformationTargetPose = input.targetPose;
    const weights = interpolateBlendshapeWeights({
      fromWeights: input.previousBlendshapeWeights,
      targetWeights: targetPose.blendshapeWeights,
      progress: input.progress,
      resolveBlendshapeName: initialized ? resolveBlendshapeName : null,
    });

    return {
      frameIndex: Math.max(0, Math.floor(input.frameIndex)),
      progress: clamp01(input.progress),
      blendshapeWeights: weights,
    };
  };

  const precompute = (
    poses: readonly DeformationTargetPose[],
  ): DeformationWarmupResult => ({
    cachedPoseCount: poses.length,
    cachedFrameCount: 0,
  });

  const dispose = () => {
    availableBlendshapes = [];
    resolveBlendshapeName = null;
    initialized = false;
  };

  return {
    id: providerId,
    label: providerLabel,
    initialize,
    evaluateFrame,
    precompute,
    dispose,
  };
}
