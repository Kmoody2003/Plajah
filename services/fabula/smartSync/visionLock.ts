// Vision lock — after the sound has placed an angle, LOOK to make sure.
//
// Two checks, one cheap and one smart:
//   motion  every angle sees the same room change at the same time (a person stands, lights shift, a slide
//           changes). Frame-difference energy around a few probe moments is correlated across angles; it
//           can nudge a lock by a few frames and flags a lock that's off by seconds.
//   model   the vision model gets the master frame and the angle frame for the same instant and judges
//           whether they show the same moment (posture, gesture, who's at the pulpit, what's on the screen).
//           That catches the gross failures sound can make: a repeated song section, a looped bed, a reel
//           from a different service. The same call labels the shot (wide / medium / close / screen / crowd)
//           so the cutter knows what each camera is for.

import type { AngleLook, ShotSize } from './types';

/** Mean absolute frame difference over a grey thumbnail sequence (each frame a Uint8 luma array). */
export function motionEnergy(frames: Uint8ClampedArray[] | Uint8Array[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i]; let s = 0;
    for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]);
    out.push(s / (a.length || 1));
  }
  return out;
}

/**
 * Best lag (seconds) between two motion curves sampled at `dt`, within ±maxLag. Positive = the angle's
 * events happen later in its curve than in the master's, i.e. the current lock should grow by that much.
 */
export function motionLag(master: number[], angle: number[], dt: number, maxLag: number): { lag: number; score: number } {
  const z = (x: number[]) => { const m = x.reduce((a, b) => a + b, 0) / (x.length || 1); const d = x.map((v) => v - m); const sd = Math.sqrt(d.reduce((a, b) => a + b * b, 0) / (d.length || 1)) || 1; return d.map((v) => v / sd); };
  const a = z(master), b = z(angle), R = Math.round(maxLag / dt);
  let best = 0, bs = -Infinity;
  for (let lag = -R; lag <= R; lag++) {
    let s = 0, n = 0;
    for (let i = 0; i < a.length; i++) { const j = i + lag; if (j < 0 || j >= b.length) continue; s += a[i] * b[j]; n++; }
    if (n < a.length * 0.6) continue;
    s /= n; if (s > bs) { bs = s; best = lag; }
  }
  return { lag: best * dt, score: Number.isFinite(bs) ? bs : 0 };
}

/** Probe moments (master time) for checking an angle: spread over the overlap, away from the edges. */
export function probeTimes(overlapStart: number, overlapEnd: number, n = 3): number[] {
  const len = overlapEnd - overlapStart;
  if (len < 4) return [];
  const pad = Math.min(20, len * 0.1);
  return Array.from({ length: n }, (_, i) => overlapStart + pad + ((len - 2 * pad) * (i + 0.5)) / n);
}

export const VISION_PROMPT = `You are a broadcast multicam assistant editor checking sync.
IMAGE 1 is the MASTER camera; IMAGE 2 is another camera at what should be the EXACT same instant of the same event, from a different position.
Judge whether they show the same moment: same people in the same posture and gesture, same person speaking or singing, same thing on any screen, same lighting state. Different framing and position are expected and are NOT evidence against.
Also classify each image's shot.
Respond ONLY with JSON:
{"same":"yes|no|unsure","evidence":"under 15 words","master":{"size":"wide|medium|close|screen|crowd|insert","subject":"3-6 words","tags":["2-5 lowercase tags like pulpit, choir, band, audience, speaker, slides, stage"],"operated":true},"angle":{"size":"…","subject":"…","tags":["…"],"operated":false}}`;

const SIZES: ShotSize[] = ['wide', 'medium', 'close', 'screen', 'crowd', 'insert'];

export interface VisionVerdict { same: 'yes' | 'no' | 'unsure'; evidence: string; master?: Omit<AngleLook, 'assetId'>; angle?: Omit<AngleLook, 'assetId'> }

export function normalizeVerdict(raw: unknown): VisionVerdict {
  const r = (raw || {}) as Record<string, any>;
  const look = (x: any): Omit<AngleLook, 'assetId'> | undefined => x && typeof x === 'object' ? {
    size: SIZES.includes(x.size) ? x.size : 'unknown',
    subject: String(x.subject || '').slice(0, 60),
    tags: Array.isArray(x.tags) ? x.tags.map((t: unknown) => String(t).toLowerCase().slice(0, 20)).slice(0, 6) : [],
    operated: typeof x.operated === 'boolean' ? x.operated : undefined,
  } : undefined;
  const same = r.same === 'yes' || r.same === 'no' ? r.same : 'unsure';
  return { same, evidence: String(r.evidence || '').slice(0, 120), master: look(r.master), angle: look(r.angle) };
}

/** Several looks of one angle (one per probe) → one label: majority size, merged tags. */
export function mergeLooks(assetId: string, looks: Array<Omit<AngleLook, 'assetId'> | undefined>): AngleLook {
  const ok = looks.filter(Boolean) as Array<Omit<AngleLook, 'assetId'>>;
  if (!ok.length) return { assetId, size: 'unknown', subject: '', tags: [] };
  const count = new Map<ShotSize, number>();
  for (const l of ok) count.set(l.size, (count.get(l.size) || 0) + 1);
  const size = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const tags = [...new Set(ok.flatMap((l) => l.tags))].slice(0, 8);
  const operated = ok.some((l) => l.operated);
  return { assetId, size, subject: ok.find((l) => l.size === size)?.subject || ok[0].subject, tags, operated };
}

/** Guess a look from the file name when there's no vision ("WIDE_cam1.mov", "pulpit-cu.mp4"). */
export function lookFromName(assetId: string, name: string, kind: 'video' | 'audio'): AngleLook {
  const n = name.toLowerCase();
  if (kind === 'audio') return { assetId, size: 'unknown', subject: 'sound only', tags: ['audio'] };
  const size: ShotSize = /\bwide|\bws\b|master|establish|\bwa\b/.test(n) ? 'wide'
    : /\bcu\b|close|tight|\becu\b/.test(n) ? 'close'
    : /\bmcu\b|\bms\b|medium|\bmid\b/.test(n) ? 'medium'
    : /screen|slides|propres|pro.?presenter|graphics|program|pgm/.test(n) ? 'screen'
    : /crowd|audience|congregation|house|reverse/.test(n) ? 'crowd' : 'unknown';
  const tags = ['pulpit', 'choir', 'band', 'stage', 'audience', 'drums', 'keys', 'piano', 'host', 'guest'].filter((t) => n.includes(t));
  return { assetId, size, subject: '', tags };
}
