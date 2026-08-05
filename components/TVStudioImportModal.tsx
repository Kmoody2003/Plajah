/**
 * TVStudioImportModal
 *
 * On-platform + local asset import for the TV Studio media bin.
 * Tabs:
 *  Local Device  — file picker (video, image, APNG, WebM, HTML video/HLS)
 *  Reelo         — music videos / short-form video from the platform
 *  Taleo         — films, TV series, documentaries
 *  Posts         — render a social post as an interactive source
 *  Live Feeds    — other on-platform live streams as picture-in-picture sources
 *  FAST / Ads    — user's FAST channel ad assets + radio station ad spots
 *  Plajah Labs   — visual data, charts, research from Labs
 *
 * Returns selected asset(s) via onImport callback with enough info for the
 * engine to load them as sources.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Film, Video, Radio, Rss, FlaskConical, Tv, Image as ImageIcon,
  Search, Upload, ChevronRight, Play, Check, Folder, HardDrive,
} from 'lucide-react';
import {
  fetchAllVideos, fetchAllLiveFeeds, fetchAdConfigs, fetchFastChannelVideos,
  fetchRadioTracks, auth,
} from '../services/backendService';
import { Video as VideoType, LiveFeed } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImportedAsset {
  label: string;
  /** Blob URL or HTTPS URL */
  url: string;
  type: 'VIDEO' | 'IMAGE' | 'LIVE' | 'POST' | 'HLS';
  thumbnailUrl?: string;
  /** For post sources — post ID so the switcher can render the interactive post */
  postId?: string;
  /** For live sources — HLS/M3U8 or WebRTC URL */
  isLive?: boolean;
}

export interface HotFolder {
  id: string;
  label: string;
  /** File System Access API directory handle (serialized as JSON name) */
  directoryName: string;
  handle?: FileSystemDirectoryHandle;
}

interface TVStudioImportModalProps {
  onImport: (assets: ImportedAsset[]) => void;
  onClose: () => void;
  /** Existing hot folders from IndexedDB */
  hotFolders?: HotFolder[];
  onAddHotFolder?: (folder: HotFolder) => void;
}

type ImportTab = 'LOCAL' | 'REELO' | 'TALEO' | 'POSTS' | 'LIVE' | 'FAST' | 'LABS';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Main component ────────────────────────────────────────────────────────────

const TVStudioImportModal: React.FC<TVStudioImportModalProps> = ({
  onImport, onClose, hotFolders = [], onAddHotFolder,
}) => {
  const [tab, setTab]             = useState<ImportTab>('LOCAL');
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<ImportedAsset[]>([]);
  const [videos, setVideos]       = useState<VideoType[]>([]);
  const [liveFeeds, setLiveFeeds] = useState<LiveFeed[]>([]);
  const [fastVideos, setFastVideos] = useState<VideoType[]>([]);
  const [loading, setLoading]     = useState(false);

  // Load data when tab changes
  useEffect(() => {
    setLoading(true);
    setSearch('');
    if (tab === 'REELO' || tab === 'TALEO') {
      fetchAllVideos().then(v => {
        setVideos(tab === 'TALEO' ? v.filter(x => (x as any).videoType === 'MOVIE' || (x as any).videoType === 'SERIES') : v);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else if (tab === 'LIVE') {
      const unsub = fetchAllLiveFeeds(feeds => { setLiveFeeds(feeds); setLoading(false); });
      return () => unsub();
    } else if (tab === 'FAST') {
      const uid = auth.currentUser?.uid;
      if (uid) fetchFastChannelVideos(uid).then(v => { setFastVideos(v); setLoading(false); }).catch(() => setLoading(false));
      else setLoading(false);
    } else {
      setLoading(false);
    }
  }, [tab]);

  const toggle = useCallback((asset: ImportedAsset) => {
    setSelected(prev =>
      prev.find(a => a.url === asset.url)
        ? prev.filter(a => a.url !== asset.url)
        : [...prev, asset]
    );
  }, []);

  const isSelected = (url: string) => selected.some(a => a.url === url);

  const handleLocalFile = useCallback(() => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.accept = 'video/*,image/*,.m3u8,.apng,.webm,.mp4,.mov,.avi,.mkv,.png,.jpg,.jpeg,.gif,.svg';
    inp.onchange = () => {
      const files = Array.from(inp.files ?? []);
      const assets: ImportedAsset[] = files.map(f => ({
        label: f.name.replace(/\.[^.]+$/, ''),
        url: URL.createObjectURL(f),
        type: f.type.startsWith('image/') ? 'IMAGE' : f.name.endsWith('.m3u8') ? 'HLS' : 'VIDEO',
      }));
      onImport(assets);
    };
    inp.click();
  }, [onImport]);

  const handleAddHotFolder = useCallback(async () => {
    if (!(window as any).showDirectoryPicker) {
      alert('Hot Folders require Chrome 86+ with the File System Access API.');
      return;
    }
    try {
      const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
      onAddHotFolder?.({
        id: `hf_${Date.now()}`,
        label: handle.name,
        directoryName: handle.name,
        handle,
      });
    } catch { /* cancelled */ }
  }, [onAddHotFolder]);

  const handleHotFolderLoad = useCallback(async (folder: HotFolder) => {
    if (!folder.handle) return;
    const assets: ImportedAsset[] = [];
    for await (const [name, entry] of (folder.handle as any).entries()) {
      if (entry.kind === 'file') {
        const file: File = await (entry as FileSystemFileHandle).getFile();
        if (file.type.startsWith('video/') || file.type.startsWith('image/')) {
          assets.push({
            label: name.replace(/\.[^.]+$/, ''),
            url: URL.createObjectURL(file),
            type: file.type.startsWith('image/') ? 'IMAGE' : 'VIDEO',
          });
        }
      }
    }
    setSelected(prev => [...prev, ...assets.filter(a => !prev.find(p => p.label === a.label))]);
  }, []);

  const filtered = useCallback((list: VideoType[]) =>
    search ? list.filter(v => v.title?.toLowerCase().includes(search.toLowerCase()) || v.artist?.toLowerCase().includes(search.toLowerCase())) : list
  , [search]);

  const TABS: { id: ImportTab; label: string; icon: React.ReactNode }[] = [
    { id: 'LOCAL',  label: 'Local / Hot Folders', icon: <HardDrive size={12} /> },
    { id: 'REELO',  label: 'Reelo Videos',        icon: <Video size={12} />     },
    { id: 'TALEO',  label: 'Taleo Films',         icon: <Film size={12} />      },
    { id: 'LIVE',   label: 'Live Feeds',           icon: <Rss size={12} />      },
    { id: 'FAST',   label: 'FAST / Ads',           icon: <Tv size={12} />       },
    { id: 'LABS',   label: 'Plajah Labs',          icon: <FlaskConical size={12} /> },
    { id: 'POSTS',  label: 'Posts',                icon: <ImageIcon size={12} /> },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94 }}
        transition={{ type: 'spring', damping: 28, stiffness: 340 }}
        className="flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ width: '90vw', maxWidth: 900, height: '80vh', background: '#111', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', fontFamily: "'JetBrains Mono', monospace" }}>
          <div className="flex items-center gap-3">
            <Upload size={14} style={{ color: '#6B0099' }} />
            <span className="text-sm font-black text-white uppercase tracking-widest">Import to Media Bin</span>
          </div>
          <div className="flex items-center gap-3">
            {selected.length > 0 && (
              <button
                onClick={() => onImport(selected)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest text-white transition-all"
                style={{ background: '#6B0099' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#7d00b4')}
                onMouseLeave={e => (e.currentTarget.style.background = '#6B0099')}
              >
                <Check size={12} /> Import {selected.length}
              </button>
            )}
            <button onClick={onClose} className="opacity-30 hover:opacity-80 transition-opacity p-1"><X size={16} /></button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Tab sidebar */}
          <div className="flex flex-col gap-0.5 p-2 shrink-0" style={{ width: 180, borderRight: '1px solid rgba(255,255,255,0.06)', background: '#0d0d0d' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold transition-all text-left"
                style={{
                  background: tab === t.id ? 'rgba(107,0,153,0.25)' : 'transparent',
                  color: tab === t.id ? '#c084fc' : 'rgba(255,255,255,0.4)',
                  border: tab === t.id ? '1px solid rgba(107,0,153,0.35)' : '1px solid transparent',
                }}>
                {t.icon} {t.label}
              </button>
            ))}

            {/* Hot folders */}
            <div className="mt-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[8px] opacity-25 uppercase tracking-widest px-2 mb-1">Hot Folders</p>
              {hotFolders.map(hf => (
                <button key={hf.id} onClick={() => handleHotFolderLoad(hf)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[9px] opacity-40 hover:opacity-80 transition-opacity text-left">
                  <Folder size={10} /> {hf.label}
                </button>
              ))}
              <button onClick={handleAddHotFolder}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[9px] opacity-30 hover:opacity-60 transition-opacity">
                <Plus size={9} /> Add folder…
              </button>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Search bar */}
            {tab !== 'LOCAL' && tab !== 'LABS' && (
              <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Search size={12} className="opacity-30" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                    className="flex-1 bg-transparent outline-none text-xs text-white placeholder-white/25" />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3" style={{ scrollbarWidth: 'thin' }}>

              {/* LOCAL */}
              {tab === 'LOCAL' && (
                <div className="space-y-4">
                  <button onClick={handleLocalFile}
                    className="w-full flex flex-col items-center justify-center gap-3 py-12 rounded-2xl transition-all"
                    style={{ background: 'rgba(107,0,153,0.08)', border: '2px dashed rgba(107,0,153,0.35)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(107,0,153,0.15)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(107,0,153,0.08)')}
                  >
                    <Upload size={24} style={{ color: '#6B0099' }} />
                    <div className="text-center">
                      <p className="text-sm font-black text-white">Browse files</p>
                      <p className="text-[10px] opacity-40 mt-1">Video · Image · APNG · WebM · MP4 · MOV · HLS (.m3u8)</p>
                    </div>
                  </button>
                  <p className="text-[9px] opacity-25 text-center">Assets are loaded as Blob URLs — no upload required. Hot folders let you pin a local directory for instant access.</p>
                </div>
              )}

              {/* REELO / TALEO video grid */}
              {(tab === 'REELO' || tab === 'TALEO') && (
                loading ? (
                  <div className="flex items-center justify-center py-16"><div className="w-8 h-8 rounded-full border-2 border-[#6B0099]/30 border-t-[#6B0099] animate-spin" /></div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {filtered(videos).map(v => {
                      const asset: ImportedAsset = { label: v.title ?? v.id, url: v.url ?? '', type: 'VIDEO', thumbnailUrl: v.thumbnailUrl };
                      const sel = isSelected(asset.url);
                      return (
                        <button key={v.id} onClick={() => toggle(asset)}
                          className="text-left rounded-xl overflow-hidden transition-all"
                          style={{ border: `2px solid ${sel ? '#6B0099' : 'rgba(255,255,255,0.07)'}`, background: sel ? 'rgba(107,0,153,0.1)' : 'rgba(255,255,255,0.03)' }}>
                          <div className="relative aspect-video bg-black">
                            {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover opacity-70" loading="lazy" />}
                            {sel && <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#6B0099] flex items-center justify-center"><Check size={10} className="text-white" /></div>}
                          </div>
                          <div className="p-2">
                            <p className="text-[10px] font-bold text-white truncate">{v.title}</p>
                            <p className="text-[8px] opacity-40 truncate">{v.artist}</p>
                          </div>
                        </button>
                      );
                    })}
                    {filtered(videos).length === 0 && !loading && <p className="col-span-3 text-center py-8 text-[10px] opacity-20">No content found</p>}
                  </div>
                )
              )}

              {/* LIVE feeds */}
              {tab === 'LIVE' && (
                loading ? (
                  <div className="flex items-center justify-center py-16"><div className="w-8 h-8 rounded-full border-2 border-[#6B0099]/30 border-t-[#6B0099] animate-spin" /></div>
                ) : (
                  <div className="space-y-2">
                    {liveFeeds.map(feed => {
                      const asset: ImportedAsset = { label: feed.title, url: feed.url, type: 'LIVE', isLive: true };
                      const sel = isSelected(asset.url);
                      return (
                        <button key={feed.id} onClick={() => toggle(asset)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                          style={{ background: sel ? 'rgba(107,0,153,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${sel ? 'rgba(107,0,153,0.4)' : 'rgba(255,255,255,0.07)'}` }}>
                          <div className="w-2 h-2 rounded-full bg-[#D40055] animate-pulse shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-white truncate">{feed.title}</p>
                            <p className="text-[9px] opacity-40">{feed.ownerName}</p>
                          </div>
                          {sel && <Check size={14} style={{ color: '#6B0099' }} />}
                        </button>
                      );
                    })}
                    {liveFeeds.length === 0 && <p className="text-center py-8 text-[10px] opacity-20">No live streams active</p>}
                  </div>
                )
              )}

              {/* FAST / Ads */}
              {tab === 'FAST' && (
                loading ? (
                  <div className="flex items-center justify-center py-16"><div className="w-8 h-8 rounded-full border-2 border-[#6B0099]/30 border-t-[#6B0099] animate-spin" /></div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[9px] opacity-30 uppercase tracking-widest font-bold">FAST Channel Assets</p>
                    <div className="grid grid-cols-3 gap-3">
                      {fastVideos.map(v => {
                        const asset: ImportedAsset = { label: v.title ?? v.id, url: v.url ?? '', type: 'VIDEO', thumbnailUrl: v.thumbnailUrl };
                        const sel = isSelected(asset.url);
                        return (
                          <button key={v.id} onClick={() => toggle(asset)}
                            className="text-left rounded-xl overflow-hidden transition-all"
                            style={{ border: `2px solid ${sel ? '#6B0099' : 'rgba(255,255,255,0.07)'}` }}>
                            <div className="aspect-video bg-black relative">
                              {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover opacity-60" loading="lazy" />}
                              {sel && <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#6B0099] flex items-center justify-center"><Check size={10} className="text-white" /></div>}
                            </div>
                            <div className="p-2"><p className="text-[9px] font-bold text-white truncate">{v.title}</p></div>
                          </button>
                        );
                      })}
                      {fastVideos.length === 0 && <p className="col-span-3 text-center py-8 text-[10px] opacity-20">No FAST channel assets — set up your FAST channel first</p>}
                    </div>
                  </div>
                )
              )}

              {/* Plajah Labs */}
              {tab === 'LABS' && (
                <div className="space-y-3">
                  <p className="text-[9px] opacity-30 uppercase tracking-widest font-bold mb-4">Labs visual data sources appear as live canvas inputs</p>
                  {['Research Dashboard', 'Citation Graph', 'Formula Display', 'Data Visualizer', 'Discipline Map'].map(name => {
                    const asset: ImportedAsset = { label: `Labs: ${name}`, url: `plajah://labs/${name.toLowerCase().replace(/\s/g, '-')}`, type: 'VIDEO' };
                    const sel = isSelected(asset.url);
                    return (
                      <button key={name} onClick={() => toggle(asset)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                        style={{ background: sel ? 'rgba(107,0,153,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${sel ? 'rgba(107,0,153,0.4)' : 'rgba(255,255,255,0.07)'}` }}>
                        <FlaskConical size={16} style={{ color: '#6B0099' }} className="shrink-0" />
                        <div className="flex-1">
                          <p className="text-[11px] font-bold text-white">{name}</p>
                          <p className="text-[8px] opacity-35">Plajah Labs — live iframe source</p>
                        </div>
                        {sel && <Check size={14} style={{ color: '#6B0099' }} />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Posts */}
              {tab === 'POSTS' && (
                <div className="space-y-3">
                  <p className="text-[9px] opacity-30 uppercase tracking-widest font-bold">Enter a post ID or URL to embed an interactive post as a source</p>
                  <div className="flex gap-2">
                    <input
                      placeholder="Post ID or plajah.com/post/…"
                      className="flex-1 px-3 py-2 rounded-xl text-xs text-white outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val) {
                            const asset: ImportedAsset = { label: `Post: ${val.slice(0, 16)}`, url: `plajah://post/${val}`, type: 'POST', postId: val };
                            toggle(asset);
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                  </div>
                  <p className="text-[8px] opacity-20">Posts render as an HTML iframe source — the feed card, video, or image will appear in the switcher. Click interactions are forwarded to the post.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// Need Plus for hot folder add
function Plus({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}

export default TVStudioImportModal;
