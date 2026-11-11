/**
 * Wiktionary wikitext → structured Lexicon entries.
 *
 * Wiktionary's REST "definition" endpoint drops usage labels (slang, archaic…) and carries no etymology,
 * so the Lexicon reads the page's wikitext and renders the templates it needs itself. Unknown templates
 * degrade to their last positional argument or vanish; nothing here throws on odd markup.
 *
 * Pure: no fetch, no DOM. Tested in tests/lexicon.test.ts.
 */
import type { Cognate, EtymRelation, EtymStep, Etymology, LangEntry, PosBlock, Pronunciation, Seg, Sense, Translation, TranslationSense } from './types';
import { LANGS, codeForName, langName } from './languages';

// ─── template tokenizer ──────────────────────────────────────────────────────

export interface Tpl { name: string; pos: string[]; named: Record<string, string> }

/** Index just past the `}}` matching the `{{` at i (or s.length when unbalanced). */
function closeOf(s: string, i: number): number {
  let depth = 0;
  for (let k = i; k < s.length - 1; k++) {
    const two = s[k] + s[k + 1];
    if (two === '{{' || two === '[[') { depth++; k++; continue; }
    if (two === '}}' || two === ']]') { depth--; k++; if (depth === 0) return k + 1; continue; }
  }
  return s.length;
}

/** Split on top-level `|` (ignoring pipes inside nested templates/links). */
function splitArgs(inner: string): string[] {
  const out: string[] = []; let depth = 0; let cur = '';
  for (let k = 0; k < inner.length; k++) {
    const two = inner[k] + (inner[k + 1] ?? '');
    if (two === '{{' || two === '[[') { depth++; cur += two; k++; continue; }
    if (two === '}}' || two === ']]') { depth--; cur += two; k++; continue; }
    if (inner[k] === '|' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += inner[k];
  }
  out.push(cur);
  return out;
}

export function parseTpl(raw: string): Tpl {
  const inner = raw.replace(/^\{\{/, '').replace(/\}\}$/, '');
  const parts = splitArgs(inner);
  const name = (parts.shift() ?? '').trim();
  const pos: string[] = []; const named: Record<string, string> = {};
  for (const p of parts) {
    const m = p.match(/^\s*([A-Za-z_][\w-]*|\d+)\s*=([\s\S]*)$/);
    if (m && !/^\d+$/.test(m[1])) named[m[1]] = m[2].trim();
    else if (m) pos[Number(m[1]) - 1] = m[2].trim();
    else pos.push(p.trim());
  }
  return { name, pos: Array.from(pos, x => x ?? ''), named };
}

/** Every top-level template in a string, in order. */
export function templatesIn(s: string): Tpl[] {
  const out: Tpl[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === '{' && s[i + 1] === '{') { const end = closeOf(s, i); out.push(parseTpl(s.slice(i, end))); i = end - 1; }
  }
  return out;
}

// ─── inline rendering ────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…' };
function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripNoise(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>/]*\/>/gi, '')
    .replace(/<ref[\s\S]*?<\/ref>/gi, '');
}

const DROP_EXACT = new Set(['senseid', 'sid', 'defdate', 'attention', 'tea room', 'isbn', 'bottom', 'col-top', 'col-bottom', 'was wotd', 'wikipedia', 'wp', 'swp', 'slim-wikipedia', 'commonscat', 'picdic', 'root', 'cln', 'catlangname', 'c', 'topics', 'top', 'lena', 'rel-top', 'rel-bottom', 'see also', 'also', 'anchor', 'ipa', 'audio', 'rhymes', 'hyph', 'hyphenation', 'enpr', 'elements', 'multiple images', 'number box', 'nobr', 'etydate', 'etymon', 'ety', 'inline-ref', 'refn', 'rel3', 'checksense', 'wikispecies', 'pedialite', 'stroke order', 'character info', 'ja-kanjitab', 'zh-see', 'ja-see']);
const DROP_PREFIX = /^(R:|RQ:|cite|quote|rf|rfv|rfd|top\d|mid\d|bottom\d|der-top|der-mid|der-bottom|trans-|checktrans|ws |list:|table:|wikipedia)/i;
const isDropped = (n: string) => DROP_EXACT.has(n.toLowerCase()) || DROP_PREFIX.test(n);

const RELATION_WORD: Record<string, string> = {
  inh: '', 'inh+': 'Inherited from ', der: '', 'der+': 'Derived from ', bor: '', 'bor+': 'Borrowed from ',
  lbor: 'learned borrowing from ', slbor: 'semi-learned borrowing from ', obor: 'orthographic borrowing from ',
  uder: '', cal: 'calque of ', calque: 'calque of ', 'cal+': 'Calque of ', sl: 'semantic loan from ', 'sl+': 'Semantic loan from ',
  psm: 'phono-semantic matching of ', 'translit': 'transliteration of ', lbor_: '',
};
const ETYM_TPL = new Set(Object.keys(RELATION_WORD).concat(['derived', 'inherited', 'borrowed', 'learned borrowing']));

function gloss(t: Tpl, idx: number): string {
  return t.named.t || t.named.gloss || t.pos[idx] || '';
}

/** Render a wikitext fragment to segments. `home` = the language of the section being read. */
export function renderInline(src: string, home = 'en'): Seg[] {
  const s = stripNoise(src);
  const segs: Seg[] = [];
  const push = (t: string, w?: string, lang?: string) => {
    if (!t) return;
    const last = segs[segs.length - 1];
    if (!w && last && !last.w) last.t += t; else segs.push(w ? { t, w, ...(lang && lang !== home ? { lang } : {}) } : { t });
  };
  const word = (lang: string, w: string, alt?: string) => {
    const shown = (alt || w).replace(/^\*/, '*');
    const target = w.replace(/#.*$/, '');
    if (!target || target.startsWith('*') || target.startsWith('-')) push(shown); else push(shown, target, lang);
  };
  for (let i = 0; i < s.length; i++) {
    const two = s[i] + (s[i + 1] ?? '');
    if (two === '{{') {
      const end = closeOf(s, i); const t = parseTpl(s.slice(i, end)); i = end - 1;
      renderTpl(t, home, push, word);
      continue;
    }
    if (two === '[[') {
      const end = closeOf(s, i); const inner = s.slice(i + 2, end - 2); i = end - 1;
      const [target, text] = splitArgs(inner);
      if (/^(Category|File|Image|Thesaurus|Appendix|Wiktionary|Citations|Rhymes):/i.test(target)) {
        if (/^Thesaurus:/i.test(target)) push(text ?? target.replace(/^Thesaurus:/i, ''));
        continue;
      }
      if (/^(w|wikipedia|s|wikisource):/i.test(target)) { push(text ?? target.replace(/^\w+:/, '')); continue; }
      word(home, target, text);
      continue;
    }
    push(s[i]);
  }
  return segs
    .map(g => ({ ...g, t: decode(g.t.replace(/'''?/g, '').replace(/<\/?[a-z][^>]*>/gi, '')) }))
    .filter(g => g.t.length > 0);
}

type Push = (t: string, w?: string, lang?: string) => void;
type Word = (lang: string, w: string, alt?: string) => void;

function renderTpl(t: Tpl, home: string, push: Push, word: Word) {
  const n = t.name.trim();
  const ln = n.toLowerCase();
  if (isDropped(n)) return;
  if (['l', 'l-self', 'll', 'm', 'm-self', 'mention', 'link', 'm+'].includes(ln)) {
    const lang = t.pos[0]; word(lang, t.pos[1] ?? '', t.pos[2] || t.named.alt);
    const g = gloss(t, 3); if (g) push(` ‘${g}’`);
    return;
  }
  if (ETYM_TPL.has(ln)) {
    const src = t.pos[1]; const w = t.pos[2] ?? ''; const alt = t.pos[3] || t.named.alt;
    push(`${RELATION_WORD[ln] ?? ''}${langName(src)}`);
    if (w && w !== '-') { push(' '); word(src, w, alt); }
    const g = gloss(t, 4); if (g) push(` (“${g}”)`);
    return;
  }
  if (['cog', 'cognate', 'ncog', 'noncog', 'noncognate', 'cog+'].includes(ln)) {
    const langs = (t.pos[0] ?? '').split(',');
    push(langs.map(langName).join(', '));
    if (t.pos[1]) { push(' '); word(langs[0], t.pos[1], t.pos[2] || t.named.alt); }
    const g = gloss(t, 3); if (g) push(` (“${g}”)`);
    return;
  }
  if (['affix', 'af', 'compound', 'com', 'suffix', 'suf', 'prefix', 'pre', 'confix', 'con', 'blend', 'univerbation'].includes(ln)) {
    const lang = t.pos[0]; const parts = t.pos.slice(1).filter(Boolean);
    parts.forEach((p, k) => { if (k) push(' + '); word(lang, p); const g = t.named[`t${k + 1}`] || t.named[`gloss${k + 1}`]; if (g) push(` (“${g}”)`); });
    return;
  }
  if (ln === 'doublet' || ln === 'dbt') { push('Doublet of '); t.pos.slice(1).filter(Boolean).forEach((p, k) => { if (k) push(' and '); word(t.pos[0], p); }); return; }
  if (['gloss', 'gl'].includes(ln)) { push(`(${t.pos[0] ?? ''})`); return; }
  if (['q', 'qualifier', 'qual', 'i', 'qf', 'qq', 'sense', 's', 'lb', 'lbl', 'label', 'tlb', 'term-label'].includes(ln)) {
    const vals = (['lb', 'lbl', 'label', 'tlb', 'term-label'].includes(ln) ? t.pos.slice(1) : t.pos).filter(v => v && v !== '_' && v !== 'and' && v !== 'or');
    if (vals.length) push(`(${vals.join(', ')}) `);
    return;
  }
  if (['w', 'pedia', 'wp-lite', 'vern', 'taxlink', 'taxfmt', 'smallcaps', 'sc', 'upright', 'n-g', 'ngd', 'non-gloss definition', 'non-gloss', 'nowrap', 'lang', 'unsupported'].includes(ln)) {
    const v = ln === 'lang' ? t.pos[1] : ln === 'w' ? (t.pos[1] || t.pos[0]) : t.pos[0];
    push(v ?? '');
    return;
  }
  if (['ux', 'uxi', 'usex', 'quote'].includes(ln)) { push(t.pos[1] ?? ''); return; }
  if (['syn', 'synonyms', 'ant', 'antonyms', 'hyper', 'hypernyms', 'hypo', 'hyponyms', 'cot', 'coordinate terms', 'holo', 'mero', 'perfect', 'imperfect', 'trans-top', 'trans-bottom', 'trans-mid'].includes(ln)) return;
  if (/^(given name|surname|place|historical given name)$/i.test(n)) { push(n === 'surname' ? 'A surname.' : n === 'place' ? 'A place.' : 'A given name.'); return; }
  if (/ of$/i.test(n) || /^(alt|alternative) (form|spelling|case)$/i.test(n) || ['alt form', 'altform', 'abbr of', 'syn of', 'clipping', 'clip of'].includes(ln)) {
    const label = n.replace(/^alt\b/i, 'alternative').replace(/^abbr\b/i, 'abbreviation').replace(/^syn\b/i, 'synonym');
    push(label.charAt(0).toUpperCase() + label.slice(1) + ' ');
    if (t.pos[1]) word(t.pos[0], t.pos[1], t.pos[2]);
    const g = gloss(t, 3); if (g) push(` (“${g}”)`);
    return;
  }
  if (/^(en|de|fr|es|it|nl|sv|da|pt|la|ru)-/.test(ln)) return; // headword lines / inflection tables
  if (ln === 'm-g' || ln === 'gloss-lite') { push(t.pos[0] ?? ''); return; }
  // Unknown: keep the last positional value if it looks like prose, else drop.
  const last = t.pos.filter(Boolean).pop();
  if (last && !LANGS[last] && last.length < 80) push(last);
}

export const segText = (segs: Seg[]) => segs.map(s => s.t).join('').replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1').trim();

// ─── sections ────────────────────────────────────────────────────────────────

export const POS_HEADINGS = new Set([
  'Noun', 'Verb', 'Adjective', 'Adverb', 'Pronoun', 'Preposition', 'Conjunction', 'Interjection', 'Determiner',
  'Article', 'Numeral', 'Particle', 'Proper noun', 'Phrase', 'Prepositional phrase', 'Proverb', 'Idiom', 'Prefix',
  'Suffix', 'Infix', 'Affix', 'Circumfix', 'Interfix', 'Contraction', 'Symbol', 'Letter', 'Abbreviation', 'Initialism', 'Acronym',
  'Participle', 'Postposition', 'Classifier', 'Number', 'Adnominal', 'Counter', 'Root', 'Combining form',
]);

interface Section { level: number; title: string; body: string }

export function splitSections(wikitext: string): Section[] {
  const lines = wikitext.split('\n');
  const out: Section[] = []; let cur: Section | null = null; const buf: string[] = [];
  const flush = () => { if (cur) { cur.body = buf.join('\n'); out.push(cur); } buf.length = 0; };
  for (const line of lines) {
    const m = line.match(/^(={2,6})\s*(.+?)\s*\1\s*$/);
    if (m) { flush(); cur = { level: m[1].length, title: m[2].replace(/<!--.*?-->/g, '').trim(), body: '' }; continue; }
    buf.push(line);
  }
  flush();
  return out;
}

/** Words listed in a Synonyms/Derived terms style section, from links, {{l}} and {{col*}} forms. */
export function listedWords(body: string, lang: string): string[] {
  const out: string[] = [];
  const add = (w?: string) => { const v = (w ?? '').replace(/<[^>]*>/g, '').replace(/#.*$/, '').trim(); if (v && !v.includes(':') && !out.includes(v)) out.push(v); };
  for (const t of templatesIn(stripNoise(body))) {
    const ln = t.name.toLowerCase();
    if (['l', 'l-self', 'll', 'm'].includes(ln) && (t.pos[0] === lang || !t.pos[0])) add(t.pos[1]);
    else if (/^(col|der|rel|hyp|desc)\d*(-u)?$/.test(ln) || ln === 'col-auto' || ln === 'syn-saurus') t.pos.slice(1).forEach(add);
  }
  for (const m of stripNoise(body).matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) add(m[1]);
  return out;
}

function parsePronunciation(body: string, lang: string): Pronunciation {
  const p: Pronunciation = { ipa: [], audio: [] };
  for (const t of templatesIn(stripNoise(body))) {
    const ln = t.name.toLowerCase();
    if (ln === 'ipa') for (const v of t.pos.slice(1)) { if (v && /[/\[]/.test(v) && !p.ipa.includes(v)) p.ipa.push(v); }
    else if (ln === 'audio' && t.pos[1]) {
      const file = t.pos[1];
      p.audio.push({ file, url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}`, accent: t.named.a || t.pos[2] || undefined });
    }
    else if (ln === 'rhymes' && t.pos[1]) p.rhymes = `-${t.pos[1]}`;
    else if ((ln === 'hyph' || ln === 'hyphenation') && t.pos.length > 1) p.syllables = t.pos.slice(1).filter(Boolean).join('·');
  }
  return p;
}

// ─── definitions ─────────────────────────────────────────────────────────────

const LABEL_TPL = new Set(['lb', 'lbl', 'label', 'tlb', 'term-label']);

function parseDefinitions(body: string, lang: string, idBase: string): { senses: Sense[]; forms?: string } {
  const senses: Sense[] = [];
  let forms: string | undefined;
  const lines = stripNoise(body).split('\n');
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!forms && line.startsWith('{{') && !line.startsWith('{{wiki')) {
      const t = parseTpl(line.slice(0, closeOf(line, 0)));
      const named = Object.entries(t.named).filter(([k]) => /^(pl|plural|past|pres_ptc|comparative|superlative|f|m|g)\d*$/.test(k)).map(([k, v]) => `${k} ${v}`);
      const bits = t.pos.slice(1).filter(v => v && v.length < 30 && !/^[~+-]$/.test(v));
      forms = [...bits, ...named].slice(0, 6).join(', ') || undefined;
      continue;
    }
    const m = line.match(/^(#+)([:*]*)\s*(.*)$/);
    if (!m) continue;
    const depth = m[1].length; const mark = m[2]; const content = m[3];
    if (!mark) {
      const labels: string[] = []; let dated: string | undefined;
      for (const t of templatesIn(content)) {
        if (LABEL_TPL.has(t.name.toLowerCase())) labels.push(...t.pos.slice(1).filter(v => v && v !== '_' && v !== 'and' && v !== 'or'));
        if (t.name.toLowerCase() === 'defdate' && t.pos[0]) dated = t.pos[0];
      }
      // Labels shown as chips, not as "(slang)" inside the text.
      const textSrc = content.replace(/\{\{\s*(lb|lbl|label|tlb|term-label)\s*\|[^{}]*\}\}\s*/gi, '');
      const text = renderInline(textSrc, lang);
      if (!segText(text)) continue;
      senses.push({ id: `${idBase}.${senses.length + 1}`, text, labels, examples: [], dated, synonyms: [], antonyms: [], depth: Math.min(depth, 2) });
      continue;
    }
    const target = senses[senses.length - 1];
    if (!target || mark.startsWith('*')) continue; // quotations are skipped — long and often copyrighted-adjacent
    for (const t of templatesIn(content)) {
      const ln = t.name.toLowerCase();
      if (['syn', 'synonyms', 'synonym'].includes(ln)) target.synonyms.push(...t.pos.slice(1).filter(v => v && !v.startsWith('Thesaurus:')).map(v => v.replace(/<[^>]*>/g, '')));
      if (['ant', 'antonyms', 'antonym'].includes(ln)) target.antonyms.push(...t.pos.slice(1).filter(Boolean).map(v => v.replace(/<[^>]*>/g, '')));
      if (['ux', 'uxi', 'usex'].includes(ln) && t.pos[1]) target.examples.push(segText(renderInline(t.pos[1], lang)));
    }
    if (!/\{\{\s*(syn|ant|ux|uxi|usex|hyper|hypo|cot|holo|mero)/i.test(content)) {
      const ex = segText(renderInline(content, lang));
      if (ex && ex.length < 400) target.examples.push(ex);
    }
  }
  return { senses, forms };
}

// ─── etymology ───────────────────────────────────────────────────────────────

const REL_OF: Record<string, EtymRelation> = {
  inh: 'inherited', 'inh+': 'inherited', inherited: 'inherited',
  der: 'derived', 'der+': 'derived', derived: 'derived', uder: 'derived',
  bor: 'borrowed', 'bor+': 'borrowed', borrowed: 'borrowed', obor: 'borrowed',
  lbor: 'learned', slbor: 'learned', 'learned borrowing': 'learned',
  cal: 'calque', calque: 'calque', 'cal+': 'calque', sl: 'semantic', 'sl+': 'semantic', psm: 'semantic',
};

export function parseEtymology(body: string, lang: string): Etymology {
  const clean = stripNoise(body).replace(/\{\{\s*col-(top|bottom)[^}]*\}\}/gi, '');
  const chain: EtymStep[] = []; const cognates: Cognate[] = []; const roots: EtymStep[] = []; const doublets: string[] = [];
  const seen = new Set<string>();
  for (const t of templatesIn(clean)) {
    const ln = t.name.toLowerCase();
    const rel = REL_OF[ln];
    if (rel && t.pos[1]) {
      const key = `${t.pos[1]}|${t.pos[2] ?? ''}`;
      if (seen.has(key)) continue; seen.add(key);
      chain.push({ lang: t.pos[1], langName: langName(t.pos[1]), word: t.pos[2] && t.pos[2] !== '-' ? t.pos[2] : '', gloss: gloss(t, 4) || undefined, relation: rel });
    } else if (['cog', 'cognate', 'cog+'].includes(ln) && t.pos[0]) {
      for (const c of t.pos[0].split(',')) cognates.push({ lang: c.trim(), langName: langName(c.trim()), word: t.pos[1] ?? '', gloss: gloss(t, 3) || undefined });
    } else if (ln === 'root' && t.pos[1]) {
      for (const r of t.pos.slice(2).filter(Boolean)) roots.push({ lang: t.pos[1], langName: langName(t.pos[1]), word: r, relation: 'root' });
    } else if ((ln === 'doublet' || ln === 'dbt')) {
      doublets.push(...t.pos.slice(1).filter(Boolean));
    } else if (['affix', 'af', 'compound', 'com', 'suffix', 'prefix', 'confix', 'blend'].includes(ln) && chain.length === 0) {
      const parts = t.pos.slice(1).filter(Boolean);
      if (parts.length) chain.push({ lang: t.pos[0] || lang, langName: langName(t.pos[0] || lang), word: parts.join(' + '), relation: 'compound' });
    }
  }
  // Roots attached to an ancestor ({{der|en|ine-pro|*x}}) also count as roots.
  for (const c of chain) if (c.lang === 'ine-pro' && !roots.some(r => r.word === c.word)) roots.push({ ...c, relation: 'root' });
  const prose = renderInline(clean.replace(/^\s*\{\{\s*root[^}]*\}\}\s*/gim, '').trim(), lang);
  const text = segText(prose);
  const att = text.match(/(?:first )?attested (?:in|from|since|as early as|by)[^.;]*(?:[.;]|$)/i) || text.match(/\b(?:since|from) the (\d{1,2})(?:st|nd|rd|th) century[^.;]*/i);
  return { prose, chain, cognates, roots, doublets, attested: att ? att[0].replace(/[.;]$/, '') : undefined };
}

// ─── translations ────────────────────────────────────────────────────────────

export function parseTranslations(body: string): { senses: TranslationSense[]; subpage: boolean } {
  const out: TranslationSense[] = []; let cur: TranslationSense | null = null; let skip = false;
  const subpage = /\{\{\s*(see translation subpage|trans-see)/i.test(body) && !/\{\{\s*trans-top/i.test(body);
  let parent = '';
  for (const raw of stripNoise(body).split('\n')) {
    const line = raw.trim();
    const top = line.match(/\{\{\s*(trans-top|checktrans-top|trans-top-also)\s*(?:\|([^}]*))?\}\}/i);
    if (top) {
      skip = /checktrans/i.test(top[1]);
      const args = top[2] ? splitArgs(top[2]).filter(a => !/^\s*\w+\s*=/.test(a)) : [];
      cur = skip ? null : { gloss: segText(renderInline(args[0] ?? '')) || 'general', items: [] };
      if (cur) out.push(cur);
      continue;
    }
    if (/\{\{\s*trans-see/i.test(line)) {
      const t = templatesIn(line)[0];
      out.push({ gloss: t?.pos[0] ? segText(renderInline(t.pos[0])) : 'see also', items: [], ...(t?.pos[1] ? { see: t.pos[1] } as object : {}) } as TranslationSense);
      continue;
    }
    if (/\{\{\s*trans-bottom/i.test(line)) { cur = null; continue; }
    if (!cur || skip) continue;
    const m = line.match(/^\*(:?)\s*([^:{]+?):\s*(.*)$/);
    if (!m) continue;
    const isSub = m[1] === ':'; const label = m[2].trim(); const rest = m[3];
    if (!isSub) parent = label;
    const shown = isSub ? `${label}` : label;
    for (const t of templatesIn(rest)) {
      const ln = t.name.toLowerCase();
      if (!['t', 't+', 'tt', 'tt+', 't-', 't+check', 't-check', 't-simple'].includes(ln)) continue;
      if (!t.pos[1]) continue;
      const genders = t.pos.slice(2).filter(g => /^[mfnc](-[ps])?$|^p$|^s$|^[mfn]p$/.test(g));
      cur.items.push({
        lang: t.pos[0], langName: shown || langName(t.pos[0]), word: segText(renderInline(t.named.alt || t.pos[1])),
        gender: genders.join(' ') || undefined, tr: t.named.tr || t.named.ts || undefined,
        note: isSub && parent ? parent : undefined,
      });
    }
  }
  return { senses: out.filter(s => s.items.length || (s as any).see), subpage };
}

function parseDescendants(body: string): Translation[] {
  const out: Translation[] = [];
  for (const t of templatesIn(stripNoise(body))) {
    const ln = t.name.toLowerCase();
    if (['desc', 'descendant', 'desctree', 'l'].includes(ln) && t.pos[0] && t.pos[1]) out.push({ lang: t.pos[0], langName: langName(t.pos[0]), word: t.pos[1], note: t.named.bor ? 'borrowed' : undefined });
  }
  return out;
}

// ─── page ────────────────────────────────────────────────────────────────────

export interface ParsedPage { langs: LangEntry[]; translationsSubpage: boolean }

export function parsePage(wikitext: string): ParsedPage {
  const sections = splitSections(wikitext);
  const langs: LangEntry[] = [];
  let L: LangEntry | null = null;
  let group: LangEntry['etymologies'][number] | null = null;
  let pos: PosBlock | null = null;
  let subpage = false;
  let posCount = 0;
  for (const sec of sections) {
    if (sec.level === 2) {
      L = { lang: codeForName(sec.title), langName: sec.title, etymologies: [], synonyms: [], antonyms: [], derived: [], related: [], descendants: [], translations: [] };
      langs.push(L); group = null; pos = null; posCount = 0;
      continue;
    }
    if (!L) continue;
    const title = sec.title.replace(/\s+\d+$/, '');
    if (title === 'Etymology') {
      group = { etymology: parseEtymology(sec.body, L.lang), pos: [] };
      L.etymologies.push(group); pos = null;
      continue;
    }
    if (title === 'Pronunciation') {
      const p = parsePronunciation(sec.body, L.lang);
      if (!L.pronunciation) L.pronunciation = p;
      else { for (const i of p.ipa) if (!L.pronunciation.ipa.includes(i)) L.pronunciation.ipa.push(i); L.pronunciation.audio.push(...p.audio); }
      continue;
    }
    if (POS_HEADINGS.has(title)) {
      if (!group) { group = { pos: [] }; L.etymologies.push(group); }
      const { senses, forms } = parseDefinitions(sec.body, L.lang, `${L.lang}.${++posCount}`);
      pos = { pos: title, senses, forms };
      group.pos.push(pos);
      continue;
    }
    if (title === 'Synonyms') { const w = listedWords(sec.body, L.lang); L.synonyms.push(...w.filter(x => !L!.synonyms.includes(x))); continue; }
    if (title === 'Antonyms') { const w = listedWords(sec.body, L.lang); L.antonyms.push(...w.filter(x => !L!.antonyms.includes(x))); continue; }
    if (title === 'Derived terms' || title === 'Compounds') { L.derived.push(...listedWords(sec.body, L.lang).filter(x => !L!.derived.includes(x))); continue; }
    if (title === 'Related terms') { L.related.push(...listedWords(sec.body, L.lang).filter(x => !L!.related.includes(x))); continue; }
    if (title === 'Descendants') { L.descendants.push(...parseDescendants(sec.body)); continue; }
    if (title === 'Translations') {
      const tr = parseTranslations(sec.body);
      if (tr.subpage) subpage = true;
      L.translations.push(...tr.senses);
      continue;
    }
  }
  // Drop language sections with nothing to show.
  return { langs: langs.filter(l => l.etymologies.some(g => g.pos.some(p => p.senses.length))), translationsSubpage: subpage };
}

/** Senses flagged by Wiktionary as slang/colloquial/vulgar — feeds the Slang tab. */
export const SLANG_LABELS = /^(slang|colloquial|informal|vulgar|derogatory|offensive|street|internet slang|Internet slang|AAVE|African-American Vernacular|MLE|Multicultural London English|cant|thieves' cant|Cockney rhyming slang|rhyming slang|euphemistic|LGBTQ slang|gay slang|military slang|prison slang|drug slang|teen slang|youth slang|Gen Z slang|hip-hop|Polari)$/i;
export const EXPLICIT_LABELS = /^(vulgar|offensive|derogatory|ethnic slur|slur|sexual|pejorative)$/i;
