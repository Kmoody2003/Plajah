// trackerHub — live motion tracking that graphics can ride on.
//
// A tracker watches a live feed (camera, TV Studio program, Stage output…) and
// publishes ANCHORS in normalized frame coordinates (0..1), smoothed:
//   face   'face' (centre), 'faceTop', 'faceBottom', 'faceLeft', 'faceRight', plus box + scale
//          — MediaPipe Face Landmarker (CDN model), worker-first via services/vtuber
//   pose   every named body point ('nose','shoulderL','wristR',…) + 'head', 'chest', 'hips'
//          — MediaPipe Pose Landmarker (CDN model)
//   point  'point' — a spot the operator clicks, followed frame-to-frame with Fabula's
//          pure-JS patch tracker (no network, works on anything with texture)
// A CG graphic with `ref.anchor = { trackerId, point }` is offset every frame so its
// anchor origin sits on that point (and optionally scales with the face/body).
// States are mirrored over BroadcastChannel so the switcher and Stage outputs in
// other windows follow the same subject.
import { liveFeedVideo, releaseLiveFeed, liveFeedReady } from '../visualFill/liveFeed';

export type TrackerKind = 'face' | 'pose' | 'point';
export interface TrackerDef { id: string; name: string; kind: TrackerKind; feed: string; point?: { x: number; y: number }; smoothing?: number }
export interface Anchor { x: number; y: number; v: number }
export interface TrackerState { anchors: Record<string, Anchor>; scale: number; box: { x: number; y: number; w: number; h: number } | null; status: 'starting' | 'tracking' | 'lost' | 'error'; error?: string; at: number }

const KEY = 'plajah.liveTracking.trackers.v1';
let defs: TrackerDef[] | null = null;
const states = new Map<string, TrackerState>();
const listeners = new Set<(id: string, s: TrackerState) => void>();
const registryListeners = new Set<() => void>();

function ls(): Storage | null { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }
export function listTrackers(): TrackerDef[] { if (!defs) { try { defs = JSON.parse(ls()?.getItem(KEY) || '[]'); } catch { defs = []; } } return defs!; }
function persist() { try { ls()?.setItem(KEY, JSON.stringify(listTrackers())); } catch { /* */ } registryListeners.forEach(f => f()); }
export function onTrackersChange(fn: () => void) { registryListeners.add(fn); return () => { registryListeners.delete(fn); }; }
export function addTracker(d: Omit<TrackerDef, 'id'>): TrackerDef { const t = { ...d, id: `trk_${Date.now().toString(36)}` }; defs = [...listTrackers(), t]; persist(); return t; }
export function updateTracker(id: string, patch: Partial<TrackerDef>) { defs = listTrackers().map(t => (t.id === id ? { ...t, ...patch } : t)); persist(); if (runners.has(id)) { stopTracker(id); startTracker(id); } }
export function removeTracker(id: string) { stopTracker(id); defs = listTrackers().filter(t => t.id !== id); persist(); states.delete(id); }

export function trackerState(id: string): TrackerState | undefined { return states.get(id); }
export function onTrackerState(fn: (id: string, s: TrackerState) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function publish(id: string, s: TrackerState, fromBus = false) {
  states.set(id, s); listeners.forEach(f => f(id, s));
  if (!fromBus) bus()?.postMessage({ id, s });
}

/** Anchor names a tracker kind publishes (for pickers). */
export function anchorNames(kind: TrackerKind): string[] {
  if (kind === 'face') return ['face', 'faceTop', 'faceBottom', 'faceLeft', 'faceRight'];
  if (kind === 'pose') return ['head', 'chest', 'hips', 'nose', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR', 'hipL', 'hipR', 'ankleL', 'ankleR'];
  return ['point'];
}

// ── smoothing ────────────────────────────────────────────────────────────────
function smooth(prev: Anchor | undefined, next: Anchor, k: number): Anchor {
  if (!prev) return next;
  return { x: prev.x + (next.x - prev.x) * k, y: prev.y + (next.y - prev.y) * k, v: next.v };
}

// ── runners ──────────────────────────────────────────────────────────────────
const runners = new Map<string, { stop(): void }>();
const refs = new Map<string, number>();

/** Hold a tracker running while something (a graphic on air, the Sources room) needs it. */
export function useTracker(id: string): () => void {
  refs.set(id, (refs.get(id) || 0) + 1);
  startTracker(id);
  return () => { const n = (refs.get(id) || 1) - 1; refs.set(id, n); if (n <= 0) { refs.delete(id); stopTracker(id); } };
}

export function startTracker(id: string) {
  if (runners.has(id) || typeof window === 'undefined') return;
  const def = listTrackers().find(t => t.id === id); if (!def) return;
  const video = liveFeedVideo(def.feed);
  let alive = true, raf = 0;
  const k = 1 - Math.max(0, Math.min(0.95, def.smoothing ?? 0.6));
  let st: TrackerState = { anchors: {}, scale: 1, box: null, status: 'starting', at: Date.now() };
  publish(id, st);
  let face: any = null, pose: any = null;
  let gray: { prev: any; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
  let pt = def.point ? { ...def.point } : { x: 0.5, y: 0.5 };
  let vt: any = null;

  (async () => {
    try {
      if (def.kind === 'face') { const m = await import('../vtuber/liveTrackers'); face = new m.LiveFaceTracker({ numFaces: 1, blendshapes: false }); }
      else if (def.kind === 'pose') { const m = await import('../vtuber/liveTrackers'); pose = new m.LivePoseTracker({}); }
      else { vt = await import('../fabula/vectorTrack'); const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180; gray = { prev: null, canvas, ctx: canvas.getContext('2d', { willReadFrequently: true })! }; }
    } catch (e: any) { publish(id, { ...st, status: 'error', error: String(e?.message || e) }); }
  })();

  const POSE: Record<string, number> = { nose: 0, eyeL: 2, eyeR: 5, earL: 7, earR: 8, shoulderL: 11, shoulderR: 12, elbowL: 13, elbowR: 14, wristL: 15, wristR: 16, hipL: 23, hipR: 24, ankleL: 27, ankleR: 28 };
  const loop = () => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (!video || !liveFeedReady(video)) return;
    const now = performance.now();
    let next: Record<string, Anchor> | null = null, box: TrackerState['box'] = null, scale = st.scale;
    if (face) {
      const f = face.step(video, now);
      if (f === undefined) return;
      if (f && f.bbox) {
        const b = f.bbox; box = b;
        next = { face: { x: b.x + b.w / 2, y: b.y + b.h / 2, v: 1 }, faceTop: { x: b.x + b.w / 2, y: b.y, v: 1 }, faceBottom: { x: b.x + b.w / 2, y: b.y + b.h, v: 1 }, faceLeft: { x: b.x, y: b.y + b.h / 2, v: 1 }, faceRight: { x: b.x + b.w, y: b.y + b.h / 2, v: 1 } };
        scale = b.w / 0.22; // 1 ≈ a head filling ~22% of the frame width (a mid shot)
      }
    } else if (pose) {
      const f = pose.step(video, now);
      if (f === undefined) return;
      if (f && f.pts?.length) {
        next = {};
        for (const [n, i] of Object.entries(POSE)) { const p = f.pts[i]; if (p) next[n] = { x: p.x, y: p.y, v: p.v ?? 1 }; }
        const mid = (a: string, b: string): Anchor | null => (next![a] && next![b] ? { x: (next![a].x + next![b].x) / 2, y: (next![a].y + next![b].y) / 2, v: Math.min(next![a].v, next![b].v) } : null);
        const chest = mid('shoulderL', 'shoulderR'), hips = mid('hipL', 'hipR');
        if (chest) next.chest = chest;
        if (hips) next.hips = hips;
        if (next.nose) next.head = { ...next.nose, y: next.nose.y - 0.06 };
        if (next.shoulderL && next.shoulderR) scale = Math.abs(next.shoulderL.x - next.shoulderR.x) / 0.25;
      }
    } else if (gray && vt) {
      gray.ctx.drawImage(video, 0, 0, gray.canvas.width, gray.canvas.height);
      const img = gray.ctx.getImageData(0, 0, gray.canvas.width, gray.canvas.height);
      const cur = vt.grayFromRgba(img.data, img.width, img.height);
      if (gray.prev) {
        const r = vt.trackPoint(gray.prev, cur, pt.x, pt.y, 7, 24);
        if (r && r.confidence > 0.35) pt = { x: r.x, y: r.y };
        next = { point: { x: pt.x, y: pt.y, v: r?.confidence ?? 0 } };
      } else next = { point: { x: pt.x, y: pt.y, v: 1 } };
      gray.prev = cur;
    }
    if (!next) { if (st.status !== 'lost') { st = { ...st, status: 'lost', at: Date.now() }; publish(id, st); } return; }
    const anchors: Record<string, Anchor> = {};
    for (const [n, a] of Object.entries(next)) anchors[n] = smooth(st.anchors[n], a, k);
    st = { anchors, box, scale: st.scale + (scale - st.scale) * k, status: 'tracking', at: Date.now() };
    publish(id, st);
  };
  raf = requestAnimationFrame(loop);
  runners.set(id, { stop: () => { alive = false; cancelAnimationFrame(raf); face?.dispose?.(); pose?.dispose?.(); releaseLiveFeed(def.feed); } });
}

export function stopTracker(id: string) { runners.get(id)?.stop(); runners.delete(id); }

/** Feed anchors from outside (a hardware/optical tracking system, a remote app, tests). */
export function pushTrackerState(id: string, anchors: Record<string, Anchor>, opts: { scale?: number; box?: TrackerState['box'] } = {}) {
  publish(id, { anchors, scale: opts.scale ?? 1, box: opts.box ?? null, status: Object.keys(anchors).length ? 'tracking' : 'lost', at: Date.now() });
}

/** Re-seed a point tracker where the operator clicked (normalized). */
export function seedPoint(id: string, x: number, y: number) { updateTracker(id, { point: { x, y } }); }

let ch: BroadcastChannel | null | undefined;
function bus(): BroadcastChannel | null {
  if (ch !== undefined) return ch;
  ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('plajah-live-tracking-v1') : null;
  (ch as unknown as { unref?: () => void } | null)?.unref?.();
  if (ch) ch.onmessage = (e: MessageEvent) => { const m = e.data; if (m?.id && m.s && !runners.has(m.id)) publish(m.id, m.s, true); };
  return ch;
}
bus();
