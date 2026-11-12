import { describe, expect, it } from 'vitest';

import {
  actionUnitPoseMappings,
  allPoseMappings,
  auditBlendshapeWeights,
  auditPoseLibrary,
  auditPoseMapping,
  expressionPoseMappings,
  getMorphTargetAliasCandidates,
  getPoseWeights,
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
    expect(summary.unsafePoseLabels).toEqual([]);
    for (const audit of summary.poseAudits) {
      expect(audit.lipSafetyViolations, audit.label).toEqual([]);
      if (audit.status !== 'neutral') {
        expect(audit.maxActiveWeight, audit.label).toBeGreaterThanOrEqual(0.12);
      }
    }
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
    const jawOpen = getPoseWeights(phonemeT!, 'kinematic-blendshape').jawOpen;
    expect(audit.activeWeightTotal).toBeCloseTo(jawOpen);
    expect(audit.maxActiveWeight).toBeCloseTo(jawOpen);
    expect(audit.missingBlendshapeNames).toEqual([
      'mouthFunnel',
      'mouthLowerDownLeft',
      'mouthLowerDownRight',
      'mouthUpperUpLeft',
      'mouthUpperUpRight',
    ]);
    expect(audit.unsupportedBlendshapeNames).toEqual([]);
  });

  it.each([
    [{ mouthClose: 0.2 }, ['closure-exceeds-jaw']],
    [{ jawOpen: 0.1, mouthClose: 0.2 }, ['closure-exceeds-jaw']],
    [{ jawOpen: 0.2, mouthClose: 0.2 }, []],
    [{ jawOpen: 0.2, mouthClose: 0.2, mouthPressLeft: 0.4, mouthPressRight: 0.4 }, []],
    [{ jawOpen: 0.2, mouthClose: 0.1, mouthUpperUpLeft: 0.1 }, ['opposing-lip-shapes']],
    [{ mouthPressRight: 0.3, mouthLowerDownRight: 0.1 }, ['opposing-lip-shapes']],
  ])('flags unsafe lip weights %j even without mesh targets', (weights, violations) => {
    const summary = auditPoseLibrary({
      providerId: 'kinematic-blendshape',
      availableBlendshapes: [],
      poses: [{
        id: 'lip-test', label: 'Lip test', category: 'phoneme', description: '',
        weightsByProvider: { default: weights },
      }],
    });
    expect(summary.poseAudits[0].lipSafetyViolations).toEqual(violations);
    expect(summary.unsafePoseLabels).toEqual(violations.length ? ['Lip test'] : []);
  });

  it.each(['phoneme-t', 'phoneme-n'])('keeps %s slightly parted without pressing', (id) => {
    const pose = phonemePoseMappings.find((pose) => pose.id === id)!;
    const weights = getPoseWeights(pose, 'kinematic-blendshape');
    expect(weights.jawOpen).toBeGreaterThanOrEqual(0.1);
    expect(weights.jawOpen).toBeLessThanOrEqual(0.2);
    expect(weights.mouthClose ?? 0).toBe(0);
    expect(weights.mouthPressLeft ?? 0).toBe(0);
    expect(weights.mouthPressRight ?? 0).toBe(0);
    expect(weights.mouthUpperUpLeft).toBeGreaterThan(0);
    expect(weights.mouthLowerDownLeft).toBeGreaterThan(0);
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
    expect(audit.activeWeightTotal).toBeCloseTo(0.58);
    expect(audit.maxActiveWeight).toBeCloseTo(0.58);
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
    expect(audit.missingCount).toBe(8);
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
        'mouthDimple_L',
        'mouthDimple_R',
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
      'mouthDimple_L',
      'mouthDimple_R',
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
