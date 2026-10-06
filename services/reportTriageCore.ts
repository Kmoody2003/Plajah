/** Pure triage helpers for the admin ReportsQueue (no Firebase). */

export interface QueueReport {
  id: string;
  contentId: string;
  contentType: string;
  reason: string;
  reporterId?: string;
  authorId?: string;
  details?: string;
  snapshot?: string;
  parentId?: string;
  createdAtMs: number;
}

/** Higher = look at it sooner. Unknown reasons rank as 'other'. */
export const REASON_SEVERITY: Record<string, number> = {
  sexual_minor_safety: 100,
  violence_self_harm: 90,
  hate: 70,
  harassment: 60,
  scam_impersonation: 50,
  misinformation: 30,
  spam: 20,
  other: 10,
};
export const severityOf = (reason: string) => REASON_SEVERITY[reason] ?? REASON_SEVERITY.other;

export interface ReportGroup {
  key: string;            // `${contentType}:${contentId}`
  contentType: string;
  contentId: string;
  authorId?: string;
  parentId?: string;
  snapshot?: string;
  reports: QueueReport[];
  reasons: Record<string, number>;
  topReason: string;
  score: number;
  oldestMs: number;
}

/** Group duplicate reports of one target and rank: severity first, then distinct reporters, then age. */
export function triageReports(reports: readonly QueueReport[], now: number): ReportGroup[] {
  const map = new Map<string, ReportGroup>();
  for (const r of reports) {
    const key = `${r.contentType}:${r.contentId}`;
    let g = map.get(key);
    if (!g) {
      g = { key, contentType: r.contentType, contentId: r.contentId, authorId: r.authorId, parentId: r.parentId, snapshot: r.snapshot,
            reports: [], reasons: {}, topReason: r.reason, score: 0, oldestMs: r.createdAtMs };
      map.set(key, g);
    }
    g.reports.push(r);
    g.reasons[r.reason] = (g.reasons[r.reason] ?? 0) + 1;
    g.oldestMs = Math.min(g.oldestMs, r.createdAtMs || g.oldestMs);
    g.authorId = g.authorId ?? r.authorId;
    g.snapshot = g.snapshot ?? r.snapshot;
    g.parentId = g.parentId ?? r.parentId;
  }
  const out = [...map.values()];
  for (const g of out) {
    g.topReason = Object.entries(g.reasons).sort((a, b) => severityOf(b[0]) - severityOf(a[0]) || b[1] - a[1])[0][0];
    const reporters = new Set(g.reports.map(r => r.reporterId).filter(Boolean)).size || g.reports.length;
    const ageH = Math.max(0, (now - g.oldestMs) / 3_600_000);
    g.score = severityOf(g.topReason) * 10 + Math.min(reporters, 20) * 5 + Math.min(ageH, 72) * 0.5;
  }
  return out.sort((a, b) => b.score - a.score || a.oldestMs - b.oldestMs);
}

export type ReportAction = 'dismiss' | 'remove_content' | 'warn_author' | 'suspend_author' | 'block_reporter_spam';
export const RESOLUTION_FOR: Record<ReportAction, string> = {
  dismiss: 'dismissed',
  remove_content: 'content_removed',
  warn_author: 'author_warned',
  suspend_author: 'author_suspended',
  block_reporter_spam: 'reporter_blocked',
};
export const SUSPEND_DAYS = 7;

/** Firestore paths to delete for "remove content" (a post may live in either collection). */
export function removalPaths(g: Pick<ReportGroup, 'contentType' | 'contentId' | 'parentId'>): string[] {
  if (g.contentType === 'post') return [`posts/${g.contentId}`, `private_posts/${g.contentId}`];
  if (g.contentType === 'comment' && g.parentId) {
    return [`posts/${g.parentId}/comments/${g.contentId}`, `private_posts/${g.parentId}/comments/${g.contentId}`];
  }
  return [];
}

/** Which actions make sense for a group (author-directed ones need an author, etc.). */
export function availableActions(g: Pick<ReportGroup, 'contentType' | 'contentId' | 'parentId' | 'authorId'>): ReportAction[] {
  const a: ReportAction[] = ['dismiss'];
  if (removalPaths(g).length) a.push('remove_content');
  if (g.authorId) a.push('warn_author', 'suspend_author');
  a.push('block_reporter_spam');
  return a;
}

export const ageLabel = (ms: number, now: number) => {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
