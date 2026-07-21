import {
  deformationProviderIds,
  isDeformationProviderId,
  type DeformationProviderId,
} from '@/domain/providers';

export type FeatureFlags = {
  readoutPanel: boolean;
  deformationCurvePanel: boolean;
  precomputePanel: boolean;
  projectionAlignmentPanel: boolean;
};

export const faceMaterialTransferModes = ['auto', 'projected', 'uv'] as const;

export type FaceMaterialTransferMode =
  (typeof faceMaterialTransferModes)[number];

export type ProjectionAlignmentConfig = {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotationYDegrees: number;
};

export type FaceTextureConfig = {
  skinTextureUrl: string;
  eyeTextureUrl: string;
  oralTextureUrl: string;
  skinColor: string;
  faceMaterialTransfer: FaceMaterialTransferMode;
  projectionAlignment: ProjectionAlignmentConfig;
};

export type AppConfig = {
  assets: {
    faceMeshUrl: string;
    hairMeshUrl: string | null;
    poseDataUrl: string;
    textures: FaceTextureConfig;
  };
  deformationProvider: DeformationProviderId;
  features: FeatureFlags;
};

type RawEnv = Pick<
  ImportMetaEnv,
  | 'VITE_FACE_MESH_URL'
  | 'VITE_HAIR_MESH_URL'
  | 'VITE_POSE_DATA_URL'
  | 'VITE_SKIN_TEXTURE_URL'
  | 'VITE_EYE_TEXTURE_URL'
  | 'VITE_ORAL_TEXTURE_URL'
  | 'VITE_SKIN_COLOR'
  | 'VITE_FACE_MATERIAL_TRANSFER'
  | 'VITE_SKIN_PROJECTION_OFFSET_X'
  | 'VITE_SKIN_PROJECTION_OFFSET_Y'
  | 'VITE_SKIN_PROJECTION_SCALE'
  | 'VITE_SKIN_PROJECTION_ROTATION_Y'
  | 'VITE_DEFORMATION_PROVIDER'
  | 'VITE_ENABLE_READOUT_PANEL'
  | 'VITE_ENABLE_DEFORMATION_CURVE_PANEL'
  | 'VITE_ENABLE_PRECOMPUTE_PANEL'
  | 'VITE_ENABLE_PROJECTION_ALIGNMENT_PANEL'
>;

const defaultConfig = {
  faceMeshUrl: 'https://threejs.org/examples/models/gltf/facecap.glb',
  hairMeshUrl: '',
  poseDataUrl: './data/poses.json',
  skinTextureUrl: './textures/skin-diffuse.png',
  eyeTextureUrl: './textures/eye-diffuse.png',
  oralTextureUrl: './textures/oral-diffuse.png',
  skinColor: '#f1b79f',
  faceMaterialTransfer: 'auto',
  skinProjectionOffsetX: 0,
  skinProjectionOffsetY: 0,
  skinProjectionScale: 1,
  skinProjectionRotationY: 0,
  deformationProvider: 'kinematic-blendshape',
  readoutPanel: true,
  deformationCurvePanel: true,
  precomputePanel: true,
  projectionAlignmentPanel: false,
} satisfies Record<string, string | number | boolean>;

function normalizePath(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizeOptionalPath(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
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

function parseNumberSetting({
  value,
  fallback,
  envName,
  min,
  max,
}: {
  value: string | undefined;
  fallback: number;
  envName: string;
  min: number;
  max: number;
}) {
  const normalized = value?.trim();

  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `Invalid ${envName} value "${value}". Use a number from ${min} to ${max}.`,
    );
  }

  return parsed;
}

export function loadAppConfig(env: RawEnv = import.meta.env): AppConfig {
  return {
    assets: {
      faceMeshUrl: normalizePath(
        env.VITE_FACE_MESH_URL,
        defaultConfig.faceMeshUrl,
      ),
      hairMeshUrl: normalizeOptionalPath(env.VITE_HAIR_MESH_URL),
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
        projectionAlignment: {
          offsetX: parseNumberSetting({
            value: env.VITE_SKIN_PROJECTION_OFFSET_X,
            fallback: defaultConfig.skinProjectionOffsetX,
            envName: 'VITE_SKIN_PROJECTION_OFFSET_X',
            min: -0.5,
            max: 0.5,
          }),
          offsetY: parseNumberSetting({
            value: env.VITE_SKIN_PROJECTION_OFFSET_Y,
            fallback: defaultConfig.skinProjectionOffsetY,
            envName: 'VITE_SKIN_PROJECTION_OFFSET_Y',
            min: -0.5,
            max: 0.5,
          }),
          scale: parseNumberSetting({
            value: env.VITE_SKIN_PROJECTION_SCALE,
            fallback: defaultConfig.skinProjectionScale,
            envName: 'VITE_SKIN_PROJECTION_SCALE',
            min: 0.25,
            max: 4,
          }),
          rotationYDegrees: parseNumberSetting({
            value: env.VITE_SKIN_PROJECTION_ROTATION_Y,
            fallback: defaultConfig.skinProjectionRotationY,
            envName: 'VITE_SKIN_PROJECTION_ROTATION_Y',
            min: -180,
            max: 180,
          }),
        },
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
      projectionAlignmentPanel: parseBooleanFlag(
        env.VITE_ENABLE_PROJECTION_ALIGNMENT_PANEL,
        defaultConfig.projectionAlignmentPanel,
        'VITE_ENABLE_PROJECTION_ALIGNMENT_PANEL',
      ),
    },
  };
}

export const appConfig = loadAppConfig();
