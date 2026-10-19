import { useEffect, useState } from 'react';
import { Box3, FileLoader, Mesh, Object3D, Vector3, type WebGLRenderer } from 'three';
import {
  GLTFLoader,
  type GLTF,
} from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { readMorphFaceSurface } from '@/domain/physics/mesh-pose-target-driver';
import type { PoseSurface } from '@/domain/physics/pose-target-mapper';
import type { VertexDeltaFrame } from '@/domain/providers/deformation-provider';
import { createRenderOffsetLayer } from './render-offset-layer';

export type HeadAssetStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type LoadedHeadAsset = {
  scene: Object3D;
  morphTargetNames: string[];
  physics?: { sourceMesh: ArrayBuffer; surface: PoseSurface };
  applyVertexDeltas: (deltas?: VertexDeltaFrame) => void;
  dispose: () => void;
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

export function prepareNeutralHeadAsset(gltf: GLTF, sourceMesh: ArrayBuffer): LoadedHeadAsset {
  const morphTargetNames = new Set<string>();
  const morphTargetBindings: MorphTargetBinding[] = [];
  const faceMeshes: Mesh[] = [];

  gltf.scene.traverse((object) => {
    if (!isMorphTargetMesh(object)) {
      return;
    }

    if (Object.keys(object.morphTargetDictionary ?? {}).length) faceMeshes.push(object);
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

  const face = faceMeshes.length === 1 ? faceMeshes[0] : undefined;
  const physics = face ? { sourceMesh, surface: readMorphFaceSurface(face) } : undefined;
  const offsets = face ? createRenderOffsetLayer(face) : undefined;
  return {
    physics,
    applyVertexDeltas: deltas => offsets?.apply(deltas?.positions),
    dispose: () => offsets?.dispose(),
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

    let loadedAsset: LoadedHeadAsset | undefined;
    const fail = (error: unknown) => {
      if (!disposed) setState({ status: 'error', progress: 0, asset: null, errorMessage: messageFromError(error) });
    };
    // Fetch once: these exact bytes are both parsed and validated against STP1.
    new FileLoader().setResponseType('arraybuffer').load(
      normalizedAssetUrl,
      data => {
        if (disposed) return;
        const bytes = data as ArrayBuffer;
        const resourcePath = new URL('.', new URL(normalizedAssetUrl, window.location.href)).href;
        loader.parse(bytes, resourcePath, gltf => {
          if (disposed) return;
          try {
            loadedAsset = prepareNeutralHeadAsset(gltf, bytes);
            setState({ status: 'loaded', progress: 1, asset: loadedAsset,
              errorMessage: loadedAsset.morphTargetNames.length ? null : 'Loaded mesh has no morph targets.' });
          } catch (error) { fail(error); }
        }, fail);
      },
      event => {
        if (disposed) return;
        const progress = event.lengthComputable && event.total > 0 ? Math.min(0.98, event.loaded / event.total) : 0.2;
        setState(current => ({ ...current, status: 'loading', progress }));
      },
      fail,
    );

    return () => {
      disposed = true;
      loadedAsset?.dispose();
      ktx2Loader.dispose();
    };
  }, [assetUrl, renderer]);

  return state;
}
