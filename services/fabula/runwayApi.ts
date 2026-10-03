// ─── Runway adapter ────────────────────────────────────────────────────────────
// SERVER-SIDE ONLY — do not import from browser/React code. It carries the user's API key.
//
// Runway Gen-3 / Gen-4 exposes a task-based async REST API:
//   POST /v1/image_to_video       → { id, status: "PENDING", ... }
//   POST /v1/video_to_video       → { id, status: "PENDING", ... }
//   GET  /v1/tasks/{id}           → { id, status: "SUCCEEDED"|"FAILED"|..., output: [url] }
//   GET  /v1/tasks?limit=1        → (used for cheap key verification)
//
// Headers:
//   Authorization: Bearer <runway_api_secret>
//   X-Runway-Version: 2024-11-06
//   Content-Type: application/json
//
// Docs: https://docs.dev.runwayml.com  ·  keys: https://app.runwayml.com/settings/api-keys

export const RUNWAY_BASE = 'https://api.dev.runwayml.com';
export const RUNWAY_VERSION = '2024-11-06';

export type RunwayOp = 'image_to_video' | 'video_to_video';

export const RUNWAY_ENDPOINT: Record<RunwayOp, string> = {
  image_to_video: '/v1/image_to_video',
  video_to_video: '/v1/video_to_video',
};

// ── aspect ratio ────────────────────────────────────────────────────────────────
const RUNWAY_ASPECTS: { id: string; ratio: number }[] = [
  { id: '16:9', ratio: 16 / 9 },
  { id: '9:16', ratio: 9 / 16 },
  { id: '1:1', ratio: 1 },
];

export interface AspectChoice {
  value: string;
  exact: boolean;
  note?: string;
}

/** Parse Fabula's aspect strings — "16:9", "2.39:1", or a bare number. */
export function parseAspect(a?: string): number | null {
  if (!a) return null;
  const m = String(a).trim().match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/i);
  if (m) {
    const w = parseFloat(m[1]), h = parseFloat(m[2]);
    return h > 0 ? w / h : null;
  }
  const n = parseFloat(String(a));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Nearest supported ratio for Runway. Cinema ratios (2.39:1, 1.85:1) have no direct match in
 *  Runway's generation ratio enum — report nearest (16:9) with an advisory note so the DP is informed. */
export function runwayAspect(aspect?: string): AspectChoice {
  const want = parseAspect(aspect);
  if (want == null) return { value: '16:9', exact: true };

  let best = RUNWAY_ASPECTS[0];
  let minDiff = Infinity;
  for (const candidate of RUNWAY_ASPECTS) {
    const diff = Math.abs(Math.log(candidate.ratio) - Math.log(want));
    if (diff < minDiff) {
      minDiff = diff;
      best = candidate;
    }
  }

  // Exact match if within 1% ratio difference
  if (Math.abs(best.ratio - want) < 0.015) {
    return { value: best.id, exact: true };
  }

  const isScope = want > 2.0;
  const note = isScope
    ? `Runway generates at ${best.id} (1.78:1) — crop or letterbox in timeline for ${aspect || '2.39:1'} scope.`
    : `Runway generates at ${best.id} — nearest match for ${aspect}.`;

  return {
    value: best.id,
    exact: false,
    note,
  };
}

// ── operation & input bodies ────────────────────────────────────────────────────

export interface RunwayInput {
  prompt: string;
  aspect?: string;
  duration?: number; // 5 | 10
  model?: string;
  seed?: number;
  watermark?: boolean;
  refs?: {
    first_frame?: string; // URL or data: URI
    last_frame?: string;
    source?: string;
    style?: string;
  };
  videoUrl?: string; // For clip restyling / video_to_video
}

export function opForRunwayInput(input: RunwayInput): RunwayOp {
  return input.videoUrl ? 'video_to_video' : 'image_to_video';
}

export function buildImageToVideoBody(input: RunwayInput): Record<string, any> {
  const promptText = (input.prompt || '').trim();
  const aspect = runwayAspect(input.aspect);
  const promptImage = input.refs?.first_frame || input.refs?.source;

  const body: Record<string, any> = {
    promptText,
    model: input.model || 'gen3a_turbo',
    ratio: aspect.value,
    duration: input.duration === 10 ? 10 : 5,
    watermark: Boolean(input.watermark),
  };

  if (promptImage) {
    body.promptImage = promptImage;
  }
  if (input.refs?.last_frame) {
    body.lastFrameImage = input.refs.last_frame;
  }
  if (input.seed != null && Number.isInteger(input.seed)) {
    body.seed = input.seed;
  }

  return body;
}

export function buildVideoToVideoBody(input: RunwayInput): Record<string, any> {
  const promptText = (input.prompt || '').trim();
  const aspect = runwayAspect(input.aspect);

  const body: Record<string, any> = {
    promptText,
    model: input.model || 'gen3a_turbo',
    videoUrl: input.videoUrl,
    ratio: aspect.value,
    watermark: Boolean(input.watermark),
  };

  if (input.seed != null && Number.isInteger(input.seed)) {
    body.seed = input.seed;
  }

  return body;
}

export function buildRunwayBody(op: RunwayOp, input: RunwayInput): Record<string, any> {
  return op === 'video_to_video' ? buildVideoToVideoBody(input) : buildImageToVideoBody(input);
}

// ── responses ───────────────────────────────────────────────────────────────────

export type GenStatus = 'queued' | 'running' | 'done' | 'error';

export interface NormalizedTask {
  taskId?: string;
  status: GenStatus;
  progress?: number;
  results: { url: string; name: string; mime: string }[];
  error?: string;
}

const RUNWAY_STATUS_MAP: Record<string, GenStatus> = {
  PENDING: 'queued',
  THROTTLED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'done',
  FAILED: 'error',
  CANCELLED: 'error',
};

export function normalizeRunwayTask(json: any, label = 'runway'): NormalizedTask {
  const d = json?.data ?? json ?? {};
  const rawStatus = String(d.status || '').toUpperCase();
  const status = RUNWAY_STATUS_MAP[rawStatus] || 'running';
  const progress = typeof d.progress === 'number' ? Math.max(0, Math.min(1, d.progress)) : undefined;

  const rawOutputs = Array.isArray(d.output) ? d.output : (d.output ? [d.output] : []);
  const urls: string[] = rawOutputs.filter((u: any) => typeof u === 'string');

  const results = urls.map((url, i) => ({
    url,
    name: urls.length > 1 ? `${label}-${i + 1}.mp4` : `${label}.mp4`,
    mime: 'video/mp4',
  }));

  if (status === 'done' && !results.length) {
    return {
      taskId: d.id,
      status: 'error',
      progress,
      results: [],
      error: 'Runway reported the task complete but returned no video output.',
    };
  }

  if (status === 'error') {
    const errorMsg = d.failure || d.failureCode || d.error || 'Runway task failed.';
    return {
      taskId: d.id,
      status: 'error',
      progress,
      results: [],
      error: String(errorMsg),
    };
  }

  return {
    taskId: d.id,
    status,
    progress,
    results,
  };
}

// ── transport ───────────────────────────────────────────────────────────────────

async function runwayFetch(path: string, apiKey: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${RUNWAY_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'X-Runway-Version': RUNWAY_VERSION,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }

  if (!res.ok) {
    const msg = json?.error || json?.message || text?.slice(0, 200) || `HTTP ${res.status}`;
    if (res.status === 401) {
      throw new Error('Runway rejected the API key — re-link your Runway account with a valid secret key.');
    }
    throw new Error(`Runway: ${msg}`);
  }

  return json;
}

export async function submitRunway(
  apiKey: string,
  op: RunwayOp,
  input: RunwayInput,
): Promise<NormalizedTask> {
  const json = await runwayFetch(RUNWAY_ENDPOINT[op], apiKey, {
    method: 'POST',
    body: JSON.stringify(buildRunwayBody(op, input)),
  });
  return normalizeRunwayTask(json);
}

export async function pollRunway(apiKey: string, taskId: string): Promise<NormalizedTask> {
  const json = await runwayFetch(`/v1/tasks/${encodeURIComponent(taskId)}`, apiKey);
  return normalizeRunwayTask(json);
}

/** Check Runway API key by querying /v1/tasks?limit=1 */
export async function verifyRunwayKey(apiKey: string): Promise<boolean> {
  await runwayFetch('/v1/tasks?limit=1', apiKey);
  return true;
}
