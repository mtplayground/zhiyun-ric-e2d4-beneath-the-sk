// Data capture, not a test runner. Start npm run dev first.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const archivedWeights = process.argv.includes('--archived')
  ? JSON.parse(await readFile('docs/lip-profile/measurements.json', 'utf8')).results.find(row => row.id === 'phoneme-t').weights
  : undefined;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(process.env.LIP_PROFILE_URL || 'http://127.0.0.1:8080');
  const capture = await page.evaluate(async weights => {
    const path = '/e2e/lip-profile-measurement.ts';
    return (await import(path)).captureLipProfiles(weights);
  }, archivedWeights);
  await mkdir('docs/lip-profile', { recursive: true });
  const hashes = {};
  for (const { id, svg } of capture.images) {
    const name = `${id}.svg`;
    await writeFile(`docs/lip-profile/${name}`, svg);
    hashes[name] = createHash('sha256').update(svg).digest('hex');
  }
  const report = JSON.stringify(capture.report, null, 2) + '\n';
  await writeFile('docs/lip-profile/measurements.json', report);
  hashes['measurements.json'] = createHash('sha256').update(report).digest('hex');
  await writeFile('docs/lip-profile/integrity.json', JSON.stringify(hashes, null, 2) + '\n');
} finally { await browser.close(); }
