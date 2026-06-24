// TimelineMode — the actual Pixels timeline editor. Shows the loaded track's
// waveform, lets you DRAG scenes (your populated launcher columns) onto a timeline
// track, AUTO-CUT them to the song's beats, move/trim the blocks, and render the
// result (Fast/Accurate) using the stored music analysis. Pulls the current session
// track + scenes automatically.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { X, Film, Zap, Crosshair, Scissors, Trash2, Download, Loader2, Music } from 'lucide-react';
import { renderTimeline } from '../engine/core/offlineRenderer';
import { getAnalysis, MusicAnalysis } from '../engine/core/musicAnalysis';
import { snapshotFromColumn, makeBlock, SceneTimeline } from '../engine/timeline/sceneTimeline';
import SceneView from './SceneView';

interface Props {
  layers: any[];
  config: any;
  analyser?: AnalyserNode | null;
  sessionAudioUrl?: string;
  sessionAudioName?: string;
  onClose: () => void;
}

type AnalysisState = 'none' | 'analyzing' | 'done';

interface Block { id: string; col: number; start: number; duration: number; }
const COLS = 8;
const uid = () => Math.random().toString(36).slice(2, 9);

// Onset/beat times from the stored analysis (bass-envelope peaks).
function detectBeats(a: MusicAnalysis): number[] {
  const beats: number[] = [];
  const bEnd = Math.max(1, Math.floor(a.bins * 0.1));
  const hist: number[] = []; let last = -1;
  for (let i = 0; i < a.frames; i++) {
    let bass = 0; for (let b = 0; b < bEnd; b++) bass += a.freq[i * a.bins + b];
    bass /= bEnd * 255;
    hist.push(bass); if (hist.length > 22) hist.shift();
    const avg = hist.reduce((s, v) => s + v, 0) / hist.length;
    const t = i / a.fps;
    if (bass > avg * 1.4 && bass > 0.22 && (last < 0 || t - last > 0.22)) { beats.push(t); last = t; }
  }
  return beats;
}

const TimelineMode: React.FC<Props> = ({ layers, config, analyser, sessionAudioUrl, sessionAudioName, onClose }) => {
  const [song, setSong] = useState<{ name: string; buffer: AudioBuffer; bytes: ArrayBuffer } | null>(null);
  const [analysis, setAnalysis] = useState<MusicAnalysis | null>(null);
  const [anState, setAnState] = useState<AnalysisState>('none');
  const [beats, setBeats] = useState<number[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [mode, setMode] = useState<'fast' | 'accurate'>('fast');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [playhead, setPlayhead] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const waveRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragRef = useRef<{ kind: 'palette' | 'move' | 'trim'; col?: number; id?: string; grab?: number } | null>(null);

  const dur = song?.buffer.duration || 0;
  const populated = layers ? Array.from({ length: COLS }, (_, c) => c).filter(c =>
    layers.some(l => l && !l.bypassed && !l.muted && l.clips?.[c] && l.clips[c].type !== 'empty')) : [];

  // The scene under the playhead → drives the live preview monitor.
  const activeBlock = blocks.find(b => playhead >= b.start && playhead < b.start + b.duration) || null;
  const activeCol = activeBlock ? activeBlock.col : -1;
  const previewSnapshot = useMemo(() => (activeCol >= 0 ? snapshotFromColumn(layers, activeCol, `Scene ${activeCol + 1}`) : null), [activeCol, layers]);

  const decode = async (data: ArrayBuffer, name: string) => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffer = await ctx.decodeAudioData(data.slice(0));
    ctx.close();
    setSong({ name, buffer, bytes: data });
    setStage('Analyzing music…'); setAnState('analyzing');
    try {
      const a = await getAnalysis(data, buffer);
      setAnalysis(a); setBeats(detectBeats(a)); setAnState('done');
    } catch { setAnState('none'); setErr('Music analysis failed.'); }
    setStage('');
  };

  useEffect(() => {
    if (!sessionAudioUrl) return; let cancelled = false;
    (async () => { try { const d = await (await fetch(sessionAudioUrl)).arrayBuffer(); if (!cancelled) await decode(d, sessionAudioName || 'Session track'); } catch { /* */ } })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAudioUrl]);

  // Draw waveform + beat ticks.
  useEffect(() => {
    const c = waveRef.current, b = song?.buffer; if (!c || !b) return;
    const W = c.width = c.clientWidth, H = c.height = c.clientHeight;
    const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, W, H);
    const data = b.getChannelData(0); const step = Math.max(1, Math.floor(data.length / W));
    // RED = not analyzed · YELLOW = analyzing · GREEN = analyzed.
    ctx.fillStyle = anState === 'done' ? '#3f9c5e' : anState === 'analyzing' ? '#bdaa3c' : '#9c4444';
    for (let x = 0; x < W; x++) {
      let mn = 1, mx = -1; for (let i = 0; i < step; i++) { const v = data[x * step + i] || 0; if (v < mn) mn = v; if (v > mx) mx = v; }
      const y1 = (1 - mx) * H / 2, y2 = (1 - mn) * H / 2; ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
    if (anState === 'done') {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (const t of beats) { const x = (t / (dur || 1)) * W; ctx.fillRect(x, 0, 1, H); }
    }
  }, [song, beats, dur, anState]);

  const xToT = (clientX: number) => { const r = trackRef.current!.getBoundingClientRect(); return Math.max(0, Math.min(dur, ((clientX - r.left) / r.width) * dur)); };

  // Drag from palette → drop on track; or move/trim a block.
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      const t = xToT(e.clientX);
      if (d.kind === 'move') setBlocks(bs => bs.map(b => b.id === d.id ? { ...b, start: Math.max(0, t - (d.grab || 0)) } : b));
      else if (d.kind === 'trim') setBlocks(bs => bs.map(b => b.id === d.id ? { ...b, duration: Math.max(0.2, t - b.start) } : b));
    };
    const up = (e: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      if (d.kind === 'palette' && trackRef.current) {
        const r = trackRef.current.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 40 && e.clientY <= r.bottom + 40) {
          const t = xToT(e.clientX); setBlocks(bs => [...bs, { id: uid(), col: d.col!, start: t, duration: 2 }]);
        }
      }
      dragRef.current = null;
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dur]);

  const autoCut = useCallback(() => {
    if (!beats.length) { setErr('Load a track first — analysis must finish (waveform green) so there are beats.'); return; }
    if (!populated.length) { setErr('Add some scenes to the launcher first.'); return; }
    // Walk the beats; block length VARIES with the music — dense/fast sections (drum
    // fills) cut every 1–2 beats, calmer sections hold for 3–6. Scene per block is
    // randomly chosen (no immediate repeat), so lengths + scenes vary across the song.
    const nb: Block[] = [];
    let i = 0, lastCol = -1;
    while (i < beats.length) {
      const start = beats[i];
      const gap = i + 1 < beats.length ? beats[i + 1] - beats[i] : 0.5;
      const per = gap < 0.34 ? 1 + (Math.random() < 0.5 ? 0 : 1) : 2 + Math.floor(Math.random() * 4);
      const endIdx = Math.min(beats.length, i + per);
      const end = endIdx < beats.length ? beats[endIdx] : dur;
      let col = populated[Math.floor(Math.random() * populated.length)];
      if (populated.length > 1 && col === lastCol) col = populated[(populated.indexOf(col) + 1) % populated.length];
      lastCol = col;
      nb.push({ id: uid(), col, start, duration: Math.max(0.2, end - start) });
      i = endIdx;
    }
    setBlocks(nb); setErr(null);
  }, [beats, populated, dur]);

  const render = async () => {
    if (!song || !blocks.length) { setErr('Add scenes to the timeline first (drag, or Auto-cut).'); return; }
    setBusy(true); setErr(null); setProgress(0); setStage('Preparing'); abortRef.current = new AbortController();
    try {
      const tl: SceneTimeline = {
        duration: Math.max(dur, ...blocks.map(b => b.start + b.duration)),
        blocks: [...blocks].sort((a, b) => a.start - b.start).map(b => {
          const blk = makeBlock(snapshotFromColumn(layers, b.col, `Scene ${b.col + 1}`), b.start, b.duration); return blk;
        }),
      };
      const blob = await renderTimeline({
        timeline: tl, audioBuffer: song.buffer, analysis: analysis || undefined, config,
        width: 1920, height: 1080, fps: 30, fast: mode === 'fast',
        onProgress: (p, s) => { setProgress(p); setStage(s); }, signal: abortRef.current.signal,
      });
      if (!blob) { setErr('Render failed or cancelled (see console).'); setBusy(false); return; }
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = `${song.name.replace(/\.[^.]+$/, '')}-pixels.mp4`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000); setStage('Saved');
    } catch (e) { setErr(String((e as Error)?.message || e)); } finally { setBusy(false); }
  };

  const sceneColor = (col: number) => `hsl(${(col * 47) % 360} 70% 55%)`;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0c0c12', zIndex: 9999, display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: '1px solid #22222e' }}>
        <Film size={18} color="#FF8C00" /><span style={{ fontWeight: 700 }}>Timeline</span>
        <span style={{ fontSize: 11, color: '#8a8a98' }}>{song ? `${song.name} · ${dur.toFixed(1)}s · ${beats.length} beats` : 'No track loaded'}</span>
        {song && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#bbb' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: anState === 'done' ? '#3f9c5e' : anState === 'analyzing' ? '#bdaa3c' : '#9c4444' }} />
            {anState === 'done' ? 'Analyzed' : anState === 'analyzing' ? 'Analyzing…' : 'Not analyzed'}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setMode('fast')} style={tabStyle(mode === 'fast')}><Zap size={12} /> Fast</button>
        <button onClick={() => setMode('accurate')} style={tabStyle(mode === 'accurate')}><Crosshair size={12} /> Accurate</button>
        <button onClick={render} disabled={busy || !blocks.length} style={{ ...btn, background: blocks.length && !busy ? 'linear-gradient(90deg,#FF8C00,#ffa733)' : '#3a3a48', color: blocks.length && !busy ? '#1a1a1a' : '#888', fontWeight: 700 }}><Download size={14} /> Render</button>
        <button onClick={onClose} disabled={busy} style={{ ...btn, background: 'transparent', color: '#888' }}><X size={18} /></button>
      </div>

      {/* scene palette */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderBottom: '1px solid #1a1a24', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: '#8a8a98', textTransform: 'uppercase', letterSpacing: 1 }}>Scenes — drag onto the timeline</span>
        {populated.length ? populated.map(c => (
          <div key={c} onMouseDown={() => { dragRef.current = { kind: 'palette', col: c }; }}
            style={{ padding: '6px 12px', borderRadius: 7, background: sceneColor(c), color: '#000', fontWeight: 700, fontSize: 12, cursor: 'grab', userSelect: 'none' }}>
            Scene {c + 1}
          </div>
        )) : <span style={{ fontSize: 11, color: '#ff8080' }}>No scenes in the launcher yet.</span>}
        <div style={{ flex: 1 }} />
        <button onClick={autoCut} disabled={!beats.length} style={{ ...btn, background: '#1f1f2b', color: '#FF8C00' }}><Scissors size={13} /> Auto-cut to beats</button>
        <button onClick={() => setBlocks([])} style={{ ...btn, background: '#1f1f2b', color: '#bbb' }}><Trash2 size={13} /> Clear</button>
      </div>

      {/* timeline */}
      <div style={{ flex: 1, padding: 18, overflow: 'auto' }}>
        {!song && <div style={{ textAlign: 'center', color: '#8a8a98', marginTop: 40 }}>
          <Music size={28} color="#444" /><div style={{ marginTop: 10, fontSize: 13 }}>Load a track in the session, or pick one:</div>
          <input type="file" accept="audio/*" onChange={e => e.target.files?.[0] && e.target.files[0].arrayBuffer().then(d => decode(d, e.target.files![0].name))} style={{ marginTop: 10, color: '#ccc', fontSize: 12 }} />
        </div>}
        {song && (
          <div style={{ width: 'min(46%, 640px)', aspectRatio: '16/9', margin: '0 auto 16px', background: '#000', borderRadius: 8, overflow: 'hidden', border: '1px solid #22222e', position: 'relative' }}>
            {previewSnapshot
              ? <SceneView snapshot={previewSnapshot} analyser={analyser ?? null} palette={config.colorPalette} playing={true} />
              : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 12 }}>No scene at the playhead — click the timeline to scrub</div>}
            <div style={{ position: 'absolute', top: 6, left: 8, fontSize: 10, color: '#9a9aa8', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 4 }}>PREVIEW · {activeBlock ? `Scene ${activeBlock.col + 1}` : '—'} · {playhead.toFixed(1)}s</div>
          </div>
        )}
        {song && (
          <div ref={trackRef} onClick={(e) => !dragRef.current && setPlayhead(xToT(e.clientX))}
            style={{ position: 'relative', height: 160, background: '#101018', borderRadius: 8, border: '1px solid #22222e', overflow: 'hidden', cursor: 'crosshair' }}>
            <canvas ref={waveRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
            {/* scene blocks */}
            {blocks.map(b => (
              <div key={b.id} onMouseDown={(e) => { e.stopPropagation(); dragRef.current = { kind: 'move', id: b.id, grab: xToT(e.clientX) - b.start }; }}
                style={{ position: 'absolute', top: 10, bottom: 10, left: `${(b.start / dur) * 100}%`, width: `${(b.duration / dur) * 100}%`, minWidth: 8, background: sceneColor(b.col), opacity: 0.82, borderRadius: 5, border: '1px solid rgba(0,0,0,0.4)', cursor: 'grab', overflow: 'hidden', color: '#000', fontSize: 11, fontWeight: 700, padding: '4px 6px' }}>
                Scene {b.col + 1}
                <div onMouseDown={(e) => { e.stopPropagation(); dragRef.current = { kind: 'trim', id: b.id }; }}
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 7, cursor: 'ew-resize', background: 'rgba(0,0,0,0.35)' }} />
              </div>
            ))}
            {/* playhead */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(playhead / dur) * 100}%`, width: 2, background: '#fff', pointerEvents: 'none' }} />
          </div>
        )}

        {busy && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#bbb', marginBottom: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={12} className="animate-spin" /> {stage}</span><span>{Math.round(progress * 100)}%</span>
            </div>
            <div style={{ height: 6, background: '#22222e', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg,#FF8C00,#ffb347)', transition: 'width .2s' }} /></div>
            <button onClick={() => abortRef.current?.abort()} style={{ ...btn, marginTop: 8, background: 'transparent', border: '1px solid #444', color: '#ddd' }}>Cancel</button>
          </div>
        )}
        {err && <div style={{ fontSize: 12, color: '#ff8080', marginTop: 12 }}>{err}</div>}
      </div>
    </div>
  );
};

const btn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5 };
const tabStyle = (on: boolean): React.CSSProperties => ({ ...btn, background: on ? 'rgba(255,140,0,0.14)' : 'transparent', border: `1px solid ${on ? '#FF8C00' : '#2a2a38'}`, color: '#fff' });

export default TimelineMode;
