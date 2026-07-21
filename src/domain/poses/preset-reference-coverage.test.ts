import { describe, expect, it } from 'vitest';

import {
  actionUnitPoseMappings,
  allPoseMappings,
  auditPoseLibrary,
  expressionPoseMappings,
  phonemePoseMappings,
} from '@/domain/poses';

const referenceMeshMorphTargets = [
  'browDown_L',
  'browDown_R',
  'browInnerUp',
  'browOuterUp_L',
  'browOuterUp_R',
  'cheekPuff',
  'cheekSquint_L',
  'cheekSquint_R',
  'eyeBlink_L',
  'eyeBlink_R',
  'eyeLookDown_L',
  'eyeLookDown_R',
  'eyeLookIn_L',
  'eyeLookIn_R',
  'eyeLookOut_L',
  'eyeLookOut_R',
  'eyeLookUp_L',
  'eyeLookUp_R',
  'eyeSquint_L',
  'eyeSquint_R',
  'eyeWide_L',
  'eyeWide_R',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimple_L',
  'mouthDimple_R',
  'mouthFrown_L',
  'mouthFrown_R',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDown_L',
  'mouthLowerDown_R',
  'mouthPress_L',
  'mouthPress_R',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmile_L',
  'mouthSmile_R',
  'mouthStretch_L',
  'mouthStretch_R',
  'mouthUpperUp_L',
  'mouthUpperUp_R',
  'noseSneer_L',
  'noseSneer_R',
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

  it('resolves every non-neutral preset to non-empty supported reference mesh weights', () => {
    const summary = auditPoseLibrary({
      providerId: 'kinematic-blendshape',
      availableBlendshapes: referenceMeshMorphTargets,
    });
    const unsupportedPoses = summary.poseAudits.filter(
      (audit) => audit.status === 'unsupported',
    );
    const partialPoses = summary.poseAudits.filter(
      (audit) => audit.status === 'partial',
    );
    const missingTargets = summary.poseAudits.filter(
      (audit) => audit.missingCount > 0,
    );
    const nonNeutralAudits = summary.poseAudits.filter(
      (audit) => audit.status !== 'neutral',
    );
    const nonNeutralWithoutSupportedWeights = nonNeutralAudits.filter(
      (audit) =>
        audit.status !== 'supported' ||
        audit.activeCount === 0 ||
        audit.activeBlendshapeNames.length === 0 ||
        audit.activeWeightTotal <= 0,
    );

    expect(unsupportedPoses).toEqual([]);
    expect(partialPoses).toEqual([]);
    expect(missingTargets).toEqual([]);
    expect(nonNeutralWithoutSupportedWeights).toEqual([]);
    expect(summary.partialPoseCount).toBe(0);
    expect(summary.unsupportedPoseCount).toBe(0);

    const weakVisiblePoses = nonNeutralAudits.filter(
      (audit) => audit.activeWeightTotal < 0.5 || audit.maxActiveWeight < 0.18,
    );

    expect(weakVisiblePoses).toEqual([]);
  });

  it('keeps N and Smile visually decisive on the default mesh', () => {
    const summary = auditPoseLibrary({
      providerId: 'kinematic-blendshape',
      availableBlendshapes: referenceMeshMorphTargets,
    });
    const phonemeN = summary.poseAudits.find(
      (audit) => audit.poseId === 'phoneme-n',
    );
    const smile = summary.poseAudits.find(
      (audit) => audit.poseId === 'expression-smile',
    );

    expect(phonemeN).toMatchObject({
      status: 'supported',
      activeBlendshapeNames: expect.arrayContaining([
        'jawOpen',
        'mouthFunnel',
        'mouthPress_L',
        'mouthPress_R',
        'mouthPucker',
      ]),
    });
    expect(phonemeN?.activeWeightTotal).toBeGreaterThanOrEqual(2);

    expect(smile).toMatchObject({
      status: 'supported',
      activeBlendshapeNames: expect.arrayContaining([
        'cheekSquint_L',
        'cheekSquint_R',
        'mouthDimple_L',
        'mouthDimple_R',
        'mouthSmile_L',
        'mouthSmile_R',
      ]),
    });
    expect(smile?.activeWeightTotal).toBeGreaterThanOrEqual(5);
  });
});
