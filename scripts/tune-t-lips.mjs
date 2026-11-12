// Run with the Vite dev server running. This searches/captures data, not tests.
// It deliberately cannot write pose-library.ts: appearance review is mandatory.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(process.env.T_SEARCH_URL || 'http://127.0.0.1:8080');
  const report = await page.evaluate(async () => {
    const path = '/scripts/t-lip-search-browser.ts';
    return (await import(path)).searchTWeights();
  });
  const bytes = JSON.stringify(report, null, 2) + '\n';
  await mkdir('docs/t-lip-search', { recursive: true });
  await writeFile('docs/t-lip-search/results.json', bytes);
  const hashes = { 'results.json': createHash('sha256').update(bytes).digest('hex') };
  const selectionBytes = await readFile('docs/t-lip-search/selection.json').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (selectionBytes) {
    const selection = JSON.parse(selectionBytes);
    const selected = report.rows[selection.selectedId];
    if (selection.sourceHash === report.sourceHash && selected && !selected.rejections.length &&
        JSON.stringify(selected.weights) === JSON.stringify(selection.weights)) {
      hashes['selection.json'] = createHash('sha256').update(selectionBytes).digest('hex');
    } else {
      await unlink('docs/t-lip-search/selection.json');
      console.log('Previous selection invalidated: repeat appearance review. Pose library was not rewritten.');
    }
  }
  await writeFile('docs/t-lip-search/integrity.json', JSON.stringify(hashes, null, 2) + '\n');
  console.log(JSON.stringify({ tried: report.tried, geometryFeasible: report.geometryFeasible, shortlist: report.shortlist, closest: report.rows[report.closestId] }, null, 2));
} finally { await browser.close(); }
