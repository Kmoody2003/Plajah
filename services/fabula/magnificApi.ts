// ─── Magnific adapter ────────────────────────────────────────────────────────
// SERVER-SIDE ONLY — do not import from browser/React code. It carries the user's API key.
//
// Magnific (formerly Freepik, rebranded April 2026) exposes a conventional async REST API:
//   POST /v1/ai/mystic          → { data: { task_id, status } }     text→image
//   POST /v1/ai/image-upscaler  → { data: { task_id, status } }     upscale / reimagine a still
//   GET  /v1/ai/{endpoint}/{task_id} → { data: { task_id, status, generated: [url] } }
// Auth is the `x-magnific-api-key` header. Statuses are CREATED | IN_PROGRESS | COMPLETED | FAILED.
//
// Two things the API demands that the rest of Fabula does not:
//   1. Images go up as BASE64, not URLs — every reference has to be fetched and encoded first.
//   2. Aspect ratio is a fixed enum with no cinema ratios in it. A film tool's native 2.39:1 does not
//      exist here; `mysticAspect` picks the nearest and says so, so the UI can warn instead of
//      silently returning a differently-framed image.
//
// Docs: https://docs.magnific.com  ·  keys: https://www.magnific.com/user/organization/api-keys

export const MAGNIFIC_BASE = 'https://api.magnific.com';

export type MagnificOp = 'generate' | 'upscale';

/** Endpoint path segment per operation — also the GET polling path. */
export const MAGNIFIC_ENDPOINT: Record<MagnificOp, string> = {
  generate: '/v1/ai/mystic',
  upscale: '/v1/ai/image-upscaler',
};

// ── aspect ratio ────────────────────────────────────────────────────────────────
// Mystic's enum, with the numeric ratio each one actually represents.
const MYSTIC_ASPECTS: { id: string; ratio: number }[] = [
  { id: 'square_1_1', ratio: 1 },
  { id: 'classic_4_3', ratio: 4 / 3 },
  { id: 'traditional_3_4', ratio: 3 / 4 },
  { id: 'widescreen_16_9', ratio: 16 / 9 },
  { id: 'social_story_9_16', ratio: 9 / 16 },
  { id: 'smartphone_horizontal_20_9', ratio: 20 / 9 },
  { id: 'smartphone_vertical_9_20', ratio: 9 / 20 },
  { id: 'standard_3_2', ratio: 3 / 2 },
  { id: 'portrait_2_3', ratio: 2 / 3 },
  { id: 'horizontal_2_1', ratio: 2 },
  { id: 'vertical_1_2', ratio: 0.5 },
  { id: 'social_5_4', ratio: 5 / 4 },
  { id: 'social_post_4_5', ratio: 4 / 5 },
];

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

export interface AspectChoice {
  value: string;      // the Mystic enum to send
  exact: boolean;     // false when we had to approximate
  note?: string;      // plain-English warning for the UI when approximated
}

/** Nearest supported aspect. Cinema ratios (2.39:1, 1.85:1) have no exact match — say so rather than
 *  quietly reframing the shot, because in a film tool that difference is the whole composition. */
export function mysticAspect(aspect?: string): AspectChoice {
  const want = parseAspect(aspect);
  if (want == null) return { value: 'square_1_1', exact: true };

  let best = MYSTIC_ASPECTS[0];
  let bestErr = Infinity;
  for (const cand of MYSTIC_ASPECTS) {
    // Compare in log space so 2:1 vs 2.39:1 and 1:2 vs 1:2.39 are penalised symmetrically.
    const err = Math.abs(Math.log(cand.ratio / want));
    if (err < bestErr) { bestErr = err; best = cand; }
  }
  const exact = bestErr < 0.01;
  if (exact) return { value: best.id, exact: true };

  // Speak in ratios, not enum names. "smartphone_horizontal_20_9" means nothing to a DP; "2.22:1"
  // tells them exactly how much they'll have to crop off a 2.39 frame.
  const asRatio = best.ratio >= 1
    ? `${best.ratio.toFixed(2)}:1`
    : `1:${(1 / best.ratio).toFixed(2)}`;
  return {
    value: best.id,
    exact: false,
    note: `Magnific has no ${aspect} frame — generating the nearest it has, ${asRatio}. `
      + `Crop to ${aspect} in the timeline.`,
  };
}

// ── request bodies ──────────────────────────────────────────────────────────────

export interface MagnificRefs {
  /** base64 (no data: prefix) of the image to upscale, or Mystic's structure reference */
  source?: string;
  /** base64 of Mystic's style reference */
  style?: string;
}

export interface MagnificInput {
  prompt?: string;
  aspect?: string;
  refs?: MagnificRefs;
  webhookUrl?: string;
  /** upscale-only knobs, all [-10, 10] */
  scaleFactor?: '2x' | '4x' | '8x' | '16x';
  optimizedFor?: string;
  creativity?: number;
  hdr?: number;
  resemblance?: number;
  fractality?: number;
  resolution?: '1k' | '2k' | '4k';
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/** Which operation a spec implies: a source image means upscale/reimagine, otherwise generate. */
export function opForInput(input: MagnificInput): MagnificOp {
  return input.refs?.source ? 'upscale' : 'generate';
}

export function buildMysticBody(input: MagnificInput): Record<string, any> {
  const asp = mysticAspect(input.aspect);
  const body: Record<string, any> = {
    prompt: (input.prompt || '').trim(),
    aspect_ratio: asp.value,
    resolution: input.resolution || '2k',
  };
  if (input.refs?.source) body.structure_reference = input.refs.source;
  if (input.refs?.style) body.style_reference = input.refs.style;
  if (input.webhookUrl) body.webhook_url = input.webhookUrl;
  return body;
}

export function buildUpscaleBody(input: MagnificInput): Record<string, any> {
  const body: Record<string, any> = {
    image: input.refs?.source || '',
    scale_factor: input.scaleFactor || '2x',
    // Fabula is a film tool; this is the right default for frames and plates.
    optimized_for: input.optimizedFor || 'films_n_photography',
  };
  if (input.prompt?.trim()) body.prompt = input.prompt.trim();
  if (input.webhookUrl) body.webhook_url = input.webhookUrl;
  for (const k of ['creativity', 'hdr', 'resemblance', 'fractality'] as const) {
    const v = input[k];
    if (typeof v === 'number') body[k] = clamp(v, -10, 10);
  }
  return body;
}

export function buildBody(op: MagnificOp, input: MagnificInput): Record<string, any> {
  return op === 'upscale' ? buildUpscaleBody(input) : buildMysticBody(input);
}

// ── responses ───────────────────────────────────────────────────────────────────

export type GenStatus = 'queued' | 'running' | 'done' | 'error';

export interface NormalizedTask {
  taskId?: string;
  status: GenStatus;
  results: { url: string; name: string; mime: string }[];
  error?: string;
}

const STATUS_MAP: Record<string, GenStatus> = {
  CREATED: 'queued',
  IN_PROGRESS: 'running',
  COMPLETED: 'done',
  FAILED: 'error',
};

/** Normalize either a POST ack or a GET task poll. Magnific wraps in `data`; the webhook payload is
 *  the same shape unwrapped, so accept both. */
export function normalizeTask(json: any, label = 'magnific'): NormalizedTask {
  const d = json?.data ?? json ?? {};
  const status = STATUS_MAP[String(d.status || '').toUpperCase()] || 'running';
  const urls: string[] = Array.isArray(d.generated) ? d.generated.filter((u: any) => typeof u === 'string') : [];
  const results = urls.map((url, i) => ({
    url,
    name: urls.length > 1 ? `${label}-${i + 1}.png` : `${label}.png`,
    mime: 'image/png',
  }));
  // COMPLETED with nothing generated is a failure we'd otherwise report as success.
  if (status === 'done' && !results.length) {
    return { taskId: d.task_id, status: 'error', results: [], error: 'Magnific reported the task complete but returned no image.' };
  }
  return { taskId: d.task_id, status, results };
}

// ── transport ───────────────────────────────────────────────────────────────────

async function magnificFetch(path: string, apiKey: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${MAGNIFIC_BASE}${path}`, {
    ...init,
    headers: {
      'x-magnific-api-key': apiKey,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const msg = json?.message || json?.problem?.message || text?.slice(0, 200) || `HTTP ${res.status}`;
    // 401 is the one the user can actually fix, so name it precisely.
    throw new Error(res.status === 401 ? 'Magnific rejected the API key — re-link the account.' : `Magnific: ${msg}`);
  }
  return json;
}

/** Fetch a reference image and base64 it. Magnific takes bytes, not URLs. */
export async function fetchAsBase64(url: string, maxBytes = 12 * 1024 * 1024): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't read the reference image (HTTP ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new Error(`Reference image is ${(buf.byteLength / 1e6).toFixed(1)}MB — too large to send (limit ${(maxBytes / 1e6).toFixed(0)}MB).`);
  }
  return buf.toString('base64');
}

export async function submitMagnific(
  apiKey: string, op: MagnificOp, input: MagnificInput,
): Promise<NormalizedTask> {
  const json = await magnificFetch(MAGNIFIC_ENDPOINT[op], apiKey, {
    method: 'POST',
    body: JSON.stringify(buildBody(op, input)),
  });
  return normalizeTask(json);
}

export async function pollMagnific(apiKey: string, op: MagnificOp, taskId: string): Promise<NormalizedTask> {
  const json = await magnificFetch(`${MAGNIFIC_ENDPOINT[op]}/${encodeURIComponent(taskId)}`, apiKey);
  return normalizeTask(json);
}

/** Cheap key check for the link step — lists Mystic tasks, which needs nothing but a valid key. */
export async function verifyMagnificKey(apiKey: string): Promise<boolean> {
  await magnificFetch('/v1/ai/mystic', apiKey);
  return true;
}
