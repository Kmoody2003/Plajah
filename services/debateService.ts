/**
 * Debate Service — Structured Discourse on Plajah
 *
 * Rules enforced server-side:
 *  - Max 3 debate challenges issued per user per calendar day
 *  - A comment can only have one active debate at a time
 *  - Debates run for exactly 24 hours from acceptance
 *  - Profanity / insults in participant posts trigger auto-disqualification
 *  - Aria judges at the end: factual accuracy, academic debate rubric, civility
 */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  query, where, orderBy, limit, onSnapshot, increment, arrayUnion,
  runTransaction, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db, auth } from './backendService';
import { Debate, DebatePost, DebateStatus, DebateSide, DebateVerdict } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAILY_CHALLENGE_LIMIT = 3;
const DEBATE_DURATION_MS    = 24 * 60 * 60 * 1000;   // 24 hours
const ACCEPT_WINDOW_MS      = 6 * 60 * 60 * 1000;    // 6 hours to accept
const POINTS_CHALLENGE_ISSUED  = 10;
const POINTS_DEBATE_ACCEPTED   = 20;
const POINTS_DEBATE_POSTED     = 5;   // per post in debate
const POINTS_DEBATE_WIN        = 100;
const POINTS_DEBATE_DRAW       = 40;

// ── Content moderation ────────────────────────────────────────────────────────

// Minimal list — only covers clearest violations; Aria does full review at judgment
const DISQUALIFYING_PATTERNS = [
  /\b(idiot|moron|stupid|dumb|fool|loser|pathetic|ignorant|retard|imbecile)\b/i,
  /\b(shut up|go to hell|go f[^\s]*k yourself|kiss my|f[^\s]*k you)\b/i,
  /\b(racist|sexist|bigot|nazi|fascist)\b.*\byou\b/i,
  // Profanity catch-all (participant posts only)
  /\b(f[u\*]+ck|sh[i\*]+t|b[i\*]+tch|a[s\*]+hole|c[u\*]+nt|d[i\*]+ck)\b/i,
];

export function checkPostContent(text: string): { ok: boolean; reason?: string } {
  for (const re of DISQUALIFYING_PATTERNS) {
    if (re.test(text)) {
      return { ok: false, reason: 'Post contains language that violates civil discourse rules and has been flagged for disqualification.' };
    }
  }
  return { ok: true };
}

// ── Daily challenge limit ─────────────────────────────────────────────────────

export async function getChallengesIssuedToday(uid: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const snap = await getDocs(
    query(
      collection(db, 'debates'),
      where('challengerId', '==', uid),
      where('createdAt', '>=', todayStart.getTime())
    )
  );
  return snap.size;
}

// ── Debate creation ───────────────────────────────────────────────────────────

export interface ChallengePayload {
  sourceCommentId: string;
  sourceCommentText: string;
  sourcePostId: string;
  defenderId: string;
  defenderName: string;
  defenderPhoto: string;
  topic: string;
  heroImageUrl?: string;
}

export async function issueDebateChallenge(payload: ChallengePayload): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in to challenge');
  if (uid === payload.defenderId) throw new Error('You cannot challenge yourself');

  // Check daily limit
  const today = await getChallengesIssuedToday(uid);
  if (today >= DAILY_CHALLENGE_LIMIT) {
    throw new Error(`You've reached your daily limit of ${DAILY_CHALLENGE_LIMIT} debate challenges. Come back tomorrow.`);
  }

  // Check comment doesn't already have an active debate
  const existing = await getDocs(
    query(collection(db, 'debates'), where('sourceCommentId', '==', payload.sourceCommentId), where('status', 'in', ['PENDING', 'ACTIVE']))
  );
  if (!existing.empty) {
    throw new Error('This comment is already in an active debate. Only one debate per comment at a time.');
  }

  const now = Date.now();
  const ref = doc(collection(db, 'debates'));
  const debate: Debate = {
    id: ref.id,
    sourceCommentId: payload.sourceCommentId,
    sourceCommentText: payload.sourceCommentText,
    sourcePostId: payload.sourcePostId,
    challengerId: uid,
    challengerName: auth.currentUser!.displayName || 'Challenger',
    challengerPhoto: auth.currentUser!.photoURL || '',
    defenderId: payload.defenderId,
    defenderName: payload.defenderName,
    defenderPhoto: payload.defenderPhoto,
    topic: payload.topic,
    createdAt: now,
    endsAt: now + ACCEPT_WINDOW_MS,   // will be reset to +24h on acceptance
    challengerSupporters: [],
    defenderSupporters: [],
    postCount: 0,
    viewCount: 0,
    disqualified: [],
    heroImageUrl: payload.heroImageUrl,
    status: 'PENDING',
  };
  await setDoc(ref, debate);

  // Award points for issuing challenge
  await updateDoc(doc(db, 'users', uid), { totalPoints: increment(POINTS_CHALLENGE_ISSUED) });

  // Notify defender
  await addDoc(collection(db, 'notifications'), {
    userId: payload.defenderId,
    senderId: uid,
    senderName: auth.currentUser!.displayName || 'A user',
    senderPhoto: auth.currentUser!.photoURL || '',
    type: 'DEBATE_CHALLENGE',
    title: 'Debate Challenge Received',
    message: `${auth.currentUser!.displayName} challenged your comment to a structured debate: "${payload.topic.slice(0, 80)}…"`,
    link: 'DEBATE_DETAIL',
    targetId: ref.id,
    isRead: false,
    timestamp: now,
  });

  return ref.id;
}

// ── Accept / Decline ──────────────────────────────────────────────────────────

export async function acceptDebate(debateId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  const now = Date.now();
  await updateDoc(doc(db, 'debates', debateId), {
    status: 'ACTIVE',
    acceptedAt: now,
    endsAt: now + DEBATE_DURATION_MS,
  });
  if (uid) await updateDoc(doc(db, 'users', uid), { totalPoints: increment(POINTS_DEBATE_ACCEPTED) });

  // System opening post from defender side
  const debate = (await getDoc(doc(db, 'debates', debateId))).data() as Debate;
  await addDoc(collection(db, 'debates', debateId, 'posts'), {
    debateId,
    authorId: 'PLAJAH_SYSTEM',
    authorName: 'Plajah',
    authorPhoto: '',
    side: 'DEFENDER',
    text: `🟢 ${debate.defenderName} has accepted the debate. The 24-hour clock has started. Topic: "${debate.topic}"`,
    timestamp: now,
    isDisqualified: false,
    flaggedForReview: false,
    reactions: {},
  });
}

export async function declineDebate(debateId: string): Promise<void> {
  const debate = (await getDoc(doc(db, 'debates', debateId))).data() as Debate;
  await updateDoc(doc(db, 'debates', debateId), { status: 'DECLINED' });

  // Polite system message
  await addDoc(collection(db, 'debates', debateId, 'posts'), {
    debateId,
    authorId: 'PLAJAH_SYSTEM',
    authorName: 'Plajah',
    authorPhoto: '',
    side: 'DEFENDER',
    text: `${debate.defenderName} has respectfully chosen not to participate in this debate at this time. Their decision is acknowledged and respected. The debate is now closed.`,
    timestamp: Date.now(),
    isDisqualified: false,
    flaggedForReview: false,
    reactions: {},
  });
}

// ── Posting in a debate ───────────────────────────────────────────────────────

export async function postToDebate(
  debateId: string,
  text: string,
  side: DebateSide,
  media?: { url: string; type: 'PHOTO' | 'VIDEO' | 'AUDIO' }
): Promise<{ disqualified: boolean; reason?: string }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be signed in');

  const debate = (await getDoc(doc(db, 'debates', debateId))).data() as Debate;
  if (!debate) throw new Error('Debate not found');
  if (debate.status !== 'ACTIVE') throw new Error('Debate is not active');
  if (Date.now() > debate.endsAt) throw new Error('Debate time has expired');

  // Participant posts must be civil — supporters are exempt from profanity rule
  const isParticipant = uid === debate.challengerId || uid === debate.defenderId;
  const contentCheck = isParticipant ? checkPostContent(text) : { ok: true };

  const now = Date.now();
  const post: Omit<DebatePost, 'id'> = {
    debateId,
    authorId: uid,
    authorName: auth.currentUser!.displayName || 'Anonymous',
    authorPhoto: auth.currentUser!.photoURL || '',
    side,
    text,
    mediaUrl: media?.url,
    mediaType: media?.type,
    timestamp: now,
    isDisqualified: !contentCheck.ok,
    disqualifyReason: contentCheck.reason,
    flaggedForReview: !contentCheck.ok,
    reactions: {},
  };

  await addDoc(collection(db, 'debates', debateId, 'posts'), post);
  await updateDoc(doc(db, 'debates', debateId), { postCount: increment(1) });

  // Award points for participating
  await updateDoc(doc(db, 'users', uid), { totalPoints: increment(POINTS_DEBATE_POSTED) });

  if (!contentCheck.ok && isParticipant) {
    // Log disqualification on debate doc
    await updateDoc(doc(db, 'debates', debateId), {
      disqualified: arrayUnion({ uid, name: auth.currentUser!.displayName || 'User', reason: contentCheck.reason!, at: now }),
    });
    return { disqualified: true, reason: contentCheck.reason };
  }

  return { disqualified: false };
}

// ── Side voting ───────────────────────────────────────────────────────────────

export async function voteDebateSide(
  debateId: string,
  side: 'CHALLENGER' | 'DEFENDER'
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const debate = (await getDoc(doc(db, 'debates', debateId))).data() as Debate;
  if (!debate) return;
  if (uid === debate.challengerId || uid === debate.defenderId) return; // participants can't vote

  // Remove from opposite side first
  const opposite = side === 'CHALLENGER' ? 'DEFENDER' : 'CHALLENGER';
  const oppositeField = `${opposite.toLowerCase()}Supporters`;
  const sideField = `${side.toLowerCase()}Supporters`;
  const isOnThisSide = debate[sideField as keyof Debate] instanceof Array &&
    (debate[sideField as keyof Debate] as string[]).includes(uid);

  if (isOnThisSide) {
    // Toggle off
    await updateDoc(doc(db, 'debates', debateId), {
      [sideField]: (debate[sideField as keyof Debate] as string[]).filter((id: string) => id !== uid),
    });
  } else {
    await updateDoc(doc(db, 'debates', debateId), {
      [sideField]: arrayUnion(uid),
      [oppositeField]: (debate[oppositeField as keyof Debate] as string[]).filter((id: string) => id !== uid),
    });
  }
}

// ── Real-time subscriptions ───────────────────────────────────────────────────

export function listenDebate(debateId: string, cb: (debate: Debate) => void): () => void {
  return onSnapshot(doc(db, 'debates', debateId), snap => {
    if (snap.exists()) cb({ id: snap.id, ...snap.data() } as Debate);
  });
}

export function listenDebatePosts(debateId: string, cb: (posts: DebatePost[]) => void): () => void {
  return onSnapshot(
    query(collection(db, 'debates', debateId, 'posts'), orderBy('timestamp', 'asc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as DebatePost)))
  );
}

export function listenUserDebates(uid: string, cb: (debates: Debate[]) => void): () => void {
  return onSnapshot(
    query(
      collection(db, 'debates'),
      where('challengerId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    ),
    snap1 => {
      const challenger = snap1.docs.map(d => ({ id: d.id, ...d.data() } as Debate));
      // Also listen to defender debates — merge in a second call
      getDocs(query(collection(db, 'debates'), where('defenderId', '==', uid), orderBy('createdAt', 'desc'), limit(20)))
        .then(snap2 => {
          const defender = snap2.docs.map(d => ({ id: d.id, ...d.data() } as Debate));
          const all = [...challenger, ...defender]
            .filter((d, i, arr) => arr.findIndex(x => x.id === d.id) === i)
            .sort((a, b) => b.createdAt - a.createdAt);
          cb(all);
        });
    }
  );
}

export async function getPublicDebates(limit_: number = 20): Promise<Debate[]> {
  const snap = await getDocs(
    query(collection(db, 'debates'), orderBy('createdAt', 'desc'), limit(limit_))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Debate));
}

// ── Aria judgment (called after endsAt has passed) ────────────────────────────

export async function triggerAriaJudgment(debateId: string): Promise<void> {
  const debateSnap = await getDoc(doc(db, 'debates', debateId));
  if (!debateSnap.exists()) return;
  const debate = debateSnap.data() as Debate;
  if (debate.status === 'JUDGED') return;
  if (Date.now() < debate.endsAt) return;

  await updateDoc(doc(db, 'debates', debateId), { status: 'ENDED' });

  // Gather all posts
  const postsSnap = await getDocs(
    query(collection(db, 'debates', debateId, 'posts'), orderBy('timestamp', 'asc'))
  );
  const posts: DebatePost[] = postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as DebatePost));

  // Check for disqualifications
  const challengerDQ = debate.disqualified.some(d => d.uid === debate.challengerId);
  const defenderDQ   = debate.disqualified.some(d => d.uid === debate.defenderId);

  let winner: DebateVerdict['winner'];
  let winnerUid: string | undefined;
  let winnerName: string | undefined;

  // Auto-result if one side is disqualified
  if (challengerDQ && !defenderDQ) {
    winner = 'DEFENDER'; winnerUid = debate.defenderId; winnerName = debate.defenderName;
  } else if (defenderDQ && !challengerDQ) {
    winner = 'CHALLENGER'; winnerUid = debate.challengerId; winnerName = debate.challengerName;
  } else if (challengerDQ && defenderDQ) {
    winner = 'DRAW';
  } else {
    // Public vote as tiebreaker / primary signal (Aria will refine via AI call)
    const cVotes = debate.challengerSupporters.length;
    const dVotes = debate.defenderSupporters.length;
    winner = cVotes > dVotes ? 'CHALLENGER' : cVotes < dVotes ? 'DEFENDER' : 'DRAW';
    winnerUid   = winner === 'CHALLENGER' ? debate.challengerId : winner === 'DEFENDER' ? debate.defenderId : undefined;
    winnerName  = winner === 'CHALLENGER' ? debate.challengerName : winner === 'DEFENDER' ? debate.defenderName : undefined;
  }

  // Build Aria prompt
  const postsSummary = posts
    .filter(p => !p.isDisqualified && p.authorId !== 'PLAJAH_SYSTEM')
    .map(p => `[${p.side} — ${p.authorName}]: ${p.text}`)
    .join('\n\n');

  const total = debate.challengerSupporters.length + debate.defenderSupporters.length;
  const cPct  = total > 0 ? Math.round((debate.challengerSupporters.length / total) * 100) : 50;
  const dPct  = total > 0 ? Math.round((debate.defenderSupporters.length  / total) * 100) : 50;

  // Build verdict object (AI call is async; store preliminary first)
  const preliminaryVerdict: DebateVerdict = {
    winner,
    winnerUid,
    winnerName,
    challengerScore: winner === 'CHALLENGER' ? 65 : winner === 'DRAW' ? 50 : 35,
    defenderScore:   winner === 'DEFENDER'   ? 65 : winner === 'DRAW' ? 50 : 35,
    consensusScore: winner === 'CHALLENGER' ? cPct : dPct,
    publicVoteChallenger: cPct,
    publicVoteDefender:   dPct,
    summary: 'Aria is analyzing the debate…',
    factCheck: 'Analysis in progress.',
    ignoredFacts: 'Analysis in progress.',
    debateQuality: posts.length >= 6 ? 'GOOD' : posts.length >= 3 ? 'FAIR' : 'POOR',
    academicScore: { logic: 7, evidence: 6, civility: challengerDQ || defenderDQ ? 3 : 8, clarity: 7 },
    disqualificationNotes: challengerDQ || defenderDQ
      ? `${challengerDQ ? debate.challengerName : ''}${challengerDQ && defenderDQ ? ' and ' : ''}${defenderDQ ? debate.defenderName : ''} was disqualified for uncivil language.`
      : undefined,
    generatedAt: Date.now(),
  };

  await updateDoc(doc(db, 'debates', debateId), {
    status: 'JUDGED',
    verdict: preliminaryVerdict,
  });

  // Fire the AI analysis in the background via the agentService
  try {
    const { sendAriaDebateJudgment } = await import('./debateAria');
    await sendAriaDebateJudgment(debateId, debate, posts, preliminaryVerdict);
  } catch {
    // AI judgment is best-effort — verdict is already stored
  }

  // Award winner points
  if (winnerUid) {
    await updateDoc(doc(db, 'users', winnerUid), { totalPoints: increment(POINTS_DEBATE_WIN) });
  }
}

// ── Demo debate seeder ────────────────────────────────────────────────────────

export async function seedDemoDebate(): Promise<string | null> {
  // Only seed once — check if demo already exists
  const existing = await getDocs(query(collection(db, 'debates'), where('topic', '==', 'DEMO: Music streaming pays artists fairly'), limit(1)));
  if (!existing.empty) return existing.docs[0].id;

  const now = Date.now();
  const ref = doc(collection(db, 'debates'));
  const demoDebate: Debate = {
    id: ref.id,
    sourceCommentId: 'demo_comment_001',
    sourceCommentText: 'Streaming pays artists fairly for their work.',
    sourcePostId: 'demo_post_001',
    challengerId: 'demo_challenger',
    challengerName: 'Maya Rivers',
    challengerPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MayaRivers',
    defenderId: 'demo_defender',
    defenderName: 'Theo Blake',
    defenderPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=TheoBlake',
    topic: 'DEMO: Music streaming pays artists fairly',
    createdAt: now - 26 * 3_600_000,
    acceptedAt: now - 25 * 3_600_000,
    endsAt: now - 1 * 3_600_000,
    challengerSupporters: ['user_a', 'user_b', 'user_c', 'user_d'],
    defenderSupporters: ['user_e', 'user_f'],
    postCount: 6,
    viewCount: 847,
    disqualified: [],
    heroImageUrl: '',
    status: 'JUDGED',
    highlightQuote: 'Spotify pays $0.003–$0.005 per stream. An artist needs 250,000 streams to earn minimum wage for a month.',
    highlightSide: 'CHALLENGER',
    verdict: {
      winner: 'CHALLENGER',
      winnerUid: 'demo_challenger',
      winnerName: 'Maya Rivers',
      challengerScore: 78,
      defenderScore: 42,
      consensusScore: 67,
      publicVoteChallenger: 67,
      publicVoteDefender: 33,
      summary: 'Maya Rivers presented a well-structured argument backed by industry data showing streaming royalty rates fall significantly short of sustainable artist income. Theo Blake\'s position that streaming "has grown the pie" was factually accurate but did not address the distribution inequity at the core of the debate.',
      factCheck: 'CHALLENGER ✓: Spotify pays $0.003–$0.005/stream on average. A song needs ~250K streams to earn minimum wage for one month. Major labels take 75–80% of streaming revenue. DEFENDER ✓: Total streaming revenue has grown from $1B (2012) to $17.5B (2023). More people are listening to more music than ever.',
      ignoredFacts: 'Neither party addressed the "per-listener" model proposed by some economists as an alternative to per-stream, which could significantly improve indie artist payouts without reducing total revenue. The impact of playlist curation algorithms on discovery — a key factor in whether an artist can reach the 250K stream threshold — was also not discussed.',
      debateQuality: 'GOOD',
      academicScore: { logic: 8, evidence: 9, civility: 10, clarity: 8 },
      generatedAt: now - 1_800_000,
    },
  };

  await setDoc(ref, demoDebate);

  // Add demo posts
  const demoPosts = [
    { side: 'CHALLENGER', authorId: 'demo_challenger', authorName: 'Maya Rivers', authorPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MayaRivers', text: 'Spotify pays $0.003–$0.005 per stream. An artist needs roughly 250,000 streams just to earn minimum wage for one month. That is not fair by any reasonable definition. The majority of revenue flows to labels and the platform itself.', timestamp: now - 25 * 3_600_000 + 5 * 60_000 },
    { side: 'DEFENDER', authorId: 'demo_defender', authorName: 'Theo Blake', authorPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=TheoBlake', text: 'Before streaming, most independent artists earned nothing from recorded music because physical distribution was gated by major labels. Streaming opened the door to global audiences for any artist. Total streaming revenue hit $17.5 billion in 2023 — the pie has grown dramatically.', timestamp: now - 25 * 3_600_000 + 25 * 60_000 },
    { side: 'CHALLENGER', authorId: 'demo_challenger', authorName: 'Maya Rivers', authorPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MayaRivers', text: 'Growing the pie does not help if artists receive a vanishingly small slice. A bigger number divided by millions of artists and 20–25% label cuts still produces poverty wages. According to the Music Workers Alliance, 99% of artists on Spotify earn less than $1,000/year. This is a structural problem, not an access problem.', timestamp: now - 25 * 3_600_000 + 50 * 60_000 },
    { side: 'DEFENDER', authorId: 'demo_defender', authorName: 'Theo Blake', authorPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=TheoBlake', text: 'That statistic includes hobbyists and bedroom producers with a handful of songs. Professional artists who tour and release consistently do earn livable incomes from the combination of streaming + sync licensing + live performance. Streaming is one revenue stream, not a complete salary.', timestamp: now - 24 * 3_600_000 + 10 * 60_000 },
    { side: 'CHALLENGER', authorId: 'demo_challenger', authorName: 'Maya Rivers', authorPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MayaRivers', text: 'So the platform "fairly pays" artists only if they supplement it with three other jobs? That is the definition of not paying fairly. We would not say a job "pays fairly" if it required workers to moonlight elsewhere just to survive. The model needs structural reform — not justification.', timestamp: now - 24 * 3_600_000 + 35 * 60_000 },
    { side: 'DEFENDER', authorId: 'demo_defender', authorName: 'Theo Blake', authorPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=TheoBlake', text: 'I concede the rate-per-stream model has significant flaws and the label revenue split is inequitable. But attributing that entirely to streaming platforms conflates platform structure with label contracts. The platforms could pay more — and should — but "streaming" as a concept is not the villain here.', timestamp: now - 23 * 3_600_000 + 10 * 60_000 },
  ];

  for (const p of demoPosts) {
    await addDoc(collection(db, 'debates', ref.id, 'posts'), {
      debateId: ref.id,
      ...p,
      isDisqualified: false,
      flaggedForReview: false,
      reactions: {},
    });
  }

  return ref.id;
}
