// ─── Share to X (web intent) ─────────────────────────────────────────────────
// X's API bills per post, but its web share link is free: it opens X's own composer
// with the text and link prefilled and the user taps Post. No OAuth, no credits.
// Trade-off: it can't be automated or confirmed, so scheduled X posts become a reminder.

export function xIntentUrl(text: string, linkUri?: string): string {
  const q = new URLSearchParams();
  if (text.trim()) q.set('text', text.trim());
  if (linkUri) q.set('url', linkUri);
  return `https://x.com/intent/post?${q.toString()}`;
}

/** Open X's composer. Call from a click handler so popup blockers allow it. */
export function openXShare(text: string, linkUri?: string): void {
  window.open(xIntentUrl(text, linkUri), '_blank', 'noopener,noreferrer,width=600,height=700');
}
