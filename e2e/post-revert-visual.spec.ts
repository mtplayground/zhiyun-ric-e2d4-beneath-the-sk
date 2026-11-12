import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });

const authorOrder = 'Zhiyun Peng, Michael Tao, Eugene Fiume';

const removedViewportDiagnostics = [
  /hair/i,
  /tongue/i,
  /texture/i,
  /projection/i,
  /material slots/i,
  /transfer mode/i,
];

test.describe('post-revert viewport verification', () => {
  test('renders the default face pipeline without removed viewport layers or diagnostics', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /Beneath the Skin/i }),
    ).toBeVisible();
    await expect(page.getByText(authorOrder).first()).toBeVisible();
    await expect(
      page.getByText(`${authorOrder}. Beneath the Skin.`),
    ).toBeVisible();
    await expect(
      page.getByText(
        `Beneath the Skin research project by ${authorOrder}. Interactive dashboard interface for facial deformation inspection and telemetry review.`,
      ),
    ).toBeVisible();

    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByText(/52 blendshapes/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Provider Health/)).toBeVisible();
    await expect(
      page.getByText(
        'Library audit: 23 supported / 0 partial / 0 unsupported',
        { exact: true },
      ),
    ).toBeVisible({
      timeout: 15_000,
    });

    for (const removedDiagnostic of removedViewportDiagnostics) {
      await expect(page.getByText(removedDiagnostic)).toHaveCount(0);
    }

    await expect(page.getByText(/unable to load/i)).toHaveCount(0);
    await expect(page.getByText(/error/i)).toHaveCount(0);
  });
});

test('T matches the parted-lip front and profile references', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('52 blendshapes', { exact: true })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('combobox', { name: /^Phoneme/ }).selectOption('phoneme-t');
  await expect(page.getByText(/Current Pose: T \| Frame: \d+/)).toBeVisible();
  // Wait for the actual morph weights to settle, not just the dropdown/readout.
  const poseProbe = '/e2e/physics-browser-probe.ts';
  await expect.poll(() => page.evaluate(async path =>
    (await import(/* @vite-ignore */ path)).poseReady('phoneme-t'), poseProbe)).toBe(true);
  for (const view of ['front', 'profile'] as const) {
    const camera = await page.evaluate(async viewName => {
      const path = '/e2e/lip-visual-browser-probe.ts';
      return (await import(/* @vite-ignore */ path)).setLipCaptureView(viewName);
    }, view);
    expect(camera.canvasWidth).toBeGreaterThan(0);
    expect(camera.canvasHeight).toBeGreaterThan(0);
    expect(camera.direction[view === 'profile' ? 0 : 2]).toBeCloseTo(1, 5);
    await expect(page.locator('canvas').first()).toHaveScreenshot(`phoneme-t-${view}.png`, {
      threshold: 0.15, maxDiffPixels: 100, animations: 'disabled', scale: 'css',
      style: '[data-testid="three-viewport"] > .absolute { visibility: hidden !important; }',
    });
    await testInfo.attach(`phoneme-t-${view}`, {
      body: await page.locator('canvas').first().screenshot({ style: '[data-testid="three-viewport"] > .absolute { visibility: hidden !important; }' }), contentType: 'image/png',
    });
  }
});
