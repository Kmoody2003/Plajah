// MotionRosterBrowser — the Studio Roster behind the Motion Council: animators and motion designers from anime,
// cartoon, graphic design, CG, stop-motion, experimental, games and world traditions, across the eras. Browse by
// guild and decade, search by style ("claymation", "y2k", "ink wash"), open a member to read their ethos,
// lineage and signature moves, and pin them into the crew. Used inside MotionCouncilPanel; renders standalone too.
import React, { useMemo, useState } from 'react';
import { Search, Pin, PinOff, ChevronDown } from 'lucide-react';
import { MOTION_ROSTER, ROSTER_GUILDS, eraFacets, eraLabel, guildLabel, searchRoster, rosterTension, type RosterGuild, type RosterMember } from '../../../services/motion/council/motionRoster';
import { MOTION_PERSONAS } from '../../../services/motion/council/motionCouncilPersonas';

const AC = '#3DD6FF';
const AC_SOFT = '#B6ECFF';

/** One accent per guild so a crew reads at a glance. */
export const GUILD_HUE: Record<RosterGuild, string> = {
  ANIME: '#FF6FA8', CARTOON: '#FFC23D', GRAPHIC: '#FF7A45', CG: '#7C8CFF',
  STOP_MOTION: '#C98B5A', EXPERIMENTAL: '#B57CFF', GAME: '#3DFFA0', WORLD: '#3DD6FF',
};

export default function MotionRosterBrowser({ pinned = [], onTogglePin, crew = [] }: {
  pinned?: string[];
  onTogglePin?: (id: string) => void;
  /** current crew — members in it are marked, and tensions with the crew are shown when a card opens */
  crew?: string[];
}) {
  const [q, setQ] = useState('');
  const [guild, setGuild] = useState<RosterGuild | ''>('');
  const [era, setEra] = useState<number | ''>('');
  const [open, setOpen] = useState<string | null>(null);
  const decades = useMemo(eraFacets, []);

  const list = useMemo(() => {
    let l: RosterMember[] = q.trim() ? searchRoster(q) : MOTION_ROSTER.slice();
    if (guild) l = l.filter(m => m.guild === guild);
    if (era !== '') l = l.filter(m => era >= m.eras[0] && era <= m.eras[1]);
    return l;
  }, [q, guild, era]);

  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5">
          <Search size={12} className="text-white/35" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search styles — claymation, y2k, ink wash, sakuga…"
            className="flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/25" />
        </div>
        <select value={era === '' ? '' : String(era)} onChange={e => setEra(e.target.value ? parseInt(e.target.value, 10) : '')}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white outline-none">
          <option value="" className="bg-[#0c0f14]">Any era</option>
          {decades.map(d => <option key={d} value={d} className="bg-[#0c0f14]">{d}s</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        <button onClick={() => setGuild('')} className="text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-1 border"
          style={guild === '' ? { color: '#04121a', background: AC, borderColor: AC } : { color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.12)' }}>
          All {MOTION_ROSTER.length}
        </button>
        {ROSTER_GUILDS.map(g => {
          const on = guild === g.id; const hue = GUILD_HUE[g.id];
          return (
            <button key={g.id} onClick={() => setGuild(on ? '' : g.id)} title={g.blurb}
              className="text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-1 border"
              style={on ? { color: '#0c0f14', background: hue, borderColor: hue } : { color: hue, borderColor: `${hue}40` }}>
              {g.label}
            </button>
          );
        })}
      </div>

      <div className="max-h-[360px] overflow-y-auto pr-1 space-y-1">
        {list.map(m => {
          const hue = GUILD_HUE[m.guild];
          const isPinned = pinned.includes(m.id);
          const inCrew = crew.includes(m.id);
          const expanded = open === m.id;
          const rivals = crew.filter(id => id !== m.id).map(id => rosterTension(m.id, id)).filter(Boolean) as string[];
          return (
            <div key={m.id} className="rounded-lg border bg-white/[0.02]" style={{ borderColor: inCrew ? `${hue}66` : 'rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="w-1.5 h-6 rounded-full shrink-0" style={{ background: hue }} />
                <button onClick={() => setOpen(expanded ? null : m.id)} className="flex-1 min-w-0 text-left">
                  <div className="text-[12px] font-bold text-white/85 truncate">{m.name}</div>
                  <div className="text-[9px] uppercase tracking-widest text-white/35 truncate">{guildLabel(m.guild)} · {eraLabel(m)} · {m.styles.slice(0, 3).join(' · ')}</div>
                </button>
                {inCrew && <span className="text-[8px] font-black uppercase tracking-widest shrink-0" style={{ color: hue }}>in crew</span>}
                {onTogglePin && (
                  <button onClick={() => onTogglePin(m.id)} title={isPinned ? 'Unpin from crew' : 'Pin into crew'}
                    className="shrink-0 rounded-md p-1 border" style={isPinned ? { color: '#0c0f14', background: hue, borderColor: hue } : { color: hue, borderColor: `${hue}40` }}>
                    {isPinned ? <PinOff size={11} /> : <Pin size={11} />}
                  </button>
                )}
                <ChevronDown size={12} className={`text-white/30 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </div>
              {expanded && (
                <div className="px-3 pb-2 space-y-1.5 text-[11px] leading-snug">
                  <p className="text-white/75 italic">“{m.ethos}”</p>
                  <p className="text-white/50"><span className="text-white/30 uppercase tracking-widest text-[9px] mr-1">Background</span>{m.background}</p>
                  <p className="text-white/50"><span className="text-white/30 uppercase tracking-widest text-[9px] mr-1">Lineage</span>{m.lineage}</p>
                  <p className="text-white/50"><span className="text-white/30 uppercase tracking-widest text-[9px] mr-1">Voice</span>{m.voice}</p>
                  <ul className="space-y-0.5">
                    {m.signature.map((s, i) => <li key={i} className="text-white/65 flex gap-1.5"><span style={{ color: hue }}>▸</span><span>{s}</span></li>)}
                  </ul>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    <Tag hue={AC}>{m.timing.fps} fps</Tag>
                    <Tag hue={AC}>{m.timing.on === 'mixed' ? 'ones + twos' : `on ${['', 'ones', 'twos', 'threes'][m.timing.on]}`}</Tag>
                    <Tag hue={AC}>{m.timing.ease}</Tag>
                    <Tag hue={AC_SOFT}>seat · {MOTION_PERSONAS[m.seat].name.replace(/^The /, '')}</Tag>
                    <Tag hue={AC_SOFT}>art lens · {m.artLens.toLowerCase().replace('_', ' ')}</Tag>
                  </div>
                  <p className="text-white/40"><span className="text-white/30 uppercase tracking-widest text-[9px] mr-1">Surface</span>{m.texture}</p>
                  {m.culturalNote && <p className="text-amber-300/70"><span className="uppercase tracking-widest text-[9px] mr-1">Respect</span>{m.culturalNote}</p>}
                  {rivals.map((t, i) => <p key={i} className="text-amber-400/70">⚡ {t}</p>)}
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && <p className="text-[11px] text-white/30 px-1 py-2">No one on the roster matches — try another style word or clear the era.</p>}
      </div>
    </div>
  );
}

function Tag({ hue, children }: { hue: string; children: React.ReactNode }) {
  return <span className="text-[9px] font-mono rounded px-1.5 py-0.5" style={{ color: hue, background: `${hue}14`, border: `1px solid ${hue}33` }}>{children}</span>;
}
