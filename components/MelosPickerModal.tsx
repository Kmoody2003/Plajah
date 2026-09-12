import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Layers, Plus, Check, Loader2, Disc } from 'lucide-react';
import { Track } from '../types';
import { auth } from '../services/backendService';
import {
  fetchMyProductions,
  createProduction,
  putSong,
  uid,
  type MelosProduction,
  type MelosSong,
} from '../services/melosService';

interface MelosPickerModalProps {
  tracks: Track[];
  onClose: () => void;
  onDone?: () => void;
}

export const MelosPickerModal: React.FC<MelosPickerModalProps> = ({
  tracks,
  onClose,
  onDone,
}) => {
  const [productions, setProductions] = useState<MelosProduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }
    fetchMyProductions(auth.currentUser.uid).then(list => {
      setProductions(list);
      setLoading(false);
    });
  }, []);

  const handleAddToProduction = async (prod: MelosProduction) => {
    if (!auth.currentUser || busy) return;
    setBusy(prod.id);
    try {
      for (const t of tracks) {
        const song: MelosSong = {
          id: uid('s'),
          title: t.title || 'Untitled Song',
          workingTitle: t.title,
          state: 'DEMO',
          commitment: 'WORKING_ON_IT',
          love: 3,
          confidence: 70,
          lyrics: [],
          takes: t.url ? [{ id: uid('take'), title: 'Locker Master', url: t.url, createdAt: Date.now() }] : [],
          trackRef: t.url ? { url: t.url, durationSec: (t as any).duration || 0 } : undefined,
          credits: t.artist ? [{ id: uid('cred'), name: t.artist, role: 'Artist' }] : [],
          sampleIds: [],
          images: t.albumCover ? [t.albumCover] : [],
          tags: ['from_locker'],
          order: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await putSong(prod.id, song);
      }
      setStatusMessage(`Added ${tracks.length} track${tracks.length !== 1 ? 's' : ''} to "${prod.title}"!`);
      setTimeout(() => {
        onDone?.();
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Failed to add tracks to Melos production:', err);
    } finally {
      setBusy(null);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newTitle.trim() || !auth.currentUser || creating) return;
    setCreating(true);
    try {
      const prod = await createProduction(auth.currentUser.uid, {
        title: newTitle.trim(),
      });
      if (prod) {
        setProductions(prev => [prod, ...prev]);
        setNewTitle('');
        await handleAddToProduction(prod);
      }
    } catch (err) {
      console.error('Failed to create Melos project:', err);
    } finally {
      setCreating(false);
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
          className="w-full max-w-lg bg-[#121118] border border-white/10 rounded-[2.5rem] p-6 sm:p-8 shadow-3xl flex flex-col max-h-[85vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-6 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/10 text-purple-400 rounded-2xl border border-purple-500/20">
                <Layers size={20} />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-white">
                  Add to Melos Project
                </h3>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-0.5">
                  Import {tracks.length} track{tracks.length !== 1 ? 's' : ''} into DAW & Studio
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* New Project Input */}
          <div className="py-4 border-b border-white/10 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="New Melos Project Name..."
                onKeyDown={e => { if (e.key === 'Enter') handleCreateAndAdd(); }}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-white outline-none focus:border-purple-400 transition-colors"
              />
              <button
                type="button"
                onClick={handleCreateAndAdd}
                disabled={!newTitle.trim() || creating}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
              >
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Create & Add
              </button>
            </div>
          </div>

          {/* Status Alert */}
          {statusMessage && (
            <div className="mt-3 p-3 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-bold flex items-center gap-2">
              <Check size={16} />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Existing Projects List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-2">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center opacity-40">
                <Loader2 size={24} className="animate-spin text-white mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest">Loading Projects…</p>
              </div>
            ) : productions.length === 0 ? (
              <div className="py-12 text-center opacity-30">
                <Layers size={36} className="mx-auto mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest">No Melos projects found</p>
                <p className="text-[8px] mt-1">Create one above to start tracking this record.</p>
              </div>
            ) : (
              productions.map(prod => (
                <button
                  key={prod.id}
                  onClick={() => handleAddToProduction(prod)}
                  disabled={!!busy}
                  className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-purple-500/30 hover:bg-white/[0.06] transition-all text-left group disabled:opacity-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden shrink-0 border border-white/10">
                      {prod.coverImage ? (
                        <img src={prod.coverImage} alt={prod.title} className="w-full h-full object-cover" />
                      ) : (
                        <Disc size={18} className="text-white/20" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black uppercase tracking-wider text-white truncate group-hover:text-purple-300 transition-colors">
                        {prod.title}
                      </h4>
                      <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-0.5">
                        {prod.status} • {new Date(prod.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 pl-3">
                    {busy === prod.id ? (
                      <Loader2 size={16} className="animate-spin text-purple-400" />
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-white/5 group-hover:bg-purple-500/20 group-hover:text-purple-300 text-white/50 transition-colors">
                        Add
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default MelosPickerModal;
