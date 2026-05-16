import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { AvatarConfig, AvatarStyle } from '../types';

export interface AvatarViewerProps {
  config: AvatarConfig;
  compact?: boolean;
  autoRotate?: boolean;
  wave?: boolean;
  className?: string;
}

// ── Procedural humanoid with wave animation ──────────────────────────────────

interface ProceduralProps {
  style: AvatarStyle;
  wave?: boolean;
}

function ProceduralAvatar({ style, wave }: ProceduralProps) {
  const groupRef  = useRef<THREE.Group>(null);
  const rArmRef   = useRef<THREE.Mesh>(null);  // right arm (viewer's right)
  const startRef  = useRef(Date.now());
  const waving    = useRef(!!wave);

  const isChibi = style === 'CHIBI';
  const isToon  = style === 'ANIME' || style === 'CHIBI';
  const mkMat   = (c: number) =>
    isToon
      ? new THREE.MeshToonMaterial({ color: c })
      : new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05 });

  const skinMat  = mkMat(0xf5c9a0);
  const clothMat = mkMat(0xff8c00);
  const eyeMat   = new THREE.MeshBasicMaterial({ color: 0x111111 });

  const headR  = isChibi ? 0.52 : 0.38;
  const headY  = isChibi ? 1.38 : 1.66;
  const bodyY  = isChibi ? 0.52 : 0.85;
  const bodyW  = isChibi ? 0.52 : 0.48;
  const bodyH  = isChibi ? 0.62 : 0.82;
  const legH   = isChibi ? 0.46 : 0.68;
  const legY   = isChibi ? -0.12 : -0.12;
  const armOffX = bodyW / 2 + 0.13;

  useFrame(() => {
    const elapsed = (Date.now() - startRef.current) / 1000;

    // Wave animation: raise arm then oscillate for ~3 s
    if (waving.current && rArmRef.current) {
      if (elapsed < 3.8) {
        const raise   = Math.min(1, elapsed / 0.45) * (Math.PI * 0.68);
        const waggle  = elapsed > 0.45 ? Math.sin((elapsed - 0.45) * 6.5) * 0.28 : 0;
        rArmRef.current.rotation.z = -(raise + waggle);
      } else {
        // Settle back to rest
        rArmRef.current.rotation.z = THREE.MathUtils.lerp(
          rArmRef.current.rotation.z, -0.18, 0.06
        );
        if (Math.abs(rArmRef.current.rotation.z + 0.18) < 0.01) {
          waving.current = false;
        }
      }
    }

    // Idle breathing
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(Date.now() * 0.0018) * 0.028;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Head */}
      <mesh position={[0, headY, 0]} material={skinMat}>
        <sphereGeometry args={[headR, 32, 32]} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-headR * 0.33, headY + headR * 0.1, headR * 0.92]} material={eyeMat}>
        <sphereGeometry args={[headR * 0.13, 12, 12]} />
      </mesh>
      <mesh position={[headR * 0.33, headY + headR * 0.1, headR * 0.92]} material={eyeMat}>
        <sphereGeometry args={[headR * 0.13, 12, 12]} />
      </mesh>
      {/* Torso */}
      <mesh position={[0, bodyY, 0]} material={clothMat}>
        <boxGeometry args={[bodyW, bodyH, 0.27]} />
      </mesh>
      {/* Left arm (viewer left, avatar right — resting) */}
      <mesh position={[-armOffX, bodyY, 0]} rotation={[0, 0, 0.18]} material={skinMat}>
        <cylinderGeometry args={[0.09, 0.08, 0.6, 8]} />
      </mesh>
      {/* Right arm — animated for wave */}
      <mesh ref={rArmRef} position={[armOffX, bodyY, 0]} rotation={[0, 0, -0.18]} material={skinMat}>
        <cylinderGeometry args={[0.09, 0.08, 0.6, 8]} />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.14, legY, 0]} material={clothMat}>
        <cylinderGeometry args={[0.11, 0.09, legH, 8]} />
      </mesh>
      <mesh position={[0.14, legY, 0]} material={clothMat}>
        <cylinderGeometry args={[0.11, 0.09, legH, 8]} />
      </mesh>
    </group>
  );
}

// ── Ready Player Me GLB ───────────────────────────────────────────────────────

function RPMModel({ url, style, wave }: { url: string; style: AvatarStyle; wave?: boolean }) {
  const gltf      = useLoader(GLTFLoader, url);
  const groupRef  = useRef<THREE.Group>(null);
  const armRef    = useRef<THREE.Bone | null>(null);
  const startRef  = useRef(Date.now());
  const waving    = useRef(!!wave);

  useEffect(() => {
    // Apply toon material for anime styles
    const isToon = style === 'ANIME' || style === 'CHIBI';
    gltf.scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m, i) => {
        if (isToon && !(m instanceof THREE.MeshToonMaterial)) {
          const std = m as THREE.MeshStandardMaterial;
          const toon = new THREE.MeshToonMaterial({ color: std.color, map: std.map });
          Array.isArray(mesh.material)
            ? ((mesh.material as THREE.Material[])[i] = toon)
            : (mesh.material = toon);
        }
      });
      // Grab the right upper arm bone for wave
      if ((child as THREE.Bone).isBone) {
        const n = child.name.toLowerCase();
        if (n.includes('rightarm') || n.includes('right_arm') || n.includes('mixamorigright')) {
          armRef.current = child as THREE.Bone;
        }
      }
    });
    if (style === 'CHIBI') gltf.scene.scale.set(1, 0.72, 1);
  }, [gltf.scene, style]);

  useFrame(() => {
    const elapsed = (Date.now() - startRef.current) / 1000;
    if (waving.current && armRef.current) {
      if (elapsed < 3.8) {
        const raise  = Math.min(1, elapsed / 0.45) * (-Math.PI * 0.65);
        const waggle = elapsed > 0.45 ? Math.sin((elapsed - 0.45) * 6.5) * 0.25 : 0;
        armRef.current.rotation.z = raise + waggle;
      } else {
        armRef.current.rotation.z = THREE.MathUtils.lerp(armRef.current.rotation.z, 0, 0.06);
      }
    }
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(Date.now() * 0.0018) * 0.028;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={gltf.scene} />
    </group>
  );
}

// ── VRM Model ─────────────────────────────────────────────────────────────────

function VRMModel({ url, style, wave }: { url: string; style: AvatarStyle; wave?: boolean }) {
  const gltf      = useLoader(GLTFLoader, url, (loader: GLTFLoader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });
  const vrm       = gltf.userData.vrm as VRM | undefined;
  const groupRef  = useRef<THREE.Group>(null);
  const startRef  = useRef(Date.now());
  const waving    = useRef(!!wave);

  useEffect(() => {
    if (!vrm) return;
    vrm.scene.rotation.y = Math.PI;
    if (style === 'CHIBI') vrm.scene.scale.set(1, 0.72, 1);
  }, [vrm, style]);

  useFrame((_, delta) => {
    if (!vrm) return;
    vrm.update(delta);

    const elapsed = (Date.now() - startRef.current) / 1000;
    const armBone = vrm.humanoid.getBoneNode(VRMHumanBoneName.RightUpperArm);

    if (waving.current && armBone) {
      if (elapsed < 3.8) {
        const raise  = Math.min(1, elapsed / 0.45) * (Math.PI * 0.65);
        const waggle = elapsed > 0.45 ? Math.sin((elapsed - 0.45) * 6.5) * 0.28 : 0;
        armBone.rotation.z = raise + waggle;
      } else {
        armBone.rotation.z = THREE.MathUtils.lerp(armBone.rotation.z, 0, 0.06);
      }
    }

    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(Date.now() * 0.0018) * 0.028;
    }
  });

  if (!vrm) return <ProceduralAvatar style={style} wave={wave} />;
  return (
    <group ref={groupRef}>
      <primitive object={vrm.scene} />
    </group>
  );
}

// ── Scene setup: force transparent background ─────────────────────────────────

function SceneSetup() {
  const { scene, gl } = useThree();
  useEffect(() => {
    scene.background = null;
    gl.setClearColor(0x000000, 0);
  }, [scene, gl]);
  return null;
}

// ── Scene ─────────────────────────────────────────────────────────────────────

function AvatarScene({
  config,
  compact,
  autoRotate,
  wave,
}: {
  config: AvatarConfig;
  compact?: boolean;
  autoRotate?: boolean;
  wave?: boolean;
}) {
  return (
    <>
      <SceneSetup />
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 4, 3]} intensity={1.2} />
      <pointLight position={[-2, 2, -2]} intensity={0.4} color="#ff8c00" />
      <hemisphereLight args={[0xffeeff, 0x222244, 0.5]} />

      <Suspense fallback={<ProceduralAvatar key={`fallback-${config.style}`} style={config.style} wave={wave} />}>
        {config.type === 'RPM' && config.rpmGlbUrl ? (
          <RPMModel url={config.rpmGlbUrl} style={config.style} wave={wave} />
        ) : config.type === 'VRM' && config.modelUrl ? (
          <VRMModel url={config.modelUrl} style={config.style} wave={wave} />
        ) : (
          <ProceduralAvatar key={`proc-${config.style}`} style={config.style} wave={wave} />
        )}
      </Suspense>

      <OrbitControls
        enableZoom={!compact}
        enablePan={false}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 1.6}
        autoRotate={autoRotate}
        autoRotateSpeed={1}
        target={[0, 1, 0]}
      />
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

const AvatarViewer: React.FC<AvatarViewerProps> = ({
  config,
  compact = false,
  autoRotate = false,
  wave = false,
  className = '',
}) => {
  const camZ = compact ? 2.5 : 2.2;
  const camY = compact ? 1.0 : 1.2;
  return (
    <div className={`w-full h-full ${className}`} style={{ minHeight: compact ? 80 : 320 }}>
      <Canvas
        camera={{ position: [0, camY, camZ], fov: compact ? 50 : 46 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent', display: 'block' }}
      >
        <AvatarScene
          config={config}
          compact={compact}
          autoRotate={autoRotate}
          wave={wave}
        />
      </Canvas>
    </div>
  );
};

export default AvatarViewer;
