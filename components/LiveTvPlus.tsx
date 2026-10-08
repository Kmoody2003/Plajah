// LiveTvPlus — the Plajah Live Hub reimagined as a Samsung-TV-Plus-style channel surface, in the
// Plajah brand/aesthetic. Content (the playing channel) fills the top; a mini EPG guide runs along
// the bottom; and a skinny rolling channel DIAL sits on the right — a 3D drum you spin with the
// up/down keys (D-pad on TV), the mouse wheel, or touch. Spinning the dial fluidly changes the
// selected channel and swaps the video playback. One layout, every device + the TV app.
//
// Channels merge live streams (live_feeds), creator FAST channels, and the curated Science Live
// channels into one numbered lineup.

import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Radio, Volume2, VolumeX, ExternalLink, Play, Tv, ChevronUp, ChevronDown, LayoutGrid, Maximize2, Minimize2, Pencil, Check, X, Heart, ImagePlus, Settings2, Link2, Star } from 'lucide-react';
import type { LiveFeed, UserProfile, FastChannelSchedule, FastChannelSlot } from '../types';
import { ACTIVE_SCIENCE_STREAMS } from './scienceStreams';
import { fetchChannelNumberRegistry, fetchFastChannelSchedule, fetchFastChannelVideos, setChannelSubName, setChannelSubLogo, uploadChannelLogo, fetchFastChannelMeta, type FastChannelListing } from '../services/backendService';
import { slotDurationSec, resolveSlotMedia, activeDaySlots, dayAnchoredPosition, linearPositionMidnight, backfillScheduleDurations, backfillScheduleDurationsByUrl, unresolvedDurationUrls, FM_FILL_THRESHOLD_SEC, hasPlayableProgramme, sanitizeScheduleForPlayout, nextPlayableSlotIndex, isPlayableProgrammeSlot } from '../services/fastChannelTimeline';
import { exactDurationSec } from '../services/mediaTimebase';
import { probeDurations } from '../services/mediaProbe';
import { now as clockNow } from '../services/platformClock';
import AdBreakBumper from './tv/AdBreakBumper';
import ComingUpNextBumper, { type UpNextItem } from './tv/ComingUpNextBumper';
import { fadeVolume, playAudible, type FadeHandle } from '../utils/audioFade';

/** Channel-change audio ramp. Long enough to read as a tune-in, short enough not to feel broken. */
const CHANNEL_FADE_MS = 2000;
import EndlessHourPlayer from './tv/EndlessHourPlayer';
import { getPlatformInfo } from '../hooks/usePlatform';
import { isShellFocused, setShellFocus } from '../hooks/useTvShellFocus';
import { isTvOverlayOpen } from '../hooks/useTvOverlay';
import { useTvLineup } from '../hooks/useTvLineup';
import { useTvSpineInset } from './tv/TvSpine';
import { PLAJAH_CHANNELS, UNNUMBERED, guideSortKey, legacyMajors, plajahNumber, type NumberRegistry } from '../services/fast/channelNumbers';
import { findSharedChannel, canManageChannel } from '../services/fast/channelSharing';
import { isChannelFeed } from '../services/fast/guideLineup';
import ShareButton from './ShareButton';
import { buildShareUrl } from '../services/deepLinkService';
import { createPost } from '../services/backendService';
import ChannelLogo from './tv/ChannelLogo';
import { isWindowsApp, setNativeFullscreen } from '../services/windowsBridgeService';
import { useContextMenu } from './ui';
import { subKeyFor, favoriteKey, resolveChannelLogo, type OwnerBranding } from '../services/fast/channelBranding';
import { getFavoriteChannels, subscribeFavoriteChannels, toggleFavoriteChannel, syncFavoriteChannelsFromProfile } from '../services/favoriteChannelsService';
import type { FavoriteChannel } from '../types';
import type { GuideChannel } from './tv/PlajahEpgGuide';

// The full grid guide opens over Live TV+ (OK / Guide key on a remote). Loaded on first open only.
const PlajahEpgGuide = lazy(() => import('./tv/PlajahEpgGuide'));
// Glanceable home pillar (clock, weather, cameras, notes, notifications) — TV only, shown with the guide.
const TvAmbientPillar = lazy(() => import('./tv/ambient/TvAmbientPillar'));
const openAmbient = () => window.dispatchEvent(new CustomEvent('plajah:open-ambient'));

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
  plajahId?: string;     // first-party channel in the reserved band — no owner account behind it
  /** Stable key a custom name / logo hangs off (see services/fast/channelBranding). */
  subKey?: string;
  /** Resolved logo: custom → account logo → profile photo. Undefined → the UI draws the Plajah chevron. */
  logo?: string;
}

const BRAND = '#FF8C00';

// ── Per-program EPG from a FAST channel's looping schedule ──────────────────────
export interface EpgProgram { title: string; thumb?: string; startMs: number; endMs: number; isNow: boolean; }
const slotTitle = (s: FastChannelSlot): string =>
  s?.videoTitle || (s as any)?.bumperTitle || (s?.type === 'AD_BREAK' ? 'Ad break' : s?.type === 'FM_BLOCK' ? 'Plajah FM' : s?.type === 'LIVE_INTERRUPT' ? 'Live' : 'Program');
/** Walk the looping schedule from `now` to produce the current + upcoming programs with real times. */
function computeEpg(schedule: FastChannelSchedule | null, now: number, count = 6): EpgProgram[] {
  // A schedule is user data: a null/non-object slot (or a non-array slots field) must never take
  // the whole guide down with it, so drop anything that isn't a slot before walking the loop.
  const slots = (activeDaySlots(schedule, now) || []).filter((s): s is FastChannelSlot => !!s && typeof s === 'object');
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
/** Bottom-guide card pitch: w-52 (208px) + gap-2 (8px). Spacers use it to stand in for unmounted cards. */
const GUIDE_CARD_STRIDE = 216;
/** Cards mounted either side of the selected one — comfortably more than fit on a 1600px screen. */
const GUIDE_HALF_WINDOW = 10;

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
  // The element is recreated on every channel change (this component is keyed on the channel),
  // so the fade always starts from a fresh element at volume 0 rather than ramping a survivor.
  const fadeRef = useRef<FadeHandle | null>(null);
  useEffect(() => () => { fadeRef.current?.cancel(); }, []);

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
            hls.on(Hls.Events.MANIFEST_PARSED, () => { capLevelsToPanel(hls as any); if (!muted) { v.volume = 0; void playAudible(v); } else { v.play().catch(() => {}); } });
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
        if (muted) {
          v.muted = true;
          v.play().catch(() => {});
        } else {
          // Start silent and let onPlaying ramp it up, so tuning into a channel doesn't
          // arrive as a blast. playAudible keeps the picture if autoplay refuses sound.
          v.volume = 0;
          void playAudible(v);
        }
      } catch { /* */ }
    })();
    return () => { cancelled = true; if (watchdogRef.current) clearTimeout(watchdogRef.current); try { hlsRef.current?.destroy?.(); hlsRef.current = null; } catch { /* */ } };
  }, [channel?.id, channel?.kind, channel?.playUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggling mute from the UI is immediate in both directions — a fade would make the control
  // feel broken. The 2s ramp belongs to tuning, not to pressing mute.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (!muted && v.volume === 0) { fadeRef.current?.cancel(); v.volume = 1; }
  }, [muted]);

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
          onPlaying={() => {
            startedRef.current = true; setReady(true);
            if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
            // Ease the sound in over 2s as the channel settles, rather than cutting in at full
            // level the instant the decoder produces a frame.
            const v = videoRef.current;
            if (v && !muted) { fadeRef.current?.cancel(); fadeRef.current = fadeVolume(v, 1, CHANNEL_FADE_MS, { from: 0 }); }
          }}
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
              {ch.emoji
                ? <span className="text-[15px] leading-none font-black">{ch.emoji}</span>
                : <ChannelLogo src={ch.logo} size={22} className={selected ? 'border-white/40' : ''} />}
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
  /** Tune to a first-party channel (its plajahId) — used by a shared-channel deep-link. */
  focusPlajahId?: string;
  /** Fallback: tune to whatever channel carries this guide number ("8.1"). */
  focusNumber?: string;
  focusSourceId?: string;
  /** For "Post to Plajah feed" from the share sheet. */
  currentUser?: { uid: string; displayName?: string | null; photoURL?: string | null } | null;
}> = ({ onBack, feeds, liveArtists, fastChannels = [], onOpenClassic, onWatchWebrtc, focusOwnerId, focusPlajahId, focusNumber, focusSourceId, currentUser }) => {
  const [index, setIndex] = useState(0);
  // Live TV starts with SOUND. Muted-by-default is a browser-autoplay habit, and it made the TV
  // app a silent television — worse because the mute control is pointer-only and hides itself
  // after 15s of no remote input, so on a TV there was no way back to it. The Capacitor shells
  // set mediaPlaybackRequiresUserGesture(false), so unmuted autoplay is permitted there; on the
  // web, playAudible() falls back to muted rather than losing the picture.
  const [muted, setMuted] = useState(false);
  const [loadedIndex, setLoadedIndex] = useState(0); // player follows the dial once it settles
  // Locally-saved sub-channel names, keyed by the guide's sub-channel id (not the account), so
  // renaming one of an account's channels never renames its siblings.
  const [renamedSubs, setRenamedSubs] = useState<Record<string, string>>({});
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [channelNameDraft, setChannelNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [renameError, setRenameError] = useState('');
  const settleRef = useRef<any>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const tvLineup = useTvLineup();

  // Every number in one document. Numbers are GIVEN, not derived, so the guide's job is to look
  // them up rather than to work them out — which is what makes a channel's number the same on
  // every device regardless of who is on air or what order anything loaded.
  const [registry, setRegistry] = useState<NumberRegistry | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchChannelNumberRegistry().then(r => { if (alive) setRegistry(r); });
    return () => { alive = false; };
  }, []);

  // Branding (custom names + logos) per account. FAST listings already carry it; an account that is
  // only live has no listing, so its fast_channels doc is fetched once. Local overrides apply
  // instantly after a save, before the next listing refresh.
  const [extraBranding, setExtraBranding] = useState<Record<string, OwnerBranding>>({});
  const [localLogos, setLocalLogos] = useState<Record<string, string>>({});   // subKey → url ('' = cleared)
  const ownerBranding = useMemo(() => {
    const m = new Map<string, OwnerBranding>();
    Object.entries(extraBranding).forEach(([k, v]) => m.set(k, v));
    (fastChannels || []).forEach(fc => m.set(fc.ownerId, { logoUrl: fc.accountLogo, subLogos: fc.subLogos, subNames: fc.subNames, photoURL: fc.photoURL }));
    return m;
  }, [fastChannels, extraBranding]);
  const fetchedBrandingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const have = new Set((fastChannels || []).map(fc => fc.ownerId));
    (feeds || []).filter(isChannelFeed).forEach(f => {
      const ownerId = (f as any).ownerId as string | undefined;
      if (!ownerId || have.has(ownerId) || fetchedBrandingRef.current.has(ownerId)) return;
      fetchedBrandingRef.current.add(ownerId);
      void fetchFastChannelMeta(ownerId).then(m => {
        if (!m) return;
        setExtraBranding(prev => ({ ...prev, [ownerId]: { logoUrl: m.logoUrl || undefined, subLogos: m.subLogos, subNames: m.subNames } }));
      }).catch(() => {});
    });
  }, [feeds, fastChannels]);

  // Build the lineup by USER ACCOUNT: each account is a channel (a bound "major" number) and its
  // individual live feeds + FAST channel are SUB-CHANNELS (42.1, 42.2, …) like an over-the-air
  // station's virtual sub-channels. So a creator running two live streams shows as N.1 and N.2 —
  // nothing disappears — and their FAST channel is another sub. Then curated Science channels.
  const channels: TvChannel[] = useMemo(() => {
    type Sub = Omit<TvChannel, 'number'> & { photo?: string };
    interface Owner { ownerId: string; name: string; bound?: number; subs: Sub[]; }
    const owners = new Map<string, Owner>();
    const ensure = (ownerId: string, name: string): Owner => {
      let o = owners.get(ownerId);
      if (!o) { o = { ownerId, name, subs: [] }; owners.set(ownerId, o); }
      return o;
    };

    // Membership is decided by `isChannelFeed`, shared with the numbering admin — an account that
    // is in the guide but invisible to the allocator is an account whose address can be given
    // away. See services/fast/guideLineup.ts for why a Reello stream is content, not a channel.
    (feeds || [])
      .filter(isChannelFeed)
      .forEach(f => {
        const url = (f as any).url as string;
        const ownerId = ((f as any).ownerId as string) || f.id;
        const o = ensure(ownerId, f.ownerName || f.title);
        if (typeof (f as any).channelNumber === 'number') o.bound = (f as any).channelNumber; // account's bound guide number
        o.subs.push({
          id: `live_${f.id}`, name: f.title, sub: 'Live', accent: BRAND, badge: 'LIVE',
          kind: isHlsUrl(url) ? 'hls' : isEmbeddableUrl(url) ? 'embed' : 'webrtc',
          playUrl: url, now: f.title, ownerId, isLive: true, feed: f, photo: (f as any).ownerPhoto || undefined,
        });
      });

    // FAST channels → a sub-channel for the account (carries the custom channel name + bound number).
    (fastChannels || []).forEach(fc => {
      const o = ensure(fc.ownerId, fc.name || 'Channel');
      if (fc.name) o.name = fc.name;            // account-level channel name
      if (typeof fc.number === 'number') o.bound = fc.number;
      o.subs.push({
        id: `fast_${fc.ownerId}`, name: fc.name || `${o.name} (FAST)`, sub: 'FAST Channel', accent: '#36c5f0', badge: 'FAST',
        kind: 'fast', playUrl: '', now: 'Scheduled programming', ownerId: fc.ownerId, scheduleOwner: fc.ownerId, photo: fc.photoURL,
      });
    });

    // Numbers are LOOKED UP, never worked out.
    //
    // This used to hand every unbound account "the smallest free positive integer" computed over
    // whoever happened to be on air, so a channel's number moved when a DIFFERENT account went
    // live. The registry is now the source of truth: a number is given once and read thereafter.
    //
    // The one exception is the migration. Numbers used to be computed at read time and never
    // stored, so until backfillChannelNumbers has run there is nothing to look up — and showing
    // every existing channel a dash would take away addresses people already use. So a channel
    // with no registry entry falls back to `legacyMajors`, which reproduces exactly what the old
    // guide showed. It is stable in a way the old code was not, because it runs over every
    // enabled channel rather than only the ones on air, and the backfill freezes the same
    // answer. Remove this fallback once the registry is complete.
    const list = [...owners.values()];
    const legacy = legacyMajors(list.map(o => ({ ownerId: o.ownerId, name: o.name, number: o.bound })));
    const out: TvChannel[] = [];
    list.forEach(o => {
      // Registry first, then the channel doc's mirror, then the migration replay.
      const major = registry?.byOwner?.[o.ownerId] ?? o.bound ?? legacy.get(o.ownerId);
      o.subs.forEach((s, j) => {
        // Single-source account → plain "N"; multi-source → "N.1", "N.2".
        const number = major == null
          ? UNNUMBERED
          : o.subs.length > 1 ? `${major}.${j + 1}` : `${major}`;
        // A name the owner gave THIS sub-channel wins, and only for it — siblings keep their own.
        const { photo, ...sub } = s;
        const subKey = subKeyFor({ id: s.id, ownerId: o.ownerId, playUrl: s.playUrl });
        const branding = ownerBranding.get(o.ownerId);
        const custom = renamedSubs[subKey] ?? branding?.subNames?.[subKey];
        const localLogo = localLogos[subKey];
        const logo = localLogo !== undefined ? (localLogo || resolveChannelLogo({ ...branding, subLogos: {} }, subKey, photo)) : resolveChannelLogo(branding, subKey, photo);
        out.push({ ...sub, number, subKey, logo, name: custom || (o.subs.length > 1 ? `${o.name} · ${s.badge === 'FAST' ? 'FAST' : s.name}` : o.name) });
      });
    });

    // Plajah's own channels, in the reserved band. Always sub-numbered, so the day a second one
    // arrives the first keeps its address.
    PLAJAH_CHANNELS.forEach(pc => {
      out.push({
        id: `plajah_${pc.id}`,
        number: plajahNumber(pc),
        name: pc.name,
        sub: pc.tagline,
        accent: BRAND,
        badge: 'FAST',
        kind: 'fast',
        playUrl: '',
        now: pc.onAir ? pc.tagline : 'Not yet on air',
        plajahId: pc.id,
      });
    });

    // Curated Science Live channels — platform channels in a separate high band.
    // Empty while SCIENCE_BAND_ENABLED is off (the third-party YouTube embeds are broken),
    // so the guide simply has no 9000s rather than a row of dead players.
    let sci = 9001;
    ACTIVE_SCIENCE_STREAMS.forEach(s => {
      out.push({
        id: `sci_${s.id}`, number: `${sci++}`, name: s.title, sub: s.source, emoji: s.emoji, accent: s.accent, badge: 'SCIENCE',
        kind: s.isEmbeddable ? 'embed' : 'external', playUrl: s.embedUrl, directUrl: s.directUrl, now: s.title,
      });
    });
    // One sort at the end, by the number itself, so the guide reads in channel order and
    // unnumbered entries collect at the bottom instead of pushing everyone else around.
    out.sort((a, b) => guideSortKey(a.number) - guideSortKey(b.number));
    return out;
  }, [feeds, fastChannels, registry, renamedSubs, ownerBranding, localLogos]);

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
      // The guide row is decoration over playback — a bad schedule shows an empty guide, not a crash.
      let programs: EpgProgram[] = [];
      try { programs = computeEpg(sched, clockNow()); } catch (e) { console.warn('[LiveTV] EPG build failed for', owner, e); }
      setEpg(programs);
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
        if (fixed) {
          const unknown = unresolvedDurationUrls(fixed);
          if (unknown.length) healUnknownDurations(fixed).then(healed => {
            if (cancelled) return;
            schedCache.current.set(owner, healed);
            build(healed);
          }).catch(() => {});
        }
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

  // Tuned in from the guide, or from a shared-channel link → jump straight to the matching channel.
  useEffect(() => {
    if (!channels.length) return;
    if (!focusOwnerId && !focusPlajahId && !focusNumber && !focusSourceId) return;
    // Tune ONCE per shared link. `channels` is rebuilt on every feed/registry update, and without
    // this the guide kept snapping back to the shared channel while the viewer was browsing.
    const key = [focusOwnerId, focusPlajahId, focusNumber, focusSourceId].join('|');
    if (focusAppliedRef.current === key) return;
    const i = findSharedChannel(channels, { ownerId: focusOwnerId, plajahId: focusPlajahId, number: focusNumber, sourceId: focusSourceId });
    if (i >= 0) { focusAppliedRef.current = key; setIndex(i); setLoadedIndex(i); }
  }, [focusOwnerId, focusPlajahId, focusNumber, focusSourceId, channels]);
  const focusAppliedRef = useRef<string>('');

  // Keyboard / D-pad (works on the TV app too).
  //
  // CHANNEL UP/DOWN previously did nothing on a real remote, and even the plain arrow keys were
  // unreliable. Root cause: this listener carries no `data-tv-capture` marker on its screen, and
  // TVNavigationLayer's `inCaptureZone` check falls through to "ordinary page → geometry navigates"
  // whenever nothing on the current screen is marked — so the geometric layer was eating arrow keys
  // with `stopImmediatePropagation` before this bubble-phase handler ever ran, unless the shell
  // happened to already hold focus. The fix is the `data-tv-capture` attribute on the root div below
  // (see TVNavigationLayer.inCaptureZone), which makes the geometric layer yield unconditionally
  // while this screen is showing — the same mechanism MoviesTvView and TvSearchView already use.
  //
  // Bound ONCE: the handler reads index/channels through refs. It used to depend on [index,
  // channels], so every channel step tore the listener down and re-added it — and `channels` is
  // rebuilt on every feed/registry update, so a press could land in the gap mid-rebind.
  // It stays BUBBLE-phase on purpose: overlays on top of Live (speaker picker, ambient screen,
  // receiver) listen in the capture phase and stop the event, so they always win over the dial.
  const [guideOpen, setGuideOpen] = useState(false);
  const keyStateRef = useRef({ index, channels, setIdx, onWatchWebrtc });
  keyStateRef.current = { index, channels, setIdx, onWatchWebrtc };
  const [tuneBuf, setTuneBuf] = useState('');
  useEffect(() => {
    let numBuf = '';
    let numTimer: ReturnType<typeof setTimeout> | null = null;
    const tune = () => {
      const want = numBuf; numBuf = ''; setTuneBuf('');
      const { channels: list, setIdx: go } = keyStateRef.current;
      // Exact sub-channel ("42.1") first, then the first sub of a major ("42" → 42.1).
      let i = list.findIndex(c => String(c.number) === want);
      if (i < 0) i = list.findIndex(c => String(c.number).split('.')[0] === want);
      if (i >= 0) go(i);
    };
    const onKey = (e: KeyboardEvent) => {
      // On the TV the shell's tab bar can own the remote — go inert so one press never moves two things.
      if (isShellFocused() || isTvOverlayOpen()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const { index: idx, channels: list, setIdx: go, onWatchWebrtc: watchRtc } = keyStateRef.current;
      const last = list.length - 1;
      const kc = (e as any).keyCode || 0;
      const isUp = e.key === 'ArrowUp' || kc === 38 || kc === 19;
      const isDown = e.key === 'ArrowDown' || kc === 40 || kc === 20;
      // Left/Right walk the bottom guide, which runs left-to-right — the arrows match what you see.
      const isLeft = e.key === 'ArrowLeft' || kc === 37 || kc === 21;
      const isRight = e.key === 'ArrowRight' || kc === 39 || kc === 22;
      // A physical remote's dedicated Channel Up/Down buttons. Different vendors deliver them
      // differently — Android TV's consumer-electronics keycodes (166/167), a named key
      // ('ChannelUp'/'ChannelDown'), or the bracket/PageUp/PageDown keys used for the same purpose
      // in a browser — so all of them are accepted rather than guessing which one a given remote or
      // keyboard sends.
      const isChUp = kc === 166 || e.key === 'ChannelUp' || e.key === 'PageUp' || e.key === ']';
      const isChDown = kc === 167 || e.key === 'ChannelDown' || e.key === 'PageDown' || e.key === '[';
      // Channel Up/Down follow the on-screen dial: Up moves UP the dial, exactly like the Up arrow.
      // (They were the other way round — Ch+ stepped to the next list entry, which is DOWN the dial —
      // and on the TCL that read as backwards.)
      if (isChUp) { e.preventDefault(); go(Math.max(0, idx - 1)); return; }
      if (isChDown) { e.preventDefault(); go(Math.min(last, idx + 1)); return; }
      if (isRight) { e.preventDefault(); go(Math.min(last, idx + 1)); return; }
      if (isLeft) { e.preventDefault(); go(Math.max(0, idx - 1)); return; }
      if (isUp) {
        // At the top of the dial, UP hands focus back to the TV tab bar instead of trapping the viewer.
        if (idx === 0 && getPlatformInfo().isTV) { e.preventDefault(); setShellFocus(true); return; }
        e.preventDefault(); go(Math.max(0, idx - 1));
      }
      else if (isDown) { e.preventDefault(); go(Math.min(last, idx + 1)); }
      // Number entry, like any TV: type 4 2 (or 4 2 . 1) and it tunes after a short pause, or on OK.
      // Android remotes send KEYCODE_0..9 = 7..16 and the sub-channel dot as 158 (NUMPAD_DOT).
      else if (/^[0-9.]$/.test(e.key) || (kc >= 7 && kc <= 16) || kc === 158) {
        const ch = /^[0-9.]$/.test(e.key) ? e.key : kc === 158 ? '.' : String(kc - 7);
        e.preventDefault();
        numBuf = (numBuf + ch).slice(0, 6); setTuneBuf(numBuf);
        if (numTimer) clearTimeout(numTimer);
        numTimer = setTimeout(tune, 1100);
      }
      // A remote's own mute key, and 'm' for a keyboard. Previously the only mute control was a
      // pointer-only button in a bar that hides itself after 15s on TV, so once it vanished the
      // audio could not be reached at all — Enter could unmute but nothing could mute again.
      else if (kc === 164 || e.key === 'AudioVolumeMute' || e.key === 'VolumeMute' || e.key === 'm' || e.key === 'M') {
        e.preventDefault(); setMuted(m => !m); setImmersive(false);
      }
      // The remote's GUIDE key (KEYCODE_GUIDE 172), or G on a keyboard, opens the full grid guide.
      else if (kc === 172 || e.key === 'Guide' || e.key === 'g' || e.key === 'G') { e.preventDefault(); setGuideOpen(true); }
      else if (e.key === 'Enter' || kc === 13 || kc === 23) {
        if (numBuf) { e.preventDefault(); if (numTimer) clearTimeout(numTimer); tune(); return; }
        const ch = list[idx];
        if (ch?.kind === 'webrtc') { watchRtc?.(ch.feed); setMuted(false); return; }
        setMuted(false);
        // On a TV, OK is the way into the full guide — most remotes have no Guide button.
        if (getPlatformInfo().isTV) { e.preventDefault(); setGuideOpen(true); }
      }
    };
    // Back on Live (the TV's home) brings the navigation back instead of leaving the app — the rail
    // slides away while you watch, and this is the one-press way to it from anywhere on the dial.
    const onHwBack = (ev: Event) => {
      if (!getPlatformInfo().isTV || isTvOverlayOpen() || isShellFocused()) return;
      ev.preventDefault();
      setShellFocus(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('plajah:hardware-back', onHwBack);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('plajah:hardware-back', onHwBack);
      if (numTimer) clearTimeout(numTimer);
    };
  }, []);

  // Keep the bottom guide's selected card in view.
  // A held/rapid remote fires a press every ~80-120ms; a smooth scroll per press never finishes and
  // the browser keeps restarting the animation (the "rubber band" lag). Smooth only for lone presses.
  const lastGuideMoveRef = useRef(0);
  useEffect(() => {
    const now = performance.now();
    const burst = now - lastGuideMoveRef.current < 260;
    lastGuideMoveRef.current = now;
    const el = guideRef.current?.querySelector<HTMLElement>(`[data-ch="${index}"]`);
    el?.scrollIntoView({ behavior: burst ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }, [index]);

  const selected = channels[index] || null;
  const playing = channels[loadedIndex] || null;
  const isTv = getPlatformInfo().isTV;
  // Room to leave for whichever shell is mounted above: the classic top bar (64px) or, with Spine,
  // a fixed left rail instead — same idea, different edge. Spine's own width constant is imported
  // rather than duplicated, so the two can never drift out of sync.
  const tvInset = isTv && !tvLineup.enabled;                 // classic: inset from the top
  const tvRailInset = useTvSpineInset(isTv && tvLineup.enabled);   // spine: inset from the left (0 while it's hidden)

  const beginRename = useCallback((channel: TvChannel) => {
    const ownerId = channel.scheduleOwner || channel.ownerId;
    if (!ownerId || ownerId !== currentUser?.uid) return;
    setEditingSubId(channel.subKey || channel.id);
    setChannelNameDraft(channel.name);
    setRenameError('');
  }, [currentUser?.uid]);

  const saveRename = useCallback(async () => {
    if (!editingSubId || !currentUser?.uid || savingName) return;
    const name = channelNameDraft.trim().slice(0, 60);
    if (!name) { setRenameError('Enter a channel name.'); return; }
    setSavingName(true);
    setRenameError('');
    try {
      // The write is bound to the signed-in uid (matches the Firestore ownership rule) and keyed by
      // the single sub-channel being edited, so the account's other channels keep their own names.
      await setChannelSubName(currentUser.uid, editingSubId, name);
      setRenamedSubs(prev => ({ ...prev, [editingSubId]: name }));
      setEditingSubId(null);
    } catch {
      setRenameError('Could not save the name. Try again.');
    } finally {
      setSavingName(false);
    }
  }, [channelNameDraft, currentUser?.uid, editingSubId, savingName]);

  // ── Favorites ─────────────────────────────────────────────────────────────────
  // Starred channels live in localStorage and mirror to the profile (so they show in the profile's
  // presets area). `favOnly` turns the guide into the viewer's favorites list.
  const [favs, setFavs] = useState<FavoriteChannel[]>(() => getFavoriteChannels(currentUser?.uid));
  const [favOnly, setFavOnly] = useState(false);
  useEffect(() => {
    const off = subscribeFavoriteChannels(setFavs, currentUser?.uid);
    if (currentUser?.uid) void syncFavoriteChannelsFromProfile(currentUser.uid);
    return off;
  }, [currentUser?.uid]);
  const favKeys = useMemo(() => new Set(favs.map(f => f.key)), [favs]);
  const isFav = useCallback((ch: TvChannel) => favKeys.has(favoriteKey(ch)), [favKeys]);
  const toggleFav = useCallback((ch: TvChannel) => {
    void toggleFavoriteChannel({
      key: favoriteKey(ch), name: ch.name, number: ch.number, logoUrl: ch.logo,
      ownerId: ch.scheduleOwner || ch.ownerId, plajahId: ch.plajahId, sourceId: ch.id,
    }, currentUser?.uid);
  }, [currentUser?.uid]);

  // ── Channel logo (owner only) ─────────────────────────────────────────────────
  // Click the logo (or right-click → Change logo) → pick an image → it is uploaded to the owner's
  // storage and saved against THIS sub-channel only. Clearing falls back to the account logo, then
  // the profile photo, then the Plajah chevron.
  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoTargetRef = useRef<TvChannel | null>(null);
  const [logoBusy, setLogoBusy] = useState<string | null>(null);
  const [logoError, setLogoError] = useState('');
  const pickLogo = useCallback((ch: TvChannel) => {
    if (!canManageChannel(ch, currentUser)) return;
    logoTargetRef.current = ch;
    setLogoError('');
    logoInputRef.current?.click();
  }, [currentUser]);
  const onLogoFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';                       // let the same file be picked again later
    const ch = logoTargetRef.current;
    if (!file || !ch?.subKey || !currentUser?.uid) return;
    setLogoBusy(ch.subKey); setLogoError('');
    try {
      const url = await uploadChannelLogo(currentUser.uid, file);
      await setChannelSubLogo(currentUser.uid, ch.subKey, url);
      setLocalLogos(prev => ({ ...prev, [ch.subKey!]: url }));
    } catch (err: any) {
      setLogoError(err?.message || 'Could not update the logo. Try again.');
    } finally { setLogoBusy(null); }
  }, [currentUser?.uid]);
  const clearLogo = useCallback(async (ch: TvChannel) => {
    if (!ch.subKey || !currentUser?.uid) return;
    try { await setChannelSubLogo(currentUser.uid, ch.subKey, null); setLocalLogos(prev => ({ ...prev, [ch.subKey!]: '' })); }
    catch { setLogoError('Could not remove the logo. Try again.'); }
  }, [currentUser?.uid]);

  // ── Right-click / long-press quick settings (the canonical context-menu primitive) ──────
  const channelLink = useCallback((ch: TvChannel) => {
    const owner = ch.scheduleOwner || ch.ownerId;
    const id = ch.plajahId ? `plajah:${ch.plajahId}` : owner ? `owner:${owner}` : `source:${ch.id}`;
    return buildShareUrl('channel', id, { n: ch.number, source: ch.id });
  }, []);
  const channelMenu = useContextMenu<TvChannel>((ch) => {
    const mine = canManageChannel(ch, currentUser);
    const hasCustomLogo = !!ch.subKey && !!ownerBranding.get(ch.scheduleOwner || ch.ownerId || '')?.subLogos?.[ch.subKey];
    return [
      { kind: 'header', label: `CH ${ch.number} · ${ch.name}` },
      { id: 'fav', label: isFav(ch) ? 'Remove from favorites' : 'Add to favorites', icon: <Heart size={14} />, onSelect: () => toggleFav(ch) },
      { id: 'link', label: 'Copy channel link', icon: <Link2 size={14} />, onSelect: () => { void navigator.clipboard?.writeText(channelLink(ch)).catch(() => {}); } },
      ...(mine ? [
        { kind: 'separator' as const },
        { id: 'rename', label: 'Rename channel…', icon: <Pencil size={14} />, onSelect: () => { setIdx(channels.findIndex(c => c.id === ch.id)); beginRename(ch); } },
        { id: 'logo', label: 'Change logo…', icon: <ImagePlus size={14} />, onSelect: () => pickLogo(ch) },
        { id: 'logo-clear', label: 'Remove custom logo', icon: <X size={14} />, disabled: !hasCustomLogo, onSelect: () => { void clearLogo(ch); } },
        { id: 'settings', label: 'Channel settings (Master Control)', icon: <Settings2 size={14} />, onSelect: () => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'MASTER_CONTROL' } })) },
      ] : []),
    ];
  });

  // ── Sharing the channel that's on the dial right now ──────────────────────────
  // A stable key the /share route and the deep-link both understand: `plajah:<id>` for a
  // first-party channel, `owner:<uid>` for an account, or `source:<id>` for a curated feed.
  // The source key distinguishes multiple subchannels owned by the same account.
  const shareMeta = useMemo(() => {
    if (!selected) return null;
    const owner = selected.scheduleOwner || selected.ownerId;
    const id = selected.plajahId ? `plajah:${selected.plajahId}` : owner ? `owner:${owner}` : `source:${selected.id}`;
    if (!id) return null;
    const url = buildShareUrl('channel', id, { n: selected.number, source: selected.id });
    const title = `${selected.name} · Plajah ${selected.number}`;
    const text = selected.isLive
      ? `${selected.name} is live right now on Plajah ${selected.number}. Tune in.`
      : `Tune in to ${selected.name} on Plajah ${selected.number}.`;
    return { id, url, title, text, sourceId: selected.id, name: selected.name, number: selected.number, now: selected.now };
  }, [selected]);

  const postChannelToFeed = useCallback(async () => {
    if (!shareMeta) return;
    // Just the live-channel card — no auto-written body. The card carries the name, the number and
    // what's on now, and taps straight into the channel.
    await createPost({
      text: '',
      isPublic: true,
      assetEmbed: {
        type: 'CHANNEL',
        id: shareMeta.id,
        sourceId: shareMeta.sourceId,
        channelNumber: shareMeta.number,
        title: shareMeta.name,
        subtitle: `CH ${shareMeta.number}${shareMeta.now ? ` · ${shareMeta.now}` : ''}`,
      },
    } as any);
  }, [shareMeta]);

  // Full-screen viewing: hides the dial + guide so the programme fills the panel. On a TV it engages
  // automatically after a spell with no remote input (long enough not to fight browsing, short enough
  // that leaning back gets you a full picture); ANY input brings the chrome straight back.
  const [immersive, setImmersive] = useState(false);
  const idleRef = useRef<any>(null);

  // REAL browser full screen (desktop/mobile web). The Full screen button used to only hide the
  // dial + guide inside the page, so the browser chrome stayed and Esc did nothing. Now it takes
  // the root element full screen; Esc is handled natively by the browser, and the
  // `fullscreenchange` listener keeps our chrome state in step however it was exited.
  // Mouse behaves like a normal video player: movement reveals the controls, ~3s of stillness
  // hides them (and the cursor) again. TVs are already full screen and keep their remote idle model.
  const rootRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);

  // PHONE (portrait) layout. The desktop/TV layout — video filling the panel with a rolling dial
  // down the right edge and a sideways card strip — is built for a wide screen with a remote or
  // mouse; on a phone the dial eats the picture and the strip is a thumb-twister. Compact stacks
  // it the way a phone TV app does: 16:9 player on top, what's on, then a vertical channel list.
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 639px) and (orientation: portrait)').matches && !getPlatformInfo().isTV);
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 639px) and (orientation: portrait)');
    if (!mq) return;
    const on = () => setCompact(mq.matches && !getPlatformInfo().isTV);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  // Swipe the picture up/down to change channel (compact only; the dial isn't shown there).
  const swipeRef = useRef<{ y: number; x: number } | null>(null);
  const fsRef = useRef(false);
  const fsEnteredAtRef = useRef(0);
  // The Windows app is a WebView2 shell. HTML element full screen there only fills the web view —
  // the window itself (title bar, taskbar) stays — unless the host also switches the WINDOW to full
  // screen, which the shell exposes as a bridge command. So in the app we do both: window full screen
  // for the real thing, element full screen so the surface covers the app's own sidebars too.
  const nativeFsRef = useRef(false);
  const fsElement = () => (document as any).fullscreenElement || (document as any).webkitFullscreenElement || null;
  const syncFs = () => {
    const on = !!fsElement() || nativeFsRef.current;
    fsRef.current = on;
    setIsFs(on);
    return on;
  };
  const leaveFullscreen = () => {
    if (fsElement()) (document.exitFullscreen || (document as any).webkitExitFullscreen)?.call(document);
    if (nativeFsRef.current) { nativeFsRef.current = false; setNativeFullscreen(false); }
    syncFs();
  };
  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current as any;
    if (fsElement() || nativeFsRef.current) { leaveFullscreen(); return; }
    setImmersive(true);
    fsEnteredAtRef.current = Date.now();
    if (isWindowsApp()) { nativeFsRef.current = true; setNativeFullscreen(true); syncFs(); }
    const req = el?.requestFullscreen || el?.webkitRequestFullscreen;
    if (!req || getPlatformInfo().isTV) return;          // no API (e.g. iPhone Safari): in-page full screen only
    Promise.resolve(req.call(el)).catch(() => { /* denied → stay in the in-page / window full screen */ });
  }, []);

  useEffect(() => {
    const armIdle = () => {
      if (idleRef.current) clearTimeout(idleRef.current);
      const ms = getPlatformInfo().isTV ? 15000 : fsRef.current ? 3000 : 0;
      if (!ms) return;
      idleRef.current = setTimeout(() => setImmersive(true), ms);
    };
    const wake = (e?: Event) => {
      // Browsers fire a synthetic mousemove (no movement) when the layout changes under a resting
      // cursor — which is exactly what entering full screen does — and that used to bring the whole
      // guide straight back. Only a real movement counts, and never in the moment we just went full.
      if (e && e.type === 'mousemove') {
        const m = e as MouseEvent;
        if (Math.abs(m.movementX || 0) + Math.abs(m.movementY || 0) < 2) return;
        if (Date.now() - fsEnteredAtRef.current < 700) return;
      }
      setImmersive(false); armIdle();
    };
    const onFsChange = () => {
      // The element left full screen (Esc, browser UI, another page took it): drop the window out too.
      if (!fsElement() && nativeFsRef.current) { nativeFsRef.current = false; setNativeFullscreen(false); }
      const on = syncFs();
      if (on) armIdle();
      else { setImmersive(false); armIdle(); }            // Esc / browser exit → bring the guide back
    };
    // If the browser refused element full screen but the window is full (app), Esc has nothing to
    // exit natively — so Esc leaves it ourselves.
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && nativeFsRef.current && !fsElement()) leaveFullscreen(); };
    armIdle();
    window.addEventListener('keydown', wake);
    window.addEventListener('keydown', onEsc);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('mousemove', wake);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      if (idleRef.current) clearTimeout(idleRef.current);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('keydown', onEsc);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('mousemove', wake);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      leaveFullscreen();
    };
  }, []);

  // `F` toggles full screen, like every video player.
  useEffect(() => {
    const onF = (e: KeyboardEvent) => {
      if ((e.key !== 'f' && e.key !== 'F') || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      toggleFullscreen();
    };
    window.addEventListener('keydown', onF);
    return () => window.removeEventListener('keydown', onF);
  }, [toggleFullscreen]);

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
    // THE boundary: this is what ends an ad break and returns the channel to programming, exactly on time.
    fastTimerRef.current = setTimeout(() => syncRef.current(), Math.max(100, remaining * 1000));
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
    if (pos.offAir || !hasPlayableProgramme(slots)) { syncRef.current(); return; }
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
    const start = (sched: FastChannelSchedule | null, vids: any[] = []) => {
      if (cancelled) return;
      fastSchedRef.current = sched;
      const rawSlots = activeDaySlots(sched, clockNow());
      fastSlotsRef.current = sanitizeScheduleForPlayout(rawSlots, vids);
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
        start(fixed, vids);
        if (fixed) {
          const unknown = unresolvedDurationUrls(fixed);
          if (unknown.length) healUnknownDurations(fixed).then(healed => {
            if (cancelled || fastOwnerRef.current !== owner) return;
            schedCache.current.set(owner, healed);
            start(healed, vids);
          }).catch(() => {});
        }
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

  // Height of the bottom guide panel, so the pillar can sit above it rather than over it.
  const guidePanelRef = useRef<HTMLDivElement>(null);
  const [guidePanelH, setGuidePanelH] = useState(260);
  useEffect(() => {
    const el = guidePanelRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setGuidePanelH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [immersive]);

  const guideMatchesPlaying = useCallback((g: GuideChannel) => {
    const cur = channels[loadedIndex];
    if (!cur) return false;
    if (cur.plajahId) return g.plajahId === cur.plajahId;
    if (cur.feed?.id && g.feed?.id) return g.feed.id === cur.feed.id;
    return !!cur.ownerId && g.ownerId === cur.ownerId;
  }, [channels, loadedIndex]);

  const tuneFromGuide = useCallback((g: GuideChannel) => {
    setGuideOpen(false);
    let i = -1;
    if (g.kind === 'live' && g.feed?.id) i = channels.findIndex(c => c.feed?.id === g.feed.id);
    if (i < 0 && (g.ownerId || g.plajahId)) i = findSharedChannel(channels, { ownerId: g.ownerId, plajahId: g.plajahId });
    if (i >= 0) { setIndex(i); setLoadedIndex(i); setMuted(false); }
  }, [channels]);

  // Bottom-guide window: on the horizontal (non-compact) guide, only ±GUIDE_HALF_WINDOW cards around
  // the selection are mounted. Favorites-only and the phone's vertical list stay unwindowed (they
  // are short, and the favorites filter would make index arithmetic lie about widths).
  const guideWindow = !compact && !favOnly && channels.length > GUIDE_HALF_WINDOW * 2 + 1
    ? { start: Math.max(0, index - GUIDE_HALF_WINDOW), end: Math.min(channels.length - 1, index + GUIDE_HALF_WINDOW) }
    : null;

  return (
    // On the TV this sits BELOW the shell's tab bar (which is 64px tall) so the Live tab never covers
    // the navigation — the viewer can always press up and move across to another tab.
    <div
      // data-tv-capture: see the comment above the keydown effect — without this the geometric
      // TVNavigationLayer eats arrow keys before this screen's own handler ever runs.
      data-tv-capture
      // A full-screen PAGE, not a dialog: without this TVNavigationLayer classified the fixed z-60
      // root as a modal, and remote Back "closed" it by clicking the first small top-right icon
      // (Share / Mute) instead of going back.
      data-tv-no-trap
      ref={rootRef}
      className={`${isFs && immersive ? 'cursor-none ' : ''}fixed ${tvInset ? 'inset-x-0 bottom-0 top-16' : tvRailInset ? 'inset-y-0 right-0 bottom-0' : 'inset-0'} z-[60] bg-[#04050a] text-white flex flex-col`}
      style={{
        // On a phone the app's fixed bottom tab bar sits above this surface, so stop above it
        // (--pj-mobile-nav-h is published by App; it is unset — 0 — on TV/desktop). Real browser
        // full screen takes the whole display, where that bar isn't shown.
        height: tvInset ? 'calc(100dvh - 4rem)' : isFs ? '100dvh' : 'calc(100dvh - var(--pj-mobile-nav-h, 0px))',
        // left + right (no width) is deliberate: a fixed element with both edges set stretches to
        // fill the gap on its own, which stays correct if TV_SPINE_W ever changes.
        left: tvRailInset || undefined,
      }}
    >
      {/* Top bar (hidden in full-screen viewing) */}
      {!immersive && (
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0 z-30" style={compact ? { paddingTop: 'max(0.625rem, env(safe-area-inset-top))' } : undefined}>
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/15"><ArrowLeft size={17} /></button>
        <div className="flex items-center gap-2">
          <Radio size={14} style={{ color: BRAND }} />
          <span className="text-[11px] font-black uppercase tracking-[0.35em]">Plajah Live</span>
        </div>
        <div className="flex items-center gap-2">
          {shareMeta && (
            <ShareButton
              title={shareMeta.title}
              text={shareMeta.text}
              url={shareMeta.url}
              className="w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/15 text-white"
              iconSize={16}
              onPostToPlajah={currentUser ? postChannelToFeed : undefined}
              plajahLabel="Post this channel to your feed"
            />
          )}
          <button onClick={() => setMuted(m => !m)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/15">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
          <button onClick={toggleFullscreen} title={isFs ? 'Exit full screen (Esc)' : 'Full screen (F)'} aria-label={isFs ? 'Exit full screen' : 'Full screen'} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/15">{isFs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          {onOpenClassic && <button onClick={onOpenClassic} title="All live" className="w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/15"><LayoutGrid size={16} /></button>}
        </div>
      </div>
      )}

      {/* Content + dial */}
      <div
        className={compact && !immersive ? 'relative shrink-0 w-full aspect-video bg-black' : 'relative flex-1 min-h-0'}
        onTouchStart={compact ? (e) => { swipeRef.current = { y: e.touches[0].clientY, x: e.touches[0].clientX }; } : undefined}
        onTouchEnd={compact ? (e) => {
          const s = swipeRef.current; swipeRef.current = null;
          if (!s) return;
          const dy = e.changedTouches[0].clientY - s.y, dx = e.changedTouches[0].clientX - s.x;
          if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.5) setIdx(Math.max(0, Math.min(channels.length - 1, index + (dy < 0 ? 1 : -1))));
        } : undefined}
        onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('button,a,input,textarea,[role="button"]')) toggleFullscreen(); }}>
        {/* A generative channel has no url and no file, so it does not go through ChannelPlayer
            at all — it renders itself from the clock. Mounted once and never keyed on a slot:
            re-mounting it would restart a session someone is inside. */}
        {playing?.plajahId === 'endless-hour' ? (
          <EndlessHourPlayer muted={muted} />
        ) : (
        <>
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
        </>
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
        {selected && (!compact || immersive) && (
          <div className="absolute top-4 left-4 z-20 max-w-[60%]">
            <ChannelLogo src={selected.logo} name={selected.name} size={44} className="mb-2 shadow-lg" />
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
        {!immersive && !compact && (
        <div className="absolute right-2 top-0 bottom-0 z-40 flex items-center">
          <div className="flex flex-col items-center justify-center gap-1.5 h-full py-1">
            <button aria-label="Channel up" onClick={() => setIdx(Math.max(0, index - 1))}
              className="w-11 h-10 rounded-xl bg-black/60 border border-white/15 backdrop-blur grid place-items-center hover:bg-white/20 active:scale-95"><ChevronUp size={20} /></button>
            {/* min-h-0 + the cap keep the dial inside a short panel (phone landscape) instead of
                overflowing under the guide. */}
            <div style={{ flex: '0 1 62vh', minHeight: 0, width: 78 }}><ChannelDial channels={channels} index={index} onIndex={setIdx} /></div>
            <button aria-label="Channel down" onClick={() => setIdx(Math.min(channels.length - 1, index + 1))}
              className="w-11 h-10 rounded-xl bg-black/60 border border-white/15 backdrop-blur grid place-items-center hover:bg-white/20 active:scale-95"><ChevronDown size={20} /></button>
          </div>
        </div>
        )}
      </div>

      {/* Bottom EPG guide (hidden in full-screen viewing) */}
      {!immersive && (
      <div
        ref={guidePanelRef}
        className={compact ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain border-t border-white/10 bg-black/50 px-3 pt-3' : 'shrink-0 border-t border-white/10 bg-black/50 backdrop-blur px-3 py-3'}
        style={compact ? { paddingBottom: '1rem' } : undefined}
      >
        {/* Phone: what's on, right under the picture (the desktop layout overlays this on the video). */}
        {compact && selected && (
          <div className="mb-3 flex items-start gap-3">
            <ChannelLogo src={selected.logo} name={selected.name} size={52} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md" style={{ background: selected.badge === 'LIVE' ? '#e11' : selected.badge === 'FAST' ? '#36c5f0' : selected.accent, color: '#000' }}>
                  {selected.badge === 'LIVE' ? '● LIVE' : selected.badge}
                </span>
                <span className="text-[11px] font-black text-white/60">CH {selected.number}</span>
                {loadedIndex !== index && <span className="text-[10px] font-bold text-white/40">tuning…</span>}
              </div>
              <h2 className="text-lg font-black leading-tight line-clamp-2">{selected.name}</h2>
              <p className="text-[12px] text-white/60 font-bold mt-0.5 truncate">{selected.sub} · Now: {selected.now}</p>
            </div>
            <button
              type="button"
              aria-pressed={isFav(selected)}
              aria-label={isFav(selected) ? 'Remove from favorites' : 'Add to favorites'}
              onClick={() => toggleFav(selected)}
              className={`shrink-0 w-10 h-10 rounded-full grid place-items-center bg-white/10 ${isFav(selected) ? 'text-[#FF8C00]' : 'text-white/70'}`}
            ><Heart size={18} fill={isFav(selected) ? 'currentColor' : 'none'} /></button>
          </div>
        )}
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
          <span className="text-[9px] font-bold text-white/30">{favOnly ? `${channels.filter(isFav).length} favorites` : `${channels.length} channels`}</span>
          {isTv && <span className="hidden lg:inline text-[9px] font-black uppercase tracking-widest text-white/30">· OK guide · 0–9 tune · ◀ ▶ CH ± change</span>}
          <button
            type="button"
            aria-pressed={favOnly}
            onClick={() => setFavOnly(v => !v)}
            title={favOnly ? 'Show every channel' : 'Show only my favorites'}
            className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border transition-colors ${favOnly ? 'bg-[#FF8C00] border-[#FF8C00] text-black' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}
          >
            <Star size={11} fill={favOnly ? 'currentColor' : 'none'} /> Favorites{favs.length > 0 ? ` · ${favs.length}` : ''}
          </button>
        </div>
        {logoError && <p role="alert" className="mb-2 text-[10px] font-bold text-red-400">{logoError}</p>}
        {favOnly && !channels.some(isFav) && (
          <p className="mb-2 rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-white/45">
            No favorites yet — tap the heart on any channel, or right-click it, to keep it here.
          </p>
        )}
        <div ref={guideRef} className={compact ? 'flex flex-col gap-2 pb-2' : 'flex gap-2 overflow-x-auto no-scrollbar pb-1'}>
          {/* Windowed: only cards near the selection are real DOM; spacers hold the scroll width.
              Every channel step used to re-render 300+ cards (logos, menus, buttons) on a 2 GB TV. */}
          {guideWindow && guideWindow.start > 0 && <div aria-hidden className="shrink-0" style={{ width: guideWindow.start * GUIDE_CARD_STRIDE - 8 }} />}
          {channels.map((ch, i) => {
            const on = i === index;
            if (guideWindow && (i < guideWindow.start || i > guideWindow.end)) return null;
            if (favOnly && !isFav(ch)) return null;
            const mine = canManageChannel(ch, currentUser);
            const fav = isFav(ch);
            return (
              <div
                key={ch.id}
                data-ch={i}
                {...channelMenu.bind(ch)}
                onClick={() => setIdx(i)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIdx(i); } }}
                className={`${compact ? 'w-full min-h-[64px]' : 'shrink-0 w-52'} text-left rounded-xl border p-2.5 transition-colors cursor-pointer`}
                style={{ borderColor: on ? BRAND : 'rgba(255,255,255,0.08)', background: on ? `${BRAND}1f` : 'rgba(255,255,255,0.03)' }}
              >
                <div className="flex items-start gap-2.5">
                  {/* Channel logo — the owner clicks it to change it. */}
                  {mine ? (
                    <button
                      type="button"
                      aria-label={`Change logo for ${ch.name}`}
                      title="Change channel logo"
                      onClick={(e) => { e.stopPropagation(); pickLogo(ch); }}
                      className="group relative shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C00]"
                    >
                      <ChannelLogo src={ch.logo} name={ch.name} size={compact ? 44 : 38} />
                      <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                        {logoBusy === ch.subKey ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ImagePlus size={15} />}
                      </span>
                    </button>
                  ) : (
                    <ChannelLogo src={ch.logo} name={ch.name} size={compact ? 44 : 38} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] font-black" style={{ color: on ? BRAND : 'rgba(255,255,255,0.4)' }}>CH {ch.number}</span>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded" style={{ background: ch.badge === 'LIVE' ? '#e11' : ch.badge === 'FAST' ? '#36c5f0' : ch.accent, color: '#000' }}>{ch.badge === 'LIVE' ? 'LIVE' : ch.badge}</span>
                      <button
                        type="button"
                        aria-label={fav ? `Remove ${ch.name} from favorites` : `Add ${ch.name} to favorites`}
                        aria-pressed={fav}
                        title={fav ? 'Remove from favorites' : 'Add to favorites'}
                        onClick={(e) => { e.stopPropagation(); toggleFav(ch); }}
                        className={`ml-auto w-7 h-7 -my-1 rounded-lg grid place-items-center hover:bg-white/10 ${fav ? 'text-[#FF8C00]' : 'text-white/45 hover:text-white'}`}
                      >
                        <Heart size={13} fill={fav ? 'currentColor' : 'none'} />
                      </button>
                      {mine && editingSubId !== (ch.subKey || ch.id) && (
                        <button
                          type="button"
                          aria-label={`Rename ${ch.name}`}
                          title="Edit my channel name"
                          onClick={(e) => { e.stopPropagation(); setIdx(i); beginRename(ch); }}
                          className="w-7 h-7 -my-1 rounded-lg grid place-items-center text-white/55 hover:text-white hover:bg-white/10"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                    {!!currentUser && editingSubId === (ch.subKey || ch.id) && on ? (
                      <div onClick={e => e.stopPropagation()} className="mt-1">
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={channelNameDraft}
                            maxLength={60}
                            aria-label="Channel name"
                            onChange={e => setChannelNameDraft(e.target.value)}
                            onKeyDown={e => {
                              e.stopPropagation();
                              if (e.key === 'Enter') { e.preventDefault(); void saveRename(); }
                              if (e.key === 'Escape') setEditingSubId(null);
                            }}
                            className="min-w-0 flex-1 rounded-md border border-white/20 bg-black/50 px-2 py-1 text-[12px] font-black text-white outline-none focus:border-[#FF8C00]"
                          />
                          <button type="button" disabled={savingName} aria-label="Save channel name" onClick={() => void saveRename()}
                            className="w-7 h-7 rounded-md grid place-items-center bg-[#FF8C00] text-black disabled:opacity-50"><Check size={13} /></button>
                          <button type="button" disabled={savingName} aria-label="Cancel renaming" onClick={() => setEditingSubId(null)}
                            className="w-7 h-7 rounded-md grid place-items-center bg-white/10 text-white"><X size={13} /></button>
                        </div>
                        {renameError && <p role="alert" className="mt-1 text-[9px] font-bold text-red-400">{renameError}</p>}
                      </div>
                    ) : (
                      <p className="text-[12px] font-black leading-tight truncate">{ch.name}</p>
                    )}
                    <p className="text-[10px] text-white/45 truncate">Now: {ch.now}</p>
                  </div>
                </div>
              </div>
            );
          })}
          {guideWindow && guideWindow.end < channels.length - 1 && <div aria-hidden className="shrink-0" style={{ width: (channels.length - 1 - guideWindow.end) * GUIDE_CARD_STRIDE - 8 }} />}
        </div>
      </div>
      )}

      {/* Full grid guide over the player (OK / Guide). Tuning picks the matching Live TV+ channel. */}
      {guideOpen && (
        <Suspense fallback={null}>
          <PlajahEpgGuide
            feeds={feeds || []}
            fastChannels={fastChannels}
            onClose={() => setGuideOpen(false)}
            initialMatch={guideMatchesPlaying}
            onTune={tuneFromGuide}
          />
        </Suspense>
      )}

      {/* Home pillar, right edge, between the top bar and the bottom guide. Fades with the guide. */}
      {isTv && !compact && (
        <Suspense fallback={null}>
          <TvAmbientPillar
            visible={!immersive && !guideOpen}
            onExpand={openAmbient}
            top={(tvInset ? 64 : 0) + 64}
            bottom={guidePanelH + 16}
          />
        </Suspense>
      )}

      {/* Number entry readout — what you've typed so far, like a TV's channel OSD. */}
      {tuneBuf && (
        <div className="absolute top-6 right-8 z-50 rounded-2xl px-6 py-3 bg-black/75 border border-white/15 font-mono font-black text-5xl tabular-nums text-white"
          style={{ boxShadow: '0 0 0 3px #FF8C00' }} aria-live="polite">
          {tuneBuf}<span className="animate-pulse text-[#FF8C00]">_</span>
        </div>
      )}

      {/* Owner-only logo picker (opened from the logo button or the right-click menu). */}
      <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onLogoFile} />
      {channelMenu.node}

      {/* Full-screen: a quiet hint that any press brings the guide back. */}
      {immersive && (
        <button onClick={() => { if (fsElement() || nativeFsRef.current) toggleFullscreen(); else setImmersive(false); }}
          className="absolute bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-black/55 border border-white/15 backdrop-blur text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white">
          <Minimize2 size={14} /> {isFs ? 'Exit full screen · Esc' : 'Show guide'}
        </button>
      )}
    </div>
  );
};

export default LiveTvPlus;
// The guide and player load the same schedule in parallel. Share one bounded probe job so Mux
// manifests are not fetched twice — especially important on Android/TV hardware.
const durationProbeJobs = new Map<string, Promise<Map<string, number>>>();
const healUnknownDurations = async (schedule: FastChannelSchedule): Promise<FastChannelSchedule> => {
  const urls = unresolvedDurationUrls(schedule).slice(0, 120);
  if (!urls.length) return schedule;
  const key = [...urls].sort().join('|');
  let job = durationProbeJobs.get(key);
  if (!job) {
    job = probeDurations(urls, 4, 9000);
    durationProbeJobs.set(key, job);
  }
  return backfillScheduleDurationsByUrl(schedule, await job);
};
