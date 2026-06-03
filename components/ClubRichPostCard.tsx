import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart, Pin, Trash2, MessageSquare, Volume2, Play, Pause,
  Globe, Music2, Video as VideoIcon, Link2, Maximize2,
  Share2, Check, Copy, X as XIcon,
} from 'lucide-react';
import ThreeDImage from './ThreeDImage';
import { ClubPost, ClubRole } from '../types';
import { formatDistanceToNow } from 'date-fns';
import CommentSection from './CommentSection';
import { subscribeToClubPostComments, addClubPostComment, auth } from '../services/backendService';

// ─── Role colours ─────────────────────────────────────────────────────────────

const ROLE_COLORS: Partial<Record<ClubRole, string>> = {
  OWNER: 'text-amber-400',
  ADMIN: 'text-violet-400',
  MODERATOR: 'text-blue-400',
  WRITER: 'text-green-400',
};

// ─── Asset embed card ─────────────────────────────────────────────────────────

const AssetEmbed: React.FC<{ att: { type: string; url: string; title?: string; thumbnailUrl?: string; assetId?: string; description?: string } }> = ({ att }) => {
  const icons: Record<string, React.ReactNode> = {
    ALBUM: <Music2 size={14} className="text-small-orange" />,
    WORLD: <Globe size={14} className="text-violet-400" />,
    VIDEO: <VideoIcon size={14} className="text-blue-400" />,
    CHARACTER: <span className="text-xs">✦</span>,
    ARTICLE: <span className="text-xs">📰</span>,
    TRACK: <Music2 size={14} className="text-emerald-400" />,
    PLAYLIST: <Music2 size={14} className="text-pink-400" />,
    MODULE: <span className="text-xs">📚</span>,
    LINK: <Link2 size={14} className="text-white/40" />,
  };

  return (
    <div className="flex items-center gap-3 bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 hover:bg-white/[0.07] transition-all cursor-pointer">
      {att.thumbnailUrl ? (
        <img src={att.thumbnailUrl} className="w-10 h-10 rounded-xl object-cover shrink-0" loading="lazy" alt="" />
      ) : (
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
          {icons[att.type] ?? <Link2 size={14} className="text-white/40" />}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-[7px] font-black uppercase tracking-widest text-white/30 block mb-0.5">{att.type}</span>
        <p className="text-[11px] font-black uppercase tracking-wide truncate">{att.title || 'Untitled'}</p>
        {att.description && <p className="text-[9px] text-white/30 truncate">{att.description}</p>}
      </div>
    </div>
  );
};

// ─── Media renderer ───────────────────────────────────────────────────────────

const MEDIA_TYPES = new Set(['PHOTO', 'VIDEO', 'AUDIO', 'GIF']);
const EMBED_TYPES = new Set(['ALBUM', 'WORLD', 'CHARACTER', 'ARTICLE', 'TRACK', 'PLAYLIST', 'MODULE', 'VIDEO', 'LINK']);

const MediaBlock: React.FC<{
  att: ClubPost['attachments'] extends (infer T)[] | undefined ? NonNullable<T> : never;
  onExpand?: () => void;
}> = ({ att, onExpand }) => {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggleVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  if (att.type === 'PHOTO' || att.type === 'GIF') {
    return (
      <div className="cursor-pointer" onClick={onExpand}>
        <ThreeDImage
          src={att.url}
          alt={att.title || 'Photo'}
          className="w-full h-auto max-h-[600px] object-cover"
          containerClassName="rounded-3xl overflow-hidden border border-white/10 bg-white/5 shadow-2xl"
        />
      </div>
    );
  }

  if (att.type === 'VIDEO') {
    return (
      <div className="rounded-3xl overflow-hidden border border-white/10 bg-black relative group aspect-video cursor-pointer"
        onClick={toggleVideo}>
        <video
          ref={videoRef}
          src={att.url}
          preload="metadata"
          playsInline
          className="w-full h-full object-contain"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
        {/* Play/pause overlay */}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-all">
            <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-all">
              <Play size={24} fill="white" className="text-white ml-1" />
            </div>
          </div>
        )}
        {/* Controls bar */}
        <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); toggleVideo(e); }}
            className="p-2 bg-black/60 backdrop-blur rounded-full text-white hover:bg-black/80 transition-all"
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={e => { e.stopPropagation(); if (videoRef.current) { videoRef.current.controls = !videoRef.current.controls; } }}
            className="p-2 bg-black/60 backdrop-blur rounded-full text-white hover:bg-black/80 transition-all"
          >
            <Maximize2 size={14} />
          </button>
        </div>
        {att.title && (
          <div className="absolute bottom-3 left-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/50 bg-black/50 backdrop-blur px-2 py-1 rounded-full">
              {att.title}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (att.type === 'AUDIO' || att.type === 'MUSIC') {
    return (
      <div className="p-4 bg-white/[0.04] border border-white/10 rounded-2xl flex items-center gap-4">
        <div className="w-10 h-10 bg-small-orange/15 rounded-xl flex items-center justify-center text-small-orange shrink-0">
          <Volume2 size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black uppercase tracking-widest truncate mb-1">{att.title || 'Audio Clip'}</p>
          <audio ref={audioRef} src={att.url} controls className="w-full h-8" style={{ colorScheme: 'dark' }} />
        </div>
      </div>
    );
  }

  return null;
};

// ─── Lightbox ─────────────────────────────────────────────────────────────────

const Lightbox: React.FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => (
  <motion.div
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-[500] bg-black/95 flex items-center justify-center"
    onClick={onClose}
  >
    <img src={src} className="max-w-full max-h-[90vh] rounded-2xl object-contain" alt="" onClick={e => e.stopPropagation()} />
    <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all">✕</button>
  </motion.div>
);

// ─── Main component ───────────────────────────────────────────────────────────

interface ClubRichPostCardProps {
  post: ClubPost;
  currentUserId?: string;
  isMod: boolean;
  memberRole?: ClubRole;
  onLike: () => void;
  onDelete: () => void;
  onPin: () => void;
  bulletinStyle?: boolean;
  isPublicClub?: boolean;
}

const ClubRichPostCard: React.FC<ClubRichPostCardProps> = ({
  post, currentUserId, isMod, memberRole, onLike, onDelete, onPin, bulletinStyle, isPublicClub,
}) => {
  const liked = currentUserId ? post.likes.includes(currentUserId) : false;
  const isOwn = post.authorId === currentUserId;
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareCopied, setShareCopied] = useState<'link' | 'embed' | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [clubComments, setClubComments] = useState<any[]>([]);
  const [commentCount, setCommentCount] = useState(post.commentCount || 0);

  // Subscribe to comments only when the section is open
  useEffect(() => {
    if (!showComments) return;
    const unsub = subscribeToClubPostComments(post.id, (comments) => {
      setClubComments(comments);
      setCommentCount(comments.filter((c: any) => !c.parentId).length + comments.filter((c: any) => c.parentId).length);
    });
    return unsub;
  }, [showComments, post.id]);

  const handlePostClubComment = async (text: string, parentId?: string) => {
    await addClubPostComment(post.id, text, parentId || null);
  };
  const handlePostClubGif = async (gifUrl: string, parentId?: string) => {
    await addClubPostComment(post.id, '', parentId || null, gifUrl);
  };

  const postUrl = `${window.location.origin}/?club=${post.clubId}&post=${post.id}`;
  const embedCode = `<iframe src="${window.location.origin}/embed/post/${post.id}" width="560" height="300" style="border:none;border-radius:16px;overflow:hidden;" loading="lazy" title="Plajah Post"></iframe>`;
  const firstThumb = post.attachments?.find(a => a.thumbnailUrl || a.type === 'PHOTO')?.thumbnailUrl
    || post.attachments?.find(a => a.type === 'PHOTO')?.url;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(postUrl);
    setShareCopied('link');
    setTimeout(() => setShareCopied(null), 2000);
  };
  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    setShareCopied('embed');
    setTimeout(() => setShareCopied(null), 2000);
  };

  const mediaAtts = (post.attachments || []).filter(a => MEDIA_TYPES.has(a.type));
  const embedAtts = (post.attachments || []).filter(a => EMBED_TYPES.has(a.type) && !MEDIA_TYPES.has(a.type));

  return (
    <>
      <div className={`group relative rounded-3xl transition-all ${
        bulletinStyle
          ? 'border border-amber-500/20 bg-amber-500/[0.04] hover:bg-amber-500/[0.07]'
          : 'border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]'
      } ${post.isPinned ? 'ring-1 ring-white/20' : ''}`}>

        {/* Pin badge */}
        {post.isPinned && (
          <div className="absolute top-3 right-3 flex items-center gap-1 text-[7px] font-black uppercase tracking-widest text-white/25">
            <Pin size={8} /> Pinned
          </div>
        )}
        {post.type === 'ANNOUNCEMENT' && (
          <div className="px-5 pt-4">
            <span className="text-[8px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
              Announcement
            </span>
          </div>
        )}

        <div className="flex gap-3 px-5 py-4">
          {/* Avatar */}
          <div className="shrink-0">
            <img
              src={post.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.authorId}`}
              className="w-9 h-9 rounded-full border border-white/10 object-cover"
              loading="lazy" alt=""
            />
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-sm font-bold text-white">{post.authorName}</span>
              {memberRole && ROLE_COLORS[memberRole] && (
                <span className={`text-[8px] font-black uppercase tracking-widest ${ROLE_COLORS[memberRole]}`}>
                  {memberRole}
                </span>
              )}
              <span className="text-[11px] text-white/25">
                · {formatDistanceToNow(post.timestamp, { addSuffix: true })}
              </span>
            </div>

            {/* Text */}
            {post.content && (
              <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap mb-3">{post.content}</p>
            )}

            {/* ── Media (photos, videos, audio) ── */}
            {mediaAtts.length > 0 && (
              <div className={`mb-3 space-y-3 ${mediaAtts.length === 2 ? 'grid grid-cols-2 gap-3 space-y-0' : ''}`}>
                {mediaAtts.map((att, i) => (
                  <MediaBlock
                    key={i}
                    att={att as any}
                    onExpand={(att.type === 'PHOTO' || att.type === 'GIF') ? () => setLightboxSrc(att.url) : undefined}
                  />
                ))}
              </div>
            )}

            {/* ── Asset embeds ── */}
            {embedAtts.length > 0 && (
              <div className="mb-3 space-y-2">
                {embedAtts.map((att, i) => (
                  <AssetEmbed key={i} att={att as any} />
                ))}
              </div>
            )}

            {/* ── Action bar ── */}
            <div className="flex items-center gap-1 -ml-1.5 mt-1">
              {/* Like */}
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={onLike}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all ${
                  liked ? 'text-red-400 bg-red-400/10' : 'text-white/30 hover:text-red-400 hover:bg-red-400/10'
                }`}
              >
                <Heart size={15} strokeWidth={1.5} fill={liked ? 'currentColor' : 'none'} />
                {post.likes.length > 0 && <span className="text-[11px]">{post.likes.length}</span>}
              </motion.button>

              {/* Comment toggle */}
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => setShowComments(v => !v)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all ${
                  showComments ? 'text-small-orange bg-small-orange/10' : 'text-white/30 hover:text-white/70 hover:bg-white/8'
                }`}
              >
                <MessageSquare size={14} strokeWidth={1.5} />
                {commentCount > 0 && <span className="text-[11px]">{commentCount}</span>}
              </motion.button>

              {/* Share button — public clubs only */}
              {isPublicClub && (
                <div className="relative">
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => setShowShare(v => !v)}
                    className="p-1.5 rounded-full text-[13px] text-white/25 hover:text-white/60 hover:bg-white/8 transition-all"
                  >
                    <Share2 size={14} strokeWidth={1.5} />
                  </motion.button>

                  <AnimatePresence>
                    {showShare && (
                      <>
                        <div className="fixed inset-0 z-[80]" onClick={() => setShowShare(false)} />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.92, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.92, y: 8 }}
                          transition={{ duration: 0.15 }}
                          className="absolute left-0 bottom-full mb-2 w-72 bg-black/92 backdrop-blur-2xl border border-white/12 rounded-2xl p-4 z-[90] shadow-2xl space-y-3"
                          onClick={e => e.stopPropagation()}
                        >
                          {/* Header */}
                          <div className="flex items-center justify-between">
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Share Post</p>
                            <button onClick={() => setShowShare(false)} className="text-white/20 hover:text-white transition-colors">
                              <XIcon size={12} />
                            </button>
                          </div>

                          {/* Visual link preview */}
                          <div className="rounded-xl border border-white/8 overflow-hidden bg-white/[0.03]">
                            {firstThumb && (
                              <img src={firstThumb} alt="" className="w-full h-20 object-cover opacity-60" />
                            )}
                            <div className="px-3 py-2">
                              <p className="text-[7px] text-white/25 uppercase tracking-widest">plajah.com</p>
                              <p className="text-[11px] font-black text-white leading-tight">{post.content.slice(0, 60)}{post.content.length > 60 ? '…' : ''}</p>
                              <p className="text-[9px] text-white/30">by {post.authorName}</p>
                            </div>
                          </div>

                          {/* Copy link row */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-black/40 border border-white/6 rounded-xl px-3 py-2 font-mono text-[8px] text-white/30 truncate">
                              {postUrl}
                            </div>
                            <button
                              onClick={handleCopyLink}
                              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all flex-shrink-0"
                              style={{ background: shareCopied === 'link' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)', color: shareCopied === 'link' ? '#22c55e' : 'rgba(255,255,255,0.6)' }}
                            >
                              {shareCopied === 'link' ? <Check size={10} /> : <Copy size={10} />}
                              {shareCopied === 'link' ? 'Copied' : 'Copy'}
                            </button>
                          </div>

                          {/* Embed code */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[8px] font-black uppercase tracking-widest text-white/25">Embed</p>
                              <button
                                onClick={handleCopyEmbed}
                                className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest transition-colors"
                                style={{ color: shareCopied === 'embed' ? '#22c55e' : 'rgba(255,255,255,0.35)' }}
                              >
                                {shareCopied === 'embed' ? <Check size={9} /> : <Copy size={9} />}
                                {shareCopied === 'embed' ? 'Copied!' : 'Copy Code'}
                              </button>
                            </div>
                            <div className="bg-black/50 border border-white/6 rounded-xl px-3 py-2 font-mono text-[8px] text-white/22 break-all leading-relaxed">
                              {embedCode}
                            </div>
                          </div>

                          {/* Social share */}
                          <div className="flex gap-2 pt-1 border-t border-white/5">
                            {[
                              { label: 'X',        fn: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.content.slice(0,100))}&url=${encodeURIComponent(postUrl)}`, '_blank') },
                              { label: 'WhatsApp', fn: () => window.open(`https://wa.me/?text=${encodeURIComponent(post.content.slice(0,80) + '\n' + postUrl)}`, '_blank') },
                              { label: 'Facebook', fn: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`, '_blank') },
                            ].map(s => (
                              <button key={s.label} onClick={s.fn}
                                className="flex-1 py-1.5 rounded-xl text-[7px] font-black uppercase tracking-widest text-white/50 hover:text-white border border-white/8 hover:border-white/20 bg-white/[0.03] hover:bg-white/8 transition-all">
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Mod/owner actions */}
              {(isMod || isOwn) && (
                <div className="ml-auto flex items-center gap-1">
                  {isMod && (
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={onPin}
                      className={`p-1.5 rounded-full text-[13px] transition-all ${
                        post.isPinned ? 'text-amber-400 bg-amber-400/10' : 'text-white/20 hover:text-amber-400 hover:bg-amber-400/10'
                      }`}
                    >
                      <Pin size={14} strokeWidth={1.5} />
                    </motion.button>
                  )}
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => setShowDelete(true)}
                    className="p-1.5 rounded-full text-[13px] text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-all"
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                  </motion.button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Comment section — expands below the card */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="overflow-hidden mt-2"
          >
            <CommentSection
              comments={clubComments}
              onPostComment={handlePostClubComment}
              onPostGif={handlePostClubGif}
              layout="inline"
              onClose={() => setShowComments(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <AnimatePresence>
        {showDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowDelete(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-[#0d0d14] border border-white/10 rounded-3xl p-6 w-full max-w-xs space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-sm font-black uppercase tracking-widest text-center">Delete this post?</p>
              <p className="text-[10px] text-white/40 text-center">This can't be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDelete(false)}
                  className="flex-1 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-white/5 text-white/40 hover:bg-white/10 transition-all">
                  Cancel
                </button>
                <button onClick={() => { onDelete(); setShowDelete(false); }}
                  className="flex-1 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-red-500/20 text-red-400 border border-red-500/25 hover:bg-red-500/30 transition-all">
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Photo lightbox */}
      <AnimatePresence>
        {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      </AnimatePresence>
    </>
  );
};

export default ClubRichPostCard;
