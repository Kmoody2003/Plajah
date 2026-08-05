import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Compass, Upload, MessageCircle, AlertCircle,
  Users, Sparkles, Medal, Heart, ChevronRight, Star,
} from 'lucide-react';

interface WelcomePackageModalProps {
  displayName?: string;
  onDismiss: () => void;
}

const cards = [
  {
    icon: Compass,
    color: 'from-blue-600/30 to-cyan-600/20',
    border: 'border-blue-500/20',
    iconColor: 'text-cyan-400',
    title: 'Explore',
    body: 'Dive into music, films, books, live talks, games, and more. Every corner of Plajah is built for discovery.',
  },
  {
    icon: Upload,
    color: 'from-purple-600/30 to-pink-600/20',
    border: 'border-purple-500/20',
    iconColor: 'text-purple-400',
    title: 'Upload & Create',
    body: 'Share your music, videos, articles, and art. Your profile is your stage — own it completely.',
  },
  {
    icon: MessageCircle,
    color: 'from-orange-600/30 to-amber-600/20',
    border: 'border-orange-500/20',
    iconColor: 'text-orange-400',
    title: 'Engage',
    body: 'Comment, react, join live chats, and connect with creators and fans who share your passion.',
  },
  {
    icon: AlertCircle,
    color: 'from-red-600/20 to-rose-600/10',
    border: 'border-red-500/15',
    iconColor: 'text-red-400',
    title: 'Report Issues',
    body: 'Spotted something off? Use the Help Center to report bugs and send feedback. Your voice shapes Plajah.',
  },
];

const WelcomePackageModal: React.FC<WelcomePackageModalProps> = ({ displayName, onDismiss }) => {
  const [step, setStep] = useState<'welcome' | 'package'>('welcome');
  const firstName = displayName?.split(' ')[0] || 'Creator';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[900] flex items-center justify-center p-4"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(107,0,153,0.35) 0%, rgba(0,0,0,0.92) 70%)' }}
      >
        {/* Dismiss tap-outside */}
        <div className="absolute inset-0" onClick={onDismiss} />

        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: 'spring', damping: 26, stiffness: 240 }}
          className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] shadow-[0_40px_120px_rgba(107,0,153,0.4)] scrollbar-hide"
          onClick={e => e.stopPropagation()}
        >
          {/* Dismiss button — always visible */}
          <button
            onClick={onDismiss}
            className="absolute top-5 right-5 z-20 p-2 rounded-full bg-white/8 border border-white/10 text-white/40 hover:text-white hover:bg-white/15 transition-all"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>

          {step === 'welcome' ? (
            /* ── Step 1: Big welcome ── */
            <div className="px-8 pt-12 pb-10 text-center relative overflow-hidden">
              {/* Background gradient orbs */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-gradient-to-b from-[#6B0099]/30 to-transparent rounded-full blur-3xl pointer-events-none" />

              {/* Pioneer badge */}
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 14, stiffness: 200, delay: 0.15 }}
                className="relative inline-flex mb-6"
              >
                <div className="w-24 h-24 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 40%, #FFD700 70%, #B8860B 100%)', boxShadow: '0 0 40px rgba(255,180,0,0.5)' }}>
                  <Medal size={44} className="text-black" />
                </div>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
                  className="absolute -inset-2 rounded-full border-2 border-dashed border-yellow-400/40"
                />
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-yellow-400/70 mb-2">You've earned it</p>
                <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter text-white mb-1">
                  Pioneer Badge
                </h1>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/30 mb-8">Early Access Member</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <p className="text-lg font-bold text-white/80 leading-relaxed mb-2">
                  Welcome to Plajah, <span className="text-yellow-400">{firstName}</span>.
                </p>
                <p className="text-sm text-white/50 leading-relaxed max-w-md mx-auto">
                  You're one of the first people here. That means you're not just a user — you're a founding voice in something we believe will change how creators and fans connect.
                </p>
              </motion.div>

              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                onClick={() => setStep('package')}
                className="mt-10 inline-flex items-center gap-3 px-10 py-4 rounded-full font-black uppercase tracking-widest text-sm text-black transition-all hover:scale-105 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)' }}
              >
                See Your Welcome Package
                <ChevronRight size={16} />
              </motion.button>

              <p className="mt-4 text-[9px] text-white/20 uppercase tracking-widest">
                or{' '}
                <button onClick={onDismiss} className="underline hover:text-white/40 transition-colors">
                  skip for now
                </button>
                {' '}— it'll be in your messages
              </p>
            </div>

          ) : (
            /* ── Step 2: Full package ── */
            <div className="px-6 lg:px-8 pt-10 pb-10">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 mb-3">
                  <Star size={14} className="text-yellow-400" fill="currentColor" />
                  <span className="text-[9px] font-black uppercase tracking-[0.4em] text-yellow-400/70">Your Welcome Package</span>
                  <Star size={14} className="text-yellow-400" fill="currentColor" />
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-white">Here's how to get started</h2>
              </div>

              {/* 4 action cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                {cards.map((card, i) => (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className={`p-5 rounded-2xl bg-gradient-to-br ${card.color} border ${card.border}`}
                  >
                    <card.icon size={20} className={`${card.iconColor} mb-3`} />
                    <p className="text-sm font-black uppercase tracking-wide text-white mb-1.5">{card.title}</p>
                    <p className="text-[11px] text-white/55 leading-relaxed">{card.body}</p>
                  </motion.div>
                ))}
              </div>

              {/* Plajah Club invite */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="mb-5 p-5 rounded-2xl bg-gradient-to-r from-[#6B0099]/25 to-[#FF8C00]/15 border border-[#6B0099]/30 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6B0099] to-[#FF8C00] flex items-center justify-center shrink-0">
                  <Users size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black uppercase tracking-wide text-white mb-0.5">Join The Plajah Club</p>
                  <p className="text-[11px] text-white/50 leading-snug">
                    Our official community space for early members. Share ideas, meet other creators, and get direct access to the team.
                  </p>
                </div>
                <ChevronRight size={16} className="text-white/30 shrink-0" />
              </motion.div>

              {/* Early access note */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42 }}
                className="mb-6 p-5 rounded-2xl bg-white/[0.03] border border-white/8"
              >
                <div className="flex items-start gap-3">
                  <Sparkles size={16} className="text-white/30 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-white/50 mb-2">A note on early access</p>
                    <p className="text-[12px] text-white/45 leading-relaxed">
                      Plajah is growing fast, and like anything built with care, you may run into a bump or two along the way. We genuinely appreciate your patience — every piece of feedback you share helps us build something better. You're not just using the platform, you're shaping it.
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Mission statement */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.48 }}
                className="text-center mb-8"
              >
                <Heart size={16} className="text-small-orange mx-auto mb-3" />
                <p className="text-[13px] text-white/60 leading-relaxed max-w-md mx-auto italic">
                  "Plajah exists to be the best place in the world for creators to share their work and for fans to connect with the people behind it. We're building that — together."
                </p>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mt-3">— The Plajah Team</p>
              </motion.div>

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="text-center"
              >
                <button
                  onClick={onDismiss}
                  className="inline-flex items-center gap-3 px-12 py-4 rounded-full font-black uppercase tracking-widest text-sm text-black hover:scale-105 active:scale-95 transition-all"
                  style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)' }}
                >
                  Let's Go
                  <ChevronRight size={16} />
                </button>
                <p className="mt-4 text-[9px] text-white/20 uppercase tracking-widest">
                  This message will be saved in your DMs
                </p>
              </motion.div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default WelcomePackageModal;
