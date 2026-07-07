import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Search, LayoutGrid, List, Music2, Clapperboard, BookOpen, Film, FolderKanban,
  Pencil, Play, Globe, Lock, FileText, Clock, CheckSquare, Square, Download,
  Loader2, Sparkles, Layers, Tv, Mic2, Filter, ArrowUpDown, X, ShoppingBag, Crown,
} from 'lucide-react';
import { Album, Video, StoreProduct } from '../types';
import { fetchUserAlbums, fetchUserVideos, updateAlbum } from '../services/backendService';
import { fetchUnifiedSellerProducts } from '../services/storeService';

// ── Unified asset model — one normalized record across every Plajah service ──────
type ServiceKey = 'CHORA' | 'TALEO' | 'LOREA' | 'REELLO' | 'STORE' | 'OTHER';
type AssetStatus = 'PUBLIC' | 'DRAFT' | 'PRIVATE' | 'SCHEDULED';

interface Asset {
  id: string;
  service: ServiceKey;
  title: string;
  cover?: string;
  typeLabel: string;
  status: AssetStatus;
  plays: number;
  updatedAt: number;
  editable: boolean;      // opens the existing edit workflow (AlbumCreator / StoreManager)
  gated?: boolean;        // locked behind a Sanctuary (members / exclusive)
  price?: number;         // for store products
  album?: Album;          // source (albums-backed)
  video?: Video;          // source (Reello video docs)
  product?: StoreProduct; // source (unified store product — canonical + folded-in legacy merch)
}

const SERVICES: { key: ServiceKey | 'ALL' | 'PROJECTS'; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; accent: string }[] = [
  { key: 'ALL',      label: 'All',      icon: Layers,       accent: '#FF8C00' },
  { key: 'CHORA',    label: 'Chora',    icon: Music2,       accent: '#22D3AA' },
  { key: 'TALEO',    label: 'Taleo',    icon: Clapperboard, accent: '#D0BCFF' },
  { key: 'LOREA',    label: 'Lorea',    icon: BookOpen,     accent: '#F0A868' },
  { key: 'REELLO',   label: 'Reello',   icon: Film,         accent: '#FF6B9D' },
  { key: 'STORE',    label: 'Store',    icon: ShoppingBag,  accent: '#FFB000' },
  { key: 'PROJECTS', label: 'Projects', icon: FolderKanban, accent: '#7CA9FF' },
];

const statusOf = (a: any): AssetStatus =>
  a?.isScheduled ? 'SCHEDULED' : a?.isDraft ? 'DRAFT' : (a?.isPrivate || a?.isPublic === false) ? 'PRIVATE' : 'PUBLIC';

const coverOf = (a: any): string | undefined =>
  a?.coverImage || a?.coverImageUrl || a?.thumbnailUrl || (a?.muxPlaybackId ? `https://image.mux.com/${a.muxPlaybackId}/thumbnail.png?width=480&height=270&time=5` : undefined);

// Classify an album into its home service.
function albumService(al: Album): { service: ServiceKey; typeLabel: string } {
  const st = (al.subType || '').toUpperCase();
  if (al.type === 'MUSIC') return { service: 'CHORA', typeLabel: st === 'PODCAST' ? 'Audio Podcast' : 'Music' };
  if (al.type === 'BOOK') return { service: 'LOREA', typeLabel: st === 'NOVEL' ? 'Book' : (st === 'GRAPHIC_NOVEL' ? 'Graphic Novel' : 'Book') };
  if (al.type === 'VIDEO') {
    if (st === 'MOVIE') return { service: 'TALEO', typeLabel: 'Film' };
    if (st === 'TV_SERIES') return { service: 'TALEO', typeLabel: 'TV Series' };
    return { service: 'REELLO', typeLabel: 'Video' };
  }
  return { service: 'OTHER', typeLabel: al.type || 'Asset' };
}

const videoTypeLabel = (v: Video): string => {
  const c = (v.category || '').toUpperCase();
  if (c === 'MUSIC_VIDEO') return 'Music Video';
  if (c === 'MOVIE') return 'Film';
  if (c === 'TV_EPISODE') return 'Episode';
  if ((v as any).isLiveRecording) return 'Live Stream';
  if ((v as any).podcastMetadata) return 'Video Podcast';
  return 'Video';
};

// ── Projects (Fabula / Pixels / writing / teleprompter) from local + known stores ─
interface ProjectRow { id: string; name: string; kind: string; updatedAt?: number; }
function loadProjects(): ProjectRow[] {
  const out: ProjectRow[] = [];
  try {
    // Teleprompter scripts
    const tp = JSON.parse(localStorage.getItem('teleprompter_scripts') || '[]');
    if (Array.isArray(tp)) tp.forEach((s: any) => out.push({ id: 'tp_' + (s.id || s.title), name: s.title || 'Script', kind: 'Teleprompter' }));
  } catch { /* */ }
  try {
    // Pixels timelines (pixels:tl:<name>)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      if (k.startsWith('pixels:tl:')) out.push({ id: k, name: k.slice('pixels:tl:'.length) || 'Pixels Timeline', kind: 'Pixels' });
      else if (/fabula/i.test(k) && /project|edit|nle/i.test(k)) out.push({ id: k, name: k.replace(/[:_-]+/g, ' ').slice(0, 40), kind: 'Fabula' });
    }
  } catch { /* */ }
  return out;
}

const STATUS_STYLE: Record<AssetStatus, { label: string; cls: string }> = {
  PUBLIC:    { label: 'Public',    cls: 'bg-emerald-500/15 text-emerald-400' },
  DRAFT:     { label: 'Draft',     cls: 'bg-white/10 text-white/50' },
  PRIVATE:   { label: 'Private',   cls: 'bg-violet-500/15 text-violet-300' },
  SCHEDULED: { label: 'Scheduled', cls: 'bg-sky-500/15 text-sky-300' },
};

const ContentAssetManager: React.FC<{
  uid: string;
  onEditAlbum: (album: Album) => void;
  onOpenProject?: (kind: string) => void;
  /** Open the Store Manager (merch product editing lives there). */
  onManageStore?: () => void;
  /** Open Sanctuary management (gating / tiers). */
  onManageSanctuary?: () => void;
}> = ({ uid, onEditAlbum, onOpenProject, onManageStore, onManageSanctuary }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ServiceKey | 'ALL' | 'PROJECTS'>('ALL');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | AssetStatus>('ALL');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'plays'>('date');
  const [view, setView] = useState<'GRID' | 'LIST'>('GRID');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [al, vi, pr] = await Promise.all([
      fetchUserAlbums(uid).catch(() => []),
      fetchUserVideos(uid).catch(() => []),
      fetchUnifiedSellerProducts(uid).catch(() => []),
    ]);
    setAlbums(al || []);
    setVideos(vi || []);
    setProducts(pr || []);
    setProjects(loadProjects());
    setLoading(false);
  }, [uid]);
  useEffect(() => { load(); }, [load]);

  // Normalize everything into one asset list.
  const assets = useMemo<Asset[]>(() => {
    const out: Asset[] = [];
    for (const al of albums) {
      const { service, typeLabel } = albumService(al);
      out.push({
        id: al.id, service, typeLabel, title: al.title || 'Untitled',
        cover: coverOf(al), status: statusOf(al), plays: (al as any).playCount || 0,
        updatedAt: (al as any).modifiedAt || al.createdAt || 0, editable: true,
        gated: !!(al as any).isExclusive || !!(al as any).sanctuaryOnly, album: al,
      });
    }
    // Reello video docs that aren't already albums.
    const albumIds = new Set(albums.map(a => a.id));
    for (const v of videos) {
      if (albumIds.has(v.id)) continue;
      out.push({
        id: v.id, service: 'REELLO', typeLabel: videoTypeLabel(v), title: v.title || 'Untitled',
        cover: coverOf(v), status: statusOf(v), plays: (v as any).playsCount || v.likesCount || 0,
        updatedAt: v.timestamp || 0, editable: false, gated: !!(v as any).isExclusive, video: v,
      });
    }
    // Store products — the store's product assets live in the manager too (canonical
    // storeProducts + any folded-in legacy merch, unified upstream).
    for (const p of products) {
      const cat = (p.category || 'Product').toString();
      out.push({
        id: p.id, service: 'STORE', typeLabel: cat.charAt(0) + cat.slice(1).toLowerCase(),
        title: p.title || 'Product', cover: p.images?.[0], status: p.isActive && (p.stock ?? 0) > 0 ? 'PUBLIC' : 'DRAFT',
        plays: p.reviewCount || 0, updatedAt: p.updatedAt || p.createdAt || 0, editable: true, price: p.price, product: p,
      });
    }
    return out;
  }, [albums, videos, products]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: assets.length, PROJECTS: projects.length };
    for (const a of assets) c[a.service] = (c[a.service] || 0) + 1;
    return c;
  }, [assets, projects]);

  const filtered = useMemo(() => {
    let list = tab === 'ALL' ? assets : assets.filter(a => a.service === tab);
    if (status !== 'ALL') list = list.filter(a => a.status === status);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(a => a.title.toLowerCase().includes(q) || a.typeLabel.toLowerCase().includes(q)); }
    list = [...list].sort((a, b) =>
      sortBy === 'title' ? a.title.localeCompare(b.title) : sortBy === 'plays' ? b.plays - a.plays : b.updatedAt - a.updatedAt);
    return list;
  }, [assets, tab, status, search, sortBy]);

  const toggleSel = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSel = () => setSelected(new Set());

  const bulkSetPublic = async (makePublic: boolean) => {
    setBusy(true);
    try {
      await Promise.all([...selected].map(id => {
        const a = assets.find(x => x.id === id);
        if (a?.album) return updateAlbum(id, { isPublic: makePublic, isDraft: makePublic ? false : (a.album.isDraft ?? true), isPrivate: !makePublic } as any);
        return Promise.resolve();
      }));
      clearSel();
      await load();
    } finally { setBusy(false); }
  };

  const edit = (a: Asset) => { if (a.album) onEditAlbum(a.album); else if (a.product) onManageStore?.(); };

  // Gate/ungate an asset behind the creator's Sanctuary (members-only exclusive).
  const toggleGate = async (a: Asset) => {
    if (!a.album) return;
    setBusy(true);
    try { await updateAlbum(a.id, { isExclusive: !a.gated } as any); await load(); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none text-white">Content <span className="text-[#FF8C00]">Manager</span></h1>
        <p className="text-white/35 text-sm font-bold uppercase tracking-widest mt-2">Every asset you've made, across the whole platform</p>
      </div>

      {/* Service tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {SERVICES.map(s => {
          const active = tab === s.key;
          return (
            <button key={s.key} onClick={() => { setTab(s.key); clearSel(); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${active ? 'text-black' : 'text-white/50 border-white/10 hover:text-white hover:bg-white/5'}`}
              style={active ? { background: s.accent, borderColor: s.accent } : {}}>
              <s.icon size={13} /> {s.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[8px] ${active ? 'bg-black/20' : 'bg-white/10 text-white/40'}`}>{counts[s.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* DAM toolbar */}
      {tab !== 'PROJECTS' && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets, metadata…"
              className="w-full bg-white/5 border border-white/10 rounded-full py-2.5 pl-11 pr-4 text-sm outline-none focus:border-white/25" />
          </div>
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-2">
            <Filter size={12} className="text-white/25" />
            <select value={status} onChange={e => setStatus(e.target.value as any)} className="bg-transparent text-[10px] font-black uppercase tracking-widest text-white/60 outline-none">
              <option value="ALL" className="bg-[#111]">All status</option>
              <option value="PUBLIC" className="bg-[#111]">Public</option>
              <option value="DRAFT" className="bg-[#111]">Draft</option>
              <option value="PRIVATE" className="bg-[#111]">Private</option>
              <option value="SCHEDULED" className="bg-[#111]">Scheduled</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-2">
            <ArrowUpDown size={12} className="text-white/25" />
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="bg-transparent text-[10px] font-black uppercase tracking-widest text-white/60 outline-none">
              <option value="date" className="bg-[#111]">Newest</option>
              <option value="title" className="bg-[#111]">Title</option>
              <option value="plays" className="bg-[#111]">Most played</option>
            </select>
          </div>
          <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-1">
            <button onClick={() => setView('GRID')} className={`p-2 rounded-full ${view === 'GRID' ? 'bg-white text-black' : 'text-white/40'}`}><LayoutGrid size={14} /></button>
            <button onClick={() => setView('LIST')} className={`p-2 rounded-full ${view === 'LIST' ? 'bg-white text-black' : 'text-white/40'}`}><List size={14} /></button>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#FF8C00]/10 border border-[#FF8C00]/30">
          <span className="text-[11px] font-black uppercase tracking-widest text-[#FF8C00]">{selected.size} selected</span>
          <button disabled={busy} onClick={() => bulkSetPublic(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/20"><Globe size={11} /> Publish</button>
          <button disabled={busy} onClick={() => bulkSetPublic(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/20"><Lock size={11} /> Make private</button>
          {busy && <Loader2 size={13} className="animate-spin text-white/50" />}
          <button onClick={clearSel} className="ml-auto text-white/40 hover:text-white"><X size={15} /></button>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="py-24 flex justify-center"><Loader2 size={26} className="animate-spin text-white/30" /></div>
      ) : tab === 'PROJECTS' ? (
        <ProjectsPanel projects={projects} onOpenProject={onOpenProject} />
      ) : filtered.length === 0 ? (
        <div className="py-24 text-center border-2 border-dashed border-white/8 rounded-3xl">
          <Sparkles size={34} className="mx-auto text-white/12 mb-4" />
          <p className="text-[11px] font-black uppercase tracking-widest text-white/25">No assets here yet</p>
        </div>
      ) : view === 'GRID' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-7">
          {filtered.map(a => (
            <AssetCard key={a.id} asset={a} selected={selected.has(a.id)} onToggle={() => toggleSel(a.id)} onEdit={() => edit(a)} onOpen={() => setDetail(a)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => (
            <AssetRow key={a.id} asset={a} selected={selected.has(a.id)} onToggle={() => toggleSel(a.id)} onEdit={() => edit(a)} onOpen={() => setDetail(a)} />
          ))}
        </div>
      )}

      {/* Detail / metadata panel (DAM) */}
      {detail && (
        <AssetDetail
          asset={detail}
          busy={busy}
          onClose={() => setDetail(null)}
          onEdit={() => { setDetail(null); edit(detail); }}
          onToggleGate={detail.album ? () => toggleGate(detail) : undefined}
          onManageSanctuary={onManageSanctuary}
        />
      )}
    </div>
  );
};

// ── Cards / rows ────────────────────────────────────────────────────────────────
const svcAccent = (s: ServiceKey) => SERVICES.find(x => x.key === s)?.accent || '#FF8C00';

const AssetCard: React.FC<{ asset: Asset; selected: boolean; onToggle: () => void; onEdit: () => void; onOpen: () => void }> = ({ asset, selected, onToggle, onEdit, onOpen }) => (
  <div className="group">
    <div className={`relative aspect-video rounded-2xl overflow-hidden bg-white/[0.04] border transition-all ${selected ? 'border-[#FF8C00]' : 'border-white/10 group-hover:border-white/20'}`}>
      {asset.cover ? <img src={asset.cover} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film size={26} className="text-white/15" /></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      <button onClick={onToggle} className="absolute top-2 left-2 text-white/70 hover:text-white">{selected ? <CheckSquare size={17} className="text-[#FF8C00]" /> : <Square size={17} />}</button>
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {asset.gated && <span title="Sanctuary members-only" className="w-5 h-5 rounded bg-[#6B0099] flex items-center justify-center"><Crown size={11} className="text-white" /></span>}
        <span className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest" style={{ background: `${svcAccent(asset.service)}22`, color: svcAccent(asset.service) }}>{asset.typeLabel}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
        {asset.editable && <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FF8C00] text-black text-[9px] font-black uppercase tracking-widest"><Pencil size={11} /> Edit</button>}
        <button onClick={onOpen} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 text-black text-[9px] font-black uppercase tracking-widest"><Layers size={11} /> Details</button>
      </div>
    </div>
    <div className="flex items-center justify-between gap-2 mt-2">
      <p className="text-sm font-black text-white truncate">{asset.title}</p>
      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${STATUS_STYLE[asset.status].cls}`}>{STATUS_STYLE[asset.status].label}</span>
    </div>
  </div>
);

const AssetRow: React.FC<{ asset: Asset; selected: boolean; onToggle: () => void; onEdit: () => void; onOpen: () => void }> = ({ asset, selected, onToggle, onEdit, onOpen }) => (
  <div className={`flex items-center gap-4 p-2.5 rounded-xl border transition-all ${selected ? 'border-[#FF8C00]/50 bg-[#FF8C00]/5' : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.05]'}`}>
    <button onClick={onToggle} className="text-white/50 hover:text-white shrink-0">{selected ? <CheckSquare size={17} className="text-[#FF8C00]" /> : <Square size={17} />}</button>
    <div className="w-16 aspect-video rounded-lg overflow-hidden bg-white/5 shrink-0">
      {asset.cover ? <img src={asset.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film size={14} className="text-white/20" /></div>}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-white truncate">{asset.title}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-white/35">{asset.typeLabel} · {STATUS_STYLE[asset.status].label}{asset.plays ? ` · ${asset.plays.toLocaleString()} plays` : ''}</p>
    </div>
    <span className="hidden sm:block px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest shrink-0" style={{ background: `${svcAccent(asset.service)}22`, color: svcAccent(asset.service) }}>{SERVICES.find(s => s.key === asset.service)?.label}</span>
    {asset.editable && <button onClick={onEdit} className="p-2 rounded-full text-white/40 hover:text-[#FF8C00] shrink-0" title="Edit"><Pencil size={15} /></button>}
    <button onClick={onOpen} className="p-2 rounded-full text-white/40 hover:text-white shrink-0" title="Details"><Layers size={15} /></button>
  </div>
);

const AssetDetail: React.FC<{ asset: Asset; busy?: boolean; onClose: () => void; onEdit: () => void; onToggleGate?: () => void; onManageSanctuary?: () => void }> = ({ asset, busy, onClose, onEdit, onToggleGate, onManageSanctuary }) => (
  <div className="fixed inset-0 z-[130] flex items-center justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-md h-full bg-[#0c0c11] border-l border-white/10 overflow-y-auto p-6 space-y-5" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest" style={{ background: `${svcAccent(asset.service)}22`, color: svcAccent(asset.service) }}>{SERVICES.find(s => s.key === asset.service)?.label} · {asset.typeLabel}</span>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
      </div>
      <div className="aspect-video rounded-2xl overflow-hidden bg-white/5">
        {asset.cover ? <img src={asset.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film size={30} className="text-white/15" /></div>}
      </div>
      <h2 className="text-2xl font-black text-white">{asset.title}</h2>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {[
          ['Status', STATUS_STYLE[asset.status].label],
          ['Service', SERVICES.find(s => s.key === asset.service)?.label || ''],
          ['Type', asset.typeLabel],
          [asset.product ? 'Price' : 'Plays', asset.product ? `$${(asset.price ?? 0).toFixed(2)}` : asset.plays.toLocaleString()],
          ['Updated', asset.updatedAt ? new Date(asset.updatedAt).toLocaleDateString() : '—'],
          ['Access', asset.gated ? 'Sanctuary' : 'Open'],
        ].map(([k, v]) => (
          <div key={k} className="p-3 rounded-xl bg-white/[0.03] border border-white/8">
            <p className="text-[7px] font-black uppercase tracking-widest text-white/25 mb-1">{k}</p>
            <p className="text-white/80 font-bold truncate">{v}</p>
          </div>
        ))}
      </div>

      {/* Sanctuary gating — deep link between the asset manager and Sanctuary */}
      {(onToggleGate || asset.product) && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#6B0099]/15 to-transparent border border-[#6B0099]/25 space-y-3">
          <div className="flex items-center gap-2"><Crown size={14} className="text-[#D0A0FF]" /><p className="text-[10px] font-black uppercase tracking-widest text-white/70">Sanctuary</p></div>
          {onToggleGate && (
            <button onClick={onToggleGate} disabled={busy} className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${asset.gated ? 'bg-[#6B0099] text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : (asset.gated ? <Lock size={12} /> : <Globe size={12} />)}
              {asset.gated ? 'Members-only — tap to unlock' : 'Gate to Sanctuary (members-only)'}
            </button>
          )}
          {onManageSanctuary && (
            <button onClick={onManageSanctuary} className="w-full py-2 rounded-full bg-white/5 text-white/50 text-[9px] font-black uppercase tracking-widest hover:text-white">Manage tiers & à-la-carte in Sanctuary →</button>
          )}
          <p className="text-[8px] text-white/25 leading-relaxed">Gated assets are locked to your Sanctuary members (or à-la-carte buyers). Set tiers and pricing in Sanctuary.</p>
        </div>
      )}

      <div className="flex gap-2">
        {asset.editable && <button onClick={onEdit} className="flex-1 py-3 rounded-full bg-[#FF8C00] text-black text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"><Pencil size={13} /> {asset.product ? 'Edit in Store Manager' : 'Edit in studio'}</button>}
        {(asset.album?.tracks?.[0]?.url || asset.video?.url) && (
          <a href={asset.album?.tracks?.[0]?.url || asset.video?.url} target="_blank" rel="noreferrer" download className="px-4 py-3 rounded-full bg-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2" title="Download source"><Download size={13} /></a>
        )}
      </div>
      <p className="text-[9px] text-white/20 leading-relaxed">Digital asset record — the canonical entry for this work across Plajah. Editing opens the same authoring tool used to create it.</p>
    </div>
  </div>
);

const ProjectsPanel: React.FC<{ projects: ProjectRow[]; onOpenProject?: (kind: string) => void }> = ({ projects, onOpenProject }) => {
  const groups: { kind: string; icon: React.ComponentType<{ size?: number; className?: string }>; note: string }[] = [
    { kind: 'Fabula', icon: Clapperboard, note: 'AI film edit projects' },
    { kind: 'Pixels', icon: Sparkles, note: 'VJ / motion timelines' },
    { kind: 'Teleprompter', icon: FileText, note: 'Scripts & prompter sessions' },
  ];
  return (
    <div className="space-y-6">
      {groups.map(g => {
        const rows = projects.filter(p => p.kind === g.kind);
        return (
          <div key={g.kind}>
            <div className="flex items-center gap-2 mb-3">
              <g.icon size={14} className="text-[#7CA9FF]" />
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">{g.kind}</h3>
              <span className="text-[9px] text-white/25">· {g.note}</span>
            </div>
            {rows.length === 0 ? (
              <p className="text-[10px] text-white/25 uppercase tracking-widest px-1">No {g.kind} projects on this device</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {rows.map(p => (
                  <button key={p.id} onClick={() => onOpenProject?.(g.kind)} className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/8 hover:border-[#7CA9FF]/30 hover:bg-white/[0.05] transition-all text-left">
                    <div className="w-9 h-9 rounded-xl bg-[#7CA9FF]/15 flex items-center justify-center shrink-0"><g.icon size={15} className="text-[#7CA9FF]" /></div>
                    <div className="min-w-0"><p className="text-sm font-bold text-white truncate">{p.name}</p><p className="text-[8px] font-black uppercase tracking-widest text-white/30">{g.kind} project</p></div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[9px] text-white/20 leading-relaxed pt-2">Projects are your in-progress work-files (edits, timelines, scripts) — distinct from finished assets. Some are stored on this device; cloud sync for projects is coming.</p>
    </div>
  );
};

export default ContentAssetManager;
