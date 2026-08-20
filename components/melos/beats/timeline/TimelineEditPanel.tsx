// The Timeline bottom edit panel (feature 3) — Bitwig's detail editor, mirrored.
//
// Select a clip up top and this becomes its editor: the track's DEVICE chain, a per-clip NOTE
// editor (MIDI), or an AUDIO editor with split / normalize / reverse / fades / silence and a
// real time-stretch (services/melos/beats/audio/timeStretch.ts — a phase-vocoder with transient
// preservation, plus a WSOLA path). Resizable. Audio ops are non-destructive: they decode the
// clip's sample, run the op, and write a NEW content-addressed sample back onto the clip.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripHorizontal, Scissors, Wand2 } from 'lucide-react';
import type { GrooveDoc, ArrangeTrack, TimelineClip } from '../../../../services/melos/beats/grooveDoc';
import type { FxInstance } from '../../../../services/melos/beats/fx/devices';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { ingestSample } from '../../../../services/melos/beats/sampleStore';
import * as edit from '../../../../services/melos/beats/audio/audioEdit';
import { timeStretchBuffer, type StretchAlgo } from '../../../../services/melos/beats/audio/timeStretch';
import { FxRack } from '../project/FxRack';
import { PLAYHEAD } from '../theme';

type Tab = 'device' | 'note' | 'audio';

interface Props {
  doc: GrooveDoc;
  selected: { trackId: string; clipId: string } | null;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  height: number;
  onResize: (h: number) => void;
}

const decodeCtx = () => new OfflineAudioContext(2, 128, 48000);

export const TimelineEditPanel: React.FC<Props> = ({ doc, selected, onMutate, height, onResize }) => {
  const track = selected ? doc.arrangement.find((t) => t.id === selected.trackId) : null;
  const clip = track && selected ? track.clips.find((c) => c.id === selected.clipId) : null;
  const kind = track?.kind;
  const [tab, setTab] = useState<Tab>('audio');
  const resize = useRef<{ y: number; h: number } | null>(null);

  useEffect(() => {
    // Default the tab to the clip's natural editor.
    if (kind === 'audio') setTab('audio');
    else if (kind === 'instrument') setTab('note');
    else setTab('device');
  }, [kind, selected?.clipId]);

  const onResizeDown = (e: React.PointerEvent) => { resize.current = { y: e.clientY, h: height }; (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const onResizeMove = (e: React.PointerEvent) => { const r = resize.current; if (r) onResize(Math.max(140, Math.min(560, r.h + (r.y - e.clientY)))); };

  const availableTabs: Tab[] = [];
  if (kind === 'audio') availableTabs.push('audio');
  if (kind === 'instrument') availableTabs.push('note');
  availableTabs.push('device');

  return (
    <div className="flex flex-col flex-none border-t border-white/10 bg-[#0b0710]" style={{ height }}>
      <div className="h-4 flex items-center justify-center cursor-ns-resize touch-none" onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={() => { resize.current = null; }}>
        <GripHorizontal size={13} className="text-white/25" />
      </div>
      <div className="flex items-center gap-1.5 px-3 pb-1.5">
        {availableTabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="h-7 px-3 rounded-lg text-[11px] font-bold border"
            style={tab === t ? { color: '#fff', borderColor: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)' } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}>
            {t === 'device' ? 'Devices' : t === 'note' ? 'Note editor' : 'Audio editor'}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-white/35">{clip ? (kind === 'audio' ? clip.audio?.name : track?.name) : 'select a clip'}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
        {!clip && <div className="h-full grid place-items-center text-[12px] text-white/25">Select a clip on the timeline to edit it here.</div>}
        {clip && tab === 'device' && track && <DeviceTab track={track} onMutate={onMutate} />}
        {clip && tab === 'note' && <NoteTab clip={clip} trackId={selected!.trackId} onMutate={onMutate} />}
        {clip && tab === 'audio' && <AudioTab clip={clip} trackId={selected!.trackId} onMutate={onMutate} />}
      </div>
    </div>
  );
};

// ── Device tab: the track's insert chain (horizontal, Bitwig row) ──
const DeviceTab: React.FC<{ track: ArrangeTrack; onMutate: Props['onMutate'] }> = ({ track, onMutate }) => (
  <FxRack
    horizontal
    instances={track.inserts ?? []}
    onChange={(next: FxInstance[]) => onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) t.inserts = next; })}
    accent={PLAYHEAD}
    reductionOf={(id) => BeatsEngine.get().trackInsertReduction(track.id, id)}
    nodeOf={(id) => BeatsEngine.get().trackInsertNode(track.id, id)}
    title={`${track.name} · Devices`}
    emptyHint="Add the track's insert devices — EQ, comp, amp rack…"
  />
);

// ── Note tab: piano-roll for an instrument clip ──
const NoteTab: React.FC<{ clip: TimelineClip; trackId: string; onMutate: Props['onMutate'] }> = ({ clip, trackId, onMutate }) => {
  const notes = clip.notes ?? [];
  const rows = 24; // 2 octaves shown
  const lowKey = 48;
  const beatW = 48;
  const lenBeats = Math.max(4, clip.lengthBeats);
  const addNote = (beat: number, key: number) => onMutate((d) => {
    const t = d.arrangement.find((x) => x.id === trackId); const c = t?.clips.find((x) => x.id === clip.id);
    if (c) { (c.notes = c.notes ?? []).push({ id: `n${Math.random().toString(36).slice(2, 8)}`, startBeats: beat, lengthBeats: 0.5, key, vel: 100 }); }
  });
  const removeNote = (id: string) => onMutate((d) => {
    const t = d.arrangement.find((x) => x.id === trackId); const c = t?.clips.find((x) => x.id === clip.id);
    if (c?.notes) c.notes = c.notes.filter((n) => n.id !== id);
  });
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/30 mb-1.5">Notes — click to add, click a note to remove · velocity = orange edge</div>
      <div className="relative rounded-[10px] border border-white/10 overflow-hidden" style={{ height: rows * 13 }}>
        <div className="absolute inset-0" style={{
          background: `repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 12px, transparent 12px 13px), repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px ${beatW}px)`,
        }}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const beat = Math.floor(((e.clientX - r.left) / beatW) * 2) / 2;
            const key = lowKey + (rows - 1 - Math.floor((e.clientY - r.top) / 13));
            addNote(beat, key);
          }}
        />
        {notes.map((n) => {
          const rowFromTop = rows - 1 - (n.key - lowKey);
          if (rowFromTop < 0 || rowFromTop >= rows) return null;
          return (
            <div key={n.id} className="absolute rounded-[3px] cursor-pointer"
              style={{ left: n.startBeats * beatW, top: rowFromTop * 13 + 1, width: Math.max(6, n.lengthBeats * beatW), height: 11, background: '#D0BCFF', opacity: 0.5 + 0.5 * n.vel / 127 }}
              onClick={(e) => { e.stopPropagation(); removeNote(n.id); }} title={`key ${n.key} · vel ${n.vel}`}>
              <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-l" style={{ background: '#FF8C00', height: `${n.vel / 127 * 100}%`, bottom: 0 }} />
            </div>
          );
        })}
      </div>
      <div className="text-[9px] text-white/25 mt-1.5">{notes.length} notes · {lenBeats} beats</div>
    </div>
  );
};

// ── Audio tab: waveform + edit toolbar + time-stretch ──
const AudioTab: React.FC<{ clip: TimelineClip; trackId: string; onMutate: Props['onMutate'] }> = ({ clip, trackId, onMutate }) => {
  const [buf, setBuf] = useState<AudioBuffer | null>(null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null); // fraction 0..1
  const [busy, setBusy] = useState<string | null>(null);
  const [algo, setAlgo] = useState<StretchAlgo>('phase');
  const [ratio, setRatio] = useState(1);
  const [semis, setSemis] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x0: number } | null>(null);

  const key = clip.audio?.sampleKey;
  useEffect(() => {
    let cancelled = false;
    if (!key) { setBuf(null); return; }
    void (async () => {
      const engine = BeatsEngine.get();
      // The engine already holds decoded sample buffers; reuse if present, else hydrate.
      const entry = engine.getSampleEntries?.().find(([k]) => k === key);
      if (entry) { if (!cancelled) setBuf(entry[1]); return; }
      const { hydrateSample } = await import('../../../../services/melos/beats/sampleStore');
      const b = await hydrateSample({ key, name: clip.audio?.name ?? 'clip', durationSec: clip.audio?.durationSec ?? 0 }, decodeCtx());
      if (!cancelled) setBuf(b);
    })();
    return () => { cancelled = true; };
  }, [key]);

  // draw
  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !buf) return;
    const g = cv.getContext('2d'); if (!g) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const p = edit.peaks(buf, Math.floor(w));
    const mid = h / 2;
    g.fillStyle = 'rgba(0,218,243,0.7)';
    for (let x = 0; x < p.length; x++) { const a = Math.max(0.5, p[x] * mid * 0.92); g.fillRect(x, mid - a, 1, a * 2); }
    if (sel) {
      const a = Math.min(sel.a, sel.b) * w, b = Math.max(sel.a, sel.b) * w;
      g.fillStyle = 'rgba(0,218,243,0.14)'; g.fillRect(a, 0, b - a, h);
      g.strokeStyle = PLAYHEAD; g.lineWidth = 1; g.strokeRect(a, 0, b - a, h);
    }
  }, [buf, sel]);

  const range = (): edit.Range | undefined => {
    if (!buf || !sel || Math.abs(sel.b - sel.a) < 0.005) return undefined;
    return { start: Math.floor(Math.min(sel.a, sel.b) * buf.length), end: Math.floor(Math.max(sel.a, sel.b) * buf.length) };
  };

  /** Run an op, write the result back as a new sample, update the clip. */
  const apply = useCallback(async (label: string, op: (b: AudioBuffer) => AudioBuffer | Promise<AudioBuffer>) => {
    if (!buf) return;
    setBusy(label);
    try {
      const next = await op(buf);
      const blob = await edit.bufferToWav(next);
      const ingested = await ingestSample(blob, `${clip.audio?.name ?? 'clip'} (${label}).wav`, decodeCtx());
      if (!ingested) return;
      // register the decoded buffer with the engine so playback is instant
      BeatsEngine.get().setSampleBuffer(ingested.ref.key, next);
      onMutate((d) => {
        const t = d.arrangement.find((x) => x.id === trackId); const c = t?.clips.find((x) => x.id === clip.id);
        if (c?.audio) { c.audio.sampleKey = ingested.ref.key; c.audio.durationSec = next.duration; c.lengthBeats = next.duration / (60 / d.bpm); }
      });
      setBuf(next); setSel(null);
    } finally { setBusy(null); }
  }, [buf, clip, trackId, onMutate]);

  if (!key) return <div className="h-full grid place-items-center text-[12px] text-white/25">This clip has no audio to edit.</div>;

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex flex-wrap gap-1.5 items-center">
        <button disabled={!!busy} onClick={() => { const r = range(); if (!buf) return; const at = r ? r.start : Math.floor((sel?.a ?? 0.5) * buf.length); void apply('split', (b) => edit.split(b, at)[0]); }} className="h-7 px-2.5 rounded-lg text-[10.5px] font-bold border border-white/15 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-40 flex items-center gap-1"><Scissors size={11} /> Split</button>
        <button disabled={!!busy} onClick={() => void apply('normalize', (b) => edit.normalize(b, range()))} className="h-7 px-2.5 rounded-lg text-[10.5px] font-bold border border-white/15 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-40">Normalize</button>
        <button disabled={!!busy} onClick={() => void apply('reverse', (b) => edit.reverse(b, range()))} className="h-7 px-2.5 rounded-lg text-[10.5px] font-bold border border-white/15 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-40">Reverse</button>
        <button disabled={!!busy} onClick={() => void apply('fade-in', (b) => edit.fadeIn(b, range()))} className="h-7 px-2.5 rounded-lg text-[10.5px] font-bold border border-white/15 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-40">Fade in</button>
        <button disabled={!!busy} onClick={() => void apply('fade-out', (b) => edit.fadeOut(b, range()))} className="h-7 px-2.5 rounded-lg text-[10.5px] font-bold border border-white/15 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-40">Fade out</button>
        <button disabled={!!busy} onClick={() => { const r = range(); if (r) void apply('crop', (b) => edit.crop(b, r)); }} className="h-7 px-2.5 rounded-lg text-[10.5px] font-bold border border-white/15 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-40">Crop</button>
        <button disabled={!!busy} onClick={() => { const r = range(); if (r) void apply('silence', (b) => edit.silence(b, r)); }} className="h-7 px-2.5 rounded-lg text-[10.5px] font-bold border border-[#F59E0B]/40 text-[#F59E0B] hover:bg-[#F59E0B]/10 disabled:opacity-40">Silence</button>
        {busy && <span className="text-[10px] font-mono text-[#FF8C00]">{busy}…</span>}
      </div>

      <div
        className="flex-1 min-h-[80px] rounded-[10px] border border-white/10 bg-black/25 relative cursor-text overflow-hidden"
        onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width; drag.current = { x0: x }; setSel({ a: x, b: x }); (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const r = e.currentTarget.getBoundingClientRect(); setSel({ a: d.x0, b: (e.clientX - r.left) / r.width }); }}
        onPointerUp={() => { drag.current = null; }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {!buf && <div className="absolute inset-0 grid place-items-center text-[11px] text-white/30">decoding…</div>}
      </div>

      {/* time-stretch */}
      <div className="flex items-center gap-2.5 flex-wrap rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2">
        <span className="text-[9px] uppercase tracking-[0.16em] font-extrabold" style={{ color: '#FF8C00' }}>Time-stretch</span>
        <select value={algo} onChange={(e) => setAlgo(e.target.value as StretchAlgo)} className="h-7 rounded-lg bg-black/40 border border-white/10 text-[10.5px] text-white px-1.5 outline-none">
          <option value="phase">Phase-vocoder (transparent · transient-preserving)</option>
          <option value="wsola">WSOLA (rhythmic · tightest transients)</option>
        </select>
        <label className="flex items-center gap-1.5 text-[10px] text-white/60">Length <input type="range" min={25} max={400} value={ratio * 100} onChange={(e) => setRatio(Number(e.target.value) / 100)} className="w-24 accent-[#FF8C00]" /><span className="font-mono w-10 text-white/80">{ratio.toFixed(2)}×</span></label>
        <label className="flex items-center gap-1.5 text-[10px] text-white/60">Pitch <input type="range" min={-12} max={12} value={semis} onChange={(e) => setSemis(Number(e.target.value))} className="w-20 accent-[#00DAF3]" /><span className="font-mono w-8 text-white/80">{semis >= 0 ? '+' : ''}{semis}</span></label>
        <button
          disabled={!!busy || (Math.abs(ratio - 1) < 0.01 && semis === 0)}
          onClick={() => void apply('stretch', (b) => timeStretchBuffer(decodeCtx(), b, { ratio, semis, algo, preserveTransients: true }))}
          className="h-7 px-3 rounded-lg text-[10.5px] font-bold border border-[#FF8C00]/45 text-[#FF8C00] hover:bg-[#FF8C00]/10 disabled:opacity-40 flex items-center gap-1"
        ><Wand2 size={11} /> Apply stretch</button>
        <span className="text-[9px] text-white/25">non-destructive · writes a new sample onto the clip</span>
      </div>
    </div>
  );
};
