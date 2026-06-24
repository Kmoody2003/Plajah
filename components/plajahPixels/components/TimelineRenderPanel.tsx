// TimelineRenderPanel — render the current session's scenes to an MP4. Pulls the
// track loaded in the session automatically (no file-pick needed) and offers two
// modes: FAST (media seeks aren't awaited — no per-frame stall, ~much quicker) and
// ACCURATE (frame/beat/sample-perfect, slower). Generators / shaders / text / titles
// / node-graphs all render; milkdrop is live-only (can't be frame-stepped).
// The full drag-scenes-onto-the-waveform + auto-cut-to-drums timeline UI is next.

import React, { useEffect, useRef, useState } from 'react';
import { X, Film, Loader2, Download, Zap, Crosshair } from 'lucide-react';
import { renderTimeline } from '../engine/core/offlineRenderer';
import { snapshotFromColumn, makeBlock, SceneTimeline } from '../engine/timeline/sceneTimeline';

interface Props {
  layers: any[];                 // live launcher layers
  config: any;                   // VisualizationConfig
  sessionAudioUrl?: string;      // the track currently loaded in the session
  sessionAudioName?: string;
  onClose: () => void;
}

const COLS = 8;

const TimelineRenderPanel: React.FC<Props> = ({ layers, config, sessionAudioUrl, sessionAudioName, onClose }) => {
  const [song, setSong] = useState<{ name: string; buffer: AudioBuffer } | null>(null);
  const [mode, setMode] = useState<'fast' | 'accurate'>('fast');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const decode = async (data: ArrayBuffer, name: string) => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffer = await ctx.decodeAudioData(data);
    ctx.close();
    setSong({ name, buffer });
  };

  // Auto-pull the session's loaded track.
  useEffect(() => {
    if (!sessionAudioUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await (await fetch(sessionAudioUrl)).arrayBuffer();
        if (!cancelled) await decode(data, sessionAudioName || 'Session track');
      } catch { /* fall back to manual pick */ }
    })();
    return () => { cancelled = true; };
  }, [sessionAudioUrl, sessionAudioName]);

  const loadFile = async (file: File) => {
    setErr(null);
    try { await decode(await file.arrayBuffer(), file.name); }
    catch { setErr('Could not decode that audio file.'); }
  };

  const buildTimeline = (duration: number): SceneTimeline => {
    const populated: number[] = [];
    for (let c = 0; c < COLS; c++) {
      const has = layers.some(l => l && !l.bypassed && !l.muted && l.clips?.[c] && l.clips[c].type !== 'empty');
      if (has) populated.push(c);
    }
    const cols = populated.length ? populated : [0];
    const per = duration / cols.length;
    const blocks = cols.map((c, i) => makeBlock(snapshotFromColumn(layers, c, `Scene ${c + 1}`), i * per, per));
    return { blocks, duration };
  };

  const startRender = async () => {
    if (!song) return;
    setBusy(true); setErr(null); setProgress(0); setStage('Preparing');
    abortRef.current = new AbortController();
    try {
      const timeline = buildTimeline(song.buffer.duration);
      if (!timeline.blocks.some(b => b.snapshot.layers.length)) {
        setErr('No renderable scenes found. Add clips to the launcher first.');
        setBusy(false); return;
      }
      const blob = await renderTimeline({
        timeline, audioBuffer: song.buffer, config,
        width: 1920, height: 1080, fps: 30, fast: mode === 'fast',
        onProgress: (p, s) => { setProgress(p); setStage(s); },
        signal: abortRef.current.signal,
      });
      if (!blob) { setErr('Render failed or was cancelled (see console).'); setBusy(false); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${song.name.replace(/\.[^.]+$/, '')}-pixels.mp4`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setStage('Saved');
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => abortRef.current?.abort();
  const modeBtn = (m: 'fast' | 'accurate', Icon: any, label: string, sub: string) => (
    <button onClick={() => setMode(m)} disabled={busy}
      style={{ flex: 1, padding: '10px 12px', borderRadius: 8, textAlign: 'left', cursor: busy ? 'not-allowed' : 'pointer',
        border: `1px solid ${mode === m ? '#FF8C00' : '#2a2a38'}`, background: mode === m ? 'rgba(255,140,0,0.12)' : 'transparent', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 13 }}><Icon size={14} color={mode === m ? '#FF8C00' : '#888'} /> {label}</div>
      <div style={{ fontSize: 10.5, color: '#9a9aa8', marginTop: 3 }}>{sub}</div>
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ width: 540, maxWidth: '92vw', background: '#14141c', border: '1px solid #2a2a38', borderRadius: 14, padding: 22, color: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Film size={18} color="#FF8C00" />
            <span style={{ fontWeight: 600 }}>Render Timeline <span style={{ color: '#FF8C00', fontSize: 11 }}>beta</span></span>
          </div>
          <button onClick={onClose} disabled={busy} style={{ background: 'none', border: 'none', color: '#888', cursor: busy ? 'not-allowed' : 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
          {modeBtn('fast', Zap, 'Fast', 'Quick render of the whole composite. Media timing approximate.')}
          {modeBtn('accurate', Crosshair, 'Accurate', 'Frame/beat/sample-perfect master. Slower.')}
        </div>

        <div style={{ marginBottom: 14, fontSize: 11.5, color: '#bbb' }}>
          <div style={{ marginBottom: 6 }}>Song {song ? <span style={{ color: '#7fd17f' }}>· {song.name} ({song.buffer.duration.toFixed(1)}s)</span> : <span style={{ color: '#9a9aa8' }}>· using the session track if loaded, or pick one:</span>}</div>
          {!song && <input type="file" accept="audio/*" disabled={busy} onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} style={{ fontSize: 12, color: '#ccc', width: '100%' }} />}
        </div>

        {busy && (
          <div style={{ margin: '14px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#bbb', marginBottom: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={12} className="animate-spin" /> {stage}</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div style={{ height: 6, background: '#26263a', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg,#FF8C00,#ffb347)', transition: 'width .2s' }} />
            </div>
          </div>
        )}

        {err && <div style={{ fontSize: 12, color: '#ff8080', margin: '10px 0' }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          {busy
            ? <button onClick={cancel} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #444', background: 'transparent', color: '#ddd', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            : <button onClick={startRender} disabled={!song} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: song ? 'linear-gradient(90deg,#FF8C00,#ffa733)' : '#3a3a48', color: song ? '#1a1a1a' : '#888', fontWeight: 600, cursor: song ? 'pointer' : 'not-allowed', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Download size={15} /> Render &amp; Download
              </button>}
        </div>
      </div>
    </div>
  );
};

export default TimelineRenderPanel;
