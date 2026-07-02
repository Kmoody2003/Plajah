import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Youtube, MessageCircle, ExternalLink, Play, Radio } from 'lucide-react';
import { fetchWorldCupWindow } from '../services/sportsService';
import { matchWcTeam } from '../services/worldCupVictory';

// FIFA's official YouTube channel (uploads) — legal, always-current highlights during the Cup.
const FIFA_UPLOADS = 'UUpcTrCXblq78GZrTUTLWeBw';
const ytSearch = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

interface HL { id: string; a: string; b: string; flagA?: string; flagB?: string; logoA?: string; logoB?: string; score?: string; when: number; }

const HighlightCard: React.FC<{ h: HL }> = ({ h }) => (
  <a
    href={ytSearch(`${h.a} vs ${h.b} highlights FIFA World Cup 2026`)}
    target="_blank" rel="noopener noreferrer"
    className="group shrink-0 w-[220px] rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] hover:border-[#FF0000]/40 transition-all"
  >
    <div className="relative h-24 flex items-center justify-center gap-3" style={{ background: 'linear-gradient(135deg,#1a1a1a,#0a0a0a)' }}>
      {h.logoA ? <img src={h.logoA} alt="" className="w-9 h-9 object-contain" /> : <span className="text-2xl">{h.flagA}</span>}
      <span className="text-[9px] font-black text-white/40">VS</span>
      {h.logoB ? <img src={h.logoB} alt="" className="w-9 h-9 object-contain" /> : <span className="text-2xl">{h.flagB}</span>}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
        <div className="w-10 h-10 rounded-full bg-[#FF0000] flex items-center justify-center"><Play size={16} className="text-white fill-white ml-0.5" /></div>
      </div>
    </div>
    <div className="p-2.5">
      <p className="text-[11px] font-black text-white truncate">{h.a} <span className="text-white/40">v</span> {h.b}</p>
      <p className="text-[8px] font-black uppercase tracking-widest text-[#FF0000] mt-0.5 flex items-center gap-1"><Youtube size={9} /> Watch highlights</p>
    </div>
  </a>
);

const WorldCupBuzz: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const xRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let a = true;
    fetchWorldCupWindow().then(e => { if (a) setEvents(e || []); }).catch(() => {});
    return () => { a = false; };
  }, []);

  // Recent finished matches → highlight cards.
  const highlights = useMemo<HL[]>(() => {
    return (events || [])
      .filter(e => e?.status?.type?.state === 'post')
      .sort((x, y) => +new Date(y.date) - +new Date(x.date))
      .slice(0, 12)
      .map(e => {
        const cs = e.competitions?.[0]?.competitors || [];
        const [ca, cb] = cs;
        return {
          id: String(e.id),
          a: ca?.team?.displayName || ca?.team?.name || 'Team', b: cb?.team?.displayName || cb?.team?.name || 'Team',
          flagA: matchWcTeam(ca?.team)?.flag, flagB: matchWcTeam(cb?.team)?.flag,
          logoA: ca?.team?.logos?.[0]?.href, logoB: cb?.team?.logos?.[0]?.href,
          score: `${ca?.score ?? ''}-${cb?.score ?? ''}`, when: +new Date(e.date),
        };
      });
  }, [events]);

  // Load X (Twitter) embed widget once for the social timeline.
  useEffect(() => {
    const existing = document.getElementById('twitter-wjs');
    const render = () => { try { (window as any).twttr?.widgets?.load?.(xRef.current); } catch { /* */ } };
    if (existing) { render(); return; }
    const s = document.createElement('script');
    s.id = 'twitter-wjs'; s.src = 'https://platform.twitter.com/widgets.js'; s.async = true;
    s.onload = render;
    document.body.appendChild(s);
  }, []);

  return (
    <div className="space-y-5">
      {/* ── Highlights ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Youtube size={16} className="text-[#FF0000]" />
            <h3 className="text-sm font-black uppercase tracking-tight text-white">Match Highlights</h3>
          </div>
          <a href={ytSearch('FIFA World Cup 2026 highlights')} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            More on YouTube <ExternalLink size={10} />
          </a>
        </div>
        {highlights.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1" style={{ scrollbarWidth: 'none' }}>
            {highlights.map(h => <HighlightCard key={h.id} h={h} />)}
          </div>
        ) : (
          <p className="text-[11px] text-white/35">Highlights appear here as matches finish.</p>
        )}
        {/* Official FIFA feed */}
        <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 bg-black aspect-video max-h-[340px]">
          <iframe
            title="FIFA World Cup on YouTube"
            src={`https://www.youtube-nocookie.com/embed/videoseries?list=${FIFA_UPLOADS}&rel=0&modestbranding=1`}
            className="w-full h-full border-none"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      </div>

      {/* ── Social buzz (X) ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-[#1DA1F2]" />
            <h3 className="text-sm font-black uppercase tracking-tight text-white">The Conversation · On X</h3>
          </div>
          <a href="https://x.com/search?q=%23FIFAWorldCup" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
            Open on X <ExternalLink size={10} />
          </a>
        </div>
        <div ref={xRef} className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] min-h-[220px] max-h-[520px] overflow-y-auto custom-scrollbar">
          <a className="twitter-timeline" data-theme="dark" data-chrome="noheader nofooter transparent" data-tweet-limit="8"
            href="https://twitter.com/search?q=%23FIFAWorldCup%20OR%20%23WorldCup2026&src=typed_query&f=live">
            <span className="block p-6 text-[11px] text-white/40 flex items-center gap-2"><Radio size={12} className="animate-pulse" /> Loading the live World Cup conversation on X…</span>
          </a>
        </div>
      </div>
    </div>
  );
};

export default WorldCupBuzz;
