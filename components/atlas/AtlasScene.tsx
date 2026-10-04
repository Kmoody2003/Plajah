// Machine Atlas 3D scene (react-three-fiber). Frame loop is rAF only: 'demand' while static, 'always' while a scenario plays.
// No per-frame allocation: scratch colours/vectors are module-level, materials are pooled per part.
// R3F traps honoured: geometry we create is disposed, nothing shared/cached is disposed, no shader injection (plain standard materials).
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { Box3, BufferGeometry, Color, DoubleSide, Mesh, MeshStandardMaterial, Plane, Vector3, type WebGLRenderer } from 'three';
import type { LoadedSystem } from '../../services/machineAtlas/registry';
import type { Placement, VisualBinding } from '../../services/machineAtlas/types';
import { buildGeometry, triCount } from '../../services/machineAtlas/geometry';
import { sample, traceDuration, type RunResult } from '../../services/machineAtlas/sim/runner';

export interface SectionState { on: boolean; axis: 'x' | 'y' | 'z'; offset: number }
export interface SceneStats { triangles: number; meshes: number; geometries: number }

export interface AtlasSceneProps {
  loaded: LoadedSystem; viewId: string; explode: number; selectedId: string | null; hoverId: string | null;
  onSelect: (id: string | null) => void; onHover: (id: string | null) => void;
  xray: boolean; isolate: boolean; hidden: Set<string>; section: SectionState; labels: boolean;
  run: RunResult | null; playing: boolean; speed: number; playheadRef: React.MutableRefObject<number>;
  onTick: (t: number) => void; onEnd: () => void; faults: string[]; faultTint: boolean;
  focus: { id: string; n: number } | null; resetNonce: number; reducedMotion: boolean; onStats?: (s: SceneStats) => void;
}

// scratch objects (module-level so useFrame never allocates)
const cA = new Color(), cB = new Color(), cEm = new Color();
const BASE_PARAMS: Record<string, number> = {};

function heatEmissive(x: number, out: Color): number {
  // returns emissive intensity; out is the hue. 0 cold -> none, 1 white-hot
  const v = x < 0 ? 0 : x > 1 ? 1 : x;
  if (v < 0.5) out.setRGB(0.9, 0.12 + v * 0.5, 0.02); else out.setRGB(1, 0.35 + (v - 0.5) * 1.2, 0.05 + (v - 0.5) * 0.9);
  return v < 0.18 ? v * 0.5 : 0.09 + (v - 0.18) * 1.3;
}

interface PartRT { id: string; meshes: Mesh[]; mat: MeshStandardMaterial; baseOpacity: number; spin: number; bindings: VisualBinding[] }

function makeMaterial(color: string | undefined, metal: number, rough: number, opacity: number, planes: Plane[]): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, metalness: metal, roughness: rough, side: DoubleSide, clippingPlanes: planes });
  if (color) m.color.set(color).lerp(cA.set('#ffffff'), 0.6);
  m.userData.baseOpacity = opacity;
  if (opacity < 1) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; }
  m.emissive.set('#000000'); return m;
}

function Controls({ loaded, viewId, resetNonce, reducedMotion, focus }: { loaded: LoadedSystem; viewId: string; resetNonce: number; reducedMotion: boolean; focus: AtlasSceneProps['focus'] }) {
  const controls = useRef<any>(null);
  const { camera, invalidate, scene } = useThree();
  const anim = useRef<{ t0: number; dur: number; fromP: Vector3; toP: Vector3; fromT: Vector3; toT: Vector3 } | null>(null);
  const clock = useRef(0);
  useLayoutEffect(() => {
    const v = loaded.layout.views.find(x => x.id === viewId) || loaded.layout.views[0];
    camera.position.set(...v.camera.pos); controls.current?.target.set(...v.camera.target); controls.current?.update(); invalidate();
    anim.current = null;
  }, [loaded, viewId, resetNonce, camera, invalidate]);
  useEffect(() => {
    if (!focus) return;
    const box = new Box3(); let any = false;
    scene.traverse(o => { if (o.userData.partId === focus.id && o.visible && (o as Mesh).isMesh) { box.expandByObject(o); any = true; } });
    if (!any || !controls.current) return;
    const c = box.getCenter(new Vector3()), size = box.getSize(new Vector3()).length();
    const dir = camera.position.clone().sub(controls.current.target).normalize();
    const toP = c.clone().add(dir.multiplyScalar(Math.max(2.2, size * 1.8)));
    if (reducedMotion) { camera.position.copy(toP); controls.current.target.copy(c); controls.current.update(); invalidate(); return; }
    anim.current = { t0: clock.current, dur: 0.7, fromP: camera.position.clone(), toP, fromT: controls.current.target.clone(), toT: c };
    invalidate();
  }, [focus, scene, camera, invalidate, reducedMotion]);
  useFrame((_, delta) => {
    clock.current += delta;
    const a = anim.current; if (!a || !controls.current) return;
    const k = Math.min(1, (clock.current - a.t0) / a.dur), e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(a.fromP, a.toP, e); controls.current.target.lerpVectors(a.fromT, a.toT, e); controls.current.update();
    if (k >= 1) anim.current = null; else invalidate();
  });
  return <OrbitControls ref={controls} makeDefault enableDamping={!reducedMotion} dampingFactor={0.09} minDistance={1.5} maxDistance={45} rotateSpeed={0.8} zoomSpeed={0.9} />;
}

function World(props: AtlasSceneProps) {
  const { loaded, viewId, explode, selectedId, hoverId, xray, isolate, hidden, section, labels, run, playing, speed, playheadRef, faults, faultTint, reducedMotion } = props;
  const { invalidate, gl } = useThree();
  const plane = useMemo(() => new Plane(new Vector3(-1, 0, 0), 0), []);
  const planes = useMemo(() => [plane], [plane]);
  const faultKey = faults.join(',');

  // ---- geometry: ours to dispose (procedural), never shared ----
  const built = useMemo(() => {
    const geoms = new Map<string, BufferGeometry>();
    const items: { key: string; placement: Placement; geomKey: string }[] = [];
    const overrideFor = (partId: string) => {
      const o: Record<string, number> = {};
      for (const f of faults) Object.assign(o, loaded.faultGeometry[f]?.[partId] || {});
      return o;
    };
    loaded.layout.placements.forEach((pl, i) => {
      if (!pl.views.includes(viewId) || pl.decor) return;
      const part = loaded.parts.get(pl.part); if (!part) return;
      const ov = { ...BASE_PARAMS, ...(pl.params || {}), ...overrideFor(pl.part) };
      const gk = `${pl.part}|${JSON.stringify(ov)}`;
      if (!geoms.has(gk)) geoms.set(gk, buildGeometry(part.geometry, ov));
      items.push({ key: `${viewId}-${i}-${pl.part}`, placement: pl, geomKey: gk });
    });
    let tris = 0; geoms.forEach(g => { tris += triCount(g); });
    let drawn = 0; for (const it of items) drawn += triCount(geoms.get(it.geomKey)!);
    return { geoms, items, tris: drawn, unique: tris };
  }, [loaded, viewId, faultKey]);
  useEffect(() => () => { built.geoms.forEach(g => g.dispose()); }, [built]);
  useEffect(() => { props.onStats?.({ triangles: built.tris, meshes: built.items.length, geometries: built.geoms.size }); }, [built]);

  // ---- materials pooled per part ----
  const rtMap = useMemo(() => new Map<string, PartRT>(), [built]);
  const rt = useRef(rtMap); rt.current = rtMap;
  const pool = useMemo(() => {
    const m = new Map<string, MeshStandardMaterial>();
    for (const [id, part] of loaded.parts) {
      const mat0 = part.materials[0];
      const pl = loaded.layout.placements.find(p => p.part === id && p.opacity !== undefined);
      m.set(id, makeMaterial(undefined, mat0 ? mat0.metalness * 0.6 : 0.3, mat0 ? mat0.roughness : 0.6, pl?.opacity ?? 1, planes));
    }
    return m;
  }, [loaded, planes]);
  useEffect(() => () => { pool.forEach(m => m.dispose()); }, [pool]);

  const stateRef = useRef({ selectedId, hoverId, xray, isolate, hidden, run, faults, faultTint, speed, playing, labels });
  stateRef.current = { selectedId, hoverId, xray, isolate, hidden, run, faults, faultTint, speed, playing, labels };
  const faultParts = useMemo(() => {
    const s = new Set<string>(); for (const f of loaded.faults) if (faults.includes(f.id)) for (const p of f.partIds) s.add(p); return s;
  }, [loaded, faults]);

  const visuals = useMemo(() => {
    const kind = run?.kind;
    const arr = kind && loaded.layout.visuals[kind] ? loaded.layout.visuals[kind] : [];
    const by = new Map<string, VisualBinding[]>(); for (const b of arr) { const l = by.get(b.part) || []; l.push(b); by.set(b.part, l); }
    return by;
  }, [loaded, run]);

  // appearance pass: called after any state change and per frame while playing
  const paint = useRef<(t: number, dt: number) => void>(() => {});
  paint.current = (t: number, dt: number) => {
    const s = stateRef.current, tr = s.run?.trace || null;
    rt.current.forEach(p => {
      const sel = s.selectedId === p.id, hov = s.hoverId === p.id;
      const hide = s.hidden.has(p.id) || (s.isolate && s.selectedId !== null && !sel);
      const dim = s.xray && !sel;
      for (const m of p.meshes) m.visible = !hide;
      p.mat.transparent = dim || p.baseOpacity < 1; p.mat.opacity = dim ? (s.selectedId ? 0.14 : 0.4) : p.baseOpacity; p.mat.depthWrite = !(dim || p.baseOpacity < 1);
      let ei = 0; cEm.setRGB(0, 0, 0);
      const bs = visuals.get(p.id);
      if (bs && tr) for (const b of bs) {
        const v = sample(tr, b.channel, t), x = (v - b.lo) / (b.hi - b.lo);
        if (b.kind === 'heat') { ei = Math.max(ei, heatEmissive(x, cB)); cEm.copy(cB); }
        else if (b.kind === 'pressure') { const k = Math.max(0, Math.min(1, x)); cB.setRGB(0.0, 0.55, 0.95); if (k * 0.7 > ei) { ei = k * 0.7; cEm.copy(cB); } }
        else if (b.kind === 'glow') { const k = Math.max(0, Math.min(1, x)); cB.setRGB(1, 0.45, 0.05); if (k * 0.8 > ei) { ei = k * 0.8; cEm.copy(cB); } }
        else if (b.kind === 'state') {
          if (b.channel === 'abs_state') { const st = Math.round(v); if (st >= 0) { ei = 0.8; if (st === 0) cEm.setRGB(1, 0.5, 0.05); else if (st === 1) cEm.setRGB(0.8, 0.7, 1); else cEm.setRGB(0, 0.85, 0.95); } }
          else { const k = Math.max(0, Math.min(1, x)); for (const mm of p.meshes) mm.rotation.z = -k * 0.22; }
        } else if (b.kind === 'spin' && s.playing && !reducedMotion) {
          p.spin += (Math.max(0, v) / b.hi) * 7 * dt; for (const mm of p.meshes) mm.rotation.z = p.spin;
        }
      }
      if (s.faultTint && faultParts.has(p.id)) { cB.setRGB(0.85, 0.08, 0.1); if (0.38 > ei) { ei = 0.38; cEm.copy(cB); } }
      if (sel) { cB.setRGB(1, 0.55, 0.0); ei = Math.max(ei, 0.5); cEm.lerp(cB, ei > 0.5 ? 0.35 : 0.8); }
      else if (hov) { cB.setRGB(1, 0.6, 0.15); ei = Math.max(ei, 0.22); cEm.lerp(cB, 0.6); }
      p.mat.emissive.copy(cEm); p.mat.emissiveIntensity = ei;
    });
  };
  useEffect(() => { paint.current(playheadRef.current, 0); invalidate(); });

  // clipping plane + renderer flag
  useEffect(() => { (gl as WebGLRenderer).localClippingEnabled = true; }, [gl]);
  useEffect(() => {
    const n = section.axis === 'x' ? [-1, 0, 0] : section.axis === 'y' ? [0, -1, 0] : [0, 0, -1];
    plane.normal.set(n[0], n[1], n[2]); plane.constant = section.offset; pool.forEach(m => { m.clippingPlanes = section.on ? planes : []; m.needsUpdate = true; }); invalidate();
  }, [section, plane, planes, pool, invalidate]);

  // explode
  const applyExplode = () => {
    rt.current.forEach(p => {
      for (const m of p.meshes) {
        const b = m.userData.base as number[], v = m.userData.vec as number[], sc = m.userData.sc as number;
        m.position.set(b[0] + v[0] * explode * sc, b[1] + v[1] * explode * sc, b[2] + v[2] * explode * sc);
      }
    });
  };
  useEffect(() => { applyExplode(); invalidate(); }, [explode, built]);

  // sim clock: the only per-frame work, and only while playing
  const tickAcc = useRef(0);
  useFrame((_, delta) => {
    const tr = run?.trace;
    if (!stateRef.current.playing || !tr) return;
    const dur = traceDuration(tr), dt = Math.min(delta, 0.05);
    let t = playheadRef.current + dt * stateRef.current.speed;
    if (t >= dur) { t = dur; playheadRef.current = t; paint.current(t, dt); props.onTick(t); props.onEnd(); return; }
    playheadRef.current = t; paint.current(t, dt);
    tickAcc.current += dt; if (tickAcc.current > 0.08) { tickAcc.current = 0; props.onTick(t); }
  });

  const register = (partId: string, mesh: Mesh | null) => {
    if (!mesh) return;
    let p = rt.current.get(partId);
    const mat = pool.get(partId)!;
    if (!p || p.mat !== mat) { p = { id: partId, meshes: [], mat, baseOpacity: mat.userData.baseOpacity ?? 1, spin: 0, bindings: [] }; rt.current.set(partId, p); }
    if (!p.meshes.includes(mesh)) p.meshes.push(mesh);
  };

  const labelFor = (partId: string) => loaded.parts.get(partId)?.name || partId;
  const seenLabel = new Set<string>();

  return (
    <>
      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#dfe6ff', '#3a2a50', 0.8]} />
      <directionalLight position={[6, 9, 8]} intensity={1.6} />
      <directionalLight position={[-7, 3, -6]} intensity={0.7} color="#bfa8ff" />
      <group>
        {built.items.map(it => {
          const pl = it.placement; const g = built.geoms.get(it.geomKey)!; const mat = pool.get(pl.part)!;
          const sc = pl.scale ?? 1; const base: [number, number, number] = pl.pos || [0, 0, 0];
          const vec = pl.explode || loaded.layout.explode[pl.part] || [0, 0, 0];
          const showLabel = labels && !seenLabel.has(pl.part) && (seenLabel.add(pl.part), true);
          if (!g.boundingBox) g.computeBoundingBox();
          const c = g.boundingBox!.getCenter(new Vector3());
          return (
            <mesh key={it.key} geometry={g} material={mat} position={base} rotation={pl.rot || [0, 0, 0]} scale={sc}
              ref={(m: Mesh | null) => { if (m) { m.userData = { partId: pl.part, base, vec, sc }; register(pl.part, m); } }}
              onClick={(e) => { e.stopPropagation(); props.onSelect(pl.part); }}
              onPointerOver={(e) => { e.stopPropagation(); props.onHover(pl.part); document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { props.onHover(null); document.body.style.cursor = ''; }}>
              {showLabel && !hidden.has(pl.part) && (
                <Html position={c} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
                  <div className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: 'rgba(10,8,18,0.78)', border: '1px solid rgba(255,255,255,0.18)' }}>{labelFor(pl.part)}</div>
                </Html>
              )}
            </mesh>
          );
        })}
      </group>
    </>
  );
}

export default function AtlasScene(props: AtlasSceneProps) {
  return (
    <Canvas
      frameloop={props.playing ? 'always' : 'demand'}
      dpr={[1, 1.75]}
      camera={{ fov: 42, near: 0.1, far: 200, position: [3.6, 3.2, 5.4] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => props.onSelect(null)}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={['#0b0814']} />
      <fog attach="fog" args={['#0b0814', 40, 90]} />
      <World {...props} />
      <Controls loaded={props.loaded} viewId={props.viewId} resetNonce={props.resetNonce} reducedMotion={props.reducedMotion} focus={props.focus} />
    </Canvas>
  );
}
