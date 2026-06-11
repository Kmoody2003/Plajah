import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy, Flame, Clock, Plus, ChevronRight, Star, Medal,
  BarChart2, Send, X, Upload, ArrowLeft,
} from 'lucide-react';
import { Challenge, ChallengeEntry } from '../types';
import { collection, query, where, orderBy, limit, addDoc, doc, updateDoc, increment, arrayUnion, arrayRemove, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';
import { db, auth } from '../services/backendService';
import { formatDistanceToNow } from 'date-fns';

// ── Seeder: create platform-level challenges if none exist ────────────────────

async function seedChallengesIfEmpty() {
  const snap = await import('firebase/firestore').then(({ getDocs, collection: col, query: q, limit: lim }) =>
    getDocs(q(col(db, 'challenges'), lim(1)))
  );
  if (!snap.empty) return;

  const base = Date.now();
  const week = 7 * 24 * 3_600_000;
  const platforms = [
    {
      title: '30-Second Intro Challenge',
      description: 'Drop your catchiest 30-second intro. Best hook wins a homepage feature.',
      prompt: 'Record or upload a 30-second clip showing your most compelling intro — music, voice, anything.',
      category: 'MUSIC',
      hashtag: '#PlajahIntroChallenge',
      prize: 'Homepage feature for 7 days',
    },
    {
      title: 'Creator Spotlight Week',
      description: 'Share a behind-the-scenes moment from your creative process. Authenticity wins.',
      prompt: 'Show us something real — your studio setup, a rough draft, or the moment an idea hit you.',
      category: 'ANY',
      hashtag: '#PlajahBehindTheScenes',
      prize: '500 Plajah Points + profile badge',
    },
    {
      title: 'First 60 Seconds Film Challenge',
      description: 'Short film opening — 60 seconds to hook the audience. Best cinematography wins.',
      prompt: 'Upload the first 60 seconds of an original short film or cinematic piece.',
      category: 'VIDEO',
      hashtag: '#Plajah60SecFilm',
      prize: 'Plajah Filmmaker Badge',
    },
  ];

  for (const c of platforms) {
    const ref = doc(collection(db, 'challenges'));
    await setDoc(ref, {
      id: ref.id,
      ...c,
      createdAt: base,
      endsAt: base + week,
      createdBy: 'PLAJAH_SYSTEM',
      entryCount: 0,
      isActive: true,
      coverImage: null,
    });
  }
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function timeLeft(endsAt: number): string {
  const diff = endsAt - Date.now();
  if (diff <= 0) return 'Ended';
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h left`;
  return `${Math.floor((diff % 3_600_000) / 60_000)}m left`;
}

// ── Sub-views ─────────────────────────────────────────────────────────────────

const ChallengeCard: React.FC<{ challenge: Challenge; onOpen: (c: Challenge) => void }> = ({ challenge, onOpen }) => {
  const left = timeLeft(challenge.endsAt);
  const isEnding = challenge.endsAt - Date.now() < 24 * 3_600_000;
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onOpen(challenge)}
      className="w-full text-left bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 hover:bg-white/[0.05] transition-all group"
    >
      {challenge.coverImage && (
        <div className="h-24 overflow-hidden">
          <img src={challenge.coverImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-sm font-black text-white leading-tight">{challenge.title}</h3>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider shrink-0 ${
            isEnding ? 'bg-red-500/20 border border-red-500/30 text-red-400' : 'bg-white/8 border border-white/10 text-white/40'
          }`}>
            <Clock size={8} />
            {left}
          </div>
        </div>
        <p className="text-[11px] text-white/50 leading-snug mb-3 line-clamp-2">{challenge.description}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-400/70">{challenge.hashtag}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-white/30">{challenge.entryCount} entries</span>
            {challenge.prize && (
              <span className="flex items-center gap-1 text-[8px] text-yellow-400/70 font-black">
                <Trophy size={9} className="text-yellow-400" /> Prize
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

interface ChallengeHubProps {
  onBack?: () => void;
}

const ChallengeHub: React.FC<ChallengeHubProps> = ({ onBack }) => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selected, setSelected] = useState<Challenge | null>(null);
  const [entries, setEntries] = useState<ChallengeEntry[]>([]);
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tab, setTab] = useState<'ACTIVE' | 'MY_ENTRIES'>('ACTIVE');

  useEffect(() => {
    seedChallengesIfEmpty();
    const unsub = onSnapshot(
      query(collection(db, 'challenges'), where('isActive', '==', true), orderBy('endsAt', 'asc')),
      snap => setChallenges(snap.docs.map(d => ({ id: d.id, ...d.data() } as Challenge)))
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const unsub = onSnapshot(
      query(collection(db, 'challenge_entries'), where('challengeId', '==', selected.id), orderBy('votes', 'desc'), limit(30)),
      snap => setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChallengeEntry)))
    );
    return () => unsub();
  }, [selected?.id]);

  const handleSubmit = async () => {
    if (!auth.currentUser || !selected || !caption.trim() || submitting) return;
    setSubmitting(true);
    try {
      const ref = await addDoc(collection(db, 'challenge_entries'), {
        challengeId: selected.id,
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Anonymous',
        authorPhoto: auth.currentUser.photoURL || '',
        caption: caption.trim(),
        votes: 0,
        votedBy: [],
        submittedAt: Date.now(),
      });
      await updateDoc(doc(db, 'challenges', selected.id), { entryCount: increment(1) });
      setCaption('');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (entry: ChallengeEntry) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const ref = doc(db, 'challenge_entries', entry.id);
    const hasVoted = entry.votedBy.includes(uid);
    await updateDoc(ref, {
      votes: increment(hasVoted ? -1 : 1),
      votedBy: hasVoted ? arrayRemove(uid) : arrayUnion(uid),
    });
  };

  // Detail view
  if (selected) {
    const myEntry = entries.find(e => e.authorId === auth.currentUser?.uid);
    return (
      <div className="h-full flex flex-col">
        <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-orange-400/70 mb-0.5">{selected.hashtag}</p>
            <h2 className="text-sm font-black text-white truncate">{selected.title}</h2>
          </div>
          {selected.prize && (
            <div className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500/15 border border-yellow-500/25 rounded-full">
              <Trophy size={11} className="text-yellow-400" />
              <span className="text-[9px] font-black text-yellow-400">{selected.prize}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Challenge brief */}
          <div className="px-6 py-4 border-b border-white/5">
            <p className="text-sm text-white/70 leading-relaxed mb-2">{selected.description}</p>
            <div className="flex items-center gap-3 text-[10px] text-white/30 font-black">
              <span className="flex items-center gap-1"><Clock size={10} />{timeLeft(selected.endsAt)}</span>
              <span>{selected.entryCount} entries</span>
            </div>
          </div>

          {/* Submit entry */}
          {!myEntry && auth.currentUser && (
            <div className="px-6 py-4 border-b border-white/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Your Entry</p>
              <p className="text-[11px] text-white/50 mb-3">{selected.prompt}</p>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Describe your entry or paste a link to your content…"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 resize-none focus:outline-none focus:border-orange-500/40 transition-all mb-2"
              />
              <button
                onClick={handleSubmit}
                disabled={!caption.trim() || submitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-orange-500 text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40 hover:bg-orange-400 transition-all"
              >
                <Send size={12} />
                {submitted ? 'Submitted!' : submitting ? 'Submitting…' : 'Submit Entry'}
              </button>
            </div>
          )}

          {/* Leaderboard */}
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={14} className="text-orange-400" />
              <p className="text-[11px] font-black uppercase tracking-widest text-white/50">Leaderboard</p>
            </div>
            {entries.length === 0 ? (
              <div className="text-center py-8 text-white/20">
                <Trophy size={32} className="mx-auto mb-2" />
                <p className="text-[10px] font-black uppercase tracking-widest">Be the first to enter</p>
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry, i) => {
                  const isMe = entry.authorId === auth.currentUser?.uid;
                  const hasVoted = entry.votedBy.includes(auth.currentUser?.uid || '');
                  return (
                    <div key={entry.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${isMe ? 'bg-orange-500/8 border-orange-500/20' : 'bg-white/[0.02] border-white/8'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                        i === 0 ? 'bg-yellow-400 text-black' : i === 1 ? 'bg-gray-300 text-black' : i === 2 ? 'bg-amber-600 text-white' : 'bg-white/10 text-white/40'
                      }`}>
                        {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <img src={entry.authorPhoto} className="w-5 h-5 rounded-full object-cover" alt="" />
                          <span className="text-[10px] font-black text-white/70">{entry.authorName}</span>
                          {isMe && <span className="text-[7px] text-orange-400 font-black uppercase tracking-wider">You</span>}
                        </div>
                        <p className="text-[11px] text-white/50 leading-snug">{entry.caption}</p>
                      </div>
                      <button
                        onClick={() => handleVote(entry)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black transition-all shrink-0 ${
                          hasVoted ? 'bg-orange-500/20 border border-orange-500/30 text-orange-400' : 'bg-white/5 border border-white/10 text-white/40 hover:border-orange-500/30 hover:text-orange-400'
                        }`}
                      >
                        <Star size={10} fill={hasVoted ? 'currentColor' : 'none'} />
                        {entry.votes}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-sm font-black uppercase tracking-widest text-white">Challenges</h2>
          <p className="text-[9px] text-white/30 uppercase tracking-widest">Enter. Win. Get discovered.</p>
        </div>
        <Flame size={18} className="text-orange-400" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {challenges.length === 0 ? (
          <div className="py-20 text-center text-white/20">
            <Trophy size={40} className="mx-auto mb-3" />
            <p className="text-[10px] font-black uppercase tracking-widest">No active challenges</p>
          </div>
        ) : (
          <div className="space-y-3">
            {challenges.map(c => (
              <ChallengeCard key={c.id} challenge={c} onOpen={setSelected} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChallengeHub;
