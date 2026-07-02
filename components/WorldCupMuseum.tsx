import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Star, Film, Award, Landmark, X, ExternalLink, Play } from 'lucide-react';
import { ALL_LEGENDS, type Legend } from '../data/soccerLegends';
import { ICONIC_MOMENTS, WC_RECORDS, GOAT_SLUGS, type IconicMoment } from '../data/soccerMuseum';
import { WC26_TEAMS } from '../data/worldCup2026';

const HallOfLegends = lazy(() => import('./sports/WorldCupHallOfLegends'));
import YouTubeModal from './YouTubeModal';

// ── shared Wikipedia summary (photo + bio), cached across the session ─────────
const wikiCache = new Map<string, Promise<{ thumb: string; extract: string }>>();
function wiki(slug: string): Promise<{ thumb: string; extract: string }> {
  if (!wikiCache.has(slug)) {
    wikiCache.set(slug, fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => ({ thumb: d?.originalimage?.source || d?.thumbnail?.source || '', extract: d?.extract || '' }))
      .catch(() => ({ thumb: '', extract: '' })));
  }
  return wikiCache.get(slug)!;
}
function useWiki(slug: string) {
  const [d, setD] = useState<{ thumb: string; extract: string }>({ thumb: '', extract: '' });
  useEffect(() => { let a = true; wiki(slug).then(x => a && setD(x)); return () => { a = false; }; }, [slug]);
  return d;
}

const flagFor = (nation: string): string => {
  const n = nation.toLowerCase();
  const t = WC26_TEAMS.find(x => x.name.toLowerCase() === n);
  return t?.flag || '';
};

type Section = 'legends' | 'moments' | 'records' | 'trophy';

// ── legend card + detail ─────────────────────────────────────────────────────
const LegendCard: React.FC<{ legend: Legend; onOpen: () => void }> = ({ legend, onOpen }) => {
  const { thumb } = useWiki(legend.wikiSlug);
  return (
    <motion.button
      layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      onClick={onOpen}
      className="group text-left rounded-[1.4rem] overflow-hidden border border-white/8 bg-white/[0.03] hover:border-[#FFD24A]/40 hover:bg-white/[0.06] transition-all">
      <div className="aspect-[3/4] bg-gradient-to-b from-white/5 to-black/40 relative overflow-hidden">
        {thumb
          ? <img src={thumb} alt={legend.name} loading="lazy" className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full flex items-center justify-center"><Star size={26} className="text-white/10" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute top-2 right-2 text-lg">{flagFor(legend.nation)}</div>
        <div className="absolute bottom-2 left-2.5 right-2.5">
          <p className="text-[11px] font-black uppercase tracking-tight text-white leading-none line-clamp-1">{legend.name}</p>
          <p className="text-[7px] font-bold uppercase tracking-widest text-[#FFD24A] mt-1">{legend.position} · {legend.nation}</p>
        </div>
      </div>
    </motion.button>
  );
};

const LegendModal: React.FC<{ legend: Legend; onClose: () => void }> = ({ legend, onClose }) => {
  const { thumb, extract } = useWiki(legend.wikiSlug);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-3xl overflow-hidden border border-white/12 bg-[#0d0d12] max-h-[88vh] overflow-y-auto scrollbar-hide">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 border border-white/15 flex items-center justify-center hover:bg-black/70"><X size={14} /></button>
        <div className="aspect-[16/10] bg-white/5 relative">
          {thumb && <img src={thumb} alt={legend.name} className="w-full h-full object-cover object-top" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d12] via-transparent to-transparent" />
        </div>
        <div className="p-5 -mt-10 relative">
          <div className="flex items-center gap-2 text-2xl">{flagFor(legend.nation)}</div>
          <h2 className="text-2xl font-black uppercase tracking-tight mt-1">{legend.name}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="px-2.5 py-1 rounded-full bg-[#FFD24A]/15 border border-[#FFD24A]/30 text-[8px] font-black uppercase text-[#FFD24A]">{legend.position}</span>
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/50">{legend.nation}</span>
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/50">b. {legend.born}</span>
          </div>
          <p className="mt-3 text-sm text-[#FFD24A]/90 font-bold leading-relaxed">{legend.honors}</p>
          {extract && <p className="mt-3 text-sm text-white/55 leading-relaxed">{extract}</p>}
          <a href={`https://en.wikipedia.org/wiki/${legend.wikiSlug}`} target="_blank" rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white">
            Full biography <ExternalLink size={11} />
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
};

const MomentCard: React.FC<{ moment: IconicMoment; onPlay: (m: IconicMoment) => void }> = ({ moment, onPlay }) => {
  const { thumb } = useWiki(moment.wikiSlug);
  const cls = "group rounded-[1.4rem] overflow-hidden border border-white/8 bg-white/[0.03] hover:border-white/25 transition-all block w-full text-left";
  const body = (<>
      <div className="aspect-video bg-white/5 relative overflow-hidden">
        {thumb && <img src={thumb} alt={moment.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
        <div className="absolute top-2.5 left-2.5 flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-[#FFD24A]/20 border border-[#FFD24A]/30 text-[7px] font-black uppercase text-[#FFD24A]">{moment.tag}</span>
          <span className="px-2 py-0.5 rounded-full bg-black/40 text-[7px] font-black text-white/70">{moment.year}</span>
        </div>
        <div className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-600/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Play size={13} className="text-white ml-0.5" /></div>
      </div>
      <div className="p-3.5">
        <p className="text-[11px] font-black uppercase tracking-tight text-white leading-tight">{moment.title}</p>
        <p className="text-[8px] font-bold uppercase tracking-widest text-[#FFD24A] mt-1">{moment.who}</p>
        <p className="text-[11px] text-white/45 leading-relaxed mt-2">{moment.blurb}</p>
      </div>
    </>);
  return moment.videoId
    ? <button onClick={() => onPlay(moment)} className={cls}>{body}</button>
    : <a href={moment.youtube} target="_blank" rel="noreferrer" className={cls}>{body}</a>;
};

const WorldCupMuseum: React.FC = () => {
  const [section, setSection] = useState<Section>('legends');
  const [nation, setNation] = useState<string>('Greatest of All Time');
  const [openLegend, setOpenLegend] = useState<Legend | null>(null);
  const [playMoment, setPlayMoment] = useState<IconicMoment | null>(null);

  const nations = useMemo(() => ['Greatest of All Time', ...Array.from(new Set(ALL_LEGENDS.map(l => l.nation))).sort()], []);
  const legends = useMemo(() => {
    if (nation === 'Greatest of All Time') {
      const rank = new Map(GOAT_SLUGS.map((s, i) => [s, i]));
      return ALL_LEGENDS.filter(l => rank.has(l.wikiSlug)).sort((a, b) => rank.get(a.wikiSlug)! - rank.get(b.wikiSlug)!);
    }
    return ALL_LEGENDS.filter(l => l.nation === nation);
  }, [nation]);

  const tabs: { id: Section; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'legends', label: 'Hall of Legends', icon: Star },
    { id: 'moments', label: 'Iconic Moments', icon: Film },
    { id: 'records', label: 'Records', icon: Award },
    { id: 'trophy', label: 'Trophy Room', icon: Trophy },
  ];

  return (
    <div className="space-y-5">
      {/* Museum header */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a1508] via-[#0d0d12] to-black p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-10"><Landmark size={140} className="text-[#FFD24A]" /></div>
        <p className="text-[8px] font-black uppercase tracking-[0.4em] text-[#FFD24A]">The Soccer Museum</p>
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-1">Halls of Legends</h1>
        <p className="text-sm text-white/45 mt-1.5 max-w-lg">The greats, the moments, the records and the trophies that made the beautiful game — a living exhibition.</p>
      </div>

      {/* Section nav */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {tabs.map(t => {
          const Icon = t.icon; const active = section === t.id;
          return (
            <button key={t.id} onClick={() => setSection(t.id)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${active ? 'bg-[#FFD24A] text-black border-transparent' : 'bg-white/5 border-white/8 text-white/50 hover:text-white hover:bg-white/10'}`}>
              <Icon size={12} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* LEGENDS */}
      {section === 'legends' && (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
            {nations.map(n => (
              <button key={n} onClick={() => setNation(n)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all border ${nation === n ? 'bg-white text-black border-transparent' : 'bg-white/[0.04] border-white/8 text-white/40 hover:text-white'}`}>
                {n !== 'Greatest of All Time' && flagFor(n)} {n === 'Greatest of All Time' ? '★ GOAT' : n}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {legends.map(l => <LegendCard key={l.wikiSlug} legend={l} onOpen={() => setOpenLegend(l)} />)}
          </div>
        </div>
      )}

      {/* MOMENTS */}
      {section === 'moments' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ICONIC_MOMENTS.map(m => <MomentCard key={m.id} moment={m} onPlay={setPlayMoment} />)}
        </div>
      )}

      {/* RECORDS */}
      {section === 'records' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {WC_RECORDS.map((r, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 flex items-center gap-4">
              <div className="text-3xl font-black text-[#FFD24A] tabular-nums shrink-0 min-w-[64px]">{r.value}</div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/80">{r.label}</p>
                <p className="text-xs font-bold text-white/60 mt-0.5">{r.holder}</p>
                {r.note && <p className="text-[10px] text-white/30 mt-0.5">{r.note}</p>}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* TROPHY ROOM — the cinematic 3D Hall of Legends */}
      {section === 'trophy' && (
        <Suspense fallback={<div className="h-[420px] rounded-3xl bg-white/5 animate-pulse flex items-center justify-center"><Trophy size={40} className="text-white/10" /></div>}>
          <HallOfLegends />
        </Suspense>
      )}

      <AnimatePresence>
        {openLegend && <LegendModal legend={openLegend} onClose={() => setOpenLegend(null)} />}
        {playMoment?.videoId && <YouTubeModal videoId={playMoment.videoId} title={playMoment.title} fallbackUrl={playMoment.youtube} onClose={() => setPlayMoment(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default WorldCupMuseum;
