import { describe, expect, it } from 'vitest';
import { computePosedSurfacePositions } from './pose-target-mapper';

describe('CPU morph surface calculation shared by physics and lip checks', () => {
  it.each([true, false])('handles relative=%s morphs with aliases and clamping', relative => {
    const positions = [1, 2, 3, 4, 5, 6];
    const delta = [0, -2, 1, 0, -4, 2];
    const surface = {
      positions,
      morphTargetsRelative: relative,
      morphTargets: { jaw_open: relative ? delta : delta.map((v, i) => v + positions[i]) },
    };
    expect(Array.from(computePosedSurfacePositions(surface, {}))).toEqual(positions);
    expect(Array.from(computePosedSurfacePositions(surface, { jawOpen: 0.5 })))
      .toEqual([1, 1, 3.5, 4, 3, 7]);
    expect(Array.from(computePosedSurfacePositions(surface, { jawOpen: 2, jaw_open: 0.5 })))
      .toEqual([1, 0, 4, 4, 1, 8]);
    expect(surface.positions).toEqual(positions);
  });

  it('rejects malformed targets and non-finite geometry', () => {
    expect(() => computePosedSurfacePositions({ positions: [0, 0, 0], morphTargetsRelative: true,
      morphTargets: { jawOpen: [0] } }, { jawOpen: 1 })).toThrow('Invalid morph target');
    expect(() => computePosedSurfacePositions({ positions: [NaN, 0, 0], morphTargetsRelative: true,
      morphTargets: {} }, {})).toThrow('Non-finite posed surface');
  });
});
