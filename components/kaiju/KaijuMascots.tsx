// KaijuMascots — Lorik & Lumi living in the Chora UI (outside the full visualizer).
//
//   <KaijuLogoDuo>      Header: the two kaiju flank the Plajah chevron next to the page title. They
//                       breathe, blink and follow your cursor; when music plays they bop to the beat,
//                       the logo pulses, Lorik mouths along to vocals and Lumi snaps the odd photo.
//                       Hover = wave + blush, click = Lorik's note burst / Lumi's camera flash.
//   <KaijuLoader>       "Tuning up…" — Lorik flips through his book while Lumi bounces.
//   <KaijuEmptyState>   Lumi peers through her camera (or Lorik reads) with a friendly message.
//   <KaijuPeek>         A kaiju pops up over the edge of a card and bops while music plays.
//   <KaijuSnapButton>   A like/save heart; Lumi leaps in and photographs the moment.
//
// Each piece drives KaijuFigure rigs from one requestAnimationFrame loop (no per-frame renders).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KaijuFigureSvg, type KaijuKind, type KaijuRig } from './KaijuFigure';
import { KaijuAudio, type KaijuFeatures } from './kaijuAudio';
import { type Pose, REST, pose, follow, mirrorPose, clamp, pulse } from './kaijuPose';
import { idlePose } from './kaijuChoreo';
import Logo from '../Logo';
import { useKaijuSignal } from './kaijuSignal';

// ── shared plumbing ──────────────────────────────────────────────────────────────────────────────

/** Player signal from <KaijuGlobalSignal> when mounted; silent idle otherwise. */
const usePlayerSignal = useKaijuSignal;

function useReducedMotionPref() {
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)'); if (!m) return;
    const on = () => setR(m.matches); m.addEventListener?.('change', on); return () => m.removeEventListener?.('change', on);
  }, []);
  return !!r;
}

/** rAF loop with dt; the callback is read through a ref so it can close over fresh props. */
function useLoop(cb: (t: number, dt: number) => void) {
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => {
    let raf = 0, last = performance.now(), t = 0;
    const tick = (now: number) => { raf = requestAnimationFrame(tick); const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt; ref.current(t, dt); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

class Blinker {
  next = 1 + Math.random() * 2; at = -9;
  eye(t: number) { if (t > this.next) { this.at = t; this.next = t + 2 + Math.random() * 3.5; } const b = t - this.at; return b < 0.14 ? Math.abs(b / 0.07 - 1) : 1; }
}

/** Fire-and-forget glyph burst (notes, sparkles, hearts) from a DOM element. */
export function burstFrom(host: HTMLElement | null, glyphs: string[], colors: string[], n = 6, spread = 70) {
  if (!host || typeof document === 'undefined') return;
  const r = host.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.textContent = glyphs[i % glyphs.length];
    s.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height * 0.35}px;pointer-events:none;z-index:9999;font-weight:900;font-size:${16 + Math.random() * 12}px;color:${colors[i % colors.length]};will-change:transform,opacity`;
    document.body.appendChild(s);
    const dx = (Math.random() - 0.5) * spread * 2, dy = -40 - Math.random() * spread;
    const a = s.animate([
      { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.4}px), calc(-50% + ${dy * 0.5}px)) scale(1.1)`, opacity: 1, offset: 0.25 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.9) rotate(${(Math.random() - 0.5) * 60}deg)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.3,1)' });
    a.onfinish = () => s.remove();
  }
}

// ── Header duo ───────────────────────────────────────────────────────────────────────────────────

interface DuoProps {
  /** Tailwind height classes for the whole row (match the PageHeader logo box). */
  className?: string;
}

export const KaijuLogoDuo: React.FC<DuoProps> = ({ className = 'h-10 sm:h-14 md:h-20 lg:h-40' }) => {
  const { analyser, isPlaying } = usePlayerSignal();
  const reduce = useReducedMotionPref();
  const rigs = [useRef<KaijuRig>(null), useRef<KaijuRig>(null)];
  const boxes = [useRef<HTMLButtonElement>(null), useRef<HTMLButtonElement>(null)];
  const logoRef = useRef<HTMLDivElement>(null);
  const st = useRef({
    audio: new KaijuAudio(), cur: [{ ...REST }, { ...REST }] as Pose[], blink: [new Blinker(), new Blinker()],
    hover: [false, false], pokeAt: [-9, -9], snapAt: -9, lastSnap: -9, mouse: { x: -1, y: -1 }, t: 0,
  });

  useEffect(() => {
    const mv = (e: PointerEvent) => { st.current.mouse = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('pointermove', mv, { passive: true });
    return () => window.removeEventListener('pointermove', mv);
  }, []);

  useLoop((t, dt) => {
    const S = st.current; S.t = t;
    const f: KaijuFeatures = S.audio.sample(analyser, isPlaying, dt);
    const grooving = isPlaying && !f.silent && !reduce;
    const amt = reduce ? 0.3 : 1;
    if (grooving && f.style !== 'zen' && t - S.lastSnap > 9 && f.beat && f.beatCount % 16 === 8) { S.snapAt = t; S.lastSnap = t; }
    const sa = t - S.snapAt;
    const camUp = sa < 0.15 ? sa / 0.15 : sa < 0.6 ? 1 : sa < 0.9 ? 1 - (sa - 0.6) / 0.3 : 0;
    const flash = sa > 0.25 && sa < 0.55 ? 1 - (sa - 0.25) / 0.3 : 0;

    for (let i = 0; i < 2; i++) {
      let p = idlePose(t, i, 0);
      if (grooving) {
        const ph = f.beatPhase, hop = Math.sin(Math.PI * ph), side = Math.floor(f.beats) % 2 ? 1 : -1;
        const z = f.style === 'zen' || f.style === 'ballet';
        p = pose({
          y: z ? -4 * Math.abs(Math.sin(t * 1.2)) : -10 * hop * (0.6 + 0.4 * f.level),
          sy: 1 - 0.06 * pulse(ph, 9), sx: 1 + 0.05 * pulse(ph, 9),
          headRot: (z ? 6 * Math.sin(t * 1.1 + i) : 7 * side * pulse(ph, 4)), rot: z ? 3 * Math.sin(t * 0.9 + i) : 3 * side,
          armL: z ? 70 + 40 * Math.sin(t * 1.1 + i) : 40 + 70 * hop, armR: z ? 70 + 40 * Math.sin(t * 1.1 + i + 1.4) : 40 + 70 * hop,
          happy: z ? 0 : 0.7, closed: z ? 0.85 : 0, smile: 0.7, blush: 0.5, tail: 14 * side, mane: 0.4 * f.kick,
        });
        if (f.vocalMode !== 'none' && i === 0) { p.mouth = 0.1 + 0.8 * f.vocalEnv; p.mic = 1; p.armL = -105; p.closed = f.vocalEnv > 0.7 ? 0.6 : 0; }
        if (i === 1 && camUp > 0) { p.camUp = camUp; p.armL = -158; p.armR = -158; p.happy = 0; p.closed = 0; }
      }
      // look at the cursor (canonical lookX: + = toward the logo)
      const box = boxes[i].current?.getBoundingClientRect();
      if (box && S.mouse.x >= 0) {
        const dx = (S.mouse.x - (box.left + box.width / 2)) / Math.max(200, window.innerWidth * 0.3);
        const dy = (S.mouse.y - (box.top + box.height * 0.45)) / 300;
        p.lookX = clamp(i ? -dx : dx, -1, 1); p.lookY = clamp(dy, -1, 1);
      }
      if (S.hover[i]) { p.armR = 150 + 18 * Math.sin(t * 14); p.happy = 1; p.blush = 1; p.smile = 1; p.closed = 0; }
      const pk = t - S.pokeAt[i];
      if (pk < 0.9) {
        const arc = Math.sin(Math.PI * clamp(pk / 0.55));
        p.y -= 34 * arc; p.armL = 160; p.armR = 160; p.happy = 1; p.mouth = 0.5 * arc; p.mane = arc;
        if (i === 0) p.book = 1;
      }
      p.y *= amt; p.headRot *= amt;
      p.eyeOpen *= S.blink[i].eye(t);
      const n = follow(S.cur[i], p, dt, 16); n.eyeOpen = p.eyeOpen; n.mouth = p.mouth; n.camUp = p.camUp; S.cur[i] = n;
      rigs[i].current?.apply(i === 0 ? n : mirrorPose(n), i === 1 ? { flash: Math.max(flash, pk < 0.35 ? 1 - pk / 0.35 : 0) } : undefined);
    }
    if (logoRef.current) {
      const s = grooving ? 1 + 0.08 * f.kick + 0.02 * pulse(f.beatPhase, 7) : 1 + 0.012 * Math.sin(t * 1.4);
      logoRef.current.style.transform = `scale(${s.toFixed(3)})`;
    }
  });

  const poke = (i: number) => {
    st.current.pokeAt[i] = st.current.t;
    if (i === 0) burstFrom(boxes[0].current, ['♪', '♫', '♬'], ['#C2187A', '#FF7A2E', '#6B0099'], 7);
    else burstFrom(boxes[1].current, ['✦', '✧', '★'], ['#FFB13D', '#FF8A3A', '#FFD27A'], 7);
  };

  const fig = (i: 0 | 1) => (
    <button
      ref={boxes[i]} type="button" aria-label={i === 0 ? 'Say hi to Lorik' : 'Say hi to Lumi'}
      onPointerEnter={() => { st.current.hover[i] = true; }} onPointerLeave={() => { st.current.hover[i] = false; }}
      onClick={() => poke(i)}
      className="h-full aspect-[4/5] shrink-0 bg-transparent border-0 p-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C00] rounded-2xl"
      style={{ marginInline: '-4%' }}
    >
      <KaijuFigureSvg ref={rigs[i]} kind={i === 0 ? 'lorik' : 'lumi'} flipTail={i === 1} className="w-full h-full" />
    </button>
  );

  return (
    <div className={`flex items-end shrink-0 mb-1 ${className}`}>
      {fig(0)}
      <div ref={logoRef} className="h-[78%] aspect-square shrink-0 self-center will-change-transform" style={{ transformOrigin: '50% 55%' }}>
        <Logo fluid />
      </div>
      {fig(1)}
    </div>
  );
};

// ── Loader ───────────────────────────────────────────────────────────────────────────────────────

export const KaijuLoader: React.FC<{ label?: string; className?: string; dark?: boolean }> = ({ label = 'Tuning up…', className = '', dark }) => {
  const a = useRef<KaijuRig>(null), b = useRef<KaijuRig>(null);
  const bl = useRef([new Blinker(), new Blinker()]);
  useLoop(t => {
    const flip = Math.sin(t * 5);
    a.current?.apply(pose({ book: 1, armL: -24, armR: -46 + 6 * flip, headRot: 6 * Math.sin(t * 2.5), headY: 3, lookY: 1, lookX: 0.4 * Math.sign(flip), smile: 0.3, eyeOpen: bl.current[0].eye(t), y: -2 * Math.abs(Math.sin(t * 2.5)) }));
    const hop = Math.abs(Math.sin(t * 4.2));
    b.current?.apply(mirrorPose(pose({ y: -18 * hop, sy: 1 - 0.08 * (1 - hop), armL: 60 + 80 * hop, armR: 60 + 80 * hop, happy: 1, smile: 1, tail: 12 * Math.sin(t * 4.2), eyeOpen: bl.current[1].eye(t) })));
  });
  return (
    <div className={`w-full h-full grid place-items-center ${className}`} role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-end gap-1" style={{ height: 96 }}>
          <KaijuFigureSvg ref={a} kind="lorik" style={{ height: 96, width: 80 }} />
          <KaijuFigureSvg ref={b} kind="lumi" flipTail style={{ height: 96, width: 80 }} />
        </div>
        <span className={`text-[10px] font-black uppercase tracking-[0.25em] ${dark ? 'text-[#6B0099]' : 'text-white/60'}`}>{label}</span>
      </div>
    </div>
  );
};

// ── Empty state ──────────────────────────────────────────────────────────────────────────────────

export const KaijuEmptyState: React.FC<{ kind?: KaijuKind; title: string; subtitle?: string; action?: React.ReactNode; className?: string }> = ({
  kind = 'lumi', title, subtitle, action, className = '',
}) => {
  const r = useRef<KaijuRig>(null);
  const bl = useRef(new Blinker());
  useLoop(t => {
    const scan = Math.sin(t * 0.8);
    const p = kind === 'lumi'
      // Lumi scans the room through her viewfinder, then lowers it to look at you.
      ? (Math.sin(t * 0.35) > -0.2
        ? pose({ camUp: 1, armL: -158, armR: -158, rot: 6 * scan, headRot: 5 * scan, x: 8 * scan, y: -2 * Math.abs(Math.sin(t * 1.6)) })
        : pose({ headRot: 10, lookX: 0.6, lookY: 0.3, smile: 0.2, blush: 0.7, armL: 14, armR: 20 + 6 * Math.sin(t * 3), eyeOpen: bl.current.eye(t) }))
      : pose({ book: 1, armL: -22, armR: -44, headRot: 5 * Math.sin(t * 0.7), headY: 3, lookY: 1, lookX: 0.35 * scan, eyeOpen: 0.8 * bl.current.eye(t), smile: 0.2, tail: 8 * scan });
    r.current?.apply(kind === 'lumi' ? mirrorPose(p) : p);
  });
  return (
    <div className={`flex flex-col items-center text-center gap-3 py-10 ${className}`}>
      <KaijuFigureSvg ref={r} kind={kind} flipTail={kind === 'lumi'} style={{ height: 150, width: 128 }} />
      <h4 className="text-lg font-black tracking-tight">{title}</h4>
      {subtitle && <p className="text-sm opacity-60 max-w-xs">{subtitle}</p>}
      {action}
    </div>
  );
};

// ── Peek ─────────────────────────────────────────────────────────────────────────────────────────

/** Drop inside a `relative` card. The kaiju rises above the top edge while music plays. */
export const KaijuPeek: React.FC<{ kind?: KaijuKind; side?: 'left' | 'right'; size?: number; active?: boolean }> = ({ kind = 'lorik', side = 'right', size = 72, active }) => {
  const { analyser, isPlaying } = usePlayerSignal();
  const on = active ?? isPlaying;
  const r = useRef<KaijuRig>(null), wrap = useRef<HTMLDivElement>(null);
  const S = useRef({ audio: new KaijuAudio(), rise: 0, cur: { ...REST } as Pose, bl: new Blinker() });
  useLoop((t, dt) => {
    const s = S.current;
    const f = s.audio.sample(analyser, on, dt);
    s.rise += ((on ? 1 : 0) - s.rise) * (1 - Math.exp(-dt * 6));
    const ph = f.silent ? (t * 1.8) % 1 : f.beatPhase, side2 = Math.floor(f.silent ? t * 1.8 : f.beats) % 2 ? 1 : -1;
    const p = pose({ armL: 150, armR: 150, headRot: 8 * side2 * pulse(ph, 4), y: -6 * Math.sin(Math.PI * ph), happy: 0.8, smile: 0.8, blush: 0.6, lookX: side === 'right' ? -0.6 : 0.6, eyeOpen: s.bl.eye(t), mane: 0.3 * f.kick });
    const n = follow(s.cur, p, dt, 16); n.eyeOpen = p.eyeOpen; s.cur = n;
    r.current?.apply(n);
    if (wrap.current) wrap.current.style.transform = `translateY(${((1 - s.rise) * 70 + 34).toFixed(1)}%)`;
  });
  return (
    <div aria-hidden="true" className="absolute bottom-full overflow-hidden pointer-events-none" style={{ [side]: 16, width: size, height: size * 0.62 } as React.CSSProperties}>
      <div ref={wrap} style={{ width: size, height: size * 1.2, transform: 'translateY(104%)' }}>
        <KaijuFigureSvg ref={r} kind={kind} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
};

// ── Snap-to-save button ──────────────────────────────────────────────────────────────────────────

export const KaijuSnapButton: React.FC<{ liked?: boolean; onToggle?: (liked: boolean) => void; className?: string }> = ({ liked: likedProp, onToggle, className = '' }) => {
  const [likedState, setLiked] = useState(false);
  const liked = likedProp ?? likedState;
  const r = useRef<KaijuRig>(null), btn = useRef<HTMLButtonElement>(null), lumiBox = useRef<HTMLDivElement>(null);
  const S = useRef({ at: -9, t: 0 });
  useLoop(t => {
    S.current.t = t;
    const a = t - S.current.at;
    const vis = a < 0.25 ? a / 0.25 : a < 1.3 ? 1 : a < 1.6 ? 1 - (a - 1.3) / 0.3 : 0;
    const cam = a > 0.25 && a < 1.2 ? 1 : 0;
    r.current?.apply(mirrorPose(pose({ camUp: cam, armL: cam ? -158 : 150, armR: cam ? -158 : 40, happy: cam ? 0 : 1, y: -10 * Math.sin(Math.PI * clamp(a / 0.3)) })),
      { flash: a > 0.55 && a < 0.85 ? 1 - (a - 0.55) / 0.3 : 0 });
    if (lumiBox.current) { lumiBox.current.style.opacity = vis.toFixed(2); lumiBox.current.style.transform = `translate(-50%, ${((1 - vis) * 30).toFixed(1)}px) scale(${(0.7 + 0.3 * vis).toFixed(2)})`; }
  });
  const click = useCallback(() => {
    const next = !liked;
    setLiked(next); onToggle?.(next);
    if (next) { S.current.at = S.current.t; window.setTimeout(() => burstFrom(btn.current, ['♥', '✦', '♥'], ['#FF4F8B', '#FFB13D', '#D40055'], 6, 50), 550); }
  }, [liked, onToggle]);
  return (
    <span className={`relative inline-flex ${className}`}>
      <div ref={lumiBox} aria-hidden="true" className="absolute bottom-full left-1/2 pointer-events-none" style={{ width: 64, height: 76, opacity: 0 }}>
        <KaijuFigureSvg ref={r} kind="lumi" flipTail style={{ width: '100%', height: '100%' }} />
      </div>
      <button ref={btn} type="button" onClick={click} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'}
        className={`w-10 h-10 rounded-full grid place-items-center text-lg transition-all ${liked ? 'bg-[#D40055] text-white scale-110' : 'bg-black/5 text-[#6B0099] hover:bg-black/10'}`}>
        {liked ? '♥' : '♡'}
      </button>
    </span>
  );
};
