import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, Check, Play, Share2, Trash2, Lock, Globe, Link2, Clock,
  ListVideo, Pencil, Loader2, ListPlus, ChevronLeft,
} from 'lucide-react';
import { Video, VideoPlaylist } from '../types';
import {
  fetchUserVideoPlaylists, createVideoPlaylist, addVideoToPlaylist, removeVideoFromPlaylist,
  updateVideoPlaylist, deleteVideoPlaylist, addToWatchLater, fetchVideoPlaylists,
  fetchVideoPlaylistById, fetchPlaylistVideos, auth,
} from '../services/backendService';
import { buildShareUrl, shareAsset } from '../services/deepLinkService';

const thumbFor = (v?: Partial<Video> | null): string => {
  if (!v) return '';
  if ((v as any).muxPlaybackId) return `https://image.mux.com/${(v as any).muxPlaybackId}/thumbnail.png?width=640&height=360&time=5`;
  return v.thumbnailUrl || (v as any).coverImageUrl || (v as any).coverImage || '';
};

const privacyOf = (p: VideoPlaylist): 'PUBLIC' | 'UNLISTED' | 'PRIVATE' =>
  p.unlisted ? 'UNLISTED' : (p.isPublic === false || p.isPrivate) ? 'PRIVATE' : 'PUBLIC';

const PrivacyBadge: React.FC<{ p: VideoPlaylist }> = ({ p }) => {
  const kind = privacyOf(p);
  const Icon = kind === 'PUBLIC' ? Globe : kind === 'UNLISTED' ? Link2 : Lock;
  return (
    <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/40">
      <Icon size={9} /> {kind.toLowerCase()}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Add-to-Playlist modal (YouTube "Save to…")
// ─────────────────────────────────────────────────────────────────────────────
export const AddToPlaylistModal: React.FC<{ video: Video; onClose: () => void }> = ({ video, onClose }) => {
  const [playlists, setPlaylists] = useState<VideoPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrivate, setNewPrivate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const uid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    setPlaylists(await fetchUserVideoPlaylists(uid));
    setLoading(false);
  }, [uid]);

  useEffect(() => { load(); }, [load]);

  const inPlaylist = (p: VideoPlaylist) => p.videoIds?.includes(video.id);

  const toggle = async (p: VideoPlaylist) => {
    setBusyId(p.id);
    try {
      if (inPlaylist(p)) {
        await removeVideoFromPlaylist(p.id, video.id);
        setPlaylists(prev => prev.map(x => x.id === p.id ? { ...x, videoIds: x.videoIds.filter(v => v !== video.id) } : x));
      } else {
        await addVideoToPlaylist(p.id, video);
        setPlaylists(prev => prev.map(x => x.id === p.id ? { ...x, videoIds: [...(x.videoIds || []), video.id] } : x));
        setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1200);
      }
    } finally { setBusyId(null); }
  };

  const watchLater = async () => {
    setBusyId('__wl'); try { await addToWatchLater(video); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1200); await load(); } finally { setBusyId(null); }
  };

  const create = async () => {
    if (!newTitle.trim()) return;
    setBusyId('__new');
    try {
      const pl = await createVideoPlaylist({ title: newTitle.trim(), isPublic: !newPrivate, isPrivate: newPrivate, videoIds: [] });
      if (pl) { await addVideoToPlaylist(pl.id, video); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1200); }
      setNewTitle(''); setCreating(false); await load();
    } finally { setBusyId(null); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-[#0d0d12] border border-white/10 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-white flex items-center gap-2"><ListPlus size={14} className="text-small-orange" /> Save to playlist</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={16} /></button>
        </div>

        {!uid ? (
          <p className="px-5 py-8 text-center text-[11px] text-white/40 uppercase tracking-widest">Sign in to save videos</p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto p-2">
            <button onClick={watchLater} disabled={busyId === '__wl'} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors text-left">
              <span className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center shrink-0"><Clock size={16} className="text-white/70" /></span>
              <span className="text-sm font-bold text-white flex-1">Watch Later</span>
              {busyId === '__wl' && <Loader2 size={14} className="animate-spin text-white/40" />}
            </button>

            <div className="h-px bg-white/8 my-1.5 mx-2" />

            {loading ? (
              <div className="py-8 flex justify-center"><Loader2 size={18} className="animate-spin text-white/30" /></div>
            ) : (
              playlists.filter(p => p.system !== 'WATCH_LATER').map(p => (
                <button key={p.id} onClick={() => toggle(p)} disabled={busyId === p.id} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left">
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${inPlaylist(p) ? 'bg-small-orange border-small-orange' : 'border-white/25'}`}>
                    {busyId === p.id ? <Loader2 size={11} className="animate-spin text-white" /> : inPlaylist(p) && <Check size={13} className="text-black" strokeWidth={3} />}
                  </span>
                  <span className="text-sm font-bold text-white flex-1 truncate">{p.title}</span>
                  <PrivacyBadge p={p} />
                </button>
              ))
            )}

            <div className="h-px bg-white/8 my-1.5 mx-2" />

            {creating ? (
              <div className="p-2 space-y-2">
                <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} placeholder="Playlist name" maxLength={140}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 ring-small-orange/50" />
                <div className="flex items-center justify-between">
                  <button onClick={() => setNewPrivate(v => !v)} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white">
                    {newPrivate ? <Lock size={11} /> : <Globe size={11} />} {newPrivate ? 'Private' : 'Public'}
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => { setCreating(false); setNewTitle(''); }} className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white">Cancel</button>
                    <button onClick={create} disabled={!newTitle.trim() || busyId === '__new'} className="px-4 py-1.5 rounded-full bg-small-orange text-black text-[9px] font-black uppercase tracking-widest disabled:opacity-30 flex items-center gap-1.5">
                      {busyId === '__new' && <Loader2 size={11} className="animate-spin" />} Create
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => setCreating(true)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-colors text-left text-small-orange">
                <Plus size={18} /> <span className="text-sm font-black uppercase tracking-widest">New playlist</span>
              </button>
            )}
          </div>
        )}

        {savedFlash && <div className="px-5 py-2.5 bg-small-orange/15 text-small-orange text-[10px] font-black uppercase tracking-widest text-center">✓ Saved</div>}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Playlist card
// ─────────────────────────────────────────────────────────────────────────────
const PlaylistCard: React.FC<{ p: VideoPlaylist; onOpen: () => void }> = ({ p, onOpen }) => (
  <button onClick={onOpen} className="group text-left">
    <div className="relative aspect-video rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10">
      {p.thumbnailUrl ? (
        <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      ) : (
        <div className="w-full h-full flex items-center justify-center"><ListVideo size={30} className="text-white/20" /></div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm text-[9px] font-black uppercase tracking-widest text-white flex items-center gap-1">
        <ListVideo size={10} /> {p.videoIds?.length || 0}
      </div>
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
        <span className="flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-[9px] font-black uppercase tracking-widest"><Play size={12} fill="currentColor" /> Play all</span>
      </div>
    </div>
    <p className="mt-2 text-sm font-black text-white truncate">{p.title}</p>
    <div className="flex items-center gap-2 mt-0.5"><PrivacyBadge p={p} /><span className="text-[8px] font-bold text-white/30 uppercase tracking-widest truncate">{p.ownerName || 'Playlist'}</span></div>
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// Playlists section (the Reello "Playlists" tab)
// ─────────────────────────────────────────────────────────────────────────────
export const VideoPlaylistSection: React.FC<{ onOpenPlaylist: (id: string) => void }> = ({ onOpenPlaylist }) => {
  const [mine, setMine] = useState<VideoPlaylist[]>([]);
  const [discover, setDiscover] = useState<VideoPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const uid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    setLoading(true);
    const [m, d] = await Promise.all([uid ? fetchUserVideoPlaylists(uid) : Promise.resolve([]), fetchVideoPlaylists()]);
    setMine(m);
    setDiscover(d.filter(p => p.ownerId !== uid && !p.unlisted));
    setLoading(false);
  }, [uid]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try { await createVideoPlaylist({ title: title.trim(), isPublic: !isPrivate, isPrivate, videoIds: [] }); setTitle(''); setCreating(false); await load(); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-white/30" /></div>;

  return (
    <div className="space-y-10 pt-2">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-2"><ListVideo size={18} className="text-small-orange" /> Your playlists</h2>
          {uid && !creating && (
            <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-small-orange text-black text-[9px] font-black uppercase tracking-widest hover:brightness-110">
              <Plus size={13} /> New playlist
            </button>
          )}
        </div>

        {creating && (
          <div className="mb-5 p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col sm:flex-row gap-3 sm:items-center">
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} placeholder="Playlist name" maxLength={140}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 ring-small-orange/50" />
            <button onClick={() => setIsPrivate(v => !v)} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white">
              {isPrivate ? <Lock size={12} /> : <Globe size={12} />} {isPrivate ? 'Private' : 'Public'}
            </button>
            <div className="flex gap-2">
              <button onClick={() => { setCreating(false); setTitle(''); }} className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white">Cancel</button>
              <button onClick={create} disabled={!title.trim() || busy} className="px-5 py-2.5 rounded-full bg-small-orange text-black text-[9px] font-black uppercase tracking-widest disabled:opacity-30 flex items-center gap-1.5">
                {busy && <Loader2 size={12} className="animate-spin" />} Create
              </button>
            </div>
          </div>
        )}

        {mine.length === 0 ? (
          <p className="text-[11px] text-white/30 uppercase tracking-widest py-8">{uid ? 'No playlists yet — create one, or add videos with the Save button.' : 'Sign in to build playlists.'}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
            {mine.map(p => <PlaylistCard key={p.id} p={p} onOpen={() => onOpenPlaylist(p.id)} />)}
          </div>
        )}
      </div>

      {discover.length > 0 && (
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest mb-4 flex items-center gap-2"><Globe size={18} className="text-small-orange" /> Discover playlists</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
            {discover.map(p => <PlaylistCard key={p.id} p={p} onOpen={() => onOpenPlaylist(p.id)} />)}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Playlist detail view (open one playlist)
// ─────────────────────────────────────────────────────────────────────────────
export const VideoPlaylistDetailView: React.FC<{
  playlistId: string;
  onBack: () => void;
  onPlayVideo: (video: Video) => void;
}> = ({ playlistId, onBack, onPlayVideo }) => {
  const [pl, setPl] = useState<VideoPlaylist | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ title: string; description: string; isPrivate: boolean; unlisted: boolean }>({ title: '', description: '', isPrivate: false, unlisted: false });
  const [shareFlash, setShareFlash] = useState('');
  const uid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    setLoading(true);
    const p = await fetchVideoPlaylistById(playlistId);
    setPl(p);
    if (p) {
      setDraft({ title: p.title, description: p.description || '', isPrivate: privacyOf(p) === 'PRIVATE', unlisted: !!p.unlisted });
      setVideos(await fetchPlaylistVideos(p.videoIds || []));
    }
    setLoading(false);
  }, [playlistId]);

  useEffect(() => { load(); }, [load]);

  const isOwner = !!pl && pl.ownerId === uid;

  const share = async () => {
    const res = await shareAsset('videoPlaylist', playlistId, { title: pl?.title, text: `Check out this playlist on Plajah` });
    setShareFlash(res === 'copied' ? 'Link copied' : res === 'shared' ? 'Shared' : 'Copy failed');
    setTimeout(() => setShareFlash(''), 1600);
  };

  const remove = async (videoId: string) => {
    await removeVideoFromPlaylist(playlistId, videoId);
    setVideos(prev => prev.filter(v => v.id !== videoId));
    setPl(prev => prev ? { ...prev, videoIds: prev.videoIds.filter(v => v !== videoId) } : prev);
  };

  const saveEdit = async () => {
    await updateVideoPlaylist(playlistId, {
      title: draft.title.trim() || 'Untitled',
      description: draft.description,
      isPrivate: draft.isPrivate,
      isPublic: !draft.isPrivate,
      unlisted: !draft.isPrivate && draft.unlisted,
    });
    setEditing(false);
    await load();
  };

  const del = async () => {
    if (!window.confirm('Delete this playlist? This cannot be undone.')) return;
    await deleteVideoPlaylist(playlistId);
    onBack();
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-white/30" /></div>;
  if (!pl) return (
    <div className="py-16 text-center">
      <p className="text-[11px] text-white/40 uppercase tracking-widest mb-4">Playlist not found or private</p>
      <button onClick={onBack} className="text-small-orange text-[10px] font-black uppercase tracking-widest">← Back</button>
    </div>
  );

  return (
    <div className="pt-2">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white mb-5"><ChevronLeft size={14} /> Back to playlists</button>

      <div className="flex flex-col md:flex-row gap-6 mb-8">
        <div className="w-full md:w-72 shrink-0">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10">
            {(pl.thumbnailUrl || thumbFor(videos[0])) ? (
              <img src={pl.thumbnailUrl || thumbFor(videos[0])} alt="" className="w-full h-full object-cover" />
            ) : <div className="w-full h-full flex items-center justify-center"><ListVideo size={34} className="text-white/20" /></div>}
            <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 text-[9px] font-black uppercase tracking-widest text-white flex items-center gap-1"><ListVideo size={10} /> {videos.length}</div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-3">
              <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} maxLength={140} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-lg font-black outline-none focus:ring-1 ring-small-orange/50" />
              <textarea value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} rows={2} placeholder="Add a description…" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none resize-none focus:ring-1 ring-small-orange/50" />
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setDraft(d => ({ ...d, isPrivate: false, unlisted: false }))} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border ${!draft.isPrivate && !draft.unlisted ? 'bg-white/10 border-white/30 text-white' : 'border-white/10 text-white/40'}`}><Globe size={11} /> Public</button>
                <button onClick={() => setDraft(d => ({ ...d, isPrivate: false, unlisted: true }))} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border ${!draft.isPrivate && draft.unlisted ? 'bg-white/10 border-white/30 text-white' : 'border-white/10 text-white/40'}`}><Link2 size={11} /> Unlisted</button>
                <button onClick={() => setDraft(d => ({ ...d, isPrivate: true }))} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border ${draft.isPrivate ? 'bg-white/10 border-white/30 text-white' : 'border-white/10 text-white/40'}`}><Lock size={11} /> Private</button>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveEdit} className="px-5 py-2 rounded-full bg-small-orange text-black text-[9px] font-black uppercase tracking-widest">Save</button>
                <button onClick={() => setEditing(false)} className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white break-words">{pl.title}</h1>
              <div className="flex items-center gap-3 mt-2"><PrivacyBadge p={pl} /><span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{pl.ownerName || 'Creator'} · {videos.length} video{videos.length === 1 ? '' : 's'}</span></div>
              {pl.description && <p className="text-sm text-white/60 mt-3 leading-relaxed">{pl.description}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-5">
                <button onClick={() => videos[0] && onPlayVideo(videos[0])} disabled={!videos.length} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black text-[9px] font-black uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all disabled:opacity-30"><Play size={14} fill="currentColor" /> Play all</button>
                <button onClick={share} className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white text-[9px] font-black uppercase tracking-widest"><Share2 size={14} /> {shareFlash || 'Share'}</button>
                {isOwner && pl.system !== 'WATCH_LATER' && <button onClick={() => setEditing(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white text-[9px] font-black uppercase tracking-widest"><Pencil size={14} /> Edit</button>}
                {isOwner && pl.system !== 'WATCH_LATER' && <button onClick={del} className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 bg-white/5 text-white/40 hover:text-rose-400 text-[9px] font-black uppercase tracking-widest"><Trash2 size={14} /></button>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Video list */}
      {videos.length === 0 ? (
        <p className="text-[11px] text-white/30 uppercase tracking-widest py-10 text-center">This playlist is empty. Add videos with the Save button on any video.</p>
      ) : (
        <div className="space-y-2">
          {videos.map((v, i) => (
            <div key={v.id} className="group flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.04] transition-colors">
              <span className="w-6 text-center text-[10px] font-black text-white/30 shrink-0">{i + 1}</span>
              <button onClick={() => onPlayVideo(v)} className="relative w-32 aspect-video rounded-lg overflow-hidden bg-white/5 shrink-0">
                {thumbFor(v) ? <img src={thumbFor(v)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Play size={16} className="text-white/30" /></div>}
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity"><Play size={18} className="text-white" fill="currentColor" /></span>
              </button>
              <button onClick={() => onPlayVideo(v)} className="flex-1 min-w-0 text-left">
                <p className="text-sm font-bold text-white truncate">{v.title}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">{v.artist || (v as any).ownerName || ''}</p>
              </button>
              {isOwner && <button onClick={() => remove(v.id)} title="Remove from playlist" className="p-2 rounded-full text-white/25 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
