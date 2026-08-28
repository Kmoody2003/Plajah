/**
 * ariaTextUtils.ts — tiny text helpers shared by Aria surface adapters.
 *
 * Writing surfaces on Plajah store prose in different shapes (plain text, HTML
 * rich text, block arrays). These helpers keep the conversion between "what the
 * model writes" (plain text with blank-line paragraph breaks) and "what a
 * surface stores" consistent across adapters.
 */

/** Escape a string for safe insertion into innerHTML. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Convert model prose (paragraphs separated by blank lines) into HTML <p> blocks.
 * Single newlines within a paragraph become <br/>.
 */
export function parasToHtml(text: string): string {
  return String(text)
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

/** Strip HTML to readable plain text (uses the DOM; browser-only). */
export function htmlToText(html: string): string {
  if (!html) return '';
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Rough word count of a plain-text string. */
export function wordCount(text: string): number {
  const t = String(text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}
