// services/video/bunnyUpload.ts — browser → Bunny Stream upload over TUS (resumable, chunked), the
// Bunny counterpart of uploadVideoFileMux(). The server mints per-video signed headers
// (POST /api/video-host/bunny/uploads); the library key never reaches the browser.
//
// Not wired into the publish flows yet: callers switch over when the provider is flipped
// (GET /api/video-host/provider → 'bunny'). Until then everything keeps using Mux.

import type { TusUploadAuth } from '../bunnyStream/server';

export interface BunnyUploadTicket {
  videoId: string;
  tus: TusUploadAuth;
  playback: { hlsUrl: string; thumbnailUrl: string; previewUrl: string };
}

export interface BunnyVideoStatus {
  videoId: string;
  state: 'uploading' | 'processing' | 'ready' | 'errored';
  encodeProgress?: number;
  durationSec?: number;
  width?: number;
  height?: number;
  maxResolution?: number;
  hlsUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  mp4Url?: string;
}

type TokenFn = () => Promise<string>;

let providerCache: { provider: 'bunny' | 'mux'; cdnHost?: string; at: number } | null = null;

/** Which host new uploads should go to. Cached for a minute; any failure means Mux (today's default). */
export async function videoUploadProvider(): Promise<{ provider: 'bunny' | 'mux'; cdnHost?: string }> {
  if (providerCache && Date.now() - providerCache.at < 60_000) return providerCache;
  try {
    const r = await fetch('/api/video-host/provider');
    const j = r.ok ? await r.json() : null;
    providerCache = { provider: j?.provider === 'bunny' && j.cdnHost ? 'bunny' : 'mux', cdnHost: j?.cdnHost, at: Date.now() };
  } catch {
    providerCache = { provider: 'mux', at: Date.now() };
  }
  return providerCache;
}

export async function createBunnyUpload(token: TokenFn, title: string, trace?: string): Promise<BunnyUploadTicket> {
  const r = await fetch('/api/video-host/bunny/uploads', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.slice(0, 200), trace: (trace || '').slice(0, 255) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Could not start the upload'), { hostUnavailable: r.status === 503 });
  return j as BunnyUploadTicket;
}

/** Fresh signed headers for an interrupted upload of the SAME video (owner only). */
export async function resumeBunnyUpload(token: TokenFn, videoId: string): Promise<BunnyUploadTicket> {
  const r = await fetch(`/api/video-host/bunny/uploads/${encodeURIComponent(videoId)}/resume`, {
    method: 'POST', headers: { Authorization: `Bearer ${await token()}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Could not resume the upload');
  return j as BunnyUploadTicket;
}

/** Hosted-upload refs: a Mux direct-upload id, or "bunny:<guid>". Stored in the docs' muxUploadId field so
 *  every existing "still processing" check keeps working for both hosts. */
export const BUNNY_REF = 'bunny:';
export const isBunnyUploadRef = (ref: unknown): ref is string => typeof ref === 'string' && ref.startsWith(BUNNY_REF);
export const bunnyGuidOfRef = (ref: string) => ref.slice(BUNNY_REF.length);

/** True for a video that lives (or is landing) on Bunny — never re-ingest these into Mux. */
export const isOnBunny = (v: { bunnyVideoId?: unknown; videoHost?: unknown; muxUploadId?: unknown; url?: unknown } | null | undefined): boolean =>
  !!v && (!!v.bunnyVideoId || v.videoHost === 'bunny' || isBunnyUploadRef(v.muxUploadId)
    || (typeof v.url === 'string' && /^https:\/\/[^/]+\.b-cdn\.net\/[0-9a-f-]{36}\//i.test(v.url)));

export interface BunnyUploadHandle {
  done: Promise<void>;
  pause: () => void;
  resume: () => void;
  abort: () => Promise<void>;
}

/** Sends the file over TUS. Same ticket + same file resumes where it stopped (tus fingerprint in localStorage). */
export async function uploadToBunny(file: File, ticket: BunnyUploadTicket, onProgress?: (pct: number) => void): Promise<BunnyUploadHandle> {
  const tus = await import('tus-js-client');
  let upload: InstanceType<typeof tus.Upload>;
  const done = new Promise<void>((resolve, reject) => {
    upload = new tus.Upload(file, {
      endpoint: ticket.tus.endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000],
      chunkSize: 50 * 1024 * 1024,
      headers: { ...ticket.tus.headers },
      metadata: { filetype: file.type || 'video/mp4', title: file.name.replace(/\.[^.]+$/, '').slice(0, 200) },
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => onProgress?.(total ? Math.round((sent / total) * 100) : 0),
      onSuccess: () => resolve(),
      onError: err => reject(Object.assign(new Error(err?.message || 'Upload failed'), { resumable: true })),
    });
    upload.findPreviousUploads().then(prev => { if (prev.length) upload.resumeFromPreviousUpload(prev[0]); upload.start(); }, () => upload.start());
  });
  return {
    done,
    pause: () => { void upload.abort(false); },
    resume: () => upload.start(),
    abort: () => upload.abort(true),
  };
}

export async function getBunnyVideoStatus(token: TokenFn, videoId: string): Promise<BunnyVideoStatus | null> {
  const r = await fetch(`/api/video-host/bunny/videos/${encodeURIComponent(videoId)}`, { headers: { Authorization: `Bearer ${await token()}` } });
  return r.ok ? r.json() : null;
}

/** Polls until the video is playable (or failed). Encoding a feature film can take a while: default 45 min. */
export async function waitForBunnyReady(token: TokenFn, videoId: string, opts: { intervalMs?: number; timeoutMs?: number; onTick?: (s: BunnyVideoStatus) => void } = {}): Promise<BunnyVideoStatus> {
  const interval = opts.intervalMs ?? 5000;
  const deadline = Date.now() + (opts.timeoutMs ?? 45 * 60_000);
  for (;;) {
    const s = await getBunnyVideoStatus(token, videoId).catch(() => null);
    if (s) {
      opts.onTick?.(s);
      if (s.state === 'ready') return s;
      if (s.state === 'errored') throw new Error('Bunny could not process this video');
    }
    if (Date.now() > deadline) throw new Error('Timed out waiting for the video to finish processing');
    await new Promise(r => setTimeout(r, interval));
  }
}
