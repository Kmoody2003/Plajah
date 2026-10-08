// KaijuStage3D — the Kaiju Disco: Chora & Reello (the rigged 3D kaiju) dance to whatever is playing on a
// light-up tile dance floor, with a beat-cutting camera director and a stage director that brings props
// in and out with the music's energy (quiet → dim + follow-spot; loud → disco ball, moving heads,
// lasers, speaker stacks; drops → confetti).
//
// Dances are CMU motion-capture clips retargeted onto the kaiju skeleton (scripts/mocap/bakeKaijuDances.mjs).
// Pure component like KaijuDanceStage: give it an AnalyserNode (+ optional song clock / lyrics).

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, useGLTF } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MascotRig } from '../../mascots/mascotRuntime';
import { KaijuV2Rig } from './kaijuV2Rig';
import { FaceDecalRig, extractHeadTris, readFaceAssets } from './kaijuFaceRig';
import { MASCOT_URL, defaultFur, type MascotWho } from '../../mascots/PlajahMascot';
import { KaijuAudio, type KaijuFeatures, type KaijuStyle, type VocalMode } from '../kaijuAudio';
import { STYLE_META } from '../kaijuChoreo';
import { DancerController } from './kaijuDancer';
import { type Dances, loadDances, pickDance } from './kaijuDances';
import { CameraDirector, StageDirector } from './kaijuStageDirector';
import { PerfGovernor, STAGE3D_LEVELS, startLevel } from '../kaijuPerfGovernor';
import { BlobShadow, Confetti, DiscoBall, DiscoFloor, Dust, Lasers, LedWall, Lighting, MovingHeads, PALETTES, Precompile, Speakers, type StageRuntime } from './KaijuSet';

export type LyricLine = { time: number; text: string };
export interface KaijuStage3DProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  getTime?: () => number;
  lyrics?: LyricLine[] | null;
  lyricsTimed?: boolean;
  genre?: string;
  style?: KaijuStyle | 'auto';
  forceVocal?: VocalMode | null;
  showHud?: boolean;
  /** Frame-rate ceiling. Default 60 (so 120/144 Hz screens don't burn power); 0 = uncapped. */
  fpsCap?: number;
  /** Let the stage trade resolution/effects to hold the frame rate (default true). `quality` is the starting point. */
  adaptive?: boolean;
  className?: string;
  quality?: 'high' | 'medium' | 'low';
  onFeatures?: (f: KaijuFeatures) => void;
  /** Lock the stage to a tier for inspection ('auto' = follow the music). */
  forceTier?: 'auto' | 'quiet' | 'groove' | 'peak';
  /** Which kaiju models: the new image-to-3D 'v2' (default, decal faces) or the 'old' vertex-colour rigs. `?rig=old` in the URL forces old too. */
  rig?: 'v2' | 'old';
}

const DRACO = '/draco/';
const SCALE = 1.35;
const NAMES = ['Chora', 'Reello'] as const;
const WHO: MascotWho[] = ['chora', 'reello'];
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

const paletteTarget = new THREE.Color();   // scratch — no per-frame allocation
interface Slot { dances: Dances | null; ctrl: DancerController | null; group: THREE.Group | null; head: THREE.Vector3; target: THREE.Vector3; recent: string[] }

// ---------------------------------------------------------------------------------------------- dancer
type DancerProps = { who: MascotWho; index: number; quality: 'high' | 'medium' | 'low'; slots: React.MutableRefObject<Slot[]> };
const V2_URL = (who: MascotWho) => `/models/mascots/v2/${who}.glb`;
const wantOldRig = (p?: 'v2' | 'old') => p === 'old' || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('rig') === 'old');

function DancerFrame({ index, group, rootObj }: { index: number; group: React.RefObject<THREE.Group | null>; rootObj: THREE.Object3D }) {
  return (
    <group ref={group} position={[index ? 1.3 : -1.3, 0.03, 0]} rotation={[0, index ? -0.28 : 0.28, 0]} scale={SCALE}>
      <primitive object={rootObj} />
      <BlobShadow x={0} z={0} s={0.9} />
    </group>
  );
}

/** The old vertex-colour rig (bone-scale face). Kept as the fallback and behind `rig="old"`. */
function DancerOld({ who, index, quality, slots }: DancerProps) {
  const gltf = useGLTF(MASCOT_URL(who), DRACO);
  const fur = quality === 'high' ? defaultFur() : quality === 'medium' ? 'low' : 'low';
  const rig = useMemo(() => new MascotRig({ scene: cloneSkinned(gltf.scene) as THREE.Object3D, animations: gltf.animations }, { fur, reducedMotion: false }), [gltf, fur]);
  const ctrl = useMemo(() => new DancerController(rig, gltf.animations, null, who), [rig, gltf, who]);
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    const s = slots.current[index]; s.ctrl = ctrl; s.group = group.current;
    let on = true; loadDances(who, 'old').then(d => { if (on && d) ctrl.dances = d; });   // always the old skeleton's own bake
    return () => { on = false; s.ctrl = null; ctrl.dispose(); };
  }, [ctrl, index, slots, who]);
  return <DancerFrame index={index} group={group} rootObj={rig.root} />;
}

/** The approved image-to-3D model: one textured skin, spring fins/horns, and a decal face (eyes / brows / mouth / extras). */
function DancerV2({ who, index, slots }: DancerProps) {
  const gltf = useGLTF(V2_URL(who), DRACO);
  const assets = readFaceAssets(who);                       // suspends until the atlases are in, so the shader precompile sees the decals
  const rig = useMemo(() => new KaijuV2Rig({ scene: cloneSkinned(gltf.scene) as THREE.Object3D, animations: gltf.animations }), [gltf]);
  const face = useMemo(() => new FaceDecalRig(assets, rig.bones.head, extractHeadTris(rig.mesh!, rig.bones.head)), [rig, assets]);
  const ctrl = useMemo(() => { const c = new DancerController(rig, gltf.animations, null, who); c.setFace(face); return c; }, [rig, gltf, who, face]);
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    const s = slots.current[index]; s.ctrl = ctrl; s.group = group.current;
    return () => { s.ctrl = null; ctrl.dispose(); };
  }, [ctrl, index, slots]);
  return <DancerFrame index={index} group={group} rootObj={rig.root} />;
}

/** Catches a failed v2 load (missing GLB / atlases) and tells the parent to swap in the old rig. */
class RigBoundary extends React.Component<{ onFail: (e: unknown) => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn('[kaiju] v2 rig failed to load, falling back to the old rig:', e); this.props.onFail(e); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Dancer(p: DancerProps & { rig?: 'v2' | 'old' }) {
  const [fell, setFell] = useState(false);
  if (fell || wantOldRig(p.rig)) return <DancerOld who={p.who} index={p.index} quality={p.quality} slots={p.slots} />;
  return <RigBoundary onFail={() => setFell(true)}><DancerV2 who={p.who} index={p.index} quality={p.quality} slots={p.slots} /></RigBoundary>;
}

// ---------------------------------------------------------------------------------------------- brain
interface Hud { style: KaijuStyle; tier: string; who: string; dance: string; shot: string; bpm: number; prop: string }

function Brain({ live, rt, slots, dancesRef, hudSet }: {
  live: React.MutableRefObject<KaijuStage3DProps>; rt: StageRuntime; slots: React.MutableRefObject<Slot[]>;
  dancesRef: React.MutableRefObject<Dances | null>; hudSet: (h: Hud) => void;
}) {
  const audio = useMemo(() => new KaijuAudio(), []);
  const stage = useMemo(() => new StageDirector(), []);
  const cam = useMemo(() => new CameraDirector(), []);
  const S = useRef({
    T: 0, hudAt: 0, style: null as KaijuStyle | null, block: -1, singer: 1, wasVocal: false, vocalStart: 0, lastVocalEnd: -9, lyricIdx: -1,
    lastBpm: 0, hadDances: false, lastTier: '', hold: 0, maxBand: new Float32Array(32).fill(0.2), freq: null as Uint8Array<ArrayBuffer> | null,
    featuredAt: -99, formation: 0, reduced: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  });
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3() }), []);

  useFrame(({ camera, scene, gl, size }, rawDt) => {
    const P = live.current, s = S.current;
    if (import.meta.env.DEV && (window as any).__kaijuDisco?.cam !== cam) (window as any).__kaijuDisco = { scene, camera, gl, rt, slots, stage, cam };
    const dt = Math.min(0.05, rawDt); s.T += dt; rt.clock = s.T; rt.dt = dt;
    const songT = P.getTime ? P.getTime() : s.T;
    // lyrics → active line
    const L = P.lyrics; let lIdx = -1, lText = '', lActive: boolean | null = null;
    if (L?.length) { for (let k = 0; k < L.length; k++) { if (songT >= L[k].time) lIdx = k; else break; } if (lIdx >= 0) { lText = (L[lIdx].text || '').trim(); const end = L[lIdx + 1]?.time ?? L[lIdx].time + 6; lActive = P.lyricsTimed ? !!lText && songT < Math.min(end, L[lIdx].time + 9) : null; } else lActive = P.lyricsTimed ? false : null; }

    const f = audio.sample(P.analyser, P.isPlaying, dt, {
      lyricActive: lActive, genre: P.genre, forceStyle: P.style && P.style !== 'auto' ? P.style : null, forceVocal: P.forceVocal ?? null,
    });
    P.onFeatures?.(f); rt.f = f; rt.style = f.style;
    const beats = Number.isFinite(f.beats) ? f.beats : s.T * 2; rt.beats = beats;

    // spectrum → 32 log bands (AGC'd per band)
    if (P.analyser) {
      const an = P.analyser; if (!s.freq || s.freq.length !== an.frequencyBinCount) s.freq = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(s.freq); const nyq = (an.context.sampleRate || 44100) / 2, bins = s.freq.length;
      for (let b = 0; b < 32; b++) {
        const f0 = 40 * Math.pow(16000 / 40, b / 32), f1 = 40 * Math.pow(16000 / 40, (b + 1) / 32);
        const i0 = Math.min(bins - 1, Math.floor((f0 / nyq) * bins)), i1 = Math.min(bins, Math.max(i0 + 1, Math.ceil((f1 / nyq) * bins)));
        let m = 0; for (let i = i0; i < i1; i++) m = Math.max(m, s.freq[i]); m /= 255;
        s.maxBand[b] = Math.max(m, s.maxBand[b] * (1 - dt * 0.15), 0.12);
        const v = P.isPlaying ? clamp(m / s.maxBand[b]) : 0;
        rt.bands[b] += (v - rt.bands[b]) * (1 - Math.exp(-dt * (v > rt.bands[b] ? 30 : 9)));
      }
    } else rt.bands.fill(0);

    // palette follows the style (crossfaded)
    const target = PALETTES[f.style];
    for (let i = 0; i < 4; i++) rt.palette[i].lerp(paletteTarget.setStyle(target[i]), 1 - Math.exp(-dt * 2.5));

    // ---- stage director (props) + optional forced tier for inspection
    const di = { dt, t: s.T, beats, beat: f.beat, kick: f.kick, onset: f.onset, level: f.level, bass: f.bass, treble: f.treble, intensity: f.intensity, bpm: f.bpm, silent: f.silent || !P.isPlaying, style: f.style, vocalMode: f.vocalMode };
    stage.force = P.forceTier && P.forceTier !== 'auto' ? P.forceTier : null;
    const st = stage.update(di);
    if (s.reduced) { st.prop.strobe = 0; st.flash = 0; }
    rt.st = st;

    // ---- vocal turn taking (one kaiju performs, the other keeps dancing)
    const vocalNow = !di.silent && f.vocalMode !== 'none';
    if (vocalNow && !s.wasVocal) { if (s.T - s.lastVocalEnd > 1) s.singer = 1 - s.singer; s.vocalStart = s.T; }
    if (!vocalNow && s.wasVocal) s.lastVocalEnd = s.T;
    if (vocalNow && lActive !== null && lIdx !== s.lyricIdx && lIdx >= 0) s.singer = Math.floor(lIdx / 2) % 2;
    if (vocalNow && lActive === null && s.T - s.vocalStart > 16 && f.beat && f.beatCount % 4 === 0) { s.singer = 1 - s.singer; s.vocalStart = s.T; }
    s.lyricIdx = lIdx; s.wasVocal = vocalNow;
    const duet = vocalNow && f.intensity > 1.25;

    // ---- dancers
    const dances = dancesRef.current;
    const sl = slots.current;
    if (dances && !s.hadDances) { s.hadDances = true; sl.forEach(x => { if (x.ctrl && !x.ctrl.dances) x.ctrl.dances = x.dances ?? dances; }); s.block = -1; }
    const blk = Math.floor(beats / 16);
    const newBlock = f.style !== s.style || blk !== s.block || (st.drop && st.tier === 'peak');
    if (dances && !di.silent && newBlock && s.hadDances) {
      s.style = f.style; s.block = blk;
      const eT = clamp(st.eSlow * 1.15);
      const unison = Math.random() < 0.35;
      const a = pickDance(dances.metas, f.style, eT, sl[0].recent);
      const b = unison ? a : pickDance(dances.metas, f.style, vocalNow && s.singer === 1 ? eT * 0.6 : eT, sl[1].recent.concat(a ? [a.id] : []));
      [a, b].forEach((m, i) => { const x = sl[i]; if (m && x.ctrl) { x.ctrl.dance(m, f.bpm || 110, 0.5, unison ? 0.2 : undefined); x.recent.push(m.id); if (x.recent.length > 6) x.recent.shift(); } });
      if (st.drop && st.tier === 'peak') sl.forEach(x => x.ctrl?.cheer(f.bpm || 110));
    } else if (dances && !di.silent && Math.abs((f.bpm || 0) - s.lastBpm) > 5) { s.lastBpm = f.bpm; sl.forEach(x => x.ctrl?.retime(f.bpm || 110)); }
    if (di.silent && s.style !== null) { s.style = null; s.block = -1; sl.forEach(x => x.ctrl?.idle(0.8)); }

    // formation: quiet → close together; loud → spread; the singer steps forward
    const spread = st.tier === 'quiet' || st.tier === 'silent' ? 0.85 : st.tier === 'peak' ? 1.7 : 1.3;
    for (let i = 0; i < 2; i++) {
      const x = sl[i]; if (!x.group) continue;
      const sing = vocalNow && (duet || s.singer === i);
      x.target.set((i ? 1 : -1) * spread, 0.03 + (st.prop.ball > 0.05 ? 0 : 0), sing ? 0.7 : st.tier === 'peak' ? 0.1 : 0);
      x.group.position.lerp(x.target, 1 - Math.exp(-dt * 1.6));
      const yawT = (i ? -1 : 1) * (sing ? 0.05 : 0.28);
      x.group.rotation.y += (yawT - x.group.rotation.y) * (1 - Math.exp(-dt * 2));
      rt.foot[i].set(x.group.position.x, 0, x.group.position.z);
      if (x.ctrl) {
        if (!x.ctrl.dances && s.hadDances) x.ctrl.dances = x.dances ?? dances;   // a dancer that finished loading after the dances did
        x.ctrl.update(dt, {
          tier: st.tier, silent: di.silent, asleep: di.silent && s.T > 12, singing: sing, vocalEnv: f.vocalEnv, sustain: f.vocalMode === 'sustain',
          kick: f.kick, beat: f.beat, beats, drop: st.drop, snapped: false, eFast: st.eFast,
        });
      }
    }

    // ---- follow-spot target (singer, else alternate every 16 beats)
    const featured = vocalNow ? s.singer : Math.floor(beats / 16) % 2;
    rt.featured = featured; rt.spotAt.set(sl[featured].group?.position.x ?? 0, 0.55, sl[featured].group?.position.z ?? 0);

    // ---- camera director
    for (let i = 0; i < 2; i++) {
      const hb = sl[i].ctrl?.rig.bones.head; const out = i ? tmp.b : tmp.a;
      if (hb) { hb.getWorldPosition(out); out.y += 0.12 * SCALE; } else out.set(i ? 1.3 : -1.3, 0.9, 0);
    }
    const pose = cam.update(di, { a: tmp.a, b: tmp.b, tier: st.tier, drop: st.drop, ball: st.prop.ball, singer: vocalNow ? (duet ? -1 : s.singer) : -1, eFast: st.eFast, vocal: vocalNow });
    const pc = camera as THREE.PerspectiveCamera;
    // narrow / portrait panes: back the camera off so both dancers still fit (shots are authored for ~16:9)
    const aspect = size.width / Math.max(1, size.height), pull = Math.max(1, Math.pow(1.78 / Math.max(0.4, aspect), 0.85));
    if (pull > 1.01) pose.pos.sub(pose.look).multiplyScalar(pull).add(pose.look);
    pc.position.copy(pose.pos); pc.up.set(Math.sin(pose.roll), Math.cos(pose.roll), 0); pc.lookAt(pose.look);
    if (Math.abs(pc.fov - pose.fov) > 0.01) { pc.fov = pose.fov; pc.updateProjectionMatrix(); }

    // ---- HUD (throttled React state)
    if (P.showHud !== false && performance.now() - s.hudAt > 300) {
      s.hudAt = performance.now();
      const who = di.silent ? 'Waiting for music' : vocalNow ? (duet ? 'Duet!' : `${NAMES[s.singer]} sings · ${NAMES[1 - s.singer]} dances`) : 'Both dancing';
      const props = (['ball', 'heads', 'lasers', 'speakers'] as const).filter(k => st.prop[k] > 0.5).join(' · ') || (st.spot > 0.5 ? 'follow-spot' : '—');
      hudSet({ style: f.style, tier: st.tier, who, dance: sl.map(x => x.ctrl?.current?.name ?? '').filter(Boolean).join(' / '), shot: pose.kind, bpm: Math.round(f.bpm), prop: props });
    }
  });
  return null;
}

// ---------------------------------------------------------------------------------------------- stage
export const KaijuStage3D: React.FC<KaijuStage3DProps> = (props) => {
  const live = useRef(props); live.current = props;
  const quality = props.quality ?? 'high';
  const [hud, setHud] = useState<Hud>({ style: 'edm', tier: 'silent', who: 'Warming up…', dance: '', shot: 'wide', bpm: 0, prop: '—' });
  const [credit, setCredit] = useState('');
  const dancesRef = useRef<Dances | null>(null);
  const slots = useRef<Slot[]>([0, 1].map(() => ({ dances: null, ctrl: null, group: null, head: new THREE.Vector3(), target: new THREE.Vector3(), recent: [] })));
  const rt = useMemo<StageRuntime>(() => ({
    f: null, bands: new Float32Array(32), style: 'edm', palette: PALETTES.edm.map(c => new THREE.Color(c)),
    foot: [new THREE.Vector3(-1.3, 0, 0), new THREE.Vector3(1.3, 0, 0)], featured: 0, spotAt: new THREE.Vector3(0, 0.5, 0),
    beats: 0, clock: 0, dt: 0.016, quality,
    st: { tier: 'silent', eFast: 0, eSlow: 0, prop: { ball: 0, heads: 0, lasers: 0, speakers: 0, truss: 0, strobe: 0 }, dim: 0.8, spot: 0, drop: false, confetti: 0, flash: 0, special: null, floor: 0.35 },
  }), []);   // eslint-disable-line react-hooks/exhaustive-deps
  rt.quality = quality;
  useEffect(() => {
    // per-character bakes for the v2 rig (v1's shared bake for the old rig, or when a v2 bake is missing)
    let on = true; const mode = wantOldRig(props.rig) ? 'old' : 'v2';
    Promise.all(WHO.map(w => loadDances(w, mode))).then(ds => {
      if (!on || !ds[0]) return;
      ds.forEach((d, i) => { slots.current[i].dances = d; });
      dancesRef.current = ds[0]; setCredit(ds[0].credit);
    });
    return () => { on = false; };
  }, [props.rig]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- frame pacing + adaptive quality: we own the render loop (frameloop="never" + advance()) so the cap is exact
  // and every frame time feeds the governor, which walks STAGE3D_LEVELS down/up to hold the target frame rate.
  const cap = props.fpsCap === undefined ? 60 : props.fpsCap;
  const gov = useMemo(() => new PerfGovernor({ target: cap > 0 ? Math.min(60, cap) : 60, floor: 30, levels: STAGE3D_LEVELS.length, start: startLevel(quality, STAGE3D_LEVELS.length) }), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [level, setLevel] = useState(gov.level);
  const [warm, setWarm] = useState(false);          // all shader programs compiled → safe to start drawing
  const adaptive = props.adaptive !== false;
  const onFrameMs = useCallback((ms: number) => {
    if (!adaptive) return;
    const c = gov.push(ms); if (c !== null) setLevel(c);
    if (import.meta.env.DEV) (window as any).__kaijuPerf = { level: gov.level, mean: gov.mean };
  }, [gov, adaptive]);
  const L = STAGE3D_LEVELS[level];
  const dprNow = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, L.dpr);

  const meta = STYLE_META[hud.style];
  const post = quality !== 'low' || L.bloom;
  return (
    <div className={props.className ?? 'w-full h-full relative'} style={{ background: '#050309', overflow: 'hidden', position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        dpr={dprNow}
        frameloop="never"
        gl={{ antialias: !post, powerPreference: 'high-performance', toneMapping: post ? THREE.NoToneMapping : THREE.NeutralToneMapping }}
        camera={{ fov: 38, position: [0, 1.6, 7.4], near: 0.05, far: 60 }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <FrameDriver cap={cap} enabled={warm} onFrameMs={onFrameMs} />
        <color attach="background" args={['#050309']} />
        <fog attach="fog" args={['#07040d', 14, 34]} />
        <Environment resolution={128} frames={1} background={false} environmentIntensity={0.55}>
          <Lightformer form="rect" intensity={4} color="#ff2e9a" position={[-6, 3, 2]} scale={[4, 6, 1]} target={[0, 1, 0]} />
          <Lightformer form="rect" intensity={4} color="#00c2ff" position={[6, 3, 2]} scale={[4, 6, 1]} target={[0, 1, 0]} />
          <Lightformer form="ring" intensity={3} color="#ffffff" position={[0, 7, 4]} scale={5} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={2} color="#ffb000" position={[0, 2, -6]} scale={[10, 3, 1]} target={[0, 1, 0]} />
        </Environment>
        <Lighting rt={rt} />
        <Suspense fallback={null}>
          {WHO.map((w, i) => <Dancer key={w} who={w} index={i} quality={quality} slots={slots} rig={props.rig} />)}
          <Precompile onReady={() => setWarm(true)} />
        </Suspense>
        <DiscoFloor rt={rt} />
        <LedWall rt={rt} />
        <DiscoBall rt={rt} />
        <MovingHeads rt={rt} />
        <Lasers rt={rt} />
        <Speakers rt={rt} />
        <Confetti rt={rt} />
        {L.dust && quality !== 'low' && <Dust rt={rt} />}
        <Brain live={live} rt={rt} slots={slots} dancesRef={dancesRef} hudSet={setHud} />
        <Flash rt={rt} />
        {post && (
          <EffectComposer multisampling={L.msaa} enableNormalPass={false}>
            {L.bloom ? <Bloom mipmapBlur intensity={0.7} luminanceThreshold={0.9} luminanceSmoothing={0.2} radius={0.7} /> : <></>}
            <Vignette eskil={false} offset={0.25} darkness={L.vignette ? 0.7 : 0.15} />
            <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          </EffectComposer>
        )}
      </Canvas>

      {props.showHud !== false && (
        <div style={{ position: 'absolute', left: 14, bottom: 14, right: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', pointerEvents: 'none', fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
          <span style={{ background: 'rgba(255,255,255,.92)', border: '2px solid #6B0099', color: '#3B1A5C', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 800 }}>{meta.emoji} {meta.label}</span>
          <span style={{ background: '#6B0099', color: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700 }}>{hud.who}</span>
          <span style={{ background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>🎬 {hud.shot}</span>
          <span style={{ background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>💡 {hud.tier} · {hud.prop}</span>
          {hud.bpm > 0 && <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 11, fontWeight: 700 }}>{hud.bpm} BPM · {hud.dance}</span>}
          {credit && <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,.45)', fontSize: 10 }}>{credit}</span>}
        </div>
      )}
    </div>
  );
};

/**
 * Owns the render loop: rAF → advance() at an exact frame cap (accumulated, so 144 Hz screens settle on ~60 instead of
 * aliasing to 48), reports each frame interval to the governor. Starts only once the shaders are warm.
 */
function FrameDriver({ cap, enabled, onFrameMs }: { cap: number; enabled: boolean; onFrameMs: (ms: number) => void }) {
  const advance = useThree(s => s.advance);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0, last = 0, nextAt = 0; const interval = cap > 0 ? 1000 / cap : 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (interval && t < nextAt - 1) return;
      if (interval) { nextAt = nextAt + interval; if (t - nextAt > interval) nextAt = t + interval * 0.5; }
      if (last) onFrameMs(t - last);
      last = t; advance(t / 1000, true);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [advance, cap, enabled, onFrameMs]);
  return null;
}

/** Full-frame white flash on drops (kept off for reduced-motion users by the director). */
function Flash({ rt }: { rt: StageRuntime }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    const mesh = m.current; if (!mesh) return;
    const a = Math.max(rt.st.flash * 0.35, rt.st.prop.strobe * 0.5);
    mesh.visible = a > 0.01; if (!mesh.visible) return;
    (mesh.material as THREE.MeshBasicMaterial).opacity = a;
    mesh.position.copy(camera.position).add(new THREE.Vector3(0, 0, -0.3).applyQuaternion(camera.quaternion)); mesh.quaternion.copy(camera.quaternion);
  });
  return <mesh ref={m} renderOrder={999}><planeGeometry args={[2, 2]} /><meshBasicMaterial color="#ffffff" transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} /></mesh>;
}

export default KaijuStage3D;
