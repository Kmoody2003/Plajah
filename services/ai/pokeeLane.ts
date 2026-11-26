/**
 * Pokee lane — the platform's default TEXT model (owner decision 2026-11-26: cheaper than Gemini for
 * text; Claude is too expensive site-wide). Gemini keeps image/audio/video work and is the fallback.
 *
 * Pokee is OpenAI-compatible: POST https://api.pokee.ai/v1/chat/completions with a Bearer key.
 * Prices read from GET /v1/models on 2026-11-26 (USD per 1M tokens):
 *   pokee-glm-5.3-flash  in 0.055 · out 0.20   text + image   ← default text model
 *   pokee-isaac          in 0.07  · out 0.30   text only, 10M-token context (manuscripts, corpora)
 *
 * A breaker skips Pokee for a while after it refuses for billing (402) or auth (401/403), so an empty
 * account costs one failed call per window instead of adding latency to every request.
 */

export const POKEE_URL = 'https://api.pokee.ai/v1/chat/completions';
export const POKEE_DEFAULT_TEXT_MODEL = 'pokee-glm-5.3-flash';

export const pokeeKey = () => process.env.POKEE_API_KEY || '';
export const pokeeConfigured = () => !!pokeeKey();

const BREAKER_MS = 10 * 60_000;
let pokeeDownUntil = 0;
let pokeeDownReason = '';

/** True when Pokee should be tried now (configured, not switched off, breaker closed). */
export function pokeeAvailable(now = Date.now()): boolean {
  if (!pokeeConfigured()) return false;
  if ((process.env.AI_TEXT_PROVIDER || '').toLowerCase() === 'gemini') return false;
  return now >= pokeeDownUntil;
}

export function pokeeStatus() {
  return { configured: pokeeConfigured(), available: pokeeAvailable(), downUntil: pokeeDownUntil || null, reason: pokeeDownReason || null };
}

/** Exported for tests. */
export function _resetPokeeBreaker() { pokeeDownUntil = 0; pokeeDownReason = ''; }

export class PokeeError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export interface PokeeMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface PokeeResult { text: string; model: string; inTokens: number; outTokens: number }

export async function pokeeChat(o: {
  model?: string; messages: PokeeMessage[]; maxTokens?: number; temperature?: number; json?: boolean; timeoutMs?: number;
}, f: typeof fetch = fetch): Promise<PokeeResult> {
  const key = pokeeKey();
  if (!key) throw new PokeeError('pokee: not configured', 0);
  const model = o.model || process.env.POKEE_TEXT_MODEL || POKEE_DEFAULT_TEXT_MODEL;
  const body: Record<string, unknown> = {
    model, messages: o.messages, max_tokens: o.maxTokens ?? 1000, temperature: o.temperature ?? 0.3,
  };
  if (o.json) body.response_format = { type: 'json_object' };
  let res: Response;
  try {
    res = await f(POKEE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(o.timeoutMs ?? 90_000),
    });
  } catch (e: any) {
    throw new PokeeError(`pokee: ${e?.name === 'TimeoutError' ? 'timeout' : 'network'}`, 0);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    if ([401, 402, 403].includes(res.status)) {
      pokeeDownUntil = Date.now() + BREAKER_MS;
      pokeeDownReason = `${res.status} ${detail}`;
      console.warn(`[pokee] off for ${BREAKER_MS / 60_000} min: ${res.status} ${detail}`);
    }
    throw new PokeeError(`pokee ${res.status}: ${detail}`, res.status);
  }
  const j = await res.json() as any;
  const msg = j?.choices?.[0]?.message;
  const text = typeof msg?.content === 'string' ? msg.content.trim() : '';
  if (!text) throw new PokeeError('pokee: empty answer', 200);
  return {
    text, model: String(j?.model || model),
    inTokens: Number(j?.usage?.prompt_tokens) || 0,
    outTokens: Number(j?.usage?.completion_tokens) || 0,
  };
}
