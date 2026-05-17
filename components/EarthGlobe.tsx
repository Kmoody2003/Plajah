import React, { useRef, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { TextureLoader } from 'three';
import * as THREE from 'three';

// NASA Blue Marble via Wikimedia Commons — CORS-open, public domain, stable URL
const EARTH_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/The_Blue_Marble_%28remastered%29.jpg/1024px-The_Blue_Marble_%28remastered%29.jpg';

function OrbitalCamera() {
  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime() * 0.055;
    camera.position.x = Math.sin(t) * 5;
    camera.position.z = Math.cos(t) * 5;
    camera.position.y = 1.5 + Math.sin(t * 0.28) * 0.35;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function EarthMesh() {
  const ref = useRef<THREE.Mesh>(null);
  const texture = useLoader(TextureLoader, EARTH_URL);

  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.025;
  });

  return (
    <>
      <mesh ref={ref}>
        <sphereGeometry args={[2, 64, 64]} />
        <meshStandardMaterial map={texture} roughness={0.85} metalness={0.05} />
      </mesh>
      {/* Atmosphere rim */}
      <mesh>
        <sphereGeometry args={[2.08, 32, 32]} />
        <meshBasicMaterial
          color="#3366cc"
          transparent
          opacity={0.1}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

function DarkSphere() {
  return (
    <mesh>
      <sphereGeometry args={[2, 32, 32]} />
      <meshBasicMaterial color="#0d1f3c" />
    </mesh>
  );
}

class GlobeErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function EarthGlobe() {
  return (
    <GlobeErrorBoundary>
      <Canvas
        camera={{ position: [0, 1.5, 5], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 1.5]}
        style={{ width: '100%', height: '100%', display: 'block', background: '#020202' }}
      >
        <OrbitalCamera />
        <ambientLight intensity={0.1} />
        <directionalLight position={[8, 2, 5]} intensity={2.2} color="#fff8e7" />

        <Suspense fallback={<DarkSphere />}>
          <EarthMesh />
        </Suspense>

        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      </Canvas>
    </GlobeErrorBoundary>
  );
}
