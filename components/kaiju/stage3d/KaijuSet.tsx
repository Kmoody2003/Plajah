// KaijuSet — everything that is NOT a dancer in the 3D Kaiju disco: the light-up tile floor, the LED
// equaliser wall, the disco ball (with real mirror-ball light dots), the truss + moving heads, lasers,
// confetti cannons, speaker stacks, the quiet-time follow-spot, dust, and the lighting rig.
//
// All of it reads one mutable runtime object (`StageRuntime`, filled each frame by KaijuStage3D) so React
// never re-renders per frame. Props glide in/out on the values the StageDirector produces.

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import type { KaijuFeatures, KaijuStyle } from '../kaijuAudio';
import type { StageState } from './kaijuStageDirector';

export interface StageRuntime {
  f: KaijuFeatures | null;
  /** 32 log-spaced band levels 0..1 (smoothed, AGC'd). */
  bands: Float32Array;
  st: StageState;
  style: KaijuStyle;
  /** current palette (hex) */
  palette: THREE.Color[];
  /** world-space feet / hips positions of the two dancers (x,z used for floor glow) */
  foot: [THREE.Vector3, THREE.Vector3];
  /** which dancer is featured by the follow-spot (0/1) and its smoothed target */
  featured: number;
  spotAt: THREE.Vector3;
  beats: number; clock: number; dt: number;
  quality: 'high' | 'medium' | 'low';
}

export const PALETTES: Record<KaijuStyle, string[]> = {
  edm: ['#FF2E9A', '#00C2FF', '#FFD400', '#8A2BFF'],
  rock: ['#FF6A2A', '#D40055', '#FFB000', '#7A00FF'],
  ballet: ['#FF9EC7', '#E7B04B', '#C99BFF', '#FFE9F3'],
  zen: ['#7FE0C4', '#9C88E8', '#9CD6FF', '#FFC4DD'],
};
export const BRAND = ['#6B0099', '#D40055', '#FF8C00'];

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const tmpC = new THREE.Color();
const mkO = () => new THREE.Object3D();   // one scratch object PER component — sharing one leaks scale/rotation between them
const oFloor = mkO(), oWall = mkO(), oBall = mkO(), oConf = mkO();

/** soft round sprite texture (white core → transparent) */
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ====================================================================== floor
const COLS = 18, ROWS = 10, TILE = 0.5;
type PatternFn = (c: number, r: number, x: number, z: number, rt: StageRuntime, S: FloorState) => number;
interface FloorState { rings: { age: number }[]; sparkle: Float32Array; flip: number; lastBeatCount: number; chase: number }

const PATTERNS: Record<string, PatternFn> = {
  spectrum: (c, r, _x, _z, rt) => {
    const band = rt.bands[Math.min(31, Math.floor((c / COLS) * 32))];
    const rise = band * ROWS * 1.15; const fromFront = ROWS - 1 - r;
    return clamp(rise - fromFront + 0.15, 0, 1);
  },
  checker: (c, r, _x, _z, rt, S) => (((c + r + S.flip) & 1) ? 1 : 0.14) * (0.65 + 0.35 * (rt.f?.kick ?? 0)),
  ripple: (_c, _r, x, z, _rt, S) => {
    const d = Math.hypot(x, z * 1.15); let v = 0.06;
    for (const g of S.rings) { const R = g.age * 4.2; v += Math.exp(-((d - R) ** 2) / 0.16) * Math.max(0, 1 - g.age / 1.9); }
    return clamp(v, 0, 1);
  },
  chase: (c, r, _x, _z, _rt, S) => {
    const head = S.chase; let v = 0.08;
    const dc = ((head - c) % COLS + COLS) % COLS; if (dc < 4) v = Math.max(v, 1 - dc / 4);
    const dr = (((COLS - head) * (ROWS / COLS) - r) % ROWS + ROWS) % ROWS; if (dr < 2.5) v = Math.max(v, 0.85 - dr / 3.2);
    return v;
  },
  sparkle: (c, r, _x, _z, _rt, S) => S.sparkle[r * COLS + c],
  rainbow: (c, r, _x, _z, rt) => 0.35 + 0.45 * Math.sin((c + r) * 0.55 - rt.clock * 2.2) ** 2,
};
const PATTERN_ORDER: Record<string, string[]> = {
  silent: ['ripple', 'rainbow'], quiet: ['ripple', 'rainbow', 'spectrum'],
  groove: ['spectrum', 'ripple', 'chase', 'rainbow', 'checker', 'sparkle'],
  peak: ['checker', 'chase', 'sparkle', 'spectrum', 'ripple', 'checker'],
};

export function DiscoFloor({ rt }: { rt: StageRuntime }) {
  const tiles = useRef<THREE.InstancedMesh>(null);
  const S = useMemo<FloorState>(() => ({ rings: [], sparkle: new Float32Array(COLS * ROWS), flip: 0, lastBeatCount: -1, chase: 0 }), []);
  const cur = useRef({ a: 'spectrum', b: 'ripple', mix: 1, since: -99, lastKick: 0, n: 0 });
  const pos = useMemo(() => Array.from({ length: COLS * ROWS }, (_, i) => { const c = i % COLS, r = Math.floor(i / COLS); return [(c - (COLS - 1) / 2) * TILE, (r - (ROWS - 1) / 2) * TILE] as const; }), []);
  const geo = useMemo(() => new THREE.BoxGeometry(TILE - 0.05, 0.05, TILE - 0.05), []);
  useFrame(() => {
    const m = tiles.current; if (!m) return;
    const { st, f, dt } = rt, k = cur.current;
    const beatCount = f?.beatCount ?? 0;
    // ---- state updates
    if (f?.beat && beatCount !== S.lastBeatCount) { S.lastBeatCount = beatCount; S.flip ^= (beatCount % 2); S.chase = (S.chase + 1.0) % COLS; }
    S.chase = (S.chase + dt * (st.tier === 'peak' ? 9 : 4)) % COLS;
    if (f && f.kick > 0.9 && rt.clock - k.lastKick > 0.28) { k.lastKick = rt.clock; S.rings.push({ age: 0 }); if (S.rings.length > 4) S.rings.shift(); }
    for (const g of S.rings) g.age += dt;
    S.rings = S.rings.filter(g => g.age < 2);
    if (f && f.onset > 0.5) for (let i = 0; i < 3 + (st.tier === 'peak' ? 4 : 0); i++) S.sparkle[Math.floor(Math.random() * S.sparkle.length)] = 1;
    for (let i = 0; i < S.sparkle.length; i++) S.sparkle[i] *= Math.exp(-dt * 5);
    // ---- pattern schedule: a new pattern every 8 beats (16 in quiet)
    const every = st.tier === 'quiet' || st.tier === 'silent' ? 16 : 8;
    const blk = Math.floor(rt.beats / every);
    if (blk !== k.n) {
      k.n = blk; const order = PATTERN_ORDER[st.tier] ?? PATTERN_ORDER.groove;
      k.a = k.b; k.b = order[Math.floor(Math.random() * order.length)]; k.mix = 0;
    }
    k.mix = Math.min(1, k.mix + dt / 0.6);
    const pa = PATTERNS[k.a] ?? PATTERNS.ripple, pb = PATTERNS[k.b] ?? PATTERNS.ripple;
    const pal = rt.palette, bright = st.floor * (1 - 0.55 * st.dim);
    for (let i = 0; i < pos.length; i++) {
      const c = i % COLS, r = Math.floor(i / COLS), [x, z] = pos[i];
      let v = pa(c, r, x, z, rt, S) * (1 - k.mix) + pb(c, r, x, z, rt, S) * k.mix;
      // colour: gradient across the floor, shifting with time
      const u = (c / COLS + r * 0.07 + rt.clock * 0.05) % 1;
      const p0 = pal[Math.floor(u * pal.length) % pal.length], p1 = pal[(Math.floor(u * pal.length) + 1) % pal.length];
      tmpC.copy(p0).lerp(p1, (u * pal.length) % 1);
      // light up under each dancer
      let under = 0;
      for (let d = 0; d < 2; d++) { const fp = rt.foot[d]; const dd = Math.hypot(x - fp.x, z - fp.z); under = Math.max(under, Math.pow(clamp(1 - dd / 0.95), 2)); }
      if (under > 0.01) { v = Math.max(v, under * 0.95); tmpC.lerp(pal[(i + 1) % pal.length], under * 0.4); }
      const lit = 0.03 + v * 1.25 * bright;
      m.setColorAt(i, tmpC.clone().multiplyScalar(lit));
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  const setup = (m: THREE.InstancedMesh | null) => {
    tiles.current = m;
    if (!m) return;
    pos.forEach(([x, z], i) => { oFloor.position.set(x, 0.0, z); oFloor.updateMatrix(); m.setMatrixAt(i, oFloor.matrix); m.setColorAt(i, new THREE.Color(0.03, 0.02, 0.05)); });
    m.instanceMatrix.needsUpdate = true;
  };
  return (
    <group>
      {/* glossy black plate under the glass tiles */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.045, 0]}>
        <planeGeometry args={[COLS * TILE + 0.5, ROWS * TILE + 0.5]} />
        <meshStandardMaterial color="#05040a" roughness={0.7} metalness={0.1} envMapIntensity={0} />
      </mesh>
      <instancedMesh ref={setup} args={[geo, undefined as any, COLS * ROWS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

// ====================================================================== LED wall + logo
const WALL_BARS = 48;
export function LedWall({ rt }: { rt: StageRuntime }) {
  const bars = useRef<THREE.InstancedMesh>(null);
  const logo = useRef<THREE.Group>(null);
  const geo = useMemo(() => { const g = new THREE.BoxGeometry(0.26, 1, 0.12); g.translate(0, 0.5, 0); return g; }, []);
  const chevron = useMemo(() => {
    const s = new THREE.Shape(); s.moveTo(-0.5, 1); s.lineTo(0.3, 0); s.lineTo(-0.5, -1); s.lineTo(-0.1, -1); s.lineTo(0.7, 0); s.lineTo(-0.1, 1); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false });
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c0 = new THREE.Color(BRAND[0]), c1 = new THREE.Color(BRAND[1]), c2 = new THREE.Color(BRAND[2]), t = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const u = (pos.getY(i) + 1) / 2; if (u < 0.5) t.copy(c0).lerp(c1, u * 2); else t.copy(c1).lerp(c2, (u - 0.5) * 2); col.set([t.r, t.g, t.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
  }, []);
  useFrame(() => {
    const m = bars.current; if (!m) return;
    const { st, f } = rt; const dim = 1 - 0.93 * st.dim;
    for (let i = 0; i < WALL_BARS; i++) {
      const x = (i - (WALL_BARS - 1) / 2) * 0.34;
      const band = rt.bands[Math.min(31, Math.floor((Math.abs(i - (WALL_BARS - 1) / 2) / (WALL_BARS / 2)) * 32))];   // mirrored: bass in the middle
      const h = 0.25 + band * 3.8 * (0.5 + 0.5 * st.floor);
      oWall.position.set(x, 0, -7.3); oWall.scale.set(1, h, 1); oWall.updateMatrix(); m.setMatrixAt(i, oWall.matrix);
      const pal = rt.palette; tmpC.copy(pal[i % pal.length]).lerp(pal[(i + 1) % pal.length], 0.5).multiplyScalar((0.15 + band * 1.9) * dim);
      m.setColorAt(i, tmpC);
    }
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (logo.current) { const s = 1 + 0.06 * (f?.kick ?? 0); logo.current.scale.setScalar(1.7 * s); (logo.current.children[0] as THREE.Mesh).visible = true; }
  });
  return (
    <group>
      <mesh position={[0, 3.5, -7.6]}><planeGeometry args={[30, 12]} /><meshBasicMaterial color="#07050d" /></mesh>
      <instancedMesh ref={bars} args={[geo, undefined as any, WALL_BARS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <group ref={logo} position={[0, 3.9, -7.1]}>
        <mesh geometry={chevron}><meshBasicMaterial vertexColors toneMapped={false} /></mesh>
      </group>
    </group>
  );
}

// ====================================================================== disco ball
const FACETS = 260;
export function DiscoBall({ rt }: { rt: StageRuntime }) {
  const group = useRef<THREE.Group>(null);
  const facets = useRef<THREE.InstancedMesh>(null);
  const floorDots = useRef<THREE.InstancedMesh>(null);
  const wallDots = useRef<THREE.InstancedMesh>(null);
  const cable = useRef<THREE.Mesh>(null);
  const dotTex = useMemo(() => dotTexture(), []);
  const R = 0.62;
  const normals = useMemo(() => {
    const out: THREE.Vector3[] = []; const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < FACETS; i++) { const y = 1 - (i / (FACETS - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i; out.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r)); }
    return out;
  }, []);
  const facetGeo = useMemo(() => new THREE.BoxGeometry(0.15, 0.15, 0.025), []);
  const dotGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const init = (m: THREE.InstancedMesh | null) => {
    facets.current = m; if (!m) return;
    normals.forEach((n, i) => {
      oBall.position.copy(n).multiplyScalar(R); oBall.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); oBall.scale.set(1, 1, 1); oBall.updateMatrix(); m.setMatrixAt(i, oBall.matrix);
      const v = 0.75 + 0.25 * Math.random(); m.setColorAt(i, new THREE.Color(v, v, v));
    });
    m.instanceMatrix.needsUpdate = true;
  };
  const lamp = useMemo(() => new THREE.Vector3(0, 5.6, 8.5), []);
  const nW = useMemo(() => new THREE.Vector3(), []); const pW = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []); const refl = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  useFrame(() => {
    const g = group.current; if (!g) return;
    const { st, dt } = rt; const v = st.prop.ball;
    g.visible = v > 0.002;
    if (!g.visible) { if (floorDots.current) floorDots.current.count = 0; if (wallDots.current) wallDots.current.count = 0; return; }
    const e = v * v * (3 - 2 * v);
    g.position.set(0, 11 - 7.3 * e, -0.4); g.rotation.y += dt * (0.5 + 0.9 * st.eFast);
    if (cable.current) { const h = 14 - g.position.y; cable.current.scale.set(1, h, 1); cable.current.position.y = g.position.y + h / 2 + R; }
    // light dots: for a subset of facets bounce the pin-spot off the ball onto the floor / walls
    const fd = floorDots.current, wd = wallDots.current; if (!fd || !wd) return;
    q.copy(g.quaternion); let nf = 0, nw = 0;
    const alpha = clamp(v * 1.2) * (1 - 0.5 * st.dim);
    for (let i = 0; i < FACETS; i += 2) {
      nW.copy(normals[i]).applyQuaternion(q); pW.copy(nW).multiplyScalar(R).add(g.position);
      dir.copy(pW).sub(lamp).normalize(); const dn = dir.dot(nW); if (dn > -0.05) continue;       // facet faces away from the lamp
      refl.copy(dir).addScaledVector(nW, -2 * dn).normalize();
      let t = Infinity, kind = 0;
      if (refl.y < -0.02) { const tf = (0.04 - pW.y) / refl.y; if (tf > 0) { t = tf; kind = 1; } }
      if (refl.z < -0.02) { const tw = (-7.0 - pW.z) / refl.z; if (tw > 0 && tw < t) { t = tw; kind = 2; } }
      if (kind === 1 && nf < 130) {
        const x = pW.x + refl.x * t, z = pW.z + refl.z * t; if (Math.abs(x) > 8 || Math.abs(z) > 8) continue;
        oBall.position.set(x, 0.06, z); oBall.rotation.set(-Math.PI / 2, 0, 0); oBall.scale.setScalar(0.22 + 0.08 * Math.sin(i + rt.clock * 5)); oBall.updateMatrix(); fd.setMatrixAt(nf, oBall.matrix);
        tmpC.copy(rt.palette[i % rt.palette.length]).lerp(new THREE.Color('#ffffff'), 0.5).multiplyScalar(2.2 * alpha); fd.setColorAt(nf, tmpC); nf++;
      } else if (kind === 2 && nw < 130) {
        const x = pW.x + refl.x * t, y = pW.y + refl.y * t; if (y < 0.1 || y > 9 || Math.abs(x) > 14) continue;
        oBall.position.set(x, y, -7.0); oBall.rotation.set(0, 0, 0); oBall.scale.setScalar(0.3 + 0.1 * Math.sin(i * 1.7 + rt.clock * 4)); oBall.updateMatrix(); wd.setMatrixAt(nw, oBall.matrix);
        tmpC.copy(rt.palette[(i + 2) % rt.palette.length]).lerp(new THREE.Color('#ffffff'), 0.4).multiplyScalar(2.0 * alpha); wd.setColorAt(nw, tmpC); nw++;
      }
    }
    fd.count = nf; wd.count = nw;
    fd.instanceMatrix.needsUpdate = wd.instanceMatrix.needsUpdate = true;
    if (fd.instanceColor) fd.instanceColor.needsUpdate = true; if (wd.instanceColor) wd.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <group ref={group}>
        <mesh><sphereGeometry args={[R * 0.985, 24, 16]} /><meshStandardMaterial color="#1b1b24" roughness={0.4} metalness={0.9} /></mesh>
        <instancedMesh ref={init} args={[facetGeo, undefined as any, FACETS]} frustumCulled={false}>
          <meshStandardMaterial metalness={1} roughness={0.06} envMapIntensity={2.2} color="#ffffff" />
        </instancedMesh>
        <pointLight color="#ffffff" intensity={0.6} distance={5} />
      </group>
      <mesh ref={cable}><cylinderGeometry args={[0.012, 0.012, 1, 6]} /><meshBasicMaterial color="#9a9aa8" /></mesh>
      <instancedMesh ref={floorDots} args={[dotGeo, undefined as any, 130]} frustumCulled={false}>
        <meshBasicMaterial map={dotTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={wallDots} args={[dotGeo, undefined as any, 130]} frustumCulled={false}>
        <meshBasicMaterial map={dotTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

// ====================================================================== beams (volumetric cones)
const BEAM_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// uv.y is 1 at the cone's apex (the lamp) and 0 at its open end, so the beam is brightest at the lamp and fades with distance
const BEAM_FRAG = /* glsl */`varying vec2 vUv; uniform vec3 uColor; uniform float uAlpha;
void main(){ float along = vUv.y; float a = pow(along, 1.3) * 0.5 * uAlpha; gl_FragColor = vec4(uColor, a); }`;

function useBeamMaterial(color: string) {
  return useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 } }, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }), [color]);
}

const HEADS = 4;
export function MovingHeads({ rt }: { rt: StageRuntime }) {
  const root = useRef<THREE.Group>(null);
  const heads = useRef<(THREE.Group | null)[]>([]);
  const coneGeo = useMemo(() => { const g = new THREE.ConeGeometry(0.75, 7.5, 28, 1, true); g.translate(0, -3.75, 0); return g; }, []);
  const mats = [useBeamMaterial('#ff2e9a'), useBeamMaterial('#00c2ff'), useBeamMaterial('#ffd400'), useBeamMaterial('#8a2bff')];
  const spots = useRef<(THREE.SpotLight | null)[]>([]);
  const targets = useMemo(() => Array.from({ length: 2 }, () => new THREE.Object3D()), []);
  useFrame(() => {
    const g = root.current; if (!g) return;
    const { st, f } = rt, v = st.prop.heads, tr = st.prop.truss;
    g.visible = tr > 0.01; if (!g.visible) return;
    g.position.y = 9.4 - 4.4 * (tr * tr * (3 - 2 * tr));
    const beat = rt.beats, hit = f?.kick ?? 0;
    for (let i = 0; i < HEADS; i++) {
      const h = heads.current[i]; if (!h) continue;
      const ph = i * 1.57 + beat * (st.tier === 'peak' ? 0.5 : 0.25);
      // sweep: pan/tilt as a lissajous across the floor, snapping inward on the kick
      h.rotation.set(Math.sin(ph * 1.3) * 0.5 + (i < 2 ? 0.2 : -0.2) * 0 + 0.25, 0, Math.sin(ph) * 0.8 * (i % 2 ? -1 : 1) + (i < 2 ? -0.15 : 0.15) * hit);
      const m = mats[i]; m.uniforms.uAlpha.value = v * (0.5 + 0.7 * hit + 0.3 * (f?.treble ?? 0)) * (1 - 0.7 * st.dim);
      m.uniforms.uColor.value.copy(rt.palette[i % rt.palette.length]);
    }
    // two real spot lights borrow the first/last head so the beams actually light the dancers
    for (let s = 0; s < 2; s++) {
      const L = spots.current[s], h = heads.current[s === 0 ? 0 : HEADS - 1]; if (!L || !h) continue;
      L.intensity = v * 55 * (1 - 0.8 * st.dim); L.color.copy(rt.palette[s * 2 % rt.palette.length]);
      const wp = new THREE.Vector3(); h.getWorldPosition(wp); L.position.copy(wp);
      const d = new THREE.Vector3(0, -1, 0).applyQuaternion(h.getWorldQuaternion(new THREE.Quaternion())); targets[s].position.copy(wp).addScaledVector(d, 6);
    }
  });
  return (
    <group ref={root} position={[0, 9.4, -0.5]}>
      <mesh><boxGeometry args={[9.6, 0.12, 0.12]} /><meshStandardMaterial color="#14141c" metalness={0.8} roughness={0.35} /></mesh>
      {[-4.7, 4.7].map(x => <mesh key={x} position={[x, 0.6, 0]}><boxGeometry args={[0.08, 1.2, 0.08]} /><meshStandardMaterial color="#14141c" metalness={0.8} roughness={0.35} /></mesh>)}
      {Array.from({ length: HEADS }, (_, i) => (
        <group key={i} position={[(i - (HEADS - 1) / 2) * 2.5, -0.1, 0]} ref={el => { heads.current[i] = el; }}>
          <mesh position={[0, -0.14, 0]}><cylinderGeometry args={[0.13, 0.17, 0.3, 14]} /><meshStandardMaterial color="#0e0e14" metalness={0.7} roughness={0.4} /></mesh>
          <mesh geometry={coneGeo} material={mats[i]} position={[0, -0.28, 0]} />
        </group>
      ))}
      {[0, 1].map(s => (
        <React.Fragment key={s}>
          <spotLight ref={el => { spots.current[s] = el; }} angle={0.32} penumbra={0.9} intensity={0} distance={14} decay={1.6} target={targets[s]} />
          <primitive object={targets[s]} />
        </React.Fragment>
      ))}
    </group>
  );
}

// ====================================================================== lasers
const LASERS = 14;
export function Lasers({ rt }: { rt: StageRuntime }) {
  const g = useRef<THREE.Group>(null);
  const beams = useRef<(THREE.Mesh | null)[]>([]);
  const geo = useMemo(() => { const c = new THREE.CylinderGeometry(0.007, 0.007, 16, 5, 1, true); c.translate(0, -8, 0); return c; }, []);
  const mats = useMemo(() => ['#00ff9d', '#ff2e9a', '#00c2ff'].map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })), []);
  useFrame(() => {
    const root = g.current; if (!root) return;
    const v = rt.st.prop.lasers; root.visible = v > 0.01; if (!root.visible) return;
    const t = rt.clock, bp = rt.f?.beatPhase ?? 0;
    for (let i = 0; i < LASERS; i++) {
      const m = beams.current[i]; if (!m) continue;
      const fan = (i / (LASERS - 1) - 0.5) * 2;
      m.rotation.set(1.05 + 0.25 * Math.sin(t * 1.3 + i * 0.4), 0, fan * (0.75 + 0.35 * Math.sin(t * 0.9)) + Math.sin(t * 2.2 + i) * 0.08);
      m.rotation.z += Math.sin(bp * Math.PI * 2) * 0.05;
      (m.material as THREE.MeshBasicMaterial).opacity = v * (0.5 + 0.5 * ((i + Math.floor(rt.beats * 2)) % 2)) * (rt.st.drop ? 1 : 0.85) * (1 - 0.6 * rt.st.dim);
    }
  });
  return (
    <group ref={g} position={[0, 5.4, -3.2]}>
      {Array.from({ length: LASERS }, (_, i) => <mesh key={i} ref={el => { beams.current[i] = el; }} geometry={geo} material={mats[i % 3].clone()} />)}
    </group>
  );
}

// ====================================================================== confetti
const CONF = 360;
export function Confetti({ rt }: { rt: StageRuntime }) {
  const m = useRef<THREE.InstancedMesh>(null);
  const P = useMemo(() => Array.from({ length: CONF }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, c: new THREE.Color() })), []);
  const cursor = useRef(0);
  const geo = useMemo(() => new THREE.PlaneGeometry(0.09, 0.05), []);
  useFrame(() => {
    const mesh = m.current; if (!mesh) return; const dt = rt.dt;
    const n = rt.st.confetti;
    for (let k = 0; k < n; k++) {
      const p = P[cursor.current++ % CONF]; const side = k % 2 ? 1 : -1;
      p.on = true; p.life = 0; p.p.set(side * 3.6, 0.15, 1.2);
      p.v.set(-side * (1.2 + Math.random() * 2.4), 6 + Math.random() * 5, -0.8 + Math.random() * 1.6);
      p.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); p.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      p.c.copy(rt.palette[Math.floor(Math.random() * rt.palette.length)]).lerp(new THREE.Color('#ffffff'), Math.random() * 0.35).multiplyScalar(1.4);
    }
    for (let i = 0; i < CONF; i++) {
      const p = P[i];
      if (!p.on) { oConf.scale.setScalar(0); oConf.updateMatrix(); mesh.setMatrixAt(i, oConf.matrix); continue; }
      p.life += dt; p.v.y -= 9 * dt; p.v.multiplyScalar(1 - dt * 0.9); p.v.y = Math.max(p.v.y, -1.6);   // flutter down slowly
      p.p.addScaledVector(p.v, dt); p.r.addScaledVector(p.w, dt);
      if (p.p.y < 0.02 || p.life > 9) { p.on = false; continue; }
      oConf.position.copy(p.p); oConf.rotation.set(p.r.x, p.r.y, p.r.z); oConf.scale.setScalar(1); oConf.updateMatrix(); mesh.setMatrixAt(i, oConf.matrix); mesh.setColorAt(i, p.c);
    }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={m} args={[geo, undefined as any, CONF]} frustumCulled={false}>
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}

// ====================================================================== speakers
export function Speakers({ rt }: { rt: StageRuntime }) {
  const sides = useRef<(THREE.Group | null)[]>([]);
  const woofers = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const v = rt.st.prop.speakers, e = v * v * (3 - 2 * v), bass = rt.f?.bass ?? 0, kick = rt.f?.kick ?? 0;
    [-1, 1].forEach((s, i) => { const g = sides.current[i]; if (!g) return; g.visible = v > 0.01; g.position.x = s * (9.5 - 4.6 * e); });
    woofers.current.forEach(w => { if (w) { w.scale.setScalar(1 + 0.16 * kick + 0.06 * bass); } });
  });
  return (
    <>
      {[-1, 1].map((s, i) => (
        <group key={s} ref={el => { sides.current[i] = el; }} position={[s * 9.5, 0, -0.8]} rotation={[0, -s * 0.35, 0]}>
          {[0, 1, 2].map(k => (
            <group key={k} position={[0, 0.5 + k * 1.02, 0]}>
              <mesh><boxGeometry args={[1.1, 1, 0.8]} /><meshStandardMaterial color="#0d0c12" roughness={0.6} metalness={0.3} /></mesh>
              <mesh ref={el => { woofers.current[i * 3 + k] = el; }} position={[0, 0, 0.41]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.36, 0.3, 0.06, 28]} /><meshStandardMaterial color="#1b1a24" roughness={0.5} metalness={0.5} emissive="#2a0a4a" emissiveIntensity={0.6} />
              </mesh>
              <mesh position={[0, 0.32, 0.405]}><boxGeometry args={[0.9, 0.025, 0.01]} /><meshBasicMaterial color="#D40055" toneMapped={false} /></mesh>
            </group>
          ))}
        </group>
      ))}
    </>
  );
}

// ====================================================================== quiet-time follow spot + lighting rig
export function Lighting({ rt }: { rt: StageRuntime }) {
  const hemi = useRef<THREE.HemisphereLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const rimA = useRef<THREE.DirectionalLight>(null);
  const rimB = useRef<THREE.DirectionalLight>(null);
  const spot = useRef<THREE.SpotLight>(null);
  const cone = useRef<THREE.Mesh>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const coneMat = useBeamMaterial('#fff1dc');
  const coneGeo = useMemo(() => { const g = new THREE.ConeGeometry(0.95, 9, 36, 1, true); g.translate(0, -4.5, 0); return g; }, []);
  useFrame(() => {
    const { st, f } = rt, dim = st.dim;
    if (hemi.current) hemi.current.intensity = 0.7 * (1 - 0.93 * dim);
    if (key.current) key.current.intensity = 2.0 * (1 - 0.97 * dim);
    if (rimA.current) { rimA.current.intensity = (1.8 + 1.6 * (f?.kick ?? 0)) * (1 - 0.92 * dim); rimA.current.color.copy(rt.palette[0]); }
    if (rimB.current) { rimB.current.intensity = (1.8 + 1.6 * (f?.kick ?? 0)) * (1 - 0.92 * dim); rimB.current.color.copy(rt.palette[1 % rt.palette.length]); }
    const s = st.spot;
    target.position.lerp(rt.spotAt, 0.08);
    if (spot.current) { spot.current.intensity = 130 * s; spot.current.position.set(target.position.x * 0.4, 8.2, target.position.z + 1.5); }
    if (cone.current) {
      cone.current.visible = s > 0.01; cone.current.position.set(target.position.x * 0.4, 8.2, target.position.z + 1.5);
      const dir = new THREE.Vector3().subVectors(target.position, cone.current.position).normalize();
      cone.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      coneMat.uniforms.uAlpha.value = s * 0.5;
    }
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={[0xf1ebff, 0x2a1530, 0.7]} />
      <directionalLight ref={key} position={[-2.5, 4.5, 6]} intensity={2} color={0xfff4ec} />
      <directionalLight ref={rimA} position={[-5, 3, -4]} intensity={2} color={0xff2e9a} />
      <directionalLight ref={rimB} position={[5, 3, -4]} intensity={2} color={0x00c2ff} />
      <spotLight ref={spot} angle={0.2} penumbra={0.85} decay={1.2} distance={22} color={0xfff1dc} target={target} intensity={0} />
      <primitive object={target} />
      <mesh ref={cone} geometry={coneGeo} material={coneMat} />
    </>
  );
}

export function Dust({ rt }: { rt: StageRuntime }) {
  void rt;
  return <Sparkles count={90} scale={[14, 6, 9]} position={[0, 3, 0]} size={3.2} speed={0.25} opacity={0.5} color="#ffffff" />;
}

/** Soft contact shadows under each dancer (a radial blob — cheap, reads well on the glossy floor). */
export function BlobShadow({ x, z, s = 1.0 }: { x: number; z: number; s?: number }) {
  const tex = useMemo(() => dotTexture(), []);
  return (
    <mesh position={[x, 0.058, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.5 * s, 1.1 * s]} />
      <meshBasicMaterial map={tex} color="#000000" transparent opacity={0.65} depthWrite={false} />
    </mesh>
  );
}

export type { KaijuStyle };
