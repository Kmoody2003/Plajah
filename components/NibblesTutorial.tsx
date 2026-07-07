import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, X, BookHeart, Sparkles, Gift, EyeOff, Palette, Dices, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';

// First-run walkthrough for Nibbles (the private couples chat). Fires the first time
// a user enters an intimate room, explaining what the space is and what they can do.

interface Step { icon: LucideIcon; title: string; body: string; }

const STEPS: Step[] = [
  {
    icon: Heart,
    title: 'Welcome to Nibbles',
    body: 'Your private, just-the-two-of-you space inside a direct message. It only works in a 1:1 chat with the partner linked on your profile, it’s 18+, and it stays off until you both turn it on.',
  },
  {
    icon: Palette,
    title: 'Make it yours',
    body: 'Tap the heart to open Nibbles settings — pick a mood theme (Rose, Candlelight, Midnight), set your own backdrop photo, and give each other a pet name. Whatever you choose, you both see it.',
  },
  {
    icon: BookHeart,
    title: 'Your Couples Diary',
    body: 'A shared journal locked behind a safeword only you two know. Save private notes with a mood, drop in a playlist, or keep links you love. Nobody else can ever read it.',
  },
  {
    icon: Dices,
    title: 'Play together',
    body: 'Shake the Magic 8-Ball — you each secretly load it with your own answers, so every shake is a surprise. Send big romantic emotes and playful GIFs made just for the two of you.',
  },
  {
    icon: Gift,
    title: 'Send a little gift',
    body: 'Wrap a photo as a gift — it stays hidden until they tap to open, then quietly vanishes a minute later. Little sounds play as messages and gifts arrive.',
  },
  {
    icon: EyeOff,
    title: 'Stays between you',
    body: 'When you look away, the conversation hides itself automatically. Start a video call and turn on romance FX for falling hearts and roses. Ready when you are — end it anytime from settings.',
  },
];

const NibblesTutorial: React.FC<{ accent?: string; onClose: () => void }> = ({ accent = '#ff6b6b', onClose }) => {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const Icon = step.icon;
  const last = i === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border overflow-hidden relative"
        style={{ background: 'linear-gradient(180deg, rgba(24,7,14,0.98), rgba(10,3,7,0.98))', borderColor: `${accent}44` }}
      >
        {/* ambient glow */}
        <div className="absolute -top-20 -left-16 w-56 h-56 rounded-full blur-[80px] pointer-events-none" style={{ background: `${accent}33` }} />
        <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 z-10"><X size={16} /></button>

        <div className="relative p-7 pt-9 text-center">
          <div className="w-16 h-16 rounded-2xl grid place-items-center mx-auto mb-5" style={{ background: `${accent}1e`, boxShadow: `0 0 40px ${accent}22` }}>
            <AnimatePresence mode="wait">
              <motion.span key={i} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.2 }}>
                <Icon size={30} style={{ color: accent }} />
              </motion.span>
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22 }}>
              <h2 className="text-xl font-black tracking-tight text-white mb-2 flex items-center justify-center gap-2">
                {step.title}{i === 0 && <Sparkles size={16} style={{ color: accent }} />}
              </h2>
              <p className="text-[13px] text-white/60 leading-relaxed min-h-[92px]">{step.body}</p>
            </motion.div>
          </AnimatePresence>

          {/* dots */}
          <div className="flex items-center justify-center gap-1.5 mt-5 mb-6">
            {STEPS.map((_, d) => (
              <button key={d} onClick={() => setI(d)} className="rounded-full transition-all" style={{ width: d === i ? 20 : 6, height: 6, background: d === i ? accent : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>

          <div className="flex items-center gap-3">
            {i > 0 ? (
              <button onClick={() => setI(i - 1)} className="flex items-center gap-1 px-4 py-3 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-widest"><ChevronLeft size={14} /> Back</button>
            ) : (
              <button onClick={onClose} className="px-4 py-3 rounded-full bg-white/5 border border-white/10 text-white/50 hover:text-white text-[10px] font-black uppercase tracking-widest">Skip</button>
            )}
            <button
              onClick={() => (last ? onClose() : setI(i + 1))}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-[11px] font-black uppercase tracking-widest text-black"
              style={{ background: accent }}
            >
              {last ? <><Heart size={14} fill="currentColor" /> Start</> : <>Next <ChevronRight size={14} /></>}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default NibblesTutorial;
