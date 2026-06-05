/**
 * Do You Know — Aria-powered feature discovery
 *
 * Shows contextual tips about platform features the user hasn't tried,
 * based on their profile and goals. Tapping "Ask Aria" opens the AI
 * agent pre-loaded with a prompt explaining how the feature helps them.
 *
 * Tips are stored in localStorage so the same tip isn't shown twice.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, Sparkles, ChevronLeft } from 'lucide-react';
import { DoYouKnowTip, DoYouKnowCategory } from '../types';
import { AriaUserContext } from '../services/ariaContextService';

// ── Tip library ───────────────────────────────────────────────────────────────

const ALL_TIPS: DoYouKnowTip[] = [
  {
    id: 'polls-101',
    category: 'SOCIAL',
    emoji: '📊',
    headline: 'Polls drive 3× more engagement',
    body: 'Add a poll to any post and your fans vote directly in the feed. Ask anything — what album to drop next, which city to tour first, or just vibe-check your audience.',
    cta: 'Create a Poll',
    ctaView: 'FEED',
    ariaPrompt: 'I want to create my first poll. Help me write a great question that will get my audience engaged and tell me how polls work on Plajah.',
    requiredFeature: 'polls',
    priority: 90,
  },
  {
    id: 'challenges-101',
    category: 'COMMUNITY',
    emoji: '🏆',
    headline: 'Start or join a creator challenge',
    body: 'Challenges give your fans something to do together. Launch a cover challenge, a fan art challenge, or join an active platform challenge to get discovered by new audiences.',
    cta: 'See Challenges',
    ctaView: 'CHALLENGES',
    ariaPrompt: 'Explain how creator challenges work on Plajah and help me plan a challenge that fits my brand and gets my fans excited to participate.',
    requiredFeature: 'challenges',
    priority: 85,
  },
  {
    id: 'broadcast-101',
    category: 'CREATOR',
    emoji: '📣',
    headline: 'Broadcast Channels: your private direct line',
    body: 'Send one-way announcements straight to your fans — no algorithm, no noise. Perfect for drops, tour dates, exclusive previews, and behind-the-scenes updates.',
    cta: 'Create Channel',
    ctaView: 'BROADCAST_CHANNELS',
    ariaPrompt: 'I want to set up a broadcast channel for my fans. Tell me what makes a great broadcast channel and help me plan my first few announcements.',
    requiredFeature: 'broadcastChannels',
    priority: 80,
  },
  {
    id: 'close-friends-101',
    category: 'SOCIAL',
    emoji: '⭐',
    headline: 'Close Friends: your inner circle',
    body: 'Build a private feed for your closest fans and collaborators. Share content only they can see — early listens, rough cuts, personal updates. Deepens loyalty like nothing else.',
    cta: 'Set Up Inner Circle',
    ctaView: 'CLOSE_FRIENDS',
    ariaPrompt: 'Help me think through who should be in my Close Friends list and what kind of content I should share exclusively with them to build deeper loyalty.',
    requiredFeature: 'closeFriends',
    priority: 75,
  },
  {
    id: 'sanctuary-101',
    category: 'MONETIZE',
    emoji: '💎',
    headline: 'Turn followers into paying members',
    body: 'Sanctuary is your subscription layer. Fans pay monthly to access exclusive content, chat directly with you, and support your work. Creators earn 85% of every subscription.',
    cta: 'Set Up Sanctuary',
    ctaView: 'SANCTUARY',
    ariaPrompt: 'I want to launch a Sanctuary membership for my fans. Help me decide what to offer, how to price it, and how to announce it in a way that converts followers to paying members.',
    requiredFeature: 'sanctuary',
    priority: 88,
  },
  {
    id: 'dataviz-101',
    category: 'CREATOR',
    emoji: '🔬',
    headline: 'Post live data visualizations',
    body: 'Embed real-time earthquake maps, NASA near-Earth objects, weather charts, or your own data directly in a post. Nobody else does this. Huge for science, news, and niche creators.',
    cta: 'Try Data Viz',
    ctaView: 'FEED',
    ariaPrompt: 'Show me how to embed a data visualization in a post and suggest which live datasets would work best for my type of content.',
    requiredFeature: 'dataViz',
    priority: 60,
  },
  {
    id: 'rello-101',
    category: 'UPLOAD',
    emoji: '▶️',
    headline: 'Rello: your short-form video studio',
    body: 'Upload a video and send it to Rello — Plajah\'s short-form format. Rello content surfaces in discovery feeds and lets new fans find you fast.',
    cta: 'Open Rello',
    ctaView: 'RELLO',
    ariaPrompt: 'Help me plan a Rello content strategy. What kinds of short videos work best for my genre, how long should they be, and how often should I post?',
    requiredFeature: 'rello',
    priority: 72,
  },
  {
    id: 'livetalk-101',
    category: 'LIVE',
    emoji: '🎙️',
    headline: 'Live Talk: host a room, build community',
    body: 'Start an audio room — like Clubhouse, but inside Plajah. Invite fans to speak, discuss your latest drop, or host a listening party in real time.',
    cta: 'Start a Live Talk',
    ctaView: 'LIVE_HUB',
    ariaPrompt: 'I want to host my first Live Talk. Help me plan the topic, how to get fans to show up, and what makes a Live Talk session feel worth attending.',
    requiredFeature: 'liveTalk',
    priority: 70,
  },
  {
    id: 'timed-reveal-101',
    category: 'SOCIAL',
    emoji: '⏳',
    headline: 'Timed reveal posts build insane anticipation',
    body: 'Schedule a post to unlock at an exact moment — album drops, announcements, event reveals. Fans see the countdown and the moment it drops they\'re all there.',
    cta: 'Create a Reveal',
    ctaView: 'FEED',
    ariaPrompt: 'Help me plan a timed reveal post for an upcoming announcement. What should I tease in the preview, when should I set the unlock time, and how do I build maximum anticipation?',
    requiredFeature: 'timedReveal',
    priority: 65,
  },
  {
    id: 'analytics-101',
    category: 'ANALYTICS',
    emoji: '📈',
    headline: 'Your analytics tell you exactly what\'s working',
    body: 'Check your Social Insights dashboard to see which posts drive the most engagement, when your fans are active, and how your polls and challenges are performing.',
    cta: 'View Insights',
    ctaView: 'SOCIAL_INSIGHTS',
    ariaPrompt: 'Review my analytics with me. Based on my recent data, what\'s working, what\'s not, and what should I do differently this week to grow faster?',
    priority: 68,
  },
  {
    id: 'clubs-101',
    category: 'COMMUNITY',
    emoji: '🏛️',
    headline: 'Clubs: build your own community hub',
    body: 'Create a club around your niche — a fan club, genre community, or creative collective. Clubs have their own chat, events, gallery, live streams, and merch store.',
    cta: 'Start a Club',
    ctaView: 'CLUBS',
    ariaPrompt: 'I want to start a club on Plajah. Help me think through the theme, what to name it, how to set it up, and how to get my first members excited to join.',
    requiredFeature: 'clubs',
    priority: 62,
  },
  {
    id: 'signature-moments-101',
    category: 'SOCIAL',
    emoji: '✨',
    headline: 'Mark Signature Moments in your music or videos',
    body: 'Flag a specific timestamp as a "cultural moment" — that 30-second section that defines a track. Fans discover these moments and the best ones rise to the top of the community timeline.',
    cta: 'Create a Moment',
    ctaView: 'SIGNATURE_MOMENTS',
    ariaPrompt: 'Explain Signature Moments and help me identify which parts of my content would work best as a flagged moment that fans would want to discover.',
    requiredFeature: 'signatureMoments',
    priority: 55,
  },
  {
    id: 'aria-account-101',
    category: 'AI',
    emoji: '🤖',
    headline: 'Ask Aria to help run your account',
    body: 'Aria knows your analytics, follower activity, and goals in real time. Ask her to plan your content calendar, write post copy, suggest the best time to drop music, or analyze why a post underperformed.',
    cta: 'Talk to Aria',
    ariaPrompt: 'I want you to help me run my Plajah account more strategically. Start by reviewing my current activity and giving me your top 3 recommendations for what to do this week.',
    priority: 95,
  },
];

// ── Seen tips storage ─────────────────────────────────────────────────────────

const SEEN_KEY = 'plajah_dyk_seen';

function getSeenTips(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function markTipSeen(id: string) {
  try {
    const seen = getSeenTips();
    seen.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {}
}

// ── Category colors ───────────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<DoYouKnowCategory, { bg: string; border: string; text: string }> = {
  SOCIAL:     { bg: 'bg-blue-500/15',   border: 'border-blue-500/25',   text: 'text-blue-300'   },
  MONETIZE:   { bg: 'bg-yellow-500/15', border: 'border-yellow-500/25', text: 'text-yellow-300' },
  AI:         { bg: 'bg-purple-500/15', border: 'border-purple-500/25', text: 'text-purple-300' },
  LIVE:       { bg: 'bg-red-500/15',    border: 'border-red-500/25',    text: 'text-red-300'    },
  COMMUNITY:  { bg: 'bg-green-500/15',  border: 'border-green-500/25',  text: 'text-green-300'  },
  ANALYTICS:  { bg: 'bg-cyan-500/15',   border: 'border-cyan-500/25',   text: 'text-cyan-300'   },
  CREATOR:    { bg: 'bg-orange-500/15', border: 'border-orange-500/25', text: 'text-orange-300' },
  UPLOAD:     { bg: 'bg-pink-500/15',   border: 'border-pink-500/25',   text: 'text-pink-300'   },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface DoYouKnowProps {
  context?: AriaUserContext | null;
  onNavigate?: (view: string) => void;
  onOpenAria?: (prompt: string) => void;
  compact?: boolean; // sidebar mode
}

const DoYouKnow: React.FC<DoYouKnowProps> = ({
  context,
  onNavigate,
  onOpenAria,
  compact = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(getSeenTips());
  const [animDir, setAnimDir] = useState<'next' | 'prev'>('next');

  // Filter tips: prioritize unseen, relevant to unused features
  const activeTips = useMemo(() => {
    const seen = dismissed;
    const unusedFeatures = new Set(context?.unusedFeatures || []);

    return ALL_TIPS
      .filter(tip => {
        if (seen.has(tip.id)) return false;
        if (tip.requiredFeature && !unusedFeatures.has(tip.requiredFeature)) return false;
        return true;
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 8);
  }, [dismissed, context?.unusedFeatures]);

  const tip = activeTips[currentIndex];

  const dismiss = (id: string) => {
    markTipSeen(id);
    setDismissed(prev => new Set([...prev, id]));
    if (currentIndex >= activeTips.length - 1) setCurrentIndex(0);
  };

  const next = () => {
    setAnimDir('next');
    setCurrentIndex(i => (i + 1) % activeTips.length);
  };
  const prev = () => {
    setAnimDir('prev');
    setCurrentIndex(i => (i - 1 + activeTips.length) % activeTips.length);
  };

  if (!tip || activeTips.length === 0) return null;

  const style = CATEGORY_STYLE[tip.category];

  if (compact) {
    return (
      <motion.div
        key={tip.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl p-3 border ${style.bg} ${style.border} relative`}
      >
        <button onClick={() => dismiss(tip.id)} className="absolute top-2 right-2 text-white/20 hover:text-white/60 transition-colors">
          <X size={11} />
        </button>
        <div className="flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">{tip.emoji}</span>
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-[10px] font-black text-white leading-snug mb-1">{tip.headline}</p>
            <button
              onClick={() => onOpenAria?.(tip.ariaPrompt)}
              className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-wider ${style.text} hover:opacity-80 transition-opacity`}
            >
              <Sparkles size={9} />
              Ask Aria
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={tip.id}
          initial={{ opacity: 0, x: animDir === 'next' ? 24 : -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: animDir === 'next' ? -24 : 24 }}
          transition={{ duration: 0.22 }}
          className={`rounded-[1.8rem] border ${style.bg} ${style.border} overflow-hidden`}
        >
          {/* Header */}
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={12} className={style.text} />
                <span className={`text-[9px] font-black uppercase tracking-[0.35em] ${style.text}`}>
                  Do You Know?
                </span>
                {activeTips.length > 1 && (
                  <span className="text-[8px] text-white/20 font-black">
                    {currentIndex + 1}/{activeTips.length}
                  </span>
                )}
              </div>
              <button onClick={() => dismiss(tip.id)} className="text-white/20 hover:text-white/50 transition-colors shrink-0 -mt-1">
                <X size={14} />
              </button>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-3xl leading-none shrink-0">{tip.emoji}</span>
              <div>
                <h3 className="text-sm font-black text-white leading-tight mb-2">{tip.headline}</h3>
                <p className="text-[11px] text-white/60 leading-relaxed">{tip.body}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className={`px-6 py-4 border-t ${style.border} flex items-center gap-3`}>
            {tip.ctaView && onNavigate && (
              <button
                onClick={() => { onNavigate(tip.ctaView!); dismiss(tip.id); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider text-black transition-all hover:scale-105 active:scale-95`}
                style={{ background: 'linear-gradient(135deg, #FF8C00, #D40055)' }}
              >
                {tip.cta}
                <ChevronRight size={11} />
              </button>
            )}
            <button
              onClick={() => { onOpenAria?.(tip.ariaPrompt); dismiss(tip.id); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all hover:scale-105 ${style.border} ${style.text} hover:bg-white/5`}
            >
              <Sparkles size={11} />
              Ask Aria
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation arrows */}
      {activeTips.length > 1 && (
        <div className="flex items-center justify-center gap-3 mt-3">
          <button onClick={prev} className="p-1.5 rounded-full text-white/20 hover:text-white/60 hover:bg-white/8 transition-all">
            <ChevronLeft size={14} />
          </button>
          <div className="flex gap-1.5">
            {activeTips.slice(0, 6).map((_, i) => (
              <button
                key={i}
                onClick={() => { setAnimDir(i > currentIndex ? 'next' : 'prev'); setCurrentIndex(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentIndex ? 'bg-orange-400 w-3' : 'bg-white/20'}`}
              />
            ))}
          </div>
          <button onClick={next} className="p-1.5 rounded-full text-white/20 hover:text-white/60 hover:bg-white/8 transition-all">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

export default DoYouKnow;
