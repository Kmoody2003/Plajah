import React, { Suspense, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';
import type { AvatarConfig } from '../types';

interface AvatarBubbleProps {
  config: AvatarConfig;
  size?: number;
  className?: string;
}

// Tiny procedural head for the bubble
function BubbleHead({ style }: { style: AvatarConfig['style'] }) {
  const ref = useRef<THREE.Mesh>(null);
  const isToon = style === 'ANIME' || style === 'CHIBI' || style === 'CLAY';
  const isClay = style === 'CLAY';
  const mat = isClay
    ? new THREE.MeshStandardMaterial({ color: 0xf7c59f, roughness: 0.9, metalness: 0, flatShading: true })
    : isToon
      ? new THREE.MeshToonMaterial({ color: 0xf5c9a0 })
      : new THREE.MeshStandardMaterial({ color: 0xf5c9a0, roughness: 0.6 });

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.006;
    }
  });

  return (
    <mesh ref={ref} material={mat}>
      <sphereGeometry args={[0.75, 32, 32]} />
    </mesh>
  );
}

function RPMBubble({ url, style }: { url: string; style: AvatarConfig['style'] }) {
  const gltf = useLoader(GLTFLoader, url);
  const ref = useRef<THREE.Group>(null);

  useFrame(() => {
    if (ref.current) ref.current.rotation.y += 0.006;
  });

  return (
    <group ref={ref} position={[0, -0.9, 0]}>
      <primitive object={gltf.scene} />
    </group>
  );
}

function VRMBubble({ url }: { url: string; style: AvatarConfig['style'] }) {
  const gltf = useLoader(GLTFLoader, url, (loader: GLTFLoader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });
  const vrm = gltf.userData.vrm as VRM | undefined;
  const ref = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    vrm?.update(delta);
    if (ref.current) ref.current.rotation.y += 0.006;
  });

  if (!vrm) return <BubbleHead style="ANIME" />;
  return (
    <group ref={ref} position={[0, -0.9, 0]}>
      <primitive object={vrm.scene} />
    </group>
  );
}

const AvatarBubble: React.FC<AvatarBubbleProps> = ({ config, size = 40, className = '' }) => {
  // If there's a thumbnail snapshot, use it (faster, no WebGL cost)
  if (config.thumbnailUrl) {
    return (
      <img
        src={config.thumbnailUrl}
        alt="avatar"
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div
      className={`rounded-full overflow-hidden ${className}`}
      style={{ width: size, height: size, background: 'transparent' }}
    >
      <Canvas
        camera={{ position: [0, 0.9, 2.2], fov: 45 }}
        gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
        style={{ background: 'transparent', display: 'block' }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(0x000000, 0);
          scene.background = null;
        }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 2]} intensity={1.2} />
        <hemisphereLight args={[0xffeeff, 0x222244, 0.4]} />

        <Suspense fallback={<BubbleHead style={config.style} />}>
          {config.type === 'RPM' && config.rpmGlbUrl ? (
            <RPMBubble url={config.rpmGlbUrl} style={config.style} />
          ) : config.type === 'VRM' && config.modelUrl ? (
            <VRMBubble url={config.modelUrl} style={config.style} />
          ) : (
            <BubbleHead style={config.style} />
          )}
        </Suspense>

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableRotate={false}
          autoRotate
          autoRotateSpeed={2}
          target={[0, 0.9, 0]}
        />
      </Canvas>
    </div>
  );
};

export default AvatarBubble;
