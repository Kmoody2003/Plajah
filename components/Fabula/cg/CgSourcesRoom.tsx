// CgSourcesRoom — the SOURCES room of Fabula CG, next to LIVE. Everything live
// that graphics can be fed by or painted with:
//
//   DATA         live tables: Tela sheets/bases, CSV/JSON URLs, pasted CSV, local
//                files, the formula engine, manual tables — bind to any graphic, or
//                make the rundown FOLLOW a source (a row per item; new rows append)
//   VISUALIZERS  every Stage/Pixels/Milkdrop/Chora visualizer + live video, as a
//                backdrop graphic or a fill / texture / mask / gradient-map
//   SIMULATORS   simulator channels as live data (playback or series)
//   WEATHER      live conditions + forecast → weather graphics
//   TRACKING     face / body / point trackers on a live feed → graphics that follow
//   AVATARS      live face-tracked 3D avatars as graphic elements
import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../../../services/liveData/liveDataAdapters';
import '../../../services/visualFill/visualProviders';
import {
  listSources, addSource, removeSource, updateSource, subscribeSource, onSourcesChange, attachFileHandle, liveAdapters,
  type LiveSource, type LiveSnapshot,
} from '../../../services/liveData/liveDataHub';
import { autoMap, type LiveRowSelector } from '../../../services/liveData/binding';
import { listSimulators } from '../../../services/liveData/liveDataAdapters';
import { visualCatalog, visualFrame, drawFitted, type VisualEntry, type VisualSource, type VisualPaintMode } from '../../../services/visualFill/visualFill';
import { LIVE_FEED_CHOICES, liveFeedVideo, releaseLiveFeed } from '../../../services/visualFill/liveFeed';
import { AVATAR_CHOICES, avatarValue } from '../../../services/visualFill/visualProviders';
import { listTrackers, addTracker, removeTracker, useTracker, onTrackerState, trackerState, onTrackersChange, anchorNames, seedPoint, type TrackerDef, type TrackerKind } from '../../../services/liveTracking/trackerHub';
import { searchCg, libraryGraphic, CG_PACKAGES } from '../../../services/fabula/cg/cgLibrary';
import { sharedPlayout, defaultSlotFor } from '../../../services/fabula/cg/cgPlayout';
import type { CgGraphic, CgGraphicRef, CgLayer } from '../../../services/fabula/cg/cgTypes';
import { CgThumb } from './CgThumb';

type Tab = 'data' | 'visualizers' | 'simulators' | 'weather' | 'tracking' | 'avatars';
const TABS: [Tab, string][] = [['data', 'DATA'], ['visualizers', 'VISUALIZERS'], ['simulators', 'SIMULATORS'], ['weather', 'WEATHER'], ['tracking', 'TRACKING'], ['avatars', 'AVATARS']];

const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,.13)', borderRadius: 12, background: 'rgba(26,26,33,.62)', padding: 10, minHeight: 0 };
const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 900, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(249,115,22,.8)', margin: '0 0 6px' };
const cap: React.CSSProperties = { fontSize: 8.5, fontWeight: 900, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)' };

function useSources(): LiveSource[] {
  const [s, setS] = useState(listSources());
  useEffect(() => onSourcesChange(() => setS([...listSources()])), []);
  return s;
}
function useSnapshot(id: string | null): LiveSnapshot | null {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  useEffect(() => { if (!id) { setSnap(null); return; } return subscribeSource(id, setSnap); }, [id]);
  return snap;
}

/** A graphic with live paint on one layer, as an inline (custom) graphic. */
function withPaint(base: CgGraphic, layerId: string, source: VisualSource, mode: VisualPaintMode): CgGraphic {
  const g: CgGraphic = JSON.parse(JSON.stringify(base));
  g.id = `user.live${Date.now().toString(36)}`; g.custom = true;
  // Packages name some plates differently (e.g. a scrim when the package is plateless): fall back to the first big shape.
  const target = g.layers.find(l => l.id === layerId) || g.layers.find(l => (l.kind === 'rect' || l.kind === 'visual') && l.w >= 300);
  g.layers = g.layers.map(l => (l === target ? { ...l, paint: { ...(l.paint || {}), source, mode } } as CgLayer : l));
  return g;
}

// ── shared bits ───────────────────────────────────────────────────────────────
const StatusDot: React.FC<{ s?: LiveSnapshot | null }> = ({ s }) => (
  <span title={s?.error || s?.status} style={{ width: 8, height: 8, borderRadius: 4, flex: 'none', background: !s ? '#555' : s.status === 'ok' ? '#22c55e' : s.status === 'error' ? '#ef4444' : '#f59e0b' }} />
);

const GraphicPicker: React.FC<{ value: string; onChange: (id: string) => void; filter?: (g: CgGraphic) => boolean }> = ({ value, onChange, filter }) => {
  const [q, setQ] = useState('');
  const list = useMemo(() => searchCg({ text: q }).filter(g => !filter || filter(g)).slice(0, 60), [q, filter]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input className="in" placeholder="Search graphics…" value={q} onChange={(e) => setQ(e.target.value)} />
      <select className="sel" value={value} onChange={(e) => onChange(e.target.value)} size={6} style={{ height: 'auto' }}>
        {list.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    </div>
  );
};

/** Live preview canvas of a visual source. */
const VisualPreview: React.FC<{ source: VisualSource | null; height?: number }> = ({ source, height = 220 }) => {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current; if (!c || !source) return;
    let raf = 0;
    const tick = () => {
      const w = c.clientWidth || 400, h = Math.round(w * 9 / 16);
      if (c.width !== w) { c.width = w; c.height = h; }
      const ctx = c.getContext('2d')!;
      const img = visualFrame(source, 640, 360);
      ctx.fillStyle = '#0b0b0e'; ctx.fillRect(0, 0, c.width, c.height);
      if (img) drawFitted(ctx, img, 0, 0, c.width, c.height, 'cover');
      else { ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '12px Inter, sans-serif'; ctx.fillText('Starting…', 14, 24); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [source?.engine, source?.value, source?.audio]);
  return <canvas ref={cv} style={{ width: '100%', maxHeight: height, aspectRatio: '16/9', borderRadius: 8, background: '#0b0b0e', display: 'block' }} />;
};

// ── DATA ──────────────────────────────────────────────────────────────────────
const KIND_HELP: Record<string, string> = {
  'tela-sheet': 'A Tela Sheet or Base — row 1 is the header. Updates as rows are added.',
  'csv-url': 'A published CSV (Google Sheets → File → Share → Publish to web → CSV).',
  'json-url': 'An API returning an array of records (optionally under a path like data.items).',
  'csv-text': 'Paste CSV — edit it here any time.',
  'csv-file': 'A CSV/JSON file on this computer, re-read every few seconds while open.',
  math: 'Formula engine: e.g. SEQUENCE(5,1,1,1)*t or MMULT(…). t = seconds, n = ticks.',
  table: 'A small table you type in (or other apps push rows into).',
};

const AddSourceForm: React.FC<{ onAdded: (s: LiveSource) => void; ping?: (m: string) => void }> = ({ onAdded, ping }) => {
  const [kind, setKind] = useState('tela-sheet');
  const [name, setName] = useState('');
  const [val, setVal] = useState('');
  const [extra, setExtra] = useState('');
  const [interval, setIntervalMs] = useState(5000);
  const [docs, setDocs] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => { if (kind === 'tela-sheet') import('../../../services/telaStore').then(m => m.listTelaDocs()).then(d => setDocs(d.map(x => ({ id: x.id, title: x.title || 'Untitled' })))).catch(() => setDocs([])); }, [kind]);
  const kinds = liveAdapters().filter(a => !['weather', 'simulator'].includes(a.kind));
  const add = async () => {
    let config: Record<string, any> = {};
    if (kind === 'tela-sheet') { if (!val) return ping?.('Pick a Tela document'); config = { docId: val }; }
    else if (kind === 'csv-url' || kind === 'json-url') { if (!/^https?:\/\//.test(val)) return ping?.('Enter an http(s) URL'); config = { url: val, path: extra }; }
    else if (kind === 'csv-text') config = { text: val };
    else if (kind === 'math') config = { expression: val || 'SEQUENCE(5,2)', columns: extra.split(',').map(s => s.trim()).filter(Boolean) };
    else if (kind === 'table') config = { columns: (extra || 'Name,Title').split(',').map(s => s.trim()), rows: [] };
    const src = addSource({ name: name || (kind === 'tela-sheet' ? docs.find(d => d.id === val)?.title : '') || kind, kind, config, intervalMs: interval });
    if (kind === 'csv-file') {
      try {
        const [h] = await (window as any).showOpenFilePicker({ types: [{ description: 'CSV / JSON', accept: { 'text/csv': ['.csv', '.tsv', '.txt'], 'application/json': ['.json'] } }] });
        attachFileHandle(src.id, h);
      } catch { ping?.('File picker unavailable — use "Paste CSV" instead'); }
    }
    onAdded(src); setVal(''); setName('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select className="sel" value={kind} onChange={(e) => setKind(e.target.value)}>{kinds.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}</select>
      <div className="dim small">{KIND_HELP[kind]}</div>
      <input className="in" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      {kind === 'tela-sheet' && <select className="sel" value={val} onChange={(e) => setVal(e.target.value)}><option value="">Choose a Tela document…</option>{docs.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select>}
      {(kind === 'csv-url' || kind === 'json-url') && <><input className="in" placeholder="https://…" value={val} onChange={(e) => setVal(e.target.value)} />{kind === 'json-url' && <input className="in" placeholder="Path to the array (optional), e.g. data.items" value={extra} onChange={(e) => setExtra(e.target.value)} />}</>}
      {kind === 'csv-text' && <textarea className="in" rows={5} placeholder={'Name,Title\nJordan Ellis,Correspondent'} value={val} onChange={(e) => setVal(e.target.value)} />}
      {kind === 'math' && <><input className="in mono" placeholder="SEQUENCE(5,1,1,1)*t" value={val} onChange={(e) => setVal(e.target.value)} /><input className="in" placeholder="Column names, comma separated" value={extra} onChange={(e) => setExtra(e.target.value)} /></>}
      {kind === 'table' && <input className="in" placeholder="Columns: Name, Title" value={extra} onChange={(e) => setExtra(e.target.value)} />}
      {(kind === 'csv-url' || kind === 'json-url' || kind === 'math') && <label className="dim small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Refresh every <input className="in" type="number" min={0.5} step={0.5} value={interval / 1000} onChange={(e) => setIntervalMs(Math.max(500, Number(e.target.value) * 1000))} style={{ width: 70 }} /> s</label>}
      <button className="cta" onClick={add}>Add source</button>
    </div>
  );
};

/** Bind a graphic to the selected source: auto-mapped fields, row choice, follow mode. */
const BindPanel: React.FC<{ source: LiveSource; columns: string[]; ping?: (m: string) => void; defaultGraphic?: string }> = ({ source, columns, ping, defaultGraphic }) => {
  const [gid, setGid] = useState(defaultGraphic || 'meridian.lt-strap');
  const g = libraryGraphic(gid) || searchCg({}).find(x => x.id === gid);
  const [map, setMap] = useState<Record<string, string>>({});
  const [row, setRow] = useState<LiveRowSelector>({ mode: 'last' });
  useEffect(() => { if (g) setMap({ ...autoMap(g.fields, columns), ...(g.dataHints || {}) }); }, [gid, columns.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!g) return null;
  const ref: CgGraphicRef = { graphicId: g.id, ...(g.custom ? { inline: g } : {}), data: { sourceId: source.id, row, map } };
  const playout = sharedPlayout({ master: true });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: 10 }}>
      <div><div style={cap}>Graphic</div><GraphicPicker value={gid} onChange={setGid} /><div style={{ marginTop: 6 }}><CgThumb graphic={g} refOverride={ref} autoplay={false} /></div></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={cap}>Fields ← columns</div>
        {g.fields.map(f => (
          <label key={f.key} style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr)', gap: 6, alignItems: 'center' }}>
            <span className="dim small">{f.label}</span>
            <input className="in" list={`cols-${source.id}`} value={map[f.key] || ''} placeholder="column, {A} {B}, #count, @0:col" onChange={(e) => setMap({ ...map, [f.key]: e.target.value })} />
          </label>
        ))}
        <datalist id={`cols-${source.id}`}>{columns.map(c => <option key={c} value={c} />)}<option value="#count" /><option value="#index" /></datalist>
        <div style={cap}>Row</div>
        <select className="sel" value={row.mode === 'index' ? `i${row.index}` : row.mode} onChange={(e) => { const v = e.target.value; setRow(v === 'last' ? { mode: 'last' } : v === 'first' ? { mode: 'first' } : { mode: 'index', index: Number(v.slice(1)) }); }}>
          <option value="last">Newest row (updates as rows are added)</option><option value="first">First row</option>
          {Array.from({ length: 20 }, (_, i) => <option key={i} value={`i${i}`}>Row {i + 1}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          <button className="minibtn" onClick={() => { playout.addToRundown(ref, `${g.name} · ${source.name}`, defaultSlotFor(g)); ping?.('Bound graphic added to the rundown'); }}>+ RUNDOWN</button>
          <button className="minibtn" style={{ color: '#ff9a9a' }} onClick={() => { playout.take(ref, { label: `${g.name} · ${source.name}` }); ping?.('On air — values update live'); }}>TAKE LIVE</button>
          <button className="minibtn blue" title="Every row becomes a rundown item; new rows (names added in the sheet) append automatically" onClick={() => { playout.addFollow({ sourceId: source.id, ref: { ...ref, data: { ...ref.data!, row: { mode: 'row-of-item' } } }, labelColumn: Object.values(map)[0], slot: defaultSlotFor(g) }); ping?.(`Rundown now follows ${source.name}`); }}>FOLLOW IN RUNDOWN</button>
        </div>
      </div>
    </div>
  );
};

const DataTab: React.FC<{ ping?: (m: string) => void }> = ({ ping }) => {
  const sources = useSources().filter(s => s.kind !== 'weather' && s.kind !== 'simulator');
  const [sel, setSel] = useState<string | null>(sources[0]?.id || null);
  const snap = useSnapshot(sel);
  const src = sources.find(s => s.id === sel) || null;
  const prevCount = useRef(0);
  const newFrom = snap?.table ? (prevCount.current && snap.table.rows.length > prevCount.current ? prevCount.current : snap.table.rows.length) : 0;
  useEffect(() => { prevCount.current = snap?.table?.rows.length || 0; }, [snap?.sig]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)', gap: 10, height: '100%', minHeight: 0 }}>
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <p style={lbl}>Sources</p>
        {sources.map(s => <SourceRow key={s.id} s={s} active={s.id === sel} onClick={() => setSel(s.id)} />)}
        {!sources.length && <div className="dim small">No data sources yet.</div>}
        <p style={{ ...lbl, marginTop: 8 }}>Add</p>
        <AddSourceForm onAdded={(s) => setSel(s.id)} ping={ping} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        {src ? (
          <>
            <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '45%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusDot s={snap} /><p style={{ ...lbl, margin: 0 }}>{src.name}</p>
                <span className="dim small">{snap?.table ? `${snap.table.rows.length} rows · ${snap.table.columns.length} columns` : snap?.status}{snap?.error ? ` — ${snap.error}` : ''}</span>
                <span style={{ flex: 1 }} />
                {src.kind === 'csv-text' && <button className="minibtn" onClick={() => { const t = prompt('Edit CSV', src.config.text || ''); if (t != null) updateSource(src.id, { config: { text: t } }); }}>EDIT CSV</button>}
                <button className="minibtn danger" onClick={() => { removeSource(src.id); setSel(null); }}>REMOVE</button>
              </div>
              <div style={{ overflow: 'auto', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                  <thead><tr>{snap?.table?.columns.map(c => <th key={c} style={{ position: 'sticky', top: 0, background: '#1c1c23', textAlign: 'left', padding: '5px 8px', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)' }}>{c}</th>)}</tr></thead>
                  <tbody>{snap?.table?.rows.slice(-200).map((r, i, arr) => { const idx = (snap.table!.rows.length - arr.length) + i; return (
                    <tr key={idx} style={{ background: idx >= newFrom ? 'rgba(34,197,94,.14)' : idx % 2 ? 'rgba(255,255,255,.02)' : 'transparent' }}>{snap.table!.columns.map(c => <td key={c} style={{ padding: '4px 8px', borderTop: '1px solid rgba(255,255,255,.05)', whiteSpace: 'nowrap' }}>{r[c]}</td>)}</tr>
                  ); })}</tbody>
                </table>
              </div>
            </div>
            <div style={{ ...panel, overflowY: 'auto' }}>
              <p style={lbl}>Bind to a graphic</p>
              <BindPanel source={src} columns={snap?.table?.columns || []} ping={ping} />
            </div>
          </>
        ) : <div style={{ ...panel, display: 'grid', placeItems: 'center' }} className="dim">Add or pick a data source.</div>}
      </div>
    </div>
  );
};

const SourceRow: React.FC<{ s: LiveSource; active: boolean; onClick: () => void }> = ({ s, active, onClick }) => {
  const snap = useSnapshot(s.id);
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, border: `1px solid ${active ? 'rgba(249,115,22,.55)' : 'rgba(255,255,255,.08)'}`, background: active ? 'rgba(249,115,22,.14)' : 'rgba(0,0,0,.3)', color: '#e5e5e5', textAlign: 'left', cursor: 'pointer' }}>
      <StatusDot s={snap} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, fontSize: 12 }}>{s.name}</span>
      <span className="mono" style={{ fontSize: 10, color: 'rgba(255,255,255,.45)' }}>{snap?.table ? snap.table.rows.length : '…'}</span>
    </button>
  );
};

// ── VISUALIZERS ───────────────────────────────────────────────────────────────
const VisualizersTab: React.FC<{ ping?: (m: string) => void; onUseAsFill?: (src: VisualSource, mode: VisualPaintMode) => void }> = ({ ping, onUseAsFill }) => {
  const [cat, setCat] = useState<VisualEntry[]>([]);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [sel, setSel] = useState<VisualEntry | null>(null);
  const [audio, setAudio] = useState<'master' | 'live-input' | 'none'>('master');
  const [mode, setMode] = useState<VisualPaintMode>('fill');
  const [pkg, setPkg] = useState(CG_PACKAGES[0].id);
  useEffect(() => { visualCatalog().then(setCat).catch(() => setCat([])); }, []);
  const groups = useMemo(() => ['all', ...Array.from(new Set(cat.map(c => c.group)))], [cat]);
  const list = cat.filter(c => (group === 'all' || c.group === group) && (!q || c.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 300);
  const source: VisualSource | null = sel ? { engine: sel.engine, value: sel.value, audio } : null;
  const playout = sharedPlayout({ master: true });
  const make = (archetype: string, layerId: string, m: VisualPaintMode) => {
    const base = libraryGraphic(`${pkg}.${archetype}`); if (!base || !source) return null;
    const g = withPaint(base, layerId, source, m); g.name = `${base.name} · ${sel!.name}`;
    return g;
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 10, height: '100%', minHeight: 0 }}>
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input className="in" placeholder={`Search ${cat.length} visuals…`} value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: '1 1 200px' }} />
          <select className="sel" value={group} onChange={(e) => setGroup(e.target.value)} style={{ maxWidth: 240 }}>{groups.map(g => <option key={g} value={g}>{g === 'all' ? 'All groups' : g}</option>)}</select>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 6, alignContent: 'start' }}>
          {list.map(e => (
            <button key={e.engine + e.value} onClick={() => setSel(e)} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', color: '#e5e5e5', border: `1px solid ${sel?.value === e.value && sel.engine === e.engine ? 'rgba(249,115,22,.7)' : 'rgba(255,255,255,.08)'}`, background: sel?.value === e.value ? 'rgba(249,115,22,.14)' : 'rgba(0,0,0,.3)' }}>
              <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
              <div style={{ ...cap, fontSize: 7.5, marginTop: 3 }}>{e.group}</div>
            </button>
          ))}
          {!cat.length && <div className="dim small">Loading the visualizer catalogue…</div>}
        </div>
      </div>
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        <p style={lbl}>Preview</p>
        <VisualPreview source={source} />
        {sel ? (
          <>
            <div style={{ fontWeight: 800 }}>{sel.name}</div>
            <label style={cap}>Audio reactivity</label>
            <select className="sel" value={audio} onChange={(e) => setAudio(e.target.value as typeof audio)}><option value="master">Program / Stage master bus</option><option value="live-input">Live input (mic / line)</option><option value="none">None (idle motion)</option></select>
            <label style={cap}>Package (brand)</label>
            <select className="sel" value={pkg} onChange={(e) => setPkg(e.target.value)}>{CG_PACKAGES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="minibtn" onClick={() => { const g = make('vis-backdrop', 'visualizer', 'fill'); if (g) { playout.addToRundown({ graphicId: g.id, inline: g }, g.name, 'FULL'); ping?.('Backdrop added to the rundown'); } }}>+ BACKDROP</button>
              <button className="minibtn" onClick={() => { const g = make('vis-strap', 'visual-plate', 'gradient-map'); if (g) { playout.addToRundown({ graphicId: g.id, inline: g }, g.name, 'L1'); ping?.('Visualizer strap added to the rundown'); } }}>+ BRANDED STRAP</button>
              <button className="minibtn" onClick={() => { const g = make('lt-strap', 'name-plate', 'texture'); if (g) { playout.addToRundown({ graphicId: g.id, inline: g }, g.name, 'L1'); ping?.('Textured strap added'); } }}>+ TEXTURED STRAP</button>
            </div>
            {onUseAsFill && (
              <>
                <label style={cap}>Use on the Designer's selected layer as</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['fill', 'texture', 'mask', 'gradient-map'] as VisualPaintMode[]).map(m => <button key={m} className={`minibtn ${mode === m ? 'blue' : ''}`} onClick={() => setMode(m)}>{m.toUpperCase()}</button>)}
                </div>
                <button className="cta" onClick={() => source && onUseAsFill(source, mode)}>Apply to selected layer</button>
              </>
            )}
            <div className="dim small">One shared instance per visual: ten shapes using it cost one GPU context.</div>
          </>
        ) : <div className="dim small">Pick a visualizer, Chora visual, live feed or avatar.</div>}
      </div>
    </div>
  );
};

// ── SIMULATORS ────────────────────────────────────────────────────────────────
const SimulatorsTab: React.FC<{ ping?: (m: string) => void }> = ({ ping }) => {
  const sims = listSimulators();
  const sources = useSources().filter(s => s.kind === 'simulator');
  const [sel, setSel] = useState<string | null>(sources[0]?.id || null);
  const snap = useSnapshot(sel);
  const src = sources.find(s => s.id === sel);
  const add = (simId: string, mode: 'live' | 'series') => { const d = sims.find(s => s.id === simId)!; const s = addSource({ name: `${d.name} · ${mode}`, kind: 'simulator', config: { simId, mode, speed: 1 }, intervalMs: mode === 'live' ? 100 : 60000 }); setSel(s.id); };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 10, height: '100%', minHeight: 0 }}>
      <div style={{ ...panel, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={lbl}>Simulators</p>
        {sims.map(s => (
          <div key={s.id} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, padding: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 12 }}>{s.name}</div><div style={{ ...cap, fontSize: 7.5 }}>{s.group}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}><button className="minibtn" onClick={() => add(s.id, 'live')}>LIVE PLAYBACK</button><button className="minibtn" onClick={() => add(s.id, 'series')}>SERIES</button></div>
          </div>
        ))}
        <p style={{ ...lbl, marginTop: 8 }}>Running</p>
        {sources.map(s => <SourceRow key={s.id} s={s} active={s.id === sel} onClick={() => setSel(s.id)} />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        {src && snap?.table ? (
          <>
            <div style={{ ...panel, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 6 }}>
              {snap.table.columns.map(c => (
                <div key={c} style={{ background: 'rgba(0,0,0,.35)', borderRadius: 8, padding: 8 }}>
                  <div style={cap}>{c}</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: c === 't' ? 'rgba(255,255,255,.6)' : '#f97316' }}>{snap.table!.rows[snap.table!.rows.length - 1]?.[c]}</div>
                </div>
              ))}
            </div>
            <div style={{ ...panel, overflowY: 'auto' }}><p style={lbl}>Bind to a graphic</p><BindPanel source={src} columns={snap.table.columns} ping={ping} defaultGraphic="stadium.fp-stat" /></div>
          </>
        ) : <div style={{ ...panel, display: 'grid', placeItems: 'center' }} className="dim">Start a simulator to feed graphics with its channels.</div>}
      </div>
    </div>
  );
};

// ── WEATHER ───────────────────────────────────────────────────────────────────
const WeatherTab: React.FC<{ ping?: (m: string) => void }> = ({ ping }) => {
  const sources = useSources().filter(s => s.kind === 'weather');
  const [sel, setSel] = useState<string | null>(sources[0]?.id || null);
  const [place, setPlace] = useState('');
  const [units, setUnits] = useState<'imperial' | 'metric'>('imperial');
  const [pkg, setPkg] = useState('meridian');
  const snap = useSnapshot(sel);
  const src = sources.find(s => s.id === sel);
  const playout = sharedPlayout({ master: true });
  const ref = (arch: string): CgGraphicRef | null => { const g = libraryGraphic(`${pkg}.${arch}`); return g && src ? { graphicId: g.id, data: { sourceId: src.id, row: { mode: 'first' }, map: { ...(g.dataHints || {}) } } } : null; };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', gap: 10, height: '100%', minHeight: 0 }}>
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
        <p style={lbl}>Locations</p>
        {sources.map(s => <SourceRow key={s.id} s={s} active={s.id === sel} onClick={() => setSel(s.id)} />)}
        <input className="in" placeholder="City, e.g. Atlanta" value={place} onChange={(e) => setPlace(e.target.value)} />
        <select className="sel" value={units} onChange={(e) => setUnits(e.target.value as typeof units)}><option value="imperial">°F · mph</option><option value="metric">°C · km/h</option></select>
        <button className="cta" onClick={() => { if (!place.trim()) return; const s = addSource({ name: `Weather · ${place.trim()}`, kind: 'weather', config: { place: place.trim(), units }, intervalMs: 10 * 60 * 1000 }); setSel(s.id); setPlace(''); }}>Add location</button>
        <div className="dim small">Open-Meteo · refreshes every 10 minutes · no key needed</div>
        {src && <button className="minibtn danger" onClick={() => { removeSource(src.id); setSel(null); }}>REMOVE LOCATION</button>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflowY: 'auto' }}>
        {src ? (
          <>
            <div style={{ ...panel, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusDot s={snap} /><p style={{ ...lbl, margin: 0 }}>{snap?.table?.rows[0]?.place || src.name}</p>
              <span className="dim small">{snap?.error || (snap?.table ? `${snap.table.rows[0]?.temp}${snap.table.rows[0]?.unit} · ${snap.table.rows[0]?.condition} · wind ${snap.table.rows[0]?.wind}` : 'Loading…')}</span>
              <span style={{ flex: 1 }} />
              <select className="sel" value={pkg} onChange={(e) => setPkg(e.target.value)} style={{ maxWidth: 200 }}>{CG_PACKAGES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 10 }}>
              {['wx-current', 'wx-5day'].map(a => { const r = ref(a); const g = libraryGraphic(`${pkg}.${a}`); return r && g ? (
                <div key={a} style={panel}>
                  <CgThumb graphic={g} refOverride={r} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, flex: 1 }}>{g.name}</span>
                    <button className="minibtn" onClick={() => { playout.addToRundown(r, `${g.name} · ${src.name}`); ping?.('Added to the rundown — live weather'); }}>+ RUNDOWN</button>
                    <button className="minibtn" style={{ color: '#ff9a9a' }} onClick={() => playout.take(r)}>TAKE</button>
                  </div>
                </div>
              ) : null; })}
            </div>
            {snap?.table && <div style={panel}><p style={lbl}>Forecast data</p><div className="mono small" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 6 }}>{snap.table.rows.map(r => <div key={r.date} style={{ background: 'rgba(0,0,0,.3)', borderRadius: 6, padding: 6 }}><div>{r.day}</div><div style={{ color: '#f97316' }}>{r.high}° / {r.low}°</div><div className="dim">{r.condition}</div><div className="dim">{r.precip}%</div></div>)}</div></div>}
          </>
        ) : <div style={{ ...panel, display: 'grid', placeItems: 'center' }} className="dim">Add a location for live weather graphics.</div>}
      </div>
    </div>
  );
};

// ── TRACKING ──────────────────────────────────────────────────────────────────
const TrackingTab: React.FC<{ ping?: (m: string) => void }> = ({ ping }) => {
  const [trackers, setTrackers] = useState<TrackerDef[]>(listTrackers());
  useEffect(() => onTrackersChange(() => setTrackers([...listTrackers()])), []);
  const [sel, setSel] = useState<string | null>(trackers[0]?.id || null);
  const [kind, setKind] = useState<TrackerKind>('face');
  const [feed, setFeed] = useState('camera');
  const t = trackers.find(x => x.id === sel) || null;
  const [point, setPoint] = useState('faceBottom');
  const [gid, setGid] = useState('meridian.tag-follow');
  const [dy, setDy] = useState(20);
  const [scaleWith, setScaleWith] = useState(true);
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (t) setPoint(anchorNames(t.kind)[t.kind === 'face' ? 2 : 0]); }, [t?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!sel) return; return useTracker(sel); }, [sel]); // eslint-disable-line react-hooks/rules-of-hooks
  // Preview: the feed with anchors drawn on top.
  useEffect(() => {
    if (!t) return;
    const video = liveFeedVideo(t.feed);
    let raf = 0;
    const draw = () => {
      const c = cv.current; if (c && video) {
        const w = c.clientWidth || 640, h = Math.round(w * 9 / 16); if (c.width !== w) { c.width = w; c.height = h; }
        const ctx = c.getContext('2d')!; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
        if (video.readyState >= 2) drawFitted(ctx, video, 0, 0, w, h, 'stretch');
        const st = trackerState(t.id);
        if (st?.box) { ctx.strokeStyle = 'rgba(0,163,255,.8)'; ctx.lineWidth = 2; ctx.strokeRect(st.box.x * w, st.box.y * h, st.box.w * w, st.box.h * h); }
        for (const [n, a] of Object.entries(st?.anchors || {})) { ctx.fillStyle = n === point ? '#f97316' : 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(a.x * w, a.y * h, n === point ? 6 : 3.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(8, 8, 160, 22); ctx.fillStyle = st?.status === 'tracking' ? '#22c55e' : st?.status === 'error' ? '#ef4444' : '#f59e0b'; ctx.font = '700 11px Inter, sans-serif'; ctx.fillText(`● ${(st?.status || 'starting').toUpperCase()}`, 16, 23);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const off = onTrackerState(() => undefined);
    return () => { cancelAnimationFrame(raf); off(); releaseLiveFeed(t.feed); };
  }, [t?.id, t?.feed, point]); // eslint-disable-line react-hooks/exhaustive-deps
  const g = libraryGraphic(gid);
  const ref: CgGraphicRef | null = g && t ? { graphicId: g.id, anchor: { trackerId: t.id, point, dy, scaleWithSubject: scaleWith, hideWhenLost: true } } : null;
  const playout = sharedPlayout({ master: true });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr) 320px', gap: 10, height: '100%', minHeight: 0 }}>
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
        <p style={lbl}>Trackers</p>
        {trackers.map(x => (
          <button key={x.id} onClick={() => setSel(x.id)} style={{ textAlign: 'left', padding: '7px 8px', borderRadius: 8, color: '#e5e5e5', cursor: 'pointer', border: `1px solid ${x.id === sel ? 'rgba(249,115,22,.55)' : 'rgba(255,255,255,.08)'}`, background: x.id === sel ? 'rgba(249,115,22,.14)' : 'rgba(0,0,0,.3)' }}>
            <div style={{ fontWeight: 700, fontSize: 12 }}>{x.name}</div><div style={{ ...cap, fontSize: 7.5 }}>{x.kind} · {LIVE_FEED_CHOICES.find(f => f.id === x.feed)?.name || x.feed}</div>
          </button>
        ))}
        <p style={{ ...lbl, marginTop: 8 }}>New tracker</p>
        <select className="sel" value={kind} onChange={(e) => setKind(e.target.value as TrackerKind)}><option value="face">Face (MediaPipe)</option><option value="pose">Body pose (MediaPipe)</option><option value="point">Point / object (click to pick)</option></select>
        <select className="sel" value={feed} onChange={(e) => setFeed(e.target.value)}>{LIVE_FEED_CHOICES.filter(f => f.id !== 'fabula:graphics').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <button className="cta" onClick={() => { const n = addTracker({ name: `${kind[0].toUpperCase()}${kind.slice(1)} · ${LIVE_FEED_CHOICES.find(f => f.id === feed)?.name}`, kind, feed, smoothing: 0.6 }); setSel(n.id); }}>Add tracker</button>
        <div className="dim small">Face and body trackers download their model once (internet needed). Point tracking runs offline.</div>
        {t && <button className="minibtn danger" onClick={() => { removeTracker(t.id); setSel(null); }}>REMOVE TRACKER</button>}
      </div>
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={lbl}>{t ? t.name : 'Live preview'}</p>
        <canvas ref={cv} onClick={(e) => { if (!t || t.kind !== 'point') return; const r = (e.target as HTMLCanvasElement).getBoundingClientRect(); seedPoint(t.id, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); ping?.('Tracking that point'); }}
          style={{ width: '100%', aspectRatio: '16/9', borderRadius: 8, background: '#000', cursor: t?.kind === 'point' ? 'crosshair' : 'default' }} />
        {t?.kind === 'point' && <div className="dim small">Click the video on something with texture — a jersey number, a logo, a car — to track it.</div>}
      </div>
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
        <p style={lbl}>Attach a graphic</p>
        {t ? (
          <>
            <label style={cap}>Follow point</label>
            <select className="sel" value={point} onChange={(e) => setPoint(e.target.value)}>{anchorNames(t.kind).map(n => <option key={n} value={n}>{n}</option>)}</select>
            <label style={cap}>Graphic</label>
            <GraphicPicker value={gid} onChange={setGid} />
            <label style={{ ...cap, display: 'flex', gap: 6, alignItems: 'center' }}>Offset Y <input className="in" type="number" value={dy} onChange={(e) => setDy(Number(e.target.value))} style={{ width: 80 }} /> px</label>
            <label className="dim small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={scaleWith} onChange={(e) => setScaleWith(e.target.checked)} /> Scale with the subject</label>
            {g && ref && <CgThumb graphic={g} refOverride={{ graphicId: g.id }} autoplay={false} />}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="minibtn" onClick={() => { if (ref && g) { playout.addToRundown(ref, `${g.name} · follows ${t.name}`, 'L2'); ping?.('Tracked graphic added to the rundown'); } }}>+ RUNDOWN</button>
              <button className="minibtn" style={{ color: '#ff9a9a' }} onClick={() => { if (ref) { playout.take(ref, { slot: 'L2' }); ping?.('On air — following the subject'); } }}>TAKE LIVE</button>
            </div>
          </>
        ) : <div className="dim small">Add a tracker first.</div>}
      </div>
    </div>
  );
};

// ── AVATARS ───────────────────────────────────────────────────────────────────
const AvatarsTab: React.FC<{ ping?: (m: string) => void }> = ({ ping }) => {
  const [avatar, setAvatar] = useState(AVATAR_CHOICES[0].url);
  const [custom, setCustom] = useState('');
  const [feed, setFeed] = useState('camera');
  const [layout, setLayout] = useState<'pip' | 'full' | 'lower'>('pip');
  const url = custom.trim() || avatar;
  const source: VisualSource = { engine: 'avatar', value: avatarValue(url, feed) };
  const playout = sharedPlayout({ master: true });
  const build = (): CgGraphic => {
    const box = layout === 'full' ? { x: 0, y: 0, w: 1920, h: 1080 } : layout === 'lower' ? { x: 120, y: 560, w: 560, h: 420 } : { x: 1340, y: 600, w: 480, h: 400 };
    return {
      id: `user.avatar${Date.now().toString(36)}`, name: `Live avatar · ${layout}`, category: 'frame', packageId: 'custom', tags: ['avatar', 'live'], custom: true,
      palette: { accent: '#f97316', ink: '#ffffff', paper: '#16161c', secondary: '#9aa1b2', highlight: '#ffd166', shade: '#000000' },
      fonts: { display: 'inter', text: 'inter' }, fields: [],
      layers: [{ id: 'avatar', name: 'Avatar', kind: 'visual', ...box, paint: { source, mode: 'fill', fit: 'contain' }, in: { type: 'pop', dur: .5, ease: 'back' }, out: { type: 'fade', dur: .35 } }],
      timing: { in: .5, out: .35, hold: 30 }, live: 'hold', coverage: layout === 'full' ? 'full' : 'region',
    };
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 10, height: '100%', minHeight: 0 }}>
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={lbl}>Live avatar</p>
        <div style={{ background: 'repeating-conic-gradient(#222 0% 25%, #161616 0% 50%) 50% / 24px 24px', borderRadius: 8 }}><VisualPreview source={source} height={480} /></div>
        <div className="dim small">Face-tracked from the selected feed; transparent background, so it keys over program.</div>
      </div>
      <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={cap}>Avatar</label>
        <select className="sel" value={avatar} onChange={(e) => setAvatar(e.target.value)}>{AVATAR_CHOICES.map(a => <option key={a.id} value={a.url}>{a.name}</option>)}</select>
        <input className="in" placeholder="…or a VRM URL" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <label style={cap}>Driven by</label>
        <select className="sel" value={feed} onChange={(e) => setFeed(e.target.value)}>{LIVE_FEED_CHOICES.filter(f => f.id !== 'fabula:graphics').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <label style={cap}>Placement</label>
        <select className="sel" value={layout} onChange={(e) => setLayout(e.target.value as typeof layout)}><option value="pip">Corner (picture-in-picture)</option><option value="lower">Lower left (presenter)</option><option value="full">Full frame</option></select>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button className="minibtn" onClick={() => { const g = build(); playout.addToRundown({ graphicId: g.id, inline: g }, g.name, layout === 'full' ? 'FULL' : 'L2'); ping?.('Avatar added to the rundown'); }}>+ RUNDOWN</button>
          <button className="minibtn" style={{ color: '#ff9a9a' }} onClick={() => { const g = build(); playout.take({ graphicId: g.id, inline: g }, { slot: layout === 'full' ? 'FULL' : 'L2' }); ping?.('Avatar on air'); }}>TAKE LIVE</button>
        </div>
        <div className="dim small" style={{ marginTop: 6 }}>Avatars are also a visual source: pick one in VISUALIZERS to fill any shape or text with it.</div>
      </div>
    </div>
  );
};

// ── room ──────────────────────────────────────────────────────────────────────
export const CgSourcesRoom: React.FC<{ ping?: (m: string) => void; onUseAsFill?: (src: VisualSource, mode: VisualPaintMode) => void }> = ({ ping, onUseAsFill }) => {
  const [tab, setTab] = useState<Tab>('data');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minHeight: 0 }}>
      <div role="tablist" aria-label="Sources" style={{ display: 'flex', gap: 2, border: '1px solid rgba(255,255,255,.08)', borderRadius: 6, padding: 2, background: 'rgba(0,0,0,.34)', alignSelf: 'flex-start' }}>
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            style={{ border: 0, fontSize: 9, fontWeight: 900, letterSpacing: '.12em', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', background: tab === id ? '#f97316' : 'transparent', color: tab === id ? '#0b0b0e' : 'rgba(255,255,255,.6)' }}>{label}</button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'data' && <DataTab ping={ping} />}
        {tab === 'visualizers' && <VisualizersTab ping={ping} onUseAsFill={onUseAsFill} />}
        {tab === 'simulators' && <SimulatorsTab ping={ping} />}
        {tab === 'weather' && <WeatherTab ping={ping} />}
        {tab === 'tracking' && <TrackingTab ping={ping} />}
        {tab === 'avatars' && <AvatarsTab ping={ping} />}
      </div>
    </div>
  );
};

export default CgSourcesRoom;
