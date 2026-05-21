import React, { useState } from 'react';
import { Post, Album, Club } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, MessageSquare, Share2, MoreHorizontal, ExternalLink, Play, Volume2, Image as ImageIcon, Link as LinkIcon, Edit2, Check, X as XIcon, ChevronRight, Gift, Banknote, Layers, Users } from 'lucide-react';
import MiniMusicPlayer from './MiniMusicPlayer';
import ThreeDImage from './ThreeDImage';
import ShareButton from './ShareButton';
import { formatDistanceToNow } from 'date-fns';
import { auth, updatePost, deletePost, togglePostLike, processDonation, fetchUserClubs, createClubPost } from '../services/backendService';
import { Trash2, Zap } from 'lucide-react';
import CommentSection from './CommentSection';
import MediaWaterfallView, { WaterfallMediaItem } from './MediaWaterfallView';
import SignInPrompt from './SignInPrompt';

interface PostCardProps {
  post: Post;
  onVisitUser?: (uid: string) => void;
}

const RenderTextWithMentions: React.FC<{ text: string; onVisitUser?: (uid: string) => void }> = ({ text, onVisitUser }) => {
  const parts = text.split(/(@\[[^\]]+\]\([^\)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        const mentionMatch = part.match(/@\[([^\]]+)\]\(([^)]+)\)/);
        if (mentionMatch) {
          const name = mentionMatch[1];
          const uid = mentionMatch[2];
          return (
            <span
              key={i}
              className="text-small-orange hover:underline cursor-pointer font-bold inline-block"
              onClick={(e) => {
                e.stopPropagation();
                onVisitUser?.(uid);
              }}
            >
              @{name}
            </span>
          );
        }
        return part;
      })}
    </>
  );
};

const PostCard: React.FC<PostCardProps> = ({ post, onVisitUser }) => {
  const [isLiked, setIsLiked] = useState(() => !!(auth.currentUser && post.likedBy?.includes(auth.currentUser.uid)));
  const [likes, setLikes] = useState(post.likesCount);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(post.text);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [giftAmount, setGiftAmount] = useState<number | null>(null);
  const [customGift, setCustomGift] = useState('');
  const [isGifting, setIsGifting] = useState(false);
  const [giftSent, setGiftSent] = useState(false);
  const [showWaterfall, setShowWaterfall] = useState(false);
  const [signInAction, setSignInAction] = useState<string | null>(null);
  const [showSendToClub, setShowSendToClub] = useState(false);
  const [userClubs, setUserClubs] = useState<Club[]>([]);
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [sendingToClub, setSendingToClub] = useState('');
  const [sentToClub, setSentToClub] = useState('');

  const waterfallItems: WaterfallMediaItem[] = (post.media || []).map(m => ({
    type: m.type as WaterfallMediaItem['type'],
    url: m.url,
    title: m.title,
    thumbnail: m.thumbnail,
    linkPreview: m.linkPreview,
  }));

  const isAuthor = auth.currentUser?.uid === post.authorId;

  const handleGift = async () => {
    if (!auth.currentUser || isGifting) return;
    const amount = giftAmount ?? parseFloat(customGift);
    if (!amount || amount <= 0) return;
    setIsGifting(true);
    try {
      await processDonation({
        fromId: auth.currentUser.uid,
        fromName: auth.currentUser.displayName || 'Anonymous',
        toId: post.authorId,
        amount,
      });
      setGiftSent(true);
      setTimeout(() => { setShowGift(false); setGiftSent(false); setGiftAmount(null); setCustomGift(''); }, 2000);
    } catch (e) {
      console.error('Gift failed:', e);
    } finally {
      setIsGifting(false);
    }
  };
  const isTargeted = post.targetUserId && post.targetUserId !== post.authorId;

  const handleOpenSendToClub = async () => {
    if (!auth.currentUser) { setSignInAction('send to a club'); return; }
    setShowSendToClub(true);
    if (userClubs.length === 0) {
      setLoadingClubs(true);
      const clubs = await fetchUserClubs(auth.currentUser.uid);
      setUserClubs(clubs);
      setLoadingClubs(false);
    }
  };

  const handleSendToClub = async (clubId: string) => {
    if (!auth.currentUser || sendingToClub) return;
    setSendingToClub(clubId);
    const attachments = (post.media || [])
      .filter(m => m.type === 'PHOTO' || m.type === 'VIDEO' || m.type === 'AUDIO' || m.type === 'ALBUM')
      .map(m => ({ type: m.type, url: m.url || '', title: m.title, thumbnailUrl: m.thumbnail, assetId: m.id }));
    await createClubPost({
      clubId,
      content: post.text || '',
      type: 'POST',
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    setSendingToClub('');
    setSentToClub(clubId);
    setTimeout(() => { setSentToClub(''); setShowSendToClub(false); }, 1500);
  };

  const handleLike = async () => {
    if (!auth.currentUser) { setSignInAction('like this post'); return; }
    const optimisticLiked = !isLiked;
    setIsLiked(optimisticLiked);
    setLikes(prev => optimisticLiked ? prev + 1 : prev - 1);
    const result = await togglePostLike(post.id);
    if (result) {
      setIsLiked(result.liked);
      setLikes(result.likesCount);
    }
  };

  const handleSaveEdit = async () => {
    if (!editedText.trim()) return;
    setIsSaving(true);
    try {
      await updatePost(post.id, { text: editedText });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update post:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    setIsDeleting(true);
    try {
      await deletePost(post.id);
      // The feed should update automatically via onSnapshot
    } catch (error) {
      console.error("Failed to delete post:", error);
      alert("Failed to delete post. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowOptions(false);
    }
  };

  const renderMedia = () => {
    if (!post.media || post.media.length === 0) return null;

    return (
      <div className="mt-4 space-y-4">
        {post.media.map((item, idx) => {
          switch (item.type) {
            case 'PHOTO':
            case 'GIF':
            case 'STICKER':
              return (
                <div key={idx} className="media-lift cursor-pointer">
                  <ThreeDImage
                    src={item.url}
                    alt={item.title || "Post media"}
                    className="w-full h-auto max-h-[600px] object-cover"
                    containerClassName="rounded-3xl overflow-hidden border border-white/10 bg-white/5 shadow-2xl"
                  />
                </div>
              );
            case 'VIDEO':
              return (
                <div key={idx} className="rounded-3xl overflow-hidden border border-white/10 bg-black aspect-video relative group media-lift cursor-pointer">
                  <video src={item.url || undefined} preload="metadata" playsInline className="w-full h-full object-contain" controls />
                </div>
              );
            case 'AUDIO':
              return (
                <div key={idx} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-4">
                  <div className="w-10 h-10 bg-small-orange/20 rounded-xl flex items-center justify-center text-small-orange">
                    <Volume2 size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black uppercase tracking-widest truncate">{item.title || "Audio Clip"}</p>
                    <audio src={item.url} controls className="w-full h-8 mt-2" />
                  </div>
                </div>
              );
            case 'LINK':
              if (item.linkPreview) {
                return (
                  <a
                    key={idx}
                    href={item.linkPreview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white/5 border border-white/10 rounded-3xl overflow-hidden hover:bg-white/10 transition-all group media-lift"
                  >
                    {item.linkPreview.image && (
                      <img src={item.linkPreview.image || null} alt="Preview" className="w-full h-48 object-cover opacity-80 group-hover:opacity-100 transition-all" loading="lazy" />
                    )}
                    <div className="p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <LinkIcon size={12} className="text-small-orange" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40 truncate">{new URL(item.linkPreview.url).hostname}</span>
                      </div>
                      <h4 className="text-sm font-black uppercase tracking-widest mb-2 group-hover:text-small-orange transition-colors">{item.linkPreview.title}</h4>
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest line-clamp-2 leading-relaxed">{item.linkPreview.description}</p>
                    </div>
                  </a>
                );
              }
              return (
                <a
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl text-small-orange hover:bg-white/10 transition-all"
                >
                  <ExternalLink size={16} />
                  <span className="text-xs font-black uppercase tracking-widest truncate">{item.url}</span>
                </a>
              );
            default:
              return null;
          }
        })}
      </div>
    );
  };

  return (
    <>
    <div className="relative group/card">
      <div className="flex gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors border-b border-white/[0.06]">
        {/* Avatar col */}
        <div className="relative flex-shrink-0 group/profile">
          <button
            onClick={() => onVisitUser?.(post.authorId)}
            className="w-10 h-10 rounded-full overflow-hidden border border-white/10 hover:opacity-90 transition-opacity block"
          >
            <img
              src={post.authorPhoto || null}
              alt={post.authorName}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          </button>
          {auth.currentUser?.uid !== post.authorId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('START_CHAT', { detail: { userId: post.authorId } }));
              }}
              className="absolute -bottom-1 -right-1 w-5 h-5 bg-small-orange text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover/profile:opacity-100 transition-all hover:scale-110"
              title="Message User"
            >
              <MessageSquare size={10} fill="currentColor" />
            </button>
          )}
        </div>

        {/* Content col */}
        <div className="flex-1 min-w-0">
          {/* Compact header */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <button
                onClick={() => onVisitUser?.(post.authorId)}
                className="text-[14px] font-bold text-white hover:text-small-orange transition-colors leading-tight"
              >
                {post.authorName}
              </button>
              {isTargeted && (
                <>
                  <ChevronRight size={12} className="text-white/20 flex-shrink-0" />
                  <button
                    onClick={() => onVisitUser?.(post.targetUserId!)}
                    className="text-[14px] font-bold text-white/50 hover:text-small-orange transition-colors leading-tight"
                  >
                    {post.targetUserName || 'Artist'}
                  </button>
                </>
              )}
              <span className="text-[13px] text-white/30 leading-tight flex-shrink-0">
                · {formatDistanceToNow(post.timestamp)}ago
              </span>
              {post.modifiedAt && (
                <span className="flex items-center gap-1 text-small-orange text-[11px]">
                  <span className="w-1.5 h-1.5 bg-small-orange rounded-full animate-pulse" />
                  <span>edited</span>
                </span>
              )}
            </div>

            {/* Options menu — visible on hover */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="p-1 rounded-full text-white/20 hover:text-white hover:bg-white/10 transition-all opacity-0 group-hover/card:opacity-100"
              >
                <MoreHorizontal size={16} />
              </button>
              <AnimatePresence>
                {showOptions && isAuthor && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 6 }}
                    className="absolute right-0 mt-1 w-48 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  >
                    <button
                      onClick={async () => {
                        setShowOptions(false);
                        try {
                          const profile = await (await import('../services/backendService')).fetchUserProfile(auth.currentUser!.uid);
                          if (profile) {
                            const pinnedItems = profile.pinnedItems || [];
                            const newPin: { id: string; type: 'POST'; refId: string } = { id: Date.now().toString(), type: 'POST', refId: post.id };
                            if (!pinnedItems.find((p: any) => p.refId === post.id)) {
                              await (await import('../services/backendService')).updateUserProfile(auth.currentUser!.uid, { pinnedItems: [...pinnedItems, newPin] });
                              alert('Post Pinned to Profile!');
                            } else {
                              alert('Post is already pinned.');
                            }
                          }
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-small-orange hover:text-small-orange hover:bg-white/5 flex items-center gap-3 transition-all"
                    >
                      <Zap size={14} />
                      Pin to Profile
                    </button>
                    <button
                      onClick={() => { setIsEditing(true); setShowOptions(false); }}
                      className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/5 flex items-center gap-3 transition-all"
                    >
                      <Edit2 size={14} /> Edit Post
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="w-full px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 flex items-center gap-3 transition-all disabled:opacity-50"
                    >
                      <Trash2 size={14} /> {isDeleting ? 'Deleting...' : 'Delete Post'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Post text / edit */}
          {isEditing ? (
            <div className="space-y-3 mt-2">
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-sm font-medium leading-relaxed text-white outline-none focus:border-small-orange/50 transition-all"
                rows={4}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editedText.trim()}
                  className="px-5 py-1.5 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2"
                >
                  {isSaving ? 'Saving...' : <><Check size={13} /> Save</>}
                </button>
                <button
                  onClick={() => { setIsEditing(false); setEditedText(post.text); }}
                  className="px-5 py-1.5 bg-white/5 text-white/40 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
                >
                  <XIcon size={13} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            post.text && (
              <p className="text-[14px] leading-normal text-white/80 whitespace-pre-wrap">
                <RenderTextWithMentions text={post.text} onVisitUser={onVisitUser} />
              </p>
            )
          )}

          {/* Embedded Album Player */}
          {post.albumEmbed && (
            <div className="mt-3">
              <MiniMusicPlayer album={post.albumEmbed} autoPlay={post.autoPlayEmbed} />
            </div>
          )}

          {/* Rich Media */}
          {renderMedia()}

          {/* Action bar */}
          <div className="flex items-center gap-1 mt-3 -ml-1.5">
            {/* Comment */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setShowComments(!showComments)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all
                ${showComments
                  ? 'text-sky-400 bg-sky-400/10'
                  : 'text-white/40 hover:text-sky-400 hover:bg-sky-400/10'}`}
            >
              <MessageSquare size={16} strokeWidth={1.5} />
              {(post.commentsCount ?? 0) > 0 && (
                <span className="text-[12px]">{post.commentsCount}</span>
              )}
            </motion.button>

            {/* Media Waterfall — only when post has media */}
            {waterfallItems.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => setShowWaterfall(true)}
                title="View Media Waterfall"
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all text-white/40 hover:text-violet-400 hover:bg-violet-400/10"
              >
                <Layers size={15} strokeWidth={1.5} />
                {waterfallItems.length > 1 && <span className="text-[11px]">{waterfallItems.length}</span>}
              </motion.button>
            )}

            {/* Like */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={handleLike}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all
                ${isLiked
                  ? 'text-red-400 bg-red-400/10'
                  : 'text-white/40 hover:text-red-400 hover:bg-red-400/10'}`}
            >
              <Heart
                size={16}
                strokeWidth={1.5}
                fill={isLiked ? 'currentColor' : 'none'}
                className={isLiked ? 'text-red-400' : ''}
              />
              {likes > 0 && (
                <span className="text-[12px]">{likes}</span>
              )}
            </motion.button>

            {/* Gift — non-author only */}
            {!isAuthor && (
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => {
                  if (!auth.currentUser) { setSignInAction('send a gift'); return; }
                  setShowGift(!showGift);
                }}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all
                  ${showGift
                    ? 'text-yellow-400 bg-yellow-400/10'
                    : 'text-white/40 hover:text-yellow-400 hover:bg-yellow-400/10'}`}
              >
                <Gift size={16} strokeWidth={1.5} />
              </motion.button>
            )}

            {/* Send to Club */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={handleOpenSendToClub}
              title="Send to a Club"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-full text-[13px] transition-all text-white/40 hover:text-emerald-400 hover:bg-emerald-400/10"
            >
              <Users size={15} strokeWidth={1.5} />
            </motion.button>

            {/* Share */}
            <div className="ml-auto">
              <ShareButton
                title={`Post by ${post.authorName}`}
                text={post.text || 'Check out this post on Plajah'}
                url={`${window.location.origin}/post/${post.id}`}
              />
            </div>
          </div>

          {/* Gift panel */}
          <AnimatePresence>
            {showGift && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 p-4 bg-small-orange/5 border border-small-orange/20 rounded-2xl">
                  {giftSent ? (
                    <div className="flex items-center justify-center gap-2 py-2 text-small-orange">
                      <Check size={16} />
                      <span className="text-[11px] font-black uppercase tracking-widest">Gift sent!</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 mb-3 flex items-center gap-2">
                        <Banknote size={11} className="text-small-orange" /> Gift to {post.authorName}
                      </p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {[1, 3, 5, 10].map(amt => (
                          <button
                            key={amt}
                            onClick={() => { setGiftAmount(amt); setCustomGift(''); }}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                              ${giftAmount === amt ? 'bg-small-orange text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                          >
                            ${amt}
                          </button>
                        ))}
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          placeholder="Custom"
                          value={customGift}
                          onChange={e => { setCustomGift(e.target.value); setGiftAmount(null); }}
                          className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-white outline-none w-24 focus:border-small-orange/50"
                        />
                      </div>
                      <button
                        onClick={handleGift}
                        disabled={isGifting || (!giftAmount && !parseFloat(customGift))}
                        className="w-full py-2.5 bg-small-orange text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                      >
                        {isGifting
                          ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending…</>
                          : <><Gift size={13} />Send Gift</>}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Comment section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <CommentSection
                postId={post.id}
                postAuthorId={post.authorId}
                onVisitUser={onVisitUser}
                onClose={() => setShowComments(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

    {/* Media Waterfall overlay */}
    <AnimatePresence>
      {showWaterfall && waterfallItems.length > 0 && (
        <MediaWaterfallView
          items={waterfallItems}
          onClose={() => setShowWaterfall(false)}
          commentNode={
            <CommentSection
              postId={post.id}
              postAuthorId={post.authorId}
              onVisitUser={onVisitUser}
              layout="inline"
            />
          }
        />
      )}
    </AnimatePresence>

    {/* Send to Club modal */}
    <AnimatePresence>
      {showSendToClub && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setShowSendToClub(false)}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="bg-[#0d0d0d] border border-white/10 rounded-3xl p-6 w-full max-w-sm"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-widest">Send to Club</h3>
                <p className="text-[9px] text-white/30 mt-0.5 uppercase tracking-widest">Share this post to a club timeline</p>
              </div>
              <button onClick={() => setShowSendToClub(false)} className="p-1.5 text-white/30 hover:text-white transition-colors"><XIcon size={16} /></button>
            </div>

            {/* Post preview chip */}
            <div className="flex items-start gap-3 bg-white/5 border border-white/8 rounded-2xl p-3 mb-5">
              <img src={post.authorPhoto || ''} className="w-8 h-8 rounded-full shrink-0 object-cover border border-white/10" alt="" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-0.5">{post.authorName}</p>
                <p className="text-[11px] text-white/60 line-clamp-2 leading-tight">{post.text || (post.media?.[0]?.title ?? 'Media post')}</p>
                {post.media && post.media.length > 0 && (
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {post.media.map((m, i) => (
                      <span key={i} className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-white/8 border border-white/10 rounded-full">{m.type}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {loadingClubs ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>
            ) : userClubs.length === 0 ? (
              <p className="text-center text-[10px] text-white/25 uppercase tracking-widest py-8 font-bold">You haven't joined any clubs yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {userClubs.map(club => (
                  <button
                    key={club.id}
                    onClick={() => handleSendToClub(club.id)}
                    disabled={!!sendingToClub}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/10 rounded-2xl transition-all text-left disabled:opacity-50"
                  >
                    {club.iconImage
                      ? <img src={club.iconImage} className="w-9 h-9 rounded-xl border border-white/10 object-cover shrink-0" alt="" />
                      : <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0"><Users size={14} className="opacity-30" /></div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-widest truncate">{club.name}</p>
                      <p className="text-[9px] text-white/25 mt-0.5">{club.memberCount?.toLocaleString()} members</p>
                    </div>
                    {sentToClub === club.id
                      ? <Check size={14} className="text-emerald-400 shrink-0" />
                      : sendingToClub === club.id
                      ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0" />
                      : null}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Sign-in prompt */}
    <AnimatePresence>
      {signInAction && (
        <SignInPrompt action={signInAction} onClose={() => setSignInAction(null)} />
      )}
    </AnimatePresence>
    </>
  );
};

export default PostCard;
