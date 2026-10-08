// KaijuStage2D — the 2D Kaiju disco ("director mode"): Lorik & Lumi dance to whatever is playing on a
// light-up tile floor, with the same stage director (disco ball / moving heads / lasers / speakers when it
// is loud, dim + follow-spot when it is quiet, confetti on drops) and a beat-cutting 2D camera director as
// the 3D version — but drawn on ONE canvas from pre-baked sprites of the original SVG art, which is far
// lighter on the GPU/CPU than animating SVG nodes, so the frame rate holds on phones and TVs.
//
// Dances are CMU motion-capture clips projected onto the 2D puppet (scripts/mocap/bakeKaiju2DDances.mjs);
// if that data is missing it falls back to the hand-written dance moves of the original stage.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KAIJU_PALETTES } from '../KaijuFigure';
import { KaijuAudio, type KaijuFeatures, type KaijuStyle, type VocalMode } from '../kaijuAudio';
import { MOVES, STYLE_META, idlePose, performVocal, type MoveCtx } from '../kaijuChoreo';
import { type Pose, REST, clamp, follow, mirrorPose, pose } from '../kaijuPose';
import { StageDirector, type StageState } from '../stage3d/kaijuEnergyDirector';
import { EmotionDirector } from '../stage3d/kaijuFace';
import { applyExpression } from './kaijuExpression2D';
import { bakeKaijuSprites, KaijuCanvasFigure, type KaijuSprites } from './kaijuCanvasFigure';
import { CameraDirector2D } from './kaijuCamera2D';
import { Dance2D, type Dances2D, loadDances2D, pickDance } from './kaijuDances2D';
import { KaijuSet2D, PALETTES, W, H, type Set2DRuntime } from './kaijuSet2D';

export type LyricLine = { time: number; text: string };
export interface KaijuStage2DProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  getTime?: () => number;
  lyrics?: LyricLine[] | null;
  lyricsTimed?: boolean;
  genre?: string;
  style?: KaijuStyle | 'auto';
  forceVocal?: VocalMode | null;
  showHud?: boolean;
  fpsCap?: number;
  className?: string;
  quality?: 'high' | 'medium' | 'low';
  onFeatures?: (f: KaijuFeatures) => void;
  forceTier?: 'auto' | 'quiet' | 'groove' | 'peak';
}

const FLOOR_Y = 832, FIG = 1.5;
const NAMES = ['Lorik', 'Lumi'] as const;
const FONT = "'Outfit','Poppins','Nunito','Segoe UI',system-ui,sans-serif";
const NP = 80;
type Particle = { on: boolean; x: number; y: number; vx: number; vy: number; g: number; life: number; max: number; r: number; vr: number; sway: number; glyph: string; color: string; size: number };

interface Hud { style: KaijuStyle; tier: string; who: string; dance: string; shot: string; bpm: number; prop: string }

export const KaijuStage2D: React.FC<KaijuStage2DProps> = (props) => {
  const live = useRef(props); live.current = props;
  const quality = props.quality ?? 'high';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud>({ style: 'edm', tier: 'silent', who: 'Warming up…', dance: '', shot: 'wide', bpm: 0, prop: '—' });
  const [credit, setCredit] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!, host = hostRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let alive = true, raf = 0;

    // ---------------- sizing (backing store follows the element; world is fitted 'contain') ----------------
    let cw = 0, ch = 0, dpr = 1, fit = { s: 1, ox: 0, oy: 0 };
    let vignette: HTMLCanvasElement | null = null;
    const resize = () => {
      const r = host.getBoundingClientRect();
      const maxDpr = quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1;
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      if (w === cw && h === ch) return;
      cw = canvas.width = w; ch = canvas.height = h;
      const s = Math.min(cw / W, ch / H); fit = { s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2 };
      vignette = document.createElement('canvas'); vignette.width = 256; vignette.height = 144;
      const g = vignette.getContext('2d')!, gr = g.createRadialGradient(128, 72, 40, 128, 72, 150);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.62)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 144);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(host);

    // ---------------- the cast ----------------
    const set = new KaijuSet2D();
    const fig = [null, null] as (KaijuCanvasFigure | null)[];
    const lodLow = [null, null] as (KaijuSprites | null)[], lodHi = [null, null] as (KaijuSprites | null)[];
    let baking = false, baseDone = false, usingHi = false;
    // Bake the sprites once the element has a real size (resolution follows the on-screen figure size).
    const bake = async () => {
      if (baking || !alive) return; baking = true;
      try {
        const figScale = Math.max(fit.s, 0.5) * FIG;
        const lo = Math.max(2.2, Math.min(6, figScale * 1.8)), hi = Math.max(lo * 1.8, Math.min(10, figScale * 4.2));
        const [a, b] = await Promise.all([bakeKaijuSprites('lorik', false, lo), bakeKaijuSprites('lumi', true, lo)]);
        if (!alive) return;
        lodLow[0] = a; lodLow[1] = b;
        fig[0] = new KaijuCanvasFigure('lorik', a); fig[1] = new KaijuCanvasFigure('lumi', b); baseDone = true; setReady(true);
        // the close-up resolution arrives a moment later; it is swapped in whenever the camera is zoomed in
        const [ah, bh] = await Promise.all([bakeKaijuSprites('lorik', false, hi), bakeKaijuSprites('lumi', true, hi)]);
        if (!alive) return; lodHi[0] = ah; lodHi[1] = bh;
      } catch (e) { console.warn('kaiju 2D sprite bake failed', e); } finally { /* one attempt per mount */ }
    };

    let dances: Dances2D | null = null; const dancers: Dance2D[] = [];
    loadDances2D().then(d => { if (d && alive) { dances = d; dancers.push(new Dance2D(d), new Dance2D(d)); setCredit(d.credit); block = -1; style = null; } });

    // ---------------- state ----------------
    const audio = new KaijuAudio(), stage = new StageDirector(), camera = new CameraDirector2D();
    const rt: Set2DRuntime = {
      t: 0, dt: 0.016, beats: 0, beatPhase: 0, beatCount: 0, beat: false, kick: 0, bass: 0, treble: 0, level: 0, onset: 0,
      bands: new Float32Array(32), palette: PALETTES.edm.map(c => [...c] as [number, number, number]), style: 'edm',
      st: stage.s as StageState, feet: [{ x: 560, y: FLOOR_Y }, { x: 1040, y: FLOOR_Y }], spot: { x: 800, y: 700 },
      reduced: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    };
    const cur: Pose[] = [{ ...REST }, { ...REST }];
    const place = [{ x: 560, y: FLOOR_Y, s: FIG }, { x: 1040, y: FLOOR_Y, s: FIG }];
    const parts: Particle[] = Array.from({ length: NP }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, r: 0, vr: 0, sway: 0, glyph: '', color: '#fff', size: 30 }));
    let pi = 0;
    const spawn = (x: number, y: number, glyph: string, color: string, o: Partial<Particle> = {}) => {
      const p = parts[pi]; pi = (pi + 1) % NP;
      Object.assign(p, { on: true, x, y, vx: 0, vy: -60, g: 0, life: 0, max: 1.6, r: 0, vr: 0, sway: 0, glyph, color, size: 34 }, o);
    };
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

    let T = 0, last = performance.now(), lastDraw = 0, hudAt = 0, freq: Uint8Array<ArrayBuffer> | null = null;
    const maxBand = new Float32Array(32).fill(0.2);
    let style: KaijuStyle | null = null, block = -1, singer = 1, wasVocal = false, vocalStart = 0, lastVocalEnd = -9, lyricIdx = -1;
    let hadDances = false, lastBpm = 0, snapAt = -9, lastSnap = -9, syl = 0, emitAcc = 0, wordIx = 0, ambientAcc = 0, zAcc = 0, hadDrop = false;
    const emotions = [new EmotionDirector('chora', 1), new EmotionDirector('reello', 7)];   // Lorik = the music kaiju (warm), Lumi = the camera kaiju (cool)
    const recent: string[][] = [[], []];
    let moveIx = [0, 1], switchedAt = -9;
    let caption = '', captionA = 0;

    const linesNow = (t: number) => {
      const L = live.current.lyrics; if (!L || !L.length) return { idx: -1, text: '', active: null as boolean | null };
      let i = -1; for (let k = 0; k < L.length; k++) { if (t >= L[k].time) i = k; else break; }
      if (i < 0) return { idx: -1, text: '', active: live.current.lyricsTimed ? false : null };
      const text = (L[i].text || '').trim(), end = L[i + 1]?.time ?? L[i].time + 6;
      return { idx: i, text, active: live.current.lyricsTimed ? !!text && t < Math.min(end, L[i].time + 9) : null };
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const P = live.current;
      if (P.fpsCap && P.fpsCap > 0 && now - lastDraw < 1000 / P.fpsCap - 1) return;
      lastDraw = now;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt; rt.t = T; rt.dt = dt;
      resize();
      if (!baking && cw > 64) void bake();

      // ---- audio
      const songT = P.getTime ? P.getTime() : T;
      const ly = linesNow(songT);
      const f = audio.sample(P.analyser, P.isPlaying, dt, { lyricActive: ly.active, genre: P.genre, forceStyle: P.style && P.style !== 'auto' ? P.style : null, forceVocal: P.forceVocal ?? null });
      P.onFeatures?.(f);
      const idle = f.silent || !P.isPlaying;
      const beats = Number.isFinite(f.beats) ? f.beats : T * 2;
      rt.beats = beats; rt.beatPhase = f.beatPhase; rt.beatCount = f.beatCount; rt.beat = f.beat; rt.kick = f.kick; rt.bass = f.bass; rt.treble = f.treble; rt.level = f.level; rt.onset = f.onset; rt.style = f.style;
      if (P.analyser) {
        const an = P.analyser; if (!freq || freq.length !== an.frequencyBinCount) freq = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(freq); const nyq = (an.context.sampleRate || 44100) / 2, bins = freq.length;
        for (let b = 0; b < 32; b++) {
          const f0 = 40 * Math.pow(16000 / 40, b / 32), f1 = 40 * Math.pow(16000 / 40, (b + 1) / 32);
          const i0 = Math.min(bins - 1, Math.floor((f0 / nyq) * bins)), i1 = Math.min(bins, Math.max(i0 + 1, Math.ceil((f1 / nyq) * bins)));
          let m = 0; for (let i = i0; i < i1; i++) m = Math.max(m, freq[i]); m /= 255;
          maxBand[b] = Math.max(m, maxBand[b] * (1 - dt * 0.15), 0.12);
          const v = P.isPlaying ? clamp(m / maxBand[b]) : 0;
          rt.bands[b] += (v - rt.bands[b]) * (1 - Math.exp(-dt * (v > rt.bands[b] ? 30 : 9)));
        }
      } else rt.bands.fill(0);
      const tgt = PALETTES[f.style];
      for (let i = 0; i < 4; i++) for (let c = 0; c < 3; c++) rt.palette[i][c] += (tgt[i][c] - rt.palette[i][c]) * (1 - Math.exp(-dt * 2.5));

      // ---- stage director
      stage.force = P.forceTier && P.forceTier !== 'auto' ? P.forceTier : null;
      const st = stage.update({ dt, t: T, beats, beat: f.beat, kick: f.kick, onset: f.onset, level: f.level, bass: f.bass, treble: f.treble, intensity: f.intensity, bpm: f.bpm, silent: idle, style: f.style, vocalMode: f.vocalMode });
      if (rt.reduced) { st.prop.strobe = 0; st.flash = 0; }
      rt.st = st;
      const sleepy = clamp((audio.silence - 8) / 3);

      // ---- vocal turn-taking (as the original stage)
      const vocalNow = !idle && f.vocalMode !== 'none';
      if (vocalNow && !wasVocal) { if (T - lastVocalEnd > 1) singer = 1 - singer; vocalStart = T; }
      if (!vocalNow && wasVocal) lastVocalEnd = T;
      if (vocalNow && ly.active !== null && ly.idx !== lyricIdx && ly.idx >= 0) singer = Math.floor(ly.idx / 2) % 2;
      if (vocalNow && ly.active === null && T - vocalStart > 16 && f.beat && f.beatCount % 4 === 0) { singer = 1 - singer; vocalStart = T; }
      lyricIdx = ly.idx; wasVocal = vocalNow;
      const duet = vocalNow && f.intensity > 1.25;
      if (f.syllable) syl = 1; else syl *= Math.exp(-dt * 14);

      // ---- dance selection every 16 beats / on a style change / on a drop at peak
      if (dancers.length && !hadDances) { hadDances = true; block = -1; }
      const blk = Math.floor(beats / 16);
      const newBlock = f.style !== style || blk !== block || (st.drop && st.tier === 'peak');
      if (!idle && newBlock) {
        style = f.style; block = blk; switchedAt = T;
        const eT = clamp(st.eSlow * 1.15);
        if (dances && dancers.length) {
          const a = pickDance(dances.metas, f.style, eT, recent[0]);
          const unison = Math.random() < 0.35;
          const b = unison ? a : pickDance(dances.metas, f.style, vocalNow && singer === 1 ? eT * 0.6 : eT, recent[1].concat(a ? [a.id] : []));
          [a, b].forEach((m, i) => { if (m) { dancers[i].start(m, f.bpm || 110, 0.5, unison ? 0.2 : undefined); recent[i].push(m.id); if (recent[i].length > 6) recent[i].shift(); } });
        } else {
          const list = MOVES[f.style], a = Math.floor(Math.random() * list.length);
          moveIx = [a, Math.random() < 0.4 ? a : (a + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length];
        }
      } else if (dancers.length && !idle && Math.abs((f.bpm || 0) - lastBpm) > 5) { lastBpm = f.bpm; dancers.forEach(d => d.retime(f.bpm || 110)); }
      if (idle) style = null;
      void hadDrop;

      // ---- camera snaps (Lumi)
      const lumiSinging = vocalNow && (duet || singer === 1);
      if (!idle && !lumiSinging && f.style !== 'zen' && T - lastSnap > 5 && ((f.kick > 0.9 && f.intensity > 1.3) || (f.beat && f.beatCount % 16 === 8 && Math.random() < 0.45))) { snapAt = T; lastSnap = T; }
      const sa = T - snapAt;
      const camUp = sa < 0.15 ? sa / 0.15 : sa < 0.6 ? 1 : sa < 0.9 ? 1 - (sa - 0.6) / 0.3 : 0;
      const flash = sa > 0.25 && sa < 0.55 ? 1 - (sa - 0.25) / 0.3 : 0;

      // ---- formation: closer in quiet, wider at peak, the singer steps forward
      const spread = st.tier === 'quiet' || st.tier === 'silent' ? 230 : st.tier === 'peak' ? 430 : 340;
      for (let i = 0; i < 2; i++) {
        const sing = vocalNow && (duet || singer === i);
        const tx = 800 + (i ? 1 : -1) * spread, ty = FLOOR_Y + (sing ? 26 : 0), ts = FIG * (sing ? 1.07 : 1);
        const k = 1 - Math.exp(-dt * 1.8);
        place[i].x += (tx - place[i].x) * k; place[i].y += (ty - place[i].y) * k; place[i].s += (ts - place[i].s) * k;
        rt.feet[i].x = place[i].x; rt.feet[i].y = place[i].y;
      }

      // ---- poses
      const amp = 0.55 + 0.45 * clamp(f.level);
      const ctxMove: MoveCtx = { t: T, B: f.beats, ph: f.beatPhase, amp, kick: f.kick, f };
      for (let i = 0; i < 2; i++) {
        const kind = i === 0 ? 'lorik' : 'lumi';
        let target: Pose;
        const performing = vocalNow && (duet || singer === i);
        if (idle) target = idlePose(T, i, sleepy);
        else {
          target = { ...REST };
          const mocap = dancers.length && dancers[i].current && dancers[i].step(dt, target);
          if (!mocap) { const mv = MOVES[f.style][moveIx[i] % MOVES[f.style].length]; target = pose(mv.fn({ ...ctxMove, t: T + i * 0.37 })); }
          if (mocap) target.glow = st.tier === 'peak' ? 0.35 + 0.4 * f.kick : 0;
        }
        // the face: an emotion chosen from what the music is doing (and the character), with real blinks
        const em = emotions[i].update({
          dt, t: T, tier: st.tier, silent: idle, asleep: idle && sleepy > 0.5, singing: performing, vocalEnv: f.vocalEnv, sustain: f.vocalMode === 'sustain',
          kick: f.kick, beat: f.beat, beats, drop: st.drop, snapped: i === 1 && sa >= 0 && sa < 0.1, eFast: st.eFast,
        });
        applyExpression(target, em, { partnerSide: i ? -1 : 1 });
        if (!idle) {
          if (performing) target = performVocal(target, f.vocalMode, { ...ctxMove, env: f.vocalEnv, syl, pitch: f.pitch }, kind);
          else if (vocalNow) { target.lookX = 0.8 * (i ? -1 : 1); }
          if (i === 1 && camUp > 0) { target.camUp = camUp; target.armL = -158 * camUp + target.armL * (1 - camUp); target.armR = -158 * camUp + target.armR * (1 - camUp); target.closed = 0; target.happy = 0; }
        }
        const settle = T - switchedAt < 0.45 ? 9 : idle ? 14 : 26;
        const next = follow(cur[i], target, dt, settle);
        next.mouth = target.mouth; next.eyeOpen = target.eyeOpen; next.camUp = target.camUp; next.spin = target.spin;   // fast channels stay crisp
        cur[i] = next;
      }

      // ---- particles
      const mouthAt = (i: number) => { const p = cur[i], m = i ? -1 : 1; return { x: place[i].x + m * (p.x + p.headX) * place[i].s, y: place[i].y + (p.y + p.headY - 140) * place[i].s }; };
      if (vocalNow) {
        for (const i of duet ? [0, 1] : [singer]) {
          const m = mouthAt(i), out = i === 0 ? -1 : 1;
          if (f.vocalMode === 'rap') {
            if (f.syllable) { const words = (ly.text || '').split(/\s+/).filter(Boolean); const g = words.length ? words[wordIx++ % words.length] : pick(['♪', 'yo', '♫', 'uh!']); spawn(m.x + out * 30, m.y, g, pick(['#FF5AA5', '#00C2FF', '#FFD400']), { vx: out * rnd(60, 160), vy: rnd(-120, -60), g: 40, max: 1.1, size: words.length ? 30 : 34, r: rnd(-0.25, 0.25), vr: rnd(-0.5, 0.5) }); }
          } else {
            emitAcc += dt * (2 + 10 * f.vocalEnv) * (f.vocalMode === 'run' ? 1.8 : 1);
            while (emitAcc > 1) { emitAcc -= 1; spawn(m.x + out * 26, m.y, pick(['♪', '♫', '♬', '♩']), pick([KAIJU_PALETTES[i ? 'lumi' : 'lorik'].frillTop, '#FF5AA5', '#C99BFF']), { vx: out * rnd(30, 110), vy: rnd(-140, -70), max: 1.8, sway: rnd(1, 2.5), size: rnd(28, 44), r: rnd(-0.3, 0.3) }); }
          }
        }
      } else if (idle && sleepy > 0.5) {
        zAcc += dt * 0.9; while (zAcc > 1) { zAcc -= 1; const i = Math.random() < 0.5 ? 0 : 1; spawn(place[i].x + (i ? -60 : 60), place[i].y - 230 * place[i].s, pick(['z', 'Z', 'z']), '#9C88E8', { vx: i ? -14 : 14, vy: -32, max: 3, sway: 1, size: rnd(26, 40) }); }
      }
      if (!idle && duet && Math.random() < dt * 2) spawn(800 + rnd(-120, 120), 560, '♥', pick(['#FF4F8B', '#D40055', '#FF8A3A']), { vy: rnd(-90, -50), max: 2, sway: 1.5, size: rnd(30, 46) });
      void ambientAcc;

      // ---- spotlight target + camera
      const featured = vocalNow ? singer : Math.floor(beats / 16) % 2;
      rt.spot.x += (place[featured].x - rt.spot.x) * (1 - Math.exp(-dt * 3)); rt.spot.y += (place[featured].y - 150 - rt.spot.y) * (1 - Math.exp(-dt * 3));
      const headOf = (i: number) => ({ x: place[i].x, y: place[i].y - 170 * place[i].s });
      camera.force = (live.current as any).forceShot ?? null;
      const cam = camera.update({ dt, beats, kick: f.kick, eFast: st.eFast }, { headA: headOf(0), headB: headOf(1), tier: st.tier, drop: st.drop, ball: st.prop.ball, singer: vocalNow ? (duet ? -1 : singer) : -1 });

      // ================================ draw ================================
      if (!baseDone) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#050309'; ctx.fillRect(0, 0, cw, ch); return; }
      // pick the sprite resolution for this zoom
      const wantHi = cam.zoom > 1.9 && !!lodHi[0];
      if (wantHi !== usingHi && (wantHi ? lodHi[0] : lodLow[0])) { usingHi = wantHi; fig[0]!.setSprites((wantHi ? lodHi : lodLow)[0]!); fig[1]!.setSprites((wantHi ? lodHi : lodLow)[1]!); }

      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#050309'; ctx.fillRect(0, 0, cw, ch);
      ctx.setTransform(fit.s, 0, 0, fit.s, fit.ox, fit.oy);
      ctx.translate(800, 450); ctx.rotate(cam.roll); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.cx, -cam.cy);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

      set.drawBack(ctx, rt);

      const order = place[0].y <= place[1].y ? [0, 1] : [1, 0];
      for (const i of order) {
        const p = cur[i], out = i === 0 ? p : mirrorPose(p);
        // glossy floor reflection (the figure upside-down under the feet)
        if (quality !== 'low') {
          ctx.save(); ctx.translate(place[i].x, place[i].y + 6); ctx.scale(place[i].s, -place[i].s * 0.82); ctx.globalAlpha = 0.17 * (1 - 0.6 * st.dim);
          fig[i]!.draw(ctx, { ...out, y: Math.max(out.y, -140) }, { shadow: 'rgba(0,0,0,0)', aura: false }); ctx.restore();
        }
        ctx.save(); ctx.translate(place[i].x, place[i].y); ctx.scale(place[i].s, place[i].s);
        fig[i]!.draw(ctx, out, { flash: i === 1 ? flash : 0, shadow: 'rgba(0,0,0,0.38)' }); ctx.restore();
      }

      // particles (notes, words, hearts, zzz)
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 34px ${FONT}`;
      for (const p of parts) {
        if (!p.on) continue;
        p.life += dt; if (p.life >= p.max) { p.on = false; continue; }
        p.vy += p.g * dt; p.x += (p.vx + (p.sway ? Math.sin(p.life * p.sway * 3) * 30 : 0)) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        const u = p.life / p.max, sc = (u < 0.12 ? 0.4 + 0.6 * (u / 0.12) : 1) * p.size / 34;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(sc, sc); ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        ctx.fillStyle = p.color; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 0; ctx.fillText(p.glyph, 0, 0); ctx.restore();
      }
      ctx.globalAlpha = 1;
      set.drawFront(ctx, rt);
      set.drawDim(ctx, rt);

      // ---- screen space: vignette + lyric caption
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (vignette) ctx.drawImage(vignette, 0, 0, cw, ch);
      const showCap = vocalNow && !!ly.text; if (showCap) caption = ly.text.length > 64 ? ly.text.slice(0, 62) + '…' : ly.text;
      captionA += ((showCap ? 1 : 0) - captionA) * (1 - Math.exp(-dt * 8));
      if (captionA > 0.02 && caption) {
        const fs = Math.max(14, Math.round(ch * 0.042)); ctx.font = `800 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(caption).width + fs * 1.6, bx = cw / 2 - tw / 2, by = ch - fs * 3.1;
        ctx.globalAlpha = captionA * 0.78; ctx.fillStyle = 'rgba(10,6,20,0.85)'; ctx.beginPath(); ctx.roundRect(bx, by, tw, fs * 1.9, fs * 0.95); ctx.fill();
        ctx.globalAlpha = captionA; ctx.fillStyle = '#fff'; ctx.fillText(caption, cw / 2, by + fs * 0.98); ctx.globalAlpha = 1;
      }

      // ---- HUD (throttled React state)
      if (now - hudAt > 300) {
        hudAt = now;
        const who = idle ? (sleepy > 0.5 ? 'Napping… press play' : 'Waiting for music') : vocalNow ? (duet ? 'Duet!' : `${NAMES[singer]} sings · ${NAMES[1 - singer]} dances`) : 'Both dancing';
        const props = (['ball', 'heads', 'lasers', 'speakers'] as const).filter(k => st.prop[k] > 0.5).join(' · ') || (st.spot > 0.5 ? 'follow-spot' : '—');
        setHud({ style: f.style, tier: st.tier, who, dance: dancers.map(d => d.current?.name ?? '').filter(Boolean).join(' / ') || (idle ? '' : 'hand-made moves'), shot: cam.kind, bpm: Math.round(f.bpm), prop: props });
      }
      (window as any).__kaiju2d && ((window as any).__kaiju2d.cam = cam);
    };
    (window as any).__kaiju2d = { camera, stage, rt, place, cur, set };
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const meta = STYLE_META[hud.style];
  return (
    <div ref={hostRef} className={props.className ?? 'w-full h-full relative'} style={{ background: '#050309', overflow: 'hidden', position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {!ready && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.55)', fontFamily: FONT, fontSize: 13, fontWeight: 700 }}>Lorik &amp; Lumi are getting ready…</div>}
      {props.showHud !== false && (
        <div style={{ position: 'absolute', left: 14, bottom: 14, right: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', pointerEvents: 'none', fontFamily: FONT }}>
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

export default KaijuStage2D;
void useMemo;
