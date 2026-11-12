/**
 * Michigan Compiled Laws (MCL) — chapter XML → Terra provision tree.
 *
 * Source: the Michigan Legislature's public per-chapter XML (legislature.mi.gov/documents/mcl/),
 * UTF-16 encoded, shaped as
 *
 *   MCLChapterInfo
 *     MCLDocumentInfoCollection
 *       MCLStatuteInfo      (an act: Name, Heading, LongTitle, ShortTitle)
 *         MCLDocumentInfoCollection
 *           MCLDivisionInfo (Article / Part / Chapter …: DivisionType, DivisionNumber, DivisionTitle)
 *           MCLSectionInfo  (MCLNumber, Label, CatchLine, BodyText = escaped HTML, HistoryText, EditorsNotes)
 *
 * Pure: string in, data out. The text of the law is copied verbatim; only markup is dropped.
 */

import type { LawAct, LawBlock, LawChapter, LawDivision, LawNode, LawSection, LawSearchRow } from './lawTypes';
import { child, childrenNamed, decodeEntities, elements, field, parseXml, squash, textOf, type XNode } from './miniXml';

/** Decode a chapter file's bytes (UTF-16 with BOM in the Legislature's export; UTF-8 tolerated). */
export function decodeMclBytes(buf: Uint8Array): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder('utf-8').decode(buf.subarray(3));
  // Heuristic: UTF-16LE without BOM has a NUL every other byte.
  if (buf.length > 4 && buf[1] === 0 && buf[3] === 0) return new TextDecoder('utf-16le').decode(buf);
  return new TextDecoder('utf-8').decode(buf);
}

const isTrue = (n: XNode | undefined, name: string) => field(n, name).toLowerCase() === 'true';

/** History lines ("1911, Act 4, Imd. Eff. Feb. 27, 1911"), verbatim. */
function historyLines(sec: XNode): string[] {
  const raw = decodeEntities(textOf(child(sec, 'HistoryText')));
  if (!raw.trim()) return [];
  const tree = parseXml(raw);
  const rows = collect(tree, 'HistoryData').map((h) => squash(textOf(h))).filter(Boolean);
  return rows.length ? rows : [squash(textOf(tree))].filter(Boolean);
}

function notesOf(sec: XNode): string[] {
  const out: string[] = [];
  for (const note of childrenNamed(child(sec, 'EditorsNotes'), 'EditorsNoteInfo')) {
    const raw = decodeEntities(textOf(child(note, 'Text')));
    const tree = parseXml(raw);
    const paras = collect(tree, 'P').map((p) => squash(textOf(p))).filter(Boolean);
    const text = paras.length ? paras.join('\n\n') : squash(textOf(tree));
    if (text) out.push(text);
  }
  return out;
}

function collect(n: XNode, name: string, out: XNode[] = []): XNode[] {
  for (const c of elements(n)) {
    if (c.name === name) out.push(c);
    collect(c, name, out);
  }
  return out;
}

const lower = (s: string) => s.toLowerCase();

/** Convert a section's BodyText HTML fragment into ordered blocks of verbatim text. */
export function bodyBlocks(bodyHtml: string): LawBlock[] {
  const tree = parseXml(decodeEntities(bodyHtml));
  const blocks: LawBlock[] = [];

  const tableRows = (t: XNode): string[][] =>
    collect(t, 'tr').concat(collect(t, 'TR'))
      .map((tr) => elements(tr).filter((c) => lower(c.name) === 'td' || lower(c.name) === 'th').map((td) => squash(textOf(td))))
      .filter((r) => r.some(Boolean));

  const walk = (n: XNode, depth: number, ctx: { num?: string; heading?: string }) => {
    for (const c of n.children) {
      if (typeof c === 'string') {
        const s = squash(c);
        if (s) {
          blocks.push({ t: 'p', text: s, depth, ...(ctx.num ? { num: ctx.num } : {}), ...(ctx.heading ? { heading: ctx.heading } : {}) });
          ctx.num = undefined;
          ctx.heading = undefined;
        }
        continue;
      }
      const name = lower(c.name);
      if (name === 'section-number') continue; // "Sec. 4." — carried as the section label instead
      if (name === 'paragraph-number') { ctx.num = squash(textOf(c)); continue; }
      if (name === 'paragraph-heading') { ctx.heading = squash(textOf(c)); continue; }
      if (name === 'paragraph') { walk(c, depth + 1, {}); continue; }
      if (name === 'table') { const rows = tableRows(c); if (rows.length) blocks.push({ t: 'table', rows }); continue; }
      if (name === 'pre') { const s = textOf(c).replace(/\s+$/g, ''); if (s.trim()) blocks.push({ t: 'pre', text: s }); continue; }
      if (name === 'p') {
        // A <P> may wrap a table (the source nests tables in paragraphs).
        const tables = collect(c, 'table');
        if (tables.length) {
          const lead = squash(textOf({ ...c, children: c.children.filter((x) => typeof x === 'string' || lower(x.name) !== 'table') }));
          if (lead) blocks.push({ t: 'p', text: lead, depth, ...(ctx.num ? { num: ctx.num } : {}) });
          for (const t of tables) { const rows = tableRows(t); if (rows.length) blocks.push({ t: 'table', rows }); }
        } else {
          const s = squash(textOf(c));
          if (s) blocks.push({ t: 'p', text: s, depth, ...(ctx.num ? { num: ctx.num } : {}), ...(ctx.heading ? { heading: ctx.heading } : {}) });
        }
        ctx.num = undefined; ctx.heading = undefined;
        continue;
      }
      walk(c, depth, ctx); // Section-Body, span, Emph, b, u, i, a … — transparent containers
    }
  };
  walk(tree, 0, {});
  // Normalise depth so the shallowest paragraph is 0.
  const min = Math.min(...blocks.map((b) => (b.t === 'p' ? b.depth ?? 0 : 99)), 99);
  for (const b of blocks) if (b.t === 'p') { b.depth = Math.max(0, (b.depth ?? 0) - (min === 99 ? 0 : min)); if (!b.depth) delete b.depth; }
  return blocks;
}

function parseSection(sec: XNode): LawSection {
  const num = field(sec, 'MCLNumber') || field(sec, 'SectRef');
  return {
    k: 'sec',
    id: `mcl-${num}`,
    num,
    label: field(sec, 'Label') || undefined,
    catch: field(sec, 'CatchLine'),
    body: bodyBlocks(textOf(child(sec, 'BodyText'))),
    hist: historyLines(sec),
    notes: notesOf(sec),
    ...(isTrue(sec, 'Repealed') ? { repealed: true } : {}),
  };
}

function parseCollection(parent: XNode): LawNode[] {
  const out: LawNode[] = [];
  for (const n of elements(child(parent, 'MCLDocumentInfoCollection'))) {
    if (n.name === 'MCLSectionInfo') out.push(parseSection(n));
    else if (n.name === 'MCLStatuteInfo') {
      const act: LawAct = {
        k: 'act',
        name: field(n, 'Name'),
        heading: field(n, 'Heading'),
        longTitle: field(n, 'LongTitle') || undefined,
        shortTitle: field(n, 'ShortTitle') || undefined,
        ...(isTrue(n, 'Repealed') ? { repealed: true } : {}),
        children: parseCollection(n),
      };
      out.push(act);
    } else if (n.name === 'MCLDivisionInfo') {
      // Titles occasionally carry escaped markup ("TITLE<br/>Intro text…").
      const [title, ...intro] = textOf(child(n, 'DivisionTitle')).split(/<br\s*\/?>/i).map(squash);
      const div: LawDivision = {
        k: 'div',
        type: field(n, 'DivisionType') || 'Division',
        number: field(n, 'DivisionNumber'),
        title: title ?? '',
        ...(intro.filter(Boolean).length ? { intro: intro.filter(Boolean).join(' ') } : {}),
        ...(isTrue(n, 'Repealed') ? { repealed: true } : {}),
        children: parseCollection(n),
      };
      out.push(div);
    }
  }
  return out;
}

export function parseMclChapter(xml: string): LawChapter {
  const root = parseXml(xml);
  const ch = child(root, 'MCLChapterInfo');
  if (!ch) throw new Error('Not an MCL chapter file (no MCLChapterInfo root)');
  return {
    jurisdiction: 'mi',
    code: 'mcl',
    n: field(ch, 'Name'),
    title: field(ch, 'Title'),
    ...(isTrue(ch, 'Repealed') ? { repealed: true } : {}),
    children: parseCollection(ch),
  };
}

/** Walk every section under a node, with the act/division path that contains it. */
export function* walkSections(nodes: LawNode[], path: string[] = []): Generator<{ sec: LawSection; path: string[] }> {
  for (const n of nodes) {
    if (n.k === 'sec') yield { sec: n, path };
    else if (n.k === 'act') yield* walkSections(n.children, [...path, n.shortTitle || n.heading || n.name]);
    else yield* walkSections(n.children, [...path, [n.type, n.number].filter(Boolean).join(' ') + (n.title ? ` — ${n.title}` : '')]);
  }
}

export function chapterStats(ch: LawChapter): { acts: number; sections: number } {
  let acts = 0;
  const countActs = (ns: LawNode[]) => { for (const n of ns) { if (n.k === 'act') acts++; if (n.k !== 'sec') countActs(n.children); } };
  countActs(ch.children);
  let sections = 0;
  for (const _ of walkSections(ch.children)) sections++;
  return { acts, sections };
}

export function searchRowsForChapter(ch: LawChapter): LawSearchRow[] {
  const rows: LawSearchRow[] = [];
  for (const { sec, path } of walkSections(ch.children)) {
    if (sec.repealed) continue;
    rows.push([sec.id, sec.num, sec.catch, path[0] ?? '', ch.n]);
  }
  return rows;
}

/**
 * MCL chapter 1 is the 1963 Constitution. Re-shape it into articles with constitution ids
 * ("const-IX-6"), which read better than the MCL object names ("Article IX § 6").
 */
export function constitutionFromChapter(ch: LawChapter): { articles: { n: string; title: string; intro?: string; sections: LawSection[] }[] } {
  const articles: { n: string; title: string; intro?: string; sections: LawSection[] }[] = [];
  const visit = (nodes: LawNode[]) => {
    for (const n of nodes) {
      if (n.k === 'act') visit(n.children);
      else if (n.k === 'div') {
        const key = n.number || n.title;
        const sections: LawSection[] = [];
        for (const { sec } of walkSections(n.children)) {
          const m = /§\s*(\S+)\s*$/.exec(sec.num);
          const label = m?.[1] ?? (/sigblock/i.test(sec.num) ? 'vote-record' : sec.label ?? sec.num);
          const where = key === 'Schedule' ? 'Schedule' : `Art. ${key}`;
          sections.push({ ...sec, id: `const-${key}-${label}`, num: label === 'vote-record' ? `Const. ${where}, vote record` : `Const. ${where}, § ${label}`, label });
        }
        articles.push({ n: key, title: n.title, ...(n.intro ? { intro: n.intro } : {}), sections });
      }
    }
  };
  visit(ch.children);
  return { articles };
}
