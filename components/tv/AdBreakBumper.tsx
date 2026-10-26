import { thumb, THUMB, onThumbError } from '../../src/lib/imageThumb';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Plus, HeartHandshake, Radio, Check } from 'lucide-react';
import { Track, AdConfig } from '../../types';
import { fetchRadioTracks, likeTrack, addToLibrary, fetchAdConfigs } from '../../services/backendService';
import { fetchPlatformMedia } from '../../services/platformMediaService';
import { getSatellitePosition } from '../../services/radioEngine';
import { planBreak, segmentAt, fmGainAt, edgeDipAt, probeDuration, type BreakSeg, type BreakCandidate } from '../../services/fast/breakPlan';
import ComingUpNextBumper, { type UpNextItem } from './ComingUpNextBumper';
import DonationModal from '../DonationModal';
import PollSpot from './PollSpot';

/**
 * AdBreakBumper — plays a FAST/TV ad break as ONE sequential timeline (see services/fast/breakPlan):
 *   • every ident / spot / FM stretch is placed back to back from probed durations, so nothing ever
 *     overlaps, no spot is cut short, and the last segment ends exactly when the break does;
 *   • odd leftover seconds are Plajah FM (cover art + now-playing) and the Coming Up Next card, with
 *     FM fading in and out under them and silent during spots;
 *   • one clock drives segment changes, FM gain, the dip-to-black at every edge and the final hand-back
 *     to programming, so the break stays tight against the wall-clock schedule.
 */

const ORANGE = '#FF8C00';
const PURPLE = '#6B0099';
const MAGENTA = '#D40055';

/** How long we will wait for media durations before laying the break out (a silent black slate meanwhile). */
const PROBE_DEADLINE_MS = 1200;

interface Props {
  channelName: string;
  durationSec: number;
  upcoming?: UpNextItem[];
  logoUrl?: string;
  accent?: string;
  /** Mirror the player's mute — when true, Plajah FM fills silently (visuals only). */
  muted?: boolean;
  /** Fired once when the break's time is up — the player uses this to return to scheduled programming. */
  onComplete?: () => void;
  /** Station logo reveals. One opens the break; a second airs at the end, leading into the programme. */
  identUrls?: string[];
  /** The channel's Fan Vote room: open polls are shown, and votable, for the whole break. */
  pollRoom?: string;
  /** The break before a Fan Vote slot: announce this (locked) ballot's result instead of the usual break. */
  announcePollId?: string;
  /** The channel's own fun vignettes, mixed into the break's video rotation. */
  vignetteUrls?: string[];
  /** Plajah's own promo spots for this break (see services/promos/platformPromos). */
  promoSpots?: Array<{ url: string; title: string }>;
}

const shuffle = <T,>(a: T[]): T[] => {
  const o = [...a];
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
};

const AdBreakBumper: React.FC<Props> = ({ channelName, durationSec, upcoming = [], logoUrl, accent = ORANGE, muted = false, onComplete, identUrls = [], pollRoom, announcePollId, vignetteUrls = [], promoSpots = [] }) => {
  const [track, setTrack] = useState<Track | null>(null);
  const [ads, setAds] = useState<AdConfig[]>([]);
  const [plan, setPlan] = useState<BreakSeg[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [gift, setGift] = useState(false);
  const [liked, setLiked] = useState(false);
  const [added, setAdded] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const dipRef = useRef<HTMLDivElement>(null);
  const seekRef = useRef(0);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const startRef = useRef(performance.now());
  const planRef = useRef<BreakSeg[] | null>(null);
  const idxRef = useRef(-1);
  const completedRef = useRef(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  planRef.current = plan;

  const rawDur = Number(durationSec);
  const totalSec = Number.isFinite(rawDur) && rawDur > 0 ? Math.max(3, rawDur) : 30;
  const hasUpNext = upcoming.length > 0 && !announcePollId;

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    const a = audioRef.current;
    if (a) { try { a.pause(); a.src = ''; } catch { /* */ } }
    Object.values(videoRefs.current).forEach(v => { try { v?.pause(); } catch { /* */ } });
    onComplete?.();
  }, [onComplete]);

  // Load the Plajah FM song + every candidate spot, probe their real lengths, then lay the break out.
  useEffect(() => {
    let alive = true;
    startRef.current = performance.now();
    completedRef.current = false;
    (async () => {
      const [tracks, adConfigs, platBumpers, platPromos, platAds] = await Promise.all([
        fetchRadioTracks().catch(() => [] as Track[]),
        fetchAdConfigs().catch(() => [] as AdConfig[]),
        totalSec >= 12 ? fetchPlatformMedia('PLATFORM_BUMPER').catch(() => []) : Promise.resolve([]),
        totalSec >= 12 ? fetchPlatformMedia('CHANNEL_PROMO').catch(() => []) : Promise.resolve([]),
        totalSec >= 12 ? fetchPlatformMedia('PLATFORM_AD').catch(() => []) : Promise.resolve([]),
      ]);
      if (!alive) return;
      if (tracks.length) {
        const pos = getSatellitePosition(tracks);
        seekRef.current = pos.offsetSeconds;
        setTrack(tracks[pos.trackIndex] || tracks[0]);
      }
      const activeAds = adConfigs.filter(a => a.isActive && a.imageUrl);
      setAds(activeAds);

      // The channel's vignettes and Plajah's promos lead the rotation, alternating with platform media.
      const pool = shuffle([...platBumpers, ...platPromos, ...platAds].filter(a => a.url).map(a => ({ url: a.url, title: a.title })));
      const vig = shuffle(vignetteUrls).map((url, n) => ({ url, title: `Vignette ${n + 1}` }));
      const promos = shuffle(promoSpots);
      const mixed: { url: string; title: string }[] = [];
      for (let k = 0; k < Math.max(vig.length, pool.length, promos.length); k++) {
        if (vig[k]) mixed.push(vig[k]);
        if (promos[k]) mixed.push(promos[k]);
        if (pool[k]) mixed.push(pool[k]);
      }

      // Probe unique files only; the heavy-rotation channels repeat the same promo three times.
      const unique = [...new Set([...mixed.map(m => m.url), ...identUrls.slice(0, 2)])];
      const lengths = new Map<string, number>();
      if (totalSec >= 12 && unique.length) {
        await Promise.race([
          Promise.all(unique.map(async u => { lengths.set(u, await probeDuration(u, PROBE_DEADLINE_MS)); })),
          new Promise(r => setTimeout(r, PROBE_DEADLINE_MS)),
        ]);
      }
      if (!alive) return;
      const cand = (m: { url: string; title: string }): BreakCandidate => ({ ...m, durSec: lengths.get(m.url) || 0 });
      const spots = mixed.map(cand).filter(c => c.durSec > 0);
      const idents = identUrls.slice(0, 2).map(u => cand({ url: u, title: 'Ident' })).filter(c => c.durSec > 0 && c.durSec <= 12);
      const elapsed = (performance.now() - startRef.current) / 1000;
      setPlan(planBreak({
        totalSec,
        startSec: Math.min(elapsed, Math.max(0, totalSec - 3)),
        openIdent: idents[0] || null,
        closeIdent: idents[1] || idents[0] || null,
        spots,
        images: activeAds.map(a => ({ url: a.imageUrl as string, title: a.title, durSec: 0 })),
        hasUpNext,
      }));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The one clock. rAF keeps it smooth; the interval keeps it honest when the tab is throttled.
  useEffect(() => {
    const tick = () => {
      if (completedRef.current) return;
      const el = (performance.now() - startRef.current) / 1000;
      if (el >= totalSec) { finish(); return; }
      const p = planRef.current;
      if (dipRef.current) dipRef.current.style.opacity = p ? String(edgeDipAt(p, el)) : '1';
      const a = audioRef.current;
      if (p) {
        const hit = segmentAt(p, el);
        const i = hit ? hit.index : -1;
        if (i !== idxRef.current) { idxRef.current = i; setIdx(i); }
        if (a) {
          const g = fmGainAt(p, el);
          a.volume = mutedRef.current || !Number.isFinite(g) ? 0 : Math.max(0, Math.min(1, g));
          if (g > 0.001 && a.paused && a.src) a.play().catch(() => {});
          else if (g <= 0 && !a.paused) { try { a.pause(); } catch { /* */ } }
        }
      } else if (a && !a.paused) { a.volume = 0; }
    };
    const raf = { id: 0 };
    const loop = () => { tick(); raf.id = requestAnimationFrame(loop); };
    raf.id = requestAnimationFrame(loop);
    const iv = setInterval(tick, 100);
    return () => { cancelAnimationFrame(raf.id); clearInterval(iv); };
  }, [totalSec, finish]);

  // Plajah FM source: set once, jump to the live satellite offset; the clock owns play/pause/volume.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !track?.url) return;
    a.src = track.url;
    a.volume = 0;
    const onMeta = () => {
      const o = seekRef.current;
      const dur = a.duration;
      if (Number.isFinite(o) && o > 1 && (!Number.isFinite(dur) || o < dur - 2)) { try { a.currentTime = o; } catch { /* */ } }
    };
    a.addEventListener('loadedmetadata', onMeta, { once: true });
    a.load();
    return () => { a.removeEventListener('loadedmetadata', onMeta); try { a.pause(); } catch { /* */ } };
  }, [track?.url]);

  // Start the on-air video exactly as its segment begins (the next one is already buffered, paused).
  useEffect(() => {
    if (!plan || idx < 0) return;
    const seg = plan[idx];
    if (!seg || (seg.kind !== 'spot' && seg.kind !== 'ident')) return;
    const v = videoRefs.current[seg.id];
    if (!v) return;
    try { v.currentTime = 0; } catch { /* */ }
    v.muted = muted;
    v.play().catch(() => {
      // Autoplay refused with sound → still play the picture rather than a black hole.
      v.muted = true; v.play().catch(() => {});
    });
  }, [plan, idx, muted]);

  // A spot that fails to load becomes Plajah FM for its slot: the time is still filled, never silent.
  const markFailed = (id: string) => setPlan(p => (p ? p.map(s => (s.id === id ? { ...s, kind: 'fm' } : s)) : p));

  const cover = (track as any)?.albumCover || (track as any)?.coverArt || (track as any)?.artworkUrl || (track as any)?.images?.[0] || '';
  const artist = track?.artist || 'Plajah FM';
  const song = track?.title || '';

  const onLike = async () => { if (!track || liked) return; setLiked(true); try { await likeTrack((track as any).albumId || 'radio_station', track.id); } catch { /* */ } };
  const onAdd = async () => { if (!track || added) return; setAdded(true); try { await addToLibrary(track.id); } catch { /* */ } };

  const active = plan && idx >= 0 ? plan[idx] : null;
  const videoSegs = useMemo(
    () => (plan || []).map((s, i) => ({ s, i })).filter(({ s, i }) => (s.kind === 'spot' || s.kind === 'ident') && s.url && i >= idx && i <= idx + 1),
    [plan, idx],
  );
  const imageAd = active?.kind === 'image' ? ads.find(a => a.imageUrl === active.url) : undefined;
  const showFm = !!active && (active.kind === 'fm' || active.kind === 'upnext' || (active.kind === 'image' && !imageAd));

  return (
    <div className="absolute inset-0 overflow-hidden select-none bg-black">

      <audio ref={audioRef} playsInline preload="auto" />

      {/* Spots + idents: the on-air one and the next one (buffered, paused, hidden). */}
      {videoSegs.map(({ s, i }) => (
        <video
          key={s.id}
          ref={el => { videoRefs.current[s.id] = el; }}
          src={s.url}
          preload="auto"
          playsInline
          muted={muted}
          className="absolute inset-0 w-full h-full object-contain bg-black"
          style={{ visibility: i === idx ? 'visible' : 'hidden', zIndex: s.kind === 'ident' ? 20 : 10 }}
          onError={() => markFailed(s.id)}
        />
      ))}
      {active?.kind === 'spot' && (
        <div className="absolute bottom-0 inset-x-0 h-1.5 z-[11]" style={{ background: `linear-gradient(90deg, ${ORANGE}, ${MAGENTA}, ${PURPLE})` }} />
      )}

      {imageAd && (
        <a href={imageAd.linkUrl || undefined} target="_blank" rel="noopener noreferrer" className="absolute inset-0 block z-10">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 100% at 50% 0%, #14002b 0%, #04030a 70%)' }} />
          <img key={imageAd.id} src={imageAd.imageUrl} className="absolute inset-0 w-full h-full object-contain" alt={imageAd.title} />
          <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur border border-white/10">
            <Radio size={12} style={{ color: accent }} />
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/70">Advertisement</span>
          </div>
          <div className="absolute bottom-6 left-6 right-6">
            <p className="text-lg md:text-2xl font-black uppercase tracking-tight text-white drop-shadow-lg">{imageAd.title}</p>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-1.5" style={{ background: `linear-gradient(90deg, ${ORANGE}, ${MAGENTA}, ${PURPLE})` }} />
        </a>
      )}

      {/* Plajah FM "back shortly" now-playing over full-screen cover art */}
      {showFm && (
        <div className="absolute inset-0 z-10">
          {cover && <img src={thumb(cover, THUMB.small)} decoding="async" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40" alt="" />}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 100% at 50% 0%, rgba(34,0,63,0.6) 0%, rgba(4,3,10,0.85) 70%)' }} />

          <div className="relative h-full flex flex-col md:flex-row items-center justify-center gap-8 px-[6%] py-[5%]">
            {/* cover art */}
            <div className="w-[46vh] max-w-[46%] aspect-square rounded-[2rem] overflow-hidden shrink-0 border border-white/15 shadow-2xl bg-white/5">
              {cover
                ? <img src={thumb(cover, THUMB.large)} onError={onThumbError(cover)} decoding="async" className="w-full h-full object-cover" alt="" />
                : <div className="w-full h-full grid place-items-center" style={{ background: `linear-gradient(135deg, ${PURPLE}, ${MAGENTA})` }}><Radio size={64} className="text-white/70" /></div>}
            </div>

            {/* info */}
            <div className="flex-1 min-w-0 max-w-xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />
                <span className="text-[10px] font-black uppercase tracking-[0.45em] text-white/50">{channelName} — Back shortly</span>
              </div>
              <p className="text-sm md:text-base font-bold text-white/70 leading-relaxed mb-5">
                <span className="text-white font-black">{channelName}</span> programmes will be back shortly. For now, this is <span className="font-black" style={{ color: accent }}>Plajah FM</span> — you're listening to <span className="text-white font-black">{artist}</span>{song ? <> and their song <span className="text-white font-black">"{song}"</span></> : null} on Plajah, until then.
              </p>

              <div className="flex items-center gap-3">
                <button onClick={() => setGift(true)} className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-black hover:opacity-90 transition-opacity" style={{ background: accent }}>
                  <HeartHandshake size={16} /> Gift Artist
                </button>
                <button onClick={onLike} className={`w-12 h-12 rounded-2xl grid place-items-center border transition-colors ${liked ? 'bg-red-500/20 border-red-400/40 text-red-300' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'}`}>
                  <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
                </button>
                <button onClick={onAdd} className={`flex items-center gap-2 px-4 h-12 rounded-2xl border transition-colors text-[10px] font-black uppercase tracking-widest ${added ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'}`}>
                  {added ? <Check size={16} /> : <Plus size={16} />} {added ? 'In Library' : 'Add to Library'}
                </button>
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 inset-x-0 h-1.5" style={{ background: `linear-gradient(90deg, ${ORANGE}, ${MAGENTA}, ${PURPLE})` }} />
        </div>
      )}

      {/* Interactive platform spot: live, votable polls over the break; the results card before a Fan Vote slot. */}
      {pollRoom && (
        <div className="absolute inset-0 z-30 pointer-events-none [&>*]:pointer-events-auto">
          <PollSpot room={pollRoom} mode={announcePollId ? 'announce' : 'vote'} pollId={announcePollId} accent={accent} />
        </div>
      )}

      {/* Coming-up-next card: its own segment, with Plajah FM under it */}
      {active?.kind === 'upnext' && upcoming.length > 0 && (
        <div key={active.id} className="absolute inset-0 z-[15]">
          <ComingUpNextBumper channelName={channelName} logoUrl={logoUrl} items={upcoming} accent={accent} />
        </div>
      )}

      {/* Dip-to-black at every segment edge (and while the break is still being laid out). */}
      <div ref={dipRef} className="absolute inset-0 z-40 bg-black pointer-events-none" style={{ opacity: 1 }} />

      {track && (
        <DonationModal
          isOpen={gift}
          onClose={() => setGift(false)}
          toId={(track as any).artistId || track.id}
          toName={artist}
          albumId={(track as any).albumId}
          albumTitle={song}
        />
      )}
    </div>
  );
};

export default AdBreakBumper;
