import React, { useEffect, useRef, useState } from 'react';
import { Heart, Plus, HeartHandshake, Radio, Check } from 'lucide-react';
import { Track, AdConfig } from '../../types';
import { fetchRadioTracks, likeTrack, addToLibrary, fetchAdConfigs, auth } from '../../services/backendService';
import { getSatellitePosition } from '../../services/radioEngine';
import ComingUpNextBumper, { type UpNextItem } from './ComingUpNextBumper';
import DonationModal from '../DonationModal';

/**
 * AdBreakBumper — the default "we'll be back shortly" filler for a FAST/TV ad break that has no user
 * ad. It fills the whole break (length set by the account's ad settings) like this:
 *   • Plajah FM (the global station) fades IN over 4s and plays under the card; the current song's
 *     cover art fills the screen with a mini now-playing panel + gift / like / add-to-library buttons.
 *   • For the first ~6s a "Coming Up Next" card is overlaid (the channel's next 3 programmes).
 *   • After 30s of cover art the break cycles the platform ad rail (same source as the left ad pillar)
 *     reworked for 16:9, until the break ends — Plajah FM fades OUT over the last 4s.
 */

const ORANGE = '#FF8C00';
const PURPLE = '#6B0099';
const MAGENTA = '#D40055';
const COVER_ART_SEC = 30;
const FADE_SEC = 4;
const UPNEXT_SEC = 6;

interface Props {
  channelName: string;
  durationSec: number;
  upcoming?: UpNextItem[];
  logoUrl?: string;
  accent?: string;
  /** Mirror the player's mute — when true, Plajah FM fills silently (visuals only). */
  muted?: boolean;
}

const AdBreakBumper: React.FC<Props> = ({ channelName, durationSec, upcoming = [], logoUrl, accent = ORANGE, muted = false }) => {
  const [track, setTrack] = useState<Track | null>(null);
  const [ads, setAds] = useState<AdConfig[]>([]);
  const [adIdx, setAdIdx] = useState(0);
  const [phase, setPhase] = useState<'fm' | 'ads'>('fm');
  const [showUpNext, setShowUpNext] = useState(upcoming.length > 0);
  const [gift, setGift] = useState(false);
  const [liked, setLiked] = useState(false);
  const [added, setAdded] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const seekRef = useRef(0);
  const startRef = useRef(Date.now());
  const switchedRef = useRef(false);

  // Load the Plajah FM current song (satellite position) + the ad-rail source.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [tracks, adConfigs] = await Promise.all([
        fetchRadioTracks().catch(() => [] as Track[]),
        fetchAdConfigs().catch(() => [] as AdConfig[]),
      ]);
      if (!alive) return;
      if (tracks.length) {
        const pos = getSatellitePosition(tracks);
        seekRef.current = pos.offsetSeconds;
        setTrack(tracks[pos.trackIndex] || tracks[0]);
      }
      // Same source as the left ad pillar, repurposed for the 16:9 TV break.
      setAds(adConfigs.filter(a => a.isActive && a.imageUrl));
    })();
    return () => { alive = false; };
  }, []);

  // Coming-up-next overlay for the first few seconds.
  useEffect(() => {
    if (!upcoming.length) return;
    const t = setTimeout(() => setShowUpNext(false), UPNEXT_SEC * 1000);
    return () => clearTimeout(t);
  }, [upcoming.length]);

  // Audio: play Plajah FM, seek to the live satellite offset, fade in over 4s + out over the last 4s,
  // and flip to the ad-cycle phase at 30s.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !track?.url) return;
    a.src = track.url;
    a.volume = 0;
    a.play().catch(() => {});
    const onMeta = () => { const o = seekRef.current; if (o > 1 && o < (a.duration || 1e9) - 2) { try { a.currentTime = o; } catch { /* */ } } };
    a.addEventListener('loadedmetadata', onMeta, { once: true });

    let raf = 0;
    const tick = () => {
      const el = (Date.now() - startRef.current) / 1000;
      const remaining = durationSec - el;
      let v = 1;
      if (el < FADE_SEC) v = el / FADE_SEC;
      else if (remaining < FADE_SEC) v = Math.max(0, remaining / FADE_SEC);
      a.volume = muted ? 0 : Math.max(0, Math.min(1, v));
      if (el >= COVER_ART_SEC && !switchedRef.current && ads.length > 0) { switchedRef.current = true; setPhase('ads'); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); a.removeEventListener('loadedmetadata', onMeta); try { a.pause(); } catch { /* */ } };
  }, [track?.url, durationSec, ads.length, muted]);

  // Cycle the ad rail once we're in the ads phase.
  useEffect(() => {
    if (phase !== 'ads' || ads.length === 0) return;
    const t = setInterval(() => setAdIdx(i => (i + 1) % ads.length), 7000);
    return () => clearInterval(t);
  }, [phase, ads.length]);

  const cover = (track as any)?.albumCover || (track as any)?.coverArt || (track as any)?.artworkUrl || (track as any)?.images?.[0] || '';
  const artist = track?.artist || 'Plajah FM';
  const song = track?.title || '';

  const onLike = async () => { if (!track || liked) return; setLiked(true); try { await likeTrack((track as any).albumId || 'radio_station', track.id); } catch { /* */ } };
  const onAdd = async () => { if (!track || added) return; setAdded(true); try { await addToLibrary(track.id); } catch { /* */ } };

  const currentAd = ads[adIdx];

  return (
    <div className="absolute inset-0 overflow-hidden select-none bg-black">
      <audio ref={audioRef} playsInline />

      {phase === 'ads' && currentAd ? (
        // ── Ad rail, reworked for 16:9 ──
        <a href={currentAd.linkUrl || undefined} target="_blank" rel="noopener noreferrer" className="absolute inset-0 block">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 100% at 50% 0%, #14002b 0%, #04030a 70%)' }} />
          <img key={currentAd.id} src={currentAd.imageUrl} className="absolute inset-0 w-full h-full object-contain" alt={currentAd.title} />
          <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur border border-white/10">
            <Radio size={12} style={{ color: accent }} />
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/70">Advertisement</span>
          </div>
          <div className="absolute bottom-6 left-6 right-6">
            <p className="text-lg md:text-2xl font-black uppercase tracking-tight text-white drop-shadow-lg">{currentAd.title}</p>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-1.5" style={{ background: `linear-gradient(90deg, ${ORANGE}, ${MAGENTA}, ${PURPLE})` }} />
        </a>
      ) : (
        // ── Plajah FM "back shortly" now-playing over full-screen cover art ──
        <>
          {cover && <img src={cover} className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40" alt="" />}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 100% at 50% 0%, rgba(34,0,63,0.6) 0%, rgba(4,3,10,0.85) 70%)' }} />

          <div className="relative h-full flex flex-col md:flex-row items-center justify-center gap-8 px-[6%] py-[5%]">
            {/* cover art */}
            <div className="w-[46vh] max-w-[46%] aspect-square rounded-[2rem] overflow-hidden shrink-0 border border-white/15 shadow-2xl bg-white/5">
              {cover
                ? <img src={cover} className="w-full h-full object-cover" alt="" />
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
        </>
      )}

      {/* Coming-up-next overlay for the first few seconds of the break */}
      {showUpNext && upcoming.length > 0 && (
        <div className="absolute inset-0 animate-in fade-in duration-500">
          <ComingUpNextBumper channelName={channelName} logoUrl={logoUrl} items={upcoming} accent={accent} />
        </div>
      )}

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
