import type { PoseProxy } from '@/domain/physics/pose-target-mapper';
export const NODE_COLORS = [[0.22,0.83,1], [1,0.75,0.2], [1,0.3,0.65]] as const;
export function updateDebugPositions(
  proxy: PoseProxy & {edges:ArrayLike<number>}, simulated:ArrayLike<number>,
  nodePositions:Float32Array, edgePositions:Float32Array,
) {
  const {center,scale}=proxy.metadata.normalization;
  for(let i=0;i<simulated.length;i++) nodePositions[i]=simulated[i]*scale+center[i%3];
  for(let endpoint=0;endpoint<proxy.edges.length;endpoint++) {
    const node=proxy.edges[endpoint];
    for(let axis=0;axis<3;axis++) edgePositions[endpoint*3+axis]=nodePositions[node*3+axis];
  }
}
