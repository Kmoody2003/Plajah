/**
 * Procedural Model T touring car (teaching model, not measured CAD). Units are inches; +x is toward the
 * radiator, +y up, +z the car's right side (the driver sits on the left, at -z). Standard materials only,
 * no custom shaders, so there are no shader traps; spokes are instanced.
 */
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { MODEL_T_PARTS, type ModelTPartId } from '../../data/dossier/modelTParts';

export interface SceneCtx {
  /** Target explosion 0..1 (written by the slider). */
  target: React.MutableRefObject<number>;
  /** Smoothed explosion 0..1 (written by the scene). */
  smooth: React.MutableRefObject<number>;
  selected: ModelTPartId | null;
  hovered: ModelTPartId | null;
  onSelect: (id: ModelTPartId | null) => void;
  onHover: (id: ModelTPartId | null) => void;
}
const Ctx = createContext<SceneCtx | null>(null);
const useScene = () => useContext(Ctx)!;

const PART = new Map(MODEL_T_PARTS.map(p => [p.id, p]));
const ease = (t: number) => t * t * (3 - 2 * t);
const Y = new THREE.Vector3(0, 1, 0);

// ── small helpers ───────────────────────────────────────────────────────────
type V3 = [number, number, number];
const M = ({ c, rough = 0.7, metal = 0, opacity = 1 }: { c: string; rough?: number; metal?: number; opacity?: number }) => (
  <meshStandardMaterial color={c} roughness={rough} metalness={metal} transparent={opacity < 1} opacity={opacity} />
);
function B({ p, s, c, r, rough, metal, opacity }: { p: V3; s: V3; c: string; r?: V3; rough?: number; metal?: number; opacity?: number }) {
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow>
      <boxGeometry args={s} />
      <M c={c} rough={rough} metal={metal} opacity={opacity} />
    </mesh>
  );
}
/** Cylinder from point a to point b. */
function Rod({ a, b, r, c, rough, metal, seg = 12 }: { a: V3; b: V3; r: number; c: string; rough?: number; metal?: number; seg?: number }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    return { pos: va.clone().add(vb).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize()), len: d.length() };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, len, seg]} />
      <M c={c} rough={rough} metal={metal} />
    </mesh>
  );
}
/** Cylinder whose axis runs along X. */
function CylX({ p, r, len, c, rough, metal, seg = 20 }: { p: V3; r: number; len: number; c: string; rough?: number; metal?: number; seg?: number }) {
  return (
    <mesh position={p} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, len, seg]} />
      <M c={c} rough={rough} metal={metal} />
    </mesh>
  );
}

// ── part wrapper: explode animation, pointer events, highlight ──────────────
function PartGroup({ id, children }: { id: ModelTPartId; children: React.ReactNode }) {
  const ctx = useScene();
  const ref = useRef<THREE.Group>(null);
  const invalidate = useThree(s => s.invalidate);
  const part = PART.get(id)!;
  const active = ctx.selected === id || ctx.hovered === id;

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const e = ease(ctx.smooth.current);
    g.position.set(part.explode[0] * e, part.explode[1] * e, part.explode[2] * e);
    for (const c of g.children) {
      const sp = c.userData.spread as V3 | undefined;
      if (!sp) continue;
      const base = (c.userData.base ??= c.position.clone()) as THREE.Vector3;
      c.position.set(base.x + sp[0] * e, base.y + sp[1] * e, base.z + sp[2] * e);
    }
  });
  useEffect(() => {
    ref.current?.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'emissive' in m) { m.emissive.set(active ? '#ff9a2a' : '#000000'); m.emissiveIntensity = active ? 0.55 : 0; }
    });
    invalidate();
  }, [active, invalidate]);

  return (
    <group
      ref={ref}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); ctx.onHover(id); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { ctx.onHover(null); document.body.style.cursor = ''; }}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); ctx.onSelect(ctx.selected === id ? null : id); }}
    >
      {children}
    </group>
  );
}

// ── geometry builders ───────────────────────────────────────────────────────
/** A flat curved spring leaf lying across the car (along z), arched in y. */
function leafGeometry(half: number, arch: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = (i / 10) * 2 - 1; // -1..1
    pts.push(new THREE.Vector3(0, arch * (1 - t * t), t * half));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.55, 5, false);
}
function Spring({ p, c = '#2a2a2a' }: { p: V3; c?: string }) {
  const leaves = useMemo(() => [22, 17, 12, 7].map((h, i) => ({ g: leafGeometry(h, 3.2), y: -i * 1.0 })), []);
  return (
    <group position={p}>
      {leaves.map((l, i) => (
        <mesh key={i} geometry={l.g} position={[0, l.y, 0]} scale={[3.2, 1, 1]} castShadow receiveShadow>
          <M c={c} rough={0.5} metal={0.4} />
        </mesh>
      ))}
    </group>
  );
}

const SPOKES = 12;
function Wheel() {
  const spokes = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = spokes.current;
    if (!m) return;
    const o = new THREE.Object3D();
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2;
      o.position.set(Math.cos(a) * 7.4, Math.sin(a) * 7.4, 0);
      o.rotation.set(0, 0, a);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      <mesh castShadow receiveShadow><torusGeometry args={[13.4, 1.9, 8, 32]} /><M c="#161616" rough={0.95} /></mesh>
      <mesh scale={[1, 1, 1.5]} castShadow receiveShadow><torusGeometry args={[11.3, 1.0, 6, 28]} /><M c="#a67c3d" rough={0.8} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow><cylinderGeometry args={[3.2, 3.2, 4.4, 16]} /><M c="#8d6a32" rough={0.8} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 2.4]} castShadow><cylinderGeometry args={[2.0, 2.0, 1, 12]} /><M c="#b79a4a" metal={0.6} rough={0.4} /></mesh>
      <instancedMesh ref={spokes} args={[undefined, undefined, SPOKES]} castShadow receiveShadow>
        <boxGeometry args={[8.6, 1.5, 1.7]} />
        <M c="#a67c3d" rough={0.85} />
      </instancedMesh>
    </group>
  );
}

function Fender({ x }: { x: number }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    const R = 17.6, r = 17.0;
    const a0 = THREE.MathUtils.degToRad(-18), a1 = THREE.MathUtils.degToRad(198);
    s.moveTo(Math.cos(a0) * R, Math.sin(a0) * R);
    s.absarc(0, 0, R, a0, a1, false);
    s.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
    s.absarc(0, 0, r, a1, a0, true);
    const g = new THREE.ExtrudeGeometry(s, { depth: 7.5, bevelEnabled: false, curveSegments: 20 });
    g.translate(0, 0, -3.75);
    return g;
  }, []);
  return (
    <>
      {[-1, 1].map(sd => (
        <group key={sd} position={[x, 15, sd * 28]} userData={{ spread: [0, 0, sd * 6] }}>
          <mesh geometry={geo} castShadow receiveShadow><M c="#1c1c1c" rough={0.35} metal={0.2} /></mesh>
        </group>
      ))}
    </>
  );
}

// ── the car ─────────────────────────────────────────────────────────────────
const BLACK = '#26262a', STEEL = '#5d5f63', IRON = '#46484c', BRASS = '#b58a2e';

function Car() {
  const flywheelMagnets = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return [0, Math.cos(a) * 5.2, Math.sin(a) * 5.2] as V3;
  }), []);
  const TT_A: V3 = [2, 38, 0], TT_B: V3 = [-46, 18, 0];
  const dirTT = useMemo(() => new THREE.Vector3(...TT_B).sub(new THREE.Vector3(...TT_A)).normalize(), []);
  const shaftA = useMemo(() => new THREE.Vector3(...TT_A).addScaledVector(dirTT, -5).toArray() as V3, [dirTT]);
  const shaftB = useMemo(() => new THREE.Vector3(...TT_B).addScaledVector(dirTT, 4).toArray() as V3, [dirTT]);

  // steering column geometry (left-hand drive, driver at -z)
  const colA: V3 = [12, 46, -8], hub: V3 = [-4, 58, -8];
  const colQuat = useMemo(() => {
    const d = new THREE.Vector3(...hub).sub(new THREE.Vector3(...colA)).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  }, []);

  return (
    <group>
      <PartGroup id="frame">
        {[-17, 17].map(z => <B key={z} p={[-2, 25, z]} s={[128, 5, 2.6]} c={BLACK} rough={0.6} />)}
        {[58, 30, 2, -30, -60].map(x => <B key={x} p={[x, 25, 0]} s={[3, 3.2, 34]} c={BLACK} rough={0.6} />)}
      </PartGroup>

      <PartGroup id="engine">
        <group position={[36, 40, 0]}>
          <B p={[0, 0, 0]} s={[24, 13, 13]} c={IRON} rough={0.55} metal={0.3} />
          <B p={[0, 8.6, 0]} s={[24, 4.6, 12.4]} c="#56585c" rough={0.55} metal={0.3} />
          <B p={[0, -9.5, 0]} s={[26, 6, 14]} c="#3a3c40" rough={0.6} metal={0.3} />
          <B p={[13.5, 0, 0]} s={[3, 12, 12]} c={STEEL} metal={0.3} />
          <B p={[0, 2, 8.2]} s={[22, 3.6, 3.2]} c="#3b3b3d" rough={0.5} metal={0.5} />
          {[-9, -3, 3, 9].map(x => <Rod key={x} a={[x, 11, 0]} b={[x, 14.2, 0]} r={0.9} c="#cfc9b8" />)}
          {[0, Math.PI / 2].map(a => <B key={a} p={[17, 1, 0]} s={[0.7, 12, 2.6]} c="#2d2d2f" r={[a, 0, 0]} />)}
        </group>
      </PartGroup>

      <PartGroup id="magneto">
        <group position={[20.5, 40, 0]}>
          <CylX p={[0, 0, 0]} r={8} len={3} c="#4a4c50" metal={0.4} rough={0.45} />
          <CylX p={[0.3, 0, 0]} r={8.6} len={1.4} c="#6b6d71" metal={0.5} rough={0.4} />
          <CylX p={[-2, 0, 0]} r={2.4} len={2.5} c="#9a9a96" metal={0.7} rough={0.35} />
          {flywheelMagnets.map((q, i) => <B key={i} p={[-1.8 + q[0], q[1], q[2]]} s={[1.6, 2, 1.4]} c="#a33" />)}
        </group>
      </PartGroup>

      <PartGroup id="transmission">
        <group position={[11, 40, 0]}>
          <CylX p={[0, 0, 0]} r={7} len={11} c="#4b4d51" metal={0.3} rough={0.55} />
          <CylX p={[-6.5, 0, 0]} r={4.2} len={3} c="#3a3c40" metal={0.3} />
          <B p={[0, 7.1, 0]} s={[10, 2.2, 13]} c="#6a6c70" metal={0.3} />
          <B p={[0, -6.5, 0]} s={[9, 3, 12]} c="#36383b" metal={0.3} />
        </group>
      </PartGroup>

      <PartGroup id="torque-tube">
        <mesh position={TT_A} castShadow receiveShadow><sphereGeometry args={[4.6, 16, 12]} /><M c={IRON} metal={0.3} /></mesh>
        <Rod a={TT_A} b={TT_B} r={2.5} c="#3d3f43" metal={0.3} />
        <Rod a={shaftA} b={shaftB} r={1.1} c="#bfc2c6" metal={0.8} rough={0.3} />
      </PartGroup>

      <PartGroup id="rear-axle">
        <mesh position={[-50, 15, 0]} scale={[0.95, 1, 1]} castShadow receiveShadow><sphereGeometry args={[7.2, 18, 14]} /><M c="#44464a" metal={0.3} rough={0.5} /></mesh>
        <mesh position={[-50, 15, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow><cylinderGeometry args={[2.1, 2.1, 56, 12]} /><M c="#3d3f43" metal={0.3} /></mesh>
      </PartGroup>

      <PartGroup id="front-axle">
        <B p={[50, 15, 0]} s={[3.2, 3.4, 50]} c="#3d3f43" metal={0.3} />
        <Rod a={[50, 15, -27]} b={[50, 15, 27]} r={1.5} c="#8c8e92" metal={0.6} />
        <Rod a={[55, 13, -23]} b={[55, 13, 23]} r={0.8} c="#8c8e92" metal={0.6} seg={8} />
      </PartGroup>

      <PartGroup id="front-spring"><Spring p={[56, 22, 0]} /></PartGroup>
      <PartGroup id="rear-spring"><Spring p={[-62, 22, 0]} /></PartGroup>

      <PartGroup id="wheels-front">
        {[-1, 1].map(s => (
          <group key={s} position={[50, 15, s * 28]} userData={{ spread: [0, 0, s * 22] }}><Wheel /></group>
        ))}
      </PartGroup>
      <PartGroup id="wheels-rear">
        {[-1, 1].map(s => (
          <group key={s} position={[-50, 15, s * 28]} userData={{ spread: [0, 0, s * 22] }}><Wheel /></group>
        ))}
      </PartGroup>

      <PartGroup id="radiator">
        <B p={[60, 47, 0]} s={[2.6, 23, 15.4]} c={BRASS} metal={0.85} rough={0.3} />
        <B p={[56.6, 47, 0]} s={[5, 20, 13]} c="#2b2b2d" rough={0.9} />
        <B p={[56.6, 58.8, 0]} s={[6, 1.6, 15]} c={BRASS} metal={0.85} rough={0.3} />
        <Rod a={[61.6, 59, 0]} b={[61.6, 62, 0]} r={1.6} c={BRASS} metal={0.85} rough={0.3} />
        <Rod a={[62, 37, 0]} b={[66, 37, 0]} r={0.6} c="#8c8e92" metal={0.6} seg={8} />
      </PartGroup>

      <PartGroup id="hood">
        <B p={[33, 59, 0]} s={[42, 1.4, 11.5]} c={BLACK} rough={0.35} metal={0.2} />
        {[-1, 1].map(s => <B key={s} p={[33, 51, s * 9.6]} s={[42, 17, 1.2]} c={BLACK} rough={0.35} metal={0.2} r={[s * 0.1, 0, 0]} />)}
        <B p={[33, 59.9, 0]} s={[41, 0.5, 1.2]} c="#8c8e92" metal={0.7} rough={0.3} />
      </PartGroup>

      <PartGroup id="fuel-tank">
        <B p={[-14, 40, 0]} s={[22, 10, 28]} c="#4d4d46" metal={0.4} rough={0.55} />
        <Rod a={[-14, 45, 8]} b={[-14, 47.5, 8]} r={1.6} c="#8c8e92" metal={0.6} />
      </PartGroup>

      <PartGroup id="steering">
        <Rod a={colA} b={hub} r={1.1} c="#2a2a2c" metal={0.3} />
        <group position={hub} quaternion={colQuat}>
          <mesh castShadow><torusGeometry args={[7.6, 0.75, 8, 28]} /><M c="#3a2b1d" rough={0.5} /></mesh>
          <B p={[0, 0, 0]} s={[15, 0.8, 0.8]} c="#2a2a2c" />
          <B p={[0, 0, 0]} s={[0.8, 15, 0.8]} c="#2a2a2c" />
          <mesh castShadow><cylinderGeometry args={[1.4, 1.4, 1.6, 12]} /><M c={BRASS} metal={0.8} rough={0.3} /></mesh>
        </group>
        <Rod a={[-2.6, 56.6, -9.6]} b={[-6.8, 54.6, -11.6]} r={0.35} c={BRASS} metal={0.7} seg={6} />
        <Rod a={[-2.6, 56.6, -6.4]} b={[-6.8, 54.6, -4.6]} r={0.35} c={BRASS} metal={0.7} seg={6} />
      </PartGroup>

      <PartGroup id="pedals">
        {[-14, -8, -2].map(z => (
          <React.Fragment key={z}>
            <Rod a={[4, 31, z]} b={[-1, 33.5, z]} r={0.6} c="#2a2a2c" seg={6} />
            <B p={[-1.5, 33.7, z]} s={[4.2, 0.8, 3.4]} c="#3a3a3d" r={[0, 0, 0.3]} metal={0.4} />
          </React.Fragment>
        ))}
      </PartGroup>

      <PartGroup id="fenders"><Fender x={50} /><Fender x={-50} /></PartGroup>

      <PartGroup id="running-boards">
        {[-1, 1].map(s => (
          <group key={s} position={[0, 20, s * 29]} userData={{ spread: [0, 0, s * 8] }}>
            <B p={[0, 0, 0]} s={[66, 1, 12]} c="#2a2a2c" rough={0.9} />
            <B p={[0, 0.7, 0]} s={[66, 0.4, 10]} c="#161616" rough={1} />
          </group>
        ))}
      </PartGroup>

      <PartGroup id="body">
        <B p={[-27, 30, 0]} s={[78, 2, 44]} c="#26262a" rough={0.6} />
        {[-1, 1].map(s => <B key={s} p={[-33, 38, s * 21]} s={[66, 16, 1.5]} c={BLACK} rough={0.3} metal={0.15} />)}
        <B p={[8, 42, 0]} s={[8, 24, 42]} c={BLACK} rough={0.3} metal={0.15} />
        <B p={[-66, 38, 0]} s={[1.5, 16, 42]} c={BLACK} rough={0.3} metal={0.15} />
        {[-1, 1].map(s => <B key={`d${s}`} p={[-24, 38, s * 21.9]} s={[0.4, 15, 0.4]} c="#050505" />)}
        {[-1, 1].map(s => <B key={`w${s}`} p={[3, 63, s * 19.5]} s={[1, 18, 1]} c={BRASS} metal={0.7} rough={0.35} />)}
        <B p={[3, 72, 0]} s={[1, 1, 40]} c={BRASS} metal={0.7} rough={0.35} />
        <B p={[3, 63, 0]} s={[0.3, 16, 37]} c="#9fb4c0" opacity={0.25} rough={0.1} />
      </PartGroup>

      <PartGroup id="seats">
        <B p={[-16, 47, 0]} s={[12, 4, 38]} c="#4a3426" rough={0.9} />
        <B p={[-23, 56, 0]} s={[3, 14, 38]} c="#4a3426" rough={0.9} />
        <B p={[-50, 47, 0]} s={[12, 4, 38]} c="#4a3426" rough={0.9} />
        <B p={[-58, 56, 0]} s={[3, 14, 38]} c="#4a3426" rough={0.9} />
      </PartGroup>

      <PartGroup id="lamps">
        {[-1, 1].map(s => (
          <group key={s} position={[52, 47, s * 22]} userData={{ spread: [0, 0, s * 8] }}>
            <CylX p={[0, 0, 0]} r={4.3} len={5.5} c={BRASS} metal={0.85} rough={0.3} />
            <CylX p={[2.9, 0, 0]} r={3.6} len={0.6} c="#e8e4d0" rough={0.15} />
            <Rod a={[0, -3, 0]} b={[0, -14, 0]} r={0.7} c={BRASS} metal={0.8} seg={6} />
          </group>
        ))}
        {[-1, 1].map(s => <B key={`c${s}`} p={[8, 53, s * 23]} s={[3.5, 5, 3]} c={BRASS} metal={0.85} rough={0.3} />)}
        <B p={[-68, 40, -17]} s={[3, 4, 4]} c={BRASS} metal={0.85} rough={0.3} />
      </PartGroup>
    </group>
  );
}

// ── stage: lights, ground, camera ───────────────────────────────────────────
function Ground() {
  const ctx = useScene();
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => { if (ref.current) ref.current.position.y = -ease(ctx.smooth.current) * 46; });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[900, 48]} />
      <meshStandardMaterial color="#8d8a82" roughness={1} />
    </mesh>
  );
}

function Smoother({ ctx }: { ctx: SceneCtx }) {
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.25);
    ctx.smooth.current += (ctx.target.current - ctx.smooth.current) * (1 - Math.exp(-d * 7));
    if (Math.abs(ctx.target.current - ctx.smooth.current) < 0.0005) ctx.smooth.current = ctx.target.current;
  }, -1);
  return null;
}

/** Drives rendering at a fixed cadence when the canvas runs a demand loop (film look). */
export function Ticker({ fps, on }: { fps: number; on: boolean }) {
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => invalidate(), 1000 / fps);
    return () => window.clearInterval(id);
  }, [on, fps, invalidate]);
  return null;
}

export function ModelTScene({ ctx, autoRotate, shadowSize, onInteract }: { ctx: SceneCtx; autoRotate: boolean; shadowSize: number; onInteract: () => void }) {
  return (
    <Ctx.Provider value={ctx}>
      <color attach="background" args={['#b2ada1']} />
      <fog attach="fog" args={["#b2ada1", 700, 1600]} />
      <hemisphereLight args={['#dfe6f0', '#5a5046', 0.85]} />
      <directionalLight
        position={[170, 260, 120]} intensity={3.6} castShadow
        shadow-mapSize={[shadowSize, shadowSize]} shadow-camera-left={-190} shadow-camera-right={190}
        shadow-camera-top={190} shadow-camera-bottom={-190} shadow-camera-near={50} shadow-camera-far={800} shadow-bias={-0.0005}
      />
      <Smoother ctx={ctx} />
      <Ground />
      <Car />
      <OrbitControls
        target={[0, 32, 0]} enableDamping dampingFactor={0.08} enablePan={false}
        minDistance={160} maxDistance={900} maxPolarAngle={Math.PI * 0.52}
        autoRotate={autoRotate} autoRotateSpeed={0.9}
        onStart={onInteract} onEnd={onInteract}
      />
    </Ctx.Provider>
  );
}
