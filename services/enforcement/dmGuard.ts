/**
 * Fair Process DM guard (client). Called from backendService.sendMessage before the write.
 * Messaging is NEVER removed; under the strictest tiers it is limited (text-only, N/hour, existing
 * conversations only, no minors). For GOOD standing this returns immediately with no reads.
 *
 * CLIENT-SIDE ONLY: chat writes go straight to Firestore, so a modified client could bypass this.
 * Hard enforcement needs a chat_rooms/{id}/messages rules check (see docs/FAIR_PROCESS_POLICY.md gaps).
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getStandingSnapshot } from './standingStore';
import { checkDM, LEVEL_RANK, listActions, isInForce } from './standingCore';

export class StandingDMError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message); this.code = code; this.name = 'StandingDMError';
    // Every chat surface calls sendMessage; StandingBanner listens and explains, so no caller edits are needed.
    try { window.dispatchEvent(new CustomEvent('pj:standing-notice', { detail: { code, message } })); } catch { /* SSR/tests */ }
  }
}

const SENT_KEY = 'pj_dm_sent_v1';
function sentTimes(): number[] {
  try { return (JSON.parse(localStorage.getItem(SENT_KEY) || '[]') as number[]).filter(t => typeof t === 'number' && Date.now() - t < 3_600_000); } catch { return []; }
}
function recordSent() {
  try { const t = sentTimes(); t.push(Date.now()); localStorage.setItem(SENT_KEY, JSON.stringify(t.slice(-200))); } catch { /* ignore */ }
}

const minorCache = new Map<string, boolean>();
async function isMinorAccount(uid: string): Promise<boolean> {
  if (minorCache.has(uid)) return minorCache.get(uid)!;
  let minor = false;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const p: any = snap.exists() ? snap.data() : {};
    minor = p.isChild === true || p.accountType === 'CHILD' || p.accountType === 'STUDENT' || p.childState === 'SCHOOL_PROVISIONED';
  } catch {
    minor = true; // can't verify → treat as a minor (child safety outranks access)
  }
  minorCache.set(uid, minor);
  return minor;
}

interface Msg { type?: string; text?: string; voiceUrl?: string; imageUrl?: string; gifUrl?: string; mediaId?: string; videoNoteUrl?: string; telaDocument?: string; senderId?: string }

/** Throws StandingDMError when the message isn't allowed; records the send for the hourly cap. */
export async function assertCanSendMessage(roomId: string, message: Msg): Promise<void> {
  const { caps, uid, sanctions } = getStandingSnapshot();
  // A public live chat is public commenting, not a private conversation.
  if (uid && roomId.startsWith('live_chat_') && !caps.canComment) {
    throw new StandingDMError('PUBLIC_CHAT_PAUSED', 'Commenting in public live chats is paused on your account right now. Private messages still work, and you can fix or appeal from the banner at the top.');
  }
  if (!uid || LEVEL_RANK[caps.level] < LEVEL_RANK.RESTRICTED_MEDIA) return; // nothing DM-related below RESTRICTED_MEDIA
  const d = caps.canDM;
  const hasMedia = !!(message.voiceUrl || message.imageUrl || message.gifUrl || message.mediaId || message.videoNoteUrl || message.telaDocument)
    || (message.type != null && message.type !== 'TEXT');
  let isExistingThread = true;
  let recipientIsMinor = false;
  if (d.existingThreadsOnly || d.noMinors) {
    try {
      const room = await getDoc(doc(db, 'chat_rooms', roomId));
      const data: any = room.exists() ? room.data() : null;
      // When did the restriction begin? Earliest in-force action / criminal-review start.
      const now = Date.now();
      const starts = listActions(sanctions).filter(a => isInForce(a, now)).map(a => a.createdAt).filter(t => t > 0);
      if (typeof sanctions?.criminalReview?.since === 'number') starts.push(sanctions.criminalReview.since);
      const since = starts.length ? Math.min(...starts) : now;
      const created = typeof data?.createdAt === 'number' ? data.createdAt : (data?.createdAt?.toMillis?.() ?? null);
      // "Existing" = a conversation that already existed (with messages) before the restriction began.
      // Unknown createdAt + an existing lastMessage counts as existing (we don't strand real conversations).
      isExistingThread = !!data && !!data.lastMessage && (created == null || created < since);
      if (d.noMinors && data) {
        const others: string[] = (data.participants || []).filter((p: string) => p !== uid);
        for (const o of others) { if (await isMinorAccount(o)) { recipientIsMinor = true; break; } }
      }
    } catch { isExistingThread = false; }
  }
  const r = checkDM(caps, { hasMedia, isExistingThread, recipientIsMinor, sentInLastHour: sentTimes().length });
  if ('code' in r) throw new StandingDMError(r.code, r.message);
  recordSent();
}
