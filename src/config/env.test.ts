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
    });
  });

  it('parses texture overrides, skin tint, and transfer mode', () => {
    const config = loadAppConfig({
      VITE_SKIN_TEXTURE_URL: '/textures/custom-skin.png',
      VITE_EYE_TEXTURE_URL: '/textures/custom-eye.png',
      VITE_ORAL_TEXTURE_URL: '/textures/custom-oral.png',
      VITE_SKIN_COLOR: '#d8a48f',
      VITE_FACE_MATERIAL_TRANSFER: 'uv',
    });

    expect(config.assets.textures).toMatchObject({
      skinTextureUrl: '/textures/custom-skin.png',
      eyeTextureUrl: '/textures/custom-eye.png',
      oralTextureUrl: '/textures/custom-oral.png',
      skinColor: '#d8a48f',
      faceMaterialTransfer: 'uv',
    });
  });

  it('rejects unsupported face material transfer modes', () => {
    expect(() =>
      loadAppConfig({ VITE_FACE_MATERIAL_TRANSFER: 'planar' }),
    ).toThrow(/Unsupported VITE_FACE_MATERIAL_TRANSFER/);
  });
});
