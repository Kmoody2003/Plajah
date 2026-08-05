import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, Users, Globe, Lock, Check, X, ChevronRight, Loader2,
  MessageSquare, ChevronDown,
} from 'lucide-react';
import { createClub, joinClub, fetchUserAlbums, updateAlbum, auth } from '../services/backendService';
import type { Album, Club } from '../types';

interface Props {
  preselectedBookId?: string;
  onClose: () => void;
  onCreated?: (club: Club) => void;
}

export default function BookClubCreator({ preselectedBookId, onClose, onCreated }: Props) {
  const [books, setBooks]             = useState<Album[]>([]);
  const [selectedBookId, setSelectedBookId] = useState(preselectedBookId ?? '');
  const [clubName, setClubName]       = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate]     = useState(false);
  const [monthlyPrice, setMonthlyPrice] = useState('0');
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [done, setDone]               = useState(false);
  const [createdClub, setCreatedClub] = useState<Club | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchUserAlbums(auth.currentUser.uid).then(a => {
      const b = a.filter(x => x.type === 'BOOK');
      setBooks(b);
      if (!preselectedBookId && b.length > 0) {
        setSelectedBookId(b[0].id);
        setClubName(`${b[0].title} Book Club`);
      } else if (preselectedBookId) {
        const book = b.find(x => x.id === preselectedBookId);
        if (book) setClubName(`${book.title} Book Club`);
      }
      setLoading(false);
    });
  }, []);

  const book = books.find(b => b.id === selectedBookId);

  const handleCreate = async () => {
    if (!book || !clubName.trim() || submitting || !auth.currentUser) return;
    setSubmitting(true);
    try {
      const club = await createClub({
        name: clubName.trim(),
        description: description.trim() || `Official book club for "${book.title}".`,
        category: 'Book Club',
        tags: [book.genre || 'Fiction', 'Book Club', book.title],
        isPrivate,
        joinProcess: 'AUTO',
        type: 'CLUB',
        allowedAssetTypes: ['ARTICLE', 'LINK', 'PHOTO'],
        linksAllowed: true,
        hasLiveChat: true,
        hasMerchStore: false,
        hasExclusiveEvents: true,
        monthlyPrice: parseFloat(monthlyPrice) > 0 ? parseFloat(monthlyPrice) : undefined,
        linkedBookId: book.id,
        memberCount: 1,
      });

      if (club) {
        await joinClub(club.id, 'OWNER');
        setCreatedClub(club);
        setDone(true);
        onCreated?.(club);
      }
    } catch (err) {
      console.error('[BookClubCreator]', err);
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full bg-white/5 border border-white/8 rounded-2xl px-5 py-3.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all';
  const labelCls = 'block text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-2';

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-[#0d0d0d] border border-white/8 rounded-[2.5rem] flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="px-8 pt-8 pb-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/12">
              <BookOpen size={18} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-white">Create Book Club</h3>
              {book && <p className="text-[9px] text-white/25 font-black uppercase tracking-widest">{book.title}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white/20 hover:text-white transition-colors rounded-xl"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-7">
          {done && createdClub ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-5 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Check size={28} className="text-amber-400" />
              </div>
              <p className="text-base font-black uppercase tracking-tight text-white">{createdClub.name}</p>
              <p className="text-[10px] text-white/30">Book club created. Members can discuss chapters and join live Q&As.</p>
              <button onClick={onClose}
                className="px-8 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-amber-400 text-black hover:scale-105 transition-all">
                Done
              </button>
            </motion.div>
          ) : (
            <div className="space-y-5">
              {/* Book selector */}
              {!preselectedBookId && books.length > 1 && (
                <div>
                  <label className={labelCls}>Select book</label>
                  <div className="relative">
                    <select value={selectedBookId} onChange={e => {
                      setSelectedBookId(e.target.value);
                      const b = books.find(x => x.id === e.target.value);
                      if (b) setClubName(`${b.title} Book Club`);
                    }} className={`${inputCls} appearance-none pr-10`}>
                      {books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </select>
                    <ChevronDown size={13} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  </div>
                </div>
              )}

              {books.length === 0 && !loading && (
                <div className="py-8 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No books found</p>
                  <p className="text-[9px] text-white/12 mt-1">Create a book first in Book Studio</p>
                </div>
              )}

              <div>
                <label className={labelCls}>Club name</label>
                <input value={clubName} onChange={e => setClubName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Description (optional)</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                  placeholder="What's this club about?" className={`${inputCls} resize-none`} />
              </div>

              {/* Privacy */}
              <div className="flex gap-3">
                {[{ val: false, label: 'Public', icon: <Globe size={13} /> }, { val: true, label: 'Private', icon: <Lock size={13} /> }].map(opt => (
                  <button key={String(opt.val)} onClick={() => setIsPrivate(opt.val)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border transition-all text-[9px] font-black uppercase tracking-widest"
                    style={{
                      background:  isPrivate === opt.val ? 'rgba(245,158,11,0.10)' : 'rgba(255,255,255,0.02)',
                      borderColor: isPrivate === opt.val ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.07)',
                      color:       isPrivate === opt.val ? '#f59e0b' : 'rgba(255,255,255,0.3)',
                    }}>
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>

              {/* Optional paid membership */}
              <div>
                <label className={labelCls}>Monthly membership price (0 = free)</label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                  <input type="number" min="0" step="0.01" value={monthlyPrice}
                    onChange={e => setMonthlyPrice(e.target.value)} className={`${inputCls} pl-9`} />
                </div>
              </div>
            </div>
          )}
        </div>

        {!done && (
          <div className="px-8 pb-8 pt-4 border-t border-white/5 flex items-center justify-end gap-3 flex-shrink-0">
            <button onClick={onClose} className="px-5 py-2.5 text-[9px] font-black uppercase tracking-widest text-white/25 hover:text-white transition-all">Cancel</button>
            <button onClick={handleCreate} disabled={!book || !clubName.trim() || submitting}
              className="flex items-center gap-1.5 px-7 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-amber-400 text-black hover:scale-105 active:scale-95 transition-all disabled:opacity-30">
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <><Check size={12} /> Create Club</>}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
