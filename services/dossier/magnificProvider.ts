/**
 * Magnific API image provider (server-side / Node scripts only).
 * The key is MAGNIFIC_API_KEY — never a VITE_ variable (Vite would bake it into the bundle).
 *
 * Flux 2 Klein is the default: cheap and accepts up to 4 reference images (input_image..input_image_4),
 * which is how Character Bible reference portraits keep a likeness stable. Seedream 4.5 is text-only,
 * so it is used for scenes with no visible face.
 */
import type { ImageProvider, ImageRequest } from './characterGateway';

export type MagnificModel = 'flux-2-klein' | 'seedream-v4-5';

const BASE = 'https://api.magnific.com/v1/ai/text-to-image';
const ASPECT: Record<ImageRequest['aspect'], string> = {
  '1:1': 'square_1_1',
  '16:9': 'widescreen_16_9',
  '9:16': 'social_story_9_16',
  '4:3': 'classic_4_3',
};

export interface MagnificOptions {
  apiKey: string;
  model?: MagnificModel;
  resolution?: '1k' | '2k';
  /** Fetch used for BOTH the API and reference downloads; injectable for tests. */
  fetchImpl?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
  /** Called after every submitted task so callers can keep a spend ledger. */
  onTask?: (info: { model: MagnificModel; taskId: string; refs: number; resolution: string }) => void;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function toBase64(f: typeof fetch, url: string): Promise<string> {
  const res = await f(url, { headers: { 'User-Agent': 'PlajahDossier/0.1 (contact kmoody2003@gmail.com)' } });
  if (!res.ok) throw new Error(`reference download failed ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer()).toString('base64');
}

export function magnificProvider(opts: MagnificOptions): ImageProvider & { model: MagnificModel } {
  const f = opts.fetchImpl ?? fetch;
  const model = opts.model ?? 'flux-2-klein';
  const resolution = opts.resolution ?? '1k';
  const headers = { 'x-magnific-api-key': opts.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  return {
    name: `Magnific ${model}`,
    model,
    async generate(req: ImageRequest) {
      const body: Record<string, unknown> = {
        prompt: `${req.prompt} Avoid: ${req.negativePrompt}.`,
        aspect_ratio: ASPECT[req.aspect],
        seed: req.seed,
      };
      let refs = 0;
      if (model === 'flux-2-klein') {
        body.resolution = resolution;
        body.output_format = 'png';
        const urls = req.referenceUrls.slice(0, 4);
        for (let i = 0; i < urls.length; i++) {
          body[i === 0 ? 'input_image' : `input_image_${i + 1}`] = await toBase64(f, urls[i]);
        }
        refs = urls.length;
      }
      const create = await f(`${BASE}/${model}`, { method: 'POST', headers, body: JSON.stringify(body) });
      const created = await create.json().catch(() => ({}));
      const taskId: string | undefined = created?.data?.task_id;
      if (!create.ok || !taskId) throw new Error(`Magnific create failed ${create.status}: ${JSON.stringify(created).slice(0, 300)}`);
      opts.onTask?.({ model, taskId, refs, resolution });

      const deadline = Date.now() + (opts.timeoutMs ?? 180_000);
      while (Date.now() < deadline) {
        await sleep(opts.pollMs ?? 2500);
        const st = await f(`${BASE}/${model}/${taskId}`, { headers });
        const j = await st.json().catch(() => ({}));
        const status: string | undefined = j?.data?.status;
        if (status === 'COMPLETED' && j.data.generated?.[0]) return { url: j.data.generated[0], providerRef: taskId };
        if (status === 'FAILED') throw new Error(`Magnific task ${taskId} failed`);
      }
      throw new Error(`Magnific task ${taskId} timed out`);
    },
  };
}
