// Dev-only: Lorik & Lumi — the Kaiju Dance Party visualizer + UI mascot concepts, no sign-in.
//
//   /kaiju-preview.html
//
// Plays a built-in synth groove per style (with an optional synthetic voice that sings — held notes
// and runs — or raps, plus timed demo lyrics) through a real AnalyserNode, or any audio file you drop
// in. Style / vocal overrides let you inspect every dance and performance directly. Delete freely.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import KaijuDanceStage, { type LyricLine } from '../components/kaiju/KaijuDanceStage';
import { KaijuLogoDuo, KaijuLoader, KaijuEmptyState, KaijuPeek, KaijuSnapButton } from '../components/kaiju/KaijuMascots';
import { KaijuSignalContext } from '../components/kaiju/kaijuSignal';
import type { KaijuFeatures, KaijuStyle, VocalMode } from '../components/kaiju/kaijuAudio';

// ── tiny synth ───────────────────────────────────────────────────────────────────────────────────
type Groove = 'zen' | 'edm' | 'rock' | 'ballet';
type Voice = 'off' | 'sing' | 'rap';
const BPM: Record<Groove, number> = { zen: 60, edm: 128, rock: 150, ballet: 84 };
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Synth {
  ctx: AudioContext; out: GainNode; an: AnalyserNode; noise: AudioBuffer; dist: WaveShaperNode;
  groove: Groove = 'edm'; voice: Voice = 'off'; step = 0; nextT = 0; timer = 0; t0 = 0; media: MediaElementAudioSourceNode | null = null;
  constructor() {
    this.ctx = new AudioContext();
    this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.an.smoothingTimeConstant = 0.6;
    this.out = this.ctx.createGain(); this.out.gain.value = 0.7; this.out.connect(this.an); this.an.connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.dist = this.ctx.createWaveShaper();
    const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * 6); } this.dist.curve = c;
    this.dist.connect(this.out);
  }
  get time() { return this.ctx.currentTime - this.t0; }
  start(g: Groove, v: Voice) { this.stop(); this.groove = g; this.voice = v; this.step = 0; this.ctx.resume(); this.nextT = this.ctx.currentTime + 0.1; this.t0 = this.nextT; this.timer = window.setInterval(() => this.pump(), 25); }
  stop() { window.clearInterval(this.timer); this.timer = 0; }
  playFile(el: HTMLAudioElement) { this.stop(); this.ctx.resume(); if (!this.media) { this.media = this.ctx.createMediaElementSource(el); this.media.connect(this.out); } this.t0 = this.ctx.currentTime - el.currentTime; }
  private env(g: GainNode, t: number, a: number, peak: number, d: number) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  private osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, a = 0.005, dest: AudioNode = this.out, detune = 0) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(g); g.connect(dest); this.env(g, t, a, peak, dur); o.start(t); o.stop(t + a + dur + 0.05); return o;
  }
  private nz(t: number, dur: number, peak: number, type: BiquadFilterType, f: number, q = 1) {
    const s = this.ctx.createBufferSource(), fl = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl); fl.connect(g); g.connect(this.out);
    this.env(g, t, 0.002, peak, dur); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  private kick(t: number, peak = 1) { const o = this.osc('sine', 150, t, 0.35, peak); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); }
  private vox(t: number, midi: number, dur: number, peak: number, opts: { vib?: number; glideTo?: number; formant?: number } = {}) {
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(mtof(midi), t);
    if (opts.glideTo != null) o.frequency.linearRampToValueAtTime(mtof(opts.glideTo), t + dur * 0.9);
    const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.value = (opts.vib ?? 0) * mtof(midi) * 0.02;
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.1);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.03); g.gain.setValueAtTime(peak, t + dur * 0.85); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f1 = opts.formant ?? 700;
    for (const [f, q, gn] of [[f1, 6, 1], [1150, 8, 0.6], [2600, 10, 0.3]] as const) {
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const bg = this.ctx.createGain(); bg.gain.value = gn * 3; o.connect(bp); bp.connect(bg); bg.connect(g);
    }
    g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }
  private pump() {
    const spb = 60 / BPM[this.groove], s16 = spb / 4;
    while (this.nextT < this.ctx.currentTime + 0.12) { this.tick(this.step, this.nextT, s16); this.step++; this.nextT += s16; }
  }
  private tick(n: number, t: number, s16: number) {
    const g = this.groove, beat = n % 4 === 0, b = Math.floor(n / 4), bar = Math.floor(n / 16);
    if (g === 'edm') {
      if (beat) this.kick(t, 0.95);
      if (n % 8 === 4) this.nz(t, 0.18, 0.5, 'bandpass', 1500, 0.8);
      if (n % 4 === 2) this.nz(t, 0.05, 0.25, 'highpass', 8000);
      const root = [45, 41, 43, 40][bar % 4];
      if (n % 4 === 2) { this.osc('sawtooth', mtof(root), t, s16 * 1.5, 0.22, 0.005, this.out); }
      if (n % 16 === 0) for (const iv of [12, 16, 19]) for (const dt of [-12, 12]) this.osc('sawtooth', mtof(root + iv + 12), t, s16 * 14, 0.035, 0.02, this.out, dt);
    } else if (g === 'rock') {
      if (n % 8 === 0) this.kick(t, 1); if (n % 8 === 4) this.nz(t, 0.22, 0.75, 'bandpass', 1800, 0.6);
      if (n % 2 === 0) this.nz(t, 0.04, 0.15, 'highpass', 7000);
      const root = [40, 40, 43, 38][bar % 4];
      if (n % 2 === 0) for (const iv of [0, 7, 12]) this.osc('sawtooth', mtof(root + iv), t, s16 * 1.7, 0.09, 0.003, this.dist);
      if (n % 64 === 0) this.nz(t, 1.2, 0.35, 'highpass', 5000);
    } else if (g === 'zen') {
      if (n % 32 === 0) for (const m of [[50, 57, 62, 66], [48, 55, 60, 64]][(n / 32) % 2]) { this.osc('sine', mtof(m), t, 7, 0.07, 2.5); this.osc('triangle', mtof(m + 12), t, 7, 0.02, 3, this.out, 6); }
      if (n % 12 === 6 && Math.random() < 0.6) this.osc('sine', mtof(74 + [0, 2, 5, 7, 9][Math.floor(Math.random() * 5)]), t, 3, 0.05, 0.005);
    } else {
      // ballet: 3/4 waltz — one bar = 12 sixteenths
      const wb = n % 12, wbar = Math.floor(n / 12), swell = 0.5 + 0.5 * Math.sin(wbar * 0.4);
      if (wb === 0) { this.osc('sine', 65, t, 0.6, 0.35 * swell); for (const m of [[57, 61, 64], [54, 57, 62], [50, 54, 57], [52, 56, 59]][wbar % 4]) this.osc('sawtooth', mtof(m), t, s16 * 12, 0.03 + 0.03 * swell, 0.4, this.out, 8); }
      if (wb === 4 || wb === 8) this.osc('triangle', mtof([69, 66, 62, 64][wbar % 4] + (wb === 8 ? 4 : 0)), t, 0.6, 0.12, 0.004);
      if (wb % 2 === 1) this.osc('triangle', mtof(81 + [0, 4, 7, 12, 7, 4][(n >> 1) % 6]), t, 0.25, 0.04, 0.003);
    }
    // synthetic voice
    if (this.voice === 'sing' && n % 4 === 0) {
      const phrase = b % 16;
      if (phrase < 4) this.vox(t, [64, 66, 67, 69][phrase], s16 * 3.6, 0.2, { vib: 0.2 });
      else if (phrase === 4) this.vox(t, 71, s16 * 4 * 3.8, 0.24, { vib: 0.35 });           // held note (sustain)
      else if (phrase === 8) for (let k = 0; k < 8; k++) this.vox(t + k * s16 * 0.5, [72, 71, 69, 71, 72, 74, 72, 71][k], s16 * 0.55, 0.2, { formant: 800 }); // vocal run
      else if (phrase >= 10 && phrase < 14) this.vox(t, [67, 69, 71, 69][phrase - 10], s16 * 3.6, 0.2, { vib: 0.2 });
    }
    if (this.voice === 'rap' && (n % 16) < 14 && Math.random() < 0.85) {
      const f = [57, 55, 57, 59, 55][n % 5] + (Math.random() - 0.5) * 3;
      this.vox(t, f, s16 * 0.7, 0.26, { formant: 500 + Math.random() * 500, glideTo: f - 2 });
    }
  }
}

const DEMO_LYRICS = [
  'Two little kaiju on a bright white stage', 'Lorik reads the lyrics, Lumi grabs the light', 'Hold that note up to the sky',
  '', 'Run it up and down the scale', 'Plajah pulsing with the beat', 'Sing it back to me tonight', '',
];

const STYLES: (KaijuStyle | 'auto')[] = ['auto', 'zen', 'edm', 'rock', 'ballet'];
const STYLE_LABEL: Record<string, string> = { auto: 'Auto', zen: '🪷 Meditation', edm: '⚡ EDM', rock: '🤘 Rock', ballet: '🩰 Ballet' };
const VOCALS: (VocalMode | null)[] = [null, 'sing', 'rap', 'sustain', 'run'];

const Btn: React.FC<{ on?: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${on ? 'bg-[#6B0099] text-white border-[#6B0099]' : 'bg-white text-[#3B1A5C] border-[#E2D6F0] hover:border-[#6B0099]'}`}>
    {children}
  </button>
);

function App() {
  const synth = useMemo(() => new Synth(), []);
  const audioEl = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [groove, setGroove] = useState<Groove>('edm');
  const [voice, setVoice] = useState<Voice>('sing');
  const [style, setStyle] = useState<KaijuStyle | 'auto'>('auto');
  const [forceVocal, setForceVocal] = useState<VocalMode | null>(null);
  const [useLyrics, setUseLyrics] = useState(true);
  const [file, setFile] = useState<string | null>(null);
  const [clips, setClips] = useState(() => new URLSearchParams(location.search).has('clips'));
  const meters = useRef<HTMLDivElement>(null);

  const lyrics: LyricLine[] | null = useMemo(() => {
    if (!useLyrics || file || voice === 'off') return null;
    const spb = 60 / BPM[groove], out: LyricLine[] = [];
    for (let i = 0; i < 200; i++) out.push({ time: i * spb * 4, text: DEMO_LYRICS[i % DEMO_LYRICS.length] });
    return out;
  }, [useLyrics, file, voice, groove]);

  const play = (g = groove, v = voice) => { audioEl.current?.pause(); setFile(null); synth.start(g, v); setPlaying(true); };
  const stop = () => { synth.stop(); audioEl.current?.pause(); setPlaying(false); };
  useEffect(() => () => synth.stop(), [synth]);

  const onFeatures = (f: KaijuFeatures) => {
    const el = meters.current; if (!el) return;
    el.textContent = `style ${f.style}  ·  bpm ${f.bpm.toFixed(0)}  ·  vocal ${f.vocalMode} (${(f.vocal * 100) | 0}%)  ·  zen ${f.styleScores.zen.toFixed(2)} edm ${f.styleScores.edm.toFixed(2)} rock ${f.styleScores.rock.toFixed(2)} ballet ${f.styleScores.ballet.toFixed(2)}`;
  };
  const signal = useMemo(() => ({ analyser: synth.an, isPlaying: playing }), [synth, playing]);

  return (
    <KaijuSignalContext.Provider value={signal}>
      <div className="min-h-screen bg-[#F7F3FB] text-[#2A1640]" style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}>
        <header className="px-6 lg:px-12 pt-8 pb-4 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.3em] text-[#D40055]">Chora · FX Stage · new engine</div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight">Kaiju Dance Party</h1>
            <p className="text-sm opacity-70 mt-1">Lorik 🎵 & Lumi 📷 dance, sing, rap and riff to whatever's playing.</p>
          </div>
        </header>

        <section className="px-6 lg:px-12">
          <div className="relative w-full rounded-3xl overflow-hidden shadow-[0_30px_80px_rgba(107,0,153,0.18)] border border-[#EADFF5]" style={{ aspectRatio: '16 / 9' }}>
            <KaijuDanceStage analyser={synth.an} isPlaying={playing} getTime={() => (file && audioEl.current ? audioEl.current.currentTime : synth.time)}
              lyrics={lyrics} lyricsTimed={!!lyrics} style={style} forceVocal={forceVocal} onFeatures={onFeatures} clips={clips} />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 border border-[#EADFF5] space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Music</div>
              <div className="flex flex-wrap gap-2 items-center">
                {(['zen', 'edm', 'rock', 'ballet'] as Groove[]).map(g => (
                  <Btn key={g} on={playing && !file && groove === g} onClick={() => { setGroove(g); play(g); }}>{STYLE_LABEL[g]} groove</Btn>
                ))}
                <Btn on={false} onClick={stop}>■ Stop</Btn>
                <label className="px-3 py-1.5 rounded-full text-xs font-bold border bg-white border-[#E2D6F0] cursor-pointer hover:border-[#6B0099]">
                  ⬆ Your song…
                  <input type="file" accept="audio/*" className="hidden" onChange={e => {
                    const fl = e.target.files?.[0]; if (!fl || !audioEl.current) return;
                    synth.stop(); const url = URL.createObjectURL(fl); setFile(fl.name); audioEl.current.src = url;
                    synth.playFile(audioEl.current); audioEl.current.play(); setPlaying(true);
                  }} />
                </label>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-bold opacity-60 mr-1">Synth voice:</span>
                {(['off', 'sing', 'rap'] as Voice[]).map(v => <Btn key={v} on={voice === v} onClick={() => { setVoice(v); if (playing && !file) play(groove, v); }}>{v === 'off' ? 'Instrumental' : v === 'sing' ? '🎤 Singing (holds + runs)' : '🎙 Rapping'}</Btn>)}
                <Btn on={useLyrics} onClick={() => setUseLyrics(x => !x)}>Timed lyrics {useLyrics ? 'on' : 'off'}</Btn>
              </div>
              {file && <div className="text-xs opacity-60">Playing: {file}</div>}
              <audio ref={audioEl} onEnded={() => setPlaying(false)} />
            </div>
            <div className="rounded-2xl bg-white p-4 border border-[#EADFF5] space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Inspect (FX Stage presets / debug)</div>
              <div className="flex flex-wrap gap-2">
                <Btn on={!clips} onClick={() => setClips(false)}>🧸 Code-built puppets</Btn>
                <Btn on={clips} onClick={() => setClips(true)}>🎬 Video clips (music video)</Btn>
              </div>
              <div className="flex flex-wrap gap-2">{STYLES.map(s => <Btn key={s} on={style === s} onClick={() => setStyle(s)}>{STYLE_LABEL[s]}</Btn>)}</div>
              <div className="flex flex-wrap gap-2">{VOCALS.map(v => <Btn key={String(v)} on={forceVocal === v} onClick={() => setForceVocal(v)}>{v ? `Force ${v}` : 'Vocals: detect'}</Btn>)}</div>
              <div ref={meters} className="text-[11px] font-mono opacity-60 pt-1" />
            </div>
          </div>
        </section>

        <section className="px-6 lg:px-12 mt-12">
          <div className="text-[11px] font-black uppercase tracking-[0.3em] text-[#D40055] mb-3">In the Chora UI</div>

          <div className="rounded-3xl p-8 lg:p-12 bg-[#0B0710] text-white overflow-hidden relative">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-4">1 · Chora header — they stand by the logo (hover, click, play music)</div>
            <div className="flex items-end gap-3 lg:gap-5">
              <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-[9rem] font-black uppercase tracking-tighter leading-[0.8] italic select-none">Plajah Chora</h1>
              <KaijuLogoDuo className="h-14 sm:h-20 md:h-24 lg:h-32" />
            </div>
          </div>

          <div className="grid gap-4 mt-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl bg-[#0B0710] p-6 h-64">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">2 · Loader</div>
              <KaijuLoader className="h-[85%]" />
            </div>
            <div className="rounded-3xl bg-white border border-[#EADFF5] p-6">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] opacity-40">3 · Empty state</div>
              <KaijuEmptyState kind="lumi" title="Nothing in frame yet" subtitle="Like a track and Lumi will snap it into your library." className="py-4" />
            </div>
            <div className="rounded-3xl bg-white border border-[#EADFF5] p-6">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] opacity-40">3b · No lyrics</div>
              <KaijuEmptyState kind="lorik" title="No lyrics for this one" subtitle="Lorik is still writing them down in his book." className="py-4" />
            </div>
            <div className="rounded-3xl bg-white border border-[#EADFF5] p-6 flex flex-col gap-6">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] opacity-40">4 · Peek + 5 · Snap-to-like</div>
              <div className="relative mt-14 rounded-2xl bg-[#1A1024] text-white p-4 flex items-center gap-3">
                <KaijuPeek kind="lorik" side="right" active={playing} />
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00]" />
                <div className="min-w-0 flex-1"><div className="font-bold text-sm truncate">Now playing</div><div className="text-xs opacity-60">Lorik pops up while music plays</div></div>
              </div>
              <div className="mt-10 flex items-center justify-between rounded-2xl bg-[#F7F3FB] p-3">
                <div className="text-sm font-bold">Midnight Kaiju (Demo)</div>
                <KaijuSnapButton />
              </div>
            </div>
          </div>
        </section>
        <footer className="px-6 lg:px-12 py-10 text-xs opacity-50">components/kaiju/* · Lorik &amp; Lumi are drawn entirely in SVG code from the character reference sheet.</footer>
      </div>
    </KaijuSignalContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
