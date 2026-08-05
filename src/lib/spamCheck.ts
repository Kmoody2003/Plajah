const POST_COOLDOWN_MS = 20_000;
const CLUB_POST_COOLDOWN_MS = 10_000;

/** Check whether enough time has passed since the last post of this type. */
export function checkPostRateLimit(storageKey = 'plajah_last_post'): { allowed: boolean; waitSecs: number } {
  try {
    const last = parseInt(localStorage.getItem(storageKey) || '0', 10);
    const cooldown = storageKey.includes('club') ? CLUB_POST_COOLDOWN_MS : POST_COOLDOWN_MS;
    const elapsed = Date.now() - last;
    if (elapsed < cooldown) {
      return { allowed: false, waitSecs: Math.ceil((cooldown - elapsed) / 1000) };
    }
  } catch {}
  return { allowed: true, waitSecs: 0 };
}

/** Persist the timestamp of a successful post. */
export function recordPost(storageKey = 'plajah_last_post') {
  try { localStorage.setItem(storageKey, Date.now().toString()); } catch {}
}

/** Returns a human-readable reason if the text looks spammy, or null if it's fine. */
export function detectSpam(text: string): string | null {
  if (!text || !text.trim()) return null;

  // Excessive repeated characters, e.g. "aaaaaaaaaa"
  if (/(.)\1{9,}/.test(text)) return 'Your message contains too many repeated characters.';

  // Mostly caps (bots often shout)
  const words = text.trim().split(/\s+/);
  const capsWords = words.filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (words.length > 4 && capsWords.length / words.length > 0.8) {
    return 'Please avoid posting in all caps.';
  }

  // Too many URLs
  const urlCount = (text.match(/https?:\/\//gi) || []).length;
  if (urlCount > 5) return 'Too many links in a single post.';

  // Repeated phrases (simple check: any 4-word phrase repeated more than twice)
  const ngrams = new Map<string, number>();
  const ws = text.toLowerCase().split(/\s+/);
  for (let i = 0; i <= ws.length - 4; i++) {
    const gram = ws.slice(i, i + 4).join(' ');
    const count = (ngrams.get(gram) || 0) + 1;
    if (count > 2) return 'Your message contains too much repetition.';
    ngrams.set(gram, count);
  }

  return null;
}

/**
 * Honeypot field check — call with the value of a hidden field.
 * Bots tend to fill in every input; legitimate users leave it blank.
 */
export function honeypotTripped(value: string): boolean {
  return value.trim().length > 0;
}
