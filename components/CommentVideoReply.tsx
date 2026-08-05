/**
 * CommentVideoReply — Blueprint Part 1B.5, the UI half.
 *
 * Two pieces, both self-contained so they can be dropped into whatever renders
 * `VideoComment`s (VideoPlayer's comment list, a comment sheet, a shorts overlay):
 *
 *   <CommentVideoReplyButton .../>  — owner-only "Answer with a video" affordance
 *   <CommentVideoReplyEmbed  .../>  — the threaded short, rendered under the comment
 *
 * `CommentVideoReply` bundles both in the usual order (embed, then affordance) and is
 * the one-liner for a host that just wants the feature:
 *
 *   <CommentVideoReply comment={c} videoId={video.id} videoOwnerId={video.ownerId} />
 *
 * Everything degrades silently: no signed-in owner → no button; a `replyVideoId`
 * pointing at a deleted video → nothing renders.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Video as VideoIcon, Play, X as XIcon, Loader2, CornerDownRight, Check, Link2Off } from 'lucide-react';
import type { Video, VideoComment } from '../types';
import { auth } from '../services/firebase';
import {
  attachReplyVideo,
  clearReplyVideo,
  fetchReplyVideo,
  fetchReplyCandidates,
} from '../services/videoReplies';
import Portal from './Portal';

function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── the threaded short, inline under the comment ─────────────────────────────

export interface CommentVideoReplyEmbedProps {
  comment: Pick<VideoComment, 'id' | 'replyVideoId'>;
  /** Open the short in the host's player. Falls back to an inline <video> when absent. */
  onOpenVideo?: (video: Video) => void;
  /** Shown to the owner so they can unthread. */
  canManage?: boolean;
  onClear?: () => void;
  className?: string;
}

export const CommentVideoReplyEmbed: React.FC<CommentVideoReplyEmbedProps> = ({
  comment, onOpenVideo, canManage = false, onClear, className = '',
}) => {
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!comment?.replyVideoId) { setVideo(null); return; }
    setLoading(true);
    fetchReplyVideo(comment)
      .then(v => { if (!cancelled) setVideo(v); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [comment?.replyVideoId]);

  if (!comment?.replyVideoId) return null;

  if (loading) {
    return (
      <div className={`mt-2 ml-3 flex items-center gap-2 ${className}`}>
        <Loader2 size={12} className="text-white/20 animate-spin" />
        <span className="text-[9px] font-black uppercase tracking-widest text-white/20">Loading reply</span>
      </div>
    );
  }

  // Deleted or unreadable target — degrade to nothing rather than a broken card.
  if (!video) return null;

  const poster = video.thumbnailUrl || video.coverImageUrl;
  const playable = video.url && !video.embedUrl;

  return (
    <div className={`mt-2 ml-3 pl-3 border-l-2 border-small-orange/30 ${className}`}>
      <p className="text-[8px] font-black uppercase tracking-[0.3em] text-small-orange/70 flex items-center gap-1.5 mb-1.5">
        <CornerDownRight size={9} />
        Creator answered with a video
      </p>

      <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-black max-w-[280px] group">
        {playing && playable ? (
          <video
            src={video.url}
            poster={poster || undefined}
            controls
            autoPlay
            playsInline
            className="w-full aspect-video object-cover bg-black"
          />
        ) : (
          <button
            onClick={() => (onOpenVideo ? onOpenVideo(video) : setPlaying(true))}
            className="relative block w-full aspect-video"
          >
            {poster ? (
              <img
                src={poster}
                alt={video.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 bg-white/[0.04]" />
            )}
            <div className="absolute inset-0 bg-black/35 group-hover:bg-black/20 transition-colors" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-11 h-11 rounded-full bg-white/10 border border-white/25 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                <Play size={15} fill="currentColor" className="text-white ml-0.5" />
              </div>
            </div>
            {!!video.duration && (
              <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[9px] font-black text-white/90 tabular-nums">
                {formatDuration(video.duration)}
              </span>
            )}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-1.5 max-w-[280px]">
        <p className="text-[10px] font-bold text-white/55 truncate flex-1">{video.title}</p>
        {canManage && onClear && (
          <button
            onClick={onClear}
            className="flex-shrink-0 p-1 rounded-full text-white/20 hover:text-red-400 hover:bg-white/5 transition-all"
            title="Remove video reply"
          >
            <Link2Off size={11} />
          </button>
        )}
      </div>
    </div>
  );
};

// ── the picker ───────────────────────────────────────────────────────────────

const ReplyPicker: React.FC<{
  excludeVideoId?: string;
  onPick: (v: Video) => void;
  onClose: () => void;
  saving: boolean;
}> = ({ excludeVideoId, onPick, onClose, saving }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchReplyCandidates(excludeVideoId)
      .then(v => { if (!cancelled) setVideos(v); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [excludeVideoId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Portal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 340, damping: 32 }}
          className="w-full max-w-lg max-h-[80vh] rounded-3xl border border-white/10 bg-[#0b0b0d] overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.06]">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/25">Reply with video</p>
              <h3 className="text-[15px] font-black text-white leading-tight mt-1">Pick a short</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
              aria-label="Close"
            >
              <XIcon size={15} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <Loader2 size={20} className="text-white/25 animate-spin" />
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20">Loading your videos</p>
              </div>
            ) : videos.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center mx-auto mb-4">
                  <VideoIcon size={20} className="text-white/20" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/25">No videos yet</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/15 mt-2">
                  Upload a short to answer with it
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {videos.map(v => (
                  <button
                    key={v.id}
                    disabled={saving}
                    onClick={() => onPick(v)}
                    className="w-full flex items-center gap-3 p-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-left transition-all hover:border-white/[0.14] hover:bg-white/[0.05] disabled:opacity-40"
                  >
                    <div className="relative w-24 aspect-video rounded-xl overflow-hidden bg-black flex-shrink-0">
                      {(v.thumbnailUrl || v.coverImageUrl) ? (
                        <img
                          src={v.thumbnailUrl || v.coverImageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-white/[0.04] flex items-center justify-center">
                          <VideoIcon size={14} className="text-white/20" />
                        </div>
                      )}
                      {!!v.duration && (
                        <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/75 text-[8px] font-black text-white/90 tabular-nums">
                          {formatDuration(v.duration)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-white truncate">{v.title}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/25 mt-0.5">
                        {v.timestamp ? new Date(v.timestamp).toLocaleDateString() : 'Draft'}
                      </p>
                    </div>
                    <Check size={14} className="text-white/15 flex-shrink-0 mr-1" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
};

// ── the affordance ───────────────────────────────────────────────────────────

export interface CommentVideoReplyButtonProps {
  comment: Pick<VideoComment, 'id' | 'replyVideoId'>;
  /** The video the comment lives on. */
  videoId: string;
  /** Owner of that video — the button only renders for them. */
  videoOwnerId?: string;
  /** Fired after a successful attach so the host can refresh its comment list. */
  onAttached?: (replyVideoId: string) => void;
  className?: string;
}

export const CommentVideoReplyButton: React.FC<CommentVideoReplyButtonProps> = ({
  comment, videoId, videoOwnerId, onAttached, className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const uid = auth.currentUser?.uid;

  // Owner-only. No owner id supplied → assume not the owner and render nothing.
  const isOwner = !!uid && !!videoOwnerId && uid === videoOwnerId;

  const handlePick = useCallback(async (v: Video) => {
    setSaving(true);
    const ok = await attachReplyVideo(videoId, comment.id, v.id);
    setSaving(false);
    if (ok) { setOpen(false); onAttached?.(v.id); }
  }, [videoId, comment.id, onAttached]);

  if (!isOwner || comment.replyVideoId) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white/35 hover:text-small-orange hover:bg-small-orange/10 transition-all ${className}`}
        title="Answer this comment with one of your videos"
      >
        <VideoIcon size={10} />
        Reply with video
      </button>
      <AnimatePresence>
        {open && (
          <ReplyPicker
            excludeVideoId={videoId}
            onPick={handlePick}
            onClose={() => setOpen(false)}
            saving={saving}
          />
        )}
      </AnimatePresence>
    </>
  );
};

// ── bundled default ──────────────────────────────────────────────────────────

export interface CommentVideoReplyProps {
  comment: VideoComment;
  videoId: string;
  videoOwnerId?: string;
  onOpenVideo?: (video: Video) => void;
  /** Host refresh hook — fired after attach or clear. */
  onChanged?: () => void;
}

/** Embed + affordance together. The drop-in for a comment row. */
const CommentVideoReply: React.FC<CommentVideoReplyProps> = ({
  comment, videoId, videoOwnerId, onOpenVideo, onChanged,
}) => {
  const uid = auth.currentUser?.uid;
  const isOwner = !!uid && !!videoOwnerId && uid === videoOwnerId;
  // Local override so the UI reacts immediately even when the host list is not realtime.
  const [replyVideoId, setReplyVideoId] = useState<string | undefined>(comment.replyVideoId);
  useEffect(() => { setReplyVideoId(comment.replyVideoId); }, [comment.replyVideoId]);

  const handleClear = useCallback(async () => {
    const ok = await clearReplyVideo(videoId, comment.id);
    if (ok) { setReplyVideoId(undefined); onChanged?.(); }
  }, [videoId, comment.id, onChanged]);

  return (
    <>
      <CommentVideoReplyEmbed
        comment={{ id: comment.id, replyVideoId }}
        onOpenVideo={onOpenVideo}
        canManage={isOwner}
        onClear={handleClear}
      />
      <CommentVideoReplyButton
        comment={{ id: comment.id, replyVideoId }}
        videoId={videoId}
        videoOwnerId={videoOwnerId}
        onAttached={id => { setReplyVideoId(id); onChanged?.(); }}
      />
    </>
  );
};

export default CommentVideoReply;
