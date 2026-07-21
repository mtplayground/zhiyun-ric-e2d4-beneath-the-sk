import { beforeEach, describe, expect, it } from 'vitest';

import { useControlState } from './control-state';

const actions = () => useControlState.getState();

describe('control state transitions', () => {
  beforeEach(() => {
    actions().resetToNeutral();
  });

  it('sets active poses with normalized activation values', () => {
    actions().setActivePose('Smile', {
      mode: 'preset',
      frameIndex: 3.8,
      activationValues: {
        empty: 0,
        jawOpen: 2,
        mouthSmileLeft: 0.5,
      },
    });

    expect(useControlState.getState()).toMatchObject({
      activePoseLabel: 'Smile',
      activeControlMode: 'preset',
      currentFrameIndex: 3,
      activationValues: {
        jawOpen: 1,
        mouthSmileLeft: 0.5,
      },
    });
  });

  it('clears stale activation values when switching control modes', () => {
    actions().setActivePose('Smile', {
      mode: 'preset',
      activationValues: {
        mouthSmileLeft: 0.8,
      },
    });

    actions().setActiveControlMode('keyboard');

    expect(useControlState.getState()).toMatchObject({
      activePoseLabel: 'Neutral',
      activeControlMode: 'keyboard',
      currentFrameIndex: 0,
      activationValues: {},
    });
  });

  it('makes slider writes replace stale non-slider activations', () => {
    actions().setActivePose('Smile', {
      mode: 'preset',
      frameIndex: 7,
      activationValues: {
        mouthSmileLeft: 0.8,
      },
    });

    actions().setActivationValue('jawOpen', 0.42);

    expect(useControlState.getState()).toMatchObject({
      activePoseLabel: 'Slider Mix',
      activeControlMode: 'slider',
      currentFrameIndex: 0,
      activationValues: {
        jawOpen: 0.42,
      },
    });
  });

  it('prevents stale animation feedback from overriding the active mode or values', () => {
    actions().setActiveControlMode('keyboard');

    actions().setActivationValues(
      {
        jawOpen: 0.7,
      },
      {
        mode: 'preset',
        frameIndex: 12.4,
      },
    );

    expect(useControlState.getState()).toMatchObject({
      activeControlMode: 'keyboard',
      currentFrameIndex: 12,
      activationValues: {},
    });
  });
});
