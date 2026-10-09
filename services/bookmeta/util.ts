// Tiny shared helpers (kept dependency-free for node tests).

export const countWords = (text: string): number => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

export const escapeAttr = (s: string): string =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const stripTags = (html: string): string =>
  (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

/** Remove every key whose value is undefined (Firestore throws on undefined writes). Deep, arrays included. */
export function stripUndefinedDeep<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndefinedDeep) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (val !== undefined) out[k] = stripUndefinedDeep(val);
    return out as T;
  }
  return v;
}

const SAFE_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'strong', 'i', 'b', 'u', 'br', 'blockquote', 'ul', 'ol', 'li', 'hr', 'sup', 'sub']);
/** Allow only attribute-less HTML-lite tags; everything else (scripts, handlers, iframes, styles) is removed. */
export function sanitizeHtmlLite(html: string): string {
  return (html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g, (m, name: string) => {
      const n = name.toLowerCase();
      if (!SAFE_TAGS.has(n)) return '';
      if (m.startsWith('</')) return `</${n}>`;
      return n === 'br' || n === 'hr' ? `<${n}/>` : `<${n}>`;
    });
}
