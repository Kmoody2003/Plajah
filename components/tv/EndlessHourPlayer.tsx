// Channel 8.1, on screen.
//
// There is no video element here and no url, because there is no file. The picture is a Pixels
// shader and the sound is the Vela ensemble, both reading the same emotional state — which is
// what keeps them in step without either one analysing the other.
//
// THE NOTICE
//
// When a burst begins, the viewer is told once, quietly, forty seconds in — never before it has
// begun, because announcing a moment before it exists is advertising. It fades in over four
// seconds, holds for six, fades out over six, and retires permanently after the third time. A
// notice that keeps explaining is a notice nobody reads.
//
// The copy deliberately does not dwell on the loss. An early draft leaned on "this will never
// exist again", which tested as activating rather than settling — the wrong nervous system
// response for the one channel whose entire job is the other one.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ShaderLayer from '../plajahPixels/components/ShaderLayer';
import { shaderForPhase, type StillnessShader } from '../plajahPixels/engine/presets/stillnessShaders';
import { EndlessHour } from '../../services/fast/endlessHour';
import { SOLA_COPY, NOTICE_TIMING } from '../../services/fast/sola';
import type { GenerativeProgramme } from '../../services/fast/generativeChannel';
import type { SolaMode } from '../../services/fast/solaController';

/** The register the channel speaks in. `default` was chosen over `plainest` because spelling out
 *  that nobody else is hearing it invites the viewer to think about the ending. */
const COPY = SOLA_COPY.default;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Props {
  muted?: boolean;
  /** Notices are a courtesy, not the product — off is a supported way to watch. */
  noticesEnabled?: boolean;
  onProgramme?: (p: GenerativeProgramme) => void;
}

export const EndlessHourPlayer: React.FC<Props> = ({ muted = false, noticesEnabled = true, onProgramme }) => {
  const channel = useRef<EndlessHour | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [shader, setShader] = useState<StillnessShader | null>(null);
  const [shaderStart, setShaderStart] = useState(0);
  const [shaderError, setShaderError] = useState<string | null>(null);
  const [programme, setProgramme] = useState<GenerativeProgramme | null>(null);
  const [mode, setMode] = useState<SolaMode>('stream');
  const [notice, setNotice] = useState<{ which: 'open' | 'close'; at: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const phaseRef = useRef('');
  const shaderSeed = useRef(0);
  /** Four uniforms as ONE array, mutated in place — ShaderLayer's loop closes over it, so a new
   *  array every frame would never reach the GPU. */
  const uniforms = useRef<number[]>([0.5, 0, 1, 0]);
  const reduced = useRef(prefersReducedMotion());

  const useShader = !!analyser && !!shader && !shaderError && !reduced.current;

  // ── The channel ────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    let raf = 0;

    (async () => {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        await ctx.resume();
        if (!alive) { void ctx.close(); return; }
        ctxRef.current = ctx;

        const master = ctx.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(ctx.destination);
        masterRef.current = master;

        // ShaderLayer's contract wants an AnalyserNode, but nothing reads it — iBass/iMid/
        // iTreble stay at zero. A drone has no transients, so analysing it returns noise; both
        // engines subscribe to the emotional state instead, which is also what makes an offline
        // render identical to a live one.
        const an = ctx.createAnalyser();
        an.fftSize = 2048;
        // A one-second window, roughly. The shaders use these bands only to shimmer — never for
        // layout — and at the default 0.8 even a drone's spectrum jitters enough to be visible
        // as flicker on a field this slow. See `voice()` in stillnessShaders.
        an.smoothingTimeConstant = 0.92;
        an.connect(master);
        setAnalyser(an);

        const eh = new EndlessHour({
          ctx,
          destination: an,
          noticesEnabled,
          onModeChange: setMode,
          onNotice: (which) => setNotice({ which, at: performance.now() }),
          onProgramme: (p) => { setProgramme(p); onProgramme?.(p); },
        });
        channel.current = eh;
        await eh.start();
        if (!alive) { eh.stop(); return; }

        // The field follows the PHASE. Swapping it mid-phase would be an event, and an arc is
        // meant to contain exactly one of those.
        shaderSeed.current = eh.nowPlaying.seed;
        phaseRef.current = '';
        setShaderStart(performance.now());

        const pump = () => {
          if (!alive) return;
          const f = eh.frame();
          if (f) {
            const u = f.sampler.uniforms();
            uniforms.current[0] = u.uBreath;
            uniforms.current[1] = u.uDepth;
            uniforms.current[2] = u.uCalm;
            uniforms.current[3] = u.uBloom;
            if (f.state.phase !== phaseRef.current) {
              phaseRef.current = f.state.phase;
              // Seeded from the PROGRAMME, so every viewer on the shared side sees the same
              // field — and a Sola burst gets its own, because its seed is its own.
              setShader(shaderForPhase(f.state.phase, f.isSola ? f.programme.seed ^ 0x5bf03635 : f.programme.seed));
            }
          }
          raf = requestAnimationFrame(pump);
        };
        pump();
      } catch (e) {
        if (alive) setFailed(String((e as Error)?.message ?? e));
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      channel.current?.stop();
      channel.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
    // Deliberately mounts once. Changing notices or the callback mid-session would tear down a
    // running channel, and this is the one surface where a restart is the visible failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = masterRef.current;
    const ctx = ctxRef.current;
    if (m && ctx) m.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.15);
  }, [muted]);

  // ── The canvas fallback ────────────────────────────────────────────────────
  // Not dead code: this is the reduced-motion path and the WebGL-failure path, and it reads the
  // SAME uniforms, so the two can never disagree about what the channel is doing.
  useEffect(() => {
    if (useShader) return;
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const eh = channel.current;
      if (canvas && eh) {
        const ctx2d = canvas.getContext('2d');
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (ctx2d && w > 1) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
          const u = eh.sampler.uniforms();
          const lum = eh.sampler.luminance;
          // Never fully black — a black frame reads as the channel having died.
          ctx2d.fillStyle = `rgb(${Math.round(6 + lum * 14)},${Math.round(5 + lum * 12)},${Math.round(10 + lum * 20)})`;
          ctx2d.fillRect(0, 0, w, h);
          // The glow does NOT breathe in size — see the note in StillnessDeep. Breath is in
          // its opacity, which is felt without being watched.
          const base = Math.min(w, h) * (0.34 + u.uDepth * 0.22);
          const r = base * 0.88;
          const g = ctx2d.createRadialGradient(w / 2, h * 0.52, 0, w / 2, h * 0.52, r);
          g.addColorStop(0, `rgba(190,175,255,${(0.07 + lum * 0.14 + u.uBreath * 0.07).toFixed(3)})`);
          g.addColorStop(1, 'rgba(190,175,255,0)');
          ctx2d.fillStyle = g;
          ctx2d.fillRect(0, 0, w, h);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [useShader]);

  // ── The notice ─────────────────────────────────────────────────────────────
  const [noticeOpacityNow, setNoticeOpacityNow] = useState(0);
  useEffect(() => {
    if (!notice) return;
    let raf = 0;
    const { fadeInSec, holdSec, fadeOutSec } = NOTICE_TIMING;
    const total = fadeInSec + holdSec + fadeOutSec;
    const step = () => {
      const t = (performance.now() - notice.at) / 1000;
      if (t >= total) { setNoticeOpacityNow(0); setNotice(null); return; }
      const o = t < fadeInSec ? t / fadeInSec
        : t < fadeInSec + holdSec ? 1
        : 1 - (t - fadeInSec - holdSec) / fadeOutSec;
      setNoticeOpacityNow(Math.max(0, Math.min(1, o)));
      raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  }, [notice]);

  const onShaderError = useCallback((m: string) => setShaderError(m), []);

  if (failed) {
    return (
      <div className="absolute inset-0 grid place-items-center" style={{ background: '#0D0B14' }}>
        <p className="text-[12px] text-white/40">The Endless Hour could not start — {failed}</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#0D0B14' }}>
      {useShader && analyser && shader ? (
        <div className="absolute inset-0" aria-hidden="true">
          <ShaderLayer
            analyser={analyser}
            source={shader.src}
            startTimeMs={shaderStart}
            params={uniforms.current}
            sanctuary
            onError={onShaderError}
          />
        </div>
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
      )}

      {/* The programme name, bottom left, small. A generative channel that hides what is on
          reads as broken; one that labels every moment reads as a demo. */}
      <div className="absolute bottom-6 left-6 pointer-events-none select-none">
        <div className="text-[10px] tracking-[0.18em] text-white/30 uppercase">
          8.1 · The Endless Hour
        </div>
        {programme && (
          <div className="text-[15px] font-light text-white/70 mt-0.5" style={{ fontFamily: 'Georgia, serif' }}>
            {programme.title}
          </div>
        )}
      </div>

      {/* Sola. Present but unobtrusive — a dot, not a banner. */}
      {mode !== 'stream' && (
        <div
          className="absolute bottom-[26px] right-6 w-1.5 h-1.5 rounded-full pointer-events-none"
          style={{ background: '#D0BCFF', opacity: 0.75, transition: 'opacity 1.2s' }}
          aria-hidden="true"
        />
      )}

      {notice && (
        <div
          className="absolute inset-x-0 bottom-24 flex justify-center px-8 pointer-events-none"
          style={{ opacity: noticeOpacityNow }}
          role="status"
        >
          <div className="text-center">
            <p
              className="text-[15px] font-light text-white/70 leading-relaxed"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              {notice.which === 'open' ? COPY.open : COPY.close}
            </p>
            {/* The sub-line belongs only to the opening. The closing line is past tense and is
                the whole point of that moment — anything under it explains a feeling rather
                than leaving it. */}
            {notice.which === 'open' && (
              <p className="text-[11px] tracking-[0.14em] uppercase text-white/30 mt-1.5">{COPY.sub}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EndlessHourPlayer;
