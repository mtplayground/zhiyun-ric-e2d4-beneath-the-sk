import type { PoseProxy } from './pose-target-mapper';

/** Return accessor-space offsets, never absolute posed positions. */
export function embedSimulationOffsets(proxy: PoseProxy, simulated: ArrayLike<number>, targets: ArrayLike<number>): Float32Array {
  if (simulated.length !== proxy.nodes.length || targets.length !== simulated.length) throw new Error('Invalid simulation sample dimensions');
  const output = new Float32Array(proxy.metadata.counts.renderVertices * 3);
  const scale = proxy.metadata.normalization.scale;
  for (let vertex = 0; vertex < output.length / 3; vertex++) {
    const record = vertex * 5, tet = proxy.embedding[record];
    for (let corner = 0; corner < 4; corner++) {
      const node = proxy.tetrahedra[tet*4+corner], weight = proxy.embedding[record+1+corner];
      for (let axis = 0; axis < 3; axis++) output[vertex*3+axis] += weight * (simulated[node*3+axis]-targets[node*3+axis]) * scale;
    }
  }
  if (!output.every(Number.isFinite)) throw new Error('Non-finite render embedding');
  return output;
}
