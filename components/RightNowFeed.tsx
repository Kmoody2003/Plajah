import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import {
  Music2, Play, Radio, Video as VideoIcon, Users, Zap,
  ChevronRight, Share2, HeartHandshake, Eye, Signal,
} from 'lucide-react';
import { NowActiveEntry, UserProfile, Track, Album, Video } from '../types';
import { writePresence, clearPresence, listenToFollowedPresence, listenToMyPresence } from '../services/presenceService';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { updateUserProfile } from '../services/backendService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RightNowFeedProps {
  currentUser: UserProfile | null;
  followingUids: string[];
  onVisitUser: (uid: string) => void;
  onSelectAlbum?: (album: Album) => void;
  onSelectVideo?: (video: Video) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const timeAgo = (ms: number) => {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
};

const TYPE_META: Record<NowActiveEntry['type'], { icon: React.ElementType; label: string; color: string }> = {
  TRACK: { icon: Music2,    label: 'Listening',  color: '#a78bfa' },
  VIDEO: { icon: VideoIcon, label: 'Watching',   color: '#60a5fa' },
  RADIO: { icon: Radio,     label: 'On Radio',   color: '#34d399' },
  LIVE:  { icon: Signal,    label: 'Live',       color: '#f87171' },
};

// ── Presence Sync — mounts at app level, zero UI ─────────────────────────────
// Drop <PresenceSync currentUser={...} /> anywhere inside GlobalPlayerProvider.

export const PresenceSync: React.FC<{ currentUser: UserProfile | null }> = ({ currentUser }) => {
  const { currentTrack, currentAlbum, currentVideo, isPlaying } = useGlobalPlayerState();
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser?.uid || !currentUser.presenceEnabled) return;

    if (!isPlaying) {
      if (lastWrittenRef.current) {
        clearPresence(currentUser.uid);
        lastWrittenRef.current = null;
      }
      return;
    }

    let key = '';
    let entry: Omit<NowActiveEntry, 'uid' | 'startedAt' | 'expiresAt'> | null = null;

    if (currentTrack) {
      key = `track-${currentTrack.id}`;
      if (key === lastWrittenRef.current) return;
      entry = {
        type: 'TRACK',
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL,
        trackId: currentTrack.id,
        trackTitle: currentTrack.title,
        trackArtist: currentTrack.artist,
        albumId: currentAlbum?.id,
        albumTitle: currentAlbum?.title,
        albumCover: currentAlbum?.coverImage ?? currentTrack.albumCover,
        creatorUid: currentTrack.artistId ?? currentAlbum?.artist,
        creatorName: currentTrack.artist,
      };
    } else if (currentVideo) {
      key = `video-${currentVideo.id}`;
      if (key === lastWrittenRef.current) return;
      entry = {
        type: 'VIDEO',
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL,
        videoId: currentVideo.id,
        videoTitle: currentVideo.title,
        videoThumbnail: currentVideo.thumbnailUrl,
        creatorUid: currentVideo.ownerId,
      };
    }

    if (entry && key !== lastWrittenRef.current) {
      writePresence(currentUser.uid, entry);
      lastWrittenRef.current = key;
    }
  }, [currentUser?.uid, currentUser?.presenceEnabled, currentUser?.displayName, currentUser?.photoURL,
      isPlaying, currentTrack?.id, currentVideo?.id]);

  // Clear on unmount
  useEffect(() => {
    return () => {
      if (currentUser?.uid) clearPresence(currentUser.uid);
    };
  }, [currentUser?.uid]);

  return null;
};

// ── Now Indicator — green pulse + friend count ────────────────────────────────

interface NowIndicatorProps {
  count: number;
  names?: string[];
  size?: 'sm' | 'md';
}

export const NowIndicator: React.FC<NowIndicatorProps> = ({ count, names, size = 'sm' }) => {
  if (count === 0) return null;
  const dot = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  return (
    <div className="flex items-center gap-1.5">
      <span className={`relative flex ${dot}`}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className={`relative inline-flex rounded-full ${dot} bg-green-400`} />
      </span>
      <span className="text-[8px] font-black uppercase tracking-widest text-green-400">
        {count === 1
          ? names?.[0] ? `${names[0]} here` : '1 here now'
          : `${count} here now`}
      </span>
    </div>
  );
};

// ── Activity Card ─────────────────────────────────────────────────────────────

const ActivityCard: React.FC<{
  entry: NowActiveEntry;
  onVisitUser: (uid: string) => void;
  onJoin?: () => void;
  onShare?: () => void;
  index: number;
}> = ({ entry, onVisitUser, onJoin, onShare, index }) => {
  const meta = TYPE_META[entry.type];
  const Icon = meta.icon as any;

  const artwork = entry.albumCover ?? entry.videoThumbnail;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex items-stretch gap-0 bg-white/[0.04] border border-white/8 rounded-3xl overflow-hidden hover:border-white/16 hover:bg-white/[0.06] transition-all"
    >
      {/* Artwork strip */}
      {artwork ? (
        <div className="relative w-24 shrink-0 overflow-hidden">
          <img src={artwork} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#080808]/60" />
        </div>
      ) : (
        <div className="w-16 shrink-0 flex items-center justify-center" style={{ background: `${meta.color}15` }}>
          <Icon size={22} style={{ color: meta.color }} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 p-4 flex flex-col justify-between">
        <div>
          {/* User row */}
          <button
            onClick={() => onVisitUser(entry.uid)}
            className="flex items-center gap-2 mb-2 group/user"
          >
            <div className="relative">
              <img src={entry.photoURL} alt={entry.displayName}
                className="w-6 h-6 rounded-full object-cover border border-white/10" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black flex items-center justify-center"
                style={{ background: meta.color }}>
                <Icon size={7} className="text-black" />
              </span>
            </div>
            <span className="text-[10px] font-black text-white/60 group-hover/user:text-white transition-colors">
              {entry.displayName}
            </span>
            <span className="text-[9px] text-white/25 uppercase tracking-widest">{meta.label}</span>
          </button>

          {/* Content title */}
          {entry.type === 'TRACK' && (
            <div>
              <p className="text-sm font-black text-white leading-tight truncate">{entry.trackTitle}</p>
              <p className="text-[10px] text-white/40 mt-0.5 truncate">{entry.trackArtist}{entry.albumTitle ? ` · ${entry.albumTitle}` : ''}</p>
            </div>
          )}
          {entry.type === 'VIDEO' && (
            <p className="text-sm font-black text-white leading-tight truncate">{entry.videoTitle}</p>
          )}
          {entry.type === 'RADIO' && (
            <p className="text-sm font-black text-white">Radio Station</p>
          )}
          {entry.type === 'LIVE' && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <p className="text-sm font-black text-red-400">LIVE</p>
            </div>
          )}
        </div>

        {/* Footer: time + actions */}
        <div className="flex items-center justify-between mt-3">
          <span className="text-[8px] text-white/20 uppercase tracking-widest">{timeAgo(entry.startedAt)}</span>
          <div className="flex items-center gap-1.5">
            {onShare && (
              <button onClick={onShare}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-white/30 hover:text-white">
                <Share2 size={11} />
              </button>
            )}
            {onJoin && (
              <button onClick={onJoin}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-black hover:brightness-110 transition-all"
                style={{ background: meta.color }}>
                <Play size={9} /> Join
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ── Right Now Feed ────────────────────────────────────────────────────────────

const RightNowFeed: React.FC<RightNowFeedProps> = ({
  currentUser, followingUids, onVisitUser, onSelectAlbum, onSelectVideo,
}) => {
  const [entries, setEntries] = useState<NowActiveEntry[]>([]);
  const [myEntry, setMyEntry] = useState<NowActiveEntry | null>(null);
  const [presenceEnabled, setPresenceEnabled] = useState(currentUser?.presenceEnabled ?? true);
  const [sharing, setSharing] = useState<string | null>(null);

  // Listen to my own presence
  useEffect(() => {
    if (!currentUser?.uid) return;
    return listenToMyPresence(currentUser.uid, setMyEntry);
  }, [currentUser?.uid]);

  // Listen to followed users' presence
  useEffect(() => {
    if (followingUids.length === 0) { setEntries([]); return; }
    return listenToFollowedPresence(followingUids, setEntries);
  }, [followingUids.join(',')]);

  const handlePresenceToggle = async (enabled: boolean) => {
    setPresenceEnabled(enabled);
    if (!currentUser?.uid) return;
    await updateUserProfile(currentUser.uid, { presenceEnabled: enabled });
    if (!enabled) clearPresence(currentUser.uid);
  };

  const handleShare = useCallback((entry: NowActiveEntry) => {
    const text = entry.type === 'TRACK'
      ? `I'm listening to "${entry.trackTitle}" by ${entry.trackArtist} on Plajah right now 🎵`
      : `I'm watching "${entry.videoTitle}" on Plajah right now 🎬`;
    if (navigator.share) {
      navigator.share({ text, url: window.location.href });
    } else {
      navigator.clipboard.writeText(text);
      setSharing(entry.uid);
      setTimeout(() => setSharing(null), 2000);
    }
  }, []);

  const handleJoin = useCallback((entry: NowActiveEntry) => {
    if (entry.type === 'TRACK' && entry.albumId && onSelectAlbum) {
      onSelectAlbum({ id: entry.albumId, title: entry.albumTitle ?? '', coverImage: entry.albumCover ?? '' } as Album);
    } else if (entry.type === 'VIDEO' && entry.videoId && onSelectVideo) {
      onSelectVideo({ id: entry.videoId, title: entry.videoTitle ?? '' } as Video);
    }
  }, [onSelectAlbum, onSelectVideo]);

  const activeCount = entries.length;

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex w-2.5 h-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-green-400" />
            </span>
            <h2 className="text-2xl font-black uppercase tracking-tight text-white">Right Now</h2>
          </div>
          <p className="text-[10px] text-white/30 uppercase tracking-widest">
            {activeCount > 0
              ? `${activeCount} ${activeCount === 1 ? 'person' : 'people'} you follow ${activeCount === 1 ? 'is' : 'are'} active`
              : 'No one in your network is active right now'}
          </p>
        </div>

        {/* My presence toggle */}
        <div className="flex flex-col items-end gap-1.5">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Share my activity</p>
          <button
            onClick={() => handlePresenceToggle(!presenceEnabled)}
            className={`relative w-10 h-5 rounded-full border transition-all ${presenceEnabled ? 'bg-green-500 border-green-500' : 'bg-white/10 border-white/20'}`}
          >
            <motion.div
              animate={{ x: presenceEnabled ? 20 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
            />
          </button>
          {myEntry && presenceEnabled && (
            <p className="text-[8px] text-green-400 uppercase tracking-widest">
              {myEntry.type === 'TRACK' ? `▶ ${myEntry.trackTitle?.slice(0, 20)}…` : '▶ Watching'}
            </p>
          )}
        </div>
      </div>

      {/* My activity card (if active + sharing enabled) */}
      {myEntry && presenceEnabled && (
        <div className="p-4 border border-green-500/25 bg-green-500/5 rounded-2xl">
          <p className="text-[8px] font-black uppercase tracking-widest text-green-400 mb-2">You · Right now</p>
          <div className="flex items-center gap-3">
            {(myEntry.albumCover || myEntry.videoThumbnail) && (
              <img src={myEntry.albumCover ?? myEntry.videoThumbnail} alt=""
                className="w-10 h-10 rounded-xl object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white truncate">
                {myEntry.trackTitle ?? myEntry.videoTitle ?? 'Active'}
              </p>
              {myEntry.trackArtist && <p className="text-[9px] text-white/40 truncate">{myEntry.trackArtist}</p>}
            </div>
            <button
              onClick={() => handleShare(myEntry)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 border border-white/15 rounded-xl text-[9px] font-black uppercase text-white/60 hover:text-white hover:border-white/30 transition-all"
            >
              {sharing === currentUser?.uid ? '✓ Copied' : <><Share2 size={10} /> Share</>}
            </button>
          </div>
        </div>
      )}

      {/* Feed */}
      <AnimatePresence mode="popLayout">
        {entries.map((entry, i) => (
          <ActivityCard
            key={entry.uid}
            entry={entry}
            index={i}
            onVisitUser={onVisitUser}
            onJoin={(entry.albumId || entry.videoId) ? () => handleJoin(entry) : undefined}
            onShare={() => handleShare(entry)}
          />
        ))}
      </AnimatePresence>

      {/* Empty state */}
      {entries.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="py-16 text-center space-y-4"
        >
          <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto">
            <HeartHandshake size={24} className="text-white/20" />
          </div>
          <div>
            <p className="text-sm font-black text-white/30">Nobody in your network is active right now</p>
            <p className="text-[10px] text-white/15 mt-1">
              {followingUids.length === 0
                ? 'Follow creators to see what they\'re experiencing in real time.'
                : 'Check back when people you follow are listening or watching.'}
            </p>
          </div>
          {presenceEnabled && myEntry && (
            <p className="text-[10px] text-green-400/60">Your activity is being shared — your followers can see you here.</p>
          )}
        </motion.div>
      )}

      {/* Footer tip */}
      {entries.length > 0 && (
        <p className="text-[8px] text-white/15 text-center uppercase tracking-widest pt-2">
          Join any session with one tap · Activity clears automatically after you stop
        </p>
      )}
    </div>
  );
};

export { RightNowFeed };
export default RightNowFeed;
