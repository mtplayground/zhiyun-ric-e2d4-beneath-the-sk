import type { PoseProxy } from './pose-target-mapper';
import { EMBEDDING_EXCLUDED } from './bounded-embedding.mjs';

/** Convex nearest-point residual, distance fade, then a local-thickness cap.
 * Return accessor-space offsets; the original blendshape pose is untouched. */
export function embedSimulationOffsets(proxy: PoseProxy, simulated: ArrayLike<number>, targets: ArrayLike<number>): Float32Array {
  if (simulated.length !== proxy.nodes.length || targets.length !== simulated.length) throw new Error('Invalid simulation sample dimensions');
  const count=proxy.metadata.counts.renderVertices;
  const {embeddingFlags:flags,embeddingFade:fade,embeddingThickness:thickness,embeddingMaxOffsets:caps}=proxy;
  const fraction=proxy.metadata.embeddingPolicy?.maxOffsetFraction;
  if(!flags||!fade||!thickness||!caps||[flags,fade,thickness,caps].some(a=>a.length!==count)||typeof fraction!=='number'||!Number.isFinite(fraction)||fraction<=0||fraction>1) throw new Error('Missing or invalid bounded render embedding; regenerate asset');
  const output=new Float32Array(count*3),scale=proxy.metadata.normalization.scale;
  if(!Number.isFinite(scale)||scale<=0) throw new Error('Invalid embedding normalization');
  for(let vertex=0;vertex<count;vertex++) {
    if(!Number.isFinite(thickness[vertex])||thickness[vertex]<=0||!Number.isFinite(caps[vertex])||caps[vertex]<0||caps[vertex]>fraction*thickness[vertex]||!Number.isFinite(fade[vertex])||fade[vertex]<0||fade[vertex]>1||![0,1,2,3].includes(flags[vertex])) throw new Error('Invalid bounded render embedding');
    if(flags[vertex]&EMBEDDING_EXCLUDED) {
      if(caps[vertex]!==0||fade[vertex]!==0) throw new Error('Excluded vertex has a simulation offset');
      continue;
    }
    const record=vertex*5,tet=proxy.embedding[record],delta=[0,0,0];
    if(!Number.isInteger(tet)||tet<0||tet*4+3>=proxy.tetrahedra.length) throw new Error('Invalid embedding tetrahedron');
    const weights=[1,2,3,4].map(c=>proxy.embedding[record+c]),sum=weights.reduce((a,b)=>a+b,0);
    if(weights.some(w=>!Number.isFinite(w)||w<0||w>1)||Math.abs(sum-1)>1e-6) throw new Error('Extrapolated render embedding');
    for(let corner=0;corner<4;corner++) {
      const node=proxy.tetrahedra[tet*4+corner];
      if(!Number.isInteger(node)||node<0||node*3+2>=simulated.length) throw new Error('Invalid embedding node');
      for(let axis=0;axis<3;axis++) delta[axis]+=weights[corner]/sum*(simulated[node*3+axis]-targets[node*3+axis]);
    }
    if(!delta.every(Number.isFinite)) throw new Error('Non-finite render embedding');
    const length=Math.hypot(...delta),gain=length>0?Math.min(fade[vertex],caps[vertex]/length):0;
    for(let axis=0;axis<3;axis++) output[vertex*3+axis]=delta[axis]*gain*scale;
    // Float32 rounding must not expand the accessor-space vector beyond its cap.
    const radius=caps[vertex]*scale;
    let renderedLength=Math.hypot(output[vertex*3],output[vertex*3+1],output[vertex*3+2]);
    if(!Number.isFinite(renderedLength)||!Number.isFinite(radius)) throw new Error('Non-finite render embedding');
    if(renderedLength>radius) {
      const shrink=radius/renderedLength*(1-2**-23);
      for(let axis=0;axis<3;axis++) output[vertex*3+axis]*=shrink;
      renderedLength=Math.hypot(output[vertex*3],output[vertex*3+1],output[vertex*3+2]);
      if(renderedLength>radius) throw new Error('Render embedding exceeds tissue bound');
    }
  }
  return output;
}
