import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { visibleToViewer as releaseVisibleToViewer } from '../services/releases/visibility';
import { Video, Album, Character, IPWorld, LoreEntry, TimelineEvent, WhatIfBranchPoint, WhatIfChoice, CharacterTimestamp, Club } from '../types';
import {
  Play, Plus, Share2, ArrowLeft, Eye, Pencil,
  Info, Film, Globe, MessageCircle,
  X, Users, Maximize2, Minimize2, Check,
  Bookmark, Sparkles, RefreshCw, Calendar,
  Pause, Volume2, VolumeX, Award, ChevronRight,
  RotateCcw, RotateCw, Gauge, PictureInPicture2, Captions, SkipForward,
  ThumbsUp, ThumbsDown, ScrollText, Milestone, ShieldCheck,
  Crown, Link2, Radio, Megaphone,
} from 'lucide-react';
import { ChoraPromoModal } from './music/ChoraPromoModal';
import CommentSection, { type CommentMedia } from './CommentSection';
import PlatformBumperPlayer from './tv/PlatformBumperPlayer';
import { pickCinemaIdent } from '../services/cinemaIdents';
import WorldBadge from './WorldBadge';
import HoverPreviewThumb, { previewSourceFor } from './HoverPreviewThumb';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { getDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';
import { recordProgress, getResumePosition } from '../services/watchHistoryService';
import { trackStart, trackProgress, trackComplete } from '../services/contentMetrics';
import { subscribePublicStats, submitRating, positiveShare, formatCount, type PublicStats } from '../services/publicStats';
import { setVideoReaction, matchScoreFor, type MatchResult } from '../services/videoTasteService';
import {
  db, auth,
  fetchWorldCharacters,
  fetchWorldLore,
  fetchWorldTimeline,
  fetchWorldContentByWorldId,
  addToWatchlist, removeFromWatchlist, isInWatchlist,
  fetchUserClubs, createClubEvent,
  fetchDiscussionPostsByContentId,
  listenToVideoComments, postVideoComment,
  loginWithGoogle,
  updateAlbum, updateVideo,
} from '../services/backendService';
import { useParty, type UseParty } from '../hooks/useParty';
import {
  createParty, partyShareUrl, planDriftCorrection, fetchActiveClubPartiesForContent,
  listenPartyChat, sendPartyChat, listenPartyReactions, sendPartyReaction, PARTY_EMOJIS,
  type Party, type PartyChatMessage, type PartyReaction,
} from '../services/partyService';
import { partyToast } from './party/partyToast';
import PartyChatPanel from './party/PartyChatPanel';
import The411 from './The411';
import { shareAsset, shareText } from '../services/deepLinkService';
import { cleanDescription } from '../utils/description';
import CharacterWorldView from './CharacterWorldView';
import { createPortal } from 'react-dom';
import { hlsTuning, capLevelsToPanel } from '../services/hlsTuning';
import { getPlatformInfo } from '../hooks/usePlatform';
import { BuyToOwn, useOwnership } from './BuyToOwn';
import AriaMark from './aria/AriaMark';
import { watchAnalysisJob, type TaleoAnalysisJob } from '../services/storyIntelService';
import { canAccessStoryIntelTools } from '../services/storyIntelBridge';
import { MoreLikeThis, StoryBreakdown, useRelatedFilms, filmArt } from './taleo/FilmExtras';
import { getArchiveItemFiles, getBestVideoUrl, archiveVideoToAlbum } from '../services/archiveContentService';
import { getSelfHostedFilm, hydrateSelfHostedFilmsFromServer, registerSelfHostedFilm } from '../services/selfHostedFilms';
import { ARCHIVE_FILM_ITEMS } from '../services/filmIngestSources';
import {
  DirectorSpotlightCard,
  CharactersAndActorsSection,
  findPlayableFilmById,
} from './taleo/ClassicCinemaDossier';
import { getHalloweenStoryIntelBundle } from '../data/halloweenStoryIntel';
import { consumeAutoplay } from '../services/filmAutoplay';
import { filmDistributionOf, filmOffers } from '../services/filmPricing';

// Universal Video Player (Pixels & CrossOver DSP)
const ReelloUniversalVideoPlayer = React.lazy(() => import('./reello/ReelloUniversalVideoPlayer'));
// Owner-only Story Intelligence review surface — lazy so viewers never pay for it.
const StoryIntelReview = React.lazy(() => import('./taleo/StoryIntelReview'));

interface MovieUXViewProps {
  item: Video | Album;
  onBack: () => void;
  onVisitUser: (uid: string) => void;
  onNavigateToWorld?: (worldId: string, characterId?: string) => void;
  onOpenItem?: (item: Video | Album) => void;
  /** Owner-only: open the authoring tool to edit this film's details. */
  onEditFilm?: (item: Video | Album) => void;
  currentUser: any;
  /** Active Watch Party ID when opened from a shared party link or Club Watch Party. */
  partyId?: string;
  onLeaveParty?: () => void;
}

const isHLSUrl = (url: string) => url.includes('.m3u8');

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

// ─── CinemaPlayer ─────────────────────────────────────────────────────────────
interface CinemaPlayerProps {
  video: Video;
  poster?: string;
  onVideoRef?: (el: HTMLVideoElement | null) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onWhatIfParticipation?: (branchId: string, choiceId: string) => void;
  onEnded?: () => void;
  onBack?: () => void;
  party?: UseParty;
  resyncSignal?: number;
}

type CinemaStrategy = 'mux' | 'mux-mp4' | 'hls' | 'direct' | 'embed' | 'processing' | 'error';

const CinemaPlayer: React.FC<CinemaPlayerProps> = ({
  video: initialVideo,
  poster,
  onVideoRef,
  isFullscreen,
  onToggleFullscreen,
  onWhatIfParticipation,
  onEnded,
  onBack,
  party,
  resyncSignal,
}) => {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredBranchesRef = useRef(new Set<string>());

  const [liveVideo, setLiveVideo] = useState<Video>(initialVideo);
  const [muxFailed, setMuxFailed] = useState(false);
  const [muxMp4Failed, setMuxMp4Failed] = useState(false);
  const [directFailed, setDirectFailed] = useState(false);

  // Custom controls state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [needsUnmuteBanner, setNeedsUnmuteBanner] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [ccOn, setCcOn] = useState(false);
  const [ccMenu, setCcMenu] = useState(false);
  const [activeCcLang, setActiveCcLang] = useState<string | null>(null);
  const [whatIfActive, setWhatIfActive] = useState<WhatIfBranchPoint | null>(null);
  const lastRecordRef = useRef(0);
  const lastHostBroadcastRef = useRef(0);
  const applyingRemoteSyncRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const subtitles = liveVideo.subtitles || [];

  const onVideoRefLatest = useRef(onVideoRef);
  onVideoRefLatest.current = onVideoRef;

  const setRef = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    setVideoEl(el);
    onVideoRefLatest.current?.(el);
  }, []);

  // 5s, and the same on every input. 3s was tuned for a mouse, where the pointer moving IS the
  // reveal; on a remote each press is a discrete act and the controls were vanishing between
  // presses — you could not step from Play to the scrubber without losing the bar.
  const scheduleControlHide = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 5000);
  }, []);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleControlHide();
  }, [scheduleControlHide]);

  useEffect(() => () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); }, []);

  // A D-pad press counts as activity. Without this only mouse movement kept the bar alive, so on
  // a television the controls hid themselves while they were being used.
  useEffect(() => {
    const onKey = () => revealControls();
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [revealControls]);

  // ── Firestore snapshot — mirrors VideoPlayer.tsx ──────────────────────────
  useEffect(() => {
    if (!liveVideo.id || liveVideo.id.startsWith('arc_') || liveVideo.id.startsWith('tv_')) return;
    const unsub = onSnapshot(doc(db, 'videos', liveVideo.id), snap => {
      if (!snap.exists()) return;
      const data = snap.data() as Video;
      if (data.muxPlaybackId && data.muxPlaybackId !== liveVideo.muxPlaybackId) {
        setLiveVideo(v => ({ ...v, muxPlaybackId: data.muxPlaybackId, muxAssetId: data.muxAssetId }));
        setMuxFailed(false);
      }
      if (data.url && data.url !== liveVideo.url) {
        setLiveVideo(v => ({ ...v, url: data.url }));
        setDirectFailed(false);
      }
    });
    return () => unsub();
  }, [liveVideo.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rawUrl = liveVideo.url || '';
  const rawUrlIsEmbed =
    rawUrl.includes('youtube.com') ||
    rawUrl.includes('youtu.be') ||
    rawUrl.includes('youtube-nocookie.com') ||
    rawUrl.includes('europeana.eu') ||
    rawUrl.includes('/embed/');
  const isEmbed = !!liveVideo.embedUrl || rawUrlIsEmbed;
  const hasHlsUrl = isHLSUrl(rawUrl);
  const hasDirectUrl = !rawUrlIsEmbed && !!rawUrl && !hasHlsUrl && !directFailed;
  // Mux progressive-MP4 fallback: plays through a plain <video> with NO Media Source
  // Extensions. Android TV System WebViews often can't play Mux HLS via hls.js/MSE (no native
  // HLS either), so when the MSE attempt fails we fall back to this. Requires Mux static
  // renditions (MP4 support) enabled on the asset; if not, it 404s and we drop to embed/error
  // — no worse than before, which had no fallback for Mux-only titles.
  const muxMp4Url = liveVideo.muxPlaybackId ? `https://stream.mux.com/${liveVideo.muxPlaybackId}/high.mp4` : '';
  const processing = !liveVideo.muxPlaybackId && !rawUrl && !liveVideo.embedUrl;

  const strategy: CinemaStrategy =
    processing                              ? 'processing' :
    (liveVideo.muxPlaybackId && !muxFailed) ? 'mux' :
    hasHlsUrl                               ? 'hls' :
    hasDirectUrl                            ? 'direct' :
    (liveVideo.muxPlaybackId && muxFailed && !muxMp4Failed) ? 'mux-mp4' :  // no-MSE fallback (TV)
    (liveVideo.embedUrl || isEmbed)         ? 'embed' :
                                              'error';

  // ── HLS.js for Mux and custom .m3u8 ───────────────────────────────────────
  useEffect(() => {
    if (strategy !== 'mux' && strategy !== 'hls') return;
    const el = videoElRef.current;
    if (!el) return;
    const hlsUrl = strategy === 'mux'
      ? `https://stream.mux.com/${liveVideo.muxPlaybackId}.m3u8`
      : rawUrl;
    let torn = false;
    const onFatal = () => {
      if (torn) return;
      if (strategy === 'mux') setMuxFailed(true);
      else setDirectFailed(true);
    };
    (async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (torn) return;
        if (Hls.isSupported()) {
          // Shared tuning, keeping this surface's own retry policy: the Mux attempt fails fast
          // on purpose so it can fall through to another source rather than stall on a dead one.
          const hls = new Hls(hlsTuning({
            fragLoadingMaxRetry:     strategy === 'mux' ? 1 : 3,
            manifestLoadingMaxRetry: strategy === 'mux' ? 1 : 2,
            levelLoadingMaxRetry:    strategy === 'mux' ? 1 : 2,
          }));
          hlsRef.current = hls;
          hls.loadSource(hlsUrl);
          hls.attachMedia(el);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            capLevelsToPanel(hls as any);
            if (!torn) el.play().catch(() => { el.muted = true; el.play().catch(() => {}); });
          });
          let recovered = 0;
          hls.on(Hls.Events.ERROR, (_: any, data: any) => {
            if (!data.fatal || torn) return;
            // Give flaky decoders (esp. Android TV WebView) a chance before falling through.
            if (recovered < 2) {
              recovered++;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { hls.startLoad(); return; }
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
            }
            console.warn('[PlajahTV] Cinema HLS fatal', strategy, data?.type, data?.details);
            hls.destroy(); hlsRef.current = null; onFatal();
          });
        } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
          el.addEventListener('error', onFatal, { once: true });
          el.src = hlsUrl;
          el.play().catch(() => { el.muted = true; el.play().catch(() => {}); });
        } else {
          // No MSE (hls.js) AND no native HLS — the exact Android TV WebView failure mode.
          console.warn('[PlajahTV] Cinema: no MSE + no native HLS → falling back', strategy);
          onFatal();
        }
      } catch { onFatal(); }
    })();
    return () => { torn = true; hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [strategy]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video event listeners (timeupdate, What If detection) ─────────────────
  useEffect(() => {
    if (!videoEl) return;
    const branches = liveVideo.whatIfBranchPoints || [];

    // Save Continue-Watching progress (throttled ~5s) — Taleo now resumes like Netflix.
    const record = () => {
      if (!liveVideo.id || !(videoEl.duration > 0) || isNaN(videoEl.duration)) return;
      if (!(videoEl.currentTime > 0)) return;
      // Creator metrics — the aggregate view count and retention curve, distinct from the private
      // resume position written just below. Taleo reported neither before, which is why every
      // number on the detail page had to be invented to have anything to show.
      trackStart(liveVideo.id, 'film', (liveVideo as any).ownerId);
      trackProgress(liveVideo.id, 'film', videoEl.currentTime, videoEl.duration, (liveVideo as any).ownerId);
      recordProgress({
        id: liveVideo.id,
        kind: 'TALEO',
        title: liveVideo.title,
        thumbnailUrl: poster || liveVideo.thumbnailUrl || liveVideo.coverImageUrl || undefined,
        ownerName: liveVideo.artist || undefined,
        positionSec: videoEl.currentTime,
        durationSec: videoEl.duration,
        seriesId: (liveVideo as any).tvMetadata?.seriesTitle || undefined,
        worldId: liveVideo.worldId,
        // Taste facets — what videoTasteService learns from actually finishing (or abandoning)
        // this film, as opposed to from a deliberate thumb.
        genre: liveVideo.genre,
        category: liveVideo.category,
        creatorId: liveVideo.ownerId,
        tags: liveVideo.tags,
      }).catch(() => {});
    };

    const broadcastHostState = (playingOverride?: boolean) => {
      if (!party?.isHost || applyingRemoteSyncRef.current) return;
      party.broadcast({
        isPlaying: playingOverride !== undefined ? playingOverride : !videoEl.paused,
        positionSec: Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0,
        rate: videoEl.playbackRate || 1,
        contentId: liveVideo.id,
      });
    };

    const onTime = () => {
      setCurrentTime(videoEl.currentTime);
      if (isFinite(videoEl.duration)) setDuration(videoEl.duration);
      const now = Date.now();
      if (now - lastRecordRef.current >= 5000) { lastRecordRef.current = now; record(); }
      if (party?.isHost && !videoEl.paused && now - lastHostBroadcastRef.current >= 4000) {
        lastHostBroadcastRef.current = now;
        broadcastHostState(true);
      }
      for (const b of branches) {
        if (!triggeredBranchesRef.current.has(b.id) && videoEl.currentTime >= b.timestamp - 0.35) {
          videoEl.pause();
          triggeredBranchesRef.current.add(b.id);
          setWhatIfActive(b);
          break;
        }
      }
    };
    const onPause = () => {
      setIsPaused(true);
      record();
      broadcastHostState(false);
    };
    const onPlay = () => {
      setIsPaused(false);
      scheduleControlHide();
      broadcastHostState(true);
    };
    const onSeeked = () => {
      if (party?.isHost && !applyingRemoteSyncRef.current) {
        broadcastHostState();
      }
    };
    const onMeta = () => {
      if (isFinite(videoEl.duration)) setDuration(videoEl.duration);
      if (party?.isHost) {
        broadcastHostState();
      } else if (!party?.party && !resumeAppliedRef.current && liveVideo.id) {
        // Resume from last position (skip if near the end), once per video — only when NOT in a Watch Party.
        resumeAppliedRef.current = true;
        const pos = getResumePosition(liveVideo.id);
        if (pos > 5 && isFinite(videoEl.duration) && pos < videoEl.duration - 15) {
          try { videoEl.currentTime = pos; } catch {}
        }
      }
    };

    const onEndedEvt = () => {
      record();
      if (liveVideo.id) trackComplete(liveVideo.id, 'film', videoEl.duration, (liveVideo as any).ownerId);
      onEnded?.();
    };

    videoEl.addEventListener('timeupdate', onTime);
    videoEl.addEventListener('pause', onPause);
    videoEl.addEventListener('play', onPlay);
    videoEl.addEventListener('seeked', onSeeked);
    videoEl.addEventListener('loadedmetadata', onMeta);
    videoEl.addEventListener('ended', onEndedEvt);
    return () => {
      record();
      videoEl.removeEventListener('timeupdate', onTime);
      videoEl.removeEventListener('pause', onPause);
      videoEl.removeEventListener('play', onPlay);
      videoEl.removeEventListener('seeked', onSeeked);
      videoEl.removeEventListener('loadedmetadata', onMeta);
      videoEl.removeEventListener('ended', onEndedEvt);
    };
  }, [videoEl, liveVideo.whatIfBranchPoints, liveVideo.id, poster, scheduleControlHide, onEnded, party?.isHost, party?.party, party?.broadcast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Follower Watch Party Sync Loop ────────────────────────────────────────
  const syncFollowerToHost = useCallback((forceSeek = false) => {
    const el = videoElRef.current;
    if (!el || !party?.isFollower || !party.party) return;
    const target = party.getTarget();
    const corr = planDriftCorrection(
      Number.isFinite(el.currentTime) ? el.currentTime : 0,
      target.positionSec,
      target.shouldPlay,
      target.rate,
    );
    applyingRemoteSyncRef.current = true;
    try {
      if (forceSeek || corr.action === 'seek') {
        const nextSec = Math.max(0, corr.action === 'seek' ? corr.seekTo : target.positionSec);
        if (Number.isFinite(nextSec) && Math.abs((el.currentTime || 0) - nextSec) > 0.35) {
          try { el.currentTime = nextSec; setCurrentTime(nextSec); } catch {}
        }
      }
      if (Math.abs((el.playbackRate || 1) - corr.rate) > 0.01) {
        try { el.playbackRate = corr.rate; setPlaybackRate(corr.rate); } catch {}
      }
      if (target.shouldPlay && el.paused) {
        el.play().catch(() => {
          // Browser blocked unmuted autoplay on shared link entry — start muted in sync and offer one-tap unmute
          el.muted = true;
          setIsMuted(true);
          setNeedsUnmuteBanner(true);
          el.play().catch(() => {});
        });
      } else if (!target.shouldPlay && !el.paused) {
        el.pause();
      }
    } finally {
      setTimeout(() => { applyingRemoteSyncRef.current = false; }, 80);
    }
  }, [party]);

  useEffect(() => {
    if (!videoEl || !party?.isFollower || !party.party) return;
    syncFollowerToHost(true);
    const onReady = () => syncFollowerToHost(true);
    videoEl.addEventListener('loadedmetadata', onReady);
    videoEl.addEventListener('canplay', onReady);
    const iv = setInterval(() => syncFollowerToHost(false), 600);
    return () => {
      clearInterval(iv);
      videoEl.removeEventListener('loadedmetadata', onReady);
      videoEl.removeEventListener('canplay', onReady);
    };
  }, [videoEl, party?.isFollower, party?.party?.id, party?.playback?.seq, resyncSignal, syncFollowerToHost]);

  const togglePlay = () => {
    const el = videoElRef.current;
    if (!el) return;
    if (party?.isFollower) {
      if (needsUnmuteBanner || el.muted) {
        el.muted = false;
        setIsMuted(false);
        setNeedsUnmuteBanner(false);
      }
      syncFollowerToHost(true);
      partyToast(`Playback stays synced to ${party.party?.hostName || 'the host'}`, 'info');
      revealControls();
      return;
    }
    if (el.paused) el.play().catch(() => {});
    else el.pause();
    revealControls();
  };

  const skip = (secs: number) => {
    const el = videoElRef.current;
    if (!el) return;
    if (party?.isFollower) {
      syncFollowerToHost(true);
      partyToast(`Playback is controlled by ${party.party?.hostName || 'the host'}`, 'info');
      revealControls();
      return;
    }
    el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + secs));
    if (party?.isHost) {
      party.broadcast({ isPlaying: !el.paused, positionSec: el.currentTime, rate: el.playbackRate || 1, contentId: liveVideo.id });
    }
    revealControls();
  };

  const SPEEDS = [1, 1.25, 1.5, 2, 0.5];
  const cycleSpeed = () => {
    if (party?.isFollower) {
      partyToast(`Playback speed is synced to ${party.party?.hostName || 'the host'}`, 'info');
      return;
    }
    const el = videoElRef.current;
    setPlaybackRate(prev => {
      const next = SPEEDS[(SPEEDS.indexOf(prev) + 1) % SPEEDS.length];
      if (el) el.playbackRate = next;
      if (party?.isHost && el) {
        party.broadcast({ isPlaying: !el.paused, positionSec: el.currentTime, rate: next, contentId: liveVideo.id });
      }
      return next;
    });
    revealControls();
  };

  const togglePiP = async () => {
    const el = videoElRef.current as any;
    if (!el) return;
    try {
      if ((document as any).pictureInPictureElement) await (document as any).exitPictureInPicture();
      else await el.requestPictureInPicture?.();
    } catch { /* PiP unsupported for this source */ }
  };

  // Sync native text tracks with the CC toggle / chosen language.
  useEffect(() => {
    const el = videoElRef.current;
    if (!el || !el.textTracks) return;
    for (let i = 0; i < el.textTracks.length; i++) {
      const tt = el.textTracks[i];
      tt.mode = (ccOn && (activeCcLang ? tt.language === activeCcLang : i === 0)) ? 'showing' : 'disabled';
    }
  }, [ccOn, activeCcLang, videoEl, subtitles.length]);

  // Skip-intro / skip-recap surfacing.
  const inIntro = liveVideo.skipIntro && currentTime >= liveVideo.skipIntro.start && currentTime < liveVideo.skipIntro.end;
  const inRecap = liveVideo.skipRecap && currentTime >= liveVideo.skipRecap.start && currentTime < liveVideo.skipRecap.end;
  const skipTo = (end: number) => {
    const el = videoElRef.current;
    if (!el) return;
    if (party?.isFollower) {
      syncFollowerToHost(true);
      return;
    }
    el.currentTime = end + 0.1;
    if (party?.isHost) {
      party.broadcast({ isPlaying: !el.paused, positionSec: el.currentTime, rate: el.playbackRate || 1, contentId: liveVideo.id });
    }
    revealControls();
  };

  const toggleMute = () => {
    if (!videoElRef.current) return;
    videoElRef.current.muted = !videoElRef.current.muted;
    setIsMuted(videoElRef.current.muted);
    if (!videoElRef.current.muted) setNeedsUnmuteBanner(false);
  };

  const handleSeek = (e: React.MouseEvent) => {
    if (!seekBarRef.current || !videoElRef.current || !duration) return;
    if (party?.isFollower) {
      syncFollowerToHost(true);
      partyToast(`Playback is synced to ${party.party?.hostName || 'the host'}`, 'info');
      return;
    }
    const rect = seekBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoElRef.current.currentTime = pct * duration;
    if (party?.isHost) {
      party.broadcast({
        isPlaying: !videoElRef.current.paused,
        positionSec: videoElRef.current.currentTime,
        rate: videoElRef.current.playbackRate || 1,
        contentId: liveVideo.id,
      });
    }
    revealControls();
  };

  const handleWhatIfChoice = (choice: WhatIfChoice) => {
    const branch = whatIfActive;
    setWhatIfActive(null);
    if (!videoElRef.current) return;
    if (choice.jumpsToTimestamp !== undefined) {
      videoElRef.current.currentTime = choice.jumpsToTimestamp;
    }
    videoElRef.current.play().catch(() => {});
    if (branch) onWhatIfParticipation?.(branch.id, choice.id);
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const charPins: CharacterTimestamp[] = liveVideo.characterTimestamps || [];
  const branchPins: WhatIfBranchPoint[] = liveVideo.whatIfBranchPoints || [];

  // ── Processing ────────────────────────────────────────────────────────────
  if (strategy === 'processing') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-center text-white/40 space-y-4 px-8">
          <div className="w-12 h-12 border-2 border-white/20 border-t-[#D0BCFF] rounded-full animate-spin mx-auto" />
          <p className="text-sm font-black uppercase tracking-widest">Processing video…</p>
          <p className="text-xs text-white/25 leading-relaxed">Your video is being prepared. This usually takes a few minutes.</p>
        </div>
      </div>
    );
  }

  // ── Embed ─────────────────────────────────────────────────────────────────
  if (strategy === 'embed') {
    let embedSrc = liveVideo.embedUrl || rawUrl;
    let directWatchUrl = embedSrc;
    const startSec = party?.isFollower ? Math.max(0, Math.floor(party.getTarget().positionSec || 0)) : 0;
    if (embedSrc.includes('youtube.com/watch') || embedSrc.includes('youtu.be/') || embedSrc.includes('youtube-nocookie.com/embed') || embedSrc.includes('youtube.com/embed')) {
      const match = embedSrc.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*)/);
      const ytId = match && match[1].length === 11 ? match[1] : '';
      if (ytId) {
        directWatchUrl = `https://www.youtube.com/watch?v=${ytId}`;
        const originParam = typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : '';
        const startParam = startSec > 2 ? `&start=${startSec}` : '';
        embedSrc = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&enablejsapi=1${startParam}${originParam}`;
      }
    }
    return (
      <div className="relative w-full h-full bg-black">
        {onBack && (
          <button
            onClick={onBack}
            className="absolute top-4 left-4 z-50 p-2.5 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-full text-white border border-white/10 transition-all cursor-pointer shadow-lg group"
            title="Back to Details"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
        )}
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          {directWatchUrl && (
            <a
              href={directWatchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-full text-white/80 hover:text-white border border-white/10 text-[9px] font-black uppercase tracking-widest transition-all shadow-lg"
              title="Watch on original archive source or external player"
            >
              <Globe size={13} className="text-[#D0BCFF]" /> Watch on Source
            </a>
          )}
        </div>
        <iframe
          key={`${embedSrc}-${resyncSignal || 0}`}
          src={embedSrc}
          className="w-full h-full border-none"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          title={liveVideo.title}
        />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (strategy === 'error') {
    const fallbackUrl = (liveVideo as any).sourceUrl || liveVideo.embedUrl || rawUrl;
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-center text-white/40 space-y-4 px-8 max-w-md">
          {onBack && (
            <button
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest text-white transition-all border border-white/10"
            >
              <ArrowLeft size={14} /> Back to Film
            </button>
          )}
          <Film size={48} className="mx-auto opacity-30" />
          <p className="text-sm font-black uppercase tracking-widest text-white/80">Source unavailable</p>
          <p className="text-xs text-white/40 leading-relaxed">
            Direct streaming playback could not be established. This can happen in local development or if cross-origin permissions are restricted.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => { setMuxFailed(false); setMuxMp4Failed(false); setDirectFailed(false); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
            >
              <RefreshCw size={12} /> Retry
            </button>
            {fallbackUrl && (
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#D0BCFF] hover:bg-[#E8DAFF] text-[#1C1B1F] rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
              >
                <Globe size={13} /> Open Source
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Video + custom controls ───────────────────────────────────────────────
  return (
    <div
      className="w-full h-full relative bg-black overflow-hidden"
      onMouseMove={revealControls}
      onClick={togglePlay}
      style={{ cursor: showControls ? 'default' : 'none' }}
    >
      <video
        key={strategy}
        ref={setRef}
        poster={poster}
        playsInline
        // Only force CORS mode when we actually need it (subtitle tracks). Forcing it
        // unconditionally made any direct/mp4 source without CORS headers fail to load.
        crossOrigin={subtitles.length ? 'anonymous' : undefined}
        className="w-full h-full object-contain"
        src={strategy === 'direct' ? rawUrl : strategy === 'mux-mp4' ? muxMp4Url : undefined}
        autoPlay={strategy === 'direct' || strategy === 'mux-mp4'}
        onError={() => {
          if (strategy === 'direct') setDirectFailed(true);
          else if (strategy === 'mux-mp4') { console.warn('[PlajahTV] Cinema Mux MP4 fallback failed'); setMuxMp4Failed(true); }
        }}
      >
        {subtitles.map(st => (
          <track key={st.srclang} kind="subtitles" src={st.url} srcLang={st.srclang} label={st.label} default={st.default} />
        ))}
      </video>

      {/* One-tap Unmute pill when browser forced muted autoplay on Watch Party deep-link entry */}
      {needsUnmuteBanner && isMuted && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (videoElRef.current) {
              videoElRef.current.muted = false;
              setIsMuted(false);
              setNeedsUnmuteBanner(false);
              videoElRef.current.play().catch(() => {});
            }
          }}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[#FF6B00] hover:bg-[#FF8533] text-black font-black text-xs uppercase tracking-widest shadow-[0_8px_30px_rgba(255,107,0,0.5)] transition-all animate-bounce"
        >
          <Volume2 size={16} /> Tap to Unmute · Synced with {party?.party?.hostName || 'Host'}
        </button>
      )}

      {/* ── What If overlay ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {whatIfActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
            onClick={e => e.stopPropagation()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 24 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="bg-white/[0.07] backdrop-blur-2xl border border-white/[0.14] rounded-3xl p-5 sm:p-8 max-w-md max-h-[85dvh] overflow-y-auto w-full text-center space-y-6 shadow-2xl"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#FFB68D]/15 border border-[#FFB68D]/30 flex items-center justify-center mx-auto">
                <Sparkles size={22} className="text-[#FFB68D]" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[#FFB68D] mb-3">What If</p>
                <h3 className="text-xl font-black text-white leading-snug">{whatIfActive.question}</h3>
              </div>
              <div className="space-y-3">
                {whatIfActive.choices.map(choice => (
                  <motion.button
                    key={choice.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleWhatIfChoice(choice)}
                    className="w-full px-6 py-4 bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.10] hover:border-[#D0BCFF]/50 rounded-2xl text-left transition-all group"
                  >
                    <p className="font-black text-white group-hover:text-[#D0BCFF] transition-colors leading-tight">
                      {choice.label}
                    </p>
                    {choice.description && (
                      <p className="text-[11px] text-white/35 mt-1.5 leading-relaxed">{choice.description}</p>
                    )}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Custom controls overlay ──────────────────────────────────────────── */}
      <motion.div
        animate={{ opacity: showControls ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="absolute inset-0 z-20 flex flex-col justify-end"
        style={{ pointerEvents: showControls ? 'auto' : 'none' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Back — lives INSIDE the auto-hiding overlay so the title chrome disappears while the
            film plays, instead of parking permanently in the top-left over the picture. */}
        {onBack && (
          <button
            onClick={onBack}
            data-tv-focusable
            className="absolute top-4 left-4 z-10 flex items-center gap-2 pl-3 pr-4 py-2.5 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-black/80 transition-all border border-white/10 max-w-[70vw]"
            title="Back to details (Esc)"
          >
            <ArrowLeft size={16} className="shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest truncate">{initialVideo.title || 'Back'}</span>
          </button>
        )}
        <div className="bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-20 pb-4 px-3 sm:px-5">
          {/* Progress bar */}
          <div className="mb-4">
            <div
              ref={seekBarRef}
              onClick={handleSeek}
              className="relative h-[3px] hover:h-[5px] bg-white/20 rounded-full cursor-pointer transition-all duration-150 group"
            >
              {/* Progress fill */}
              <div
                className="absolute left-0 top-0 h-full rounded-full pointer-events-none"
                style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #D0BCFF, #FFB68D)' }}
              />
              {/* Scrubber knob */}
              <div
                className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ left: `${pct}%` }}
              />

              {/* Character timestamp pins */}
              {charPins.flatMap((ct, ci) =>
                ct.timestamps.map((ts, ti) => {
                  const p = duration > 0 ? (ts / duration) * 100 : 0;
                  return (
                    <button
                      key={`${ci}-${ti}`}
                      style={{ left: `${p}%` }}
                      className="absolute -top-3.5 w-7 h-7 rounded-full border-2 border-[#D0BCFF] overflow-hidden -translate-x-1/2 shadow-lg hover:scale-125 transition-transform z-10"
                      onClick={e => { e.stopPropagation(); if (videoElRef.current) videoElRef.current.currentTime = ts; }}
                      title={`${ct.characterName} — ${formatTime(ts)}`}
                    >
                      {ct.imageUrl ? (
                        <img src={ct.imageUrl} className="w-full h-full object-cover" alt={ct.characterName} />
                      ) : (
                        <div className="w-full h-full bg-[#D0BCFF]/30 flex items-center justify-center text-[7px] font-black text-white">
                          {ct.characterName[0]}
                        </div>
                      )}
                    </button>
                  );
                })
              )}

              {/* What If branch markers (diamonds) */}
              {branchPins.map(b => {
                const p = duration > 0 ? (b.timestamp / duration) * 100 : 0;
                return (
                  <div
                    key={b.id}
                    style={{ left: `${p}%` }}
                    className="absolute -top-2 w-4 h-4 rotate-45 bg-[#FFB68D] -translate-x-1/2 pointer-events-none border border-white/20 shadow-md"
                    title={`What If: ${b.question}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3">
            <button onClick={() => skip(-10)} title="Back 10s" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all shrink-0">
              <RotateCcw size={15} className="text-white/60" />
            </button>

            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 flex items-center justify-center transition-all shrink-0"
            >
              {isPaused
                ? <Play size={15} fill="white" className="text-white ml-0.5" />
                : <Pause size={15} fill="white" className="text-white" />
              }
            </button>

            <button onClick={() => skip(10)} title="Forward 10s" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all shrink-0">
              <RotateCw size={15} className="text-white/60" />
            </button>

            <span className="text-[11px] font-black text-white/55 tabular-nums shrink-0">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />

            <button onClick={cycleSpeed} title="Playback speed" className="h-9 px-2.5 rounded-full bg-white/10 hover:bg-white/20 flex items-center gap-1 transition-all shrink-0">
              <Gauge size={14} className="text-white/55" />
              <span className="text-[10px] font-black text-white/60 tabular-nums">{playbackRate}x</span>
            </button>

            <div className="relative shrink-0">
              <button onClick={() => subtitles.length ? setCcMenu(m => !m) : setCcOn(o => !o)} title="Subtitles / CC" className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${ccOn ? 'bg-white/25 text-white' : 'bg-white/10 hover:bg-white/20 text-white/55'}`}>
                <Captions size={15} />
              </button>
              {ccMenu && (
                <div className="absolute bottom-11 right-0 w-44 max-w-[80vw] p-1.5 bg-black/90 backdrop-blur-md rounded-xl border border-white/10 z-30" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setCcOn(false); setCcMenu(false); }} className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${!ccOn ? 'text-[#D0BCFF]' : 'text-white/50 hover:bg-white/5'}`}>Off</button>
                  {subtitles.length === 0 ? (
                    <p className="px-3 py-2 text-[9px] text-white/25 uppercase tracking-widest">No captions available</p>
                  ) : subtitles.map(st => (
                    <button key={st.srclang} onClick={() => { setCcOn(true); setActiveCcLang(st.srclang); setCcMenu(false); }} className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${ccOn && activeCcLang === st.srclang ? 'text-[#D0BCFF]' : 'text-white/50 hover:bg-white/5'}`}>{st.label}</button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={togglePiP} title="Picture-in-picture" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all shrink-0">
              <PictureInPicture2 size={15} className="text-white/55" />
            </button>

            <button
              onClick={toggleMute}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all shrink-0"
            >
              {isMuted
                ? <VolumeX size={15} className="text-white/55" />
                : <Volume2 size={15} className="text-white/55" />
              }
            </button>

            {onToggleFullscreen && (
              <button
                onClick={onToggleFullscreen}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all shrink-0"
              >
                {isFullscreen
                  ? <Minimize2 size={15} className="text-white/55" />
                  : <Maximize2 size={15} className="text-white/55" />
                }
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Skip Intro / Recap (Netflix-style) */}
      {(inIntro || inRecap) && (
        <button
          onClick={(e) => { e.stopPropagation(); skipTo(inIntro ? liveVideo.skipIntro!.end : liveVideo.skipRecap!.end); }}
          className="absolute bottom-24 right-6 z-20 flex items-center gap-2 px-5 py-2.5 bg-white/90 text-black rounded-lg text-[11px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-xl"
        >
          <SkipForward size={14} /> Skip {inIntro ? 'Intro' : 'Recap'}
        </button>
      )}
    </div>
  );
};

// ─── MovieUXView ───────────────────────────────────────────────────────────────
const MovieUXViewInner: React.FC<MovieUXViewProps> = ({
  item,
  onBack,
  onVisitUser,
  onNavigateToWorld,
  onOpenItem,
  onEditFilm,
  currentUser,
  partyId: propPartyId,
  onLeaveParty,
}) => {
  const {
    activateVideoSource,
    setVideoElement,
    isUserActive,
    setTheme,
    clearMedia,
  } = useGlobalPlayerState();

  const [scrolled, setScrolled] = useState(false);
  const [isUIVisible, setIsUIVisible] = useState(true);
  /** Payload waiting behind the studio ident. Non-null only between Watch Now and the ident ending. */
  const [prerollFor, setPrerollFor] = useState<Video | null>(null);
  // Picked once per Watch Now: werewolf for Pumpkin Patch, a random horror reveal for horror /
  // suspense / Halloween Vault titles, the general Cinema reveal for everything else.
  const prerollIdent = useMemo(() => (prerollFor ? pickCinemaIdent(item, prerollFor) : null), [prerollFor]); // eslint-disable-line react-hooks/exhaustive-deps
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [useUniversalPlayer, setUseUniversalPlayer] = useState(() => {
    // Universal player is the default (versioned key so devices that had the old opt-in saved as off get it too).
    try { return localStorage.getItem('plajah_use_universal_player_v2') !== 'false'; } catch { return true; }
  });
  // Alternate cuts (extended / director's / …). The primary payload is remembered so we
  // can switch back; selecting an alternate just swaps the playback URL (direct file).
  const [activeVersionId, setActiveVersionId] = useState<string>('primary');
  const primaryPayloadRef = useRef<Video | null>(null);
  const [world, setWorld] = useState<IPWorld | null>(null);
  const [worldCharacters, setWorldCharacters] = useState<Character[]>([]);
  const [worldContent, setWorldContent] = useState<{ albums: Album[]; videos: Video[] } | null>(null);
  // Universe rail (Blueprint 2D) — lore + timeline surfaced inline on the film page.
  const [worldLore, setWorldLore] = useState<LoreEntry[]>([]);
  const [worldTimeline, setWorldTimeline] = useState<TimelineEvent[]>([]);
  const [openLore, setOpenLore] = useState<LoreEntry | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [partyChatMessages, setPartyChatMessages] = useState<PartyChatMessage[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: string; emoji: string; x: number }>>([]);
  const seenReactionIdsRef = useRef<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null);
  const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);
  const [whatIfAchieved, setWhatIfAchieved] = useState(false);

  // Watch Party & Watch with Club state
  const [activePartyId, setActivePartyId] = useState<string | null>(propPartyId || null);
  useEffect(() => {
    if (propPartyId) setActivePartyId(propPartyId);
  }, [propPartyId]);
  const party = useParty(activePartyId);
  const [resyncSignal, setResyncSignal] = useState(0);
  // Party chat docks as its own side panel; open by default on desktop so joiners land in it.
  const [partyChatOpen, setPartyChatOpen] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [startingWatchParty, setStartingWatchParty] = useState(false);

  // Watchlist
  const [inWatchlist, setInWatchlist] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // Watch with Club
  const [showWatchWithClub, setShowWatchWithClub] = useState(false);
  const [clubModalMode, setClubModalMode] = useState<'CHOOSE_ACTIVE_CLUB' | 'START_OR_SCHEDULE'>('START_OR_SCHEDULE');
  const [activeClubParties, setActiveClubParties] = useState<Party[]>([]);
  const [checkingClubParties, setCheckingClubParties] = useState(false);
  const [userClubs, setUserClubs] = useState<Club[]>([]);
  const [watchPartyClubId, setWatchPartyClubId] = useState('');
  const [watchPartyDate, setWatchPartyDate] = useState('');
  const [watchPartySubmitting, setWatchPartySubmitting] = useState(false);
  const [watchPartyDone, setWatchPartyDone] = useState(false);

  // Discussions panel
  const [filmDiscussions, setFilmDiscussions] = useState<any[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Top 3 assets connected to the hovered character
  const hoveredCharAssets = useMemo(() => {
    if (!hoveredCharId) return [];
    const vids = (worldContent?.videos || []).filter(v => v.characterIds?.includes(hoveredCharId));
    const albs = (worldContent?.albums || []).filter(a => (a as any).characterIds?.includes(hoveredCharId));
    return [...vids, ...albs].slice(0, 3);
  }, [hoveredCharId, worldContent]);

  const effectiveItemId = item.id || (item as any).identifier || '';

  // Subscribe to real-time video comments
  useEffect(() => {
    if (!effectiveItemId) { setComments([]); return; }
    const unsub = listenToVideoComments(effectiveItemId, (liveList) => {
      setComments(Array.isArray(liveList) ? liveList : []);
    });
    return () => { try { unsub?.(); } catch {} };
  }, [effectiveItemId]);

  // Subscribe to live Watch Party chat + emoji reactions when activePartyId is set
  useEffect(() => {
    if (!activePartyId) {
      setPartyChatMessages([]);
      setFloatingReactions([]);
      return;
    }
    seenReactionIdsRef.current = new Set();
    setPartyChatMessages([]); // never show the previous party's chat while the new one loads
    let initialReactionsBatch = true;
    const unsubChat = listenPartyChat(activePartyId, setPartyChatMessages);
    const unsubReactions = listenPartyReactions(activePartyId, (list: PartyReaction[]) => {
      if (initialReactionsBatch) {
        initialReactionsBatch = false;
        list.forEach(r => seenReactionIdsRef.current.add(r.id));
        return;
      }
      for (const r of list) {
        if (seenReactionIdsRef.current.has(r.id)) continue;
        seenReactionIdsRef.current.add(r.id);
        const key = `${r.id}_${Math.random()}`;
        const x = 15 + Math.random() * 70;
        setFloatingReactions(prev => [...prev.slice(-14), { id: key, emoji: r.emoji, x }]);
        setTimeout(() => setFloatingReactions(prev => prev.filter(f => f.id !== key)), 2400);
      }
    });
    return () => {
      unsubChat();
      unsubReactions();
    };
  }, [activePartyId]);

  // Combine Watch Party chat messages + persistent film comments for CommentSection beneath the player
  const combinedComments = useMemo(() => {
    // Party ids are reused when a host re-hosts the same film; only this session's chat shows.
    const partySince = (party?.party?.createdAt || 0) - 60_000;
    const partyMapped = partyChatMessages.filter((m) => {
      const ts = typeof m.at?.toMillis === 'function' ? m.at.toMillis() : (typeof m.at === 'number' ? m.at : 0);
      return !ts || ts >= partySince;
    }).map((m) => {
      const ts = typeof m.at?.toMillis === 'function' ? m.at.toMillis() : (typeof m.at === 'number' ? m.at : Date.now());
      return {
        id: `party_${m.id}`,
        userId: m.uid,
        userName: m.name || 'Watch Party Guest',
        userPhoto: m.photo || '',
        rating: 5,
        text: m.text,
        comment: m.text,
        timestamp: ts,
      };
    });
    const byId = new Map<string, any>();
    for (const c of [...partyMapped, ...comments]) {
      if (!c?.id) continue;
      byId.set(String(c.id), c);
    }
    return Array.from(byId.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [partyChatMessages, comments, party?.party?.createdAt]);

  // One write per send. CommentSection shows its own optimistic bubble and drops it when the
  // real doc arrives, so no local copy here. The film comment is visible to everyone in the
  // party too (they all listen to the same film), so it is NOT also echoed into party chat,
  // which used to show every comment two or three times.
  const handlePostComment = async (text: string, parentId?: string, mediaTimestamp?: number, media?: CommentMedia) => {
    const clean = (text || '').trim();
    if (!clean && !media?.imageUrl && !media?.videoUrl && !media?.audioUrl && !media?.gifUrl) return;
    if (!auth.currentUser || auth.currentUser.isAnonymous) throw new Error('Sign in to comment');
    if (effectiveItemId) {
      await postVideoComment(effectiveItemId, clean, parentId, undefined, mediaTimestamp, media);
    } else if (activePartyId && clean) {
      await sendPartyChat(activePartyId, clean.slice(0, 300));
    }
  };

  const [resolvedArchiveUrl, setResolvedArchiveUrl] = useState<string>('');
  const [resolvedMuxId, setResolvedMuxId] = useState<string>('');
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(1);

  // Load watchlist status, user clubs, active club parties, film discussions, and resolve Archive/Mux URLs when item changes
  useEffect(() => {
    const itemId = item.id || (item as any).identifier;
    if (itemId) {
      isInWatchlist(itemId).then(setInWatchlist).catch(() => {});
      fetchDiscussionPostsByContentId(itemId).then(setFilmDiscussions).catch(() => {});
    }
    if (auth.currentUser && itemId) {
      fetchUserClubs(auth.currentUser.uid)
        .then(async (clubs) => {
          setUserClubs(clubs);
          if (clubs.length > 0 && !watchPartyClubId) {
            setWatchPartyClubId(clubs[0].id);
          }
          const liveParties = await fetchActiveClubPartiesForContent(itemId, clubs).catch(() => []);
          setActiveClubParties(liveParties);
        })
        .catch(() => {});
    }
    setSelectedSeasonNum(((item as Album).seasons?.[0]?.number) ?? 1);
    setResolvedArchiveUrl('');
    setResolvedMuxId('');

    const candidateId = String((item as any).identifier || item.id || '').replace(/^public_domain_/, '');
    const isNativePlatformUpload =
      /^(album_|vid_|video_)/i.test(candidateId) &&
      (item as any).ownerId !== 'internet-archive' &&
      (item as any).ownerId !== 'plajah-public-domain';

    const rawArchiveId = isNativePlatformUpload
      ? ''
      : (item as any).identifier ||
        ((item as any).ownerId === 'internet-archive' ||
        (item as any).ownerId === 'plajah-public-domain' ||
        String(item.id || '').startsWith('public_domain_')
          ? candidateId
          : '');

    const isPublicDomainFilm =
      !isNativePlatformUpload &&
      (!!rawArchiveId ||
        (item as any).source === 'INTERNET_ARCHIVE' ||
        (item as any).source === 'KOFA' ||
        (item as any).source === 'EUROPEANA' ||
        (item as any).source === 'LIBRARY_OF_CONGRESS' ||
        (item as any).isPublicDomain === true);

    if (!isPublicDomainFilm && !rawArchiveId) return;

    const cleanId = (rawArchiveId || candidateId).trim();
    if (!cleanId) return;

    let alive = true;

    // 1. Check in-memory self-hosted / Mux registry
    hydrateSelfHostedFilmsFromServer().then(() => {
      if (!alive) return;
      const sh = getSelfHostedFilm(cleanId);
      if (sh?.muxPlaybackId) setResolvedMuxId(sh.muxPlaybackId);
      else if (sh?.isAvailable && sh.videoUrl) setResolvedArchiveUrl(sh.videoUrl);
    });

    // 2. Ask server to resolve best playback source & ensure film is hosted on platform + ingested into Mux in background
    fetch('/api/admin/film-ingest/ensure-on-platform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: cleanId,
        title: item.title,
        description: item.description,
        director: (item as any).director || (item as Album).artist,
        year: (item as any).year || (item as Video).movieMetadata?.releaseYear,
        runtime: (item as any).runtime || (item as Video).movieMetadata?.duration,
        genre: (item as any).genre,
        thumbnailUrl: (item as Album).coverImage || (item as Video).thumbnailUrl,
        source: (item as any).source || 'INTERNET_ARCHIVE',
        videoUrl: (item as any).videoUrl || (item as Album).customVideoUrl || (item as Album).tracks?.[0]?.url || (item as Album).tracks?.[0]?.videoUrl,
        sourceUrl: (item as any).sourceUrl,
        rights: (item as any).rights || 'Public Domain',
      }),
    })
      .then(async (r) => {
        if (!alive || !r.ok) return;
        const data = await r.json();
        if (data?.muxPlaybackId) {
          setResolvedMuxId(data.muxPlaybackId);
          registerSelfHostedFilm({
            identifier: cleanId,
            videoUrl: `https://stream.mux.com/${data.muxPlaybackId}.m3u8`,
            muxPlaybackId: data.muxPlaybackId,
            muxAssetId: data.muxAssetId,
            sourceType: 'MUX',
            isAvailable: true,
          });
        } else if (data?.streamUrl) {
          setResolvedArchiveUrl(data.streamUrl);
        }
      })
      .catch(() => {});

    // 3. Also resolve directly from Archive.org metadata when an Archive item exists (either mapped or direct IA item)
    const hasArchiveMapping = !!ARCHIVE_FILM_ITEMS[cleanId];
    const isDirectIaSource =
      hasArchiveMapping ||
      ((item as any).source !== 'KOFA' &&
        (item as any).source !== 'EUROPEANA' &&
        (item as any).source !== 'LIBRARY_OF_CONGRESS');

    if (isDirectIaSource) {
      getArchiveItemFiles(cleanId)
        .then(files => {
          if (!alive) return;
          const url = getBestVideoUrl(cleanId, files);
          if (url) {
            setResolvedArchiveUrl(prev => prev || url);
          }
        })
        .catch(() => {});
    }

    return () => { alive = false; };
  }, [item.id, (item as any).identifier]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWatchlistToggle = async () => {
    setWatchlistLoading(true);
    try {
      const itemId = item.id || (item as any).identifier;
      if (!itemId) return;
      if (inWatchlist) {
        await removeFromWatchlist(itemId);
        setInWatchlist(false);
      } else {
        await addToWatchlist({
          id: itemId,
          identifier: (item as any).identifier,
          title: item.title,
          type: (item as any).type === 'VIDEO' || (item as any).subType ? 'VIDEO' : 'ALBUM',
          thumbnailUrl: (item as Album).coverImage || (item as Video).thumbnailUrl || (item as any).coverImageUrl,
          genre: (item as any).genre || (item as any).subType,
          year: (item as any).year || (item as Video).movieMetadata?.releaseYear?.toString(),
          director: (item as any).director || (item as Album).artist,
        } as any);
        setInWatchlist(true);
      }
    } finally {
      setWatchlistLoading(false);
    }
  };

  const handleScheduleWatchParty = async () => {
    if (!watchPartyClubId || !watchPartyDate) return;
    setWatchPartySubmitting(true);
    try {
      await createClubEvent({
        clubId: watchPartyClubId,
        title: `Watch Party: ${item.title}`,
        description: `Join us to watch "${item.title}" together!`,
        eventType: 'WATCH_PARTY',
        date: new Date(watchPartyDate).getTime(),
        linkedContentId: item.id || (item as any).identifier,
        linkedContentTitle: item.title,
        linkedContentThumb: (item as Album).coverImage || (item as Video).thumbnailUrl,
        isVirtual: true,
        rsvps: [],
      } as any);
      setWatchPartyDone(true);
      setTimeout(() => { setShowWatchWithClub(false); setWatchPartyDone(false); }, 2000);
    } finally {
      setWatchPartySubmitting(false);
    }
  };

  useEffect(() => {
    const worldId = (item as any).worldId;
    // Degrade silently: a film with no worldId simply has no Universe rail.
    if (!worldId) {
      setWorld(null); setWorldCharacters([]); setWorldContent(null);
      setWorldLore([]); setWorldTimeline([]); setOpenLore(null);
      return;
    }
    let alive = true;
    getDoc(doc(db, 'worlds', worldId)).then(s => {
      if (alive && s.exists()) setWorld({ id: s.id, ...s.data() } as IPWorld);
    }).catch(() => {});
    fetchWorldCharacters(worldId).then(c => { if (alive) setWorldCharacters(c); }).catch(() => {});
    fetchWorldContentByWorldId(worldId).then(c => { if (alive) setWorldContent(c); }).catch(() => {});
    fetchWorldLore(worldId).then(l => { if (alive) setWorldLore(l); }).catch(() => {});
    fetchWorldTimeline(worldId).then(t => { if (alive) setWorldTimeline(t); }).catch(() => {});
    return () => { alive = false; };
  }, [item]);

  useEffect(() => {
    const onFsChange = () =>
      setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  useEffect(() => {
    setTheme('DARK');
    const handleScroll = () => {
      if (containerRef.current) setScrolled(containerRef.current.scrollTop > 80);
    };
    const container = containerRef.current;
    container?.addEventListener('scroll', handleScroll);
    return () => {
      container?.removeEventListener('scroll', handleScroll);
      clearMedia();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!propPartyId) {
      setActiveVideo(null);
      setIsUIVisible(true);
    }
    setActiveCharacter(null);
  }, [item.id, (item as any).identifier, propPartyId]);

  const isTV = (item as any).type === 'VIDEO' && (item as any).subType === 'TV_SERIES';
  const isPaywalled = !!(item as Video).isPaywalled;

  const title = item.title;
  // cleanDescription drops the legacy generated filler, so a film stamped with it shows the
  // empty state (and, for the owner, an invitation to write the real synopsis) instead.
  const description = cleanDescription(item.description);

  // ── Owner-editable synopsis ────────────────────────────────────────────────
  const [descOverride, setDescOverride] = useState<string | null>(null);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);
  const shownDescription = descOverride ?? description;
  const coverImage = (item as Album).coverImage || (item as Video).coverImageUrl || (item as Video).thumbnailUrl;
  const artist = (item as Album).artist || (item as Video).artist;
  const ownerId = (item as Album).ownerId || (item as Video).ownerId;
  const isOwner = !!(currentUser?.uid && currentUser.uid === ownerId);
  const filmLookupId = String((item as any).identifier || item.id || '').replace(/^public_domain_/, '');
  const isPumpkinPatch =
    filmLookupId === 'album_1787881859314_mlt23' ||
    item.id === 'album_1787881859314_mlt23' ||
    /pumpkin\s*patch/i.test(title || '');
  const hasCuratedStoryIntel = !!getHalloweenStoryIntelBundle(filmLookupId) || !!getHalloweenStoryIntelBundle(item.id);
  const canAccessStoryIntel = canAccessStoryIntelTools(ownerId, currentUser as any) || hasCuratedStoryIntel;
  const castMembers = (item as Video).movieMetadata?.castMembers || [];
  const releaseYear = isPumpkinPatch
    ? 2025
    : (item as Video).movieMetadata?.releaseYear || (item as any).year;

  // Drop a previous title's edit when the page swaps titles.
  useEffect(() => { setDescOverride(null); setEditingDesc(false); }, [item.id]);

  const saveDescription = async () => {
    const next = descDraft.trim();
    if (next === (shownDescription || '').trim()) { setEditingDesc(false); return; }
    setSavingDesc(true);
    try {
      const asAlbum = await getDoc(doc(db, 'albums', item.id));
      if (asAlbum.exists()) await updateAlbum(item.id, { description: next });
      else await updateVideo(item.id, { description: next });
      setDescOverride(next);
      setEditingDesc(false);
    } catch (e) {
      alert('Could not save the synopsis. Check your connection and try again.');
    } finally {
      setSavingDesc(false);
    }
  };

  // ── Buy-to-own gate (Taleo) ────────────────────────────────────────────────
  const filmDist = filmDistributionOf(item as any);
  const filmOffer = filmOffers(filmDist);
  const filmBuyPrice = filmOffer.buy?.price ?? 0;
  const filmRentPrice = filmOffer.rent?.price ?? 0;
  const isPaidFilm = filmBuyPrice > 0 || filmRentPrice > 0;
  const filmOwnership = useOwnership('film', item.id, currentUser?.uid);
  const hasFilmAccess = isOwner || !isPaidFilm || filmOwnership.owned;

  // ── Taleo Story Intelligence (creator + curated Halloween & classic films) ──
  const [storyIntelJob, setStoryIntelJob] = useState<TaleoAnalysisJob | null>(null);
  const [showStoryIntel, setShowStoryIntel] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  useEffect(() => {
    const targetId = filmLookupId || item.id;
    if (!canAccessStoryIntel || !targetId) { setStoryIntelJob(null); return; }
    return watchAnalysisJob(targetId, setStoryIntelJob);
  }, [canAccessStoryIntel, filmLookupId, item.id]);

  // More-like-this films (shared by the page row and the end-of-film suggestions).
  const relatedFilms = useRelatedFilms(item as any, 12);

  /** Build the playable Video payload for the current item without side effects. */
  const buildPlaybackPayload = useCallback((): Video | null => {
    const album = item as Album;
    const vid = item as Video;
    let payload: Video | null = null;

    const cleanId = String((item as any).identifier || item.id || '').replace(/^public_domain_/, '');
    const selfHosted = getSelfHostedFilm(cleanId);
    const effectiveMuxId =
      resolvedMuxId ||
      selfHosted?.muxPlaybackId ||
      (item as any).muxPlaybackId ||
      album.tracks?.[0]?.muxPlaybackId;

    const isArchiveSource =
      (item as any).source === 'KOFA' ||
      (item as any).source === 'EUROPEANA' ||
      (item as any).source === 'LIBRARY_OF_CONGRESS' ||
      (item as any).ownerId === 'korean-film-archive' ||
      (item as any).ownerId === 'kofa' ||
      (item as any).ownerId === 'europeana' ||
      (item as any).ownerId === 'library-of-congress';

    if (effectiveMuxId && !isTV) {
      payload = {
        ...vid,
        id: (item as any).identifier || item.id,
        ownerId: album.ownerId || vid.ownerId || 'plajah-public-domain',
        title: item.title,
        muxPlaybackId: effectiveMuxId,
        url: `https://stream.mux.com/${effectiveMuxId}.m3u8`,
        artist: album.artist || vid.artist || (item as any).director || '',
        timestamp: album.createdAt || vid.timestamp || Date.now(),
        description: cleanDescription(item.description),
        thumbnailUrl: album.coverImage || vid.thumbnailUrl || (item as any).coverImageUrl,
        genre: album.genre || vid.genre,
        subType: 'MOVIE',
      } as Video;
    } else if (isArchiveSource) {
      const directCandidate =
        resolvedArchiveUrl ||
        (selfHosted?.isAvailable ? selfHosted.videoUrl : '') ||
        '';
      const rawStreamUrl =
        directCandidate ||
        (item as any).videoUrl ||
        (item as any).embedUrl ||
        album.tracks?.[0]?.url ||
        album.tracks?.[0]?.videoUrl ||
        album.customVideoUrl ||
        (vid as any).url ||
        '';
      const rawFallbackEmbed = (item as any).embedUrl || (item as any).videoUrl || rawStreamUrl;
      let embedUrl = rawFallbackEmbed;
      if (rawFallbackEmbed.includes('youtube.com') || rawFallbackEmbed.includes('youtu.be') || rawFallbackEmbed.includes('youtube-nocookie.com')) {
        const match = rawFallbackEmbed.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*)/);
        const ytId = match && match[1].length === 11 ? match[1] : '';
        const originParam = typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : '';
        if (ytId) embedUrl = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&enablejsapi=1${originParam}`;
      }
      const isDirect =
        rawStreamUrl.startsWith('/api/') ||
        /\.(mp4|mpeg4|m4v|m3u8|webm|ogv)(\?|$)/i.test(rawStreamUrl);
      const isKofa = (item as any).source === 'KOFA' || (item as any).ownerId === 'korean-film-archive' || (item as any).ownerId === 'kofa';
      const isEuro = (item as any).source === 'EUROPEANA' || (item as any).ownerId === 'europeana';
      const owner = isKofa ? 'korean-film-archive' : isEuro ? 'europeana' : 'library-of-congress';
      const artistName = album.artist || (isKofa ? 'Korean Film Archive (KOFA)' : isEuro ? 'Europeana Film Heritage' : 'Library of Congress');
      const genreName = album.genre || (isKofa ? 'Korean Classic Cinema' : 'European Cinema');

      payload = {
        id: (item as any).identifier || item.id,
        ownerId: owner,
        title: item.title,
        url: isDirect ? rawStreamUrl : '',
        embedUrl,
        artist: artistName,
        timestamp: album.createdAt || Date.now(),
        description: cleanDescription(album.description),
        thumbnailUrl: album.coverImage || (item as any).thumbnailUrl,
        genre: genreName,
        subType: 'MOVIE',
        sourceUrl: (item as any).sourceUrl,
      } as any;
    } else if ((item as any).ownerId === 'internet-archive' || (item as any).identifier || String(item.id || '').startsWith('public_domain_')) {
      const trackUrl =
        resolvedArchiveUrl ||
        (selfHosted?.isAvailable ? selfHosted.videoUrl : '') ||
        (item as any).videoUrl ||
        album.customVideoUrl ||
        album.tracks?.[0]?.url ||
        album.tracks?.[0]?.videoUrl ||
        '';
      const archiveId = ARCHIVE_FILM_ITEMS[cleanId]
        || (trackUrl.includes('/download/')
          ? trackUrl.slice(trackUrl.indexOf('/download/') + 10).split('/')[0]
          : cleanId);
      payload = {
        id: (item as any).identifier || item.id,
        ownerId: 'internet-archive',
        title: item.title,
        url: trackUrl,
        muxPlaybackId: effectiveMuxId,
        embedUrl: `https://archive.org/embed/${archiveId}?autoplay=1`,
        artist: album.artist || (item as any).director || (item as any).creator || '',
        timestamp: album.createdAt || Date.now(),
        description: cleanDescription(album.description),
        thumbnailUrl: album.coverImage || (item as any).thumbnailUrl,
        genre: album.genre || (item as any).genre,
        subType: 'MOVIE',
      } as Video;
    } else if (vid.url || vid.embedUrl) {
      payload = vid;
    } else if (vid.id && !(item as any).tracks && (item as any).ownerId !== 'internet-archive') {
      payload = vid;
    } else if (isTV) {
      if (album.seasons?.[0]?.episodes?.[0]) {
        payload = album.seasons[0].episodes[0] as Video;
      } else if (album.tracks?.[0]?.muxPlaybackId || album.tracks?.[0]?.muxUploadId || album.tracks?.[0]?.url || album.tracks?.[0]?.videoUrl) {
        payload = {
          id: album.id, ownerId: album.ownerId || 'system', title: album.title,
          url: album.tracks[0].url || album.tracks[0].videoUrl || '', muxPlaybackId: album.tracks[0].muxPlaybackId,
          artist: album.artist, timestamp: album.createdAt || Date.now(),
        } as Video;
      } else if (album.customVideoUrl) {
        payload = {
          id: album.id, ownerId: album.ownerId || 'system', title: album.title,
          url: album.customVideoUrl, artist: album.artist, timestamp: album.createdAt || Date.now(),
        } as Video;
      }
    } else if (album.tracks?.[0]?.muxPlaybackId || album.tracks?.[0]?.muxUploadId || album.tracks?.[0]?.url || album.tracks?.[0]?.videoUrl) {
      const t0 = album.tracks[0];
      const trackUrl = resolvedArchiveUrl || t0.url || t0.videoUrl || '';
      const isArchive = trackUrl.includes('archive.org') &&
        album.ownerId !== 'korean-film-archive' &&
        album.ownerId !== 'kofa' &&
        album.ownerId !== 'europeana';
      const archiveId = isArchive && trackUrl.includes('/download/')
        ? trackUrl.slice(trackUrl.indexOf('/download/') + 10).split('/')[0] : '';
      payload = {
        id: album.id, ownerId: album.ownerId || 'system', title: album.title,
        url: trackUrl,
        muxPlaybackId: effectiveMuxId || t0.muxPlaybackId,
        embedUrl: archiveId ? `https://archive.org/embed/${archiveId}?autoplay=1` : undefined,
        artist: album.artist, timestamp: album.createdAt || Date.now(),
        description: cleanDescription(album.description), thumbnailUrl: album.coverImage,
        genre: album.genre, movieMetadata: album.movieMetadata, subType: 'MOVIE',
      } as Video;
    } else if (album.customVideoUrl) {
      payload = {
        id: item.id, ownerId: album.ownerId || 'system', title: item.title,
        url: album.customVideoUrl, artist: album.artist, timestamp: album.createdAt || Date.now(),
      } as Video;
    }
    return payload;
  }, [item, resolvedArchiveUrl, resolvedMuxId, isTV]);

  // Keep activeVideo in sync when resolvedArchiveUrl or resolvedMuxId arrives after the user presses Watch Now
  useEffect(() => {
    if (!activeVideo) return;
    if (!resolvedArchiveUrl && !resolvedMuxId) return;
    const updated = buildPlaybackPayload();
    if (updated && (updated.muxPlaybackId !== activeVideo.muxPlaybackId || (updated.url && updated.url !== activeVideo.url))) {
      primaryPayloadRef.current = updated;
      setActiveVideo(updated);
    }
  }, [resolvedArchiveUrl, resolvedMuxId, activeVideo, buildPlaybackPayload]);

  // Opened from somewhere that asked to play on arrival (a Ravencrest billboard): press Watch Now
  // for the viewer as soon as there is something to play.
  const autoplayPending = useRef(consumeAutoplay());
  useEffect(() => {
    if (!autoplayPending.current || !hasFilmAccess || activeVideo || prerollFor) return;
    if (!buildPlaybackPayload()) return;
    autoplayPending.current = false;
    handlePlay();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlay = () => {
    if (!hasFilmAccess) { setIsUIVisible(true); return; }
    const payload = buildPlaybackPayload();
    if (payload) {
      // Skip studio ident when already inside a Watch Party so viewers sync immediately
      if (activePartyId) beginPlayback(payload);
      else setPrerollFor(payload);
    } else {
      setIsUIVisible(true);
    }
  };

  /** Start the feature. Called once the ident clears (or immediately if there isn't one). */
  const beginPlayback = useCallback((payload: Video) => {
    primaryPayloadRef.current = payload;
    setActiveVersionId('primary');
    setActiveVideo(payload);
    setIsUIVisible(false);
    activateVideoSource(payload);

    // If playing through Universal Player or an embed iframe (KOFA YouTube / Europeana),
    // CinemaPlayer's <video> timeupdate won't fire, so seed Continue Watching progress now.
    const isEmbedOnly = !payload.url && !payload.muxPlaybackId && !!payload.embedUrl;
    if ((useUniversalPlayer || isEmbedOnly) && payload.id) {
      const existingPos = getResumePosition(payload.id);
      if (existingPos <= 5) {
        recordProgress({
          id: payload.id,
          kind: 'TALEO',
          title: payload.title || item.title,
          thumbnailUrl: coverImage || payload.thumbnailUrl || undefined,
          ownerName: payload.artist || artist || undefined,
          positionSec: 60,
          durationSec: 5400,
          genre: payload.genre || (item as any).genre,
          creatorId: payload.ownerId || ownerId,
        }).catch(() => {});
      }
    }
  }, [activateVideoSource, useUniversalPlayer, item, coverImage, artist, ownerId]);

  // Auto-pop-up the player whenever a user joins or opens a Watch Party (via shared link or Club auto-sync)
  useEffect(() => {
    if (!activePartyId || !hasFilmAccess) return;
    const payload = buildPlaybackPayload();
    if (payload && (!activeVideo || ( !activeVideo.url && payload.url ))) {
      setPrerollFor(null);
      beginPlayback(payload);
    }
  }, [activePartyId, hasFilmAccess, buildPlaybackPayload, activeVideo, beginPlayback]);

  const copyAndSharePartyLink = async (pid: string, clubName?: string) => {
    const url = partyShareUrl(pid);
    try { await navigator.clipboard?.writeText(url); } catch {}
    partyToast(
      clubName
        ? `${clubName} Watch Party is live! Share link copied — members can also click "Watch with Club" to auto-sync.`
        : 'Watch Party live! Share link copied — anyone who opens it will automatically sync with you.',
      'ok',
    );
  };

  const handleStartWatchParty = async () => {
    if (!auth.currentUser) {
      partyToast('Sign in to host a Watch Party', 'info');
      loginWithGoogle();
      return;
    }
    if (!hasFilmAccess) { setIsUIVisible(true); return; }
    setStartingWatchParty(true);
    try {
      const contentId = item.id || (item as any).identifier;
      const pos = videoRef.current && Number.isFinite(videoRef.current.currentTime) ? videoRef.current.currentTime : 0;
      const pid = await createParty({
        kind: 'WATCH',
        content: {
          type: 'MOVIE',
          id: contentId,
          title: item.title,
          thumbnail: coverImage || undefined,
        },
        initial: {
          isPlaying: true,
          positionSec: pos,
          contentId,
        },
        visibility: 'public',
      });
      setActivePartyId(pid);
      const payload = buildPlaybackPayload();
      if (payload) {
        setPrerollFor(null);
        beginPlayback(payload);
      }
      await copyAndSharePartyLink(pid);
    } catch {
      partyToast('Could not start Watch Party — check your connection and try again', 'warn');
    } finally {
      setStartingWatchParty(false);
    }
  };

  const handleStartClubWatchPartyNow = async (club: Club) => {
    if (!auth.currentUser) {
      loginWithGoogle();
      return;
    }
    if (!hasFilmAccess) { setIsUIVisible(true); return; }
    setWatchPartySubmitting(true);
    try {
      const contentId = item.id || (item as any).identifier;
      const pos = videoRef.current && Number.isFinite(videoRef.current.currentTime) ? videoRef.current.currentTime : 0;
      const pid = await createParty({
        kind: 'WATCH',
        content: {
          type: 'MOVIE',
          id: contentId,
          title: item.title,
          thumbnail: coverImage || undefined,
        },
        initial: {
          isPlaying: true,
          positionSec: pos,
          contentId,
        },
        visibility: 'public',
        clubId: club.id,
        clubName: club.name,
        clubIcon: club.iconImage || undefined,
      });
      setShowWatchWithClub(false);
      setActivePartyId(pid);
      const payload = buildPlaybackPayload();
      if (payload) {
        setPrerollFor(null);
        beginPlayback(payload);
      }
      await copyAndSharePartyLink(pid, club.name);
    } catch {
      partyToast('Could not start Club Watch Party — please try again', 'warn');
    } finally {
      setWatchPartySubmitting(false);
    }
  };

  const handleJoinClubParty = (clubParty: Party) => {
    setShowWatchWithClub(false);
    setActivePartyId(clubParty.id);
    const payload = buildPlaybackPayload();
    if (payload) {
      setPrerollFor(null);
      beginPlayback(payload);
    }
    partyToast(
      `Synced with ${clubParty.clubName || 'Club'} Watch Party · Hosted by ${clubParty.hostName || 'Host'}`,
      'ok',
    );
  };

  /**
   * Clicking "Watch with Club":
   * - Checks all clubs the user is a member of to see if any are currently watching this title.
   * - If 1 club is watching → auto-syncs immediately with that club's Watch Party!
   * - If >1 clubs are watching → opens the Club chooser modal asking which club they want to join.
   * - If 0 clubs are watching → opens the modal so they can start a live Club Watch Party now or schedule one.
   */
  const handleWatchWithClubClick = async () => {
    if (!auth.currentUser) {
      partyToast('Sign in to watch with your club', 'info');
      loginWithGoogle();
      return;
    }
    const contentId = item.id || (item as any).identifier;
    setCheckingClubParties(true);
    try {
      let clubs = userClubs;
      if (clubs.length === 0) {
        clubs = await fetchUserClubs(auth.currentUser.uid).catch(() => []);
        setUserClubs(clubs);
        if (clubs.length > 0 && !watchPartyClubId) setWatchPartyClubId(clubs[0].id);
      }
      const liveClubParties = await fetchActiveClubPartiesForContent(contentId, clubs).catch(() => []);
      setActiveClubParties(liveClubParties);

      if (liveClubParties.length === 1) {
        // Auto-sync immediately with the single club watching this title!
        handleJoinClubParty(liveClubParties[0]);
        return;
      }
      if (liveClubParties.length > 1) {
        // More than one club is watching the same thing — ask which club they want to join!
        setClubModalMode('CHOOSE_ACTIVE_CLUB');
        setShowWatchWithClub(true);
        return;
      }
      // No club is currently watching — let the user start a live Club Watch Party now or schedule one
      setClubModalMode('START_OR_SCHEDULE');
      if (clubs.length > 0 && !watchPartyClubId) setWatchPartyClubId(clubs[0].id);
      setShowWatchWithClub(true);
    } finally {
      setCheckingClubParties(false);
    }
  };

  // Switch the playing cut. 'primary' restores the main film; an alternate swaps to its
  // uploaded file (direct URL — clears mux/embed so the player streams it directly).
  const playVersion = (id: string, url?: string) => {
    const base = primaryPayloadRef.current;
    if (!base) return;
    setActiveVersionId(id);
    setActiveVideo(id === 'primary' || !url
      ? base
      : ({ ...base, url, muxPlaybackId: undefined, embedUrl: undefined, id: `${item.id}:${id}` } as Video));
  };

  const handleWhatIfParticipation = (branchId: string, _choiceId: string) => {
    if (!whatIfAchieved) {
      setWhatIfAchieved(true);
      setTimeout(() => setWhatIfAchieved(false), 4500);
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      videoContainerRef.current?.requestFullscreen?.();
    }
  };

  // Leave the player and return to the title's detail page (also exits fullscreen).
  const exitPlayer = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    setIsUIVisible(true);
    setActiveVideo(null);
  }, []);

  // Back / Esc reliably close the player, including on a TV remote. Three routes converge on
  // exitPlayer: browser Escape (once out of element fullscreen), the Android/Tizen Back key
  // (capture phase, so it beats TVNavigationLayer's fall-through to history.back()), and the
  // plajah:hardware-back event TVNavigationLayer dispatches for the remote's Back button. Before,
  // only bubble-phase Escape was handled, so a remote Back popped the whole MOVIE_UX view instead
  // of just the player — the "unreliable / hard to get out of fullscreen" report.
  useEffect(() => {
    if (!activeVideo) return;
    const leave = () => {
      if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
      exitPlayer();
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;
      const isField = (el: HTMLElement | null) =>
        !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || el.closest?.('input, textarea, select, [contenteditable="true"]')));
      if (isField(target) || isField(active)) return;

      const kc = e.keyCode || e.which;
      const isBack = kc === 4 || e.key === 'Backspace' || e.key === 'XF86Back' || e.key === 'GoBack';
      if (isBack || e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); leave(); }
    };
    const onHardwareBack = (e: Event) => { e.preventDefault(); leave(); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('plajah:hardware-back', onHardwareBack);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('plajah:hardware-back', onHardwareBack);
    };
  }, [activeVideo, exitPlayer]);

  // End-of-film suggestions: next episode first (series), then more-like-this.
  const upNextConfig = useMemo(() => {
    const toItem = (v: any, subtitle: string, play: () => void) => ({
      id: String(v.id), title: v.title, subtitle, thumbnailUrl: filmArt(v), onPlay: play,
    });
    const items: Array<ReturnType<typeof toItem>> = [];
    const eps: Video[] = ((item as Album).seasons || []).flatMap(s => s.episodes || []);
    const idx = activeVideo ? eps.findIndex(e => e.id === activeVideo.id) : -1;
    if (idx >= 0 && idx + 1 < eps.length) {
      const ne = eps[idx + 1];
      items.push(toItem(ne, `Next episode${ne.episodeNumber ? ` · E${ne.episodeNumber}` : ''}`, () => setActiveVideo(ne)));
    }
    for (const r of relatedFilms) {
      if (items.length >= 4) break;
      items.push(toItem(r, 'More like this', () => { exitPlayer(); onOpenItem?.(r as any); }));
    }
    return items.length ? { items, onTimeoutExit: exitPlayer } : undefined;
  }, [item, activeVideo, relatedFilms, exitPlayer, onOpenItem]);

  // ── Next-episode autoplay (TV series) ─────────────────────────────────────
  const [autoplayNextEp, setAutoplayNextEp] = useState(true);
  const [upNextEpIn, setUpNextEpIn] = useState<number | null>(null);
  const allEpisodes: Video[] = ((item as Album).seasons || []).flatMap(s => s.episodes || []);
  const nextEpisode = (() => {
    if (!activeVideo || allEpisodes.length < 2) return null;
    const idx = allEpisodes.findIndex(e => e.id === activeVideo.id);
    return idx >= 0 && idx + 1 < allEpisodes.length ? allEpisodes[idx + 1] : null;
  })();

  const playNextEpisode = useCallback(() => {
    if (nextEpisode) { setUpNextEpIn(null); setActiveVideo(nextEpisode); }
  }, [nextEpisode]);

  const handleEpisodeEnded = useCallback(() => {
    // A series with a next episode offers the up-next countdown; anything else (a film, or the
    // last episode) returns to the detail page rather than freezing on the final frame — which,
    // on a TV with the chrome now hidden, is a dead end with no obvious way out.
    if (autoplayNextEp && nextEpisode) setUpNextEpIn(8);
    else exitPlayer();
  }, [autoplayNextEp, nextEpisode, exitPlayer]);

  useEffect(() => {
    if (upNextEpIn === null) return;
    if (upNextEpIn <= 0) { playNextEpisode(); return; }
    const t = setTimeout(() => setUpNextEpIn(n => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [upNextEpIn, playNextEpisode]);
  useEffect(() => { setUpNextEpIn(null); }, [activeVideo?.id]);

  // ── Detail page: maturity rating (from data), match %, thumbs rating ──────
  const maturity = (item as any).contentRating || (item as any).filmDistribution?.contentRating || (item as any).movieMetadata?.maturityRating || 'NR';

  // Real audience numbers, live from publicStats. Two things used to sit here instead:
  //
  //   - a "% Match" computed as `68 + (sum of the title's char codes) % 31`. It looked like a
  //     personalization score and was a hash of the title — the same for every viewer, unrelated
  //     to anything they had ever watched. There is no film taste model to back one (tasteService
  //     is music-only), so the badge is gone rather than faked.
  //   - a hardcoded `9.8` star rating, identical on every title on the platform.
  //
  // What replaces them is the thumbs tally the buttons below already collect, shown only once
  // somebody has actually voted.
  const [publicStats, setPublicStats] = useState<PublicStats | null>(null);
  useEffect(() => subscribePublicStats(item.id, setPublicStats), [item.id]);
  const audienceScore = positiveShare(publicStats);

  // Personal "% Match", from services/videoTasteService. Null — and therefore no badge — until
  // this viewer has enough watch/reaction history to say anything, and until this title shares a
  // facet with it. Recomputed when they rate something, since that changes the vector.
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [tasteEpoch, setTasteEpoch] = useState(0);
  useEffect(() => {
    let cancelled = false;
    matchScoreFor(item as any).then(m => { if (!cancelled) setMatch(m); });
    return () => { cancelled = true; };
  }, [item.id, tasteEpoch]);

  const [myRating, setMyRating] = useState<'UP' | 'DOWN' | null>(null);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setMyRating(null); return; }
    return onSnapshot(doc(db, 'users', uid, 'titleRatings', item.id), snap => setMyRating(snap.exists() ? (snap.data() as any).rating : null));
  }, [item.id]);
  const rate = async (r: 'UP' | 'DOWN') => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const next = myRating === r ? null : r;      // pressing the lit thumb retracts the vote
    const ref = doc(db, 'users', uid, 'titleRatings', item.id);
    // The viewer's own doc drives the button's lit/unlit state; the server call is what moves the
    // PUBLIC tally. It dedupes against this viewer's previous vote, so retracting or switching
    // sides adjusts the score instead of inflating it.
    if (next === null) await deleteDoc(ref).catch(() => {});
    else await setDoc(ref, { rating: next, titleId: item.id, title: (item as any).title || '', at: Date.now() }).catch(() => {});
    void submitRating(item.id, 'film', next);
    // Same press, third destination: the personal taste vector behind the % Match badge. Stored
    // with this title's facets so the vector learns what KIND of thing was rated, not just that
    // something was. Awaited so the badge below refreshes against the new vector.
    await setVideoReaction(item as any, next);
    setTasteEpoch(n => n + 1);
  };

  const worldVideos = (worldContent?.videos || []).filter(v => v.id !== item.id).slice(0, 6);
  const worldAlbums = (worldContent?.albums || []).filter(a => a.id !== item.id).slice(0, 4);
  const hasWorldContent = worldVideos.length > 0 || worldAlbums.length > 0;

  // Universe rail (Blueprint 2D). Only renders when the film is actually tied to a world.
  const railLore = worldLore.filter(l => !l.discarded).slice(0, 6);
  const railTimeline = [...worldTimeline].sort((a, b) => (a.year || 0) - (b.year || 0)).slice(0, 12);
  const hasUniverseRail = !!(item as any).worldId && !!world && (railLore.length > 0 || railTimeline.length > 0);
  const timelineUnit = world?.timelineConfig?.unitName || '';
  const SIGNIFICANCE_COLOR: Record<string, string> = { PIVOTAL: '#FFB68D', MAJOR: '#D0BCFF', MINOR: 'rgba(255,255,255,0.25)' };

  return (
    <>
      {/* ── Studio ident, in front of the feature ────────────────────────────────
          Mounted only once Watch Now has been pressed and the licence gate has
          passed, so it always precedes something the viewer is actually about to
          watch. onError inside the player also calls onDone, so a missing or
          broken ident can never block playback. */}
      {prerollFor && (
        <PlatformBumperPlayer
          kind="TALEO_PREROLL"
          asset={prerollIdent}
          allowSkip
          onDone={() => { const p = prerollFor; setPrerollFor(null); beginPlayback(p); }}
        />
      )}
      {/* ── Character World View overlay ─────────────────────────────────────── */}
      <AnimatePresence>
        {activeCharacter && (
          <motion.div
            key="char-world"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.3 }}
          >
            <CharacterWorldView
              character={activeCharacter}
              world={world}
              worldContent={worldContent}
              onBack={() => setActiveCharacter(null)}
              currentUser={currentUser}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Video player — portalled to <body> ────────────────────────────────
          z-[200] alone is not enough. `position: fixed` is resolved against the nearest
          ancestor with a transform, and this view sits inside animated wrappers — so the
          player was being contained instead of covering the viewport, leaving the TV top
          tabs and page chrome visible around a playing film. A portal has no such ancestor. */}
      {activeVideo && createPortal(
        activePartyId ? (
          <div className="fixed inset-0 z-[200] bg-[#06060C] text-white overflow-y-auto custom-scrollbar" data-tv-no-trap
            style={partyChatOpen ? { paddingRight: 'min(340px, 100vw)' } : undefined}>
            {partyChatOpen && (
              <PartyChatPanel
                partyId={activePartyId}
                party={party}
                since={party.party?.createdAt || 0}
                layout="side"
                getMoment={() => ({ trackId: party.playback?.contentId, atSec: videoRef.current?.currentTime ?? party.getTarget().targetPositionSec })}
                onClose={() => setPartyChatOpen(false)}
              />
            )}
            {/* Top Watch Party Header Bar */}
            <div className="sticky top-0 z-40 bg-[#06060C]/90 backdrop-blur-xl border-b border-white/10 px-4 sm:px-8 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={exitPlayer}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-xs font-black uppercase tracking-widest text-white transition-all shrink-0"
                  title="Return to Film Details"
                >
                  <ArrowLeft size={15} /> Details
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FF6B00]/20 border border-[#FF6B00]/40 text-[#FF8C00] text-[10px] font-black uppercase tracking-widest">
                      <span className="w-2 h-2 rounded-full bg-[#FF6B00] animate-ping" />
                      {party.party?.clubName ? `Club Watch Party · ${party.party.clubName}` : 'Live Watch Party'}
                    </span>
                    <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-white truncate">
                      {activeVideo.title || title}
                    </h2>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setPartyChatOpen(o => !o)}
                  aria-pressed={partyChatOpen}
                  className={`h-9 px-3.5 rounded-full border text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all ${partyChatOpen ? 'bg-white/20 border-white/30 text-white' : 'bg-white/[0.08] hover:bg-white/[0.15] border-white/10 text-white/80'}`}
                >
                  <MessageCircle size={13} /> Chat
                </button>
                <button
                  onClick={() => copyAndSharePartyLink(activePartyId, party.party?.clubName)}
                  className="h-9 px-4 rounded-full bg-[#D0BCFF] hover:bg-[#E8DAFF] text-[#1C1B1F] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-md"
                >
                  <Link2 size={13} /> Share Watch Party Link
                </button>
                {party.isHost ? (
                  <button
                    onClick={() => {
                      party.end();
                      setActivePartyId(null);
                      onLeaveParty?.();
                      partyToast('Watch Party ended', 'info');
                    }}
                    className="h-9 px-3.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    End Party
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setActivePartyId(null);
                      onLeaveParty?.();
                      partyToast('Left Watch Party — you now have independent playback control', 'info');
                    }}
                    className="h-9 px-3.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white/75 text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Leave Party
                  </button>
                )}
              </div>
            </div>

            {/* Main Theater Column: 1. Popped-Up Player -> 2. Watch Party UI (Watching Count + Joined People) -> 3. Comment Section Beneath */}
            <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-4 pb-20 space-y-5">
              {/* 1. Popped-Up Synced Video Player */}
              <div
                ref={videoContainerRef}
                className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.9)] border border-white/15"
              >
                <CinemaPlayer
                  key={activeVideo.id || activeVideo.url}
                  video={activeVideo}
                  poster={coverImage || undefined}
                  onVideoRef={el => { setVideoElement(el); if (el) videoRef.current = el; }}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={getPlatformInfo().isTV ? undefined : toggleFullscreen}
                  onWhatIfParticipation={handleWhatIfParticipation}
                  onEnded={handleEpisodeEnded}
                  onBack={exitPlayer}
                  party={party}
                  resyncSignal={resyncSignal}
                />

                {/* Floating Emoji Reactions */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden z-30">
                  {floatingReactions.map(f => (
                    <div
                      key={f.id}
                      style={{ left: `${f.x}%` }}
                      className="absolute bottom-16 text-3xl animate-bounce drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
                    >
                      {f.emoji}
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Watch Party UI Directly Below the Player: Amount of People Watching Along + Joined People Below */}
              <div className="rounded-3xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-2xl border border-white/12 p-5 sm:p-6 space-y-5 shadow-2xl">
                {/* Top Status Bar: Amount of people watching along + Host sync status + Reactions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Amount of people watching along */}
                    <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <Users size={16} className="text-emerald-300" />
                      <span className="text-xs font-black uppercase tracking-wider">
                        {party.viewerCount} {party.viewerCount === 1 ? 'person' : 'people'} watching along
                      </span>
                    </div>

                    {/* Host Sync Status Badge */}
                    {party.isHost ? (
                      <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-black uppercase tracking-wider">
                        <Crown size={14} className="text-amber-400" />
                        Hosting · Everyone stays synced to your playback
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#D0BCFF]/15 border border-[#D0BCFF]/35 text-[#D0BCFF] text-xs font-black uppercase tracking-wider">
                        <Radio size={14} className="text-[#D0BCFF] animate-pulse" />
                        <span>
                          Synced to Host: <strong className="text-white">{party.party?.hostName || 'Host'}</strong>
                        </span>
                        <button
                          onClick={() => {
                            setResyncSignal(s => s + 1);
                            partyToast(`Resynced playback to ${party.party?.hostName || 'Host'}`, 'ok');
                          }}
                          className="ml-1 px-2.5 py-0.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1 transition-all"
                          title="Snap playback to the host's exact timestamp"
                        >
                          <RefreshCw size={11} /> Resync
                        </button>
                      </div>
                    )}

                    {/* Club Badge if watching with a club */}
                    {party.party?.clubName && (
                      <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/[0.07] border border-white/15 text-white/90 text-xs font-black uppercase tracking-wider">
                        {party.party.clubIcon ? (
                          <img src={party.party.clubIcon} alt="" className="w-4 h-4 rounded-full object-cover" />
                        ) : (
                          <Users size={13} className="text-[#FFB68D]" />
                        )}
                        <span>Club: {party.party.clubName}</span>
                      </div>
                    )}
                  </div>

                  {/* Quick Emoji Reactions */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40 mr-1">React:</span>
                    {PARTY_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => {
                          if (!auth.currentUser) {
                            partyToast('Sign in to send reactions', 'info');
                            return;
                          }
                          sendPartyReaction(activePartyId, emoji).catch(() => {});
                        }}
                        className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.16] active:scale-125 border border-white/10 flex items-center justify-center text-base transition-all"
                        title={`Send ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Joined People Below */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50 flex items-center gap-2">
                      <Users size={13} className="text-[#D0BCFF]" />
                      Joined People ({party.people.length})
                    </p>
                    <p className="text-[10px] text-white/40 font-bold">
                      {party.playback?.isPlaying ? '▶ Host is playing' : '⏸ Host paused'} · {formatTime(party.playback?.positionSec || 0)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    {party.people.map(person => {
                      const isPersonHost = person.uid === party.party?.hostId;
                      const isMe = person.uid === (currentUser?.uid || auth.currentUser?.uid);
                      return (
                        <div
                          key={person.uid}
                          onClick={() => person.uid && onVisitUser(person.uid)}
                          className={`group flex items-center gap-2.5 pl-2 pr-3.5 py-1.5 rounded-full border transition-all cursor-pointer ${
                            isPersonHost
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                              : 'bg-white/[0.05] hover:bg-white/[0.10] border-white/10 text-white/85'
                          }`}
                        >
                          <div className="relative w-7 h-7 rounded-full overflow-hidden bg-white/15 shrink-0 border border-white/20">
                            {person.photo ? (
                              <img src={person.photo} alt={person.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[11px] font-black text-white">
                                {(person.name || 'G')[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-black" />
                          </div>
                          <span className="text-xs font-black tracking-tight truncate max-w-[140px]">
                            {person.name || 'Viewer'}
                          </span>
                          {isPersonHost && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[9px] font-black uppercase tracking-widest">
                              <Crown size={10} /> Host
                            </span>
                          )}
                          {isMe && !isPersonHost && (
                            <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-white/60 text-[9px] font-black uppercase tracking-widest">
                              You
                            </span>
                          )}
                          {party.isHost && !isPersonHost && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                party.passRemote(person);
                                partyToast(`Passed host controls to ${person.name}`, 'ok');
                              }}
                              className="opacity-0 group-hover:opacity-100 ml-1 px-2 py-0.5 rounded-full bg-white/15 hover:bg-white/25 text-[9px] font-black uppercase tracking-widest text-white transition-all"
                              title={`Pass host remote to ${person.name}`}
                            >
                              Make Host
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 3. Comment Section Beneath the Watch Party UI */}
              <div className="rounded-3xl bg-white/[0.04] backdrop-blur-xl border border-white/10 p-5 sm:p-7 space-y-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="border-l-2 border-[#D0BCFF] pl-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-1">
                      Live Watch Party &amp; Film Discussion
                    </p>
                    <h3 className="text-lg sm:text-xl font-black uppercase tracking-[0.12em] text-white">
                      Comments ({combinedComments.length})
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                    Comments update live for everyone watching
                  </span>
                </div>
                <CommentSection
                  comments={combinedComments}
                  onPostComment={handlePostComment}
                  currentUser={currentUser}
                  onVisitUser={onVisitUser}
                />
              </div>
            </div>
          </div>
        ) : (
        <div ref={videoContainerRef} className="fixed inset-0 z-[200] bg-black" data-tv-no-trap>
          {useUniversalPlayer ? (
            <React.Suspense fallback={<div className="w-full h-full flex items-center justify-center bg-black"><div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" /></div>}>
              <ReelloUniversalVideoPlayer
                video={activeVideo}
                album={item as Album}
                context="TALEO"
                currentUser={currentUser}
                onClose={exitPlayer}
                upNext={upNextConfig}
              />
            </React.Suspense>
          ) : (
            <CinemaPlayer
              key={activeVideo.id || activeVideo.url}
              video={activeVideo}
              poster={coverImage || undefined}
              onVideoRef={el => { setVideoElement(el); if (el) videoRef.current = el; }}
              isFullscreen={isFullscreen}
              onToggleFullscreen={getPlatformInfo().isTV ? undefined : toggleFullscreen}
              onWhatIfParticipation={handleWhatIfParticipation}
              onEnded={handleEpisodeEnded}
              onBack={exitPlayer}
            />
          )}

          {/* Up next episode (autoplay) */}
          <AnimatePresence>
            {upNextEpIn !== null && nextEpisode && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                className="absolute bottom-6 right-6 z-30 w-72 max-w-[calc(100vw-16px)] p-3 sm:p-4 bg-black/85 backdrop-blur-md rounded-2xl border border-white/10">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-2">Next episode in {upNextEpIn}s</p>
                <div className="flex gap-3 items-start">
                  <div className="w-24 aspect-video rounded-lg overflow-hidden bg-white/10 shrink-0">
                    {(nextEpisode.thumbnailUrl || nextEpisode.coverImageUrl)
                      ? <img src={nextEpisode.thumbnailUrl || nextEpisode.coverImageUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Play size={14} className="text-white/30" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    {(nextEpisode.seasonNumber || nextEpisode.episodeNumber) && <p className="text-[8px] font-black uppercase tracking-widest text-[#D0BCFF]">S{nextEpisode.seasonNumber || 1} · E{nextEpisode.episodeNumber || ''}</p>}
                    <p className="text-xs font-bold text-white line-clamp-2 mt-0.5">{nextEpisode.title}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={playNextEpisode} className="flex-1 py-2 rounded-full bg-white text-black text-[9px] font-black uppercase tracking-widest hover:bg-[#D0BCFF] transition-all">Play now</button>
                  <button onClick={() => { setUpNextEpIn(null); setAutoplayNextEp(false); }} className="px-3 py-2 rounded-full bg-white/10 text-white/60 text-[9px] font-black uppercase tracking-widest hover:bg-white/20">Cancel</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Alternate-cut switcher — only when the film has extra versions */}
          {((item as Album).alternateVersions?.length ?? 0) > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10 px-1.5 py-1.5 max-w-[90vw] overflow-x-auto no-scrollbar">
              {[{ id: 'primary', label: 'Main', url: undefined as string | undefined }, ...((item as Album).alternateVersions || []).map(v => ({ id: v.id, label: v.label, url: v.url }))].map(ver => (
                <button key={ver.id} onClick={() => playVersion(ver.id, ver.url)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeVersionId === ver.id ? 'bg-white text-black' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                  {ver.label}
                </button>
              ))}
            </div>
          )}

        </div>
        ),
        document.body,
      )}

      {/* ── What If achievement toast ─────────────────────────────────────────── */}
      <AnimatePresence>
        {whatIfAchieved && (
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 340, damping: 26 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-4 bg-[#1A1A2E]/90 backdrop-blur-2xl border border-[#FFB68D]/30 rounded-2xl px-6 py-4 shadow-2xl"
          >
            <div className="w-11 h-11 rounded-xl bg-[#FFB68D]/20 border border-[#FFB68D]/30 flex items-center justify-center shrink-0">
              <Award size={20} className="text-[#FFB68D]" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.35em] text-[#FFB68D]">Achievement Unlocked</p>
              <p className="font-black text-white text-sm mt-0.5">What If &nbsp;·&nbsp; +100 Points</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main detail panel ─────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        // This is a screen, not a dialog. Without the marker the D-pad layer sees
        // `fixed inset-0 z-[100]` covering the viewport, classifies it as a modal, and confines
        // focus to it — which left the tab bar unreachable and made hardware Back the only way
        // out of a Taleo section.
        data-tv-no-trap
        className="fixed inset-0 bg-black/35 text-white overflow-y-auto custom-scrollbar z-[100]"
      >
        {/* Cover art blurred backdrop — dimmer so platform bg shows through */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          {coverImage && (
            <img
              src={coverImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-[100px] opacity-[0.12] transition-all duration-1000"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/65" />
        </div>

        <AnimatePresence>
          {isUIVisible && isUserActive && (
            <motion.main
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              // On a television the max-w-6xl reading column left half the 1080p+ screen empty and
              // the page looked crammed into the middle. Give the TV a much wider column and larger
              // side gutters so the film page actually fills the wall; desktop keeps its reading width.
              className={`relative z-20 pt-28 pb-32 mx-auto ${getPlatformInfo().isTV ? 'px-16 max-w-[1720px]' : 'px-5 lg:px-16 max-w-6xl'}`}
            >
              {/* Close panel */}
              <button
                onClick={() => setIsUIVisible(false)}
                className="fixed top-20 right-6 z-[160] p-3 bg-black/40 backdrop-blur-md rounded-full text-white/50 hover:text-white border border-white/[0.10] hover:border-white/25 transition-all"
              >
                <X size={16} />
              </button>

              {/* ── HERO ─────────────────────────────────────────────────────── */}
              <div className="relative isolate flex flex-col lg:flex-row gap-10 items-start lg:items-end lg:min-h-[48vh]">
                {/* Big cover backdrop: best available art, full-bleed behind the title block, with a scrim */}
                {(filmArt(item) || coverImage) && (
                  <div aria-hidden className={`absolute -z-10 -top-28 h-[min(80vh,760px)] pointer-events-none overflow-hidden ${getPlatformInfo().isTV ? '-inset-x-16' : '-inset-x-5 lg:-inset-x-16'}`}>
                    <img src={filmArt(item) || coverImage} alt="" className="w-full h-full object-cover object-top" onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />
                  </div>
                )}
                {/* Left metadata */}
                <div className="flex-1 space-y-5 min-w-0">
                  {/* Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-white/[0.07] backdrop-blur-sm text-white/60 rounded-lg text-[10px] font-black tracking-[0.15em] uppercase border border-white/[0.10] px-3 py-1">
                      Plajah Cinema
                    </span>
                    {isPaywalled && (
                      <span className="bg-[#D0BCFF]/12 text-[#D0BCFF] rounded-lg text-[10px] font-black tracking-[0.15em] uppercase border border-[#D0BCFF]/20 px-3 py-1 flex items-center gap-1.5">
                        <Sparkles size={10} /> Plajah+
                      </span>
                    )}
                    {world ? (
                      <span className="bg-[#FFB68D]/10 text-[#FFB68D] rounded-lg text-[10px] font-black tracking-[0.15em] uppercase border border-[#FFB68D]/18 px-3 py-1 flex items-center gap-1.5">
                        <Globe size={10} /> {world.name}
                      </span>
                    ) : artist ? (
                      <span className="text-white/30 text-[10px] font-black tracking-[0.15em] uppercase">{artist}</span>
                    ) : null}
                  </div>

                  {/* Title */}
                  <h2 className="text-3xl sm:text-5xl md:text-7xl font-black tracking-tight text-white leading-[0.9] uppercase">
                    {title}
                  </h2>

                  {/* Meta */}
                  <div className="flex items-center gap-4 text-[10px] font-black tracking-[0.15em] uppercase text-white/40 flex-wrap">
                    {match && (
                      <span
                        className="text-[#3FBE85]"
                        title={`Based on your ${match.basis.map(b => b.family).join(', ')}`}
                      >
                        {match.score}% Match
                      </span>
                    )}
                    {audienceScore !== null && (
                      <span className="flex items-center gap-1.5 text-[#3FBE85]" title={`${publicStats!.up + publicStats!.down} ratings`}>
                        <ThumbsUp fill="currentColor" size={11} /> {audienceScore}% liked
                      </span>
                    )}
                    {!!publicStats?.plays && (
                      <span className="flex items-center gap-1.5 text-white/40">
                        <Eye size={11} /> {formatCount(publicStats.plays)} views
                      </span>
                    )}
                    {releaseYear && <span className="text-white/40">{releaseYear}</span>}
                    <span
                      title={`Content rating: ${maturity}`}
                      className="inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.05] px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest text-white/50"
                    >
                      <ShieldCheck size={11} className="text-white/35" /> {maturity}
                    </span>
                    {artist && (
                      <span>Directed by <span className="text-white/55">{artist}</span></span>
                    )}
                    {/* Thumbs rating */}
                    <span className="flex items-center gap-1.5">
                      <button onClick={() => rate('UP')} title="Rate up" className={`p-1.5 rounded-full transition-all ${myRating === 'UP' ? 'bg-[#3FBE85]/20 text-[#3FBE85]' : 'text-white/30 hover:text-white/70'}`}><ThumbsUp size={13} fill={myRating === 'UP' ? 'currentColor' : 'none'} /></button>
                      <button onClick={() => rate('DOWN')} title="Rate down" className={`p-1.5 rounded-full transition-all ${myRating === 'DOWN' ? 'bg-rose-500/20 text-rose-400' : 'text-white/30 hover:text-white/70'}`}><ThumbsDown size={13} fill={myRating === 'DOWN' ? 'currentColor' : 'none'} /></button>
                    </span>
                  </div>

                  {/* Description — the owner's own words, editable in place. */}
                  {editingDesc ? (
                    <div className="max-w-xl space-y-2">
                      <textarea
                        autoFocus
                        value={descDraft}
                        onChange={(e) => setDescDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingDesc(false); }}
                        placeholder="Write or paste your synopsis…"
                        className="w-full h-36 bg-white/[0.06] border border-white/15 rounded-2xl px-4 py-3 text-sm md:text-base text-white/85 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-[#D0BCFF]/40 placeholder:text-white/20"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={saveDescription}
                          disabled={savingDesc}
                          className="h-9 px-5 bg-[#D0BCFF] hover:bg-[#E8DAFF] disabled:opacity-50 text-[#1C1B1F] font-black text-[10px] uppercase tracking-widest rounded-full transition-colors"
                        >
                          {savingDesc ? 'Saving…' : 'Save Synopsis'}
                        </button>
                        <button
                          onClick={() => setEditingDesc(false)}
                          disabled={savingDesc}
                          className="h-9 px-5 bg-white/[0.07] hover:bg-white/[0.12] border border-white/10 text-white/60 hover:text-white font-black text-[10px] uppercase tracking-widest rounded-full transition-all"
                        >
                          Cancel
                        </button>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/25">Esc to cancel</span>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-xl">
                      <p className={`text-sm md:text-base leading-relaxed ${shownDescription ? 'text-white/50' : 'text-white/25 italic'}`}>
                        {shownDescription || (isOwner ? 'No synopsis yet — add the one you wrote.' : 'No description available.')}
                      </p>
                      {isOwner && (
                        <button
                          onClick={() => { setDescDraft(shownDescription || ''); setEditingDesc(true); }}
                          className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-[#D0BCFF] transition-colors"
                          title="Edit the synopsis shown on this page"
                        >
                          <Pencil size={11} /> {shownDescription ? 'Edit Synopsis' : 'Add Synopsis'}
                        </button>
                      )}
                    </div>
                  )}

                  <The411
                    itemId={item.id}
                    itemType="MOVIE"
                    title={title}
                    author={artist}
                    likes={(item as any).likesCount || 0}
                    comments={(item as any).commentsCount || 0}
                  />

                  {(item as any).worldId && (
                    <WorldBadge
                      worldId={(item as any).worldId}
                      contentTitle={title}
                      contentType="video"
                      onNavigate={onNavigateToWorld}
                    />
                  )}

                  {/* CTAs */}
                  <div className="flex flex-wrap gap-3 pt-1">
                    {hasFilmAccess ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <motion.button
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={handlePlay}
                          className="h-12 px-6 sm:px-8 bg-[#D0BCFF] hover:bg-[#E8DAFF] text-[#1C1B1F] font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-3 transition-colors shadow-lg"
                        >
                          <Play fill="currentColor" size={18} /> Watch Now
                        </motion.button>

                        <motion.button
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={handleStartWatchParty}
                          disabled={startingWatchParty}
                          className="h-12 px-5 sm:px-6 bg-gradient-to-r from-[#FF6B00] to-[#FF8C00] hover:from-[#FF8533] hover:to-[#FFA033] text-black font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-2.5 transition-all shadow-[0_8px_25px_rgba(255,107,0,0.35)]"
                          title="Start a synchronized Watch Party and share the link so friends auto-sync with you"
                        >
                          <Users size={17} />
                          <span>{activePartyId ? 'Resume Watch Party' : startingWatchParty ? 'Starting…' : 'Watch Party'}</span>
                        </motion.button>

                        <button
                          onClick={() => {
                            const next = !useUniversalPlayer;
                            setUseUniversalPlayer(next);
                            try { localStorage.setItem('plajah_use_universal_player_v2', next ? 'true' : 'false'); } catch {}
                          }}
                          className={`h-12 px-4 rounded-full border text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${
                            useUniversalPlayer
                              ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                              : 'bg-white/[0.07] hover:bg-white/[0.12] border-white/10 text-white/70 hover:text-white'
                          }`}
                          title={useUniversalPlayer ? 'Using Universal Video Player' : 'Switch to Universal Video Player'}
                        >
                          <Sparkles size={15} className={useUniversalPlayer ? 'text-black' : 'text-amber-400'} />
                          <span className="hidden sm:inline">{useUniversalPlayer ? 'Universal ON' : 'Universal Player'}</span>
                        </button>
                      </div>
                    ) : (
                      <BuyToOwn
                        kind="film"
                        contentId={item.id}
                        creatorUid={ownerId || ''}
                        title={title}
                        purchasePrice={filmBuyPrice || undefined}
                        rentalPrice={filmRentPrice || undefined}
                        rentalWindowHrs={filmOffer.rent?.windowHrs}
                        delivery={filmDist?.delivery}
                        watermark={filmDist?.watermark}
                        uid={currentUser?.uid}
                        ownership={filmOwnership}
                        onRequestSignIn={() => loginWithGoogle()}
                      />
                    )}
                    {isOwner && onEditFilm && (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onEditFilm(item)}
                        className="h-12 px-6 bg-[#FF8C00]/15 hover:bg-[#FF8C00]/25 border border-[#FF8C00]/40 text-[#FF8C00] font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-2.5 transition-all"
                        title="Edit this film's details"
                      >
                        <Pencil size={16} /> Edit Film
                      </motion.button>
                    )}
                    {canAccessStoryIntel && storyIntelJob && (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setShowStoryIntel(true)}
                        className="h-12 px-6 bg-[#8b5cf6]/15 hover:bg-[#8b5cf6]/25 border border-[#8b5cf6]/40 text-[#c4b5fd] font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-2.5 transition-all"
                        title="Aria's story analysis of this film (Creator / Platform Architect)"
                      >
                        <AriaMark size={18} thinking={storyIntelJob.status !== 'READY' && storyIntelJob.status !== 'PARTIAL' && storyIntelJob.status !== 'FAILED' && storyIntelJob.status !== 'SKIPPED'} />
                        Story Intelligence
                      </motion.button>
                    )}
                    <button
                      onClick={handleWatchlistToggle}
                      disabled={watchlistLoading}
                      className={`h-12 px-6 backdrop-blur-sm border font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-3 transition-all ${
                        inWatchlist
                          ? 'bg-[#D0BCFF]/20 border-[#D0BCFF]/40 text-[#D0BCFF]'
                          : 'bg-white/[0.07] hover:bg-white/[0.12] border-white/[0.10] text-white/65 hover:text-white'
                      }`}
                    >
                      {inWatchlist ? <Check size={17} /> : <Bookmark size={17} />}
                      {inWatchlist ? 'Saved' : 'Watchlist'}
                    </button>
                    <button
                      onClick={handleWatchWithClubClick}
                      disabled={checkingClubParties}
                      className={`h-12 px-5 backdrop-blur-sm border font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-2.5 transition-all ${
                        activeClubParties.length > 0
                          ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/45 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
                          : 'bg-white/[0.07] hover:bg-white/[0.12] border-white/[0.10] text-white/65 hover:text-white'
                      }`}
                      title={
                        activeClubParties.length === 1
                          ? `${activeClubParties[0].clubName || 'Your club'} is watching right now — click to auto-sync!`
                          : activeClubParties.length > 1
                          ? `${activeClubParties.length} of your clubs are watching right now — click to choose which club to join`
                          : 'Watch synchronously with your club'
                      }
                    >
                      {activeClubParties.length > 0 && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      )}
                      <Users size={16} />
                      <span>
                        {checkingClubParties
                          ? 'Checking Clubs…'
                          : activeClubParties.length === 1
                          ? `Watch with ${activeClubParties[0].clubName || 'Club'} (Live)`
                          : activeClubParties.length > 1
                          ? `Watch with Club (${activeClubParties.length} Live)`
                          : 'Watch with Club'}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        const archiveId = (item as any).identifier;
                        if (archiveId) shareAsset('archive', archiveId, { title: item.title, text: shareText(item.title, (item as any).creator || (item as any).director) });
                        // A Taleo film opens on its Taleo movie page (MOVIE_UX), not the Reello player.
                        else if (item.id) shareAsset('movie', item.id, { title: item.title, text: shareText(item.title, (item as any).creator || (item as any).director) });
                      }}
                      title="Share"
                      className="h-12 px-5 bg-white/[0.07] hover:bg-white/[0.12] backdrop-blur-sm border border-white/[0.10] rounded-full flex items-center justify-center gap-2 text-white/65 hover:text-white font-black text-sm uppercase tracking-widest transition-all">
                      <Share2 size={17} />
                      <span>Share</span>
                    </button>
                    {isOwner && (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setShowPromoModal(true)}
                        className="h-12 px-6 bg-gradient-to-r from-[#d40055] via-[#6b0099] to-[#ff8c00] hover:opacity-95 text-white font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-2.5 transition-all shadow-[0_8px_25px_rgba(212,0,85,0.35)]"
                        title="Promote this project — auto-promo cards, built promotions & promo kit assets"
                      >
                        <Megaphone size={16} /> Promote
                      </motion.button>
                    )}
                  </div>
                </div>

                {/* Right: poster */}
                <div className="w-full lg:w-56 shrink-0">
                  <div className="aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border border-white/[0.08]">
                    {coverImage ? (
                      <img src={coverImage} alt={title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-white/[0.04] flex items-center justify-center">
                        <Film size={40} className="text-white/15" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── CURATOR & ARCHIVAL NOTES (Halloween / KOFA / Europeana Classics) ── */}
              {((item as any).curatorNote || (item as any).historicalContext || (item as any).restorationInfo) && (
                <section className="mt-12 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 sm:p-8 space-y-5">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="border-l-2 border-[#FF8C00] pl-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FF8C00] mb-1">
                        {(item as any).movement || 'Cinema Film Historian'}
                      </p>
                      <h3 className="text-xl font-black uppercase tracking-[0.12em] text-white">
                        Curator &amp; Preservation Notes
                      </h3>
                    </div>
                    {(item as any).dataProvider && (
                      <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50">
                        Source: {(item as any).dataProvider}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {(item as any).curatorNote && (
                      <div className="space-y-2 p-4 rounded-2xl bg-black/30 border border-white/[0.06]">
                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#FFB68D] flex items-center gap-1.5">
                          <Sparkles size={12} /> Curator's Perspective
                        </p>
                        <p className="text-xs text-white/70 leading-relaxed">{(item as any).curatorNote}</p>
                      </div>
                    )}
                    {(item as any).historicalContext && (
                      <div className="space-y-2 p-4 rounded-2xl bg-black/30 border border-white/[0.06]">
                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#D0BCFF] flex items-center gap-1.5">
                          <ScrollText size={12} /> Historical Context
                        </p>
                        <p className="text-xs text-white/70 leading-relaxed">{(item as any).historicalContext}</p>
                      </div>
                    )}
                    {(item as any).restorationInfo && (
                      <div className="space-y-2 p-4 rounded-2xl bg-black/30 border border-white/[0.06]">
                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-emerald-400 flex items-center gap-1.5">
                          <Award size={12} /> Preservation &amp; Print
                        </p>
                        <p className="text-xs text-white/70 leading-relaxed">{(item as any).restorationInfo}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── CLASSIC DIRECTOR PORTRAIT, BIOGRAPHY & FILMOGRAPHY OF OTHER WORKS ── */}
              <div className="mt-10">
                <DirectorSpotlightCard
                  directorName={(item as any).director || (item as any).movieMetadata?.director || artist}
                  filmId={filmLookupId || item.id}
                  onPlayFilm={(fid) => {
                    const target = findPlayableFilmById(fid);
                    if (target && onOpenItem) {
                      onOpenItem((target as any).identifier ? archiveVideoToAlbum(target) : target);
                    }
                  }}
                />
              </div>

              {/* ── CHARACTERS & THE ACTORS BEHIND THEM (Interactive 2-Card Shuffle Deck) ── */}
              <div className="mt-8">
                <CharactersAndActorsSection
                  filmId={filmLookupId || item.id}
                  filmTitle={title}
                  directorName={(item as any).director || (item as any).movieMetadata?.director || artist}
                  characters={(item as any).charactersWithActors}
                  fallbackCastMembers={castMembers}
                  worldCharacters={worldCharacters}
                  onOpenStoryIntel={storyIntelJob ? () => setShowStoryIntel(true) : undefined}
                />
              </div>

              {/* ── SEASONS & EPISODES (Series / Episodic Titles) ── */}
              {((item as Album).seasons || []).length > 0 && (() => {
                const seasons = (item as Album).seasons || [];
                const activeSeason = seasons.find(s => s.number === selectedSeasonNum) || seasons[0];
                const episodes = activeSeason?.episodes || [];
                return (
                  <section className="mt-14 space-y-5">
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                      <div className="border-l-2 border-[#D0BCFF] pl-3">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-1">Episodic Guide</p>
                        <h3 className="text-xl font-black uppercase tracking-[0.15em] text-white">Seasons &amp; Episodes</h3>
                      </div>
                      {seasons.length > 1 && (
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                          {seasons.map(s => (
                            <button
                              key={s.number}
                              onClick={() => setSelectedSeasonNum(s.number)}
                              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                                (activeSeason?.number ?? 1) === s.number
                                  ? 'bg-[#D0BCFF] text-[#1C1B1F]'
                                  : 'bg-white/5 border border-white/10 text-white/50 hover:text-white'
                              }`}
                            >
                              Season {s.number}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {episodes.map((ep: any, idx: number) => (
                        <div
                          key={ep.id || idx}
                          onClick={() => {
                            if (!hasFilmAccess) { setIsUIVisible(true); return; }
                            beginPlayback({
                              ...ep,
                              id: ep.id || `${item.id}-s${activeSeason?.number || 1}e${idx + 1}`,
                              title: ep.title || `${item.title} — Episode ${idx + 1}`,
                              artist: ep.artist || item.title,
                              thumbnailUrl: ep.thumbnailUrl || coverImage,
                            } as Video);
                          }}
                          className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#D0BCFF]/40 flex items-center gap-4 cursor-pointer group transition-all"
                        >
                          <div className="w-28 aspect-video rounded-xl overflow-hidden bg-black/50 relative shrink-0 border border-white/10">
                            {(ep.thumbnailUrl || coverImage) && (
                              <img src={ep.thumbnailUrl || coverImage} alt={ep.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            )}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                <Play size={14} fill="white" className="text-white ml-0.5" />
                              </div>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-black uppercase tracking-widest text-[#D0BCFF]">
                              S{activeSeason?.number || 1} · E{ep.episodeNumber || idx + 1}
                            </p>
                            <h4 className="text-sm font-black uppercase tracking-tight text-white truncate mt-0.5 group-hover:text-[#D0BCFF] transition-colors">
                              {ep.title || `Episode ${idx + 1}`}
                            </h4>
                            {ep.description && (
                              <p className="text-xs text-white/45 line-clamp-2 mt-1 leading-relaxed">{ep.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })()}

              {/* ── UNIVERSE RAIL (lore + timeline) ───────────────────────────── */}
              {hasUniverseRail && (
                <section className="mt-14 space-y-6">
                  <div className="flex items-end justify-between gap-3">
                    <div className="border-l-2 border-[#FFB68D] pl-3 min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-1">Universe</p>
                      <h3 className="text-xl font-black uppercase tracking-[0.15em] text-white truncate">{world?.name}</h3>
                    </div>
                    {onNavigateToWorld && (
                      <button
                        onClick={() => onNavigateToWorld((item as any).worldId)}
                        className="shrink-0 h-9 px-4 bg-[#FFB68D]/15 hover:bg-[#FFB68D]/25 border border-[#FFB68D]/35 text-[#FFB68D] font-black text-[9px] uppercase tracking-widest rounded-full flex items-center gap-2 transition-all"
                      >
                        <Globe size={13} /> Open World Hub
                      </button>
                    )}
                  </div>

                  {world?.description && (
                    <p className="text-sm text-white/45 leading-relaxed max-w-2xl">{world.description}</p>
                  )}

                  {/* Lore */}
                  {railLore.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 flex items-center gap-2">
                        <ScrollText size={12} className="text-[#FFB68D]" /> Lore
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {railLore.map(entry => {
                          const loreImg = entry.gallery?.[0] || (entry as any).imageUrl;
                          return (
                            <motion.button
                              key={entry.id}
                              whileHover={{ y: -3 }}
                              onClick={() => setOpenLore(entry)}
                              className="text-left bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] hover:border-[#FFB68D]/35 rounded-2xl overflow-hidden transition-colors flex flex-col"
                            >
                              {loreImg && (
                                <div className="w-full aspect-video bg-black/50 overflow-hidden">
                                  <img
                                    src={loreImg}
                                    alt={entry.title}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              <div className="p-4 flex-1">
                                <span className="text-[8px] font-black uppercase tracking-widest text-[#FFB68D]/70">
                                  {(entry.type || 'LORE').replace(/_/g, ' ')}
                                </span>
                                <p className="text-sm font-black text-white leading-tight mt-1.5 line-clamp-2">{entry.title}</p>
                                {entry.content && (
                                  <p className="text-[11px] text-white/40 leading-relaxed mt-2 line-clamp-3">{entry.content}</p>
                                )}
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  {railTimeline.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 flex items-center gap-2">
                        <Milestone size={12} className="text-[#FFB68D]" /> Timeline
                      </p>
                      <div className="relative pl-5">
                        <div className="absolute left-[3px] top-1 bottom-1 w-px bg-gradient-to-b from-[#FFB68D]/50 via-white/10 to-transparent" />
                        <div className="flex flex-col gap-4">
                          {railTimeline.map(ev => (
                            <div key={ev.id} className="relative">
                              <span
                                className="absolute -left-5 top-1.5 w-[7px] h-[7px] rounded-full"
                                style={{ background: SIGNIFICANCE_COLOR[ev.significance || 'MINOR'] || 'rgba(255,255,255,0.25)' }}
                              />
                              <div className="flex items-baseline gap-2.5 flex-wrap">
                                <span className="text-[10px] font-black tabular-nums text-[#FFB68D]/80 uppercase tracking-widest">
                                  {ev.year}{timelineUnit ? ` ${timelineUnit}` : ''}
                                </span>
                                <span className="text-sm font-black text-white leading-tight">{ev.title}</span>
                              </div>
                              {ev.description && (
                                <p className="text-[12px] text-white/45 leading-relaxed mt-1 max-w-2xl">{ev.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* ── STORY INTELLIGENCE / MORE LIKE THIS ───────────────────────── */}
              <StoryBreakdown item={item as any} job={storyIntelJob} />
              <MoreLikeThis related={relatedFilms as any} onOpenItem={onOpenItem as any} />

              {/* ── CAST & CREW (movieMetadata) ───────────────────────────────── */}
              {castMembers.length > 0 && (
                <section className="mt-12 space-y-4">
                  <div className="border-l-2 border-[#D0BCFF] pl-3">
                    <h3 className="text-xl font-black uppercase tracking-[0.15em] text-white">Cast &amp; Crew</h3>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {castMembers.map(member => (
                      <div key={member.id} className="bg-white/[0.05] backdrop-blur-sm border border-white/[0.08] rounded-xl px-4 py-2.5">
                        <p className="text-sm font-black text-white">{member.actorName}</p>
                        {member.characterName && (
                          <p className="text-[10px] text-white/35 uppercase tracking-wider mt-0.5">as {member.characterName}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── MORE FROM THIS WORLD ──────────────────────────────────────── */}
              {hasWorldContent && (
                <section className="mt-14 space-y-5">
                  <div className="flex items-end justify-between">
                    <div className="border-l-2 border-[#FFB68D] pl-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-1">
                        {world?.name || 'World'}
                      </p>
                      <h3 className="text-xl font-black uppercase tracking-[0.15em] text-white">More From This Universe</h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {([...worldVideos, ...worldAlbums] as any[]).slice(0, 8).map(content => (
                      <HoverPreviewThumb
                        key={content.id}
                        poster={content.coverImage || content.coverImageUrl || content.thumbnailUrl}
                        title={content.title}
                        subtitle={content.subType || content.type || (content.tracks ? 'Album' : 'Content')}
                        preview={previewSourceFor(content)}
                        accent="#FFB68D"
                        fallbackIcon={<Film size={18} className="text-white/20" />}
                        onClick={() => onOpenItem?.(content)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* ── DISCUSSIONS ───────────────────────────────────────────────── */}
              {filmDiscussions.length > 0 && (
                <section className="mt-14 space-y-5">
                  <div className="flex items-end justify-between">
                    <div className="border-l-2 border-[#D0BCFF] pl-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-1">Community</p>
                      <h3 className="text-xl font-black uppercase tracking-[0.15em] text-white">Discussions</h3>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/25 border border-white/10 px-2 py-0.5 rounded-lg">{filmDiscussions.length} thread{filmDiscussions.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-3">
                    {filmDiscussions.slice(0, 4).map(post => (
                      <div key={post.id} className="flex items-start gap-4 p-4 bg-white/[0.04] border border-white/[0.07] rounded-2xl hover:border-[#D0BCFF]/20 transition-all">
                        <div className="w-8 h-8 rounded-full bg-[#D0BCFF]/15 flex items-center justify-center shrink-0 mt-0.5">
                          <MessageCircle size={14} className="text-[#D0BCFF]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-white leading-tight line-clamp-2">{post.title}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[9px] font-black text-[#D0BCFF] uppercase tracking-widest">↑ {post.upvotes || 0}</span>
                            <span className="text-[9px] text-white/25 font-black uppercase tracking-widest">{post.commentCount || 0} replies</span>
                            <span className="text-[9px] text-white/20 font-black uppercase tracking-widest">{post.boardName}</span>
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-white/20 shrink-0 mt-1" />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── COMMENTS ──────────────────────────────────────────────────── */}
              <section className="mt-14">
                <div className="border-l-2 border-white/15 pl-3 mb-6">
                  <h3 className="text-xl font-black uppercase tracking-[0.15em] text-white">Comments</h3>
                </div>
                <div className="bg-white/[0.04] backdrop-blur-xl rounded-2xl p-6 border border-white/[0.07]">
                  <CommentSection
                    comments={combinedComments}
                    onPostComment={handlePostComment}
                    currentUser={currentUser}
                    onVisitUser={onVisitUser}
                  />
                </div>
              </section>
            </motion.main>
          )}
        </AnimatePresence>

        {/* ── Lore Entry Modal (Universe rail) ──────────────────────────────── */}
        <AnimatePresence>
          {openLore && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[220] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
              onClick={() => setOpenLore(null)}
            >
              <motion.div
                initial={{ scale: 0.92, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.92, y: 20 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="bg-[#0E0E1A] border border-white/10 rounded-3xl p-5 sm:p-8 w-full max-w-lg max-h-[85dvh] overflow-y-auto space-y-4 shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[#FFB68D] mb-1.5">
                      {(openLore.type || 'LORE').replace(/_/g, ' ')}
                    </p>
                    <h3 className="text-xl font-black uppercase tracking-tight text-white leading-tight">{openLore.title}</h3>
                  </div>
                  <button
                    onClick={() => setOpenLore(null)}
                    className="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {openLore.gallery && openLore.gallery.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {openLore.gallery.slice(0, 6).map((src, i) => (
                      <img key={i} src={src} alt="" loading="lazy" className="h-28 rounded-xl object-cover border border-white/8 shrink-0" />
                    ))}
                  </div>
                )}

                {openLore.content && (
                  <p className="text-sm text-white/65 leading-relaxed whitespace-pre-wrap">{openLore.content}</p>
                )}

                {openLore.tags?.length ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {openLore.tags.slice(0, 8).map(t => (
                      <span key={t} className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/45">
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}

                {onNavigateToWorld && (item as any).worldId && (
                  <button
                    onClick={() => { setOpenLore(null); onNavigateToWorld((item as any).worldId); }}
                    className="w-full h-11 bg-[#FFB68D] hover:bg-[#FFC9A0] text-[#1C1B1F] font-black text-[10px] uppercase tracking-widest rounded-full flex items-center justify-center gap-2 transition-colors"
                  >
                    <Globe size={14} /> Explore {world?.name || 'this world'}
                  </button>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Watch with Club Modal (Multi-Club Chooser + Start/Schedule) ───── */}
        <AnimatePresence>
          {showWatchWithClub && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[220] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
              onClick={() => setShowWatchWithClub(false)}
            >
              <motion.div
                initial={{ scale: 0.92, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.92, y: 20 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="bg-[#0E0E1A] border border-white/10 rounded-3xl p-5 sm:p-8 w-full max-w-md max-h-[85dvh] overflow-y-auto space-y-6 shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[#D0BCFF] mb-1">
                      {clubModalMode === 'CHOOSE_ACTIVE_CLUB' ? 'Multiple Clubs Watching Live' : 'Club Watch Party'}
                    </p>
                    <h3 className="text-xl font-black uppercase tracking-tight text-white">
                      {clubModalMode === 'CHOOSE_ACTIVE_CLUB'
                        ? 'Which club do you want to join?'
                        : 'Watch with Club'}
                    </h3>
                  </div>
                  <button onClick={() => setShowWatchWithClub(false)} className="p-2 text-white/30 hover:text-white transition-colors">
                    <X size={18} />
                  </button>
                </div>

                <div className="p-4 bg-white/[0.04] border border-white/[0.07] rounded-2xl flex items-center gap-4">
                  <div className="w-12 h-16 rounded-xl overflow-hidden bg-white/5 shrink-0">
                    {((item as Album).coverImage || (item as Video).thumbnailUrl) && (
                      <img src={(item as Album).coverImage || (item as Video).thumbnailUrl} className="w-full h-full object-cover" alt="" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{item.title}</p>
                    <p className="text-[9px] text-[#D0BCFF] font-black uppercase tracking-widest mt-0.5">
                      {clubModalMode === 'CHOOSE_ACTIVE_CLUB'
                        ? `${activeClubParties.length} of your clubs are watching this right now`
                        : 'Live Sync & Scheduled Watch Party'}
                    </p>
                  </div>
                </div>

                {clubModalMode === 'CHOOSE_ACTIVE_CLUB' ? (
                  <div className="space-y-4">
                    <p className="text-xs text-white/65 leading-relaxed">
                      More than one club you're a member of is currently watching <span className="text-white font-bold">{item.title}</span>. Choose which club's Watch Party you'd like to sync with:
                    </p>
                    <div className="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar">
                      {activeClubParties.map(cp => {
                        const clubObj = userClubs.find(c => c.id === cp.clubId);
                        const clubName = cp.clubName || clubObj?.name || 'Club';
                        const clubIcon = cp.clubIcon || clubObj?.iconImage;
                        return (
                          <button
                            key={cp.id}
                            onClick={() => handleJoinClubParty(cp)}
                            className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#D0BCFF]/10 hover:bg-[#D0BCFF]/20 border border-[#D0BCFF]/35 hover:border-[#D0BCFF]/60 transition-all text-left group"
                          >
                            <div className="relative w-11 h-11 rounded-xl bg-white/10 overflow-hidden shrink-0 flex items-center justify-center font-black text-sm text-[#D0BCFF]">
                              {clubIcon ? (
                                <img src={clubIcon} className="w-full h-full object-cover" alt={clubName} />
                              ) : (
                                clubName[0]?.toUpperCase() || 'C'
                              )}
                              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0E0E1A] animate-pulse" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-black text-white truncate">{clubName}</p>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[8px] font-black uppercase tracking-widest shrink-0">
                                  Live
                                </span>
                              </div>
                              <p className="text-[10px] text-white/55 font-bold truncate mt-0.5">
                                Hosted by {cp.hostName || 'Club Host'} · {cp.playback?.isPlaying ? 'Playing now' : 'Paused'}
                              </p>
                            </div>
                            <span className="px-3 py-1.5 rounded-full bg-[#D0BCFF] text-[#1C1B1F] text-[10px] font-black uppercase tracking-widest shrink-0 group-hover:scale-105 transition-transform">
                              Join &amp; Sync
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => setClubModalMode('START_OR_SCHEDULE')}
                      className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white transition-colors"
                    >
                      Or start / schedule with another club →
                    </button>
                  </div>
                ) : watchPartyDone ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                      <Check size={20} className="text-green-400" />
                    </div>
                    <p className="text-sm font-black text-white uppercase tracking-widest">Watch Party Scheduled!</p>
                  </div>
                ) : (
                  <>
                    {activeClubParties.length > 0 && (
                      <button
                        onClick={() => {
                          if (activeClubParties.length === 1) {
                            handleJoinClubParty(activeClubParties[0]);
                          } else {
                            setClubModalMode('CHOOSE_ACTIVE_CLUB');
                          }
                        }}
                        className="w-full p-3 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 flex items-center justify-between gap-3 transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                          <span className="text-[11px] font-black uppercase tracking-wider text-emerald-200 truncate">
                            {activeClubParties.length === 1
                              ? `${activeClubParties[0].clubName || 'Your club'} is watching now!`
                              : `${activeClubParties.length} clubs are watching right now!`}
                          </span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300 shrink-0">
                          Sync Now →
                        </span>
                      </button>
                    )}

                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Select Club</label>
                      {userClubs.length === 0 ? (
                        <p className="text-[10px] text-white/25 font-black uppercase tracking-widest">You haven't joined any clubs yet.</p>
                      ) : (
                        <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar">
                          {userClubs.map(club => {
                            const liveParty = activeClubParties.find(p => p.clubId === club.id);
                            return (
                              <button
                                key={club.id}
                                onClick={() => setWatchPartyClubId(club.id)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                  watchPartyClubId === club.id
                                    ? 'bg-[#D0BCFF]/15 border-[#D0BCFF]/40'
                                    : 'bg-white/[0.03] border-white/[0.07] hover:border-white/20'
                                }`}
                              >
                                <div className="w-8 h-8 rounded-lg bg-white/10 overflow-hidden shrink-0 flex items-center justify-center font-black text-xs text-[#D0BCFF]">
                                  {club.iconImage ? <img src={club.iconImage} className="w-full h-full object-cover" alt="" /> : (club.name?.[0]?.toUpperCase() || 'C')}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-black text-white truncate">{club.name}</p>
                                    {liveParty && (
                                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[8px] font-black uppercase tracking-widest">
                                        Watching Now
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-white/30 font-black uppercase tracking-widest">{club.memberCount || 0} members</p>
                                </div>
                                {watchPartyClubId === club.id && <Check size={14} className="text-[#D0BCFF] ml-auto shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {userClubs.length > 0 && (
                      <button
                        onClick={() => {
                          const club = userClubs.find(c => c.id === watchPartyClubId) || userClubs[0];
                          if (!club) return;
                          const existingLive = activeClubParties.find(p => p.clubId === club.id);
                          if (existingLive) {
                            handleJoinClubParty(existingLive);
                          } else {
                            handleStartClubWatchPartyNow(club);
                          }
                        }}
                        disabled={!watchPartyClubId && userClubs.length === 0}
                        className="w-full h-12 bg-gradient-to-r from-[#6B0099] to-[#D40055] hover:opacity-95 disabled:opacity-40 text-white font-black text-xs uppercase tracking-widest rounded-full flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#D40055]/25"
                      >
                        <Radio size={15} />
                        {activeClubParties.some(p => p.clubId === watchPartyClubId)
                          ? 'Join Live Club Watch Party Now'
                          : 'Start Live Club Watch Party Now'}
                      </button>
                    )}

                    <div className="pt-3 border-t border-white/10 space-y-3">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block">Or Schedule for Later</label>
                      <input
                        type="datetime-local"
                        value={watchPartyDate}
                        onChange={e => setWatchPartyDate(e.target.value)}
                        className="w-full bg-white/[0.05] border border-white/[0.10] focus:border-[#D0BCFF]/50 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none transition-all"
                        style={{ colorScheme: 'dark' }}
                      />
                      <button
                        onClick={handleScheduleWatchParty}
                        disabled={!watchPartyClubId || !watchPartyDate || watchPartySubmitting}
                        className="w-full h-11 bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white font-black text-xs uppercase tracking-widest rounded-full flex items-center justify-center gap-2 transition-all border border-white/15"
                      >
                        <Calendar size={14} /> {watchPartySubmitting ? 'Scheduling…' : 'Schedule Watch Party'}
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Show details when UI hidden */}
        {!isUIVisible && !activeVideo && isUserActive && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => setIsUIVisible(true)}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[120] bg-black/50 backdrop-blur-md px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-white/55 border border-white/10 hover:bg-black/70 transition-all flex items-center gap-2"
          >
            <Info size={13} /> Show Details
          </motion.button>
        )}

        {/* ── FLOATING HEADER ──────────────────────────────────────────────── */}
        <div
          className={`fixed top-0 left-0 right-0 z-[150] px-5 py-4 flex items-center justify-between transition-all duration-500 ${isUserActive ? 'opacity-100' : 'opacity-0'} ${scrolled ? 'bg-black/60 backdrop-blur-2xl border-b border-white/[0.06]' : 'bg-transparent'}`}
        >
          <button
            onClick={onBack}
            className="flex items-center gap-2.5 text-white/55 hover:text-white font-black uppercase tracking-[0.2em] text-[10px] group transition-all"
          >
            <div className="w-9 h-9 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/[0.10] flex items-center justify-center group-hover:bg-white/[0.14] transition-all">
              <ArrowLeft size={16} />
            </div>
            <span className="hidden sm:inline">Back</span>
          </button>

          <h1 className={`font-black text-base tracking-[0.35em] uppercase text-white/90 transition-all duration-500 ${scrolled ? 'opacity-100' : 'opacity-0'}`}>
            Plajah Cinema
          </h1>

          <div className="flex items-center gap-2.5">
            {isOwner && (
              <button
                onClick={() => setShowPromoModal(true)}
                title="Promote Film — Auto-Promo Cards & Assets"
                className="h-9 px-3.5 bg-gradient-to-r from-[#d40055] to-[#ff8c00] rounded-full flex items-center justify-center gap-1.5 text-white text-[10px] font-black uppercase tracking-widest shadow-md hover:opacity-95 transition-all"
              >
                <Megaphone size={13} />
                <span>Promote</span>
              </button>
            )}
            {currentUser?.photoURL ? (
              <button
                onClick={() => currentUser?.uid && onVisitUser(currentUser.uid)}
                className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/12 hover:border-[#D0BCFF]/50 transition-all"
              >
                <img src={currentUser.photoURL} alt="" className="w-full h-full object-cover" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-full bg-white/[0.07] border border-white/[0.10] flex items-center justify-center text-white/30">
                <Users size={16} />
              </div>
            )}
          </div>
        </div>

        {/* ── Story Intelligence review (creator + curated classics, lazy) ─── */}
        {showStoryIntel && (
          <React.Suspense fallback={null}>
            <StoryIntelReview
              albumId={filmLookupId || item.id}
              ownerId={ownerId || ''}
              title={title}
              onClose={() => setShowStoryIntel(false)}
            />
          </React.Suspense>
        )}

        {/* ── Project Promote Studio Modal ─────────────────────────────────── */}
        {showPromoModal && (
          <ChoraPromoModal
            album={{
              ...(item as any),
              id: item.id,
              title: title || item.title,
              artist: artist || (item as any).director || (item as any).creator || 'Creator',
              coverImage: coverImage || (item as any).thumbnailUrl || (item as any).coverImageUrl || '',
              type: isTV ? 'TV' : 'MOVIE',
              tracks: (item as Album).tracks || [],
            } as Album}
            currentUser={currentUser as any}
            onClose={() => setShowPromoModal(false)}
          />
        )}
      </div>
    </>
  );
};

/** A scheduled title ("Release later") does not exist for anyone but its owner until releaseDate: a deep link must not open it. */
const MovieUXView: React.FC<MovieUXViewProps> = (props) => {
  if (!releaseVisibleToViewer(props.item as any, props.currentUser?.uid)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center text-white" role="status">
        <p className="text-sm font-black uppercase tracking-widest">Not available yet</p>
        <p className="text-xs text-white/50">This title has not been released. Check back after its release date.</p>
        <button type="button" onClick={props.onBack} className="rounded-xl bg-white/10 px-5 py-2 text-[10px] font-black uppercase tracking-widest">Back</button>
      </div>
    );
  }
  return <MovieUXViewInner {...props} />;
};

export default MovieUXView;
