// Uses the same browser search/kernel as T. Produces reviewable data, never source edits.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const compositions = process.argv.includes('--compositions');
const measured = JSON.parse(await readFile(process.env.LIP_REPAIR_INPUT || 'docs/lip-suite/before.json'));
const requested = process.argv.slice(2).filter(arg => arg !== '--compositions');
const ids = measured.results.filter(row => !requested.length || requested.includes(row.id)).filter(row => !row.id.startsWith('slider-') &&
  (row.intersection || row.minimumGapMetres < row.requiredGapMetres || row.upperForwardExtentMinusLowerMetres > measured.neutralOverhangMetres)).map(row => ({ id: row.id, requiredGapMetres: row.requiredGapMetres, originalWeights: row.weights }));
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(); await page.goto('http://127.0.0.1:8080');
  const data = compositions ? JSON.parse(await readFile('docs/lip-suite/repairs.json')).repairs : ids;
  const report = await page.evaluate(async ({ data, compositions }) => {
    const path = '/scripts/t-lip-search-browser.ts';
    const search = await import(path);
    return compositions ? search.searchActionCompositions(data) : search.searchPresetRepairs(data);
  }, { data, compositions });
  await writeFile(process.env.LIP_REPAIRS_REPORT || (compositions ? 'docs/lip-suite/composition-repairs.json' : 'docs/lip-suite/repairs.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(compositions ? JSON.stringify({ selected: report.selected, tried: report.tried.length }, null, 2) : JSON.stringify(report.repairs.map(r => ({ id: r.id, trials: r.trials.length, selected: r.selected && { weights: r.selected.weights, gap: r.selected.minimumGapMetres, overhang: r.selected.upperForwardExtentMinusLowerMetres } })), null, 2));
} finally { await browser.close(); }
