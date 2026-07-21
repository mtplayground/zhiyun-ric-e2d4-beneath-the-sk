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

import { applyProjectedSkinTransfer } from './projected-skin-transfer';

export type HeadAssetStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type LoadedHeadAsset = {
  scene: Object3D;
  morphTargetNames: string[];
  textureDiagnostic: TextureTransferDiagnostic | null;
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

type FaceMaterialIntent = 'skin' | 'eye' | 'oral';
type SkinTransferMode = 'uv' | 'projected' | 'procedural';

export type TextureTransferDiagnostic = {
  requestedMode: FaceTextureConfig['faceMaterialTransfer'];
  selectedSkinMode: SkinTransferMode;
  skinSlots: string[];
  directSkinSlots: string[];
  projectedSkinMeshCount: number;
  eyeSlots: string[];
  oralSlots: string[];
  skippedSlots: string[];
  mismatchedSlots: string[];
};

type MorphTargetBinding = {
  dictionary: Record<string, number>;
  influences: number[];
};

type MaterialSlot = {
  mesh: Mesh;
  material: Material;
  intent: FaceMaterialIntent;
  label: string;
  hasUv: boolean;
  isStandardMaterial: boolean;
  directSkinCandidate: boolean;
};

function isMorphTargetMesh(object: Object3D): object is Mesh {
  const candidate = object as Mesh;
  return (
    Array.isArray(candidate.morphTargetInfluences) &&
    candidate.morphTargetDictionary !== undefined
  );
}

function isRenderableMesh(object: Object3D): object is Mesh {
  const candidate = object as Mesh;
  return candidate.isMesh === true && candidate.geometry !== undefined;
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

function materialIntent(
  object: Object3D,
  material: Material,
): FaceMaterialIntent {
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

function slotLabel(object: Object3D, material: Material) {
  return `${object.name || 'unnamed mesh'} / ${material.name || 'unnamed material'}`;
}

function isDirectSkinAtlasCandidate(object: Object3D, material: Material) {
  const searchable = `${object.name} ${material.name}`.toLowerCase();

  return (
    /\b(face|head|skin|body|neck|shoulder|chest|torso)\b/.test(searchable) ||
    searchable.includes('facecap')
  );
}

function createMaterialSlot(mesh: Mesh, material: Material): MaterialSlot {
  const intent = materialIntent(mesh, material);
  const hasUv = mesh.geometry.getAttribute('uv') !== undefined;

  return {
    mesh,
    material,
    intent,
    label: slotLabel(mesh, material),
    hasUv,
    isStandardMaterial: isMeshStandardMaterial(material),
    directSkinCandidate:
      intent === 'skin' && hasUv && isDirectSkinAtlasCandidate(mesh, material),
  };
}

function prepareMaterialLighting(
  slot: MaterialSlot,
  textureConfig?: FaceTextureConfig,
) {
  slot.material.needsUpdate = true;

  if (!isMeshStandardMaterial(slot.material)) {
    return;
  }

  slot.material.color = new Color(
    slot.intent === 'skin'
      ? (textureConfig?.skinColor ?? defaultSkinColor)
      : '#ffffff',
  );
  slot.material.roughness = Math.max(slot.material.roughness, 0.48);
  slot.material.metalness = Math.min(slot.material.metalness, 0.08);
}

function assignDirectTexture(slot: MaterialSlot, texture: Texture) {
  if (!isMeshStandardMaterial(slot.material)) {
    return false;
  }

  slot.material.map = texture;
  slot.material.roughness = Math.max(slot.material.roughness, 0.56);
  slot.material.needsUpdate = true;

  return true;
}

function hasOnlySkinMaterials(mesh: Mesh, slots: MaterialSlot[]) {
  const meshSlots = slots.filter((slot) => slot.mesh === mesh);

  return (
    meshSlots.length > 0 &&
    meshSlots.every((slot) => slot.intent === 'skin' && slot.isStandardMaterial)
  );
}

function selectSkinTransferMode({
  textureConfig,
  textures,
  skinSlots,
  directSkinSlots,
  projectedSkinTargets,
}: {
  textureConfig?: FaceTextureConfig;
  textures: LoadedFaceTextures;
  skinSlots: MaterialSlot[];
  directSkinSlots: MaterialSlot[];
  projectedSkinTargets: Mesh[];
}): SkinTransferMode {
  if (!textures.skin || skinSlots.length === 0) {
    return 'procedural';
  }

  const requestedMode = textureConfig?.faceMaterialTransfer ?? 'auto';

  if (requestedMode === 'uv' && directSkinSlots.length > 0) {
    return 'uv';
  }

  if (requestedMode === 'projected' && projectedSkinTargets.length > 0) {
    return 'projected';
  }

  if (requestedMode === 'auto' && directSkinSlots.length === skinSlots.length) {
    return 'uv';
  }

  if (projectedSkinTargets.length > 0) {
    return 'projected';
  }

  if (directSkinSlots.length > 0) {
    return 'uv';
  }

  return 'procedural';
}

function applyTextureTransfers({
  box,
  textureConfig,
  textures,
  slots,
}: {
  box: Box3;
  textureConfig?: FaceTextureConfig;
  textures: LoadedFaceTextures;
  slots: MaterialSlot[];
}): TextureTransferDiagnostic {
  const requestedMode = textureConfig?.faceMaterialTransfer ?? 'auto';
  const skippedSlots: string[] = [];
  const mismatchedSlots: string[] = [];
  const skinSlots = slots.filter((slot) => slot.intent === 'skin');
  const directSkinSlots = skinSlots.filter(
    (slot) => slot.isStandardMaterial && slot.directSkinCandidate,
  );
  const projectedSkinTargets = [
    ...new Set(
      skinSlots
        .filter((slot) => slot.isStandardMaterial)
        .map((slot) => slot.mesh)
        .filter((mesh) => hasOnlySkinMaterials(mesh, slots)),
    ),
  ];
  const selectedSkinMode = selectSkinTransferMode({
    textureConfig,
    textures,
    skinSlots,
    directSkinSlots,
    projectedSkinTargets,
  });

  if (textures.skin && skinSlots.length === 0) {
    skippedSlots.push('skin: no matching head/body material slot');
  }

  if (selectedSkinMode === 'uv' && textures.skin) {
    directSkinSlots.forEach((slot) => {
      assignDirectTexture(slot, textures.skin!);
    });

    skinSlots
      .filter((slot) => !directSkinSlots.includes(slot))
      .forEach((slot) => {
        mismatchedSlots.push(`${slot.label}: skin slot is not UV-atlas ready`);
      });
  }

  let projectedSkinMeshCount = 0;

  if (selectedSkinMode === 'projected' && textures.skin) {
    projectedSkinTargets.forEach((mesh) => {
      const result = applyProjectedSkinTransfer(mesh, box);

      if (result.applied) {
        projectedSkinMeshCount += 1;
      } else if (result.reason) {
        mismatchedSlots.push(
          `${mesh.name || 'unnamed mesh'}: ${result.reason}`,
        );
      }
    });

    skinSlots
      .filter((slot) => projectedSkinTargets.includes(slot.mesh))
      .forEach((slot) => {
        assignDirectTexture(slot, textures.skin!);
      });

    skinSlots
      .filter((slot) => !projectedSkinTargets.includes(slot.mesh))
      .forEach((slot) => {
        skippedSlots.push(`${slot.label}: mixed or non-standard skin slot`);
      });
  }

  if (textures.skin && selectedSkinMode === 'procedural') {
    mismatchedSlots.push('skin: no usable UV slot or projected skin mesh');
  }

  const directPartSlots = (
    [
      ['eye', textures.eye],
      ['oral', textures.oral],
    ] as const
  ).flatMap(([intent, texture]) => {
    const intentSlots = slots.filter((slot) => slot.intent === intent);

    if (texture && intentSlots.length === 0) {
      skippedSlots.push(`${intent}: no matching material slot`);
    }

    return intentSlots.filter((slot) => {
      if (!texture) {
        return false;
      }

      if (!slot.hasUv || !slot.isStandardMaterial) {
        skippedSlots.push(
          `${slot.label}: ${intent} texture requires direct UV`,
        );
        return false;
      }

      assignDirectTexture(slot, texture);
      return true;
    });
  });

  return {
    requestedMode,
    selectedSkinMode,
    skinSlots: skinSlots.map((slot) => slot.label),
    directSkinSlots: directSkinSlots.map((slot) => slot.label),
    projectedSkinMeshCount,
    eyeSlots: directPartSlots
      .filter((slot) => slot.intent === 'eye')
      .map((slot) => slot.label),
    oralSlots: directPartSlots
      .filter((slot) => slot.intent === 'oral')
      .map((slot) => slot.label),
    skippedSlots,
    mismatchedSlots,
  };
}

function prepareNeutralHeadAsset(
  gltf: GLTF,
  textures: LoadedFaceTextures,
  textureConfig?: FaceTextureConfig,
): LoadedHeadAsset {
  const morphTargetNames = new Set<string>();
  const morphTargetBindings: MorphTargetBinding[] = [];
  const materialSlots: MaterialSlot[] = [];

  gltf.scene.traverse((object) => {
    if (!isRenderableMesh(object)) {
      return;
    }

    if (isMorphTargetMesh(object)) {
      const influences = object.morphTargetInfluences ?? [];
      influences.fill(0);
      morphTargetBindings.push({
        dictionary: object.morphTargetDictionary ?? {},
        influences,
      });

      Object.keys(object.morphTargetDictionary ?? {}).forEach((name) => {
        morphTargetNames.add(name);
      });
    }

    forEachMaterial(object.material, (material) => {
      const slot = createMaterialSlot(object, material);
      prepareMaterialLighting(slot, textureConfig);
      materialSlots.push(slot);
    });
  });

  const box = new Box3().setFromObject(gltf.scene);
  const textureDiagnostic = applyTextureTransfers({
    box,
    textureConfig,
    textures,
    slots: materialSlots,
  });

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
    textureDiagnostic,
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
