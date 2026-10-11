// xml — a small, fast, non-validating XML reader/writer for OOXML parts.
// Element names drop their namespace prefix (`x:c` → `c`), which is how
// SpreadsheetML is written in practice; attribute names keep theirs (`r:id`).

export interface XNode { name: string; attrs: Record<string, string>; children: XNode[]; text: string }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function unescapeXml(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e]);
}
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // Strip characters XML 1.0 cannot carry.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

const ATTR_RE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function parseXml(src: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) { const t = src.slice(i, lt); const top = stack[stack.length - 1]; if (top !== root) top.text += unescapeXml(t); }
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt + 9); stack[stack.length - 1].text += src.slice(lt + 9, e < 0 ? n : e); i = e < 0 ? n : e + 3; continue; }
    if (src[lt + 1] === '?' || src[lt + 1] === '!') { const e = src.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
    const gt = src.indexOf('>', lt);
    if (gt < 0) break;
    if (src[lt + 1] === '/') { if (stack.length > 1) stack.pop(); i = gt + 1; continue; }
    const selfClose = src[gt - 1] === '/';
    const body = src.slice(lt + 1, selfClose ? gt - 1 : gt);
    const sp = body.search(/[\s/]/);
    const qname = sp < 0 ? body : body.slice(0, sp);
    const colon = qname.indexOf(':');
    const node: XNode = { name: colon >= 0 ? qname.slice(colon + 1) : qname, attrs: {}, children: [], text: '' };
    if (sp >= 0) {
      ATTR_RE.lastIndex = 0;
      const rest = body.slice(sp);
      let m: RegExpExecArray | null;
      while ((m = ATTR_RE.exec(rest))) node.attrs[m[1]] = unescapeXml(m[3] ?? m[4] ?? '');
    }
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
    i = gt + 1;
  }
  return root.children[0] ?? root;
}

export const child = (n: XNode | undefined, name: string) => n?.children.find(c => c.name === name);
export const childrenOf = (n: XNode | undefined, name: string) => (n ? n.children.filter(c => c.name === name) : []);
/** Concatenated text of all descendant <t> elements (rich-text runs). */
export function allText(n: XNode): string {
  if (n.name === 't') return n.text;
  let s = '';
  for (const c of n.children) if (c.name !== 'rPh' && c.name !== 'phoneticPr') s += allText(c);
  return s;
}
