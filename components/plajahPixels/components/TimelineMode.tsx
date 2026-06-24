// TimelineMode — the actual Pixels timeline editor. Shows the loaded track's
// waveform, lets you DRAG scenes (your populated launcher columns) onto a timeline
// track, AUTO-CUT them to the song's beats, move/trim the blocks, and render the
// result (Fast/Accurate) using the stored music analysis. Pulls the current session
// track + scenes automatically.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { X, Film, Zap, Crosshair, Scissors, Trash2, Download, Loader2, Music, Play, Pause, SkipBack } from 'lucide-react';
import { renderTimeline } from '../engine/core/offlineRenderer';
import { getAnalysis, analysisAt, MusicAnalysis } from '../engine/core/musicAnalysis';
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
    if (bass > avg * 1.3 && bass > 0.12 && (last < 0 || t - last > 0.2)) { beats.push(t); last = t; }
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const clipRef = useRef<{ col: number; duration: number } | null>(null);
  const restoredRef = useRef<string | null>(null);
  const snapRef = useRef(true); snapRef.current = snap;
  const beatsRef = useRef<number[]>([]);
  const blocksRef = useRef<Block[]>([]);
  const [playing, setPlaying] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playAnalyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);

  const waveRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragRef = useRef<{ kind: 'palette' | 'move' | 'trim'; col?: number; id?: string; grab?: number; start?: number; duration?: number } | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const placeGhost = (clientX: number, clientY: number) => {
    const g = ghostRef.current; if (!g) return;
    const o = overlayRef.current?.getBoundingClientRect();
    g.style.left = `${clientX - (o?.left || 0) + 10}px`; g.style.top = `${clientY - (o?.top || 0) + 6}px`;
  };

  const dur = song?.buffer.duration || 0;
  beatsRef.current = beats; blocksRef.current = blocks;
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

  // Direct-DOM drag (no per-move re-render → glides). Commit to state on mouse-up.
  useEffect(() => {
    const el = (id: string) => trackRef.current?.querySelector(`[data-blk="${id}"]`) as HTMLElement | null;
    // Snap a time to the nearest beat or another block's edge (when snapping is on).
    const snapT = (t: number, excludeId?: string) => {
      if (!snapRef.current || !dur) return t;
      const thr = Math.max(0.05, dur * 0.006);
      let best = t, bd = thr;
      for (const bt of beatsRef.current) { const dd = Math.abs(bt - t); if (dd < bd) { best = bt; bd = dd; } }
      for (const b of blocksRef.current) { if (b.id === excludeId) continue; for (const edge of [b.start, b.start + b.duration]) { const dd = Math.abs(edge - t); if (dd < bd) { best = edge; bd = dd; } } }
      return best;
    };
    const move = (e: MouseEvent) => {
      const d = dragRef.current; if (!d || !dur) return;
      const t = xToT(e.clientX);
      if (d.kind === 'move' && d.id) {
        let start = Math.max(0, Math.min(dur - (d.duration || 0.2), t - (d.grab || 0)));
        start = Math.max(0, Math.min(dur - (d.duration || 0.2), snapT(start, d.id)));
        d.start = start; const n = el(d.id); if (n) n.style.left = `${(start / dur) * 100}%`;
      } else if (d.kind === 'trim' && d.id) {
        let end = snapT((d.start || 0) + Math.max(0.2, t - (d.start || 0)), d.id);
        const duration = Math.max(0.2, Math.min(dur - (d.start || 0), end - (d.start || 0)));
        d.duration = duration; const n = el(d.id); if (n) n.style.width = `${(duration / dur) * 100}%`;
      } else if (d.kind === 'palette' && ghostRef.current) {
        ghostRef.current.style.display = 'block'; placeGhost(e.clientX, e.clientY);
      }
    };
    const up = (e: MouseEvent) => {
      const d = dragRef.current; dragRef.current = null;
      if (ghostRef.current) ghostRef.current.style.display = 'none';
      if (!d) return;
      if (d.kind === 'move' && d.id && d.start != null) setBlocks(bs => bs.map(b => b.id === d.id ? { ...b, start: d.start! } : b));
      else if (d.kind === 'trim' && d.id && d.duration != null) setBlocks(bs => bs.map(b => b.id === d.id ? { ...b, duration: d.duration! } : b));
      else if (d.kind === 'palette' && trackRef.current) {
        const r = trackRef.current.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 70 && e.clientY <= r.bottom + 70) {
          const nid = uid(); const t = Math.max(0, Math.min(dur - 2, xToT(e.clientX)));
          setBlocks(bs => [...bs, { id: nid, col: d.col!, start: t, duration: 2 }]); setSelectedId(nid);
        }
      }
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dur]);

  // Copy / paste / delete the selected block.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'c' || e.key === 'C') && selectedId) { const b = blocks.find(x => x.id === selectedId); if (b) clipRef.current = { col: b.col, duration: b.duration }; }
      else if (mod && (e.key === 'v' || e.key === 'V') && clipRef.current) { e.preventDefault(); const nid = uid(); const c = clipRef.current; setBlocks(bs => [...bs, { id: nid, col: c.col, start: playhead, duration: c.duration }]); setSelectedId(nid); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { setBlocks(bs => bs.filter(x => x.id !== selectedId)); setSelectedId(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, blocks, playhead]);

  // Auto-save the timeline per track, and restore it once when the track loads.
  useEffect(() => {
    if (!song || restoredRef.current === song.name) return;
    restoredRef.current = song.name;
    try { const s = localStorage.getItem('pixels:tl:' + song.name); if (s) { const arr = JSON.parse(s); if (Array.isArray(arr)) setBlocks(arr); } } catch { /* */ }
  }, [song]);
  useEffect(() => {
    if (!song) return;
    try { localStorage.setItem('pixels:tl:' + song.name, JSON.stringify(blocks)); } catch { /* */ }
  }, [blocks, song]);

  // Preview transport: play the song from the playhead; the preview reacts to a
  // local analyser tapped off the actual playback, and the playhead advances.
  const stopPlayback = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const s = sourceRef.current; if (s) { try { s.onended = null; s.stop(); } catch { /* */ } sourceRef.current = null; }
    playAnalyserRef.current = null; setPlaying(false);
  }, []);
  const playFrom = useCallback((t: number) => {
    if (!song) return;
    stopPlayback();
    const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx; if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource(); src.buffer = song.buffer;
    const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0.7;
    src.connect(an); an.connect(ctx.destination);
    const startT = Math.max(0, Math.min(t, song.buffer.duration - 0.02));
    src.start(0, startT);
    sourceRef.current = src; playAnalyserRef.current = an;
    const startCtx = ctx.currentTime; setPlaying(true);
    const tick = () => {
      if (!sourceRef.current) return;
      const cur = startT + (ctx.currentTime - startCtx);
      if (cur >= song.buffer.duration) { stopPlayback(); setPlayhead(song.buffer.duration); return; }
      setPlayhead(cur); rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [song, stopPlayback]);
  useEffect(() => () => { stopPlayback(); audioCtxRef.current?.close().catch(() => {}); }, [stopPlayback]);

  const autoCut = useCallback(() => {
    try {
      if (!dur || !song) { setErr('No track loaded — load a track in the session, or pick an audio file at the top of the timeline.'); return; }
      if (!populated.length) { setErr('No scenes found — add a clip to a launcher column first (the scene chips appear above).'); return; }
      // Cut points: detected beats if we have enough, else a uniform ~0.5s grid so it
      // always works. Block length VARIES with the music — dense/fast sections (drum
      // fills) cut every 1–2 beats, calmer ones hold 3–6; the scene per block is random.
      const cuts = beats.length >= 4 ? beats.slice() : Array.from({ length: Math.max(4, Math.floor(dur / 0.5)) }, (_, i) => (i * dur) / Math.max(4, Math.floor(dur / 0.5)));
      const nb: Block[] = [];
      let i = 0, lastCol = -1, guard = 0;
      while (i < cuts.length && guard++ < 100000) {
        const start = cuts[i];
        const gap = i + 1 < cuts.length ? cuts[i + 1] - cuts[i] : 0.5;
        const per = gap < 0.34 ? 1 + (Math.random() < 0.5 ? 0 : 1) : 2 + Math.floor(Math.random() * 4);
        const endIdx = Math.min(cuts.length, i + Math.max(1, per));
        const end = endIdx < cuts.length ? cuts[endIdx] : dur;
        let col = populated[Math.floor(Math.random() * populated.length)];
        if (populated.length > 1 && col === lastCol) col = populated[(populated.indexOf(col) + 1) % populated.length];
        lastCol = col;
        nb.push({ id: uid(), col, start, duration: Math.max(0.2, end - start) });
        i = Math.max(i + 1, endIdx);
      }
      if (!nb.length) { setErr('Auto-cut produced no blocks (track too short?).'); return; }
      setBlocks(nb); setSelectedId(null); setErr(null);
      setFlash(`Placed ${nb.length} scene${nb.length === 1 ? '' : 's'}${beats.length >= 4 ? ' on the beats' : ' on a grid'}`);
      setTimeout(() => setFlash(null), 2200);
    } catch (e) { setErr('Auto-cut error: ' + ((e as Error)?.message || e)); }
  }, [beats, populated, dur, song]);

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
    <div ref={overlayRef} style={{ position: 'fixed', inset: 0, background: '#0c0c12', zIndex: 9999, display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <div ref={ghostRef} style={{ position: 'absolute', display: 'none', pointerEvents: 'none', zIndex: 10001, padding: '5px 10px', borderRadius: 6, background: '#FF8C00', color: '#000', fontWeight: 700, fontSize: 11, opacity: 0.92 }}>Scene</div>
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
          <div key={c} onMouseDown={(e) => { dragRef.current = { kind: 'palette', col: c }; const g = ghostRef.current; if (g) { g.textContent = `Scene ${c + 1}`; g.style.display = 'block'; placeGhost(e.clientX, e.clientY); } }}
            style={{ padding: '6px 12px', borderRadius: 7, background: sceneColor(c), color: '#000', fontWeight: 700, fontSize: 12, cursor: 'grab', userSelect: 'none' }}>
            Scene {c + 1}
          </div>
        )) : <span style={{ fontSize: 11, color: '#ff8080' }}>No scenes in the launcher yet.</span>}
        <span style={{ fontSize: 10, color: '#666' }}>· click a block, Ctrl+C / Ctrl+V to copy, Del to remove · auto-saved</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setSnap(s => !s)} title="Snap blocks to the nearest beat or another block's edge" style={{ ...btn, background: snap ? 'rgba(255,140,0,0.14)' : '#1f1f2b', color: snap ? '#FF8C00' : '#bbb', border: `1px solid ${snap ? '#FF8C00' : 'transparent'}` }}><Crosshair size={13} /> Snap {snap ? 'On' : 'Off'}</button>
        <button onClick={autoCut} style={{ ...btn, background: '#1f1f2b', color: '#FF8C00' }}><Scissors size={13} /> Auto-cut to beats</button>
        <button onClick={() => setBlocks([])} style={{ ...btn, background: '#1f1f2b', color: '#bbb' }}><Trash2 size={13} /> Clear</button>
      </div>

      {(flash || err) && (
        <div style={{ padding: '7px 18px', fontSize: 12.5, fontWeight: 600, color: err ? '#ff9090' : '#84e08a', background: err ? 'rgba(255,80,80,0.08)' : 'rgba(127,209,127,0.08)', borderBottom: '1px solid #1a1a24' }}>
          {err ? `⚠ ${err}` : `✓ ${flash}`}
        </div>
      )}

      {/* timeline */}
      <div style={{ flex: 1, padding: 18, overflow: 'auto' }}>
        {!song && <div style={{ textAlign: 'center', color: '#8a8a98', marginTop: 40 }}>
          <Music size={28} color="#444" /><div style={{ marginTop: 10, fontSize: 13 }}>Load a track in the session, or pick one:</div>
          <input type="file" accept="audio/*" onChange={e => e.target.files?.[0] && e.target.files[0].arrayBuffer().then(d => decode(d, e.target.files![0].name))} style={{ marginTop: 10, color: '#ccc', fontSize: 12 }} />
        </div>}
        {song && (
          <div style={{ width: 'min(46%, 640px)', aspectRatio: '16/9', margin: '0 auto 16px', background: '#000', borderRadius: 8, overflow: 'hidden', border: '1px solid #22222e', position: 'relative' }}>
            {previewSnapshot
              ? <SceneView snapshot={previewSnapshot} audioFrame={analysis ? analysisAt(analysis, playhead) : null} analyser={analyser ?? null} palette={config.colorPalette} playing={true} />
              : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 12 }}>No scene at the playhead — press play or click the timeline to scrub</div>}
            <div style={{ position: 'absolute', top: 6, left: 8, fontSize: 10, color: '#9a9aa8', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 4 }}>PREVIEW · {activeBlock ? `Scene ${activeBlock.col + 1}` : '—'} · {playhead.toFixed(1)}s</div>
            <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button onClick={() => { stopPlayback(); setPlayhead(0); }} title="Back to start" style={transport}><SkipBack size={15} /></button>
              <button onClick={() => playing ? stopPlayback() : playFrom(playhead)} title={playing ? 'Pause' : 'Play'} style={transport}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
            </div>
          </div>
        )}
        {song && (
          <div ref={trackRef} onClick={(e) => !dragRef.current && setPlayhead(xToT(e.clientX))}
            style={{ position: 'relative', height: 160, background: '#101018', borderRadius: 8, border: '1px solid #22222e', overflow: 'hidden', cursor: 'crosshair' }}>
            <canvas ref={waveRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
            {/* scene blocks */}
            {blocks.map(b => (
              <div key={b.id} data-blk={b.id}
                onMouseDown={(e) => { e.stopPropagation(); setSelectedId(b.id); dragRef.current = { kind: 'move', id: b.id, grab: xToT(e.clientX) - b.start, start: b.start, duration: b.duration }; }}
                style={{ position: 'absolute', top: 10, bottom: 10, left: `${(b.start / dur) * 100}%`, width: `${(b.duration / dur) * 100}%`, minWidth: 8, background: sceneColor(b.col), opacity: selectedId === b.id ? 1 : 0.82, borderRadius: 5, border: selectedId === b.id ? '2px solid #fff' : '1px solid rgba(0,0,0,0.4)', cursor: 'grab', overflow: 'hidden', color: '#000', fontSize: 11, fontWeight: 700, padding: '4px 6px', willChange: 'left,width' }}>
                Scene {b.col + 1}
                <div onMouseDown={(e) => { e.stopPropagation(); setSelectedId(b.id); dragRef.current = { kind: 'trim', id: b.id, start: b.start, duration: b.duration }; }}
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', background: 'rgba(0,0,0,0.35)' }} />
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
const transport: React.CSSProperties = { width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const tabStyle = (on: boolean): React.CSSProperties => ({ ...btn, background: on ? 'rgba(255,140,0,0.14)' : 'transparent', border: `1px solid ${on ? '#FF8C00' : '#2a2a38'}`, color: '#fff' });

export default TimelineMode;
