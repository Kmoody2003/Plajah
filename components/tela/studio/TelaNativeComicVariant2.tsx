import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Columns,
  Eye,
  EyeOff,
  FileText,
  Film,
  Grid3X3,
  Layers,
  LayoutGrid,
  Link as LinkIcon,
  Lock,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  MousePointer2,
  Pause,
  PenLine,
  PenTool,
  Play,
  Plus,
  Rows,
  Scissors,
  Shapes,
  SkipBack,
  Sparkles,
  Target,
  Trash2,
  Type,
  Unlock,
  Volume2,
  Zap,
} from 'lucide-react';
import type { TelaRailItem } from '../TelaToolRail';
import {
  computeSafeBalloonPlacement,
  LAYER_ANIMATION_PRESETS,
} from '../../../services/comic/comicMangaPageEngine';
import {
  type CinemagraphEffectType,
  CINEMAGRAPH_PRESETS,
  createCinemagraphParticles,
  renderCinemagraphFrame,
  synthesizePanelVoiceTake,
} from '../../../services/comic/panelMotionEngine';
import { sampleKeyframeTrack } from '../../../services/anima/evaluator';
import type {
  BalloonSafeDockZone,
  CameraAngle,
  ComicPageDocument,
  ComicPanelNode,
  ComicProject,
  ComicProjectFormat,
  ComicProjectSummary,
  HalftoneLayerConfig,
  KanjiSfxItem,
  NestedPanelTelaDocument,
  PanelGeometry,
  PanelKeyframeItem,
  PanelLayoutPresetId,
  PanelSubLayer,
  SpeechBalloonItem,
} from '../../../services/comicProject/types';
import { DEFAULT_PAGE_ASPECT } from '../../../services/comicProject/types';
import { relayoutPanels } from '../../../services/comicProject/layout';
import {
  comicProjectToShowcaseBook,
  showcaseProjectId,
  SFX_STYLE_INK,
} from '../../../services/comicProject/showcaseImport';
import {
  deleteComicProject,
  downloadComicProject,
  getLastComicProjectId,
  listComicProjects,
  loadComicProject,
  readComicProjectFile,
  saveComicProject,
  setLastComicProjectId,
  stashPendingComicProject,
  takePendingComicProject,
  COMIC_CLOUD_KIND,
} from '../../../services/comicProject/store';
import {
  CreativeStorageMeter,
  CreativeSyncPill,
  CreativeVersionHistory,
} from '../../creative/CreativeCloudPanels';
import {
  listShowcaseCatalog,
  openShowcaseAsProject,
  type ShowcaseCatalogEntry,
} from '../../../services/comicProject/catalog';

export type {
  BalloonSafeDockZone,
  ComicPageDocument,
  ComicPanelNode,
  HalftoneLayerConfig,
  KanjiSfxItem,
  NestedPanelTelaDocument,
  PanelKeyframeItem,
  PanelLayoutPresetId,
  PanelSubLayer,
  SpeechBalloonItem,
};

export type ComicActiveToolId =
  | 'select'
  | 'knife'
  | 'gpen'
  | 'balloon'
  | 'sfx'
  | 'screentone'
  | 'motion'
  | 'reframe';

export type TimelineSyncMode = 'selected' | 'inview';

export const PANEL_LAYOUT_PRESETS: { id: PanelLayoutPresetId; name: string }[] = [
  { id: 'action-4-grid', name: '4-Panel Action Grid' },
  { id: 'manga-5-dynamic', name: '5-Panel Manga Slash' },
  { id: 'widescreen-3-tier', name: '3-Tier Widescreen Cinema' },
  { id: 'storybook-2-spread', name: 'Storybook Twin Spread' },
];

export const KANJI_SFX_PRESET_LIBRARY = [
  { id: 'sfx_don', kanji: 'ドン!', romaji: 'DON!', meaning: 'Boom / Impact', colorHex: '#D40055', strokeHex: '#ffffff' },
  { id: 'sfx_gogo', kanji: 'ゴゴゴ', romaji: 'GOGOGO', meaning: 'Menacing Rumble', colorHex: '#D0BCFF', strokeHex: '#120d1c' },
  { id: 'sfx_baki', kanji: 'バキッ', romaji: 'BAKI!', meaning: 'Snap / Strike', colorHex: '#00DAF3', strokeHex: '#120d1c' },
  { id: 'sfx_zaza', kanji: 'ザァァ', romaji: 'ZAAA', meaning: 'Downpour Rain', colorHex: '#FF8C00', strokeHex: '#120d1c' },
];

function createDefaultLayersForPanel(order: number): PanelSubLayer[] {
  return [
    {
      id: `lyr_bal_${order}`,
      name: 'Safe-Zone Speech Balloons',
      kind: 'SPEECH_BALLOONS',
      visible: true,
      locked: false,
      keyframes: [
        { id: `kf_b0_${order}`, timeSec: 0, scale: 0.92, x: 0, y: 4, rotation: 0, opacity: 0 },
        { id: `kf_b1_${order}`, timeSec: 0.6, scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 },
      ],
    },
    {
      id: `lyr_sfx_${order}`,
      name: 'Kanji Action SFX',
      kind: 'KANJI_SFX',
      visible: true,
      locked: false,
      keyframes: [
        { id: `kf_s0_${order}`, timeSec: 0.8, scale: 1.15, x: 0, y: 0, rotation: -6, opacity: 1 },
      ],
    },
    {
      id: `lyr_tone_${order}`,
      name: '60 LPI Manga Screentone',
      kind: 'SCREENTONE_SHADER',
      visible: true,
      locked: false,
      keyframes: [{ id: `kf_t0_${order}`, timeSec: 0, scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 }],
    },
    {
      id: `lyr_ink_${order}`,
      name: 'Sketchbook G-Pen Inks',
      kind: 'INK_DRAWING',
      visible: true,
      locked: false,
      keyframes: [{ id: `kf_i0_${order}`, timeSec: 0, scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 }],
    },
    {
      id: `lyr_cast_${order}`,
      name: 'Character Cast Cutout',
      kind: 'CHARACTER_CAST',
      visible: true,
      locked: false,
      keyframes: [
        { id: `kf_c0_${order}`, timeSec: 0, scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 },
        { id: `kf_c1_${order}`, timeSec: 2.5, scale: 1.04, x: 3, y: -2, rotation: 0, opacity: 1 },
      ],
    },
    {
      id: `lyr_mid_${order}`,
      name: 'Depth Midground Fog',
      kind: 'MIDGROUND_DEPTH',
      visible: true,
      locked: false,
      keyframes: [{ id: `kf_m0_${order}`, timeSec: 0, scale: 1, x: 0, y: 0, rotation: 0, opacity: 0.85 }],
    },
    {
      id: `lyr_bg_${order}`,
      name: 'Background Art Plate',
      kind: 'BACKGROUND_PLATE',
      visible: true,
      locked: false,
      keyframes: [
        { id: `kf_bg0_${order}`, timeSec: 0, scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 },
        { id: `kf_bg1_${order}`, timeSec: 4.8, scale: 1.12, x: -6, y: -4, rotation: 0, opacity: 1 },
      ],
    },
  ];
}

function createComicPageFromPreset(
  presetId: PanelLayoutPresetId,
  pageNumber = 1,
  customTitle?: string
): ComicPageDocument {
  const boxes =
    presetId === 'widescreen-3-tier'
      ? [
          { xPct: 0, yPct: 0, widthPct: 100, heightPct: 33.3 },
          { xPct: 0, yPct: 33.3, widthPct: 100, heightPct: 33.3 },
          { xPct: 0, yPct: 66.6, widthPct: 100, heightPct: 33.4 },
        ]
      : presetId === 'storybook-2-spread'
      ? [
          { xPct: 0, yPct: 0, widthPct: 100, heightPct: 52 },
          { xPct: 0, yPct: 52, widthPct: 100, heightPct: 48 },
        ]
      : presetId === 'manga-5-dynamic'
      ? [
          { xPct: 0, yPct: 0, widthPct: 100, heightPct: 34 },
          { xPct: 0, yPct: 34, widthPct: 46, heightPct: 32 },
          { xPct: 46, yPct: 34, widthPct: 54, heightPct: 32 },
          { xPct: 0, yPct: 66, widthPct: 52, heightPct: 34 },
          { xPct: 52, yPct: 66, widthPct: 48, heightPct: 34 },
        ]
      : [
          { xPct: 0, yPct: 0, widthPct: 50, heightPct: 52 },
          { xPct: 50, yPct: 0, widthPct: 50, heightPct: 52 },
          { xPct: 0, yPct: 52, widthPct: 50, heightPct: 48 },
          { xPct: 50, yPct: 52, widthPct: 50, heightPct: 48 },
        ];

  const shots: ComicPanelNode['cameraShot'][] = [
    'ESTABLISHING_WIDE',
    'CLOSE_UP',
    'MEDIUM_ACTION',
    'LOW_ANGLE_HERO',
    'EXTREME_CLOSE_UP',
  ];

  const panels: ComicPanelNode[] = boxes.map((box, idx) => {
    const order = idx + 1;
    const shot = shots[idx % shots.length];

    return {
      id: `panel_p${pageNumber}_${order}_${Math.random().toString(36).slice(2, 6)}`,
      order,
      cameraShot: shot,
      prompt: `Scene panel ${order} — ${shot.replace(/_/g, ' ').toLowerCase()}`,
      box,
      nestedDocument: {
        id: `nested_p${pageNumber}_${order}`,
        timelineDurationSec: 5.0,
        cinemagraphPreset: 'none',
        halftone: {
          enabled: presetId === 'manga-5-dynamic' && idx % 2 === 1,
          dotsPerInch: 60,
          opacity: 0.24,
          colorHex: '#000000',
        },
        layers: createDefaultLayersForPanel(order),
        inkStrokes: [],
        balloons: [],
        sfxItems: [],
      },
    };
  });

  return {
    id: `comic_pg_${pageNumber}_${Date.now().toString().slice(-4)}`,
    title: customTitle || `Comic Page ${pageNumber}`,
    presetId,
    gutterPx: 10,
    paperColorHex: '#FFFFFF',
    panels,
  };
}

const KF_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity'] as const;
const KF_DEFAULTS = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };

/** Samples a comic layer's keyframes with Anima's evaluator (so eases match Anima Studio). */
function evaluateKeyframesAtTime(keyframes: PanelKeyframeItem[], timeSec: number) {
  if (!keyframes || keyframes.length === 0) return { ...KF_DEFAULTS };
  const sorted = [...keyframes].sort((a, b) => a.timeSec - b.timeSec);
  const out = { ...KF_DEFAULTS };
  for (const prop of KF_PROPS) {
    out[prop] = sampleKeyframeTrack(
      sorted.map((k) => ({ id: k.id, t: k.timeSec, v: k[prop], ease: k.ease ?? 'linear' })),
      timeSec,
      KF_DEFAULTS[prop]
    );
  }
  return out;
}

export interface TelaComicVariant2Controller {
  pages: ComicPageDocument[];
  activePageId: string;
  activePage: ComicPageDocument;
  activePanelId: string;
  activePanel: ComicPanelNode;
  activeLayerId: string;
  activeTool: ComicActiveToolId;
  inspectorSection: 'layout' | 'ink' | 'balloon' | 'motion';
  deepFocusPanelId: string | null;
  timelineExpanded: boolean;
  timelineSyncMode: TimelineSyncMode;
  isPlaying: boolean;
  currentTimeSec: number;
  selectedShowcaseBookId: string;
  gpenColor: string;
  gpenSize: number;
  gpenStreamline: number;
  balloonDraftText: string;
  balloonDraftSpeaker: string;
  balloonDraftStyle: SpeechBalloonItem['style'];
  balloonDraftDock: BalloonSafeDockZone;
  showOnCanvasLayersCard: boolean;
  panelImageUrlDraft: string;
  setActivePageId: (id: string) => void;
  setActivePanelId: (id: string) => void;
  setActiveLayerId: (id: string) => void;
  setActiveTool: (tool: ComicActiveToolId) => void;
  setInspectorSection: (sec: 'layout' | 'ink' | 'balloon' | 'motion') => void;
  setDeepFocusPanelId: (id: string | null) => void;
  setTimelineExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setTimelineSyncMode: React.Dispatch<React.SetStateAction<TimelineSyncMode>>;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentTimeSec: React.Dispatch<React.SetStateAction<number>>;
  setGpenColor: (c: string) => void;
  setGpenSize: (s: number) => void;
  setGpenStreamline: (s: number) => void;
  setBalloonDraftText: (t: string) => void;
  setBalloonDraftSpeaker: (s: string) => void;
  setBalloonDraftStyle: (st: SpeechBalloonItem['style']) => void;
  setBalloonDraftDock: (d: BalloonSafeDockZone) => void;
  setShowOnCanvasLayersCard: React.Dispatch<React.SetStateAction<boolean>>;
  setPanelImageUrlDraft: (u: string) => void;
  applyPanelImageUrlDraft: () => void;
  loadShowcaseBook: (bookId: string) => void;
  applyPageGridPreset: (presetId: PanelLayoutPresetId) => void;
  addNewComicPage: (presetId?: PanelLayoutPresetId) => void;
  deleteComicPage: (pageId: string) => void;
  splitActivePanel: (direction: 'horizontal' | 'vertical' | 'diagonal', slantDeg?: number) => void;
  updateActivePanel: (updater: (panel: ComicPanelNode) => ComicPanelNode) => void;
  updateActiveNestedDoc: (updater: (doc: NestedPanelTelaDocument) => NestedPanelTelaDocument) => void;
  addSafeSpeechBalloon: (customText?: string, customDock?: BalloonSafeDockZone) => void;
  deleteSpeechBalloon: (balloonId: string) => void;
  addKanjiSfxStamp: (presetIndex?: number) => void;
  setPanelScreentone: (config: Partial<HalftoneLayerConfig>) => void;
  setPanelCinemagraph: (presetId: CinemagraphEffectType) => void;
  applyMotionPresetToActiveLayer: (presetId: string) => void;
  triggerPanelVoiceSynth: () => void;
  handlePanelInViewChange: (pageId: string, panelId: string) => void;
  telemetry: {
    pageCount: number;
    activePageIndex: number;
    totalPanels: number;
    totalWords: number;
    totalBalloons: number;
    estimatedReadTimeStr: string;
  };

  // ── Project: open, autosave, export ──
  project: ComicProject;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  projectError: string | null;
  savedProjects: ComicProjectSummary[];
  showcaseCatalog: ShowcaseCatalogEntry[];
  openShowcase: (showcaseId: string) => Promise<void>;
  openSavedProject: (id: string) => Promise<void>;
  newProject: (format?: ComicProjectFormat) => void;
  resetProjectToSource: () => Promise<void>;
  renameProject: (title: string) => void;
  exportProjectFile: () => void;
  importProjectFile: (file: File) => Promise<void>;
  exportShowcaseJson: () => void;
  deleteSavedProject: (id: string) => Promise<void>;
  /** Replace the open project with a restored version's JSON (autosaves as a new edit). */
  restoreProjectJson: (json: string) => void;

  // ── Living graphic novel playback + direct edits ──
  readMode: boolean;
  setReadMode: React.Dispatch<React.SetStateAction<boolean>>;
  loopsEnabled: boolean;
  setLoopsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  updateActivePage: (updater: (page: ComicPageDocument) => ComicPageDocument) => void;
  updatePanelById: (pageId: string, panelId: string, updater: (panel: ComicPanelNode) => ComicPanelNode) => void;
  relayoutActivePage: () => void;
}

function blankComicProject(format: ComicProjectFormat = 'comic'): ComicProject {
  const now = Date.now();
  return {
    schema: 'plajah.comicProject',
    version: 1,
    id: `comic_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title: format === 'manga' ? 'Untitled Manga' : format === 'storybook' ? 'Untitled Storybook' : 'Untitled Comic',
    format,
    readingDirection: format === 'manga' ? 'rtl' : 'ltr',
    pages: [
      createComicPageFromPreset(
        format === 'manga' ? 'manga-5-dynamic' : format === 'storybook' ? 'storybook-2-spread' : 'action-4-grid',
        1
      ),
    ],
    createdAt: now,
    updatedAt: now,
  };
}

// ── Shared Tela Native Style Helpers (Matches TelaView.tsx & TelaImage.tsx) ──
const panelLbl = 'text-[.6rem] font-extrabold uppercase tracking-[.14em] text-white/40';
const telaInputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.14)',
};
const telaSelectStyle: React.CSSProperties = {
  background: '#17131d',
  border: '1px solid rgba(255,255,255,0.14)',
};

/**
 * @param extraDocWords words in the surrounding Tela document (added to read-time stats)
 * @param active whether comic mode is showing; the project store and showcase catalog
 *   load the first time it is, so Tela pays nothing for comic mode until it's opened.
 */
export function useTelaComicVariant2Controller(extraDocWords = 0, active = true): TelaComicVariant2Controller {
  const [project, setProject] = useState<ComicProject>(() => blankComicProject());
  const pages = project.pages;
  const selectedShowcaseBookId = project.source?.showcaseId ?? '';
  // Edits mark the project dirty; opening a project doesn't, so it isn't re-saved unchanged.
  const dirtyRef = useRef(false);
  const setPages = useCallback((next: React.SetStateAction<ComicPageDocument[]>) => {
    dirtyRef.current = true;
    setProject((prev) => ({
      ...prev,
      pages: typeof next === 'function' ? (next as (p: ComicPageDocument[]) => ComicPageDocument[])(prev.pages) : next,
    }));
  }, []);

  const [saveState, setSaveState] = useState<TelaComicVariant2Controller['saveState']>('idle');
  const [projectError, setProjectError] = useState<string | null>(null);
  const [savedProjects, setSavedProjects] = useState<ComicProjectSummary[]>([]);
  const [showcaseCatalog, setShowcaseCatalog] = useState<ShowcaseCatalogEntry[]>([]);
  const [readMode, setReadMode] = useState(false);
  const [loopsEnabled, setLoopsEnabled] = useState(true);

  const [activePageId, setActivePageId] = useState<string>(() => pages[0]?.id || '');
  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId) || pages[0],
    [pages, activePageId]
  );

  const [activePanelId, setActivePanelId] = useState<string>(
    () => pages[0]?.panels[1]?.id || pages[0]?.panels[0]?.id || ''
  );
  const activePanel = useMemo(
    () =>
      activePage?.panels.find((p) => p.id === activePanelId) ||
      activePage?.panels[0],
    [activePage, activePanelId]
  );

  const [activeLayerId, setActiveLayerId] = useState<string>(
    () => pages[0]?.panels[0]?.nestedDocument.layers[0]?.id || ''
  );

  useEffect(() => {
    if (activePanel && !activePanel.nestedDocument.layers.some((l) => l.id === activeLayerId)) {
      const defaultLayer = activePanel.nestedDocument.layers[0];
      if (defaultLayer) setActiveLayerId(defaultLayer.id);
    }
  }, [activePanel, activeLayerId]);

  const [activeTool, setActiveToolState] = useState<ComicActiveToolId>('select');
  const [inspectorSection, setInspectorSection] = useState<'layout' | 'ink' | 'balloon' | 'motion'>('layout');
  const [deepFocusPanelId, setDeepFocusPanelId] = useState<string | null>(null);
  const [timelineExpanded, setTimelineExpanded] = useState<boolean>(false);
  const [timelineSyncMode, setTimelineSyncMode] = useState<TimelineSyncMode>('inview');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [showOnCanvasLayersCard, setShowOnCanvasLayersCard] = useState<boolean>(true);
  const [panelImageUrlDraft, setPanelImageUrlDraft] = useState<string>('');

  const [gpenColor, setGpenColor] = useState<string>('#ffffff');
  const [gpenSize, setGpenSize] = useState<number>(4);
  const [gpenStreamline, setGpenStreamline] = useState<number>(82);

  const [balloonDraftText, setBalloonDraftText] = useState<string>('');
  const [balloonDraftSpeaker, setBalloonDraftSpeaker] = useState<string>('');
  const [balloonDraftStyle, setBalloonDraftStyle] = useState<SpeechBalloonItem['style']>('SPEECH');
  const [balloonDraftDock, setBalloonDraftDock] = useState<BalloonSafeDockZone>('bottom-gutter-flush');

  const setActiveTool = useCallback((tool: ComicActiveToolId) => {
    setActiveToolState(tool);
    if (tool === 'select' || tool === 'knife') setInspectorSection('layout');
    else if (tool === 'gpen' || tool === 'screentone') setInspectorSection('ink');
    else if (tool === 'balloon' || tool === 'sfx') setInspectorSection('balloon');
    else if (tool === 'motion') {
      setInspectorSection('motion');
      setTimelineExpanded(true);
    }
  }, []);

  const panelDurationSec = activePanel?.nestedDocument.timelineDurationSec || 5;

  useEffect(() => {
    if (!isPlaying) return;
    let last = performance.now();
    let rafId = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCurrentTimeSec((prev) => {
        const next = prev + dt;
        return next >= panelDurationSec ? 0 : next;
      });
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, panelDurationSec]);

  // ── Project lifecycle ─────────────────────────────────────────────────────

  const refreshSavedProjects = useCallback(async () => {
    try {
      setSavedProjects(await listComicProjects());
    } catch {
      setSavedProjects([]);
    }
  }, []);

  const openProject = useCallback((next: ComicProject, markDirty = false) => {
    dirtyRef.current = markDirty;
    setProject(next);
    setProjectError(null);
    setActivePageId(next.pages[0]?.id || '');
    setActivePanelId(next.pages[0]?.panels[0]?.id || '');
    setDeepFocusPanelId(null);
    setCurrentTimeSec(0);
    setIsPlaying(false);
    setSaveState(markDirty ? 'idle' : 'saved');
    setLastComicProjectId(next.id);
  }, []);

  const openSavedProject = useCallback(
    async (id: string) => {
      const p = await loadComicProject(id);
      if (p) openProject(p);
      else setProjectError('That project is no longer saved on this device.');
    },
    [openProject]
  );

  /** Opens a showcase book; reopens the author's saved copy if they've already edited it. */
  const openShowcase = useCallback(
    async (showcaseId: string) => {
      try {
        const saved = await loadComicProject(showcaseProjectId(showcaseId));
        openProject(saved ?? (await openShowcaseAsProject(showcaseId)), !saved);
      } catch (err) {
        setProjectError(err instanceof Error ? err.message : 'Could not open that book.');
      }
    },
    [openProject]
  );

  const resetProjectToSource = useCallback(async () => {
    const showcaseId = project.source?.showcaseId;
    if (!showcaseId) return;
    try {
      openProject(await openShowcaseAsProject(showcaseId), true);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Could not reload the source book.');
    }
  }, [project.source?.showcaseId, openProject]);

  const newProject = useCallback(
    (format: ComicProjectFormat = 'comic') => openProject(blankComicProject(format), true),
    [openProject]
  );

  const renameProject = useCallback((title: string) => {
    dirtyRef.current = true;
    setProject((prev) => ({ ...prev, title }));
  }, []);

  const exportProjectFile = useCallback(() => downloadComicProject(project), [project]);

  const exportShowcaseJson = useCallback(() => {
    const book = comicProjectToShowcaseBook(project);
    const blob = new Blob([JSON.stringify(book, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book.id || 'comic'}.showcase.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [project]);

  const importProjectFile = useCallback(
    async (file: File) => {
      try {
        openProject(await readComicProjectFile(file), true);
      } catch (err) {
        setProjectError(err instanceof Error ? err.message : 'Could not read that file.');
      }
    },
    [openProject]
  );

  const deleteSavedProject = useCallback(
    async (id: string) => {
      await deleteComicProject(id);
      await refreshSavedProjects();
    },
    [refreshSavedProjects]
  );

  // First time comic mode shows: reopen the last project and load the pickers.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (!active || bootedRef.current) return;
    bootedRef.current = true;
    void refreshSavedProjects();
    void listShowcaseCatalog().then(setShowcaseCatalog, () => setShowcaseCatalog([]));
    // An edit parked at the last page close wins over the saved copy if it's newer.
    const pending = takePendingComicProject();
    const lastId = pending?.id ?? getLastComicProjectId();
    if (lastId)
      void loadComicProject(lastId).then((saved) => {
        if (pending && (!saved || pending.updatedAt >= saved.updatedAt)) openProject(pending, true);
        else if (saved) openProject(saved);
      });
  }, [active, openProject, refreshSavedProjects]);

  // Autosave edits (debounced) to this device.
  useEffect(() => {
    if (!dirtyRef.current) return;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      dirtyRef.current = false;
      saveComicProject(project)
        .then(() => {
          setSaveState('saved');
          return refreshSavedProjects();
        })
        .catch(() => setSaveState('error'));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [project, refreshSavedProjects]);

  // Don't lose the last edit inside the debounce window when the tab hides or closes.
  const projectRef = useRef(project);
  projectRef.current = project;
  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      stashPendingComicProject(projectRef.current);
      void saveComicProject(projectRef.current).catch(() => {
        dirtyRef.current = true;
      });
    };
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, []);

  const restoreProjectJson = useCallback(
    (json: string) => {
      try {
        const p = JSON.parse(json) as ComicProject;
        if (p?.schema !== 'plajah.comicProject') throw new Error('Not a comic project version.');
        openProject({ ...p, id: project.id }, true);
      } catch (err) {
        setProjectError(err instanceof Error ? err.message : 'Could not restore that version.');
      }
    },
    [openProject, project.id]
  );

  const loadShowcaseBook = useCallback((bookId: string) => void openShowcase(bookId), [openShowcase]);

  const updateActivePage = useCallback(
    (updater: (page: ComicPageDocument) => ComicPageDocument) => {
      setPages((prev) =>
        prev.map((page) => (page.id === activePage.id ? updater(page) : page))
      );
    },
    [activePage?.id]
  );

  const updateActivePanel = useCallback(
    (updater: (panel: ComicPanelNode) => ComicPanelNode) => {
      updateActivePage((page) => ({
        ...page,
        panels: page.panels.map((p) => (p.id === activePanel?.id ? updater(p) : p)),
      }));
    },
    [updateActivePage, activePanel?.id]
  );

  const updateActiveNestedDoc = useCallback(
    (updater: (doc: NestedPanelTelaDocument) => NestedPanelTelaDocument) => {
      updateActivePanel((panel) => ({
        ...panel,
        nestedDocument: updater(panel.nestedDocument),
      }));
    },
    [updateActivePanel]
  );

  const applyPanelImageUrlDraft = useCallback(() => {
    const trimmed = panelImageUrlDraft.trim();
    if (!trimmed) return;
    updateActivePanel((p) => ({ ...p, renderedImageUrl: trimmed }));
    setPanelImageUrlDraft('');
  }, [panelImageUrlDraft, updateActivePanel]);

  const updatePanelById = useCallback(
    (pageId: string, panelId: string, updater: (panel: ComicPanelNode) => ComicPanelNode) => {
      setPages((prev) =>
        prev.map((page) =>
          page.id !== pageId
            ? page
            : { ...page, panels: page.panels.map((p) => (p.id === panelId ? updater(p) : p)) }
        )
      );
    },
    [setPages]
  );

  /** Re-packs the active page's panels into 12-column rows from their flex + geometry. */
  const relayoutActivePage = useCallback(() => {
    updateActivePage((page) => {
      const { panels, aspect } = relayoutPanels(page.panels);
      return { ...page, presetId: 'flex-rows', panels, aspect };
    });
  }, [updateActivePage]);

  const applyPageGridPreset = useCallback(
    (presetId: PanelLayoutPresetId) => {
      if (presetId === 'custom') return;
      if (presetId === 'flex-rows') {
        relayoutActivePage();
        return;
      }
      const pageNum = pages.findIndex((p) => p.id === activePage?.id) + 1;
      const fresh = createComicPageFromPreset(presetId, pageNum || 1, activePage?.title);
      // Keep each existing panel's art, lettering and motion; only its frame moves.
      updateActivePage((oldPage) => ({
        ...oldPage,
        presetId,
        aspect: undefined,
        panels: fresh.panels.map((fp, i) =>
          oldPage.panels[i] ? { ...oldPage.panels[i], order: i + 1, box: fp.box } : fp
        ),
      }));
    },
    [pages, activePage?.id, activePage?.title, updateActivePage, relayoutActivePage]
  );

  const addNewComicPage = useCallback(
    (presetId: PanelLayoutPresetId = 'action-4-grid') => {
      const nextIndex = pages.length + 1;
      const newPage = createComicPageFromPreset(presetId, nextIndex);
      setPages((prev) => [...prev, newPage]);
      setActivePageId(newPage.id);
      if (newPage.panels[0]) {
        setActivePanelId(newPage.panels[0].id);
      }
    },
    [pages.length]
  );

  const deleteComicPage = useCallback(
    (pageId: string) => {
      if (pages.length <= 1) return;
      setPages((prev) => {
        const filtered = prev.filter((p) => p.id !== pageId);
        if (activePageId === pageId && filtered[0]) {
          setActivePageId(filtered[0].id);
          if (filtered[0].panels[0]) setActivePanelId(filtered[0].panels[0].id);
        }
        return filtered;
      });
    },
    [pages.length, activePageId]
  );

  const splitActivePanel = useCallback(
    (direction: 'horizontal' | 'vertical' | 'diagonal', slantDeg = 12) => {
      if (!activePage || !activePanel) return;
      const idx = activePage.panels.findIndex((p) => p.id === activePanel.id);
      if (idx < 0) return;
      const target = activePage.panels[idx];
      if (direction === 'vertical' && target.box.widthPct >= 18) {
        const halfW = Number((target.box.widthPct / 2).toFixed(2));
        const leftPanel: ComicPanelNode = {
          ...target,
          box: { ...target.box, widthPct: halfW },
        };
        const rightPanel: ComicPanelNode = {
          ...target,
          id: `panel_split_v_${Date.now()}`,
          order: target.order + 1,
          box: {
            ...target.box,
            xPct: Number((target.box.xPct + halfW).toFixed(2)),
            widthPct: halfW,
          },
          nestedDocument: {
            ...target.nestedDocument,
            id: `nested_v_${Date.now()}`,
            balloons: [],
          },
        };
        const next = [...activePage.panels];
        next.splice(idx, 1, leftPanel, rightPanel);
        updateActivePage((pg) => ({
          ...pg,
          presetId: 'custom',
          panels: next.map((p, i) => ({ ...p, order: i + 1 })),
        }));
      } else if (target.box.heightPct >= 16) {
        const halfH = Number((target.box.heightPct / 2).toFixed(2));
        const slantOffset = direction === 'diagonal' ? Math.min(8, Math.abs(slantDeg) * 0.4) : 0;
        const topPanel: ComicPanelNode = {
          ...target,
          box: {
            ...target.box,
            heightPct: halfH,
            clipPolygon:
              slantOffset > 0
                ? [
                    { xPct: 0, yPct: 0 },
                    { xPct: 100, yPct: 0 },
                    { xPct: 100, yPct: 100 - slantOffset },
                    { xPct: 0, yPct: 100 },
                  ]
                : undefined,
          },
        };
        const bottomPanel: ComicPanelNode = {
          ...target,
          id: `panel_split_h_${Date.now()}`,
          order: target.order + 1,
          box: {
            ...target.box,
            yPct: Number((target.box.yPct + halfH).toFixed(2)),
            heightPct: halfH,
            clipPolygon:
              slantOffset > 0
                ? [
                    { xPct: 0, yPct: slantOffset },
                    { xPct: 100, yPct: 0 },
                    { xPct: 100, yPct: 100 },
                    { xPct: 0, yPct: 100 },
                  ]
                : undefined,
          },
          nestedDocument: {
            ...target.nestedDocument,
            id: `nested_h_${Date.now()}`,
            balloons: [],
          },
        };
        const next = [...activePage.panels];
        next.splice(idx, 1, topPanel, bottomPanel);
        updateActivePage((pg) => ({
          ...pg,
          presetId: 'custom',
          panels: next.map((p, i) => ({ ...p, order: i + 1 })),
        }));
      }
    },
    [activePage, activePanel, updateActivePage]
  );

  // Enforces the 5 Non-Negotiable Comic Balloon Safe-Zone Rules
  const addSafeSpeechBalloon = useCallback(
    (customText?: string, customDock?: BalloonSafeDockZone) => {
      if (!activePanel) return;
      const textToUse = (customText ?? balloonDraftText).trim() || 'New line';
      const preferredZone = customDock ?? balloonDraftDock;
      const existingCount = activePanel.nestedDocument.balloons.length;
      const isCloseUp =
        activePanel.cameraShot === 'CLOSE_UP' ||
        activePanel.cameraShot === 'EXTREME_CLOSE_UP';

      const baseSafe = computeSafeBalloonPlacement(
        isCloseUp ? 'close_up' : 'medium',
        existingCount,
        []
      );

      // Map dockZone to strict perimeter / gutter coordinates outside Face (26-74%, 12-56%) & Action Corridor (22-78%, 18-78%)
      let xPct = baseSafe.xPct;
      let yPct = baseSafe.yPct;
      let widthPct = Math.min(44, baseSafe.widthPct);

      if (isCloseUp) {
        // Rule 4: Close-Up Chin / Gutter Rail Docking (y >= 72% or y <= 4%, width <= 44%)
        yPct = preferredZone.startsWith('top') ? 3 : 74;
        xPct = preferredZone.endsWith('right') ? 52 : 4;
      } else {
        if (preferredZone === 'top-left') {
          xPct = 4;
          yPct = 4;
        } else if (preferredZone === 'top-gutter-flush') {
          xPct = 28;
          yPct = 2;
        } else if (preferredZone === 'top-right') {
          xPct = 52;
          yPct = 4;
        } else if (preferredZone === 'bottom-left') {
          xPct = 4;
          yPct = 76;
        } else if (preferredZone === 'bottom-gutter-flush') {
          xPct = 28;
          yPct = 78;
        } else if (preferredZone === 'bottom-right') {
          xPct = 52;
          yPct = 76;
        }
      }

      const newBalloon: SpeechBalloonItem = {
        id: `balloon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        speaker: balloonDraftSpeaker,
        text: textToUse,
        style: balloonDraftStyle,
        dockZone: preferredZone,
        xPct,
        yPct,
        widthPct,
        tailTargetXPct: 48,
        tailTargetYPct: 44,
      };

      updateActiveNestedDoc((doc) => ({
        ...doc,
        balloons: [...doc.balloons, newBalloon],
      }));
    },
    [activePanel, balloonDraftText, balloonDraftDock, balloonDraftSpeaker, balloonDraftStyle, updateActiveNestedDoc]
  );

  const deleteSpeechBalloon = useCallback(
    (balloonId: string) => {
      updateActiveNestedDoc((doc) => ({
        ...doc,
        balloons: doc.balloons.filter((b) => b.id !== balloonId),
      }));
    },
    [updateActiveNestedDoc]
  );

  const addKanjiSfxStamp = useCallback(
    (presetIndex = 0) => {
      const preset = KANJI_SFX_PRESET_LIBRARY[presetIndex % KANJI_SFX_PRESET_LIBRARY.length];
      if (!preset) return;
      const newSfx: KanjiSfxItem = {
        id: `sfx_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kanji: preset.kanji,
        romaji: preset.romaji,
        meaning: preset.meaning,
        xPct: 76,
        yPct: 18,
        scale: 1.15,
        rotationDeg: -10,
        colorHex: preset.colorHex,
        strokeHex: preset.strokeHex,
      };
      updateActiveNestedDoc((doc) => ({
        ...doc,
        sfxItems: [...doc.sfxItems, newSfx],
      }));
    },
    [updateActiveNestedDoc]
  );

  const setPanelScreentone = useCallback(
    (config: Partial<HalftoneLayerConfig>) => {
      updateActiveNestedDoc((doc) => ({
        ...doc,
        halftone: {
          ...doc.halftone,
          ...config,
        },
      }));
    },
    [updateActiveNestedDoc]
  );

  const setPanelCinemagraph = useCallback(
    (presetId: CinemagraphEffectType) => {
      updateActiveNestedDoc((doc) => ({
        ...doc,
        cinemagraphPreset: presetId,
      }));
    },
    [updateActiveNestedDoc]
  );

  const applyMotionPresetToActiveLayer = useCallback(
    (presetId: string) => {
      if (!activePanel) return;
      const preset = LAYER_ANIMATION_PRESETS.find((p) => p.id === presetId) || LAYER_ANIMATION_PRESETS[0];
      if (!preset) return;
      const targetLayerId = activeLayerId || activePanel.nestedDocument.layers[0]?.id;
      if (!targetLayerId) return;

      const mappedKfs: PanelKeyframeItem[] = preset.keyframes.map((kf, idx) => ({
        id: `kf_${Date.now()}_${idx}`,
        timeSec: kf.timeSec,
        scale: kf.properties.scale ?? 1,
        x: kf.properties.x ?? 0,
        y: kf.properties.y ?? 0,
        rotation: kf.properties.rotation ?? 0,
        opacity: kf.properties.opacity ?? 1,
      }));

      updateActiveNestedDoc((doc) => ({
        ...doc,
        layers: doc.layers.map((layer) =>
          layer.id === targetLayerId ? { ...layer, keyframes: mappedKfs } : layer
        ),
      }));
      setIsPlaying(true);
    },
    [activePanel, activeLayerId, updateActiveNestedDoc]
  );

  const triggerPanelVoiceSynth = useCallback(() => {
    if (!activePanel) return;
    const text =
      activePanel.nestedDocument.balloons.map((b) => b.text).join('. ') ||
      activePanel.narrativeCaption ||
      activePanel.prompt;
    void synthesizePanelVoiceTake({
      text,
      speakerName: activePanel.nestedDocument.balloons[0]?.speaker || 'Narrator',
      emotion: 'urgent',
    });
  }, [activePanel]);

  const handlePanelInViewChange = useCallback(
    (pageId: string, panelId: string) => {
      if (timelineSyncMode !== 'inview') return;
      setActivePageId(pageId);
      setActivePanelId(panelId);
    },
    [timelineSyncMode]
  );

  const telemetry = useMemo(() => {
    const pageCount = pages.length;
    const activePageIndex = Math.max(1, pages.findIndex((p) => p.id === activePage?.id) + 1);
    let totalPanels = 0;
    let totalBalloons = 0;
    let comicWords = 0;

    for (const pg of pages) {
      totalPanels += pg.panels.length;
      for (const pnl of pg.panels) {
        if (pnl.narrativeCaption) {
          comicWords += pnl.narrativeCaption.trim().split(/\s+/).filter(Boolean).length;
        }
        for (const b of pnl.nestedDocument.balloons) {
          totalBalloons += 1;
          comicWords += b.text.trim().split(/\s+/).filter(Boolean).length;
        }
      }
    }

    const totalWords = comicWords + extraDocWords;
    const totalSeconds = Math.max(15, Math.round((totalWords / 180) * 60 + totalPanels * 4.5));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const estimatedReadTimeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    return {
      pageCount,
      activePageIndex,
      totalPanels,
      totalWords,
      totalBalloons,
      estimatedReadTimeStr,
    };
  }, [pages, activePage?.id, extraDocWords]);

  return {
    pages,
    activePageId,
    activePage,
    activePanelId,
    activePanel,
    activeLayerId,
    activeTool,
    inspectorSection,
    deepFocusPanelId,
    timelineExpanded,
    timelineSyncMode,
    isPlaying,
    currentTimeSec,
    selectedShowcaseBookId,
    gpenColor,
    gpenSize,
    gpenStreamline,
    balloonDraftText,
    balloonDraftSpeaker,
    balloonDraftStyle,
    balloonDraftDock,
    showOnCanvasLayersCard,
    panelImageUrlDraft,
    setActivePageId,
    setActivePanelId,
    setActiveLayerId,
    setActiveTool,
    setInspectorSection,
    setDeepFocusPanelId,
    setTimelineExpanded,
    setTimelineSyncMode,
    setIsPlaying,
    setCurrentTimeSec,
    setGpenColor,
    setGpenSize,
    setGpenStreamline,
    setBalloonDraftText,
    setBalloonDraftSpeaker,
    setBalloonDraftStyle,
    setBalloonDraftDock,
    setShowOnCanvasLayersCard,
    setPanelImageUrlDraft,
    applyPanelImageUrlDraft,
    loadShowcaseBook,
    applyPageGridPreset,
    addNewComicPage,
    deleteComicPage,
    splitActivePanel,
    updateActivePanel,
    updateActiveNestedDoc,
    addSafeSpeechBalloon,
    deleteSpeechBalloon,
    addKanjiSfxStamp,
    setPanelScreentone,
    setPanelCinemagraph,
    applyMotionPresetToActiveLayer,
    triggerPanelVoiceSynth,
    handlePanelInViewChange,
    telemetry,
    project,
    saveState,
    projectError,
    savedProjects,
    showcaseCatalog,
    openShowcase,
    openSavedProject,
    newProject,
    resetProjectToSource,
    renameProject,
    exportProjectFile,
    importProjectFile,
    exportShowcaseJson,
    deleteSavedProject,
    restoreProjectJson,
    readMode,
    setReadMode,
    loopsEnabled,
    setLoopsEnabled,
    updateActivePage,
    updatePanelById,
    relayoutActivePage,
  };
}

// ============================================================================
// 1. LEFT RAIL COMIC TOOLS (items for the Comics section of TelaToolRail)
// ============================================================================
export const comicRailItems = (
  ctrl: TelaComicVariant2Controller,
  comicModeActive: boolean,
  onEnableComicMode: () => void,
): TelaRailItem[] => {
  const tools: { id: ComicActiveToolId; icon: React.ReactNode; label: string; desc: string }[] = [
    { id: 'select', icon: <LayoutGrid size={16} />, label: 'Panels', desc: 'Select comic panels and arrange the page grid.' },
    { id: 'knife', icon: <Scissors size={16} />, label: 'Split panel', desc: 'Cut a panel in two along a gutter.' },
    { id: 'gpen', icon: <PenTool size={16} />, label: 'Inking pen', desc: 'Ink with manga G-pen and Maru-pen strokes.' },
    { id: 'balloon', icon: <MessageSquarePlus size={16} />, label: 'Speech balloon', desc: 'Add a speech balloon with a tail that stays inside the safe zone.' },
    { id: 'sfx', icon: <Zap size={16} />, label: 'Sound effects', desc: 'Stamp kanji and action sound-effect lettering.' },
    { id: 'screentone', icon: <Grid3X3 size={16} />, label: 'Screentone', desc: 'Shade with a 60 LPI manga screentone.' },
    { id: 'motion', icon: <Film size={16} />, label: 'Panel motion', desc: 'Open the timeline to animate a panel or make a cinemagraph.' },
  ];
  return tools.map((t) => ({
    ...t,
    active: comicModeActive && (ctrl.activeTool === t.id || (t.id === 'motion' && ctrl.timelineExpanded)),
    onClick: () => {
      if (!comicModeActive) onEnableComicMode();
      if (t.id === 'motion') {
        ctrl.setTimelineExpanded((v) => !v);
      }
      ctrl.setActiveTool(t.id);
    },
  }));
};

// ============================================================================
// 2. CONTINUOUS TELA PAGE STREAM CANVAS WITH COMIC PANELS & FLOATING TELA CHROME
// ============================================================================
export const TelaComicPageStreamCanvas: React.FC<{
  ctrl: TelaComicVariant2Controller;
  zoom: number;
}> = ({ ctrl, zoom }) => {
  const focusedPanel = useMemo(() => {
    if (!ctrl.deepFocusPanelId) return null;
    for (const pg of ctrl.pages) {
      const found = pg.panels.find((p) => p.id === ctrl.deepFocusPanelId);
      if (found) return { page: pg, panel: found };
    }
    return null;
  }, [ctrl.deepFocusPanelId, ctrl.pages]);

  if (focusedPanel) {
    return (
      <div
        className="min-h-full flex flex-col items-center py-8 px-6"
        style={{
          paddingBottom: ctrl.timelineExpanded ? 260 : 76,
          background:
            'radial-gradient(1000px 500px at 50% 0%, rgba(107,0,153,0.12), transparent 60%), #0e0b14',
        }}
      >
        {/* Nested Smart-Object Breadcrumb Strip (Matches Tela Page Header Strip) */}
        <div
          className="flex items-center justify-between mb-2.5 select-none"
          style={{ width: Math.round(920 * zoom) }}
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold">
            <button
              onClick={() => ctrl.setDeepFocusPanelId(null)}
              className="px-2.5 py-1 rounded-[7px] text-white flex items-center gap-1.5 font-bold transition-all"
              style={{
                background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))',
                boxShadow: 'var(--pj-glow-brand, 0 6px 22px rgba(212,0,85,.34))',
              }}
            >
              <ChevronLeft size={13} /> Back to {focusedPanel.page.title}
            </button>
            <span className="text-white/30">/</span>
            <span className="w-5 h-5 rounded-full text-[10px] font-bold grid place-items-center bg-[var(--pj-magenta,#D40055)] text-white">
              P{focusedPanel.panel.order}
            </span>
            <span className="text-white font-bold">
              Nested Smart-Object Tela Page ({focusedPanel.panel.cameraShot.replace(/_/g, ' ')})
            </span>
            <span className="text-white/40 text-[10px]">
              ({focusedPanel.panel.nestedDocument.layers.length} Layers · {focusedPanel.panel.nestedDocument.timelineDurationSec}s Timeline)
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <button
              onClick={() => ctrl.addSafeSpeechBalloon()}
              className="px-2.5 py-1 rounded-[7px] bg-[var(--pj-magenta,#D40055)]/20 hover:bg-[var(--pj-magenta,#D40055)]/35 text-white/90 hover:text-white transition-colors flex items-center gap-1 font-semibold border border-[var(--pj-magenta,#D40055)]/30"
            >
              <MessageSquarePlus size={12} className="text-[#D0BCFF]" /> ＋ Safe Balloon
            </button>
            <button
              onClick={() => ctrl.addKanjiSfxStamp()}
              className="px-2.5 py-1 rounded-[7px] bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors flex items-center gap-1 font-semibold"
            >
              <Zap size={12} className="text-[#00DAF3]" /> ＋ SFX Stamp
            </button>
          </div>
        </div>

        {/* Full-Resolution Nested Panel Artboard */}
        <div
          style={{
            width: Math.round(920 * zoom),
            height: Math.round(640 * zoom),
            background: '#FFFFFF',
            borderRadius: 4,
            boxShadow:
              '0 0 0 2px var(--pj-magenta, #D40055), 0 20px 50px rgba(0,0,0,0.65)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <SingleComicPanelSurface
            page={focusedPanel.page}
            panel={focusedPanel.panel}
            ctrl={ctrl}
            isActive={true}
            isDeepFocus={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-full flex flex-col items-center py-10 px-6 gap-8"
      style={{
        paddingBottom: ctrl.timelineExpanded ? 250 : 76,
        background:
          'radial-gradient(1000px 500px at 50% 0%, rgba(107,0,153,0.12), transparent 60%), #0e0b14',
      }}
    >
      {ctrl.pages.map((page, pageIdx) => {
        const isPageActive = page.id === ctrl.activePage?.id;
        const pageW = Math.round(780 * zoom);
        const pageH = Math.round(pageW * (page.aspect ?? DEFAULT_PAGE_ASPECT));
        const readMode = ctrl.readMode;

        return (
          <div
            key={page.id}
            className="flex flex-col items-center"
            onPointerDownCapture={() => {
              if (ctrl.activePageId !== page.id) ctrl.setActivePageId(page.id);
            }}
          >
            {readMode && page.meta?.slugline && (
              <div className="mb-2 select-none text-[10px] font-bold tracking-[.18em] uppercase text-white/45" style={{ width: pageW }}>
                {page.meta.act ? `${page.meta.act} · ` : ''}{page.meta.slugline}
              </div>
            )}
            {/* Exact Tela Page Header Strip (Matches TelaView.tsx lines 3300-3340) */}
            {!readMode && (
            <div
              className="flex items-center justify-between mb-2 select-none"
              style={{ width: pageW }}
            >
              <div
                className="flex items-center gap-2 text-white/50 text-[11px] font-semibold cursor-pointer"
                onClick={() => ctrl.setActivePageId(page.id)}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[10px] font-bold grid place-items-center ${
                    isPageActive
                      ? 'bg-[var(--pj-magenta,#D40055)] text-white'
                      : 'bg-white/10 text-white/80'
                  }`}
                >
                  {pageIdx + 1}
                </span>
                <span className={isPageActive ? 'text-white font-bold' : 'text-white/80'}>
                  {page.title}
                </span>
                <span className="text-white/40 text-[10px]">
                  ({page.meta?.slugline ? `${page.meta.slugline} · ` : ''}{page.panels.length} Panels)
                </span>
              </div>

              <div className="flex items-center gap-2 text-[10px]">
                <select
                  value={page.presetId}
                  onChange={(e) => {
                    ctrl.setActivePageId(page.id);
                    ctrl.applyPageGridPreset(e.target.value as PanelLayoutPresetId);
                  }}
                  className="h-6 px-2 rounded-[7px] text-[10px] font-semibold text-white/80 outline-none"
                  style={telaSelectStyle}
                  title="Switch Comic Page Panel Grid Template"
                >
                  {PAGE_PRESET_OPTIONS(page).map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    ctrl.setActivePageId(page.id);
                    ctrl.addSafeSpeechBalloon();
                  }}
                  className="px-2.5 py-1 rounded-[7px] bg-[var(--pj-magenta,#D40055)]/20 hover:bg-[var(--pj-magenta,#D40055)]/35 text-white/90 hover:text-white transition-colors flex items-center gap-1 font-semibold border border-[var(--pj-magenta,#D40055)]/30"
                  title="Add Safe-Zone Speech Balloon to active panel"
                >
                  <Type size={12} className="text-[#D0BCFF]" /> ＋ Text / Balloon
                </button>

                <button
                  onClick={() => {
                    ctrl.setActivePageId(page.id);
                    ctrl.splitActivePanel('horizontal');
                  }}
                  className="px-2.5 py-1 rounded-[7px] bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors flex items-center gap-1 font-semibold"
                  title="Split active panel horizontally"
                >
                  <Shapes size={12} className="text-[#00DAF3]" /> ＋ Split Panel
                </button>

                <button
                  onClick={() => {
                    ctrl.setActivePageId(page.id);
                    const targetPanelId =
                      ctrl.activePageId === page.id
                        ? ctrl.activePanelId
                        : page.panels[0]?.id;
                    if (targetPanelId) ctrl.setDeepFocusPanelId(targetPanelId);
                  }}
                  className="px-2.5 py-1 rounded-[7px] bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors flex items-center gap-1 font-semibold"
                  title="Focus active panel as a nested Smart-Object Tela page"
                >
                  <PenLine size={12} className="text-[#00DAF3]" /> Studio Focus
                </button>

                {ctrl.pages.length > 1 && (
                  <button
                    onClick={() => ctrl.deleteComicPage(page.id)}
                    className="p-1 rounded-[7px] hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                    title="Delete page"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
            )}

            {/* Exact Tela Page Surface (Matches TelaView.tsx lines 3343-3357 & TelaImage.tsx lines 849-1033) */}
            <div
              onClick={() => ctrl.setActivePageId(page.id)}
              style={{
                width: pageW,
                height: pageH,
                background: page.paperColorHex || '#FFFFFF',
                borderRadius: 4,
                boxShadow: isPageActive && !readMode
                  ? '0 0 0 2px var(--pj-magenta, #D40055), 0 20px 50px rgba(0,0,0,0.65)'
                  : '0 10px 30px rgba(0,0,0,0.45)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* On-Page Top-Left Floating Tool Pill (Exact match to TelaImage.tsx line 850 in user's screenshot!) */}
              {isPageActive && !readMode && (
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    zIndex: 45,
                    display: 'flex',
                    gap: 2,
                    padding: 3,
                    background: 'rgba(18,13,28,0.92)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10,
                    backdropFilter: 'blur(6px)',
                    boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
                  }}
                >
                  <button
                    title="Select Panel / Layer (V)"
                    onClick={() => ctrl.setActiveTool('select')}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#fff',
                      background:
                        ctrl.activeTool === 'select'
                          ? 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))'
                          : 'transparent',
                    }}
                  >
                    <MousePointer2 size={14} />
                  </button>

                  <button
                    title="G-Pen Sketchbook Inker (B)"
                    onClick={() => ctrl.setActiveTool('gpen')}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      color: ctrl.activeTool === 'gpen' ? '#fff' : 'rgba(255,255,255,0.7)',
                      background:
                        ctrl.activeTool === 'gpen'
                          ? 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))'
                          : 'transparent',
                    }}
                  >
                    <PenTool size={14} />
                  </button>

                  <button
                    title="Add Safe-Zone Speech Balloon (T)"
                    onClick={() => {
                      ctrl.setActiveTool('balloon');
                      ctrl.addSafeSpeechBalloon();
                    }}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      color: ctrl.activeTool === 'balloon' ? '#00DAF3' : 'rgba(255,255,255,0.7)',
                      background:
                        ctrl.activeTool === 'balloon' ? 'rgba(0,218,243,0.18)' : 'transparent',
                    }}
                  >
                    <Type size={14} />
                  </button>

                  <button
                    title="Split Active Panel Horizontally"
                    onClick={() => ctrl.splitActivePanel('horizontal')}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      color: 'rgba(255,255,255,0.7)',
                      background: 'transparent',
                    }}
                  >
                    <Rows size={14} />
                  </button>

                  <button
                    title="Split Active Panel Vertically"
                    onClick={() => ctrl.splitActivePanel('vertical')}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      color: 'rgba(255,255,255,0.7)',
                      background: 'transparent',
                    }}
                  >
                    <Columns size={14} />
                  </button>

                  <button
                    title="Diagonal Action Slash Split (14°)"
                    onClick={() => ctrl.splitActivePanel('diagonal', 14)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      color: ctrl.activeTool === 'knife' ? '#00DAF3' : 'rgba(255,255,255,0.7)',
                      background:
                        ctrl.activeTool === 'knife' ? 'rgba(0,218,243,0.18)' : 'transparent',
                    }}
                  >
                    <Scissors size={14} />
                  </button>

                  <button
                    title="Stamp Kanji Action SFX"
                    onClick={() => {
                      ctrl.setActiveTool('sfx');
                      ctrl.addKanjiSfxStamp();
                    }}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      color: ctrl.activeTool === 'sfx' ? '#00DAF3' : 'rgba(255,255,255,0.7)',
                      background:
                        ctrl.activeTool === 'sfx' ? 'rgba(0,218,243,0.18)' : 'transparent',
                    }}
                  >
                    <Zap size={14} />
                  </button>

                  <button
                    title="Toggle 60 LPI Manga Screentone"
                    onClick={() => {
                      ctrl.setActiveTool('screentone');
                      ctrl.setPanelScreentone({
                        enabled: !ctrl.activePanel?.nestedDocument.halftone.enabled,
                      });
                    }}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      color: ctrl.activePanel?.nestedDocument.halftone.enabled
                        ? '#00DAF3'
                        : 'rgba(255,255,255,0.7)',
                      background: ctrl.activePanel?.nestedDocument.halftone.enabled
                        ? 'rgba(0,218,243,0.18)'
                        : 'transparent',
                    }}
                  >
                    <Grid3X3 size={14} />
                  </button>

                  <div
                    style={{
                      width: 1,
                      height: 20,
                      background: 'rgba(255,255,255,0.12)',
                      margin: '5px 2px',
                    }}
                  />

                  <button
                    title="Open Active Panel in Deep Focus Smart-Object View"
                    onClick={() => ctrl.setDeepFocusPanelId(ctrl.activePanel.id)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#8ff5ff',
                      background: 'rgba(0,218,243,0.15)',
                    }}
                  >
                    <Maximize2 size={14} />
                  </button>

                  <button
                    title={
                      ctrl.showOnCanvasLayersCard
                        ? 'Hide On-Page Layers Card'
                        : 'Show On-Page Layers Card'
                    }
                    onClick={() => ctrl.setShowOnCanvasLayersCard((v) => !v)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      color: ctrl.showOnCanvasLayersCard ? '#00DAF3' : 'rgba(255,255,255,0.7)',
                      background: ctrl.showOnCanvasLayersCard
                        ? 'rgba(0,218,243,0.22)'
                        : 'transparent',
                    }}
                  >
                    <Layers size={14} />
                  </button>
                </div>
              )}

              {/* On-Page Top-Right Floating LAYERS Card (Exact match to TelaImage.tsx line 1013 in user's screenshot!) */}
              {isPageActive && !readMode && ctrl.showOnCanvasLayersCard && ctrl.activePanel && (
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    zIndex: 45,
                    width: 224,
                    maxHeight: 280,
                    overflowY: 'auto',
                    padding: 12,
                    background: 'rgba(18,13,28,0.95)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 12,
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                  }}
                  className="custom-scrollbar"
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: '.06em',
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.45)',
                      }}
                    >
                      LAYERS · P{ctrl.activePanel.order}
                    </span>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        color: 'var(--pj-cyan,#00DAF3)',
                      }}
                    >
                      {ctrl.activePanel.cameraShot.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {ctrl.activePanel.nestedDocument.layers.map((lyr) => {
                    const isSel = lyr.id === ctrl.activeLayerId;
                    return (
                      <div
                        key={lyr.id}
                        onClick={() => ctrl.setActiveLayerId(lyr.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '5px 6px',
                          marginBottom: 3,
                          borderRadius: 8,
                          cursor: 'pointer',
                          background: isSel ? 'rgba(255,255,255,0.09)' : 'transparent',
                          border: isSel
                            ? '1px solid rgba(212,0,85,0.55)'
                            : '1px solid transparent',
                        }}
                      >
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 5,
                            display: 'grid',
                            placeItems: 'center',
                            flex: 'none',
                            background: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#D0BCFF',
                          }}
                        >
                          {lyr.kind === 'SPEECH_BALLOONS' ? (
                            <Type size={11} className="text-[#FF8C00]" />
                          ) : lyr.kind === 'INK_DRAWING' ? (
                            <PenTool size={11} className="text-[#f472b6]" />
                          ) : (
                            <Layers size={11} className="text-[#00DAF3]" />
                          )}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 11.5,
                            color: lyr.visible ? '#fff' : 'rgba(255,255,255,0.4)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {lyr.name}
                        </span>
                        <button
                          title={lyr.visible ? 'Hide' : 'Show'}
                          onClick={(e) => {
                            e.stopPropagation();
                            ctrl.updateActiveNestedDoc((doc) => ({
                              ...doc,
                              layers: doc.layers.map((item) =>
                                item.id === lyr.id
                                  ? { ...item, visible: !item.visible }
                                  : item
                              ),
                            }));
                          }}
                          style={{
                            display: 'grid',
                            placeItems: 'center',
                            width: 20,
                            height: 20,
                            border: 'none',
                            background: 'transparent',
                            color: 'rgba(255,255,255,0.55)',
                            cursor: 'pointer',
                          }}
                        >
                          {lyr.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Comic Panels Grid inside the Page Surface (mounted only near the viewport) */}
              <LazyMount>
              {page.panels.map((panel) => {
                const isPanelActive =
                  isPageActive && panel.id === ctrl.activePanel?.id;
                const clipPoly =
                  panel.box.clipPolygon && panel.box.clipPolygon.length >= 3
                    ? `polygon(${panel.box.clipPolygon
                        .map((pt) => `${pt.xPct}% ${pt.yPct}%`)
                        .join(', ')})`
                    : undefined;

                const bleed = panel.geometry === 'open-bleed';
                return (
                  <div
                    key={panel.id}
                    style={{
                      position: 'absolute',
                      left: `${panel.box.xPct}%`,
                      top: `${panel.box.yPct}%`,
                      width: `${panel.box.widthPct}%`,
                      height: `${panel.box.heightPct}%`,
                      padding: bleed ? 0 : `${Math.max(3, page.gutterPx / 2)}px`,
                      boxSizing: 'border-box',
                      clipPath: clipPoly,
                      zIndex: panel.geometry === 'floating-inset' || panel.geometry === 'circle-reticle' ? 2 : 1,
                    }}
                  >
                    <SingleComicPanelSurface
                      page={page}
                      panel={panel}
                      ctrl={ctrl}
                      isActive={isPanelActive}
                      isDeepFocus={false}
                    />
                  </div>
                );
              })}
              </LazyMount>
            </div>
          </div>
        );
      })}

      {/* Exact Tela Bottom "+ Add Page" Strip (Matches TelaView.tsx lines 3388-3410) */}
      {!ctrl.readMode && (
      <div className="flex items-center gap-2.5 my-6 pb-16 flex-wrap justify-center">
        <button
          onClick={() => ctrl.addSafeSpeechBalloon()}
          className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[.75rem] font-bold text-white bg-[var(--pj-magenta,#D40055)]/20 border border-[var(--pj-magenta,#D40055)]/40 hover:bg-[var(--pj-magenta,#D40055)]/35 transition-all shadow-sm"
        >
          <Type size={14} className="text-[#D0BCFF]" /> ＋ Safe-Zone Speech Balloon
        </button>
        <button
          onClick={() => ctrl.addNewComicPage('action-4-grid')}
          className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[.75rem] font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all shadow-sm"
        >
          <LayoutGrid size={14} className="text-[#00DAF3]" /> ＋ Add 4-Panel Comic Page
        </button>
        <button
          onClick={() => ctrl.addNewComicPage('manga-5-dynamic')}
          className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[.75rem] font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all shadow-sm"
        >
          <Scissors size={14} className="text-[#FF8C00]" /> ＋ Add 5-Panel Manga Slash Page
        </button>
        <button
          onClick={() => ctrl.addNewComicPage('storybook-2-spread')}
          className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-[.75rem] font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all shadow-sm"
        >
          <BookOpen size={14} className="text-[#D0BCFF]" /> ＋ Add Storybook Twin Spread
        </button>
      </div>
      )}
      <ComicLivingStyles />
    </div>
  );
};

// ============================================================================
// LIVING GRAPHIC NOVEL RENDER HELPERS
// ============================================================================

const PAGE_PRESET_OPTIONS = (page: ComicPageDocument): { id: PanelLayoutPresetId; name: string }[] => [
  ...(page.panels.some((p) => p.flex != null) ? [{ id: 'flex-rows' as const, name: 'Graphic Novel Rows (flex)' }] : []),
  ...(page.presetId === 'custom' ? [{ id: 'custom' as const, name: 'Custom (hand-split)' }] : []),
  ...PANEL_LAYOUT_PRESETS,
];

/** Mounts its children only while the page is near the viewport (a 294-panel book stays light). */
const LazyMount: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), {
      rootMargin: '1400px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      {near ? children : null}
    </div>
  );
};

/** Plays [start, end] of the source film on loop while the panel is on screen. */
const PanelLoopVideo: React.FC<{ src: string; start: number; end: number; style: React.CSSProperties }> = ({
  src,
  start,
  end,
  style,
}) => {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);
  // Stays transparent until frames are actually playing, so the still shows meanwhile.
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const toStart = () => {
      if (Math.abs(v.currentTime - start) > 0.25) v.currentTime = start;
    };
    const onTime = () => {
      if (v.currentTime >= end || v.currentTime < start - 0.5) v.currentTime = start;
    };
    v.addEventListener('loadedmetadata', toStart);
    v.addEventListener('timeupdate', onTime);
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            ([e]) => {
              if (e?.isIntersecting) void v.play().catch(() => {});
              else v.pause();
            },
            { threshold: 0.2 }
          )
        : null;
    io?.observe(v);
    return () => {
      io?.disconnect();
      v.removeEventListener('loadedmetadata', toStart);
      v.removeEventListener('timeupdate', onTime);
    };
  }, [start, end]);
  if (failed) return null;
  return (
    <video
      ref={ref}
      src={`${src}#t=${start},${end}`}
      muted
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      onPlaying={() => setPlaying(true)}
      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      style={{ ...style, opacity: playing ? 1 : 0, transition: 'opacity .4s ease' }}
    />
  );
};

const ComicLivingStyles: React.FC = () => (
  <style>{`
@keyframes tcv2-shake { 0%,100% { translate: 0 0 } 20% { translate: -2px 1px } 40% { translate: 2px -1px } 60% { translate: -1px -2px } 80% { translate: 1px 2px } }
@keyframes tcv2-pulse { 0%,100% { scale: 1 } 50% { scale: 1.12 } }
@keyframes tcv2-glitch { 0%,100% { translate: 0 0; filter: none } 33% { translate: 2px 0; filter: hue-rotate(40deg) } 66% { translate: -2px 0; filter: hue-rotate(-40deg) } }
@keyframes tcv2-float { 0%,100% { translate: 0 0 } 50% { translate: 0 -4px } }
@keyframes tcv2-speedline { 0% { letter-spacing: .02em } 50% { letter-spacing: .12em } 100% { letter-spacing: .02em } }
.tcv2-sfx-shake { animation: tcv2-shake .35s linear infinite }
.tcv2-sfx-pulse { animation: tcv2-pulse 1.1s ease-in-out infinite }
.tcv2-sfx-glitch { animation: tcv2-glitch .6s steps(3) infinite }
.tcv2-sfx-float { animation: tcv2-float 2.4s ease-in-out infinite }
.tcv2-sfx-speedline { animation: tcv2-speedline .8s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) { [class^="tcv2-sfx-"] { animation: none } }
`}</style>
);

function itemMoved(item: { xPct: number; yPct: number }, src?: { xPct: number; yPct: number }) {
  return !src || Math.abs(item.xPct - src.xPct) > 0.01 || Math.abs(item.yPct - src.yPct) > 0.01;
}

/** Imported items keep their exact CSS position until the author moves them. */
function balloonPlacement(b: SpeechBalloonItem): React.CSSProperties {
  if (b.source && !itemMoved(b, b.sourceXY)) {
    const { top, bottom, left, right, maxWidth } = b.source;
    return { top, bottom, left, right, maxWidth };
  }
  return b.source
    ? { left: `${b.xPct}%`, top: `${b.yPct}%`, maxWidth: `${b.widthPct}%` }
    : { left: `${b.xPct}%`, top: `${b.yPct}%`, width: `${b.widthPct}%` };
}

const CAPTION_LOOK: Record<NonNullable<SpeechBalloonItem['captionKind']>, React.CSSProperties> = {
  'time-location': { background: '#fde68a', color: '#1c1917', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 800 },
  'internal-monologue': { background: 'rgba(10,10,14,0.92)', color: '#f8fafc', fontStyle: 'italic', border: '1px solid rgba(249,115,22,0.55)' },
  voiceover: { background: '#0f172a', color: '#e2e8f0', border: '1px solid rgba(148,163,184,0.5)' },
  'technical-hud': { background: 'rgba(3,7,18,0.75)', color: '#67e8f9', border: '1px solid #22d3ee' },
};

function balloonLook(b: SpeechBalloonItem, captionFont?: string): React.CSSProperties {
  switch (b.style) {
    case 'NARRATION_CAPTION':
      return {
        borderRadius: 3,
        fontFamily: captionFont,
        border: '1px solid rgba(0,0,0,0.6)',
        ...(CAPTION_LOOK[b.captionKind ?? 'internal-monologue'] ?? CAPTION_LOOK['internal-monologue']),
      };
    case 'THOUGHT':
      return { background: '#fff', color: '#120d1c', border: '1.5px dotted #120d1c', borderRadius: 999 };
    case 'SHOUT':
      return { background: '#fff', color: '#120d1c', border: '2.5px solid #120d1c', borderRadius: 6, fontWeight: 900, textTransform: 'uppercase' };
    case 'WHISPER':
      return { background: '#fff', color: '#334155', border: '1.5px dashed #475569', borderRadius: 14, fontStyle: 'italic' };
    case 'COMMS':
      return { background: '#06131a', color: '#a5f3fc', border: '1.5px solid #22d3ee', borderRadius: 4, fontFamily: 'ui-monospace, Menlo, monospace' };
    case 'MONSTER':
      return { background: '#fef2f2', color: '#450a0a', border: '2.5px solid #7f1d1d', borderRadius: 3, fontWeight: 900 };
    default:
      return { background: '#fff', color: '#120d1c', border: '1.5px solid #120d1c', borderRadius: 14 };
  }
}

/** Small CSS tail on the corner a showcase balloon points from. */
const BalloonTail: React.FC<{ dir: SpeechBalloonItem['tailDirection']; look: React.CSSProperties }> = ({ dir, look }) => {
  if (!dir || dir === 'none') return null;
  const up = dir.startsWith('top');
  const left = dir.endsWith('left');
  const border = (look.border as string) || '1.5px solid #120d1c';
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        width: 10,
        height: 10,
        background: look.background as string,
        [up ? 'top' : 'bottom']: -6,
        [left ? 'left' : 'right']: 14,
        transform: 'rotate(45deg)',
        ...(up ? { borderLeft: border, borderTop: border } : { borderRight: border, borderBottom: border }),
      }}
    />
  );
};

// ============================================================================
// SINGLE COMIC PANEL SURFACE (Nested Smart-Object Tela Page + Magnetic HUD)
// ============================================================================
const SingleComicPanelSurface: React.FC<{
  page: ComicPageDocument;
  panel: ComicPanelNode;
  ctrl: TelaComicVariant2Controller;
  isActive: boolean;
  isDeepFocus: boolean;
}> = ({ page, panel, ctrl, isActive, isDeepFocus }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const weatherCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const currentPtsRef = useRef<{ x: number; y: number }[]>([]);
  const reframeDragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const readMode = ctrl.readMode;
  const typography = ctrl.project.book?.visualGrammar.typography;

  useEffect(() => setImgFailed(false), [panel.renderedImageUrl]);

  // In-View Scroll Auto-Switch observer
  useEffect(() => {
    if (isDeepFocus || ctrl.timelineSyncMode !== 'inview') return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            ctrl.handlePanelInViewChange(page.id, panel.id);
          }
        }
      },
      { threshold: [0.65] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isDeepFocus, ctrl.timelineSyncMode, page.id, panel.id, ctrl.handlePanelInViewChange]);

  // Cinemagraph particle loop
  const cinemagraphPreset = panel.nestedDocument.cinemagraphPreset || 'none';
  useEffect(() => {
    const cvs = weatherCanvasRef.current;
    if (!cvs || cinemagraphPreset === 'none') return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const particles = createCinemagraphParticles(
      cinemagraphPreset,
      cvs.width,
      cvs.height,
      42
    );
    let raf = 0;
    let tick = 0;
    const renderLoop = () => {
      tick += 1;
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      renderCinemagraphFrame(
        ctx,
        cinemagraphPreset,
        particles,
        cvs.width,
        cvs.height,
        0.85,
        tick
      );
      raf = requestAnimationFrame(renderLoop);
    };
    raf = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(raf);
  }, [cinemagraphPreset]);

  // Layer motion evaluation at current playhead
  const layerAt = (kind: PanelSubLayer['kind']) => {
    const layer = panel.nestedDocument.layers.find((l) => l.kind === kind);
    const timeToEval = isActive ? ctrl.currentTimeSec : 0;
    return { layer, t: layer?.keyframes.length ? evaluateKeyframesAtTime(layer.keyframes, timeToEval) : null };
  };
  const bg = layerAt('BACKGROUND_PLATE');
  const lettering = layerAt('SPEECH_BALLOONS');
  const sfxLayer = layerAt('KANJI_SFX');
  const bgLayer = bg.layer;
  const bgTransform = bg.t ?? { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  const layerStyle = (t: typeof lettering.t): React.CSSProperties | undefined =>
    t ? { transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale}) rotate(${t.rotation}deg)`, opacity: t.opacity } : undefined;

  const reframe = panel.reframe ?? { panXPct: 0, panYPct: 0, zoom: 1 };
  const artTransform = `translate(${reframe.panXPct}%, ${reframe.panYPct}%) scale(${reframe.zoom}) translate(${bgTransform.x}px, ${bgTransform.y}px) scale(${bgTransform.scale}) rotate(${bgTransform.rotation}deg)`;
  const artSrc = imgFailed && panel.imageFallback ? panel.imageFallback : panel.renderedImageUrl;
  const loop = panel.video?.loop;
  const showLoop = !!(ctrl.loopsEnabled && loop?.enabled && panel.video?.sourceVideoUrl);

  /** Drags a balloon or SFX inside this panel (positions are % of the panel). */
  const startItemDrag = (
    e: React.PointerEvent<HTMLElement>,
    kind: 'balloon' | 'sfx',
    itemId: string,
    centered: boolean
  ) => {
    if (readMode || ctrl.activeTool !== 'select') return;
    const box = containerRef.current?.getBoundingClientRect();
    const el = e.currentTarget.getBoundingClientRect();
    if (!box) return;
    e.stopPropagation();
    ctrl.setActivePageId(page.id);
    ctrl.setActivePanelId(panel.id);
    const grabX = e.clientX - (centered ? el.left + el.width / 2 : el.left);
    const grabY = e.clientY - (centered ? el.top + el.height / 2 : el.top);
    const move = (ev: PointerEvent) => {
      const xPct = Math.round(((ev.clientX - grabX - box.left) / Math.max(1, box.width)) * 1000) / 10;
      const yPct = Math.round(((ev.clientY - grabY - box.top) / Math.max(1, box.height)) * 1000) / 10;
      ctrl.updatePanelById(page.id, panel.id, (p) => ({
        ...p,
        nestedDocument: {
          ...p.nestedDocument,
          balloons:
            kind === 'balloon'
              ? p.nestedDocument.balloons.map((b) => (b.id === itemId ? { ...b, xPct, yPct } : b))
              : p.nestedDocument.balloons,
          sfxItems:
            kind === 'sfx'
              ? p.nestedDocument.sfxItems.map((s) => (s.id === itemId ? { ...s, xPct, yPct } : s))
              : p.nestedDocument.sfxItems,
        },
      }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Freehand G-Pen Sketchbook pointer handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (readMode) return;
    ctrl.setActivePageId(page.id);
    ctrl.setActivePanelId(panel.id);

    if (ctrl.activeTool === 'reframe') {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      reframeDragRef.current = { x: e.clientX, y: e.clientY, panX: reframe.panXPct, panY: reframe.panYPct };
      return;
    }

    if (ctrl.activeTool === 'knife' && !isDeepFocus) {
      e.stopPropagation();
      ctrl.splitActivePanel(e.shiftKey ? 'vertical' : 'horizontal');
      return;
    }

    if (ctrl.activeTool === 'balloon') {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const relY = (e.clientY - rect.top) / Math.max(1, rect.height);
      const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
      const zone: BalloonSafeDockZone =
        relY < 0.5
          ? relX < 0.5
            ? 'top-left'
            : 'top-right'
          : relX < 0.5
          ? 'bottom-left'
          : 'bottom-right';
      ctrl.addSafeSpeechBalloon(undefined, zone);
      return;
    }

    if (ctrl.activeTool === 'sfx') {
      e.stopPropagation();
      ctrl.addKanjiSfxStamp();
      return;
    }

    if (ctrl.activeTool === 'gpen') {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      const rect = e.currentTarget.getBoundingClientRect();
      currentPtsRef.current = [
        {
          x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * 1000,
          y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * 1000,
        },
      ];
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = reframeDragRef.current;
    if (drag) {
      const rect = e.currentTarget.getBoundingClientRect();
      const panXPct = drag.panX + ((e.clientX - drag.x) / Math.max(1, rect.width)) * 100;
      const panYPct = drag.panY + ((e.clientY - drag.y) / Math.max(1, rect.height)) * 100;
      ctrl.updatePanelById(page.id, panel.id, (p) => ({
        ...p,
        reframe: { zoom: p.reframe?.zoom ?? 1, panXPct: Math.round(panXPct * 10) / 10, panYPct: Math.round(panYPct * 10) / 10 },
      }));
      return;
    }
    if (!isDrawingRef.current || ctrl.activeTool !== 'gpen') return;
    const rect = e.currentTarget.getBoundingClientRect();
    currentPtsRef.current.push({
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * 1000,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * 1000,
    });
  };

  const handlePointerUp = () => {
    reframeDragRef.current = null;
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const pts = currentPtsRef.current;
    if (pts.length < 2) return;
    const d = pts
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');
    const newStroke = {
      id: `stroke_${Date.now()}`,
      brushId: 'g-pen',
      colorHex: ctrl.gpenColor,
      sizePx: ctrl.gpenSize,
      opacity: 1,
      svgPath: d,
    };
    ctrl.updateActiveNestedDoc((doc) => ({
      ...doc,
      inkStrokes: [...doc.inkStrokes, newStroke],
    }));
    currentPtsRef.current = [];
  };

  const halftone = panel.nestedDocument.halftone;
  const subject = panel.subject?.enabled ? panel.subject : null;
  const showChrome = isActive && !readMode;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!isDeepFocus && !readMode) ctrl.setDeepFocusPanelId(panel.id);
      }}
      className="w-full h-full relative overflow-hidden select-none transition-shadow"
      style={{
        background: '#120e1a',
        border: showChrome
          ? '2.5px solid var(--pj-magenta, #D40055)'
          : panel.geometry === 'open-bleed'
          ? 'none'
          : panel.geometry === 'floating-inset'
          ? '3px solid #f8fafc'
          : '2px solid #09080d',
        boxShadow: showChrome
          ? '0 0 0 1px rgba(212,0,85,0.4), inset 0 0 18px rgba(212,0,85,0.16)'
          : panel.geometry === 'floating-inset'
          ? '0 10px 30px rgba(0,0,0,0.6)'
          : 'none',
        cursor: readMode
          ? 'default'
          : ctrl.activeTool === 'gpen'
          ? 'crosshair'
          : ctrl.activeTool === 'knife'
          ? 'col-resize'
          : ctrl.activeTool === 'reframe'
          ? 'grab'
          : 'pointer',
      }}
    >
      {/* 1. Art Plate (Hand Reframe pan/zoom × background keyframes) */}
      {artSrc && bgLayer?.visible !== false && (
        <img
          src={artSrc}
          alt={panel.artBrief || panel.prompt}
          draggable={false}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{
            transform: artTransform,
            opacity: bgTransform.opacity,
            transition: ctrl.isPlaying ? 'none' : 'transform 0.15s ease-out',
          }}
        />
      )}
      {!artSrc && !readMode && (
        <div className="absolute inset-0 grid place-items-center p-3 text-center text-[10px] text-white/35 pointer-events-none">
          {panel.artBrief || panel.prompt || 'Paste art or generate this panel'}
        </div>
      )}

      {/* 1b. Living loop of the source film over the still */}
      {showLoop && loop && (
        <PanelLoopVideo
          src={panel.video!.sourceVideoUrl!}
          start={loop.timeRange[0]}
          end={loop.timeRange[1]}
          style={{ transform: artTransform }}
        />
      )}

      {/* 1c. SAM subject lifted off the plate (2.5D) */}
      {subject && artSrc && bgLayer?.visible !== false && (
        <img
          src={artSrc}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{
            transform: `${artTransform} scale(1.035) translateY(-1%)`,
            clipPath: `inset(${Math.max(0, subject.box.y * 100)}% ${Math.max(0, (1 - subject.box.x - subject.box.w) * 100)}% ${Math.max(
              0,
              (1 - subject.box.y - subject.box.h) * 100
            )}% ${Math.max(0, subject.box.x * 100)}%)`,
            filter: `drop-shadow(0 ${Math.round(subject.breakoutPixels / 4)}px ${Math.round(subject.breakoutPixels / 2)}px rgba(0,0,0,0.7))`,
          }}
        />
      )}

      {/* 2. 60 LPI Manga Halftone Screentone Overlay */}
      {halftone?.enabled && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: halftone.opacity ?? 0.28,
            backgroundImage: `radial-gradient(${halftone.colorHex || '#000'} 1.35px, transparent 1.35px)`,
            backgroundSize: `${Math.max(4, Math.round(480 / (halftone.dotsPerInch || 60)))}px ${Math.max(
              4,
              Math.round(480 / (halftone.dotsPerInch || 60))
            )}px`,
            mixBlendMode: 'multiply',
          }}
        />
      )}

      {/* 3. Sketchbook G-Pen Vector Ink Strokes */}
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        {panel.nestedDocument.inkStrokes.map((st) => (
          <path
            key={st.id}
            d={st.svgPath}
            fill="none"
            stroke={st.colorHex}
            strokeWidth={st.sizePx * 2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={st.opacity}
          />
        ))}
      </svg>

      {/* 4. Cinemagraph Weather Particle Canvas */}
      {cinemagraphPreset !== 'none' && (
        <canvas
          ref={weatherCanvasRef}
          width={360}
          height={360}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      )}

      {/* 5. SFX: western kinetic onomatopoeia and kanji stamps */}
      {sfxLayer.layer?.visible !== false && (
        <div className="absolute inset-0 pointer-events-none" style={{ ...layerStyle(sfxLayer.t), zIndex: 16 }}>
          {panel.nestedDocument.sfxItems.map((sfx) => {
            const fromSource = !!sfx.source && !itemMoved(sfx, sfx.sourceXY);
            const western = !!sfx.fxStyle;
            return (
              <div
                key={sfx.id}
                onPointerDown={(e) => startItemDrag(e, 'sfx', sfx.id, !fromSource)}
                className="absolute select-none font-black"
                style={{
                  ...(fromSource
                    ? { top: sfx.source!.top, bottom: sfx.source!.bottom, left: sfx.source!.left, right: sfx.source!.right }
                    : { left: `${sfx.xPct}%`, top: `${sfx.yPct}%` }),
                  transform: `${fromSource ? '' : 'translate(-50%, -50%) '}scale(${sfx.scale}) rotate(${sfx.rotationDeg}deg)`,
                  color: sfx.colorHex,
                  WebkitTextStroke: `1.5px ${sfx.strokeHex}`,
                  textShadow: '0 4px 14px rgba(0,0,0,0.65)',
                  fontFamily: western ? typography?.sfxFont || 'Impact, "Arial Black", sans-serif' : undefined,
                  fontSize: sfx.fontSize || (isDeepFocus ? '2.2rem' : western ? '1.15rem' : '1.35rem'),
                  lineHeight: 1,
                  pointerEvents: readMode ? 'none' : 'auto',
                  cursor: ctrl.activeTool === 'select' && !readMode ? 'move' : undefined,
                }}
              >
                <div className={sfx.animation ? `tcv2-sfx-${sfx.animation}` : undefined}>{sfx.kanji}</div>
                {sfx.romaji && (
                  <div className="text-[9px] tracking-widest uppercase text-center text-white/90">
                    {sfx.romaji}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Lettering: balloons + captions */}
      {lettering.layer?.visible !== false && (
        <div className="absolute inset-0 pointer-events-none" style={{ ...layerStyle(lettering.t), zIndex: 18 }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
            {panel.nestedDocument.balloons.map((b) => {
              if (b.style === 'NARRATION_CAPTION' || b.tailDirection) return null;
              const bx = b.xPct + b.widthPct / 2;
              const by = b.yPct + 8;
              return (
                <polygon
                  key={`tail_${b.id}`}
                  points={`${bx - 2.4},${by} ${bx + 2.4},${by} ${b.tailTargetXPct},${b.tailTargetYPct}`}
                  fill="#ffffff"
                  stroke="#120d1c"
                  strokeWidth="0.6"
                />
              );
            })}
          </svg>

          {panel.nestedDocument.balloons.map((b) => {
            const isCaption = b.style === 'NARRATION_CAPTION';
            const look = balloonLook(b, typography?.captionFont);
            return (
              <div
                key={b.id}
                onPointerDown={(e) => startItemDrag(e, 'balloon', b.id, false)}
                onClick={(e) => {
                  if (readMode) return;
                  e.stopPropagation();
                  ctrl.setActivePageId(page.id);
                  ctrl.setActivePanelId(panel.id);
                  ctrl.setInspectorSection('balloon');
                }}
                style={{
                  position: 'absolute',
                  ...balloonPlacement(b),
                  padding: isDeepFocus ? '8px 12px' : '5px 8px',
                  fontSize: isDeepFocus ? '12px' : '10px',
                  fontWeight: 600,
                  lineHeight: 1.3,
                  boxShadow: '0 8px 20px rgba(0,0,0,0.38)',
                  fontFamily: typography?.bodyFont,
                  ...look,
                  pointerEvents: readMode ? 'none' : 'auto',
                  cursor: ctrl.activeTool === 'select' && !readMode ? 'move' : undefined,
                }}
              >
                {b.speaker && !isCaption && (
                  <div
                    style={{
                      fontSize: '8px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: b.style === 'COMMS' ? '#22d3ee' : '#D40055',
                      marginBottom: 2,
                    }}
                  >
                    {b.speaker}
                  </div>
                )}
                <div>{b.text}</div>
                {!isCaption && <BalloonTail dir={b.tailDirection} look={look} />}
              </div>
            );
          })}
        </div>
      )}

      {/* 7. Bottom-Left Subtle Panel Number Pill (When Unselected) */}
      {!isActive && !readMode && (
        <div
          className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-extrabold text-white/75 pointer-events-none"
          style={{
            background: 'rgba(14,10,22,0.82)',
            border: '1px solid rgba(255,255,255,0.12)',
            zIndex: 20,
          }}
        >
          P{panel.globalPanelNumber ?? panel.order}
          {loop?.enabled ? ' · loop' : ''}
        </div>
      )}

      {/* 8. Variant 2 Magnetic Panel HUD (Only shown on the Active Panel, styled like Tela dark glass pills) */}
      {showChrome && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-2 left-2 right-2 z-30 flex items-center justify-between gap-1 px-2 py-1 rounded-[9px]"
          style={{
            background: 'rgba(18, 13, 28, 0.92)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="px-1.5 py-0.5 rounded-[5px] text-[9px] font-extrabold text-white shrink-0"
              style={{
                background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))',
              }}
            >
              P{panel.globalPanelNumber ?? panel.order}
            </span>
            <span className="text-[9.5px] font-bold text-white/90 truncate">
              {panel.framingCode || panel.cameraShot.replace(/_/g, ' ')}
            </span>
            <span className="text-[9px] font-mono text-[#00DAF3] shrink-0">
              {panel.nestedDocument.timelineDurationSec.toFixed(1)}s
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!isDeepFocus && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    ctrl.splitActivePanel('horizontal');
                  }}
                  className="grid place-items-center w-5 h-5 rounded-[5px] bg-white/[0.08] hover:bg-white/[0.15] text-white/85 hover:text-white"
                  title="Split panel horizontally"
                >
                  <Rows size={11} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    ctrl.splitActivePanel('vertical');
                  }}
                  className="grid place-items-center w-5 h-5 rounded-[5px] bg-white/[0.08] hover:bg-white/[0.15] text-white/85 hover:text-white"
                  title="Split panel vertically"
                >
                  <Columns size={11} />
                </button>
              </>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                ctrl.addSafeSpeechBalloon();
              }}
              className="px-1.5 h-5 rounded-[5px] bg-[var(--pj-magenta,#D40055)]/25 hover:bg-[var(--pj-magenta,#D40055)]/40 border border-[var(--pj-magenta,#D40055)]/45 text-[9px] font-bold text-white flex items-center gap-1"
              title="Add Safe-Zone Speech Balloon"
            >
              <MessageSquarePlus size={10} className="text-[#D0BCFF]" /> Balloon
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                ctrl.setDeepFocusPanelId(isDeepFocus ? null : panel.id);
              }}
              className="px-1.5 h-5 rounded-[5px] text-[9px] font-bold text-[#8ff5ff] flex items-center gap-1"
              style={{
                background: 'rgba(0,218,243,0.16)',
                border: '1px solid rgba(0,218,243,0.4)',
              }}
              title={
                isDeepFocus
                  ? 'Exit Nested Smart-Object Panel View'
                  : 'Open Panel as Nested Smart-Object Tela Page'
              }
            >
              {isDeepFocus ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
              {isDeepFocus ? 'Page' : 'Focus'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// PROJECT CARD + GRAPHIC NOVEL FIELDS (inspector)
// ============================================================================

const GEOMETRY_OPTIONS: { id: PanelGeometry; name: string }[] = [
  { id: 'standard-rect', name: 'Standard' },
  { id: 'open-bleed', name: 'Open bleed splash' },
  { id: 'widescreen-letterbox', name: 'Widescreen letterbox' },
  { id: 'slanted-slash-left', name: 'Slash ╲ (left)' },
  { id: 'slanted-slash-right', name: 'Slash ╲ (right)' },
  { id: 'wrap-around-l', name: 'L-wrap' },
  { id: 'circle-reticle', name: 'Circle reticle' },
  { id: 'vertical-monolith', name: 'Vertical monolith' },
  { id: 'floating-inset', name: 'Floating inset (PiP)' },
];

const CAMERA_OPTIONS: CameraAngle[] = [
  'extreme-wide',
  'wide',
  'medium',
  'close-up',
  'extreme-close-up',
  'low-angle-heroic',
  'high-angle-dutch',
  'over-the-shoulder',
  'bird-eye',
  'worm-eye',
];

const fieldCls = 'w-full px-2 rounded-[8px] text-[.68rem] text-white/85 outline-none';

const ComicProjectCard: React.FC<{ ctrl: TelaComicVariant2Controller }> = ({ ctrl }) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const p = ctrl.project;
  const panelCount = p.pages.reduce((n, pg) => n + pg.panels.length, 0);
  const saveLabel =
    ctrl.saveState === 'saving' ? 'Saving…' : ctrl.saveState === 'saved' ? 'Saved on this device' : ctrl.saveState === 'error' ? 'Save failed' : 'Not saved yet';

  return (
    <div className="px-3 py-2.5 flex flex-col gap-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className={panelLbl}>Project</span>
        <span
          className="text-[9px] font-bold"
          style={{ color: ctrl.saveState === 'error' ? '#f87171' : ctrl.saveState === 'saved' ? '#34d399' : 'rgba(255,255,255,0.45)' }}
        >
          {saveLabel}
        </span>
      </div>
      <input
        value={p.title}
        onChange={(e) => ctrl.renameProject(e.target.value)}
        className={`${fieldCls} h-8 font-bold`}
        style={telaInputStyle}
        aria-label="Project title"
      />
      <div className="text-[9.5px] text-white/45">
        {p.format.replace('-', ' ')} · {p.pages.length} pages · {panelCount} panels
        {p.source ? ' · from showcase' : ''}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="h-7 rounded-[8px] text-[.64rem] font-bold text-white flex items-center justify-center gap-1"
          style={{ background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' }}
        >
          <BookOpen size={11} /> Open…
        </button>
        <button
          onClick={() => ctrl.setReadMode((v) => !v)}
          className="h-7 rounded-[8px] text-[.64rem] font-bold flex items-center justify-center gap-1 border"
          style={{
            background: ctrl.readMode ? 'rgba(0,218,243,0.18)' : 'rgba(255,255,255,0.05)',
            borderColor: ctrl.readMode ? 'rgba(0,218,243,0.5)' : 'rgba(255,255,255,0.1)',
            color: ctrl.readMode ? '#8ff5ff' : 'rgba(255,255,255,0.8)',
          }}
          title="Preview as the reader sees it"
        >
          {ctrl.readMode ? <PenLine size={11} /> : <Eye size={11} />} {ctrl.readMode ? 'Back to edit' : 'Read'}
        </button>
      </div>
      <label className="flex items-center gap-2 text-[.64rem] text-white/70 cursor-pointer">
        <input type="checkbox" checked={ctrl.loopsEnabled} onChange={(e) => ctrl.setLoopsEnabled(e.target.checked)} />
        Play living panel loops
      </label>
      <div className="flex items-center justify-between gap-2">
        <CreativeSyncPill kind={COMIC_CLOUD_KIND} localId={p.id} />
        <button onClick={() => setHistoryOpen((v) => !v)} className="text-[.62rem] font-bold text-[#D0BCFF] hover:underline">
          {historyOpen ? 'Hide history' : 'History'}
        </button>
      </div>
      {historyOpen && (
        <div className="rounded-[10px] p-2 flex flex-col gap-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <CreativeVersionHistory
            kind={COMIC_CLOUD_KIND}
            localId={p.id}
            title={p.title}
            getCurrentJson={() => JSON.stringify(ctrl.project)}
            onRestore={ctrl.restoreProjectJson}
          />
          <CreativeStorageMeter />
        </div>
      )}
      {ctrl.projectError && <div className="text-[10px] text-red-300">{ctrl.projectError}</div>}

      {open && (
        <div className="flex flex-col gap-1.5 rounded-[10px] p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className={panelLbl}>Showcase books</div>
          {ctrl.showcaseCatalog.length === 0 && <div className="text-[10px] text-white/40">Loading…</div>}
          {ctrl.showcaseCatalog.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                void ctrl.openShowcase(b.id);
                setOpen(false);
              }}
              className="text-left px-2 py-1.5 rounded-[8px] hover:bg-white/[0.06]"
              style={{ background: p.source?.showcaseId === b.id ? 'rgba(212,0,85,0.16)' : 'transparent' }}
            >
              <div className="text-[.68rem] font-bold text-white truncate">{b.title}</div>
              <div className="text-[9px] text-white/40">
                {b.pageCount} pages · {b.panelCount} panels{b.hasArt ? ' · art' : ' · script only'}
              </div>
            </button>
          ))}

          {ctrl.savedProjects.length > 0 && <div className={`${panelLbl} mt-1`}>Saved on this device</div>}
          {ctrl.savedProjects.map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <button
                onClick={() => {
                  void ctrl.openSavedProject(s.id);
                  setOpen(false);
                }}
                className="flex-1 min-w-0 text-left px-2 py-1.5 rounded-[8px] hover:bg-white/[0.06]"
                style={{ background: p.id === s.id ? 'rgba(212,0,85,0.16)' : 'transparent' }}
              >
                <div className="text-[.68rem] font-bold text-white truncate">{s.title}</div>
                <div className="text-[9px] text-white/40">
                  {s.inCloudOnly ? 'From another device' : `${s.pageCount} pages`} · {new Date(s.updatedAt).toLocaleString()}
                </div>
              </button>
              {p.id !== s.id && (
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${s.title}" from this device?`)) void ctrl.deleteSavedProject(s.id);
                  }}
                  className="p-1 rounded-[7px] hover:bg-red-500/20 text-white/40 hover:text-red-400"
                  title="Delete saved project"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}

          <div className={`${panelLbl} mt-1`}>New</div>
          <div className="grid grid-cols-2 gap-1">
            {(['comic', 'manga', 'graphic-novel', 'storybook'] as ComicProjectFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => {
                  ctrl.newProject(f);
                  setOpen(false);
                }}
                className="h-7 rounded-[7px] text-[.62rem] font-bold text-white/80 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 capitalize"
              >
                {f.replace('-', ' ')}
              </button>
            ))}
          </div>

          <div className={`${panelLbl} mt-1`}>File</div>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => fileRef.current?.click()} className="h-7 rounded-[7px] text-[.62rem] font-bold text-white/80 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10">
              Import project
            </button>
            <button onClick={ctrl.exportProjectFile} className="h-7 rounded-[7px] text-[.62rem] font-bold text-white/80 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10">
              Export project
            </button>
            <button onClick={ctrl.exportShowcaseJson} className="h-7 rounded-[7px] text-[.62rem] font-bold text-white/80 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10" title="Showcase format, for Lorea and the Council V4 reader">
              Export showcase
            </button>
            {p.source && (
              <button
                onClick={() => {
                  if (window.confirm('Discard your edits and reload this book from its source?')) void ctrl.resetProjectToSource();
                }}
                className="h-7 rounded-[7px] text-[.62rem] font-bold text-red-300/90 bg-white/[0.05] hover:bg-red-500/15 border border-white/10"
              >
                Reset to source
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void ctrl.importProjectFile(f);
              e.target.value = '';
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
};

/** Showcase-grade panel fields: geometry, framing, briefs, source timecode, loop, SAM, reframe. */
const PanelGraphicNovelFields: React.FC<{ ctrl: TelaComicVariant2Controller }> = ({ ctrl }) => {
  const panel = ctrl.activePanel;
  const page = ctrl.activePage;
  if (!panel || !page) return null;
  const set = (patch: Partial<ComicPanelNode>) => ctrl.updateActivePanel((p) => ({ ...p, ...patch }));
  const relayoutWith = (patch: Partial<ComicPanelNode>) =>
    ctrl.updateActivePage((pg) => {
      const panels = pg.panels.map((p) => (p.id === panel.id ? { ...p, ...patch } : p));
      if (pg.presetId !== 'flex-rows') return { ...pg, panels };
      const laid = relayoutPanels(panels);
      return { ...pg, panels: laid.panels, aspect: laid.aspect };
    });
  const video = panel.video;
  const loop = video?.loop;
  const reframe = panel.reframe ?? { panXPct: 0, panYPct: 0, zoom: 1 };
  const anchor = video?.anchorTimecodeSeconds ?? video?.timecodeSeconds;

  /** Pulls a new still from the source film (Mux thumbnail) — the ±1 min timecode scrub. */
  const scrubTo = (t: number) => {
    if (!video?.muxPlaybackId) return;
    set({
      renderedImageUrl: `https://image.mux.com/${video.muxPlaybackId}/thumbnail.jpg?time=${t.toFixed(1)}&width=960`,
      video: { ...video, anchorTimecodeSeconds: Math.round(t * 10) / 10 },
    });
  };

  return (
    <>
      <div>
        <div className={panelLbl}>Panel P{panel.globalPanelNumber ?? panel.order} · Frame</div>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          <select
            value={panel.geometry ?? 'standard-rect'}
            onChange={(e) => relayoutWith({ geometry: e.target.value as PanelGeometry })}
            className={`${fieldCls} h-7`}
            style={telaSelectStyle}
            aria-label="Panel geometry"
          >
            {GEOMETRY_OPTIONS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            value={panel.cameraAngle ?? 'medium'}
            onChange={(e) => set({ cameraAngle: e.target.value as CameraAngle })}
            className={`${fieldCls} h-7`}
            style={telaSelectStyle}
            aria-label="Camera angle"
          >
            {CAMERA_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c.replace(/-/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        {page.presetId === 'flex-rows' && (
          <label className="flex items-center justify-between gap-2 mt-1.5 text-[.64rem] text-white/60">
            Width in row (of 12)
            <input
              type="number"
              min={1}
              max={12}
              value={panel.flex ?? 12}
              onChange={(e) => relayoutWith({ flex: Math.max(1, Math.min(12, Number(e.target.value) || 12)) })}
              className={`${fieldCls} h-7 w-16`}
              style={telaInputStyle}
            />
          </label>
        )}
      </div>

      <div>
        <div className={panelLbl}>Art brief</div>
        <textarea
          value={panel.artBrief ?? panel.prompt}
          onChange={(e) => set({ artBrief: e.target.value, prompt: e.target.value })}
          rows={3}
          className={`${fieldCls} py-1.5 mt-1.5 resize-y`}
          style={telaInputStyle}
        />
        <div className={`${panelLbl} mt-2`}>Generation prompt</div>
        <textarea
          value={panel.generationPrompt ?? ''}
          onChange={(e) => set({ generationPrompt: e.target.value })}
          rows={3}
          className={`${fieldCls} py-1.5 mt-1.5 resize-y`}
          style={telaInputStyle}
        />
      </div>

      {video && (
        <div>
          <div className={panelLbl}>Source film · living loop</div>
          {video.muxPlaybackId && anchor != null && (
            <label className="block mt-1.5 text-[.62rem] text-white/60">
              Still at {anchor.toFixed(1)}s (±60s)
              <input
                type="range"
                min={Math.max(0, (video.timecodeSeconds ?? anchor) - 60)}
                max={(video.timecodeSeconds ?? anchor) + 60}
                step={0.5}
                value={anchor}
                onChange={(e) => scrubTo(Number(e.target.value))}
                className="w-full"
              />
            </label>
          )}
          <label className="flex items-center gap-2 mt-1.5 text-[.64rem] text-white/70 cursor-pointer">
            <input
              type="checkbox"
              checked={!!loop?.enabled}
              disabled={!video.sourceVideoUrl}
              onChange={(e) => {
                const start = loop?.timeRange[0] ?? anchor ?? 0;
                set({
                  video: {
                    ...video,
                    loop: {
                      enabled: e.target.checked,
                      motionType: loop?.motionType ?? 'cinemagraph',
                      timeRange: loop?.timeRange ?? [start, start + 4.5],
                      fps: loop?.fps ?? 24,
                    },
                  },
                });
              }}
            />
            Loop the source film in this panel
          </label>
          {loop?.enabled && (
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              {([0, 1] as const).map((i) => (
                <label key={i} className="text-[.6rem] text-white/50">
                  {i === 0 ? 'Start (s)' : 'End (s)'}
                  <input
                    type="number"
                    step={0.5}
                    value={loop.timeRange[i]}
                    onChange={(e) => {
                      const tr: [number, number] = [...loop.timeRange] as [number, number];
                      tr[i] = Number(e.target.value) || 0;
                      if (tr[1] - tr[0] > 15) tr[1] = tr[0] + 15;
                      set({ video: { ...video, loop: { ...loop, timeRange: tr } } });
                    }}
                    className={`${fieldCls} h-7 mt-0.5`}
                    style={telaInputStyle}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <span className={panelLbl}>Hand reframe</span>
          <button
            onClick={() => ctrl.setActiveTool(ctrl.activeTool === 'reframe' ? 'select' : 'reframe')}
            className="text-[.6rem] font-bold px-2 h-6 rounded-[7px]"
            style={{
              background: ctrl.activeTool === 'reframe' ? 'rgba(0,218,243,0.18)' : 'rgba(255,255,255,0.05)',
              color: ctrl.activeTool === 'reframe' ? '#8ff5ff' : 'rgba(255,255,255,0.7)',
            }}
          >
            {ctrl.activeTool === 'reframe' ? 'Dragging pans art' : 'Drag to pan'}
          </button>
        </div>
        <label className="block mt-1.5 text-[.62rem] text-white/60">
          Zoom {reframe.zoom.toFixed(2)}×
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={reframe.zoom}
            onChange={(e) => set({ reframe: { ...reframe, zoom: Number(e.target.value) } })}
            className="w-full"
          />
        </label>
        {(reframe.zoom !== 1 || reframe.panXPct !== 0 || reframe.panYPct !== 0) && (
          <button onClick={() => set({ reframe: undefined })} className="text-[.6rem] font-bold text-[#D0BCFF] hover:underline">
            Reset framing
          </button>
        )}
      </div>

      {panel.subject && (
        <label className="flex items-center gap-2 text-[.64rem] text-white/70 cursor-pointer">
          <input
            type="checkbox"
            checked={panel.subject.enabled}
            onChange={(e) => set({ subject: { ...panel.subject!, enabled: e.target.checked } })}
          />
          2.5D subject lift · {panel.subject.subjectName}
        </label>
      )}
    </>
  );
};

const PageMetaFields: React.FC<{ ctrl: TelaComicVariant2Controller }> = ({ ctrl }) => {
  const page = ctrl.activePage;
  if (!page) return null;
  const meta = page.meta ?? {};
  const setMeta = (patch: Partial<NonNullable<ComicPageDocument['meta']>>) =>
    ctrl.updateActivePage((pg) => ({ ...pg, meta: { ...pg.meta, ...patch } }));
  return (
    <div>
      <div className={panelLbl}>Page</div>
      <input
        value={page.title}
        onChange={(e) => ctrl.updateActivePage((pg) => ({ ...pg, title: e.target.value }))}
        className={`${fieldCls} h-7 mt-1.5 font-bold`}
        style={telaInputStyle}
        aria-label="Page title"
      />
      <div className="grid grid-cols-[64px_1fr] gap-1.5 mt-1.5">
        <input
          value={meta.act ?? ''}
          onChange={(e) => setMeta({ act: e.target.value })}
          placeholder="Act"
          className={`${fieldCls} h-7`}
          style={telaInputStyle}
        />
        <input
          value={meta.slugline ?? ''}
          onChange={(e) => setMeta({ slugline: e.target.value })}
          placeholder="INT. LOCATION - NIGHT"
          className={`${fieldCls} h-7`}
          style={telaInputStyle}
        />
      </div>
      <textarea
        value={meta.sequenceBeat ?? ''}
        onChange={(e) => setMeta({ sequenceBeat: e.target.value })}
        placeholder="What happens on this page"
        rows={2}
        className={`${fieldCls} py-1.5 mt-1.5 resize-y`}
        style={telaInputStyle}
      />
    </div>
  );
};

// ============================================================================
// 3. SPLIT RIGHT INSPECTOR (100% Real Tela Right Sidebar Design Language)
// ============================================================================
export const TelaComicSplitRightInspector: React.FC<{
  ctrl: TelaComicVariant2Controller;
}> = ({ ctrl }) => {
  const activePanel = ctrl.activePanel;
  const nestedDoc = activePanel?.nestedDocument;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden select-none text-white">
      <ComicProjectCard ctrl={ctrl} />
      {/* Top Action Stack (Matches exact 3 gradient buttons + URL input in TelaView.tsx lines 3720-3740!) */}
      <div
        className="px-3 py-2.5 flex flex-col gap-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* 1. Brand Gradient Button (Exact match to "Add image" in TelaView.tsx line 3722) */}
        <button
          onClick={() => ctrl.addSafeSpeechBalloon()}
          className="flex items-center justify-center gap-1.5 h-8 rounded-[9px] text-[.74rem] font-bold text-white transition-opacity hover:opacity-95"
          style={{
            background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))',
          }}
        >
          <MessageSquarePlus size={14} /> Add Safe-Zone Speech Balloon
        </button>

        {/* 2. Paste Panel Image URL Row (Exact match to TelaView.tsx line 3725) */}
        <div className="flex items-center gap-1.5">
          <input
            value={ctrl.panelImageUrlDraft}
            onChange={(e) => ctrl.setPanelImageUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ctrl.applyPanelImageUrlDraft();
            }}
            placeholder="…or paste panel image URL"
            className="flex-1 min-w-0 h-8 px-2.5 rounded-[9px] text-[.72rem] text-white/85 outline-none"
            style={telaInputStyle}
          />
          <button
            onClick={ctrl.applyPanelImageUrlDraft}
            className="grid place-items-center w-8 h-8 rounded-[9px] text-white/70 hover:text-white"
            style={telaInputStyle}
            title="Apply image URL to active panel"
          >
            <LinkIcon size={14} />
          </button>
        </div>

        {/* 3. Warm Gradient Button (Exact match to "Intelligent rebuild" in TelaView.tsx line 3729) */}
        <button
          onClick={() =>
            ctrl.setDeepFocusPanelId(
              ctrl.deepFocusPanelId ? null : activePanel?.id || null
            )
          }
          className="flex items-center justify-center gap-1.5 h-9 rounded-[10px] text-[.7rem] font-extrabold text-white transition-opacity hover:opacity-95"
          style={{
            background: 'linear-gradient(135deg,#6B0099 0%,#D40055 52%,#FF8A00 100%)',
          }}
        >
          <Sparkles size={14} />
          {ctrl.deepFocusPanelId
            ? 'Return to Full Comic Page'
            : `Edit Panel P${activePanel?.order || 1} Smart-Object · Nested Page`}
        </button>

        {/* 4. Preset Picker + Spatial Cyan Button (Exact match to "Shapes + Trace" row in TelaView.tsx line 3732) */}
        <div className="flex items-center gap-1.5">
          <select
            value={ctrl.activePage?.presetId || 'action-4-grid'}
            onChange={(e) =>
              ctrl.applyPageGridPreset(e.target.value as PanelLayoutPresetId)
            }
            className="flex-1 min-w-0 h-8 px-2 rounded-[9px] text-[.69rem] text-white/85 outline-none"
            style={telaInputStyle}
            title="Switch Active Page Panel Grid Layout"
          >
            {PAGE_PRESET_OPTIONS(ctrl.activePage).map((pr) => (
              <option key={pr.id} value={pr.id} style={{ background: '#17131d' }}>
                {pr.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => ctrl.splitActivePanel('horizontal')}
            className="flex items-center justify-center gap-1 w-[88px] h-8 rounded-[9px] text-[.68rem] font-bold text-white shrink-0"
            style={{
              background: 'var(--pj-grad-spatial, linear-gradient(135deg,#6B0099,#00DAF3))',
            }}
            title="Split Active Panel"
          >
            <Sparkles size={13} /> Split
          </button>
        </div>
      </div>

      {/* Sub-Mode Switcher: Layout | Ink & Tone | Lettering | Motion */}
      <div
        className="grid grid-cols-4 gap-1 px-2.5 py-1.5 shrink-0"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        {(
          [
            { id: 'layout', label: 'Layout' },
            { id: 'ink', label: 'Ink & Tone' },
            { id: 'balloon', label: 'Lettering' },
            { id: 'motion', label: 'Motion' },
          ] as const
        ).map((tab) => {
          const active = ctrl.inspectorSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => ctrl.setInspectorSection(tab.id)}
              className={`h-7 rounded-[7px] text-[.6rem] font-bold flex items-center justify-center transition-colors ${
                active
                  ? 'bg-white/10 text-white border border-white/15'
                  : 'text-white/45 hover:text-white/80'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TOP HALF: Context-Sensitive Comic Toolset Controls */}
      <div
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        {ctrl.inspectorSection === 'layout' && activePanel && (
          <>
            <div>
              <div className={panelLbl}>Non-Destructive Panel Knife · P{activePanel.order}</div>
              <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                <button
                  onClick={() => ctrl.splitActivePanel('horizontal')}
                  className="h-7 rounded-[8px] text-[.64rem] font-bold text-white/85 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 flex items-center justify-center gap-1"
                >
                  <Rows size={11} className="text-[#00DAF3]" /> Split H
                </button>
                <button
                  onClick={() => ctrl.splitActivePanel('vertical')}
                  className="h-7 rounded-[8px] text-[.64rem] font-bold text-white/85 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 flex items-center justify-center gap-1"
                >
                  <Columns size={11} className="text-[#00DAF3]" /> Split V
                </button>
                <button
                  onClick={() => ctrl.splitActivePanel('diagonal', 14)}
                  className="h-7 rounded-[8px] text-[.64rem] font-bold text-white/85 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 flex items-center justify-center gap-1"
                >
                  <Scissors size={11} className="text-[#FF8C00]" /> Slash 14°
                </button>
              </div>
            </div>

            <div>
              <div className={panelLbl}>Safe-Zone Balloon Docking (5 Rules)</div>
              <div className="grid grid-cols-3 gap-1 mt-1.5">
                {(
                  [
                    'top-left',
                    'top-gutter-flush',
                    'top-right',
                    'bottom-left',
                    'bottom-gutter-flush',
                    'bottom-right',
                  ] as BalloonSafeDockZone[]
                ).map((zone) => (
                  <button
                    key={zone}
                    onClick={() => ctrl.setBalloonDraftDock(zone)}
                    className="h-6 rounded-[6px] text-[8.5px] font-bold uppercase tracking-tight"
                    style={{
                      background:
                        ctrl.balloonDraftDock === zone
                          ? 'rgba(212,0,85,0.22)'
                          : 'rgba(255,255,255,0.04)',
                      border:
                        ctrl.balloonDraftDock === zone
                          ? '1px solid rgba(212,0,85,0.6)'
                          : '1px solid rgba(255,255,255,0.08)',
                      color:
                        ctrl.balloonDraftDock === zone
                          ? '#fff'
                          : 'rgba(255,255,255,0.55)',
                    }}
                  >
                    {zone.replace('-gutter-flush', ' rail').replace('bottom-', 'bot-')}
                  </button>
                ))}
              </div>
            </div>

            <PageMetaFields ctrl={ctrl} />
            <PanelGraphicNovelFields ctrl={ctrl} />
          </>
        )}

        {ctrl.inspectorSection === 'ink' && nestedDoc && (
          <>
            <div>
              <div className="flex items-center justify-between">
                <span className={panelLbl}>Mangaka G-Pen & Maru-Pen</span>
                <button
                  onClick={() => ctrl.setActiveTool('gpen')}
                  className="px-2 py-0.5 rounded-[6px] text-[.6rem] font-bold"
                  style={{
                    background:
                      ctrl.activeTool === 'gpen'
                        ? 'var(--pj-magenta,#D40055)'
                        : 'rgba(255,255,255,0.08)',
                    color: '#fff',
                  }}
                >
                  {ctrl.activeTool === 'gpen' ? 'Drawing Active' : 'Activate Pen'}
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                <div>
                  <div className="flex justify-between text-[10px] font-bold text-white/55 mb-1">
                    <span>Nib Width</span>
                    <span className="text-white/85">{ctrl.gpenSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={18}
                    value={ctrl.gpenSize}
                    onChange={(e) => ctrl.setGpenSize(+e.target.value)}
                    style={{ width: '100%', accentColor: 'var(--pj-magenta,#D40055)' }}
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-bold text-white/55 mb-1">
                    <span>Streamline Stabilization</span>
                    <span className="text-[#00DAF3]">{ctrl.gpenStreamline}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={ctrl.gpenStreamline}
                    onChange={(e) => ctrl.setGpenStreamline(+e.target.value)}
                    style={{ width: '100%', accentColor: 'var(--pj-cyan,#00DAF3)' }}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  {['#ffffff', '#120d1c', '#D40055', '#00DAF3', '#FF8C00', '#D0BCFF'].map(
                    (hex) => (
                      <button
                        key={hex}
                        onClick={() => ctrl.setGpenColor(hex)}
                        className="w-5 h-5 rounded-full"
                        style={{
                          background: hex,
                          border:
                            ctrl.gpenColor === hex
                              ? '2px solid #fff'
                              : '1px solid rgba(255,255,255,0.25)',
                        }}
                      />
                    )
                  )}
                  <button
                    onClick={() =>
                      ctrl.updateActiveNestedDoc((d) => ({ ...d, inkStrokes: [] }))
                    }
                    className="ml-auto text-[.62rem] font-bold text-white/45 hover:text-red-400"
                  >
                    Clear Ink ({nestedDoc.inkStrokes.length})
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between">
                <span className={panelLbl}>60 LPI Manga Screentone</span>
                <button
                  onClick={() =>
                    ctrl.setPanelScreentone({ enabled: !nestedDoc.halftone.enabled })
                  }
                  className="px-2 py-0.5 rounded-[6px] text-[.6rem] font-bold"
                  style={{
                    background: nestedDoc.halftone.enabled
                      ? 'rgba(0,218,243,0.18)'
                      : 'rgba(255,255,255,0.06)',
                    color: nestedDoc.halftone.enabled ? '#8ff5ff' : 'rgba(255,255,255,0.5)',
                    border: nestedDoc.halftone.enabled
                      ? '1px solid rgba(0,218,243,0.4)'
                      : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {nestedDoc.halftone.enabled ? 'Enabled' : 'Off'}
                </button>
              </div>
              {nestedDoc.halftone.enabled && (
                <div className="mt-2 flex flex-col gap-2">
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-white/55 mb-1">
                      <span>Screen Frequency</span>
                      <span className="text-white/85">{nestedDoc.halftone.dotsPerInch} LPI</span>
                    </div>
                    <input
                      type="range"
                      min={25}
                      max={85}
                      value={nestedDoc.halftone.dotsPerInch}
                      onChange={(e) =>
                        ctrl.setPanelScreentone({ dotsPerInch: +e.target.value })
                      }
                      style={{ width: '100%', accentColor: 'var(--pj-magenta,#D40055)' }}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-white/55 mb-1">
                      <span>Tone Density</span>
                      <span className="text-white/85">
                        {Math.round(nestedDoc.halftone.opacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={0.75}
                      step={0.02}
                      value={nestedDoc.halftone.opacity}
                      onChange={(e) =>
                        ctrl.setPanelScreentone({ opacity: +e.target.value })
                      }
                      style={{ width: '100%', accentColor: 'var(--pj-cyan,#00DAF3)' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {ctrl.inspectorSection === 'balloon' && nestedDoc && (
          <>
            <div>
              <div className="flex items-center justify-between">
                <span className={panelLbl}>Safe-Zone Balloon Lettering</span>
                <span className="text-[9px] font-bold text-[#06D6A0]">5 Rules Enforced</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                <input
                  value={ctrl.balloonDraftSpeaker}
                  onChange={(e) => ctrl.setBalloonDraftSpeaker(e.target.value)}
                  placeholder="Speaker"
                  className="h-7 px-2 rounded-[7px] text-[.68rem] text-white outline-none"
                  style={telaInputStyle}
                />
                <select
                  value={ctrl.balloonDraftStyle}
                  onChange={(e) =>
                    ctrl.setBalloonDraftStyle(
                      e.target.value as SpeechBalloonItem['style']
                    )
                  }
                  className="h-7 px-2 rounded-[7px] text-[.68rem] text-white outline-none"
                  style={telaSelectStyle}
                >
                  <option value="SPEECH">Speech Oval</option>
                  <option value="THOUGHT">Thought Cloud</option>
                  <option value="WHISPER">Whisper</option>
                  <option value="COMMS">Comms / Radio</option>
                  <option value="MONSTER">Monster</option>
                  <option value="SHOUT">Spiky Shout</option>
                  <option value="NARRATION_CAPTION">Caption Box</option>
                </select>
              </div>

              <textarea
                rows={2}
                value={ctrl.balloonDraftText}
                onChange={(e) => ctrl.setBalloonDraftText(e.target.value)}
                placeholder="Dialogue text…"
                className="mt-1.5 w-full p-2 rounded-[7px] text-[.68rem] text-white outline-none resize-none"
                style={telaInputStyle}
              />

              {nestedDoc.balloons.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {nestedDoc.balloons.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 px-2 py-1 rounded-[7px] bg-white/[0.04] border border-white/[0.07] text-[.66rem]"
                    >
                      <span className="truncate text-white/85">
                        <b className="text-[#D0BCFF]">{b.speaker}:</b> {b.text}
                      </span>
                      <button
                        onClick={() => ctrl.deleteSpeechBalloon(b.id)}
                        className="text-white/35 hover:text-red-400 shrink-0"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div className={panelLbl}>Kanji & Manga SFX Stamps</div>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                {KANJI_SFX_PRESET_LIBRARY.map((sfx, idx) => (
                  <button
                    key={sfx.id}
                    onClick={() => ctrl.addKanjiSfxStamp(idx)}
                    className="px-2 py-1.5 rounded-[7px] bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-left flex items-center justify-between"
                  >
                    <span className="text-[.74rem] font-black" style={{ color: sfx.colorHex }}>
                      {sfx.kanji}
                    </span>
                    <span className="text-[9px] text-white/55 font-semibold">{sfx.romaji}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {ctrl.inspectorSection === 'motion' && nestedDoc && (
          <>
            <div>
              <div className={panelLbl}>Cinemagraph Weather Loop</div>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                <button
                  onClick={() => ctrl.setPanelCinemagraph('none')}
                  className="px-2 py-1.5 rounded-[7px] text-left text-[.64rem] font-bold transition-colors truncate"
                  style={{
                    background:
                      nestedDoc.cinemagraphPreset === 'none'
                        ? 'rgba(0,218,243,0.16)'
                        : 'rgba(255,255,255,0.04)',
                    border:
                      nestedDoc.cinemagraphPreset === 'none'
                        ? '1px solid rgba(0,218,243,0.5)'
                        : '1px solid rgba(255,255,255,0.08)',
                    color:
                      nestedDoc.cinemagraphPreset === 'none'
                        ? '#8ff5ff'
                        : 'rgba(255,255,255,0.7)',
                  }}
                >
                  Static (No Loop)
                </button>
                {CINEMAGRAPH_PRESETS.map((pr) => {
                  const active = nestedDoc.cinemagraphPreset === pr.id;
                  return (
                    <button
                      key={pr.id}
                      onClick={() => ctrl.setPanelCinemagraph(pr.id)}
                      className="px-2 py-1.5 rounded-[7px] text-left text-[.64rem] font-bold transition-colors truncate"
                      style={{
                        background: active
                          ? 'rgba(0,218,243,0.16)'
                          : 'rgba(255,255,255,0.04)',
                        border: active
                          ? '1px solid rgba(0,218,243,0.5)'
                          : '1px solid rgba(255,255,255,0.08)',
                        color: active ? '#8ff5ff' : 'rgba(255,255,255,0.7)',
                      }}
                    >
                      {pr.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div className={panelLbl}>1-Click Layer Motion Presets</div>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                {LAYER_ANIMATION_PRESETS.map((mp) => (
                  <button
                    key={mp.id}
                    onClick={() => ctrl.applyMotionPresetToActiveLayer(mp.id)}
                    className="px-2 py-1.5 rounded-[7px] bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-left text-[.64rem] font-bold text-white/80 hover:text-white truncate"
                  >
                    {mp.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* BOTTOM HALF: Always-Visible Unified Layer Stack for Active Page & Panel (Exact match to TelaView.tsx lines 3685-3848) */}
      <div className="h-[45%] shrink-0 flex flex-col min-h-0">
        <div
          className="px-3 py-2 shrink-0 flex items-center justify-between"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Layers size={12} className="text-[#00DAF3] shrink-0" />
            <span className="text-[.64rem] font-extrabold uppercase tracking-[.1em] text-white/85 truncate">
              {ctrl.activePage?.title} · Smart-Object Tree
            </span>
          </div>
          <span className="text-[.58rem] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/60 shrink-0">
            {ctrl.activePage?.panels.length || 0} Panels
          </span>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2.5 py-2 flex flex-col gap-1">
          {ctrl.activePage?.panels.map((pnl) => {
            const isPnlActive = pnl.id === activePanel?.id;
            return (
              <div key={pnl.id} className="flex flex-col gap-0.5">
                {/* Panel Smart-Object Parent Row */}
                <div
                  onClick={() => ctrl.setActivePanelId(pnl.id)}
                  onDoubleClick={() => ctrl.setDeepFocusPanelId(pnl.id)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-[8px] cursor-pointer transition-colors"
                  style={{
                    background: isPnlActive ? 'rgba(255,255,255,0.09)' : 'transparent',
                    border: isPnlActive
                      ? '1px solid rgba(212,0,85,0.55)'
                      : '1px solid transparent',
                  }}
                >
                  <span className="w-4 h-4 rounded-[4px] shrink-0 grid place-items-center bg-[#D40055]/25 border border-[#D40055]/50 text-[9px] font-extrabold text-white">
                    P{pnl.order}
                  </span>
                  <span className="flex-1 min-w-0 text-[.73rem] text-white/90 truncate font-medium">
                    Panel {pnl.order} · {pnl.cameraShot.replace(/_/g, ' ')}
                  </span>
                  <span className="shrink-0 text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-white/[0.06] text-white/45">
                    {pnl.nestedDocument.timelineDurationSec}s
                  </span>
                  <button
                    title="Open Nested Smart-Object Page"
                    onClick={(e) => {
                      e.stopPropagation();
                      ctrl.setDeepFocusPanelId(pnl.id);
                    }}
                    className="grid place-items-center w-4 h-5 text-white/45 hover:text-[#00DAF3]"
                  >
                    <Maximize2 size={11} />
                  </button>
                </div>

                {/* 7 Nested Panel Layers (Expanded for Active Panel, styled identically to TelaView layer rows) */}
                {isPnlActive && (
                  <div
                    className="pl-3 ml-2 flex flex-col gap-0.5"
                    style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    {pnl.nestedDocument.layers.map((layer) => {
                      const isLyrSel = layer.id === ctrl.activeLayerId;
                      return (
                        <div
                          key={layer.id}
                          onClick={() => ctrl.setActiveLayerId(layer.id)}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-[7px] cursor-pointer transition-colors"
                          style={{
                            background: isLyrSel ? 'rgba(255,255,255,0.07)' : 'transparent',
                            border: isLyrSel
                              ? '1px solid rgba(0,218,243,0.35)'
                              : '1px solid transparent',
                            opacity: layer.visible ? 1 : 0.45,
                          }}
                        >
                          <span className="w-3.5 h-3.5 rounded-[3px] shrink-0 grid place-items-center bg-white/[0.06] border border-white/15">
                            {layer.kind === 'SPEECH_BALLOONS' ? (
                              <Type size={9} className="text-[#FF8C00]" />
                            ) : layer.kind === 'INK_DRAWING' ? (
                              <PenTool size={9} className="text-[#f472b6]" />
                            ) : (
                              <Layers size={9} className="text-[#00DAF3]" />
                            )}
                          </span>
                          <span className="flex-1 min-w-0 text-[.68rem] text-white/85 truncate">
                            {layer.name}
                          </span>
                          <button
                            title={layer.visible ? 'Hide layer' : 'Show layer'}
                            onClick={(e) => {
                              e.stopPropagation();
                              ctrl.updateActiveNestedDoc((doc) => ({
                                ...doc,
                                layers: doc.layers.map((l) =>
                                  l.id === layer.id ? { ...l, visible: !l.visible } : l
                                ),
                              }));
                            }}
                            className="grid place-items-center w-4 h-4 text-white/45 hover:text-white"
                          >
                            {layer.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                          </button>
                          <button
                            title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                            onClick={(e) => {
                              e.stopPropagation();
                              ctrl.updateActiveNestedDoc((doc) => ({
                                ...doc,
                                layers: doc.layers.map((l) =>
                                  l.id === layer.id ? { ...l, locked: !l.locked } : l
                                ),
                              }));
                            }}
                            className="grid place-items-center w-4 h-4 text-white/35 hover:text-white"
                          >
                            {layer.locked ? <Lock size={10} /> : <Unlock size={10} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. DOCKED BOTTOM TIMELINE + COLLAPSIBLE 36PX MINI TRANSPORT & TELEMETRY BAR
// (Styled in exact Tela Studio Strip dark glass: rgba(11,10,16,0.96))
// ============================================================================
export const TelaComicBottomTransportAndTimeline: React.FC<{
  ctrl: TelaComicVariant2Controller;
  comicModeActive: boolean;
  onToggleComicMode: () => void;
}> = ({ ctrl, comicModeActive, onToggleComicMode }) => {
  const activePanel = ctrl.activePanel;
  const nestedDoc = activePanel?.nestedDocument;
  const duration = nestedDoc?.timelineDurationSec || 5;

  return (
    <div
      className="shrink-0 flex flex-col select-none z-30"
      style={{
        background: 'rgba(11,10,16,0.96)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Expanded Multi-Track Panel Layer Timeline Drawer */}
      {ctrl.timelineExpanded && nestedDoc && (
        <div
          className="h-[176px] flex flex-col overflow-hidden"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Timeline Header Bar */}
          <div
            className="h-8 px-3 flex items-center justify-between gap-2 shrink-0"
            style={{
              background: '#0c0913',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="px-2 py-0.5 rounded-[6px] text-[.62rem] font-extrabold text-white flex items-center gap-1"
                style={{
                  background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))',
                }}
              >
                <Film size={11} /> {ctrl.activePage?.title} · Panel P{activePanel.order} Timeline
              </span>
              <span className="text-[.62rem] font-semibold text-white/45">
                {activePanel.cameraShot.replace(/_/g, ' ')} · {duration.toFixed(1)}s Loop
              </span>
            </div>

            {/* Context Auto-Switch Mode Pill: Selected Panel vs In-View Scroll */}
            <div className="flex items-center gap-2">
              <span className="text-[.6rem] font-extrabold uppercase tracking-wider text-white/40">
                Timeline Target:
              </span>
              <div className="flex items-center rounded-[8px] bg-white/[0.06] p-0.5 border border-white/10">
                <button
                  onClick={() => ctrl.setTimelineSyncMode('selected')}
                  className={`px-2 py-0.5 rounded-[6px] text-[.62rem] font-bold flex items-center gap-1 transition-colors ${
                    ctrl.timelineSyncMode === 'selected'
                      ? 'bg-[var(--pj-magenta,#D40055)] text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                  title="Lock timeline to the manually clicked panel"
                >
                  <Target size={10} /> Selected Panel
                </button>
                <button
                  onClick={() => ctrl.setTimelineSyncMode('inview')}
                  className={`px-2 py-0.5 rounded-[6px] text-[.62rem] font-bold flex items-center gap-1 transition-colors ${
                    ctrl.timelineSyncMode === 'inview'
                      ? 'bg-[var(--pj-magenta,#D40055)] text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                  title="Automatically switch timeline tracks to whichever panel is scrolled into view"
                >
                  <Eye size={10} /> In-View Scroll
                </button>
              </div>

              {/* Quick Panel Switcher Pills */}
              <div className="flex items-center gap-1 ml-1">
                {ctrl.activePage?.panels.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => ctrl.setActivePanelId(p.id)}
                    className={`px-1.5 h-5 rounded-[5px] text-[.6rem] font-extrabold transition-colors ${
                      p.id === activePanel.id
                        ? 'bg-[var(--pj-magenta,#D40055)] text-white'
                        : 'bg-white/[0.06] text-white/55 hover:text-white'
                    }`}
                  >
                    P{p.order}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Layer Keyframe Tracks Body */}
          <div className="flex-1 min-h-0 flex overflow-y-auto custom-scrollbar">
            {/* Left Track Names */}
            <div
              className="w-52 shrink-0 flex flex-col py-1 px-2 gap-1"
              style={{
                background: '#0b0a10',
                borderRight: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {nestedDoc.layers.map((layer) => {
                const isSel = layer.id === ctrl.activeLayerId;
                return (
                  <div
                    key={layer.id}
                    onClick={() => ctrl.setActiveLayerId(layer.id)}
                    className="h-5 px-2 rounded-[5px] flex items-center justify-between text-[.64rem] cursor-pointer"
                    style={{
                      background: isSel ? 'rgba(255,255,255,0.09)' : 'transparent',
                      color: isSel ? '#fff' : 'rgba(255,255,255,0.6)',
                    }}
                  >
                    <span className="truncate font-medium">{layer.name}</span>
                    <span className="text-[8.5px] font-mono text-[#00DAF3]">
                      {layer.keyframes.length} kf
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Right Scrubber & Keyframe Diamonds */}
            <div
              className="flex-1 relative py-1 px-3 flex flex-col gap-1 cursor-pointer"
              style={{ background: '#0e0b14' }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.max(
                  0,
                  Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))
                );
                ctrl.setCurrentTimeSec(ratio * duration);
              }}
            >
              {/* Playhead Line */}
              <div
                className="absolute top-0 bottom-0 w-[1.5px] pointer-events-none z-20"
                style={{
                  left: `${(ctrl.currentTimeSec / duration) * 100}%`,
                  background: 'var(--pj-cyan, #00DAF3)',
                  boxShadow: '0 0 8px rgba(0,218,243,0.8)',
                }}
              />

              {nestedDoc.layers.map((layer) => (
                <div
                  key={layer.id}
                  className="h-5 rounded-[4px] relative flex items-center"
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  {layer.keyframes.map((kf) => (
                    <div
                      key={kf.id}
                      className="w-2 h-2 rotate-45 absolute -translate-x-1/2"
                      style={{
                        left: `${Math.min(98, Math.max(2, (kf.timeSec / duration) * 100))}%`,
                        background: '#D40055',
                        border: '1px solid #fff',
                      }}
                      title={`${kf.timeSec.toFixed(1)}s`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Always-Docked 36px Mini Transport & Tela Document Telemetry Bar */}
      <div className="h-9 px-3 flex items-center justify-between gap-3 text-[.66rem]">
        {/* Left: Live Tela Document Telemetry */}
        <div className="flex items-center gap-2.5 min-w-0 overflow-x-auto no-scrollbar">
          <button
            onClick={onToggleComicMode}
            className="h-6 px-2 rounded-[6px] text-[.62rem] font-bold flex items-center gap-1.5 shrink-0 transition-colors"
            style={
              comicModeActive
                ? {
                    background: 'rgba(212,0,85,0.2)',
                    border: '1px solid rgba(212,0,85,0.45)',
                    color: '#fff',
                  }
                : {
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.65)',
                  }
            }
          >
            <BookOpen size={11} className="text-[#D0BCFF]" />
            <span>{comicModeActive ? 'Comic Page Layout' : 'Standard Page'}</span>
          </button>

          <span className="text-white/55 font-semibold flex items-center gap-1 shrink-0">
            <FileText size={11} className="text-[#D0BCFF]" />
            Pg <b className="text-white/90">{ctrl.telemetry.activePageIndex}/{ctrl.telemetry.pageCount}</b>
          </span>

          <span className="text-white/15">·</span>

          <span className="text-white/55 font-semibold flex items-center gap-1 shrink-0">
            <LayoutGrid size={11} className="text-[#00DAF3]" />
            <b className="text-white/90">{ctrl.telemetry.totalPanels}</b> Panels
            {activePanel && (
              <span className="px-1.5 py-0.2 rounded bg-white/[0.08] text-white/85 text-[.6rem] font-extrabold">
                P{activePanel.order}
              </span>
            )}
          </span>

          <span className="text-white/15">·</span>

          <span className="text-white/55 font-semibold flex items-center gap-1 shrink-0">
            <Type size={11} className="text-[#FF8C00]" />
            <b className="text-white/90">{ctrl.telemetry.totalWords}</b> Words ({ctrl.telemetry.totalBalloons} Balloons)
          </span>

          <span className="text-white/15 hidden sm:inline">·</span>

          <span className="text-white/55 font-semibold hidden sm:flex items-center gap-1 shrink-0">
            <Clock size={11} className="text-[#06D6A0]" />
            Est. <b className="text-white/90">{ctrl.telemetry.estimatedReadTimeStr}</b>
          </span>
        </div>

        {/* Center: Mini Transport Scrubber & Play Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => ctrl.setCurrentTimeSec(0)}
            className="grid place-items-center w-6 h-6 rounded-[6px] text-white/65 hover:text-white bg-white/[0.05] hover:bg-white/[0.1]"
            title="Restart Panel Timeline"
          >
            <SkipBack size={11} />
          </button>

          <button
            onClick={() => ctrl.setIsPlaying((p) => !p)}
            className="h-6 px-2.5 rounded-[6px] text-[.62rem] font-extrabold text-white flex items-center gap-1"
            style={{
              background: ctrl.isPlaying
                ? 'var(--pj-cyan, #00DAF3)'
                : 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))',
              color: ctrl.isPlaying ? '#06141a' : '#fff',
            }}
          >
            {ctrl.isPlaying ? <Pause size={10} /> : <Play size={10} />}
            <span>{ctrl.isPlaying ? 'Pause' : `Play P${activePanel?.order || 1}`}</span>
          </button>

          <input
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={ctrl.currentTimeSec}
            onChange={(e) => ctrl.setCurrentTimeSec(+e.target.value)}
            className="w-20 hidden md:block"
            style={{ accentColor: 'var(--pj-magenta, #D40055)' }}
          />

          <span className="font-mono text-[.62rem] text-white/60 tabular-nums">
            <b className="text-[#8ff5ff]">{ctrl.currentTimeSec.toFixed(1)}s</b> / {duration.toFixed(1)}s
          </span>

          <button
            onClick={ctrl.triggerPanelVoiceSynth}
            className="grid place-items-center w-6 h-6 rounded-[6px] text-white/65 hover:text-white bg-white/[0.05] hover:bg-white/[0.1]"
            title="Preview Panel Dialogue Voice Synth"
          >
            <Volume2 size={11} className="text-[#D0BCFF]" />
          </button>
        </div>

        {/* Right: Sync Mode Pill + Expand/Collapse Timeline Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() =>
              ctrl.setTimelineSyncMode((m) => (m === 'inview' ? 'selected' : 'inview'))
            }
            className="h-6 px-2 rounded-[6px] text-[.6rem] font-bold hidden lg:flex items-center gap-1 text-white/75 bg-white/[0.05] hover:bg-white/[0.1] border border-white/10"
            title="Toggle between In-View Scroll Auto-Switch and Selected Panel Lock"
          >
            {ctrl.timelineSyncMode === 'inview' ? (
              <>
                <Eye size={11} className="text-[#00DAF3]" /> In-View Sync
              </>
            ) : (
              <>
                <Target size={11} className="text-[#D40055]" /> Selected Lock
              </>
            )}
          </button>

          <button
            onClick={() => ctrl.setTimelineExpanded((v) => !v)}
            className="h-6 px-2.5 rounded-[6px] text-[.62rem] font-bold flex items-center gap-1 transition-colors"
            style={
              ctrl.timelineExpanded
                ? {
                    background: 'rgba(0,218,243,0.16)',
                    border: '1px solid rgba(0,218,243,0.45)',
                    color: '#8ff5ff',
                  }
                : {
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.85)',
                  }
            }
          >
            <Film size={11} className="text-[#00DAF3]" />
            <span>{ctrl.timelineExpanded ? 'Minimize Bar' : 'Expand Timeline'}</span>
            {ctrl.timelineExpanded ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </button>
        </div>
      </div>
    </div>
  );
};
