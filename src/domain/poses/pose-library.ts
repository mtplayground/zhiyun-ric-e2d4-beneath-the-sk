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
      browInnerUp: 0.85,
    }),
  },
  {
    id: 'au-2-outer-brow-raiser',
    code: 'AU 2',
    label: 'AU 2 Outer Brow Raiser',
    category: 'action-unit',
    description: 'Raises both outer brows.',
    weightsByProvider: weights({
      browOuterUpLeft: 0.78,
      browOuterUpRight: 0.78,
    }),
  },
  {
    id: 'au-4-brow-lowerer',
    code: 'AU 4',
    label: 'AU 4 Brow Lowerer',
    category: 'action-unit',
    description: 'Lowers both brows toward the orbital ridge.',
    weightsByProvider: weights({
      browDownLeft: 0.82,
      browDownRight: 0.82,
    }),
  },
  {
    id: 'au-6-cheek-raiser',
    code: 'AU 6',
    label: 'AU 6 Cheek Raiser',
    category: 'action-unit',
    description: 'Raises the cheeks and subtly tightens the eyes.',
    weightsByProvider: weights({
      cheekSquintLeft: 0.72,
      cheekSquintRight: 0.72,
      eyeSquintLeft: 0.2,
      eyeSquintRight: 0.2,
    }),
  },
  {
    id: 'au-7-lid-tightener',
    code: 'AU 7',
    label: 'AU 7 Lid Tightener',
    category: 'action-unit',
    description: 'Tightens the eyelids without a full blink.',
    weightsByProvider: weights({
      eyeSquintLeft: 0.74,
      eyeSquintRight: 0.74,
    }),
  },
  {
    id: 'au-12-smile',
    code: 'AU 12',
    label: 'AU 12 Smile',
    category: 'action-unit',
    description: 'Pulls mouth corners upward and outward.',
    weightsByProvider: weights({
      mouthSmileLeft: 0.86,
      mouthSmileRight: 0.86,
    }),
  },
  {
    id: 'au-22-lip-funneler',
    code: 'AU 22',
    label: 'AU 22 Lip Funneler',
    category: 'action-unit',
    description: 'Funnels the lips forward.',
    weightsByProvider: weights({
      mouthFunnel: 0.86,
      mouthPucker: 0.28,
    }),
  },
  {
    id: 'au-25-lips-part',
    code: 'AU 25',
    label: 'AU 25 Lips Part',
    category: 'action-unit',
    description: 'Parts the lips through a relaxed jaw opening.',
    weightsByProvider: weights({
      jawOpen: 0.46,
      mouthClose: 0,
    }),
  },
] as const satisfies readonly PoseMapping[];

export const expressionPoseMappings = [
  {
    id: 'expression-smile',
    label: 'Smile',
    category: 'expression',
    keyboardKey: 'S',
    description: 'Symmetric friendly smile with cheek support.',
    weightsByProvider: weights({
      mouthSmileLeft: 0.88,
      mouthSmileRight: 0.88,
      cheekSquintLeft: 0.28,
      cheekSquintRight: 0.28,
    }),
  },
  {
    id: 'expression-frown',
    label: 'Frown',
    category: 'expression',
    keyboardKey: 'F',
    description: 'Downturned mouth corners with lowered brows.',
    weightsByProvider: weights({
      mouthFrownLeft: 0.78,
      mouthFrownRight: 0.78,
      browDownLeft: 0.34,
      browDownRight: 0.34,
    }),
  },
  {
    id: 'expression-brow',
    label: 'Brow',
    category: 'expression',
    keyboardKey: 'B',
    description: 'Brow emphasis combining inner and outer raisers.',
    weightsByProvider: weights({
      browInnerUp: 0.78,
      browOuterUpLeft: 0.55,
      browOuterUpRight: 0.55,
    }),
  },
  {
    id: 'expression-mouth',
    label: 'Mouth',
    category: 'expression',
    keyboardKey: 'M',
    description: 'Open mouth pose for coarse jaw and lip activation.',
    weightsByProvider: weights({
      jawOpen: 0.58,
      mouthUpperUpLeft: 0.2,
      mouthUpperUpRight: 0.2,
      mouthLowerDownLeft: 0.24,
      mouthLowerDownRight: 0.24,
    }),
  },
  {
    id: 'expression-squint',
    label: 'Squint',
    category: 'expression',
    keyboardKey: 'Q',
    description: 'Symmetric lid tightening.',
    weightsByProvider: weights({
      eyeSquintLeft: 0.78,
      eyeSquintRight: 0.78,
    }),
  },
  {
    id: 'expression-cheek',
    label: 'Cheek',
    category: 'expression',
    keyboardKey: 'C',
    description: 'Cheek lift with slight eye narrowing.',
    weightsByProvider: weights({
      cheekSquintLeft: 0.82,
      cheekSquintRight: 0.82,
      eyeSquintLeft: 0.18,
      eyeSquintRight: 0.18,
    }),
  },
  {
    id: 'expression-pucker',
    label: 'Pucker',
    category: 'expression',
    keyboardKey: 'P',
    description: 'Forward rounded lips.',
    weightsByProvider: weights({
      mouthPucker: 0.86,
      mouthFunnel: 0.5,
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
    description: 'Closed alveolar nasal pose.',
    weightsByProvider: weights({
      mouthClose: 0.7,
      jawOpen: 0.08,
    }),
  },
  {
    id: 'phoneme-aa',
    code: 'AA',
    label: 'AA',
    category: 'phoneme',
    description: 'Open vowel with lowered jaw.',
    weightsByProvider: weights({
      jawOpen: 0.72,
      mouthFunnel: 0.12,
    }),
  },
  {
    id: 'phoneme-iy',
    code: 'IY',
    label: 'IY',
    category: 'phoneme',
    description: 'Wide close-front vowel.',
    weightsByProvider: weights({
      jawOpen: 0.2,
      mouthSmileLeft: 0.32,
      mouthSmileRight: 0.32,
      mouthStretchLeft: 0.34,
      mouthStretchRight: 0.34,
    }),
  },
  {
    id: 'phoneme-t',
    code: 'T',
    label: 'T',
    category: 'phoneme',
    description: 'Tongue-forward closed stop pose.',
    weightsByProvider: weights({
      mouthClose: 0.58,
      tongueOut: 0.24,
      jawOpen: 0.06,
    }),
  },
  {
    id: 'phoneme-eh',
    code: 'EH',
    label: 'EH',
    category: 'phoneme',
    description: 'Mid-front vowel with modest jaw opening and stretch.',
    weightsByProvider: weights({
      jawOpen: 0.42,
      mouthStretchLeft: 0.28,
      mouthStretchRight: 0.28,
    }),
  },
  {
    id: 'phoneme-uw',
    code: 'UW',
    label: 'UW',
    category: 'phoneme',
    description: 'Rounded close-back vowel.',
    weightsByProvider: weights({
      mouthPucker: 0.74,
      mouthFunnel: 0.54,
      jawOpen: 0.16,
    }),
  },
  {
    id: 'phoneme-v',
    code: 'V',
    label: 'V',
    category: 'phoneme',
    description: 'Labiodental contact pose.',
    weightsByProvider: weights({
      mouthClose: 0.36,
      mouthLowerDownLeft: 0.22,
      mouthLowerDownRight: 0.22,
      jawOpen: 0.12,
    }),
  },
  {
    id: 'phoneme-y',
    code: 'Y',
    label: 'Y',
    category: 'phoneme',
    description: 'Palatal glide with a narrow smile-like spread.',
    weightsByProvider: weights({
      jawOpen: 0.18,
      mouthSmileLeft: 0.22,
      mouthSmileRight: 0.22,
      mouthStretchLeft: 0.22,
      mouthStretchRight: 0.22,
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
