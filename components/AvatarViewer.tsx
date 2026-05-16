import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
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

// ── Wardrobe accessories rendered as Three.js geometry ────────────────────────

interface WardrobeAccessoriesProps {
  accessories: string[];
  headR: number;
  headY: number;
  bodyY: number;
  bodyW: number;
}

function WardrobeAccessories({ accessories, headR, headY, bodyY, bodyW }: WardrobeAccessoriesProps) {
  if (!accessories || accessories.length === 0) return null;

  const acc = new Set(accessories);

  // Materials (created inline as primitive values — no hooks needed)
  const goldMat    = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.3, metalness: 0.8 });
  const grayMat    = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
  const darkGrayMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });
  const maroonMat  = new THREE.MeshStandardMaterial({ color: 0x8b2222, roughness: 0.8 });
  const redMat     = new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.7, side: THREE.DoubleSide });
  const orangeMat  = new THREE.MeshStandardMaterial({ color: 0xff4400, roughness: 0.6 });
  const whiteMat   = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide });
  const dragonMat  = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, side: THREE.DoubleSide });
  const glassMat   = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.3 });
  const yellowMat  = new THREE.MeshStandardMaterial({ color: 0xffdd00, roughness: 0.4, metalness: 0.2 });

  const topOfHead = headY + headR;
  const neckY     = headY - headR * 0.95;

  return (
    <group>
      {/* ── hat_cap: flat cylinder base + brim ── */}
      {acc.has('hat_cap') && (
        <group>
          {/* Cap body */}
          <mesh position={[0, topOfHead + 0.05, 0]} material={grayMat}>
            <cylinderGeometry args={[headR * 0.95, headR * 1.0, 0.18, 16]} />
          </mesh>
          {/* Brim */}
          <mesh position={[0, topOfHead - 0.01, 0]} material={grayMat}>
            <cylinderGeometry args={[headR * 1.4, headR * 1.4, 0.04, 16]} />
          </mesh>
        </group>
      )}

      {/* ── hat_beanie: squished sphere on top of head ── */}
      {acc.has('hat_beanie') && (
        <mesh
          position={[0, topOfHead + headR * 0.18, 0]}
          scale={[1.08, 0.82, 1.08]}
          material={maroonMat}
        >
          <sphereGeometry args={[headR, 20, 20]} />
        </mesh>
      )}

      {/* ── hat_crown: 5 yellow cones arranged in a ring ── */}
      {acc.has('hat_crown') && (
        <group position={[0, topOfHead + 0.04, 0]}>
          {[0, 1, 2, 3, 4].map((i) => {
            const angle = (i / 5) * Math.PI * 2;
            const r = headR * 0.75;
            return (
              <mesh
                key={i}
                position={[Math.sin(angle) * r, 0, Math.cos(angle) * r]}
                rotation={[0, -angle, 0]}
                material={yellowMat}
              >
                <coneGeometry args={[0.07, 0.22, 6]} />
              </mesh>
            );
          })}
        </group>
      )}

      {/* ── glasses_round: two torus rings + bridge ── */}
      {acc.has('glasses_round') && (
        <group position={[0, headY + headR * 0.08, headR * 0.94]}>
          {/* Left lens */}
          <mesh
            position={[-headR * 0.32, 0, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            material={glassMat}
          >
            <torusGeometry args={[headR * 0.18, 0.018, 8, 24]} />
          </mesh>
          {/* Right lens */}
          <mesh
            position={[headR * 0.32, 0, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            material={glassMat}
          >
            <torusGeometry args={[headR * 0.18, 0.018, 8, 24]} />
          </mesh>
          {/* Bridge */}
          <mesh position={[0, 0, 0]} material={glassMat}>
            <boxGeometry args={[headR * 0.28, 0.022, 0.022]} />
          </mesh>
        </group>
      )}

      {/* ── glasses_shades: wide dark bar spanning both eyes ── */}
      {acc.has('glasses_shades') && (
        <mesh
          position={[0, headY + headR * 0.1, headR * 0.97]}
          material={darkGrayMat}
        >
          <boxGeometry args={[headR * 1.1, 0.08, 0.04]} />
        </mesh>
      )}

      {/* ── cape_hero: red plane behind torso ── */}
      {acc.has('cape_hero') && (
        <mesh
          position={[0, bodyY + 0.05, -0.2]}
          material={redMat}
        >
          <planeGeometry args={[bodyW * 1.3, 0.9]} />
        </mesh>
      )}

      {/* ── scarf: torus around neck ── */}
      {acc.has('scarf') && (
        <mesh
          position={[0, neckY + 0.06, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          material={orangeMat}
        >
          <torusGeometry args={[headR * 0.72, 0.055, 10, 24]} />
        </mesh>
      )}

      {/* ── wings_angel: two white planes angled from upper back ── */}
      {acc.has('wings_angel') && (
        <group position={[0, bodyY + 0.25, -0.15]}>
          {/* Left wing */}
          <mesh
            position={[-bodyW * 0.55, 0, 0]}
            rotation={[0.2, 0.3, -0.5]}
            material={whiteMat}
          >
            <planeGeometry args={[0.55, 0.7]} />
          </mesh>
          {/* Right wing */}
          <mesh
            position={[bodyW * 0.55, 0, 0]}
            rotation={[0.2, -0.3, 0.5]}
            material={whiteMat}
          >
            <planeGeometry args={[0.55, 0.7]} />
          </mesh>
        </group>
      )}

      {/* ── wings_dragon: two dark gray planes from upper back ── */}
      {acc.has('wings_dragon') && (
        <group position={[0, bodyY + 0.2, -0.15]}>
          {/* Left wing */}
          <mesh
            position={[-bodyW * 0.6, 0, 0]}
            rotation={[0.3, 0.5, -0.65]}
            material={dragonMat}
          >
            <planeGeometry args={[0.65, 0.55]} />
          </mesh>
          {/* Right wing */}
          <mesh
            position={[bodyW * 0.6, 0, 0]}
            rotation={[0.3, -0.5, 0.65]}
            material={dragonMat}
          >
            <planeGeometry args={[0.65, 0.55]} />
          </mesh>
        </group>
      )}

      {/* ── halo: gold torus floating above the head ── */}
      {acc.has('halo') && (
        <mesh
          position={[0, topOfHead + headR * 0.55, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          material={goldMat}
        >
          <torusGeometry args={[headR * 0.65, 0.035, 10, 32]} />
        </mesh>
      )}
    </group>
  );
}

// ── Procedural humanoid with wave animation ──────────────────────────────────

interface ProceduralProps {
  style: AvatarStyle;
  wave?: boolean;
  accessories?: string[];
}

function ProceduralAvatar({ style, wave, accessories = [] }: ProceduralProps) {
  const groupRef = useRef<THREE.Group>(null);
  const rArmRef  = useRef<THREE.Mesh>(null);
  const startRef = useRef(Date.now());
  const waving   = useRef(!!wave);

  // ── Per-style configuration ─────────────────────────────────────────────────
  const isChibi      = style === 'CHIBI';
  const isClay       = style === 'CLAY';
  const isAnime      = style === 'ANIME';
  const isUrban      = style === 'URBAN';
  const isStreetwear = style === 'STREETWEAR';
  const isRealistic  = style === 'REALISTIC';
  const isToon       = isAnime || isChibi || isClay;

  // Material factory
  const mkMat = (c: number, opts?: { roughness?: number; metalness?: number }) =>
    isClay
      ? new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0, flatShading: true })
      : isToon
        ? new THREE.MeshToonMaterial({ color: c })
        : new THREE.MeshStandardMaterial({
            color: c,
            roughness: opts?.roughness ?? 0.6,
            metalness: opts?.metalness ?? 0.05,
          });

  // ── Skin & cloth colors per style ──────────────────────────────────────────
  let skinColor: number;
  let clothColor: number;
  let pantColor: number;

  if (isAnime) {
    skinColor  = 0xffd0a8;
    clothColor = 0xff8c00; // vibrant orange top
    pantColor  = 0x3a5fa0; // vivid blue jeans
  } else if (isChibi) {
    skinColor  = 0xffe0c0;
    clothColor = 0xff69b4; // bright pink
    pantColor  = 0xff69b4;
  } else if (isClay) {
    skinColor  = 0xf7c59f; // warm peach clay
    clothColor = 0x7ec8e3; // pastel sky blue
    pantColor  = 0xf4a261; // warm terracotta
  } else if (isStreetwear) {
    skinColor  = 0xc68642; // medium brown
    clothColor = 0xe8ff3e; // neon yellow hoodie
    pantColor  = 0x1a1a1a; // black joggers
  } else if (isUrban) {
    skinColor  = 0x8b5e3c; // darker skin
    clothColor = 0x111111; // black hoodie
    pantColor  = 0x4a4030; // dark khaki
  } else {
    // REALISTIC
    skinColor  = 0xe8b89a;
    clothColor = 0x1a2a4a; // dark navy shirt
    pantColor  = 0x555566; // gray pants
  }

  const skinMat  = mkMat(skinColor);
  const clothMat = mkMat(clothColor);
  const pantMat  = mkMat(pantColor);
  const eyeMat   = new THREE.MeshBasicMaterial({ color: 0x111111 });

  // ── Proportions ─────────────────────────────────────────────────────────────
  const isBigHead = isChibi || isClay;
  const headR   = isBigHead ? 0.52  : 0.38;
  const headY   = isBigHead ? 1.38  : 1.66;
  const bodyY   = isBigHead ? 0.52  : 0.85;
  const bodyW   = isBigHead ? 0.52  : 0.48;
  const bodyH   = isBigHead ? 0.62  : 0.82;
  const legH    = isBigHead ? 0.38  : 0.68;
  const legY    = isBigHead ? -0.08 : -0.12;
  const armLen  = isBigHead ? 0.42  : 0.60;
  const armTopR = isBigHead ? 0.11  : 0.09;
  const armBotR = isBigHead ? 0.10  : 0.08;
  const legTopR = isBigHead ? 0.14  : 0.11;
  const legBotR = isBigHead ? 0.12  : 0.09;
  const armOffX = bodyW / 2 + 0.13;

  // Eye radius: each style has a different size
  const eyeR = isBigHead ? headR * 0.20 : isAnime ? headR * 0.16 : headR * 0.13;

  // Urban/Streetwear: slight forward lean
  const groupRotX = (isUrban || isStreetwear) ? -0.04 : 0;

  useFrame(() => {
    const elapsed = (Date.now() - startRef.current) / 1000;

    if (waving.current && rArmRef.current) {
      if (elapsed < 3.8) {
        const raise  = Math.min(1, elapsed / 0.45) * (Math.PI * 0.68);
        const waggle = elapsed > 0.45 ? Math.sin((elapsed - 0.45) * 6.5) * 0.28 : 0;
        rArmRef.current.rotation.z = -(raise + waggle);
      } else {
        rArmRef.current.rotation.z = THREE.MathUtils.lerp(
          rArmRef.current.rotation.z, -0.18, 0.06
        );
        if (Math.abs(rArmRef.current.rotation.z + 0.18) < 0.01) {
          waving.current = false;
        }
      }
    }

    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(Date.now() * 0.0018) * 0.028;
    }
  });

  return (
    <group ref={groupRef} rotation={[groupRotX, 0, 0]}>
      {/* Head */}
      <mesh position={[0, headY, 0]} material={skinMat}>
        <sphereGeometry args={[headR, 32, 32]} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-headR * 0.33, headY + headR * 0.1, headR * 0.92]} material={eyeMat}>
        <sphereGeometry args={[eyeR, 12, 12]} />
      </mesh>
      <mesh position={[headR * 0.33, headY + headR * 0.1, headR * 0.92]} material={eyeMat}>
        <sphereGeometry args={[eyeR, 12, 12]} />
      </mesh>

      {/* Anime hair tuft: a box sitting on top of head */}
      {isAnime && (
        <mesh position={[0, headY + headR * 0.88, 0]} material={new THREE.MeshToonMaterial({ color: 0x2a1a0a })}>
          <boxGeometry args={[headR * 0.9, headR * 0.45, headR * 0.55]} />
        </mesh>
      )}

      {/* Torso (shirt/hoodie) */}
      <mesh position={[0, bodyY, 0]} material={clothMat}>
        <boxGeometry args={[bodyW, bodyH, 0.27]} />
      </mesh>

      {/* Left arm */}
      <mesh position={[-armOffX, bodyY, 0]} rotation={[0, 0, 0.18]} material={skinMat}>
        <cylinderGeometry args={[armTopR, armBotR, armLen, 8]} />
      </mesh>

      {/* Right arm — animated for wave */}
      <mesh ref={rArmRef} position={[armOffX, bodyY, 0]} rotation={[0, 0, -0.18]} material={skinMat}>
        <cylinderGeometry args={[armTopR, armBotR, armLen, 8]} />
      </mesh>

      {/* Legs */}
      <mesh position={[-0.14, legY, 0]} material={pantMat}>
        <cylinderGeometry args={[legTopR, legBotR, legH, 8]} />
      </mesh>
      <mesh position={[0.14, legY, 0]} material={pantMat}>
        <cylinderGeometry args={[legTopR, legBotR, legH, 8]} />
      </mesh>

      {/* Wardrobe accessories */}
      <WardrobeAccessories
        accessories={accessories}
        headR={headR}
        headY={headY}
        bodyY={bodyY}
        bodyW={bodyW}
      />
    </group>
  );
}

// ── Ready Player Me GLB ───────────────────────────────────────────────────────

function RPMModel({
  url, style, wave, accessories,
}: {
  url: string;
  style: AvatarStyle;
  wave?: boolean;
  accessories?: string[];
}) {
  const gltf      = useLoader(GLTFLoader, url);
  const groupRef  = useRef<THREE.Group>(null);
  const armRef    = useRef<THREE.Bone | null>(null);
  const startRef  = useRef(Date.now());
  const waving    = useRef(!!wave);

  useEffect(() => {
    const isToon = style === 'ANIME' || style === 'CHIBI';
    gltf.scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m, i) => {
        if (isToon && !(m instanceof THREE.MeshToonMaterial)) {
          const std  = m as THREE.MeshStandardMaterial;
          const toon = new THREE.MeshToonMaterial({ color: std.color, map: std.map });
          Array.isArray(mesh.material)
            ? ((mesh.material as THREE.Material[])[i] = toon)
            : (mesh.material = toon);
        }
      });
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

  // Standard RPM avatar proportions
  const RPM_HEAD_R  = 0.38;
  const RPM_HEAD_Y  = 1.66;
  const RPM_BODY_Y  = 0.85;
  const RPM_BODY_W  = 0.48;

  return (
    <group ref={groupRef}>
      <primitive object={gltf.scene} />
      {accessories && accessories.length > 0 && (
        <WardrobeAccessories
          accessories={accessories}
          headR={RPM_HEAD_R}
          headY={RPM_HEAD_Y}
          bodyY={RPM_BODY_Y}
          bodyW={RPM_BODY_W}
        />
      )}
    </group>
  );
}

// ── VRM Model ─────────────────────────────────────────────────────────────────

function VRMModel({
  url, style, wave, accessories,
}: {
  url: string;
  style: AvatarStyle;
  wave?: boolean;
  accessories?: string[];
}) {
  const gltf     = useLoader(GLTFLoader, url, (loader: GLTFLoader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });
  const vrm      = gltf.userData.vrm as VRM | undefined;
  const groupRef = useRef<THREE.Group>(null);
  const startRef = useRef(Date.now());
  const waving   = useRef(!!wave);

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

  // Standard VRM/human proportions
  const VRM_HEAD_R  = 0.38;
  const VRM_HEAD_Y  = 1.66;
  const VRM_BODY_Y  = 0.85;
  const VRM_BODY_W  = 0.48;

  if (!vrm) return <ProceduralAvatar style={style} wave={wave} accessories={accessories} />;
  return (
    <group ref={groupRef}>
      <primitive object={vrm.scene} />
      {accessories && accessories.length > 0 && (
        <WardrobeAccessories
          accessories={accessories}
          headR={VRM_HEAD_R}
          headY={VRM_HEAD_Y}
          bodyY={VRM_BODY_Y}
          bodyW={VRM_BODY_W}
        />
      )}
    </group>
  );
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
  const accs = config.accessories ?? [];
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 4, 3]} intensity={1.2} />
      <pointLight position={[-2, 2, -2]} intensity={0.4} color="#ff8c00" />
      <hemisphereLight args={[0xffeeff, 0x222244, 0.5]} />

      <Suspense
        fallback={
          <ProceduralAvatar
            key={`fallback-${config.style}`}
            style={config.style}
            wave={wave}
            accessories={accs}
          />
        }
      >
        {config.type === 'RPM' && config.rpmGlbUrl ? (
          <RPMModel url={config.rpmGlbUrl} style={config.style} wave={wave} accessories={accs} />
        ) : config.type === 'VRM' && config.modelUrl ? (
          <VRMModel url={config.modelUrl} style={config.style} wave={wave} accessories={accs} />
        ) : (
          <ProceduralAvatar
            key={`proc-${config.style}-${accs.join(',')}`}
            style={config.style}
            wave={wave}
            accessories={accs}
          />
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
    <div className={`w-full h-full ${className}`} style={{ minHeight: compact ? 80 : 320, background: 'transparent' }}>
      <Canvas
        camera={{ position: [0, camY, camZ], fov: compact ? 50 : 46 }}
        gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
        style={{ background: 'transparent', display: 'block' }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(0x000000, 0);
          scene.background = null;
        }}
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
