import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserAvatar } from './avatar/UserAvatar';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight, ExternalLink, Trash2, Eye, Star, Users } from 'lucide-react';
import { Story } from '../types';
import { markStoryViewed, deleteStory } from '../services/backendService';
import { fetchStoryViewers } from '../services/storyAudience';
import { fetchProfilesLite } from '../services/socialSafetyService';

interface StoryGroup {
  uid: string;
  name: string;
  photo?: string;
  stories: Story[];
  hasUnviewed: boolean;
}

interface Props {
  group: StoryGroup;
  currentUserId: string;
  onClose: () => void;
  onVisitUser?: (uid: string) => void;
}

const PHOTO_DURATION = 5000;

const StoryViewer: React.FC<Props> = ({ group, currentUserId, onClose, onVisitUser }) => {
  const [idx, setIdx]               = useState(0);
  const [progress, setProgress]     = useState(0);
  const [paused, setPaused]         = useState(false);
  const intervalRef                  = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef                     = useRef<HTMLVideoElement>(null);
  const story                        = group.stories[idx];
  const isOwner                      = story?.ownerId === currentUserId;
  const duration                     = story?.mediaType === 'VIDEO' ? undefined : (story?.photoDisplayDuration ?? 5) * 1000;

  const advance = useCallback(() => {
    if (idx < group.stories.length - 1) { setIdx(i => i + 1); setProgress(0); }
    else onClose();
  }, [idx, group.stories.length, onClose]);

  // Mark viewed (owner-private receipt — other viewers never see who watched)
  useEffect(() => {
    if (story && !isOwner) markStoryViewed(story);
  }, [story?.id]);

  // Owner: who watched this story
  const [viewers, setViewers] = useState<Array<{ uid: string; displayName: string; photoURL: string }> | null>(null);
  const [showViewers, setShowViewers] = useState(false);
  useEffect(() => {
    setViewers(null); setShowViewers(false);
    if (!story || !isOwner) return;
    let alive = true;
    fetchStoryViewers(story.id)
      .then(v => fetchProfilesLite(v.map(x => x.uid)))
      .then(p => { if (alive) setViewers(p); })
      .catch(() => { if (alive) setViewers([]); });
    return () => { alive = false; };
  }, [story?.id, isOwner]);

  // Progress timer for photos
  useEffect(() => {
    if (!story || story.mediaType === 'VIDEO' || paused) return;
    const tick = 50;
    intervalRef.current = setInterval(() => {
      setProgress(p => {
        const next = p + (tick / PHOTO_DURATION) * 100;
        if (next >= 100) { clearInterval(intervalRef.current!); advance(); return 100; }
        return next;
      });
    }, tick);
    return () => clearInterval(intervalRef.current!);
  }, [story?.id, paused, advance]);

  // Video ended â†’ advance
  const onVideoEnded = () => advance();

  if (!story) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black"
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
    >
      {/* Story card */}
      <div className="relative w-full max-w-sm h-full max-h-[100dvh] flex flex-col overflow-hidden">
        {/* Progress bars */}
        <div className="absolute top-0 inset-x-0 z-10 flex gap-1 p-2 pt-3">
          {group.stories.map((_, i) => (
            <div key={i} className="flex-1 h-[2px] bg-white/25 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-none"
                style={{ width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-6 inset-x-0 z-10 flex items-center justify-between px-4 pt-2">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { onVisitUser?.(group.uid); onClose(); }}>
            {group.photo
              ? <UserAvatar uid={group.uid} loading="lazy" decoding="async" src={group.photo} className="w-8 h-8 rounded-full object-cover ring-1 ring-white/30" alt="" />
              : <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-black text-sm">{group.name[0]}</div>
            }
            <div>
              <p className="text-white font-black text-xs uppercase tracking-wide drop-shadow">{group.name}</p>
              <p className="text-white/50 text-[9px] font-bold flex items-center gap-1.5">
                {new Date(story.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {story.audience === 'CLOSE_FRIENDS' && <span className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full bg-green-500 text-black"><Star size={8} fill="currentColor" /> Close Friends</span>}
                {isOwner && story.audience === 'FOLLOWERS' && <span className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full bg-white/15 text-white/80"><Users size={8} /> Followers</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <button className="text-white/60 hover:text-red-400 p-1.5" onClick={async () => { await deleteStory(story.id); advance(); }}>
                <Trash2 size={16} />
              </button>
            )}
            <button className="text-white/60 hover:text-white p-1.5" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {/* Media */}
        <div className="flex-1 relative overflow-hidden">
          {story.backgroundColor && (
            <div className="absolute inset-0" style={{ background: story.backgroundColor }} />
          )}
          {story.mediaType === 'VIDEO' ? (
            <video
              ref={videoRef}
              src={story.mediaUrl}
              autoPlay
              playsInline
              onEnded={onVideoEnded}
              className="w-full h-full object-cover"
            />
          ) : (
            <img loading="lazy" decoding="async" src={story.mediaUrl} alt="" className="w-full h-full object-cover" draggable={false} />
          )}

          {/* Dim overlay when paused */}
          {paused && <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />}

          {/* Tap zones */}
          <button
            className="absolute left-0 top-0 w-1/3 h-full"
            onPointerDown={e => { e.stopPropagation(); setPaused(false); }}
            onClick={() => { if (idx > 0) { setIdx(i => i - 1); setProgress(0); } }}
          />
          <button
            className="absolute right-0 top-0 w-1/3 h-full"
            onPointerDown={e => { e.stopPropagation(); setPaused(false); }}
            onClick={() => advance()}
          />
        </div>

        {/* Caption + footer */}
        {(story.caption || story.link) && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-6 pt-16">
            {story.caption && <p className="text-white text-sm leading-relaxed drop-shadow">{story.caption}</p>}
            {story.link && (
              <a href={story.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-2 text-small-orange text-xs font-black uppercase tracking-widest">
                <ExternalLink size={12} /> {story.link}
              </a>
            )}
          </div>
        )}

        {/* Viewers — owner only */}
        {isOwner && (
          <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
            {showViewers && viewers && viewers.length > 0 && (
              <div className="max-h-56 w-56 overflow-y-auto rounded-2xl bg-black/80 backdrop-blur border border-white/10 p-2 space-y-1">
                {viewers.map(v => (
                  <div key={v.uid} className="flex items-center gap-2 px-2 py-1.5">
                    {v.photoURL ? <UserAvatar uid={v.uid} src={v.photoURL} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center text-[10px] font-black">{(v.displayName || '?')[0]}</div>}
                    <span className="text-white text-xs truncate">{v.displayName || 'Someone'}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => { setShowViewers(s => !s); setPaused(p => !p); }} className="flex items-center gap-1 text-white/60 hover:text-white text-[10px] font-black" aria-label="Who viewed this story">
              <Eye size={12} /> {viewers ? viewers.length : '…'}
            </button>
          </div>
        )}
      </div>

      {/* Prev / Next chevrons for desktop */}
      <button className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-2" onClick={() => { if (idx > 0) { setIdx(i => i - 1); setProgress(0); } else onClose(); }}>
        <ChevronLeft size={32} />
      </button>
      <button className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-2" onClick={advance}>
        <ChevronRight size={32} />
      </button>
    </motion.div>
  );
};

export default StoryViewer;
