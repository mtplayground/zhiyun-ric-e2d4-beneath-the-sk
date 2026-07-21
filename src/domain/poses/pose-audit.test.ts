import { describe, expect, it } from 'vitest';

import {
  actionUnitPoseMappings,
  allPoseMappings,
  auditPoseLibrary,
  auditPoseMapping,
  expressionPoseMappings,
  phonemePoseMappings,
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
    expect(audit.missingBlendshapeNames).toEqual(['mouthClose', 'tongueOut']);
    expect(audit.unsupportedBlendshapeNames).toEqual([]);
  });

  it('marks zero-weight entries as unsupported rather than active', () => {
    const lipsPart = actionUnitPoseMappings.find(
      (pose) => pose.id === 'au-25-lips-part',
    );

    expect(lipsPart).toBeDefined();

    const audit = auditPoseMapping({
      pose: lipsPart!,
      providerId: 'kinematic-blendshape',
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
    expect(audit.missingCount).toBe(4);
  });
});
