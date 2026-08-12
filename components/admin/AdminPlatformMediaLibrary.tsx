import React, { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, RefreshCw, Eye, EyeOff, Film, Tv, Sparkles, Megaphone, DollarSign, Clapperboard, Radio } from 'lucide-react';
import type { PlatformMediaAsset, PlatformMediaKind } from '../../types';
import { fetchAllPlatformMedia, savePlatformMediaAsset, deletePlatformMediaAsset } from '../../services/platformMediaService';
import { uploadFile as uploadFileService } from '../../services/backendService';

/**
 * AdminPlatformMediaLibrary — the system-admin repository for Plajah-owned branding: the TV-app open
 * bumpers (random per launch), Taleo pre-roll idents, platform bumpers/idents, house ads, platform
 * programming, and channel promos. Everything on-platform pulls its Plajah branding from here.
 */

const KINDS: { key: PlatformMediaKind; label: string; hint: string; icon: React.ReactNode; accent: string }[] = [
  { key: 'TV_OPEN_BUMPER', label: 'TV App Open', hint: 'Plays when the Plajah TV app launches — one is picked at random each open', icon: <Tv size={13} />, accent: '#FF8C00' },
  { key: 'TALEO_PREROLL', label: 'Taleo Pre-roll', hint: 'Studio ident before Taleo content plays (Netflix ta-dum style)', icon: <Clapperboard size={13} />, accent: '#D40055' },
  { key: 'PLATFORM_BUMPER', label: 'Platform Bumpers', hint: 'Plajah-branded interstitials any channel/broadcast can insert', icon: <Sparkles size={13} />, accent: '#6B0099' },
  { key: 'PLATFORM_AD', label: 'House Ads', hint: 'Platform ads the ad rail can fall back to', icon: <DollarSign size={13} />, accent: '#ca8a04' },
  { key: 'CHANNEL_PROMO', label: 'Channel Promos', hint: 'Cross-promos for Plajah channels & shows', icon: <Megaphone size={13} />, accent: '#0d9488' },
  { key: 'PLATFORM_PROGRAM', label: 'Programming', hint: 'Full platform programming channels can source', icon: <Film size={13} />, accent: '#2563eb' },
];

const probeDuration = (url: string): Promise<number> => new Promise(resolve => {
  if (!url || /\.m3u8($|[?#])/i.test(url)) return resolve(0);
  const el = document.createElement('video');
  el.preload = 'metadata'; el.muted = true;
  let done = false;
  const finish = (d: number) => { if (done) return; done = true; try { el.src = ''; } catch { /* */ } resolve(d); };
  const t = setTimeout(() => finish(0), 8000);
  el.onloadedmetadata = () => { clearTimeout(t); finish(Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration) : 0); };
  el.onerror = () => { clearTimeout(t); finish(0); };
  el.src = url;
});

const AdminPlatformMediaLibrary: React.FC = () => {
  const [tab, setTab] = useState<PlatformMediaKind>('TV_OPEN_BUMPER');
  const [assets, setAssets] = useState<PlatformMediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [weight, setWeight] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => { setLoading(true); setAssets(await fetchAllPlatformMedia()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const meta = KINDS.find(k => k.key === tab)!;
  const list = assets.filter(a => a.kind === tab);

  const handleUpload = async () => {
    if (!file || !title.trim()) return;
    setUploading(true);
    try {
      // Route through uploads/** (reliably writable by any signed-in admin) — storage isAdmin() is
      // unreliable for named DBs, so the admin gate is the Firestore rule + the AdminDashboard route.
      const path = `uploads/platform-media/${tab.toLowerCase()}_${Date.now()}_${file.name}`;
      const url = await uploadFileService(path, file);
      if (url) {
        const durationSeconds = await probeDuration(url).catch(() => 0);
        await savePlatformMediaAsset({ kind: tab, title: title.trim(), url, durationSeconds: durationSeconds || undefined, category: category.trim() || undefined, weight, isActive: true });
        setTitle(''); setCategory(''); setWeight(1); setFile(null);
        await load();
      }
    } finally { setUploading(false); }
  };

  const toggleActive = async (a: PlatformMediaAsset) => {
    await savePlatformMediaAsset({ ...a, isActive: !(a.isActive !== false) });
    setAssets(prev => prev.map(x => x.id === a.id ? { ...x, isActive: !(x.isActive !== false) } : x));
  };
  const remove = async (id: string) => { if (!confirm('Remove this asset from the platform library?')) return; await deletePlatformMediaAsset(id); setAssets(prev => prev.filter(x => x.id !== id)); };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2"><Radio size={20} className="text-small-orange" /> Plajah Media Library</h2>
        <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold mt-1">The central repository of Plajah branding — every broadcast, the TV app, and Taleo pull from here</p>
      </div>

      {/* Kind tabs */}
      <div className="flex flex-wrap gap-2">
        {KINDS.map(k => (
          <button key={k.key} onClick={() => setTab(k.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors border ${tab === k.key ? 'text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}
            style={tab === k.key ? { background: `${k.accent}22`, borderColor: `${k.accent}55` } : {}}>
            {k.icon} {k.label} <span className="opacity-50">{assets.filter(a => a.kind === k.key).length}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-white/45 leading-relaxed">{meta.hint}</p>

      {/* Upload */}
      <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (e.g. Plajah Ident 01)" className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-white/30 sm:col-span-2" />
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category (optional)" className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-white/30" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
          <button onClick={() => fileRef.current?.click()} className="flex-1 min-w-[200px] py-3 border-2 border-dashed border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/40 hover:border-white/20 hover:text-white/60 flex items-center justify-center gap-2">
            <Upload size={14} /> {file ? file.name : 'Choose video file'}
          </button>
          <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/40">Weight
            <input type="number" min={1} max={20} value={weight} onChange={e => setWeight(Math.max(1, parseInt(e.target.value) || 1))} className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs outline-none" />
          </label>
          <button onClick={handleUpload} disabled={!file || !title.trim() || uploading} className="px-6 py-3 bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center gap-2">
            {uploading ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />} Add to Library
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-16 flex justify-center"><RefreshCw size={22} className="animate-spin text-white/30" /></div>
      ) : list.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-white/5 rounded-2xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No {meta.label} assets yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(a => (
            <div key={a.id} className={`rounded-2xl overflow-hidden border transition-all ${a.isActive !== false ? 'bg-white/[0.03] border-white/10' : 'bg-white/[0.01] border-white/5 opacity-60'}`}>
              <div className="relative aspect-video bg-black">
                <video src={a.url} className="w-full h-full object-cover" muted preload="metadata" poster={a.thumbnailUrl} />
                {a.durationSeconds ? <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 text-white text-[10px] font-mono rounded">{Math.floor(a.durationSeconds / 60)}:{String(a.durationSeconds % 60).padStart(2, '0')}</span> : null}
              </div>
              <div className="p-3 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-tight text-white truncate">{a.title}</p>
                  {a.category && <p className="text-[8px] font-black uppercase tracking-widest text-white/30">{a.category}</p>}
                </div>
                <button onClick={() => toggleActive(a)} title={a.isActive !== false ? 'Active' : 'Inactive'} className={`p-2 rounded-lg ${a.isActive !== false ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-white/30 hover:bg-white/10'}`}>{a.isActive !== false ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                <button onClick={() => remove(a.id)} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminPlatformMediaLibrary;
