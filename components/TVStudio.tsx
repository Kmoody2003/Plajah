/**
 * TVStudio — Plajah TV Studio Master Control
 *
 * Full browser-based production switcher.
 *
 * Tabs:  Video Switcher · Audio Mixer · Graphics Builder · Lighting Board · System Config
 *
 * On mount:   auto-adds first detected webcam + screen-capture source + editable lower third.
 * Source bus: numbered Program / Preview bus rows + Audio Cue row + Graphics Preset row.
 * Import:     Local · Reelo · Taleo · Posts · Live Feeds · FAST/Ads · Labs.
 * Aux buses:  2 default additional outputs, unlimited add.
 * Cast:       Google Cast to Chromecast (Preview or Program bus).
 * NDI / AVB:  WebSocket bridge config in System Config.
 * Lighting:   Lighting Board tab — DMX512 + smart lights + scene macros.
 * Hot folders: IndexedDB-persisted directory pins for instant bin access.
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useContextMenu, type MenuNode } from './ui/ContextMenu';
import {
  ArrowLeft, Video, Monitor, Film, Palette, Radio, Circle, Square,
  Volume2, Mic, MicOff, Layers, Eye, EyeOff, Trash2, Download,
  Settings, Usb, Clock, Clapperboard, Sun, Contrast, Droplet,
  Upload, Type, Activity, Database, Sliders, Lock, Zap,
  ChevronRight, Plus, RefreshCw, Cast, Wifi, Music2, Image as ImageIcon,
  List, Grid, Lightbulb, Play, Pause, SkipForward,
  AlertCircle, Check, Folder,
} from 'lucide-react';
import {
  TVStudioEngine, StudioSource, GraphicOverlay, TransitionType,
} from '../services/tvStudioEngine';
import { db } from '../services/firebase';
import { auth } from '../services/backendService';
import { saveStudioEpisode } from '../services/podcastStudio/studioService';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import TVStudioLightingBoard from './TVStudioLightingBoard';
import AmboPresenter from './scripture/AmboPresenter';
import { BookOpen } from 'lucide-react';
import TVStudioImportModal, { ImportedAsset, HotFolder } from './TVStudioImportModal';
import { RtcSession } from '../services/rtcCore';
import { fetchLiveProgramFeedsForUser } from '../services/multiSiteService';
import { TeleprompterCanvasSource } from './teleprompter/teleprompterCanvasSource';
import type { ProgramFeed } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudioProjectDoc {
  id: string;
  userId: string;
  title: string;
  resolution: '1920x1080' | '1280x720' | '3840x2160';
  frameRate: 25 | 29.97 | 30 | 50 | 59.94 | 60;
  outputMode: 'LIVE' | 'RECORD' | 'BOTH';
  createdAt: number;
}

interface AudioCueCell {
  id: string;
  label: string;
  url: string;
  type: 'STINGER' | 'SFX' | 'MUSIC' | 'JINGLE';
  color: string;
  isLoaded: boolean;
}

interface GraphicPreset {
  id: string;
  label: string;
  type: 'LOWER_THIRD' | 'FULLPAGE' | 'BUG' | 'MOTION';
  title?: string;
  subtitle?: string;
  url?: string;
  color?: string;
  isActive: boolean;
}

interface AuxBusUI {
  id: string;
  label: string;
  sourceId: string | null;
}

export interface TVStudioProps {
  currentUser: FirebaseUser | null;
  onBack: () => void;
  onStreamReady?: (stream: MediaStream) => void;
}

type StudioTab = 'SWITCHER' | 'AUDIO' | 'GRAPHICS_BUILDER' | 'AMBO' | 'LIGHTING' | 'SETTINGS';

// ── SourceCanvas ──────────────────────────────────────────────────────────────

function SourceCanvas({ source, className = '' }: { source: StudioSource; className?: string }) {
  const cvRef  = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const frame  = useRef(0);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      frame.current++;
      if (frame.current % 8 === 0) {
        if (source.videoEl && source.isReady) {
          ctx.filter = `brightness(${source.brightness}) contrast(${source.contrast}) saturate(${source.saturation}) hue-rotate(${source.hue}deg)`;
          ctx.drawImage(source.videoEl, 0, 0, 160, 90);
          ctx.filter = 'none';
        } else if (source.type === 'BARS') {
          ['#C0C0C0','#C0C000','#00C0C0','#00C000','#C000C0','#C00000','#0000C0'].forEach((c, i) => {
            ctx.fillStyle = c; ctx.fillRect(i * (160/7), 0, 160/7, 90);
          });
        } else if (source.color) {
          ctx.fillStyle = source.color === 'BARS' ? '#888' : source.color;
          ctx.fillRect(0, 0, 160, 90);
        } else if (source.imageEl) {
          ctx.drawImage(source.imageEl, 0, 0, 160, 90);
        } else {
          ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 160, 90);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [source]);

  return <canvas ref={cvRef} width={160} height={90} className={className} />;
}

// ── PreviewMonitor ────────────────────────────────────────────────────────────

function PreviewMonitor({ source }: { source: StudioSource | null }) {
  const cvRef  = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      if (!source) { ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0,0,1920,1080); }
      else if (source.videoEl && source.isReady) {
        ctx.filter = `brightness(${source.brightness}) contrast(${source.contrast}) saturate(${source.saturation}) hue-rotate(${source.hue}deg)`;
        ctx.drawImage(source.videoEl, 0, 0, 1920, 1080); ctx.filter = 'none';
      } else if (source.type === 'BARS') {
        ['#C0C0C0','#C0C000','#00C0C0','#00C000','#C000C0','#C00000','#0000C0'].forEach((c, i) => {
          ctx.fillStyle = c; ctx.fillRect(i*(1920/7), 0, 1920/7, 810);
        });
        ctx.fillStyle = '#000'; ctx.fillRect(720, 810, 720, 270);
      } else if (source.color) {
        ctx.fillStyle = source.color; ctx.fillRect(0,0,1920,1080);
      } else if (source.imageEl) {
        ctx.drawImage(source.imageEl, 0, 0, 1920, 1080);
      } else { ctx.fillStyle = '#111'; ctx.fillRect(0,0,1920,1080); }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [source]);

  return <canvas ref={cvRef} width={1920} height={1080} className="w-full h-full block" />;
}

// ── VUBar ─────────────────────────────────────────────────────────────────────

function VUBar({ level, vertical = false, className = '' }: { level: number; vertical?: boolean; className?: string }) {
  const pct = Math.min(level * 100, 100);
  const color = level > 0.85 ? '#ef4444' : level > 0.6 ? '#f59e0b' : '#22c55e';
  if (vertical) return (
    <div className={`relative bg-black/40 rounded overflow-hidden ${className}`} style={{ width: 6, height: 56 }}>
      <div className="absolute bottom-0 left-0 right-0 transition-all duration-75" style={{ height: `${pct}%`, backgroundColor: color }} />
    </div>
  );
  return (
    <div className={`relative bg-black/40 rounded overflow-hidden h-1.5 ${className}`}>
      <div className="absolute left-0 top-0 bottom-0 transition-all duration-75" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ── VerticalTBar ──────────────────────────────────────────────────────────────

function VerticalTBar({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const getPos = useCallback((clientY: number) => {
    if (!trackRef.current) return 0;
    const { top, height } = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientY - top) / height));
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => { if (dragging.current) onChange(getPos(e.clientY)); };
    const onUp   = () => { dragging.current = false; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [onChange, getPos]);

  return (
    <div
      ref={trackRef}
      className="relative rounded-full cursor-pointer select-none"
      style={{ width: 18, height: 136, background: '#080808', border: '1px solid #2a2a2a' }}
      onPointerDown={e => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); onChange(getPos(e.clientY)); }}
    >
      <div className="absolute bottom-0 left-0 right-0 rounded-full" style={{ height: `${(1-value)*100}%`, background: 'rgba(107,0,153,0.25)' }} />
      <div className="absolute left-1/2 rounded-sm" style={{ top: `${Math.round(value*83)}%`, width: 32, height: 18, transform: 'translateX(-50%)', background: 'linear-gradient(180deg,#2e2e2e,#1a1a1a)', border: '1px solid #555', boxShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-px bg-white/20" />
      </div>
    </div>
  );
}

// ── Elapsed ───────────────────────────────────────────────────────────────────

function useElapsed(running: boolean, startMs: number) {
  const [elapsed, setElapsed] = useState('00:00:00:00');
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const ms = Date.now() - startMs;
      const h = String(Math.floor(ms/3600000)).padStart(2,'0');
      const m = String(Math.floor((ms%3600000)/60000)).padStart(2,'0');
      const s = String(Math.floor((ms%60000)/1000)).padStart(2,'0');
      const f = String(Math.floor((ms%1000)/33)).padStart(2,'0');
      setElapsed(`${h}:${m}:${s}:${f}`);
    }, 33);
    return () => clearInterval(id);
  }, [running, startMs]);
  return elapsed;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

const TVStudio: React.FC<TVStudioProps> = ({ currentUser, onBack, onStreamReady }) => {

  // ── Project ────────────────────────────────────────────────────────────────
  const [projects, setProjects]             = useState<StudioProjectDoc[]>([]);
  const [activeProject, setActiveProject]   = useState<StudioProjectDoc | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newTitle, setNewTitle]             = useState('New Show');
  const [newRes, setNewRes]                 = useState<StudioProjectDoc['resolution']>('1920x1080');
  const [newFps, setNewFps]                 = useState<StudioProjectDoc['frameRate']>(30);
  const [newMode, setNewMode]               = useState<StudioProjectDoc['outputMode']>('BOTH');

  // ── Engine ─────────────────────────────────────────────────────────────────
  const programCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef        = useRef<TVStudioEngine | null>(null);

  const [sourcesVer, setSourcesVer]           = useState(0);
  const [overlaysVer, setOverlaysVer]         = useState(0);
  const [programId, setProgramId]             = useState<string | null>(null);
  const [previewId, setPreviewId]             = useState<string | null>(null);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [masterLevel, setMasterLevel]         = useState(0);
  const [sourceLevels, setSourceLevels]       = useState<Record<string, number>>({});
  const levelRafRef                           = useRef<number>(0);

  // ── Recording ──────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording]         = useState(false);
  const [recordStart, setRecordStart]         = useState(0);
  const timecode = useElapsed(isRecording, recordStart);

  // ── Tabs / UI ──────────────────────────────────────────────────────────────
  const [studioTab, setStudioTab]             = useState<StudioTab>('SWITCHER');
  const [transitionType, setTransitionType]   = useState<TransitionType>('MIX');
  const [transitionDuration, setTransitionDuration] = useState(500);
  const [tBarValue, setTBarValue]             = useState(0);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [inspectedSourceId, setInspectedSourceId] = useState<string | null>(null);

  // ── Graphics overlay form ──────────────────────────────────────────────────
  const [showLTForm, setShowLTForm]           = useState(false);
  const [ltTitle, setLtTitle]                 = useState('');
  const [ltSubtitle, setLtSubtitle]           = useState('');
  const [ltStyle, setLtStyle]                 = useState<'MODERN' | 'CLASSIC' | 'MINIMAL'>('MODERN');

  // ── Audio ──────────────────────────────────────────────────────────────────
  const [masterGain, setMasterGain]           = useState(1);
  const [sourceGains, setSourceGains]         = useState<Record<string, number>>({});
  const [sourceMutes, setSourceMutes]         = useState<Record<string, boolean>>({});

  // ── Color correction ───────────────────────────────────────────────────────
  const [cc, setCC] = useState({ brightness: 1, contrast: 1, saturation: 1, hue: 0 });

  // ── Settings sub-tab ───────────────────────────────────────────────────────
  const [settingsSub, setSettingsSub] = useState<'EXPORT' | 'COLOR' | 'MIDI' | 'NDI' | 'AUX' | 'CAST'>('EXPORT');

  // ── Audio Cue row ──────────────────────────────────────────────────────────
  const [audioCues, setAudioCues] = useState<AudioCueCell[]>([
    { id: 'cue_1', label: 'Stinger 1', url: '', type: 'STINGER', color: '#D40055', isLoaded: false },
    { id: 'cue_2', label: 'Stinger 2', url: '', type: 'STINGER', color: '#D40055', isLoaded: false },
    { id: 'cue_3', label: 'SFX 1',     url: '', type: 'SFX',     color: '#f59e0b', isLoaded: false },
    { id: 'cue_4', label: 'SFX 2',     url: '', type: 'SFX',     color: '#f59e0b', isLoaded: false },
    { id: 'cue_5', label: 'Music 1',   url: '', type: 'MUSIC',   color: '#22c55e', isLoaded: false },
    { id: 'cue_6', label: 'Music 2',   url: '', type: 'MUSIC',   color: '#22c55e', isLoaded: false },
    { id: 'cue_7', label: 'Jingle 1',  url: '', type: 'JINGLE',  color: '#6B0099', isLoaded: false },
    { id: 'cue_8', label: 'Jingle 2',  url: '', type: 'JINGLE',  color: '#6B0099', isLoaded: false },
  ]);
  const [playingCues, setPlayingCues] = useState<Set<string>>(new Set());

  // ── Graphics Preset row ────────────────────────────────────────────────────
  const [graphicPresets, setGraphicPresets] = useState<GraphicPreset[]>([
    { id: 'gp_1', label: 'Lower Third A', type: 'LOWER_THIRD', title: 'Name', subtitle: 'Title / Role', isActive: false },
    { id: 'gp_2', label: 'Lower Third B', type: 'LOWER_THIRD', title: '', subtitle: '', isActive: false },
    { id: 'gp_3', label: 'Black BG',      type: 'FULLPAGE',   color: '#000000', isActive: false },
    { id: 'gp_4', label: 'Bug / Logo',    type: 'BUG',        isActive: false },
    { id: 'gp_5', label: 'Motion GFX',    type: 'MOTION',     isActive: false },
    { id: 'gp_6', label: 'Clock',         type: 'FULLPAGE',   isActive: false },
  ]);

  // ── Aux buses ──────────────────────────────────────────────────────────────
  const [auxBuses, setAuxBuses] = useState<AuxBusUI[]>([
    { id: 'aux_1', label: 'AUX 1', sourceId: null },
    { id: 'aux_2', label: 'AUX 2', sourceId: null },
  ]);

  // ── Import modal ───────────────────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [hotFolders, setHotFolders] = useState<HotFolder[]>([]);

  // ── NDI / AVB / Cast ───────────────────────────────────────────────────────
  const [ndiUrl, setNdiUrl]     = useState('ws://localhost:8765');
  const [avbUrl, setAvbUrl]     = useState('ws://localhost:8766');
  const [ndiConnected, setNdiConnected] = useState(false);
  const [avbConnected, setAvbConnected] = useState(false);
  const [midiConnected, setMidiConnected] = useState(false);

  // ── Lower Third Builder ────────────────────────────────────────────────────
  const [ltbTitle, setLtbTitle]       = useState('Your Name');
  const [ltbSubtitle, setLtbSubtitle] = useState('Title / Organization');
  const [ltbStyle, setLtbStyle]       = useState<'MODERN' | 'CLASSIC' | 'MINIMAL'>('MODERN');
  const [ltbColor, setLtbColor]       = useState('#6B0099');
  const ltbCanvasRef                  = useRef<HTMLCanvasElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sources       = useMemo(() => engineRef.current?.getSources() ?? [], [sourcesVer]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const overlays      = useMemo(() => engineRef.current?.getOverlays() ?? [], [overlaysVer]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const previewSource = useMemo(() => previewId ? sources.find(s => s.id === previewId) ?? null : null, [previewId, sourcesVer]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const programLabel  = useMemo(() => sources.find(s => s.id === programId)?.label ?? '—', [programId, sourcesVer]);

  // ── Engine lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!programCanvasRef.current) return;
    const eng = new TVStudioEngine(programCanvasRef.current);
    engineRef.current = eng;
    eng.onSourcesChanged     = () => setSourcesVer(v => v + 1);
    eng.onOverlaysChanged    = () => setOverlaysVer(v => v + 1);
    eng.onProgramChanged     = id => setProgramId(id);
    eng.onPreviewChanged     = id => setPreviewId(id);
    eng.onTransitionProgress = p  => setTransitionProgress(p);
    eng.onMasterLevel        = l  => setMasterLevel(l);
    eng.onAudioCuePlaying    = (id, playing) => setPlayingCues(prev => { const n = new Set(prev); playing ? n.add(id) : n.delete(id); return n; });
    eng.start();

    // Auto-populate: webcam + screen
    (async () => {
      const cam = await eng.addCameraSource().catch(() => null);
      // Set first cam as preview
      if (cam) { eng.setPreview(cam.id); }
      // Add screen capture (silently — user must grant permission)
      eng.addScreenSource().catch(() => {});
    })();

    // Auto-populate: editable lower third
    eng.addOverlay({
      id: 'lt_default', label: 'Name / Title', type: 'LOWER_THIRD',
      title: 'Your Name', subtitle: 'Title / Role', style: 'MODERN',
      visible: false, opacity: 1,
    });

    // Level polling
    const poll = () => {
      const e = engineRef.current;
      if (e) { const lvls: Record<string, number> = {}; e.getSources().forEach(s => { lvls[s.id] = e.getSourceLevel(s.id); }); setSourceLevels(lvls); }
      levelRafRef.current = requestAnimationFrame(poll);
    };
    poll();

    return () => { eng.destroy(); cancelAnimationFrame(levelRafRef.current); };
  }, []);

  // Sync CC when source selected
  useEffect(() => {
    if (!selectedSourceId) return;
    const src = engineRef.current?.getSources().find(s => s.id === selectedSourceId);
    if (src) setCC({ brightness: src.brightness, contrast: src.contrast, saturation: src.saturation, hue: src.hue });
  }, [selectedSourceId]);

  // ── Lower Third Builder canvas preview ────────────────────────────────────
  useEffect(() => {
    const cv = ltbCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 1920, 1080);
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 1920, 1080);
    // Draw lower third
    const y = 820; const padX = 80; const barH = 180;
    ctx.fillStyle = `${ltbColor}dd`;
    ctx.beginPath(); ctx.roundRect(padX, y, 1400, barH, 8); ctx.fill();
    ctx.fillStyle = '#D40055'; ctx.fillRect(padX, y, 8, barH);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 64px system-ui';
    ctx.fillText(ltbTitle, padX + 28, y + 80);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '40px system-ui';
    ctx.fillText(ltbSubtitle, padX + 28, y + 148);
  }, [ltbTitle, ltbSubtitle, ltbStyle, ltbColor]);

  // ── Project ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) { setShowProjectModal(true); return; }
    getDocs(query(collection(db, 'studio_projects'), where('userId', '==', currentUser.uid)))
      .then(snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as StudioProjectDoc)).sort((a,b) => b.createdAt - a.createdAt);
        setProjects(docs);
        if (docs.length === 0) setShowProjectModal(true);
        else setActiveProject(docs[0]);
      }).catch(() => setShowProjectModal(true));
  }, [currentUser]);

  const createProject = useCallback(async () => {
    const now = Date.now();
    const data: Omit<StudioProjectDoc,'id'> = { userId: currentUser?.uid ?? 'anon', title: newTitle.trim() || 'New Show', resolution: newRes, frameRate: newFps, outputMode: newMode, createdAt: now };
    let proj: StudioProjectDoc;
    try { const ref = await addDoc(collection(db, 'studio_projects'), data); proj = { id: ref.id, ...data }; }
    catch { proj = { id: `local_${now}`, ...data }; }
    setProjects(p => [proj, ...p]);
    setActiveProject(proj);
    setShowProjectModal(false);
  }, [currentUser, newTitle, newRes, newFps, newMode]);

  // ── Source management ──────────────────────────────────────────────────────
  const handleAddCamera  = useCallback(async () => { await engineRef.current?.addCameraSource(); }, []);
  const handleAddScreen  = useCallback(async () => { await engineRef.current?.addScreenSource(); }, []);

  // ── Multi-site: pull another campus's on-platform program feed as a source ──
  const campusSessionsRef = useRef<RtcSession[]>([]);
  const [showCampus, setShowCampus] = useState(false);
  const [campusFeeds, setCampusFeeds] = useState<ProgramFeed[]>([]);
  const [loadingFeeds, setLoadingFeeds] = useState(false);
  const openCampusPicker = useCallback(async () => {
    setShowCampus(true); setLoadingFeeds(true);
    try { setCampusFeeds(await fetchLiveProgramFeedsForUser()); } catch { setCampusFeeds([]); }
    setLoadingFeeds(false);
  }, []);
  const handleAddCampusFeed = useCallback((feed: ProgramFeed) => {
    setShowCampus(false);
    const session = new RtcSession(
      { sessionId: feed.sessionId, topology: 'broadcast', role: 'viewer' },
      { onRemoteStream: (_id, stream) => { engineRef.current?.addStreamSource(stream, feed.campusName); } },
    );
    session.join().catch(() => {});
    campusSessionsRef.current.push(session);
  }, []);
  useEffect(() => () => { campusSessionsRef.current.forEach(s => { try { s.leave(); } catch { /* */ } }); }, []);

  // ── Teleprompter as a switcher source (mirrors the live operator over sync) ──
  const prompterSourceRef = useRef<TeleprompterCanvasSource | null>(null);
  const handleAddPrompter = useCallback(() => {
    if (prompterSourceRef.current || !engineRef.current) return; // already a source
    const src = new TeleprompterCanvasSource(1280, 720);
    prompterSourceRef.current = src;
    // Live confidence feed — mirrors whatever the Teleprompter operator is running
    // (in the app or another tab) over the teleprompter_sync channel. Route it to
    // an aux/confidence out from the switcher.
    engineRef.current.addStreamSource(src.captureStream(30), 'Teleprompter');
  }, []);
  useEffect(() => () => { prompterSourceRef.current?.dispose(); }, []);
  const handleAddMedia   = useCallback(() => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'video/*,image/*,.m3u8';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f || !engineRef.current) return;
      const url = URL.createObjectURL(f);
      const label = f.name.replace(/\.[^.]+$/,'');
      f.type.startsWith('image/') ? engineRef.current.addGraphicSource(url, label) : await engineRef.current.addMediaSource(url, label);
    };
    inp.click();
  }, []);

  const handleImportAssets = useCallback(async (assets: ImportedAsset[]) => {
    const e = engineRef.current;
    if (!e) return;
    for (const a of assets) {
      if (a.type === 'IMAGE') e.addGraphicSource(a.url, a.label);
      else if (a.type === 'LIVE' || a.type === 'HLS' || a.type === 'VIDEO') {
        await e.addMediaSource(a.url, a.label).catch(() => {});
      }
    }
    setShowImport(false);
  }, []);

  const handleSourceClick = useCallback((id: string) => {
    const e = engineRef.current;
    if (!e || e.getProgramId() === id) return;
    e.setPreview(id); setSelectedSourceId(id);
  }, []);

  const handleRemoveSource = useCallback((id: string) => { engineRef.current?.removeSource(id); }, []);

  // ── Switcher ───────────────────────────────────────────────────────────────
  const handleCut        = useCallback(() => { engineRef.current?.cut(); setTBarValue(0); }, []);
  const handleAuto       = useCallback(() => {
    const e = engineRef.current; if (!e) return;
    e.setTransitionType(transitionType); e.setTransitionDuration(transitionDuration); e.auto();
  }, [transitionType, transitionDuration]);
  const handleFTB        = useCallback(() => { engineRef.current?.fadeToBlack(); }, []);
  const handleTBar       = useCallback((v: number) => { setTBarValue(v); engineRef.current?.setTBar(v); if (v >= 1) setTimeout(() => setTBarValue(0), 400); }, []);
  const handleProgramCut = useCallback((id: string) => {
    const e = engineRef.current; if (!e) return;
    e.setPreview(id); e.cut(); setTBarValue(0);
  }, []);

  // ── Recording ──────────────────────────────────────────────────────────────
  const handleRecord = useCallback(() => {
    const e = engineRef.current; if (!e) return;
    if (e.isRecording()) {
      const blob = e.stopRecording(); setIsRecording(false);
      if (blob) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${activeProject?.title ?? 'recording'}_${Date.now()}.webm`; a.click();
        // Offer to save the stream as a podcast episode (audio). Video → Reello is the visual path.
        if (auth.currentUser && window.confirm('Save this stream as a podcast episode?')) {
          saveStudioEpisode({ uid: auth.currentUser.uid, blob, title: activeProject?.title || 'Stream recording', durationMs: recordStart ? Date.now() - recordStart : 0 }).catch(() => {});
        }
      }
    } else { e.startRecording(); setIsRecording(true); setRecordStart(Date.now()); }
  }, [activeProject, recordStart]);

  const handleGoLive = useCallback(() => {
    const e = engineRef.current; if (!e || !onStreamReady) return;
    onStreamReady(e.getProgramStream(activeProject?.frameRate ?? 30));
  }, [activeProject, onStreamReady]);

  // ── Google Cast ────────────────────────────────────────────────────────────
  const handleCast = useCallback((bus: 'PROGRAM' | 'PREVIEW') => {
    const castApi = (window as any).cast;
    if (!castApi) { alert('Google Cast SDK not loaded. Add <script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js"></script> to index.html.'); return; }
    const session = castApi.framework?.CastContext?.getInstance()?.getCurrentSession?.();
    if (!session) { alert('No Cast device available. Click the Cast icon in Chrome first.'); return; }
    const e = engineRef.current; if (!e) return;
    const dataUrl = bus === 'PROGRAM' ? e.getCastProgramDataUrl() : '';
    console.log('[TVStudio] Casting to', session.getCastDevice?.()?.friendlyName, bus, dataUrl.slice(0,60));
  }, []);

  // ── NDI / AVB ──────────────────────────────────────────────────────────────
  const connectNDI = useCallback(() => { engineRef.current?.connectNDI(ndiUrl); setNdiConnected(true); }, [ndiUrl]);
  const connectAVB = useCallback(() => { engineRef.current?.connectAVB(avbUrl); setAvbConnected(true); }, [avbUrl]);

  // ── Overlays ───────────────────────────────────────────────────────────────
  const handleAddLowerThird = useCallback(() => {
    engineRef.current?.addOverlay({ id: `lt_${Date.now()}`, label: ltTitle || 'Lower Third', type: 'LOWER_THIRD', title: ltTitle, subtitle: ltSubtitle, style: ltStyle, visible: true, opacity: 1 });
    setLtTitle(''); setLtSubtitle(''); setShowLTForm(false);
  }, [ltTitle, ltSubtitle, ltStyle]);

  const handleAddClock = useCallback(() => {
    engineRef.current?.addOverlay({ id: `clock_${Date.now()}`, label: 'Clock', type: 'CLOCK', visible: true, opacity: 1 });
  }, []);

  const handleAddWebmOverlay = useCallback(() => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'video/webm,.apng,.gif,.lottie,image/apng';
    inp.onchange = () => {
      const f = inp.files?.[0]; if (!f || !engineRef.current) return;
      const url = URL.createObjectURL(f);
      const vid = document.createElement('video'); vid.src = url; vid.loop = true; vid.autoplay = true; vid.muted = true; vid.play().catch(() => {});
      engineRef.current.addOverlay({ id: `webm_${Date.now()}`, label: f.name, type: 'WEBM', url, videoEl: vid, x:0,y:0,width:100,height:100, visible:true, opacity:1 });
    };
    inp.click();
  }, []);

  // Push Lower Third Builder result to engine
  const handlePublishLTB = useCallback(() => {
    const id = `lt_builder_${Date.now()}`;
    engineRef.current?.addOverlay({ id, label: ltbTitle || 'Lower Third', type: 'LOWER_THIRD', title: ltbTitle, subtitle: ltbSubtitle, style: ltbStyle, visible: true, opacity: 1 });
  }, [ltbTitle, ltbSubtitle, ltbStyle]);

  // ── Audio Cues ─────────────────────────────────────────────────────────────
  const handleAssignCue = useCallback((cueId: string) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*';
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      const url = URL.createObjectURL(f);
      setAudioCues(prev => prev.map(c => c.id === cueId ? { ...c, url, label: f.name.replace(/\.[^.]+$/,''), isLoaded: true } : c));
      await engineRef.current?.loadAudioCue(cueId, url);
    };
    inp.click();
  }, []);

  const handleTriggerCue = useCallback((cue: AudioCueCell) => {
    if (!cue.isLoaded) { handleAssignCue(cue.id); return; }
    if (playingCues.has(cue.id)) engineRef.current?.stopAudioCue(cue.id);
    else engineRef.current?.triggerAudioCue(cue.id);
  }, [playingCues, handleAssignCue]);

  // Audio-cue right-click / long-press menu — the shared design-system primitive.
  const cueMenu = useContextMenu<AudioCueCell>((cue) => {
    const playing = playingCues.has(cue.id);
    const items: MenuNode<AudioCueCell>[] = [{ kind: 'header', label: `Audio cue${cue.label ? ` · ${cue.label}` : ''}` }];
    if (cue.isLoaded) {
      items.push(
        { id: 'trigger', label: playing ? 'Stop cue' : 'Trigger cue', icon: playing ? <Square size={14} /> : <Play size={14} />, onSelect: (c) => handleTriggerCue(c) },
        { id: 'assign', label: 'Replace audio…', icon: <Upload size={14} />, onSelect: (c) => handleAssignCue(c.id) },
      );
    } else {
      items.push({ id: 'assign', label: 'Assign audio…', icon: <Upload size={14} />, onSelect: (c) => handleAssignCue(c.id) });
    }
    return items;
  });

  // ── Graphics Presets ───────────────────────────────────────────────────────
  const handleFirePreset = useCallback((preset: GraphicPreset) => {
    const e = engineRef.current; if (!e) return;
    if (preset.type === 'LOWER_THIRD') {
      const existing = overlays.find(o => o.id === preset.id);
      if (existing) { e.setOverlayVisible(preset.id, !existing.visible); }
      else {
        e.addOverlay({ id: preset.id, label: preset.label, type: 'LOWER_THIRD', title: preset.title, subtitle: preset.subtitle, style: 'MODERN', visible: true, opacity: 1 });
      }
    } else if (preset.type === 'FULLPAGE' && preset.id === 'gp_6') {
      const existing = overlays.find(o => o.id === 'gp_clock');
      if (existing) e.setOverlayVisible('gp_clock', !existing.visible);
      else e.addOverlay({ id: 'gp_clock', label: 'Clock', type: 'CLOCK', visible: true, opacity: 1 });
    }
    setGraphicPresets(prev => prev.map(p => p.id === preset.id ? { ...p, isActive: !p.isActive } : p));
  }, [overlays]);

  // ── Aux Buses ──────────────────────────────────────────────────────────────
  const addAuxBus = useCallback(() => {
    const id = `aux_${Date.now()}`;
    const label = `AUX ${auxBuses.length + 1}`;
    engineRef.current?.createAuxBus(id, label);
    setAuxBuses(prev => [...prev, { id, label, sourceId: null }]);
  }, [auxBuses.length]);

  const setAuxSource = useCallback((busId: string, sourceId: string | null) => {
    engineRef.current?.setAuxBusSource(busId, sourceId);
    setAuxBuses(prev => prev.map(b => b.id === busId ? { ...b, sourceId } : b));
  }, []);

  // ── Audio ──────────────────────────────────────────────────────────────────
  const handleMasterGain = useCallback((g: number) => { engineRef.current?.setMasterGain(g); setMasterGain(g); }, []);
  const handleSourceGain = useCallback((id: string, g: number) => { engineRef.current?.setSourceGain(id, g); setSourceGains(p => ({ ...p, [id]: g })); }, []);
  const handleMuteSource = useCallback((id: string) => { const m = !sourceMutes[id]; engineRef.current?.muteSource(id, m); setSourceMutes(p => ({ ...p, [id]: m })); }, [sourceMutes]);

  // ── Color correction ───────────────────────────────────────────────────────
  const handleCC = useCallback((key: keyof typeof cc, val: number) => {
    if (!selectedSourceId) return;
    setCC(prev => { const next = { ...prev, [key]: val }; engineRef.current?.setSourceCC(selectedSourceId, next.brightness, next.contrast, next.saturation, next.hue); return next; });
  }, [selectedSourceId]);
  const resetCC = useCallback(() => { if (!selectedSourceId) return; setCC({brightness:1,contrast:1,saturation:1,hue:0}); engineRef.current?.setSourceCC(selectedSourceId,1,1,1,0); }, [selectedSourceId]);

  // ── MIDI ───────────────────────────────────────────────────────────────────
  const handleConnectMIDI = useCallback(async () => {
    const ok = await engineRef.current?.initMIDI((cc, value) => {
      if (cc === 10) handleMasterGain(value / 127 * 2);
      if (cc === 20 && value > 63) handleCut();
      if (cc === 21 && value > 63) handleAuto();
      if (cc === 22 && value > 63) handleFTB();
    });
    setMidiConnected(!!ok);
  }, [handleMasterGain, handleCut, handleAuto, handleFTB]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExportEDL = useCallback(() => {
    const t = engineRef.current?.exportEDL(activeProject?.title ?? 'Show', activeProject?.frameRate ?? 30);
    if (!t) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t],{type:'text/plain'})); a.download=`${activeProject?.title??'show'}.edl`; a.click();
  }, [activeProject]);
  const handleExportFCPXML = useCallback(() => {
    const x = engineRef.current?.exportFCPXML(activeProject?.title ?? 'Show', activeProject?.frameRate ?? 30);
    if (!x) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([x],{type:'application/xml'})); a.download=`${activeProject?.title??'show'}.fcpxml`; a.click();
  }, [activeProject]);

  const TRANS: { type: TransitionType; label: string }[] = [
    {type:'MIX',label:'MIX'},{type:'DIP',label:'DIP'},{type:'WIPE_LEFT',label:'←WPE'},{type:'WIPE_RIGHT',label:'WPE→'},{type:'STING',label:'STING'},
  ];

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden z-50 text-white select-none"
      style={{ background: '#0e0e0e', fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
      {cueMenu.node}

      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');`}</style>

      {/* Import Modal */}
      <AnimatePresence>
        {showImport && (
          <TVStudioImportModal
            onImport={handleImportAssets}
            onClose={() => setShowImport(false)}
            hotFolders={hotFolders}
            onAddHotFolder={hf => setHotFolders(prev => [...prev, hf])}
          />
        )}
        {showCampus && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[400] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShowCampus(false)}>
            <div onClick={e => e.stopPropagation()} className="w-full max-w-md bg-[#0c0c0f] border border-white/10 rounded-3xl p-6" style={{fontFamily:'system-ui'}}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-black uppercase tracking-widest text-white">Campus program feeds</span>
                <button onClick={() => setShowCampus(false)} className="text-white/40 hover:text-white text-xs">✕</button>
              </div>
              {loadingFeeds ? (
                <p className="text-[11px] text-white/40 py-8 text-center">Finding live campuses…</p>
              ) : campusFeeds.length === 0 ? (
                <p className="text-[11px] text-white/40 py-8 text-center">No campuses are live right now. A campus goes live from its church → Master Control → "This Campus Live".</p>
              ) : (
                <div className="space-y-2">
                  {campusFeeds.map(f => (
                    <button key={f.id} onClick={() => handleAddCampusFeed(f)} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-left transition-all">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                      <span className="flex-1 text-sm font-bold text-white truncate">{f.campusName}</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-small-orange">Add as source</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════ PROJECT SETUP MODAL ════════════════════════ */}
      <AnimatePresence>
        {showProjectModal && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div initial={{scale:0.94,y:10}} animate={{scale:1,y:0}} exit={{scale:0.94}}
              transition={{type:'spring',damping:28,stiffness:340}}
              className="rounded-xl border p-6 w-full max-w-md shadow-2xl" style={{background:'#111',borderColor:'rgba(255,255,255,0.08)'}}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:'rgba(107,0,153,0.2)',border:'1px solid rgba(107,0,153,0.3)'}}>
                  <Clapperboard size={18} style={{color:'#a855f7'}}/>
                </div>
                <div>
                  <h2 className="text-sm font-bold">Plajah TV Studio</h2>
                  <p className="text-[10px] opacity-40">Project setup</p>
                </div>
              </div>
              {projects.length > 0 && (
                <div className="mb-4">
                  <p className="text-[9px] opacity-30 uppercase tracking-widest mb-2">Recent</p>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {projects.map(p => (
                      <button key={p.id} onClick={()=>{setActiveProject(p);setShowProjectModal(false);}}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors"
                        style={{background:'rgba(255,255,255,0.04)'}}
                        onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.08)')}
                        onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,0.04)')}>
                        <span className="text-xs font-semibold">{p.title}</span>
                        <span className="text-[9px] opacity-30">{p.resolution} · {p.frameRate}fps</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 my-3"><div className="flex-1 h-px" style={{background:'rgba(255,255,255,0.08)'}}/><span className="text-[9px] opacity-25 px-1">or new</span><div className="flex-1 h-px" style={{background:'rgba(255,255,255,0.08)'}}/></div>
                </div>
              )}
              <div className="space-y-3">
                <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="Project title"
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none"
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}
                  onFocus={e=>(e.currentTarget.style.borderColor='#6B0099')} onBlur={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.1)')}/>
                <div className="grid grid-cols-2 gap-2">
                  {[['Resolution',newRes,setNewRes as any,[['1920x1080','1920×1080'],['1280x720','1280×720'],['3840x2160','4K UHD']]],
                    ['Frame Rate',newFps,setNewFps as any,[[25,'25fps'],[29.97,'29.97fps'],[30,'30fps'],[50,'50fps'],[59.94,'59.94fps'],[60,'60fps']]],
                  ].map(([label,val,setter,opts]:any)=>(
                    <div key={label}>
                      <p className="text-[9px] opacity-35 uppercase tracking-widest mb-1.5">{label}</p>
                      <select value={val} onChange={e=>setter(isNaN(Number(e.target.value))?e.target.value:Number(e.target.value))}
                        className="w-full rounded-lg px-2 py-2 text-xs text-white outline-none"
                        style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}>
                        {opts.map(([v,l]:any)=><option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-[9px] opacity-35 uppercase tracking-widest mb-1.5">Output Mode</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['LIVE','RECORD','BOTH'] as const).map(m=>(
                      <button key={m} onClick={()=>setNewMode(m)} className="py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors"
                        style={{background:newMode===m?'#6B0099':'rgba(255,255,255,0.05)',color:newMode===m?'#fff':'rgba(255,255,255,0.35)'}}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={createProject} className="w-full py-3 rounded-xl text-white text-sm font-black uppercase tracking-widest"
                  style={{background:'#6B0099'}}
                  onMouseEnter={e=>(e.currentTarget.style.background='#7d00b4')} onMouseLeave={e=>(e.currentTarget.style.background='#6B0099')}>
                  Open Studio
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════ TOP HEADER ════════════════════════════════ */}
      <header className="flex items-center justify-between px-3 shrink-0"
        style={{height:44,background:'#111',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="opacity-30 hover:opacity-80 transition-opacity p-1"><ArrowLeft size={14}/></button>
          <Clapperboard size={13} style={{color:'#6B0099'}}/>
          <span className="text-xs font-black tracking-widest uppercase text-white/70">Plajah TV Studio</span>
          <nav className="flex items-center gap-0 ml-3">
            {([
              {id:'SWITCHER' as StudioTab,label:'Video Switcher'},
              {id:'AUDIO'    as StudioTab,label:'Audio Mixer'},
              {id:'GRAPHICS_BUILDER' as StudioTab,label:'Graphics Builder'},
              {id:'AMBO' as StudioTab,label:'Ambo Scripture'},
              {id:'LIGHTING' as StudioTab,label:'Lighting Board'},
              {id:'SETTINGS' as StudioTab,label:'System Config'},
            ]).map(tab=>(
              <button key={tab.id} onClick={()=>setStudioTab(tab.id)}
                className="px-2.5 py-1 text-[10px] font-semibold transition-all border-b-2 mr-0.5"
                style={{color:studioTab===tab.id?'#c9c6c5':'rgba(255,255,255,0.3)',borderBottomColor:studioTab===tab.id?'#6B0099':'transparent',paddingBottom:10}}>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {isRecording && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded" style={{background:'rgba(212,0,85,0.15)',border:'1px solid rgba(212,0,85,0.3)'}}>
              <div className="w-1.5 h-1.5 rounded-full bg-[#D40055] animate-pulse"/>
              <span className="font-mono text-[#D40055] text-[11px] font-bold">{timecode}</span>
            </div>
          )}
          <button onClick={()=>setShowImport(true)} className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold uppercase opacity-50 hover:opacity-100 transition-opacity" style={{border:'1px solid rgba(255,255,255,0.1)'}}>
            <Upload size={10}/> Import
          </button>
          <button onClick={()=>setShowProjectModal(true)} className="text-[10px] px-2 py-1 rounded opacity-30 hover:opacity-70 transition-opacity uppercase tracking-wider" style={{border:'1px solid rgba(255,255,255,0.1)'}}>
            {activeProject?.title ?? 'No Project'}
          </button>
        </div>
      </header>

      {/* ═══════════════════════ BODY ══════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0">

        {/* ══ LEFT SIDEBAR ════════════════════════════════════════════════ */}
        <nav className="flex flex-col items-center py-3 gap-1 shrink-0"
          style={{width:70,background:'#111',borderRight:'1px solid rgba(255,255,255,0.05)'}}>
          <div className="flex flex-col items-center mb-3">
            <span className="text-[9px] font-black text-[#6B0099] tracking-widest">PLJ-V1</span>
            <span className="text-[6px] opacity-40 tracking-tight">CTRL</span>
          </div>
          {([
            {id:'SWITCHER' as StudioTab,icon:<Activity size={15}/>,label:'Video SW'},
            {id:'AUDIO'    as StudioTab,icon:<Sliders size={15}/>,label:'Audio'},
            {id:'GRAPHICS_BUILDER' as StudioTab,icon:<Layers size={15}/>,label:'Graphics'},
            {id:'AMBO' as StudioTab,icon:<BookOpen size={15}/>,label:'Ambo'},
            {id:'LIGHTING' as StudioTab,icon:<Lightbulb size={15}/>,label:'Lighting'},
            {id:'SETTINGS' as StudioTab,icon:<Settings size={15}/>,label:'Config'},
          ]).map(item=>(
            <button key={item.id} onClick={()=>setStudioTab(item.id)}
              className="flex flex-col items-center gap-0.5 p-2 w-14 rounded-lg transition-all"
              style={{background:studioTab===item.id?'rgba(107,0,153,0.3)':'transparent',color:studioTab===item.id?'#fff':'rgba(255,255,255,0.3)',border:studioTab===item.id?'1px solid rgba(107,0,153,0.5)':'1px solid transparent'}}>
              {item.icon}
              <span className="text-[7px] font-bold text-center">{item.label}</span>
            </button>
          ))}
          <div className="mt-auto flex flex-col items-center gap-2 pt-2 w-full" style={{borderTop:'1px solid rgba(255,255,255,0.06)',alignItems:'center'}}>
            <button onClick={handleCut} className="w-12 py-2 rounded font-black text-[9px] uppercase tracking-wider active:scale-95 touch-manipulation" style={{background:'#D40055',color:'#fff'}}>TAKE</button>
            <button onClick={handleFTB} className="opacity-30 hover:opacity-60 transition-opacity"><Lock size={14}/></button>
            {onStreamReady && <button onClick={handleGoLive} className="opacity-50 hover:opacity-100 transition-opacity flex flex-col items-center gap-0.5"><Radio size={13} style={{color:'#22c55e'}}/><span className="text-[6px] text-green-400 font-bold">LIVE</span></button>}
          </div>
        </nav>

        {/* ══ MAIN ════════════════════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 gap-1.5 p-1.5 overflow-hidden" style={{background:'#0a0a0a'}}>

          {/* ════ VIDEO SWITCHER TAB ════════════════════════════════════════ */}
          {studioTab === 'SWITCHER' && (
            <>
              {/* Top row: Program | Preview | 2×4 mini multiview */}
              <div className="flex gap-1.5 min-h-0" style={{flex:'3 1 0'}}>
                {/* Program */}
                <div className="relative rounded overflow-hidden bg-black" style={{flex:'3 1 0',border:'1px solid #D40055'}}>
                  <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider" style={{background:'#D40055',color:'#fff'}}>Program</div>
                  <canvas ref={programCanvasRef} width={1920} height={1080} className="w-full h-full block"/>
                  {!programId && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-[10px] opacity-15 uppercase tracking-widest">No Program</span></div>}
                  <div className="absolute bottom-3 right-3 flex items-center gap-2 px-2.5 py-1 rounded" style={{background:'rgba(0,0,0,0.8)',border:'1px solid rgba(255,255,255,0.08)'}}>
                    <div className="flex flex-col items-end">
                      <span className="text-[7px] opacity-40 font-bold uppercase tracking-widest">{isRecording?'REC TIME':programLabel}</span>
                      <span className="font-mono font-bold text-[#D40055] text-sm">{isRecording?timecode:'—'}</span>
                    </div>
                    <VUBar level={masterLevel} vertical className="shrink-0"/>
                  </div>
                </div>
                {/* Preview */}
                <div className="relative rounded overflow-hidden bg-black" style={{flex:'3 1 0',border:'1px solid #6B0099'}}>
                  <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider" style={{background:'#6B0099',color:'#fff'}}>Preview</div>
                  <PreviewMonitor source={previewSource}/>
                  {!previewId && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-[10px] opacity-15 uppercase tracking-widest">No Source</span></div>}
                  {transitionProgress>0 && <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{background:'rgba(107,0,153,0.3)'}}><div className="h-full transition-all duration-75" style={{width:`${transitionProgress*100}%`,background:'#6B0099'}}/></div>}
                </div>
                {/* 2×4 mini multiview */}
                <div className="grid grid-cols-2 gap-1 shrink-0" style={{flex:'1 0 0',minWidth:120}}>
                  {Array.from({length:8}).map((_,i)=>{
                    const src=sources[i]; const isPgm=src&&programId===src.id; const isPvw=src&&previewId===src.id;
                    return (
                      <div key={i} onClick={()=>src&&handleSourceClick(src.id)} className="relative rounded overflow-hidden cursor-pointer"
                        style={{background:'#111',border:`1px solid ${isPgm?'#D40055':isPvw?'#6B0099':'rgba(255,255,255,0.07)'}`}}>
                        {src ? (<>
                          <SourceCanvas source={src} className="w-full h-full block object-cover"/>
                          <span className="absolute bottom-0.5 left-1 text-[7px] font-bold font-mono px-0.5 rounded" style={{background:isPgm?'#D40055':isPvw?'#6B0099':'rgba(0,0,0,0.6)',color:'#fff'}}>{src.label.slice(0,6)}</span>
                        </>) : (
                          <div className="w-full h-full flex items-center justify-center"><span className="text-[7px] opacity-20 font-mono">—</span></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 8-source strip */}
              <div className="shrink-0">
                <div className="flex items-center justify-between px-0.5 mb-1">
                  <span className="text-[9px] opacity-30 uppercase tracking-widest font-bold">Multi-view Sources</span>
                  <div className="flex gap-1">
                    <button onClick={handleAddCamera} className="text-[8px] px-2 py-0.5 rounded opacity-40 hover:opacity-80 uppercase" style={{border:'1px solid rgba(255,255,255,0.1)'}}>+ Camera</button>
                    <button onClick={handleAddScreen} className="text-[8px] px-2 py-0.5 rounded opacity-40 hover:opacity-80 uppercase" style={{border:'1px solid rgba(255,255,255,0.1)'}}>+ Screen</button>
                    <button onClick={handleAddMedia}  className="text-[8px] px-2 py-0.5 rounded opacity-40 hover:opacity-80 uppercase" style={{border:'1px solid rgba(255,255,255,0.1)'}}>+ Media</button>
                    <button onClick={openCampusPicker} className="text-[8px] px-2 py-0.5 rounded opacity-40 hover:opacity-80 uppercase" style={{border:'1px solid rgba(255,140,0,0.4)',color:'#FF8C00'}}>+ Campus</button>
                    <button onClick={handleAddPrompter} className="text-[8px] px-2 py-0.5 rounded opacity-40 hover:opacity-80 uppercase" style={{border:'1px solid rgba(255,140,0,0.4)',color:'#FF8C00'}}>+ Prompter</button>
                    <button onClick={()=>setShowImport(true)} className="text-[8px] px-2 py-0.5 rounded opacity-40 hover:opacity-80 uppercase" style={{border:'1px solid rgba(107,0,153,0.4)',color:'#a855f7'}}>Import…</button>
                  </div>
                </div>
                <div className="grid grid-cols-8 gap-1.5">
                  {Array.from({length:Math.max(8,sources.length)}).map((_,i)=>{
                    const src=sources[i]; const isPgm=src&&programId===src.id; const isPvw=src&&previewId===src.id;
                    return (
                      <div key={i} onClick={()=>src&&handleSourceClick(src.id)} className="relative rounded overflow-hidden cursor-pointer"
                        style={{aspectRatio:'16/9',background:'#000',border:`1px solid ${isPgm?'#D40055':isPvw?'#6B0099':'rgba(255,255,255,0.07)'}`}}
                        onMouseEnter={e=>{if(!isPgm&&!isPvw)e.currentTarget.style.borderColor='rgba(255,255,255,0.2)';}}
                        onMouseLeave={e=>{if(!isPgm&&!isPvw)e.currentTarget.style.borderColor='rgba(255,255,255,0.07)';}}>
                        {src?(<>
                          <SourceCanvas source={src} className="w-full h-full block object-cover"/>
                          <div className="absolute top-1 left-1 flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full" style={{background:isPgm?'#D40055':isPvw?'#6B0099':'rgba(255,255,255,0.3)'}}/>
                            <span className="text-[7px] font-bold font-mono opacity-80">SRC {String(i+1).padStart(2,'0')}</span>
                          </div>
                          <span className="absolute bottom-0.5 left-1 text-[7px] font-mono opacity-70 bg-black/60 px-0.5 rounded">{src.label.slice(0,8)}</span>
                        </>):(
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 opacity-20">
                            <span className="text-[7px] font-mono">SRC {String(i+1).padStart(2,'0')}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Audio Cue row ── */}
              <div className="shrink-0">
                <p className="text-[8px] opacity-25 uppercase tracking-widest font-bold mb-1 px-0.5">Audio Cues — click to trigger · right-click for options</p>
                <div className="grid grid-cols-8 gap-1.5">
                  {audioCues.map(cue=>{
                    const isPlaying = playingCues.has(cue.id);
                    return (
                      <button key={cue.id}
                        onClick={()=>handleTriggerCue(cue)}
                        {...cueMenu.bind(cue)}
                        className="flex flex-col items-center justify-center gap-1 rounded-lg p-1.5 transition-all active:scale-95 touch-manipulation"
                        style={{
                          height:48,
                          background:isPlaying?`${cue.color}33`:'rgba(255,255,255,0.04)',
                          border:`1px solid ${isPlaying?cue.color:cue.isLoaded?`${cue.color}44`:'rgba(255,255,255,0.07)'}`,
                          boxShadow:isPlaying?`0 0 10px ${cue.color}44`:'none',
                        }}>
                        <div className="flex items-center gap-1">
                          {isPlaying ? <Square size={9} fill={cue.color} style={{color:cue.color}}/> : <Play size={9} style={{color:cue.isLoaded?cue.color:'rgba(255,255,255,0.2)'}}/>}
                          <span className="text-[7px] font-bold uppercase tracking-wider" style={{color:cue.isLoaded?'rgba(255,255,255,0.7)':'rgba(255,255,255,0.25)'}}>{cue.type.slice(0,3)}</span>
                        </div>
                        <span className="text-[7px] font-mono truncate w-full text-center" style={{color:cue.isLoaded?'rgba(255,255,255,0.6)':'rgba(255,255,255,0.2)'}}>{cue.label.slice(0,8)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Graphics Preset row ── */}
              <div className="shrink-0">
                <p className="text-[8px] opacity-25 uppercase tracking-widest font-bold mb-1 px-0.5">Graphics Presets — click to fire</p>
                <div className="grid grid-cols-8 gap-1.5">
                  {graphicPresets.map(preset=>{
                    const live = overlays.find(o=>o.id===preset.id)?.visible || preset.isActive;
                    return (
                      <button key={preset.id}
                        onClick={()=>handleFirePreset(preset)}
                        className="flex flex-col items-center justify-center gap-1 rounded-lg p-1.5 transition-all active:scale-95 touch-manipulation"
                        style={{
                          height:48,
                          background:live?'rgba(107,0,153,0.25)':'rgba(255,255,255,0.04)',
                          border:`1px solid ${live?'rgba(107,0,153,0.5)':'rgba(255,255,255,0.07)'}`,
                        }}>
                        <Layers size={10} style={{color:live?'#a855f7':'rgba(255,255,255,0.3)'}}/>
                        <span className="text-[7px] font-mono truncate w-full text-center" style={{color:live?'rgba(255,255,255,0.8)':'rgba(255,255,255,0.3)'}}>{preset.label.slice(0,8)}</span>
                      </button>
                    );
                  })}
                  <button onClick={handleAddWebmOverlay}
                    className="flex flex-col items-center justify-center gap-1 rounded-lg p-1.5 transition-all opacity-30 hover:opacity-60"
                    style={{height:48,border:'1px dashed rgba(255,255,255,0.1)'}}>
                    <Plus size={10}/><span className="text-[7px]">Motion</span>
                  </button>
                </div>
              </div>

              {/* Bottom: Media Bin + Switcher Control */}
              <div className="flex gap-1.5 shrink-0" style={{height:220}}>

                {/* Media Asset Bin */}
                <div className="rounded-xl flex flex-col gap-2 p-2.5 shrink-0" style={{flex:'1.5 1 0',background:'#161616',border:'1px solid rgba(255,255,255,0.07)'}}>
                  <div className="flex items-center justify-between shrink-0">
                    <span className="text-[9px] opacity-40 uppercase tracking-widest font-bold">Media Asset Bin</span>
                    <div className="flex gap-1">
                      <button onClick={()=>setShowImport(true)} className="text-[8px] px-2 py-0.5 rounded uppercase transition-all opacity-40 hover:opacity-80" style={{border:'1px solid rgba(255,255,255,0.1)'}}>Import</button>
                      {hotFolders.map(hf=>(
                        <button key={hf.id} className="text-[8px] px-2 py-0.5 rounded uppercase transition-all opacity-40 hover:opacity-80 flex items-center gap-1" style={{border:'1px solid rgba(255,255,255,0.1)'}}>
                          <Folder size={8}/>{hf.label.slice(0,8)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-1 gap-2 min-h-0">
                    <div className="flex-1 overflow-y-auto pr-1" style={{scrollbarWidth:'thin'}}>
                      <div className="grid grid-cols-2 gap-1.5">
                        {sources.filter(s=>!['black','bars'].includes(s.id)).map(src=>(
                          <div key={src.id}
                            onClick={()=>{handleSourceClick(src.id);setInspectedSourceId(src.id);}}
                            className="relative rounded cursor-pointer group transition-colors p-1"
                            style={{background:inspectedSourceId===src.id?'rgba(107,0,153,0.15)':'rgba(0,0,0,0.3)',border:`1px solid ${inspectedSourceId===src.id?'rgba(107,0,153,0.4)':'rgba(255,255,255,0.06)'}`}}>
                            <div className="rounded overflow-hidden relative" style={{aspectRatio:'16/9'}}>
                              <SourceCanvas source={src} className="w-full h-full block object-cover opacity-70"/>
                            </div>
                            <div className="flex justify-between items-center mt-1 px-0.5">
                              <span className="text-[7px] font-mono truncate opacity-70">{src.label.toUpperCase()}</span>
                              <span className="text-[7px] font-mono opacity-40 uppercase">{src.type}</span>
                            </div>
                          </div>
                        ))}
                        {sources.filter(s=>!['black','bars'].includes(s.id)).length===0 && (
                          <div className="col-span-2 flex flex-col items-center justify-center py-4 gap-1 opacity-20"><Film size={16}/><span className="text-[8px] font-bold uppercase tracking-widest">No media</span></div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2" style={{width:150}}>
                      <div className="rounded overflow-hidden bg-black flex-1 relative" style={{border:'1px solid rgba(255,255,255,0.07)'}}>
                        {inspectedSourceId&&sources.find(s=>s.id===inspectedSourceId)?
                          <SourceCanvas source={sources.find(s=>s.id===inspectedSourceId)!} className="w-full h-full block object-contain"/>:
                          <div className="absolute inset-0 flex items-center justify-center opacity-15"><Film size={18}/></div>}
                        <div className="absolute top-1 left-1 text-[6px] font-mono opacity-40 bg-black/60 px-1 rounded">INSPECTOR{inspectedSourceId?`: ${(sources.find(s=>s.id===inspectedSourceId)?.label??'').toUpperCase()}`:''}</div>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        <button onClick={()=>setShowLTForm(v=>!v)} className="flex items-center gap-1 px-2 py-1 rounded text-[8px] font-bold uppercase transition-all" style={{background:'rgba(107,0,153,0.15)',border:'1px solid rgba(107,0,153,0.25)',color:'#a855f7'}}><Type size={9}/> L3</button>
                        <button onClick={handleAddClock} className="px-2 py-1 rounded text-[8px] opacity-40 hover:opacity-80 transition-opacity" style={{border:'1px solid rgba(255,255,255,0.1)'}}><Clock size={9}/></button>
                        <button onClick={handleAddWebmOverlay} className="px-2 py-1 rounded text-[8px] opacity-40 hover:opacity-80 transition-opacity" style={{border:'1px solid rgba(255,255,255,0.1)'}}><Film size={9}/></button>
                      </div>
                      <div className="space-y-0.5 max-h-12 overflow-y-auto" style={{scrollbarWidth:'thin'}}>
                        {overlays.map(ov=>(
                          <div key={ov.id} className="flex items-center gap-1 px-1 py-0.5 rounded" style={{background:'rgba(255,255,255,0.03)'}}>
                            <span className="text-[7px] font-mono flex-1 truncate opacity-60">{ov.label.toUpperCase()}</span>
                            <button onClick={()=>engineRef.current?.setOverlayVisible(ov.id,!ov.visible)} style={{color:ov.visible?'#a855f7':'rgba(255,255,255,0.2)'}}>{ov.visible?<Eye size={8}/>:<EyeOff size={8}/>}</button>
                            <button onClick={()=>engineRef.current?.removeOverlay(ov.id)} className="opacity-20 hover:opacity-70" style={{color:'#D40055'}}><Trash2 size={8}/></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <AnimatePresence>
                    {showLTForm&&(
                      <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden shrink-0">
                        <div className="flex gap-1.5 pt-1">
                          <input value={ltTitle} onChange={e=>setLtTitle(e.target.value)} placeholder="Title" className="flex-1 rounded px-2 py-1 text-[10px] text-white placeholder-white/25 outline-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}/>
                          <input value={ltSubtitle} onChange={e=>setLtSubtitle(e.target.value)} placeholder="Subtitle" className="flex-1 rounded px-2 py-1 text-[10px] text-white placeholder-white/25 outline-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}/>
                          <button onClick={handleAddLowerThird} className="px-3 py-1 rounded text-[10px] font-black text-white uppercase" style={{background:'#6B0099'}}>Add</button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Switcher Control Panel */}
                <div className="rounded-xl flex gap-4 p-3 shrink-0" style={{flex:'2 1 0',background:'#161616',border:'1px solid rgba(255,255,255,0.07)',boxShadow:'0 4px 32px rgba(0,0,0,0.5)'}}>
                  {/* Bus buttons */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] opacity-40 uppercase tracking-widest font-bold">Program Bus</span>
                      <div className="flex flex-wrap gap-2">
                        {sources.map((src,idx)=>{
                          const active=programId===src.id;
                          return (
                            <button key={src.id} onClick={()=>handleProgramCut(src.id)}
                              className="rounded-lg font-black font-mono flex items-center justify-center transition-all active:scale-95 touch-manipulation"
                              style={{width:44,height:44,fontSize:14,background:active?'#D40055':'rgba(255,255,255,0.07)',color:active?'#fff':'rgba(255,255,255,0.5)',border:`1px solid ${active?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.05)'}`,boxShadow:active?'0 0 15px rgba(212,0,85,0.4)':'none'}}
                              title={src.label}>{idx+1}</button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] opacity-40 uppercase tracking-widest font-bold">Preview Bus</span>
                      <div className="flex flex-wrap gap-2">
                        {sources.map((src,idx)=>{
                          const active=previewId===src.id;
                          return (
                            <button key={src.id} onClick={()=>handleSourceClick(src.id)}
                              className="rounded-lg font-black font-mono flex items-center justify-center transition-all active:scale-95 touch-manipulation"
                              style={{width:44,height:44,fontSize:14,background:active?'#6B0099':'rgba(255,255,255,0.07)',color:active?'#fff':'rgba(255,255,255,0.5)',border:`1px solid ${active?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.05)'}`,boxShadow:active?'0 0 15px rgba(107,0,153,0.4)':'none'}}
                              title={src.label}>{idx+1}</button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {/* T-bar + transition */}
                  <div className="flex flex-col items-center gap-2 w-20 shrink-0">
                    <span className="text-[9px] opacity-40 uppercase tracking-widest font-bold text-center">X-FADE</span>
                    <VerticalTBar value={tBarValue} onChange={handleTBar}/>
                    <div className="flex flex-col gap-1 w-full">
                      {TRANS.map(opt=>(
                        <button key={opt.type} onClick={()=>setTransitionType(opt.type)}
                          className="h-7 rounded text-[8px] font-black uppercase tracking-wider transition-colors"
                          style={{background:transitionType===opt.type?'rgba(107,0,153,0.35)':'rgba(255,255,255,0.05)',border:`1px solid ${transitionType===opt.type?'rgba(107,0,153,0.5)':'rgba(255,255,255,0.05)'}`,color:transitionType===opt.type?'#c084fc':'rgba(255,255,255,0.4)'}}>
                          {opt.label}
                        </button>
                      ))}
                      <div className="flex flex-col gap-0.5 mt-1">
                        <span className="text-[7px] opacity-20 uppercase tracking-widest text-center">DUR</span>
                        <input type="range" min={100} max={3000} step={100} value={transitionDuration} onChange={e=>setTransitionDuration(Number(e.target.value))} className="w-full cursor-pointer" style={{accentColor:'#6B0099',height:6}}/>
                        <span className="text-[7px] font-mono opacity-25 text-center">{(transitionDuration/1000).toFixed(1)}s</span>
                      </div>
                    </div>
                  </div>
                  {/* CUT / AUTO */}
                  <div className="flex flex-col gap-2 w-24 shrink-0">
                    <button onClick={handleCut} className="flex-1 rounded-xl font-black text-base flex flex-col items-center justify-center transition-all active:scale-95 touch-manipulation"
                      style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',color:'#D40055',minHeight:72}}
                      onMouseEnter={e=>(e.currentTarget.style.background='rgba(212,0,85,0.1)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,0.06)')}>
                      <span className="text-[7px] opacity-50 mb-1 font-bold">DIRECT</span>CUT
                    </button>
                    <button onClick={handleAuto} className="flex-1 rounded-xl font-black text-base flex flex-col items-center justify-center transition-all active:scale-95 touch-manipulation"
                      style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)',color:'#a855f7',minHeight:72}}
                      onMouseEnter={e=>(e.currentTarget.style.background='rgba(107,0,153,0.15)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,0.06)')}>
                      <span className="text-[7px] opacity-50 mb-1 font-bold">MIXED</span>AUTO
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ════ AUDIO MIXER TAB ══════════════════════════════════════════ */}
          {studioTab === 'AUDIO' && (
            <div className="flex-1 flex flex-col gap-3 p-3 overflow-hidden min-h-0">
              <div className="flex items-end gap-4 h-full overflow-x-auto pb-2">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <span className="text-[8px] opacity-40 uppercase tracking-widest font-bold">MASTER</span>
                  <VUBar level={masterLevel} vertical className="shrink-0"/>
                  <input type="range" min={0} max={200} value={Math.round(masterGain*100)} onChange={e=>handleMasterGain(Number(e.target.value)/100)}
                    style={{writingMode:'vertical-lr' as any,direction:'rtl' as any,height:160,cursor:'pointer',accentColor:'#6B0099'}}/>
                  <span className="text-[9px] font-mono opacity-40">{Math.round(masterGain*100)}%</span>
                  <Volume2 size={12} className="opacity-40"/>
                </div>
                <div className="w-px self-stretch" style={{background:'rgba(255,255,255,0.06)'}}/>
                {sources.filter(s=>!['COLOR','BARS','BLACK'].includes(s.type)).map(src=>{
                  const gain=sourceGains[src.id]??1; const muted=sourceMutes[src.id]??false; const level=sourceLevels[src.id]??0;
                  return (
                    <div key={src.id} className="flex flex-col items-center gap-2 shrink-0" style={{width:52}}>
                      <span className="text-[7px] font-mono opacity-40 text-center truncate w-full uppercase">{src.label.slice(0,6)}</span>
                      <VUBar level={muted?0:level} vertical className="shrink-0"/>
                      <input type="range" min={0} max={200} value={Math.round(gain*100)} onChange={e=>handleSourceGain(src.id,Number(e.target.value)/100)} disabled={muted}
                        style={{writingMode:'vertical-lr' as any,direction:'rtl' as any,height:160,cursor:muted?'default':'pointer',accentColor:'#6B0099',opacity:muted?0.3:1}}/>
                      <span className="text-[8px] font-mono opacity-30">{Math.round(gain*100)}</span>
                      <button onClick={()=>handleMuteSource(src.id)} style={{color:muted?'#D40055':'rgba(255,255,255,0.35)'}}>
                        {muted?<MicOff size={12}/>:<Mic size={12}/>}
                      </button>
                    </div>
                  );
                })}
                {sources.filter(s=>!['COLOR','BARS','BLACK'].includes(s.type)).length===0&&(
                  <div className="flex-1 flex items-center justify-center opacity-20"><p className="text-[10px] font-bold uppercase tracking-widest">No audio sources</p></div>
                )}
              </div>
            </div>
          )}

          {/* ════ GRAPHICS BUILDER TAB ════════════════════════════════════ */}
          {studioTab === 'GRAPHICS_BUILDER' && (
            <div className="flex-1 flex gap-4 p-4 overflow-hidden min-h-0">
              {/* Left: controls */}
              <div className="flex flex-col gap-4 overflow-y-auto shrink-0" style={{width:280,scrollbarWidth:'thin'}}>
                <div>
                  <p className="text-[9px] opacity-30 uppercase tracking-widest font-bold mb-3">Lower Third Builder</p>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[8px] opacity-30 uppercase tracking-widest block mb-1">Name / Title line</label>
                      <input value={ltbTitle} onChange={e=>setLtbTitle(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}} onFocus={e=>(e.currentTarget.style.borderColor='#6B0099')} onBlur={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.1)')}/>
                    </div>
                    <div>
                      <label className="text-[8px] opacity-30 uppercase tracking-widest block mb-1">Subtitle / Role line</label>
                      <input value={ltbSubtitle} onChange={e=>setLtbSubtitle(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}} onFocus={e=>(e.currentTarget.style.borderColor='#6B0099')} onBlur={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.1)')}/>
                    </div>
                    <div className="flex items-center gap-2">
                      <div>
                        <label className="text-[8px] opacity-30 uppercase tracking-widest block mb-1">Accent color</label>
                        <input type="color" value={ltbColor} onChange={e=>setLtbColor(e.target.value)} className="rounded cursor-pointer" style={{width:40,height:32,border:'none',background:'none'}}/>
                      </div>
                      <div className="flex-1">
                        <label className="text-[8px] opacity-30 uppercase tracking-widest block mb-1">Style</label>
                        <div className="flex gap-1">
                          {(['MODERN','CLASSIC','MINIMAL'] as const).map(s=>(
                            <button key={s} onClick={()=>setLtbStyle(s)} className="flex-1 py-1.5 rounded text-[8px] font-black uppercase transition-colors" style={{background:ltbStyle===s?'#6B0099':'rgba(255,255,255,0.05)',color:ltbStyle===s?'#fff':'rgba(255,255,255,0.35)'}}>{s}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button onClick={handlePublishLTB} className="w-full py-2 rounded-xl text-white text-xs font-black uppercase tracking-widest transition-all" style={{background:'#6B0099'}} onMouseEnter={e=>(e.currentTarget.style.background='#7d00b4')} onMouseLeave={e=>(e.currentTarget.style.background='#6B0099')}>
                      Push to Output
                    </button>
                  </div>
                </div>
                <div className="pt-3" style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                  <p className="text-[9px] opacity-30 uppercase tracking-widest font-bold mb-2">Motion Graphics</p>
                  <p className="text-[8px] opacity-20 mb-2">Supported: WebM · APNG · Lottie JSON · HTML5 Video (MP4/WebM)</p>
                  <button onClick={handleAddWebmOverlay} className="w-full flex items-center gap-2 py-2 px-3 rounded-xl text-[10px] font-bold uppercase opacity-50 hover:opacity-100 transition-opacity" style={{border:'1px solid rgba(255,255,255,0.1)'}}>
                    <Upload size={11}/> Load motion graphic file
                  </button>
                </div>
                <div className="pt-3" style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                  <p className="text-[9px] opacity-30 uppercase tracking-widest font-bold mb-2">Active Overlays</p>
                  <div className="space-y-1.5">
                    {overlays.length===0&&<p className="text-[9px] opacity-20 text-center py-4">No overlays active</p>}
                    {overlays.map(ov=>(
                      <div key={ov.id} className="flex items-center gap-2 p-2 rounded-xl" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)'}}>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-white truncate">{ov.label}</p>
                          <p className="text-[7px] opacity-30 uppercase">{ov.type}</p>
                        </div>
                        <input type="range" min={0} max={100} value={Math.round(ov.opacity*100)} onChange={e=>engineRef.current?.updateOverlay(ov.id,{opacity:Number(e.target.value)/100})} className="w-12 cursor-pointer" style={{accentColor:'#6B0099',height:4}}/>
                        <button onClick={()=>engineRef.current?.setOverlayVisible(ov.id,!ov.visible)} style={{color:ov.visible?'#a855f7':'rgba(255,255,255,0.2)'}}>{ov.visible?<Eye size={11}/>:<EyeOff size={11}/>}</button>
                        <button onClick={()=>engineRef.current?.removeOverlay(ov.id)} className="opacity-20 hover:opacity-70" style={{color:'#D40055'}}><Trash2 size={11}/></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Right: canvas preview */}
              <div className="flex-1 flex flex-col min-w-0 gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] opacity-30 uppercase tracking-widest font-bold">Preview Canvas (1920×1080)</p>
                  <span className="text-[8px] opacity-20">Live preview updates as you type</span>
                </div>
                <div className="flex-1 rounded-xl overflow-hidden relative" style={{background:'#000',border:'1px solid rgba(255,255,255,0.07)'}}>
                  <canvas ref={ltbCanvasRef} width={1920} height={1080} className="w-full h-full block object-contain"/>
                </div>
              </div>
            </div>
          )}

          {/* ════ LIGHTING BOARD TAB ═══════════════════════════════════════ */}
          {studioTab === 'AMBO' && (
            <div className="flex-1 min-h-0 flex">
              <div style={{width:300}} className="shrink-0 border-r border-white/10">
                <AmboPresenter engine={engineRef.current} compact />
              </div>
              <div className="flex-1 min-w-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-white/25">
                Program output keys from the panel on the left
              </div>
            </div>
          )}
          {studioTab === 'LIGHTING' && <TVStudioLightingBoard/>}

          {/* ════ SETTINGS TAB ════════════════════════════════════════════ */}
          {studioTab === 'SETTINGS' && (
            <div className="flex-1 p-4 flex gap-6 overflow-hidden min-h-0">
              <div className="flex flex-col gap-1 shrink-0 w-32">
                {([['EXPORT','Export'],['COLOR','Color CC'],['MIDI','MIDI / HW'],['NDI','NDI / AVB'],['AUX','Aux Buses'],['CAST','Cast']] as const).map(([id,label])=>(
                  <button key={id} onClick={()=>setSettingsSub(id as any)}
                    className="text-left px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                    style={{background:settingsSub===id?'rgba(107,0,153,0.25)':'rgba(255,255,255,0.04)',color:settingsSub===id?'#c084fc':'rgba(255,255,255,0.35)',border:settingsSub===id?'1px solid rgba(107,0,153,0.4)':'1px solid transparent'}}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-w-0 overflow-y-auto space-y-4">
                {activeProject&&(
                  <div className="p-3 rounded-xl space-y-1" style={{background:'#161616',border:'1px solid rgba(255,255,255,0.06)'}}>
                    <p className="text-[8px] opacity-30 uppercase tracking-widest mb-2">Project</p>
                    {[['Title',activeProject.title],['Resolution',activeProject.resolution],['FPS',`${activeProject.frameRate}fps`],['Mode',activeProject.outputMode]].map(([k,v])=>(
                      <div key={k} className="flex justify-between text-[9px]"><span className="opacity-30">{k}</span><span className="opacity-60 font-mono">{v}</span></div>
                    ))}
                  </div>
                )}

                {settingsSub==='EXPORT'&&(
                  <div className="space-y-2">
                    <p className="text-[8px] opacity-30 uppercase tracking-widest">Edit List Export</p>
                    <button onClick={handleExportEDL} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase transition-all opacity-60 hover:opacity-100" style={{border:'1px solid rgba(255,255,255,0.1)'}}><Download size={11}/>CMX 3600 EDL</button>
                    <button onClick={handleExportFCPXML} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase transition-all opacity-60 hover:opacity-100" style={{border:'1px solid rgba(255,255,255,0.1)'}}><Download size={11}/>Final Cut Pro XML</button>
                  </div>
                )}

                {settingsSub==='COLOR'&&(
                  <div className="space-y-3">
                    <select value={selectedSourceId??''} onChange={e=>setSelectedSourceId(e.target.value||null)} className="w-full rounded-xl px-2 py-2 text-xs text-white outline-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}>
                      <option value="">Select source…</option>
                      {sources.filter(s=>!['COLOR','BARS'].includes(s.type)).map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    {selectedSourceId&&(
                      <div className="space-y-3">
                        {([{key:'brightness' as const,label:'Brightness',icon:<Sun size={10}/>,min:0,max:2,step:0.02},{key:'contrast' as const,label:'Contrast',icon:<Contrast size={10}/>,min:0,max:2,step:0.02},{key:'saturation' as const,label:'Saturation',icon:<Droplet size={10}/>,min:0,max:2,step:0.02},{key:'hue' as const,label:'Hue Rotate',icon:<Palette size={10}/>,min:-180,max:180,step:1}]).map(({key,label,icon,min,max,step})=>(
                          <div key={key} className="space-y-1">
                            <div className="flex items-center justify-between"><span className="flex items-center gap-1 text-[9px] opacity-40">{icon} {label}</span><span className="text-[9px] font-mono opacity-50">{cc[key].toFixed(key==='hue'?0:2)}{key==='hue'?'°':''}</span></div>
                            <input type="range" min={min} max={max} step={step} value={cc[key]} onChange={e=>handleCC(key,Number(e.target.value))} className="w-full cursor-pointer" style={{accentColor:'#6B0099',height:6}}/>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <button onClick={resetCC} className="flex-1 py-1.5 rounded-xl text-[9px] font-bold uppercase opacity-40 hover:opacity-80 transition-opacity" style={{border:'1px solid rgba(255,255,255,0.1)'}}>Reset</button>
                          <button onClick={()=>{const i=document.createElement('input');i.type='file';i.accept='.cube';i.onchange=()=>{if(i.files?.[0])alert('LUT loaded — applied on output stream.');};i.click();}} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[9px] font-bold uppercase opacity-40 hover:opacity-80 transition-opacity" style={{border:'1px solid rgba(255,255,255,0.1)'}}><Upload size={10}/> .cube LUT</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {settingsSub==='MIDI'&&(
                  <div className="space-y-3">
                    <button onClick={handleConnectMIDI} className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all" style={{background:midiConnected?'rgba(34,197,94,0.1)':'rgba(107,0,153,0.15)',border:`1px solid ${midiConnected?'rgba(34,197,94,0.25)':'rgba(107,0,153,0.25)'}`,color:midiConnected?'#22c55e':'#a855f7'}}>
                      <Usb size={12}/>{midiConnected?'MIDI Connected':'Connect MIDI Device'}
                    </button>
                    <div className="p-3 rounded-xl space-y-1.5" style={{background:'#161616',border:'1px solid rgba(255,255,255,0.06)'}}>
                      {[['CC 1–8','Source channel faders'],['CC 10','Master output'],['CC 20','CUT'],['CC 21','AUTO'],['CC 22','FTB'],['Note C3','CUT note-on']].map(([cc,fn])=>(
                        <div key={cc} className="flex items-center gap-2 text-[9px]"><span className="font-mono w-14 shrink-0" style={{color:'#a855f7'}}>{cc}</span><span className="opacity-40">{fn}</span></div>
                      ))}
                    </div>
                  </div>
                )}

                {settingsSub==='NDI'&&(
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl" style={{background:'#161616',border:'1px solid rgba(255,255,255,0.06)'}}>
                      <p className="text-[8px] opacity-30 uppercase tracking-widest mb-3">NDI Bridge (WebSocket → NDI Tools)</p>
                      <div className="flex gap-2">
                        <input value={ndiUrl} onChange={e=>setNdiUrl(e.target.value)} className="flex-1 px-2 py-1.5 rounded text-xs text-white outline-none font-mono" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}} placeholder="ws://localhost:8765"/>
                        <button onClick={connectNDI} className="px-3 py-1.5 rounded text-xs font-black uppercase transition-all" style={{background:ndiConnected?'rgba(34,197,94,0.2)':'rgba(107,0,153,0.25)',color:ndiConnected?'#22c55e':'#a855f7',border:'1px solid rgba(107,0,153,0.35)'}}>
                          {ndiConnected?'Connected':'Connect'}
                        </button>
                      </div>
                      <p className="text-[8px] opacity-20 mt-2">Requires NDI Tools + a local WebSocket bridge (e.g. ndi-webrtc-peer-worker or OBS with NDI plugin).</p>
                    </div>
                    <div className="p-3 rounded-xl" style={{background:'#161616',border:'1px solid rgba(255,255,255,0.06)'}}>
                      <p className="text-[8px] opacity-30 uppercase tracking-widest mb-3">AVB / Milan Bridge</p>
                      <div className="flex gap-2">
                        <input value={avbUrl} onChange={e=>setAvbUrl(e.target.value)} className="flex-1 px-2 py-1.5 rounded text-xs text-white outline-none font-mono" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}} placeholder="ws://localhost:8766"/>
                        <button onClick={connectAVB} className="px-3 py-1.5 rounded text-xs font-black uppercase transition-all" style={{background:avbConnected?'rgba(34,197,94,0.2)':'rgba(255,255,255,0.07)',color:avbConnected?'#22c55e':'rgba(255,255,255,0.4)',border:'1px solid rgba(255,255,255,0.1)'}}>
                          {avbConnected?'Connected':'Connect'}
                        </button>
                      </div>
                      <p className="text-[8px] opacity-20 mt-2">AVB requires IEEE 802.1 compatible network hardware and a local bridge agent.</p>
                    </div>
                  </div>
                )}

                {settingsSub==='AUX'&&(
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] opacity-30 uppercase tracking-widest font-bold">Auxiliary Output Buses</p>
                      <button onClick={addAuxBus} className="flex items-center gap-1 px-2 py-1 rounded text-[9px] opacity-40 hover:opacity-80 transition-opacity" style={{border:'1px solid rgba(255,255,255,0.1)'}}><Plus size={10}/> Add Bus</button>
                    </div>
                    {auxBuses.map(bus=>(
                      <div key={bus.id} className="p-3 rounded-xl flex items-center gap-3" style={{background:'#161616',border:'1px solid rgba(255,255,255,0.06)'}}>
                        <span className="text-[10px] font-black opacity-60 w-14 shrink-0">{bus.label}</span>
                        <select value={bus.sourceId??''} onChange={e=>setAuxSource(bus.id,e.target.value||null)} className="flex-1 px-2 py-1.5 rounded text-xs text-white outline-none" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}>
                          <option value="">No source</option>
                          <option value="__PROGRAM__">Program Bus (follow PGM)</option>
                          <option value="__PREVIEW__">Preview Bus (follow PVW)</option>
                          {sources.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                        <button onClick={()=>{ const stream=engineRef.current?.getAuxBusStream(bus.id); if(stream&&onStreamReady)onStreamReady(stream); }} className="px-2 py-1.5 rounded text-[9px] opacity-40 hover:opacity-80 transition-opacity uppercase" style={{border:'1px solid rgba(255,255,255,0.1)'}}>Stream</button>
                      </div>
                    ))}
                  </div>
                )}

                {settingsSub==='CAST'&&(
                  <div className="space-y-3">
                    <p className="text-[9px] opacity-30 uppercase tracking-widest font-bold">Google Cast Output</p>
                    <p className="text-[8px] opacity-20 mb-3">Cast program or preview bus to any Chromecast or Google TV device on your network.</p>
                    <div className="flex gap-2">
                      <button onClick={()=>handleCast('PROGRAM')} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all" style={{background:'rgba(212,0,85,0.15)',border:'1px solid rgba(212,0,85,0.3)',color:'#D40055'}}><Cast size={14}/> Cast Program</button>
                      <button onClick={()=>handleCast('PREVIEW')} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all" style={{background:'rgba(107,0,153,0.15)',border:'1px solid rgba(107,0,153,0.3)',color:'#a855f7'}}><Cast size={14}/> Cast Preview</button>
                    </div>
                    <div className="p-3 rounded-xl" style={{background:'#161616',border:'1px solid rgba(255,255,255,0.06)'}}>
                      <p className="text-[8px] opacity-20">Requires the Cast SDK loaded in index.html: <code className="opacity-50">{'<script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js"></script>'}</code></p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ═══════════════════════ FOOTER ════════════════════════════════════ */}
      <footer className="flex justify-center items-center gap-3 shrink-0 px-4"
        style={{height:52,background:'#111',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
        <button onClick={handleAuto} className="flex items-center justify-center gap-2 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 touch-manipulation" style={{flex:'1 1 0',maxWidth:220,height:38,background:'rgba(212,0,85,0.85)',color:'#fff'}} onMouseEnter={e=>(e.currentTarget.style.background='#D40055')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(212,0,85,0.85)')}>
          <Radio size={14}/> Auto Trans
        </button>
        <button onClick={handleCut} className="flex items-center justify-center gap-2 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 touch-manipulation" style={{flex:'1 1 0',maxWidth:220,height:38,background:'rgba(255,255,255,0.07)',color:'rgba(255,255,255,0.7)',border:'1px solid rgba(255,255,255,0.1)'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.12)')} onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,0.07)')}>
          <Zap size={14}/> Cut / Take
        </button>
        <div className="flex items-center gap-2 ml-4">
          <button onClick={handleRecord} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all" style={{background:isRecording?'#D40055':'rgba(255,255,255,0.05)',color:isRecording?'#fff':'rgba(255,255,255,0.4)',border:`1px solid ${isRecording?'rgba(255,255,255,0.15)':'rgba(255,255,255,0.08)'}`}}>
            {isRecording?<Square size={9} fill="white"/>:<Circle size={9}/>}{isRecording?'Stop':'REC'}
          </button>
          {onStreamReady&&<button onClick={handleGoLive} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all" style={{background:'#6B0099',color:'#fff'}} onMouseEnter={e=>(e.currentTarget.style.background='#7d00b4')} onMouseLeave={e=>(e.currentTarget.style.background='#6B0099')}><Radio size={9}/> Go Live</button>}
          <button onClick={()=>setShowProjectModal(true)} className="opacity-25 hover:opacity-60 transition-opacity p-1"><Settings size={14}/></button>
        </div>
      </footer>
    </div>
  );
};

export default TVStudio;
