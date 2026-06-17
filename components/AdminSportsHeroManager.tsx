import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Trash2, Image as ImageIcon, Loader2, Check, X } from 'lucide-react';
import { SportsHeroAsset, SportsHeroConfig } from '../types';
import { fetchSportsHeroConfig, saveSportsHeroConfig, uploadSportsHeroAsset } from '../services/backendService';

const LEAGUE_OPTIONS = [
  { id: '', label: 'General / No League' },
  { id: 'WORLD_CUP', label: 'World Cup 2026' },
  { id: 'ALL', label: 'All Sports' },
  { id: 'NBA', label: 'NBA' },
  { id: 'NFL', label: 'NFL' },
  { id: 'MLB', label: 'MLB' },
  { id: 'NHL', label: 'NHL' },
  { id: 'FIFA', label: 'Football' },
  { id: 'MLS', label: 'MLS' },
  { id: 'F1', label: 'Formula 1' },
  { id: 'NASCAR', label: 'NASCAR' },
  { id: 'INDYCAR', label: 'IndyCar' },
  { id: 'UFC', label: 'UFC' },
  { id: 'TENNIS', label: 'Tennis' },
  { id: 'GOLF', label: 'Golf' },
];

interface UploadItem { id: string; file: File; progress: number; done: boolean; error?: string; }

const AdminSportsHeroManager: React.FC = () => {
  const [config, setConfig] = useState<SportsHeroConfig>({ assets: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSportsHeroConfig().then(cfg => {
      if (cfg && Array.isArray(cfg.assets)) {
        setConfig(cfg);
      }
    }).finally(() => setLoading(false));
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await saveSportsHeroConfig(config);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = useCallback(async (files: File[]) => {
    const validFiles = files.filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      return ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
    });
    if (!validFiles.length) return;

    for (const file of validFiles) {
      const uploadId = `${Date.now()}_${Math.random()}`;
      setUploads(prev => [...prev, { id: uploadId, file, progress: 0, done: false }]);
      try {
        const { url } = await uploadSportsHeroAsset(file, pct => {
          setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: pct } : u));
        });
        const asset: SportsHeroAsset = {
          id: `${Date.now()}_${Math.random()}`,
          type: 'photo',
          url,
          name: file.name,
          uploadedAt: Date.now(),
          isSelected: false,
        };
        setConfig(prev => ({ ...prev, assets: [...prev.assets, asset] }));
        setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: 100, done: true } : u));
      } catch (err: any) {
        setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, error: err?.message || 'Upload failed', done: true } : u));
      }
    }
    setTimeout(() => setUploads(prev => prev.filter(u => !u.done || !!u.error)), 3000);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) {
      handleFileUpload(Array.from(e.dataTransfer.files));
    }
  }, [handleFileUpload]);

  const toggleSelection = (assetId: string) => {
    setConfig(prev => ({
      ...prev,
      assets: prev.assets.map(asset => asset.id === assetId ? { ...asset, isSelected: !asset.isSelected } : asset),
    }));
  };

  const updateAsset = (assetId: string, updates: Partial<SportsHeroAsset>) => {
    setConfig(prev => ({
      ...prev,
      assets: prev.assets.map(asset => asset.id === assetId ? { ...asset, ...updates } : asset),
    }));
  };

  const removeAsset = (assetId: string) => {
    setConfig(prev => ({ ...prev, assets: prev.assets.filter(asset => asset.id !== assetId) }));
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-black uppercase tracking-widest">Sports Hero Images</h2>
        <p className="text-[10px] text-white/40 mt-1 uppercase tracking-[0.35em]">Upload and assign hero images for the sports landing carousel</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Upload New Hero Image</p>
          <p className="text-[8px] text-white/30 mt-1">Only JPG, PNG, WebP are accepted. Drag & drop or browse files.</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#FF8C00] text-black text-[9px] font-black uppercase tracking-widest hover:bg-[#ff9e32] transition-all"
        >
          <Upload size={14} /> Upload
        </button>
      </div>

      <input
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        className="hidden"
        onChange={e => {
          if (e.target.files) handleFileUpload(Array.from(e.target.files));
          e.target.value = '';
        }}
      />

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-3xl border-2 border-dashed p-8 text-center transition-all ${dragging ? 'border-[#FF8C00] bg-white/5' : 'border-white/10 bg-white/[0.02]'}`}
      >
        <ImageIcon size={24} className="mx-auto mb-3 text-white/20" />
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Drop hero images here</p>
        <p className="text-[8px] text-white/30 mt-1">Or click upload to add your own sports hero images.</p>
      </div>

      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map(upload => (
            <div key={upload.id} className="flex items-center gap-3 p-3 bg-white/[0.05] rounded-2xl border border-white/10">
              <div className="w-3 h-3 rounded-full bg-[#FF8C00]" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black text-white truncate">{upload.file.name}</p>
                <div className="h-1 mt-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-[#FF8C00] transition-all" style={{ width: `${upload.progress}%` }} />
                </div>
              </div>
              {upload.error ? (
                <p className="text-[8px] text-red-300 uppercase tracking-[0.35em]">Error</p>
              ) : (
                <p className="text-[8px] text-white/40 uppercase tracking-[0.35em]">{upload.progress}%</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Hero Asset Library</p>
          <p className="text-[8px] text-white/30 mt-1">Select and assign your custom hero images to sports sections.</p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white text-black text-[9px] font-black uppercase tracking-widest hover:bg-white/90 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {loading ? (
        <div className="p-10 rounded-3xl bg-white/[0.03] border border-white/10 text-center text-[10px] text-white/40">Loading sports hero config…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {config.assets.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white/[0.03] border border-dashed border-white/10 text-center text-[10px] text-white/40">
              No hero assets uploaded yet. Add images above to build the sports hero carousel.
            </div>
          ) : config.assets.map(asset => (
            <motion.div
              key={asset.id}
              layout
              className="group rounded-3xl overflow-hidden border border-white/10 bg-white/[0.03]"
            >
              <div className="relative overflow-hidden aspect-[16/9] bg-black/10">
                <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeAsset(asset.id)}
                  className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white/70 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/40">{asset.name}</p>
                    <p className="text-[8px] text-white/30 mt-1">Uploaded {new Date(asset.uploadedAt).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => toggleSelection(asset.id)}
                    className={`px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${asset.isSelected ? 'bg-[#FF8C00] text-black' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                  >
                    {asset.isSelected ? 'Selected' : 'Select'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <label className="text-[8px] font-black uppercase tracking-[0.35em] text-white/40">League</label>
                  <select
                    value={asset.leagueId || ''}
                    onChange={e => updateAsset(asset.id, { leagueId: e.target.value || undefined })}
                    className="w-full rounded-2xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
                  >
                    {LEAGUE_OPTIONS.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <label className="text-[8px] font-black uppercase tracking-[0.35em] text-white/40">Title (optional)</label>
                  <input
                    value={asset.title || ''}
                    onChange={e => updateAsset(asset.id, { title: e.target.value || undefined })}
                    className="w-full rounded-2xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
                    placeholder="Custom hero title"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <label className="text-[8px] font-black uppercase tracking-[0.35em] text-white/40">Subtitle (optional)</label>
                  <input
                    value={asset.subtitle || ''}
                    onChange={e => updateAsset(asset.id, { subtitle: e.target.value || undefined })}
                    className="w-full rounded-2xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
                    placeholder="Custom hero subtitle"
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminSportsHeroManager;
