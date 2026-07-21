import type {
  BlendshapeWeights,
  DeformationProviderId,
} from '@/domain/providers';

import {
  allPoseMappings,
  getPoseWeights,
  type PoseCategory,
  type PoseMapping,
} from './pose-library';

export type PoseBlendshapeAuditStatus = 'active' | 'missing' | 'unsupported';

export type PoseBlendshapeAuditEntry = {
  name: string;
  weight: number;
  status: PoseBlendshapeAuditStatus;
};

export type PoseAuditStatus =
  'neutral' | 'supported' | 'partial' | 'unsupported';

export type PoseAuditResult = {
  poseId: string;
  label: string;
  category: PoseCategory | 'custom';
  code?: string;
  status: PoseAuditStatus;
  entries: readonly PoseBlendshapeAuditEntry[];
  activeBlendshapeNames: readonly string[];
  missingBlendshapeNames: readonly string[];
  unsupportedBlendshapeNames: readonly string[];
  activeCount: number;
  missingCount: number;
  unsupportedCount: number;
  referencedCount: number;
};

export type PoseLibraryAuditSummary = {
  providerId: DeformationProviderId;
  totalPoseCount: number;
  neutralPoseCount: number;
  supportedPoseCount: number;
  partialPoseCount: number;
  unsupportedPoseCount: number;
  activeBlendshapeNames: readonly string[];
  missingBlendshapeNames: readonly string[];
  unsupportedBlendshapeNames: readonly string[];
  unsupportedPoseLabels: readonly string[];
  poseAudits: readonly PoseAuditResult[];
};

const activationEpsilon = 0.0001;

function normalizeWeight(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function classifyBlendshape({
  name,
  weight,
  availableBlendshapes,
}: {
  name: string;
  weight: number;
  availableBlendshapes: ReadonlySet<string>;
}): PoseBlendshapeAuditStatus {
  if (weight <= activationEpsilon) {
    return 'unsupported';
  }

  return availableBlendshapes.has(name) ? 'active' : 'missing';
}

function summarizePoseStatus(
  entries: readonly PoseBlendshapeAuditEntry[],
): PoseAuditStatus {
  if (entries.length === 0) {
    return 'neutral';
  }

  const activeCount = entries.filter(
    (entry) => entry.status === 'active',
  ).length;

  if (activeCount === entries.length) {
    return 'supported';
  }

  if (activeCount === 0) {
    return 'unsupported';
  }

  return 'partial';
}

export function auditBlendshapeWeights({
  poseId,
  label,
  category = 'custom',
  code,
  weights,
  availableBlendshapes,
}: {
  poseId: string;
  label: string;
  category?: PoseCategory | 'custom';
  code?: string;
  weights: BlendshapeWeights;
  availableBlendshapes: readonly string[] | ReadonlySet<string>;
}): PoseAuditResult {
  const availableBlendshapeSet =
    availableBlendshapes instanceof Set
      ? availableBlendshapes
      : new Set(availableBlendshapes);
  const entries = Object.entries(weights)
    .filter(([name]) => name.trim().length > 0)
    .map(([name, value]) => {
      const weight = normalizeWeight(value);

      return {
        name,
        weight,
        status: classifyBlendshape({
          name,
          weight,
          availableBlendshapes: availableBlendshapeSet,
        }),
      } satisfies PoseBlendshapeAuditEntry;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const activeBlendshapeNames = entries
    .filter((entry) => entry.status === 'active')
    .map((entry) => entry.name);
  const missingBlendshapeNames = entries
    .filter((entry) => entry.status === 'missing')
    .map((entry) => entry.name);
  const unsupportedBlendshapeNames = entries
    .filter((entry) => entry.status === 'unsupported')
    .map((entry) => entry.name);

  return {
    poseId,
    label,
    category,
    code,
    status: summarizePoseStatus(entries),
    entries,
    activeBlendshapeNames,
    missingBlendshapeNames,
    unsupportedBlendshapeNames,
    activeCount: activeBlendshapeNames.length,
    missingCount: missingBlendshapeNames.length,
    unsupportedCount: unsupportedBlendshapeNames.length,
    referencedCount: entries.length,
  };
}

export function auditPoseMapping({
  pose,
  providerId,
  availableBlendshapes,
}: {
  pose: PoseMapping;
  providerId: DeformationProviderId;
  availableBlendshapes: readonly string[] | ReadonlySet<string>;
}): PoseAuditResult {
  return auditBlendshapeWeights({
    poseId: pose.id,
    label: pose.label,
    category: pose.category,
    code: pose.code,
    weights: getPoseWeights(pose, providerId),
    availableBlendshapes,
  });
}

export function auditPoseLibrary({
  providerId,
  availableBlendshapes,
  poses = allPoseMappings,
}: {
  providerId: DeformationProviderId;
  availableBlendshapes: readonly string[] | ReadonlySet<string>;
  poses?: readonly PoseMapping[];
}): PoseLibraryAuditSummary {
  const poseAudits = poses.map((pose) =>
    auditPoseMapping({ pose, providerId, availableBlendshapes }),
  );

  return {
    providerId,
    totalPoseCount: poseAudits.length,
    neutralPoseCount: poseAudits.filter((audit) => audit.status === 'neutral')
      .length,
    supportedPoseCount: poseAudits.filter(
      (audit) => audit.status === 'supported',
    ).length,
    partialPoseCount: poseAudits.filter((audit) => audit.status === 'partial')
      .length,
    unsupportedPoseCount: poseAudits.filter(
      (audit) => audit.status === 'unsupported',
    ).length,
    activeBlendshapeNames: uniqueSorted(
      poseAudits.flatMap((audit) => audit.activeBlendshapeNames),
    ),
    missingBlendshapeNames: uniqueSorted(
      poseAudits.flatMap((audit) => audit.missingBlendshapeNames),
    ),
    unsupportedBlendshapeNames: uniqueSorted(
      poseAudits.flatMap((audit) => audit.unsupportedBlendshapeNames),
    ),
    unsupportedPoseLabels: poseAudits
      .filter((audit) => audit.status === 'unsupported')
      .map((audit) => audit.label),
    poseAudits,
  };
}

export function findPoseAuditByLabel(
  summary: PoseLibraryAuditSummary,
  poseLabel: string,
) {
  return summary.poseAudits.find((audit) => audit.label === poseLabel) ?? null;
}
