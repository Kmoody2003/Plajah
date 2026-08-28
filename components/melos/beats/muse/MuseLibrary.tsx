// Muse Library — the production-asset browser (slice 2 of the approved design).
//
// One window over three sources you can browse today: LOCAL folders (File System Access), the
// FACTORY instruments, and THIS PROJECT's own sounds. Each asset carries Melos's musical read
// (key / tempo / length), single-click auditions it, the play-triangle does too, and "Add to
// project" drops audio onto a new track or loads a preset. Cloud-folder listing is the next source.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { X, Search, FolderPlus, Play, Plus, Folder, Box, LayoutGrid, Cloud } from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { ingestSample, backupToLocker } from '../../../../services/melos/beats/sampleStore';
import { addInstrumentToNextPad } from '../../../../services/melos/beats/instrumentFactory';
import { FACTORY_PRESETS } from '../../../../services/melos/instruments/onda/presets';
import { serializePatch } from '../../../../services/melos/instruments/onda/patch';
import { analyzeBuffer, keyLabel, CATEGORY_FOR, type MuseAsset, type MuseAnalysis, type MuseKind, type MuseSource } from '../../../../services/melos/beats/muse/museAsset';
import { listCloudAssets, resolveCloudFile, cloudSupported } from '../../../../services/melos/beats/muse/cloudSource';
import { coverCss, accentFor } from '../../../../services/melos/instruments/presetArt';
import { PLAYHEAD, SELECT, SURFACE } from '../theme';

interface Props { doc: GrooveDoc; onMutate: (fn: (d: GrooveDoc) => void) => void; onClose: () => void; }

interface Row extends MuseAsset {
  getFile?: () => Promise<File | null>;   // local files
  presetPatch?: ReturnType<typeof serializePatch>;
}

const AUDIO_RE = /\.(wav|mp3|ogg|flac|m4a|aif|aiff)$/i;
const kindOfName = (name: string, dur: number): MuseKind => (dur >= 1 && dur <= 8 ? 'loop' : 'sample');

export const MuseLibrary: React.FC<Props> = ({ doc, onMutate, onClose }) => {
  const [source, setSource] = useState<MuseSource>('factory');
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [localRows, setLocalRows] = useState<Row[]>([]);
  const [cloudRows, setCloudRows] = useState<Row[] | null>(null); // null = not loaded yet
  const [status, setStatus] = useState('');
  const analyzed = useRef(new Map<string, { analysis: MuseAnalysis; buffer: AudioBuffer }>());
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  // ── FACTORY: ONDA presets as instrument assets ──
  const factoryRows: Row[] = useMemo(() => FACTORY_PRESETS.map((p) => ({
    id: `f:${p.name}`, kind: 'instrument', name: p.name, source: 'factory',
    ref: { presetName: p.name }, tags: p.tags, category: p.category,
    presetPatch: serializePatch(p),
  })), []);

  // ── PROJECT: the current groove's own sounds ──
  const projectRows: Row[] = useMemo(() => {
    const out: Row[] = [];
    doc.kit.forEach((pad) => { if (pad.source === 'sample' && pad.sample) out.push({ id: `p:pad:${pad.id}`, kind: 'sample', name: pad.sample.name, source: 'project', ref: { sampleKey: pad.sample.key, lockerUrl: pad.sample.lockerUrl }, tags: ['pad'], category: 'Samples' }); });
    for (const t of doc.arrangement) for (const c of t.clips) if (c.audio) out.push({ id: `p:clip:${c.id}`, kind: 'audio', name: c.audio.name, source: 'project', ref: { sampleKey: c.audio.sampleKey }, tags: ['clip'], category: 'Audio files' });
    for (const t of doc.arrangement) if (t.kind === 'instrument' && t.instrument) out.push({ id: `p:inst:${t.id}`, kind: 'instrument', name: t.name, source: 'project', ref: { presetName: t.instrument.presetName }, tags: [t.instrument.type], category: 'Instruments' });
    return out;
  }, [doc]);

  // ── CLOUD: the owner's locker samples, loaded on demand ──
  const loadCloud = useCallback(async () => {
    if (!cloudSupported()) { setCloudRows([]); setStatus('Sign in to see your cloud library'); return; }
    setStatus('Loading your cloud library…');
    const items = await listCloudAssets();
    setCloudRows(items.map((c) => ({
      id: `c:${c.path}`, kind: 'sample', name: c.name, source: 'cloud',
      ref: {}, tags: ['locker'], category: 'Samples', getFile: () => resolveCloudFile(c.path, c.name),
    })));
    setStatus(`${items.length} in your cloud library`);
  }, []);

  const rows: Row[] = source === 'local' ? localRows : source === 'factory' ? factoryRows : source === 'cloud' ? (cloudRows || []) : projectRows;
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))] as string[], [rows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (category && r.category !== category) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.tags.some((t) => t.includes(q)) || (r.category || '').toLowerCase().includes(q);
    });
  }, [rows, category, query]);

  const selected = filtered.find((r) => r.id === sel) || (source === 'local' ? localRows.find((r) => r.id === sel) : null);
  const selAnalysis = sel ? analyzed.current.get(sel)?.analysis : undefined;

  // ── add a local folder ──
  const addFolder = useCallback(async () => {
    const picker = (window as unknown as { showDirectoryPicker?: (o: { mode: string }) => Promise<any> }).showDirectoryPicker;
    if (!picker) { setStatus('This browser has no folder access — try Chrome/Edge'); return; }
    try {
      const dir = await picker({ mode: 'read' });
      const found: Row[] = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'file' && AUDIO_RE.test(name)) {
          found.push({ id: `l:${name}`, kind: 'audio', name: name.replace(/\.[^.]+$/, ''), source: 'local', ref: { fileName: name }, tags: [], category: 'Audio files', getFile: () => handle.getFile() });
        }
      }
      found.sort((a, b) => a.name.localeCompare(b.name));
      setLocalRows(found); setSource('local'); setStatus(`${found.length} audio files in ${dir.name}`);
    } catch { /* user cancelled */ }
  }, []);

  // ── decode + analyse + audition ──
  const auditionSrc = useRef<AudioBufferSourceNode | null>(null);
  const ensureBuffer = useCallback(async (row: Row): Promise<AudioBuffer | null> => {
    const hit = analyzed.current.get(row.id); if (hit) return hit.buffer;
    const engine = BeatsEngine.get(); await engine.init(); const ctx = engine.getContext(); if (!ctx) return null;
    let blob: Blob | null = null;
    if (row.getFile) blob = await row.getFile();
    else if (row.ref.sampleKey) { const { getBytes } = await import('../../../../services/fabula/mediaStore'); blob = await getBytes(row.ref.sampleKey) || null; if (!blob && row.ref.lockerUrl) { const r = await fetch(row.ref.lockerUrl); if (r.ok) blob = await r.blob(); } }
    if (!blob) return null;
    try {
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      const analysis = analyzeBuffer(buffer);
      analyzed.current.set(row.id, { analysis, buffer });
      rerender();
      return buffer;
    } catch { return null; }
  }, []);

  const audition = useCallback(async (row: Row) => {
    if (row.kind === 'instrument') { setStatus(`${row.name} — open it to play`); return; }
    const buffer = await ensureBuffer(row); if (!buffer) { setStatus('Could not preview this file'); return; }
    const engine = BeatsEngine.get(); const ctx = engine.getContext(); if (!ctx) return;
    try { auditionSrc.current?.stop(); } catch { /* */ }
    const s = ctx.createBufferSource(); s.buffer = buffer; const g = ctx.createGain(); g.gain.value = 0.9;
    s.connect(g).connect(ctx.destination); s.start(); auditionSrc.current = s;
    s.stop(ctx.currentTime + Math.min(buffer.duration, 6));
  }, [ensureBuffer]);

  const selectRow = useCallback((row: Row) => { setSel(row.id); void audition(row); void ensureBuffer(row); }, [audition, ensureBuffer]);

  // ── add to project ──
  const addToProject = useCallback(async (row: Row) => {
    if (row.kind === 'instrument' && row.presetPatch) {
      // Pad-paired like every other add path — an instrument with no pad was invisible in
      // Glass's rack and MEKA's grid, which read the KIT, not the arrangement.
      let padIdx = 0;
      onMutate((d) => { padIdx = addInstrumentToNextPad(d, 'onda', row.presetPatch, row.name).padIdx; });
      void BeatsEngine.get().init().then(() => BeatsEngine.get().syncInstruments());
      setStatus(`Added ${row.name} on pad ${padIdx + 1}`); return;
    }
    // audio/sample → a new labelled audio track
    const engine = BeatsEngine.get(); await engine.init(); const ctx = engine.getContext(); if (!ctx) return;
    let blob: Blob | null = row.getFile ? await row.getFile() : null;
    if (!blob && row.ref.sampleKey) { const { getBytes } = await import('../../../../services/fabula/mediaStore'); blob = await getBytes(row.ref.sampleKey) || null; }
    if (!blob) { setStatus('Could not add — file unavailable'); return; }
    const result = await ingestSample(blob, row.name, ctx); if (!result) return;
    engine.setSampleBuffer(result.ref.key, result.buffer); void backupToLocker(result.ref);
    const spb = 60 / doc.bpm;
    onMutate((d) => {
      d.arrangement.push({ id: grooveUid(), kind: 'audio', name: row.name, color: '#00DAF3', mute: false, solo: false, gainDb: 0, pan: 0,
        clips: [{ id: grooveUid(), startBeats: 0, lengthBeats: Math.max(1, Math.round((result.buffer.duration / spb) * 4) / 4), audio: { sampleKey: result.ref.key, name: row.name, offsetSec: 0, gainDb: 0, durationSec: result.buffer.duration } }] });
    });
    setStatus(`Added ${row.name} to a new track`);
  }, [doc.bpm, onMutate]);

  const peaks = useMemo(() => {
    const buf = sel ? analyzed.current.get(sel)?.buffer : null; if (!buf) return '';
    const ch = buf.getChannelData(0); const N = 200, step = Math.max(1, Math.floor(ch.length / N));
    let d = 'M0 20';
    for (let x = 0; x < N; x++) { let p = 0; for (let j = 0; j < step; j += 8) { const v = Math.abs(ch[x * step + j] || 0); if (v > p) p = v; } d += `L${(x / N) * 200} ${20 - p * 18}`; }
    for (let x = N - 1; x >= 0; x--) { let p = 0; for (let j = 0; j < step; j += 8) { const v = Math.abs(ch[x * step + j] || 0); if (v > p) p = v; } d += `L${(x / N) * 200} ${20 + p * 18}`; }
    return d + 'Z';
  }, [sel, force]); // eslint-disable-line react-hooks/exhaustive-deps

  const SourceBtn: React.FC<{ id: MuseSource; icon: React.ReactNode; label: string; count?: number }> = ({ id, icon, label, count }) => (
    <button onClick={() => { setSource(id); setCategory(null); setSel(null); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px]"
      style={source === id ? { background: 'rgba(0,218,243,0.12)', color: '#fff' } : { color: 'rgba(255,255,255,0.5)' }}>
      <span style={{ color: source === id ? PLAYHEAD : 'rgba(255,255,255,0.3)' }}>{icon}</span>{label}
      {count !== undefined && <span className="ml-auto font-mono text-[9px] text-white/30">{count}</span>}
    </button>
  );

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/72 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-5xl rounded-[20px] border border-white/[0.16] overflow-hidden shadow-2xl flex flex-col" style={{ background: SURFACE, height: '84vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10 flex-none" style={{ background: '#0C0C10' }}>
          <span className="font-black text-[13px] tracking-[0.08em]" style={{ color: PLAYHEAD }}>MUSE LIBRARY</span>
          <div className="relative ml-2">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/25" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sounds, keys, tempos" className="w-56 h-8 pl-7 pr-2 rounded-lg bg-black/40 border border-white/10 text-[12px] text-white outline-none focus:border-white/30" />
          </div>
          <span className="flex-1" />
          <span className="text-[10px] font-mono text-white/35">{status || `${filtered.length} assets`}</span>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white"><X size={15} /></button>
        </div>

        <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: '176px 1fr 232px' }}>
          {/* sources */}
          <div className="p-2.5 border-r border-white/10 overflow-y-auto" style={{ background: '#0C0C10' }}>
            <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold px-1 mb-1.5">Sources</p>
            <SourceBtn id="factory" icon={<Box size={14} />} label="Factory" count={factoryRows.length} />
            <SourceBtn id="project" icon={<LayoutGrid size={14} />} label="This project" count={projectRows.length} />
            <button onClick={() => { setSource('cloud'); setCategory(null); setSel(null); if (cloudRows === null) void loadCloud(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px]"
              style={source === 'cloud' ? { background: 'rgba(0,218,243,0.12)', color: '#fff' } : { color: 'rgba(255,255,255,0.5)' }}>
              <span style={{ color: source === 'cloud' ? PLAYHEAD : 'rgba(255,255,255,0.3)' }}><Cloud size={14} /></span>My cloud library
              {cloudRows && <span className="ml-auto font-mono text-[9px] text-white/30">{cloudRows.length}</span>}
            </button>
            <SourceBtn id="local" icon={<Folder size={14} />} label="Local folder" count={source === 'local' ? localRows.length : undefined} />
            <button onClick={() => void addFolder()} className="w-full h-8 mt-2 rounded-lg border border-dashed border-white/15 text-white/45 hover:text-white text-[11px] flex items-center justify-center gap-1.5"><FolderPlus size={12} /> Add a folder</button>
            {categories.length > 0 && (<>
              <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold px-1 mt-4 mb-1.5">Type</p>
              <button onClick={() => setCategory(null)} className="w-full text-left px-2 py-1 rounded-lg text-[11px]" style={!category ? { color: '#fff', background: 'rgba(255,255,255,0.06)' } : { color: 'rgba(255,255,255,0.45)' }}>All</button>
              {categories.map((c) => <button key={c} onClick={() => setCategory(c === category ? null : c)} className="w-full text-left px-2 py-1 rounded-lg text-[11px] flex items-center gap-2" style={category === c ? { color: '#fff', background: 'rgba(255,255,255,0.06)' } : { color: 'rgba(255,255,255,0.45)' }}><span className="w-1.5 h-1.5 rounded-sm" style={{ background: accentFor(c) }} />{c}</button>)}
            </>)}
          </div>

          {/* asset list */}
          <div className="overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="sticky top-0" style={{ background: '#0d0d12' }}>
                {['', 'Name', 'Key', 'Tempo', 'Length'].map((h, i) => <th key={i} className="text-left font-mono text-[9px] uppercase tracking-wide text-white/30 font-normal px-2.5 py-2 border-b border-white/10">{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map((r) => {
                  const a = analyzed.current.get(r.id)?.analysis; const isSel = r.id === sel; const accent = accentFor(r.category);
                  return (
                    <tr key={r.id} onClick={() => selectRow(r)} className="cursor-pointer" style={isSel ? { background: 'rgba(0,218,243,0.08)' } : undefined}>
                      <td className="px-2.5 py-1.5"><button onClick={(e) => { e.stopPropagation(); void audition(r); }} aria-label="Preview" className="w-6 h-6 rounded-full grid place-items-center border" style={{ borderColor: `${PLAYHEAD}55`, color: PLAYHEAD }}><Play size={11} /></button></td>
                      <td className="px-2.5 py-1.5"><span className="flex items-center gap-2"><span className="w-5 h-5 rounded flex-none" style={{ background: r.kind === 'instrument' ? coverCss(r.name, r.category) : '#0d0d12', border: r.kind !== 'instrument' ? `1px solid ${accent}44` : 'none' }} /><span className="text-white/85 truncate">{r.name}</span><span className="font-mono text-[8px] px-1 rounded" style={{ background: `${accent}22`, color: accent }}>{r.kind}</span></span></td>
                      <td className="px-2.5 py-1.5 font-mono" style={{ color: a?.keyRoot != null ? '#57E389' : 'rgba(255,255,255,0.25)' }}>{a ? keyLabel(a) : (r.kind === 'instrument' ? '—' : '·')}</td>
                      <td className="px-2.5 py-1.5 font-mono text-white/55">{a?.bpm ? `${a.bpm}` : '—'}</td>
                      <td className="px-2.5 py-1.5 font-mono text-white/45">{a ? `${a.durationSec.toFixed(1)}s` : (r.kind === 'instrument' ? 'preset' : '—')}</td>
                    </tr>
                  );
                })}
                {!filtered.length && <tr><td colSpan={5} className="text-center text-white/35 py-10 text-[12px]">{source === 'local' ? 'Add a folder to browse your local audio.' : 'Nothing here yet.'}</td></tr>}
              </tbody>
            </table>
          </div>

          {/* inspector */}
          <div className="border-l border-white/10 p-3.5 overflow-y-auto" style={{ background: '#0C0C10' }}>
            {selected ? (<>
              <div className="h-24 rounded-xl mb-3 relative overflow-hidden grid place-items-center" style={{ background: selected.kind === 'instrument' ? coverCss(selected.name, selected.category) : 'linear-gradient(180deg,#0d0d12,#0a0a0e)' }}>
                {peaks && <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 40" preserveAspectRatio="none"><path d={peaks} fill="rgba(0,218,243,0.3)" stroke={PLAYHEAD} strokeWidth="0.5" /></svg>}
                <button onClick={() => void audition(selected)} className="relative w-11 h-11 rounded-full grid place-items-center" style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', backdropFilter: 'blur(4px)' }}><Play size={16} /></button>
              </div>
              <h3 className="text-[14px] font-semibold">{selected.name}</h3>
              <p className="font-mono text-[10px] text-white/35 mb-3">{selected.source} · {selected.kind}</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Stat label="Key" value={selAnalysis ? keyLabel(selAnalysis) : '…'} accent="#57E389" />
                <Stat label="Tempo" value={selAnalysis?.bpm ? `${selAnalysis.bpm} BPM` : '—'} />
                <Stat label="Length" value={selAnalysis ? `${selAnalysis.durationSec.toFixed(2)} s` : '…'} />
                <Stat label="Bars" value={selAnalysis?.bars ? `${selAnalysis.bars}` : '—'} />
                <Stat label="Rate" value={selAnalysis ? `${(selAnalysis.sampleRate / 1000).toFixed(1)}k` : '—'} />
                <Stat label="Ch" value={selAnalysis ? (selAnalysis.channels === 2 ? 'stereo' : 'mono') : '—'} />
              </div>
              <button onClick={() => void addToProject(selected)} className="w-full h-9 rounded-lg font-semibold text-[12px] flex items-center justify-center gap-2" style={{ background: PLAYHEAD, color: '#06222a' }}><Plus size={13} /> Add to project</button>
              {selected.tags.length > 0 && <div className="flex gap-1.5 flex-wrap mt-3">{selected.tags.map((t) => <span key={t} className="font-mono text-[9px] text-white/40 border border-white/10 rounded px-1.5 py-0.5">{t}</span>)}</div>}
            </>) : <p className="text-[12px] text-white/35 pt-10 text-center">Select a sound to see its key, tempo and length.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent }) => (
  <div className="rounded-lg px-2.5 py-2" style={{ background: '#131318' }}>
    <div className="font-mono text-[8px] uppercase tracking-wide text-white/35">{label}</div>
    <div className="text-[14px] font-semibold font-mono mt-0.5" style={{ color: accent || 'var(--text)' }}>{value}</div>
  </div>
);
