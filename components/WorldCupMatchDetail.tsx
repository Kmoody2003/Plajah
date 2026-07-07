import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Users, Shirt, ListOrdered, Newspaper, ExternalLink, Loader2 } from 'lucide-react';
import { fetchMatchDetail, MatchDetail, TeamLineup, LineupPlayer, PosGroup } from '../services/worldCupDepth';

const GROUP_LABEL: Record<PosGroup, string> = { GK: 'Goalkeeper', DEF: 'Defence', MID: 'Midfield', FWD: 'Attack' };
const GROUPS: PosGroup[] = ['GK', 'DEF', 'MID', 'FWD'];

const eventIcon = (e: { type: string; scoreValue?: boolean }) => {
  const t = (e.type || '').toLowerCase();
  if (e.scoreValue || t.includes('goal')) return '⚽';
  if (t.includes('yellow')) return '🟨';
  if (t.includes('red')) return '🟥';
  if (t.includes('sub')) return '🔁';
  if (t.includes('penalt')) return '🥅';
  return '•';
};

const PlayerRow: React.FC<{ p: LineupPlayer; accent: string }> = ({ p, accent }) => (
  <div className="flex items-center gap-2.5 py-1">
    <span className="w-6 text-center text-[11px] font-black tabular-nums shrink-0" style={{ color: accent }}>{p.jersey || '–'}</span>
    <span className="text-[12px] text-white/85 truncate flex-1">{p.name}</span>
    <span className="text-[8px] font-black uppercase tracking-wider text-white/30 shrink-0">{p.pos}</span>
  </div>
);

const LineupColumn: React.FC<{ team?: TeamLineup; accent: string }> = ({ team, accent }) => {
  if (!team) return null;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        {team.logo && <img src={team.logo} alt="" className="w-6 h-6 object-contain" />}
        <span className="text-sm font-black text-white truncate">{team.name}</span>
        {team.formation && <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-black tabular-nums" style={{ background: `${accent}22`, color: accent }}>{team.formation}</span>}
      </div>
      {team.xi.length === 0 ? (
        <p className="text-[11px] text-white/30 italic">Lineup not published yet.</p>
      ) : GROUPS.map(g => {
        const line = team.xi.filter(p => p.group === g);
        if (!line.length) return null;
        return (
          <div key={g} className="mb-2">
            <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/25 mb-0.5">{GROUP_LABEL[g]}</p>
            {line.map(p => <PlayerRow key={p.id + p.jersey} p={p} accent={accent} />)}
          </div>
        );
      })}
      {team.bench.length > 0 && (
        <div className="mt-3 pt-2 border-t border-white/8">
          <p className="text-[8px] font-black uppercase tracking-[0.25em] text-white/25 mb-1">Bench</p>
          <p className="text-[11px] text-white/45 leading-relaxed">{team.bench.map(b => `${b.jersey ? b.jersey + ' ' : ''}${b.name}`).join(' · ')}</p>
        </div>
      )}
    </div>
  );
};

interface Props {
  eventId: string;
  title?: string;
  onClose: () => void;
  onOpenFanRoom?: () => void;
}

const WorldCupMatchDetail: React.FC<Props> = ({ eventId, title, onClose, onOpenFanRoom }) => {
  const [data, setData] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'lineups' | 'timeline' | 'reports'>('lineups');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchMatchDetail(eventId).then(d => { if (alive) { setData(d); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasLineups = !!(data?.home?.xi.length || data?.away?.xi.length);
  const tabs: { id: typeof tab; label: string; icon: any }[] = [
    { id: 'lineups', label: 'Lineups', icon: Shirt },
    { id: 'timeline', label: 'Timeline', icon: ListOrdered },
    { id: 'reports', label: 'Reports', icon: Newspaper },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[88vh] bg-[#0b0b0e] border border-white/12 rounded-3xl overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">⚽</span>
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[#39B54A]">FIFA World Cup 2026 · Match Centre</p>
              <h3 className="text-sm font-black text-white truncate">{title || data?.status || 'Match'}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenFanRoom && (
              <button onClick={onOpenFanRoom} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#39B54A] text-black text-[9px] font-black uppercase tracking-widest hover:bg-[#39B54A]/90 transition-all"><Users size={11} /> Fan Room</button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white transition-colors"><X size={15} /></button>
          </div>
        </div>

        <div className="flex gap-1 px-4 pt-3 border-b border-white/8">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-t-lg transition-all ${tab === t.id ? 'text-white border-b-2 border-[#39B54A]' : 'text-white/35 hover:text-white/70'}`}>
              <t.icon size={12} /> {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-white/40"><Loader2 size={22} className="animate-spin" /></div>
          ) : tab === 'lineups' ? (
            hasLineups ? (
              <div className="flex flex-col sm:flex-row gap-6">
                <LineupColumn team={data?.home} accent="#39B54A" />
                <div className="w-px bg-white/8" />
                <LineupColumn team={data?.away} accent="#00B4D8" />
              </div>
            ) : (
              <p className="text-[12px] text-white/40 text-center py-12">Lineups are published about an hour before kickoff. Check back closer to the match.</p>
            )
          ) : tab === 'timeline' ? (
            (data?.events?.length ? (
              <div className="space-y-2">
                {data.events.map((e, i) => (
                  <div key={i} className={`flex items-start gap-3 p-2.5 rounded-xl ${e.scoreValue ? 'bg-[#39B54A]/10 border border-[#39B54A]/20' : 'bg-white/[0.03]'}`}>
                    <span className="text-base leading-none shrink-0">{eventIcon(e)}</span>
                    <span className="w-10 text-[11px] font-black tabular-nums text-white/50 shrink-0">{e.clock}</span>
                    <div className="min-w-0"><p className="text-[12px] text-white/85 leading-snug">{e.text}</p>{e.team && <p className="text-[9px] text-white/35 uppercase tracking-wider mt-0.5">{e.team}</p>}</div>
                  </div>
                ))}
              </div>
            ) : <p className="text-[12px] text-white/40 text-center py-12">No key events yet.</p>)
          ) : (
            (data?.reports?.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.reports.map((r, i) => (
                  <a key={i} href={r.href} target="_blank" rel="noopener noreferrer" className="group flex flex-col rounded-2xl overflow-hidden bg-white/[0.03] border border-white/8 hover:border-white/20 transition-all">
                    {r.image && <img src={r.image} alt="" className="w-full h-28 object-cover" />}
                    <div className="p-3">
                      <p className="text-[8px] font-black uppercase tracking-widest text-[#39B54A] mb-1">{r.source}</p>
                      <p className="text-[12px] font-bold text-white leading-snug line-clamp-3 group-hover:text-white">{r.headline}</p>
                      <div className="mt-1.5 flex items-center gap-1 text-[9px] text-white/30"><ExternalLink size={9} /> Read report</div>
                    </div>
                  </a>
                ))}
              </div>
            ) : <p className="text-[12px] text-white/40 text-center py-12">No match reports published yet.</p>)
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default WorldCupMatchDetail;
