import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';

/** Small deterministic generated mesh, not a substitute for the real FaceCap
 * content-integrity test or committed-proxy benchmark. No external requests. */
export function physicsFixture() {
  const positions=[-0.5,-0.5,0, 0.5,-0.5,0, 0,0.5,0, 0,0,0.5];
  const indices=[0,2,1,0,1,3,1,2,3,2,0,3];
  const morphs=[
    [0,-0.12,-0.08,0,-0.12,-0.08,0,0,0,0,0,0],
    [-0.1,0.1,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0.1,0.1,0,0,0,0,0,0,0],
  ];
  const chunks:Buffer[]=[],bufferViews:Record<string,number>[]=[],accessors:Record<string,unknown>[]=[];
  let offset=0;
  function attribute(values:number[],type:string,componentType=5126) {
    const bytes=Buffer.from(componentType===5126?new Float32Array(values).buffer:new Uint16Array(values).buffer);
    bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});
    const accessor=accessors.length;
    accessors.push({bufferView:bufferViews.length-1,componentType,count:values.length/(type==='VEC3'?3:1),type,...(accessor===0?{min:[-0.5,-0.5,0],max:[0.5,0.5,0.5]}:{})});
    chunks.push(bytes);offset+=bytes.length;
    const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
    return accessor;
  }
  const position=attribute(positions,'VEC3'),index=attribute(indices,'SCALAR',5123);
  const targets=morphs.map(delta=>({POSITION:attribute(delta,'VEC3')}));
  const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{extras:{targetNames:['jawOpen','mouthSmile_L','mouthSmile_R']},primitives:[{attributes:{POSITION:position},indices:index,targets}]}],buffers:[{byteLength:offset}],bufferViews,accessors};
  const raw=Buffer.from(JSON.stringify(json)),padding=(4-raw.length%4)%4;
  const text=Buffer.concat([raw,Buffer.alloc(padding,0x20)]),bin=Buffer.concat(chunks);
  const glb=Buffer.alloc(12+8+text.length+8+bin.length);
  glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);
  glb.writeUInt32LE(text.length,12);glb.writeUInt32LE(0x4e4f534a,16);text.copy(glb,20);
  const binaryStart=20+text.length;glb.writeUInt32LE(bin.length,binaryStart);glb.writeUInt32LE(0x004e4942,binaryStart+4);bin.copy(glb,binaryStart+8);
  const arrays={nodes:new Float32Array([...positions,0,0,0.1,0,-0.2,0.1]),tetrahedra:new Uint32Array([0,1,2,3]),edges:new Uint32Array([0,1,0,2,0,3,1,2,1,3,2,3,0,4,1,4,0,5,1,5]),labels:new Uint8Array([0,0,0,0,1,2]),embedding:new Float32Array([0,1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1])};
  const sections:{name:string;offset:number;bytes:number}[]=[];const payload:Buffer[]=[];offset=0;
  for(const [name,array] of Object.entries(arrays)) {const bytes=Buffer.from(array.buffer);sections.push({name,offset,bytes:bytes.length});payload.push(bytes);offset+=bytes.length;}
  const metadata={version:1,sourceHash:createHash('sha256').update(glb).digest('hex'),counts:{nodes:6,tetrahedra:1,edges:10,renderVertices:4},normalization:{center:[0,0,0],scale:1},sections};
  function proxy(mismatch=false) {
    const header=Buffer.from(JSON.stringify({...metadata,sourceHash:mismatch?'0'.repeat(64):metadata.sourceHash}));
    const prefix=Buffer.alloc(8);prefix.write('STP1');prefix.writeUInt32LE(header.length,4);
    return Buffer.concat([prefix,header,...payload]);
  }
  return {glb,proxy};
}
export async function servePhysicsFixture(page:Page,mismatch=false,workersUnavailable=false) {
  const fixture=physicsFixture();
  const requests={mesh:0,proxy:0};
  await page.route('**/facecap.glb',async route=>{requests.mesh++;await route.fulfill({contentType:'model/gltf-binary',body:fixture.glb});});
  await page.route('**/facecap-soft-tissue.bin',async route=>{requests.proxy++;await route.fulfill({contentType:'application/octet-stream',body:fixture.proxy(mismatch)});});
  await page.addInitScript(({unavailable})=>{
    const stats={created:0,active:0};
    Object.assign(window,{__physicsWorkers:stats});
    if(unavailable) {Object.defineProperty(window,'Worker',{value:undefined,configurable:true});return;}
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
      private stopped=false;
      constructor(url:string|URL,options?:WorkerOptions) {super(url,options);stats.created++;stats.active++;}
      terminate(){if(!this.stopped){this.stopped=true;stats.active--;}super.terminate();}
    };
  },{unavailable:workersUnavailable});
  return requests;
}
