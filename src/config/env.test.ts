import { describe, expect, it } from 'vitest';

import { loadAppConfig } from './env';

describe('loadAppConfig', () => {
  it('falls back to the default mesh, pose data, provider, and feature flags', () => {
    const config = loadAppConfig({});

    expect(config).toEqual({
      assets: {
        faceMeshUrl: 'https://threejs.org/examples/models/gltf/facecap.glb',
        poseDataUrl: './data/poses.json',
      },
      deformationProvider: 'kinematic-blendshape',
      features: {
        readoutPanel: true,
        deformationCurvePanel: true,
        precomputePanel: true,
      },
    });
  });

  it('parses retained asset and feature overrides', () => {
    const config = loadAppConfig({
      VITE_FACE_MESH_URL: '/models/face.glb',
      VITE_POSE_DATA_URL: '/data/custom-poses.json',
      VITE_DEFORMATION_PROVIDER: 'kinematic-blendshape',
      VITE_ENABLE_READOUT_PANEL: 'false',
      VITE_ENABLE_DEFORMATION_CURVE_PANEL: '0',
      VITE_ENABLE_PRECOMPUTE_PANEL: 'yes',
    });

    expect(config.assets).toEqual({
      faceMeshUrl: '/models/face.glb',
      poseDataUrl: '/data/custom-poses.json',
    });
    expect(config.deformationProvider).toBe('kinematic-blendshape');
    expect(config.features).toEqual({
      readoutPanel: false,
      deformationCurvePanel: false,
      precomputePanel: true,
    });
  });

  it('does not expose removed texture, projection, and hair settings', () => {
    const config = loadAppConfig({ VITE_FACE_MESH_URL: '/models/face.glb' });

    expect(config.assets).toEqual({
      faceMeshUrl: '/models/face.glb',
      poseDataUrl: './data/poses.json',
    });
    expect(config.features).not.toHaveProperty('projectionAlignmentPanel');
    expect(config.assets).not.toHaveProperty('textures');
    expect(config.assets).not.toHaveProperty('hairMeshUrl');
  });

  it('rejects unsupported deformation providers', () => {
    expect(() =>
      loadAppConfig({ VITE_DEFORMATION_PROVIDER: 'texture-transfer' }),
    ).toThrow(/Unsupported VITE_DEFORMATION_PROVIDER/);
  });

  it('rejects invalid retained boolean flags', () => {
    expect(() =>
      loadAppConfig({ VITE_ENABLE_PRECOMPUTE_PANEL: 'sometimes' }),
    ).toThrow(/Invalid VITE_ENABLE_PRECOMPUTE_PANEL/);
  });
});
