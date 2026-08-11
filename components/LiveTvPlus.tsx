// LiveTvPlus — the Plajah Live Hub reimagined as a Samsung-TV-Plus-style channel surface, in the
// Plajah brand/aesthetic. Content (the playing channel) fills the top; a mini EPG guide runs along
// the bottom; and a skinny rolling channel DIAL sits on the right — a 3D drum you spin with the
// up/down keys (D-pad on TV), the mouse wheel, or touch. Spinning the dial fluidly changes the
// selected channel and swaps the video playback. One layout, every device + the TV app.
//
// Channels merge live streams (live_feeds), creator FAST channels, and the curated Science Live
// channels into one numbered lineup.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Radio, Volume2, VolumeX, ExternalLink, Play, Tv, ChevronUp, ChevronDown, LayoutGrid } from 'lucide-react';
import type { LiveFeed, UserProfile } from '../types';
import { SCIENCE_STREAMS } from './scienceStreams';

export interface TvChannel {
  id: string;
  number: number;
  name: string;
  sub: string;
  emoji?: string;
  accent: string;
  kind: 'embed' | 'hls' | 'webrtc' | 'external';
  playUrl: string;
  directUrl?: string;
  now: string;
  badge: 'LIVE' | 'FAST' | 'SCIENCE';
  feed?: any; // original LiveFeed for the webrtc viewer handoff
}

const BRAND = '#FF8C00';
const isHlsUrl = (u: string) => u.toLowerCase().includes('.m3u8');
const isEmbeddableUrl = (u: string) =>
  /youtube\.com|youtu\.be|twitch\.tv|vimeo\.com|archive\.org|dailymotion/.test(u);

// ── HLS/embed channel player ──────────────────────────────────────────────────
const ChannelPlayer: React.FC<{ channel: TvChannel | null; muted: boolean; onWatchWebrtc: (feed: any) => void }> = ({ channel, muted, onWatchWebrtc }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!channel || channel.kind !== 'hls' || !v) return;
    let cancelled = false;
    (async () => {
      try {
        if (v.canPlayType('application/vnd.apple.mpegurl')) {
          v.src = channel.playUrl; // native HLS (Safari)
        } else {
          const Hls = (await import('hls.js')).default;
          if (cancelled) return;
          if (Hls.isSupported()) {
            hlsRef.current?.destroy?.();
            const hls = new Hls({ lowLatencyMode: true, enableWorker: true });
            hlsRef.current = hls;
            hls.loadSource(channel.playUrl);
            hls.attachMedia(v);
          } else {
            v.src = channel.playUrl;
          }
        }
        v.muted = muted;
        v.play().catch(() => {});
      } catch { /* */ }
    })();
    return () => { cancelled = true; try { hlsRef.current?.destroy?.(); hlsRef.current = null; } catch { /* */ } };
  }, [channel?.id, channel?.kind, channel?.playUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  if (!channel) return <div className="absolute inset-0 grid place-items-center text-white/30"><Tv size={48} /></div>;

  if (channel.kind === 'embed') {
    // Reload the iframe on channel change by keying it on the channel id.
    const src = channel.playUrl.includes('mute=') ? channel.playUrl.replace(/mute=\d/, `mute=${muted ? 1 : 0}`) : channel.playUrl;
    return (
      <iframe key={channel.id} src={src} className="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={channel.name} />
    );
  }
  if (channel.kind === 'hls') {
    return <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain bg-black" autoPlay playsInline muted={muted} />;
  }
  // webrtc / external — passive playback isn't possible; offer to open the real viewer/source.
  return (
    <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#1a0d0d] to-black">
      <button
        onClick={() => channel.kind === 'webrtc' ? onWatchWebrtc(channel.feed) : window.open(channel.directUrl || channel.playUrl, '_blank')}
        className="flex flex-col items-center gap-3 group"
      >
        <span className="w-20 h-20 rounded-full grid place-items-center border border-white/25" style={{ background: `${channel.accent}33` }}>
          {channel.kind === 'webrtc' ? <Play size={30} className="text-white ml-1" fill="white" /> : <ExternalLink size={26} className="text-white" />}
        </span>
        <span className="text-[11px] font-black uppercase tracking-widest text-white/70">{channel.kind === 'webrtc' ? 'Tap to watch live' : `Open on ${channel.sub}`}</span>
      </button>
    </div>
  );
};

// ── The rolling channel dial (the signature) ───────────────────────────────────
const ITEM_H = 54;      // px per channel on the drum
const VISIBLE = 4;      // channels visible above/below center
const ChannelDial: React.FC<{
  channels: TvChannel[];
  index: number;
  onIndex: (i: number) => void;
}> = ({ channels, index, onIndex }) => {
  const wheelAccum = useRef(0);
  const touchStartY = useRef<number | null>(null);
  const touchStartIndex = useRef(0);

  const clamp = (i: number) => Math.max(0, Math.min(channels.length - 1, i));

  const onWheel = (e: React.WheelEvent) => {
    wheelAccum.current += e.deltaY;
    if (Math.abs(wheelAccum.current) > 40) {
      onIndex(clamp(index + (wheelAccum.current > 0 ? 1 : -1)));
      wheelAccum.current = 0;
    }
  };
  const onTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; touchStartIndex.current = index; };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const dy = touchStartY.current - e.touches[0].clientY;
    onIndex(clamp(touchStartIndex.current + Math.round(dy / ITEM_H)));
  };

  return (
    <div
      className="relative h-full select-none touch-none"
      style={{ width: 78, perspective: 900 }}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
    >
      {/* center selection frame */}
      <div className="absolute left-1 right-1 top-1/2 -translate-y-1/2 rounded-2xl border-2 pointer-events-none z-20"
        style={{ height: ITEM_H, borderColor: `${BRAND}cc`, boxShadow: `0 0 24px ${BRAND}55, inset 0 0 12px ${BRAND}22` }} />
      {/* fade caps */}
      <div className="absolute inset-x-0 top-0 h-24 z-10 pointer-events-none" style={{ background: 'linear-gradient(#04050a, transparent)' }} />
      <div className="absolute inset-x-0 bottom-0 h-24 z-10 pointer-events-none" style={{ background: 'linear-gradient(transparent, #04050a)' }} />

      <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
        {channels.map((ch, i) => {
          const o = i - index;
          if (Math.abs(o) > VISIBLE + 1) return null;
          const rot = o * -20;
          const scale = 1 - Math.min(0.4, Math.abs(o) * 0.13);
          const opacity = Math.abs(o) > VISIBLE ? 0 : 1 - Math.abs(o) * 0.2;
          const selected = o === 0;
          return (
            <button
              key={ch.id}
              onClick={() => onIndex(i)}
              className="absolute left-1 right-1 rounded-2xl flex flex-col items-center justify-center gap-0.5 will-change-transform"
              style={{
                height: ITEM_H,
                top: '50%',
                transform: `translateY(-50%) translateY(${o * ITEM_H}px) rotateX(${rot}deg) scale(${scale})`,
                opacity,
                transition: 'transform 260ms cubic-bezier(.22,1,.36,1), opacity 260ms',
                background: selected ? `linear-gradient(135deg, ${BRAND}, #D40055)` : 'rgba(255,255,255,0.05)',
                color: selected ? '#fff' : 'rgba(255,255,255,0.7)',
                border: selected ? 'none' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <span className="text-[15px] leading-none font-black">{ch.emoji || ch.number}</span>
              <span className="text-[7px] font-black uppercase tracking-wider leading-none">{ch.number}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── The full experience ────────────────────────────────────────────────────────
const LiveTvPlus: React.FC<{
  onBack: () => void;
  feeds: LiveFeed[];
  liveArtists: UserProfile[];
  onOpenClassic?: () => void;
  onWatchWebrtc?: (feed: any) => void;
}> = ({ onBack, feeds, liveArtists, onOpenClassic, onWatchWebrtc }) => {
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [loadedIndex, setLoadedIndex] = useState(0); // player follows the dial once it settles
  const settleRef = useRef<any>(null);
  const guideRef = useRef<HTMLDivElement>(null);

  // Build the unified channel lineup: LIVE streams → FAST channels → Science Live.
  const channels: TvChannel[] = useMemo(() => {
    const out: TvChannel[] = [];
    let n = 1;
    (feeds || [])
      .filter(f => (f as any).status !== 'ENDED' && (f as any).status !== 'OFFLINE' && (f as any).url)
      .forEach(f => {
        const url = (f as any).url as string;
        out.push({
          id: `live_${f.id}`, number: n++, name: f.title, sub: f.ownerName, accent: BRAND, badge: 'LIVE',
          kind: isHlsUrl(url) ? 'hls' : isEmbeddableUrl(url) ? 'embed' : 'webrtc',
          playUrl: url, now: f.title, feed: f,
        });
      });
    (liveArtists || []).forEach(a => {
      const url = a.liveStreamConfig?.fastChannelUrl || '';
      if (!url) return;
      out.push({
        id: `fast_${a.uid}`, number: n++, name: a.displayName, sub: a.liveStreamConfig?.title || 'FAST Channel', accent: '#36c5f0', badge: 'FAST',
        kind: isHlsUrl(url) ? 'hls' : 'embed', playUrl: url, now: a.liveStreamConfig?.title || 'Live',
      });
    });
    SCIENCE_STREAMS.forEach(s => {
      out.push({
        id: `sci_${s.id}`, number: n++, name: s.title, sub: s.source, emoji: s.emoji, accent: s.accent, badge: 'SCIENCE',
        kind: s.isEmbeddable ? 'embed' : 'external', playUrl: s.embedUrl, directUrl: s.directUrl, now: s.title,
      });
    });
    return out;
  }, [feeds, liveArtists]);

  const setIdx = useCallback((i: number) => {
    setIndex(i);
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => setLoadedIndex(i), 320); // swap playback once the dial settles
  }, []);

  // Keyboard / D-pad (works on the TV app too).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(Math.max(0, index - 1)); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(Math.min(channels.length - 1, index + 1)); }
      else if (e.key === 'Enter') { const ch = channels[index]; if (ch?.kind === 'webrtc') onWatchWebrtc?.(ch.feed); setMuted(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, channels, setIdx, onWatchWebrtc]);

  // Keep the bottom guide's selected card in view.
  useEffect(() => {
    const el = guideRef.current?.querySelector<HTMLElement>(`[data-ch="${index}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [index]);

  const selected = channels[index] || null;
  const playing = channels[loadedIndex] || null;

  if (channels.length === 0) {
    return (
      <div className="fixed inset-0 z-[60] bg-[#04050a] text-white flex flex-col items-center justify-center gap-4">
        <Tv size={48} className="text-white/20" />
        <p className="text-white/50 font-bold">No live channels right now.</p>
        <button onClick={onOpenClassic || onBack} className="px-5 py-2.5 rounded-xl bg-white/10 text-[12px] font-black uppercase tracking-widest">Open the Live Hub</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#04050a] text-white flex flex-col" style={{ height: '100dvh' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0 z-30">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/15"><ArrowLeft size={17} /></button>
        <div className="flex items-center gap-2">
          <Radio size={14} style={{ color: BRAND }} />
          <span className="text-[11px] font-black uppercase tracking-[0.35em]">Plajah Live</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMuted(m => !m)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/15">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
          {onOpenClassic && <button onClick={onOpenClassic} title="All live" className="w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/15"><LayoutGrid size={16} /></button>}
        </div>
      </div>

      {/* Content + dial */}
      <div className="relative flex-1 min-h-0">
        <ChannelPlayer channel={playing} muted={muted} onWatchWebrtc={(f) => onWatchWebrtc?.(f)} />

        {/* Now-playing overlay (top-left) */}
        {selected && (
          <div className="absolute top-4 left-4 z-20 max-w-[60%]">
            <div className="inline-flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md" style={{ background: selected.badge === 'LIVE' ? '#e11' : selected.badge === 'FAST' ? '#36c5f0' : selected.accent, color: '#000' }}>
                {selected.badge === 'LIVE' ? '● LIVE' : selected.badge}
              </span>
              <span className="text-[11px] font-black text-white/60">CH {selected.number}</span>
            </div>
            <h2 className="text-xl sm:text-3xl font-black leading-tight drop-shadow-lg line-clamp-2">{selected.name}</h2>
            <p className="text-[12px] text-white/70 font-bold mt-0.5">{selected.sub}{loadedIndex !== index ? ' · tuning…' : ''}</p>
          </div>
        )}

        {/* Rolling dial pinned right */}
        <div className="absolute right-2 top-0 bottom-0 z-20 flex items-center">
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => setIdx(Math.max(0, index - 1))} className="w-8 h-6 rounded-lg bg-white/10 grid place-items-center hover:bg-white/20"><ChevronUp size={16} /></button>
            <div className="h-[62vh]"><ChannelDial channels={channels} index={index} onIndex={setIdx} /></div>
            <button onClick={() => setIdx(Math.min(channels.length - 1, index + 1))} className="w-8 h-6 rounded-lg bg-white/10 grid place-items-center hover:bg-white/20"><ChevronDown size={16} /></button>
          </div>
        </div>
      </div>

      {/* Bottom EPG guide */}
      <div className="shrink-0 border-t border-white/10 bg-black/50 backdrop-blur px-3 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Guide</span>
          <span className="text-[9px] font-bold text-white/30">{channels.length} channels · live now</span>
        </div>
        <div ref={guideRef} className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {channels.map((ch, i) => {
            const on = i === index;
            return (
              <button
                key={ch.id}
                data-ch={i}
                onClick={() => setIdx(i)}
                className="shrink-0 w-52 text-left rounded-xl border p-2.5 transition-colors"
                style={{ borderColor: on ? BRAND : 'rgba(255,255,255,0.08)', background: on ? `${BRAND}1f` : 'rgba(255,255,255,0.03)' }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] font-black" style={{ color: on ? BRAND : 'rgba(255,255,255,0.4)' }}>CH {ch.number}</span>
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded" style={{ background: ch.badge === 'LIVE' ? '#e11' : ch.badge === 'FAST' ? '#36c5f0' : ch.accent, color: '#000' }}>{ch.badge === 'LIVE' ? 'LIVE' : ch.badge}</span>
                </div>
                <p className="text-[12px] font-black leading-tight truncate">{ch.name}</p>
                <p className="text-[10px] text-white/45 truncate">Now: {ch.now}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LiveTvPlus;
