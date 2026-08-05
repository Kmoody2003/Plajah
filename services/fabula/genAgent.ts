// genAgent — Fabula's client for the generation agent: a prompt in Fabula → an agent that runs a
// job on an external creative service using the USER'S OWN linked account → results that land back
// in the project's bins. The agent itself is a cloud service (Cloud Run, same `/api/*` convention as
// Crossover); this file is only the browser client + the local job mirror.
//
// Connect model (hybrid): a service with an official API is driven by API (fast, reliable); a service
// without one is driven by headless UI-navigation (Playwright/computer-use) against the user's logged-in
// session. Either way the user LINKS THEIR EXISTING ACCOUNT once (OAuth/session capture, MCP-style) and
// the agent acts as them — no shared keys, per-user, revocable.
//
// Results are written by the agent to cloud storage; when a job completes, the client pulls the result
// URLs and the caller imports them into a target bin — "populating bins headless", the watch-folder way.
//
// Until the backend is deployed the client degrades gracefully: `health()` reports offline and the UI
// explains, rather than throwing. Jobs are mirrored in IndexedDB so status survives reloads.

import { get as idbGet, set as idbSet } from 'idb-keyval';
import { getOptionalIdToken } from '../backendService';

const API = '/api/genagent';

export type GenKind = 'image' | 'video';
export type ConnectMode = 'api' | 'ui' | 'hybrid';

export interface Connector {
  id: string;              // 'kling' | 'magnific' | …
  name: string;            // display
  kind: GenKind;           // what it produces
  connectMode: ConnectMode;
  blurb: string;           // one-line "what it's good at"
  connected?: boolean;     // user's account linked (filled by /connectors)
}

export interface GenJob {
  id: string;
  provider: string;
  kind: GenKind;
  prompt: string;
  params?: Record<string, any>;
  projectId: string;
  bin: string;             // target bin the results should land in
  status: 'queued' | 'running' | 'done' | 'error' | 'backend-offline';
  progress?: number;       // 0..1
  results?: { url: string; name: string; mime: string }[];
  error?: string;
  createdAt: number;
}

// The connectors we intend to support. The backend overrides `connected` per user; this static list
// lets the panel render (and explain "connect your account") before the backend is even reachable.
export const CONNECTORS: Connector[] = [
  { id: 'kling',    name: 'Kling',    kind: 'video', connectMode: 'hybrid', blurb: 'Cinematic text/image→video, strong motion' },
  { id: 'magnific', name: 'Magnific', kind: 'image', connectMode: 'hybrid', blurb: 'Upscale + reimagine stills at extreme detail' },
];

async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const tok = await getOptionalIdToken().catch(() => null);
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}

// ── backend availability ──────────────────────────────────────────────────────
let _healthy: boolean | null = null;
export async function health(): Promise<boolean> {
  if (_healthy != null) return _healthy;
  try {
    const res = await fetch(`${API}/health`, { method: 'GET' });
    // Require a genuine JSON ack — a dev-server SPA fallback returns 200 text/html, which must
    // NOT read as "agent online".
    const ct = res.headers.get('content-type') || '';
    _healthy = res.ok && ct.includes('application/json') && !!(await res.json().catch(() => null))?.ok;
  } catch { _healthy = false; }
  return _healthy;
}

// ── connectors + account linking ────────────────────────────────────────────────
export async function listConnectors(): Promise<Connector[]> {
  try {
    const res = await fetch(`${API}/connectors`, { method: 'POST', headers: await authHeaders(), body: '{}' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.connectors) && data.connectors.length) return data.connectors as Connector[];
    }
  } catch { /* backend offline → fall back to the static list */ }
  return CONNECTORS.map((c) => ({ ...c }));
}

/** Begin linking the user's account for a provider. Returns an auth URL to open (OAuth/session
 *  capture), or a status if already connected. Throws only on a definite backend error. */
export async function connectAccount(provider: string): Promise<{ authUrl?: string; connected?: boolean }> {
  const res = await fetch(`${API}/connect`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ provider }) });
  if (!res.ok) throw new Error(`Couldn't start linking ${provider} (${res.status}).`);
  return res.json();
}

// ── jobs ────────────────────────────────────────────────────────────────────────
const jobsKey = (projectId: string) => `fabula:genJobs:${projectId}`;
async function loadLocal(projectId: string): Promise<GenJob[]> { return (await idbGet(jobsKey(projectId))) || []; }
async function saveLocal(projectId: string, jobs: GenJob[]) { await idbSet(jobsKey(projectId), jobs); }
async function upsertLocal(job: GenJob) {
  const jobs = await loadLocal(job.projectId);
  const i = jobs.findIndex((j) => j.id === job.id);
  if (i >= 0) jobs[i] = job; else jobs.unshift(job);
  await saveLocal(job.projectId, jobs.slice(0, 100));
}

export async function listJobs(projectId: string): Promise<GenJob[]> {
  // local mirror first (instant), reconciled with the server when reachable
  const local = await loadLocal(projectId);
  try {
    const res = await fetch(`${API}/jobs?projectId=${encodeURIComponent(projectId)}`, { method: 'GET', headers: await authHeaders() });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.jobs)) { await saveLocal(projectId, data.jobs); return data.jobs as GenJob[]; }
    }
  } catch { /* offline → local only */ }
  return local;
}

/** Submit a generation job. Persisted locally immediately; if the backend is unreachable the job is
 *  marked 'backend-offline' so the panel can explain instead of silently failing. */
export async function submitJob(input: {
  provider: string; kind: GenKind; prompt: string; params?: Record<string, any>; projectId: string; bin: string;
}): Promise<GenJob> {
  const base: GenJob = {
    id: `gj_${Date.now().toString(36)}_${Math.floor(performance.now()).toString(36)}`,
    provider: input.provider, kind: input.kind, prompt: input.prompt, params: input.params,
    projectId: input.projectId, bin: input.bin, status: 'queued', createdAt: Date.now(),
  };
  try {
    const res = await fetch(`${API}/jobs`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify(input) });
    if (res.ok) {
      const data = await res.json();
      const job: GenJob = { ...base, id: data.jobId || base.id, status: data.status || 'queued' };
      await upsertLocal(job); return job;
    }
    if (res.status === 401) { const j = { ...base, status: 'error' as const, error: 'Sign in to generate.' }; await upsertLocal(j); return j; }
    const j = { ...base, status: 'error' as const, error: `Job rejected (${res.status}).` }; await upsertLocal(j); return j;
  } catch {
    const j = { ...base, status: 'backend-offline' as const, error: 'Generation agent isn’t connected yet.' };
    await upsertLocal(j); return j;
  }
}

/** Poll a single job's status; updates the local mirror. Returns null if unreachable. */
export async function pollJob(projectId: string, jobId: string): Promise<GenJob | null> {
  try {
    const res = await fetch(`${API}/jobs/${encodeURIComponent(jobId)}`, { method: 'GET', headers: await authHeaders() });
    if (!res.ok) return null;
    const job = (await res.json()) as GenJob;
    await upsertLocal({ ...job, projectId });
    return job;
  } catch { return null; }
}

/** Map a result mime to a Fabula pool asset type. */
export function assetTypeForMime(mime: string): 'video' | 'image' | 'audio' {
  if (mime.startsWith('video')) return 'video';
  if (mime.startsWith('audio')) return 'audio';
  return 'image';
}
