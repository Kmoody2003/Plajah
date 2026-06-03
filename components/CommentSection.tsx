import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, Heart, Reply, Trash2, Smile, X, ChevronDown,
  Loader2, MessageCircle, AtSign, LogIn, BarChart2, Plus, Check,
  Clock, Users, Sparkles,
} from 'lucide-react';
import GifStickerPicker from './GifStickerPicker';
import {
  collection, addDoc, getDocs, query, where, onSnapshot,
  doc, updateDoc, arrayUnion, arrayRemove, orderBy,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import {
  auth,
  subscribeToPostComments,
  addPostComment,
  deletePostComment,
  toggleCommentLike,
  searchUserProfiles,
  uploadFile,
} from '../services/backendService';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { UserProfile } from '../types';
import { formatDistanceToNow } from 'date-fns';
import SignInPrompt from './SignInPrompt';
import UniversalPostComposer, { ComposerPostData } from './UniversalPostComposer';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PostComment {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  timestamp: number;
  parentId: string | null;
  likedBy?: string[];
  likesCount?: number;
  isPending?: boolean;
  videoUrl?: string;  // video response attachment
  audioUrl?: string;  // voice note attachment
}

interface CommentSectionProps {
  // Self-contained mode (for posts)
  postId?: string;
  postAuthorId?: string;
  initialCount?: number;
  // Legacy pass-through mode (albums, articles, videos)
  comments?: any[];
  onPostComment?: (text: string, parentId?: string, mediaTimestamp?: number) => Promise<void>;
  onPostGif?: (gifUrl: string, parentId?: string) => Promise<void>;
  currentUser?: any;
  title?: string;
  themeColor?: string;
  // Common
  onVisitUser?: (uid: string) => void;
  onClose?: () => void;
  layout?: 'inline' | 'panel';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const QUICK_EMOJIS = ['🔥', '❤️', '🙌', '✨', '💯', '😂', '👏', '🎸', '🎧', '💎'];

function renderMentions(text: string, onVisitUser?: (uid: string) => void): React.ReactNode {
  const parts = text.split(/(@\[[^\]]+\]\([^\)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/@\[([^\]]+)\]\(([^)]+)\)/);
        if (m) {
          return (
            <span
              key={i}
              className="text-small-orange font-bold cursor-pointer hover:underline"
              onClick={(e) => { e.stopPropagation(); onVisitUser?.(m[2]); }}
            >
              @{m[1]}
            </span>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

// ─── CommentBubble ────────────────────────────────────────────────────────────

interface BubbleProps {
  comment: PostComment;
  allComments: PostComment[];
  postId: string;
  onReply: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onLikeToggle: (id: string) => void;
  onVisitUser?: (uid: string) => void;
  depth: number;
  isDark: boolean;
}

const CommentBubble: React.FC<BubbleProps> = ({
  comment, allComments, postId, onReply, onDelete, onLikeToggle, onVisitUser, depth, isDark
}) => {
  const [showReplies, setShowReplies] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);

  const replies = allComments.filter(c => c.parentId === comment.id);
  const uid = auth.currentUser?.uid;
  const isLiked = !!(uid && (comment.likedBy || []).includes(uid));
  const isOwn = uid === comment.authorId;
  const photoSrc = comment.authorPhoto ||
    `https://api.dicebear.com/9.x/thumbs/svg?seed=${comment.authorId}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: comment.isPending ? 0.55 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.94, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className={depth > 0 ? 'ml-8 sm:ml-11' : ''}
    >
      <div className="flex gap-3 group/bubble">
        {/* Avatar */}
        <button
          onClick={() => onVisitUser?.(comment.authorId)}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl overflow-hidden flex-shrink-0 ring-2 ring-white/5 hover:ring-small-orange/50 transition-all active:scale-90"
        >
          <img
            src={photoSrc}
            alt={comment.authorName}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </button>

        {/* Bubble + Actions */}
        <div className="flex-1 min-w-0">
          {/* Speech bubble */}
          <div className={`
            relative inline-block max-w-full rounded-3xl rounded-tl-lg px-4 py-3 transition-colors
            ${isDark ? 'bg-white/[0.06] hover:bg-white/[0.09]' : 'bg-black/[0.05] hover:bg-black/[0.08]'}
          `}>
            <div className="flex items-baseline gap-2 flex-wrap mb-1">
              <button
                onClick={() => onVisitUser?.(comment.authorId)}
                className="text-[10px] font-black uppercase tracking-widest text-small-orange hover:text-white transition-colors"
              >
                {comment.authorName}
              </button>
              {comment.isPending && (
                <span className={`text-[8px] uppercase tracking-widest flex items-center gap-1 ${isDark ? 'text-white/25' : 'text-black/25'}`}>
                  <Loader2 size={8} className="animate-spin" /> Sending…
                </span>
              )}
            </div>
            {comment.text && (
              <div className={`text-sm leading-relaxed font-medium whitespace-pre-wrap break-words ${isDark ? 'text-white/85' : 'text-black/85'}`}>
                {renderMentions(comment.text, onVisitUser)}
              </div>
            )}
            {(comment as any).videoUrl && (
              <div className="mt-2 rounded-2xl overflow-hidden border border-white/10 max-w-[280px]">
                <video src={(comment as any).videoUrl} controls playsInline className="w-full max-h-[200px] object-cover" />
              </div>
            )}
            {(comment as any).audioUrl && (
              <div className="mt-2">
                <audio src={(comment as any).audioUrl} controls className="w-full h-8 max-w-[240px]" />
              </div>
            )}
            {(comment as any).gifUrl && (
              <div className="mt-2 rounded-2xl overflow-hidden max-w-[220px]">
                <img
                  src={(comment as any).gifUrl}
                  alt=""
                  className="w-full h-auto"
                  loading="lazy"
                />
              </div>
            )}
          </div>

          {/* Action strip */}
          <div className="flex items-center gap-4 mt-1.5 px-1.5">
            <span className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-white/20' : 'text-black/20'}`}>
              {formatDistanceToNow(comment.timestamp, { addSuffix: false })} ago
            </span>

            {/* Like */}
            <button
              onClick={() => onLikeToggle(comment.id)}
              disabled={comment.isPending}
              className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest transition-all active:scale-90 disabled:opacity-30
                ${isLiked ? 'text-red-400' : isDark ? 'text-white/30 hover:text-white' : 'text-black/30 hover:text-black'}`}
            >
              <Heart size={10} fill={isLiked ? 'currentColor' : 'none'} />
              {(comment.likesCount || 0) > 0 && <span>{comment.likesCount}</span>}
            </button>

            {/* Reply */}
            {depth < 2 && (
              <button
                onClick={() => onReply(comment.id, comment.authorName)}
                disabled={comment.isPending}
                className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-30
                  ${isDark ? 'text-white/30 hover:text-white' : 'text-black/30 hover:text-black'}`}
              >
                <Reply size={10} /> Reply
              </button>
            )}

            {/* Quick emoji */}
            <div className="relative">
              <button
                onClick={() => setShowEmoji(v => !v)}
                className={`text-[9px] transition-all ${isDark ? 'text-white/20 hover:text-white' : 'text-black/20 hover:text-black'}`}
              >
                <Smile size={11} />
              </button>
              <AnimatePresence>
                {showEmoji && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowEmoji(false)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.82, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.82, y: 8 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="absolute bottom-full left-0 mb-2 p-2 bg-black/95 backdrop-blur-2xl border border-white/10 rounded-2xl flex flex-wrap gap-1 shadow-2xl z-50 w-[200px]"
                    >
                      {QUICK_EMOJIS.map(e => (
                        <button
                          key={e}
                          className="w-8 h-8 text-base flex items-center justify-center hover:bg-white/10 rounded-xl transition-all hover:scale-125"
                          onClick={() => setShowEmoji(false)}
                        >
                          {e}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Delete (own only) */}
            {isOwn && !comment.isPending && (
              <button
                onClick={() => onDelete(comment.id)}
                className={`opacity-0 group-hover/bubble:opacity-100 text-[9px] transition-all hover:text-red-500
                  ${isDark ? 'text-white/20' : 'text-black/20'}`}
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Nested replies */}
      {replies.length > 0 && (
        <div className="mt-3 ml-11 sm:ml-12">
          <button
            onClick={() => setShowReplies(v => !v)}
            className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest mb-3 transition-all
              ${isDark ? 'text-white/30 hover:text-white' : 'text-black/30 hover:text-black'}`}
          >
            <ChevronDown size={11} className={`transition-transform duration-300 ${showReplies ? 'rotate-180' : ''}`} />
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </button>
          <AnimatePresence>
            {showReplies && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className="overflow-hidden space-y-5"
              >
                {replies.map(reply => (
                  <CommentBubble
                    key={reply.id}
                    comment={reply}
                    allComments={allComments}
                    postId={postId}
                    onReply={onReply}
                    onDelete={onDelete}
                    onLikeToggle={onLikeToggle}
                    onVisitUser={onVisitUser}
                    depth={depth + 1}
                    isDark={isDark}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};

// ─── CommentInput ─────────────────────────────────────────────────────────────

interface InputProps {
  postId: string;
  replyTo: { id: string; name: string } | null;
  onClearReply: () => void;
  onCommentPosted: (comment: PostComment) => void;
  isDark: boolean;
  onSubmitOverride?: (text: string, parentId?: string) => Promise<void>;
}

const CommentInput: React.FC<InputProps> = ({ postId, replyTo, onClearReply, onCommentPosted, isDark, onSubmitOverride }) => {
  const [text, setText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const user = auth.currentUser;

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (mentionSearch.length > 0) {
      searchUserProfiles(mentionSearch).then(users => {
        setSuggestedUsers(users);
        setShowMentions(users.length > 0);
      });
    } else {
      setShowMentions(false);
    }
  }, [mentionSearch]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart || 0;
    setText(val);
    const lastAt = val.lastIndexOf('@', cursor - 1);
    if (lastAt !== -1) {
      const afterAt = val.substring(lastAt + 1, cursor);
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        setMentionSearch(afterAt);
        setMentionIndex(lastAt);
        return;
      }
    }
    setMentionIndex(-1);
    setMentionSearch('');
    setShowMentions(false);
  };

  const insertMention = (usr: UserProfile) => {
    const before = text.substring(0, mentionIndex);
    const after = text.substring(mentionIndex + 1 + mentionSearch.length);
    setText(`${before}@[${usr.displayName}](${usr.uid})${after}`);
    setMentionIndex(-1);
    setMentionSearch('');
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || isPosting) return;
    if (!onSubmitOverride && !user) return;
    const commentText = text.trim();
    setText('');
    setIsPosting(true);

    const optimistic: PostComment = {
      id: `pending-${Date.now()}`,
      text: commentText,
      authorId: user?.uid || '',
      authorName: user?.displayName || 'Anonymous',
      authorPhoto: user?.photoURL || '',
      timestamp: Date.now(),
      parentId: replyTo?.id || null,
      likedBy: [],
      likesCount: 0,
      isPending: true
    };
    onCommentPosted(optimistic);
    onClearReply();

    try {
      if (onSubmitOverride) {
        await onSubmitOverride(commentText, replyTo?.id);
      } else {
        await addPostComment(postId, commentText, replyTo?.id);
      }
    } catch {
      // optimistic comment will be replaced/removed by next snapshot
    } finally {
      setIsPosting(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const inputBase = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/20'
    : 'bg-black/5 border-black/10 text-black placeholder:text-black/20 focus:border-black/20';

  return (
    <form onSubmit={handleSubmit} className="relative">
      {/* Reply indicator */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`flex items-center justify-between px-4 py-2 mb-2 rounded-2xl text-[9px] font-black uppercase tracking-widest
              ${isDark ? 'bg-small-orange/10 text-small-orange' : 'bg-small-orange/10 text-small-orange'}`}
          >
            <span className="flex items-center gap-2">
              <Reply size={10} /> Replying to @{replyTo.name}
            </span>
            <button type="button" onClick={onClearReply} className="hover:opacity-60 transition-opacity">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mention dropdown */}
      <AnimatePresence>
        {showMentions && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 480, damping: 28 }}
            className={`absolute bottom-full mb-3 left-0 right-0 rounded-2xl border overflow-hidden shadow-2xl z-50
              ${isDark ? 'bg-black/95 border-white/10' : 'bg-white border-black/10'}`}
          >
            <div className={`px-4 py-2 border-b text-[9px] font-black uppercase tracking-widest flex items-center gap-2
              ${isDark ? 'border-white/5 text-white/30' : 'border-black/5 text-black/30'}`}>
              <AtSign size={10} /> Mention
            </div>
            {suggestedUsers.slice(0, 5).map(usr => (
              <button
                key={usr.uid}
                type="button"
                onClick={() => insertMention(usr)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                  ${isDark ? 'hover:bg-white/5 text-white' : 'hover:bg-black/5 text-black'}`}
              >
                <div className="w-7 h-7 rounded-full overflow-hidden ring-1 ring-white/10 shrink-0">
                  {usr.photoURL
                    ? <img src={usr.photoURL} className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-white/10 flex items-center justify-center text-white/30"><AtSign size={12} /></div>}
                </div>
                <span className="text-[11px] font-black uppercase tracking-widest">{usr.displayName}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input row */}
      <div className="flex items-end gap-3">
        {user?.photoURL && (
          <div className="w-8 h-8 rounded-xl overflow-hidden ring-2 ring-white/5 shrink-0">
            <img src={user.photoURL} alt="You" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
        )}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKey}
            disabled={!user || isPosting}
            placeholder={user ? (replyTo ? `Reply to ${replyTo.name}…` : 'Write a comment…  (Enter to send)') : 'Sign in to comment'}
            rows={1}
            className={`w-full resize-none rounded-2xl border px-4 py-3 pr-12 text-sm font-medium outline-none transition-all leading-relaxed
              ${inputBase} disabled:opacity-40 overflow-hidden`}
            style={{ minHeight: '48px', maxHeight: '120px' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
          />
          <button
            type="submit"
            disabled={!text.trim() || !user || isPosting}
            className="absolute right-3 bottom-3 text-small-orange hover:scale-110 active:scale-90 transition-all disabled:opacity-25 disabled:pointer-events-none"
          >
            {isPosting
              ? <Loader2 size={20} className="animate-spin" />
              : <Send size={20} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </form>
  );
};

// ─── Poll Types ───────────────────────────────────────────────────────────────

interface PollData {
  id: string;
  postId: string;
  creatorId: string;
  creatorName: string;
  creatorPhoto?: string;
  question: string;
  options: string[];
  votes: Record<string, string[]>; // optionIndex -> array of voter UIDs
  allowMultiple: boolean;
  endsAt?: number;
  isAnonymous: boolean;
  createdAt: number;
}

// ─── PollDisplay ──────────────────────────────────────────────────────────────

const PollDisplay: React.FC<{ poll: PollData; isDark: boolean }> = ({ poll, isDark }) => {
  const uid = auth.currentUser?.uid;
  const isExpired = poll.endsAt ? poll.endsAt < Date.now() : false;

  const totalVotes = Object.values(poll.votes).reduce((sum, uids) => sum + uids.length, 0);

  const myVotes = uid
    ? Object.entries(poll.votes)
        .filter(([, uids]) => uids.includes(uid))
        .map(([idx]) => idx)
    : [];
  const hasVoted = myVotes.length > 0;

  const handleVote = async (optionIdx: number) => {
    if (!uid || isExpired) return;
    const ref = doc(db, 'polls', poll.id);
    const field = `votes.${optionIdx}`;
    const alreadyVoted = myVotes.includes(String(optionIdx));

    if (alreadyVoted) {
      await updateDoc(ref, { [field]: arrayRemove(uid) });
    } else {
      if (!poll.allowMultiple) {
        // Remove previous vote first
        for (const prev of myVotes) {
          await updateDoc(ref, { [`votes.${prev}`]: arrayRemove(uid) });
        }
      }
      await updateDoc(ref, { [field]: arrayUnion(uid) });
    }
  };

  const bg = isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-black/[0.03] border-black/[0.06]';
  const textBase = isDark ? 'text-white' : 'text-black';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-4 space-y-3 ${bg}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart2 size={14} className="text-small-orange shrink-0" />
        <span className="text-[9px] font-black uppercase tracking-widest text-small-orange">Poll</span>
        {isExpired && (
          <span className="ml-auto text-[8px] font-bold text-white/20 uppercase flex items-center gap-1">
            <Clock size={9} /> Ended
          </span>
        )}
      </div>

      <p className={`text-sm font-bold leading-snug ${textBase}`}>{poll.question}</p>

      {/* Options */}
      <div className="space-y-2">
        {poll.options.map((option, i) => {
          const count = poll.votes[i]?.length ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isMyVote = myVotes.includes(String(i));

          return (
            <button
              key={i}
              onClick={() => handleVote(i)}
              disabled={isExpired || !uid}
              className={`w-full relative overflow-hidden rounded-xl border text-left transition-all ${
                isMyVote
                  ? 'border-small-orange/50 bg-small-orange/10'
                  : isDark ? 'border-white/10 hover:border-white/20 bg-white/[0.03]' : 'border-black/10 hover:border-black/20 bg-black/[0.03]'
              } disabled:cursor-not-allowed`}
            >
              {/* Progress bar fill */}
              {(hasVoted || isExpired) && (
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-700 rounded-xl ${isMyVote ? 'bg-small-orange/15' : isDark ? 'bg-white/5' : 'bg-black/5'}`}
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isMyVote ? 'bg-small-orange border-small-orange' : isDark ? 'border-white/20' : 'border-black/20'}`}>
                    {isMyVote && <Check size={9} className="text-white" />}
                  </div>
                  <span className={`text-[11px] font-bold ${textBase}`}>{option}</span>
                </div>
                {(hasVoted || isExpired) && (
                  <span className={`text-[9px] font-black ${isMyVote ? 'text-small-orange' : isDark ? 'text-white/30' : 'text-black/30'}`}>{pct}%</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-[9px] font-bold text-white/20">
          <Users size={9} /> {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
        </span>
        {poll.endsAt && !isExpired && (
          <span className="flex items-center gap-1 text-[9px] font-bold text-white/20">
            <Clock size={9} />
            Ends {new Date(poll.endsAt).toLocaleDateString()}
          </span>
        )}
        {poll.isAnonymous && <span className="text-[9px] font-bold text-white/20">· Anonymous</span>}
      </div>
    </motion.div>
  );
};

// ─── PollComposer ─────────────────────────────────────────────────────────────

const PollComposer: React.FC<{ postId: string; onDone: () => void; isDark: boolean }> = ({ postId, onDone, isDark }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [endsAt, setEndsAt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addOption = () => { if (options.length < 4) setOptions(prev => [...prev, '']); };
  const removeOption = (i: number) => { if (options.length > 2) setOptions(prev => prev.filter((_, idx) => idx !== i)); };
  const updateOption = (i: number, val: string) => setOptions(prev => { const n = [...prev]; n[i] = val; return n; });

  const handleSubmit = async () => {
    const user = auth.currentUser;
    if (!user || !question.trim() || options.filter(o => o.trim()).length < 2) return;
    setIsSubmitting(true);
    try {
      const votes: Record<string, string[]> = {};
      options.forEach((_, i) => { votes[i] = []; });

      await addDoc(collection(db, 'polls'), {
        postId,
        creatorId: user.uid,
        creatorName: user.displayName || 'Anonymous',
        creatorPhoto: user.photoURL || '',
        question: question.trim(),
        options: options.filter(o => o.trim()),
        votes,
        allowMultiple,
        isAnonymous,
        endsAt: endsAt ? new Date(endsAt).getTime() : null,
        createdAt: Date.now(),
      });
      onDone();
    } finally {
      setIsSubmitting(false);
    }
  };

  const bg = isDark ? 'bg-white/[0.05] border-white/10' : 'bg-black/[0.04] border-black/10';
  const inputBase = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder:text-white/20'
    : 'bg-black/5 border-black/10 text-black placeholder:text-black/20';

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={`rounded-2xl border p-4 space-y-3 overflow-hidden ${bg}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-small-orange" />
          <span className="text-[9px] font-black uppercase tracking-widest text-small-orange">Create Poll</span>
        </div>
        <button onClick={onDone} className="p-1 hover:bg-white/10 rounded-lg transition-all"><X size={14} /></button>
      </div>

      <input
        value={question}
        onChange={e => setQuestion(e.target.value)}
        placeholder="Ask a question…"
        className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-all ${inputBase}`}
      />

      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={opt}
              onChange={e => updateOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              className={`flex-1 rounded-xl border px-3 py-2 text-[12px] outline-none transition-all ${inputBase}`}
            />
            {options.length > 2 && (
              <button onClick={() => removeOption(i)} className="p-1.5 hover:bg-red-500/10 rounded-lg transition-all shrink-0">
                <X size={12} className="text-red-400" />
              </button>
            )}
          </div>
        ))}
        {options.length < 4 && (
          <button
            onClick={addOption}
            className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all"
          >
            <Plus size={11} /> Add option
          </button>
        )}
      </div>

      {/* Settings */}
      <div className="flex items-center gap-4 flex-wrap">
        {[
          { label: 'Multi-choice', value: allowMultiple, set: setAllowMultiple },
          { label: 'Anonymous', value: isAnonymous, set: setIsAnonymous },
        ].map(({ label, value, set }) => (
          <button
            key={label}
            onClick={() => set((v: boolean) => !v)}
            className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${value ? 'text-small-orange' : 'text-white/30 hover:text-white'}`}
          >
            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${value ? 'bg-small-orange border-small-orange' : 'border-white/20'}`}>
              {value && <Check size={9} className="text-white" />}
            </div>
            {label}
          </button>
        ))}

        <input
          type="date"
          value={endsAt}
          onChange={e => setEndsAt(e.target.value)}
          className={`text-[9px] rounded-lg border px-2 py-1 outline-none ${inputBase}`}
          title="Ends at (optional)"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || !question.trim() || options.filter(o => o.trim()).length < 2}
        className="w-full py-2.5 bg-small-orange text-white text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-small-orange/80 transition-all disabled:opacity-30"
      >
        {isSubmitting ? 'Creating…' : 'Create Poll'}
      </button>
    </motion.div>
  );
};

// ─── CommentSection (main) ────────────────────────────────────────────────────

const mapLegacyComment = (c: any): PostComment => ({
  id: c.id,
  text: c.text || '',
  authorId: c.uid || c.authorId || '',
  authorName: c.author || c.authorName || 'User',
  authorPhoto: c.authorPhoto || '',
  timestamp: c.timestamp || 0,
  parentId: c.parentId || null,
  likedBy: c.likedBy || [],
  likesCount: c.likesCount || 0,
});

const CommentSection: React.FC<CommentSectionProps> = ({
  postId,
  postAuthorId,
  initialCount = 0,
  comments: externalComments,
  onPostComment,
  onPostGif,
  currentUser: _currentUser,
  title: _title,
  themeColor: _themeColor,
  onVisitUser,
  onClose,
  layout = 'inline'
}) => {
  const isLegacy = externalComments !== undefined;
  const { theme } = useGlobalPlayerState();
  const isDark = theme !== 'LIGHT';

  const [internalComments, setInternalComments] = useState<PostComment[]>([]);
  const [pendingLegacy, setPendingLegacy] = useState<PostComment[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(!isLegacy);
  const [showSignIn, setShowSignIn] = useState(false);
  const [polls, setPolls] = useState<PollData[]>([]);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch polls for this post
  useEffect(() => {
    if (!postId || isLegacy) return;
    const q = query(collection(db, 'polls'), where('postId', '==', postId), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setPolls(snap.docs.map(d => ({ id: d.id, ...d.data() } as PollData)));
    });
    return unsub;
  }, [postId, isLegacy]);

  // Subscribe only in self-contained mode
  useEffect(() => {
    if (isLegacy || !postId) return;
    setIsLoading(true);
    const unsub = subscribeToPostComments(postId, (fetched) => {
      setInternalComments(prev => {
        const fetchedIds = new Set(fetched.map((c: PostComment) => c.id));
        const stillPending = prev.filter(c => c.isPending && !fetchedIds.has(c.id));
        return [...fetched, ...stillPending].sort((a, b) => a.timestamp - b.timestamp);
      });
      setPendingIds(new Set());
      setIsLoading(false);
    });
    return unsub;
  }, [postId, isLegacy]);

  const comments = isLegacy
    ? [...(externalComments || []).map(mapLegacyComment), ...pendingLegacy]
    : internalComments;

  // Auto-scroll to bottom when new comment lands
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments.length]);

  const handleCommentPosted = useCallback((optimistic: PostComment) => {
    if (isLegacy) {
      setPendingLegacy(prev => [...prev, optimistic]);
      setTimeout(() => setPendingLegacy(prev => prev.filter(c => c.id !== optimistic.id)), 8000);
    } else {
      setInternalComments(prev => [...prev, optimistic]);
    }
    setPendingIds(prev => new Set([...prev, optimistic.id]));
  }, [isLegacy]);

  const handleDelete = useCallback(async (commentId: string) => {
    if (isLegacy) return;
    setInternalComments(prev => prev.filter(c => c.id !== commentId));
    try {
      await deletePostComment(postId!, commentId);
    } catch {
      // If delete fails, snapshot will restore it
    }
  }, [postId]);

  const handleLikeToggle = useCallback(async (commentId: string) => {
    if (isLegacy || !postId) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setInternalComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      const likedBy = c.likedBy || [];
      const liked = likedBy.includes(uid);
      return {
        ...c,
        likedBy: liked ? likedBy.filter(id => id !== uid) : [...likedBy, uid],
        likesCount: (c.likesCount || 0) + (liked ? -1 : 1)
      };
    }));
    try {
      await toggleCommentLike(postId, commentId);
    } catch {
      // snapshot will correct
    }
  }, [postId, isLegacy]);

  const rootComments = comments.filter(c => !c.parentId);
  const count = comments.filter(c => !c.isPending).length;
  const safePostId = postId || '';

  // ── Theme tokens ───────────────────────────────────────────────────────────
  const card = isDark
    ? 'bg-black/60 backdrop-blur-3xl border-white/8'
    : 'bg-white/80 backdrop-blur-3xl border-black/8';
  const headerBorder = isDark ? 'border-white/6' : 'border-black/6';
  const subtext = isDark ? 'text-white/25' : 'text-black/25';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: 'spring', stiffness: 360, damping: 32 }}
      className={`flex flex-col ${layout === 'panel' ? 'h-[70vh]' : 'max-h-[600px]'} ${card} border rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.45)]`}
    >
      {/* ── Header ── */}
      <div className={`flex items-center justify-between px-5 sm:px-8 py-4 border-b ${headerBorder} shrink-0`}>
        <div className="flex items-center gap-3">
          <MessageCircle size={16} className="text-small-orange" />
          <div>
            <h4 className={`text-[11px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-white' : 'text-black'}`}>
              Comments
            </h4>
            <p className={`text-[9px] font-bold uppercase tracking-widest ${subtext}`}>
              {isLoading ? '—' : count} {count === 1 ? 'signal' : 'signals'}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-90
              ${isDark ? 'text-white/30 hover:text-white hover:bg-white/5' : 'text-black/30 hover:text-black hover:bg-black/5'}`}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* ── Comment list ── */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 space-y-6 custom-scrollbar">
        {/* Polls */}
        {polls.length > 0 && (
          <div className="space-y-3">
            {polls.map(poll => (
              <PollDisplay key={poll.id} poll={poll} isDark={isDark} />
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={24} className="animate-spin text-small-orange opacity-50" />
            <p className={`text-[9px] font-black uppercase tracking-[0.3em] ${subtext}`}>
              Loading signals…
            </p>
          </div>
        ) : rootComments.length === 0 && polls.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center justify-center py-16 gap-4 select-none"
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDark ? 'bg-white/4' : 'bg-black/4'}`}>
              <MessageCircle size={28} className={`${subtext} stroke-[1.2]`} />
            </div>
            <p className={`text-[10px] font-black uppercase tracking-[0.4em] ${subtext}`}>
              Be the first to broadcast
            </p>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {rootComments.map(comment => (
              <CommentBubble
                key={comment.id}
                comment={comment}
                allComments={comments}
                postId={safePostId}
                onReply={(id, name) => setReplyTo({ id, name })}
                onDelete={handleDelete}
                onLikeToggle={handleLikeToggle}
                onVisitUser={onVisitUser}
                depth={0}
                isDark={isDark}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ── Input footer ── */}
      <div className={`px-5 sm:px-8 py-4 sm:py-5 border-t ${headerBorder} shrink-0 ${isDark ? 'bg-black/30' : 'bg-white/50'} space-y-3`}>
        {/* Poll composer toggle */}
        {auth.currentUser && postId && !isLegacy && (
          <AnimatePresence>
            {showPollComposer ? (
              <PollComposer
                key="composer"
                postId={postId}
                onDone={() => setShowPollComposer(false)}
                isDark={isDark}
              />
            ) : null}
          </AnimatePresence>
        )}

        {auth.currentUser ? (
          <div className="space-y-2">
            {/* Reply-to indicator */}
            <AnimatePresence>
              {replyTo && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center justify-between px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-small-orange/10 text-small-orange overflow-hidden"
                >
                  <span className="flex items-center gap-2">
                    <Reply size={10} /> Replying to @{replyTo.name}
                  </span>
                  <button type="button" onClick={() => setReplyTo(null)} className="hover:opacity-60 transition-opacity">
                    <X size={12} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Rich composer — same as Plajah Social */}
            <UniversalPostComposer
              currentUser={auth.currentUser}
              compact={true}
              placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Write a comment…'}
              avatarUrl={auth.currentUser.photoURL || undefined}
              onPost={async (data: ComposerPostData) => {
                if (!data.text.trim() && data.attachments.length === 0) return;
                const user = auth.currentUser!;
                const now = Date.now();

                // Upload any video/audio attachments to Firebase Storage
                let videoUrl: string | undefined;
                let audioUrl: string | undefined;
                let gifUrl: string | undefined;
                for (const att of data.attachments) {
                  if ((att.type === 'VIDEO' || att.type === 'AUDIO') && att.file) {
                    try {
                      const path = `comments/${safePostId}/${now}_${att.file.name}`;
                      const url = await uploadFile(path, att.file);
                      if (url) { att.type === 'VIDEO' ? (videoUrl = url) : (audioUrl = url); }
                    } catch { /* skip failed upload */ }
                  } else if (att.type === 'GIF' && att.url) {
                    gifUrl = att.url;
                  }
                }

                const optimistic: PostComment = {
                  id: `pending-${now}`,
                  text: data.text.trim(),
                  authorId: user.uid,
                  authorName: user.displayName || 'Anonymous',
                  authorPhoto: user.photoURL || '',
                  timestamp: now,
                  parentId: replyTo?.id ?? null,
                  likedBy: [],
                  likesCount: 0,
                  ...(videoUrl ? { videoUrl } : {}),
                  ...(audioUrl ? { audioUrl } : {}),
                  ...(gifUrl   ? { gifUrl   } : {}),
                };
                handleCommentPosted(optimistic);
                const parentId = replyTo?.id;
                setReplyTo(null);
                if (isLegacy && onPostComment) {
                  await onPostComment(data.text.trim(), parentId);
                  if (gifUrl && onPostGif) await onPostGif(gifUrl, parentId);
                } else {
                  await addPostComment(safePostId, data.text.trim(), parentId, videoUrl, audioUrl, gifUrl);
                }
              }}
            />
            <div className="flex items-center gap-4">
              {postId && !isLegacy && (
                <button
                  onClick={() => setShowPollComposer(p => !p)}
                  className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${showPollComposer ? 'text-small-orange' : isDark ? 'text-white/20 hover:text-white' : 'text-black/20 hover:text-black'}`}
                >
                  <BarChart2 size={11} />
                  {showPollComposer ? 'Cancel poll' : 'Add poll'}
                </button>
              )}

              {/* GIF / Sticker quick-send */}
              <div className="relative">
                <button
                  onClick={() => setShowGifPicker(v => !v)}
                  className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${showGifPicker ? 'text-small-orange' : isDark ? 'text-white/20 hover:text-white' : 'text-black/20 hover:text-black'}`}
                >
                  <Sparkles size={11} />
                  GIF / Sticker
                </button>

                <AnimatePresence>
                  {showGifPicker && (
                    <>
                      <div className="fixed inset-0 z-[190]" onClick={() => setShowGifPicker(false)} />
                      <GifStickerPicker
                        onClose={() => setShowGifPicker(false)}
                        anchorClass="bottom-full mb-2 left-0"
                        onSelect={async (url, type) => {
                          setShowGifPicker(false);
                          const user = auth.currentUser;
                          if (!user) return;
                          const now = Date.now();
                          const optimistic: PostComment = {
                            id: `pending-${now}`,
                            text: '',
                            authorId: user.uid,
                            authorName: user.displayName || 'Anonymous',
                            authorPhoto: user.photoURL || '',
                            timestamp: now,
                            parentId: replyTo?.id ?? null,
                            likedBy: [],
                            likesCount: 0,
                            gifUrl: url,
                          } as any;
                          handleCommentPosted(optimistic);
                          const parentId = replyTo?.id;
                          setReplyTo(null);
                          if (isLegacy) {
                            if (onPostGif) await onPostGif(url, parentId);
                          } else {
                            await addPostComment(safePostId, '', parentId, undefined, undefined, url);
                          }
                        }}
                      />
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowSignIn(true)}
            className={`w-full flex items-center justify-center gap-2.5 py-3 rounded-2xl border transition-all text-[10px] font-black uppercase tracking-widest
              ${isDark
                ? 'border-white/10 text-white/40 hover:border-white/20 hover:text-white bg-white/3 hover:bg-white/5'
                : 'border-black/10 text-black/40 hover:border-black/20 hover:text-black bg-black/3 hover:bg-black/5'}`}
          >
            <LogIn size={13} />
            Sign in to join the conversation
          </button>
        )}
      </div>

      <AnimatePresence>
        {showSignIn && (
          <SignInPrompt action="comment" onClose={() => setShowSignIn(false)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default CommentSection;
