import React, { useState, useEffect } from 'react';
import { Article, UserProfile, Comment } from '../types';
import { 
  ChevronLeft, 
  Share2, 
  Heart, 
  MessageSquare, 
  Bookmark, 
  Play, 
  Pause, 
  Volume2,
  Clock,
  UserPlus,
  MoreHorizontal,
  X,
  Quote
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { subscribeToComments, postComment, auth } from '../services/backendService';
import CommentSection from './CommentSection';
import The411 from './The411';
import PlajahPlusPill from './PlajahPlusPill';

interface ArticleViewProps {
  article: Article;
  onBack: () => void;
  onVisitUser?: (uid: string) => void;
  currentUser: UserProfile | null;
}

const ArticleView: React.FC<ArticleViewProps> = ({ article, onBack, onVisitUser, currentUser }) => {
  const [isLiked, setIsLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activeAudio, setActiveAudio] = useState<string | null>(null);
  const { theme } = useGlobalPlayerState();

  useEffect(() => {
    const unsubscribe = subscribeToComments(article.id, null, null, setComments, 'articles');
    return () => unsubscribe();
  }, [article.id]);

  const handlePostComment = async (text: string, parentId?: string) => {
    if (!currentUser) return;
    await postComment(article.id, {
      author: currentUser.displayName || 'Reader',
      text,
      timestamp: Date.now(),
      parentId: parentId || undefined
    }, 'articles');
  };

  const formatTime = (time: number) => {
    const date = new Date(time);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="fixed inset-0 bg-[var(--bg-color)] z-[90] flex flex-col overflow-hidden select-none pb-32 lg:pb-40 text-[var(--text-primary)]">
      {/* Top Bar */}
      <header className="h-20 bg-[var(--bg-color)]/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-8 z-50 shrink-0">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="p-3 hover:bg-white/10 rounded-full transition-all opacity-60 hover:opacity-100">
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10">
              <img src={article.authorPhoto || null} alt={article.authorName} className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest">{article.authorName}</p>
                <PlajahPlusPill creatorId={article.authorId} creatorName={article.authorName} size="XS" />
              </div>
              <p className="text-[8px] font-bold opacity-40 uppercase tracking-widest">{formatTime(article.timestamp)}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="p-3 rounded-full transition-all hover:bg-white/10 opacity-40 hover:opacity-100">
            <Share2 size={20} />
          </button>
          <button className="p-3 rounded-full transition-all hover:bg-white/10 opacity-40 hover:opacity-100">
            <Bookmark size={20} />
          </button>
          <button 
            onClick={() => setShowComments(!showComments)}
            className={`p-3 rounded-full transition-all ${showComments ? 'bg-[var(--text-primary)] text-[var(--bg-color)]' : 'hover:bg-white/10 opacity-40 hover:opacity-100'}`}
          >
            <MessageSquare size={20} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto px-6 lg:px-12 py-16">
          {/* Cover */}
          {article.coverImage && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full aspect-video rounded-[3rem] overflow-hidden shadow-3xl mb-16 border border-white/5"
            >
              <img src={article.coverImage || null} alt={article.title} className="w-full h-full object-cover" />
            </motion.div>
          )}

          {/* Title Section */}
          <div className="mb-16">
            <div className="flex items-center gap-4 mb-6">
              <span className="px-3 py-1 bg-small-orange/10 text-small-orange text-[10px] font-black uppercase tracking-widest rounded-full">
                {article.category || 'Article'}
              </span>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-20">
                <Clock size={12} />
                <span>{article.readTime || 5} min read</span>
              </div>
            </div>
            <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">{article.title}</h1>
            {article.subtitle && <p className="text-xl lg:text-2xl opacity-60 font-medium italic leading-relaxed mb-6">{article.subtitle}</p>}
            
            <The411 itemId={article.id} itemType="ARTICLE" title={article.title} author={article.authorName} />
          </div>

          {/* Content Blocks */}
          <div className="space-y-12">
            {article.blocks.map(block => (
              <div key={block.id} className="relative group">
                {block.type === 'HEADING' && (
                  <h2 className="text-3xl lg:text-4xl font-black uppercase tracking-tight mt-20 mb-8">
                    {block.content}
                  </h2>
                )}

                {block.type === 'TEXT' && (
                  <p className="text-lg lg:text-xl leading-relaxed opacity-80 font-medium whitespace-pre-wrap">
                    {block.content}
                  </p>
                )}

                {block.type === 'QUOTE' && (
                  <div className="relative py-12 px-12 my-12 bg-white/[0.02] rounded-[2.5rem] border border-white/5">
                    <Quote className="absolute top-8 left-8 text-small-orange/20" size={48} />
                    <p className="text-2xl lg:text-3xl font-display font-black italic leading-tight relative z-10 text-[var(--text-primary)]">
                      "{block.content}"
                    </p>
                  </div>
                )}

                {block.type === 'IMAGE' && (
                  <div className={`my-12 ${
                    block.layout === 'LEFT' ? 'lg:float-left lg:w-1/2 lg:mr-12 mb-8' : 
                    block.layout === 'RIGHT' ? 'lg:float-right lg:w-1/2 lg:ml-12 mb-8' : 
                    'w-full'
                  }`}>
                    <div className="rounded-[2rem] overflow-hidden shadow-2xl border border-white/10">
                      <img src={block.content || null} alt={block.caption} className="w-full h-auto" />
                    </div>
                    {block.caption && (
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mt-4 text-center">
                        {block.caption}
                      </p>
                    )}
                  </div>
                )}

                {block.type === 'AUDIO' && (
                  <div className="my-12 p-8 bg-white/5 rounded-[2.5rem] border border-white/10 flex items-center gap-6">
                    <button 
                      onClick={() => setActiveAudio(activeAudio === block.id ? null : block.id)}
                      className="w-16 h-16 rounded-full bg-small-orange flex items-center justify-center shadow-xl hover:scale-105 transition-all"
                    >
                      {activeAudio === block.id ? <Pause size={24} fill="white" /> : <Play size={24} fill="white" className="ml-1" />}
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Audio Commentary</span>
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40">0:00 / 3:45</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="w-1/4 h-full bg-small-orange" />
                      </div>
                    </div>
                    <Volume2 size={20} className="opacity-20" />
                  </div>
                )}

                {block.type === 'VIDEO' && (
                  <div className="my-12 aspect-video bg-black rounded-[2.5rem] overflow-hidden border border-white/10 shadow-3xl">
                    <video src={block.content || null} controls className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Author Footer */}
          <footer className="mt-32 pt-16 border-t border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div 
                  onClick={() => onVisitUser?.(article.authorId)}
                  className="w-20 h-20 rounded-full overflow-hidden border-2 border-small-orange cursor-pointer hover:scale-105 transition-all"
                >
                  <img src={article.authorPhoto || null} alt={article.authorName} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter">{article.authorName}</h3>
                  <p className="text-xs font-bold opacity-40 uppercase tracking-widest mb-4">Writer & Journalist</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button className="flex items-center gap-2 px-6 py-2 bg-[var(--text-primary)] text-[var(--bg-color)] rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                      <UserPlus size={14} /> Follow Author
                    </button>
                    <PlajahPlusPill creatorId={article.authorId} creatorName={article.authorName} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsLiked(!isLiked)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full border transition-all ${isLiked ? 'bg-red-500 border-red-500 text-white' : 'border-white/10 opacity-40 hover:opacity-100'}`}
                >
                  <Heart size={16} fill={isLiked ? 'white' : 'none'} />
                  <span className="text-xs font-black uppercase tracking-widest">{article.likesCount + (isLiked ? 1 : 0)}</span>
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Comments Sidebar */}
      <AnimatePresence>
        {showComments && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed inset-y-0 right-0 w-full lg:w-[450px] bg-black/90 backdrop-blur-3xl border-l border-white/10 z-[100] flex flex-col"
          >
            <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-tighter">Responses</h3>
              <button onClick={() => setShowComments(false)} className="p-2 hover:bg-white/10 rounded-full transition-all">
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <CommentSection 
                comments={comments}
                onPostComment={handlePostComment}
                currentUser={currentUser}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ArticleView;
