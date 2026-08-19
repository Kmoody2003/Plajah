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
  ChevronDown, ChevronLeft, Circle, Database, FileDown, FilePlus2, FileUp, Folder, FormInput,
  Grid3X3, Image as ImageIcon, ImagePlus, LayoutPanelTop, Link as LinkIcon, Link2, Loader2,
  Minus, Monitor, MousePointer2, PenLine, PenTool, Plus, Shapes, Square, Trash2, Type, X,
} from 'lucide-react';
import type {
  TelaBaseDevice, TelaBinding, TelaBlock, TelaDevice, TelaDoc, TelaDocMeta, TelaField,
  TelaFormDevice, TelaFrame, TelaFramePreset, TelaGridDevice, TelaImageDevice, TelaImageLayer,
  TelaRow, TelaVectorDevice, TelaVectorObject, TelaWriterDevice,
} from '../../types';
import {
  deleteTelaDoc, listTelaDocs, loadTelaDoc, newTelaId, saveTelaDoc, telaStorageMode,
} from '../../services/telaStore';
import { auth } from '../../services/backendService';
import { extractDocument, isSupportedImport, escapeHtml, SUPPORTED_IMPORT_ACCEPT } from '../../services/documentImport';
import { uploadTelaImage } from '../../services/telaAssets';
import TelaWriter, { makeBlock, newBlockId } from './TelaWriter';
import TelaGrid, { cellKey, type TelaBaseLite, type TelaFormulaContext } from './TelaGrid';
import TelaBase from './TelaBase';
import TelaForm from './TelaForm';
import TelaVector, { TelaVectorObjectProps, type VectorTool } from './TelaVector';
import TelaImage, { TelaImageLayerControls, ImageLayerRow, makeImageLayer } from './TelaImage';

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

// Studio left-rail vector tools (mirrors TelaVector's own palette).
const STUDIO_VEC_TOOLS: { id: VectorTool; icon: React.ReactNode; label: string }[] = [
  { id: 'select', icon: <MousePointer2 size={17} />, label: 'Select' },
  { id: 'rect', icon: <Square size={17} />, label: 'Rectangle' },
  { id: 'ellipse', icon: <Circle size={17} />, label: 'Ellipse' },
  { id: 'line', icon: <Minus size={17} />, label: 'Line' },
  { id: 'pen', icon: <PenTool size={17} />, label: 'Pen / polyline' },
  { id: 'text', icon: <Type size={17} />, label: 'Text' },
];

// ── Ops — every mutation flows through here (CRDT-friendly shape) ─────────────

type TelaOp =
  | { type: 'SET_TITLE'; title: string }
  | { type: 'ADD_FRAME'; frame: TelaFrame; devices: TelaDevice[] }
  | { type: 'MOVE_FRAME'; frameId: string; x: number; y: number }
  | { type: 'SET_FRAME_PRESET'; frameId: string; preset: TelaFramePreset }
  | { type: 'DELETE_FRAME'; frameId: string }
  | { type: 'SET_WRITER_BLOCKS'; deviceId: string; blocks: TelaBlock[] }
  | { type: 'SET_GRID_CELL'; deviceId: string; key: string; value: string }
  // ── Base (database) ops ────────────────────────────────────────────────────
  | { type: 'ADD_BASE_FIELD'; deviceId: string; field: TelaField }
  | { type: 'UPDATE_BASE_FIELD'; deviceId: string; fieldId: string; patch: Partial<TelaField> }
  | { type: 'DELETE_BASE_FIELD'; deviceId: string; fieldId: string }
  | { type: 'ADD_BASE_ROW'; deviceId: string; row: TelaRow }
  | { type: 'SET_BASE_CELL'; deviceId: string; rowId: string; fieldId: string; value: string }
  | { type: 'DELETE_BASE_ROW'; deviceId: string; rowId: string }
  /** Re-sync a binding's derived rows — replaces only rows tagged with it,
   *  leaving every manual (user-entered) row untouched. */
  | { type: 'REPLACE_DERIVED_ROWS'; deviceId: string; bindingId: string; rows: TelaRow[] }
  // ── Form ops ────────────────────────────────────────────────────────────────
  | { type: 'SET_FORM_BASE'; deviceId: string; baseDeviceId: string }
  // ── Vector (SVG design) ops ─────────────────────────────────────────────────
  | { type: 'ADD_VECTOR_OBJECT'; deviceId: string; object: TelaVectorObject }
  | { type: 'UPDATE_VECTOR_OBJECT'; deviceId: string; objectId: string; patch: Partial<TelaVectorObject> }
  | { type: 'DELETE_VECTOR_OBJECT'; deviceId: string; objectId: string }
  | { type: 'REORDER_VECTOR_OBJECT'; deviceId: string; objectId: string; toIndex: number }
  // ── Image (raster) ops ──────────────────────────────────────────────────────
  | { type: 'ADD_IMAGE_LAYER'; deviceId: string; layer: TelaImageLayer }
  | { type: 'UPDATE_IMAGE_LAYER'; deviceId: string; layerId: string; patch: Partial<TelaImageLayer> }
  | { type: 'DELETE_IMAGE_LAYER'; deviceId: string; layerId: string }
  | { type: 'REORDER_IMAGE_LAYER'; deviceId: string; layerId: string; toIndex: number }
  // ── Binding graph ops ───────────────────────────────────────────────────────
  | { type: 'ADD_BINDING'; binding: TelaBinding }
  | { type: 'REMOVE_BINDING'; bindingId: string };

/** Move the id-matched item to `toIndex` (id-stable reorder for arrays). */
function reorderById<T extends { id: string }>(list: T[], id: string, toIndex: number): T[] {
  const from = list.findIndex(x => x.id === id);
  if (from < 0) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(list.length - 1, toIndex)), 0, item);
  return next;
}

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

    // ── Base ────────────────────────────────────────────────────────────────
    case 'ADD_BASE_FIELD': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, fields: [...d.fields, op.field] } }, updatedAt: now };
    }
    case 'UPDATE_BASE_FIELD': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, fields: d.fields.map(f => f.id === op.fieldId ? { ...f, ...op.patch } : f) } }, updatedAt: now };
    }
    case 'DELETE_BASE_FIELD': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      const rows = d.rows.map(r => {
        if (!(op.fieldId in r.values)) return r;
        const values = { ...r.values }; delete values[op.fieldId];
        return { ...r, values };
      });
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, fields: d.fields.filter(f => f.id !== op.fieldId), rows } }, updatedAt: now };
    }
    case 'ADD_BASE_ROW': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, rows: [...d.rows, op.row] } }, updatedAt: now };
    }
    case 'SET_BASE_CELL': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      const rows = d.rows.map(r => {
        if (r.id !== op.rowId) return r;
        const values = { ...r.values };
        if (op.value === '') delete values[op.fieldId]; else values[op.fieldId] = op.value;
        return { ...r, values };
      });
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, rows } }, updatedAt: now };
    }
    case 'DELETE_BASE_ROW': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, rows: d.rows.filter(r => r.id !== op.rowId) } }, updatedAt: now };
    }
    case 'REPLACE_DERIVED_ROWS': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'BASE') return doc;
      // Manual rows (and rows from OTHER bindings) stay exactly as they are.
      const kept = d.rows.filter(r => r.derivedFromBindingId !== op.bindingId);
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, rows: [...kept, ...op.rows] } }, updatedAt: now };
    }

    // ── Form ────────────────────────────────────────────────────────────────
    case 'SET_FORM_BASE': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'FORM') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, baseDeviceId: op.baseDeviceId } }, updatedAt: now };
    }

    // ── Vector ────────────────────────────────────────────────────────────────
    case 'ADD_VECTOR_OBJECT': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'VECTOR') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, objects: [...d.objects, op.object] } }, updatedAt: now };
    }
    case 'UPDATE_VECTOR_OBJECT': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'VECTOR') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, objects: d.objects.map(o => o.id === op.objectId ? { ...o, ...op.patch } : o) } }, updatedAt: now };
    }
    case 'DELETE_VECTOR_OBJECT': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'VECTOR') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, objects: d.objects.filter(o => o.id !== op.objectId) } }, updatedAt: now };
    }
    case 'REORDER_VECTOR_OBJECT': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'VECTOR') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, objects: reorderById(d.objects, op.objectId, op.toIndex) } }, updatedAt: now };
    }

    // ── Image ─────────────────────────────────────────────────────────────────
    case 'ADD_IMAGE_LAYER': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, layers: [...d.layers, op.layer] } }, updatedAt: now };
    }
    case 'UPDATE_IMAGE_LAYER': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, layers: d.layers.map(l => l.id === op.layerId ? { ...l, ...op.patch } : l) } }, updatedAt: now };
    }
    case 'DELETE_IMAGE_LAYER': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, layers: d.layers.filter(l => l.id !== op.layerId) } }, updatedAt: now };
    }
    case 'REORDER_IMAGE_LAYER': {
      const d = doc.devices[op.deviceId];
      if (!d || d.type !== 'IMAGE') return doc;
      return { ...doc, devices: { ...doc.devices, [op.deviceId]: { ...d, layers: reorderById(d.layers, op.layerId, op.toIndex) } }, updatedAt: now };
    }

    // ── Binding graph ─────────────────────────────────────────────────────────
    case 'ADD_BINDING':
      return { ...doc, bindings: [...(doc.bindings ?? []), op.binding], updatedAt: now };
    case 'REMOVE_BINDING': {
      const bindings = (doc.bindings ?? []).filter(b => b.id !== op.bindingId);
      // Drop any rows this binding derived, so removing a link cleans up after itself.
      const devices = { ...doc.devices };
      for (const id in devices) {
        const dv = devices[id];
        if (dv.type === 'BASE' && dv.rows.some(r => r.derivedFromBindingId === op.bindingId)) {
          devices[id] = { ...dv, rows: dv.rows.filter(r => r.derivedFromBindingId !== op.bindingId) };
        }
      }
      return { ...doc, bindings, devices, updatedAt: now };
    }

    default:
      return doc;
  }
}

// ── Derivation — Writer items → Base rows (the 'items' binding) ───────────────

function blockPlainText(b: TelaBlock): string {
  return b.text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim();
}

// "Name — $12" / "Name - 12" / "Name – 1,250.00" → [ , name, number ]
const ITEM_LINE_RE = /^(.*?)\s*[—–-]\s*\$?\s*([\d,]+(?:\.\d+)?)\s*$/;

/**
 * Re-derive the rows an 'items' binding produces from its source Writer.
 * Ids are DETERMINISTIC (`${bindingId}__r${i}`) so an unchanged source yields
 * byte-identical rows — the resync guard then short-circuits, no churn/loop.
 */
function deriveItemsRows(binding: TelaBinding, writer: TelaWriterDevice, base: TelaBaseDevice): TelaRow[] {
  const textFid = binding.mapping?.text || base.fields.find(f => f.type === 'TEXT')?.id;
  const numFid = binding.mapping?.number || base.fields.find(f => f.type === 'NUMBER')?.id;
  const rows: TelaRow[] = [];
  let idx = 0;
  for (const b of writer.blocks) {
    if (b.kind === 'h1' || b.kind === 'h2') continue; // headings aren't items
    const t = blockPlainText(b);
    if (!t) continue;
    const values: Record<string, string> = {};
    const m = numFid ? t.match(ITEM_LINE_RE) : null;
    if (m) {
      if (textFid) values[textFid] = m[1].trim();
      values[numFid!] = m[2].replace(/,/g, '');
    } else if (textFid) {
      values[textFid] = t;
    }
    rows.push({ id: `${binding.id}__r${idx}`, values, derivedFromBindingId: binding.id });
    idx++;
  }
  return rows;
}

// ── xlsx import — minimal OOXML reader via fflate (already a dependency) ───────

function xlsxColIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Parse sheet1 + sharedStrings of an .xlsx into a Grid cell map (values only). */
async function parseXlsx(buf: ArrayBuffer): Promise<{ cells: Record<string, string>; rows: number; cols: number }> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(buf));
  const dec = (p: string): string => (files[p] ? strFromU8(files[p]) : '');

  // Shared strings — concatenate every <t> inside each <si> (handles rich runs).
  const shared: string[] = [];
  const ss = dec('xl/sharedStrings.xml');
  if (ss) {
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(ss))) {
      let txt = '';
      const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      let tm: RegExpExecArray | null;
      while ((tm = tRe.exec(m[1]))) txt += tm[1];
      shared.push(unescapeXml(txt));
    }
  }

  // First worksheet.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (!files[sheetPath]) {
    const k = Object.keys(files).find(p => /^xl\/worksheets\/sheet\d+\.xml$/i.test(p));
    if (k) sheetPath = k;
  }
  const sheet = dec(sheetPath);
  const cells: Record<string, string> = {};
  let maxCol = 0, maxRow = 0;
  const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let cm: RegExpExecArray | null;
  while ((cm = cRe.exec(sheet))) {
    const attrs = cm[1] || '';
    const inner = cm[2] || '';
    const ref = (attrs.match(/r="([A-Z]+[0-9]+)"/) || [])[1];
    if (!ref) continue;
    const t = (attrs.match(/t="([^"]+)"/) || [])[1];
    const vm = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
    let val = '';
    if (t === 's') { const i = vm ? parseInt(vm[1], 10) : -1; val = shared[i] ?? ''; }
    else if (t === 'inlineStr') { const im = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/); val = im ? unescapeXml(im[1]) : ''; }
    else if (t === 'str') { val = vm ? unescapeXml(vm[1]) : ''; }
    else { val = vm ? vm[1] : ''; }
    if (val !== '') cells[ref] = val;
    const rm = ref.match(/^([A-Z]+)([0-9]+)$/);
    if (rm) { maxCol = Math.max(maxCol, xlsxColIndex(rm[1])); maxRow = Math.max(maxRow, parseInt(rm[2], 10)); }
  }
  return { cells, rows: Math.max(8, maxRow + 2), cols: Math.max(6, maxCol + 2) };
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
    frames: [frame], devices: { [writer.id]: writer }, bindings: [],
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
  // "Send items to Base" panel — opened from a Writer frame.
  const [bindPanel, setBindPanel] = useState<{ writerId: string } | null>(null);
  const [bindTarget, setBindTarget] = useState<string>('new'); // 'new' | base device id
  const [bindText, setBindText] = useState<string>('');
  const [bindNumber, setBindNumber] = useState<string>('');
  // Studio posture — tool + selection lifted so the canvas and the Layers panel
  // stay in sync (select on canvas ↔ select in panel).
  const [studioTool, setStudioTool] = useState<VectorTool>('select');
  const [studioSel, setStudioSel] = useState<string | null>(null); // object OR layer id
  const [studioImgBusy, setStudioImgBusy] = useState(false);
  const [studioUrl, setStudioUrl] = useState('');

  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const studioFileRef = useRef<HTMLInputElement>(null);
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

  // ── The binding graph ──────────────────────────────────────────────────────

  /** deviceId → the frame that hosts it (for chips + Board wires). */
  const deviceFrame = useMemo(() => {
    const map = new Map<string, TelaFrame>();
    for (const f of doc?.frames || []) for (const id of f.deviceIds) map.set(id, f);
    return map;
  }, [doc?.frames]);

  const baseList = useMemo(
    () => (doc?.frames || []).flatMap(f => f.deviceIds.map(id => {
      const d = doc?.devices[id];
      return d?.type === 'BASE' ? { id: d.id, name: d.name || f.label || 'Base' } : null;
    })).filter((x): x is { id: string; name: string } => !!x),
    [doc],
  );

  /** Live plain text of every Writer, for TEXT objects bound to one. */
  const writerTexts = useMemo(() => {
    const m: Record<string, string> = {};
    for (const id in (doc?.devices || {})) {
      const d = doc!.devices[id];
      if (d.type === 'WRITER') m[id] = d.blocks.map(blockPlainText).filter(Boolean).join('\n');
    }
    return m;
  }, [doc?.devices]);

  /** Writers available to bind a Vector TEXT object to (id + friendly name). */
  const writerList = useMemo(
    () => (doc?.frames || []).flatMap(f => f.deviceIds.map(id => {
      const d = doc?.devices[id];
      return d?.type === 'WRITER' ? { id: d.id, name: f.label || 'Writer' } : null;
    })).filter((x): x is { id: string; name: string } => !!x),
    [doc],
  );

  /** Studio focus — the Vector/Image device the Studio posture operates on:
   *  the active frame's design device, else the first design frame in the doc. */
  const studioFocus = useMemo(() => {
    if (!doc) return null;
    const isDesign = (d?: TelaDevice) => d?.type === 'VECTOR' || d?.type === 'IMAGE';
    const frame = (activeFrameId && doc.frames.find(f => f.id === activeFrameId)?.deviceIds.some(id => isDesign(doc.devices[id])))
      ? doc.frames.find(f => f.id === activeFrameId)!
      : doc.frames.find(f => f.deviceIds.some(id => isDesign(doc.devices[id]))) || null;
    const device = frame ? (frame.deviceIds.map(id => doc.devices[id]).find(isDesign) || null) : null;
    return device ? { frame: frame!, device } : null;
  }, [doc, activeFrameId]);

  // Reset the Studio selection/tool whenever the focused design device changes.
  const studioDevId = studioFocus?.device.id || null;
  useEffect(() => { setStudioSel(null); setStudioTool('select'); }, [studioDevId]);

  /** Cross-device formula resolution — grids/bases by name/label/id (live). */
  const formulaContext = useMemo<TelaFormulaContext>(() => {
    const grids = new Map<string, Record<string, string>>();
    const bases = new Map<string, TelaBaseLite>();
    for (const f of doc?.frames || []) for (const id of f.deviceIds) {
      const dev = doc?.devices[id];
      if (!dev) continue;
      const label = (f.label || '').toLowerCase().trim();
      if (dev.type === 'GRID') { if (label) grids.set(label, dev.cells); grids.set(id.toLowerCase(), dev.cells); }
      if (dev.type === 'BASE') {
        const lite: TelaBaseLite = { fields: dev.fields, rows: dev.rows };
        if (dev.name) bases.set(dev.name.toLowerCase().trim(), lite);
        if (label) bases.set(label, lite);
        bases.set(id.toLowerCase(), lite);
      }
    }
    return {
      resolveGrid: n => grids.get(n.toLowerCase()) ?? null,
      resolveBase: n => bases.get(n.toLowerCase()) ?? null,
    };
  }, [doc]);

  /** Board wires: 'items' bindings + 'ref' edges derived from Grid formulas. */
  const boardEdges = useMemo(() => {
    const edges: { from: TelaFrame; to: TelaFrame; label: string }[] = [];
    if (!doc) return edges;
    for (const b of doc.bindings || []) {
      const from = deviceFrame.get(b.sourceDeviceId);
      const to = deviceFrame.get(b.targetDeviceId);
      if (from && to && from.id !== to.id) edges.push({ from, to, label: b.kind === 'items' ? 'items' : 'ref' });
    }
    // Grid formula references → 'ref' edges (source device → referencing grid).
    const nameToFrame = new Map<string, TelaFrame>();
    for (const f of doc.frames) for (const id of f.deviceIds) {
      const dev = doc.devices[id]; if (!dev) continue;
      const label = (f.label || '').toLowerCase().trim();
      if (dev.type === 'GRID' || dev.type === 'BASE') {
        if (label) nameToFrame.set(label, f);
        nameToFrame.set(id.toLowerCase(), f);
        if (dev.type === 'BASE' && dev.name) nameToFrame.set(dev.name.toLowerCase().trim(), f);
      }
    }
    const seen = new Set<string>();
    const addRef = (name: string, host: TelaFrame) => {
      const src = nameToFrame.get(name.toLowerCase().trim());
      if (!src || src.id === host.id) return;
      const k = src.id + '>' + host.id;
      if (seen.has(k)) return;
      seen.add(k);
      edges.push({ from: src, to: host, label: 'ref' });
    };
    for (const f of doc.frames) for (const id of f.deviceIds) {
      const dev = doc.devices[id];
      if (!dev || dev.type !== 'GRID') continue;
      for (const key in dev.cells) {
        const raw = dev.cells[key];
        if (!raw || !raw.trim().startsWith('=')) continue;
        let m: RegExpExecArray | null;
        const xg = /([A-Za-z_][A-Za-z0-9_ ]*)!([A-Z]+[0-9]+)/gi;
        while ((m = xg.exec(raw))) addRef(m[1], f);
        const bg = /\b(?:COUNT|SUM|AVG|AVERAGE|MIN|MAX)\(\s*([A-Za-z_][A-Za-z0-9_ ]*?)(?:\.[A-Za-z0-9_ ]+)?\s*\)/gi;
        while ((m = bg.exec(raw))) addRef(m[1], f);
      }
    }
    // Vector TEXT objects bound to a Writer → a live 'text' edge (writer → vector).
    for (const f of doc.frames) for (const id of f.deviceIds) {
      const dev = doc.devices[id];
      if (!dev || dev.type !== 'VECTOR') continue;
      for (const o of dev.objects) {
        if (o.kind !== 'TEXT' || !o.boundWriterDeviceId) continue;
        const src = deviceFrame.get(o.boundWriterDeviceId);
        if (src && src.id !== f.id) edges.push({ from: src, to: f, label: 'text' });
      }
    }
    return edges;
  }, [doc, deviceFrame]);

  // Live re-sync: whenever the doc changes, re-derive each 'items' binding's
  // rows from its source Writer and replace them ONLY if they actually changed.
  // Deterministic row ids make an unchanged source a no-op, so no loop.
  useEffect(() => {
    if (!doc) return;
    for (const b of doc.bindings || []) {
      if (b.kind !== 'items') continue;
      const src = doc.devices[b.sourceDeviceId];
      const tgt = doc.devices[b.targetDeviceId];
      if (!src || src.type !== 'WRITER' || !tgt || tgt.type !== 'BASE') continue;
      const derived = deriveItemsRows(b, src, tgt);
      const current = tgt.rows.filter(r => r.derivedFromBindingId === b.id);
      if (JSON.stringify(current) !== JSON.stringify(derived)) {
        dispatchOp({ type: 'REPLACE_DERIVED_ROWS', deviceId: tgt.id, bindingId: b.id, rows: derived });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const openBindPanel = (writerId: string) => {
    setBindPanel({ writerId });
    setBindTarget('new');
    setBindText('');
    setBindNumber('');
  };

  const onBindTargetChange = (val: string) => {
    setBindTarget(val);
    if (val !== 'new') {
      const base = doc?.devices[val];
      if (base?.type === 'BASE') {
        setBindText(base.fields.find(f => f.type === 'TEXT')?.id || '');
        setBindNumber(base.fields.find(f => f.type === 'NUMBER')?.id || '');
      }
    }
  };

  const confirmBinding = () => {
    if (!bindPanel || !doc) return;
    const writer = doc.devices[bindPanel.writerId];
    if (!writer || writer.type !== 'WRITER') { setBindPanel(null); return; }
    let targetBaseId: string;
    let mapping: TelaBinding['mapping'];
    if (bindTarget === 'new') {
      const base = makeBaseDevice();
      // A tidy Name + Price base for menu-style "Name — $12" lines.
      base.fields = [
        { id: uid('fld'), name: 'Name', type: 'TEXT' },
        { id: uid('fld'), name: 'Price', type: 'NUMBER' },
      ];
      const n = (doc.frames.filter(f => f.deviceIds.some(id => doc.devices[id]?.type === 'BASE')).length) + 1;
      base.name = `Items ${n}`;
      const wf = deviceFrame.get(writer.id);
      const pos = wf ? { x: wf.x + wf.w + 96, y: wf.y } : nextFramePos();
      addFrame('BOARD', 'FREE', base, base.name, { size: { w: 560, h: 440 }, pos });
      targetBaseId = base.id;
      mapping = { text: base.fields[0].id, number: base.fields[1].id };
    } else {
      targetBaseId = bindTarget;
      mapping = { text: bindText || undefined, number: bindNumber || undefined };
    }
    const binding: TelaBinding = {
      id: uid('bind'), kind: 'items',
      sourceDeviceId: writer.id, sourceSelector: 'items',
      targetDeviceId: targetBaseId, targetRole: 'rows', mapping,
    };
    dispatchOp({ type: 'ADD_BINDING', binding });
    setBindPanel(null);
  };

  // ── Frame management ───────────────────────────────────────────────────────

  const nextFramePos = (): { x: number; y: number } => {
    const frames = docRef.current?.frames || [];
    if (!frames.length) return { x: 0, y: 0 };
    return { x: Math.max(...frames.map(f => f.x + f.w)) + 96, y: Math.min(...frames.map(f => f.y)) };
  };

  const addFrame = (
    kind: TelaFrame['kind'], preset: TelaFramePreset, device: TelaDevice, label: string,
    opts?: { size?: { w: number; h: number }; pos?: { x: number; y: number } },
  ) => {
    const p = PRESETS[preset];
    const pos = opts?.pos || nextFramePos();
    const frame: TelaFrame = {
      id: uid('frame'), kind, preset, x: pos.x, y: pos.y,
      w: opts?.size?.w ?? p.w, h: opts?.size?.h ?? p.h, deviceIds: [device.id], label,
    };
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

  const makeBaseDevice = (): TelaBaseDevice => ({
    id: uid('dev'), type: 'BASE',
    fields: [
      { id: uid('fld'), name: 'Name', type: 'TEXT' },
      { id: uid('fld'), name: 'Amount', type: 'NUMBER' },
      { id: uid('fld'), name: 'Done', type: 'CHECKBOX' },
    ],
    rows: [],
  });
  const addBaseTable = () => {
    const n = (docRef.current?.frames.filter(f => f.deviceIds.some(id => docRef.current?.devices[id]?.type === 'BASE')).length || 0) + 1;
    const base = makeBaseDevice();
    base.name = `Base ${n}`;
    addFrame('BOARD', 'FREE', base, base.name, { size: { w: 720, h: 440 } });
  };
  const addFormFrame = () => {
    const bases = (docRef.current?.frames || []).flatMap(f => f.deviceIds).map(id => docRef.current?.devices[id]).filter((d): d is TelaBaseDevice => d?.type === 'BASE');
    const form: TelaFormDevice = { id: uid('dev'), type: 'FORM', baseDeviceId: bases[0]?.id, title: 'Form' };
    addFrame('BOARD', 'FREE', form, 'Form', { size: { w: 460, h: 560 } });
  };
  // Vector artboard — an A4 poster by default so Export prints it sharp (SVG).
  const addVectorArtboard = () => {
    const n = (docRef.current?.frames.filter(f => f.deviceIds.some(id => docRef.current?.devices[id]?.type === 'VECTOR')).length || 0) + 1;
    const p = PRESETS.A4;
    const dev: TelaVectorDevice = { id: uid('dev'), type: 'VECTOR', name: `Artboard ${n}`, width: p.w, height: p.h, objects: [] };
    addFrame('PAPER', 'A4', dev, dev.name!);
    setPosture('STUDIO');
  };
  // Image canvas — a raster surface hosting stacked layers.
  const addImageCanvas = () => {
    const n = (docRef.current?.frames.filter(f => f.deviceIds.some(id => docRef.current?.devices[id]?.type === 'IMAGE')).length || 0) + 1;
    const dev: TelaImageDevice = { id: uid('dev'), type: 'IMAGE', name: `Image ${n}`, width: 1000, height: 750, layers: [] };
    addFrame('BOARD', 'FREE', dev, dev.name!, { size: { w: 1000, h: 750 } });
    setPosture('STUDIO');
  };

  // Studio image adds — dispatched here so the Studio's own rail/panel can add
  // layers while the device renders chrome-less (Studio hosts the controls).
  const studioAddImageFile = async (deviceId: string, file: File) => {
    setStudioImgBusy(true);
    try {
      const r = await uploadTelaImage(file);
      dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId, layer: makeImageLayer(r.src, file.name.replace(/\.[^.]+$/, ''), { storagePath: r.storagePath, sessionOnly: r.sessionOnly }) });
    } catch (e) { console.error('[Tela Studio] image upload failed', e); }
    finally { setStudioImgBusy(false); }
  };
  const studioAddImageUrl = (deviceId: string) => {
    const u = studioUrl.trim();
    if (u) dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId, layer: makeImageLayer(u, 'Image') });
    setStudioUrl('');
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
      } else if (ext === 'xlsx') {
        // P1: minimal OOXML reader over fflate (sheet1 + sharedStrings → Grid).
        const { cells, rows, cols } = await parseXlsx(await file.arrayBuffer());
        const grid: TelaGridDevice = { id: uid('dev'), type: 'GRID', rows, cols, cells };
        addFrame('BOARD', 'FREE', grid, file.name.replace(/\.[^.]+$/, ''));
      } else if (ext === 'xls') {
        // Legacy binary .xls is a different (non-zip) format — not covered.
        throw new Error('Legacy .xls isn’t supported — re-save as .xlsx or .csv and import that.');
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
    if (device.type === 'BASE') {
      return (
        <TelaBase
          key={device.id}
          device={device}
          readOnly={readOnly}
          onAddField={field => dispatchOp({ type: 'ADD_BASE_FIELD', deviceId: device.id, field })}
          onUpdateField={(fieldId, patch) => dispatchOp({ type: 'UPDATE_BASE_FIELD', deviceId: device.id, fieldId, patch })}
          onDeleteField={fieldId => dispatchOp({ type: 'DELETE_BASE_FIELD', deviceId: device.id, fieldId })}
          onAddRow={row => dispatchOp({ type: 'ADD_BASE_ROW', deviceId: device.id, row })}
          onSetCell={(rowId, fieldId, value) => dispatchOp({ type: 'SET_BASE_CELL', deviceId: device.id, rowId, fieldId, value })}
          onDeleteRow={rowId => dispatchOp({ type: 'DELETE_BASE_ROW', deviceId: device.id, rowId })}
        />
      );
    }
    if (device.type === 'FORM') {
      const base = device.baseDeviceId ? doc?.devices[device.baseDeviceId] : null;
      return (
        <TelaForm
          key={device.id}
          device={device}
          base={base?.type === 'BASE' ? base : null}
          bases={baseList}
          readOnly={readOnly}
          onSetBase={baseDeviceId => dispatchOp({ type: 'SET_FORM_BASE', deviceId: device.id, baseDeviceId })}
          onSubmit={values => { if (device.baseDeviceId) dispatchOp({ type: 'ADD_BASE_ROW', deviceId: device.baseDeviceId, row: { id: uid('row'), values } }); }}
        />
      );
    }
    if (device.type === 'VECTOR') {
      return (
        <TelaVector
          key={device.id}
          device={device}
          readOnly={readOnly}
          chrome={!readOnly}
          writerTexts={writerTexts}
          writers={writerList}
          onAddObject={object => dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: device.id, object })}
          onUpdateObject={(objectId, patch) => dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: device.id, objectId, patch })}
          onDeleteObject={objectId => dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: device.id, objectId })}
          onReorder={(objectId, toIndex) => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: device.id, objectId, toIndex })}
        />
      );
    }
    if (device.type === 'IMAGE') {
      return (
        <TelaImage
          key={device.id}
          device={device}
          readOnly={readOnly}
          chrome={!readOnly}
          onAddLayer={layer => dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId: device.id, layer })}
          onUpdateLayer={(layerId, patch) => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: device.id, layerId, patch })}
          onDeleteLayer={layerId => dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: device.id, layerId })}
          onReorder={(layerId, toIndex) => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: device.id, layerId, toIndex })}
        />
      );
    }
    return (
      <TelaGrid
        key={device.id}
        device={device}
        readOnly={readOnly}
        formulaContext={formulaContext}
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
              <button className={menuItem} onClick={addBaseTable}><Database size={15} className="text-[var(--pj-success,#06D6A0)]" /> Base table<span className="ml-auto text-[.62rem] text-white/40">Database</span></button>
              <button className={menuItem} onClick={addFormFrame}><FormInput size={15} className="text-[var(--pj-magenta,#D40055)]" /> Form<span className="ml-auto text-[.62rem] text-white/40">→ Base</span></button>
              <button className={menuItem} onClick={addVectorArtboard}><Shapes size={15} className="text-[var(--pj-lilac,#D0BCFF)]" /> Vector<span className="ml-auto text-[.62rem] text-white/40">Studio</span></button>
              <button className={menuItem} onClick={addImageCanvas}><ImageIcon size={15} className="text-[var(--pj-cyan,#00DAF3)]" /> Image<span className="ml-auto text-[.62rem] text-white/40">Layers</span></button>
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
        <button className={topBtn} onClick={() => fileRef.current?.click()} disabled={importBusy} title="Import docx · pdf · md · txt · fountain · csv · xlsx">
          <FileUp size={15} /> {importBusy ? 'Importing…' : 'Import'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={`${SUPPORTED_IMPORT_ACCEPT},.csv,.xlsx`}
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
      {posture === 'STUDIO' ? (() => {
        // No Vector/Image in focus → gentle hint (Studio tools don't fake text-device tools).
        if (!studioFocus) {
          const hasWriterFocus = !!activeFrame;
          return (
            <div className="flex-1 grid place-items-center" style={{ background: '#141318' }}>
              <div className="text-center px-10 py-12 rounded-[var(--pj-radius-xl,28px)] border" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.035)', maxWidth: 440 }}>
                <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] mb-4 text-white" style={{ background: 'var(--pj-grad-spatial, linear-gradient(135deg,#6B0099,#00DAF3))' }}>
                  <PenLine size={20} />
                </span>
                <h2 className="font-display italic text-white text-[1.3rem] mb-2">The Studio</h2>
                <p className="text-[.82rem] text-white/55 leading-relaxed mb-5">
                  {hasWriterFocus
                    ? 'Studio tools apply to Vector & Image devices. Add one to design here — your Writer, Grid, Base and Form stay editable in Page and Board.'
                    : 'Add a Vector artboard or an Image canvas to start designing — layers, shapes, adjustments, and text bound live to your Writer.'}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[.78rem] font-bold text-white" style={{ background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' }} onClick={addVectorArtboard}><Shapes size={15} /> Vector</button>
                  <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[.78rem] font-bold text-white" style={{ background: 'var(--pj-grad-spatial, linear-gradient(135deg,#6B0099,#00DAF3))' }} onClick={addImageCanvas}><ImageIcon size={15} /> Image</button>
                </div>
              </div>
            </div>
          );
        }

        const focus = studioFocus.device;
        const isVec = focus.type === 'VECTOR';
        const vec = isVec ? (focus as TelaVectorDevice) : null;
        const img = !isVec ? (focus as TelaImageDevice) : null;
        const railBtn = (active: boolean): React.CSSProperties => ({
          display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 10, border: 'none', cursor: 'pointer',
          color: active ? '#fff' : 'rgba(255,255,255,0.5)',
          background: active ? 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' : 'transparent',
        });
        const panelLbl = 'text-[.6rem] font-extrabold uppercase tracking-[.14em] text-white/40';

        return (
          <div className="flex-1 flex min-h-0">
            {/* Left tool rail */}
            <div className="shrink-0 flex flex-col items-center gap-1 py-3" style={{ width: 54, borderRight: '1px solid rgba(255,255,255,0.08)', background: '#0b0a10' }}>
              {isVec
                ? STUDIO_VEC_TOOLS.map(t => (
                    <button key={t.id} title={t.label} style={railBtn(studioTool === t.id)} onClick={() => setStudioTool(t.id)}>{t.icon}</button>
                  ))
                : (
                  <>
                    <button title="Select / move" style={railBtn(true)} onClick={() => {}}><MousePointer2 size={17} /></button>
                    <button title="Upload image layer" style={railBtn(false)} disabled={studioImgBusy} onClick={() => studioFileRef.current?.click()}>{studioImgBusy ? <Loader2 size={17} className="animate-spin" /> : <ImagePlus size={17} />}</button>
                  </>
                )}
            </div>

            {/* Center stage — rulers + artboard */}
            <div className="flex-1 relative overflow-auto" style={{ background: '#141318' }}>
              {/* Studio top-strip */}
              <div className="sticky top-0 z-10 flex items-center gap-2 px-4 h-9" style={{ background: 'rgba(11,10,16,0.9)', borderBottom: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)' }}>
                <span className="text-[.72rem] font-bold text-white/80">{focus.name || (isVec ? 'Artboard' : 'Image')}</span>
                <span className="text-[.64rem] font-semibold text-white/35">{isVec ? 'Vector' : 'Image'} · {focus.width}×{focus.height}</span>
                <span className="ml-auto text-[.62rem] text-white/30">{isVec ? `${vec!.objects.length} objects` : `${img!.layers.length} layers`}</span>
              </div>
              {/* Rulers */}
              <div style={{ position: 'sticky', top: 36, left: 0, height: 14, marginLeft: 14, background: '#0b0a10', borderBottom: '1px solid rgba(255,255,255,0.08)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.08) 0 1px,transparent 1px 40px)', zIndex: 5 }} />
              <div style={{ position: 'absolute', top: 50, left: 0, bottom: 0, width: 14, background: '#0b0a10', borderRight: '1px solid rgba(255,255,255,0.08)', backgroundImage: 'repeating-linear-gradient(0deg,rgba(255,255,255,0.08) 0 1px,transparent 1px 40px)', zIndex: 5 }} />
              {/* Artboard */}
              <div style={{ minHeight: 'calc(100% - 50px)', display: 'grid', placeItems: 'center', padding: '40px 40px 60px 54px' }}>
                <div style={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)' }}>
                  {isVec ? (
                    <TelaVector
                      device={vec!} chrome={false}
                      tool={studioTool} onToolChange={setStudioTool}
                      selectedId={studioSel} onSelect={setStudioSel}
                      writerTexts={writerTexts} writers={writerList}
                      onAddObject={object => dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: focus.id, object })}
                      onUpdateObject={(objectId, patch) => dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: focus.id, objectId, patch })}
                      onDeleteObject={objectId => dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: focus.id, objectId })}
                      onReorder={(objectId, toIndex) => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: focus.id, objectId, toIndex })}
                    />
                  ) : (
                    <TelaImage
                      device={img!} chrome={false}
                      selectedId={studioSel} onSelect={setStudioSel}
                      onAddLayer={layer => dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId: focus.id, layer })}
                      onUpdateLayer={(layerId, patch) => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: focus.id, layerId, patch })}
                      onDeleteLayer={layerId => dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: focus.id, layerId })}
                      onReorder={(layerId, toIndex) => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: focus.id, layerId, toIndex })}
                    />
                  )}
                </div>
              </div>
              <input ref={studioFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && img) void studioAddImageFile(img.id, f); e.target.value = ''; }} />
            </div>

            {/* Right — Layers panel */}
            <div className="shrink-0 flex flex-col min-h-0" style={{ width: 248, borderLeft: '1px solid rgba(255,255,255,0.08)', background: '#0e0d14' }}>
              <div className="flex items-center gap-2 px-3.5 h-9 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span className={panelLbl}>Layers</span>
              </div>

              {/* Image: add-layer row */}
              {img && (
                <div className="px-3 py-2.5 flex flex-col gap-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <button onClick={() => studioFileRef.current?.click()} disabled={studioImgBusy} className="flex items-center justify-center gap-1.5 h-8 rounded-[9px] text-[.74rem] font-bold text-white" style={{ background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' }}>
                    {studioImgBusy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} {studioImgBusy ? 'Uploading…' : 'Add image'}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <input value={studioUrl} onChange={e => setStudioUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') studioAddImageUrl(img.id); }} placeholder="…or paste image URL" className="flex-1 min-w-0 h-8 px-2.5 rounded-[9px] text-[.72rem] text-white/85 outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)' }} />
                    <button onClick={() => studioAddImageUrl(img.id)} className="grid place-items-center w-8 h-8 rounded-[9px] text-white/70" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)' }}><LinkIcon size={14} /></button>
                  </div>
                </div>
              )}

              {/* The list + selected props */}
              <div className="flex-1 overflow-y-auto custom-scrollbar px-2.5 py-2.5">
                {isVec && (
                  <>
                    {vec!.objects.length === 0 && <div className="px-1 py-2 text-[.72rem] text-white/35">Empty artboard — pick a tool and draw.</div>}
                    {vec!.objects.map((o, idx) => ({ o, idx })).reverse().map(({ o, idx }) => {
                      const sel = studioSel === o.id;
                      const bound = o.kind === 'TEXT' && o.boundWriterDeviceId;
                      const sw = o.fill !== 'none' ? o.fill : (o.stroke !== 'none' ? o.stroke : '#888');
                      return (
                        <div key={o.id} onClick={() => setStudioSel(o.id)} className="flex items-center gap-2 px-2 py-1.5 mb-0.5 rounded-[8px] cursor-pointer" style={{ background: sel ? 'rgba(255,255,255,0.09)' : 'transparent', border: sel ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent' }}>
                          <span className="w-4 h-4 rounded-[4px] shrink-0" style={{ background: sw, border: '1px solid rgba(255,255,255,0.2)' }} />
                          <span className="flex-1 min-w-0 text-[.74rem] text-white/85 truncate">{o.kind === 'TEXT' ? (o.text || 'Text') : o.kind[0] + o.kind.slice(1).toLowerCase()}</span>
                          {bound && <Link2 size={11} className="shrink-0 text-[var(--pj-cyan,#00DAF3)]" />}
                          <button title="Bring forward" onClick={e => { e.stopPropagation(); dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: focus.id, objectId: o.id, toIndex: idx + 1 }); }} className="grid place-items-center w-4 h-5 text-white/45 hover:text-white"><Plus size={11} /></button>
                          <button title="Delete" onClick={e => { e.stopPropagation(); dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: focus.id, objectId: o.id }); if (studioSel === o.id) setStudioSel(null); }} className="grid place-items-center w-4 h-5 text-white/35 hover:text-[var(--pj-danger,#EF4444)]"><Trash2 size={11} /></button>
                        </div>
                      );
                    })}
                    {vec!.objects.find(o => o.id === studioSel) && (
                      <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <div className={`${panelLbl} mb-2`}>{vec!.objects.find(o => o.id === studioSel)!.kind}</div>
                        <TelaVectorObjectProps
                          object={vec!.objects.find(o => o.id === studioSel)!}
                          writers={writerList}
                          onUpdate={patch => dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: focus.id, objectId: studioSel!, patch })}
                          onDelete={() => { dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: focus.id, objectId: studioSel! }); setStudioSel(null); }}
                          onForward={() => { const i = vec!.objects.findIndex(o => o.id === studioSel); dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: focus.id, objectId: studioSel!, toIndex: i + 1 }); }}
                          onBack={() => { const i = vec!.objects.findIndex(o => o.id === studioSel); dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: focus.id, objectId: studioSel!, toIndex: i - 1 }); }}
                          compact
                        />
                      </div>
                    )}
                  </>
                )}
                {img && (
                  <>
                    {img.layers.length === 0 && <div className="px-1 py-2 text-[.72rem] text-white/35">No layers — add an image above.</div>}
                    {[...img.layers].map((l, idx) => ({ l, idx })).reverse().map(({ l, idx }) => (
                      <ImageLayerRow
                        key={l.id} layer={l} selected={studioSel === l.id}
                        onSelect={() => setStudioSel(l.id)}
                        onToggle={() => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: focus.id, layerId: l.id, patch: { visible: !l.visible } })}
                        onForward={() => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: focus.id, layerId: l.id, toIndex: idx + 1 })}
                        onBack={() => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: focus.id, layerId: l.id, toIndex: idx - 1 })}
                        onDelete={() => { dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: focus.id, layerId: l.id }); if (studioSel === l.id) setStudioSel(null); }}
                      />
                    ))}
                    {img.layers.find(l => l.id === studioSel) && (
                      <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        {img.layers.find(l => l.id === studioSel)!.sessionOnly && <div className="text-[.62rem] font-semibold mb-2" style={{ color: 'var(--pj-warning,#F59E0B)' }}>Session-only — sign in to keep this image.</div>}
                        <TelaImageLayerControls
                          layer={img.layers.find(l => l.id === studioSel)!}
                          onUpdate={patch => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: focus.id, layerId: studioSel!, patch })}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })() : (
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
            {/* Board wires — the binding graph, drawn between bound frames. */}
            {posture === 'BOARD' && boardEdges.length > 0 && (
              <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} width={1} height={1}>
                {boardEdges.map((e, i) => {
                  const sx = e.from.x + e.from.w / 2, sy = e.from.y + e.from.h / 2;
                  const tx = e.to.x + e.to.w / 2, ty = e.to.y + e.to.h / 2;
                  const dx = Math.abs(tx - sx) * 0.4 + 40;
                  const mx = (sx + tx) / 2, my = (sy + ty) / 2;
                  return (
                    <g key={i}>
                      <path
                        d={`M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}`}
                        fill="none" stroke="rgba(0,218,243,0.55)" strokeWidth={1.6}
                        strokeLinecap="round" vectorEffect="non-scaling-stroke"
                      />
                      <circle cx={tx} cy={ty} r={3.4} fill="#00DAF3" vectorEffect="non-scaling-stroke" />
                      <g transform={`translate(${mx},${my}) scale(${1 / cam.z})`}>
                        <rect x={-24} y={-9} width={48} height={18} rx={9} fill="rgba(6,12,18,0.92)" stroke="rgba(0,218,243,0.5)" />
                        <text x={0} y={3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#8fe9f6" fontFamily="system-ui, sans-serif">{e.label}</text>
                      </g>
                    </g>
                  );
                })}
              </svg>
            )}

            {doc.frames.map(frame => {
              const active = frame.id === activeFrameId;
              const isPaper = frame.kind === 'PAPER';
              const hasWriter = frame.deviceIds.some(id => doc.devices[id]?.type === 'WRITER');
              const frameBindings = (doc.bindings || []).filter(b =>
                frame.deviceIds.includes(b.sourceDeviceId) || frame.deviceIds.includes(b.targetDeviceId));
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

                    {/* Binding chips — the link shown on both ends. */}
                    {frameBindings.map(b => (
                      <span
                        key={b.id}
                        onPointerDown={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 h-5 pl-1.5 pr-1 rounded-full shrink-0"
                        style={{ background: 'rgba(0,218,243,0.14)', border: '1px solid rgba(0,218,243,0.4)', color: '#8fe9f6', fontSize: 9.5, fontWeight: 700, letterSpacing: '.02em' }}
                        title={`Binding: ${b.kind}`}
                      >
                        <Link2 size={10} /> {b.kind}
                        <button
                          title="Remove binding"
                          onPointerDown={e => e.stopPropagation()}
                          onClick={() => dispatchOp({ type: 'REMOVE_BINDING', bindingId: b.id })}
                          className="grid place-items-center w-3.5 h-3.5 rounded-full hover:bg-white/20"
                        >
                          <X size={9} />
                        </button>
                      </span>
                    ))}

                    {/* Writer → Base "send items" trigger. */}
                    {hasWriter && (
                      <button
                        title="Send items to Base…"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => openBindPanel(frame.deviceIds.find(id => doc.devices[id]?.type === 'WRITER')!)}
                        className="grid place-items-center h-5 px-1.5 rounded-full shrink-0 text-[9.5px] font-bold gap-1"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.6)' }}
                      >
                        <Link2 size={10} /> Send items
                      </button>
                    )}
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

      {/* ── "Send items to Base" — the items binding builder ─────────────────── */}
      {bindPanel && (() => {
        const targetBase = bindTarget !== 'new' ? doc.devices[bindTarget] : null;
        const tb = targetBase?.type === 'BASE' ? targetBase : null;
        const textFields = tb ? tb.fields.filter(f => f.type === 'TEXT') : [];
        const numFields = tb ? tb.fields.filter(f => f.type === 'NUMBER') : [];
        const selCls = 'w-full h-9 px-2.5 rounded-[9px] text-[.8rem] bg-white/[0.05] border border-white/[0.14] text-white/85 outline-none';
        return createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-6"
            style={{ background: 'rgba(6,4,10,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setBindPanel(null)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ width: 420, maxWidth: '100%', background: 'linear-gradient(160deg,#1A1424,#120D1C)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, boxShadow: '0 24px 60px rgba(0,0,0,0.6)', padding: 20 }}
            >
              <div className="flex items-center gap-2.5 mb-1">
                <span className="grid place-items-center w-8 h-8 rounded-[10px] text-white" style={{ background: 'var(--pj-grad-spatial, linear-gradient(135deg,#6B0099,#00DAF3))' }}>
                  <Link2 size={16} />
                </span>
                <span className="font-display italic text-white text-[1.1rem]">Send items to Base</span>
              </div>
              <p className="text-[.76rem] text-white/50 mb-4 leading-relaxed">
                Each list/paragraph line becomes a Base row, live. Lines like
                <span className="text-white/75"> “Espresso — $3.50”</span> split into name + number.
              </p>

              <label className="block text-[.66rem] font-bold uppercase tracking-wide text-white/45 mb-1.5">Target Base</label>
              <select className={selCls} value={bindTarget} onChange={e => onBindTargetChange(e.target.value)}>
                <option value="new">＋ Create a new Base (Name · Price)</option>
                {baseList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>

              {tb && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[.66rem] font-bold uppercase tracking-wide text-white/45 mb-1.5">Name →</label>
                    <select className={selCls} value={bindText} onChange={e => setBindText(e.target.value)}>
                      <option value="">— none —</option>
                      {textFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[.66rem] font-bold uppercase tracking-wide text-white/45 mb-1.5">Number →</label>
                    <select className={selCls} value={bindNumber} onChange={e => setBindNumber(e.target.value)}>
                      <option value="">— none —</option>
                      {numFields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 mt-6">
                <button className="h-9 px-4 rounded-[10px] text-[.8rem] font-semibold text-white/70 hover:text-white bg-white/[0.05] border border-white/[0.12]" onClick={() => setBindPanel(null)}>Cancel</button>
                <button
                  className="h-9 px-4 rounded-[10px] text-[.8rem] font-bold text-white"
                  style={{ background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))', boxShadow: 'var(--pj-glow-brand, 0 6px 22px rgba(212,0,85,.34))' }}
                  onClick={confirmBinding}
                >
                  Link items
                </button>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}
    </div>
  );
};

export default TelaView;
