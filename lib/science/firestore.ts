import { collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit, increment, serverTimestamp, runTransaction, arrayUnion, arrayRemove } from 'firebase/firestore';
import { onSnapshot } from '../../services/safeSnapshot';
import { db, auth } from '../../services/backendService';
import type {
  SciencePost, ScienceMeta, ScienceComment, ScienceCommentType,
  ReplicationData, ReviewData, ReproducibilityRecord, ExpertiseProfile,
  DisciplineScore, ScienceDiscipline,
} from './types';

// ── Collections ───────────────────────────────────────────────────────────────

export const SCIENCE_POSTS_COL     = 'sciencePosts';
export const SCIENCE_COMMENTS_COL  = 'scienceComments';
export const EXPERTISE_COL         = 'expertiseProfiles';
export const REPRO_COL             = 'reproducibilityRecords';
export const LIVE_DATA_COL         = 'liveDataCache';

// ── Science post CRUD ─────────────────────────────────────────────────────────

export async function createSciencePost(
  content: string,
  science: ScienceMeta,
): Promise<SciencePost | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const post: Omit<SciencePost, 'id'> = {
    authorId: user.uid,
    authorName: user.displayName || 'Researcher',
    authorPhoto: user.photoURL || '',
    content,
    science,
    likesCount: 0,
    likedBy: [],
    commentCount: 0,
    shareCount: 0,
    timestamp: Date.now(),
    isPublic: true,
  };

  const ref = await addDoc(collection(db, SCIENCE_POSTS_COL), {
    ...post,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...post };
}

export async function getSciencePost(postId: string): Promise<SciencePost | null> {
  const snap = await getDoc(doc(db, SCIENCE_POSTS_COL, postId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as SciencePost;
}

export function listenToScienceFeed(
  discipline: ScienceDiscipline | null,
  callback: (posts: SciencePost[]) => void,
  limitCount = 30,
) {
  const base = collection(db, SCIENCE_POSTS_COL);
  const q = discipline
    ? query(base, where('science.discipline', 'array-contains', discipline), orderBy('timestamp', 'desc'), limit(limitCount))
    : query(base, orderBy('timestamp', 'desc'), limit(limitCount));

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as SciencePost)));
  });
}

export async function toggleSciencePostLike(postId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;
  const ref = doc(db, SCIENCE_POSTS_COL, postId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const likedBy: string[] = snap.data().likedBy || [];
    const liked = likedBy.includes(uid);
    tx.update(ref, {
      likedBy: liked ? arrayRemove(uid) : arrayUnion(uid),
      likesCount: increment(liked ? -1 : 1),
    });
  });
}

// ── Science comment CRUD ──────────────────────────────────────────────────────

export async function addScienceComment(
  postId: string,
  text: string,
  type: ScienceCommentType,
  extras?: { replication?: ReplicationData; review?: ReviewData; parentId?: string },
): Promise<ScienceComment | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const comment: Omit<ScienceComment, 'id'> = {
    postId,
    authorId: user.uid,
    authorName: user.displayName || 'Researcher',
    authorPhoto: user.photoURL || '',
    text,
    type,
    timestamp: Date.now(),
    likesCount: 0,
    likedBy: [],
    ...(extras?.replication ? { replication: extras.replication } : {}),
    ...(extras?.review ? { review: extras.review } : {}),
    ...(extras?.parentId ? { parentId: extras.parentId } : {}),
  };

  const ref = await addDoc(collection(db, SCIENCE_COMMENTS_COL), comment);
  await updateDoc(doc(db, SCIENCE_POSTS_COL, postId), { commentCount: increment(1) });
  return { id: ref.id, ...comment };
}

export function listenToScienceComments(
  postId: string,
  callback: (comments: ScienceComment[]) => void,
) {
  const q = query(
    collection(db, SCIENCE_COMMENTS_COL),
    where('postId', '==', postId),
    orderBy('timestamp', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ScienceComment)));
  });
}

export async function toggleScienceCommentLike(commentId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;
  const ref = doc(db, SCIENCE_COMMENTS_COL, commentId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const likedBy: string[] = snap.data().likedBy || [];
    const liked = likedBy.includes(uid);
    tx.update(ref, {
      likedBy: liked ? arrayRemove(uid) : arrayUnion(uid),
      likesCount: increment(liked ? -1 : 1),
    });
  });
}

// ── Reproducibility record ────────────────────────────────────────────────────

export async function getReproRecord(postId: string): Promise<ReproducibilityRecord | null> {
  const snap = await getDoc(doc(db, REPRO_COL, postId));
  if (!snap.exists()) return null;
  return snap.data() as ReproducibilityRecord;
}

export async function recordReplication(
  postId: string,
  replicatorId: string,
  replicatorName: string,
  outcome: ReplicationData['outcome'],
  commentId: string,
): Promise<void> {
  const ref = doc(db, REPRO_COL, postId);
  const snap = await getDoc(ref);

  const attempt = {
    id: `${replicatorId}_${Date.now()}`,
    originalPostId: postId,
    replicatorId,
    replicatorName,
    outcome,
    commentId,
    timestamp: Date.now(),
  };

  if (!snap.exists()) {
    const initial: ReproducibilityRecord = {
      postId,
      score: outcome === 'CONFIRMED' ? 1 : outcome === 'PARTIAL' ? 0.5 : 0,
      attempts: 1,
      confirmedCount: outcome === 'CONFIRMED' ? 1 : 0,
      partialCount:   outcome === 'PARTIAL'   ? 1 : 0,
      failedCount:    outcome === 'FAILED'     ? 1 : 0,
      inconclusiveCount: outcome === 'INCONCLUSIVE' ? 1 : 0,
      lastAttemptAt: Date.now(),
      history: [attempt],
    };
    await updateDoc(ref, initial as any).catch(() =>
      addDoc(collection(db, REPRO_COL), { id: postId, ...initial })
    );
  } else {
    const d = snap.data() as ReproducibilityRecord;
    const confirmed   = d.confirmedCount   + (outcome === 'CONFIRMED'    ? 1 : 0);
    const partial     = d.partialCount     + (outcome === 'PARTIAL'      ? 1 : 0);
    const failed      = d.failedCount      + (outcome === 'FAILED'       ? 1 : 0);
    const inconclusive = d.inconclusiveCount + (outcome === 'INCONCLUSIVE' ? 1 : 0);
    const total       = d.attempts + 1;
    const score       = (confirmed + partial * 0.5) / total;

    await updateDoc(ref, {
      score,
      attempts: total,
      confirmedCount: confirmed,
      partialCount: partial,
      failedCount: failed,
      inconclusiveCount: inconclusive,
      lastAttemptAt: Date.now(),
      history: arrayUnion(attempt),
    });
  }

  // Also update the post's reproScore
  await updateDoc(doc(db, SCIENCE_POSTS_COL, postId), {
    'science.reproScore': (await getDoc(ref)).data()?.score ?? 0,
    'science.replicationCount': increment(1),
    ...(outcome === 'CONFIRMED' ? { 'science.successfulReplications': increment(1) } : {}),
  }).catch(() => {});
}

// ── Expertise profile ─────────────────────────────────────────────────────────

export async function getExpertiseProfile(userId: string): Promise<ExpertiseProfile | null> {
  const snap = await getDoc(doc(db, EXPERTISE_COL, userId));
  if (!snap.exists()) return null;
  return snap.data() as ExpertiseProfile;
}

export async function incrementExpertise(
  userId: string,
  displayName: string,
  photoURL: string,
  discipline: ScienceDiscipline,
  signal: 'post' | 'citation' | 'replication' | 'review',
): Promise<void> {
  const ref = doc(db, EXPERTISE_COL, userId);
  const snap = await getDoc(ref);

  const scoreDeltas: Record<typeof signal, number> = {
    post: 5, citation: 10, replication: 15, review: 8,
  };
  const delta = scoreDeltas[signal];

  if (!snap.exists()) {
    const profile: ExpertiseProfile = {
      userId,
      displayName,
      photoURL,
      disciplines: [{ discipline, score: delta, postsCount: signal === 'post' ? 1 : 0, citationsReceived: signal === 'citation' ? 1 : 0, replicationsConfirmed: signal === 'replication' ? 1 : 0, reviewsGiven: signal === 'review' ? 1 : 0, lastActiveAt: Date.now() }],
      totalScore: delta,
      tier: 'NOVICE',
      updatedAt: Date.now(),
    };
    await addDoc(collection(db, EXPERTISE_COL), { id: userId, ...profile }).catch(() => {});
  } else {
    const d = snap.data() as ExpertiseProfile;
    const disciplines = [...(d.disciplines || [])];
    const idx = disciplines.findIndex(x => x.discipline === discipline);
    if (idx >= 0) {
      disciplines[idx] = {
        ...disciplines[idx],
        score: disciplines[idx].score + delta,
        postsCount: disciplines[idx].postsCount + (signal === 'post' ? 1 : 0),
        citationsReceived: disciplines[idx].citationsReceived + (signal === 'citation' ? 1 : 0),
        replicationsConfirmed: disciplines[idx].replicationsConfirmed + (signal === 'replication' ? 1 : 0),
        reviewsGiven: disciplines[idx].reviewsGiven + (signal === 'review' ? 1 : 0),
        lastActiveAt: Date.now(),
      };
    } else {
      disciplines.push({ discipline, score: delta, postsCount: signal === 'post' ? 1 : 0, citationsReceived: signal === 'citation' ? 1 : 0, replicationsConfirmed: signal === 'replication' ? 1 : 0, reviewsGiven: signal === 'review' ? 1 : 0, lastActiveAt: Date.now() });
    }
    const totalScore = disciplines.reduce((sum, x) => sum + x.score, 0);
    const tier = totalScore >= 200 ? 'AUTHORITY' : totalScore >= 80 ? 'EXPERT' : totalScore >= 25 ? 'RESEARCHER' : 'NOVICE';
    await updateDoc(ref, { disciplines, totalScore, tier, updatedAt: Date.now() });
  }
}
