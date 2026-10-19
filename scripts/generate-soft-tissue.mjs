import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { BufferGeometry, Float32BufferAttribute, Vector3, Triangle } from 'three';
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
export async function readFace(bytes) {
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
  // Work in face-local coordinates normalized to maximum extent 1. This preserves
  // render accessor ordering and avoids camera/scene normalization dependencies.
  const positions=accessor(p.attributes.POSITION);
  const min=[0,1,2].map(i=>Math.min(...positions.map(p=>p[i])));
  const max=[0,1,2].map(i=>Math.max(...positions.map(p=>p[i])));
  const scale=Math.max(...max.map((v,i)=>v-min[i]));
  if(!(scale>0)) throw Error('Empty face bounds');
  return {positions:positions.map(p=>p.map((v,i)=>(v-(min[i]+max[i])/2)/scale)), indices:p.indices===undefined?positions.map((_,i)=>i):accessor(p.indices).flat(), normalization:{center:min.map((v,i)=>(v+max[i])/2),scale}};
}

export function generate(face,{target=3000,thickness=0.001,mouthLine=-0.12,upAxis=2}={}) {
  if(!Number.isInteger(target)||target<12||!Number.isFinite(thickness)||thickness<=0||!Number.isFinite(mouthLine)||![0,1,2].includes(upAxis)) throw Error('Invalid proxy options');
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(face.positions.flat(),3)); geometry.setIndex(face.indices);
  // Collapse edges rather than dropping triangles, retaining a connected surface.
  const desiredVertices=Math.max(4,Math.round(target/6));
  const unique=new Set(face.positions.map(p=>p.join(','))).size;
  let proxy=new SimplifyModifier().modify(geometry,Math.max(0,unique-desiredVertices));
  proxy = mergeVertices(toCreasedNormals(proxy, Math.PI / 6));
  const pos=proxy.getAttribute('position'),normal=proxy.getAttribute('normal');
  const nodes=Array.from({length:pos.count},(_,i)=>[pos.getX(i),pos.getY(i),pos.getZ(i)]);
  const n=nodes.length;
  for(let i=0;i<n;i++) nodes.push(nodes[i].map((v,j)=>Math.fround(v-thickness*normal.array[i*3+j])));
  if(nodes.some(p=>p.some(v=>!Number.isFinite(v)))) throw Error('Non-finite proxy node');
  const labels=nodes.map((p,i)=>i<n?0:p[upAxis]<mouthLine?2:1);
  const tetrahedra=[];
  const indices=Array.from(proxy.index.array);
  for(let i=0;i<indices.length;i+=3) {
    const [a,b,c]=indices.slice(i,i+3).sort((x,y)=>x-y);
    const cells=[[a,b,c,c+n],[a,b,c+n,b+n],[a,b+n,c+n,a+n]];
    const volumes=cells.map(t=>determinant(...t.map(k=>nodes[k])));
    if(volumes.some(v=>!Number.isFinite(v)||Math.abs(v)<1e-12)||volumes.some(v=>Math.sign(v)!==Math.sign(volumes[0]))) throw Error(`Inverted or near-zero layer cell ${i/3} (${volumes}); reduce thickness or increase target`);
    for(const t of cells) {if(volumes[0]<0) [t[0],t[1]]=[t[1],t[0]]; tetrahedra.push(t);}
  }
  if(!tetrahedra.length || tetrahedra.length >= 16777216) throw Error('Empty proxy or embedding index exceeds float32 precision');
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
  return {nodes,tetrahedra,edges,labels,embedding};
}

export function encode(asset,metadata) {
  const sections=[['nodes',Float32Array,asset.nodes.flat()],['tetrahedra',Uint32Array,asset.tetrahedra.flat()],['edges',Uint32Array,asset.edges.flat()],['labels',Uint8Array,asset.labels],['embedding',Float32Array,asset.embedding.flat()]];
  let offset=0;
  const buffers=sections.map(([name,Type,values])=>{const buffer=Buffer.from(new Type(values).buffer); const entry={name,offset,bytes:buffer.length};offset+=buffer.length;return {entry,buffer};});
  const header=Buffer.from(JSON.stringify({...metadata,version:1,counts:{nodes:asset.nodes.length,tetrahedra:asset.tetrahedra.length,edges:asset.edges.length,renderVertices:asset.embedding.length},sections:buffers.map(b=>b.entry)}));
  const prefix=Buffer.alloc(8);prefix.write('STP1');prefix.writeUInt32LE(header.length,4);
  return Buffer.concat([prefix,header,...buffers.map(b=>b.buffer)]);
}

export async function main(args=process.argv.slice(2)) {
  const options={source:DEFAULT_SOURCE,output:'public/data/facecap-soft-tissue.bin',target:3000,thickness:0.001,mouthLine:-0.12,upAxis:2};
  for(let i=0;i<args.length;i+=2) {
    const key={'--source':'source','--output':'output','--target':'target','--thickness':'thickness','--mouth-line':'mouthLine','--up-axis':'upAxis'}[args[i]];
    if(!key||args[i+1]===undefined) throw Error(`Unknown or incomplete option ${args[i]}`);
    options[key]=['source','output'].includes(key)?args[i+1]:Number(args[i+1]);
  }
  let bytes;
  if(/^https?:/.test(options.source)) {const response=await fetch(options.source);if(!response.ok) throw Error(`Source HTTP ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());}
  else bytes=await readFile(options.source);
  const face=await readFace(bytes), asset=generate(face,options);
  const output=encode(asset,{sourceHash:hash(bytes),source:options.source,normalization:face.normalization,options:{target:options.target,thickness:options.thickness,mouthLine:options.mouthLine,upAxis:options.upAxis},labels:{skin:0,skull:1,jaw:2}});
  await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});
  await writeFile(options.output,output);
  console.log(`Wrote ${options.output}: ${asset.nodes.length} nodes, ${asset.tetrahedra.length} tetrahedra, ${asset.embedding.length} embeddings`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{console.error(error);process.exitCode=1;});
