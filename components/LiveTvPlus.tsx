// LiveTvPlus — the Plajah Live Hub reimagined as a Samsung-TV-Plus-style channel surface, in the
// Plajah brand/aesthetic. Content (the playing channel) fills the top; a mini EPG guide runs along
// the bottom; and a skinny rolling channel DIAL sits on the right — a 3D drum you spin with the
// up/down keys (D-pad on TV), the mouse wheel, or touch. Spinning the dial fluidly changes the
// selected channel and swaps the video playback. One layout, every device + the TV app.
//
// Channels merge live streams (live_feeds), creator FAST channels, and the curated Science Live
// channels into one numbered lineup.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Radio, Volume2, VolumeX, ExternalLink, Play, Tv, ChevronUp, ChevronDown, LayoutGrid, Maximize2, Minimize2 } from 'lucide-react';
import type { LiveFeed, UserProfile, FastChannelSchedule, FastChannelSlot } from '../types';
import { SCIENCE_STREAMS } from './scienceStreams';
import { fetchFastChannelSchedule, fetchFastChannelVideos, type FastChannelListing } from '../services/backendService';
import { slotDurationSec, resolveSlotMedia, activeDaySlots, dayAnchoredPosition, linearPositionMidnight, backfillScheduleDurations, FM_FILL_THRESHOLD_SEC } from '../services/fastChannelTimeline';
import { exactDurationSec } from '../services/mediaTimebase';
import { now as clockNow } from '../services/platformClock';
import AdBreakBumper from './tv/AdBreakBumper';
import ComingUpNextBumper, { type UpNextItem } from './tv/ComingUpNextBumper';
import { getPlatformInfo } from '../hooks/usePlatform';
import { isShellFocused, setShellFocus } from '../hooks/useTvShellFocus';

export interface TvChannel {
  id: string;
  number: string;    // guide number — "42" or a sub-channel "42.1"/"42.2"
  name: string;
  sub: string;
  emoji?: string;
  accent: string;
  kind: 'embed' | 'hls' | 'webrtc' | 'external' | 'fast';
  playUrl: string;
  directUrl?: string;
  now: string;
  badge: 'LIVE' | 'FAST' | 'SCIENCE';
  ownerId?: string;      // user/FAST channel → drives the real per-program EPG
  scheduleOwner?: string; // FAST sub-channel → whose schedule to play + guide
  isLive?: boolean;      // true = a live stream is on air right now (vs. scheduled programming)
  feed?: any;            // original LiveFeed for the webrtc viewer handoff
  startOffset?: number;  // FAST: seconds to seek into the current programme (terrestrial mid-join)
}

const BRAND = '#FF8C00';

// ── Per-program EPG from a FAST channel's looping schedule ──────────────────────
export interface EpgProgram { title: string; thumb?: string; startMs: number; endMs: number; isNow: boolean; }
const slotTitle = (s: FastChannelSlot): string =>
  s.videoTitle || (s as any).bumperTitle || (s.type === 'AD_BREAK' ? 'Ad break' : s.type === 'FM_BLOCK' ? 'Plajah FM' : s.type === 'LIVE_INTERRUPT' ? 'Live' : 'Program');
/** Walk the looping schedule from `now` to produce the current + upcoming programs with real times. */
function computeEpg(schedule: FastChannelSchedule | null, now: number, count = 6): EpgProgram[] {
  const slots = activeDaySlots(schedule, now);
  if (!slots.length) return [];
  // Same time-of-day anchor as playout so the guide's "now" matches what's actually on screen.
  const { index, offsetSec } = dayAnchoredPosition(slots, now);
  const out: EpgProgram[] = [];
  let cursor = now - offsetSec * 1000;   // when the current slot began
  let i = index;
  for (let k = 0; k < count; k++) {
    const s = slots[i % slots.length];
    const dur = slotDurationSec(s) * 1000;
    out.push({ title: slotTitle(s), thumb: s.videoThumbnail, startMs: cursor, endMs: cursor + dur, isNow: k === 0 });
    cursor += dur; i++;
  }
  return out;
}
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const isHlsUrl = (u: string) => u.toLowerCase().includes('.m3u8');
const isEmbeddableUrl = (u: string) =>
  /youtube\.com|youtu\.be|twitch\.tv|vimeo\.com|archive\.org|dailymotion/.test(u);

// ── HLS/embed channel player ──────────────────────────────────────────────────
const ChannelPlayer: React.FC<{ channel: TvChannel | null; muted: boolean; onWatchWebrtc: (feed: any) => void; onEnded?: () => void; onFail?: () => void }> = ({ channel, muted, onWatchWebrtc, onEnded, onFail }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const startedRef = useRef(false);        // did THIS programme actually start playing?
  const watchdogRef = useRef<any>(null);
  // Branded tune-in state instead of a grey video box with the platform's default play glyph.
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(false); }, [channel?.id, channel?.playUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!channel || channel.kind !== 'hls' || !v) return;
    let cancelled = false;
    startedRef.current = false;
    // Watchdog: a programme that never STARTS within 10s is skipped fast (instead of waiting out the
    // parent's full-duration safety timer). Only fires for FAST channels (onFail defined).
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => { if (!startedRef.current) onFail?.(); }, 10000);
    (async () => {
      try {
        // Terrestrial mid-join: once the programme's media is ready, seek to where the schedule is
        // for the current time of day, so we start in the middle of the programme (not at 0:00).
        const off = channel.startOffset || 0;
        const seekOnce = () => { if (off > 1) { try { v.currentTime = off; } catch { /* */ } } v.removeEventListener('loadedmetadata', seekOnce); };
        if (off > 1) v.addEventListener('loadedmetadata', seekOnce);
        const isM3u8 = /\.m3u8($|[?#])/i.test(channel.playUrl) || channel.playUrl.includes('stream.mux.com');
        if (!isM3u8) {
          v.src = channel.playUrl; // direct file (mp4/webm) — no hls.js needed
        } else {
          // canPlayType('application/vnd.apple.mpegurl') is NOT a reliable native-HLS test: Chromium —
          // including the Android TV WebView — answers "maybe", plays until the first discontinuity, then
          // dies with DEMUXER_ERROR_COULD_NOT_PARSE. Taking that branch also skipped hls.js entirely, so
          // the recovery below AND capLevelsToPanel never ran on the TV and a dead channel stayed dead.
          // Try hls.js FIRST wherever MSE supports it; native src is the fallback (Safari/iOS).
          const [{ default: Hls }, { hlsTuning, capLevelsToPanel }] = await Promise.all([
            import('hls.js'),
            import('../services/hlsTuning'),
          ]);
          if (cancelled) return;
          if (Hls.isSupported()) {
            hlsRef.current?.destroy?.();
            const hls = new Hls(hlsTuning());   // VOD-tuned config (not low-latency) + per-panel cap
            hlsRef.current = hls;
            hls.loadSource(channel.playUrl);
            hls.attachMedia(v);
            hls.on(Hls.Events.MANIFEST_PARSED, () => { capLevelsToPanel(hls as any); v.play().catch(() => {}); });
            // Recover transient faults so a hiccup doesn't leave the channel black; the 30s re-resolve
            // moves past a permanently dead slot.
            let tries = 0;
            hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
              if (!data?.fatal || tries >= 2) return;
              tries++;
              try {
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
                else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
              } catch { /* */ }
            });
          } else {
            v.src = channel.playUrl;
          }
        }
        v.muted = muted;
        v.play().catch(() => {});
      } catch { /* */ }
    })();
    return () => { cancelled = true; if (watchdogRef.current) clearTimeout(watchdogRef.current); try { hlsRef.current?.destroy?.(); hlsRef.current = null; } catch { /* */ } };
  }, [channel?.id, channel?.kind, channel?.playUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  if (!channel) return <div className="absolute inset-0 grid place-items-center text-white/30"><Tv size={48} /></div>;

  if (channel.kind === 'embed') {
    // Reload the iframe on channel change by keying it on the channel id.
    let src = channel.playUrl.includes('mute=') ? channel.playUrl.replace(/mute=\d/, `mute=${muted ? 1 : 0}`) : channel.playUrl;
    // Terrestrial mid-join for a FAST programme that resolves to a YouTube embed — start partway in.
    if (channel.startOffset && channel.startOffset > 1 && /youtube\.com\/embed/.test(src) && !/[?&]start=/.test(src)) {
      src += `${src.includes('?') ? '&' : '?'}start=${Math.floor(channel.startOffset)}`;
    }
    return (
      <iframe key={channel.id} src={src} className="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={channel.name} />
    );
  }
  if (channel.kind === 'hls') {
    // Content-driven: advance to the next slot when media ENDS. On error, only skip if it never
    // STARTED — a transient mid-play hiccup is left to hls.js recovery, so real content is not skipped
    // (which was collapsing the channel onto the ad breaks).
    return (
      <>
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain bg-black" autoPlay playsInline muted={muted}
          onPlaying={() => { startedRef.current = true; setReady(true); if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; } }}
          onLoadedData={() => { startedRef.current = true; }}
          onEnded={onEnded}
          onError={() => { if (!startedRef.current) onFail?.(); }} />
        {/* Tuning card — covers the grey/decoder frame so a channel change never flashes a bare box. */}
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-[#04050a]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-white/15 border-t-[#FF8C00] animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/45">{channel.name}</span>
            </div>
          </div>
        )}
      </>
    );
  }
  if (channel.kind === 'fast') {
    // FAST channel whose current slot hasn't resolved to media yet.
    return (
      <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#0a1420] to-black">
        <div className="flex flex-col items-center gap-3 text-white/60">
          <span className="w-16 h-16 rounded-full grid place-items-center bg-[#36c5f0]/20"><Tv size={26} className="text-[#36c5f0]" /></span>
          <span className="text-[11px] font-black uppercase tracking-widest">Tuning channel…</span>
        </div>
      </div>
    );
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
  fastChannels?: FastChannelListing[];
  onOpenClassic?: () => void;
  onWatchWebrtc?: (feed: any) => void;
  /** When set, start on the channel whose FAST owner / feed owner matches (tuning in from the guide). */
  focusOwnerId?: string;
}> = ({ onBack, feeds, liveArtists, fastChannels = [], onOpenClassic, onWatchWebrtc, focusOwnerId }) => {
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [loadedIndex, setLoadedIndex] = useState(0); // player follows the dial once it settles
  const settleRef = useRef<any>(null);
  const guideRef = useRef<HTMLDivElement>(null);

  // Build the lineup by USER ACCOUNT: each account is a channel (a bound "major" number) and its
  // individual live feeds + FAST channel are SUB-CHANNELS (42.1, 42.2, …) like an over-the-air
  // station's virtual sub-channels. So a creator running two live streams shows as N.1 and N.2 —
  // nothing disappears — and their FAST channel is another sub. Then curated Science channels.
  const channels: TvChannel[] = useMemo(() => {
    type Sub = Omit<TvChannel, 'number'>;
    interface Owner { ownerId: string; name: string; bound?: number; subs: Sub[]; }
    const owners = new Map<string, Owner>();
    const ensure = (ownerId: string, name: string): Owner => {
      let o = owners.get(ownerId);
      if (!o) { o = { ownerId, name, subs: [] }; owners.set(ownerId, o); }
      return o;
    };

    // Live feeds → channels ONLY for OFF-PLATFORM sources (external URLs not from Plajah). A Reello /
    // on-platform (WebRTC) live stream is CONTENT, not a channel: it flows to the creator's FAST
    // channel when it ends. A creator can opt a Reello stream in as a live channel (asChannel), and
    // those DO get listed here; otherwise on-platform streams are excluded from the guide.
    (feeds || [])
      .filter(f => (f as any).status !== 'ENDED' && (f as any).status !== 'OFFLINE' && (f as any).url)
      .forEach(f => {
        const url = (f as any).url as string;
        const onPlatform = (f as any).streamSource === 'webrtc' || /[?&]stream=/.test(url);
        const asChannel = !!(f as any).asChannel;
        if (onPlatform && !asChannel) return; // Reello stream = content, not a channel (unless opted in)
        const ownerId = ((f as any).ownerId as string) || f.id;
        const o = ensure(ownerId, f.ownerName || f.title);
        if (typeof (f as any).channelNumber === 'number') o.bound = (f as any).channelNumber; // account's bound guide number
        o.subs.push({
          id: `live_${f.id}`, name: f.title, sub: 'Live', accent: BRAND, badge: 'LIVE',
          kind: isHlsUrl(url) ? 'hls' : isEmbeddableUrl(url) ? 'embed' : 'webrtc',
          playUrl: url, now: f.title, ownerId, isLive: true, feed: f,
        });
      });

    // FAST channels → a sub-channel for the account (carries the custom channel name + bound number).
    (fastChannels || []).forEach(fc => {
      const o = ensure(fc.ownerId, fc.name || 'Channel');
      if (fc.name) o.name = fc.name;                 // custom channel name wins for the account
      if (typeof fc.number === 'number') o.bound = fc.number;
      o.subs.push({
        id: `fast_${fc.ownerId}`, name: fc.name || `${o.name} (FAST)`, sub: 'FAST Channel', accent: '#36c5f0', badge: 'FAST',
        kind: 'fast', playUrl: '', now: 'Scheduled programming', ownerId: fc.ownerId, scheduleOwner: fc.ownerId,
      });
    });

    // Assign major numbers: honor bound numbers; give the rest the smallest free positive integer.
    const list = [...owners.values()];
    const used = new Set<number>(list.filter(o => o.bound != null).map(o => o.bound!));
    let free = 1;
    const nextFree = () => { while (used.has(free)) free++; used.add(free); return free; };
    list.sort((a, b) => (a.bound ?? 1e9) - (b.bound ?? 1e9) || a.name.localeCompare(b.name));
    const out: TvChannel[] = [];
    list.forEach(o => {
      const major = o.bound ?? nextFree();
      o.subs.forEach((s, j) => {
        // Single-source account → plain "N"; multi-source → "N.1", "N.2".
        const number = o.subs.length > 1 ? `${major}.${j + 1}` : `${major}`;
        out.push({ ...s, number, name: o.subs.length > 1 ? `${o.name} · ${s.badge === 'FAST' ? 'FAST' : s.name}` : o.name });
      });
    });

    // Curated Science Live channels — platform channels in a separate high band.
    let sci = 9001;
    SCIENCE_STREAMS.forEach(s => {
      out.push({
        id: `sci_${s.id}`, number: `${sci++}`, name: s.title, sub: s.source, emoji: s.emoji, accent: s.accent, badge: 'SCIENCE',
        kind: s.isEmbeddable ? 'embed' : 'external', playUrl: s.embedUrl, directUrl: s.directUrl, now: s.title,
      });
    });
    return out;
  }, [feeds, fastChannels]);

  // Per-program EPG for the selected channel (fetched once per owner, cached, refreshed each 30s).
  const [epg, setEpg] = useState<EpgProgram[]>([]);
  const [preemptUntil, setPreemptUntil] = useState<number | null>(null); // FAST channel being pre-empted → show viewer warning until this ms
  const schedCache = useRef<Map<string, FastChannelSchedule | null>>(new Map());
  const selForEpg = channels[index];
  useEffect(() => {
    let cancelled = false;
    const owner = selForEpg?.ownerId;
    if (!owner) { setEpg([]); setPreemptUntil(null); return; }
    const build = (sched: FastChannelSchedule | null) => {
      if (cancelled) return;
      setEpg(computeEpg(sched, clockNow()));
      // Live pre-emption: warn viewers from when the interrupt is pending until it airs + 30s after.
      const pli = (sched as any)?.pendingLiveInterrupt;
      const until = pli ? pli.scheduledAt + 30000 : 0;
      setPreemptUntil(until && Date.now() < until ? until : null);
    };
    if (schedCache.current.has(owner)) { build(schedCache.current.get(owner)!); }
    else {
      // Fetch the schedule AND the owner's videos, then cache a duration-corrected schedule so the
      // guide + the player show real programme lengths even for older poisoned schedules.
      Promise.all([
        fetchFastChannelSchedule(owner).catch(() => null),
        fetchFastChannelVideos(owner).catch(() => [] as any[]),
      ]).then(([sched, vids]) => {
        const durMap = new Map((vids as any[]).map(v => [v.id, Math.round(exactDurationSec(v))]));
        const fixed = sched ? backfillScheduleDurations(sched, durMap) : null;
        schedCache.current.set(owner, fixed);
        build(fixed);
      }).catch(() => build(null));
    }
    const t = setInterval(() => build(schedCache.current.get(owner) ?? null), 30000); // advance "Now"
    return () => { cancelled = true; clearInterval(t); };
  }, [selForEpg?.ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick down the pre-emption warning (auto-hide 30s after the interrupt airs).
  useEffect(() => {
    if (!preemptUntil) return;
    const t = setInterval(() => { if (Date.now() >= preemptUntil) setPreemptUntil(null); }, 1000);
    return () => clearInterval(t);
  }, [preemptUntil]);

  const setIdx = useCallback((i: number) => {
    setIndex(i);
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => setLoadedIndex(i), 320); // swap playback once the dial settles
  }, []);

  // Tuned in from the guide → jump straight to the matching channel.
  useEffect(() => {
    if (!focusOwnerId || !channels.length) return;
    const i = channels.findIndex(c => c.scheduleOwner === focusOwnerId || c.ownerId === focusOwnerId);
    if (i >= 0) { setIndex(i); setLoadedIndex(i); }
  }, [focusOwnerId, channels]);

  // Keyboard / D-pad (works on the TV app too).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // On the TV the shell's tab bar can own the remote — go inert so one press never moves two things.
      if (isShellFocused()) return;
      const kc = (e as any).keyCode || 0;
      const isUp = e.key === 'ArrowUp' || kc === 38 || kc === 19;
      const isDown = e.key === 'ArrowDown' || kc === 40 || kc === 20;
      if (isUp) {
        // At the top of the dial, UP hands focus back to the TV tab bar instead of trapping the viewer.
        if (index === 0 && getPlatformInfo().isTV) { e.preventDefault(); setShellFocus(true); return; }
        e.preventDefault(); setIdx(Math.max(0, index - 1));
      }
      else if (isDown) { e.preventDefault(); setIdx(Math.min(channels.length - 1, index + 1)); }
      else if (e.key === 'Enter' || kc === 13 || kc === 23) { const ch = channels[index]; if (ch?.kind === 'webrtc') onWatchWebrtc?.(ch.feed); setMuted(false); }
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
  const tvInset = getPlatformInfo().isTV;   // leave room for the TV shell's tab bar

  // Full-screen viewing: hides the dial + guide so the programme fills the panel. On a TV it engages
  // automatically after a spell with no remote input (long enough not to fight browsing, short enough
  // that leaning back gets you a full picture); ANY input brings the chrome straight back.
  const [immersive, setImmersive] = useState(false);
  const idleRef = useRef<any>(null);
  useEffect(() => {
    const armIdle = () => {
      if (idleRef.current) clearTimeout(idleRef.current);
      if (!getPlatformInfo().isTV) return;
      idleRef.current = setTimeout(() => setImmersive(true), 15000);
    };
    const wake = () => { setImmersive(false); armIdle(); };
    armIdle();
    window.addEventListener('keydown', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('mousemove', wake);
    return () => {
      if (idleRef.current) clearTimeout(idleRef.current);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('mousemove', wake);
    };
  }, []);

  // ── FAST playout: WALL-CLOCK DRIVEN, like a real broadcast station ─────────────────────────────
  // What is on air is a PURE FUNCTION OF THE CURRENT TIME: dayAnchoredPosition(slots, now) yields the
  // slot plus how far into it we are, so we join mid-programme and every ad break airs exactly in its
  // guide window. There is deliberately NO advancing index pointer — each tick RE-DERIVES the position
  // from the clock and schedules the next tick at the current slot's window end. An ad therefore CANNOT
  // loop: once its window elapses the clock resolves to the next programme no matter what the player
  // did (the old index pointer could re-enter the ad and never escape — that was the looping bug).
  const [fastMedia, setFastMedia] = useState<{ url: string; offset: number; key: string } | null>(null);
  const [fastAd, setFastAd] = useState<{ key: string; durationSec: number; upcoming: UpNextItem[] } | null>(null);
  const [fastFiller, setFastFiller] = useState<{ key: string; upcoming: UpNextItem[] } | null>(null);
  const fastSlotsRef = useRef<FastChannelSlot[]>([]);
  const fastSchedRef = useRef<FastChannelSchedule | null>(null);
  const fastOwnerRef = useRef<string | undefined>(undefined);
  const fastTimerRef = useRef<any>(null);
  const syncRef = useRef<() => void>(() => {});
  const clearFastTimer = () => { if (fastTimerRef.current) { clearTimeout(fastTimerRef.current); fastTimerRef.current = null; } };

  const upNextFrom = (slots: FastChannelSlot[], idx: number): UpNextItem[] => {
    const out: UpNextItem[] = [];
    for (let k = 1; k <= slots.length && out.length < 3; k++) {
      const ns = slots[(idx + k) % slots.length];
      if (!ns || !(ns.type === 'VIDEO' || ns.type === 'PUBLIC_DOMAIN' || ns.type === 'LIVE_INTERRUPT')) continue;
      const um = resolveSlotMedia(ns);
      out.push({ title: um.title, thumbnail: um.thumbnail || (um.muxPlaybackId ? `https://image.mux.com/${um.muxPlaybackId}/thumbnail.jpg?width=320&time=5` : undefined), badge: ns.isReplay ? 'Replay' : undefined });
    }
    return out;
  };
  /** Always the same shape, whichever anchor the station uses. The two underlying
   *  resolvers disagree — linearPositionMidnight discriminates on `offAir`, while
   *  dayAnchoredPosition has no such field — so unioning them raw produces a type
   *  callers cannot narrow (and, with strictNullChecks off, could not narrow even
   *  if it did). Normalising here keeps every caller a plain property read. */
  type ClockPos = { offAir: boolean; index: number; offsetSec: number; resumesInSec: number };
  const clockPos = (slots: FastChannelSlot[], now: number): ClockPos => {
    const sched = fastSchedRef.current;
    // Anchor to the STATION's zone when it declares one, so every viewer is on the same programme.
    const tz = (sched as any)?.timezone as string | undefined;
    const p = (sched?.midnightAnchored
      ? linearPositionMidnight(slots, now, tz)
      : dayAnchoredPosition(slots, now, tz)) as Partial<ClockPos>;
    return p.offAir
      ? { offAir: true, index: 0, offsetSec: 0, resumesInSec: p.resumesInSec || 0 }
      : { offAir: false, index: p.index || 0, offsetSec: p.offsetSec || 0, resumesInSec: 0 };
  };

  /** Re-derive what is on air from the CLOCK and arm the next boundary. Idempotent and loop-proof. */
  const syncFast = useCallback(() => {
    clearFastTimer();
    const slots = fastSlotsRef.current;
    if (!slots.length) { setFastMedia(null); setFastAd(null); setFastFiller(null); return; }
    const pos = clockPos(slots, clockNow());
    if (pos.offAir) {
      setFastMedia(null); setFastAd(null); setFastFiller(null);
      fastTimerRef.current = setTimeout(() => syncRef.current(), Math.min(pos.resumesInSec, 300) * 1000);
      return;
    }
    const idx = pos.index;
    const s = slots[idx];
    const remaining = Math.max(1, slotDurationSec(s) - Math.max(0, pos.offsetSec));
    // THE boundary: this is what ends an ad break and returns the channel to programming, on time.
    fastTimerRef.current = setTimeout(() => syncRef.current(), remaining * 1000 + 400);
    const key = `${fastOwnerRef.current}_${idx}`;
    const m = resolveSlotMedia(s);
    // Ad break, a scheduled Plajah FM programming block, or any non-video hold — all play the FM
    // surface (FM audio + cover art + platform bumpers) for the window.
    if (m.isAd || m.kind === 'FM') {
      setFastMedia(null); setFastFiller(null);
      setFastAd({ key, durationSec: Math.max(3, Math.round(remaining)), upcoming: upNextFrom(slots, idx) });
      return;
    }
    setFastAd(null);
    const url = m.muxPlaybackId ? `https://stream.mux.com/${m.muxPlaybackId}.m3u8` : (m.url || '');
    const isHls = !!(m.isHls || m.muxPlaybackId);
    // FAST plays platform/stream media only. An unplayable slot never sits on a static card for long:
    // holds ≤30s show the up-next card, anything longer becomes a Plajah FM insertion until the next
    // programme is due.
    if (!url || (!isHls && isEmbeddableUrl(url))) {
      setFastMedia(null);
      if (remaining > FM_FILL_THRESHOLD_SEC) { setFastFiller(null); setFastAd({ key: `${key}_fm`, durationSec: Math.round(remaining), upcoming: upNextFrom(slots, idx) }); }
      else setFastFiller({ key, upcoming: upNextFrom(slots, idx) });
      return;
    }
    setFastFiller(null);
    setFastMedia({ url, offset: Math.max(0, pos.offsetSec), key });
  }, []);
  useEffect(() => { syncRef.current = syncFast; }, [syncFast]);

  /** Media finished (or failed) before its scheduled window ends: show the up-next card for the rest of
   *  the window — no black, and the clock boundary still moves us on exactly on schedule. */
  const onFastMediaEnded = useCallback(() => {
    const slots = fastSlotsRef.current;
    if (!slots.length) return;
    const pos = clockPos(slots, clockNow());
    if (pos.offAir) { syncRef.current(); return; }
    const remaining = slotDurationSec(slots[pos.index]) - Math.max(0, pos.offsetSec);
    const up = upNextFrom(slots, pos.index);
    if (remaining > FM_FILL_THRESHOLD_SEC) {
      // A long gap after the programme ended → Plajah FM plays until the next programme is due,
      // rather than parking on a static graphic.
      setFastMedia(null); setFastFiller(null);
      setFastAd({ key: `${fastOwnerRef.current}_${pos.index}_fm`, durationSec: Math.round(remaining), upcoming: up });
    } else if (remaining > 5) {
      setFastMedia(null);
      setFastFiller({ key: `${fastOwnerRef.current}_${pos.index}_f`, upcoming: up });
    } else {
      syncRef.current();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    clearFastTimer();
    const owner = playing?.kind === 'fast' ? playing.scheduleOwner : undefined;
    fastOwnerRef.current = owner;
    if (!owner) { setFastMedia(null); setFastAd(null); setFastFiller(null); fastSlotsRef.current = []; return; }
    const start = (sched: FastChannelSchedule | null) => {
      if (cancelled) return;
      fastSchedRef.current = sched;
      fastSlotsRef.current = activeDaySlots(sched, clockNow());
      syncFast();   // join at the current wall-clock position
    };
    if (schedCache.current.has(owner)) start(schedCache.current.get(owner)!);
    else {
      Promise.all([
        fetchFastChannelSchedule(owner).catch(() => null),
        fetchFastChannelVideos(owner).catch(() => [] as any[]),
      ]).then(([s, vids]) => {
        const durMap = new Map((vids as any[]).map(v => [v.id, Math.round(exactDurationSec(v))]));
        const fixed = s ? backfillScheduleDurations(s, durMap) : null;
        schedCache.current.set(owner, fixed);
        start(fixed);
      }).catch(() => start(null));
    }
    return () => { cancelled = true; clearFastTimer(); };
  }, [playing?.scheduleOwner, playing?.kind, syncFast]);

  // Re-sync from the clock when the tab returns to the foreground (background timers get throttled on
  // mobile/TV, which would otherwise leave the channel parked on a stale slot).
  useEffect(() => {
    const onVis = () => { if (!document.hidden && playing?.kind === 'fast') syncRef.current(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [playing?.kind]);

  // The channel actually handed to the player: FAST channels play their current scheduled slot.
  const resolvedPlaying: TvChannel | null = playing && playing.kind === 'fast'
    ? (fastMedia ? { ...playing, kind: 'hls', playUrl: fastMedia.url, startOffset: fastMedia.offset } : playing)
    : playing;

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
    // On the TV this sits BELOW the shell's tab bar (which is 64px tall) so the Live tab never covers
    // the navigation — the viewer can always press up and move across to another tab.
    <div className={`fixed ${tvInset ? 'inset-x-0 bottom-0 top-16' : 'inset-0'} z-[60] bg-[#04050a] text-white flex flex-col`} style={{ height: tvInset ? 'calc(100dvh - 4rem)' : '100dvh' }}>
      {/* Top bar (hidden in full-screen viewing) */}
      {!immersive && (
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0 z-30">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/15"><ArrowLeft size={17} /></button>
        <div className="flex items-center gap-2">
          <Radio size={14} style={{ color: BRAND }} />
          <span className="text-[11px] font-black uppercase tracking-[0.35em]">Plajah Live</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMuted(m => !m)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/15">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
          <button onClick={() => setImmersive(true)} title="Full screen" className="w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/15"><Maximize2 size={16} /></button>
          {onOpenClassic && <button onClick={onOpenClassic} title="All live" className="w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/15"><LayoutGrid size={16} /></button>}
        </div>
      </div>
      )}

      {/* Content + dial */}
      <div className="relative flex-1 min-h-0">
        {/* Keyed per scheduled slot so a repeat of the same url still reloads the player. */}
        <ChannelPlayer key={fastMedia?.key || resolvedPlaying?.id || 'none'} channel={resolvedPlaying} muted={muted} onWatchWebrtc={(f) => onWatchWebrtc?.(f)}
          onEnded={playing?.kind === 'fast' ? onFastMediaEnded : undefined}
          onFail={playing?.kind === 'fast' ? onFastMediaEnded : undefined} />

        {/* Ad break with no user ad → the Plajah "back shortly" bumper (Plajah FM + coming-up-next).
            onComplete re-syncs from the clock; the boundary timer is the real guarantee it ends. */}
        {playing?.kind === 'fast' && fastAd && (
          <AdBreakBumper key={fastAd.key} channelName={playing.name} durationSec={fastAd.durationSec} upcoming={fastAd.upcoming} accent={playing.accent} muted={muted} onComplete={() => syncRef.current()} />
        )}

        {/* Filler: the scheduled programme ended early or can't play — hold the branded up-next card
            for the rest of its window instead of black (the clock boundary moves us on, on time). */}
        {playing?.kind === 'fast' && !fastAd && fastFiller && (
          <ComingUpNextBumper key={fastFiller.key} channelName={playing.name} items={fastFiller.upcoming} accent={playing.accent} />
        )}

        {/* Live pre-emption warning — a FAST channel is being cut over to the broadcaster's live
            stream. Shows until the interrupt airs and stays up for its first 30 seconds. */}
        {preemptUntil && selected?.kind === 'fast' && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur-sm">
            <div className="text-center px-6 max-w-lg">
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">
                <Radio size={13} /> Live Pre-emption
              </div>
              <h2 className="text-2xl sm:text-4xl font-black leading-tight">Broadcast Is Being Pre-Empted by Broadcaster</h2>
              <p className="text-white/60 text-sm mt-3">Switching this channel to the live broadcast…</p>
            </div>
          </div>
        )}

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

        {/* Rolling dial pinned right — z-40 so the ad/FM/up-next overlays never swallow the channel
            buttons, and a bigger hit area so they work on touch and with a remote. */}
        {!immersive && (
        <div className="absolute right-2 top-0 bottom-0 z-40 flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <button aria-label="Channel up" onClick={() => setIdx(Math.max(0, index - 1))}
              className="w-11 h-10 rounded-xl bg-black/60 border border-white/15 backdrop-blur grid place-items-center hover:bg-white/20 active:scale-95"><ChevronUp size={20} /></button>
            <div className="h-[62vh]"><ChannelDial channels={channels} index={index} onIndex={setIdx} /></div>
            <button aria-label="Channel down" onClick={() => setIdx(Math.min(channels.length - 1, index + 1))}
              className="w-11 h-10 rounded-xl bg-black/60 border border-white/15 backdrop-blur grid place-items-center hover:bg-white/20 active:scale-95"><ChevronDown size={20} /></button>
          </div>
        </div>
        )}
      </div>

      {/* Bottom EPG guide (hidden in full-screen viewing) */}
      {!immersive && (
      <div className="shrink-0 border-t border-white/10 bg-black/50 backdrop-blur px-3 py-3">
        {/* Per-program schedule for the selected channel (real times, from the FAST schedule). */}
        {selected && (selected.isLive || epg.length > 0) && (
          <div className="flex items-stretch gap-2 mb-3 overflow-x-auto no-scrollbar">
            {selected.isLive && (
              <div className="shrink-0 rounded-lg px-3 py-2 min-w-[150px]" style={{ background: `${BRAND}22`, border: `1px solid ${BRAND}` }}>
                <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#ff5a5a' }}>● Live now</p>
                <p className="text-[12px] font-black leading-tight truncate">{selected.now}</p>
                <p className="text-[9px] text-white/50">On air</p>
              </div>
            )}
            {selected.isLive && epg.length > 0 && (
              <div className="shrink-0 grid place-items-center px-1"><span className="text-[8px] font-black uppercase tracking-widest text-white/30">then →</span></div>
            )}
            {epg.map((p, i) => {
              const now = p.isNow && !selected.isLive;
              return (
                <div key={i} className="shrink-0 rounded-lg px-3 py-2 min-w-[150px]"
                  style={{ background: now ? `${BRAND}22` : 'rgba(255,255,255,0.04)', border: now ? `1px solid ${BRAND}` : '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/40">{now ? 'Now' : fmtTime(p.startMs)}</p>
                  <p className="text-[12px] font-black leading-tight truncate">{p.title}</p>
                  <p className="text-[9px] text-white/45">{fmtTime(p.startMs)} – {fmtTime(p.endMs)}</p>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Channels</span>
          <span className="text-[9px] font-bold text-white/30">{channels.length} channels</span>
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
      )}

      {/* Full-screen: a quiet hint that any press brings the guide back. */}
      {immersive && (
        <button onClick={() => setImmersive(false)}
          className="absolute bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-black/55 border border-white/15 backdrop-blur text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white">
          <Minimize2 size={14} /> Show guide
        </button>
      )}
    </div>
  );
};

export default LiveTvPlus;
