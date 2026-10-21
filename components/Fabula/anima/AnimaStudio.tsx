/**
 * components/Fabula/anima/AnimaStudio.tsx — Anima, Fabula's motion studio.
 *
 *   ┌ top bar: project · undo/redo · cloud + version history · back to Fabula ┐
 *   │ Layers │            Stage (tools float on top)            │ Inspector │
 *   └ Timeline: transport, timing, auto-key, dope sheet ───────────────────────┘
 *
 * The project is a document (services/anima/document.ts) with undo/redo; it autosaves on this
 * device and to the cloud with version history (services/anima/projectStore.ts). Playhead,
 * selection and tool are UI state, so playing or selecting never re-saves the project.
 */

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Download, FilePlus2, FolderOpen, Hand, MousePointer2, PenTool, Redo2, Sparkles, Trash2, Undo2, Upload } from 'lucide-react';
import type { AnimaProject, DrawingCel } from '../../../services/anima/types';
import { animaHistoryReducer, copyKeys, initHistory, type AnimaAction, type ClipboardKey, type KeyRef } from '../../../services/anima/document';
import { ANIMA_TEMPLATES, blankAnimaProject, newAnimaId } from '../../../services/anima/templates';
import {
  ANIMA_CLOUD_KIND,
  deleteAnimaProject,
  getLastAnimaProjectId,
  listAnimaProjects,
  loadAnimaProject,
  parseAnimaProject,
  saveAnimaProject,
  setLastAnimaProjectId,
  stashPendingAnimaProject,
  storeAnimaMedia,
  takePendingAnimaProject,
  type AnimaProjectSummary,
} from '../../../services/anima/projectStore';
import type { MotionBrushKind } from '../../../services/anima/worldClassEngine';
import { CreativeStorageMeter, CreativeVersionHistory, useCreativeSyncState } from '../../creative/CreativeCloudPanels';
import { createFrameStore } from './frameStore';
import { AnimaStage, type AnimaTool, type CameraMode } from './AnimaStage';
import { AnimaLayersPanel } from './AnimaLayersPanel';
import { AnimaInspector } from './AnimaInspector';
import { AnimaTimeline } from './AnimaTimeline';
import { btn, iconBtn, lbl, panelBg } from './ui';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

const TOOLS: { id: AnimaTool; label: string; key: string; icon: React.ReactNode }[] = [
  { id: 'select', label: 'Move', key: 'V', icon: <MousePointer2 size={15} /> },
  { id: 'draw', label: 'Draw', key: 'B', icon: <PenTool size={15} /> },
  { id: 'puppet', label: 'Puppet', key: 'P', icon: <Hand size={15} /> },
  { id: 'brush', label: 'FX brush', key: 'F', icon: <Sparkles size={15} /> },
];

export const AnimaStudio: React.FC<{ onBackToEdit?: () => void }> = ({ onBackToEdit }) => {
  const [history, dispatchHistory] = useReducer(animaHistoryReducer, undefined, () => initHistory(blankAnimaProject()));
  const project = history.present;
  const framesRef = useRef(createFrameStore(1));
  const frames = framesRef.current;

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [tool, setTool] = useState<AnimaTool>('select');
  const [brushKind, setBrushKind] = useState<MotionBrushKind>('sparkle_stardust');
  const [ink, setInk] = useState({ color: '#D0BCFF', width: 5 });
  const [autoKey, setAutoKey] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('camera');
  /** Selected keys (timeline + graph), as `layerId|path|keyId`. */
  const [keySel, setKeySel] = useState<string[]>([]);
  const keySelRef = useRef<string[]>([]);
  keySelRef.current = keySel;
  const clipboardRef = useRef<ClipboardKey[]>([]);
  const selectedLayerRef = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [menu, setMenu] = useState<'project' | 'history' | null>(null);
  const [startScreen, setStartScreen] = useState(false);
  const [recent, setRecent] = useState<AnimaProjectSummary[]>([]);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dirtyRef = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const syncState = useCreativeSyncState(ANIMA_CLOUD_KIND, project.id);

  const say = useCallback((msg: string) => setNotice(msg), []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3800);
    return () => window.clearTimeout(t);
  }, [notice]);

  /** Every document edit goes through here: marks the project dirty for autosave. */
  const dispatch = useCallback((action: AnimaAction, coalesceKey?: string) => {
    dirtyRef.current = true;
    dispatchHistory({ type: 'do', action, coalesceKey });
  }, []);

  const open = useCallback((p: AnimaProject, dirty = false) => {
    dispatchHistory({ type: 'reset', project: p });
    dirtyRef.current = dirty;
    frames.set(1);
    setPlaying(false);
    setSelectedLayerId(p.layers[0]?.id ?? null);
    setSaveState(dirty ? 'dirty' : 'saved');
    setLastAnimaProjectId(p.id);
    setStartScreen(false);
    setMenu(null);
  }, [frames]);

  const refreshRecent = useCallback(async () => setRecent(await listAnimaProjects().catch(() => [])), []);

  // Boot: a project parked at the last page close, else the last project, else the start screen.
  useEffect(() => {
    let alive = true;
    (async () => {
      const pending = takePendingAnimaProject();
      const lastId = pending?.id ?? getLastAnimaProjectId();
      const saved = lastId ? await loadAnimaProject(lastId).catch(() => null) : null;
      if (!alive) return;
      if (pending && (!saved || (pending.updatedAt ?? 0) >= (saved.updatedAt ?? 0))) open(pending, true);
      else if (saved) open(saved);
      else {
        setSelectedLayerId(projectRef.current.layers[0]?.id ?? null);
        setStartScreen(true);
      }
      void refreshRecent();
    })();
    return () => {
      alive = false;
    };
  }, [open, refreshRecent]);

  // Autosave (debounced) — local first, then the cloud copy with version history.
  useEffect(() => {
    if (!dirtyRef.current) return;
    setSaveState('dirty');
    const t = window.setTimeout(() => {
      dirtyRef.current = false;
      setSaveState('saving');
      saveAnimaProject(project)
        .then(() => setSaveState('saved'))
        .catch(() => {
          dirtyRef.current = true;
          setSaveState('error');
        });
    }, 900);
    return () => window.clearTimeout(t);
  }, [project]);

  // Page close inside the debounce window: park the edit synchronously.
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current) stashPendingAnimaProject(projectRef.current);
    };
    const onVis = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
      if (dirtyRef.current) void saveAnimaProject(projectRef.current);
    };
  }, []);

  // Keep the selection valid as layers come and go (undo can remove the selected one).
  useEffect(() => {
    if (selectedLayerId && !project.layers.some((l) => l.id === selectedLayerId)) setSelectedLayerId(project.layers[0]?.id ?? null);
  }, [project.layers, selectedLayerId]);
  useEffect(() => {
    if (frames.get() > project.durationFrames) frames.set(project.durationFrames);
  }, [project.durationFrames, frames]);

  // Stop-motion camera.
  const toggleCamera = async () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      setCameraStream(stream);
    } catch {
      say("Couldn't open the camera. Check the browser's camera permission.");
    }
  };
  useEffect(() => {
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = cameraStream;
  }, [cameraStream]);
  useEffect(() => () => cameraStream?.getTracks().forEach((t) => t.stop()), [cameraStream]);

  const capture = async () => {
    const v = cameraVideoRef.current;
    const layer = project.layers.find((l) => l.id === selectedLayerId);
    if (!v || v.readyState < 2) return;
    if (!layer || (layer.type !== 'cel' && layer.type !== 'stop_motion')) {
      say('Captures go on a drawing layer. Select one first.');
      return;
    }
    const off = document.createElement('canvas');
    off.width = project.width;
    off.height = project.height;
    off.getContext('2d')?.drawImage(v, 0, 0, off.width, off.height);
    const blob: Blob | null = await new Promise((r) => off.toBlob(r, 'image/webp', 0.85));
    if (!blob) return;
    const frame = frames.get();
    const hold = layer.celTrack?.stepRate ?? 2;
    const id = newAnimaId('capture');
    let drawing: DrawingCel = { id, name: `Capture ${frame}`, strokes: [], width: project.width, height: project.height, createdAt: Date.now() };
    try {
      const stored = await storeAnimaMedia(project.id, blob, `${id}.webp`);
      drawing = stored.sessionOnly ? { ...drawing, rasterDataUrl: off.toDataURL('image/webp', 0.85) } : { ...drawing, rasterUrl: stored.url };
    } catch {
      drawing = { ...drawing, rasterDataUrl: off.toDataURL('image/webp', 0.85) };
    }
    dispatch({ type: 'exposeDrawing', layerId: layer.id, frame, hold, drawing });
    frames.set(Math.min(project.durationFrames, frame + hold));
  };

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const p = projectRef.current;
      const refs = (): KeyRef[] =>
        keySelRef.current.map((id) => {
          const [layerId, path, keyId] = id.split('|');
          return { layerId, path, keyId };
        });
      if ((e.key === 'Delete' || e.key === 'Backspace') && keySelRef.current.length) {
        e.preventDefault();
        dispatch({ type: 'deleteKeys', refs: refs() });
        setKeySel([]);
        return;
      }
      if (mod && e.key.toLowerCase() === 'c' && keySelRef.current.length) {
        clipboardRef.current = copyKeys(p, refs());
        say(`Copied ${clipboardRef.current.length} key${clipboardRef.current.length > 1 ? 's' : ''}.`);
        return;
      }
      if (mod && e.key.toLowerCase() === 'v' && clipboardRef.current.length) {
        e.preventDefault();
        dispatch({ type: 'pasteKeys', keys: clipboardRef.current, atFrame: frames.get(), targetLayerId: selectedLayerRef.current ?? undefined });
        say(`Pasted ${clipboardRef.current.length} key${clipboardRef.current.length > 1 ? 's' : ''} at frame ${frames.get()}.`);
        return;
      }
      if (e.key === 'Escape') setKeySel([]);
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dirtyRef.current = true;
        dispatchHistory({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dirtyRef.current = true;
        dispatchHistory({ type: 'redo' });
      } else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((v) => !v);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowRight' ? 1 : -1);
        frames.set(Math.max(1, Math.min(p.durationFrames, frames.get() + step)));
      } else if (e.key === 'Home') frames.set(1);
      else if (e.key === 'End') frames.set(p.durationFrames);
      else if (!mod) {
        const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
        if (t) setTool(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frames, dispatch, say]);

  const selectedLayer = project.layers.find((l) => l.id === selectedLayerId) ?? null;
  selectedLayerRef.current = selectedLayerId;
  const hasCamera = project.layers.some((l) => l.type === 'camera' && l.visible);

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^\w-]+/g, '_') || 'anima'}.anima.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const saveLabel =
    saveState === 'saving' || saveState === 'dirty'
      ? 'Saving…'
      : saveState === 'error'
      ? 'Save failed'
      : syncState === 'syncing'
      ? 'Saving to cloud…'
      : syncState === 'synced'
      ? 'Saved to cloud'
      : syncState === 'guest'
      ? 'Saved on this device'
      : syncState === 'offline'
      ? 'Offline · saved on this device'
      : syncState === 'error'
      ? 'Saved on this device · cloud retrying'
      : 'Saved';

  return (
    <div className="flex flex-col w-full h-full text-white select-none" style={{ background: '#0b0a10', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ── Top bar ── */}
      <header className="flex items-center gap-2 px-3 h-12 shrink-0" style={{ background: panelBg, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="grid place-items-center w-8 h-8 rounded-[9px] text-[12px] font-black" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)' }}>An</div>
        <input
          key={project.id}
          defaultValue={project.name}
          aria-label="Project name"
          className="h-8 w-56 px-2 rounded-[8px] bg-transparent hover:bg-white/[0.05] focus:bg-white/[0.06] text-[14px] font-semibold text-white outline-none"
          onBlur={(e) => e.currentTarget.value.trim() && e.currentTarget.value !== project.name && dispatch({ type: 'rename', name: e.currentTarget.value.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div className="relative">
          <button className={btn} onClick={() => { setMenu(menu === 'project' ? null : 'project'); void refreshRecent(); }}>
            <FolderOpen size={14} /> Project <ChevronDown size={12} className="opacity-60" />
          </button>
          {menu === 'project' && (
            <div className="absolute left-0 top-[110%] z-50 w-80 p-2 rounded-[12px] flex flex-col gap-1 max-h-[70vh] overflow-y-auto custom-scrollbar" style={{ background: '#17131d', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
              <div className={`${lbl} px-2 pt-1`}>New</div>
              {ANIMA_TEMPLATES.map((t) => (
                <button key={t.id} className="text-left px-2 py-1.5 rounded-lg hover:bg-white/[0.06]" onClick={() => open(t.build(), true)}>
                  <div className="text-[12px] font-semibold flex items-center gap-1.5"><FilePlus2 size={12} className="text-[#00DAF3]" /> {t.name}</div>
                  <div className="text-[11px] text-white/45">{t.blurb}</div>
                </button>
              ))}
              {recent.length > 0 && <div className={`${lbl} px-2 pt-2`}>Open</div>}
              {recent.map((r) => (
                <div key={r.id} className="flex items-center gap-1">
                  <button className="flex-1 min-w-0 text-left px-2 py-1.5 rounded-lg hover:bg-white/[0.06]" style={{ background: r.id === project.id ? 'rgba(212,0,85,0.14)' : undefined }} onClick={() => void loadAnimaProject(r.id).then((p) => (p ? open(p) : say('That project could not be opened.')))}>
                    <div className="text-[12px] font-semibold truncate">{r.name}</div>
                    <div className="text-[10px] text-white/40">{r.inCloudOnly ? 'From another device' : `${r.layerCount} layers · ${r.durationFrames} frames`} · {new Date(r.updatedAt).toLocaleString()}</div>
                  </button>
                  {r.id !== project.id && (
                    <button className={iconBtn} title="Delete project" aria-label={`Delete ${r.name}`} onClick={() => window.confirm(`Delete "${r.name}" and its version history?`) && void deleteAnimaProject(r.id).then(refreshRecent)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
              <div className={`${lbl} px-2 pt-2`}>File</div>
              <div className="grid grid-cols-2 gap-1">
                <button className={btn} onClick={() => fileRef.current?.click()}><Upload size={13} /> Import</button>
                <button className={btn} onClick={exportFile}><Download size={13} /> Export file</button>
              </div>
            </div>
          )}
        </div>
        <button className={iconBtn} disabled={!history.past.length} onClick={() => { dirtyRef.current = true; dispatchHistory({ type: 'undo' }); }} aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 size={15} /></button>
        <button className={iconBtn} disabled={!history.future.length} onClick={() => { dirtyRef.current = true; dispatchHistory({ type: 'redo' }); }} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Redo2 size={15} /></button>

        <div className="relative ml-auto">
          <button
            className="h-8 px-2.5 rounded-[9px] text-[12px] font-semibold inline-flex items-center gap-1 border border-white/10 bg-white/[0.04]"
            style={{ color: saveState === 'error' ? '#fca5a5' : syncState === 'synced' ? '#6ee7b7' : 'rgba(255,255,255,0.6)' }}
            onClick={() => setMenu(menu === 'history' ? null : 'history')}
            title="Version history"
          >
            {saveLabel} <ChevronDown size={12} className="opacity-60" />
          </button>
          {menu === 'history' && (
            <div className="absolute right-0 top-[110%] z-50 w-80 p-3 rounded-[12px] flex flex-col gap-3 max-h-[70vh] overflow-y-auto custom-scrollbar" style={{ background: '#17131d', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
              <CreativeVersionHistory
                kind={ANIMA_CLOUD_KIND}
                localId={project.id}
                title={project.name}
                getCurrentJson={() => JSON.stringify(projectRef.current)}
                onRestore={(json) => {
                  const p = parseAnimaProject(json);
                  if (!p) return say('That version could not be read.');
                  dispatch({ type: 'replace', project: { ...p, id: projectRef.current.id } });
                  setMenu(null);
                  say('Version restored. Undo brings back what you had.');
                }}
              />
              <CreativeStorageMeter />
            </div>
          )}
        </div>
        {onBackToEdit && (
          <button className={btn} onClick={onBackToEdit}>
            <ArrowLeft size={14} /> Back to Fabula
          </button>
        )}
      </header>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: '232px minmax(0,1fr) 316px' }} onPointerDown={() => menu && setMenu(null)}>
        <aside className="min-h-0" style={{ background: panelBg, borderRight: '1px solid rgba(255,255,255,0.08)' }}>
          <AnimaLayersPanel layers={project.layers} selectedId={selectedLayerId} onSelect={setSelectedLayerId} dispatch={dispatch} />
        </aside>

        <main className="relative min-h-0 min-w-0 flex items-center justify-center p-6 pt-16" style={{ background: 'radial-gradient(900px 500px at 50% 30%, rgba(107,0,153,0.10), transparent 60%), #0b0a10' }}>
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 rounded-[12px] z-10" style={{ background: 'rgba(18,13,28,0.92)', border: '1px solid rgba(255,255,255,0.12)' }}>
            {TOOLS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                title={`${t.label} (${t.key})`}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[9px] text-[12px] font-semibold transition-colors"
                style={tool === t.id ? { background: 'linear-gradient(135deg,#6B0099,#D40055)', color: '#fff' } : { color: 'rgba(255,255,255,0.65)' }}
              >
                {t.icon} {t.label}
              </button>
            ))}
            {hasCamera && (
              <>
                <span className="w-px h-5 bg-white/15 mx-1" />
                <button
                  onClick={() => setCameraMode(cameraMode === 'camera' ? 'overview' : 'camera')}
                  title="Switch between what the camera sees and the whole frame"
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[9px] text-[12px] font-semibold"
                  style={{ color: '#ffd166', background: 'rgba(255,209,102,0.10)' }}
                >
                  {cameraMode === 'camera' ? 'Camera view' : 'Overview'}
                </button>
              </>
            )}
          </div>
          <AnimaStage
            project={project}
            frames={frames}
            playing={playing}
            tool={tool}
            selectedLayerId={selectedLayerId}
            brushKind={brushKind}
            ink={ink}
            cameraVideo={cameraStream ? cameraVideoRef.current : null}
            cameraMode={cameraMode}
            autoKey={autoKey}
            dispatch={dispatch}
            setPlaying={setPlaying}
            onSelectLayer={setSelectedLayerId}
            onNotice={say}
          />
          <video ref={cameraVideoRef} autoPlay muted playsInline className="hidden" />
          {notice && (
            <div role="status" className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-2 rounded-[10px] text-[12px] text-white z-20" style={{ background: 'rgba(18,13,28,0.95)', border: '1px solid rgba(255,255,255,0.14)' }}>
              {notice}
            </div>
          )}
        </main>

        <aside className="min-h-0" style={{ background: panelBg, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
          <AnimaInspector
            project={project}
            layer={selectedLayer}
            frames={frames}
            autoKey={autoKey}
            dispatch={dispatch}
            onSelectLayer={setSelectedLayerId}
            tool={tool}
            setTool={setTool}
            brushKind={brushKind}
            setBrushKind={setBrushKind}
            ink={ink}
            setInk={setInk}
            cameraOn={!!cameraStream}
            onToggleCamera={() => void toggleCamera()}
            onCapture={() => void capture()}
            onNotice={say}
          />
        </aside>
      </div>

      {/* ── Timeline ── */}
      <section className="shrink-0" style={{ height: 290, background: panelBg, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <AnimaTimeline
          project={project}
          frames={frames}
          playing={playing}
          setPlaying={setPlaying}
          selectedLayerId={selectedLayerId}
          onSelectLayer={setSelectedLayerId}
          autoKey={autoKey}
          setAutoKey={setAutoKey}
          dispatch={dispatch}
          keySel={keySel}
          setKeySel={setKeySel}
        />
      </section>

      {/* ── Start screen (no project yet) ── */}
      {startScreen && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-6" style={{ background: 'rgba(5,4,8,0.72)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-[640px] p-6 rounded-[18px] flex flex-col gap-4" style={{ background: '#15111c', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div>
              <div className="text-[20px] font-bold">Start an animation</div>
              <div className="text-[13px] text-white/55">Projects save automatically, keep a version history, and open on any device you sign in on.</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {ANIMA_TEMPLATES.map((t) => (
                <button key={t.id} className="text-left p-3 rounded-[12px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/10" onClick={() => open(t.build(), true)}>
                  <div className="text-[13px] font-bold">{t.name}</div>
                  <div className="text-[11px] text-white/50 mt-1">{t.blurb}</div>
                </button>
              ))}
            </div>
            {recent.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className={lbl}>Recent</div>
                {recent.slice(0, 6).map((r) => (
                  <button key={r.id} className="text-left px-3 py-2 rounded-[10px] hover:bg-white/[0.06] flex items-center justify-between gap-2" onClick={() => void loadAnimaProject(r.id).then((p) => (p ? open(p) : say('That project could not be opened.')))}>
                    <span className="text-[13px] font-semibold truncate">{r.name}</span>
                    <span className="text-[11px] text-white/40 shrink-0">{r.inCloudOnly ? 'From another device · ' : ''}{new Date(r.updatedAt).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className={btn} onClick={() => fileRef.current?.click()}><Upload size={13} /> Import file</button>
            </div>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        const p = parseAnimaProject(await f.text());
        if (!p) return say("That file isn't an Anima project.");
        open({ ...p, id: newAnimaId() }, true);
      }} />
    </div>
  );
};

export default AnimaStudio;
