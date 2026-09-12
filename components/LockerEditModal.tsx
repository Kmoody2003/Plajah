import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, Disc, Trash2, Check, Loader2 } from 'lucide-react';
import { Album, Playlist, Track } from '../types';
import { uploadFile, auth } from '../services/backendService';

interface LockerEditModalProps {
  item: Album | Playlist;
  tracks: Track[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: {
    title: string;
    artist?: string;
    genre?: string;
    coverUrl?: string;
    tracks: Track[];
  }) => Promise<void>;
  onConvertToPlaylist?: () => Promise<void>;
  onConvertToAlbum?: () => Promise<void>;
}

export const LockerEditModal: React.FC<LockerEditModalProps> = ({
  item,
  tracks: initialTracks,
  isOpen,
  onClose,
  onSave,
  onConvertToPlaylist,
  onConvertToAlbum,
}) => {
  const isPlaylist = 'trackIds' in item;
  const initialTitle = item.title || '';
  const initialArtist = (item as Album).artist || '';
  const initialGenre = (item as Album).genre || '';
  const initialCover = (item as Album).coverImage || (item as Playlist).coverUrl || '';

  const [title, setTitle] = useState(initialTitle);
  const [artist, setArtist] = useState(initialArtist);
  const [genre, setGenre] = useState(initialGenre);
  const [coverUrl, setCoverUrl] = useState(initialCover);
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  if (!isOpen) return null;

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    setIsUploadingCover(true);
    try {
      const url = await uploadFile(
        `personal/${auth.currentUser.uid}/covers/${Date.now()}_${file.name.replace(/[^a-z0-9.]/gi, '_')}`,
        file
      );
      setCoverUrl(url);
    } catch (err) {
      console.error('Failed to upload locker cover:', err);
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleTrackTitleChange = (index: number, newTitle: string) => {
    setTracks(prev => {
      const next = [...prev];
      next[index] = { ...next[index], title: newTitle };
      return next;
    });
  };

  const handleTrackArtistChange = (index: number, newArtist: string) => {
    setTracks(prev => {
      const next = [...prev];
      next[index] = { ...next[index], artist: newArtist };
      return next;
    });
  };

  const handleRemoveTrack = (trackId: string) => {
    setTracks(prev => prev.filter(t => t.id !== trackId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        artist: isPlaylist ? undefined : artist.trim(),
        genre: isPlaylist ? undefined : genre.trim(),
        coverUrl: coverUrl || undefined,
        tracks,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save locker changes:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-[#121118] border border-white/10 rounded-[2.5rem] shadow-3xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 sm:p-8 border-b border-white/10 shrink-0">
            <div>
              <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
                Edit {isPlaylist ? 'Playlist' : 'Locker Album'}
              </h3>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-0.5">
                Personal Vault Metadata • No commercial publishing
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {/* Cover Artwork */}
              <div className="flex flex-col items-center gap-3 shrink-0">
                <div className="relative w-36 h-36 rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center group shadow-xl">
                  {coverUrl ? (
                    <img src={coverUrl} alt="Cover art" className="w-full h-full object-cover" />
                  ) : (
                    <Disc size={44} className="text-white/20" />
                  )}
                  {isUploadingCover && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <Loader2 size={24} className="animate-spin text-small-orange" />
                    </div>
                  )}
                  <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity">
                    <Upload size={20} className="text-white mb-1" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-white">Change Art</span>
                    <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                  </label>
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Artwork</span>
              </div>

              {/* Title & Metadata fields */}
              <div className="flex-1 w-full space-y-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                    {isPlaylist ? 'Playlist Title' : 'Album Title'}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Title"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-small-orange transition-colors"
                  />
                </div>

                {!isPlaylist && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                        Artist / Compilation
                      </label>
                      <input
                        type="text"
                        value={artist}
                        onChange={e => setArtist(e.target.value)}
                        placeholder="Artist"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-small-orange transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                        Genre
                      </label>
                      <input
                        type="text"
                        value={genre}
                        onChange={e => setGenre(e.target.value)}
                        placeholder="Genre (optional)"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-small-orange transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* Conversion toggle buttons */}
                <div className="pt-2 flex items-center gap-3">
                  {!isPlaylist && onConvertToPlaylist && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm('Convert this album to a playlist?')) {
                          setIsSaving(true);
                          await onConvertToPlaylist();
                          setIsSaving(false);
                          onClose();
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 hover:text-white text-[9px] font-black uppercase tracking-widest transition-all"
                    >
                      Convert to Playlist
                    </button>
                  )}
                  {isPlaylist && onConvertToAlbum && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm('Convert this playlist to an album?')) {
                          setIsSaving(true);
                          await onConvertToAlbum();
                          setIsSaving(false);
                          onClose();
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 hover:text-white text-[9px] font-black uppercase tracking-widest transition-all"
                    >
                      Convert to Album
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Tracks List */}
            <div className="space-y-3 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-widest text-white/50">
                  Track List ({tracks.length})
                </h4>
                <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
                  Edit track titles & artists
                </span>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                {tracks.map((t, idx) => (
                  <div
                    key={t.id || idx}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/5"
                  >
                    <span className="text-[10px] font-black text-white/30 w-5 text-center shrink-0">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={t.title || ''}
                      onChange={e => handleTrackTitleChange(idx, e.target.value)}
                      placeholder="Track title"
                      className="flex-1 bg-transparent border-b border-transparent focus:border-white/20 outline-none text-xs font-bold text-white px-1 py-1"
                    />
                    <input
                      type="text"
                      value={t.artist || ''}
                      onChange={e => handleTrackArtistChange(idx, e.target.value)}
                      placeholder="Artist"
                      className="w-1/3 bg-transparent border-b border-transparent focus:border-white/20 outline-none text-[11px] font-medium text-white/60 px-1 py-1"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveTrack(t.id)}
                      className="p-1.5 text-white/20 hover:text-red-400 transition-colors"
                      title="Remove from list"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {tracks.length === 0 && (
                  <p className="text-center py-6 text-xs text-white/20 uppercase tracking-widest font-black">
                    No tracks in this collection
                  </p>
                )}
              </div>
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 sm:p-8 border-t border-white/10 bg-black/20 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-6 py-3 rounded-full bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving || !title.trim()}
              className="flex items-center gap-2 px-8 py-3 rounded-full bg-small-orange text-white font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default LockerEditModal;
