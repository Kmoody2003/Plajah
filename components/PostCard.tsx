import React, { useState, useEffect } from 'react';
import { Post, Album } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, MessageSquare, Share2, MoreHorizontal, ExternalLink, Play, Volume2, Image as ImageIcon, Link as LinkIcon, Edit2, Check, X as XIcon, ChevronRight } from 'lucide-react';
import MiniMusicPlayer from './MiniMusicPlayer';
import ThreeDImage from './ThreeDImage';
import ShareButton from './ShareButton';
import PayItForwardButton from './PayItForwardButton';
import { formatDistanceToNow } from 'date-fns';
import { auth, updatePost, deletePost, subscribeToComments, postComment } from '../services/backendService';
import { Trash2, Zap } from 'lucide-react';
import CommentSection from './CommentSection';
import { Comment } from '../types';

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
  const [isLiked, setIsLiked] = useState(false);
  const [likes, setLikes] = useState(post.likesCount);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(post.text);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    let unsubscribe: () => void;
    if (showComments) {
      unsubscribe = subscribeToComments(post.id, null, null, setComments, post.sourceCollection || 'posts');
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [showComments, post.id, post.sourceCollection]);

  const handlePostComment = async (text: string, parentId?: string) => {
    if (!auth.currentUser) return;
    await postComment(post.id, {
      author: auth.currentUser.displayName || 'User',
      text,
      timestamp: Date.now(),
      uid: auth.currentUser.uid,
      parentId,
      trackId: 'album'
    }, post.sourceCollection || 'posts');
  };

  const isAuthor = auth.currentUser?.uid === post.authorId;
  const isTargeted = post.targetUserId && post.targetUserId !== post.authorId;

  const handleLike = () => {
    if (isLiked) {
      setLikes(prev => prev - 1);
    } else {
      setLikes(prev => prev + 1);
    }
    setIsLiked(!isLiked);
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
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.03] border border-white/5 rounded-[2.5rem] p-4 sm:p-6 md:p-8 hover:bg-white/[0.05] transition-all"
    >
      {/* Post Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="relative group/profile">
            <button 
              onClick={() => onVisitUser?.(post.authorId)}
              className="w-12 h-12 rounded-2xl overflow-hidden border border-white/10 hover:scale-105 transition-all"
            >
              <img src={post.authorPhoto || null} alt={post.authorName} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
            </button>
            {auth.currentUser?.uid !== post.authorId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Trigger a global event or navigate to chat with this user
                  window.dispatchEvent(new CustomEvent('START_CHAT', { detail: { userId: post.authorId } }));
                }}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-small-orange text-white rounded-lg flex items-center justify-center shadow-lg opacity-0 group-hover/profile:opacity-100 transition-all hover:scale-110"
                title="Message User"
              >
                <MessageSquare size={12} fill="currentColor" />
              </button>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => onVisitUser?.(post.authorId)}
                className="text-sm font-black uppercase tracking-widest hover:text-small-orange transition-colors block text-left"
              >
                {post.authorName}
              </button>
              {isTargeted && (
                <>
                  <ChevronRight size={12} className="text-white/20" />
                  <button 
                    onClick={() => onVisitUser?.(post.targetUserId!)}
                    className="text-sm font-black uppercase tracking-widest hover:text-small-orange transition-colors block text-left text-white/60"
                  >
                    {post.targetUserName || 'Artist'}
                  </button>
                </>
              )}
            </div>
            <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest flex items-center gap-2">
              {formatDistanceToNow(post.timestamp)} ago
              {post.modifiedAt && (
                <span className="flex items-center gap-1 text-small-orange">
                  <span className="w-1.5 h-1.5 bg-small-orange rounded-full animate-pulse" />
                  <span>Modified</span>
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="relative">
          <button 
            onClick={() => setShowOptions(!showOptions)}
            className="p-2 text-white/20 hover:text-white transition-all"
          >
            <MoreHorizontal size={20} />
          </button>
          
          <AnimatePresence>
            {showOptions && isAuthor && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                className="absolute right-0 mt-2 w-48 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
              >
                <button 
                  onClick={async () => {
                    setShowOptions(false);
                    try {
                      // Dynamically importing fetchUserProfile so we don't break the top level imports or cause circular dependencies, or we can just assume it's imported if it is?
                      // Wait, I should add the import at the top of the file.
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

      {/* Post Content */}
      <div className="space-y-4">
        {isEditing ? (
          <div className="space-y-4">
            <textarea 
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-medium leading-relaxed text-white outline-none focus:border-small-orange/50 transition-all"
              rows={4}
            />
            <div className="flex items-center gap-2">
              <button 
                onClick={handleSaveEdit}
                disabled={isSaving || !editedText.trim()}
                className="px-6 py-2 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2"
              >
                {isSaving ? 'Saving...' : <><Check size={14} /> Save</>}
              </button>
              <button 
                onClick={() => { setIsEditing(false); setEditedText(post.text); }}
                className="px-6 py-2 bg-white/5 text-white/40 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
              >
                <XIcon size={14} /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {post.text && (
              <p className="text-sm font-medium leading-relaxed text-white/80 whitespace-pre-wrap">
                {post.text}
              </p>
            )}
          </>
        )}

        {/* Embedded Album Player */}
        {post.albumEmbed && (
          <div className="mt-4">
            <MiniMusicPlayer album={post.albumEmbed} autoPlay={post.autoPlayEmbed} />
          </div>
        )}

        {/* Rich Media */}
        {renderMedia()}
      </div>

      {/* Post Actions */}
      <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button 
            onClick={handleLike}
            className={`flex items-center gap-2 transition-all ${isLiked ? 'text-red-500' : 'text-white/40 hover:text-white'}`}
          >
            <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
            <span className="text-[10px] font-black tracking-widest">{likes}</span>
          </button>
          <button 
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-2 text-white/40 hover:text-white transition-all"
          >
            <MessageSquare size={18} />
            <span className="text-[10px] font-black tracking-widest">{post.commentsCount || comments.length || 0}</span>
          </button>
          <PayItForwardButton />
          <button 
            onClick={() => {
              window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(post.text || "Check out this post on Plajah")}&url=${encodeURIComponent(`${window.location.origin}/post/${post.id}`)}`, '_blank');
            }}
            className="flex items-center gap-2 text-white/40 hover:text-white transition-all"
            title="Share to X"
          >
            <XIcon size={18} />
          </button>
        </div>
        <ShareButton 
          title={`Post by ${post.authorName}`}
          text={post.text || "Check out this post on Plajah"}
          url={`${window.location.origin}/post/${post.id}`}
        />
      </div>

      <AnimatePresence>
        {showComments && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full mt-4 overflow-hidden"
          >
            <div className="pt-4 border-t border-white/5">
              <CommentSection
                comments={comments}
                onPostComment={handlePostComment}
                currentUser={auth.currentUser}
                onVisitUser={onVisitUser}
                title="Post Comments"
                onClose={() => setShowComments(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PostCard;
