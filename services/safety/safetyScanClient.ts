/**
 * safetyScanClient — browser side of the server content-safety pipeline (routes/trustSafety.ts).
 *
 * All calls are fire-and-forget for UX: a post publishes immediately; the server patches the doc with
 * moderationStatus/safetyLabels when the scan finishes and PostCard/feeds react via their listeners.
 * Failures are swallowed on purpose — the cron sweep (/api/cron/safety-sweep) is the backstop.
 */
import { auth } from '../firebase';

export interface ScanResponse {
  ok: boolean;
  moderationStatus?: string;
  action?: string;
  labels?: string[];
  display?: string;
  scanComplete?: boolean;
  userFacingRule?: string | null;
}

async function post(path: string, body: unknown): Promise<any | null> {
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return null;
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

/** Does this post carry media the server can scan (photo/video/gif)? Text-only posts skip the call. */
export function hasScannableMedia(media: unknown): boolean {
  return Array.isArray(media) && media.some((m: any) => m && ['PHOTO', 'VIDEO', 'GIF', 'STICKER'].includes(m.type) && (m.url || m.muxPlaybackId));
}

/** Scan every media item on a doc the caller owns (posts, private_posts, videos, albums, users). */
export function requestTargetScan(targetCollection: string, targetId: string): Promise<ScanResponse | null> {
  return post('/api/safety/scan', { targetCollection, targetId });
}

/** Called right after createPost — non-blocking. */
export function scanCreatedPost(collection: string, postId: string, media: unknown): void {
  if (!postId || !hasScannableMedia(media)) return;
  void requestTargetScan(collection, postId);
}

/** A sexual_minor_safety report → server escalation (scan + csam review queue). */
export function escalateChildSafetyReport(reportId: string): void {
  void post('/api/safety/report-escalate', { reportId });
}

/** Admin soft-remove (keeps the doc + media as evidence; hides everywhere). */
export async function adminSoftRemove(input: { contentType: string; contentId: string; parentId?: string; reason?: string }): Promise<boolean> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) if (typeof v === 'string' && v) clean[k] = v;
  const r = await post('/api/safety/admin/remove', clean);
  return !!r?.ok;
}
