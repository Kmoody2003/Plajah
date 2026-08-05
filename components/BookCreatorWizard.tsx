import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, ChevronRight, ChevronLeft, Check, X, Plus, Trash2,
  Sparkles, DollarSign, Calendar, Lock, Globe, Star, Mic2,
  AlarmClock, Zap, Users as UsersIcon,
} from 'lucide-react';
import type { Album, BookChapter } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'FORMAT' | 'DETAILS' | 'MONETIZE' | 'CHAPTERS' | 'RELEASE' | 'PREVIEW';
type BookFormat = 'NOVEL' | 'SERIAL' | 'GRAPHIC_NOVEL' | 'NON_FICTION' | 'TEXTBOOK' | 'ZINE'
  | 'FEATURE_FILM' | 'TV_PILOT' | 'TV_EPISODE' | 'SHORT_FILM' | 'WEB_SERIES' | 'STAGE_PLAY';
type MonetizeModel = 'FREE' | 'FULL_PURCHASE' | 'CHAPTER_UNLOCK' | 'SUBSCRIPTION';
type ReleaseModel = 'NOW' | 'SCHEDULED' | 'SERIAL' | 'EARLY_ACCESS';

const STEPS: Step[] = ['FORMAT', 'DETAILS', 'MONETIZE', 'CHAPTERS', 'RELEASE', 'PREVIEW'];
const STEP_LABELS = ['Format', 'Details', 'Monetize', 'Chapters', 'Release', 'Launch'];

const GENRES = ['Literary Fiction', 'Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Thriller', 'Horror',
  'Non-Fiction', 'Biography', 'Self-Help', 'Comics', 'Graphic Novel', 'Manga', 'Academic', 'Other'];

const FORMAT_OPTIONS: { id: BookFormat; label: string; desc: string; icon: string; isScript?: boolean }[] = [
  { id: 'NOVEL',         label: 'Novel',          desc: 'Full-length prose fiction or narrative', icon: '📖' },
  { id: 'SERIAL',        label: 'Serial Fiction',  desc: 'Weekly/scheduled chapter drops',         icon: '📋' },
  { id: 'GRAPHIC_NOVEL', label: 'Graphic Novel',   desc: 'Comics, manga, webtoon-style pages',     icon: '🎨' },
  { id: 'NON_FICTION',   label: 'Non-Fiction',     desc: 'Essays, journalism, memoirs',             icon: '📰' },
  { id: 'TEXTBOOK',      label: 'Textbook',        desc: 'Educational reference or course book',   icon: '🎓' },
  { id: 'ZINE',          label: 'Zine / Chapbook', desc: 'Short-form self-published booklet',       icon: '📎' },
  // ── Scripts ───────────────────────────────────────────────────────────────
  { id: 'FEATURE_FILM',  label: 'Feature Film',    desc: 'Full feature screenplay (90–120 pages)',  icon: '🎬', isScript: true },
  { id: 'TV_PILOT',      label: 'TV Pilot',        desc: 'Series pilot — one-hour or half-hour',   icon: '📺', isScript: true },
  { id: 'TV_EPISODE',    label: 'TV Episode',      desc: 'Spec or produced episode script',         icon: '📡', isScript: true },
  { id: 'SHORT_FILM',    label: 'Short Film',      desc: 'Short-form screenplay (under 30 pages)',  icon: '🎞', isScript: true },
  { id: 'WEB_SERIES',    label: 'Web Series',      desc: 'Episode scripts for online-first shows', icon: '🌐', isScript: true },
  { id: 'STAGE_PLAY',    label: 'Stage Play',      desc: 'Theatre script with stage directions',   icon: '🎭', isScript: true },
];

const MONETIZE_OPTIONS: { id: MonetizeModel; label: string; desc: string; badge?: string; color: string }[] = [
  { id: 'FREE',           label: 'Free',             desc: 'Open to all readers — no paywall',                       color: '#22c55e', badge: 'Max Reach'    },
  { id: 'FULL_PURCHASE',  label: 'Full Purchase',    desc: 'One price for the entire book',                          color: '#FF8C00', badge: 'Most Common'  },
  { id: 'CHAPTER_UNLOCK', label: 'Per-Chapter',      desc: 'Free preview chapters, paid unlocks for the rest',       color: '#818cf8'                         },
  { id: 'SUBSCRIPTION',   label: 'Fan Subscription', desc: 'Gate chapters behind your fan club membership',          color: '#f472b6', badge: 'Substack-like' },
];

const RELEASE_OPTIONS: { id: ReleaseModel; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'NOW',          label: 'Publish Now',      desc: 'All available chapters go live immediately',                 icon: <Zap size={14} />       },
  { id: 'SERIAL',       label: 'Serial Schedule',  desc: 'Drop chapters on a recurring schedule (weekly/bi-weekly)',  icon: <AlarmClock size={14} /> },
  { id: 'SCHEDULED',    label: 'Future Launch',    desc: 'Set a public launch date with a countdown page',            icon: <Calendar size={14} />   },
  { id: 'EARLY_ACCESS', label: 'Early Access',     desc: 'Send review copies to press/fans with unique codes',        icon: <Star size={14} />       },
];

// ── Shared sub-components ─────────────────────────────────────────────────────

function OptionCard({ selected, onClick, color = '#FF8C00', children }: {
  selected: boolean; onClick: () => void; color?: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className="w-full text-left p-4 rounded-2xl border transition-all"
      style={{
        background:  selected ? `${color}10` : 'rgba(255,255,255,0.02)',
        borderColor: selected ? `${color}35` : 'rgba(255,255,255,0.07)',
      }}>
      {children}
    </button>
  );
}

// ── Step components ────────────────────────────────────────────────────────────

function StepFormat({ value, onChange }: { value: BookFormat | null; onChange: (v: BookFormat) => void }) {
  const books   = FORMAT_OPTIONS.filter(o => !o.isScript);
  const scripts = FORMAT_OPTIONS.filter(o =>  o.isScript);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">Books &amp; Publishing</p>
        <div className="grid grid-cols-2 gap-3">
          {books.map(opt => (
            <OptionCard key={opt.id} selected={value === opt.id} onClick={() => onChange(opt.id)}>
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">{opt.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-black uppercase tracking-widest ${value === opt.id ? 'text-white' : 'text-white/40'}`}>{opt.label}</p>
                  <p className="text-[9px] text-white/25 mt-0.5 leading-snug">{opt.desc}</p>
                </div>
                {value === opt.id && <Check size={11} className="text-[#FF8C00] flex-shrink-0 mt-0.5" />}
              </div>
            </OptionCard>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">Scripts — Film &amp; TV</p>
        <div className="grid grid-cols-2 gap-3">
          {scripts.map(opt => (
            <OptionCard key={opt.id} selected={value === opt.id} onClick={() => onChange(opt.id)} color="#6366f1">
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">{opt.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-black uppercase tracking-widest ${value === opt.id ? 'text-white' : 'text-white/40'}`}>{opt.label}</p>
                  <p className="text-[9px] text-white/25 mt-0.5 leading-snug">{opt.desc}</p>
                  {opt.isScript && <p className="text-[8px] text-indigo-400/60 mt-0.5 font-black uppercase tracking-widest">Opens Script Studio</p>}
                </div>
                {value === opt.id && <Check size={11} className="text-indigo-400 flex-shrink-0 mt-0.5" />}
              </div>
            </OptionCard>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepDetails({ title, setTitle, author, setAuthor, genre, setGenre, synopsis, setSynopsis, hasAudio, setHasAudio }: {
  title: string; setTitle: (v: string) => void;
  author: string; setAuthor: (v: string) => void;
  genre: string; setGenre: (v: string) => void;
  synopsis: string; setSynopsis: (v: string) => void;
  hasAudio: boolean; setHasAudio: (v: boolean) => void;
}) {
  const inputCls = 'w-full bg-white/5 border border-white/8 rounded-2xl px-5 py-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all';
  const labelCls = 'block text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-2';
  return (
    <div className="space-y-4">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-5">About your book</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={labelCls}>Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Book title" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Author *</label>
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author name" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Genre *</label>
          <select value={genre} onChange={e => setGenre(e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
            <option value="">Select genre</option>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Synopsis</label>
          <textarea value={synopsis} onChange={e => setSynopsis(e.target.value)} rows={3}
            placeholder="Brief description of your book…" className={`${inputCls} resize-none`} />
        </div>
      </div>
      <button onClick={() => setHasAudio(!hasAudio)}
        className="flex items-center gap-3 p-4 rounded-2xl border transition-all w-full text-left"
        style={{
          background:  hasAudio ? 'rgba(129,140,248,0.06)' : 'rgba(255,255,255,0.02)',
          borderColor: hasAudio ? 'rgba(129,140,248,0.25)' : 'rgba(255,255,255,0.07)',
        }}>
        <Mic2 size={14} className={hasAudio ? 'text-violet-400' : 'text-white/20'} />
        <div className="flex-1">
          <p className={`text-xs font-black uppercase tracking-widest ${hasAudio ? 'text-white' : 'text-white/35'}`}>Includes Audio Narration</p>
          <p className="text-[9px] text-white/20">Each chapter will have an audiobook track upload slot</p>
        </div>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${hasAudio ? 'border-violet-400 bg-violet-400' : 'border-white/15'}`}>
          {hasAudio && <Check size={9} className="text-black" />}
        </div>
      </button>
    </div>
  );
}

function StepMonetize({ value, onChange, bookPrice, setBookPrice }: {
  value: MonetizeModel | null; onChange: (v: MonetizeModel) => void;
  bookPrice: string; setBookPrice: (v: string) => void;
}) {
  const inputCls = 'bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-white/20 transition-all';
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-5">How will readers access your book?</p>
      {MONETIZE_OPTIONS.map(opt => (
        <OptionCard key={opt.id} selected={value === opt.id} onClick={() => onChange(opt.id)} color={opt.color}>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-xs font-black uppercase tracking-widest ${value === opt.id ? 'text-white' : 'text-white/40'}`}>{opt.label}</p>
                {opt.badge && <span className="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                  style={{ background: `${opt.color}18`, color: opt.color }}>{opt.badge}</span>}
              </div>
              <p className="text-[9px] text-white/25 mt-0.5">{opt.desc}</p>
            </div>
            {value === opt.id && <Check size={11} style={{ color: opt.color }} className="flex-shrink-0 mt-0.5" />}
          </div>
          {value === opt.id && (opt.id === 'FULL_PURCHASE') && (
            <div className="mt-3 pt-3 border-t border-white/8" onClick={e => e.stopPropagation()}>
              <label className="block text-[8px] font-black uppercase tracking-widest text-white/25 mb-1.5">Book price (USD)</label>
              <div className="relative w-36">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                <input type="number" min="0" step="0.01" value={bookPrice} onChange={e => setBookPrice(e.target.value)}
                  className={`${inputCls} pl-7 w-full`} placeholder="9.99" />
              </div>
            </div>
          )}
        </OptionCard>
      ))}
    </div>
  );
}

function StepChapters({ chapters, setChapters, format }: {
  chapters: Partial<BookChapter>[]; setChapters: (v: Partial<BookChapter>[]) => void;
  format: BookFormat | null;
}) {
  const addChapter = () => setChapters([...chapters, {
    id: `ch_${Date.now()}`,
    title: `Chapter ${chapters.length + 1}`,
    format: format === 'GRAPHIC_NOVEL' ? 'COMIC' : 'TXT',
    isPaywalled: false,
    price: 0,
  }]);
  const removeChapter = (i: number) => setChapters(chapters.filter((_, idx) => idx !== i));
  const updateChapter = (i: number, patch: Partial<BookChapter>) =>
    setChapters(chapters.map((c, idx) => idx === i ? { ...c, ...patch } : c));

  const inputCls = 'bg-white/5 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Chapters ({chapters.length})</p>
        <button onClick={addChapter}
          className="flex items-center gap-1 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-white/8 text-white/40 hover:text-white transition-all">
          <Plus size={11} /> Add Chapter
        </button>
      </div>
      {chapters.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-3 border-2 border-dashed border-white/5 rounded-[2rem]">
          <BookOpen size={22} className="text-white/12" />
          <p className="text-[9px] text-white/20 font-black uppercase tracking-widest">Add your first chapter above</p>
          <p className="text-[8px] text-white/12">You can also add chapters in the full creator after launch</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {chapters.map((ch, i) => (
            <div key={ch.id || i} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
              <span className="text-[10px] font-black text-white/20 w-5 text-right flex-shrink-0">{i + 1}</span>
              <input value={ch.title || ''} onChange={e => updateChapter(i, { title: e.target.value })}
                placeholder={`Chapter ${i + 1}`} className={`${inputCls} flex-1`} />
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-white/20">$</span>
                <input type="number" min="0" step="0.01" value={ch.price || ''}
                  onChange={e => updateChapter(i, { price: parseFloat(e.target.value) || 0, isPaywalled: parseFloat(e.target.value) > 0 })}
                  placeholder="Free" className={`${inputCls} w-16 text-center`} />
              </div>
              <button onClick={() => removeChapter(i)} className="text-white/15 hover:text-red-400 transition-all">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[8px] text-white/18">Chapters with price &gt; 0 will be paywalled. Leave at $0 for free preview chapters.</p>
    </div>
  );
}

function StepRelease({ value, onChange, scheduledDate, setScheduledDate }: {
  value: ReleaseModel | null; onChange: (v: ReleaseModel) => void;
  scheduledDate: string; setScheduledDate: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-5">When and how do you release?</p>
      {RELEASE_OPTIONS.map(opt => (
        <OptionCard key={opt.id} selected={value === opt.id} onClick={() => onChange(opt.id)}>
          <div className="flex items-center gap-3">
            <span className={value === opt.id ? 'text-[#FF8C00]' : 'text-white/20'}>{opt.icon}</span>
            <div className="flex-1">
              <p className={`text-xs font-black uppercase tracking-widest ${value === opt.id ? 'text-white' : 'text-white/40'}`}>{opt.label}</p>
              <p className="text-[9px] text-white/25 mt-0.5">{opt.desc}</p>
            </div>
            {value === opt.id && <Check size={11} className="text-[#FF8C00] flex-shrink-0" />}
          </div>
          {value === opt.id && opt.id === 'SCHEDULED' && (
            <div className="mt-3 pt-3 border-t border-white/8" onClick={e => e.stopPropagation()}>
              <input type="datetime-local" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white outline-none" />
            </div>
          )}
        </OptionCard>
      ))}
    </div>
  );
}

function StepPreview({ format, title, author, genre, monetize, release, chapterCount, hasAudio }: {
  format: BookFormat | null; title: string; author: string; genre: string;
  monetize: MonetizeModel | null; release: ReleaseModel | null;
  chapterCount: number; hasAudio: boolean;
}) {
  const fmt = FORMAT_OPTIONS.find(f => f.id === format);
  const mon = MONETIZE_OPTIONS.find(m => m.id === monetize);
  const rel = RELEASE_OPTIONS.find(r => r.id === release);

  return (
    <div className="space-y-5">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Review your book setup</p>
      <div className="p-6 rounded-3xl border border-white/8 bg-white/[0.02] space-y-4">
        <div className="flex items-start gap-4">
          <span className="text-3xl flex-shrink-0">{fmt?.icon ?? '📖'}</span>
          <div>
            <h3 className="text-lg font-black uppercase tracking-tight text-white leading-none">{title || 'Untitled'}</h3>
            <p className="text-[11px] text-white/40 mt-1">by {author || '—'} · {genre || '—'} · {fmt?.label}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: mon?.label ?? 'Free', color: mon?.color ?? '#22c55e' },
            { label: rel?.label ?? 'Now', color: '#818cf8' },
            { label: `${chapterCount} chapter${chapterCount !== 1 ? 's' : ''}`, color: '#38bdf8' },
            ...(hasAudio ? [{ label: 'Audiobook', color: '#f472b6' }] : []),
          ].map((chip, i) => (
            <span key={i} className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest"
              style={{ background: `${chip.color}12`, color: chip.color, border: `1px solid ${chip.color}25` }}>
              {chip.label}
            </span>
          ))}
        </div>
      </div>
      <div className="p-4 rounded-2xl bg-[#FF8C00]/6 border border-[#FF8C00]/15">
        <p className="text-[9px] font-black uppercase tracking-widest text-[#FF8C00] mb-2">What happens next</p>
        <ul className="space-y-1.5">
          {[
            'Full Creator opens — upload your chapter files (PDF, EPUB, text)',
            hasAudio ? 'Each chapter has an audio narration upload slot' : null,
            release === 'SERIAL' ? 'Set drop schedule per chapter in Serial Scheduler' : null,
            release === 'SCHEDULED' ? 'Countdown page auto-generates for your launch date' : null,
            release === 'EARLY_ACCESS' ? 'Create press review codes after publishing' : null,
          ].filter(Boolean).map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-[#FF8C00]/20 text-[#FF8C00] text-[7px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <span className="text-[9px] text-white/45">{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Main wizard ────────────────────────────────────────────────────────────────

interface Props {
  onLaunchCreator: (albumPartial: Partial<Album>) => void;
  onCancel: () => void;
  onOpenScriptStudio?: (format: string) => void;
}

const SCRIPT_FORMATS = new Set(['FEATURE_FILM', 'TV_PILOT', 'TV_EPISODE', 'SHORT_FILM', 'WEB_SERIES', 'STAGE_PLAY']);

export default function BookCreatorWizard({ onLaunchCreator, onCancel, onOpenScriptStudio }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [dir, setDir]             = useState(1);
  const [format, setFormat]       = useState<BookFormat | null>(null);
  const [title, setTitle]         = useState('');
  const [author, setAuthor]       = useState('');
  const [genre, setGenre]         = useState('');
  const [synopsis, setSynopsis]   = useState('');
  const [hasAudio, setHasAudio]   = useState(false);
  const [monetize, setMonetize]   = useState<MonetizeModel | null>(null);
  const [bookPrice, setBookPrice] = useState('9.99');
  const [chapters, setChapters]   = useState<Partial<BookChapter>[]>([]);
  const [release, setRelease]     = useState<ReleaseModel | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');

  const currentStep = STEPS[stepIndex];

  const canAdvance = () => {
    if (currentStep === 'FORMAT')   return !!format;
    if (currentStep === 'DETAILS')  return !!title.trim() && !!author.trim() && !!genre;
    if (currentStep === 'MONETIZE') return !!monetize;
    if (currentStep === 'RELEASE')  return !!release;
    return true;
  };

  const advance = () => { if (!canAdvance()) return; setDir(1); setStepIndex(i => Math.min(i + 1, STEPS.length - 1)); };
  const back    = () => { setDir(-1); setStepIndex(i => Math.max(i - 1, 0)); };

  const handleLaunch = () => {
    // Script formats open the dedicated Script Writing Studio instead
    if (format && SCRIPT_FORMATS.has(format)) {
      onOpenScriptStudio?.(format);
      onCancel();
      return;
    }
    const isFree = monetize === 'FREE';
    const albumPartial: Partial<Album> = {
      type: 'BOOK',
      subType: format === 'GRAPHIC_NOVEL' ? 'GRAPHIC_NOVEL' : 'NOVEL',
      title,
      artist: author,
      genre,
      description: synopsis,
      isPaywalled: !isFree && monetize === 'FULL_PURCHASE',
      price: monetize === 'FULL_PURCHASE' ? parseFloat(bookPrice) || 0 : 0,
      isScheduled: release === 'SCHEDULED',
      releaseDate: release === 'SCHEDULED' && scheduledDate ? new Date(scheduledDate).getTime() : undefined,
      earlyAccessEnabled: release === 'EARLY_ACCESS',
      bookChapters: chapters as BookChapter[],
      tags: [genre, format ?? '', 'book'].filter(Boolean),
    };
    onLaunchCreator(albumPartial);
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-xl bg-[#0d0d0d] border border-white/8 rounded-[2.5rem] flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/12">
              <BookOpen size={18} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-white">Book Studio</h2>
              <p className="text-[9px] text-white/25 font-black uppercase tracking-widest">Publication Setup</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 text-white/20 hover:text-white transition-colors rounded-xl"><X size={16} /></button>
        </div>

        {/* Step progress */}
        <div className="px-8 py-4 flex items-center gap-1.5 border-b border-white/5 flex-shrink-0">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="w-5 h-5 rounded-full flex items-center justify-center transition-all"
                  style={{
                    background: i < stepIndex ? '#f59e0b' : i === stepIndex ? '#fff' : 'rgba(255,255,255,0.08)',
                    color: i <= stepIndex ? '#000' : 'rgba(255,255,255,0.2)',
                    fontSize: 8, fontWeight: 900,
                  }}>
                  {i < stepIndex ? <Check size={9} /> : i + 1}
                </div>
                <span className={`text-[8px] font-black uppercase tracking-widest hidden sm:block ${i === stepIndex ? 'text-white' : i < stepIndex ? 'text-amber-400' : 'text-white/15'}`}>
                  {STEP_LABELS[i]}
                </span>
              </div>
              {i < STEPS.length - 1 && <div className="flex-1 h-px" style={{ background: i < stepIndex ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.07)' }} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step body */}
        <div className="flex-1 overflow-y-auto px-8 py-7">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={currentStep} initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -dir * 24 }} transition={{ duration: 0.2 }}>
              {currentStep === 'FORMAT'   && <StepFormat value={format} onChange={setFormat} />}
              {currentStep === 'DETAILS'  && <StepDetails title={title} setTitle={setTitle} author={author} setAuthor={setAuthor}
                genre={genre} setGenre={setGenre} synopsis={synopsis} setSynopsis={setSynopsis}
                hasAudio={hasAudio} setHasAudio={setHasAudio} />}
              {currentStep === 'MONETIZE' && <StepMonetize value={monetize} onChange={setMonetize}
                bookPrice={bookPrice} setBookPrice={setBookPrice} />}
              {currentStep === 'CHAPTERS' && <StepChapters chapters={chapters} setChapters={setChapters} format={format} />}
              {currentStep === 'RELEASE'  && <StepRelease value={release} onChange={setRelease}
                scheduledDate={scheduledDate} setScheduledDate={setScheduledDate} />}
              {currentStep === 'PREVIEW'  && <StepPreview format={format} title={title} author={author}
                genre={genre} monetize={monetize} release={release}
                chapterCount={chapters.length} hasAudio={hasAudio} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 pt-4 border-t border-white/5 flex items-center justify-between flex-shrink-0">
          <button onClick={back} disabled={stepIndex === 0}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white/25 hover:text-white transition-all disabled:opacity-0">
            <ChevronLeft size={12} /> Back
          </button>
          {currentStep !== 'PREVIEW' ? (
            <button onClick={advance} disabled={!canAdvance()}
              className="flex items-center gap-1.5 px-7 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-25 disabled:scale-100"
              style={{ background: canAdvance() ? '#f59e0b' : 'rgba(255,255,255,0.08)', color: canAdvance() ? '#000' : 'rgba(255,255,255,0.2)' }}>
              Continue <ChevronRight size={12} />
            </button>
          ) : (
            <button onClick={handleLaunch}
              className="flex items-center gap-1.5 px-7 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-amber-400 text-black hover:scale-105 active:scale-95 transition-all">
              <Sparkles size={12} /> Open Creator
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
