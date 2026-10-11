// xml — a small, tolerant XML parser for SVG import (node has no DOMParser and we avoid
// dependencies). Handles the prolog, DOCTYPE (with internal subset), comments, CDATA,
// processing instructions, namespaced names and the standard + numeric entities.

export interface XNode { tag: string; attrs: Record<string, string>; children: XNode[]; text: string; parent?: XNode }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m);

export function parseXml(src: string): XNode {
  const root: XNode = { tag: '#root', attrs: {}, children: [], text: '' }; let cur = root; let i = 0; const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { cur.text += decodeEntities(src.slice(i)); break; }
    if (lt > i) cur.text += decodeEntities(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt + 9); cur.text += src.slice(lt + 9, e < 0 ? n : e); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt + 2); i = e < 0 ? n : e + 2; continue; }
    if (src.startsWith('<!', lt)) { // DOCTYPE, possibly with [ internal subset ]
      let j = lt + 2, depth = 0; while (j < n) { const c = src[j]; if (c === '[') depth++; else if (c === ']') depth--; else if (c === '>' && depth <= 0) break; j++; } i = j + 1; continue;
    }
    if (src[lt + 1] === '/') { const e = src.indexOf('>', lt); const name = src.slice(lt + 2, e).trim(); let p: XNode | undefined = cur; while (p && p.tag !== name && p.parent) p = p.parent; if (p && p.parent) cur = p.parent; i = e + 1; continue; }
    // start tag
    let j = lt + 1; while (j < n && !/[\s/>]/.test(src[j])) j++;
    const tag = src.slice(lt + 1, j); const attrs: Record<string, string> = {};
    for (;;) {
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === '>' || (src[j] === '/' && src[j + 1] === '>') || j >= n) break;
      let k = j; while (k < n && !/[\s=/>]/.test(src[k])) k++; const name = src.slice(j, k); j = k;
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === '=') {
        j++; while (j < n && /\s/.test(src[j])) j++;
        const q = src[j]; let val: string;
        if (q === '"' || q === "'") { const e = src.indexOf(q, j + 1); val = src.slice(j + 1, e < 0 ? n : e); j = e < 0 ? n : e + 1; }
        else { let e = j; while (e < n && !/[\s>]/.test(src[e])) e++; val = src.slice(j, e); j = e; }
        attrs[name] = decodeEntities(val);
      } else if (name) attrs[name] = '';
      if (!name) j++;
    }
    const self = src[j] === '/'; const node: XNode = { tag, attrs, children: [], text: '', parent: cur }; cur.children.push(node);
    i = src.indexOf('>', j) + 1 || n;
    if (!self) cur = node;
  }
  return root;
}
export function findAll(n: XNode, pred: (x: XNode) => boolean, out: XNode[] = []): XNode[] { if (pred(n)) out.push(n); for (const c of n.children) findAll(c, pred, out); return out; }
export const localName = (tag: string) => tag.includes(':') ? tag.split(':').pop()! : tag;
/** All text inside a node (tspans included), whitespace collapsed like SVG. */
export const textContent = (n: XNode): string => (n.text + n.children.map(textContent).join(' ')).replace(/\s+/g, ' ').trim();
