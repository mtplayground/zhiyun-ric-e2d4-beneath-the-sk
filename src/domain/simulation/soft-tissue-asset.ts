/** STP1 uses little-endian scalar arrays; sections may be unaligned. */
export type SoftTissueMetadata = {
  version: number;
  sourceHash: string;
  counts: { nodes: number; tetrahedra: number; edges: number; renderVertices: number };
  sections: { name: string; offset: number; bytes: number }[];
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
  const digest = await crypto.subtle.digest('SHA-256', sourceMesh);
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (metadata.version !== 1 || metadata.sourceHash !== hash || metadata.counts.renderVertices !== renderVertexCount) {
    throw new Error('Simulation asset does not match the render face mesh');
  }
  const expected: Record<string, [number, 'float' | 'uint' | 'byte']> = {
    nodes: [metadata.counts.nodes * 3, 'float'],
    tetrahedra: [metadata.counts.tetrahedra * 4, 'uint'],
    edges: [metadata.counts.edges * 2, 'uint'],
    labels: [metadata.counts.nodes, 'byte'],
    embedding: [metadata.counts.renderVertices * 5, 'float'],
  };
  const arrays: Record<string, Float32Array | Uint32Array | Uint8Array> = {};
  for (const [name, [count, type]] of Object.entries(expected)) {
    const section = metadata.sections.find(s => s.name === name);
    const bytes = count * (type === 'byte' ? 1 : 4);
    if (!section || section.bytes !== bytes || section.offset < 0 || headerEnd + section.offset + bytes > buffer.byteLength) throw new Error(`Invalid simulation section ${name}`);
    const start = headerEnd + section.offset;
    arrays[name] = type === 'byte' ? new Uint8Array(buffer.slice(start, start + bytes)) : type === 'float' ? Float32Array.from({ length: count }, (_, i) => view.getFloat32(start + i * 4, true)) : Uint32Array.from({ length: count }, (_, i) => view.getUint32(start + i * 4, true));
  }
  return {
    metadata,
    nodes: arrays.nodes as Float32Array,
    tetrahedra: arrays.tetrahedra as Uint32Array,
    edges: arrays.edges as Uint32Array,
    labels: arrays.labels as Uint8Array,
    embedding: arrays.embedding as Float32Array,
  };
}
