import { describe, expect, it } from 'vitest';

import {
  actionUnitPoseMappings,
  allPoseMappings,
  auditPoseLibrary,
  expressionPoseMappings,
  phonemePoseMappings,
} from '@/domain/poses';

const referenceMeshMorphTargets = [
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekSquintLeft',
  'cheekSquintRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'jawOpen',
  'mouthClose',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPucker',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'tongueOut',
] as const;

describe('reference mesh preset coverage', () => {
  it('covers every phoneme, expression, and action unit in the audit', () => {
    const summary = auditPoseLibrary({
      providerId: 'kinematic-blendshape',
      availableBlendshapes: referenceMeshMorphTargets,
    });

    expect(summary.poseAudits.map((audit) => audit.poseId)).toEqual(
      allPoseMappings.map((pose) => pose.id),
    );
    expect(summary.totalPoseCount).toBe(
      phonemePoseMappings.length +
        expressionPoseMappings.length +
        actionUnitPoseMappings.length,
    );
  });

  it('resolves every non-neutral preset to supported reference mesh weights', () => {
    const summary = auditPoseLibrary({
      providerId: 'kinematic-blendshape',
      availableBlendshapes: referenceMeshMorphTargets,
    });
    const unsupportedPoses = summary.poseAudits.filter(
      (audit) => audit.status === 'unsupported',
    );
    const missingTargets = summary.poseAudits.filter(
      (audit) => audit.missingCount > 0,
    );
    const nonNeutralWithoutActiveWeights = summary.poseAudits.filter(
      (audit) => audit.status !== 'neutral' && audit.activeCount === 0,
    );

    expect(unsupportedPoses).toEqual([]);
    expect(missingTargets).toEqual([]);
    expect(nonNeutralWithoutActiveWeights).toEqual([]);
  });
});
