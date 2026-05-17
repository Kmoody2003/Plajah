import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Image as ImageIcon, Film, SlidersHorizontal, Globe, Upload, Trash2,
  Check, Loader2, Plus, Play, X, ChevronDown, ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LandingBgAsset, LandingBgConfig, LandingBgMode } from '../types';
import { fetchLandingBgConfig, saveLandingBgConfig, uploadLandingBgAsset } from '../services/backendService';

const DEFAULT_CONFIG: LandingBgConfig = {
  mode: 'EARTH',
  slideshowIntervalMs: 5000,
  overlayOpacity: 40,
  assets: [],
};

const MODE_OPTIONS: { id: LandingBgMode; label: string; desc: string; icon: React.ComponentType<any> }[] = [
  { id: 'EARTH',     label: 'Earth Globe',  desc: 'Animated 3-D Earth (default)',           icon: Globe },
  { id: 'PHOTO',     label: 'Single Photo',  desc: 'One photo fills the background',         icon: ImageIcon },
  { id: 'VIDEO',     label: 'Single Video',  desc: 'Looping muted video background',         icon: Film },
  { id: 'SLIDESHOW', label: 'Slideshow',     desc: 'Auto-rotate selected photos and videos', icon: SlidersHorizontal },
];

interface UploadItem { file: File; progress: number; done: boolean; error?: string }

const AdminLandingBgManager: React.FC = () => {
  const [config, setConfig] = useState<LandingBgConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchLandingBgConfig().then(c => { if (c) setConfig(c); });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveLandingBgConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const processFiles = useCallback(async (files: File[]) => {
    const validFiles = files.filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/')
    );
    if (!validFiles.length) return;

    const newItems: UploadItem[] = validFiles.map(f => ({ file: f, progress: 0, done: false }));
    setUploads(prev => [...prev, ...newItems]);

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      try {
        const { url } = await uploadLandingBgAsset(file, pct => {
          setUploads(prev => prev.map((u, idx) =>
            idx === uploads.length + i ? { ...u, progress: pct } : u
          ));
        });
        const asset: LandingBgAsset = {
          id: `${Date.now()}_${i}`,
          type: file.type.startsWith('video/') ? 'video' : 'photo',
          url,
          name: file.name,
          size: file.size,
          uploadedAt: Date.now(),
          isSelected: false,
        };
        setConfig(prev => ({ ...prev, assets: [...prev.assets, asset] }));
        setUploads(prev => prev.map((u, idx) =>
          idx === uploads.length + i ? { ...u, progress: 100, done: true } : u
        ));
      } catch {
        setUploads(prev => prev.map((u, idx) =>
          idx === uploads.length + i ? { ...u, error: 'Upload failed', done: true } : u
        ));
      }
    }
    setTimeout(() => setUploads([]), 3000);
  }, [uploads.length]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const toggleSelected = (id: string) => {
    setConfig(prev => ({
      ...prev,
      assets: prev.assets.map(a => a.id === id ? { ...a, isSelected: !a.isSelected } : a),
    }));
  };

  const removeAsset = (id: string) => {
    setConfig(prev => ({ ...prev, assets: prev.assets.filter(a => a.id !== id) }));
  };

  const selectedAssets = config.assets.filter(a => a.isSelected);
  const singlePhoto = config.assets.find(a => a.isSelected && a.type === 'photo');
  const singleVideo = config.assets.find(a => a.isSelected && a.type === 'video');

  const modeWarning =
    config.mode === 'PHOTO' && !singlePhoto ? 'Select at least one photo.' :
    config.mode === 'VIDEO' && !singleVideo ? 'Select at least one video.' :
    config.mode === 'SLIDESHOW' && selectedAssets.length < 2 ? 'Select 2 or more assets for the slideshow.' :
    null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest">Landing Background</h2>
          <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">
            Control what visitors see behind the sign-in screen
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !!modeWarning}
          className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-40 hover:bg-small-orange hover:text-white transition-all"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Publish Changes'}
        </button>
      </div>

      {/* Mode picker */}
      <section>
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">Background Mode</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {MODE_OPTIONS.map(opt => {
            const active = config.mode === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setConfig(prev => ({ ...prev, mode: opt.id }))}
                className={`relative p-5 rounded-2xl border text-left transition-all ${
                  active ? 'border-white bg-white/10 ring-2 ring-white/20' : 'border-white/10 hover:border-white/30 bg-white/[0.02]'
                }`}
              >
                {active && <div className="absolute top-3 right-3 w-5 h-5 bg-white rounded-full flex items-center justify-center"><Check size={10} className="text-black" /></div>}
                <opt.icon size={20} className={active ? 'text-white mb-3' : 'text-white/40 mb-3'} />
                <p className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-white/60'}`}>{opt.label}</p>
                <p className="text-[8px] text-white/30 mt-1 leading-relaxed">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Advanced settings */}
      {config.mode !== 'EARTH' && (
        <section className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-colors"
          >
            <span>Display Settings</span>
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showAdvanced && (
            <div className="px-5 pb-5 space-y-5">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">
                  Overlay Opacity — {config.overlayOpacity}%
                </label>
                <input
                  type="range" min={0} max={90} value={config.overlayOpacity}
                  onChange={e => setConfig(p => ({ ...p, overlayOpacity: +e.target.value }))}
                  className="w-full accent-small-orange"
                />
                <p className="text-[8px] text-white/20 mt-1">Dark gradient overlay on top of the background (0 = none, 90 = near-black)</p>
              </div>
              {config.mode === 'SLIDESHOW' && (
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">
                    Slide Duration — {config.slideshowIntervalMs / 1000}s
                  </label>
                  <input
                    type="range" min={2000} max={30000} step={1000} value={config.slideshowIntervalMs}
                    onChange={e => setConfig(p => ({ ...p, slideshowIntervalMs: +e.target.value }))}
                    className="w-full accent-small-orange"
                  />
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Mode warning */}
      {modeWarning && config.mode !== 'EARTH' && (
        <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-amber-400">
          {modeWarning}
        </div>
      )}

      {/* Asset pool */}
      {config.mode !== 'EARTH' && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Asset Pool</p>
              <p className="text-[8px] text-white/20 mt-0.5">
                {config.mode === 'SLIDESHOW'
                  ? 'Check assets to include them in the slideshow rotation'
                  : 'Check one asset to use it as the background'}
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:border-white/30 transition-all"
            >
              <Plus size={12} /> Add Assets
            </button>
          </div>

          {/* Bulk drag-drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-8 mb-5 text-center cursor-pointer transition-all ${
              dragging ? 'border-white/60 bg-white/10' : 'border-white/10 hover:border-white/30 hover:bg-white/[0.02]'
            }`}
          >
            <Upload size={24} className="mx-auto mb-2 text-white/30" />
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
              Drag &amp; drop photos or videos here, or click to browse
            </p>
            <p className="text-[8px] text-white/20 mt-1">Supports JPG, PNG, WebP, MP4, WebM — bulk upload supported</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) processFiles(Array.from(e.target.files)); e.target.value = ''; }}
          />

          {/* Upload progress */}
          {uploads.length > 0 && (
            <div className="mb-4 space-y-2">
              {uploads.map((u, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                  {u.done && !u.error ? <Check size={12} className="text-green-400 shrink-0" /> :
                   u.error ? <X size={12} className="text-red-400 shrink-0" /> :
                   <Loader2 size={12} className="animate-spin text-white/40 shrink-0" />}
                  <p className="text-[9px] font-bold text-white/60 truncate flex-1">{u.file.name}</p>
                  {!u.done && (
                    <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden shrink-0">
                      <div className="h-full bg-small-orange rounded-full transition-all" style={{ width: `${u.progress}%` }} />
                    </div>
                  )}
                  {u.error && <p className="text-[8px] text-red-400 shrink-0">{u.error}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Asset grid */}
          {config.assets.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {config.assets.map(asset => (
                <div
                  key={asset.id}
                  className={`relative rounded-2xl overflow-hidden aspect-video group cursor-pointer border-2 transition-all ${
                    asset.isSelected ? 'border-white shadow-lg shadow-white/10' : 'border-transparent hover:border-white/30'
                  }`}
                  onClick={() => toggleSelected(asset.id)}
                >
                  {asset.type === 'video' ? (
                    <div className="w-full h-full bg-black flex items-center justify-center">
                      <video src={asset.url} className="w-full h-full object-cover opacity-60" muted playsInline />
                      <Play size={20} className="absolute text-white/60" fill="currentColor" />
                    </div>
                  ) : (
                    <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" loading="lazy" />
                  )}

                  {/* Type badge */}
                  <div className="absolute top-2 left-2">
                    <span className={`px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest ${
                      asset.type === 'video' ? 'bg-blue-500/80' : 'bg-small-orange/80'
                    }`}>
                      {asset.type === 'video' ? <Film size={8} /> : <ImageIcon size={8} />}
                    </span>
                  </div>

                  {/* Selected checkmark */}
                  {asset.isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg">
                      <Check size={12} className="text-black" />
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />

                  {/* Delete */}
                  <button
                    onClick={e => { e.stopPropagation(); removeAsset(asset.id); }}
                    className="absolute bottom-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-lg text-white/40 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>

                  {/* Name tooltip */}
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[8px] font-bold text-white/70 truncate">{asset.name}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center bg-white/[0.02] rounded-2xl border border-dashed border-white/5">
              <ImageIcon size={32} className="mx-auto mb-3 text-white/10" />
              <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">No assets yet — upload photos or videos above</p>
            </div>
          )}

          {/* Selection summary */}
          {selectedAssets.length > 0 && (
            <div className="mt-4 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/60">
              {selectedAssets.length} asset{selectedAssets.length !== 1 ? 's' : ''} selected
              {config.mode === 'SLIDESHOW' && ` — will rotate every ${config.slideshowIntervalMs / 1000}s`}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default AdminLandingBgManager;
