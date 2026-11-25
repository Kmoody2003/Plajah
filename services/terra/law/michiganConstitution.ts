/**
 * Michigan Constitution of 1963 — per-article PDF text → Terra sections.
 *
 * Source: the Legislature's per-article PDFs (legislature.mi.gov/documents/mcl/pdf/MCL-CONSTITUTION-<ART>.pdf),
 * converted to text with `pdftotext` (poppler) at ingest time. Each section reads:
 *
 *   § 1 Political power.            ← catchline (editorial, not part of the Constitution)
 *   Sec. 1.
 *   All political power is inherent in the people. …
 *   History: Const. 1963, Art. I, § 1, Eff. Jan. 1, 1964
 *   Former Constitution: See Const. 1908, Art. II, § 1.
 *
 * Page furniture ("Rendered …", "Page 1 of 9", "Courtesy of legislature.mi.gov", the
 * "Complete Through PA …" line) is stripped. Text is kept verbatim; only PDF line wrapping is undone.
 * Pure — text in, data out.
 */

import type { ConstitutionArticle, LawBlock, LawSection } from './lawTypes';

const SEC_START = /^(?:Sec\.|Section)\s+\d+[a-z]?\.(?:\s|$)/;

const FURNITURE = [
  /^Rendered\s.+\d{4}\s*$/,
  /^Page \d+ of \d+\s*$/,
  /^Michigan Compiled Laws Complete Through .*$/,
  /^Courtesy of legislature\.mi\.gov\s*$/,
  /^STATE CONSTITUTION \(EXCERPT\)\s*$/,
  /^CONSTITUTION OF MICHIGAN OF 1963\s*$/,
  /^\f/,
];

export function currentThroughOf(text: string): string | undefined {
  const m = /Complete Through (PA \d+ of \d{4})/.exec(text);
  return m?.[1];
}

/** Join PDF-wrapped lines into paragraphs. A paragraph ends at a blank line or a line that starts a numbered clause. */
function toBlocks(lines: string[]): LawBlock[] {
  const blocks: LawBlock[] = [];
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join(' ').replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim();
    if (text) {
      const m = /^(\((?:\d+|[a-z]{1,4}|[A-Z])\))\s+(.*)$/.exec(text);
      blocks.push(m ? { t: 'p', num: m[1], text: m[2] } : { t: 'p', text });
    }
    buf = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^\((?:\d+|[a-z]{1,4}|[A-Z])\)\s/.test(line) && buf.length) flush();
    buf.push(line);
  }
  flush();
  return blocks;
}

export function parseConstitutionArticle(text: string, articleKey: string): ConstitutionArticle {
  const lines = text.split(/\r?\n/).filter((l) => !FURNITURE.some((re) => re.test(l.trim())));
  // Header: "Article I" then the article title line.
  let i = 0;
  while (i < lines.length && !/^Article\s+\S+/.test(lines[i].trim())) i++;
  const next = (lines[i + 1] ?? '').trim();
  // The Schedule has no title line: its first section heading follows "Article Schedule" directly.
  const title = /^§/.test(next) ? (articleKey === 'Schedule' ? 'Schedule and Temporary Provisions' : '') : next;
  i += /^§/.test(next) ? 1 : 2;

  const sections: LawSection[] = [];
  let cur: { catchLine: string; num: string; body: string[]; hist: string[]; notes: string[] } | null = null;
  let mode: 'body' | 'hist' = 'body';
  const finish = () => {
    if (!cur) return;
    const repealed = /^repealed/i.test(cur.catchLine) || cur.body.join(' ').trim().toLowerCase() === 'repealed.';
    sections.push({
      k: 'sec',
      id: `const-${articleKey}-${cur.num}`,
      num: `Const. ${articleKey === 'Schedule' ? 'Schedule' : `Art. ${articleKey}`}, § ${cur.num}`,
      label: cur.num,
      catch: cur.catchLine,
      body: toBlocks(cur.body),
      hist: cur.hist.flatMap((h) => h.split(/\s*;--\s*/)).map((h) => h.trim()).filter(Boolean),
      notes: cur.notes,
      ...(repealed ? { repealed: true } : {}),
    });
    cur = null;
  };

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    const head = /^§\s*(\d+[a-z]?)\s+(.*)$/.exec(line);
    if (head) {
      finish();
      let catchLine = head[2].trim();
      // Catchlines can wrap onto the next line(s) until "Sec. N."
      while (i + 1 < lines.length && !SEC_START.test(lines[i + 1].trim()) && lines[i + 1].trim() && !/^§\s*\d/.test(lines[i + 1].trim())) {
        catchLine += ' ' + lines[++i].trim();
      }
      cur = { catchLine, num: head[1], body: [], hist: [], notes: [] };
      mode = 'body';
      continue;
    }
    if (!cur) continue;
    if (/^(?:Sec\.|Section)\s+\d+[a-z]?\.\s*$/.test(line)) continue;
    const sec = /^Sec\.\s+\d+[a-z]?\.\s+(.*)$/.exec(line);
    if (sec) { cur.body.push(sec[1]); continue; }
    if (/^History:/.test(line)) { mode = 'hist'; cur.hist.push(line.replace(/^History:\s*/, '')); continue; }
    if (/^(Former Constitution|Compiler's Notes?|Constitutionality):/i.test(line)) { mode = 'hist'; cur.notes.push(line); continue; }
    if (mode === 'hist') {
      if (!line) continue;
      // Continuation of a wrapped history / note line.
      if (cur.notes.length) cur.notes[cur.notes.length - 1] += ' ' + line;
      else if (cur.hist.length) cur.hist[cur.hist.length - 1] += ' ' + line;
      continue;
    }
    cur.body.push(lines[i]);
  }
  finish();
  return { n: articleKey, title, sections };
}

/** The preamble, taken from the Legislature's full Constitution publication (`pdftotext` without -layout). */
export function preambleFrom(fullText: string): string | undefined {
  const at = fullText.search(/\nPreamble\.\s*\n\s*We, the people/);
  if (at < 0) return undefined;
  const rest = fullText.slice(at).replace(/^\s*Preamble\.\s*/, '');
  const end = rest.search(/\n\s*\n/);
  const body = (end < 0 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ').trim();
  return /^We, the people/.test(body) ? body : undefined;
}
