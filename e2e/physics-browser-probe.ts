/** Dev-server-only test helper; never imported by the application or copied to public/. */
import { _roots } from '@react-three/fiber';
import { Mesh, type BufferAttribute, type InterleavedBufferAttribute } from 'three';
import { usePhysicsTelemetry } from '../src/state/physics-telemetry-state';
import { getPoseWeights, findPoseMappingById } from '../src/domain/poses/pose-library';
import { interpolateBlendshapeWeights } from '../src/domain/providers/kinematic-blendshape-provider';

type Attribute=BufferAttribute|InterleavedBufferAttribute;
function root() {
  const canvas=document.querySelector('canvas');
  if(!canvas) throw new Error('No render canvas');
  const state=_roots.get(canvas)?.store.getState();
  if(!state) throw new Error('No R3F scene');
  return state;
}
function face() {
  const faces:Mesh[]=[];
  root().scene.traverse(object=>{if(object instanceof Mesh&&object.geometry.morphAttributes.position?.length) faces.push(object);});
  if(faces.length!==1) throw new Error(`Expected real FaceCap face primitive, found ${faces.length}`);
  return faces[0];
}
let original:ReturnType<typeof rememberData>|undefined;
function rememberData() {
  const mesh=face(),geometry=mesh.geometry;
  const attrs=Object.entries(geometry.attributes);
  const morphs=Object.entries(geometry.morphAttributes).map(([name,attributes])=>({name,array:attributes!,elements:[...attributes!]}));
  const buffers=[...new Set([...attrs.map(([,a])=>a),...morphs.flatMap(({elements})=>elements)].map(a=>(a as Attribute).array.buffer))];
  return {mesh,geometry,material:mesh.material,culling:mesh.frustumCulled,attrs,morphs,buffers};
}
let hashes:string[]=[];
async function bufferHashes(buffers:ArrayBufferLike[]) {
  return Promise.all(buffers.map(async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(new Uint8Array(bytes))))).map(b=>b.toString(16).padStart(2,'0')).join('')));
}
export async function rememberFace() {
  original=rememberData();hashes=await bufferHashes(original.buffers);
  return {vertices:original.geometry.getAttribute('position').count,morphs:original.mesh.morphTargetInfluences?.length??0};
}
export async function integrity(physics:boolean) {
  if(!original) throw new Error('Face identity was not recorded');
  const mesh=face(),g=mesh.geometry;
  const sameMorphs=original.morphs.every(({name,array,elements})=>g.morphAttributes[name]===array&&elements.every((a,i)=>g.morphAttributes[name]![i]===a));
  return {sameMesh:mesh===original.mesh,sameGeometry:g===original.geometry,
    sameBase:original.attrs.every(([name,a])=>g.getAttribute(name)===a),sameMorphs,
    sameBytes:JSON.stringify(await bufferHashes(original.buffers))===JSON.stringify(hashes),
    originalMaterial:mesh.material===original.material,cullingRestored:mesh.frustumCulled===original.culling,
    offsetAttribute:g.hasAttribute('simulationOffset'),physics};
}
export function poseReady(id:string) {
  const mesh=face(),pose=findPoseMappingById(id);
  if(!pose) throw new Error(`Unknown test pose ${id}`);
  const dictionary=mesh.morphTargetDictionary??{},available=new Set(Object.keys(dictionary));
  const expected=interpolateBlendshapeWeights({fromWeights:{},targetWeights:getPoseWeights(pose,'kinematic-blendshape'),progress:1,availableBlendshapes:available});
  return Object.entries(dictionary).every(([name,index])=>Number.isFinite(mesh.morphTargetInfluences![index])&&Math.abs(mesh.morphTargetInfluences![index]-(expected[name]??0))<1e-7);
}
export function sample() {
  const mesh=face(),snapshot=usePhysicsTelemetry.getState().snapshot;
  const attribute=mesh.geometry.getAttribute('simulationOffset');
  if(!snapshot||!attribute) return {ready:false,finite:false,maxDistance:Infinity,maxOffsetMetres:Infinity,boundRatio:Infinity,resets:-1,webglError:root().gl.getContext().getError()};
  let finite=true,maxOffsetMetres=0,boundRatio=0;
  const metresPerSource=snapshot.proxy.metadata.units.metresPerSourceUnit;
  for(let i=0;i<attribute.count;i++) {
    const length=Math.hypot(attribute.getX(i),attribute.getY(i),attribute.getZ(i));
    const cap=snapshot.proxy.embeddingMaxOffsets![i]*snapshot.proxy.metadata.normalization.scale;
    finite&&=Number.isFinite(length);
    maxOffsetMetres=Math.max(maxOffsetMetres,length*metresPerSource);
    boundRatio=Math.max(boundRatio,cap>0?length/cap:length===0?0:Infinity);
  }
  finite&&=Array.from(snapshot.positions).every(Number.isFinite)&&Array.from(snapshot.poseTargets).every(Number.isFinite)&&Array.from(snapshot.telemetry.nodePoseDistancesMetres).every(Number.isFinite);
  return {ready:true,finite,maxDistance:snapshot.telemetry.maxDisplacement,maxOffsetMetres,boundRatio,resets:snapshot.telemetry.nonFiniteResets,webglError:root().gl.getContext().getError()};
}
export async function pixels() {
  // Capture after an actual WebGL render, using only the scene canvas (no changing DOM readouts).
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  const source=root().gl.domElement,canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d')!;ctx.drawImage(source,0,0,256,256);
  return Array.from(ctx.getImageData(0,0,256,256).data);
}
