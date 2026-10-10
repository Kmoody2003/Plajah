// Reello Live shared-sound lab — drives the REAL LiveAudioMixer, LiveSoundSheet and SessionRecorder
// with synthetic sources (no camera / sign-in / going live):
//   npx vite --config live-sound.vite.config.mjs  →  http://127.0.0.1:3112/live-sound.html
// window.__lab exposes measurements for automated checks.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { LiveAudioMixer, type MixSourceState } from '../services/liveAudioMixer';
import { LiveSoundSheet } from '../components/live/LiveSoundSheet';
import { SessionRecorder } from '../services/sessionRecorder';

/** A mono WAV of a sine tone — stands in for a song the participant plays into the stream. */
function toneWav(freq: number, seconds: number): Blob {
  const rate = 48000, n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * freq * i / rate) * 0.6 * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}

/** RMS meter on any track (its own AudioContext, like a remote viewer would hear it). */
function meter(track: MediaStreamTrack) {
  const ctx = new AudioContext();
  const an = ctx.createAnalyser(); an.fftSize = 2048;
  ctx.createMediaStreamSource(new MediaStream([track])).connect(an);
  const b = new Float32Array(2048);
  return () => { an.getFloatTimeDomainData(b); let s = 0; for (const x of b) s += x * x; return Math.sqrt(s / b.length); };
}

function Lab() {
  const mixerRef = useRef<LiveAudioMixer | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const [state, setState] = useState<MixSourceState[]>([]);
  const [open, setOpen] = useState(true);
  const [level, setLevel] = useState(0);
  const [recLevel, setRecLevel] = useState<number | null>(null);
  const readRef = useRef<() => number>(() => 0);

  const ensureMixer = async () => {
    if (mixerRef.current) return mixerRef.current;
    // Synthetic "mic": a 220 Hz voice-ish tone we can switch on/off to exercise ducking.
    const actx = new AudioContext();
    const osc = actx.createOscillator(); osc.frequency.value = 220;
    const g = actx.createGain(); g.gain.value = 0;
    const d = actx.createMediaStreamDestination();
    osc.connect(g).connect(d); osc.start();
    micGainRef.current = g;
    const m = new LiveAudioMixer();
    m.onChange = () => setState(m.state());
    m.setTrack('mic', d.stream.getAudioTracks()[0]);
    mixerRef.current = m;
    readRef.current = meter(m.track);
    setState(m.state());
    return m;
  };

  useEffect(() => {
    const id = setInterval(() => setLevel(readRef.current()), 100);
    (window as any).__lab = {
      ensureMixer,
      level: () => readRef.current(),
      playTone: async () => { const m = await ensureMixer(); m.playMedia(toneWav(440, 30)); },
      talk: (on: boolean) => { if (micGainRef.current) micGainRef.current.gain.value = on ? 0.5 : 0; },
      state: () => mixerRef.current?.state(),
      setGain: (id: any, g: number) => mixerRef.current?.setGain(id, g),
      // Recorder regression: audio track hot-swapped on the SAME stream object must still be recorded.
      recorderSwap: async () => {
        const m = await ensureMixer();
        const actx = new AudioContext();
        const silent = actx.createMediaStreamDestination();          // track A: silence
        const local = new MediaStream([silent.stream.getAudioTracks()[0]]);
        const rec = new SessionRecorder({ audioOnly: true });
        rec.start(() => [local]);
        await new Promise(r => setTimeout(r, 300));
        local.removeTrack(local.getAudioTracks()[0]);               // what publishExternalAudio does
        local.addTrack(m.track);                                    // track B: the mixer (tone)
        const program = await rec.programStream();
        await new Promise(r => setTimeout(r, 300));
        // reconcile runs per drawn frame for video; audio-only reconciles on start → call it via a frame
        (rec as any).reconcileAudio();
        const read = meter(program.getAudioTracks()[0]);
        await new Promise(r => setTimeout(r, 600));
        const v = read();
        setRecLevel(v);
        await rec.stop();
        return v;
      },
    };
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-4 font-sans">
      <h1 className="text-sm font-black uppercase tracking-widest">Reello Live · Sound lab</h1>
      <p className="text-[11px] text-white/50 mb-3">Real mixer + Sound sheet + recorder, synthetic sources.</p>
      <div className="flex flex-wrap gap-2 mb-3">
        <button id="tone" className="px-3 py-1.5 rounded-full bg-white text-black text-[11px] font-black" onClick={() => (window as any).__lab.playTone()}>Play test song</button>
        <button id="talk-on" className="px-3 py-1.5 rounded-full bg-white/15 text-[11px] font-black" onClick={() => (window as any).__lab.talk(true)}>Talk</button>
        <button id="talk-off" className="px-3 py-1.5 rounded-full bg-white/15 text-[11px] font-black" onClick={() => (window as any).__lab.talk(false)}>Stop talking</button>
        <button className="px-3 py-1.5 rounded-full bg-white/15 text-[11px] font-black" onClick={() => setOpen(o => !o)}>Toggle sheet</button>
      </div>
      <div className="text-[12px] font-mono">Stream output level: <span id="lvl">{level.toFixed(3)}</span></div>
      <div className="h-2 bg-white/10 rounded mt-1 mb-2"><div className="h-2 bg-red-500 rounded" style={{ width: `${Math.min(100, level * 250)}%` }} /></div>
      {recLevel !== null && <div className="text-[12px] font-mono">Recorder after track swap: {recLevel.toFixed(3)}</div>}
      {open && <LiveSoundSheet mixer={mixerRef.current} state={state} ensureMixer={ensureMixer} onClose={() => setOpen(false)} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Lab />);
