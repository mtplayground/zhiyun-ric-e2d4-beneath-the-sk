import {
  Box3,
  BufferAttribute,
  Mesh,
  Vector3,
  type BufferGeometry,
} from 'three';

export type ProjectedSkinTransferResult = {
  applied: boolean;
  vertexCount: number;
  reason: string | null;
};

const projectionEpsilon = 0.000001;

function clampUnit(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function axisSize(bounds: Box3, axis: 'x' | 'y' | 'z') {
  return Math.max(bounds.max[axis] - bounds.min[axis], projectionEpsilon);
}

function cloneGeometryWithProjectedUv(
  geometry: BufferGeometry,
  mesh: Mesh,
  bounds: Box3,
) {
  const position = geometry.getAttribute('position');

  if (!position || position.count === 0) {
    return null;
  }

  const width = axisSize(bounds, 'x');
  const height = axisSize(bounds, 'y');
  const localPosition = new Vector3();
  const worldPosition = new Vector3();
  const projectedUv = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    localPosition.fromBufferAttribute(position, index);
    worldPosition.copy(localPosition);
    mesh.localToWorld(worldPosition);

    projectedUv[index * 2] = clampUnit(
      (worldPosition.x - bounds.min.x) / width,
    );
    projectedUv[index * 2 + 1] = clampUnit(
      1 - (worldPosition.y - bounds.min.y) / height,
    );
  }

  const projectedGeometry = geometry.clone();
  projectedGeometry.setAttribute('uv', new BufferAttribute(projectedUv, 2));

  return projectedGeometry;
}

export function applyProjectedSkinTransfer(
  mesh: Mesh,
  bounds: Box3,
): ProjectedSkinTransferResult {
  mesh.updateWorldMatrix(true, false);

  if (bounds.isEmpty()) {
    return {
      applied: false,
      vertexCount: 0,
      reason: 'empty-bounds',
    };
  }

  const projectedGeometry = cloneGeometryWithProjectedUv(
    mesh.geometry,
    mesh,
    bounds,
  );

  if (!projectedGeometry) {
    return {
      applied: false,
      vertexCount: 0,
      reason: 'missing-position-attribute',
    };
  }

  const position = projectedGeometry.getAttribute('position');
  mesh.geometry = projectedGeometry;

  return {
    applied: true,
    vertexCount: position.count,
    reason: null,
  };
}
