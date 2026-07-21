import { useEffect, useState } from 'react';
import { Box3, Mesh, Object3D, Vector3, type WebGLRenderer } from 'three';
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

function clampInfluence(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function prepareNeutralHeadAsset(gltf: GLTF): LoadedHeadAsset {
  const morphTargetNames = new Set<string>();
  const morphTargetBindings: MorphTargetBinding[] = [];

  gltf.scene.traverse((object) => {
    if (!isMorphTargetMesh(object)) {
      return;
    }

    const influences = object.morphTargetInfluences ?? [];
    influences.fill(0);
    morphTargetBindings.push({
      dictionary: object.morphTargetDictionary ?? {},
      influences,
    });

    Object.keys(object.morphTargetDictionary ?? {}).forEach((name) => {
      morphTargetNames.add(name);
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

  const sortedMorphTargetNames = [...morphTargetNames].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    scene: gltf.scene,
    morphTargetNames: sortedMorphTargetNames,
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
