import React from 'react';
import { Radio, Sparkles } from 'lucide-react';
import { getPersona } from '../../services/onair/roster';
import { showHoursLabel } from '../../services/onair/station';
import type { PersonaSheet } from '../../services/onair/types';
import { useOnAirHost } from '../radio/OnAirHost';

/**
 * OnAirBillboard — Plajah's own staff in the side pillar.
 *
 *  • focus "show": the host on Plajah FM right now (or the next show when the hour is unhosted).
 *  • focus <artist id>: one of the virtual artists (VYRA, Orsolya Wren, Remi Lux).
 *
 * Every card carries the AI-character disclosure. Clicking tunes in to Plajah FM.
 */

interface Props {
  focus: 'show' | string;
  onListen: () => void;
  dotCount?: number;
  dotIdx?: number;
}

const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
function daysLabel(days: string[]): string {
  const k = days.join(',');
  if (k === 'mon,tue,wed,thu,fri') return 'Weekdays';
  if (days.length === 7) return 'Every night';
  if (k === 'sat,sun' || k === 'sun,sat') return 'Weekends';
  return days.map(d => DAY_LABEL[d] || d).join(' · ');
}

const Portrait: React.FC<{ p: PersonaSheet }> = ({ p }) => {
  const [ok, setOk] = React.useState(true);
  const [a, b, c] = p.look.palette;
  const initials = p.stageName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 30% 20%, ${b}, ${a} 55%, ${c})` }}>
      <span className="absolute inset-0 grid place-items-center font-black text-white/25 select-none" style={{ fontSize: '9rem', letterSpacing: '-0.05em' }}>{initials}</span>
      {ok && p.look.portrait && <img src={p.look.portrait} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setOk(false)} />}
    </div>
  );
};

const OnAirBillboard: React.FC<Props> = ({ focus, onListen, dotCount = 0, dotIdx = 0 }) => {
  const { host, next } = useOnAirHost();
  const artist = focus !== 'show' ? getPersona(focus) : undefined;
  const p = artist ?? host ?? next?.host ?? null;
  if (!p) return null;

  const live = !artist && !!host;
  const kicker = artist
    ? `Virtual artist · ${p.artist?.genre ?? ''}`
    : live ? 'On air now · Plajah FM' : `Coming up${next ? (next.inHours <= 1 ? ' within the hour' : ` in ${next.inHours}h`) : ''} · Plajah FM`;
  const title = artist ? p.stageName : p.show?.name ?? p.stageName;
  const sub = artist
    ? (p.artist?.subgenres ?? []).slice(0, 3).join(' · ')
    : `with ${p.stageName} · ${p.show ? `${daysLabel(p.show.days)} ${showHoursLabel(p)}` : ''}`;
  const accent = p.look.palette[0];

  return (
    <button type="button" onClick={onListen} className="group relative block w-full h-full text-left overflow-hidden cursor-pointer">
      <Portrait p={p} />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />

      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-[8px] font-black uppercase tracking-widest text-white/80 border border-white/15">
          {live && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
          {kicker}
        </span>
        <span title={p.account.disclosure} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-[8px] font-black uppercase tracking-widest text-white/60 border border-white/15">
          <Sparkles size={9} /> AI character
        </span>
      </div>

      <div className="absolute bottom-8 left-4 right-4">
        <p className="text-2xl font-black uppercase tracking-tight leading-none text-white drop-shadow-lg">{title}</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mt-2">{sub}</p>
        <p className="text-xs text-white/75 mt-3 leading-snug line-clamp-3">{p.backstory.tagline}</p>
        <span
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-black group-hover:scale-105 transition-transform"
          style={{ background: accent }}
        >
          <Radio size={13} /> {artist ? 'Hear it on Plajah FM' : live ? 'Listen live' : 'Tune in to Plajah FM'}
        </span>
      </div>

      {dotCount > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
          {Array.from({ length: Math.min(dotCount, 7) }).map((_, i) => (
            <span key={i} className="rounded-full transition-all duration-300"
              style={{ width: i === dotIdx % Math.min(dotCount, 7) ? '16px' : '5px', height: '5px', background: i === dotIdx % Math.min(dotCount, 7) ? '#ff8c00' : 'rgba(255,255,255,0.2)' }} />
          ))}
        </div>
      )}
    </button>
  );
};

export default OnAirBillboard;
