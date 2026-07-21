import { describe, expect, it } from 'vitest';
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';

import { applyProjectedSkinTransfer } from './projected-skin-transfer';

function makeTriangleGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]), 3),
  );
  geometry.setAttribute(
    'uv',
    new BufferAttribute(new Float32Array([0.2, 0.2, 0.4, 0.2, 0.3, 0.4]), 2),
  );
  geometry.morphAttributes.position = [
    new BufferAttribute(
      new Float32Array([-1, -0.8, 0, 1, -0.8, 0, 0, 1.2, 0]),
      3,
    ),
  ];

  return geometry;
}

describe('applyProjectedSkinTransfer', () => {
  it('replaces mesh UVs with normalized world-space projection coordinates', () => {
    const mesh = new Mesh(makeTriangleGeometry(), new MeshStandardMaterial());
    mesh.position.set(1, 2, 0);
    mesh.updateWorldMatrix(true, false);

    const bounds = new Box3(new Vector3(0, 1, -1), new Vector3(2, 3, 1));
    const originalGeometry = mesh.geometry;
    const result = applyProjectedSkinTransfer(mesh, bounds);
    const uv = mesh.geometry.getAttribute('uv');

    expect(result).toEqual({ applied: true, vertexCount: 3, reason: null });
    expect(mesh.geometry).not.toBe(originalGeometry);
    expect(Array.from(uv.array)).toEqual([0, 1, 1, 1, 0.5, 0]);
  });

  it('preserves morph target attributes and live influence values while swapping projected UVs', () => {
    const mesh = new Mesh(makeTriangleGeometry(), new MeshStandardMaterial());
    mesh.morphTargetDictionary = { mouthSmileLeft: 0 };
    mesh.morphTargetInfluences = [0.73];
    const morphInfluences = mesh.morphTargetInfluences;
    const morphAttributeValues = Array.from(
      mesh.geometry.morphAttributes.position?.[0]?.array ?? [],
    );

    applyProjectedSkinTransfer(
      mesh,
      new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1)),
    );

    expect(mesh.geometry.morphAttributes.position).toHaveLength(1);
    expect(
      Array.from(mesh.geometry.morphAttributes.position?.[0]?.array ?? []),
    ).toEqual(morphAttributeValues);
    expect(mesh.morphTargetDictionary).toEqual({ mouthSmileLeft: 0 });
    expect(mesh.morphTargetInfluences).toBe(morphInfluences);
    expect(mesh.morphTargetInfluences).toEqual([0.73]);
  });

  it('applies offset, scale, and vertical-axis rotation to projected UVs', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, 0, 1]), 3),
    );
    const mesh = new Mesh(geometry, new MeshStandardMaterial());
    mesh.updateWorldMatrix(true, false);

    applyProjectedSkinTransfer(
      mesh,
      new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1)),
      {
        offsetX: 0.1,
        offsetY: -0.1,
        scale: 0.5,
        rotationYDegrees: 90,
      },
    );

    const uv = Array.from(mesh.geometry.getAttribute('uv').array);

    expect(uv[0]).toBeCloseTo(0.35);
    expect(uv[1]).toBeCloseTo(0.4);
  });
});
