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

/** Residual segments end at the matching pose target; colors remain label-only. */
export function updateDebugPoseErrors(
  proxy: PoseProxy, simulated: ArrayLike<number>, targets: ArrayLike<number>, distancesMetres: ArrayLike<number>,
  segments: Float32Array, nodeDistances: Float32Array,
) {
  if(simulated.length!==proxy.nodes.length || targets.length!==simulated.length ||
    segments.length!==simulated.length*2 || distancesMetres.length*3!==simulated.length || nodeDistances.length!==distancesMetres.length) throw new Error('Debug pose sample dimensions differ');
  const {center,scale}=proxy.metadata.normalization;
  for(let node=0;node<distancesMetres.length;node++) {
    if(!Number.isFinite(distancesMetres[node])||distancesMetres[node]<0) throw new Error('Invalid debug pose distance');
    nodeDistances[node]=distancesMetres[node];
    for(let axis=0;axis<3;axis++) {
      segments[node*6+axis]=simulated[node*3+axis]*scale+center[axis];
      segments[node*6+3+axis]=targets[node*3+axis]*scale+center[axis];
    }
  }
}
