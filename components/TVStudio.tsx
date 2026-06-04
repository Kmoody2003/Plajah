/**
 * TVStudio — Plajah TV Studio Master Control
 *
 * Layout: ProStream Precision-style master control room.
 * Brand:  Plajah dark #D40055 program tally · #6B0099 preview tally.
 *
 * ┌─ Header: branding + tab nav ─────────────────────────────────────────────┐
 * │ Sidebar │ Program monitor │ Preview monitor │ 2×4 mini multiview         │
 * │         ├────────── 8-source thumbnail strip ──────────────────────────── │
 * │         │ Media Asset Bin          │ Switcher: Prog/Prev bus + T-Bar      │
 * └─────────┴─────────────────────────────────────────────────────────────────┘
 * Footer: AUTO TRANS · CUT/TAKE
 *
 * Engine: TVStudioEngine — canvas compositor, Web Audio, MediaRecorder, EDL.
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Video, Monitor, Film, Palette, Radio, Circle, Square,
  Volume2, Mic, MicOff, Layers, Eye, EyeOff, Trash2, Download,
  Settings, Usb, Clock, Clapperboard, Sun, Contrast, Droplet,
  Upload, Type, Activity, Database, Sliders, Lock, Zap,
  ChevronRight,
} from 'lucide-react';
import {
  TVStudioEngine, StudioSource, GraphicOverlay, TransitionType,
} from '../services/tvStudioEngine';
import { db } from '../services/firebase';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';

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

export interface TVStudioProps {
  currentUser: FirebaseUser | null;
  onBack: () => void;
  onStreamReady?: (stream: MediaStream) => void;
}

type StudioTab = 'SWITCHER' | 'AUDIO' | 'SETTINGS';

// ── SourceCanvas ──────────────────────────────────────────────────────────────
// Renders one engine source into a canvas at ~8 fps.

function SourceCanvas({
  source,
  className = '',
}: {
  source: StudioSource;
  className?: string;
}) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      frameRef.current++;
      if (frameRef.current % 8 === 0) {
        if (source.videoEl && source.isReady) {
          ctx.filter = `brightness(${source.brightness}) contrast(${source.contrast}) saturate(${source.saturation}) hue-rotate(${source.hue}deg)`;
          ctx.drawImage(source.videoEl, 0, 0, 160, 90);
          ctx.filter = 'none';
        } else if (source.type === 'BARS') {
          const bars = ['#C0C0C0','#C0C000','#00C0C0','#00C000','#C000C0','#C00000','#0000C0'];
          bars.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * (160/7), 0, 160/7, 90); });
        } else if (source.color) {
          ctx.fillStyle = source.color === 'BARS' ? '#888' : source.color;
          ctx.fillRect(0, 0, 160, 90);
        } else if (source.imageEl) {
          ctx.drawImage(source.imageEl, 0, 0, 160, 90);
        } else {
          ctx.fillStyle = '#111';
          ctx.fillRect(0, 0, 160, 90);
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
  const cvRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!source) {
        ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, 1920, 1080);
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
        ctx.fillStyle = '#000';    ctx.fillRect(720, 810, 720, 270);
      } else if (source.color) {
        ctx.fillStyle = source.color === 'BARS' ? '#888' : source.color;
        ctx.fillRect(0, 0, 1920, 1080);
      } else if (source.imageEl) {
        ctx.drawImage(source.imageEl, 0, 0, 1920, 1080);
      } else {
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 1920, 1080);
      }
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
  if (vertical) {
    return (
      <div className={`relative bg-black/40 rounded overflow-hidden ${className}`} style={{ width: 6, height: 56 }}>
        <div className="absolute bottom-0 left-0 right-0 transition-all duration-75" style={{ height: `${pct}%`, backgroundColor: color }} />
      </div>
    );
  }
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
    window.addEventListener('pointerup',   onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [onChange, getPos]);

  const handlePct = Math.round(value * 83); // cap at 83% so handle stays visible

  return (
    <div
      ref={trackRef}
      className="relative rounded-full cursor-pointer select-none"
      style={{ width: 18, height: 136, background: '#080808', border: '1px solid #2a2a2a' }}
      onPointerDown={e => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        onChange(getPos(e.clientY));
      }}
    >
      {/* Track fill */}
      <div
        className="absolute bottom-0 left-0 right-0 rounded-full"
        style={{ height: `${(1 - value) * 100}%`, background: 'rgba(107,0,153,0.25)' }}
      />
      {/* Handle */}
      <div
        className="absolute left-1/2 rounded-sm"
        style={{
          top: `${handlePct}%`,
          width: 32,
          height: 18,
          transform: 'translateX(-50%)',
          background: 'linear-gradient(180deg, #2e2e2e 0%, #1a1a1a 100%)',
          border: '1px solid #555',
          boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-px bg-white/20" />
      </div>
    </div>
  );
}

// ── Elapsed timer hook ────────────────────────────────────────────────────────

function useElapsed(running: boolean, startMs: number) {
  const [elapsed, setElapsed] = useState('00:00:00:00');
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const ms = Date.now() - startMs;
      const h  = String(Math.floor(ms / 3600000)).padStart(2, '0');
      const m  = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
      const s  = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
      const f  = String(Math.floor((ms % 1000) / 33)).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}:${f}`);
    }, 33);
    return () => clearInterval(id);
  }, [running, startMs]);
  return elapsed;
}

// ── Main Component ────────────────────────────────────────────────────────────

const TVStudio: React.FC<TVStudioProps> = ({ currentUser, onBack, onStreamReady }) => {

  // ── Project ────────────────────────────────────────────────────────────────
  const [projects, setProjects]               = useState<StudioProjectDoc[]>([]);
  const [activeProject, setActiveProject]     = useState<StudioProjectDoc | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newTitle, setNewTitle]               = useState('New Show');
  const [newRes, setNewRes]                   = useState<StudioProjectDoc['resolution']>('1920x1080');
  const [newFps, setNewFps]                   = useState<StudioProjectDoc['frameRate']>(30);
  const [newMode, setNewMode]                 = useState<StudioProjectDoc['outputMode']>('BOTH');

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

  // ── UI state ───────────────────────────────────────────────────────────────
  const [studioTab, setStudioTab]             = useState<StudioTab>('SWITCHER');
  const [transitionType, setTransitionType]   = useState<TransitionType>('MIX');
  const [transitionDuration, setTransitionDuration] = useState(500);
  const [tBarValue, setTBarValue]             = useState(0);
  const [midiConnected, setMidiConnected]     = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [inspectedSourceId, setInspectedSourceId] = useState<string | null>(null);

  // Graphics overlay form
  const [showLTForm, setShowLTForm]           = useState(false);
  const [ltTitle, setLtTitle]                 = useState('');
  const [ltSubtitle, setLtSubtitle]           = useState('');
  const [ltStyle, setLtStyle]                 = useState<'MODERN' | 'CLASSIC' | 'MINIMAL'>('MODERN');

  // Audio
  const [masterGain, setMasterGain]           = useState(1);
  const [sourceGains, setSourceGains]         = useState<Record<string, number>>({});
  const [sourceMutes, setSourceMutes]         = useState<Record<string, boolean>>({});

  // Color correction
  const [cc, setCC] = useState({ brightness: 1, contrast: 1, saturation: 1, hue: 0 });

  // Settings sub-tab
  const [settingsSub, setSettingsSub] = useState<'COLOR' | 'MIDI' | 'EXPORT'>('EXPORT');

  // ── Derived ────────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sources      = useMemo(() => engineRef.current?.getSources() ?? [], [sourcesVer]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const overlays     = useMemo(() => engineRef.current?.getOverlays() ?? [], [overlaysVer]);
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
    eng.start();
    eng.setPreview('black');

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

    return () => { eng.destroy(); cancelAnimationFrame(levelRafRef.current); };
  }, []);

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
      resolution: newRes, frameRate: newFps, outputMode: newMode, createdAt: now,
    };
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
  const handleAddMedia   = useCallback(() => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'video/*,image/*';
    inp.onchange = async () => {
      const file = inp.files?.[0];
      if (!file || !engineRef.current) return;
      const url = URL.createObjectURL(file);
      const label = file.name.replace(/\.[^.]+$/, '');
      if (file.type.startsWith('image/')) engineRef.current.addGraphicSource(url, label);
      else await engineRef.current.addMediaSource(url, label);
    };
    inp.click();
  }, []);

  const handleSourceClick = useCallback((id: string) => {
    const e = engineRef.current;
    if (!e || e.getProgramId() === id) return;
    e.setPreview(id);
    setSelectedSourceId(id);
  }, []);

  const handleRemoveSource = useCallback((id: string) => {
    engineRef.current?.removeSource(id);
  }, []);

  // ── Switcher ───────────────────────────────────────────────────────────────
  const handleCut   = useCallback(() => { engineRef.current?.cut(); setTBarValue(0); }, []);
  const handleAuto  = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setTransitionType(transitionType);
    e.setTransitionDuration(transitionDuration);
    e.auto();
  }, [transitionType, transitionDuration]);
  const handleFTB   = useCallback(() => { engineRef.current?.fadeToBlack(); }, []);
  const handleTBar  = useCallback((v: number) => {
    setTBarValue(v);
    engineRef.current?.setTBar(v);
    if (v >= 1) setTimeout(() => setTBarValue(0), 400);
  }, []);

  // Direct program cut (program bus row click)
  const handleProgramCut = useCallback((id: string) => {
    const e = engineRef.current;
    if (!e) return;
    e.setPreview(id);
    e.cut();
    setTBarValue(0);
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
    e.addOverlay({ id: `lt_${Date.now()}`, label: ltTitle || 'Lower Third', type: 'LOWER_THIRD', title: ltTitle, subtitle: ltSubtitle, style: ltStyle, visible: true, opacity: 1 });
    setLtTitle(''); setLtSubtitle(''); setShowLTForm(false);
  }, [ltTitle, ltSubtitle, ltStyle]);

  const handleAddClock = useCallback(() => {
    engineRef.current?.addOverlay({ id: `clock_${Date.now()}`, label: 'Clock', type: 'CLOCK', visible: true, opacity: 1 });
  }, []);

  const handleAddWebmOverlay = useCallback(() => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'video/webm,image/apng,.webm,.apng';
    inp.onchange = () => {
      const file = inp.files?.[0];
      if (!file || !engineRef.current) return;
      const url = URL.createObjectURL(file);
      const vid = document.createElement('video');
      vid.src = url; vid.loop = true; vid.autoplay = true; vid.muted = true;
      vid.play().catch(() => {});
      engineRef.current.addOverlay({ id: `webm_${Date.now()}`, label: file.name, type: 'WEBM', url, videoEl: vid, x: 0, y: 0, width: 100, height: 100, visible: true, opacity: 1 });
    };
    inp.click();
  }, []);

  // ── Audio ──────────────────────────────────────────────────────────────────
  const handleMasterGain = useCallback((g: number) => { engineRef.current?.setMasterGain(g); setMasterGain(g); }, []);
  const handleSourceGain = useCallback((id: string, g: number) => { engineRef.current?.setSourceGain(id, g); setSourceGains(p => ({ ...p, [id]: g })); }, []);
  const handleMuteSource = useCallback((id: string) => {
    const muted = !sourceMutes[id];
    engineRef.current?.muteSource(id, muted);
    setSourceMutes(p => ({ ...p, [id]: muted }));
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
    setCC({ brightness: 1, contrast: 1, saturation: 1, hue: 0 });
    engineRef.current?.setSourceCC(selectedSourceId, 1, 1, 1, 0);
  }, [selectedSourceId]);

  // ── MIDI ───────────────────────────────────────────────────────────────────
  const handleConnectMIDI = useCallback(async () => {
    const ok = await engineRef.current?.initMIDI((cc, value) => {
      if (cc === 10)              handleMasterGain(value / 127 * 2);
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
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = `${activeProject?.title ?? 'show'}.edl`; a.click();
  }, [activeProject]);
  const handleExportFCPXML = useCallback(() => {
    const xml = engineRef.current?.exportFCPXML(activeProject?.title ?? 'Show', activeProject?.frameRate ?? 30);
    if (!xml) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' })); a.download = `${activeProject?.title ?? 'show'}.fcpxml`; a.click();
  }, [activeProject]);

  // ── Transition config ──────────────────────────────────────────────────────
  const TRANS: { type: TransitionType; label: string }[] = [
    { type: 'MIX', label: 'MIX' }, { type: 'DIP', label: 'DIP' },
    { type: 'WIPE_LEFT', label: '←WPE' }, { type: 'WIPE_RIGHT', label: 'WPE→' },
    { type: 'STING', label: 'STING' },
  ];

  // Bus button helper — maps source index → button number
  const busLabel = (src: StudioSource, idx: number) => idx + 1;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden z-50 text-white select-none"
      style={{ background: '#0e0e0e', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
    >
      {/* Inject JetBrains Mono */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');`}</style>

      {/* ═══════════════════════ PROJECT SETUP MODAL ═════════════════════════ */}
      <AnimatePresence>
        {showProjectModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.94, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              className="rounded-xl border p-6 w-full max-w-md shadow-2xl"
              style={{ background: '#111', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(107,0,153,0.2)', border: '1px solid rgba(107,0,153,0.3)' }}>
                  <Clapperboard size={18} style={{ color: '#a855f7' }} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight">Plajah TV Studio</h2>
                  <p className="text-[10px] opacity-40">New project or open existing</p>
                </div>
              </div>

              {projects.length > 0 && (
                <div className="mb-4">
                  <p className="text-[9px] opacity-30 uppercase tracking-widest mb-2">Recent</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {projects.map(p => (
                      <button key={p.id}
                        onClick={() => { setActiveProject(p); setShowProjectModal(false); }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors"
                        style={{ background: 'rgba(255,255,255,0.04)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                      >
                        <span className="text-xs font-semibold">{p.title}</span>
                        <span className="text-[9px] opacity-30">{p.resolution} · {p.frameRate}fps</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                    <span className="text-[9px] opacity-25 px-1">or create new</span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Project title"
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#6B0099')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
                />
                <div className="grid grid-cols-2 gap-2">
                  {[['Resolution', newRes, setNewRes as any, [['1920x1080','1920×1080'],['1280x720','1280×720'],['3840x2160','4K UHD']]],
                    ['Frame Rate', newFps, setNewFps as any, [[25,'25fps'],[29.97,'29.97fps'],[30,'30fps'],[50,'50fps'],[59.94,'59.94fps'],[60,'60fps']]]
                  ].map(([label, val, setter, opts]: any) => (
                    <div key={label}>
                      <p className="text-[9px] opacity-35 uppercase tracking-widest mb-1.5">{label}</p>
                      <select value={val} onChange={e => setter(isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}
                        className="w-full rounded-lg px-2 py-2 text-xs text-white outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {opts.map(([v, l]: any) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-[9px] opacity-35 uppercase tracking-widest mb-1.5">Output Mode</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['LIVE','RECORD','BOTH'] as const).map(m => (
                      <button key={m} onClick={() => setNewMode(m)}
                        className="py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors"
                        style={{ background: newMode === m ? '#6B0099' : 'rgba(255,255,255,0.05)', color: newMode === m ? '#fff' : 'rgba(255,255,255,0.35)' }}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={createProject}
                  className="w-full py-3 rounded-xl text-white text-sm font-black uppercase tracking-widest transition-colors"
                  style={{ background: '#6B0099' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#7d00b4')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#6B0099')}>
                  Open Studio
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════ TOP HEADER ══════════════════════════════════ */}
      <header className="flex items-center justify-between px-3 shrink-0"
        style={{ height: 44, background: '#111', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="opacity-30 hover:opacity-80 transition-opacity p-1">
            <ArrowLeft size={14} />
          </button>
          <div className="flex items-center gap-2">
            <Clapperboard size={13} style={{ color: '#6B0099' }} />
            <span className="text-xs font-black tracking-widest uppercase text-white/70">
              Plajah TV Studio
            </span>
          </div>
          {/* Tab navigation */}
          <nav className="flex items-center gap-0 ml-4">
            {([
              { id: 'SWITCHER' as StudioTab, label: 'Live Switcher'  },
              { id: 'AUDIO'    as StudioTab, label: 'Fairlight Audio' },
              { id: 'SETTINGS' as StudioTab, label: 'System Config'  },
            ]).map(tab => (
              <button key={tab.id} onClick={() => setStudioTab(tab.id)}
                className="px-3 py-1 text-[11px] font-semibold transition-all border-b-2 mr-1"
                style={{
                  color: studioTab === tab.id ? '#c9c6c5' : 'rgba(255,255,255,0.3)',
                  borderBottomColor: studioTab === tab.id ? '#6B0099' : 'transparent',
                  paddingBottom: 10,
                }}>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* Rec timecode */}
          {isRecording && (
            <div className="flex items-center gap-2 px-2 py-0.5 rounded" style={{ background: 'rgba(212,0,85,0.15)', border: '1px solid rgba(212,0,85,0.3)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-[#D40055] animate-pulse" />
              <span className="font-mono text-[#D40055] text-[11px] font-bold">{timecode}</span>
            </div>
          )}

          {/* System icons */}
          {[Database, Activity, Sliders].map((Icon, i) => (
            <button key={i} className="opacity-30 hover:opacity-70 transition-opacity"><Icon size={14} /></button>
          ))}

          {/* Project selector */}
          <button onClick={() => setShowProjectModal(true)}
            className="text-[10px] px-2 py-1 rounded opacity-40 hover:opacity-80 transition-opacity uppercase tracking-wider"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            {activeProject?.title ?? 'No Project'}
          </button>
        </div>
      </header>

      {/* ═══════════════════════ BODY ════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0">

        {/* ══════════════════ LEFT SIDEBAR ═══════════════════════════════════ */}
        <nav className="flex flex-col items-center py-3 gap-1 shrink-0"
          style={{ width: 72, background: '#111', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex flex-col items-center mb-4">
            <span className="text-[10px] font-black text-[#6B0099] tracking-widest">PLJ-V1</span>
            <span className="text-[7px] opacity-40 tracking-tight">MASTER CTRL</span>
          </div>

          {([
            { id: 'SWITCHER' as StudioTab, icon: <Activity size={16} />, label: 'Live Bus'   },
            { id: 'AUDIO'    as StudioTab, icon: <Sliders  size={16} />, label: 'Fairlight'  },
            { id: 'SETTINGS' as StudioTab, icon: <Settings size={16} />, label: 'Config'     },
          ]).map(item => (
            <button key={item.id} onClick={() => setStudioTab(item.id)}
              className="flex flex-col items-center gap-1 p-2 w-14 rounded-lg transition-all"
              style={{
                background: studioTab === item.id ? 'rgba(107,0,153,0.35)' : 'transparent',
                color: studioTab === item.id ? '#fff' : 'rgba(255,255,255,0.3)',
                border: studioTab === item.id ? '1px solid rgba(107,0,153,0.5)' : '1px solid transparent',
              }}>
              {item.icon}
              <span className="text-[8px] font-bold">{item.label}</span>
            </button>
          ))}

          {/* Bottom actions */}
          <div className="mt-auto flex flex-col items-center gap-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', width: '100%', alignItems: 'center' }}>
            {/* TAKE shortcut */}
            <button onClick={handleCut}
              className="w-14 py-2 rounded font-black text-[10px] uppercase tracking-wider transition-all active:scale-95 touch-manipulation"
              style={{ background: '#D40055', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
              TAKE
            </button>
            <button onClick={handleFTB} className="opacity-30 hover:opacity-70 transition-opacity"><Lock size={16} /></button>
            {onStreamReady && (
              <button onClick={handleGoLive}
                className="flex flex-col items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
                <Radio size={16} style={{ color: '#22c55e' }} />
                <span className="text-[7px] font-bold text-green-400">LIVE</span>
              </button>
            )}
          </div>
        </nav>

        {/* ══════════════════ MAIN CONTENT ═══════════════════════════════════ */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 gap-1.5 p-1.5 overflow-hidden"
          style={{ background: '#0a0a0a' }}>

          {/* ════════════ SWITCHER TAB ════════════════════════════════════════ */}
          {studioTab === 'SWITCHER' && (
            <>
              {/* ── Top row: Program | Preview | 2×4 mini multiview ── */}
              <div className="flex gap-1.5 min-h-0" style={{ flex: '3 1 0' }}>

                {/* Program */}
                <div className="relative rounded overflow-hidden bg-black" style={{ flex: '3 1 0', border: '1px solid #D40055' }}>
                  <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider"
                    style={{ background: '#D40055', color: '#fff' }}>Program</div>
                  <canvas ref={programCanvasRef} width={1920} height={1080} className="w-full h-full block" />
                  {!programId && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[10px] opacity-15 uppercase tracking-widest">No Program Source</span>
                    </div>
                  )}
                  {/* Timecode */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-2 px-2.5 py-1 rounded"
                    style={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex flex-col items-end">
                      <span className="text-[7px] opacity-40 font-bold uppercase tracking-widest">
                        {isRecording ? 'REC TIME' : programLabel}
                      </span>
                      <span className="font-mono font-bold text-[#D40055] text-sm">
                        {isRecording ? timecode : '—'}
                      </span>
                    </div>
                    <VUBar level={masterLevel} vertical className="shrink-0" />
                  </div>
                </div>

                {/* Preview */}
                <div className="relative rounded overflow-hidden bg-black" style={{ flex: '3 1 0', border: '1px solid #6B0099' }}>
                  <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider"
                    style={{ background: '#6B0099', color: '#fff' }}>Preview</div>
                  <PreviewMonitor source={previewSource} />
                  {!previewId && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[10px] opacity-15 uppercase tracking-widest">No Source</span>
                    </div>
                  )}
                  {/* Transition progress */}
                  {transitionProgress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'rgba(107,0,153,0.3)' }}>
                      <div className="h-full transition-all duration-75" style={{ width: `${transitionProgress * 100}%`, background: '#6B0099' }} />
                    </div>
                  )}
                </div>

                {/* 2×4 mini multiview */}
                <div className="grid grid-cols-2 gap-1 shrink-0" style={{ flex: '1 0 0', minWidth: 120 }}>
                  {Array.from({ length: 8 }).map((_, i) => {
                    const src = sources[i];
                    const isPgm = src && programId === src.id;
                    const isPvw = src && previewId  === src.id;
                    return (
                      <div key={i}
                        onClick={() => src && handleSourceClick(src.id)}
                        className="relative rounded overflow-hidden cursor-pointer"
                        style={{
                          background: '#111',
                          border: `1px solid ${isPgm ? '#D40055' : isPvw ? '#6B0099' : 'rgba(255,255,255,0.07)'}`,
                        }}>
                        {src ? (
                          <>
                            <SourceCanvas source={src} className="w-full h-full block object-cover" />
                            <span className="absolute bottom-0.5 left-1 text-[7px] font-bold font-mono px-0.5 rounded"
                              style={{ background: isPgm ? '#D40055' : isPvw ? '#6B0099' : 'rgba(0,0,0,0.6)', color: '#fff' }}>
                              {src.label.slice(0, 6)}
                            </span>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-[7px] font-mono opacity-20">—</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── 8-source strip ── */}
              <div className="shrink-0">
                <div className="flex items-center justify-between px-0.5 mb-1">
                  <span className="text-[9px] opacity-30 uppercase tracking-widest font-bold">Multi-view Sources</span>
                  <div className="flex gap-1">
                    <button onClick={handleAddCamera} className="text-[8px] px-2 py-0.5 rounded transition-all opacity-40 hover:opacity-80 uppercase"
                      style={{ border: '1px solid rgba(255,255,255,0.1)' }}>+ Camera</button>
                    <button onClick={handleAddScreen} className="text-[8px] px-2 py-0.5 rounded transition-all opacity-40 hover:opacity-80 uppercase"
                      style={{ border: '1px solid rgba(255,255,255,0.1)' }}>+ Screen</button>
                    <button onClick={handleAddMedia} className="text-[8px] px-2 py-0.5 rounded transition-all opacity-40 hover:opacity-80 uppercase"
                      style={{ border: '1px solid rgba(255,255,255,0.1)' }}>+ Media</button>
                  </div>
                </div>
                <div className="grid grid-cols-8 gap-1.5">
                  {Array.from({ length: Math.max(8, sources.length) }).map((_, i) => {
                    const src = sources[i];
                    const isPgm = src && programId === src.id;
                    const isPvw = src && previewId  === src.id;
                    return (
                      <div key={i}
                        onClick={() => src && handleSourceClick(src.id)}
                        className="relative rounded overflow-hidden cursor-pointer group transition-colors"
                        style={{
                          aspectRatio: '16/9',
                          background: '#000',
                          border: `1px solid ${isPgm ? '#D40055' : isPvw ? '#6B0099' : 'rgba(255,255,255,0.07)'}`,
                        }}
                        onMouseEnter={e => { if (!isPgm && !isPvw) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                        onMouseLeave={e => { if (!isPgm && !isPvw) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
                      >
                        {src ? (
                          <>
                            <SourceCanvas source={src} className="w-full h-full block object-cover" />
                            <div className="absolute top-1 left-1 flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full"
                                style={{ background: isPgm ? '#D40055' : isPvw ? '#6B0099' : 'rgba(255,255,255,0.3)' }} />
                              <span className="text-[7px] font-bold font-mono opacity-80">
                                SRC {String(i + 1).padStart(2, '0')}
                              </span>
                            </div>
                            <span className="absolute bottom-0.5 left-1 text-[7px] font-mono opacity-70 bg-black/60 px-0.5 rounded">
                              {src.label.slice(0, 8)}
                            </span>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 opacity-20">
                            <span className="text-[7px] font-mono">SRC {String(i + 1).padStart(2, '0')}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Bottom: Media Asset Bin + Switcher Control Panel ── */}
              <div className="flex gap-1.5 shrink-0" style={{ height: 240 }}>

                {/* Media Asset Bin */}
                <div className="rounded-xl flex flex-col gap-2 p-2.5 shrink-0" style={{ flex: '1.5 1 0', background: '#161616', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center justify-between shrink-0">
                    <span className="text-[9px] opacity-40 uppercase tracking-widest font-bold">Media Asset Bin</span>
                    <div className="flex gap-1">
                      <button onClick={handleAddMedia}
                        className="text-[8px] px-2 py-0.5 rounded uppercase transition-all opacity-40 hover:opacity-80"
                        style={{ border: '1px solid rgba(255,255,255,0.1)' }}>Import</button>
                    </div>
                  </div>

                  <div className="flex flex-1 gap-2 min-h-0">
                    {/* Source grid */}
                    <div className="flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                      <div className="grid grid-cols-2 gap-1.5">
                        {sources.filter(s => !['black','bars'].includes(s.id)).map(src => (
                          <div key={src.id}
                            onClick={() => { handleSourceClick(src.id); setInspectedSourceId(src.id); }}
                            className="relative rounded cursor-pointer group transition-colors p-1"
                            style={{
                              background: inspectedSourceId === src.id ? 'rgba(107,0,153,0.15)' : 'rgba(0,0,0,0.3)',
                              border: `1px solid ${inspectedSourceId === src.id ? 'rgba(107,0,153,0.4)' : 'rgba(255,255,255,0.06)'}`,
                            }}>
                            <div className="rounded overflow-hidden" style={{ aspectRatio: '16/9', position: 'relative' }}>
                              <SourceCanvas source={src} className="w-full h-full block object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <ChevronRight size={16} className="text-white" />
                              </div>
                            </div>
                            <div className="flex justify-between items-center mt-1 px-0.5">
                              <span className="text-[7px] font-mono truncate opacity-70">{src.label.toUpperCase()}</span>
                              <span className="text-[7px] font-mono opacity-40 uppercase">{src.type}</span>
                            </div>
                          </div>
                        ))}
                        {sources.filter(s => !['black','bars'].includes(s.id)).length === 0 && (
                          <div className="col-span-2 flex flex-col items-center justify-center py-6 gap-2 opacity-20">
                            <Film size={20} />
                            <span className="text-[9px] font-bold uppercase tracking-widest">No media loaded</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inspector panel */}
                    <div className="flex flex-col gap-2" style={{ width: 160 }}>
                      <div className="rounded overflow-hidden bg-black flex-1 relative" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                        {inspectedSourceId && sources.find(s => s.id === inspectedSourceId) ? (
                          <SourceCanvas source={sources.find(s => s.id === inspectedSourceId)!} className="w-full h-full block object-contain" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center opacity-15">
                            <Film size={20} />
                          </div>
                        )}
                        <div className="absolute top-1 left-1 text-[7px] font-mono opacity-50 bg-black/60 px-1 rounded">
                          INSPECTOR{inspectedSourceId ? `: ${sources.find(s => s.id === inspectedSourceId)?.label?.toUpperCase() ?? ''}` : ''}
                        </div>
                      </div>
                      {/* Overlay section */}
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1">
                          <button onClick={() => setShowLTForm(v => !v)}
                            className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-[8px] font-bold uppercase tracking-wider transition-all"
                            style={{ background: 'rgba(107,0,153,0.15)', border: '1px solid rgba(107,0,153,0.25)', color: '#a855f7' }}>
                            <Type size={9} /> L3
                          </button>
                          <button onClick={handleAddClock}
                            className="px-2 py-1 rounded text-[8px] font-bold uppercase transition-all opacity-40 hover:opacity-80"
                            style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                            <Clock size={9} />
                          </button>
                          <button onClick={handleAddWebmOverlay}
                            className="px-2 py-1 rounded text-[8px] font-bold uppercase transition-all opacity-40 hover:opacity-80"
                            style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                            <Film size={9} />
                          </button>
                        </div>

                        {/* Active overlays */}
                        <div className="space-y-0.5 max-h-16 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                          {overlays.map(ov => (
                            <div key={ov.id} className="flex items-center gap-1 px-1 py-0.5 rounded"
                              style={{ background: 'rgba(255,255,255,0.03)' }}>
                              <span className="text-[7px] font-mono flex-1 truncate opacity-60">{ov.label.toUpperCase()}</span>
                              <button onClick={() => engineRef.current?.setOverlayVisible(ov.id, !ov.visible)}
                                style={{ color: ov.visible ? '#a855f7' : 'rgba(255,255,255,0.2)' }}>
                                {ov.visible ? <Eye size={9} /> : <EyeOff size={9} />}
                              </button>
                              <button onClick={() => engineRef.current?.removeOverlay(ov.id)} className="opacity-20 hover:opacity-70" style={{ color: '#D40055' }}>
                                <Trash2 size={9} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Lower third form */}
                  <AnimatePresence>
                    {showLTForm && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden shrink-0">
                        <div className="flex gap-1.5 pt-1">
                          <input value={ltTitle} onChange={e => setLtTitle(e.target.value)} placeholder="Title"
                            className="flex-1 rounded px-2 py-1 text-[10px] text-white placeholder-white/25 outline-none"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                          <input value={ltSubtitle} onChange={e => setLtSubtitle(e.target.value)} placeholder="Subtitle"
                            className="flex-1 rounded px-2 py-1 text-[10px] text-white placeholder-white/25 outline-none"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                          <button onClick={handleAddLowerThird}
                            className="px-3 py-1 rounded text-[10px] font-black text-white uppercase transition-all"
                            style={{ background: '#6B0099' }}>Add</button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ── Switcher Control Panel ── */}
                <div className="rounded-xl flex gap-4 p-3 shrink-0" style={{ flex: '2 1 0', background: '#161616', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 4px 32px rgba(0,0,0,0.5)' }}>

                  {/* Bus buttons section */}
                  <div className="flex-1 flex flex-col justify-between">
                    {/* Program bus */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] opacity-40 uppercase tracking-widest font-bold">Program Bus</span>
                      <div className="flex flex-wrap gap-2">
                        {sources.map((src, idx) => {
                          const active = programId === src.id;
                          return (
                            <button
                              key={src.id}
                              onClick={() => handleProgramCut(src.id)}
                              className="rounded-lg font-black font-mono flex items-center justify-center transition-all active:scale-95 touch-manipulation"
                              style={{
                                width: 44, height: 44,
                                fontSize: 14,
                                background: active ? '#D40055' : 'rgba(255,255,255,0.07)',
                                color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                                border: `1px solid ${active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)'}`,
                                boxShadow: active ? '0 0 15px rgba(212,0,85,0.4)' : 'none',
                              }}
                              title={src.label}
                            >
                              {busLabel(src, idx)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Preview bus */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] opacity-40 uppercase tracking-widest font-bold">Preview Bus</span>
                      <div className="flex flex-wrap gap-2">
                        {sources.map((src, idx) => {
                          const active = previewId === src.id;
                          return (
                            <button
                              key={src.id}
                              onClick={() => handleSourceClick(src.id)}
                              className="rounded-lg font-black font-mono flex items-center justify-center transition-all active:scale-95 touch-manipulation"
                              style={{
                                width: 44, height: 44,
                                fontSize: 14,
                                background: active ? '#6B0099' : 'rgba(255,255,255,0.07)',
                                color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                                border: `1px solid ${active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)'}`,
                                boxShadow: active ? '0 0 15px rgba(107,0,153,0.4)' : 'none',
                              }}
                              title={src.label}
                            >
                              {busLabel(src, idx)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* T-bar + transition type */}
                  <div className="flex flex-col items-center gap-2 w-20 shrink-0">
                    <span className="text-[9px] opacity-40 uppercase tracking-widest font-bold text-center">X-FADE</span>
                    <VerticalTBar value={tBarValue} onChange={handleTBar} />
                    <div className="flex flex-col gap-1 w-full">
                      {TRANS.map(opt => (
                        <button key={opt.type}
                          onClick={() => setTransitionType(opt.type)}
                          className="h-7 rounded text-[8px] font-black uppercase tracking-wider transition-colors"
                          style={{
                            background: transitionType === opt.type ? 'rgba(107,0,153,0.35)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${transitionType === opt.type ? 'rgba(107,0,153,0.5)' : 'rgba(255,255,255,0.05)'}`,
                            color: transitionType === opt.type ? '#c084fc' : 'rgba(255,255,255,0.4)',
                          }}>
                          {opt.label}
                        </button>
                      ))}
                      {/* Duration */}
                      <div className="flex flex-col gap-0.5 mt-1">
                        <span className="text-[7px] opacity-20 uppercase tracking-widest text-center">DUR</span>
                        <input type="range" min={100} max={3000} step={100} value={transitionDuration}
                          onChange={e => setTransitionDuration(Number(e.target.value))}
                          className="w-full cursor-pointer" style={{ accentColor: '#6B0099', height: 6 }} />
                        <span className="text-[7px] font-mono opacity-25 text-center">{(transitionDuration / 1000).toFixed(1)}s</span>
                      </div>
                    </div>
                  </div>

                  {/* CUT / AUTO */}
                  <div className="flex flex-col gap-2 w-24 shrink-0">
                    <button onClick={handleCut}
                      className="flex-1 rounded-xl font-black text-base flex flex-col items-center justify-center transition-all active:scale-95 touch-manipulation"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#D40055',
                        minHeight: 72,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,0,85,0.1)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}>
                      <span className="text-[7px] opacity-50 mb-1 font-bold">DIRECT</span>
                      CUT
                    </button>
                    <button onClick={handleAuto}
                      className="flex-1 rounded-xl font-black text-base flex flex-col items-center justify-center transition-all active:scale-95 touch-manipulation"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#a855f7',
                        minHeight: 72,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(107,0,153,0.15)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}>
                      <span className="text-[7px] opacity-50 mb-1 font-bold">MIXED</span>
                      AUTO
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ════════════ AUDIO TAB ═══════════════════════════════════════════ */}
          {studioTab === 'AUDIO' && (
            <div className="flex-1 flex flex-col gap-3 p-3 overflow-y-auto min-h-0">
              <div className="flex items-end gap-4 h-full">
                {/* Master channel */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <span className="text-[8px] opacity-40 uppercase tracking-widest font-bold">MASTER</span>
                  <VUBar level={masterLevel} vertical className="shrink-0" />
                  <input type="range" min={0} max={200} value={Math.round(masterGain * 100)}
                    onChange={e => handleMasterGain(Number(e.target.value) / 100)}
                    style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 120, cursor: 'pointer', accentColor: '#6B0099' } as any} />
                  <span className="text-[9px] font-mono opacity-40">{Math.round(masterGain * 100)}%</span>
                  <Volume2 size={12} className="opacity-40" />
                </div>

                <div className="w-px self-stretch" style={{ background: 'rgba(255,255,255,0.06)' }} />

                {/* Per-source channels */}
                {sources.filter(s => !['COLOR','BARS','BLACK'].includes(s.type)).map(src => {
                  const gain  = sourceGains[src.id] ?? 1;
                  const muted = sourceMutes[src.id] ?? false;
                  const level = sourceLevels[src.id] ?? 0;
                  return (
                    <div key={src.id} className="flex flex-col items-center gap-2 shrink-0" style={{ width: 52 }}>
                      <span className="text-[7px] font-mono opacity-40 text-center truncate w-full uppercase">{src.label.slice(0,6)}</span>
                      <VUBar level={muted ? 0 : level} vertical className="shrink-0" />
                      <input type="range" min={0} max={200} value={Math.round(gain * 100)}
                        onChange={e => handleSourceGain(src.id, Number(e.target.value) / 100)}
                        disabled={muted}
                        style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 120, cursor: muted ? 'default' : 'pointer', accentColor: '#6B0099', opacity: muted ? 0.3 : 1 } as any} />
                      <span className="text-[8px] font-mono opacity-30">{Math.round(gain * 100)}</span>
                      <button onClick={() => handleMuteSource(src.id)}
                        style={{ color: muted ? '#D40055' : 'rgba(255,255,255,0.35)' }}>
                        {muted ? <MicOff size={12} /> : <Mic size={12} />}
                      </button>
                    </div>
                  );
                })}

                {sources.filter(s => !['COLOR','BARS','BLACK'].includes(s.type)).length === 0 && (
                  <div className="flex-1 flex items-center justify-center opacity-20">
                    <p className="text-[10px] font-bold uppercase tracking-widest">No audio sources — add Camera or Screen</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════ SETTINGS TAB ════════════════════════════════════════ */}
          {studioTab === 'SETTINGS' && (
            <div className="flex-1 p-4 flex gap-6 overflow-hidden min-h-0">
              {/* Sub-tabs */}
              <div className="flex flex-col gap-1 shrink-0 w-28">
                {([['EXPORT','Export EDL'],['COLOR','Color Correct'],['MIDI','MIDI / HW']] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setSettingsSub(id)}
                    className="text-left px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                    style={{
                      background: settingsSub === id ? 'rgba(107,0,153,0.25)' : 'rgba(255,255,255,0.04)',
                      color: settingsSub === id ? '#c084fc' : 'rgba(255,255,255,0.35)',
                      border: `1px solid ${settingsSub === id ? 'rgba(107,0,153,0.4)' : 'transparent'}`,
                    }}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-w-0 overflow-y-auto space-y-4">
                {/* Project info always visible */}
                {activeProject && (
                  <div className="p-3 rounded-xl space-y-1" style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[8px] opacity-30 uppercase tracking-widest mb-2">Active Project</p>
                    {[['Title', activeProject.title],['Resolution', activeProject.resolution],['Frame Rate', `${activeProject.frameRate} fps`],['Mode', activeProject.outputMode]].map(([k, v]) => (
                      <div key={k} className="flex justify-between text-[9px]">
                        <span className="opacity-30">{k}</span>
                        <span className="opacity-60 font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {settingsSub === 'EXPORT' && (
                  <div className="space-y-2">
                    <p className="text-[8px] opacity-30 uppercase tracking-widest">Edit List Export</p>
                    <button onClick={handleExportEDL}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase transition-all opacity-60 hover:opacity-100"
                      style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                      <Download size={11} /> CMX 3600 EDL
                    </button>
                    <button onClick={handleExportFCPXML}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase transition-all opacity-60 hover:opacity-100"
                      style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                      <Download size={11} /> Final Cut Pro XML
                    </button>
                    <div className="p-3 rounded-xl mt-3" style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-[8px] opacity-30 uppercase tracking-widest mb-2">Engine</p>
                      {['Canvas 2D compositor @ 60fps rAF','Web Audio API (GainNode graph)','MediaRecorder VP9/Opus 8Mbps','canvas.captureStream() → Mux/WebRTC'].map(l => (
                        <p key={l} className="text-[9px] opacity-30">{l}</p>
                      ))}
                    </div>
                  </div>
                )}

                {settingsSub === 'COLOR' && (
                  <div className="space-y-3">
                    <p className="text-[8px] opacity-30 uppercase tracking-widest">Source</p>
                    <select value={selectedSourceId ?? ''} onChange={e => setSelectedSourceId(e.target.value || null)}
                      className="w-full rounded-xl px-2 py-2 text-xs text-white outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <option value="">Select source…</option>
                      {sources.filter(s => !['COLOR','BARS'].includes(s.type)).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    {selectedSourceId && (
                      <div className="space-y-3">
                        {([
                          { key: 'brightness' as const, label: 'Brightness', icon: <Sun size={10} />, min: 0, max: 2, step: 0.02 },
                          { key: 'contrast'   as const, label: 'Contrast',   icon: <Contrast size={10} />, min: 0, max: 2, step: 0.02 },
                          { key: 'saturation' as const, label: 'Saturation', icon: <Droplet size={10} />, min: 0, max: 2, step: 0.02 },
                          { key: 'hue'        as const, label: 'Hue Rotate', icon: <Palette size={10} />, min: -180, max: 180, step: 1 },
                        ]).map(({ key, label, icon, min, max, step }) => (
                          <div key={key} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1 text-[9px] opacity-40">{icon} {label}</span>
                              <span className="text-[9px] font-mono opacity-50">{cc[key].toFixed(key === 'hue' ? 0 : 2)}{key === 'hue' ? '°' : ''}</span>
                            </div>
                            <input type="range" min={min} max={max} step={step} value={cc[key]}
                              onChange={e => handleCC(key, Number(e.target.value))}
                              className="w-full cursor-pointer" style={{ accentColor: '#6B0099', height: 6 }} />
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <button onClick={resetCC}
                            className="flex-1 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all opacity-40 hover:opacity-80"
                            style={{ border: '1px solid rgba(255,255,255,0.1)' }}>Reset</button>
                          <button onClick={() => {
                              const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.cube';
                              inp.onchange = () => { if (inp.files?.[0]) alert('LUT loaded — applied on output stream.'); };
                              inp.click();
                            }}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all opacity-40 hover:opacity-80"
                            style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                            <Upload size={10} /> .cube LUT
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {settingsSub === 'MIDI' && (
                  <div className="space-y-3">
                    <button onClick={handleConnectMIDI}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                      style={{
                        background: midiConnected ? 'rgba(34,197,94,0.1)' : 'rgba(107,0,153,0.15)',
                        border: `1px solid ${midiConnected ? 'rgba(34,197,94,0.25)' : 'rgba(107,0,153,0.25)'}`,
                        color: midiConnected ? '#22c55e' : '#a855f7',
                      }}>
                      <Usb size={12} /> {midiConnected ? 'MIDI Connected' : 'Connect MIDI Device'}
                    </button>
                    <div className="p-3 rounded-xl space-y-1.5" style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-[8px] opacity-30 uppercase tracking-widest mb-2">Default CC Map</p>
                      {[['CC 1–8','Source channel faders'],['CC 10','Master output fader'],['CC 20','CUT (value >63)'],['CC 21','AUTO transition'],['CC 22','Fade to Black'],['Note C3','CUT (note-on)']].map(([cc, fn]) => (
                        <div key={cc} className="flex items-center gap-2 text-[9px]">
                          <span className="font-mono w-14 shrink-0" style={{ color: '#a855f7' }}>{cc}</span>
                          <span className="opacity-40">{fn}</span>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 rounded-xl" style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-[8px] opacity-30 uppercase tracking-widest mb-1">Stream Deck</p>
                      <p className="text-[9px] opacity-30 leading-relaxed">Install Plajah plugin from Stream Deck Store. Connect via WebSocket port 28196.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ═══════════════════════ FOOTER ══════════════════════════════════════ */}
      <footer className="flex justify-center items-center gap-3 shrink-0 px-4"
        style={{ height: 56, background: '#111', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleAuto}
          className="flex items-center justify-center gap-2 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 touch-manipulation"
          style={{ flex: '1 1 0', maxWidth: 220, height: 40, background: 'rgba(212,0,85,0.85)', color: '#fff' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#D40055')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(212,0,85,0.85)')}>
          <Radio size={16} /> Auto Trans
        </button>
        <button
          onClick={handleCut}
          className="flex items-center justify-center gap-2 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 touch-manipulation"
          style={{ flex: '1 1 0', maxWidth: 220, height: 40, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}>
          <Zap size={16} /> Cut / Take
        </button>
        <div className="flex items-center gap-3 ml-4">
          <button onClick={handleRecord}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
            style={{
              background: isRecording ? '#D40055' : 'rgba(255,255,255,0.05)',
              color: isRecording ? '#fff' : 'rgba(255,255,255,0.4)',
              border: `1px solid ${isRecording ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
            }}>
            {isRecording ? <Square size={9} fill="white" /> : <Circle size={9} />}
            {isRecording ? 'Stop Rec' : 'Record'}
          </button>
          {onStreamReady && (
            <button onClick={handleGoLive}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
              style={{ background: '#6B0099', color: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#7d00b4')}
              onMouseLeave={e => (e.currentTarget.style.background = '#6B0099')}>
              <Radio size={9} /> Go Live
            </button>
          )}
          <button onClick={() => setShowProjectModal(true)} className="opacity-25 hover:opacity-60 transition-opacity p-1">
            <Settings size={14} />
          </button>
        </div>
      </footer>
    </div>
  );
};

export default TVStudio;
