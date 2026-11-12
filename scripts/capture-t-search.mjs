// Capture the geometry shortlist and neutral/AA controls with the app's real materials.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const report = JSON.parse(await readFile('docs/t-lip-search/results.json', 'utf8'));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
  await page.goto(process.env.T_SEARCH_URL || 'http://127.0.0.1:8080');
  await page.getByText('52 blendshapes', { exact: true }).waitFor({ timeout: 90000 });
  const poses = [{ id: 'neutral', weights: {} }, { id: 'aa', weights: report.aaWeights },
    ...[...new Set([...report.shortlist, ...report.appearanceShortlist, report.closestId])].map(id => ({ id: `candidate-${id}`, weights: report.rows[id].weights }))];
  // Remove only artifacts named by the previous capture, leaving other docs alone.
  const previous = await readFile('docs/t-lip-search/captures.json', 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') return { captures: [] };
    throw error;
  });
  for (const capture of previous.captures) {
    if (!/^captures\/(neutral|aa|candidate-\d+)-(front|profile)\.png$/.test(capture.file)) throw new Error('Unexpected prior capture path');
    await unlink(`docs/t-lip-search/${capture.file}`).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  const hashes = {}, captures = [];
  await mkdir('docs/t-lip-search/captures', { recursive: true });
  for (const pose of poses) for (const view of ['front', 'profile']) {
    const capture = await page.evaluate(async ({ weights, view }) => {
      const path = '/scripts/t-lip-capture-browser.ts';
      return (await import(path)).captureSearchPose(weights, view);
    }, { weights: pose.weights, view });
    const name = `captures/${pose.id}-${view}.png`;
    const bytes = Buffer.from(capture.png.split(',')[1], 'base64');
    await writeFile(`docs/t-lip-search/${name}`, bytes);
    hashes[name] = createHash('sha256').update(bytes).digest('hex');
    captures.push({ id: pose.id, view, file: name, evaluatedWeights: capture.weights, bounds: capture.bounds });
  }
  const metadata = JSON.stringify({ sourceHash: report.sourceHash, captures }, null, 2) + '\n';
  await writeFile('docs/t-lip-search/captures.json', metadata);
  hashes['captures.json'] = createHash('sha256').update(metadata).digest('hex');
  await writeFile('docs/t-lip-search/capture-integrity.json', JSON.stringify(hashes, null, 2) + '\n');
} finally { await browser.close(); }
