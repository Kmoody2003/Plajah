/**
 * Camera sources for the Plajah Home hub (server side).
 *
 *  · 'rtsp'      — an RTSP URL (credentials included, e.g. rtsp://user:pass@192.168.7.250:554/live0).
 *                  Snapshots are one frame grabbed with ffmpeg (must be on PATH, or PLAJAH_FFMPEG).
 *  · 'http-jpeg' — a camera's own still-image URL (optionally with basic-auth credentials in it).
 *
 * URLs live only on disk (hubStorage → %USERPROFILE%\.plajah-home\cameras.json) and are never sent
 * to clients; clients get /api/home/cameras/:id/snapshot. No camera, no image: nothing is faked.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { readHubJson, writeHubJson } from './hubStorage';

export type CameraKind = 'rtsp' | 'http-jpeg';
interface StoredCamera { id: string; name: string; kind: CameraKind; url: string; room?: string; addedAt: string }

export interface CameraInfo {
  id: string;
  name: string;
  kind: CameraKind;
  room?: string;
  /** host:port only — credentials and path are never exposed */
  host: string;
  /** last snapshot outcome */
  available: boolean | null;
  lastSnapshotAt?: number;
  lastError?: string;
}

export class CameraError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.name = 'CameraError'; this.status = status; }
}

const FILE = 'cameras.json';
const FFMPEG = process.env.PLAJAH_FFMPEG || 'ffmpeg';
const load = (): StoredCamera[] => readHubJson<StoredCamera[]>(FILE, []).filter(c => c && c.id && c.url);
const save = (list: StoredCamera[]) => writeHubJson(FILE, list);

const health = new Map<string, { available: boolean; at: number; error?: string }>();
const cache = new Map<string, { jpeg: Buffer; at: number }>();
const inflight = new Map<string, Promise<Buffer>>();

function hostOf(url: string): string {
  try { const u = new URL(url); return u.port ? `${u.hostname}:${u.port}` : u.hostname; } catch { return '?'; }
}

function validate(kind: CameraKind, url: string): URL {
  let u: URL;
  try { u = new URL(url); } catch { throw new CameraError('That is not a valid URL'); }
  if (kind === 'rtsp' && u.protocol !== 'rtsp:' && u.protocol !== 'rtsps:') throw new CameraError('RTSP URLs start with rtsp://');
  if (kind === 'http-jpeg' && u.protocol !== 'http:' && u.protocol !== 'https:') throw new CameraError('Snapshot URLs start with http:// or https://');
  return u;
}

const toInfo = (c: StoredCamera): CameraInfo => {
  const h = health.get(c.id);
  return { id: c.id, name: c.name, kind: c.kind, room: c.room, host: hostOf(c.url), available: h ? h.available : null, lastSnapshotAt: h?.at, lastError: h?.error };
};

export function listCameras(): CameraInfo[] { return load().map(toInfo); }

export function addCamera(input: { name: string; url: string; kind?: CameraKind; room?: string }): CameraInfo {
  const kind: CameraKind = input.kind || (String(input.url).startsWith('rtsp') ? 'rtsp' : 'http-jpeg');
  validate(kind, String(input.url || '').trim());
  const name = String(input.name || '').trim().slice(0, 60) || `Camera ${hostOf(input.url)}`;
  const cam: StoredCamera = { id: crypto.randomBytes(5).toString('hex'), name, kind, url: String(input.url).trim(), room: input.room?.trim() || undefined, addedAt: new Date().toISOString() };
  save([...load(), cam]);
  return toInfo(cam);
}

export function removeCamera(id: string): boolean {
  const list = load();
  const next = list.filter(c => c.id !== id);
  if (next.length === list.length) return false;
  save(next);
  cache.delete(id); health.delete(id);
  return true;
}

let ffmpegCheck: { ok: boolean; version?: string; at: number } | null = null;
export async function ffmpegStatus(): Promise<{ ok: boolean; version?: string; binary: string }> {
  if (ffmpegCheck && Date.now() - ffmpegCheck.at < 60_000) return { ok: ffmpegCheck.ok, version: ffmpegCheck.version, binary: FFMPEG };
  // The Android TV hub (nodejs-mobile) cannot spawn processes; only an explicit PLAJAH_FFMPEG is tried.
  if (process.env.PLAJAH_HUB_PLATFORM === 'android' && !process.env.PLAJAH_FFMPEG) return { ok: false, binary: FFMPEG };
  const res = await new Promise<{ ok: boolean; version?: string }>(resolve => {
    let out = '';
    try {
      const p = spawn(FFMPEG, ['-hide_banner', '-version'], { windowsHide: true });
      p.stdout.on('data', d => { out += d; });
      p.on('error', () => resolve({ ok: false }));
      p.on('close', code => resolve(code === 0 ? { ok: true, version: out.split('\n')[0]?.trim() } : { ok: false }));
    } catch { resolve({ ok: false }); }
  });
  ffmpegCheck = { ...res, at: Date.now() };
  return { ...res, binary: FFMPEG };
}

function grabRtsp(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (process.env.PLAJAH_HUB_PLATFORM === 'android' && !process.env.PLAJAH_FFMPEG) { reject(new CameraError('RTSP snapshots need ffmpeg, which the TV hub does not have. Use a camera snapshot (http) URL, or run the hub on a PC.', 503)); return; }
    const args = ['-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp', '-timeout', '8000000', '-i', url, '-frames:v', '1', '-q:v', '5', '-f', 'image2', '-vcodec', 'mjpeg', 'pipe:1'];
    let p;
    try { p = spawn(FFMPEG, args, { windowsHide: true }); } catch (e: any) { reject(new CameraError(`ffmpeg could not start: ${e?.message}`, 503)); return; }
    const chunks: Buffer[] = [];
    let err = '';
    const kill = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } }, 12_000);
    p.stdout.on('data', (d: Buffer) => chunks.push(d));
    p.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    p.on('error', (e: any) => { clearTimeout(kill); reject(new CameraError(e?.code === 'ENOENT' ? 'ffmpeg is not installed on the hub PC (install it and make sure it is on PATH, or set PLAJAH_FFMPEG)' : `ffmpeg failed: ${e?.message}`, 503)); });
    p.on('close', code => {
      clearTimeout(kill);
      const jpeg = Buffer.concat(chunks);
      if (code === 0 && jpeg.length > 100) resolve(jpeg);
      else {
        // Never echo the URL (it carries credentials).
        const msg = err.replace(/rtsps?:\/\/\S+/g, '<camera>').trim().split('\n').pop() || `exit code ${code}`;
        reject(new CameraError(/401|Unauthorized/i.test(msg) ? 'Camera rejected the RTSP username/password' : /404|not found/i.test(msg) ? 'Camera has no stream at that RTSP path (is RTSP enabled in the camera app?)' : `Could not read a frame: ${msg}`, 502));
      }
    });
  });
}

async function grabHttp(url: string): Promise<Buffer> {
  const u = new URL(url);
  const headers: Record<string, string> = {};
  if (u.username || u.password) {
    headers.Authorization = 'Basic ' + Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64');
    u.username = ''; u.password = '';
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(u, { headers, signal: ctrl.signal });
    if (!res.ok) throw new CameraError(`Camera answered HTTP ${res.status}`, 502);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new CameraError('Camera did not return a JPEG', 502);
    return buf;
  } catch (e: any) {
    if (e instanceof CameraError) throw e;
    throw new CameraError(e?.name === 'AbortError' ? 'Camera did not answer in time' : `Cannot reach camera: ${e?.message}`, 504);
  } finally { clearTimeout(t); }
}

/** A fresh JPEG (at most `maxAgeMs` old). Concurrent callers share one grab. */
export async function snapshot(id: string, maxAgeMs = 1500): Promise<{ jpeg: Buffer; at: number }> {
  const cam = load().find(c => c.id === id);
  if (!cam) throw new CameraError('Unknown camera', 404);
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at <= maxAgeMs) return hit;
  let p = inflight.get(id);
  if (!p) {
    p = (cam.kind === 'rtsp' ? grabRtsp(cam.url) : grabHttp(cam.url));
    inflight.set(id, p);
    p.finally(() => inflight.delete(id)).catch(() => {});
  }
  try {
    const jpeg = await p;
    const entry = { jpeg, at: Date.now() };
    cache.set(id, entry);
    health.set(id, { available: true, at: entry.at });
    return entry;
  } catch (e: any) {
    health.set(id, { available: false, at: Date.now(), error: e?.message });
    throw e;
  }
}
