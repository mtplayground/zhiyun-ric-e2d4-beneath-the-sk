import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('current T is the reviewed search candidate and meets real FaceCap geometry limits', async ({ page }) => {
  const selection = JSON.parse(await readFile('docs/t-lip-search/selection.json', 'utf8'));
  const report = JSON.parse(await readFile('docs/t-lip-search/results.json', 'utf8'));
  const selected = report.rows[selection.selectedId];
  expect(selection.appearance).toEqual({ slightlyParted: true, upperTeethJustVisible: true, clearlyDifferentFromAA: true });
  expect(selected.rejections).toEqual([]);
  await page.goto('/');
  const actual = await page.evaluate(async () => {
    const path = '/scripts/t-lip-search-browser.ts';
    return (await import(/* @vite-ignore */ path)).measureCurrentT();
  });
  expect(actual.sourceHash).toBe(selection.sourceHash);
  expect(actual.result.weights).toEqual(selection.weights);
  expect({ ...actual.result, id: selection.selectedId }).toEqual(selected);
  expect(actual.result.rejections).toEqual([]);
  expect(actual.result.intersection).toBeNull();
  for (const gap of actual.result.centralGapsMetres) expect(gap).toBeGreaterThanOrEqual(0.002);
  expect(actual.result.upperForwardExtentMinusLowerMetres).toBeLessThanOrEqual(actual.neutral.upperForwardExtentMinusLowerMetres);
  // The PNG review documents appearance; numerical assertions do not certify it.
});
