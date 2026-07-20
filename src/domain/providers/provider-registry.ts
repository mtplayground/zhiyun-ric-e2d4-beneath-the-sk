import type { ProviderRegistryEntry } from './deformation-provider';

export const providerRegistry = {
  'kinematic-blendshape': {
    id: 'kinematic-blendshape',
    label: 'Kinematic blendshape provider',
    description:
      'Computes per-frame morph target weights directly from target-pose blendshape values. A future precomputed provider can keep the same controls, viewport, readout, and curve contracts by returning the same DeformationFrame shape.',
    capabilities: {
      blendshapeWeights: true,
      vertexDeltas: false,
      precompute: false,
    },
    selection: {
      envName: 'VITE_DEFORMATION_PROVIDER',
      defaultProvider: true,
      notes: [
        'The env loader validates VITE_DEFORMATION_PROVIDER against this registry before the app boots.',
        'Viewport code should ask the registry for the selected provider id, then instantiate the matching implementation when provider factories are introduced.',
        'Controls dispatch target poses and normalized progress only; they do not branch on provider implementation details.',
      ],
    },
  },
} as const satisfies Record<string, ProviderRegistryEntry>;

export type DeformationProviderId = keyof typeof providerRegistry;

export const deformationProviderIds = Object.keys(
  providerRegistry,
) as DeformationProviderId[];

export function isDeformationProviderId(
  value: string,
): value is DeformationProviderId {
  return deformationProviderIds.includes(value as DeformationProviderId);
}

export function getProviderRegistryEntry(
  providerId: DeformationProviderId,
): ProviderRegistryEntry {
  return providerRegistry[providerId];
}
