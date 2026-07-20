export type BlendshapeName = string;

export type BlendshapeWeights = Record<BlendshapeName, number>;

export type VertexDeltaFrame = {
  positions?: Float32Array;
  normals?: Float32Array;
};

export type DeformationTargetPose = {
  id: string;
  label: string;
  blendshapeWeights: BlendshapeWeights;
};

export type DeformationFrameInput = {
  targetPose: DeformationTargetPose;
  progress: number;
  frameIndex: number;
  previousBlendshapeWeights: BlendshapeWeights;
};

export type DeformationFrame = {
  frameIndex: number;
  progress: number;
  blendshapeWeights: BlendshapeWeights;
  vertexDeltas?: VertexDeltaFrame;
};

export type DeformationProviderContext = {
  assetUrl: string;
  availableBlendshapes: readonly BlendshapeName[];
  initialBlendshapeWeights: BlendshapeWeights;
};

export type DeformationProviderReadyState = {
  providerId: string;
  availableBlendshapes: readonly BlendshapeName[];
};

export type DeformationWarmupResult = {
  cachedPoseCount: number;
  cachedFrameCount: number;
};

export interface DeformationProvider {
  readonly id: string;
  readonly label: string;
  initialize: (
    context: DeformationProviderContext,
  ) => Promise<DeformationProviderReadyState> | DeformationProviderReadyState;
  evaluateFrame: (input: DeformationFrameInput) => DeformationFrame;
  precompute?: (
    poses: readonly DeformationTargetPose[],
  ) => Promise<DeformationWarmupResult> | DeformationWarmupResult;
  dispose?: () => void;
}

export type DeformationProviderCapability = {
  blendshapeWeights: boolean;
  vertexDeltas: boolean;
  precompute: boolean;
};

export type ProviderSelectionPolicy = {
  envName: 'VITE_DEFORMATION_PROVIDER';
  defaultProvider: boolean;
  notes: readonly string[];
};

export type ProviderRegistryEntry = {
  id: string;
  label: string;
  description: string;
  capabilities: DeformationProviderCapability;
  createProvider: () => DeformationProvider;
  selection: ProviderSelectionPolicy;
};
