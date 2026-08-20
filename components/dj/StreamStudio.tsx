// StreamStudio — the Stream workspace of the DJ Console (Direction B).
//
// A mini broadcast switcher wired into the DJ audio engine. It composites a
// Program Out (audio-reactive Pixels backdrop + webcam PiP + now-playing lower
// third) from real input SOURCES — Webcam (getUserMedia), the Pixels visuals,
// and a Mic input (Web Audio meter + monitor + duck against the master bus) —
// and hands the combined MediaStream to the broadcast destinations (Reello /
// LiveTalk) and to a pop-out Output window for a projector or second screen.
//
// The audio it broadcasts is the SAME master bus the decks feed, tapped once via
// a MediaStreamAudioDestinationNode, plus the mic. Nothing here re-implements the
// mixer — it reads the engine the Booth workspace already drives.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Video, VideoOff, Mic, MicOff, Headphones, Radio, Monitor,
  ExternalLink, SlidersHorizontal, Plus, Waves, Music2, Signal,
} from 'lucide-react';
import {
  createDjBus, publishProgramStream, openDjOutputWindow, openDjControlsWindow,
  renderPixelsBackdrop, type DjProgramState, type DjBusMessage,
} from '../../services/djStreamBus';
// The REAL Plajah Pixels render core + generator/shader libraries.
import { Compositor } from '../plajahPixels/engine/core/compositor';
import { GeneratorRenderer, hasGenerator, hexToRgb } from '../plajahPixels/engine/core/generators';
import { ShaderRenderer } from '../plajahPixels/engine/core/shaderRenderer';
import { AudioTexture } from '../plajahPixels/engine/core/audioTexture';
import { SHADER_LIBRARY } from '../plajahPixels/components/ShaderPanel';

// ── The DJ Console's visual library ─────────────────────────────────────────────
// "Aurora Orbs" is the hand-made reactive backdrop (kept — people like it); the rest
// is the genuine Pixels library: built-in GPU generators + the shader gallery.
type Visual =
  | { id: string; name: string; cat: string; kind: 'orbs' }
  | { id: string; name: string; cat: string; kind: 'gen'; mode: string }
  | { id: string; name: string; cat: string; kind: 'shader'; src: string };

const GEN_MODES: [string, string][] = [
  ['TUNNEL', 'Tunnel'], ['VORTEX', 'Vortex'], ['NEBULA', 'Nebula'], ['COSMIC', 'Cosmic'],
  ['KALEIDOSCOPE', 'Kaleidoscope'], ['LIQUID', 'Liquid'], ['PARTICLES', 'Particles'], ['STORM', 'Storm'],
  ['LUMINANCE', 'Luminance'], ['RETROGRID', 'Retro Grid'], ['SPECTRUM', 'Spectrum'], ['WAVEFORM', 'Waveform'],
  ['STAGE', 'Stage'], ['STUDIO_AURORA', 'Aurora'], ['STUDIO_CHROME', 'Chrome'], ['STUDIO_BAUHAUS', 'Bauhaus'],
  ['STUDIO_NEBULA', 'Studio Nebula'], ['STUDIO_GRAVITY', 'Gravity'], ['STUDIO_KINETIC', 'Kinetic'], ['STUDIO_RIPPLE', 'Ripple'],
];
const VISUALS: Visual[] = [
  { id: 'orbs', name: 'Aurora Orbs', cat: 'Plajah', kind: 'orbs' },
  ...GEN_MODES.filter(([m]) => hasGenerator(m)).map(([mode, name]): Visual => ({ id: 'gen:' + mode, name, cat: 'Generators', kind: 'gen', mode })),
  ...SHADER_LIBRARY.map((s): Visual => ({ id: 'shader:' + s.name, name: s.name, cat: 'Shaders · ' + (s.category || 'gallery'), kind: 'shader', src: s.src })),
];
const VISUAL_GROUPS = ['Plajah', 'Generators', 'Shaders'] as const;
const PIX_PALETTE = ['#00DAF3', '#D40055', '#FF8C00'].map(hexToRgb);
const PIX_PARAMS = [0.5, 0.5, 0.5, 0.5];
const PIX_W = 1280, PIX_H = 720;

// Plajah brand tokens (kept literal so this surface reads in the design language
// even though the audio engine still uses its legacy deck hexes).
const C = {
  cyan: '#00DAF3', magenta: '#D40055', orange: '#FF8C00', purple: '#6B0099',
  lilac: '#D0BCFF', live: '#FF2D55', ok: '#06D6A0', warn: '#F59E0B',
  ink: '#F4F5FA', ink2: 'rgba(244,245,250,0.66)', ink3: 'rgba(244,245,250,0.40)',
  panel: '#0c0d12', panel2: '#111219', hair: 'rgba(255,255,255,0.08)',
};

interface Props {
  audioCtx: AudioContext | null;
  masterGain: GainNode | null;
  nowPlaying: { title: string; artist: string; deck: 'A' | 'B' } | null;
  bpm: number;
  /** ensure the shared engine exists before we tap it (DJModeView.initAudio) */
  ensureAudio: () => AudioContext | null;
}

const StreamStudio: React.FC<Props> = ({ audioCtx, masterGain, nowPlaying, bpm, ensureAudio }) => {
  // ── source + broadcast state ──────────────────────────────────────────────
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [micMonitor, setMicMonitor] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [duck, setDuck] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [musicLevel, setMusicLevel] = useState(0);
  const [visualIdx, setVisualIdx] = useState(0);
  const visual = VISUALS[visualIdx] || VISUALS[0];
  const [live, setLive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [dests, setDests] = useState<{ reello: boolean; liveTalk: boolean }>({ reello: true, liveTalk: true });
  const [viewers] = useState(0);

  // ── media refs ─────────────────────────────────────────────────────────────
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const camThumbRef = useRef<HTMLCanvasElement | null>(null);
  const pixThumbRef = useRef<HTMLCanvasElement | null>(null);
  const programCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── audio graph refs ─────────────────────────────────────────────────────────
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const masterAnalyserRef = useRef<AnalyserNode | null>(null);
  const broadcastDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const programStreamRef = useRef<MediaStream | null>(null);
  const duckRampRef = useRef(false);

  const busRef = useRef<ReturnType<typeof createDjBus> | null>(null);
  const rafRef = useRef(0);

  // ── Plajah Pixels render core (real generators / shaders) ─────────────────────
  const pixelsGlRef = useRef<HTMLCanvasElement | null>(null);
  const compRef = useRef<Compositor | null>(null);
  const genRef = useRef<GeneratorRenderer | null>(null);
  const shRef = useRef<ShaderRenderer | null>(null);
  const audioTexRef = useRef<AudioTexture | null>(null);
  const glOkRef = useRef(false);
  const visualRef = useRef<Visual>(visual);
  useEffect(() => { visualRef.current = visual; }, [visual]);

  // ── the cross-window bus ─────────────────────────────────────────────────────
  useEffect(() => {
    const bus = createDjBus();
    busRef.current = bus;
    const off = bus.subscribe((m: DjBusMessage) => {
      // a controls window can drive the visual from its own window
      if (m.kind === 'scene') {
        if (m.scene === '__next__') setVisualIdx(i => (i + 1) % VISUALS.length);
        else if (m.scene === '__prev__') setVisualIdx(i => (i - 1 + VISUALS.length) % VISUALS.length);
        else { const idx = VISUALS.findIndex(v => v.id === m.scene); if (idx >= 0) setVisualIdx(idx); }
      }
    });
    return () => { off(); bus.close(); busRef.current = null; };
  }, []);

  // ── boot the real Pixels engine on a hidden WebGL2 canvas ─────────────────────
  useEffect(() => {
    const cv = pixelsGlRef.current;
    if (!cv || compRef.current) return;
    try {
      const comp = new Compositor(cv);
      compRef.current = comp;
      genRef.current = new GeneratorRenderer(comp.gl);
      shRef.current = new ShaderRenderer(comp.gl);
      audioTexRef.current = new AudioTexture(comp.gl);
      glOkRef.current = true;
    } catch (e) {
      // WebGL2 unavailable — the Aurora Orbs (2D) backdrop still works.
      glOkRef.current = false;
      console.warn('[DJ] Pixels engine unavailable, using Orbs backdrop', e);
    }
    return () => {
      try { genRef.current?.dispose?.(); shRef.current?.dispose?.(); audioTexRef.current?.dispose?.(); compRef.current?.dispose?.(); } catch { /* */ }
      compRef.current = null; genRef.current = null; shRef.current = null; audioTexRef.current = null; glOkRef.current = false;
    };
  }, []);

  // ── master-level analyser: tap the master bus for reactive visuals ───────────
  useEffect(() => {
    const ctx = audioCtx, master = masterGain;
    if (!ctx || !master || masterAnalyserRef.current) return;
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    an.smoothingTimeConstant = 0.8;
    master.connect(an);           // analyser is a sink — doesn't alter the audible path
    masterAnalyserRef.current = an;
    return () => { try { master.disconnect(an); } catch { /* */ } masterAnalyserRef.current = null; };
  }, [audioCtx, masterGain]);

  // ── webcam ───────────────────────────────────────────────────────────────────
  const toggleCam = useCallback(async () => {
    if (camOn) {
      webcamStreamRef.current?.getTracks().forEach(t => t.stop());
      webcamStreamRef.current = null;
      if (webcamVideoRef.current) webcamVideoRef.current.srcObject = null;
      setCamOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      webcamStreamRef.current = stream;
      let v = webcamVideoRef.current;
      if (!v) { v = document.createElement('video'); webcamVideoRef.current = v; }
      v.srcObject = stream; v.muted = true; (v as any).playsInline = true;
      await v.play().catch(() => {});
      setCamError(null);
      setCamOn(true);
    } catch (e: any) {
      setCamError(e?.name === 'NotAllowedError' ? 'Camera permission denied' : 'No camera available');
      setCamOn(false);
    }
  }, [camOn]);

  // ── mic ──────────────────────────────────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    const ctx = ensureAudio();
    if (micOn) {
      try { micSourceRef.current?.disconnect(); } catch { /* */ }
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null; micSourceRef.current = null; micGainRef.current = null; micAnalyserRef.current = null;
      setMicOn(false); setMicLevel(0);
      return;
    }
    if (!ctx) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        video: false,
      });
      micStreamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain(); gain.gain.value = micMuted ? 0 : 1;
      const an = ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.7;
      src.connect(an);
      an.connect(gain);
      // route the mic to broadcast (always) and to the local monitor (optional)
      if (broadcastDestRef.current) gain.connect(broadcastDestRef.current);
      if (micMonitor) gain.connect(ctx.destination);
      micSourceRef.current = src; micGainRef.current = gain; micAnalyserRef.current = an;
      setMicOn(true);
    } catch {
      setMicOn(false);
    }
  }, [micOn, micMuted, micMonitor, ensureAudio]);

  // reflect mute / monitor changes onto the live mic graph
  useEffect(() => { if (micGainRef.current) micGainRef.current.gain.value = micMuted ? 0 : 1; }, [micMuted]);
  useEffect(() => {
    const ctx = audioCtx, gain = micGainRef.current;
    if (!ctx || !gain) return;
    try { gain.disconnect(ctx.destination); } catch { /* */ }
    if (micMonitor && !micMuted) { try { gain.connect(ctx.destination); } catch { /* */ } }
  }, [micMonitor, micMuted, audioCtx]);

  // ── duck: dip the master music under the voice on air ────────────────────────
  useEffect(() => {
    const ctx = audioCtx, master = masterGain;
    if (!ctx || !master) return;
    const want = duck && micOn && !micMuted ? 0.5 : 1;
    if (duckRampRef.current === (want < 1) && want === 1) return;
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(want, ctx.currentTime, 0.08);
    } catch { master.gain.value = want; }
    duckRampRef.current = want < 1;
  }, [duck, micOn, micMuted, audioCtx, masterGain]);

  // ── broadcast audio destination (master + mic) ───────────────────────────────
  const ensureBroadcastAudio = useCallback((): MediaStream | null => {
    const ctx = ensureAudio(); const master = masterGain;
    if (!ctx || !master) return null;
    if (!broadcastDestRef.current) {
      const dest = ctx.createMediaStreamDestination();
      master.connect(dest);
      if (micGainRef.current) { try { micGainRef.current.connect(dest); } catch { /* */ } }
      broadcastDestRef.current = dest;
    }
    return broadcastDestRef.current.stream;
  }, [ensureAudio, masterGain]);

  // ── the compositor + meters loop ─────────────────────────────────────────────
  useEffect(() => {
    let start = performance.now();
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const t = (performance.now() - start) / 1000;

      // music level from master analyser (RMS)
      let mLvl = 0;
      const ma = masterAnalyserRef.current;
      if (ma) {
        const buf = new Uint8Array(ma.fftSize);
        ma.getByteTimeDomainData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        mLvl = Math.min(1, Math.sqrt(sum / buf.length) * 2.2);
      }
      setMusicLevel(p => p + (mLvl - p) * 0.3);

      // mic level
      let miLvl = 0;
      const mi = micAnalyserRef.current;
      if (mi && !micMuted) {
        const buf = new Uint8Array(mi.fftSize);
        mi.getByteTimeDomainData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        miLvl = Math.min(1, Math.sqrt(sum / buf.length) * 3);
      }
      setMicLevel(p => p + (miLvl - p) * 0.4);

      // ── render the REAL Pixels frame once (gen/shader), audio-reactive ──
      const vis = visualRef.current;
      let glReady = false;
      if (vis.kind !== 'orbs' && glOkRef.current && compRef.current && audioTexRef.current) {
        try {
          audioTexRef.current.update(masterAnalyserRef.current);
          compRef.current.resize(PIX_W, PIX_H);
          const tex = vis.kind === 'gen'
            ? genRef.current!.render('dj', vis.mode, PIX_W, PIX_H, { time: t, audio: audioTexRef.current, colors: PIX_PALETTE, params: PIX_PARAMS })
            : shRef.current!.render('dj', vis.src, PIX_W, PIX_H, { time: t, audio: audioTexRef.current, params: PIX_PARAMS });
          compRef.current.render([{ texture: tex, opacity: 1, blendMode: 'normal' }]);
          glReady = true;
        } catch { glReady = false; }
      }
      // Backdrop: the live Pixels GL surface, or the Aurora Orbs (2D) fallback.
      const drawBackdrop = (c: CanvasRenderingContext2D, w: number, h: number) => {
        if (glReady && pixelsGlRef.current) {
          c.fillStyle = '#05060a'; c.fillRect(0, 0, w, h);
          c.drawImage(pixelsGlRef.current, 0, 0, w, h);
        } else {
          renderPixelsBackdrop(c, w, h, 'warm', mLvl, t);
        }
      };

      // program compositor
      const pc = programCanvasRef.current;
      if (pc) {
        const ctx2 = pc.getContext('2d');
        if (ctx2) {
          const w = pc.width, h = pc.height;
          drawBackdrop(ctx2, w, h);
          // webcam PiP (bottom-right)
          const v = webcamVideoRef.current;
          if (camOn && v && v.videoWidth) {
            const pw = w * 0.26, ph = pw * (v.videoHeight / v.videoWidth);
            const px = w - pw - w * 0.03, py = h - ph - h * 0.055;
            ctx2.save();
            roundRect(ctx2, px, py, pw, ph, 10); ctx2.clip();
            ctx2.drawImage(v, px, py, pw, ph);
            ctx2.restore();
            ctx2.lineWidth = 2; ctx2.strokeStyle = 'rgba(255,255,255,0.55)';
            roundRect(ctx2, px, py, pw, ph, 10); ctx2.stroke();
          }
          // now-playing lower third
          if (nowPlaying) {
            const bx = w * 0.03, by = h - h * 0.16, bw = w * 0.5, bh = h * 0.11;
            ctx2.fillStyle = 'rgba(0,0,0,0.42)';
            roundRect(ctx2, bx, by, bw, bh, 12); ctx2.fill();
            ctx2.fillStyle = C.cyan;
            ctx2.font = `700 ${Math.round(h * 0.022)}px Outfit, system-ui, sans-serif`;
            ctx2.fillText('NOW PLAYING', bx + bw * 0.04, by + bh * 0.36);
            ctx2.fillStyle = '#fff';
            ctx2.font = `700 ${Math.round(h * 0.038)}px Outfit, system-ui, sans-serif`;
            ctx2.fillText(clip(`${nowPlaying.title} — ${nowPlaying.artist}`, 40), bx + bw * 0.04, by + bh * 0.78);
          }
          // live badge
          if (live) {
            const lx = w - w * 0.11, ly = h * 0.05;
            ctx2.fillStyle = C.live;
            roundRect(ctx2, lx, ly, w * 0.08, h * 0.05, 20); ctx2.fill();
            ctx2.fillStyle = '#fff';
            ctx2.font = `800 ${Math.round(h * 0.026)}px Outfit, system-ui, sans-serif`;
            ctx2.fillText('LIVE', lx + w * 0.018, ly + h * 0.034);
          }
        }
      }

      // small source thumbs
      const pt = pixThumbRef.current;
      if (pt) { const c = pt.getContext('2d'); if (c) drawBackdrop(c, pt.width, pt.height); }
      const ct = camThumbRef.current;
      if (ct) {
        const c = ct.getContext('2d');
        if (c) {
          c.fillStyle = '#0a0b10'; c.fillRect(0, 0, ct.width, ct.height);
          const v = webcamVideoRef.current;
          if (camOn && v && v.videoWidth) {
            const s = Math.max(ct.width / v.videoWidth, ct.height / v.videoHeight);
            const dw = v.videoWidth * s, dh = v.videoHeight * s;
            c.drawImage(v, (ct.width - dw) / 2, (ct.height - dh) / 2, dw, dh);
          }
        }
      }

      // publish program state to the bus (for pop-out windows)
      busRef.current?.post({
        kind: 'state',
        state: { nowPlaying, bpm, level: mLvl, scene: vis.id, camOn, live, ts: Date.now() } as DjProgramState,
      });
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [camOn, live, nowPlaying, bpm, micMuted]);

  // ── go live ──────────────────────────────────────────────────────────────────
  const buildProgramStream = useCallback((): MediaStream | null => {
    const pc = programCanvasRef.current;
    if (!pc) return null;
    const audio = ensureBroadcastAudio();
    // @ts-ignore captureStream is widely supported
    const canvasStream: MediaStream = pc.captureStream ? pc.captureStream(30) : null;
    if (!canvasStream) return null;
    const combined = new MediaStream();
    canvasStream.getVideoTracks().forEach(t => combined.addTrack(t));
    audio?.getAudioTracks().forEach(t => combined.addTrack(t));
    programStreamRef.current = combined;
    publishProgramStream(combined);
    return combined;
  }, [ensureBroadcastAudio]);

  const toggleLive = useCallback(() => {
    if (live) {
      setLive(false);
      window.dispatchEvent(new CustomEvent('DJ_STREAM_STOP', {}));
      return;
    }
    const stream = buildProgramStream();
    setLive(true);
    // Integration seam: the platform live layer (Reello / LiveTalk) consumes this.
    // The media pipeline is real; the destination hand-off is a single event.
    window.dispatchEvent(new CustomEvent('DJ_STREAM_GO_LIVE', {
      detail: { stream, destinations: dests, nowPlaying, source: 'DJ_CONSOLE' },
    }));
  }, [live, buildProgramStream, dests, nowPlaying]);

  // live elapsed timer
  useEffect(() => {
    if (!live) { setElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [live]);

  // pick a visual → local + bus (so pop-out windows follow)
  const pickVisual = (idx: number) => { setVisualIdx(idx); busRef.current?.post({ kind: 'scene', scene: VISUALS[idx].id }); };

  const openOutput = () => { buildProgramStream(); openDjOutputWindow(); };

  // cleanup all media on unmount
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    webcamStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    try { micSourceRef.current?.disconnect(); } catch { /* */ }
    try { if (masterGain && broadcastDestRef.current) masterGain.disconnect(broadcastDestRef.current); } catch { /* */ }
    try { if (masterGain) masterGain.gain.value = 1; } catch { /* */ }
    publishProgramStream(null);
  }, [masterGain]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 12, padding: 12, height: '100%', minHeight: 0, overflow: 'auto' }}>
      {/* LEFT — program + sources + note */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

        {/* Hidden WebGL2 surface the Pixels engine renders into (drawn into the program as backdrop). */}
        <canvas ref={pixelsGlRef} width={PIX_W} height={PIX_H} style={{ display: 'none' }} />

        {/* Program Out + Source rail */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 236px', gap: 0, border: `1px solid ${C.hair}`, borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(180deg,#0e0a1a,#0a0b10)' }}>
          {/* Program Out (composite the audience sees) */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.hair}`, minWidth: 0 }}>
            <div style={{ position: 'relative', aspectRatio: '16/9', background: '#05060a' }}>
              <canvas ref={programCanvasRef} width={1280} height={720} style={{ width: '100%', height: '100%', display: 'block' }} />
              <span style={tag}>PROGRAM OUT · composite</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', background: 'linear-gradient(180deg,#0e0a1a,#0a0b10)' }}>
              <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 12.5, letterSpacing: '.03em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8, color: C.ink }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: live ? C.live : C.ink3, boxShadow: live ? `0 0 8px ${C.live}` : 'none' }} />Program Out
              </span>
              <span style={{ fontSize: 11, color: C.ink2 }}>→ <b style={{ color: C.ink }}>Reello</b> + <b style={{ color: C.ink }}>LiveTalk</b></span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 11, fontFamily: 'ui-monospace, monospace', fontSize: 10, color: C.ink2 }}>
                <span>BPM <b style={{ color: C.ok }}>{bpm.toFixed(1)}</b></span>
                <span>OUT <b style={{ color: musicLevel > 0.85 ? C.warn : C.ok }}>{Math.round(musicLevel * 100)}%</b></span>
              </span>
              <button onClick={openOutput} style={winBtn(C.cyan)}><ExternalLink size={12} /> Pop out</button>
            </div>
          </div>

          {/* SOURCE RAIL */}
          <div style={{ background: 'linear-gradient(180deg,#0c0d13,#0a0b10)', padding: 11, display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...eyebrow }}>
              Sources <span style={{ marginLeft: 'auto', fontFamily: 'ui-monospace, monospace', letterSpacing: 0, color: C.ink3 }}>{[camOn, true, micOn && !micMuted].filter(Boolean).length} on air</span>
            </div>

            {/* Webcam */}
            <SourceTile
              label="Webcam" sub="CAM 1" on={camOn} accent={C.cyan}
              icon={camOn ? <Video size={13} color={C.ink2} /> : <VideoOff size={13} color={C.ink3} />}
              action={<button onClick={toggleCam} style={srcAction(camOn)}>{camOn ? 'On' : 'Off'}</button>}
            >
              <canvas ref={camThumbRef} width={320} height={180} style={{ width: '100%', height: '100%', display: 'block' }} />
              {!camOn && <div style={thumbHint}>{camError ?? 'Camera off'}</div>}
            </SourceTile>

            {/* Pixels */}
            <SourceTile
              label="Pixels" sub="reference" on accent={C.lilac}
              icon={<Monitor size={13} color={C.lilac} />}
              action={<button onClick={openDjControlsWindow} title="Pop out Pixels controls" style={srcAction(false)}><SlidersHorizontal size={11} /></button>}
            >
              <canvas ref={pixThumbRef} width={320} height={180} style={{ width: '100%', height: '100%', display: 'block' }} />
            </SourceTile>

            {/* Add source */}
            <button style={{ border: `1px dashed rgba(255,255,255,0.18)`, borderRadius: 9, padding: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: C.ink3, fontFamily: 'Outfit, sans-serif', fontSize: 11, fontWeight: 700, background: 'transparent', cursor: 'pointer' }}>
              <Plus size={14} /> Add source · screen / media
            </button>

            {/* Mic input */}
            <div style={{ border: `1px solid rgba(6,214,160,0.28)`, borderRadius: 9, padding: 10, background: 'rgba(6,214,160,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                <span style={{ width: 24, height: 24, borderRadius: 7, background: 'rgba(6,214,160,0.16)', display: 'grid', placeItems: 'center', flex: 'none' }}>
                  {micOn && !micMuted ? <Mic size={13} color={C.ok} /> : <MicOff size={13} color={C.ink3} />}
                </span>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 11.5, lineHeight: 1.15, color: C.ink }}>
                  Mic Input<small style={{ display: 'block', fontWeight: 600, fontSize: 9, color: C.ink3 }}>{micOn ? 'live' : 'not connected'}</small>
                </span>
                <span style={{ marginLeft: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700, color: micOn ? C.ok : C.ink3 }}>
                  {micOn ? `${Math.round(-40 + micLevel * 40)} dB` : '—'}
                </span>
              </div>
              <Meter level={micOn && !micMuted ? micLevel : 0} />
              <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                <button onClick={toggleMic} style={micBtn(micOn, micOn ? C.ok : undefined)}>{micOn ? 'Connected' : 'Connect'}</button>
                <button onClick={() => setMicMonitor(v => !v)} disabled={!micOn} style={micBtn(micMonitor && micOn, C.cyan)}><Headphones size={11} /></button>
                <button onClick={() => setMicMuted(v => !v)} disabled={!micOn} style={micBtn(micMuted && micOn, C.live)}>Mute</button>
                <button onClick={() => setDuck(v => !v)} style={micBtn(duck, C.orange)}>Duck −6</button>
              </div>
            </div>

            {/* Music mix as an audio source too */}
            <div style={{ border: `1px solid ${C.hair}`, borderRadius: 9, padding: '9px 10px', background: C.panel, display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 24, height: 24, borderRadius: 7, background: 'rgba(0,218,243,0.14)', display: 'grid', placeItems: 'center', flex: 'none' }}><Music2 size={13} color={C.cyan} /></span>
              <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 11.5, color: C.ink }}>Music Mix<small style={{ display: 'block', fontWeight: 600, fontSize: 9, color: C.ink3 }}>master bus</small></span>
              <span style={{ marginLeft: 'auto' }}><MiniVU level={musicLevel} /></span>
            </div>
          </div>
        </div>

        {/* Pixels generators + shaders — the real library, audio-reactive */}
        <div style={{ ...card }}>
          <div style={{ ...cardHead }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(107,0,153,0.25)', display: 'grid', placeItems: 'center' }}><Waves size={14} color={C.lilac} /></span>
            <h5 style={cardTitle}>Plajah Pixels</h5>
            <span style={{ fontSize: 11, color: C.ink2, marginLeft: 4 }}>· <b style={{ color: C.lilac }}>{visual.name}</b></span>
            <span style={{ marginLeft: 'auto', ...pill(C.lilac) }}>{VISUALS.length} visuals</span>
          </div>
          <div style={{ maxHeight: 210, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9, paddingRight: 4 }}>
            {VISUAL_GROUPS.map(group => {
              const items = VISUALS.map((v, i) => ({ v, i })).filter(({ v }) => v.cat === group || (group === 'Shaders' && v.cat.startsWith('Shaders')));
              if (!items.length) return null;
              return (
                <div key={group}>
                  <div style={{ ...eyebrow, marginBottom: 6 }}>{group === 'Plajah' ? 'Plajah · signature' : group}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {items.map(({ v, i }) => {
                      const active = i === visualIdx;
                      return (
                        <button key={v.id} onClick={() => pickVisual(i)} title={v.cat}
                          style={{ fontFamily: 'Outfit, sans-serif', fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                            border: `1px solid ${active ? 'rgba(0,218,243,0.5)' : C.hair}`, color: active ? C.cyan : C.ink2,
                            background: active ? 'rgba(0,218,243,0.1)' : 'rgba(255,255,255,0.03)' }}>
                          {v.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button onClick={() => pickVisual((visualIdx - 1 + VISUALS.length) % VISUALS.length)} style={{ ...winBtn(), flex: 1, justifyContent: 'center' }}>‹ Prev</button>
            <button onClick={() => pickVisual((visualIdx + 1) % VISUALS.length)} style={{ ...winBtn(), flex: 1, justifyContent: 'center' }}>Next ›</button>
            <button onClick={openDjControlsWindow} style={{ ...winBtn(C.lilac), flex: 1, justifyContent: 'center' }}><SlidersHorizontal size={12} /> Controls window</button>
          </div>
          <p style={{ margin: '9px 0 0', fontSize: 11, color: C.ink3, lineHeight: 1.5 }}>
            Real Pixels generators &amp; shaders, reacting to the master bus. The selection drives the Program Out; <b style={{ color: C.ink2 }}>Pop out</b> sends it to a projector window.
          </p>
        </div>
      </div>

      {/* RIGHT — broadcast studio */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Broadcast */}
        <div style={{ ...card, background: `linear-gradient(160deg,rgba(107,0,153,0.22),rgba(212,0,85,0.10) 60%,${C.panel})`, borderColor: 'rgba(212,0,85,0.3)' }}>
          <div style={cardHead}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(255,45,85,0.18)', display: 'grid', placeItems: 'center' }}><Radio size={14} color="#ff8ba0" /></span>
            <h5 style={cardTitle}>Broadcast Studio</h5>
          </div>
          <button onClick={toggleLive} style={{ width: '100%', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 14, letterSpacing: '.02em', padding: 13, borderRadius: 12, border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, background: live ? 'linear-gradient(135deg,#FF2D55,#FF8C00)' : 'linear-gradient(135deg,#D40055,#FF8C00)', boxShadow: '0 10px 30px rgba(212,0,85,0.4)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#fff' }} />{live ? `ON AIR · ${fmt(elapsed)}` : 'Go Live'}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 11 }}>
            <DestRow label="Reello Live" on={dests.reello} live={live} accent="#ff8ba0" onToggle={() => setDests(d => ({ ...d, reello: !d.reello }))} />
            <DestRow label="LiveTalk Room" on={dests.liveTalk} live={live} accent={C.cyan} onToggle={() => setDests(d => ({ ...d, liveTalk: !d.liveTalk }))} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9, border: `1px solid ${C.hair}`, fontSize: 12, color: C.ink3 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.07)', display: 'grid', placeItems: 'center' }}><Plus size={13} /></span>Add destination
            </div>
          </div>
        </div>

        {/* Signal health */}
        <div style={card}>
          <div style={cardHead}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(0,218,243,0.14)', display: 'grid', placeItems: 'center' }}><Signal size={14} color={C.cyan} /></span>
            <h5 style={cardTitle}>Signal</h5>
            <span style={{ marginLeft: 'auto', ...pill(live ? C.live : C.ink3) }}>{live ? 'streaming' : 'idle'}</span>
          </div>
          <div style={{ display: 'flex', gap: 14, fontFamily: 'ui-monospace, monospace', fontSize: 12, color: C.ink2 }}>
            <span>Cam <b style={{ color: camOn ? C.ok : C.ink3 }}>{camOn ? 'on' : 'off'}</b></span>
            <span>Mic <b style={{ color: micOn && !micMuted ? C.ok : C.ink3 }}>{micOn ? (micMuted ? 'mute' : 'on') : 'off'}</b></span>
            <span>Viewers <b style={{ color: C.ink }}>{viewers}</b></span>
          </div>
        </div>

        {/* Windows */}
        <div style={card}>
          <div style={cardHead}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(255,140,0,0.14)', display: 'grid', placeItems: 'center' }}><ExternalLink size={14} color={C.orange} /></span>
            <h5 style={cardTitle}>Windows</h5>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={openOutput} style={{ ...winBtn(C.cyan), flex: 1, justifyContent: 'center' }}><Monitor size={13} /> Output window</button>
            <button onClick={openDjControlsWindow} style={{ ...winBtn(), flex: 1, justifyContent: 'center' }}><SlidersHorizontal size={13} /> Pixels controls</button>
          </div>
          <p style={{ margin: '9px 0 0', fontSize: 11, color: C.ink3, lineHeight: 1.5 }}>The Output window mirrors the real Program feed for a second screen or projector; controls drive the Pixels scene from a separate window.</p>
        </div>
      </div>
    </div>
  );
};

// ── small presentational helpers ───────────────────────────────────────────────
const SourceTile: React.FC<{ label: string; sub: string; on: boolean; accent: string; icon: React.ReactNode; action: React.ReactNode; children: React.ReactNode }> = ({ label, sub, on, icon, action, children }) => (
  <div style={{ borderRadius: 9, overflow: 'hidden', border: `1px solid ${on ? 'rgba(255,45,85,0.45)' : C.hair}`, position: 'relative', background: '#0a0b10' }}>
    <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden' }}>{children}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px', fontFamily: 'Outfit, sans-serif', fontSize: 10.5, fontWeight: 700, color: C.ink, background: C.panel }}>
      {icon}{label} <small style={{ color: C.ink3, fontWeight: 600, fontSize: 9 }}>{sub}</small>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
        {action}
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? C.live : C.ink3, boxShadow: on ? `0 0 8px ${C.live}` : 'none' }} />
      </span>
    </div>
  </div>
);

const Meter: React.FC<{ level: number }> = ({ level }) => {
  const seg = 14; const lit = Math.round(level * seg);
  return (
    <div style={{ display: 'flex', gap: 2, height: 9 }}>
      {Array.from({ length: seg }).map((_, i) => (
        <span key={i} style={{ flex: 1, borderRadius: 1, background: i < lit ? (i > seg * 0.85 ? C.live : i > seg * 0.65 ? C.warn : C.ok) : 'rgba(255,255,255,0.08)' }} />
      ))}
    </div>
  );
};
const MiniVU: React.FC<{ level: number }> = ({ level }) => {
  const seg = 5; const lit = Math.round(level * seg);
  return (
    <span style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: seg }).map((_, i) => (
        <span key={i} style={{ width: 3, height: 16, borderRadius: 1, background: i < lit ? (i > 3 ? C.warn : C.ok) : 'rgba(255,255,255,0.08)' }} />
      ))}
    </span>
  );
};
const DestRow: React.FC<{ label: string; on: boolean; live: boolean; accent: string; onToggle: () => void }> = ({ label, on, live, accent, onToggle }) => (
  <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9, border: `1px solid ${C.hair}`, fontSize: 12, color: C.ink2, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
    <span style={{ width: 22, height: 22, borderRadius: 6, background: `${accent}22`, display: 'grid', placeItems: 'center', flex: 'none' }}><Radio size={12} color={accent} /></span>
    {label}
    <span style={{ marginLeft: 'auto', fontFamily: 'Outfit, sans-serif', fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', padding: '3px 8px', borderRadius: 999, background: on && live ? 'rgba(6,214,160,0.14)' : 'transparent', border: on && live ? 'none' : `1px solid ${C.hair}`, color: on && live ? C.ok : on ? C.ink2 : C.ink3 }}>
      {on ? (live ? 'streaming' : 'ready') : 'off'}
    </span>
  </button>
);

// ── style tokens ───────────────────────────────────────────────────────────────
const eyebrow: React.CSSProperties = { fontFamily: 'Outfit, sans-serif', fontSize: 9.5, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: C.ink3 };
const tag: React.CSSProperties = { position: 'absolute', left: 10, top: 10, fontFamily: 'Outfit, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '4px 9px', borderRadius: 7, backdropFilter: 'blur(6px)' };
const card: React.CSSProperties = { background: `linear-gradient(180deg,${C.panel2},${C.panel})`, border: `1px solid ${C.hair}`, borderRadius: 16, padding: 13 };
const cardHead: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 };
const cardTitle: React.CSSProperties = { fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13, margin: 0, letterSpacing: '-.01em', color: C.ink };
const thumbHint: React.CSSProperties = { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: 'Outfit, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3 };
function pill(c: string): React.CSSProperties { return { fontFamily: 'Outfit, sans-serif', fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', padding: '3px 8px', borderRadius: 999, background: `${c}22`, color: c }; }
function winBtn(accent?: string): React.CSSProperties {
  return { fontFamily: 'Outfit, sans-serif', fontSize: 10.5, fontWeight: 700, padding: '6px 9px', borderRadius: 8, border: `1px solid ${accent ? accent + '66' : C.hair}`, background: accent ? `${accent}14` : 'rgba(255,255,255,0.04)', color: accent ?? C.ink2, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' };
}
function srcAction(active: boolean): React.CSSProperties {
  return { fontFamily: 'Outfit, sans-serif', fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, border: `1px solid ${active ? 'rgba(6,214,160,0.4)' : C.hair}`, background: active ? 'rgba(6,214,160,0.12)' : 'rgba(255,255,255,0.04)', color: active ? C.ok : C.ink2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 };
}
function micBtn(active: boolean, accent?: string): React.CSSProperties {
  const a = accent ?? C.ok;
  return { flex: 1, textAlign: 'center', fontFamily: 'Outfit, sans-serif', fontSize: 10, fontWeight: 700, padding: '7px 4px', borderRadius: 7, border: `1px solid ${active ? a + '66' : C.hair}`, color: active ? a : C.ink2, background: active ? `${a}22` : 'rgba(255,255,255,0.04)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 };
}

// ── canvas helpers ─────────────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function clip(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

export default StreamStudio;
