/**
 * components/tela/studio/ComicMangaCreatorStudio.tsx
 * 
 * Master Sequential & Storybook Creator Studio for the Tela Document Paradigm.
 * 
 * Dual Architecture:
 * 1. ⚡ MASTER SEQUENTIAL STUDIO (Combining Design 1 Spatial Pro + Design 3 Mangaka Webtoon Desk + Lorea Authoring):
 *    - Graphic novels, Western superhero comics, Shonen/Shojo manga, 4-Koma, and Webtoon vertical scroll streams.
 *    - Lorea comic book & manga authoring integration: chapter script parser, auto-flow speech balloons/captions/SFX
 *      onto panels, character image auto-filling from Character Bible, and one-click Lorea/Fabula handoff import.
 *    - Autodesk Sketchbook & Clip Studio Paint level drawing engine: G-Pen, Maru Pen, 2B pencil, Copic marker,
 *      watercolor wash, airbrush, streamline EMA smoothing (0-95%), perspective vanishing lines (1/2/3 pt),
 *      and real-time symmetry Y-mirror drawing.
 *    - Floating Radial Brush Puck on the canvas for instant brush size/opacity adjustment.
 *    - Authentic Japanese Kanji onomatopoeia stamps (ドーン, ゴゴゴ, バキッ, ズズズ, パチパチ, ガン) with vertical typography.
 *    - 60 LPI Screentone shader overlays (halftone dot matrix, speedlines, radial bursts), B/W Manga vs Color Comic toggle.
 *    - Diagonal slash panel cutter tool for dynamic action panels.
 *    - Pumpkin Patch v4 benchmark parity: procedural cinemagraph weather particles, looping video panels,
 *      voice acting takes via Plajah Audio Core, Ken Burns action camera motions, and a bottom Multi-Track Motion Timeline scrubber.
 *    - In-panel free transforms (zoom, pan, rotation, flip horizontal) and PAI Gallery injection.
 * 
 * 2. 🌟 STORY MAGIC FOLIO (Design 2 Iteration: Specialized Storybook Authoring with Full Document Context Awareness):
 *    - Document Context Awareness: Analyzes active Tela Document story/chapters, detects chapter boundaries,
 *      evaluates reading difficulty tier (Early Reader Ages 3-6, Storybook Ages 7-9, Middle Grade Ages 10-12),
 *      and tracks word counts and narrative pacing.
 *    - Open 2-Page Storybook Folio Spread:
 *      * Left Page: Large picture book illustration with gentle floating starlight/firefly cinemagraph particles,
 *        crayon speech bubble, dropped character stickers, and inking/coloring layer.
 *      * Right Page: Story reading prose editor with chapter titles, typography tuning, and "🎙️ Read Aloud with Warm Voice" narration.
 *      * "✨ Magic Story Wand": Auto-decomposes document chapters into ready-to-render picture book spreads.
 *    - Character Cast & Sticker Bar: Directly pulls characters from the document lore, enabling drag-and-drop
 *      stickers onto illustration spreads with automatic dialogue bubbles and synthesized voice takes.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  Sparkles,
  Palette,
  Layers,
  Type,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Wand2,
  User,
  Image as ImageIcon,
  PenTool,
  Compass,
  Eye,
  Download,
  Film,
  FileText,
  RotateCw,
  FlipHorizontal,
  ZoomIn,
  Move,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Check,
  Plus,
  Trash2,
  Sliders,
  Maximize2,
  MessageSquare,
  HelpCircle,
  LayoutGrid,
  Zap,
  Smile,
  Shield,
  Sun,
  Camera,
  Video,
  Clapperboard,
  Mic,
  Activity,
  Radio,
  Flame,
  CloudRain,
  Scissors,
  RefreshCw,
  Bookmark,
  Sparkle
} from 'lucide-react';

import {
  ComicMangaPage,
  ComicEnginePanel,
  ComicVectorBalloon,
  comicMangaPageEngine,
} from '../../../services/comic/comicMangaPageEngine';
import {
  PANEL_LAYOUT_TEMPLATES,
  LAYOUT_TEMPLATE_LIST,
  SPEECH_BUBBLE_PRESETS,
  SPEECH_BUBBLE_LIST,
  SFX_PRESETS,
  SfxWordPreset,
  SKETCHBOOK_BRUSH_PRESETS,
  SKETCHBOOK_BRUSH_LIST,
  PerspectiveGuideMode,
} from '../../../services/comic/comicMangaTemplateLibrary';
import {
  conveneComicStoryCouncil,
  AudienceTier,
  CouncilSynthesisVerdict,
} from '../../../services/council/comicStoryCouncilBridge';
import {
  decomposeProseToComicBeats,
  buildPageFromStoryBeats,
  exportComicToFountainScreenplay,
  exportComicToFabulaAnimatic,
  pullWorldCastAndLore,
  DEFAULT_PANEL_IMAGE_TRANSFORM,
  PanelImageTransform,
  checkLoreaPendingHandoff,
  consumeLoreaHandoff,
  flowLoreaScriptToPage,
  analyzeStorybookDocumentContext,
  type StorybookContextAnalysis,
  type StorybookPageSpread,
} from '../../../services/comic/storyIntelligenceBridge';
import {
  CINEMAGRAPH_PRESETS,
  ACTION_MOTION_PRESETS,
  DEFAULT_PANEL_MOTION_CONFIG,
  PanelMotionConfig,
  CinemagraphEffectType,
  PanelActionMotionType,
  PanelMediaType,
  createCinemagraphParticles,
  renderCinemagraphFrame,
  synthesizePanelVoiceTake,
  Particle,
} from '../../../services/comic/panelMotionEngine';
import {
  subscribePaiGenerations,
  type PaiGenerationItem,
} from '../../../services/localAi/paiGenerationHistory';
import { proceduralFoley } from '../../../services/audio/proceduralFoleyEngine';
import { streamlineSmooth, InkPoint } from '../../../services/tela/telaInkEngine';

interface ComicMangaCreatorStudioProps {
  initialProseStory?: string;
  initialTitle?: string;
  onClose?: () => void;
  onInsertIntoTelaDoc?: (page: ComicMangaPage) => void;
  onExportToFabulaVideo?: (animaticShots: any[]) => void;
}

export type PrimaryStudioMode = 'MASTER_SEQUENTIAL' | 'STORY_FOLIO';
export type SequentialViewMode = 'PAGE_GRID' | 'WEBTOON_STREAM';
type StudioTab = 'TEMPLATES' | 'MOTION_CINEMAGRAPH' | 'LOREA_SCRIPT' | 'BUBBLES' | 'SFX' | 'BRUSHES' | 'WORLD_CAST' | 'PAI_GALLERY' | 'STORY_MAGIC' | 'COUNCIL';

// Japanese Manga Onomatopoeia SFX Stamps
const JAPANESE_SFX_STAMPS = [
  { kanji: 'ドーン', romaji: 'DOOON', label: 'Heavy Impact / Climax', color: '#ff3366', extrusion: '#800020' },
  { kanji: 'ゴゴゴ', romaji: 'GOGOGO', label: 'Menacing Rumble', color: '#a855f7', extrusion: '#3b0764' },
  { kanji: 'バキッ', romaji: 'BAKI', label: 'Loud Crack / Punch', color: '#f59e0b', extrusion: '#78350f' },
  { kanji: 'ズズズ', romaji: 'ZUZUZU', label: 'Heavy Drag / Slither', color: '#00daf3', extrusion: '#083344' },
  { kanji: 'パチパチ', romaji: 'PACHI', label: 'Sparks / Applause', color: '#38bdf8', extrusion: '#0c4a6e' },
  { kanji: 'シュッ', romaji: 'SHU', label: 'Rapid Dash / Slice', color: '#22c55e', extrusion: '#052e16' },
  { kanji: 'カッ', romaji: 'KAA', label: 'Blinding Flash', color: '#ffffff', extrusion: '#334155' },
];

// Built-in looping video clips for Video Panels
const DEMO_VIDEO_LOOPS = [
  { id: 'cyber_rain', label: 'Cyber Rain Alley', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
  { id: 'embers_flare', label: 'Floating Embers & Smoke', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4' },
  { id: 'motion_sweep', label: 'Neon City Pulse', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4' },
];

export const ComicMangaCreatorStudio: React.FC<ComicMangaCreatorStudioProps> = ({
  initialProseStory = '',
  initialTitle = 'The Pumpkin Patch: Sector Zero Chrono-Tale',
  onClose,
  onInsertIntoTelaDoc,
  onExportToFabulaVideo,
}) => {
  // ── 1. PRIMARY STUDIO MODES & VIEW MODES ──
  const [studioMode, setStudioMode] = useState<PrimaryStudioMode>('MASTER_SEQUENTIAL');
  const [sequentialView, setSequentialView] = useState<SequentialViewMode>('PAGE_GRID');
  const [isBlackAndWhite, setIsBlackAndWhite] = useState<boolean>(false);
  const [isScreentoneEnabled, setIsScreentoneEnabled] = useState<boolean>(false);
  const [screentonePattern, setScreentonePattern] = useState<'dots_fine' | 'speed_lines' | 'radial'>('dots_fine');
  const [radialPuckOpen, setRadialPuckOpen] = useState<boolean>(false);
  const [showCouncilDrawer, setShowCouncilDrawer] = useState<boolean>(false);

  // ── 2. AUDIENCE & COUNCIL STATE ──
  const audienceTier: AudienceTier = studioMode === 'STORY_FOLIO' ? 'JUNIOR_SCHOOL' : 'PRO_STUDIO';
  const [selectedArtLensId, setSelectedArtLensId] = useState<string>('DARK_NOIR');
  const [councilAdvice, setCouncilAdvice] = useState<CouncilSynthesisVerdict | null>(null);
  const [activeTab, setActiveTab] = useState<StudioTab>('MOTION_CINEMAGRAPH');

  // ── 3. PAGE & PANELS STATE ──
  const [activeLayoutId, setActiveLayoutId] = useState<string>('shonen_dynamic_5');
  const [page, setPage] = useState<ComicMangaPage>(() => {
    const p = comicMangaPageEngine.createPage({
      title: initialTitle,
      layoutId: 'dynamic_manga_5',
      stylePreset: 'graphic_novel_noir',
    });
    return p;
  });
  const [activePanelIdx, setActivePanelIdx] = useState<number>(0);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);

  // In-panel image transforms (zoom, pan, rotation, flip)
  const [panelTransforms, setPanelTransforms] = useState<Record<number, PanelImageTransform>>({});

  // ── 4. MOTION, CINEMAGRAPH & VIDEO PANEL STATE ──
  const [panelMotions, setPanelMotions] = useState<Record<number, PanelMotionConfig>>({
    0: {
      ...DEFAULT_PANEL_MOTION_CONFIG,
      enabled: true,
      cinemagraphEffect: 'falling_rain',
      actionMotion: 'ken_burns_zoom',
      voiceActingTake: {
        speakerName: 'Detective Silas Vane',
        emotion: 'whisper',
        transcript: 'Down here at the drain level, the air tastes like burnt copper and old lies.',
      },
    },
    1: {
      ...DEFAULT_PANEL_MOTION_CONFIG,
      enabled: true,
      cinemagraphEffect: 'floating_embers',
      actionMotion: 'camera_shake',
    },
  });

  // Cinemagraph Canvas Rendering Refs & Animation Loops
  const cinemagraphCanvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const particlePools = useRef<Record<number, Particle[]>>({});
  const [animatingPanelIdx, setAnimatingPanelIdx] = useState<number | null>(null);

  // Multi-Track Motion Timeline State
  const [timelineCurrentTime, setTimelineCurrentTime] = useState<number>(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState<boolean>(false);
  const timelineDuration = 12; // 12 seconds total loop

  // ── 5. DRAWING & INKING ENGINE (Autodesk Sketchbook Parity) ──
  const [activeTool, setActiveTool] = useState<'SELECT' | 'BRUSH' | 'ERASER' | 'BUBBLE' | 'SFX' | 'PAN'>('SELECT');
  const [selectedBrushId, setSelectedBrushId] = useState<string>('g_pen');
  const [brushColor, setBrushColor] = useState<string>('#ffffff');
  const [brushSize, setBrushSize] = useState<number>(4);
  const [brushOpacity, setBrushOpacity] = useState<number>(1.0);
  const [stabilizerSmoothing, setStabilizerSmoothing] = useState<number>(0.75);
  const [perspectiveMode, setPerspectiveMode] = useState<PerspectiveGuideMode>('OFF');

  // Canvas refs per panel for freehand inking
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const isDrawingRef = useRef(false);
  const currentStrokePoints = useRef<InkPoint[]>([]);

  // ── 6. LOREA COMIC & MANGA AUTHORING INTEGRATION ──
  const [loreaScriptText, setLoreaScriptText] = useState<string>(
    'PANEL 1: Detective Silas Vane stands in the flooded neon alleyway\nSILAS: Down here at the drain level, the air tastes like burnt copper.\n\nPANEL 2: Close-up on the glowing ocular eye\nSILAS: The orbital ciphers were cracked.\nSFX: BZZZZZT\n\nPANEL 3: Cathedral engines burst open with roaring fire\nCAPTION: Deep in Sector Zero, the chrono-portal ignites.\nSFX: KABOOOM'
  );
  const [loreaHandoffFound, setLoreaHandoffFound] = useState<any>(null);

  // ── 7. STORYBOOK DOCUMENT CONTEXT AWARENESS (Design 2: Story Magic Folio) ──
  const [storyInputText, setStoryInputText] = useState(
    initialProseStory ||
      'In the quiet magical clearing of Sector Zero, little Pippin the fox discovered a mysterious patch of glowing pumpkins.\n\n"Look at those giant amber pumpkins!" Sparky the friendly dragon whispered, his wings fluttering with excitement.\n\nSuddenly, the ancient clockwork stone began to chime! Soft golden light swept across the clearing as the portal opened.'
  );
  const [storybookContext, setStorybookContext] = useState<StorybookContextAnalysis>(() =>
    analyzeStorybookDocumentContext(storyInputText, initialTitle)
  );
  const [activeSpreadIndex, setActiveSpreadIndex] = useState<number>(0);
  const [isNarratingStory, setIsNarratingStory] = useState<boolean>(false);
  const [droppedStickers, setDroppedStickers] = useState<
    Array<{ id: string; name: string; emoji: string; quote: string; xPct: number; yPct: number }>
  >([
    { id: 'stk_1', name: 'Pippin Fox', emoji: '🦊', quote: 'Look at the glowing pumpkins!', xPct: 32, yPct: 42 },
    { id: 'stk_2', name: 'Sparky Dragon', emoji: '🐉', quote: 'The chrono-portal is opening!', xPct: 62, yPct: 56 },
  ]);

  // World Cast & PAI Gallery
  const [worldCast, setWorldCast] = useState<any[]>([]);
  const [selectedCharacterName, setSelectedCharacterName] = useState('Detective Silas Vane');
  const [paiItems, setPaiItems] = useState<PaiGenerationItem[]>([]);

  // Audio Playback
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioSpeechActiveId, setAudioSpeechActiveId] = useState<string | null>(null);
  const [voiceVoiceSynthesizing, setVoiceSynthesizing] = useState(false);

  // Convene Council on setting changes
  useEffect(() => {
    const verdict = conveneComicStoryCouncil({
      title: page.title,
      genre: page.stylePreset,
      storyPromptOrProse: storyInputText,
      audienceTier,
      selectedArtLensId,
    });
    setCouncilAdvice(verdict);
  }, [page.title, page.stylePreset, storyInputText, audienceTier, selectedArtLensId]);

  // Load World Cast, PAI Generations & Check Lorea Handoff on mount
  useEffect(() => {
    const { characters } = pullWorldCastAndLore();
    setWorldCast(characters);

    const unsub = subscribePaiGenerations((items) => {
      setPaiItems(items);
    });

    const pending = checkLoreaPendingHandoff();
    if (pending) {
      setLoreaHandoffFound(pending);
    }

    return () => unsub();
  }, []);

  // ── Multi-Track Motion Timeline Playback Loop ──
  useEffect(() => {
    if (!isTimelinePlaying) return;
    const interval = setInterval(() => {
      setTimelineCurrentTime((prev) => {
        const next = Math.round((prev + 0.1) * 10) / 10;
        if (next >= timelineDuration) {
          setIsTimelinePlaying(false);
          return 0;
        }
        // Sync active panel to timeline position
        const targetPanel = Math.floor((next / timelineDuration) * page.panels.length);
        if (targetPanel !== activePanelIdx && targetPanel < page.panels.length) {
          setActivePanelIdx(targetPanel);
          handleTriggerActionPanel(targetPanel);
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isTimelinePlaying, timelineDuration, page.panels.length, activePanelIdx]);

  // ── Cinemagraph Animation Loop ──
  useEffect(() => {
    let animId: number;
    let time = 0;

    const loop = () => {
      time++;
      page.panels.forEach((_, idx) => {
        const motion = panelMotions[idx];
        if (!motion || !motion.enabled || motion.cinemagraphEffect === 'none') return;
        const canvas = cinemagraphCanvasRefs.current[idx];
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (!particlePools.current[idx] || particlePools.current[idx].length === 0) {
          particlePools.current[idx] = createCinemagraphParticles(
            motion.cinemagraphEffect,
            canvas.width,
            canvas.height,
            45
          );
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderCinemagraphFrame(
          ctx,
          motion.cinemagraphEffect,
          particlePools.current[idx],
          canvas.width,
          canvas.height,
          motion.cinemagraphIntensity,
          time
        );
      });

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [page.panels, panelMotions]);

  // ── Layout Selection ──
  const handleSelectLayout = (layoutId: string) => {
    setActiveLayoutId(layoutId);
    const tmpl = PANEL_LAYOUT_TEMPLATES[layoutId] || PANEL_LAYOUT_TEMPLATES.grid_6_classic;
    const boxes = tmpl.createBoxes(1.2);

    const newPanels: ComicEnginePanel[] = boxes.map((box, idx) => {
      const existing = page.panels[idx];
      return {
        id: `panel_${Date.now()}_${idx}`,
        panelIndex: idx,
        box,
        cameraShot: existing?.cameraShot || 'medium',
        actionPrompt: existing?.actionPrompt || (idx === 0 ? 'Establishing view of the scene' : 'Action climax beat'),
        environmentPrompt: existing?.environmentPrompt,
        renderedImageUrl: existing?.renderedImageUrl,
        screentone: existing?.screentone || { enabled: isScreentoneEnabled, pattern: screentonePattern, opacity: 0.25 },
        balloons: existing?.balloons || [],
      };
    });

    setPage((prev) => ({
      ...prev,
      layoutId: layoutId as any,
      readingDirection: tmpl.readingDirection,
      panels: newPanels,
    }));
    setActivePanelIdx(0);
  };

  // ── Lorea Script & Handoff Actions ──
  const handleImportLoreaHandoff = () => {
    const handoff = consumeLoreaHandoff() || loreaHandoffFound;
    if (handoff) {
      if (handoff.script) {
        setLoreaScriptText(handoff.script);
        const updated = flowLoreaScriptToPage(page, handoff.script, handoff.characters || worldCast);
        setPage(updated);
      }
      setLoreaHandoffFound(null);
    }
  };

  const handleFlowLoreaScript = () => {
    const updated = flowLoreaScriptToPage(page, loreaScriptText, worldCast);
    setPage(updated);
  };

  // ── Diagonal Slash Tool ──
  const handleApplyDiagonalSlash = (panelIdx: number) => {
    const updatedPanels = [...page.panels];
    const target = updatedPanels[panelIdx];
    if (!target) return;
    const isSlashed = Boolean(target.box.clipPolygon);
    target.box = {
      ...target.box,
      clipPolygon: isSlashed ? undefined : 'polygon(0 0, 100% 12%, 100% 100%, 0 88%)',
    };
    setPage({ ...page, panels: updatedPanels });
  };

  // ── Motion Config Updater ──
  const updatePanelMotion = (panelIdx: number, updates: Partial<PanelMotionConfig>) => {
    setPanelMotions((prev) => {
      const current = prev[panelIdx] || { ...DEFAULT_PANEL_MOTION_CONFIG };
      const updated = { ...current, ...updates };
      if (updates.cinemagraphEffect && updates.cinemagraphEffect !== current.cinemagraphEffect) {
        particlePools.current[panelIdx] = [];
      }
      return { ...prev, [panelIdx]: updated };
    });
  };

  // In-Panel Image Transform handler
  const updateTransform = (panelIdx: number, updates: Partial<PanelImageTransform>) => {
    setPanelTransforms((prev) => ({
      ...prev,
      [panelIdx]: {
        ...(prev[panelIdx] || DEFAULT_PANEL_IMAGE_TRANSFORM),
        ...updates,
      },
    }));
  };

  // ── Trigger Action Panel Choreography ──
  const handleTriggerActionPanel = async (panelIdx: number) => {
    setActivePanelIdx(panelIdx);
    setAnimatingPanelIdx(panelIdx);

    const motion = panelMotions[panelIdx];

    // Foley impact
    try {
      const foleyRes = proceduralFoley.renderFoley({ presetId: 'impact' });
      const foleyAudio = new Audio(URL.createObjectURL(foleyRes.wavBlob));
      await foleyAudio.play();
    } catch {}

    // Voice take playback
    if (motion?.voiceActingTake?.audioUrl) {
      try {
        const audio = new Audio(motion.voiceActingTake.audioUrl);
        await audio.play();
      } catch {}
    } else if (page.panels[panelIdx]?.balloons.length) {
      const b = page.panels[panelIdx].balloons[0];
      try {
        setAudioSpeechActiveId(b.id);
        const res = await synthesizePanelVoiceTake({
          text: b.text,
          speakerName: b.speakerName || selectedCharacterName,
          emotion: 'urgent',
        });
        const audio = new Audio(res.audioUrl);
        audio.onended = () => setAudioSpeechActiveId(null);
        await audio.play();
      } catch {
        setAudioSpeechActiveId(null);
      }
    }

    setTimeout(() => {
      setAnimatingPanelIdx(null);
    }, 2400);
  };

  // ── Synthesize Character Voice Take ──
  const handleSynthesizeVoiceForPanel = async (panelIdx: number) => {
    const panel = page.panels[panelIdx];
    if (!panel) return;
    const textToSpeak = panel.balloons[0]?.text || panel.actionPrompt || 'We have to move now!';

    setVoiceSynthesizing(true);
    try {
      const res = await synthesizePanelVoiceTake({
        text: textToSpeak,
        speakerName: selectedCharacterName,
        emotion: 'urgent',
      });

      updatePanelMotion(panelIdx, {
        voiceActingTake: {
          audioUrl: res.audioUrl,
          speakerName: selectedCharacterName,
          transcript: textToSpeak,
          duration: res.duration,
          synthesizedBlob: res.audioBlob,
        },
      });

      const testAudio = new Audio(res.audioUrl);
      await testAudio.play();
    } catch (e) {
      console.error('Failed synthesizing voice take:', e);
    }
    setVoiceSynthesizing(false);
  };

  // ── Add Speech Bubble ──
  const handleAddBubble = (presetId: string) => {
    const preset = SPEECH_BUBBLE_PRESETS[presetId];
    if (!preset) return;

    const newBubble: ComicVectorBalloon = {
      id: `bubble_${Date.now()}`,
      type: preset.type,
      text: audienceTier === 'JUNIOR_SCHOOL' ? 'Look at that!' : 'The orbital ciphers were compromised three minutes ago...',
      speakerName: selectedCharacterName,
      xPct: 25,
      yPct: 20,
      tailDirection: 'bottom_left',
    };

    const updated = { ...page, panels: [...page.panels] };
    if (updated.panels[activePanelIdx]) {
      updated.panels[activePanelIdx].balloons = [
        ...updated.panels[activePanelIdx].balloons,
        newBubble,
      ];
      setPage(updated);
      setSelectedBubbleId(newBubble.id);
    }
  };

  // ── Add SFX Stamp ──
  const handleAddSfx = (sfx: SfxWordPreset | (typeof JAPANESE_SFX_STAMPS)[0]) => {
    const word = 'word' in sfx ? sfx.word : sfx.kanji;
    const color = 'defaultColor' in sfx ? sfx.defaultColor : sfx.color;
    const scale = 'defaultScale' in sfx ? sfx.defaultScale : 1.35;

    const newSfx: ComicVectorBalloon = {
      id: `sfx_${Date.now()}`,
      type: 'sfx',
      text: word,
      xPct: 50,
      yPct: 35,
      sfxColor: color,
      sfxScale: scale,
    };

    const updated = { ...page, panels: [...page.panels] };
    if (updated.panels[activePanelIdx]) {
      updated.panels[activePanelIdx].balloons = [
        ...updated.panels[activePanelIdx].balloons,
        newSfx,
      ];
      setPage(updated);
      setSelectedBubbleId(newSfx.id);
    }
  };

  // ── PAI Gallery Injection ──
  const handleInsertPaiToPanel = (paiItem: PaiGenerationItem) => {
    const updated = { ...page, panels: [...page.panels] };
    if (updated.panels[activePanelIdx]) {
      updated.panels[activePanelIdx].renderedImageUrl = paiItem.mediaUrl;
      updated.panels[activePanelIdx].actionPrompt = paiItem.prompt;
      setPage(updated);
      setPanelTransforms((prev) => ({
        ...prev,
        [activePanelIdx]: { ...DEFAULT_PANEL_IMAGE_TRANSFORM },
      }));
    }
  };

  // ── Story Magic Folio Actions (Design 2: Context-Aware Storybook Authoring) ──
  const handleMagicStoryWand = () => {
    const analyzed = analyzeStorybookDocumentContext(storyInputText, page.title);
    setStorybookContext(analyzed);
    setActiveSpreadIndex(0);

    // Apply first spread to panel 0
    if (analyzed.spreads[0]) {
      const updatedPanels = [...page.panels];
      if (updatedPanels[0]) {
        updatedPanels[0].actionPrompt = analyzed.spreads[0].leftPageIllustrationPrompt;
        updatedPanels[0].balloons = [
          {
            id: `bubble_st_${Date.now()}`,
            type: 'speech',
            text: analyzed.spreads[0].rightPageProse.slice(0, 90) + '...',
            speakerName: analyzed.spreads[0].featuredCharacters[0] || 'Storybook',
            xPct: 30,
            yPct: 25,
            tailDirection: 'bottom_left',
          },
        ];
      }
      setPage({ ...page, panels: updatedPanels });
    }
  };

  const handleNarrateSpread = async () => {
    const spread = storybookContext.spreads[activeSpreadIndex];
    if (!spread || isNarratingStory) return;
    setIsNarratingStory(true);
    try {
      const res = await synthesizePanelVoiceTake({
        text: spread.rightPageProse,
        speakerName: spread.featuredCharacters[0] || 'Storyteller',
        emotion: spread.suggestedVoiceMood === 'gentle_bedtime' ? 'whisper' : 'cheerful',
      });
      const audio = new Audio(res.audioUrl);
      audio.onended = () => setIsNarratingStory(false);
      await audio.play();
    } catch {
      setIsNarratingStory(false);
    }
  };

  const handleDropSticker = (char: (typeof storybookContext.cast)[0]) => {
    const newSticker = {
      id: `stk_${Date.now()}`,
      name: char.name,
      emoji: char.emoji,
      quote: char.quote,
      xPct: 20 + Math.random() * 50,
      yPct: 30 + Math.random() * 40,
    };
    setDroppedStickers((prev) => [...prev, newSticker]);

    // Synthesize quote
    synthesizePanelVoiceTake({
      text: char.quote,
      speakerName: char.name,
      emotion: 'cheerful',
    }).then((res) => {
      const audio = new Audio(res.audioUrl);
      audio.play().catch(() => {});
    });
  };

  // ── Drawing Events (Autodesk Sketchbook Parity + Symmetry Mirroring) ──
  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>, pIdx: number) => {
    if (activeTool !== 'BRUSH' && activeTool !== 'ERASER') return;
    const canvas = canvasRefs.current[pIdx];
    if (!canvas) return;

    isDrawingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 0.5;

    currentStrokePoints.current = [{ x, y, pressure, time: Date.now() }];
  };

  const drawMove = (e: React.PointerEvent<HTMLCanvasElement>, pIdx: number) => {
    if (!isDrawingRef.current || (activeTool !== 'BRUSH' && activeTool !== 'ERASER')) return;
    const canvas = canvasRefs.current[pIdx];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 0.5;

    currentStrokePoints.current.push({ x, y, pressure, time: Date.now() });

    // Streamline EMA smoothing
    const smoothed = streamlineSmooth(currentStrokePoints.current, stabilizerSmoothing);
    if (smoothed.length < 2) return;

    const brush = SKETCHBOOK_BRUSH_PRESETS[selectedBrushId] || SKETCHBOOK_BRUSH_PRESETS.g_pen;
    ctx.lineWidth = Math.max(1, brushSize * (pressure * (1 - brush.minWidthRatio) + brush.minWidthRatio));
    ctx.lineCap = brush.roundCap ? 'round' : 'square';
    ctx.lineJoin = 'round';

    if (activeTool === 'ERASER') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = brush.blendMode as GlobalCompositeOperation;
      ctx.strokeStyle = brushColor;
      ctx.globalAlpha = brushOpacity;
    }

    const p1 = smoothed[smoothed.length - 2];
    const p2 = smoothed[smoothed.length - 1];

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Symmetry Y-mirror drawing
    if (perspectiveMode === 'SYMMETRY_Y') {
      const mX1 = canvas.width - p1.x;
      const mX2 = canvas.width - p2.x;
      ctx.beginPath();
      ctx.moveTo(mX1, p1.y);
      ctx.lineTo(mX2, p2.y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    currentStrokePoints.current = [];
  };

  const handleClearDrawing = (pIdx: number) => {
    const canvas = canvasRefs.current[pIdx];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const activeMotion = panelMotions[activePanelIdx] || DEFAULT_PANEL_MOTION_CONFIG;
  const currentSpread = storybookContext.spreads[activeSpreadIndex] || storybookContext.spreads[0];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#090a0f',
        color: '#e2e8f0',
        fontFamily: studioMode === 'STORY_FOLIO' ? '"Comic Sans MS", "Chalkboard", system-ui, sans-serif' : 'Inter, system-ui, sans-serif',
        overflow: 'hidden',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* ── TOP HEADER & PRIMARY MODE SWITCHER ── */}
      <div
        className="glass-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(14, 16, 24, 0.85)',
          backdropFilter: 'blur(16px)',
          zIndex: 30,
        }}
      >
        {/* Brand & Studio Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '6px',
              borderRadius: '8px',
              background: studioMode === 'STORY_FOLIO' ? 'var(--pj-grad-ember)' : 'var(--pj-grad-brand)',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(107, 0, 153, 0.4)',
            }}
          >
            <BookOpen size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ letterSpacing: '-0.3px' }}>
                {studioMode === 'STORY_FOLIO'
                  ? '🌟 Story Magic Folio (Storybook Studio)'
                  : '⚡ Master Sequential Studio (Comics, Manga & Webtoons)'}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(0, 218, 243, 0.12)',
                  color: 'var(--pj-cyan)',
                  border: '1px solid rgba(0, 218, 243, 0.3)',
                  fontWeight: 600,
                }}
              >
                🎃 Pumpkin Patch v4 Parity
              </span>
            </div>
          </div>
        </div>

        {/* Primary Studio Mode Tabs (Unified 1 & 3 vs Design 2 Storybook) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: '#07080d',
              padding: '3px',
              borderRadius: '24px',
              border: '1px solid #232838',
            }}
          >
            {/* Mode A: Master Sequential Studio (Combines 1 & 3 + Lorea) */}
            <button
              onClick={() => {
                setStudioMode('MASTER_SEQUENTIAL');
                setActiveTab('MOTION_CINEMAGRAPH');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: studioMode === 'MASTER_SEQUENTIAL' ? 'var(--pj-grad-brand)' : 'transparent',
                color: studioMode === 'MASTER_SEQUENTIAL' ? '#fff' : '#94a3b8',
                boxShadow: studioMode === 'MASTER_SEQUENTIAL' ? '0 2px 10px rgba(212, 0, 85, 0.4)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Shield size={13} />
              <span>⚡ Master Sequential Studio</span>
            </button>

            {/* Mode B: Story Magic Folio (Design 2 Dedicated Storybooks) */}
            <button
              onClick={() => {
                setStudioMode('STORY_FOLIO');
                setActiveTab('STORY_MAGIC');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: studioMode === 'STORY_FOLIO' ? 'var(--pj-grad-ember)' : 'transparent',
                color: studioMode === 'STORY_FOLIO' ? '#000' : '#94a3b8',
                boxShadow: studioMode === 'STORY_FOLIO' ? '0 2px 10px rgba(255, 140, 0, 0.4)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Smile size={13} />
              <span>🌟 Story Magic Folio</span>
            </button>
          </div>

          {/* Lorea Pending Handoff Badge Button */}
          {loreaHandoffFound && (
            <button
              onClick={handleImportLoreaHandoff}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #00daf3 0%, #6b0099 100%)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 0 12px rgba(0, 218, 243, 0.5)',
              }}
            >
              <Bookmark size={13} />
              <span>Import Lorea Script!</span>
            </button>
          )}

          {/* Sequential Play Motion Comic */}
          <button
            onClick={() => setIsTimelinePlaying(!isTimelinePlaying)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '6px',
              backgroundColor: isTimelinePlaying ? '#ef4444' : '#22c55e',
              color: '#fff',
              fontWeight: 700,
              fontSize: '11px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: isTimelinePlaying ? '0 0 10px rgba(239, 68, 68, 0.5)' : 'none',
            }}
          >
            {isTimelinePlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{isTimelinePlaying ? 'Pause Timeline' : 'Play Motion Comic'}</span>
          </button>

          {/* Screenplay Fountain Export */}
          <button
            onClick={() => {
              const sc = exportComicToFountainScreenplay(page);
              const blob = new Blob([sc.fountainText], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${page.title.toLowerCase().replace(/\s+/g, '_')}_screenplay.fountain`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            title="Export Hollywood Screenplay (Fountain)"
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: '#1b1d28',
              color: '#cbd5e1',
              border: '1px solid #2d3348',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <FileText size={13} />
            <span>Screenplay</span>
          </button>

          {/* Insert to Tela Document */}
          <button
            onClick={() => onInsertIntoTelaDoc?.(page)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: 'var(--pj-grad-brand)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '11px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 10px rgba(107, 0, 153, 0.4)',
            }}
          >
            <Check size={14} />
            <span>Insert to Tela</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '18px',
                cursor: 'pointer',
                marginLeft: '8px',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── SECONDARY SUB-TOOLBAR & MANGA CONTROLS ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 18px',
          backgroundColor: '#0d0e14',
          borderBottom: '1px solid #1c202d',
          fontSize: '11px',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Tool Mode Buttons */}
          <button
            onClick={() => setActiveTool('SELECT')}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              backgroundColor: activeTool === 'SELECT' ? '#2563eb' : '#161922',
              color: activeTool === 'SELECT' ? '#fff' : '#94a3b8',
              border: '1px solid #272d3e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Move size={13} />
            <span>Select / Pan</span>
          </button>

          <button
            onClick={() => setActiveTool('BRUSH')}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              backgroundColor: activeTool === 'BRUSH' ? '#2563eb' : '#161922',
              color: activeTool === 'BRUSH' ? '#fff' : '#94a3b8',
              border: '1px solid #272d3e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <PenTool size={13} />
            <span>Sketchbook Inker</span>
          </button>

          <button
            onClick={() => setActiveTool('ERASER')}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              backgroundColor: activeTool === 'ERASER' ? '#2563eb' : '#161922',
              color: activeTool === 'ERASER' ? '#fff' : '#94a3b8',
              border: '1px solid #272d3e',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Scissors size={13} />
            <span>Eraser</span>
          </button>

          {/* Inking Controls Bar */}
          {activeTool === 'BRUSH' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '6px' }}>
              <select
                value={selectedBrushId}
                onChange={(e) => setSelectedBrushId(e.target.value)}
                style={{
                  backgroundColor: '#161922',
                  color: '#fff',
                  border: '1px solid #272d3e',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: '11px',
                }}
              >
                {SKETCHBOOK_BRUSH_LIST.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                style={{ width: '22px', height: '22px', border: 'none', background: 'none', cursor: 'pointer' }}
              />

              <span style={{ color: '#94a3b8', fontSize: '10px' }}>Size:</span>
              <input
                type="range"
                min="1"
                max="40"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                style={{ width: '50px' }}
              />

              <span style={{ color: '#94a3b8', fontSize: '10px' }}>Smooth:</span>
              <input
                type="range"
                min="0"
                max="0.95"
                step="0.05"
                value={stabilizerSmoothing}
                onChange={(e) => setStabilizerSmoothing(Number(e.target.value))}
                style={{ width: '50px' }}
              />

              <select
                value={perspectiveMode}
                onChange={(e) => setPerspectiveMode(e.target.value as PerspectiveGuideMode)}
                style={{
                  backgroundColor: '#161922',
                  color: perspectiveMode !== 'OFF' ? 'var(--pj-cyan)' : '#94a3b8',
                  border: '1px solid #272d3e',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: '10px',
                }}
              >
                <option value="OFF">Guides: Off</option>
                <option value="1_POINT">1-Point Perspective</option>
                <option value="2_POINT">2-Point Perspective</option>
                <option value="3_POINT">3-Point Perspective</option>
                <option value="SYMMETRY_Y">Symmetry Mirror (Y-Axis)</option>
              </select>

              <button
                onClick={() => handleClearDrawing(activePanelIdx)}
                style={{
                  padding: '3px 6px',
                  borderRadius: '3px',
                  backgroundColor: '#272d3e',
                  color: '#e2e8f0',
                  border: 'none',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                Clear Ink
              </button>
            </div>
          )}

          {/* Master Sequential Sub-Switches */}
          {studioMode === 'MASTER_SEQUENTIAL' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px', borderLeft: '1px solid #272d3e', paddingLeft: '12px' }}>
              <button
                onClick={() => setSequentialView('PAGE_GRID')}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: sequentialView === 'PAGE_GRID' ? '#272d3e' : 'transparent',
                  color: sequentialView === 'PAGE_GRID' ? '#fff' : '#94a3b8',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: sequentialView === 'PAGE_GRID' ? 700 : 500,
                }}
              >
                📄 Page Grid
              </button>
              <button
                onClick={() => setSequentialView('WEBTOON_STREAM')}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: sequentialView === 'WEBTOON_STREAM' ? '#272d3e' : 'transparent',
                  color: sequentialView === 'WEBTOON_STREAM' ? 'var(--pj-cyan)' : '#94a3b8',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: sequentialView === 'WEBTOON_STREAM' ? 700 : 500,
                }}
              >
                📜 Webtoon Stream
              </button>
              <button
                onClick={() => setIsBlackAndWhite(!isBlackAndWhite)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: isBlackAndWhite ? '#334155' : 'transparent',
                  color: isBlackAndWhite ? '#fff' : '#94a3b8',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {isBlackAndWhite ? '🏁 B/W Manga' : '🌈 Color Comic'}
              </button>
              <button
                onClick={() => setIsScreentoneEnabled(!isScreentoneEnabled)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: isScreentoneEnabled ? '#334155' : 'transparent',
                  color: isScreentoneEnabled ? 'var(--pj-cyan)' : '#94a3b8',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                60 LPI Screentone
              </button>
            </div>
          )}
        </div>

        {/* Right Action Quick Triggers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => handleApplyDiagonalSlash(activePanelIdx)}
            title="Cut Panel with Dynamic Manga Diagonal Slash"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: '#1e2230',
              color: '#38bdf8',
              border: '1px solid #2d3448',
              cursor: 'pointer',
            }}
          >
            <Scissors size={12} />
            <span>Slash Panel {activePanelIdx + 1}</span>
          </button>

          <button
            onClick={() => handleTriggerActionPanel(activePanelIdx)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '4px',
              background: 'linear-gradient(135deg, #d40055 0%, #ff8c00 100%)',
              color: '#fff',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Zap size={13} />
            <span>Test Motion (P{activePanelIdx + 1})</span>
          </button>
        </div>
      </div>

      {/* ── MAIN STUDIO BODY: 3 COLUMNS ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* LEFT COLUMN: ASSET, SCRIPT & MOTION DRAWER */}
        <div
          style={{
            width: '340px',
            backgroundColor: '#10121a',
            borderRight: '1px solid #1f2330',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Tab Navigation Rail */}
          <div
            style={{
              display: 'flex',
              overflowX: 'auto',
              borderBottom: '1px solid #1f2330',
              backgroundColor: '#0a0b10',
              padding: '4px',
              gap: '4px',
            }}
          >
            <button
              onClick={() => setActiveTab('MOTION_CINEMAGRAPH')}
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '4px',
                border: 'none',
                backgroundColor: activeTab === 'MOTION_CINEMAGRAPH' ? '#212638' : 'transparent',
                color: activeTab === 'MOTION_CINEMAGRAPH' ? 'var(--pj-magenta)' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              Motion FX
            </button>
            <button
              onClick={() => setActiveTab('LOREA_SCRIPT')}
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '4px',
                border: 'none',
                backgroundColor: activeTab === 'LOREA_SCRIPT' ? '#212638' : 'transparent',
                color: activeTab === 'LOREA_SCRIPT' ? 'var(--pj-cyan)' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              Lorea Script
            </button>
            <button
              onClick={() => setActiveTab('TEMPLATES')}
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '4px',
                border: 'none',
                backgroundColor: activeTab === 'TEMPLATES' ? '#212638' : 'transparent',
                color: activeTab === 'TEMPLATES' ? '#38bdf8' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              Layouts
            </button>
            <button
              onClick={() => setActiveTab('BUBBLES')}
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '4px',
                border: 'none',
                backgroundColor: activeTab === 'BUBBLES' ? '#212638' : 'transparent',
                color: activeTab === 'BUBBLES' ? '#38bdf8' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              Bubbles
            </button>
            <button
              onClick={() => setActiveTab('SFX')}
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '4px',
                border: 'none',
                backgroundColor: activeTab === 'SFX' ? '#212638' : 'transparent',
                color: activeTab === 'SFX' ? '#ec4899' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              SFX
            </button>
            <button
              onClick={() => setActiveTab('PAI_GALLERY')}
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '4px',
                border: 'none',
                backgroundColor: activeTab === 'PAI_GALLERY' ? '#212638' : 'transparent',
                color: activeTab === 'PAI_GALLERY' ? '#10b981' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              PAI
            </button>
          </div>

          {/* Drawer Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
            {/* 1. MOTION, CINEMAGRAPHS & VIDEO PANELS (Pumpkin Patch v4 Parity) */}
            {activeTab === 'MOTION_CINEMAGRAPH' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clapperboard size={16} color="var(--pj-magenta)" />
                  <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--pj-magenta)' }}>
                    Panel {activePanelIdx + 1} Motion & Cinemagraph
                  </span>
                </div>

                {/* Enable Motion Toggle */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px',
                    borderRadius: '6px',
                    backgroundColor: '#151824',
                    border: '1px solid #272d3e',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Enable Panel Motion</span>
                  <input
                    type="checkbox"
                    checked={activeMotion.enabled}
                    onChange={(e) => updatePanelMotion(activePanelIdx, { enabled: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                </div>

                {/* Media Type Selector (Image vs Looping Video Clip) */}
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Media Source:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button
                      onClick={() => updatePanelMotion(activePanelIdx, { mediaType: 'image' })}
                      style={{
                        padding: '6px',
                        borderRadius: '4px',
                        backgroundColor: activeMotion.mediaType === 'image' ? '#2e3549' : '#151824',
                        color: '#fff',
                        border: '1px solid #272d3e',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <ImageIcon size={13} />
                      <span>Still Image</span>
                    </button>
                    <button
                      onClick={() =>
                        updatePanelMotion(activePanelIdx, {
                          mediaType: 'video',
                          videoUrl: activeMotion.videoUrl || DEMO_VIDEO_LOOPS[0].url,
                          enabled: true,
                        })
                      }
                      style={{
                        padding: '6px',
                        borderRadius: '4px',
                        backgroundColor: activeMotion.mediaType === 'video' ? '#2e3549' : '#151824',
                        color: activeMotion.mediaType === 'video' ? '#38bdf8' : '#fff',
                        border: '1px solid #272d3e',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <Video size={13} />
                      <span>Looping Video</span>
                    </button>
                  </div>
                </div>

                {/* Video Preset Clip Selector */}
                {activeMotion.mediaType === 'video' && (
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Looping Video Preset:
                    </label>
                    <select
                      value={activeMotion.videoUrl || DEMO_VIDEO_LOOPS[0].url}
                      onChange={(e) => updatePanelMotion(activePanelIdx, { videoUrl: e.target.value, enabled: true })}
                      style={{
                        width: '100%',
                        backgroundColor: '#151824',
                        color: '#fff',
                        border: '1px solid #272d3e',
                        borderRadius: '4px',
                        padding: '6px',
                        fontSize: '11px',
                      }}
                    >
                      {DEMO_VIDEO_LOOPS.map((v) => (
                        <option key={v.id} value={v.url}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Cinemagraph Particle Overlay Preset */}
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                    Cinemagraph Particle Weather:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {CINEMAGRAPH_PRESETS.map((cg) => {
                      const isActive = activeMotion.cinemagraphEffect === cg.id;
                      return (
                        <button
                          key={cg.id}
                          onClick={() =>
                            updatePanelMotion(activePanelIdx, {
                              cinemagraphEffect: cg.id,
                              cinemagraphIntensity: cg.defaultIntensity,
                              enabled: true,
                            })
                          }
                          style={{
                            padding: '8px 6px',
                            borderRadius: '6px',
                            backgroundColor: isActive ? 'rgba(212, 0, 85, 0.2)' : '#151824',
                            border: isActive ? '1.5px solid var(--pj-magenta)' : '1px solid #272d3e',
                            color: '#fff',
                            fontSize: '11px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span style={{ fontSize: '14px' }}>{cg.emoji}</span>
                          <span style={{ fontWeight: 600 }}>{cg.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Action Motion Camera Choreography */}
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Action Camera Motion:
                  </label>
                  <select
                    value={activeMotion.actionMotion}
                    onChange={(e) => updatePanelMotion(activePanelIdx, { actionMotion: e.target.value as any, enabled: true })}
                    style={{
                      width: '100%',
                      backgroundColor: '#151824',
                      color: '#fff',
                      border: '1px solid #272d3e',
                      borderRadius: '4px',
                      padding: '6px',
                      fontSize: '11px',
                    }}
                  >
                    <option value="none">No Camera Motion</option>
                    {ACTION_MOTION_PRESETS.map((am) => (
                      <option key={am.id} value={am.id}>
                        {am.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Voice Acting Take Synthesis */}
                <div
                  style={{
                    backgroundColor: '#151824',
                    border: '1px solid #272d3e',
                    borderRadius: '6px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#22c55e' }}>Voice Acting Take</span>
                    <Mic size={13} color="#22c55e" />
                  </div>
                  <button
                    onClick={() => handleSynthesizeVoiceForPanel(activePanelIdx)}
                    disabled={voiceVoiceSynthesizing}
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      backgroundColor: '#16a34a',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: '11px',
                      border: 'none',
                      cursor: voiceVoiceSynthesizing ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <Volume2 size={14} />
                    <span>{voiceVoiceSynthesizing ? 'Synthesizing Voice...' : 'Generate Voice Take'}</span>
                  </button>
                  {activeMotion.voiceActingTake?.audioUrl && (
                    <div style={{ fontSize: '10px', color: '#86efac', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={12} />
                      <span>Voice Take Attached ({activeMotion.voiceActingTake.duration}s)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. LOREA SCRIPT & COMIC AUTHORING INTEGRATION */}
            {activeTab === 'LOREA_SCRIPT' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--pj-cyan)' }}>
                    Lorea Script & Lore Bridge
                  </span>
                  {loreaHandoffFound && (
                    <button
                      onClick={handleImportLoreaHandoff}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: '#00daf3',
                        color: '#000',
                        fontWeight: 700,
                        fontSize: '10px',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      Load Handoff
                    </button>
                  )}
                </div>
                <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
                  Parse character scripts from Lorea book excerpts or Fabula scene exports. Auto-flows dialogue,
                  captions, and SFX directly onto panels.
                </p>
                <textarea
                  rows={9}
                  value={loreaScriptText}
                  onChange={(e) => setLoreaScriptText(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#151824',
                    color: '#e2e8f0',
                    border: '1px solid #272d3e',
                    borderRadius: '6px',
                    padding: '8px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={handleFlowLoreaScript}
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    background: 'var(--pj-grad-spatial)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '12px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Sparkles size={14} />
                  <span>Flow Script to Comic Panels</span>
                </button>
              </div>
            )}

            {/* 3. LAYOUT TEMPLATES */}
            {activeTab === 'TEMPLATES' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                  Panel Layout Templates (20+)
                </span>
                {LAYOUT_TEMPLATE_LIST.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    onClick={() => handleSelectLayout(tmpl.id)}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: activeLayoutId === tmpl.id ? '2px solid #38bdf8' : '1px solid #232838',
                      backgroundColor: activeLayoutId === tmpl.id ? '#1a2233' : '#151824',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff', marginBottom: '2px' }}>
                      {tmpl.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{tmpl.description}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 4. SPEECH BUBBLES */}
            {activeTab === 'BUBBLES' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                  Add Bubble to Panel {activePanelIdx + 1}:
                </span>
                {SPEECH_BUBBLE_LIST.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleAddBubble(b.id)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#151824',
                      border: '1px solid #272d3e',
                      color: '#e2e8f0',
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{b.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* 5. ACTION WORDS & SFX (Western & Japanese Manga Kanji) */}
            {activeTab === 'SFX' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--pj-cyan)', fontWeight: 700 }}>
                  Japanese Manga Kanji Onomatopoeia:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {JAPANESE_SFX_STAMPS.map((sfx) => (
                    <button
                      key={sfx.kanji}
                      onClick={() => handleAddSfx(sfx)}
                      style={{
                        padding: '8px 6px',
                        borderRadius: '6px',
                        backgroundColor: '#161924',
                        border: '1px solid #272d3e',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: '18px',
                          color: sfx.color,
                          textShadow: `2px 2px 0px ${sfx.extrusion}`,
                        }}
                      >
                        {sfx.kanji}
                      </div>
                      <div style={{ fontSize: '9px', color: '#94a3b8' }}>{sfx.label}</div>
                    </button>
                  ))}
                </div>

                <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700, marginTop: '8px' }}>
                  Western Comic SFX Words:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {SFX_PRESETS.slice(0, 8).map((sfx) => (
                    <button
                      key={sfx.id}
                      onClick={() => handleAddSfx(sfx)}
                      style={{
                        padding: '8px 6px',
                        borderRadius: '6px',
                        backgroundColor: '#161924',
                        border: '1px solid #272d3e',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontWeight: 900, fontSize: '14px', color: sfx.defaultColor }}>{sfx.word}</div>
                      <div style={{ fontSize: '9px', color: '#94a3b8' }}>{sfx.meaning}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 6. PAI GALLERY */}
            {activeTab === 'PAI_GALLERY' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                  Past PAI Generations (Click to Send to Panel {activePanelIdx + 1})
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {paiItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleInsertPaiToPanel(item)}
                      style={{
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid #272d3e',
                        cursor: 'pointer',
                        backgroundColor: '#161924',
                      }}
                    >
                      <img src={item.mediaUrl} alt={item.prompt} style={{ width: '100%', height: '80px', objectFit: 'cover' }} />
                      <div style={{ padding: '4px', fontSize: '9px', color: '#cbd5e1', maxHeight: '28px', overflow: 'hidden' }}>
                        {item.prompt}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── CENTER WORKSPACE: DUAL PARADIGM CANVAS ── */}
        <div
          style={{
            flex: 1,
            backgroundColor: studioMode === 'STORY_FOLIO' ? '#140f1f' : '#07080d',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* ══════════════════════════════════════════════════════════════════
              PARADIGM 1: MASTER SEQUENTIAL STUDIO (PAGE GRID & WEBTOON STREAM)
             ══════════════════════════════════════════════════════════════════ */}
          {studioMode === 'MASTER_SEQUENTIAL' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Canvas Scroll Area */}
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px',
                  filter: isBlackAndWhite ? 'grayscale(100%) contrast(120%)' : 'none',
                }}
              >
                {/* 1A. Page Grid View */}
                {sequentialView === 'PAGE_GRID' ? (
                  <div
                    style={{
                      width: '560px',
                      height: '760px',
                      backgroundColor: page.gutterColor || '#ffffff',
                      borderRadius: '4px',
                      boxShadow: '0 25px 70px rgba(0,0,0,0.9)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {page.panels.map((panel, idx) => {
                      const box = panel.box;
                      const isSelected = activePanelIdx === idx;
                      const transform = panelTransforms[idx] || DEFAULT_PANEL_IMAGE_TRANSFORM;
                      const motion = panelMotions[idx] || DEFAULT_PANEL_MOTION_CONFIG;
                      const isThisPanelAnimating = animatingPanelIdx === idx;

                      let actionCssTransform = '';
                      if (isThisPanelAnimating) {
                        if (motion.actionMotion === 'ken_burns_zoom') {
                          actionCssTransform = 'scale(1.22) translate(-2%, -2%)';
                        } else if (motion.actionMotion === 'camera_shake') {
                          actionCssTransform = 'translate(4px, -3px) rotate(1deg)';
                        } else if (motion.actionMotion === 'pan_horizontal') {
                          actionCssTransform = 'translate(-8%, 0)';
                        }
                      }

                      return (
                        <div
                          key={panel.id}
                          onClick={() => setActivePanelIdx(idx)}
                          style={{
                            position: 'absolute',
                            left: `${box.xPct}%`,
                            top: `${box.yPct}%`,
                            width: `${box.widthPct}%`,
                            height: `${box.heightPct}%`,
                            backgroundColor: '#13151f',
                            border: isSelected ? '2.5px solid var(--pj-magenta)' : '1.5px solid #000000',
                            overflow: transform.clipToPanel ? 'hidden' : 'visible',
                            clipPath: box.clipPolygon || undefined,
                            cursor: activeTool === 'SELECT' ? 'pointer' : 'crosshair',
                            transition: 'all 0.3s ease-out',
                          }}
                        >
                          {/* Media: Video or Still */}
                          {motion.mediaType === 'video' && motion.videoUrl ? (
                            <video
                              src={motion.videoUrl}
                              autoPlay
                              loop
                              muted
                              playsInline
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                transform: `${actionCssTransform} translate(${transform.xOffsetPct}%, ${transform.yOffsetPct}%) scale(${transform.scale}) rotate(${transform.rotationDeg}deg) scaleX(${transform.flipX ? -1 : 1})`,
                                transition: 'transform 0.5s ease',
                              }}
                            />
                          ) : panel.renderedImageUrl ? (
                            <img
                              src={panel.renderedImageUrl}
                              alt={panel.actionPrompt}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                transform: `${actionCssTransform} translate(${transform.xOffsetPct}%, ${transform.yOffsetPct}%) scale(${transform.scale}) rotate(${transform.rotationDeg}deg) scaleX(${transform.flipX ? -1 : 1})`,
                                transition: 'transform 0.5s ease',
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '12px',
                                color: '#64748b',
                                textAlign: 'center',
                              }}
                            >
                              <ImageIcon size={20} />
                              <span style={{ fontSize: '10px', marginTop: '4px' }}>{panel.actionPrompt || `Panel ${idx + 1}`}</span>
                            </div>
                          )}

                          {/* 60 LPI Screentone Shader Overlay */}
                          {(isScreentoneEnabled || panel.screentone?.enabled) && (
                            <div
                              style={{
                                position: 'absolute',
                                inset: 0,
                                pointerEvents: 'none',
                                zIndex: 5,
                                opacity: 0.25,
                                backgroundImage:
                                  screentonePattern === 'dots_fine'
                                    ? 'radial-gradient(circle, #000 1.5px, transparent 1.5px)'
                                    : screentonePattern === 'speed_lines'
                                    ? 'repeating-linear-gradient(90deg, #000 0, #000 2px, transparent 2px, transparent 8px)'
                                    : 'radial-gradient(circle, #000 2.5px, transparent 2.5px)',
                                backgroundSize: screentonePattern === 'speed_lines' ? '12px 100%' : '8px 8px',
                              }}
                            />
                          )}

                          {/* Perspective Guide Lines Overlay */}
                          {perspectiveMode !== 'OFF' && (
                            <svg
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                pointerEvents: 'none',
                                zIndex: 6,
                                opacity: 0.45,
                              }}
                            >
                              {perspectiveMode === '1_POINT' && (
                                <>
                                  <line x1="0%" y1="50%" x2="100%" y2="50%" stroke="var(--pj-cyan)" strokeWidth="1" strokeDasharray="4 4" />
                                  <circle cx="50%" cy="50%" r="4" fill="var(--pj-cyan)" />
                                  {[0, 25, 50, 75, 100].map((x) => (
                                    <React.Fragment key={x}>
                                      <line x1="50%" y1="50%" x2={`${x}%`} y2="0%" stroke="var(--pj-cyan)" strokeWidth="0.8" />
                                      <line x1="50%" y1="50%" x2={`${x}%`} y2="100%" stroke="var(--pj-cyan)" strokeWidth="0.8" />
                                    </React.Fragment>
                                  ))}
                                </>
                              )}
                              {perspectiveMode === 'SYMMETRY_Y' && (
                                <line x1="50%" y1="0%" x2="50%" y2="100%" stroke="var(--pj-cyan)" strokeWidth="1.5" strokeDasharray="6 4" />
                              )}
                            </svg>
                          )}

                          {/* Cinemagraph Particle Overlay Canvas */}
                          {motion.enabled && motion.cinemagraphEffect !== 'none' && (
                            <canvas
                              ref={(el) => (cinemagraphCanvasRefs.current[idx] = el)}
                              width={400}
                              height={400}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                pointerEvents: 'none',
                                zIndex: 7,
                              }}
                            />
                          )}

                          {/* Autodesk Sketchbook Inking Canvas Layer */}
                          <canvas
                            ref={(el) => (canvasRefs.current[idx] = el)}
                            width={400}
                            height={400}
                            onPointerDown={(e) => startDrawing(e, idx)}
                            onPointerMove={(e) => drawMove(e, idx)}
                            onPointerUp={stopDrawing}
                            onPointerLeave={stopDrawing}
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              pointerEvents: activeTool === 'BRUSH' || activeTool === 'ERASER' ? 'auto' : 'none',
                              zIndex: 8,
                            }}
                          />

                          {/* Speech Bubbles and Sound Effects */}
                          {panel.balloons.map((balloon) => {
                            const isBubbleActive = audioSpeechActiveId === balloon.id;
                            const isSfx = balloon.type === 'sfx';
                            return (
                              <div
                                key={balloon.id}
                                style={{
                                  position: 'absolute',
                                  left: `${balloon.xPct}%`,
                                  top: `${balloon.yPct}%`,
                                  transform: 'translate(-50%, -50%)',
                                  zIndex: 10,
                                  cursor: 'move',
                                }}
                              >
                                {isSfx ? (
                                  <div
                                    style={{
                                      fontFamily: 'Impact, sans-serif',
                                      fontSize: `${22 * (balloon.sfxScale || 1)}px`,
                                      fontWeight: 900,
                                      fontStyle: 'italic',
                                      color: balloon.sfxColor || '#ff0055',
                                      textShadow: '3px 3px 0px #000',
                                      letterSpacing: '1px',
                                      transform: 'rotate(-6deg)',
                                    }}
                                  >
                                    {balloon.text}
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      backgroundColor: '#ffffff',
                                      color: '#000000',
                                      padding: '6px 12px',
                                      borderRadius: balloon.type === 'thought' ? '18px' : '10px',
                                      border: isBubbleActive ? '2.5px solid #22c55e' : '2px solid #000000',
                                      boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      maxWidth: '160px',
                                      lineHeight: 1.3,
                                      textAlign: 'center',
                                    }}
                                  >
                                    {balloon.text}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* 1B. Webtoon Vertical Infinite-Scroll Stream View */
                  <div style={{ width: '460px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ textAlign: 'center', color: 'var(--pj-cyan)', fontSize: '11px', fontWeight: 700 }}>
                      ⬇️ Webtoon Reading Order: Scroll Down
                    </div>
                    {page.panels.map((panel, idx) => (
                      <div
                        key={panel.id}
                        onClick={() => setActivePanelIdx(idx)}
                        style={{
                          width: '100%',
                          height: '380px',
                          backgroundColor: '#13151f',
                          borderRadius: '8px',
                          border: activePanelIdx === idx ? '2.5px solid var(--pj-cyan)' : '1px solid #232838',
                          position: 'relative',
                          overflow: 'hidden',
                          clipPath: panel.box.clipPolygon || undefined,
                          boxShadow: '0 10px 30px rgba(0,0,0,0.7)',
                        }}
                      >
                        {panel.renderedImageUrl ? (
                          <img src={panel.renderedImageUrl} alt={panel.actionPrompt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                            Webtoon Panel {idx + 1}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Floating Radial Brush Puck (Clip Studio & Sketchbook Parity) */}
              <div
                onClick={() => setRadialPuckOpen(!radialPuckOpen)}
                style={{
                  position: 'absolute',
                  bottom: '86px',
                  right: '24px',
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, #252a3d 0%, #121520 100%)',
                  border: '2px solid var(--pj-cyan)',
                  boxShadow: '0 8px 24px rgba(0, 218, 243, 0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 40,
                  cursor: 'pointer',
                }}
              >
                <PenTool size={16} color="var(--pj-cyan)" />
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#fff', marginTop: '2px' }}>{brushSize}px</span>
              </div>

              {/* Bottom Multi-Track Motion Comic Timeline Scrubber Bar */}
              <div
                style={{
                  height: '70px',
                  backgroundColor: '#0a0b12',
                  borderTop: '1px solid #1c202e',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '6px 16px',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--pj-cyan)' }}>Motion Timeline</span>
                    <span>
                      {timelineCurrentTime.toFixed(1)}s / {timelineDuration}.0s
                    </span>
                  </div>
                  <span style={{ fontSize: '10px' }}>Active Beat: Panel {activePanelIdx + 1}</span>
                </div>

                {/* Timeline Scrubber Track */}
                <div
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    setTimelineCurrentTime(Math.round(pct * timelineDuration * 10) / 10);
                  }}
                  style={{
                    position: 'relative',
                    height: '32px',
                    backgroundColor: '#141724',
                    borderRadius: '4px',
                    border: '1px solid #252b3e',
                    cursor: 'pointer',
                    overflow: 'hidden',
                  }}
                >
                  {/* Track 1: Panels */}
                  <div style={{ display: 'flex', height: '16px', width: '100%' }}>
                    {page.panels.map((p, idx) => (
                      <div
                        key={p.id}
                        style={{
                          flex: 1,
                          backgroundColor: activePanelIdx === idx ? 'rgba(212, 0, 85, 0.4)' : 'rgba(107, 0, 153, 0.25)',
                          borderRight: '1px solid #2c3348',
                          fontSize: '9px',
                          display: 'flex',
                          alignItems: 'center',
                          paddingLeft: '6px',
                          fontWeight: 700,
                          color: activePanelIdx === idx ? '#fff' : '#94a3b8',
                        }}
                      >
                        P{idx + 1} ({p.cameraShot})
                      </div>
                    ))}
                  </div>

                  {/* Track 2: Dialogue & FX Waveform indicator */}
                  <div style={{ display: 'flex', height: '16px', width: '100%', backgroundColor: '#0e111a' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: '6px', fontSize: '8px', color: '#86efac' }}>
                      🎙️ Silas Vane (Voice Take)
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: '6px', fontSize: '8px', color: '#38bdf8' }}>
                      🌧️ Acid Rain FX
                    </div>
                  </div>

                  {/* Playhead Marker */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${(timelineCurrentTime / timelineDuration) * 100}%`,
                      width: '2px',
                      backgroundColor: 'var(--pj-cyan)',
                      boxShadow: '0 0 8px var(--pj-cyan)',
                      zIndex: 10,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              PARADIGM 2: STORY MAGIC FOLIO (CONTEXT-AWARE STORYBOOK STUDIO)
             ══════════════════════════════════════════════════════════════════ */}
          {studioMode === 'STORY_FOLIO' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '16px 24px' }}>
              {/* Top Document Context Awareness Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 14px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Bookmark size={15} color="var(--pj-orange)" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
                    Document Context: {storybookContext.documentTitle}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(255, 140, 0, 0.2)',
                      color: 'var(--pj-orange)',
                      fontWeight: 700,
                    }}
                  >
                    {storybookContext.readingAgeTier.replace('_', ' ')}
                  </span>
                </div>

                {/* Spread Navigation Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => setActiveSpreadIndex(Math.max(0, activeSpreadIndex - 1))}
                    disabled={activeSpreadIndex === 0}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      backgroundColor: '#271f38',
                      color: '#fff',
                      border: 'none',
                      cursor: activeSpreadIndex === 0 ? 'default' : 'pointer',
                      opacity: activeSpreadIndex === 0 ? 0.4 : 1,
                    }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: '11px', fontWeight: 700 }}>
                    Spread {activeSpreadIndex + 1} of {storybookContext.spreads.length}
                  </span>
                  <button
                    onClick={() => setActiveSpreadIndex(Math.min(storybookContext.spreads.length - 1, activeSpreadIndex + 1))}
                    disabled={activeSpreadIndex >= storybookContext.spreads.length - 1}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      backgroundColor: '#271f38',
                      color: '#fff',
                      border: 'none',
                      cursor: activeSpreadIndex >= storybookContext.spreads.length - 1 ? 'default' : 'pointer',
                      opacity: activeSpreadIndex >= storybookContext.spreads.length - 1 ? 0.4 : 1,
                    }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Open 2-Page Storybook Folio Spread */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div
                  style={{
                    width: '920px',
                    height: '520px',
                    backgroundColor: '#fffdf7',
                    borderRadius: '16px',
                    boxShadow: '0 25px 80px rgba(0, 0, 0, 0.85)',
                    display: 'flex',
                    overflow: 'hidden',
                    position: 'relative',
                    border: '8px solid #3d2b1f',
                  }}
                >
                  {/* Left Page: Illustration Spread */}
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: '#12141f',
                      position: 'relative',
                      borderRight: '3px solid #e2d9c8',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={
                        page.panels[0]?.renderedImageUrl ||
                        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80'
                      }
                      alt="Storybook Illustration"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />

                    {/* Starlight / Dust motes cinemagraph particles */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'radial-gradient(circle, rgba(255, 230, 150, 0.15) 0%, transparent 80%)',
                        pointerEvents: 'none',
                      }}
                    />

                    {/* Dropped Character Stickers */}
                    {droppedStickers.map((stk) => (
                      <div
                        key={stk.id}
                        style={{
                          position: 'absolute',
                          left: `${stk.xPct}%`,
                          top: `${stk.yPct}%`,
                          transform: 'translate(-50%, -50%)',
                          fontSize: '36px',
                          cursor: 'pointer',
                          filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
                        }}
                        title={stk.quote}
                      >
                        {stk.emoji}
                      </div>
                    ))}

                    {/* Storybook Vector Speech Bubble */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '24px',
                        left: '24px',
                        right: '24px',
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        color: '#2d1810',
                        padding: '10px 16px',
                        borderRadius: '16px',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
                        fontSize: '12px',
                        fontWeight: 700,
                        lineHeight: 1.4,
                      }}
                    >
                      {currentSpread?.rightPageProse.slice(0, 95)}...
                    </div>
                  </div>

                  {/* Book Spine Stitch Divider */}
                  <div
                    style={{
                      width: '12px',
                      backgroundColor: '#2b1a10',
                      boxShadow: 'inset 0 0 8px rgba(0,0,0,0.8)',
                    }}
                  />

                  {/* Right Page: Prose Story & Magic Wand */}
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: '#fffdf7',
                      color: '#2b1a10',
                      padding: '28px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      fontFamily: '"Georgia", serif',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#9a7b56', letterSpacing: '2px', fontWeight: 800 }}>
                        {currentSpread?.chapterTitle || 'Chapter One'}
                      </div>
                      <h2 style={{ fontSize: '20px', fontWeight: 900, margin: '8px 0 16px 0', color: '#1f130b' }}>
                        The Magic Pumpkin Garden
                      </h2>
                      <textarea
                        rows={8}
                        value={currentSpread?.rightPageProse || storyInputText}
                        onChange={(e) => setStoryInputText(e.target.value)}
                        style={{
                          width: '100%',
                          backgroundColor: 'transparent',
                          border: 'none',
                          fontSize: '14px',
                          lineHeight: 1.7,
                          color: '#2b1a10',
                          resize: 'none',
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>

                    {/* Story Audio Narration & Magic Wand */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={handleNarrateSpread}
                        disabled={isNarratingStory}
                        style={{
                          flex: 1,
                          padding: '10px 14px',
                          borderRadius: '24px',
                          backgroundColor: '#22c55e',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '12px',
                          border: 'none',
                          cursor: isNarratingStory ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        <Volume2 size={16} />
                        <span>{isNarratingStory ? 'Narrating Page...' : '🎙️ Read Aloud with Warm Voice'}</span>
                      </button>

                      <button
                        onClick={handleMagicStoryWand}
                        style={{
                          padding: '10px 18px',
                          borderRadius: '24px',
                          background: 'var(--pj-grad-ember)',
                          color: '#000',
                          fontWeight: 800,
                          fontSize: '12px',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 4px 12px rgba(255, 140, 0, 0.3)',
                        }}
                      >
                        <Wand2 size={15} />
                        <span>✨ Magic Story Wand</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Character Cast & Sticker Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 16px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: '14px',
                  marginTop: '12px',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--pj-orange)' }}>
                  Character Stickers (Click to place on page):
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {storybookContext.cast.map((char) => (
                    <button
                      key={char.name}
                      onClick={() => handleDropSticker(char)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        backgroundColor: '#261b36',
                        border: '1px solid #3e2e54',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: '16px' }}>{char.emoji}</span>
                      <span>{char.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: INSPECTOR & IN-PANEL AI TRANSFORM CONTROLS */}
        <div
          style={{
            width: '280px',
            backgroundColor: '#10121a',
            borderLeft: '1px solid #1f2330',
            display: 'flex',
            flexDirection: 'column',
            padding: '14px',
            gap: '14px',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '13px' }}>
              {studioMode === 'STORY_FOLIO' ? 'Storybook Spread Inspector' : `Panel ${activePanelIdx + 1} Inspector`}
            </span>
          </div>

          {/* Camera Shot Selector */}
          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              Camera Framing:
            </label>
            <select
              value={page.panels[activePanelIdx]?.cameraShot || 'medium'}
              onChange={(e) => {
                const updated = { ...page, panels: [...page.panels] };
                if (updated.panels[activePanelIdx]) {
                  updated.panels[activePanelIdx].cameraShot = e.target.value as any;
                  setPage(updated);
                }
              }}
              style={{
                width: '100%',
                backgroundColor: '#161924',
                color: '#fff',
                border: '1px solid #272d3e',
                borderRadius: '4px',
                padding: '6px',
                fontSize: '11px',
              }}
            >
              <option value="establishing">Establishing Shot (Wide Vista)</option>
              <option value="full_shot">Full Shot (Head-to-Toe)</option>
              <option value="medium">Medium Shot (Waist Up)</option>
              <option value="close_up">Close-Up (Expression)</option>
              <option value="extreme_close_up">Extreme Close-Up (Detail)</option>
              <option value="low_angle_hero">Low Angle Heroic</option>
            </select>
          </div>

          {/* In-Panel Image Transform Controls (Zoom, Pan, Flip) */}
          <div
            style={{
              backgroundColor: '#161924',
              border: '1px solid #272d3e',
              borderRadius: '6px',
              padding: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--pj-cyan)' }}>
              In-Panel Image Transform
            </span>

            {/* Zoom Slider */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                <span>Zoom / Scale:</span>
                <span>{(panelTransforms[activePanelIdx]?.scale || 1.0).toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={panelTransforms[activePanelIdx]?.scale || 1.0}
                onChange={(e) => updateTransform(activePanelIdx, { scale: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            {/* Pan X & Y */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                onClick={() =>
                  updateTransform(activePanelIdx, {
                    xOffsetPct: (panelTransforms[activePanelIdx]?.xOffsetPct || 0) - 5,
                  })
                }
                style={{
                  padding: '5px',
                  borderRadius: '4px',
                  backgroundColor: '#202636',
                  color: '#cbd5e1',
                  border: 'none',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                ◀ Pan Left
              </button>
              <button
                onClick={() =>
                  updateTransform(activePanelIdx, {
                    xOffsetPct: (panelTransforms[activePanelIdx]?.xOffsetPct || 0) + 5,
                  })
                }
                style={{
                  padding: '5px',
                  borderRadius: '4px',
                  backgroundColor: '#202636',
                  color: '#cbd5e1',
                  border: 'none',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                Pan Right ▶
              </button>
            </div>

            {/* Flip Horizontal */}
            <button
              onClick={() =>
                updateTransform(activePanelIdx, {
                  flipX: !(panelTransforms[activePanelIdx]?.flipX || false),
                })
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '6px',
                borderRadius: '4px',
                backgroundColor: '#202636',
                color: '#cbd5e1',
                border: 'none',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              <FlipHorizontal size={13} />
              <span>Flip Character / Shot</span>
            </button>
          </div>

          {/* Action Prompt Description */}
          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              Panel Story Beat / Action:
            </label>
            <textarea
              rows={3}
              value={page.panels[activePanelIdx]?.actionPrompt || ''}
              onChange={(e) => {
                const updated = { ...page, panels: [...page.panels] };
                if (updated.panels[activePanelIdx]) {
                  updated.panels[activePanelIdx].actionPrompt = e.target.value;
                  setPage(updated);
                }
              }}
              style={{
                width: '100%',
                backgroundColor: '#161924',
                color: '#fff',
                border: '1px solid #272d3e',
                borderRadius: '4px',
                padding: '6px',
                fontSize: '11px',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComicMangaCreatorStudio;
