import React, { useState, useEffect } from 'react';
import { Info, Users, Play, BookOpen, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface The411Props {
  itemId: string;
  itemType: 'MUSIC' | 'VIDEO' | 'MOVIE' | 'ARTICLE' | 'BOOK' | 'GAME';
  title: string;
  author: string;
}

const The411: React.FC<The411Props> = ({ itemId, itemType, title, author }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [views, setViews] = useState(0);
  const [summary, setSummary] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // In a real app, this would fetch from the backend:
    // 1. Total View/Listen/Read count
    // 2. AI-generated summary of the content and comments.
    
    // Simulating system-wide view count and AI summarization for "The 411"
    if (isOpen && !summary) {
      setIsLoading(true);
      setTimeout(() => {
        // Generate mock data based on itemType
        const pseudoRandomViews = Math.floor(Math.random() * 50000) + 1200;
        setViews(pseudoRandomViews);
        
        let act = 'viewed';
        if (itemType === 'MUSIC') act = 'listened to';
        if (itemType === 'ARTICLE' || itemType === 'BOOK') act = 'read';
        if (itemType === 'VIDEO' || itemType === 'MOVIE') act = 'watched';

        setSummary(`"${title}" by ${author} has been ${act} by over ${pseudoRandomViews.toLocaleString()} people across the platform. It is widely recognized for its unique approach and engaging style.`);
        setSentiment(`The community is currently saying: "A masterpiece that keeps giving," "Incredible execution," and "Highly recommended for fans of this genre." Overall sentiment is overwhelmingly positive.`);
        
        setIsLoading(false);
      }, 1500);
    }
  }, [isOpen, itemId, itemType, title, author, summary]);

  const getIcon = () => {
    if (itemType === 'MUSIC') return <Play size={16} />;
    if (itemType === 'ARTICLE' || itemType === 'BOOK') return <BookOpen size={16} />;
    return <Eye size={16} />;
  };

  return (
    <div className="my-4">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all text-xs font-black uppercase tracking-widest text-small-orange"
      >
        <Info size={16} />
        The 411
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-4"
          >
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 relative">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-8 h-8 rounded-full border-2 border-small-orange border-t-transparent animate-spin mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Gathering the 411...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-6 pb-6 border-b border-white/5">
                    <div className="flex items-center gap-3 text-white/80">
                      {getIcon()}
                      <div>
                        <div className="text-2xl font-black">{views.toLocaleString()}</div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">Total Views</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-white/80">
                      <Users size={16} />
                      <div>
                        <div className="text-xl font-bold">98%</div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-white/40">Positive Feedback</div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">Content Summary</h4>
                    <p className="text-sm font-medium leading-relaxed">{summary}</p>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">Community Sentiment</h4>
                    <p className="text-sm font-medium leading-relaxed italic text-white/80">"{sentiment}"</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default The411;
