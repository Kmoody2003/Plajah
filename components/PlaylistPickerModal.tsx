import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Check, Minus, ListMusic, Loader2 } from 'lucide-react';
import { Track, Playlist } from '../types';
import {
  fetchPersonalPlaylists,
  createPlaylist,
  addTracksToPlaylist,
  removeTracksFromPlaylist,
} from '../services/backendService';

interface PlaylistPickerModalProps {
  /** Single-track convenience prop (back-compat). */
  track?: Track;
  /** Multi-track selection — takes precedence over `track` when provided. */
  tracks?: Track[];
  onClose: () => void;
  /** Fired after a successful add/remove so callers can refresh / clear selection. */
  onDone?: () => void;
}

type Membership = 'none' | 'some' | 'all';

const PlaylistPickerModal: React.FC<PlaylistPickerModalProps> = ({ track, tracks, onClose, onDone }) => {
  const items = useMemo<Track[]>(
    () => (tracks && tracks.length ? tracks : track ? [track] : []),
    [tracks, track],
  );
  const itemIds = useMemo(() => new Set(items.map(t => t.id)), [items]);
  const multi = items.length > 1;

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    fetchPersonalPlaylists().then(pl => {
      setPlaylists(pl);
      setLoading(false);
    });
  }, []);

  // How many of the selected tracks live in a given playlist.
  const membership = (pl: Playlist): { count: number; state: Membership } => {
    const ids = pl.trackIds || [];
    const count = ids.filter(id => itemIds.has(id)).length;
    const state: Membership = count === 0 ? 'none' : count >= items.length ? 'all' : 'some';
    return { count, state };
  };

  // Optimistically patch a playlist's trackIds in local state.
  const patchPlaylist = (id: string, addIds: string[], removeIds: string[]) => {
    setPlaylists(prev => prev.map(p => {
      if (p.id !== id) return p;
      const next = new Set(p.trackIds || []);
      addIds.forEach(x => next.add(x));
      removeIds.forEach(x => next.delete(x));
      return { ...p, trackIds: Array.from(next) };
    }));
  };

  const handleToggle = async (pl: Playlist) => {
    if (busy || items.length === 0) return;
    const { state } = membership(pl);
    setBusy(pl.id);
    if (state === 'all') {
      // Everything selected is already in — tapping removes them all.
      await removeTracksFromPlaylist(pl.id, items.map(t => t.id));
      patchPlaylist(pl.id, [], items.map(t => t.id));
    } else {
      // Add the missing ones.
      await addTracksToPlaylist(pl.id, items);
      patchPlaylist(pl.id, items.map(t => t.id), []);
    }
    setBusy(null);
    onDone?.();
  };

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    const pl = await createPlaylist({ title: newName.trim(), trackIds: [] });
    if (pl) {
      await addTracksToPlaylist(pl.id, items);
      const seeded = { ...pl, trackIds: items.map(t => t.id) };
      setPlaylists(prev => [seeded, ...prev]);
      onDone?.();
    }
    setNewName('');
    setCreating(false);
  };

  const heading = multi
    ? `${items.length} songs`
    : items[0]?.title || 'Track';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-sm bg-[#0f0f0f] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/5">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mb-1">
                {multi ? 'Add / remove songs' : 'Add to Playlist'}
              </p>
              <h3 className="text-sm font-black uppercase tracking-widest truncate max-w-[220px]">{heading}</h3>
            </div>
            <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors shrink-0">
              <X size={14} />
            </button>
          </div>

          {/* Create new */}
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="New playlist name..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold placeholder:text-white/20 outline-none focus:border-small-orange/50 transition-colors"
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="p-2 rounded-xl bg-small-orange text-black disabled:opacity-40 transition-opacity"
                title="Create playlist with these songs"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              </button>
            </div>
          </div>

          {/* Playlist list */}
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-white/20" />
              </div>
            ) : playlists.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-white/20">
                <ListMusic size={28} className="mb-3" />
                <p className="text-[10px] font-black uppercase tracking-widest">No playlists yet</p>
              </div>
            ) : (
              playlists.map(pl => {
                const { count, state } = membership(pl);
                const isBusy = busy === pl.id;
                return (
                  <button
                    key={pl.id}
                    onClick={() => handleToggle(pl)}
                    disabled={isBusy}
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/[0.04] transition-colors border-b border-white/[0.04] last:border-0 text-left disabled:opacity-60"
                  >
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
                      {pl.coverUrl || pl.coverImage
                        ? <img src={(pl.coverUrl || pl.coverImage) ?? undefined} className="w-full h-full object-cover" />
                        : <ListMusic size={14} className="text-white/20" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black uppercase tracking-widest truncate">{pl.title}</p>
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
                        {pl.trackIds?.length || 0} tracks
                        {multi && state === 'some' && ` · ${count}/${items.length} here`}
                      </p>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        state === 'all' ? 'bg-small-orange text-black'
                        : state === 'some' ? 'bg-small-orange/30 text-small-orange'
                        : 'bg-white/5'
                      }`}
                      title={multi && state === 'all' ? 'Tap to remove all' : 'Tap to add'}
                    >
                      {isBusy
                        ? <Loader2 size={10} className="animate-spin" />
                        : state === 'all' ? <Check size={10} />
                        : state === 'some' ? <Minus size={10} />
                        : <Plus size={10} className="text-white/30" />
                      }
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {multi && (
            <div className="px-5 py-3 border-t border-white/5 text-center">
              <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest">
                Tap a playlist to add these songs · tap again to remove them
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PlaylistPickerModal;
