/**
 * ProfileLiveTiles — the live rail of the profile marquee.
 *
 * Replaces the old pill strip (On Air · Watch Live · Artist Radio · Watch Channel ·
 * Manage Channel) with an ON AIR marker plus TWO preview tiles:
 *
 *   • Artist Radio  — the station's current track, its art and a live level meter.
 *   • Watch Channel — the account's FIRST channel and whatever is on it right now.
 *
 * Hover previews the surface in place (muted video for the channel, a quiet audio
 * preview for the radio); click opens the full surface — the same destinations the
 * removed buttons had, so nothing became unreachable.
 *
 * Previews are pointer-only (never touch, never TV) and never fight the global
 * player: if something is already playing, the radio tile stays visual.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Radio, Tv, Play, Settings2 } from 'lucide-react';
import type { UserProfile } from '../../types';
import type { RadioNowPlaying, ChannelNowPlaying } from '../../hooks/useProfileMarquee';
import { useHoverPreviewAllowed } from '../../hooks/useProfileMarquee';
import { useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';

interface ProfileLiveTilesProps {
  profile: UserProfile;
  isOwnProfile: boolean;
  isMobile: boolean;
  radio: RadioNowPlaying | null;
  channel: ChannelNowPlaying | null;
  showRadio: boolean;
  showChannel: boolean;
  onOpenRadio: () => void;
  onOpenChannel: () => void;
  onManageChannel: () => void;
  canManageChannel: boolean;
}

const HOVER_DELAY_MS = 420;

const mmss = (secs: number): string => {
  const s = Math.max(0, Math.floor(secs || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
};

/** 22 bars whose heights bob out of phase — a level meter, not a real FFT. */
const Waveform: React.FC<{ active: boolean; color: string }> = ({ active, color }) => (
  <span className="flex items-end gap-[2px] h-4" aria-hidden="true">
    {Array.from({ length: 22 }).map((_, i) => (
      <span
        key={i}
        className="pj-marquee-motion w-[2.5px] rounded-full"
        style={{
          background: color,
          height: active ? undefined : '30%',
          animation: active ? `pj-marquee-bob ${0.8 + (i % 5) * 0.12}s ease-in-out ${i * 0.07}s infinite` : undefined,
        }}
      />
    ))}
  </span>
);

const ProfileLiveTiles: React.FC<ProfileLiveTilesProps> = ({
  profile,
  isOwnProfile,
  isMobile,
  radio,
  channel,
  showRadio,
  showChannel,
  onOpenRadio,
  onOpenChannel,
  onManageChannel,
  canManageChannel,
}) => {
  const hoverAllowed = useHoverPreviewAllowed() && !isMobile;
  const { isPlaying } = useGlobalPlayerState();
  const isOnAir = !!profile.liveStreamConfig?.isActive;

  // ── Channel hover preview (muted video, joined at the live offset) ──────────
  const [channelPreviewing, setChannelPreviewing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const channelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardownChannelPreview = useCallback(() => {
    if (channelTimerRef.current) { clearTimeout(channelTimerRef.current); channelTimerRef.current = null; }
    if (hlsRef.current) { try { hlsRef.current.destroy(); } catch { /* */ } hlsRef.current = null; }
    const v = videoRef.current;
    if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* */ } }
    setChannelPreviewing(false);
  }, []);

  useEffect(() => () => teardownChannelPreview(), [teardownChannelPreview]);

  // Attach the stream once the <video> is mounted by the previewing state.
  useEffect(() => {
    if (!channelPreviewing || !channel?.previewUrl) return;
    let cancelled = false;
    const v = videoRef.current;
    if (!v) return;
    const joinAt = channel.isLive ? 0 : Math.max(0, channel.offsetSec);

    const startPlain = () => {
      v.src = channel.previewUrl!;
      v.currentTime = joinAt;
      v.play().catch(() => { /* autoplay refused → the poster stays */ });
    };

    if (channel.isHls) {
      // Native HLS (Safari/iOS) first, otherwise hls.js — loaded ONLY on hover so the
      // profile bundle never carries it.
      if (v.canPlayType('application/vnd.apple.mpegurl')) {
        startPlain();
      } else {
        import('hls.js').then(mod => {
          if (cancelled || !videoRef.current) return;
          const Hls = mod.default;
          if (!Hls.isSupported()) return;
          const hls = new Hls({ enableWorker: false, maxBufferLength: 8, startPosition: joinAt || -1 });
          hlsRef.current = hls;
          hls.attachMedia(videoRef.current);
          hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(channel.previewUrl!));
          hls.on(Hls.Events.MANIFEST_PARSED, () => { videoRef.current?.play().catch(() => { /* */ }); });
          hls.on(Hls.Events.ERROR, (_e: any, data: any) => { if (data?.fatal) { try { hls.destroy(); } catch { /* */ } hlsRef.current = null; } });
        }).catch(() => { /* preview simply doesn't start */ });
      }
    } else {
      startPlain();
    }
    return () => { cancelled = true; };
  }, [channelPreviewing, channel?.previewUrl, channel?.isHls, channel?.isLive, channel?.offsetSec]);

  const armChannelPreview = () => {
    if (!hoverAllowed || !channel?.previewUrl) return;
    if (channelTimerRef.current) clearTimeout(channelTimerRef.current);
    channelTimerRef.current = setTimeout(() => setChannelPreviewing(true), HOVER_DELAY_MS);
  };

  // ── Radio hover preview (quiet audio, joined at the satellite offset) ───────
  const [radioPreviewing, setRadioPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const radioTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardownRadioPreview = useCallback(() => {
    if (radioTimerRef.current) { clearTimeout(radioTimerRef.current); radioTimerRef.current = null; }
    const a = audioRef.current;
    if (a) { try { a.pause(); a.src = ''; } catch { /* */ } audioRef.current = null; }
    setRadioPreviewing(false);
  }, []);

  useEffect(() => () => teardownRadioPreview(), [teardownRadioPreview]);

  const armRadioPreview = () => {
    // Never talk over the global player, and never on touch.
    if (!hoverAllowed || isPlaying || !radio?.track?.url) return;
    if (radioTimerRef.current) clearTimeout(radioTimerRef.current);
    radioTimerRef.current = setTimeout(() => {
      try {
        const a = new Audio(radio.track.url);
        a.volume = 0.35;
        a.preload = 'auto';
        a.addEventListener('loadedmetadata', () => {
          try { if (radio.offsetSec < (a.duration || 0) - 2) a.currentTime = radio.offsetSec; } catch { /* */ }
        }, { once: true });
        audioRef.current = a;
        a.play().then(() => setRadioPreviewing(true)).catch(() => { audioRef.current = null; });
      } catch { /* */ }
    }, HOVER_DELAY_MS);
  };

  if (!isOnAir && !showRadio && !showChannel) return null;

  // Tracks imported without artist metadata store the literal "Unknown Artist" — on a
  // profile we always know whose station this is, so use the account name instead.
  const rawArtist = (radio?.track.artist || '').trim();
  const radioArtist = !rawArtist || /^unknown artist$/i.test(rawArtist) ? profile.displayName : rawArtist;

  const radioProgress = radio && radio.durationSec > 0
    ? Math.min(100, (radio.offsetSec / radio.durationSec) * 100)
    : 0;
  const channelProgress = channel && !channel.isLive && channel.durationSec > 0
    ? Math.min(100, (channel.offsetSec / channel.durationSec) * 100)
    : 0;

  return (
    <div className={`flex flex-wrap items-stretch gap-3 mt-5 ${isMobile ? 'justify-center' : ''}`}>
      {/* Keyframes ride with the component so the tiles work on any surface that renders them. */}
      <style>{`
        @keyframes pj-marquee-bob { 0%,100% { height: 22%; } 50% { height: 100%; } }
        @keyframes pj-marquee-sweep { 0% { transform: translateX(-60%); } 100% { transform: translateX(60%); } }
        @media (prefers-reduced-motion: reduce) {
          .pj-marquee-motion { animation: none !important; }
        }
      `}</style>

      {/* ── ON AIR ── */}
      {isOnAir && (
        <div
          className="shrink-0 flex flex-col items-center justify-center gap-1.5 w-[92px] rounded-2xl px-3 py-3 border"
          style={{ background: 'linear-gradient(160deg, rgba(255,45,85,0.28), rgba(212,0,85,0.12))', borderColor: 'rgba(255,45,85,0.5)' }}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF2D55] shadow-[0_0_14px_#FF2D55] animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD8E2]">On Air</span>
          <span className="text-[8px] font-black uppercase tracking-widest text-white/35 text-center leading-tight">
            {profile.liveStreamConfig?.title ? 'Live now' : 'Broadcasting'}
          </span>
        </div>
      )}

      {/* ── Artist Radio tile ── */}
      {showRadio && (
        <button
          type="button"
          onClick={onOpenRadio}
          onMouseEnter={armRadioPreview}
          onMouseLeave={teardownRadioPreview}
          onBlur={teardownRadioPreview}
          title={radio ? `${radio.track.title} — ${radio.stationName}` : 'Artist Radio'}
          className="group/radio relative flex min-w-[236px] flex-1 basis-[262px] items-stretch overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-left transition-all hover:-translate-y-0.5 hover:border-[#00DAF3]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00DAF3]"
        >
          <span className="relative w-[118px] shrink-0 overflow-hidden bg-black" style={{ aspectRatio: '16 / 11' }}>
            {radio?.artwork ? (
              <img src={radio.artwork} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover/radio:scale-105" />
            ) : (
              <span className="absolute inset-0" style={{ background: 'radial-gradient(80% 80% at 30% 25%, #FF8C00 0%, transparent 60%), radial-gradient(70% 70% at 75% 70%, #6B0099 0%, transparent 62%), linear-gradient(140deg,#2A0033,#4A0026)' }} />
            )}
            <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover/radio:opacity-100" style={{ background: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 4px)' }} />
            <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-[3px] text-[8px] font-black uppercase tracking-[0.14em] text-white backdrop-blur-sm">
              <span className="block h-1.5 w-1.5 rounded-full bg-[#00DAF3]" />
              {radioPreviewing ? 'Preview' : 'Radio'}
            </span>
            {radio && (
              <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-[2px] text-[9px] font-bold tabular-nums text-white">
                {mmss(radio.offsetSec)} / {mmss(radio.durationSec)}
              </span>
            )}
          </span>

          <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2.5">
            <span className="flex items-center gap-1.5 truncate text-[8.5px] font-black uppercase tracking-[0.18em] text-[#00DAF3]/85">
              <Radio size={10} />{radio ? 'Now playing' : 'Artist Radio'}
            </span>
            <span className="truncate text-[13.5px] font-black text-white">
              {radio ? radio.track.title : radio === null && showRadio ? 'Station standing by' : '—'}
            </span>
            <span className="truncate text-[11px] font-medium text-white/55">
              {radio ? `${radioArtist} — ${radio.stationName}` : `${profile.displayName}'s station`}
            </span>
            <span className="mt-0.5 flex items-center gap-2">
              <Waveform active={!!radio} color="linear-gradient(to top, rgba(0,218,243,0.35), #00DAF3)" />
              <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
                {radio ? `${radio.queueLength} in rotation` : 'Tune in'}
              </span>
            </span>
            {radio && (
              <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full" style={{ width: `${radioProgress}%`, background: 'linear-gradient(90deg,#00DAF3,#6B0099)' }} />
              </span>
            )}
          </span>

          <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1.5 bg-gradient-to-t from-black/85 to-transparent px-3 py-1 text-[8.5px] font-black uppercase tracking-[0.12em] text-white opacity-0 transition-all group-hover/radio:translate-y-0 group-hover/radio:opacity-100">
            {radioPreviewing ? '♪ Previewing — click to open the station' : isPlaying ? 'Click to open the station' : 'Hold to preview · click to open'}
          </span>
        </button>
      )}

      {/* ── Watch Channel tile ── */}
      {showChannel && (
        <div className="relative flex min-w-[236px] flex-1 basis-[262px]">
          <button
            type="button"
            onClick={onOpenChannel}
            onMouseEnter={armChannelPreview}
            onMouseLeave={teardownChannelPreview}
            onBlur={teardownChannelPreview}
            title={channel ? `${channel.title} — ${channel.channelName}` : 'Watch Channel'}
            className="group/chan relative flex w-full items-stretch overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-left transition-all hover:-translate-y-0.5 hover:border-[#FF2D55]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D40055]"
          >
            <span className="relative w-[118px] shrink-0 overflow-hidden bg-black" style={{ aspectRatio: '16 / 11' }}>
              {channelPreviewing && channel?.previewUrl ? (
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  preload="none"
                  poster={channel.thumbnail}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : channel?.thumbnail ? (
                <img src={channel.thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover/chan:scale-105" />
              ) : (
                <span className="absolute inset-0" style={{ background: 'radial-gradient(90% 60% at 20% 20%, #00DAF3 0%, transparent 55%), radial-gradient(70% 80% at 80% 80%, #D40055 0%, transparent 60%), linear-gradient(150deg,#08131A,#20041B)' }} />
              )}
              <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover/chan:opacity-100" style={{ background: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 4px)' }} />
              <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-[3px] text-[8px] font-black uppercase tracking-[0.14em] text-white backdrop-blur-sm">
                <span className={`block h-1.5 w-1.5 rounded-full ${channel?.isLive || isOnAir ? 'bg-[#FF2D55] animate-pulse' : 'bg-white/70'}`} />
                {channel?.isLive ? 'Live' : channelPreviewing ? 'Preview' : 'On now'}
              </span>
              {channel && !channel.isLive && channel.durationSec > 0 && (
                <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-[2px] text-[9px] font-bold tabular-nums text-white">
                  {mmss(channel.offsetSec)}
                </span>
              )}
              {!channelPreviewing && (
                <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover/chan:opacity-100">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-black"><Play size={13} fill="currentColor" /></span>
                </span>
              )}
            </span>

            <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2.5">
              <span className="flex items-center gap-1.5 truncate text-[8.5px] font-black uppercase tracking-[0.18em] text-white/40">
                <Tv size={10} />{channel ? channel.channelName : 'Watch channel'}
              </span>
              <span className="truncate text-[13.5px] font-black text-white">
                {channel ? channel.title : 'Channel standing by'}
              </span>
              <span className="truncate text-[11px] font-medium text-white/55">
                {channel ? channel.channelLabel : `${profile.displayName}'s channel`}
              </span>
              {channel && !channel.isLive && channel.durationSec > 0 && (
                <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full" style={{ width: `${channelProgress}%`, background: 'linear-gradient(90deg,#D40055,#FF8C00)' }} />
                </span>
              )}
            </span>

            <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1.5 bg-gradient-to-t from-black/85 to-transparent px-3 py-1 text-[8.5px] font-black uppercase tracking-[0.12em] text-white opacity-0 transition-all group-hover/chan:translate-y-0 group-hover/chan:opacity-100">
              {channelPreviewing ? '▶ Previewing — click to open the channel' : 'Hover to preview · click to open'}
            </span>
          </button>

          {/* Owner control lives ON the thing it manages, not in the identity row. */}
          {isOwnProfile && canManageChannel && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onManageChannel(); }}
              title="Manage channel"
              className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full border border-white/15 bg-black/55 text-white/70 backdrop-blur-sm transition-all hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Settings2 size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfileLiveTiles;
