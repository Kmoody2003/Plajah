// sessionTrace.ts — a rolling record of the last 5 minutes of a user's session.
//
// Purpose: when a user files a bug, we auto-attach a breadcrumb trail of what they
// were doing (views, clicks, network failures, errors) so an admin can reproduce it.
// Privacy: we record element tags/labels and navigation — NEVER typed input values,
// message contents, or passwords. Bounded in memory; nothing persists until a report
// is filed.

export interface TraceEvent {
  /** epoch ms */
  t: number;
  /** 'view' | 'click' | 'net' | 'error' | 'console' | 'net-status' | 'action' */
  type: string;
  label: string;
}

const WINDOW_MS = 5 * 60 * 1000; // last 5 minutes
const MAX_EVENTS = 500;
let buf: TraceEvent[] = [];
let installed = false;

function prune(now: number) {
  const cutoff = now - WINDOW_MS;
  if (buf.length > MAX_EVENTS || (buf[0] && buf[0].t < cutoff)) {
    buf = buf.filter(e => e.t >= cutoff);
    if (buf.length > MAX_EVENTS) buf = buf.slice(-MAX_EVENTS);
  }
}

/** Record a breadcrumb. Safe to call from anywhere; never throws. */
export function trace(type: string, label: string): void {
  try {
    const now = Date.now();
    buf.push({ t: now, type, label: String(label ?? '').slice(0, 180) });
    prune(now);
  } catch { /* never break the app for a breadcrumb */ }
}

/** Convenience for view/navigation breadcrumbs. */
export const traceView = (view: string) => trace('view', view);

/** The last-5-minutes trail (oldest → newest). */
export function getTrace(): TraceEvent[] {
  prune(Date.now());
  return [...buf];
}

/** A compact human-readable transcript for the bug report / admin view. */
export function formatTrace(events: TraceEvent[] = getTrace()): string {
  const t0 = events[0]?.t ?? Date.now();
  return events.map(e => {
    const rel = ((e.t - t0) / 1000).toFixed(1).padStart(6, ' ');
    return `+${rel}s  ${e.type.toUpperCase().padEnd(7)} ${e.label}`;
  }).join('\n');
}

function describeEl(el: Element | null): string {
  if (!el) return '';
  const tag = el.tagName.toLowerCase();
  const aria = el.getAttribute('aria-label');
  const title = el.getAttribute('title');
  const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const label = aria || title || txt || '';
  return label ? `<${tag}> ${label}` : `<${tag}>`;
}

/** Install lightweight global breadcrumb listeners. Call once on boot. */
export function installSessionTrace(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Clicks — record the nearest button/link/role element (tag + label, never input values).
  window.addEventListener('click', (e) => {
    try {
      const path = (e.composedPath?.() || []) as Element[];
      const el = path.find(n => n instanceof Element && /^(button|a)$/i.test((n as Element).tagName || '')) as Element
        || (e.target as Element)?.closest?.('button,a,[role="button"]')
        || (e.target as Element);
      trace('click', describeEl(el));
    } catch { /* */ }
  }, { capture: true, passive: true });

  // Connectivity flips.
  window.addEventListener('online', () => trace('net-status', 'online'));
  window.addEventListener('offline', () => trace('net-status', 'offline'));

  // Failed network calls (status >= 400 or thrown) — record URL + status only.
  try {
    const origFetch = window.fetch?.bind(window);
    if (origFetch) {
      window.fetch = async (...args: Parameters<typeof fetch>) => {
        const url = (() => { try { return String((args[0] as any)?.url || args[0]); } catch { return ''; } })();
        try {
          const res = await origFetch(...args);
          if (!res.ok) trace('net', `${res.status} ${url.slice(0, 120)}`);
          return res;
        } catch (err) {
          trace('net', `FAILED ${url.slice(0, 120)}`);
          throw err;
        }
      };
    }
  } catch { /* leave fetch untouched if patching fails */ }

  // console.error breadcrumbs (message only).
  try {
    const origErr = console.error.bind(console);
    console.error = (...a: any[]) => {
      try { trace('console', a.map(x => (typeof x === 'string' ? x : x?.message || '')).join(' ').slice(0, 160)); } catch { /* */ }
      origErr(...a);
    };
  } catch { /* */ }

  trace('action', 'session start');
}
