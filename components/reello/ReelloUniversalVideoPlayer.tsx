import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, SkipBack, SkipForward,
  RotateCcw, RotateCw, Settings, Sliders, Layers, Sparkles, Film, MessageCircle,
  List, Check, X, ChevronDown, ChevronRight, Share2, Heart, Clock, Folder,
  FileVideo, ArrowLeft, Send, Pin, AlertCircle, Headphones, Repeat, Shuffle,
  Download, Eye, Subtitles, Compass, Users, Radio
} from 'lucide-react';
import { Video, Album } from '../../types';
import { WindowsPickedFile } from '../../services/windowsBridgeService';
import { listHqComments, addHqComment, type OrgAsset } from '../../services/hqCollaboration';
import { listenToVideoComments, postVideoComment, createPost } from '../../services/backendService';
import ShareButton from '../ShareButton';
import CommentSection from '../CommentSection';
import { buildShareUrl } from '../../services/deepLinkService';
import { LensPicker, LensVideoOverlay } from '../LensVideoOverlay';
import { createParty, partyShareUrl, shouldResync } from '../../services/partyService';
import { useParty } from '../../hooks/useParty';
import type { LensId } from '../../services/lenses/lensEngine';

import UpNextOverlay, { type UpNextConfig } from '../taleo/UpNextOverlay';
export type PlayerContext = 'REELLO' | 'TALEO' | 'LOCAL' | 'ASSET_HQ';

export type PixelsLook =
  | 'none'
  | 'tealorange'
  | 'warm'
  | 'vivid'
  | 'moody'
  | 'noir'
  | 'vintage'
  | 'golden'
  | 'cyberpunk'
  | 'crt'
  | 'grain';

export type AudioDspPreset =
  | 'bypass'
  | 'dialogue'
  | 'bass'
  | 'spatial'
  | 'night';

export interface VideoPlaylistItem {
  id: string;
  title: string;
  url: string;
  duration?: number;
  thumbnailUrl?: string;
  subtitle?: string;
  file?: WindowsPickedFile;
  video?: Video;
}

export interface ReelloUniversalVideoPlayerProps {
  /** Source file when opened from Windows File Explorer or local picker */
  file?: WindowsPickedFile;
  /** Sibling files in the local directory (automatically forms a local playlist) */
  folderFiles?: WindowsPickedFile[];
  /** Video document if originating from Reello feed */
  video?: Video;
  /** Album / film document if originating from Taleo cinema */
  album?: Album;
  /** Direct URL override */
  src?: string;
  /** Mux playback ID */
  muxPlaybackId?: string;
  /** Title override */
  title?: string;
  /** Runtime context */
  context?: PlayerContext;
  /** Current signed-in user */
  currentUser?: any;
  /** Callback to close the player overlay */
  onClose?: () => void;
  /** Callback when navigating to an external link or related item */
  onNavigateToRelated?: (item: any) => void;
  /** Videos to play after this one (autoplay next). */
  queue?: Video[];
  /** A shared watch-party link: auto-join and follow that party. */
  partyId?: string;
  /** Local files are private. Sharing one means uploading it to Reello first; this starts that flow. */
  onUploadToReello?: (file: WindowsPickedFile) => void;
  /** Suggestions shown when the video ends, with a 20s do-nothing countdown that calls onTimeoutExit. */
  upNext?: UpNextConfig;
}

const LOOK_FILTERS: Record<PixelsLook, { label: string; filter: string; description: string }> = {
  none: { label: 'Bypass (Clean)', filter: 'none', description: 'Original native stream colors' },
  tealorange: { label: 'Teal & Orange', filter: 'contrast(1.15) saturate(1.25) hue-rotate(-6deg)', description: 'Hollywood blockbuster cinematic look' },
  warm: { label: 'Warm Film', filter: 'sepia(0.18) saturate(1.15) contrast(1.08) brightness(1.02)', description: 'Kodak 2383 motion picture print emulation' },
  vivid: { label: 'Vivid HDR', filter: 'contrast(1.22) saturate(1.35) brightness(1.04)', description: 'High-gamut punchy highlights' },
  moody: { label: 'Moody Blues', filter: 'contrast(1.16) saturate(0.85) brightness(0.94) hue-rotate(8deg)', description: 'Deep shadows and Nordic atmospheric blue' },
  noir: { label: 'Silver Noir', filter: 'grayscale(1) contrast(1.3) brightness(0.95)', description: 'High-contrast monochrome classic' },
  vintage: { label: 'Vintage 70s', filter: 'sepia(0.35) contrast(1.05) saturate(0.9) brightness(1.03)', description: 'Warm retro warmth with faded blacks' },
  golden: { label: 'Golden Hour', filter: 'sepia(0.25) saturate(1.28) contrast(1.1) hue-rotate(-12deg)', description: 'Sunset warmth and amber skin tones' },
  cyberpunk: { label: 'Cyberpunk', filter: 'contrast(1.25) saturate(1.4) hue-rotate(25deg)', description: 'Electric neon and deep purple saturation' },
  crt: { label: 'CRT Monitor', filter: 'contrast(1.1) brightness(1.05) saturate(1.1)', description: 'Retro cathode-ray simulation' },
  grain: { label: '35mm Film Grain', filter: 'contrast(1.08) brightness(1.02)', description: 'Analog motion picture emulsion texture' },
};

const AUDIO_PRESETS: Record<AudioDspPreset, { label: string; description: string; icon: string }> = {
  bypass: { label: 'Direct Stereo', description: 'Unmodified master output', icon: 'Direct' },
  dialogue: { label: 'Dialogue Clarity Lift', description: 'Enhances spoken vocal intelligibility (+6dB @ 2.8kHz)', icon: 'Vocal' },
  bass: { label: 'Bass Punch Sub', description: 'Cinema low-end weight (+7dB @ 85Hz)', icon: 'Bass' },
  spatial: { label: 'Spatial Cinema 3D', description: 'Surround soundstage expansion via phase widening', icon: '3D' },
  night: { label: 'Night Mode Dynamics', description: 'Compressed dynamic range: quiet whispers audible, tame explosions', icon: 'Night' },
};

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTimecode(seconds: number, fps = 24): string {
  if (isNaN(seconds) || seconds < 0) return '00:00:00:00';
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const frames = Math.floor((seconds - s) * fps);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export const ReelloUniversalVideoPlayer: React.FC<ReelloUniversalVideoPlayerProps> = ({
  file: initialFile,
  folderFiles = [],
  video: initialVideo,
  album,
  src: initialSrc,
  muxPlaybackId: initialMuxId,
  queue: initialQueue,
  partyId: initialPartyId,
  onUploadToReello,
  title: initialTitle,
  context = initialFile ? 'LOCAL' : album ? 'TALEO' : 'REELLO',
  currentUser,
  onClose,
  onNavigateToRelated,
  upNext,
}) => {
  const [showUpNext, setShowUpNext] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Live lenses (viewer-local). Only for Mux sources: they send CORS headers, so the overlay can read pixels.
  const [lensId, setLensId] = useState<LensId>('none');
  const [lensStatus, setLensStatus] = useState('');
  const [lensOpen, setLensOpen] = useState(false);
  const [showLocalShare, setShowLocalShare] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<any>(null);

  const [activeContext, setActiveContext] = useState<PlayerContext>(context);
  const [currentFile, setCurrentFile] = useState<WindowsPickedFile | undefined>(initialFile);
  const [currentVideo, setCurrentVideo] = useState<Video | undefined>(initialVideo);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const [activeLook, setActiveLook] = useState<PixelsLook>('none');
  const [activeAudioPreset, setActiveAudioPreset] = useState<AudioDspPreset>('bypass');
  const [showLookMenu, setShowLookMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dialogueFilterRef = useRef<BiquadFilterNode | null>(null);
  const bassFilterRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);

  const [availableAudioTracks, setAvailableAudioTracks] = useState<Array<{ id: number | string; label: string; language: string }>>([
    { id: 'main', label: 'Original Surround 5.1 / Stereo', language: 'en' },
    { id: 'commentary', label: 'Audio Description (AD) / Accessibility', language: 'en-ad' },
  ]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<string | number>('main');
  const [showTrackMenu, setShowTrackMenu] = useState(false);

  const [hudVisible, setHudVisible] = useState(true);
  const hudTimeoutRef = useRef<any>(null);

  const resetHudTimeout = useCallback(() => {
    setHudVisible(true);
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    if (isPlaying) {
      hudTimeoutRef.current = setTimeout(() => {
        setHudVisible(false);
        setShowLookMenu(false);
        setShowAudioMenu(false);
        setShowSpeedMenu(false);
        setShowTrackMenu(false);
      }, 4000);
    }
  }, [isPlaying]);

  // Start the hide timer as soon as playback starts; keep the controls up while paused.
  useEffect(() => {
    if (isPlaying) resetHudTimeout();
    else { if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current); setHudVisible(true); }
  }, [isPlaying, resetHudTimeout]);

  const [playlist, setPlaylist] = useState<VideoPlaylistItem[]>([]);
  const [playlistIndex, setPlaylistIndex] = useState(0);
  const [isPlaylistDrawerOpen, setIsPlaylistDrawerOpen] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('all');

  const [showComments, setShowComments] = useState(activeContext !== 'TALEO');
  const [commentsList, setCommentsList] = useState<any[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [includeTimestamp, setIncludeTimestamp] = useState(context === 'ASSET_HQ');

  useEffect(() => {
    if (folderFiles && folderFiles.length > 0) {
      const videoItems: VideoPlaylistItem[] = folderFiles
        .filter(f => f.kind === 'VIDEO' || /\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|wmv|flv|ts)$/i.test(f.name))
        .map((f, idx) => ({
          id: `file_${idx}_${encodeURIComponent(f.name)}`,
          title: f.name.replace(/\.[^/.]+$/, ''),
          url: f.url,
          file: f,
          subtitle: `${Math.round(f.size / (1024 * 1024))} MB`,
        }));

      if (videoItems.length > 0) {
        setPlaylist(videoItems);
        if (currentFile) {
          const idx = videoItems.findIndex(i => i.file?.url === currentFile.url || i.title === currentFile.name.replace(/\.[^/.]+$/, ''));
          if (idx !== -1) setPlaylistIndex(idx);
        }
      }
    } else if (currentVideo && initialQueue && initialQueue.length > 0) {
      const toItem = (v: Video): VideoPlaylistItem => ({
        id: v.id,
        title: v.title || 'Reello Video',
        url: v.muxPlaybackId ? `https://stream.mux.com/${v.muxPlaybackId}.m3u8` : (v.url || ''),
        video: v,
        thumbnailUrl: v.thumbnailUrl,
        subtitle: v.ownerName || 'Creator',
      });
      const rest = initialQueue.filter(v => v.id !== currentVideo.id);
      setPlaylist([toItem(currentVideo), ...rest.map(toItem)]);
      setPlaylistIndex(0);
    } else if (currentVideo) {
      setPlaylist([{
        id: currentVideo.id,
        title: currentVideo.title || 'Reello Video',
        url: currentVideo.muxPlaybackId ? `https://stream.mux.com/${currentVideo.muxPlaybackId}.m3u8` : (currentVideo.url || ''),
        video: currentVideo,
        thumbnailUrl: currentVideo.thumbnailUrl,
        subtitle: currentVideo.ownerName || 'Creator',
      }]);
    }
  }, [folderFiles, currentFile, currentVideo]);

  const resolvedUrl = useMemo(() => {
    if (playlist[playlistIndex]?.url) return playlist[playlistIndex].url;
    if (currentFile?.url) return currentFile.url;
    if (initialSrc) return initialSrc;
    if (initialMuxId) return `https://stream.mux.com/${initialMuxId}.m3u8`;
    if (currentVideo?.muxPlaybackId) return `https://stream.mux.com/${currentVideo.muxPlaybackId}.m3u8`;
    if (currentVideo?.url) return currentVideo.url;
    return '';
  }, [playlist, playlistIndex, currentFile, initialSrc, initialMuxId, currentVideo]);

  const activeTitle = useMemo(() => {
    if (playlist[playlistIndex]?.title) return playlist[playlistIndex].title;
    if (currentFile?.name) return currentFile.name;
    if (initialTitle) return initialTitle;
    if (currentVideo?.title) return currentVideo.title;
    if (album?.title) return album.title;
    return 'Untitled Video';
  }, [playlist, playlistIndex, currentFile, initialTitle, currentVideo, album]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !resolvedUrl) return;

    let isCancelled = false;
    const isM3u8 = resolvedUrl.includes('.m3u8') || resolvedUrl.includes('stream.mux.com');

    if (isM3u8) {
      (async () => {
        try {
          const { default: Hls } = await import('hls.js');
          if (isCancelled) return;

          if (Hls.isSupported()) {
            if (hlsRef.current) hlsRef.current.destroy();

            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
            });
            hlsRef.current = hls;

            hls.loadSource(resolvedUrl);
            hls.attachMedia(el);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (isCancelled) return;
              if (hls.audioTracks && hls.audioTracks.length > 0) {
                setAvailableAudioTracks(
                  hls.audioTracks.map((t: any, i: number) => ({
                    id: i,
                    label: t.name || `Track ${i + 1} (${t.lang || 'audio'})`,
                    language: t.lang || 'en',
                  }))
                );
              }
              el.play().catch(() => {
                el.muted = true;
                el.play().catch(() => {});
              });
            });

            hls.on(Hls.Events.ERROR, (_: any, data: any) => {
              if (data.fatal) {
                console.warn('[UniversalVideoPlayer] HLS fatal error', data);
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
                else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                else hls.destroy();
              }
            });
          } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
            el.src = resolvedUrl;
            el.play().catch(() => {});
          }
        } catch (e) {
          console.error('[UniversalVideoPlayer] Error initializing HLS', e);
          el.src = resolvedUrl;
          el.play().catch(() => {});
        }
      })();
    } else {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      el.src = resolvedUrl;
      el.play().catch(() => {});
    }

    return () => {
      isCancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [resolvedUrl]);

  const initAudioDsp = useCallback(() => {
    const el = videoRef.current;
    if (!el || audioCtxRef.current) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(el);
      audioSourceRef.current = source;

      const dialogue = ctx.createBiquadFilter();
      dialogue.type = 'peaking';
      dialogue.frequency.value = 2800;
      dialogue.Q.value = 1.2;
      dialogue.gain.value = 0;
      dialogueFilterRef.current = dialogue;

      const bass = ctx.createBiquadFilter();
      bass.type = 'lowshelf';
      bass.frequency.value = 85;
      bass.gain.value = 0;
      bassFilterRef.current = bass;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = 0;
      comp.knee.value = 30;
      comp.ratio.value = 1;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      compressorRef.current = comp;

      const panner = ctx.createStereoPanner();
      panner.pan.value = 0;
      pannerRef.current = panner;

      source.connect(dialogue);
      dialogue.connect(bass);
      bass.connect(comp);
      comp.connect(panner);
      panner.connect(ctx.destination);
    } catch (err) {
      console.warn('[UniversalVideoPlayer] Web Audio DSP initialization failed:', err);
    }
  }, []);

  useEffect(() => {
    if (!audioCtxRef.current) return;
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    const dialogue = dialogueFilterRef.current;
    const bass = bassFilterRef.current;
    const comp = compressorRef.current;

    if (!dialogue || !bass || !comp) return;

    if (activeAudioPreset === 'bypass') {
      dialogue.gain.value = 0;
      bass.gain.value = 0;
      comp.threshold.value = 0;
      comp.ratio.value = 1;
    } else if (activeAudioPreset === 'dialogue') {
      dialogue.gain.value = 6.5;
      bass.gain.value = -2;
      comp.threshold.value = -12;
      comp.ratio.value = 2.5;
    } else if (activeAudioPreset === 'bass') {
      dialogue.gain.value = 0;
      bass.gain.value = 7.5;
      comp.threshold.value = -6;
      comp.ratio.value = 2;
    } else if (activeAudioPreset === 'spatial') {
      dialogue.gain.value = 2;
      bass.gain.value = 3;
      comp.threshold.value = -10;
      comp.ratio.value = 2;
    } else if (activeAudioPreset === 'night') {
      dialogue.gain.value = 4;
      bass.gain.value = -4;
      comp.threshold.value = -26;
      comp.ratio.value = 12;
    }
  }, [activeAudioPreset]);

  const switchAudioTrack = useCallback((trackId: string | number) => {
    setSelectedAudioTrack(trackId);
    if (hlsRef.current && typeof trackId === 'number') {
      hlsRef.current.audioTrack = trackId;
    }
  }, []);

  useEffect(() => {
    if (currentVideo?.id) {
      const unsub = listenToVideoComments(currentVideo.id, (comments: any[]) => {
        // VideoComment.timestamp is when it was posted; mediaTimestamp (optional) is the spot in the video.
        setCommentsList(comments.map((c: any) => ({
          ...c,
          userName: c.userName || c.authorName || 'User',
          userPhoto: c.userPhoto || c.authorPhoto,
          createdAt: c.createdAt ?? c.timestamp,
        })));
      });
      return unsub;
    }

    const assetId = currentFile?.name || activeTitle;
    listHqComments(assetId)
      .then((notes) => {
        setCommentsList(
          notes.map(n => ({
            id: n.id,
            userName: n.authorName,
            userPhoto: n.authorPhoto,
            text: n.body,
            timestamp: (n as any).timeStartSeconds || null,
            createdAt: n.createdAt,
            isAssetNote: true,
          }))
        );
      })
      .catch(() => {
        setCommentsList([
          {
            id: 'note_1',
            userName: 'Director Note',
            text: 'Check color grading on skin tones in second act.',
            timestamp: 14.5,
            createdAt: Date.now() - 3600000,
            isAssetNote: true,
          }
        ]);
      });
  }, [currentVideo, currentFile, activeTitle]);

  const handlePostComment = async () => {
    if (!commentInput.trim()) return;
    setIsPostingComment(true);

    const timeToAttach = includeTimestamp ? currentTime : null;
    const bodyText = timeToAttach !== null
      ? `[${formatTime(timeToAttach)}] ${commentInput.trim()}`
      : commentInput.trim();

    try {
      if (currentVideo?.id && currentUser) {
        await postVideoComment(currentVideo.id, commentInput.trim(), undefined, undefined, timeToAttach ?? undefined);
      } else {
        const assetId = currentFile?.name || activeTitle;
        const fakeOrgAsset: OrgAsset = {
          id: assetId,
          scopeKind: 'PERSONAL',
          scopeId: currentUser?.uid || 'local',
          ownerUid: currentUser?.uid || 'local',
          ownerName: currentUser?.displayName || 'Editor',
          name: assetId,
          type: 'VIDEO',
          service: 'REELLO',
          status: 'DRAFT',
          scanStatus: 'CLEAN',
          versionCount: 1,
          storageBytes: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await addHqComment({
          assetId,
          versionId: 'v1',
          body: bodyText,
          timeStartSeconds: timeToAttach ?? undefined,
        }, fakeOrgAsset);

        setCommentsList(prev => [
          ...prev,
          {
            id: `local_${Date.now()}`,
            userName: currentUser?.displayName || 'You',
            userPhoto: currentUser?.photoURL,
            text: bodyText,
            timestamp: timeToAttach,
            createdAt: Date.now(),
            isAssetNote: true,
          }
        ]);
      }
      setCommentInput('');
    } catch (err) {
      console.error('[UniversalVideoPlayer] Failed to post note/comment:', err);
    } finally {
      setIsPostingComment(false);
    }
  };

  const togglePlay = () => {
    initAudioDsp();
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (timeInSeconds: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(duration, timeInSeconds));
    setCurrentTime(el.currentTime);
  };

  const stepFrame = (deltaFrames: number, fps = 24) => {
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    setIsPlaying(false);
    el.currentTime = Math.max(0, Math.min(duration, el.currentTime + (deltaFrames / fps)));
    setCurrentTime(el.currentTime);
  };

  const handleNextTrack = () => {
    if (playlist.length <= 1) return;
    if (isShuffle) {
      const nextIdx = Math.floor(Math.random() * playlist.length);
      setPlaylistIndex(nextIdx);
    } else {
      setPlaylistIndex((playlistIndex + 1) % playlist.length);
    }
  };

  const handlePrevTrack = () => {
    if (playlist.length <= 1) return;
    setPlaylistIndex((playlistIndex - 1 + playlist.length) % playlist.length);
  };

  // Keep the fullscreen flag honest (Esc, F11, the browser UI all change it).
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Taleo is a cinema experience: go full screen when it opens (needs the user gesture that opened it; ignore if refused).
  useEffect(() => {
    if (activeContext !== 'TALEO') return;
    const el = containerRef.current;
    if (el && !document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }, []);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // The video actually on screen (the playlist can advance past the one we were opened with).
  const activeVideo = playlist[playlistIndex]?.video ?? currentVideo;
  const canLens = !!activeVideo?.muxPlaybackId;

  // Watch party (synchronized viewing): the host broadcasts, followers are slaved to the host.
  const [activePartyId, setActivePartyId] = useState<string | null>(initialPartyId ?? null);
  useEffect(() => { setActivePartyId(initialPartyId ?? null); }, [initialPartyId]);
  const party = useParty(activePartyId);

  useEffect(() => {
    if (!activePartyId || !party.isHost || !activeVideo) return;
    const el = videoRef.current;
    if (!el) return;
    const push = () => party.broadcast({ isPlaying: !el.paused, positionSec: el.currentTime || 0, contentId: activeVideo.id });
    el.addEventListener('play', push);
    el.addEventListener('pause', push);
    el.addEventListener('seeked', push);
    push();
    const hb = setInterval(() => { if (!el.paused) push(); }, 4000);
    return () => {
      el.removeEventListener('play', push);
      el.removeEventListener('pause', push);
      el.removeEventListener('seeked', push);
      clearInterval(hb);
    };
  }, [activePartyId, party.isHost, activeVideo?.id, resolvedUrl]);

  useEffect(() => {
    if (!activePartyId || !party.isFollower) return;
    const apply = () => {
      const el = videoRef.current;
      if (!el) return;
      const { targetPositionSec, shouldPlay } = party.getTarget();
      if (shouldResync(el.currentTime || 0, targetPositionSec)) { try { el.currentTime = targetPositionSec; } catch { /* */ } }
      if (shouldPlay && el.paused) { el.play().catch(() => { el.muted = true; el.play().catch(() => {}); }); }
      else if (!shouldPlay && !el.paused) { el.pause(); }
    };
    apply();
    const iv = setInterval(apply, 1000);
    return () => clearInterval(iv);
  }, [activePartyId, party.isFollower, party.playback?.seq]);

  const startWatchParty = async () => {
    if (!activeVideo) return;
    try {
      const id = await createParty({
        kind: 'WATCH',
        content: { type: 'VIDEO', id: activeVideo.id, title: activeVideo.title, thumbnail: activeVideo.thumbnailUrl || (activeVideo as any).coverImageUrl, url: activeVideo.url, muxPlaybackId: activeVideo.muxPlaybackId },
        initial: { positionSec: videoRef.current?.currentTime || 0, isPlaying: !videoRef.current?.paused },
      });
      setActivePartyId(id);
      const url = partyShareUrl(id);
      if (navigator.share) navigator.share({ title: `Watch "${activeVideo.title}" together on Plajah`, url }).catch(() => {});
      else navigator.clipboard?.writeText(url).catch(() => {});
    } catch (e) { console.error('start watch party failed', e); }
  };
  const leaveWatchParty = () => {
    if (party.isHost) party.end();
    setActivePartyId(null);
  };


  return (
    <div
      ref={containerRef}
      onMouseMove={resetHudTimeout}
      onTouchStart={resetHudTimeout}
      onKeyDown={resetHudTimeout}
      onClick={resetHudTimeout}
      className={`relative w-full h-full min-h-screen bg-[#07090E] text-white flex flex-col select-none overflow-hidden ${isPlaying && !hudVisible ? 'cursor-none' : ''}`}
      style={{ ['--ua' as any]: activeContext === 'LOCAL' ? '#F5B301' : '#D40055', ['--ub' as any]: activeContext === 'LOCAL' ? '#F5B301' : '#A020F0' }}
    >
      {showUpNext && upNext && <UpNextOverlay {...upNext} />}
      {activeLook === 'crt' && (
        <div className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.35)_50%)] bg-[length:100%_4px] opacity-60" />
      )}
      {activeLook === 'grain' && (
        <div className="pointer-events-none absolute inset-0 z-20 opacity-20 mix-blend-overlay bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
      )}

      {showLocalShare && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm" onClick={() => setShowLocalShare(false)}>
          <div role="dialog" aria-label="Share this video" onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0a0a0a] p-8 shadow-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">Share this video</p>
            <h3 className="text-xl font-black mb-3">Upload it to Reello to share it?</h3>
            <p className="text-sm text-white/65 leading-relaxed mb-6">
              This video is on your device and stays private. To share it, it has to be uploaded to Reello first.
              Before it uploads, you will be asked to confirm that you own it or have the rights to share it.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowLocalShare(false)}
                className="flex-1 py-3 rounded-full border border-white/15 text-[11px] font-black uppercase tracking-widest text-white/60 hover:text-white">Not now</button>
              <button
                onClick={() => { const f = playlist[playlistIndex]?.file ?? currentFile; setShowLocalShare(false); if (f) onUploadToReello?.(f); }}
                className="flex-1 py-3 rounded-full text-[11px] font-black uppercase tracking-widest text-white"
                style={{ background: 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' }}>Yes, upload to Reello</button>
            </div>
          </div>
        </div>
      )}

      {activePartyId && (
        <div className="absolute top-3 left-3 right-3 z-40 flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-[#D40055]/30 bg-gradient-to-r from-[#6B0099]/60 to-[#D40055]/60 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <Radio size={14} className="text-[#ff9cc4] shrink-0" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white flex-1 min-w-0 truncate">
            {party.isHost ? 'Hosting watch party' : `Following ${party.party?.hostName || 'the host'}`}
            <span className="text-white/50"> · </span>
            <span className="inline-flex items-center gap-1 text-white/80"><Users size={11} /> {party.viewerCount} watching</span>
            {party.isFollower && <span className="text-white/50 normal-case tracking-normal"> - synced to host</span>}
          </p>
          {party.isHost && (
            <button
              onClick={() => { const u = partyShareUrl(activePartyId); if (navigator.share) navigator.share({ title: `Watch "${activeVideo?.title || ''}" together on Plajah`, url: u }).catch(() => {}); else navigator.clipboard?.writeText(u).catch(() => {}); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-[9px] font-black uppercase tracking-widest shrink-0"
            ><Share2 size={12} /> Invite</button>
          )}
          <button onClick={leaveWatchParty} className="px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white/80 hover:text-white text-[9px] font-black uppercase tracking-widest shrink-0">
            {party.isHost ? 'End' : 'Leave'}
          </button>
        </div>
      )}

      <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          crossOrigin="anonymous"
          playsInline
          style={{ filter: LOOK_FILTERS[activeLook].filter }}
          onPlay={() => { setIsPlaying(true); setShowUpNext(false); }}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={() => {
            if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
          }}
          onLoadedMetadata={() => {
            if (videoRef.current) setDuration(videoRef.current.duration);
          }}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onEnded={() => {
            if (repeatMode === 'one') {
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(() => {});
              }
            } else if (upNext?.items.length && playlist.length <= 1) {
              setShowUpNext(true);
            } else {
              handleNextTrack();
            }
          }}
          onClick={togglePlay}
          className={`w-full h-full object-contain cursor-pointer transition-all duration-300 ${
            activeContext === 'TALEO' ? 'max-h-[92vh]' : 'max-h-full'
          }`}
        />
        {canLens && lensId !== 'none' && (
          <LensVideoOverlay videoRef={videoRef} lens={lensId} fit="contain" onStatus={setLensStatus} />
        )}
        {canLens && lensOpen && (
          <div className="absolute right-3 bottom-24 z-40 w-72 max-w-[90%] rounded-xl bg-[#0F131C]/95 border border-white/15 p-2 shadow-2xl backdrop-blur-xl">
            <LensPicker value={lensId} onChange={id => { setLensId(id); if (id === 'none') setLensStatus(''); }} status={lensStatus} />
          </div>
        )}

        {isBuffering && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-30">
            <div className="w-12 h-12 border-4 border-[color-mix(in_srgb,var(--ua)_20%,transparent)] border-t-amber-500 rounded-full animate-spin" />
          </div>
        )}

        {!isPlaying && !isBuffering && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            onClick={togglePlay}
            className="absolute z-30 w-20 h-20 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all shadow-2xl hover:scale-105"
          >
            <Play size={36} className="ml-1 text-[var(--ua)]" />
          </motion.button>
        )}

        {activeContext === 'REELLO' && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`absolute right-4 bottom-28 z-30 flex flex-col items-center gap-4 text-white transition-opacity duration-300 ${hudVisible || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <button
              onClick={() => {}}
              className="w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 backdrop-blur-md flex flex-col items-center justify-center gap-1 transition-all group"
            >
              <Heart size={22} className="text-white/80 group-hover:text-rose-500 group-hover:scale-110 transition-all" />
              <span className="text-[9px] font-bold text-white/70">Like</span>
            </button>

            <button
              onClick={() => setShowComments(!showComments)}
              className={`w-12 h-12 rounded-full border backdrop-blur-md flex flex-col items-center justify-center gap-1 transition-all group ${
                showComments ? 'bg-[color-mix(in_srgb,var(--ua)_20%,transparent)] border-[color-mix(in_srgb,var(--ua)_60%,transparent)] text-[var(--ua)]' : 'bg-black/50 hover:bg-black/80 border-white/10 text-white/80'
              }`}
            >
              <MessageCircle size={22} className="group-hover:scale-110 transition-all" />
              <span className="text-[9px] font-bold">{commentsList.length}</span>
            </button>

            {/* Local file: private, so sharing means uploading to Reello first (with the rights declaration). */}
            {activeContext === 'LOCAL' && (playlist[playlistIndex]?.file ?? currentFile) && onUploadToReello && (
              <button
                onClick={() => setShowLocalShare(true)}
                aria-label="Share"
                className="w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 backdrop-blur-md flex flex-col items-center justify-center gap-1 transition-all group"
              >
                <Share2 size={22} className="text-white/80 group-hover:text-[var(--ub)] group-hover:scale-110 transition-all" />
                <span className="text-[9px] font-bold text-white/70">Share</span>
              </button>
            )}
            {/* Platform share (copy / social / Post to Plajah / Show Mode). Online videos only: local files are private. */}
            {activeVideo && (activeContext === 'REELLO' || activeContext === 'TALEO') && (
              <ShareButton
                title={activeVideo.title || activeTitle}
                text={`Check out ${activeVideo.title || activeTitle} on Plajah`}
                url={buildShareUrl('video', activeVideo.id)}
                imageUrl={activeVideo.thumbnailUrl || (activeVideo as any).coverImageUrl}
                artist={(activeVideo as any).ownerName || (activeVideo as any).artist}
                contentType={(activeVideo as any).isCinema || /cinema|film|movie/i.test((activeVideo as any).genre || '') ? 'movie' : 'video'}
                ctaText={(activeVideo as any).isCinema || /cinema|film|movie/i.test((activeVideo as any).genre || '') ? '▶ STREAM FILM ON TALEO' : '▶ WATCH FULL CLIP ON PLAJAH'}
                plajahLabel="Post to Plajah feed"
                onPostToPlajah={currentUser ? async () => {
                  await createPost({
                    text: `🎬 ${activeVideo.title}`,
                    media: [{
                      type: 'VIDEO',
                      url: activeVideo.url || '',
                      id: activeVideo.id,
                      title: activeVideo.title,
                      thumbnail: activeVideo.thumbnailUrl || (activeVideo as any).coverImageUrl,
                      muxPlaybackId: (activeVideo as any).muxPlaybackId,
                    }],
                  } as any);
                } : undefined}
                className="w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 backdrop-blur-md flex flex-col items-center justify-center gap-1 transition-all group"
              >
                <Share2 size={22} className="text-white/80 group-hover:text-[var(--ub)] group-hover:scale-110 transition-all" />
                <span className="text-[9px] font-bold text-white/70">Share</span>
              </ShareButton>
            )}

            <button
              onClick={() => setIsPlaylistDrawerOpen(true)}
              className="w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 backdrop-blur-md flex flex-col items-center justify-center gap-1 transition-all group"
            >
              <List size={22} className="text-white/80 group-hover:text-[var(--ua)] group-hover:scale-110 transition-all" />
              <span className="text-[9px] font-bold text-white/70">Queue</span>
            </button>
          </motion.div>
        )}

        <AnimatePresence>
          {hudVisible && (
            <motion.header
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-0 inset-x-0 z-40 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between pointer-events-auto backdrop-blur-[2px]"
            >
              <div className="flex items-center gap-3">
                {onClose && (
                  <button
                    onClick={onClose}
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white transition-all"
                    title="Close player"
                  >
                    <ArrowLeft size={18} />
                  </button>
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm md:text-base font-semibold text-white tracking-wide truncate max-w-md">
                      {activeTitle}
                    </h1>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--ua)_20%,transparent)] text-[var(--ua)] border border-[color-mix(in_srgb,var(--ua)_40%,transparent)]">
                      {activeContext === 'LOCAL' && 'Desktop File'}
                      {activeContext === 'REELLO' && 'Reello Universal'}
                      {activeContext === 'TALEO' && 'Taleo Cinema'}
                      {activeContext === 'ASSET_HQ' && 'Asset HQ QC'}
                    </span>
                  </div>

                  {currentFile?.folderPath && (
                    <p className="text-[11px] text-white/50 truncate max-w-lg">
                      {currentFile.folderPath}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-black/40 border border-white/10 rounded-lg p-0.5 text-xs">
                  {(['REELLO', 'TALEO', 'LOCAL', 'ASSET_HQ'] as PlayerContext[]).map((ctx) => (
                    <button
                      key={ctx}
                      onClick={() => setActiveContext(ctx)}
                      className={`px-2.5 py-1 rounded text-[10px] font-medium transition-all ${
                        activeContext === ctx
                          ? 'bg-[var(--ua)] text-black font-semibold shadow-sm'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {ctx === 'LOCAL' ? 'Local' : ctx === 'ASSET_HQ' ? 'QC/HQ' : ctx}
                    </button>
                  ))}
                </div>

                {!activePartyId && activeVideo && (activeContext === 'REELLO' || activeContext === 'TALEO') && (
                  <button
                    onClick={() => currentUser ? startWatchParty() : alert('Sign in to host a watch party.')}
                    title="Watch Party" aria-label="Watch Party"
                    className="h-8 px-2.5 rounded-lg border text-xs flex items-center gap-1.5 transition-all bg-[#D40055]/15 hover:bg-[#D40055]/25 border-[#D40055]/40 text-[#ff9cc4]"
                  >
                    <Users size={14} />
                    <span className="hidden sm:inline font-medium">Watch Party</span>
                  </button>
                )}

                {canLens && (
                  <button
                    onClick={() => setLensOpen(o => !o)}
                    aria-label="Lenses" aria-pressed={lensOpen} title="Lenses"
                    className={`h-8 px-2.5 rounded-lg border text-xs flex items-center gap-1.5 transition-all ${
                      lensId !== 'none'
                        ? 'bg-[color-mix(in_srgb,var(--ua)_20%,transparent)] border-[color-mix(in_srgb,var(--ua)_50%,transparent)] text-[var(--ua)]'
                        : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/90'
                    }`}
                  >
                    <Sparkles size={14} className="text-[var(--ua)]" />
                    <span className="hidden sm:inline font-medium">Lenses</span>
                  </button>
                )}

                <div className="relative">
                  <button
                    onClick={() => {
                      setShowLookMenu(!showLookMenu);
                      setShowAudioMenu(false);
                      setShowTrackMenu(false);
                    }}
                    className={`h-8 px-2.5 rounded-lg border text-xs flex items-center gap-1.5 transition-all ${
                      activeLook !== 'none'
                        ? 'bg-[color-mix(in_srgb,var(--ub)_20%,transparent)] border-[color-mix(in_srgb,var(--ub)_50%,transparent)] text-[var(--ub)]'
                        : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/90'
                    }`}
                  >
                    <Sparkles size={14} className="text-[var(--ub)]" />
                    <span className="hidden sm:inline font-medium">
                      {LOOK_FILTERS[activeLook].label}
                    </span>
                  </button>

                  {showLookMenu && (
                    <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#0F131C]/95 border border-white/15 p-2 shadow-2xl backdrop-blur-xl z-50">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 px-2 py-1">
                        Pixels Visual Look Filters
                      </div>
                      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                        {(Object.keys(LOOK_FILTERS) as PixelsLook[]).map((key) => (
                          <button
                            key={key}
                            onClick={() => {
                              setActiveLook(key);
                              setShowLookMenu(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-all ${
                              activeLook === key
                                ? 'bg-[color-mix(in_srgb,var(--ub)_20%,transparent)] text-[var(--ub)] border border-[color-mix(in_srgb,var(--ub)_30%,transparent)] font-medium'
                                : 'text-white/80 hover:bg-white/10'
                            }`}
                          >
                            <div>
                              <div>{LOOK_FILTERS[key].label}</div>
                              <div className="text-[10px] text-white/40">{LOOK_FILTERS[key].description}</div>
                            </div>
                            {activeLook === key && <Check size={14} className="text-[var(--ub)]" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    onClick={() => {
                      initAudioDsp();
                      setShowAudioMenu(!showAudioMenu);
                      setShowLookMenu(false);
                      setShowTrackMenu(false);
                    }}
                    className={`h-8 px-2.5 rounded-lg border text-xs flex items-center gap-1.5 transition-all ${
                      activeAudioPreset !== 'bypass'
                        ? 'bg-[color-mix(in_srgb,var(--ua)_20%,transparent)] border-[color-mix(in_srgb,var(--ua)_50%,transparent)] text-[var(--ua)]'
                        : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/90'
                    }`}
                  >
                    <Sliders size={14} className="text-[var(--ua)]" />
                    <span className="hidden sm:inline font-medium">
                      {AUDIO_PRESETS[activeAudioPreset].label}
                    </span>
                  </button>

                  {showAudioMenu && (
                    <div className="absolute right-0 mt-2 w-72 rounded-xl bg-[#0F131C]/95 border border-white/15 p-2 shadow-2xl backdrop-blur-xl z-50">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 px-2 py-1">
                        CrossOver Audio DSP Engine
                      </div>
                      <div className="space-y-1">
                        {(Object.keys(AUDIO_PRESETS) as AudioDspPreset[]).map((key) => (
                          <button
                            key={key}
                            onClick={() => {
                              setActiveAudioPreset(key);
                              setShowAudioMenu(false);
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-all ${
                              activeAudioPreset === key
                                ? 'bg-[color-mix(in_srgb,var(--ua)_20%,transparent)] text-[var(--ua)] border border-[color-mix(in_srgb,var(--ua)_30%,transparent)] font-medium'
                                : 'text-white/80 hover:bg-white/10'
                            }`}
                          >
                            <div>
                              <div className="font-medium">{AUDIO_PRESETS[key].label}</div>
                              <div className="text-[10px] text-white/40 leading-tight">{AUDIO_PRESETS[key].description}</div>
                            </div>
                            {activeAudioPreset === key && <Check size={14} className="text-[var(--ua)] shrink-0 ml-2" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    onClick={() => {
                      setShowTrackMenu(!showTrackMenu);
                      setShowLookMenu(false);
                      setShowAudioMenu(false);
                    }}
                    className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white/90 transition-all"
                    title="Audio Tracks & Languages"
                  >
                    <Headphones size={15} />
                  </button>

                  {showTrackMenu && (
                    <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#0F131C]/95 border border-white/15 p-2 shadow-2xl backdrop-blur-xl z-50">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 px-2 py-1">
                        Audio Channels & Streams
                      </div>
                      <div className="space-y-1">
                        {availableAudioTracks.map((tr) => (
                          <button
                            key={tr.id}
                            onClick={() => {
                              switchAudioTrack(tr.id);
                              setShowTrackMenu(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-all ${
                              selectedAudioTrack === tr.id
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium'
                                : 'text-white/80 hover:bg-white/10'
                            }`}
                          >
                            <span className="truncate">{tr.label}</span>
                            {selectedAudioTrack === tr.id && <Check size={14} className="text-purple-400 ml-2" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setIsPlaylistDrawerOpen(!isPlaylistDrawerOpen)}
                  className={`h-8 px-2.5 rounded-lg border text-xs flex items-center gap-1.5 transition-all ${
                    isPlaylistDrawerOpen
                      ? 'bg-[color-mix(in_srgb,var(--ua)_20%,transparent)] border-[color-mix(in_srgb,var(--ua)_50%,transparent)] text-[var(--ua)]'
                      : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/90'
                  }`}
                  title="Video Queue & Playlist"
                >
                  <List size={14} />
                  <span className="font-semibold">{playlist.length}</span>
                </button>
              </div>
            </motion.header>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {hudVisible && (
            <motion.footer
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-0 inset-x-0 z-40 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-2 pointer-events-auto backdrop-blur-[2px]"
            >
              <div className="flex items-center gap-3 group">
                <span className="text-xs font-mono text-white/70 w-12 text-right tabular-nums">
                  {activeContext === 'ASSET_HQ' ? formatTimecode(currentTime) : formatTime(currentTime)}
                </span>

                <div className="relative flex-1 flex items-center h-4 cursor-pointer">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => handleSeek(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[var(--ua)] hover:h-2 transition-all"
                  />
                </div>

                <span className="text-xs font-mono text-white/50 w-12 tabular-nums">
                  {activeContext === 'ASSET_HQ' ? formatTimecode(duration) : formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePrevTrack}
                    disabled={playlist.length <= 1}
                    className="text-white/70 hover:text-white disabled:opacity-30 transition-all"
                    title="Previous video"
                  >
                    <SkipBack size={20} />
                  </button>

                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 rounded-full bg-[var(--ua)] hover:bg-[var(--ua)] text-black flex items-center justify-center transition-all shadow-lg hover:scale-105"
                    title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                  >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                  </button>

                  <button
                    onClick={handleNextTrack}
                    disabled={playlist.length <= 1}
                    className="text-white/70 hover:text-white disabled:opacity-30 transition-all"
                    title="Next video"
                  >
                    <SkipForward size={20} />
                  </button>

                  {activeContext === 'ASSET_HQ' && (
                    <div className="flex items-center gap-1 ml-2 px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-xs">
                      <button
                        onClick={() => stepFrame(-1)}
                        className="px-1.5 py-0.5 hover:bg-white/10 rounded text-white/80"
                        title="Step backward 1 frame"
                      >
                        -1 Frame
                      </button>
                      <button
                        onClick={() => stepFrame(1)}
                        className="px-1.5 py-0.5 hover:bg-white/10 rounded text-white/80"
                        title="Step forward 1 frame"
                      >
                        +1 Frame
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 ml-2 group">
                    <button
                      onClick={() => {
                        const el = videoRef.current;
                        if (!el) return;
                        el.muted = !isMuted;
                        setIsMuted(!isMuted);
                      }}
                      className="text-white/70 hover:text-white transition-all"
                    >
                      {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setVolume(val);
                        setIsMuted(false);
                        if (videoRef.current) {
                          videoRef.current.volume = val;
                          videoRef.current.muted = false;
                        }
                      }}
                      className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[var(--ua)]"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <button
                      onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                      className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 font-mono"
                    >
                      {playbackSpeed}x
                    </button>
                    {showSpeedMenu && (
                      <div className="absolute bottom-full mb-2 right-0 bg-[#0F131C]/95 border border-white/15 p-1 rounded-lg shadow-xl z-50 flex flex-col gap-0.5">
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((spd) => (
                          <button
                            key={spd}
                            onClick={() => {
                              setPlaybackSpeed(spd);
                              if (videoRef.current) videoRef.current.playbackRate = spd;
                              setShowSpeedMenu(false);
                            }}
                            className={`px-3 py-1 rounded text-xs text-left ${
                              playbackSpeed === spd ? 'bg-[var(--ua)] text-black font-bold' : 'text-white/80 hover:bg-white/10'
                            }`}
                          >
                            {spd}x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setShowComments(!showComments)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                      showComments
                        ? 'bg-[color-mix(in_srgb,var(--ua)_20%,transparent)] border-[color-mix(in_srgb,var(--ua)_50%,transparent)] text-[var(--ua)]'
                        : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/80'
                    }`}
                  >
                    <MessageCircle size={14} />
                    <span className="hidden sm:inline">
                      {activeContext === 'ASSET_HQ' ? 'Review Notes' : 'Comments'} ({commentsList.length})
                    </span>
                  </button>

                  <button
                    onClick={toggleFullscreen}
                    className="text-white/70 hover:text-white transition-all p-1"
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
                  </button>
                </div>
              </div>
            </motion.footer>
          )}
        </AnimatePresence>
      </div>

      {/* Online comments: a full-height side drawer so the platform comment UI + composer always have room. */}
      {showComments && activeVideo && (activeContext === 'REELLO' || activeContext === 'TALEO') && (
        <div className="absolute top-0 right-0 bottom-0 w-[min(440px,100%)] z-50 bg-[#0B0E14]/95 border-l border-white/10 backdrop-blur-2xl flex flex-col">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <MessageCircle size={16} className="text-[var(--ua)]" />
              <span className="text-xs font-semibold tracking-wide">Comments</span>
            </div>
            <button onClick={() => setShowComments(false)} aria-label="Close comments" className="text-white/50 hover:text-white p-1"><X size={16} /></button>
          </div>
          <div className="flex-1 min-h-0 p-3 [&>div]:h-full [&>div]:max-h-none">
            <CommentSection
              comments={commentsList}
              onPostComment={(text, parentId, mediaTimestamp) => postVideoComment(activeVideo.id, text, parentId, undefined, mediaTimestamp)}
              onPostGif={(gifUrl, parentId) => postVideoComment(activeVideo.id, '', parentId, gifUrl)}
              currentUser={currentUser}
              title=""
              playbackTime={currentTime}
              onSeek={handleSeek}
            />
          </div>
        </div>
      )}

      <AnimatePresence>
        {showComments && !(activeVideo && (activeContext === 'REELLO' || activeContext === 'TALEO')) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: (activeVideo && (activeContext === 'REELLO' || activeContext === 'TALEO')) ? 380 : 260, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full bg-[#0B0E14] border-t border-white/10 flex flex-col z-30 shrink-0"
          >
            <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <MessageCircle size={16} className="text-[var(--ua)]" />
                <span className="text-xs font-semibold text-white tracking-wide">
                  {activeContext === 'ASSET_HQ' ? 'Frame-Accurate Asset Notes & Feedback' : 'Comments'}
                </span>
                <span className="text-[10px] text-white/40">({commentsList.length})</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowComments(false)}
                  className="text-white/40 hover:text-white text-xs p-1"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {activeVideo && (activeContext === 'REELLO' || activeContext === 'TALEO') ? (
              /* Platform comment system + universal composer. A comment can optionally be pinned to the current moment. */
              <div className="flex-1 min-h-0 overflow-hidden">
                <CommentSection
                  comments={commentsList}
                  onPostComment={(text, parentId, mediaTimestamp) => postVideoComment(activeVideo.id, text, parentId, undefined, mediaTimestamp)}
                  onPostGif={(gifUrl, parentId) => postVideoComment(activeVideo.id, '', parentId, gifUrl)}
                  currentUser={currentUser}
                  title=""
                  playbackTime={currentTime}
                  onSeek={handleSeek}
                />
              </div>
            ) : (
              <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {commentsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-white/40 text-xs py-6">
                  <Clock size={24} className="mb-2 opacity-50 text-[var(--ua)]" />
                  <p>No comments or notes yet.</p>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    Drop a timestamped note at {formatTime(currentTime)} to start review.
                  </p>
                </div>
              ) : (
                commentsList.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5 text-xs group">
                    <div className="w-7 h-7 rounded-full bg-white/10 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center font-bold text-[var(--ua)]">
                      {c.userPhoto ? (
                        <img src={c.userPhoto} alt={c.userName} className="w-full h-full object-cover" />
                      ) : (
                        c.userName?.[0]?.toUpperCase() || 'U'
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white/90">{c.userName || 'Anonymous'}</span>
                        {c.timestamp !== null && c.timestamp !== undefined && (
                          <button
                            onClick={() => handleSeek(c.timestamp)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--ua)_20%,transparent)] text-[var(--ua)] hover:bg-[color-mix(in_srgb,var(--ua)_30%,transparent)] text-[10px] font-mono font-medium transition-all"
                            title={`Jump to ${formatTime(c.timestamp)}`}
                          >
                            <Clock size={10} />
                            {formatTime(c.timestamp)}
                          </button>
                        )}
                        {c.isAssetNote && (
                          <span className="text-[9px] px-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            HQ Note
                          </span>
                        )}
                      </div>
                      <p className="text-white/80 mt-0.5 break-words text-[11px] leading-relaxed">
                        {c.text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-2.5 border-t border-white/10 bg-black/40 flex items-center gap-2">
              <button
                onClick={() => setIncludeTimestamp(!includeTimestamp)}
                className={`px-2 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1 transition-all ${
                  includeTimestamp
                    ? 'bg-[color-mix(in_srgb,var(--ua)_20%,transparent)] border-[color-mix(in_srgb,var(--ua)_50%,transparent)] text-[var(--ua)]'
                    : 'bg-white/5 border-white/10 text-white/50'
                }`}
                title={includeTimestamp ? 'Timestamp on: this comment will jump to this moment. Click to turn off.' : 'Timestamp off. Click to pin this comment to the current moment.'}
                aria-pressed={includeTimestamp}
              >
                <Clock size={13} />
                <span>{formatTime(currentTime)}</span>
              </button>

              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePostComment();
                }}
                placeholder={
                  activeContext === 'ASSET_HQ'
                    ? `Add review note at ${formatTime(currentTime)}...`
                    : (includeTimestamp ? `Add a comment at ${formatTime(currentTime)}...` : 'Add a comment...')
                }
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[color-mix(in_srgb,var(--ua)_50%,transparent)]"
              />

              <button
                onClick={handlePostComment}
                disabled={isPostingComment || !commentInput.trim()}
                className="px-3 py-1.5 rounded-lg bg-[var(--ua)] hover:bg-[var(--ua)] disabled:opacity-40 text-black text-xs font-semibold flex items-center gap-1 transition-all"
              >
                <Send size={13} />
                <span>Post</span>
              </button>
            </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPlaylistDrawerOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute top-0 right-0 bottom-0 w-80 max-w-full bg-[#0C1017]/95 border-l border-white/10 backdrop-blur-2xl z-50 flex flex-col shadow-2xl"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <List size={18} className="text-[var(--ua)]" />
                <h3 className="font-semibold text-sm text-white">Video Queue & Playlist</h3>
                <span className="text-xs text-white/40">({playlist.length})</span>
              </div>
              <button
                onClick={() => setIsPlaylistDrawerOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {playlist.map((item, idx) => {
                const isSelected = idx === playlistIndex;
                return (
                  <button
                    key={item.id}
                    onClick={() => setPlaylistIndex(idx)}
                    className={`w-full text-left p-2.5 rounded-xl flex items-center gap-3 transition-all ${
                      isSelected
                        ? 'bg-[color-mix(in_srgb,var(--ua)_20%,transparent)] border border-[color-mix(in_srgb,var(--ua)_40%,transparent)] text-white'
                        : 'hover:bg-white/5 border border-transparent text-white/80'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
                      {isSelected && isPlaying ? (
                        <div className="flex items-end gap-0.5 h-3">
                          <span className="w-0.5 h-full bg-[var(--ua)] animate-pulse" />
                          <span className="w-0.5 h-2/3 bg-[var(--ua)] animate-pulse delay-75" />
                          <span className="w-0.5 h-full bg-[var(--ua)] animate-pulse delay-150" />
                        </div>
                      ) : (
                        <FileVideo size={16} className={isSelected ? 'text-[var(--ua)]' : 'text-white/40'} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate leading-tight">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-[10px] text-white/40 truncate mt-0.5">{item.subtitle}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-3 border-t border-white/10 bg-black/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsShuffle(!isShuffle)}
                  className={`p-1.5 rounded-lg border ${
                    isShuffle ? 'bg-[color-mix(in_srgb,var(--ua)_20%,transparent)] border-[color-mix(in_srgb,var(--ua)_50%,transparent)] text-[var(--ua)]' : 'bg-white/5 border-white/10 text-white/50'
                  }`}
                  title="Shuffle queue"
                >
                  <Shuffle size={14} />
                </button>
                <button
                  onClick={() => {
                    const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
                    const next = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
                    setRepeatMode(next);
                  }}
                  className={`p-1.5 rounded-lg border flex items-center gap-1 ${
                    repeatMode !== 'off' ? 'bg-[color-mix(in_srgb,var(--ua)_20%,transparent)] border-[color-mix(in_srgb,var(--ua)_50%,transparent)] text-[var(--ua)]' : 'bg-white/5 border-white/10 text-white/50'
                  }`}
                  title={`Repeat: ${repeatMode}`}
                >
                  <Repeat size={14} />
                  {repeatMode === 'one' && <span className="text-[9px] font-bold">1</span>}
                </button>
              </div>

              <button
                onClick={() => {
                  const playlistTitle = prompt('Name your new video playlist:', 'My Video Playlist');
                  if (playlistTitle) {
                    try {
                      const stored = JSON.parse(localStorage.getItem('plajah_user_video_playlists') || '[]');
                      stored.push({
                        id: `pl_${Date.now()}`,
                        title: playlistTitle,
                        items: playlist,
                        createdAt: Date.now(),
                      });
                      localStorage.setItem('plajah_user_video_playlists', JSON.stringify(stored));
                      alert(`Saved "${playlistTitle}" with ${playlist.length} videos!`);
                    } catch (e) {
                      console.error(e);
                    }
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white font-medium flex items-center gap-1 text-[11px]"
              >
                Save Playlist
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReelloUniversalVideoPlayer;
