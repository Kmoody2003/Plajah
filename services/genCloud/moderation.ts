// services/genCloud/moderation.ts — prompt check before any credits are held. SERVER ONLY.
//
// Uses the platform's existing OpenAI omni-moderation call (free endpoint). Providers run their own
// filters on top. If moderation is unreachable the prompt is allowed and the miss is logged — the
// provider filters still apply. Anything scoring on sexual/minors is blocked at a very low threshold.

import type { AccountFacts } from './tiers';
import type { GenRequest } from './types';

type Scores = Record<string, number>;
export type Moderator = (input: { text: string }) => Promise<{ scores: Scores } | { error: string }>;

/** Pure decision on moderation scores. Exported for tests. */
export function judgePrompt(s: Scores, a: AccountFacts): { ok: true; reason?: undefined } | { ok: false; reason: string } {
  const v = (k: string) => Number(s[k] || 0);
  if (v('sexual/minors') > 0.05) return { ok: false, reason: 'This prompt can’t be generated.' };
  if (v('sexual') > (a.verifiedAdult && !a.restricted ? 0.9 : 0.4)) return { ok: false, reason: 'Explicit content can’t be generated here.' };
  if (v('self-harm/instructions') > 0.4 || v('illicit/violent') > 0.6 || v('hate/threatening') > 0.5 || v('harassment/threatening') > 0.6) {
    return { ok: false, reason: 'This prompt breaks the community rules.' };
  }
  if (a.restricted && v('violence/graphic') > 0.5) return { ok: false, reason: 'This prompt isn’t available on this account.' };
  return { ok: true };
}

export function promptModerator(moderate: Moderator) {
  return async (req: GenRequest, account: AccountFacts) => {
    const text = [req.prompt, req.text].filter(Boolean).join('\n').slice(0, 4000);
    if (!text.trim()) return { ok: true as const };
    const r = await moderate({ text }).catch(e => ({ error: String(e?.message || e) }));
    if ('error' in r) { console.warn('[genCloud] moderation unavailable:', r.error); return { ok: true as const }; }
    return judgePrompt(r.scores, account);
  };
}
