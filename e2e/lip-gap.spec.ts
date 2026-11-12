import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import type { measureLipGaps } from './lip-gap-browser-probe';

type Report = Awaited<ReturnType<typeof measureLipGaps>>;

test('real FaceCap lip gaps for every preset and extreme mouth/jaw slider mix', async ({ page }, testInfo) => {
  await page.goto('/');
  const report = await page.evaluate(async () => {
    // @ts-expect-error Vite serves this dev-only browser module by URL.
    const probe = await import('/e2e/lip-gap-browser-probe.ts');
    return probe.measureLipGaps();
  }) as Report;
  await testInfo.attach('lip-gaps.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  // Export before assertions so a failing main run still produces a baseline.
  if (process.env.LIP_GAP_REPORT) {
    await writeFile(process.env.LIP_GAP_REPORT, JSON.stringify(report, null, 2) + '\n');
  }
  const baseline: Report | undefined = process.env.LIP_GAP_BASELINE
    ? JSON.parse(await readFile(process.env.LIP_GAP_BASELINE, 'utf8')) : undefined;
  if (baseline) {
    expect(baseline.sourceHash, 'Comparison requires identical FaceCap bytes').toBe(report.sourceHash);
    expect(baseline.pairs, 'Comparison requires identical lip landmarks').toEqual(report.pairs);
    expect(baseline.toleranceMetres).toBe(report.toleranceMetres);
    expect(baseline.results.map(row => row.id)).toEqual(report.results.map(row => row.id));
  }
  const minimum = (row: Report['results'][number]) => Math.min(...row.gaps.map(gap => gap.metres));
  const status = (gap: number) => gap >= -report.toleranceMetres ? 'PASS' : 'FAIL';
  const lines = [
    `FaceCap SHA-256: ${report.sourceHash}. Tolerance: ${report.toleranceMetres * 1000} mm.`,
    '',
    '| Preset / slider mix | main minimum gap (mm) | experiment minimum gap (mm) | main → experiment |',
    '| --- | ---: | ---: | --- |',
    ...report.results.map(row => {
      const previous = baseline?.results.find(candidate => candidate.id === row.id);
      const current = minimum(row), before = previous ? minimum(previous) : undefined;
      return `| ${row.label} (${row.id}) | ${before === undefined ? 'not supplied' : (before * 1000).toFixed(4)} | ${(current * 1000).toFixed(4)} | ${before === undefined ? 'not run' : status(before)} → ${status(current)} |`;
    }),
  ];
  await testInfo.attach('lip-gap-comparison.md', { body: lines.join('\n'), contentType: 'text/markdown' });
  expect(report.results.length).toBeGreaterThan(0);
  expect(report.pairs.length).toBeGreaterThanOrEqual(5);
  for (const row of report.results) {
    for (const gap of row.gaps) {
      const message = `${row.label} (${row.id}), ${gap.position}: upper-minus-lower gap ${gap.metres * 1000} mm`;
      expect.soft(Number.isFinite(gap.metres), message).toBe(true);
      expect.soft(gap.metres, message).toBeGreaterThanOrEqual(-report.toleranceMetres);
    }
  }
});
