import type { PhysicsSnapshot } from '../physics/physics-telemetry';
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
  embeddingFlags:new Uint8Array([0]),embeddingFade:new Float32Array([1]),embeddingThickness:new Float64Array([1]),embeddingMaxOffsets:new Float64Array([0.5]),
  masses: new Float64Array([0.002,0.003,0.004,0.005]), pairs: new Uint32Array([0,2,1,3]),
  metadata: { embeddingPolicy:{maxOffsetFraction:0.5,outsideToleranceMetres:0.00001,fadeDistanceThicknesses:1}, version:3, sourceHash:'test', sections:[], units:{metresPerSourceUnit:1,verticalAxis:[0,0,1]}, normalization:{center:[0,0,0],scale:2},counts:{nodes:4,tetrahedra:1,edges:1,pairs:2,renderVertices:1} },
};
const context: DeformationProviderContext = {
  assetUrl: '/face.glb', availableBlendshapes:['jaw_open'],initialBlendshapeWeights:{},
  physics: { sourceMesh:new ArrayBuffer(4),simProxyUrl:'/proxy.bin',surface:{positions:[0,0,0],morphTargets:{jaw_open:[0,-1,-1]},morphTargetsRelative:true} },
};
const input = { targetPose:{id:'aa',label:'AA',blendshapeWeights:{jawOpen:0.9}},previousBlendshapeWeights:{},progress:0.3,frameIndex:3 };
function setup(onSnapshot?: (snapshot: PhysicsSnapshot) => void) {
  const host = { ready:Promise.resolve(), sendFrame:vi.fn(),configure:vi.fn(),reset:vi.fn(),dispose:vi.fn() };
  vi.mocked(createPhysicsHost).mockReturnValue(host);
  const provider=createXpbdSoftTissueProvider(); provider.initialize({...context,physics:{...context.physics!,onSnapshot}});
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
    expect(host.sendFrame).toHaveBeenCalledWith(expect.objectContaining({poseTargets:expect.any(Float64Array)}));
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
  it('publishes matching targets and SI pose distances for all nodes, including inner nodes',()=>{
    const onSnapshot=vi.fn();const {provider,callbacks}=setup(onSnapshot);
    const targets=Float64Array.from(asset.nodes),positions=targets.slice();positions[0]+=0.2;positions[11]+=0.1;
    callbacks.onPositions(positions,{reset:false},targets,{solverTimeMs:1,simulationRateHz:60,nonFiniteResets:0});
    const snapshot=onSnapshot.mock.calls[0][0] as PhysicsSnapshot;
    expect(snapshot.poseTargets).toBe(targets);
    expect(snapshot.telemetry.nodePoseDistancesMetres).toHaveLength(4);
    expect(snapshot.telemetry.nodePoseDistancesMetres[0]).toBeCloseTo(0.4);
    expect(snapshot.telemetry.nodePoseDistancesMetres[3]).toBeCloseTo(0.2);
    expect(snapshot.telemetry.meanPoseError).toBeCloseTo(0.15);
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
  it('forwards live tuning and explicit reset without replacing the backend', () => {
    const {provider,host}=setup();
    provider.configurePhysics!({distanceCompliance:0.01,poseCompliance:0.02,damping:4,gravity:[0,0,-5]});
    expect(host.configure).toHaveBeenCalledWith({distanceCompliance:0.01,poseCompliance:0.02,damping:4,gravity:[0,0,-5]});
    provider.resetSimulation!();
    expect(host.reset).toHaveBeenCalledOnce();
    expect(createPhysicsHost).toHaveBeenCalledOnce();
    provider.dispose!();
  });
  it('supports controls/precompute without mesh initialization', () => {
    const provider=createXpbdSoftTissueProvider();
    provider.initialize({...context,physics:undefined});
    expect(provider.evaluateFrame(input).vertexDeltas).toBeUndefined();
    expect(provider.precompute!([input.targetPose])).toEqual({cachedPoseCount:1,cachedFrameCount:0});
    provider.dispose!();
  });
});
