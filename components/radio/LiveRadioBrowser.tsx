/**
 * LiveRadioBrowser — real, live broadcast radio (TuneIn-style) inside Plajah.
 *
 * Stations come from the Radio Browser API (free, no key). Playback deliberately
 * goes through the platform's shared transport (`GlobalPlayerContext.playTrack`
 * with the existing `RADIO` audio source) rather than a private <audio> element,
 * so a station behaves like everything else on the platform: one transport, one
 * volume, one now-playing, no two things playing at once.
 *
 * Three real failure modes are handled explicitly instead of being papered over:
 *   1. MIXED CONTENT — ~2/3 of the database is http:// only. On an https page the
 *      browser hard-blocks those before any bytes move. We detect them, sort them
 *      last, badge them, and offer a filter to hide them entirely.
 *   2. HLS — some stations (most of the BBC network) are .m3u8. These play fine
 *      wherever the browser has native HLS (Safari/iOS), and NOT in Chrome or
 *      Firefox today. We detect that and disable them with a stated reason
 *      rather than shipping a play button that dead-ends. See `SUPPORTS_NATIVE_HLS`
 *      and the note there for the one change that would light them up everywhere.
 *   3. OFFLINE / DEAD — a station that passed the API's last health check can
 *      still be down right now. We watch the element and surface a clear error
 *      rather than leaving the user staring at a spinner over silence.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Radio, Search, Play, Pause, Globe, ShieldAlert, AlertTriangle,
  Loader2, RefreshCw, Signal, ChevronLeft, X,
} from 'lucide-react';
import { Track, Album } from '../../types';
import { useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';
import {
  RadioStation, RadioCountry, searchStations, searchByName, fetchTrending,
  fetchTopVoted, fetchCountries, reportStationClick, clearRadioCache,
} from '../../services/radioBrowser';
import { RADIO_SHELVES, SHELF_GROUPS, RadioShelf, getShelf } from '../../data/radioShelves';

type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
type PlayState = 'connecting' | 'playing' | 'error';

interface LiveRadioBrowserProps {
  onBack?: () => void;
  /** Returns to Plajah's own artist-station radio. */
  onExit?: () => void;
}

/** A live stream has no duration and no album — model it as a single-track album. */
const stationToTrack = (s: RadioStation): Track => ({
  id: `radio:${s.uuid}`,
  title: s.name,
  artist: [s.country, s.language].filter(Boolean).join(' · ') || 'Live Radio',
  url: s.url,
  albumCover: s.favicon || undefined,
  images: s.favicon ? [s.favicon] : undefined,
  genre: s.tags[0],
  tags: s.tags,
});

const stationToAlbum = (s: RadioStation, track: Track): Album => ({
  id: `radio_live_${s.uuid}`,
  title: s.name,
  artist: s.country || 'Live Broadcast',
  coverImage: s.favicon || '',
  tracks: [track],
  description: s.tags.slice(0, 4).join(', ') || 'Live broadcast radio',
  themeColor: '#00DAF3',
  createdAt: Date.now(),
});

/**
 * Can this browser play an .m3u8 handed straight to an <audio> element?
 *
 * Safari/iOS: yes, natively — HLS stations work through the shared transport
 * with no special handling. Chrome/Firefox: no.
 *
 * WHY WE DON'T JUST USE hls.js HERE (this was built, tested against the live
 * app, and removed): the platform's shared player owns the audio element and
 * runs aggressive error recovery on it — on a media error it sets
 * `audio.src = ""` and swaps in a whole new element. Attaching hls.js from the
 * outside means handing it an element that is concurrently being cleared and
 * replaced underneath us. Verified live: the BBC HLS stream ended up as
 * `MEDIA_ELEMENT_ERROR: Empty src attribute`, and the recovery path then also
 * clobbered the *next* station played. Fighting that from a component produces
 * a flaky player, not a working one.
 *
 * The right fix is one branch inside GlobalPlayerContext's existing hls.js
 * support: when `track.url` ends in `.m3u8`, take the HLS path it already has
 * for Plajah's transcoded streams. That file is owned elsewhere, so it is
 * reported rather than edited — and until then these stations are disabled
 * honestly instead of failing silently.
 */
const SUPPORTS_NATIVE_HLS: boolean = (() => {
  try {
    // `canPlayType` ALONE IS NOT A VALID TEST HERE. Chromium answers "maybe" for
    // both HLS mime types and then fails to play a single segment — measured in
    // this very app: Chrome reported "maybe" for application/vnd.apple.mpegurl
    // while the BBC stream died with DEMUXER_ERROR_COULD_NOT_PARSE. Trusting it
    // hands users a play button that cannot work.
    //
    // Real native HLS means WebKit-that-isn't-Chromium (Safari) or iOS — where
    // every browser is WebKit under the hood.
    const ua = navigator.userAgent || '';
    const isChromium = /Chrome|Chromium|Edg\/|OPR\//.test(ua);
    const isWebKit = /AppleWebKit/.test(ua);
    const isIOS = /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!((isWebKit && !isChromium) || isIOS)) return false;
    return !!document.createElement('audio').canPlayType('application/vnd.apple.mpegurl');
  } catch {
    return false;
  }
})();

type Blocker = null | 'mixed-content' | 'hls-unsupported';

/** Why (if at all) this station can't be played in this browser, on this page. */
function blockerFor(s: RadioStation): Blocker {
  if (s.blockedMixedContent) return 'mixed-content';
  if (s.isHls && !SUPPORTS_NATIVE_HLS) return 'hls-unsupported';
  return null;
}

const BLOCKER_COPY: Record<Exclude<Blocker, null>, { badge: string; tip: string }> = {
  'mixed-content': {
    badge: 'Blocked · http',
    tip: 'This station streams over http:// only. Plajah is served over https, so the browser blocks it before it starts.',
  },
  'hls-unsupported': {
    badge: 'HLS · unsupported',
    tip: 'This is an HLS stream. It plays in Safari and on iOS, but this browser needs HLS support added to the shared player first.',
  },
};

const LiveRadioBrowser: React.FC<LiveRadioBrowserProps> = ({ onBack, onExit }) => {
  const { playTrack, pause, resume, isPlaying, currentTrack, audioSource } = useGlobalPlayerState();

  const [activeShelfId, setActiveShelfId] = useState<string>(RADIO_SHELVES[0].id);
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [countries, setCountries] = useState<RadioCountry[]>([]);
  const [activeCountry, setActiveCountry] = useState<RadioCountry | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [hidePlayable, setHidePlayable] = useState(true); // hide streams we know are blocked
  const [playState, setPlayState] = useState<PlayState>('connecting');
  const [tuningUuid, setTuningUuid] = useState<string | null>(null);

  const watchdogRef = useRef<any>(null);
  const reqRef = useRef(0); // guards against out-of-order responses

  const activeShelf = getShelf(activeShelfId);

  // ── Loading ────────────────────────────────────────────────────────────────

  const runLoad = useCallback(async (loader: () => Promise<RadioStation[]>) => {
    const token = ++reqRef.current;
    setLoadState('loading');
    try {
      const rows = await loader();
      if (token !== reqRef.current) return; // a newer request won
      setStations(rows);
      setLoadState(rows.length ? 'ready' : 'empty');
    } catch {
      if (token !== reqRef.current) return;
      setStations([]);
      setLoadState('error');
    }
  }, []);

  const loadShelf = useCallback((shelf: RadioShelf) => {
    setActiveCountry(null);
    if (shelf.kind === 'trending') return runLoad(() => fetchTrending(80));
    if (shelf.kind === 'topvoted') return runLoad(() => fetchTopVoted(80));
    if (shelf.kind === 'countries') {
      setStations([]);
      setLoadState('loading');
      return fetchCountries()
        .then(c => { setCountries(c); setLoadState(c.length ? 'ready' : 'error'); })
        .catch(() => setLoadState('error'));
    }
    return runLoad(() => searchStations(shelf.query || {}));
  }, [runLoad]);

  useEffect(() => {
    if (searchMode) return;
    const shelf = getShelf(activeShelfId);
    if (shelf) loadShelf(shelf);
  }, [activeShelfId, searchMode, loadShelf]);

  // Debounced name search.
  useEffect(() => {
    if (!searchMode) return;
    const term = query.trim();
    if (!term) { setStations([]); setLoadState('idle'); return; }
    const t = setTimeout(() => runLoad(() => searchByName(term, 80)), 350);
    return () => clearTimeout(t);
  }, [query, searchMode, runLoad]);

  const openCountry = (c: RadioCountry) => {
    setActiveCountry(c);
    runLoad(() => searchStations({ countryCode: c.code, limit: 120 }));
  };

  const refresh = () => {
    clearRadioCache();
    if (searchMode && query.trim()) runLoad(() => searchByName(query.trim(), 80));
    else if (activeCountry) openCountry(activeCountry);
    else if (activeShelf) loadShelf(activeShelf);
  };

  // ── Playback ───────────────────────────────────────────────────────────────

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
  }, []);

  useEffect(() => clearWatchdog, [clearWatchdog]);

  const tuneIn = useCallback((s: RadioStation) => {
    // An unplayable stream can't be rescued client-side — the UI says why
    // instead of handing the user a button that dead-ends.
    if (blockerFor(s)) return;

    const track = stationToTrack(s);

    // Already tuned in → plain transport toggle.
    if (audioSource === 'RADIO' && currentTrack?.id === track.id && playState !== 'error') {
      isPlaying ? pause() : resume();
      return;
    }

    clearWatchdog();
    setTuningUuid(s.uuid);
    setPlayState('connecting');

    // The API asks clients to report real listens; fire-and-forget, non-blocking.
    reportStationClick(s.uuid);

    // Hand off to the shared transport — this is what makes the station appear in
    // the platform's now-playing, respect its volume, and stop other audio.
    // `forceReload` matters here: a live station has no natural end, so we always
    // want a fresh src assignment rather than a resume of stale element state.
    playTrack(track, stationToAlbum(s, track), 'RADIO', undefined, true);

    const audio = document.getElementById('__plajah_audio__') as HTMLAudioElement | null;

    if (audio) {
      const onPlaying = () => { setPlayState('playing'); cleanup(); };
      const onError = () => { setPlayState('error'); cleanup(); };
      const cleanup = () => {
        audio.removeEventListener('playing', onPlaying);
        audio.removeEventListener('error', onError);
        clearWatchdog();
      };
      audio.addEventListener('playing', onPlaying);
      audio.addEventListener('error', onError);
      // A station can pass the API's health check and still be down right now.
      // Without this the UI would spin over silence forever.
      watchdogRef.current = setTimeout(() => {
        if (audio.readyState < 2 || audio.paused) { setPlayState('error'); cleanup(); }
      }, 15000);
    }
  }, [audioSource, currentTrack?.id, isPlaying, pause, resume, playTrack, playState, clearWatchdog]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const visible = useMemo(
    () => (hidePlayable ? stations.filter(s => !blockerFor(s)) : stations),
    [stations, hidePlayable],
  );
  const blockedCount = useMemo(() => stations.filter(s => !!blockerFor(s)).length, [stations]);

  const isStationLive = (s: RadioStation) =>
    audioSource === 'RADIO' && currentTrack?.id === `radio:${s.uuid}`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full bg-transparent text-white flex flex-col lg:flex-row overflow-hidden">
      {/* Shelf rail */}
      <aside className="w-full lg:w-72 border-r border-white/5 bg-theme-card/30 flex flex-col lg:h-full shrink-0">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="lg:hidden p-2 bg-white/5 rounded-xl" aria-label="Back">
              <ChevronLeft size={18} />
            </button>
          )}
          <div className="p-2 rounded-xl bg-[#00DAF3]/20">
            <Globe size={18} className="text-[#00DAF3]" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-tight">Live Radio</p>
            <p className="text-[8px] font-bold uppercase tracking-widest text-white/40">Broadcast Worldwide</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {SHELF_GROUPS.map(group => (
            <div key={group.label}>
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-3 px-2">
                {group.label}
              </h4>
              <div className="space-y-1">
                {group.shelfIds.map(id => {
                  const shelf = getShelf(id);
                  if (!shelf) return null;
                  const active = !searchMode && activeShelfId === id;
                  return (
                    <button
                      key={id}
                      onClick={() => { setSearchMode(false); setQuery(''); setActiveShelfId(id); }}
                      className={`w-full px-3 py-2.5 rounded-2xl text-left transition-all ${
                        active ? 'bg-[#00DAF3] text-black' : 'hover:bg-white/5 text-white/70'
                      }`}
                    >
                      <p className="text-[11px] font-black uppercase tracking-tight truncate">{shelf.title}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {onExit && (
            <button
              onClick={onExit}
              className="w-full px-3 py-2.5 rounded-2xl text-left hover:bg-white/5 text-white/50 flex items-center gap-2"
            >
              <Radio size={14} />
              <span className="text-[11px] font-black uppercase tracking-tight">Back to Plajah FM</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header + search */}
        <div className="p-6 lg:p-8 border-b border-white/5 bg-theme-card/40 backdrop-blur-xl">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setSearchMode(true); }}
                placeholder="Search stations worldwide…"
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-10 py-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-[#00DAF3]/50 transition-colors"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setSearchMode(false); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={refresh}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors"
              aria-label="Refresh"
            >
              <RefreshCw size={16} className={loadState === 'loading' ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="mt-5 flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#00DAF3]">
                {searchMode ? 'Search' : activeCountry ? 'Country' : activeShelf?.eyebrow}
              </p>
              <h2 className="text-xl font-black uppercase tracking-tight mt-1">
                {searchMode ? (query || 'Search') : activeCountry ? activeCountry.name : activeShelf?.title}
              </h2>
              {!searchMode && !activeCountry && activeShelf?.blurb && (
                <p className="text-[11px] text-white/40 mt-1 max-w-xl">{activeShelf.blurb}</p>
              )}
            </div>

            {/* Unplayable-stream control (http-only streams, unsupported HLS). */}
            {blockedCount > 0 && (
              <button
                onClick={() => setHidePlayable(v => !v)}
                className={`ml-auto px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest transition-colors ${
                  hidePlayable
                    ? 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}
              >
                {hidePlayable ? `${blockedCount} Unplayable Hidden` : `Showing ${blockedCount} Unplayable`}
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 custom-scrollbar">
          {loadState === 'loading' && (
            <div className="flex flex-col items-center justify-center py-24 text-white/40">
              <Loader2 size={28} className="animate-spin text-[#00DAF3]" />
              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.4em]">Scanning the dial…</p>
            </div>
          )}

          {loadState === 'error' && (
            <EmptyState
              icon={<AlertTriangle size={26} className="text-red-400" />}
              title="Couldn’t reach the station directory"
              body="The radio directory didn’t respond. It’s a community-run service and mirrors go down occasionally — try again in a moment."
              action={<RetryButton onClick={refresh} />}
            />
          )}

          {loadState === 'empty' && (
            <EmptyState
              icon={<Radio size={26} className="text-white/30" />}
              title="No stations here"
              body="Nothing came back for this one. Try a different shelf or search by name."
            />
          )}

          {loadState === 'idle' && searchMode && (
            <EmptyState
              icon={<Search size={26} className="text-white/30" />}
              title="Search live radio"
              body="Type a station, a city, or a broadcaster — the directory covers stations in 241 countries."
            />
          )}

          {/* Country grid */}
          {loadState === 'ready' && activeShelf?.kind === 'countries' && !activeCountry && !searchMode && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {countries.map(c => (
                <button
                  key={c.code}
                  onClick={() => openCountry(c)}
                  className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-[#00DAF3]/30 transition-all text-left"
                >
                  <p className="text-[11px] font-black uppercase tracking-tight truncate">{c.name}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 mt-1">
                    {c.stationCount.toLocaleString()} Stations
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Station grid */}
          {loadState === 'ready' && visible.length > 0 && (
            <>
              {activeCountry && (
                <button
                  onClick={() => { setActiveCountry(null); loadShelf(getShelf('countries')!); }}
                  className="mb-5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white flex items-center gap-1"
                >
                  <ChevronLeft size={14} /> All Countries
                </button>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <AnimatePresence mode="popLayout">
                  {visible.map(s => (
                    <StationCard
                      key={s.uuid}
                      station={s}
                      live={isStationLive(s)}
                      isPlaying={isStationLive(s) && isPlaying}
                      state={tuningUuid === s.uuid ? playState : undefined}
                      onPlay={() => tuneIn(s)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}

          {/* Everything on this shelf is blocked and the filter is hiding it all. */}
          {loadState === 'ready' && visible.length === 0 && blockedCount > 0 && (
            <EmptyState
              icon={<ShieldAlert size={26} className="text-amber-400" />}
              title="Nothing here this browser can play"
              body="Every station on this shelf is either http-only (blocked on an https page) or an HLS stream this browser can't open. Neither is fixable from here — http streams need a server-side proxy, HLS needs support in the shared player."
              action={
                <button
                  onClick={() => setHidePlayable(false)}
                  className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-widest transition-colors"
                >
                  Show them anyway
                </button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Station card ─────────────────────────────────────────────────────────────

const StationCard: React.FC<{
  station: RadioStation;
  live: boolean;
  isPlaying: boolean;
  state?: PlayState;
  onPlay: () => void;
}> = ({ station: s, live, isPlaying, state, onPlay }) => {
  const [imgOk, setImgOk] = useState(!!s.favicon);
  const blocker = blockerFor(s);
  const blocked = !!blocker;
  const errored = live && state === 'error';
  const connecting = live && state === 'connecting' && !isPlaying;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className={`p-4 rounded-3xl border transition-all flex items-center gap-4 ${
        errored
          ? 'bg-red-500/5 border-red-500/30'
          : live
          ? 'bg-[#00DAF3]/10 border-[#00DAF3]/40'
          : blocked
          ? 'bg-white/[0.02] border-white/5 opacity-60'
          : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
      }`}
    >
      {/* Favicon */}
      <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 bg-white/5 flex items-center justify-center">
        {imgOk ? (
          <img
            src={s.favicon}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgOk(false)}
            loading="lazy"
          />
        ) : (
          <Radio size={20} className="text-white/25" />
        )}
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-black uppercase tracking-tight truncate" title={s.name}>
          {s.name}
        </p>
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/35 truncate mt-0.5">
          {[s.country, s.language].filter(Boolean).join(' · ') || 'Unknown origin'}
        </p>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {s.lastCheckOk && !blocked && (
            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/25">
              <Signal size={9} /> Live
            </Badge>
          )}
          {blocker && (
            <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/25" title={BLOCKER_COPY[blocker].tip}>
              <ShieldAlert size={9} /> {BLOCKER_COPY[blocker].badge}
            </Badge>
          )}
          {errored && (
            <Badge className="bg-red-500/15 text-red-300 border-red-500/25">
              <AlertTriangle size={9} /> Off air
            </Badge>
          )}
          <Badge className="bg-white/5 text-white/40 border-white/10">
            {s.codec}{s.bitrate ? ` · ${s.bitrate}k` : ''}
          </Badge>
          {s.isHls && !blocker && <Badge className="bg-white/5 text-white/40 border-white/10">HLS</Badge>}
        </div>

        {errored && (
          <p className="text-[9px] text-red-300/70 mt-2 leading-relaxed">
            This station is off the air or refusing connections right now.
          </p>
        )}
        {blocker && (
          <p className="text-[9px] text-amber-300/60 mt-2 leading-relaxed">{BLOCKER_COPY[blocker].tip}</p>
        )}
      </div>

      {/* Transport */}
      <button
        onClick={onPlay}
        disabled={blocked}
        title={blocker ? BLOCKER_COPY[blocker].tip : undefined}
        className={`p-3.5 rounded-2xl shrink-0 transition-all ${
          blocked
            ? 'bg-white/5 text-white/20 cursor-not-allowed'
            : live
            ? 'bg-[#00DAF3] text-black'
            : 'bg-white/10 hover:bg-white/20 text-white'
        }`}
        aria-label={blocked ? 'Unavailable' : isPlaying ? 'Pause' : 'Play'}
      >
        {connecting ? (
          <Loader2 size={16} className="animate-spin" />
        ) : blocked ? (
          <ShieldAlert size={16} />
        ) : isPlaying ? (
          <Pause size={16} />
        ) : (
          <Play size={16} />
        )}
      </button>
    </motion.div>
  );
};

// ── Small primitives ─────────────────────────────────────────────────────────

const Badge: React.FC<{ className?: string; title?: string; children: React.ReactNode }> = ({ className = '', title, children }) => (
  <span
    title={title}
    className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest inline-flex items-center gap-1 ${className}`}
  >
    {children}
  </span>
);

const RetryButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-widest transition-colors inline-flex items-center gap-2"
  >
    <RefreshCw size={12} /> Try Again
  </button>
);

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}> = ({ icon, title, body, action }) => (
  <div className="flex flex-col items-center justify-center py-24 text-center max-w-md mx-auto">
    <div className="p-4 rounded-3xl bg-white/5 mb-5">{icon}</div>
    <p className="text-sm font-black uppercase tracking-tight">{title}</p>
    <p className="text-[11px] text-white/40 mt-2 leading-relaxed">{body}</p>
    {action && <div className="mt-6">{action}</div>}
  </div>
);

export default LiveRadioBrowser;
