/**
 * Procedural Model T touring car (teaching model, not measured CAD). Units are inches; +x is toward the
 * radiator, +y up, +z the car's right side (the driver sits on the left, at -z). Standard materials only,
 * no custom shaders, so there are no shader traps; spokes are instanced. Lighting uses a procedural
 * studio environment (no network HDRI) so metal and dark paint pick up reflections and rim light.
 */
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MODEL_T_PARTS, type ModelTPartId } from '../../data/dossier/modelTParts';

export type ViewName = '3q' | 'side' | 'front' | 'top' | 'rear3q';
/** Camera presets: direction from the car's centre toward the camera (x forward, y up, z right side). */
export const MODEL_T_VIEWS: Array<{ id: ViewName; label: string; dir: [number, number, number] }> = [
  { id: '3q', label: '3/4', dir: [0.9, 0.6, 1] },
  { id: 'side', label: 'Side', dir: [0, 0.08, 1] },
  { id: 'front', label: 'Front', dir: [1, 0.1, 0] },
  { id: 'top', label: 'Top', dir: [0, 1, 0.02] },
  { id: 'rear3q', label: 'Rear 3/4', dir: [-0.8, 0.45, -1] },
];

export interface SceneCtx {
  /** Target explosion 0..1 (written by the slider). */
  target: React.MutableRefObject<number>;
  /** Smoothed explosion 0..1 (written by the scene). */
  smooth: React.MutableRefObject<number>;
  /** World bounds of the car at the current explosion (written by the camera rig). */
  bounds: React.MutableRefObject<THREE.Box3>;
  /** A camera preset request; bump `n` to request it again. */
  view: React.MutableRefObject<{ id: ViewName; n: number }>;
  showTop: boolean;
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
const M = ({ c, rough = 0.7, metal = 0, opacity = 1, side }: { c: string; rough?: number; metal?: number; opacity?: number; side?: THREE.Side }) => (
  <meshStandardMaterial color={c} roughness={rough} metalness={metal} transparent={opacity < 1} opacity={opacity} side={side} depthWrite={opacity >= 1} />
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
  }, [a[0], a[1], a[2], b[0], b[1], b[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <mesh position={pos} quaternion={quat} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, len, seg]} />
      <M c={c} rough={rough} metal={metal} />
    </mesh>
  );
}
/** Cylinder whose axis runs along X. */
function CylX({ p, r, len, c, rough, metal, seg = 20, r2 }: { p: V3; r: number; len: number; c: string; rough?: number; metal?: number; seg?: number; r2?: number }) {
  return (
    <mesh position={p} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
      {/* after the rotation the "top" radius faces -x */}
      <cylinderGeometry args={[r2 ?? r, r, len, seg]} />
      <M c={c} rough={rough} metal={metal} />
    </mesh>
  );
}
/** Cylinder whose axis runs along Z. */
function CylZ({ p, r, len, c, rough, metal, seg = 20 }: { p: V3; r: number; len: number; c: string; rough?: number; metal?: number; seg?: number }) {
  return (
    <mesh position={p} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[r, r, len, seg]} />
      <M c={c} rough={rough} metal={metal} />
    </mesh>
  );
}

// ── part wrapper: explode animation, pointer events, highlight ──────────────
const HL_SELECT = new THREE.Color('#ff8a1f');
const HL_HOVER = new THREE.Color('#ffd9a0');
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX);

/** A translucent box plus edge lines around the active part (drawn over everything). */
function makeOutline() {
  const g = new THREE.Group();
  const fill = new THREE.Mesh(UNIT_BOX, new THREE.MeshBasicMaterial({ color: HL_SELECT, transparent: true, opacity: 0.13, depthWrite: false, depthTest: false }));
  const lines = new THREE.LineSegments(UNIT_EDGES, new THREE.LineBasicMaterial({ color: HL_SELECT, depthTest: false, transparent: true }));
  fill.renderOrder = 998; lines.renderOrder = 999;
  fill.raycast = () => {}; lines.raycast = () => {};
  g.add(fill, lines);
  g.visible = false;
  return { g, fill, lines };
}

function PartGroup({ id, children }: { id: ModelTPartId; children: React.ReactNode }) {
  const ctx = useScene();
  const ref = useRef<THREE.Group>(null);
  const scene = useThree(s => s.scene);
  const invalidate = useThree(s => s.invalidate);
  const part = PART.get(id)!;
  const selected = ctx.selected === id;
  const hovered = ctx.hovered === id;
  const active = selected || hovered;
  const outline = useMemo(makeOutline, []);
  const mats = useRef<THREE.MeshStandardMaterial[]>([]);
  const box = useMemo(() => new THREE.Box3(), []);
  const size = useMemo(() => new THREE.Vector3(), []);
  const center = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => { scene.add(outline.g); return () => { scene.remove(outline.g); }; }, [scene, outline]);

  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const e = ease(ctx.smooth.current);
    g.position.set(part.explode[0] * e, part.explode[1] * e, part.explode[2] * e);
    if (active) {
      const k = selected ? 0.75 + 0.3 * Math.sin(clock.elapsedTime * 5) : 0.4;
      for (const m of mats.current) m.emissiveIntensity = k;
      g.updateWorldMatrix(true, true);
      box.setFromObject(g);
      if (!box.isEmpty()) {
        box.getSize(size).addScalar(2.4); box.getCenter(center);
        outline.g.position.copy(center); outline.g.scale.copy(size);
      }
    }
  });
  useEffect(() => {
    const list: THREE.MeshStandardMaterial[] = [];
    ref.current?.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'emissive' in m) list.push(m);
    });
    mats.current = list;
    for (const m of list) { m.emissive.copy(active ? (selected ? HL_SELECT : HL_HOVER) : new THREE.Color(0)); m.emissiveIntensity = active ? 0.6 : 0; }
    const col = selected ? HL_SELECT : HL_HOVER;
    (outline.fill.material as THREE.MeshBasicMaterial).color.copy(col);
    (outline.lines.material as THREE.LineBasicMaterial).color.copy(col);
    outline.g.visible = active;
    invalidate();
  }, [active, selected, invalidate, outline, ctx.showTop]);

  return (
    <group
      ref={ref} name={id}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); ctx.onHover(id); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { ctx.onHover(null); document.body.style.cursor = ''; }}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); ctx.onSelect(ctx.selected === id ? null : id); }}
    >
      {children}
    </group>
  );
}

/** A sub-part that slides outward when exploded. Position is driven here (not by props) so re-renders cannot disturb it. */
function Sp({ at, spread, children }: { at: V3; spread: V3; children: React.ReactNode }) {
  const ctx = useScene();
  const ref = useRef<THREE.Group>(null);
  const home = useRef({ at, spread });
  home.current = { at, spread };
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const e = ease(ctx.smooth.current), { at: a, spread: d } = home.current;
    g.position.set(a[0] + d[0] * e, a[1] + d[1] * e, a[2] + d[2] * e);
  });
  useLayoutEffect(() => { ref.current?.position.set(...home.current.at); }, []);
  return <group ref={ref}>{children}</group>;
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
function Spring({ p, c = '#55575d' }: { p: V3; c?: string }) {
  const leaves = useMemo(() => [22, 17, 12, 7].map((h, i) => ({ g: leafGeometry(h, 3.2), y: -i * 1.0 })), []);
  return (
    <group position={p}>
      {leaves.map((l, i) => (
        <mesh key={i} geometry={l.g} position={[0, l.y, 0]} scale={[3.2, 1, 1]} castShadow receiveShadow>
          <M c={c} rough={0.45} metal={0.5} />
        </mesh>
      ))}
    </group>
  );
}

const SPOKES = 12;
const TYRE = '#4a4b50', RIM = '#aeb0b6', WOOD = '#d9ae6c', WOOD_D = '#c58f4e', BRASS = '#d4a843';
/** One artillery wheel. `side` is the car side it belongs to (+1 right, -1 left); the hub cap faces outward. */
function Wheel({ side }: { side: 1 | -1 }) {
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
    m.computeBoundingSphere();
  }, []);
  return (
    <group>
      <mesh castShadow receiveShadow><torusGeometry args={[13.4, 1.9, 10, 40]} /><M c={TYRE} rough={0.8} /></mesh>
      <mesh castShadow receiveShadow><torusGeometry args={[11.9, 0.7, 6, 36]} /><M c={RIM} rough={0.4} metal={0.5} /></mesh>
      <mesh scale={[1, 1, 1.5]} castShadow receiveShadow><torusGeometry args={[10.5, 1.1, 6, 32]} /><M c={WOOD_D} rough={0.8} /></mesh>
      <instancedMesh ref={spokes} args={[undefined, undefined, SPOKES]} castShadow receiveShadow>
        <boxGeometry args={[8.6, 1.5, 1.7]} />
        <M c={WOOD} rough={0.8} />
      </instancedMesh>
      <CylZ p={[0, 0, 0]} r={3.4} len={4.4} c={WOOD_D} rough={0.8} />
      <CylZ p={[0, 0, side * 2.3]} r={4.2} len={0.6} c={RIM} metal={0.5} rough={0.4} />
      <CylZ p={[0, 0, -side * 2.3]} r={4.2} len={0.6} c={RIM} metal={0.5} rough={0.4} />
      {/* brass hub cap on the outer face */}
      <CylZ p={[0, 0, side * 3.3]} r={2.7} len={1.6} c={BRASS} metal={0.6} rough={0.3} />
      <mesh position={[0, 0, side * 4.1]} scale={[1, 1, 0.55]} castShadow><sphereGeometry args={[2.7, 16, 10]} /><M c={BRASS} metal={0.6} rough={0.3} /></mesh>
    </group>
  );
}

function Fender({ x, sd }: { x: number; sd: 1 | -1 }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    const R = 17.6, r = 17.0;
    const a0 = THREE.MathUtils.degToRad(-18), a1 = THREE.MathUtils.degToRad(198);
    s.moveTo(Math.cos(a0) * R, Math.sin(a0) * R);
    s.absarc(0, 0, R, a0, a1, false);
    s.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
    s.absarc(0, 0, r, a1, a0, true);
    const g = new THREE.ExtrudeGeometry(s, { depth: 7.5, bevelEnabled: false, curveSegments: 24 });
    g.translate(0, 0, -3.75);
    return g;
  }, []);
  // each fender rides above its own wheel when exploded
  return (
    <Sp at={[x, 15, sd * 28]} spread={[x > 0 ? 40 : -40, 0, sd * 34]}>
      <mesh geometry={geo} castShadow receiveShadow><M c={FENDER} rough={0.35} metal={0.25} /></mesh>
    </Sp>
  );
}

/** Loft a surface over x (front to back) and an arch profile across the car (the top cover). */
function loftGeometry(xs: number[], profile: (x: number, u: number) => [number, number], steps: number) {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < xs.length; i++) for (let j = 0; j <= steps; j++) {
    const [y, z] = profile(xs[i], j / steps);
    pos.push(xs[i], y, z);
  }
  const row = steps + 1;
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < steps; j++) {
    const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const TOP_BASE_Y = 56, TOP_HALF_W = 22.4;
function archPoint(crest: number, u: number): [number, number] {
  const th = (u * 2 - 1) * (Math.PI / 2);
  return [TOP_BASE_Y + crest * Math.pow(Math.max(0, Math.cos(th)), 0.55), TOP_HALF_W * Math.sin(th)];
}
const TOP_BOW_X = [-4, -24, -44, -64];

// ── colours ─────────────────────────────────────────────────────────────────
// The real car was black; the model uses slightly lifted blue-greys so shapes read on screen.
const PAINT = '#454a56', FENDER = '#3c404a', FRAME = '#50535c', STEEL = '#8b8e95', IRON = '#686b73', LEATHER = '#7a563c';
const RUBBER = '#4a4b50', WOODB = '#8e6b40';

// ── the car ─────────────────────────────────────────────────────────────────
function Car({ carRef }: { carRef: React.RefObject<THREE.Group | null> }) {
  const ctx = useScene();
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
  const leverBase = useMemo(() => new THREE.Vector3(...hub).addScaledVector(new THREE.Vector3(...hub).sub(new THREE.Vector3(...colA)).normalize(), -3.2).toArray() as V3, []);

  const topBow = useMemo(() => TOP_BOW_X.map((x, k) => {
    const crest = 19 - (k === 3 ? 3 : 0);
    const pts: THREE.Vector3[] = [new THREE.Vector3(x, 47, -21.5), new THREE.Vector3(x, 52, -22)];
    for (let i = 0; i <= 14; i++) { const [y, z] = archPoint(crest, i / 14); pts.push(new THREE.Vector3(x, y, z)); }
    pts.push(new THREE.Vector3(x, 52, 22), new THREE.Vector3(x, 47, 21.5));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 64, 0.85, 6, false);
  }), []);
  const topCover = useMemo(() => {
    const xs = Array.from({ length: 16 }, (_, i) => -2 - (i / 15) * 64);
    return loftGeometry(xs, (x, u) => archPoint(19 - 3 * Math.pow(-x / 66, 3), u), 28);
  }, []);

  return (
    <group ref={carRef}>
      {/* ── chassis and running gear ── */}
      <PartGroup id="frame">
        {[-17, 17].map(z => <B key={z} p={[-2, 25, z]} s={[128, 5, 2.6]} c={FRAME} rough={0.55} metal={0.2} />)}
        {[58, 30, 2, -30, -60].map(x => <B key={x} p={[x, 25, 0]} s={[3, 3.2, 34]} c={FRAME} rough={0.55} metal={0.2} />)}
      </PartGroup>

      <PartGroup id="front-axle">
        <B p={[50, 15, 0]} s={[3.2, 3.4, 50]} c={IRON} metal={0.4} rough={0.5} />
        <Rod a={[50, 15, -27]} b={[50, 15, 27]} r={1.5} c={STEEL} metal={0.6} />
        <Rod a={[55, 13, -23]} b={[55, 13, 23]} r={0.8} c={STEEL} metal={0.6} seg={8} />
      </PartGroup>
      <PartGroup id="front-spring"><Spring p={[56, 22, 0]} /></PartGroup>
      <PartGroup id="front-radius-rod">
        {[-1, 1].map(s => <Rod key={s} a={[50, 14, s * 23]} b={[20, 24, 0]} r={1.1} c={IRON} metal={0.4} seg={8} />)}
        <mesh position={[20, 24, 0]} castShadow receiveShadow><sphereGeometry args={[2.6, 14, 10]} /><M c={STEEL} metal={0.6} rough={0.35} /></mesh>
      </PartGroup>
      <PartGroup id="wheels-front">
        {[-1, 1].map(s => (
          <Sp key={s} at={[50, 15, s * 28]} spread={[0, 0, s * 34]}><Wheel side={s as 1 | -1} /></Sp>
        ))}
      </PartGroup>

      <PartGroup id="rear-axle">
        <mesh position={[-50, 15, 0]} scale={[0.95, 1, 1]} castShadow receiveShadow><sphereGeometry args={[7.2, 20, 14]} /><M c={IRON} metal={0.4} rough={0.5} /></mesh>
        <mesh position={[-50, 15, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow><cylinderGeometry args={[2.1, 2.1, 56, 12]} /><M c={IRON} metal={0.4} rough={0.5} /></mesh>
      </PartGroup>
      <PartGroup id="rear-spring"><Spring p={[-62, 22, 0]} /></PartGroup>
      <PartGroup id="rear-radius-rods">
        {[-1, 1].map(s => (
          <React.Fragment key={s}>
            <Rod a={[-50, 15, s * 22]} b={[-14, 23, s * 9]} r={1.1} c={IRON} metal={0.4} seg={8} />
            <mesh position={[-14, 23, s * 9]} castShadow><sphereGeometry args={[1.7, 10, 8]} /><M c={STEEL} metal={0.6} /></mesh>
          </React.Fragment>
        ))}
      </PartGroup>
      <PartGroup id="brake-drums">
        {[-1, 1].map(s => (
          <Sp key={s} at={[-50, 15, s * 22.4]} spread={[0, 0, s * 12]}>
            <CylZ p={[0, 0, 0]} r={8.4} len={3.6} c="#9a9da4" metal={0.45} rough={0.45} />
            <CylZ p={[0, 0, s * 1.9]} r={9.1} len={0.8} c="#b4b6bc" metal={0.5} rough={0.4} />
            <CylZ p={[0, 0, -s * 0.2]} r={8.7} len={0.7} c="#6e7077" metal={0.4} />
          </Sp>
        ))}
      </PartGroup>
      <PartGroup id="wheels-rear">
        {[-1, 1].map(s => (
          <Sp key={s} at={[-50, 15, s * 28]} spread={[0, 0, s * 34]}><Wheel side={s as 1 | -1} /></Sp>
        ))}
      </PartGroup>

      <PartGroup id="torque-tube">
        <mesh position={TT_A} castShadow receiveShadow><sphereGeometry args={[4.6, 16, 12]} /><M c={IRON} metal={0.4} /></mesh>
        <Rod a={TT_A} b={TT_B} r={2.5} c="#5e6168" metal={0.4} />
        <Rod a={shaftA} b={shaftB} r={1.1} c="#d2d5da" metal={0.8} rough={0.3} />
      </PartGroup>

      <PartGroup id="running-boards">
        {[-1, 1].map(s => (
          <Sp key={s} at={[0, 20, s * 29]} spread={[0, 0, s * 20]}>
            <B p={[0, 0, 0]} s={[66, 1, 12]} c="#4c4e55" rough={0.8} />
            <B p={[0, 0.7, 0]} s={[66, 0.4, 10]} c="#2f3036" rough={1} />
          </Sp>
        ))}
      </PartGroup>

      <PartGroup id="fenders">
        <Fender x={50} sd={-1} /><Fender x={50} sd={1} /><Fender x={-50} sd={-1} /><Fender x={-50} sd={1} />
      </PartGroup>

      {/* ── engine, cooling and exhaust ── */}
      <PartGroup id="engine">
        <group position={[36, 40, 0]}>
          <B p={[0, 0, 0]} s={[24, 13, 13]} c={IRON} rough={0.5} metal={0.35} />
          <B p={[0, 8.6, 0]} s={[24, 4.6, 12.4]} c="#7a7d84" rough={0.5} metal={0.35} />
          <B p={[0, -9.5, 0]} s={[26, 6, 14]} c="#585b62" rough={0.55} metal={0.3} />
          <B p={[13.5, 0, 0]} s={[3, 12, 12]} c={STEEL} metal={0.35} />
          {[-9, -3, 3, 9].map(x => <Rod key={x} a={[x, 11, 0]} b={[x, 14.2, 0]} r={0.9} c="#ebe5d2" />)}
          {[0, Math.PI / 2].map(a => <B key={a} p={[17, 1, 0]} s={[0.7, 12, 2.6]} c="#3a3a3d" r={[a, 0, 0]} />)}
        </group>
      </PartGroup>

      <PartGroup id="magneto">
        <group position={[20.5, 40, 0]}>
          <CylX p={[0, 0, 0]} r={8} len={3} c="#6a6d73" metal={0.4} rough={0.45} />
          <CylX p={[0.3, 0, 0]} r={8.6} len={1.4} c="#8e9096" metal={0.5} rough={0.4} />
          <CylX p={[-2, 0, 0]} r={2.4} len={2.5} c="#b8b8b3" metal={0.7} rough={0.35} />
          {flywheelMagnets.map((q, i) => <B key={i} p={[-1.8 + q[0], q[1], q[2]]} s={[1.6, 2, 1.4]} c="#c93d3d" />)}
        </group>
      </PartGroup>

      <PartGroup id="transmission">
        <group position={[11, 40, 0]}>
          <CylX p={[0, 0, 0]} r={7} len={11} c="#686b72" metal={0.35} rough={0.5} />
          <CylX p={[-6.5, 0, 0]} r={4.2} len={3} c="#585b62" metal={0.35} />
          <B p={[0, 7.1, 0]} s={[10, 2.2, 13]} c="#8a8d93" metal={0.35} />
          <B p={[0, -6.5, 0]} s={[9, 3, 12]} c="#545760" metal={0.35} />
        </group>
      </PartGroup>

      <PartGroup id="carburetor">
        <B p={[40, 36.5, -9.6]} s={[4.6, 5, 4.4]} c="#c19a45" metal={0.55} rough={0.4} />
        <Rod a={[40, 31, -9.6]} b={[40, 34, -9.6]} r={2.4} c="#c19a45" metal={0.55} rough={0.4} />
        <Rod a={[40, 39, -9.6]} b={[40, 41, -6.6]} r={1.2} c="#9d9fa5" metal={0.5} seg={8} />
        <Rod a={[42.4, 36.5, -9.6]} b={[45.4, 36.5, -9.6]} r={0.6} c="#e8e2c8" metal={0.5} seg={8} />
      </PartGroup>

      <PartGroup id="exhaust-manifold">
        <B p={[36, 42, 8.4]} s={[22, 3.6, 3.2]} c="#6c6d72" rough={0.55} metal={0.5} />
        {[-9, -3, 3, 9].map(x => <B key={x} p={[36 + x, 42, 6.6]} s={[2.4, 2.4, 1.2]} c="#6c6d72" rough={0.55} metal={0.5} />)}
      </PartGroup>
      <PartGroup id="muffler">
        <Rod a={[24, 41, 9.2]} b={[22, 19, 12.5]} r={1.3} c="#7d7f85" metal={0.5} rough={0.5} seg={10} />
        <Rod a={[22, 19, 12.5]} b={[12, 18, 13]} r={1.3} c="#7d7f85" metal={0.5} rough={0.5} seg={10} />
        <CylX p={[-4, 18, 13]} r={3.5} len={32} c="#8e9096" metal={0.45} rough={0.5} />
        <CylX p={[12, 18, 13]} r={3.9} len={1} c="#6a6c72" metal={0.4} />
        <CylX p={[-20, 18, 13]} r={3.9} len={1} c="#6a6c72" metal={0.4} />
        <Rod a={[-20.5, 18, 13]} b={[-34, 16, 13]} r={1.2} c="#7d7f85" metal={0.5} rough={0.5} seg={10} />
      </PartGroup>

      <PartGroup id="fan">
        <group position={[52.4, 46, 0]}>
          <CylX p={[0, 0, 0]} r={1.5} len={2.4} c={STEEL} metal={0.6} rough={0.4} />
          <CylX p={[-2.2, 0, 0]} r={3} len={1.2} c="#6e7077" metal={0.5} />
          {[0, Math.PI / 2].map(a => <B key={a} p={[0.3, 0, 0]} s={[0.5, 15, 3.2]} c="#b9bbc1" metal={0.5} rough={0.4} r={[a + 0.35, 0, 0]} />)}
        </group>
      </PartGroup>

      <PartGroup id="radiator">
        <B p={[60, 47, 0]} s={[2.6, 23, 15.4]} c={BRASS} metal={0.7} rough={0.3} />
        <B p={[56.6, 47, 0]} s={[5, 20, 13]} c="#3a3b40" rough={0.9} />
        <B p={[56.6, 58.8, 0]} s={[6, 1.6, 15]} c={BRASS} metal={0.7} rough={0.3} />
        <Rod a={[61.6, 59, 0]} b={[61.6, 62, 0]} r={1.6} c={BRASS} metal={0.7} rough={0.3} />
        <Rod a={[62, 37, 0]} b={[66, 37, 0]} r={0.6} c={STEEL} metal={0.6} seg={8} />
      </PartGroup>

      <PartGroup id="radiator-hoses">
        <Rod a={[57, 54.5, 0]} b={[45, 52, 0]} r={1.5} c={RUBBER} rough={0.9} />
        <Rod a={[57, 38.5, 0]} b={[46, 34.5, 0]} r={1.5} c={RUBBER} rough={0.9} />
      </PartGroup>

      <PartGroup id="crank">
        <Rod a={[49, 31, 0]} b={[67, 31, 0]} r={1} c={STEEL} metal={0.6} rough={0.4} seg={10} />
        <Rod a={[67, 31, 0]} b={[67, 23.5, 0]} r={0.9} c={STEEL} metal={0.6} rough={0.4} seg={10} />
        <CylZ p={[67, 23.5, 0]} r={1.5} len={7} c="#6b4a2b" rough={0.6} />
        <CylX p={[49.6, 31, 0]} r={2.2} len={1.2} c="#9d9fa5" metal={0.6} />
      </PartGroup>

      <PartGroup id="coil-box">
        <B p={[1.8, 46, 0]} s={[3.6, 7, 15.5]} c={WOODB} rough={0.7} />
        {[-5.4, -1.8, 1.8, 5.4].map(z => <B key={z} p={[-0.1, 46.6, z]} s={[0.5, 4.2, 2.4]} c="#efe9d4" rough={0.5} />)}
        <CylX p={[-0.2, 43.6, 0]} r={0.9} len={0.5} c={BRASS} metal={0.6} rough={0.3} />
      </PartGroup>

      <PartGroup id="fuel-tank">
        <B p={[-14, 40, 0]} s={[22, 10, 28]} c="#6a6a60" metal={0.45} rough={0.5} />
        <Rod a={[-14, 45, 8]} b={[-14, 47.5, 8]} r={1.6} c={STEEL} metal={0.6} />
      </PartGroup>

      {/* ── controls ── */}
      <PartGroup id="steering">
        <Rod a={colA} b={hub} r={1.1} c="#4a4a50" metal={0.4} />
        <group position={hub} quaternion={colQuat}>
          <mesh castShadow><torusGeometry args={[7.6, 0.75, 8, 28]} /><M c="#6b4a2b" rough={0.5} /></mesh>
          <B p={[0, 0, 0]} s={[15, 0.8, 0.8]} c="#4a4a50" />
          <B p={[0, 0, 0]} s={[0.8, 15, 0.8]} c="#4a4a50" />
          <mesh castShadow><cylinderGeometry args={[1.4, 1.4, 1.6, 12]} /><M c={BRASS} metal={0.7} rough={0.3} /></mesh>
        </group>
      </PartGroup>
      <PartGroup id="column-levers">
        <group position={leverBase} quaternion={colQuat}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[3, 3, 0.5, 20, 1, false, Math.PI * 0.5, Math.PI]} /><M c={BRASS} metal={0.6} rough={0.35} /></mesh>
          <Rod a={[0, 0, 0]} b={[1.6, -2.8, 0.6]} r={0.35} c="#e8e2c8" metal={0.4} seg={6} />
          <Rod a={[0, 0, 0]} b={[-1.6, -2.8, 0.6]} r={0.35} c="#e8e2c8" metal={0.4} seg={6} />
          <mesh position={[1.6, -2.8, 0.6]}><sphereGeometry args={[0.55, 8, 6]} /><M c="#6b4a2b" /></mesh>
          <mesh position={[-1.6, -2.8, 0.6]}><sphereGeometry args={[0.55, 8, 6]} /><M c="#6b4a2b" /></mesh>
        </group>
      </PartGroup>

      <PartGroup id="pedals">
        {[-14, -8, -2].map(z => (
          <React.Fragment key={z}>
            <Rod a={[4, 31, z]} b={[-1, 33.5, z]} r={0.6} c="#5a5a60" seg={6} />
            <B p={[-1.5, 33.7, z]} s={[4.2, 0.8, 3.4]} c="#6a6a70" r={[0, 0, 0.3]} metal={0.5} />
          </React.Fragment>
        ))}
      </PartGroup>

      <PartGroup id="hand-lever">
        <B p={[-8, 31, -19]} s={[3.6, 0.8, 1.2]} c={STEEL} metal={0.5} />
        <Rod a={[-8, 31, -19]} b={[-12, 48, -19]} r={0.8} c="#5a5a60" metal={0.4} seg={8} />
        <mesh position={[-12, 48.6, -19]} castShadow><sphereGeometry args={[1.5, 12, 10]} /><M c="#6b4a2b" rough={0.6} /></mesh>
      </PartGroup>

      <PartGroup id="horn">
        <CylX p={[14, 54, 7]} r={2.4} len={2.6} c="#6e7077" metal={0.5} rough={0.45} />
        <CylX p={[18.4, 54, 7]} r={3.8} r2={1.0} len={6.2} c={BRASS} metal={0.65} rough={0.3} />
      </PartGroup>

      {/* ── body ── */}
      <PartGroup id="body">
        <B p={[-27, 30, 0]} s={[78, 2, 44]} c={PAINT} rough={0.5} metal={0.15} />
        {[-1, 1].map(s => <B key={s} p={[-33, 38, s * 21]} s={[66, 16, 1.5]} c={PAINT} rough={0.35} metal={0.2} />)}
        <B p={[8, 42, 0]} s={[8, 24, 42]} c={PAINT} rough={0.35} metal={0.2} />
        <B p={[6, 55, 0]} s={[10, 1.6, 43]} c={PAINT} rough={0.35} metal={0.2} />
        <B p={[-66, 38, 0]} s={[1.5, 16, 42]} c={PAINT} rough={0.35} metal={0.2} />
      </PartGroup>

      <PartGroup id="doors">
        {[-1, 1].map(s => (
          <React.Fragment key={s}>
            <Sp at={[-21, 38.5, s * 22.4]} spread={[10, 0, s * 34]}>
              <B p={[0, 0, 0]} s={[22, 14, 1.2]} c="#505665" rough={0.35} metal={0.2} />
              <B p={[0, 6.6, s * 0.4]} s={[22, 0.8, 0.5]} c="#2b2e36" />
              <B p={[8, 3, s * 1]} s={[3.4, 0.9, 0.7]} c={BRASS} metal={0.6} rough={0.35} />
            </Sp>
            <Sp at={[-49, 38.5, s * 22.4]} spread={[-10, 0, s * 34]}>
              <B p={[0, 0, 0]} s={[26, 14, 1.2]} c="#505665" rough={0.35} metal={0.2} />
              <B p={[0, 6.6, s * 0.4]} s={[26, 0.8, 0.5]} c="#2b2e36" />
              <B p={[10, 3, s * 1]} s={[3.4, 0.9, 0.7]} c={BRASS} metal={0.6} rough={0.35} />
            </Sp>
          </React.Fragment>
        ))}
      </PartGroup>

      <PartGroup id="seats">
        <B p={[-16, 47, 0]} s={[12, 4, 38]} c={LEATHER} rough={0.85} />
        <B p={[-23, 56, 0]} s={[3, 14, 38]} c={LEATHER} rough={0.85} />
        <B p={[-50, 47, 0]} s={[12, 4, 38]} c={LEATHER} rough={0.85} />
        <B p={[-58, 56, 0]} s={[3, 14, 38]} c={LEATHER} rough={0.85} />
      </PartGroup>

      <PartGroup id="windshield">
        {[-1, 1].map(s => <B key={s} p={[3, 63, s * 19.5]} s={[1, 18, 1]} c={BRASS} metal={0.6} rough={0.35} />)}
        <B p={[3, 72, 0]} s={[1, 1, 40]} c={BRASS} metal={0.6} rough={0.35} />
        <B p={[3, 55, 0]} s={[1, 1, 40]} c={BRASS} metal={0.6} rough={0.35} />
        <B p={[3, 63.5, 0]} s={[0.3, 16, 37]} c="#a9d0e4" opacity={0.32} rough={0.1} />
      </PartGroup>

      <PartGroup id="hood">
        <B p={[33, 59, 0]} s={[42, 1.4, 11.5]} c={PAINT} rough={0.3} metal={0.2} />
        {[-1, 1].map(s => <B key={s} p={[33, 51, s * 9.6]} s={[42, 17, 1.2]} c={PAINT} rough={0.3} metal={0.2} r={[s * 0.1, 0, 0]} />)}
        <B p={[33, 59.9, 0]} s={[41, 0.5, 1.2]} c={STEEL} metal={0.6} rough={0.3} />
      </PartGroup>

      {/* ── lamps ── */}
      <PartGroup id="headlamps">
        {[-1, 1].map(s => (
          <Sp key={s} at={[52, 47, s * 22]} spread={[0, 0, s * 24]}>
            <CylX p={[0, 0, 0]} r={4.3} len={5.5} c={BRASS} metal={0.6} rough={0.3} />
            <CylX p={[2.9, 0, 0]} r={3.6} len={0.6} c="#f4f0dc" rough={0.15} />
            <Rod a={[0, -3, 0]} b={[0, -14, 0]} r={0.7} c={BRASS} metal={0.6} seg={6} />
          </Sp>
        ))}
      </PartGroup>
      <PartGroup id="side-lamps">
        {[-1, 1].map(s => (
          <Sp key={s} at={[8, 53, s * 23]} spread={[0, 0, s * 18]}>
            <B p={[0, 0, 0]} s={[3.5, 5, 3]} c={BRASS} metal={0.6} rough={0.3} />
            <B p={[1.8, 0, 0]} s={[0.3, 3.4, 2.2]} c="#f4f0dc" rough={0.2} />
          </Sp>
        ))}
      </PartGroup>
      <PartGroup id="tail-lamp">
        <B p={[-68, 40, -17]} s={[3, 4, 4]} c={BRASS} metal={0.6} rough={0.3} />
        <B p={[-69.7, 40, -17]} s={[0.4, 2.6, 2.8]} c="#e0584a" rough={0.3} />
        <B p={[-67, 37, -17]} s={[1, 3, 1]} c={FRAME} />
      </PartGroup>

      {/* ── folding top (optional) ── */}
      {ctx.showTop && (
        <>
          <PartGroup id="top-bows">
            {topBow.map((g, i) => <mesh key={i} geometry={g} castShadow><M c="#8a6840" rough={0.7} /></mesh>)}
          </PartGroup>
          <PartGroup id="top-cover">
            <mesh geometry={topCover} castShadow receiveShadow><M c="#6a665e" rough={1} side={THREE.DoubleSide} /></mesh>
          </PartGroup>
        </>
      )}
    </group>
  );
}

// ── stage: lights, ground, camera ───────────────────────────────────────────
function Ground() {
  const ctx = useScene();
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const b = ctx.bounds.current;
    if (ref.current) ref.current.position.y = b.isEmpty() ? 0 : Math.min(0, b.min.y) - 0.4;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[1800, 48]} />
      <meshStandardMaterial color="#7f7b71" roughness={1} envMapIntensity={0.35} />
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

const REF_DIR = new THREE.Vector3(...MODEL_T_VIEWS[0].dir).normalize();
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _d = new THREE.Vector3();
/**
 * Distance from `center` at which every point fits the camera for a given view direction (dir points from
 * the centre toward the camera). `pts` is a flat xyz array (the corners of every mesh's bounding box).
 */
export function fitDistance(pts: Float32Array, center: THREE.Vector3, dir: THREE.Vector3, fovDeg: number, aspect: number, pad = 1.09): number {
  _d.copy(dir).normalize();
  _f.copy(_d).negate();
  _r.crossVectors(_f, Y);
  if (_r.lengthSq() < 1e-8) _r.set(1, 0, 0);
  _r.normalize();
  _u.crossVectors(_r, _f).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2), tanH = tanV * aspect;
  let D = 0;
  for (let i = 0; i < pts.length; i += 3) {
    _v.set(pts[i] - center.x, pts[i + 1] - center.y, pts[i + 2] - center.z);
    D = Math.max(D, _v.dot(_d) + Math.max(Math.abs(_v.dot(_r)) / tanH, Math.abs(_v.dot(_u)) / tanV));
  }
  return D * pad;
}

/** Corners of every mesh's local bounding box in world space (a tighter fit target than one big box). */
function collectPoints(root: THREE.Object3D, out: number[]): void {
  out.length = 0;
  const v = new THREE.Vector3();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const { min, max } = m.geometry.boundingBox!;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).applyMatrix4(m.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
}

/**
 * Keeps the whole car framed: measures the car's bounds, snaps to the 3/4 view on first frame, scales the
 * camera distance as the car explodes (so the exploded car still fits), and animates camera presets.
 */
function CameraRig({ ctx, carRef }: { ctx: SceneCtx; carRef: React.RefObject<THREE.Group | null> }) {
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera;
  const size = useThree(s => s.size);
  const controls = useThree(s => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const st = useRef({ lastE: -1, lastTop: false, dirty: 3, init: false, lastFit: 1, lastCenter: new THREE.Vector3(), seenView: 0, tween: null as null | { t: number; dir0: THREE.Vector3; dist0: number; dir1: THREE.Vector3 } });
  const tmp = useMemo(() => ({ box: new THREE.Box3(), c: new THREE.Vector3(), off: new THREE.Vector3(), d: new THREE.Vector3(), list: [] as number[], pts: new Float32Array(0) }), []);

  useFrame((_, dt) => {
    const car = carRef.current;
    if (!car || !controls) return;
    const s = st.current;
    const e = ctx.smooth.current;
    if (Math.abs(e - s.lastE) > 1e-4 || ctx.showTop !== s.lastTop) { s.dirty = 3; s.lastE = e; s.lastTop = ctx.showTop; }
    if (s.dirty > 0) {
      s.dirty--;
      car.updateWorldMatrix(true, true);
      collectPoints(car, tmp.list);
      tmp.pts = Float32Array.from(tmp.list);
      tmp.box.setFromObject(car);
      if (!tmp.box.isEmpty()) ctx.bounds.current.copy(tmp.box);
    }
    const box = ctx.bounds.current;
    if (box.isEmpty()) return;
    const aspect = size.width / Math.max(1, size.height);
    const center = box.getCenter(tmp.c);
    const fitRef = fitDistance(tmp.pts, center, REF_DIR, camera.fov, aspect);

    if (!s.init) {
      camera.position.copy(center).addScaledVector(REF_DIR, fitRef);
      controls.target.copy(center);
      camera.lookAt(center);
      s.init = true; s.lastFit = fitRef; s.lastCenter.copy(center);
      s.seenView = ctx.view.current.n;
      return;
    }

    if (ctx.view.current.n !== s.seenView) {
      s.seenView = ctx.view.current.n;
      const v = MODEL_T_VIEWS.find(x => x.id === ctx.view.current.id)!;
      tmp.off.copy(camera.position).sub(controls.target);
      s.tween = { t: 0, dir0: tmp.off.clone().normalize(), dist0: tmp.off.length(), dir1: new THREE.Vector3(...v.dir).normalize() };
    }

    if (s.tween) {
      const tw = s.tween;
      tw.t = Math.min(1, tw.t + Math.min(dt, 0.05) / 0.7);
      const p = ease(tw.t);
      tmp.d.copy(tw.dir0).lerp(tw.dir1, p).normalize();
      const dist = THREE.MathUtils.lerp(tw.dist0, fitDistance(tmp.pts, center, tw.dir1, camera.fov, aspect), p);
      controls.target.copy(center);
      camera.position.copy(center).addScaledVector(tmp.d, dist);
      camera.lookAt(center);
      if (tw.t >= 1) s.tween = null;
    } else {
      // keep the car framed as it explodes or the canvas is resized, preserving the viewer's own zoom
      const k = fitRef / s.lastFit;
      tmp.d.copy(center).sub(s.lastCenter);
      if (Math.abs(k - 1) > 1e-5 || tmp.d.lengthSq() > 1e-8) {
        tmp.off.copy(camera.position).sub(controls.target).multiplyScalar(k);
        controls.target.add(tmp.d);
        camera.position.copy(controls.target).add(tmp.off);
        camera.lookAt(controls.target);
      }
    }
    s.lastFit = fitRef; s.lastCenter.copy(center);
  });
  return null;
}

/** Procedural studio reflections (three's RoomEnvironment through PMREM): no network, no suspense. */
function StudioEnvironment({ intensity }: { intensity: number }) {
  const gl = useThree(s => s.gl);
  const scene = useThree(s => s.scene);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const rt = pm.fromScene(room, 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = intensity;
    invalidate();
    return () => { scene.environment = null; rt.dispose(); pm.dispose(); room.dispose(); };
  }, [gl, scene, intensity, invalidate]);
  return null;
}

export function ModelTScene({ ctx, autoRotate, shadowSize, onInteract }: { ctx: SceneCtx; autoRotate: boolean; shadowSize: number; onInteract: () => void }) {
  const carRef = useRef<THREE.Group>(null);
  return (
    <Ctx.Provider value={ctx}>
      <color attach="background" args={['#bdb9ae']} />
      <fog attach="fog" args={['#bdb9ae', 1100, 2600]} />
      <hemisphereLight args={['#e6ecf5', '#6a6258', 0.7]} />
      {/* key light, a cool fill and a rim light from behind so dark parts keep an edge */}
      <directionalLight
        position={[170, 260, 120]} intensity={2.6} castShadow
        shadow-mapSize={[shadowSize, shadowSize]} shadow-camera-left={-300} shadow-camera-right={300}
        shadow-camera-top={300} shadow-camera-bottom={-300} shadow-camera-near={50} shadow-camera-far={1000} shadow-bias={-0.0006}
      />
      <directionalLight position={[-220, 120, -140]} intensity={1.0} color="#cfe0ff" />
      <directionalLight position={[-120, 160, 260]} intensity={1.5} color="#fff1dc" />
      <directionalLight position={[160, 90, -260]} intensity={1.6} color="#d6e4ff" />
      <StudioEnvironment intensity={0.85} />
      <Smoother ctx={ctx} />
      <Ground />
      <Car carRef={carRef} />
      <OrbitControls
        makeDefault enableDamping dampingFactor={0.08} enablePan={false}
        minDistance={60} maxDistance={2400} maxPolarAngle={Math.PI * 0.52}
        autoRotate={autoRotate} autoRotateSpeed={0.9}
        onStart={onInteract} onEnd={onInteract}
      />
      <CameraRig ctx={ctx} carRef={carRef} />
    </Ctx.Provider>
  );
}
