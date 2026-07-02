import React, { useMemo, useRef, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { WCStadium } from '../data/worldCupStadiums';

// A parametric, procedurally-generated stadium — no external model files.
// Bowl size scales with capacity, tier count and roof geometry vary per venue,
// seats take the club/venue accent colour. Stylised but architecturally honest.

function hexToColor(hex: string) {
  try { return new THREE.Color(hex); } catch { return new THREE.Color('#1e3a8a'); }
}

// ── The seating bowl (surface of revolution, squashed into an oval) ──────────────
function Bowl({ accent, twoTier, cap }: { accent: string; twoTier: boolean; cap: number }) {
  const seatGeo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const innerR = 7.4;                        // pitch edge
    const rows = 26;
    const height = twoTier ? 7.2 : 4.8;
    const spread = twoTier ? 9.5 : 6.4;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      // steeper upper tier: two-segment rake
      const rake = twoTier && t > 0.55 ? 0.55 + (t - 0.55) * 1.35 : t;
      pts.push(new THREE.Vector2(innerR + spread * t, height * Math.pow(rake, 0.9)));
    }
    return new THREE.LatheGeometry(pts, 96);
  }, [twoTier]);

  // concrete/structure skin under the seats
  const shellGeo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const innerR = 7.2;
    const rows = 8;
    const height = twoTier ? 7.4 : 5.0;
    const spread = twoTier ? 10.2 : 7.0;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      pts.push(new THREE.Vector2(innerR + spread * t + 0.5, height * Math.pow(t, 0.9) - 0.4));
    }
    return new THREE.LatheGeometry(pts, 96);
  }, [twoTier]);

  // seat rows — thin bright rings to read as tiers
  const ringCount = twoTier ? 10 : 6;

  return (
    <group scale={[1.28, 1, 1]}>
      {/* outer concrete shell */}
      <mesh geometry={shellGeo}>
        <meshStandardMaterial color="#2b2b30" side={THREE.BackSide} roughness={0.95} metalness={0.05} />
      </mesh>
      {/* seating surface */}
      <mesh geometry={seatGeo}>
        <meshStandardMaterial color={accent} side={THREE.DoubleSide} roughness={0.7} metalness={0.1} />
      </mesh>
      {/* seat-row highlight rings */}
      {Array.from({ length: ringCount }).map((_, i) => {
        const t = (i + 1) / (ringCount + 1);
        const height = twoTier ? 7.2 : 4.8;
        const spread = twoTier ? 9.5 : 6.4;
        const r = 7.4 + spread * t;
        const y = height * Math.pow(t, 0.9);
        return (
          <mesh key={i} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r, 0.06, 6, 96]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.14} />
          </mesh>
        );
      })}
    </group>
  );
}

// ── The pitch ─────────────────────────────────────────────────────────────────
function Pitch() {
  return (
    <group position={[0, 0.02, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[17, 11]} />
        <meshStandardMaterial color="#1f7a34" roughness={1} />
      </mesh>
      {/* mowing stripes */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-7.4 + i * 2.12, 0.01, 0]}>
          <planeGeometry args={[1.06, 11]} />
          <meshStandardMaterial color={i % 2 ? '#249140' : '#1c6e2f'} roughness={1} />
        </mesh>
      ))}
      {/* halfway line */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[0.12, 11]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
      </mesh>
      {/* centre circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[1.7, 1.82, 48]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
      {/* touchline border */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0, 0, 4]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}

// ── Roofs vary by type ───────────────────────────────────────────────────────
function Roof({ type, accent }: { type: WCStadium['roof']; accent: string }) {
  const y = 8.4;
  const inner = 9.0;   // opening over the pitch
  const outer = 21.5;

  if (type === 'Open') {
    // structural rim + 4 floodlight pylons only
    return (
      <group scale={[1.28, 1, 1]}>
        <mesh position={[0, 6.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[17.4, 0.28, 8, 96]} />
          <meshStandardMaterial color="#3a3a42" metalness={0.6} roughness={0.4} />
        </mesh>
        {[[15, 9], [-15, 9], [15, -9], [-15, -9]].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 5.5, 0]}><cylinderGeometry args={[0.16, 0.22, 11, 6]} /><meshStandardMaterial color="#4a4a52" metalness={0.5} /></mesh>
            <mesh position={[0, 11, 0]}><boxGeometry args={[2.4, 1.1, 0.4]} /><meshStandardMaterial color="#fff8dc" emissive="#fff2b0" emissiveIntensity={0.9} /></mesh>
          </group>
        ))}
      </group>
    );
  }

  const isCanopy = type === 'Canopy';
  const isRetract = type === 'Retractable';

  return (
    <group scale={[1.28, 1, 1]} position={[0, y, 0]}>
      {isRetract ? (
        // two panels drawn back, leaving the pitch partly open
        <>
          <mesh rotation={[-Math.PI / 2, 0, Math.PI * 0.06]} position={[0, 0, 3.4]}>
            <ringGeometry args={[inner, outer, 96, 1, 0, Math.PI * 0.78]} />
            <meshStandardMaterial color="#26262c" metalness={0.4} roughness={0.5} side={THREE.DoubleSide} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, Math.PI + Math.PI * 0.06]} position={[0, 0, -3.4]}>
            <ringGeometry args={[inner, outer, 96, 1, 0, Math.PI * 0.78]} />
            <meshStandardMaterial color="#26262c" metalness={0.4} roughness={0.5} side={THREE.DoubleSide} />
          </mesh>
        </>
      ) : (
        // full canopy / fixed ring over the seats, oculus open above pitch
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[inner, outer, 96]} />
          <meshStandardMaterial
            color={isCanopy ? '#e8e8ee' : '#22222a'}
            transparent={isCanopy}
            opacity={isCanopy ? 0.32 : 1}
            metalness={isCanopy ? 0.1 : 0.5}
            roughness={isCanopy ? 0.3 : 0.5}
            emissive={isCanopy ? accent : '#000000'}
            emissiveIntensity={isCanopy ? 0.12 : 0}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {/* roof outer rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[outer, 0.35, 8, 96]} />
        <meshStandardMaterial color="#3a3a42" metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
}

function Scene({ s }: { s: WCStadium }) {
  const grp = useRef<THREE.Group>(null);
  const twoTier = s.capacity >= 68000;
  const accent = useMemo(() => hexToColor(s.accent).getStyle(), [s.accent]);
  useFrame((_, dt) => { if (grp.current) grp.current.rotation.y += dt * 0.12; });
  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[18, 26, 12]} intensity={1.15} />
      <directionalLight position={[-14, 10, -10]} intensity={0.35} color="#88aaff" />
      <group ref={grp}>
        <Pitch />
        <Bowl accent={accent} twoTier={twoTier} cap={s.capacity} />
        <Roof type={s.roof} accent={accent} />
      </group>
    </>
  );
}

const StadiumModel3D: React.FC<{ stadium: WCStadium; className?: string }> = ({ stadium, className }) => {
  return (
    <div className={className} style={{ touchAction: 'none' }}>
      <Canvas dpr={[1, 1.8]} camera={{ position: [0, 26, 40], fov: 42 }} gl={{ antialias: true, alpha: true }}>
        <Suspense fallback={null}>
          <Scene s={stadium} />
          <OrbitControls
            enablePan={false}
            minDistance={26}
            maxDistance={70}
            minPolarAngle={0.15}
            maxPolarAngle={Math.PI / 2.15}
            autoRotate={false}
            enableDamping
            dampingFactor={0.08}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default StadiumModel3D;
