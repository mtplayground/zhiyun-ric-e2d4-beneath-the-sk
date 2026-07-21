import {
  Box3,
  BufferAttribute,
  Mesh,
  Vector3,
  type BufferGeometry,
} from 'three';

import type { ProjectionAlignmentConfig } from '@/config/env';

export type ProjectedSkinTransferResult = {
  applied: boolean;
  vertexCount: number;
  reason: string | null;
};

const defaultProjectionAlignment: ProjectionAlignmentConfig = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotationYDegrees: 0,
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

function applyUvAlignment(
  u: number,
  v: number,
  alignment: ProjectionAlignmentConfig,
) {
  const scale = Math.max(alignment.scale, projectionEpsilon);

  return {
    u: clampUnit((u - 0.5) * scale + 0.5 + alignment.offsetX),
    v: clampUnit((v - 0.5) * scale + 0.5 + alignment.offsetY),
  };
}

function cloneGeometryWithProjectedUv(
  geometry: BufferGeometry,
  mesh: Mesh,
  bounds: Box3,
  alignment: ProjectionAlignmentConfig,
) {
  const position = geometry.getAttribute('position');

  if (!position || position.count === 0) {
    return null;
  }

  const width = axisSize(bounds, 'x');
  const height = axisSize(bounds, 'y');
  const depth = axisSize(bounds, 'z');
  const center = bounds.getCenter(new Vector3());
  const rotationRadians = (alignment.rotationYDegrees * Math.PI) / 180;
  const cosY = Math.cos(rotationRadians);
  const sinY = Math.sin(rotationRadians);
  const localPosition = new Vector3();
  const worldPosition = new Vector3();
  const projectedUv = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    localPosition.fromBufferAttribute(position, index);
    worldPosition.copy(localPosition);
    mesh.localToWorld(worldPosition);

    const centeredX = worldPosition.x - center.x;
    const centeredZ = worldPosition.z - center.z;
    const rotatedX = centeredX * cosY - centeredZ * sinY;
    const projectedU = rotatedX / Math.max(width, depth) + 0.5;
    const projectedV = 1 - (worldPosition.y - bounds.min.y) / height;
    const alignedUv = applyUvAlignment(projectedU, projectedV, alignment);

    projectedUv[index * 2] = alignedUv.u;
    projectedUv[index * 2 + 1] = alignedUv.v;
  }

  const projectedGeometry = geometry.clone();
  projectedGeometry.setAttribute('uv', new BufferAttribute(projectedUv, 2));

  return projectedGeometry;
}

export function applyProjectedSkinTransfer(
  mesh: Mesh,
  bounds: Box3,
  alignment: ProjectionAlignmentConfig = defaultProjectionAlignment,
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
    alignment,
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
