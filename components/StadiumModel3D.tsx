import React, { useMemo, useRef, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, SoftShadows, Center, Bounds, useGLTF } from '@react-three/drei';
import type { WCStadium } from '../data/worldCupStadiums';

// Parametric, procedurally-generated stadiums rendered at architectural-render
// fidelity — PBR materials, soft shadows, three-point lighting. No asset files
// required; when a stadium supplies a `modelUrl` a true-to-life GLTF is loaded
// in its place, auto-fit to the frame.

function hexToColor(hex: string) {
  try { return new THREE.Color(hex); } catch { return new THREE.Color('#1e3a8a'); }
}

// ── The seating bowl (surface of revolution, squashed into an oval) ──────────────
function Bowl({ accent, twoTier }: { accent: string; twoTier: boolean }) {
  const seatGeo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const innerR = 7.4;
    const rows = 30;
    const height = twoTier ? 7.4 : 4.9;
    const spread = twoTier ? 9.6 : 6.5;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const rake = twoTier && t > 0.55 ? 0.55 + (t - 0.55) * 1.4 : t;
      pts.push(new THREE.Vector2(innerR + spread * t, height * Math.pow(rake, 0.9)));
    }
    return new THREE.LatheGeometry(pts, 120);
  }, [twoTier]);

  const shellGeo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const innerR = 7.2;
    const rows = 10;
    const height = twoTier ? 8.2 : 5.6;
    const spread = twoTier ? 10.6 : 7.4;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      // near-vertical facade then a lip
      const r = innerR + spread * (t < 0.75 ? t * 1.15 : 0.86 + (t - 0.75) * 0.3);
      pts.push(new THREE.Vector2(r + 0.6, height * Math.pow(t, 0.8) - 0.3));
    }
    return new THREE.LatheGeometry(pts, 120);
  }, [twoTier]);

  const ringCount = twoTier ? 12 : 7;
  const height = twoTier ? 7.4 : 4.9;
  const spread = twoTier ? 9.6 : 6.5;

  return (
    <group scale={[1.3, 1, 1]}>
      <mesh geometry={shellGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#33333a" side={THREE.BackSide} roughness={0.9} metalness={0.15} />
      </mesh>
      <mesh geometry={seatGeo} receiveShadow>
        <meshStandardMaterial color={accent} side={THREE.DoubleSide} roughness={0.62} metalness={0.12} />
      </mesh>
      {Array.from({ length: ringCount }).map((_, i) => {
        const t = (i + 1) / (ringCount + 1);
        const r = 7.4 + spread * t;
        const y = height * Math.pow(t, 0.9);
        return (
          <mesh key={i} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r, 0.05, 6, 120]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.13} />
          </mesh>
        );
      })}
    </group>
  );
}

// ── The pitch ─────────────────────────────────────────────────────────────────
function line(w: number, h: number, x = 0, z = 0) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.04, z]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Pitch() {
  return (
    <group position={[0, 0.02, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[17, 11]} />
        <meshStandardMaterial color="#1f7a34" roughness={1} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-7.4 + i * 2.12, 0.01, 0]} receiveShadow>
          <planeGeometry args={[1.06, 11]} />
          <meshStandardMaterial color={i % 2 ? '#249140' : '#1c6e2f'} roughness={1} />
        </mesh>
      ))}
      {/* outer boundary */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0, 0, 4]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {line(0.12, 11)}            {/* halfway */}
      {line(16.4, 0.12, 0, 5.4)}  {/* touchlines */}
      {line(16.4, 0.12, 0, -5.4)}
      {line(0.12, 11, 8.15)}      {/* goal lines */}
      {line(0.12, 11, -8.15)}
      {/* penalty boxes */}
      {line(0.12, 5, 6.1, 0)}{line(2.2, 0.12, 7.05, 2.5)}{line(2.2, 0.12, 7.05, -2.5)}
      {line(0.12, 5, -6.1, 0)}{line(2.2, 0.12, -7.05, 2.5)}{line(2.2, 0.12, -7.05, -2.5)}
      {/* centre circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[1.7, 1.82, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      {/* goals */}
      {[8.05, -8.05].map((x, i) => (
        <mesh key={i} position={[x, 0.35, 0]}>
          <boxGeometry args={[0.12, 0.7, 2.4]} />
          <meshStandardMaterial color="#ffffff" metalness={0.3} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

// ── Roofs vary by type ───────────────────────────────────────────────────────
function Roof({ type, accent }: { type: WCStadium['roof']; accent: string }) {
  const y = 8.6;
  const inner = 9.0;
  const outer = 21.5;

  if (type === 'Open') {
    return (
      <group scale={[1.3, 1, 1]}>
        <mesh position={[0, 6.8, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[17.6, 0.3, 10, 120]} />
          <meshStandardMaterial color="#3a3a42" metalness={0.7} roughness={0.35} />
        </mesh>
        {[[15.5, 9], [-15.5, 9], [15.5, -9], [-15.5, -9]].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 6, 0]} castShadow><cylinderGeometry args={[0.16, 0.24, 12, 8]} /><meshStandardMaterial color="#4a4a52" metalness={0.6} roughness={0.4} /></mesh>
            <mesh position={[0, 12, 0]}><boxGeometry args={[2.6, 1.2, 0.4]} /><meshStandardMaterial color="#fff8dc" emissive="#fff2b0" emissiveIntensity={1.1} /></mesh>
          </group>
        ))}
      </group>
    );
  }

  const isCanopy = type === 'Canopy';
  const isRetract = type === 'Retractable';

  return (
    <group scale={[1.3, 1, 1]} position={[0, y, 0]}>
      {isRetract ? (
        <>
          <mesh rotation={[-Math.PI / 2, 0, Math.PI * 0.06]} position={[0, 0, 3.6]} castShadow>
            <ringGeometry args={[inner, outer, 120, 1, 0, Math.PI * 0.78]} />
            <meshStandardMaterial color="#26262c" metalness={0.5} roughness={0.45} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, Math.PI + Math.PI * 0.06]} position={[0, 0, -3.6]} castShadow>
            <ringGeometry args={[inner, outer, 120, 1, 0, Math.PI * 0.78]} />
            <meshStandardMaterial color="#26262c" metalness={0.5} roughness={0.45} side={THREE.DoubleSide} />
          </mesh>
        </>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
          <ringGeometry args={[inner, outer, 120]} />
          <meshStandardMaterial
            color={isCanopy ? '#eef0f4' : '#22222a'}
            transparent={isCanopy}
            opacity={isCanopy ? 0.34 : 1}
            metalness={isCanopy ? 0.1 : 0.55}
            roughness={isCanopy ? 0.25 : 0.45}
            emissive={isCanopy ? accent : '#000000'}
            emissiveIntensity={isCanopy ? 0.14 : 0}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[outer, 0.36, 10, 120]} />
        <meshStandardMaterial color="#3a3a42" metalness={0.75} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ── A real GLTF model, auto-fit ──────────────────────────────────────────────
function LoadedModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  return (
    <Bounds fit clip observe margin={1.1}>
      <Center>
        <primitive object={cloned} />
      </Center>
    </Bounds>
  );
}

function ProceduralStadium({ s }: { s: WCStadium }) {
  const twoTier = s.capacity >= 68000;
  const accent = useMemo(() => hexToColor(s.accent).getStyle(), [s.accent]);
  return (
    <>
      <Pitch />
      <Bowl accent={accent} twoTier={twoTier} />
      <Roof type={s.roof} accent={accent} />
    </>
  );
}

function Scene({ s }: { s: WCStadium }) {
  const grp = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (grp.current) grp.current.rotation.y += dt * 0.11; });
  return (
    <>
      <hemisphereLight args={['#cfe0ff', '#1a1a20', 0.7]} />
      <directionalLight
        position={[20, 30, 14]} intensity={1.35} castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-30} shadow-camera-right={30}
        shadow-camera-top={30} shadow-camera-bottom={-30}
      />
      <directionalLight position={[-16, 12, -12]} intensity={0.4} color="#88aaff" />
      <group ref={grp}>
        {s.modelUrl
          ? <Suspense fallback={<ProceduralStadium s={s} />}><LoadedModel url={s.modelUrl} /></Suspense>
          : <ProceduralStadium s={s} />}
      </group>
      <ContactShadows position={[0, -0.05, 0]} scale={70} far={20} blur={2.6} opacity={0.5} resolution={512} />
    </>
  );
}

const StadiumModel3D: React.FC<{ stadium: WCStadium; className?: string }> = ({ stadium, className }) => {
  return (
    <div className={className} style={{ touchAction: 'none' }}>
      <Canvas
        shadows dpr={[1, 1.8]}
        camera={{ position: [0, 26, 40], fov: 42 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      >
        <SoftShadows size={18} samples={10} focus={0.9} />
        <Suspense fallback={null}>
          <Scene s={stadium} />
          <OrbitControls
            enablePan={false}
            minDistance={24}
            maxDistance={74}
            minPolarAngle={0.12}
            maxPolarAngle={Math.PI / 2.15}
            enableDamping
            dampingFactor={0.08}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default StadiumModel3D;
