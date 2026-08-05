import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Music2, Video as VideoIcon, Signal, ChevronRight, Zap, Users, HeartHandshake } from 'lucide-react';

const STORAGE_KEY = 'plajah_rightnow_onboarding_seen';

// ── Demo activity cards (static illustration for empty-state preview) ─────────

const DEMO_CARDS = [
  {
    name: 'Jordan K.',
    avatar: 'https://i.pravatar.cc/40?img=11',
    action: 'Listening to',
    content: 'Midnight Frequency',
    sub: 'by Nova Arc · Lost In Space EP',
    color: '#a78bfa',
    icon: Music2,
    timeAgo: '2m ago',
  },
  {
    name: 'Sam R.',
    avatar: 'https://i.pravatar.cc/40?img=23',
    action: 'Watching',
    content: 'The Last Studio Session',
    sub: 'Documentary · 42 min',
    color: '#60a5fa',
    icon: VideoIcon,
    timeAgo: '8m ago',
  },
  {
    name: 'Alex M.',
    avatar: 'https://i.pravatar.cc/40?img=37',
    action: 'Listening to',
    content: 'Deep Focus Radio',
    sub: 'Jazz & Soul · Live Station',
    color: '#34d399',
    icon: Signal,
    timeAgo: 'Just now',
  },
];

interface Props {
  onDismiss: () => void;
  onActivate: () => void;
}

const RightNowOnboarding: React.FC<Props> = ({ onDismiss, onActivate }) => {
  const [step, setStep] = useState(0);
  const [cardVisible, setCardVisible] = useState(0);

  // Animate demo cards in one by one
  useEffect(() => {
    if (cardVisible >= DEMO_CARDS.length) return;
    const t = setTimeout(() => setCardVisible(v => v + 1), 700);
    return () => clearTimeout(t);
  }, [cardVisible]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.97 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-lg mx-auto"
    >
      <div className="relative bg-[#0c0c0c] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
        {/* Top gradient glow */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-400/50 to-transparent" />
        <div className="absolute top-0 inset-x-0 h-40 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(52,211,153,0.08) 0%, transparent 70%)' }} />

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all z-10"
        >
          <X size={14} className="text-white/40" />
        </button>

        <div className="px-8 pt-8 pb-6">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-1">
            <span className="relative flex w-2.5 h-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-green-400" />
            </span>
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-green-400">New Feature</span>
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tight text-white leading-tight mb-2">
            Right Now
          </h2>
          <p className="text-sm text-white/50 leading-relaxed max-w-sm">
            See what people you follow are actually experiencing — in real time. Stop scrolling into a void.
          </p>
        </div>

        {/* Demo cards */}
        <div className="px-8 space-y-3 mb-6">
          {DEMO_CARDS.slice(0, cardVisible).map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3 p-3.5 bg-white/[0.04] border border-white/8 rounded-2xl"
              >
                <div className="relative shrink-0">
                  <img src={card.avatar} alt={card.name}
                    className="w-8 h-8 rounded-full object-cover border border-white/10" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border border-black flex items-center justify-center"
                    style={{ background: card.color }}>
                    <Icon size={8} className="text-black" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-white/40 truncate">
                    <span className="font-black text-white/70">{card.name}</span> · {card.action}
                  </p>
                  <p className="text-xs font-black text-white truncate">{card.content}</p>
                  <p className="text-[9px] text-white/30 truncate">{card.sub}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[8px] text-white/20">{card.timeAgo}</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[8px] font-black text-black"
                    style={{ background: card.color }}
                  >
                    Join
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Three value props */}
        <div className="px-8 grid grid-cols-3 gap-3 mb-8">
          {[
            { icon: Users, label: 'Shared Moments', desc: 'Experience content with your community simultaneously' },
            { icon: Zap, label: 'Instant Discovery', desc: 'Find creators through what your friends love right now' },
            { icon: HeartHandshake, label: 'Real Connection', desc: 'Not an algorithm — actual people, actual moments' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="p-3 bg-white/[0.03] border border-white/6 rounded-2xl text-center">
              <Icon size={16} className="text-green-400 mx-auto mb-1.5" />
              <p className="text-[8px] font-black uppercase tracking-widest text-white mb-1">{label}</p>
              <p className="text-[7px] text-white/30 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Privacy note */}
        <div className="px-8 mb-6">
          <p className="text-[8px] text-white/20 text-center leading-relaxed">
            Your activity is only visible to people you follow. You can turn it off anytime in the Now tab. Nothing is stored beyond 45 minutes.
          </p>
        </div>

        {/* CTA */}
        <div className="px-8 pb-8 flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 py-3.5 bg-white/5 border border-white/10 text-white/50 rounded-2xl text-xs font-black uppercase tracking-widest hover:text-white hover:border-white/20 transition-all"
          >
            Maybe Later
          </button>
          <button
            onClick={() => { onActivate(); onDismiss(); }}
            className="flex-1 py-3.5 bg-green-500 text-black rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-green-400 transition-all flex items-center justify-center gap-2"
          >
            Turn On <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ── Controller — manages show/hide logic, persists seen state ─────────────────

export const RightNowOnboardingController: React.FC<{
  show: boolean;
  onActivate: () => void;
  onDismiss: () => void;
}> = ({ show, onActivate, onDismiss }) => {
  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}>
          <RightNowOnboarding onDismiss={onDismiss} onActivate={onActivate} />
        </div>
      )}
    </AnimatePresence>
  );
};

// ── Inline announcement banner (for top of feed) ──────────────────────────────

export const RightNowAnnouncementBanner: React.FC<{
  onLearnMore: () => void;
  onDismiss: () => void;
}> = ({ onLearnMore, onDismiss }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mx-4 mb-4 flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/25 rounded-2xl"
    >
      <span className="relative flex w-2 h-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
        <span className="relative inline-flex rounded-full w-2 h-2 bg-green-400" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black text-white">Right Now is live</p>
        <p className="text-[9px] text-white/40">See what people you follow are experiencing in real time</p>
      </div>
      <button onClick={onLearnMore}
        className="shrink-0 px-3 py-1.5 bg-green-500 text-black rounded-xl text-[9px] font-black uppercase hover:bg-green-400 transition-all">
        See it
      </button>
      <button onClick={onDismiss} className="shrink-0 text-white/20 hover:text-white transition-colors">
        <X size={13} />
      </button>
    </motion.div>
  );
};

export { STORAGE_KEY };
export default RightNowOnboarding;
