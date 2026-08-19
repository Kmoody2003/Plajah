/**
 * TelaView — Plajah Tela, the unified document canvas (P0: the canvas & the page).
 *
 * One pannable/zoomable surface hosting frames (paper / screen / board), each
 * hosting devices (Writer, Grid). Default posture is Page: the view opens
 * focused on the first paper frame like a word processor; Board zooms out to
 * an overview of every frame; Studio is a P2 placeholder.
 *
 * All mutations are ops-shaped (applyTelaOp) over an id-based doc model, so
 * multiplayer later is an op-log change, not a rewrite. Content persists via
 * services/telaStore (OPFS-first, localStorage fallback, Firestore manifest
 * for listing/sync only).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown, ChevronLeft, FileDown, FilePlus2, FileUp, Folder, Grid3X3,
  LayoutPanelTop, Minus, Monitor, PenLine, Plus, Trash2, Type,
} from 'lucide-react';
import type {
  TelaBlock, TelaDevice, TelaDoc, TelaDocMeta, TelaFrame, TelaFramePreset,
  TelaGridDevice, TelaWriterDevice,
} from '../../types';
import {
  deleteTelaDoc, listTelaDocs, loadTelaDoc, newTelaId, saveTelaDoc, telaStorageMode,
} from '../../services/telaStore';
import { auth } from '../../services/backendService';
import { extractDocument, isSupportedImport, escapeHtml, SUPPORTED_IMPORT_ACCEPT } from '../../services/documentImport';
import TelaWriter, { makeBlock, newBlockId } from './TelaWriter';
import TelaGrid, { cellKey } from './TelaGrid';

// ── Presets ───────────────────────────────────────────────────────────────────
// CSS px at 96dpi, so 816px prints as exactly 8.5in via @page.

const PRESETS: Record<TelaFramePreset, { w: number; h: number; label: string; page?: string }> = {
  LETTER:            { w: 816,  h: 1056, label: 'Letter 8.5×11″', page: '8.5in 11in' },
  A4:                { w: 794,  h: 1123, label: 'A4 210×297mm',   page: '210mm 297mm' },
  BOOKLET:           { w: 528,  h: 816,  label: 'Booklet 5.5×8.5″', page: '5.5in 8.5in' },
  SIGNAGE_1080x1920: { w: 1080, h: 1920, label: 'Signage 1080×1920' },
  PHONE:             { w: 390,  h: 844,  label: 'Phone 390×844' },
  SQUARE:            { w: 1080, h: 1080, label: 'Square 1080' },
  FREE:              { w: 760,  h: 440,  label: 'Free' },
};

const PAPER_PRESETS: TelaFramePreset[] = ['LETTER', 'A4', 'BOOKLET'];
const SCREEN_PRESETS: TelaFramePreset[] = ['SIGNAGE_1080x1920', 'PHONE', 'SQUARE'];
const CHROME_H = 30;

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ── Ops — every mutation flows through here (CRDT-friendly shape) ─────────────

type TelaOp =
  | { type: 'SET_TITLE'; title: string }
  | { type: 'ADD_FRAME'; frame: TelaFrame; devices: TelaDevice[] }
  | { type: 'MOVE_FRAME'; frameId: string; x: number; y: number }
  | { type: 'SET_FRAME_PRESET'; frameId: string; preset: TelaFramePreset }
  | { type: 'DELETE_FRAME'; frameId: string }
  | { type: 'SET_WRITER_BLOCKS'; deviceId: string; blocks: TelaBlock[] }
  | { type: 'SET_GRID_CELL'; deviceId: string; key: string; value: string };

export function applyTelaOp(doc: TelaDoc, op: TelaOp): TelaDoc {
  const now = Date.now();
  switch (op.type) {
    case 'SET_TITLE':
      return { ...doc, title: op.title, updatedAt: now };
    case 'ADD_FRAME': {
      const devices = { ...doc.devices };
      for (const d of op.devices) devices[d.id] = d;
      return { ...doc, frames: [...doc.frames, op.frame], devices, updatedAt: now };
    }
    case 'MOVE_FRAME':
      return { ...doc, frames: doc.frames.map(f => f.id === op.frameId ? { ...f, x: op.x, y: op.y } : f), updatedAt: now };
    case 'SET_FRAME_PRESET': {
      const p = PRESETS[op.preset];
      return { ...doc, frames: doc.frames.map(f => f.id === op.frameId ? { ...f, preset: op.preset, w: p.w, h: p.h } : f), updatedAt: now };
    }
    case 'DELETE_FRAME': {
      const frame = doc.frames.find(f => f.id === op.frameId);
      const devices = { ...doc.devices };
      for (const id of frame?.deviceIds || []) delete devices[id];
      return { ...doc, frames: doc.frames.filter(f => f.id !== op.frameId), devices, updatedAt: now };
    }
    case 'SET_WRITER_BLOCKS': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'WRITER') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, blocks: op.blocks } }, updatedAt: now };
    }
    case 'SET_GRID_CELL': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'GRID') return doc;
      const cells = { ...d.cells };
      if (op.value === '') delete cells[op.key]; else cells[op.key] = op.value;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, cells } }, updatedAt: now };
    }
    default:
      return doc;
  }
}

// ── Doc factory ───────────────────────────────────────────────────────────────

function makeNewDoc(ownerId: string): TelaDoc {
  const writer: TelaWriterDevice = { id: uid('dev'), type: 'WRITER', blocks: [makeBlock('p', '')] };
  const p = PRESETS.LETTER;
  const frame: TelaFrame = {
    id: uid('frame'), kind: 'PAPER', preset: 'LETTER',
    x: 0, y: 0, w: p.w, h: p.h, deviceIds: [writer.id], label: 'Page 1',
  };
  const now = Date.now();
  return {
    id: newTelaId(), ownerId, title: 'Untitled canvas',
    frames: [frame], devices: { [writer.id]: writer },
    createdAt: now, updatedAt: now,
  };
}

// ── CSV (hand-rolled — no dependency) ─────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

// ── The view ──────────────────────────────────────────────────────────────────

type Posture = 'PAGE' | 'BOARD' | 'STUDIO';
type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'synced';

interface TelaViewProps {
  onBack?: () => void;
}

const TelaView: React.FC<TelaViewProps> = ({ onBack }) => {
  const [doc, setDoc] = useState<TelaDoc | null>(null);
  const [posture, setPosture] = useState<Posture>('PAGE');
  const [cam, setCam] = useState({ x: 0, y: 0, z: 1 });
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [storageMode, setStorageMode] = useState<'opfs' | 'local'>('opfs');
  const [canvasList, setCanvasList] = useState<TelaDocMeta[] | null>(null);
  const [canvasesOpen, setCanvasesOpen] = useState(false);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [printFrameId, setPrintFrameId] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<TelaDoc | null>(null);
  docRef.current = doc;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeFrame = doc?.frames.find(f => f.id === activeFrameId) || null;

  // ── Boot: open the most recent canvas, or start a fresh one ────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      setStorageMode(await telaStorageMode());
      const metas = await listTelaDocs();
      if (!alive) return;
      setCanvasList(metas);
      if (metas.length) {
        const d = await loadTelaDoc(metas[0].id);
        if (!alive) return;
        if (d) { openDoc(d); return; }
      }
      openDoc(makeNewDoc(auth.currentUser?.uid || 'local'));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDoc = (d: TelaDoc) => {
    setDoc(d);
    const first = d.frames.find(f => f.kind === 'PAPER') || d.frames[0] || null;
    setActiveFrameId(first?.id || null);
    setPosture('PAGE');
    setSaveState('clean');
    // Fit after layout settles.
    requestAnimationFrame(() => fitFrame(first, d));
  };

  // ── Camera / fitting ───────────────────────────────────────────────────────

  const viewSize = () => {
    const el = viewportRef.current;
    return el ? { vw: el.clientWidth, vh: el.clientHeight } : { vw: 1200, vh: 800 };
  };

  /** Page posture — fit the frame's width like a word processor, top-aligned. */
  const fitFrame = useCallback((frame: TelaFrame | null | undefined, d?: TelaDoc | null) => {
    if (!frame) { fitAll(d); return; }
    const { vw, vh } = viewSize();
    const pad = 56;
    const z = Math.min((vw - pad * 2) / frame.w, 1.35);
    const x = (vw - frame.w * z) / 2 - frame.x * z;
    // Top-align tall pages; centre short frames vertically.
    const totalH = (frame.h + CHROME_H) * z;
    const y = totalH < vh - pad * 2
      ? (vh - totalH) / 2 - frame.y * z
      : pad - (frame.y - CHROME_H) * z;
    setCam({ x, y, z });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Board posture — fitted overview of every frame. */
  const fitAll = useCallback((d?: TelaDoc | null) => {
    const frames = (d ?? docRef.current)?.frames || [];
    if (!frames.length) { setCam({ x: 0, y: 0, z: 1 }); return; }
    const minX = Math.min(...frames.map(f => f.x));
    const minY = Math.min(...frames.map(f => f.y - CHROME_H));
    const maxX = Math.max(...frames.map(f => f.x + f.w));
    const maxY = Math.max(...frames.map(f => f.y + f.h));
    const { vw, vh } = viewSize();
    const pad = 72;
    const z = Math.min((vw - pad * 2) / (maxX - minX), (vh - pad * 2) / (maxY - minY), 1);
    setCam({
      x: (vw - (maxX - minX) * z) / 2 - minX * z,
      y: (vh - (maxY - minY) * z) / 2 - minY * z,
      z,
    });
  }, []);

  const switchPosture = (p: Posture) => {
    setPosture(p);
    if (p === 'PAGE') fitFrame(docRef.current?.frames.find(f => f.id === activeFrameId) || docRef.current?.frames[0]);
    if (p === 'BOARD') fitAll();
  };

  // Wheel: ctrl/pinch = zoom around cursor, plain = pan. Non-passive so we can
  // keep the browser from zooming the whole app shell.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        setCam(c => {
          const nz = Math.min(4, Math.max(0.05, c.z * Math.exp(-e.deltaY * 0.0016)));
          const r = el.getBoundingClientRect();
          const px = e.clientX - r.left;
          const py = e.clientY - r.top;
          return { z: nz, x: px - ((px - c.x) / c.z) * nz, y: py - ((py - c.y) / c.z) * nz };
        });
      } else {
        setCam(c => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [posture]);

  const zoomBy = (f: number) => {
    const { vw, vh } = viewSize();
    setCam(c => {
      const nz = Math.min(4, Math.max(0.05, c.z * f));
      return { z: nz, x: vw / 2 - ((vw / 2 - c.x) / c.z) * nz, y: vh / 2 - ((vh / 2 - c.y) / c.z) * nz };
    });
  };

  // Pointer-drag pan on empty canvas.
  const panState = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.canvasBg !== '1') return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    panState.current = { px: e.clientX, py: e.clientY, cx: cam.x, cy: cam.y };
  };
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const p = panState.current;
    if (!p) return;
    setCam(c => ({ ...c, x: p.cx + e.clientX - p.px, y: p.cy + e.clientY - p.py }));
  };
  const onCanvasPointerUp = () => { panState.current = null; };

  // ── Ops + autosave ─────────────────────────────────────────────────────────

  const dispatchOp = useCallback((op: TelaOp) => {
    setDoc(d => (d ? applyTelaOp(d, op) : d));
    setSaveState('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const cur = docRef.current;
      if (!cur) return;
      setSaveState('saving');
      const { ok, synced } = await saveTelaDoc(cur);
      setSaveState(ok ? (synced ? 'synced' : 'saved') : 'dirty');
    }, 900);
  }, []);

  // Flush on unmount.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const cur = docRef.current;
    if (cur) void saveTelaDoc(cur);
  }, []);

  // ── Frame management ───────────────────────────────────────────────────────

  const nextFramePos = (): { x: number; y: number } => {
    const frames = docRef.current?.frames || [];
    if (!frames.length) return { x: 0, y: 0 };
    return { x: Math.max(...frames.map(f => f.x + f.w)) + 96, y: Math.min(...frames.map(f => f.y)) };
  };

  const addFrame = (kind: TelaFrame['kind'], preset: TelaFramePreset, device: TelaDevice, label: string) => {
    const p = PRESETS[preset];
    const pos = nextFramePos();
    const frame: TelaFrame = { id: uid('frame'), kind, preset, x: pos.x, y: pos.y, w: p.w, h: p.h, deviceIds: [device.id], label };
    dispatchOp({ type: 'ADD_FRAME', frame, devices: [device] });
    setActiveFrameId(frame.id);
    setDeviceMenuOpen(false);
    if (posture === 'PAGE') requestAnimationFrame(() => fitFrame(frame));
    else requestAnimationFrame(() => fitAll());
    return frame;
  };

  const addWriterPage = () => {
    const n = (docRef.current?.frames.filter(f => f.kind === 'PAPER').length || 0) + 1;
    addFrame('PAPER', 'LETTER', { id: uid('dev'), type: 'WRITER', blocks: [makeBlock('p', '')] }, `Page ${n}`);
  };
  const addGridSheet = () => {
    const n = (docRef.current?.frames.filter(f => f.deviceIds.some(id => docRef.current?.devices[id]?.type === 'GRID')).length || 0) + 1;
    addFrame('BOARD', 'FREE', { id: uid('dev'), type: 'GRID', rows: 14, cols: 8, cells: {} }, `Sheet ${n}`);
  };
  const addScreenFrame = () => {
    addFrame('SCREEN', 'SIGNAGE_1080x1920', { id: uid('dev'), type: 'WRITER', blocks: [makeBlock('h1', 'Signage')] }, 'Screen');
  };

  // Frame dragging by its chrome.
  const dragState = useRef<{ id: string; px: number; py: number; fx: number; fy: number } | null>(null);
  const onChromePointerDown = (e: React.PointerEvent, frame: TelaFrame) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { id: frame.id, px: e.clientX, py: e.clientY, fx: frame.x, fy: frame.y };
    setActiveFrameId(frame.id);
  };
  const onChromePointerMove = (e: React.PointerEvent) => {
    const s = dragState.current;
    if (!s) return;
    dispatchOp({
      type: 'MOVE_FRAME', frameId: s.id,
      x: Math.round(s.fx + (e.clientX - s.px) / cam.z),
      y: Math.round(s.fy + (e.clientY - s.py) / cam.z),
    });
  };
  const onChromePointerUp = () => { dragState.current = null; };

  // ── My Canvases ────────────────────────────────────────────────────────────

  const refreshList = async () => setCanvasList(await listTelaDocs());

  const createCanvas = async () => {
    const cur = docRef.current;
    if (cur) await saveTelaDoc(cur);
    openDoc(makeNewDoc(auth.currentUser?.uid || 'local'));
    setCanvasesOpen(false);
    void refreshList();
  };

  const openCanvas = async (id: string) => {
    const cur = docRef.current;
    if (cur && cur.id !== id) await saveTelaDoc(cur);
    const d = await loadTelaDoc(id);
    if (d) openDoc(d);
    setCanvasesOpen(false);
  };

  const removeCanvas = async (id: string) => {
    await deleteTelaDoc(id);
    setConfirmDeleteId(null);
    await refreshList();
    if (docRef.current?.id === id) {
      const metas = await listTelaDocs();
      if (metas.length) { const d = await loadTelaDoc(metas[0].id); if (d) { openDoc(d); return; } }
      openDoc(makeNewDoc(auth.currentUser?.uid || 'local'));
    }
  };

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleImportFile = async (file: File) => {
    setImportError(null);
    setImportBusy(true);
    try {
      const ext = (file.name.toLowerCase().split('.').pop() || '').trim();
      if (ext === 'csv') {
        const rows = parseCsv(await file.text());
        const cols = Math.max(4, ...rows.map(r => r.length));
        const cells: Record<string, string> = {};
        rows.forEach((r, ri) => r.forEach((v, ci) => { if (v !== '') cells[cellKey(ci, ri)] = v; }));
        const grid: TelaGridDevice = { id: uid('dev'), type: 'GRID', rows: Math.max(8, rows.length + 2), cols: cols + 1, cells };
        addFrame('BOARD', 'FREE', grid, file.name.replace(/\.[^.]+$/, ''));
      } else if (ext === 'xlsx' || ext === 'xls') {
        // Honest P0: no sheet parser shipped, and we don't add dependencies for it.
        throw new Error('.xlsx lands in P1 — for now export it as CSV and import that.');
      } else if (isSupportedImport(file.name)) {
        const extracted = await extractDocument(file);
        const blocks: TelaBlock[] = extracted.paragraphs.map(p => {
          const kind = p.heading === 1 ? 'h1' : p.heading >= 2 ? 'h2' : 'p';
          const m = p.html.match(/^<(h[1-3]|p)>([\s\S]*)<\/\1>$/);
          return { id: newBlockId(), kind, text: m ? m[2] : escapeHtml(p.text) } as TelaBlock;
        });
        const writer: TelaWriterDevice = { id: uid('dev'), type: 'WRITER', blocks: blocks.length ? blocks : [makeBlock('p', '')] };
        addFrame('PAPER', 'LETTER', writer, extracted.title || 'Imported');
      } else {
        throw new Error(`Unsupported file type ".${ext}". Supported: docx · pdf · md · txt · fountain · csv.`);
      }
    } catch (e: any) {
      setImportError(e?.message || 'Import failed.');
    } finally {
      setImportBusy(false);
    }
  };

  // ── Export PDF (print stylesheet path — browsers save to PDF) ─────────────

  const exportPdf = () => {
    const target = activeFrame && activeFrame.kind !== 'BOARD'
      ? activeFrame
      : doc?.frames.find(f => f.kind === 'PAPER') || doc?.frames[0];
    if (target) setPrintFrameId(target.id);
  };

  useEffect(() => {
    if (!printFrameId) return;
    const done = () => setPrintFrameId(null);
    window.addEventListener('afterprint', done);
    // Give the portal a frame to mount before opening the dialog.
    const t = setTimeout(() => window.print(), 120);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [printFrameId]);

  const printFrame = doc?.frames.find(f => f.id === printFrameId) || null;
  const printPageSize = printFrame
    ? (PRESETS[printFrame.preset].page || `${printFrame.w}px ${printFrame.h}px`)
    : '8.5in 11in';

  // ── Device rendering ───────────────────────────────────────────────────────

  const renderDevice = (device: TelaDevice, readOnly = false) => {
    if (device.type === 'WRITER') {
      return (
        <TelaWriter
          key={device.id}
          device={device}
          readOnly={readOnly}
          onChangeBlocks={blocks => dispatchOp({ type: 'SET_WRITER_BLOCKS', deviceId: device.id, blocks })}
        />
      );
    }
    return (
      <TelaGrid
        key={device.id}
        device={device}
        readOnly={readOnly}
        onSetCell={(key, value) => dispatchOp({ type: 'SET_GRID_CELL', deviceId: device.id, key, value })}
      />
    );
  };

  // ── Chrome bits ────────────────────────────────────────────────────────────

  const saveLabel =
    saveState === 'saving' ? 'Saving…'
    : saveState === 'dirty' ? 'Unsaved'
    : saveState === 'synced' ? 'Saved · synced'
    : saveState === 'saved' ? (storageMode === 'opfs' ? 'Saved on this device' : 'Saved (browser storage)')
    : 'Saved';

  const topBtn = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[.78rem] font-semibold text-white/80 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] transition-colors';

  const menuStyle: React.CSSProperties = {
    position: 'absolute', top: '110%', left: 0, zIndex: 60, minWidth: 230,
    background: 'linear-gradient(160deg,#1A1424,#120D1C)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 'var(--pj-radius-md, 16px)',
    boxShadow: 'var(--pj-elev-4, 0 20px 48px rgba(0,0,0,0.55))',
    padding: 6, overflow: 'hidden',
  };
  const menuItem = 'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-left text-[.8rem] font-semibold text-white/85 hover:bg-white/[0.08] transition-colors';

  if (!doc) {
    return (
      <div className="flex-1 h-screen grid place-items-center text-white/30 text-sm" style={{ background: 'var(--bg-color, #070609)' }}>
        Opening Tela…
      </div>
    );
  }

  return (
    <div className="flex-1 h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-color, #070609)' }}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center gap-2 px-3 h-14 border-b"
        style={{ borderColor: 'var(--border-color, rgba(255,255,255,0.08))', background: 'linear-gradient(180deg,#140D20,#0E0A16)' }}
      >
        {onBack && (
          <button className={topBtn} onClick={onBack} title="Back"><ChevronLeft size={15} /></button>
        )}
        <div className="flex items-center gap-2 pr-1">
          <span className="w-8 h-8 rounded-[10px] grid place-items-center text-white" style={{ background: 'var(--pj-grad-warm, linear-gradient(135deg,#6B0099,#D40055,#FF8C00))' }}>
            <LayoutPanelTop size={16} />
          </span>
          <span className="font-display italic text-white text-[1.05rem] leading-none select-none">Tela</span>
        </div>

        <input
          value={doc.title}
          onChange={e => dispatchOp({ type: 'SET_TITLE', title: e.target.value })}
          placeholder="Untitled canvas"
          className="bg-transparent border border-transparent hover:border-white/[0.12] focus:border-white/[0.25] rounded-[9px] outline-none text-white text-[.9rem] font-semibold px-2.5 h-9 w-[200px] transition-colors"
        />

        {/* Posture switch */}
        <div className="flex items-center rounded-[11px] border border-white/[0.12] bg-white/[0.04] p-0.5 ml-1">
          {(['PAGE', 'BOARD', 'STUDIO'] as Posture[]).map(p => (
            <button
              key={p}
              onClick={() => switchPosture(p)}
              className="h-8 px-3.5 rounded-[9px] text-[.72rem] font-bold tracking-wide transition-colors"
              style={posture === p
                ? { background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))', color: '#fff', boxShadow: 'var(--pj-glow-brand, 0 6px 22px rgba(212,0,85,.34))' }
                : { color: 'rgba(255,255,255,0.55)' }}
            >
              {p === 'PAGE' ? 'Page' : p === 'BOARD' ? 'Board' : 'Studio'}
            </button>
          ))}
        </div>

        {/* ＋ Device */}
        <div className="relative">
          <button className={topBtn} onClick={() => { setDeviceMenuOpen(o => !o); setPresetMenuOpen(false); setCanvasesOpen(false); }}>
            <Plus size={15} /> Device <ChevronDown size={13} className="opacity-60" />
          </button>
          {deviceMenuOpen && (
            <div style={menuStyle} onMouseLeave={() => setDeviceMenuOpen(false)}>
              <button className={menuItem} onClick={addWriterPage}><Type size={15} className="text-[var(--pj-lilac,#D0BCFF)]" /> Writer page<span className="ml-auto text-[.62rem] text-white/40">Letter</span></button>
              <button className={menuItem} onClick={addGridSheet}><Grid3X3 size={15} className="text-[var(--pj-cyan,#00DAF3)]" /> Grid sheet</button>
              <button className={menuItem} onClick={addScreenFrame}><Monitor size={15} className="text-[var(--pj-orange,#FF8C00)]" /> Screen frame<span className="ml-auto text-[.62rem] text-white/40">1080×1920</span></button>
            </div>
          )}
        </div>

        {/* Frame preset picker (for the active frame) */}
        <div className="relative">
          <button
            className={topBtn}
            disabled={!activeFrame}
            style={!activeFrame ? { opacity: 0.4, cursor: 'default' } : undefined}
            onClick={() => { setPresetMenuOpen(o => !o); setDeviceMenuOpen(false); setCanvasesOpen(false); }}
          >
            {activeFrame ? PRESETS[activeFrame.preset].label : 'Preset'} <ChevronDown size={13} className="opacity-60" />
          </button>
          {presetMenuOpen && activeFrame && (
            <div style={menuStyle} onMouseLeave={() => setPresetMenuOpen(false)}>
              {(activeFrame.kind === 'PAPER' ? PAPER_PRESETS : activeFrame.kind === 'SCREEN' ? SCREEN_PRESETS : (['FREE', ...PAPER_PRESETS, ...SCREEN_PRESETS] as TelaFramePreset[])).map(p => (
                <button
                  key={p}
                  className={menuItem}
                  onClick={() => { dispatchOp({ type: 'SET_FRAME_PRESET', frameId: activeFrame.id, preset: p }); setPresetMenuOpen(false); }}
                  style={activeFrame.preset === p ? { color: 'var(--pj-cyan, #00DAF3)' } : undefined}
                >
                  {PRESETS[p].label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Import — honest about coverage */}
        <button className={topBtn} onClick={() => fileRef.current?.click()} disabled={importBusy} title="Import docx · pdf · md · txt · fountain · csv (xlsx in P1)">
          <FileUp size={15} /> {importBusy ? 'Importing…' : 'Import'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={`${SUPPORTED_IMPORT_ACCEPT},.csv`}
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleImportFile(f); e.target.value = ''; }}
        />

        <button className={topBtn} onClick={exportPdf} title="Print the active frame at exact page size — save as PDF in the print dialog">
          <FileDown size={15} /> Export PDF
        </button>

        {/* Save state */}
        <span
          className="text-[.68rem] font-semibold px-2.5 h-9 inline-flex items-center rounded-[10px] border"
          style={{
            color: saveState === 'dirty' ? 'var(--pj-warning, #F59E0B)' : saveState === 'synced' ? 'var(--pj-success, #06D6A0)' : 'rgba(255,255,255,0.55)',
            borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
          }}
        >
          {saveLabel}
        </span>

        {/* My Canvases */}
        <div className="relative">
          <button className={topBtn} onClick={() => { setCanvasesOpen(o => !o); if (!canvasesOpen) void refreshList(); setDeviceMenuOpen(false); setPresetMenuOpen(false); }}>
            <Folder size={15} /> My Canvases <ChevronDown size={13} className="opacity-60" />
          </button>
          {canvasesOpen && (
            <div style={{ ...menuStyle, left: 'auto', right: 0, minWidth: 290 }}>
              <button className={menuItem} onClick={createCanvas}>
                <FilePlus2 size={15} className="text-[var(--pj-orange,#FF8C00)]" /> New canvas
              </button>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '5px 4px' }} />
              <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                {(canvasList || []).map(m => (
                  <div key={m.id} className="flex items-center gap-1">
                    <button
                      className={`${menuItem} flex-1 min-w-0`}
                      onClick={() => void openCanvas(m.id)}
                      style={m.id === doc.id ? { color: 'var(--pj-cyan, #00DAF3)' } : undefined}
                    >
                      <span className="truncate">{m.title || 'Untitled canvas'}</span>
                      <span className="ml-auto shrink-0 text-[.6rem] text-white/35">{new Date(m.updatedAt).toLocaleDateString()}</span>
                    </button>
                    {confirmDeleteId === m.id ? (
                      <button
                        className="shrink-0 h-8 px-2 rounded-[9px] text-[.62rem] font-bold text-white"
                        style={{ background: 'var(--pj-danger, #EF4444)' }}
                        onClick={() => void removeCanvas(m.id)}
                      >
                        Delete?
                      </button>
                    ) : (
                      <button
                        className="shrink-0 grid place-items-center w-8 h-8 rounded-[9px] text-white/40 hover:text-[var(--pj-danger,#EF4444)] hover:bg-white/[0.06]"
                        onClick={() => setConfirmDeleteId(m.id)}
                        title="Delete canvas"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {canvasList && !canvasList.length && (
                  <div className="px-3 py-3 text-[.72rem] text-white/40">No canvases yet.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {importError && (
        <div
          className="shrink-0 px-4 py-2 text-[.75rem] font-semibold flex items-center gap-3"
          style={{ background: 'var(--pj-danger-soft, rgba(239,68,68,0.14))', color: 'var(--pj-danger, #EF4444)' }}
        >
          {importError}
          <button className="ml-auto underline opacity-80 hover:opacity-100" onClick={() => setImportError(null)}>Dismiss</button>
        </div>
      )}

      {/* ── Surface ─────────────────────────────────────────────────────────── */}
      {posture === 'STUDIO' ? (
        <div className="flex-1 grid place-items-center">
          <div
            className="text-center px-10 py-12 rounded-[var(--pj-radius-xl,28px)] border"
            style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.035)', maxWidth: 420 }}
          >
            <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] mb-4 text-white" style={{ background: 'var(--pj-grad-spatial, linear-gradient(135deg,#6B0099,#00DAF3))' }}>
              <PenLine size={20} />
            </span>
            <h2 className="font-display italic text-white text-[1.3rem] mb-2">Studio — coming in P2</h2>
            <p className="text-[.82rem] text-white/50 leading-relaxed">
              Vector, Image, and Layout devices — layers, masks, adjustments, and
              text flow — arrive with the Studio posture. Page and Board are live now.
            </p>
          </div>
        </div>
      ) : (
        <div
          ref={viewportRef}
          className="flex-1 relative overflow-hidden"
          style={{
            touchAction: 'none',
            background:
              'radial-gradient(1000px 500px at 75% -10%, rgba(107,0,153,0.14), transparent 60%), radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0) 0 0 / 26px 26px, var(--bg-color, #070609)',
          }}
          data-canvas-bg="1"
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
        >
          {/* World layer — zoom lives here, on the frame wrappers, never on resting text */}
          <div
            style={{
              position: 'absolute', left: 0, top: 0,
              transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`,
              transformOrigin: '0 0',
            }}
          >
            {doc.frames.map(frame => {
              const active = frame.id === activeFrameId;
              const isPaper = frame.kind === 'PAPER';
              return (
                <div
                  key={frame.id}
                  onPointerDown={e => { e.stopPropagation(); setActiveFrameId(frame.id); }}
                  onDoubleClick={() => { if (posture === 'BOARD') { setActiveFrameId(frame.id); setPosture('PAGE'); fitFrame(frame); } }}
                  style={{ position: 'absolute', left: frame.x, top: frame.y - CHROME_H, width: frame.w }}
                >
                  {/* Frame chrome — the drag handle */}
                  <div
                    onPointerDown={e => onChromePointerDown(e, frame)}
                    onPointerMove={onChromePointerMove}
                    onPointerUp={onChromePointerUp}
                    className="flex items-center gap-2 px-2.5 select-none"
                    style={{
                      height: CHROME_H, cursor: 'grab',
                      color: active ? '#fff' : 'rgba(255,255,255,0.45)',
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                    }}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: active ? 'var(--pj-magenta, #D40055)' : 'rgba(255,255,255,0.25)' }}
                    />
                    <span className="truncate">{frame.label || frame.kind}</span>
                    <span className="opacity-50 font-normal">{PRESETS[frame.preset].label}</span>
                    <button
                      title="Delete frame"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => {
                        dispatchOp({ type: 'DELETE_FRAME', frameId: frame.id });
                        if (activeFrameId === frame.id) setActiveFrameId(null);
                      }}
                      className="ml-auto grid place-items-center w-5 h-5 rounded text-white/35 hover:text-[var(--pj-danger,#EF4444)]"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {/* Frame body — light paper on the dark shell */}
                  <div
                    style={{
                      width: frame.w,
                      height: isPaper ? undefined : frame.h,
                      minHeight: isPaper ? frame.h : undefined,
                      background: '#FFFFFF',
                      borderRadius: 3,
                      overflow: isPaper ? 'visible' : 'hidden',
                      boxShadow: active
                        ? '0 0 0 2px var(--pj-magenta, #D40055), var(--pj-elev-4, 0 20px 48px rgba(0,0,0,0.55))'
                        : 'var(--pj-elev-3, 0 10px 28px rgba(0,0,0,0.45))',
                      display: 'flex', flexDirection: 'column',
                    }}
                  >
                    {frame.deviceIds.map(id => {
                      const dev = doc.devices[id];
                      if (!dev) return null;
                      return (
                        <div key={id} style={{ flex: 1, minHeight: 0 }}>
                          {renderDevice(dev)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Zoom control */}
          <div
            className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-[12px] border p-1"
            style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(14,10,22,0.9)', backdropFilter: 'blur(8px)' }}
          >
            <button className="grid place-items-center w-8 h-8 rounded-[9px] text-white/70 hover:text-white hover:bg-white/[0.08]" onClick={() => zoomBy(1 / 1.2)} title="Zoom out"><Minus size={14} /></button>
            <button
              className="h-8 px-2 rounded-[9px] text-[.7rem] font-bold text-white/80 hover:text-white hover:bg-white/[0.08] tabular-nums"
              onClick={() => (posture === 'BOARD' ? fitAll() : fitFrame(activeFrame || doc.frames[0]))}
              title={posture === 'BOARD' ? 'Fit all frames' : 'Fit page'}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {Math.round(cam.z * 100)}%
            </button>
            <button className="grid place-items-center w-8 h-8 rounded-[9px] text-white/70 hover:text-white hover:bg-white/[0.08]" onClick={() => zoomBy(1.2)} title="Zoom in"><Plus size={14} /></button>
          </div>
        </div>
      )}

      {/* ── Print portal — the active frame at exact page size ─────────────── */}
      {printFrame && createPortal(
        <div className="tela-print-root">
          <style>{`
            @media screen { .tela-print-root { display: none; } }
            @media print {
              body > *:not(.tela-print-root) { display: none !important; }
              .tela-print-root { display: block !important; }
              html, body { background: #fff !important; margin: 0 !important; }
            }
            @page { size: ${printPageSize}; margin: 0; }
          `}</style>
          <div style={{ width: printFrame.w, background: '#fff' }}>
            {printFrame.deviceIds.map(id => {
              const dev = doc.devices[id];
              return dev ? <div key={id}>{renderDevice(dev, true)}</div> : null;
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default TelaView;
