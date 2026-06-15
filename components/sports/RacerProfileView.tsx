// RacerProfileView — full driver profile for NASCAR / IndyCar / F1.
// Header (accurate TheSportsDB photo + identity) and sections: Championship,
// Recent Results, Bio, News. Pulls the bio/nationality/DOB from TheSportsDB
// (the only reliable photo/metadata source for motorsport); standings, recent
// finishes and news are passed in from the racing center.

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Trophy, Flag, Calendar, Newspaper, User, MapPin, Car, Gauge } from 'lucide-react';
import { fetchRacingDriverDetail, RacingDriver, RacingStanding, RaceEvent } from '../../services/sportsService';

interface Props {
  driver: RacingDriver;
  tab: string;
  seriesColor: string;
  standings: RacingStanding[];
  schedule: RaceEvent[];
  news: any[];
  onClose: () => void;
}

const NAT_FLAG: Record<string, string> = {
  'United States': '🇺🇸', 'USA': '🇺🇸', 'Spain': '🇪🇸', 'New Zealand': '🇳🇿', 'Sweden': '🇸🇪',
  'Mexico': '🇲🇽', 'Denmark': '🇩🇰', 'Australia': '🇦🇺', 'Brazil': '🇧🇷', 'Netherlands': '🇳🇱',
  'United Kingdom': '🇬🇧', 'England': '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', 'Canada': '🇨🇦',
  'France': '🇫🇷', 'Germany': '🇩🇪', 'Japan': '🇯🇵', 'Colombia': '🇨🇴', 'Italy': '🇮🇹',
};

function ageFrom(dob?: string): number | null {
  if (!dob) return null;
  const d = new Date(dob); if (isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
}

const RacerProfileView: React.FC<Props> = ({ driver, tab, seriesColor, standings, schedule, news, onClose }) => {
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    setLoading(true); setDetail(null);
    fetchRacingDriverDetail(driver.name).then(d => { if (!dead) { setDetail(d); setLoading(false); } });
    return () => { dead = true; };
  }, [driver.name]);

  const standing = standings.find(s => s.driverName.toLowerCase() === driver.name.toLowerCase());
  const nationality = detail?.strNationality || driver.nationality || '';
  const age = ageFrom(detail?.dateBorn);
  const photo = detail?.strThumb || detail?.strCutout || driver.headshot || '';
  const bio = (detail?.strDescriptionEN || '').trim();

  // Recent finishes for this driver, newest first.
  const recent = schedule
    .filter(e => e.status === 'post')
    .map(e => ({ event: e, res: e.results?.find(r => r.driverName.toLowerCase() === driver.name.toLowerCase()) }))
    .filter(x => x.res)
    .slice(0, 6);

  const driverNews = news.filter(n => (n.headline || n.title || '').toLowerCase().includes(driver.name.toLowerCase().split(' ').slice(-1)[0])).slice(0, 4);

  const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: seriesColor }}>{icon}</span>
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">{title}</h3>
      </div>
      {children}
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
      <button onClick={onClose} className="flex items-center gap-2 text-white/40 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest">
        <ChevronLeft size={14} /> Back to Drivers
      </button>

      {/* Header */}
      <div className="relative overflow-hidden rounded-[1.75rem] border" style={{ borderColor: `${seriesColor}30`, background: `linear-gradient(160deg, ${seriesColor}18, rgba(255,255,255,0.02))` }}>
        {driver.number && <div style={{ color: seriesColor }} className="absolute right-3 top-2 text-[120px] font-black opacity-[0.07] leading-none select-none pointer-events-none">{driver.number}</div>}
        <div className="relative flex items-end gap-4 p-5">
          <div className="w-28 h-32 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0 flex items-end justify-center">
            {photo
              ? <img src={photo} alt={driver.name} className="w-full h-full object-cover object-top" />
              : <User size={48} className="text-white/15 mb-4" />}
          </div>
          <div className="min-w-0 pb-1">
            {driver.number && <span style={{ background: `${seriesColor}25`, color: seriesColor }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black mb-1.5"><Car size={9} /> #{driver.number}</span>}
            <h1 className="text-2xl font-black uppercase tracking-tight leading-none">{driver.name}</h1>
            <p className="text-[10px] font-bold text-white/45 mt-1 truncate">{driver.teamName}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {driver.manufacturer && <span className="text-[7px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/15 text-white/60">{driver.manufacturer}</span>}
              {nationality && <span className="text-[8px] font-bold text-white/50">{NAT_FLAG[nationality] || ''} {nationality}</span>}
              {age != null && <span className="text-[8px] font-bold text-white/35">· Age {age}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Championship */}
      {standing && (
        <Section icon={<Trophy size={12} />} title={`${tab} Championship`}>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Position', value: standing.rank ? `P${standing.rank}` : '—' },
              { label: 'Points', value: standing.points ?? 0 },
              { label: 'Wins', value: standing.wins ?? 0 },
            ].map(s => (
              <div key={s.label} className="bg-white/[0.04] rounded-xl py-3">
                <p className="text-xl font-black tabular-nums" style={{ color: seriesColor }}>{s.value}</p>
                <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recent results */}
      <Section icon={<Calendar size={12} />} title="Recent Results">
        {recent.length > 0 ? (
          <div className="space-y-1.5">
            {recent.map(({ event, res }) => (
              <div key={event.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.03]">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold truncate">{event.shortName || event.name}</p>
                  <p className="text-[7px] text-white/30 uppercase tracking-widest truncate">{event.venue || event.city}</p>
                </div>
                <span style={{ color: (res!.pos ?? 99) <= 3 ? seriesColor : 'rgba(255,255,255,0.6)' }} className="text-sm font-black tabular-nums shrink-0">P{res!.pos}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[9px] text-white/25 py-2">No recent finishes available for this driver yet this season.</p>
        )}
      </Section>

      {/* Bio */}
      {(bio || loading) && (
        <Section icon={<User size={12} />} title="Biography">
          {loading ? <p className="text-[9px] text-white/25">Loading…</p>
            : bio ? <p className="text-[11px] leading-relaxed text-white/65">{bio.length > 700 ? bio.slice(0, 700) + '…' : bio}</p>
            : null}
        </Section>
      )}

      {/* News */}
      {driverNews.length > 0 && (
        <Section icon={<Newspaper size={12} />} title="In the News">
          <div className="space-y-1.5">
            {driverNews.map((n, i) => (
              <a key={i} href={n.links?.web?.href || n.url || '#'} target="_blank" rel="noreferrer"
                className="block px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] transition-all text-[10px] font-bold text-white/70 hover:text-white">
                {n.headline || n.title}
              </a>
            ))}
          </div>
        </Section>
      )}
    </motion.div>
  );
};

export default RacerProfileView;
