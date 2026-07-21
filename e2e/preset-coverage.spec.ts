import { expect, test, type Locator, type Page } from '@playwright/test';

import { resolveMorphTargetName } from '../src/domain/poses/morph-target-aliases';
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

type ExpectedActivation = {
  resolvedName: string;
  value: number;
};

const referenceMeshMorphTargets = [
  'browDown_L',
  'browDown_R',
  'browInnerUp',
  'browOuterUp_L',
  'browOuterUp_R',
  'cheekPuff',
  'cheekSquint_L',
  'cheekSquint_R',
  'eyeBlink_L',
  'eyeBlink_R',
  'eyeLookDown_L',
  'eyeLookDown_R',
  'eyeLookIn_L',
  'eyeLookIn_R',
  'eyeLookOut_L',
  'eyeLookOut_R',
  'eyeLookUp_L',
  'eyeLookUp_R',
  'eyeSquint_L',
  'eyeSquint_R',
  'eyeWide_L',
  'eyeWide_R',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimple_L',
  'mouthDimple_R',
  'mouthFrown_L',
  'mouthFrown_R',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDown_L',
  'mouthLowerDown_R',
  'mouthPress_L',
  'mouthPress_R',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmile_L',
  'mouthSmile_R',
  'mouthStretch_L',
  'mouthStretch_R',
  'mouthUpperUp_L',
  'mouthUpperUp_R',
  'noseSneer_L',
  'noseSneer_R',
  'tongueOut',
] as const;

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

function getExpectedActivations(pose: PoseMapping) {
  const providerWeights = pose.weightsByProvider['kinematic-blendshape'] ?? {};

  return Object.entries(providerWeights)
    .filter(([, value]) => value > 0)
    .map(([requestedName, value]) => {
      const resolvedName = resolveMorphTargetName({
        requestedName,
        availableBlendshapes: referenceMeshMorphTargets,
      });

      expect(
        resolvedName,
        `${pose.label} should resolve ${requestedName} against the default mesh`,
      ).not.toBeNull();

      return { resolvedName: resolvedName as string, value };
    })
    .sort((left, right) => {
      const valueSort = right.value - left.value;

      if (valueSort !== 0) {
        return valueSort;
      }

      return left.resolvedName.localeCompare(right.resolvedName);
    });
}

function getLiveReadout(page: Page) {
  return page.locator('section[data-slot="data-panel"]', {
    has: page.getByRole('heading', { name: 'Live Readout' }),
  });
}

async function expectReadoutPose(page: Page, pose: string) {
  await expect(page.getByText(currentPosePattern(pose))).toBeVisible({
    timeout: 10_000,
  });
}

async function expectActivationNames(
  liveReadout: Locator,
  expectedActivations: readonly ExpectedActivation[],
) {
  for (const activation of expectedActivations) {
    await expect(
      liveReadout.locator('span').filter({ hasText: activation.resolvedName }),
    ).toBeVisible({ timeout: 10_000 });
  }
}

async function expectActivationCoverage(page: Page, pose: PoseMapping) {
  const liveReadout = getLiveReadout(page);
  const expectedActivations = getExpectedActivations(pose);
  const expectedCount = expectedActivations.length;

  await expect(
    page.getByText(
      new RegExp(
        `Preset audit: ${expectedCount} active / 0 missing / 0 unsupported`,
      ),
    ),
  ).toBeVisible({ timeout: 10_000 });

  if (expectedCount > 0) {
    await expect(
      liveReadout.getByText(/Mode: preset \| Activations: [1-9]\d*/),
    ).toBeVisible({ timeout: 10_000 });
    await expectActivationNames(liveReadout, expectedActivations.slice(0, 1));
    await expect(liveReadout.getByText('Neutral', { exact: true })).toHaveCount(
      0,
    );
    return expectedCount;
  }

  await expect(
    liveReadout.getByText(/Mode: preset \| Activations: 0/),
  ).toBeVisible({
    timeout: 10_000,
  });
  await expect(liveReadout.getByText('Neutral', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(liveReadout.getByText('0.00', { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  return expectedCount;
}

async function resetToNeutral(page: Page) {
  const liveReadout = getLiveReadout(page);

  await page
    .getByRole('button', { name: 'Reset to Neutral (Reopen Rest Pose)' })
    .click();
  await expectReadoutPose(page, 'Neutral');
  await expect(
    liveReadout.getByText(/Mode: preset \| Activations: 0/),
  ).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByText(/Preset audit: 0 active \/ 0 missing \/ 0 unsupported/),
  ).toBeVisible({ timeout: 10_000 });
  await expect(liveReadout.getByText('Neutral', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(liveReadout.getByText('0.00', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('preset coverage', () => {
  test('every phoneme, expression, and action-unit preset changes visible activation telemetry and resets', async ({
    page,
  }) => {
    test.setTimeout(120_000);
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
        const activationCount = await expectActivationCoverage(page, pose);

        if (!pose.label.toLowerCase().includes('neutral')) {
          expect(
            activationCount,
            `${group.dropdownLabel} preset ${pose.label} should visibly activate at least one default-mesh blendshape`,
          ).toBeGreaterThan(0);
        }

        await resetToNeutral(page);
      }
    }
  });
});
