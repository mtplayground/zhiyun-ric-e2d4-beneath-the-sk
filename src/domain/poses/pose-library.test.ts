import { describe, expect, it } from 'vitest';

import {
  actionUnitPoseMappings,
  findPoseMappingById,
  getKeyboardPoseEntries,
  getPoseWeights,
  keyboardPoseMappings,
} from './pose-library';

describe('pose library mappings', () => {
  it('contains the expected FACS action-unit set', () => {
    expect(actionUnitPoseMappings.map((pose) => pose.code)).toEqual([
      'AU 0',
      'AU 1',
      'AU 2',
      'AU 4',
      'AU 6',
      'AU 7',
      'AU 12',
      'AU 22',
      'AU 25',
    ]);
  });

  it('resolves provider-specific action-unit blendshape weights', () => {
    const smile = findPoseMappingById('au-12-smile');

    expect(smile?.label).toBe('AU 12 Smile');
    expect(smile && getPoseWeights(smile, 'kinematic-blendshape')).toEqual({
      mouthSmileLeft: 0.9,
      mouthSmileRight: 0.9,
      mouthDimpleLeft: 0.28,
      mouthDimpleRight: 0.28,
      cheekSquintLeft: 0.22,
      cheekSquintRight: 0.22,
    });
  });

  it('builds keyboard pose entries from the swappable mapping data', () => {
    const entries = getKeyboardPoseEntries();

    expect(entries).toHaveLength(keyboardPoseMappings.length);
    expect(entries.map((entry) => entry.key)).toEqual([
      '0',
      'n',
      'a',
      'i',
      't',
      'e',
      'u',
      'v',
      'y',
      's',
      'f',
      'b',
      'm',
      'q',
      'c',
      'p',
    ]);
    expect(entries.find((entry) => entry.key === 's')?.pose.label).toBe(
      'Smile',
    );
  });
});
