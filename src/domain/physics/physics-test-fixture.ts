/** Node-only fixture reader for milestone tests and the benchmark. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { SoftTissueMetadata } from '../simulation/soft-tissue-asset';

export function readMilestoneProxy(path = new URL('../../../public/data/facecap-soft-tissue.bin', import.meta.url)) {
  const bytes = readFileSync(path);
  if (bytes.toString('ascii',0,4)!=='STP1') throw new Error('Invalid proxy magic');
  const end = 8+bytes.readUInt32LE(4);
  const metadata = JSON.parse(bytes.toString('utf8',8,end)) as SoftTissueMetadata;
  function section(name:string, kind:'float'|'uint'|'byte') {
    const section=metadata.sections.find(s=>s.name===name);
    if(!section || section.offset<0 || end+section.offset+section.bytes>bytes.length) throw new Error(`Invalid ${name} section`);
    const start=end+section.offset;
    if(kind==='byte') return Uint8Array.from(bytes.subarray(start,start+section.bytes));
    if(section.bytes%4) throw new Error('Invalid section width');
    const values=Array.from({length:section.bytes/4},(_,i)=>kind==='float'?bytes.readFloatLE(start+i*4):bytes.readUInt32LE(start+i*4));
    return kind==='float'?Float64Array.from(values):Uint32Array.from(values);
  }
  return {
    asset: {metadata,nodes:section('nodes','float'),tetrahedra:section('tetrahedra','uint'),edges:section('edges','uint'),labels:section('labels','byte'),embedding:section('embedding','float')},
    assetHash:createHash('sha256').update(bytes).digest('hex'),
  };
}
