// Measurement evidence only. The Playwright/Vitest suites remain publisher work.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8080');
  const report = await page.evaluate(async () => {
    const path = '/e2e/lip-gap-browser-probe.ts';
    return (await import(path)).measureLipGaps();
  });
  await mkdir('docs/lip-suite', { recursive: true });
  const bytes = JSON.stringify(report, null, 2) + '\n';
  await writeFile('docs/lip-suite/measurements.json', bytes);
  await writeFile('docs/lip-suite/integrity.json', JSON.stringify({ 'measurements.json': createHash('sha256').update(bytes).digest('hex') }, null, 2) + '\n');
  console.log(JSON.stringify(report.results.filter(row => row.intersection || row.minimumGapMetres < row.requiredGapMetres || row.upperForwardExtentMinusLowerMetres > report.neutralOverhangMetres).map(row => ({ id: row.id, gap: row.minimumGapMetres, overhang: row.upperForwardExtentMinusLowerMetres, required: row.requiredGapMetres, weights: row.weights })), null, 2));
} finally { await browser.close(); }
