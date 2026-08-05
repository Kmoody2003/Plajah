import type {
  ConvertProgress,
  ConvertResult,
  MediaProbe,
  Recipe,
  SourceFile,
} from './types';
import type { BackendEngine } from './engine';
import { extFor } from './formats';
import { getOptionalIdToken } from '../backendService';

// ─────────────────────────────────────────────────────────────────────────
// Server backend — real ffmpeg on the Cloud Run service (`plajah-api`), reached
// same-origin via /api/crossover/* (Firebase Hosting rewrites → Cloud Run, the
// same convention every other Plajah backend call uses).
//
// Transport: the input is sent as the RAW request body (no multipart/multer),
// with the recipe/name/kind carried in headers; the converted file streams
// straight back as the response. Consumers that already have a Storage URL send
// an empty body + X-Crossover-Url instead.
// ─────────────────────────────────────────────────────────────────────────

const API = '/api/crossover';

export class ServerEngine implements BackendEngine {
  readonly backend = 'server' as const;

  available(): boolean {
    return true;
  }

  async probe(source: SourceFile): Promise<MediaProbe> {
    const res = await fetch(`${API}/probe`, {
      method: 'POST',
      headers: await baseHeaders(source),
      body: bodyFor(source),
    });
    if (res.status === 401) throw new Error('Sign in to use the Crossover cloud.');
    if (!res.ok) throw new Error(`Probe failed (${res.status}): ${await safeText(res)}`);
    return { warnings: [], ...(await res.json()) } as MediaProbe;
  }

  async convert(
    source: SourceFile,
    recipe: Recipe,
    onProgress: (p: ConvertProgress) => void,
    signal?: AbortSignal,
  ): Promise<ConvertResult> {
    const headers = await baseHeaders(source);
    headers['X-Crossover-Recipe'] = encodeURIComponent(JSON.stringify(recipe));

    // A single request can't stream ffmpeg progress; show a gentle ramp meanwhile.
    onProgress({ progress: 0.05 });
    const stop = ramp(onProgress, signal);
    let res: Response;
    try {
      res = await fetch(`${API}/convert`, { method: 'POST', headers, body: bodyFor(source), signal });
    } finally {
      stop();
    }
    if (res.status === 401) throw new Error('Sign in to convert on the Crossover cloud.');
    if (res.status === 429) throw new Error('LIMIT_REACHED');
    if (!res.ok) throw new Error(`Conversion failed (${res.status}): ${await safeText(res)}`);

    const blob = await res.blob();
    const ext = extFor(recipe, source.kind);
    const outputName =
      filenameFromDisposition(res.headers.get('content-disposition')) ||
      source.name.replace(/\.[^.]+$/, '') + '.' + ext;
    onProgress({ progress: 1 });
    return {
      outputUrl: URL.createObjectURL(blob),
      outputName,
      backend: 'server',
      sizeBytes: blob.size,
      blob,
    };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

async function baseHeaders(source: SourceFile): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'X-Crossover-Kind': source.kind,
    'X-Crossover-Name': encodeURIComponent(source.name),
  };
  if (!source.file && source.url) h['X-Crossover-Url'] = source.url;
  const token = await getOptionalIdToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function bodyFor(source: SourceFile): BodyInit {
  if (source.file) return source.file;
  return new Uint8Array(); // url case: server fetches X-Crossover-Url
}

/** Smoothly advance progress toward ~0.9 while the request is in flight. */
function ramp(onProgress: (p: ConvertProgress) => void, signal?: AbortSignal): () => void {
  let p = 0.05;
  const id = setInterval(() => {
    if (signal?.aborted) return;
    p = Math.min(0.9, p + (0.9 - p) * 0.08);
    onProgress({ progress: p });
  }, 400);
  return () => clearInterval(id);
}

function filenameFromDisposition(cd: string | null): string | undefined {
  if (!cd) return undefined;
  const m = /filename\*?=(?:UTF-8'')?"?([^;"]+)"?/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : undefined;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}
