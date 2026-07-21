import type {
  BlendshapeWeights,
  DeformationProviderId,
} from '@/domain/providers';

export type PoseCategory = 'action-unit' | 'expression' | 'phoneme';

export type ProviderPoseWeights = Partial<
  Record<DeformationProviderId | 'default', BlendshapeWeights>
>;

export type PoseMapping = {
  id: string;
  label: string;
  category: PoseCategory;
  description: string;
  weightsByProvider: ProviderPoseWeights;
  code?: string;
  keyboardKey?: string;
};

export type PoseLibrary = {
  actionUnits: readonly PoseMapping[];
  expressions: readonly PoseMapping[];
  phonemes: readonly PoseMapping[];
};

export type KeyboardPoseMapping = {
  key: string;
  label: string;
  poseId: string;
};

export type KeyboardPoseEntry = {
  key: string;
  label: string;
  pose: PoseMapping;
};

const kinematicProviderId =
  'kinematic-blendshape' satisfies DeformationProviderId;

function weights(blendshapeWeights: BlendshapeWeights): ProviderPoseWeights {
  return {
    default: blendshapeWeights,
    [kinematicProviderId]: blendshapeWeights,
  };
}

export const actionUnitPoseMappings = [
  {
    id: 'au-0-neutral',
    code: 'AU 0',
    label: 'AU 0 Neutral',
    category: 'action-unit',
    description: 'Rest pose with all tracked blendshape activations cleared.',
    weightsByProvider: weights({}),
  },
  {
    id: 'au-1-inner-brow-raiser',
    code: 'AU 1',
    label: 'AU 1 Inner Brow Raiser',
    category: 'action-unit',
    description: 'Raises the inner brows using ARKit-style browInnerUp weight.',
    weightsByProvider: weights({
      browInnerUp: 0.92,
    }),
  },
  {
    id: 'au-2-outer-brow-raiser',
    code: 'AU 2',
    label: 'AU 2 Outer Brow Raiser',
    category: 'action-unit',
    description: 'Raises both outer brows.',
    weightsByProvider: weights({
      browOuterUpLeft: 0.86,
      browOuterUpRight: 0.86,
    }),
  },
  {
    id: 'au-4-brow-lowerer',
    code: 'AU 4',
    label: 'AU 4 Brow Lowerer',
    category: 'action-unit',
    description: 'Lowers both brows toward the orbital ridge.',
    weightsByProvider: weights({
      browDownLeft: 0.9,
      browDownRight: 0.9,
    }),
  },
  {
    id: 'au-6-cheek-raiser',
    code: 'AU 6',
    label: 'AU 6 Cheek Raiser',
    category: 'action-unit',
    description: 'Raises the cheeks and subtly tightens the eyes.',
    weightsByProvider: weights({
      cheekSquintLeft: 0.86,
      cheekSquintRight: 0.86,
      eyeSquintLeft: 0.32,
      eyeSquintRight: 0.32,
    }),
  },
  {
    id: 'au-7-lid-tightener',
    code: 'AU 7',
    label: 'AU 7 Lid Tightener',
    category: 'action-unit',
    description: 'Tightens the eyelids without a full blink.',
    weightsByProvider: weights({
      eyeSquintLeft: 0.9,
      eyeSquintRight: 0.9,
      cheekSquintLeft: 0.18,
      cheekSquintRight: 0.18,
    }),
  },
  {
    id: 'au-12-smile',
    code: 'AU 12',
    label: 'AU 12 Smile',
    category: 'action-unit',
    description: 'Pulls mouth corners upward and outward with cheek support.',
    weightsByProvider: weights({
      mouthSmileLeft: 0.9,
      mouthSmileRight: 0.9,
      mouthDimpleLeft: 0.28,
      mouthDimpleRight: 0.28,
      cheekSquintLeft: 0.22,
      cheekSquintRight: 0.22,
    }),
  },
  {
    id: 'au-22-lip-funneler',
    code: 'AU 22',
    label: 'AU 22 Lip Funneler',
    category: 'action-unit',
    description: 'Funnels the lips forward.',
    weightsByProvider: weights({
      mouthFunnel: 0.94,
      mouthPucker: 0.4,
      jawOpen: 0.08,
    }),
  },
  {
    id: 'au-25-lips-part',
    code: 'AU 25',
    label: 'AU 25 Lips Part',
    category: 'action-unit',
    description: 'Parts the lips through a relaxed jaw opening.',
    weightsByProvider: weights({
      jawOpen: 0.58,
      mouthFunnel: 0.08,
    }),
  },
] as const satisfies readonly PoseMapping[];

export const expressionPoseMappings = [
  {
    id: 'expression-smile',
    label: 'Smile',
    category: 'expression',
    keyboardKey: 'S',
    description:
      'Unmistakable smile with raised lip corners, dimples, and cheek support.',
    weightsByProvider: weights({
      mouthSmileLeft: 1,
      mouthSmileRight: 1,
      mouthDimpleLeft: 0.46,
      mouthDimpleRight: 0.46,
      cheekSquintLeft: 0.74,
      cheekSquintRight: 0.74,
      eyeSquintLeft: 0.36,
      eyeSquintRight: 0.36,
    }),
  },
  {
    id: 'expression-frown',
    label: 'Frown',
    category: 'expression',
    keyboardKey: 'F',
    description: 'Downturned mouth corners with lowered brows.',
    weightsByProvider: weights({
      mouthFrownLeft: 0.9,
      mouthFrownRight: 0.9,
      browDownLeft: 0.52,
      browDownRight: 0.52,
      jawOpen: 0.08,
    }),
  },
  {
    id: 'expression-brow',
    label: 'Brow',
    category: 'expression',
    keyboardKey: 'B',
    description: 'Brow emphasis combining inner and outer raisers.',
    weightsByProvider: weights({
      browInnerUp: 0.94,
      browOuterUpLeft: 0.72,
      browOuterUpRight: 0.72,
    }),
  },
  {
    id: 'expression-mouth',
    label: 'Mouth',
    category: 'expression',
    keyboardKey: 'M',
    description: 'Open mouth pose for coarse jaw and lip activation.',
    weightsByProvider: weights({
      jawOpen: 0.76,
      mouthUpperUpLeft: 0.34,
      mouthUpperUpRight: 0.34,
      mouthLowerDownLeft: 0.38,
      mouthLowerDownRight: 0.38,
      mouthFunnel: 0.12,
    }),
  },
  {
    id: 'expression-squint',
    label: 'Squint',
    category: 'expression',
    keyboardKey: 'Q',
    description: 'Symmetric lid tightening.',
    weightsByProvider: weights({
      eyeSquintLeft: 0.94,
      eyeSquintRight: 0.94,
      cheekSquintLeft: 0.24,
      cheekSquintRight: 0.24,
      browDownLeft: 0.18,
      browDownRight: 0.18,
    }),
  },
  {
    id: 'expression-cheek',
    label: 'Cheek',
    category: 'expression',
    keyboardKey: 'C',
    description: 'Cheek lift with slight eye narrowing.',
    weightsByProvider: weights({
      cheekSquintLeft: 0.94,
      cheekSquintRight: 0.94,
      eyeSquintLeft: 0.34,
      eyeSquintRight: 0.34,
      mouthSmileLeft: 0.14,
      mouthSmileRight: 0.14,
    }),
  },
  {
    id: 'expression-pucker',
    label: 'Pucker',
    category: 'expression',
    keyboardKey: 'P',
    description: 'Forward rounded lips.',
    weightsByProvider: weights({
      mouthPucker: 0.98,
      mouthFunnel: 0.76,
      jawOpen: 0.12,
    }),
  },
] as const satisfies readonly PoseMapping[];

export const phonemePoseMappings = [
  {
    id: 'phoneme-neutral',
    code: 'neutral',
    label: 'neutral',
    category: 'phoneme',
    description: 'Silence/rest phoneme with neutral activation.',
    weightsByProvider: weights({}),
  },
  {
    id: 'phoneme-n',
    code: 'N',
    label: 'N',
    category: 'phoneme',
    description:
      'Visible nasal closure with lip compression and rounded mouth shaping.',
    weightsByProvider: weights({
      mouthPressLeft: 0.58,
      mouthPressRight: 0.58,
      mouthPucker: 0.36,
      mouthFunnel: 0.3,
      jawOpen: 0.18,
      mouthClose: 0.24,
    }),
  },
  {
    id: 'phoneme-aa',
    code: 'AA',
    label: 'AA',
    category: 'phoneme',
    description: 'Open vowel with lowered jaw.',
    weightsByProvider: weights({
      jawOpen: 0.9,
      mouthFunnel: 0.18,
      mouthLowerDownLeft: 0.18,
      mouthLowerDownRight: 0.18,
    }),
  },
  {
    id: 'phoneme-iy',
    code: 'IY',
    label: 'IY',
    category: 'phoneme',
    description: 'Wide close-front vowel.',
    weightsByProvider: weights({
      jawOpen: 0.26,
      mouthSmileLeft: 0.42,
      mouthSmileRight: 0.42,
      mouthStretchLeft: 0.58,
      mouthStretchRight: 0.58,
      cheekSquintLeft: 0.12,
      cheekSquintRight: 0.12,
    }),
  },
  {
    id: 'phoneme-t',
    code: 'T',
    label: 'T',
    category: 'phoneme',
    description:
      'Dental stop pose using firm lip closure and subtle jaw/lip shaping.',
    weightsByProvider: weights({
      mouthClose: 0.72,
      jawOpen: 0.16,
      mouthFunnel: 0.08,
      mouthUpperUpLeft: 0.22,
      mouthUpperUpRight: 0.22,
      mouthLowerDownLeft: 0.12,
      mouthLowerDownRight: 0.12,
    }),
  },
  {
    id: 'phoneme-eh',
    code: 'EH',
    label: 'EH',
    category: 'phoneme',
    description: 'Mid-front vowel with modest jaw opening and stretch.',
    weightsByProvider: weights({
      jawOpen: 0.56,
      mouthStretchLeft: 0.42,
      mouthStretchRight: 0.42,
      mouthSmileLeft: 0.14,
      mouthSmileRight: 0.14,
    }),
  },
  {
    id: 'phoneme-uw',
    code: 'UW',
    label: 'UW',
    category: 'phoneme',
    description: 'Rounded close-back vowel.',
    weightsByProvider: weights({
      mouthPucker: 0.92,
      mouthFunnel: 0.72,
      jawOpen: 0.24,
      mouthClose: 0.12,
    }),
  },
  {
    id: 'phoneme-v',
    code: 'V',
    label: 'V',
    category: 'phoneme',
    description: 'Labiodental contact pose.',
    weightsByProvider: weights({
      mouthClose: 0.5,
      mouthLowerDownLeft: 0.38,
      mouthLowerDownRight: 0.38,
      jawOpen: 0.18,
      mouthFunnel: 0.12,
    }),
  },
  {
    id: 'phoneme-y',
    code: 'Y',
    label: 'Y',
    category: 'phoneme',
    description: 'Palatal glide with a narrow smile-like spread.',
    weightsByProvider: weights({
      jawOpen: 0.24,
      mouthSmileLeft: 0.34,
      mouthSmileRight: 0.34,
      mouthStretchLeft: 0.38,
      mouthStretchRight: 0.38,
      cheekSquintLeft: 0.12,
      cheekSquintRight: 0.12,
    }),
  },
] as const satisfies readonly PoseMapping[];

export const poseLibrary = {
  actionUnits: actionUnitPoseMappings,
  expressions: expressionPoseMappings,
  phonemes: phonemePoseMappings,
} as const satisfies PoseLibrary;

export const allPoseMappings = [
  ...poseLibrary.actionUnits,
  ...poseLibrary.expressions,
  ...poseLibrary.phonemes,
] as const satisfies readonly PoseMapping[];

export function getPoseWeights(
  pose: PoseMapping,
  providerId: DeformationProviderId,
): BlendshapeWeights {
  return {
    ...(pose.weightsByProvider.default ?? {}),
    ...(pose.weightsByProvider[providerId] ?? {}),
  };
}

export function findPoseMappingById(poseId: string) {
  return allPoseMappings.find((pose) => pose.id === poseId) ?? null;
}

export const keyboardPoseMappings = [
  { key: '0', label: 'Neu', poseId: 'au-0-neutral' },
  { key: 'n', label: 'N', poseId: 'phoneme-n' },
  { key: 'a', label: 'AA', poseId: 'phoneme-aa' },
  { key: 'i', label: 'IY', poseId: 'phoneme-iy' },
  { key: 't', label: 'T', poseId: 'phoneme-t' },
  { key: 'e', label: 'EH', poseId: 'phoneme-eh' },
  { key: 'u', label: 'UW', poseId: 'phoneme-uw' },
  { key: 'v', label: 'V', poseId: 'phoneme-v' },
  { key: 'y', label: 'Y', poseId: 'phoneme-y' },
  { key: 's', label: 'Smile', poseId: 'expression-smile' },
  { key: 'f', label: 'Frown', poseId: 'expression-frown' },
  { key: 'b', label: 'Brow', poseId: 'expression-brow' },
  { key: 'm', label: 'Mouth', poseId: 'expression-mouth' },
  { key: 'q', label: 'Squint', poseId: 'expression-squint' },
  { key: 'c', label: 'Cheek', poseId: 'expression-cheek' },
  { key: 'p', label: 'Pucker', poseId: 'expression-pucker' },
] as const satisfies readonly KeyboardPoseMapping[];

function requirePoseMapping(poseId: string) {
  const pose = findPoseMappingById(poseId);

  if (!pose) {
    throw new Error(`Missing pose mapping for ${poseId}.`);
  }

  return pose;
}

export function getKeyboardPoseEntries(): readonly KeyboardPoseEntry[] {
  return keyboardPoseMappings.map(({ key, label, poseId }) => ({
    key,
    label,
    pose: requirePoseMapping(poseId),
  }));
}
