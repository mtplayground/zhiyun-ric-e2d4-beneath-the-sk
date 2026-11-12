/** Measurement/capture only; no application imports this module. */
import { Box3, Triangle, Vector3 } from 'three';
import { loadLipMeasurementMesh } from './lip-gap-browser-probe';
import { lipRegions } from './facecap-lip-regions';
import { inspectLipSurfaces, trianglesIntersect, type SurfaceTriangle } from './lip-surface-geometry';
import { computePosedSurfacePositions } from '../src/domain/physics/pose-target-mapper';
import { allPoseMappings, getPoseWeights } from '../src/domain/poses/pose-library';

const points = (t: Triangle) => [t.a, t.b, t.c];
const wrap = (triangle: Triangle, ordinal: number): SurfaceTriangle => ({
  triangle, ordinal, bounds: new Box3().setFromPoints(points(triangle)),
});

/** Clip to a lateral slab, including boundary points. Membership stays neutral.
 * Clipping, rather than centroid selection, preserves minima at slab boundaries. */
export function clipLipSlab(surface: SurfaceTriangle[], min: number, max: number) {
  return surface.flatMap(({ triangle, ordinal }) => {
    let polygon = points(triangle);
    for (const [boundary, sign] of [[min, 1], [max, -1]]) {
      const result: Vector3[] = [];
      polygon.forEach((a, i) => {
        const b = polygon[(i + 1) % polygon.length];
        const insideA = sign * (a.x - boundary) >= 0;
        const insideB = sign * (b.x - boundary) >= 0;
        if (insideA) result.push(a);
        if (insideA !== insideB) result.push(a.clone().lerp(b, (boundary - a.x) / (b.x - a.x)));
      });
      polygon = result;
    }
    return polygon.slice(1, -1).map((p, i) => wrap(new Triangle(polygon[0], p, polygon[i + 2]), ordinal))
      .filter(t => t.triangle.getArea() > 1e-16);
  });
}

export function profileMetrics(upper: SurfaceTriangle[], lower: SurfaceTriangle[]) {
  const front = (rows: SurfaceTriangle[]) => Math.max(...rows.flatMap(t => points(t.triangle).map(v => v.z)));
  const project = (rows: SurfaceTriangle[]) => rows.map(t => new Triangle(...points(t.triangle)
    .map(v => new Vector3(0, v.y, v.z)) as [Vector3, Vector3, Vector3])).filter(t => t.getArea() > 1e-16);
  const up = project(upper), low = project(lower);
  return {
    ...inspectLipSurfaces(upper, lower),
    // Difference of foremost extents, not a signed vertical gap or penetration.
    upperForwardExtentMinusLowerMetres: front(upper) - front(lower),
    sideProjectionOverlaps: up.some(a => low.some(b => trianglesIntersect(a, b))),
  };
}

/** Shared neutral-defined regions for capture and weight search. */
export function lipProfileBands(neutralUpper: SurfaceTriangle[], neutralLower: SurfaceTriangle[]) {
  const bounds = new Box3();
  [...neutralUpper, ...neutralLower].forEach(t => bounds.union(t.bounds));
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const radius = (bounds.max.x - bounds.min.x) / 2;
  const slabs = [
    { name: 'front', ranges: [[centerX - radius / 3, centerX + radius / 3]] },
    { name: 'middle', ranges: [[centerX - 2 * radius / 3, centerX - radius / 3], [centerX + radius / 3, centerX + 2 * radius / 3]] },
    { name: 'corner', ranges: [[bounds.min.x, centerX - 2 * radius / 3], [centerX + 2 * radius / 3, bounds.max.x]] },
  ];
  return { bounds, slabs };
}

/** Optional explicit weights reproduce an archived capture after the library changes. */
export async function captureLipProfiles(tWeights?: Record<string, number>) {
  const { source, sourceHash, surface, triangles, face } = await loadLipMeasurementMesh();
  const neutralUpper = triangles(surface.positions, lipRegions.upper, 'neutral');
  const neutralLower = triangles(surface.positions, lipRegions.lower, 'neutral');
  const { bounds, slabs } = lipProfileBands(neutralUpper, neutralLower);
  const pose = allPoseMappings.find(p => p.id === 'phoneme-t');
  if (!pose) throw new Error('Missing current T');
  const cases = [{ id: 'neutral', weights: {} }, { id: pose.id, weights: tWeights ?? getPoseWeights(pose, 'kinematic-blendshape') }];
  const results = cases.map(({ id, weights }) => {
    const posed = computePosedSurfacePositions(surface, weights);
    const upper = triangles(posed, lipRegions.upper, id), lower = triangles(posed, lipRegions.lower, id);
    const regions = slabs.map(slab => {
      const sides = slab.ranges.map(([min, max]) => {
        // Slice at neutral lateral coordinates: T does not redefine the regions.
        return profileMetrics(clipLipSlab(upper, min, max), clipLipSlab(lower, min, max));
      });
      return { name: slab.name, sides, minimumGapMetres: Math.min(...sides.map(s => s.minimumGapMetres)) };
    });
    const index = face.geometry.getIndex()!;
    const mesh = triangles(posed, Array.from({ length: index.count / 3 }, (_, i) => i), id);
    return { id, weights, regions, ...profileMetrics(upper, lower), mesh, upper, lower };
  });
  // Identical orthographic mouth crop, looking from +X; +Z (forward) is right.
  const crop = bounds.clone();
  for (const row of results) for (const t of [...row.upper, ...row.lower]) crop.union(t.bounds);
  crop.expandByScalar(0.008);
  const width = 900, height = 620, padding = 40;
  const scale = Math.min((width - 2 * padding) / (crop.max.z - crop.min.z), (height - 2 * padding) / (crop.max.y - crop.min.y));
  const svg = (row: typeof results[number]) => {
    const path = (t: SurfaceTriangle, fill: string, opacity: number) => `<polygon points="${points(t.triangle).map(v => `${(padding + (v.z - crop.min.z) * scale).toFixed(4)},${(height - padding - (v.y - crop.min.y) * scale).toFixed(4)}`).join(' ')}" fill="${fill}" fill-opacity="${opacity}" stroke="${fill}" stroke-width="0.35"/>`;
    const context = row.mesh.filter(t => t.bounds.intersectsBox(crop)).sort((a, b) => a.bounds.min.x - b.bounds.min.x);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><defs><clipPath id="crop"><rect x="0" y="30" width="900" height="560"/></clipPath></defs><g clip-path="url(#crop)">${context.map(t => path(t, '#d4d8dc', 1)).join('')}${row.lower.map(t => path(t, '#2274bb', 0.38)).join('')}${row.upper.map(t => path(t, '#d65339', 0.38)).join('')}</g><g font-family="sans-serif" font-size="18" fill="#222"><text x="20" y="25">${row.id}: +X profile, forward →</text><text x="20" y="610">Upper: orange · Lower: blue · transparent surface overlay</text></g></svg>\n`;
  };
  return {
    report: { source, sourceHash, regions: lipRegions, slabs, axes: 'world metres: X lateral, Y up, Z forward',
      results: results.map(({ mesh: _mesh, upper: _upper, lower: _lower, ...row }) => row) },
    images: results.map(row => ({ id: row.id, svg: svg(row) })),
  };
}
