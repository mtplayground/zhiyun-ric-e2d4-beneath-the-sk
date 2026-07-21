import { useEffect, useState } from 'react';
import {
  Box3,
  Color,
  Mesh,
  Object3D,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  type Material,
  type MeshStandardMaterial,
  type WebGLRenderer,
} from 'three';
import {
  GLTFLoader,
  type GLTF,
} from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import type { FaceTextureConfig } from '@/config/env';

export type HeadAssetStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type LoadedHeadAsset = {
  scene: Object3D;
  morphTargetNames: string[];
  applyBlendshapeWeights: (weights: Record<string, number>) => void;
  readBlendshapeWeights: () => Record<string, number>;
};

export type HeadAssetState = {
  status: HeadAssetStatus;
  progress: number;
  asset: LoadedHeadAsset | null;
  errorMessage: string | null;
};

const emptyHeadAssetState: HeadAssetState = {
  status: 'idle',
  progress: 0,
  asset: null,
  errorMessage: null,
};
const basisTranscoderPath = 'https://threejs.org/examples/jsm/libs/basis/';
const defaultSkinColor = '#f1b79f';

type LoadedFaceTextures = {
  skin: Texture | null;
  eye: Texture | null;
  oral: Texture | null;
};

type MorphTargetBinding = {
  dictionary: Record<string, number>;
  influences: number[];
};

function isMorphTargetMesh(object: Object3D): object is Mesh {
  const candidate = object as Mesh;
  return (
    Array.isArray(candidate.morphTargetInfluences) &&
    candidate.morphTargetDictionary !== undefined
  );
}

function isMeshStandardMaterial(
  material: Material,
): material is MeshStandardMaterial {
  return 'roughness' in material && 'metalness' in material;
}

function forEachMaterial(
  material: Material | Material[],
  callback: (material: Material) => void,
) {
  if (Array.isArray(material)) {
    material.forEach(callback);
    return;
  }

  callback(material);
}

function clampInfluence(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function materialIntent(object: Object3D, material: Material) {
  const searchable = `${object.name} ${material.name}`.toLowerCase();

  if (
    /\b(eye|iris|sclera|cornea|pupil)\b/.test(searchable) ||
    searchable.includes('eyeball')
  ) {
    return 'eye';
  }

  if (
    /\b(oral|mouth|teeth|tooth|gum|palate|tongue)\b/.test(searchable) ||
    searchable.includes('cavity')
  ) {
    return 'oral';
  }

  return 'skin';
}

function applyMaterialTexture(
  object: Object3D,
  material: Material,
  textures: LoadedFaceTextures,
  textureConfig?: FaceTextureConfig,
) {
  material.needsUpdate = true;

  if (!isMeshStandardMaterial(material)) {
    return;
  }

  const intent = materialIntent(object, material);
  const texture =
    intent === 'eye'
      ? textures.eye
      : intent === 'oral'
        ? textures.oral
        : textures.skin;

  material.color = new Color(
    intent === 'skin'
      ? (textureConfig?.skinColor ?? defaultSkinColor)
      : '#ffffff',
  );
  material.roughness = Math.max(material.roughness, texture ? 0.56 : 0.48);
  material.metalness = Math.min(material.metalness, 0.08);

  if (texture) {
    material.map = texture;
  }
}

function prepareNeutralHeadAsset(
  gltf: GLTF,
  textures: LoadedFaceTextures,
  textureConfig?: FaceTextureConfig,
): LoadedHeadAsset {
  const morphTargetNames = new Set<string>();
  const morphTargetBindings: MorphTargetBinding[] = [];

  gltf.scene.traverse((object) => {
    if (!isMorphTargetMesh(object)) {
      return;
    }

    object.morphTargetInfluences?.fill(0);

    if (object.morphTargetInfluences) {
      morphTargetBindings.push({
        dictionary: object.morphTargetDictionary ?? {},
        influences: object.morphTargetInfluences,
      });
    }

    Object.keys(object.morphTargetDictionary ?? {}).forEach((name) => {
      morphTargetNames.add(name);
    });

    forEachMaterial(object.material, (material) =>
      applyMaterialTexture(object, material, textures, textureConfig),
    );
  });

  const box = new Box3().setFromObject(gltf.scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.35 / maxDimension;

  gltf.scene.scale.setScalar(scale);
  gltf.scene.position.set(
    -center.x * scale,
    -center.y * scale,
    -center.z * scale,
  );
  gltf.scene.rotation.set(0, 0, 0);
  gltf.scene.updateMatrixWorld(true);

  return {
    scene: gltf.scene,
    morphTargetNames: [...morphTargetNames].sort((a, b) => a.localeCompare(b)),
    applyBlendshapeWeights: (weights) => {
      morphTargetBindings.forEach(({ dictionary, influences }) => {
        Object.entries(dictionary).forEach(([name, index]) => {
          influences[index] = clampInfluence(weights[name] ?? 0);
        });
      });
    },
    readBlendshapeWeights: () => {
      const weights = new Map<string, number>();

      morphTargetBindings.forEach(({ dictionary, influences }) => {
        Object.entries(dictionary).forEach(([name, index]) => {
          const value = clampInfluence(influences[index] ?? 0);
          const current = weights.get(name) ?? 0;
          weights.set(name, Math.max(current, value));
        });
      });

      return Object.fromEntries(
        [...weights.entries()]
          .filter(([, value]) => value > 0.0001)
          .sort(([left], [right]) => left.localeCompare(right)),
      );
    },
  };
}

function messageFromError(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unable to load the configured glTF face mesh.';
}

function loadTextureOrFallback(
  loader: TextureLoader,
  url: string,
  label: string,
): Promise<Texture | null> {
  const normalizedUrl = url.trim();

  if (!normalizedUrl) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    loader.load(
      normalizedUrl,
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.flipY = false;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      (error) => {
        console.warn(
          `[texture] ${label} diffuse map failed to load; using procedural material fallback.`,
          error,
        );
        resolve(null);
      },
    );
  });
}

async function loadFaceTextures(
  textureConfig?: FaceTextureConfig,
): Promise<LoadedFaceTextures> {
  if (!textureConfig) {
    return {
      skin: null,
      eye: null,
      oral: null,
    };
  }

  const loader = new TextureLoader();
  const [skin, eye, oral] = await Promise.all([
    loadTextureOrFallback(loader, textureConfig.skinTextureUrl, 'skin'),
    loadTextureOrFallback(loader, textureConfig.eyeTextureUrl, 'eye'),
    loadTextureOrFallback(loader, textureConfig.oralTextureUrl, 'oral'),
  ]);

  return { skin, eye, oral };
}

export function useGltfHeadAsset(
  assetUrl: string,
  renderer: WebGLRenderer,
  textureConfig?: FaceTextureConfig,
): HeadAssetState {
  const [state, setState] = useState<HeadAssetState>(emptyHeadAssetState);

  useEffect(() => {
    const normalizedAssetUrl = assetUrl.trim();

    if (!normalizedAssetUrl) {
      setState({
        status: 'error',
        progress: 0,
        asset: null,
        errorMessage: 'VITE_FACE_MESH_URL is empty.',
      });
      return;
    }

    let disposed = false;
    const ktx2Loader = new KTX2Loader()
      .setTranscoderPath(basisTranscoderPath)
      .detectSupport(renderer);
    const loader = new GLTFLoader();
    loader.setKTX2Loader(ktx2Loader);
    loader.setMeshoptDecoder(MeshoptDecoder);

    setState({
      status: 'loading',
      progress: 0,
      asset: null,
      errorMessage: null,
    });

    const textureLoadPromise = loadFaceTextures(textureConfig);

    loader.load(
      normalizedAssetUrl,
      async (gltf) => {
        if (disposed) {
          return;
        }

        try {
          const textures = await textureLoadPromise;

          if (disposed) {
            return;
          }

          const asset = prepareNeutralHeadAsset(gltf, textures, textureConfig);

          setState({
            status: 'loaded',
            progress: 1,
            asset,
            errorMessage:
              asset.morphTargetNames.length > 0
                ? null
                : 'Loaded mesh has no morph targets.',
          });
        } catch (error) {
          setState({
            status: 'error',
            progress: 0,
            asset: null,
            errorMessage: messageFromError(error),
          });
        }
      },
      (event) => {
        if (disposed) {
          return;
        }

        const progress =
          event.lengthComputable && event.total > 0
            ? Math.min(0.98, event.loaded / event.total)
            : 0.2;

        setState((current) => ({
          ...current,
          status: 'loading',
          progress,
        }));
      },
      (error) => {
        if (disposed) {
          return;
        }

        setState({
          status: 'error',
          progress: 0,
          asset: null,
          errorMessage: messageFromError(error),
        });
      },
    );

    return () => {
      disposed = true;
      ktx2Loader.dispose();
    };
  }, [assetUrl, renderer, textureConfig]);

  return state;
}
