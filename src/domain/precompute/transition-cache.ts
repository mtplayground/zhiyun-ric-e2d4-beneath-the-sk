import {
  getKeyboardPoseEntries,
  getPoseWeights,
  type KeyboardPoseEntry,
} from '@/domain/poses';
import {
  getProviderRegistryEntry,
  type BlendshapeWeights,
  type DeformationFrame,
  type DeformationProviderId,
  type DeformationTargetPose,
} from '@/domain/providers';

export const cachedTransitionFrameCount = 18;

export type WarmupPose = {
  id: string;
  label: string;
  blendshapeWeights: BlendshapeWeights;
};

export type CachedTransition = {
  providerId: DeformationProviderId;
  fromPose: WarmupPose;
  toPose: WarmupPose;
  frames: readonly DeformationFrame[];
};

export type TransitionPrecomputeProgress = {
  completedTransitions: number;
  totalTransitions: number;
  progress: number;
  currentTransitionLabel: string;
};

export type TransitionPrecomputeResult = {
  poseCount: number;
  transitionCount: number;
  frameCount: number;
};

const transitionCache = new Map<string, CachedTransition>();

function cacheKey(
  providerId: DeformationProviderId,
  fromPoseLabel: string,
  toPoseLabel: string,
) {
  return `${providerId}::${fromPoseLabel}::${toPoseLabel}`;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function weightsNearlyEqual(
  left: BlendshapeWeights,
  right: BlendshapeWeights,
  epsilon = 0.0001,
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const key of keys) {
    if (Math.abs((left[key] ?? 0) - (right[key] ?? 0)) > epsilon) {
      return false;
    }
  }

  return true;
}

function buildWarmupPose(
  entry: KeyboardPoseEntry,
  providerId: DeformationProviderId,
): WarmupPose {
  return {
    id: entry.pose.id,
    label: entry.pose.label,
    blendshapeWeights: getPoseWeights(entry.pose, providerId),
  };
}

function uniqueWarmupPoses(poses: readonly WarmupPose[]) {
  const seen = new Set<string>();
  const unique: WarmupPose[] = [];

  poses.forEach((pose) => {
    if (seen.has(pose.label)) {
      return;
    }

    seen.add(pose.label);
    unique.push(pose);
  });

  return unique;
}

export function getKeyboardWarmupPoses(
  providerId: DeformationProviderId,
): readonly WarmupPose[] {
  return uniqueWarmupPoses([
    {
      id: 'rest-neutral',
      label: 'Neutral',
      blendshapeWeights: {},
    },
    ...getKeyboardPoseEntries().map((entry) =>
      buildWarmupPose(entry, providerId),
    ),
  ]);
}

export function initializeKeyboardTransitionCache(
  providerId: DeformationProviderId,
): TransitionPrecomputeResult {
  const poses = getKeyboardWarmupPoses(providerId);
  const cachedTransitions = poses.reduce((count, fromPose) => {
    return (
      count +
      poses.filter((toPose) =>
        transitionCache.has(cacheKey(providerId, fromPose.label, toPose.label)),
      ).length
    );
  }, 0);

  return {
    poseCount: poses.length,
    transitionCount: poses.length * poses.length,
    frameCount: cachedTransitions * cachedTransitionFrameCount,
  };
}

export async function precomputeKeyboardTransitionCache({
  providerId,
  onProgress,
}: {
  providerId: DeformationProviderId;
  onProgress?: (progress: TransitionPrecomputeProgress) => void;
}): Promise<TransitionPrecomputeResult> {
  const poses = getKeyboardWarmupPoses(providerId);
  const provider = getProviderRegistryEntry(providerId).createProvider();
  const availableBlendshapes = [
    ...new Set(poses.flatMap((pose) => Object.keys(pose.blendshapeWeights))),
  ].sort((left, right) => left.localeCompare(right));
  const targetPoses: DeformationTargetPose[] = poses.map((pose) => ({
    id: pose.id,
    label: pose.label,
    blendshapeWeights: pose.blendshapeWeights,
  }));
  const totalTransitions = poses.length * poses.length;
  let completedTransitions = 0;

  provider.initialize({
    assetUrl: 'precompute://keyboard-transitions',
    availableBlendshapes,
    initialBlendshapeWeights: {},
  });
  await provider.precompute?.(targetPoses);

  for (const fromPose of poses) {
    for (const toPose of poses) {
      const frames = Array.from(
        { length: cachedTransitionFrameCount },
        (_, index) =>
          provider.evaluateFrame({
            targetPose: {
              id: toPose.id,
              label: toPose.label,
              blendshapeWeights: toPose.blendshapeWeights,
            },
            progress: (index + 1) / cachedTransitionFrameCount,
            frameIndex: index + 1,
            previousBlendshapeWeights: fromPose.blendshapeWeights,
          }),
      );

      transitionCache.set(cacheKey(providerId, fromPose.label, toPose.label), {
        providerId,
        fromPose,
        toPose,
        frames,
      });
      completedTransitions += 1;
      onProgress?.({
        completedTransitions,
        totalTransitions,
        progress: completedTransitions / totalTransitions,
        currentTransitionLabel: `${fromPose.label} -> ${toPose.label}`,
      });

      if (completedTransitions % poses.length === 0) {
        await yieldToBrowser();
      }
    }
  }

  provider.dispose?.();

  return {
    poseCount: poses.length,
    transitionCount: totalTransitions,
    frameCount: totalTransitions * cachedTransitionFrameCount,
  };
}

export function getCachedTransitionFrame({
  providerId,
  fromPoseLabel,
  toPoseLabel,
  fromWeights,
  frameOffset,
}: {
  providerId: DeformationProviderId;
  fromPoseLabel: string;
  toPoseLabel: string;
  fromWeights: BlendshapeWeights;
  frameOffset: number;
}) {
  const transition = transitionCache.get(
    cacheKey(providerId, fromPoseLabel, toPoseLabel),
  );

  if (
    !transition ||
    !weightsNearlyEqual(fromWeights, transition.fromPose.blendshapeWeights)
  ) {
    return null;
  }

  const frameIndex = Math.min(
    transition.frames.length - 1,
    Math.max(0, Math.floor(frameOffset) - 1),
  );

  return transition.frames[frameIndex] ?? null;
}
