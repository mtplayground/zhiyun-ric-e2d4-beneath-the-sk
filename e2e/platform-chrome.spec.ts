import { expect, test } from '@playwright/test';

test('watermark is unique, links to Ideavibes and copies the current URL', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
  await page.goto('/');
  const watermark = page.locator('#mctai-watermark');
  await expect(watermark).toHaveCount(1);
  await expect(watermark.getByRole('link', { name: 'Built by Ideavibes.ai' })).toHaveAttribute('href', 'https://ideavibes.ai');
  await watermark.getByRole('button', { name: 'Share' }).click();
  await expect(watermark.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  await expect(page.locator('#mctai-preview-banner, [data-mctai-preview-banner]')).toHaveCount(0);
});
