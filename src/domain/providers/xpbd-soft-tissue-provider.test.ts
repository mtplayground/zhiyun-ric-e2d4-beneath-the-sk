import { afterEach, describe, expect, it, vi } from 'vitest';
import { createXpbdSoftTissueProvider } from './xpbd-soft-tissue-provider';
import { createKinematicBlendshapeProvider } from './kinematic-blendshape-provider';
import { createPhysicsHost, type PhysicsHostOptions } from '../physics/physics-host';
import { providerRegistry } from './provider-registry';
import type { DeformationProviderContext } from './deformation-provider';

vi.mock('../physics/physics-host', () => ({ createPhysicsHost: vi.fn() }));
afterEach(() => vi.clearAllMocks());
const asset = {
  nodes: new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,0,-1]),
  labels: new Uint8Array([0,0,1,2]), tetrahedra: new Uint32Array([0,1,2,3]), edges: new Uint32Array([0,1]),
  embedding: new Float32Array([0,0.25,0.25,0.25,0.25]),
  metadata: { version:1, sourceHash:'test', sections:[], normalization:{center:[0,0,0],scale:2},counts:{nodes:4,tetrahedra:1,edges:1,renderVertices:1} },
};
const context: DeformationProviderContext = {
  assetUrl: '/face.glb', availableBlendshapes:['jaw_open'],initialBlendshapeWeights:{},
  physics: { sourceMesh:new ArrayBuffer(4),simProxyUrl:'/proxy.bin',surface:{positions:[0,0,0],morphTargets:{jaw_open:[0,-1,-1]},morphTargetsRelative:true} },
};
const input = { targetPose:{id:'aa',label:'AA',blendshapeWeights:{jawOpen:0.9}},previousBlendshapeWeights:{},progress:0.3,frameIndex:3 };
function setup() {
  const host = { ready:Promise.resolve(), sendFrame:vi.fn(),dispose:vi.fn() };
  vi.mocked(createPhysicsHost).mockReturnValue(host);
  const provider=createXpbdSoftTissueProvider(); provider.initialize(context);
  const callbacks = vi.mocked(createPhysicsHost).mock.calls.at(-1)![0] as PhysicsHostOptions;
  callbacks.onAssetReady!(asset);
  return {provider,host,callbacks};
}

describe('XPBD provider', () => {
  it('is registered with displacement support while kinematic remains the default', () => {
    expect(providerRegistry['xpbd-soft-tissue'].capabilities.vertexDeltas).toBe(true);
    expect(providerRegistry['kinematic-blendshape'].selection.defaultProvider).toBe(true);
    expect(providerRegistry['xpbd-soft-tissue'].selection.defaultProvider).toBe(false);
  });
  it('preserves the kinematic pose/control weights and sends mapped inputs', () => {
    const {provider,host}=setup();
    const kinematic=createKinematicBlendshapeProvider(); kinematic.initialize(context);
    const frame=provider.evaluateFrame(input);
    expect(frame.blendshapeWeights).toEqual(kinematic.evaluateFrame(input).blendshapeWeights);
    expect(host.sendFrame).toHaveBeenCalledWith(expect.objectContaining({poseTargets:expect.any(Float64Array),jawTransform:expect.any(Array)}));
    provider.dispose!();
  });
  it('returns zero offsets at the pose and embeds only simulated residuals', () => {
    const {provider,callbacks}=setup();
    const target=Float64Array.from(asset.nodes);
    callbacks.onPositions(target,{reset:false},target);
    expect(Array.from(provider.evaluateFrame(input).vertexDeltas!.positions!)).toEqual([0,0,0]);
    const simulated=target.slice(); simulated[0]+=0.2;
    callbacks.onPositions(simulated,{reset:false},target);
    const deltas=provider.updateVertexDeltas!({jawOpen:0.7})!.positions!;
    expect(deltas[0]).toBeCloseTo(0.1); // weight 0.25 * residual 0.2 * scale 2
    expect(deltas[1]).toBe(0);
    provider.dispose!();
  });
  it('clears output on numerical reset and ignores late worker messages after disable', () => {
    const {provider,callbacks,host}=setup();
    const target=Float64Array.from(asset.nodes), simulated=target.map(v=>v+0.1);
    callbacks.onPositions(simulated,{reset:false},target);
    expect(provider.updateVertexDeltas!({})?.positions).toBeDefined();
    callbacks.onPositions(target,{reset:true,reason:'test'},target);
    expect(provider.updateVertexDeltas!({})).toBeUndefined();
    provider.dispose!();
    callbacks.onPositions(simulated,{reset:false},target);
    expect(provider.updateVertexDeltas!({})).toBeUndefined();
    expect(host.dispose).toHaveBeenCalledOnce();
  });
  it('supports controls/precompute without mesh initialization', () => {
    const provider=createXpbdSoftTissueProvider();
    provider.initialize({...context,physics:undefined});
    expect(provider.evaluateFrame(input).vertexDeltas).toBeUndefined();
    expect(provider.precompute!([input.targetPose])).toEqual({cachedPoseCount:1,cachedFrameCount:0});
    provider.dispose!();
  });
});
