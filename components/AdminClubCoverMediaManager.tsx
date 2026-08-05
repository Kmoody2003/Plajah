import React, { useState, useRef, useCallback } from 'react';
import { Upload, Trash2, Image as ImageIcon, Film, Loader2, X, Play, AlertCircle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  uploadClubCoverMediaFile,
  deleteClubCoverMediaFile,
  saveClubCoverSettings,
} from '../services/backendService';
import { useClubCoverMedia, useClubCoverSettings } from '../hooks/useClubCoverMedia';

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  done: boolean;
  error?: string;
}

const AdminClubCoverMediaManager: React.FC = () => {
  const items    = useClubCoverMedia();
  const settings = useClubCoverSettings();

  const [uploads, setUploads]   = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview]   = useState<(typeof items)[0] | null>(null);
  const [saving, setSaving]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Mode / order controls ───────────────────────────────────────────────────

  const setMode = async (mode: 'off' | 'single' | 'slideshow') => {
    setSaving(true);
    try {
      await saveClubCoverSettings({ mode, singleItemId: settings.singleItemId, slideshowOrder: settings.slideshowOrder });
    } finally { setSaving(false); }
  };

  const setSlideshowOrder = async (slideshowOrder: 'random' | 'sequential') => {
    setSaving(true);
    try {
      await saveClubCoverSettings({ mode: 'slideshow', singleItemId: settings.singleItemId, slideshowOrder });
    } finally { setSaving(false); }
  };

  const activateSingle = async (itemId: string) => {
    setSaving(true);
    try {
      await saveClubCoverSettings({ mode: 'single', singleItemId: itemId, slideshowOrder: settings.slideshowOrder });
    } finally { setSaving(false); }
  };

  // ── Upload ──────────────────────────────────────────────────────────────────

  const processFiles = useCallback(async (files: File[]) => {
    const valid = files.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'webm'].includes(ext);
    });
    if (!valid.length) return;

    for (const file of valid) {
      const uploadId = `${Date.now()}_${Math.random()}`;
      setUploads(prev => [...prev, { id: uploadId, file, progress: 0, done: false }]);
      try {
        await uploadClubCoverMediaFile(
          file,
          Date.now(),
          pct => setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: pct } : u)),
        );
        setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: 100, done: true } : u));
        setTimeout(() => setUploads(prev => prev.filter(u => u.id !== uploadId)), 3000);
      } catch (err: any) {
        setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, error: err?.message ?? 'Upload failed' } : u));
      }
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const handleDelete = async (item: typeof items[0]) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    // If deleting the active single item, turn mode off
    if (settings.mode === 'single' && settings.singleItemId === item.id) {
      await saveClubCoverSettings({ mode: 'off', singleItemId: null, slideshowOrder: settings.slideshowOrder });
    }
    await deleteClubCoverMediaFile(item.id);
  };

  const activeUploads = uploads.filter(u => !u.done && !u.error);
  const errorUploads  = uploads.filter(u => !!u.error);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h3 className="text-sm font-black text-white uppercase tracking-widest">Club Cover Media</h3>
        <p className="text-[9px] text-white/40 mt-0.5">
          Controls the hero background on the Clubs landing page · {items.length} asset{items.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Display mode selector */}
      <div className="space-y-3">
        <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Display Mode</p>
        <div className="flex items-center gap-2">
          {(['off', 'single', 'slideshow'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border"
              style={settings.mode === m
                ? { background: '#FF8C00', borderColor: '#FF8C00', color: '#000' }
                : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }
              }
            >
              {m === 'off' ? 'Off' : m === 'single' ? 'Single' : 'Slideshow'}
            </button>
          ))}
        </div>

        {/* Slideshow order — only when slideshow mode active */}
        <AnimatePresence>
          {settings.mode === 'slideshow' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 pt-1">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/30 shrink-0">Order:</p>
                {(['random', 'sequential'] as const).map(o => (
                  <button
                    key={o}
                    onClick={() => setSlideshowOrder(o)}
                    disabled={saving}
                    className="px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all border"
                    style={settings.slideshowOrder === o
                      ? { background: 'rgba(255,140,0,0.18)', borderColor: 'rgba(255,140,0,0.4)', color: '#FF8C00' }
                      : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' }
                    }
                  >
                    {o}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Single mode hint */}
        {settings.mode === 'single' && (
          <p className="text-[8px] text-white/30">
            {settings.singleItemId ? 'One asset is active — click another to switch.' : 'Click an asset below to activate it.'}
          </p>
        )}
      </div>

      {/* Upload zone */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Assets</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF8C00] text-black text-[8px] font-black uppercase tracking-widest hover:bg-[#FF8C00]/80 transition-colors"
          >
            <Upload size={10} /> Upload
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={e => {
            if (e.target.files) processFiles(Array.from(e.target.files));
            e.target.value = '';
          }}
        />

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 py-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
            dragging ? 'border-[#FF8C00] bg-[#FF8C00]/5' : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
          }`}
        >
          <Upload size={18} className={dragging ? 'text-[#FF8C00]' : 'text-white/20'} />
          <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Drag files or click to browse</p>
          <p className="text-[7px] text-white/15">JPG · PNG · WebP · GIF · MP4 · MOV · WebM</p>
        </div>
      </div>

      {/* Upload progress */}
      <AnimatePresence>
        {activeUploads.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            {activeUploads.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/8">
                <Loader2 size={13} className="text-[#FF8C00] animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black text-white/70 truncate">{u.file.name}</p>
                  <div className="h-1 mt-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#FF8C00] rounded-full transition-all duration-300" style={{ width: `${u.progress}%` }} />
                  </div>
                </div>
                <span className="text-[8px] text-[#FF8C00] font-black shrink-0">{u.progress}%</span>
              </div>
            ))}
          </motion.div>
        )}
        {errorUploads.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1.5">
            {errorUploads.map(u => (
              <div key={u.id} className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertCircle size={12} className="text-red-400 shrink-0" />
                <p className="text-[9px] text-red-300 flex-1 min-w-0 truncate">{u.file.name}: {u.error}</p>
                <button onClick={() => setUploads(prev => prev.filter(x => x.id !== u.id))}>
                  <X size={11} className="text-red-400/50 hover:text-red-400" />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Asset grid */}
      {items.length === 0 ? (
        <div className="py-8 text-center">
          <ImageIcon size={24} className="text-white/10 mx-auto mb-2" />
          <p className="text-[9px] text-white/20">No assets uploaded yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <AnimatePresence>
            {items.map(item => {
              const isActiveSingle = settings.mode === 'single' && settings.singleItemId === item.id;
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative group rounded-2xl overflow-hidden bg-white/[0.03] border transition-all"
                  style={{
                    aspectRatio: '16/9',
                    borderColor: isActiveSingle ? 'rgba(255,140,0,0.6)' : 'rgba(255,255,255,0.06)',
                    boxShadow: isActiveSingle ? '0 0 0 2px rgba(255,140,0,0.3)' : 'none',
                  }}
                >
                  {item.type === 'video' ? (
                    <video
                      src={item.url}
                      muted playsInline preload="metadata"
                      className="w-full h-full object-cover opacity-70"
                      onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play()}
                      onMouseLeave={e => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                    />
                  ) : (
                    <img src={item.url} alt={item.name} className="w-full h-full object-cover opacity-70" />
                  )}

                  {/* Type badge */}
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-sm">
                    {item.type === 'video' ? <Film size={9} className="text-white/70" /> : <ImageIcon size={9} className="text-white/70" />}
                  </div>

                  {/* Active indicator (single mode) */}
                  {isActiveSingle && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#FF8C00]/80 backdrop-blur-sm">
                      <Check size={8} className="text-black" />
                      <span className="text-[7px] font-black text-black">Active</span>
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => setPreview(item)}
                      className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
                    >
                      <Play size={12} className="text-white ml-0.5" />
                    </button>

                    {/* Activate — only shown in single mode */}
                    {settings.mode === 'single' && !isActiveSingle && (
                      <button
                        onClick={() => activateSingle(item.id)}
                        disabled={saving}
                        className="px-3 h-8 rounded-full bg-[#FF8C00]/80 backdrop-blur-sm flex items-center justify-center hover:bg-[#FF8C00] transition-colors text-[8px] font-black text-black uppercase tracking-wider"
                      >
                        Activate
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(item)}
                      className="w-8 h-8 rounded-full bg-red-500/30 backdrop-blur-sm flex items-center justify-center hover:bg-red-500/50 transition-colors"
                    >
                      <Trash2 size={12} className="text-red-300" />
                    </button>
                  </div>

                  {/* Filename */}
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70">
                    <p className="text-[7px] text-white/50 truncate">{item.name}</p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Preview modal */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
            onClick={() => setPreview(null)}
          >
            <button className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center" onClick={() => setPreview(null)}>
              <X size={14} className="text-white" />
            </button>
            <div onClick={e => e.stopPropagation()} className="max-w-2xl w-full">
              {preview.type === 'video'
                ? <video src={preview.url} autoPlay controls loop className="w-full rounded-2xl" />
                : <img src={preview.url} alt={preview.name} className="w-full rounded-2xl object-contain max-h-[80vh]" />
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminClubCoverMediaManager;
