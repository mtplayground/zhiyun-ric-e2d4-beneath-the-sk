import {
  deformationProviderIds,
  isDeformationProviderId,
  type DeformationProviderId,
} from '@/domain/providers';

export type FeatureFlags = {
  readoutPanel: boolean;
  deformationCurvePanel: boolean;
  precomputePanel: boolean;
};

export const faceMaterialTransferModes = ['auto', 'projected', 'uv'] as const;

export type FaceMaterialTransferMode =
  (typeof faceMaterialTransferModes)[number];

export type FaceTextureConfig = {
  skinTextureUrl: string;
  eyeTextureUrl: string;
  oralTextureUrl: string;
  skinColor: string;
  faceMaterialTransfer: FaceMaterialTransferMode;
};

export type AppConfig = {
  assets: {
    faceMeshUrl: string;
    poseDataUrl: string;
    textures: FaceTextureConfig;
  };
  deformationProvider: DeformationProviderId;
  features: FeatureFlags;
};

type RawEnv = Pick<
  ImportMetaEnv,
  | 'VITE_FACE_MESH_URL'
  | 'VITE_POSE_DATA_URL'
  | 'VITE_SKIN_TEXTURE_URL'
  | 'VITE_EYE_TEXTURE_URL'
  | 'VITE_ORAL_TEXTURE_URL'
  | 'VITE_SKIN_COLOR'
  | 'VITE_FACE_MATERIAL_TRANSFER'
  | 'VITE_DEFORMATION_PROVIDER'
  | 'VITE_ENABLE_READOUT_PANEL'
  | 'VITE_ENABLE_DEFORMATION_CURVE_PANEL'
  | 'VITE_ENABLE_PRECOMPUTE_PANEL'
>;

const defaultConfig = {
  faceMeshUrl: 'https://threejs.org/examples/models/gltf/facecap.glb',
  poseDataUrl: './data/poses.json',
  skinTextureUrl: './textures/skin-diffuse.png',
  eyeTextureUrl: './textures/eye-diffuse.png',
  oralTextureUrl: './textures/oral-diffuse.png',
  skinColor: '#f1b79f',
  faceMaterialTransfer: 'auto',
  deformationProvider: 'kinematic-blendshape',
  readoutPanel: true,
  deformationCurvePanel: true,
  precomputePanel: true,
} satisfies Record<string, string | boolean>;

function normalizePath(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function parseProvider(value: string | undefined): DeformationProviderId {
  const provider = normalizePath(value, defaultConfig.deformationProvider);

  if (isDeformationProviderId(provider)) {
    return provider;
  }

  throw new Error(
    `Unsupported VITE_DEFORMATION_PROVIDER "${provider}". Expected one of: ${deformationProviderIds.join(
      ', ',
    )}.`,
  );
}

function parseBooleanFlag(
  value: string | undefined,
  fallback: boolean,
  envName: string,
) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(
    `Invalid ${envName} value "${value}". Use true or false in Vite env files.`,
  );
}

function parseSkinColor(value: string | undefined) {
  const color = normalizePath(value, defaultConfig.skinColor);

  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
    return color;
  }

  throw new Error(
    `Invalid VITE_SKIN_COLOR value "${value}". Use a CSS hex color such as #f1b79f.`,
  );
}

function parseFaceMaterialTransfer(
  value: string | undefined,
): FaceMaterialTransferMode {
  const mode = normalizePath(value, defaultConfig.faceMaterialTransfer)
    .trim()
    .toLowerCase();

  if (faceMaterialTransferModes.includes(mode as FaceMaterialTransferMode)) {
    return mode as FaceMaterialTransferMode;
  }

  throw new Error(
    `Unsupported VITE_FACE_MATERIAL_TRANSFER "${value}". Expected one of: ${faceMaterialTransferModes.join(
      ', ',
    )}.`,
  );
}

export function loadAppConfig(env: RawEnv = import.meta.env): AppConfig {
  return {
    assets: {
      faceMeshUrl: normalizePath(
        env.VITE_FACE_MESH_URL,
        defaultConfig.faceMeshUrl,
      ),
      poseDataUrl: normalizePath(
        env.VITE_POSE_DATA_URL,
        defaultConfig.poseDataUrl,
      ),
      textures: {
        skinTextureUrl: normalizePath(
          env.VITE_SKIN_TEXTURE_URL,
          defaultConfig.skinTextureUrl,
        ),
        eyeTextureUrl: normalizePath(
          env.VITE_EYE_TEXTURE_URL,
          defaultConfig.eyeTextureUrl,
        ),
        oralTextureUrl: normalizePath(
          env.VITE_ORAL_TEXTURE_URL,
          defaultConfig.oralTextureUrl,
        ),
        skinColor: parseSkinColor(env.VITE_SKIN_COLOR),
        faceMaterialTransfer: parseFaceMaterialTransfer(
          env.VITE_FACE_MATERIAL_TRANSFER,
        ),
      },
    },
    deformationProvider: parseProvider(env.VITE_DEFORMATION_PROVIDER),
    features: {
      readoutPanel: parseBooleanFlag(
        env.VITE_ENABLE_READOUT_PANEL,
        defaultConfig.readoutPanel,
        'VITE_ENABLE_READOUT_PANEL',
      ),
      deformationCurvePanel: parseBooleanFlag(
        env.VITE_ENABLE_DEFORMATION_CURVE_PANEL,
        defaultConfig.deformationCurvePanel,
        'VITE_ENABLE_DEFORMATION_CURVE_PANEL',
      ),
      precomputePanel: parseBooleanFlag(
        env.VITE_ENABLE_PRECOMPUTE_PANEL,
        defaultConfig.precomputePanel,
        'VITE_ENABLE_PRECOMPUTE_PANEL',
      ),
    },
  };
}

export const appConfig = loadAppConfig();
