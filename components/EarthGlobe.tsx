import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';

// NASA Blue Marble (Wikimedia). This is an EXTERNAL host that can (and does) block
// hotlinked cross-origin texture loads — so the load is now GRACEFUL: on failure the
// globe falls back to a styled sphere instead of throwing. A thrown texture error here
// used to escape the R3F canvas as an UNCAUGHT window error and could crash the whole
// landing page (taking the login form with it).
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
  // Load the texture imperatively so a failed/blocked request NEVER throws during render
  // (which would escape the canvas as an uncaught error). On error we just render the
  // styled sphere below — the page keeps working.
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      EARTH_URL,
      (tex) => { if (!cancelled) setTexture(tex); },
      undefined,
      () => { /* blocked/failed → keep the styled fallback, no throw, no error report */ },
    );
    return () => { cancelled = true; };
  }, []);

  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.025;
  });

  return (
    <>
      <mesh ref={ref}>
        <sphereGeometry args={[2, 64, 64]} />
        {/* Base color doubles as the fallback when the texture is missing/blocked. */}
        <meshStandardMaterial map={texture ?? undefined} color={texture ? '#ffffff' : '#12325e'} roughness={0.85} metalness={0.05} />
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

        <EarthMesh />

        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      </Canvas>
    </GlobeErrorBoundary>
  );
}
