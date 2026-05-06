import React, { useEffect } from 'react';
import { X, Maximize2, Share2, Users, Trophy, Sparkles, ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { Game } from '../types';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

interface GamePlayerViewProps {
  game: Game;
  onBack: () => void;
}

const GamePlayerView: React.FC<GamePlayerViewProps> = ({ game, onBack }) => {
  const { pause } = useGlobalPlayerState();

  useEffect(() => {
    // Pause audio when entering game player
    pause();
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="h-full flex flex-col bg-theme text-white overflow-hidden"
    >
      {/* Header */}
      <div className="p-8 flex items-center justify-between border-b border-white/5 bg-theme-card/50 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <button 
            onClick={onBack}
            className="p-4 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all group"
          >
            <ChevronLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tightest">{game.title}</h3>
            <p className="text-[10px] font-bold text-small-orange uppercase tracking-widest">
              Arcade Experience
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="hidden md:flex px-6 py-3 bg-white/5 border border-white/10 rounded-full font-black text-[10px] uppercase tracking-widest items-center gap-2 hover:bg-white/10 transition-all">
            <Users size={14} /> Invite
          </button>
          <button className="p-4 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all">
            <Share2 size={20} />
          </button>
        </div>
      </div>

      {/* Game Area */}
      <div className="flex-1 p-4 lg:p-8 flex items-center justify-center overflow-hidden bg-black/20">
        <div className="w-full h-full max-w-7xl bg-black rounded-[2rem] lg:rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl relative group">
          <iframe 
            src={game.url}
            className="w-full h-full border-none"
            title={game.title}
            allow="autoplay; fullscreen; gamepad"
          />
          
          <div className="absolute bottom-8 right-8 opacity-0 group-hover:opacity-100 transition-all">
            <button 
              onClick={() => {
                const iframe = document.querySelector('iframe');
                if (iframe) {
                  if (iframe.requestFullscreen) {
                    iframe.requestFullscreen().catch(e => console.log('Fullscreen failed:', e));
                  } else if ((iframe as any).webkitRequestFullscreen) {
                    (iframe as any).webkitRequestFullscreen();
                  }
                }
              }}
              className="p-4 bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-black/80 transition-all"
            >
              <Maximize2 size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Footer Stats */}
      <div className="p-6 border-t border-white/5 flex items-center justify-center gap-8 lg:gap-12 bg-theme-card/30">
        <div className="flex items-center gap-3">
          <Sparkles size={18} className="text-small-orange" />
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Verified Studio Build</span>
        </div>
        <div className="hidden sm:block w-px h-6 bg-white/10" />
        <div className="flex items-center gap-3">
          <Trophy size={18} className="text-yellow-500" />
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Play Count: {game.playCount || 0}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default GamePlayerView;
