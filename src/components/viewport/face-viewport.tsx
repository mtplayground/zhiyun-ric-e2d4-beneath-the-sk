import { usePhysicsTelemetry, physicsStatusLabel, type PhysicsStatus } from '@/state/physics-telemetry-state';
import PhysicsDebugOverlay from './physics-debug-overlay';
import { OFFSET_HEATMAP_MAX_MM } from './render-offset-layer';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ACESFilmicToneMapping,
  SRGBColorSpace,
  type ColorRepresentation,
} from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';

import { usePhysicsState, OFFSET_MAGNIFICATIONS, type OffsetMagnification } from '@/state/physics-state';
import { cn } from '@/lib/utils';
import { useGltfHeadAsset, type HeadAssetState } from './gltf-head-loader';
import KinematicProviderRuntime, {
  type ProviderRuntimeDiagnostic,
  type ProviderRuntimeDiagnosticTone,
} from './kinematic-provider-runtime';

type FaceViewportProps = {
  activePoseLabel: string;
  assetUrl: string;
};

function OrbitCameraControls() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  const controls = useMemo(
    () => new OrbitControlsImpl(camera, gl.domElement),
    [camera, gl.domElement],
  );

  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 2.4;
    controls.maxDistance = 7;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.maxPolarAngle = Math.PI * 0.82;
    controls.target.set(0, 0.12, 0);
    controls.update();

    return () => {
      controls.dispose();
    };
  }, [controls]);

  useFrame(() => {
    controls.update();
  });

  return null;
}

function ReferenceRing({
  radius,
  color,
  rotation,
}: {
  radius: number;
  color: ColorRepresentation;
  rotation: [number, number, number];
}) {
  return (
    <mesh rotation={rotation}>
      <torusGeometry args={[radius, 0.006, 12, 96]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.2}
        transparent
        opacity={0.58}
      />
    </mesh>
  );
}

function EmptyScenePlaceholder() {
  return (
    <group>
      <gridHelper
        args={[4.2, 20, '#0ea5e9', '#27272a']}
        position={[0, -1.35, 0]}
      />
      <mesh scale={[0.7, 0.95, 0.52]} position={[0, 0.08, 0]}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshStandardMaterial
          color="#0f172a"
          emissive="#0ea5e9"
          emissiveIntensity={0.08}
          metalness={0.05}
          roughness={0.62}
          transparent
          opacity={0.34}
        />
      </mesh>
      <ReferenceRing radius={0.92} color="#38bdf8" rotation={[0, 0, 0]} />
      <ReferenceRing
        radius={1.08}
        color="#22c55e"
        rotation={[Math.PI / 2, 0, 0]}
      />
      <mesh position={[0, 0.08, 0]}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshStandardMaterial
          color="#facc15"
          emissive="#facc15"
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

function LoadedHead({
  asset,
}: {
  asset: NonNullable<HeadAssetState['asset']>;
}) {
  return <primitive object={asset.scene} />;
}

function HeadAssetLayer({
  assetUrl,
  onAssetStateChange,
}: {
  assetUrl: string;
  onAssetStateChange: (state: HeadAssetState) => void;
}) {
  const gl = useThree((state) => state.gl);
  const headAsset = useGltfHeadAsset(assetUrl, gl);

  useEffect(() => {
    onAssetStateChange(headAsset);
  }, [headAsset, onAssetStateChange]);

  return headAsset.asset ? (
    <LoadedHead asset={headAsset.asset} />
  ) : (
    <EmptyScenePlaceholder />
  );
}

function ViewportScene({
  assetUrl,
  asset,
  onAssetStateChange,
  onDiagnosticChange,
  physicsEnabled,
  debugOverlay,
}: {
  assetUrl: string;
  asset: HeadAssetState['asset'];
  physicsEnabled: boolean;
  debugOverlay: boolean;
  onAssetStateChange: (state: HeadAssetState) => void;
  onDiagnosticChange: (diagnostic: ProviderRuntimeDiagnostic | null) => void;
}) {
  return (
    <>
      <color attach="background" args={['#07070a']} />
      <ambientLight intensity={0.28} />
      <hemisphereLight args={['#dbeafe', '#111827', 0.55]} />
      <directionalLight position={[3, 4, 5]} intensity={1.7} />
      <spotLight
        position={[-3, 4, 3]}
        angle={0.35}
        penumbra={0.7}
        intensity={2.1}
      />
      <pointLight position={[0, 1.2, -2.8]} intensity={0.8} color="#38bdf8" />
      <HeadAssetLayer
        assetUrl={assetUrl}
        onAssetStateChange={onAssetStateChange}
      />
      <KinematicProviderRuntime
        physicsEnabled={physicsEnabled}
        asset={asset}
        assetUrl={assetUrl}
        onDiagnosticChange={onDiagnosticChange}
      />
      {physicsEnabled && debugOverlay && asset?.physicsFace ? <PhysicsDebugOverlay face={asset.physicsFace} /> : null}
      <OrbitCameraControls />
    </>
  );
}

function toneClass(tone: ProviderRuntimeDiagnosticTone) {
  if (tone === 'green') {
    return 'border-telemetry-green/40 text-telemetry-green';
  }

  if (tone === 'amber') {
    return 'border-telemetry-amber/40 text-telemetry-amber';
  }

  if (tone === 'destructive') {
    return 'border-destructive/50 text-destructive';
  }

  return 'border-telemetry-cyan/40 text-telemetry-cyan';
}

export default function FaceViewport({
  activePoseLabel,
  assetUrl,
}: FaceViewportProps) {
  const physicsEnabled = usePhysicsState(state => state.enabled);
  const telemetryStatus = usePhysicsTelemetry(state => state.status);
  const physicsStatus: PhysicsStatus = physicsEnabled ? telemetryStatus : { active: false, reason: 'Physics disabled' };
  const physicsStatusText = physicsStatusLabel(physicsStatus);
  const physicsActive = physicsEnabled && physicsStatus.active;
  const debugOverlay = usePhysicsState(state => state.debugOverlay);
  const offsetMagnification = usePhysicsState(state => state.offsetMagnification);
  const offsetHeatmap = usePhysicsState(state => state.offsetHeatmap);
  const setOffsetMagnification = usePhysicsState(state => state.setOffsetMagnification);
  const setOffsetHeatmap = usePhysicsState(state => state.setOffsetHeatmap);
  const setDebugOverlay = usePhysicsState(state => state.setDebugOverlay);
  const setPhysicsEnabled = usePhysicsState(state => state.setEnabled);
  const [headAsset, setHeadAsset] = useState<HeadAssetState>({
    status: 'idle',
    progress: 0,
    asset: null,
    errorMessage: null,
  });
  const [providerDiagnostic, setProviderDiagnostic] =
    useState<ProviderRuntimeDiagnostic | null>(null);
  const handleAssetStateChange = useCallback((state: HeadAssetState) => {
    setHeadAsset(state);
  }, []);
  const handleProviderDiagnosticChange = useCallback(
    (diagnostic: ProviderRuntimeDiagnostic | null) => {
      setProviderDiagnostic(diagnostic);
    },
    [],
  );
  useEffect(() => usePhysicsState.subscribe((state, previous) => {
    if (!state.enabled && previous.enabled) headAsset.asset?.applyVertexDeltas();
  }), [headAsset.asset]);
  const morphTargetCount = headAsset.asset?.morphTargetNames.length ?? 0;
  const statusLabel =
    headAsset.status === 'loading'
      ? `Loading ${Math.round(headAsset.progress * 100)}%`
      : headAsset.status === 'loaded'
        ? `${morphTargetCount} blendshapes`
        : headAsset.status === 'error'
          ? 'Asset load failed'
          : 'Scene standby';

  return (
    <div
      className="relative h-[23rem] min-h-[23rem] overflow-hidden rounded-md bg-background md:h-[27rem] xl:h-[30rem]"
      data-testid="three-viewport"
    >
      <Canvas
        camera={{ position: [0, 0.2, 4.4], fov: 35, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = SRGBColorSpace;
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <ViewportScene
          debugOverlay={physicsActive && debugOverlay}
          physicsEnabled={physicsEnabled}
          assetUrl={assetUrl}
          asset={headAsset.asset}
          onAssetStateChange={handleAssetStateChange}
          onDiagnosticChange={handleProviderDiagnosticChange}
        />
      </Canvas>
      {physicsActive ? <div className="absolute right-3 top-24 z-10 grid max-h-[calc(100%-7rem)] max-w-64 gap-2 overflow-y-auto rounded-md border border-border bg-background/90 p-3 font-mono text-xs">
        <label htmlFor="offset-magnification">Magnified offsets</label>
        <select id="offset-magnification" value={offsetMagnification}
          className="rounded border border-border bg-background p-1"
          onChange={event => setOffsetMagnification(Number(event.currentTarget.value) as OffsetMagnification)}>
          {OFFSET_MAGNIFICATIONS.map(factor => <option key={factor} value={factor}>{factor}×</option>)}
        </select>
        {offsetMagnification !== 1 ? <p data-testid="offset-magnification-notice" className="text-telemetry-amber">
          Offsets magnified {offsetMagnification}× · display only
        </p> : null}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={offsetHeatmap} onChange={event => setOffsetHeatmap(event.currentTarget.checked)} />
          Offset heatmap
        </label>
        {offsetHeatmap ? <div data-testid="offset-heatmap-legend" className="grid gap-1">
          <span>Actual offset from pose target (mm)</span>
          <div className="h-2 rounded" style={{background:'linear-gradient(to right, rgb(0,51,255), rgb(255,26,0))'}} />
          <div className="flex justify-between"><span>0 mm</span><span>≥ {OFFSET_HEATMAP_MAX_MM} mm</span></div>
        </div> : null}
        <button type="button" aria-pressed={debugOverlay} data-testid="physics-debug-toggle"
          className="rounded-md border border-border px-3 py-2"
          onClick={()=>setDebugOverlay(!debugOverlay)}>Proxy {debugOverlay ? 'Visible' : 'Hidden'}</button>
        {debugOverlay ? <div data-testid="physics-debug-legend" className="pointer-events-none grid gap-1">
          <span className="text-cyan-300">● Skin · label 0</span><span className="text-amber-300">● Inner · label 1</span><span className="text-pink-400">● Inner · label 2</span>
          <span>Labels are coloring only</span><span className="text-green-300">— Node → pose target</span>
          <span>Inspect each distance in the numeric readout (m)</span>
        </div> : null}
      </div> : null}
      <button
        type="button"
        aria-pressed={physicsActive}
        data-testid="physics-toggle"
        className="absolute right-3 top-3 rounded-md border border-border bg-background/90 px-3 py-2 font-mono text-xs text-foreground"
        onClick={() => {
          // Restore the original geometry/material immediately on disable.
          if (physicsEnabled) headAsset.asset?.applyVertexDeltas();
          setPhysicsEnabled(!physicsEnabled);
        }}
      >
        Physics {physicsActive ? 'On' : physicsEnabled ? 'Inactive' : 'Off'}
      </button>
      <span role="status" data-testid="physics-status" className={cn(
        'pointer-events-none absolute right-3 top-14 max-w-64 rounded-md border bg-background/90 px-3 py-2 font-mono text-xs',
        physicsActive ? toneClass('green') : toneClass('amber'),
      )}>
        {physicsStatusText}
      </span>
      <div className="pointer-events-none absolute left-3 top-3 grid gap-1 rounded-md border border-border bg-background/75 px-3 py-2 font-mono text-xs backdrop-blur">
        <span
          className={
            headAsset.status === 'error'
              ? 'text-destructive'
              : 'text-telemetry-cyan'
          }
        >
          {statusLabel}
        </span>
        <span className="max-w-72 truncate text-muted-foreground">
          {activePoseLabel} | {assetUrl}
        </span>
        {headAsset.errorMessage ? (
          <span className="max-w-72 truncate text-muted-foreground">
            {headAsset.errorMessage}
          </span>
        ) : null}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 grid gap-2 rounded-md border border-border bg-background/80 p-3 font-mono text-xs shadow-lg shadow-black/25 backdrop-blur sm:left-auto sm:w-[24rem]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.68rem] uppercase text-muted-foreground">
            Provider Health
          </span>
          <span
            className={cn(
              'rounded-sm border px-2 py-1 text-[0.68rem] uppercase leading-none',
              providerDiagnostic
                ? toneClass(providerDiagnostic.tone)
                : headAsset.status === 'error'
                  ? toneClass('destructive')
                  : toneClass('cyan'),
            )}
          >
            {providerDiagnostic?.label ??
              (headAsset.status === 'error' ? 'Asset Error' : 'Standby')}
          </span>
        </div>
        <p data-testid="provider-physics-status" className={physicsActive ? 'text-telemetry-green' : 'text-telemetry-amber'}>
          Physics {physicsStatusText}
        </p>
        <p className="text-muted-foreground">
          {providerDiagnostic?.message ??
            (headAsset.status === 'error'
              ? (headAsset.errorMessage ??
                'The configured face mesh could not be loaded.')
              : headAsset.status === 'loading'
                ? 'Loading the configured face mesh before activating blendshape telemetry.'
                : 'Waiting for provider telemetry from the viewport runtime.')}
        </p>
        {providerDiagnostic &&
        providerDiagnostic.missingBlendshapeNames.length > 0 ? (
          <p className="truncate text-muted-foreground">
            Missing:{' '}
            {providerDiagnostic.missingBlendshapeNames.slice(0, 6).join(', ')}
          </p>
        ) : null}
        {providerDiagnostic &&
        providerDiagnostic.unsupportedBlendshapeNames.length > 0 ? (
          <p className="truncate text-muted-foreground">
            Unsupported:{' '}
            {providerDiagnostic.unsupportedBlendshapeNames
              .slice(0, 6)
              .join(', ')}
          </p>
        ) : null}
        {providerDiagnostic?.activePoseAudit ? (
          <p className="text-muted-foreground">
            Preset audit: {providerDiagnostic.activePoseAudit.activeCount}{' '}
            active / {providerDiagnostic.activePoseAudit.missingCount} missing /{' '}
            {providerDiagnostic.activePoseAudit.unsupportedCount} unsupported
          </p>
        ) : null}
        {providerDiagnostic?.libraryAudit ? (
          <p className="text-muted-foreground">
            Library audit: {providerDiagnostic.libraryAudit.supportedPoseCount}{' '}
            supported / {providerDiagnostic.libraryAudit.partialPoseCount}{' '}
            partial / {providerDiagnostic.libraryAudit.unsupportedPoseCount}{' '}
            unsupported
          </p>
        ) : null}
      </div>
    </div>
  );
}
