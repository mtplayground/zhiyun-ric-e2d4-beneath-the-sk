import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { Box3, Triangle, Vector3 } from 'three';
import type { measureLipGaps } from './lip-gap-browser-probe';
import { inspectLipSurfaces, triangleDistance, trianglesIntersect } from './lip-surface-geometry';

type Report = Awaited<ReturnType<typeof measureLipGaps>>;
const triangle = (points: number[][]) => new Triangle(...points.map(p => new Vector3(...p)) as [Vector3, Vector3, Vector3]);
const surface = (t: Triangle, ordinal: number) => ({ ordinal, triangle: t, bounds: new Box3().setFromPoints([t.a, t.b, t.c]) });

test('surface geometry catches transverse, coplanar and rotated crossings', () => {
  const a = triangle([[0, 0, 0], [2, 0, 0], [0, 2, 0]]);
  const crossing = triangle([[0.5, 0.5, -1], [0.5, 0.5, 1], [1, 1, 1]]);
  const coplanar = triangle([[0.2, 0.2, 0], [0.8, 0.2, 0], [0.2, 0.8, 0]]);
  const disjoint = triangle([[2, 2, 0], [3, 2, 0], [2, 3, 0]]);
  for (const b of [crossing, coplanar]) {
    expect(trianglesIntersect(a, b)).toBe(true);
    expect(triangleDistance(a, b)).toBe(0);
    const report = inspectLipSurfaces([surface(a, 17)], [surface(b, 42)]);
    expect(report.intersection).toMatchObject({ upper: 17, lower: 42 });
    expect(report.intersection!.positionMetres.every(Number.isFinite)).toBe(true);
    // A vertical-only test cannot give rotation-invariant results.
    const axis = new Vector3(1, 2, 3).normalize();
    const rotate = (t: Triangle) => new Triangle(...[t.a, t.b, t.c].map(v => v.clone().applyAxisAngle(axis, 1.2)) as [Vector3, Vector3, Vector3]);
    expect(trianglesIntersect(rotate(a), rotate(b))).toBe(true);
  }
  expect(trianglesIntersect(a, disjoint)).toBe(false);
  expect(triangleDistance(a, disjoint)).toBeCloseTo(Math.sqrt(2));
});

test('surface clearance measures positive face and edge separation without a crossing allowance', () => {
  const a = triangle([[0, 0, 0], [2, 0, 0], [0, 2, 0]]);
  const b = triangle([[0.2, 0.2, 0.0001], [0.8, 0.2, 0.0001], [0.2, 0.8, 0.0001]]);
  const report = inspectLipSurfaces([surface(a, 1)], [surface(b, 2)]);
  expect(report.intersection).toBeNull();
  expect(report.minimumGapMetres).toBeCloseTo(0.0001, 10);
  const edgeA = triangle([[-2, 0, 0], [2, 0, 0], [0, -2, 0]]);
  const edgeB = triangle([[0, -1, 1], [0, 1, 1], [0, 0, 2]]);
  expect(triangleDistance(edgeA, edgeB)).toBeCloseTo(1, 10);
  expect(() => inspectLipSurfaces([], [surface(b, 2)])).toThrow('Empty lip');
});

test('real FaceCap lip surfaces never intersect for any preset or extreme mouth/jaw slider mix', async ({ page }, testInfo) => {
  await page.goto('/');
  const report = await page.evaluate(async () => {
    // @ts-expect-error Vite serves this dev-only browser module by URL.
    const probe = await import('/e2e/lip-gap-browser-probe.ts');
    return probe.measureLipGaps();
  }) as Report;
  await testInfo.attach('lip-surfaces.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  if (process.env.LIP_GAP_REPORT) {
    await writeFile(process.env.LIP_GAP_REPORT, JSON.stringify(report, null, 2) + '\n');
  }
  const baseline: Report | undefined = process.env.LIP_GAP_BASELINE
    ? JSON.parse(await readFile(process.env.LIP_GAP_BASELINE, 'utf8')) : undefined;
  if (baseline) {
    expect(baseline.sourceHash, 'Comparison requires identical FaceCap bytes').toBe(report.sourceHash);
    expect(baseline.regions, 'Comparison requires identical neutral lip triangles').toEqual(report.regions);
    expect(baseline.minimumOpenGapMetres).toBe(report.minimumOpenGapMetres);
    expect(baseline.results.map(row => row.id)).toEqual(report.results.map(row => row.id));
  }
  expect(report.regions.upper.length).toBeGreaterThan(20);
  expect(report.regions.lower.length).toBeGreaterThan(20);
  expect(report.regions.upper.filter(id => (report.regions.lower as readonly number[]).includes(id))).toEqual([]);
  expect(report.results.find(row => row.id === 'phoneme-t')?.requiredGapMetres).toBeGreaterThan(0);
  expect(report.results.length).toBeGreaterThan(0);
  for (const row of report.results) {
    const hit = row.intersection;
    const message = `${row.label} (${row.id}): ${hit
      ? `upper triangle ${hit.upper} intersects lower triangle ${hit.lower} near world metres (${hit.positionMetres.map(v => v.toFixed(6)).join(', ')})`
      : `minimum surface gap ${(row.minimumGapMetres * 1000).toFixed(4)} mm; required ${row.requiredGapMetres * 1000} mm`}`;
    expect.soft(hit, message).toBeNull();
    expect.soft(Number.isFinite(row.minimumGapMetres), message).toBe(true);
    expect.soft(row.minimumGapMetres, message).toBeGreaterThanOrEqual(row.requiredGapMetres);
  }
});
