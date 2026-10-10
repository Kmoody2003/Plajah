/**
 * Production wiring for the Shuffle server: Firestore REST (Admin), account standing, Plajah blocks,
 * and trust & safety reports. Kept out of shuffleServer.ts so the engine stays testable.
 */
import { getAccessToken, fsGet, fsSet } from '../firebaseAdminRest';
import { createRestShuffleStore, type ShuffleDeps } from './shuffleServer';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0665118474';
const DB_ID = process.env.FIREBASE_DB_ID || 'plajah-prod';
const DOC_ROOT = `projects/${PROJECT_ID}/databases/${DB_ID}/documents`;

/** Shuffle reason → the staff queue's ReportReason (services/contentSafetyService). */
const REASON_MAP: Record<string, string> = {
  nudity_sexual: 'pornography',
  minor: 'sexual_minor_safety',
  harassment_hate: 'harassment',
  violence_threat: 'violence_self_harm',
  spam_scam: 'spam',
  other: 'other',
};

export function createDefaultShuffleDeps(): ShuffleDeps {
  const headers = async () => {
    const t = await getAccessToken();
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  };
  return {
    store: createRestShuffleStore({ base: `https://firestore.googleapis.com/v1/${DOC_ROOT}`, docRoot: DOC_ROOT, headers }),
    getProfile: uid => fsGet(`users/${uid}`),
    standing: async uid => {
      try {
        const { getStanding } = await import('../../routes/enforcement');
        const c: any = await getStanding(uid);
        // Talking on camera to strangers sits with going live in the Fair Process ladder.
        return c.canGoLive === false
          ? { ok: false, message: "Shuffle is paused on your account while a review is open. Messages and the rest of Plajah still work — you can fix the content or appeal from the Appeal Center." }
          : { ok: true };
      } catch { return { ok: true }; } // fail open on our own outage
    },
    socialBlocked: async (a, b) => {
      const [x, y] = await Promise.all([fsGet(`blocks/${a}_${b}`), fsGet(`blocks/${b}_${a}`)]);
      return !!(x || y);
    },
    fileReport: async r => {
      const reason = REASON_MAP[r.reason] || 'other';
      const id = `${r.reporterId}_shuffle_${r.matchId}`.slice(0, 200);
      // Same shape the staff queue reads for client reports; the target is the reported PROFILE
      // (a live call leaves no stored media), and the match id rides along as the locator.
      await fsSet(`content_reports/${id}`, {
        contentId: r.reportedId, contentType: 'profile', authorId: r.reportedId, reason,
        details: r.details, parentId: `shuffle:${r.matchId}`, snapshot: 'Reported during a Shuffle video call.',
        reporterId: r.reporterId, status: 'OPEN', source: 'shuffle', createdAt: Date.now(),
        ...(reason === 'sexual_minor_safety' ? { priority: 'URGENT' } : {}),
      });
      if (reason === 'sexual_minor_safety') {
        const { escalateReport } = await import('../safety/safetyPipeline');
        await escalateReport(id).catch(e => console.warn('[shuffle] escalate failed', e?.message));
      }
    },
  };
}
