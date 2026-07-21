import { describe, expect, it } from 'vitest';

import {
  createKinematicBlendshapeProvider,
  interpolateBlendshapeWeights,
} from './kinematic-blendshape-provider';

describe('interpolateBlendshapeWeights', () => {
  it('smoothly interpolates between current and target blendshape weights', () => {
    const weights = interpolateBlendshapeWeights({
      fromWeights: {
        jawOpen: 0.2,
      },
      targetWeights: {
        browInnerUp: 0.5,
        jawOpen: 1,
      },
      progress: 0.5,
    });

    expect(weights.browInnerUp).toBeCloseTo(0.25);
    expect(weights.jawOpen).toBeCloseTo(0.6);
  });

  it('clamps non-finite values and filters unavailable blendshapes', () => {
    const weights = interpolateBlendshapeWeights({
      fromWeights: {
        ignored: 1,
        jawOpen: Number.NaN,
      },
      targetWeights: {
        browInnerUp: 2,
        jawOpen: 0.5,
      },
      progress: 2,
      availableBlendshapes: new Set(['browInnerUp', 'jawOpen']),
    });

    expect(weights).toEqual({
      browInnerUp: 1,
      jawOpen: 0.5,
    });
  });
});

describe('createKinematicBlendshapeProvider', () => {
  it('initializes available blendshape filtering and emits evaluated frames', () => {
    const provider = createKinematicBlendshapeProvider();
    const readyState = provider.initialize({
      assetUrl: '/assets/head.glb',
      availableBlendshapes: ['jawOpen'],
      initialBlendshapeWeights: {},
    });

    expect(readyState).toEqual({
      providerId: 'kinematic-blendshape',
      availableBlendshapes: ['jawOpen'],
    });

    const frame = provider.evaluateFrame({
      frameIndex: 4.8,
      progress: 0.5,
      previousBlendshapeWeights: {
        jawOpen: 0,
      },
      targetPose: {
        id: 'mouth',
        label: 'Mouth',
        blendshapeWeights: {
          browInnerUp: 1,
          jawOpen: 0.8,
        },
      },
    });

    expect(frame).toEqual({
      frameIndex: 4,
      progress: 0.5,
      blendshapeWeights: {
        jawOpen: 0.4,
      },
    });
  });
});
