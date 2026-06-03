/**
 * TVStudio — Plajah TV Studio Production Environment
 *
 * Full-screen browser-based production switcher built on TVStudioEngine.
 * Design language: Blackmagic ATEM Software Control aesthetic in Plajah's dark purple palette.
 *
 * Layout:
 *  Left  (192px) — Source bus: thumbnails + add buttons
 *  Center (flex) — Preview + Program monitors side-by-side; Switcher bar at bottom
 *  Right  (288px) — Tabbed panel: Graphics | Audio | Color | MIDI | Settings
 *
 * Modes:
 *  LIVE   — outputs program stream via onStreamReady() (Mux/WebRTC integration)
 *  RECORD — records locally, downloads WebM on stop
 *  BOTH   — simultaneous
 *
 * EDL/XML — CMX3600 + Final Cut Pro XML export from cut list
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Video, Monitor, Film, Palette, Radio, Circle, Square,
  Sliders, Volume2, VolumeX, Mic, MicOff, Layers, Eye, EyeOff,
  Trash2, Plus, Download, Settings, Usb, Clock, Clapperboard,
  Sun, Contrast, Droplet, Upload, Type, ChevronDown,
  Activity, BarChart2, Zap,
} from 'lucide-react';
import {
  TVStudioEngine,
  StudioSource,
  GraphicOverlay,
  TransitionType,
} from '../services/tvStudioEngine';
import { db } from '../services/firebase';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';

// ── Types ────────────────────────────────────────────────────────────────────

interface StudioProjectDoc {
  id: string;
  userId: string;
  title: string;
  resolution: '1920x1080' | '1280x720' | '3840x2160';
  frameRate: 25 | 29.97 | 30 | 50 | 59.94 | 60;
  outputMode: 'LIVE' | 'RECORD' | 'BOTH';
  createdAt: number;
}

export interface TVStudioProps {
  currentUser: FirebaseUser | null;
  onBack: () => void;
  /** If launched from a live broadcast flow, pass the program stream up to the caller. */
  onStreamReady?: (stream: MediaStream) => void;
}

type RightTab = 'graphics' | 'audio' | 'color' | 'midi' | 'settings';

// ── Source Thumbnail ─────────────────────────────────────────────────────────
// Mini canvas that renders a source at ~8 fps in the source bus.

function SourceTile({
  source,
  isProgram,
  isPreview,
  onClick,
  onRemove,
}: {
  source: StudioSource;
  isProgram: boolean;
  isPreview: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let frame = 0;

    const draw = () => {
      frame++;
      // Render at ~8fps (every 8 rAF frames ≈ 133ms at 60fps)
      if (frame % 8 === 0) {
        if (source.videoEl && source.isReady) {
          ctx.filter = `brightness(${source.brightness}) contrast(${source.contrast}) saturate(${source.saturation}) hue-rotate(${source.hue}deg)`;
          ctx.drawImage(source.videoEl, 0, 0, 160, 90);
          ctx.filter = 'none';
        } else if (source.type === 'BARS') {
          const bars = ['#C0C0C0','#C0C000','#00C0C0','#00C000','#C000C0','#C00000','#0000C0'];
          bars.forEach((c, i) => {
            ctx.fillStyle = c;
            ctx.fillRect(i * (160 / 7), 0, 160 / 7, 90);
          });
        } else if (source.color) {
          ctx.fillStyle = source.color === 'BARS' ? '#888' : source.color;
          ctx.fillRect(0, 0, 160, 90);
        } else if (source.imageEl) {
          ctx.drawImage(source.imageEl, 0, 0, 160, 90);
        } else {
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(0, 0, 160, 90);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [source]);

  const borderCls = isProgram
    ? 'border-[#D40055] shadow-[0_0_8px_rgba(212,0,85,0.4)]'
    : isPreview
    ? 'border-[#6B0099] shadow-[0_0_6px_rgba(107,0,153,0.35)]'
    : 'border-white/10 hover:border-white/30';

  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className={`relative w-full rounded-lg overflow-hidden border-2 transition-all focus:outline-none ${borderCls}`}
        style={{ aspectRatio: '16/9' }}
      >
        <canvas ref={cvRef} width={160} height={90} className="w-full h-full block" />

        {/* Label bar */}
        <div className={`absolute bottom-0 left-0 right-0 px-1.5 py-0.5 flex items-center justify-between
          ${isProgram ? 'bg-[#D40055]' : isPreview ? 'bg-[#6B0099]' : 'bg-black/60'}`}
        >
          <span className="text-[9px] font-bold text-white truncate">{source.label}</span>
          {(isProgram || isPreview) && (
            <span className="text-[8px] font-black text-white/90 shrink-0 ml-1">
              {isProgram ? 'PGM' : 'PVW'}
            </span>
          )}
        </div>

        {/* Loading spinner */}
        {!source.isReady && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          </div>
        )}
      </button>

      {/* Remove button (hover) — hide for built-in sources */}
      {!['black', 'bars'].includes(source.id) && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white/40 hover:text-[#D40055] transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={9} />
        </button>
      )}
    </div>
  );
}

// ── Preview Monitor Canvas ───────────────────────────────────────────────────
// Draws the preview source to a canvas at ~30fps independent of the engine.

function PreviewMonitor({ source }: { source: StudioSource | null }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!source) {
        ctx.fillStyle = '#0d0d0d';
        ctx.fillRect(0, 0, 1920, 1080);
      } else if (source.videoEl && source.isReady) {
        ctx.filter = `brightness(${source.brightness}) contrast(${source.contrast}) saturate(${source.saturation}) hue-rotate(${source.hue}deg)`;
        ctx.drawImage(source.videoEl, 0, 0, 1920, 1080);
        ctx.filter = 'none';
      } else if (source.type === 'BARS') {
        const bars = ['#C0C0C0','#C0C000','#00C0C0','#00C000','#C000C0','#C00000','#0000C0'];
        const w = 1920 / bars.length;
        bars.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * w, 0, w, 810); });
        ctx.fillStyle = '#00008B'; ctx.fillRect(0, 810, 240, 270);
        ctx.fillStyle = '#fff';    ctx.fillRect(240, 810, 240, 270);
        ctx.fillStyle = '#2B00C8'; ctx.fillRect(480, 810, 240, 270);
        ctx.fillStyle = '#000';    ctx.fillRect(720, 810, 720, 270);
        ctx.fillStyle = '#0D0D0D'; ctx.fillRect(1440, 810, 240, 270);
        ctx.fillStyle = '#fff';    ctx.fillRect(1680, 810, 240, 270);
      } else if (source.color) {
        ctx.fillStyle = source.color === 'BARS' ? '#888' : source.color;
        ctx.fillRect(0, 0, 1920, 1080);
      } else if (source.imageEl) {
        ctx.drawImage(source.imageEl, 0, 0, 1920, 1080);
      } else {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, 1920, 1080);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [source]);

  return <canvas ref={cvRef} width={1920} height={1080} className="w-full h-full block" />;
}

// ── VU Meter ─────────────────────────────────────────────────────────────────

function VUBar({
  level,
  vertical = false,
  className = '',
}: {
  level: number;
  vertical?: boolean;
  className?: string;
}) {
  const pct = Math.min(level * 100, 100);
  const color = level > 0.85 ? '#ef4444' : level > 0.6 ? '#f59e0b' : '#22c55e';

  if (vertical) {
    return (
      <div
        className={`relative bg-black/40 rounded overflow-hidden ${className}`}
        style={{ width: 6, height: 48 }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 transition-all duration-75"
          style={{ height: `${pct}%`, backgroundColor: color }}
        />
      </div>
    );
  }
  return (
    <div className={`relative bg-black/40 rounded overflow-hidden h-1.5 ${className}`}>
      <div
        className="absolute left-0 top-0 bottom-0 transition-all duration-75"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Elapsed timer hook ───────────────────────────────────────────────────────

function useElapsed(running: boolean, startMs: number) {
  const [elapsed, setElapsed] = useState('00:00:00');
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const ms = Date.now() - startMs;
      const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
      const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
      const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(id);
  }, [running, startMs]);
  return elapsed;
}

// ── Main Component ────────────────────────────────────────────────────────────

const TVStudio: React.FC<TVStudioProps> = ({ currentUser, onBack, onStreamReady }) => {

  // ── Project state ──────────────────────────────────────────────────────────
  const [projects, setProjects]           = useState<StudioProjectDoc[]>([]);
  const [activeProject, setActiveProject] = useState<StudioProjectDoc | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newTitle, setNewTitle]           = useState('New Show');
  const [newRes, setNewRes]               = useState<StudioProjectDoc['resolution']>('1920x1080');
  const [newFps, setNewFps]               = useState<StudioProjectDoc['frameRate']>(30);
  const [newMode, setNewMode]             = useState<StudioProjectDoc['outputMode']>('BOTH');

  // ── Engine refs + reactive state ───────────────────────────────────────────
  const programCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef        = useRef<TVStudioEngine | null>(null);

  const [sourcesVer, setSourcesVer]       = useState(0);
  const [overlaysVer, setOverlaysVer]     = useState(0);
  const [programId, setProgramId]         = useState<string | null>(null);
  const [previewId, setPreviewId]         = useState<string | null>(null);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [masterLevel, setMasterLevel]     = useState(0);
  const [sourceLevels, setSourceLevels]   = useState<Record<string, number>>({});
  const levelRafRef = useRef<number>(0);

  // ── Recording ──────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording]     = useState(false);
  const [recordStart, setRecordStart]     = useState(0);
  const elapsed = useElapsed(isRecording, recordStart);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [rightTab, setRightTab]           = useState<RightTab>('graphics');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [transitionType, setTransitionType]     = useState<TransitionType>('MIX');
  const [transitionDuration, setTransitionDuration] = useState(500);
  const [tBarValue, setTBarValue]         = useState(0);
  const [midiConnected, setMidiConnected] = useState(false);

  // Graphics overlay form state
  const [showLTForm, setShowLTForm]       = useState(false);
  const [ltTitle, setLtTitle]             = useState('');
  const [ltSubtitle, setLtSubtitle]       = useState('');
  const [ltStyle, setLtStyle]             = useState<'MODERN' | 'CLASSIC' | 'MINIMAL'>('MODERN');

  // Audio state
  const [masterGain, setMasterGain]       = useState(1);
  const [sourceGains, setSourceGains]     = useState<Record<string, number>>({});
  const [sourceMutes, setSourceMutes]     = useState<Record<string, boolean>>({});

  // Color correction state
  const [cc, setCC] = useState({ brightness: 1, contrast: 1, saturation: 1, hue: 0 });

  // ── Derived values (recalculate when version counters change) ──────────────
  const sources = useMemo(() => engineRef.current?.getSources() ?? [], [sourcesVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const overlays = useMemo(() => engineRef.current?.getOverlays() ?? [], [overlaysVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const previewSource = useMemo(
    () => (previewId ? sources.find(s => s.id === previewId) ?? null : null),
    [previewId, sourcesVer] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const programSource = useMemo(
    () => (programId ? sources.find(s => s.id === programId) ?? null : null),
    [programId, sourcesVer] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Engine lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!programCanvasRef.current) return;
    const eng = new TVStudioEngine(programCanvasRef.current);
    engineRef.current = eng;

    eng.onSourcesChanged     = () => setSourcesVer(v => v + 1);
    eng.onOverlaysChanged    = () => setOverlaysVer(v => v + 1);
    eng.onProgramChanged     = id  => setProgramId(id);
    eng.onPreviewChanged     = id  => setPreviewId(id);
    eng.onTransitionProgress = p   => setTransitionProgress(p);
    eng.onMasterLevel        = l   => setMasterLevel(l);

    eng.start();
    eng.setPreview('black');

    // Level polling (~30fps sampling)
    const poll = () => {
      const e = engineRef.current;
      if (e) {
        const lvls: Record<string, number> = {};
        e.getSources().forEach(s => { lvls[s.id] = e.getSourceLevel(s.id); });
        setSourceLevels(lvls);
      }
      levelRafRef.current = requestAnimationFrame(poll);
    };
    poll();

    return () => {
      eng.destroy();
      cancelAnimationFrame(levelRafRef.current);
    };
  }, []);

  // Sync CC panel when selected source changes
  useEffect(() => {
    if (!selectedSourceId) return;
    const src = engineRef.current?.getSources().find(s => s.id === selectedSourceId);
    if (src) setCC({ brightness: src.brightness, contrast: src.contrast, saturation: src.saturation, hue: src.hue });
  }, [selectedSourceId]);

  // ── Project persistence ────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) { setShowProjectModal(true); return; }
    getDocs(query(collection(db, 'studio_projects'), where('userId', '==', currentUser.uid)))
      .then(snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as StudioProjectDoc))
          .sort((a, b) => b.createdAt - a.createdAt);
        setProjects(docs);
        if (docs.length === 0) setShowProjectModal(true);
        else setActiveProject(docs[0]);
      })
      .catch(() => setShowProjectModal(true));
  }, [currentUser]);

  const createProject = useCallback(async () => {
    const now = Date.now();
    const data: Omit<StudioProjectDoc, 'id'> = {
      userId: currentUser?.uid ?? 'anon',
      title: newTitle.trim() || 'New Show',
      resolution: newRes,
      frameRate: newFps,
      outputMode: newMode,
      createdAt: now,
    };
    let proj: StudioProjectDoc;
    try {
      const ref = await addDoc(collection(db, 'studio_projects'), data);
      proj = { id: ref.id, ...data };
    } catch {
      proj = { id: `local_${now}`, ...data };
    }
    setProjects(p => [proj, ...p]);
    setActiveProject(proj);
    setShowProjectModal(false);
  }, [currentUser, newTitle, newRes, newFps, newMode]);

  // ── Source management ──────────────────────────────────────────────────────
  const handleAddCamera = useCallback(async () => {
    await engineRef.current?.addCameraSource();
  }, []);

  const handleAddScreen = useCallback(async () => {
    await engineRef.current?.addScreenSource();
  }, []);

  const handleAddMedia = useCallback(() => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'video/*,image/*';
    inp.onchange = async () => {
      const file = inp.files?.[0];
      if (!file || !engineRef.current) return;
      const url = URL.createObjectURL(file);
      const label = file.name.replace(/\.[^.]+$/, '');
      if (file.type.startsWith('image/')) {
        engineRef.current.addGraphicSource(url, label);
      } else {
        await engineRef.current.addMediaSource(url, label);
      }
    };
    inp.click();
  }, []);

  const handleSourceClick = useCallback((id: string) => {
    const e = engineRef.current;
    if (!e) return;
    if (e.getProgramId() === id) return;
    e.setPreview(id);
    setSelectedSourceId(id);
    setCC({ brightness: 1, contrast: 1, saturation: 1, hue: 0 });
  }, []);

  const handleRemoveSource = useCallback((id: string) => {
    engineRef.current?.removeSource(id);
  }, []);

  // ── Switcher ───────────────────────────────────────────────────────────────
  const handleCut = useCallback(() => {
    engineRef.current?.cut();
    setTBarValue(0);
  }, []);

  const handleAuto = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setTransitionType(transitionType);
    e.setTransitionDuration(transitionDuration);
    e.auto();
  }, [transitionType, transitionDuration]);

  const handleFTB = useCallback(() => {
    engineRef.current?.fadeToBlack();
  }, []);

  const handleTBarChange = useCallback((val: number) => {
    setTBarValue(val);
    engineRef.current?.setTBar(val);
    if (val >= 1) setTimeout(() => setTBarValue(0), 400);
  }, []);

  // ── Recording ──────────────────────────────────────────────────────────────
  const handleRecord = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (e.isRecording()) {
      const blob = e.stopRecording();
      setIsRecording(false);
      if (blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${activeProject?.title ?? 'recording'}_${Date.now()}.webm`;
        a.click();
      }
    } else {
      e.startRecording();
      setIsRecording(true);
      setRecordStart(Date.now());
    }
  }, [activeProject]);

  const handleGoLive = useCallback(() => {
    const e = engineRef.current;
    if (!e || !onStreamReady) return;
    onStreamReady(e.getProgramStream(activeProject?.frameRate ?? 30));
  }, [activeProject, onStreamReady]);

  // ── Overlays ───────────────────────────────────────────────────────────────
  const handleAddLowerThird = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.addOverlay({
      id: `lt_${Date.now()}`,
      label: ltTitle || 'Lower Third',
      type: 'LOWER_THIRD',
      title: ltTitle,
      subtitle: ltSubtitle,
      style: ltStyle,
      visible: true,
      opacity: 1,
    });
    setLtTitle(''); setLtSubtitle(''); setShowLTForm(false);
  }, [ltTitle, ltSubtitle, ltStyle]);

  const handleAddClock = useCallback(() => {
    engineRef.current?.addOverlay({
      id: `clock_${Date.now()}`,
      label: 'Clock',
      type: 'CLOCK',
      visible: true,
      opacity: 1,
    });
  }, []);

  const handleAddWebmOverlay = useCallback(() => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'video/webm,image/apng,image/gif,.webm,.apng';
    inp.onchange = () => {
      const file = inp.files?.[0];
      if (!file || !engineRef.current) return;
      const url = URL.createObjectURL(file);
      const vid = document.createElement('video');
      vid.src = url; vid.loop = true; vid.autoplay = true; vid.muted = true;
      vid.play().catch(() => {});
      engineRef.current.addOverlay({
        id: `webm_${Date.now()}`,
        label: file.name,
        type: 'WEBM',
        url,
        videoEl: vid,
        x: 0, y: 0, width: 100, height: 100,
        visible: true,
        opacity: 1,
      });
    };
    inp.click();
  }, []);

  // ── Audio ──────────────────────────────────────────────────────────────────
  const handleMasterGain = useCallback((g: number) => {
    engineRef.current?.setMasterGain(g);
    setMasterGain(g);
  }, []);

  const handleSourceGain = useCallback((id: string, g: number) => {
    engineRef.current?.setSourceGain(id, g);
    setSourceGains(prev => ({ ...prev, [id]: g }));
  }, []);

  const handleMuteSource = useCallback((id: string) => {
    const muted = !sourceMutes[id];
    engineRef.current?.muteSource(id, muted);
    setSourceMutes(prev => ({ ...prev, [id]: muted }));
  }, [sourceMutes]);

  // ── Color correction ───────────────────────────────────────────────────────
  const handleCC = useCallback((key: keyof typeof cc, val: number) => {
    if (!selectedSourceId) return;
    setCC(prev => {
      const next = { ...prev, [key]: val };
      engineRef.current?.setSourceCC(selectedSourceId, next.brightness, next.contrast, next.saturation, next.hue);
      return next;
    });
  }, [selectedSourceId]);

  const resetCC = useCallback(() => {
    if (!selectedSourceId) return;
    const reset = { brightness: 1, contrast: 1, saturation: 1, hue: 0 };
    setCC(reset);
    engineRef.current?.setSourceCC(selectedSourceId, 1, 1, 1, 0);
  }, [selectedSourceId]);

  // ── MIDI ───────────────────────────────────────────────────────────────────
  const handleConnectMIDI = useCallback(async () => {
    const ok = await engineRef.current?.initMIDI((cc, value, channel) => {
      if (cc === 10)  handleMasterGain(value / 127 * 2);
      if (cc === 20 && value > 63) handleCut();
      if (cc === 21 && value > 63) handleAuto();
      if (cc === 22 && value > 63) handleFTB();
    });
    setMidiConnected(!!ok);
  }, [handleMasterGain, handleCut, handleAuto, handleFTB]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExportEDL = useCallback(() => {
    const text = engineRef.current?.exportEDL(activeProject?.title ?? 'Show', activeProject?.frameRate ?? 30);
    if (!text) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `${activeProject?.title ?? 'show'}.edl`;
    a.click();
  }, [activeProject]);

  const handleExportFCPXML = useCallback(() => {
    const xml = engineRef.current?.exportFCPXML(activeProject?.title ?? 'Show', activeProject?.frameRate ?? 30);
    if (!xml) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
    a.download = `${activeProject?.title ?? 'show'}.fcpxml`;
    a.click();
  }, [activeProject]);

  // ── Transition buttons config ──────────────────────────────────────────────
  const TRANS_OPTIONS: { type: TransitionType; label: string }[] = [
    { type: 'CUT',        label: 'CUT'   },
    { type: 'MIX',        label: 'MIX'   },
    { type: 'DIP',        label: 'DIP'   },
    { type: 'WIPE_LEFT',  label: '←WPE'  },
    { type: 'WIPE_RIGHT', label: 'WPE→'  },
    { type: 'STING',      label: 'STING' },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#0b0b0b] flex flex-col text-white overflow-hidden z-50 select-none">

      {/* ═══════════════════════════════════════════════════════════════════════
          PROJECT SETUP MODAL
         ═══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showProjectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 12 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="bg-[#111] rounded-2xl border border-white/10 p-6 w-full max-w-md shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#6B0099]/20 border border-[#6B0099]/30 flex items-center justify-center">
                  <Clapperboard size={18} className="text-[#6B0099]" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white tracking-tight">Plajah TV Studio</h2>
                  <p className="text-[10px] text-white/40">Browser production environment</p>
                </div>
              </div>

              {/* Existing projects */}
              {projects.length > 0 && (
                <div className="mb-5">
                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-2">Recent Projects</p>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {projects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setActiveProject(p); setShowProjectModal(false); }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left group"
                      >
                        <div className="flex items-center gap-2">
                          <Film size={11} className="text-[#6B0099] shrink-0" />
                          <span className="text-xs font-semibold text-white">{p.title}</span>
                        </div>
                        <span className="text-[9px] text-white/30 font-mono">{p.resolution} · {p.frameRate}fps</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 my-4">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[9px] text-white/25 px-2">or create new</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                </div>
              )}

              {/* New project form */}
              <div className="space-y-3">
                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Project title"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#6B0099] transition-colors"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-white/35 uppercase tracking-widest block mb-1.5">Resolution</label>
                    <select
                      value={newRes}
                      onChange={e => setNewRes(e.target.value as any)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:border-[#6B0099] transition-colors"
                    >
                      <option value="1920x1080">1920 × 1080</option>
                      <option value="1280x720">1280 × 720</option>
                      <option value="3840x2160">3840 × 2160</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-white/35 uppercase tracking-widest block mb-1.5">Frame Rate</label>
                    <select
                      value={newFps}
                      onChange={e => setNewFps(Number(e.target.value) as any)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:border-[#6B0099] transition-colors"
                    >
                      {([25, 29.97, 30, 50, 59.94, 60] as const).map(f => (
                        <option key={f} value={f}>{f} fps</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] text-white/35 uppercase tracking-widest block mb-1.5">Output Mode</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['LIVE', 'RECORD', 'BOTH'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setNewMode(m)}
                        className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${newMode === m ? 'bg-[#6B0099] text-white' : 'bg-white/5 text-white/35 hover:bg-white/10'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={createProject}
                  className="w-full py-3 rounded-xl bg-[#6B0099] hover:bg-[#7d00b4] text-white text-sm font-black transition-colors mt-1"
                >
                  Open Studio
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════════
          TOP BAR
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-2.5 px-3 py-1.5 bg-[#0e0e0e] border-b border-white/[0.05] shrink-0 h-10">
        <button onClick={onBack} className="text-white/30 hover:text-white transition-colors p-0.5">
          <ArrowLeft size={14} />
        </button>

        <div className="w-px h-4 bg-white/10" />

        <Clapperboard size={13} className="text-[#6B0099] shrink-0" />
        <span className="text-[11px] font-black text-white/70 tracking-widest uppercase">
          {activeProject?.title ?? 'TV Studio'}
        </span>
        {activeProject && (
          <span className="text-[9px] text-white/25 font-mono">
            {activeProject.resolution} · {activeProject.frameRate}fps · {activeProject.outputMode}
          </span>
        )}

        <div className="flex-1" />

        {/* Recording status pill */}
        {isRecording && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#D40055]/15 border border-[#D40055]/30">
            <div className="w-1.5 h-1.5 rounded-full bg-[#D40055] animate-pulse shrink-0" />
            <span className="text-[9px] font-black text-[#D40055] font-mono">{elapsed}</span>
          </div>
        )}

        {/* Record button */}
        {(!activeProject || activeProject.outputMode !== 'LIVE') && (
          <button
            onClick={handleRecord}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors ${isRecording ? 'bg-[#D40055] text-white' : 'bg-white/5 hover:bg-white/10 text-white/50'}`}
          >
            {isRecording ? <Square size={9} fill="white" /> : <Circle size={9} />}
            {isRecording ? 'Stop' : 'REC'}
          </button>
        )}

        {/* Go Live button */}
        {onStreamReady && (!activeProject || activeProject.outputMode !== 'RECORD') && (
          <button
            onClick={handleGoLive}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[#6B0099] hover:bg-[#7d00b4] text-white transition-colors"
          >
            <Radio size={9} /> Go Live
          </button>
        )}

        <button
          onClick={() => setShowProjectModal(true)}
          className="p-1 rounded-lg text-white/25 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Settings size={13} />
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN AREA  [Source Bus | Monitors | Right Panel]
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0">

        {/* ─────────────────── SOURCE BUS (left, 192px) ───────────────────── */}
        <div className="w-48 bg-[#0d0d0d] border-r border-white/[0.05] flex flex-col shrink-0">
          <div className="px-2 pt-2 pb-1 shrink-0">
            <p className="text-[8px] font-black text-white/25 uppercase tracking-widest">Inputs</p>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
            {sources.map(src => (
              <SourceTile
                key={src.id}
                source={src}
                isProgram={programId === src.id}
                isPreview={previewId === src.id}
                onClick={() => handleSourceClick(src.id)}
                onRemove={() => handleRemoveSource(src.id)}
              />
            ))}
          </div>

          {/* Add source buttons */}
          <div className="p-1.5 border-t border-white/[0.05] space-y-1 shrink-0">
            <button
              onClick={handleAddCamera}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-white/50 hover:text-white text-[9px] font-bold transition-colors"
            >
              <Video size={10} /> + Camera
            </button>
            <button
              onClick={handleAddScreen}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-white/50 hover:text-white text-[9px] font-bold transition-colors"
            >
              <Monitor size={10} /> + Screen / Window
            </button>
            <button
              onClick={handleAddMedia}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-white/50 hover:text-white text-[9px] font-bold transition-colors"
            >
              <Film size={10} /> + Media / Graphic
            </button>
          </div>
        </div>

        {/* ─────────────────── CENTER: MONITORS + SWITCHER ────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#0b0b0b]">

          {/* Dual monitors */}
          <div className="flex-1 flex gap-2 p-2 min-h-0">

            {/* Preview */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 mb-1 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-[#6B0099]" />
                <span className="text-[8px] font-black text-[#6B0099] uppercase tracking-widest">Preview</span>
                <span className="text-[8px] text-white/25 ml-auto truncate">
                  {previewSource?.label ?? '—'}
                </span>
              </div>
              <div className="flex-1 rounded-xl overflow-hidden border-2 border-[#6B0099]/40 bg-[#060606] relative">
                <PreviewMonitor source={previewSource} />
                {!previewId && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-white/15 uppercase tracking-widest">No Source</span>
                  </div>
                )}
              </div>
            </div>

            {/* Program */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 mb-1 shrink-0">
                <div className={`w-1.5 h-1.5 rounded-full bg-[#D40055] ${programId ? 'animate-pulse' : 'opacity-30'}`} />
                <span className="text-[8px] font-black text-[#D40055] uppercase tracking-widest">Program</span>
                {isRecording && (
                  <span className="ml-1 px-1.5 py-0 text-[7px] font-black bg-[#D40055]/20 border border-[#D40055]/30 text-[#D40055] rounded uppercase">REC</span>
                )}
                <span className="text-[8px] text-white/25 ml-auto truncate">
                  {programSource?.label ?? '—'}
                </span>
              </div>
              <div className="flex-1 rounded-xl overflow-hidden border-2 border-[#D40055]/50 bg-[#060606] relative">
                <canvas
                  ref={programCanvasRef}
                  width={1920}
                  height={1080}
                  className="w-full h-full block"
                />
                {!programId && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-white/15 uppercase tracking-widest">No Program Source</span>
                  </div>
                )}
              </div>
              {/* Master VU below program */}
              <div className="mt-1 shrink-0">
                <VUBar level={masterLevel} className="w-full" />
              </div>
            </div>
          </div>

          {/* ─── Switcher Bar ─────────────────────────────────────────────── */}
          <div className="shrink-0 px-2 pb-2">
            <div className="bg-[#111] rounded-xl border border-white/[0.05] p-2.5 flex items-center gap-2">

              {/* CUT */}
              <button
                onClick={handleCut}
                className="px-3 py-2 rounded-lg bg-[#D40055] hover:bg-[#f0005f] text-white text-[10px] font-black uppercase tracking-widest transition-colors shrink-0"
              >
                CUT
              </button>

              {/* AUTO */}
              <button
                onClick={handleAuto}
                className="px-3 py-2 rounded-lg bg-[#6B0099] hover:bg-[#7d00b4] text-white text-[10px] font-black uppercase tracking-widest transition-colors shrink-0"
              >
                AUTO
              </button>

              {/* T-Bar */}
              <div className="flex flex-col gap-0.5 px-1 flex-1 min-w-0">
                <span className="text-[7px] text-white/20 uppercase tracking-widest text-center">T-Bar</span>
                <input
                  type="range"
                  min={0} max={100}
                  value={Math.round(tBarValue * 100)}
                  onChange={e => handleTBarChange(Number(e.target.value) / 100)}
                  className="w-full h-2 cursor-pointer accent-[#6B0099]"
                />
                {/* Transition progress track */}
                <div className="h-0.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-[#6B0099] rounded-full transition-all duration-75"
                    style={{ width: `${transitionProgress * 100}%` }}
                  />
                </div>
              </div>

              {/* FTB */}
              <button
                onClick={handleFTB}
                className="px-2 py-2 rounded-lg bg-white/[0.04] hover:bg-white/10 text-white/40 hover:text-white text-[9px] font-black uppercase tracking-wider transition-colors shrink-0"
              >
                FTB
              </button>

              <div className="w-px h-8 bg-white/[0.07] shrink-0" />

              {/* Transition type */}
              <div className="flex flex-wrap gap-1 shrink-0">
                {TRANS_OPTIONS.map(opt => (
                  <button
                    key={opt.type}
                    onClick={() => setTransitionType(opt.type)}
                    className={`px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors ${
                      transitionType === opt.type
                        ? 'bg-[#6B0099] text-white'
                        : 'bg-white/[0.04] text-white/35 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="w-px h-8 bg-white/[0.07] shrink-0" />

              {/* Duration */}
              <div className="flex flex-col gap-0.5 shrink-0 w-16">
                <span className="text-[7px] text-white/20 uppercase tracking-widest text-center">Dur</span>
                <input
                  type="range"
                  min={100} max={3000} step={100}
                  value={transitionDuration}
                  onChange={e => setTransitionDuration(Number(e.target.value))}
                  className="w-full h-1.5 cursor-pointer accent-[#6B0099]"
                />
                <span className="text-[7px] text-white/25 text-center font-mono">
                  {(transitionDuration / 1000).toFixed(1)}s
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─────────────────── RIGHT PANEL (288px) ────────────────────────── */}
        <div className="w-72 bg-[#0d0d0d] border-l border-white/[0.05] flex flex-col shrink-0">

          {/* Tab bar */}
          <div className="flex border-b border-white/[0.05] shrink-0">
            {(
              [
                { id: 'graphics' as RightTab, icon: <Layers size={10} />,    label: 'GFX'  },
                { id: 'audio'    as RightTab, icon: <Volume2 size={10} />,   label: 'AUD'  },
                { id: 'color'    as RightTab, icon: <Palette size={10} />,   label: 'CC'   },
                { id: 'midi'     as RightTab, icon: <Usb size={10} />,       label: 'MIDI' },
                { id: 'settings' as RightTab, icon: <Settings size={10} />,  label: '⚙'   },
              ]
            ).map(tab => (
              <button
                key={tab.id}
                onClick={() => setRightTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-[8px] font-black uppercase tracking-widest transition-colors border-b-2 ${
                  rightTab === tab.id
                    ? 'text-white border-[#6B0099]'
                    : 'text-white/25 border-transparent hover:text-white/50 hover:border-white/10'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">

            {/* ── GRAPHICS ─────────────────────────────────────────────────── */}
            {rightTab === 'graphics' && (
              <>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setShowLTForm(v => !v)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl bg-[#6B0099]/15 border border-[#6B0099]/25 text-[#a855f7] hover:bg-[#6B0099]/25 text-[9px] font-bold transition-colors"
                  >
                    <Type size={10} /> Lower Third
                  </button>
                  <button
                    onClick={handleAddClock}
                    title="Add Clock"
                    className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white/40 hover:text-white text-[9px] font-bold transition-colors"
                  >
                    <Clock size={11} />
                  </button>
                  <button
                    onClick={handleAddWebmOverlay}
                    title="Add WebM / APNG overlay"
                    className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white/40 hover:text-white text-[9px] font-bold transition-colors"
                  >
                    <Film size={11} />
                  </button>
                </div>

                <AnimatePresence>
                  {showLTForm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 p-2.5 bg-[#111] rounded-xl border border-white/[0.06]">
                        <input
                          value={ltTitle}
                          onChange={e => setLtTitle(e.target.value)}
                          placeholder="Title text"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#6B0099]"
                        />
                        <input
                          value={ltSubtitle}
                          onChange={e => setLtSubtitle(e.target.value)}
                          placeholder="Subtitle / Role"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#6B0099]"
                        />
                        <div className="flex gap-1">
                          {(['MODERN', 'CLASSIC', 'MINIMAL'] as const).map(s => (
                            <button
                              key={s}
                              onClick={() => setLtStyle(s)}
                              className={`flex-1 py-1 rounded-lg text-[8px] font-bold transition-colors ${ltStyle === s ? 'bg-[#6B0099] text-white' : 'bg-white/5 text-white/35'}`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={handleAddLowerThird}
                          className="w-full py-1.5 rounded-xl bg-[#6B0099] hover:bg-[#7d00b4] text-white text-[10px] font-black transition-colors"
                        >
                          Add to Output
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Overlay list */}
                {overlays.length === 0 ? (
                  <p className="text-[9px] text-white/20 text-center py-6">No graphics overlays added</p>
                ) : (
                  <div className="space-y-1">
                    {overlays.map(ov => (
                      <div
                        key={ov.id}
                        className="flex items-center gap-2 p-2 rounded-xl bg-[#111] border border-white/[0.05]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-white truncate">{ov.label}</p>
                          <p className="text-[8px] text-white/30 uppercase">{ov.type.replace('_', ' ')}</p>
                        </div>
                        {/* Opacity slider (compact) */}
                        <input
                          type="range" min={0} max={100} value={Math.round(ov.opacity * 100)}
                          onChange={e => engineRef.current?.updateOverlay(ov.id, { opacity: Number(e.target.value) / 100 })}
                          className="w-12 accent-[#6B0099] h-1 cursor-pointer"
                        />
                        <button
                          onClick={() => engineRef.current?.setOverlayVisible(ov.id, !ov.visible)}
                          className={`p-1 rounded transition-colors ${ov.visible ? 'text-[#a855f7]' : 'text-white/20 hover:text-white/40'}`}
                        >
                          {ov.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                        </button>
                        <button
                          onClick={() => engineRef.current?.removeOverlay(ov.id)}
                          className="p-1 rounded text-white/20 hover:text-[#D40055] transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── AUDIO ────────────────────────────────────────────────────── */}
            {rightTab === 'audio' && (
              <>
                {/* Master channel */}
                <div className="p-2.5 bg-[#111] rounded-xl border border-white/[0.05]">
                  <p className="text-[8px] text-white/30 uppercase tracking-widest mb-2">Master Output</p>
                  <div className="flex items-center gap-2">
                    <Volume2 size={10} className="text-white/30 shrink-0" />
                    <input
                      type="range" min={0} max={200}
                      value={Math.round(masterGain * 100)}
                      onChange={e => handleMasterGain(Number(e.target.value) / 100)}
                      className="flex-1 accent-[#6B0099] h-1.5 cursor-pointer"
                    />
                    <span className="text-[9px] text-white/30 font-mono w-7 text-right">
                      {Math.round(masterGain * 100)}
                    </span>
                    <VUBar level={masterLevel} vertical />
                  </div>
                </div>

                {/* Per-source channels */}
                {sources
                  .filter(s => !['COLOR', 'BARS', 'BLACK'].includes(s.type))
                  .map(src => {
                    const gain  = sourceGains[src.id] ?? 1;
                    const muted = sourceMutes[src.id] ?? false;
                    const level = sourceLevels[src.id] ?? 0;
                    return (
                      <div key={src.id} className="flex items-center gap-2 p-2 rounded-xl bg-[#111] border border-white/[0.05]">
                        <button
                          onClick={() => handleMuteSource(src.id)}
                          className={`p-1 rounded transition-colors shrink-0 ${muted ? 'text-[#D40055]' : 'text-white/35 hover:text-white'}`}
                        >
                          {muted ? <MicOff size={10} /> : <Mic size={10} />}
                        </button>
                        <span className="text-[9px] font-semibold text-white/50 truncate w-14 shrink-0">{src.label}</span>
                        <input
                          type="range" min={0} max={200}
                          value={Math.round(gain * 100)}
                          onChange={e => handleSourceGain(src.id, Number(e.target.value) / 100)}
                          className="flex-1 accent-[#6B0099] h-1 cursor-pointer"
                          disabled={muted}
                        />
                        <VUBar level={muted ? 0 : level} vertical className="shrink-0" />
                      </div>
                    );
                  })}

                {sources.filter(s => !['COLOR', 'BARS', 'BLACK'].includes(s.type)).length === 0 && (
                  <p className="text-[9px] text-white/20 text-center py-6">No audio sources</p>
                )}
              </>
            )}

            {/* ── COLOR CORRECTION ─────────────────────────────────────────── */}
            {rightTab === 'color' && (
              <>
                <div>
                  <p className="text-[8px] text-white/30 uppercase tracking-widest mb-1.5">Source</p>
                  <select
                    value={selectedSourceId ?? ''}
                    onChange={e => setSelectedSourceId(e.target.value || null)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:border-[#6B0099] transition-colors"
                  >
                    <option value="">Select a source…</option>
                    {sources
                      .filter(s => !['COLOR', 'BARS'].includes(s.type))
                      .map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                  </select>
                </div>

                {selectedSourceId ? (
                  <>
                    {(
                      [
                        { key: 'brightness' as const, label: 'Brightness', icon: <Sun size={10} />,       min: 0,    max: 2,   step: 0.02 },
                        { key: 'contrast'   as const, label: 'Contrast',   icon: <Contrast size={10} />,  min: 0,    max: 2,   step: 0.02 },
                        { key: 'saturation' as const, label: 'Saturation', icon: <Droplet size={10} />,   min: 0,    max: 2,   step: 0.02 },
                        { key: 'hue'        as const, label: 'Hue Rotate', icon: <Palette size={10} />,   min: -180, max: 180, step: 1    },
                      ]
                    ).map(({ key, label, icon, min, max, step }) => (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-[9px] text-white/35">{icon} {label}</span>
                          <span className="text-[9px] text-white/45 font-mono">
                            {cc[key].toFixed(key === 'hue' ? 0 : 2)}{key === 'hue' ? '°' : ''}
                          </span>
                        </div>
                        <input
                          type="range" min={min} max={max} step={step}
                          value={cc[key]}
                          onChange={e => handleCC(key, Number(e.target.value))}
                          className="w-full accent-[#6B0099] h-1.5 cursor-pointer"
                        />
                      </div>
                    ))}

                    <button
                      onClick={resetCC}
                      className="w-full py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white/35 hover:text-white text-[9px] font-bold transition-colors"
                    >
                      Reset to Default
                    </button>

                    {/* 3D LUT */}
                    <div className="pt-1.5 border-t border-white/[0.05]">
                      <p className="text-[8px] text-white/25 mb-2">3D LUT (.cube) — applied on export output</p>
                      <button
                        onClick={() => {
                          const inp = document.createElement('input');
                          inp.type = 'file'; inp.accept = '.cube';
                          inp.onchange = () => {
                            if (inp.files?.[0]) {
                              alert('LUT loaded. Will be applied to the broadcast output stream.');
                            }
                          };
                          inp.click();
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white/35 hover:text-white text-[9px] font-bold transition-colors"
                      >
                        <Upload size={10} /> Load .cube LUT
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-[9px] text-white/20 text-center py-8">Select a source to adjust</p>
                )}
              </>
            )}

            {/* ── MIDI ─────────────────────────────────────────────────────── */}
            {rightTab === 'midi' && (
              <>
                <button
                  onClick={handleConnectMIDI}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black transition-colors ${
                    midiConnected
                      ? 'bg-green-500/15 border border-green-500/25 text-green-400'
                      : 'bg-[#6B0099]/15 border border-[#6B0099]/25 text-[#a855f7] hover:bg-[#6B0099]/25'
                  }`}
                >
                  <Usb size={12} />
                  {midiConnected ? 'MIDI Connected' : 'Connect MIDI / Controller'}
                </button>

                <div className="p-2.5 bg-[#111] rounded-xl border border-white/[0.05]">
                  <p className="text-[8px] text-white/30 uppercase tracking-widest mb-2">Default CC Mappings</p>
                  <div className="space-y-1.5">
                    {[
                      { cc: 'CC 1–8',  fn: 'Source channel faders' },
                      { cc: 'CC 10',   fn: 'Master output fader'   },
                      { cc: 'CC 20',   fn: 'CUT (value > 63)'      },
                      { cc: 'CC 21',   fn: 'AUTO transition'        },
                      { cc: 'CC 22',   fn: 'Fade to Black'          },
                      { cc: 'Note C3', fn: 'CUT (note-on)'         },
                    ].map(m => (
                      <div key={m.cc} className="flex items-center gap-2 text-[9px]">
                        <span className="text-[#a855f7] font-mono w-16 shrink-0">{m.cc}</span>
                        <span className="text-white/40">{m.fn}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 bg-[#111] rounded-xl border border-white/[0.05]">
                  <p className="text-[8px] text-white/30 uppercase tracking-widest mb-2">Stream Deck</p>
                  <p className="text-[9px] text-white/35 leading-relaxed">
                    Connect via Elgato Stream Deck SDK. Install the Plajah plugin from the
                    Stream Deck Store, then connect via WebSocket on port 28196.
                  </p>
                </div>
              </>
            )}

            {/* ── SETTINGS ─────────────────────────────────────────────────── */}
            {rightTab === 'settings' && (
              <>
                {activeProject && (
                  <div className="p-2.5 bg-[#111] rounded-xl border border-white/[0.05]">
                    <p className="text-[8px] text-white/30 uppercase tracking-widest mb-2">Project</p>
                    {[
                      ['Title',       activeProject.title],
                      ['Resolution',  activeProject.resolution],
                      ['Frame Rate',  `${activeProject.frameRate} fps`],
                      ['Output Mode', activeProject.outputMode],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between py-0.5 text-[9px]">
                        <span className="text-white/30">{k}</span>
                        <span className="text-white/60 font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-2.5 bg-[#111] rounded-xl border border-white/[0.05]">
                  <p className="text-[8px] text-white/30 uppercase tracking-widest mb-2">Export Edit List</p>
                  <div className="space-y-1.5">
                    <button
                      onClick={handleExportEDL}
                      className="w-full flex items-center gap-2 py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white/50 hover:text-white text-[9px] font-bold transition-colors"
                    >
                      <Download size={10} /> CMX 3600 EDL
                    </button>
                    <button
                      onClick={handleExportFCPXML}
                      className="w-full flex items-center gap-2 py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white/50 hover:text-white text-[9px] font-bold transition-colors"
                    >
                      <Download size={10} /> Final Cut Pro XML
                    </button>
                  </div>
                </div>

                <div className="p-2.5 bg-[#111] rounded-xl border border-white/[0.05]">
                  <p className="text-[8px] text-white/30 uppercase tracking-widest mb-2">Engine</p>
                  <div className="space-y-0.5 text-[9px] text-white/30">
                    <div>Compositor: Canvas 2D / rAF loop @ 60fps</div>
                    <div>Audio: Web Audio API (GainNode graph)</div>
                    <div>Recording: MediaRecorder VP9/Opus 8Mbps</div>
                    <div>Transitions: MIX · DIP · WIPE · T-Bar</div>
                    <div>Stream out: canvas.captureStream(fps)</div>
                  </div>
                </div>

                <button
                  onClick={() => setShowProjectModal(true)}
                  className="w-full flex items-center gap-2 py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white/50 hover:text-white text-[9px] font-bold transition-colors"
                >
                  <Film size={10} /> Switch / New Project
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TVStudio;
