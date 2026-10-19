import { validatePhysicalUnits, type PhysicalUnits } from '../physics/physical-units';

/** STP1 uses little-endian scalar arrays; sections may be unaligned. */
export type SoftTissueMetadata = {
  version: number;
  sourceHash: string;
  counts: { nodes: number; tetrahedra: number; edges: number; pairs: number; renderVertices: number };
  sections: { name: string; offset: number; bytes: number }[];
  units: PhysicalUnits;
  normalization: { center: number[]; scale: number };
};

export async function loadSoftTissueAsset(
  buffer: ArrayBuffer,
  sourceMesh: ArrayBuffer,
  renderVertexCount: number,
) {
  const view = new DataView(buffer);
  if (view.byteLength < 8 || view.getUint32(0, true) !== 0x31505453) throw new Error('Invalid simulation asset');
  const headerEnd = 8 + view.getUint32(4, true);
  if (headerEnd > buffer.byteLength) throw new Error('Truncated simulation asset');
  const metadata = JSON.parse(new TextDecoder().decode(buffer.slice(8, headerEnd))) as SoftTissueMetadata;
  if (metadata.version !== 2) throw new Error(`Unsupported simulation asset version ${metadata.version}; regenerate as version 2 with SI masses and explicit pairs`);
  const digest = await crypto.subtle.digest('SHA-256', sourceMesh);
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (metadata.sourceHash !== hash || metadata.counts.renderVertices !== renderVertexCount) {
    throw new Error('Simulation asset does not match the render face mesh');
  }
  validatePhysicalUnits(metadata);
  for (const count of Object.values(metadata.counts)) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid simulation counts');
  }
  if (!metadata.counts.nodes || metadata.counts.pairs * 2 !== metadata.counts.nodes) throw new Error('Invalid simulation pair count');
  const expected: Record<string, [number, 'float' | 'double' | 'uint' | 'byte']> = {
    nodes: [metadata.counts.nodes * 3, 'float'],
    tetrahedra: [metadata.counts.tetrahedra * 4, 'uint'],
    edges: [metadata.counts.edges * 2, 'uint'],
    labels: [metadata.counts.nodes, 'byte'],
    embedding: [metadata.counts.renderVertices * 5, 'float'],
    pairs: [metadata.counts.pairs * 2, 'uint'],
    masses: [metadata.counts.nodes, 'double'],
  };
  const arrays: Record<string, Float32Array | Float64Array | Uint32Array | Uint8Array> = {};
  for (const [name, [count, type]] of Object.entries(expected)) {
    const section = metadata.sections.find(s => s.name === name);
    const bytes = count * (type === 'byte' ? 1 : type === 'double' ? 8 : 4);
    if (!section || section.bytes !== bytes || !Number.isSafeInteger(section.offset) || section.offset < 0 || headerEnd + section.offset + bytes > buffer.byteLength) throw new Error(`Invalid simulation section ${name}`);
    const start = headerEnd + section.offset;
    arrays[name] = type === 'byte' ? new Uint8Array(buffer.slice(start, start + bytes)) : type === 'double' ? Float64Array.from({ length: count }, (_, i) => view.getFloat64(start + i * 8, true)) : type === 'float' ? Float32Array.from({ length: count }, (_, i) => view.getFloat32(start + i * 4, true)) : Uint32Array.from({ length: count }, (_, i) => view.getUint32(start + i * 4, true));
  }
  const pairs=arrays.pairs as Uint32Array;
  const masses=arrays.masses as Float64Array;
  const paired=new Set<number>();
  if (metadata.counts.pairs * 2 !== metadata.counts.nodes) throw new Error('Invalid simulation pair count');
  for (const index of pairs) {
    if (index >= metadata.counts.nodes || paired.has(index)) throw new Error('Invalid simulation pair table');
    paired.add(index);
  }
  if (masses.some(mass => !Number.isFinite(mass) || mass <= 0)) throw new Error('Invalid simulation SI masses');
  return {
    metadata,
    pairs,
    masses,
    nodes: arrays.nodes as Float32Array,
    tetrahedra: arrays.tetrahedra as Uint32Array,
    edges: arrays.edges as Uint32Array,
    labels: arrays.labels as Uint8Array,
    embedding: arrays.embedding as Float32Array,
  };
}
