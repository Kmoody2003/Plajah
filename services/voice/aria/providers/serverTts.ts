import type { SpeakOptions, SpeakResult, VoiceProfile, VoiceProvider, WordMark } from '../types';
import { estimateMarks } from '../text';

/**
 * Client for a FUTURE server route:  POST /api/voice/speak  { text, profileId, speed } -> { audioUrl, marks[] }
 * The server route does not exist yet. A 404/501 (or network failure) marks this provider unavailable for a
 * cool-down window so the cascade falls through to on-device voices without hammering the server.
 * No secrets live here: auth, if any, is the server's job (same-origin credentials only).
 */

const ENDPOINT = '/api/voice/speak';
const COOLDOWN_MS = 10 * 60 * 1000;

export function createServerTtsProvider(fetchImpl?: typeof fetch, endpoint = ENDPOINT, now: () => number = Date.now): VoiceProvider {
  let downUntil = 0;
  let ctrl: AbortController | null = null;
  const doFetch = (): typeof fetch | undefined => fetchImpl ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined);

  return {
    id: 'serverTts',
    label: 'Aria server voice',
    kind: 'server',
    async available() {
      if (!doFetch()) return false;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
      return now() >= downUntil;
    },
    async synth(text: string, profile: VoiceProfile, opts: SpeakOptions = {}): Promise<SpeakResult> {
      const f = doFetch();
      if (!f) throw new Error('serverTts: no fetch');
      ctrl = new AbortController();
      const mine = ctrl;
      opts.signal?.addEventListener('abort', () => mine.abort(), { once: true });
      let res: Response;
      try {
        res = await f(endpoint, {
          method: 'POST', credentials: 'same-origin', signal: mine.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, profileId: profile.id, speed: (profile.rate || 1) * (opts.speed ?? 1) }),
        });
      } catch (e) { if (!mine.signal.aborted) downUntil = now() + 60_000; throw e; }
      if (res.status === 404 || res.status === 501) { downUntil = now() + COOLDOWN_MS; throw new Error(`serverTts: route unavailable (${res.status})`); }
      if (!res.ok) { downUntil = now() + 60_000; throw new Error(`serverTts: HTTP ${res.status}`); }
      const j: any = await res.json();
      if (!j?.audioUrl || typeof j.audioUrl !== 'string') throw new Error('serverTts: no audioUrl');
      const marks: WordMark[] = Array.isArray(j.marks) ? j.marks : [];
      const durationMs = Number(j.durationMs) || (marks.length ? marks[marks.length - 1].endMs : Math.round(text.length * 70));
      return { audio: j.audioUrl, marks: marks.length ? marks : estimateMarks(text, durationMs), durationMs, provider: 'serverTts', cached: !!j.cached };
    },
    cancel() { try { ctrl?.abort(); } catch { /* ignore */ } },
  };
}

export const serverTtsProvider = createServerTtsProvider();
