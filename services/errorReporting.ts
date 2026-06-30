// errorReporting.ts — platform-wide error capture. Global window/promise handlers + an explicit
// reportError() funnel uncaught and caught errors into Firestore (errorReports), tagged with the
// user, view, and agent. Admins read them across the platform or per user. Deduped to avoid floods;
// never throws (a failing reporter must not break the app).

import { db, auth } from './backendService';
import { collection, addDoc } from 'firebase/firestore';

export type ErrorSeverity = 'error' | 'warning';
export interface ReportOpts { source?: string; context?: string; severity?: ErrorSeverity }

const recent = new Map<string, number>();
const DEDUP_MS = 30_000;
let installed = false;

/** Log an error to the platform error store. Safe to call from anywhere; never throws. */
export async function reportError(err: unknown, opts: ReportOpts = {}): Promise<void> {
  try {
    const e = err as any;
    const message = String(e?.message ?? e ?? 'Unknown error').slice(0, 1200);
    if (!message || /ResizeObserver loop|Script error\.?$/i.test(message)) return; // ignore browser noise
    const source = opts.source || 'manual';
    const key = `${source}:${message}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUP_MS) return;
    recent.set(key, now);
    if (recent.size > 200) recent.clear();

    const u = auth.currentUser;
    await addDoc(collection(db, 'errorReports'), {
      message,
      stack: String(e?.stack ?? '').slice(0, 4000),
      source,
      context: opts.context || '',
      severity: opts.severity || 'error',
      url: typeof location !== 'undefined' ? location.href.slice(0, 500) : '',
      userId: u?.uid || null,
      userEmail: u?.email || null,
      userName: u?.displayName || null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
      createdAt: now,
    });
  } catch { /* swallow — the reporter must never break the app */ }
}

/** Install global handlers for uncaught errors + unhandled promise rejections. Call once on boot. */
export function installGlobalErrorReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e: ErrorEvent) => {
    reportError(e.error || e.message, { source: 'window', context: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '' });
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    reportError(e.reason, { source: 'promise' });
  });
}
