import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft, ChevronRight, Music2, Film, Share2, BookOpen,
  Calendar, Globe, User, Plus, Edit3, Trash2, X, Check, ExternalLink,
  Clock, Award, Sparkles, ArrowLeft,
} from 'lucide-react';
import { MUSIC_FIGURES, FILM_FIGURES, getDailyFigure, HistoryFigure } from '../services/historyData';
import { auth, db } from '../services/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';

interface HistoryMomentsViewProps {
  category: 'MUSIC' | 'FILM_TV';
  onBack: () => void;
  user: any;
}

interface CustomMoment {
  id: string;
  name: string;
  subcategory: string;
  nationality: string;
  era: string;
  lifespan: string;
  bio: string;
  imageUrl: string;
  keyWorks: Array<{ title: string; year: number; notes?: string }>;
  quote?: string;
  tags: string[];
  category: 'MUSIC' | 'FILM_TV';
  authorId: string;
  authorName: string;
  createdAt: number;
}

// ── Wikipedia live fetch ───────────────────────────────────────────────────────
async function fetchWikiSummary(title: string): Promise<{ extract: string; thumbnail?: string } | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { extract: data.extract, thumbnail: data.thumbnail?.source };
  } catch {
    return null;
  }
}

// ── Era badge color ────────────────────────────────────────────────────────────
const ERA_GRADIENT: Record<string, string> = {
  Baroque: 'from-purple-800 to-purple-600',
  Classical: 'from-blue-800 to-blue-600',
  Romantic: 'from-amber-700 to-orange-600',
  Impressionist: 'from-cyan-700 to-teal-600',
  Modern: 'from-emerald-700 to-green-600',
  Jazz: 'from-yellow-700 to-amber-600',
  Blues: 'from-indigo-700 to-blue-600',
  Ragtime: 'from-orange-700 to-red-600',
  Silent: 'from-slate-700 to-slate-500',
  Golden: 'from-yellow-800 to-amber-700',
  European: 'from-rose-800 to-pink-700',
  Italian: 'from-green-800 to-teal-700',
  Soviet: 'from-red-800 to-red-600',
  German: 'from-stone-700 to-stone-500',
};

function getEraGradient(era: string): string {
  for (const key of Object.keys(ERA_GRADIENT)) {
    if (era.includes(key)) return ERA_GRADIENT[key];
  }
  return 'from-violet-800 to-purple-600';
}

// ── Share helper ───────────────────────────────────────────────────────────────
function shareFigure(figure: HistoryFigure) {
  const text = `Today in history: ${figure.name} (${figure.lifespan}) — ${figure.subcategory} | Plajah History Moments`;
  if (navigator.share) {
    navigator.share({ title: figure.name, text });
  } else {
    navigator.clipboard.writeText(text);
  }
}

// ── Authoring Modal ────────────────────────────────────────────────────────────
const AuthoringModal: React.FC<{
  category: 'MUSIC' | 'FILM_TV';
  user: any;
  onClose: () => void;
  onSaved: () => void;
}> = ({ category, user, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: '', subcategory: '', nationality: '', era: '',
    lifespan: '', bio: '', imageUrl: '', quote: '', tags: '',
    work1Title: '', work1Year: '', work1Notes: '',
    work2Title: '', work2Year: '',
    work3Title: '', work3Year: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim() || !form.bio.trim()) return;
    setSaving(true);
    try {
      const moment: Omit<CustomMoment, 'id'> = {
        name: form.name.trim(),
        subcategory: form.subcategory.trim() || 'Artist',
        nationality: form.nationality.trim() || 'Unknown',
        era: form.era.trim() || 'Contemporary',
        lifespan: form.lifespan.trim() || '',
        bio: form.bio.trim(),
        imageUrl: form.imageUrl.trim(),
        keyWorks: [
          form.work1Title ? { title: form.work1Title, year: parseInt(form.work1Year) || 0, notes: form.work1Notes || undefined } : null,
          form.work2Title ? { title: form.work2Title, year: parseInt(form.work2Year) || 0 } : null,
          form.work3Title ? { title: form.work3Title, year: parseInt(form.work3Year) || 0 } : null,
        ].filter(Boolean) as CustomMoment['keyWorks'],
        quote: form.quote.trim() || undefined,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        category,
        authorId: user.uid,
        authorName: user.displayName || 'Staff',
        createdAt: Date.now(),
      };
      await addDoc(collection(db, 'history_moments'), moment);
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, textarea = false, placeholder = '') => (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-black uppercase tracking-widest text-white/40">{label}</label>
      {textarea ? (
        <textarea
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          rows={4}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 resize-none focus:outline-none focus:border-purple-500/60"
        />
      ) : (
        <input
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/60"
        />
      )}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-[#12101a] border border-white/10 rounded-[2rem] p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-black text-white">Add History Moment</h2>
            <p className="text-xs text-white/40">{category === 'MUSIC' ? 'Chora' : 'Taleo'} — published to the platform's daily cycle</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><X size={14} /></button>
        </div>

        <div className="flex flex-col gap-4">
          {field('Full Name *', 'name', false, 'e.g. Nina Simone')}
          <div className="grid grid-cols-2 gap-3">
            {field('Role / Subcategory', 'subcategory', false, 'e.g. Pianist & Vocalist')}
            {field('Nationality', 'nationality', false, 'e.g. American')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('Era', 'era', false, 'e.g. Civil Rights Era')}
            {field('Lifespan', 'lifespan', false, 'e.g. 1933 – 2003')}
          </div>
          {field('Biography *', 'bio', true, 'Write a rich, factual biography...')}
          {field('Portrait Image URL', 'imageUrl', false, 'https://...')}
          {field('Notable Quote', 'quote', false, '"A quote in their words..."')}
          {field('Tags (comma-separated)', 'tags', false, 'jazz, piano, civil-rights')}

          <div className="border-t border-white/10 pt-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">Key Works</p>
            <div className="flex flex-col gap-3">
              {[['work1Title', 'work1Year', 'work1Notes'], ['work2Title', 'work2Year'], ['work3Title', 'work3Year']].map(([t, y, n], i) => (
                <div key={i} className={`grid gap-2 ${n ? 'grid-cols-[2fr_1fr_2fr]' : 'grid-cols-[2fr_1fr]'}`}>
                  <input value={form[t as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [t]: e.target.value }))} placeholder={`Work ${i + 1} title`} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none" />
                  <input value={form[y as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [y]: e.target.value }))} placeholder="Year" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none" />
                  {n && <input value={form[n as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [n]: e.target.value }))} placeholder="Notes (optional)" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none" />}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.bio.trim()}
              className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-2xl text-xs font-black uppercase tracking-widest text-white transition-all flex items-center justify-center gap-2"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={14} />}
              Publish Moment
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Main View ──────────────────────────────────────────────────────────────────
const HistoryMomentsView: React.FC<HistoryMomentsViewProps> = ({ category, onBack, user }) => {
  const dataset = category === 'MUSIC' ? MUSIC_FIGURES : FILM_FIGURES;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const todayIndex = Math.floor(Date.now() / DAY_MS) % dataset.length;

  const [index, setIndex] = useState(todayIndex);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [wikiData, setWikiData] = useState<{ extract?: string; thumbnail?: string } | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [showAuthoring, setShowAuthoring] = useState(false);
  const [customMoments, setCustomMoments] = useState<CustomMoment[]>([]);
  const [browsing, setBrowsing] = useState<'curated' | 'custom'>('curated');
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const isStaff = user?.uid && (user?.email?.includes('@plajah') || false);

  const allItems: HistoryFigure[] = browsing === 'curated' ? dataset : customMoments.map(m => ({
    ...m,
    eraColor: '#7C3AED',
    birthYear: 0,
    tags: m.tags,
    wikiTitle: m.name.replace(/ /g, '_'),
  }));

  const figure = allItems[Math.min(index, allItems.length - 1)] || dataset[0];

  // Load custom moments from Firestore
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'history_moments'), orderBy('createdAt', 'desc')));
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomMoment)).filter(m => m.category === category);
        setCustomMoments(items);
      } catch { /* no moments yet */ }
    };
    load();
  }, [category]);

  // Fetch Wikipedia live data for current figure
  useEffect(() => {
    setWikiData(null);
    setWikiLoading(true);
    setImgError(false);
    const wikiTitle = (figure as any).wikiTitle;
    if (!wikiTitle) { setWikiLoading(false); return; }
    fetchWikiSummary(wikiTitle).then(data => {
      setWikiData(data);
      setWikiLoading(false);
    });
  }, [figure.id ?? figure.name]);

  const navigate = useCallback((dir: 1 | -1) => {
    setDirection(dir);
    setIndex(prev => {
      const next = prev + dir;
      if (next < 0) return allItems.length - 1;
      if (next >= allItems.length) return 0;
      return next;
    });
  }, [allItems.length]);

  const isToday = browsing === 'curated' && index === todayIndex;
  const bioText = wikiData?.extract || figure.bio;
  const imageUrl = (wikiData?.thumbnail && !imgError) ? wikiData.thumbnail : figure.imageUrl;

  const handleShare = () => {
    const text = `Today in Plajah History: ${figure.name} (${figure.lifespan}) — ${figure.subcategory}`;
    if (navigator.share) {
      navigator.share({ title: figure.name, text, url: window.location.href });
    } else {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const categoryLabel = category === 'MUSIC' ? 'Chora' : 'Taleo';
  const CategoryIcon = category === 'MUSIC' ? Music2 : Film;

  return (
    <div className="min-h-screen bg-black/60 backdrop-blur-sm text-white">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all">
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <CategoryIcon size={14} className="text-purple-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{categoryLabel}</span>
            <span className="text-white/20">·</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">History Moments</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Browse mode toggle */}
          <div className="flex items-center bg-white/5 rounded-full p-0.5 border border-white/10">
            {(['curated', 'custom'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => { setBrowsing(mode); setIndex(0); }}
                className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${browsing === mode ? 'bg-purple-600 text-white' : 'text-white/40'}`}
              >
                {mode === 'curated' ? 'Archive' : 'Community'}
              </button>
            ))}
          </div>
          {(isStaff || user) && (
            <button
              onClick={() => setShowAuthoring(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 rounded-full text-[9px] font-black uppercase tracking-widest text-purple-400 hover:bg-purple-600/40 transition-all"
            >
              <Plus size={11} /> Author
            </button>
          )}
        </div>
      </div>

      {allItems.length === 0 && browsing === 'custom' ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
          <div className="w-20 h-20 rounded-[1.5rem] bg-purple-900/30 border border-purple-500/20 flex items-center justify-center">
            <BookOpen size={32} className="text-purple-400/60" />
          </div>
          <p className="text-white/40 text-sm font-black uppercase tracking-widest">No community moments yet</p>
          {user && (
            <button
              onClick={() => setShowAuthoring(true)}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
            >
              Be the First to Add One
            </button>
          )}
        </div>
      ) : (
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={figure.id ?? (figure.name + index)}
            custom={direction}
            initial={{ opacity: 0, x: direction * 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -direction * 80 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="max-w-6xl mx-auto"
          >
            {/* Today badge */}
            {isToday && (
              <div className="px-6 pt-6 pb-0">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-full">
                  <Sparkles size={11} className="text-amber-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">Today's Figure — {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            )}

            {/* Main content — side by side on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-0 lg:gap-8 p-4 lg:p-8">
              {/* Portrait */}
              <div className="relative">
                <div className="relative rounded-[2rem] overflow-hidden aspect-[3/4] lg:aspect-auto lg:h-[600px] shadow-2xl">
                  {imageUrl && !imgError ? (
                    <img
                      src={imageUrl}
                      alt={figure.name}
                      onError={() => setImgError(true)}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${getEraGradient(figure.era)} flex items-center justify-center`}>
                      <User size={80} className="text-white/20" />
                    </div>
                  )}
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a0812] via-transparent to-transparent" />
                  {/* Image credit */}
                  {figure.imageCredit && (
                    <p className="absolute bottom-3 left-3 text-[8px] text-white/30 font-medium">{figure.imageCredit}</p>
                  )}
                </div>

                {/* Era badge */}
                <div className={`absolute top-4 left-4 px-3 py-1 rounded-full bg-gradient-to-r ${getEraGradient(figure.era)} shadow-lg`}>
                  <span className="text-[9px] font-black uppercase tracking-widest text-white">{figure.era}</span>
                </div>

                {/* Navigation buttons */}
                <div className="absolute bottom-6 right-4 flex gap-2">
                  <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-black/60 backdrop-blur border border-white/20 flex items-center justify-center hover:bg-black/80 transition-all">
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={() => navigate(1)} className="w-10 h-10 rounded-full bg-black/60 backdrop-blur border border-white/20 flex items-center justify-center hover:bg-black/80 transition-all">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="flex flex-col gap-6 py-2 lg:py-0">
                {/* Name & meta */}
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="text-3xl lg:text-4xl font-black text-white leading-tight">{figure.name}</h1>
                      <p className="text-purple-400 font-bold text-base mt-1">{figure.subcategory}</p>
                    </div>
                    <button
                      onClick={handleShare}
                      className="shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all"
                    >
                      {copied ? <Check size={16} className="text-green-400" /> : <Share2 size={16} />}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full text-[9px] font-black uppercase tracking-widest text-white/60">
                      <Clock size={10} />{figure.lifespan}
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full text-[9px] font-black uppercase tracking-widest text-white/60">
                      <Globe size={10} />{figure.nationality}
                    </span>
                  </div>
                </div>

                {/* Bio */}
                <div>
                  {wikiLoading && (
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 border border-purple-400/40 border-t-purple-400 rounded-full animate-spin" />
                      <span className="text-[9px] text-white/30">Loading live data from Wikipedia…</span>
                    </div>
                  )}
                  <p className="text-white/70 text-sm leading-relaxed">{bioText}</p>
                  {wikiData?.extract && (
                    <a
                      href={`https://en.wikipedia.org/wiki/${encodeURIComponent((figure as any).wikiTitle || figure.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-[9px] text-white/30 hover:text-white/60 transition-colors"
                    >
                      <ExternalLink size={9} /> Source: Wikipedia
                    </a>
                  )}
                </div>

                {/* Quote */}
                {figure.quote && (
                  <blockquote className="border-l-2 border-purple-500/60 pl-4 py-1">
                    <p className="text-white/80 italic text-sm leading-relaxed">"{figure.quote}"</p>
                    <p className="text-white/30 text-[10px] mt-1">— {figure.name}</p>
                  </blockquote>
                )}

                {/* Key Works */}
                {figure.keyWorks && figure.keyWorks.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Award size={13} className="text-amber-400" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">Notable Works</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {figure.keyWorks.map((work, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + i * 0.06 }}
                          className="flex items-start gap-3 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl"
                        >
                          <span className="text-[9px] font-black text-amber-400/60 mt-0.5 min-w-[32px]">{work.year || '—'}</span>
                          <div>
                            <p className="text-sm font-bold text-white">{work.title}</p>
                            {work.notes && <p className="text-[10px] text-white/40 mt-0.5">{work.notes}</p>}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {figure.tags && figure.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {figure.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 bg-purple-900/30 border border-purple-500/20 rounded-full text-[8px] font-black uppercase tracking-widest text-purple-400/70">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Figure index dots */}
            <div className="flex justify-center gap-1.5 pb-8">
              {allItems.slice(0, 12).map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setDirection(i > index ? 1 : -1); setIndex(i); }}
                  className={`h-1.5 rounded-full transition-all ${i === Math.min(index, allItems.length - 1) ? 'w-6 bg-purple-400' : 'w-1.5 bg-white/20'}`}
                />
              ))}
              {allItems.length > 12 && <span className="text-[9px] text-white/30 ml-1">+{allItems.length - 12}</span>}
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Authoring modal */}
      <AnimatePresence>
        {showAuthoring && (
          <AuthoringModal
            category={category}
            user={user}
            onClose={() => setShowAuthoring(false)}
            onSaved={async () => {
              const snap = await getDocs(query(collection(db, 'history_moments'), orderBy('createdAt', 'desc')));
              const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomMoment)).filter(m => m.category === category);
              setCustomMoments(items);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default HistoryMomentsView;
