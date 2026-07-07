import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Play, Pause, Plus, Download, Upload, Volume2, VolumeX, Trash2, Boxes, Radio, Music2, Globe,
  UploadCloud, Save, FolderOpen, Loader2, Clock,
} from 'lucide-react';
import { useSpatialAudioEngine } from './useSpatialAudioEngine';
import type { AudioTrack, SpatialMixProject } from './types';
import { saveSpatialMix, fetchSpatialMixes, deleteSpatialMix } from '../../services/spatialMix';
import { auth } from '../../services/firebase';

const FIELD = 5; // spatial field half-extent (metres) mapped onto the stage pad

const fmt = (t: number) => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };

// Top-down "sound stage": listener at centre, each track a draggable puck.
// Horizontal = X (left/right), vertical = Z (front/back). Elevation (Y) is a per-track slider.
const StagePad: React.FC<{ tracks: AudioTrack[]; active: string | null; onMove: (id: string, x: number, z: number) => void; onPick: (id: string) => void }> = ({ tracks, active, onMove, onPick }) => {
  const ref = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);
  const toStage = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const ny = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    return { x: (nx * 2 - 1) * FIELD, z: (ny * 2 - 1) * FIELD };
  };
  const onDown = (id: string) => (e: React.PointerEvent) => { e.preventDefault(); dragId.current = id; onPick(id); (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onMovePad = (e: React.PointerEvent) => { if (!dragId.current) return; const { x, z } = toStage(e.clientX, e.clientY); onMove(dragId.current, x, z); };
  const onUp = () => { dragId.current = null; };
  return (
    <div ref={ref} onPointerMove={onMovePad} onPointerUp={onUp} onPointerLeave={onUp}
      className="relative aspect-square w-full rounded-3xl bg-[radial-gradient(circle_at_center,rgba(34,211,170,0.10),transparent_70%)] border border-white/10 overflow-hidden select-none">
      {/* rings + axes */}
      {[0.25, 0.5, 0.75].map(r => <div key={r} className="absolute rounded-full border border-white/8" style={{ inset: `${(1 - r) * 50}%` }} />)}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/8" /><div className="absolute top-1/2 left-0 right-0 h-px bg-white/8" />
      <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[7px] font-black uppercase tracking-widest text-white/25">Front</span>
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[7px] font-black uppercase tracking-widest text-white/25">Back</span>
      {/* listener */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#FF8C00]/20 border border-[#FF8C00]/50 flex items-center justify-center"><Radio size={13} className="text-[#FF8C00]" /></div>
      {/* pucks */}
      {tracks.map(t => {
        const left = ((t.position[0] / FIELD) + 1) / 2 * 100;
        const top = ((t.position[2] / FIELD) + 1) / 2 * 100;
        const on = active === t.id;
        return (
          <div key={t.id} onPointerDown={onDown(t.id)} title={t.name}
            className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing flex flex-col items-center gap-0.5 transition-transform ${on ? 'z-10 scale-110' : ''}`}
            style={{ left: `${left}%`, top: `${top}%` }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center shadow-lg" style={{ background: on ? '#22D3AA' : 'rgba(34,211,170,0.5)', boxShadow: on ? '0 0 14px rgba(34,211,170,0.6)' : 'none' }}>
              <Music2 size={11} className="text-black" />
            </div>
            <span className="text-[7px] font-black uppercase tracking-widest text-white/60 max-w-[60px] truncate">{t.name}</span>
          </div>
        );
      })}
    </div>
  );
};

const Knob: React.FC<{ label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }> = ({ label, value, min, max, step = 0.1, onChange, suffix }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between"><span className="text-[7px] font-black uppercase tracking-widest text-white/35">{label}</span><span className="text-[8px] font-black text-white/60 tabular-nums">{value.toFixed(step < 1 ? 1 : 0)}{suffix || ''}</span></div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full accent-[#22D3AA] h-1" />
  </div>
);

const SpatialMixer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const eng = useSpatialAudioEngine();
  const [active, setActive] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mixName, setMixName] = useState('Spatial Mix');
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<null | 'saving' | 'publishing' | 'loading'>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects] = useState<SpatialMixProject[]>([]);

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600); };

  useEffect(() => { if (toast === null) return; }, [toast]);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) await eng.addTrack(f);
  };

  // Render the binaural WAV master, seed an Eclipsa-flagged release, and open the Album
  // Creator to publish it to Chora (the existing isEclipsa upload path).
  const publishToChora = async () => {
    if (eng.tracks.length === 0) { flash('Add at least one stem first'); return; }
    if (!auth.currentUser) { flash('Sign in to publish'); return; }
    setBusy('publishing');
    try {
      const blob = await eng.renderMixToBlob();
      if (!blob) { flash('Nothing to render'); setBusy(null); return; }
      const safe = (mixName || 'Spatial Mix').replace(/[^a-zA-Z0-9._ -]/g, '').trim() || 'Spatial Mix';
      const file = new File([blob], `${safe}.wav`, { type: 'audio/wav' });
      const iamf = eng.buildIAMFProject();
      const artist = auth.currentUser.displayName || '';
      const seed = {
        id: `album_${Math.random().toString(36).slice(2, 11)}`,
        title: mixName || 'Spatial Mix',
        artist,
        type: 'MUSIC',
        subType: 'SINGLE',
        genre: 'Spatial Audio',
        coverImage: '',
        description: 'Immersive spatial audio mix authored in the Plajah Spatial Mixer (Eclipsa / IAMF).',
        createdAt: Date.now(),
        tracks: [{
          id: `t_${Math.random().toString(36).slice(2, 9)}`,
          title: mixName || 'Spatial Mix',
          artist,
          file,
          url: URL.createObjectURL(blob),
          price: 0,
          isPaywalled: false,
          genre: 'Spatial Audio',
          mediaKind: 'AUDIO',
          isEclipsa: true,
          eclipsaProjectJson: JSON.stringify(iamf),
        }],
      };
      window.dispatchEvent(new CustomEvent('OPEN_ALBUM_CREATOR', { detail: { album: seed } }));
      flash('Opening publisher — finish in the Album Creator');
    } catch {
      flash('Render failed');
    } finally {
      setBusy(null);
    }
  };

  const saveProject = async () => {
    if (eng.tracks.length === 0) { flash('Add stems before saving'); return; }
    if (!auth.currentUser) { flash('Sign in to save'); return; }
    setBusy('saving');
    try {
      const saved = await saveSpatialMix(
        { id: projectId, name: mixName, masterVolume: eng.masterVolume, iamf: eng.buildIAMFProject() },
        eng.getTracks(),
        eng.serializeTracks(),
      );
      if (saved) { setProjectId(saved.id); flash('Mix saved to your projects'); }
      else flash('Save failed');
    } catch {
      flash('Save failed');
    } finally {
      setBusy(null);
    }
  };

  const openProjects = async () => {
    setShowProjects(true);
    setProjects(await fetchSpatialMixes());
  };

  const loadProject = async (p: SpatialMixProject) => {
    setBusy('loading');
    setShowProjects(false);
    try {
      eng.clearTracks();
      let ok = 0;
      for (const t of p.tracks) { if (await eng.addTrackFromSource(t)) ok++; }
      eng.setMasterVolume(p.masterVolume ?? 0.8);
      setMixName(p.name);
      setProjectId(p.id);
      flash(ok === p.tracks.length ? `Loaded "${p.name}"` : `Loaded ${ok}/${p.tracks.length} stems`);
    } catch {
      flash('Load failed');
    } finally {
      setBusy(null);
    }
  };

  const removeProject = async (id: string) => {
    await deleteSpatialMix(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (projectId === id) setProjectId(undefined);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[300] bg-[#050507] flex flex-col" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/8 shrink-0 flex-wrap">
        <Boxes size={18} className="text-[#22D3AA] shrink-0" />
        <div className="shrink-0">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white leading-none">Spatial Mixer</p>
          <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mt-1">Eclipsa · IAMF immersive audio</p>
        </div>
        <input value={mixName} onChange={e => setMixName(e.target.value)} placeholder="Mix name"
          className="ml-2 min-w-[120px] max-w-[220px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-black text-white placeholder:text-white/25 focus:outline-none focus:border-[#22D3AA]/40" />
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white"><Plus size={12} /> Add stem</button>
          <button onClick={saveProject} disabled={busy !== null} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white disabled:opacity-40">{busy === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save</button>
          <button onClick={openProjects} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white"><FolderOpen size={12} /> Open</button>
          <span className="w-px h-5 bg-white/10" />
          <button onClick={eng.exportMix} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white"><Download size={12} /> WAV</button>
          <button onClick={eng.exportIAMF} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white"><Globe size={12} /> IAMF</button>
          <button onClick={publishToChora} disabled={busy !== null} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#22D3AA] border border-[#22D3AA] text-[9px] font-black uppercase tracking-widest text-black hover:bg-[#22D3AA]/90 disabled:opacity-50">{busy === 'publishing' ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />} Publish to Chora</button>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white"><X size={15} /></button>
        </div>
        <input ref={fileRef} type="file" accept="audio/*" multiple className="hidden" onChange={e => onFiles(e.target.files)} />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px] overflow-hidden">
        {/* Stage */}
        <div className="p-6 overflow-y-auto flex flex-col gap-5">
          <div className="max-w-[520px] mx-auto w-full">
            <StagePad tracks={eng.tracks} active={active}
              onMove={(id, x, z) => { const t = eng.tracks.find(v => v.id === id); if (t) eng.updateTrackPosition(id, [x, t.position[1], z]); }}
              onPick={setActive} />
            {eng.tracks.length === 0 && <p className="text-center text-[10px] font-black uppercase tracking-widest text-white/25 mt-4">Add stems to place them in 3D space</p>}
          </div>

          {/* Transport */}
          <div className="flex items-center gap-4 justify-center">
            <button onClick={() => eng.togglePlayback()} className="w-12 h-12 rounded-full bg-[#22D3AA] text-black flex items-center justify-center">{eng.isPlaying ? <Pause size={20} fill="black" /> : <Play size={20} fill="black" className="ml-0.5" />}</button>
            <span className="text-sm font-black text-white/60 tabular-nums">{fmt(eng.currentTime)}</span>
            <div className="flex items-center gap-2 ml-6">
              <Volume2 size={14} className="text-white/40" />
              <input type="range" min={0} max={1} step={0.01} value={eng.masterVolume} onChange={e => eng.setMasterVolume(parseFloat(e.target.value))} className="w-28 accent-[#FF8C00] h-1" />
            </div>
          </div>
        </div>

        {/* Track inspector */}
        <div className="border-t lg:border-t-0 lg:border-l border-white/8 overflow-y-auto p-4 space-y-2 bg-white/[0.015]">
          {eng.tracks.length === 0 ? (
            <div className="py-16 text-center"><Music2 size={30} className="mx-auto text-white/12 mb-3" /><p className="text-[10px] font-black uppercase tracking-widest text-white/25">No tracks</p></div>
          ) : eng.tracks.map(t => {
            const on = active === t.id;
            return (
              <div key={t.id} className={`rounded-2xl border p-3 transition-all ${on ? 'border-[#22D3AA]/40 bg-[#22D3AA]/[0.04]' : 'border-white/8 bg-white/[0.02]'}`} onClick={() => setActive(t.id)}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: on ? '#22D3AA' : 'rgba(255,255,255,0.2)' }} />
                  <p className="text-xs font-black text-white truncate flex-1">{t.name}</p>
                  <button onClick={e => { e.stopPropagation(); eng.toggleMute(t.id); }} className={t.muted ? 'text-rose-400' : 'text-white/40 hover:text-white'}>{t.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
                  <button onClick={e => { e.stopPropagation(); eng.removeTrack(t.id); }} className="text-white/25 hover:text-rose-400"><Trash2 size={13} /></button>
                </div>
                {on && (
                  <div className="mt-3 space-y-3">
                    <Knob label="Volume" value={t.volume} min={0} max={1} step={0.01} onChange={v => eng.updateTrackVolume(t.id, v)} />
                    <div className="grid grid-cols-3 gap-2">
                      <Knob label="Low" value={t.eq?.low.gain.value ?? 0} min={-24} max={24} step={1} onChange={v => eng.updateTrackEQ(t.id, 'low', v)} suffix="dB" />
                      <Knob label="Mid" value={t.eq?.mid.gain.value ?? 0} min={-24} max={24} step={1} onChange={v => eng.updateTrackEQ(t.id, 'mid', v)} suffix="dB" />
                      <Knob label="High" value={t.eq?.high.gain.value ?? 0} min={-24} max={24} step={1} onChange={v => eng.updateTrackEQ(t.id, 'high', v)} suffix="dB" />
                    </div>
                    <Knob label="Elevation (Y)" value={t.position[1]} min={-FIELD} max={FIELD} step={0.1} onChange={v => eng.updateTrackPosition(t.id, [t.position[0], v, t.position[2]])} />
                    {/* IAMF group */}
                    <div className="flex items-center gap-2">
                      <span className="text-[7px] font-black uppercase tracking-widest text-white/35">IAMF</span>
                      {(['object', 'scene'] as const).map(g => (
                        <button key={g} onClick={() => eng.updateIAMFMetadata(t.id, { groupType: g })}
                          className={`px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${t.iamf?.groupType === g ? 'bg-[#22D3AA] text-black' : 'bg-white/8 text-white/40'}`}>{g}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <label className="flex items-center justify-center gap-2 py-3 mt-2 rounded-2xl border border-dashed border-white/12 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:border-white/25 cursor-pointer">
            <Upload size={13} /> Drop / add audio stems
            <input type="file" accept="audio/*" multiple className="hidden" onChange={e => onFiles(e.target.files)} />
          </label>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[310] px-4 py-2.5 rounded-full bg-[#22D3AA] text-black text-[10px] font-black uppercase tracking-widest shadow-2xl">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Saved projects */}
      <AnimatePresence>
        {showProjects && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[320] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setShowProjects(false)}>
            <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg max-h-[70vh] flex flex-col rounded-3xl bg-[#0b0b0f] border border-white/10 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-white/8">
                <FolderOpen size={16} className="text-[#22D3AA]" />
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white">My Spatial Mixes</p>
                <button onClick={() => setShowProjects(false)} className="ml-auto text-white/40 hover:text-white"><X size={16} /></button>
              </div>
              <div className="overflow-y-auto p-3 space-y-2">
                {projects.length === 0 ? (
                  <div className="py-14 text-center"><Boxes size={28} className="mx-auto text-white/12 mb-3" /><p className="text-[10px] font-black uppercase tracking-widest text-white/25">No saved mixes yet</p></div>
                ) : projects.map(p => (
                  <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 hover:border-[#22D3AA]/30">
                    <button onClick={() => loadProject(p)} className="flex-1 text-left">
                      <p className="text-sm font-black text-white truncate">{p.name}</p>
                      <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-white/30 mt-0.5"><Clock size={10} /> {p.tracks?.length ?? 0} stems</p>
                    </button>
                    <button onClick={() => removeProject(p.id)} className="text-white/25 hover:text-rose-400"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SpatialMixer;
