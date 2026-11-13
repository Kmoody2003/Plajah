// localAceStep — music generation on the user's OWN machine.
//
// The music lab (routes/musicLab.ts) is admin-only because it runs engines on the platform's server:
// one job at a time, no per-user quota or billing, and two of its engines ship non-commercial weights.
// None of that applies when someone has downloaded an open model and is running it themselves. This
// client talks straight from the browser to an ACE-Step server (MIT) on their computer — no platform
// compute, no admin gate, nothing uploaded — using the same task protocol the lab uses.
//
// The address is a per-device setting. A page served over HTTPS may call http://127.0.0.1 (browsers
// treat loopback as secure), but the local server has to allow cross-origin requests.

import { aceStepAudioUrl, aceStepTaskId, buildAceStepTask } from './aceStepProtocol';
import type { GenerationRequest } from './types';

export const LOCAL_ACE_STEP_DEFAULT_URL = 'http://127.0.0.1:8001';
const KEY = 'plajah:localAceStepUrl';
const MAX_AUDIO_BYTES = 50_000_000;

/** Only loopback and private-network addresses are accepted: this setting points at the user's own
 *  machine or LAN, never at an arbitrary host a pasted value could send their prompts to. */
export function normalizeLocalEngineUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const h = u.hostname;
    const local = h === 'localhost' || h === '[::1]' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith('.local');
    return local ? u.origin : null;
  } catch { return null; }
}

export function getLocalAceStepUrl(): string {
  try { return normalizeLocalEngineUrl(localStorage.getItem(KEY) || '') || LOCAL_ACE_STEP_DEFAULT_URL; } catch { return LOCAL_ACE_STEP_DEFAULT_URL; }
}
export function setLocalAceStepUrl(raw: string): string {
  const url = normalizeLocalEngineUrl(raw);
  if (!url) throw new Error('Use the address of an engine on this computer or your local network, like http://127.0.0.1:8001.');
  try { localStorage.setItem(KEY, url); } catch { /* setting is a convenience */ }
  return url;
}

/** Is an ACE-Step server answering at this address? Short timeout — it's asked before every cue. */
export async function localAceStepAvailable(baseUrl = getLocalAceStepUrl(), fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(new URL('/health', baseUrl), { method: 'GET', signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch { return false; }
}

export interface LocalMusicResult { audio: Blob; mime: string; seconds: number; warning?: string }

/** Generate on the local engine and return the audio. Throws with a reason a person can act on. */
export async function runLocalAceStep(
  request: Omit<GenerationRequest, 'engine' | 'bars'> & { engine?: 'ace-step' | 'ace-step-2.5'; bars?: number },
  opts: { baseUrl?: string; signal?: AbortSignal; progress?: (text: string) => void; pollMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<LocalMusicResult> {
  const baseUrl = opts.baseUrl || getLocalAceStepUrl();
  const f = opts.fetchImpl || fetch;
  const post = async (route: string, data: unknown) => {
    let res: Response;
    try { res = await f(new URL(route, baseUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: opts.signal }); }
    catch (e) {
      if (opts.signal?.aborted) throw new Error('Cancelled');
      throw new Error(`Couldn't reach the music engine at ${baseUrl}. Check that it is running and allows requests from this site.`);
    }
    if (!res.ok) throw new Error(`The local music engine refused the request (HTTP ${res.status}).`);
    const json = await res.json();
    if (json.error || (typeof json.code === 'number' && json.code !== 200)) throw new Error('The local music engine rejected the request — check its log.');
    return json;
  };

  opts.progress?.('Sending the cue to your music engine…');
  const full = { engine: 'ace-step' as const, ...request };
  const taskId = aceStepTaskId(await post('/release_task', buildAceStepTask(full)));
  opts.progress?.('Generating on your machine…');
  for (;;) {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, opts.pollMs ?? 1500);
      opts.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('Cancelled')); }, { once: true });
    });
    const url = aceStepAudioUrl(await post('/query_result', { task_id_list: [taskId] }), taskId, baseUrl);
    if (!url) continue;
    opts.progress?.('Receiving the audio…');
    const res = await f(url, { signal: opts.signal });
    if (!res.ok) throw new Error(`The local music engine didn't return the audio (HTTP ${res.status}).`);
    const audio = await res.blob();
    if (!audio.size) throw new Error('The local music engine returned an empty file.');
    if (audio.size > MAX_AUDIO_BYTES) throw new Error('The generated file is larger than a cue should be — not importing it.');
    const asked = Math.round(request.seconds);
    return {
      audio: audio.type ? audio : new Blob([audio], { type: 'audio/wav' }), mime: 'audio/wav', seconds: Math.max(10, asked),
      warning: asked < 10 ? `This engine generates at least 10 seconds; the cue is longer than the ${asked}s it sits under — trim it in the timeline.` : undefined,
    };
  }
}
