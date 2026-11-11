// Small XML helpers shared by the RSS feed and the Podcasting 2.0 tags. Pure; runs in the browser and on the server.

/** Characters XML 1.0 forbids outright (control chars other than tab/newline/CR, lone surrogates, U+FFFE/FFFF). */
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export const stripInvalidXml = (s: string): string => s.replace(INVALID_XML, '');

/** Escape for both element text and attribute values (double- or single-quoted). */
export function xmlEsc(value: unknown): string {
  if (value === undefined || value === null) return '';
  return stripInvalidXml(String(value))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** CDATA that survives a literal "]]>" inside the text. */
export function cdata(value: unknown): string {
  const s = stripInvalidXml(value === undefined || value === null ? '' : String(value));
  return `<![CDATA[${s.split(']]>').join(']]]]><![CDATA[>')}]]>`;
}

/** Render attributes, dropping undefined/null/'' values. Order is kept. */
export function attrs(a: Record<string, string | number | boolean | undefined | null>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined || v === null || v === '') continue;
    out.push(`${k}="${xmlEsc(v)}"`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

/** <name attrs>text</name>, or <name attrs/> when text is empty. */
export function el(name: string, a: Record<string, string | number | boolean | undefined | null>, text?: string | number): string {
  const t = text === undefined || text === null ? '' : xmlEsc(text);
  return t ? `<${name}${attrs(a)}>${t}</${name}>` : `<${name}${attrs(a)}/>`;
}
