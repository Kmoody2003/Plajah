// ─── Lyric Translation (Chora) ────────────────────────────────────────────────
// Auto-detects the source language of a song's synced lyrics and translates each
// line into a chosen language, for side-by-side display in the synced-lyrics view.
// Uses the server-side Claude proxy (/api/ai/anthropic) — the key stays on the
// server, and one request handles detect + line-by-line translation, preserving
// line order/count so translations align with the timed lyric lines.

import { auth } from './firebase';

export interface LyricLang { code: string; label: string; }

// Target languages offered in the picker. `code` is a short id; `label` is shown.
export const LYRIC_LANGS: LyricLang[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese (Simplified)' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ru', label: 'Russian' },
  { code: 'sw', label: 'Swahili' },
  { code: 'yo', label: 'Yoruba' },
];

export interface LyricTranslation {
  sourceLanguage: string;   // English name of the auto-detected source language
  translations: string[];   // one per input line, same order/length
}

async function getToken(force = false): Promise<string | null> {
  const u = auth.currentUser;
  if (!u) return null;
  try { return await u.getIdToken(force); } catch { return null; }
}

function extractJson(text: string): any | null {
  // Claude may wrap JSON in a ```json fence or add stray prose; pull the object.
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

/**
 * Detect the language of `lines` and translate each into `targetLabel`.
 * Returns translations aligned 1:1 with the input (missing entries → '').
 * Throws on transport/auth failure so the caller can surface a message.
 */
export async function translateLyrics(lines: string[], targetLabel: string): Promise<LyricTranslation> {
  const clean = lines.map(l => (l ?? '').toString());
  const system =
    `You are an expert song-lyrics translator. You will receive a song's lyrics as a numbered list. ` +
    `First detect the source language. Then translate EACH numbered line into ${targetLabel}, preserving meaning, ` +
    `tone and singability. Respond with STRICT JSON ONLY (no markdown, no commentary) in exactly this shape: ` +
    `{"sourceLanguage":"<English name of the detected source language>","lines":["<translation of line 1>", "<translation of line 2>", ...]} ` +
    `The "lines" array MUST have exactly ${clean.length} strings, in the same order as the input. ` +
    `If a line is already in ${targetLabel}, return it unchanged. Never merge or split lines.`;
  const user = clean.map((l, i) => `${i + 1}. ${l}`).join('\n');

  let token = await getToken();
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await fetch('/api/ai/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (res.status === 401) { token = await getToken(true); lastErr = new Error('Please sign in to translate lyrics.'); continue; }
      if (!res.ok) { const b = await res.json().catch(() => ({} as any)); lastErr = new Error(b.error ? `Translation failed: ${b.error}` : `Translation failed (${res.status})`); continue; }
      const data = await res.json();
      const text = (data.content || []).map((b: any) => (b.type === 'text' ? b.text : '')).join('\n');
      const parsed = extractJson(text);
      if (!parsed || !Array.isArray(parsed.lines)) { lastErr = new Error('Could not read the translation.'); continue; }
      // Align to input length: pad short, truncate long.
      const out: string[] = [];
      for (let i = 0; i < clean.length; i++) out.push(typeof parsed.lines[i] === 'string' ? parsed.lines[i] : '');
      return { sourceLanguage: (parsed.sourceLanguage || 'Unknown').toString(), translations: out };
    } catch (e: any) {
      lastErr = e instanceof Error ? e : new Error('Translation request failed.');
    }
  }
  throw lastErr || new Error('Translation request failed.');
}
