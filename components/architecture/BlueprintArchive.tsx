import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  DraftingCompass, Search, ExternalLink, X, MapPin, Calendar, PenLine, FileText, Info,
} from 'lucide-react';
import AssetActions from '../AssetActions';
import {
  BLUEPRINTS, BLUEPRINT_SURVEYS, HABS_COLLECTION_URL, blueprintImage,
  type Blueprint, type SurveyKind,
} from '../../data/blueprintArchive';
import { TYPE } from '../../src/lib/designSystem';

// ─────────────────────────────────────────────────────────────────────────────
// The Blueprint Archive — a browsable window onto the Library of Congress
// HABS/HAER/HALS collection: measured drawings of landmark American buildings,
// engineering works and landscapes, produced by federal survey teams and placed
// in the public domain. Every entry links to its real LoC item page.
// ─────────────────────────────────────────────────────────────────────────────

interface Props { accent?: string; }

const SURVEY_LABEL: Record<SurveyKind, string> = {
  HABS: 'Buildings',
  HAER: 'Engineering',
  HALS: 'Landscapes',
};

const Card: React.FC<{ bp: Blueprint; accent: string; onOpen: () => void }> = ({ bp, accent, onOpen }) => {
  const src = blueprintImage(bp, 420);
  return (
  <button onClick={onOpen}
    className="group text-left rounded-[1.4rem] overflow-hidden border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-all"
    onMouseEnter={e => (e.currentTarget.style.borderColor = `${accent}66`)}
    onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
    <div className="aspect-[4/3] relative overflow-hidden bg-[#f4f1ea]">
      {src
        ? <img src={src} alt={bp.title} loading="lazy"
            className="w-full h-full object-cover object-top group-hover:scale-[1.06] transition-transform duration-500" />
        : <div className="w-full h-full flex items-center justify-center"><DraftingCompass size={28} className="text-black/15" /></div>}
      <div className="absolute top-2 left-2">
        <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest text-white"
          style={{ background: `${accent}dd` }}>{bp.survey}</span>
      </div>
    </div>
    <div className="p-3">
      <p className="text-[13px] font-black uppercase tracking-tight text-white leading-tight line-clamp-2">{bp.title}</p>
      <p className={`${TYPE.labelSm} font-bold uppercase tracking-widest mt-1 line-clamp-1`} style={{ color: accent }}>
        {bp.location}
      </p>
      {bp.architectOrBuilder && (
        <p className="text-[10px] text-white/35 mt-0.5 line-clamp-1">{bp.architectOrBuilder}</p>
      )}
    </div>
  </button>
  );
};

const Detail: React.FC<{ bp: Blueprint; accent: string; onClose: () => void }> = ({ bp, accent, onClose }) => {
  const large = blueprintImage(bp, 1280);
  const overlay = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-3xl rounded-3xl overflow-hidden border border-white/12 bg-[#0d0d12] max-h-[90vh] overflow-y-auto scrollbar-hide">
        <button onClick={onClose} aria-label="Close"
          className="tap absolute right-3 z-10 w-8 h-8 rounded-full bg-black/60 border border-white/15 flex items-center justify-center hover:bg-black/80"
          style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}><X size={14} /></button>

        {/* The drawing itself, on paper white */}
        <a href={bp.locUrl} target="_blank" rel="noreferrer"
          className="block bg-[#f4f1ea] relative group" title="Open the full-resolution sheet at the Library of Congress">
          {large ? (
            <img src={large} alt={bp.title}
              className="w-full max-h-[52vh] object-contain" />
          ) : (
            <div className="h-52 flex items-center justify-center"><DraftingCompass size={34} className="text-black/15" /></div>
          )}
          <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded-full bg-black/70 text-[9px] font-black uppercase tracking-widest text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
            View full resolution at LoC
          </div>
        </a>

        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest"
              style={{ background: `${accent}26`, border: `1px solid ${accent}4d`, color: accent }}>
              {bp.survey} · {SURVEY_LABEL[bp.survey]}
            </span>
            {bp.year && (
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/45 tabular-nums">
                {bp.year}
              </span>
            )}
          </div>

          <h2 className="text-2xl font-black uppercase tracking-tight mt-2 leading-tight">{bp.title}</h2>

          <div className="grid sm:grid-cols-2 gap-x-5 gap-y-1.5 mt-3">
            <div className="flex items-start gap-2">
              <MapPin size={13} className="mt-0.5 shrink-0" style={{ color: accent }} />
              <p className="type-body-sm text-white/55">{bp.location}</p>
            </div>
            {bp.architectOrBuilder && (
              <div className="flex items-start gap-2">
                <DraftingCompass size={13} className="mt-0.5 shrink-0" style={{ color: accent }} />
                <p className="type-body-sm text-white/55">{bp.architectOrBuilder}</p>
              </div>
            )}
            {bp.delineator && (
              <div className="flex items-start gap-2">
                <PenLine size={13} className="mt-0.5 shrink-0" style={{ color: accent }} />
                <p className="type-body-sm text-white/55">Delineated by {bp.delineator}</p>
              </div>
            )}
            {bp.surveyDate && (
              <div className="flex items-start gap-2">
                <Calendar size={13} className="mt-0.5 shrink-0" style={{ color: accent }} />
                <p className="type-body-sm text-white/55">Surveyed {bp.surveyDate}</p>
              </div>
            )}
            {bp.callNumber && (
              <div className="flex items-start gap-2 sm:col-span-2">
                <FileText size={13} className="mt-0.5 shrink-0" style={{ color: accent }} />
                <p className="type-body-sm text-white/45 font-mono">{bp.callNumber}</p>
              </div>
            )}
          </div>

          <p className="text-sm text-white/60 leading-relaxed mt-3">{bp.blurb}</p>

          {bp.sheetLabel && (
            <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3.5 flex gap-2.5">
              <Info size={14} className="shrink-0 mt-0.5" style={{ color: accent }} />
              <div>
                <p className={`${TYPE.labelSm} font-black uppercase tracking-[0.3em] text-white/35`}>This sheet</p>
                <p className="type-body-sm text-white/55 mt-0.5">{bp.sheetLabel}</p>
              </div>
            </div>
          )}

          <a href={bp.locUrl} target="_blank" rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest hover:underline"
            style={{ color: accent }}>
            Open at the Library of Congress <ExternalLink size={11} />
          </a>

          <div className="mt-4 pt-4 border-t border-white/8">
            <AssetActions accent={accent} asset={{
              kind: 'blueprint', title: bp.title,
              subtitle: [bp.survey, bp.location, bp.year].filter(Boolean).join(' · '),
              description: bp.blurb,
              imageUrl: large,
              sourceUrl: bp.locUrl,
              discipline: 'Architecture',
              interests: ['architecture', 'blueprints', bp.survey.toLowerCase()],
            }} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

const BlueprintArchive: React.FC<Props> = ({ accent = '#B08968' }) => {
  const [survey, setSurvey] = useState<SurveyKind | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Blueprint | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return BLUEPRINTS.filter(b => {
      if (survey !== 'ALL' && b.survey !== survey) return false;
      if (!needle) return true;
      return [b.title, b.location, b.architectOrBuilder, b.blurb]
        .filter(Boolean).some(v => (v as string).toLowerCase().includes(needle));
    });
  }, [survey, q]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { ALL: BLUEPRINTS.length };
    for (const b of BLUEPRINTS) m[b.survey] = (m[b.survey] || 0) + 1;
    return m;
  }, []);

  const label = `${TYPE.labelSm} font-black uppercase tracking-[0.3em] text-white/35`;

  return (
    <div className="space-y-4">
      {/* Intro */}
      <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 relative overflow-hidden">
        <div className="absolute top-[-70px] right-[-40px] w-[260px] h-[260px] rounded-full blur-[90px] pointer-events-none"
          style={{ background: `${accent}14` }} />
        <div className="relative">
          <p className={`${TYPE.labelSm} font-black uppercase tracking-[0.4em]`} style={{ color: accent }}>
            Library of Congress · Public Domain
          </p>
          <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight mt-1">The Blueprint Archive</h3>
          <p className="text-sm text-white/50 leading-relaxed mt-2 max-w-3xl">
            Since 1933 federal survey teams have measured and drawn America’s significant buildings, bridges,
            factories and landscapes — first HABS for buildings, then HAER for engineering works and HALS for
            landscapes. The resulting ink-on-mylar sheets are held by the Library of Congress and carry no known
            copyright restriction. Every card here opens the real item page, where the full-resolution TIFF is a
            free download.
          </p>
          <a href={HABS_COLLECTION_URL} target="_blank" rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest hover:underline"
            style={{ color: accent }}>
            Browse the full collection · 40,000+ structures <ExternalLink size={11} />
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search by building, architect or place…"
            className="w-full rounded-2xl bg-black/40 border border-white/10 pl-10 pr-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none"
            onFocus={e => (e.currentTarget.style.borderColor = `${accent}66`)}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
        </div>
        <div className="flex gap-1.5">
          {(['ALL', ...BLUEPRINT_SURVEYS] as (SurveyKind | 'ALL')[]).map(s => {
            const active = survey === s;
            return (
              <button key={s} onClick={() => setSurvey(s)}
                className={`px-3 py-2 rounded-full ${TYPE.labelSm} font-black uppercase tracking-widest border transition-all whitespace-nowrap`}
                style={active
                  ? { background: `${accent}26`, borderColor: `${accent}66`, color: accent }
                  : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
                {s === 'ALL' ? 'All' : s} · {counts[s] || 0}
              </button>
            );
          })}
        </div>
      </div>

      {survey !== 'ALL' && (
        <p className={label}>{survey} — {SURVEY_LABEL[survey]}</p>
      )}

      {/* Grid */}
      {list.length === 0 ? (
        <p className="py-20 text-center text-sm text-white/25">No drawing matches “{q}”.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map((bp, i) => (
            <motion.div key={bp.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.02 }}>
              <Card bp={bp} accent={accent} onOpen={() => setOpen(bp)} />
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {open && <Detail bp={open} accent={accent} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default BlueprintArchive;
