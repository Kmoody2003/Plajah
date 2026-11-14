// A small, forgiving XML reader for kit files (MPC .xpm, Ableton .adg, Impact .preset, Hydrogen,
// Decent Sampler). DOMParser isn't available under tsx tests and the files are machine-written,
// so a tag scanner is enough: elements, attributes, text, self-closing tags, comments, CDATA,
// processing instructions. Namespaced names keep their prefix ("x:id").

export interface XmlEl {
  name: string;
  attrs: Record<string, string>;
  children: XmlEl[];
  text: string;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e] ?? m;
});

export function parseXml(src: string): XmlEl | null {
  const root: XmlEl = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlEl[] = [root];
  const s = src.replace(/^﻿/, '');
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) stack[stack.length - 1].text += unescape(s.slice(i, lt));
    if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt); i = e < 0 ? s.length : e + 3; continue; }
    if (s.startsWith('<![CDATA[', lt)) { const e = s.indexOf(']]>', lt); stack[stack.length - 1].text += s.slice(lt + 9, e < 0 ? s.length : e); i = e < 0 ? s.length : e + 3; continue; }
    if (s[lt + 1] === '?' || s[lt + 1] === '!') { const e = s.indexOf('>', lt); i = e < 0 ? s.length : e + 1; continue; }
    // Find the tag end, skipping '>' inside quoted attribute values.
    let j = lt + 1; let q = '';
    for (; j < s.length; j++) {
      const c = s[j];
      if (q) { if (c === q) q = ''; } else if (c === '"' || c === "'") q = c; else if (c === '>') break;
    }
    const body = s.slice(lt + 1, j);
    i = j + 1;
    if (body[0] === '/') {
      const name = body.slice(1).trim();
      // Pop to the matching open tag (tolerates a stray unclosed child).
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].name === name) { stack.length = k; break; }
      continue;
    }
    const selfClose = body.endsWith('/');
    const inner = selfClose ? body.slice(0, -1) : body;
    const m = /^([^\s/]+)/.exec(inner);
    if (!m) continue;
    const el: XmlEl = { name: m[1], attrs: {}, children: [], text: '' };
    const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    const rest = inner.slice(m[1].length);
    while ((a = re.exec(rest))) el.attrs[a[1]] = unescape(a[3] ?? a[4] ?? '');
    stack[stack.length - 1].children.push(el);
    if (!selfClose) stack.push(el);
  }
  return root.children[0] ?? null;
}

/** Direct children by name. */
export const kids = (el: XmlEl | null | undefined, name: string): XmlEl[] => (el ? el.children.filter((c) => c.name === name) : []);
export const kid = (el: XmlEl | null | undefined, name: string): XmlEl | undefined => el?.children.find((c) => c.name === name);
/** Every descendant (depth-first, document order) by name. */
export function all(el: XmlEl | null | undefined, name: string, out: XmlEl[] = []): XmlEl[] {
  if (!el) return out;
  for (const c of el.children) { if (c.name === name) out.push(c); all(c, name, out); }
  return out;
}
/** Text of a direct child (trimmed), or ''. */
export const childText = (el: XmlEl | null | undefined, name: string): string => kid(el, name)?.text.trim() ?? '';
/** Every descendant, document order. */
export function walk(el: XmlEl, fn: (e: XmlEl) => void): void { for (const c of el.children) { fn(c); walk(c, fn); } }
