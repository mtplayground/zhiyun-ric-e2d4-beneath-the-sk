import { expect, test, type Page } from '@playwright/test';

import {
  actionUnitPoseMappings,
  expressionPoseMappings,
  phonemePoseMappings,
  type PoseMapping,
} from '../src/domain/poses/pose-library';

type PresetGroup = {
  dropdownLabel: string;
  poses: readonly PoseMapping[];
};

const presetGroups: PresetGroup[] = [
  {
    dropdownLabel: 'Phoneme',
    poses: phonemePoseMappings,
  },
  {
    dropdownLabel: 'FACS Action Unit',
    poses: actionUnitPoseMappings,
  },
  {
    dropdownLabel: 'Expressions / Emotions',
    poses: expressionPoseMappings,
  },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function currentPosePattern(pose: string) {
  return new RegExp(`Current Pose: ${escapeRegExp(pose)} \\| Frame: \\d+`);
}

async function expectReadoutPose(page: Page, pose: string) {
  await expect(page.getByText(currentPosePattern(pose))).toBeVisible({
    timeout: 10_000,
  });
}

async function expectActivationCoverage(page: Page, pose: PoseMapping) {
  const supportedWeightCount = Object.values(
    pose.weightsByProvider['kinematic-blendshape'] ?? {},
  ).filter((value) => value > 0).length;

  await expect(page.getByText(/Mode: preset \| Activations: \d+/)).toBeVisible({
    timeout: 10_000,
  });

  if (supportedWeightCount > 0) {
    await expect(page.getByText(/Preset audit: [1-9]\d* active/)).toBeVisible({
      timeout: 10_000,
    });
    return;
  }

  await expect(page.getByText(/Preset audit: 0 active/)).toBeVisible({
    timeout: 10_000,
  });
}

async function resetToNeutral(page: Page) {
  await page
    .getByRole('button', { name: 'Reset to Neutral (Reopen Rest Pose)' })
    .click();
  await expectReadoutPose(page, 'Neutral');
  await expect(page.getByText(/Mode: preset \| Activations: 0/)).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('preset coverage', () => {
  test('every phoneme, expression, and action-unit preset updates readout and resets', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /Beneath the Skin/i }),
    ).toBeVisible();
    await expectReadoutPose(page, 'Neutral');

    for (const group of presetGroups) {
      const dropdown = page.getByLabel(group.dropdownLabel);

      for (const pose of group.poses) {
        await dropdown.selectOption(pose.id);
        await expectReadoutPose(page, pose.label);
        await expectActivationCoverage(page, pose);
        await resetToNeutral(page);
      }
    }
  });
});
