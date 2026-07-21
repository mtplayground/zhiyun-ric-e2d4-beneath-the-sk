import { useThree } from '@react-three/fiber';
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

export type HairAssetStatus = 'procedural' | 'loading' | 'loaded' | 'error';

export type HairAssetState = {
  status: HairAssetStatus;
  assetUrl: string | null;
  errorMessage: string | null;
};

const basisTranscoderPath = 'https://threejs.org/examples/jsm/libs/basis/';
const proceduralHairState: HairAssetState = {
  status: 'procedural',
  assetUrl: null,
  errorMessage: null,
};

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

function prepareHairAsset(gltf: GLTF) {
  gltf.scene.traverse((object) => {
    const mesh = object as Mesh;

    if (mesh.isMesh !== true || !mesh.material) {
      return;
    }

    forEachMaterial(mesh.material, (material) => {
      material.needsUpdate = true;

      if (isMeshStandardMaterial(material)) {
        material.color.set('#17120f');
        material.roughness = Math.max(material.roughness, 0.72);
        material.metalness = Math.min(material.metalness, 0.04);
      }
    });
  });

  const box = new Box3().setFromObject(gltf.scene);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  const scale = 1.32 / maxDimension;

  gltf.scene.scale.setScalar(scale);
  gltf.scene.position.set(
    -center.x * scale,
    -center.y * scale + 0.46,
    -center.z * scale - 0.03,
  );
  gltf.scene.rotation.set(0, 0, 0);
  gltf.scene.updateMatrixWorld(true);

  return gltf.scene;
}

function messageFromError(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unable to load the configured hair mesh.';
}

function useHairAsset(
  assetUrl: string | null,
  renderer: WebGLRenderer,
): HairAssetState & { scene: Object3D | null } {
  const [state, setState] = useState<
    HairAssetState & { scene: Object3D | null }
  >({
    ...proceduralHairState,
    scene: null,
  });

  useEffect(() => {
    const normalizedAssetUrl = assetUrl?.trim() || null;

    if (!normalizedAssetUrl) {
      setState({ ...proceduralHairState, scene: null });
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
      assetUrl: normalizedAssetUrl,
      errorMessage: null,
      scene: null,
    });

    loader.load(
      normalizedAssetUrl,
      (gltf) => {
        if (disposed) {
          return;
        }

        try {
          setState({
            status: 'loaded',
            assetUrl: normalizedAssetUrl,
            errorMessage: null,
            scene: prepareHairAsset(gltf),
          });
        } catch (error) {
          setState({
            status: 'error',
            assetUrl: normalizedAssetUrl,
            errorMessage: messageFromError(error),
            scene: null,
          });
        }
      },
      undefined,
      (error) => {
        if (disposed) {
          return;
        }

        setState({
          status: 'error',
          assetUrl: normalizedAssetUrl,
          errorMessage: messageFromError(error),
          scene: null,
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

function ProceduralHairCap() {
  return (
    <group position={[0, 0.52, -0.02]}>
      <mesh scale={[0.86, 0.44, 0.72]} position={[0, 0.2, -0.03]}>
        <sphereGeometry args={[1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        <meshStandardMaterial
          color="#18110d"
          roughness={0.82}
          metalness={0.02}
        />
      </mesh>
      <mesh scale={[0.22, 0.42, 0.18]} position={[-0.62, 0.02, 0.03]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial
          color="#15100d"
          roughness={0.86}
          metalness={0.02}
        />
      </mesh>
      <mesh scale={[0.22, 0.42, 0.18]} position={[0.62, 0.02, 0.03]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial
          color="#15100d"
          roughness={0.86}
          metalness={0.02}
        />
      </mesh>
      <mesh scale={[0.7, 0.2, 0.22]} position={[0, 0.04, 0.47]}>
        <sphereGeometry args={[1, 32, 12]} />
        <meshStandardMaterial
          color="#19120e"
          roughness={0.84}
          metalness={0.02}
        />
      </mesh>
    </group>
  );
}

export function HairAssetLayer({
  assetUrl,
  onStatusChange,
}: {
  assetUrl: string | null;
  onStatusChange: (state: HairAssetState) => void;
}) {
  const gl = useThree((state) => state.gl);
  const hairAsset = useHairAsset(assetUrl, gl);

  useEffect(() => {
    onStatusChange({
      status: hairAsset.status,
      assetUrl: hairAsset.assetUrl,
      errorMessage: hairAsset.errorMessage,
    });
  }, [
    hairAsset.assetUrl,
    hairAsset.errorMessage,
    hairAsset.status,
    onStatusChange,
  ]);

  if (hairAsset.scene) {
    return <primitive object={hairAsset.scene} />;
  }

  return <ProceduralHairCap />;
}
