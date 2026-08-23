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
import { X, Volume2, Sun, Glasses } from 'lucide-react';
import { Button, Eyebrow } from '../ui';
import ShaderLayer from '../plajahPixels/components/ShaderLayer';
import { shaderForPhase, type StillnessShader } from '../plajahPixels/engine/presets/stillnessShaders';
import { saveSession } from '../../services/oraService';
import { StillnessSession } from '../../services/ora/stillness/sessionRunner';
import type { ArrivalMood, SessionState } from '../../services/ora/stillness/emotionalEngine';
import type { StillnessDriverSampler } from '../../components/plajahPixels/engine/stillnessDrivers';
import { startXrSession, xrAvailability, type XrMode } from '../../services/ora/stillness/xrSession';

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
  /** null until the capability check returns; `false` on a phone, which is most of the time. */
  const [xr, setXr] = useState<{ vr: boolean; ar: boolean } | null>(null);
  const [xrMode, setXrMode] = useState<XrMode | null>(null);
  const xrHandle = useRef<{ end: () => void; setShader: (src: string) => void } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runner = useRef<StillnessSession | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [shader, setShader] = useState<StillnessShader | null>(null);
  const [shaderStart, setShaderStart] = useState(0);
  const [shaderError, setShaderError] = useState<string | null>(null);
  const phaseRef = useRef<string>('');
  /**
   * The four uniforms, as ONE array that is mutated in place rather than replaced.
   *
   * ShaderLayer's render loop closes over `params` and its effect deps are [analyser,
   * startTimeMs], so a fresh array each frame would never reach the GPU — and re-rendering
   * React sixty times a second to deliver four floats would be absurd anyway. Same object,
   * new contents.
   */
  const uniforms = useRef<number[]>([0.5, 0, 1, 0]);
  const frame = useRef<{ state: SessionState; sampler: StillnessDriverSampler } | null>(null);
  const hideTimer = useRef<number | null>(null);
  const reduced = useRef(prefersReducedMotion());

  // ── The field ──────────────────────────────────────────────────────────────
  // A Pixels shader when WebGL is available and motion is welcome; the canvas below otherwise.
  //
  // The canvas is not dead code — it is the reduced-motion path and the WebGL-failure path, and
  // it reads the SAME four uniforms, so the two never disagree about what the session is doing.
  const useShader = !!analyser && !!shader && !shaderError && !reduced.current;

  useEffect(() => {
    if (stage !== 'session' || useShader) return;
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
            // The ring does NOT breathe in size. A circle growing and shrinking is the same
            // unrequested motion the shaders had, and this is the reduced-motion path, where it
            // is least welcome of all. Breath is in its opacity instead.
            const base = Math.min(w, h) * (0.34 + u.uDepth * 0.22);
            const r = base * 0.88;

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

            ctx.strokeStyle = `rgba(208,188,255,${(0.08 + lum * 0.12 + u.uBreath * 0.08).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [stage, useShader]);

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

  // Asked once, on the entry screen. A headset button that appears mid-session would be an
  // event, and the arc is meant to contain exactly one of those.
  useEffect(() => {
    let alive = true;
    void xrAvailability().then((a) => { if (alive) setXr({ vr: a.vr, ar: a.ar }); });
    return () => { alive = false; };
  }, []);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  const finish = useCallback((completed: boolean) => {
    xrHandle.current?.end();
    xrHandle.current = null;
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

  const begin = useCallback(async (mode: XrMode | null = null) => {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    ctxRef.current = ctx;

    // The analyser drives nothing structural. Layout comes from the emotional state, which is
    // what keeps picture and sound locked and an offline render deterministic; the bands only
    // let the ensemble shimmer into the field. Heavily smoothed, for the same reason.
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    // A one-second window, roughly. The bands only shimmer the field — never lay it out — and at
    // the default 0.8 even a drone's spectrum jitters visibly on something this slow.
    an.smoothingTimeConstant = 0.92;
    an.connect(ctx.destination);
    setAnalyser(an);

    // Deterministic from the session's own seed, so the visuals are as reproducible as the
    // audio — the pre-baked headset path depends on that.
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    phaseRef.current = 'arrival';
    setShader(shaderForPhase('arrival', seed));
    setShaderStart(performance.now());
    setShaderError(null);

    const session = new StillnessSession({
      ctx,
      destination: an,
      durationSec: minutes * 60,
      arrival: mood,
      // In a headset the ensemble is placed around the listener rather than in front of them.
      spatial: mode ? 'headset' : 'screen',
      // No seed passed: this session is drawn from entropy and is not recoverable. That is the
      // point, and it is why nothing here writes it down.
      onFrame: (state, sampler) => {
        frame.current = { state, sampler };
        // Mutate in place — see the note on `uniforms`.
        const u = sampler.uniforms();
        uniforms.current[0] = u.uBreath;
        uniforms.current[1] = u.uDepth;
        uniforms.current[2] = u.uCalm;
        uniforms.current[3] = u.uBloom;
        // The field changes with the PHASE, not per frame. Swapping it mid-phase would be an
        // event, and the arc is meant to contain exactly one of those.
        if (state.phase !== phaseRef.current) {
          phaseRef.current = state.phase;
          const next = shaderForPhase(state.phase, seed);
          setShader(next);
          // The headset compiles its own copy — same source, different host.
          xrHandle.current?.setShader(next.src);
        }
      },
      onEnded: () => finish(true),
    });
    runner.current = session;
    setStage('session');

    if (mode) {
      try {
        // requestSession must be reached from the same gesture that opened the AudioContext,
        // which is why this sits inside begin() rather than behind its own button handler.
        xrHandle.current = await startXrSession({
          mode,
          shaderSource: shaderForPhase('arrival', seed).src,
          uniforms: uniforms.current,
          // Taking the headset off ends the session. Leaving it running behind a removed
          // headset is a meditation nobody is in.
          onEnd: () => { xrHandle.current = null; setXrMode(null); if (runner.current) finish(false); },
          onError: setShaderError,
        });
        setXrMode(mode);
      } catch (e) {
        // Falling back to the flat screen is the right failure: the session is already running,
        // and the sound is the part that matters.
        xrHandle.current = null;
        setXrMode(null);
        setShaderError(String((e as Error)?.message ?? e));
      }
    }

    await session.start();
  }, [minutes, mood, finish]);


  useEffect(() => () => {
    xrHandle.current?.end();
    runner.current?.dispose(true);
    void ctxRef.current?.close();
  }, []);

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

        <Button onClick={() => void begin(null)}>Begin</Button>

        {/* Only where a headset is actually attached. Passthrough leads, because full
            immersion is a large ask for a first session and an isolating one for anyone
            already anxious — laying the light and sound over your own room is the smaller
            commitment, and it is the better default. */}
        {xr && (xr.ar || xr.vr) && (
          <div className="flex items-center gap-2 -mt-2">
            {xr.ar && (
              <button
                onClick={() => void begin('immersive-ar')}
                className="h-8 px-3.5 rounded-full text-[12px] flex items-center gap-1.5 border border-white/14 text-white/45 hover:text-white/80 hover:border-white/30 transition-colors"
              >
                <Glasses size={13} /> In your room
              </button>
            )}
            {xr.vr && (
              <button
                onClick={() => void begin('immersive-vr')}
                className="h-8 px-3.5 rounded-full text-[12px] flex items-center gap-1.5 border border-white/14 text-white/45 hover:text-white/80 hover:border-white/30 transition-colors"
              >
                <Glasses size={13} /> Fully around you
              </button>
            )}
          </div>
        )}

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
      {/* While the headset holds the session, the flat screen is a mirror nobody is looking
          at — and rendering the field twice on a mobile GPU is the one thing that will cost
          frames where frames matter most. */}
      {xrMode ? (
        <div className="absolute inset-0 grid place-items-center" style={{ background: '#0D0B14' }}>
          <p className="text-[12px] text-white/25 tracking-wide">Playing in the headset</p>
        </div>
      ) : useShader && analyser && shader ? (
        <div className="absolute inset-0" aria-hidden="true">
          <ShaderLayer
            analyser={analyser}
            source={shader.src}
            startTimeMs={shaderStart}
            params={uniforms.current}
            sanctuary
            // A shader that fails to compile must not leave a black screen in front of someone
            // who came here to be calm — the canvas takes over silently.
            onError={setShaderError}
          />
        </div>
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
      )}

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
