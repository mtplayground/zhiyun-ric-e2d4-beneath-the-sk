export type MorphTargetAliasMap = Record<string, readonly string[]>;

function snakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sideAliases(name: string) {
  const match = name.match(/^(.*?)(Left|Right)$/);

  if (!match) {
    return [];
  }

  const [, base, side] = match;
  const sideLong = side.toLowerCase();
  const sideShort = side === 'Left' ? 'L' : 'R';
  const snakeBase = snakeCase(base);

  return [
    `${base}_${sideShort}`,
    `${base}${sideShort}`,
    `${base}.${sideLong}`,
    `${base}.${sideShort.toLowerCase()}`,
    `${snakeBase}_${sideLong}`,
    `${snakeBase}_${sideShort.toLowerCase()}`,
    `${sideShort}_${base}`,
    `${sideShort.toLowerCase()}_${snakeBase}`,
    `${titleCase(base)}_${sideShort}`,
    `${titleCase(base)}${sideShort}`,
  ];
}

function generatedAliases(name: string) {
  const snakeName = snakeCase(name);

  return [
    name,
    titleCase(name),
    name.toLowerCase(),
    snakeName,
    snakeName.toUpperCase(),
    name.replace(/([a-z0-9])([A-Z])/g, '$1.$2').toLowerCase(),
    ...sideAliases(name),
  ];
}

export const morphTargetAliasMap = {
  browInnerUp: ['brow_inner_up', 'BrowInnerUp', 'browUpCenter'],
  browOuterUpLeft: ['browOuterUp_L', 'brow_outer_up_l', 'BrowOuterUp_L'],
  browOuterUpRight: ['browOuterUp_R', 'brow_outer_up_r', 'BrowOuterUp_R'],
  browDownLeft: ['browDown_L', 'brow_down_l', 'BrowDown_L'],
  browDownRight: ['browDown_R', 'brow_down_r', 'BrowDown_R'],
  cheekSquintLeft: ['cheekSquint_L', 'cheek_squint_l', 'CheekSquint_L'],
  cheekSquintRight: ['cheekSquint_R', 'cheek_squint_r', 'CheekSquint_R'],
  eyeSquintLeft: ['eyeSquint_L', 'eye_squint_l', 'EyeSquint_L'],
  eyeSquintRight: ['eyeSquint_R', 'eye_squint_r', 'EyeSquint_R'],
  jawOpen: ['jaw_open', 'JawOpen', 'Jaw_Open', 'mouthOpen', 'mouth_open'],
  mouthClose: ['mouth_close', 'MouthClose', 'Mouth_Close'],
  mouthFrownLeft: ['mouthFrown_L', 'mouth_frown_l', 'MouthFrown_L'],
  mouthFrownRight: ['mouthFrown_R', 'mouth_frown_r', 'MouthFrown_R'],
  mouthDimpleLeft: ['mouthDimple_L', 'mouth_dimple_l', 'MouthDimple_L'],
  mouthDimpleRight: ['mouthDimple_R', 'mouth_dimple_r', 'MouthDimple_R'],
  mouthFunnel: ['mouth_funnel', 'MouthFunnel', 'Mouth_Funnel'],
  mouthLowerDownLeft: [
    'mouthLowerDown_L',
    'mouth_lower_down_l',
    'MouthLowerDown_L',
  ],
  mouthLowerDownRight: [
    'mouthLowerDown_R',
    'mouth_lower_down_r',
    'MouthLowerDown_R',
  ],
  mouthPucker: ['mouth_pucker', 'MouthPucker', 'Mouth_Pucker'],
  mouthPressLeft: ['mouthPress_L', 'mouth_press_l', 'MouthPress_L'],
  mouthPressRight: ['mouthPress_R', 'mouth_press_r', 'MouthPress_R'],
  mouthSmileLeft: ['mouthSmile_L', 'mouth_smile_l', 'MouthSmile_L'],
  mouthSmileRight: ['mouthSmile_R', 'mouth_smile_r', 'MouthSmile_R'],
  mouthStretchLeft: ['mouthStretch_L', 'mouth_stretch_l', 'MouthStretch_L'],
  mouthStretchRight: ['mouthStretch_R', 'mouth_stretch_r', 'MouthStretch_R'],
  mouthUpperUpLeft: ['mouthUpperUp_L', 'mouth_upper_up_l', 'MouthUpperUp_L'],
  mouthUpperUpRight: ['mouthUpperUp_R', 'mouth_upper_up_r', 'MouthUpperUp_R'],
  tongueOut: ['tongue_out', 'TongueOut', 'Tongue_Out'],
} as const satisfies MorphTargetAliasMap;

export function normalizeMorphTargetName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getMorphTargetAliasCandidates(name: string) {
  return [
    ...new Set([
      ...generatedAliases(name),
      ...((morphTargetAliasMap as MorphTargetAliasMap)[name] ?? []),
    ]),
  ];
}

export function createMorphTargetNameResolver(
  availableBlendshapes: readonly string[] | ReadonlySet<string>,
) {
  const available = [...availableBlendshapes].filter(
    (name) => name.trim().length > 0,
  );
  const exactAvailable = new Set(available);
  const normalizedAvailable = new Map<string, string>();

  available.forEach((name) => {
    const normalizedName = normalizeMorphTargetName(name);

    if (!normalizedAvailable.has(normalizedName)) {
      normalizedAvailable.set(normalizedName, name);
    }
  });

  return (requestedName: string) => {
    if (exactAvailable.has(requestedName)) {
      return requestedName;
    }

    for (const candidate of getMorphTargetAliasCandidates(requestedName)) {
      if (exactAvailable.has(candidate)) {
        return candidate;
      }

      const normalizedMatch = normalizedAvailable.get(
        normalizeMorphTargetName(candidate),
      );

      if (normalizedMatch) {
        return normalizedMatch;
      }
    }

    return null;
  };
}

export function resolveMorphTargetName({
  requestedName,
  availableBlendshapes,
}: {
  requestedName: string;
  availableBlendshapes: readonly string[] | ReadonlySet<string>;
}) {
  return createMorphTargetNameResolver(availableBlendshapes)(requestedName);
}
