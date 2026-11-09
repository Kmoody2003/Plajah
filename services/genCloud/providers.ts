// services/genCloud/providers.ts — provider adapters on Plajah's own accounts. SERVER ONLY.
//
// Keys come from server env and travel only in request headers, never in URLs, job records or
// responses. Request/response shapes follow each provider's public docs as of Nov 2026 and are
// UNVERIFIED against the live APIs (no keys were used to build this) — the first staging run of
// each adapter must confirm field names. Every call goes through an injected fetch.

import type { GenOutput, GenRequest, ProviderAdapter, ProviderPoll, ProviderRoute, ProviderSubmit } from './types';

type Fetch = typeof fetch;

async function json(res: Response, what: string): Promise<any> {
  const text = await res.text();
  if (!res.ok) throw new Error(`${what} ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`${what}: not JSON`); }
}

async function bytesOf(res: Response, what: string): Promise<Uint8Array> {
  if (!res.ok) throw new Error(`${what} ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const b64ToBytes = (b64: string) => new Uint8Array(Buffer.from(b64, 'base64'));

// ── fal (queue API) ─────────────────────────────────────────────────────────────────────────────
// POST https://queue.fal.run/<model> → { request_id, status_url, response_url }. We keep the two
// URLs fal hands back (as the job id) instead of rebuilding them: nested model ids map to queue
// paths in ways that have changed before.

export function falAdapter(key: string | undefined, f: Fetch = fetch): ProviderAdapter {
  const headers = () => ({ Authorization: `Key ${key}`, 'Content-Type': 'application/json' });
  return {
    id: 'fal',
    configured: () => !!key,
    async submit(route: ProviderRoute, req: GenRequest): Promise<ProviderSubmit> {
      const body: Record<string, unknown> = { prompt: req.prompt };
      if (req.imageUrl) body.image_url = req.imageUrl;
      if (req.count) body.num_images = req.count;
      if (req.aspect) body.aspect_ratio = req.aspect;
      if (req.seconds) body.duration = String(req.seconds);
      if (req.resolution) body.resolution = req.resolution;
      const r = await json(await f(`https://queue.fal.run/${route.model}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) }), 'fal submit');
      if (!r.status_url || !r.response_url) throw new Error('fal submit: no queue URLs');
      return { providerJobId: JSON.stringify({ s: r.status_url, r: r.response_url }) };
    },
    async poll(_route: ProviderRoute, id: string): Promise<ProviderPoll> {
      const { s, r } = JSON.parse(id);
      const st = await json(await f(s, { headers: headers() }), 'fal status');
      if (st.status === 'IN_QUEUE') return { status: 'queued' };
      if (st.status === 'IN_PROGRESS') return { status: 'running' };
      if (st.status !== 'COMPLETED') return { status: 'failed', error: String(st.error || st.status) };
      const res = await json(await f(r, { headers: headers() }), 'fal result');
      const outputs: GenOutput[] = [];
      for (const im of res.images ?? []) outputs.push({ url: im.url, mime: im.content_type || 'image/png', width: im.width, height: im.height });
      if (res.image?.url) outputs.push({ url: res.image.url, mime: res.image.content_type || 'image/png' });
      if (res.video?.url) outputs.push({ url: res.video.url, mime: res.video.content_type || 'video/mp4' });
      return outputs.length ? { status: 'succeeded', outputs } : { status: 'failed', error: 'fal: empty result' };
    },
    async download(url: string) { return bytesOf(await f(url), 'fal download'); },
  };
}

// ── Google (Gemini API REST: Imagen :predict, Veo :predictLongRunning) ─────────────────────────

const GOOGLE = 'https://generativelanguage.googleapis.com/v1beta';

export function googleAdapter(key: string | undefined, f: Fetch = fetch): ProviderAdapter {
  const headers = () => ({ 'x-goog-api-key': String(key), 'Content-Type': 'application/json' });
  return {
    id: 'google',
    configured: () => !!key,
    async submit(route: ProviderRoute, req: GenRequest): Promise<ProviderSubmit> {
      if (route.model.startsWith('imagen-')) {
        const body = { instances: [{ prompt: req.prompt }], parameters: { sampleCount: req.count ?? 1, ...(req.aspect ? { aspectRatio: req.aspect } : {}) } };
        const r = await json(await f(`${GOOGLE}/models/${route.model}:predict`, { method: 'POST', headers: headers(), body: JSON.stringify(body) }), 'imagen');
        const outputs: GenOutput[] = (r.predictions ?? []).filter((p: any) => p.bytesBase64Encoded)
          .map((p: any) => ({ bytes: b64ToBytes(p.bytesBase64Encoded), mime: p.mimeType || 'image/png' }));
        if (!outputs.length) throw new Error('imagen: no images (blocked or empty)');
        return { providerJobId: `sync:${route.model}`, outputs };
      }
      const params: Record<string, unknown> = {};
      if (req.aspect) params.aspectRatio = req.aspect;
      if (req.resolution) params.resolution = req.resolution;
      if (req.seconds) params.durationSeconds = req.seconds;
      const body = { instances: [{ prompt: req.prompt }], parameters: params };
      const r = await json(await f(`${GOOGLE}/models/${route.model}:predictLongRunning`, { method: 'POST', headers: headers(), body: JSON.stringify(body) }), 'veo');
      if (!r.name) throw new Error('veo: no operation name');
      return { providerJobId: r.name };
    },
    async poll(_route: ProviderRoute, id: string): Promise<ProviderPoll> {
      if (!/^models\/veo-[\w.-]+\/operations\/[\w-]+$/.test(id)) return { status: 'failed', error: 'bad operation id' };
      const op = await json(await f(`${GOOGLE}/${id}`, { headers: headers() }), 'veo poll');
      if (!op.done) return { status: 'running' };
      if (op.error) return { status: 'failed', error: String(op.error.message || 'veo error') };
      const samples = op.response?.generateVideoResponse?.generatedSamples ?? [];
      const outputs: GenOutput[] = samples.filter((s: any) => s.video?.uri).map((s: any) => ({ url: s.video.uri, mime: 'video/mp4' }));
      return outputs.length ? { status: 'succeeded', outputs } : { status: 'failed', error: 'veo: no video (likely filtered)' };
    },
    async download(url: string) { return bytesOf(await f(url, { headers: { 'x-goog-api-key': String(key) } }), 'veo download'); },
  };
}

// ── MiniMax (video_generation task → query → files/retrieve) ───────────────────────────────────

const MINIMAX = 'https://api.minimax.io/v1';

export function minimaxAdapter(key: string | undefined, f: Fetch = fetch): ProviderAdapter {
  const headers = () => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
  return {
    id: 'minimax',
    configured: () => !!key,
    async submit(route: ProviderRoute, req: GenRequest): Promise<ProviderSubmit> {
      const body: Record<string, unknown> = { model: route.model, prompt: req.prompt };
      if (req.seconds) body.duration = req.seconds;
      if (req.resolution) body.resolution = req.resolution === '720p' ? '768P' : '1080P';
      if (req.imageUrl) body.first_frame_image = req.imageUrl;
      const r = await json(await f(`${MINIMAX}/video_generation`, { method: 'POST', headers: headers(), body: JSON.stringify(body) }), 'minimax submit');
      if (r.base_resp && r.base_resp.status_code !== 0) throw new Error(`minimax: ${r.base_resp.status_msg}`);
      if (!r.task_id) throw new Error('minimax: no task id');
      return { providerJobId: String(r.task_id) };
    },
    async poll(_route: ProviderRoute, id: string): Promise<ProviderPoll> {
      const q = await json(await f(`${MINIMAX}/query/video_generation?task_id=${encodeURIComponent(id)}`, { headers: headers() }), 'minimax poll');
      if (q.status === 'Fail') return { status: 'failed', error: 'minimax: generation failed' };
      if (q.status !== 'Success') return { status: q.status === 'Queueing' ? 'queued' : 'running' };
      const file = await json(await f(`${MINIMAX}/files/retrieve?file_id=${encodeURIComponent(q.file_id)}`, { headers: headers() }), 'minimax file');
      const url = file.file?.download_url;
      return url ? { status: 'succeeded', outputs: [{ url, mime: 'video/mp4' }] } : { status: 'failed', error: 'minimax: no download url' };
    },
    async download(url: string) { return bytesOf(await f(url), 'minimax download'); },
  };
}

// ── ElevenLabs (text-to-speech, synchronous) ────────────────────────────────────────────────────

export const DEFAULT_VOICE_ID = process.env.GENCLOUD_DEFAULT_VOICE_ID || '';

export function elevenlabsAdapter(key: string | undefined, f: Fetch = fetch): ProviderAdapter {
  return {
    id: 'elevenlabs',
    configured: () => !!key,
    async submit(route: ProviderRoute, req: GenRequest): Promise<ProviderSubmit> {
      const voice = req.voiceId || DEFAULT_VOICE_ID;
      if (!/^[A-Za-z0-9]{8,64}$/.test(voice)) throw new Error('elevenlabs: no valid voice id');
      const res = await f(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: 'POST', headers: { 'xi-api-key': String(key), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: req.text ?? '', model_id: route.model }),
      });
      return { providerJobId: `sync:${route.model}`, outputs: [{ bytes: await bytesOf(res, 'elevenlabs'), mime: 'audio/mpeg' }] };
    },
    async poll() { return { status: 'failed', error: 'elevenlabs is synchronous' }; },
    async download(url: string) { return bytesOf(await f(url), 'elevenlabs download'); },
  };
}

/** Build every adapter from server env. */
export function adaptersFromEnv(env: Record<string, string | undefined>, f: Fetch = fetch) {
  return {
    fal: falAdapter(env.FAL_KEY, f),
    google: googleAdapter(env.GOOGLE_AI_API_KEY || env.GEMINI_API_KEY, f),
    minimax: minimaxAdapter(env.MINIMAX_API_KEY, f),
    elevenlabs: elevenlabsAdapter(env.ELEVENLABS_API_KEY, f),
  };
}
