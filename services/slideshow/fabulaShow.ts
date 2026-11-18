// Themed Shows ↔ Fabula.
//
// A show becomes a Fabula production whose V1 track is a run of "show" clips — one per
// plan segment (intro, each photo visit, wide breaths, outro). Each clip references the
// show spec in the media pool and maps its own srcIn to show time, so:
//   • laid end to end they reproduce the rendered video exactly,
//   • any clip can be trimmed, moved, re-ordered, graded or given a Fabula transition,
//   • the monitor and the export both re-render the live 3D scene at that time (nothing
//     is baked), so edits to the show spec flow through.
// Music lands on A1 as ordinary audio clips (playlist in order, or the loop repeated).

import { get as idbGet, set as idbSet } from 'idb-keyval';
import { studioKey } from '../fabula/fabulaSync';
import type { ShowSpec } from './types';
import { buildPlan, musicCues } from './planner';
import { ShowRuntime } from './showRuntime';

const uid = () => Math.random().toString(36).slice(2, 10);

// --- frame source for the Fabula monitor + export -------------------------------------

interface Entry { rt: ShowRuntime; canvas: HTMLCanvasElement; loading: Promise<void>; ready: boolean; key: string; busy: Promise<void> }
const cache: Entry[] = [];
const LIMIT = 2; // each runtime holds a WebGL context; keep it small

function keyOf(spec: ShowSpec, w: number, h: number) { return `${spec.id}:${spec.updatedAt}:${w}x${h}`; }

function entryFor(spec: ShowSpec, w: number, h: number): Entry {
  const key = keyOf(spec, w, h);
  let e = cache.find((x) => x.key === key);
  if (e) { cache.splice(cache.indexOf(e), 1); cache.push(e); return e; }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const rt = new ShowRuntime(canvas, spec, { width: w, height: h, pixelRatio: 1, preserve: true });
  const entry: Entry = { rt, canvas, key, ready: false, busy: Promise.resolve(), loading: Promise.resolve() };
  entry.loading = rt.load().then(() => { entry.ready = true; });
  cache.push(entry);
  while (cache.length > LIMIT) cache.shift()!.rt.dispose();
  return entry;
}

/** Export path: exact frame at show time t (waits for scene + textures). */
export async function renderShowFrame(spec: ShowSpec, w: number, h: number, t: number): Promise<HTMLCanvasElement | null> {
  if (!spec?.photos) return null;
  const e = entryFor(spec, w, h);
  await e.loading;
  // serialise: one runtime renders one frame at a time
  const job = e.busy.then(() => e.rt.frame(t));
  e.busy = job.catch(() => {});
  await job;
  return e.canvas;
}

/** Monitor path: best frame available right now (never blocks the UI). */
export function renderShowFrameLatest(spec: ShowSpec, w: number, h: number, t: number): HTMLCanvasElement | null {
  if (!spec?.photos) return null;
  const e = entryFor(spec, w, h);
  if (!e.ready) return null;
  e.rt.frameNow(t);
  return e.canvas;
}

// --- build a Fabula production from a show --------------------------------------------

export interface ShowToFabulaResult { prodId: string; editId: string }

export function buildShowProduction(spec: ShowSpec) {
  const plan = buildPlan(spec);
  const editId = uid();
  const showItem = {
    id: uid(), name: spec.title || 'Themed Show', type: 'show', show: spec, duration: plan.duration,
    bin: 'Themed Shows', tags: ['show', spec.theme],
  };
  const mediaPool: any[] = [showItem];
  const clips: any[] = [];
  const segs = plan.segments;
  segs.forEach((s, k) => {
    // visible length = until the next segment starts (classic segments overlap their tail)
    const next = segs[k + 1];
    const length = next ? next.start - s.start : s.duration;
    const p = s.photoIndex != null ? spec.photos[s.photoIndex] : null;
    const label = s.kind === 'intro' ? 'Opening · dedication'
      : s.kind === 'outro' ? 'Closing · sky lanterns'
      : s.kind === 'wide' ? 'Wide · the garden'
      : `Photo ${s.photoIndex! + 1}${p?.title ? ` · ${p.title}` : ''}`;
    clips.push({
      id: uid(), trackId: 'v1', start: s.start, duration: length, srcIn: s.start,
      kind: 'show', assetId: showItem.id, label, show: { segmentId: s.id, kind: s.kind, photoIndex: s.photoIndex ?? null },
    });
  });

  // music on A1
  const trackItems = spec.music.tracks.map((t) => {
    const it = { id: uid(), name: t.title, type: 'audio', url: t.src, duration: t.duration, bin: 'Music', tags: ['show'] };
    mediaPool.push(it);
    return it;
  });
  for (const c of musicCues(spec, plan.duration)) {
    const it = trackItems[c.trackIndex];
    if (!it) continue;
    clips.push({ id: uid(), trackId: 'a1', start: c.at, duration: c.length, srcIn: c.offset, kind: 'media', label: it.name, assetId: it.id });
  }

  const now = Date.now();
  const prod = {
    id: uid(), title: spec.title || 'Themed Show', type: 'film',
    description: `Themed Show (${spec.theme}) — ${spec.photos.length} photos. Each V1 clip is a live scene segment.`,
    themes: '', world: '', cast: [],
    mediaPool,
    defaults: { style: '', aspect: '16:9', service: 'kling', stillTarget: 'mj_magnific', format: { preset: 'hd1080', label: 'HD 1080p', w: 1920, h: 1080, fps: 30, drop: false } },
    acts: [1, 2, 3].map((n) => ({ id: uid(), number: n, title: 'ACT ' + ['I', 'II', 'III'][n - 1], scenes: [] })),
    edits: [{ id: editId, title: spec.title || 'Themed Show', timeline: { clips, trackSettings: {} }, updatedAt: now }],
    worldCats: {}, design: {},
    showSpecId: spec.id,
    createdAt: now, updatedAt: now,
  };
  return { prod, editId };
}

/** Write the production to Fabula's store, set the handoff, and open Fabula. */
export async function openShowInFabula(spec: ShowSpec): Promise<ShowToFabulaResult> {
  const { prod, editId } = buildShowProduction(spec);
  await idbSet(studioKey('studio:prod:' + prod.id), prod);
  const idx = (await idbGet(studioKey('studio:index'))) as { list?: any[] } | undefined;
  const entry = { id: prod.id, title: prod.title, type: prod.type, updated: Date.now(), sceneCount: 0 };
  await idbSet(studioKey('studio:index'), { list: [entry, ...((idx?.list || []).filter((x: any) => x.id !== prod.id))] });
  await idbSet(studioKey('studio:handoff'), { prodId: prod.id, editId });
  window.dispatchEvent(new CustomEvent('OPEN_FABULA'));
  return { prodId: prod.id, editId };
}
