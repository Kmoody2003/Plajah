import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Album, Track, Comment, Character, IPWorld, Video } from '../types';
import { buildShareUrl } from '../services/deepLinkService';
import { getActiveCaption } from '../src/lib/captions';
import WorldBadge from './WorldBadge';
import ImmersiveBadge from './ImmersiveBadge';
import Visualizer from './Visualizer';
import AnimatedSlideshow from './AnimatedSlideshow';
import { resolveSlideshowImages } from '../services/slideshow';
import ScrollingWaveform from './ScrollingWaveform';
import { getCachedAnalysis, getOrComputeAnalysis } from '../services/djAnalysis';
import { getTrackStream } from '../services/choraStreamService';
import { canUseFxStage } from '../services/tvCapabilities';
import { getPlatformInfo } from '../hooks/usePlatform';
import AlbumTvView from './tv/AlbumTvView';
import PaintPoolVisualizer from './PaintPoolVisualizer';
import FxStageVisualizers, { type FxEngine, fxPresetName, FX_ENGINE_PRESETS, loadMilkdropNames } from './FxStageVisualizers';
import Logo from './Logo';
import { publishToCloud, postComment, subscribeToComments, updateAlbum, uploadFile, fetchWorldCharacters, fetchWorldContentByWorldId, assignTrackAsHnsSlot, saveHideNSeekConfig, createPost, auth } from '../services/backendService';
import ShareButton from './ShareButton';
import ChoraQualityButton from './ChoraQualityButton';
import OfflineDownloadButton from './OfflineDownloadButton';
import PlaylistPickerModal from './PlaylistPickerModal';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import { createParty, partyShareUrl, shouldResync } from '../services/partyService';
import { useParty } from '../hooks/useParty';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Pause, ArrowLeft, Disc, Globe,
  Copy, Check, X, Loader2, Cloud, Sparkles, Share2, Link as LinkIcon,
  Twitter, Facebook, Linkedin, ExternalLink, Zap,
  Instagram, Youtube, Mail,
  Layers, Music2, Plus, MessageSquare, Send, User, Users, Clock, Activity, BookOpen, ChevronDown, ChevronUp, Image as ImageIcon,
  AlertCircle, Video as VideoIcon, Radio, List, HeartHandshake, Heart, Pen, Maximize2, Minimize2, GripVertical, Upload, EyeOff, Eye,
  SkipBack, SkipForward, ChevronLeft, ChevronRight, Waves, RotateCcw, ListPlus,
  Languages, RefreshCw, Film, ZapOff
} from 'lucide-react';

import { User as FirebaseUser } from 'firebase/auth';
import DonationModal from './DonationModal';
import DJModeView from './DJModeView';
import SmartLightingPanel from './SmartLightingPanel';
import GlobalPhotosView from './GlobalPhotosView';
import CommentSection from './CommentSection';
import The411 from './The411';
import { LyricItem, TimeCodedLyrics } from './LyricItem';
import { translateLyrics, LYRIC_LANGS } from '../services/lyricTranslator';
import HoverPreviewThumb, { previewSourceFor } from './HoverPreviewThumb';
import PlajahPlusButton from './PlajahPlusButton';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';
import { AdaptiveGrid, TYPE } from '../src/lib/designSystem';

type RepeatMode = 'NONE' | 'ONE' | 'ALL';

/**
 * ANIMATED SLIDESHOW COMPONENT
 */
const AtmosphericBackground: React.FC<{ album: Album; analyser: AnalyserNode | null; isPlaying: boolean; simplified?: boolean }> = ({ album, analyser, isPlaying, simplified }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [imgCorsError, setImgCorsError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Performance optimization for TV: skip if not playing or if simplified
    if (simplified && !isPlaying) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const img = new Image();
    img.src = album.coverImage;
    if (!imgCorsError) {
      img.crossOrigin = "anonymous";
    }

    img.onerror = () => {
      if (!imgCorsError) {
        setImgCorsError(true);
      }
    };

    const dataArray = new Uint8Array(analyser?.frequencyBinCount || 1024);
    let offset = 0;

    const render = () => {
      // Throttle render for TV performance
      if (simplified) {
        animationRef.current = requestAnimationFrame(() => {
          setTimeout(render, 33); // Cap to ~30fps for TV stability
        });
      } else {
        animationRef.current = requestAnimationFrame(render);
      }
      
      if (analyser) analyser.getByteFrequencyData(dataArray);

      const width = (canvas.width = window.innerWidth / (simplified ? 2 : 1));
      const height = (canvas.height = window.innerHeight / (simplified ? 2 : 1));

      let bass = 0;
      for (let i = 0; i < 10; i++) bass += dataArray[i];
      bass = (bass / 10) / 255;

      ctx.clearRect(0, 0, width, height);
      
      if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        // TV optimization: use simpler filter or no filter if simplified
        if (simplified) {
          ctx.globalAlpha = 0.2;
        } else {
          ctx.filter = `blur(40px) contrast(0.9) saturate(1.1)`;
          ctx.globalAlpha = 0.4;
        }
        
        offset += 0.0003;
        const driftX = Math.sin(offset) * 60;
        const driftY = Math.cos(offset * 1.2) * 60;
        const scale = 1.3;
        
        ctx.drawImage(img, (width - width*scale)/2 + driftX, (height - height*scale)/2 + driftY, width*scale, height*scale);
        ctx.restore();
      }

      // Darken and Vignette for better UI contrast
      const grad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height) * 1.1);
      grad.addColorStop(0, 'rgba(0,0,0,0.3)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.5)');
      grad.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      
      // Add a subtle noise texture for that "frosted" look - skip for TV
      if (!simplified) {
        ctx.globalAlpha = 0.03;
        for (let i = 0; i < 100; i++) {
          const x = Math.random() * width;
          const y = Math.random() * height;
          const size = Math.random() * 2;
          ctx.fillStyle = 'white';
          ctx.fillRect(x, y, size, size);
        }
        ctx.globalAlpha = 1.0;
      }
    };

    render();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [album, analyser, isPlaying, simplified, imgCorsError]);

  return <canvas ref={canvasRef} className={`fixed inset-0 w-full h-full pointer-events-none z-0 ${simplified ? 'opacity-20 scale-110 blur-xl' : 'opacity-40'}`} />;
};

const HUDCommentModule: React.FC<{ album: Album; trackId: string | null; videoId?: string | null; isPublic: boolean; themeColor: string; user: FirebaseUser | null; minimal?: boolean; onVisitUser?: (uid: string) => void; onUpdate?: (album: Album) => void }> = ({ album, trackId, videoId = null, isPublic, themeColor, user, minimal, onVisitUser, onUpdate }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isOpen, setIsOpen] = useState(!minimal);
  const [activeTab, setActiveTab] = useState<'COMMENTS' | 'STICKY'>('COMMENTS');
  const [newSticky, setNewSticky] = useState('');
  
  const isOwner = user?.uid === album.ownerId;
  const currentTrack = album.tracks.find(t => t.id === trackId);

  useEffect(() => {
    const unsubscribe = subscribeToComments(album.id, trackId, videoId, setComments);
    return () => unsubscribe();
  }, [album.id, trackId, videoId]);

  const handlePost = async (text: string, parentId?: string) => {
    if (!text.trim()) return;
    await postComment(album.id, {
      author: user?.displayName || 'LISTENER',
      text,
      timestamp: Date.now(),
      trackId: videoId ? undefined : (trackId || 'album'),
      videoId: videoId || undefined,
      parentId: parentId || undefined
    });
  };

  const handlePostGif = async (gifUrl: string, parentId?: string) => {
    await postComment(album.id, {
      author: user?.displayName || 'LISTENER',
      text: '',
      gifUrl,
      timestamp: Date.now(),
      trackId: videoId ? undefined : (trackId || 'album'),
      videoId: videoId || undefined,
      parentId: parentId || undefined
    });
  };

  const handleAddSticky = async () => {
    if (!newSticky.trim() || !trackId || !onUpdate) return;
    
    const updatedTracks = album.tracks.map(t => {
      if (t.id === trackId) {
        return {
          ...t,
          artistNotes: [...(t.artistNotes || []), newSticky.trim()]
        };
      }
      return t;
    });

    const updatedAlbum = { ...album, tracks: updatedTracks };
    await updateAlbum(album.id, updatedAlbum);
    onUpdate(updatedAlbum);
    setNewSticky('');
  };

  const handleRemoveSticky = async (idx: number) => {
    if (!trackId || !onUpdate) return;

    const updatedTracks = album.tracks.map(t => {
      if (t.id === trackId) {
        const notes = [...(t.artistNotes || [])];
        notes.splice(idx, 1);
        return { ...t, artistNotes: notes };
      }
      return t;
    });

    const updatedAlbum = { ...album, tracks: updatedTracks };
    await updateAlbum(album.id, updatedAlbum);
    onUpdate(updatedAlbum);
  };

  if (!isOpen && minimal) {
    return (
      <button onClick={() => setIsOpen(true)} className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all py-4">
        <MessageSquare size={14} /> Open Comments ({comments.length})
        {currentTrack?.artistNotes && currentTrack.artistNotes.length > 0 && (
          <span className="flex items-center gap-1 text-small-orange">
            <Zap size={10} /> {currentTrack.artistNotes.length} Notes
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={`flex flex-col h-full font-sans transition-all duration-500 animate-in slide-in-from-top-4`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('COMMENTS')}
            className={`text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'COMMENTS' ? 'text-small-orange' : 'text-white/20 hover:text-white'}`}
          >
            Feed
          </button>
          <button 
            onClick={() => setActiveTab('STICKY')}
            className={`text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'STICKY' ? 'text-small-orange' : 'text-white/20 hover:text-white'}`}
          >
            Sticky Notes {currentTrack?.artistNotes?.length ? `(${currentTrack.artistNotes.length})` : ''}
          </button>
        </div>
        {minimal && (
          <button onClick={() => setIsOpen(false)}><ChevronUp size={16} className="text-white/20" /></button>
        )}
      </div>

      <div className={minimal ? 'max-h-[400px]' : 'h-full flex-1 overflow-hidden'}>
        {activeTab === 'COMMENTS' ? (
          <CommentSection
            comments={comments}
            onPostComment={handlePost}
            onPostGif={handlePostGif}
            onVisitUser={onVisitUser}
            currentUser={user}
            themeColor={themeColor}
            title={minimal ? "Quick Feed" : "Global Discussion"}
            onClose={() => setIsOpen(false)}
          />
        ) : (
          <div className="h-full flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            {isOwner && (
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-small-orange">Leave a context note</span>
                <textarea 
                  value={newSticky}
                  onChange={(e) => setNewSticky(e.target.value)}
                  placeholder="Share the vibe or background behind this track..."
                  className="w-full bg-transparent border-none outline-none text-xs font-bold p-0 resize-none h-20 placeholder:text-white/10"
                />
                <button 
                  onClick={handleAddSticky}
                  disabled={!newSticky.trim()}
                  className="w-full py-3 bg-white text-black rounded-xl text-[9px] font-black uppercase tracking-widest disabled:opacity-30 transition-all hover:bg-small-orange hover:text-white"
                >
                  Post Sticky Note
                </button>
              </div>
            )}
            
            <div className="space-y-3">
              {currentTrack?.artistNotes?.map((note, idx) => (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={idx} 
                  className="p-5 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-3xl relative group"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={12} className="text-small-orange" />
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/40">Artist Insight</span>
                  </div>
                  <p className="text-xs font-bold leading-relaxed tracking-wide text-white/80">{note}</p>
                  
                  {isOwner && (
                    <button 
                      onClick={() => handleRemoveSticky(idx)}
                      className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-red-500/20 text-white/10 hover:text-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  )}
                </motion.div>
              ))}
              
              {(!currentTrack?.artistNotes || currentTrack.artistNotes.length === 0) && (
                <div className="py-20 text-center space-y-4 opacity-20">
                  <Zap size={32} className="mx-auto" />
                  <p className="text-[10px] font-black uppercase tracking-widest">No artist notes for this track yet.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface PlayerViewProps {
  album: Album;
  onBack: () => void;
  onEdit?: (album: Album) => void;
  onUpdate?: (album: Album) => void;
  onPurchase?: (item: any, isAlbum: boolean) => void;
  onVisitUser?: (uid: string) => void;
  onNavigateToWorld?: (worldId: string, characterId?: string) => void;
  /** Open another album/video (e.g. from the TV album's "More From This World" row). */
  onOpenItem?: (item: any) => void;
  isPublic?: boolean;
  isPreview?: boolean;
  user: FirebaseUser | null;
  /** If opened from a shared listening-party link, the party to auto-join and follow. */
  partyId?: string;
}

// Amplitude-reactive bars — reads directly from Web Audio AnalyserNode via RAF
const AmplitudeBar: React.FC<{ analyser: AnalyserNode | null; isPlaying: boolean }> = ({ analyser, isPlaying }) => {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const BAR_COUNT = 7;

  useEffect(() => {
    const bars = barsRef.current;
    if (!analyser || !isPlaying) {
      bars.forEach(b => { if (b) { b.style.height = '2px'; b.style.opacity = '0.2'; } });
      return;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = bars[i];
        if (!bar) continue;
        const bucket = Math.floor((data.length / 3) * (i / BAR_COUNT));
        const val = data[bucket] / 255;
        bar.style.height = `${Math.max(2, val * 24)}px`;
        bar.style.opacity = String(0.3 + val * 0.7);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, isPlaying]);

  return (
    <div className="flex items-end gap-[2px] h-6 shrink-0">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <div
          key={i}
          ref={el => { barsRef.current[i] = el; }}
          className="w-[3px] rounded-full bg-small-orange"
          style={{ height: '2px', opacity: 0.2, transition: 'height 0.06s ease, opacity 0.06s ease' }}
        />
      ))}
    </div>
  );
};

// Caption ticker that scrolls through lyric chunks like a rolodex
const CaptionTicker: React.FC<{ caption: string }> = ({ caption }) => {
  const words = caption.split(' ').filter(Boolean);
  const CHUNK = 4;
  const chunks = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < words.length; i += CHUNK) out.push(words.slice(i, i + CHUNK).join(' '));
    return out.length ? out : [caption];
  }, [caption]);

  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [caption]);
  useEffect(() => {
    if (chunks.length <= 1) return;
    const t = setInterval(() => setIdx(p => (p + 1) % chunks.length), 1600);
    return () => clearInterval(t);
  }, [chunks]);

  return (
    <div className="h-4 overflow-hidden relative w-full">
      <AnimatePresence mode="wait">
        <motion.span
          key={`${caption}-${idx}`}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="absolute inset-0 text-[9px] font-bold uppercase tracking-widest text-white/30 truncate leading-4"
        >
          {chunks[idx]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
};

const PlayerView: React.FC<PlayerViewProps> = ({
  album,
  onBack,
  onEdit,
  onUpdate,
  onPurchase,
  onVisitUser,
  onNavigateToWorld,
  onOpenItem,
  isPublic = false,
  isPreview = false,
  user,
  partyId,
}) => {
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const {
    currentTrack: globalTrack,
    isPlaying: globalIsPlaying,
    volume: globalVolume,
    playTrack,
    playVideo,
    pause,
    resume,
    setVolume,
    togglePlay,
    next: globalNext,
    prev: globalPrev,
    repeatMode,
    isShuffle,
    setIsShuffle,
    nextTrackId,
    beginScratch,
    scratchBy,
    endScratch,
    analyser: globalAnalyser,
    getAudioContext,
    setDjFilter,
    resetAudioFx,
    isFxActive,
    isSlideshowActive,
    setIsSlideshowActive,
    visualizerType,
    setVisualizerType,
    setVideoElement,
    setYtPlayer,
    isTVMode,
    setIsTVMode,
    clearMedia,
    spatialMode,
    setSpatialMode,
    dolbySupport,
    isAtmosActive,
  } = useGlobalPlayerState();
  const { currentTime: globalCurrentTime, duration: globalDuration, seek } = useGlobalPlayerProgress();

  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

  // ── Listening party (synchronized premiere) ───────────────────────────────
  // The host premieres an album/track; every listener's own player follows the host's track +
  // position (audio streams locally per listener — see services/partyService.ts). Same primitive
  // as watch-along/read-along.
  const [activePartyId, setActivePartyId] = useState<string | null>(partyId ?? null);
  useEffect(() => { setActivePartyId(partyId ?? null); }, [partyId]);
  const party = useParty(activePartyId);

  // Live snapshot of local playback (refs so the follower interval below never re-creates on tick).
  const listenLocalRef = useRef<{ trackId?: string; isPlaying: boolean; time: number }>({ isPlaying: false, time: 0 });
  listenLocalRef.current = { trackId: globalTrack?.id, isPlaying: globalIsPlaying, time: globalCurrentTime || 0 };
  const hostStateRef = useRef<any>({});
  hostStateRef.current = { isPlaying: globalIsPlaying, positionSec: globalCurrentTime || 0, contentId: globalTrack?.id, trackIndex: currentTrackIndex };

  // HOST: broadcast on play/pause/track change, plus a heartbeat that also catches seeks.
  useEffect(() => {
    if (!activePartyId || !party.isHost) return;
    party.broadcast(hostStateRef.current);
  }, [activePartyId, party.isHost, globalIsPlaying, globalTrack?.id, currentTrackIndex]);
  useEffect(() => {
    if (!activePartyId || !party.isHost) return;
    const iv = setInterval(() => { if (hostStateRef.current.isPlaying) party.broadcast(hostStateRef.current); }, 3000);
    return () => clearInterval(iv);
  }, [activePartyId, party.isHost]);

  // FOLLOWER: slave the local Chora player to the host's track + position.
  useEffect(() => {
    if (!activePartyId || !party.isFollower) return;
    const apply = () => {
      const pb = party.playback;
      if (!pb) return;
      const { targetPositionSec, shouldPlay } = party.getTarget();
      const tracks = album?.tracks || [];
      const target = (typeof pb.trackIndex === 'number' && tracks[pb.trackIndex]) ? tracks[pb.trackIndex] : (pb.contentId ? tracks.find(t => t.id === pb.contentId) : null);
      const local = listenLocalRef.current;
      if (target && local.trackId !== target.id) {
        playTrack(target, album, 'LIBRARY', targetPositionSec);         // switch track + seek in one
        if (typeof pb.trackIndex === 'number') setCurrentTrackIndex(pb.trackIndex);
        return;
      }
      if (shouldResync(local.time, targetPositionSec)) seek(targetPositionSec);
      if (shouldPlay && !local.isPlaying) resume();
      else if (!shouldPlay && local.isPlaying) pause();
    };
    apply();
    const iv = setInterval(apply, 2000);
    return () => clearInterval(iv);
  }, [activePartyId, party.isFollower, party.playback?.seq, album]);

  const startListeningParty = useCallback(async () => {
    try {
      const track = globalTrack || album?.tracks?.[currentTrackIndex] || album?.tracks?.[0];
      const id = await createParty({
        kind: 'LISTEN',
        content: { type: 'ALBUM', id: album.id, title: album.title, thumbnail: album.coverImage },
        initial: { isPlaying: globalIsPlaying, positionSec: globalCurrentTime || 0, contentId: track?.id, trackIndex: currentTrackIndex },
      });
      setActivePartyId(id);
      const url = partyShareUrl(id);
      if (navigator.share) navigator.share({ title: `Listen to “${album.title}” with me on Plajah`, url }).catch(() => {});
      else navigator.clipboard?.writeText(url).catch(() => {});
    } catch (e) { console.error('start listening party failed', e); }
  }, [album, globalTrack, globalIsPlaying, globalCurrentTime, currentTrackIndex]);

  const leaveListeningParty = useCallback(() => { if (party.isHost) party.end(); setActivePartyId(null); }, [party]);
  const [playlistPickerTrack, setPlaylistPickerTrack] = useState<Track | null>(null);
  const [activeHUD, setActiveHUD] = useState<'INFO' | 'COMMENTS' | 'TRACKS' | 'ABOUT' | 'MEDIA' | 'LYRICS'>('TRACKS');
  const [isFlipped, setIsFlipped] = useState(false);
  const [isTracksCollapsed, setIsTracksCollapsed] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [showCaptions, setShowCaptions] = useState(true);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [lyricsOffset, setLyricsOffset] = useState(0);
  const [isResyncMode, setIsResyncMode] = useState(false);
  // Lyric auto-translation (Chora): detected source language + original→translated map.
  const [lyricLang, setLyricLang] = useState<string>('');            // '' = off
  const [lyricTx, setLyricTx] = useState<{ source: string; map: Record<string, string> } | null>(null);
  const [lyricTxLoading, setLyricTxLoading] = useState(false);
  const [lyricTxError, setLyricTxError] = useState<string | null>(null);
  const lyricTxCache = useRef<Record<string, { source: string; map: Record<string, string> }>>({});
  const [corsError, setCorsError] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  
  const [comments, setComments] = useState<Comment[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const [tabEdge, setTabEdge] = useState({ left: false, right: true });
  const onTabScroll = useCallback(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    setTabEdge({ left: el.scrollLeft > 4, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 4 });
  }, []);
  const scrollTabsBy = (dir: number) => tabScrollRef.current?.scrollBy({ left: dir * 110, behavior: 'smooth' });
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState({ text: '', percent: 0 });
  const [publicUrl, setPublicUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);

  // Detect mobile: touch devices (foldables, phones, tablets) always get mobile UI
  // regardless of width. pointer:coarse is true on all mobile browsers even when
  // a Samsung Z Fold's inner screen is wider than 1024px.
  // A television is never "mobile", whatever its user-agent says.
  //
  // This is the bug that delivered PHONE album views on a 4K TV: the TCL's WebView UA contains
  // "Android", it reports pointer:coarse (no mouse), and at the old 960px viewport it was also
  // under 1024 — so all three tests fired. Every local copy of this heuristic in the app has
  // the same flaw; usePlatform is the one place that knows about televisions.
  const detectMobile = () =>
    !getPlatformInfo().isTV && (
      window.matchMedia('(pointer: coarse)').matches ||
      /Mobi|Android|iPhone|iPad|iPod|IEMobile/i.test(navigator.userAgent) ||
      window.innerWidth < 1024
    );

  const [isMobile, setIsMobile] = useState(detectMobile);
  const [isVisualizerLayout, setIsVisualizerLayout] = useState(false);
  const [isVisualizerFullscreen, setIsVisualizerFullscreen] = useState(false);
  // FX Stage engine: 'FLOW'/'PAINT' are the built-in reactors; the rest pull the
  // three Plajah Pixels engines (MilkDrops / Shaders / Generators) as no-param reactors.
  const [fxEngine, setFxEngine] = useState<'FLOW' | 'PAINT' | FxEngine>('FLOW');
  const [fxPresetIndex, setFxPresetIndex] = useState(0);
  const [fxMenuOpen, setFxMenuOpen] = useState(false);
  const [milkdropNames, setMilkdropNames] = useState<string[]>([]);
  const isPixelsEngine = fxEngine === 'MILKDROP' || fxEngine === 'SHADER' || fxEngine === 'GENERATOR';
  const FX_OPTIONS = [
    { id: 'FLOW' as const, label: 'Flow' }, { id: 'PAINT' as const, label: 'Paint' },
    { id: 'MILKDROP' as const, label: 'MilkDrops' }, { id: 'SHADER' as const, label: 'Shaders' }, { id: 'GENERATOR' as const, label: 'Generators' },
  ];
  // Lazily fetch the full butterchurn preset name list the first time MilkDrops is used.
  React.useEffect(() => {
    if (fxEngine === 'MILKDROP' && milkdropNames.length === 0) loadMilkdropNames().then(setMilkdropNames);
  }, [fxEngine, milkdropNames.length]);
  const selectFxEngine = React.useCallback((id: 'FLOW' | 'PAINT' | FxEngine) => {
    setFxEngine(id); setFxPresetIndex(0); setFxMenuOpen(false);
    if (id === 'FLOW' || id === 'PAINT') setVisualizerType(id);
  }, [setVisualizerType]);
  const cycleFxPreset = React.useCallback((dir: 1 | -1) => setFxPresetIndex(p => p + dir), []);
  // The active pixels engine's full preset list (MilkDrops loaded async).
  const fxPresetList = fxEngine === 'MILKDROP' ? milkdropNames : (isPixelsEngine ? FX_ENGINE_PRESETS[fxEngine as FxEngine] : []);
  const fxCurrentPreset = fxPresetList.length ? fxPresetList[((fxPresetIndex % fxPresetList.length) + fxPresetList.length) % fxPresetList.length] : '';

  // Selector: the three types stay separate (pills); the active pixels type gets its own
  // dropdown listing ALL its Plajah Pixels presets, plus ◀ ▶ to step through them.
  const fxSelectorEl = (
    <div className="flex items-center gap-2 shrink-0 min-w-0">
      {/* Type pills — Flow / Paint / MilkDrops / Shaders / Generators */}
      <div className="flex items-center gap-0.5 bg-black/50 backdrop-blur-xl border border-white/10 rounded-full p-1 shrink-0">
        {FX_OPTIONS.map(opt => (
          <button key={opt.id} onClick={() => selectFxEngine(opt.id)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${fxEngine === opt.id ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Per-type preset dropdown (only for the pixels engines) */}
      {isPixelsEngine && (
        <div className="relative flex items-center gap-1 shrink-0">
          <button onClick={() => cycleFxPreset(-1)} aria-label="Previous preset"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-black/50 border border-white/10 text-white/60 hover:text-white transition-all"><ChevronLeft size={14} /></button>
          <button onClick={() => setFxMenuOpen(o => !o)}
            className="shrink-0 flex items-center gap-1.5 h-7 px-3 rounded-full bg-black/50 border border-white/10 text-white text-[9px] font-bold hover:bg-black/70 transition-all max-w-[150px]">
            <span className="truncate">{fxCurrentPreset || (fxEngine === 'MILKDROP' ? 'Loading…' : `Preset ${fxPresetIndex + 1}`)}</span>
            <ChevronDown size={12} className={`shrink-0 transition-transform ${fxMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={() => cycleFxPreset(1)} aria-label="Next preset"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-black/50 border border-white/10 text-white/60 hover:text-white transition-all"><ChevronRight size={14} /></button>
          {fxMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setFxMenuOpen(false)} />
              <div className="absolute top-full right-0 mt-2 w-56 max-h-72 overflow-y-auto no-scrollbar rounded-2xl bg-[#141414] border border-white/10 shadow-2xl z-50 p-1">
                <div className="px-3 pt-1.5 pb-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/25">{fxEngine === 'MILKDROP' ? 'MilkDrops' : fxEngine === 'SHADER' ? 'Shaders' : 'Generators'} · {fxPresetList.length || '…'}</div>
                {fxPresetList.length === 0 && <div className="px-3 py-2 text-[10px] text-white/30">Loading presets…</div>}
                {fxPresetList.map((name, idx) => (
                  <button key={idx} onClick={() => { setFxPresetIndex(idx); setFxMenuOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors truncate ${(((fxPresetIndex % fxPresetList.length) + fxPresetList.length) % fxPresetList.length) === idx ? 'bg-small-orange/20 text-small-orange' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
                    {name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
  const [isDJMode, setIsDJMode] = useState(false);
  const [isLightingOpen, setIsLightingOpen] = useState(false);

  // World / character data (loaded when album is linked to a world)
  const [worldCharacters, setWorldCharacters] = useState<Character[]>([]);
  const [worldContent, setWorldContent] = useState<{ albums: Album[]; videos: Video[] } | null>(null);

  const formatTime = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Tracklist drag-to-reorder
  const dragTrackIndexRef = useRef<number | null>(null);
  const [dragOverTrackIndex, setDragOverTrackIndex] = useState<number | null>(null);
  const [localTracks, setLocalTracks] = useState<Track[]>(album.tracks);
  // HnS per-track dropdown
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null); // "{trackId}_slot{1|2}"
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({}); // key -> 0-100
  const [slotSavedKey, setSlotSavedKey] = useState<string | null>(null); // shows "Saved" flash
  // Track-as-slot assignment
  const [hnsTrackPicker, setHnsTrackPicker] = useState<{ trackId: string; slot: 1 | 2 } | null>(null);
  const [hnsModified, setHnsModified] = useState(false);
  const [hnsSaving, setHnsSaving] = useState(false);
  const [hnsShowSchedule, setHnsShowSchedule] = useState(false);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const handleResize = () => { clearTimeout(t); t = setTimeout(() => setIsMobile(detectMobile()), 150); };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => { window.removeEventListener('resize', handleResize); clearTimeout(t); };
  }, []);

  // Keep localTracks in sync if album prop changes
  useEffect(() => { setLocalTracks(album.tracks); }, [album.tracks]);

  // Load world characters + content when album is linked to a world
  useEffect(() => {
    if (!album.worldId) return;
    fetchWorldCharacters(album.worldId).then(setWorldCharacters).catch(() => {});
    fetchWorldContentByWorldId(album.worldId).then(setWorldContent).catch(() => {});
  }, [album.worldId]);

  const currentTrack = localTracks?.[currentTrackIndex] || null;

  // Resolve real precomputed waveform peaks for the current track (instant if cached/stored,
  // else computed in the background), fed to the scrolling waveform for a true audio shape.
  const [trackPeaks, setTrackPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    const t = currentTrack;
    if (!t?.url) { setTrackPeaks(null); return; }
    const cached = getCachedAnalysis(t);
    if (cached) { setTrackPeaks(cached.peaks); return; }
    setTrackPeaks(null);
    let cancelled = false;
    getOrComputeAnalysis(t).then(a => { if (!cancelled && a) setTrackPeaks(a.peaks); }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentTrack?.id]);

  // Open the full Plajah Pixels experience for the current track (same as the track-row PP button).
  const openPlajahPixels = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent('OPEN_PLAJAH_PIXELS', { detail: { track: currentTrack, album } }));
  }, [currentTrack, album]);
  const isOwner = user && album.ownerId === user.uid;

  const reorderTracks = async (from: number, to: number) => {
    const reordered = [...localTracks];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setLocalTracks(reordered);
    if (isOwner) {
      try { await updateAlbum(album.id, { tracks: reordered }); } catch { /* non-critical */ }
    }
  };

  const handleHnsSlotUpload = async (track: Track, slot: 1 | 2, file: File) => {
    const key = `${track.id}_slot${slot}`;
    setUploadingSlot(key);
    setUploadProgress(prev => ({ ...prev, [key]: 0 }));
    try {
      const url = await uploadFile(
        `albums/${album.id}/hns/${track.id}_slot${slot}_${Date.now()}`,
        file,
        (p) => setUploadProgress(prev => ({ ...prev, [key]: p }))
      );
      const updatedTrack: Track = {
        ...track,
        [`hnsSlot${slot}`]: { url, title: file.name.replace(/\.[^/.]+$/, ''), uploadedAt: Date.now() },
      };
      const updatedTracks = localTracks.map(t => t.id === track.id ? updatedTrack : t);
      setLocalTracks(updatedTracks);
      await updateAlbum(album.id, { tracks: updatedTracks });
      setSlotSavedKey(key);
      setTimeout(() => setSlotSavedKey(null), 2500);
    } catch (e) { console.error('HnS slot upload failed', e); }
    finally {
      setUploadingSlot(null);
      setUploadProgress(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  const handlePickTrackForHnsSlot = async (sourceTrack: Track) => {
    if (!hnsTrackPicker) return;
    const { trackId, slot } = hnsTrackPicker;
    setHnsTrackPicker(null);
    // Update local track state immediately
    const updatedTracks = localTracks.map(t =>
      t.id === trackId
        ? { ...t, [`hnsSlot${slot}`]: { url: sourceTrack.url, title: sourceTrack.title, uploadedAt: Date.now() } }
        : t
    );
    setLocalTracks(updatedTracks);
    setHnsModified(true);
    setHnsShowSchedule(false);
    // Persist the alternate to Firestore
    try {
      await assignTrackAsHnsSlot(album.id, trackId, slot, sourceTrack);
    } catch (e) { console.error('HnS slot assign failed', e); }
  };

  const handleSaveHns = async () => {
    setHnsSaving(true);
    try {
      // Persist track slot data
      await updateAlbum(album.id, { tracks: localTracks });
      // Ensure config is saved (enable HNS if not already)
      const config = album.hideNSeekConfig ?? { isEnabled: true, globalEnabled: false, windows: [], trackConfigs: [] };
      if (!config.isEnabled) await saveHideNSeekConfig(album.id, { ...config, isEnabled: true });
      setHnsModified(false);
      setHnsShowSchedule(true);
    } finally {
      setHnsSaving(false);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToComments(album.id, currentTrack?.id || null, null, setComments);
    return () => unsubscribe();
  }, [album.id, currentTrack?.id]);

  const scrollingText = comments.length > 0 
    ? comments.map(c => `${c.author}: ${c.text}`).join(" • ")
    : album.description || "Liner notes unavailable";

  // Sync with global player if it's playing a track from THIS album
  useEffect(() => {
    if (globalTrack && album.tracks.some(t => t.id === globalTrack.id)) {
      const index = album.tracks.findIndex(t => t.id === globalTrack.id);
      if (index !== -1) setCurrentTrackIndex(index);
    }
  }, [globalTrack, album.tracks]);

  // Reset lyrics offset and resync mode when the track changes
  useEffect(() => {
    setLyricsOffset(0);
    setIsResyncMode(false);
    setLyricTxError(null);
  }, [currentTrackIndex]);

  // Auto-(re)translate whenever a target language is chosen or the track changes.
  useEffect(() => {
    if (!lyricLang) { setLyricTx(null); return; }
    const t = currentTrack;
    if (!t?.timeCodedLyrics?.length) { setLyricTx(null); return; }
    runLyricTranslation(t.timeCodedLyrics, lyricLang, t.id || String(currentTrackIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyricLang, currentTrack?.id]);

  // Translate the current track's synced lyrics into the chosen language.
  // Detects the source language automatically; caches per (track + language).
  const runLyricTranslation = useCallback(async (lines: { time: number; text: string }[], langCode: string, trackKey: string) => {
    setLyricTxError(null);
    if (!langCode) { setLyricTx(null); return; }
    const cacheKey = `${trackKey}|${langCode}`;
    const cached = lyricTxCache.current[cacheKey];
    if (cached) { setLyricTx(cached); return; }
    const label = LYRIC_LANGS.find(l => l.code === langCode)?.label || 'English';
    // Unique, order-preserving line texts → fewer tokens; map back by text.
    const uniqueTexts = Array.from(new Set(lines.map(l => l.text).filter(t => t && t.trim())));
    if (!uniqueTexts.length) { setLyricTx(null); return; }
    setLyricTxLoading(true);
    try {
      const { sourceLanguage, translations } = await translateLyrics(uniqueTexts, label);
      const map: Record<string, string> = {};
      uniqueTexts.forEach((t, i) => { if (translations[i]) map[t] = translations[i]; });
      const result = { source: sourceLanguage, map };
      lyricTxCache.current[cacheKey] = result;
      setLyricTx(result);
    } catch (e: any) {
      setLyricTxError(e?.message || 'Translation failed.');
      setLyricTx(null);
    } finally {
      setLyricTxLoading(false);
    }
  }, []);

  // Compact translate control shown in the synced-lyrics header.
  const renderLyricTranslate = () => (
    <div className="flex items-center gap-1.5 mr-1">
      <div className="relative flex items-center">
        <Languages size={10} className="absolute left-1.5 text-white/30 pointer-events-none" />
        <select
          value={lyricLang}
          onChange={e => { setLyricLang(e.target.value); setLyricTxError(null); }}
          title="Translate lyrics"
          className="appearance-none bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[8px] font-black uppercase tracking-widest text-white/50 hover:text-white/80 pl-5 pr-2 py-1 cursor-pointer focus:outline-none transition-all"
        >
          <option value="" className="bg-black text-white normal-case">Translate…</option>
          <optgroup label="Modern" className="bg-black text-white normal-case">
            {LYRIC_LANGS.filter(l => l.group === 'modern').map(l => <option key={l.code} value={l.code} className="bg-black text-white normal-case">{l.label}</option>)}
          </optgroup>
          <optgroup label="Ancient / Classical" className="bg-black text-white normal-case">
            {LYRIC_LANGS.filter(l => l.group === 'ancient').map(l => <option key={l.code} value={l.code} className="bg-black text-white normal-case">{l.label}</option>)}
          </optgroup>
        </select>
      </div>
      {lyricTxLoading && <RefreshCw size={10} className="animate-spin text-small-orange" />}
      {!lyricTxLoading && lyricTx && lyricLang && (
        <span className="text-[7px] font-black uppercase tracking-widest text-small-orange/70" title={`Detected source: ${lyricTx.source}`}>{lyricTx.source} →</span>
      )}
      {lyricTxError && <span className="text-[8px] font-black text-red-400/80 cursor-help" title={lyricTxError}>!</span>}
    </div>
  );

  useEffect(() => {
    setCorsError(false);
  }, [currentTrackIndex]);

  useEffect(() => {
    if (album.id) {
      setPublicUrl(`${window.location.origin}/?type=album&id=${album.id}${activeVideoId ? `&video=${activeVideoId}` : (currentTrack?.id ? `&track=${currentTrack.id}` : '')}`);
    }
  }, [album.id, activeVideoId, currentTrack?.id]);

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const publishedAlbum = await publishToCloud(album, (text, percent) => { setPublishStatus({ text, percent }); });
      const albumUrl = `${window.location.origin}/?type=album&id=${publishedAlbum.id}${activeVideoId ? `&video=${activeVideoId}` : (currentTrack?.id ? `&track=${currentTrack.id}` : '')}`;
      setPublicUrl(albumUrl);
    } catch (err) { console.error("Cloud uplink error:", err); } finally { setIsPublishing(false); }
  };

  const handleGenerateCaptions = async () => {
    if (!currentTrack.url || isGeneratingCaptions) return;

    setIsGeneratingCaptions(true);
    setCaptionError(null);
    try {
      // The raw master (currentTrack.url) is often a 40–60MB WAV, which the transcription endpoint
      // rejects with 413 ("audio too large"). Prefer the SMALL transcoded rendition — the progressive
      // AAC 'low' stream — which is a fraction of the size and plenty for Gemini to transcribe.
      // Falls back to the raw url when there's no transcode (small files transcribe fine directly).
      let audioUrl = currentTrack.url;
      try {
        const stream = currentTrack.id ? await getTrackStream(currentTrack.id) : null;
        if (stream?.status === 'ready' && stream.low) audioUrl = stream.low;
      } catch { /* fall back to the raw url */ }

      // Server-side Gemini transcription: send the audio URL (the server fetches
      // it and returns time-coded captions), so the API key stays off the client.
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
      const res = await fetch('/api/ai/captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ audioUrl, title: currentTrack.title, artist: album.artist }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const reason = body?.error || `error ${res.status}`;
        // Turn the server's terse codes into something a creator can act on.
        const friendly =
          res.status === 413 || /too large/i.test(reason) ? 'This track is too large to transcribe — publish it (or re-sync after it finishes optimizing) so the compressed version can be used.'
          : res.status === 503 ? 'Transcription is temporarily unavailable. Try again shortly.'
          : res.status === 401 ? 'Sign in to sync captions.'
          : /audio fetch/i.test(reason) ? "Couldn't reach this track's audio — make sure it's uploaded and public."
          : `Couldn't sync captions (${reason}).`;
        throw new Error(friendly);
      }
      const data = await res.json().catch(() => ({}));
      const captions = data?.captions;

      if (Array.isArray(captions) && captions.length > 0) {
        const updatedTracks = [...album.tracks];
        updatedTracks[currentTrackIndex] = { ...currentTrack, timeCodedLyrics: captions };
        const updatedAlbum = { ...album, tracks: updatedTracks };
        if (!isPreview) {
          await updateAlbum(album.id, { tracks: updatedTracks });
        }
        onUpdate?.(updatedAlbum);
      } else {
        setCaptionError('Transcription came back empty — the audio may be instrumental or too quiet.');
      }
    } catch (error: any) {
      console.error("Failed to generate captions:", error);
      setCaptionError(error?.message || 'Caption sync failed.');
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  // Called when user taps a lyric in resync mode: anchor that line to current audio time
  const handleResync = (line: { time: number; text: string }) => {
    setLyricsOffset(globalCurrentTime - line.time);
    setIsResyncMode(false);
  };

  // Shared with Plajah Pixels via src/lib/captions — one caption source of truth.
  const getCurrentCaption = () => getActiveCaption(currentTrack, globalCurrentTime, globalDuration);

  const isCurrentTrackGlobal = globalTrack?.id === currentTrack?.id;
  // ── Active-track timing for the track bar (countdown + end-approach visuals) ──
  const trackRemaining = Math.max(0, (globalDuration || 0) - (globalCurrentTime || 0));
  const trackProgress = globalDuration > 0 ? Math.min(1, (globalCurrentTime || 0) / globalDuration) : 0;
  const isEndingSoon = isCurrentTrackGlobal && globalDuration > 0 && trackRemaining <= 10;
  // Repeat-One: green glow at the very start that fades into the gradient (first ~12%).
  const repeatOneGreenOpacity = (repeatMode === 'ONE' && globalDuration > 0)
    ? Math.max(0, 1 - trackProgress / 0.12) : 0;
  const activeVideo = album.musicVideos?.find(v => v.id === activeVideoId);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerId = useRef(`yt-player-${Math.random().toString(36).substr(2, 9)}`);

  // YouTube API initialization and handling
  useEffect(() => {
    if (!activeVideoId) {
      setYtPlayer(null);
      return;
    }
    
    const video = album.musicVideos?.find(v => v.id === activeVideoId);
    if (!video) return;
    
    const isYoutube = video.url.includes('youtube.com') || video.url.includes('youtu.be');
    if (!isYoutube) return;

    let vId = '';
    if (video.url.includes('v=')) {
      vId = video.url.split('v=')[1]?.split('&')[0];
    } else {
      vId = video.url.split('/').pop() || '';
    }
    
    if (!vId || vId.length < 5) {
      console.warn("Invalid YouTube ID extracted:", vId);
      return;
    }

    const initPlayer = () => {
      if (document.getElementById(ytContainerId.current)) {
        try {
          if (ytPlayerRef.current && typeof ytPlayerRef.current.loadVideoById === 'function') {
            ytPlayerRef.current.loadVideoById(vId);
          } else {
            if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
              ytPlayerRef.current.destroy();
              ytPlayerRef.current = null;
            }

            ytPlayerRef.current = new (window as any).YT.Player(ytContainerId.current, {
              height: '100%',
              width: '100%',
              videoId: vId,
              playerVars: {
                autoplay: 1,
                controls: 0,
                modestbranding: 1,
                rel: 0,
                showinfo: 0,
                iv_load_policy: 3,
                fs: 0
              },
              events: {
                onReady: (event: any) => {
                  setYtPlayer(event.target);
                  event.target.playVideo();
                }
              }
            });
          }
        } catch (e) {
          console.error("YouTube Player initialization failed:", e);
        }
      } else {
        console.warn("YT container not found for init:", ytContainerId.current);
      }
    };

    if (!(window as any).YT || !(window as any).YT.Player) {
      if (!document.getElementById('youtube-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'youtube-api-script';
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }
      
      const checkYt = setInterval(() => {
        if ((window as any).YT && (window as any).YT.Player) {
          clearInterval(checkYt);
          initPlayer();
        }
      }, 100);
      
      return () => clearInterval(checkYt);
    } else {
      initPlayer();
    }

    return () => {
      if (ytPlayerRef.current) {
        ytPlayerRef.current.destroy();
        ytPlayerRef.current = null;
        setYtPlayer(null);
      }
    };
  }, [activeVideoId, album.musicVideos, setYtPlayer]);

  const getAutoplayUrl = (url: string) => {
    if (!url) return '';
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    const isVimeo = url.includes('vimeo.com');
    
    try {
      const urlObj = new URL(url);
      if (isYoutube) {
        urlObj.searchParams.set('autoplay', '1');
      } else if (isVimeo) {
        urlObj.searchParams.set('autoplay', '1');
      }
      return urlObj.toString();
    } catch (e) {
      if (isYoutube) return `${url}${url.includes('?') ? '&' : '?'}autoplay=1`;
      if (isVimeo) return `${url}${url.includes('?') ? '&' : '?'}autoplay=1`;
      return url;
    }
  };

  if (isMobile && !isTVMode) {
    return (
      <div className="h-[100dvh] bg-transparent text-primary overflow-hidden relative selection:bg-white selection:text-black font-sans flex flex-col">
        {/* Mobile Atmospheric Background — blurred artwork at 60%, fades into app bg at bottom */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          <img
            src={activeVideo?.coverImageUrl || album.coverImage || undefined}
            alt=""
            className="w-full h-full object-cover scale-110 blur-[40px] saturate-[0.4] opacity-40 transition-all duration-1000"
            referrerPolicy="no-referrer"
          />
          {/* Desaturated so warm covers bleed through as a faint neutral haze, not an orange wash. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/35 to-black/70" />
        </div>

        {/* Mobile Header */}
        <header className="p-4 flex items-center justify-between bg-white/5 backdrop-blur-xl border-b border-white/5 z-50">
          <button onClick={onBack} aria-label="Back to Chora" className="flex items-center gap-1.5 pr-2 text-white/70 hover:text-white transition-all shrink-0 active:scale-95">
            <Logo size={22} flip />
            <span className="text-[11px] font-black uppercase tracking-widest">Back</span>
          </button>
          <div className="flex-1 text-center min-w-0 px-4">
            <h1 className="text-xs font-black uppercase tracking-widest truncate">{album.title}</h1>
            <p className="text-[8px] font-bold text-small-orange uppercase tracking-[0.3em] truncate">{album.artist}</p>
            {(album as any).source === 'AUDIUS' && (
              <span className="inline-flex items-center gap-1 mt-0.5 text-[7px] font-black uppercase tracking-[0.2em]" style={{ color: '#C56BFF' }}>
                <span className="w-1 h-1 rounded-full" style={{ background: '#C56BFF' }} /> via Audius
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ChoraQualityButton className="p-2" />
            <button onClick={() => setShowShareModal(true)} className="p-2 text-white/40 hover:text-white transition-all">
              <Share2 size={20} />
            </button>
          </div>
        </header>

        {/* Top Media Section (Shared Placement for Cover Art & Video) */}
        <div id="mobile-video-container" className="relative w-full flex-1 bg-transparent overflow-hidden border-b border-white/5 z-10">
          {/* ── Mobile / tablet FX Stage — audio-reactive visualizers, no parameters ── */}
          {isVisualizerLayout && (
            <div className="absolute inset-0 z-30 bg-black">
              <div className="absolute inset-0">
                {isPixelsEngine ? (
                  <FxStageVisualizers engine={fxEngine as FxEngine} presetIndex={fxPresetIndex} analyser={globalAnalyser} isPlaying={globalIsPlaying && isCurrentTrackGlobal} />
                ) : (
                  <>
                    <div className="absolute inset-0" style={{ opacity: fxEngine === 'PAINT' ? 0.35 : 1 }}>
                      <Visualizer analyser={globalAnalyser} themeColor={album.themeColor} trackTitle={currentTrack?.title || album.title} artist={album.artist} isPlaying={globalIsPlaying && isCurrentTrackGlobal} scrollingText={scrollingText} alwaysAnimate={true} />
                    </div>
                    {fxEngine === 'PAINT' && <div className="absolute inset-0 pointer-events-none"><PaintPoolVisualizer analyser={globalAnalyser} isPlaying={globalIsPlaying && isCurrentTrackGlobal} alwaysAnimate={true} /></div>}
                  </>
                )}
              </div>
              {/* Controls: exit · reactor selector · PP */}
              <div className="absolute top-0 left-0 right-0 z-10 p-3 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
                <button onClick={() => setIsVisualizerLayout(false)} aria-label="Exit FX Stage" className="shrink-0 p-2 rounded-full bg-black/60 border border-white/10 text-white/60 hover:text-white transition-all"><X size={14} /></button>
                <div className="flex-1 flex items-center justify-center min-w-0">{fxSelectorEl}</div>
                <button onClick={openPlajahPixels} aria-label="Open Plajah Pixels" title="Open the full Plajah Pixels experience" className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-200 text-[9px] font-black uppercase tracking-widest"><Sparkles size={11} /> PP</button>
              </div>
            </div>
          )}
          {activeVideoId ? (
            <div className="w-full h-full animate-in fade-in duration-500">
              {(() => {
                const video = album.musicVideos?.find(v => v.id === activeVideoId);
                if (!video) return null;
                const isYoutube = video.url.includes('youtube.com') || video.url.includes('youtu.be');
                const isVimeo = video.url.includes('vimeo.com');
                let embedUrl = video.url;
                if (isYoutube) {
                  return (
                    <div className="w-full h-full relative">
                      <div id={ytContainerId.current} className="w-full h-full" />
                      <button 
                        onClick={() => {
                          setActiveVideoId(null);
                          clearMedia();
                        }}
                        className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-full text-white/40 hover:text-white z-20"
                      >
                        <X size={16} />
                      </button>
                      <button 
                        onClick={() => {
                          const container = document.getElementById('mobile-video-container');
                          if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
                            if (document.exitFullscreen) document.exitFullscreen();
                            else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
                          } else if (container) {
                            if (container.requestFullscreen) container.requestFullscreen();
                            else if ((container as any).webkitRequestFullscreen) (container as any).webkitRequestFullscreen();
                          }
                        }}
                        className="absolute bottom-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-full text-white/40 hover:text-white z-20"
                      >
                        <Maximize2 size={16} />
                      </button>
                    </div>
                  );
                } else if (isVimeo) {
                  const vid = video.url.split('/').pop();
                  embedUrl = `https://player.vimeo.com/video/${vid}?autoplay=1`;
                }
                return (
                  <div className="w-full h-full relative">
                    {isVimeo ? (
                      <iframe src={embedUrl} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />
                    ) : (
                      <video 
                        ref={setVideoElement}
                        src={video.url || undefined} 
                        playsInline
                        autoPlay 
                        className="w-full h-full object-contain cursor-pointer" 
                        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                      />
                    )}
                    <button 
                      onClick={() => {
                        setActiveVideoId(null);
                        clearMedia();
                      }}
                      className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-full text-white/40 hover:text-white z-20"
                    >
                      <X size={16} />
                    </button>
                    <button 
                      onClick={() => {
                        const container = document.getElementById('mobile-video-container');
                        if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
                          if (document.exitFullscreen) document.exitFullscreen();
                          else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
                        } else if (container) {
                          if (container.requestFullscreen) container.requestFullscreen();
                          else if ((container as any).webkitRequestFullscreen) (container as any).webkitRequestFullscreen();
                        }
                      }}
                      className="absolute bottom-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-full text-white/40 hover:text-white z-20"
                    >
                      <Maximize2 size={16} />
                    </button>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="w-full h-full relative text-left block">
              {isFlipped ? (
                <div className="w-full h-full animate-in fade-in duration-500">
                  <AnimatedSlideshow
                    images={resolveSlideshowImages(album, currentTrack)}
                    isPlaying={globalIsPlaying && isCurrentTrackGlobal}
                    themeColor={album.themeColor}
                  />
                </div>
              ) : (
                <img
                  src={thumb((currentTrack?.images?.[0]) || album.coverImage, THUMB.large) || undefined}
                  alt={currentTrack?.title || album.title}
                  loading="lazy"
                  decoding="async"
                  onError={onThumbError((currentTrack?.images?.[0]) || album.coverImage)}
                  className="w-full h-full object-cover opacity-80"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />
              
              <div className="absolute inset-0 flex items-center justify-center p-8">
                {(!globalIsPlaying || !isCurrentTrackGlobal) && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); playTrack(album.tracks[0], album, 'LIBRARY'); setCurrentTrackIndex(0); }}
                    className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center transform scale-100 opacity-100 transition-all duration-500 border border-white/30 shadow-2xl z-10"
                  >
                    <Play size={32} />
                  </button>
                )}
              </div>
              {/* Share icon overlaid on cover art */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowShareModal(true); }}
                className="absolute top-4 right-4 z-20 w-10 h-10 rounded-xl bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/70 hover:border-white/40 transition-all"
                style={{top:'max(1rem, env(safe-area-inset-top))', right:'max(1rem, env(safe-area-inset-right))'}}
              >
                <Share2 size={16} />
              </button>
              {/* Flip cover ⇄ slideshow — small badge on the art (only when the album/track has extra images) */}
              {(((currentTrack?.images?.length || 0) > 1) || ((album.slideshow?.length || 0) > 0)) && (
                <button
                  onClick={(e) => { e.stopPropagation(); setIsFlipped(f => !f); }}
                  title={isFlipped ? 'Show cover art' : 'Show slideshow'}
                  className={`absolute top-4 left-4 z-20 w-10 h-10 rounded-xl backdrop-blur-md border flex items-center justify-center transition-all ${isFlipped ? 'bg-small-orange/30 border-small-orange/50 text-small-orange' : 'bg-black/50 border-white/20 text-white/60 hover:text-white hover:bg-black/70'}`}
                  style={{top:'max(1rem, env(safe-area-inset-top))', left:'max(1rem, env(safe-area-inset-left))'}}
                >
                  <Layers size={16} />
                </button>
              )}
              {/* FX Stage entry — audio-reactive visualizers on phone/tablet */}
              <button
                onClick={(e) => { e.stopPropagation(); setIsVisualizerLayout(true); }}
                title="FX Stage — audio-reactive visualizers"
                className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white/70 hover:text-white hover:border-small-orange/50 transition-all text-[9px] font-black uppercase tracking-widest"
                style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))', left: 'max(1rem, env(safe-area-inset-left))' }}
              >
                <Activity size={12} /> FX Stage
              </button>
              {/* Floating Track Info on Cover */}
              <div className="absolute bottom-6 left-6 right-6" style={{bottom:'max(1.5rem, env(safe-area-inset-bottom))'}}>
                <h2 className="text-2xl font-black uppercase tracking-tightest leading-none mb-1 shadow-md">{currentTrack?.title}</h2>
                <p className="text-xs font-bold text-small-orange uppercase tracking-widest shadow-md">{album.artist}</p>
              </div>
            </div>
          )}
        </div>

        {/* Tabbed Navigation */}
        <div className="relative sticky top-0 z-40 overflow-hidden shrink-0" style={{
          background: 'linear-gradient(135deg, rgba(6,4,10,0.92) 0%, rgba(10,4,8,0.92) 100%)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255,255,255,0.055)',
        }}>

          {/* Left edge chevron — fades in once user has scrolled */}
          <button
            onClick={() => scrollTabsBy(-1)}
            className="absolute left-0 top-0 bottom-0 z-20 w-7 flex items-center justify-center transition-all duration-200"
            style={{
              background: 'linear-gradient(to right, rgba(6,4,10,0.95) 55%, transparent)',
              opacity: tabEdge.left ? 1 : 0,
              pointerEvents: tabEdge.left ? 'auto' : 'none',
            }}
          >
            <ChevronLeft size={11} className="text-white/55" />
          </button>

          {/* Right edge chevron — visible on mount to signal scrollable content */}
          <button
            onClick={() => scrollTabsBy(1)}
            className="absolute right-0 top-0 bottom-0 z-20 w-7 flex items-center justify-center transition-all duration-200"
            style={{
              background: 'linear-gradient(to left, rgba(6,4,10,0.95) 55%, transparent)',
              opacity: tabEdge.right ? 1 : 0,
              pointerEvents: tabEdge.right ? 'auto' : 'none',
            }}
          >
            <ChevronRight size={11} className="text-white/55" />
          </button>

          {/* Scrollable tab row */}
          <div
            ref={tabScrollRef}
            onScroll={onTabScroll}
            className="overflow-x-auto no-scrollbar px-7 py-2"
          >
            <div className="flex items-center gap-1 min-w-max">
              {([
                { id: 'TRACKS', label: album.trackListLabel || (album.type === 'BOOK' ? 'Contents' : 'Tracklist'), icon: List },
                { id: 'LYRICS', label: 'Lyrics', icon: Music2 },
                { id: 'MEDIA', label: 'Videos & Art', icon: VideoIcon },
                { id: 'COMMENTS', label: 'Feed', icon: MessageSquare },
                { id: 'INFO', label: 'Notes', icon: Sparkles },
              ] as const).map(tab => {
                const active = activeHUD === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveHUD(tab.id as any)}
                    className="relative flex items-center gap-1.5 px-2.5 py-[5px] whitespace-nowrap shrink-0 overflow-hidden transition-all duration-200"
                    style={active ? {
                      borderRadius: '7px',
                      background: 'linear-gradient(135deg, rgba(255,140,0,0.14) 0%, rgba(139,92,246,0.14) 100%)',
                      border: '1px solid rgba(255,140,0,0.28)',
                      boxShadow: '0 0 12px rgba(255,140,0,0.09), inset 0 1px 0 rgba(255,255,255,0.06)',
                      color: '#fff',
                    } : {
                      borderRadius: '7px',
                      background: 'rgba(255,255,255,0.038)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      color: 'rgba(255,255,255,0.32)',
                    }}
                  >
                    {active && (
                      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(255,140,0,0.07) 0%, rgba(139,92,246,0.07) 100%)', borderRadius: '6px' }} />
                    )}
                    <tab.icon size={10} className="relative shrink-0" />
                    <span className="relative text-[7.5px] font-black uppercase tracking-widest">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 z-10 relative">
          {activeHUD === 'TRACKS' && (
            <div className="space-y-2 animate-in slide-in-from-bottom-4 duration-500">

              {/* HNS Save bar — appears when slots are assigned */}
              {isOwner && hnsModified && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl mb-2 animate-in fade-in duration-300"
                  style={{ background: 'rgba(255,140,0,0.1)', border: '1px solid rgba(255,140,0,0.35)' }}>
                  <div className="flex items-center gap-2">
                    <Eye size={13} className="text-small-orange shrink-0" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-small-orange">Slot assignments unsaved</p>
                  </div>
                  <button onClick={handleSaveHns} disabled={hnsSaving}
                    className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all hover:scale-105 disabled:opacity-50"
                    style={{ background: '#ff8c00', color: '#000' }}>
                    {hnsSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    {hnsSaving ? 'Saving…' : 'Save & Schedule'}
                  </button>
                </div>
              )}

              {/* HNS Schedule — shown after save */}
              {isOwner && hnsShowSchedule && album.hideNSeekConfig?.windows?.length ? (
                <div className="px-4 py-3 rounded-2xl mb-2 space-y-2 animate-in fade-in duration-300"
                  style={{ background: 'rgba(255,140,0,0.06)', border: '1px solid rgba(255,140,0,0.2)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye size={12} className="text-small-orange" />
                      <p className="text-[8px] font-black uppercase tracking-widest text-small-orange">Hide &amp; Seek Schedule Active</p>
                    </div>
                    <button onClick={() => setHnsShowSchedule(false)} className="text-white/20 hover:text-white"><X size={12} /></button>
                  </div>
                  {album.hideNSeekConfig.windows.map((win, idx) => {
                    const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                    const [hh, mm] = win.startTime.split(':').map(Number);
                    const fmt = (h: number) => `${h > 12 ? h - 12 : h || 12}:${mm.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
                    return (
                      <div key={idx} className="flex items-center gap-2 text-[8px]">
                        <div className="w-1 h-1 rounded-full bg-small-orange shrink-0" />
                        <span className="font-black text-white/60">{win.daysOfWeek.map(d => DAY[d]).join(', ')}</span>
                        <span className="text-white/30">{fmt(hh)} – {fmt(hh + 3)} (3 hrs)</span>
                      </div>
                    );
                  })}
                  <p className="text-[7px] text-white/25">Fans earn discovery points for finding hidden alternates during these windows.</p>
                </div>
              ) : isOwner && hnsShowSchedule ? (
                <div className="px-4 py-3 rounded-2xl mb-2 animate-in fade-in duration-300"
                  style={{ background: 'rgba(255,140,0,0.06)', border: '1px solid rgba(255,140,0,0.2)' }}>
                  <p className="text-[8px] font-black uppercase tracking-widest text-small-orange mb-1">Slots saved!</p>
                  <p className="text-[8px] text-white/40">Add schedule windows in the Hide &amp; Seek Manager to activate your slots.</p>
                </div>
              ) : null}

              {/* HNS Track Picker Modal */}
              {hnsTrackPicker && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
                  onClick={() => setHnsTrackPicker(null)}>
                  <div className="w-80 rounded-3xl p-5 space-y-3" style={{ background: '#0d0d14', border: '1px solid rgba(255,140,0,0.3)' }}
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest">Pick Track → Slot {hnsTrackPicker.slot}</p>
                      <button onClick={() => setHnsTrackPicker(null)} className="text-white/30 hover:text-white"><X size={14} /></button>
                    </div>
                    <p className="text-[8px] text-white/30 uppercase tracking-widest">Track #1 cannot be a slot source. Each track can fill max 2 slots.</p>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {localTracks.map((t, idx) => {
                        const isParent = t.id === hnsTrackPicker.trackId;
                        const isFirst = idx === 0;
                        const disabled = isParent || isFirst;
                        const usedCount = localTracks.reduce((acc, tr) =>
                          acc + ((tr as any).hnsSlot1?.url === t.url ? 1 : 0) + ((tr as any).hnsSlot2?.url === t.url ? 1 : 0), 0);
                        const atLimit = !disabled && usedCount >= 2;
                        return (
                          <button key={t.id} type="button" disabled={disabled || atLimit}
                            onClick={() => handlePickTrackForHnsSlot(t)}
                            className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition-all hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="w-4 text-[9px] font-black shrink-0" style={{ color: idx === 0 ? 'rgba(255,255,255,0.2)' : '#ff8c00' }}>{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-widest truncate">{t.title}</p>
                              <p className="text-[7px] text-white/25">
                                {isFirst ? '#1 — cannot be a source' : isParent ? 'Current track' : atLimit ? 'At 2-slot limit' : `${2 - usedCount} slot${2 - usedCount !== 1 ? 's' : ''} left`}
                              </p>
                            </div>
                            {!disabled && !atLimit && <ChevronRight size={10} className="text-white/30 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Edge-to-edge track list — break out of the content padding so rows span the full width */}
              <div className="-mx-6">
              {localTracks.map((t, i) => {
                const isActive = currentTrackIndex === i;
                const isExpanded = expandedTrackId === t.id;
                // The track queued to play next (respects shuffle/repeat) — glows green.
                const isNextUp = !isActive && !!nextTrackId && t.id === nextTrackId;
                const hnsOn = !!album.hideNSeekConfig?.isEnabled;
                return (
                  <div
                    key={t.id}
                    draggable={!!isOwner}
                    onDragStart={() => { dragTrackIndexRef.current = i; }}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); const from = dragTrackIndexRef.current; if (from !== null && from !== i) reorderTracks(from, i); dragTrackIndexRef.current = null; }}
                    onDragEnd={() => { dragTrackIndexRef.current = null; }}
                    className={`relative overflow-hidden border-b border-white/[0.06] last:border-b-0 ${isNextUp ? 'track-next-glow' : ''}`}
                  >
                    {/* Active row: edge-to-edge purple→orange gradient with a slow gentle sweep */}
                    {isActive && <div className="absolute inset-0 track-gradient-active pointer-events-none" aria-hidden="true" />}
                    {/* Repeat-One: green glow at the start, fading into the gradient */}
                    {isActive && repeatOneGreenOpacity > 0 && (
                      <div className="absolute inset-0 pointer-events-none" aria-hidden="true"
                        style={{ background: 'linear-gradient(90deg, rgba(34,197,94,0.55) 0%, rgba(34,197,94,0) 34%)', opacity: repeatOneGreenOpacity }} />
                    )}
                    {/* Final 10s: red flash bleeding in from the trailing edge */}
                    {isActive && isEndingSoon && (
                      <div className="absolute inset-0 pointer-events-none track-ending-flash" aria-hidden="true" />
                    )}
                    <div className={`relative flex items-center gap-3 px-4 py-3.5 ${isActive ? '' : 'hover:bg-white/[0.03]'}`}>
                      {isOwner && <GripVertical size={14} className="text-white/20 shrink-0 cursor-grab active:cursor-grabbing" />}
                      <button onClick={() => { setCurrentTrackIndex(i); playTrack(t, album, 'LIBRARY'); }} className="flex items-center gap-3 text-left flex-1 min-w-0">
                        <span className="text-[10px] font-black text-small-orange w-4 shrink-0 self-start pt-0.5">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          {/* Track-list titles stay a single line (the full title is the big header above) */}
                          <p className="text-xs font-bold uppercase tracking-widest truncate">{t.title}</p>
                          {/* Lyrics get the full-width title column (timing moved to the right) */}
                          {isActive && isCurrentTrackGlobal
                            ? <CaptionTicker caption={getCurrentCaption()} />
                            : <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest break-words">{t.artist || album.artist}</p>}
                          {(t.isEclipsa || t.isAtmos) && <ImmersiveBadge isEclipsa={t.isEclipsa} isAtmos={t.isAtmos} size="sm" className="mt-1" />}
                        </div>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Active track: countdown / total on the RIGHT, right-aligned */}
                        {isActive && isCurrentTrackGlobal && globalDuration > 0 && (
                          <div className="flex flex-col items-end font-mono tabular-nums text-[9px] font-black tracking-tight leading-tight self-center">
                            <span className={isEndingSoon ? 'text-red-400' : 'text-white/70'}>-{formatTime(trackRemaining)}</span>
                            <span className="text-white/35">{formatTime(globalDuration)}</span>
                          </div>
                        )}
                        {isActive && globalIsPlaying && isCurrentTrackGlobal
                          ? <AmplitudeBar analyser={globalAnalyser} isPlaying={true} />
                          : <Play size={14} className="text-white/20" fill="currentColor" />}
                        <button
                          onClick={(e) => { e.stopPropagation(); setPlaylistPickerTrack(t); }}
                          title="Add this song to a playlist"
                          className="tap hidden items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/50 hover:text-white transition-all text-[9px] font-black uppercase tracking-widest"
                        >
                          <ListPlus size={12} />
                          <span className="hidden sm:inline">Add</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('OPEN_BREAKDOWN', { detail: { track: t, album } })); }}
                          title="The Breakdown — analyze key, tempo, chords & sheet music"
                          className="tap hidden items-center gap-1 px-2 py-1 rounded-lg bg-[#FF8C00]/10 hover:bg-[#FF8C00]/25 text-[#FF8C00]/60 hover:text-[#FF8C00] transition-all text-[9px] font-black uppercase tracking-widest"
                        >
                          <Waves size={11} />
                          <span className="hidden sm:inline">Breakdown</span>
                        </button>
                        {/* Send this song into Plajah Pixels (visualizer) */}
                        <button
                          onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('OPEN_PLAJAH_PIXELS', { detail: { track: t, album } })); }}
                          title="Plajah Pixels — send this song into the visualizer"
                          className="tap hidden items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/25 text-purple-300/70 hover:text-purple-200 transition-all text-[9px] font-black uppercase tracking-widest"
                        >
                          <Sparkles size={11} />
                          <span>PP</span>
                        </button>
                        {/* Share this individual track (Plajah feed + social) */}
                        <div onClick={(e) => e.stopPropagation()}>
                          <ShareButton
                            title={t.title}
                            artist={t.artist || album.artist}
                            text={`Check out ${t.title} by ${t.artist || album.artist} on Plajah.com`}
                            url={buildShareUrl('album', album.id, { track: t.id })}
                            imageUrl={album.coverImage}
                            plajahLabel="Share to Plajah feed"
                            onPostToPlajah={async () => {
                              await createPost({
                                text: `🎵 ${t.title} — ${t.artist || album.artist}`,
                                media: [{ type: 'AUDIO', url: t.url || '', id: t.id, title: t.title, thumbnail: album.coverImage } as any],
                                albumEmbed: album,
                              });
                            }}
                            className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all"
                          />
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedTrackId(isExpanded ? null : t.id); }}
                          title="More"
                          className={`${isOwner ? '' : 'sm:hidden'} p-1.5 rounded-lg transition-all ${isExpanded ? 'bg-small-orange/20 text-small-orange' : 'text-white/20 hover:text-white'}`}
                        >
                          <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Expandable drawer — smooth height; on phones it holds the
                        Add / Breakdown / Pixels actions so the row stays clean */}
                    <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div key="drawer" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }} className="overflow-hidden">
                      <div className="bg-black/40 backdrop-blur-xl rounded-b-2xl border-t border-white/5 p-4 space-y-3">
                        {/* Phone quick action — kept minimal (Breakdown / Pixels live in the full player) */}
                        <div className="flex sm:hidden flex-wrap gap-2">
                          <button onClick={(e) => { e.stopPropagation(); setPlaylistPickerTrack(t); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-white/70 text-[10px] font-black uppercase tracking-widest"><ListPlus size={13} /> Add to playlist</button>
                        </div>
                        {isOwner && (
                        <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          {hnsOn ? <Eye size={12} className="text-small-orange" /> : <EyeOff size={12} className="text-white/30" />}
                          <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
                            Hide & Seek Alternates — {hnsOn ? 'Active' : 'Hidden from public'}
                          </span>
                        </div>
                        {i === 0 && (
                          <p className="text-[7px] font-black uppercase tracking-widest text-white/20 mb-1">Track #1 can receive slots · cannot be a slot source</p>
                        )}
                        {([1, 2] as const).map(slot => {
                          const slotKey = `hnsSlot${slot}` as 'hnsSlot1' | 'hnsSlot2';
                          const existing = t[slotKey];
                          const key = `${t.id}_slot${slot}`;
                          const uploading = uploadingSlot === key;
                          const progress = uploadProgress[key] ?? 0;
                          const saved = slotSavedKey === key;
                          return (
                            <div key={slot} className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${existing ? 'border-small-orange/30 bg-small-orange/5' : 'border-white/10 bg-white/5'}`}>
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[9px] font-black ${existing ? 'bg-small-orange/20 text-small-orange' : 'bg-white/5 text-white/20'}`}>
                                {uploading ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} className="text-green-400" /> : `S${slot}`}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Slot {slot}</p>
                                <p className="text-[10px] font-bold truncate">{saved ? 'Saved!' : existing ? existing.title : 'No track assigned'}</p>
                              </div>
                              {/* Pick from album tracks */}
                              <button type="button"
                                onClick={() => setHnsTrackPicker({ trackId: t.id, slot })}
                                className="tap shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all"
                                style={{ background: 'rgba(255,140,0,0.12)', color: 'rgba(255,140,0,0.8)', border: '1px solid rgba(255,140,0,0.25)' }}>
                                <Music2 size={9} /> Pick
                              </button>
                              {/* Upload new file */}
                              <label className="tap shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest cursor-pointer transition-all hover:bg-white/10"
                                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Upload size={9} />
                                <input type="file" accept="audio/*,video/*" className="hidden" disabled={uploading}
                                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleHnsSlotUpload(t, slot, f); }} />
                              </label>
                              {existing && (
                                <button type="button"
                                  onClick={() => {
                                    const updated = localTracks.map(tr => tr.id === t.id ? { ...tr, [`hnsSlot${slot}`]: undefined } : tr);
                                    setLocalTracks(updated); setHnsModified(true);
                                  }}
                                  className="shrink-0 p-1 rounded-lg text-white/20 hover:text-red-400 transition-all">
                                  <X size={12} />
                                </button>
                              )}
                              {uploading && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-small-orange rounded-full transition-all" style={{ width: `${progress}%` }} />
                              )}
                            </div>
                          );
                        })}
                        </div>
                        )}
                      </div>
                      </motion.div>
                    )}
                    </AnimatePresence>

                    {/* ── In This Song (mobile) ── */}
                    {t.characterIds && t.characterIds.length > 0 && worldCharacters.length > 0 && (
                      <div className={`px-4 pt-2 pb-3 border-t border-white/[0.05] ${isActive ? 'bg-gradient-to-br from-[#6B0099]/20 via-transparent to-[#FF8C00]/10 rounded-b-2xl' : 'bg-black/20 rounded-b-2xl'}`}>
                        <p className="text-[7px] font-black uppercase tracking-[0.35em] text-white/20 mb-2">In This Song</p>
                        <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
                          {t.characterIds.map(cid => {
                            const char = worldCharacters.find(c => c.id === cid);
                            if (!char) return null;
                            const imgSrc = t.trackCharacterImages?.[cid] || char.imageUrl;
                            return (
                              <div key={cid} className="flex flex-col items-center gap-1 shrink-0 w-11">
                                <div className="w-9 h-9 rounded-full overflow-hidden border border-[#D0BCFF]/30 bg-white/5">
                                  <img
                                    src={thumb(imgSrc, THUMB.micro) || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`}
                                    alt={char.name}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover"
                                    onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`; }}
                                  />
                                </div>
                                <p className="text-[7px] font-black text-white/35 uppercase tracking-wide truncate w-full text-center">{char.name}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          )}

          {activeHUD === 'LYRICS' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center justify-between mb-6">
                 <div className="flex items-center gap-3">
                   <Music2 size={16} className="text-small-orange" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Synchronized Lyrics</span>
                 </div>
                 {currentTrack?.timeCodedLyrics && (
                   <div className="flex items-center gap-1">
                     {isResyncMode ? (
                       <button onClick={() => setIsResyncMode(false)} className="text-[8px] font-black uppercase tracking-widest text-small-orange animate-pulse px-2 py-1 bg-small-orange/10 rounded">Cancel</button>
                     ) : (
                       <>
                         {renderLyricTranslate()}
                         <button onClick={() => setLyricsOffset(o => o - 0.5)} title="Shift lyrics earlier" className="tap w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-[11px] font-black text-white/40 hover:text-white/70 transition-all">−</button>
                         <span className="text-[8px] font-black text-white/30 w-11 text-center tabular-nums">{lyricsOffset === 0 ? '±0.0s' : `${lyricsOffset > 0 ? '+' : ''}${lyricsOffset.toFixed(1)}s`}</span>
                         <button onClick={() => setLyricsOffset(o => o + 0.5)} title="Shift lyrics later" className="tap w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-[11px] font-black text-white/40 hover:text-white/70 transition-all">+</button>
                         {lyricsOffset !== 0 && <button onClick={() => setLyricsOffset(0)} title="Reset offset" className="w-6 h-6 flex items-center justify-center text-white/20 hover:text-white/50 transition-all"><RotateCcw size={10} /></button>}
                         {isOwner && <button onClick={() => setIsResyncMode(true)} className="ml-1 text-[8px] font-black uppercase tracking-widest text-white/30 hover:text-small-orange transition-all px-2 py-1 bg-white/5 hover:bg-small-orange/10 rounded">Resync</button>}
                       </>
                     )}
                   </div>
                 )}
               </div>

               <div className="space-y-6" ref={lyricsContainerRef}>
                 {currentTrack?.timeCodedLyrics ? (
                   <TimeCodedLyrics
                     tracks={currentTrack.timeCodedLyrics}
                     currentTime={globalCurrentTime}
                     seek={seek}
                     containerRef={lyricsContainerRef}
                     offset={lyricsOffset}
                     isResyncMode={isResyncMode}
                     onResync={handleResync}
                     translations={lyricTx?.map}
                   />
                 ) : currentTrack?.lyrics ? (
                   <div className="space-y-6 opacity-60">
                     {currentTrack.lyrics.split('\n').map((line, idx) => (
                       <p key={idx} className="text-xl font-display font-black uppercase tracking-tight">{line}</p>
                     ))}
                   </div>
                 ) : (
                   <div className="flex flex-col items-center justify-center text-center p-8 gap-6 opacity-40">
                     <Music2 size={32} className="text-white/20" />
                     <p className="text-[10px] font-black uppercase tracking-[0.3em]">No lyrics available.</p>
                   </div>
                 )}
               </div>
            </div>
          )}

          {activeHUD === 'MEDIA' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <AdaptiveGrid phone={1} tablet={2} desktop={2} gap="1rem">
                {album.musicVideos?.map(video => (
                  <button 
                    key={video.id} 
                    onClick={() => { setActiveVideoId(video.id); playVideo(video); }}
                    className={`relative aspect-video rounded-xl overflow-hidden border transition-all ${activeVideoId === video.id ? 'border-white' : 'border-white/10'}`}
                  >
                    <img src={thumb(video.thumbnailUrl || album.coverImage, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(video.thumbnailUrl || album.coverImage)} className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-t from-black/80 to-transparent">
                      <span className="text-[8px] font-black uppercase tracking-widest truncate">{video.title}</span>
                    </div>
                  </button>
                ))}
              </AdaptiveGrid>
            </div>
          )}

          {activeHUD === 'COMMENTS' && (
            <div className="h-full animate-in slide-in-from-bottom-4 duration-500">
              <div className="mb-4 flex items-center gap-2 text-[#00FF00] drop-shadow-[0_0_12px_rgba(0,255,0,0.8)]">
                <Radio size={12} />
                <span className="text-[9px] font-black uppercase tracking-widest">live chat</span>
              </div>
              <HUDCommentModule album={album} trackId={currentTrack?.id || null} isPublic={true} themeColor={album.themeColor} user={user} onVisitUser={onVisitUser} onUpdate={onUpdate} />
            </div>
          )}

          {activeHUD === 'INFO' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-4 flex-wrap">
                <img src={thumb(album.artistImage || album.coverImage, THUMB.small) || undefined} loading="lazy" decoding="async" onError={onThumbError(album.artistImage || album.coverImage)} className="w-16 h-16 rounded-2xl object-cover border border-white/10" />
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">{album.artist}</h3>
                  {(album as any).source === 'AUDIUS' ? (
                    <a href={(album as any).audiusUrl || 'https://audius.co/'} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest"
                      style={{ color: '#C56BFF' }}>
                      Streaming via Audius <ExternalLink size={9} />
                    </a>
                  ) : (
                    <p className="text-[9px] font-bold text-small-orange uppercase tracking-widest">Archive Identity</p>
                  )}
                </div>
                <div className="ml-auto">
                  <PlajahPlusButton
                    creatorId={album.ownerId}
                    creatorName={album.artist}
                    isOwnProfile={!!(user && album.ownerId === user.uid)}
                  />
                </div>
              </div>
              <p className="text-sm font-medium leading-relaxed text-white/60 italic font-display">
                {album.artistBio || album.description}
              </p>

              {album.worldId && (
                <WorldBadge
                  worldId={album.worldId}
                  contentTitle={album.title}
                  contentType="album"
                  onNavigate={onNavigateToWorld}
                />
              )}

              {worldCharacters.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                    <Users size={10} className="text-white/20" /> Featured Characters
                  </h4>
                  <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                    {worldCharacters.slice(0, 8).map(char => (
                      <button key={char.id} type="button"
                        onClick={() => { if (onNavigateToWorld && album.worldId) onNavigateToWorld(album.worldId, char.id); }}
                        className="flex flex-col items-center gap-1.5 shrink-0 w-14 group"
                        title={`${char.name} — open in world`}>
                        <div className="w-11 h-11 rounded-full overflow-hidden border border-white/10 group-hover:border-small-orange/50 bg-white/5 transition-colors">
                          <img
                            src={thumb(char.imageUrl, THUMB.micro) || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`}
                            alt={char.name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`; }}
                          />
                        </div>
                        <p className="text-[8px] font-black text-white/40 group-hover:text-white/70 uppercase tracking-wide truncate w-full text-center transition-colors">{char.name}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {worldContent && ([...worldContent.videos, ...worldContent.albums].filter(c => c.id !== album.id).length > 0) && (
                <div className="space-y-3">
                  <h4 className="text-[9px] font-black uppercase tracking-widest text-white/25">More From This World</h4>
                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                    {[...worldContent.videos, ...worldContent.albums]
                      .filter(c => c.id !== album.id)
                      .slice(0, 10)
                      .map((content, i) => {
                        const thumb = (content as any).coverImage || (content as any).coverImageUrl || (content as any).thumbnailUrl;
                        const open = () => {
                          if ((content as any).tracks?.length) { playTrack((content as any).tracks[0], content as Album, 'LIBRARY'); setCurrentTrackIndex(0); }
                          else { setActiveVideoId((content as any).id); playVideo(content as any); }
                        };
                        return (
                          <div key={(content as any).id || i} className="shrink-0 w-14">
                            <div className="w-14 h-[4.5rem] mb-1.5">
                              <HoverPreviewThumb
                                poster={thumb}
                                title={content.title}
                                preview={previewSourceFor(content)}
                                accent="#FF8C00"
                                aspectClass="h-full"
                                roundClass="rounded-xl"
                                hideCaption
                                fallbackIcon={<Music2 size={14} className="text-white/15" />}
                                onClick={open}
                              />
                            </div>
                            <p className="text-[7px] font-black text-white/35 truncate uppercase tracking-wide">{content.title}</p>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // A real television gets the purpose-built album screen: large art, a constrained tracklist,
  // and declared D-pad navigation. The block below remains for the manual "TV Mode" toggle on a
  // desktop, which is a different thing — a big-screen preview driven by a mouse.
  if (isTVMode && getPlatformInfo().isTV) {
    return (
      <AlbumTvView
        album={album}
        currentTrackId={currentTrack?.id}
        isPlaying={globalIsPlaying && isCurrentTrackGlobal}
        onPlayTrack={(t, i) => { setCurrentTrackIndex(i); playTrack(t, album, 'LIBRARY'); }}
        onPlayAll={() => { if (album.tracks?.length) { setCurrentTrackIndex(0); playTrack(album.tracks[0], album, 'LIBRARY'); } }}
        onShuffle={() => {
          if (!album.tracks?.length) return;
          setIsShuffle(true);
          const i = Math.floor(Math.random() * album.tracks.length);
          setCurrentTrackIndex(i);
          playTrack(album.tracks[i], album, 'LIBRARY');
        }}
        onBack={onBack}
        onNavigateToWorld={onNavigateToWorld}
        onOpenItem={onOpenItem}
      />
    );
  }

  if (isTVMode) {
    return (
      <div className="h-[100dvh] bg-[#080808] text-white relative overflow-hidden font-sans selection:bg-small-orange selection:text-black">
        <AtmosphericBackground album={album} analyser={globalAnalyser} isPlaying={globalIsPlaying && isCurrentTrackGlobal} simplified={true} />
        
        <div className="relative z-40 w-full h-full flex flex-col p-8 lg:p-14 gap-10">
          {/* TV HEADER - LARGE TABS */}
          <header className="flex items-center justify-between gap-8">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Navigate</span>
              <div className="flex items-center gap-6">
                <button onClick={onBack} className="p-5 bg-white/5 border border-white/10 rounded-full hover:bg-white/20 transition-all">
                  <ArrowLeft size={28} />
                </button>
                <nav className="flex items-center gap-1.5 p-1.5 rounded-xl overflow-x-auto no-scrollbar shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {[
                    { id: 'TRACKS', label: 'Playlist', icon: List },
                    { id: 'LYRICS', label: 'Signal', icon: Music2 },
                    { id: 'MEDIA', label: 'Visuals', icon: VideoIcon },
                    { id: 'COMMENTS', label: 'Feed', icon: MessageSquare },
                    { id: 'INFO', label: 'Notes', icon: Sparkles },
                    { id: 'ABOUT', label: 'Identity', icon: User }
                  ].map(tab => {
                    const active = activeHUD === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveHUD(tab.id as any)}
                        className="relative flex items-center gap-1.5 px-4 py-2 font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap overflow-hidden"
                        style={active ? {
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, rgba(255,140,0,0.18) 0%, rgba(139,92,246,0.18) 100%)',
                          border: '1px solid rgba(255,140,0,0.30)',
                          boxShadow: '0 0 16px rgba(255,140,0,0.12)',
                          color: '#fff',
                        } : {
                          borderRadius: '8px',
                          background: 'transparent',
                          border: '1px solid transparent',
                          color: 'rgba(255,255,255,0.35)',
                        }}
                      >
                        {active && <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(255,140,0,0.07) 0%, rgba(139,92,246,0.07) 100%)', borderRadius: '7px' }} />}
                        <tab.icon size={14} className="relative shrink-0" />
                        <span className="relative">{tab.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex flex-col gap-2 items-end">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Themes</span>
                <button 
                  onClick={() => setIsTVMode(false)}
                  className="px-8 py-4 bg-white/10 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all flex items-center gap-3"
                >
                  <Zap size={14} className="text-small-orange" /> Desktop UI
                </button>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center shadow-2xl">
                <Logo size={32} />
              </div>
            </div>
          </header>

          {/* MAIN TV BODY */}
          <main className="flex-1 flex flex-col lg:flex-row gap-12 overflow-hidden">
            {/* LEFT: DOMINANT MEDIA (ART/SLIDESHOW/VIDEO) */}
            <section className="w-full lg:w-[58%] flex flex-col gap-6">
              <div className="flex-1 relative rounded-[4rem] overflow-hidden border border-white/5 bg-black shadow-[0_0_100px_rgba(0,0,0,0.8)] group">
                {activeVideoId ? (
                   <div className="w-full h-full">
                     {(() => {
                       const video = album.musicVideos?.find(v => v.id === activeVideoId);
                       if (!video) return null;
                       const isYoutube = video.url.includes('youtube.com') || video.url.includes('youtu.be');
                       const isVimeo = video.url.includes('vimeo.com');
                       let embedUrl = video.url;
                       if (isYoutube) {
                        return (
                          <div className="w-full h-full relative">
                            <div id={ytContainerId.current} className="w-full h-full" />
                          </div>
                        );
                       } else if (isVimeo) {
                         const vid = video.url.split('/').pop();
                         embedUrl = `https://player.vimeo.com/video/${vid}?autoplay=1&muted=1`;
                       }
                       return (
                         <div className="w-full h-full relative">
                           {isVimeo ? (
                             <iframe src={embedUrl} className="w-full h-full" allow="autoplay; fullscreen" />
                           ) : (
                             <video ref={setVideoElement} src={video.url || undefined} playsInline autoPlay className="w-full h-full object-contain" onClick={() => togglePlay()} />
                           )}
                           <button onClick={() => {
                             setActiveVideoId(null);
                             clearMedia();
                           }} className="absolute top-8 right-8 p-4 bg-black/60 backdrop-blur-2xl rounded-full text-white/40 hover:text-white transition-all z-20">
                             <X size={24} />
                           </button>
                         </div>
                       );
                     })()}
                   </div>
                ) : (
                  <div className="w-full h-full relative">
                    {isSlideshowActive ? (
                      <AnimatedSlideshow
                        images={resolveSlideshowImages(album, currentTrack)}
                        isPlaying={globalIsPlaying && isCurrentTrackGlobal}
                        themeColor={album.themeColor}
                      />
                    ) : (
                      <>
                        <Visualizer
                          analyser={globalAnalyser}
                          themeColor={album.themeColor}
                          trackTitle={currentTrack?.title || album.title}
                          artist={album.artist}
                          isPlaying={globalIsPlaying && isCurrentTrackGlobal}
                        />
                        {visualizerType === 'PAINT' && (
                          <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.9 }}>
                            <PaintPoolVisualizer analyser={globalAnalyser} isPlaying={globalIsPlaying && isCurrentTrackGlobal} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Media Controls Overlay */}
                <div className="absolute bottom-12 right-12 flex flex-col gap-2 items-end opacity-0 group-hover:opacity-100 transition-all duration-500">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/60">View Features</span>
                  <div className="flex items-center gap-3 bg-black/40 backdrop-blur-xl p-2 rounded-full border border-white/10">
                    {/* Offered everywhere except a TV — see canUseFxStage for why this is not
                        judged on the measured performance tier. */}
                    {canUseFxStage() && (
                      <button onClick={() => setIsSlideshowActive(false)} className={`px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all ${!isSlideshowActive ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}>Visualizer</button>
                    )}
                    <button onClick={() => setIsSlideshowActive(true)} className={`px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all ${isSlideshowActive ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}>Slideshow</button>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT: COMPACT CONTENT GRID (42%) */}
            <section className="w-full lg:w-[42%] flex flex-col gap-10 overflow-hidden">
              {/* COMPACT TRACKLIST */}
              <div className={`transition-all duration-700 overflow-hidden bg-gradient-to-br from-[#6B0099]/20 via-[#D40055]/10 to-[#FF8C00]/20 backdrop-blur-3xl border border-white/10 rounded-[3.5rem] p-10 flex flex-col shadow-[0_0_50px_rgba(107,0,153,0.15)] ${activeHUD === 'TRACKS' ? 'flex-1' : 'h-48 shrink-0'}`}>
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/50">Operational Tracks</h4>
                  <span className="text-[10px] font-bold text-small-orange/40 uppercase tracking-widest">{currentTrackIndex + 1} / {localTracks.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 space-y-3">
                  {localTracks.map((t, i) => (
                    <div
                      key={t.id}
                      draggable={isOwner}
                      onDragStart={() => { dragTrackIndexRef.current = i; }}
                      onDragOver={e => { e.preventDefault(); setDragOverTrackIndex(i); }}
                      onDrop={() => { if (dragTrackIndexRef.current !== null && dragTrackIndexRef.current !== i) reorderTracks(dragTrackIndexRef.current, i); setDragOverTrackIndex(null); dragTrackIndexRef.current = null; }}
                      onDragEnd={() => { setDragOverTrackIndex(null); dragTrackIndexRef.current = null; }}
                      className={`flex items-center gap-2 rounded-2xl border transition-all ${dragOverTrackIndex === i ? 'border-small-orange/60 bg-small-orange/10' : 'border-transparent'}`}
                    >
                      {isOwner && <GripVertical size={14} className="text-white/20 shrink-0 cursor-grab ml-2" />}
                      <button
                        onClick={() => { setCurrentTrackIndex(i); playTrack(t, album, 'LIBRARY'); }}
                        className={`flex-1 flex items-center justify-between p-5 rounded-2xl border transition-all group scale-active ${currentTrackIndex === i ? 'bg-gradient-to-br from-[#6B0099]/40 via-[#D40055]/40 to-[#FF8C00]/40 text-white border-white/30 shadow-[0_0_30px_rgba(107,0,153,0.3)] backdrop-blur-3xl' : 'bg-gradient-to-br from-[#6B0099]/10 via-transparent to-[#FF8C00]/10 backdrop-blur-2xl border-white/5 hover:border-white/20'}`}
                      >
                        <div className="flex items-center gap-6 min-w-0">
                          <span className={`text-[10px] font-black w-4 ${currentTrackIndex === i ? 'text-white' : 'text-white/20'}`}>{i + 1}</span>
                          <p className={`text-sm font-black uppercase tracking-widest truncate ${currentTrackIndex === i ? 'text-white' : 'text-white/80'}`}>{t.title}</p>
                        </div>
                        {currentTrackIndex === i && globalIsPlaying ? (
                          <div className="flex gap-1 items-end h-3">
                            {[0, 1, 2].map(b => <motion.div key={b} animate={{ height: [4, 12, 6, 12, 4] }} transition={{ duration: 1, repeat: Infinity, delay: b * 0.2 }} className="w-1 rounded-full bg-small-orange" />)}
                          </div>
                        ) : (
                          <Play size={14} className={currentTrackIndex === i ? 'text-white' : 'text-white/20'} fill="currentColor" />
                        )}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPlaylistPickerTrack(t); }}
                        title="Add this song to a playlist"
                        className="shrink-0 p-2.5 mr-1 rounded-xl bg-white/5 hover:bg-white/15 text-white/40 hover:text-white transition-all"
                      >
                        <ListPlus size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* BOTTOM: SIDE-BY-SIDE ANALYTICS (VISUALIZER + LYRICS) */}
              <div className="flex-1 min-h-0 flex gap-6">
                {/* VISUALIZER SIDE */}
                <div className="flex-1 bg-black/40 backdrop-blur-3xl border border-white/5 rounded-[3.5rem] relative flex items-center justify-center p-10 overflow-hidden">
                   <h5 className="absolute top-8 left-10 text-[9px] font-black uppercase tracking-[0.4em] text-white/20">Frequency Spectrum</h5>
                   <Visualizer analyser={globalAnalyser} themeColor={album.themeColor} trackTitle={currentTrack?.title || ''} artist={album.artist} isPlaying={globalIsPlaying && isCurrentTrackGlobal} simplified={true} />
                </div>
                
                {/* ACTIVE TAB CONTENT SIDE (LYRICS/COMMENTS/BIO) */}
                <div className="flex-1 bg-black/40 backdrop-blur-3xl border border-white/5 rounded-[3.5rem] p-10 flex flex-col overflow-hidden">
                  <h5 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20 mb-6 flex items-center justify-between">
                    <span>{activeHUD === 'LYRICS' ? 'Transmissions' : activeHUD === 'COMMENTS' ? 'The Social Feed' : 'Metadata'}</span>
                    <Activity size={12} className="text-small-orange" />
                  </h5>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {activeHUD === 'LYRICS' && (
                       <div className="space-y-6">
                         {currentTrack?.timeCodedLyrics ? (
                           currentTrack.timeCodedLyrics.map((line, idx) => {
                             const isActive = globalCurrentTime >= line.time && (!currentTrack.timeCodedLyrics![idx + 1] || globalCurrentTime < currentTrack.timeCodedLyrics![idx + 1].time);
                             return (
                               <motion.p key={idx} animate={{ opacity: isActive ? 1 : 0.2, scale: isActive ? 1.05 : 1 }} className={`text-xl font-display font-black uppercase tracking-tight leading-tight transition-all duration-700 ${isActive ? 'text-small-orange' : 'text-white'}`}>{line.text}</motion.p>
                             );
                           })
                         ) : (
                           <p className="text-lg font-medium italic text-white/40 leading-relaxed">{currentTrack?.lyrics || "Lyrics unavailable for this signal."}</p>
                         )}
                       </div>
                    )}
                    {activeHUD === 'COMMENTS' && (
                      <HUDCommentModule album={album} trackId={currentTrack?.id || null} isPublic={true} themeColor={album.themeColor} user={user} minimal onVisitUser={onVisitUser} onUpdate={onUpdate} />
                    )}
                    {activeHUD === 'INFO' && (
                      <div className="space-y-6">
                        <p className="text-sm font-medium leading-relaxed italic text-white/60">{album.linerNotes || "Operational data compilation in progress."}</p>
                        {album.worldId && (
                          <WorldBadge worldId={album.worldId} contentTitle={album.title} contentType="album" onNavigate={onNavigateToWorld} />
                        )}
                        {worldCharacters.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Featured Characters</p>
                            <div className="flex flex-wrap gap-2">
                              {worldCharacters.slice(0, 6).map(char => (
                                <button key={char.id} type="button"
                                  onClick={() => { if (onNavigateToWorld && album.worldId) onNavigateToWorld(album.worldId, char.id); }}
                                  className="flex items-center gap-2 bg-white/5 border border-white/8 hover:border-small-orange/40 rounded-xl px-2.5 py-1.5 transition-colors" title={`${char.name} — open in world`}>
                                  <div className="w-6 h-6 rounded-full overflow-hidden border border-white/10">
                                    <img src={thumb(char.imageUrl, THUMB.micro) || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`} loading="lazy" decoding="async" onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`; }} className="w-full h-full object-cover" />
                                  </div>
                                  <p className="text-[9px] font-black text-white/60 uppercase tracking-wide">{char.name}</p>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {worldContent && ([...worldContent.videos, ...worldContent.albums].filter(c => c.id !== album.id).length > 0) && (
                          <div className="space-y-2">
                            <p className="text-[8px] font-black uppercase tracking-widest text-white/20">More From This World</p>
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                              {[...worldContent.videos, ...worldContent.albums].filter(c => c.id !== album.id).slice(0, 8).map((content, i) => {
                                const thumb = (content as any).coverImage || (content as any).thumbnailUrl;
                                const open = () => {
                                  if ((content as any).tracks?.length) { playTrack((content as any).tracks[0], content as Album, 'LIBRARY'); setCurrentTrackIndex(0); }
                                  else { setActiveVideoId((content as any).id); playVideo(content as any); }
                                };
                                return (
                                  <div key={(content as any).id || i} className="shrink-0 w-12">
                                    <div className="w-12 h-16 mb-1">
                                      <HoverPreviewThumb poster={thumb} title={content.title} preview={previewSourceFor(content)}
                                        accent="#FF8C00" aspectClass="h-full" roundClass="rounded-lg" hideCaption
                                        fallbackIcon={<Music2 size={12} className="text-white/15" />} onClick={open} />
                                    </div>
                                    <p className="text-[6px] font-black text-white/30 truncate uppercase">{content.title}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {activeHUD === 'ABOUT' && (
                      <div className="space-y-4">
                        <img src={thumb(album.artistImage || album.coverImage, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(album.artistImage || album.coverImage)} className="w-full aspect-square object-cover rounded-2xl mb-4" />
                        <h3 className="text-2xl font-display font-black uppercase">{album.artist}</h3>
                        <p className="text-xs font-medium italic text-white/40 leading-relaxed">{album.artistBio}</p>
                      </div>
                    )}
                    {activeHUD === 'MEDIA' && (
                      <div className="grid grid-cols-1 gap-4">
                        {album.musicVideos?.map(v => (
                          <button key={v.id} onClick={() => { setActiveVideoId(v.id); playVideo(v); }} className={`relative aspect-video rounded-2xl overflow-hidden border transition-all ${activeVideoId === v.id ? 'border-white' : 'border-white/10 hover:border-white/30'}`}>
                            <img src={thumb(v.thumbnailUrl || album.coverImage, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(v.thumbnailUrl || album.coverImage)} className="w-full h-full object-cover opacity-40 hover:opacity-100" />
                            <div className="absolute inset-0 flex flex-col justify-end p-4 bg-gradient-to-t from-black/80 to-transparent">
                              <span className="text-[10px] font-black uppercase tracking-widest text-white truncate">{v.title}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {activeHUD === 'TRACKS' && (
                       <div className="flex flex-col items-center justify-center h-full text-center opacity-20">
                         <Activity size={32} className="mb-4" />
                         <p className="text-[9px] font-black uppercase tracking-[0.4em]">Signal monitoring active</p>
                       </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </main>

          {/* TV FOOTER */}
          <footer className="flex justify-between items-center text-[11px] font-black uppercase tracking-[0.5em] text-white/10 pt-4 border-t border-white/5">
             <div className="flex gap-12"><span>OS v4.20 - TV OPTIMIZED</span><span>Sync Protocol Active</span></div>
             <div className="flex items-center gap-4 text-white/20">
                <span>Secure Link: {publicUrl.split('?')[0]}</span>
             </div>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-transparent text-primary overflow-hidden relative selection:bg-white selection:text-black font-sans">
      {/* ── Full-page cover art — clear, fades to transparent at bottom ── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Ambient blurred base (very soft, low opacity) */}
        <img
          src={activeVideo?.coverImageUrl || (currentTrack?.images?.[0]) || album.coverImage || undefined}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-[80px] opacity-30 transition-all duration-1000"
          referrerPolicy="no-referrer"
        />

        {/* Crisp full-page cover fading to transparent */}
        <AnimatePresence mode="wait">
          {!isSlideshowActive && (
            <motion.img
              key={currentTrack?.id || album.coverImage}
              src={activeVideo?.coverImageUrl || (currentTrack?.images?.[0]) || album.coverImage || undefined}
              alt=""
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2 }}
              className="absolute inset-0 w-full h-full object-cover transition-all duration-1000"
              referrerPolicy="no-referrer"
              style={{
                WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.15) 65%, transparent 90%)',
                maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.15) 65%, transparent 90%)',
              }}
            />
          )}
        </AnimatePresence>

        {/* Slideshow full-page blurred backdrop when active */}
        <AnimatePresence>
          {isSlideshowActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="absolute inset-0"
            >
              <AnimatedSlideshow
                images={resolveSlideshowImages(album, currentTrack)}
                isPlaying={globalIsPlaying && isCurrentTrackGlobal}
                themeColor={album.themeColor}
                artistNotes={undefined}
              />
              {/* Soft defocus blur + fade overlay */}
              <div
                className="absolute inset-0"
                style={{ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
              />
              <div
                className="absolute inset-0"
                style={{
                  WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.08) 70%, transparent 92%)',
                  maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.08) 70%, transparent 92%)',
                  background: 'transparent',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Vignette edges */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/15 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/75 to-transparent pointer-events-none" />
      </div>

      <AtmosphericBackground album={album} analyser={globalAnalyser} isPlaying={globalIsPlaying && isCurrentTrackGlobal} />
      <ScrollingWaveform
        currentTime={globalCurrentTime}
        duration={globalDuration}
        trackId={currentTrack?.id || 'unknown'}
        isPlaying={globalIsPlaying && isCurrentTrackGlobal}
        peaks={trackPeaks}
        onScratchStart={isCurrentTrackGlobal ? beginScratch : undefined}
        onScratchBy={isCurrentTrackGlobal ? scratchBy : undefined}
        onScratchEnd={isCurrentTrackGlobal ? endScratch : undefined}
      />

      {/* Subtle depth overlay — no blur so background stays visible */}
      <div className="fixed inset-0 bg-black/5 pointer-events-none z-[1]" />

      <div className="fixed inset-0 lg:right-[50%] z-10 flex flex-col p-6 lg:p-12">
         {activeVideoId ? (
           <div className="relative w-full h-full flex items-center justify-center animate-in fade-in zoom-in-95 duration-700">
             {(() => {
               const video = album.musicVideos?.find(v => v.id === activeVideoId);
               if (!video) return null;
               
               const isYoutube = video.url.includes('youtube.com') || video.url.includes('youtu.be');
               const isVimeo = video.url.includes('vimeo.com');
               let embedUrl = video.url;
               
               if (isYoutube) {
                 const vid = video.url.split('v=')[1]?.split('&')[0] || video.url.split('/').pop();
                 embedUrl = `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1`;
               } else if (isVimeo) {
                 const vid = video.url.split('/').pop();
                 embedUrl = `https://player.vimeo.com/video/${vid}?autoplay=1&muted=1`;
               }

               return (
                 <div className="w-full h-full relative group">
                   <div className="absolute inset-0 bg-gradient-to-br from-[#6B0099]/20 to-[#FF8C00]/20 blur-3xl opacity-50" />
                   <div className="relative w-full h-full rounded-[2rem] overflow-hidden border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] bg-black">
                     {isYoutube || isVimeo ? (
                       <iframe src={embedUrl} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />
                     ) : (
                       <video 
                         ref={setVideoElement}
                         src={video.url || undefined} playsInline autoPlay 
                         className="w-full h-full object-contain cursor-pointer" 
                         onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                       />
                     )}
                   </div>
                   <button 
                     onClick={() => {
                       setActiveVideoId(null);
                       clearMedia();
                     }}
                     className="absolute top-4 right-4 p-3 bg-black/60 backdrop-blur-md rounded-full text-white/40 hover:text-white hover:scale-110 transition-all z-20 opacity-0 group-hover:opacity-100"
                   >
                     <X size={20} />
                   </button>
                 </div>
               );
             })()}
           </div>
         ) : isVisualizerLayout ? (
           /* ── STAGE MODE: audio-reactive visualizer palette ── */
           <div className="flex-1 min-h-0 w-full relative overflow-hidden rounded-3xl bg-black/40 border border-white/[0.06] shadow-[0_0_80px_rgba(0,0,0,0.6)]">
             {/* Full-panel visualizer — always animates (idle or audio-reactive) */}
             <div className="absolute inset-0 z-0">
               {isPixelsEngine ? (
                 /* Plajah Pixels engines — MilkDrops / Shaders / Generators (no-param reactors) */
                 <div className="absolute inset-0">
                   <FxStageVisualizers engine={fxEngine as FxEngine} presetIndex={fxPresetIndex} analyser={globalAnalyser} isPlaying={globalIsPlaying && isCurrentTrackGlobal} />
                 </div>
               ) : (
                 <>
                   <div className="absolute inset-0" style={{ opacity: fxEngine === 'PAINT' ? 0.35 : 1, transition: 'opacity 0.8s ease' }}>
                     <Visualizer
                       analyser={globalAnalyser}
                       themeColor={album.themeColor}
                       trackTitle={currentTrack?.title || album.title}
                       artist={album.artist}
                       isPlaying={globalIsPlaying && isCurrentTrackGlobal}
                       scrollingText={scrollingText}
                       alwaysAnimate={true}
                     />
                   </div>
                   {fxEngine === 'PAINT' && (
                     <div className="absolute inset-0 pointer-events-none">
                       <PaintPoolVisualizer analyser={globalAnalyser} isPlaying={globalIsPlaying && isCurrentTrackGlobal} alwaysAnimate={true} />
                     </div>
                   )}
                 </>
               )}
             </div>

             {/* Atmospheric edge gradients */}
             <div className="absolute inset-0 z-10 pointer-events-none">
               <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/50" />
               <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />
             </div>

             {/* Top controls bar */}
             <div className="absolute top-0 left-0 right-0 z-20 p-5 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
               <button
                 onClick={() => setIsVisualizerLayout(false)}
                 className="flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-black/80 transition-all"
               >
                 <X size={11} /> Exit
               </button>

               {/* Reactor selector — dropdown of engines + preset-cycling arrows */}
               {fxSelectorEl}

               <div className="flex items-center gap-2 shrink-0">
                 {/* PP → full Plajah Pixels experience (same action as the track-row PP button) */}
                 <button
                   onClick={openPlajahPixels}
                   title="Open the full Plajah Pixels experience"
                   className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-500/15 backdrop-blur-xl border border-purple-400/30 rounded-full text-[9px] font-black uppercase tracking-widest text-purple-200 hover:bg-purple-500/30 hover:text-white transition-all"
                 >
                   <Sparkles size={11} /> PP
                 </button>
                 <button
                   onClick={() => setIsVisualizerFullscreen(true)}
                   className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/20 transition-all"
                 >
                   <Maximize2 size={11} /> Full
                 </button>
               </div>
             </div>

             {/* Bottom: album art thumbnail + track info */}
             <div className="absolute bottom-0 left-0 right-0 z-20 p-5 flex items-end gap-4">
               <img
                 src={thumb(album.coverImage, THUMB.small) || undefined}
                 alt={album.title}
                 loading="lazy"
                 decoding="async"
                 onError={onThumbError(album.coverImage)}
                 className="w-14 h-14 rounded-xl object-cover border border-white/20 shadow-xl shrink-0"
               />
               <div className="flex-1 min-w-0 pb-1">
                 <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-0.5">{album.artist}</p>
                 <p className="text-sm font-black uppercase tracking-tight text-white/80 truncate">{currentTrack?.title || album.title}</p>
                 {!globalIsPlaying && (
                   <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mt-1">Play music to activate audio reactivity</p>
                 )}
               </div>
             </div>
           </div>
         ) : (
           /* ── DEFAULT MODE: cover art full-page bg + floating cards ── */
           <div className="w-full h-full relative flex flex-col">
             {/* Layer 0 — subtle visualizer at very low opacity for ambient movement */}
             <div className="absolute inset-0 pointer-events-none opacity-20">
               <div className="absolute inset-0" style={{ opacity: visualizerType === "PAINT" ? 0.35 : 1, transition: 'opacity 0.8s ease' }}>
                 <Visualizer analyser={globalAnalyser} themeColor={album.themeColor} trackTitle={currentTrack?.title || album.title} artist={album.artist} isPlaying={globalIsPlaying && isCurrentTrackGlobal} scrollingText={scrollingText} />
               </div>
               {visualizerType === "PAINT" && (
                 <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.92 }}>
                   <PaintPoolVisualizer analyser={globalAnalyser} isPlaying={globalIsPlaying && isCurrentTrackGlobal} />
                 </div>
               )}
             </div>

             {/* Layer 1 — album art card (centered top half) + WorldBadge overlay */}
             <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 pt-8 relative z-10">
               <motion.div
                 initial={{ scale: 0.9, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 transition={{ duration: 0.6, type: 'spring', damping: 20 }}
                 className="relative w-full max-w-[340px] aspect-square rounded-[2rem] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.6)] border border-white/10 group"
               >
                 <img src={thumb(album.coverImage, THUMB.large) || undefined} alt={album.title} loading="lazy" decoding="async" onError={onThumbError(album.coverImage)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                 {/* WorldBadge floating over cover art */}
                 {album.worldId && (
                   <div className="absolute bottom-4 left-4 right-4">
                     <WorldBadge
                       worldId={album.worldId}
                       contentTitle={album.title}
                       contentType="album"
                       onNavigate={onNavigateToWorld}
                     />
                   </div>
                 )}

                 {/* Hover: title reveal */}
                 <div className="pointer-events-none absolute top-4 left-4 right-4 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                   <h2 className="text-lg font-black uppercase tracking-tight drop-shadow-lg text-white">{album.title}</h2>
                   <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest drop-shadow-md">{album.artist}</p>
                 </div>
               </motion.div>

               {/* View mode toggle */}
               <div className="flex items-center gap-2">
                 <button
                   onClick={() => setIsSlideshowActive(false)}
                   className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${!isSlideshowActive ? 'bg-white text-black border-white' : 'bg-white/[0.06] border-white/10 text-white/40 hover:text-white'}`}
                 >
                   Art
                 </button>
                 <button
                   onClick={() => setIsSlideshowActive(true)}
                   className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${isSlideshowActive ? 'bg-white text-black border-white' : 'bg-white/[0.06] border-white/10 text-white/40 hover:text-white'}`}
                 >
                   Slideshow
                 </button>
                 {/* FX Stage is a continuous full-screen shader and the heaviest thing this
                     view can do, so a television does not offer it. Everything else does — a
                     listener asking for it on their own machine should get it. */}
                 {canUseFxStage() && (
                   <button
                     onClick={() => { setIsVisualizerLayout(true); setIsSlideshowActive(false); }}
                     className="px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border bg-white/[0.06] border-white/10 text-white/40 hover:text-white hover:border-small-orange/50 hover:bg-small-orange/10 flex items-center gap-2"
                   >
                     <Activity size={10} /> FX Stage
                   </button>
                 )}
               </div>

               {/* Share This Album — centered below the Art / Slideshow / FX Stage row */}
               {!isPublic && (
                 <button
                   onClick={() => setShowShareModal(true)}
                   className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 group"
                   style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
                   onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,140,0,0.15)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,140,0,0.35)'; (e.currentTarget as HTMLButtonElement).style.color = '#FF8C00'; }}
                   onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                 >
                   <Share2 size={14} /> Share This Album
                 </button>
               )}
             </div>

             {/* Layer 2 — World + character info cards just below album art */}
             <div className="relative z-10 px-6 pb-6 space-y-3">
               {/* Featured Characters horizontal scroll */}
               {worldCharacters.length > 0 && (
                 <motion.div
                   initial={{ opacity: 0, y: 12 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: 0.2 }}
                   className="bg-white/[0.06] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-4"
                 >
                   <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-3 flex items-center gap-2">
                     <Users size={9} /> Featured Characters
                   </p>
                   <div className="flex gap-3 overflow-x-auto no-scrollbar">
                     {worldCharacters.slice(0, 8).map(char => (
                       <div key={char.id} className="flex flex-col items-center gap-1.5 shrink-0 w-12">
                         <div className="w-10 h-10 rounded-full overflow-hidden border border-[#D0BCFF]/25 bg-white/5 shadow-lg">
                           <img
                             src={thumb(char.imageUrl, THUMB.micro) || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`}
                             alt={char.name}
                             loading="lazy"
                             decoding="async"
                             className="w-full h-full object-cover"
                             onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`; }}
                           />
                         </div>
                         <p className="text-[7px] font-black text-white/40 uppercase tracking-wide truncate w-full text-center">{char.name}</p>
                       </div>
                     ))}
                   </div>
                 </motion.div>
               )}

               {/* More From This World compact strip */}
               {worldContent && ([...worldContent.videos, ...worldContent.albums].filter(c => c.id !== album.id).length > 0) && (
                 <motion.div
                   initial={{ opacity: 0, y: 12 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: 0.35 }}
                   className="bg-white/[0.06] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-4"
                 >
                   <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">More From This World</p>
                   <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
                     {[...worldContent.videos, ...worldContent.albums]
                       .filter(c => c.id !== album.id)
                       .slice(0, 10)
                       .map((content, i) => {
                         const coverThumb = (content as any).coverImage || (content as any).coverImageUrl || (content as any).thumbnailUrl;
                         return (
                           <div key={(content as any).id || i} className="shrink-0 w-12">
                             <div className="w-12 h-16 rounded-xl overflow-hidden bg-white/5 border border-white/8 mb-1 shadow-md">
                               {coverThumb
                                 ? <img src={thumb(coverThumb, THUMB.small) || undefined} onError={onThumbError(coverThumb)} loading="lazy" decoding="async" alt={content.title} className="w-full h-full object-cover" />
                                 : <div className="w-full h-full flex items-center justify-center"><Music2 size={13} className="text-white/15" /></div>}
                             </div>
                             <p className="text-[7px] font-black text-white/35 truncate uppercase tracking-wide">{content.title}</p>
                           </div>
                         );
                       })}
                   </div>
                 </motion.div>
               )}
             </div>
           </div>
         )}
         
         {showCaptions && (currentTrack.lyrics || currentTrack.timeCodedLyrics) && !activeVideoId && (
           <div className="mt-auto mb-8 animate-in slide-in-from-bottom-4 duration-700">
             <div className="h-16 flex items-center justify-center overflow-hidden">
               <p className="text-xl lg:text-2xl font-display font-black text-center text-white/80 tracking-tight leading-tight transition-all duration-700">
                 {getCurrentCaption()}
               </p>
             </div>
           </div>
         )}
      </div>

      <div className="relative z-40 w-full h-full flex flex-col p-6 lg:p-12 pointer-events-none">
        {/* ── Upper-left branded Back → Chora (desktop) ── */}
        <button
          onClick={onBack}
          aria-label="Back to Chora"
          className="hidden lg:flex absolute left-6 top-6 z-50 items-center gap-2 py-1.5 pl-2 pr-4 rounded-full pointer-events-auto transition-all hover:scale-[1.03] active:scale-95"
          style={{ background: 'rgba(8,6,12,0.55)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}
        >
          <Logo size={22} flip />
          <span className="text-[9px] font-black uppercase tracking-widest text-white/80">Back</span>
        </button>
        {/* ── Kill: reset the track to its natural dry state (no DJ FX) ── */}
        <button
          onClick={() => resetAudioFx?.()}
          aria-label="Kill DJ audio FX — reset to dry"
          title="Kill all DJ audio FX — reset the track to its natural, dry sound"
          className={`hidden lg:flex absolute left-6 top-[3.6rem] z-50 items-center gap-1.5 py-1.5 pl-3 pr-4 rounded-full pointer-events-auto transition-all hover:scale-[1.03] active:scale-95 ${isFxActive ? 'animate-pulse' : ''}`}
          style={{
            background: isFxActive ? 'rgba(220,38,38,0.28)' : 'rgba(8,6,12,0.55)',
            border: `1px solid ${isFxActive ? 'rgba(248,113,113,0.6)' : 'rgba(255,255,255,0.08)'}`,
            backdropFilter: 'blur(12px)',
          }}
        >
          <ZapOff size={13} className={isFxActive ? 'text-red-300' : 'text-white/60'} />
          <span className={`text-[9px] font-black uppercase tracking-widest ${isFxActive ? 'text-red-200' : 'text-white/60'}`}>Kill</span>
        </button>
        {/* ── Right-side vertical action column (desktop only) ── */}
        <div className="hidden lg:flex absolute right-6 top-0 bottom-0 z-50 flex-col items-end justify-center gap-[3px] pointer-events-auto" style={{ paddingRight: '0px' }}>
          {/* Helper: icon + expandable label pill */}
          {[
            ...(isPublic ? [{ key: 'live', icon: Globe, label: 'Live Microsite', onClick: undefined, style: { color: 'rgb(74 222 128)' } }] : []),
            ...(isOwner && onEdit ? [{ key: 'edit', icon: Zap, label: 'Edit Album', onClick: () => onEdit(album), style: { color: '#FF8C00' } }] : []),
            ...(isVisualizerLayout ? [{ key: 'fx', icon: Activity, label: 'FX Stage On', onClick: () => setIsVisualizerLayout(false), style: { color: '#FF8C00' } }] : []),
            { key: 'tv', icon: VideoIcon, label: isTVMode ? 'TV On' : 'TV Mode', onClick: () => setIsTVMode(!isTVMode), style: isTVMode ? { color: '#FF8C00' } : {} },
            { key: 'dj', icon: Disc, label: 'DJ Mode', onClick: () => { getAudioContext?.(); setIsDJMode(true); }, style: {} },
            { key: 'lights', icon: Zap, label: 'Lights', onClick: () => setIsLightingOpen(true), style: isLightingOpen ? { color: '#FF8C00' } : {} },
            { key: 'pixels', icon: Sparkles, label: 'Pixels', onClick: () => window.dispatchEvent(new CustomEvent('OPEN_PLAJAH_PIXELS', { detail: { album } })), style: {} },
            ...(!isOwner && !isPreview ? [
              { key: 'gifts', icon: HeartHandshake, label: 'Gifts & Tips', onClick: () => setIsDonationModalOpen(true), style: { color: '#FF8C00' } },
              { key: 'pif', icon: Heart, label: 'Pay It Forward', onClick: () => window.dispatchEvent(new CustomEvent('OPEN_PIF_MODAL')), style: {} },
            ] : []),
          ].map(item => (
            <button
              key={item.key}
              onClick={item.onClick}
              disabled={!item.onClick}
              className="group flex items-center gap-1.5 py-1.5 pr-2 pl-3 rounded-full transition-all duration-200 cursor-pointer select-none"
              style={{ background: 'rgba(8,6,12,0.55)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}
            >
              <span className="max-w-0 group-hover:max-w-[120px] overflow-hidden whitespace-nowrap transition-all duration-200 ease-in-out text-[8px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100" style={item.style}>
                {item.label}
              </span>
              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                <item.icon size={12} className="transition-colors" style={item.style} />
              </div>
            </button>
          ))}

          {/* Thin divider */}
          <div className="w-6 h-px bg-white/10 my-1" />

          {/* Tab nav buttons */}
          {([
            { id: 'TRACKS', label: album.trackListLabel || (album.type === 'BOOK' ? 'Contents' : 'Track List'), icon: album.type === 'BOOK' ? BookOpen : List },
            { id: 'LYRICS', label: 'Lyrics', icon: Music2 },
            { id: 'MEDIA', label: 'Videos & Art', icon: VideoIcon },
            { id: 'COMMENTS', label: 'Feed', icon: MessageSquare },
            { id: 'INFO', label: album.type === 'BOOK' ? 'Synopsis' : 'Liner Notes', icon: Sparkles },
          ] as const).map(tab => {
            const active = activeHUD === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveHUD(tab.id as any)}
                className="group flex items-center gap-1.5 py-1.5 pr-2 pl-3 rounded-full transition-all duration-200 cursor-pointer select-none"
                style={active ? {
                  background: 'linear-gradient(135deg, rgba(255,140,0,0.22) 0%, rgba(139,92,246,0.22) 100%)',
                  border: '1px solid rgba(255,140,0,0.35)',
                  backdropFilter: 'blur(12px)',
                } : {
                  background: 'rgba(8,6,12,0.55)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <span className={`max-w-0 group-hover:max-w-[120px] overflow-hidden whitespace-nowrap transition-all duration-200 ease-in-out text-[8px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 ${active ? 'text-white' : 'text-white/45'}`}>
                  {tab.label}
                </span>
                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                  <tab.icon size={12} className={active ? 'text-small-orange' : 'text-white/40 group-hover:text-white/70 transition-colors'} />
                </div>
              </button>
            );
          })}

          {/* Thin divider */}
          <div className="w-6 h-px bg-white/10 my-1" />

          {/* About / Gallery / Captions / Share */}
          {[
            { key: 'about', icon: User, label: activeHUD === 'ABOUT' ? 'Close Bio' : 'About Artist', onClick: () => setActiveHUD(activeHUD === 'ABOUT' ? 'TRACKS' : 'ABOUT'), active: activeHUD === 'ABOUT' },
            ...(album.galleryUrl ? [{ key: 'gallery', icon: Globe, label: 'Gallery', onClick: () => window.open(album.galleryUrl!, '_blank'), active: false }] : []),
            { key: 'captions', icon: MessageSquare, label: showCaptions ? 'Hide Captions' : 'Captions', onClick: () => setShowCaptions(!showCaptions), active: showCaptions },
            ...(!isPublic ? [{ key: 'share', icon: Share2, label: 'Share', onClick: () => setShowShareModal(true), active: false }] : []),
          ].map(item => (
            <button
              key={item.key}
              onClick={item.onClick}
              className="group flex items-center gap-1.5 py-1.5 pr-2 pl-3 rounded-full transition-all duration-200 cursor-pointer select-none"
              style={item.active ? {
                background: 'rgba(255,140,0,0.18)',
                border: '1px solid rgba(255,140,0,0.35)',
                backdropFilter: 'blur(12px)',
              } : {
                background: 'rgba(8,6,12,0.55)',
                border: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <span className={`max-w-0 group-hover:max-w-[120px] overflow-hidden whitespace-nowrap transition-all duration-200 ease-in-out text-[8px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 ${item.active ? 'text-small-orange' : 'text-white/45'}`}>
                {item.label}
              </span>
              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                <item.icon size={12} className={item.active ? 'text-small-orange' : 'text-white/40 group-hover:text-white/70 transition-colors'} />
              </div>
            </button>
          ))}
        </div>

        {/* ── LEGACY horizontal header kept as empty anchor (remove chevron refs) ── */}
        {false && <header ref={tabScrollRef} onScroll={onTabScroll} className="hidden">
             {isVisualizerLayout && (
               <button
                 onClick={() => setIsVisualizerLayout(false)}
                 className="flex items-center gap-1.5 px-3.5 py-2 bg-small-orange/20 border border-small-orange/30 text-small-orange rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-small-orange/30 transition-all shrink-0 whitespace-nowrap"
               >
                 <Activity size={13} /> FX Stage On
               </button>
             )}
             {!isPublic ? (
               <button onClick={onBack} className="flex items-center gap-1.5 px-3.5 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-all font-black text-[9px] uppercase tracking-widest shrink-0 whitespace-nowrap">
                 <ArrowLeft size={13} /> Library
               </button>
             ) : (
               <div className="flex items-center gap-1.5 px-3.5 py-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-lg font-black text-[9px] uppercase tracking-widest shrink-0 whitespace-nowrap">
                 <Globe size={13} className="text-green-500" /> Live Microsite
               </div>
             )}
             {isOwner && onEdit && (
               <button onClick={() => onEdit(album)} className="flex items-center gap-1.5 px-3.5 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all font-black text-[9px] uppercase tracking-widest shadow-lg shrink-0 whitespace-nowrap">
                 <Zap size={13} /> Edit Album
               </button>
             )}
             <button
               onClick={() => setIsTVMode(!isTVMode)}
               className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all font-black text-[9px] uppercase tracking-widest shrink-0 whitespace-nowrap ${isTVMode ? 'bg-small-orange text-black' : 'bg-white/8 text-white border border-white/10'}`}
             >
               <VideoIcon size={13} /> {isTVMode ? 'TV On' : 'TV Mode'}
             </button>
             <button
               onClick={() => { getAudioContext?.(); setIsDJMode(true); }}
               className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all font-black text-[9px] uppercase tracking-widest bg-white/8 text-white border border-white/10 hover:bg-[#00D4AA]/20 hover:border-[#00D4AA]/40 hover:text-[#00D4AA] shrink-0 whitespace-nowrap"
             >
               <Disc size={13} /> DJ Mode
             </button>
             <button
               onClick={() => setIsLightingOpen(true)}
               className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all font-black text-[9px] uppercase tracking-widest shrink-0 whitespace-nowrap border ${isLightingOpen ? 'bg-[#FF8C00]/20 border-[#FF8C00]/40 text-[#FF8C00]' : 'bg-white/8 text-white border-white/10 hover:bg-[#FF8C00]/10 hover:border-[#FF8C00]/30 hover:text-[#FF8C00]'}`}
             >
               <Zap size={13} /> Lights
             </button>
             <button
               onClick={() => window.dispatchEvent(new CustomEvent('OPEN_PLAJAH_PIXELS', { detail: { album } }))}
               className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all font-black text-[9px] uppercase tracking-widest bg-white/8 text-white border border-white/10 hover:bg-purple-500/20 hover:border-purple-400/40 hover:text-purple-200 shrink-0 whitespace-nowrap"
             >
               <Sparkles size={13} /> Plajah Pixels
             </button>
             {!isOwner && !isPreview && (
               <>
                 <button onClick={() => setIsDonationModalOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 bg-small-orange text-black rounded-lg font-black text-[9px] uppercase tracking-widest shrink-0 whitespace-nowrap hover:scale-105 transition-all active:scale-95">
                   <HeartHandshake size={13} /> Gifts & Tips
                 </button>
                 <button onClick={() => window.dispatchEvent(new CustomEvent('OPEN_PIF_MODAL'))} className="flex items-center gap-1.5 px-3.5 py-2 bg-white/5 border border-white/10 text-white rounded-lg font-black text-[9px] uppercase tracking-widest shrink-0 whitespace-nowrap hover:bg-white/10 transition-all active:scale-95">
                   <Heart size={13} /> Pay It Forward
                 </button>
               </>
             )}

             {/* ── Tab nav — rounded-rect with orange-purple frost glass active state ── */}
             <div className="w-px h-5 bg-white/10 shrink-0 mx-1" />
             {([
               { id: 'TRACKS', label: album.trackListLabel || (album.type === 'BOOK' ? 'Contents' : 'Track List'), icon: album.type === 'BOOK' ? BookOpen : List },
               { id: 'LYRICS', label: 'Lyrics', icon: Music2 },
               { id: 'MEDIA', label: 'Videos & Art', icon: VideoIcon },
               { id: 'COMMENTS', label: 'Feed', icon: MessageSquare },
               { id: 'INFO', label: album.type === 'BOOK' ? 'Synopsis' : 'Liner Notes', icon: Sparkles },
             ] as const).map(tab => {
               const active = activeHUD === tab.id;
               return (
                 <button
                   key={tab.id}
                   onClick={() => setActiveHUD(tab.id as any)}
                   className="relative flex items-center gap-1.5 px-3.5 py-2 font-black text-[9px] uppercase tracking-widest shrink-0 whitespace-nowrap overflow-hidden transition-all duration-200"
                   style={active ? {
                     borderRadius: '8px',
                     background: 'linear-gradient(135deg, rgba(255,140,0,0.16) 0%, rgba(139,92,246,0.16) 100%)',
                     border: '1px solid rgba(255,140,0,0.30)',
                     boxShadow: '0 0 14px rgba(255,140,0,0.10), inset 0 1px 0 rgba(255,255,255,0.07)',
                     color: '#fff',
                   } : {
                     borderRadius: '8px',
                     background: 'rgba(255,255,255,0.04)',
                     border: '1px solid rgba(255,255,255,0.08)',
                     color: 'rgba(255,255,255,0.35)',
                   }}
                 >
                   {active && <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(255,140,0,0.06) 0%, rgba(139,92,246,0.06) 100%)', borderRadius: '7px' }} />}
                   <tab.icon size={13} className="relative shrink-0" />
                   <span className="relative">{tab.label}</span>
                 </button>
               );
             })}
             <div className="w-px h-5 bg-white/10 shrink-0 mx-1" />

             <button
               onClick={() => setActiveHUD(activeHUD === 'ABOUT' ? 'TRACKS' : 'ABOUT')}
               className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest border transition-all shrink-0 whitespace-nowrap ${activeHUD === 'ABOUT' ? 'bg-small-orange text-black border-small-orange' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'}`}
             >
               <User size={13} /> {activeHUD === 'ABOUT' ? 'Close Bio' : 'About Artist'}
             </button>
             {album.galleryUrl && (
               <a href={album.galleryUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-black rounded-lg font-black text-[9px] uppercase tracking-widest shrink-0 whitespace-nowrap hover:scale-105 transition-all">
                 <Globe size={13} /> Gallery
               </a>
             )}
             <button
               onClick={() => setShowCaptions(!showCaptions)}
               className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest border transition-all shrink-0 whitespace-nowrap ${showCaptions ? 'bg-small-orange text-black border-small-orange' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'}`}
             >
               {showCaptions ? 'Hide Captions' : 'Captions'}
             </button>
             {!isPublic && (
               <button onClick={() => setShowShareModal(true)} className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-black rounded-lg font-black text-[9px] uppercase tracking-widest shrink-0 whitespace-nowrap hover:scale-105 transition-all ml-auto">
                 <Share2 size={13} /> Share
               </button>
             )}
          </header>}

        <div className={`pointer-events-auto flex flex-col gap-6 flex-1 overflow-hidden ${isVisualizerLayout ? 'lg:w-[50%] lg:ml-[50%] lg:mr-0' : 'lg:w-[50%] lg:ml-[44%] lg:mr-auto'}`}>
          {/* ── Compact album art strip (shown only in visualizer layout mode) ── */}
          {isVisualizerLayout && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-4 px-5 py-3 bg-black/50 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-xl"
            >
              <img
                src={thumb(album.coverImage, THUMB.small) || undefined}
                alt={album.title}
                loading="lazy"
                decoding="async"
                onError={onThumbError(album.coverImage)}
                className="w-14 h-14 rounded-xl object-cover border border-white/20 shadow-lg shrink-0 cursor-pointer hover:scale-105 transition-all"
                onClick={() => { setIsVisualizerLayout(false); }}
                title="Back to album art"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black uppercase tracking-widest text-white truncate">{currentTrack?.title || album.title}</p>
                <p className="text-[9px] font-bold text-small-orange uppercase tracking-widest truncate opacity-70">{album.artist}</p>
              </div>
              <button
                onClick={() => setIsVisualizerFullscreen(true)}
                className="p-2 text-white/30 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0"
                title="Full Stage"
              >
                <Maximize2 size={14} />
              </button>
            </motion.div>
          )}

          <div className={`relative overflow-hidden w-full bg-theme-card backdrop-blur-3xl rounded-[2.5rem] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_rgba(0,0,0,0.25)] ${isVisualizerLayout ? 'p-4 lg:p-5' : 'p-6 lg:p-8'}`}>
             {/* Animated Plajah brand gradient — living sweep, weighted to purple + magenta */}
             <div className="absolute inset-0 audio-session-gradient opacity-40 pointer-events-none" aria-hidden="true" />
             <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/20 to-black/45 pointer-events-none" aria-hidden="true" />
             <div className="relative z-10 flex flex-col gap-4">
                <div className="flex items-center gap-4">
                   <span className="px-3 py-1 bg-white/10 rounded-md text-[10px] font-black tracking-widest text-small-orange uppercase">Audio Session</span>
                   <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Track {currentTrackIndex+1} / {album.tracks.length}</span>
                   {isOwner && (
                     <button 
                       onClick={async () => {
                         try {
                           const { fetchUserProfile, updateUserProfile } = await import('../services/backendService');
                           const { auth } = await import('../services/backendService');
                           if (!auth.currentUser) return;
                           const profile = await fetchUserProfile(auth.currentUser.uid);
                           if (profile) {
                             const pinnedItems = profile.pinnedItems || [];
                             const newPin: { id: string; type: "AUDIO"; refId: string } = { id: Date.now().toString(), type: 'AUDIO', refId: album.id };
                             if (!pinnedItems.find((p: any) => p.refId === album.id)) {
                               await updateUserProfile(auth.currentUser.uid, { pinnedItems: [...pinnedItems, newPin] });
                               alert('Project Pinned to Profile!');
                             } else {
                               alert('Project is already pinned.');
                             }
                           }
                         } catch (e) { console.error(e); }
                       }}
                       className="flex items-center gap-2 px-3 py-1 bg-small-orange/20 hover:bg-small-orange/30 rounded-md text-[10px] font-black tracking-widest text-small-orange uppercase transition-all"
                     >
                       <Zap size={12} /> Pin
                     </button>
                   )}
                   {isOwner && (
                     <button
                       onClick={handleGenerateCaptions}
                       disabled={isGeneratingCaptions}
                       className="flex items-center gap-2 px-3 py-1 bg-white/5 hover:bg-white/10 rounded-md text-[10px] font-black tracking-widest text-white/40 uppercase transition-all disabled:opacity-50"
                     >
                       {isGeneratingCaptions ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                       {isGeneratingCaptions ? 'Analyzing...' : currentTrack.timeCodedLyrics ? 'Re-Sync Lyrics' : 'Sync Lyrics'}
                     </button>
                   )}

                   {/* Save the current track for offline playback */}
                   {currentTrack?.url && (
                     <div className="ml-auto">
                       <OfflineDownloadButton
                         url={currentTrack.url}
                         size="sm"
                         meta={{ title: currentTrack.title || album.title, type: 'MUSIC', artist: album.artist, cover: album.coverImage, albumId: album.id, trackId: currentTrack.id }}
                       />
                     </div>
                   )}

                   {/* Add the current song to a playlist — obvious + always visible */}
                   {currentTrack && (
                     <button
                       onClick={() => setPlaylistPickerTrack(currentTrack)}
                       title="Add this song to a playlist"
                       className={`${currentTrack?.url ? '' : 'ml-auto'} flex items-center gap-2 px-3 py-1 bg-white/5 hover:bg-white/10 rounded-md text-[10px] font-black tracking-widest text-white/50 hover:text-white uppercase transition-all`}
                     >
                       <ListPlus size={13} /> Add to Playlist
                     </button>
                   )}

                   {/* Listening Party — premiere/showcase this album, listeners sync to your playback */}
                   {!isPreview && !activePartyId && (
                     <button
                       onClick={() => auth.currentUser ? startListeningParty() : alert('Sign in to host a listening party.')}
                       title="Premiere this album — invited listeners sync to your playback"
                       className="flex items-center gap-2 px-3 py-1 bg-[#D40055]/10 hover:bg-[#D40055]/20 border border-[#D40055]/25 rounded-md text-[10px] font-black tracking-widest text-[#ff5c9d] uppercase transition-all"
                     >
                       <Users size={13} /> Listening Party
                     </button>
                   )}

                   {/* Share — to the Plajah feed or out to social sites */}
                   <div className={currentTrack ? '' : 'ml-auto'}>
                     <ShareButton
                       title={currentTrack?.title || album.title}
                       artist={album.artist}
                       text={`Check out ${currentTrack?.title || album.title} by ${album.artist} on Plajah.com`}
                       url={buildShareUrl('album', album.id, { track: currentTrack?.id })}
                       imageUrl={album.coverImage}
                       plajahLabel="Share to Plajah feed"
                       onPostToPlajah={async () => {
                         await createPost({
                           text: `🎵 ${currentTrack?.title || album.title} — ${album.artist}`,
                           media: [{ type: 'AUDIO', url: currentTrack?.url || '', id: currentTrack?.id, title: currentTrack?.title || album.title, thumbnail: album.coverImage } as any],
                           albumEmbed: album,
                         });
                       }}
                       className="flex items-center gap-2 px-3 py-1 bg-white/5 hover:bg-white/10 rounded-md text-[10px] font-black tracking-widest text-white/50 hover:text-white uppercase transition-all"
                     />
                   </div>
                </div>
                {/* Listening-party status — host/follower, live listener count, invite/leave. */}
                {activePartyId && (
                  <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-[#D40055]/30 bg-gradient-to-r from-[#6B0099]/20 to-[#D40055]/20">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <Radio size={13} className="text-[#ff5c9d] shrink-0" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-white flex-1 min-w-0 truncate">
                      {party.isHost ? 'Hosting listening party' : `Following ${party.party?.hostName || 'the host'}`}
                      <span className="text-white/50"> · </span>
                      <span className="inline-flex items-center gap-1 text-white/70"><Users size={11} /> {party.viewerCount} listening</span>
                      {party.isFollower && <span className="text-white/40 normal-case tracking-normal"> — synced to host</span>}
                    </p>
                    {party.isHost && (
                      <button
                        onClick={() => { const u = partyShareUrl(activePartyId); if (navigator.share) navigator.share({ title: `Listen to “${album.title}” with me on Plajah`, url: u }).catch(() => {}); else navigator.clipboard?.writeText(u).catch(() => {}); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[9px] font-black uppercase tracking-widest transition-all shrink-0"
                      >
                        <Share2 size={12} /> Invite
                      </button>
                    )}
                    <button onClick={leaveListeningParty} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-[9px] font-black uppercase tracking-widest transition-all shrink-0">
                      {party.isHost ? 'End' : 'Leave'}
                    </button>
                  </div>
                )}

                {/* Surface the real reason a caption sync failed (large-file 413, fetch, quota) so the
                    creator can act on it instead of the button silently doing nothing. */}
                {isOwner && captionError && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-[11px] font-semibold text-red-200 leading-snug">
                    <Sparkles size={13} className="text-red-300 shrink-0 mt-0.5" />
                    <span>{captionError}</span>
                    <button onClick={() => setCaptionError(null)} className="ml-auto text-red-300/60 hover:text-red-200 shrink-0" aria-label="Dismiss">✕</button>
                  </div>
                )}
                <h1 className={`font-black uppercase tracking-tighter leading-[0.9] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] ${isVisualizerLayout ? 'text-lg lg:text-2xl' : 'text-3xl lg:text-5xl'}`}>{currentTrack?.title || album.title}</h1>
                {!isVisualizerLayout && (
                  <p className="text-lg lg:text-2xl font-display font-black italic tracking-tight bg-gradient-to-r from-[#FF8C00] via-[#D40055] to-[#6B0099] bg-clip-text text-transparent w-fit drop-shadow-[0_1px_8px_rgba(0,0,0,0.4)]">{album.artist}</p>
                )}
                {(() => { const ecl = currentTrack?.isEclipsa || album.tracks?.some(t => t.isEclipsa); const atm = currentTrack?.isAtmos || album.tracks?.some(t => t.isAtmos); return (ecl || atm) ? <ImmersiveBadge isEclipsa={ecl} isAtmos={atm} showHint className="mt-3" /> : null; })()}
             </div>
          </div>

          <div className="w-full flex-1 flex flex-col gap-6 overflow-hidden">
              {activeHUD === 'ABOUT' && (
               <div className="flex-1 bg-black/80 backdrop-blur-3xl p-8 lg:p-16 rounded-[3rem] animate-in zoom-in-95 duration-700 flex flex-col lg:flex-row gap-10 overflow-y-auto shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_rgba(0,0,0,0.3)]">
                  <div className="lg:w-1/3 shrink-0">
                    <img src={thumb(album.artistImage || album.coverImage, THUMB.large) || undefined} alt={album.artist} loading="lazy" decoding="async" onError={onThumbError(album.artistImage || album.coverImage)} className="w-full aspect-square object-cover rounded-[2rem] shadow-2xl ring-1 ring-white/10" />
                  </div>
                  <div className="flex-1 space-y-8">
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-[0.5em] text-small-orange mb-4 block">Archive Identity</span>
                      <h2 className="text-5xl font-display font-black tracking-tighter leading-none mb-6">{album.artist}</h2>
                      <div className="w-20 h-1 bg-white" />
                    </div>
                    <p className="text-lg lg:text-xl font-medium leading-relaxed text-white/60 italic font-display">{album.artistBio}</p>
                    
                    {album.socialLinks && (
                      <div className="flex flex-wrap gap-6 pt-6">
                        {album.socialLinks.twitter && (
                          <a href={album.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
                            <Twitter size={20} />
                          </a>
                        )}
                        {album.socialLinks.instagram && (
                          <a href={album.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
                            <Instagram size={20} />
                          </a>
                        )}
                        {album.socialLinks.youtube && (
                          <a href={album.socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
                            <Youtube size={20} />
                          </a>
                        )}
                        {album.socialLinks.spotify && (
                          <a href={album.socialLinks.spotify} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
                            <Music2 size={20} />
                          </a>
                        )}
                        {album.socialLinks.website && (
                          <a href={album.socialLinks.website} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
                            <Globe size={20} />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
               </div>
             )}

             {activeHUD !== 'ABOUT' && (
               <div className="flex-1 animate-in slide-in-from-right-20 duration-1000 overflow-hidden flex flex-col">
                  <div className="w-full h-full bg-gradient-to-br from-[#6B0099]/30 via-black/40 to-[#FF8C00]/30 backdrop-blur-3xl p-6 lg:p-10 rounded-[2.5rem] lg:rounded-[3rem] shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_60px_rgba(107,0,153,0.08),0_16px_48px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col">
                    {activeHUD === 'LYRICS' && (
                      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <Music2 size={16} className="text-small-orange" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Synchronized Lyrics</span>
                          </div>
                          {album.tracks[currentTrackIndex]?.timeCodedLyrics && (
                            <div className="flex items-center gap-1">
                              {isResyncMode ? (
                                <button onClick={() => setIsResyncMode(false)} className="text-[8px] font-black uppercase tracking-widest text-small-orange animate-pulse px-2 py-1 bg-small-orange/10 rounded">Cancel</button>
                              ) : (
                                <>
                                  {renderLyricTranslate()}
                                  <button onClick={() => setLyricsOffset(o => o - 0.5)} title="Shift lyrics earlier" className="tap w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-[11px] font-black text-white/40 hover:text-white/70 transition-all">−</button>
                                  <span className="text-[8px] font-black text-white/30 w-11 text-center tabular-nums">{lyricsOffset === 0 ? '±0.0s' : `${lyricsOffset > 0 ? '+' : ''}${lyricsOffset.toFixed(1)}s`}</span>
                                  <button onClick={() => setLyricsOffset(o => o + 0.5)} title="Shift lyrics later" className="tap w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-[11px] font-black text-white/40 hover:text-white/70 transition-all">+</button>
                                  {lyricsOffset !== 0 && <button onClick={() => setLyricsOffset(0)} title="Reset offset" className="w-6 h-6 flex items-center justify-center text-white/20 hover:text-white/50 transition-all"><RotateCcw size={10} /></button>}
                                  {isOwner && <button onClick={() => setIsResyncMode(true)} className="ml-1 text-[8px] font-black uppercase tracking-widest text-white/30 hover:text-small-orange transition-all px-2 py-1 bg-white/5 hover:bg-small-orange/10 rounded">Resync</button>}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-6" ref={lyricsContainerRef}>
                          {(() => {
                            const track = album.tracks[currentTrackIndex];
                            if (track?.timeCodedLyrics && track.timeCodedLyrics.length > 0) {
                              return (
                                <TimeCodedLyrics
                                  tracks={track.timeCodedLyrics}
                                  currentTime={globalCurrentTime}
                                  seek={seek}
                                  containerRef={lyricsContainerRef}
                                  offset={lyricsOffset}
                                  isResyncMode={isResyncMode}
                                  onResync={handleResync}
                                  translations={lyricTx?.map}
                                />
                              );
                            } else if (track?.lyrics) {
                              return (
                                <div className="space-y-6 opacity-60">
                                  {track.lyrics.split('\n').map((line, idx) => (
                                    <p key={idx} className="text-xl lg:text-2xl font-display font-black uppercase tracking-tight">{line}</p>
                                  ))}
                                  {isOwner && (
                                    <div className="pt-8 border-t border-white/10">
                                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-4 text-center">Sync these lyrics with AI</p>
                                      <button 
                                        onClick={handleGenerateCaptions}
                                        className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                                      >
                                        <Sparkles size={14} className="text-small-orange" />
                                      {isGeneratingCaptions ? 'Synchronizing...' : 'Sync Audio to Lyrics'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            } else {
                              return (
                                <div className="h-full flex flex-col items-center justify-center text-center p-12 gap-6 opacity-40">
                                  <Music2 size={48} className="text-white/20" />
                                  <p className="text-sm font-black uppercase tracking-[0.3em]">No lyrics available for this transmission.</p>
                                  {isOwner && (
                                    <button 
                                      onClick={() => onEdit?.(album)}
                                      className="px-8 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest"
                                    >
                                      Add Lyrics in Creator
                                    </button>
                                  )}
                                </div>
                              );
                            }
                          })()}
                        </div>
                      </div>
                    )}
                    {activeHUD === 'TRACKS' && (
                      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {album.type === 'BOOK' ? <BookOpen size={16} className="text-small-orange" /> : <List size={16} className="text-small-orange" />}
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{album.trackListLabel || (album.type === 'BOOK' ? 'Table of Contents' : 'Track List')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isOwner && <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Drag to reorder</span>}
                            <button onClick={() => setIsTracksCollapsed(!isTracksCollapsed)} className="p-2 hover:bg-white/5 rounded-lg transition-all text-white/20 hover:text-white">
                              {isTracksCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                            </button>
                          </div>
                        </div>

                        {!isTracksCollapsed && (
                          <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto pr-2 custom-scrollbar animate-in slide-in-from-top-2 duration-300">
                            {localTracks.map((t, i) => {
                              const isActive = currentTrackIndex === i;
                              const isExpanded = expandedTrackId === t.id;
                              const isNextUp = !isActive && !!nextTrackId && t.id === nextTrackId;
                              const hnsOn = !!album.hideNSeekConfig?.isEnabled;
                              return (
                                <div
                                  key={t.id}
                                  draggable={!!isOwner}
                                  onDragStart={() => { dragTrackIndexRef.current = i; }}
                                  onDragOver={(e) => { e.preventDefault(); setDragOverTrackIndex(i); }}
                                  onDragLeave={() => setDragOverTrackIndex(null)}
                                  onDrop={(e) => { e.preventDefault(); const from = dragTrackIndexRef.current; setDragOverTrackIndex(null); if (from !== null && from !== i) reorderTracks(from, i); dragTrackIndexRef.current = null; }}
                                  onDragEnd={() => { dragTrackIndexRef.current = null; setDragOverTrackIndex(null); }}
                                  className={`relative shrink-0 min-h-[3.25rem] overflow-hidden rounded-2xl border transition-all ${isNextUp ? 'track-next-glow' : ''} ${dragOverTrackIndex === i ? 'scale-[1.01] border-small-orange/60' : isActive ? 'border-[#FF8C00]/50' : 'border-white/5'}`}
                                >
                                  <div className={`flex items-center gap-3 px-3 py-[9px] relative overflow-hidden rounded-2xl group ${isActive ? 'backdrop-blur-2xl shadow-[0_0_30px_rgba(107,0,153,0.3)]' : 'bg-gradient-to-r from-[#6B0099]/10 via-transparent to-[#FF8C00]/10 backdrop-blur-xl hover:from-[#6B0099]/20 hover:to-[#FF8C00]/20'} ${isExpanded ? '!rounded-b-none' : ''}`}>
                                    {/* Active row: animated brand gradient + repeat-one green + final-10s red flash */}
                                    {isActive && <div className="absolute inset-0 track-gradient-active pointer-events-none" aria-hidden="true" />}
                                    {isActive && repeatOneGreenOpacity > 0 && <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{ background: 'linear-gradient(90deg, rgba(34,197,94,0.55) 0%, rgba(34,197,94,0) 34%)', opacity: repeatOneGreenOpacity }} />}
                                    {isActive && isEndingSoon && <div className="absolute inset-0 pointer-events-none track-ending-flash" aria-hidden="true" />}
                                    {isOwner && <GripVertical size={14} className="text-white/20 shrink-0 cursor-grab active:cursor-grabbing relative z-10" />}
                                    <button onClick={() => { setCurrentTrackIndex(i); playTrack(t, album, 'LIBRARY'); }} className="flex items-center gap-4 text-left flex-1 min-w-0 relative z-10">
                                      <span className={`text-[10px] font-black w-4 shrink-0 ${isActive ? 'text-small-orange' : 'text-white/20'}`}>{i + 1}</span>
                                      <span className="min-w-0 flex-1">
                                        {/* Track-list titles stay a single line (full title is the big header above) */}
                                        <span className={`block text-sm font-bold uppercase tracking-widest truncate ${isActive ? 'text-white' : 'text-white/60 group-hover:text-white'}`}>{t.title || 'Untitled'}</span>
                                        {/* Live lyrics — only when there's a real caption (getActiveCaption returns '...' when none) */}
                                        {isActive && isCurrentTrackGlobal && getCurrentCaption() !== '...' && <CaptionTicker caption={getCurrentCaption()} />}
                                      </span>
                                    </button>
                                    <div className="flex items-center gap-2 shrink-0 relative z-10">
                                      {isActive && isCurrentTrackGlobal && globalDuration > 0 && (
                                        <div className="flex flex-col items-end font-mono tabular-nums text-[9px] font-black tracking-tight leading-tight self-center">
                                          <span className={isEndingSoon ? 'text-red-400' : 'text-white/70'}>-{formatTime(trackRemaining)}</span>
                                          <span className="text-white/35">{formatTime(globalDuration)}</span>
                                        </div>
                                      )}
                                      {t.isExclusive && <span className="text-[8px] font-black text-small-orange uppercase">Excl.</span>}
                                      {isActive && globalIsPlaying && isCurrentTrackGlobal
                                        ? <div className="flex gap-0.5 items-end h-3">{[0,1,2].map(b => <motion.div key={b} animate={{height:[4,12,6,10,4]}} transition={{duration:1,repeat:Infinity,delay:b*0.2}} className="w-0.5 bg-small-orange rounded-full" />)}</div>
                                        : <Play size={13} className="text-white/10 group-hover:text-white/40" fill="currentColor" />}
                                      {/* Breakdown / PP / Use-in-film live in the collapsible drawer below (all rows) */}
                                      <button onClick={(e) => { e.stopPropagation(); setExpandedTrackId(isExpanded ? null : t.id); }} title="More actions" className={`p-1.5 rounded-lg transition-all ${isExpanded ? 'bg-small-orange/20 text-small-orange' : 'text-white/25 hover:text-white'}`}>
                                        <ChevronDown size={13} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Expandable drawer — smooth height animation; on phones it also
                                      holds the Breakdown / Pixels / film actions so the bar stays clean */}
                                  <AnimatePresence initial={false}>
                                    {isExpanded && (
                                      <motion.div
                                        key="drawer"
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                                        className="overflow-hidden"
                                      >
                                        <div className="bg-black/50 backdrop-blur-xl rounded-b-2xl border-t border-white/5 p-4 space-y-3">
                                          {/* Secondary action row — Breakdown / Pixels / Use-in-film for every track */}
                                          <div className="flex flex-wrap gap-2">
                                            <button
                                              onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('OPEN_BREAKDOWN', { detail: { track: t, album } })); }}
                                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FF8C00]/12 text-[#FF8C00] transition-all text-[10px] font-black uppercase tracking-widest"
                                            >
                                              <Waves size={13} /> Breakdown
                                            </button>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('OPEN_PLAJAH_PIXELS', { detail: { track: t, album } })); }}
                                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/12 text-purple-200 transition-all text-[10px] font-black uppercase tracking-widest"
                                            >
                                              <Sparkles size={13} /> Plajah Pixels
                                            </button>
                                            {!t.isPersonalMedia && t.url && (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('OPEN_LICENSE_FOR_FILM', { detail: { track: t, album } })); }}
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/12 text-emerald-200 transition-all text-[10px] font-black uppercase tracking-widest"
                                              >
                                                <Film size={13} /> Use in film
                                              </button>
                                            )}
                                          </div>

                                          {/* Owner: Hide & Seek alternates + comments */}
                                          {isOwner && (
                                            <div className="space-y-2">
                                              <div className="flex items-center gap-2 mb-1">
                                                {hnsOn ? <Eye size={11} className="text-small-orange" /> : <EyeOff size={11} className="text-white/30" />}
                                                <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
                                                  Hide &amp; Seek Alternates — {hnsOn ? 'Feature active' : 'Hidden from public when feature is off'}
                                                </span>
                                              </div>
                                              {([1, 2] as const).map(slot => {
                                        const slotKey = `hnsSlot${slot}` as 'hnsSlot1' | 'hnsSlot2';
                                        const existing = t[slotKey];
                                        const key = `${t.id}_slot${slot}`;
                                        const uploading = uploadingSlot === key;
                                        const progress = uploadProgress[key] ?? 0;
                                        const saved = slotSavedKey === key;
                                        return (
                                          <label key={slot} className={`flex flex-col gap-1.5 p-3 rounded-xl border cursor-pointer transition-all ${existing ? 'border-small-orange/30 bg-small-orange/5 hover:bg-small-orange/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                                            <div className="flex items-center gap-3">
                                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[9px] font-black ${existing ? 'bg-small-orange/20 text-small-orange' : 'bg-white/5 text-white/30'}`}>
                                                {uploading ? <Loader2 size={11} className="animate-spin" /> : saved ? <Check size={11} className="text-green-400" /> : `S${slot}`}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Alternate Slot {slot}</p>
                                                <p className="text-[10px] font-bold truncate">{saved ? 'Saved!' : existing ? existing.title : 'Drop or click to upload…'}</p>
                                              </div>
                                              {!uploading && !saved && <Upload size={11} className="text-white/20 shrink-0" />}
                                            </div>
                                            {uploading && (
                                              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-small-orange rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
                                              </div>
                                            )}
                                            <input type="file" accept="audio/*,video/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleHnsSlotUpload(t, slot, f); }} />
                                          </label>
                                        );
                                      })}
                                              {isActive && (
                                                <div className="pt-2 border-t border-white/5">
                                                  <HUDCommentModule album={album} trackId={t.id} isPublic={true} themeColor={album.themeColor} user={user} minimal onVisitUser={onVisitUser} onUpdate={onUpdate} />
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                  {/* (Comments for the active track live in the album comments panel below,
                                      not inline per-row — keeps every track bar a uniform single line.) */}

                                  {/* ── In This Song characters ── */}
                                  {t.characterIds && t.characterIds.length > 0 && worldCharacters.length > 0 && (
                                    <div className="px-4 pt-2 pb-3 border-t border-white/[0.05]">
                                      <p className="text-[7px] font-black uppercase tracking-[0.35em] text-white/20 mb-2">In This Song</p>
                                      <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
                                        {t.characterIds.map(cid => {
                                          const char = worldCharacters.find(c => c.id === cid);
                                          if (!char) return null;
                                          const imgSrc = t.trackCharacterImages?.[cid] || char.imageUrl;
                                          return (
                                            <div key={cid} className="flex flex-col items-center gap-1 shrink-0 w-11">
                                              <div className="w-9 h-9 rounded-full overflow-hidden border border-[#D0BCFF]/30 bg-white/5">
                                                <img
                                                  src={thumb(imgSrc, THUMB.micro) || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`}
                                                  alt={char.name}
                                                  loading="lazy"
                                                  decoding="async"
                                                  className="w-full h-full object-cover"
                                                  onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`; }}
                                                />
                                              </div>
                                              <p className="text-[7px] font-black text-white/35 uppercase tracking-wide truncate w-full text-center">{char.name}</p>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {isTracksCollapsed && (
                          <div className="flex items-center justify-center py-20 border border-dashed border-white/5 rounded-[2rem] bg-white/[0.02]">
                            <button onClick={() => setIsTracksCollapsed(false)} className="flex flex-col items-center gap-4 text-white/20 hover:text-white transition-all group">
                              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform"><Plus size={20} /></div>
                              <span className="text-[10px] font-black uppercase tracking-widest">Expand Registry</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {activeHUD === 'MEDIA' && (
                      <div className="flex-1 flex flex-col gap-8 overflow-y-auto pr-4 custom-scrollbar">
                        {/* Video Player Section */}
                        {(activeVideoId || (album.musicVideos && album.musicVideos.length > 0)) && (
                          <div className="space-y-6 animate-in fade-in duration-500">
                            {(() => {
                              const video = album.musicVideos?.find(v => v.id === activeVideoId) || album.musicVideos?.[0];
                              if (!video) return null;
                              
                              return (
                                <div className="space-y-6">
                                  <div className="p-8 bg-white/[0.04] border border-white/10 rounded-[2.5rem] flex items-center justify-between group hover:bg-white/[0.08] transition-all cursor-pointer" onClick={() => { setActiveVideoId(video.id); playVideo(video); }}>
                                    <div className="flex items-center gap-6">
                                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center shadow-xl">
                                        <VideoIcon size={24} className="text-white" />
                                      </div>
                                      <div>
                                        <h3 className="text-xl font-black uppercase tracking-tight text-white">{video.title}</h3>
                                        <p className="text-[10px] font-bold text-small-orange uppercase tracking-widest">Active Music Video & Art</p>
                                      </div>
                                    </div>
                                    <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                                      <Play size={16} fill="currentColor" />
                                    </div>
                                  </div>
                                  
                                  {/* Video Comments */}
                                  <div className="p-8 bg-white/[0.02] border border-white/10 rounded-[2rem]">
                                    <HUDCommentModule album={album} trackId={null} videoId={video.id} isPublic={true} themeColor={album.themeColor} user={user} onVisitUser={onVisitUser} onUpdate={onUpdate} />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Playlists Section */}
                        {album.videoPlaylists && album.videoPlaylists.length > 0 && (
                          <div className="space-y-6">
                            <div className="flex items-center gap-3">
                              <List size={16} className="text-small-orange" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Curated Playlists</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {album.videoPlaylists.map(playlist => (
                                <button 
                                  key={playlist.id} 
                                  onClick={() => setActivePlaylistId(activePlaylistId === playlist.id ? null : playlist.id)}
                                  className={`p-6 rounded-[2rem] border transition-all text-left group ${activePlaylistId === playlist.id ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-black uppercase tracking-widest">{playlist.title}</span>
                                    <ChevronDown size={14} className={`transition-transform ${activePlaylistId === playlist.id ? 'rotate-180' : ''}`} />
                                  </div>
                                  <p className={`text-[9px] font-bold uppercase tracking-widest ${activePlaylistId === playlist.id ? 'text-black/40' : 'text-white/20'}`}>
                                    {playlist.videoIds.length} Visuals
                                  </p>
                                  
                                  {activePlaylistId === playlist.id && (
                                    <div className="mt-4 space-y-2 animate-in slide-in-from-top-2">
                                      {playlist.videoIds.map(vidId => {
                                        const v = album.musicVideos?.find(mv => mv.id === vidId);
                                        if (!v) return null;
                                        return (
                                          <div 
                                            key={vidId} 
                                            onClick={(e) => { e.stopPropagation(); setActiveVideoId(vidId); playVideo(v); }}
                                            className={`p-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeVideoId === vidId ? 'bg-black text-white' : 'bg-black/10 hover:bg-black/20 text-black/60'}`}
                                          >
                                            {v.title}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* All Videos Grid */}
                        <div className="space-y-6">
                          <div className="flex items-center gap-3">
                            <VideoIcon size={16} className="text-small-orange" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Music Videos & Art</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {album.musicVideos?.map(video => (
                              <div 
                                key={video.id} 
                                className={`group relative aspect-video rounded-2xl overflow-hidden border transition-all ${activeVideoId === video.id ? 'border-white scale-105 shadow-2xl' : 'border-white/10 hover:border-white/30'}`}
                              >
                                <button 
                                  onClick={() => { setActiveVideoId(video.id); playVideo(video); }}
                                  className="w-full h-full"
                                >
                                  {video.thumbnailUrl ? (
                                    <img src={thumb(video.thumbnailUrl, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(video.thumbnailUrl)} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                  ) : (
                                    <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                      <VideoIcon size={24} className="text-white/10" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-4">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-white truncate">{video.title}</span>
                                  </div>
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); alert(`Redirecting to payment for video: ${video.title}. Price: $${video.price || '1.99'}`); }}
                                  className="absolute top-2 right-2 px-3 py-1 bg-black/60 backdrop-blur-md text-white rounded-lg text-[8px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white hover:text-black"
                                >
                                  Buy ${video.price || '1.99'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {album.liveFeedUrl && (
                          <div className="space-y-4 pt-8 border-t border-white/5">
                            <div className="flex items-center gap-3">
                              <Radio size={16} className="text-red-500" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Live Studio Feed</span>
                            </div>
                            <div className="relative aspect-video rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl">
                              <iframe 
                                src={album.liveFeedUrl || undefined} 
                                className="w-full h-full" 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowFullScreen 
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {activeHUD === 'COMMENTS' && (
                      <div className="flex-1 h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4 px-2">
                          <div className="flex items-center gap-3">
                            <MessageSquare size={16} className="text-small-orange" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                              {album.tracks[currentTrackIndex]?.title ? `Live Chat: ${album.tracks[currentTrackIndex].title}` : 'The Social Feed'}
                            </span>
                          </div>
                          <button 
                            onClick={() => {
                              const url = buildShareUrl('album', album.id, { track: album.tracks[currentTrackIndex]?.id || 'album' });
                              navigator.clipboard.writeText(url);
                              alert('Plajah Social link copied to clipboard!');
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
                          >
                            <Share2 size={12} /> Share Feed
                          </button>
                        </div>
                        <div className="flex-1 min-h-0">
                          <HUDCommentModule album={album} trackId={album.tracks[currentTrackIndex]?.id || null} isPublic={true} themeColor={album.themeColor} user={user} onVisitUser={onVisitUser} onUpdate={onUpdate} />
                        </div>
                      </div>
                    )}
                    {activeHUD === 'INFO' && (
                      <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-10 animate-in fade-in duration-700">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black uppercase tracking-[0.4em] text-small-orange">Operational Overview</span>
                          {isOwner && (
                            <button onClick={() => onEdit?.(album)} className="text-[10px] font-bold text-white/20 hover:text-white uppercase tracking-widest flex items-center gap-2">
                              <Pen size={12} /> Edit Notes
                            </button>
                          )}
                        </div>
                        
                        <div className="space-y-8">
                          <p className="text-2xl font-medium leading-relaxed text-white/80 italic font-display">
                            {album.linerNotes || `This transmission represents a curated soundscape by ${album.artist}. Each signal has been captured and compiled under the ${album.title} directive, exploring themes of digital resonance and sonic architecture within the Plajah ecosytem.`}
                          </p>

                          <The411 itemId={album.id} itemType="MUSIC" title={album.title} author={album.artist} />

                          {album.worldId && (
                            <WorldBadge
                              worldId={album.worldId}
                              contentTitle={album.title}
                              contentType="album"
                              onNavigate={onNavigateToWorld}
                            />
                          )}

                          {/* ── Featured Characters ── */}
                          {worldCharacters.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-2">
                                <Users size={11} className="text-white/20" />
                                Featured Characters
                              </h4>
                              <div className="flex flex-wrap gap-2.5">
                                {worldCharacters.slice(0, 8).map(char => (
                                  <div key={char.id} className="flex items-center gap-2.5 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
                                    <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 shrink-0">
                                      <img
                                        src={thumb(char.imageUrl, THUMB.micro) || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`}
                                        alt={char.name}
                                        loading="lazy"
                                        decoding="async"
                                        className="w-full h-full object-cover"
                                        onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`; }}
                                      />
                                    </div>
                                    <div>
                                      <p className="text-[11px] font-black text-white leading-tight">{char.name}</p>
                                      {char.role && <p className="text-[8px] text-white/35 uppercase tracking-wider">{char.role}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="pt-8 border-t border-white/5 space-y-4">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-white/20">Album Metadata</h4>
                            <div className="grid grid-cols-2 gap-6">
                              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-[8px] font-black text-white/20 uppercase block mb-1">Release Date</span>
                                <span className="text-xs font-bold text-white">{album.releaseDate ? new Date(album.releaseDate).toLocaleDateString() : new Date(album.createdAt).toLocaleDateString()}</span>
                              </div>
                              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                <span className="text-[8px] font-black text-white/20 uppercase block mb-1">Genre Spectrum</span>
                                <span className="text-xs font-bold text-white">{album.genre || 'Multi-Experimental'}</span>
                              </div>
                            </div>
                          </div>

                          {/* ── More From This World ── */}
                          {worldContent && ([...worldContent.videos, ...worldContent.albums].filter(c => c.id !== album.id).length > 0) && (
                            <div className="pt-8 border-t border-white/5 space-y-4">
                              <h4 className="text-[10px] font-black uppercase tracking-widest text-white/20">More From This World</h4>
                              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                                {[...worldContent.videos, ...worldContent.albums]
                                  .filter(c => c.id !== album.id)
                                  .slice(0, 10)
                                  .map((content, i) => {
                                    const coverThumb = (content as any).coverImage || (content as any).coverImageUrl || (content as any).thumbnailUrl;
                                    return (
                                      <div key={(content as any).id || i} className="shrink-0 w-[4.5rem]">
                                        <div className="w-[4.5rem] h-24 rounded-xl overflow-hidden bg-white/5 border border-white/8 mb-1.5">
                                          {coverThumb ? (
                                            <img src={thumb(coverThumb, THUMB.small) || undefined} onError={onThumbError(coverThumb)} loading="lazy" decoding="async" alt={content.title} className="w-full h-full object-cover" />
                                          ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                              <Music2 size={16} className="text-white/15" />
                                            </div>
                                          )}
                                        </div>
                                        <p className="text-[8px] font-black text-white/40 truncate uppercase tracking-wide">{content.title}</p>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          )}
                        </div>

                        {corsError && (
                          <div className="p-8 bg-red-500/10 border border-red-500/30 rounded-3xl space-y-4">
                            <div className="flex items-center gap-4 text-red-400">
                              <AlertCircle size={20} />
                              <span className="text-sm font-black uppercase tracking-widest">CORS Configuration Required</span>
                            </div>
                            <p className="text-xs text-white/40 leading-relaxed">
                              Visualizers are disabled because the music files are hosted on a domain that hasn't authorized this origin. 
                              Please run the <code className="bg-white/5 px-2 py-1 rounded text-white/80">gsutil cors set</code> command on your Firebase bucket to enable full functionality.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
               </div>
             )}
          </div>
        </div>

        <footer className="mt-auto pt-16 flex justify-between items-center text-[10px] font-black uppercase tracking-[0.4em] text-white/10">
           <div className="flex gap-16"><span>System v3.0</span><span>End-to-End Encryption</span></div>
           <div className="flex gap-6 items-center">
             <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center shadow-lg">
               <Logo size={16} />
             </div>
             Plajah — Creative Control by {album.artist}
           </div>
        </footer>
      </div>

      {/* Local Audio Element Removed - Now Global */}

      {/* ─────────────────── VISUALIZER FULLSCREEN STAGE ─────────────────── */}
      <AnimatePresence>
        {isVisualizerFullscreen && !isMobile && !isTVMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[500] bg-black overflow-hidden"
          >
            {/* ── Background: full-canvas visualizer ── */}
            <div className="absolute inset-0 z-0">
              {isPixelsEngine ? (
                <div className="absolute inset-0">
                  <FxStageVisualizers engine={fxEngine as FxEngine} presetIndex={fxPresetIndex} analyser={globalAnalyser} isPlaying={globalIsPlaying && isCurrentTrackGlobal} />
                </div>
              ) : (
                <>
                  <div className="absolute inset-0" style={{ opacity: fxEngine === 'PAINT' ? 0.5 : 1, transition: 'opacity 0.8s ease' }}>
                    <Visualizer analyser={globalAnalyser} themeColor={album.themeColor} trackTitle={currentTrack?.title || album.title} artist={album.artist} isPlaying={globalIsPlaying && isCurrentTrackGlobal} scrollingText={scrollingText} alwaysAnimate={true} />
                  </div>
                  {fxEngine === 'PAINT' && (
                    <div className="absolute inset-0 pointer-events-none">
                      <PaintPoolVisualizer analyser={globalAnalyser} isPlaying={globalIsPlaying && isCurrentTrackGlobal} alwaysAnimate={true} />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Right half gradient darkener for lyric readability ── */}
            <div className="absolute right-0 top-0 w-1/2 h-full z-10 pointer-events-none bg-gradient-to-l from-black/85 via-black/60 to-transparent" />

            {/* ── Right half: dominant synced lyrics — active line stays center, others scroll past ── */}
            <div className="absolute right-0 top-0 w-1/2 h-[calc(100%-88px)] z-20 px-12 py-8">
              {(() => {
                const track = album.tracks[currentTrackIndex];
                if (track?.timeCodedLyrics && track.timeCodedLyrics.length > 0) {
                  return (
                    <TimeCodedLyrics
                      tracks={track.timeCodedLyrics}
                      currentTime={globalCurrentTime}
                      seek={seek}
                      paintMode
                      offset={lyricsOffset}
                      isResyncMode={isResyncMode}
                      onResync={handleResync}
                    />
                  );
                } else if (track?.lyrics) {
                  return (
                    <div className="h-full flex flex-col justify-center space-y-4 overflow-hidden pointer-events-none">
                      {track.lyrics.split('\n').filter(Boolean).map((line, idx) => (
                        <p key={idx} className="text-3xl lg:text-4xl font-display font-black uppercase leading-tight text-white/20">{line}</p>
                      ))}
                    </div>
                  );
                }
                return (
                  <div className="h-full flex flex-col items-center justify-center gap-6 opacity-20 pointer-events-none">
                    <Music2 size={64} />
                    <p className="text-sm font-black uppercase tracking-[0.4em]">No lyrics available</p>
                  </div>
                );
              })()}
            </div>

            {/* ── Bottom: essential control bar ── */}
            <div className="absolute bottom-0 left-0 right-0 z-30 h-[88px] bg-black/70 backdrop-blur-2xl border-t border-white/10 flex items-center px-8 gap-6">
              {/* Album art thumbnail – bottom left */}
              <div
                className="w-12 h-12 rounded-xl overflow-hidden border border-white/20 shadow-[0_0_20px_rgba(0,0,0,0.6)] shrink-0 cursor-pointer hover:scale-105 transition-all"
                onClick={() => { setIsVisualizerFullscreen(false); setIsVisualizerLayout(true); }}
                title="Back to stage"
              >
                <img src={thumb(album.coverImage, THUMB.small) || undefined} alt={album.title} loading="lazy" decoding="async" onError={onThumbError(album.coverImage)} className="w-full h-full object-cover" />
              </div>

              {/* Track info */}
              <div className="flex flex-col min-w-0 shrink-0 max-w-[180px]">
                <span className="text-[11px] font-black uppercase tracking-widest text-white truncate">{currentTrack?.title || 'No Track'}</span>
                <span className="text-[9px] font-bold text-small-orange uppercase tracking-widest truncate opacity-70">{album.artist}</span>
              </div>

              {/* Playback controls */}
              <div className="flex items-center gap-4 shrink-0">
                <button onClick={globalPrev} className="p-2 text-white/40 hover:text-white transition-all hover:scale-110 active:scale-95">
                  <SkipBack size={18} />
                </button>
                <button
                  onClick={togglePlay}
                  className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.25)] hover:scale-110 active:scale-95 transition-all"
                >
                  {globalIsPlaying ? <Pause size={20} fill="black" /> : <Play size={20} fill="black" className="ml-0.5" />}
                </button>
                <button onClick={globalNext} className="p-2 text-white/40 hover:text-white transition-all hover:scale-110 active:scale-95">
                  <SkipForward size={18} />
                </button>
              </div>

              {/* Progress bar */}
              <div className="flex-1 flex items-center gap-3">
                <span className="text-[9px] font-black text-white/30 w-8 text-right shrink-0">{formatTime(globalCurrentTime)}</span>
                <div
                  className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer relative group/fs-progress hover:h-1.5 transition-all"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    seek(((e.clientX - rect.left) / rect.width) * globalDuration);
                  }}
                >
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-small-orange shadow-[0_0_10px_rgba(255,140,0,0.5)]"
                    animate={{ width: `${(globalCurrentTime / (globalDuration || 1)) * 100}%` }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
                <span className="text-[9px] font-black text-white/30 w-8 shrink-0">{formatTime(globalDuration)}</span>
              </div>

              {/* Visualizer type selector */}
              <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full p-1 shrink-0">
                <button
                  onClick={() => setVisualizerType('FLOW')}
                  className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${visualizerType === 'FLOW' ? 'bg-white text-black shadow' : 'text-white/30 hover:text-white'}`}
                >
                  Flow
                </button>
                <button
                  onClick={() => setVisualizerType('PAINT')}
                  className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${visualizerType === 'PAINT' ? 'bg-white text-black shadow' : 'text-white/30 hover:text-white'}`}
                >
                  Paint
                </button>
              </div>

              {/* Spatial audio mode cycle + Dolby badge */}
              <div className="flex items-center gap-2 shrink-0">
                {isAtmosActive && (
                  <div
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest select-none"
                    style={{ background: 'rgba(0,112,255,0.18)', border: '1px solid rgba(0,112,255,0.45)', color: '#60a5fa' }}
                    title="Dolby Atmos passthrough active on this device"
                  >
                    <span style={{ fontStyle: 'italic', letterSpacing: '0.04em' }}>DOLBY</span>
                    <span className="text-[7px]">ATMOS</span>
                  </div>
                )}
                {dolbySupport.ec3 && !isAtmosActive && (
                  <div
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest select-none opacity-40"
                    style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}
                    title="This device supports Dolby Atmos passthrough"
                  >
                    <span style={{ fontStyle: 'italic' }}>DOLBY</span>
                  </div>
                )}
                <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-0.5">
                  {(['off', 'orbit', 'reactive'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setSpatialMode(m)}
                      className={`px-2.5 py-1 rounded-full text-[7px] font-black uppercase tracking-widest transition-all ${spatialMode === m ? 'bg-indigo-500 text-white shadow' : 'text-white/30 hover:text-white'}`}
                      title={m === 'off' ? 'Spatial audio off' : m === 'orbit' ? 'Orbit — slow 3D circle (HRTF)' : 'Reactive — bass, beat & treble drive 3D position'}
                    >
                      {m === 'off' ? '2D' : m === 'orbit' ? '3D' : '3D+'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Exit fullscreen */}
              <button
                onClick={() => setIsVisualizerFullscreen(false)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/20 transition-all shrink-0"
              >
                <Minimize2 size={12} /> Exit
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showShareModal && (() => {
        const shareText = `Check out ${album.title} by ${album.artist} on Plajah.com`;
        // Social shares MUST use the /share route so X/Facebook/etc. crawl the rich album
        // card. A plain /?type= link hits static index.html and previews as generic Plajah.
        const albumUrl = buildShareUrl('album', album.id, { track: currentTrack?.id, video: activeVideoId || undefined });
        // The embed iframe needs a directly-playable URL (not /share, which bounces humans).
        const embedUrl = publicUrl || `${window.location.origin}/?type=album&id=${album.id}`;
        const embedCode = `<iframe src="${embedUrl}${embedUrl.includes('?') ? '&' : '?'}embed=1" width="420" height="160" frameborder="0" allow="autoplay; encrypted-media" style="border-radius:16px;border:none;overflow:hidden"></iframe>`;

        const openShare = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');
        const copyClipboard = async (text: string, onDone: () => void) => {
          await navigator.clipboard.writeText(text);
          onDone();
        };

        const socials: { label: string; sublabel?: string; bg: string; fg: string; icon: React.ReactNode; action: () => void }[] = [
          {
            label: 'X', sublabel: 'Twitter',
            bg: '#000', fg: '#fff',
            icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
            action: () => openShare(`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(albumUrl)}`),
          },
          {
            label: 'Facebook',
            bg: '#1877F2', fg: '#fff',
            icon: <Facebook size={18} />,
            action: () => openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(albumUrl)}`),
          },
          {
            label: 'WhatsApp',
            bg: '#25D366', fg: '#fff',
            icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
            action: () => openShare(`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + albumUrl)}`),
          },
          {
            label: 'Telegram',
            bg: '#229ED9', fg: '#fff',
            icon: <Send size={17} />,
            action: () => openShare(`https://t.me/share/url?url=${encodeURIComponent(albumUrl)}&text=${encodeURIComponent(shareText)}`),
          },
          {
            label: 'Instagram', sublabel: 'Copy link',
            bg: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', fg: '#fff',
            icon: <Instagram size={18} />,
            action: () => copyClipboard(albumUrl, () => { setCopied(true); setTimeout(() => setCopied(false), 2000); }),
          },
          {
            label: 'TikTok', sublabel: 'Copy link',
            bg: '#010101', fg: '#fff',
            icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.24 8.24 0 004.82 1.54V6.78a4.85 4.85 0 01-1.05-.09z"/></svg>,
            action: () => copyClipboard(albumUrl, () => { setCopied(true); setTimeout(() => setCopied(false), 2000); }),
          },
          {
            label: 'Threads', sublabel: 'Copy link',
            bg: '#000', fg: '#fff',
            icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 012.141.099c-.172-.768-.517-1.353-1.03-1.743-.647-.497-1.534-.748-2.637-.756-1.917.014-3.091.698-3.758 2.122l-1.914-.755c.907-2.045 2.81-3.146 5.666-3.17 1.578.012 2.924.404 4.002 1.167 1.182.84 1.923 2.115 2.203 3.794.15.029.297.063.444.1.802.2 1.516.533 2.124 1.013 1.064.845 1.75 2.066 2.031 3.621.397 2.206-.193 4.426-1.62 5.942C17.172 23.236 14.977 24 12.186 24zm.554-8.49c-.137.008-.278.014-.423.018 1.136-.33 1.826-1.04 2.053-2.114a11.774 11.774 0 00-1.985-.199c-.956.056-1.711.315-2.199.754-.364.316-.549.726-.524 1.158.033.604.408 1.115 1.053 1.533.548.356 1.218.515 1.95.494.19-.005.373-.02.548-.046l.016.003a5.3 5.3 0 00-.489-.6z"/></svg>,
            action: () => copyClipboard(albumUrl, () => { setCopied(true); setTimeout(() => setCopied(false), 2000); }),
          },
          {
            label: 'Reddit',
            bg: '#FF4500', fg: '#fff',
            icon: <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>,
            action: () => openShare(`https://www.reddit.com/submit?url=${encodeURIComponent(albumUrl)}&title=${encodeURIComponent(album.title + ' by ' + album.artist + ' on Plajah')}`),
          },
          {
            label: 'Email',
            bg: '#EA4335', fg: '#fff',
            icon: <Mail size={18} />,
            action: () => window.open(`mailto:?subject=${encodeURIComponent(album.title + ' on Plajah')}&body=${encodeURIComponent(shareText + '\n\n' + albumUrl)}`),
          },
          {
            label: 'SMS',
            bg: '#34C759', fg: '#fff',
            icon: <MessageSquare size={17} />,
            action: () => window.open(`sms:?body=${encodeURIComponent(shareText + ' ' + albumUrl)}`),
          },
        ];

        return (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-3xl z-[200] flex items-center justify-center p-4 overflow-y-auto">
            <div className="max-w-lg w-full bg-[#080808] border border-white/10 rounded-[2.5rem] shadow-3xl animate-in zoom-in-95 overflow-hidden">
              {/* Header */}
              <div className="relative px-8 pt-8 pb-6 text-center border-b border-white/5">
                <button onClick={() => setShowShareModal(false)} className="absolute top-6 right-6 p-2 text-white/20 hover:text-white transition-all hover:rotate-90"><X size={22} /></button>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg,rgba(107,0,153,0.3),rgba(255,140,0,0.2))', border: '1px solid rgba(255,140,0,0.2)' }}>
                  <Share2 size={22} className="text-orange-300" />
                </div>
                <h2 className="text-xl font-display font-black uppercase tracking-widest mb-1">{album.title}</h2>
                <p className="text-[10px] font-bold text-small-orange/70 uppercase tracking-[0.3em] truncate">{album.artist}</p>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* Direct link */}
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2 px-1">Direct Link</p>
                  <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.04] border border-white/10 rounded-2xl">
                    <LinkIcon size={14} className="text-white/20 shrink-0" />
                    <span className="flex-1 text-[10px] font-bold text-white/50 truncate">{albumUrl}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => { navigator.clipboard.writeText(albumUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                        style={{ background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)', border: copied ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)', color: copied ? '#4ade80' : '#fff' }}
                      >
                        {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                      </button>
                      <button
                        onClick={() => window.open(albumUrl, '_blank', 'noopener,noreferrer')}
                        className="p-1.5 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white transition-all"
                      >
                        <ExternalLink size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Embed code */}
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2 px-1">Embed Player</p>
                  <div className="flex items-start gap-2 px-4 py-3 bg-white/[0.04] border border-white/10 rounded-2xl">
                    <code className="flex-1 text-[8px] font-mono text-white/30 break-all leading-relaxed">{embedCode}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(embedCode); setCopiedEmbed(true); setTimeout(() => setCopiedEmbed(false), 2000); }}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all mt-0.5"
                      style={{ background: copiedEmbed ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)', border: copiedEmbed ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)', color: copiedEmbed ? '#4ade80' : '#fff' }}
                    >
                      {copiedEmbed ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                    </button>
                  </div>
                </div>

                {/* Social grid */}
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2 px-1">Share To</p>
                  <div className="grid grid-cols-5 gap-2">
                    {socials.map(({ label, sublabel, bg, fg, icon, action }) => (
                      <button
                        key={label}
                        onClick={action}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all hover:scale-105 active:scale-95"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: bg, color: fg }}
                        >
                          {icon}
                        </div>
                        <span className="text-[7px] font-black uppercase tracking-wider text-white/50 leading-tight text-center">{label}</span>
                        {sublabel && <span className="text-[6px] text-white/25 uppercase tracking-wider leading-tight">{sublabel}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      
      <SmartLightingPanel
        isOpen={isLightingOpen}
        onClose={() => setIsLightingOpen(false)}
        analyser={globalAnalyser}
      />

      <DonationModal
        isOpen={isDonationModalOpen}
        onClose={() => setIsDonationModalOpen(false)}
        toId={album.ownerId || ''}
        toName={album.artist}
        albumId={album.id}
        albumTitle={album.title}
      />

      <AnimatePresence>
        {isDJMode && (
          <DJModeView
            album={album}
            onClose={() => setIsDJMode(false)}
            initialTrack={globalTrack}
            initialTime={globalCurrentTime}
            initialTrackIndex={currentTrackIndex}
            onPauseGlobal={pause}
            getSharedAudioContext={getAudioContext}
            onExitToGlobal={(track, timeSec, opts) => {
              // Keep the song playing in the album view, carrying the deck position + filter.
              setDjFilter?.(opts.filter);
              if (track.id === globalTrack?.id) {
                seek(timeSec);
                if (opts.playing) resume();
              } else {
                playTrack(track, album, 'LIBRARY', timeSec, true);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Add-to-playlist picker — opened from the track header or any track row */}
      {playlistPickerTrack && (
        <PlaylistPickerModal track={playlistPickerTrack} onClose={() => setPlaylistPickerTrack(null)} />
      )}
    </div>
  );
};

export default PlayerView;
