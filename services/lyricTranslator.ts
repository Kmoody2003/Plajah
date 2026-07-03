// ─── Lyric Translation (Chora) ────────────────────────────────────────────────
// Auto-detects the source language of a song's synced lyrics and translates each
// line into a chosen language, for side-by-side display in the synced-lyrics view.
// Uses the server-side Claude proxy (/api/ai/anthropic) — the key stays on the
// server, and one request handles detect + line-by-line translation, preserving
// line order/count so translations align with the timed lyric lines.

import { auth } from './firebase';

export interface LyricLang { code: string; label: string; group: 'modern' | 'ancient'; }

// Target languages offered in the picker. `code` is a short id used for caching;
// `label` is both shown in the UI and sent to the translator as the target name.
// The `ancient` group leans on the model's classical-language knowledge — it
// renders traditional scripts where it reliably can and romanized transliteration
// otherwise (see the prompt below).
export const LYRIC_LANGS: LyricLang[] = [
  // ── Modern ──
  { code: 'en', label: 'English', group: 'modern' },
  { code: 'es', label: 'Spanish', group: 'modern' },
  { code: 'fr', label: 'French', group: 'modern' },
  { code: 'de', label: 'German', group: 'modern' },
  { code: 'it', label: 'Italian', group: 'modern' },
  { code: 'pt', label: 'Portuguese', group: 'modern' },
  { code: 'ja', label: 'Japanese', group: 'modern' },
  { code: 'ko', label: 'Korean', group: 'modern' },
  { code: 'zh', label: 'Chinese (Simplified)', group: 'modern' },
  { code: 'hi', label: 'Hindi', group: 'modern' },
  { code: 'ar', label: 'Arabic', group: 'modern' },
  { code: 'he', label: 'Modern Hebrew', group: 'modern' },
  { code: 'ru', label: 'Russian', group: 'modern' },
  { code: 'el', label: 'Greek', group: 'modern' },
  { code: 'sw', label: 'Swahili', group: 'modern' },
  { code: 'yo', label: 'Yoruba', group: 'modern' },
  // ── Ancient / Classical ──
  { code: 'lat', label: 'Latin', group: 'ancient' },
  { code: 'grc', label: 'Ancient Greek (Koine)', group: 'ancient' },
  { code: 'hbo', label: 'Biblical Hebrew', group: 'ancient' },
  { code: 'arc', label: 'Imperial Aramaic', group: 'ancient' },
  { code: 'syc', label: 'Classical Syriac', group: 'ancient' },
  { code: 'cop', label: 'Coptic', group: 'ancient' },
  { code: 'egy', label: 'Ancient Egyptian (transliterated)', group: 'ancient' },
  { code: 'sux', label: 'Sumerian (transliterated)', group: 'ancient' },
  { code: 'akk', label: 'Akkadian (transliterated)', group: 'ancient' },
  { code: 'peo', label: 'Old Persian (transliterated)', group: 'ancient' },
  { code: 'san', label: 'Sanskrit', group: 'ancient' },
  { code: 'pli', label: 'Pali (romanized)', group: 'ancient' },
  { code: 'lzh', label: 'Classical Chinese', group: 'ancient' },
  { code: 'ang', label: 'Old English', group: 'ancient' },
  { code: 'gez', label: "Ge'ez", group: 'ancient' },
  { code: 'chb', label: 'Nahuatl (Classical)', group: 'ancient' },
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
    `You are an expert linguist and translator fluent in modern, historical, classical and ancient languages ` +
    `(including Latin, Ancient/Koine Greek, Biblical Hebrew, Aramaic, Syriac, Coptic, Ancient Egyptian, Sumerian, ` +
    `Akkadian, Sanskrit, Classical Chinese, Old English and more). You will receive a song's lyrics as a numbered list. ` +
    `First identify the source language — it may be modern, historical, or ancient. Then translate EACH numbered line ` +
    `into ${targetLabel}, preserving meaning, tone and (where the target is a living language) singability. ` +
    `Ancient/classical target rules: render the translation in that language's traditional script where you can do so ` +
    `reliably; where the exact script or wording is uncertain, give the best scholarly translation followed by a ` +
    `romanized transliteration in parentheses. ALWAYS produce a best-effort translation for every line — never refuse, ` +
    `never leave a line blank, and do not add disclaimers inside the lines. ` +
    `Respond with STRICT JSON ONLY (no markdown, no commentary) in exactly this shape: ` +
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
