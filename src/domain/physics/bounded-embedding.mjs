export const EMBEDDING_OUTSIDE = 1;
export const EMBEDDING_EXCLUDED = 2;

/** Validate the bound after serialization as well as at generation time.
 * Runtime clips the final convex residual to maxOffsets before rendering. */
export function validateBoundedEmbedding(proxy, maxOffsetFraction) {
  if (!Number.isFinite(maxOffsetFraction) || maxOffsetFraction <= 0 || maxOffsetFraction > 1) throw new Error('Invalid embedding offset fraction');
  const count=proxy.embedding.length/5;
  for(const name of ['embeddingFlags','embeddingFade','embeddingThickness','embeddingMaxOffsets']) {
    if(!proxy[name] || proxy[name].length!==count) throw new Error(`Missing or invalid bounded embedding section ${name}; regenerate asset`);
  }
  const thickness=new Float64Array(proxy.nodes.length/3),seen=new Set();
  if(proxy.pairs.length!==thickness.length) throw new Error('Invalid embedding node pairs');
  for(let i=0;i<proxy.pairs.length;i+=2) {
    const a=proxy.pairs[i],b=proxy.pairs[i+1];
    for(const node of [a,b]) {
      if(!Number.isInteger(node)||node<0||node>=thickness.length||seen.has(node)) throw new Error('Invalid embedding node pairs');
      seen.add(node);
    }
    const d=Math.hypot(...[0,1,2].map(axis=>proxy.nodes[a*3+axis]-proxy.nodes[b*3+axis]));
    if(!Number.isFinite(d)||d<=0) throw new Error('Invalid local tissue thickness');
    thickness[a]=thickness[b]=d;
  }
  for(let vertex=0;vertex<count;vertex++) {
    const r=vertex*5,tet=proxy.embedding[r],flags=proxy.embeddingFlags[vertex],fade=proxy.embeddingFade[vertex];
    const local=proxy.embeddingThickness[vertex],cap=proxy.embeddingMaxOffsets[vertex];
    if(!Number.isInteger(tet)||tet<0||tet*4+3>=proxy.tetrahedra.length||![0,1,2,3].includes(flags)||!Number.isFinite(fade)||fade<0||fade>1) throw new Error(`Invalid embedding policy at render vertex ${vertex}`);
    let sum=0,expected=0;
    for(let corner=0;corner<4;corner++) {
      const w=proxy.embedding[r+1+corner],node=proxy.tetrahedra[tet*4+corner];
      if(!Number.isInteger(node)||node<0||node>=thickness.length||!Number.isFinite(w)||w<0||w>1) throw new Error(`Extrapolated embedding at render vertex ${vertex}`);
      sum+=w;expected+=w*thickness[node];
    }
    if(Math.abs(sum-1)>1e-6) throw new Error(`Non-convex embedding at render vertex ${vertex}`);
    expected/=sum;
    if(!Number.isFinite(local)||local<=0||Math.abs(local-expected)>1e-9*Math.max(1,expected)||!Number.isFinite(cap)||cap<0||cap>maxOffsetFraction*expected) throw new Error(`Embedding exceeds local tissue offset bound at render vertex ${vertex}`);
    if((flags&EMBEDDING_EXCLUDED) && (fade!==0||cap!==0)) throw new Error(`Excluded render vertex ${vertex} has a simulation offset`);
    if(!(flags&(EMBEDDING_OUTSIDE|EMBEDDING_EXCLUDED))&&fade!==1) throw new Error(`Invalid interior fade at render vertex ${vertex}`);
  }
}
