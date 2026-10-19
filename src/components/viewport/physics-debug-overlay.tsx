import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferGeometry, Float32BufferAttribute, type Group, type Mesh } from 'three';
import { usePhysicsTelemetry } from '@/state/physics-telemetry-state';

import { NODE_COLORS, updateDebugPositions, updateDebugPoseErrors } from './physics-debug-geometry';
export default function PhysicsDebugOverlay({ face }: { face: Mesh }) {
  const proxy = usePhysicsTelemetry(state => state.snapshot?.proxy);
  const group = useRef<Group>(null);
  const geometry = useMemo(() => {
    if (!proxy) return null;
    const nodes = new BufferGeometry(), edges = new BufferGeometry(), residuals = new BufferGeometry();
    nodes.setAttribute('position', new Float32BufferAttribute(new Float32Array(proxy.nodes.length),3));
    const colors=Array.from(proxy.labels).flatMap(label=>[...NODE_COLORS[label]]);
    nodes.setAttribute('color',new Float32BufferAttribute(colors,3));
    edges.setAttribute('position',new Float32BufferAttribute(new Float32Array(proxy.edges.length*3),3));
    nodes.setAttribute('poseDistanceMetres',new Float32BufferAttribute(new Float32Array(proxy.nodes.length/3),1));
    residuals.setAttribute('position',new Float32BufferAttribute(new Float32Array(proxy.nodes.length*2),3));
    return {nodes,edges,residuals};
  }, [proxy]);
  useEffect(()=>()=>{geometry?.nodes.dispose();geometry?.edges.dispose();geometry?.residuals.dispose();},[geometry]);
  useFrame(()=>{
    const snapshot=usePhysicsTelemetry.getState().snapshot;
    if (!snapshot || snapshot.proxy!==proxy || !geometry || !group.current) return;
    const positions=geometry.nodes.getAttribute('position');
    const edges=geometry.edges.getAttribute('position');
    updateDebugPositions(proxy!,snapshot.positions,positions.array as Float32Array,edges.array as Float32Array);
    const residuals=geometry.residuals.getAttribute('position');
    const distances=geometry.nodes.getAttribute('poseDistanceMetres');
    updateDebugPoseErrors(proxy!,snapshot.positions,snapshot.poseTargets,snapshot.telemetry.nodePoseDistancesMetres,residuals.array as Float32Array,distances.array as Float32Array);
    residuals.needsUpdate=true;
    distances.needsUpdate=true;
    positions.needsUpdate=true;
    edges.needsUpdate=true;
    face.updateWorldMatrix(true,false);
    group.current.matrix.copy(face.matrixWorld);
    group.current.matrixWorldNeedsUpdate=true;
  });
  if (!geometry) return null;
  return <group ref={group} matrixAutoUpdate={false}>
    <lineSegments geometry={geometry.edges} frustumCulled={false} renderOrder={1000}>
      <lineBasicMaterial color="#9ca3af" transparent opacity={0.45} depthTest={false} depthWrite={false} />
    </lineSegments>
    <lineSegments geometry={geometry.residuals} frustumCulled={false} renderOrder={1001}>
      <lineBasicMaterial color="#86efac" transparent opacity={0.8} depthTest={false} depthWrite={false} />
    </lineSegments>
    <points geometry={geometry.nodes} frustumCulled={false} renderOrder={1001}>
      <pointsMaterial vertexColors size={4} sizeAttenuation={false} depthTest={false} depthWrite={false} />
    </points>
  </group>;
}
