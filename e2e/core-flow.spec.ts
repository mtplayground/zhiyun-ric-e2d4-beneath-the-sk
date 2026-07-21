import { expect, test, type Page } from '@playwright/test';

const currentPosePattern = (pose: string) =>
  new RegExp(`Current Pose: ${pose} \\| Frame: \\d+`);

async function expectReadoutPose(page: Page, pose: string) {
  await expect(page.getByText(currentPosePattern(pose))).toBeVisible();
}

test.describe('core control flow', () => {
  test('preset, hotkey, slider, curve, and reset stay in sync', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /Beneath the Skin/i }),
    ).toBeVisible();
    await expect(page.getByText('3D Viewport')).toBeVisible();
    await expect(page.getByText('Live Readout')).toBeVisible();
    await expect(page.getByText('Deformation Curve')).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible();
    await expectReadoutPose(page, 'Neutral');
    await expect(
      page.getByText(/Mode: preset \| Activations: \d+/),
    ).toBeVisible();

    await page
      .getByLabel('Expressions / Emotions')
      .selectOption('expression-smile');
    await expectReadoutPose(page, 'Smile');
    await expect(
      page.getByText(/Mode: preset \| Activations: \d+/),
    ).toBeVisible();
    await expect(
      page.getByText(/Smile \| https:\/\/threejs\.org/),
    ).toBeVisible();
    await expect(page.getByText('Deformation Curve')).toBeVisible();

    await page.getByLabel('Enable keyboard mode').check();
    await expectReadoutPose(page, 'Neutral');
    await expect(
      page.getByText(/Mode: keyboard \| Activations: 0/),
    ).toBeVisible();
    await expect(
      page.getByText('Type: n, a, i, t, e, u, v, y, s, f, b, m, q, c, p, 0'),
    ).toBeVisible();

    await page.keyboard.press('s');
    await expectReadoutPose(page, 'Smile');
    await expect(
      page.getByText(/Mode: keyboard \| Activations: \d+/),
    ).toBeVisible();

    await page
      .getByRole('button', { name: 'Reset to Neutral (Reopen Rest Pose)' })
      .click();
    await expectReadoutPose(page, 'Neutral');
    await expect(
      page.getByText(/Mode: preset \| Activations: 0/),
    ).toBeVisible();

    const smileSlider = page.getByRole('slider', { name: 'AU 12 Smile' });
    await smileSlider.focus();
    for (let step = 0; step < 35; step += 1) {
      await page.keyboard.press('ArrowRight');
    }

    await expectReadoutPose(page, 'Slider Mix');
    await expect(
      page.getByText(/Mode: slider \| Activations: \d+/),
    ).toBeVisible();
    await expect(smileSlider).not.toHaveValue('0');
    await expect(page.getByText('Deformation Curve')).toBeVisible();

    await page
      .getByRole('button', { name: 'Reset to Neutral (Reopen Rest Pose)' })
      .click();
    await expectReadoutPose(page, 'Neutral');
    await expect(
      page.getByText(/Mode: preset \| Activations: 0/),
    ).toBeVisible();
    await expect(smileSlider).toHaveValue('0');
  });
});
