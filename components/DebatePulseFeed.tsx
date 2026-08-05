/**
 * DebatePulseFeed
 *
 * Rendered inside the "Platform Pulse" tab of FeedView.
 * Three sections:
 *   My Arena       — the current user's own active/recent debates
 *   Following Heat — debates featuring people they follow, sorted by engagement
 *   Platform Spotlight — top debates platform-wide by engagement score
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Swords, Flame, Globe, User, ChevronRight, RefreshCw, Zap } from 'lucide-react';
import { getPulseDebates, type PulseDebates } from '../services/debateService';
import DebateCard from './DebateCard';
import { Debate } from '../types';

interface Props {
  uid: string;
  followingIds: string[];
  onOpenDebate: (id: string) => void;
}

// ─── Section header ───────────────────────────────────────────────────────────

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  accent: string;
}> = ({ icon, title, subtitle, count, accent }) => (
  <div className="flex items-center justify-between mb-4 px-1">
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-2xl flex items-center justify-center ${accent}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-black text-white leading-none">{title}</p>
        <p className="text-[9px] text-white/35 font-medium mt-0.5">{subtitle}</p>
      </div>
    </div>
    {count > 0 && (
      <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{count} debates</span>
    )}
  </div>
);

// ─── Horizontal scroll row ────────────────────────────────────────────────────

const DebateRow: React.FC<{
  debates: Debate[];
  onOpen: (id: string) => void;
  emptyMessage: string;
  delay?: number;
}> = ({ debates, onOpen, emptyMessage, delay = 0 }) => {
  const rowRef = useRef<HTMLDivElement>(null);

  if (debates.length === 0) {
    return (
      <div className="py-8 text-center border border-dashed border-white/8 rounded-2xl">
        <Swords size={20} className="text-white/15 mx-auto mb-2" />
        <p className="text-[10px] text-white/25 font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      className="flex gap-4 overflow-x-auto pb-3 scroll-smooth"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {debates.map((debate, i) => (
        <motion.div
          key={debate.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: delay + i * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 w-[300px] sm:w-[340px]"
        >
          <DebateCard debate={debate} onOpen={onOpen} />
        </motion.div>
      ))}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const DebatePulseFeed: React.FC<Props> = ({ uid, followingIds, onOpenDebate }) => {
  const [data, setData]     = useState<PulseDebates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await getPulseDebates(uid, followingIds);
      setData(result);
    } catch (e: any) {
      setError('Could not load debates. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { if (uid) load(); }, [uid]);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
          <Swords size={16} className="text-orange-400 absolute inset-0 m-auto" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/25">Loading debate pulse…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-white/40">{error}</p>
        <button
          onClick={() => load()}
          className="px-4 py-2 rounded-xl bg-white/8 text-white/60 text-xs font-black uppercase tracking-widest hover:bg-white/12 transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  const { mine = [], following = [], trending = [] } = data ?? {};
  const hasAny = mine.length + following.length + trending.length > 0;

  return (
    <div className="space-y-10 pb-20">

      {/* Pulse header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Platform Pulse</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/25 hover:text-white/60 transition-colors"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </motion.div>

      {/* ── My Arena ─────────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <SectionHeader
          icon={<User size={15} className="text-orange-400" />}
          title="My Arena"
          subtitle="Your active challenges and recent debates"
          count={mine.length}
          accent="bg-orange-500/15"
        />
        <DebateRow
          debates={mine}
          onOpen={onOpenDebate}
          emptyMessage="No debates yet — challenge a post or comment to start one"
          delay={0.1}
        />
      </motion.section>

      {/* ── Following Heat ────────────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
      >
        <SectionHeader
          icon={<Flame size={15} className="text-red-400" />}
          title="Following Heat"
          subtitle={followingIds.length > 0 ? `Debates featuring ${followingIds.length} creators you follow` : 'Follow creators to see their debates here'}
          count={following.length}
          accent="bg-red-500/15"
        />
        <DebateRow
          debates={following}
          onOpen={onOpenDebate}
          emptyMessage={followingIds.length === 0 ? 'Follow some creators to see their debates here' : 'No active debates from people you follow right now'}
          delay={0.18}
        />
      </motion.section>

      {/* ── Platform Spotlight ───────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <SectionHeader
          icon={<Globe size={15} className="text-blue-400" />}
          title="Platform Spotlight"
          subtitle="Most engaging debates across Plajah right now"
          count={trending.length}
          accent="bg-blue-500/15"
        />
        <DebateRow
          debates={trending}
          onOpen={onOpenDebate}
          emptyMessage="No public debates yet — be the first to start one"
          delay={0.26}
        />
      </motion.section>

      {/* Empty state */}
      {!hasAny && !loading && (
        <div className="py-24 text-center space-y-4">
          <Swords size={48} className="text-white/10 mx-auto" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">The debate floor is quiet</p>
          <p className="text-[9px] text-white/15 max-w-xs mx-auto leading-relaxed">
            Challenge a post or comment from your feed to start a structured debate
          </p>
        </div>
      )}
    </div>
  );
};

export default DebatePulseFeed;
