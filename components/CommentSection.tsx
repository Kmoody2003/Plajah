import React, { useState, useEffect, useRef } from 'react';
import { Comment, VideoComment } from '../types';
import { Send, Smile, Image as ImageIcon, Reply, ChevronDown, ChevronUp, User, X, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import { searchUserProfiles } from '../services/backendService';
import { UserProfile } from '../types';

interface CommentSectionProps {
  comments: (Comment | VideoComment)[];
  onPostComment: (text: string, parentId?: string, mediaTimestamp?: number) => Promise<void>;
  onVisitUser?: (uid: string) => void;
  currentUser: any;
  themeColor?: string;
  title?: string;
  onClose?: () => void;
}

const EMOJIS = ['🔥', '❤️', '🙌', '✨', '💎', '🚀', '🎸', '🎨', '🎧', '💯', '🤩', '👏', '🌈', '⚡', '🌊'];

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const TRENDING_GIFS = [
  { id: '1', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/l41lI4bYvYvYvYvYv/giphy.gif', title: 'Dance' },
  { id: '2', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKD5lJvYvYvYvYv/giphy.gif', title: 'Vibe' },
  { id: '3', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/l0HlHFRbmaZtBRhXG/giphy.gif', title: 'Music' },
  { id: '4', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJqZ3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6Z3R6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKVUn7iM8FMEU24/giphy.gif', title: 'Party' },
];

const CommentItem: React.FC<{
  comment: any;
  allComments: any[];
  onReply: (parentId: string) => void;
  onVisitUser?: (uid: string) => void;
  depth?: number;
  theme: string;
}> = ({ comment, allComments, onReply, onVisitUser, depth = 0, theme }) => {
  const [showReplies, setShowReplies] = useState(true);
  const replies = allComments.filter(c => c.parentId === comment.id);
  const authorName = comment.userName || comment.author || 'Anonymous';
  const authorPhoto = comment.userPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authorName}`;
  const userId = comment.userId || comment.uid;

  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [showReactions, setShowReactions] = useState(false);

  const toggleReaction = (emoji: string) => {
    setReactions(prev => {
      const current = prev[emoji] || 0;
      return { ...prev, [emoji]: current > 0 ? 0 : 1 };
    });
    setShowReactions(false);
  };

  const renderCommentText = (text: string) => {
    if (text.startsWith('http') && text.includes('giphy.gif')) {
      return <img src={text || null} alt="GIF" className="rounded-2xl max-w-full md:max-w-[300px] shadow-2xl border border-white/10" referrerPolicy="no-referrer" />;
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const mentionRegex = /(@\[[^\]]+\]\([^\)]+\))/g;
    
    // Split by both URL and Mentions
    const parts = text.split(/((?:https?:\/\/[^\s]+)|(?:@\[[^\]]+\]\([^\)]+\)))/g);

    return (
      <p className={`text-sm font-medium leading-relaxed comment-text ${theme === 'LIGHT' ? 'text-black/90' : 'text-white/90'}`}>
        {parts.map((part, i) => {
          if (part.match(urlRegex)) {
            return (
              <a 
                key={i} 
                href={part} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-small-orange hover:underline break-all font-black"
                onClick={(e) => e.stopPropagation()}
              >
                {part}
              </a>
            );
          }
          
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
      </p>
    );
  };

  return (
    <div className={`flex flex-col gap-4 ${depth > 0 ? `ml-6 md:ml-12 border-l-2 ${theme === 'LIGHT' ? 'border-black/5' : 'border-white/5'} pl-4 md:pl-6` : ''}`}>
      <div className="flex gap-4 group relative">
        <div 
          className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl overflow-hidden shrink-0 ring-2 ${theme === 'LIGHT' ? 'ring-black/5 shadow-sm' : 'ring-white/5 shadow-xl'} cursor-pointer hover:scale-105 transition-transform`}
          onClick={() => userId && onVisitUser?.(userId)}
        >
          <img src={authorPhoto || null} alt={authorName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
            <span 
              className={`text-[11px] font-black uppercase tracking-[0.1em] ${theme === 'LIGHT' ? 'text-black hover:text-small-orange' : 'text-white hover:text-small-orange'} cursor-pointer transition-colors`}
              onClick={() => userId && onVisitUser?.(userId)}
            >
              {authorName}
            </span>
            <span className={`text-[9px] font-bold font-mono ${theme === 'LIGHT' ? 'text-black/30' : 'text-white/30'} uppercase tracking-widest`}>
              {new Date(comment.timestamp).toLocaleDateString()}
              {comment.mediaTimestamp !== undefined && (
                <span className="ml-2 text-small-orange px-1.5 py-0.5 bg-small-orange/10 rounded-md">@ {formatTime(comment.mediaTimestamp)}</span>
              )}
            </span>
          </div>

          <div className="relative space-y-3">
            {renderCommentText(comment.text)}
            
            {(Object.keys(reactions).some(k => (reactions[k] || 0) > 0)) && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(reactions).filter(([_, count]) => (count || 0) > 0).map(([emoji, count]) => (
                  <button 
                    key={emoji} 
                    onClick={() => toggleReaction(emoji)} 
                    className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-2 transition-all hover:scale-110 ${theme === 'LIGHT' ? 'bg-black/5 border-black/10 text-black' : 'bg-white/5 border-white/10 text-white'}`}
                  >
                    {emoji} <span className="text-[10px] opacity-40 font-mono">{count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-6 mt-4">
            <div className="relative">
              <button 
                onClick={() => setShowReactions(!showReactions)}
                className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] ${theme === 'LIGHT' ? 'text-black/40 hover:text-black' : 'text-white/40 hover:text-white'} transition-all`}
              >
                <Smile size={12} className="opacity-60" /> React
              </button>
              
              <AnimatePresence>
                {showReactions && (
                  <>
                    <div className="fixed inset-0 z-50" onClick={() => setShowReactions(false)} />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      className={`absolute left-0 bottom-full mb-3 bg-white/10 backdrop-blur-3xl border border-white/20 rounded-2xl p-2 z-[60] flex flex-wrap gap-1 w-[200px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${theme === 'LIGHT' ? 'bg-white border-black/10' : ''}`}
                    >
                      {['🔥', '❤️', '🙌', '✨', '💯', '🚀', '🎸', '🎨', '🎧', '👏', '😂', '😮', '😢', '😍'].map(emoji => (
                        <button 
                          key={emoji}
                          onClick={() => toggleReaction(emoji)}
                          className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 rounded-xl transition-all hover:scale-125"
                        >
                          {emoji}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <button 
              onClick={() => onReply(comment.id)}
              className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] ${theme === 'LIGHT' ? 'text-black/40 hover:text-black' : 'text-white/40 hover:text-white'} transition-all`}
            >
              <Reply size={12} className="opacity-60" /> Reply
            </button>

            <button 
              onClick={() => {
                const textToShare = `@${authorName} broadcasted: "${comment.text}" #Plajah #Ecosystem`;
                if (navigator.share) {
                  navigator.share({ text: textToShare });
                } else {
                  navigator.clipboard.writeText(textToShare);
                  alert('Signal link intercepted.');
                }
              }}
              className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] ${theme === 'LIGHT' ? 'text-black/40 hover:text-black' : 'text-white/40 hover:text-white'} transition-all`}
            >
              <Share2 size={12} className="opacity-60" /> Share
            </button>

            {replies.length > 0 && (
              <button 
                onClick={() => setShowReplies(!showReplies)}
                className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] ${theme === 'LIGHT' ? 'text-black/40 hover:text-black' : 'text-white/40 hover:text-white'} transition-all ml-auto`}
              >
                {showReplies ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
              </button>
            )}
          </div>
        </div>
      </div>

      {showReplies && replies.length > 0 && (
        <div className="flex flex-col gap-8 mt-4">
          {replies.map(reply => (
            <CommentItem 
              key={reply.id} 
              comment={reply} 
              allComments={allComments} 
              onReply={onReply} 
              onVisitUser={onVisitUser}
              depth={depth + 1}
              theme={theme}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CommentSection: React.FC<CommentSectionProps> = ({ 
  comments, 
  onPostComment, 
  onVisitUser, 
  currentUser, 
  themeColor = '#FF8C00',
  title = "Discussion Feed",
  onClose
}) => {
  const { theme } = useGlobalPlayerState();

  const getThemeStyles = () => {
    switch (theme) {
      case 'LIGHT':
        return {
          container: 'bg-white border-black/5',
          headerText: 'text-black',
          itemText: 'text-black',
          itemSubtext: 'text-black/30',
          input: 'bg-black/5 border-black/10 focus:ring-black/5 text-black',
          btnHover: 'hover:bg-black/5 text-black/40 hover:text-black',
          activeBtn: 'bg-black text-white',
          footer: 'bg-white border-black/5'
        };
      case 'PASTEL':
        return {
          container: 'bg-white/60 backdrop-blur-3xl border-rose-100',
          headerText: 'text-rose-900',
          itemText: 'text-rose-900',
          itemSubtext: 'text-rose-700/30',
          input: 'bg-rose-50 border-rose-100 focus:ring-rose-100 text-rose-900',
          btnHover: 'hover:bg-rose-100/50 text-rose-400 hover:text-rose-900',
          activeBtn: 'bg-rose-500 text-white',
          footer: 'bg-rose-50/80 border-rose-100'
        };
      case 'CITRUS':
        return {
          container: 'bg-black/90 backdrop-blur-3xl border-[#FF3B00]/20',
          headerText: 'text-white',
          itemText: 'text-white',
          itemSubtext: 'text-white/40',
          input: 'bg-white/5 border-[#FF3B00]/20 focus:ring-[#FF3B00]/30 text-white',
          btnHover: 'bg-[#FF3B00]/10 text-white/40 hover:text-[#FF3B00]',
          activeBtn: 'bg-[#FF3B00] text-white',
          footer: 'bg-[#111111]/90 border-[#FF3B00]/20'
        };
      default:
        return {
          container: 'bg-black/80 backdrop-blur-3xl border-white/10',
          headerText: 'text-white',
          itemText: 'text-white',
          itemSubtext: 'text-white/20',
          input: 'bg-white/5 border-white/10 focus:ring-white/5 text-white',
          btnHover: 'bg-white/5 text-white/40 hover:text-white',
          activeBtn: 'bg-white text-black',
          footer: 'bg-black/90 border-white/5'
        };
    }
  };

  const s = getThemeStyles();
  const [newComment, setNewComment] = useState('');
  const [useTimestamp, setUseTimestamp] = useState(false);
  const { currentTime } = useGlobalPlayerProgress();
  const [isPosting, setIsPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const rootComments = comments.filter(c => !c.parentId);

  useEffect(() => {
    if (replyingTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyingTo]);

  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState(-1);

  useEffect(() => {
    const handleMentionSearch = async () => {
      if (mentionSearch.length > 0) {
        const users = await searchUserProfiles(mentionSearch);
        setSuggestedUsers(users);
        setShowMentionDropdown(users.length > 0);
      } else {
        setShowMentionDropdown(false);
      }
    };
    handleMentionSearch();
  }, [mentionSearch]);

  const handleMentionInputChange = (val: string, cursorIndex: number) => {
    setNewComment(val);
    const lastAtPos = val.lastIndexOf('@', cursorIndex - 1);
    if (lastAtPos !== -1) {
      const textAfterAt = val.substring(lastAtPos + 1, cursorIndex);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setMentionSearch(textAfterAt);
        setMentionTriggerIndex(lastAtPos);
        return;
      }
    }
    setMentionTriggerIndex(-1);
    setMentionSearch('');
    setShowMentionDropdown(false);
  };

  const handleSelectMention = (user: UserProfile) => {
    const beforeMention = newComment.substring(0, mentionTriggerIndex);
    const afterMention = newComment.substring(mentionTriggerIndex + 1 + mentionSearch.length);
    const updatedContent = `${beforeMention}@[${user.displayName}](${user.uid})${afterMention}`;
    setNewComment(updatedContent);
    setMentionTriggerIndex(-1);
    setMentionSearch('');
    setShowMentionDropdown(false);
  };

  const handlePost = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newComment.trim() || !currentUser) return;
    setIsPosting(true);
    try {
      await (onPostComment as any)(
        newComment, 
        replyingTo || undefined, 
        useTimestamp ? currentTime : undefined
      );
      setNewComment('');
      setReplyingTo(null);
      setUseTimestamp(false);
      setShowEmojiPicker(false);
      setShowGifPicker(false);
    } finally {
      setIsPosting(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    setNewComment(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const insertGif = (gifUrl: string) => {
    setNewComment(gifUrl);
    handlePost();
  };

  return (
    <div className={`flex flex-col h-full ${s.container} rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl transition-all duration-500`}>
      <div className={`p-5 md:p-8 border-b ${theme === 'LIGHT' ? 'border-black/5' : 'border-white/5'} flex items-center justify-between`}>
        <div className="flex items-center gap-4">
          {onClose && (
            <button 
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-current transition-all active:scale-90"
              title="Close Panel"
            >
              <X size={16} />
            </button>
          )}
          <div className="space-y-0.5">
            <h3 className={`text-[11px] font-black uppercase tracking-[0.2em] ${s.headerText}`}>{title}</h3>
            {title.toLowerCase().includes('global') && (
              <div className="flex items-center gap-2 text-[#00FF00]">
                <div className="w-1 h-1 rounded-full bg-[#00FF00] animate-pulse" />
                <span className="text-[8px] font-black uppercase tracking-widest opacity-60">High Frequency</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end">
           <span className={`text-[10px] font-black font-mono ${s.itemSubtext}`}>{comments.length}</span>
           <span className={`text-[7px] font-black uppercase tracking-widest ${s.itemSubtext}`}>Signals</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 md:p-10 space-y-10 custom-scrollbar">
        {rootComments.length === 0 ? (
          <div className={`py-32 text-center ${s.itemSubtext} opacity-20`}>
            <Send size={48} className="mx-auto mb-6 stroke-[1]" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em]">Awaiting first transmission...</p>
          </div>
        ) : (
          rootComments.map(comment => (
            <div key={comment.id} className={theme === 'LIGHT' ? 'text-black' : 'text-white'}>
               <CommentItem 
                comment={comment} 
                allComments={comments} 
                onReply={(id) => setReplyingTo(id)} 
                onVisitUser={onVisitUser}
                theme={theme}
               />
            </div>
          ))
        )}
      </div>

      <div className={`p-5 md:p-8 border-t ${theme === 'LIGHT' ? 'border-black/5' : 'border-white/5'} ${s.footer} relative`}>
        <AnimatePresence>
          {replyingTo && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={`absolute bottom-full left-5 right-5 mb-4 p-4 ${theme === 'LIGHT' ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'} border rounded-2xl flex items-center justify-between backdrop-blur-xl`}
            >
              <div className="flex items-center gap-3">
                <Reply size={14} className="text-small-orange" />
                <span className={`text-[9px] font-black uppercase tracking-widest ${s.headerText}`}>
                  Replying to <span className="text-small-orange">@{(() => {
                    const c = comments.find(c => c.id === replyingTo);
                    if (!c) return 'Anonymous';
                    return (c as any).userName || (c as any).author || 'Anonymous';
                  })()}</span>
                </span>
              </div>
              <button onClick={() => setReplyingTo(null)} className={`${s.itemSubtext} hover:text-current active:scale-90 transition-transform`}><X size={16} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handlePost} className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button 
              type="button"
              onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }}
              className={`p-2.5 rounded-xl transition-all active:scale-95 ${showEmojiPicker ? s.activeBtn : s.btnHover}`}
            >
              <Smile size={18} />
            </button>
            <button 
              type="button"
              onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); }}
              className={`p-2.5 rounded-xl transition-all active:scale-95 ${showGifPicker ? s.activeBtn : s.btnHover}`}
            >
              <ImageIcon size={18} />
            </button>
            <button 
              type="button"
              onClick={() => setUseTimestamp(!useTimestamp)}
              className={`px-4 py-2 text-center rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 ${useTimestamp ? s.activeBtn : s.btnHover}`}
            >
              {useTimestamp ? `Linked: ${formatTime(currentTime)}` : 'Timestamp'}
            </button>
          </div>

          <AnimatePresence>
            {showEmojiPicker && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className={`absolute bottom-full left-5 mb-4 p-4 ${theme === 'LIGHT' ? 'bg-white border-black/10' : 'bg-[#0a0a0a] border-white/10'} border rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] z-50 grid grid-cols-5 gap-1 md:w-auto w-[calc(100%-2.5rem)]`}
              >
                {EMOJIS.map(emoji => (
                  <button 
                    key={emoji} 
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    className="text-2xl p-3 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-all hover:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </motion.div>
            )}

            {showGifPicker && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className={`absolute bottom-full left-5 mb-4 p-4 ${theme === 'LIGHT' ? 'bg-white border-black/10' : 'bg-[#0a0a0a] border-white/10'} border rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] z-50 md:w-80 w-[calc(100%-2.5rem)]`}
              >
                <div className="grid grid-cols-2 gap-3">
                  {TRENDING_GIFS.map(gif => (
                    <button 
                      key={gif.id} 
                      type="button"
                      onClick={() => insertGif(gif.url)}
                      className="relative aspect-video rounded-xl overflow-hidden group active:scale-95 transition-transform"
                    >
                      <img src={gif.url || null} alt={gif.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-[10px] font-black uppercase text-white tracking-widest">{gif.title}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative group/input">
            <input 
              ref={inputRef}
              type="text" 
              value={newComment}
              onChange={(e) => handleMentionInputChange(e.target.value, e.target.selectionStart || 0)}
              placeholder={currentUser ? (replyingTo ? "Compose reply..." : "Broadcast signal...") : "Authentication Required"}
              disabled={!currentUser || isPosting}
              className={`w-full ${s.input} rounded-[1.5rem] py-5 px-7 text-sm font-bold outline-none border transition-all disabled:opacity-50 placeholder:opacity-30`}
            />
            
            {showMentionDropdown && (
              <div className={`absolute left-0 bottom-full mb-4 w-72 ${theme === 'LIGHT' ? 'bg-white border-black/10' : 'bg-[#1A1A1A] border-white/10'} border rounded-[2rem] shadow-4xl overflow-hidden z-[100] animate-in fade-in slide-in-from-bottom-2`}>
                <div className={`p-4 border-b ${theme === 'LIGHT' ? 'border-black/5 bg-black/5' : 'border-white/10 bg-white/5'}`}>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${theme === 'LIGHT' ? 'text-black/40' : 'text-white/40'}`}>Mention Network</p>
                </div>
                <div className="max-h-60 overflow-y-auto no-scrollbar">
                  {suggestedUsers.map(user => (
                    <button
                      key={user.uid}
                      type="button"
                      onClick={() => handleSelectMention(user)}
                      className={`w-full flex items-center gap-4 p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left group`}
                    >
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 ring-2 ring-white/5 group-hover:ring-small-orange transition-all">
                        {user.photoURL ? (
                          <img src={user.photoURL || null} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20">
                            <User size={16} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm truncate ${theme === 'LIGHT' ? 'text-black' : 'text-white'}`}>{user.displayName}</p>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${theme === 'LIGHT' ? 'text-black/30' : 'text-white/30'}`}>Connect Node</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <button 
              type="submit"
              disabled={!newComment.trim() || !currentUser || isPosting}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-3 text-small-orange hover:scale-110 active:scale-90 transition-all disabled:opacity-0"
            >
              <Send size={22} className="stroke-[2.5]" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CommentSection;
