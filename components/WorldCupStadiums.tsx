import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, MapPin, Users, Calendar, Building2, ExternalLink, Newspaper, Landmark, Boxes, RotateCcw } from 'lucide-react';
import { WC_STADIUMS, WCStadium, stadiumForVenue } from '../data/worldCupStadiums';
import { WC26_MATCHES, getTeam, ROUND_LABELS } from '../data/worldCup2026';

const StadiumModel3D = lazy(() => import('./StadiumModel3D'));

// Wikipedia REST summary — photo + history extract (keyless). Slugs are pre-encoded where needed.
async function fetchWiki(slug: string): Promise<{ photo: string | null; extract: string | null }> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
    if (!res.ok) return { photo: null, extract: null };
    const d = await res.json();
    const raw = typeof d.extract === 'string' ? d.extract.trim() : '';
    return { photo: d.originalimage?.source ?? d.thumbnail?.source ?? null, extract: raw.length > 30 ? raw : null };
  } catch { return { photo: null, extract: null }; }
}

const osmEmbed = (s: WCStadium) => {
  const dx = 0.009, dy = 0.006;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${s.lng - dx}%2C${s.lat - dy}%2C${s.lng + dx}%2C${s.lat + dy}&layer=mapnik&marker=${s.lat}%2C${s.lng}`;
};
const ytSearch = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

const Fact: React.FC<{ icon: any; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/[0.03] border border-white/8">
    <Icon size={15} className="text-white/40 shrink-0" />
    <div className="min-w-0"><p className="text-[7px] font-black uppercase tracking-[0.25em] text-white/30">{label}</p><p className="text-[12px] font-black text-white truncate">{value}</p></div>
  </div>
);

// ── Stadium card ───────────────────────────────────────────────────────────────
const StadiumCard: React.FC<{ s: WCStadium; onClick: () => void }> = ({ s, onClick }) => {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => { let a = true; fetchWiki(s.wikiSlug).then(r => { if (a) setPhoto(r.photo); }).catch(() => {}); return () => { a = false; }; }, [s.wikiSlug]);
  return (
    <motion.button whileHover={{ y: -3 }} onClick={onClick}
      className="group relative text-left rounded-2xl overflow-hidden border border-white/10 hover:border-white/25 transition-all bg-white/[0.03]">
      <div className="relative h-32 overflow-hidden" style={{ background: `linear-gradient(135deg, ${s.accent}, #0a0a0a)` }}>
        {photo && <img src={photo} alt="" loading="lazy" className="w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        {s.role && <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#FF8C00] text-black text-[7px] font-black uppercase tracking-widest">{s.role.split('·')[0].trim()}</span>}
        <div className="absolute bottom-2 left-3 right-3">
          <p className="text-[13px] font-black text-white leading-tight truncate">{s.name}</p>
          <p className="text-[9px] text-white/70 flex items-center gap-1"><span>{s.countryFlag}</span> {s.city}</p>
        </div>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white/40">
        <span className="flex items-center gap-1"><Users size={10} /> {(s.capacity / 1000).toFixed(0)}k</span>
        <span>{s.roof} roof</span>
        <span>{s.opened}</span>
      </div>
    </motion.button>
  );
};

// ── Detail ──────────────────────────────────────────────────────────────────────
const StadiumDetail: React.FC<{ s: WCStadium; onBack: () => void }> = ({ s, onBack }) => {
  const [wiki, setWiki] = useState<{ photo: string | null; extract: string | null }>({ photo: null, extract: null });
  useEffect(() => { let a = true; fetchWiki(s.wikiSlug).then(r => { if (a) setWiki(r); }).catch(() => {}); return () => { a = false; }; }, [s.wikiSlug]);

  const matches = useMemo(() => WC26_MATCHES.filter(m => stadiumForVenue(m.venue, m.city)?.id === s.id).slice(0, 8), [s.id]);

  return (
    <div className="space-y-4 pb-6">
      <button onClick={onBack} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-all">
        <ArrowLeft size={13} /> All Stadiums
      </button>

      {/* Hero */}
      <div className="relative rounded-3xl overflow-hidden border border-white/10 h-[36vh] min-h-[220px]" style={{ background: `linear-gradient(135deg, ${s.accent}, #0a0a0a)` }}>
        {wiki.photo && <img src={wiki.photo} alt={s.name} className="absolute inset-0 w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          {s.role && <span className="inline-block mb-2 px-2.5 py-1 rounded-full bg-[#FF8C00] text-black text-[8px] font-black uppercase tracking-widest">{s.role}</span>}
          <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white leading-none">{s.name}</h1>
          <p className="text-white/70 text-sm mt-1 flex items-center gap-1.5"><span>{s.countryFlag}</span> {s.city}, {s.country}{s.officialName && s.officialName !== s.name ? ` · ${s.officialName}` : ''}</p>
        </div>
      </div>

      <p className="text-sm text-white/70 leading-relaxed px-1">{s.blurb}</p>

      {/* 3D architectural render */}
      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2 flex items-center gap-1.5"><Boxes size={11} /> 3D Render · drag to orbit</p>
        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-b from-white/[0.04] to-black h-[300px]">
          <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-white/30">Building model…</div>}>
            <StadiumModel3D stadium={s} className="w-full h-full" />
          </Suspense>
          <span className="absolute bottom-2 right-3 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/25 pointer-events-none"><RotateCcw size={9} /> {s.roof} roof · {s.capacity >= 68000 ? 'two-tier' : 'single-tier'} bowl</span>
        </div>
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Fact icon={Users} label="Capacity" value={`${s.capacity.toLocaleString()}`} />
        <Fact icon={Building2} label="Roof" value={s.roof} />
        <Fact icon={Calendar} label="Opened" value={String(s.opened)} />
        <Fact icon={MapPin} label="Surface" value={s.surface.includes('temporary') ? 'Natural grass' : s.surface} />
      </div>

      {/* Home teams */}
      {s.homeTeams.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Home to</span>
          {s.homeTeams.map(t => <span key={t} className="px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[10px] font-bold text-white/70">{t}</span>)}
        </div>
      )}

      {/* Map */}
      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2 flex items-center gap-1.5"><MapPin size={11} /> Location</p>
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black h-[280px]">
          <iframe title={`${s.name} map`} src={osmEmbed(s)} className="w-full h-full border-none" loading="lazy" />
        </div>
        <a href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=16/${s.lat}/${s.lng}`} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white"><ExternalLink size={10} /> Open map</a>
      </div>

      {/* History (Wikipedia) */}
      {wiki.extract && (
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2 flex items-center gap-1.5"><Landmark size={11} /> History</p>
          <p className="text-[13px] text-white/70 leading-relaxed">{wiki.extract}</p>
          <a href={`https://en.wikipedia.org/wiki/${s.wikiSlug}`} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white"><ExternalLink size={10} /> via Wikipedia</a>
        </div>
      )}

      {/* Matches hosted */}
      {matches.length > 0 && (
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2 flex items-center gap-1.5"><Calendar size={11} /> World Cup Matches Here</p>
          <div className="space-y-1.5">
            {matches.map(m => {
              const h = getTeam(m.homeTeamId), a = getTeam(m.awayTeamId);
              return (
                <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/8 text-[11px]">
                  <span className="text-[8px] font-black uppercase tracking-widest text-[#39B54A] w-14 shrink-0">{ROUND_LABELS[m.round]}</span>
                  <span className="flex-1 text-white/80 truncate">{h?.flag} {h?.shortName || 'TBD'} <span className="text-white/30">v</span> {a?.shortName || 'TBD'} {a?.flag}</span>
                  <span className="text-[9px] text-white/30 shrink-0">{new Date(m.kickoffMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* News + tour */}
      <div className="flex flex-wrap gap-2 pt-1">
        <a href={ytSearch(`${s.name} World Cup 2026 tour`)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/[0.06] border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white transition-all"><Boxes size={12} /> Video tour</a>
        <a href={`https://news.google.com/search?q=${encodeURIComponent(s.name + ' World Cup 2026')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/[0.06] border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white transition-all"><Newspaper size={12} /> Latest news</a>
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const WorldCupStadiums: React.FC = () => {
  const [selected, setSelected] = useState<WCStadium | null>(null);
  const byCountry = useMemo(() => {
    const order: WCStadium['country'][] = ['USA', 'Mexico', 'Canada'];
    return order.map(c => ({ country: c, flag: WC_STADIUMS.find(s => s.country === c)?.countryFlag || '', list: WC_STADIUMS.filter(s => s.country === c) }));
  }, []);

  return (
    <AnimatePresence mode="wait">
      {selected ? (
        <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
          <StadiumDetail s={selected} onBack={() => setSelected(null)} />
        </motion.div>
      ) : (
        <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={16} className="text-[#FF8C00]" />
              <h2 className="text-lg font-black uppercase tracking-tight text-white">16 Stadiums · 3 Nations</h2>
            </div>
            <p className="text-[11px] text-white/40">The venues of FIFA World Cup 2026 — photos, history, maps & the matches they host.</p>
          </div>
          {byCountry.map(({ country, flag, list }) => (
            <div key={country}>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">{flag} {country} · {list.length}</p>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map(s => <StadiumCard key={s.id} s={s} onClick={() => setSelected(s)} />)}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WorldCupStadiums;
