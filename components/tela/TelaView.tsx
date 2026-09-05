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
  BarChart3, BookHeart, Brush, CheckCircle2, ChevronDown, ChevronLeft, Circle, CircleHelp, Clipboard, Copy, CopyPlus, Database, Feather, FileDown, FilePlus2, FileText, FileUp, Folder, FormInput,
  Grid3X3, Image as ImageIcon, ImagePlus, LayoutPanelTop, Link as LinkIcon, Link2, Loader2,
  Minus, Monitor, MousePointer2, MousePointerClick, Music2, PenLine, PenTool, Plus, Scan, Shapes, Sparkles, Square, TextQuote, Trash2, Type, X,
} from 'lucide-react';
import type {
  TelaAssignmentAudienceRole, TelaBaseDevice, TelaBinding, TelaBlock, TelaDevice, TelaDoc, TelaDocMeta, TelaField,
  TelaFormDevice, TelaFrame, TelaFramePreset, TelaGridDevice, TelaImageDevice, TelaImageLayer, TelaMediaDevice, TelaMediaKind, TelaNotesDevice,
  TelaRow, TelaVectorDevice, TelaVectorObject, TelaWriterDevice,
} from '../../types';
import {
  deleteTelaDoc, listTelaDocs, loadTelaDoc, newTelaId, saveTelaDoc, telaStorageMode,
  publishTelaVersion,
} from '../../services/telaStore';
import { auth } from '../../services/backendService';
import { extractDocument, isSupportedImport, escapeHtml, SUPPORTED_IMPORT_ACCEPT } from '../../services/documentImport';
import { uploadTelaAsset, uploadTelaImage } from '../../services/telaAssets';
import { isVectorFile, rasterizeVector } from '../../services/fabula/vectorRaster';
import { classifyTelaAsset, instantiateTelaTemplate, makeShapeObject, TELA_CREATIVE_TEMPLATES, TELA_SHAPE_LIBRARY, type TelaTemplateCategory } from '../../services/telaCreativeEngine';
import { answerLayoutForObject, findTelaLayoutMatch, makeAnswerGuide, makeTelaQuestionField, rememberApprovedTelaLayout, type TelaQuestionDraft } from '../../services/telaAssignmentEngine';
import { autoFormatTelaAssignment, type TelaAutoFormatReport } from '../../services/telaAssignmentAutoFormat';
import { downloadTelaHtml } from '../../services/telaHtmlExport';
import { downloadTelaBoard, downloadTelaPage, downloadTelaVectorPng, downloadTelaVectorSvg } from '../../services/telaPageExport';
import { hydrateTelaDomainDoc, syncTelaBaseCellToDomain, syncTelaNotesToDomain, syncTelaWriterToDomain } from '../../services/telaDomainAdapters';
import { consolidateTelaTraceObjects, traceBitmapToTela, type TelaTracePreset } from '../../services/telaImageTrace';
import { isTelaDocumentModelInstalled, rebuildDocumentIntelligently, refineDocumentRegionMask, TELA_SEGMENT_MODEL, type TelaDetectedResponseField, type TelaModelProgress } from '../../services/telaDocumentIntelligence';
import TelaWriter, { makeBlock, newBlockId, type TelaWriterSelection } from './TelaWriter';
import { useAriaSurface } from '../../services/aria/useAriaSurface';
import { normalizeDesignReferenceStudy, studyToTelaTemplate } from '../../services/aria/designReferenceStudy';
import TelaGrid, { cellKey, type TelaBaseLite, type TelaFormulaContext } from './TelaGrid';
import TelaBase from './TelaBase';
import TelaForm from './TelaForm';
import TelaVector, { TelaVectorObjectProps, objBounds, type VectorTool } from './TelaVector';
import TelaImage, { TelaImageLayerControls, ImageLayerRow, makeImageLayer } from './TelaImage';
import { PRESETS, applyTelaOp, type TelaOp } from './telaOps';
import { renderDevice as renderTelaDevice, type RenderDeviceCtx } from './renderDevice';
import TelaFlyingMenu, { resolveFlyingTarget, type FlyingRef } from './TelaFlyingMenu';
import TelaAssignmentBuilder from './TelaAssignmentBuilder';
import TelaStyleEraLibrary from './TelaStyleEraLibrary';
import { instantiateStyleEraDocument } from '../../services/telaStyleEraLibrary';
import TelaHome, { type TelaHomeDocumentKind } from './TelaHome';
import type { TelaStyleEra } from '../../services/telaStyleEraLibrary';
import TelaPublicationLibrary from './TelaPublicationLibrary';
import { instantiatePublicationPage, type TelaPublicationTemplate } from '../../services/telaPublicationTemplates';
import TelaTemplateGallery from './TelaTemplateGallery';
import type { TelaDesignTemplate } from '../../services/tela/telaTemplateRegistry';
import { ensureFontsForObjects } from '../../services/tela/telaFonts';
import { makeTelaNoteEntry } from './TelaNotes';
import { useContextMenu } from '../ui/ContextMenu';
import { makeTelaChart } from '../../services/telaChartData';

const ComicDrawCanvas = React.lazy(() => import('../ComicDrawCanvas'));

// ── Presets ───────────────────────────────────────────────────────────────────
// PRESETS + the op reducer (applyTelaOp/TelaOp) now live in ./telaOps so the
// reference-embed and the flying menu share one code path with the canvas.

const PAPER_PRESETS: TelaFramePreset[] = ['LETTER', 'A4', 'BOOKLET'];
const SCREEN_PRESETS: TelaFramePreset[] = ['SIGNAGE_1080x1920', 'PHONE', 'SQUARE'];
const CHROME_H = 30;
const TELA_ASSET_ACCEPT = [
  'image/*','audio/*','video/*','model/gltf+json','model/gltf-binary','application/pdf','font/*',
  '.glb','.gltf','.obj','.fbx','.stl','.usdz','.dae','.3ds','.blend','.ply','.3mf',
  '.mp3','.wav','.m4a','.aac','.flac','.ogg','.opus','.aiff','.mid','.midi',
  '.mp4','.mov','.m4v','.webm','.avi','.mkv','.mpeg','.mpg',
  '.png','.jpg','.jpeg','.gif','.webp','.avif','.svg','.bmp','.tif','.tiff','.heic',
  '.woff','.woff2','.ttf','.otf','.zip','.rar','.7z',
].join(',');

const uid = (p: string) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// Studio left-rail vector tools (mirrors TelaVector's own palette).
const STUDIO_VEC_TOOLS: { id: VectorTool; icon: React.ReactNode; label: string }[] = [
  { id: 'select', icon: <MousePointer2 size={17} />, label: 'Select' },
  { id: 'direct', icon: <MousePointerClick size={17} />, label: 'Direct select / anchors' },
  { id: 'marquee', icon: <Scan size={17} />, label: 'Marquee select' },
  { id: 'rect', icon: <Square size={17} />, label: 'Rectangle' },
  { id: 'ellipse', icon: <Circle size={17} />, label: 'Ellipse' },
  { id: 'line', icon: <Minus size={17} />, label: 'Line' },
  { id: 'pen', icon: <PenTool size={17} />, label: 'Pen / polyline' },
  { id: 'text', icon: <Type size={17} />, label: 'Text' },
];

type StudioUnit = 'PX' | 'IN' | 'MM' | 'CM';
type StudioSafeArea = 'NONE' | 'PRINT' | 'VIDEO' | 'BOTH';
const unitMajorPx = (unit: StudioUnit) => unit === 'PX' ? 100 : unit === 'IN' ? 96 : unit === 'MM' ? 96 / 25.4 * 10 : 96 / 2.54;
const unitMinorPx = (unit: StudioUnit) => unit === 'PX' ? 10 : unit === 'IN' ? 12 : unit === 'MM' ? 96 / 25.4 : 96 / 25.4;
const formatRulerValue = (px: number, unit: StudioUnit) => unit === 'PX' ? `${Math.round(px)}` : unit === 'IN' ? `${(px / 96).toFixed(px % 96 ? 1 : 0)}″` : unit === 'MM' ? `${Math.round(px / 96 * 25.4)}` : `${(px / 96 * 2.54).toFixed(1)}`;
const rulerTicks = (length: number, unit: StudioUnit) => {
  const minor = unitMinorPx(unit), major = unitMajorPx(unit), ticks: { at: number; major: boolean; label?: string }[] = [];
  for (let at = 0, guard = 0; at <= length + .01 && guard < 1200; at += minor, guard++) {
    const isMajor = Math.abs(at / major - Math.round(at / major)) < .03;
    ticks.push({ at, major: isMajor, label: isMajor ? formatRulerValue(at, unit) : undefined });
  }
  return ticks;
};

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
  /** Opens a domain-generated Tela file directly (Melos, Notes, journals). */
  initialDocId?: string | null;
}

const TelaView: React.FC<TelaViewProps> = ({ onBack, initialDocId }) => {
  const [doc, setDoc] = useState<TelaDoc | null>(null);
  const [showHome, setShowHome] = useState(!initialDocId);
  const [posture, setPosture] = useState<Posture>('PAGE');
  const [cam, setCam] = useState({ x: 0, y: 0, z: 1 });
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [storageMode, setStorageMode] = useState<'opfs' | 'local'>('opfs');
  const [canvasList, setCanvasList] = useState<TelaDocMeta[] | null>(null);
  const [canvasesOpen, setCanvasesOpen] = useState(false);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState<'FILE' | 'INSERT' | 'DOCUMENT' | 'EDIT' | 'EXPORT' | 'ASSIGNMENT' | null>(null);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [printFrameId, setPrintFrameId] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [assetDropActive, setAssetDropActive] = useState(false);
  // "Send items to Base" panel — opened from a Writer frame.
  const [bindPanel, setBindPanel] = useState<{ writerId: string } | null>(null);
  const [bindTarget, setBindTarget] = useState<string>('new'); // 'new' | base device id
  const [bindText, setBindText] = useState<string>('');
  const [bindNumber, setBindNumber] = useState<string>('');
  // Studio posture — tool + selection lifted so the canvas and the Layers panel
  // stay in sync (select on canvas ↔ select in panel).
  const [studioTool, setStudioTool] = useState<VectorTool>('select');
  const [studioSel, setStudioSelRaw] = useState<string | null>(null); // primary object OR layer id
  const [studioSelIds, setStudioSelIds] = useState<string[]>([]);
  const setStudioSelection = useCallback((ids: string[]) => { const next = [...new Set(ids)]; setStudioSelIds(next); setStudioSelRaw(next.at(-1) || null); }, []);
  const setStudioSel = useCallback((id: string | null) => setStudioSelection(id ? [id] : []), [setStudioSelection]);
  const [studioImgBusy, setStudioImgBusy] = useState(false);
  const [studioUrl, setStudioUrl] = useState('');
  const [studioTraceBusy, setStudioTraceBusy] = useState(false);
  const [studioTracePreset, setStudioTracePreset] = useState<TelaTracePreset>('LOGO');
  const [studioTraceReview, setStudioTraceReview] = useState<null | {
    source: string; sourceDeviceId: string; sourceLayerId: string; name: string;
    preset: TelaTracePreset; result: Awaited<ReturnType<typeof traceBitmapToTela>> & {
      fields?: TelaDetectedResponseField[];
      layers?: { layout: number; artwork: number; text: number; interaction: number };
      understanding?: { summary: string; classifiedAfterRebuild: boolean };
      artworkRegions?: Array<{ id: string; label: string; status: 'TRACED_MASK' | 'TRACED_BOX' | 'FALLBACK_IMAGE'; pathCount: number; editablePathCount: number; confidence: number }>;
      engine?: string;
    };
  }>(null);
  const [studioTraceCompare, setStudioTraceCompare] = useState<'SPLIT' | 'OVERLAY'>('SPLIT');
  const [studioTraceOpacity, setStudioTraceOpacity] = useState(.58);
  const [studioAiBusy, setStudioAiBusy] = useState(false);
  const [studioAiProgress, setStudioAiProgress] = useState<TelaModelProgress | null>(null);
  const [studioMaskBusy, setStudioMaskBusy] = useState(false);
  const [studioZoom, setStudioZoom] = useState(1);
  const [studioUnit, setStudioUnit] = useState<StudioUnit>('PX');
  const [studioSnap, setStudioSnap] = useState(true);
  const [studioSafeArea, setStudioSafeArea] = useState<StudioSafeArea>('NONE');
  const [studioGuides, setStudioGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [studioCreativeLibraryOpen, setStudioCreativeLibraryOpen] = useState(false);
  const [studioTemplateCategory, setStudioTemplateCategory] = useState<TelaTemplateCategory>('DOCUMENT');
  const [studioPaintOpen, setStudioPaintOpen] = useState(false);
  const [writerSelection, setWriterSelection] = useState<TelaWriterSelection | null>(null);
  const [assignmentBuilderOpen, setAssignmentBuilderOpen] = useState(false);
  const [assignmentSource, setAssignmentSource] = useState<{ prompt: string; writer?: TelaWriterSelection; vectorDeviceId?: string; vectorObjectId?: string; kind?: 'QUESTION' | 'INSTRUCTION' }>({ prompt: '' });
  const [assignmentEditingFieldId, setAssignmentEditingFieldId] = useState<string | null>(null);
  const [assignmentPreviewRole, setAssignmentPreviewRole] = useState<TelaAssignmentAudienceRole>('STUDENT');
  const [assignmentLayoutMatch, setAssignmentLayoutMatch] = useState<{ name: string; confidence: number } | null>(null);
  const [autoFormatUndo, setAutoFormatUndo] = useState<TelaDoc | null>(null);
  const [autoFormatReport, setAutoFormatReport] = useState<TelaAutoFormatReport | null>(null);
  // Author-in-place flying menu (raised from a ✎ badge — the same menu the
  // reference-embed uses). Ref-based so edits resolve live against the doc.
  const [flying, setFlying] = useState<{ ref: FlyingRef; anchor: { x: number; y: number } } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const assetFileRef = useRef<HTMLInputElement>(null);
  const studioFileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<TelaDoc | null>(null);
  const vectorClipboard = useRef<TelaVectorObject | null>(null);
  const imageClipboard = useRef<TelaImageLayer | null>(null);
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
      const requestedId = initialDocId || metas[0]?.id;
      if (initialDocId) setShowHome(false);
      if (requestedId) {
        const d = await loadTelaDoc(requestedId);
        if (!alive) return;
        if (d) { const hydrated = await hydrateTelaDomainDoc(d); if (!alive) return; openDoc(hydrated); if (hydrated !== d) void saveTelaDoc(hydrated); return; }
      }
      openDoc(makeNewDoc(auth.currentUser?.uid || 'local'));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocId]);

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
    const current = docRef.current;
    if (current && op.type === 'SET_WRITER_BLOCKS') {
      const writer = current.devices[op.deviceId];
      if (writer?.type === 'WRITER') syncTelaWriterToDomain(writer, op.blocks);
    }
    if (current && op.type === 'SET_BASE_CELL') {
      const base = current.devices[op.deviceId];
      if (base?.type === 'BASE') syncTelaBaseCellToDomain(base, op.rowId, op.fieldId, op.value);
    }
    if (current && op.type === 'UPDATE_NOTES_DEVICE') {
      const notes = current.devices[op.deviceId];
      if (notes?.type === 'NOTES') syncTelaNotesToDomain(notes, { ...notes, ...op.patch, id: notes.id, type: 'NOTES' });
    }
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

  // ── Aria document co-author wiring (Tela canvas) ─────────────────────────────
  // Resolves the writer device the user is focused on (last selection → active
  // frame's writer → first writer) and exposes edits. All edits flow through
  // dispatchOp so domain-sync + autosave stay intact. Blocks hold inline HTML,
  // so incoming text is escaped. See services/aria/ariaContext.ts.
  const aiActiveWriterId = (() => {
    if (writerSelection?.deviceId && doc?.devices[writerSelection.deviceId]?.type === 'WRITER') return writerSelection.deviceId;
    if (activeFrameId) {
      const f = doc?.frames.find(fr => fr.id === activeFrameId);
      const wid = f?.deviceIds.find(id => doc?.devices[id]?.type === 'WRITER');
      if (wid) return wid;
    }
    return writerList[0]?.id;
  })();
  const aiWriter = aiActiveWriterId ? doc?.devices[aiActiveWriterId] : undefined;
  const aiWriterBlocks: TelaBlock[] = aiWriter?.type === 'WRITER' ? aiWriter.blocks : [];
  const aiToHtml = (t: unknown) => escapeHtml(String(t ?? '')).replace(/\n/g, '<br/>');
  const aiSetBlocks = (blocks: TelaBlock[]): boolean => {
    if (!aiActiveWriterId) return false;
    dispatchOp({ type: 'SET_WRITER_BLOCKS', deviceId: aiActiveWriterId, blocks });
    return true;
  };

  useAriaSurface({
    surface: 'tela-writer',
    domain: 'writing',
    title: `Writing on Tela${doc?.title ? `: ${doc.title}` : ''}`,
    summary: aiActiveWriterId
      ? `${aiWriterBlocks.length} block(s) in the focused document. Co-author it: continue, rewrite, and structure the text.`
      : 'No writing frame is focused yet — ask the user to click into a text frame.',
    documentText: aiActiveWriterId ? (writerTexts[aiActiveWriterId] || '') : '',
    selection: writerSelection?.text || undefined,
    data: aiActiveWriterId ? {
      focusedWriterId: aiActiveWriterId,
      selectedBlockId: writerSelection?.blockId,
      blocks: aiWriterBlocks.map(b => ({ id: b.id, kind: b.kind, preview: blockPlainText(b).slice(0, 100) })),
    } : {},
    actions: aiActiveWriterId ? [
      { id: 'appendParagraph', label: 'Add paragraph(s)', description: 'Append one or more paragraphs to the end of the focused document. Separate paragraphs with a blank line.', params: { text: 'the prose to add' } },
      { id: 'insertHeading', label: 'Add a heading', description: 'Append a heading; level "h1" (default) or "h2".', params: { text: 'heading text', level: 'h1 or h2 (optional)' } },
      { id: 'rewriteBlock', label: 'Rewrite a block', description: 'Replace the text of one block by its id (from the blocks list in the context).', params: { blockId: 'the block id', text: 'the new text' } },
      { id: 'setDocTitle', label: 'Set the title', description: 'Set the document title as the leading h1 heading.', params: { text: 'the title' } },
    ] : [],
    handlers: {
      appendParagraph: ({ text }) => {
        const paras = String(text ?? '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
        if (!paras.length) return { ok: false, message: 'No text to add.' };
        const add = paras.map(p => makeBlock('p', aiToHtml(p)));
        return aiSetBlocks([...aiWriterBlocks, ...add])
          ? { ok: true, message: `Added ${add.length} paragraph${add.length > 1 ? 's' : ''}.` }
          : { ok: false, message: 'No writing frame focused.' };
      },
      insertHeading: ({ text, level }) => {
        const t = String(text ?? '').trim(); if (!t) return { ok: false, message: 'No heading text.' };
        const kind: 'h1' | 'h2' = String(level).toLowerCase() === 'h2' ? 'h2' : 'h1';
        return aiSetBlocks([...aiWriterBlocks, makeBlock(kind, aiToHtml(t))])
          ? { ok: true, message: 'Added a heading.' } : { ok: false, message: 'No writing frame focused.' };
      },
      rewriteBlock: ({ blockId, text }) => {
        const id = String(blockId ?? '');
        if (!aiWriterBlocks.some(b => b.id === id)) return { ok: false, message: 'No block with that id.' };
        return aiSetBlocks(aiWriterBlocks.map(b => (b.id === id ? { ...b, text: aiToHtml(text) } : b)))
          ? { ok: true, message: 'Rewrote the block.' } : { ok: false, message: 'No writing frame focused.' };
      },
      setDocTitle: ({ text }) => {
        const t = aiToHtml(String(text ?? '').trim());
        if (!t) return { ok: false, message: 'No title text.' };
        const first = aiWriterBlocks[0];
        const next = first && first.kind === 'h1'
          ? aiWriterBlocks.map((b, i) => (i === 0 ? { ...b, text: t } : b))
          : [makeBlock('h1', t), ...aiWriterBlocks];
        return aiSetBlocks(next) ? { ok: true, message: 'Set the title.' } : { ok: false, message: 'No writing frame focused.' };
      },
    },
  }, [doc, activeFrameId, writerSelection, aiActiveWriterId]);

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
  useEffect(() => { setStudioSel(null); setStudioTool('select'); setStudioGuides({ x: [], y: [] }); }, [studioDevId]);

  const assignmentFields = useMemo(() => Object.values(doc?.devices || {}).filter((device): device is TelaBaseDevice => device.type === 'BASE').flatMap(base => base.fields.filter(field => field.interaction)), [doc?.devices]);
  const assignmentEditingField = assignmentEditingFieldId ? assignmentFields.find(field => field.id === assignmentEditingFieldId) || null : null;

  const assignmentSourceRef = () => assignmentSource.writer
    ? { deviceId: assignmentSource.writer.deviceId, blockId: assignmentSource.writer.blockId, selectedText: assignmentSource.writer.text, startOffset: assignmentSource.writer.startOffset, endOffset: assignmentSource.writer.endOffset }
    : assignmentSource.vectorDeviceId
      ? { deviceId: assignmentSource.vectorDeviceId, objectId: assignmentSource.vectorObjectId, selectedText: assignmentSource.prompt }
      : undefined;

  const openAssignmentBuilder = (source?: { prompt: string; writer?: TelaWriterSelection; vectorDeviceId?: string; vectorObjectId?: string }) => {
    let next = source;
    if (!next && studioFocus?.device.type === 'VECTOR') {
      const object = studioFocus.device.objects.find(item => item.id === studioSel);
      if (object) next = { prompt: blockPlainText({ id: object.id, kind: 'p', text: object.text || object.objectLabel || '' }), vectorDeviceId: studioFocus.device.id, vectorObjectId: object.id };
    }
    if (!next && writerSelection) next = { prompt: writerSelection.text, writer: writerSelection };
    const linkedFieldId = next?.vectorDeviceId && next.vectorObjectId
      ? (docRef.current?.devices[next.vectorDeviceId] as TelaVectorDevice | undefined)?.objects.find(object => object.id === next!.vectorObjectId)?.assignmentFieldId
      : undefined;
    setAssignmentSource(next || { prompt: '' });
    setAssignmentEditingFieldId(linkedFieldId || null);
    setAssignmentBuilderOpen(true);
  };

  const assignmentFormConfig = (previewRole: TelaAssignmentAudienceRole = assignmentPreviewRole): NonNullable<TelaFormDevice['assignment']> => ({
    enabled: true, previewRole, showStudentTips: true, maxRecordedVideoSeconds: 60,
    longerVideoPolicy: 'LINK_ONLY', externalVideoProviders: ['Reelo', 'YouTube', 'Vimeo', 'Google Drive', 'OneDrive'],
  });

  const findAssignmentBundle = (frame: TelaFrame) => {
    const form = frame.deviceIds.map(id => docRef.current?.devices[id]).find((device): device is TelaFormDevice => device?.type === 'FORM' && !!device.assignment?.enabled);
    const base = form?.baseDeviceId ? docRef.current?.devices[form.baseDeviceId] : null;
    return { form: form || null, base: base?.type === 'BASE' ? base : null };
  };

  const createAssignmentQuestion = (draft: TelaQuestionDraft, existingFieldId?: string) => {
    const current = docRef.current; if (!current) return;
    const source = draft.source || assignmentSourceRef();
    if (existingFieldId) {
      const base = Object.values(current.devices).find((device): device is TelaBaseDevice => device.type === 'BASE' && device.fields.some(field => field.id === existingFieldId));
      const old = base?.fields.find(field => field.id === existingFieldId);
      if (base && old) dispatchOp({ type: 'UPDATE_BASE_FIELD', deviceId: base.id, fieldId: old.id, patch: makeTelaQuestionField(old.id, { ...draft, source }, old.layout) });
      setAssignmentBuilderOpen(false); return;
    }

    const sourceVector = assignmentSource.vectorDeviceId ? current.devices[assignmentSource.vectorDeviceId] : null;
    const sourceObject = sourceVector?.type === 'VECTOR' ? sourceVector.objects.find(object => object.id === assignmentSource.vectorObjectId) : null;
    if (sourceVector?.type === 'VECTOR' && sourceObject) {
      const frame = current.frames.find(item => item.deviceIds.includes(sourceVector.id)); if (!frame) return;
      const fieldId = uid('fld');
      const layout = answerLayoutForObject(sourceObject, sourceVector, draft.responseType);
      const field = makeTelaQuestionField(fieldId, { ...draft, source }, layout);
      const guide = makeAnswerGuide(field, sourceVector);
      const bundle = findAssignmentBundle(frame);
      if (bundle.base && bundle.form) {
        dispatchOp({ type: 'ADD_BASE_FIELD', deviceId: bundle.base.id, field });
        dispatchOp({ type: 'UPDATE_FORM_DEVICE', deviceId: bundle.form.id, patch: { pageDeviceId: sourceVector.id, presentation: 'POSITIONED', assignment: assignmentFormConfig() } });
      } else {
        const base: TelaBaseDevice = { id: uid('dev'), type: 'BASE', name: `${current.title} · responses`, fields: [field], rows: [] };
        const form: TelaFormDevice = { id: uid('dev'), type: 'FORM', baseDeviceId: base.id, title: current.title, presentation: 'POSITIONED', pageDeviceId: sourceVector.id, assignment: assignmentFormConfig() };
        dispatchOp({ type: 'ADD_DEVICES_TO_FRAME', frameId: frame.id, devices: [form, base] });
      }
      dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: sourceVector.id, objectId: sourceObject.id, patch: { semanticRole: 'QUESTION', assignmentFieldId: fieldId, objectLabel: `Question · ${field.name}` } });
      if (guide) dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: sourceVector.id, object: guide });
      setStudioSel(guide?.id || sourceObject.id);
    } else {
      // A Writer highlight becomes a faithful assignment page while the source Writer remains editable.
      const width = 816, height = 1056, vectorId = uid('dev'), fieldId = uid('fld');
      const question: TelaVectorObject = { id: uid('obj'), kind: 'TEXT', x: 72, y: 110, w: 672, h: 90, fill: '#1B1523', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, text: draft.prompt, fontSize: 25, fontFamily: 'Source Serif 4, Georgia, serif', fontWeight: 700, semanticRole: 'QUESTION', assignmentFieldId: fieldId, objectLabel: `Question · ${draft.prompt}` };
      const vector: TelaVectorDevice = { id: vectorId, type: 'VECTOR', name: `${current.title} · assignment page`, width, height, objects: [question] };
      const field = makeTelaQuestionField(fieldId, { ...draft, source }, answerLayoutForObject(question, vector, draft.responseType));
      const guide = makeAnswerGuide(field, vector); if (guide) vector.objects.push(guide);
      const base: TelaBaseDevice = { id: uid('dev'), type: 'BASE', name: `${current.title} · responses`, fields: [field], rows: [] };
      const form: TelaFormDevice = { id: uid('dev'), type: 'FORM', baseDeviceId: base.id, title: current.title, presentation: 'POSITIONED', pageDeviceId: vector.id, assignment: assignmentFormConfig() };
      const pos = nextFramePos(); const frame: TelaFrame = { id: uid('frame'), kind: 'PAPER', preset: 'LETTER', x: pos.x, y: pos.y, w: width, h: height, deviceIds: [vector.id, form.id, base.id], label: `${current.title} · assignment` };
      dispatchOp({ type: 'ADD_FRAME', frame, devices: [vector, form, base] }); setActiveFrameId(frame.id); setPosture('STUDIO'); setStudioSel(guide?.id || question.id);
      if (assignmentSource.writer) {
        const writer = current.devices[assignmentSource.writer.deviceId];
        if (writer?.type === 'WRITER') dispatchOp({ type: 'SET_WRITER_BLOCKS', deviceId: writer.id, blocks: writer.blocks.map(block => block.id === assignmentSource.writer!.blockId ? { ...block, assignmentRole: 'QUESTION', assignmentFieldId: fieldId, assignmentSourceText: assignmentSource.writer!.text } : block) });
      }
    }
    setAssignmentEditingFieldId(null); setAssignmentBuilderOpen(false);
  };

  const createAssignmentInstruction = (text: string) => {
    const current = docRef.current; if (!current) return;
    const vector = assignmentSource.vectorDeviceId ? current.devices[assignmentSource.vectorDeviceId] : null;
    if (vector?.type === 'VECTOR' && assignmentSource.vectorObjectId) {
      dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: vector.id, objectId: assignmentSource.vectorObjectId, patch: { semanticRole: 'INSTRUCTION', objectLabel: `Instruction · ${text}`, fill: '#5A4769', fontWeight: 650 } });
    } else if (assignmentSource.writer) {
      const writer = current.devices[assignmentSource.writer.deviceId];
      if (writer?.type === 'WRITER') dispatchOp({ type: 'SET_WRITER_BLOCKS', deviceId: writer.id, blocks: writer.blocks.map(block => block.id === assignmentSource.writer!.blockId ? { ...block, assignmentRole: 'INSTRUCTION', assignmentSourceText: assignmentSource.writer!.text } : block) });
    }
    setAssignmentBuilderOpen(false);
  };

  const removeAssignmentQuestion = (fieldId: string) => {
    const current = docRef.current; if (!current) return;
    const base = Object.values(current.devices).find((device): device is TelaBaseDevice => device.type === 'BASE' && device.fields.some(field => field.id === fieldId));
    if (base) dispatchOp({ type: 'DELETE_BASE_FIELD', deviceId: base.id, fieldId });
    for (const device of Object.values(current.devices)) if (device.type === 'VECTOR') for (const object of device.objects.filter(item => item.assignmentFieldId === fieldId)) {
      if (object.semanticRole === 'RESPONSE_GUIDE') dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: device.id, objectId: object.id });
      else dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: device.id, objectId: object.id, patch: { semanticRole: 'PRINTED_CONTENT', assignmentFieldId: undefined } });
    }
    setAssignmentEditingFieldId(null); setAssignmentBuilderOpen(false);
  };

  const selectAssignmentField = (fieldId: string) => {
    const field = assignmentFields.find(item => item.id === fieldId); if (!field) return;
    const source = field.interaction?.source;
    setAssignmentEditingFieldId(fieldId);
    setAssignmentSource({ prompt: field.interaction?.prompt || field.name, vectorDeviceId: source?.objectId ? source.deviceId : undefined, vectorObjectId: source?.objectId, writer: source?.blockId ? { deviceId: source.deviceId, blockId: source.blockId, text: source.selectedText || field.name, startOffset: source.startOffset || 0, endOffset: source.endOffset || (source.selectedText || field.name).length } : undefined });
    if (source?.objectId) {
      const frame = docRef.current?.frames.find(item => item.deviceIds.includes(source.deviceId));
      if (frame) { setActiveFrameId(frame.id); setPosture('STUDIO'); }
      setStudioSel(source.objectId);
    }
    setAssignmentBuilderOpen(true);
  };

  const setAssignmentFormsPreviewRole = (role: TelaAssignmentAudienceRole) => {
    setAssignmentPreviewRole(role);
    const current = docRef.current; if (!current) return;
    Object.values(current.devices).filter((device): device is TelaFormDevice => device.type === 'FORM' && !!device.assignment?.enabled).forEach(form => dispatchOp({ type: 'UPDATE_FORM_DEVICE', deviceId: form.id, patch: { assignment: assignmentFormConfig(role) } }));
  };

  const runAssignmentAutoFormat = () => {
    const current = docRef.current;
    if (!current) return;
    try {
      const formatted = autoFormatTelaAssignment(current, activeFrameId || undefined);
      setAutoFormatUndo(current);
      setAutoFormatReport(formatted.report);
      docRef.current = formatted.doc;
      setDoc(formatted.doc);
      setSaveState('saving');
      void saveTelaDoc(formatted.doc).then(({ ok, synced }) => setSaveState(ok ? (synced ? 'synced' : 'saved') : 'dirty'));
      setActiveFrameId(formatted.report.frameId);
      setPosture('PAGE');
      setAppMenuOpen(null);
    } catch (error) {
      console.error('[Tela assignment] auto format failed', error);
      setImportError(error instanceof Error ? error.message : 'Auto Format could not rebuild this assignment.');
    }
  };

  const undoAssignmentAutoFormat = () => {
    if (!autoFormatUndo) return;
    const previous = autoFormatUndo;
    setAutoFormatUndo(null);
    setAutoFormatReport(null);
    docRef.current = previous;
    setDoc(previous);
    setSaveState('saving');
    void saveTelaDoc(previous).then(({ ok, synced }) => setSaveState(ok ? (synced ? 'synced' : 'saved') : 'dirty'));
    setActiveFrameId(previous.frames.find(frame => frame.id === activeFrameId)?.id || previous.frames[0]?.id || null);
    setAppMenuOpen(null);
  };

  const handleWriterInteraction = useCallback((selection: TelaWriterSelection, kind: 'QUESTION' | 'INSTRUCTION') => {
    setWriterSelection(selection);
    if (kind === 'QUESTION') {
      setAssignmentSource({ prompt: selection.text, writer: selection, kind });
      setAssignmentEditingFieldId(null);
      setAssignmentBuilderOpen(true);
      return;
    }
    const writer = docRef.current?.devices[selection.deviceId];
    if (writer?.type === 'WRITER') dispatchOp({ type: 'SET_WRITER_BLOCKS', deviceId: writer.id, blocks: writer.blocks.map(block => block.id === selection.blockId ? { ...block, assignmentRole: 'INSTRUCTION', assignmentSourceText: selection.text } : block) });
  }, [dispatchOp]);

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

  // In Studio, Aria's Art Director can turn a photographed reference study into
  // a transformed, editable starting system. The model supplies principles and
  // palette; Tela constructs fresh native objects rather than tracing the image.
  useAriaSurface({
    surface: posture === 'STUDIO' ? 'tela-designer' : '',
    domain: 'image',
    title: `Designing in Tela${doc?.title ? `: ${doc.title}` : ''}`,
    summary: `Art-direction workspace with ${TELA_CREATIVE_TEMPLATES.length} starting systems. Analyze visual references, explain their history and design language, then create original editable templates inspired by principles rather than copied composition.`,
    data: {
      templateCategories: ['DOCUMENT','POSTER','LOWER_THIRD','MENU','PRESENTATION','SOCIAL','WEB'],
      platformMuseumConnections: ['Art Museum','Architecture Museum','Photography Museum','Fashion Museum','Film Museum','Comic & Manga Museum','World cultures and historical collections'],
    },
    actions: [{
      id: 'createInspiredTemplate',
      label: 'Build an inspired Tela template',
      description: 'After analyzing an attached reference, create a new editable vector template from the study’s transferable design principles. Do not reproduce logos, characters, artwork, wording, or the original composition.',
      params: { study: 'the complete DESIGN_STUDY JSON object' },
    }],
    handlers: {
      createInspiredTemplate: ({ study }) => {
        const normalized = normalizeDesignReferenceStudy(study);
        if (!normalized) return { ok: false, message: 'The design study needs a description, design language, template brief, and at least three valid HEX colors.' };
        const template = studyToTelaTemplate(normalized);
        const device: TelaVectorDevice = {
          id: uid('dev'), type: 'VECTOR', name: template.name,
          width: template.width, height: template.height,
          objects: instantiateTelaTemplate(template),
        };
        const paper = template.category === 'DOCUMENT' || template.category === 'POSTER' || template.category === 'MENU';
        addFrame(paper ? 'PAPER' : 'SCREEN', 'FREE', device, template.name, { size: { w: template.width, h: template.height } });
        setStudioTemplateCategory(template.category);
        return { ok: true, message: `Created “${template.name}” as an editable ${template.category.toLowerCase()} template from the reference study.` };
      },
    },
  }, [posture, doc?.title]);

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
      const assetKind = classifyTelaAsset(file);
      if (assetKind === 'LOTTIE' || assetKind === 'VIDEO') {
        const r = await uploadTelaImage(file);
        dispatchOp({ type:'ADD_IMAGE_LAYER', deviceId, layer:makeImageLayer(r.src, file.name.replace(/\.[^.]+$/,''), { storagePath:r.storagePath, sessionOnly:r.sessionOnly, mediaKind:assetKind, intrinsicWidth:assetKind === 'LOTTIE' ? 512:1280, intrinsicHeight:assetKind === 'LOTTIE' ? 512:720 }) });
        return;
      }
      if (assetKind === 'BRUSH' || assetKind === 'SHAPE' || assetKind === 'PALETTE') throw new Error(`${file.name} is a creative preset. Its importer contract is recognized, but this file needs its native preset parser before it can become a canvas layer.`);
      let prepared = file;
      if (isVectorFile(file)) {
        const raster = await rasterizeVector(file);
        if (!raster) throw new Error('Tela could not decode this vector. For legacy Illustrator files, save a PDF-compatible AI, SVG, or PDF first.');
        prepared = raster;
      }
      if (!prepared.type.startsWith('image/')) throw new Error(`${file.name} is not a drawable image asset yet.`);
      const r = await uploadTelaImage(prepared);
      dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId, layer: makeImageLayer(r.src, file.name.replace(/\.[^.]+$/, ''), { storagePath: r.storagePath, sessionOnly: r.sessionOnly }) });
    } catch (e) { console.error('[Tela Studio] image upload failed', e); setImportError(e instanceof Error ? e.message : 'Asset import failed.'); }
    finally { setStudioImgBusy(false); }
  };
  const addSongwritingPage = () => {
    const n = (docRef.current?.frames.filter(frame => frame.deviceIds.some(id => docRef.current?.devices[id]?.type === 'WRITER' && (docRef.current?.devices[id] as TelaWriterDevice).mode === 'SONGWRITING')).length || 0) + 1;
    addFrame('PAPER', 'LETTER', { id: uid('dev'), type: 'WRITER', mode: 'SONGWRITING', blocks: [{ ...makeBlock('p', ''), textRole: 'LYRIC', semanticLabel: 'Verse', domainBlockKind: 'VERSE' }] }, `Song ${n}`);
  };
  const addPoetryPage = () => {
    addFrame('PAPER', 'LETTER', { id: uid('dev'), type: 'WRITER', mode: 'POETRY', blocks: [{ ...makeBlock('p', ''), textRole: 'POETRY', semanticLabel: 'Poetry' }] }, 'Poetry');
  };
  const addNotesFrame = (journal = false) => {
    const entry = makeTelaNoteEntry(journal ? 'JOURNAL' : 'NOTE', journal ? `Journal · ${new Date().toLocaleDateString()}` : 'Untitled note');
    const notes: TelaNotesDevice = { id: uid('dev'), type: 'NOTES', name: journal ? 'Journal' : 'Tela Notes', entries: [entry], activeEntryId: entry.id, defaultKind: journal ? 'JOURNAL' : 'NOTE' };
    addFrame('BOARD', 'FREE', notes, notes.name!, { size: { w: 980, h: 680 } });
  };
  const studioAddVectorFile = async (device: TelaVectorDevice, file: File) => {
    setStudioImgBusy(true);
    try {
      let prepared = file;
      if (isVectorFile(file)) prepared = (await rasterizeVector(file)) || file;
      const r = await uploadTelaImage(prepared);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => { const el = new Image(); el.onload = () => resolve(el); el.onerror = reject; el.src = r.src; });
      const scale = Math.min(1, device.width * .7 / image.naturalWidth, device.height * .7 / image.naturalHeight);
      const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
      const object: TelaVectorObject = { id: uid('obj'), kind: 'IMAGE', x: (device.width - w) / 2, y: (device.height - h) / 2, w, h, fill: 'none', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, sourceImageSrc: r.src, sourceCrop: { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight, sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight }, objectLabel: file.name, semanticRole: 'ARTWORK' };
      dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: device.id, object }); setStudioSel(object.id);
    } catch (error) { console.error('[Tela Studio] vector asset import failed', error); }
    finally { setStudioImgBusy(false); }
  };
  const saveStudioPaint = async (device: TelaImageDevice, blob: Blob) => {
    const file = new File([blob], `Tela paint ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`, { type: 'image/png' });
    await studioAddImageFile(device.id, file); setStudioPaintOpen(false);
  };
  const studioAddImageUrl = (deviceId: string) => {
    const u = studioUrl.trim();
    if (u) dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId, layer: makeImageLayer(u, 'Image') });
    setStudioUrl('');
  };
  const studioTraceImage = async (img: TelaImageDevice) => {
    const layer = img.layers.find(l => l.id === studioSel) || [...img.layers].reverse().find(l => l.visible !== false);
    if (!layer) return;
    setStudioTraceBusy(true);
    try {
      const result = await traceBitmapToTela(layer.src, studioTracePreset);
      setStudioTraceReview({ source: layer.src, sourceDeviceId: img.id, sourceLayerId: layer.id, name: layer.name || 'Image', preset: studioTracePreset, result });
    } catch (e) { console.error('[Tela Studio] image trace failed', e); alert(e instanceof Error ? e.message : 'Image trace failed.'); }
    finally { setStudioTraceBusy(false); }
  };
  const acceptStudioTrace = () => {
    if (!studioTraceReview) return;
    const { result, sourceDeviceId, sourceLayerId, name, preset } = studioTraceReview;
    const dev: TelaVectorDevice = {
      id: uid('dev'), type: 'VECTOR', name: `${name} · editable reconstruction`,
      width: result.width, height: result.height, objects: result.objects,
      trace: {
        sourceDeviceId, sourceLayerId, preset, createdAt: Date.now(), pathCount: result.objects.length,
        layoutObjectCount: result.layers?.layout, artworkObjectCount: result.layers?.artwork,
        textObjectCount: result.layers?.text, interactionObjectCount: result.layers?.interaction,
        recognizedRegions: (result.stats as any).regionCount,
        understandingSummary: result.understanding?.summary,
      },
    };
    const detectedFields = result.fields || [];
    if (detectedFields.length) {
      const baseFields = detectedFields.map((field, index) => makeTelaQuestionField(field.id || uid('fld'), {
        prompt: field.label || `Response ${index + 1}`,
        responseType: field.type === 'NUMBER' ? 'NUMBER' : field.type === 'SELECT' || field.type === 'CHECKBOX' ? 'MULTIPLE_CHOICE' : 'SHORT_TEXT',
        required: true, points: 1,
      }, { x: field.x / result.width * 100, y: field.y / result.height * 100, w: field.w / result.width * 100, h: field.h / result.height * 100, pageId: dev.id }));
      let guideIndex = 0;
      dev.objects = dev.objects.map(object => object.semanticRole === 'RESPONSE_GUIDE' && baseFields[guideIndex]
        ? { ...object, assignmentFieldId: baseFields[guideIndex++].id }
        : object);
      const base: TelaBaseDevice = {
        id: uid('dev'), type: 'BASE', name: `${name} · student responses`, rows: [],
        fields: baseFields,
      };
      const form: TelaFormDevice = { id: uid('dev'), type: 'FORM', baseDeviceId: base.id, title: name, presentation: 'POSITIONED', pageDeviceId: dev.id, assignment: assignmentFormConfig() };
      const pos = nextFramePos();
      const frame: TelaFrame = { id: uid('frame'), kind: 'PAPER', preset: 'LETTER', x: pos.x, y: pos.y, w: result.width, h: result.height, deviceIds: [dev.id, form.id, base.id], label: `${name} · fillable reconstruction` };
      dispatchOp({ type: 'ADD_FRAME', frame, devices: [dev, form, base] });
      setActiveFrameId(frame.id);
      rememberApprovedTelaLayout(name, dev, base.fields);
    } else addFrame('BOARD', 'FREE', dev, dev.name!, { size: { w: result.width, h: result.height } });
    setStudioSel(result.objects.at(-1)?.id || null);
    setStudioTraceReview(null);
    setPosture('STUDIO');
  };
  const retryStudioTrace = async (preset: TelaTracePreset) => {
    if (!studioTraceReview) return;
    setStudioTraceBusy(true);
    try {
      const result = studioTraceReview.result.engine
        ? await rebuildDocumentIntelligently(studioTraceReview.source, setStudioAiProgress)
        : await traceBitmapToTela(studioTraceReview.source, preset);
      setStudioTracePreset(preset);
      setStudioTraceReview(prev => prev ? { ...prev, preset, result } : null);
    } catch (e) { alert(e instanceof Error ? e.message : 'Image trace failed.'); }
    finally { setStudioTraceBusy(false); }
  };
  const studioIntelligentRebuild = async (img?: TelaImageDevice) => {
    const layer = img ? (img.layers.find(l => l.id === studioSel) || [...img.layers].reverse().find(l => l.visible !== false)) : null;
    const source = layer?.src || studioTraceReview?.source;
    if (!source) return;
    setStudioAiBusy(true);
    setStudioAiProgress({ phase: 'CHECKING', message: 'Preparing on-device document intelligence…' });
    try {
      const result = await rebuildDocumentIntelligently(source, setStudioAiProgress);
      const learned = findTelaLayoutMatch(result.width, result.height, result.objects.length, result.fields?.length || 0);
      setAssignmentLayoutMatch(learned ? { name: learned.profile.name, confidence: learned.confidence } : null);
      setStudioTraceReview({
        source, sourceDeviceId: layer ? img!.id : studioTraceReview!.sourceDeviceId,
        sourceLayerId: layer ? layer.id : studioTraceReview!.sourceLayerId,
        name: layer?.name || studioTraceReview?.name || 'Document', preset: 'DETAILED', result,
      });
      setStudioTraceCompare('SPLIT');
    } catch (e) { console.error('[Tela] intelligent reconstruction failed', e); alert(e instanceof Error ? e.message : 'Local document intelligence failed.'); }
    finally { setStudioAiBusy(false); }
  };
  const refineSelectedRegion = async (device: TelaVectorDevice, object: TelaVectorObject) => {
    if (!object.sourceImageSrc || !object.sourceCrop) return;
    setStudioMaskBusy(true); setStudioAiProgress({ phase: 'CHECKING', message: 'Preparing precision segmentation…' });
    try {
      const refined = await refineDocumentRegionMask(object.sourceImageSrc, object.sourceCrop, setStudioAiProgress);
      dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: device.id, objectId: object.id, patch: { sourceImageSrc: refined.src, sourceCrop: { ...object.sourceCrop, sourceWidth: refined.width, sourceHeight: refined.height }, objectLabel: `${object.objectLabel || 'Object'} · refined ${Math.round(refined.confidence * 100)}%` } });
    } catch (e) { console.error('[Tela] object segmentation failed', e); alert(e instanceof Error ? e.message : 'Object segmentation failed.'); }
    finally { setStudioMaskBusy(false); }
  };
  const smartCutoutImageLayer = async (deviceId: string, layer: TelaImageLayer) => {
    setStudioMaskBusy(true); setStudioAiProgress({ phase: 'CHECKING', message: 'Preparing on-device smart cutout…' });
    try {
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => { const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = reject; image.src = layer.src; });
      const refined = await refineDocumentRegionMask(layer.src, { x: 0, y: 0, width: size.width, height: size.height, sourceWidth: size.width, sourceHeight: size.height }, setStudioAiProgress);
      dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId, layerId: layer.id, patch: { src: refined.src, name: `${layer.name || 'Layer'} · smart cutout`, sessionOnly: true } });
    } catch (error) { console.error('[Tela] smart cutout failed', error); alert(error instanceof Error ? error.message : 'Smart cutout failed.'); }
    finally { setStudioMaskBusy(false); }
  };

  const duplicateVectorObject = (deviceId: string, source: TelaVectorObject, offset = 16) => {
    const object: TelaVectorObject = {
      ...structuredClone(source), id: uid('obj'), x: source.x + offset, y: source.y + offset,
      pathNodes: source.pathNodes?.map(node => ({ ...node, id: uid('node') })),
    };
    dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId, object }); setStudioSel(object.id); return object;
  };
  const duplicateImageLayer = (deviceId: string, source: TelaImageLayer, offset = 18) => {
    const layer: TelaImageLayer = { ...structuredClone(source), id: uid('lyr'), name: `${source.name || 'Layer'} copy`, x: source.x + offset, y: source.y + offset };
    dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId, layer }); setStudioSel(layer.id); return layer;
  };

  const vectorContextMenu = useContextMenu<{ deviceId: string; object: TelaVectorObject }>(ctx => {
    const device = docRef.current?.devices[ctx.deviceId];
    const objects = device?.type === 'VECTOR' ? device.objects : [];
    const index = objects.findIndex(o => o.id === ctx.object.id);
    const flyingRef: FlyingRef = { kind: ctx.object.kind === 'TEXT' ? 'vector-text' : 'vector-shape', deviceId: ctx.deviceId, objectId: ctx.object.id };
    return [
      { kind: 'header', label: ctx.object.objectLabel || (ctx.object.kind === 'TEXT' ? ctx.object.text || 'Text' : ctx.object.kind), swatch: ctx.object.fill !== 'none' ? ctx.object.fill : ctx.object.stroke },
      { id: 'edit', label: 'Edit in place', icon: <MousePointerClick size={15}/>, onSelect: () => { setStudioSel(ctx.object.id); setFlying({ ref: flyingRef, anchor: { x: Math.max(16, window.innerWidth - 330), y: 110 } }); } },
      { id: 'duplicate', label: 'Duplicate', shortcut: 'Ctrl+D', icon: <CopyPlus size={15}/>, onSelect: () => duplicateVectorObject(ctx.deviceId, ctx.object) },
      { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C', icon: <Copy size={15}/>, onSelect: () => { vectorClipboard.current = structuredClone(ctx.object); } },
      { id: 'paste', label: 'Paste', shortcut: 'Ctrl+V', icon: <Clipboard size={15}/>, disabled: !vectorClipboard.current, onSelect: () => { if (vectorClipboard.current) duplicateVectorObject(ctx.deviceId, vectorClipboard.current, 24); } },
      { kind: 'separator' },
      { id: 'arrange', label: 'Arrange', submenu: [
        { id: 'front', label: 'Bring to front', onSelect: () => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, toIndex: Math.max(0, objects.length - 1) }) },
        { id: 'forward', label: 'Bring forward', onSelect: () => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, toIndex: index + 1 }) },
        { id: 'backward', label: 'Send backward', onSelect: () => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, toIndex: index - 1 }) },
        { id: 'back', label: 'Send to back', onSelect: () => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, toIndex: 0 }) },
      ] },
      ...(ctx.object.kind === 'IMAGE' ? [{ id: 'refine', label: 'Refine object edge', icon: <Sparkles size={15}/>, onSelect: () => void refineSelectedRegion(device as TelaVectorDevice, ctx.object) }] : []),
      { kind: 'separator' },
      { id: 'delete', label: 'Delete', shortcut: 'Del', icon: <Trash2 size={15}/>, danger: true, onSelect: () => { dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id }); setStudioSel(null); } },
    ];
  });

  const imageContextMenu = useContextMenu<{ deviceId: string; layer: TelaImageLayer }>(ctx => {
    const device = docRef.current?.devices[ctx.deviceId]; const layers = device?.type === 'IMAGE' ? device.layers : [];
    const groups = device?.type === 'IMAGE' ? (device.groups || []) : [];
    const index = layers.findIndex(l => l.id === ctx.layer.id);
    return [
      { kind: 'header', label: ctx.layer.name || 'Image layer' },
      { id: 'edit', label: 'Layer controls', icon: <MousePointerClick size={15}/>, onSelect: () => setStudioSel(ctx.layer.id) },
      { id: 'duplicate', label: 'Duplicate layer', shortcut: 'Ctrl+J', icon: <CopyPlus size={15}/>, onSelect: () => duplicateImageLayer(ctx.deviceId, ctx.layer) },
      { id: 'copy', label: 'Copy layer', shortcut: 'Ctrl+C', icon: <Copy size={15}/>, onSelect: () => { imageClipboard.current = structuredClone(ctx.layer); } },
      { id: 'paste', label: 'Paste layer', shortcut: 'Ctrl+V', icon: <Clipboard size={15}/>, disabled: !imageClipboard.current, onSelect: () => { if (imageClipboard.current) duplicateImageLayer(ctx.deviceId, imageClipboard.current, 24); } },
      { kind: 'separator' },
      { id: 'visible', label: ctx.layer.visible ? 'Hide layer' : 'Show layer', checked: ctx.layer.visible, onSelect: () => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: ctx.deviceId, layerId: ctx.layer.id, patch: { visible: !ctx.layer.visible } }) },
      { id: 'smart-cutout', label: 'Smart cutout · on device', icon: <Sparkles size={15}/>, onSelect: () => void smartCutoutImageLayer(ctx.deviceId, ctx.layer) },
      { id: 'group', label: 'Group / matte', submenu: [
        { id: 'new-group', label: 'New group from layer', onSelect: () => { const id = uid('group'); dispatchOp({ type: 'ADD_IMAGE_GROUP', deviceId: ctx.deviceId, group: { id, name: `${ctx.layer.name || 'Layer'} group`, visible: true, opacity: 1, blend: 'normal' } }); dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: ctx.deviceId, layerId: ctx.layer.id, patch: { groupId: id } }); } },
        ...(groups.map(group => ({ id: `group-${group.id}`, label: `Move to ${group.name}`, checked: ctx.layer.groupId === group.id, onSelect: () => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: ctx.deviceId, layerId: ctx.layer.id, patch: { groupId: group.id } }) }))),
        ...(ctx.layer.groupId ? [{ id: 'ungroup', label: 'Remove from group', onSelect: () => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: ctx.deviceId, layerId: ctx.layer.id, patch: { groupId: undefined } }) }] : []),
      ] },
      { id: 'arrange', label: 'Arrange', submenu: [
        { id: 'front', label: 'Bring to front', onSelect: () => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: ctx.deviceId, layerId: ctx.layer.id, toIndex: Math.max(0, layers.length - 1) }) },
        { id: 'forward', label: 'Bring forward', onSelect: () => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: ctx.deviceId, layerId: ctx.layer.id, toIndex: index + 1 }) },
        { id: 'backward', label: 'Send backward', onSelect: () => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: ctx.deviceId, layerId: ctx.layer.id, toIndex: index - 1 }) },
        { id: 'back', label: 'Send to back', onSelect: () => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: ctx.deviceId, layerId: ctx.layer.id, toIndex: 0 }) },
      ] },
      { kind: 'separator' },
      { id: 'delete', label: 'Delete layer', icon: <Trash2 size={15}/>, shortcut: 'Del', danger: true, onSelect: () => { dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: ctx.deviceId, layerId: ctx.layer.id }); setStudioSel(null); } },
    ];
  });

  // Familiar Illustrator / Photoshop keyboard posture while Studio owns focus.
  // Inputs keep their native typing shortcuts; the canvas receives the design ones.
  useEffect(() => {
    const onStudioKey = (event: KeyboardEvent) => {
      if (posture !== 'STUDIO') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      const focus = docRef.current && studioDevId ? docRef.current.devices[studioDevId] : null;
      if (!focus || (focus.type !== 'VECTOR' && focus.type !== 'IMAGE')) return;

      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'a') {
        event.preventDefault();
        setStudioSelection(focus.type === 'VECTOR' ? focus.objects.map(object => object.id) : focus.layers.map(layer => layer.id));
        return;
      }
      if (!mod && !event.altKey && focus.type === 'VECTOR') {
        const tools: Partial<Record<string, VectorTool>> = {
          v: 'select', a: 'direct', m: 'marquee', r: 'rect', e: 'ellipse', l: 'line', p: 'pen', t: 'text',
        };
        if (tools[key]) { event.preventDefault(); setStudioTool(tools[key]!); return; }
      }
      if (event.key === 'Escape') { setStudioSel(null); setStudioTool('select'); setFlying(null); return; }

      if (mod && key === 'c' && studioSel) {
        if (focus.type === 'VECTOR') {
          const object = focus.objects.find(o => o.id === studioSel); if (object) vectorClipboard.current = structuredClone(object);
        } else {
          const layer = focus.layers.find(l => l.id === studioSel); if (layer) imageClipboard.current = structuredClone(layer);
        }
        return;
      }
      if (mod && key === 'v') {
        if (focus.type === 'VECTOR' && vectorClipboard.current) { event.preventDefault(); duplicateVectorObject(focus.id, vectorClipboard.current, 24); }
        if (focus.type === 'IMAGE' && imageClipboard.current) { event.preventDefault(); duplicateImageLayer(focus.id, imageClipboard.current, 24); }
        return;
      }
      if (mod && ((focus.type === 'VECTOR' && key === 'd') || (focus.type === 'IMAGE' && key === 'j'))) {
        event.preventDefault();
        if (focus.type === 'VECTOR') {
          const made = studioSelIds.map(id => focus.objects.find(object => object.id === id)).filter((object): object is TelaVectorObject => !!object).map(object => duplicateVectorObject(focus.id, object).id);
          if (made.length) setStudioSelection(made);
        } else {
          const made = studioSelIds.map(id => focus.layers.find(layer => layer.id === id)).filter((layer): layer is TelaImageLayer => !!layer).map(layer => duplicateImageLayer(focus.id, layer).id);
          if (made.length) setStudioSelection(made);
        }
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && studioSel) {
        event.preventDefault();
        if (focus.type === 'VECTOR') studioSelIds.filter(id => focus.objects.some(object => object.id === id)).forEach(objectId => dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: focus.id, objectId }));
        if (focus.type === 'IMAGE') studioSelIds.filter(id => focus.layers.some(layer => layer.id === id)).forEach(layerId => dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: focus.id, layerId }));
        setStudioSel(null);
      }
    };
    window.addEventListener('keydown', onStudioKey);
    return () => window.removeEventListener('keydown', onStudioKey);
  }, [posture, studioDevId, studioSel, studioSelIds, dispatchOp, setStudioSelection, setStudioSel]);

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
    setShowHome(false);
    setCanvasesOpen(false);
    void refreshList();
  };

  const openCanvas = async (id: string) => {
    const cur = docRef.current;
    if (cur && cur.id !== id) await saveTelaDoc(cur);
    const d = await loadTelaDoc(id);
    if (d) { const hydrated = await hydrateTelaDomainDoc(d); openDoc(hydrated); if (hydrated !== d) void saveTelaDoc(hydrated); }
    setShowHome(false);
    setCanvasesOpen(false);
  };
  const addChartFrame = () => {
    const n = (docRef.current?.frames.filter(f => f.deviceIds.some(id => docRef.current?.devices[id]?.type === 'CHART')).length || 0) + 1;
    const chart = makeTelaChart(uid('dev')); chart.name = `Visualization ${n}`;
    addFrame('SCREEN', 'FREE', chart, chart.name, { size:{ w:chart.width, h:chart.height } });
  };

  const createHomeDocument = async (kind: TelaHomeDocumentKind) => {
    const cur = docRef.current; if (cur) await saveTelaDoc(cur);
    const next = makeNewDoc(auth.currentUser?.uid || 'local');
    const writer = Object.values(next.devices).find((device):device is TelaWriterDevice => device.type === 'WRITER')!;
    const recipes:Record<Exclude<TelaHomeDocumentKind,'BLANK'|'BOARD'>,{title:string;blocks:Array<['h1'|'h2'|'p',string]>}> = {
      REPORT:{title:'Untitled report',blocks:[['h1','Report title'],['p','A concise summary of the question, evidence, and recommendation.'],['h2','Key findings'],['p','Begin with the most useful finding.'],['h2','Recommendations'],['p','Turn the evidence into clear next steps.']]},
      PROPOSAL:{title:'Untitled proposal',blocks:[['h1','Proposal title'],['p','The opportunity, stated clearly.'],['h2','The idea'],['p','Describe what you propose and why it matters.'],['h2','Approach'],['p','Outline the path from idea to outcome.'],['h2','Next step'],['p','Make the invitation specific.']]},
      RESUME:{title:'Résumé & portfolio',blocks:[['h1','Your name'],['p','Role · discipline · location'],['h2','Profile'],['p','A short statement of the value and perspective you bring.'],['h2','Selected work'],['p','Project — contribution — outcome'],['h2','Experience'],['p','Role — organization — dates']]},
      LESSON:{title:'Lesson plan',blocks:[['h1','Lesson title'],['p','Audience · duration · subject'],['h2','Learning objectives'],['p','By the end, learners will be able to…'],['h2','Materials'],['p','List what the room needs.'],['h2','Learning sequence'],['p','Opening · exploration · practice · reflection'],['h2','Assessment'],['p','How will understanding become visible?']]},
      NEWSLETTER:{title:'Untitled newsletter',blocks:[['h1','Newsletter name'],['p','Issue · date · a small promise to the reader'],['h2','From the editor'],['p','Open with a human note.'],['h2','The feature'],['p','Tell the story with a clear point of view.'],['h2','Worth your attention'],['p','A short collection of links, people, or ideas.']]},
      SCREENPLAY:{title:'Story treatment',blocks:[['h1','Working title'],['p','Genre · format · tone'],['h2','Logline'],['p','One sentence: protagonist, pursuit, obstacle, stakes.'],['h2','The world'],['p','Describe the place, rules, and emotional weather.'],['h2','Characters'],['p','Who wants what—and what makes that difficult?'],['h2','Story beats'],['p','Opening · turn · escalation · crisis · resolution']]},
      RESEARCH:{title:'Research notebook',blocks:[['h1','Research question'],['p','What are you trying to understand?'],['h2','Working ideas'],['p','Capture hypotheses without pretending they are conclusions.'],['h2','Sources & evidence'],['p','Source — claim — relevance — confidence'],['h2','Patterns'],['p','What repeats, conflicts, or remains absent?'],['h2','Synthesis'],['p','What can you responsibly say now?']]},
    };
    if (kind!=='BLANK'&&kind!=='BOARD') { const recipe=recipes[kind]; next.title=recipe.title; writer.blocks=recipe.blocks.map(([blockKind,text])=>makeBlock(blockKind,escapeHtml(text))); }
    if (kind==='BOARD') next.title='Untitled board';
    openDoc(next); setShowHome(false); if(kind==='BOARD')setPosture('BOARD');
  };

  const createStyleDocument = async (entry:TelaStyleEra) => {
    const cur=docRef.current; if(cur)await saveTelaDoc(cur); const ownerId=auth.currentUser?.uid||'local'; const now=Date.now();
    const device:TelaVectorDevice={id:uid('dev'),type:'VECTOR',name:entry.name,width:816,height:1056,objects:instantiateStyleEraDocument(entry)};
    const frame:TelaFrame={id:uid('frame'),kind:'PAPER',preset:'FREE',x:0,y:0,w:816,h:1056,deviceIds:[device.id],label:entry.name};
    openDoc({id:newTelaId(),ownerId,title:`${entry.name} document`,frames:[frame],devices:{[device.id]:device},bindings:[],createdAt:now,updatedAt:now});
    setShowHome(false); setPosture('STUDIO');
  };

  const createPublicationDocument = async (template:TelaPublicationTemplate) => {
    const cur=docRef.current;if(cur)await saveTelaDoc(cur);const ownerId=auth.currentUser?.uid||'local';const now=Date.now();const devices:Record<string,TelaDevice>={};
    const frames:TelaFrame[]=template.pages.map((pageType,index)=>{const device:TelaVectorDevice={id:uid('dev'),type:'VECTOR',name:`${index+1} · ${pageType}`,width:template.width,height:template.height,objects:instantiatePublicationPage(template,pageType,index)};devices[device.id]=device;return{id:uid('frame'),kind:template.category==='EMAIL BLAST'?'SCREEN':'PAPER',preset:'FREE',x:index*(template.width+96),y:0,w:template.width,h:template.height,deviceIds:[device.id],label:`${index+1} · ${pageType}`};});
    openDoc({id:newTelaId(),ownerId,title:template.name,frames,devices,bindings:[],createdAt:now,updatedAt:now});setShowHome(false);setPosture('BOARD');requestAnimationFrame(()=>fitAll());
  };

  // ── Unified template gallery ──────────────────────────────────────────────
  // Build every page of a gallery template as a VECTOR device (fonts loaded on
  // demand). From Home this opens a NEW document; from the Studio library it
  // appends the pages to the current document.
  const templateFrames = (template:TelaDesignTemplate, startX=0) => {
    const devices:Record<string,TelaDevice>={};
    const frames:TelaFrame[]=template.pages.map((page,index)=>{
      const objects=page.build(); ensureFontsForObjects(objects);
      const device:TelaVectorDevice={id:uid('dev'),type:'VECTOR',name:`${template.name} · ${page.label}`,width:template.width,height:template.height,objects};
      devices[device.id]=device;
      return {id:uid('frame'),kind:template.frameKind,preset:'FREE',x:startX+index*(template.width+96),y:0,w:template.width,h:template.height,deviceIds:[device.id],label:`${index+1} · ${page.label}`} as TelaFrame;
    });
    return {frames,devices};
  };
  const createTemplateDocument = async (template:TelaDesignTemplate) => {
    const cur=docRef.current; if(cur) await saveTelaDoc(cur);
    const ownerId=auth.currentUser?.uid||'local'; const now=Date.now();
    const {frames,devices}=templateFrames(template);
    openDoc({id:newTelaId(),ownerId,title:template.name,frames,devices,bindings:[],createdAt:now,updatedAt:now});
    setShowHome(false); setPosture(frames.length>1?'BOARD':'STUDIO'); if(frames.length>1) requestAnimationFrame(()=>fitAll());
  };
  const addTemplateFrames = (template:TelaDesignTemplate) => {
    const cur=docRef.current; const startX=cur?Math.max(0,...cur.frames.map(f=>f.x+f.w))+96:0;
    const {frames,devices}=templateFrames(template,startX);
    frames.forEach((frame,index)=>{ const device=devices[frame.deviceIds[0]]; addFrame(frame.kind,'FREE',device,frame.label,{size:{w:frame.w,h:frame.h}}); });
    setPosture('STUDIO');
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
      if (ext === 'tela') {
        const bundle = JSON.parse(await file.text());
        const imported = bundle?.format === 'plajah-tela' ? bundle.document : bundle;
        if (!imported?.id || !Array.isArray(imported.frames) || !imported.devices) throw new Error('This is not a valid Tela board file.');
        openDoc({ ...imported, id: newTelaId(), ownerId: auth.currentUser?.uid || 'local', title: imported.title || file.name.replace(/\.tela$/i, ''), createdAt: Date.now(), updatedAt: Date.now(), locked: false, currentVersionId: undefined });
      } else if (ext === 'csv') {
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
      setShowHome(false);
    } catch (e: any) {
      setImportError(e?.message || 'Import failed.');
    } finally {
      setImportBusy(false);
    }
  };

  const mediaKindFor = (file: File): TelaMediaKind => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (file.type.startsWith('image/')) return 'IMAGE';
    if (file.type.startsWith('audio/') || ['mp3','wav','m4a','aac','flac','ogg','opus','aiff','mid','midi'].includes(ext)) return 'AUDIO';
    if (file.type.startsWith('video/') || ['mp4','mov','m4v','webm','avi','mkv','mpeg','mpg'].includes(ext)) return 'VIDEO';
    if (file.type === 'application/pdf' || ext === 'pdf') return 'PDF';
    if (file.type.startsWith('model/') || ['glb','gltf','obj','fbx','stl','usdz','dae','3ds','blend','ply','3mf'].includes(ext)) return 'MODEL_3D';
    if (file.type.startsWith('font/') || ['woff','woff2','ttf','otf'].includes(ext)) return 'FONT';
    if (['zip','rar','7z'].includes(ext)) return 'ARCHIVE';
    return 'FILE';
  };

  const insertAssetFiles = async (files: File[], dropPos?: { x: number; y: number }) => {
    if (!files.length) return;
    setImportError(null); setImportBusy(true); setAssetDropActive(false);
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const kind = mediaKindFor(file);
        const uploaded = await uploadTelaAsset(file);
        const wide = kind === 'VIDEO' || kind === 'AUDIO' || kind === 'MODEL_3D';
        const size = kind === 'PDF' ? { w: 816, h: 1056 } : wide ? { w: 720, h: 405 } : { w: 560, h: 420 };
        const device: TelaMediaDevice = { id: uid('dev'), type: 'MEDIA', kind, name: file.name, src: uploaded.src, mimeType: file.type || 'application/octet-stream', size: file.size, width: size.w, height: size.h, storagePath: uploaded.storagePath, sessionOnly: uploaded.sessionOnly };
        const pos = dropPos ? { x: dropPos.x + index * 44, y: dropPos.y + index * 44 } : undefined;
        addFrame(kind === 'PDF' ? 'PAPER' : 'BOARD', 'FREE', device, file.name, { size, pos });
      }
      setShowHome(false);
    } catch (error) { setImportError(error instanceof Error ? error.message : 'Could not add this asset.'); }
    finally { setImportBusy(false); }
  };

  const saveAsCopy = async () => {
    const current = docRef.current; if (!current) return;
    const now = Date.now();
    const copy: TelaDoc = { ...structuredClone(current), id: newTelaId(), title: `${current.title || 'Untitled canvas'} copy`, ownerId: auth.currentUser?.uid || 'local', createdAt: now, updatedAt: now, locked: false, currentVersionId: undefined };
    await saveTelaDoc(copy); openDoc(copy); await refreshList(); setAppMenuOpen(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 's') { event.preventDefault(); const current = docRef.current; if (current) void saveTelaDoc(current).then(({ ok, synced }) => setSaveState(ok ? (synced ? 'synced' : 'saved') : 'dirty')); }
      if (key === 'o') { event.preventDefault(); fileRef.current?.click(); }
      if (key === 'n') { event.preventDefault(); void createCanvas(); }
      if (key === 'p') { event.preventDefault(); const current = docRef.current; const target = current?.frames.find(frame => frame.id === activeFrameId) || current?.frames.find(frame => frame.kind === 'PAPER') || current?.frames[0]; if (target) setPrintFrameId(target.id); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [activeFrameId]);

  // The standards-based model-viewer element supplies orbit/zoom controls for
  // GLB and glTF assets. Other 3D formats remain preserved as downloadable files.
  useEffect(() => {
    if (document.querySelector('script[data-tela-model-viewer]')) return;
    const script = document.createElement('script'); script.type = 'module'; script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.1.0/model-viewer.min.js'; script.dataset.telaModelViewer = '1'; document.head.appendChild(script);
  }, []);

  // ── Export PDF (print stylesheet path — browsers save to PDF) ─────────────

  const exportPdf = () => {
    const target = activeFrame || doc?.frames.find(f => f.kind === 'PAPER') || doc?.frames[0];
    if (target) setPrintFrameId(target.id);
  };

  const activeVectorDevice = () => {
    const current = docRef.current; const frame = current?.frames.find(item => item.id === activeFrameId);
    const device = frame?.deviceIds.map(id => current?.devices[id]).find((item): item is TelaVectorDevice => item?.type === 'VECTOR');
    return device || null;
  };

  const renameBoard = () => {
    const current = docRef.current; if (!current) return;
    const title = window.prompt('Name this Tela board', current.title)?.trim();
    if (title) dispatchOp({ type: 'SET_TITLE', title });
    setAppMenuOpen(null);
  };

  const renameActivePage = () => {
    const current = docRef.current; const frame = current?.frames.find(item => item.id === activeFrameId); if (!current || !frame) return;
    const label = window.prompt('Name this page', frame.label || 'Page')?.trim();
    if (!label) return;
    dispatchOp({ type: 'RENAME_FRAME', frameId: frame.id, label });
    setAppMenuOpen(null);
  };

  const selectAllStudioItems = () => {
    const focus = studioFocus?.device;
    if (focus?.type === 'VECTOR') setStudioSelection(focus.objects.map(object => object.id));
    if (focus?.type === 'IMAGE') setStudioSelection(focus.layers.map(layer => layer.id));
    setAppMenuOpen(null);
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
    ? (printFrame.kind === 'PAPER' ? `${printFrame.w / 96}in ${printFrame.h / 96}in` : `${printFrame.w}px ${printFrame.h}px`)
    : '8.5in 11in';

  // ── Device rendering — ONE shared code path (also used by TelaEmbed) ─────────

  const renderCtx = useMemo<RenderDeviceCtx>(() => ({
    devices: doc?.devices || {},
    dispatchOp,
    writerTexts,
    writers: writerList,
    bases: baseList,
    formulaContext,
    uid,
    onWriterSelection: setWriterSelection,
    onWriterInteraction: handleWriterInteraction,
  }), [doc?.devices, dispatchOp, writerTexts, writerList, baseList, formulaContext, handleWriterInteraction]);

  const renderDevice = (device: TelaDevice, readOnly = false) => renderTelaDevice(device, renderCtx, readOnly);

  // ── Author-in-place flying menu (canvas ↔ same menu as the embed) ────────────

  const openFlying = (ref: FlyingRef, e: { clientX: number; clientY: number }) =>
    setFlying({ ref, anchor: { x: e.clientX, y: e.clientY } });

  /** Pick a representative object for a whole frame — so the frame-chrome ✎
   *  badge can raise the right per-type tools even in Page/Board posture. */
  const frameFlyingRef = (frame: TelaFrame): FlyingRef | null => {
    const dev = doc?.devices[frame.deviceIds[0]];
    if (!dev) return null;
    if (dev.type === 'VECTOR') { const o = dev.objects.find(x => x.kind === 'TEXT') || dev.objects[0]; return o ? { kind: o.kind === 'TEXT' ? 'vector-text' : 'vector-shape', deviceId: dev.id, objectId: o.id } : null; }
    if (dev.type === 'IMAGE') { const l = [...dev.layers].reverse().find(x => x.visible) || dev.layers[dev.layers.length - 1]; return l ? { kind: 'image-layer', deviceId: dev.id, layerId: l.id } : null; }
    if (dev.type === 'WRITER') { const b = dev.blocks.find(x => blockPlainText(x)) || dev.blocks[0]; return b ? { kind: 'writer-block', deviceId: dev.id, blockId: b.id } : null; }
    if (dev.type === 'GRID') return { kind: 'grid-cell', deviceId: dev.id, cellKey: 'A1' };
    if (dev.type === 'BASE') { const r = dev.rows[0], f = dev.fields[0]; return r && f ? { kind: 'base-row', deviceId: dev.id, rowId: r.id, fieldId: f.id } : null; }
    return null;
  };

  const flyingTarget = useMemo(() => (flying && doc ? resolveFlyingTarget(doc, flying.ref) : null), [flying, doc]);

  const flyingUnlock = () => dispatchOp({ type: 'SET_LOCKED', locked: false });
  const flyingLock = async () => {
    const cur = docRef.current;
    if (!cur) return;
    setPublishing(true);
    try {
      const { doc: stamped } = await publishTelaVersion(cur);
      setDoc(stamped);
      setSaveState('saved');
      setFlying(null);
    } finally { setPublishing(false); }
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
  const menuBarButton = 'h-7 px-2.5 rounded-[7px] text-[.68rem] font-semibold transition-colors';
  const menuBarItem = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-left text-[.72rem] font-semibold text-white/78 hover:text-white hover:bg-white/[.075]';

  if (!doc) {
    return (
      <div className="flex-1 h-screen grid place-items-center text-white/30 text-sm" style={{ background: 'var(--bg-color, #070609)' }}>
        Opening Tela…
      </div>
    );
  }

  if (showHome) {
    return <>
      <input ref={fileRef} type="file" accept={`${SUPPORTED_IMPORT_ACCEPT},.csv,.xlsx,.tela`} className="hidden" onChange={e => { const file=e.target.files?.[0]; if(file)void handleImportFile(file); e.target.value=''; }}/>
      <TelaHome recent={canvasList || []} onOpen={id => void openCanvas(id)} onCreate={kind => void createHomeDocument(kind)} onChooseStyle={entry => void createStyleDocument(entry)} onChoosePublication={template => void createPublicationDocument(template)} onChooseTemplate={template => void createTemplateDocument(template)} onImport={() => fileRef.current?.click()} onBack={onBack}/>
    </>;
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
        <button onClick={() => { void refreshList(); setShowHome(true); }} className="flex items-center gap-2 pr-1" title="Tela Home">
          <span className="w-8 h-8 rounded-[10px] grid place-items-center text-white" style={{ background: 'var(--pj-grad-warm, linear-gradient(135deg,#6B0099,#D40055,#FF8C00))' }}>
            <LayoutPanelTop size={16} />
          </span>
          <span className="font-display italic text-white text-[1.05rem] leading-none select-none">Tela</span>
        </button>

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
              <button className={menuItem} onClick={addSongwritingPage}><Music2 size={15} className="text-[var(--pj-orange,#FF8C00)]" /> Songwriting page<span className="ml-auto text-[.62rem] text-white/40">Lyrics</span></button>
              <button className={menuItem} onClick={addPoetryPage}><Feather size={15} className="text-[var(--pj-magenta,#D40055)]" /> Poetry page</button>
              <button className={menuItem} onClick={() => addNotesFrame(false)}><BookHeart size={15} className="text-[var(--pj-cyan,#00DAF3)]" /> Notes & journals<span className="ml-auto text-[.62rem] text-white/40">Stack</span></button>
              <button className={menuItem} onClick={addGridSheet}><Grid3X3 size={15} className="text-[var(--pj-cyan,#00DAF3)]" /> Grid sheet</button>
              <button className={menuItem} onClick={addChartFrame}><BarChart3 size={15} className="text-[var(--pj-orange,#FF8C00)]" /> Data visualization<span className="ml-auto text-[.62rem] text-white/40">2D · 3D</span></button>
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
          accept={`${SUPPORTED_IMPORT_ACCEPT},.csv,.xlsx,.tela`}
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleImportFile(f); e.target.value = ''; }}
        />
        <input ref={assetFileRef} type="file" accept={TELA_ASSET_ACCEPT} multiple className="hidden" onChange={e => { const files = [...(e.target.files || [])]; if (files.length) void insertAssetFiles(files); e.target.value = ''; }}/>

        <button className={topBtn} onClick={exportPdf} title="Print the active frame at exact page size — save as PDF in the print dialog">
          <FileDown size={15} /> Export PDF
        </button>
        <button className={topBtn} onClick={() => doc && downloadTelaHtml(doc, activeFrameId || undefined)} title="Export the active Tela frame as a responsive standalone HTML page">
          <Monitor size={15} /> Export HTML
        </button>

        {/* Reference-embed demo — reference-not-export + lock→propagate, live */}
        <button
          className={topBtn}
          title="See this doc embedded three ways — live-editable, follow-latest, and pinned"
          onClick={() => { const cur = docRef.current; if (cur) void saveTelaDoc(cur); window.dispatchEvent(new CustomEvent('plajah:openTelaEmbedDemo', { detail: { docId: cur?.id } })); }}
        >
          <Link2 size={15} /> Embed demo
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

      {/* Desktop-class menu bar. A Tela file is the whole board; page exports target the active frame. */}
      <nav className="shrink-0 flex items-center gap-0.5 px-3 h-9 relative z-[90]" style={{ background: '#0b0810', borderBottom: '1px solid rgba(255,255,255,.075)' }}>
        {(['FILE','EDIT','INSERT','DOCUMENT','EXPORT','ASSIGNMENT'] as const).map(menu => <div key={menu} className="relative">
          <button onClick={() => setAppMenuOpen(open => open === menu ? null : menu)} className={menuBarButton} style={{ color: appMenuOpen === menu ? '#fff' : 'rgba(255,255,255,.58)', background: appMenuOpen === menu ? 'rgba(255,255,255,.09)' : 'transparent' }}>{menu[0] + menu.slice(1).toLowerCase()}</button>
          {appMenuOpen === menu && <div className="absolute left-0 top-[31px] min-w-[255px] p-1.5 rounded-[11px]" style={{ background: 'rgba(20,13,30,.985)', border: '1px solid rgba(255,255,255,.13)', boxShadow: '0 18px 55px rgba(0,0,0,.55)' }} onMouseLeave={() => setAppMenuOpen(null)}>
            {menu === 'FILE' && <>
              <div className="px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[.12em] text-white/28">Tela board · {doc.frames.length} pages</div>
              <button className={menuBarItem} onClick={() => void createCanvas()}><FilePlus2 size={14}/>New Tela board<span className="ml-auto text-[9px] text-white/25">whole file</span></button>
              <button className={menuBarItem} onClick={() => { setShowHome(true); setAppMenuOpen(null); }}><FilePlus2 size={14}/>New from template</button>
              <button className={menuBarItem} onClick={renameBoard}><Type size={14}/>Rename board</button>
              <button className={menuBarItem} onClick={renameActivePage} disabled={!activeFrame}><FileText size={14}/>Rename active page</button>
              <button className={menuBarItem} onClick={() => { setCanvasesOpen(true); void refreshList(); setAppMenuOpen(null); }}><Folder size={14}/>Open My Canvases</button>
              <button className={menuBarItem} onClick={() => { fileRef.current?.click(); setAppMenuOpen(null); }}><FileUp size={14}/>Open / import document<span className="ml-auto text-[9px] text-white/25">Ctrl+O</span></button>
              <div className="h-px my-1 bg-white/[.07]"/>
              <button className={menuBarItem} onClick={() => { void saveTelaDoc(doc).then(({ok,synced}) => setSaveState(ok ? (synced ? 'synced' : 'saved') : 'dirty')); setAppMenuOpen(null); }}><CheckCircle2 size={14}/>Save<span className="ml-auto text-[9px] text-white/25">Ctrl+S</span></button>
              <button className={menuBarItem} onClick={() => void saveAsCopy()}><CopyPlus size={14}/>Save a copy</button>
              <button className={menuBarItem} onClick={() => { downloadTelaBoard(doc); setAppMenuOpen(null); }}><FileDown size={14}/>Download Tela board<span className="ml-auto text-[9px] text-white/25">.tela</span></button>
              <div className="h-px my-1 bg-white/[.07]"/>
              <button className={menuBarItem} onClick={() => { exportPdf(); setAppMenuOpen(null); }} disabled={!activeFrame}><FileDown size={14}/>Print / save active page as PDF<span className="ml-auto text-[9px] text-white/25">Ctrl+P</span></button>
              <button className={menuBarItem} onClick={() => { void refreshList(); setShowHome(true); setAppMenuOpen(null); }}><X size={14}/>Close to Tela Home</button>
            </>}
            {menu === 'INSERT' && <>
              <div className="px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[.12em] text-white/28">Add to this Tela document</div>
              <button className={menuBarItem} onClick={() => { assetFileRef.current?.click(); setAppMenuOpen(null); }}><ImagePlus size={14}/>Media & files<span className="ml-auto text-[9px] text-white/25">multi-select</span></button>
              <button className={menuBarItem} onClick={() => { fileRef.current?.click(); setAppMenuOpen(null); }}><FileUp size={14}/>Import document, sheet, or board</button>
              <div className="h-px my-1 bg-white/[.07]"/>
              <button className={menuBarItem} onClick={() => { addWriterPage(); setAppMenuOpen(null); }}><Type size={14}/>Writer page</button>
              <button className={menuBarItem} onClick={() => { addGridSheet(); setAppMenuOpen(null); }}><Grid3X3 size={14}/>Grid sheet</button>
              <button className={menuBarItem} onClick={() => { addVectorArtboard(); setAppMenuOpen(null); }}><Shapes size={14}/>Vector artboard</button>
              <button className={menuBarItem} onClick={() => { addImageCanvas(); setAppMenuOpen(null); }}><ImageIcon size={14}/>Image canvas</button>
              <div className="px-3 py-2 text-[9px] leading-relaxed text-white/35">Images · audio · video · PDF · 3D · fonts · archives · other files</div>
            </>}
            {menu === 'DOCUMENT' && <>
              <div className="px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[.12em] text-white/28">{activeFrame?.label || 'No active page'}</div>
              <button className={menuBarItem} onClick={renameActivePage} disabled={!activeFrame}><Type size={14}/>Page name</button>
              <div className="px-3 pt-2 pb-1 text-[9px] font-extrabold uppercase tracking-[.12em] text-white/28">Page standard</div>
              {(['LETTER','A4','BOOKLET','SIGNAGE_1080x1920','PHONE','SQUARE','FREE'] as TelaFramePreset[]).map(preset => <button key={preset} className={menuBarItem} disabled={!activeFrame} onClick={() => { if (activeFrame) dispatchOp({ type: 'SET_FRAME_PRESET', frameId: activeFrame.id, preset }); setAppMenuOpen(null); }} style={{ color: activeFrame?.preset === preset ? '#8FF5FF' : undefined }}>{PRESETS[preset].label}{activeFrame?.preset === preset && <CheckCircle2 size={12} className="ml-auto"/>}</button>)}
              <div className="h-px my-1 bg-white/[.07]"/>
              {(['PORTRAIT','LANDSCAPE'] as const).map(orientation => <button key={orientation} className={menuBarItem} disabled={!activeFrame} onClick={() => { if (activeFrame) dispatchOp({ type: 'SET_FRAME_ORIENTATION', frameId: activeFrame.id, orientation }); setAppMenuOpen(null); }} style={{ color: (activeFrame?.orientation || (activeFrame && activeFrame.h >= activeFrame.w ? 'PORTRAIT' : 'LANDSCAPE')) === orientation ? '#D0BCFF' : undefined }}><LayoutPanelTop size={14} style={{ transform: orientation === 'LANDSCAPE' ? 'rotate(90deg)' : undefined }}/>{orientation[0] + orientation.slice(1).toLowerCase()}</button>)}
            </>}
            {menu === 'EDIT' && <>
              <button className={menuBarItem} onClick={selectAllStudioItems} disabled={!studioFocus}><Scan size={14}/>Select all objects/layers<span className="ml-auto text-[9px] text-white/25">Ctrl+A</span></button>
              <div className="px-3 py-1 text-[9px] text-white/32">Hold Shift while clicking to add or remove items.</div>
              <button className={menuBarItem} disabled={!studioSelIds.length} onClick={() => {
                const focus = studioFocus?.device; if (!focus) return;
                if (focus.type === 'VECTOR') { const made = studioSelIds.map(id => focus.objects.find(object => object.id === id)).filter((object): object is TelaVectorObject => !!object).map(object => duplicateVectorObject(focus.id, object).id); setStudioSelection(made); }
                else { const made = studioSelIds.map(id => focus.layers.find(layer => layer.id === id)).filter((layer): layer is TelaImageLayer => !!layer).map(layer => duplicateImageLayer(focus.id, layer).id); setStudioSelection(made); }
                setAppMenuOpen(null);
              }}><CopyPlus size={14}/>Duplicate selection</button>
              <button className={menuBarItem} disabled={!studioSelIds.length} onClick={() => { const focus = studioFocus?.device; if (focus?.type === 'VECTOR') studioSelIds.forEach(objectId => dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: focus.id, objectId })); if (focus?.type === 'IMAGE') studioSelIds.forEach(layerId => dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: focus.id, layerId })); setStudioSel(null); setAppMenuOpen(null); }} style={{ color: '#FF8FA8' }}><Trash2 size={14}/>Delete selection</button>
            </>}
            {menu === 'EXPORT' && <>
              <div className="px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[.12em] text-white/28">Active page · {activeFrame?.label || 'none'}</div>
              <button className={menuBarItem} onClick={() => { exportPdf(); setAppMenuOpen(null); }} disabled={!activeFrame}><FileDown size={14}/>Export page as PDF</button>
              <button className={menuBarItem} onClick={() => { if (activeFrame) downloadTelaHtml(doc, activeFrame.id); setAppMenuOpen(null); }} disabled={!activeFrame}><Monitor size={14}/>Export page as HTML</button>
              <button className={menuBarItem} onClick={() => { if (activeFrame) downloadTelaPage(doc, activeFrame); setAppMenuOpen(null); }} disabled={!activeFrame}><FileDown size={14}/>Export editable page data<span className="ml-auto text-[9px] text-white/25">JSON</span></button>
              {activeVectorDevice() && <><button className={menuBarItem} onClick={() => { const vector = activeVectorDevice(); if (vector) downloadTelaVectorSvg(vector, activeFrame?.label || doc.title); setAppMenuOpen(null); }}><Shapes size={14}/>Export vector page<span className="ml-auto text-[9px] text-white/25">SVG</span></button><button className={menuBarItem} onClick={() => { const vector = activeVectorDevice(); if (vector) void downloadTelaVectorPng(vector, activeFrame?.label || doc.title); setAppMenuOpen(null); }}><ImageIcon size={14}/>Export rendered page<span className="ml-auto text-[9px] text-white/25">PNG</span></button></>}
              <div className="h-px my-1 bg-white/[.07]"/>
              <button className={menuBarItem} onClick={() => { downloadTelaBoard(doc); setAppMenuOpen(null); }}><LayoutPanelTop size={14}/>Export whole Tela board<span className="ml-auto text-[9px] text-white/25">.tela</span></button>
            </>}
            {menu === 'ASSIGNMENT' && <>
              <div className="px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[.12em] text-white/28">{assignmentFields.length} interactive questions</div>
              <button className={menuBarItem} onClick={runAssignmentAutoFormat} disabled={!activeFrame}><Sparkles size={14}/>Auto Format as Plajah Plus<span className="ml-auto text-[9px] text-white/25">align + build</span></button>
              <button className={menuBarItem} onClick={undoAssignmentAutoFormat} disabled={!autoFormatUndo}><ChevronLeft size={14}/>Undo Auto Format</button>
              <div className="h-px my-1 bg-white/[.07]"/>
              <button className={menuBarItem} onClick={() => { openAssignmentBuilder(); setAppMenuOpen(null); }}><CircleHelp size={14}/>Turn selection into question</button>
              <button className={menuBarItem} onClick={() => { const vector = studioFocus?.device.type === 'VECTOR' ? studioFocus.device : null; const source = vector?.objects.find(object => object.id === studioSel); if (vector && source) dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: vector.id, objectId: source.id, patch: { semanticRole: 'INSTRUCTION', objectLabel: `Instruction · ${source.text || source.objectLabel || 'Instructions'}`, fill: '#5A4769', fontWeight: 650 } }); setAppMenuOpen(null); }} disabled={studioFocus?.device.type !== 'VECTOR' || !studioSel}><TextQuote size={14}/>Mark selected text as instruction</button>
              <button className={menuBarItem} onClick={() => { if (assignmentFields[0]) selectAssignmentField(assignmentFields[0].id); setAppMenuOpen(null); }} disabled={!assignmentFields.length}><CheckCircle2 size={14}/>Review assignment properties</button>
              <div className="px-3 pt-2 pb-1 text-[9px] font-extrabold uppercase tracking-[.12em] text-white/28">Preview feedback as</div>
              {(['STUDENT','TEACHER','PARENT'] as TelaAssignmentAudienceRole[]).map(role => <button key={role} className={menuBarItem} onClick={() => { setAssignmentFormsPreviewRole(role); setAppMenuOpen(null); }} style={{ color: assignmentPreviewRole === role ? '#8FF5FF' : undefined }}>{role[0] + role.slice(1).toLowerCase()}{assignmentPreviewRole === role && <CheckCircle2 size={12} className="ml-auto"/>}</button>)}
            </>}
          </div>}
        </div>)}
        <span className="ml-auto text-[9px] text-white/24 truncate max-w-[38vw]">Board: {doc.title} · Active page: {activeFrame?.label || 'none'}</span>
      </nav>

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
        const printMargin = 24; // 0.25in at Tela's 96dpi document scale
        const videoActionX = focus.width * .05, videoActionY = focus.height * .05;
        const videoTitleX = focus.width * .10, videoTitleY = focus.height * .10;
        const printTargetsX = studioSafeArea === 'PRINT' || studioSafeArea === 'BOTH' ? [printMargin, focus.width - printMargin] : [];
        const printTargetsY = studioSafeArea === 'PRINT' || studioSafeArea === 'BOTH' ? [printMargin, focus.height - printMargin] : [];
        const videoTargetsX = studioSafeArea === 'VIDEO' || studioSafeArea === 'BOTH' ? [videoActionX, focus.width - videoActionX, videoTitleX, focus.width - videoTitleX] : [];
        const videoTargetsY = studioSafeArea === 'VIDEO' || studioSafeArea === 'BOTH' ? [videoActionY, focus.height - videoActionY, videoTitleY, focus.height - videoTitleY] : [];
        const snapTargets = {
          enabled: studioSnap, threshold: 7 / studioZoom,
          x: [...new Set([0, focus.width / 2, focus.width, ...studioGuides.x, ...printTargetsX, ...videoTargetsX])],
          y: [...new Set([0, focus.height / 2, focus.height, ...studioGuides.y, ...printTargetsY, ...videoTargetsY])],
        };
        const xTicks = rulerTicks(focus.width, studioUnit), yTicks = rulerTicks(focus.height, studioUnit);
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
                ? <>{STUDIO_VEC_TOOLS.map(t => (
                    <button key={t.id} title={t.label} style={railBtn(studioTool === t.id)} onClick={() => setStudioTool(t.id)}>{t.icon}</button>
                  ))}<div className="w-7 my-1" style={{ borderTop:'1px solid rgba(255,255,255,.1)' }}/><button title="Turn selected text into an interactive question" style={railBtn(assignmentBuilderOpen)} onClick={() => openAssignmentBuilder()}><CircleHelp size={17}/></button><button title="Shapes and design templates" style={railBtn(studioCreativeLibraryOpen)} onClick={() => setStudioCreativeLibraryOpen(true)}><Shapes size={17}/></button></>
                : (
                  <>
                    <button title="Select / move" style={railBtn(true)} onClick={() => {}}><MousePointer2 size={17} /></button>
                    <button title="Upload image layer" style={railBtn(false)} disabled={studioImgBusy} onClick={() => studioFileRef.current?.click()}>{studioImgBusy ? <Loader2 size={17} className="animate-spin" /> : <ImagePlus size={17} />}</button>
                    <button title="Open Lorea pressure paint engine" style={railBtn(studioPaintOpen)} onClick={() => setStudioPaintOpen(true)}><Brush size={17}/></button>
                    <button title="Build assignment properties" style={railBtn(assignmentBuilderOpen)} onClick={() => openAssignmentBuilder()}><CircleHelp size={17}/></button>
                    <button title="Design templates" style={railBtn(studioCreativeLibraryOpen)} onClick={() => setStudioCreativeLibraryOpen(true)}><Shapes size={17}/></button>
                  </>
                )}
            </div>

            {/* Center stage — rulers + artboard */}
            <div className="flex-1 relative overflow-auto" style={{ background: '#141318' }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} onDrop={event => { const files = [...event.dataTransfer.files]; if (!files.length) return; event.preventDefault(); const visual = files.filter(file => file.type.startsWith('image/') || isVectorFile(file)); const other = files.filter(file => !visual.includes(file)); visual.forEach(file => { if (isVec) void studioAddVectorFile(vec!, file); else void studioAddImageFile(img!.id, file); }); if (other.length) void insertAssetFiles(other); }} onWheel={event => { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); setStudioZoom(value => Math.max(.1, Math.min(4, value * (event.deltaY > 0 ? .9 : 1.1)))); }}>
              {/* Studio top-strip */}
              <div className="sticky top-0 z-20 flex items-center gap-2 px-3 h-9 overflow-x-auto custom-scrollbar" style={{ background: 'rgba(11,10,16,0.96)', borderBottom: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
                <span className="text-[.72rem] font-bold text-white/80">{focus.name || (isVec ? 'Artboard' : 'Image')}</span>
                <span className="text-[.64rem] font-semibold text-white/35">{isVec ? 'Vector' : 'Image'} · {focus.width}×{focus.height}</span>
                <button onClick={() => setStudioSnap(value => !value)} className="h-7 px-2 rounded-[8px] text-[.62rem] font-extrabold" style={{ color: studioSnap ? '#8ff5ff' : 'rgba(255,255,255,.42)', background: studioSnap ? 'rgba(0,218,243,.12)' : 'rgba(255,255,255,.045)', border: studioSnap ? '1px solid rgba(0,218,243,.35)' : '1px solid rgba(255,255,255,.08)' }}>Snap {studioSnap ? 'on' : 'off'}</button>
                <select aria-label="Ruler unit" value={studioUnit} onChange={event => setStudioUnit(event.target.value as StudioUnit)} className="h-7 px-2 rounded-[8px] text-[.62rem] font-bold text-white/65 outline-none" style={{ background: '#17131d', border: '1px solid rgba(255,255,255,.1)' }}><option value="PX">Pixels</option><option value="IN">Inches</option><option value="MM">Millimetres</option><option value="CM">Centimetres</option></select>
                <select aria-label="Safe area guides" value={studioSafeArea} onChange={event => setStudioSafeArea(event.target.value as StudioSafeArea)} className="h-7 px-2 rounded-[8px] text-[.62rem] font-bold text-white/65 outline-none" style={{ background: '#17131d', border: '1px solid rgba(255,255,255,.1)' }}><option value="NONE">No safe margins</option><option value="PRINT">Print safe</option><option value="VIDEO">Video safe</option><option value="BOTH">Print + video safe</option></select>
                <div className="ml-auto flex items-center gap-1"><button onClick={() => setStudioZoom(value => Math.max(.1, value / 1.2))} className="w-7 h-7 rounded-[8px] text-white/60 bg-white/[.045]">−</button><button onClick={() => setStudioZoom(1)} className="min-w-[48px] h-7 px-1 rounded-[8px] text-[.62rem] font-extrabold text-white/65 bg-white/[.045]">{Math.round(studioZoom * 100)}%</button><button onClick={() => setStudioZoom(value => Math.min(4, value * 1.2))} className="w-7 h-7 rounded-[8px] text-white/60 bg-white/[.045]">+</button></div>
                <span className="text-[.62rem] text-white/30">{isVec ? `${vec!.objects.length} objects` : `${img!.layers.length} layers`}</span>
              </div>
              <div style={{ minWidth: focus.width * studioZoom + 96, minHeight: focus.height * studioZoom + 116, padding: '28px 42px 56px 28px', display: 'grid', placeItems: 'start center' }}>
                <div style={{ position: 'relative', paddingTop: 22, paddingLeft: 22 }}>
                  {/* Click a ruler to drop a guide; double-click a guide to remove it. */}
                  <div title="Click to add a vertical guide" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); const x = Math.max(0, Math.min(focus.width, (event.clientX - rect.left) / studioZoom)); setStudioGuides(guides => ({ ...guides, x: [...guides.x, x] })); }} style={{ position: 'absolute', left: 22, top: 0, width: focus.width * studioZoom, height: 22, overflow: 'hidden', background: '#0b0a10', borderBottom: '1px solid rgba(255,255,255,.12)', cursor: 's-resize' }}>{xTicks.map(tick => <span key={tick.at} style={{ position: 'absolute', left: tick.at * studioZoom, bottom: 0, height: tick.major ? 12 : 6, borderLeft: `1px solid rgba(255,255,255,${tick.major ? .38 : .17})` }}>{tick.label && <span style={{ position: 'absolute', left: 3, top: -8, whiteSpace: 'nowrap', color: 'rgba(255,255,255,.44)', fontSize: 8, fontWeight: 700 }}>{tick.label}</span>}</span>)}</div>
                  <div title="Click to add a horizontal guide" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); const y = Math.max(0, Math.min(focus.height, (event.clientY - rect.top) / studioZoom)); setStudioGuides(guides => ({ ...guides, y: [...guides.y, y] })); }} style={{ position: 'absolute', left: 0, top: 22, width: 22, height: focus.height * studioZoom, overflow: 'hidden', background: '#0b0a10', borderRight: '1px solid rgba(255,255,255,.12)', cursor: 'e-resize' }}>{yTicks.map(tick => <span key={tick.at} style={{ position: 'absolute', top: tick.at * studioZoom, right: 0, width: tick.major ? 12 : 6, borderTop: `1px solid rgba(255,255,255,${tick.major ? .38 : .17})` }}>{tick.label && <span style={{ position: 'absolute', right: 4, top: 2, color: 'rgba(255,255,255,.44)', fontSize: 7, fontWeight: 700, writingMode: 'vertical-rl' }}>{tick.label}</span>}</span>)}</div>
                  <div style={{ position: 'relative', width: focus.width * studioZoom, height: focus.height * studioZoom, borderRadius: 3, boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, width: focus.width, height: focus.height, transform: `scale(${studioZoom})`, transformOrigin: '0 0', overflow: 'hidden', borderRadius: 3 }}>
                  {isVec && vec!.objects.length > 500 ? (
                    <div className="grid place-items-center text-center p-8" style={{ width: Math.min(vec!.width, 720), minHeight: 420, background: '#fff' }}><div className="max-w-[430px]"><div className="mx-auto grid place-items-center w-12 h-12 rounded-[14px] text-white" style={{ background: 'var(--pj-grad-spatial,linear-gradient(135deg,#6B0099,#00DAF3))' }}><Sparkles size={21}/></div><h3 className="mt-4 font-display italic text-[#1B1523] text-[1.25rem]">This legacy trace needs consolidation</h3><p className="mt-2 text-[.76rem] leading-relaxed text-[#1B1523]/55">Tela found {vec!.objects.length.toLocaleString()} microscopic paths from the earlier tracer. Consolidate them before previewing so the browser is not forced to render thousands of invisible layers.</p><button className="mt-4 h-9 px-5 rounded-[10px] text-[.72rem] font-extrabold text-white" style={{ background: 'var(--pj-grad-brand,linear-gradient(135deg,#6B0099,#D40055))' }} onClick={() => dispatchOp({ type: 'REPLACE_VECTOR_OBJECTS', deviceId: vec!.id, objects: consolidateTelaTraceObjects(vec!.objects) })}>Consolidate and preview</button></div></div>
                  ) : isVec ? (
                    <TelaVector
                      device={vec!} chrome={false}
                      tool={studioTool} onToolChange={setStudioTool}
                      selectedId={studioSel}
                      selectedIds={studioSelIds} onSelectionChange={setStudioSelection}
                      writerTexts={writerTexts} writers={writerList}
                      onAddObject={object => dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: focus.id, object })}
                      onUpdateObject={(objectId, patch) => dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: focus.id, objectId, patch })}
                      onDeleteObject={objectId => dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: focus.id, objectId })}
                      onReorder={(objectId, toIndex) => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: focus.id, objectId, toIndex })}
                      onObjectContextMenu={(event, object) => vectorContextMenu.openAt(event.clientX, event.clientY, { deviceId: focus.id, object })}
                      objectContextBindings={object => vectorContextMenu.bind({ deviceId: focus.id, object })}
                      snap={snapTargets}
                    />
                  ) : (
                    <TelaImage
                      device={img!} chrome={false}
                      selectedId={studioSel}
                      selectedIds={studioSelIds} onSelectionChange={setStudioSelection}
                      onAddLayer={layer => dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId: focus.id, layer })}
                      onUpdateLayer={(layerId, patch) => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: focus.id, layerId, patch })}
                      onDeleteLayer={layerId => dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: focus.id, layerId })}
                      onReorder={(layerId, toIndex) => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: focus.id, layerId, toIndex })}
                      onLayerContextMenu={(event, layer) => imageContextMenu.openAt(event.clientX, event.clientY, { deviceId: focus.id, layer })}
                      layerContextBindings={layer => imageContextMenu.bind({ deviceId: focus.id, layer })}
                      interactionScale={studioZoom} snap={snapTargets}
                    />
                  )}
                      {(studioSafeArea === 'PRINT' || studioSafeArea === 'BOTH') && <div style={{ position: 'absolute', inset: printMargin, border: '1px dashed rgba(212,0,85,.78)', pointerEvents: 'none', zIndex: 12 }}><span style={{ position: 'absolute', left: 4, top: 3, color: '#D40055', fontSize: 8, fontWeight: 850 }}>PRINT SAFE · 0.25″</span></div>}
                      {(studioSafeArea === 'VIDEO' || studioSafeArea === 'BOTH') && <><div style={{ position: 'absolute', left: videoActionX, right: videoActionX, top: videoActionY, bottom: videoActionY, border: '1px dashed rgba(0,218,243,.8)', pointerEvents: 'none', zIndex: 12 }}><span style={{ position: 'absolute', left: 4, top: 3, color: '#00A8BC', fontSize: 8, fontWeight: 850 }}>ACTION SAFE</span></div><div style={{ position: 'absolute', left: videoTitleX, right: videoTitleX, top: videoTitleY, bottom: videoTitleY, border: '1px dashed rgba(255,138,0,.8)', pointerEvents: 'none', zIndex: 12 }}><span style={{ position: 'absolute', left: 4, top: 3, color: '#E76F00', fontSize: 8, fontWeight: 850 }}>TITLE SAFE</span></div></>}
                      {studioGuides.x.map((x, index) => <div key={`x${index}`} title="Double-click to remove guide" onDoubleClick={() => setStudioGuides(guides => ({ ...guides, x: guides.x.filter((_, i) => i !== index) }))} style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: 5, marginLeft: -2, borderLeft: '1px solid #00DAF3', cursor: 'col-resize', zIndex: 14 }}/>) }
                      {studioGuides.y.map((y, index) => <div key={`y${index}`} title="Double-click to remove guide" onDoubleClick={() => setStudioGuides(guides => ({ ...guides, y: guides.y.filter((_, i) => i !== index) }))} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 5, marginTop: -2, borderTop: '1px solid #00DAF3', cursor: 'row-resize', zIndex: 14 }}/>) }
                    </div>
                  </div>
                </div>
              </div>
              <input ref={studioFileRef} type="file" accept="image/*,video/*,.svg,.ai,.pdf,.webp,.avif,.gif,.bmp,.tif,.tiff,.lottie,.json,.abr,.csh,.ase" multiple className="hidden" onChange={e => { const files = [...(e.target.files || [])]; if (img) files.forEach(file => void studioAddImageFile(img.id, file)); e.target.value = ''; }} />
            </div>

            {/* Right — Layers panel */}
            <div className="shrink-0 hidden md:flex flex-col min-h-0" style={{ width: 248, borderLeft: '1px solid rgba(255,255,255,0.08)', background: '#0e0d14' }}>
              <div className="flex items-center gap-2 px-3.5 h-9 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span className={panelLbl}>Layers</span>
                {studioSelIds.length > 1 && <span className="ml-auto text-[9px] font-extrabold text-[var(--pj-cyan,#00DAF3)]">{studioSelIds.length} selected</span>}
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
                  <button title="Download once, then rebuild text and objects locally" onClick={() => void studioIntelligentRebuild(img)} disabled={studioAiBusy || img.layers.length === 0} className="flex items-center justify-center gap-1.5 h-9 rounded-[10px] text-[.7rem] font-extrabold text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#6B0099 0%,#D40055 52%,#FF8A00 100%)' }}>
                    {studioAiBusy ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>} {studioAiBusy ? (studioAiProgress?.message || 'Rebuilding…') : isTelaDocumentModelInstalled() ? 'Intelligent rebuild · on device' : 'Install intelligent rebuild · ~300 MB'}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <select value={studioTracePreset} onChange={e => setStudioTracePreset(e.target.value as TelaTracePreset)} className="flex-1 min-w-0 h-8 px-2 rounded-[9px] text-[.69rem] text-white/80 outline-none" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)' }}>
                      <option value="LINE_ART">Line art · smallest</option><option value="LOGO">Shapes · balanced</option><option value="DETAILED">Detailed · more paths</option>
                    </select>
                    <button title="Trace selected bitmap into editable Tela spline paths" onClick={() => void studioTraceImage(img)} disabled={studioTraceBusy || img.layers.length === 0} className="flex items-center justify-center gap-1 w-[88px] h-8 rounded-[9px] text-[.68rem] font-bold text-white disabled:opacity-40" style={{ background: 'var(--pj-grad-spatial, linear-gradient(135deg,#6B0099,#00DAF3))' }}>
                      {studioTraceBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Trace
                    </button>
                  </div>
                </div>
              )}

              {/* The list + selected props */}
              <div className="flex-1 overflow-y-auto custom-scrollbar px-2.5 py-2.5">
                {studioSelIds.length > 1 && <div className="mb-3 p-3 rounded-[12px]" style={{ background: 'rgba(0,218,243,.065)', border: '1px solid rgba(0,218,243,.2)' }}>
                  <div className="text-[.7rem] font-extrabold text-[#8FF5FF]">Shift selection · {studioSelIds.length} items</div>
                  <div className="mt-1 text-[.6rem] leading-relaxed text-white/42">Drag any selected item to move the selection together.</div>
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    <button onClick={() => {
                      if (isVec) { const made = studioSelIds.map(id => vec!.objects.find(object => object.id === id)).filter((object): object is TelaVectorObject => !!object).map(object => duplicateVectorObject(vec!.id, object).id); setStudioSelection(made); }
                      else { const made = studioSelIds.map(id => img!.layers.find(layer => layer.id === id)).filter((layer): layer is TelaImageLayer => !!layer).map(layer => duplicateImageLayer(img!.id, layer).id); setStudioSelection(made); }
                    }} className="h-8 rounded-[8px] text-[9px] font-extrabold text-white/75 bg-white/[.06]"><CopyPlus size={11} className="inline mr-1"/>Duplicate</button>
                    {img && <button onClick={() => { const groupId = uid('group'); dispatchOp({ type: 'ADD_IMAGE_GROUP', deviceId: img.id, group: { id: groupId, name: `Group ${Math.max(1, (img.groups?.length || 0) + 1)}`, visible: true, opacity: 1, blend: 'normal' } }); studioSelIds.forEach(layerId => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: img.id, layerId, patch: { groupId } })); }} className="h-8 rounded-[8px] text-[9px] font-extrabold text-white/75 bg-white/[.06]">Group layers</button>}
                    <button onClick={() => { if (isVec) studioSelIds.forEach(objectId => dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: vec!.id, objectId })); else studioSelIds.forEach(layerId => dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: img!.id, layerId })); setStudioSel(null); }} className={`${img ? 'col-span-2' : ''} h-8 rounded-[8px] text-[9px] font-extrabold text-[#FF8FA8] bg-[rgba(212,0,85,.08)]`}><Trash2 size={11} className="inline mr-1"/>Delete selected</button>
                  </div>
                </div>}
                {isVec && (
                  <>
                    {vec!.objects.length === 0 && <div className="px-1 py-2 text-[.72rem] text-white/35">Empty artboard — pick a tool and draw.</div>}
                    {vec!.objects.length > 500 && !vec!.objects.some(object => object.reconstructionLayer) && <div className="mb-3 p-3 rounded-[12px]" style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)' }}><div className="text-[.74rem] font-extrabold text-amber-200">Legacy trace detected</div><div className="mt-1 text-[.66rem] leading-relaxed text-white/50">{vec!.objects.length.toLocaleString()} microscopic paths were created before reconstruction review existed.</div><button className="mt-2 w-full h-8 rounded-[9px] text-[.68rem] font-extrabold text-white" style={{ background: 'var(--pj-grad-spatial,linear-gradient(135deg,#6B0099,#00DAF3))' }} onClick={() => { dispatchOp({ type: 'REPLACE_VECTOR_OBJECTS', deviceId: vec!.id, objects: consolidateTelaTraceObjects(vec!.objects) }); setStudioSel(null); }}>Consolidate into editable layers</button></div>}
                    {(vec!.objects.length > 500 && !vec!.objects.some(object => object.reconstructionLayer) ? [] : vec!.objects).map((o, idx) => ({ o, idx })).reverse().map(({ o, idx }) => {
                      const sel = studioSel === o.id;
                      const bound = o.kind === 'TEXT' && o.boundWriterDeviceId;
                      const sw = o.fill !== 'none' ? o.fill : (o.stroke !== 'none' ? o.stroke : '#888');
                      return (
                        <div key={o.id} {...vectorContextMenu.bind({ deviceId: focus.id, object: o })} onClick={event => setStudioSelection(event.shiftKey ? (studioSelIds.includes(o.id) ? studioSelIds.filter(id => id !== o.id) : [...studioSelIds, o.id]) : [o.id])} className="flex items-center gap-2 px-2 py-1.5 mb-0.5 rounded-[8px] cursor-pointer" style={{ background: studioSelIds.includes(o.id) ? 'rgba(255,255,255,0.09)' : 'transparent', border: studioSelIds.includes(o.id) ? `1px solid ${o.id === studioSel ? 'rgba(212,0,85,.5)' : 'rgba(0,218,243,.28)'}` : '1px solid transparent' }}>
                          <span className="w-4 h-4 rounded-[4px] shrink-0" style={{ background: sw, border: '1px solid rgba(255,255,255,0.2)' }} />
                          <span className="flex-1 min-w-0 text-[.74rem] text-white/85 truncate">{o.kind === 'TEXT' ? (o.text || 'Text') : o.objectLabel || o.kind[0] + o.kind.slice(1).toLowerCase()}</span>
                          {o.reconstructionLayer && <span className="shrink-0 text-[7px] font-extrabold tracking-[.08em] text-white/32">{o.reconstructionLayer}</span>}
                          {bound && <Link2 size={11} className="shrink-0 text-[var(--pj-cyan,#00DAF3)]" />}
                          <button title="Bring forward" onClick={e => { e.stopPropagation(); dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: focus.id, objectId: o.id, toIndex: idx + 1 }); }} className="grid place-items-center w-4 h-5 text-white/45 hover:text-white"><Plus size={11} /></button>
                          <button title="Delete" onClick={e => { e.stopPropagation(); dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: focus.id, objectId: o.id }); if (studioSel === o.id) setStudioSel(null); }} className="grid place-items-center w-4 h-5 text-white/35 hover:text-[var(--pj-danger,#EF4444)]"><Trash2 size={11} /></button>
                        </div>
                      );
                    })}
                    {vec!.objects.find(o => o.id === studioSel) && (
                      <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <div className="flex items-center mb-2">
                          <div className={panelLbl}>{vec!.objects.find(o => o.id === studioSel)!.kind}</div>
                          <button
                            title="Author in place — flying menu"
                            onClick={e => { const o = vec!.objects.find(x => x.id === studioSel)!; openFlying({ kind: o.kind === 'TEXT' ? 'vector-text' : 'vector-shape', deviceId: focus.id, objectId: o.id }, e); }}
                            className="ml-auto grid place-items-center w-6 h-6 rounded-[7px] text-white/45 hover:text-[var(--pj-cyan,#00DAF3)] hover:bg-white/[0.06]"
                          >
                            <PenLine size={13} />
                          </button>
                        </div>
                        <TelaVectorObjectProps
                          object={vec!.objects.find(o => o.id === studioSel)!}
                          writers={writerList}
                          onUpdate={patch => dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: focus.id, objectId: studioSel!, patch })}
                          onDelete={() => { dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: focus.id, objectId: studioSel! }); setStudioSel(null); }}
                          onForward={() => { const i = vec!.objects.findIndex(o => o.id === studioSel); dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: focus.id, objectId: studioSel!, toIndex: i + 1 }); }}
                          onBack={() => { const i = vec!.objects.findIndex(o => o.id === studioSel); dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: focus.id, objectId: studioSel!, toIndex: i - 1 }); }}
                          compact
                        />
                        {vec!.objects.find(o => o.id === studioSel)?.kind === 'TEXT' && <button onClick={() => { const object = vec!.objects.find(item => item.id === studioSel)!; openAssignmentBuilder({ prompt: object.text || object.objectLabel || '', vectorDeviceId: vec!.id, vectorObjectId: object.id }); }} className="mt-3 w-full flex items-center justify-center gap-1.5 h-9 rounded-[10px] text-[.7rem] font-extrabold text-white" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)' }}><CircleHelp size={14}/>{vec!.objects.find(o => o.id === studioSel)?.assignmentFieldId ? 'Edit question properties' : 'Make interactive question'}</button>}
                        {vec!.objects.find(o => o.id === studioSel)?.kind === 'IMAGE' && (() => { const selectedObject = vec!.objects.find(o => o.id === studioSel)!; return <button onClick={() => void refineSelectedRegion(vec!, selectedObject)} disabled={studioMaskBusy} className="mt-3 w-full flex items-center justify-center gap-1.5 h-9 rounded-[10px] text-[.7rem] font-extrabold text-white disabled:opacity-40" style={{ background: 'var(--pj-grad-spatial,linear-gradient(135deg,#6B0099,#00DAF3))' }}>{studioMaskBusy ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>} {studioMaskBusy ? (studioAiProgress?.message || 'Refining…') : `Refine object edge · ${Math.round(TELA_SEGMENT_MODEL.approximateBytes / 1048576)} MB`}</button>; })()}
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
                        onSelect={event => setStudioSelection(event.shiftKey ? (studioSelIds.includes(l.id) ? studioSelIds.filter(id => id !== l.id) : [...studioSelIds, l.id]) : [l.id])}
                        onContextMenu={e => imageContextMenu.openAt(e.clientX, e.clientY, { deviceId: focus.id, layer: l })}
                        onToggle={() => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: focus.id, layerId: l.id, patch: { visible: !l.visible } })}
                        onForward={() => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: focus.id, layerId: l.id, toIndex: idx + 1 })}
                        onBack={() => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: focus.id, layerId: l.id, toIndex: idx - 1 })}
                        onDelete={() => { dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: focus.id, layerId: l.id }); if (studioSel === l.id) setStudioSel(null); }}
                      />
                    ))}
                    {img.layers.find(l => l.id === studioSel) && (
                      <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <div className="flex items-center mb-2">
                          <div className={panelLbl}>Layer</div>
                          <button
                            title="Author in place — flying menu"
                            onClick={e => openFlying({ kind: 'image-layer', deviceId: focus.id, layerId: studioSel! }, e)}
                            className="ml-auto grid place-items-center w-6 h-6 rounded-[7px] text-white/45 hover:text-[var(--pj-cyan,#00DAF3)] hover:bg-white/[0.06]"
                          >
                            <PenLine size={13} />
                          </button>
                        </div>
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
          onDragEnter={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setAssetDropActive(true); } }}
          onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setAssetDropActive(true); } }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setAssetDropActive(false); }}
          onDrop={event => { const files = [...event.dataTransfer.files]; if (!files.length) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); void insertAssetFiles(files, { x: (event.clientX - rect.left - cam.x) / cam.z, y: (event.clientY - rect.top - cam.y) / cam.z }); }}
        >
          {assetDropActive && <div className="absolute inset-3 z-[85] pointer-events-none grid place-items-center rounded-[22px]" style={{ border: '2px dashed #D0BCFF', background: 'rgba(30,12,46,.78)', backdropFilter: 'blur(5px)', boxShadow: 'inset 0 0 80px rgba(107,0,153,.25)' }}><div className="text-center text-white"><FileUp size={42} className="mx-auto mb-3 text-[var(--pj-lilac,#D0BCFF)]"/><div className="text-lg font-black">Drop assets into Tela</div><div className="mt-1 text-xs text-white/55">Images, audio, video, 3D models, PDFs, fonts, archives, and more</div></div></div>}
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
              const positionedForm = frame.deviceIds.map(id => doc.devices[id]).find((device): device is TelaFormDevice => device?.type === 'FORM' && device.presentation === 'POSITIONED');
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
                    {/* Author-in-place ✎ — raises the flying menu (additive to
                        select/drag; never interferes). */}
                    <button
                      title="Edit in place — flying menu"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); const ref = frameFlyingRef(frame); if (ref) openFlying(ref, e); }}
                      className="ml-auto grid place-items-center w-5 h-5 rounded text-white/35 hover:text-[var(--pj-cyan,#00DAF3)]"
                    >
                      <PenLine size={12} />
                    </button>
                    <button
                      title="Delete frame"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => {
                        dispatchOp({ type: 'DELETE_FRAME', frameId: frame.id });
                        if (activeFrameId === frame.id) setActiveFrameId(null);
                      }}
                      className="grid place-items-center w-5 h-5 rounded text-white/35 hover:text-[var(--pj-danger,#EF4444)]"
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
                      display: positionedForm ? 'block' : 'flex', flexDirection: 'column', position: 'relative',
                    }}
                  >
                    {frame.deviceIds.map(id => {
                      const dev = doc.devices[id];
                      if (!dev) return null;
                      if (positionedForm && dev.type === 'BASE') return null;
                      const positionedLayer = positionedForm && (dev.id === positionedForm.pageDeviceId || dev.id === positionedForm.id);
                      return (
                        <div key={id} style={positionedLayer ? { position: 'absolute', inset: 0, zIndex: dev.id === positionedForm.id ? 3 : 1, minHeight: 0 } : { flex: 1, minHeight: 0 }}>
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

      {assignmentBuilderOpen && createPortal(
        <TelaAssignmentBuilder
          prompt={assignmentEditingField?.interaction?.prompt || assignmentSource.prompt}
          sourceLabel={assignmentSource.writer ? 'Writer text selection' : assignmentSource.vectorObjectId ? 'Selected Studio text object' : activeFrame?.label || doc.title}
          source={assignmentSourceRef()}
          editingField={assignmentEditingField}
          fields={assignmentFields}
          previewRole={assignmentPreviewRole}
          layoutMatch={assignmentLayoutMatch}
          onClose={() => { setAssignmentBuilderOpen(false); setAssignmentEditingFieldId(null); }}
          onSaveQuestion={createAssignmentQuestion}
          onCreateInstruction={createAssignmentInstruction}
          onDeleteQuestion={removeAssignmentQuestion}
          onSelectField={selectAssignmentField}
          onPreviewRoleChange={setAssignmentFormsPreviewRole}
          onOpenAssets={() => { setAssignmentBuilderOpen(false); setStudioCreativeLibraryOpen(true); }}
        />,
        document.body,
      )}

      {autoFormatReport && (
        <div className="shrink-0 px-4 py-2 text-[.72rem] font-semibold flex items-center gap-3" style={{ background: 'var(--pj-purple-soft,rgba(107,0,153,.16))', color: 'var(--text-primary,#fff)', borderBottom: '1px solid var(--m3-border,rgba(255,255,255,.08))' }}>
          <Sparkles size={14} style={{ color: 'var(--pj-lilac,#D0BCFF)' }}/>
          Plajah Plus formatted {autoFormatReport.questionsDetected} question{autoFormatReport.questionsDetected === 1 ? '' : 's'}, created {autoFormatReport.fieldsCreated} answer field{autoFormatReport.fieldsCreated === 1 ? '' : 's'}, and aligned {autoFormatReport.objectsAligned} objects · {Math.round(autoFormatReport.confidence * 100)}% structural confidence.
          <button className="ml-auto underline opacity-80 hover:opacity-100" onClick={undoAssignmentAutoFormat}>Undo</button>
          <button aria-label="Dismiss Auto Format summary" onClick={() => setAutoFormatReport(null)}><X size={13}/></button>
        </div>
      )}

      {studioCreativeLibraryOpen && createPortal(
        <div className="fixed inset-0 z-[270] flex items-center justify-center p-3 sm:p-6" style={{ background:'rgba(5,3,9,.86)', backdropFilter:'blur(10px)' }} onPointerDown={event => { if (event.target === event.currentTarget) setStudioCreativeLibraryOpen(false); }}>
          <div className="w-full max-w-[1120px] max-h-[88vh] overflow-hidden rounded-[22px] flex flex-col" style={{ background:'linear-gradient(160deg,#181220,#0e0b14)', border:'1px solid rgba(255,255,255,.14)', boxShadow:'0 28px 90px rgba(0,0,0,.7)' }}>
            <div className="flex items-center gap-3 p-4 sm:px-6" style={{ borderBottom:'1px solid rgba(255,255,255,.1)' }}><span className="grid place-items-center w-10 h-10 rounded-[12px] text-white" style={{ background:'var(--pj-grad-spatial,linear-gradient(135deg,#6B0099,#00DAF3))' }}><Shapes size={18}/></span><div><div className="font-display italic text-white text-[1.1rem]">Tela Creative Library</div><div className="text-[.66rem] text-white/42">Editable vector shapes and production-ready starting systems</div></div><button onClick={() => setStudioCreativeLibraryOpen(false)} className="ml-auto grid place-items-center w-9 h-9 rounded-[10px] text-white/55 bg-white/[.06]"><X size={16}/></button></div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6">
              <div className="mb-6"><TelaTemplateGallery compact title="Add a designed page to this document" onUse={template => { addTemplateFrames(template); setStudioCreativeLibraryOpen(false); }}/></div>
              <button onClick={() => setStudioTemplateCategory('DOCUMENT')} className="mb-4 h-8 px-3 rounded-[9px] text-[9px] font-extrabold tracking-[.1em] text-white" style={{ background:studioTemplateCategory === 'DOCUMENT' ? 'linear-gradient(135deg,#6B0099,#D40055)' : 'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)' }}><FileText size={12} className="inline mr-1.5"/>DOCUMENT DESIGNS</button>
              {studioFocus?.device.type === 'VECTOR' && <section><div className="text-[.62rem] font-extrabold uppercase tracking-[.16em] text-white/40 mb-3">Vector shape library · {TELA_SHAPE_LIBRARY.length}</div><div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-2">{TELA_SHAPE_LIBRARY.map(shape => <button key={shape.id} title={`Add ${shape.name}`} onClick={() => { const device = studioFocus.device as TelaVectorDevice; const object = makeShapeObject(shape, device.width / 2 - 90, device.height / 2 - 75, 180, 150); dispatchOp({ type:'ADD_VECTOR_OBJECT', deviceId:device.id, object }); setStudioSel(object.id); setStudioCreativeLibraryOpen(false); }} className="aspect-square rounded-[12px] p-2 flex flex-col items-center justify-center gap-1.5 text-white/70 hover:text-white" style={{ background:'rgba(255,255,255,.045)', border:'1px solid rgba(255,255,255,.09)' }}><svg viewBox="0 0 100 100" className="w-9 h-9"><path d={shape.path} fill="#8C2CB7" stroke="#00DAF3" strokeWidth="2"/></svg><span className="text-[8px] font-bold truncate w-full">{shape.name}</span></button>)}</div></section>}
              <section className={studioFocus?.device.type === 'VECTOR' ? 'mt-7' : ''}><div className="flex flex-wrap items-center gap-2 mb-3"><div className="text-[.62rem] font-extrabold uppercase tracking-[.16em] text-white/40 mr-auto">Design templates · {TELA_CREATIVE_TEMPLATES.length}</div>{(['POSTER','LOWER_THIRD','MENU','PRESENTATION','SOCIAL','WEB'] as TelaTemplateCategory[]).map(category => <button key={category} onClick={() => setStudioTemplateCategory(category)} className="h-7 px-2.5 rounded-[8px] text-[9px] font-extrabold" style={{ color:studioTemplateCategory === category ? '#fff':'rgba(255,255,255,.42)', background:studioTemplateCategory === category ? 'rgba(107,0,153,.55)':'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.09)' }}>{category.replace('_',' ')}</button>)}</div><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">{TELA_CREATIVE_TEMPLATES.filter(template => template.category === studioTemplateCategory).map(template => <button key={template.id} onClick={() => { const device: TelaVectorDevice = { id:uid('dev'), type:'VECTOR', name:template.name, width:template.width, height:template.height, objects:instantiateTelaTemplate(template) }; const paper = template.category === 'POSTER' || template.category === 'MENU'; addFrame(paper ? 'PAPER':'SCREEN', 'FREE', device, template.name, { size:{ w:template.width, h:template.height } }); setPosture('STUDIO'); setStudioCreativeLibraryOpen(false); }} className="overflow-hidden rounded-[14px] text-left" style={{ background:template.palette[0], border:'1px solid rgba(255,255,255,.12)' }}><div className="aspect-[4/3] p-3 flex flex-col justify-end" style={{ background:`linear-gradient(135deg,${template.palette[0]},${template.palette[1]})` }}><span className="h-1 w-10 rounded-full mb-2" style={{ background:template.palette[2] }}/><strong className="text-[12px] leading-tight" style={{ color:template.tone === 'MINIMAL' || template.tone === 'EDITORIAL' ? template.palette[1]:'#fff' }}>{template.name}</strong></div><div className="px-3 py-2 text-[8px] font-extrabold tracking-[.12em] text-white/45">{template.width}×{template.height}</div></button>)}</div></section>
            </div>
          </div>
        </div>, document.body,
      )}

      {studioPaintOpen && studioFocus?.device.type === 'IMAGE' && createPortal(<React.Suspense fallback={<div className="fixed inset-0 z-[400] grid place-items-center bg-[#0d0d0f] text-white/60"><Loader2 className="animate-spin"/></div>}><ComicDrawCanvas width={studioFocus.device.width} height={studioFocus.device.height} initialImageUrl={studioFocus.device.layers.find(layer => layer.id === studioSel)?.src} onSave={blob => saveStudioPaint(studioFocus.device as TelaImageDevice, blob)} onClose={() => setStudioPaintOpen(false)}/></React.Suspense>, document.body)}

      {/* ── Image Trace review gate — nothing enters the document before this ── */}
      {studioTraceReview && createPortal(
        <div className="fixed inset-0 z-[260] flex flex-col p-3 sm:p-6" style={{ background: 'rgba(5,3,9,.94)', backdropFilter: 'blur(12px)' }}>
          <div className="w-full max-w-[1500px] mx-auto flex-1 min-h-0 flex flex-col rounded-[20px] overflow-hidden" style={{ background: 'linear-gradient(160deg,#181220,#0e0b14)', border: '1px solid rgba(255,255,255,.14)', boxShadow: '0 28px 90px rgba(0,0,0,.72)' }}>
            <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,.1)' }}>
              <span className="grid place-items-center w-10 h-10 rounded-[12px] text-white" style={{ background: 'var(--pj-grad-spatial,linear-gradient(135deg,#6B0099,#00DAF3))' }}><Sparkles size={18}/></span>
              <div className="min-w-0">
                <div className="font-display italic text-white text-[1.05rem] sm:text-[1.2rem] truncate">Review editable reconstruction</div>
                <div className="text-[.68rem] text-white/45">Compare first. Tela will not add it until you approve.</div>
              </div>
              <button className="ml-auto grid place-items-center w-9 h-9 rounded-[10px] text-white/55 hover:text-white" style={{ background: 'rgba(255,255,255,.06)' }} onClick={() => setStudioTraceReview(null)}><X size={17}/></button>
            </div>

            <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              <div className="flex p-1 rounded-[10px]" style={{ background: 'rgba(255,255,255,.05)' }}>
                {(['SPLIT','OVERLAY'] as const).map(mode => <button key={mode} onClick={() => setStudioTraceCompare(mode)} className="h-7 px-3 rounded-[8px] text-[.66rem] font-extrabold" style={{ color: studioTraceCompare === mode ? '#fff' : 'rgba(255,255,255,.4)', background: studioTraceCompare === mode ? 'rgba(255,255,255,.12)' : 'transparent' }}>{mode === 'SPLIT' ? 'Side by side' : 'Overlay check'}</button>)}
              </div>
              {studioTraceCompare === 'OVERLAY' && <label className="flex items-center gap-2 text-[.67rem] text-white/55">Vector opacity <input type="range" min={0} max={1} step={.02} value={studioTraceOpacity} onChange={e => setStudioTraceOpacity(+e.target.value)} className="w-28 accent-[var(--pj-cyan,#00DAF3)]"/></label>}
              <div className="sm:ml-auto flex flex-wrap gap-1.5">
                {(['LINE_ART','LOGO','DETAILED'] as TelaTracePreset[]).map(p => <button key={p} disabled={studioTraceBusy} onClick={() => void retryStudioTrace(p)} className="h-7 px-2.5 rounded-[8px] text-[.63rem] font-bold disabled:opacity-40" style={{ color: studioTraceReview.preset === p ? '#fff' : 'rgba(255,255,255,.5)', border: studioTraceReview.preset === p ? '1px solid rgba(0,218,243,.65)' : '1px solid rgba(255,255,255,.1)', background: studioTraceReview.preset === p ? 'rgba(0,218,243,.12)' : 'rgba(255,255,255,.04)' }}>{p === 'LINE_ART' ? 'Worksheet' : p === 'LOGO' ? 'Graphic' : 'Detailed'}</button>)}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-5">
              {studioTraceBusy ? <div className="h-full grid place-items-center text-white/65"><div className="flex flex-col items-center gap-3"><Loader2 size={30} className="animate-spin text-[var(--pj-cyan,#00DAF3)]"/><span className="text-[.76rem] font-bold">Reconstructing with the new settings…</span></div></div> : studioTraceCompare === 'SPLIT' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-full min-h-[520px]">
                  {[{ label: 'Original bitmap', src: studioTraceReview.source }, { label: studioTraceReview.result.engine ? 'Layered reconstruction · vectors + editable text' : 'Editable vector preview', src: studioTraceReview.result.previewUrl }].map(item => <div key={item.label} className="min-h-[420px] flex flex-col rounded-[14px] overflow-hidden" style={{ background: '#27232c', border: '1px solid rgba(255,255,255,.1)' }}><div className="shrink-0 px-3 py-2 text-[.66rem] font-extrabold uppercase tracking-[.12em] text-white/45">{item.label}</div><div className="flex-1 min-h-0 overflow-auto grid place-items-center p-3" style={{ backgroundImage: 'linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0,0 10px,10px -10px,-10px 0' }}><img src={item.src} alt={item.label} style={{ display: 'block', maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', background: '#fff', boxShadow: '0 12px 35px rgba(0,0,0,.3)' }}/></div></div>)}
                </div>
              ) : (
                <div className="h-full min-h-[520px] grid place-items-center overflow-auto rounded-[14px] p-4" style={{ background: '#242129', border: '1px solid rgba(255,255,255,.1)' }}><div className="relative" style={{ width: `min(100%, ${studioTraceReview.result.width}px)`, aspectRatio: `${studioTraceReview.result.width}/${studioTraceReview.result.height}` }}><img src={studioTraceReview.source} alt="Original" className="absolute inset-0 w-full h-full object-contain bg-white"/><img src={studioTraceReview.result.previewUrl} alt="Vector overlay" className="absolute inset-0 w-full h-full object-contain" style={{ opacity: studioTraceOpacity, mixBlendMode: 'difference' }}/></div></div>
              )}
            </div>

            <div className="shrink-0 flex flex-col md:flex-row md:items-center gap-3 px-4 sm:px-6 py-4" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[.66rem] text-white/48">
                <span><b className="text-white/85">{studioTraceReview.result.stats.compoundLayers}</b> editable compound layers</span>
                <span><b className="text-white/85">{studioTraceReview.result.stats.retainedContours.toLocaleString()}</b> retained contours</span>
                <span><b className="text-[var(--pj-success,#22C55E)]">{studioTraceReview.result.stats.removedNoise.toLocaleString()}</b> noise paths removed</span>
                {studioTraceReview.result.layers && <><span><b className="text-white/85">{studioTraceReview.result.layers.layout}</b> layout</span><span><b className="text-white/85">{studioTraceReview.result.layers.artwork}</b> artwork splines</span><span><b className="text-white/85">{studioTraceReview.result.layers.text}</b> editable text</span><span><b className="text-white/85">{studioTraceReview.result.layers.interaction}</b> response fields</span></>}
                {studioTraceReview.result.artworkRegions?.map(region => <span key={region.id} style={{ color: region.status === 'FALLBACK_IMAGE' ? '#F59E0B' : '#22C55E' }}><b>{region.label}</b> · {region.status === 'FALLBACK_IMAGE' ? 'trace review' : `${region.editablePathCount}/${region.pathCount} pen paths`}</span>)}
              </div>
              <div className="md:ml-auto flex gap-2">
                <button onClick={() => setStudioTraceReview(null)} className="h-9 px-4 rounded-[10px] text-[.72rem] font-bold text-white/60" style={{ border: '1px solid rgba(255,255,255,.14)' }}>Cancel</button>
                <button onClick={() => void retryStudioTrace(studioTraceReview.preset)} disabled={studioTraceBusy} className="h-9 px-4 rounded-[10px] text-[.72rem] font-bold text-white/85" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)' }}>Retry</button>
                <button onClick={acceptStudioTrace} disabled={studioTraceBusy || studioTraceReview.result.objects.length === 0} className="h-9 px-5 rounded-[10px] text-[.72rem] font-extrabold text-white disabled:opacity-40" style={{ background: 'var(--pj-grad-brand,linear-gradient(135deg,#6B0099,#D40055))' }}>Accept reconstruction</button>
              </div>
            </div>
          </div>
        </div>, document.body,
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

      {/* ── Author-in-place flying menu ─────────────────────────────────────── */}
      {vectorContextMenu.node}
      {imageContextMenu.node}
      {flying && flyingTarget && (
        <TelaFlyingMenu
          anchor={flying.anchor}
          target={flyingTarget}
          locked={!!doc.locked}
          canEdit={true /* TODO: rights via contentLicense/orgPermissions — author owns the canvas here */}
          publishing={publishing}
          writers={writerList}
          onDispatch={dispatchOp}
          onUnlock={flyingUnlock}
          onLock={flyingLock}
          onClose={() => setFlying(null)}
        />
      )}
    </div>
  );
};

export default TelaView;
