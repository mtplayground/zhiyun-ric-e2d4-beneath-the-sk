import { Box3, Triangle, Vector3 } from 'three';

export type SurfaceTriangle = { ordinal: number; triangle: Triangle; bounds: Box3 };
const edges = (t: Triangle) => [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as const;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Separating-axis test in all three dimensions, including coplanar faces.
 * In-plane edge normals are necessary: edge cross-products alone miss disjoint
 * coplanar triangles. Contact counts as intersection; there is no crossing allowance.
 */
export function trianglesIntersect(a: Triangle, b: Triangle) {
  const ae = edges(a).map(([p, q]) => q.clone().sub(p));
  const be = edges(b).map(([p, q]) => q.clone().sub(p));
  const an = a.getNormal(new Vector3()), bn = b.getNormal(new Vector3());
  const axes = [an, bn, ...ae.flatMap(u => be.map(v => u.clone().cross(v))),
    ...ae.map(e => an.clone().cross(e)), ...be.map(e => bn.clone().cross(e))];
  for (const axis of axes) {
    if (axis.lengthSq() < 1e-24) continue;
    axis.normalize();
    const ap = [a.a, a.b, a.c].map(v => v.dot(axis));
    const bp = [b.a, b.b, b.c].map(v => v.dot(axis));
    // Roundoff guard is conservative: ambiguous contact FAILS instead of
    // granting a penetration tolerance. World coordinates are in metres.
    if (Math.max(...ap) < Math.min(...bp) - 1e-12 ||
        Math.max(...bp) < Math.min(...ap) - 1e-12) return false;
  }
  return true;
}

function segmentDistanceSquared(p: Vector3, q: Vector3, r: Vector3, s: Vector3) {
  const u = q.clone().sub(p), v = s.clone().sub(r), w = p.clone().sub(r);
  const a = u.dot(u), b = u.dot(v), c = v.dot(v), d = u.dot(w), e = v.dot(w);
  const distance = (x: number, y: number) => w.clone().addScaledVector(u, x).addScaledVector(v, -y).lengthSq();
  const candidates = [distance(0, c ? clamp(e / c) : 0),
    distance(1, c ? clamp((e + b) / c) : 0),
    distance(a ? clamp(-d / a) : 0, 0), distance(a ? clamp((b - d) / a) : 0, 1)];
  const determinant = a * c - b * b;
  if (determinant > 1e-12 * a * c) {
    const x = (b * e - c * d) / determinant, y = (a * e - b * d) / determinant;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) candidates.push(distance(x, y));
  }
  return Math.min(...candidates);
}

export function triangleDistance(a: Triangle, b: Triangle) {
  if (trianglesIntersect(a, b)) return 0;
  const point = new Vector3();
  return Math.sqrt(Math.min(
    ...[a.a, a.b, a.c].map(v => b.closestPointToPoint(v, point).distanceToSquared(v)),
    ...[b.a, b.b, b.c].map(v => a.closestPointToPoint(v, point).distanceToSquared(v)),
    ...edges(a).flatMap(([p, q]) => edges(b).map(([r, s]) => segmentDistanceSquared(p, q, r, s))),
  ));
}

function boxDistance(a: Box3, b: Box3) {
  return Math.hypot(...(['x', 'y', 'z'] as const).map(axis =>
    Math.max(0, a.min[axis] - b.max[axis], b.min[axis] - a.max[axis])));
}

export function inspectLipSurfaces(upper: SurfaceTriangle[], lower: SurfaceTriangle[]) {
  if (!upper.length || !lower.length) throw new Error('Empty lip triangle region');
  let minimumGapMetres = Infinity;
  for (const a of upper) for (const b of lower) {
    // AABB distance is a lower bound on surface distance. Only overlapping boxes
    // can intersect; distant pairs also cannot improve the running minimum.
    if (boxDistance(a.bounds, b.bounds) > minimumGapMetres) continue;
    if (a.bounds.intersectsBox(b.bounds) && trianglesIntersect(a.triangle, b.triangle)) {
      const position = a.triangle.getMidpoint(new Vector3())
        .add(b.triangle.getMidpoint(new Vector3())).multiplyScalar(0.5).toArray();
      return { minimumGapMetres: 0, intersection: { upper: a.ordinal, lower: b.ordinal, positionMetres: position } };
    }
    minimumGapMetres = Math.min(minimumGapMetres, triangleDistance(a.triangle, b.triangle));
  }
  return { minimumGapMetres, intersection: null };
}
