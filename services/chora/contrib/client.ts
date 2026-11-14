// Client side of the contribution ledger: watches LOCAL edits to a Chora project, classifies them
// (fingerprint.ts) and sends them to /api/chora/contrib in batches. Offline-safe: unsent events
// wait in localStorage and go out with the next flush.
//
// The tracker never sees a collaborator's work as yours: `beforeRemote` flushes what you did,
// and `afterRemote` rebaselines on the merged doc, so their changes never enter your diff.

import { auth } from '../../firebase';
import type { GrooveDoc } from '../../melos/beats/grooveDoc';
import { diffFingerprints, fingerprint, type Fingerprint } from './fingerprint';
import type { ContribEntry, ContribEvent, ContribOrigin } from './types';

const IDLE_MS = 4000;
const SEND_MS = 15000;
const QUEUE_KEY = (pid: string) => `chora.contrib.queue.${pid}`;

/** What this device can honestly say about itself. No fingerprinting beyond what the user sees. */
export function deviceOrigin(): ContribOrigin {
  if (typeof navigator === 'undefined') return {};
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}` : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const desktop = typeof window !== 'undefined' && !!(window as any).chrome?.webview;
  const phone = /Android|iPhone|iPad/.test(ua);
  return { app: desktop ? 'desktop' : phone ? 'phone' : 'web', device: `${os} · ${desktop ? 'Plajah desktop' : br}` };
}

function loadQueue(pid: string): ContribEvent[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY(pid)) || '[]'); } catch { return []; }
}
function saveQueue(pid: string, q: ContribEvent[]) {
  try { q.length ? localStorage.setItem(QUEUE_KEY(pid), JSON.stringify(q.slice(-500))) : localStorage.removeItem(QUEUE_KEY(pid)); } catch { /* storage blocked: events live in memory only */ }
}

async function authed(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) return null;
  return fetch(path, { ...init, keepalive: init.method === 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } }).catch(() => null);
}

export class ContribTracker {
  private base: Fingerprint | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private sendTimer: ReturnType<typeof setInterval> | null = null;
  private queue: ContribEvent[];
  private sending = false;
  private readonly origin = deviceOrigin();

  constructor(readonly projectId: string, private readonly getDoc: () => GrooveDoc | null) {
    this.queue = loadQueue(projectId);
    const d = getDoc();
    if (d) this.base = fingerprint(d);
    this.sendTimer = setInterval(() => void this.send(), SEND_MS);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onHide);
  }

  private onHide = () => { this.capture(); void this.send(); };

  /** Call after every local mutation. Cheap: the diff runs once the user pauses. */
  touched() {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.capture(), IDLE_MS);
  }

  /** Diff now against the baseline and queue what changed. */
  capture() {
    if (this.idle) { clearTimeout(this.idle); this.idle = null; }
    const d = this.getDoc();
    if (!d) return;
    const next = fingerprint(d);
    if (this.base) {
      const evs = diffFingerprints(this.base, next, { clientAt: Date.now(), origin: this.origin });
      if (evs.length) { this.queue.push(...evs); saveQueue(this.projectId, this.queue); }
    }
    this.base = next;
  }

  /** A collaborator's merge is about to land: bank your own work first. */
  beforeRemote() { this.capture(); }
  /** …and after it lands, their changes become the new baseline. */
  afterRemote() { const d = this.getDoc(); if (d) this.base = fingerprint(d); }

  async send(): Promise<void> {
    if (this.sending || !this.queue.length) return;
    this.sending = true;
    try {
      while (this.queue.length) {
        const batch = this.queue.slice(0, 50);
        const res = await authed(`/api/chora/contrib/${encodeURIComponent(this.projectId)}/events`, { method: 'POST', body: JSON.stringify({ events: batch }) });
        if (!res) break;
        // 403: not a collaborator (e.g. a viewer) — their edits are never ledgered, drop them.
        if (!res.ok && res.status !== 403) break;
        this.queue.splice(0, batch.length);
        saveQueue(this.projectId, this.queue);
      }
    } finally { this.sending = false; }
  }

  dispose() {
    this.capture();
    void this.send();
    if (this.sendTimer) clearInterval(this.sendTimer);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onHide);
  }
}

export async function fetchLedger(projectId: string): Promise<{ entries: ContribEntry[]; check: { ok: boolean; length: number; head: string; problem?: string } } | null> {
  const res = await authed(`/api/chora/contrib/${encodeURIComponent(projectId)}`);
  if (!res?.ok) return null;
  return res.json();
}

export async function myLedgeredProjects(): Promise<Array<{ projectId: string; lastAt: number; entries: number }>> {
  const res = await authed('/api/chora/contrib/mine');
  if (!res?.ok) return [];
  return (await res.json()).projects ?? [];
}

/** sha-256 of a file or buffer, hex — the content address a seal fixes. */
export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const dig = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sealVersion(projectId: string, sha256: string[], label: string): Promise<ContribEntry | null> {
  const res = await authed(`/api/chora/contrib/${encodeURIComponent(projectId)}/seal`, { method: 'POST', body: JSON.stringify({ sha256, label }) });
  if (!res?.ok) return null;
  return (await res.json()).entry ?? null;
}
