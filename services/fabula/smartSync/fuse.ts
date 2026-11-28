// Fuse every sync opinion into one lock per angle, and say how sure we are.
//
// Methods that agree (within ~3 frames) form a cluster; the cluster with the most weight wins. The most
// precise member sets the number (manual > audio fine pass > timecode > transcript > vision); the others
// only vouch for it. One method alone can still lock, but only when it is very sure. A vision veto (the
// pictures clearly don't show the same moment) sends the angle to review instead of locking it.

import type { AngleSync, SyncCandidate, SyncMethod, SyncAngle } from './types';

const WEIGHT: Record<SyncMethod, number> = { manual: 10, timecode: 0.8, audio: 1, transcript: 0.9, vision: 0.5 };
const PRECISION: SyncMethod[] = ['manual', 'audio', 'timecode', 'transcript', 'vision'];

export function fuseAngle(assetId: string, cands: SyncCandidate[], tol = 0.12): AngleSync {
  const usable = cands.filter((c) => Number.isFinite(c.lag) && c.confidence > 0.05);
  if (!usable.length) {
    return { assetId, lag: 0, confidence: 0, status: 'failed', method: 'manual', candidates: cands, notes: ['No method could place this angle — set the offset by hand or add timecode.'] };
  }
  const clusters: SyncCandidate[][] = [];
  for (const c of [...usable].sort((a, b) => b.confidence * WEIGHT[b.method] - a.confidence * WEIGHT[a.method])) {
    const home = clusters.find((cl) => Math.abs(cl[0].lag - c.lag) <= (c.method === 'transcript' || cl[0].method === 'transcript' ? tol * 2.5 : tol));
    if (home) home.push(c); else clusters.push([c]);
  }
  const weigh = (cl: SyncCandidate[]) => cl.reduce((a, c) => a + c.confidence * WEIGHT[c.method], 0);
  clusters.sort((a, b) => weigh(b) - weigh(a));
  const win = clusters[0];
  const lead = PRECISION.map((m) => win.filter((c) => c.method === m).sort((a, b) => b.confidence - a.confidence)[0]).find(Boolean)!;
  const methods = new Set(win.map((c) => c.method));
  const rival = clusters[1] ? weigh(clusters[1]) : 0;
  const w = weigh(win);
  // Agreement between independent methods is worth more than any single strong score.
  let conf = Math.min(1, w / (methods.size >= 2 ? 1.2 : 1.15));
  if (rival > 0) conf *= Math.min(1, w / (rival * 2));
  const notes: string[] = [];
  if (methods.size >= 2) notes.push(`${[...methods].join(' + ')} agree`);
  if (clusters.length > 1 && rival > w * 0.5) notes.push(`A second lag (${clusters[1][0].lag.toFixed(2)} s by ${clusters[1].map((c) => c.method).join('/')}) also fits — check it.`);
  const manual = lead.method === 'manual';
  const status = manual ? 'manual' : conf >= 0.72 ? 'locked' : conf >= 0.35 ? 'review' : 'failed';
  return { assetId, lag: lead.lag, confidence: Math.round(conf * 100) / 100, status, method: lead.method, candidates: cands, notes };
}

/** Apply the vision verdict: a clear "different moment" majority demotes a lock to review. */
export function applyVision(s: AngleSync, v: { agree: number; disagree: number; unsure: number }): AngleSync {
  const checked = v.agree + v.disagree > 0;
  const out: AngleSync = { ...s, vision: { ...v, checked }, notes: [...s.notes] };
  if (!checked || s.status === 'master' || s.status === 'manual') return out;
  if (v.disagree > v.agree) {
    out.status = 'review'; out.confidence = Math.min(out.confidence, 0.4);
    out.notes.push(`Vision: ${v.disagree} of ${v.agree + v.disagree} probe frames don't show the same moment.`);
  } else if (v.agree >= 2 && s.status === 'review' && s.confidence >= 0.5) {
    out.status = 'locked'; out.confidence = Math.max(out.confidence, 0.75);
    out.notes.push(`Vision confirmed the lock at ${v.agree} probe frames.`);
  } else if (v.agree) out.notes.push(`Vision agrees (${v.agree}/${v.agree + v.disagree}).`);
  return out;
}

/** Timecode candidate: both angles carry a source start TC. */
export function timecodeCandidate(master: SyncAngle, angle: SyncAngle): SyncCandidate | null {
  if (master.tcStart == null || angle.tcStart == null) return null;
  const lag = angle.tcStart - master.tcStart;
  // TC across a whole day is plausible; across more than the master's length it's a wrong reel.
  if (Math.abs(lag) > Math.max(master.duration, angle.duration) + 60) return { method: 'timecode', lag, confidence: 0.1, note: 'timecodes barely overlap' };
  return { method: 'timecode', lag, confidence: 0.85, note: 'source timecode' };
}

/** Lags → multicam layout: where multicam 0 sits on the master clock, total length, per-angle offsets. */
export function layout(angles: SyncAngle[], sync: AngleSync[]): { mcZero: number; mcDuration: number; offsets: Record<string, number> } {
  const lagOf = (id: string) => sync.find((s) => s.assetId === id)?.lag ?? 0;
  const placed = angles.filter((a) => sync.find((s) => s.assetId === a.assetId)?.status !== 'failed');
  const set = placed.length ? placed : angles;
  const mcZero = Math.min(...set.map((a) => lagOf(a.assetId)));
  const mcEnd = Math.max(...set.map((a) => lagOf(a.assetId) + (a.duration || 0)));
  const offsets: Record<string, number> = {};
  for (const a of angles) offsets[a.assetId] = Math.round((mcZero - lagOf(a.assetId)) * 1000) / 1000;
  return { mcZero, mcDuration: Math.max(0, mcEnd - mcZero), offsets };
}

/** Does angle `a` have picture at multicam time T? */
export function covers(a: SyncAngle, offset: number, T: number): boolean {
  const src = T + offset;
  return src >= 0 && src <= (a.duration || 0) - 0.04;
}

/** Snap to the timeline frame grid. */
export const snapFrame = (t: number, fps: number) => Math.round(t * fps) / fps;
