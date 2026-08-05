import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Bookmark, BookOpen, ExternalLink, Plus, ChevronRight,
  Tag, Check, Link2, Clock,
} from 'lucide-react';
import { Article } from '../types';
import { NotebookEntry, BookmarkSource } from './LabsNotebook';

const uid_short = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getStorageKey = (uid?: string) => `plajahNotebook_${uid ?? 'guest'}`;

const loadEntries = (uid?: string): NotebookEntry[] => {
  try {
    const s = localStorage.getItem(getStorageKey(uid));
    return s ? JSON.parse(s) : [];
  } catch { return []; }
};

const saveEntries = (entries: NotebookEntry[], uid?: string) => {
  try { localStorage.setItem(getStorageKey(uid), JSON.stringify(entries)); } catch {}
};

// ─── Recent bookmark card ─────────────────────────────────────────────────────
const BookmarkCard: React.FC<{ entry: NotebookEntry }> = ({ entry }) => (
  <div className="flex items-start gap-3 p-3 bg-white/[0.03] border border-white/8 rounded-2xl">
    {entry.bookmarkSource?.thumbnail && (
      <img
        src={entry.bookmarkSource.thumbnail}
        alt=""
        className="w-12 h-10 rounded-lg object-cover shrink-0"
        loading="lazy"
      />
    )}
    <div className="flex-1 min-w-0">
      <p className="text-[9px] font-black text-white/80 line-clamp-2 leading-tight">{entry.title || 'Untitled'}</p>
      {entry.bookmarkSource?.name && (
        <p className="text-[7px] font-black uppercase tracking-widest text-[#FF8C00]/70 mt-0.5">{entry.bookmarkSource.name}</p>
      )}
    </div>
    {entry.bookmarkSource?.url && entry.bookmarkSource.url !== '#' && (
      <a href={entry.bookmarkSource.url} target="_blank" rel="noreferrer"
        className="p-1 text-white/20 hover:text-white transition-colors shrink-0">
        <ExternalLink size={10} />
      </a>
    )}
  </div>
);

// ─── Main drawer ──────────────────────────────────────────────────────────────
interface Props {
  article: Article | null;     // article being bookmarked (null = view-only mode)
  currentUser: any;
  onClose: () => void;
  onOpenFull: () => void;
}

const ResearchDrawer: React.FC<Props> = ({ article, currentUser, onClose, onOpenFull }) => {
  const uid = currentUser?.uid as string | undefined;
  const [notes, setNotes]         = useState('');
  const [tagInput, setTagInput]   = useState('');
  const [tags, setTags]           = useState<string[]>([]);
  const [saved, setSaved]         = useState(false);
  const [recent, setRecent]       = useState<NotebookEntry[]>([]);

  // Load recent bookmarks
  useEffect(() => {
    const all = loadEntries(uid);
    setRecent(all.filter(e => e.type === 'LINK').slice(0, 5));
  }, [uid, saved]);

  // Pre-fill tags from article source
  useEffect(() => {
    if (article?.source) setTags([article.source.toLowerCase()]);
    setNotes('');
    setSaved(false);
  }, [article?.id]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags(p => [...p, t]);
    setTagInput('');
  };

  const handleSave = () => {
    if (!article) return;
    const source: BookmarkSource = {
      url: article.url ?? '#',
      thumbnail: article.imageUrl,
      name: article.source,
    };
    const entry: NotebookEntry = {
      id: uid_short(),
      type: 'LINK',
      title: article.title,
      content: notes,
      tags,
      bookmarkSource: source,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const existing = loadEntries(uid);
    saveEntries([entry, ...existing], uid);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8 shrink-0">
        <div className="w-7 h-7 rounded-xl bg-[#FF8C00]/12 border border-[#FF8C00]/25 flex items-center justify-center">
          <BookOpen size={13} className="text-[#FF8C00]" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-black text-white">Research Notebook</h2>
          <p className="text-[7px] text-white/25 uppercase tracking-widest">Quick save · bookmarks</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white transition-colors">
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Quick-save form (only if an article is provided) ── */}
        {article && (
          <div className="p-4 border-b border-white/6 space-y-3">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/35">Save to Notebook</p>

            {/* Article preview */}
            <div className="flex gap-3 p-3 bg-[#FF8C00]/5 border border-[#FF8C00]/15 rounded-2xl">
              {article.imageUrl && (
                <img src={article.imageUrl} alt="" className="w-16 h-12 rounded-xl object-cover shrink-0" loading="lazy" />
              )}
              <div className="flex-1 min-w-0">
                {article.source && (
                  <p className="text-[7px] font-black uppercase tracking-widest text-[#FF8C00] mb-1">{article.source}</p>
                )}
                <p className="text-[10px] font-black text-white/80 line-clamp-2 leading-tight">{article.title}</p>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[7px] font-black uppercase tracking-widest text-white/30 mb-1.5">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add your thoughts, highlights, or why this matters…"
                rows={3}
                className="w-full px-3 py-2 bg-white/[0.03] border border-white/8 rounded-xl text-xs text-white/80 placeholder:text-white/15 focus:outline-none focus:border-white/20 resize-none leading-relaxed"
              />
            </div>

            {/* Tags */}
            <div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(t => (
                  <span key={t} className="flex items-center gap-1 px-2 py-0.5 bg-[#FF8C00]/10 border border-[#FF8C00]/20 rounded-full text-[8px] font-black text-[#FF8C00]/70">
                    #{t}
                    <button onClick={() => setTags(p => p.filter(x => x !== t))}><X size={8} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                  placeholder="Add tag… (Enter)"
                  className="flex-1 px-3 py-1.5 bg-white/[0.03] border border-white/8 rounded-xl text-xs text-white placeholder:text-white/15 focus:outline-none"
                />
                <button onClick={addTag} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white/40 hover:text-white transition-all">
                  <Plus size={11} />
                </button>
              </div>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              className="w-full py-2.5 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              style={{ background: saved ? '#22c55e' : '#FF8C00', color: '#000' }}
            >
              {saved ? <><Check size={12} /> Saved!</> : <><Bookmark size={12} /> Save to Notebook</>}
            </button>
          </div>
        )}

        {/* ── Recent bookmarks ── */}
        <div className="p-4 space-y-3">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Recent Bookmarks</p>
          {recent.length === 0 ? (
            <div className="py-6 text-center">
              <Bookmark size={20} className="text-white/10 mx-auto mb-2" />
              <p className="text-[8px] text-white/20">No bookmarks yet</p>
              <p className="text-[7px] text-white/12 mt-1">Save articles from the Intelligence feed</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map(e => <BookmarkCard key={e.id} entry={e} />)}
            </div>
          )}
        </div>
      </div>

      {/* Footer — open full notebook */}
      <div className="px-4 py-3 border-t border-white/8 shrink-0">
        <button
          onClick={onOpenFull}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#6B0099]/30 to-[#FF8C00]/20 border border-[#FF8C00]/20 hover:border-[#FF8C00]/40 transition-all"
        >
          <div className="flex items-center gap-2">
            <BookOpen size={13} className="text-[#FF8C00]" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/70">Open Full Notebook</span>
          </div>
          <ChevronRight size={12} className="text-white/30" />
        </button>
      </div>
    </div>
  );
};

export default ResearchDrawer;
