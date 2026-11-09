// services/drive/client.ts — the browser side of Plajah Drive: API calls + the upload engine.
// Small files go up in one signed PUT; big ones in 64 MiB parts, 4 at a time, each part retried
// up to 3 times, so a dropped connection costs one part, not the whole file. Bytes go straight
// from the browser to B2 — never through our server.

export type DriveScope = { kind: 'u' } | { kind: 'o'; orgId: string; departmentId?: string };

export interface DriveItem {
  id: string; kind: 'file' | 'folder'; name: string; parentId: string | null; departmentId: string | null;
  size: number; mime: string | null; createdAt: number; updatedAt: number; trashedAt: number | null;
  purgeAt: number | null; uploadedBy: string | null; scan: string | null;
}

export interface DriveUsage {
  allowance: number; liveBytes: number; trashBytes: number; reservedBytes: number;
  state: { state: 'ok' | 'warn' | 'grace' | 'blocked'; used?: number; graceEndsAt?: number } | string;
}

export interface DriveApi {
  usage(org?: string): Promise<DriveUsage>;
  list(org: string | undefined, parent: string | null, trash?: boolean): Promise<{ items: DriveItem[]; path: Array<{ id: string; name: string }> }>;
  createFolder(org: string | undefined, name: string, parentId: string | null): Promise<DriveItem>;
  update(org: string | undefined, id: string, patch: { name?: string; parentId?: string | null }): Promise<DriveItem>;
  trash(org: string | undefined, id: string): Promise<{ count: number; bytes: number }>;
  restore(org: string | undefined, id: string): Promise<{ count: number; bytes: number }>;
  deleteForever(org: string | undefined, id: string): Promise<{ count: number; bytes: number }>;
  downloadUrl(org: string | undefined, id: string, inline?: boolean): Promise<string>;
  upload(scope: DriveScope, file: File, parentId: string | null, onProgress: (sent: number) => void, signal: AbortSignal): Promise<DriveItem>;
}

export class DriveApiError extends Error {
  constructor(msg: string, public status: number, public code?: string) { super(msg); }
}

const PARALLEL = 4;
const RETRIES = 3;

/** PUT a blob with progress. Resolves with the ETag header (B2 must expose it via CORS). */
function put(url: string, body: Blob, headers: Record<string, string>, onProgress: (n: number) => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = e => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve(xhr.getResponseHeader('ETag') ?? '')
      : reject(new DriveApiError(`Storage refused the upload (${xhr.status}).`, xhr.status)));
    xhr.onerror = () => reject(new DriveApiError('Network error while uploading.', 0));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

export function createDriveApi(opts: { apiBase?: string; getToken: () => Promise<string | null> }): DriveApi {
  const base = `${opts.apiBase ?? ''}/api/drive`;
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await opts.getToken();
    if (!token) throw new DriveApiError('Sign in to use Drive.', 401);
    const r = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new DriveApiError(j.error ?? `HTTP ${r.status}`, r.status, j.code);
    return j as T;
  }
  const q = (o: Record<string, string | undefined | null>) => {
    const s = Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
    return s ? `?${s}` : '';
  };

  return {
    usage: org => call('GET', `/usage${q({ org })}`),
    list: (org, parent, trash) => call('GET', `/items${q({ org, parent, trash: trash ? '1' : null })}`),
    createFolder: async (org, name, parentId) => (await call<{ folder: DriveItem }>('POST', '/folders', { org, name, parentId })).folder,
    update: async (org, id, patch) => (await call<{ item: DriveItem }>('PATCH', `/items/${id}`, { org, ...patch })).item,
    trash: (org, id) => call('POST', `/items/${id}/trash`, { org }),
    restore: (org, id) => call('POST', `/items/${id}/restore`, { org }),
    deleteForever: (org, id) => call('DELETE', `/items/${id}${q({ org })}`),
    downloadUrl: async (org, id, inline) => (await call<{ url: string }>('GET', `/items/${id}/download${q({ org, inline: inline ? '1' : null })}`)).url,

    async upload(scope, file, parentId, onProgress, signal) {
      const begin = await call<any>('POST', '/uploads', {
        scope, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', ...(parentId ? { parentId } : {}),
      });
      const abort = () => { void call('DELETE', `/uploads/${begin.uploadId}`).catch(() => {}); };
      try {
        if (begin.mode === 'single') {
          await put(begin.url, file, begin.headers, onProgress, signal);
        } else {
          const sent = new Array<number>(begin.parts).fill(0);
          const report = () => onProgress(sent.reduce((a, b) => a + b, 0));
          const etags: Array<{ partNumber: number; etag: string }> = [];
          const queue = Array.from({ length: begin.parts }, (_, i) => i + 1);
          const urls = new Map<number, string>();
          const sign = async (nums: number[]) => {
            const r = await call<{ parts: Array<{ partNumber: number; url: string }> }>('POST', `/uploads/${begin.uploadId}/parts`, { partNumbers: nums });
            for (const p of r.parts) urls.set(p.partNumber, p.url);
          };
          const worker = async () => {
            for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
              if (signal.aborted) throw new DOMException('Upload cancelled', 'AbortError');
              const blob = file.slice((n - 1) * begin.partSize, Math.min(file.size, n * begin.partSize));
              for (let attempt = 1; ; attempt++) {
                if (!urls.has(n)) await sign(queue.slice(0, 99).concat(n));
                try {
                  const etag = await put(urls.get(n)!, blob, {}, b => { sent[n - 1] = b; report(); }, signal);
                  if (!etag) throw new DriveApiError('Storage didn’t confirm a part (ETag hidden by CORS).', 0, 'no_etag');
                  etags.push({ partNumber: n, etag });
                  break;
                } catch (e: any) {
                  if (e?.name === 'AbortError' || e?.code === 'no_etag' || attempt >= RETRIES) throw e;
                  sent[n - 1] = 0; urls.delete(n); // links can expire; re-sign on retry
                  await new Promise(r => setTimeout(r, 800 * attempt));
                }
              }
            }
          };
          await Promise.all(Array.from({ length: Math.min(PARALLEL, begin.parts) }, worker));
          etags.sort((a, b) => a.partNumber - b.partNumber);
          (begin as any).doneParts = etags;
        }
        const done = await call<{ file: any }>('POST', `/uploads/${begin.uploadId}/complete`, begin.mode === 'multipart' ? { parts: (begin as any).doneParts } : {});
        const f = done.file;
        return { id: f.id, kind: 'file', name: f.name, parentId: f.parentId ?? null, departmentId: f.departmentId ?? null, size: f.size, mime: f.mime,
          createdAt: f.createdAt, updatedAt: f.updatedAt, trashedAt: null, purgeAt: null, uploadedBy: f.uploadedBy, scan: f.scan } as DriveItem;
      } catch (e) {
        abort();
        throw e;
      }
    },
  };
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
