import { expect, test } from '@playwright/test';

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
