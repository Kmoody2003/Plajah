// errorReporting.ts — platform-wide error capture. Global window/promise handlers + an explicit
// reportError() funnel uncaught and caught errors into Firestore (errorReports), tagged with the
// user, view, and agent. Admins read them across the platform or per user. Deduped to avoid floods;
// never throws (a failing reporter must not break the app).

import { db, auth } from './backendService';
import { collection, addDoc } from 'firebase/firestore';
import { trace, getTrace, formatTrace } from './sessionTrace';

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

    trace('error', message); // breadcrumb: errors show in the session trace too

    // Attach the last-5-min breadcrumb trail so EVERY report (esp. health "Degraded
    // experience" escalations) names the actual failed-request URLs + user actions that
    // led here — instead of just a count. This is what turns "failed reqs 43" from a
    // mystery into a diagnosis. Capped + bounded, same as user bug reports.
    const events = getTrace();
    const netFails = events.filter(ev => ev.type === 'net').slice(-25);

    const u = auth.currentUser;
    await addDoc(collection(db, 'errorReports'), {
      message,
      stack: String(e?.stack ?? '').slice(0, 4000),
      source,
      context: opts.context || '',
      severity: opts.severity || 'error',
      url: typeof location !== 'undefined' ? location.href.slice(0, 500) : '',
      trace: events.slice(-200),                          // structured breadcrumbs
      traceText: formatTrace(events).slice(0, 8000),      // readable transcript
      netFailures: netFails.map(ev => ev.label),          // the actual failed-request URLs+statuses
      userId: u?.uid || null,
      userEmail: u?.email || null,
      userName: u?.displayName || null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
      createdAt: now,
    });
  } catch { /* swallow — the reporter must never break the app */ }
}

/**
 * Log a LOGIN failure. Login happens while logged-out, so this writes to `loginIssues`
 * (creatable without auth) rather than `errorReports` (auth-only). Skips benign
 * user-cancelled flows. Never throws. Admins read/alert on this collection.
 */
export async function reportLoginIssue(info: { provider: string; error: unknown; email?: string }): Promise<void> {
  try {
    const e = info.error as any;
    const code = String(e?.code || '').slice(0, 80);
    const message = String(e?.message ?? e ?? 'Login failed').slice(0, 500);
    // Don't alert on the user simply closing/cancelling the popup.
    if (/popup-closed-by-user|cancelled-popup-request|auth\/cancelled|user-cancel/i.test(code + ' ' + message)) return;
    trace('error', `login-failure ${info.provider} ${code}`);
    await addDoc(collection(db, 'loginIssues'), {
      provider: String(info.provider).slice(0, 40),
      code,
      message,
      email: String(info.email || '').slice(0, 120),
      url: typeof location !== 'undefined' ? location.href.slice(0, 300) : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
      createdAt: Date.now(),
    });
  } catch { /* never throw — must not break the login flow */ }
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

export interface BugReportInput {
  /** The user's description of what went wrong. */
  message: string;
  /** What the user was doing / current view. */
  currentView?: string;
  severity?: ErrorSeverity;
}

/**
 * A user-filed bug report. Unlike reportError this never dedups (each is
 * intentional) and auto-attaches the last-5-minutes session trace. Lands in the
 * same admin error store (errorReports), tagged source 'user-report'.
 */
export async function reportBug(input: BugReportInput): Promise<boolean> {
  try {
    const events = getTrace();
    const u = auth.currentUser;
    const scr = typeof window !== 'undefined' ? window.screen : null;
    await addDoc(collection(db, 'errorReports'), {
      message: `[User Report] ${String(input.message || '').slice(0, 1000)}`,
      userMessage: String(input.message || '').slice(0, 1000),
      source: 'user-report',
      severity: input.severity || 'warning',
      currentView: input.currentView || '',
      trace: events.slice(-200),                 // structured breadcrumbs
      traceText: formatTrace(events).slice(0, 8000), // readable transcript
      url: typeof location !== 'undefined' ? location.href.slice(0, 500) : '',
      viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
      screen: scr ? `${scr.width}x${scr.height}` : '',
      userId: u?.uid || null,
      userEmail: u?.email || null,
      userName: u?.displayName || null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
      createdAt: Date.now(),
    });
    return true;
  } catch {
    return false;
  }
}
