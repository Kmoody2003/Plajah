// Ora — Stillness Deep. The immersive session.
//
// Stillness (the breathwork timer) is the surface you reach for when you want to be led. This
// is the one you reach for when you want to be left alone: no tracks, no narrator, sound and
// light generated live from a single emotional-engine state.
//
// The interface rules, all of which are constraints rather than preferences:
//
//   Two taps, then hands off. Opening a settings screen is a decision, and someone came here to
//   stop deciding. One question and one duration is the entire entry.
//
//   No numbers during the session. No countdown, no progress bar, no elapsed time. A visible
//   timer converts a meditation into a wait — people watch it, and watching it is the opposite
//   of the exercise. Time is expressed as light.
//
//   Controls decay, they do not hide. Everything fades after about six seconds of no input; a
//   touch anywhere brings back three controls and nothing else. Hiding makes people hunt, and
//   hunting is arousal.
//
//   There is no failure state. Nothing here counts a streak or notices a gap.
//
// Blueprint: docs/PLAJAH_WELLBEING_SUITE_BLUEPRINT.md

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Volume2, Sun } from 'lucide-react';
import { Button, Eyebrow } from '../ui';
import { saveSession } from '../../services/oraService';
import { StillnessSession } from '../../services/ora/stillness/sessionRunner';
import type { ArrivalMood, SessionState } from '../../services/ora/stillness/emotionalEngine';
import type { StillnessDriverSampler } from '../../components/plajahPixels/engine/stillnessDrivers';

type Stage = 'entry' | 'session' | 'ending';

/** Ora's existing five-point check-in, reused verbatim so the vocabulary matches the Room. */
const MOODS: Array<{ v: ArrivalMood; glyph: string; label: string }> = [
  { v: 1, glyph: '◔', label: 'Rough' },
  { v: 2, glyph: '◑', label: 'Low' },
  { v: 3, glyph: '◕', label: 'Steady' },
  { v: 4, glyph: '●', label: 'Good' },
  { v: 5, glyph: '◉', label: 'Bright' },
];

const DURATIONS = [5, 10, 20, 45] as const;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Props {
  onClose: () => void;
  /** The end of a session is the start of a journal entry, not a dashboard. */
  onWrite?: () => void;
}

export const StillnessDeep: React.FC<Props> = ({ onClose, onWrite }) => {
  const [stage, setStage] = useState<Stage>('entry');
  const [mood, setMood] = useState<ArrivalMood>(3);
  const [minutes, setMinutes] = useState<number>(10);
  const [controlsShown, setControlsShown] = useState(true);
  const [practised, setPractised] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runner = useRef<StillnessSession | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const frame = useRef<{ state: SessionState; sampler: StillnessDriverSampler } | null>(null);
  const hideTimer = useRef<number | null>(null);
  const reduced = useRef(prefersReducedMotion());

  // ── The field ──────────────────────────────────────────────────────────────
  // A stand-in for the Pixels shader, driven by exactly the same four uniforms the real one
  // binds. When the shader library gains its meditation families this is replaced by a
  // ShaderLayer and nothing above it changes.
  useEffect(() => {
    if (stage !== 'session') return;
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const f = frame.current;
      if (canvas && f) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const w = canvas.clientWidth, h = canvas.clientHeight;
          if (w > 1) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const u = f.sampler.uniforms();
            const lum = f.sampler.luminance;

            // Never fully black: a black frame reads as the stream having died.
            ctx.fillStyle = `rgb(${Math.round(6 + lum * 14)},${Math.round(5 + lum * 12)},${Math.round(10 + lum * 20)})`;
            ctx.fillRect(0, 0, w, h);

            const cx = w / 2;
            const cy = h * 0.52;
            // The field expands and contracts with the breath — the screen is doing the
            // exercise with you, same principle as Stillness's ring.
            const base = Math.min(w, h) * (0.34 + u.uDepth * 0.22);
            const r = base * (reduced.current ? 0.85 : 0.78 + u.uBreath * 0.26);

            // Chroma falls with arousal; deeper is closer to monochrome.
            const sat = 0.35 + (1 - u.uCalm) * 0.4;
            const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.9);
            g1.addColorStop(0, `rgba(${Math.round(150 + 60 * sat)},${Math.round(132 + 30 * sat)},${Math.round(210 + 40 * sat)},${(0.22 + lum * 0.3).toFixed(3)})`);
            g1.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g1;
            ctx.beginPath(); ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2); ctx.fill();

            // Light arrives where a sound arrived.
            if (u.uBloom > 0.01) {
              const bx = cx + f.sampler.bloomPan * w * 0.28;
              const by = cy - h * 0.06;
              const br = r * (0.3 + u.uBloom * 0.35);
              const g2 = ctx.createRadialGradient(bx, by, 0, bx, by, br);
              g2.addColorStop(0, `rgba(208,188,255,${(u.uBloom * 0.24).toFixed(3)})`);
              g2.addColorStop(1, 'rgba(208,188,255,0)');
              ctx.fillStyle = g2;
              ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
            }

            ctx.strokeStyle = `rgba(208,188,255,${(0.10 + lum * 0.14).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  // ── Controls decay ─────────────────────────────────────────────────────────
  const wake = useCallback(() => {
    setControlsShown(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsShown(false), 6000);
  }, []);

  useEffect(() => {
    if (stage !== 'session') return;
    wake();
    return () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); };
  }, [stage, wake]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  const begin = useCallback(async () => {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    ctxRef.current = ctx;

    const session = new StillnessSession({
      ctx,
      destination: ctx.destination,
      durationSec: minutes * 60,
      arrival: mood,
      // No seed passed: this session is drawn from entropy and is not recoverable. That is the
      // point, and it is why nothing here writes it down.
      onFrame: (state, sampler) => { frame.current = { state, sampler }; },
      onEnded: () => finish(true),
    });
    runner.current = session;
    setStage('session');
    await session.start();
  }, [minutes, mood]);

  const finish = useCallback((completed: boolean) => {
    const session = runner.current;
    const seconds = session ? Math.round(session.elapsed) : 0;
    setPractised(seconds);
    session?.dispose(!completed);
    runner.current = null;
    // Log what was practised, never what was planned — there is no failure state here, so a
    // session ended early is still a session.
    if (seconds >= 5) void saveSession({ kind: 'STILL', seconds, completed });
    setStage('ending');
    window.setTimeout(() => { void ctxRef.current?.close(); ctxRef.current = null; }, 5000);
  }, []);

  useEffect(() => () => { runner.current?.dispose(true); void ctxRef.current?.close(); }, []);

  // ── Entry ──────────────────────────────────────────────────────────────────
  if (stage === 'entry') {
    return (
      <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-7 px-6 text-center"
        style={{ background: 'radial-gradient(ellipse at 50% 42%, #1B1730 0%, #0D0B14 72%)' }}>
        <button onClick={onClose} aria-label="Close"
          className="absolute top-4 right-4 w-9 h-9 grid place-items-center rounded-full border border-white/12 text-white/40 hover:text-white">
          <X size={16} />
        </button>

        <Eyebrow>Stillness · Deep</Eyebrow>
        <h2 className="font-serif text-[clamp(1.6rem,5vw,2.3rem)] leading-tight text-white/90" style={{ fontWeight: 300 }}>
          How are you<br />arriving?
        </h2>

        <div className="flex gap-3">
          {MOODS.map((m) => (
            <button
              key={m.v}
              onClick={() => setMood(m.v)}
              aria-label={m.label}
              aria-pressed={mood === m.v}
              className="w-11 h-11 rounded-full grid place-items-center text-[17px] border transition-colors"
              style={{
                borderColor: mood === m.v ? '#D0BCFF' : 'rgba(255,255,255,0.14)',
                color: mood === m.v ? '#D0BCFF' : 'rgba(255,255,255,0.4)',
                background: mood === m.v ? 'rgba(208,188,255,0.10)' : 'transparent',
              }}
            >
              {m.glyph}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => setMinutes(d)}
              aria-pressed={minutes === d}
              className="px-3.5 h-8 rounded-full text-[12px] border transition-colors font-mono"
              style={{
                borderColor: minutes === d ? '#D0BCFF' : 'rgba(255,255,255,0.14)',
                color: minutes === d ? '#D0BCFF' : 'rgba(255,255,255,0.45)',
                background: minutes === d ? 'rgba(208,188,255,0.10)' : 'transparent',
              }}
            >
              {d}
            </button>
          ))}
        </div>

        <Button onClick={begin}>Begin</Button>

        <p className="text-[11px] text-white/25 max-w-[34ch] leading-relaxed">
          Nothing is recorded. The sound is made as you listen and is not kept.
        </p>
      </div>
    );
  }

  // ── Ending ─────────────────────────────────────────────────────────────────
  if (stage === 'ending') {
    const mins = Math.max(1, Math.round(practised / 60));
    return (
      <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 px-6 text-center"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, #16132A 0%, #0D0B14 70%)' }}>
        {/* Not a stats screen. One sentence, one optional door. */}
        <p className="font-serif text-[clamp(1.3rem,4vw,1.8rem)] leading-snug text-white/85" style={{ fontWeight: 300 }}>
          {mins} {mins === 1 ? 'minute' : 'minutes'}.<br />Nothing to do with them.
        </p>
        <div className="flex items-center gap-2">
          {onWrite && (
            <Button variant="secondary" onClick={() => { onWrite(); onClose(); }}>Write a line</Button>
          )}
          <Button variant="ghost" onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  // ── In session ─────────────────────────────────────────────────────────────
  return (
    <div
      className="absolute inset-0 z-40 overflow-hidden"
      onPointerDown={wake}
      onPointerMove={wake}
      style={{ background: '#0D0B14' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />

      {/* No timer, no progress bar, no elapsed time. Three controls, and they fade. */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 transition-opacity duration-[1200ms]"
        style={{ opacity: controlsShown ? 0.55 : 0 }}
      >
        <button
          onClick={() => finish(false)}
          aria-label="End session"
          className="w-11 h-11 rounded-full grid place-items-center border border-white/20 text-white/70 hover:text-white"
        >
          <X size={16} />
        </button>
        <span className="w-11 h-11 rounded-full grid place-items-center border border-white/12 text-white/35">
          <Volume2 size={15} />
        </span>
        <span className="w-11 h-11 rounded-full grid place-items-center border border-white/12 text-white/35">
          <Sun size={15} />
        </span>
      </div>
    </div>
  );
};

export default StillnessDeep;
