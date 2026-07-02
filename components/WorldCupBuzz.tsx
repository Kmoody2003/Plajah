import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Youtube, MessageCircle, ExternalLink, Play, Radio, X, Clapperboard, Loader2 } from 'lucide-react';
import { fetchWorldCupWindow } from '../services/sportsService';
import { matchWcTeam } from '../services/worldCupVictory';
import { fetchWcVideos, WcVideo } from '../services/worldCupDepth';
import { resolveVideoId } from '../services/youtubeService';
import YouTubeModal from './YouTubeModal';
import Hls from 'hls.js';

const ytSearch = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

interface HL { id: string; a: string; b: string; flagA?: string; flagB?: string; logoA?: string; logoB?: string; score?: string; when: number; }

const HighlightCard: React.FC<{ h: HL; onPlay: (m: { videoId: string; title: string; url: string }) => void }> = ({ h, onPlay }) => {
  const [loading, setLoading] = useState(false);
  const q = `${h.a} vs ${h.b} highlights FIFA World Cup 2026`;
  const url = ytSearch(q);
  const click = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    // Resolve the match highlight to an embeddable video (server holds the API
    // key); play inline if found, otherwise fall back to opening YouTube.
    const id = await resolveVideoId(q);
    setLoading(false);
    if (id) onPlay({ videoId: id, title: `${h.a} v ${h.b} — Highlights`, url });
    else window.open(url, '_blank', 'noopener');
  };
  return (
    <a href={url} onClick={click} target="_blank" rel="noopener noreferrer"
      className="group shrink-0 w-[220px] rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] hover:border-[#FF0000]/40 transition-all">
      <div className="relative h-24 flex items-center justify-center gap-3" style={{ background: 'linear-gradient(135deg,#1a1a1a,#0a0a0a)' }}>
        {h.logoA ? <img src={h.logoA} alt="" className="w-9 h-9 object-contain" /> : <span className="text-2xl">{h.flagA}</span>}
        <span className="text-[9px] font-black text-white/40">VS</span>
        {h.logoB ? <img src={h.logoB} alt="" className="w-9 h-9 object-contain" /> : <span className="text-2xl">{h.flagB}</span>}
        <div className={`absolute inset-0 flex items-center justify-center transition-opacity bg-black/40 ${loading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <div className="w-10 h-10 rounded-full bg-[#FF0000] flex items-center justify-center">
            {loading ? <Loader2 size={16} className="text-white animate-spin" /> : <Play size={16} className="text-white fill-white ml-0.5" />}
          </div>
        </div>
      </div>
      <div className="p-2.5">
        <p className="text-[11px] font-black text-white truncate">{h.a} <span className="text-white/40">v</span> {h.b}</p>
        <p className="text-[8px] font-black uppercase tracking-widest text-[#FF0000] mt-0.5 flex items-center gap-1"><Youtube size={9} /> Watch highlights</p>
      </div>
    </a>
  );
};

// Official ESPN clip card + inline HLS player (real, embeddable — replaces the blocked FIFA embed).
const EspnClip: React.FC<{ v: WcVideo; onPlay: () => void }> = ({ v, onPlay }) => (
  <button onClick={onPlay} className="group shrink-0 w-[240px] rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] hover:border-[#FF8C00]/40 transition-all text-left">
    <div className="relative h-32 bg-black">
      {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />}
      <div className="absolute inset-0 flex items-center justify-center bg-black/15 group-hover:bg-black/40 transition-colors">
        <div className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center"><Play size={18} className="text-black fill-black ml-0.5" /></div>
      </div>
      {v.duration > 0 && <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-black tabular-nums">{Math.floor(v.duration / 60)}:{String(v.duration % 60).padStart(2, '0')}</span>}
    </div>
    <div className="p-2.5"><p className="text-[11px] font-bold text-white leading-snug line-clamp-2">{v.headline}</p><p className="text-[8px] font-black uppercase tracking-widest text-[#FF8C00] mt-1 flex items-center gap-1"><Clapperboard size={9} /> ESPN · Watch</p></div>
  </button>
);

const ClipPlayer: React.FC<{ clip: WcVideo; onClose: () => void }> = ({ clip, onClose }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current; if (!v || !clip.hls) return;
    if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = clip.hls; v.play().catch(() => {}); return; }
    if (Hls.isSupported()) { const h = new Hls(); h.loadSource(clip.hls); h.attachMedia(v); v.play?.().catch(() => {}); return () => h.destroy(); }
    v.src = clip.hls;
  }, [clip.hls]);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2 gap-3">
          <p className="text-[12px] font-black text-white truncate">{clip.headline}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white shrink-0"><X size={15} /></button>
        </div>
        <video ref={ref} controls autoPlay playsInline poster={clip.thumbnail} className="w-full rounded-2xl bg-black aspect-video" />
        {clip.web && <a href={clip.web} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white"><ExternalLink size={10} /> Open on ESPN</a>}
      </div>
    </div>
  );
};

const WorldCupBuzz: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [videos, setVideos] = useState<WcVideo[]>([]);
  const [playing, setPlaying] = useState<WcVideo | null>(null);
  const [ytModal, setYtModal] = useState<{ videoId: string; title: string; url: string } | null>(null);
  useEffect(() => { let a = true; fetchWcVideos().then(v => { if (a) setVideos(v || []); }).catch(() => {}); return () => { a = false; }; }, []);
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
            {highlights.map(h => <HighlightCard key={h.id} h={h} onPlay={setYtModal} />)}
          </div>
        ) : (
          <p className="text-[11px] text-white/35">Highlights appear here as matches finish.</p>
        )}
        {/* Official ESPN clips — playable inline (the FIFA YouTube channel blocks embedding). */}
        {videos.length > 0 && (
          <div className="mt-3">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-2">Official clips · ESPN</p>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1" style={{ scrollbarWidth: 'none' }}>
              {videos.map(v => <EspnClip key={v.id} v={v} onPlay={() => (v.hls ? setPlaying(v) : window.open(v.web, '_blank', 'noopener'))} />)}
            </div>
          </div>
        )}
      </div>

      {playing && <ClipPlayer clip={playing} onClose={() => setPlaying(null)} />}
      <AnimatePresence>
        {ytModal && <YouTubeModal videoId={ytModal.videoId} title={ytModal.title} fallbackUrl={ytModal.url} onClose={() => setYtModal(null)} />}
      </AnimatePresence>

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
