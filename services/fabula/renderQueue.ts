// ═══════════════════════════════════════════════════════════════════════════
// renderQueue — Fabula's BACKGROUND render queue.
//
// A module-level store, not React state: it outlives the Deliver page, workspace switches, scene /
// edit switches and page changes. Every job carries a frozen SNAPSHOT of its timeline (clips cut
// to the range, media pool, mixer, LUT, palette) taken when it was queued, so you can keep
// editing — even the same sequence — while it renders exactly what you queued.
//
// Jobs run one at a time: RENDER (Pixels engine → H.264 master at the target size/rate) then
// optional TRANSCODE (ffmpeg: desktop app or in-browser pack). Subscribe with useSyncExternalStore.
// ═══════════════════════════════════════════════════════════════════════════

import { renderFabulaToBlob } from '../fabulaRender';
import { buildFfmpegArgs } from '../crossover/engine';
import { rangeClips } from './rangeClips';
import { buildMpeg2Args } from './mpeg2';
import { planDelivery, spansFor, type DeliverPlan, type DeliverRange, type DeliverSettings, type TimelineFormat } from './deliver';

export type JobStatus = 'queued' | 'rendering' | 'encoding' | 'done' | 'error' | 'canceled';

export interface RenderJob {
  id: string;
  label: string;
  sequence: string;
  rangeTag: string;
  plan: DeliverPlan;
  fileName: string;
  durationSec: number;
  status: JobStatus;
  pct: number;
  stage?: string;
  etaSec?: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  result?: { url?: string; blob?: Blob; path?: string; name: string; sizeBytes: number };
  /** Frozen inputs (not shown in UI). */
  snap: { clips: any[]; mediaPool: any[]; trackSettings: any; cubeLut: any; palette: string[] };
}

type Listener = () => void;
const state = { jobs: [] as RenderJob[], running: false, autoDownload: true };
let version = 0;
let snapshot = { jobs: state.jobs, running: false, version };
const listeners = new Set<Listener>();
let abort: AbortController | null = null;

const emit = () => { version++; snapshot = { jobs: [...state.jobs], running: state.running, version }; listeners.forEach((l) => { try { l(); } catch { /* */ } }); };
const patch = (id: string, p: Partial<RenderJob>) => { const j = state.jobs.find((x) => x.id === id); if (j) { Object.assign(j, p); emit(); } };

export const renderQueue = {
  subscribe(l: Listener) { listeners.add(l); return () => listeners.delete(l); },
  getSnapshot() { return snapshot; },

  /** Queue one job per range span. The timeline is snapshotted NOW. */
  add(input: {
    sequence: string; settings: DeliverSettings; timeline: TimelineFormat; custom?: { w: number; h: number };
    clips: any[]; mediaPool: any[]; trackSettings?: any; cubeLut?: any; palette?: string[];
    range: DeliverRange; end: number; markIn?: number | null; markOut?: number | null; markers?: { t: number }[];
    fileName?: string; presetLabel: string;
  }): RenderJob[] {
    const plan = planDelivery(input.settings, input.timeline, input.custom);
    const spans = spansFor(input.range, input.end, input.markIn, input.markOut, input.markers);
    const frozenPool = JSON.parse(JSON.stringify(input.mediaPool || []));
    const base = (input.fileName || input.sequence || 'Fabula Cut').trim().replace(/[\\/:*?"<>|]+/g, '_');
    const made = spans.map((sp) => ({
      id: Math.random().toString(36).slice(2, 10),
      label: input.presetLabel, sequence: input.sequence, rangeTag: sp.tag, plan,
      fileName: `${base}${sp.tag !== 'ALL' ? '_' + sp.tag.replace(/[^\w]+/g, '') : ''}.${plan.ext}`,
      durationSec: sp.t1 - sp.t0, status: 'queued' as JobStatus, pct: 0,
      snap: { clips: JSON.parse(JSON.stringify(rangeClips(input.clips || [], sp.t0, sp.t1))), mediaPool: frozenPool, trackSettings: JSON.parse(JSON.stringify(input.trackSettings || {})), cubeLut: input.cubeLut || null, palette: input.palette || [] },
    }));
    state.jobs.push(...made);
    emit();
    return made;
  },

  remove(id: string) { const j = state.jobs.find((x) => x.id === id); if (j && (j.status === 'rendering' || j.status === 'encoding')) return; if (j?.result?.url) URL.revokeObjectURL(j.result.url); state.jobs = state.jobs.filter((x) => x.id !== id); emit(); },
  clearFinished() { state.jobs.filter((j) => ['done', 'error', 'canceled'].includes(j.status)).forEach((j) => j.result?.url && URL.revokeObjectURL(j.result.url)); state.jobs = state.jobs.filter((j) => !['done', 'error', 'canceled'].includes(j.status)); emit(); },
  retry(id: string) { patch(id, { status: 'queued', pct: 0, error: undefined, stage: undefined }); },
  move(id: string, dir: -1 | 1) { const i = state.jobs.findIndex((j) => j.id === id); const k = i + dir; if (i < 0 || k < 0 || k >= state.jobs.length) return; [state.jobs[i], state.jobs[k]] = [state.jobs[k], state.jobs[i]]; emit(); },
  /** Stop the running job (it goes back to queued) and pause the queue. */
  stop() { state.running = false; abort?.abort(); emit(); },
  cancel(id: string) { const j = state.jobs.find((x) => x.id === id); if (!j) return; if (j.status === 'rendering' || j.status === 'encoding') { (j as any)._cancel = true; abort?.abort(); } else if (j.status === 'queued') patch(id, { status: 'canceled' }); },
  setAutoDownload(v: boolean) { state.autoDownload = v; emit(); },
  get autoDownload() { return state.autoDownload; },

  async start() {
    if (state.running) return;
    state.running = true; emit();
    try {
      for (;;) {
        if (!state.running) break;
        const job = state.jobs.find((j) => j.status === 'queued');
        if (!job) break;
        await runJob(job);
      }
    } finally { state.running = false; abort = null; emit(); }
  },
};

function eta(job: RenderJob, pct: number) {
  if (!job.startedAt || pct < 0.02) return undefined;
  const elapsed = (performance.now() - job.startedAt) / 1000;
  return Math.max(0, (elapsed * (1 - pct)) / pct);
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function runJob(job: RenderJob) {
  abort = new AbortController();
  const signal = abort.signal;
  const { plan } = job;
  const renderShare = plan.transcode ? 0.6 : 1;
  patch(job.id, { status: 'rendering', pct: 0, stage: 'Rendering', startedAt: performance.now(), error: undefined });
  try {
    const master = await renderFabulaToBlob({
      clips: job.snap.clips, mediaPool: job.snap.mediaPool, format: { w: plan.render.w, h: plan.render.h, fps: plan.render.fps },
      palette: job.snap.palette, title: job.fileName, trackSettings: job.snap.trackSettings, cubeLut: job.snap.cubeLut,
      bitrate: plan.render.bitrate, quality: plan.render.quality, exactFps: true,
      onProgress: (p, stage) => { const pct = p * renderShare; patch(job.id, { pct, stage: stage || 'Rendering', etaSec: eta(job, pct) }); },
      signal,
    });
    if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
    if (!master) throw new Error('The renderer produced nothing (empty timeline or cancelled).');
    let result: RenderJob['result'];
    if (!plan.transcode) {
      result = { blob: master, url: URL.createObjectURL(master), name: job.fileName, sizeBytes: master.size };
    } else {
      patch(job.id, { status: 'encoding', stage: 'Encoding' });
      const run = await import('./mpeg2Run');
      const onProgress = (pr: { progress: number; line?: string }) => { const pct = renderShare + (pr.progress || 0) * (1 - renderShare); patch(job.id, { pct, stage: pr.line || 'Encoding', etaSec: eta(job, pct) }); };
      const t = plan.transcode;
      const out = t.type === 'mpeg2'
        ? await run.deliverWithArgs(master, job.fileName, (_e, i, o) => buildMpeg2Args(i, o, t.presetId, { fps: t.fps }), onProgress, signal, job.durationSec, 'Encoding MPEG-2')
        : await run.deliverWithArgs(master, job.fileName, (enc, i, o) => buildFfmpegArgs(i, { ...t.recipe, hwAccel: enc.length ? 'auto' : 'none' }, o, t.kind, enc.length ? enc : undefined), onProgress, signal, job.durationSec);
      result = { blob: out.blob, url: out.blob ? URL.createObjectURL(out.blob) : undefined, path: out.outputPath, name: out.name, sizeBytes: out.sizeBytes };
    }
    patch(job.id, { status: 'done', pct: 1, stage: undefined, etaSec: undefined, finishedAt: performance.now(), result });
    if (state.autoDownload && result?.blob) download(result.blob, result.name);
  } catch (e: any) {
    const canceled = signal.aborted || e?.name === 'AbortError';
    const user = (job as any)._cancel; delete (job as any)._cancel;
    patch(job.id, canceled
      ? { status: user ? 'canceled' : 'queued', pct: 0, stage: undefined, etaSec: undefined }
      : { status: 'error', error: String(e?.message || e).slice(0, 240), stage: undefined, etaSec: undefined });
  }
}
