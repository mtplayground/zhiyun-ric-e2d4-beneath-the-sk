import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  ACESFilmicToneMapping,
  SRGBColorSpace,
  type ColorRepresentation,
} from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';

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

function ViewportScene() {
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
      <EmptyScenePlaceholder />
      <OrbitCameraControls />
    </>
  );
}

export default function FaceViewport({
  activePoseLabel,
  assetUrl,
}: FaceViewportProps) {
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
        <ViewportScene />
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 grid gap-1 rounded-md border border-border bg-background/75 px-3 py-2 font-mono text-xs backdrop-blur">
        <span className="text-telemetry-cyan">Scene standby</span>
        <span className="max-w-72 truncate text-muted-foreground">
          {activePoseLabel} | {assetUrl}
        </span>
      </div>
    </div>
  );
}
