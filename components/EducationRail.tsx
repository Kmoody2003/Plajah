// EducationRail — replaces the ad "vertical" for EDUCATION accounts. Students, teachers,
// parents, and children never see ads in this slot; instead they get a rotating stream of
// learning: the Chora/Taleo "history of the day", a real public-domain artwork from the Met /
// Art Institute (open-access), and nano-lesson factoids across disciplines. Fits the same
// full-height left-rail slot the ad billboard used.

import React, { useEffect, useState } from 'react';
import { GraduationCap, Sparkles, ExternalLink, RefreshCw } from 'lucide-react';
import HistoryMomentPulseCard from './HistoryMomentPulseCard';
import { searchArtworks, type ArtWork } from '../services/artMuseumService';
import { EDU_FACTOIDS, factoidAt } from '../data/eduFactoids';

const ROTATE_MS = 14000;
const SCHOOL_SAFE_ART_QUERIES = ['landscape', 'still life', 'architecture', 'flowers', 'abstract'];

const EducationRail: React.FC<{ uid?: string | null; onNavigate?: (view: string) => void }> = ({ uid, onNavigate }) => {
  const [step, setStep] = useState(0);          // 0 = history, 1 = art, 2 = factoid
  const [art, setArt] = useState<ArtWork[]>([]);
  const [artIdx, setArtIdx] = useState(0);
  const [factIdx, setFactIdx] = useState(() => Math.floor(EDU_FACTOIDS.length / 2));

  // Load a batch of real, public-domain artworks (Met / Art Institute — keyless, cached).
  useEffect(() => {
    let cancelled = false;
    const query = SCHOOL_SAFE_ART_QUERIES[factIdx % SCHOOL_SAFE_ART_QUERIES.length];
    searchArtworks(query, { limit: 30, educationSafe: true }).then(list => {
      if (!cancelled) setArt((list || []).filter(a => a.imageUrl));
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotate the three card types; advance art/factoid pointers as they come around.
  useEffect(() => {
    const t = setInterval(() => {
      setStep(s => {
        const next = (s + 1) % 3;
        if (next === 1) setArtIdx(i => (i + 1) % Math.max(1, art.length));
        if (next === 2) setFactIdx(i => (i + 1) % EDU_FACTOIDS.length);
        return next;
      });
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [art.length]);

  const fact = factoidAt(factIdx);
  const work = art[artIdx];

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-[#0d1512] via-[#0a0f0d] to-[#0a0a0f] text-white overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 shrink-0">
        <div className="flex items-center gap-2 text-[#3FB98E]"><GraduationCap size={16} /><span className="text-[10px] font-black uppercase tracking-[0.3em]">Plajah Academia</span></div>
        <p className="text-[11px] text-white/40 mt-1">Something to learn — not an ad in sight.</p>
      </div>

      {/* Rotating body */}
      <div className="flex-1 min-h-0 px-4 pb-4 overflow-hidden">
        {step === 0 && (
          <div className="h-full">
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-2 px-1">History of the day</p>
            <HistoryMomentPulseCard uid={uid} category="MIX" size="sidebar" rotationIntervalSeconds={11}
              onNavigate={(v) => onNavigate?.(v)} />
          </div>
        )}

        {step === 1 && (
          <div className="h-full flex flex-col">
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-2 px-1">Art of the moment</p>
            {work ? (
              <button onClick={() => onNavigate?.('ART_GALLERY')} className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-white/10 bg-black relative group text-left">
                <img src={work.imageUrl} alt={work.title} loading="lazy" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3.5">
                  <p className="text-[13px] font-black leading-tight text-white line-clamp-2">{work.title}</p>
                  <p className="text-[11px] text-white/70 mt-0.5">{work.artist || 'Unknown'}{work.date ? ` · ${work.date}` : ''}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#3FB98E] mt-1.5 flex items-center gap-1">
                    {work.source === 'met' ? 'The Met · Open Access' : 'Art Institute of Chicago'} {work.isPublicDomain && '· Public Domain'}
                  </p>
                </div>
              </button>
            ) : (
              <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] grid place-items-center"><RefreshCw size={18} className="animate-spin text-white/20" /></div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="h-full flex flex-col justify-center">
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/30 mb-3 px-1">Did you know?</p>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="text-4xl mb-3">{fact.emoji}</div>
              <p className="text-[15px] font-bold leading-snug text-white/90">{fact.text}</p>
              <div className="flex items-center gap-1.5 mt-4">
                <Sparkles size={11} className="text-[#3FB98E]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{fact.subject} · {fact.source}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer: dots + explore */}
      <div className="px-5 py-4 shrink-0 flex items-center justify-between border-t border-white/5">
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => <span key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === step ? 16 : 5, background: i === step ? '#3FB98E' : 'rgba(255,255,255,0.2)' }} />)}
        </div>
        <button onClick={() => onNavigate?.('PLAJAH_LABS')} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
          Explore Labs <ExternalLink size={10} />
        </button>
      </div>
    </div>
  );
};

export default EducationRail;
