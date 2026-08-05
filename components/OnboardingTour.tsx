import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, X, SkipForward } from 'lucide-react';

// ── Tour slides ───────────────────────────────────────────────────────────────

interface TourSlide {
  category: string;
  title: string;
  tagline: string;
  description: string;
  emoji: string;
  accent: string;           // Tailwind color class for accents
  accentHex: string;        // hex for inline styles
  preview: React.ReactNode; // mini visual illustration
}

const Pill: React.FC<{ children: React.ReactNode; bg?: string; color?: string }> = ({ children, bg = 'rgba(255,255,255,0.08)', color = 'rgba(255,255,255,0.5)' }) => (
  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest" style={{ background: bg, color }}>{children}</span>
);

const SLIDES: TourSlide[] = [
  {
    category: 'Welcome',
    title: 'Your Creative Universe',
    tagline: 'Where creators live and fans connect',
    description: "Plajah is the platform where artists publish music, books, and videos — and fans become part of the story. Every feature you see was built for real creators.",
    emoji: '🌐',
    accent: 'text-orange-400',
    accentHex: '#FF8C00',
    preview: (
      <div className="flex gap-2 flex-wrap justify-center">
        {['Music', 'Video', 'Books', 'Sports', 'Live', 'Clubs', 'Debate', 'Science'].map(t => (
          <Pill key={t} bg="rgba(255,140,0,0.12)" color="#ff8c00">{t}</Pill>
        ))}
      </div>
    ),
  },
  {
    category: 'Exclusive Posts',
    title: 'Posts That Self-Destruct',
    tagline: '🔥 Gone when the time is up — or the views run out',
    description: "Tap the 🔥 button in any post composer to make it Exclusive. Choose a countdown (15 min to 24 hrs) or a view limit (5 to 100 unique viewers). A fire border pulses around every exclusive post and its comments.",
    emoji: '🔥',
    accent: 'text-orange-400',
    accentHex: '#FF6000',
    preview: (
      <div className="rounded-2xl p-3 space-y-2 w-full max-w-xs mx-auto" style={{ border: '2px solid #ff6000', boxShadow: '0 0 16px rgba(255,80,0,0.4), 0 0 40px rgba(255,80,0,0.18)', background: 'rgba(255,60,0,0.05)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center text-sm">🔥</div>
          <div>
            <p className="text-[9px] font-black text-white/80">Exclusive Post</p>
            <p className="text-[7px] text-orange-400">Expires in 1h 45m</p>
          </div>
          <span className="ml-auto text-[6px] px-1.5 py-0.5 rounded-full font-black uppercase" style={{ background: 'rgba(255,80,0,0.2)', color: '#ff8c00' }}>25 views left</span>
        </div>
        <p className="text-[10px] text-white/60 leading-relaxed">This post will vanish once 25 people have seen it. Be one of the first…</p>
      </div>
    ),
  },
  {
    category: 'Debate Challenges',
    title: 'Head-to-Head Debates',
    tagline: '⚔️ Challenge anyone. The community decides.',
    description: "Pick a topic, challenge a user, and let the platform vote on who made the better argument. Debate results live permanently on both profiles — your record follows you.",
    emoji: '⚔️',
    accent: 'text-red-400',
    accentHex: '#EF4444',
    preview: (
      <div className="flex items-center gap-3 w-full max-w-xs mx-auto">
        <div className="flex-1 rounded-xl p-2.5 text-center" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
          <p className="text-[8px] font-black text-white/70 mb-0.5">Challenger</p>
          <div className="w-8 h-8 rounded-full bg-indigo-500/30 mx-auto flex items-center justify-center text-sm">👤</div>
          <p className="text-[8px] font-black text-indigo-300 mt-1">42%</p>
        </div>
        <div className="text-center">
          <p className="text-lg">⚔️</p>
          <p className="text-[7px] font-black text-white/30 uppercase tracking-widest mt-0.5">vs</p>
        </div>
        <div className="flex-1 rounded-xl p-2.5 text-center" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <p className="text-[8px] font-black text-white/70 mb-0.5">Defender</p>
          <div className="w-8 h-8 rounded-full bg-red-500/30 mx-auto flex items-center justify-center text-sm">👤</div>
          <p className="text-[8px] font-black text-red-300 mt-1">58%</p>
        </div>
      </div>
    ),
  },
  {
    category: 'World Cup Fan Clubs',
    title: 'A Club for Every Nation',
    tagline: '⚽ 48 nations. 48 live communities.',
    description: "Every country in WC2026 has its own fan club. Join your nation's club, post in the timeline, see the squad, and celebrate together. Posts use the same infrastructure as all other clubs — so it's fast, reliable, and real-time.",
    emoji: '⚽',
    accent: 'text-green-400',
    accentHex: '#22C55E',
    preview: (
      <div className="flex gap-2 justify-center">
        {['🇧🇷', '🇫🇷', '🇺🇸', '🇩🇪', '🇦🇷', '🇯🇵'].map((flag, i) => (
          <div key={i} className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
            {flag}
          </div>
        ))}
      </div>
    ),
  },
  {
    category: 'Creator Studio',
    title: 'Publish Everything',
    tagline: '🎵 Music · Video · Books · Art',
    description: "Upload tracks and albums, release videos and films, publish books with chapters, set prices, run pay-per-view events, and build your entire creative catalog in one place.",
    emoji: '🎵',
    accent: 'text-purple-400',
    accentHex: '#A855F7',
    preview: (
      <div className="grid grid-cols-4 gap-1.5 w-full max-w-xs mx-auto">
        {[
          { icon: '🎵', label: 'Music', color: 'rgba(168,85,247,0.15)' },
          { icon: '🎬', label: 'Video', color: 'rgba(239,68,68,0.15)' },
          { icon: '📖', label: 'Books', color: 'rgba(180,83,9,0.15)' },
          { icon: '📺', label: 'PPV', color: 'rgba(6,182,212,0.15)' },
        ].map(item => (
          <div key={item.label} className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1" style={{ background: item.color }}>
            <span className="text-lg">{item.icon}</span>
            <span className="text-[7px] font-black text-white/40 uppercase tracking-widest">{item.label}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    category: 'Clubs & Communities',
    title: 'Build Your Tribe',
    tagline: '🏟️ Timelines · Galleries · Events · Chat',
    description: "Create or join clubs around any topic. Every club has a live timeline, a media gallery, events calendar, sticky notes board, and a real-time chat. Fan clubs for artists, teams, or any community you want to build.",
    emoji: '🏟️',
    accent: 'text-blue-400',
    accentHex: '#3B82F6',
    preview: (
      <div className="rounded-2xl overflow-hidden w-full max-w-xs mx-auto" style={{ border: '1px solid rgba(59,130,246,0.2)', background: 'rgba(59,130,246,0.05)' }}>
        <div className="px-3 py-2 flex gap-1.5 border-b border-white/5">
          {['Timeline', 'Gallery', 'Events', 'Chat'].map(t => (
            <span key={t} className="text-[7px] font-black px-2 py-0.5 rounded-full" style={{ background: t === 'Timeline' ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.04)', color: t === 'Timeline' ? '#60a5fa' : 'rgba(255,255,255,0.25)' }}>{t}</span>
          ))}
        </div>
        <div className="p-3 space-y-1.5">
          {['Pinned: Welcome to the club 📌', 'Just uploaded: Highlights reel 🎬', 'Event next Friday 🗓️'].map(msg => (
            <p key={msg} className="text-[8px] text-white/40">{msg}</p>
          ))}
        </div>
      </div>
    ),
  },
  {
    category: 'Live Talks & Streams',
    title: 'Go Live Right Now',
    tagline: '🎙️ Audio rooms · Video broadcasts · Watch parties',
    description: "Start an audio Live Talk with up to dozens of speakers, host a video stream to your followers, or run a Watch Along with real-time reactions. Your audience is waiting.",
    emoji: '🎙️',
    accent: 'text-pink-400',
    accentHex: '#EC4899',
    preview: (
      <div className="rounded-2xl p-3 w-full max-w-xs mx-auto" style={{ background: 'rgba(236,72,153,0.07)', border: '1px solid rgba(236,72,153,0.2)' }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[8px] font-black text-red-400 uppercase tracking-widest">Live Now</span>
          <span className="ml-auto text-[7px] text-white/30">1,247 listening</span>
        </div>
        <p className="text-[10px] font-black text-white/80 mb-1">"The future of independent music"</p>
        <div className="flex gap-1 flex-wrap">
          {['🎤 Host', '🎤 Speaker', '👤 Listener', '👤 +1,241'].map(p => (
            <Pill key={p}>{p}</Pill>
          ))}
        </div>
      </div>
    ),
  },
  {
    category: "You're Ready",
    title: "The Universe Is Yours",
    tagline: 'Explore at your own pace — everything is waiting',
    description: "You can revisit any feature from the sidebar. The help menu is always a click away. Now go create something, join a fan club, challenge someone to a debate, or just explore.",
    emoji: '🚀',
    accent: 'text-orange-400',
    accentHex: '#FF8C00',
    preview: (
      <div className="flex gap-3 justify-center items-center">
        {['🔥', '⚔️', '⚽', '🎵', '🏟️', '🎙️'].map((e, i) => (
          <motion.span
            key={i}
            className="text-2xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            {e}
          </motion.span>
        ))}
      </div>
    ),
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface OnboardingTourProps {
  onComplete: () => void;
  onSkip: () => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ onComplete, onSkip }) => {
  const [step, setStep] = useState(0);

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;
  const pct = ((step + 1) / SLIDES.length) * 100;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 24 }}
        className="relative w-full max-w-lg rounded-[2rem] overflow-hidden"
        style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Progress bar */}
        <div className="h-0.5 bg-white/5">
          <motion.div
            className="h-full"
            style={{ background: slide.accentHex }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        <div className="p-8 space-y-6">
          {/* Header row */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.4em] mb-1" style={{ color: slide.accentHex }}>
                {slide.category}
              </p>
              <h2 className="text-2xl font-black tracking-tight text-white leading-tight">
                {slide.title}
              </h2>
              <p className="text-[10px] text-white/40 mt-1 font-bold">{slide.tagline}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onSkip}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest text-white/25 hover:text-white/50 transition-colors"
              >
                <SkipForward size={11} /> Skip
              </button>
              <button
                onClick={onSkip}
                className="p-1.5 rounded-full text-white/20 hover:text-white/50 hover:bg-white/8 transition-all"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-white/55 leading-relaxed font-medium">
            {slide.description}
          </p>

          {/* Feature preview illustration */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl p-4 flex items-center justify-center min-h-[90px]"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              {slide.preview}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0}
                className="p-2.5 rounded-xl transition-all disabled:opacity-20 hover:bg-white/8"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <ChevronLeft size={18} className="text-white/60" />
              </button>
              <button
                onClick={() => isLast ? onComplete() : setStep(s => s + 1)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                style={{ background: slide.accentHex, color: '#000' }}
              >
                {isLast ? 'Get Started' : 'Next'}
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Dot indicators */}
            <div className="flex gap-1.5">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className="rounded-full transition-all"
                  style={{
                    width: i === step ? 16 : 6,
                    height: 6,
                    background: i === step ? slide.accentHex : 'rgba(255,255,255,0.15)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default OnboardingTour;
