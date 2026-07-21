import { describe, expect, it } from 'vitest';

import { loadAppConfig } from './env';

describe('loadAppConfig texture settings', () => {
  it('falls back to committed texture defaults and auto transfer mode', () => {
    const config = loadAppConfig({});

    expect(config.assets.textures).toEqual({
      skinTextureUrl: './textures/skin-diffuse.png',
      eyeTextureUrl: './textures/eye-diffuse.png',
      oralTextureUrl: './textures/oral-diffuse.png',
      skinColor: '#f1b79f',
      faceMaterialTransfer: 'auto',
      projectionAlignment: {
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        rotationYDegrees: 0,
      },
    });
    expect(config.assets.hairMeshUrl).toBeNull();
  });

  it('parses texture overrides, skin tint, transfer mode, and projection alignment', () => {
    const config = loadAppConfig({
      VITE_SKIN_TEXTURE_URL: '/textures/custom-skin.png',
      VITE_HAIR_MESH_URL: '/models/hair.glb',
      VITE_EYE_TEXTURE_URL: '/textures/custom-eye.png',
      VITE_ORAL_TEXTURE_URL: '/textures/custom-oral.png',
      VITE_SKIN_COLOR: '#d8a48f',
      VITE_FACE_MATERIAL_TRANSFER: 'uv',
      VITE_SKIN_PROJECTION_OFFSET_X: '0.04',
      VITE_SKIN_PROJECTION_OFFSET_Y: '-0.02',
      VITE_SKIN_PROJECTION_SCALE: '1.08',
      VITE_SKIN_PROJECTION_ROTATION_Y: '7.5',
    });

    expect(config.assets.textures).toMatchObject({
      skinTextureUrl: '/textures/custom-skin.png',
      eyeTextureUrl: '/textures/custom-eye.png',
      oralTextureUrl: '/textures/custom-oral.png',
      skinColor: '#d8a48f',
      faceMaterialTransfer: 'uv',
      projectionAlignment: {
        offsetX: 0.04,
        offsetY: -0.02,
        scale: 1.08,
        rotationYDegrees: 7.5,
      },
    });
    expect(config.assets.hairMeshUrl).toBe('/models/hair.glb');
  });

  it('rejects unsupported face material transfer modes', () => {
    expect(() =>
      loadAppConfig({ VITE_FACE_MATERIAL_TRANSFER: 'planar' }),
    ).toThrow(/Unsupported VITE_FACE_MATERIAL_TRANSFER/);
  });

  it('keeps projection alignment controls hidden by default', () => {
    expect(loadAppConfig({}).features.projectionAlignmentPanel).toBe(false);
    expect(
      loadAppConfig({ VITE_ENABLE_PROJECTION_ALIGNMENT_PANEL: 'true' }).features
        .projectionAlignmentPanel,
    ).toBe(true);
  });
});
