// Dev-only: the 3D Kaiju Disco (Chora & Reello, mocap dances, camera + stage directors), no sign-in.
//
//   /kaiju-disco.html            auto arrangement (quiet → groove → peak → …) so every director state shows up
//   /kaiju-disco.html?quality=low|medium|high   ?section=quiet|groove|peak (hold one section)  ?hud=0
//
// A tiny synth feeds a real AnalyserNode (or drop in your own song). Delete freely.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import KaijuStage3D from '../components/kaiju/stage3d/KaijuStage3D';
import type { KaijuStyle, VocalMode } from '../components/kaiju/kaijuAudio';

import { Synth, type Section } from './kaijuDemoSynth';

function App() {
  const q = new URLSearchParams(location.search);
  const synth = useMemo(() => new Synth(), []);
  (window as any).__synth = synth;
  const [playing, setPlaying] = useState(false);
  const [section, setSection] = useState<Section>('groove');
  const [auto, setAuto] = useState(!q.get('section'));
  const [style, setStyle] = useState<KaijuStyle | 'auto'>('auto');
  const [vocal, setVocal] = useState<VocalMode | null>(null);
  const [tier, setTier] = useState<'auto' | 'quiet' | 'groove' | 'peak'>('auto');
  const quality = (q.get('quality') as 'low' | 'medium' | 'high') || 'high';
  const fileEl = useRef<HTMLAudioElement>(null);
  useEffect(() => { synth.onSection = setSection; return () => synth.stop(); }, [synth]);
  useEffect(() => { synth.auto = auto; }, [auto, synth]);
  useEffect(() => { const s = q.get('section') as Section | null; if (s) { synth.section = s; setSection(s); } }, [synth]);   // eslint-disable-line react-hooks/exhaustive-deps
  const btn = (on: boolean) => ({ padding: '6px 12px', borderRadius: 999, border: '1px solid #4a3a66', background: on ? '#6B0099' : '#150d22', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' } as React.CSSProperties);
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Outfit',system-ui,sans-serif", color: '#fff' }}>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <KaijuStage3D analyser={synth.an} isPlaying={playing} getTime={() => synth.time} style={style} forceVocal={vocal} quality={quality} forceTier={tier} showHud={q.get('hud') !== '0'} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 10, background: '#0b0713', alignItems: 'center' }}>
        <button style={btn(playing)} onClick={() => { if (playing) { synth.stop(); setPlaying(false); } else { synth.start(); setPlaying(true); } }}>{playing ? '■ Stop' : '▶ Play'}</button>
        <span style={{ fontSize: 11, opacity: .6 }}>arrangement:</span>
        <button style={btn(auto)} onClick={() => setAuto(a => !a)}>auto</button>
        {(['quiet', 'groove', 'peak'] as Section[]).map(s => <button key={s} style={btn(!auto && section === s)} onClick={() => { setAuto(false); synth.section = s; setSection(s); }}>{s}</button>)}
        <span style={{ fontSize: 11, opacity: .6 }}>now: {section}</span>
        <span style={{ fontSize: 11, opacity: .6, marginLeft: 8 }}>style:</span>
        {(['auto', 'zen', 'edm', 'rock', 'ballet'] as const).map(s => <button key={s} style={btn(style === s)} onClick={() => setStyle(s)}>{s}</button>)}
        <span style={{ fontSize: 11, opacity: .6, marginLeft: 8 }}>vocal:</span>
        {([null, 'sing', 'rap'] as (VocalMode | null)[]).map(v => <button key={String(v)} style={btn(vocal === v)} onClick={() => setVocal(v)}>{v ?? 'detect'}</button>)}
        <span style={{ fontSize: 11, opacity: .6, marginLeft: 8 }}>force tier:</span>
        {(['auto', 'quiet', 'groove', 'peak'] as const).map(t => <button key={t} style={btn(tier === t)} onClick={() => setTier(t)}>{t}</button>)}
        <label style={{ ...btn(false), marginLeft: 8 }}>⬆ Your song…<input type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => {
          const fl = e.target.files?.[0]; if (!fl || !fileEl.current) return; synth.stop(); fileEl.current.src = URL.createObjectURL(fl);
          const media = synth.ctx.createMediaElementSource(fileEl.current); media.connect(synth.out); synth.ctx.resume(); fileEl.current.play(); setPlaying(true);
        }} /></label>
        <audio ref={fileEl} />
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
