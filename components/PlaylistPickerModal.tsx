import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Check, ListMusic, Loader2 } from 'lucide-react';
import { Track, Playlist } from '../types';
import { fetchPersonalPlaylists, createPlaylist, addTrackToPlaylist } from '../services/backendService';

interface PlaylistPickerModalProps {
  track: Track;
  onClose: () => void;
}

const PlaylistPickerModal: React.FC<PlaylistPickerModalProps> = ({ track, onClose }) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    fetchPersonalPlaylists().then(pl => {
      setPlaylists(pl);
      const alreadyIn = new Set(pl.filter(p => p.trackIds?.includes(track.id)).map(p => p.id));
      setAdded(alreadyIn);
      setLoading(false);
    });
  }, [track.id]);

  const handleAdd = async (playlist: Playlist) => {
    if (added.has(playlist.id)) return;
    setAdding(playlist.id);
    await addTrackToPlaylist(playlist.id, track);
    setAdded(prev => new Set([...prev, playlist.id]));
    setAdding(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const pl = await createPlaylist({ title: newName.trim(), trackIds: [] });
    if (pl) {
      await addTrackToPlaylist(pl.id, track);
      setPlaylists(prev => [pl, ...prev]);
      setAdded(prev => new Set([...prev, pl.id]));
    }
    setNewName('');
    setCreating(false);
  };

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
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mb-1">Add to Playlist</p>
              <h3 className="text-sm font-black uppercase tracking-widest truncate max-w-[200px]">{track.title}</h3>
            </div>
            <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
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
                const isAdded = added.has(pl.id);
                const isAdding = adding === pl.id;
                return (
                  <button
                    key={pl.id}
                    onClick={() => handleAdd(pl)}
                    disabled={isAdded || isAdding}
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/[0.04] transition-colors border-b border-white/[0.04] last:border-0 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
                      {pl.coverUrl || pl.coverImage
                        ? <img src={(pl.coverUrl || pl.coverImage) ?? undefined} className="w-full h-full object-cover" />
                        : <ListMusic size={14} className="text-white/20" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black uppercase tracking-widest truncate">{pl.title}</p>
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{pl.trackIds?.length || 0} tracks</p>
                    </div>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${isAdded ? 'bg-small-orange text-black' : 'bg-white/5'}`}>
                      {isAdding
                        ? <Loader2 size={10} className="animate-spin" />
                        : isAdded ? <Check size={10} /> : <Plus size={10} className="text-white/30" />
                      }
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PlaylistPickerModal;
