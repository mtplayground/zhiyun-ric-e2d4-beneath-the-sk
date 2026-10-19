export const EMBEDDING_OUTSIDE: number;
export const EMBEDDING_EXCLUDED: number;
export interface BoundedEmbeddingData {
  nodes: ArrayLike<number>;
  pairs: ArrayLike<number>;
  tetrahedra: ArrayLike<number>;
  embedding: ArrayLike<number>;
  embeddingFlags: ArrayLike<number>;
  embeddingFade: ArrayLike<number>;
  embeddingThickness: ArrayLike<number>;
  embeddingMaxOffsets: ArrayLike<number>;
}
export function validateBoundedEmbedding(proxy: BoundedEmbeddingData, maxOffsetFraction: number): void;
