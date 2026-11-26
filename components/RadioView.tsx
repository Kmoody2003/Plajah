import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Radio, Play, Pause, SkipForward, Heart, Plus, HeartHandshake, Volume2, Info, Share2, ChevronLeft, Sparkles, Clock, Globe, Bookmark } from 'lucide-react';
import PageHeader from './PageHeader';
import { motion, AnimatePresence } from 'motion/react';
import { Track, UserProfile, Album } from '../types';
import { fetchRadioTracks, likeTrack, addToLibrary, auth, processDonation, fetchUserProfile, fetchRadioSchedule, fetchUserAlbums } from '../services/backendService';
import { canAirTrack } from '../services/rights/trackClearance';
import { activeDaySlots, slotDurationSec } from '../services/fastChannelTimeline';
import { getSatellitePosition, getRecentlyPlayed, buildRotation, tuneInPoint, stationAlbumId, nextInRotation, type RecentlyPlayed } from '../services/radioEngine';
import DonationModal from './DonationModal';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import LiveRadioBrowser from './radio/LiveRadioBrowser';
import { getRadioPresets, toggleRadioPreset, subscribeRadioPresets, isRadioPreset, type RadioPreset } from '../services/radioPresetsService';
import { OnAirHostCard, TodayLineup, useOnAirHost, useHostLine } from './radio/OnAirHost';
import { songFactsFromTrack } from '../services/onair/station';
import { playHostClip, fetchStationLengths } from '../services/onair/client';
import VastAdPlayer from './ads/VastAdPlayer';
import { useNetworkAds } from '../services/ads/useNetworkAds';
import { audioTagFor } from '../services/ads/networkAds';

/** Plajah FM plays at most one network spot per listener in this long (only when tuning in). */
const FM_PREROLL_COOLDOWN_MS = 30 * 60_000;
const FM_PREROLL_KEY = 'plajah.fmPrerollAt';
const prerollDue = () => {
  try { return Date.now() - Number(sessionStorage.getItem(FM_PREROLL_KEY) || 0) > FM_PREROLL_COOLDOWN_MS; } catch { return false; }
};

/** Real song lengths onto a queue (uploads never stored them; the station clock needs them). */
const withLengths = (queue: Track[], lengths: Record<string, number | null>): Track[] =>
  queue.map(t => (typeof lengths[t.id] === 'number' && lengths[t.id]! > 0 ? { ...t, duration: lengths[t.id]! } : t))
    .filter(t => lengths[t.id] !== 0); // an empty file can never play — it would freeze the station

// ── Satellite radio engine ─────────────────────────────────────────────────────
// The continuous 24/7 positioning lives in services/radioEngine.ts now — the SAME reusable engine
// powers the platform-wide Plajah FM station and every individual artist/user station.

function fmtTimeAgo(date: Date): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return 'Just played';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

interface RadioViewProps {
  onBack?: () => void;
  artistId?: string;
  /** Open straight on Plajah FM (from the side pillar's on-air cards) instead of the Live Radio browser. */
  openPlajahFm?: boolean;
}

const RadioView: React.FC<RadioViewProps> = ({ onBack, artistId, openPlajahFm }) => {
  const {
    currentTrack: globalTrack,
    currentAlbum: globalAlbum,
    isPlaying: globalIsPlaying,
    playTrack,
    pause,
    resume,
    audioSource,
    volume,
    setVolume,
  } = useGlobalPlayerState();
  const { seek } = useGlobalPlayerProgress();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [satelliteOffset, setSatelliteOffset] = useState(0);    // seconds into current track
  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentlyPlayed[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [songCount, setSongCount] = useState(0);
  const [exclusiveTracks, setExclusiveTracks] = useState<Track[]>([]);
  const [isInterventionPlaying, setIsInterventionPlaying] = useState<boolean>(false);
  const [artistProfile, setArtistProfile] = useState<UserProfile | null>(null);
  const [artistStations, setArtistStations] = useState<UserProfile[]>([]);
  const [activeStationId, setActiveStationId] = useState<string | null>(artistId || null);
  // Live broadcast radio (real-world stations via the Radio Browser directory)
  // lives alongside Plajah's own artist stations rather than replacing them.
  // Default to the new Live Radio browser unless tuning into a specific artist station.
  const [showLiveRadio, setShowLiveRadio] = useState(!artistId && !openPlajahFm);
  const seekScheduledRef = useRef(false);
  const [presets, setPresets] = useState<RadioPreset[]>(() => getRadioPresets());
  // Plajah FM's virtual host for this hour (station time). Artist stations have no host.
  const onAir = useOnAirHost();
  // Tuned in = the global player is playing THIS station's rotation (Plajah FM and every artist
  // station hand the player an album with a station id). Then the page follows the song actually on
  // air; before you tune in, it follows the station clock (see the satellite tick below).
  const thisStationAlbumId = stationAlbumId(activeStationId);
  const tunedIn = audioSource === 'RADIO' && globalAlbum?.id === thisStationAlbumId && !!globalTrack;
  const onAirTrack = tunedIn ? globalTrack : currentTrack;
  const upNextTrack = tracks.length > 1 ? nextInRotation(tracks, onAirTrack?.id) : null;
  // The host's link into the song on air: back-announce the one before it in the rotation, then this
  // one. Written by the server from the tracks' stored facts (title, artist, real play count).
  const linkBody = useMemo(() => {
    if (activeStationId || !onAirTrack) return null;
    const i = tracks.findIndex(t => t.id === onAirTrack.id);
    const prev = i > 0 ? tracks[i - 1] : tracks.length > 1 ? tracks[tracks.length - 1] : null;
    return { kind: 'between' as const, prev: songFactsFromTrack(prev), next: songFactsFromTrack(onAirTrack) };
  }, [activeStationId, onAirTrack, tracks]);
  const hostLine = useHostLine(onAir.host, linkBody);

  // The host speaks each link once, over the top of the song, with the music ducked under them.
  const spokenRef = useRef<string | null>(null);
  const clipRef = useRef<{ stop: () => void } | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const hearHost = useCallback(() => {
    const url = hostLine?.audioUrl;
    if (!url) return;
    clipRef.current?.stop();
    const before = volumeRef.current;
    clipRef.current = playHostClip(url, { duck: () => setVolume(before * 0.3), restore: () => setVolume(before) });
  }, [hostLine?.audioUrl, setVolume]);
  const radioLive = tunedIn && globalIsPlaying && !activeStationId;
  useEffect(() => {
    const url = hostLine?.audioUrl;
    if (!radioLive || !url || spokenRef.current === url) return;
    spokenRef.current = url;
    hearHost();
  }, [radioLive, hostLine?.audioUrl, hearHost]);
  useEffect(() => () => clipRef.current?.stop(), []);

  useEffect(() => {
    return subscribeRadioPresets(updated => setPresets(updated));
  }, []);

  useEffect(() => {
    if (artistId) {
      setActiveStationId(artistId);
      setShowLiveRadio(false);
    }
  }, [artistId]);

  useEffect(() => {
    const loadRadioContent = async () => {
      setLoading(true);
      try {
        if (activeStationId) {
          const profile = await fetchUserProfile(activeStationId);
          setArtistProfile(profile);
          
          const allTracks = await fetchRadioTracks();
          
          // Filter: Artist tracks first, then mix with otherCreators
          const artistTracks = allTracks.filter(t => t.artistId === activeStationId);
          
          // Add other creators' tracks if configured
          const otherCreatorIds = profile.radioSettings?.otherCreators || [];
          const collaboratorsTracks = allTracks.filter(t => otherCreatorIds.includes(t.artistId || ''));
          
          const exclusiveIds = profile.radioSettings?.exclusiveContentIds || [];
          const exclusive = allTracks.filter(t => exclusiveIds.includes(t.id));
          setExclusiveTracks(exclusive);
          
          const poolTracks = allTracks.filter(t => t.artistId !== activeStationId && !otherCreatorIds.includes(t.artistId || ''));

          // "Own music only" — a personal station that plays strictly this artist's catalogue (no
          // collaborators, no global pool). Same Plajah FM engine, filtered source.
          const ownMusicOnly = !!profile.radioSettings?.ownMusicOnly;
          const mixed = ownMusicOnly
            ? [...artistTracks]
            : [...artistTracks, ...collaboratorsTracks, ...poolTracks.sort(() => Math.random() - 0.5)];

          // If the station has a Program Schedule (built in the radio scheduler), the SCHEDULE drives
          // the queue — the existing Plajah FM engine plays the authored line-up (in order, with the
          // day's per-weekday override) instead of the shuffle, and satellite positioning tunes you in
          // at the right wall-clock spot. Ads/live slots are skipped in the music rotation. Falls back
          // to the shuffle when there's no schedule.
          const schedule = await fetchRadioSchedule(activeStationId).catch(() => null);
          let queue = mixed;
          if (schedule) {
            const byId = new Map(mixed.map(t => [t.id, t]));
            // A saved slot keeps its own URL, so a song held after it was scheduled must be skipped here.
            const stationAlbums = await fetchUserAlbums(activeStationId).catch(() => []);
            const heldIds = new Set(stationAlbums.flatMap(a => (a.tracks || []).filter(t => !canAirTrack(t)).map(t => t.id)));
            const scheduled: Track[] = [];
            for (const s of activeDaySlots(schedule, Date.now())) {
              if (s.type === 'AD_BREAK' || s.type === 'LIVE_INTERRUPT') continue;
              if (s.videoId && heldIds.has(s.videoId)) continue;
              const real = s.videoId ? byId.get(s.videoId) : undefined;
              if (real) { scheduled.push(real); continue; }
              const url = s.type === 'BUMPER' ? s.bumperUrl : s.videoUrl;
              if (!url) continue;
              scheduled.push({
                id: s.videoId || s.bumperId || s.id,
                title: s.type === 'BUMPER' ? (s.bumperTitle || 'Station ID') : (s.videoTitle || 'Track'),
                artist: profile.displayName || 'Radio',
                artistId: activeStationId,
                url,
                duration: slotDurationSec(s),
                albumCover: s.videoThumbnail,
                isRadioEligible: true,
              } as Track);
            }
            if (scheduled.length) queue = scheduled;
          }
          queue = withLengths(queue, (await fetchStationLengths(queue)).durations);
          setTracks(queue);

          // Satellite mode: join mid-song based on wall-clock position
          const pos = getSatellitePosition(queue);
          setCurrentTrack(queue[pos.trackIndex] ?? null);
          setSatelliteOffset(pos.offsetSeconds);
          setRecentlyPlayed(getRecentlyPlayed(queue));
        } else {
          // Plajah FM: today's rotation (shuffled once a day, the same for every listener, albums
          // spread out), timed with each song's REAL length so the clock matches what's playing.
          const allTracks = await fetchRadioTracks();
          const { durations, pending } = await fetchStationLengths(allTracks);
          const rotation = buildRotation(allTracks, durations);
          setTracks(rotation);
          const pos = getSatellitePosition(rotation);
          setCurrentTrack(rotation[pos.trackIndex] ?? null);
          setSatelliteOffset(pos.offsetSeconds);
          setRecentlyPlayed(getRecentlyPlayed(rotation));
          setArtistProfile(null);
          setExclusiveTracks([]);
          // A cold server is still reading some files: pick up the rest shortly (same order, better clock).
          if (pending > 0) {
            setTimeout(async () => {
              const again = await fetchStationLengths(allTracks);
              if (!stale) setTracks(buildRotation(allTracks, again.durations));
            }, 8000);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const loadDirectory = async () => {
      try {
        // In a real scenario, this would be a dedicated endpoint
        const tracks = await fetchRadioTracks();
        const artistIds = Array.from(new Set(tracks.map(t => t.artistId).filter(Boolean)));
        const profiles = await Promise.all(artistIds.map(id => fetchUserProfile(id!)));
        setArtistStations(profiles.filter(p => p.radioSettings?.enabled));
      } catch (err) {
        console.error(err);
      }
    };

    let stale = false;
    loadRadioContent();
    loadDirectory();
    return () => { stale = true; };
  }, [activeStationId]);

  // The station clock keeps running before you tune in: the page shows what's on air right now and
  // moves to the next song when it changes, like a radio dial.
  useEffect(() => {
    if (tunedIn || !tracks.length) return;
    const tick = () => {
      const pos = getSatellitePosition(tracks);
      const t = tracks[pos.trackIndex] ?? null;
      setCurrentTrack(prev => (prev?.id === t?.id ? prev : t));
      setSatelliteOffset(pos.offsetSeconds);
      setRecentlyPlayed(getRecentlyPlayed(tracks));
    };
    tick();
    const iv = setInterval(tick, 5000);
    return () => clearInterval(iv);
  }, [tunedIn, tracks]);

  // Tuned in: what really played on this station goes into "Recently played" as each song hands off.
  const lastOnAirRef = useRef<Track | null>(null);
  useEffect(() => {
    const prev = lastOnAirRef.current;
    lastOnAirRef.current = tunedIn ? globalTrack : null;
    if (!tunedIn || !globalTrack || !prev || prev.id === globalTrack.id) return;
    setRecentlyPlayed(list => [{ track: prev, playedAt: new Date() }, ...list.filter(r => r.track.id !== prev.id)].slice(0, 8));
  }, [tunedIn, globalTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A radio has no "resume where I left off": after a short pause you're back on the live broadcast.
  const pausedAtRef = useRef<number | null>(null);
  useEffect(() => { if (tunedIn && !globalIsPlaying) pausedAtRef.current ??= Date.now(); else if (globalIsPlaying) pausedAtRef.current = null; }, [tunedIn, globalIsPlaying]);

  const tuneIn = () => {
    if (!tracks.length) return;
    // Join the broadcast where it is RIGHT NOW (computed at the moment you press play, never a stale
    // offset), except in a song's last seconds — then the next song from the top.
    const pos = tuneInPoint(tracks);
    const track = tracks[pos.trackIndex];
    if (!track) return;
    const radioAlbum: Album = {
      id: thisStationAlbumId,
      title: artistProfile?.radioSettings?.stationName || (activeStationId ? `${artistProfile?.displayName}'s Radio` : 'Plajah FM'),
      artist: artistProfile?.displayName || 'Plajah FM',
      coverImage: track.albumCover || 'https://images.unsplash.com/photo-1548502669-e09bd2363ee0?auto=format&fit=crop&q=80',
      tracks,
      description: activeStationId ? `Personalized broadcast for ${artistProfile?.displayName}` : 'Plajah FM — live site-wide broadcast',
      themeColor: activeStationId ? '#00DAF3' : '#ff8c00',
      createdAt: Date.now(),
    };
    setCurrentTrack(track);
    setSatelliteOffset(pos.offsetSeconds);
    playTrack(track, radioAlbum, 'RADIO', pos.offsetSeconds > 1 ? pos.offsetSeconds : undefined, true);
  };

  // Network ads: Plajah FM (not artists' own stations) may open with one sponsor spot as you tune in,
  // at most once per half hour, never for a restricted viewer. Then the live broadcast, joined where
  // it is at that moment, so the spot never puts you behind the station clock.
  const netAds = useNetworkAds();
  const [prerollTag, setPrerollTag] = useState<string | null>(null);
  const startListening = () => {
    const tag = netAds?.allowed && !activeStationId ? audioTagFor(netAds.config) : null;
    if (tag && tracks.length && prerollDue()) {
      try { sessionStorage.setItem(FM_PREROLL_KEY, String(Date.now())); } catch { /* */ }
      setPrerollTag(tag);
      return;
    }
    tuneIn();
  };

  const handlePlayPause = () => {
    if (prerollTag) return;
    if (tunedIn) {
      if (globalIsPlaying) { pause(); return; }
      // Paused for more than a minute → rejoin live, like turning a radio back on.
      if (pausedAtRef.current && Date.now() - pausedAtRef.current > 60_000) { pausedAtRef.current = null; tuneIn(); return; }
      resume();
      return;
    }
    startListening();
  };

  const handleLike = async () => {
    if (onAirTrack) {
      try {
        await likeTrack(onAirTrack.albumId || 'radio_station', onAirTrack.id);
        alert('Added to your likes!');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleAddToLibrary = async () => {
    if (onAirTrack) {
      try {
        await addToLibrary(onAirTrack.id);
        alert('Track added to your library!');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const currentStationId = activeStationId ? `artist-${activeStationId}` : 'plajah-fm';
  const isCurrentStationPreset = presets.some(p => p.id === currentStationId);

  const handleToggleCurrentStationPreset = async () => {
    const stationId = currentStationId;
    const stationName = artistProfile?.radioSettings?.stationName || (activeStationId ? `${artistProfile?.displayName} Radio` : 'Plajah FM');
    const stationDetail = activeStationId ? 'Personalized artist broadcast' : 'Global Stream';
    const stationImg = artistProfile?.photoURL || currentTrack?.albumCover || undefined;

    await toggleRadioPreset({
      id: stationId,
      name: stationName,
      detail: stationDetail,
      image: stationImg,
      origin: 'On Plajah',
      artistId: activeStationId || undefined,
    });
  };

  // Live broadcast radio takes the whole surface when selected — it has its own
  // shelf rail, and it plays through the same global transport as Plajah FM.
  if (showLiveRadio) {
    return <LiveRadioBrowser onBack={onBack} onExit={() => setShowLiveRadio(false)} />;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-theme text-white">
        <div className="relative">
          <div className="w-24 h-24 border-2 border-[#00DAF3]/20 rounded-full animate-ping absolute inset-0" />
          <div className="w-24 h-24 border-4 border-small-orange border-t-transparent rounded-full animate-spin relative z-10" />
        </div>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.5em] animate-pulse">Tuning Frequency...</p>
      </div>
    );
  }


  return (
    <div className="h-full bg-transparent text-white overflow-hidden flex flex-col lg:flex-row">
      {prerollTag && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.35em] text-white/60">Plajah FM starts right after this</p>
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black">
              <VastAdPlayer
                tagUrl={prerollTag}
                placement="fm_tunein"
                maxSec={30}
                onDone={() => { setPrerollTag(null); tuneIn(); }}
              />
            </div>
          </div>
        </div>
      )}
      {/* Station Directory Sidebar */}
      <aside className="w-full lg:w-80 border-r border-white/5 bg-theme-card/30 flex flex-col h-1/3 lg:h-full">
        <div className="p-6 border-b border-white/5">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-4">Radio Directory</h3>
          <button 
            onClick={() => setActiveStationId(null)}
            className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${!activeStationId ? 'bg-small-orange text-black' : 'hover:bg-white/5'}`}
          >
            <div className={`p-2 rounded-xl ${!activeStationId ? 'bg-theme-card/30' : 'bg-small-orange/20'}`}>
              <Radio size={18} />
            </div>
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-tight">Plajah FM</p>
              <p className={`text-[8px] font-bold uppercase tracking-widest ${!activeStationId ? 'text-black/60' : 'text-white/40'}`}>{onAir.host ? `Live · ${onAir.host.stageName}` : 'Global Stream'}</p>
            </div>
          </button>

          {!activeStationId && (
            <div className="hidden lg:block mt-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2 px-1">Today on Plajah FM</h4>
              <TodayLineup compact />
            </div>
          )}

          {/* Real-world broadcast radio, alongside Plajah's own stations. */}
          <button
            onClick={() => setShowLiveRadio(true)}
            className="w-full mt-2 p-4 rounded-2xl flex items-center gap-4 transition-all hover:bg-white/5"
          >
            <div className="p-2 rounded-xl bg-[#00DAF3]/20">
              <Globe size={18} className="text-[#00DAF3]" />
            </div>
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-tight">Live Radio</p>
              <p className="text-[8px] font-bold uppercase tracking-widest text-white/40">Broadcast Worldwide</p>
            </div>
          </button>

          {/* User Radio Presets */}
          {presets.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FF8C00] flex items-center gap-1">
                  <Bookmark size={10} className="fill-current" /> Presets
                </span>
                <span className="text-[9px] font-mono text-white/30">{presets.length}</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {presets.map(p => {
                  const isCur = (p.id === 'plajah-fm' && !activeStationId) || (p.artistId && activeStationId === p.artistId);
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (p.id === 'plajah-fm') {
                          setActiveStationId(null);
                          setShowLiveRadio(false);
                        } else if (p.artistId) {
                          setActiveStationId(p.artistId);
                          setShowLiveRadio(false);
                        } else {
                          setShowLiveRadio(true);
                        }
                      }}
                      className={`w-full p-2 rounded-xl flex items-center gap-2.5 transition-all text-left ${
                        isCur ? 'bg-[#FF8C00]/20 border border-[#FF8C00]/40 text-[#FF8C00]' : 'hover:bg-white/5 text-white/80'
                      }`}
                    >
                      {p.image ? (
                        <img src={p.image} alt="" className="w-6 h-6 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                          <Radio size={12} className="text-[#FF8C00]" />
                        </div>
                      )}
                      <div className="truncate flex-1 min-w-0">
                        <p className="text-[11px] font-bold truncate leading-tight">{p.name}</p>
                        <p className="text-[8px] opacity-40 uppercase truncate tracking-wider">{p.origin}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {artistStations.map(station => (
            <button 
              key={station.uid}
              onClick={() => setActiveStationId(station.uid)}
              className={`w-full p-3 rounded-2xl flex items-center gap-4 transition-all ${activeStationId === station.uid ? 'bg-[#00DAF3] text-black' : 'hover:bg-white/5'}`}
            >
              <img src={station.photoURL || null} className="w-10 h-10 rounded-xl object-cover shrink-0" />
              <div className="text-left truncate">
                <p className="text-[11px] font-black uppercase tracking-tight truncate">{station.radioSettings?.stationName || `${station.displayName} Radio`}</p>
                <p className={`text-[8px] font-bold uppercase tracking-widest truncate ${activeStationId === station.uid ? 'text-black/60' : 'text-white/40'}`}>Artist Station</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Player */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Radio Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-theme-card/40 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-4">
            {onBack && (
              <button onClick={onBack} className="lg:hidden p-3 bg-white/5 rounded-2xl mr-2">
                <ChevronLeft size={20} />
              </button>
            )}
            <div className={`p-3 rounded-2xl ${activeStationId ? 'bg-[#00DAF3]/20 shadow-[0_0_20px_rgba(0,218,243,0.3)]' : 'bg-small-orange/20 shadow-[0_0_20px_rgba(255,140,0,0.3)]'}`}>
              <Radio className={activeStationId ? 'text-[#00DAF3]' : 'text-small-orange'} size={24} />
            </div>
            <div>
              <PageHeader>
                {artistProfile?.radioSettings?.stationName || (activeStationId ? `${artistProfile?.displayName} Radio` : 'Plajah FM')}
              </PageHeader>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-4">
                {activeStationId ? `Personalized artist broadcast` : 'Live Site-Wide Broadcast'}
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <div className={`px-4 py-2 rounded-full flex items-center gap-2 transition-all ${activeStationId ? 'bg-[#00DAF3]/10 border-[#00DAF3]/20 text-[#00DAF3]' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${activeStationId ? 'bg-[#00DAF3]' : 'bg-red-500'}`} />
              <span className="text-[10px] font-black uppercase tracking-widest">On Air</span>
            </div>
            <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
              {tracks.length} Rotation
            </div>
          </div>
        </div>

        {/* Player Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 relative overflow-y-auto">
          <div className={`absolute inset-0 bg-gradient-to-b ${activeStationId ? 'from-[#00DAF3]/5' : 'from-small-orange/5'} to-transparent pointer-events-none`} />
          
          {!activeStationId && <OnAirHostCard host={onAir.host} next={onAir.next} line={hostLine} onHear={hearHost} live={radioLive} />}

          <AnimatePresence mode="wait">
            {onAirTrack && (
              <motion.div 
                key={onAirTrack.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="flex flex-col items-center text-center max-w-2xl w-full"
              >
                <div className="relative group mb-8 lg:mb-12">
                  <div className={`absolute -inset-4 rounded-[3rem] blur-2xl opacity-0 group-hover:opacity-100 transition-all duration-700 ${activeStationId ? 'bg-[#00DAF3]/20' : 'bg-small-orange/20'}`} />
                    <div className="w-48 h-48 sm:w-64 sm:h-64 lg:w-80 lg:h-80 rounded-[3rem] overflow-hidden border-4 border-white/10 shadow-3xl relative">
                    <img 
                      src={onAirTrack.albumCover || onAirTrack.images?.[0] || 'https://picsum.photos/seed/radio/800/800'} 
                      alt={onAirTrack.title}
                      className="w-full h-full object-cover"
                    />
                    {globalIsPlaying && tunedIn && (
                      <div className="absolute inset-0 bg-theme-card/60 flex items-center justify-center backdrop-blur-sm">
                        <div className="flex gap-1 items-end h-12">
                          {[1,2,3,4,5].map(i => (
                            <motion.div 
                              key={i}
                              animate={{ height: [10, 40, 20, 40, 10] }}
                              transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                              className={`w-1.5 rounded-full ${activeStationId ? 'bg-[#00DAF3]' : 'bg-small-orange'}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="text-3xl sm:text-4xl lg:text-6xl font-black uppercase tracking-tightest mb-4 leading-none break-words w-full">
                  {onAirTrack.title}
                </h3>
                <p className={`text-lg sm:text-xl font-bold uppercase tracking-widest mb-8 lg:mb-12 ${activeStationId ? 'text-[#00DAF3]' : 'text-small-orange'}`}>
                  {onAirTrack.artist}
                </p>

                <div className="flex items-center gap-6 lg:gap-8">
                  <button 
                    onClick={handleLike}
                    className="p-5 sm:p-6 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 hover:scale-110 active:scale-95 transition-all text-white/40 hover:text-red-500"
                  >
                    <Heart size={24} />
                  </button>
                  
                  <button 
                    onClick={handlePlayPause}
                    className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl ${activeStationId ? 'bg-[#00DAF3] text-black' : 'bg-white text-black'}`}
                  >
                    {globalIsPlaying && tunedIn ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-2" />}
                  </button>

                  <button 
                    onClick={handleAddToLibrary}
                    className="p-5 sm:p-6 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 hover:scale-110 active:scale-95 transition-all text-white/40 hover:text-small-orange"
                    title="Add to library"
                  >
                    <Plus size={24} />
                  </button>

                  <button 
                    onClick={handleToggleCurrentStationPreset}
                    className={`p-5 sm:p-6 border rounded-full hover:scale-110 active:scale-95 transition-all ${
                      isCurrentStationPreset 
                        ? 'bg-small-orange/20 border-small-orange text-small-orange' 
                        : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                    }`}
                    title={isCurrentStationPreset ? 'Remove from radio presets' : 'Add station to radio presets'}
                  >
                    <Bookmark size={24} fill={isCurrentStationPreset ? 'currentColor' : 'none'} />
                  </button>
                </div>

                <p className="mt-6 text-[10px] font-bold uppercase tracking-widest text-white/35">
                  {tunedIn ? (globalIsPlaying ? 'Live — you are tuned in' : 'Paused — press play to rejoin live') : 'On air now — press play to tune in'}
                </p>
                {upNextTrack && upNextTrack.id !== onAirTrack.id && (
                  <div className="mt-4 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-white/10 max-w-md w-full text-left">
                    {upNextTrack.albumCover
                      ? <img src={upNextTrack.albumCover} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      : <div className="w-10 h-10 rounded-lg bg-white/5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Up next</p>
                      <p className="text-xs font-bold truncate">{upNextTrack.title}</p>
                      <p className="text-[10px] text-white/40 truncate">{upNextTrack.artist}</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Recently Played — last 15 minutes */}
        {recentlyPlayed.length > 0 && (
          <div className="px-8 py-3 border-t border-white/5 bg-black/20">
            <button
              onClick={() => setShowRecent(v => !v)}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors"
            >
              <Clock size={11} /> Recently played (15 min) {showRecent ? '▲' : '▼'}
            </button>
            <AnimatePresence>
              {showRecent && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex gap-4 pt-3 overflow-x-auto pb-1">
                    {recentlyPlayed.map(({ track, playedAt }) => (
                      <div key={`${track.id}-${playedAt.getTime()}`} className="flex items-center gap-2 shrink-0 group">
                        {track.albumCover
                          ? <img src={track.albumCover} alt="" className="w-8 h-8 rounded-lg object-cover opacity-60 group-hover:opacity-100 transition-opacity"/>
                          : <div className="w-8 h-8 rounded-lg bg-white/5"/>
                        }
                        <div>
                          <div className="text-xs text-white/60 truncate max-w-[120px]">{track.title}</div>
                          <div className="text-[9px] text-white/25">{fmtTimeAgo(playedAt)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Radio Footer / Interaction Bar */}
        <div className="p-8 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
              {activeStationId ? 'Artist station' : onAir.host ? `${onAir.host.show?.name} with ${onAir.host.stageName} (AI host)` : 'Plajah FM — music around the clock'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDonationModalOpen(true)}
              className="px-8 py-4 bg-small-orange text-black rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl"
            >
              <HeartHandshake size={18} /> Gifts & tips
            </button>
            <button className="p-4 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all">
              <Share2 size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Exclusive Content Sidebar (Right) */}
      {exclusiveTracks.length > 0 && (
        <aside className="hidden xl:flex w-80 border-l border-white/5 bg-theme-card/40 flex-col overflow-hidden">
          <div className="p-8 border-b border-white/5">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-400 mb-2 flex items-center gap-2">
              <Sparkles size={14} /> Exclusive Archive
            </h3>
            <p className="text-[8px] font-bold text-white/20 uppercase tracking-[0.2em]">Interviews & Exclusive Segments</p>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {exclusiveTracks.map(track => (
              <button 
                key={track.id}
                onClick={() => {
                   const radioAlbum: Album = {
                    id: `exclusive_${track.id}`,
                    title: 'Exclusive Segment',
                    artist: artistProfile?.displayName || 'Archive',
                    coverImage: track.albumCover || 'https://picsum.photos/seed/exclusive/800/800',
                    tracks: [track],
                    description: 'Exclusive station content',
                    themeColor: '#A855F7',
                    createdAt: Date.now()
                  };
                  playTrack(track, radioAlbum, 'RADIO');
                }}
                className="w-full p-4 rounded-[1.5rem] bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-left flex items-center gap-4 group"
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 grayscale group-hover:grayscale-0 transition-all">
                  <img src={track.albumCover || 'https://picsum.photos/seed/exclusive/300/300'} className="w-full h-full object-cover" />
                </div>
                <div className="truncate">
                  <p className="text-[10px] font-black uppercase tracking-tight truncate group-hover:text-purple-400 transition-colors">{track.title}</p>
                  <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{track.artist}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>
      )}

      {onAirTrack && onAirTrack.artistId && (
        <DonationModal 
          isOpen={isDonationModalOpen}
          onClose={() => setIsDonationModalOpen(false)}
          toId={onAirTrack.artistId}
          toName={onAirTrack.artist}
        />
      )}
    </div>
  );
};

export default RadioView;
