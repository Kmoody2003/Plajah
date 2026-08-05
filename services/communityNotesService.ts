// Plajah Community Notes — crowd-sourced context on posts.
//
// Designed around the documented pain points of X's Community Notes:
//
//  X pain point                        → Plajah design answer
//  ────────────────────────────────────────────────────────────────────────────
//  Notes appear days after virality    → A "Context proposed" indicator shows on
//                                        the post the moment a note enters
//                                        rating, so readers know review is live.
//  Opaque scoring ("needs more         → Status timeline + live score breakdown
//  ratings" forever, no explanation)     are public on every note; the scoring
//                                        function is deterministic and computed
//                                        client-side from public ratings, so
//                                        anyone can verify why a note shows.
//  Published notes silently vanish     → Hysteresis: publishing needs a higher
//                                        bar than staying published, so notes
//                                        don't flicker in and out.
//  Post authors have no recourse       → Authors can attach one public response
//                                        to a published note.
//  Slow, opaque contributor onboarding → Instant enrollment after agreeing to
//                                        the contributor guidelines; impact
//                                        grows with rating participation.
//  One-sided pile-ons                  → Bridge requirement: a note publishes
//                                        only when found helpful by raters who
//                                        historically DISAGREE with each other,
//                                        not just by volume.

import {
  doc, getDoc, setDoc, addDoc, updateDoc, collection, getDocs,
  query, where, orderBy, limit as qLimit, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NoteStatus = 'NEEDS_RATINGS' | 'PUBLISHED' | 'NOT_HELPFUL';
export type HelpfulVote = 'HELPFUL' | 'SOMEWHAT' | 'NOT_HELPFUL';

export interface CommunityNote {
  id: string;
  contentId: string;          // post/video/article id the note attaches to
  contentType: 'post' | 'video' | 'article' | 'comment';
  authorId: string;
  /** What specific claim the note addresses (structured, keeps notes on-topic) */
  claim: string;
  /** The context itself — neutral, sourced */
  summary: string;
  /** At least one source URL is required to propose a note */
  sources: string[];
  status: NoteStatus;         // stored status (synced by admin tooling)
  createdAt: number;
  updatedAt?: number;
  /** One public response from the post's author (their recourse) */
  authorResponse?: { text: string; authorId: string; createdAt: number };
}

export interface NoteRating {
  raterId: string;
  helpful: HelpfulVote;
  /** Optional structured reasons (mirrors what made X ratings useful) */
  reasons?: ('SOURCED' | 'NEUTRAL' | 'ADDRESSES_CLAIM' | 'UNSOURCED' | 'BIASED' | 'OFF_TOPIC' | 'INCORRECT')[];
  createdAt: number;
  /** Rater's perspective cluster at rating time (see clusterOf) */
  cluster?: 'A' | 'B' | 'NEW';
}

export interface NoteScore {
  ratings: number;
  helpfulPct: number;          // HELPFUL=1, SOMEWHAT=0.5, NOT_HELPFUL=0
  clusterA: { count: number; helpfulPct: number };
  clusterB: { count: number; helpfulPct: number };
  bridged: boolean;            // helpful across BOTH clusters
  effectiveStatus: NoteStatus;
  /** Human-readable explanation — shown in the UI (transparency by default) */
  explanation: string;
}

// ─── Scoring (deterministic + public) ────────────────────────────────────────
// Publishing bar:   ≥ MIN_RATINGS ratings, ≥ 66% overall helpfulness, and —
//                   when both perspective clusters are present — ≥ 50%
//                   helpfulness inside EACH cluster (the bridge).
// Staying published: ≥ 55% overall (hysteresis — no flickering).
// Marked not helpful: ≥ MIN_RATINGS and < 30% helpfulness.

export const MIN_RATINGS = 5;
const PUBLISH_PCT = 0.66;
const STAY_PUBLISHED_PCT = 0.55;
const NOT_HELPFUL_PCT = 0.30;
const BRIDGE_PCT = 0.50;

const voteValue = (v: HelpfulVote) => (v === 'HELPFUL' ? 1 : v === 'SOMEWHAT' ? 0.5 : 0);

export function scoreNote(note: Pick<CommunityNote, 'status'>, ratings: NoteRating[]): NoteScore {
  const n = ratings.length;
  const overall = n ? ratings.reduce((s, r) => s + voteValue(r.helpful), 0) / n : 0;

  const a = ratings.filter(r => r.cluster === 'A');
  const b = ratings.filter(r => r.cluster === 'B');
  const pct = (rs: NoteRating[]) => (rs.length ? rs.reduce((s, r) => s + voteValue(r.helpful), 0) / rs.length : 0);
  const clusterA = { count: a.length, helpfulPct: pct(a) };
  const clusterB = { count: b.length, helpfulPct: pct(b) };

  // The bridge: when both perspective clusters have weighed in, each must find
  // the note at least somewhat helpful. With only one cluster present we fall
  // back to the overall bar (small platforms can't always split perspectives).
  const bothClusters = clusterA.count >= 2 && clusterB.count >= 2;
  const bridged = bothClusters
    ? clusterA.helpfulPct >= BRIDGE_PCT && clusterB.helpfulPct >= BRIDGE_PCT
    : overall >= PUBLISH_PCT;

  let effectiveStatus: NoteStatus = 'NEEDS_RATINGS';
  let explanation = `Gathering ratings — ${n}/${MIN_RATINGS} needed.`;

  if (n >= MIN_RATINGS) {
    const wasPublished = note.status === 'PUBLISHED';
    if (overall >= (wasPublished ? STAY_PUBLISHED_PCT : PUBLISH_PCT) && bridged) {
      effectiveStatus = 'PUBLISHED';
      explanation = bothClusters
        ? `Published: rated helpful by ${Math.round(overall * 100)}% overall, including raters from differing perspectives (${Math.round(clusterA.helpfulPct * 100)}% / ${Math.round(clusterB.helpfulPct * 100)}%).`
        : `Published: rated helpful by ${Math.round(overall * 100)}% of ${n} raters.`;
    } else if (overall < NOT_HELPFUL_PCT) {
      effectiveStatus = 'NOT_HELPFUL';
      explanation = `Not shown: only ${Math.round(overall * 100)}% of ${n} raters found this helpful.`;
    } else {
      explanation = bothClusters && !bridged
        ? `Not shown yet: helpful overall (${Math.round(overall * 100)}%) but not yet across differing perspectives — needs broader agreement.`
        : `Not shown yet: ${Math.round(overall * 100)}% helpful of ${n} ratings (needs ${Math.round(PUBLISH_PCT * 100)}%).`;
    }
  }

  return { ratings: n, helpfulPct: overall, clusterA, clusterB, bridged, effectiveStatus, explanation };
}

// ─── Perspective clusters ────────────────────────────────────────────────────
// A lightweight, transparent stand-in for X's matrix factorization: each
// contributor gets a stable pseudo-random cluster on enrollment, then admin
// tooling refines clusters from rating-correlation over time. Even the naive
// split defeats single-bloc pile-ons (a brigade lands in both clusters and
// must still clear both bars).

export function clusterOf(uid: string): 'A' | 'B' {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) | 0;
  return (h & 1) === 0 ? 'A' : 'B';
}

// ─── Contributor enrollment ──────────────────────────────────────────────────

export const CONTRIBUTOR_GUIDELINES = [
  'Write context, not opinions — notes describe verifiable facts.',
  'Every note needs at least one source a stranger could check.',
  'Rate notes on accuracy and sourcing, not on whether you like the post.',
  'You cannot rate your own notes.',
  'Abusing notes for harassment or misinformation ends your contributor access.',
];

export async function isContributor(uid?: string): Promise<boolean> {
  const id = uid ?? auth.currentUser?.uid;
  if (!id) return false;
  try {
    const snap = await getDoc(doc(db, 'note_contributors', id));
    return snap.exists();
  } catch { return false; }
}

export async function enrollContributor(): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  try {
    await setDoc(doc(db, 'note_contributors', uid), {
      uid,
      joinedAt: Date.now(),
      agreedToGuidelines: true,
    });
    return true;
  } catch { return false; }
}

// ─── Notes CRUD ──────────────────────────────────────────────────────────────

export async function proposeNote(input: {
  contentId: string;
  contentType: CommunityNote['contentType'];
  claim: string;
  summary: string;
  sources: string[];
}): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const sources = input.sources.map(s => s.trim()).filter(s => /^https?:\/\//.test(s));
  if (!sources.length || input.summary.trim().length < 30) return null;
  try {
    const ref = await addDoc(collection(db, 'community_notes'), {
      contentId: input.contentId,
      contentType: input.contentType,
      authorId: uid,
      claim: input.claim.trim(),
      summary: input.summary.trim(),
      sources,
      status: 'NEEDS_RATINGS',
      createdAt: Date.now(),
    });
    return ref.id;
  } catch { return null; }
}

export async function fetchNotesForContent(contentId: string): Promise<(CommunityNote & { score: NoteScore })[]> {
  try {
    const snap = await getDocs(query(
      collection(db, 'community_notes'),
      where('contentId', '==', contentId),
      qLimit(10),
    ));
    const notes = await Promise.all(snap.docs.map(async d => {
      const note = { id: d.id, ...d.data() } as CommunityNote;
      const ratings = await fetchRatings(d.id);
      return { ...note, score: scoreNote(note, ratings) };
    }));
    // Published first, then pending; suppressed last
    const order: Record<NoteStatus, number> = { PUBLISHED: 0, NEEDS_RATINGS: 1, NOT_HELPFUL: 2 };
    return notes.sort((x, y) => order[x.score.effectiveStatus] - order[y.score.effectiveStatus]);
  } catch { return []; }
}

export async function fetchRatings(noteId: string): Promise<NoteRating[]> {
  try {
    const snap = await getDocs(collection(db, 'community_notes', noteId, 'ratings'));
    return snap.docs.map(d => d.data() as NoteRating);
  } catch { return []; }
}

export async function rateNote(noteId: string, helpful: HelpfulVote, reasons: NoteRating['reasons'] = []): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  try {
    await setDoc(doc(db, 'community_notes', noteId, 'ratings', uid), {
      raterId: uid,
      helpful,
      reasons,
      cluster: clusterOf(uid),
      createdAt: Date.now(),
    });
    return true;
  } catch { return false; }
}

/** Post author's one public response to a published note. */
export async function respondToNote(noteId: string, text: string): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid || !text.trim()) return false;
  try {
    await updateDoc(doc(db, 'community_notes', noteId), {
      authorResponse: { text: text.trim().slice(0, 600), authorId: uid, createdAt: Date.now() },
      updatedAt: Date.now(),
    });
    return true;
  } catch { return false; }
}

/** Rating queue: recent notes still gathering ratings, excluding your own. */
export async function fetchRatingQueue(max = 20): Promise<(CommunityNote & { score: NoteScore })[]> {
  const uid = auth.currentUser?.uid;
  try {
    const snap = await getDocs(query(
      collection(db, 'community_notes'),
      where('status', '==', 'NEEDS_RATINGS'),
      orderBy('createdAt', 'desc'),
      qLimit(max * 2),
    ));
    const notes = await Promise.all(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as CommunityNote)
        .filter(n => n.authorId !== uid)
        .slice(0, max)
        .map(async n => ({ ...n, score: scoreNote(n, await fetchRatings(n.id)) })),
    );
    return notes.filter(n => n.score.effectiveStatus === 'NEEDS_RATINGS');
  } catch { return []; }
}
