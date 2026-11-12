/**
 * A tiny, tolerant XML/HTML tree parser for law-source ingestion.
 *
 * The Michigan Legislature's MCL XML is well-formed, but the section bodies inside it are escaped
 * HTML fragments that are not always strictly balanced (tables carry presentational markup).
 * This parser never throws: an unmatched close tag is ignored, unclosed tags close at the end.
 * Pure — no I/O, no dependencies — so ingestion is unit-testable.
 */

export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: (XNode | string)[];
}

const VOID = new Set(['br', 'hr', 'img', 'col', 'meta', 'link', 'input', 'wbr']);

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sect: '§', para: '¶', hellip: '…', frac12: '½',
  frac14: '¼', frac34: '¾', deg: '°', times: '×', copy: '©', reg: '®', bull: '•',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

export function parseXml(src: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [] };
  const stack: XNode[] = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { top.children.push(m[1]); continue; }
    if (m[6] !== undefined) { top.children.push(decodeEntities(m[6])); continue; }
    if (m[3] === undefined) { if (m[0] === '<') top.children.push('<'); continue; } // comment / PI / doctype / stray '<'
    const name = m[3];
    if (m[2] === '/') {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) { stack.length = i; break; }
      }
      continue;
    }
    const node: XNode = { name, attrs: parseAttrs(m[4] || ''), children: [] };
    top.children.push(node);
    if (m[5] !== '/' && !VOID.has(name.toLowerCase())) stack.push(node);
  }
  return root;
}

export function child(n: XNode | undefined, name: string): XNode | undefined {
  return n?.children.find((c): c is XNode => typeof c !== 'string' && c.name === name);
}

export function childrenNamed(n: XNode | undefined, name: string): XNode[] {
  return (n?.children ?? []).filter((c): c is XNode => typeof c !== 'string' && c.name === name);
}

export function elements(n: XNode | undefined): XNode[] {
  return (n?.children ?? []).filter((c): c is XNode => typeof c !== 'string');
}

/** All text under a node, concatenated in order (no whitespace normalisation). */
export function textOf(n: XNode | string | undefined): string {
  if (n === undefined) return '';
  if (typeof n === 'string') return n;
  if (n.name.toLowerCase() === 'br') return '\n';
  return n.children.map(textOf).join('');
}

export function squash(s: string): string {
  return s.replace(/[\s ]+/g, ' ').trim();
}

/** Text of a named direct child, whitespace-normalised. */
export function field(n: XNode | undefined, name: string): string {
  return squash(textOf(child(n, name)));
}
