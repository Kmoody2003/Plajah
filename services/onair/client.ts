// Browser side of /api/onair (routes/onair.ts). The server decides who is on air and writes each
// host line once for everyone; the local roster is only a fallback when the API cannot be reached.

import type { LinkKind, SongFacts } from './segments';
import { planLink } from './segments';
import { getPersona } from './roster';
import { onAirNow, nextOnAir } from './station';
import type { PersonaSheet } from './types';

export interface OnAirNow { host: PersonaSheet | null; next: { host: PersonaSheet; inHours: number } | null }
export interface HostLine { text: string; estSec: number; source: string; /** The line in the host's voice, rendered once on the server. */ audioUrl?: string | null }

export async function fetchOnAirNow(): Promise<OnAirNow> {
  try {
    const res = await fetch('/api/onair/now');
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    const host = d.host ? getPersona(d.host.id) ?? null : null;
    const nh = d.next?.host ? getPersona(d.next.host.id) : undefined;
    return { host, next: nh ? { host: nh, inHours: Number(d.next.inHours) || 0 } : null };
  } catch {
    return { host: onAirNow(), next: nextOnAir() };
  }
}

const lineCache = new Map<string, Promise<HostLine | null>>();

/**
 * The host's line for this moment, from the server (same for every listener). Falls back to the
 * local grounded template if the API is unreachable, so the page never goes quiet.
 */
export function fetchHostLink(
  host: PersonaSheet,
  body: { kind: LinkKind; prev?: SongFacts | null; next?: SongFacts | null; channelName?: string; maxSec?: number },
): Promise<HostLine | null> {
  const key = JSON.stringify([host.id, body.kind, body.prev?.id, body.next?.id, body.channelName, body.maxSec]);
  let p = lineCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch('/api/onair/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(String(res.status));
        const d = await res.json();
        return d.line ? (d.line as HostLine) : null;
      } catch {
        const l = planLink({ ...body, host });
        return { text: l.text, estSec: l.estSec, source: 'local' };
      }
    })();
    lineCache.set(key, p);
    if (lineCache.size > 200) lineCache.delete(lineCache.keys().next().value as string);
  }
  return p;
}

/**
 * Plays a host clip over the music: `duck` lowers the music while the host talks, `restore` brings it
 * back. Resolves when the clip ends (or fails — the caption is still on screen either way).
 */
export function playHostClip(url: string, o: { muted?: boolean; duck?: () => void; restore?: () => void } = {}): { stop: () => void; done: Promise<void> } {
  const a = new Audio(url);
  a.preload = 'auto';
  a.muted = !!o.muted;
  let restored = false;
  const restore = () => { if (!restored) { restored = true; o.restore?.(); } };
  const done = new Promise<void>((resolve) => {
    const end = () => { restore(); resolve(); };
    a.addEventListener('ended', end, { once: true });
    a.addEventListener('error', end, { once: true });
    o.duck?.();
    a.play().catch(end);
  });
  return { stop: () => { try { a.pause(); a.src = ''; } catch { /* */ } restore(); }, done };
}
