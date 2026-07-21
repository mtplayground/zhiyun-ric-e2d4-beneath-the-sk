import { useEffect, useMemo, useState } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';

function clampIntensity(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function createTongueGeometry() {
  const columns = 8;
  const rows = 12;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const taper = 0.42 + 0.58 * Math.sin(v * Math.PI * 0.92);

    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const x = (u - 0.5) * 0.42 * taper;
      const y = (v - 0.5) * 0.58;
      const z = Math.sin(v * Math.PI) * 0.035;

      vertices.push(x, y, z);
      uvs.push(0.24 + u * 0.52, 0.42 + v * 0.18);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * (columns + 1) + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns + 1;
      const bottomRight = bottomLeft + 1;

      indices.push(
        topLeft,
        bottomLeft,
        topRight,
        topRight,
        bottomLeft,
        bottomRight,
      );
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(vertices), 3),
  );
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function useTextureOrNull(url: string) {
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    const normalizedUrl = url.trim();

    if (!normalizedUrl) {
      setTexture(null);
      return;
    }

    let disposed = false;
    const loader = new TextureLoader();

    loader.load(
      normalizedUrl,
      (loadedTexture) => {
        if (disposed) {
          loadedTexture.dispose();
          return;
        }

        loadedTexture.colorSpace = SRGBColorSpace;
        loadedTexture.flipY = false;
        loadedTexture.needsUpdate = true;
        setTexture(loadedTexture);
      },
      undefined,
      () => {
        if (!disposed) {
          setTexture(null);
        }
      },
    );

    return () => {
      disposed = true;
    };
  }, [url]);

  return texture;
}

export function ProceduralTongue({
  intensity,
  oralTextureUrl,
}: {
  intensity: number;
  oralTextureUrl: string;
}) {
  const normalizedIntensity = clampIntensity(intensity);
  const geometry = useMemo(createTongueGeometry, []);
  const oralTexture = useTextureOrNull(oralTextureUrl);

  if (normalizedIntensity <= 0.01) {
    return null;
  }

  return (
    <mesh
      geometry={geometry}
      position={[
        0,
        -0.36 + normalizedIntensity * 0.03,
        0.53 + normalizedIntensity * 0.16,
      ]}
      rotation={[-1.05 + normalizedIntensity * 0.18, 0, 0]}
      scale={[1, 0.76 + normalizedIntensity * 0.24, 1]}
    >
      <meshStandardMaterial
        color={oralTexture ? '#ffffff' : '#b04d63'}
        map={oralTexture ?? undefined}
        roughness={0.72}
        metalness={0.02}
        side={DoubleSide}
      />
    </mesh>
  );
}
