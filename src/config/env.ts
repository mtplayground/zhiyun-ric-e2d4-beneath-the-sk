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

export type AppConfig = {
  assets: {
    faceMeshUrl: string;
    poseDataUrl: string;
  };
  deformationProvider: DeformationProviderId;
  features: FeatureFlags;
};

type RawEnv = Pick<
  ImportMetaEnv,
  | 'VITE_FACE_MESH_URL'
  | 'VITE_POSE_DATA_URL'
  | 'VITE_DEFORMATION_PROVIDER'
  | 'VITE_ENABLE_READOUT_PANEL'
  | 'VITE_ENABLE_DEFORMATION_CURVE_PANEL'
  | 'VITE_ENABLE_PRECOMPUTE_PANEL'
>;

const defaultConfig = {
  faceMeshUrl: 'https://threejs.org/examples/models/gltf/facecap.glb',
  poseDataUrl: '/data/poses.json',
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
