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
  BarChart3, BookHeart, BookOpen, Brush, CheckCircle2, ChevronDown, ChevronLeft, Circle, CircleHelp, Clipboard, Copy, CopyPlus, Database, Eye, EyeOff, Feather, FileDown, FilePlus2, FileText, FileUp, FlipHorizontal, Folder, FormInput,
  Grid3X3, Hand, Hexagon, Image as ImageIcon, ImagePlus, Lasso, Layers, LayoutPanelTop, Link as LinkIcon, Link2, Loader2, Maximize2, Minimize2,
  Minus, Monitor, MousePointer2, MousePointerClick, Music2, Paintbrush, Eraser, Palette, Pencil, PenLine, PenTool, Pipette, Plus, Redo2, Scan, Shapes, Sliders, Sparkles, Spline, Square, Star, TextQuote, Trash2, Type, Undo2, Wand2, X, ZoomIn, History as HistoryIcon, Printer, Box as BoxIcon, MoreHorizontal, GraduationCap, LayoutTemplate } from 'lucide-react';
import { NON_PRINTING_LABEL, isNonPrinting, type SpotColor } from '../../services/print/types';
import { defaultSpecFor } from '../../services/print/products';
import { vehiclePlacements, type WrapJob } from '../../services/print/wrap';
import { translatePath } from '../../services/print/paths';
import type {
  TelaAssignmentAudienceRole, TelaBaseDevice, TelaBinding, TelaBlock, TelaDevice, TelaDoc, TelaDocMeta, TelaField,
  TelaFormDevice, TelaFrame, TelaFramePreset, TelaGridDevice, TelaImageDevice, TelaImageLayer, TelaMediaDevice, TelaMediaKind, TelaNotesDevice,
  TelaRow, TelaVectorDevice, TelaVectorObject, TelaWriterDevice,
} from '../../types';
import {
  deleteTelaDoc, listTelaDocs, loadTelaDoc, loadTelaDocFreshest, newTelaId, serializeTelaDocForStore, telaDocFromStoredJson, TELA_CLOUD_KIND, saveTelaDoc, telaStorageMode,
  publishTelaVersion,
} from '../../services/telaStore';
import { CreativeStorageMeter, CreativeVersionHistory, useCreativeSyncState } from '../creative/CreativeCloudPanels';
import { useCoedit, type UseCoedit } from '../../hooks/useCoedit';
import { CollabDock } from '../collab/CollabDock';
import { forShare, telaLabeler, withPrivate } from './telaCoedit';
import { TelaPresenceLayer } from './TelaPresence';
import { coProjectId, listSharedWithMe } from '../../services/coedit/project';
import { isMine, isSharedWithMe, stampEditor } from '../../services/tela/recentScope';
import { fetchOrganization, fetchUserMemberships } from '../../services/organizationService';
import { loadSharedDoc } from '../../services/coedit/session';
import { merge3Json } from '../../services/coedit/crdt';
import { CREATIVE_SYNC_EVENT, type CreativeSyncDetail } from '../../services/creativeCloud/cloudStore';
import { auth, fetchUserProfile } from '../../services/backendService';
import type { TelaClassworkContext, TelaReturnTarget } from './classwork/classworkTypes';
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
import { storyFromBlocks } from '../../services/text/document';
import { useAriaSurface } from '../../services/aria/useAriaSurface';
import { normalizeDesignReferenceStudy, studyToTelaTemplate } from '../../services/aria/designReferenceStudy';
import TelaGrid, { cellKey, type TelaBaseLite, type TelaFormulaContext } from './TelaGrid';
import TelaBase from './TelaBase';
import TelaForm from './TelaForm';
import TelaVector, { TelaVectorObjectProps, objBounds, type VectorTool } from './TelaVector';
import { StudioCanvas } from './studio/StudioCanvas';
import { StudioCtx, type StudioApi, type StudioTool, type StudioPrefs, type PaintDefaults, type ShapeOpts } from './studio/studioContext';
import { bakeType, makeTypeLayer, restyleTypeObject, appendText, type TypeStylePatch } from '../../services/tela/studio/typeTools';
import type { AnchorRef } from '../../services/tela/studio/direct';
import { getSharedTextSystem } from './TelaWriter';
import type { TelaStudioDeviceExt } from '../../services/tela/studio/model';
import { TelaLottieImportRow } from './TelaLottie';
import { importLottieFile } from '../../services/tela/telaLottieImport';
import { makeMotionTemplateObject, renderMotionTemplatePoster, motionTemplateName } from '../../services/tela/telaMotionTemplate';
import { motionSpecFromItem } from '../../services/universalLibrary/amboItems';
import type { LibraryItem } from '../../services/universalLibrary/libraryModel';
import { isLottieFileName } from '../../services/tela/telaLottie';
import TelaImage, { TelaImageLayerControls, ImageLayerRow, makeImageLayer } from './TelaImage';
import { PRESETS, applyTelaOp, type TelaOp } from './telaOps';
import { emptyHistory, recordOp, recordReplace, undo as historyUndo, redo as historyRedo, sealStep, isNativeUndoTarget, type TelaHistory } from './telaHistory';
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
import TelaPaiGalleryModal from './TelaPaiGalleryModal';
import { TelaTypographyStudio } from './TelaTypographyStudio';
import { TelaToolOptionsBar, DEFAULT_TYPE, type TelaTypeDefaults } from './TelaToolOptionsBar';
import type { Selection, SelectionTool } from '../../services/tela/raster/selectionWorkflow';
import {
  invertSelection,
  selectAll,
  featherSelection,
  expandSelection,
  contractSelection,
  smoothSelection,
  borderSelection,
  selectionToDataUrl,
  layerViaCopy,
} from '../../services/tela/raster/selectionWorkflow';
import { isCameraRawFile, decodeCameraRawFile } from '../../services/tela/rawImageService';
import type { ColorSpaceId } from '../../services/tela/raster/colorWorkspace';
import {
  DEFAULT_WHEELS,
  DEFAULT_CURVES,
  type ColorWheelState,
  type ColorCurvesState,
} from './color/TelaColoristSuite';
import type { TelaDesignTemplate } from '../../services/tela/telaTemplateRegistry';
import { TELA_TEMPLATE_GALLERY } from '../../services/tela/telaTemplateRegistry';
import { UniversalLibraryPanel } from '../shared/UniversalLibrary/UniversalLibraryPanel';
import { ensureFontsForObjects } from '../../services/tela/telaFonts';
import { makeTelaNoteEntry } from './TelaNotes';
import { useContextMenu } from '../ui/ContextMenu';
import { makeTelaChart } from '../../services/telaChartData';

const ComicDrawCanvas = React.lazy(() => import('../ComicDrawCanvas'));
const ComposeWithCouncil = React.lazy(() => import('../living/ComposeWithCouncil'));   // Composer Council panel (services/living/composer)
const TelaBehaviorsPanel = React.lazy(() => import('./TelaBehaviorsPanel'));   // Live authoring: behaviours, sounds, music (services/living)
const TelaComicStudio = React.lazy(() => import('./TelaComicStudio').then(m => ({ default: m.TelaComicStudio })));
const TelaClassworkStudio = React.lazy(() => import('./classwork/TelaClassworkStudio'));
const SaveTemplateDialog = React.lazy(() => import('../templates/SaveTemplateDialog'));
const TemplateLibrary = React.lazy(() => import('../templates/TemplateLibrary'));
const MerchDesignerStudio = React.lazy(() => import('./merch/MerchDesignerStudio'));
const PrepressPanel = React.lazy(() => import('./print/PrepressPanel'));
const LocalCreativeStudio = React.lazy(() => import('../Fabula/LocalCreativeStudio').then(m => ({ default: m.LocalCreativeStudio })));
const TelaWritingStudio = React.lazy(() => import('./TelaWritingStudio').then(m => ({ default: m.TelaWritingStudio })));
import {
  useTelaComicVariant2Controller,
  TelaComicLeftRailCluster,
  TelaComicPageStreamCanvas,
  TelaComicSplitRightInspector,
  TelaComicBottomTransportAndTimeline,
} from './studio/TelaNativeComicVariant2';

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
  { id: 'ink', icon: <Brush size={17} />, label: 'Ink — freehand (B)' },
];

const STUDIO_PRO_TOOLS: { id: StudioTool; icon: React.ReactNode; label: string }[] = [
  { id: 'select', icon: <MousePointer2 size={17} />, label: 'Selection (V)' },
  { id: 'direct', icon: <MousePointerClick size={17} />, label: 'Direct Selection / Anchors (A)' },
  { id: 'pen', icon: <PenTool size={17} />, label: 'Pen — Bezier (P)' },
  { id: 'pencil', icon: <Pencil size={17} />, label: 'Pencil (N)' },
  { id: 'type', icon: <Type size={17} />, label: 'Type (T)' },
  { id: 'rect', icon: <Square size={17} />, label: 'Rectangle (M)' },
  { id: 'ellipse', icon: <Circle size={17} />, label: 'Ellipse (L)' },
  { id: 'polygon', icon: <Hexagon size={17} />, label: 'Polygon' },
  { id: 'star', icon: <Star size={17} />, label: 'Star' },
  { id: 'line', icon: <Minus size={17} />, label: 'Line (\\)' },
  { id: 'width', icon: <Spline size={17} />, label: 'Variable Width (Shift+W)' },
  { id: 'shapeBuilder', icon: <Sparkles size={17} />, label: 'Shape Builder (Shift+M)' },
  { id: 'gradient', icon: <Layers size={17} />, label: 'Gradient Tool (G)' },
  { id: 'mesh', icon: <Grid3X3 size={17} />, label: 'Gradient Mesh (U)' },
  { id: 'eyedropper', icon: <Pipette size={17} />, label: 'Eyedropper (I)' },
  { id: 'artboard', icon: <Maximize2 size={17} />, label: 'Artboard Tool (Shift+O)' },
  { id: 'hand', icon: <Hand size={17} />, label: 'Hand / Pan (H)' },
  { id: 'zoom', icon: <ZoomIn size={17} />, label: 'Zoom (Z)' },
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
  const blocks = [makeBlock('p', '')];
  const writer: TelaWriterDevice = { id: uid('dev'), type: 'WRITER', blocks, story: storyFromBlocks(blocks) };
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
  onDocumentChange?: (doc: TelaDoc) => void;
  onBack?: () => void;
  /** Opens a domain-generated Tela file directly (Melos, Notes, journals). */
  initialDocId?: string | null;
  /** Opened from a class / Education hub to bring in classwork: opens the Classwork tab scoped to it. */
  classwork?: TelaClassworkContext | null;
  /** Shows a "Back to …" button that returns to the screen that opened Tela. */
  returnTo?: TelaReturnTarget | null;
}

const TelaView: React.FC<TelaViewProps> = ({ onBack, initialDocId, onDocumentChange, classwork = null, returnTo = null }) => {
  const [doc, setDoc] = useState<TelaDoc | null>(null);
  useEffect(() => { if (doc) onDocumentChange?.(doc); }, [doc, onDocumentChange]);
  const [showHome, setShowHome] = useState(!initialDocId);
  const [posture, setPosture] = useState<Posture>('STUDIO');
  const [studioDocView, setStudioDocView] = useState<'focus' | 'continuous'>('focus');
  const [studioRightTab, setStudioRightTab] = useState<'properties' | 'comic' | 'pages'>('properties');
  const [comicLayoutMode, setComicLayoutMode] = useState(false);
  const [cam, setCam] = useState({ x: 0, y: 0, z: 1 });
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [headerMoreOpen, setHeaderMoreOpen] = useState(false);
  const cloudSync = useCreativeSyncState(TELA_CLOUD_KIND, doc?.id);
  const [storageMode, setStorageMode] = useState<'opfs' | 'local'>('opfs');
  const [canvasList, setCanvasList] = useState<TelaDocMeta[] | null>(null);
  // Orgs this account belongs to, for the home page's org filter (services/tela/recentScope).
  const [memberOrgIds, setMemberOrgIds] = useState<string[]>([]);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
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
  const [studioTool, setStudioTool] = useState<StudioTool>('select');
  const [studioMode, setStudioMode] = useState<'pro' | 'classic'>('pro');
  const [studioAnchorSel, setStudioAnchorSel] = useState<{ id: string; refs: AnchorRef[] } | null>(null);
  const [studioIsolation, setStudioIsolation] = useState<string | null>(null);
  const [studioPrefs, setStudioPrefs] = useState<StudioPrefs>({ snapGrid: true, snapPoint: true, smartGuides: true, showGrid: false, gridSize: 16, showRulers: true, showGuides: true, outline: false, previewBounds: true });
  const [studioPaint, setStudioPaint] = useState<PaintDefaults>({ fill: '#6B0099', stroke: '#1B1523', strokeWidth: 2, focus: 'fill' });
  const [studioShapeOpts, setStudioShapeOpts] = useState<ShapeOpts>({ sides: 5, points: 5, innerRatio: 0.5, radius: 48, spiralDecay: 0.8, spiralSegments: 24 });
  const [editingText, setEditingText] = useState<string | null>(null);
  const [paintTarget, setPaintTarget] = useState<{ kind: 'gradient' | 'mesh'; node?: number; stop?: number } | null>(null);
  const studioViewportRef = useRef<HTMLDivElement>(null);
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
  const [ulOpen, setUlOpen] = useState(false);
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
  const [comicStudioOpen, setComicStudioOpen] = useState(false);
  const [classworkOpen, setClassworkOpen] = useState(!!classwork);
  const [isEducator, setIsEducator] = useState(false);
  const [templateMenu, setTemplateMenu] = useState<null | 'menu' | 'save' | 'library'>(null);
  useEffect(() => { if (classwork) setClassworkOpen(true); }, [classwork]);
  useEffect(() => {
    // Classwork is for teachers and education staff: anyone who opened Tela from a class, or a teacher account.
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let alive = true;
    fetchUserProfile(uid).then(p => {
      const a = p as any;
      if (alive) setIsEducator(!!a && (a.accountType === 'TEACHER' || a.isTeacher || a.isSchoolAdmin));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const [merchStudioOpen, setMerchStudioOpen] = useState(false);
  const [prepressOpen, setPrepressOpen] = useState(false);
  const [localStudioOpen, setLocalStudioOpen] = useState(false);
  const [localStudioMinimized, setLocalStudioMinimized] = useState(false);
  const [localStudioProgress, setLocalStudioProgress] = useState<{ loading: boolean; pct: number; msg: string }>({ loading: false, pct: 0, msg: '' });
  const [paiGalleryOpen, setPaiGalleryOpen] = useState(false);
  const [imageSelectionTool, setImageSelectionTool] = useState<SelectionTool>('none');
  const [rasterSelection, setRasterSelection] = useState<Selection | null>(null);
  const [coloristSuiteOpen, setColoristSuiteOpen] = useState(false);
  const [colorEyedropperActive, setColorEyedropperActive] = useState(false);
  const [colorSpace, setColorSpace] = useState<ColorSpaceId>('srgb');
  const [softProofing, setSoftProofing] = useState(false);
  const [cmykPlate, setCmykPlate] = useState<'composite' | 'cyan' | 'magenta' | 'yellow' | 'black'>('composite');
  const [colorWheels, setColorWheels] = useState<ColorWheelState>(DEFAULT_WHEELS);
  const [colorCurves, setColorCurves] = useState<ColorCurvesState>(DEFAULT_CURVES);
  const [writingStudioOpen, setWritingStudioOpen] = useState(false);
  const [writingStudioTab, setWritingStudioTab] = useState<'SCRIPT' | 'DESK'>('SCRIPT');
  const [typographyStudioOpen, setTypographyStudioOpen] = useState(false);
  // Type tool: the typography the next text layer is born with, and caret hand-off to TelaVector.
  const [typeDefaults, setTypeDefaults] = useState<TelaTypeDefaults>(DEFAULT_TYPE);
  const [textEditRequest, setTextEditRequest] = useState<{ id: string; nonce: number } | null>(null);
  // Author-in-place flying menu (raised from a ✎ badge — the same menu the
  // reference-embed uses). Ref-based so edits resolve live against the doc.
  const [flying, setFlying] = useState<{ ref: FlyingRef; anchor: { x: number; y: number } } | null>(null);
  const [publishing, setPublishing] = useState(false);

  const railBtn = (active: boolean): React.CSSProperties => ({
    display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 10, border: 'none', cursor: 'pointer',
    color: active ? '#fff' : 'rgba(255,255,255,0.5)',
    background: active ? 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' : 'transparent',
  });

  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const assetFileRef = useRef<HTMLInputElement>(null);
  const studioFileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<TelaDoc | null>(null);
  const vectorClipboard = useRef<TelaVectorObject | null>(null);
  const imageClipboard = useRef<TelaImageLayer | null>(null);
  docRef.current = doc;
  // Document undo/redo (components/tela/telaHistory.ts). The ref is the truth;
  // the counters only drive the Edit menu's enabled state.
  const historyRef = useRef<TelaHistory>(emptyHistory());
  const activeFrameIdRef = useRef<string | null>(null);
  activeFrameIdRef.current = activeFrameId;
  const [historyDepth, setHistoryDepth] = useState({ past: 0, future: 0 });
  const setHistory = (h: TelaHistory) => { historyRef.current = h; setHistoryDepth(d => (d.past === h.past.length && d.future === h.future.length ? d : { past: h.past.length, future: h.future.length })); };
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeFrame = doc?.frames.find(f => f.id === activeFrameId) || null;
  const currentDevice = activeFrame ? activeFrame.deviceIds.map(id => doc?.devices[id]).find(Boolean) || null : null;
  const isCurrentImage = currentDevice?.type === 'IMAGE';

  // ── Org filter on the home page: which orgs you're in, and names for shared org docs ───────────
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let alive = true;
    fetchUserMemberships(uid)
      .then(ms => { if (alive) setMemberOrgIds(ms.filter(m => m.status === 'ACTIVE').map(m => m.orgId)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const missing = [...new Set((canvasList || []).filter(m => m.orgId && !m.orgName && !orgNames[m.orgId]).map(m => m.orgId!))].slice(0, 12);
    if (!missing.length) return;
    let alive = true;
    void Promise.all(missing.map(id => fetchOrganization(id).then(o => [id, o?.name || ''] as const).catch(() => [id, ''] as const)))
      .then(rows => { if (alive) setOrgNames(n => ({ ...n, ...Object.fromEntries(rows) })); });
    return () => { alive = false; };
  }, [canvasList, orgNames]);

  // ── Boot: open the most recent canvas, or start a fresh one ────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      setStorageMode(await telaStorageMode());
      const metas = await listTelaDocs();
      if (!alive) return;
      setCanvasList(metas);
      void refreshList();
      const requestedId = initialDocId || metas[0]?.id;
      if (initialDocId) setShowHome(false);
      if (requestedId) {
        const d = await loadTelaDocFreshest(requestedId);
        if (!alive) return;
        if (d) { const hydrated = await hydrateTelaDomainDoc(d); if (!alive) return; openDoc(hydrated); if (hydrated !== d) void saveTelaDoc(hydrated); return; }
      }
      openDoc(makeNewDoc(auth.currentUser?.uid || 'local'));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDocId]);

  const openDoc = (d: TelaDoc) => {
    setHistory(emptyHistory());
    setDoc(d);
    const first = d.frames.find(f => f.kind === 'PAPER') || d.frames[0] || null;
    setActiveFrameId(first?.id || null);
    setPosture('STUDIO');
    setStudioDocView('focus');
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
    if (p === 'PAGE') {
      setStudioDocView('continuous');
      const cur = docRef.current;
      const target = cur?.frames.find(f => f.id === activeFrameId) || cur?.frames[0];
      if (target) {
        setActiveFrameId(target.id);
        fitFrame(target);
      }
    }
    if (p === 'STUDIO') {
      setStudioDocView('focus');
      const cur = docRef.current;
      const target = cur?.frames.find(f => f.id === activeFrameId) || cur?.frames[0];
      if (target) {
        setActiveFrameId(target.id);
        fitFrame(target);
      }
    }
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

  const scheduleSave = useCallback(() => {
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

  /** Undo/redo restore whole snapshots; re-push any domain-bound device whose content changed. */
  const resyncDomains = (from: TelaDoc, to: TelaDoc) => {
    for (const [id, device] of Object.entries(to.devices)) {
      const prev = from.devices[id];
      if (!prev || prev === device) continue;
      if (device.type === 'WRITER' && prev.type === 'WRITER') syncTelaWriterToDomain(prev, device.blocks);
      if (device.type === 'NOTES' && prev.type === 'NOTES') syncTelaNotesToDomain(prev, device);
    }
  };
  // Set once the live-collaboration hook below is up; undo in a shared doc only reverts YOUR edits.
  const coRef = useRef<UseCoedit<TelaDoc> | null>(null);
  const stepHistory = useCallback((dir: 'undo' | 'redo') => {
    const current = docRef.current;
    if (!current || current.locked) return;
    const co = coRef.current;
    if (co?.session && co.isShared) {
      if (dir === 'undo') co.session.undo();
      else co.session.redo();
      return;
    }
    const result = dir === 'undo' ? historyUndo(historyRef.current, current) : historyRedo(historyRef.current, current);
    if (!result) return;
    resyncDomains(current, result.doc);
    setHistory(result.history);
    docRef.current = result.doc;
    setDoc(result.doc);
    if (!result.doc.frames.some(frame => frame.id === activeFrameIdRef.current)) setActiveFrameId(result.doc.frames[0]?.id || null);
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSave]);
  /** Pointer-up / blur: the next edit starts a new undo step even if it repeats this one. */
  const sealHistoryStep = useCallback(() => setHistory(sealStep(historyRef.current)), []);

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
    if (current) {
      // Apply synchronously so two ops in one tick both see the latest doc
      // (and history records the true "before" of each).
      const next = stampEditor(applyTelaOp(current, op), auth.currentUser?.uid);
      if (next !== current) setHistory(recordOp(historyRef.current, current, op));
      if (op.type === 'WRITER_EDIT') {
        const before = current.devices[op.deviceId], after = next.devices[op.deviceId];
        if (before?.type === 'WRITER' && after?.type === 'WRITER' && after.blocks !== before.blocks) syncTelaWriterToDomain(before, after.blocks);
      }
      docRef.current = next;
      setDoc(next);
    }
    scheduleSave();
  }, []);


  // Flush on unmount.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const cur = docRef.current;
    if (cur) void saveTelaDoc(cur);
  }, []);

  // ── Live collaboration (services/coedit) ──────────────────────────────────
  // Solo docs behave exactly as before. Once shared, edits stream to everyone on the project,
  // offline edits queue on this device, and remote merges land here (private Notes stay local).
  const sharedDoc = useMemo(() => (doc ? forShare(doc) : null), [doc]);
  const applyRemoteDoc = useCallback((remote: TelaDoc) => {
    const current = docRef.current;
    const role = coRef.current?.role;
    const merged = { ...withPrivate(remote, current), editedBy: [...new Set([...(remote.editedBy || []), ...(current?.editedBy || [])])] };
    const next = role && role !== 'owner' && role !== 'editor' ? { ...merged, locked: true } : merged;
    if (current) resyncDomains(current, next);
    docRef.current = next;
    setDoc(next);
    if (!next.frames.some(frame => frame.id === activeFrameIdRef.current)) setActiveFrameId(next.frames[0]?.id || null);
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSave]);
  const co = useCoedit<TelaDoc>({
    kind: TELA_CLOUD_KIND,
    localId: doc?.id,
    title: doc?.title || 'Untitled canvas',
    doc: sharedDoc,
    applyRemote: applyRemoteDoc,
    labeler: telaLabeler,
    orgId: doc?.orgOrigin?.orgId,
  });
  coRef.current = co;
  // Solo docs edited on two devices while apart: the cloud sync merges both, then this editor takes
  // the merged copy, rebasing anything typed since the sync started (shared docs merge live instead).
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<CreativeSyncDetail>).detail;
      if (!d?.mergedJson || !d.preMergeJson || d.kind !== TELA_CLOUD_KIND || d.localId !== docRef.current?.id || coRef.current?.isShared) return;
      void (async () => {
        const [base, theirs] = await Promise.all([telaDocFromStoredJson(d.preMergeJson!), telaDocFromStoredJson(d.mergedJson!)]);
        const mine = docRef.current;
        if (!mine || mine.id !== theirs.id) return;
        applyRemoteDoc(merge3Json(base, mine, theirs).merged);
      })();
    };
    window.addEventListener(CREATIVE_SYNC_EVENT, on);
    return () => window.removeEventListener(CREATIVE_SYNC_EVENT, on);
  }, [applyRemoteDoc]);
  const collabAnchorRef = useRef<HTMLElement | null>(null);
  const [collabOpen, setCollabOpen] = useState(false);
  // Tell collaborators what you have selected and which page you're on.
  useEffect(() => {
    const s = co.session;
    if (!s) return;
    s.setSelection(studioSelIds, activeFrameId ? s.describe(['frames', `#${activeFrameId}`]) : undefined);
  }, [co.session, studioSelIds, activeFrameId]);

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

  const totalDocWriterWords = useMemo(() => {
    let words = 0;
    for (const k in writerTexts) {
      const txt = writerTexts[k]?.trim();
      if (txt) words += txt.split(/\s+/).length;
    }
    return words;
  }, [writerTexts]);

  const comicVariant2Ctrl = useTelaComicVariant2Controller(totalDocWriterWords, comicLayoutMode);

  const toggleInlineComicLayoutMode = useCallback(() => {
    setComicLayoutMode(prev => {
      const next = !prev;
      if (next) {
        setPosture('PAGE');
        setStudioDocView('continuous');
        setStudioRightTab('comic');
      } else if (studioRightTab === 'comic') {
        setStudioRightTab('properties');
      }
      return next;
    });
  }, [studioRightTab]);

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

  // Keep Studio selection scoped to the active page in focus.
  const studioDevId = studioFocus?.device.id || null;
  useEffect(() => {
    // The Type tool stays armed across pages: typing on the next page makes its own text layer.
    setStudioTool(tool => (tool as string) === 'text' || tool === 'type' ? tool : 'select');
    setStudioGuides({ x: [], y: [] });
    const cur = docRef.current;
    const frame = cur?.frames.find(f => f.id === activeFrameId);
    if (frame && cur) {
      const validIds = new Set<string>();
      for (const devId of frame.deviceIds) {
        const d = cur.devices[devId];
        if (d?.type === 'VECTOR') d.objects.forEach(o => validIds.add(o.id));
        if (d?.type === 'IMAGE') d.layers.forEach(l => validIds.add(l.id));
      }
      setStudioSelIds(prev => {
        const filtered = prev.filter(id => validIds.has(id));
        setStudioSelRaw(filtered.at(-1) || null);
        return filtered;
      });
    } else {
      setStudioSel(null);
    }
  }, [activeFrameId, setStudioSel]);

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
      setHistory(recordReplace(historyRef.current, current, 'Auto format'));
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
    const paperFrames = (docRef.current?.frames || []).filter(f => f.kind === 'PAPER');
    const n = paperFrames.length + 1;
    const lastPaper = paperFrames[paperFrames.length - 1];
    const PAGE_GAP = 54;
    const p = PRESETS.LETTER;
    const pos = lastPaper
      ? { x: lastPaper.x, y: lastPaper.y + lastPaper.h + PAGE_GAP }
      : { x: 0, y: 0 };
    const blocks = [makeBlock('p', '')];
    addFrame('PAPER', 'LETTER', { id: uid('dev'), type: 'WRITER', blocks, story: storyFromBlocks(blocks) }, `Page ${n}`, { pos });
  };
  const insertScriptFrame = (script: { title: string; blocks: TelaBlock[] }) => {
    const paperFrames = (docRef.current?.frames || []).filter(f => f.kind === 'PAPER');
    const lastPaper = paperFrames[paperFrames.length - 1];
    const PAGE_GAP = 54;
    const pos = lastPaper
      ? { x: lastPaper.x, y: lastPaper.y + lastPaper.h + PAGE_GAP }
      : { x: 0, y: 0 };
    const writerDev: TelaWriterDevice = {
      id: uid('dev'),
      type: 'WRITER',
      blocks: script.blocks,
      story: storyFromBlocks(script.blocks),
    };
    addFrame('PAPER', 'LETTER', writerDev, script.title || 'Screenplay Draft', { pos });
    setPosture('PAGE');
  };
  const addGridSheet = () => {
    const cur = docRef.current;
    const n = (cur?.frames.filter(f => f.deviceIds.some(id => cur?.devices[id]?.type === 'GRID')).length || 0) + 1;
    const lastFrame = cur?.frames[cur.frames.length - 1];
    const pos = lastFrame ? { x: 0, y: lastFrame.y + lastFrame.h + 54 } : { x: 0, y: 0 };
    addFrame('PAPER', 'LETTER', { id: uid('dev'), type: 'GRID', rows: 20, cols: 10, cells: {} }, `Sheet ${n}`, { pos, size: { w: PRESETS.LETTER.w, h: PRESETS.LETTER.h } });
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
  // Vector artboard — standard Letter document page size so it flows seamlessly in multi-page docs.
  const addVectorArtboard = () => {
    const cur = docRef.current;
    const n = (cur?.frames.filter(f => f.deviceIds.some(id => cur?.devices[id]?.type === 'VECTOR')).length || 0) + 1;
    const p = PRESETS.LETTER;
    const lastFrame = cur?.frames[cur.frames.length - 1];
    const pos = lastFrame ? { x: 0, y: lastFrame.y + lastFrame.h + 54 } : { x: 0, y: 0 };
    const dev: TelaVectorDevice = { id: uid('dev'), type: 'VECTOR', name: `Artboard ${n}`, width: p.w, height: p.h, objects: [] };
    addFrame('PAPER', 'LETTER', dev, dev.name!, { pos, size: { w: p.w, h: p.h } });
    setPosture('STUDIO');
  };
  // Image canvas — a raster surface hosting stacked layers.
  const addImageCanvas = () => {
    const n = (docRef.current?.frames.filter(f => f.deviceIds.some(id => docRef.current?.devices[id]?.type === 'IMAGE')).length || 0) + 1;
    const dev: TelaImageDevice = { id: uid('dev'), type: 'IMAGE', name: `Image ${n}`, width: 1000, height: 750, layers: [] };
    addFrame('BOARD', 'FREE', dev, dev.name!, { size: { w: 1000, h: 750 } });
    setPosture('STUDIO');
  };

  // ── Universal Page Layer Tools (Typography, Shapes, Layers) ──────────────────
  const ensureVectorOverlayForFrame = (targetFrame: TelaFrame): string => {
    let vecDev = targetFrame.deviceIds.map(id => docRef.current?.devices[id]).find((d): d is TelaVectorDevice => d?.type === 'VECTOR');
    if (vecDev) return vecDev.id;

    const imgDev = targetFrame.deviceIds.map(id => docRef.current?.devices[id]).find((d): d is TelaImageDevice => d?.type === 'IMAGE');
    const newDevId = uid('dev');
    const overlayDev: TelaVectorDevice = {
      id: newDevId,
      type: 'VECTOR',
      name: `${targetFrame.label || 'Page'} Overlay`,
      width: imgDev ? imgDev.width : targetFrame.w,
      height: imgDev ? imgDev.height : targetFrame.h,
      objects: [],
    };
    dispatchOp({
      type: 'ADD_DEVICES_TO_FRAME',
      frameId: targetFrame.id,
      devices: [overlayDev],
    });
    return newDevId;
  };

  const addTextBoxToActiveFrame = (targetFrameId?: string) => {
    const cur = docRef.current;
    if (!cur) return;
    const frameId = targetFrameId || activeFrameId || cur.frames[0]?.id;
    const targetFrame = cur.frames.find(f => f.id === frameId) || cur.frames[0];
    if (!targetFrame) return;

    const vecDeviceId = ensureVectorOverlayForFrame(targetFrame);
    const latestVec = docRef.current?.devices[vecDeviceId] as TelaVectorDevice | undefined;
    const textBoxNum = (latestVec?.objects.filter(o => o.textRole === 'BOX').length || 0) + 1;
    const boxId = uid('obj');
    const newBox: TelaVectorObject = {
      id: boxId,
      kind: 'TEXT',
      textRole: 'BOX',
      objectLabel: `Text Box Layer ${textBoxNum}`,
      x: Math.round(targetFrame.w * 0.08) + ((textBoxNum - 1) % 4) * 18,
      y: 120 + ((textBoxNum - 1) % 4) * 18,
      w: Math.min(380, Math.round(targetFrame.w * 0.84)),
      h: 170,
      fill: typeDefaults.fill,
      fontSize: typeDefaults.fontSize,
      fontFamily: typeDefaults.fontFamily,
      fontWeight: typeDefaults.fontWeight,
      fontStyle: typeDefaults.fontStyle,
      underline: typeDefaults.underline,
      textAlign: typeDefaults.textAlign,
      lineHeight: typeDefaults.lineHeight,
      letterSpacing: typeDefaults.letterSpacing,
      textTransform: typeDefaults.textTransform,
      wrap: true,
      backgroundColor: '#FFFFFF',
      padding: 16,
      rx: 8,
      shadowColor: 'rgba(0,0,0,0.12)',
      shadowBlur: 14,
      shadowOffsetY: 4,
      blocks: [
        { id: uid('blk'), kind: 'h2', text: 'Typography & Text Box' },
        { id: uid('blk'), kind: 'p', text: 'Double-click inside this text box to freely type, edit, and format text.' },
      ],
      text: 'Typography & Text Box\nDouble-click inside this text box to freely type, edit, and format text.',
    };

    dispatchOp({
      type: 'ADD_VECTOR_OBJECT',
      deviceId: vecDeviceId,
      object: newBox,
    });
    setActiveFrameId(targetFrame.id);
    setStudioSel(boxId);
    setStudioRightTab('properties');
  };

  // A text layer is a page-sized, transparent sheet of text lifted off the page — the Type
  // tool makes one when you click a page or just start typing. Its text flows inside the page
  // margins like a document page. (A text box layer is the framed box above.)
  // The Pro Studio focus canvas composes type with the text engine (studio.type stories baked
  // to glyphs), so its text layers are engine area type; everywhere else they are rich TEXT.
  const proFocusVector = (frameId?: string | null): TelaVectorDevice | null => {
    if (studioMode !== 'pro' || posture !== 'STUDIO' || studioDocView !== 'focus') return null;
    const cur = docRef.current; const frame = cur?.frames.find(f => f.id === (frameId || activeFrameId)) || cur?.frames[0];
    const primary = frame ? cur?.devices[frame.deviceIds[0]] : null;
    return primary?.type === 'VECTOR' ? primary : null;
  };
  const rebakeTypeOn = (deviceId: string, headId: string, label?: string) => {
    void getSharedTextSystem().then(async sys => {
      const d = docRef.current?.devices[deviceId] as TelaVectorDevice | undefined;
      const story = d?.objects.find(o => o.id === headId)?.studio?.type?.story;
      if (!d || !story) return;
      await sys.ensure(story);
      const latest = docRef.current?.devices[deviceId] as TelaVectorDevice | undefined; if (!latest) return;
      const bake = bakeType(sys, latest.objects, headId);
      if (bake) dispatchOp({ type: 'EDIT_VECTOR_DEVICE', deviceId, objects: latest.objects.map(o => bake.patches[o.id] ? { ...o, ...bake.patches[o.id] } : o), label: label ?? 'Rebake Type', coalesce: `text:${headId}` });
    });
  };
  const addEngineTextLayer = (vec: TelaVectorDevice, initialText = '') => {
    const t = makeTypeLayer({ w: vec.width, h: vec.height }, typeDefaults, initialText, vec.objects.filter(o => o.textRole === 'LAYER').length + 1);
    dispatchOp({ type: 'EDIT_VECTOR_DEVICE', deviceId: vec.id, objects: [...vec.objects, t], label: 'Text layer' });
    setStudioSelection([t.id]);
    if (initialText) rebakeTypeOn(vec.id, t.id, 'Typing');
    setEditingText(t.id);
  };
  /** Whole-object typography from the options row; engine type is restyled and re-composed. */
  const updateVectorObject = (deviceId: string, objectId: string, patch: Partial<TelaVectorObject>) => {
    const d = docRef.current?.devices[deviceId] as TelaVectorDevice | undefined;
    const o = d?.objects.find(x => x.id === objectId); if (!d || !o) return;
    if (!o.studio?.type?.story) { dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId, objectId, patch }); return; }
    dispatchOp({ type: 'EDIT_VECTOR_DEVICE', deviceId, objects: d.objects.map(x => x.id === objectId ? restyleTypeObject(x, patch as TypeStylePatch) : x), label: 'Typography', coalesce: `type-style:${objectId}` });
    rebakeTypeOn(deviceId, objectId, 'Typography');
  };

  const addTextLayerToFrame = (targetFrameId?: string | null, initialText = '') => {
    const cur = docRef.current;
    if (!cur) return;
    const targetFrame = cur.frames.find(f => f.id === (targetFrameId || activeFrameId)) || cur.frames[0];
    if (!targetFrame) return;
    const engineVec = proFocusVector(targetFrame.id);
    if (engineVec) { setActiveFrameId(targetFrame.id); addEngineTextLayer(engineVec, initialText); return; }
    const vecDeviceId = ensureVectorOverlayForFrame(targetFrame);
    const vec = docRef.current?.devices[vecDeviceId] as TelaVectorDevice | undefined;
    const n = (vec?.objects.filter(o => o.textRole === 'LAYER').length || 0) + 1;
    const w = vec?.width || targetFrame.w, h = vec?.height || targetFrame.h;
    const id = uid('obj');
    const t = typeDefaults;
    dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: vecDeviceId, object: {
      id, kind: 'TEXT', textRole: 'LAYER', objectLabel: `Text Layer ${n}`,
      x: 0, y: 0, w, h, rotation: 0, opacity: 1,
      fill: t.fill, stroke: 'none', strokeWidth: 0,
      fontFamily: t.fontFamily, fontSize: t.fontSize, fontWeight: t.fontWeight, fontStyle: t.fontStyle, underline: t.underline,
      textAlign: t.textAlign, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, textTransform: t.textTransform,
      wrap: true, padding: Math.min(96, Math.round(w * 0.1)), // 1in margins on a Letter page
      blocks: [{ id: uid('blk'), kind: 'p', text: initialText }],
      text: initialText,
    } });
    setActiveFrameId(targetFrame.id);
    setStudioSel(id);
    setTextEditRequest({ id, nonce: Date.now() });
  };

  // Type tool + a printable key: continue the selected text, else start a new text layer.
  const typeIntoText = (key: string) => {
    const vec = activeVectorDevice();
    const sel = vec && studioSel ? vec.objects.find(o => o.id === studioSel && o.kind === 'TEXT') : null;
    if (vec && sel && !sel.locked && sel.studio?.type?.story) {
      const story = appendText(sel.studio.type.story, key);
      dispatchOp({ type: 'EDIT_VECTOR_DEVICE', deviceId: vec.id, objects: vec.objects.map(o => o.id === sel.id ? { ...o, text: (o.text || '') + key, studio: { ...o.studio!, type: { ...o.studio!.type!, story } } } : o), label: 'Typing', coalesce: `text:${sel.id}` });
      rebakeTypeOn(vec.id, sel.id, 'Typing');
      setEditingText(sel.id);
      return;
    }
    if (vec && sel && !sel.locked) {
      const blocks: TelaBlock[] = sel.blocks?.length ? sel.blocks : [{ id: uid('blk'), kind: 'p', text: sel.text || '' }];
      const next = blocks.map((b, i) => i === blocks.length - 1 ? { ...b, text: (b.text || '') + key } : b);
      dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: vec.id, objectId: sel.id, patch: { blocks: next, text: next.map(b => b.text).join('\n') } });
      setTextEditRequest({ id: sel.id, nonce: Date.now() });
      return;
    }
    if (key.trim()) addTextLayerToFrame(activeFrameId, key);
  };
  const isTypeTool = (studioTool as string) === 'text' || studioTool === 'type';
  const typeKeyRef = useRef<(event: KeyboardEvent) => void>(() => {});
  typeKeyRef.current = event => {
    if (!isTypeTool || (posture !== 'STUDIO' && posture !== 'PAGE')) return;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""]')) return;
    // While the Pro Studio canvas is editing type, its own text surface owns the keys.
    if (editingText && proFocusVector()) return;
    event.preventDefault();
    typeIntoText(event.key);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => typeKeyRef.current(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const addShapeToActiveFrame = (kind: 'RECT' | 'CIRCLE' | 'STAR' | 'CALLOUT' = 'RECT', targetFrameId?: string) => {
    const cur = docRef.current;
    if (!cur) return;
    const frameId = targetFrameId || activeFrameId || cur.frames[0]?.id;
    const targetFrame = cur.frames.find(f => f.id === frameId) || cur.frames[0];
    if (!targetFrame) return;

    const vecDeviceId = ensureVectorOverlayForFrame(targetFrame);
    const latestVec = docRef.current?.devices[vecDeviceId] as TelaVectorDevice | undefined;
    const shapeNum = (latestVec?.objects.length || 0) + 1;
    const shapeId = uid('obj');
    const newShape: TelaVectorObject = {
      id: shapeId,
      kind,
      objectLabel: `${kind[0] + kind.slice(1).toLowerCase()} Layer ${shapeNum}`,
      x: Math.round(targetFrame.w * 0.15) + ((shapeNum - 1) % 4) * 16,
      y: 160 + ((shapeNum - 1) % 4) * 16,
      w: kind === 'CIRCLE' ? 140 : kind === 'STAR' ? 140 : 200,
      h: kind === 'CIRCLE' ? 140 : kind === 'STAR' ? 140 : 120,
      fill: kind === 'CALLOUT' ? '#FFFFFF' : 'rgba(0, 218, 243, 0.18)',
      stroke: kind === 'CALLOUT' ? '#D40055' : '#00DAF3',
      strokeWidth: 2,
      rx: kind === 'RECT' ? 8 : undefined,
      shadowColor: 'rgba(0,0,0,0.15)',
      shadowBlur: 10,
      shadowOffsetY: 3,
    };

    dispatchOp({
      type: 'ADD_VECTOR_OBJECT',
      deviceId: vecDeviceId,
      object: newShape,
    });
    setActiveFrameId(targetFrame.id);
    setStudioSel(shapeId);
    setStudioRightTab('properties');
  };

  const createTypographyObjectOnActiveFrame = (kind: 'TEXT' | '3D' | 'SHAPE_ARRAY' | 'GENERATIVE', patch?: Partial<TelaVectorObject>) => {
    const cur = docRef.current;
    if (!cur) return;
    const targetFrame = (activeFrameId ? cur.frames.find(f => f.id === activeFrameId) : null) || cur.frames[0];
    if (!targetFrame) return;

    const vecDeviceId = ensureVectorOverlayForFrame(targetFrame);
    const latestVec = docRef.current?.devices[vecDeviceId] as TelaVectorDevice | undefined;
    const typoNum = (latestVec?.objects.filter(o => o.kind === 'TEXT').length || 0) + 1;
    const boxId = uid('obj');
    const baseBox: TelaVectorObject = {
      id: boxId,
      kind: 'TEXT',
      objectLabel: patch?.objectLabel || `Typography Layer ${typoNum}`,
      x: Math.round(targetFrame.w * 0.1),
      y: 140,
      w: Math.min(420, Math.round(targetFrame.w * 0.8)),
      h: 180,
      fill: patch?.fill || '#1B1523',
      fontSize: patch?.fontSize || 24,
      fontFamily: patch?.fontFamily || 'Inter, system-ui, sans-serif',
      fontWeight: patch?.fontWeight || 700,
      wrap: true,
      padding: 16,
      rx: 8,
      text: patch?.text || 'CREATIVE TYPOGRAPHY',
      blocks: [
        { id: uid('blk'), kind: 'h2', text: patch?.text || 'Creative Typography' },
        { id: uid('blk'), kind: 'p', text: 'Sculpt 3D text, kinetic sacred arrays, Firefly generative textures, or explode into individual letters.' },
      ],
      ...patch,
    };

    dispatchOp({
      type: 'ADD_VECTOR_OBJECT',
      deviceId: vecDeviceId,
      object: baseBox,
    });
    setActiveFrameId(targetFrame.id);
    setStudioSel(boxId);
    setStudioRightTab('properties');
  };

  const explodeTextIntoLetters = (obj: TelaVectorObject) => {
    const cur = docRef.current;
    if (!cur) return;
    const targetFrame = cur.frames.find(f => f.deviceIds.includes(obj.id)) || (activeFrameId ? cur.frames.find(f => f.id === activeFrameId) : null) || cur.frames[0];
    const vecDev = targetFrame ? targetFrame.deviceIds.map(id => cur.devices[id]).find((d): d is TelaVectorDevice => d?.type === 'VECTOR') : null;
    if (!vecDev) return;

    const text = obj.text || 'TEXT';
    const letters = Array.from(text);
    if (!letters.length) return;

    const charWidth = Math.max(16, (obj.fontSize || 24) * 0.68);
    const startX = obj.x;
    const startY = obj.y;

    dispatchOp({
      type: 'DELETE_VECTOR_OBJECT',
      deviceId: vecDev.id,
      objectId: obj.id,
    });

    const newIds: string[] = [];
    letters.forEach((char, idx) => {
      const charId = uid('glyph');
      newIds.push(charId);
      const letterObj: TelaVectorObject = {
        id: charId,
        kind: 'TEXT',
        x: Math.round(startX + idx * charWidth),
        y: startY,
        w: Math.round(charWidth),
        h: Math.round((obj.fontSize || 24) * 1.3),
        text: char,
        fontSize: obj.fontSize || 24,
        fontFamily: obj.fontFamily || 'Inter, sans-serif',
        fontWeight: obj.fontWeight || 700,
        fill: obj.fill || '#1B1523',
        rotation: 0,
        opacity: 1,
        wrap: false,
        extrusion3D: obj.extrusion3D,
        material3D: obj.material3D,
        tiltX: obj.tiltX,
        tiltY: obj.tiltY,
        generativeEffect: obj.generativeEffect,
      };
      dispatchOp({
        type: 'ADD_VECTOR_OBJECT',
        deviceId: vecDev.id,
        object: letterObj,
      });
    });

    setStudioSelection(newIds);
  };

  // Studio image adds — dispatched here so the Studio's own rail/panel can add
  // layers while the device renders chrome-less (Studio hosts the controls).
  const studioAddImageFile = async (deviceId: string, file: File) => {
    setStudioImgBusy(true);
    try {
      if (isCameraRawFile(file)) {
        const decoded = await decodeCameraRawFile(file);
        dispatchOp({
          type: 'ADD_IMAGE_LAYER',
          deviceId,
          layer: makeImageLayer(decoded.dataUrl, file.name.replace(/\.[^.]+$/, ''), {
            mediaKind: 'IMAGE',
            intrinsicWidth: decoded.width,
            intrinsicHeight: decoded.height,
          }),
        });
        return;
      }
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
  // Lottie (.lottie / Lottie .json) → a native LOTTIE object on the artboard.
  const studioAddLottieFile = async (device: TelaVectorDevice, file: File, at?: { x: number; y: number }) => {
    setStudioImgBusy(true); setImportError(null);
    try {
      const object = await importLottieFile(file, { artboard: { width: device.width, height: device.height }, at });
      dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: device.id, object }); setStudioSel(object.id);
    } catch (error) { setImportError(error instanceof Error ? error.message : 'Lottie import failed.'); }
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
      { id: 'transform', label: 'Transform', icon: <Scan size={15}/>, submenu: [
        { id: 'flip-h', label: 'Flip horizontal', onSelect: () => {
          const cx = ('x' in ctx.object && typeof ctx.object.x === 'number' && 'width' in ctx.object && typeof ctx.object.width === 'number')
            ? ctx.object.x + ctx.object.width / 2
            : ('cx' in ctx.object && typeof ctx.object.cx === 'number') ? ctx.object.cx : 0;
          dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, patch: {
            transform: `scale(-1, 1) translate(${-2 * cx}, 0) ${ctx.object.transform || ''}`.trim()
          } });
        } },
        { id: 'flip-v', label: 'Flip vertical', onSelect: () => {
          const cy = ('y' in ctx.object && typeof ctx.object.y === 'number' && 'height' in ctx.object && typeof ctx.object.height === 'number')
            ? ctx.object.y + ctx.object.height / 2
            : ('cy' in ctx.object && typeof ctx.object.cy === 'number') ? ctx.object.cy : 0;
          dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, patch: {
            transform: `scale(1, -1) translate(0, ${-2 * cy}) ${ctx.object.transform || ''}`.trim()
          } });
        } },
        { id: 'rot-90-cw', label: 'Rotate 90° CW', onSelect: () => {
          dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, patch: {
            rotation: ((ctx.object.rotation || 0) + 90) % 360
          } });
        } },
        { id: 'rot-90-ccw', label: 'Rotate 90° CCW', onSelect: () => {
          dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, patch: {
            rotation: ((ctx.object.rotation || 0) - 90 + 360) % 360
          } });
        } },
      ] },
      { id: 'arrange', label: 'Arrange', icon: <Layers size={15}/>, submenu: [
        { id: 'front', label: 'Bring to front', shortcut: 'Ctrl+Shift+]', onSelect: () => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, toIndex: Math.max(0, objects.length - 1) }) },
        { id: 'forward', label: 'Bring forward', shortcut: 'Ctrl+]', onSelect: () => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, toIndex: index + 1 }) },
        { id: 'backward', label: 'Send backward', shortcut: 'Ctrl+[', onSelect: () => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, toIndex: index - 1 }) },
        { id: 'back', label: 'Send to back', shortcut: 'Ctrl+Shift+[', onSelect: () => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, toIndex: 0 }) },
      ] },
      { kind: 'separator' },
      { id: 'lock', label: ctx.object.locked ? 'Unlock object' : 'Lock object', shortcut: 'Ctrl+L', icon: <CheckCircle2 size={15}/>, checked: !!ctx.object.locked, onSelect: () => dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, patch: { locked: !ctx.object.locked } }) },
      { id: 'hide', label: ctx.object.hidden ? 'Show object' : 'Hide object', shortcut: 'Ctrl+3', icon: <Minus size={15}/>, checked: !ctx.object.hidden, onSelect: () => dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id, patch: { hidden: !ctx.object.hidden } }) },
      { kind: 'separator' },
      { id: 'ai-creative', label: 'AI Creative Suite', icon: <Sparkles size={15}/>, submenu: [
        { id: 'ai-relight', label: '✨ 3D Relight in Cinema Studio', onSelect: () => {
          setPosture('STUDIO');
        } },
        { id: 'ai-enhance', label: '✨ Micro-Texture Detail Upscale', onSelect: () => {
          setPosture('STUDIO');
        } },
        { id: 'ai-vector-forge', label: '✨ Vector Forge Refine Edge', onSelect: () => {
          if (ctx.object.kind === 'IMAGE') refineSelectedRegion(device as TelaVectorDevice, ctx.object);
        } }
      ] },
      { kind: 'separator' },
      { id: 'delete', label: 'Delete', shortcut: 'Del', icon: <Trash2 size={15}/>, danger: true, onSelect: () => { dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: ctx.deviceId, objectId: ctx.object.id }); setStudioSel(null); } },
    ];
  });

  const canvasContextMenu = useContextMenu<{ deviceId: string; point: { x: number; y: number } }>(ctx => {
    return [
      { kind: 'header', label: 'Artboard Actions' },
      { id: 'paste-here', label: 'Paste Here', shortcut: 'Ctrl+V', icon: <Clipboard size={15}/>, disabled: !vectorClipboard.current, onSelect: () => {
        if (vectorClipboard.current) {
          const o = structuredClone(vectorClipboard.current);
          o.id = uid('vec');
          if ('x' in o && typeof o.x === 'number') o.x = Math.round(ctx.point.x);
          if ('y' in o && typeof o.y === 'number') o.y = Math.round(ctx.point.y);
          dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: ctx.deviceId, object: o });
          setStudioSel(o.id);
        }
      } },
      { id: 'select-all', label: 'Select All', shortcut: 'Ctrl+A', icon: <MousePointer2 size={15}/>, onSelect: () => {
        const device = docRef.current?.devices[ctx.deviceId];
        if (device?.type === 'VECTOR') setStudioSelection(device.objects.map(o => o.id));
      } },
      { id: 'deselect', label: 'Deselect All', shortcut: 'Esc', onSelect: () => {
        setStudioSelection([]);
        setStudioSel(null);
      } },
      { kind: 'separator' },
      { id: 'view', label: 'View & Zoom', icon: <ZoomIn size={15}/>, submenu: [
        { id: 'zoom-100', label: 'Zoom 100%', shortcut: 'Ctrl+1', onSelect: () => setStudioZoom(1.0) },
        { id: 'zoom-fit', label: 'Fit Viewport', shortcut: 'Ctrl+0', onSelect: () => {
          const device = docRef.current?.devices[ctx.deviceId];
          if (device) fitStudioToDevice(device);
        } },
      ] },
      { id: 'guides', label: 'Rulers & Guides', icon: <Grid3X3 size={15}/>, submenu: [
        { id: 'add-h-guide', label: `Add Horizontal Guide at Y: ${Math.round(ctx.point.y)}px`, onSelect: () => {
          setStudioGuides(g => ({ ...g, y: [...g.y, Math.round(ctx.point.y)] }));
        } },
        { id: 'add-v-guide', label: `Add Vertical Guide at X: ${Math.round(ctx.point.x)}px`, onSelect: () => {
          setStudioGuides(g => ({ ...g, x: [...g.x, Math.round(ctx.point.x)] }));
        } },
        { id: 'clear-guides', label: 'Clear All Guides', danger: true, onSelect: () => setStudioGuides({ x: [], y: [] }) },
      ] },
      { kind: 'separator' },
      { id: 'quick-insert', label: 'Insert Object', icon: <Plus size={15}/>, submenu: [
        { id: 'ins-rect', label: 'Rectangle', shortcut: 'R', icon: <Square size={14}/>, onSelect: () => {
          dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: ctx.deviceId, object: {
            id: uid('vec'), kind: 'RECT', x: Math.round(ctx.point.x - 60), y: Math.round(ctx.point.y - 40), width: 120, height: 80, rx: 0, ry: 0, fill: '#00DAF3', stroke: 'none', strokeWidth: 0, opacity: 1, visible: true
          } });
        } },
        { id: 'ins-circle', label: 'Ellipse / Circle', shortcut: 'E', icon: <Circle size={14}/>, onSelect: () => {
          dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: ctx.deviceId, object: {
            id: uid('vec'), kind: 'ELLIPSE', cx: Math.round(ctx.point.x), cy: Math.round(ctx.point.y), rx: 50, ry: 50, fill: '#D40055', stroke: 'none', strokeWidth: 0, opacity: 1, visible: true
          } });
        } },
        { id: 'ins-text', label: 'Text Block', shortcut: 'T', icon: <Type size={14}/>, onSelect: () => {
          dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: ctx.deviceId, object: {
            id: uid('vec'), kind: 'TEXT', x: Math.round(ctx.point.x), y: Math.round(ctx.point.y), text: 'Heading', fontSize: 24, fontFamily: 'Inter', fontWeight: 'bold', fill: '#ffffff', stroke: 'none', strokeWidth: 0, opacity: 1, visible: true
          } });
        } },
      ] },
      { kind: 'separator' },
      { id: 'writing-studio', label: 'Screenplay & Writing Desk (Lorea)', icon: <FileText size={15}/>, onSelect: () => setWritingStudioOpen(true) },
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
      if (!mod && !event.altKey && focus.type === 'VECTOR' && (studioTool as string) !== 'text' && studioTool !== 'type') {
        const tools: Partial<Record<string, VectorTool>> = {
          v: 'select', a: 'direct', m: 'marquee', r: 'rect', e: 'ellipse', l: 'line', p: 'pen', t: 'text', b: 'ink',
        };
        if (tools[key]) { event.preventDefault(); setStudioTool(tools[key]!); return; }
      }
      if (!mod && !event.altKey && focus.type === 'IMAGE') {
        if (key === 'i') { event.preventDefault(); setColorEyedropperActive(a => !a); return; }
        if (key === 'c') { event.preventDefault(); setColoristSuiteOpen(o => !o); return; }
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
  }, [posture, studioDevId, studioSel, studioSelIds, studioTool, dispatchOp, setStudioSelection, setStudioSel]);

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

  const refreshList = async () => {
    const [mine, shared] = await Promise.all([listTelaDocs(), listSharedWithMe(TELA_CLOUD_KIND)]);
    const have = new Set(mine.map(m => m.id));
    // Canvases other people shared with you open on any device, even before this one has a copy.
    const fromOthers: TelaDocMeta[] = shared.filter(p => !have.has(p.localId)).map(p => ({ id: p.localId, ownerId: p.ownerId, title: p.title, sharedBy: p.names?.[p.ownerId] || 'a collaborator', ...(p.orgId ? { orgId: p.orgId } : {}), createdAt: p.createdAt, updatedAt: p.updatedAt }));
    setCanvasList([...mine, ...fromOthers].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
  };

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
    const d = (await loadTelaDocFreshest(id)) ?? (await loadSharedDoc<TelaDoc>(coProjectId(TELA_CLOUD_KIND, id)));
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
    if (kind!=='BLANK'&&kind!=='BOARD') {
      const recipe=recipes[kind];
      next.title=recipe.title;
      writer.blocks=recipe.blocks.map(([blockKind,text])=>makeBlock(blockKind,escapeHtml(text)));
      writer.story=storyFromBlocks(writer.blocks);
    }
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

  // Universal Library → Ambo slide template / scripture look as a live MOTION_TEMPLATE
  // object: into the focused vector artboard in Studio (filling it — the designers
  // re-flow to any aspect), else a new 1920×1080 artboard. Poster is baked after.
  const addMotionTemplateFromLibrary = (item: LibraryItem) => {
    const spec = motionSpecFromItem(item); if (!spec) return;
    const focus = studioFocus?.device;
    let deviceId: string, object: TelaVectorObject;
    if (posture === 'STUDIO' && focus?.type === 'VECTOR') {
      object = makeMotionTemplateObject(spec, { x: 0, y: 0, w: focus.width, h: focus.height });
      dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: focus.id, object }); deviceId = focus.id; setStudioSel(object.id);
    } else {
      object = makeMotionTemplateObject(spec, { x: 0, y: 0, w: 1920, h: 1080 });
      const dev: TelaVectorDevice = { id: uid('dev'), type: 'VECTOR', name: motionTemplateName(spec), width: 1920, height: 1080, objects: [object] };
      addFrame('BOARD', 'FREE', dev, dev.name!, { size: { w: 1920, h: 1080 } }); deviceId = dev.id;
      setShowHome(false); setPosture('STUDIO');
    }
    void renderMotionTemplatePoster(spec, object.w, object.h).then(posterSrc => { if (posterSrc) dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId, objectId: object.id, patch: { motionTemplate: { ...spec, posterSrc } } }); });
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

  // ── Import & Multi-page Pagination ─────────────────────────────────────────

  function paginateBlocksIntoPages(blocks: TelaBlock[], maxPageHeight = 880): TelaBlock[][] {
    const pages: TelaBlock[][] = [];
    let curPage: TelaBlock[] = [];
    let curHeight = 0;

    for (const b of blocks) {
      const textLen = (b.text || '').replace(/<[^>]+>/g, '').length;
      let bHeight = 40;
      if (b.kind === 'h1') bHeight = 90;
      else if (b.kind === 'h2') bHeight = 65;
      else if (b.kind === 'li') bHeight = Math.max(1, Math.ceil(textLen / 70)) * 26 + 10;
      else {
        const lines = Math.max(1, Math.ceil(textLen / 72));
        bHeight = lines * 26 + 18;
      }

      if (bHeight > maxPageHeight && b.kind === 'p') {
        const rawText = b.text || '';
        const sentences = rawText.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [rawText];
        let chunk = '';
        for (const s of sentences) {
          const sLen = s.replace(/<[^>]+>/g, '').length;
          const sH = Math.max(1, Math.ceil(sLen / 72)) * 26;
          if (curHeight + sH > maxPageHeight && curPage.length > 0) {
            if (chunk.trim()) {
              curPage.push({ id: newBlockId(), kind: 'p', text: chunk.trim() });
              chunk = '';
            }
            pages.push(curPage);
            curPage = [];
            curHeight = 0;
          }
          chunk += s;
          curHeight += sH;
        }
        if (chunk.trim()) {
          curPage.push({ id: newBlockId(), kind: 'p', text: chunk.trim() });
        }
        continue;
      }

      if (curHeight + bHeight > maxPageHeight && curPage.length > 0) {
        pages.push(curPage);
        curPage = [];
        curHeight = 0;
      }

      curPage.push(b);
      curHeight += bHeight;
    }

    if (curPage.length > 0 || pages.length === 0) {
      pages.push(curPage.length ? curPage : [makeBlock('p', '')]);
    }

    return pages;
  }

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
        const rawBlocks: TelaBlock[] = extracted.paragraphs.map(p => {
          const kind = p.heading === 1 ? 'h1' : p.heading >= 2 ? 'h2' : 'p';
          const m = p.html.match(/^<(h[1-3]|p)>([\s\S]*)<\/\1>$/);
          return { id: newBlockId(), kind, text: m ? m[2] : escapeHtml(p.text) } as TelaBlock;
        });
        const blocks = rawBlocks.length ? rawBlocks : [makeBlock('p', '')];
        const pageBlockGroups = paginateBlocksIntoPages(blocks);
        const title = extracted.title || file.name.replace(/\.[^.]+$/, '');
        const p = PRESETS.LETTER;
        const PAGE_GAP = 54;

        const curDoc = docRef.current;
        if (curDoc && curDoc.frames.length > 0 && !showHome) {
          const paperFrames = curDoc.frames.filter(f => f.kind === 'PAPER');
          const lastPaper = paperFrames[paperFrames.length - 1];
          const startY = lastPaper ? lastPaper.y + lastPaper.h + PAGE_GAP : (Math.max(0, ...curDoc.frames.map(f => f.y + f.h)) + PAGE_GAP);
          const startX = lastPaper ? lastPaper.x : 0;
          const pageOffset = paperFrames.length;

          let firstNewFrame: TelaFrame | null = null;
          pageBlockGroups.forEach((pageBlocks, idx) => {
            const dev: TelaWriterDevice = {
              id: uid('dev'),
              type: 'WRITER',
              blocks: pageBlocks,
              story: storyFromBlocks(pageBlocks),
            };
            const frame: TelaFrame = {
              id: uid('frame'),
              kind: 'PAPER',
              preset: 'LETTER',
              x: startX,
              y: startY + idx * (p.h + PAGE_GAP),
              w: p.w,
              h: p.h,
              deviceIds: [dev.id],
              label: `Page ${pageOffset + idx + 1}`,
            };
            if (!firstNewFrame) firstNewFrame = frame;
            dispatchOp({ type: 'ADD_FRAME', frame, devices: [dev] });
          });
          if (firstNewFrame) {
            const fnf = firstNewFrame;
            setActiveFrameId(fnf.id);
            requestAnimationFrame(() => fitFrame(fnf));
          }
        } else {
          const docId = newTelaId();
          const ownerId = auth.currentUser?.uid || 'local';
          const now = Date.now();
          const docDevices: Record<string, TelaDevice> = {};
          const docFrames: TelaFrame[] = pageBlockGroups.map((pageBlocks, idx) => {
            const dev: TelaWriterDevice = {
              id: uid('dev'),
              type: 'WRITER',
              blocks: pageBlocks,
              story: storyFromBlocks(pageBlocks),
            };
            docDevices[dev.id] = dev;
            return {
              id: uid('frame'),
              kind: 'PAPER',
              preset: 'LETTER',
              x: 0,
              y: idx * (p.h + PAGE_GAP),
              w: p.w,
              h: p.h,
              deviceIds: [dev.id],
              label: `Page ${idx + 1}`,
            };
          });

          const newDoc: TelaDoc = {
            id: docId,
            ownerId,
            title,
            frames: docFrames,
            devices: docDevices,
            bindings: [],
            createdAt: now,
            updatedAt: now,
          };
          openDoc(newDoc);
          setShowHome(false);
          setPosture('PAGE');
          requestAnimationFrame(() => fitFrame(docFrames[0]));
        }
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
        const pos = dropPos ? { x: dropPos.x + index * 44, y: dropPos.y + index * 44 } : undefined;
        if (isLottieFileName(file.name)) {
          // A Lottie lands as a vector artboard holding one native LOTTIE object (editable in Studio).
          try {
            const probe = await importLottieFile(file, { artboard: { width: 1e6, height: 1e6 } });
            const L = probe.lottie!;
            const k = Math.min(1, 1080 / Math.max(L.intrinsicWidth, L.intrinsicHeight));
            const w = Math.max(64, Math.round(L.intrinsicWidth * k)), h = Math.max(64, Math.round(L.intrinsicHeight * k));
            const object: TelaVectorObject = { ...probe, x: 0, y: 0, w, h };
            const dev: TelaVectorDevice = { id: uid('dev'), type: 'VECTOR', name: object.objectLabel || 'Animation', width: w, height: h, objects: [object] };
            addFrame('BOARD', 'FREE', dev, dev.name!, { size: { w, h }, pos });
            continue;
          } catch (error) {
            // A .json that isn't Lottie is still a valid generic asset; a broken .lottie is an error.
            if (/\.lottie$/i.test(file.name)) throw error;
          }
        }
        const kind = mediaKindFor(file);
        const uploaded = await uploadTelaAsset(file);
        const wide = kind === 'VIDEO' || kind === 'AUDIO' || kind === 'MODEL_3D';
        const size = kind === 'PDF' ? { w: 816, h: 1056 } : wide ? { w: 720, h: 405 } : { w: 560, h: 420 };
        const device: TelaMediaDevice = { id: uid('dev'), type: 'MEDIA', kind, name: file.name, src: uploaded.src, mimeType: file.type || 'application/octet-stream', size: file.size, width: size.w, height: size.h, storagePath: uploaded.storagePath, sessionOnly: uploaded.sessionOnly };
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
      if ((key === 'z' || key === 'y') && !isNativeUndoTarget(event.target)) {
        event.preventDefault();
        stepHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (key === 's') { event.preventDefault(); const current = docRef.current; if (current) void saveTelaDoc(current).then(({ ok, synced }) => setSaveState(ok ? (synced ? 'synced' : 'saved') : 'dirty')); }
      if (key === 'o') { event.preventDefault(); fileRef.current?.click(); }
      if (key === 'n') { event.preventDefault(); void createCanvas(); }
      if (key === 'p') { event.preventDefault(); const current = docRef.current; const target = current?.frames.find(frame => frame.id === activeFrameId) || current?.frames.find(frame => frame.kind === 'PAPER') || current?.frames[0]; if (target) setPrintFrameId(target.id); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [activeFrameId, stepHistory]);

  // A finished gesture (drag, slider scrub) seals its undo step.
  useEffect(() => {
    window.addEventListener('pointerup', sealHistoryStep);
    return () => window.removeEventListener('pointerup', sealHistoryStep);
  }, [sealHistoryStep]);

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

  // One page at natural size (96 px = 1 in) — the print portal and Prepress both render through this.
  // Non-printing guides (wrap templates, dielines) are dropped here so they never reach paper.
  const renderFrameForPrint = (frame: TelaFrame): React.ReactNode => (
    <div style={{ width: frame.w, minHeight: frame.h, background: '#fff', position: 'relative' }}>
      {frame.deviceIds.map((id, devIdx) => {
        const raw = doc?.devices[id];
        if (!raw) return null;
        const dev = raw.type === 'VECTOR' && raw.objects.some(isNonPrinting) ? { ...raw, objects: raw.objects.filter(o => !isNonPrinting(o)) } : raw;
        const isOverlay = devIdx > 0 && dev.type === 'VECTOR';
        return (
          <div key={id} style={isOverlay ? { position: 'absolute', inset: 0, zIndex: 10 + devIdx } : { position: 'relative', zIndex: 1 }}>
            {renderDevice(dev, true, isOverlay)}
          </div>
        );
      })}
    </div>
  );

  const addBlankPrintPages = (count: number, trimIn: [number, number]) => {
    const w = Math.round(trimIn[0] * 96), h = Math.round(trimIn[1] * 96);
    for (let i = 0; i < count; i++) {
      const cur = docRef.current; const last = cur?.frames[cur.frames.length - 1];
      const dev: TelaVectorDevice = { id: uid('dev'), type: 'VECTOR', name: 'Blank page', width: w, height: h, objects: [] };
      addFrame('PAPER', 'FREE', dev, `Page ${(cur?.frames.filter(f => f.kind === 'PAPER').length || 0) + 1}`, { pos: last ? { x: last.x, y: last.y + last.h + 54 } : { x: 0, y: 0 }, size: { w, h } });
    }
  };

  /** Wrap designer → a design board at the job's scale with the template as a locked non-printing guide. */
  const createWrapBoard = (board: { label: string; widthIn: number; heightIn: number; scale: number; guideSvg: string; job: WrapJob | null; dielineSpot?: SpotColor[] }) => {
    const w = Math.round(board.widthIn * board.scale * 96), h = Math.round(board.heightIn * board.scale * 96);
    const cur = docRef.current; const last = cur?.frames[cur.frames.length - 1];
    const guideSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(board.guideSvg)}`;
    const guide: TelaVectorObject = { id: uid('obj'), kind: 'IMAGE', x: 0, y: 0, w, h, fill: 'none', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 0.85, sourceImageSrc: guideSrc, sourceCrop: { x: 0, y: 0, width: w, height: h, sourceWidth: w, sourceHeight: h }, objectLabel: `${NON_PRINTING_LABEL}: ${board.label}`, locked: true };
    const dev: TelaVectorDevice = { id: uid('dev'), type: 'VECTOR', name: board.label, width: w, height: h, objects: [guide] };
    const frame = addFrame('PAPER', 'FREE', dev, board.scale === 1 ? board.label : `${board.label} (1:${Math.round(1 / board.scale)})`, { pos: last ? { x: 0, y: last.y + last.h + 80 } : { x: 0, y: 0 }, size: { w, h } });
    const wrapProduct = board.scale === 1 ? 'object-wrap' : 'vehicle-wrap';
    // Vehicles: where every print panel sits on the board, so Prepress can export each at full size.
    const wrap = board.job && !board.job.dieline
      ? { scale: board.scale, panels: vehiclePlacements(board.job).flatMap(({ surface, ox, oy, tile }) => tile.panels.map((p, i) => ({ label: `${surface.label} P${i + 1}`, rectIn: { x: ox + p.rect.x, y: oy + p.rect.y, w: p.rect.w, h: p.rect.h }, printW: p.printW, printH: p.printH }))) }
      : undefined;
    // Labels, sleeves, cartons: the flat sits at (pad, pad) on the guide, so shift its die lines onto the board.
    const dl = board.job?.dieline || null;
    const pad = dl ? (board.widthIn - dl.flatIn[0]) / 2 : 0;
    const dieline = dl ? { cut: dl.cut.map(d => translatePath(d, pad, pad)), crease: dl.crease.map(d => translatePath(d, pad, pad)) } : undefined;
    dispatchOp({ type: 'SET_PRINT_SPEC', spec: defaultSpecFor(wrapProduct, { trimIn: [w / 96, h / 96], bleedIn: wrapProduct === 'vehicle-wrap' ? 3 * board.scale : 0.0625, safeIn: wrapProduct === 'vehicle-wrap' ? 4 * board.scale : 0.125, spotColors: board.dielineSpot || [], pageFrameIds: [frame.id], ...(wrap ? { wrap } : {}), ...(dieline ? { dieline } : {}) }) });
    setPrepressOpen(false); setPosture('STUDIO');
  };
  const printPageSize = printFrame
    ? (printFrame.kind === 'PAPER' ? `${printFrame.w / 96}in ${printFrame.h / 96}in` : `${printFrame.w}px ${printFrame.h}px`)
    : '8.5in 11in';

  // ── Device rendering — ONE shared code path (also used by TelaEmbed) ─────────

  const addTextLayerRef = useRef(addTextLayerToFrame);
  addTextLayerRef.current = addTextLayerToFrame;
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
    chrome: false,
    vectorTool: (studioTool === 'type' ? 'text' : ['select', 'direct', 'marquee', 'rect', 'ellipse', 'line', 'pen', 'text', 'ink'].includes(studioTool as string) ? studioTool : 'select') as VectorTool,
    onVectorTypeAt: deviceId => addTextLayerRef.current(docRef.current?.frames.find(f => f.deviceIds.includes(deviceId))?.id),
    vectorEditRequest: textEditRequest,
    onVectorToolChange: t => setStudioTool(t as any),
    selectedVectorId: studioSel,
    selectedVectorIds: studioSelIds,
    onSelectVector: setStudioSel,
    onSelectVectorIds: setStudioSelection,
    selectedImageLayerId: studioSel,
    onSelectImageLayer: setStudioSel,
  }), [doc?.devices, dispatchOp, writerTexts, writerList, baseList, formulaContext, handleWriterInteraction, studioTool, studioSel, studioSelIds, setStudioSel, setStudioSelection, textEditRequest]);

  const renderDevice = (device: TelaDevice, readOnly = false, overlay = false) => renderTelaDevice(device, renderCtx, readOnly, overlay);

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
    : cloudSync === 'syncing' ? 'Saving to cloud…'
    : cloudSync === 'synced' ? 'Saved to cloud'
    : cloudSync === 'offline' ? 'Offline · saved on this device'
    : cloudSync === 'error' ? 'Saved on this device · cloud retrying'
    : saveState === 'synced' ? 'Saved · synced'
    : saveState === 'saved' ? (storageMode === 'opfs' ? 'Saved on this device' : 'Saved (browser storage)')
    : 'Saved';

  const openEmbedDemo = () => { const cur = docRef.current; if (cur) void saveTelaDoc(cur); window.dispatchEvent(new CustomEvent('plajah:openTelaEmbedDemo', { detail: { docId: cur?.id } })); };
  const topBtn = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[.78rem] font-semibold text-white/80 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] transition-colors shrink-0';
  // The header collapses with its own width (container queries) instead of overflowing the frame:
  // secondary labels go icon-only, then the primary ones, then the extras fold into "More".
  const hdrLabel = '@max-[1720px]:hidden';
  const hdrLabel2 = '@max-[1240px]:hidden';
  const hdrExtra = '@max-[1100px]:hidden';

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
      <div className="flex-1 w-full h-full min-h-0 grid place-items-center text-white/30 text-sm" style={{ background: 'var(--bg-color, #070609)' }}>
        Opening Tela…
      </div>
    );
  }

  if (merchStudioOpen) {
    return <React.Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-[#0b0a0f] text-white/60">Loading Merch Designer…</div>}>
      <MerchDesignerStudio onClose={() => setMerchStudioOpen(false)}/>
    </React.Suspense>;
  }

  if (showHome) {
    return <>
      <input ref={fileRef} type="file" accept={`${SUPPORTED_IMPORT_ACCEPT},.csv,.xlsx,.tela`} className="hidden" onChange={e => { const file=e.target.files?.[0]; if(file)void handleImportFile(file); e.target.value=''; }}/>
      <TelaHome recent={canvasList || []} viewerUid={auth.currentUser?.uid || null} memberOrgIds={memberOrgIds} orgNames={orgNames} onOpen={id => void openCanvas(id)} onCreate={kind => void createHomeDocument(kind)} onChooseStyle={entry => void createStyleDocument(entry)} onChoosePublication={template => void createPublicationDocument(template)} onChooseTemplate={template => void createTemplateDocument(template)} onImport={() => fileRef.current?.click()} onOpenMerch={() => setMerchStudioOpen(true)} onBack={onBack}/>
    </>;
  }

  return (
    <div className="flex-1 w-full h-full min-h-0 flex flex-col overflow-hidden select-none" style={{ background: 'var(--bg-color, #070609)' }}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header
        ref={collabAnchorRef}
        className="@container shrink-0 flex items-center gap-2 px-3 h-14 border-b min-w-0"
        style={{ borderColor: 'var(--border-color, rgba(255,255,255,0.08))', background: 'linear-gradient(180deg,#140D20,#0E0A16)' }}
      >
        {returnTo ? (
          <button
            className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-full text-[.72rem] font-bold text-white bg-white/[0.07] border border-white/[0.14] hover:bg-white/[0.12]"
            onClick={returnTo.onReturn}
            title={`Back to ${returnTo.label}`}
          >
            <ChevronLeft size={14} /> <span className="max-w-[160px] truncate">Back to {returnTo.label}</span>
          </button>
        ) : onBack && (
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
          className="bg-transparent border border-transparent hover:border-white/[0.12] focus:border-white/[0.25] rounded-[9px] outline-none text-white text-[.9rem] font-semibold px-2.5 h-9 w-[200px] @max-[1720px]:w-[150px] @max-[1240px]:w-[110px] min-w-0 transition-colors"
        />

        {/* Posture switch — Unified Studio UI */}
        <div className="flex items-center rounded-[11px] border border-white/[0.12] bg-white/[0.04] p-0.5 ml-1">
          <button
            onClick={() => switchPosture('STUDIO')}
            className="h-8 px-3.5 rounded-[9px] text-[.72rem] font-bold tracking-wide transition-colors"
            style={posture === 'STUDIO' && studioDocView === 'focus'
              ? { background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))', color: '#fff', boxShadow: 'var(--pj-glow-brand, 0 6px 22px rgba(212,0,85,.34))' }
              : { color: 'rgba(255,255,255,0.55)' }}
            title="Studio Workspace — precision creative & productivity tools"
          >
            Studio
          </button>
          <button
            onClick={() => switchPosture('PAGE')}
            className="h-8 px-3.5 rounded-[9px] text-[.72rem] font-bold tracking-wide transition-colors"
            style={(posture === 'PAGE' || (posture === 'STUDIO' && studioDocView === 'continuous'))
              ? { background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))', color: '#fff', boxShadow: 'var(--pj-glow-brand, 0 6px 22px rgba(212,0,85,.34))' }
              : { color: 'rgba(255,255,255,0.55)' }}
            title="Page Document View — continuous scroll with full Studio tools"
          >
            Page
          </button>
          <button
            onClick={() => switchPosture('BOARD')}
            className="h-8 px-3.5 rounded-[9px] text-[.72rem] font-bold tracking-wide transition-colors"
            style={posture === 'BOARD'
              ? { background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))', color: '#fff', boxShadow: 'var(--pj-glow-brand, 0 6px 22px rgba(212,0,85,.34))' }
              : { color: 'rgba(255,255,255,0.55)' }}
            title="Spatial Infinite Board"
          >
            Board
          </button>
        </div>

        {/* Local AI Studio */}
        <button
          onClick={() => setLocalStudioOpen(true)}
          className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-[9px] text-[.72rem] font-bold text-[#FF8C00] bg-[#D40055]/10 border border-[#D40055]/30 hover:bg-[#D40055]/20 transition-all shadow-sm"
          title="Open Local Creative Studio (On-Device GPU)"
        >
          <Wand2 size={13} className="text-[#D40055]" />
          <span className={hdrLabel}>AI Studio</span>
          <span className="@max-[1720px]:hidden text-[9px] font-extrabold text-emerald-400 uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-500/15">Local</span>
        </button>

        {/* PAI Generations Gallery */}
        <button
          onClick={() => setPaiGalleryOpen(true)}
          className="@max-[1100px]:hidden shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-[9px] text-[.72rem] font-bold text-sky-400 bg-sky-500/10 border border-sky-500/30 hover:bg-sky-500/20 transition-all shadow-sm"
          title="Open PAI Generations Gallery (Your Past AI Creations)"
        >
          <Sparkles size={13} className="text-sky-400" />
          <span className={hdrLabel}>PAI Gallery</span>
        </button>

        {/* Comic Studio (Inline Variant 2 Page-Layout Mode) */}
        <button
          onClick={toggleInlineComicLayoutMode}
          className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-[9px] text-[.72rem] font-bold transition-all shadow-sm"
          style={
            comicLayoutMode
              ? {
                  background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))',
                  color: '#fff',
                  boxShadow: 'var(--pj-glow-brand, 0 6px 22px rgba(212,0,85,.34))',
                }
              : {
                  color: '#d8b4fe',
                  background: 'rgba(168,85,247,0.1)',
                  border: '1px solid rgba(168,85,247,0.3)',
                }
          }
          title="Toggle Native Comic & Manga Page-Layout Mode (Variant 2)"
        >
          <BookOpen size={13} className={comicLayoutMode ? 'text-white' : 'text-purple-300'} />
          <span className={hdrLabel}>Comic Studio</span>
        </button>

        {/* Classwork — bring in lessons, worksheets, quizzes and keys (teachers & education staff) */}
        {(classwork || isEducator) && (
          <button
            onClick={() => setClassworkOpen(true)}
            className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-[9px] text-[.72rem] font-bold transition-all shadow-sm"
            style={classworkOpen
              ? { background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))', color: '#fff' }
              : { color: '#FFB15C', background: 'rgba(255,140,0,0.1)', border: '1px solid rgba(255,140,0,0.32)' }}
            title="Classwork — turn lessons, worksheets, quizzes and answer keys into Tela docs and send them to a class"
          >
            <GraduationCap size={13} />
            <span className={hdrLabel}>Classwork</span>
          </button>
        )}

        {/* Templates — save this document as a template (me / the org / everyone) or start from the shared library */}
        <div className="relative shrink-0">
          <button
            onClick={() => setTemplateMenu(m => (m === 'menu' ? null : 'menu'))}
            aria-expanded={templateMenu === 'menu'}
            className="flex items-center gap-1.5 h-8 px-3 rounded-[9px] text-[.72rem] font-bold text-violet-200 bg-violet-500/10 border border-violet-400/30 hover:bg-violet-500/20 transition-all shadow-sm"
            title="Templates — save this document as a template, or start from the shared library"
          >
            <LayoutTemplate size={13} />
            <span className={hdrLabel}>Templates</span>
          </button>
          {templateMenu === 'menu' && (
            <div className="absolute right-0 top-9 z-[60] w-56 rounded-xl border border-white/15 bg-[#14111d] p-1.5 shadow-2xl">
              <button disabled={!doc} onClick={() => setTemplateMenu('save')} className="w-full text-left px-3 py-2 rounded-lg text-[.75rem] text-white/85 hover:bg-white/10 disabled:opacity-40">Save as template…</button>
              <button onClick={() => setTemplateMenu('library')} className="w-full text-left px-3 py-2 rounded-lg text-[.75rem] text-white/85 hover:bg-white/10">Template library</button>
            </div>
          )}
        </div>

        {/* Pro Vector Studio quick button */}
        {posture !== 'STUDIO' && (
          <button
            onClick={() => switchPosture('STUDIO')}
            className="flex items-center gap-1.5 h-8 px-3 rounded-[9px] text-[.72rem] font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 transition-all shadow-sm"
            title="Switch to Pro Vector Studio (18 Precision Tools)"
          >
            <PenLine size={13} className="text-cyan-300" />
            <span className={hdrLabel}>Pro Studio</span>
          </button>
        )}

        {/* ＋ Device */}
        <div className="relative">
          <button className={topBtn} onClick={() => { setDeviceMenuOpen(o => !o); setPresetMenuOpen(false); setCanvasesOpen(false); }}>
            <Plus size={15} /> <span className={hdrLabel2}>Device</span> <ChevronDown size={13} className="opacity-60" />
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
          <FileUp size={15} /> <span className={hdrLabel2}>{importBusy ? 'Importing…' : 'Import'}</span>
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
          <FileDown size={15} /> <span className={hdrLabel2}>Export PDF</span>
        </button>
        <button className={`${topBtn} ${hdrExtra}`} onClick={() => doc && downloadTelaHtml(doc, activeFrameId || undefined)} title="Export the active Tela frame as a responsive standalone HTML page">
          <Monitor size={15} /> <span className={hdrLabel}>Export HTML</span>
        </button>

        {/* Reference-embed demo — reference-not-export + lock→propagate, live */}
        <button
          className={`${topBtn} ${hdrExtra}`}
          title="See this doc embedded three ways — live-editable, follow-latest, and pinned"
          onClick={openEmbedDemo}
        >
          <Link2 size={15} /> <span className={hdrLabel}>Embed demo</span>
        </button>

        {/* Narrow header: the extras fold into one menu */}
        <div className="relative hidden @max-[1100px]:block shrink-0">
          <button className={topBtn} title="More" aria-label="More" aria-expanded={headerMoreOpen} onClick={() => setHeaderMoreOpen(o => !o)}><MoreHorizontal size={15} /></button>
          {headerMoreOpen && (
            <div style={{ ...menuStyle, left: 'auto', right: 0 }} onMouseLeave={() => setHeaderMoreOpen(false)}>
              <button className={menuItem} onClick={() => { setPaiGalleryOpen(true); setHeaderMoreOpen(false); }}><Sparkles size={15} className="text-sky-400" /> PAI Gallery</button>
              <button className={menuItem} onClick={() => { if (doc) downloadTelaHtml(doc, activeFrameId || undefined); setHeaderMoreOpen(false); }}><Monitor size={15} /> Export HTML</button>
              <button className={menuItem} onClick={() => { openEmbedDemo(); setHeaderMoreOpen(false); }}><Link2 size={15} /> Embed demo</button>
            </div>
          )}
        </div>

        {/* People, team chat + call, shared history (components/collab) */}
        <CollabDock
          co={co}
          kind={TELA_CLOUD_KIND}
          title={doc.title || 'Untitled canvas'}
          doc={doc}
          localId={doc.id}
          serialize={(d) => serializeTelaDocForStore(d)}
          restoreSolo={async (json) => {
            const restored = await telaDocFromStoredJson(json);
            const next = { ...restored, id: doc.id, updatedAt: Date.now() };
            openDoc(next);
            const { ok, synced } = await saveTelaDoc(next);
            setSaveState(ok ? (synced ? 'synced' : 'saved') : 'dirty');
          }}
          anchor={collabAnchorRef}
          pill="inline"
          open={collabOpen}
          onOpenChange={setCollabOpen}
        />
        {/* Save state — click for version history */}
        <div className="relative">
          <button
            className="text-[.68rem] font-semibold px-2.5 h-9 inline-flex items-center gap-1 rounded-[10px] border shrink-0 whitespace-nowrap"
            style={{
              color: saveState === 'dirty' ? 'var(--pj-warning, #F59E0B)' : saveState === 'synced' || cloudSync === 'synced' ? 'var(--pj-success, #06D6A0)' : 'rgba(255,255,255,0.55)',
              borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
            }}
            title="Version history"
            onClick={() => setHistoryOpen(o => !o)}
          >
            {saveLabel}<ChevronDown size={12} className="opacity-60" />
          </button>
          {historyOpen && doc && (
            <div style={{ ...menuStyle, width: 320, padding: 12 }} className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <CreativeVersionHistory
                kind={TELA_CLOUD_KIND}
                localId={doc.id}
                title={doc.title || 'Untitled canvas'}
                getCurrentJson={() => serializeTelaDocForStore(docRef.current ?? doc)}
                onRestore={async (json) => {
                  const restored = await telaDocFromStoredJson(json);
                  const next = { ...restored, id: doc.id, updatedAt: Date.now() };
                  openDoc(next);
                  const { ok, synced } = await saveTelaDoc(next);
                  setSaveState(ok ? (synced ? 'synced' : 'saved') : 'dirty');
                  setHistoryOpen(false);
                }}
              />
              <CreativeStorageMeter />
            </div>
          )}
        </div>

        {/* My Canvases */}
        <div className="relative">
          <button className={topBtn} onClick={() => { setCanvasesOpen(o => !o); if (!canvasesOpen) void refreshList(); setDeviceMenuOpen(false); setPresetMenuOpen(false); }}>
            <Folder size={15} /> <span className={hdrLabel2}>My Canvases</span> <ChevronDown size={13} className="opacity-60" />
          </button>
          {canvasesOpen && (
            <div style={{ ...menuStyle, left: 'auto', right: 0, minWidth: 290 }}>
              <button className={menuItem} onClick={createCanvas}>
                <FilePlus2 size={15} className="text-[var(--pj-orange,#FF8C00)]" /> New canvas
              </button>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '5px 4px' }} />
              <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                {(canvasList || []).filter(m => isMine(m, auth.currentUser?.uid) || isSharedWithMe(m, auth.currentUser?.uid)).map(m => (
                  <div key={m.id} className="flex items-center gap-1">
                    <button
                      className={`${menuItem} flex-1 min-w-0`}
                      onClick={() => void openCanvas(m.id)}
                      style={m.id === doc.id ? { color: 'var(--pj-cyan, #00DAF3)' } : undefined}
                    >
                      <span className="truncate">{m.title || 'Untitled canvas'}{m.sharedBy ? ` · shared by ${m.sharedBy}` : ''}</span>
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
        {(['FILE','EDIT','SELECT','INSERT','DOCUMENT','EXPORT','ASSIGNMENT'] as const).map(menu => <div key={menu} className="relative">
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
              <button className={menuBarItem} onClick={() => { setHistoryOpen(true); setAppMenuOpen(null); }}><HistoryIcon size={14}/>Version history</button>
              <button className={menuBarItem} onClick={() => { downloadTelaBoard(doc); setAppMenuOpen(null); }}><FileDown size={14}/>Download Tela board<span className="ml-auto text-[9px] text-white/25">.tela</span></button>
              <div className="h-px my-1 bg-white/[.07]"/>
              <button className={menuBarItem} onClick={() => { exportPdf(); setAppMenuOpen(null); }} disabled={!activeFrame}><FileDown size={14}/>Print / save active page as PDF<span className="ml-auto text-[9px] text-white/25">Ctrl+P</span></button>
              <button className={menuBarItem} onClick={() => { setPrepressOpen(true); setAppMenuOpen(null); }} data-testid="open-prepress"><Printer size={14} color="#8FF5FF"/>Prepress &amp; print production…<span className="ml-auto text-[9px] text-white/25">Press · home · wraps</span></button>
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
              <div className="h-px my-1 bg-white/[.07]"/>
              <div className="px-3 py-1 text-[9px] font-extrabold uppercase tracking-[.12em] text-[#a78bfa]">Local AI Creative Suite</div>
              <button className={menuBarItem} onClick={() => { setComicStudioOpen(true); setAppMenuOpen(null); }}><BookOpen size={14} color="#a78bfa"/>Comic & Storybook Studio<span className="ml-auto text-[9px] text-[#34d399]">Local GPU</span></button>
              <button className={menuBarItem} onClick={() => { setMerchStudioOpen(true); setAppMenuOpen(null); }}><BoxIcon size={14} color="#ff5a8a"/>Merch Designer<span className="ml-auto text-[9px] text-[#34d399]">3D + GPU</span></button>
              <button className={menuBarItem} onClick={() => { setLocalStudioOpen(true); setAppMenuOpen(null); }}><Wand2 size={14} color="#f59e0b"/>Local Creative Studio<span className="ml-auto text-[9px] text-[#34d399]">Local GPU</span></button>
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
              <button className={menuBarItem} onClick={() => { stepHistory('undo'); setAppMenuOpen(null); }} disabled={!historyDepth.past || !!doc.locked}><Undo2 size={14}/>Undo{historyRef.current.past.length ? ` ${historyRef.current.past[historyRef.current.past.length - 1].label.toLowerCase()}` : ''}<span className="ml-auto text-[9px] text-white/25">Ctrl+Z</span></button>
              <button className={menuBarItem} onClick={() => { stepHistory('redo'); setAppMenuOpen(null); }} disabled={!historyDepth.future || !!doc.locked}><Redo2 size={14}/>Redo{historyRef.current.future.length ? ` ${historyRef.current.future[historyRef.current.future.length - 1].label.toLowerCase()}` : ''}<span className="ml-auto text-[9px] text-white/25">Ctrl+Shift+Z</span></button>
              <div className="h-px my-1 bg-white/[.07]"/>
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
            {menu === 'SELECT' && <>
              <div className="px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[.12em] text-white/28">Selection Suite (Photoshop Standard)</div>
              <button className={menuBarItem} onClick={() => {
                const focus = activeDevice;
                if (focus?.type === 'IMAGE') {
                  setRasterSelection(selectAll(focus.width, focus.height));
                } else {
                  selectAllStudioItems();
                }
                setAppMenuOpen(null);
              }}><Scan size={14}/>Select All<span className="ml-auto text-[9px] text-white/25">Ctrl+A</span></button>
              <button className={menuBarItem} onClick={() => {
                setRasterSelection(null);
                setStudioSel(null);
                setAppMenuOpen(null);
              }}><X size={14}/>Deselect<span className="ml-auto text-[9px] text-white/25">Ctrl+D</span></button>
              <button className={menuBarItem} onClick={() => {
                const focus = activeDevice;
                if (focus?.type === 'IMAGE') {
                  if (rasterSelection?.bounds) {
                    setRasterSelection(invertSelection(rasterSelection));
                  } else {
                    setRasterSelection(selectAll(focus.width, focus.height));
                  }
                }
                setAppMenuOpen(null);
              }}><FlipHorizontal size={14} className="text-[#00DAF3]"/><strong className="text-white">Inverse Selection</strong><span className="ml-auto text-[9px] text-[#00DAF3]">Ctrl+Shift+I</span></button>
              
              <div className="h-px my-1 bg-white/[.07]"/>
              <div className="px-3 py-1 text-[9px] font-extrabold uppercase tracking-[.12em] text-white/28">Selection Modifiers</div>
              <button className={menuBarItem} disabled={!rasterSelection?.bounds} onClick={() => {
                if (rasterSelection) setRasterSelection(featherSelection(rasterSelection, 10));
                setAppMenuOpen(null);
              }}><Sliders size={14}/>Feather Selection (10px)…<span className="ml-auto text-[9px] text-white/25">Shift+F6</span></button>
              <button className={menuBarItem} disabled={!rasterSelection?.bounds} onClick={() => {
                if (rasterSelection) setRasterSelection(expandSelection(rasterSelection, 10));
                setAppMenuOpen(null);
              }}><Maximize2 size={14}/>Expand Selection (10px)…</button>
              <button className={menuBarItem} disabled={!rasterSelection?.bounds} onClick={() => {
                if (rasterSelection) setRasterSelection(contractSelection(rasterSelection, 10));
                setAppMenuOpen(null);
              }}><Minimize2 size={14}/>Contract Selection (10px)…</button>
              <button className={menuBarItem} disabled={!rasterSelection?.bounds} onClick={() => {
                if (rasterSelection) setRasterSelection(smoothSelection(rasterSelection, 5));
                setAppMenuOpen(null);
              }}><Sparkles size={14}/>Smooth Edges…</button>
              <button className={menuBarItem} disabled={!rasterSelection?.bounds} onClick={() => {
                if (rasterSelection) setRasterSelection(borderSelection(rasterSelection, 10));
                setAppMenuOpen(null);
              }}><Square size={14}/>Border Frame (10px)…</button>

              <div className="h-px my-1 bg-white/[.07]"/>
              <div className="px-3 py-1 text-[9px] font-extrabold uppercase tracking-[.12em] text-[#a78bfa]">AI & Layer Actions</div>
              <button className={menuBarItem} onClick={() => {
                setImageSelectionTool('brush_inpaint');
                setAppMenuOpen(null);
              }}><Paintbrush size={14} className="text-[#ef4444]"/>Generative Fill Inpaint Brush<span className="ml-auto text-[9px] text-[#ef4444]">B</span></button>
              <button className={menuBarItem} onClick={() => {
                setImageSelectionTool('brush_erase');
                setAppMenuOpen(null);
              }}><Eraser size={14} className="text-white"/>Mask Eraser<span className="ml-auto text-[9px] text-white/40">E</span></button>
              <button className={menuBarItem} onClick={() => {
                setImageSelectionTool('select_subject');
                setAppMenuOpen(null);
              }}><Wand2 size={14} className="text-purple-300"/>Select Subject (Meta SAM AI)<span className="ml-auto text-[9px] text-[#34d399]">AI</span></button>
              <button className={menuBarItem} disabled={!rasterSelection?.bounds} onClick={() => {
                const focus = activeDevice;
                if (focus?.type === 'IMAGE' && studioSel) {
                  const maskUrl = selectionToDataUrl(rasterSelection!, 'alpha');
                  dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: focus.id, layerId: studioSel, patch: { mask: { kind: 'ALPHA_IMAGE', enabled: true, src: maskUrl, invert: false } } });
                }
                setAppMenuOpen(null);
              }}><Layers size={14}/>Create Layer Mask from Selection</button>
              <button className={menuBarItem} disabled={!rasterSelection?.bounds} onClick={() => {
                const focus = activeDevice;
                if (focus?.type === 'IMAGE' && studioSel) {
                  const lyr = focus.layers.find(l => l.id === studioSel);
                  if (lyr && rasterSelection) {
                    void layerViaCopy(lyr, rasterSelection, focus.width, focus.height).then(copy => {
                      if (copy) dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId: focus.id, layer: copy });
                    });
                  }
                }
                setAppMenuOpen(null);
              }}><CopyPlus size={14}/>New Layer via Copy<span className="ml-auto text-[9px] text-white/25">Ctrl+J</span></button>
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
      {/* ── Surface ─────────────────────────────────────────────────────────── */}
      {(posture === 'STUDIO' || posture === 'PAGE') ? (() => {
        const isContinuousMode = posture === 'PAGE' || studioDocView === 'continuous';
        const activeFrame = (activeFrameId ? doc.frames.find(f => f.id === activeFrameId) : null) || doc.frames[0] || null;
        const activeDevice = activeFrame ? activeFrame.deviceIds.map(id => doc.devices[id]).find(Boolean) || null : null;

        if (!activeFrame || !activeDevice) {
          return (
            <div className="flex-1 grid place-items-center" style={{ background: '#141318' }}>
              <div className="text-center px-10 py-12 rounded-[var(--pj-radius-xl,28px)] border" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.035)', maxWidth: 440 }}>
                <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] mb-4 text-white" style={{ background: 'var(--pj-grad-spatial, linear-gradient(135deg,#6B0099,#00DAF3))' }}>
                  <PenLine size={20} />
                </span>
                <h2 className="font-display italic text-white text-[1.3rem] mb-2">The Studio</h2>
                <p className="text-[.82rem] text-white/55 leading-relaxed mb-5">
                  Create a document page, spreadsheet, vector artboard, or image canvas to begin designing.
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[.78rem] font-bold text-white" style={{ background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' }} onClick={addWriterPage}><Type size={15} /> Writer Page</button>
                  <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[.78rem] font-bold text-white" style={{ background: 'rgba(0,218,243,0.2)', border: '1px solid rgba(0,218,243,0.4)' }} onClick={addGridSheet}><Grid3X3 size={15} /> Grid Sheet</button>
                  <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[.78rem] font-bold text-white" style={{ background: 'var(--pj-grad-spatial, linear-gradient(135deg,#6B0099,#00DAF3))' }} onClick={addVectorArtboard}><Shapes size={15} /> Vector</button>
                  <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[.78rem] font-bold text-white" style={{ background: 'rgba(255,255,255,0.1)' }} onClick={addImageCanvas}><ImageIcon size={15} /> Image</button>
                </div>
              </div>
            </div>
          );
        }

        const isVec = activeDevice.type === 'VECTOR';
        const isImg = activeDevice.type === 'IMAGE';
        const isWriter = activeDevice.type === 'WRITER';
        const isGrid = activeDevice.type === 'GRID';
        const isBase = activeDevice.type === 'BASE';
        const isForm = activeDevice.type === 'FORM';
        const isNotes = activeDevice.type === 'NOTES';
        const isProductivity = isWriter || isGrid || isBase || isForm || isNotes || activeDevice.type === 'MEDIA';

        const focus = activeDevice;
        const vec = isVec ? (activeDevice as TelaVectorDevice) : null;
        const img = isImg ? (activeDevice as TelaImageDevice) : null;

        const focusWidth = isVec ? (activeDevice as TelaVectorDevice).width : isImg ? (activeDevice as TelaImageDevice).width : activeFrame.w;
        const focusHeight = isVec ? (activeDevice as TelaVectorDevice).height : isImg ? (activeDevice as TelaImageDevice).height : activeFrame.h;

        const printMargin = 24; // 0.25in at Tela's 96dpi document scale
        const videoActionX = focusWidth * .05, videoActionY = focusHeight * .05;
        const videoTitleX = focusWidth * .10, videoTitleY = focusHeight * .10;
        const printTargetsX = studioSafeArea === 'PRINT' || studioSafeArea === 'BOTH' ? [printMargin, focusWidth - printMargin] : [];
        const printTargetsY = studioSafeArea === 'PRINT' || studioSafeArea === 'BOTH' ? [printMargin, focusHeight - printMargin] : [];
        const videoTargetsX = studioSafeArea === 'VIDEO' || studioSafeArea === 'BOTH' ? [videoActionX, focusWidth - videoActionX, videoTitleX, focusWidth - videoTitleX] : [];
        const videoTargetsY = studioSafeArea === 'VIDEO' || studioSafeArea === 'BOTH' ? [videoActionY, focusHeight - videoActionY, videoTitleY, focusHeight - videoTitleY] : [];
        const snapTargets = {
          enabled: studioSnap, threshold: 7 / studioZoom,
          x: [...new Set([0, focusWidth / 2, focusWidth, ...studioGuides.x, ...printTargetsX, ...videoTargetsX])],
          y: [...new Set([0, focusHeight / 2, focusHeight, ...studioGuides.y, ...printTargetsY, ...videoTargetsY])],
        };
        const xTicks = rulerTicks(focusWidth, studioUnit), yTicks = rulerTicks(focusHeight, studioUnit);
        const panelLbl = 'text-[.6rem] font-extrabold uppercase tracking-[.14em] text-white/40';

        const commit = (after: TelaVectorObject[], opts?: any) => {
          if (!vec) return;
          dispatchOp({
            type: 'EDIT_VECTOR_DEVICE',
            deviceId: vec.id,
            objects: after,
            studio: opts?.studio,
            size: opts?.size,
            label: opts?.label,
            coalesce: opts?.coalesce,
          });
          if (opts?.select) {
            setStudioSelection(opts.select);
          }
        };

        const commitStudio = (studioExt: TelaStudioDeviceExt, label?: string) => {
          if (!vec) return;
          dispatchOp({
            type: 'EDIT_VECTOR_DEVICE',
            deviceId: vec.id,
            studio: studioExt,
            label,
          });
        };

        const rebakeType = (headId: string, label?: string) => {
          if (!vec) return;
          void getSharedTextSystem().then(sys => {
            const d = docRef.current?.devices[vec.id] as TelaVectorDevice | undefined;
            if (!d) return;
            const bake = bakeType(sys, d.objects, headId);
            if (bake) {
              const nextObjs = d.objects.map(o => bake.patches[o.id] ? { ...o, ...bake.patches[o.id] } : o);
              dispatchOp({ type: 'EDIT_VECTOR_DEVICE', deviceId: d.id, objects: nextObjs, label: label ?? 'Rebake Type' });
            }
          });
        };

        const studioApi: StudioApi = {
          device: vec || ({} as any),
          objects: vec?.objects ?? [],
          studio: vec?.studio ?? { groups: [], symbols: [], swatches: [], guides: studioGuides },
          readOnly: !!doc.locked,
          latest: () => ((docRef.current?.devices[vec?.id || ''] as TelaVectorDevice) ?? vec!),
          commit,
          commitStudio,
          selection: studioSelIds,
          setSelection: setStudioSelection,
          anchorSel: studioAnchorSel,
          setAnchorSel: setStudioAnchorSel,
          tool: studioTool,
          setTool: setStudioTool,
          isolation: studioIsolation,
          setIsolation: setStudioIsolation,
          zoom: studioZoom,
          setZoom: (z: number) => setStudioZoom(Math.max(0.1, Math.min(4, z))),
          prefs: studioPrefs,
          setPrefs: p => setStudioPrefs(prev => ({ ...prev, ...p })),
          paint: studioPaint,
          setPaint: p => setStudioPaint(prev => ({ ...prev, ...p })),
          shapeOpts: studioShapeOpts,
          setShapeOpts: p => setStudioShapeOpts(prev => ({ ...prev, ...p })),
          writerTexts,
          text: () => getSharedTextSystem(),
          rebakeType,
          typeStyle: typeDefaults,
          editingText,
          setEditingText,
          paintTarget,
          setPaintTarget,
          status: () => {},
        };

        const currentVecDev = activeVectorDevice();
        const activeSelectedTextObject = (currentVecDev && studioSel)
          ? (currentVecDev.objects.find(o => o.id === studioSel && o.kind === 'TEXT') || null)
          : null;

        return (
          <div className="flex-1 flex flex-row min-h-0 h-full overflow-hidden relative">
            {/* Left tool rail: Creative & Productivity merged in one UI (Persistent) */}
            <div 
              className="shrink-0 flex flex-col items-center gap-1 py-3 overflow-y-auto custom-scrollbar select-none z-30" 
              style={{ width: 54, height: '100%', maxHeight: '100%', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)', background: '#0b0a10' }}
            >
              {/* Free-Float Text Box Tool — placed directly above the Move / Transform Layer arrow icon */}
              <button
                title="＋ Free-Float Text Box — Add movable rich text box layer to this page (Double-click to freely type & format)"
                style={{
                  ...railBtn(false),
                  border: '1px solid rgba(255,140,0,0.45)',
                  background: 'rgba(255,140,0,0.14)',
                }}
                onClick={() => {
                  setImageSelectionTool('none');
                  setStudioTool('select');
                  addTextBoxToActiveFrame();
                }}
              >
                <Type size={17} color="#FF8C00" />
              </button>

              {isVec && studioMode === 'pro' ? (
                STUDIO_PRO_TOOLS.map(t => (
                  <button key={t.id} title={t.label} style={railBtn(studioTool === t.id)} onClick={() => setStudioTool(t.id)}>{t.icon}</button>
                ))
              ) : isVec ? (
                STUDIO_VEC_TOOLS.map(t => (
                  <button key={t.id} title={t.label} style={railBtn(studioTool === t.id)} onClick={() => setStudioTool(t.id as any)}>{t.icon}</button>
                ))
              ) : isImg ? (
                <>
                  <button title="Move / Transform Layer (V)" style={railBtn(imageSelectionTool === 'none' && studioTool === 'select')} onClick={() => { setImageSelectionTool('none'); setStudioTool('select'); }}><MousePointer2 size={17} /></button>
                  <button title="Type (T) — click a page or start typing to make a text layer" style={railBtn(isTypeTool)} onClick={() => { setImageSelectionTool('none'); setStudioTool('text' as StudioTool); }}><Type size={17} color="#D0BCFF" /></button>
                  <button title="Shapes and callouts (R) — Add shape layer to this page" style={railBtn(false)} onClick={() => addShapeToActiveFrame('RECT')}><Shapes size={17} color="#00DAF3" /></button>
                  <button title="Rectangular Marquee (M)" style={railBtn(imageSelectionTool === 'marquee_rect')} onClick={() => setImageSelectionTool(imageSelectionTool === 'marquee_rect' ? 'none' : 'marquee_rect')}><Square size={17} color="#00DAF3" /></button>
                  <button title="Elliptical Marquee (Shift+M)" style={railBtn(imageSelectionTool === 'marquee_ellipse')} onClick={() => setImageSelectionTool(imageSelectionTool === 'marquee_ellipse' ? 'none' : 'marquee_ellipse')}><Circle size={17} color="#00DAF3" /></button>
                  <button title="Lasso Tool (L)" style={railBtn(imageSelectionTool === 'lasso_free')} onClick={() => setImageSelectionTool(imageSelectionTool === 'lasso_free' ? 'none' : 'lasso_free')}><Lasso size={17} color="#00DAF3" /></button>
                  <button title="Magic Wand (W)" style={railBtn(imageSelectionTool === 'magic_wand')} onClick={() => setImageSelectionTool(imageSelectionTool === 'magic_wand' ? 'none' : 'magic_wand')}><Wand2 size={17} color="#a78bfa" /></button>
                  <button title="Generative Fill Brush (B)" style={railBtn(imageSelectionTool === 'brush_inpaint')} onClick={() => setImageSelectionTool(imageSelectionTool === 'brush_inpaint' ? 'none' : 'brush_inpaint')}><Paintbrush size={17} color="#ef4444" /></button>
                  <button title="Mask Eraser (E)" style={railBtn(imageSelectionTool === 'brush_erase')} onClick={() => setImageSelectionTool(imageSelectionTool === 'brush_erase' ? 'none' : 'brush_erase')}><Eraser size={17} color="#ffffff" /></button>
                  <button title="Inverse Selection (Ctrl+Shift+I)" style={railBtn(false)} onClick={() => {
                    if (rasterSelection?.bounds) {
                      setRasterSelection(invertSelection(rasterSelection));
                    } else if (img) {
                      setRasterSelection(selectAll(img.width, img.height));
                    }
                  }}><FlipHorizontal size={17} color="#f59e0b" /></button>
                  <button title="Lorea pressure paint engine (B)" style={railBtn(studioPaintOpen)} onClick={() => setStudioPaintOpen(true)}><Brush size={17} color="#f472b6" /></button>
                  <button title="Colorist Eyedropper & Loupe (I)" style={railBtn(colorEyedropperActive)} onClick={() => setColorEyedropperActive(!colorEyedropperActive)}><Pipette size={17} color="#00DAF3" /></button>
                  <button title="Tela Colorist Suite & Scopes (C)" style={railBtn(coloristSuiteOpen)} onClick={() => setColoristSuiteOpen(!coloristSuiteOpen)}><Palette size={17} color="#00DAF3" /></button>
                  <button title="Upload image layer" style={railBtn(false)} disabled={studioImgBusy} onClick={() => { if (img) studioFileRef.current?.click(); else addImageCanvas(); }}>{studioImgBusy ? <Loader2 size={17} className="animate-spin" /> : <ImagePlus size={17} color="#38bdf8" />}</button>
                </>
              ) : (
                <>
                  <button title="Select / move (V)" style={railBtn(studioTool === 'select')} onClick={() => setStudioTool('select')}><MousePointer2 size={17} /></button>
                  <button title="Type (T) — click a page or start typing to make a text layer" style={railBtn(isTypeTool)} onClick={() => { setImageSelectionTool('none'); setStudioTool('text' as StudioTool); }}><Type size={17} color="#D0BCFF" /></button>
                  <button title="Shapes and callouts (R) — Add shape layer to this page" style={railBtn(false)} onClick={() => addShapeToActiveFrame('RECT')}><Shapes size={17} color="#00DAF3" /></button>
                  <button title="Direct select / anchors (A)" style={railBtn(studioTool === 'direct')} onClick={() => setStudioTool('direct')}><MousePointerClick size={17} /></button>
                  <button title="Pen / vector spline (P)" style={railBtn(studioTool === 'pen')} onClick={() => { if (!isVec) addVectorArtboard(); setStudioTool('pen'); }}><PenLine size={17} color="#a78bfa" /></button>
                  <button title="Lorea pressure paint engine (B)" style={railBtn(studioPaintOpen)} onClick={() => setStudioPaintOpen(true)}><Brush size={17} color="#f472b6" /></button>
                  <button title="Upload image layer" style={railBtn(false)} disabled={studioImgBusy} onClick={() => { if (img) studioFileRef.current?.click(); else addImageCanvas(); }}>{studioImgBusy ? <Loader2 size={17} className="animate-spin" /> : <ImagePlus size={17} color="#38bdf8" />}</button>
                </>
              )}

              {/* Productivity Tools separator */}
              <div className="w-7 my-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }} />

              {/* Productivity Suite */}
              <button title="＋ Writer Page (Document / Prose)" style={railBtn(isWriter)} onClick={addWriterPage}><Type size={17} color="#D0BCFF" /></button>
              <button title="＋ Grid Sheet (Spreadsheet / Tables)" style={railBtn(isGrid)} onClick={addGridSheet}><Grid3X3 size={17} color="#00DAF3" /></button>
              <button title="＋ Base Table (Database)" style={railBtn(isBase)} onClick={addBaseTable}><Database size={17} color="#06D6A0" /></button>
              <button title="＋ Form Frame (Interactive Form)" style={railBtn(isForm)} onClick={addFormFrame}><FormInput size={17} color="#D40055" /></button>
              <button title="＋ Notes & Journal (Cards / Stack)" style={railBtn(isNotes)} onClick={() => addNotesFrame(false)}><BookHeart size={17} color="#FF8C00" /></button>
              <button title="Writing & Screenplay Studio (Lorea Desk)" style={railBtn(writingStudioOpen)} onClick={() => setWritingStudioOpen(true)}><FileText size={17} color="#ec4899" /></button>

              {/* AI & Studio Suites separator */}
              <div className="w-7 my-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }} />

              <button title="Local Creative Studio (Local GPU)" style={railBtn(localStudioOpen)} onClick={() => { setLocalStudioOpen(true); setLocalStudioMinimized(false); }}><Wand2 size={17} color="#D40055" /></button>
              <button title="PAI Generations Gallery (Your AI Creations)" style={railBtn(paiGalleryOpen)} onClick={() => setPaiGalleryOpen(true)}><Sparkles size={17} color="#38bdf8" /></button>
              <button title="Toggle Native Comic & Manga Page-Layout Mode (Variant 2)" style={railBtn(comicLayoutMode)} onClick={toggleInlineComicLayoutMode}><BookOpen size={17} color="#a78bfa" /></button>
              <button title="Turn selected text into an interactive question" style={railBtn(assignmentBuilderOpen)} onClick={() => openAssignmentBuilder()}><CircleHelp size={17} color="#38bdf8" /></button>
              <button title="Shapes and design templates" style={railBtn(studioCreativeLibraryOpen)} onClick={() => setStudioCreativeLibraryOpen(true)}><Shapes size={17} /></button>
              <button title="Universal Library" style={railBtn(ulOpen)} onClick={() => setUlOpen(v => !v)}>▦</button>

              {/* Variant 2: Left Rail Comic Tool Cluster */}
              <div className="w-7 my-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }} />
              <TelaComicLeftRailCluster
                ctrl={comicVariant2Ctrl}
                comicModeActive={comicLayoutMode}
                onEnableComicMode={() => {
                  setComicLayoutMode(true);
                  setPosture('PAGE');
                  setStudioDocView('continuous');
                  setStudioRightTab('comic');
                }}
              />
            </div>

            {/* Center stage — rulers + canvas */}
            <div 
              className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden relative" 
              style={{ background: '#141318', height: '100%', maxHeight: '100%' }} 
              onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} 
              onDrop={event => { const files = [...event.dataTransfer.files]; if (!files.length) return; event.preventDefault(); const lotties = isVec ? files.filter(file => isLottieFileName(file.name)) : []; if (lotties.length) { const box = event.currentTarget.querySelector('.tela-vector > svg') as SVGSVGElement | null; const ctm = box?.getScreenCTM(); const at = box && ctm ? (() => { const pt = box.createSVGPoint(); pt.x = event.clientX; pt.y = event.clientY; const q = pt.matrixTransform(ctm.inverse()); return { x: q.x, y: q.y }; })() : undefined; lotties.forEach((file, index) => void studioAddLottieFile(vec!, file, at ? { x: at.x + index * 24, y: at.y + index * 24 } : undefined)); } const visual = files.filter(file => !lotties.includes(file) && (file.type.startsWith('image/') || isVectorFile(file) || isCameraRawFile(file))); const other = files.filter(file => !lotties.includes(file) && !visual.includes(file)); visual.forEach(file => { if (isVec) void studioAddVectorFile(vec!, file); else if (img) void studioAddImageFile(img.id, file); }); if (other.length) void insertAssetFiles(other); }} 
              onWheel={event => { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); setStudioZoom(value => Math.max(.1, Math.min(4, value * (event.deltaY > 0 ? .9 : 1.1)))); }}
            >
              {/* Studio top-strip (Persistent across scroll) */}
              <div className="shrink-0 flex items-center gap-2 px-3 h-9 overflow-x-auto custom-scrollbar select-none z-20" style={{ background: 'rgba(11,10,16,0.96)', borderBottom: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
                <span className="text-[.74rem] font-bold text-white/90 truncate max-w-[160px]">{activeFrame.label || (isVec ? 'Artboard' : isImg ? 'Image' : isWriter ? 'Writer Page' : isGrid ? 'Grid Sheet' : 'Page')}</span>
                <span className="text-[.64rem] font-semibold text-white/40 shrink-0">
                  {isVec ? 'Vector' : isImg ? 'Image' : isWriter ? 'Writer' : isGrid ? 'Grid' : isBase ? 'Base' : 'Page'} · {focusWidth}×{focusHeight}
                </span>

                {/* View Mode Toggle: Page Focus vs Continuous Scroll */}
                <div className="flex items-center rounded-[8px] bg-white/[0.06] p-0.5 border border-white/10 shrink-0">
                  <button
                    onClick={() => { setStudioDocView('focus'); if (posture === 'PAGE') setPosture('STUDIO'); }}
                    className={`px-2 py-0.5 rounded-[6px] text-[.62rem] font-bold transition-colors ${!isContinuousMode ? 'bg-[var(--pj-magenta,#D40055)] text-white shadow-sm' : 'text-white/60 hover:text-white'}`}
                    title="Focus on this page in Studio canvas with precision rulers and zoom"
                  >
                    Focus Page
                  </button>
                  <button
                    onClick={() => { setStudioDocView('continuous'); }}
                    className={`px-2 py-0.5 rounded-[6px] text-[.62rem] font-bold transition-colors ${isContinuousMode ? 'bg-[var(--pj-magenta,#D40055)] text-white shadow-sm' : 'text-white/60 hover:text-white'}`}
                    title="Continuous multi-page document view"
                  >
                    Continuous ({doc.frames.length})
                  </button>
                </div>

                {isVec && (
                  <button
                    type="button"
                    title={studioMode === 'pro' ? 'Pro Studio Vector Canvas active — click to toggle to Classic Vector' : 'Classic Vector active — click to toggle to Pro Studio Canvas'}
                    onClick={() => setStudioMode(m => m === 'pro' ? 'classic' : 'pro')}
                    className="h-7 px-2.5 rounded-[8px] text-[.64rem] font-extrabold flex items-center gap-1.5 transition-colors shrink-0"
                    style={{
                      background: studioMode === 'pro' ? 'linear-gradient(135deg,#6B0099,#00DAF3)' : 'rgba(255,255,255,0.06)',
                      color: '#fff',
                      border: studioMode === 'pro' ? '1px solid rgba(0,218,243,0.4)' : '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <Sparkles size={11} />
                    {studioMode === 'pro' ? 'Wave 2 Studio' : 'Classic Vector'}
                  </button>
                )}

                <button onClick={() => setStudioSnap(value => !value)} className="h-7 px-2 rounded-[8px] text-[.62rem] font-extrabold shrink-0" style={{ color: studioSnap ? '#8ff5ff' : 'rgba(255,255,255,.42)', background: studioSnap ? 'rgba(0,218,243,.12)' : 'rgba(255,255,255,.045)', border: studioSnap ? '1px solid rgba(0,218,243,.35)' : '1px solid rgba(255,255,255,.08)' }}>Snap {studioSnap ? 'on' : 'off'}</button>
                <select aria-label="Ruler unit" value={studioUnit} onChange={event => setStudioUnit(event.target.value as StudioUnit)} className="h-7 px-2 rounded-[8px] text-[.62rem] font-bold text-white/65 outline-none shrink-0" style={{ background: '#17131d', border: '1px solid rgba(255,255,255,.1)' }}><option value="PX">Pixels</option><option value="IN">Inches</option><option value="MM">Millimetres</option><option value="CM">Centimetres</option></select>
                <select aria-label="Safe area guides" value={studioSafeArea} onChange={event => setStudioSafeArea(event.target.value as StudioSafeArea)} className="h-7 px-2 rounded-[8px] text-[.62rem] font-bold text-white/65 outline-none shrink-0" style={{ background: '#17131d', border: '1px solid rgba(255,255,255,.1)' }}><option value="NONE">No safe margins</option><option value="PRINT">Print safe</option><option value="VIDEO">Video safe</option><option value="BOTH">Print + video safe</option></select>

                <div className="h-4 w-px bg-white/10 mx-1 shrink-0" />

                <button
                  onClick={() => {
                    setImageSelectionTool('none');
                    setStudioTool('select');
                    addTextBoxToActiveFrame();
                  }}
                  className="h-7 px-2.5 rounded-[8px] text-[.64rem] font-bold text-white bg-[#FF8C00]/20 hover:bg-[#FF8C00]/35 border border-[#FF8C00]/40 flex items-center gap-1.5 transition-colors shrink-0 shadow-sm"
                  title="Add Free-Float Text Box layer to the active page (double-click box to freely type & format)"
                >
                  <Type size={12} className="text-[#FF8C00]" /> ＋ Text Box
                </button>

                <button
                  onClick={() => { setImageSelectionTool('none'); setStudioTool((isVec && studioMode === 'pro' && !isContinuousMode ? 'type' : 'text') as StudioTool); }}
                  className={`h-7 px-2.5 rounded-[8px] text-[.64rem] font-bold text-white flex items-center gap-1.5 transition-colors shrink-0 shadow-sm ${
                    isTypeTool
                      ? 'bg-[var(--pj-magenta,#D40055)] text-white shadow-[0_0_14px_rgba(212,0,85,0.45)]'
                      : 'bg-[var(--pj-magenta,#D40055)]/25 hover:bg-[var(--pj-magenta,#D40055)]/40 border border-[var(--pj-magenta,#D40055)]/40'
                  }`}
                  title="Type tool (T) — click a page or just start typing to make a text layer; its typography bar opens below"
                >
                  <Type size={12} className="text-[#D0BCFF]" /> Typography
                </button>
                <button
                  onClick={() => addShapeToActiveFrame('RECT')}
                  className="h-7 px-2.5 rounded-[8px] text-[.64rem] font-bold text-white/80 hover:text-white bg-white/[0.06] hover:bg-white/15 border border-white/10 flex items-center gap-1.5 transition-colors shrink-0"
                  title="Add Vector Shape layer to the active document page"
                >
                  <Shapes size={12} className="text-[#00DAF3]" /> Shape
                </button>

                <div className="ml-auto flex items-center gap-1 shrink-0">
                  <button onClick={() => setStudioZoom(value => Math.max(.1, value / 1.2))} className="w-7 h-7 rounded-[8px] text-white/60 bg-white/[.045] hover:bg-white/[.09]">−</button>
                  <button onClick={() => setStudioZoom(1)} className="min-w-[48px] h-7 px-1 rounded-[8px] text-[.62rem] font-extrabold text-white/65 bg-white/[.045] hover:bg-white/[.09]">{Math.round(studioZoom * 100)}%</button>
                  <button onClick={() => setStudioZoom(value => Math.min(4, value * 1.2))} className="w-7 h-7 rounded-[8px] text-white/60 bg-white/[.045] hover:bg-white/[.09]">+</button>
                </div>

                <div className="flex items-center gap-1 ml-1 shrink-0">
                  <button onClick={exportPdf} className="h-7 px-2.5 rounded-[8px] text-[.62rem] font-bold text-white/75 bg-white/[.06] hover:bg-white/[.12] transition-colors" title="Export as PDF (Ctrl+P)">
                    <FileDown size={12} className="inline mr-1" /> PDF
                  </button>
                </div>
              </div>

              {/* Tool options — the secondary row for whichever tool is active (typography for Type) */}
              <TelaToolOptionsBar
                tool={studioTool as string}
                proStudio={isVec && studioMode === 'pro' && !isContinuousMode}
                selected={currentVecDev && studioSel && studioSelIds.length <= 1 ? currentVecDev.objects.find(o => o.id === studioSel) || null : null}
                onUpdateSelected={patch => { const vDev = activeVectorDevice(); if (vDev && studioSel) updateVectorObject(vDev.id, studioSel, patch); }}
                typeDefaults={typeDefaults}
                onTypeDefaults={patch => setTypeDefaults(t => ({ ...t, ...patch }))}
                onAddTextLayer={() => addTextLayerToFrame(activeFrame.id)}
                onAddTextBox={() => addTextBoxToActiveFrame(activeFrame.id)}
                textArtOpen={typographyStudioOpen}
                onToggleTextArt={() => setTypographyStudioOpen(open => !open)}
                popover={typographyStudioOpen && (
                  <div className="absolute top-full left-3 mt-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <TelaTypographyStudio
                      selectedObject={activeSelectedTextObject}
                      onUpdateObject={patch => {
                        const vDev = activeVectorDevice();
                        if (activeSelectedTextObject && vDev) {
                          dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: vDev.id, objectId: activeSelectedTextObject.id, patch });
                        }
                      }}
                      onCreateTypographyObject={(kind, patch) => {
                        createTypographyObjectOnActiveFrame(kind, patch);
                      }}
                      onExplodeLetters={obj => {
                        explodeTextIntoLetters(obj);
                      }}
                      onClose={() => setTypographyStudioOpen(false)}
                      activeFrameLabel={activeFrame?.label}
                    />
                  </div>
                )}
              />

              {/* Stage Scrollable Body — ONLY this area scrolls when viewing documents */}
              <div className="flex-1 min-h-0 h-full overflow-y-auto overflow-x-auto relative custom-scrollbar flex flex-col" style={{ overscrollBehavior: 'contain' }}>
                {comicLayoutMode ? (
                  <TelaComicPageStreamCanvas ctrl={comicVariant2Ctrl} zoom={studioZoom} />
                ) : isContinuousMode ? (
                  <div
                    className="min-h-full flex flex-col items-center py-10 px-6 gap-8"
                    style={{
                      paddingBottom: comicVariant2Ctrl.timelineExpanded ? 240 : 72,
                      background: 'radial-gradient(1000px 500px at 50% 0%, rgba(107,0,153,0.12), transparent 60%), #0e0b14',
                    }}
                  >
                  {doc.frames.map((frame, index) => {
                    const active = frame.id === activeFrameId;
                    return (
                      <div key={frame.id} id={`page-${frame.id}`} className="flex flex-col items-center" onPointerDownCapture={() => { if (activeFrameId !== frame.id) setActiveFrameId(frame.id); }}>
                        {/* Page Header Strip */}
                        <div className="flex items-center justify-between mb-2 select-none" style={{ width: frame.w }}>
                          <div className="flex items-center gap-2 text-white/50 text-[11px] font-semibold cursor-pointer" onClick={() => setActiveFrameId(frame.id)}>
                            <span className={`w-5 h-5 rounded-full text-[10px] font-bold grid place-items-center ${active ? 'bg-[var(--pj-magenta,#D40055)] text-white' : 'bg-white/10 text-white/80'}`}>
                              {index + 1}
                            </span>
                            <span className={active ? 'text-white font-bold' : 'text-white/80'}>{frame.label || `Page ${index + 1}`}</span>
                            <span className="text-white/40 text-[10px]">({PRESETS[frame.preset]?.label || frame.kind})</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <button
                              onClick={() => addTextBoxToActiveFrame(frame.id)}
                              className="px-2.5 py-1 rounded-[7px] bg-[var(--pj-magenta,#D40055)]/20 hover:bg-[var(--pj-magenta,#D40055)]/35 text-white/90 hover:text-white transition-colors flex items-center gap-1 font-semibold border border-[var(--pj-magenta,#D40055)]/30"
                              title="Add Free-moving Typography / Text Box to this page"
                            >
                              <Type size={12} className="text-[#D0BCFF]" /> ＋ Text Box
                            </button>
                            <button
                              onClick={() => addShapeToActiveFrame('RECT', frame.id)}
                              className="px-2.5 py-1 rounded-[7px] bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors flex items-center gap-1 font-semibold"
                              title="Add Shape / Callout layer to this page"
                            >
                              <Shapes size={12} className="text-[#00DAF3]" /> ＋ Shape
                            </button>
                            <button
                              onClick={() => { setActiveFrameId(frame.id); setStudioDocView('focus'); if (posture === 'PAGE') setPosture('STUDIO'); }}
                              className="px-2.5 py-1 rounded-[7px] bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors flex items-center gap-1 font-semibold"
                              title="Focus on this page in Studio canvas with precision rulers"
                            >
                              <PenLine size={12} className="text-[#00DAF3]" /> Studio Focus
                            </button>
                            {doc.frames.length > 1 && (
                              <button
                                onClick={() => dispatchOp({ type: 'DELETE_FRAME', frameId: frame.id })}
                                className="p-1 rounded-[7px] hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                                title="Delete page"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Page Surface */}
                        <div
                          onClick={() => setActiveFrameId(frame.id)}
                          style={{
                            width: frame.w,
                            minHeight: frame.h,
                            background: '#FFFFFF',
                            borderRadius: 4,
                            boxShadow: active
                              ? '0 0 0 2px var(--pj-magenta, #D40055), 0 20px 50px rgba(0,0,0,0.65)'
                              : '0 10px 30px rgba(0,0,0,0.45)',
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                            overflow: 'visible',
                          }}
                        >
                          {frame.deviceIds.map((id, devIdx) => {
                            const dev = doc.devices[id];
                            if (!dev) return null;
                            const isOverlay = devIdx > 0 && dev.type === 'VECTOR';
                            return (
                              <div
                                key={id}
                                style={isOverlay ? {
                                  position: 'absolute',
                                  inset: 0,
                                  zIndex: 10 + devIdx,
                                  pointerEvents: 'none',
                                } : {
                                  flex: 1,
                                  minHeight: frame.h,
                                  position: 'relative',
                                  zIndex: 1,
                                }}
                              >
                                {renderDevice(dev, false, isOverlay)}
                              </div>
                            );
                          })}
                          {isTypeTool && !frame.deviceIds.some(id => doc.devices[id]?.type === 'VECTOR') && (
                            <div
                              aria-label="Click to start a text layer"
                              style={{ position: 'absolute', inset: 0, zIndex: 5, cursor: 'text' }}
                              onPointerDown={event => { event.preventDefault(); event.stopPropagation(); addTextLayerToFrame(frame.id); }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* ＋ Add Page Strip at the bottom of the document */}
                  <div className="flex items-center gap-2.5 my-8 pb-16 flex-wrap justify-center">
                    <button onClick={() => addTextBoxToActiveFrame()} className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[.75rem] font-bold text-white bg-[var(--pj-magenta,#D40055)]/20 border border-[var(--pj-magenta,#D40055)]/40 hover:bg-[var(--pj-magenta,#D40055)]/35 transition-all shadow-sm">
                      <Type size={14} className="text-[#D0BCFF]" /> ＋ Text Box / Typography
                    </button>
                    <button onClick={() => addShapeToActiveFrame('RECT')} className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[.75rem] font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all shadow-sm">
                      <Shapes size={14} className="text-[#00DAF3]" /> ＋ Shape Layer
                    </button>
                    <button onClick={addWriterPage} className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[.75rem] font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all shadow-sm">
                      <Type size={14} className="text-[#D0BCFF]" /> ＋ Add Writer Page
                    </button>
                    <button onClick={addGridSheet} className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[.75rem] font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all shadow-sm">
                      <Grid3X3 size={14} className="text-[#00DAF3]" /> ＋ Add Grid Sheet
                    </button>
                    <button onClick={addVectorArtboard} className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[.75rem] font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all shadow-sm">
                      <Shapes size={14} className="text-[#FF8C00]" /> ＋ Add Vector Page
                    </button>
                    <button onClick={() => setLocalStudioOpen(true)} className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[.75rem] font-bold text-[#f59e0b] bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 transition-all shadow-sm">
                      <Wand2 size={14} /> ＋ Local AI Render
                    </button>
                    <button onClick={() => { setWritingStudioTab('SCRIPT'); setWritingStudioOpen(true); }} className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[.75rem] font-bold text-[#ec4899] bg-pink-500/10 border border-pink-500/25 hover:bg-pink-500/20 transition-all shadow-sm">
                      <FileText size={14} /> ＋ Screenplay / Lorea Desk
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ minWidth: focusWidth * studioZoom + 96, minHeight: focusHeight * studioZoom + 116, padding: '28px 42px 56px 28px', display: 'grid', placeItems: 'start center' }}>
                  <div style={{ position: 'relative', paddingTop: 22, paddingLeft: 22 }}>
                    {/* Rulers */}
                    <div title="Click to add a vertical guide" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); const x = Math.max(0, Math.min(focusWidth, (event.clientX - rect.left) / studioZoom)); setStudioGuides(guides => ({ ...guides, x: [...guides.x, x] })); }} style={{ position: 'absolute', left: 22, top: 0, width: focusWidth * studioZoom, height: 22, overflow: 'hidden', background: '#0b0a10', borderBottom: '1px solid rgba(255,255,255,.12)', cursor: 's-resize' }}>{xTicks.map(tick => <span key={tick.at} style={{ position: 'absolute', left: tick.at * studioZoom, bottom: 0, height: tick.major ? 12 : 6, borderLeft: `1px solid rgba(255,255,255,${tick.major ? .38 : .17})` }}>{tick.label && <span style={{ position: 'absolute', left: 3, top: -8, whiteSpace: 'nowrap', color: 'rgba(255,255,255,.44)', fontSize: 8, fontWeight: 700 }}>{tick.label}</span>}</span>)}</div>
                    <div title="Click to add a horizontal guide" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); const y = Math.max(0, Math.min(focusHeight, (event.clientY - rect.top) / studioZoom)); setStudioGuides(guides => ({ ...guides, y: [...guides.y, y] })); }} style={{ position: 'absolute', left: 0, top: 22, width: 22, height: focusHeight * studioZoom, overflow: 'hidden', background: '#0b0a10', borderRight: '1px solid rgba(255,255,255,.12)', cursor: 'e-resize' }}>{yTicks.map(tick => <span key={tick.at} style={{ position: 'absolute', top: tick.at * studioZoom, right: 0, width: tick.major ? 12 : 6, borderTop: `1px solid rgba(255,255,255,${tick.major ? .38 : .17})` }}>{tick.label && <span style={{ position: 'absolute', right: 4, top: 2, color: 'rgba(255,255,255,.44)', fontSize: 7, fontWeight: 700, writingMode: 'vertical-rl' }}>{tick.label}</span>}</span>)}</div>

                    {/* Canvas Stage Box */}
                    <div style={{ position: 'relative', width: focusWidth * studioZoom, height: focusHeight * studioZoom, borderRadius: 3, boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, width: focusWidth, height: focusHeight, transform: `scale(${studioZoom})`, transformOrigin: '0 0', overflow: 'visible', borderRadius: 3, background: isProductivity ? '#ffffff' : undefined }}>
                        {isVec && vec!.objects.length > 500 ? (
                          <div className="grid place-items-center text-center p-8" style={{ width: Math.min(vec!.width, 720), minHeight: 420, background: '#fff' }}><div className="max-w-[430px]"><div className="mx-auto grid place-items-center w-12 h-12 rounded-[14px] text-white" style={{ background: 'var(--pj-grad-spatial,linear-gradient(135deg,#6B0099,#00DAF3))' }}><Sparkles size={21}/></div><h3 className="mt-4 font-display italic text-[#1B1523] text-[1.25rem]">This legacy trace needs consolidation</h3><p className="mt-2 text-[.76rem] leading-relaxed text-[#1B1523]/55">Tela found {vec!.objects.length.toLocaleString()} microscopic paths from the earlier tracer. Consolidate them before previewing so the browser is not forced to render thousands of invisible layers.</p><button className="mt-4 h-9 px-5 rounded-[10px] text-[.72rem] font-extrabold text-white" style={{ background: 'var(--pj-grad-brand,linear-gradient(135deg,#6B0099,#D40055))' }} onClick={() => dispatchOp({ type: 'REPLACE_VECTOR_OBJECTS', deviceId: vec!.id, objects: consolidateTelaTraceObjects(vec!.objects) })}>Consolidate and preview</button></div></div>
                        ) : isVec && studioMode === 'pro' ? (
                          <StudioCtx.Provider value={studioApi}>
                            <StudioCanvas
                              viewportRef={studioViewportRef}
                              onObjectContextMenu={(event, object) => vectorContextMenu.openAt(event.clientX, event.clientY, { deviceId: activeDevice.id, object })}
                              onCanvasContextMenu={(event, point) => canvasContextMenu.openAt(event.clientX, event.clientY, { deviceId: activeDevice.id, point })}
                              onResizeArtboard={(w, h) => dispatchOp({ type: 'EDIT_VECTOR_DEVICE', deviceId: activeDevice.id, size: { width: w, height: h } })}
                            />
                          </StudioCtx.Provider>
                        ) : isVec ? (
                          <TelaVector
                            device={vec!} chrome={false}
                            tool={studioTool as VectorTool} onToolChange={t => setStudioTool(t as any)}
                            selectedId={studioSel}
                            selectedIds={studioSelIds} onSelectionChange={setStudioSelection}
                            writerTexts={writerTexts} writers={writerList}
                            onAddObject={object => dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: activeDevice.id, object })}
                            onUpdateObject={(objectId, patch) => dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: activeDevice.id, objectId, patch })}
                            onDeleteObject={objectId => dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: activeDevice.id, objectId })}
                            onReorder={(objectId, toIndex) => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: activeDevice.id, objectId, toIndex })}
                            onObjectContextMenu={(event, object) => vectorContextMenu.openAt(event.clientX, event.clientY, { deviceId: activeDevice.id, object })}
                            objectContextBindings={object => vectorContextMenu.bind({ deviceId: activeDevice.id, object })}
                            snap={snapTargets}
                          />
                        ) : isImg ? (
                          <div style={{ position: 'relative', width: focusWidth, height: focusHeight }}>
                            <TelaImage
                              device={img!} chrome={false}
                              selectedId={studioSel}
                              selectedIds={studioSelIds} onSelectionChange={setStudioSelection}
                              onAddLayer={layer => dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId: activeDevice.id, layer })}
                              onUpdateLayer={(layerId, patch) => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: activeDevice.id, layerId, patch })}
                              onDeleteLayer={layerId => dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: activeDevice.id, layerId })}
                              onReorder={(layerId, toIndex) => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: activeDevice.id, layerId, toIndex })}
                              onLayerContextMenu={(event, layer) => imageContextMenu.openAt(event.clientX, event.clientY, { deviceId: activeDevice.id, layer })}
                              layerContextBindings={layer => imageContextMenu.bind({ deviceId: activeDevice.id, layer })}
                              interactionScale={studioZoom} snap={snapTargets}
                              selectionTool={imageSelectionTool}
                              onSelectionToolChange={setImageSelectionTool}
                              selection={rasterSelection}
                              onRasterSelectionChange={setRasterSelection}
                              coloristOpen={coloristSuiteOpen}
                              onColoristOpenChange={setColoristSuiteOpen}
                              eyedropperActive={colorEyedropperActive}
                              onEyedropperActiveChange={setColorEyedropperActive}
                              colorSpace={colorSpace}
                              onColorSpaceChange={setColorSpace}
                              softProofing={softProofing}
                              onSoftProofingChange={setSoftProofing}
                              cmykPlate={cmykPlate}
                              onCmykPlateChange={setCmykPlate}
                              wheels={colorWheels}
                              onWheelsChange={setColorWheels}
                              curves={colorCurves}
                              onCurvesChange={setColorCurves}
                            />
                            {activeFrame.deviceIds.map((id, devIdx) => {
                              const dev = doc.devices[id];
                              if (!dev || dev.type !== 'VECTOR') return null;
                              return (
                                <div
                                  key={id}
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    zIndex: 30 + devIdx,
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <TelaVector
                                    device={{ ...dev, width: focusWidth, height: focusHeight }}
                                    chrome={false}
                                    overlay={true}
                                    tool={(studioTool === 'type' ? 'text' : ['select', 'direct', 'marquee', 'rect', 'ellipse', 'line', 'pen', 'text', 'ink'].includes(studioTool as string) ? studioTool : 'select') as VectorTool}
                                    onToolChange={t => setStudioTool(t as any)}
                                    onTypeAt={() => addTextLayerToFrame(activeFrame.id)}
                                    editTextRequest={textEditRequest}
                                    selectedId={studioSel}
                                    selectedIds={studioSelIds}
                                    onSelectionChange={setStudioSelection}
                                    writerTexts={writerTexts}
                                    writers={writerList}
                                    onAddObject={object => dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: dev.id, object })}
                                    onUpdateObject={(objectId, patch) => dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: dev.id, objectId, patch })}
                                    onDeleteObject={objectId => dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: dev.id, objectId })}
                                    onReorder={(objectId, toIndex) => dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: dev.id, objectId, toIndex })}
                                    onObjectContextMenu={(event, object) => vectorContextMenu.openAt(event.clientX, event.clientY, { deviceId: dev.id, object })}
                                    objectContextBindings={object => vectorContextMenu.bind({ deviceId: dev.id, object })}
                                    snap={snapTargets}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          /* Productivity devices: Writer, Grid, Base, Form, Notes, Media */
                          <div
                            onClick={() => setActiveFrameId(activeFrame.id)}
                            style={{
                              width: '100%',
                              minHeight: focusHeight,
                              background: '#FFFFFF',
                              borderRadius: 4,
                              position: 'relative',
                              overflow: 'visible',
                            }}
                          >
                            {activeFrame.deviceIds.map((id, devIdx) => {
                              const dev = doc.devices[id];
                              if (!dev) return null;
                              const isOverlay = devIdx > 0 && dev.type === 'VECTOR';
                              return (
                                <div
                                  key={id}
                                  style={isOverlay ? {
                                    position: 'absolute',
                                    inset: 0,
                                    zIndex: 10 + devIdx,
                                    pointerEvents: 'none',
                                  } : {
                                    minHeight: focusHeight,
                                    position: 'relative',
                                    zIndex: 1,
                                  }}
                                >
                                  {renderDevice(dev, false, isOverlay)}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Safe area guides */}
                        {(studioSafeArea === 'PRINT' || studioSafeArea === 'BOTH') && <div style={{ position: 'absolute', inset: printMargin, border: '1px dashed rgba(212,0,85,.78)', pointerEvents: 'none', zIndex: 12 }}><span style={{ position: 'absolute', left: 4, top: 3, color: '#D40055', fontSize: 8, fontWeight: 850 }}>PRINT SAFE · 0.25″</span></div>}
                        {(studioSafeArea === 'VIDEO' || studioSafeArea === 'BOTH') && <><div style={{ position: 'absolute', left: videoActionX, right: videoActionX, top: videoActionY, bottom: videoActionY, border: '1px dashed rgba(0,218,243,.8)', pointerEvents: 'none', zIndex: 12 }}><span style={{ position: 'absolute', left: 4, top: 3, color: '#00A8BC', fontSize: 8, fontWeight: 850 }}>ACTION SAFE</span></div><div style={{ position: 'absolute', left: videoTitleX, right: videoTitleX, top: videoTitleY, bottom: videoTitleY, border: '1px dashed rgba(255,138,0,.8)', pointerEvents: 'none', zIndex: 12 }}><span style={{ position: 'absolute', left: 4, top: 3, color: '#E76F00', fontSize: 8, fontWeight: 850 }}>TITLE SAFE</span></div></>}
                        {studioGuides.x.map((x, index) => <div key={`x${index}`} title="Double-click to remove guide" onDoubleClick={() => setStudioGuides(guides => ({ ...guides, x: guides.x.filter((_, i) => i !== index) }))} style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: 5, marginLeft: -2, borderLeft: '1px solid #00DAF3', cursor: 'col-resize', zIndex: 14 }}/>) }
                        {studioGuides.y.map((y, index) => <div key={`y${index}`} title="Double-click to remove guide" onDoubleClick={() => setStudioGuides(guides => ({ ...guides, y: guides.y.filter((_, i) => i !== index) }))} style={{ position: 'absolute', top: y, left: 0, right: 0, height: 5, marginTop: -2, borderTop: '1px solid #00DAF3', cursor: 'row-resize', zIndex: 14 }}/>) }
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </div>

              {/* Variant 2: Docked Bottom Motion Timeline + Collapsible 36px Mini Transport & Tela Document Stats Bar */}
              <TelaComicBottomTransportAndTimeline
                ctrl={comicVariant2Ctrl}
                comicModeActive={comicLayoutMode}
                onToggleComicMode={toggleInlineComicLayoutMode}
              />

              <input ref={studioFileRef} type="file" accept="image/*,video/*,.svg,.ai,.pdf,.webp,.avif,.gif,.bmp,.tif,.tiff,.lottie,.json,.abr,.csh,.ase,.arw,.cr2,.cr3,.nef,.dng,.raf,.orf,.rw2,.pef" multiple className="hidden" onChange={e => { const files = [...(e.target.files || [])]; if (img) files.forEach(file => void studioAddImageFile(img.id, file)); e.target.value = ''; }} />
            </div>

            {/* Right Inspector — Adaptive Studio Panel (Persistent) */}
            <div 
              className="shrink-0 hidden md:flex flex-col min-h-0 h-full select-none z-30" 
              style={{ width: 268, height: '100%', maxHeight: '100%', flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', background: '#0e0d14' }}
            >
              {/* Header Tabs */}
              <div className="flex items-center gap-1 px-2.5 h-9 shrink-0 border-b border-white/[0.08]">
                <button
                  onClick={() => setStudioRightTab('properties')}
                  className={`h-7 px-2.5 rounded-[7px] text-[.64rem] font-bold transition-colors flex items-center gap-1 ${studioRightTab === 'properties' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/80'}`}
                >
                  Properties
                </button>
                <button
                  onClick={() => {
                    setStudioRightTab('comic');
                    if (!comicLayoutMode) {
                      setComicLayoutMode(true);
                      setPosture('PAGE');
                      setStudioDocView('continuous');
                    }
                  }}
                  className={`h-7 px-2.5 rounded-[7px] text-[.64rem] font-bold transition-colors flex items-center gap-1 ${
                    studioRightTab === 'comic'
                      ? 'bg-white/10 text-white'
                      : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  <BookOpen size={11} className="text-[#D0BCFF]" /> Comic
                </button>
                <button
                  onClick={() => setStudioRightTab('pages')}
                  className={`h-7 px-2.5 rounded-[7px] text-[.64rem] font-bold transition-colors ${studioRightTab === 'pages' ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/80'}`}
                >
                  Pages ({doc.frames.length})
                </button>
                {studioSelIds.length > 1 && <span className="ml-auto text-[9px] font-extrabold text-[var(--pj-cyan,#00DAF3)]">{studioSelIds.length} sel</span>}
              </div>

              {/* Tab: Variant 2 Split Comic & Manga Inspector */}
              {studioRightTab === 'comic' ? (
                <TelaComicSplitRightInspector ctrl={comicVariant2Ctrl} />
              ) : studioRightTab === 'pages' ? (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className={panelLbl}>Document Outline</span>
                    <button
                      onClick={addWriterPage}
                      className="text-[.64rem] font-bold text-[var(--pj-magenta,#D40055)] hover:underline flex items-center gap-0.5"
                    >
                      <Plus size={12} /> Add Page
                    </button>
                  </div>
                  {doc.frames.map((frame, index) => {
                    const active = frame.id === activeFrameId;
                    const frameDev = frame.deviceIds.map(id => doc.devices[id]).find(Boolean);
                    const devType = frameDev?.type || 'PAGE';
                    return (
                      <div
                        key={frame.id}
                        onClick={() => setActiveFrameId(frame.id)}
                        className={`p-2.5 rounded-[10px] border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                          active
                            ? 'bg-white/[0.08] border-[var(--pj-magenta,#D40055)] text-white shadow-sm'
                            : 'bg-white/[0.02] border-white/[0.08] text-white/70 hover:bg-white/[0.05] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-5 h-5 rounded-full text-[9px] font-extrabold grid place-items-center ${active ? 'bg-[var(--pj-magenta,#D40055)] text-white' : 'bg-white/10 text-white/60'}`}>
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[.72rem] font-bold truncate">{frame.label || `Page ${index + 1}`}</div>
                            <div className="text-[.6rem] text-white/40">{devType} · {PRESETS[frame.preset]?.label || `${frame.w}×${frame.h}`}</div>
                          </div>
                        </div>
                        {doc.frames.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); dispatchOp({ type: 'DELETE_FRAME', frameId: frame.id }); }}
                            className="p-1 rounded-[6px] hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors"
                            title="Delete page"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-2 gap-1.5 mt-2 pt-2 border-t border-white/[0.08]">
                    <button onClick={addWriterPage} className="h-8 rounded-[8px] text-[.66rem] font-bold text-white/80 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 transition-colors">＋ Writer</button>
                    <button onClick={addGridSheet} className="h-8 rounded-[8px] text-[.66rem] font-bold text-white/80 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 transition-colors">＋ Grid</button>
                    <button onClick={addVectorArtboard} className="h-8 rounded-[8px] text-[.66rem] font-bold text-white/80 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 transition-colors">＋ Vector</button>
                    <button onClick={addImageCanvas} className="h-8 rounded-[8px] text-[.66rem] font-bold text-white/80 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 transition-colors">＋ Image</button>
                  </div>
                </div>
              ) : (() => {
                const selectedVecObj = (currentVecDev && studioSel)
                  ? (currentVecDev.objects.find(o => o.id === studioSel) || null)
                  : null;
                const selectedImgLayer = (img && studioSel)
                  ? (img.layers.find(l => l.id === studioSel) || null)
                  : null;
                const vecObjects = currentVecDev
                  ? (currentVecDev.objects.length > 500 && !currentVecDev.objects.some(object => object.reconstructionLayer) ? [] : currentVecDev.objects)
                  : [];

                return (
                  <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                    {/* Active Page Layers Header & Quick Add */}
                    <div className="px-3 py-2.5 shrink-0 flex flex-col gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Layers size={12} className="text-[#00DAF3] shrink-0" />
                          <span className="text-[.64rem] font-extrabold uppercase tracking-[.1em] text-white/85 truncate">
                            {activeFrame.label || 'Focused Page'} · Layers
                          </span>
                        </div>
                        <span className="text-[.58rem] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/60 shrink-0">
                          {vecObjects.length + (img?.layers.length || 0) + (isProductivity ? 1 : 0)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => {
                            setImageSelectionTool('none');
                            setStudioTool('select');
                            addTextBoxToActiveFrame(activeFrame.id);
                          }}
                          className="h-7 px-2 rounded-[7px] text-[.64rem] font-bold text-white bg-[#FF8C00]/20 hover:bg-[#FF8C00]/35 border border-[#FF8C00]/40 flex items-center justify-center gap-1 transition-colors"
                          title="Add a Free-Float Text Box layer to this page"
                        >
                          <Type size={11} className="text-[#FF8C00]" /> ＋ Text Box
                        </button>
                        <button
                          onClick={() => addShapeToActiveFrame('RECT', activeFrame.id)}
                          className="h-7 px-2 rounded-[7px] text-[.64rem] font-bold text-white/85 hover:text-white bg-white/[0.06] hover:bg-white/12 border border-white/10 flex items-center justify-center gap-1 transition-colors"
                          title="Add a Vector Shape layer to this page"
                        >
                          <Shapes size={11} className="text-[#00DAF3]" /> ＋ Shape
                        </button>
                      </div>
                    </div>

                    {/* Image Upload / AI Rebuild / Trace Controls when focused page has an Image device */}
                    {img && (
                      <div className="px-3 py-2.5 flex flex-col gap-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <button onClick={() => studioFileRef.current?.click()} disabled={studioImgBusy} className="flex items-center justify-center gap-1.5 h-8 rounded-[9px] text-[.74rem] font-bold text-white" style={{ background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' }}>
                          {studioImgBusy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} {studioImgBusy ? 'Uploading…' : 'Add image layer'}
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

                    {vec && (
                      <div className="px-3 py-2.5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <TelaLottieImportRow artboard={{ width: vec.width, height: vec.height }} onAdd={object => { dispatchOp({ type: 'ADD_VECTOR_OBJECT', deviceId: vec.id, object }); setStudioSel(object.id); }} />
                      </div>
                    )}

                    {/* Unified Layer Stack for Active Page */}
                    <div className="px-2.5 py-2.5 flex flex-col gap-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {studioSelIds.length > 1 && (
                        <div className="mb-2 p-3 rounded-[12px]" style={{ background: 'rgba(0,218,243,.065)', border: '1px solid rgba(0,218,243,.2)' }}>
                          <div className="text-[.7rem] font-extrabold text-[#8FF5FF]">Shift selection · {studioSelIds.length} items</div>
                          <div className="mt-1 text-[.6rem] leading-relaxed text-white/42">Drag any selected item to move the selection together.</div>
                          <div className="grid grid-cols-2 gap-1.5 mt-2">
                            <button onClick={() => {
                              if (currentVecDev) { const made = studioSelIds.map(id => currentVecDev.objects.find(object => object.id === id)).filter((object): object is TelaVectorObject => !!object).map(object => duplicateVectorObject(currentVecDev.id, object).id); if (made.length) { setStudioSelection(made); return; } }
                              if (img) { const made = studioSelIds.map(id => img.layers.find(layer => layer.id === id)).filter((layer): layer is TelaImageLayer => !!layer).map(layer => duplicateImageLayer(img.id, layer).id); setStudioSelection(made); }
                            }} className="h-8 rounded-[8px] text-[9px] font-extrabold text-white/75 bg-white/[.06]"><CopyPlus size={11} className="inline mr-1"/>Duplicate</button>
                            {img && <button onClick={() => { const groupId = uid('group'); dispatchOp({ type: 'ADD_IMAGE_GROUP', deviceId: img.id, group: { id: groupId, name: `Group ${Math.max(1, (img.groups?.length || 0) + 1)}`, visible: true, opacity: 1, blend: 'normal' } }); studioSelIds.forEach(layerId => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: img.id, layerId, patch: { groupId } })); }} className="h-8 rounded-[8px] text-[9px] font-extrabold text-white/75 bg-white/[.06]">Group layers</button>}
                            <button onClick={() => { if (currentVecDev) studioSelIds.forEach(objectId => dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: currentVecDev.id, objectId })); if (img) studioSelIds.forEach(layerId => dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: img.id, layerId })); setStudioSel(null); }} className={`${img ? 'col-span-2' : ''} h-8 rounded-[8px] text-[9px] font-extrabold text-[#FF8FA8] bg-[rgba(212,0,85,.08)]`}><Trash2 size={11} className="inline mr-1"/>Delete selected</button>
                          </div>
                        </div>
                      )}

                      {currentVecDev && currentVecDev.objects.length > 500 && !currentVecDev.objects.some(object => object.reconstructionLayer) && (
                        <div className="mb-2 p-3 rounded-[12px]" style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)' }}>
                          <div className="text-[.74rem] font-extrabold text-amber-200">Legacy trace detected</div>
                          <div className="mt-1 text-[.66rem] leading-relaxed text-white/50">{currentVecDev.objects.length.toLocaleString()} microscopic paths were created before reconstruction review existed.</div>
                          <button className="mt-2 w-full h-8 rounded-[9px] text-[.68rem] font-extrabold text-white" style={{ background: 'var(--pj-grad-spatial,linear-gradient(135deg,#6B0099,#00DAF3))' }} onClick={() => { dispatchOp({ type: 'REPLACE_VECTOR_OBJECTS', deviceId: currentVecDev.id, objects: consolidateTelaTraceObjects(currentVecDev.objects) }); setStudioSel(null); }}>Consolidate into editable layers</button>
                        </div>
                      )}

                      {/* Vector / Free-Float Text Box / Typography Overlay Layers */}
                      {currentVecDev && vecObjects.map((o, idx) => ({ o, idx })).reverse().map(({ o, idx }) => {
                        const isText = o.kind === 'TEXT';
                        const bound = isText && o.boundWriterDeviceId;
                        const sw = o.fill !== 'none' ? o.fill : (o.stroke !== 'none' ? o.stroke : '#888');
                        const displayLabel = isText
                          ? (o.objectLabel || (o.blocks?.[0]?.text ? blockPlainText(o.blocks[0]) : o.text) || 'Text Box')
                          : (o.objectLabel || o.kind[0] + o.kind.slice(1).toLowerCase());
                        return (
                          <div
                            key={o.id}
                            {...vectorContextMenu.bind({ deviceId: currentVecDev.id, object: o })}
                            onClick={event => setStudioSelection((event.shiftKey || event.ctrlKey || event.metaKey) ? (studioSelIds.includes(o.id) ? studioSelIds.filter(id => id !== o.id) : [...studioSelIds, o.id]) : [o.id])}
                            className="flex items-center gap-1.5 px-2 py-1.5 rounded-[8px] cursor-pointer transition-colors"
                            style={{
                              background: studioSelIds.includes(o.id) ? 'rgba(255,255,255,0.09)' : 'transparent',
                              border: studioSelIds.includes(o.id) ? `1px solid ${o.id === studioSel ? 'rgba(212,0,85,.55)' : 'rgba(0,218,243,.28)'}` : '1px solid transparent',
                              opacity: o.hidden ? 0.45 : 1,
                            }}
                          >
                            {isText ? (
                              <span className="w-4 h-4 rounded-[4px] shrink-0 grid place-items-center bg-[#FF8C00]/20 border border-[#FF8C00]/45">
                                <Type size={10} className="text-[#FF8C00]" />
                              </span>
                            ) : (
                              <span className="w-4 h-4 rounded-[4px] shrink-0" style={{ background: sw, border: '1px solid rgba(255,255,255,0.2)' }} />
                            )}
                            <span className="flex-1 min-w-0 text-[.73rem] text-white/90 truncate font-medium">{displayLabel}</span>
                            {isText && <span className="shrink-0 text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-white/[0.06] text-white/45">Text</span>}
                            {o.reconstructionLayer && <span className="shrink-0 text-[7px] font-extrabold tracking-[.08em] text-white/32">{o.reconstructionLayer}</span>}
                            {bound && <Link2 size={11} className="shrink-0 text-[var(--pj-cyan,#00DAF3)]" />}
                            <button
                              title={o.hidden ? 'Show layer' : 'Hide layer'}
                              onClick={e => { e.stopPropagation(); dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: currentVecDev.id, objectId: o.id, patch: { hidden: !o.hidden } }); }}
                              className="grid place-items-center w-4 h-5 text-white/45 hover:text-white"
                            >
                              {o.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                            <button
                              title="Bring forward"
                              onClick={e => { e.stopPropagation(); dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: currentVecDev.id, objectId: o.id, toIndex: idx + 1 }); }}
                              className="grid place-items-center w-4 h-5 text-white/45 hover:text-white"
                            >
                              <Plus size={11} />
                            </button>
                            <button
                              title="Send backward"
                              onClick={e => { e.stopPropagation(); dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: currentVecDev.id, objectId: o.id, toIndex: Math.max(0, idx - 1) }); }}
                              className="grid place-items-center w-4 h-5 text-white/45 hover:text-white"
                            >
                              <Minus size={11} />
                            </button>
                            <button
                              title="Delete layer"
                              onClick={e => { e.stopPropagation(); dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: currentVecDev.id, objectId: o.id }); if (studioSel === o.id) setStudioSel(null); }}
                              className="grid place-items-center w-4 h-5 text-white/35 hover:text-[var(--pj-danger,#EF4444)]"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        );
                      })}

                      {/* Image Raster Layers */}
                      {img && [...img.layers].map((l, idx) => ({ l, idx })).reverse().map(({ l, idx }) => (
                        <ImageLayerRow
                          key={l.id} layer={l} selected={studioSel === l.id}
                          onSelect={event => setStudioSelection((event.shiftKey || event.ctrlKey || event.metaKey) ? (studioSelIds.includes(l.id) ? studioSelIds.filter(id => id !== l.id) : [...studioSelIds, l.id]) : [l.id])}
                          onContextMenu={e => imageContextMenu.openAt(e.clientX, e.clientY, { deviceId: img.id, layer: l })}
                          onToggle={() => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: img.id, layerId: l.id, patch: { visible: !l.visible } })}
                          onForward={() => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: img.id, layerId: l.id, toIndex: idx + 1 })}
                          onBack={() => dispatchOp({ type: 'REORDER_IMAGE_LAYER', deviceId: img.id, layerId: l.id, toIndex: idx - 1 })}
                          onDelete={() => { dispatchOp({ type: 'DELETE_IMAGE_LAYER', deviceId: img.id, layerId: l.id }); if (studioSel === l.id) setStudioSel(null); }}
                        />
                      ))}

                      {/* Base Productivity Layer Row (Writer / Grid / Base / Form / Notes) */}
                      {isProductivity && (
                        <div
                          onClick={() => setStudioSel(null)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-[8px] cursor-pointer transition-colors"
                          style={{
                            background: !studioSel ? 'rgba(255,255,255,0.08)' : 'transparent',
                            border: !studioSel ? '1px solid rgba(208,188,255,0.35)' : '1px solid transparent',
                          }}
                        >
                          <span className="w-4 h-4 rounded-[4px] shrink-0 grid place-items-center bg-[#D0BCFF]/20 border border-[#D0BCFF]/40">
                            <FileText size={10} className="text-[#D0BCFF]" />
                          </span>
                          <span className="flex-1 min-w-0 text-[.73rem] text-white/85 truncate font-medium">
                            {isWriter ? 'Document Prose' : isGrid ? 'Spreadsheet Grid' : isBase ? 'Database Table' : isForm ? 'Interactive Form' : 'Page Base'}
                          </span>
                          <span className="shrink-0 text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-white/[0.06] text-white/40">Base</span>
                        </div>
                      )}

                      {vecObjects.length === 0 && (!img || img.layers.length === 0) && !isProductivity && (
                        <div className="px-1 py-2 text-[.72rem] text-white/35">
                          No layers on this page yet — click ＋ Text Box, ＋ Shape, or Add image above.
                        </div>
                      )}

                      {/* Selected Text Box / Vector Layer Inspector (Available on ALL page types including Image & Writer) */}
                      {selectedVecObj && currentVecDev && (
                        <div className="mt-2 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                          <div className="flex items-center mb-2 gap-1.5">
                            <div className={panelLbl}>
                              {selectedVecObj.kind === 'TEXT' ? 'Text Box / Typography Layer' : `${selectedVecObj.kind} Layer`}
                            </div>
                            {selectedVecObj.kind === 'TEXT' && (
                              <button
                                title="Open Typography & Text Art Studio"
                                onClick={() => setTypographyStudioOpen(true)}
                                className="ml-auto px-2 py-0.5 rounded-[6px] text-[.6rem] font-bold text-[#D0BCFF] bg-[#D0BCFF]/15 hover:bg-[#D0BCFF]/25 border border-[#D0BCFF]/30"
                              >
                                Typography Studio
                              </button>
                            )}
                            <button
                              title="Author in place — flying menu"
                              onClick={e => openFlying({ kind: selectedVecObj.kind === 'TEXT' ? 'vector-text' : 'vector-shape', deviceId: currentVecDev.id, objectId: selectedVecObj.id }, e)}
                              className={`${selectedVecObj.kind === 'TEXT' ? '' : 'ml-auto'} grid place-items-center w-6 h-6 rounded-[7px] text-white/45 hover:text-[var(--pj-cyan,#00DAF3)] hover:bg-white/[0.06]`}
                            >
                              <PenLine size={13} />
                            </button>
                          </div>
                          {selectedVecObj.kind === 'TEXT' && (
                            <div className="mb-2 px-2 py-1.5 rounded-[7px] bg-[#00DAF3]/10 border border-[#00DAF3]/25 text-[.62rem] text-[#8FF5FF]">
                              💡 <strong>Double-click</strong> inside the text box on the page to freely type, edit, and format rich text.
                            </div>
                          )}
                          <TelaVectorObjectProps
                            object={selectedVecObj}
                            writers={writerList}
                            onUpdate={patch => dispatchOp({ type: 'UPDATE_VECTOR_OBJECT', deviceId: currentVecDev.id, objectId: selectedVecObj.id, patch })}
                            onDelete={() => { dispatchOp({ type: 'DELETE_VECTOR_OBJECT', deviceId: currentVecDev.id, objectId: selectedVecObj.id }); setStudioSel(null); }}
                            onForward={() => { const i = currentVecDev.objects.findIndex(o => o.id === selectedVecObj.id); dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: currentVecDev.id, objectId: selectedVecObj.id, toIndex: i + 1 }); }}
                            onBack={() => { const i = currentVecDev.objects.findIndex(o => o.id === selectedVecObj.id); dispatchOp({ type: 'REORDER_VECTOR_OBJECT', deviceId: currentVecDev.id, objectId: selectedVecObj.id, toIndex: i - 1 }); }}
                            compact
                          />
                          {selectedVecObj.kind === 'TEXT' && (
                            <button onClick={() => openAssignmentBuilder({ prompt: selectedVecObj.text || selectedVecObj.objectLabel || '', vectorDeviceId: currentVecDev.id, vectorObjectId: selectedVecObj.id })} className="mt-3 w-full flex items-center justify-center gap-1.5 h-9 rounded-[10px] text-[.7rem] font-extrabold text-white" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)' }}>
                              <CircleHelp size={14}/>{selectedVecObj.assignmentFieldId ? 'Edit question properties' : 'Make interactive question'}
                            </button>
                          )}
                          {selectedVecObj.kind === 'IMAGE' && (
                            <button onClick={() => void refineSelectedRegion(currentVecDev, selectedVecObj)} disabled={studioMaskBusy} className="mt-3 w-full flex items-center justify-center gap-1.5 h-9 rounded-[10px] text-[.7rem] font-extrabold text-white disabled:opacity-40" style={{ background: 'var(--pj-grad-spatial,linear-gradient(135deg,#6B0099,#00DAF3))' }}>
                              {studioMaskBusy ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>} {studioMaskBusy ? (studioAiProgress?.message || 'Refining…') : `Refine object edge · ${Math.round(TELA_SEGMENT_MODEL.approximateBytes / 1048576)} MB`}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Selected Image Layer Inspector */}
                      {selectedImgLayer && img && (
                        <div className="mt-2 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                          <div className="flex items-center mb-2">
                            <div className={panelLbl}>Image Layer</div>
                            <button
                              title="Author in place — flying menu"
                              onClick={e => openFlying({ kind: 'image-layer', deviceId: img.id, layerId: selectedImgLayer.id }, e)}
                              className="ml-auto grid place-items-center w-6 h-6 rounded-[7px] text-white/45 hover:text-[var(--pj-cyan,#00DAF3)] hover:bg-white/[0.06]"
                            >
                              <PenLine size={13} />
                            </button>
                          </div>
                          {selectedImgLayer.sessionOnly && <div className="text-[.62rem] font-semibold mb-2" style={{ color: 'var(--pj-warning,#F59E0B)' }}>Session-only — sign in to keep this image.</div>}
                          <TelaImageLayerControls
                            layer={selectedImgLayer}
                            onUpdate={patch => dispatchOp({ type: 'UPDATE_IMAGE_LAYER', deviceId: img.id, layerId: selectedImgLayer.id, patch })}
                            onAddLayer={newLayer => dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId: img.id, layer: newLayer })}
                            canvasDims={{ width: img.width, height: img.height }}
                          />
                        </div>
                      )}

                      {doc && vec && (() => { const liveFrame = doc.frames.find(f => f.deviceIds.includes(vec.id)); return liveFrame ? <React.Suspense fallback={null}><TelaBehaviorsPanel doc={doc} frameId={liveFrame.id} selectedObjectId={studioSel} dispatchOp={dispatchOp} /><ComposeWithCouncil doc={doc} frameId={liveFrame.id} dispatchOp={dispatchOp} /></React.Suspense> : null; })()}
                    </div>

                    {/* Productivity Document / Grid Inspector below Page Layers */}
                    {isProductivity && isWriter && (
                      <div className="p-3 flex flex-col gap-4 text-white">
                        <div>
                          <div className={panelLbl}>Quick Structure</div>
                          <div className="grid grid-cols-2 gap-1.5 mt-2">
                            <button
                              onClick={() => {
                                if (aiActiveWriterId) {
                                  const newB = makeBlock('h1', 'Main Title');
                                  aiSetBlocks([...aiWriterBlocks, newB]);
                                }
                              }}
                              className="h-8 px-2 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.12] text-[.68rem] font-bold text-left flex items-center gap-1.5"
                            >
                              <Type size={13} className="text-[#D0BCFF]" /> Title (H1)
                            </button>
                            <button
                              onClick={() => {
                                if (aiActiveWriterId) {
                                  const newB = makeBlock('h2', 'Section Heading');
                                  aiSetBlocks([...aiWriterBlocks, newB]);
                                }
                              }}
                              className="h-8 px-2 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.12] text-[.68rem] font-bold text-left flex items-center gap-1.5"
                            >
                              <Type size={13} className="text-[#00DAF3]" /> Heading (H2)
                            </button>
                            <button
                              onClick={() => {
                                if (aiActiveWriterId) {
                                  const newB = makeBlock('p', 'New paragraph prose text...');
                                  aiSetBlocks([...aiWriterBlocks, newB]);
                                }
                              }}
                              className="h-8 px-2 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.12] text-[.68rem] font-bold text-left flex items-center gap-1.5"
                            >
                              <FileText size={13} className="text-white/60" /> Paragraph
                            </button>
                            <button
                              onClick={() => {
                                if (aiActiveWriterId) {
                                  const newB = makeBlock('li', 'Key point or checklist item');
                                  aiSetBlocks([...aiWriterBlocks, newB]);
                                }
                              }}
                              className="h-8 px-2 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.12] text-[.68rem] font-bold text-left flex items-center gap-1.5"
                            >
                              <span className="text-[#34d399] font-black">•</span> Bullet Item
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className={panelLbl}>Screenplay Elements</div>
                          <div className="grid grid-cols-2 gap-1.5 mt-2">
                            <button
                              onClick={() => {
                                if (aiActiveWriterId) {
                                  const newB = makeBlock('h2', 'INT. LOCATION - DAY');
                                  aiSetBlocks([...aiWriterBlocks, newB]);
                                }
                              }}
                              className="h-8 px-2 rounded-[8px] bg-pink-500/10 hover:bg-pink-500/20 text-[#f472b6] text-[.66rem] font-bold text-left flex items-center gap-1"
                            >
                              🎬 Scene
                            </button>
                            <button
                              onClick={() => {
                                if (aiActiveWriterId) {
                                  const newB = makeBlock('h2', 'CHARACTER NAME');
                                  aiSetBlocks([...aiWriterBlocks, newB]);
                                }
                              }}
                              className="h-8 px-2 rounded-[8px] bg-pink-500/10 hover:bg-pink-500/20 text-[#f472b6] text-[.66rem] font-bold text-left flex items-center gap-1"
                            >
                              👤 Character
                            </button>
                            <button
                              onClick={() => {
                                if (aiActiveWriterId) {
                                  const newB = makeBlock('p', '(parenthetical reaction)');
                                  aiSetBlocks([...aiWriterBlocks, newB]);
                                }
                              }}
                              className="h-8 px-2 rounded-[8px] bg-pink-500/10 hover:bg-pink-500/20 text-[#f472b6] text-[.66rem] font-bold text-left flex items-center gap-1"
                            >
                              🎭 Parenthetical
                            </button>
                            <button
                              onClick={() => {
                                if (aiActiveWriterId) {
                                  const newB = makeBlock('p', 'Dialogue goes here.');
                                  aiSetBlocks([...aiWriterBlocks, newB]);
                                }
                              }}
                              className="h-8 px-2 rounded-[8px] bg-pink-500/10 hover:bg-pink-500/20 text-[#f472b6] text-[.66rem] font-bold text-left flex items-center gap-1"
                            >
                              💬 Dialogue
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className={panelLbl}>Document Metrics</div>
                          {(() => {
                            const text = aiActiveWriterId ? (writerTexts[aiActiveWriterId] || '') : '';
                            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
                            const chars = text.length;
                            const mins = Math.max(1, Math.ceil(words / 200));
                            return (
                              <div className="grid grid-cols-3 gap-2 mt-2 p-2.5 rounded-[10px] bg-white/[0.04] border border-white/[0.08]">
                                <div>
                                  <div className="text-[.6rem] text-white/40 font-bold uppercase">Words</div>
                                  <div className="text-[1.1rem] font-black text-white">{words}</div>
                                </div>
                                <div>
                                  <div className="text-[.6rem] text-white/40 font-bold uppercase">Chars</div>
                                  <div className="text-[1.1rem] font-black text-white">{chars}</div>
                                </div>
                                <div>
                                  <div className="text-[.6rem] text-white/40 font-bold uppercase">Read</div>
                                  <div className="text-[1.1rem] font-black text-[#8ff5ff]">~{mins}m</div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.08]">
                          <button
                            onClick={() => setWritingStudioOpen(true)}
                            className="flex items-center justify-center gap-1.5 h-9 rounded-[10px] text-[.72rem] font-extrabold text-white"
                            style={{ background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' }}
                          >
                            <FileText size={14} /> Screenplay & Lorea Desk
                          </button>
                          <button
                            onClick={() => openAssignmentBuilder()}
                            className="flex items-center justify-center gap-1.5 h-8 rounded-[9px] text-[.68rem] font-bold text-sky-300 bg-sky-500/10 border border-sky-500/25 hover:bg-sky-500/20 transition-all"
                          >
                            <CircleHelp size={13} /> Make Interactive Question
                          </button>
                        </div>
                      </div>
                    )}

                    {isProductivity && isGrid && (
                      <div className="p-3 flex flex-col gap-4 text-white">
                        <div>
                          <div className={panelLbl}>Spreadsheet Formulas</div>
                          <div className="flex flex-col gap-1.5 mt-2">
                            {['=SUM(A1:A10)', '=AVERAGE(B1:B10)', '=COUNT(A1:A20)', '=MIN(C1:C10)', '=MAX(C1:C10)'].map(formula => (
                              <div key={formula} className="flex items-center justify-between p-2 rounded-[8px] bg-white/[0.04] border border-white/[0.06] text-[.68rem]">
                                <code className="text-cyan-300 font-mono">{formula}</code>
                                <button
                                  onClick={() => navigator.clipboard?.writeText(formula)}
                                  className="text-[.6rem] text-white/40 hover:text-white font-bold"
                                >
                                  Copy
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className={panelLbl}>Data Actions</div>
                          <div className="flex flex-col gap-2 mt-2">
                            <button
                              onClick={() => {
                                const grid = activeDevice as TelaGridDevice;
                                if (grid && grid.cells) {
                                  const keys = Object.keys(grid.cells);
                                  const maxCol = Math.max(1, ...keys.map(k => { const m = k.match(/[A-Z]+/); return m ? xlsxColIndex(m[0]) + 1 : 1; }));
                                  const maxRow = Math.max(1, ...keys.map(k => { const m = k.match(/\d+/); return m ? parseInt(m[0], 10) : 1; }));
                                  let csv = '';
                                  for (let r = 1; r <= maxRow; r++) {
                                    const rowVals: string[] = [];
                                    for (let c = 0; c < maxCol; c++) {
                                      const letters = String.fromCharCode(65 + c);
                                      rowVals.push(`"${(grid.cells[`${letters}${r}`] || '').replace(/"/g, '""')}"`);
                                    }
                                    csv += rowVals.join(',') + '\n';
                                  }
                                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a'); a.href = url; a.download = `${activeFrame.label || 'grid'}.csv`; a.click(); URL.revokeObjectURL(url);
                                }
                              }}
                              className="h-8 rounded-[8px] text-[.68rem] font-bold text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center gap-1.5"
                            >
                              <FileDown size={13} /> Export as CSV
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
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
          onPointerMove={event => {
            onCanvasPointerMove(event);
            // Share your pointer (canvas space) with collaborators.
            const s = co.session;
            if (s) { const rect = event.currentTarget.getBoundingClientRect(); s.setCursor({ x: (event.clientX - rect.left - cam.x) / cam.z, y: (event.clientY - rect.top - cam.y) / cam.z, s: activeFrameId || undefined }); }
          }}
          onPointerLeave={() => co.session?.setCursor(null)}
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
            {co.snap && <TelaPresenceLayer doc={doc} presence={co.snap.presence} z={cam.z} />}
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
                    {frame.deviceIds.map((id, devIdx) => {
                      const dev = doc.devices[id];
                      if (!dev) return null;
                      if (positionedForm && dev.type === 'BASE') return null;
                      const isOverlay = devIdx > 0 && dev.type === 'VECTOR';
                      const positionedLayer = positionedForm && (dev.id === positionedForm.pageDeviceId || dev.id === positionedForm.id);
                      return (
                        <div
                          key={id}
                          style={positionedLayer ? {
                            position: 'absolute',
                            inset: 0,
                            zIndex: dev.id === positionedForm.id ? 3 : 1,
                            minHeight: 0,
                          } : isOverlay ? {
                            position: 'absolute',
                            inset: 0,
                            zIndex: 10 + devIdx,
                            pointerEvents: 'none',
                          } : {
                            flex: 1,
                            minHeight: 0,
                            position: 'relative',
                            zIndex: 1,
                          }}
                        >
                          {renderDevice(dev, false, isOverlay)}
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

      {prepressOpen && doc && (
        <React.Suspense fallback={null}>
          <PrepressPanel
            doc={doc}
            renderFrame={renderFrameForPrint}
            onSetSpec={(spec, resizeFrameIds) => dispatchOp({ type: 'SET_PRINT_SPEC', spec, resizeFrameIds })}
            onAddBlankPages={addBlankPrintPages}
            onCreateWrapBoard={createWrapBoard}
            onClose={() => setPrepressOpen(false)}
          />
        </React.Suspense>
      )}
      {(templateMenu === 'save' || templateMenu === 'library') && createPortal(
        <div style={{ position: 'relative', zIndex: 10000 }}><React.Suspense fallback={null}>
          {templateMenu === 'save' && docRef.current ? (
            <SaveTemplateDialog
              doc={docRef.current}
              viewer={{ uid: auth.currentUser?.uid || 'local', name: auth.currentUser?.displayName || 'You' }}
              org={(() => {
                const o = docRef.current?.orgOrigin || (classwork ? { orgId: classwork.orgId, orgName: classwork.orgName } : undefined);
                return o ? { orgId: o.orgId, orgName: o.orgName, role: isEducator || classwork ? 'teacher' as const : 'member' as const, canSaveToOrg: !!(isEducator || classwork) } : undefined;
              })()}
              onClose={() => setTemplateMenu(null)}
            />
          ) : (
            <TemplateLibrary
              orgId={docRef.current?.orgOrigin?.orgId || classwork?.orgId}
              orgName={docRef.current?.orgOrigin?.orgName || classwork?.orgName}
              viewer={{ uid: auth.currentUser?.uid || 'local', name: auth.currentUser?.displayName || 'You' }}
              orgRole={isEducator || classwork ? 'teacher' : 'member'}
              onOpenDoc={id => { setTemplateMenu(null); void openCanvas(id); }}
              onClose={() => setTemplateMenu(null)}
            />
          )}
        </React.Suspense></div>,
        document.body
      )}
      {classworkOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
          <React.Suspense fallback={<div className="p-8 text-white">Opening Classwork…</div>}>
            <TelaClassworkStudio
              context={classwork}
              onClose={() => setClassworkOpen(false)}
              onOpenDoc={docId => { setClassworkOpen(false); void openCanvas(docId); }}
              onReturn={returnTo?.onReturn}
              returnLabel={returnTo?.label}
            />
          </React.Suspense>
        </div>,
        document.body
      )}
      {comicStudioOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(6px)' }}>
          <div style={{ width: '1150px', height: '840px', maxWidth: '96vw', maxHeight: '94vh', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 25px 80px rgba(0,0,0,0.9)' }}>
            <React.Suspense fallback={<div className="p-8 text-white">Loading Comic Studio…</div>}>
              <TelaComicStudio
                onClose={() => setComicStudioOpen(false)}
                onInsertPageIntoTela={(pageSpec) => {
                  const width = 1200;
                  const height = 1600;
                  const validPanels = pageSpec.panels.filter(p => p.renderedImageUrl);
                  const total = Math.max(1, validPanels.length);
                  const cols = 2;
                  const rows = Math.ceil(total / cols);
                  const pw = Math.round((width - 60) / cols);
                  const ph = Math.round((height - 80) / rows);
                  const layers = validPanels.map((panel, idx) => {
                    const row = Math.floor(idx / cols);
                    const col = idx % cols;
                    const px = 20 + col * (pw + 20);
                    const py = 20 + row * (ph + 20);
                    return makeImageLayer(panel.renderedImageUrl!, `Panel ${idx + 1}`, {
                      x: px,
                      y: py,
                    });
                  });
                  const imgDev: TelaImageDevice = {
                    id: uid('dev'),
                    type: 'IMAGE',
                    name: `${pageSpec.title} (Artwork)`,
                    width,
                    height,
                    layers,
                  };
                  addFrame('BOARD', 'FREE', imgDev, pageSpec.title, { size: { w: width, h: height } });
                  setComicStudioOpen(false);
                  setPosture('BOARD');
                }}
              />
            </React.Suspense>
          </div>
        </div>,
        document.body
      )}

      {paiGalleryOpen && (
        <TelaPaiGalleryModal
          isOpen={paiGalleryOpen}
          onClose={() => setPaiGalleryOpen(false)}
          isImageDeviceActive={isCurrentImage}
          onInsertFrame={(item) => {
            const width = item.width || 1024;
            const height = item.height || 1024;
            const imgDev: TelaImageDevice = {
              id: uid('dev'),
              type: 'IMAGE',
              name: item.prompt ? item.prompt.slice(0, 30) : 'PAI Render',
              width,
              height,
              layers: [makeImageLayer(item.url, 'Layer 1')],
            };
            addFrame('SCREEN', 'FREE', imgDev, item.prompt ? item.prompt.slice(0, 40) : 'PAI Generation', { size: { w: width, h: height } });
            setPosture('STUDIO');
          }}
          onAddLayer={(item) => {
            if (currentDevice && currentDevice.type === 'IMAGE') {
              const newLayer = makeImageLayer(item.url, item.prompt ? item.prompt.slice(0, 24) : 'PAI Layer');
              dispatchOp({ type: 'ADD_IMAGE_LAYER', deviceId: currentDevice.id, layer: newLayer });
            }
          }}
          onOpenInStudio={(item) => {
            setLocalStudioOpen(true);
          }}
        />
      )}

      {localStudioOpen && createPortal(
        // Docked on the right, never a takeover: no backdrop, the canvas stays live, and the panel can be minimised
        // to a 46 px progress rail while a render runs (the studio stays mounted, so the GPU job carries on).
        <div
          aria-label="Local Creative Studio"
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 260, width: localStudioMinimized ? 46 : 'clamp(440px, 38vw, 620px)', display: 'flex', flexDirection: 'column', background: '#100B17', borderLeft: '1px solid rgba(212,0,85,0.3)', boxShadow: '-18px 0 48px rgba(0,0,0,0.55)', transition: 'width .18s ease' }}
        >
          {localStudioMinimized && (
            <button
              onClick={() => setLocalStudioMinimized(false)}
              title={localStudioProgress.loading ? `Rendering… ${Math.round(localStudioProgress.pct)}% — click to open` : 'Open Local Creative Studio'}
              style={{ flex: 1, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '12px 0', color: '#FAF5FF' }}
            >
              <Wand2 size={18} color="#D40055" className={localStudioProgress.loading ? 'animate-pulse' : ''} />
              {localStudioProgress.loading && (
                <div style={{ width: 6, flex: 1, borderRadius: 3, background: 'rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.max(4, localStudioProgress.pct)}%`, background: 'linear-gradient(180deg,#FF8C00,#D40055)', transition: 'height .3s ease' }} />
                </div>
              )}
              <span style={{ writingMode: 'vertical-rl', fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(250,245,255,.7)' }}>
                {localStudioProgress.loading ? `Rendering ${Math.round(localStudioProgress.pct)}%` : 'Local Studio'}
              </span>
            </button>
          )}
          <div style={{ flex: 1, minHeight: 0, display: localStudioMinimized ? 'none' : 'flex' }}>
            <React.Suspense fallback={<div className="p-8 text-white">Loading Creative Studio…</div>}>
              <LocalCreativeStudio
                variant="panel"
                onMinimize={() => setLocalStudioMinimized(true)}
                onProgress={setLocalStudioProgress}
                onClose={() => { setLocalStudioOpen(false); setLocalStudioMinimized(false); }}
                onSendToTela={(url) => {
                  const width = 1024;
                  const height = 1024;
                  const imgDev: TelaImageDevice = {
                    id: uid('dev'),
                    type: 'IMAGE',
                    name: 'Local AI Render',
                    width,
                    height,
                    layers: [makeImageLayer(url, 'Layer 1')],
                  };
                  addFrame('SCREEN', 'FREE', imgDev, 'Local AI Generation', { size: { w: width, h: height } });
                  // Stay docked (minimised) so the next render is one click away and nothing in flight is lost.
                  setLocalStudioMinimized(true);
                  setPosture('STUDIO');
                }}
              />
            </React.Suspense>
          </div>
        </div>,
        document.body
      )}

      {writingStudioOpen && createPortal(
        <React.Suspense fallback={<div className="fixed inset-0 z-[280] grid place-items-center bg-[#0b0910] text-white/60">Loading Writing Studio…</div>}>
          <TelaWritingStudio
            isOpen={writingStudioOpen}
            onClose={() => setWritingStudioOpen(false)}
            user={auth.currentUser}
            initialTab={writingStudioTab}
            onInsertScriptToCanvas={(script) => {
              insertScriptFrame(script);
              setWritingStudioOpen(false);
            }}
          />
        </React.Suspense>,
        document.body,
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

      {ulOpen && <UniversalLibraryPanel accent="#8B5CFF" defaultDock="floating" storageKey="tela.ullib.geo.v1" accepts={['template', 'motion']} onClose={() => setUlOpen(false)} onUse={(it) => { if (it.kind === 'motion') { addMotionTemplateFromLibrary(it); return; } const t = TELA_TEMPLATE_GALLERY.find((x) => 'tela:' + x.id === it.id); if (t) { addTemplateFrames(t); setUlOpen(false); } }} />}
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
          {renderFrameForPrint(printFrame)}
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
      {canvasContextMenu.node}
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
