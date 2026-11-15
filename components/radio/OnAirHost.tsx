import React, { useEffect, useState } from 'react';
import { Mic, Sparkles, Radio } from 'lucide-react';
import type { PersonaSheet } from '../../services/onair/types';
import { onAirNow, nextOnAir, showHoursLabel, todaysLineup, blockHoursLabel, type LineupBlock } from '../../services/onair/station';
import { fetchOnAirNow, fetchHostLink, type OnAirNow, type HostLine } from '../../services/onair/client';

/**
 * The Plajah FM on-air host: avatar, show, an "AI host" disclosure chip and what they are saying.
 * Every host line is shown as a caption; when the server has a voiced clip it plays over the music too.
 */

/** Who is on air, from the server (station time), re-checked every minute; local roster if offline. */
export function useOnAirHost(): OnAirNow {
  const [state, setState] = useState<OnAirNow>(() => ({ host: onAirNow(), next: nextOnAir() }));
  useEffect(() => {
    let alive = true;
    const load = () => fetchOnAirNow().then(s => { if (alive) setState(s); });
    load();
    const iv = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  return state;
}

/** The server-written line for this moment (null while loading or when nobody is on air). */
export function useHostLine(host: PersonaSheet | null, body: Parameters<typeof fetchHostLink>[1] | null): HostLine | null {
  const [line, setLine] = useState<HostLine | null>(null);
  const key = host && body ? JSON.stringify([host.id, body.kind, body.prev?.id, body.next?.id, body.channelName, body.maxSec]) : '';
  useEffect(() => {
    setLine(null);
    if (!host || !body) return;
    let alive = true;
    fetchHostLink(host, body).then(l => { if (alive) setLine(l); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return line;
}

export const HostAvatar: React.FC<{ host: PersonaSheet; size?: number }> = ({ host, size = 56 }) => {
  const [portraitOk, setPortraitOk] = useState(true);
  const [a, b, c] = host.look.palette;
  const initials = host.stageName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="relative shrink-0 rounded-2xl overflow-hidden grid place-items-center font-black text-white"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${a}, ${b} 60%, ${c})`, fontSize: size * 0.36 }}
      aria-label={host.stageName}
    >
      <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{initials}</span>
      {portraitOk && host.look.portrait && (
        <img src={host.look.portrait} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setPortraitOk(false)} />
      )}
    </div>
  );
};

export const AiHostChip: React.FC<{ host: PersonaSheet }> = ({ host }) => (
  <span
    title={host.account.disclosure}
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-[8px] font-black uppercase tracking-[0.2em] text-white/60"
  >
    <Sparkles size={9} /> AI host
  </span>
);

interface CardProps {
  host: PersonaSheet | null;
  next: OnAirNow['next'];
  line?: HostLine | null;
  /** Replays the host's line (shown when the line has audio). */
  onHear?: () => void;
  /** True while the station is playing here — the host only "talks" when you're listening. */
  live?: boolean;
}

/** Animated level bars while the host is talking (the caption is on screen either way). */
const TalkMeter: React.FC<{ color: string }> = ({ color }) => (
  <span className="inline-flex items-end gap-[2px] h-3" aria-hidden>
    {[0, 1, 2, 3].map(i => (
      <span key={i} className="w-[3px] rounded-full onair-talk" style={{ background: color, animationDelay: `${i * 0.12}s` }} />
    ))}
    <style>{`@keyframes onairTalk{0%,100%{height:3px}50%{height:12px}}.onair-talk{height:3px;animation:onairTalk .7s ease-in-out infinite}`}</style>
  </span>
);

/** The "On air now" booth on the Plajah FM page: who's hosting, what they just said, what the show does. */
export const OnAirHostCard: React.FC<CardProps> = ({ host, next, line, onHear, live }) => {
  // A fresh line "goes out" for about as long as it takes to say it.
  const [talking, setTalking] = useState(false);
  useEffect(() => {
    if (!line?.text || !live) { setTalking(false); return; }
    setTalking(true);
    const t = setTimeout(() => setTalking(false), Math.max(4, Math.min(20, line.estSec || 6)) * 1000);
    return () => clearTimeout(t);
  }, [line?.text, live]);

  if (!host) {
    return (
      <div className="w-full max-w-2xl mb-8 px-5 py-4 rounded-3xl border border-white/10 bg-white/[0.03] flex items-center gap-4 text-left">
        <div className="w-12 h-12 rounded-2xl bg-white/5 grid place-items-center shrink-0"><Mic size={18} className="text-white/40" /></div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Music only right now</p>
          {next && (
            <p className="text-xs text-white/60 mt-1">
              Next host: <span className="text-white font-bold">{next.host.stageName}</span> on {next.host.show?.name}
              {' '}in {next.inHours === 1 ? 'about an hour' : `${next.inHours} hours`}
            </p>
          )}
        </div>
      </div>
    );
  }
  const [accent, accent2] = host.look.palette;
  const show = host.show;
  return (
    <div
      className="w-full max-w-2xl mb-8 rounded-3xl border text-left overflow-hidden"
      style={{ borderColor: `${accent}55`, background: `linear-gradient(135deg, ${accent}14, transparent 55%, ${accent2}10)` }}
    >
      <div className="px-5 pt-4 flex items-center gap-4">
        <div className="relative">
          <HostAvatar host={host} size={68} />
          {talking && <span className="absolute -inset-1 rounded-[1.1rem] border-2 animate-pulse pointer-events-none" style={{ borderColor: accent }} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">On air now</span>
            <AiHostChip host={host} />
            {talking && <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest" style={{ color: accent }}><TalkMeter color={accent} /> Talking</span>}
          </div>
          <p className="text-lg font-black uppercase tracking-tight mt-1 truncate">{host.stageName}</p>
          <p className="text-[11px] font-bold text-white/50 truncate">
            {show?.name} <span className="text-white/30">· {showHoursLabel(host)}{show?.format === 'dj' ? ' · DJ set' : ''}</span>
          </p>
        </div>
      </div>

      <div className="px-5 py-3">
        {line?.text ? (
          <div className="rounded-2xl px-4 py-3 bg-black/30 border border-white/10">
            <p className="text-sm text-white/85 leading-relaxed">
              <span className="font-black" style={{ color: accent }}>{host.stageName.split(' ')[0]}:</span> “{line.text}”
            </p>
            {line.audioUrl && onHear && (
              <button type="button" onClick={onHear} className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-[9px] font-black uppercase tracking-widest text-white/70 hover:bg-white/10">
                <Mic size={10} /> Hear it again
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-white/40 italic">{host.personality.catchphrases[0] || `${show?.name} on Plajah FM`}</p>
        )}
      </div>

      {show && (
        <div className="px-5 pb-4 flex flex-wrap gap-1.5">
          {show.features.map(ft => (
            <span key={ft.id} title={ft.how} className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border" style={{ borderColor: `${accent}44`, color: accent }}>
              {ft.name}
            </span>
          ))}
          {show.genres.slice(0, 4).map(g => (
            <span key={g} className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest bg-white/5 text-white/45">{g}</span>
          ))}
          <span className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest bg-white/5 text-white/45">
            {show.takesCallers ? 'Takes requests' : 'Chat only'}
          </span>
        </div>
      )}
    </div>
  );
};

/** Today on Plajah FM: every show in station time, the one on air lit up, music-only stretches marked. */
export const TodayLineup: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const [blocks, setBlocks] = useState<LineupBlock[]>(() => todaysLineup());
  useEffect(() => {
    const iv = setInterval(() => setBlocks(todaysLineup()), 60_000);
    return () => clearInterval(iv);
  }, []);
  const nowIdx = blocks.findIndex(b => b.onAir);
  // Compact (sidebar): from the show on air through the rest of the day.
  const shown = compact ? blocks.slice(Math.max(0, nowIdx)) : blocks;
  return (
    <div className="space-y-1.5">
      {shown.map(b => {
        const accent = b.host?.look.palette[0] ?? '#ffffff';
        return (
          <div
            key={`${b.start}-${b.host?.id ?? 'music'}`}
            className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all ${b.onAir ? 'bg-white/[0.06]' : 'border-transparent opacity-70'}`}
            style={b.onAir ? { borderColor: `${accent}66` } : undefined}
          >
            {b.host ? <HostAvatar host={b.host} size={28} /> : (
              <div className="w-7 h-7 rounded-lg bg-white/5 grid place-items-center shrink-0"><Radio size={12} className="text-white/40" /></div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold truncate leading-tight">{b.host ? b.host.show?.name : 'Plajah FM music'}</p>
              <p className="text-[9px] text-white/40 uppercase tracking-wider truncate">
                {blockHoursLabel(b)}{b.host ? ` · ${b.host.stageName}` : ''}
              </p>
            </div>
            {b.onAir && <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full" style={{ background: `${accent}33`, color: accent }}>Live</span>}
          </div>
        );
      })}
      <p className="text-[9px] text-white/25 px-1 pt-1">Eastern time (station clock). Every host is an AI persona.</p>
    </div>
  );
};

/** The host's caption over a break's Plajah FM stretch (a lower third). */
export const HostCaption: React.FC<{ host: PersonaSheet; text: string }> = ({ host, text }) => (
  <div className="absolute left-[6%] right-[6%] bottom-[7%] z-[35] pointer-events-none flex justify-center">
    <div className="flex items-center gap-3 max-w-3xl px-4 py-3 rounded-2xl bg-black/70 backdrop-blur border border-white/10 shadow-2xl">
      <HostAvatar host={host} size={44} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/60">{host.stageName} · {host.show?.name}</span>
          <AiHostChip host={host} />
        </div>
        <p className="text-sm md:text-base text-white leading-snug mt-0.5">{text}</p>
      </div>
    </div>
  </div>
);
