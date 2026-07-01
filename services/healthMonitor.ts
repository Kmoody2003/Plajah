// healthMonitor.ts — per-user experience health + predictive self-healing.
//
// Collects client-observable health signals (load times, jank, failed loads, errors,
// connection, memory), computes a 0-100 health score, watches for known failure
// patterns, and:
//   • self-heals MINOR issues automatically (stale service worker / failed code-split
//     chunk → controlled one-time reload; offline→online recovery),
//   • escalates MAJOR issues to the admin error/site-health store.
// A throttled per-user snapshot is written to userHealth/{uid} for the admin dashboards.
//
// Everything is best-effort and guarded — monitoring must never break the app.

import { db, auth } from './backendService';
import { doc, setDoc } from 'firebase/firestore';
import { reportError } from './errorReporting';

export interface HealthSnapshot {
  score: number;                 // 0-100 (100 = perfect)
  loadMs: number | null;         // page load (navigationStart → loadEventEnd)
  ttfbMs: number | null;         // time to first byte
  domInteractiveMs: number | null;
  lcpMs: number | null;          // largest contentful paint
  longTasks: number;             // count of >50ms main-thread blocks
  longTaskMs: number;            // total blocking time
  failedRequests: number;        // network calls that returned >=400 or threw
  errorCount: number;            // JS errors seen this session
  effectiveType: string;         // '4g' | '3g' | 'slow-2g' | ...
  memoryUsedMB: number | null;   // JS heap (Chromium only)
  threats: string[];             // lightweight, client-observable threat signals
  healedCount: number;           // minor issues auto-recovered
  updatedAt: number;
}

const state = {
  loadMs: null as number | null,
  ttfbMs: null as number | null,
  domInteractiveMs: null as number | null,
  lcpMs: null as number | null,
  longTasks: 0,
  longTaskMs: 0,
  failedRequests: 0,
  errorCount: 0,
  healedCount: 0,
  threats: new Set<string>(),
  lastEscalated: 0,
};

let installed = false;
let lastWrite = 0;

function num(n: number | undefined | null): number | null {
  return typeof n === 'number' && isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function effectiveType(): string {
  try { return (navigator as any)?.connection?.effectiveType || 'unknown'; } catch { return 'unknown'; }
}

function memoryMB(): number | null {
  try {
    const m = (performance as any)?.memory?.usedJSHeapSize;
    return typeof m === 'number' ? Math.round(m / 1048576) : null;
  } catch { return null; }
}

/** Compute a 0-100 health score from the current signals. Higher = healthier. */
function computeScore(): number {
  let score = 100;
  if (state.loadMs != null) {
    if (state.loadMs > 8000) score -= 30;
    else if (state.loadMs > 5000) score -= 20;
    else if (state.loadMs > 3000) score -= 10;
  }
  if (state.lcpMs != null) {
    if (state.lcpMs > 4000) score -= 15;       // "poor" LCP
    else if (state.lcpMs > 2500) score -= 7;   // "needs improvement"
  }
  score -= Math.min(20, state.longTaskMs / 250);   // jank
  score -= Math.min(20, state.failedRequests * 4); // broken requests
  score -= Math.min(25, state.errorCount * 5);     // JS errors
  if (state.threats.size) score -= Math.min(20, state.threats.size * 8);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getHealthSnapshot(): HealthSnapshot {
  return {
    score: computeScore(),
    loadMs: state.loadMs,
    ttfbMs: state.ttfbMs,
    domInteractiveMs: state.domInteractiveMs,
    lcpMs: state.lcpMs,
    longTasks: state.longTasks,
    longTaskMs: Math.round(state.longTaskMs),
    failedRequests: state.failedRequests,
    errorCount: state.errorCount,
    effectiveType: effectiveType(),
    memoryUsedMB: memoryMB(),
    threats: [...state.threats],
    healedCount: state.healedCount,
    updatedAt: Date.now(),
  };
}

/** Persist a per-user health snapshot (throttled). Admin-readable via userHealth/{uid}. */
async function writeSnapshot(force = false): Promise<void> {
  try {
    const u = auth.currentUser;
    if (!u) return;
    const now = Date.now();
    if (!force && now - lastWrite < 60_000) return; // at most once/min
    lastWrite = now;
    const snap = getHealthSnapshot();
    await setDoc(doc(db, 'userHealth', u.uid), {
      ...snap,
      uid: u.uid,
      email: u.email || null,
      displayName: u.displayName || null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
      url: typeof location !== 'undefined' ? location.href.slice(0, 300) : '',
    }, { merge: true });
  } catch { /* health writes are best-effort */ }
}

/** Classify current health and escalate MAJOR problems to the admin error store. */
function evaluateAndEscalate(): void {
  const snap = getHealthSnapshot();
  const now = Date.now();
  const major = snap.score < 40 || snap.errorCount >= 3 || snap.failedRequests >= 5 || snap.threats.length > 0;
  if (major && now - state.lastEscalated > 120_000) {
    state.lastEscalated = now;
    reportError(new Error(`Degraded experience — health ${snap.score}/100 (errors ${snap.errorCount}, failed reqs ${snap.failedRequests}${snap.threats.length ? `, threats: ${snap.threats.join(', ')}` : ''})`), {
      source: 'health',
      severity: 'error',
      context: `load ${snap.loadMs}ms · lcp ${snap.lcpMs}ms · ${snap.effectiveType}`,
    });
    writeSnapshot(true);
  }
}

// ── Self-healing ─────────────────────────────────────────────────────────────

const HEAL_FLAG = 'plajah_selfheal_reload_v1';

/** A stale service worker / failed chunk load → update SW and reload once. */
async function healStaleBuild(reason: string): Promise<void> {
  try {
    // Guard against reload loops — only one auto-reload per session.
    if (sessionStorage.getItem(HEAL_FLAG)) return;
    sessionStorage.setItem(HEAL_FLAG, '1');
    state.healedCount++;
    reportError(new Error(`Self-heal: ${reason} → refreshing to latest build`), { source: 'self-heal', severity: 'warning' });
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.update().catch(() => {})));
    }
    setTimeout(() => { try { location.reload(); } catch { /* */ } }, 400);
  } catch { /* */ }
}

function isChunkLoadError(msg: string): boolean {
  return /Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(msg);
}

/** Install signal collection + self-healing. Call once on boot. */
export function installHealthMonitor(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Navigation timing (after load so metrics are final).
  const captureNav = () => {
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (nav) {
        state.loadMs = num(nav.loadEventEnd - nav.startTime);
        state.ttfbMs = num(nav.responseStart - nav.startTime);
        state.domInteractiveMs = num(nav.domInteractive - nav.startTime);
      }
      writeSnapshot();
      evaluateAndEscalate();
    } catch { /* */ }
  };
  if (document.readyState === 'complete') setTimeout(captureNav, 0);
  else window.addEventListener('load', () => setTimeout(captureNav, 500), { once: true });

  // LCP.
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as any;
      if (last) state.lcpMs = num(last.renderTime || last.loadTime || last.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* */ }

  // Long tasks (jank / blocking time).
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) { state.longTasks++; state.longTaskMs += e.duration; }
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* */ }

  // JS errors → count + self-heal chunk failures + escalate.
  window.addEventListener('error', (e: ErrorEvent) => {
    state.errorCount++;
    const msg = String(e?.message || e?.error?.message || '');
    if (isChunkLoadError(msg)) healStaleBuild('failed to load app code');
    evaluateAndEscalate();
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    state.errorCount++;
    const msg = String((e?.reason as any)?.message || e?.reason || '');
    if (isChunkLoadError(msg)) healStaleBuild('failed to load app code');
    evaluateAndEscalate();
  });

  // Failed network calls — patch fetch (in addition to sessionTrace) to count them.
  try {
    const origFetch = window.fetch?.bind(window);
    if (origFetch) {
      window.fetch = async (...args: Parameters<typeof fetch>) => {
        try {
          const res = await origFetch(...args);
          if (!res.ok && res.status >= 500) state.failedRequests++;
          return res;
        } catch (err) { state.failedRequests++; throw err; }
      };
    }
  } catch { /* */ }

  // Lightweight threat signals (client-observable, honest).
  try {
    if (location.protocol === 'http:' && location.hostname !== 'localhost') state.threats.add('insecure-transport');
  } catch { /* */ }

  // Connectivity: recover on reconnect; flag flapping.
  let offlineFlaps = 0;
  window.addEventListener('offline', () => { offlineFlaps++; if (offlineFlaps >= 3) state.threats.add('unstable-connection'); });
  window.addEventListener('online', () => { writeSnapshot(); });

  // Persist a final snapshot when the tab is hidden/closed.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') writeSnapshot(true); });

  // Periodic heartbeat.
  setInterval(() => { writeSnapshot(); evaluateAndEscalate(); }, 90_000);

  // A clean session start clears the one-shot heal flag once we've booted successfully.
  try { setTimeout(() => sessionStorage.removeItem(HEAL_FLAG), 8000); } catch { /* */ }
}
