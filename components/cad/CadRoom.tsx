// CAD & BIM room (Phase 0): open DXF, IFC, STEP, IGES, STL, OBJ, GLB and 3MF; look at
// them in 2D or 3D; layers, model tree, properties, size and print checks; send to a
// Tela document. Plan: docs/CAD_BIM_ENGINEERING_SUITE_PLAN.md.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Line, Html } from '@react-three/drei';
import { X, FilePlus, FolderOpen, Armchair, ClipboardList, Building2, Eye, EyeOff, Layers, ListTree, Download, FilePlus2, Ruler, AlertTriangle, CheckCircle2, Box, Square, Crosshair, Scissors, Info } from 'lucide-react';
import type { CadModel, CadElement } from '../../services/cad/model';
import { MM_PER_UNIT } from '../../services/cad/model';
import { importCadFile, CAD_ACCEPT, CAD_FORMATS, detectCadFormat } from '../../services/cad/importer';
import { browserEngines } from '../../services/cad/engines';
import { drawingToSvg, writeDxf, flatten2D, drawingFrame } from '../../services/cad/dxf';
import { modelToGroup, isZUp } from '../../services/cad/scene';
import { modelStats, type MeshStats } from '../../services/cad/mesh';
import { newDrawing, setLayer } from '../../services/cad/draft';
import DraftView from './DraftView';
import LibraryPanel, { type Placing } from './LibraryPanel';
import SchedulesPanel from './SchedulesPanel';
import { allSchedules, type Table } from '../../services/cad/schedules';
import { runChecks, type Finding } from '../../services/cad/codeCheck';
import { bimTo3D } from '../../services/cad/bim3d';
import { writeIfc } from '../../services/cad/ifcWrite';
import { userBlocks, scaleEntities } from '../../services/cad/library';
import { engineById } from '../../services/cad/licences';

export interface CadRoomProps {
  onClose?: () => void;
  /** Present when opened from a Tela document: puts a schedule into the document as a table. */
  onSendTable?: (title: string, rows: string[][]) => Promise<void>;
  /** Present when opened from a Tela document. */
  onSendToTela?: (model: CadModel, source: { name: string; bytes: Uint8Array }) => Promise<void>;
  /** Reopen a file (e.g. the original kept on a Tela device). */
  initialFile?: { name: string; bytes: Uint8Array } | null;
  loadInitial?: () => Promise<{ name: string; bytes: Uint8Array }>;
}

type ViewDir = 'iso' | 'top' | 'front' | 'right';
const NO_LAYERS = new Set<string>();
/** A clip plane across the model: axis in viewer space (y = up), t = 0..1 through the bounds. */
type Section = { axis: 'x' | 'y' | 'z'; t: number };
const C = { bg: '#0d0c12', panel: '#15131d', line: 'rgba(255,255,255,.08)', text: 'rgba(255,255,255,.86)', dim: 'rgba(255,255,255,.5)', accent: '#7dd3fc', warm: '#ffb020' };

/** One unit for every axis of a model: metres/feet for buildings, mm/inches for parts. */
const fmtLen = (mm: number, imperial: boolean, large: boolean) => imperial
  ? large ? `${(mm / 304.8).toLocaleString(undefined, { maximumFractionDigits: 2 })} ft` : `${(mm / 25.4).toLocaleString(undefined, { maximumFractionDigits: 2 })} in`
  : large ? `${(mm / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} m` : `${mm.toLocaleString(undefined, { maximumFractionDigits: 1 })} mm`;
const fmtArea = (mm2: number, imperial: boolean, large: boolean) => imperial
  ? large ? `${(mm2 / 92903.04).toLocaleString(undefined, { maximumFractionDigits: 1 })} ft²` : `${(mm2 / 645.16).toLocaleString(undefined, { maximumFractionDigits: 2 })} in²`
  : large ? `${(mm2 / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })} m²` : `${(mm2 / 100).toLocaleString(undefined, { maximumFractionDigits: 1 })} cm²`;
const fmtVol = (mm3: number, imperial: boolean, large: boolean) => imperial
  ? large ? `${(mm3 / 28316846.6).toLocaleString(undefined, { maximumFractionDigits: 2 })} ft³` : `${(mm3 / 16387.064).toLocaleString(undefined, { maximumFractionDigits: 2 })} in³`
  : large ? `${(mm3 / 1e9).toLocaleString(undefined, { maximumFractionDigits: 3 })} m³` : `${(mm3 / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} cm³`;

export default function CadRoom({ onClose, onSendToTela, onSendTable, initialFile, loadInitial }: CadRoomProps) {
  const [model, setModel] = useState<CadModel | null>(null);
  const [source, setSource] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState('');
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [hiddenEls, setHiddenEls] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'layers' | 'tree' | 'library' | 'schedules'>('tree');
  const [view, setView] = useState<ViewDir>('iso');
  const [viewNonce, setViewNonce] = useState(0);
  const [imperial, setImperial] = useState(false);
  const [sent, setSent] = useState('');
  const [dragging, setDragging] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  // Drafting: current layer, selection, undo/redo of whole models, and whether it was edited.
  const [currentLayer, setCurrentLayer] = useState('0');
  const [draftSel, setDraftSel] = useState<number[]>([]);
  const undoStack = useRef<CadModel[]>([]); const redoStack = useRef<CadModel[]>([]);
  const [edited, setEdited] = useState(false);
  const [newLayer, setNewLayer] = useState('');
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [showChecks, setShowChecks] = useState(true);
  // Our own BIM view: the plan's walls, openings and rooms as a 3D model (same model the IFC export writes).
  const [view3d, setView3d] = useState(false);
  const [section, setSection] = useState<Section | null>(null);
  // Under 900 px the side panels become drawers opened from the top bar.
  const narrow = useNarrow(900);
  const [drawer, setDrawer] = useState<'tree' | 'info' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = useCallback(async (name: string, bytes: Uint8Array) => {
    setError(''); setSent(''); setSelected(null); setHiddenEls(new Set()); setHiddenLayers(new Set()); setMeasuring(false); setSection(null);
    undoStack.current = []; redoStack.current = []; setEdited(false); setDraftSel([]); setCurrentLayer('0'); setPlacing(null); setView3d(false);
    const fmt = detectCadFormat(name, bytes);
    setBusy(fmt ? `Reading ${CAD_FORMATS[fmt].label}…` : 'Reading…');
    const t0 = performance.now();
    try {
      const m = await importCadFile(name, bytes, browserEngines);
      m.meta.readMs = String(Math.round(performance.now() - t0));
      setModel(m); setSource({ name, bytes }); setTab(m.is2D ? 'layers' : 'tree'); setView(m.is2D ? 'top' : 'iso'); setViewNonce(n => n + 1);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(''); }
  }, []);

  useEffect(() => {
    if (initialFile) void open(initialFile.name, initialFile.bytes);
    else if (loadInitial) { setBusy('Loading the original file…'); loadInitial().then(f => open(f.name, f.bytes)).catch(e => { setBusy(''); setError(e?.message || String(e)); }); }
  }, [initialFile, loadInitial, open]);

  const onFile = async (f: File) => open(f.name, new Uint8Array(await f.arrayBuffer()));

  const startNew = () => {
    const m = newDrawing('Drawing.dxf', imperial ? 'in' : 'mm');
    undoStack.current = []; redoStack.current = []; setEdited(true); setDraftSel([]); setCurrentLayer('A-WALL');
    setError(''); setSent(''); setHiddenLayers(new Set()); setModel(m); setSource(null); setTab('layers'); setView('top'); setViewNonce(n => n + 1);
  };
  const commit = (next: CadModel) => { if (model) undoStack.current.push(model); if (undoStack.current.length > 200) undoStack.current.shift(); redoStack.current = []; setModel(next); setEdited(true); };
  const undo = () => { const prev = undoStack.current.pop(); if (!prev || !model) return; redoStack.current.push(model); setModel(prev); setDraftSel([]); };
  const redo = () => { const next = redoStack.current.pop(); if (!next || !model) return; undoStack.current.push(model); setModel(next); setDraftSel([]); };
  /** Merge the named blocks (and their layers) of another DWG/DXF into this drawing, in this drawing's units. */
  const loadBlocks = async (file: File) => {
    if (!model) return;
    setBusy(`Reading blocks from ${file.name}…`);
    try {
      const src = await importCadFile(file.name, new Uint8Array(await file.arrayBuffer()), browserEngines);
      const k = src.units !== 'unitless' && model.units !== 'unitless' ? MM_PER_UNIT[src.units] / MM_PER_UNIT[model.units] : 1;
      const have = new Set(model.blocks.map(b => b.name));
      // Nested blocks come along too, so inserts inside blocks still resolve.
      const incoming = src.blocks.filter(b => !have.has(b.name)).map(b => ({ ...b, base: [b.base[0] * k, b.base[1] * k, b.base[2] * k] as [number, number, number], entities: scaleEntities(b.entities, k) }));
      const named = userBlocks({ ...src, blocks: incoming }).length;
      if (!named) { setError(`${file.name} has no named blocks${src.warnings.length ? ` (${src.warnings[0]})` : ''}.`); return; }
      const haveLayers = new Set(model.layers.map(l => l.name));
      commit({ ...model, blocks: [...model.blocks, ...incoming], layers: [...model.layers, ...src.layers.filter(l => !haveLayers.has(l.name))] });
      setSent(`Loaded ${named} block${named > 1 ? 's' : ''} from ${file.name}${k !== 1 ? ` (scaled ${src.units} to ${model.units})` : ''}.`);
    } catch (e: any) { setError(e?.message || String(e)); } finally { setBusy(''); }
  };
  const addLayer = () => {
    const name = newLayer.trim().replace(/[<>/\\":;?*|=,]/g, '').slice(0, 64); if (!name || !model || model.layers.some(l => l.name === name)) return;
    commit({ ...model, layers: [...model.layers, { name, color: '#ffffff', visible: true }] }); setCurrentLayer(name); setNewLayer('');
  };

  const stats: MeshStats | null = useMemo(() => model && model.meshes.length ? modelStats(model) : null, [model]);
  const sizeMm = useMemo(() => model ? [0, 1, 2].map(i => (model.bounds.max[i] - model.bounds.min[i]) * MM_PER_UNIT[model.units]) : [0, 0, 0], [model]);
  const engine = model ? engineById(model.engine) : undefined;
  const large = Math.max(...sizeMm) >= 5000; // past 5 m, read it in metres / feet
  const isBim = model?.format === 'ifc';
  const u2 = model ? MM_PER_UNIT[model.units] ** 2 : 1; const u3 = model ? MM_PER_UNIT[model.units] ** 3 : 1;
  const hasWalls = !!model?.is2D && model.entities.some(e => e.type === 'wall');
  const bim = useMemo(() => view3d && model && hasWalls ? bimTo3D(model) : null, [view3d, model, hasWalls]);
  const in3d = !!bim;
  const selectedEl = (bim ?? model)?.elements.find(e => e.id === selected) ?? null;
  // Schedules and checks follow the model: recomputed on every edit, never typed.
  const hasBim = !!model?.is2D && model.entities.some(e => e.type === 'wall' || e.type === 'insert' || e.type === 'room');
  const tables: Table[] = useMemo(() => model?.is2D && hasBim ? allSchedules(model) : [], [model, hasBim]);
  const findings: Finding[] = useMemo(() => model?.is2D && hasBim ? runChecks(model) : [], [model, hasBim]);
  const sendTable = async (t: Table) => { if (!onSendTable) return; setBusy(`Adding the ${t.title.toLowerCase()}…`); try { await onSendTable(t.title, [t.columns, ...t.rows]); setSent(`${t.title} added to the document.`); } catch (e: any) { setError(e?.message || String(e)); } finally { setBusy(''); } };

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); apply(n); };

  const download = (name: string, data: BlobPart, type: string) => { const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); };

  const send = async () => {
    if (!model || !onSendToTela || (!source && !edited)) return;
    setBusy('Adding to your document…');
    // An edited drawing (or a new one) is kept as DXF: that file is what reopens later.
    const src = edited || !source ? { name: model.name.replace(/\.[^.]+$/, '') + '.dxf', bytes: new TextEncoder().encode(writeDxf(model)) } : source;
    try { await onSendToTela(edited ? { ...model, format: 'dxf', name: src.name } : model, src); setSent('Added to the document.'); } catch (e: any) { setError(e?.message || String(e)); } finally { setBusy(''); }
  };

  // Portal to <body>: inside the app the workspace column is its own stacking context, so a
  // fixed room rendered in place would sit under the app's sidebar.
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: C.bg, color: C.text, fontFamily: 'Inter, system-ui, sans-serif' }}
      onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void onFile(f); }}>
      <input ref={fileRef} type="file" accept={CAD_ACCEPT} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} data-testid="cad-file-input"/>

      {/* Top bar */}
      <header className="flex items-center gap-2 px-3 h-12 shrink-0 overflow-x-auto cad-bar" style={{ borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div className="flex items-center gap-2 pr-3 mr-1" style={{ borderRight: `1px solid ${C.line}` }}>
          <div className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}><Ruler size={15} color="#fff"/></div>
          <div className="leading-tight cad-title"><div className="text-[13px] font-bold">CAD &amp; BIM</div><div className="text-[10px]" style={{ color: C.dim }}>{model ? model.name : 'Open a drawing or model'}</div></div>
        </div>
        <button className="cad-btn" onClick={() => fileRef.current?.click()}><FolderOpen size={14}/><span className="cad-label">Open</span></button>
        <button className="cad-btn" onClick={startNew} data-testid="cad-new"><FilePlus size={14}/><span className="cad-label">New drawing</span></button>
        {model && <>
          <div className={`${model.is2D && !in3d ? 'hidden' : 'flex'} items-center rounded-lg overflow-hidden ml-1 shrink-0`} style={{ border: `1px solid ${C.line}` }}>
            {(model.is2D && !in3d ? [] as ViewDir[] : ['iso', 'top', 'front', 'right'] as ViewDir[]).map(v => <button key={v} onClick={() => { setView(v); setViewNonce(n => n + 1); }} className="px-2.5 h-8 text-[11px] font-semibold capitalize" style={{ background: view === v ? 'rgba(125,211,252,.16)' : 'transparent', color: view === v ? C.accent : C.dim }}>{v === 'iso' ? '3D' : model.is2D ? 'Fit' : v}</button>)}
          </div>
          <button className="cad-btn" onClick={() => setImperial(x => !x)} title="Switch metric / imperial">{imperial ? 'Imperial' : 'Metric'}</button>
          {hasWalls && <button className={`cad-btn${view3d ? ' cad-on' : ''}`} onClick={() => { setView3d(x => !x); setSelected(null); setSection(null); setMeasuring(false); setView('iso'); setViewNonce(n => n + 1); }} title="See the walls, doors, windows and floors in 3D" data-testid="cad-3d"><Building2 size={14}/><span className="cad-label">{view3d ? 'Plan' : '3D'}</span></button>}
          {hasWalls && <button className="cad-btn" onClick={() => download(model.name.replace(/\.[^.]+$/, '') + '.ifc', writeIfc(model), 'application/x-step')} title="Export IFC4 for Revit, ArchiCAD, BIMcollab and other BIM tools" data-testid="cad-ifc"><Download size={14}/><span className="cad-label">IFC</span></button>}
          {(!model.is2D || in3d) && <button className={`cad-btn${measuring ? ' cad-on' : ''}`} onClick={() => setMeasuring(x => !x)} title="Click two points to measure" data-testid="cad-measure"><Crosshair size={14}/><span className="cad-label">Measure</span></button>}
          {(!model.is2D || in3d) && <button className={`cad-btn${section ? ' cad-on' : ''}`} onClick={() => setSection(s => s ? null : { axis: isBim || in3d ? 'y' : 'z', t: 0.5 })} title="Cut the model open" data-testid="cad-section"><Scissors size={14}/><span className="cad-label">Section</span></button>}
          {section && (!model.is2D || in3d) && <div className="flex items-center gap-1.5 h-8 px-2 rounded-lg shrink-0" style={{ border: `1px solid ${C.line}` }}>
            {(['x', 'y', 'z'] as const).map(a => <button key={a} onClick={() => setSection({ ...section, axis: a })} className="w-6 h-6 rounded text-[11px] font-bold uppercase" style={{ background: section.axis === a ? 'rgba(125,211,252,.16)' : 'transparent', color: section.axis === a ? C.accent : C.dim }} title={a === 'y' ? 'Plan cut (height)' : `Cut along ${a.toUpperCase()}`}>{a}</button>)}
            <input type="range" min={0} max={1} step={0.005} value={section.t} onChange={e => setSection({ ...section, t: +e.target.value })} className="w-28 accent-sky-400" aria-label="Section position" data-testid="cad-section-slider"/>
          </div>}
          <div className="flex-1"/>
          {model.is2D && <button className="cad-btn" onClick={() => download(model.name.replace(/\.[^.]+$/, '') + '.dxf', writeDxf(model), 'image/vnd.dxf')}><Download size={14}/><span className="cad-label">DXF</span></button>}
          {model.is2D && <button className="cad-btn" onClick={() => download(model.name.replace(/\.[^.]+$/, '') + '.svg', drawingToSvg(model, { hiddenLayers, background: '#ffffff', mono: '#111111' }), 'image/svg+xml')}><Download size={14}/><span className="cad-label">SVG</span></button>}
          {onSendToTela && <button className="cad-btn cad-primary" onClick={() => void send()} disabled={!!busy} data-testid="cad-send"><FilePlus2 size={14}/><span className="cad-label">Add to document</span></button>}
        </>}
        {!model && <div className="flex-1"/>}
        {model && narrow && <>
          <button className={`cad-btn${drawer === 'tree' ? ' cad-on' : ''}`} onClick={() => setDrawer(d => d === 'tree' ? null : 'tree')} aria-label="Model and layers"><ListTree size={14}/></button>
          <button className={`cad-btn${drawer === 'info' ? ' cad-on' : ''}`} onClick={() => setDrawer(d => d === 'info' ? null : 'info')} aria-label="File information"><Info size={14}/></button>
        </>}
        {onClose && <button className="cad-btn" onClick={onClose} aria-label="Close"><X size={15}/></button>}
      </header>

      <div className="flex-1 min-h-0 flex relative">
        {/* Left: layers / tree */}
        {model && (!narrow || drawer === 'tree') && <aside className={narrow ? 'absolute left-0 top-0 bottom-0 z-20 flex flex-col min-h-0 shadow-2xl' : `${tab === 'library' || tab === 'schedules' ? 'w-80' : 'w-64'} shrink-0 flex flex-col min-h-0`} style={{ width: narrow ? 'min(300px, 86vw)' : undefined, borderRight: `1px solid ${C.line}`, background: C.panel }}>
          <div className="flex" style={{ borderBottom: `1px solid ${C.line}` }}>
            {(model.is2D ? (in3d ? ['tree', 'layers', 'library', 'schedules'] as const : ['layers', 'library', 'schedules'] as const) : model.layers.length ? ['tree', 'layers'] as const : ['tree'] as const).map(t => <button key={t} onClick={() => setTab(t)} className="flex-1 h-9 text-[11px] font-bold flex items-center justify-center gap-1.5" style={{ color: tab === t ? C.accent : C.dim, borderBottom: tab === t ? `2px solid ${C.accent}` : '2px solid transparent' }}>{t === 'tree' ? <><ListTree size={13}/>Model</> : t === 'library' ? <><Armchair size={13}/>Library</> : t === 'schedules' ? <><ClipboardList size={13}/>Schedules{findings.some(f => f.status === 'fail') ? <span className="ml-0.5 px-1 rounded text-[9px]" style={{ background: '#f8717133', color: '#f87171' }}>{findings.filter(f => f.status === 'fail').length}</span> : null}</> : <><Layers size={13}/>{model.is2D ? 'Layers' : `Layers (${model.layers.length})`}</>}</button>)}
          </div>
          <div className="flex-1 overflow-auto p-1.5 text-[12px]">
            {tab === 'layers' && model.is2D && <form className="flex gap-1 px-1 pb-1.5" onSubmit={e => { e.preventDefault(); addLayer(); }}><input value={newLayer} onChange={e => setNewLayer(e.target.value)} placeholder="New layer name" aria-label="New layer name" className="flex-1 min-w-0 h-7 rounded-md bg-white/5 border border-white/10 px-2 text-[11px] text-white"/><button className="cad-btn" style={{ height: 28 }} type="submit" disabled={!newLayer.trim()}>Add</button></form>}
            {tab === 'layers' && (model.layers.length ? model.layers.map(l => {
              const hidden = hiddenLayers.has(l.name) || !l.visible;
              return <div key={l.name} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/5">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: l.color, border: '1px solid rgba(255,255,255,.25)' }}/>
                <button className="flex-1 truncate text-left" style={{ opacity: hidden ? 0.45 : 1, color: model.is2D && currentLayer === l.name ? '#7dd3fc' : undefined, fontWeight: model.is2D && currentLayer === l.name ? 700 : 400 }} onClick={() => model.is2D && setCurrentLayer(l.name)} title={model.is2D ? 'Make this the current layer' : undefined}>{l.name}{model.is2D && currentLayer === l.name ? '  ·  current' : ''}</button>
                <button onClick={() => toggle(hiddenLayers, l.name, setHiddenLayers)} style={{ color: C.dim }} aria-label={`Toggle ${l.name}`}>{hidden ? <EyeOff size={13}/> : <Eye size={13}/>}</button>
              </div>;
            }) : <div className="p-3" style={{ color: C.dim }}>No layers in this file.</div>)}
            {tab === 'schedules' && model.is2D && <SchedulesPanel tables={tables} findings={findings} drawingName={model.name} onSendTable={onSendTable ? t => void sendTable(t) : undefined} onPickFinding={f => { if (f.entityIndex !== undefined) setDraftSel([f.entityIndex]); }}/>}
            {tab === 'library' && model.is2D && <LibraryPanel model={model} currentLayer={currentLayer} onPlace={pl => setPlacing(pl)} onLoadBlocks={f => void loadBlocks(f)} placingLabel={placing?.label}/>}
            {tab === 'tree' && <ElementTree model={bim ?? model} hidden={hiddenEls} selected={selected} onSelect={setSelected} onToggle={id => toggle(hiddenEls, id, setHiddenEls)}/>}
          </div>
        </aside>}

        {/* Viewport */}
        <main className="flex-1 min-w-0 relative">
          {model ? (in3d && bim
            ? <ModelView model={bim} hiddenLayers={NO_LAYERS} hiddenEls={hiddenEls} selected={selected} onSelect={setSelected} view={view} nonce={viewNonce} measuring={measuring} section={section} fmt={d => fmtLen(d * MM_PER_UNIT[model.units], imperial, large)}/>
            : model.is2D
            ? <DraftView model={model} hiddenLayers={hiddenLayers} currentLayer={model.layers.some(l => l.name === currentLayer) ? currentLayer : '0'} fitNonce={viewNonce}
                fmt={d => fmtLen(d * MM_PER_UNIT[model.units], imperial, large)} fmtArea={a => fmtArea(a * u2, imperial, large)}
                onChange={next => commit(next)} onUndo={undo} onRedo={redo} selection={draftSel} setSelection={setDraftSel}
                layers={model.layers.map(l => l.name)} onSetLayer={layer => { if (draftSel.length) commit(setLayer(model, draftSel, layer)); else setCurrentLayer(layer); }}
                placing={placing} onStopPlacing={() => setPlacing(null)} findings={showChecks ? findings : []} showChecks={showChecks} onToggleChecks={() => setShowChecks(x => !x)} failCount={findings.filter(f => f.status === 'fail').length}/>
            : <ModelView model={model} hiddenLayers={hiddenLayers} hiddenEls={hiddenEls} selected={selected} onSelect={setSelected} view={view} nonce={viewNonce} measuring={measuring} section={section} fmt={d => fmtLen(d * MM_PER_UNIT[model.units], imperial, large)}/>)
            : <EmptyState onOpen={() => fileRef.current?.click()} onNew={startNew} dragging={dragging}/>}
          {busy && <div className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(13,12,18,.6)' }}><div className="px-4 py-2.5 rounded-xl text-[13px] font-semibold" style={{ background: C.panel, border: `1px solid ${C.line}` }} data-testid="cad-busy">{busy}</div></div>}
          {error && <div role="alert" className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[560px] px-4 py-2.5 rounded-xl text-[12px] flex gap-2 items-start" style={{ background: '#2a1416', border: '1px solid rgba(248,113,113,.4)', color: '#fecaca' }}><AlertTriangle size={14} className="shrink-0 mt-0.5"/><span className="flex-1">{error}</span><button onClick={() => setError('')}><X size={13}/></button></div>}
          {sent && <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-[12px] flex gap-2 items-center" style={{ background: '#0f2a1d', border: '1px solid rgba(52,211,153,.4)', color: '#a7f3d0' }}><CheckCircle2 size={14}/>{sent}</div>}
        </main>

        {/* Right: info + properties */}
        {model && (!narrow || drawer === 'info') && <aside className={narrow ? 'absolute right-0 top-0 bottom-0 z-20 overflow-auto p-3 text-[12px] space-y-4 shadow-2xl' : 'w-72 shrink-0 overflow-auto p-3 text-[12px] space-y-4'} style={{ width: narrow ? 'min(300px, 86vw)' : undefined, borderLeft: `1px solid ${C.line}`, background: C.panel }} data-testid="cad-info">
          <Section title="File">
            <Row k="Format" v={CAD_FORMATS[model.format].label}/>
            <Row k="Read by" v={engine ? `${engine.name} · ${engine.licence}` : model.engine}/>
            {model.meta.schema && <Row k="Schema" v={model.meta.schema}/>}
            {model.meta.version && <Row k="Version" v={model.meta.version}/>}
            <Row k="Units" v={model.units === 'unitless' ? 'Not set in file' : model.units}/>
            {model.meta.readMs && <Row k="Read in" v={`${model.meta.readMs} ms`}/>}
          </Section>
          <Section title="Size">
            <Row k="Width (X)" v={fmtLen(sizeMm[0], imperial, large)}/>
            <Row k={isZUp(model) || model.is2D ? 'Depth (Y)' : 'Height (Y)'} v={fmtLen(sizeMm[1], imperial, large)}/>
            {!model.is2D && <Row k={isZUp(model) ? 'Height (Z)' : 'Depth (Z)'} v={fmtLen(sizeMm[2], imperial, large)}/>}
          </Section>
          <Section title="Contents">
            {model.is2D ? <>
              <Row k="Entities" v={model.entities.length.toLocaleString()}/>
              <Row k="Blocks" v={model.blocks.length.toLocaleString()}/>
            </> : <>
              <Row k="Elements" v={model.elements.length.toLocaleString()}/>
              <Row k="Triangles" v={(stats?.triangles ?? 0).toLocaleString()}/>
            </>}
          </Section>
          {stats && !model.is2D && !isBim && <Section title="Print check">
            <Row k="Closed (watertight)" v={stats.watertight ? 'Yes' : `No · ${stats.openEdges.toLocaleString()} open edges`} good={stats.watertight}/>
            <Row k="Surface area" v={fmtArea(stats.area * u2, imperial, large)}/>
            <Row k="Volume" v={stats.watertight ? fmtVol(stats.volume * u3, imperial, large) : 'Needs a closed mesh'}/>
          </Section>}
          {selectedEl && <Section title="Selected">
            <Row k="Class" v={selectedEl.cls}/>
            <Row k="Name" v={selectedEl.name}/>
            {Object.entries(selectedEl.props).map(([set, props]) => <div key={set} className="mt-2">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: C.accent }}>{set}</div>
              {Object.entries(props).map(([k, v]) => <Row key={k} k={k} v={v === null ? '—' : String(v)}/>)}
            </div>)}
          </Section>}
          {model.warnings.length > 0 && <Section title="Notes">
            {model.warnings.map((w, i) => <div key={i} className="flex gap-1.5 py-0.5" style={{ color: '#fcd34d' }}><AlertTriangle size={12} className="shrink-0 mt-0.5"/>{w}</div>)}
          </Section>}
        </aside>}
      </div>
      <style>{`.cad-btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:8px;font-size:12px;font-weight:600;color:rgba(255,255,255,.8);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}.cad-btn:hover{background:rgba(255,255,255,.1);color:#fff}.cad-btn:disabled{opacity:.5}.cad-primary{background:linear-gradient(135deg,#0ea5e9,#6366f1);border-color:transparent;color:#fff}.cad-on{background:rgba(125,211,252,.16);border-color:rgba(125,211,252,.45);color:#7dd3fc}.cad-btn{flex-shrink:0}.cad-bar{scrollbar-width:none}.cad-bar::-webkit-scrollbar{display:none}@media (max-width:899px){.cad-label,.cad-title{display:none}}`}</style>
    </div>,
    document.body,
  );
}

function useNarrow(px: number) {
  const q = `(max-width: ${px - 1}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const on = () => setNarrow(mq.matches); on(); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, [q]);
  return narrow;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1.5" style={{ color: C.dim }}>{title}</div>{children}</section>;
}
function Row({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return <div className="flex justify-between gap-3 py-0.5"><span style={{ color: C.dim }} className="shrink-0">{k}</span><span className="text-right break-words min-w-0" style={{ color: good === undefined ? C.text : good ? '#6ee7b7' : '#fca5a5' }}>{v}</span></div>;
}

function EmptyState({ onOpen, onNew, dragging }: { onOpen: () => void; onNew: () => void; dragging: boolean }) {
  const groups = Object.values(CAD_FORMATS).reduce<Record<string, typeof CAD_FORMATS[keyof typeof CAD_FORMATS][]>>((a, f) => { (a[f.family] ??= []).push(f); return a; }, {});
  return <div className="absolute inset-0 grid place-items-center p-6">
    <div className="max-w-[640px] w-full rounded-2xl p-8 text-center" style={{ border: `2px dashed ${dragging ? C.accent : 'rgba(255,255,255,.14)'}`, background: dragging ? 'rgba(125,211,252,.06)' : 'transparent' }}>
      <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center mb-4" style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}><Box size={26} color="#fff"/></div>
      <div className="text-[18px] font-bold mb-1">Drop a drawing or model here</div>
      <div className="text-[13px] mb-5" style={{ color: C.dim }}>Everything is read on your device. The original file is kept with your document.</div>
      <div className="flex gap-2 justify-center"><button className="cad-btn cad-primary" onClick={onOpen}><FolderOpen size={14}/>Choose a file</button><button className="cad-btn" onClick={onNew} data-testid="cad-new-empty"><FilePlus size={14}/>Start a new drawing</button></div>
      <div className="grid grid-cols-2 gap-3 mt-7 text-left">
        {Object.entries(groups).map(([fam, list]) => <div key={fam} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${C.line}` }}>
          <div className="text-[10px] font-extrabold uppercase tracking-[.12em] mb-1.5" style={{ color: C.accent }}>{fam}</div>
          {list.map(f => <div key={f.format} className="text-[12px] flex items-center gap-1.5 py-0.5" style={{ color: f.ready ? C.text : C.dim }}>{f.ready ? <CheckCircle2 size={12} color="#6ee7b7"/> : <Square size={12}/>}{f.label}{!f.ready && <span className="text-[10px]">· next</span>}</div>)}
        </div>)}
      </div>
    </div>
  </div>;
}

function ElementTree({ model, hidden, selected, onSelect, onToggle }: { model: CadModel; hidden: Set<string>; selected: string | null; onSelect: (id: string | null) => void; onToggle: (id: string) => void }) {
  const [openCls, setOpenCls] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const g = new Map<string, CadElement[]>();
    for (const e of model.elements) if (e.meshIds.length) { const a = g.get(e.cls) ?? []; a.push(e); g.set(e.cls, a); }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [model]);
  if (!groups.length) return <div className="p-3" style={{ color: C.dim }}>{model.is2D ? 'Drawings are organised by layer.' : 'No named parts in this file.'}</div>;
  return <>{groups.map(([cls, els]) => {
    const isOpen = openCls.has(cls) || groups.length === 1; const allHidden = els.every(e => hidden.has(e.id));
    return <div key={cls}>
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/5 cursor-pointer" onClick={() => setOpenCls(s => { const n = new Set(s); n.has(cls) ? n.delete(cls) : n.add(cls); return n; })}>
        <span className="text-[10px] w-3" style={{ color: C.dim }}>{isOpen ? '▾' : '▸'}</span>
        <span className="flex-1 truncate font-semibold">{cls.replace(/^Ifc/, '')}</span>
        <span className="text-[10px]" style={{ color: C.dim }}>{els.length}</span>
        <button onClick={e => { e.stopPropagation(); els.forEach(x => { if (hidden.has(x.id) === allHidden) onToggle(x.id); }); }} style={{ color: C.dim }} aria-label={`Toggle all ${cls}`}>{allHidden ? <EyeOff size={13}/> : <Eye size={13}/>}</button>
      </div>
      {isOpen && els.map(e => <div key={e.id} className="flex items-center gap-1.5 pl-6 pr-2 py-0.5 rounded-md cursor-pointer" style={{ background: selected === e.id ? 'rgba(255,176,32,.14)' : undefined }} onClick={() => onSelect(selected === e.id ? null : e.id)}>
        <span className="flex-1 truncate" style={{ opacity: hidden.has(e.id) ? 0.45 : 0.85 }}>{e.name}</span>
        <button onClick={ev => { ev.stopPropagation(); onToggle(e.id); }} style={{ color: C.dim }} aria-label={`Toggle ${e.name}`}>{hidden.has(e.id) ? <EyeOff size={12}/> : <Eye size={12}/>}</button>
      </div>)}
    </div>;
  })}</>;
}

// ── 3D model view ───────────────────────────────────────────────────────────

function ModelView({ model, hiddenLayers, hiddenEls, selected, onSelect, view, nonce, measuring, section, fmt }: { model: CadModel; hiddenLayers: Set<string>; hiddenEls: Set<string>; selected: string | null; onSelect: (id: string | null) => void; view: ViewDir; nonce: number; measuring: boolean; section: Section | null; fmt: (d: number) => string }) {
  const group = useMemo(() => modelToGroup(model, { hiddenLayers, hiddenElements: hiddenEls, highlight: selected }), [model, hiddenLayers, hiddenEls, selected]);
  useEffect(() => () => { group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); }, [group]);
  const box = useMemo(() => { const g = modelToGroup(model); g.updateMatrixWorld(true); return new THREE.Box3().setFromObject(g); }, [model]);
  const size = box.getSize(new THREE.Vector3()); const radius = Math.max(size.length() / 2, 1e-3);
  const [pts, setPts] = useState<THREE.Vector3[]>([]);
  useEffect(() => { if (!measuring) setPts([]); }, [measuring]);
  useEffect(() => setPts([]), [model]);
  const dist = pts.length === 2 ? pts[0].distanceTo(pts[1]) : 0;
  return <Canvas data-testid="cad-canvas" camera={{ fov: 40, near: radius / 1000, far: radius * 200 }} gl={{ antialias: true, preserveDrawingBuffer: true }} dpr={[1, 1.75]} onPointerMissed={() => { if (!measuring) onSelect(null); }} style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 40%, #1d1b27, #0a0a0e 75%)', cursor: measuring ? 'crosshair' : undefined }}>
    <hemisphereLight args={['#ffffff', '#3a3550', 0.9]}/>
    <directionalLight position={[1, 2, 1.5]} intensity={1.6}/>
    <directionalLight position={[-1.5, 0.6, -1]} intensity={0.45}/>
    <primitive object={group} onClick={(e: any) => {
      e.stopPropagation();
      if (measuring) { const p = (e.point as THREE.Vector3).clone(); setPts(prev => prev.length >= 2 ? [p] : [...prev, p]); return; }
      const id = e.object?.userData?.elementId; if (id) onSelect(id === selected ? null : id);
    }}/>
    {pts.map((p, i) => <mesh key={i} position={p} renderOrder={10}><sphereGeometry args={[radius * 0.008, 16, 12]}/><meshBasicMaterial color={C.warm} depthTest={false}/></mesh>)}
    {pts.length === 2 && <>
      <Line points={[pts[0], pts[1]]} color={C.warm} lineWidth={2} depthTest={false} renderOrder={10}/>
      <Html position={pts[0].clone().add(pts[1]).multiplyScalar(0.5)} center zIndexRange={[20, 0]}>
        <div data-testid="cad-measure-label" className="px-2 py-1 rounded-md text-[12px] font-bold whitespace-nowrap pointer-events-none" style={{ background: 'rgba(20,16,8,.92)', color: C.warm, border: '1px solid rgba(255,176,32,.4)' }}>{fmt(dist)}</div>
      </Html>
    </>}
    <Grid position={[box.getCenter(new THREE.Vector3()).x, box.min.y - radius * 0.001, box.getCenter(new THREE.Vector3()).z]} args={[radius * 6, radius * 6]} cellSize={niceStep(radius / 10)} sectionSize={niceStep(radius / 10) * 10} cellColor="#2a2838" sectionColor="#3d3a52" fadeDistance={radius * 8} fadeStrength={1.5}/>
    <SectionPlane box={box} section={section}/>
    <CameraRig box={box} view={view} nonce={nonce}/>
  </Canvas>;
}

/** Global clip plane: keeps the part of the model below / before the cut. */
function SectionPlane({ box, section }: { box: THREE.Box3; section: Section | null }) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    if (!section) { gl.clippingPlanes = []; invalidate(); return; }
    const i = section.axis === 'x' ? 0 : section.axis === 'y' ? 1 : 2;
    const at = box.min.getComponent(i) + (box.max.getComponent(i) - box.min.getComponent(i)) * section.t;
    const n = new THREE.Vector3(); n.setComponent(i, -1);
    gl.clippingPlanes = [new THREE.Plane(n, at)];
    invalidate();
    return () => { gl.clippingPlanes = []; };
  }, [gl, box, section, invalidate]);
  return null;
}

const niceStep = (x: number) => { const p = 10 ** Math.floor(Math.log10(Math.max(x, 1e-9))); const n = x / p; return (n < 2 ? 1 : n < 5 ? 2 : 5) * p; };

function CameraRig({ box, view, nonce }: { box: THREE.Box3; view: ViewDir; nonce: number }) {
  const { camera, size } = useThree();
  const controls = useRef<any>(null);
  useEffect(() => {
    const c = box.getCenter(new THREE.Vector3()); const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-3);
    // Fit the bounding sphere in the narrower of the two fields of view (portrait phones).
    const cam = camera as THREE.PerspectiveCamera; const vfov = cam.fov * Math.PI / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const d = r / Math.sin(Math.min(vfov, hfov) / 2) * 1.05;
    const dir = view === 'top' ? new THREE.Vector3(0, 1, 0.0001) : view === 'front' ? new THREE.Vector3(0, 0, 1) : view === 'right' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(1, 0.8, 1.2).normalize();
    camera.position.copy(c.clone().add(dir.multiplyScalar(d))); camera.lookAt(c);
    (camera as THREE.PerspectiveCamera).near = r / 1000; (camera as THREE.PerspectiveCamera).far = r * 200; camera.updateProjectionMatrix();
    if (controls.current) { controls.current.target.copy(c); controls.current.update(); }
  }, [box, view, nonce, camera, size.width, size.height]);
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12}/>;
}
