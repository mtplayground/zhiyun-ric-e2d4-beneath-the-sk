/** Pair records are [outer, inner]; labels never define mechanical roles. */
export function innerNodeMask(pairs: ArrayLike<number>, count: number): Uint8Array {
  if (!Number.isSafeInteger(count) || count <= 0 || pairs.length !== count) throw new Error('Invalid node pairing dimensions');
  const seen = new Set<number>(), inner = new Uint8Array(count);
  for (let i = 0; i < pairs.length; i += 2) {
    for (const index of [pairs[i], pairs[i + 1]]) {
      if (!Number.isInteger(index) || index < 0 || index >= count || seen.has(index)) throw new Error('Invalid node pairing');
      seen.add(index);
    }
    inner[pairs[i + 1]] = 1;
  }
  return inner;
}
