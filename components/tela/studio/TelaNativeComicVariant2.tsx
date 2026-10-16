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

export type ComicActiveToolId =
  | 'select'
  | 'knife'
  | 'gpen'
  | 'balloon'
  | 'sfx'
  | 'screentone'
  | 'motion';

export type TimelineSyncMode = 'selected' | 'inview';

export type PanelLayoutPresetId =
  | 'action-4-grid'
  | 'manga-5-dynamic'
  | 'widescreen-3-tier'
  | 'storybook-2-spread';

export type BalloonSafeDockZone =
  | 'top-left'
  | 'top-gutter-flush'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-gutter-flush'
  | 'bottom-right';

export interface SpeechBalloonItem {
  id: string;
  speaker: string;
  text: string;
  style: 'SPEECH' | 'THOUGHT' | 'SHOUT' | 'NARRATION_CAPTION';
  dockZone: BalloonSafeDockZone;
  xPct: number;
  yPct: number;
  widthPct: number;
  tailTargetXPct: number;
  tailTargetYPct: number;
}

export interface KanjiSfxItem {
  id: string;
  kanji: string;
  romaji: string;
  meaning: string;
  xPct: number;
  yPct: number;
  scale: number;
  rotationDeg: number;
  colorHex: string;
  strokeHex: string;
}

export interface HalftoneLayerConfig {
  enabled: boolean;
  dotsPerInch: number;
  opacity: number;
  colorHex: string;
}

export interface PanelKeyframeItem {
  id: string;
  timeSec: number;
  scale: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
}

export interface PanelSubLayer {
  id: string;
  name: string;
  kind:
    | 'BACKGROUND_PLATE'
    | 'MIDGROUND_DEPTH'
    | 'CHARACTER_CAST'
    | 'INK_DRAWING'
    | 'SCREENTONE_SHADER'
    | 'KANJI_SFX'
    | 'SPEECH_BALLOONS';
  visible: boolean;
  locked: boolean;
  keyframes: PanelKeyframeItem[];
}

export interface NestedPanelTelaDocument {
  id: string;
  timelineDurationSec: number;
  cinemagraphPreset: CinemagraphEffectType;
  halftone: HalftoneLayerConfig;
  layers: PanelSubLayer[];
  inkStrokes: {
    id: string;
    brushId: string;
    colorHex: string;
    sizePx: number;
    opacity: number;
    svgPath: string;
  }[];
  balloons: SpeechBalloonItem[];
  sfxItems: KanjiSfxItem[];
}

export interface ComicPanelNode {
  id: string;
  order: number;
  cameraShot:
    | 'ESTABLISHING_WIDE'
    | 'MEDIUM_ACTION'
    | 'LOW_ANGLE_HERO'
    | 'HIGH_ANGLE_TENSION'
    | 'CLOSE_UP'
    | 'EXTREME_CLOSE_UP';
  prompt: string;
  narrativeCaption?: string;
  renderedImageUrl?: string;
  box: {
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
    clipPolygon?: { xPct: number; yPct: number }[];
  };
  nestedDocument: NestedPanelTelaDocument;
}

export interface ComicPageDocument {
  id: string;
  title: string;
  presetId: PanelLayoutPresetId;
  gutterPx: number;
  paperColorHex: string;
  panels: ComicPanelNode[];
}

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

export const LIVING_SHOWCASE_BOOKS = [
  { id: 'cyber-ronin-manga', title: 'Neon Ronin: Oberon Protocol', category: 'Cyberpunk Graphic Novel' },
  { id: 'pumpkin-patch-v4', title: 'The Whispering Pumpkin Patch', category: 'Interactive Living Storybook' },
  { id: 'starlight-atlas', title: 'Starlight Atlas: Deep Orbit', category: 'Widescreen Sci-Fi Comic' },
];

const SAMPLE_PANEL_ART = [
  'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=900&q=80',
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

  const sampleDialogues = [
    { speaker: 'KAEL', text: 'The sun is breaking through the canopy—stay on the trail!' },
    { speaker: 'ARIA', text: 'Wait—do you hear the hounds ahead?' },
    { speaker: 'KAEL', text: 'Hold the ridge. They are tracking the lantern glow.' },
    { speaker: 'NARRATOR', text: 'Beneath the golden pines, four shadows moved as one.' },
    { speaker: 'ARIA', text: 'Signal locked. Opening the dimensional gate now!' },
  ];

  const panels: ComicPanelNode[] = boxes.map((box, idx) => {
    const order = idx + 1;
    const shot = shots[idx % shots.length];
    const safe = computeSafeBalloonPlacement(
      shot === 'CLOSE_UP' ? 'close_up' : shot === 'EXTREME_CLOSE_UP' ? 'extreme_close_up' : 'medium',
      idx,
      []
    );
    const dlg = sampleDialogues[idx % sampleDialogues.length];

    return {
      id: `panel_p${pageNumber}_${order}_${Math.random().toString(36).slice(2, 6)}`,
      order,
      cameraShot: shot,
      prompt: `Scene panel ${order} — ${shot.replace(/_/g, ' ').toLowerCase()}`,
      renderedImageUrl: SAMPLE_PANEL_ART[(pageNumber + idx) % SAMPLE_PANEL_ART.length],
      box,
      nestedDocument: {
        id: `nested_p${pageNumber}_${order}`,
        timelineDurationSec: 5.0,
        cinemagraphPreset: idx === 1 ? 'falling_rain' : 'none',
        halftone: {
          enabled: presetId === 'manga-5-dynamic' && idx % 2 === 1,
          dotsPerInch: 60,
          opacity: 0.24,
          colorHex: '#000000',
        },
        layers: createDefaultLayersForPanel(order),
        inkStrokes: [],
        balloons: [
          {
            id: `bal_init_${pageNumber}_${order}`,
            speaker: dlg.speaker,
            text: dlg.text,
            style: dlg.speaker === 'NARRATOR' ? 'NARRATION_CAPTION' : 'SPEECH',
            dockZone: shot === 'CLOSE_UP' ? 'bottom-gutter-flush' : 'top-left',
            xPct: safe.xPct,
            yPct: safe.yPct,
            widthPct: safe.widthPct,
            tailTargetXPct: 50,
            tailTargetYPct: 48,
          },
        ],
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

function instantiateLivingShowcaseBook(bookId: string): ComicPageDocument[] {
  if (bookId === 'pumpkin-patch-v4') {
    return [
      createComicPageFromPreset('storybook-2-spread', 1, 'Page 1 — The Whispering Pumpkin Patch'),
      createComicPageFromPreset('action-4-grid', 2, 'Page 2 — Lanterns in the Briars'),
    ];
  }
  if (bookId === 'starlight-atlas') {
    return [
      createComicPageFromPreset('widescreen-3-tier', 1, 'Page 1 — Orbital Approach'),
      createComicPageFromPreset('action-4-grid', 2, 'Page 2 — Bridge Telemetry'),
    ];
  }
  return [
    createComicPageFromPreset('action-4-grid', 1, 'Page 1 — Golden Forest Trail'),
    createComicPageFromPreset('manga-5-dynamic', 2, 'Page 2 — Cyberpunk Rooftop Stand'),
  ];
}

function evaluateKeyframesAtTime(keyframes: PanelKeyframeItem[], timeSec: number) {
  if (!keyframes || keyframes.length === 0) {
    return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  }
  const sorted = [...keyframes].sort((a, b) => a.timeSec - b.timeSec);
  if (timeSec <= sorted[0].timeSec) return sorted[0];
  const last = sorted[sorted.length - 1];
  if (timeSec >= last.timeSec) return last;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (timeSec >= a.timeSec && timeSec <= b.timeSec) {
      const span = Math.max(0.001, b.timeSec - a.timeSec);
      const t = (timeSec - a.timeSec) / span;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        scale: a.scale + (b.scale - a.scale) * t,
        rotation: a.rotation + (b.rotation - a.rotation) * t,
        opacity: a.opacity + (b.opacity - a.opacity) * t,
      };
    }
  }
  return last;
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

export function useTelaComicVariant2Controller(extraDocWords = 0): TelaComicVariant2Controller {
  const [selectedShowcaseBookId, setSelectedShowcaseBookId] = useState<string>(
    LIVING_SHOWCASE_BOOKS[0].id
  );
  const [pages, setPages] = useState<ComicPageDocument[]>(() =>
    instantiateLivingShowcaseBook(LIVING_SHOWCASE_BOOKS[0].id)
  );

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

  const [balloonDraftText, setBalloonDraftText] = useState<string>(
    'We hold the high ground—keep your eyes on the signal!'
  );
  const [balloonDraftSpeaker, setBalloonDraftSpeaker] = useState<string>('Kael');
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

  const loadShowcaseBook = useCallback((bookId: string) => {
    setSelectedShowcaseBookId(bookId);
    const loaded = instantiateLivingShowcaseBook(bookId);
    if (loaded.length > 0) {
      setPages(loaded);
      setActivePageId(loaded[0].id);
      if (loaded[0].panels[0]) {
        setActivePanelId(loaded[0].panels[0].id);
      }
      setDeepFocusPanelId(null);
      setCurrentTimeSec(0);
    }
  }, []);

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

  const applyPageGridPreset = useCallback(
    (presetId: PanelLayoutPresetId) => {
      const pageNum = pages.findIndex((p) => p.id === activePage?.id) + 1;
      const fresh = createComicPageFromPreset(presetId, pageNum || 1, activePage?.title);
      updateActivePage((oldPage) => ({
        ...fresh,
        id: oldPage.id,
      }));
      if (fresh.panels[0]) {
        setActivePanelId(fresh.panels[0].id);
      }
    },
    [pages, activePage?.id, activePage?.title, updateActivePage]
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
      const textToUse = (customText ?? balloonDraftText).trim() || 'Hold position!';
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
        speaker: balloonDraftSpeaker || 'Speaker',
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
  };
}

// ============================================================================
// 1. LEFT RAIL COMIC TOOL CLUSTER (Exact Tela railBtn(active) 38x38 styling)
// ============================================================================
export const TelaComicLeftRailCluster: React.FC<{
  ctrl: TelaComicVariant2Controller;
  comicModeActive: boolean;
  onEnableComicMode: () => void;
}> = ({ ctrl, comicModeActive, onEnableComicMode }) => {
  const railBtn = (active: boolean): React.CSSProperties => ({
    display: 'grid',
    placeItems: 'center',
    width: 38,
    height: 38,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    color: active ? '#fff' : 'rgba(255,255,255,0.5)',
    background: active
      ? 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))'
      : 'transparent',
  });

  const tools: {
    id: ComicActiveToolId;
    icon: React.ReactNode;
    label: string;
  }[] = [
    {
      id: 'select',
      icon: <LayoutGrid size={17} color={comicModeActive && ctrl.activeTool === 'select' ? '#fff' : '#D0BCFF'} />,
      label: 'Comic Panel Select & Grid Layout (V)',
    },
    {
      id: 'knife',
      icon: <Scissors size={17} color={comicModeActive && ctrl.activeTool === 'knife' ? '#fff' : '#FF8C00'} />,
      label: 'Panel Gutter Knife Split (K)',
    },
    {
      id: 'gpen',
      icon: <PenTool size={17} color={comicModeActive && ctrl.activeTool === 'gpen' ? '#fff' : '#f472b6'} />,
      label: 'Mangaka G-Pen & Maru-Pen Inker (B)',
    },
    {
      id: 'balloon',
      icon: <MessageSquarePlus size={17} color={comicModeActive && ctrl.activeTool === 'balloon' ? '#fff' : '#00DAF3'} />,
      label: 'Safe-Zone Speech Balloon & Tail (T)',
    },
    {
      id: 'sfx',
      icon: <Zap size={17} color={comicModeActive && ctrl.activeTool === 'sfx' ? '#fff' : '#f59e0b'} />,
      label: 'Kanji & Action SFX Vector Stamp (S)',
    },
    {
      id: 'screentone',
      icon: <Grid3X3 size={17} color={comicModeActive && ctrl.activeTool === 'screentone' ? '#fff' : '#a78bfa'} />,
      label: '60 LPI Manga Screentone Shader (H)',
    },
    {
      id: 'motion',
      icon: <Film size={17} color={comicModeActive && (ctrl.activeTool === 'motion' || ctrl.timelineExpanded) ? '#fff' : '#06D6A0'} />,
      label: 'Panel Motion Timeline & Cinemagraph FX (M)',
    },
  ];

  return (
    <>
      {tools.map((t) => {
        const isActive =
          comicModeActive &&
          (ctrl.activeTool === t.id || (t.id === 'motion' && ctrl.timelineExpanded));
        return (
          <button
            key={t.id}
            title={t.label}
            style={railBtn(isActive)}
            onClick={() => {
              if (!comicModeActive) onEnableComicMode();
              if (t.id === 'motion') {
                ctrl.setTimelineExpanded((v) => !v);
              }
              ctrl.setActiveTool(t.id);
            }}
          >
            {t.icon}
          </button>
        );
      })}
    </>
  );
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
        const pageH = Math.round(1040 * zoom);

        return (
          <div
            key={page.id}
            className="flex flex-col items-center"
            onPointerDownCapture={() => {
              if (ctrl.activePageId !== page.id) ctrl.setActivePageId(page.id);
            }}
          >
            {/* Exact Tela Page Header Strip (Matches TelaView.tsx lines 3300-3340) */}
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
                  (Comic Page · {page.panels.length} Panels)
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
                  {PANEL_LAYOUT_PRESETS.map((pr) => (
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

            {/* Exact Tela Page Surface (Matches TelaView.tsx lines 3343-3357 & TelaImage.tsx lines 849-1033) */}
            <div
              onClick={() => ctrl.setActivePageId(page.id)}
              style={{
                width: pageW,
                height: pageH,
                background: page.paperColorHex || '#FFFFFF',
                borderRadius: 4,
                boxShadow: isPageActive
                  ? '0 0 0 2px var(--pj-magenta, #D40055), 0 20px 50px rgba(0,0,0,0.65)'
                  : '0 10px 30px rgba(0,0,0,0.45)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* On-Page Top-Left Floating Tool Pill (Exact match to TelaImage.tsx line 850 in user's screenshot!) */}
              {isPageActive && (
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
              {isPageActive && ctrl.showOnCanvasLayersCard && ctrl.activePanel && (
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

              {/* Comic Panels Grid inside the Page Surface */}
              {page.panels.map((panel) => {
                const isPanelActive =
                  isPageActive && panel.id === ctrl.activePanel?.id;
                const clipPoly =
                  panel.box.clipPolygon && panel.box.clipPolygon.length >= 3
                    ? `polygon(${panel.box.clipPolygon
                        .map((pt) => `${pt.xPct}% ${pt.yPct}%`)
                        .join(', ')})`
                    : undefined;

                return (
                  <div
                    key={panel.id}
                    style={{
                      position: 'absolute',
                      left: `${panel.box.xPct}%`,
                      top: `${panel.box.yPct}%`,
                      width: `${panel.box.widthPct}%`,
                      height: `${panel.box.heightPct}%`,
                      padding: `${Math.max(3, page.gutterPx / 2)}px`,
                      boxSizing: 'border-box',
                      clipPath: clipPoly,
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
            </div>
          </div>
        );
      })}

      {/* Exact Tela Bottom "+ Add Page" Strip (Matches TelaView.tsx lines 3388-3410) */}
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
    </div>
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
  const bgLayer = panel.nestedDocument.layers.find((l) => l.kind === 'BACKGROUND_PLATE');
  const bgTransform = useMemo(() => {
    if (!bgLayer || !bgLayer.keyframes.length) {
      return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
    }
    const timeToEval = isActive ? ctrl.currentTimeSec : 0;
    return evaluateKeyframesAtTime(bgLayer.keyframes, timeToEval);
  }, [bgLayer, isActive, ctrl.currentTimeSec]);

  // Freehand G-Pen Sketchbook pointer handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    ctrl.setActivePageId(page.id);
    ctrl.setActivePanelId(panel.id);

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
      ctrl.addKanjiSfxStamp(Math.floor(Math.random() * KANJI_SFX_PRESET_LIBRARY.length));
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
    if (!isDrawingRef.current || ctrl.activeTool !== 'gpen') return;
    const rect = e.currentTarget.getBoundingClientRect();
    currentPtsRef.current.push({
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * 1000,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * 1000,
    });
  };

  const handlePointerUp = () => {
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

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!isDeepFocus) ctrl.setDeepFocusPanelId(panel.id);
      }}
      className="w-full h-full relative overflow-hidden select-none transition-shadow"
      style={{
        background: '#120e1a',
        border: isActive
          ? '2.5px solid var(--pj-magenta, #D40055)'
          : '2px solid #09080d',
        boxShadow: isActive
          ? '0 0 0 1px rgba(212,0,85,0.4), inset 0 0 18px rgba(212,0,85,0.16)'
          : 'none',
        cursor:
          ctrl.activeTool === 'gpen'
            ? 'crosshair'
            : ctrl.activeTool === 'knife'
            ? 'col-resize'
            : 'pointer',
      }}
    >
      {/* 1. Background Art Plate with Motion Keyframe Transform */}
      {panel.renderedImageUrl && bgLayer?.visible !== false && (
        <img
          src={panel.renderedImageUrl}
          alt={panel.prompt}
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{
            transform: `translate(${bgTransform.x}px, ${bgTransform.y}px) scale(${bgTransform.scale}) rotate(${bgTransform.rotation}deg)`,
            opacity: bgTransform.opacity,
            transition: ctrl.isPlaying ? 'none' : 'transform 0.15s ease-out',
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

      {/* 5. Kanji & Manga Action SFX Stamps */}
      {panel.nestedDocument.sfxItems.map((sfx) => (
        <div
          key={sfx.id}
          className="absolute pointer-events-none select-none font-black"
          style={{
            left: `${sfx.xPct}%`,
            top: `${sfx.yPct}%`,
            transform: `translate(-50%, -50%) scale(${sfx.scale}) rotate(${sfx.rotationDeg}deg)`,
            color: sfx.colorHex,
            WebkitTextStroke: `1.5px ${sfx.strokeHex}`,
            textShadow: '0 4px 14px rgba(0,0,0,0.65)',
            fontSize: isDeepFocus ? '2.2rem' : '1.35rem',
            lineHeight: 1,
          }}
        >
          <div>{sfx.kanji}</div>
          <div className="text-[9px] tracking-widest uppercase text-center text-white/90">
            {sfx.romaji}
          </div>
        </div>
      ))}

      {/* 6. Safe-Zone Speech Balloons & Directional Tails (5 Non-Negotiable Rules) */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 18 }}
      >
        {panel.nestedDocument.balloons.map((b) => {
          if (b.style === 'NARRATION_CAPTION') return null;
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
        const isShout = b.style === 'SHOUT';
        const isThought = b.style === 'THOUGHT';
        return (
          <div
            key={b.id}
            onClick={(e) => {
              e.stopPropagation();
              ctrl.setActivePageId(page.id);
              ctrl.setActivePanelId(panel.id);
              ctrl.setInspectorSection('balloon');
            }}
            style={{
              position: 'absolute',
              left: `${b.xPct}%`,
              top: `${b.yPct}%`,
              width: `${b.widthPct}%`,
              zIndex: 20,
              background: isCaption ? 'rgba(18, 13, 28, 0.94)' : '#ffffff',
              color: isCaption ? '#f8fafc' : '#120d1c',
              border: isShout
                ? '2px solid #D40055'
                : isCaption
                ? '1px solid rgba(208, 188, 255, 0.45)'
                : '1.5px solid #120d1c',
              borderRadius: isCaption ? 4 : isThought ? 999 : 12,
              padding: isDeepFocus ? '8px 12px' : '6px 9px',
              fontSize: isDeepFocus ? '12px' : '10.5px',
              fontWeight: 600,
              lineHeight: 1.3,
              boxShadow: '0 8px 20px rgba(0,0,0,0.38)',
            }}
          >
            {b.speaker && !isCaption && (
              <div
                style={{
                  fontSize: '8.5px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#D40055',
                  marginBottom: 2,
                }}
              >
                {b.speaker}
              </div>
            )}
            <div>{b.text}</div>
          </div>
        );
      })}

      {/* 7. Bottom-Left Subtle Panel Number Pill (When Unselected) */}
      {!isActive && (
        <div
          className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-extrabold text-white/75 pointer-events-none"
          style={{
            background: 'rgba(14,10,22,0.82)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          P{panel.order}
        </div>
      )}

      {/* 8. Variant 2 Magnetic Panel HUD (Only shown on the Active Panel, styled like Tela dark glass pills) */}
      {isActive && (
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
              P{panel.order}
            </span>
            <span className="text-[9.5px] font-bold text-white/90 truncate">
              {panel.cameraShot.replace(/_/g, ' ')}
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
// 3. SPLIT RIGHT INSPECTOR (100% Real Tela Right Sidebar Design Language)
// ============================================================================
export const TelaComicSplitRightInspector: React.FC<{
  ctrl: TelaComicVariant2Controller;
}> = ({ ctrl }) => {
  const activePanel = ctrl.activePanel;
  const nestedDoc = activePanel?.nestedDocument;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden select-none text-white">
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
            {PANEL_LAYOUT_PRESETS.map((pr) => (
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

            <div>
              <div className={panelLbl}>Editable Living Book Template</div>
              <select
                value={ctrl.selectedShowcaseBookId}
                onChange={(e) => ctrl.loadShowcaseBook(e.target.value)}
                className="mt-1.5 w-full h-8 px-2.5 rounded-[8px] text-[.68rem] text-white/85 outline-none"
                style={telaSelectStyle}
              >
                {LIVING_SHOWCASE_BOOKS.map((bk) => (
                  <option key={bk.id} value={bk.id}>
                    {bk.title} ({bk.category})
                  </option>
                ))}
              </select>
            </div>
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
