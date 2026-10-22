// storyLens — Story Intelligence for the Lorea exhibits: find live examples of a craft idea in the
// library itself. The quick pass reads the openings bundled with the classic shelf (instant, no
// network); `deepScan` streams one classic's full text and hunts through all of it. Plain
// heuristics on real sentences — every result is a verbatim quote with its book attached.
import { CLASSIC_BOOKS, getClassicBookTextUrl, listInstantClassicOpenings } from '../../data/classicBooks';
import type { LensTag } from './loreaExhibitTypes';

export interface LensFind {
  tag: LensTag;
  text: string;
  /** substrings to ink-underline */
  marks: string[];
  work: string;
  author: string;
  gutenbergId: string;
  why: string;
}

export const LENS_LABEL: Record<LensTag, string> = {
  dialogue: 'people talking',
  alliteration: 'repeated first sounds',
  'long-sentence': 'a long, winding sentence',
  'short-sentence': 'a short, hard sentence',
  'first-person': 'an "I" telling the story',
  question: 'a question',
  'opening-line': 'a first line',
  simile: 'a comparison with "like" or "as"',
  exclamation: 'an exclamation',
};

const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'is', 'it', 'that', 'his', 'her', 'he', 'she', 'was', 'for', 'on', 'with', 'as', 'at', 'by', 'be', 'i', 'my', 'me']);

// Bundled openings that are glossed excerpts rather than the text as printed (philosophy
// selections with bracketed terms and connecting summary). The lens only quotes verbatim prose.
const NOT_VERBATIM = new Set(['1497', '1600', '1656', '1974', '8438', '6762']);

const ABBREV = /\b(Mr|Mrs|Ms|Dr|St|Mme|Mlle|Messrs|Capt|Col|Gen|Rev|Hon|Jr|Sr|vs|viz|i\.e|e\.g)\./g;
function sentences(p: string): string[] {
  const guarded = p.replace(/\s+/g, ' ').replace(ABBREV, m => m.replace('.', '․'));
  return (guarded.match(/[^.!?]+[.!?]+["'”’)]*\s*/g) || [guarded]).map(s => s.replace(/․/g, '.').trim()).filter(Boolean);
}
const words = (s: string) => s.split(/\s+/).filter(w => /\w/.test(w));

type Probe = (s: string, ctx: { first: boolean }) => { marks: string[]; why: string } | null;

const PROBES: Record<LensTag, Probe> = {
  dialogue: s => {
    const m = s.match(/[“"][^”"]{6,}[”"]/g);
    return m ? { marks: m.slice(0, 2), why: 'Quotation marks hand the page to a character — we hear them instead of being told about them.' } : null;
  },
  alliteration: s => {
    const ws = words(s).map(w => w.replace(/[^A-Za-z]/g, '')).filter(Boolean);
    for (let i = 0; i + 2 < ws.length; i++) {
      if (/^[aeiou]/i.test(ws[i])) continue;           // vowels rarely share a sound (one / or / other)
      const run = [ws[i]]; let j = i + 1;
      while (j < ws.length && j - i < 5) {
        const w = ws[j];
        if (STOP.has(w.toLowerCase())) { j++; continue; }
        if (w[0].toLowerCase() === ws[i][0].toLowerCase()) { run.push(w); j++; } else break;
      }
      if (run.length >= 3 && !STOP.has(ws[i].toLowerCase())) return { marks: run, why: `The "${ws[i][0].toLowerCase()}" sound returns ${run.length} times close together — the ear notices before the mind does.` };
    }
    return null;
  },
  'long-sentence': s => { const n = words(s).length; return n >= 40 ? { marks: [], why: `${n} words in one breath — the sentence keeps adding, so the reader keeps leaning forward.` } : null; },
  'short-sentence': s => { const n = words(s).length; return n > 0 && n <= 6 ? { marks: [s.replace(/[“”"]/g, '').trim()], why: `Only ${n} words. Short sentences land like a door closing.` } : null; },
  'first-person': s => { const m = s.match(/\b(I|my|me)\b/g); return m && m.length >= 2 ? { marks: [...new Set(s.match(/\b(I|my|me|myself)\b/g) || [])], why: 'Told from inside: the narrator is a character, so everything we see passes through one mind.' } : null; },
  question: s => s.endsWith('?') || /\?[”"’']?$/.test(s) ? { marks: [], why: 'A question pulls the reader in — we start answering before we decide to.' } : null,
  'opening-line': (s, ctx) => ctx.first ? { marks: [], why: 'The first sentence is a promise about the whole book: voice, world and question in one go.' } : null,
  simile: s => { const m = s.match(/\b(like|as) (a|an|the|if)\b[^,;.]{2,40}/i); return m ? { marks: [m[0]], why: 'A comparison with "like" or "as" lets one picture explain another.' } : null; },
  exclamation: s => /![”"’']?$/.test(s) ? { marks: [], why: 'The exclamation mark raises the voice — use it rarely and it really shouts.' } : null,
};

/** Quick pass over the bundled openings. Deterministic order shuffled by `seed` so rooms differ. */
export function lensFinds(tag: LensTag, limit = 3, seed = 0): LensFind[] {
  const out: LensFind[] = [];
  const books = listInstantClassicOpenings().filter(b => !NOT_VERBATIM.has(b.gutenbergId));
  const start = books.length ? seed % books.length : 0;
  for (let k = 0; k < books.length && out.length < limit; k++) {
    const b = books[(start + k) % books.length];
    let first = true;
    for (const p of b.paragraphs) {
      for (const s of sentences(p)) {
        const hit = PROBES[tag](s, { first });
        first = false;
        if (hit && s.length <= 420) { out.push({ tag, text: s, marks: hit.marks, why: hit.why, work: b.title, author: b.authors[0] || '', gutenbergId: b.gutenbergId }); break; }
      }
      if (out.length && out[out.length - 1].gutenbergId === b.gutenbergId) break;
    }
  }
  return out;
}

/** Stream one classic's full text and pull examples from anywhere in it. */
export async function deepScan(tag: LensTag, gutenbergId: string, limit = 4): Promise<LensFind[]> {
  const meta = CLASSIC_BOOKS.find(b => String(b.id) === String(gutenbergId));
  const url = getClassicBookTextUrl(gutenbergId);
  if (!url || !meta) return [];
  const { fetchBookText, cleanGutenbergMarkup } = await import('../bookContentService');
  const raw = cleanGutenbergMarkup(await fetchBookText(url));
  const body = raw.replace(/^[\s\S]*?\*\*\* ?START OF[^\n]*\n/i, '').replace(/\*\*\* ?END OF[\s\S]*$/i, '');
  const paras = body.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(p => p.length > 40);
  const out: LensFind[] = [];
  const step = Math.max(1, Math.floor(paras.length / 400));
  for (let i = 0; i < paras.length && out.length < limit; i += step) {
    for (const s of sentences(paras[i])) {
      const hit = PROBES[tag](s, { first: i === 0 });
      if (hit && s.length <= 420) { out.push({ tag, text: s, marks: hit.marks, why: hit.why, work: meta.title, author: meta.authors[0] || '', gutenbergId: String(meta.id) }); i += step * 20; break; }
    }
  }
  return out;
}

/** Classics the deep scan can read (have a text URL). */
export const deepScanShelf = () => CLASSIC_BOOKS.filter(b => getClassicBookTextUrl(String(b.id))).map(b => ({ id: String(b.id), title: b.title, author: b.authors[0] || '' }));
