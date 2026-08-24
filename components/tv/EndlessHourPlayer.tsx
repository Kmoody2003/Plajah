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

/** How long one shader dissolves into the next. Long, like everything else here — the field
 *  should morph, never cut. */
const CROSSFADE_MS = 4500;

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
  /**
   * The shaders currently on screen. Normally one; during a phase change, two — the outgoing field
   * held beneath while the incoming one dissolves in over CROSSFADE_MS. Swapping the field used to
   * be a hard cut: a new program compiled and the picture jumped, which on a channel whose whole
   * premise is that nothing arrives suddenly was the visual equivalent of the audio jump-scares.
   * Now the fields morph into one another.
   */
  const [layers, setLayers] = useState<Array<{ shader: StillnessShader; startMs: number; key: number; on: boolean }>>([]);
  const layerKey = useRef(0);
  // Errors are tracked PER LAYER, not globally. During a crossfade two ShaderLayers are mounted; a
  // single global flag let one layer's failure blank the whole stack (and it only cleared on the
  // next successful compile — minutes later), which showed as the field intermittently "not
  // rendering". Per-layer, a failed layer is simply skipped while the good one keeps drawing, and
  // the 2D fallback appears only if EVERY layer fails (a true WebGL failure).
  const [errored, setErrored] = useState<Record<number, boolean>>({});
  const [programme, setProgramme] = useState<GenerativeProgramme | null>(null);
  const [mode, setMode] = useState<SolaMode>('stream');
  const [notice, setNotice] = useState<{ which: 'open' | 'close'; at: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const phaseRef = useRef('');
  const shaderSeed = useRef(0);
  /** Four uniforms as ONE array, mutated in place — ShaderLayer's loop closes over it, so a new
   *  array every frame would never reach the GPU. */
  const uniforms = useRef<number[]>([0.5, 0, 1, 0]);

  // NOTE: the meditation shaders are deliberately NOT gated on prefers-reduced-motion. They are
  // built to the photosensitivity spec (see stillnessShaders.ts) — no strobing, no zoom, motion
  // that slows to ~0.05 screen-widths/sec at depth — and they ARE the channel. Suppressing them to
  // a bare glow when a viewer has reduce-motion on made the whole visual disappear (which is what
  // happened on every machine with the OS flag set). The WebGL-failure fallback below still stands.
  const useShader = !!analyser && layers.some((l) => !errored[l.key]);

  /** Per-layer shader outcome. ShaderLayer calls this with a message on compile failure and with
   *  null on success, so a layer that recovers clears itself. Failures are logged so a real GLSL
   *  problem is diagnosable rather than silent. */
  const onLayerError = useCallback((key: number, m: string | null) => {
    setErrored((e) => {
      if (m) {
        if (e[key]) return e;
        console.warn('[endless-hour] shader layer failed:', m);
        return { ...e, [key]: true };
      }
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }, []);

  /**
   * Bring a new shader on screen by dissolving it over whatever is already there.
   *
   * The newcomer mounts at opacity 0 on top, then flips on next frame so the CSS transition
   * actually animates; the outgoing field stays beneath at full opacity until the dissolve is done
   * and is then dropped, so the stack never holds more than two.
   */
  const pushShaderLayer = useCallback((s: StillnessShader) => {
    const key = ++layerKey.current;
    setLayers((prev) => [...prev, { shader: s, startMs: performance.now(), key, on: prev.length === 0 }].slice(-2));
    requestAnimationFrame(() =>
      setLayers((prev) => prev.map((l) => (l.key === key ? { ...l, on: true } : l))),
    );
    window.setTimeout(
      () => setLayers((prev) => (prev.length > 1 ? prev.slice(-1) : prev)),
      CROSSFADE_MS + 200,
    );
  }, []);

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
        // Start silent and swell in, always — a channel that begins at full level begins with an
        // entrance, which is the one thing this channel is not allowed to do.
        master.gain.value = 0;
        if (!muted) master.gain.setTargetAtTime(1, ctx.currentTime, 1.4);
        masterRef.current = master;

        // A gentle master limiter is the hard backstop behind every "nothing arrives loud" rule.
        // Whatever the ensemble, the pulse or a handoff does, a transient physically cannot pass
        // this — so a burst that startled someone can never happen, by construction rather than by
        // getting every envelope perfect. Slow enough not to pump the drone; fast enough to catch
        // a spike before it leaves the speaker.
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -4;
        limiter.knee.value = 6;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.006;
        limiter.release.value = 0.3;
        master.connect(limiter);
        limiter.connect(ctx.destination);

        // ── A morphing delay/echo bus ────────────────────────────────────────────
        // Dry stays master→limiter above; this is a parallel WET send that a slow LFO fades in and
        // out, so the echoes come and go rather than washing constantly. Dark and diffuse, folded
        // back on itself gently. It hits the SAME limiter, so wet + dry can never add up to loud.
        const delay = ctx.createDelay(1.5);
        delay.delayTime.value = 0.42;
        const fb = ctx.createGain(); fb.gain.value = 0.34;          // feedback → a few repeats, not forever
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000; // dark echoes
        const wet = ctx.createGain(); wet.gain.value = 0.09;        // base wet, then the LFO rides it
        master.connect(delay);
        delay.connect(lp);
        lp.connect(fb); fb.connect(delay);                          // feedback loop through the filter
        lp.connect(wet); wet.connect(limiter);
        // The LFO: a ~110 s cycle, so the echo tail breathes in and out over minutes. Native, so it
        // needs no JS loop and cannot stall. Range ≈ 0.02 … 0.18 wet.
        const lfo = ctx.createOscillator(); lfo.frequency.value = 1 / 110;
        const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.08;
        lfo.connect(lfoAmt); lfoAmt.connect(wet.gain);
        lfo.start();

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

        // Load the Inflection Points config (song pool + policy) so real songs can crossfade in on
        // the channel. Lazily imported to keep backendService out of this component's static graph;
        // a failure (or no config) just leaves the channel purely generative.
        const config = await import('../../services/backendService')
          .then((m) => m.fetchEndlessHourConfig())
          .catch(() => undefined);
        if (!alive) { void ctx.close(); return; }

        const eh = new EndlessHour({
          ctx,
          destination: an,
          noticesEnabled,
          config,
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
              // field — and a Sola burst gets its own, because its seed is its own. The new field
              // dissolves over the old rather than replacing it.
              pushShaderLayer(shaderForPhase(f.state.phase, f.isSola ? f.programme.seed ^ 0x5bf03635 : f.programme.seed));
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

  if (failed) {
    return (
      <div className="absolute inset-0 grid place-items-center" style={{ background: '#0D0B14' }}>
        <p className="text-[12px] text-white/40">The Endless Hour could not start — {failed}</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#0D0B14' }}>
      {useShader && analyser ? (
        <div className="absolute inset-0" aria-hidden="true">
          {layers.filter((l) => !errored[l.key]).map((l) => (
            <div
              key={l.key}
              className="absolute inset-0"
              style={{ opacity: l.on ? 1 : 0, transition: `opacity ${CROSSFADE_MS}ms linear` }}
            >
              <ShaderLayer
                analyser={analyser}
                source={l.shader.src}
                startTimeMs={l.startMs}
                params={uniforms.current}
                sanctuary
                onError={(m) => onLayerError(l.key, m as string | null)}
              />
            </div>
          ))}
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
