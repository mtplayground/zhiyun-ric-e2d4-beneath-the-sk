import { describe, expect, it } from 'vitest';

import {
  actionUnitPoseMappings,
  allPoseMappings,
  auditBlendshapeWeights,
  auditPoseLibrary,
  auditPoseMapping,
  expressionPoseMappings,
  getMorphTargetAliasCandidates,
  phonemePoseMappings,
  resolveMorphTargetName,
} from '@/domain/poses';

describe('pose morph-target audit', () => {
  it('audits every FACS, expression, and phoneme preset', () => {
    const availableBlendshapes = [
      ...new Set(
        allPoseMappings.flatMap((pose) =>
          Object.keys(pose.weightsByProvider['kinematic-blendshape'] ?? {}),
        ),
      ),
    ];
    const summary = auditPoseLibrary({
      providerId: 'kinematic-blendshape',
      availableBlendshapes,
    });

    expect(summary.totalPoseCount).toBe(
      actionUnitPoseMappings.length +
        expressionPoseMappings.length +
        phonemePoseMappings.length,
    );
    expect(summary.poseAudits.map((audit) => audit.poseId)).toEqual(
      allPoseMappings.map((pose) => pose.id),
    );
    expect(summary.neutralPoseCount).toBe(2);
  });

  it('classifies referenced blendshapes as active, missing, or unsupported', () => {
    const phonemeT = phonemePoseMappings.find(
      (pose) => pose.id === 'phoneme-t',
    );

    expect(phonemeT).toBeDefined();

    const audit = auditPoseMapping({
      pose: phonemeT!,
      providerId: 'kinematic-blendshape',
      availableBlendshapes: ['jawOpen'],
    });

    expect(audit.status).toBe('partial');
    expect(audit.activeBlendshapeNames).toEqual(['jawOpen']);
    expect(audit.missingBlendshapeNames).toEqual([
      'mouthClose',
      'mouthFunnel',
      'mouthLowerDownLeft',
      'mouthLowerDownRight',
      'mouthUpperUpLeft',
      'mouthUpperUpRight',
    ]);
    expect(audit.unsupportedBlendshapeNames).toEqual([]);
  });

  it('marks zero-weight entries as unsupported rather than active', () => {
    const audit = auditBlendshapeWeights({
      poseId: 'custom-zero-weight',
      label: 'Custom Zero Weight',
      weights: {
        jawOpen: 0.58,
        mouthClose: 0,
      },
      availableBlendshapes: ['jawOpen', 'mouthClose'],
    });

    expect(audit.status).toBe('partial');
    expect(audit.activeBlendshapeNames).toEqual(['jawOpen']);
    expect(audit.unsupportedBlendshapeNames).toEqual(['mouthClose']);
  });

  it('surfaces fully unsupported poses when no referenced target exists', () => {
    const smile = expressionPoseMappings.find(
      (pose) => pose.id === 'expression-smile',
    );

    expect(smile).toBeDefined();

    const audit = auditPoseMapping({
      pose: smile!,
      providerId: 'kinematic-blendshape',
      availableBlendshapes: ['jawOpen'],
    });

    expect(audit.status).toBe('unsupported');
    expect(audit.activeCount).toBe(0);
    expect(audit.missingCount).toBe(6);
  });

  it('resolves fallback morph-target aliases before marking a pose missing', () => {
    const smile = expressionPoseMappings.find(
      (pose) => pose.id === 'expression-smile',
    );

    expect(smile).toBeDefined();
    expect(getMorphTargetAliasCandidates('mouthSmileLeft')).toContain(
      'mouthSmile_L',
    );
    expect(
      resolveMorphTargetName({
        requestedName: 'mouthSmileLeft',
        availableBlendshapes: ['mouthSmile_L'],
      }),
    ).toBe('mouthSmile_L');

    const audit = auditPoseMapping({
      pose: smile!,
      providerId: 'kinematic-blendshape',
      availableBlendshapes: [
        'cheek_squint_l',
        'cheek_squint_r',
        'eye_squint_l',
        'eye_squint_r',
        'mouthSmile_L',
        'mouthSmile_R',
      ],
    });

    expect(audit.status).toBe('supported');
    expect(audit.activeBlendshapeNames).toEqual([
      'cheek_squint_l',
      'cheek_squint_r',
      'eye_squint_l',
      'eye_squint_r',
      'mouthSmile_L',
      'mouthSmile_R',
    ]);
    expect(
      audit.entries.find((entry) => entry.name === 'mouthSmileLeft'),
    ).toMatchObject({
      resolvedName: 'mouthSmile_L',
      status: 'active',
    });
    expect(audit.missingBlendshapeNames).toEqual([]);
  });
});
