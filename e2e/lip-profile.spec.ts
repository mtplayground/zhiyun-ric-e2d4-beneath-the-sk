import { expect, test } from '@playwright/test';
import { Box3, Triangle, Vector3 } from 'three';
import { clipLipSlab, profileMetrics } from './lip-profile-measurement';

const surface = (vertices: number[][], ordinal = 1) => {
  const triangle = new Triangle(...vertices.map(v => new Vector3(...v)) as [Vector3, Vector3, Vector3]);
  return { ordinal, triangle, bounds: new Box3().setFromPoints([triangle.a, triangle.b, triangle.c]) };
};

test('side overlap and forward overhang do not imply a 3D intersection', () => {
  const upper = surface([[1, 0, 0], [1, 1, 0], [1, 0, 1]]);
  const lower = surface([[-1, 0, -0.2], [-1, 1, -0.2], [-1, 0, 0.8]], 2);
  const report = profileMetrics([upper], [lower]);
  expect(report.intersection).toBeNull();
  expect(report.minimumGapMetres).toBeCloseTo(2);
  expect(report.upperForwardExtentMinusLowerMetres).toBeCloseTo(0.2);
  expect(report.sideProjectionOverlaps).toBe(true);
});

test('regional clipping retains crossing triangles and preserves source ordinals', () => {
  const row = surface([[-2, 0, 0], [2, 0, 0], [0, 2, 0]], 17);
  const clipped = clipLipSlab([row], -0.5, 0.5);
  expect(clipped.length).toBeGreaterThan(0);
  for (const t of clipped) {
    expect(t.ordinal).toBe(17);
    expect(t.bounds.min.x).toBeGreaterThanOrEqual(-0.5);
    expect(t.bounds.max.x).toBeLessThanOrEqual(0.5);
  }
  expect(clipLipSlab([row], 3, 4)).toEqual([]);
});

test('real profile capture reproduces the archived pose measurements and both images', async ({ page }) => {
  const { readFile } = await import('node:fs/promises');
  const baseline = JSON.parse(await readFile('docs/lip-profile/measurements.json', 'utf8'));
  await page.goto('/');
  const capture = await page.evaluate(async weights => {
    const path = '/e2e/lip-profile-measurement.ts';
    return (await import(/* @vite-ignore */ path)).captureLipProfiles(weights);
  }, baseline.results.find((row: { id: string }) => row.id === 'phoneme-t').weights);
  expect(capture.report).toEqual(baseline);
  for (const image of capture.images) {
    expect(image.svg).toBe(await readFile(`docs/lip-profile/${image.id}.svg`, 'utf8'));
  }
});
