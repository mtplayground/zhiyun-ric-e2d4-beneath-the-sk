import { positionGroups, POSITION_TOLERANCE } from '../src/domain/physics/position-groups.mjs';
import { metresToProxyUnits } from '../src/domain/physics/physical-units.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { BufferGeometry, Float32BufferAttribute, Vector3, Triangle, Matrix4, Quaternion } from 'three';
import { toCreasedNormals, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const DEFAULT_SOURCE = 'https://threejs.org/examples/models/gltf/facecap.glb';
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const determinant = (a,b,c,d) => dot(sub(b,a),cross(sub(c,a),sub(d,a)));
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Neutral POSITION accessor of the morph-bearing face primitive. Eyes/teeth are rigid
// separate meshes and are deliberately excluded from this face-skin embedding.
// glTF world is Y-up. Pull world up/right into the face's source coordinates.
export function faceFrame(json, meshIndex) {
  const matches=[];
  function visit(index, parent, ancestors=new Set()) {
    if(ancestors.has(index)) throw Error('Cyclic glTF nodes');
    const node=json.nodes[index], local=new Matrix4();
    if(node.matrix) local.fromArray(node.matrix);
    else local.compose(new Vector3(...(node.translation??[0,0,0])),new Quaternion(...(node.rotation??[0,0,0,1])),new Vector3(...(node.scale??[1,1,1])));
    const world=parent.clone().multiply(local);
    if(node.mesh===meshIndex) matches.push(world);
    for(const child of node.children??[]) visit(child,world,new Set([...ancestors,index]));
  }
  const scene=json.scenes?.[json.scene??0];
  if(!scene) throw Error('Missing active glTF scene');
  for(const root of scene.nodes??[]) visit(root,new Matrix4());
  if(matches.length!==1) throw Error('Expected one face instance in active scene');
  const world=matches[0], columns=[0,1,2].map(i=>new Vector3().setFromMatrixColumn(world,i));
  const scales=columns.map(v=>v.length()), scale=scales[0];
  if(!Number.isFinite(scale)||!(scale>0)||scales.some(s=>Math.abs(s/scale-1)>1e-5)||columns.some((a,i)=>columns.some((b,j)=>i!==j&&Math.abs(a.dot(b)/(scale*scale))>1e-5))) throw Error('Face transform must have uniform nonzero scale without shear');
  const inverse=world.clone().invert();
  return {metresPerSourceUnit:scale, verticalAxis:new Vector3(0,1,0).transformDirection(inverse).toArray(), rightAxis:new Vector3(1,0,0).transformDirection(inverse).toArray()};
}

export function physicalUnits(positions, frame, explicitScale) {
  const scale=explicitScale??frame.metresPerSourceUnit;
  if(!Number.isFinite(scale)||scale<=0) throw Error('Invalid metres-per-source-unit');
  const extent=axis=>{const values=positions.map(p=>dot(p,axis));return (Math.max(...values)-Math.min(...values))*scale;};
  const measurements={widthMetres:extent(frame.rightAxis),heightMetres:extent(frame.verticalAxis)};
  const plausible=measurements.widthMetres>=0.10&&measurements.widthMetres<=0.25&&measurements.heightMetres>=0.14&&measurements.heightMetres<=0.35;
  if(!plausible&&explicitScale===undefined) throw Error(`Implausible adult face dimensions ${JSON.stringify(measurements)}; provide --metres-per-source-unit explicitly`);
  return {metresPerSourceUnit:scale,verticalAxis:frame.verticalAxis,measurements,scaleSource:explicitScale===undefined?'gltf':'explicit'};
}

export async function readFace(bytes, {metresPerSourceUnit}={}) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (data.getUint32(0,true)!==0x46546c67 || data.getUint32(4,true)!==2) throw Error('Expected GLB v2');
  const length=data.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+length)));
  const binary=bytes.subarray(28+length);
  const primitives=json.meshes.flatMap(m=>m.primitives).filter(p=>p.targets?.length);
  if(primitives.length!==1) throw Error('Expected exactly one morph-bearing face primitive');
  await MeshoptDecoder.ready;
  const cache=new Map();
  function accessor(index) {
    const a=json.accessors[index], v=json.bufferViews[a.bufferView];
    if(a.sparse) throw Error('Sparse accessors unsupported');
    if(!cache.has(a.bufferView)) {
      const e=v.extensions?.EXT_meshopt_compression;
      if(e) {
        const out=new Uint8Array(e.count*e.byteStride);
        MeshoptDecoder.decodeGltfBuffer(out,e.count,e.byteStride,binary.subarray(e.byteOffset,e.byteOffset+e.byteLength),e.mode,e.filter);
        cache.set(a.bufferView,out);
      } else cache.set(a.bufferView,binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength));
    }
    const buffer=cache.get(a.bufferView), view=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength);
    const types={5120:[1,'getInt8'],5121:[1,'getUint8'],5122:[2,'getInt16'],5123:[2,'getUint16'],5125:[4,'getUint32'],5126:[4,'getFloat32']};
    const [size,method]=types[a.componentType]??[];
    if(!size) throw Error('Unsupported accessor component');
    const width={SCALAR:1,VEC3:3}[a.type];
    if(!width) throw Error('Unsupported accessor shape');
    return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>view[method]((a.byteOffset??0)+i*(v.byteStride??size*width)+j*size,true)));
  }
  const p=primitives[0];
  const meshIndex=json.meshes.findIndex(m=>m.primitives.includes(p));
  const frame=faceFrame(json,meshIndex);
  // Work in face-local coordinates normalized to maximum extent 1. This preserves
  // render accessor ordering and avoids camera/scene normalization dependencies.
  const positions=accessor(p.attributes.POSITION);
  const units=physicalUnits(positions,frame,metresPerSourceUnit);
  const min=[0,1,2].map(i=>Math.min(...positions.map(p=>p[i])));
  const max=[0,1,2].map(i=>Math.max(...positions.map(p=>p[i])));
  const scale=Math.max(...max.map((v,i)=>v-min[i]));
  if(!(scale>0)) throw Error('Empty face bounds');
  return {diagnosticAxes:{rightAxis:frame.rightAxis,verticalAxis:frame.verticalAxis},units,positions:positions.map(p=>p.map((v,i)=>(v-(min[i]+max[i])/2)/scale)), indices:p.indices===undefined?positions.map((_,i)=>i):accessor(p.indices).flat(), normalization:{center:min.map((v,i)=>(v+max[i])/2),scale}};
}

// Simplification does not preserve triangle IDs. Associate a failed proxy triangle
// with the closest original source triangle, rather than inventing provenance.
export function offsetFailure(face,nodes,triangle,proxyTriangleIndex,thicknessMetres,reason) {
  const points=triangle.map(i=>new Vector3(...nodes[i]));
  const centroid=points.reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(1/3);
  const normal=new Triangle(...points).getNormal(new Vector3());
  let sourceTriangleIndex=-1, distance=Infinity;
  for(let i=0;i<face.indices.length;i+=3) {
    const tri=new Triangle(...face.indices.slice(i,i+3).map(k=>new Vector3(...face.positions[k])));
    const d=tri.closestPointToPoint(centroid,new Vector3()).distanceToSquared(centroid);
    if(d<distance) {distance=d;sourceTriangleIndex=i/3;}
  }
  const diagnostic={reason,proxyTriangleIndex,proxyVertexIndices:triangle,sourceTriangleIndex,
    sourceVertexIndices:face.indices.slice(sourceTriangleIndex*3,sourceTriangleIndex*3+3),
    sourceAssociation:'nearest triangle to proxy centroid',centroidProxy:centroid.toArray(),
    centroidSource:centroid.toArray().map((v,i)=>v*face.normalization.scale+face.normalization.center[i]),
    normal:normal.toArray(),requestedThicknessMetres:thicknessMetres,
    requestedThicknessProxy:metresToProxyUnits(thicknessMetres,face),
    nearestFacialRegion:'unknown: source has no anatomical region annotations'};
  const error=new Error(`Tissue offset failed: ${JSON.stringify(diagnostic)}`);
  error.diagnostic=diagnostic;
  return error;
}

function segmentCrossesTriangle(a,b,triangle) {
  const direction=b.clone().sub(a), edge1=triangle.b.clone().sub(triangle.a), edge2=triangle.c.clone().sub(triangle.a);
  const h=direction.clone().cross(edge2), det=edge1.dot(h), eps=1e-9;
  if(Math.abs(det)<eps) return false;
  const s=a.clone().sub(triangle.a), u=s.dot(h)/det;
  const q=s.clone().cross(edge1), v=direction.dot(q)/det, t=edge2.dot(q)/det;
  return u>eps&&v>eps&&u+v<1-eps&&t>eps&&t<1-eps;
}

export function validateOffset(face,nodes,indices,n,thicknessMetres) {
  const outer=[],inner=[];
  for(let i=0;i<indices.length;i+=3) {
    const ids=indices.slice(i,i+3);
    const a=new Triangle(...ids.map(k=>new Vector3(...nodes[k])));
    const b=new Triangle(...ids.map(k=>new Vector3(...nodes[k+n])));
    if(a.getNormal(new Vector3()).dot(b.getNormal(new Vector3()))<=0) throw offsetFailure(face,nodes,ids,i/3,thicknessMetres,'Inner triangle folded or collapsed');
    outer.push(a);inner.push(b);
  }
  function crosses(a,b) {
    return [[a.a,a.b],[a.b,a.c],[a.c,a.a]].some(([p,q])=>segmentCrossesTriangle(p,q,b))||
      [[b.a,b.b],[b.b,b.c],[b.c,b.a]].some(([p,q])=>segmentCrossesTriangle(p,q,a));
  }
  for(let i=0;i<inner.length;i++) {
    for(let j=0;j<outer.length;j++) {
      if(crosses(inner[i],outer[j])||(j>i&&crosses(inner[i],inner[j]))) {
        const error=offsetFailure(face,nodes,indices.slice(i*3,i*3+3),i,thicknessMetres,'Offset surface intersection');
        error.diagnostic.intersectingProxyTriangleIndex=j;
        error.message=`Tissue offset failed: ${JSON.stringify(error.diagnostic)}`;
        throw error;
      }
    }
  }
}

export function disconnectedCoincidences(face,geometry) {
  const attr=geometry.getAttribute('position');
  const positions=Array.from({length:attr.count},(_,i)=>[attr.getX(i),attr.getY(i),attr.getZ(i)]);
  const indices=Array.from(geometry.index.array);
  const parent=positions.map((_,i)=>i), neighbors=positions.map(()=>new Set());
  const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
  for(let i=0;i<indices.length;i+=3) {
    const ids=indices.slice(i,i+3);
    for(const a of ids) for(const b of ids) if(a!==b) {parent[root(a)]=root(b);neighbors[a].add(b);}
  }
  const up=face.diagnosticAxes?.verticalAxis??face.units.verticalAxis;
  const right=face.diagnosticAxes?.rightAxis??[1,0,0];
  const heights=face.positions.map(p=>dot(p,up)), widths=face.positions.map(p=>dot(p,right));
  const lo=Math.min(...heights),hi=Math.max(...heights),left=Math.min(...widths),rightBound=Math.max(...widths);
  const forehead=p=>dot(p,up)>=hi-0.25*(hi-lo)&&Math.abs(dot(p,right)-(left+rightBound)/2)<=0.3*(rightBound-left);
  const groups=positionGroups(positions).filter(g=>g.length>1).filter(g=>{
    // Distinguish a short real edge from disconnected local incident fans.
    const allowed=new Set(g),seen=new Set([g[0]]),queue=[g[0]];
    for(const a of queue) for(const b of neighbors[a]) if(allowed.has(b)&&!seen.has(b)) {seen.add(b);queue.push(b);}
    return seen.size!==g.length;
  }).map(g=>{
    const p=positions[g[0]];
    let nearest=Infinity;
    for(const q of face.positions) nearest=Math.min(nearest,Math.hypot(...sub(p,q)));
    const sourceVertices=face.positions.flatMap((q,i)=>Math.hypot(...sub(p,q))<=nearest+POSITION_TOLERANCE?[i]:[]);
    return {proxyVertices:g,positionsProxy:g.map(i=>positions[i]),
      positionsSource:g.map(i=>positions[i].map((v,k)=>v*face.normalization.scale+face.normalization.center[k])),
      sourceVertices,sourceAssociation:'nearest original accessor vertices',
      globalComponents:g.map(root),foreheadCandidate:forehead(p)};
  });
  return {toleranceProxy:POSITION_TOLERANCE,foreheadDefinition:'heuristic: upper 25% of vertical extent and central 60% of horizontal extent; not an anatomical annotation',
    disconnectedGroups:groups.length,foreheadGroups:groups.filter(g=>g.foreheadCandidate).length,groups};
}

export function weldPhysicalSurface(geometry) {
  const pos=geometry.getAttribute('position');
  const positions=Array.from({length:pos.count},(_,i)=>[pos.getX(i),pos.getY(i),pos.getZ(i)]);
  const used=new Set(geometry.index.array);
  const groups=positionGroups(positions).map(group=>group.filter(i=>used.has(i))).filter(group=>group.length), remap=new Map();
  groups.forEach((group,index)=>group.forEach(old=>remap.set(old,index)));
  const indices=Array.from(geometry.index.array,i=>remap.get(i));
  for(let i=0;i<indices.length;i+=3) if(new Set(indices.slice(i,i+3)).size!==3) throw Error(`Near-coincident weld collapses proxy triangle ${i/3}`);
  const welded=new BufferGeometry();
  welded.setAttribute('position',new Float32BufferAttribute(groups.flatMap(group=>positions[group[0]]),3));
  welded.setIndex(indices);
  welded.computeVertexNormals();
  return welded;
}

export function prepareSurface(face,{target=3000}={}) {
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(face.positions.flat(),3));geometry.setIndex(face.indices);
  const desiredVertices=Math.max(4,Math.round(target/6));
  const unique=new Set(face.positions.map(p=>p.join(','))).size;
  const simplified=new SimplifyModifier().modify(geometry,Math.max(0,unique-desiredVertices));
  const beforeNormalSplit=disconnectedCoincidences(face,simplified);
  const oldCreased=mergeVertices(toCreasedNormals(simplified.clone(),Math.PI/6));
  const before=disconnectedCoincidences(face,oldCreased);
  // Mechanical continuity is independent of shading normals. This face skin has
  // no supplied physical cut boundaries, so retain no shading-induced splits.
  // Remove normal attributes BEFORE welding: mergeVertices compares all attributes.
  const proxy=weldPhysicalSurface(simplified);
  const after=disconnectedCoincidences(face,proxy);
  if(after.disconnectedGroups) throw Error(`Disconnected coincident proxy vertices after welding: ${JSON.stringify(after)}`);
  return {proxy,topologyReport:{policy:'continuous physical skin; render shading creases do not split simulation nodes',beforeNormalSplit,beforeCreaseWeld:before,afterCreaseWeld:after}};
}

export function generate(face,{target=3000,thicknessMetres=0.012,mouthLine=-0.12,upAxis}={}) {
  if(!Number.isInteger(target)||target<12||!Number.isFinite(thicknessMetres)||thicknessMetres<=0||!Number.isFinite(mouthLine)||(upAxis!==undefined&&![0,1,2].includes(upAxis))) throw Error('Invalid proxy options');
  const thickness=metresToProxyUnits(thicknessMetres,face);
  const metresPerProxyUnit=1/metresToProxyUnits(1,face);
  const {proxy,topologyReport}=prepareSurface(face,{target});
  const pos=proxy.getAttribute('position'),normal=proxy.getAttribute('normal');
  const nodes=Array.from({length:pos.count},(_,i)=>[pos.getX(i),pos.getY(i),pos.getZ(i)]);
  const n=nodes.length;
  for(let i=0;i<n;i++) nodes.push(nodes[i].map((v,j)=>Math.fround(v-thickness*normal.array[i*3+j])));
  if(nodes.some(p=>p.some(v=>!Number.isFinite(v)))) throw Error('Non-finite proxy node');
  const vertical=upAxis===undefined?(face.units?.verticalAxis??[0,0,1]):[0,1,2].map(i=>i===upAxis?1:0);
  const labels=nodes.map((p,i)=>i<n?0:dot(p,vertical)<mouthLine?2:1);
  const pairs=Array.from({length:n},(_,i)=>[i,i+n]);
  const tetrahedra=[];
  const indices=Array.from(proxy.index.array);
  for(let i=0;i<indices.length;i+=3) {
    const [a,b,c]=indices.slice(i,i+3).sort((x,y)=>x-y);
    const cells=[[a,b,c,c+n],[a,b,c+n,b+n],[a,b+n,c+n,a+n]];
    const volumes=cells.map(t=>determinant(...t.map(k=>nodes[k])));
    if(volumes.some(v=>!Number.isFinite(v)||Math.abs(v)<1e-12)||volumes.some(v=>Math.sign(v)!==Math.sign(volumes[0]))) throw offsetFailure(face,nodes,indices.slice(i,i+3),i/3,thicknessMetres,'Inverted or near-zero layer cell');
    for(const t of cells) {if(volumes[0]<0) [t[0],t[1]]=[t[1],t[0]]; tetrahedra.push(t);}
  }
  if(!tetrahedra.length || tetrahedra.length >= 16777216) throw Error('Empty proxy or embedding index exceeds float32 precision');
  // Detect folded inner faces and crossings, beyond per-prism determinant checks.
  validateOffset(face,nodes,indices,n,thicknessMetres);
  const masses=Array(nodes.length).fill(0);
  for(const t of tetrahedra) {
    const mass=determinant(...t.map(k=>nodes[k]))/6 * metresPerProxyUnit**3 * 1000;
    for(const k of t) masses[k]+=mass/4;
  }
  if(masses.some(m=>!Number.isFinite(m)||m<=0)) throw Error('Non-positive or non-finite SI node mass');
  const edges=[...new Set(tetrahedra.flatMap(t=>t.flatMap((a,i)=>t.slice(i+1).map(b=>[Math.min(a,b),Math.max(a,b)].join(',')))))].map(s=>s.split(',').map(Number));
  const embedding=face.positions.map(p=>{
    let best=null, distance=Infinity;
    for(let ti=0;ti<tetrahedra.length;ti++) {
      const t=tetrahedra[ti].map(k=>nodes[k]), [a,b,c,d]=t, det=determinant(a,b,c,d);
      const w=[determinant(p,b,c,d)/det,determinant(a,p,c,d)/det,determinant(a,b,p,d)/det,determinant(a,b,c,p)/det];
      if(w.every(v=>v>=-1e-8&&v<=1+1e-8)) return [ti,...w];
      // Exact closest point on the tetrahedron, not a centroid heuristic.
      for(const f of [[0,1,2],[0,1,3],[0,2,3],[1,2,3]]) {
        const tri=new Triangle(...f.map(i=>new Vector3(...t[i]))), q=tri.closestPointToPoint(new Vector3(...p),new Vector3());
        const dist=q.distanceToSquared(new Vector3(...p));
        if(dist<distance) {
          const bary=tri.getBarycoord(q,new Vector3()); const weights=[0,0,0,0];
          f.forEach((k,j)=>weights[k]=bary.getComponent(j)); best=[ti,...weights]; distance=dist;
        }
      }
    }
    if(!best||!best.every(Number.isFinite)) throw Error('Render vertex without embedding');
    return best;
  });
  return {nodes,tetrahedra,edges,labels,embedding,pairs,masses,topologyReport};
}

export function encode(asset,metadata) {
  const sections=[['nodes',Float32Array,asset.nodes.flat()],['tetrahedra',Uint32Array,asset.tetrahedra.flat()],['edges',Uint32Array,asset.edges.flat()],['labels',Uint8Array,asset.labels],['embedding',Float32Array,asset.embedding.flat()],['pairs',Uint32Array,asset.pairs.flat()],['masses',Float64Array,asset.masses]];
  let offset=0;
  const buffers=sections.map(([name,Type,values])=>{const buffer=Buffer.from(new Type(values).buffer); const entry={name,offset,bytes:buffer.length};offset+=buffer.length;return {entry,buffer};});
  const header=Buffer.from(JSON.stringify({...metadata,version:2,labelsPurpose:'visualization-only',densityKgPerCubicMetre:1000,counts:{nodes:asset.nodes.length,tetrahedra:asset.tetrahedra.length,edges:asset.edges.length,pairs:asset.pairs.length,renderVertices:asset.embedding.length},sections:buffers.map(b=>b.entry)}));
  const prefix=Buffer.alloc(8);prefix.write('STP1');prefix.writeUInt32LE(header.length,4);
  return Buffer.concat([prefix,header,...buffers.map(b=>b.buffer)]);
}

export async function main(args=process.argv.slice(2)) {
  const options={source:DEFAULT_SOURCE,output:'public/data/facecap-soft-tissue.bin',topologyReport:'docs/facecap-topology.json',target:3000,thicknessMetres:0.012,mouthLine:-0.12};
  for(let i=0;i<args.length;i+=2) {
    const key={'--metres-per-source-unit':'metresPerSourceUnit','--topology-report':'topologyReport','--source':'source','--output':'output','--target':'target','--thickness-metres':'thicknessMetres','--mouth-line':'mouthLine'}[args[i]];
    if(!key||args[i+1]===undefined) throw Error(`Unknown or incomplete option ${args[i]}`);
    options[key]=['source','output','topologyReport'].includes(key)?args[i+1]:Number(args[i+1]);
  }
  let bytes;
  if(/^https?:/.test(options.source)) {const response=await fetch(options.source);if(!response.ok) throw Error(`Source HTTP ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());}
  else bytes=await readFile(options.source);
  const face=await readFace(bytes,options);
  // Write investigation data before attempting the mandatory 12 mm layer, so a
  // failed offset cannot hide evidence about the surface topology.
  await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});
  const {topologyReport}=prepareSurface(face,options);
  await writeFile(options.topologyReport,JSON.stringify({source:options.source,sourceHash:hash(bytes),target:options.target,...topologyReport},null,2)+'\n');
  let asset;
  try {asset=generate(face,options);}
  catch(error) {
    if(error.diagnostic) {
      let retainedAssetSha256=null;
      try {retainedAssetSha256=hash(await readFile(options.output));} catch { /* first generation may have no asset */ }
      await writeFile('docs/soft-tissue-generation-failure.json',JSON.stringify({source:options.source,sourceHash:hash(bytes),retainedAssetSha256,renderVertices:face.positions.length,
        options:{target:options.target,thicknessMetres:options.thicknessMetres,mouthLine:options.mouthLine,metresPerSourceUnit:options.metresPerSourceUnit},diagnostic:error.diagnostic},null,2)+'\n');
    }
    throw error;
  }
  const output=encode(asset,{sourceHash:hash(bytes),source:options.source,normalization:face.normalization,units:face.units,options:{target:options.target,thicknessMetres:options.thicknessMetres,mouthLine:options.mouthLine,upAxis:options.upAxis,metresPerSourceUnit:options.metresPerSourceUnit},labels:{skin:0,skull:1,jaw:2}});
  await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});
  await writeFile(options.output,output);
  console.log(`Wrote ${options.output}: ${asset.nodes.length} nodes, ${asset.tetrahedra.length} tetrahedra, ${asset.embedding.length} embeddings`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{console.error(error);process.exitCode=1;});
