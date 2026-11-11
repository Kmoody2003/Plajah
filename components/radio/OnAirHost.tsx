import React, { useEffect, useState } from 'react';
import { Mic, Sparkles } from 'lucide-react';
import type { PersonaSheet } from '../../services/onair/types';
import { onAirNow, nextOnAir, showHoursLabel } from '../../services/onair/station';
import { fetchOnAirNow, fetchHostLink, type OnAirNow, type HostLine } from '../../services/onair/client';

/**
 * The Plajah FM on-air host: avatar, show, an "AI host" disclosure chip and what they are saying.
 * Voices are not cast yet, so every host line is shown as a caption; the same line feeds TTS later.
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
}

/** The "On air now" strip on the Plajah FM page. */
export const OnAirHostCard: React.FC<CardProps> = ({ host, next, line, onHear }) => {
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
  const [accent] = host.look.palette;
  return (
    <div className="w-full max-w-2xl mb-8 px-5 py-4 rounded-3xl border bg-white/[0.03] text-left" style={{ borderColor: `${accent}55` }}>
      <div className="flex items-center gap-4">
        <HostAvatar host={host} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">On air now</span>
            <AiHostChip host={host} />
          </div>
          <p className="text-base font-black uppercase tracking-tight mt-1 truncate">
            {host.stageName} <span className="text-white/40 font-bold normal-case tracking-normal">· {host.show?.name}</span>
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">{showHoursLabel(host)}</p>
        </div>
      </div>
      {line?.text && (
        <p className="mt-3 text-sm text-white/80 leading-relaxed">
          <span className="font-black" style={{ color: accent }}>{host.stageName.split(' ')[0]}:</span> “{line.text}”
          {line.audioUrl && onHear && (
            <button type="button" onClick={onHear} className="ml-2 inline-flex items-center gap-1 align-middle px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-[9px] font-black uppercase tracking-widest text-white/70 hover:bg-white/10">
              <Mic size={10} /> Hear
            </button>
          )}
        </p>
      )}
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
