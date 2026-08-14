// Tiny XML builder + escape for .dawproject emission — ~40 lines beats an XML dependency.

export const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export type XmlChild = string | null | undefined | false;

/** el('Tempo', { unit: 'bpm', value: 120 }) → '<Tempo unit="bpm" value="120"/>' */
export function el(name: string, attrs: Record<string, string | number | boolean | undefined> = {}, ...children: XmlChild[]): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${xmlEscape(String(v))}"`)
    .join('');
  const body = children.filter(Boolean).join('');
  return body ? `<${name}${a}>${body}</${name}>` : `<${name}${a}/>`;
}

export const xmlDoc = (root: string): string => `<?xml version="1.0" encoding="UTF-8"?>\n${root}`;
