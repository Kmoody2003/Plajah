import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Film, Tv, Clock, Camera, DollarSign, Calendar, Lock,
  Radio, Ticket, Users, ChevronRight, ChevronLeft, Check, X,
  Sparkles, Globe, Play, Clapperboard, Tag, AlarmClock, Shield,
  Zap, ShoppingBag, Star,
} from 'lucide-react';
import type { Album } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardStep = 'FORMAT' | 'DETAILS' | 'MONETIZE' | 'RELEASE' | 'PREVIEW';
type FilmFormat = 'MOVIE' | 'TV_SERIES' | 'SHORT_FILM' | 'DOCUMENTARY';
type MonetizeStrategy = 'FREE_FAST' | 'RENTAL' | 'PURCHASE' | 'PPV_PREMIERE' | 'HYBRID';
type ReleaseStrategy = 'NOW' | 'SCHEDULED' | 'EARLY_ACCESS' | 'PRIVATE';

const STEPS: WizardStep[] = ['FORMAT', 'DETAILS', 'MONETIZE', 'RELEASE', 'PREVIEW'];
const STEP_LABELS = ['Format', 'Details', 'Monetize', 'Release', 'Launch'];

// ── Static data ────────────────────────────────────────────────────────────────

const FORMAT_OPTIONS: {
  id: FilmFormat; label: string; desc: string;
  icon: React.ReactNode; subType: 'MOVIE' | 'TV_SERIES';
}[] = [
  { id: 'MOVIE',       label: 'Feature Film',  desc: 'Full-length narrative or scripted content',  icon: <Film size={22} />,        subType: 'MOVIE'     },
  { id: 'TV_SERIES',   label: 'TV Series',     desc: 'Episodic content with seasons & episodes',   icon: <Tv size={22} />,          subType: 'TV_SERIES' },
  { id: 'SHORT_FILM',  label: 'Short Film',    desc: 'Under 40 minutes — festival & indie format',  icon: <Clock size={22} />,       subType: 'MOVIE'     },
  { id: 'DOCUMENTARY', label: 'Documentary',   desc: 'Non-fiction storytelling & journalism',        icon: <Camera size={22} />,      subType: 'MOVIE'     },
];

const GENRES = [
  'Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Thriller',
  'Documentary', 'Animation', 'Romance', 'Independent', 'Experimental', 'World Cinema',
];

const MONETIZE_OPTIONS: {
  id: MonetizeStrategy; label: string; desc: string; badge?: string; accent: string;
}[] = [
  { id: 'FREE_FAST',     label: 'Free via FAST',       desc: 'Ad-supported on your channel — zero cost to viewers',            badge: 'Broadest Reach', accent: '#22c55e' },
  { id: 'HYBRID',        label: 'Rent + Buy',          desc: 'Offer both rental and purchase simultaneously',                   badge: 'Recommended',    accent: '#FF8C00' },
  { id: 'RENTAL',        label: 'Rental',              desc: 'Viewers pay a fee for a timed streaming window',                  accent: '#818cf8'        },
  { id: 'PURCHASE',      label: 'Digital Purchase',    desc: 'Permanent digital copy — viewers own it forever',                 accent: '#38bdf8'        },
  { id: 'PPV_PREMIERE',  label: 'PPV Premiere',        desc: 'Ticketed live-streaming event — one premiere window',             accent: '#f472b6'        },
];

const RELEASE_OPTIONS: {
  id: ReleaseStrategy; label: string; desc: string; icon: React.ReactNode;
}[] = [
  { id: 'NOW',          label: 'Release Now',        desc: 'Publish immediately to your selected distribution model',                icon: <Zap size={16} />       },
  { id: 'SCHEDULED',    label: 'Scheduled Release',  desc: 'Set a date — auto-enables countdown page & Fediverse announcements',    icon: <AlarmClock size={16} /> },
  { id: 'EARLY_ACCESS', label: 'Early Access',       desc: 'Invite press, festivals & reviewers with unique codes first',           icon: <Star size={16} />       },
  { id: 'PRIVATE',      label: 'Members Only',       desc: 'Restricted to your fan club members or invited list',                   icon: <Lock size={16} />       },
];

// ── Sub-step components ────────────────────────────────────────────────────────

function OptionCard({ selected, onClick, children, accent = '#FF8C00' }: {
  selected: boolean; onClick: () => void; children: React.ReactNode; accent?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-5 rounded-3xl border transition-all"
      style={{
        background: selected ? `${accent}12` : 'rgba(255,255,255,0.02)',
        borderColor: selected ? `${accent}50` : 'rgba(255,255,255,0.07)',
        boxShadow: selected ? `0 0 0 1px ${accent}40` : 'none',
      }}
    >
      {children}
    </button>
  );
}

function StepFormat({ value, onChange }: { value: FilmFormat | null; onChange: (v: FilmFormat) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-6">What are you distributing?</p>
      {FORMAT_OPTIONS.map(opt => (
        <OptionCard key={opt.id} selected={value === opt.id} onClick={() => onChange(opt.id)}>
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: value === opt.id ? 'rgba(255,140,0,0.15)' : 'rgba(255,255,255,0.05)', color: value === opt.id ? '#FF8C00' : 'rgba(255,255,255,0.3)' }}
            >
              {opt.icon}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-black uppercase tracking-widest ${value === opt.id ? 'text-white' : 'text-white/50'}`}>{opt.label}</p>
              <p className="text-[10px] text-white/30 font-medium mt-0.5">{opt.desc}</p>
            </div>
            {value === opt.id && <Check size={14} className="text-[#FF8C00] flex-shrink-0" />}
          </div>
        </OptionCard>
      ))}
    </div>
  );
}

function StepDetails({
  title, setTitle, director, setDirector, genre, setGenre,
  year, setYear, tagline, setTagline, synopsis, setSynopsis,
}: {
  title: string; setTitle: (v: string) => void;
  director: string; setDirector: (v: string) => void;
  genre: string; setGenre: (v: string) => void;
  year: string; setYear: (v: string) => void;
  tagline: string; setTagline: (v: string) => void;
  synopsis: string; setSynopsis: (v: string) => void;
}) {
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25 transition-all';
  const labelCls = 'block text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-2';
  return (
    <div className="space-y-5">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-6">About your film</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={labelCls}>Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter your film title" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Director *</label>
          <input value={director} onChange={e => setDirector(e.target.value)} placeholder="Director name" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Year</label>
          <input value={year} onChange={e => setYear(e.target.value)} placeholder="2024" className={inputCls} maxLength={4} />
        </div>
        <div>
          <label className={labelCls}>Genre *</label>
          <select value={genre} onChange={e => setGenre(e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
            <option value="">Select genre</option>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Tagline</label>
          <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="A short punchy line" className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Synopsis</label>
          <textarea value={synopsis} onChange={e => setSynopsis(e.target.value)} placeholder="Describe your film in 2–3 sentences…" rows={3} className={`${inputCls} resize-none`} />
        </div>
      </div>
    </div>
  );
}

function StepMonetize({
  value, onChange, rentalPrice, setRentalPrice,
  purchasePrice, setPurchasePrice, rentalPeriod, setRentalPeriod,
}: {
  value: MonetizeStrategy | null; onChange: (v: MonetizeStrategy) => void;
  rentalPrice: string; setRentalPrice: (v: string) => void;
  purchasePrice: string; setPurchasePrice: (v: string) => void;
  rentalPeriod: '24' | '48' | '72'; setRentalPeriod: (v: '24' | '48' | '72') => void;
}) {
  const inputCls = 'bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25 transition-all w-full';
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-6">How will viewers access your film?</p>
      {MONETIZE_OPTIONS.map(opt => (
        <OptionCard key={opt.id} selected={value === opt.id} onClick={() => onChange(opt.id)} accent={opt.accent}>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-sm font-black uppercase tracking-widest ${value === opt.id ? 'text-white' : 'text-white/50'}`}>{opt.label}</p>
                {opt.badge && (
                  <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: `${opt.accent}20`, color: opt.accent }}>
                    {opt.badge}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/30 mt-0.5">{opt.desc}</p>
            </div>
            {value === opt.id && <Check size={14} style={{ color: opt.accent }} className="flex-shrink-0 mt-1" />}
          </div>
          {/* Inline price config when selected */}
          {value === opt.id && (opt.id === 'RENTAL' || opt.id === 'HYBRID') && (
            <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-3" onClick={e => e.stopPropagation()}>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Rental price (USD)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                  <input value={rentalPrice} onChange={e => setRentalPrice(e.target.value)} className={`${inputCls} pl-7`} placeholder="4.99" type="number" min="0" step="0.01" />
                </div>
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Rental window</label>
                <select value={rentalPeriod} onChange={e => setRentalPeriod(e.target.value as any)} className={`${inputCls} appearance-none cursor-pointer`}>
                  <option value="24">24 hours</option>
                  <option value="48">48 hours</option>
                  <option value="72">72 hours</option>
                </select>
              </div>
            </div>
          )}
          {value === opt.id && (opt.id === 'PURCHASE' || opt.id === 'HYBRID') && (
            <div className="mt-4 pt-4 border-t border-white/10" onClick={e => e.stopPropagation()}>
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Purchase price (USD)</label>
              <div className="relative w-40">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                <input value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} className={`${inputCls} pl-7`} placeholder="9.99" type="number" min="0" step="0.01" />
              </div>
            </div>
          )}
        </OptionCard>
      ))}
    </div>
  );
}

function StepRelease({
  value, onChange, scheduledDate, setScheduledDate,
  enableFAST, setEnableFAST, enableWatchParty, setEnableWatchParty,
}: {
  value: ReleaseStrategy | null; onChange: (v: ReleaseStrategy) => void;
  scheduledDate: string; setScheduledDate: (v: string) => void;
  enableFAST: boolean; setEnableFAST: (v: boolean) => void;
  enableWatchParty: boolean; setEnableWatchParty: (v: boolean) => void;
}) {
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25 transition-all';
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-6">When and how do you want to release?</p>
      {RELEASE_OPTIONS.map(opt => (
        <OptionCard key={opt.id} selected={value === opt.id} onClick={() => onChange(opt.id)}>
          <div className="flex items-center gap-4">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${value === opt.id ? 'bg-[#FF8C00]/15 text-[#FF8C00]' : 'bg-white/5 text-white/25'}`}>
              {opt.icon}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-black uppercase tracking-widest ${value === opt.id ? 'text-white' : 'text-white/50'}`}>{opt.label}</p>
              <p className="text-[10px] text-white/30 mt-0.5">{opt.desc}</p>
            </div>
            {value === opt.id && <Check size={14} className="text-[#FF8C00] flex-shrink-0" />}
          </div>
          {value === opt.id && opt.id === 'SCHEDULED' && (
            <div className="mt-4 pt-4 border-t border-white/10" onClick={e => e.stopPropagation()}>
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Release date & time</label>
              <input type="datetime-local" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className={inputCls} />
            </div>
          )}
        </OptionCard>
      ))}

      {/* Distribution add-ons */}
      <div className="pt-4">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3">Distribution add-ons</p>
        <div className="space-y-2">
          {[
            { id: 'fast', label: 'Add to FAST Channel', desc: 'Include in your ad-supported 24/7 channel', icon: <Radio size={14} />, value: enableFAST, set: setEnableFAST },
            { id: 'party', label: 'Schedule Watch Party', desc: 'Host a live community screening event',    icon: <Users size={14} />, value: enableWatchParty, set: setEnableWatchParty },
          ].map(addon => (
            <button
              key={addon.id}
              onClick={() => addon.set(!addon.value)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl border transition-all text-left"
              style={{
                background: addon.value ? 'rgba(255,140,0,0.06)' : 'rgba(255,255,255,0.02)',
                borderColor: addon.value ? 'rgba(255,140,0,0.25)' : 'rgba(255,255,255,0.07)',
              }}
            >
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${addon.value ? 'bg-[#FF8C00]/15 text-[#FF8C00]' : 'bg-white/5 text-white/25'}`}>
                {addon.icon}
              </div>
              <div className="flex-1">
                <p className={`text-xs font-black uppercase tracking-widest ${addon.value ? 'text-white' : 'text-white/40'}`}>{addon.label}</p>
                <p className="text-[9px] text-white/25">{addon.desc}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${addon.value ? 'border-[#FF8C00] bg-[#FF8C00]' : 'border-white/15 bg-transparent'}`}>
                {addon.value && <Check size={10} className="text-black" />}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepPreview({
  format, title, director, genre, year, tagline,
  monetize, releaseStrategy, scheduledDate, enableFAST, enableWatchParty,
}: {
  format: FilmFormat; title: string; director: string; genre: string;
  year: string; tagline: string; monetize: MonetizeStrategy;
  releaseStrategy: ReleaseStrategy; scheduledDate: string;
  enableFAST: boolean; enableWatchParty: boolean;
}) {
  const fmt = FORMAT_OPTIONS.find(f => f.id === format);
  const mon = MONETIZE_OPTIONS.find(m => m.id === monetize);
  const rel = RELEASE_OPTIONS.find(r => r.id === releaseStrategy);

  const chips: { label: string; icon: React.ReactNode; color: string }[] = [
    { label: fmt?.label ?? format, icon: fmt?.icon, color: '#818cf8' },
    { label: mon?.label ?? monetize, icon: <DollarSign size={11} />, color: mon?.accent ?? '#FF8C00' },
    { label: rel?.label ?? releaseStrategy, icon: rel?.icon, color: '#22c55e' },
    ...(enableFAST ? [{ label: 'FAST Channel', icon: <Radio size={11} />, color: '#38bdf8' }] : []),
    ...(enableWatchParty ? [{ label: 'Watch Party', icon: <Users size={11} />, color: '#f472b6' }] : []),
  ];

  return (
    <div className="space-y-6">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Your film setup — review before launching</p>

      {/* Film card preview */}
      <div className="p-6 rounded-3xl border border-white/8 bg-white/[0.02]">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Film size={24} className="text-white/20" />
          </div>
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight text-white leading-none">{title || 'Untitled Film'}</h3>
            <p className="text-[11px] text-white/40 font-medium mt-1">Directed by {director || '—'} · {year} · {genre || '—'}</p>
            {tagline && <p className="text-[11px] text-white/25 italic mt-1">"{tagline}"</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {chips.map((chip, i) => (
            <span key={i}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest"
              style={{ background: `${chip.color}15`, color: chip.color, border: `1px solid ${chip.color}30` }}
            >
              {chip.icon} {chip.label}
            </span>
          ))}
        </div>

        {releaseStrategy === 'SCHEDULED' && scheduledDate && (
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
            <Calendar size={12} className="text-white/30" />
            <span className="text-[10px] text-white/30 font-bold">
              Releases: {new Date(scheduledDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>

      {/* What happens next */}
      <div className="p-5 rounded-2xl bg-[#FF8C00]/6 border border-[#FF8C00]/15">
        <p className="text-[9px] font-black uppercase tracking-widest text-[#FF8C00] mb-3">What happens next</p>
        <ul className="space-y-2">
          {[
            'Full Creator opens — add your video files, poster, and cast',
            'Configure metadata, special features & trailers',
            releaseStrategy === 'SCHEDULED' ? 'Countdown landing page auto-generates' : 'Publish when you\'re ready',
            releaseStrategy === 'EARLY_ACCESS' ? 'Create press review codes after publishing' : null,
            enableFAST ? 'Film gets added to your FAST channel library' : null,
            enableWatchParty ? 'Schedule your premiere watch party from the film page' : null,
          ].filter(Boolean).map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-[#FF8C00]/20 text-[#FF8C00] text-[8px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <span className="text-[10px] text-white/50">{step}</span>
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
}

export default function FilmOnboardingWizard({ onLaunchCreator, onCancel }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [dir, setDir] = useState(1);

  // Step state
  const [format, setFormat]               = useState<FilmFormat | null>(null);
  const [title, setTitle]                 = useState('');
  const [director, setDirector]           = useState('');
  const [genre, setGenre]                 = useState('');
  const [year, setYear]                   = useState(String(new Date().getFullYear()));
  const [tagline, setTagline]             = useState('');
  const [synopsis, setSynopsis]           = useState('');
  const [monetize, setMonetize]           = useState<MonetizeStrategy | null>(null);
  const [rentalPrice, setRentalPrice]     = useState('4.99');
  const [purchasePrice, setPurchasePrice] = useState('9.99');
  const [rentalPeriod, setRentalPeriod]   = useState<'24' | '48' | '72'>('48');
  const [releaseStrategy, setReleaseStrategy] = useState<ReleaseStrategy | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [enableFAST, setEnableFAST]       = useState(false);
  const [enableWatchParty, setEnableWatchParty] = useState(false);

  const currentStep = STEPS[stepIndex];

  const canAdvance = (): boolean => {
    switch (currentStep) {
      case 'FORMAT':   return !!format;
      case 'DETAILS':  return !!title.trim() && !!director.trim() && !!genre;
      case 'MONETIZE': return !!monetize;
      case 'RELEASE':  return !!releaseStrategy;
      default:         return true;
    }
  };

  const advance = () => {
    if (!canAdvance()) return;
    setDir(1);
    setStepIndex(i => Math.min(i + 1, STEPS.length - 1));
  };

  const back = () => {
    setDir(-1);
    setStepIndex(i => Math.max(i - 1, 0));
  };

  const handleLaunch = () => {
    const fmt      = FORMAT_OPTIONS.find(f => f.id === format);
    const isFAST   = monetize === 'FREE_FAST';
    const isRental = monetize === 'RENTAL' || monetize === 'HYBRID';
    const isBuy    = monetize === 'PURCHASE' || monetize === 'HYBRID';

    const albumPartial: Partial<Album> = {
      type: 'VIDEO',
      subType: fmt?.subType ?? 'MOVIE',
      title,
      artist: director,
      genre,
      description: synopsis,
      isPaywalled: !isFAST,
      isAdSupported: isFAST || enableFAST,
      price: isBuy ? parseFloat(purchasePrice) || 9.99 : isRental ? parseFloat(rentalPrice) || 4.99 : 0,
      isScheduled: releaseStrategy === 'SCHEDULED',
      releaseDate: releaseStrategy === 'SCHEDULED' && scheduledDate
        ? new Date(scheduledDate).getTime() : undefined,
      earlyAccessEnabled: releaseStrategy === 'EARLY_ACCESS',
      isPrivate: releaseStrategy === 'PRIVATE',
      movieMetadata: {
        tagline,
        releaseYear: parseInt(year) || new Date().getFullYear(),
        cast: [],
        crew: [],
        castMembers: [],
        productionCredits: [],
        specialFeatures: [],
      },
      tags: [genre, fmt?.label ?? '', 'film', enableFAST ? 'fast-channel' : ''].filter(Boolean),
    };
    onLaunchCreator(albumPartial);
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        className="relative w-full max-w-xl bg-[#0d0d0d] border border-white/8 rounded-[2.5rem] flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl" style={{ background: 'rgba(255,140,0,0.12)' }}>
                <Clapperboard size={18} className="text-[#FF8C00]" />
              </div>
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-white">Film Studio</h2>
                <p className="text-[9px] text-white/25 font-black uppercase tracking-[0.3em]">Distribution Setup</p>
              </div>
            </div>
            <button onClick={onCancel} className="p-2 text-white/20 hover:text-white transition-colors rounded-xl">
              <X size={16} />
            </button>
          </div>

          {/* Step progress */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center transition-all"
                    style={{
                      background: i < stepIndex ? '#FF8C00' : i === stepIndex ? '#fff' : 'rgba(255,255,255,0.08)',
                      color: i < stepIndex ? '#000' : i === stepIndex ? '#000' : 'rgba(255,255,255,0.2)',
                      fontSize: 8, fontWeight: 900,
                    }}
                  >
                    {i < stepIndex ? <Check size={9} /> : i + 1}
                  </div>
                  <span className={`text-[8px] font-black uppercase tracking-widest hidden sm:block ${i === stepIndex ? 'text-white' : i < stepIndex ? 'text-[#FF8C00]' : 'text-white/15'}`}>
                    {STEP_LABELS[i]}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px" style={{ background: i < stepIndex ? 'rgba(255,140,0,0.35)' : 'rgba(255,255,255,0.07)' }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Scrollable step body */}
        <div className="flex-1 overflow-y-auto px-8 py-7">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -dir * 24 }}
              transition={{ duration: 0.2 }}
            >
              {currentStep === 'FORMAT'   && <StepFormat value={format} onChange={setFormat} />}
              {currentStep === 'DETAILS'  && (
                <StepDetails title={title} setTitle={setTitle} director={director} setDirector={setDirector}
                  genre={genre} setGenre={setGenre} year={year} setYear={setYear}
                  tagline={tagline} setTagline={setTagline} synopsis={synopsis} setSynopsis={setSynopsis} />
              )}
              {currentStep === 'MONETIZE' && (
                <StepMonetize value={monetize} onChange={setMonetize}
                  rentalPrice={rentalPrice} setRentalPrice={setRentalPrice}
                  purchasePrice={purchasePrice} setPurchasePrice={setPurchasePrice}
                  rentalPeriod={rentalPeriod} setRentalPeriod={setRentalPeriod} />
              )}
              {currentStep === 'RELEASE'  && (
                <StepRelease value={releaseStrategy} onChange={setReleaseStrategy}
                  scheduledDate={scheduledDate} setScheduledDate={setScheduledDate}
                  enableFAST={enableFAST} setEnableFAST={setEnableFAST}
                  enableWatchParty={enableWatchParty} setEnableWatchParty={setEnableWatchParty} />
              )}
              {currentStep === 'PREVIEW'  && (
                <StepPreview format={format!} title={title} director={director}
                  genre={genre} year={year} tagline={tagline}
                  monetize={monetize!} releaseStrategy={releaseStrategy!}
                  scheduledDate={scheduledDate} enableFAST={enableFAST} enableWatchParty={enableWatchParty} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        <div className="px-8 pb-8 pt-4 border-t border-white/5 flex items-center justify-between flex-shrink-0">
          <button
            onClick={back}
            disabled={stepIndex === 0}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all disabled:opacity-0"
          >
            <ChevronLeft size={12} /> Back
          </button>

          {currentStep !== 'PREVIEW' ? (
            <button
              onClick={advance}
              disabled={!canAdvance()}
              className="flex items-center gap-1.5 px-7 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-25 disabled:scale-100"
              style={{ background: canAdvance() ? '#FF8C00' : 'rgba(255,255,255,0.08)', color: canAdvance() ? '#000' : 'rgba(255,255,255,0.2)' }}
            >
              Continue <ChevronRight size={12} />
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              className="flex items-center gap-1.5 px-7 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-[#FF8C00] text-black hover:scale-105 active:scale-95 transition-all"
            >
              <Sparkles size={12} /> Open Creator
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
