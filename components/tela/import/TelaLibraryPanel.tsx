// TelaLibraryPanel — the brushes, shapes, swatches and patterns people bring from Adobe apps.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Brush, Grid3X3, Palette, Shapes, Trash2, Upload, X, Search } from 'lucide-react';
import { parsePathData } from '../../../services/tela/geometry/pathData';
import { pathBounds } from '../../../services/tela/geometry/bezier';
import { brushTipCanvas, importPresetFiles, loadPresetLibrary, onPresetLibraryChange, patternDataUrl, removePreset, type PresetLibrary } from '../../../services/tela/import/presetLibrary';
import type { ImportedBrush, ImportedPattern, ImportedShape } from '../../../services/tela/import/presets';

type Tab = 'brushes' | 'shapes' | 'swatches' | 'patterns';
const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode; hint: string; accept: string }> = [
  { id: 'brushes', label: 'Brushes', icon: <Brush size={13} />, hint: 'Import .abr', accept: '.abr' },
  { id: 'shapes', label: 'Shapes', icon: <Shapes size={13} />, hint: 'Import .csh', accept: '.csh' },
  { id: 'swatches', label: 'Swatches', icon: <Palette size={13} />, hint: 'Import .ase or .aco', accept: '.ase,.aco' },
  { id: 'patterns', label: 'Patterns', icon: <Grid3X3 size={13} />, hint: 'Import .pat', accept: '.pat' },
];
const PAGE = 240;

interface Props {
  onClose: () => void;
  initialTab?: Tab; note?: string | null;
  onPlaceShape: (shape: ImportedShape) => void;
  onUseColor: (hex: string, name: string) => void;
  onUsePattern: (pattern: ImportedPattern) => void;
  onUseBrush: (brush: ImportedBrush) => void;
}

const BrushThumb: React.FC<{ brush: ImportedBrush }> = ({ brush }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const g = c.getContext('2d')!; g.clearRect(0, 0, 44, 44);
    const tip = brushTipCanvas(brush, '#ffffff', 36); const k = Math.min(1, 40 / Math.max(tip.width, tip.height));
    g.drawImage(tip, (44 - tip.width * k) / 2, (44 - tip.height * k) / 2, tip.width * k, tip.height * k);
  }, [brush]);
  return <canvas ref={ref} width={44} height={44} aria-hidden style={{ display: 'block' }} />;
};
const ShapeThumb: React.FC<{ shape: ImportedShape }> = ({ shape }) => {
  const box = useMemo(() => { try { return pathBounds(parsePathData(shape.d)); } catch { return { x: 0, y: 0, w: shape.width, h: shape.height }; } }, [shape]);
  return <svg viewBox={`${box.x} ${box.y} ${Math.max(1, box.w)} ${Math.max(1, box.h)}`} width={40} height={40} aria-hidden><path d={shape.d} fill="#fff" fillRule="evenodd" /></svg>;
};
const PatternThumb: React.FC<{ pattern: ImportedPattern }> = ({ pattern }) => {
  const url = useMemo(() => patternDataUrl(pattern), [pattern]);
  return <div aria-hidden style={{ width: 44, height: 44, borderRadius: 6, backgroundImage: `url(${url})`, backgroundSize: `${Math.min(44, pattern.image.width)}px` }} />;
};

export const TelaLibraryPanel: React.FC<Props> = ({ onClose, initialTab = 'brushes', note, onPlaceShape, onUseColor, onUsePattern, onUseBrush }) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [lib, setLib] = useState<PresetLibrary>({ brushes: [], shapes: [], swatches: [], patterns: [] });
  const [query, setQuery] = useState(''); const [limit, setLimit] = useState(PAGE);
  const [message, setMessage] = useState<string | null>(note ?? null); const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reload = () => { void loadPresetLibrary().then(setLib).catch(e => setMessage(`The library could not be opened: ${(e as Error).message}`)); };
  useEffect(() => { reload(); return onPresetLibraryChange(reload); }, []);
  useEffect(() => { setMessage(note ?? null); }, [note]);
  useEffect(() => { setLimit(PAGE); }, [tab, query]);
  const rows = useMemo(() => { const q = query.trim().toLowerCase(); const all = lib[tab] as Array<{ name: string; source: string; group?: string }>; return q ? all.filter(r => `${r.name} ${r.source} ${r.group || ''}`.toLowerCase().includes(q)) : all; }, [lib, tab, query]);
  const shown = rows.slice(0, limit);
  const importFiles = async (files: File[]) => {
    if (!files.length) return; setBusy(true); setMessage(null);
    try { const r = await importPresetFiles(files); setMessage(`Added ${r.added}.${r.warnings.length ? ` ${r.warnings.join(' ')}` : ''}`); }
    catch (e) { setMessage(`Could not read that file: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const meta = TABS.find(t => t.id === tab)!;
  const cell: React.CSSProperties = { width: 66, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 6, borderRadius: 9, background: 'rgba(255,255,255,.05)', border: 0, color: 'rgba(255,255,255,.8)', cursor: 'pointer' };
  const nameStyle: React.CSSProperties = { fontSize: 9.5, lineHeight: 1.2, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' };
  return (
    <aside aria-label="Library" data-testid="tela-library" style={{ position: 'fixed', top: 56, right: 12, bottom: 12, width: 'min(344px, calc(100vw - 24px))', zIndex: 320, display: 'flex', flexDirection: 'column', background: '#16121f', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, color: '#fff', overflow: 'hidden' }}>
      <div className="flex items-center gap-2" style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>Library</div>
        <button aria-label="Close library" onClick={onClose} style={{ padding: 4, background: 'none', border: 0, color: 'rgba(255,255,255,.6)', cursor: 'pointer' }}><X size={15} /></button>
      </div>
      <div role="tablist" className="flex" style={{ padding: '6px 8px', gap: 2 }}>
        {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="flex items-center gap-1" style={{ flex: 1, justifyContent: 'center', fontSize: 11, fontWeight: 800, padding: '6px 2px', borderRadius: 8, border: 0, cursor: 'pointer', background: tab === t.id ? 'rgba(255,255,255,.1)' : 'transparent', color: tab === t.id ? '#fff' : 'rgba(255,255,255,.55)' }}>{t.icon}{t.label}</button>)}
      </div>
      <div className="flex items-center gap-2" style={{ padding: '4px 10px 8px' }}>
        <label className="flex items-center gap-1.5" style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: '5px 8px' }}><Search size={12} color="rgba(255,255,255,.45)" /><input aria-label={`Search ${meta.label}`} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" style={{ width: '100%', background: 'none', border: 0, outline: 'none', color: '#fff', fontSize: 12 }} /></label>
        <button disabled={busy} onClick={() => fileRef.current?.click()} className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 800, padding: '6px 10px', borderRadius: 8, background: '#6B0099', border: 0, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}><Upload size={12} />{busy ? 'Reading…' : meta.hint}</button>
        <input ref={fileRef} type="file" multiple className="hidden" accept=".abr,.csh,.ase,.aco,.pat" onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; void importFiles(f); }} />
      </div>
      {message && <div role="status" style={{ margin: '0 10px 8px', fontSize: 11, lineHeight: 1.45, color: 'rgba(255,255,255,.72)', background: 'rgba(255,255,255,.05)', padding: '6px 8px', borderRadius: 8 }}>{message}</div>}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 10px 10px' }}>
        {!rows.length && <p style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,.5)', textAlign: 'center', padding: '28px 16px' }}>{query ? 'Nothing matches that search.' : `No ${meta.label.toLowerCase()} yet. ${meta.hint} from Photoshop or Illustrator, or drop the file onto the board.`}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tab === 'brushes' && (shown as ImportedBrush[]).map(b => <button key={b.id} title={`${b.name}${b.unsupported ? ` (skips: ${b.unsupported.join(', ')})` : ''}`} onClick={() => onUseBrush(b)} style={cell}><BrushThumb brush={b} /><span style={nameStyle}>{b.name}</span></button>)}
          {tab === 'shapes' && (shown as ImportedShape[]).map(s => <button key={s.id} title={s.name} onClick={() => onPlaceShape(s)} style={cell}><ShapeThumb shape={s} /><span style={nameStyle}>{s.name}</span></button>)}
          {tab === 'patterns' && (shown as ImportedPattern[]).map(p => <button key={p.id} title={p.name} onClick={() => onUsePattern(p)} style={cell}><PatternThumb pattern={p} /><span style={nameStyle}>{p.name}</span></button>)}
          {tab === 'swatches' && (shown as PresetLibrary['swatches']).map(s => <button key={s.id} aria-label={s.name} title={`${s.name} ${s.color}`} onClick={() => onUseColor(s.color, s.name)} style={{ width: 28, height: 28, borderRadius: 7, background: s.color, border: '1px solid rgba(255,255,255,.18)', cursor: 'pointer' }} />)}
        </div>
        {rows.length > limit && <button onClick={() => setLimit(l => l + PAGE)} style={{ display: 'block', margin: '10px auto 0', fontSize: 11, fontWeight: 800, padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,.08)', border: 0, color: '#fff', cursor: 'pointer' }}>Show more ({rows.length - limit})</button>}
      </div>
      {!!rows.length && <div className="flex items-center" style={{ padding: '6px 10px', borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 10.5, color: 'rgba(255,255,255,.45)' }}>
        <span style={{ flex: 1 }}>{rows.length.toLocaleString()} {meta.label.toLowerCase()} on this device</span>
        <button onClick={() => { if (window.confirm(`Remove these ${rows.length.toLocaleString()} ${meta.label.toLowerCase()} from this device?`)) void removePreset(tab, (rows as unknown as Array<{ id: string }>).map(r => r.id)); }} className="flex items-center gap-1" style={{ background: 'none', border: 0, color: 'rgba(255,255,255,.55)', cursor: 'pointer', fontSize: 10.5 }}><Trash2 size={11} /> Remove</button>
      </div>}
    </aside>
  );
};

export default TelaLibraryPanel;
