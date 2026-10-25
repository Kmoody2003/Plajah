// Lab-only stand-in for services/kairosService: an in-memory live service so the
// reader's follow mode can be driven by hand (window.__cue('45.8.28','Romans 8:28')).
import { parseRefId, type ScriptureRef } from './services/scriptureRef';

export interface KairosCue { refId: string; label: string; lines: string[]; translation: string; variant: 'LOWER_THIRD' | 'FULLSCREEN'; wallClock: number; programTC: number; seq: number; }
export interface ScriptureSession { id: string; orgId: string; hostId: string; title: string; translation: string; isActive: boolean; current: KairosCue | null; cues: KairosCue[]; startedAt: number; }
export type FollowMode = 'IN_ROOM' | 'STREAM';
export const CLEAR_REF = '';
export const isClear = (c: KairosCue | null | undefined) => !!c && c.refId === CLEAR_REF;

let session: ScriptureSession = { id: 'lab', orgId: 'lab', hostId: 'lab', title: 'Sunday Service (lab)', translation: 'KJV', isActive: true, current: null, cues: [], startedAt: Date.now() };
const subs = new Set<(s: ScriptureSession | null) => void>();
(window as any).__cue = (refId: string, label: string) => {
  const cue: KairosCue = { refId, label, lines: [], translation: 'KJV', variant: 'LOWER_THIRD', wallClock: Date.now(), programTC: session.cues.length * 60, seq: session.cues.length + 1 };
  session = { ...session, current: refId === CLEAR_REF ? null : cue, cues: [...session.cues, cue] };
  subs.forEach(f => f(session));
};
export function listenToSession(_id: string, cb: (s: ScriptureSession | null) => void) { subs.add(cb); cb(session); return () => { subs.delete(cb); }; }
export function resolveCue(s: ScriptureSession | null, mode: FollowMode, t?: number): KairosCue | null {
  if (!s) return null;
  if (mode === 'IN_ROOM') return s.current ?? null;
  let best: KairosCue | null = null;
  for (const c of s.cues) if (c.programTC <= (t ?? 0) && (!best || c.programTC >= best.programTC)) best = c;
  return isClear(best) ? null : best;
}
export const cueRef = (c: KairosCue | null): ScriptureRef | null => (c ? parseRefId(c.refId) : null);
export const markersFor = (_s: ScriptureSession | null) => [];
