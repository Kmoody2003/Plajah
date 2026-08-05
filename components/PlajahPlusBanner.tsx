import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, X } from 'lucide-react';
import PlajahPlusLanding from './PlajahPlusLanding';

interface PlajahPlusBannerProps {
  variant?: 'FULL' | 'COMPACT' | 'PILL';
  className?: string;
}

const PlajahPlusBanner: React.FC<PlajahPlusBannerProps> = ({ variant = 'FULL', className = '' }) => {
  const [showLanding, setShowLanding] = useState(false);

  // Inline pill — fits in a control row alongside buttons (unlike COMPACT,
  // which is a full-width section banner).
  if (variant === 'PILL') {
    return (
      <>
        <motion.button
          onClick={() => setShowLanding(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-[#D40055]/20 hover:shadow-[#D40055]/40 transition-all whitespace-nowrap ${className}`}
          title="Plajah+ — support creators & unlock benefits"
        >
          <Zap size={14} /> Plajah+
        </motion.button>

        <AnimatePresence>
          {showLanding && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 backdrop-blur-md"
              onClick={e => { if (e.target === e.currentTarget) setShowLanding(false); }}
            >
              <button
                onClick={() => setShowLanding(false)}
                className="fixed top-4 right-4 z-[61] p-3 bg-white/10 border border-white/20 rounded-full text-white hover:bg-white/20 transition-all"
              >
                <X size={18} />
              </button>
              <PlajahPlusLanding onClose={() => setShowLanding(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  if (variant === 'COMPACT') {
    return (
      <>
        <motion.button
          onClick={() => setShowLanding(true)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`w-full flex items-center justify-between gap-4 px-6 py-4 rounded-2xl bg-gradient-to-r from-[#D40055]/20 via-[#6B0099]/20 to-[#FF8C00]/20 border border-white/10 hover:border-white/20 transition-all group ${className}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#D40055] to-[#FF8C00] flex items-center justify-center shadow-lg shadow-[#D40055]/30">
              <Zap size={14} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black uppercase tracking-widest text-white">Plajah+</p>
              <p className="text-[9px] text-white/40 font-medium">Support creators · Unlock benefits</p>
            </div>
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest text-[#FF8C00] group-hover:text-white transition-colors whitespace-nowrap">
            From $4.99 →
          </span>
        </motion.button>

        <AnimatePresence>
          {showLanding && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 backdrop-blur-md"
              onClick={e => { if (e.target === e.currentTarget) setShowLanding(false); }}
            >
              <button
                onClick={() => setShowLanding(false)}
                className="fixed top-4 right-4 z-[61] p-3 bg-white/10 border border-white/20 rounded-full text-white hover:bg-white/20 transition-all"
              >
                <X size={18} />
              </button>
              <PlajahPlusLanding onClose={() => setShowLanding(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
      <motion.button
        onClick={() => setShowLanding(true)}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={`w-full relative overflow-hidden rounded-3xl p-6 md:p-8 text-left group ${className}`}
        style={{ background: 'linear-gradient(135deg, rgba(212,0,85,0.15) 0%, rgba(107,0,153,0.15) 50%, rgba(255,140,0,0.15) 100%)' }}
      >
        {/* Animated gradient overlay */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: 'linear-gradient(135deg, rgba(212,0,85,0.25) 0%, rgba(107,0,153,0.25) 50%, rgba(255,140,0,0.25) 100%)' }}
        />
        <div className="absolute inset-0 border border-white/10 group-hover:border-white/20 rounded-3xl transition-colors" />

        {/* Glow orbs */}
        <div className="absolute top-0 left-1/4 w-48 h-48 bg-[#D40055]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-[#FF8C00]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="flex items-center gap-4 flex-1">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#D40055] via-[#6B0099] to-[#FF8C00] flex items-center justify-center shadow-2xl shadow-[#D40055]/40 flex-shrink-0">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Introducing</span>
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white">New</span>
              </div>
              <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter text-white leading-none">
                Plajah<span className="bg-gradient-to-r from-[#D40055] to-[#FF8C00] bg-clip-text text-transparent">+</span>
              </h3>
              <p className="text-white/50 text-xs font-medium mt-1">
                Subscribe to your favorite creator · Unlock discounts, storage, points & more
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="hidden sm:block text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Starting at</p>
              <p className="text-2xl font-black text-white">$4.99<span className="text-sm text-white/40 font-medium">/mo</span></p>
            </div>
            <div className="px-6 py-3 bg-gradient-to-r from-[#D40055] to-[#FF8C00] rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-[#D40055]/30 group-hover:scale-105 transition-transform">
              Learn More →
            </div>
          </div>
        </div>
      </motion.button>

      <AnimatePresence>
        {showLanding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 backdrop-blur-md"
            onClick={e => { if (e.target === e.currentTarget) setShowLanding(false); }}
          >
            <button
              onClick={() => setShowLanding(false)}
              className="fixed top-4 right-4 z-[61] p-3 bg-white/10 border border-white/20 rounded-full text-white hover:bg-white/20 transition-all"
            >
              <X size={18} />
            </button>
            <PlajahPlusLanding onClose={() => setShowLanding(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PlajahPlusBanner;
