// KaijuDanceStage — Lorik & Lumi dance to whatever is playing, on white, in front of a Plajah logo
// that pulses to the beat.
//
// Director rules:
//   • style (zen / edm / rock / ballet) comes from KaijuAudio (or a forced preset); each kaiju picks
//     a move from that style's book every two bars — sometimes in mirrored sync, sometimes not;
//   • when vocals are detected, ONE kaiju performs (sing / rap / sustain / run) while the other keeps
//     dancing and watches; turns swap on each new vocal phrase (or every two lyric lines when the
//     track has time-coded lyrics); big choruses become a duet;
//   • Lumi snaps photos (camera up + flash) on drops; Lorik reads lyrics from his LORIK book;
//   • silence → idle breathing → dozing with z's.
//
// Pure component: give it an AnalyserNode and (optionally) a song clock + lyrics. KaijuFxStage wires
// it to the global player.

import React, { useEffect, useRef, useState } from 'react';
import { KaijuFigure, KAIJU_PALETTES, type KaijuRig } from './KaijuFigure';
import { KaijuAudio, type KaijuFeatures, type KaijuStyle, type VocalMode } from './kaijuAudio';
import { MOVES, STYLE_META, performVocal, idlePose, type MoveCtx } from './kaijuChoreo';
import { type Pose, REST, pose, follow, mirrorPose, clamp, pulse } from './kaijuPose';
import KaijuClipLayer from './KaijuClipLayer';

export type LyricLine = { time: number; text: string };

export interface KaijuDanceStageProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  /** Current song position in seconds (for lyric sync). */
  getTime?: () => number;
  lyrics?: LyricLine[] | null;
  /** true when `lyrics` are real time codes (they then also drive vocal detection). */
  lyricsTimed?: boolean;
  genre?: string;
  style?: KaijuStyle | 'auto';
  forceVocal?: VocalMode | null;
  showHud?: boolean;
  fpsCap?: number;
  className?: string;
  onFeatures?: (f: KaijuFeatures) => void;
  /** Play the Kling reference videos (beat-cut by mood) instead of the code-built puppets. */
  clips?: boolean;
}

const W = 1600, H = 900;
const FLOOR = 832, SCALE = 1.5;
const HOME = [{ x: 290 }, { x: 1310 }];
const LOGO = { x: 800, y: 590 };
const FONT = "'Outfit','Poppins','Nunito','Segoe UI',system-ui,sans-serif";
const NP = 96, NR = 7;

type Particle = { on: boolean; x: number; y: number; vx: number; vy: number; g: number; life: number; max: number; r: number; vr: number; s: number; sway: number };

const NAMES = ['Lorik', 'Lumi'] as const;
const MODE_VERB: Record<VocalMode, string> = { none: 'dancing', sing: 'sings', rap: 'raps', sustain: 'holds the note', run: 'riffs' };

export const KaijuDanceStage: React.FC<KaijuDanceStageProps> = (props) => {
  const live = useRef(props);
  live.current = props;

  const rigA = useRef<KaijuRig>(null), rigB = useRef<KaijuRig>(null);
  const logoRef = useRef<SVGGElement>(null), chevRef = useRef<SVGGElement>(null), sceneRef = useRef<SVGGElement>(null);
  const tintStop = useRef<SVGStopElement>(null), tintRef = useRef<SVGCircleElement>(null), flashRef = useRef<SVGRectElement>(null);
  const ringRefs = useRef<(SVGCircleElement | null)[]>([]);
  const partRefs = useRef<(SVGTextElement | null)[]>([]);
  const bubbleRef = useRef<SVGGElement>(null), bubbleRect = useRef<SVGRectElement>(null), bubbleTail = useRef<SVGPathElement>(null), bubbleTail2 = useRef<SVGPathElement>(null), bubbleText = useRef<SVGTextElement>(null);
  const [hud, setHud] = useState({ style: 'ballet' as KaijuStyle, who: 'Warming up…', bpm: 0, move: '' });
  const featRef = useRef<KaijuFeatures | null>(null);
  const [clipLabel, setClipLabel] = useState('');

  useEffect(() => {
    const audio = new KaijuAudio();
    const cur: Pose[] = [{ ...REST }, { ...REST }];
    const parts: Particle[] = Array.from({ length: NP }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, r: 0, vr: 0, s: 1, sway: 0 }));
    const rings = Array.from({ length: NR }, () => ({ on: false, age: 0, max: 1.2, color: '#D40055', amp: 1 }));
    let pi = 0, ri = 0;
    let raf = 0, last = performance.now(), T = 0, lastDraw = 0, hudAt = 0;
    let style: KaijuStyle | null = null, block = -1;
    const moveIx = [0, 1];
    let switchedAt = -9;
    let singer = 1, wasVocal = false, vocalStart = 0, lastVocalEnd = -9, duet = false, duetSince = -1;
    let lyricIdx = -1;
    let snapAt = -9, lastSnap = -9;
    const blink = [{ next: 1.5, at: -9 }, { next: 2.7, at: -9 }];
    let syl = 0, emitAcc = 0, ambientAcc = 0, zAcc = 0, wordIx = 0;
    let bubbleKey = '', bubbleOn = 0;

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

    const spawn = (x: number, y: number, glyph: string, color: string, o: Partial<Particle> & { size?: number; weight?: number } = {}) => {
      const el = partRefs.current[pi]; const p = parts[pi]; pi = (pi + 1) % NP;
      if (!el) return;
      Object.assign(p, { on: true, x, y, vx: 0, vy: -60, g: 0, life: 0, max: 1.6, r: 0, vr: 0, s: 1, sway: 0 }, o);
      el.textContent = glyph;
      el.setAttribute('fill', color);
      el.setAttribute('font-size', String(o.size ?? 34));
      el.setAttribute('font-weight', String(o.weight ?? 900));
    };
    const ring = (color: string, amp = 1, max = 1.2) => { const r = rings[ri]; ri = (ri + 1) % NR; Object.assign(r, { on: true, age: 0, max, color, amp }); };

    /** World position of a kaiju's mouth (approx.) for particle emission. */
    const mouthAt = (i: number) => {
      const p = cur[i], m = i ? -1 : 1;
      return { x: HOME[i].x + m * (p.x + p.headX) * SCALE, y: FLOOR + (p.y + p.headY - 140) * SCALE };
    };

    const linesNow = (t: number) => {
      const L = live.current.lyrics; if (!L || !L.length) return { idx: -1, text: '', active: null as boolean | null };
      let i = -1; for (let k = 0; k < L.length; k++) { if (t >= L[k].time) i = k; else break; }
      if (i < 0) return { idx: -1, text: '', active: live.current.lyricsTimed ? false : null };
      const text = (L[i].text || '').trim();
      const end = L[i + 1]?.time ?? L[i].time + 6;
      const active = live.current.lyricsTimed ? !!text && t < Math.min(end, L[i].time + 9) : null;
      return { idx: i, text, active };
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const P = live.current;
      if (P.fpsCap && P.fpsCap > 0 && now - lastDraw < 1000 / P.fpsCap - 1) return;
      lastDraw = now;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;

      const songT = P.getTime ? P.getTime() : T;
      const ly = linesNow(songT);
      const f = audio.sample(P.analyser, P.isPlaying, dt, {
        lyricActive: ly.active, genre: P.genre,
        forceStyle: P.style && P.style !== 'auto' ? P.style : null, forceVocal: P.forceVocal ?? null,
      });
      P.onFeatures?.(f);
      featRef.current = f;
      const idle = f.silent;
      const sleepy = clamp((audio.silence - 8) / 3);

      // ── move selection: new block every 2 bars, or immediately on a style change ──
      const blk = Math.floor(f.beats / 8);
      if (f.style !== style || blk !== block) {
        const list = MOVES[f.style];
        const changed = f.style !== style;
        style = f.style; block = blk;
        const a = Math.floor(Math.random() * list.length);
        const b = Math.random() < 0.4 ? a : (a + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
        if (changed || Math.random() < 0.85) { moveIx[0] = a; moveIx[1] = b; switchedAt = T; }
      }

      // ── vocal turn-taking ──
      const vocalNow = !idle && f.vocalMode !== 'none';
      if (vocalNow && !wasVocal) { if (T - lastVocalEnd > 1.0) singer = 1 - singer; vocalStart = T; }
      if (!vocalNow && wasVocal) lastVocalEnd = T;
      if (vocalNow && ly.active !== null && ly.idx !== lyricIdx && ly.idx >= 0) { singer = Math.floor(ly.idx / 2) % 2; }
      if (vocalNow && ly.active === null && T - vocalStart > 16 && f.beat && f.beatCount % 4 === 0) { singer = 1 - singer; vocalStart = T; }
      lyricIdx = ly.idx; wasVocal = vocalNow;
      if (vocalNow && f.intensity > 1.22) { if (duetSince < 0) duetSince = T; if (T - duetSince > 1.5) duet = true; }
      else { duetSince = -1; if (!vocalNow || f.intensity < 1.08) duet = false; }
      if (f.syllable) syl = 1; else syl *= Math.exp(-dt * 14);

      // ── camera snaps (Lumi) ──
      const lumiSinging = vocalNow && (duet || singer === 1);
      if (!idle && !lumiSinging && f.style !== 'zen' && T - lastSnap > 5 &&
        ((f.kick > 0.9 && f.intensity > 1.3) || (f.beat && f.beatCount % 16 === 8 && Math.random() < 0.45))) { snapAt = T; lastSnap = T; }
      const sa = T - snapAt;
      const camUp = sa < 0.15 ? sa / 0.15 : sa < 0.6 ? 1 : sa < 0.9 ? 1 - (sa - 0.6) / 0.3 : 0;
      const flash = sa > 0.25 && sa < 0.55 ? 1 - (sa - 0.25) / 0.3 : 0;
      if (sa > 0.25 && sa < 0.25 + dt * 1.5) {
        for (let k = 0; k < 6; k++) spawn(HOME[1].x - cur[1].x * SCALE, FLOOR + (cur[1].y - 167) * SCALE, pick(['✦', '✧', '★']), pick(['#FFC94D', '#FF8A3A', '#FFFFFF']),
          { vx: rnd(-160, 160), vy: rnd(-200, -60), g: 120, max: 1, size: rnd(22, 36) });
      }

      // ── poses ──
      const amp = 0.55 + 0.45 * clamp(f.level);
      const ctx: MoveCtx = { t: T, B: f.beats, ph: f.beatPhase, amp, kick: f.kick, f };
      for (let i = 0; i < 2; i++) {
        const kind = i === 0 ? 'lorik' : 'lumi';
        let target: Pose;
        if (idle) target = idlePose(T, i, sleepy);
        else {
          const mv = MOVES[f.style][moveIx[i] % MOVES[f.style].length];
          target = pose(mv.fn({ ...ctx, t: T + i * 0.37 }));
          const performing = vocalNow && (duet || singer === i);
          if (performing) target = performVocal(target, f.vocalMode, { ...ctx, env: f.vocalEnv, syl, pitch: f.pitch }, kind);
          else if (vocalNow) { target.lookX = 0.8; target.happy = Math.max(target.happy, 0.4); }
          if (i === 1 && camUp > 0) { target.camUp = camUp; target.armL = -158 * camUp + target.armL * (1 - camUp); target.armR = -158 * camUp + target.armR * (1 - camUp); target.closed = 0; target.happy = 0; }
        }
        // blink
        const b = blink[i];
        if (T > b.next) { b.at = T; b.next = T + rnd(2, 5.5); }
        const bt = T - b.at; if (bt < 0.14) target.eyeOpen *= Math.abs(bt / 0.07 - 1);
        const settle = T - switchedAt < 0.45 ? 7 : 18;
        const next = follow(cur[i], target, dt, settle);
        // fast channels follow tightly so mouths and blinks stay crisp
        next.mouth = target.mouth; next.eyeOpen = target.eyeOpen; next.camUp = target.camUp; next.spin = Math.abs(target.spin - cur[i].spin) > 0.9 ? target.spin : next.spin;
        cur[i] = next;
        const out = i === 0 ? next : mirrorPose(next);
        (i === 0 ? rigA : rigB).current?.apply(out, i === 1 ? { flash } : undefined);
      }

      // ── particles: singer notes / rap words / style ambience ──
      const meta = STYLE_META[f.style];
      if (vocalNow) {
        const who = duet ? [0, 1] : [singer];
        for (const i of who) {
          const m = mouthAt(i), out = i === 0 ? -1 : 1;
          if (f.vocalMode === 'rap') {
            if (f.syllable) {
              const words = (ly.text || '').split(/\s+/).filter(Boolean);
              const g = words.length ? words[wordIx++ % words.length] : pick(['♪', 'yo', '♫', 'uh!']);
              spawn(m.x + out * 30, m.y, g, pick(['#4B1D73', '#D40055', '#6B0099']), { vx: out * rnd(60, 160), vy: rnd(-120, -60), g: 40, max: 1.1, size: words.length ? 30 : 34, r: rnd(-15, 15), vr: rnd(-30, 30) });
            }
          } else {
            emitAcc += dt * (2 + 10 * f.vocalEnv) * (f.vocalMode === 'run' ? 1.8 : 1);
            while (emitAcc > 1) {
              emitAcc -= 1;
              const pal = KAIJU_PALETTES[i === 0 ? 'lorik' : 'lumi'];
              spawn(m.x + out * 26, m.y, pick(['♪', '♫', '♬', '♩']), pick([pal.frillIn, pal.frillOut, '#6B0099']),
                { vx: out * rnd(30, 110), vy: rnd(-140, -70), max: 1.8, sway: rnd(1, 2.5), size: rnd(28, 44), r: rnd(-20, 20) });
            }
          }
        }
      }
      if (!idle) {
        if (f.style === 'edm' && f.beat) for (let k = 0; k < 7; k++) spawn(LOGO.x + rnd(-260, 260), FLOOR - 10, pick(['■', '▲', '●', '◆']), pick(['#FF2E9A', '#00C2FF', '#FFD400', '#8A2BFF', '#00E0A0']),
          { vx: rnd(-220, 220), vy: rnd(-620, -380), g: 700, max: 1.6, size: rnd(16, 28), vr: rnd(-400, 400) });
        if (f.style === 'rock' && f.beat && f.beatCount % 2 === 0) for (let k = 0; k < 2; k++) spawn(LOGO.x + rnd(-420, 420), rnd(160, 420), pick(['⚡', '★', '✶']), pick(['#FF6A2A', '#D40055', '#FFB000']),
          { vx: rnd(-60, 60), vy: rnd(-60, 20), g: 160, max: 1, size: rnd(30, 52), r: rnd(-25, 25) });
        ambientAcc += dt * (f.style === 'ballet' ? 4.5 : f.style === 'zen' ? 2.2 : 0);
        while (ambientAcc > 1) {
          ambientAcc -= 1;
          if (f.style === 'ballet') spawn(rnd(40, W - 40), -20, pick(['❀', '✿', '✧', '❁']), pick(['#FF9EC7', '#F5B7D0', '#E7B04B', '#C99BFF']),
            { vx: rnd(-20, 20), vy: rnd(40, 80), max: 7, sway: rnd(1, 2), size: rnd(18, 34), vr: rnd(-40, 40) });
          else spawn(rnd(60, W - 60), FLOOR + 20, pick(['✦', '•', '❀', '✧']), pick(['#8FE3C9', '#B7A6F2', '#FFC4DD', '#9CD6FF']),
            { vy: rnd(-45, -25), max: 6, sway: rnd(0.5, 1.2), size: rnd(14, 26) });
        }
        if (duet && Math.random() < dt * 2) spawn(LOGO.x + rnd(-120, 120), 360, '♥', pick(['#FF4F8B', '#D40055', '#FF8A3A']), { vy: rnd(-90, -50), max: 2, sway: 1.5, size: rnd(30, 46) });
      } else if (sleepy > 0.5) {
        zAcc += dt * 0.9;
        while (zAcc > 1) { zAcc -= 1; const i = Math.random() < 0.5 ? 0 : 1; spawn(HOME[i].x + (i ? -60 : 60), FLOOR - 230 * SCALE, pick(['z', 'Z', 'z']), '#8C7AC6', { vx: i ? -14 : 14, vy: -32, max: 3, sway: 1, size: rnd(26, 40), weight: 800 }); }
      }
      for (let k = 0; k < NP; k++) {
        const p = parts[k], el = partRefs.current[k];
        if (!el) continue;
        if (!p.on) { if (el.getAttribute('opacity') !== '0') el.setAttribute('opacity', '0'); continue; }
        p.life += dt; if (p.life >= p.max) { p.on = false; el.setAttribute('opacity', '0'); continue; }
        p.vy += p.g * dt; p.x += (p.vx + (p.sway ? Math.sin(p.life * p.sway * 3) * 30 : 0)) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        const u = p.life / p.max, sc = p.s * (u < 0.12 ? 0.4 + 0.6 * (u / 0.12) : 1);
        el.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.r.toFixed(1)}) scale(${sc.toFixed(2)})`);
        el.setAttribute('opacity', (u > 0.7 ? (1 - u) / 0.3 : 1).toFixed(2));
      }

      // ── logo pulse, ripples, tint, shake, flash ──
      const bp = pulse(f.beatPhase, 7);
      const s = idle ? 1 + 0.015 * Math.sin(T * 1.4)
        : f.style === 'zen' ? 1 + 0.03 * Math.sin(T * 0.9) + 0.035 * f.kick
          : 1 + 0.075 * f.kick * (0.6 + 0.4 * f.bass) + 0.025 * bp;
      // In clip mode the video fills the middle, so the logo becomes a pulsing title badge above the heads
      // (multiply-blended video would otherwise muddy the faces with purple).
      logoRef.current?.setAttribute('transform', live.current.clips
        ? `translate(${LOGO.x} 95) scale(${(0.42 * s).toFixed(3)}) translate(0 110)`
        : `translate(${LOGO.x} ${LOGO.y - 110}) scale(${s.toFixed(3)}) translate(0 110)`);
      chevRef.current?.setAttribute('transform', `translate(${(idle ? 0 : 12 * f.kick).toFixed(1)} 0)`);
      if (!idle && (f.style === 'zen' || f.style === 'ballet' ? f.beat && f.beatCount % 2 === 0 : f.kick > 0.98 || f.beat)) ring(meta.ripple, f.style === 'zen' ? 0.5 : 1, f.style === 'zen' ? 2.6 : 1.3);
      for (let k = 0; k < NR; k++) {
        const r = rings[k], el = ringRefs.current[k]; if (!el) continue;
        if (!r.on) { el.setAttribute('opacity', '0'); continue; }
        r.age += dt; const u = r.age / r.max; if (u >= 1) { r.on = false; el.setAttribute('opacity', '0'); continue; }
        el.setAttribute('cy', String(live.current.clips ? 120 : LOGO.y - 110));
        el.setAttribute('r', (200 + 620 * Math.pow(u, 0.7)).toFixed(1));
        el.setAttribute('stroke', r.color);
        el.setAttribute('stroke-width', (14 * (1 - u) + 2).toFixed(1));
        el.setAttribute('opacity', (0.28 * r.amp * (1 - u)).toFixed(3));
      }
      tintStop.current?.setAttribute('stop-color', idle ? '#E9E2FF' : meta.tint);
      tintRef.current?.setAttribute('opacity', (idle ? 0.25 : 0.32 + 0.3 * f.kick).toFixed(2));
      const shake = !idle && f.style === 'rock' ? f.kick * 7 : !idle && f.style === 'edm' ? f.kick * 2.5 : 0;
      sceneRef.current?.setAttribute('transform', shake ? `translate(${rnd(-shake, shake).toFixed(1)} ${rnd(-shake, shake).toFixed(1)})` : '');
      flashRef.current?.setAttribute('opacity', (flash * 0.45).toFixed(2));

      // ── lyric bubble above the performer ──
      const showBubble = vocalNow && !!ly.text;
      bubbleOn += ((showBubble ? 1 : 0) - bubbleOn) * (1 - Math.exp(-dt * 10));
      if (bubbleRef.current) {
        if (showBubble) {
          const txt = ly.text.length > 46 ? ly.text.slice(0, 44) + '…' : ly.text;
          const key = `${txt}|${duet ? 'd' : singer}`;
          const bw = clamp(txt.length * 17 + 70, 180, 820);
          const cx = duet ? LOGO.x : clamp(HOME[singer].x + (singer ? -90 : 90), bw / 2 + 20, W - bw / 2 - 20);
          if (key !== bubbleKey) {
            bubbleKey = key;
            bubbleText.current!.textContent = txt;
            bubbleRect.current!.setAttribute('x', String(-bw / 2)); bubbleRect.current!.setAttribute('width', String(bw));
            const tx = duet ? 0 : clamp(HOME[singer].x - cx, -bw / 2 + 40, bw / 2 - 40), lean = duet ? 0 : singer ? 10 : -10;
            bubbleTail.current!.setAttribute('d', `M ${tx - 18} 38 L ${tx + lean} 78 L ${tx + 18} 38 Z`);
            bubbleTail2.current!.setAttribute('d', `M ${tx - 15} 34 L ${tx + lean * 0.8} 72 L ${tx + 15} 34 Z`);
          }
          bubbleRef.current.setAttribute('transform', `translate(${cx} ${200 + 4 * Math.sin(T * 2)}) scale(${(0.6 + 0.4 * bubbleOn).toFixed(3)})`);
        }
        bubbleRef.current.setAttribute('opacity', bubbleOn.toFixed(2));
      }

      // ── HUD (throttled React state) ──
      if (now - hudAt > 300) {
        hudAt = now;
        const who = idle ? (sleepy > 0.5 ? 'Napping… press play' : 'Waiting for music')
          : vocalNow ? (duet ? `Duet! Both ${MODE_VERB[f.vocalMode]}` : `${NAMES[singer]} ${MODE_VERB[f.vocalMode]} · ${NAMES[1 - singer]} dances`)
            : 'Both dancing';
        const mv = MOVES[f.style][moveIx[0] % MOVES[f.style].length].name;
        setHud(h => (h.style === f.style && h.who === who && Math.abs(h.bpm - f.bpm) < 1 && h.move === mv ? h : { style: f.style, who, bpm: Math.round(f.bpm), move: mv }));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const meta = STYLE_META[hud.style];
  return (
    <div className={props.className ?? 'w-full h-full relative'} style={{ background: '#FFFFFF', overflow: 'hidden', position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
        <defs>
          <linearGradient id="kj-stage-chev" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6B0099" /><stop offset="50%" stopColor="#D40055" /><stop offset="100%" stopColor="#FF8C00" />
          </linearGradient>
          <radialGradient id="kj-stage-tint" cx="50%" cy="55%" r="55%">
            <stop ref={tintStop} offset="0" stopColor="#E9E2FF" stopOpacity={0.9} />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </radialGradient>
          <linearGradient id="kj-stage-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F4EEFB" stopOpacity={0} /><stop offset="1" stopColor="#F1E8FA" stopOpacity={1} />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="#FFFFFF" />
        <circle ref={tintRef} cx={LOGO.x} cy={480} r={760} fill="url(#kj-stage-tint)" opacity={0.25} />
        <rect x={0} y={FLOOR - 60} width={W} height={H - FLOOR + 60} fill="url(#kj-stage-floor)" />

        <g ref={sceneRef}>
          {Array.from({ length: NR }, (_, k) => (
            <circle key={k} ref={el => { ringRefs.current[k] = el; }} cx={LOGO.x} cy={LOGO.y - 110} r={200} fill="none" opacity={0} />
          ))}

          {/* Plajah logo — chevron over the wordmark, pulsing to the beat */}
          <g ref={logoRef} transform={`translate(${LOGO.x} ${LOGO.y})`}>
            <g ref={chevRef}>
              <g transform="translate(-90 -300) scale(1.8)">
                <path d="M30 20 L70 50 L30 80" stroke="url(#kj-stage-chev)" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>
            </g>
            <text x={0} y={0} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={230} fill="#6B0099" letterSpacing={-4}>Plajah</text>
          </g>

          <g style={{ display: props.clips ? 'none' : undefined }}>
            <g transform={`translate(${HOME[0].x} ${FLOOR}) scale(${SCALE})`}><KaijuFigure ref={rigA} kind="lorik" /></g>
            <g transform={`translate(${HOME[1].x} ${FLOOR}) scale(${SCALE})`}><KaijuFigure ref={rigB} kind="lumi" flipTail /></g>
          </g>

          <g style={{ pointerEvents: 'none', display: props.clips ? 'none' : undefined }} fontFamily={FONT}>
            {Array.from({ length: NP }, (_, k) => (
              <text key={k} ref={el => { partRefs.current[k] = el; }} textAnchor="middle" dominantBaseline="central" opacity={0} />
            ))}
          </g>

          <g ref={bubbleRef} opacity={0} style={{ pointerEvents: 'none' }}>
            <path ref={bubbleTail} d="M -18 38 L -10 78 L 18 38 Z" fill="#FFFFFF" stroke="#6B0099" strokeWidth={4} strokeLinejoin="round" />
            <rect ref={bubbleRect} x={-150} y={-42} width={300} height={84} rx={42} fill="#FFFFFF" stroke="#6B0099" strokeWidth={4} />
            <path ref={bubbleTail2} d="M -15 34 L -8 72 L 15 34 Z" fill="#FFFFFF" />
            <text ref={bubbleText} x={0} y={2} textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontWeight={700} fontSize={34} fill="#3B1A5C" />
          </g>
        </g>
        <rect ref={flashRef} width={W} height={H} fill="#FFFFFF" opacity={0} style={{ pointerEvents: 'none' }} />
      </svg>

      {props.clips && <KaijuClipLayer features={featRef} isPlaying={props.isPlaying} onSegment={setClipLabel} />}

      {props.showHud !== false && (
        <div style={{ position: 'absolute', left: 14, bottom: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', pointerEvents: 'none', fontFamily: FONT }}>
          <span style={{ background: '#FFFFFF', border: '2px solid #6B0099', color: '#3B1A5C', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 800, boxShadow: '0 6px 18px rgba(107,0,153,.12)' }}>
            {meta.emoji} {meta.label}{props.style && props.style !== 'auto' ? '' : ' · auto'}
          </span>
          <span style={{ background: '#6B0099', color: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700 }}>{props.clips ? `🎬 ${clipLabel || 'Rolling…'}` : hud.who}</span>
          {hud.bpm > 0 && <span style={{ color: '#8C7AA8', fontSize: 11, fontWeight: 700 }}>{hud.bpm} BPM{props.clips ? '' : ` · ${hud.move}`}</span>}
        </div>
      )}
    </div>
  );
};

export default KaijuDanceStage;
