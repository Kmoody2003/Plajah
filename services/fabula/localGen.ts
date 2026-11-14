// localGen — Fabula's local models, run through the same door as every other generator.
//
// The connector registry lists two generators that run on the user's own GPU (FLUX stills and Wan
// video, served by the Plajah native sidecar). They are free and private, which makes them the ideal
// engine for directed generation: a take that fails review can be retried at no cost. But a job for
// them cannot go to the cloud agent — the agent has no way to reach a user's machine. This module is
// their executor: it turns a ShotSpec into the local pipeline's task, runs it on the sidecar from the
// browser, and hands back results in the shape the rest of generation already understands, so local
// takes get the same direction, references, placement in the cut, review and retry as any other.
//
// It talks to the sidecar directly and has NO stand-in output: if the sidecar is off, or the model
// isn't installed, the job fails with that reason. A generator that quietly returns a placeholder
// would be reviewed, rejected and retried forever.

import type { Connector, GenRef, ShotSpec } from './genAgent';
import {
  compileCinemaMotionTask, compileCinemaStillTask,
  type CinemaMotionIntent, type CinemaStillIntent,
} from '../localAi/plajahPipelineEngine';

export const LOCAL_SIDECAR_URL = 'http://127.0.0.1:51122';

export const isLocalConnector = (c: Pick<Connector, 'walletModel'> | undefined): boolean => c?.walletModel === 'free_local';

export interface LocalResult { url: string; name: string; mime: string; /** The bytes, for saving into the project — a local take has no cloud URL. */ blob?: Blob }

const parseAspect = (a?: string): number | null => {
  const m = (a || '').match(/^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/);
  return m && Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
};

/** The closest of the ratios a local pipeline supports. Returns a note when it isn't exact, so the
 *  user is told to crop rather than finding the frame silently reshaped. */
export function nearestAspect<T extends string>(aspect: string | undefined, allowed: readonly T[]): { value: T; note?: string } {
  const want = parseAspect(aspect);
  if (!want) return { value: allowed[0] };
  const exact = allowed.find((a) => Math.abs((parseAspect(a) || 0) - want) < 0.01);
  if (exact) return { value: exact };
  const value = [...allowed].sort((a, b) => Math.abs(Math.log((parseAspect(a) || 1) / want)) - Math.abs(Math.log((parseAspect(b) || 1) / want)))[0];
  return { value, note: `The local model has no ${aspect} frame — generated at ${value}; crop to ${aspect} in the timeline.` };
}

const STILL_ASPECTS = ['16:9', '2.39:1', '9:16', '1:1', '4:3', '3:2'] as const;
const MOTION_ASPECTS = ['16:9', '9:16', '2.39:1', '1:1'] as const;

/** A still ShotSpec as the local FLUX pipeline's intent. `refImages` are the character and style
 *  references already resolved to data URLs — the local model takes them directly. */
export function stillIntentFromSpec(spec: ShotSpec, prompt: string, negative: string | undefined, refImages: string[]): { intent: CinemaStillIntent; note?: string } {
  const asp = nearestAspect(spec.aspect, STILL_ASPECTS);
  return {
    intent: {
      prompt, negativePrompt: negative || undefined, aspect: asp.value, seed: spec.seed,
      ...(refImages.length ? { referenceImages: refImages.slice(0, 10) } : {}),
    },
    note: asp.note,
  };
}

/** A video ShotSpec as the local Wan pipeline's intent. A first frame makes it image-to-video; a
 *  first and last frame makes it an interpolation; neither is text-to-video. */
export function motionIntentFromSpec(spec: ShotSpec, prompt: string, frames: { first?: string; last?: string }, durations: number[] = [3, 5]): { intent: CinemaMotionIntent; note?: string } {
  const asp = nearestAspect(spec.aspect, MOTION_ASPECTS);
  const want = spec.duration || durations[0];
  const durationSec = [...durations].sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];
  const notes = [asp.note, spec.duration && durationSec !== spec.duration ? `The local model runs ${durations.join(' or ')} seconds — generated ${durationSec}s for a ${spec.duration}s shot.` : undefined].filter(Boolean);
  return {
    intent: {
      motionPrompt: prompt,
      mode: frames.first && frames.last ? 'first_and_last_frame' : frames.first ? 'single_keyframe' : 'text_to_video',
      ...(frames.first ? { startKeyframeUrl: frames.first } : {}),
      ...(frames.last ? { endKeyframeUrl: frames.last } : {}),
      aspect: asp.value, durationSec, seed: spec.seed,
    },
    note: notes.length ? notes.join(' ') : undefined,
  };
}

export interface SidecarStatus { online: boolean; models: Record<string, boolean>; gpu?: string }

export async function localSidecarStatus(fetchImpl: typeof fetch = fetch, baseUrl = LOCAL_SIDECAR_URL): Promise<SidecarStatus> {
  try {
    const res = await fetchImpl(`${baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { online: false, models: {} };
    const stats = await res.json();
    const models: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(stats?.models || {})) models[k] = !!v;
    return { online: true, models, gpu: stats?.gpuName };
  } catch { return { online: false, models: {} }; }
}

async function toDataUrl(url: string, fetchImpl: typeof fetch): Promise<string> {
  if (url.startsWith('data:')) return url;
  const blob = await (await fetchImpl(url)).blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/png'};base64,${btoa(bin)}`;
}

function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob {
  const [head, b64 = ''] = dataUrl.split(',', 2);
  const mime = head.match(/^data:([^;]+)/)?.[1] || fallbackMime;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const refUrl = (r: GenRef) => r.previewUrl || r.url;

/** Run one generation on the local sidecar. Throws with a reason a person can act on. */
export async function runLocalGeneration(
  input: { connector: Connector; spec: ShotSpec; prompt: string; negative?: string },
  opts: { fetchImpl?: typeof fetch; baseUrl?: string; signal?: AbortSignal; progress?: (text: string) => void } = {},
): Promise<{ results: LocalResult[]; note?: string }> {
  const { connector, spec, prompt, negative } = input;
  const f = opts.fetchImpl || fetch;
  const base = opts.baseUrl || LOCAL_SIDECAR_URL;
  const isVideo = connector.kind === 'video';

  const status = await localSidecarStatus(f, base);
  if (!status.online) throw new Error('Your local GPU engine isn\'t running. Start the Plajah local engine and try again — nothing was generated.');
  const needs = isVideo ? ['wanVideo'] : ['flux3Klein', 'flux'];
  if (Object.keys(status.models).length && !needs.some((m) => status.models[m])) {
    throw new Error(`${isVideo ? 'The Wan video model' : 'A FLUX stills model'} isn't installed on your local engine yet. Install it from the local model manager, then generate again.`);
  }

  const post = async (route: string, body: unknown) => {
    let res: Response;
    try { res = await f(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: opts.signal }); }
    catch { throw new Error(opts.signal?.aborted ? 'Cancelled' : 'The local GPU engine stopped responding mid-generation.'); }
    if (!res.ok) throw new Error(`The local GPU engine refused the job (HTTP ${res.status}).`);
    const data = await res.json();
    if (!data?.success) throw new Error(data?.error ? `Local generation failed — ${data.error}` : 'Local generation failed — check the engine\'s log.');
    return data;
  };
  const resolve = async (r?: GenRef) => { const u = r && refUrl(r); if (!u) return undefined; try { return await toDataUrl(u, f); } catch { return undefined; } };
  const name = (spec.slug || 'local').replace(/[^a-z0-9]+/gi, '_');

  if (isVideo) {
    const first = await resolve(spec.refs.find((r) => r.role === 'first_frame' || r.role === 'source'));
    const last = await resolve(spec.refs.find((r) => r.role === 'last_frame'));
    const { intent, note } = motionIntentFromSpec(spec, prompt, { first, last }, connector.caps.durations);
    opts.progress?.('Generating the shot on your GPU…');
    const data = await post('/generate-video', { task: compileCinemaMotionTask(intent) });
    const media: unknown = data.videoUrl || data.mediaUrl;
    if (typeof media !== 'string' || !media.startsWith('data:')) throw new Error('The local engine finished without returning a video.');
    const blob = dataUrlToBlob(media, 'video/mp4');
    if (blob.size < 1024) throw new Error('The local engine returned an empty video.');
    return { results: [{ url: media, name: `${name}.mp4`, mime: blob.type, blob }], note };
  }

  const refImages: string[] = [];
  for (const r of spec.refs.filter((x) => (x.role === 'character' || x.role === 'style') && refUrl(x))) {
    const d = await resolve(r);
    if (d) refImages.push(d);
  }
  const { intent, note } = stillIntentFromSpec(spec, prompt, negative, refImages);
  opts.progress?.('Generating the frame on your GPU…');
  const data = await post('/generate', { task: compileCinemaStillTask(intent), outputFormat: 'png_with_jxl_copy', clientSupportsJxlDecode: false });
  const media: unknown = data.mediaUrl;
  if (typeof media !== 'string' || !media.startsWith('data:')) throw new Error('The local engine finished without returning an image.');
  const blob = dataUrlToBlob(media, 'image/png');
  return { results: [{ url: media, name: `${name}.png`, mime: blob.type, blob }], note };
}
