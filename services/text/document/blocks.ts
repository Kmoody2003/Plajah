// document/blocks — the bridge between a Writer story and the legacy `TelaBlock[]` list.
//
// The story is the source of truth. `blocks` stays on the device, DERIVED from the story after
// every edit, so the many readers that predate the engine (plain-text bindings, Base items,
// lessons, books, articles, HTML export, Aria, Melos sync) keep working untouched. Block
// metadata (assignment roles, semantic spans, lesson data, domain ids…) lives on the paragraph
// as `meta` and is copied back verbatim.
//
// Legacy writers still exist (SET_WRITER_BLOCKS, domain hydration, direct rewrites). The story
// therefore records `blocksHash`, the signature of the blocks it last produced; whenever the
// device's blocks no longer match, `reconcileStory` folds the block changes back into the story,
// keeping rich paragraphs whose block is unchanged. Derivation is memoised per immutable
// paragraph, so typing re-derives one block, not the document.

import type { TelaBlock, TelaBlockKind } from '../../../types';
import { type Paragraph, type Run, type TextStory, newId, normalizeRuns, paragraphText } from '../model';
import { escapeHtml, htmlToParagraphs } from '../convert';
import { hashString } from '../layout/paragraph';

const LSEP = String.fromCharCode(0x2028);
const OBJ = String.fromCharCode(0xfffc);

const KIND_STYLE: Record<TelaBlockKind, string | undefined> = { h1: 'h1', h2: 'h2', p: undefined, li: 'list' };
const ROW = '::r';

export type BlockMeta = Omit<TelaBlock, 'id' | 'kind' | 'text'>;

/** Extra (non-content) fields of a block → paragraph meta. */
export function blockMeta(b: TelaBlock): BlockMeta | undefined {
  const { id: _i, kind: _k, text: _t, ...meta } = b;
  for (const k of Object.keys(meta) as (keyof BlockMeta)[]) if (meta[k] === undefined) delete meta[k];
  return Object.keys(meta).length ? meta : undefined;
}

/** One legacy block → one paragraph (inline strong/em/code/br; <br> becomes a forced line break). */
export function blockToParagraph(b: TelaBlock): Paragraph {
  const parsed = htmlToParagraphs(`<p>${b.text || ''}</p>`);
  const runs = normalizeRuns(parsed.flatMap((p, k) => (k ? [{ text: LSEP }, ...p.runs] : p.runs)));
  const meta = blockMeta(b);
  return { id: b.id, styleId: KIND_STYLE[b.kind] ?? undefined, runs, ...(meta ? { meta: meta as Record<string, unknown> } : {}) };
}

/** Legacy blocks → story (block ids become paragraph ids, so selections, assignments and
 *  reader highlights keyed by block id keep resolving). */
export function storyFromBlocks(blocks: TelaBlock[], storyId = newId('s')): TextStory {
  const paragraphs = blocks.map(blockToParagraph);
  return { id: storyId, paragraphs: paragraphs.length ? paragraphs : [{ id: newId(), runs: [{ text: '' }] }] };
}

function kindOf(p: Paragraph): TelaBlockKind {
  const s = p.styleId;
  if (s === 'h1' || s === 'title') return 'h1';
  if (s === 'h2' || s === 'h3' || s === 'h4' || s === 'h5' || s === 'h6' || s === 'subtitle') return 'h2';
  if (p.attrs?.list || s === 'list' || s === 'list-number') return 'li';
  return 'p';
}

/** Inline HTML the legacy readers understand (strong/em/code/br). Deleted (tracked) text and
 *  inline objects are left out: blocks describe the document as it reads now. */
export function runsToInlineHtml(runs: Run[]): string {
  let out = '';
  for (const r of runs) {
    if (r.attrs?.del || !r.text) continue;
    const text = r.text.split(OBJ).join('');
    if (!text) continue;
    let t = escapeHtml(text).split(LSEP).join('<br>');
    if (r.styleId === 'code' || r.attrs?.fontFamily === 'JetBrains Mono') t = `<code>${t}</code>`;
    if (r.attrs?.fontStyle === 'italic' || r.styleId === 'emphasis') t = `<em>${t}</em>`;
    if ((r.attrs?.fontWeight ?? 400) >= 600 || r.styleId === 'strong') t = `<strong>${t}</strong>`;
    out += t;
  }
  return out.replace(/<\/strong><strong>/g, '').replace(/<\/em><em>/g, '');
}

/** Plain text of a paragraph as it reads (no deleted text, no object characters). */
export function readingText(p: Paragraph): string {
  if (p.table) return p.table.rows.map(r => r.cells.filter(c => !c.vMerged).map(c => c.story.paragraphs.map(readingText).join(' ')).join('\t')).join('\n');
  let s = '';
  for (const r of p.runs) if (!r.attrs?.del) s += r.text;
  return s.split(OBJ).join('');
}

const derived = new WeakMap<Paragraph, TelaBlock[]>();

/** Blocks for one paragraph (a table yields one block per row). Memoised per paragraph object. */
export function paragraphBlocks(p: Paragraph): TelaBlock[] {
  const hit = derived.get(p);
  if (hit) return hit;
  let out: TelaBlock[];
  if (p.table) {
    out = p.table.rows.map((row, i) => ({
      id: `${p.id}${ROW}${i}`, kind: 'p' as const,
      text: row.cells.filter(c => !c.vMerged).map(c => c.story.paragraphs.map(q => runsToInlineHtml(q.runs)).join(' ')).join('\t'),
    }));
  } else {
    out = [{ ...((p.meta ?? {}) as BlockMeta), id: p.id, kind: kindOf(p), text: runsToInlineHtml(p.runs) }];
  }
  derived.set(p, out);
  return out;
}

export function deriveBlocks(story: TextStory): TelaBlock[] {
  const out: TelaBlock[] = [];
  for (const p of story.paragraphs) for (const b of paragraphBlocks(p)) out.push(b);
  return out;
}

const blockSig = new WeakMap<TelaBlock, string>();
function sigOf(b: TelaBlock): string {
  let s = blockSig.get(b);
  if (s === undefined) { s = hashString(JSON.stringify(b)); blockSig.set(b, s); }
  return s;
}
/** Signature of a block list (order + content + metadata). */
export function blocksHash(blocks: TelaBlock[]): string {
  let acc = '';
  for (const b of blocks) acc += sigOf(b) + ',';
  return hashString(acc) + ':' + blocks.length;
}

function sameContent(a: TelaBlock, b: TelaBlock): boolean { return a.kind === b.kind && a.text === b.text; }

/**
 * Fold an externally edited block list back into the story. Paragraphs whose derived block is
 * unchanged are kept (with all rich formatting); metadata changes are applied to them; changed or
 * new blocks become fresh paragraphs; missing blocks are removed. Tables survive when every one of
 * their row blocks is present and unchanged.
 */
export function reconcileStory(story: TextStory, blocks: TelaBlock[]): TextStory {
  const byId = new Map<string, Paragraph>();
  const current = new Map<string, TelaBlock>();
  for (const p of story.paragraphs) {
    byId.set(p.id, p);
    for (const b of paragraphBlocks(p)) current.set(b.id, b);
  }
  const incoming = new Map(blocks.map(b => [b.id, b]));
  const out: Paragraph[] = [];
  const emittedTables = new Set<string>();
  for (const b of blocks) {
    const cur = current.get(b.id);
    const rowAt = b.id.lastIndexOf(ROW);
    const tableId = rowAt > 0 ? b.id.slice(0, rowAt) : null;
    const table = tableId ? byId.get(tableId) : undefined;
    if (table?.table) {
      if (emittedTables.has(table.id)) continue;
      const rows = paragraphBlocks(table);
      const intact = rows.every(r => { const nb = incoming.get(r.id); return nb && sameContent(nb, r); });
      if (intact) { out.push(table); emittedTables.add(table.id); continue; }
    }
    const src = cur ? byId.get(b.id) : undefined;
    if (cur && src && !src.table && sameContent(cur, b)) {
      const meta = blockMeta(b) as Record<string, unknown> | undefined;
      const same = JSON.stringify(meta ?? null) === JSON.stringify(src.meta ?? null);
      out.push(same ? src : { ...src, meta });
      continue;
    }
    const fresh = blockToParagraph(b);
    // Keep the paragraph's own formatting when only the block kind is the same and the text was
    // rewritten (Aria rewrite, flying menu): the style follows the block kind.
    if (src && !src.table && cur?.kind === b.kind && src.styleId) fresh.styleId = src.styleId;
    out.push(fresh);
  }
  if (!out.length) out.push({ id: newId(), runs: [{ text: '' }] });
  return { ...story, paragraphs: out };
}

/** Paragraph from plain text (Aria, imports): "\n" becomes a forced line break. */
export function paragraphFromText(text: string, styleId?: string, id = newId()): Paragraph {
  return { id, styleId, runs: [{ text: text.replace(/\r\n?/g, '\n').split('\n').join(LSEP) }] };
}

export { paragraphText };
