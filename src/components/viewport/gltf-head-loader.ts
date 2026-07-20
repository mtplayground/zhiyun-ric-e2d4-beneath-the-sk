import { useEffect, useState } from 'react';
import {
  Box3,
  Mesh,
  Object3D,
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

export type HeadAssetStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type LoadedHeadAsset = {
  scene: Object3D;
  morphTargetNames: string[];
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

function prepareNeutralHeadAsset(gltf: GLTF): LoadedHeadAsset {
  const morphTargetNames = new Set<string>();

  gltf.scene.traverse((object) => {
    if (!isMorphTargetMesh(object)) {
      return;
    }

    object.morphTargetInfluences?.fill(0);

    Object.keys(object.morphTargetDictionary ?? {}).forEach((name) => {
      morphTargetNames.add(name);
    });

    forEachMaterial(object.material, (material) => {
      material.needsUpdate = true;
      if (isMeshStandardMaterial(material)) {
        material.roughness = Math.max(material.roughness, 0.48);
        material.metalness = Math.min(material.metalness, 0.08);
      }
    });
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
  };
}

function messageFromError(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unable to load the configured glTF face mesh.';
}

export function useGltfHeadAsset(
  assetUrl: string,
  renderer: WebGLRenderer,
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

    loader.load(
      normalizedAssetUrl,
      (gltf) => {
        if (disposed) {
          return;
        }

        try {
          const asset = prepareNeutralHeadAsset(gltf);

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
  }, [assetUrl, renderer]);

  return state;
}
