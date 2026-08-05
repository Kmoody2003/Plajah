/**
 * DebateChallengeButton
 *
 * Appears on each comment. When clicked, issues a debate challenge
 * (subject to the 3/day limit). Displays state: idle → pending/active debate.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Swords, X, AlertCircle, Loader2 } from 'lucide-react';
import { auth } from '../services/backendService';
import {
  issueDebateChallenge,
  getChallengesIssuedToday,
  ChallengePayload,
} from '../services/debateService';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../services/backendService';
import { Debate } from '../types';

interface DebateChallengeButtonProps {
  commentId: string;
  commentText: string;
  postId: string;
  commentAuthorId: string;
  commentAuthorName: string;
  commentAuthorPhoto: string;
  heroImageUrl?: string;
  onDebateCreated?: (debateId: string) => void;
  className?: string;
}

const DebateChallengeButton: React.FC<DebateChallengeButtonProps> = ({
  commentId,
  commentText,
  postId,
  commentAuthorId,
  commentAuthorName,
  commentAuthorPhoto,
  heroImageUrl,
  onDebateCreated,
  className = '',
}) => {
  const [status, setStatus] = useState<'idle' | 'confirming' | 'loading' | 'done' | 'active' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [remainingToday, setRemainingToday] = useState(3);
  const [existingDebateId, setExistingDebateId] = useState<string | null>(null);

  const uid = auth.currentUser?.uid;
  const isSelf = uid === commentAuthorId;

  // Check if this comment already has an active debate
  useEffect(() => {
    if (!commentId) return;
    getDocs(
      query(collection(db, 'debates'), where('sourceCommentId', '==', commentId), where('status', 'in', ['PENDING', 'ACTIVE']), limit(1))
    ).then(snap => {
      if (!snap.empty) {
        setExistingDebateId(snap.docs[0].id);
        setStatus('active');
      }
    }).catch(() => {});
  }, [commentId]);

  // Load remaining challenges today
  useEffect(() => {
    if (!uid) return;
    getChallengesIssuedToday(uid).then(count => setRemainingToday(Math.max(0, 3 - count)));
  }, [uid]);

  const handleChallenge = async () => {
    if (!uid) { setError('Sign in to challenge'); return; }
    if (isSelf) return;
    if (status === 'confirming') {
      // Confirmed — issue challenge
      setStatus('loading');
      try {
        const payload: ChallengePayload = {
          sourceCommentId: commentId,
          sourceCommentText: commentText,
          sourcePostId: postId,
          defenderId: commentAuthorId,
          defenderName: commentAuthorName,
          defenderPhoto: commentAuthorPhoto,
          topic: commentText.slice(0, 200),
          heroImageUrl,
        };
        const id = await issueDebateChallenge(payload);
        setRemainingToday(r => Math.max(0, r - 1));
        setStatus('done');
        if (id) onDebateCreated?.(id);
      } catch (e: any) {
        setError(e.message || 'Failed to issue challenge');
        setStatus('error');
        setTimeout(() => setStatus('idle'), 4000);
      }
      return;
    }
    setStatus('confirming');
  };

  if (isSelf || !uid) return null;
  if (status === 'active' && existingDebateId) {
    return (
      <button
        onClick={() => onDebateCreated?.(existingDebateId)}
        className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-orange-400/70 hover:text-orange-400 transition-colors ${className}`}
      >
        <Swords size={11} />
        In Debate
      </button>
    );
  }

  if (status === 'done') {
    return (
      <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-orange-400 ${className}`}>
        <Swords size={11} />
        Challenged!
      </span>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <AnimatePresence mode="wait">
        {status === 'confirming' ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/25 rounded-xl px-2 py-1"
          >
            <p className="text-[9px] font-black text-orange-400 whitespace-nowrap">
              Challenge {commentAuthorName}? ({remainingToday} left today)
            </p>
            <button onClick={handleChallenge} className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-orange-500 text-black text-[8px] font-black uppercase tracking-wider hover:bg-orange-400 transition-all">
              <Swords size={9} /> Yes
            </button>
            <button onClick={() => setStatus('idle')} className="text-white/30 hover:text-white transition-colors">
              <X size={11} />
            </button>
          </motion.div>
        ) : status === 'loading' ? (
          <motion.span key="loading" className="flex items-center gap-1 text-[9px] text-white/30">
            <Loader2 size={11} className="animate-spin" /> Challenging…
          </motion.span>
        ) : status === 'error' ? (
          <motion.span key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-[9px] text-red-400">
            <AlertCircle size={11} /> {error?.slice(0, 40)}
          </motion.span>
        ) : (
          <motion.button
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleChallenge}
            disabled={remainingToday === 0}
            title={remainingToday === 0 ? 'You\'ve used all 3 challenges for today' : `Challenge to a structured debate (${remainingToday} left today)`}
            className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider transition-colors ${
              remainingToday === 0
                ? 'text-white/15 cursor-not-allowed'
                : 'text-white/25 hover:text-orange-400 hover:cursor-pointer'
            }`}
          >
            <Swords size={11} />
            Debate
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DebateChallengeButton;
