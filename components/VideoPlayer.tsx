import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Video, VideoComment, UserProfile } from '../types';
import { getPlatformInfo } from '../hooks/usePlatform';
import {
  likeVideo, unlikeVideo, postVideoComment, listenToVideoComments,
  fetchUserProfile, checkIfLiked, updateVideo, auth,
  followUser, unfollowUser, isFollowing,
} from '../services/backendService';
import { buildShareUrl } from '../services/deepLinkService';
import { recordProgress, getResumePosition } from '../services/watchHistoryService';
import { createParty, partyShareUrl, shouldResync } from '../services/partyService';
import { useParty } from '../hooks/useParty';
import { Users, Radio } from 'lucide-react';
import TvVideoUpNext from './tv/TvVideoUpNext';
import {
  Heart, MessageCircle, Share2, X, ArrowLeft, Volume2, VolumeX,
  Play, Pause, Maximize2, Minimize2, Settings, Camera, Tag, Globe,
  Lock, Check, Upload, Eye, EyeOff, ChevronDown, ChevronUp,
  UserPlus, MoreVertical, Bookmark, Flag, SkipForward,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import { AddToPlaylistModal } from './VideoPlaylistKit';
import LearnChip from './LearnChip';
import LoreLayer from './reello/LoreLayer';
import WatchLaterButton from './reello/WatchLaterButton';
import WhatIfBranching from './reello/WhatIfBranching';
import RepriseButton from './reello/RepriseButton';
import SourceCreditChip from './reello/SourceCreditChip';
import OriginBadge from './OriginBadge';
import { SubtitleTracks, CaptionToggle, usableSubtitles } from './reello/CaptionTracks';
import CommentSection from './CommentSection';
import PlajahPlusButton from './PlajahPlusButton';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';
import { db } from '../services/firebase';
import { hlsTuning, capLevelsToPanel } from '../services/hlsTuning';

// ── Mux HLS player ────────────────────────────────────────────────────────────
// Uses a native <video> element + HLS.js so the Plajah player UI is always on
// top with no MuxPlayer web-component controls overlapping.
interface MuxHlsVideoProps {
  playbackId: string;
  muted: boolean;
  poster?: string;
  className?: string;
  onVideoReady: (el: HTMLVideoElement) => void;
  onPlay: () => void;
  onPause: () => void;
  onError: () => void;
  onEnded?: () => void;
  /** WebVTT <track> children. Cross-origin VTT requires CORS, hence crossOrigin below. */
  children?: React.ReactNode;
  hasSubtitles?: boolean;
}

const MuxHlsVideo = React.memo(React.forwardRef<HTMLVideoElement, MuxHlsVideoProps>(
  ({ playbackId, muted, poster, className, onVideoReady, onPlay, onPause, onError, onEnded, children, hasSubtitles }, _ref) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef   = useRef<any>(null);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      // Notify parent immediately — controls work before HLS is ready
      onVideoReady(video);

      const streamUrl = `https://stream.mux.com/${playbackId}.m3u8`;

      const tryHls = async () => {
        try {
          const { default: Hls } = await import('hls.js');
          if (Hls.isSupported()) {
            const hls = new Hls(hlsTuning());
            hlsRef.current = hls;
            hls.loadSource(streamUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              // Never decode more pixels than the panel shows — on a TV that is the difference
              // between smooth playback and a GPU asked to scale 4K down to 1080p in real time.
              capLevelsToPanel(hls as any);
              video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
            });
            let recovered = 0;
            hls.on(Hls.Events.ERROR, (_: any, data: any) => {
              if (!data.fatal) return;
              // Give flaky decoders (esp. Android TV WebView) a chance before giving up so the
              // parent can fall through to the Mux progressive-MP4 (no-MSE) source.
              if (recovered < 2) {
                recovered++;
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { hls.startLoad(); return; }
                if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
              }
              console.warn('[PlajahTV] Reello HLS fatal', data?.type, data?.details);
              onError();
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari — native HLS
            video.src = streamUrl;
            video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
          } else {
            // No MSE (hls.js) AND no native HLS — the Android TV WebView failure mode.
            console.warn('[PlajahTV] Reello: no MSE + no native HLS → falling back to Mux MP4');
            onError();
          }
        } catch {
          onError();
        }
      };

      tryHls();
      return () => { hlsRef.current?.destroy(); hlsRef.current = null; };
    }, [playbackId]);

    return (
      <video
        ref={videoRef}
        muted={muted}
        poster={poster}
        playsInline
        crossOrigin={hasSubtitles ? 'anonymous' : undefined}
        className={className}
        onPlay={onPlay}
        onPause={onPause}
        onError={onError}
        onEnded={onEnded}
      >
        {children}
      </video>
    );
  }
));

interface VideoPlayerProps {
  video: Video;
  onBack: () => void;
  currentUser: any;
  /** Ordered playlist queue this video belongs to — enables autoplay-next. */
  queue?: Video[];
  /** Play a different video (advance the queue). */
  onPlayQueued?: (v: Video) => void;
  /** If opened from a shared watch-party link, the party to auto-join and follow. */
  partyId?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(time: number) {
  if (isNaN(time)) return '0:00';
  const h = Math.floor(time / 3600);
  const m = Math.floor((time % 3600) / 60);
  const s = Math.floor(time % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function fmtCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── VideoEditModal ────────────────────────────────────────────────────────────
interface EditModalProps {
  video: Video;
  onClose: () => void;
  onSaved: (updated: Partial<Video>) => void;
}

const GENRES = ['General', 'Music Video', 'Short Film', 'Documentary', 'Vlog', 'Tutorial', 'Gaming', 'Education', 'Podcast', 'Live Stream', 'Comedy', 'News', 'Sports', 'Fitness'];

const VideoEditModal: React.FC<EditModalProps> = ({ video, onClose, onSaved }) => {
  const [title, setTitle]             = useState(video.title);
  const [description, setDescription] = useState(video.description || '');
  const [genre, setGenre]             = useState(video.genre || 'General');
  const [isPrivate, setIsPrivate]     = useState(video.isPrivate ?? false);
  const [tags, setTags]               = useState<string[]>(video.tags || []);
  const [tagInput, setTagInput]       = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState(video.thumbnailUrl || '');
  const [coverUrl, setCoverUrl]         = useState(video.coverImageUrl || '');
  const [thumbFile, setThumbFile]       = useState<File | null>(null);
  const [coverFile, setCoverFile]       = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState(video.thumbnailUrl || '');
  const [coverPreview, setCoverPreview] = useState(video.coverImageUrl || '');
  const [saving, setSaving]           = useState(false);
  const [activeSection, setActiveSection] = useState<'details' | 'media' | 'distribution'>('details');

  const handleThumbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setThumbFile(f);
    setThumbPreview(URL.createObjectURL(f));
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCoverFile(f);
    setCoverPreview(URL.createObjectURL(f));
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) { setTags(p => [...p, t]); setTagInput(''); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Partial<Video> = { title, description, genre, isPrivate, tags };
      const storage = getStorage();

      if (thumbFile) {
        const ref = storageRef(storage, `thumbnails/${video.id}_thumb_${Date.now()}`);
        await uploadBytes(ref, thumbFile);
        updates.thumbnailUrl = await getDownloadURL(ref);
      }
      if (coverFile) {
        const ref = storageRef(storage, `thumbnails/${video.id}_cover_${Date.now()}`);
        await uploadBytes(ref, coverFile);
        updates.coverImageUrl = await getDownloadURL(ref);
      }

      await updateVideo(video.id, updates);
      onSaved(updates);
      onClose();
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { id: 'details', label: 'Details' },
    { id: 'media', label: 'Thumbnail & Cover' },
    { id: 'distribution', label: 'Distribution' },
  ] as const;

  return (
    <div className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-3xl max-h-[90vh] bg-[#0a0a0a] border border-white/10 rounded-[2rem] overflow-hidden flex flex-col shadow-[0_40px_80px_rgba(0,0,0,0.8)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-5 border-b border-white/5 shrink-0">
          <div>
            <h2 className="text-xl font-display font-black uppercase tracking-tight">Video Settings</h2>
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 mt-0.5">Edit details for this video</p>
          </div>
          <button onClick={onClose} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-all"><X size={18} /></button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 px-8 pt-4 shrink-0">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeSection === s.id ? 'bg-white text-black' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
            >{s.label}</button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">

          {/* ── DETAILS ── */}
          {activeSection === 'details' && (
            <div className="space-y-6">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Title</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 focus:border-white/30 rounded-xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                  placeholder="Video title"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Description</label>
                <textarea
                  rows={5}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 focus:border-white/30 rounded-xl px-5 py-3.5 text-sm font-bold outline-none transition-all resize-none"
                  placeholder="Tell viewers about your video..."
                />
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Genre / Category</label>
                <select
                  value={genre}
                  onChange={e => setGenre(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 focus:border-white/30 rounded-xl px-5 py-3.5 text-sm font-bold outline-none transition-all appearance-none text-white"
                >
                  {GENRES.map(g => <option key={g} value={g} className="bg-[#0a0a0a]">{g}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Tags</label>
                <div className="flex gap-2 mb-3">
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    placeholder="Add tag and press Enter..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold outline-none placeholder:text-white/20"
                  />
                  <button type="button" onClick={addTag} className="px-5 bg-white/10 hover:bg-white/20 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest">
                      <Tag size={9} className="text-white/40" /> {tag}
                      <button onClick={() => setTags(t => t.filter(x => x !== tag))} className="text-white/30 hover:text-red-400 transition-colors"><X size={9} /></button>
                    </span>
                  ))}
                  {tags.length === 0 && <p className="text-[9px] text-white/20 uppercase tracking-widest">No tags yet</p>}
                </div>
              </div>
            </div>
          )}

          {/* ── MEDIA ── */}
          {activeSection === 'media' && (
            <div className="space-y-6">
              {/* Thumbnail */}
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Thumbnail</label>
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-white/5 border border-white/10 group">
                  {thumbPreview
                    ? <img src={thumbPreview} alt="thumbnail" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-white/20"><Camera size={32} /></div>}
                  <label className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/50 transition-all cursor-pointer">
                    <div className="opacity-0 group-hover:opacity-100 flex flex-col items-center gap-2 transition-all">
                      <div className="p-3 bg-white/20 rounded-full"><Upload size={20} /></div>
                      <span className="text-[9px] font-black uppercase tracking-widest">Change Thumbnail</span>
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleThumbChange} />
                  </label>
                </div>
                <p className="text-[8px] text-white/20 uppercase tracking-widest mt-2">Recommended: 1280×720 (16:9)</p>
              </div>

              {/* Cover */}
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Cover / Background Image</label>
                <div className="relative h-40 rounded-2xl overflow-hidden bg-white/5 border border-white/10 group">
                  {coverPreview
                    ? <img src={coverPreview} alt="cover" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-white/20"><Camera size={32} /></div>}
                  <label className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/50 transition-all cursor-pointer">
                    <div className="opacity-0 group-hover:opacity-100 flex flex-col items-center gap-2 transition-all">
                      <div className="p-3 bg-white/20 rounded-full"><Upload size={20} /></div>
                      <span className="text-[9px] font-black uppercase tracking-widest">Change Cover</span>
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
                  </label>
                </div>
                <p className="text-[8px] text-white/20 uppercase tracking-widest mt-2">Used as blurred background on the player page</p>
              </div>
            </div>
          )}

          {/* ── DISTRIBUTION ── */}
          {activeSection === 'distribution' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-5 bg-white/[0.03] rounded-2xl border border-white/5">
                <div className="flex items-center gap-4">
                  {isPrivate ? <Lock size={18} className="text-white/30" /> : <Globe size={18} className="text-green-400" />}
                  <div>
                    <p className="text-sm font-black uppercase tracking-tight">{isPrivate ? 'Private' : 'Public'}</p>
                    <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-0.5">
                      {isPrivate ? 'Only you can see this video' : 'Visible to everyone on the platform'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPrivate(p => !p)}
                  className={`w-12 h-7 rounded-full relative transition-all ${!isPrivate ? 'bg-green-500' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all shadow-lg ${!isPrivate ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>

              <div className="p-5 bg-white/[0.03] rounded-2xl border border-white/5 space-y-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Sharing</p>
                <p className="text-xs font-bold text-white/50 leading-relaxed">
                  Anyone with the link can view this video, regardless of the visibility setting above.
                  Share the URL to distribute your content directly.
                </p>
                <button
                  onClick={() => { navigator.clipboard.writeText(window.location.href); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all font-black text-[9px] uppercase tracking-widest"
                >
                  <Share2 size={13} /> Copy Video Link
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 pb-8 pt-5 border-t border-white/5 shrink-0">
          <button onClick={onClose} className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 bg-white text-black hover:bg-[#FF8C00] hover:text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <><div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Saving…</> : <><Check size={14} /> Save Changes</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Main VideoPlayer ──────────────────────────────────────────────────────────
const VideoPlayer: React.FC<VideoPlayerProps> = ({ video: initialVideo, onBack, currentUser, queue, onPlayQueued, partyId }) => {
  const {
    isPlaying, pause, resume, setVideoElement, setYtPlayer,
    playVideo, currentVideo, clearMedia, volume, activateVideoSource,
  } = useGlobalPlayerState();
  const { currentTime, duration, seek } = useGlobalPlayerProgress();

  const [video, setVideo]           = useState(initialVideo);
  const [comments, setComments]     = useState<VideoComment[]>([]);
  const [videoError, setVideoError] = useState(false);
  // Mux progressive-MP4 fallback (plays through a plain <video>, NO Media Source Extensions).
  // Android TV System WebViews frequently can't play Mux HLS via hls.js/MSE and have no native
  // HLS; when the MSE attempt errors we drop to this. Needs Mux static renditions (MP4 support)
  // on the asset — if absent it 404s and we land on the same error state as before (no regression).
  const [muxMp4Error, setMuxMp4Error] = useState(false);
  const [isLiked, setIsLiked]       = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isMuted, setIsMuted]       = useState(false);
  const [autoplayNext, setAutoplayNext] = useState(true);
  const [upNextIn, setUpNextIn]     = useState<number | null>(null);  // countdown seconds
  const [showUpNext, setShowUpNext] = useState(false);                // TV end-of-video overlay
  const [isFullscreen, setIsFullscreen]     = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [descExpanded, setDescExpanded]       = useState(false);
  const [showEditModal, setShowEditModal]     = useState(false);
  const [ownerProfile, setOwnerProfile]       = useState<UserProfile | null>(null);
  const [isFollowingOwner, setIsFollowingOwner] = useState(false);
  const [followBusy, setFollowBusy]           = useState(false);
  const [showMobileComments, setShowMobileComments] = useState(false);

  const playerContainerRef = useRef<HTMLDivElement>(null);
  const videoWrapRef       = useRef<HTMLDivElement>(null);
  const localVideoRef      = useRef<HTMLVideoElement | null>(null);

  // ── Watch party (synchronized viewing) ────────────────────────────────────
  // The host's play/pause/seek is broadcast as STATE; every follower's own local player follows it
  // (content still streams locally per viewer — see services/partyService.ts). One shared primitive.
  const [activePartyId, setActivePartyId] = useState<string | null>(partyId ?? null);
  useEffect(() => { setActivePartyId(partyId ?? null); }, [partyId]);
  const party = useParty(activePartyId);
  const ytPlayerRef        = useRef<any>(null);
  const ytContainerId      = useRef(`yt-${Math.random().toString(36).substr(2, 9)}`);
  const controlsTimer      = useRef<NodeJS.Timeout | null>(null);
  const introHandled       = useRef(false);

  const isOwner = !!(currentUser?.uid && currentUser.uid === video.ownerId);
  const thumbnail = video.thumbnailUrl || video.coverImageUrl || '';
  const progress  = (currentTime / duration) * 100 || 0;
  // Subtitles are opt-in per video; when present the element needs CORS for cross-origin VTT.
  const hasSubtitles = usableSubtitles(video).length > 0;

  // A What-If branch may hand the player a different video (alternate scene / ending),
  // optionally at an in-point. Swapping `video` re-runs every id-keyed effect below.
  // Tagged with the target video id so a stale `duration` from the OUTGOING video can't
  // consume the seek before the new source has actually loaded.
  const pendingBranchSeek = useRef<{ videoId: string; sec: number } | null>(null);
  const handleBranchTo = useCallback((next: Video, startSec?: number) => {
    pendingBranchSeek.current = typeof startSec === 'number' ? { videoId: next.id, sec: startSec } : null;
    setVideo(next);
    playVideo(next);
  }, [playVideo]);

  // Register this video as the active VIDEO source in GlobalPlayerContext on mount.
  // activateVideoSource stops audio and sets audioSource='VIDEO' without clearing the
  // video element's src — safe to call after the ref callback has already fired.
  useEffect(() => {
    activateVideoSource(initialVideo);
    return () => { clearMedia(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fullscreen listener
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


  // Auto-hide controls while playing
  useEffect(() => {
    if (isPlaying && !introHandled.current) {
      introHandled.current = true;
      controlsTimer.current = setTimeout(() => setControlsVisible(false), 4000);
    }
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [isPlaying]);

  // 5s rather than 3s, and any input counts — see the note in MovieUXView. On a remote the
  // controls were disappearing between presses, mid-use.
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (isPlaying) controlsTimer.current = setTimeout(() => setControlsVisible(false), 5000);
  }, [isPlaying]);

  const handleMouseMove = revealControls;

  useEffect(() => {
    const onKey = () => revealControls();
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [revealControls]);

  // YouTube player setup
  useEffect(() => {
    const isYoutube = (video.url ?? '').includes('youtube.com') || (video.url ?? '').includes('youtu.be');
    if (!isYoutube) { setYtPlayer(null); return; }

    let vId = '';
    const m = video.url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
    if (m?.[2]?.length === 11) vId = m[2];
    else vId = video.url.split('/').pop()?.split('?')[0] || '';
    if (!vId || vId.length < 5) return;

    const init = () => {
      if (!document.getElementById(ytContainerId.current)) return;
      try {
        if (ytPlayerRef.current?.loadVideoById) {
          ytPlayerRef.current.loadVideoById(vId);
        } else {
          ytPlayerRef.current?.destroy?.();
          ytPlayerRef.current = new (window as any).YT.Player(ytContainerId.current, {
            height: '100%', width: '100%', videoId: vId,
            playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, showinfo: 0, iv_load_policy: 3, fs: 0 },
            events: { onReady: (e: any) => { setYtPlayer(e.target); e.target.playVideo(); } },
          });
        }
      } catch (e) { console.error('YT init failed', e); }
    };

    if ((window as any).YT?.Player) { init(); }
    else {
      if (!document.getElementById('youtube-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'youtube-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const iv = setInterval(() => { if ((window as any).YT?.Player) { clearInterval(iv); init(); } }, 100);
      return () => clearInterval(iv);
    }
    return () => { ytPlayerRef.current?.destroy?.(); ytPlayerRef.current = null; setYtPlayer(null); };
  }, [video.url, setYtPlayer]);

  // Fresh playback state per video — never carry a prior title's fallback errors over.
  useEffect(() => { setVideoError(false); setMuxMp4Error(false); }, [video.id]);

  // Real-time listener: pick up muxPlaybackId / url the moment Mux finishes
  // processing — even if that's 20 minutes after the upload completed.
  useEffect(() => {
    if (video.muxPlaybackId || (video.url && video.url.length > 0)) return;
    const unsub = onSnapshot(doc(db, 'videos', video.id), snap => {
      if (!snap.exists()) return;
      const data = snap.data() as Partial<typeof video>;
      if (data.muxPlaybackId || (data.url && data.url.length > 0)) {
        setVideo(v => ({ ...v, ...data }));
        setVideoError(false);
      }
    });
    return unsub;
  }, [video.id, video.muxPlaybackId, video.url]);

  // Load initial data + start playback
  useEffect(() => {
    const unsub = listenToVideoComments(video.id, setComments);
    fetchUserProfile(video.ownerId).then(p => setOwnerProfile(p));
    checkIfLiked(video.id).then(l => setIsLiked(l));
    // Am I already following this video's creator? (drives the Follow / Following button)
    if (currentUser?.uid && video.ownerId && currentUser.uid !== video.ownerId) {
      isFollowing(video.ownerId).then(setIsFollowingOwner).catch(() => {});
    } else {
      setIsFollowingOwner(false);
    }
    // Always call playVideo to clear any stale media from Taleo or other players
    playVideo(video);
    return () => {
      unsub();
      // Explicitly stop the local video element before clearing global state so
      // its audio track is terminated immediately — prevents overlap when the
      // user switches to a different video.
      if (localVideoRef.current) {
        localVideoRef.current.pause();
        localVideoRef.current.removeAttribute('src');
        try { localVideoRef.current.load(); } catch (_) {}
      }
      clearMedia();
    };
  }, [video.id]);

  // Real-time listener — picks up muxPlaybackId as soon as background transcoding finishes
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'videos', video.id), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as Video;
      if (data.muxPlaybackId && data.muxPlaybackId !== video.muxPlaybackId) {
        setVideo(v => ({ ...v, muxPlaybackId: data.muxPlaybackId, muxAssetId: data.muxAssetId }));
        setVideoError(false);
      }
    });
    return unsub;
  }, [video.id]);

  // 2s sync check — if the video element is playing but global state says paused, sync it.
  // Also handles browser-autoplay-blocked case for native <video> elements.
  useEffect(() => {
    if (party.isFollower) return;   // a follower is slaved to the host — don't fight the follow loop
    const timer = setTimeout(() => {
      const el = localVideoRef.current;
      if (!el) return;
      if (!el.paused) {
        // Video is actually playing — make sure global state reflects it
        resume();
      } else if (el.src && el.readyState >= 2) {
        // Ready but paused — try to play (native <video> autoplay may have been blocked)
        el.play().catch(() => {});
        resume();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [video.id]);

  // Mute / volume sync
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.muted = isMuted;
      localVideoRef.current.volume = isMuted ? 0 : volume;
    }
  }, [isMuted, volume]);

  // HOST: broadcast play/pause/seek + a heartbeat so followers (incl. late joiners) stay in sync.
  useEffect(() => {
    if (!activePartyId || !party.isHost) return;
    const el = localVideoRef.current;
    if (!el) return;
    const push = () => party.broadcast({ isPlaying: !el.paused, positionSec: el.currentTime || 0, contentId: video.id });
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
  }, [activePartyId, party.isHost, video.id, video.muxPlaybackId, video.url]);

  // FOLLOWER: slave the local element to the host's state — seek only when drifted past threshold so
  // we don't fight the decoder, and mirror play/pause. Re-armed whenever a new host state arrives.
  useEffect(() => {
    if (!activePartyId || !party.isFollower) return;
    const apply = () => {
      const el = localVideoRef.current;
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

  const startWatchParty = useCallback(async () => {
    try {
      const id = await createParty({
        kind: 'WATCH',
        content: { type: 'VIDEO', id: video.id, title: video.title, thumbnail: video.thumbnailUrl || video.coverImageUrl, url: video.url, muxPlaybackId: video.muxPlaybackId },
        initial: { positionSec: localVideoRef.current?.currentTime || 0, isPlaying: !localVideoRef.current?.paused },
      });
      setActivePartyId(id);
      const url = partyShareUrl(id);
      if (navigator.share) navigator.share({ title: `Watch “${video.title}” together on Plajah`, url }).catch(() => {});
      else navigator.clipboard?.writeText(url).catch(() => {});
    } catch (e) { console.error('start watch party failed', e); }
  }, [video]);

  const leaveWatchParty = useCallback(() => {
    if (party.isHost) party.end();
    setActivePartyId(null);
  }, [party]);

  // ── Watch history: throttled progress recording + resume ──────────────────
  const lastRecordRef = useRef(0);
  const resumeAppliedRef = useRef(false);
  const [resumeHint, setResumeHint] = useState<number | null>(null);

  // Lore Layer: while a character card is open, clicks on the stage must not toggle playback.
  const [loreCardOpen, setLoreCardOpen] = useState(false);

  const doRecord = useCallback(() => {
    if (!video?.id) return;
    if (!(duration > 0) || isNaN(duration)) return;      // guard NaN / 0 duration
    if (!(currentTime > 0) || isNaN(currentTime)) return;
    recordProgress({
      id: video.id,
      kind: 'VIDEO',
      title: video.title,
      thumbnailUrl: video.thumbnailUrl || video.coverImageUrl || undefined,
      ownerName: ownerProfile?.displayName || video.artist || undefined,
      positionSec: currentTime,
      durationSec: duration,
      worldId: video.worldId,
    }).catch(() => { /* non-fatal */ });
  }, [video?.id, video?.title, video?.thumbnailUrl, video?.coverImageUrl, video?.artist, video?.worldId, ownerProfile?.displayName, currentTime, duration]);

  // Throttle to ~once per 5s while playing.
  useEffect(() => {
    if (!isPlaying) return;
    const now = Date.now();
    if (now - lastRecordRef.current >= 5000) {
      lastRecordRef.current = now;
      doRecord();
    }
  }, [currentTime, isPlaying, doRecord]);

  // Record on pause.
  useEffect(() => {
    if (!isPlaying) doRecord();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Record a final position on unmount.
  useEffect(() => {
    return () => { doRecord(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A What-If branch in-point wins over the watch-history resume position.
  useEffect(() => {
    const target = pendingBranchSeek.current;
    if (!target || target.videoId !== video?.id) return;
    if (!(duration > 0) || isNaN(duration)) return;
    pendingBranchSeek.current = null;
    resumeAppliedRef.current = true;          // don't also jump to the resume position
    seek(Math.min(target.sec, Math.max(0, duration - 1)));
  }, [video?.id, duration, seek]);

  // Resume from last position once the duration is known (skip if near the end).
  useEffect(() => {
    if (resumeAppliedRef.current) return;
    if (pendingBranchSeek.current) return;   // a branch jump owns the in-point
    if (!video?.id || !(duration > 0) || isNaN(duration)) return;
    resumeAppliedRef.current = true;
    const pos = getResumePosition(video.id);
    if (pos > 3 && pos < duration - 15) {
      seek(pos);
      setResumeHint(pos);
      setTimeout(() => setResumeHint(null), 5000);
    }
  }, [video?.id, duration, seek]);

  // Reset resume guard when the video changes.
  useEffect(() => { resumeAppliedRef.current = false; setResumeHint(null); }, [video?.id]);

  // ── Autoplay-next (playlist queue) ────────────────────────────────────────
  const nextInQueue = (() => {
    if (!queue || queue.length < 2) return null;
    const idx = queue.findIndex(v => v.id === video.id);
    return idx >= 0 && idx + 1 < queue.length ? queue[idx + 1] : null;
  })();

  const playNext = useCallback(() => {
    if (nextInQueue && onPlayQueued) { setUpNextIn(null); onPlayQueued(nextInQueue); }
  }, [nextInQueue, onPlayQueued]);

  const handleVideoEnded = useCallback(() => {
    doRecord();
    if (autoplayNext && nextInQueue && onPlayQueued) { setUpNextIn(5); return; }
    // On a TV, don't dead-end on a frozen last frame — offer an "up next" (suggest next + more from
    // this world + characters). The overlay itself falls back to a plain exit if it has nothing to
    // show, so this is safe for any video.
    if (getPlatformInfo().isTV) {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        try { document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.(); } catch { /* ignore */ }
      }
      setShowUpNext(true);
      return;
    }
    // Desktop/phone: give the screen back rather than parking on a frozen last frame. Leave element
    // fullscreen too if the desktop Maximize button put us there.
    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      try { document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.(); } catch { /* ignore */ }
    }
    onBack?.();
  }, [doRecord, autoplayNext, nextInQueue, onPlayQueued, onBack]);

  // Countdown tick for the "Up next" card.
  useEffect(() => {
    if (upNextIn === null) return;
    if (upNextIn <= 0) { playNext(); return; }
    const t = setTimeout(() => setUpNextIn(n => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [upNextIn, playNext]);

  // Cancel any pending up-next when the video changes.
  useEffect(() => { setUpNextIn(null); }, [video?.id]);

  const togglePlay = useCallback(() => {
    if (loreCardOpen) return;   // the lore card owns the stage while it's open
    if (party.isFollower) return;   // followers are slaved to the host's controls
    const el = localVideoRef.current;
    if (el) {
      if (el.paused) {
        el.play()
          .then(() => resume())
          .catch(() => { el.muted = true; el.play().then(() => resume()).catch(() => {}); });
      } else {
        el.pause();
        pause();
      }
    } else {
      isPlaying ? pause() : resume();
    }
  }, [isPlaying, pause, resume, loreCardOpen, party.isFollower]);

  const handleLike = async () => {
    if (!currentUser) return;
    if (isLiked) { await unlikeVideo(video.id); setIsLiked(false); setVideo(v => ({ ...v, likesCount: Math.max(0, (v.likesCount || 1) - 1) })); }
    else { await likeVideo(video.id); setIsLiked(true); setVideo(v => ({ ...v, likesCount: (v.likesCount || 0) + 1 })); }
  };

  const handleShare = () => {
    // Direct link to THIS video — not window.location.href (the current page).
    const url = buildShareUrl('video', video.id);
    if (navigator.share) navigator.share({ title: video.title, url }).catch(() => {});
    else { navigator.clipboard.writeText(url); }
  };

  // Follow / unfollow the video's creator (the button under the player did nothing before).
  const handleFollowOwner = async () => {
    if (!currentUser?.uid || !video.ownerId || isOwner || followBusy) return;
    const next = !isFollowingOwner;
    setFollowBusy(true);
    setIsFollowingOwner(next);   // optimistic
    try {
      if (next) await followUser(video.ownerId);
      else await unfollowUser(video.ownerId);
    } catch {
      setIsFollowingOwner(!next); // revert on failure
    } finally {
      setFollowBusy(false);
    }
  };

  const toggleFullscreen = () => {
    if (isFullscreen) {
      document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.();
    } else {
      const el = videoWrapRef.current as any;
      el?.requestFullscreen?.() ?? el?.webkitRequestFullscreen?.();
    }
  };

  // A television does NOT use the Fullscreen API.
  //
  // This used to call requestFullscreen() on first play, reasoning that playback should fill the
  // screen like the streaming apps next to it. On Android that routes through the WebView's
  // onShowCustomView, which swaps the page for a native fullscreen surface. Back then unmounted
  // the React player underneath while that native surface stayed up — leaving a dead fullscreen
  // view with no UI and no way out. The app looked frozen, and it was: you could not get back.
  //
  // On a TV the app is already the whole screen, so the API bought nothing and cost everything.
  // The player is laid out full-bleed with CSS instead (see `tvFullBleed` below), which cannot
  // trap anyone because there is no native surface involved.

  // Back must escape, from anywhere, always.
  //
  // Two paths, in order: if we somehow ARE in element fullscreen (the manual button on desktop,
  // or a browser that auto-fullscreened on play), leave that first — otherwise leaving the
  // player would strand that surface. Only once we are out of fullscreen does Back leave the
  // player. Both consume the press so the app does not also navigate underneath.
  useEffect(() => {
    const onHardwareBack = (e: Event) => {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        e.preventDefault();
        document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.();
        return;
      }
      e.preventDefault();
      onBack();
    };
    const onKey = (ev: KeyboardEvent) => {
      // While the up-next overlay owns the screen, Back belongs to it (dismiss the overlay), not to
      // the player underneath — otherwise Back would blow straight past the overlay and exit.
      if (showUpNext) return;
      const kc = ev.keyCode || ev.which;
      if (kc === 4 || ev.key === 'Backspace' || ev.key === 'XF86Back' || ev.key === 'GoBack') {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        onHardwareBack(new Event('x', { cancelable: true }));
      }
    };
    window.addEventListener('plajah:hardware-back', onHardwareBack);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('plajah:hardware-back', onHardwareBack);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onBack, showUpNext]);

  // Belt and braces: never leave a fullscreen surface standing when this player goes away.
  useEffect(() => () => {
    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      try { document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.(); } catch { /* already gone */ }
    }
  }, []);

  const tvFullBleed = getPlatformInfo().isTV;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (party.isFollower) return;   // scrubbing is the host's job in a watch party
    const rect = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - rect.left) / rect.width) * duration);
  };

  const handleSaved = (updates: Partial<Video>) => {
    setVideo(v => ({ ...v, ...updates }));
  };

  // ── Render video element ─────────────────────────────────────────────────
  const renderVideo = () => {
    const url = video.url ?? '';
    const isYoutube      = url.includes('youtube.com') || url.includes('youtu.be');
    const isVimeo        = url.includes('vimeo.com');
    const isArchiveEmbed = url.includes('archive.org/embed/');

    if (isYoutube) return <div className="w-full h-full"><div id={ytContainerId.current} className="w-full h-full" /></div>;

    if (isVimeo) {
      const vid = url.split('/').pop();
      return <iframe src={`https://player.vimeo.com/video/${vid}?autoplay=1`} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />;
    }

    if (isArchiveEmbed) return <iframe src={url} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />;

    if (url.includes('archive.org') && videoError) {
      const parts = url.split('/');
      const idx = parts.indexOf('download');
      const id  = idx !== -1 ? parts[idx + 1] : '';
      return <iframe src={`https://archive.org/embed/${id}?autoplay=1`} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />;
    }

    // Mux HLS stream — native <video> + HLS.js, no web-component overlay
    if (video.muxPlaybackId && !videoError) {
      return (
        <MuxHlsVideo
          playbackId={video.muxPlaybackId}
          muted={isMuted}
          poster={video.thumbnailUrl || video.coverImageUrl || undefined}
          className="w-full h-full object-contain cursor-pointer"
          onVideoReady={el => {
            localVideoRef.current = el;
            setVideoElement(el);
            el.muted  = isMuted;
            el.volume = isMuted ? 0 : volume;
          }}
          onPlay={() => resume()}
          onPause={() => pause()}
          onError={() => setVideoError(true)}
          onEnded={handleVideoEnded}
          hasSubtitles={hasSubtitles}
        >
          <SubtitleTracks video={video} />
        </MuxHlsVideo>
      );
    }

    // Mux progressive-MP4 fallback — after Mux HLS/MSE fails, before giving up. This is the
    // path that lets Mux-only titles play on Android TV WebViews (no MSE required).
    if (video.muxPlaybackId && videoError && !muxMp4Error && !url) {
      return (
        <video
          ref={el => { setVideoElement(el); localVideoRef.current = el; }}
          src={`https://stream.mux.com/${video.muxPlaybackId}/high.mp4`}
          playsInline
          crossOrigin={hasSubtitles ? 'anonymous' : undefined}
          className="w-full h-full object-contain cursor-pointer"
          onClick={togglePlay}
          autoPlay
          muted={isMuted}
          onCanPlay={e => { const v = e.currentTarget; if (v.paused) v.play().catch(() => { v.muted = true; setIsMuted(true); v.play().catch(() => {}); }); }}
          onPlay={() => resume()}
          onPause={() => pause()}
          onError={() => { console.warn('[PlajahTV] Reello Mux MP4 fallback failed'); setMuxMp4Error(true); }}
          onEnded={handleVideoEnded}
        >
          <SubtitleTracks video={video} />
        </video>
      );
    }

    // Native video fallback — direct Firebase Storage URL or after Mux error
    if (url) {
      return (
        <video
          ref={el => { setVideoElement(el); localVideoRef.current = el; }}
          src={url}
          playsInline
          crossOrigin={hasSubtitles ? 'anonymous' : undefined}
          className="w-full h-full object-contain cursor-pointer"
          onClick={togglePlay}
          autoPlay
          muted={isMuted}
          onCanPlay={e => {
            const v = e.currentTarget;
            if (v.paused) {
              v.play().catch(() => {
                v.muted = true;
                setIsMuted(true);
                v.play().catch(() => {});
              });
            }
          }}
          onPlay={() => resume()}
          onPause={() => pause()}
          onError={() => setVideoError(true)}
          onEnded={handleVideoEnded}
        >
          <SubtitleTracks video={video} />
        </video>
      );
    }

    // No playable source yet — show processing / error state
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-white/30">
        {videoError
          ? <div className="w-10 h-10 flex items-center justify-center text-red-400 text-2xl">✕</div>
          : <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        }
        <p className="text-[10px] font-black uppercase tracking-widest">
          {videoError ? 'Unable to load video' : 'Processing video…'}
        </p>
        {/* Retry whenever there's an error — even for Mux-only videos with no url */}
        {videoError && (
          <button
            onClick={() => { setVideoError(false); setMuxMp4Error(false); }}
            className="mt-1 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
          >
            Retry
          </button>
        )}
        {!videoError && (
          <p className="text-[9px] text-white/20 text-center max-w-xs leading-relaxed px-4">
            Large videos can take 5–20 min to process. This page will update automatically when ready.
          </p>
        )}
      </div>
    );
  };

  return (
    <div ref={playerContainerRef} className="fixed inset-0 z-[200] overflow-hidden flex flex-col lg:flex-row bg-[#050505]">
      {/* TV end-of-video "up next": suggest next (relevant + random) + more from this world +
          characters. Dismisses to the Reello grid, or falls back to a plain exit if empty. */}
      {showUpNext && (
        <TvVideoUpNext
          video={video}
          onPlay={(v) => { setShowUpNext(false); if (onPlayQueued) onPlayQueued(v); else onBack(); }}
          onDismiss={() => { setShowUpNext(false); onBack(); }}
        />
      )}

      {/* Blurred thumbnail background (non-fullscreen only) */}
      {!isFullscreen && thumbnail && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${thumbnail})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(60px) brightness(0.18) saturate(1.4)',
            transform: 'scale(1.15)',
          }}
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at top center, rgba(0,0,0,0.9), transparent 35%), linear-gradient(180deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 18%, rgba(0,0,0,0.15) 42%, rgba(0,0,0,0.65) 100%)'
        }}
      />

      {/* ── LEFT: Video + Info ─────────────────────────────────────────────── */}
      <div className="relative flex-1 flex flex-col overflow-y-auto min-h-0">

        {/* Header bar */}
        <div className="relative z-10 flex items-center gap-3 px-4 pt-4 pb-2 shrink-0">
          <button
            onClick={onBack}
            className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-sm font-black uppercase tracking-widest text-white line-clamp-1 flex-1 min-w-0">{video.title}</h1>
          <div className="flex items-center gap-2 shrink-0">
            {isOwner && (
              <button
                onClick={() => setShowEditModal(true)}
                className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white/70 hover:text-white transition-all"
                title="Video Settings"
              >
                <Settings size={16} />
              </button>
            )}
            {/* Mobile: toggle comments */}
            <button
              onClick={() => setShowMobileComments(v => !v)}
              className="lg:hidden p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white/70 hover:text-white transition-all"
            >
              <MessageCircle size={16} />
            </button>
          </div>
        </div>

        {/* ── Watch-party status banner ─────────────────────────────────── */}
        {activePartyId && (
          <div className="relative z-10 mx-4 mb-2 flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-[#D40055]/30 bg-gradient-to-r from-[#6B0099]/20 to-[#D40055]/20 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <Radio size={14} className="text-[#ff5c9d] shrink-0" />
            <p className="text-[10px] font-black uppercase tracking-widest text-white flex-1 min-w-0 truncate">
              {party.isHost ? 'Hosting watch party' : `Following ${party.party?.hostName || 'the host'}`}
              <span className="text-white/50"> · </span>
              <span className="inline-flex items-center gap-1 text-white/70"><Users size={11} /> {party.viewerCount} watching</span>
              {party.isFollower && <span className="text-white/40 normal-case tracking-normal"> — synced to host</span>}
            </p>
            {party.isHost && (
              <button
                onClick={() => { const u = partyShareUrl(activePartyId); if (navigator.share) navigator.share({ title: `Watch “${video.title}” together on Plajah`, url: u }).catch(() => {}); else navigator.clipboard?.writeText(u).catch(() => {}); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[9px] font-black uppercase tracking-widest transition-all shrink-0"
              >
                <Share2 size={12} /> Invite
              </button>
            )}
            <button
              onClick={leaveWatchParty}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-[9px] font-black uppercase tracking-widest transition-all shrink-0"
            >
              {party.isHost ? 'End' : 'Leave'}
            </button>
          </div>
        )}

        {/* ── VIDEO PLAYER ──────────────────────────────────────────────── */}
        {/* On a TV the video fills the screen with layout, not with the Fullscreen API — see the
            note above the back handler.
            It has to LEAVE THE FLOW to do that. h-[100dvh] was full-height but still sat below
            this view's header bar, so the picture was merely large — pushed down the page with
            chrome above it. fixed inset-0 takes the screen outright, which is what MovieUXView
            already does for cinema and why that path looked right while this one did not. */}
        {/* The position class MUST come from one branch only. `relative` used to sit in the base
            string alongside the branch's `fixed`, and Tailwind emits `.relative` after `.fixed`,
            so `relative` won the cascade no matter how the classes were ordered here. `inset-0`
            on a relative box only sets offsets — it sizes nothing — and the TV branch carries no
            width/height of its own, while every child inside is absolutely positioned. The stage
            therefore collapsed to zero height: HLS still attached and still played AUDIO, with no
            picture anywhere. That is the "black where the video should be" report. */}
        <div
          ref={videoWrapRef}
          className={`bg-black ${tvFullBleed ? 'fixed inset-0 z-[200]' : 'relative w-full shrink-0 aspect-video'}`}
          onMouseMove={handleMouseMove}
          onClick={togglePlay}
        >
          <div className="absolute inset-0">{renderVideo()}</div>

          {/* The page's own header sits behind the takeover now, so Back needs to exist here.
              Rides the same auto-hide timer as the rest of the controls. */}
          {tvFullBleed && controlsVisible && (
            <button
              onClick={(e) => { e.stopPropagation(); onBack(); }}
              className="absolute top-6 left-6 z-10 flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/70 text-white text-[11px] font-black uppercase tracking-widest"
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}

          {/* Lore Layer — Worlds-native character chips. Silent when the video isn't tagged. */}
          <LoreLayer video={video} currentTime={currentTime} onCardToggle={setLoreCardOpen} />

          {/* What-If branching — interactive format. Silent when the video has no branch points. */}
          <WhatIfBranching
            video={video}
            currentTime={currentTime}
            onPause={() => { localVideoRef.current?.pause(); pause(); }}
            onResume={() => {
              const el = localVideoRef.current;
              if (el) el.play().then(() => resume()).catch(() => resume());
              else resume();
            }}
            onSeek={seek}
            onPlayVideo={handleBranchTo}
          />

          {/* Controls overlay */}
          <AnimatePresence>
            {controlsVisible && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 flex flex-col justify-end pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 40%)' }}
              >
                {/* Progress bar */}
                <div
                  className="mx-4 mb-2 h-1 bg-white/20 rounded-full cursor-pointer pointer-events-auto group/bar"
                  onClick={e => { e.stopPropagation(); handleSeek(e); }}
                >
                  <div
                    className="h-full bg-gradient-to-r from-[#6B0099] to-[#FF8C00] rounded-full relative"
                    style={{ width: `${progress}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/bar:opacity-100 transition-opacity shadow-lg" />
                  </div>
                </div>

                {/* Controls row */}
                <div className="flex items-center gap-3 px-4 pb-3 pointer-events-auto" onClick={e => e.stopPropagation()}>
                  <button onClick={togglePlay} className="p-2.5 text-white hover:text-white/80 transition-colors">
                    {isPlaying ? <Pause size={22} fill="white" /> : <Play size={22} fill="white" />}
                  </button>

                  <span className="text-[10px] font-black text-white/70 tabular-nums">
                    {fmt(currentTime)} / {fmt(duration)}
                  </span>

                  <div className="flex-1" />

                  {nextInQueue && (
                    <>
                      <button onClick={playNext} title="Next video" className="p-2.5 text-white hover:text-white/80 transition-colors">
                        <SkipForward size={18} />
                      </button>
                      <button onClick={() => setAutoplayNext(a => !a)} title="Toggle autoplay" className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-colors ${autoplayNext ? 'bg-[#FF8C00]/20 text-[#FF8C00]' : 'text-white/40 hover:text-white/70'}`}>
                        Auto
                      </button>
                    </>
                  )}

                  {/* CC — self-hides when the video carries no subtitle tracks */}
                  <CaptionToggle video={video} videoElRef={localVideoRef} />

                  <button onClick={() => setIsMuted(m => !m)} className="p-2.5 text-white hover:text-white/80 transition-colors">
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <button onClick={toggleFullscreen} className="p-2.5 text-white hover:text-white/80 transition-colors">
                    {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Resume-from toast */}
          <AnimatePresence>
            {resumeHint !== null && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-black/70 backdrop-blur-md rounded-full text-white pointer-events-none"
              >
                <span className="text-[9px] font-black uppercase tracking-widest">Resumed from {fmt(resumeHint)}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Up-next card (playlist autoplay) */}
          <AnimatePresence>
            {upNextIn !== null && nextInQueue && (() => {
              const nq = nextInQueue as any;
              const nthumb = nq.muxPlaybackId ? `https://image.mux.com/${nq.muxPlaybackId}/thumbnail.png?width=320&height=180&time=5` : (nq.thumbnailUrl || nq.coverImageUrl || '');
              return (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
                  className="absolute bottom-20 right-4 z-30 w-[min(16rem,90vw)] p-3 bg-black/85 backdrop-blur-md rounded-2xl border border-white/10 pointer-events-auto" onClick={e => e.stopPropagation()}>
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-2">Up next in {upNextIn}s</p>
                  <div className="flex gap-2.5 items-start">
                    <div className="w-20 aspect-video rounded-lg overflow-hidden bg-white/10 shrink-0">
                      {nthumb ? <img src={nthumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Play size={14} className="text-white/30" /></div>}
                    </div>
                    <p className="text-xs font-bold text-white line-clamp-2 flex-1">{nextInQueue.title}</p>
                  </div>
                  <div className="flex gap-2 mt-2.5">
                    <button onClick={playNext} className="flex-1 py-1.5 rounded-full bg-white text-black text-[9px] font-black uppercase tracking-widest hover:bg-[#FF8C00] hover:text-white transition-all">Play now</button>
                    <button onClick={() => setUpNextIn(null)} className="px-3 py-1.5 rounded-full bg-white/10 text-white/60 text-[9px] font-black uppercase tracking-widest hover:bg-white/20">Cancel</button>
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>

          {/* Fullscreen exit on small move */}
          {isFullscreen && !controlsVisible && (
            <button
              onClick={toggleFullscreen}
              className="absolute top-4 right-4 p-3 bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-black/70 transition-all"
            >
              <Minimize2 size={20} />
            </button>
          )}
        </div>

        {/* ── INFO BELOW VIDEO ──────────────────────────────────────────── */}
        <div className="relative z-10 flex-1 px-5 py-5 space-y-5">

          {/* Title */}
          <h2 className="text-xl font-display font-black uppercase tracking-tight leading-tight text-white">
            {video.title}
          </h2>

          {/* Stats row */}
          <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-white/30">
            <span>{fmtCount(video.playsCount || 0)} views</span>
            <span>·</span>
            <span>{video.genre || 'General'}</span>
            {video.tags?.length ? <><span>·</span><span>{video.tags.slice(0, 3).join(', ')}</span></> : null}
          </div>

          {/* "Go deeper" — self-hides when the video maps to no discipline */}
          <LearnChip tags={video.tags} text={`${video.title} ${video.genre || ''}`} />

          {/* Reprise attribution — self-hides unless this video remixes another */}
          <SourceCreditChip video={video} onOpenSource={v => handleBranchTo(v)} />
          <OriginBadge video={video} />

          {/* Channel + action buttons */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Channel */}
            {ownerProfile && (
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/10 shrink-0">
                  <img src={ownerProfile.photoURL || ''} alt={ownerProfile.displayName} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-widest text-white truncate">{ownerProfile.displayName}</p>
                  <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Creator</p>
                </div>
                {!isOwner && (
                  <button
                    onClick={handleFollowOwner}
                    disabled={followBusy}
                    className={`ml-2 px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shrink-0 disabled:opacity-60 ${
                      isFollowingOwner
                        ? 'bg-white/10 text-white border border-white/20 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30'
                        : 'bg-white text-black hover:bg-[#FF8C00] hover:text-white'
                    }`}
                  >
                    {isFollowingOwner ? 'Following' : 'Follow'}
                  </button>
                )}
                <PlajahPlusButton
                  creatorId={video.ownerId}
                  creatorName={ownerProfile.displayName}
                  isOwnProfile={isOwner}
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleLike}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full border font-black text-[9px] uppercase tracking-widest transition-all ${isLiked ? 'bg-red-500/15 border-red-500/40 text-red-400' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white'}`}
              >
                <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} />
                {fmtCount(video.likesCount || 0)}
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white font-black text-[9px] uppercase tracking-widest transition-all"
              >
                <Share2 size={15} /> Share
              </button>
              {/* Watch Party — host a synchronized session others follow. Hidden while already in one
                  (the status banner over the video handles host/follower state + leave). */}
              {!activePartyId && (
                <button
                  onClick={() => auth.currentUser ? startWatchParty() : alert('Sign in to host a watch party.')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#D40055]/30 bg-[#D40055]/10 text-[#ff5c9d] hover:bg-[#D40055]/20 font-black text-[9px] uppercase tracking-widest transition-all"
                >
                  <Users size={15} /> Watch Party
                </button>
              )}
              <button
                onClick={() => auth.currentUser ? setShowSaveModal(true) : alert('Sign in to save videos to a playlist.')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white font-black text-[9px] uppercase tracking-widest transition-all"
              >
                <Bookmark size={15} /> Save
              </button>
              <WatchLaterButton video={video} variant="pill" />
              {/* Reprise — self-hides unless the source is licensed for derivatives */}
              <RepriseButton
                video={video}
                duration={duration}
                currentTime={currentTime}
                ownerName={ownerProfile?.displayName}
                onPause={() => { localVideoRef.current?.pause(); pause(); }}
                variant="pill"
              />
              <button className="p-2.5 rounded-full border border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white transition-all">
                <MoreVertical size={15} />
              </button>
            </div>
          </div>

          {/* Description (expandable) */}
          {video.description && (
            <div className="bg-white/[0.04] rounded-2xl p-5 border border-white/5">
              <p className={`text-sm text-white/60 leading-relaxed ${descExpanded ? '' : 'line-clamp-3'}`}>
                {video.description}
              </p>
              <button
                onClick={() => setDescExpanded(v => !v)}
                className="mt-3 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
              >
                {descExpanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show more</>}
              </button>
            </div>
          )}

          {/* Comments on mobile */}
          <div className="lg:hidden">
            <button
              onClick={() => setShowMobileComments(v => !v)}
              className="w-full flex items-center justify-between p-4 bg-white/[0.04] rounded-2xl border border-white/5"
            >
              <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                <MessageCircle size={14} className="text-white/40" /> {comments.length} Comments
              </span>
              {showMobileComments ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
            </button>
            <AnimatePresence>
              {showMobileComments && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 bg-white/[0.03] rounded-2xl border border-white/5 overflow-hidden" style={{ maxHeight: 500 }}>
                    <CommentSection
                      comments={comments}
                      onPostComment={(text, parentId) => postVideoComment(video.id, text, parentId)}
                      currentUser={currentUser}
                      title="Comments"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Sidebar (desktop comments) ─────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-[400px] shrink-0 border-l border-white/10 relative z-10">
        {/* Sidebar header */}
        <div className="px-6 py-5 border-b border-white/5 shrink-0">
          <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <MessageCircle size={15} className="text-white/30" />
            Comments
            <span className="text-white/20 ml-1">{comments.length}</span>
          </h3>
        </div>
        <div className="flex-1 overflow-hidden">
          <CommentSection
            comments={comments}
            onPostComment={(text, parentId) => postVideoComment(video.id, text, parentId)}
            currentUser={currentUser}
            title=""
          />
        </div>
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {showEditModal && (
          <VideoEditModal
            video={video}
            onClose={() => setShowEditModal(false)}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>

      {/* Save to playlist */}
      {showSaveModal && <AddToPlaylistModal video={video} onClose={() => setShowSaveModal(false)} />}
    </div>
  );
};

export default VideoPlayer;
