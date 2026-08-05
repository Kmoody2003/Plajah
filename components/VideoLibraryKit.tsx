import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, History, Heart, Users, Play, Trash2, Clock, X } from 'lucide-react';
import { Video, UserProfile } from '../types';
import {
  fetchFollowedArtists, fetchFollowedVideos, getLikedVideos, fetchVideoById, auth,
} from '../services/backendService';
import { loadHistory, removeEntry, clearHistory, WatchEntry } from '../services/watchHistoryService';

const thumbFor = (v?: Partial<Video> | null): string => {
  if (!v) return '';
  if ((v as any).muxPlaybackId) return `https://image.mux.com/${(v as any).muxPlaybackId}/thumbnail.png?width=640&height=360&time=5`;
  return v.thumbnailUrl || (v as any).coverImageUrl || (v as any).coverImage || '';
};

const fmtTime = (s: number) => {
  if (!s || s < 0) return '';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

// Compact video card used across the library sections.
const LibVideoCard: React.FC<{ video: Video; onPlay: () => void }> = ({ video, onPlay }) => (
  <button onClick={onPlay} className="group text-left">
    <div className="relative aspect-video rounded-xl overflow-hidden bg-white/[0.04] border border-white/10">
      {thumbFor(video)
        ? <img src={thumbFor(video)} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        : <div className="w-full h-full flex items-center justify-center"><Play size={22} className="text-white/20" /></div>}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity"><Play size={26} className="text-white" fill="currentColor" /></div>
    </div>
    <p className="mt-2 text-sm font-bold text-white truncate group-hover:text-small-orange transition-colors">{video.title}</p>
    <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5 truncate">{video.artist || (video as any).ownerName || ''}</p>
  </button>
);

const EmptyState: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="py-16 text-center space-y-3">
    <div className="flex justify-center opacity-20">{icon}</div>
    <p className="text-[11px] font-black uppercase tracking-widest text-white/30">{text}</p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Subscriptions — followed channels + a feed of their latest videos
// ─────────────────────────────────────────────────────────────────────────────
export const SubscriptionsSection: React.FC<{ onPlay: (v: Video) => void; onVisitUser?: (uid: string) => void }> = ({ onPlay, onVisitUser }) => {
  const [channels, setChannels] = useState<UserProfile[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    let on = true;
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    Promise.all([fetchFollowedArtists(uid).catch(() => []), fetchFollowedVideos(uid).catch(() => [])])
      .then(([ch, vids]) => { if (!on) return; setChannels(ch || []); setVideos(vids || []); setLoading(false); });
    return () => { on = false; };
  }, [uid]);

  if (loading) return <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-white/30" /></div>;
  if (!uid) return <EmptyState icon={<Users size={40} />} text="Sign in to see your subscriptions" />;

  return (
    <div className="space-y-8 pt-2">
      {channels.length > 0 && (
        <div>
          <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Your channels</h2>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {channels.map(c => (
              <button key={c.uid} onClick={() => onVisitUser?.(c.uid)} className="flex flex-col items-center gap-2 shrink-0 group w-16">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-white/10 border border-white/10 group-hover:border-small-orange/50 transition-all">
                  {c.photoURL ? <img src={c.photoURL} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Users size={18} className="text-white/30" /></div>}
                </div>
                <p className="text-[9px] font-bold text-white/60 truncate w-full text-center group-hover:text-white">{c.displayName || 'Creator'}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3">Latest from your subscriptions</h2>
        {videos.length === 0 ? (
          <EmptyState icon={<Users size={40} />} text={channels.length ? 'No recent uploads from your channels' : 'Follow creators to build your subscriptions feed'} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
            {videos.map(v => <LibVideoCard key={v.id} video={v} onPlay={() => onPlay(v)} />)}
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Liked videos — auto-list of everything the user thumbed up
// ─────────────────────────────────────────────────────────────────────────────
export const LikedVideosSection: React.FC<{ onPlay: (v: Video) => void }> = ({ onPlay }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    let on = true;
    if (!uid) { setLoading(false); return; }
    getLikedVideos(uid).then(v => { if (on) { setVideos(v); setLoading(false); } });
    return () => { on = false; };
  }, [uid]);

  if (loading) return <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-white/30" /></div>;
  if (!uid) return <EmptyState icon={<Heart size={40} />} text="Sign in to see your liked videos" />;

  return (
    <div className="pt-2">
      <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2"><Heart size={12} className="text-small-orange" /> Liked videos</h2>
      {videos.length === 0 ? (
        <EmptyState icon={<Heart size={40} />} text="Videos you like will appear here" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
          {videos.map(v => <LibVideoCard key={v.id} video={v} onPlay={() => onPlay(v)} />)}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Watch history — resumable list with per-item remove + clear all
// ─────────────────────────────────────────────────────────────────────────────
export const HistorySection: React.FC<{ onPlay: (v: Video) => void }> = ({ onPlay }) => {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    setLoading(true);
    // Video-style history only (Reello/uploads); Taleo/Chora have their own surfaces.
    const all = await loadHistory(200);
    setEntries(all.filter(e => e.kind === 'VIDEO' || e.kind === 'RELLO'));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const play = async (e: WatchEntry) => {
    const v = await fetchVideoById(e.id);
    if (v) onPlay(v);
  };

  const remove = async (id: string) => { await removeEntry(id); setEntries(prev => prev.filter(e => e.id !== id)); };
  const clearAll = async () => { if (!window.confirm('Clear your entire watch history?')) return; await clearHistory(); setEntries([]); };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-white/30" /></div>;

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2"><History size={12} className="text-small-orange" /> Watch history</h2>
        {entries.length > 0 && <button onClick={clearAll} className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-rose-400 flex items-center gap-1"><Trash2 size={11} /> Clear all</button>}
      </div>
      {!uid && <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3">Signed out — history is stored on this device only.</p>}
      {entries.length === 0 ? (
        <EmptyState icon={<History size={40} />} text="Nothing watched yet" />
      ) : (
        <div className="space-y-2">
          {entries.map(e => {
            const pct = e.durationSec > 0 ? Math.min(100, (e.positionSec / e.durationSec) * 100) : 0;
            return (
              <div key={e.id} className="group flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.04] transition-colors">
                <button onClick={() => play(e)} className="relative w-32 aspect-video rounded-lg overflow-hidden bg-white/5 shrink-0">
                  {e.thumbnailUrl ? <img src={e.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><Play size={16} className="text-white/30" /></div>}
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity"><Play size={18} className="text-white" fill="currentColor" /></span>
                  {pct > 0 && <span className="absolute bottom-0 left-0 h-0.5 bg-small-orange" style={{ width: `${pct}%` }} />}
                </button>
                <button onClick={() => play(e)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-bold text-white truncate">{e.title || 'Video'}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5 flex items-center gap-2 flex-wrap">
                    {e.ownerName && <span className="truncate">{e.ownerName}</span>}
                    {e.completed ? <span className="text-emerald-400/70">Watched</span> : pct > 0 && <span className="flex items-center gap-1"><Clock size={9} /> {fmtTime(e.positionSec)} / {fmtTime(e.durationSec)}</span>}
                  </p>
                </button>
                <button onClick={() => remove(e.id)} title="Remove from history" className="p-2 rounded-full text-white/25 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"><X size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
