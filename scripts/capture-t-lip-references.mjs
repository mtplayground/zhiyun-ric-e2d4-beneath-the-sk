// Explicit reference capture, not a snapshot test/update run. Review PNGs before accepting changes.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = 'e2e/post-revert-visual.spec.ts-snapshots';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const captures = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8080');
  await page.getByText('52 blendshapes', { exact: true }).waitFor({ timeout: 90000 });
  await page.getByRole('combobox', { name: /^Phoneme/ }).selectOption('phoneme-t');
  await page.waitForFunction(async () => {
    const path = '/e2e/physics-browser-probe.ts';
    return (await import(path)).poseReady('phoneme-t');
  }, undefined, { timeout: 30000 });
  for (const view of ['front', 'profile']) {
    const camera = await page.evaluate(async view => {
      const path = '/e2e/lip-visual-browser-probe.ts';
      return (await import(path)).setLipCaptureView(view);
    }, view);
    captures.push({ view, camera, bytes: await page.locator('canvas').first().screenshot({ animations: 'disabled', scale: 'css', style: '[data-testid="three-viewport"] > .absolute { visibility: hidden !important; }' }) });
  }
} finally { await browser.close(); }
await mkdir(directory, { recursive: true });
const hashes = {};
for (const capture of captures) {
  const name = `phoneme-t-${capture.view}-chromium-linux.png`;
  await writeFile(`${directory}/${name}`, capture.bytes);
  hashes[name] = createHash('sha256').update(capture.bytes).digest('hex');
}
await writeFile(`${directory}/integrity.json`, JSON.stringify({
  sourceHash: '6bfce6d0fcbb5839f5102b79733007859fef7c5df6d9eb49e2264542810b5f64',
  viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1,
  threshold: 0.15, maxDiffPixels: 100, hashes,
  cameras: captures.map(({ view, camera }) => ({ view, ...camera })),
}, null, 2) + '\n');
