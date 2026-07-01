import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Send, Shield, Swords, Clock, Users, Trophy,
  AlertTriangle, CheckCircle2, BarChart2, Share2, ExternalLink,
  ChevronDown, ChevronUp, Zap, BookOpen, Star, X, Mic,
} from 'lucide-react';
import DebateCountdownTimer from './DebateCountdownTimer';
import { Debate, DebatePost, DebateVerdict, DebateSide } from '../types';
import { buildShareUrl } from '../services/deepLinkService';
import {
  listenDebate, listenDebatePosts, postToDebate, voteDebateSide,
  acceptDebate, declineDebate, triggerAriaJudgment,
} from '../services/debateService';
import { auth } from '../services/backendService';
import { formatDistanceToNow, format } from 'date-fns';

// ── Color system ──────────────────────────────────────────────────────────────
// Challenger = #DC2626 (red-600) | Defender = #16A34A (green-600)

const CHALLENGER_BG     = 'bg-red-600/12';
const CHALLENGER_BORDER = 'border-red-500/30';
const CHALLENGER_TEXT   = 'text-red-400';
const CHALLENGER_BADGE  = 'bg-red-600/20 border-red-500/30 text-red-400';
const DEFENDER_BG       = 'bg-emerald-600/12';
const DEFENDER_BORDER   = 'border-emerald-500/30';
const DEFENDER_TEXT     = 'text-emerald-400';
const DEFENDER_BADGE    = 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400';

function sideStyle(side: DebateSide) {
  const isChallenger = side === 'CHALLENGER' || side === 'CHALLENGER_SUPPORT';
  return isChallenger
    ? { bg: CHALLENGER_BG, border: CHALLENGER_BORDER, text: CHALLENGER_TEXT, badge: CHALLENGER_BADGE, label: side === 'CHALLENGER' ? 'Challenger' : 'Supporting Challenger' }
    : { bg: DEFENDER_BG,   border: DEFENDER_BORDER,   text: DEFENDER_TEXT,   badge: DEFENDER_BADGE,   label: side === 'DEFENDER'   ? 'Defender'   : 'Supporting Defender'   };
}

function timeLeft(endsAt: number): string {
  const diff = endsAt - Date.now();
  if (diff <= 0) return 'Ended';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const REACTIONS = ['🔥','👏','💯','🤔','❓','💡'];

// ── Post bubble ───────────────────────────────────────────────────────────────

const DebatePostBubble: React.FC<{ post: DebatePost; isMe: boolean }> = ({ post, isMe }) => {
  const s = sideStyle(post.side);
  if (post.authorId === 'PLAJAH_SYSTEM') {
    return (
      <div className="flex justify-center my-3">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
          <Zap size={11} className="text-orange-400" />
          <p className="text-[10px] font-bold text-white/60">{post.text}</p>
        </div>
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, x: isMe ? 16 : -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''} ${post.isDisqualified ? 'opacity-40' : ''}`}
    >
      <img
        src={post.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.authorId}`}
        className={`w-8 h-8 rounded-full object-cover shrink-0 mt-1 border-2 ${s.border}`}
        alt=""
      />
      <div className={`max-w-[72%] space-y-1 ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-black text-white/60">{post.authorName}</span>
          <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${s.badge}`}>
            {s.label}
          </span>
          {post.isDisqualified && (
            <span className="text-[8px] font-black text-red-500 uppercase tracking-wider flex items-center gap-0.5">
              <AlertTriangle size={9} /> DQ
            </span>
          )}
        </div>
        <div className={`px-4 py-3 rounded-2xl border ${s.bg} ${s.border}`}>
          {post.isDisqualified ? (
            <p className="text-[11px] text-white/30 italic">This post was removed for violating civil discourse rules.</p>
          ) : (
            <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{post.text}</p>
          )}
        </div>
        <span className="text-[9px] text-white/20 px-1">{formatDistanceToNow(post.timestamp, { addSuffix: true })}</span>
      </div>
    </motion.div>
  );
};

// ── Verdict panel ─────────────────────────────────────────────────────────────

const VerdictPanel: React.FC<{ verdict: DebateVerdict; debate: Debate }> = ({ verdict, debate }) => {
  const [expanded, setExpanded] = useState(false);
  const isChallenger = verdict.winner === 'CHALLENGER';
  const isDraw       = verdict.winner === 'DRAW';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: isDraw ? 'rgba(234,179,8,0.4)' : isChallenger ? 'rgba(220,38,38,0.4)' : 'rgba(22,163,74,0.4)' }}
    >
      {/* Winner header */}
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{ background: isDraw ? 'rgba(234,179,8,0.1)' : isChallenger ? 'rgba(220,38,38,0.1)' : 'rgba(22,163,74,0.1)' }}
      >
        <div className="text-2xl">{isDraw ? '🤝' : '🏆'}</div>
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-0.5">Aria's Verdict</p>
          <p className="text-sm font-black text-white">
            {isDraw ? 'Draw — Both sides argued well' : `${verdict.winnerName} wins this debate`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] text-white/30 font-bold">Public consensus</p>
          <p className="text-base font-black text-white">{verdict.consensusScore}%</p>
        </div>
      </div>

      {/* Score bars */}
      <div className="px-5 py-4 grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-black text-red-400 uppercase tracking-wider">{debate.challengerName}</span>
            <span className="text-[10px] font-black text-white">{verdict.challengerScore}</span>
          </div>
          <div className="h-2 bg-white/8 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${verdict.challengerScore}%` }}
              transition={{ duration: 0.8 }}
              className="h-full bg-red-500 rounded-full"
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">{debate.defenderName}</span>
            <span className="text-[10px] font-black text-white">{verdict.defenderScore}</span>
          </div>
          <div className="h-2 bg-white/8 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${verdict.defenderScore}%` }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="h-full bg-emerald-500 rounded-full"
            />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="px-5 pb-4">
        <p className="text-[12px] text-white/70 leading-relaxed italic">{verdict.summary}</p>
      </div>

      {/* Expand for full breakdown */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-3 border-t border-white/8 flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 hover:bg-white/[0.03] transition-all"
      >
        <span className="flex items-center gap-1.5"><BookOpen size={11} /> Full Analysis</span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4">
              {/* Academic scores */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Academic Rubric</p>
                <div className="grid grid-cols-4 gap-2">
                  {(['logic', 'evidence', 'civility', 'clarity'] as const).map(k => (
                    <div key={k} className="bg-white/5 rounded-xl p-2 text-center">
                      <p className="text-sm font-black text-white">{verdict.academicScore[k]}/10</p>
                      <p className="text-[8px] text-white/30 capitalize">{k}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Fact Check</p>
                <p className="text-[11px] text-white/60 leading-relaxed">{verdict.factCheck}</p>
              </div>

              <div className="p-3 rounded-xl bg-yellow-500/8 border border-yellow-500/20">
                <p className="text-[9px] font-black uppercase tracking-widest text-yellow-400/70 mb-1.5 flex items-center gap-1"><Star size={9} /> Aria's Missed Facts</p>
                <p className="text-[11px] text-white/60 leading-relaxed">{verdict.ignoredFacts}</p>
              </div>

              {verdict.disqualificationNotes && (
                <div className="p-3 rounded-xl bg-red-500/8 border border-red-500/20">
                  <p className="text-[9px] font-black uppercase tracking-widest text-red-400/70 mb-1.5 flex items-center gap-1"><AlertTriangle size={9} /> Disqualifications</p>
                  <p className="text-[11px] text-white/60 leading-relaxed">{verdict.disqualificationNotes}</p>
                </div>
              )}

              <p className="text-[8px] text-white/20">Analysis generated by Aria · {format(verdict.generatedAt, 'MMM d, yyyy HH:mm')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

interface DebateViewProps {
  debateId: string;
  onBack?: () => void;
}

const DebateView: React.FC<DebateViewProps> = ({ debateId, onBack }) => {
  const [debate, setDebate]   = useState<Debate | null>(null);
  const [posts, setPosts]     = useState<DebatePost[]>([]);
  const [text, setText]       = useState('');
  const [sending, setSending] = useState(false);
  const [dqWarn, setDqWarn]   = useState<string | null>(null);
  const [showVotePrompt, setShowVotePrompt] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    const u1 = listenDebate(debateId, d => {
      setDebate(d);
      // Trigger Aria judgment if time has expired
      if (d.status === 'ENDED' || (d.status === 'ACTIVE' && Date.now() > d.endsAt)) {
        triggerAriaJudgment(debateId).catch(() => {});
      }
    });
    const u2 = listenDebatePosts(debateId, setPosts);
    return () => { u1(); u2(); };
  }, [debateId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [posts.length]);

  const myRole = useCallback((): DebateSide | null => {
    if (!debate || !uid) return null;
    if (uid === debate.challengerId) return 'CHALLENGER';
    if (uid === debate.defenderId)   return 'DEFENDER';
    if (debate.challengerSupporters.includes(uid)) return 'CHALLENGER_SUPPORT';
    if (debate.defenderSupporters.includes(uid))   return 'DEFENDER_SUPPORT';
    return null;
  }, [debate, uid]);

  const handleSend = async () => {
    if (!text.trim() || !debate || sending) return;
    const role = myRole();
    if (!role) { setShowVotePrompt(true); return; }
    setSending(true);
    try {
      const result = await postToDebate(debateId, text.trim(), role);
      if (result.disqualified) setDqWarn(result.reason || 'Your post was flagged. Please keep discourse civil.');
      setText('');
    } finally { setSending(false); }
  };

  const handleVote = async (side: 'CHALLENGER' | 'DEFENDER') => {
    await voteDebateSide(debateId, side);
    setShowVotePrompt(false);
  };

  const handleShare = () => {
    const url = buildShareUrl('debate', debateId);
    if (navigator.share) {
      navigator.share({ title: `Plajah Debate: ${debate?.topic}`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
    }
  };

  if (!debate) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/10 border-t-orange-400 rounded-full animate-spin" />
      </div>
    );
  }

  const isActive      = debate.status === 'ACTIVE';
  const isJudged      = debate.status === 'JUDGED';
  const isEnded       = debate.status === 'ENDED' || isJudged;
  const isDeclined    = debate.status === 'DECLINED';
  const isPending     = debate.status === 'PENDING';
  const isDefender    = uid === debate.defenderId;
  const cVotes = debate.challengerSupporters.length;
  const dVotes = debate.defenderSupporters.length;
  const total  = cVotes + dVotes;
  const cPct   = total > 0 ? Math.round((cVotes / total) * 100) : 50;
  const dPct   = 100 - cPct;
  const role   = myRole();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          {onBack && (
            <button onClick={onBack} className="p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all">
              <ArrowLeft size={15} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Swords size={13} className="text-orange-400 shrink-0" />
              <p className="text-[9px] font-black uppercase tracking-widest text-orange-400/70">Structured Debate</p>
            </div>
            <p className="text-sm font-black text-white leading-tight truncate">{debate.topic}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleShare} className="p-2 rounded-full hover:bg-white/10 text-white/30 hover:text-white transition-all" title="Share debate">
              <Share2 size={14} />
            </button>
          </div>
        </div>

        {/* Participant banners */}
        <div className="grid grid-cols-2 gap-2">
          <div className={`flex items-center gap-2 p-2.5 rounded-xl border ${CHALLENGER_BG} ${CHALLENGER_BORDER}`}>
            <img src={debate.challengerPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${debate.challengerId}`} className="w-7 h-7 rounded-full object-cover border border-red-500/30" alt="" />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-wider text-red-400">Challenger</p>
              <p className="text-[11px] font-black text-white truncate">{debate.challengerName}</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 p-2.5 rounded-xl border ${DEFENDER_BG} ${DEFENDER_BORDER}`}>
            <img src={debate.defenderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${debate.defenderId}`} className="w-7 h-7 rounded-full object-cover border border-emerald-500/30" alt="" />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-400">Defender</p>
              <p className="text-[11px] font-black text-white truncate">{debate.defenderName}</p>
            </div>
          </div>
        </div>

        {/* Countdown timer — only when debate is active */}
        {isActive && (
          <div className="mt-3">
            <DebateCountdownTimer
              endsAt={debate.endsAt}
              totalDurationMs={24 * 60 * 60 * 1000}
              onExpired={() => triggerAriaJudgment(debateId).catch(() => {})}
            />
          </div>
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex items-center gap-1.5">
            {isActive && <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />}
            <span className={`text-[9px] font-black uppercase tracking-wider ${
              isActive ? 'text-orange-400' : isJudged ? 'text-yellow-400' : isDeclined ? 'text-white/30' : 'text-white/30'
            }`}>
              {isPending ? 'Awaiting acceptance' : isActive ? 'Live' : isDeclined ? 'Declined' : isJudged ? 'Judged ✓' : 'Ended — awaiting judgment'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-white/25 font-bold">
            <Users size={10} />
            {debate.viewCount} views · {posts.filter(p => p.authorId !== 'PLAJAH_SYSTEM').length} posts
          </div>
        </div>

        {/* Public vote bar */}
        {total > 0 && (
          <div className="mt-2">
            <div className="h-1.5 rounded-full overflow-hidden flex">
              <div className="bg-red-500 transition-all duration-500" style={{ width: `${cPct}%` }} />
              <div className="bg-emerald-500 flex-1 transition-all duration-500" />
            </div>
            <div className="flex justify-between text-[8px] text-white/30 font-bold mt-0.5">
              <span>{cPct}% ({cVotes})</span>
              <span>{dPct}% ({dVotes})</span>
            </div>
          </div>
        )}

        {/* Challenge Reference — highlighted post segments for post-level debates */}
        {debate.isPostDebate && debate.sourcePostText && debate.highlightedSegments && debate.highlightedSegments.length > 0 && (
          <div className="mt-3 bg-orange-500/6 border border-orange-500/15 rounded-2xl px-4 py-3">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-orange-400/60 mb-2 flex items-center gap-1.5">
              <BookOpen size={9} /> Challenge Reference
            </p>
            <div className="text-[11px] text-white/60 leading-6 font-serif">
              {(() => {
                const segs = [...debate.highlightedSegments].sort((a, b) => a.start - b.start);
                const src  = debate.sourcePostText!;
                const parts: React.ReactNode[] = [];
                let cur = 0;
                segs.forEach((seg, i) => {
                  if (seg.start > cur) parts.push(<span key={`t${i}`}>{src.slice(cur, seg.start)}</span>);
                  parts.push(
                    <mark key={`h${i}`} className="bg-orange-500/30 text-orange-100 rounded px-0.5 border-b border-orange-400/50 not-italic">
                      {src.slice(seg.start, seg.end)}
                    </mark>
                  );
                  cur = seg.end;
                });
                if (cur < src.length) parts.push(<span key="tend">{src.slice(cur)}</span>);
                return parts;
              })()}
            </div>
            {debate.challengePoints && debate.challengePoints.length > 0 && (
              <div className="mt-3 border-t border-orange-500/10 pt-2.5 space-y-1.5">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-orange-400/60">Challenge Points</p>
                {debate.challengePoints.map((pt, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[8px] font-black text-orange-400/50 mt-0.5 shrink-0">{i + 1}.</span>
                    <p className="text-[10px] text-white/60 leading-relaxed">{pt}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pending accept/decline for defender */}
        {isPending && isDefender && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => acceptDebate(debateId)}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500/25 transition-all"
            >
              Accept Debate
            </button>
            <button
              onClick={() => declineDebate(debateId)}
              className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-wider hover:bg-white/10 transition-all"
            >
              Respectfully Decline
            </button>
          </div>
        )}
      </div>

      {/* Posts */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {posts.map(p => (
          <DebatePostBubble key={p.id} post={p} isMe={p.authorId === uid} />
        ))}

        {/* Verdict */}
        {isJudged && debate.verdict && (
          <VerdictPanel verdict={debate.verdict} debate={debate} />
        )}

        {isDeclined && (
          <div className="flex justify-center py-4">
            <div className="px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-center max-w-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Debate Closed</p>
              <p className="text-[11px] text-white/50">This debate did not take place. The choice to decline is respected.</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Disqualification warning */}
      <AnimatePresence>
        {dqWarn && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mx-4 mb-2 p-3 rounded-xl bg-red-500/15 border border-red-500/30 flex items-start gap-2"
          >
            <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-300 leading-snug flex-1">{dqWarn}</p>
            <button onClick={() => setDqWarn(null)} className="text-red-400/50 hover:text-red-400 shrink-0"><X size={12} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side picker modal */}
      <AnimatePresence>
        {showVotePrompt && uid && uid !== debate.challengerId && uid !== debate.defenderId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-end justify-center bg-black/60 backdrop-blur-sm px-4 pb-8"
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              className="w-full max-w-sm bg-[#0a0a0a] border border-white/10 rounded-3xl p-6"
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Choose Your Side</p>
              <p className="text-sm font-black text-white mb-4">Which position do you support? Your posts will be color-coded accordingly.</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button onClick={() => handleVote('CHALLENGER')} className={`py-3 rounded-xl border ${CHALLENGER_BG} ${CHALLENGER_BORDER} ${CHALLENGER_TEXT} text-[10px] font-black uppercase tracking-wider hover:bg-red-500/20 transition-all`}>
                  🔴 {debate.challengerName}
                </button>
                <button onClick={() => handleVote('DEFENDER')} className={`py-3 rounded-xl border ${DEFENDER_BG} ${DEFENDER_BORDER} ${DEFENDER_TEXT} text-[10px] font-black uppercase tracking-wider hover:bg-emerald-500/20 transition-all`}>
                  🟢 {debate.defenderName}
                </button>
              </div>
              <button onClick={() => setShowVotePrompt(false)} className="w-full py-2 text-[9px] text-white/25 hover:text-white/50 transition-colors font-black uppercase tracking-widest">Cancel</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      {isActive && (
        <div className="px-4 py-3 border-t border-white/5 shrink-0">
          {!role && !uid && (
            <p className="text-center text-[9px] text-white/25 uppercase tracking-widest mb-2">Sign in to join the debate</p>
          )}
          {role && (
            <div className={`text-[8px] font-black uppercase tracking-widest mb-1.5 flex items-center gap-1 ${
              role === 'CHALLENGER' || role === 'CHALLENGER_SUPPORT' ? CHALLENGER_TEXT : DEFENDER_TEXT
            }`}>
              <div className={`w-2 h-2 rounded-full ${role === 'CHALLENGER' || role === 'CHALLENGER_SUPPORT' ? 'bg-red-400' : 'bg-emerald-400'}`} />
              Posting as {sideStyle(role).label}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend(); }}
              placeholder={role ? 'Make your point…' : 'Pick a side to join the debate…'}
              rows={2}
              disabled={!uid}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 resize-none focus:outline-none focus:border-orange-500/40 transition-all"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="p-2.5 rounded-xl bg-orange-500 text-black disabled:opacity-40 hover:bg-orange-400 transition-colors shrink-0"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-[8px] text-white/15 mt-1 px-1">Participants: profanity and insults auto-disqualify you. Keep it civil.</p>
        </div>
      )}
    </div>
  );
};

export default DebateView;
