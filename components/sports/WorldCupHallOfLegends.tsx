/**
 * WorldCupHallOfLegends — 3D walk through every World Cup champion, 1930 → today.
 *
 * A night-time 3D soccer stadium: full pitch with markings and goals, tiered
 * grandstands with an instanced crowd, corner floodlights — and down the
 * center line, one golden trophy per tournament on a pedestal. Jules Rimet
 * trophies for 1930–1970, the modern FIFA World Cup Trophy from 1974 on,
 * dark pedestals for the WWII-cancelled years, and a silver "pending" trophy
 * for a tournament still being played.
 *
 * Click a trophy (or use Prev/Next/Tour) to fly the camera to it; the HUD
 * shows winner, runner-up, score, and the stadium where it happened.
 */

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Billboard, Text } from '@react-three/drei';
import { ChevronLeft, ChevronRight, Play, Pause, Trophy, Maximize2 } from 'lucide-react';
import { WC_FINALS, type WCFinal } from '../../data/wcFinalsTimeline';

const SPACING = 13;
const COUNT = WC_FINALS.length;
const LINE_LEN = (COUNT - 1) * SPACING;
const X0 = -LINE_LEN / 2;
const PITCH_L = LINE_LEN + 50;
const PITCH_W = 60;

const xFor = (i: number) => X0 + i * SPACING;

// ─── Trophy meshes (lathe profiles) ──────────────────────────────────────────

const GOLD = { color: '#FFD23F', metalness: 1, roughness: 0.22 };
const SILVER = { color: '#cfd6e4', metalness: 1, roughness: 0.3 };

// Modern FIFA World Cup Trophy: malachite-banded base, twisting body, globe.
const FifaTrophy: React.FC<{ pending?: boolean }> = ({ pending }) => {
  const bodyProfile = useMemo(() => [
    new THREE.Vector2(0.001, 0.5), new THREE.Vector2(0.62, 0.5), new THREE.Vector2(0.66, 0.62),
    new THREE.Vector2(0.5, 0.8), new THREE.Vector2(0.34, 1.1), new THREE.Vector2(0.3, 1.4),
    new THREE.Vector2(0.42, 1.75), new THREE.Vector2(0.52, 2.0), new THREE.Vector2(0.5, 2.2),
    new THREE.Vector2(0.62, 2.42), new THREE.Vector2(0.7, 2.55), new THREE.Vector2(0.52, 2.62),
  ], []);
  const mat = pending ? SILVER : GOLD;
  return (
    <group>
      {/* malachite base bands */}
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.72, 0.78, 0.28, 40]} />
        <meshStandardMaterial color="#0e5c43" metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.66, 0.72, 0.2, 40]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <latheGeometry args={[bodyProfile, 48]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {/* the globe */}
      <mesh position={[0, 3.05, 0]}>
        <sphereGeometry args={[0.58, 36, 24]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      {pending && (
        <Billboard position={[0, 3.05, 0.62]}>
          <Text fontSize={0.6} color="#0a0a12" anchorX="center" anchorY="middle">?</Text>
        </Billboard>
      )}
    </group>
  );
};

// Jules Rimet Trophy: lapis base, slender column, winged figure holding a cup.
const RimetTrophy: React.FC = () => {
  const cupProfile = useMemo(() => [
    new THREE.Vector2(0.001, 0), new THREE.Vector2(0.3, 0.02), new THREE.Vector2(0.34, 0.12),
    new THREE.Vector2(0.16, 0.22), new THREE.Vector2(0.13, 0.4), new THREE.Vector2(0.34, 0.62),
    new THREE.Vector2(0.42, 0.82), new THREE.Vector2(0.38, 0.86), new THREE.Vector2(0.3, 0.7),
  ], []);
  return (
    <group>
      {/* lapis lazuli stepped base */}
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.55, 0.62, 0.36, 8]} />
        <meshStandardMaterial color="#1d3a8f" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.42, 0.5, 0.14, 8]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>
      {/* slender column (stylized Nike figure) */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.12, 0.2, 1.25, 20]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>
      {/* wings */}
      <mesh position={[0.2, 1.45, 0]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.5, 0.16, 0.06]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>
      <mesh position={[-0.2, 1.45, 0]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.5, 0.16, 0.06]} />
        <meshStandardMaterial {...GOLD} />
      </mesh>
      {/* octagonal cup held aloft */}
      <group position={[0, 1.78, 0]} scale={1.15}>
        <mesh>
          <latheGeometry args={[cupProfile, 8]} />
          <meshStandardMaterial {...GOLD} flatShading />
        </mesh>
      </group>
    </group>
  );
};

// ─── Pedestal + trophy + labels ──────────────────────────────────────────────

const TrophyStation: React.FC<{
  final: WCFinal;
  index: number;
  selected: boolean;
  onSelect: (i: number) => void;
}> = ({ final, index, selected, onSelect }) => {
  const x = xFor(index);
  const spin = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (spin.current && selected) spin.current.rotation.y += delta * 0.6;
  });

  const pedestalColor = final.cancelled ? '#15151c' : selected ? '#2a2118' : '#1c1c26';

  return (
    <group position={[x, 0, 0]}>
      {/* pedestal */}
      <mesh position={[0, 1.0, 0]} onClick={(e) => { e.stopPropagation(); onSelect(index); }}>
        <cylinderGeometry args={[1.35, 1.6, 2.0, 28]} />
        <meshStandardMaterial color={pedestalColor} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.05, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 0.12, 28]} />
        <meshStandardMaterial color={selected ? '#FF8C00' : '#3a3a48'} metalness={0.8} roughness={0.3}
          emissive={selected ? '#FF8C00' : '#000000'} emissiveIntensity={selected ? 0.5 : 0} />
      </mesh>

      {/* year on the pedestal */}
      <Text position={[0, 1.05, 1.62]} fontSize={0.62} color={final.cancelled ? '#555566' : '#FFD23F'} anchorX="center" anchorY="middle" fontWeight={900}>
        {String(final.year)}
      </Text>
      <Text position={[0, 1.05, -1.62]} rotation={[0, Math.PI, 0]} fontSize={0.62} color={final.cancelled ? '#555566' : '#FFD23F'} anchorX="center" anchorY="middle" fontWeight={900}>
        {String(final.year)}
      </Text>

      {/* trophy */}
      {!final.cancelled && (
        <group ref={spin} position={[0, 2.12, 0]} scale={selected ? 1.18 : 1}>
          {final.trophy === 'rimet' ? <RimetTrophy /> : <FifaTrophy pending={final.pending} />}
        </group>
      )}

      {/* light beam on selection */}
      {selected && !final.cancelled && (
        <mesh position={[0, 9, 0]}>
          <cylinderGeometry args={[1.6, 2.4, 14, 24, 1, true]} />
          <meshBasicMaterial color="#FFD23F" transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}

      {/* floating winner label */}
      <Billboard position={[0, final.cancelled ? 4.2 : 6.4, 0]}>
        <Text fontSize={selected ? 0.85 : 0.6} color={final.cancelled ? '#666677' : selected ? '#FFFFFF' : '#c9c9d6'} anchorX="center" anchorY="middle" fontWeight={900} outlineWidth={0.03} outlineColor="#000000">
          {final.cancelled ? 'WWII' : final.pending ? 'IN PLAY' : final.winner.toUpperCase()}
        </Text>
      </Billboard>
    </group>
  );
};

// ─── Stadium dressing ────────────────────────────────────────────────────────

const Pitch: React.FC = () => {
  const stripes = useMemo(() => Array.from({ length: Math.ceil(PITCH_L / SPACING) }, (_, i) => i), []);
  const lineMat = <meshBasicMaterial color="#e8f5e9" />;
  return (
    <group>
      {/* grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[PITCH_L, PITCH_W]} />
        <meshStandardMaterial color="#1c6b2e" roughness={1} />
      </mesh>
      {/* mow stripes */}
      {stripes.map(i => i % 2 === 0 && (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-PITCH_L / 2 + (i + 0.5) * SPACING, 0.01, 0]}>
          <planeGeometry args={[SPACING, PITCH_W]} />
          <meshStandardMaterial color="#237a36" roughness={1} />
        </mesh>
      ))}
      {/* boundary lines */}
      {[[0, PITCH_W / 2 - 1], [0, -(PITCH_W / 2 - 1)]].map(([x, z], i) => (
        <mesh key={`side${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, z]}>
          <planeGeometry args={[PITCH_L - 4, 0.35]} />
          {lineMat}
        </mesh>
      ))}
      {[(PITCH_L / 2 - 2), -(PITCH_L / 2 - 2)].map((x, i) => (
        <mesh key={`end${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, 0]}>
          <planeGeometry args={[0.35, PITCH_W - 2]} />
          {lineMat}
        </mesh>
      ))}
      {/* halfway line + center circle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[0.35, PITCH_W - 2]} />
        {lineMat}
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[8.6, 9, 64]} />
        {lineMat}
      </mesh>
      {/* penalty boxes */}
      {[PITCH_L / 2 - 2, -(PITCH_L / 2 - 2)].map((xEnd, i) => {
        const dir = i === 0 ? -1 : 1;
        return (
          <group key={`box${i}`}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[xEnd + dir * 8, 0.02, 0]}>
              <planeGeometry args={[0.3, 30]} />
              {lineMat}
            </mesh>
            {[15, -15].map(z => (
              <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[xEnd + dir * 4, 0.02, z]}>
                <planeGeometry args={[8, 0.3]} />
                {lineMat}
              </mesh>
            ))}
          </group>
        );
      })}
      {/* goals */}
      {[PITCH_L / 2 - 2, -(PITCH_L / 2 - 2)].map((xEnd, i) => (
        <group key={`goal${i}`} position={[xEnd, 0, 0]}>
          {[6, -6].map(z => (
            <mesh key={z} position={[0, 1.3, z]}>
              <cylinderGeometry args={[0.12, 0.12, 2.6, 10]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          ))}
          <mesh position={[0, 2.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 12, 10]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}
    </group>
  );
};

const Crowd: React.FC = () => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COLORS = ['#FF8C00', '#e8e8f0', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#a855f7', '#FFD23F'];
  const transforms = useMemo(() => {
    const arr: { pos: [number, number, number]; color: THREE.Color }[] = [];
    const standLen = PITCH_L + 20;
    for (let side = 0; side < 2; side++) {
      const zBase = (PITCH_W / 2 + 6) * (side === 0 ? 1 : -1);
      for (let tier = 0; tier < 3; tier++) {
        const n = 380;
        for (let k = 0; k < n; k++) {
          arr.push({
            pos: [
              -standLen / 2 + Math.random() * standLen,
              2.9 + tier * 3.1 + Math.random() * 0.3,
              zBase + (tier * 4.4 + Math.random() * 2.6) * (side === 0 ? 1 : -1),
            ],
            color: new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]),
          });
        }
      }
    }
    // end stands
    for (let end = 0; end < 2; end++) {
      const xBase = (PITCH_L / 2 + 6) * (end === 0 ? 1 : -1);
      for (let tier = 0; tier < 2; tier++) {
        for (let k = 0; k < 160; k++) {
          arr.push({
            pos: [
              xBase + (tier * 4.4 + Math.random() * 2.6) * (end === 0 ? 1 : -1),
              2.9 + tier * 3.1 + Math.random() * 0.3,
              -PITCH_W / 2 + Math.random() * PITCH_W,
            ],
            color: new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]),
          });
        }
      }
    }
    return arr;
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    transforms.forEach((t, i) => {
      dummy.position.set(...t.pos);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
      ref.current!.setColorAt(i, t.color);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [transforms]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, transforms.length]}>
      <sphereGeometry args={[0.32, 6, 5]} />
      <meshStandardMaterial roughness={0.9} />
    </instancedMesh>
  );
};

const Stands: React.FC = () => {
  const standLen = PITCH_L + 24;
  const tierGeo = (len: number) => <boxGeometry args={[len, 2.6, 4.2]} />;
  return (
    <group>
      {[1, -1].map(side => (
        <group key={side}>
          {[0, 1, 2].map(tier => (
            <mesh key={tier} position={[0, 1.4 + tier * 3.1, side * (PITCH_W / 2 + 7 + tier * 4.4)]}>
              {tierGeo(standLen)}
              <meshStandardMaterial color="#14141c" roughness={0.9} />
            </mesh>
          ))}
          {/* roof */}
          <mesh position={[0, 12.4, side * (PITCH_W / 2 + 13)]} rotation={[side * 0.12, 0, 0]}>
            <boxGeometry args={[standLen, 0.4, 16]} />
            <meshStandardMaterial color="#0c0c14" metalness={0.5} roughness={0.6} />
          </mesh>
        </group>
      ))}
      {[1, -1].map(end => (
        <group key={`e${end}`}>
          {[0, 1].map(tier => (
            <mesh key={tier} position={[end * (PITCH_L / 2 + 7 + tier * 4.4), 1.4 + tier * 3.1, 0]} rotation={[0, Math.PI / 2, 0]}>
              {tierGeo(PITCH_W + 8)}
              <meshStandardMaterial color="#14141c" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      {/* floodlight pylons */}
      {[1, -1].flatMap(sx => [1, -1].map(sz => (
        <group key={`${sx}${sz}`} position={[sx * (PITCH_L / 2 + 14), 0, sz * (PITCH_W / 2 + 20)]}>
          <mesh position={[0, 13, 0]}>
            <cylinderGeometry args={[0.35, 0.55, 26, 10]} />
            <meshStandardMaterial color="#222230" />
          </mesh>
          <mesh position={[sx * -1.2, 26.5, sz * -1.2]} rotation={[sz * 0.5, 0, sx * -0.3]}>
            <boxGeometry args={[5, 3, 0.8]} />
            <meshStandardMaterial color="#fffbe8" emissive="#fff6cc" emissiveIntensity={1.6} />
          </mesh>
        </group>
      )))}
      {/* PLAJAH ad boards */}
      {[1, -1].map(side => (
        <group key={`ad${side}`}>
          <mesh position={[0, 0.7, side * (PITCH_W / 2 + 2.5)]}>
            <boxGeometry args={[standLen - 30, 1.4, 0.3]} />
            <meshStandardMaterial color="#0a0a12" emissive="#1a1208" emissiveIntensity={0.4} />
          </mesh>
          {[-90, 0, 90].map(x => (
            <Text key={x} position={[x, 0.72, side * (PITCH_W / 2 + 2.5 + side * 0.001) + side * 0.2]}
              rotation={[0, side === 1 ? Math.PI : 0, 0]}
              fontSize={0.8} color="#FF8C00" anchorX="center" anchorY="middle" fontWeight={900} letterSpacing={0.3}>
              PLAJAH SPORTS · HALL OF LEGENDS
            </Text>
          ))}
        </group>
      ))}
    </group>
  );
};

// Camera fly-to controller
const CameraRig: React.FC<{ targetIndex: number; flyToken: number; controlsRef: React.MutableRefObject<any> }> = ({ targetIndex, flyToken, controlsRef }) => {
  const flying = useRef(false);
  const lastToken = useRef(-1);
  useFrame(({ camera }) => {
    if (lastToken.current !== flyToken) { lastToken.current = flyToken; flying.current = true; }
    if (!flying.current || !controlsRef.current) return;
    const x = xFor(targetIndex);
    const camGoal = new THREE.Vector3(x + 7, 6.5, 16);
    const lookGoal = new THREE.Vector3(x, 3.2, 0);
    camera.position.lerp(camGoal, 0.07);
    controlsRef.current.target.lerp(lookGoal, 0.09);
    controlsRef.current.update();
    if (camera.position.distanceTo(camGoal) < 0.25) flying.current = false;
  });
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const stop = () => { flying.current = false; };
    c.addEventListener?.('start', stop);
    return () => c.removeEventListener?.('start', stop);
  }, [controlsRef]);
  return null;
};

// ─── Main component ──────────────────────────────────────────────────────────

export const WorldCupHallOfLegends: React.FC = () => {
  const decided = useMemo(() => WC_FINALS.map((f, i) => ({ f, i })).filter(x => !x.f.cancelled), []);
  const defaultIndex = useMemo(() => {
    const last = [...WC_FINALS].reverse().find(f => !f.cancelled && !f.pending);
    return last ? WC_FINALS.indexOf(last) : 0;
  }, []);

  const [selected, setSelected] = useState(defaultIndex);
  const [flyToken, setFlyToken] = useState(0);
  const [touring, setTouring] = useState(false);
  const controlsRef = useRef<any>(null);

  const select = (i: number) => { setSelected(i); setFlyToken(t => t + 1); };

  const step = (dir: 1 | -1) => {
    const order = decided.map(d => d.i);
    const pos = order.indexOf(selected);
    const next = order[(pos + dir + order.length) % order.length];
    select(next);
  };

  useEffect(() => {
    if (!touring) return;
    const id = setInterval(() => step(1), 4500);
    return () => clearInterval(id);
  }, [touring, selected]);

  const f = WC_FINALS[selected];

  return (
    <div className="space-y-3">
      <div className="relative w-full rounded-[2rem] overflow-hidden border border-white/10" style={{ height: 600 }}>
        <Canvas camera={{ position: [xFor(defaultIndex) + 30, 26, 60], fov: 48, near: 0.5, far: 1600 }} dpr={[1, 1.6]}>
          <Suspense fallback={null}>
            <color attach="background" args={['#05060e']} />
            <fog attach="fog" args={['#05060e', 220, 620]} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[80, 120, 60]} intensity={1.5} color="#fff4d6" />
            <directionalLight position={[-90, 80, -50]} intensity={0.7} color="#aac4ff" />
            <pointLight position={[xFor(selected), 12, 6]} intensity={120} color="#ffd76a" />

            <Pitch />
            <Stands />
            <Crowd />

            {WC_FINALS.map((final, i) => (
              <TrophyStation key={final.year} final={final} index={i} selected={i === selected} onSelect={select} />
            ))}

            <OrbitControls ref={controlsRef} maxPolarAngle={Math.PI / 2.08} minDistance={6} maxDistance={420} />
            <CameraRig targetIndex={selected} flyToken={flyToken} controlsRef={controlsRef} />
          </Suspense>
        </Canvas>

        {/* Title */}
        <div className="absolute top-4 left-4 pointer-events-none">
          <p className="text-[8px] font-black uppercase tracking-[0.4em] text-[#FF8C00]">World Cup History</p>
          <h3 className="text-lg font-black uppercase tracking-tight italic text-white">Hall of Legends</h3>
          <p className="text-[8px] text-white/35 uppercase tracking-widest mt-0.5">1930 → today · every champion on the timeline</p>
        </div>

        {/* Controls */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <button onClick={() => step(-1)}
            className="p-2.5 bg-black/60 backdrop-blur border border-white/15 rounded-full text-white/70 hover:text-white hover:border-[#FF8C00]/50 transition-all">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => setTouring(t => !t)}
            className={`p-2.5 backdrop-blur border rounded-full transition-all ${touring ? 'bg-[#FF8C00] border-[#FF8C00] text-black' : 'bg-black/60 border-white/15 text-white/70 hover:text-white'}`}>
            {touring ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={() => step(1)}
            className="p-2.5 bg-black/60 backdrop-blur border border-white/15 rounded-full text-white/70 hover:text-white hover:border-[#FF8C00]/50 transition-all">
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Edition HUD card */}
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-md bg-black/70 backdrop-blur-xl border border-white/12 rounded-[1.5rem] px-5 py-4">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-[#FF8C00]/15 border border-[#FF8C00]/30 text-[8px] font-black uppercase tracking-widest text-[#FF8C00]">
              {f.year} · {f.hostFlag} {f.host}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[7px] font-black uppercase tracking-widest text-white/40">
              {f.trophy === 'rimet' ? 'Jules Rimet Trophy' : 'FIFA World Cup Trophy'}
            </span>
          </div>

          {f.cancelled ? (
            <p className="text-sm font-black uppercase tracking-tight text-white/60">Tournament not held</p>
          ) : f.pending ? (
            <p className="text-sm font-black uppercase tracking-tight text-white">Champion to be crowned</p>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Trophy size={13} className="text-[#FFD23F]" />
                <span className="text-base font-black uppercase tracking-tight text-white">{f.winnerFlag} {f.winner}</span>
              </div>
              <span className="text-sm font-black text-[#FF8C00] tabular-nums">{f.score}</span>
              <span className="text-sm font-bold uppercase text-white/45">{f.runnerUpFlag} {f.runnerUp}</span>
            </div>
          )}

          {f.venue && (
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/35 mt-1.5">
              {f.venue} · {f.city}
            </p>
          )}
          {f.note && <p className="text-[10px] text-white/50 leading-relaxed mt-1.5">{f.note}</p>}
        </div>
      </div>

      {/* Quick year scrubber */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {WC_FINALS.map((final, i) => (
          <button key={final.year} onClick={() => select(i)}
            disabled={final.cancelled}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border transition-all ${
              final.cancelled ? 'bg-white/[0.02] border-white/5 text-white/15 cursor-not-allowed'
              : i === selected ? 'bg-[#FF8C00] text-black border-[#FF8C00]'
              : 'bg-white/5 border-white/10 text-white/45 hover:text-white'}`}>
            {final.year}{!final.cancelled && !final.pending ? ` ${final.winnerFlag}` : ''}
          </button>
        ))}
      </div>
    </div>
  );
};

export default WorldCupHallOfLegends;
