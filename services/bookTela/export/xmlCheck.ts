// Tiny XML well-formedness checker (tag balance, attribute quoting, entity sanity, single root). NOT a schema
// validator: it exists because services/bookmeta/epub.ts checks package structure but never parses content docs,
// and we have no epubcheck here. It catches the mistakes a string-built exporter actually makes.

export interface XmlProblem { message: string; at: number }

const VOID_OK = true;

export function xmlWellFormed(xml: string): XmlProblem[] {
  const problems: XmlProblem[] = [];
  const stack: { name: string; at: number }[] = [];
  let i = 0; let roots = 0;
  const n = xml.length;
  const push = (message: string, at: number) => { if (problems.length < 20) problems.push({ message, at }); };
  // strip XML declaration / doctype / comments / CDATA from the scan but keep offsets
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) { checkText(xml.slice(i), i, push); break; }
    checkText(xml.slice(i, lt), i, push);
    if (xml.startsWith('<!--', lt)) { const e = xml.indexOf('-->', lt + 4); if (e < 0) { push('Unterminated comment', lt); break; } i = e + 3; continue; }
    if (xml.startsWith('<![CDATA[', lt)) { const e = xml.indexOf(']]>', lt); if (e < 0) { push('Unterminated CDATA', lt); break; } i = e + 3; continue; }
    if (xml.startsWith('<?', lt)) { const e = xml.indexOf('?>', lt); if (e < 0) { push('Unterminated processing instruction', lt); break; } i = e + 2; continue; }
    if (xml.startsWith('<!', lt)) { const e = xml.indexOf('>', lt); if (e < 0) { push('Unterminated declaration', lt); break; } i = e + 1; continue; }
    // find end of tag, respecting quotes
    let j = lt + 1; let q = '';
    for (; j < n; j++) { const c = xml[j]; if (q) { if (c === q) q = ''; } else if (c === '"' || c === "'") q = c; else if (c === '>') break; }
    if (j >= n) { push('Unterminated tag', lt); break; }
    const body = xml.slice(lt + 1, j);
    i = j + 1;
    if (body.startsWith('/')) {
      const name = body.slice(1).trim();
      const top = stack.pop();
      if (!top) push(`Closing </${name}> with nothing open`, lt);
      else if (top.name !== name) push(`Mismatched tag: <${top.name}> closed by </${name}>`, lt);
      continue;
    }
    const selfClose = body.endsWith('/');
    const m = /^([A-Za-z_][\w:.-]*)([\s\S]*?)\/?$/.exec(body);
    if (!m) { push(`Bad tag syntax: <${body.slice(0, 30)}>`, lt); continue; }
    const attrs = m[2];
    // attributes: name="value" pairs only; unique names
    const names = new Set<string>();
    const rest = attrs.replace(/\s+([A-Za-z_][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g, (_x, nm: string, val: string) => {
      if (names.has(nm)) push(`Duplicate attribute ${nm} on <${m[1]}>`, lt);
      names.add(nm);
      if (/<|&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(val.slice(1, -1))) push(`Bad characters in attribute ${nm} on <${m[1]}>`, lt);
      return '';
    });
    if (rest.trim()) push(`Malformed attributes on <${m[1]}>: ${rest.trim().slice(0, 40)}`, lt);
    if (!stack.length) { roots++; if (roots > 1) push('More than one root element', lt); }
    if (!selfClose) stack.push({ name: m[1], at: lt });
  }
  for (const s of stack) push(`Unclosed <${s.name}>`, s.at);
  if (roots === 0) push('No root element', 0);
  void VOID_OK;
  return problems;
}

function checkText(t: string, at: number, push: (m: string, a: number) => void) {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(t)) push('Bare ampersand or undefined entity in text (e.g. &nbsp; is not defined in XML)', at);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(t)) push('Illegal control character in text', at);
}
