// AmboNewAudioPlaylistModal.tsx — Modal dialog to create an Audio Playlist in Ambo & Chora
import React, { useState } from 'react';
import { X, ListMusic, Plus, Sparkles, FolderPlus } from 'lucide-react';

export interface AmboAudioPlaylist {
  id: string;
  title: string;
  description?: string;
  category?: string;
  trackIds: string[];
  createdAt: number;
  /** 'chora' = a personal playlist from the Chora service (edits sync back). */
  source?: 'local' | 'chora';
  /** Track snapshots, so a playlist resolves before (or without) the catalog — and local files keep their titles. */
  tracks?: Array<{ id?: string; title: string; artist?: string; url?: string; duration?: number | string; coverImage?: string; key?: string; bpm?: number; category?: string; source?: 'chora' | 'local' | 'audius' }>;
}

interface AmboNewAudioPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePlaylist: (playlist: AmboAudioPlaylist) => void;
}

export const AmboNewAudioPlaylistModal: React.FC<AmboNewAudioPlaylistModalProps> = ({
  isOpen,
  onClose,
  onCreatePlaylist,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Worship Anthems');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newPlaylist: AmboAudioPlaylist = {
      id: `ap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim(),
      description: description.trim(),
      category,
      trackIds: [],
      createdAt: Date.now(),
    };

    onCreatePlaylist(newPlaylist);
    setTitle('');
    setDescription('');
    onClose();
  };

  const categories = [
    'Worship Anthems',
    'Prelude & Walk-In Music',
    'Communion & Meditation',
    'Offertory & Giving',
    'Postlude & Dismissal',
    'Youth & Contemporary',
    'Choral & Traditional',
    'Special Events',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#0F0A1C] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D0BCFF]/15 text-[#D0BCFF] flex items-center justify-center">
              <FolderPlus size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Create Audio Playlist</h3>
              <p className="text-[10px] text-white/50">Crate songs from Chora or local library for service playback</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-white/70">
              Playlist Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Sunday Morning Prelude, Walk-In Music..."
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#D0BCFF] focus:bg-white/10 text-white text-xs outline-none transition-all placeholder:text-white/30"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-white/70">
              Category
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#1A1429] border border-white/10 focus:border-[#D0BCFF] text-white text-xs outline-none transition-all cursor-pointer"
            >
              {categories.map(c => (
                <option key={c} value={c} className="bg-[#1A1429] text-white">
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-white/70">
              Notes / Description (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Order of service details, bpm notes, or instructions..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#D0BCFF] focus:bg-white/10 text-white text-xs outline-none transition-all resize-none placeholder:text-white/30"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-5 py-2 rounded-xl text-xs font-bold text-black bg-[#D0BCFF] hover:bg-[#D0BCFF]/90 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center gap-1.5 shadow-lg shadow-[#D0BCFF]/20"
            >
              <Plus size={14} />
              <span>Create Playlist</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AmboNewAudioPlaylistModal;
