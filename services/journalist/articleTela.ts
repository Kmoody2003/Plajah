// Article <-> Tela bridge. PURE (no Firebase, no React, no browser APIs) so it is testable in
// node and reusable on the server. The article engine keeps the block editor as its input
// surface and projects every article into a Tela document:
//
//   masthead frame  (VECTOR device: a gallery template's opener page with the headline/deck/
//                    byline/hero slots filled, or a built-in masthead when no template is chosen)
//   writer frames   (WRITER devices: the story text, split wherever a media block interrupts it)
//   media frames    (MEDIA devices: inline image / audio / video blocks, with captions)
//
// Legacy articles (blocks only, no Tela doc) go through the same builder to produce a read-only
// snapshot, so one renderer (TelaEmbed) serves old and new articles.

import type { TelaBlock, TelaDevice, TelaDoc, TelaFrame, TelaMediaDevice, TelaVectorObject } from '../../types';

export interface ArticleBlockLike {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'QUOTE' | 'HEADING';
  content: string;
  caption?: string;
}

export interface ArticleLike {
  id?: string;
  title: string;
  subtitle?: string;
  authorName?: string;
  category?: string;
  coverImage?: string;
  coverCredit?: string;
  blocks: ArticleBlockLike[];
  dateline?: string;
  timestamp?: number;
}

/** Structural subset of TelaDesignTemplate so this file does not import the whole registry. */
export interface TemplateLike {
  id: string;
  name: string;
  group?: string;
  collection?: string;
  tags?: string[];
  palette: string[];
  width: number;
  height: number;
  pages: Array<{ label: string; build: () => TelaVectorObject[] }>;
}

export const ARTICLE_FRAME_W = 720;

// ── Template feature detection ────────────────────────────────────────────────

export type ArticleTemplateKind = 'ARTICLE' | 'MAGAZINE' | 'CATALOG';

/**
 * The 12 article / 12 magazine / catalog templates arrive in the publication registry from
 * another workstream. We do not assume they exist: this returns [] until a template whose
 * gallery group (or tag) is the requested category shows up.
 */
export function templatesForKind(gallery: ReadonlyArray<TemplateLike>, kind: ArticleTemplateKind): TemplateLike[] {
  const k = kind.toLowerCase();
  return gallery.filter(t => (t.group || '').toUpperCase() === kind || (t.tags || []).some(tag => tag.toLowerCase() === k));
}

/** Pick the page of a template that works as an article opener. */
export function openerPage(t: TemplateLike): TemplateLike['pages'][number] | undefined {
  const rank = (label: string) => /feature opener|article|cover/i.test(label) ? (/feature opener/i.test(label) ? 0 : /article/i.test(label) ? 1 : 2) : 9;
  return [...t.pages].sort((a, b) => rank(a.label) - rank(b.label))[0];
}

// ── Text helpers ──────────────────────────────────────────────────────────────

const escInline = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Strip the inline HTML Writer blocks may carry. */
export const stripInline = (html: string) =>
  html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export const isMediaBlock = (b: ArticleBlockLike) => b.type === 'IMAGE' || b.type === 'AUDIO' || b.type === 'VIDEO';

/** Body text for style checks, fingerprints, feeds and search. Media is skipped; headings kept. */
export function articlePlainText(blocks: ReadonlyArray<ArticleBlockLike>): string {
  return blocks.filter(b => !isMediaBlock(b)).map(b => b.content.trim()).filter(Boolean).join('\n\n');
}

export function articleBodyHtml(blocks: ReadonlyArray<ArticleBlockLike>): string {
  return blocks.map(b => {
    const c = escInline(b.content.trim());
    if (!c && !isMediaBlock(b)) return '';
    switch (b.type) {
      case 'HEADING': return `<h2>${c}</h2>`;
      case 'QUOTE': return `<blockquote>${c.replace(/\n/g, '<br>')}${b.caption ? `<footer>${escInline(b.caption)}</footer>` : ''}</blockquote>`;
      case 'IMAGE': return b.content ? `<figure><img src="${escInline(b.content).replace(/"/g, '&quot;')}" alt="${escInline(b.caption || '')}">${b.caption ? `<figcaption>${escInline(b.caption)}</figcaption>` : ''}</figure>` : '';
      case 'AUDIO': return b.content ? `<p><a href="${escInline(b.content).replace(/"/g, '&quot;')}">Listen: ${escInline(b.caption || 'audio')}</a></p>` : '';
      case 'VIDEO': return b.content ? `<p><a href="${escInline(b.content).replace(/"/g, '&quot;')}">Watch: ${escInline(b.caption || 'video')}</a></p>` : '';
      default: return `<p>${c.replace(/\n/g, '<br>')}</p>`;
    }
  }).filter(Boolean).join('\n');
}

export const wordCount = (text: string) => (text.match(/[\w'’-]+/g) || []).length;
export const readMinutes = (words: number) => Math.max(1, Math.round(words / 230));

/** Plain text of a whole Tela article doc (writer frames only). Used by the legacy export + search. */
export function telaDocPlainText(doc: Pick<TelaDoc, 'frames' | 'devices'>): string {
  const out: string[] = [];
  for (const f of doc.frames) for (const id of f.deviceIds) {
    const d = doc.devices[id];
    if (d && d.type === 'WRITER') for (const b of d.blocks) { const t = stripInline(b.text).trim(); if (t) out.push(t); }
  }
  return out.join('\n\n');
}

/**
 * Writer frames clip to their height, so the height must be estimated from the copy.
 * It is a layout ESTIMATE (17px serif, ~84 chars/line at 720px); it errs tall so nothing is clipped.
 */
export function estimateWriterHeight(blocks: ReadonlyArray<TelaBlock>, width = ARTICLE_FRAME_W): number {
  const charsPerLine = Math.max(30, Math.floor((width - 80) / 8.4));
  let h = 56;
  for (const b of blocks) {
    const len = stripInline(b.text).length;
    const lines = Math.max(1, Math.ceil(len / (b.kind === 'h1' ? charsPerLine * 0.55 : b.kind === 'h2' ? charsPerLine * 0.75 : charsPerLine)));
    const lh = b.kind === 'h1' ? 50 : b.kind === 'h2' ? 36 : 28;
    h += lines * lh + (b.kind === 'p' || b.kind === 'li' ? 18 : 26);
  }
  return Math.ceil(h * 1.08 + 24);
}

// ── Masthead ──────────────────────────────────────────────────────────────────

let seq = 0;
const oid = (p: string) => `${p}_${(++seq).toString(36)}`;

const textObj = (x: number, y: number, w: number, h: number, text: string, size: number, fill: string, role: TelaVectorObject['templateRole'], extra: Partial<TelaVectorObject> = {}): TelaVectorObject => ({
  id: oid('txt'), kind: 'TEXT', x, y, w, h, fill, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, text, fontSize: size,
  fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, wrap: true, textAlign: 'left', lineHeight: 1.14, templateRole: role, ...extra,
});
const rectObj = (x: number, y: number, w: number, h: number, fill: string, role: TelaVectorObject['templateRole'] = 'GROUND'): TelaVectorObject => ({
  id: oid('rect'), kind: 'RECT', x, y, w, h, fill, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, rx: 0, templateRole: role,
});

/** "Oct. 8, 2026" style, UTC so the same article always renders the same string. */
export function apDate(ms: number): string {
  const d = new Date(ms);
  const months = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function bylineText(a: ArticleLike): string {
  const parts = [a.authorName ? `By ${a.authorName}` : '', a.timestamp ? apDate(a.timestamp) : ''].filter(Boolean);
  return parts.join('  ·  ');
}

/** Fill a template page's slots with the article. Slots are found by templateRole, never by position. */
export function fillTemplateObjects(objects: ReadonlyArray<TelaVectorObject>, a: ArticleLike): TelaVectorObject[] {
  let headline = false; let deck = false; let label = false;
  const out: TelaVectorObject[] = [];
  for (const o of objects) {
    const c: TelaVectorObject = { ...o, id: o.id };
    if (c.kind === 'TEXT') {
      if (c.templateRole === 'HEADLINE' && !headline) { c.text = a.title; headline = true; }
      else if (c.templateRole === 'DECK' && !deck) { c.text = a.subtitle || ''; deck = true; if (!a.subtitle) continue; }
      else if (c.templateRole === 'LABEL' && !label) { c.text = [a.category, bylineText(a)].filter(Boolean).join('  ·  '); label = true; }
      else if (c.templateRole === 'BODY' || c.templateRole === 'CAPTION' || c.templateRole === 'FOLIO') continue; // body lives in the Writer frames
    }
    out.push(c);
  }
  return out;
}

function builtInMasthead(a: ArticleLike, palette: string[]): { objects: TelaVectorObject[]; w: number; h: number } {
  const [paper = '#FBF8F2', ink = '#16130F', accent = '#B3261E'] = palette;
  const w = ARTICLE_FRAME_W; const m = 40;
  const titleSize = a.title.length > 70 ? 38 : a.title.length > 40 ? 46 : 54;
  const titleLines = Math.max(1, Math.ceil((a.title.length * titleSize * 0.52) / (w - m * 2)));
  const titleH = Math.ceil(titleLines * titleSize * 1.18);
  let y = m;
  const objects: TelaVectorObject[] = [rectObj(0, 0, w, 10, accent, 'RULE')];
  objects.unshift(rectObj(0, 0, w, 4000, paper, 'GROUND'));
  if (a.category) { objects.push(textObj(m, y + 10, w - m * 2, 22, a.category.toUpperCase(), 13, accent, 'LABEL', { fontWeight: 800, letterSpacing: 0.14, fontFamily: 'Inter, system-ui, sans-serif' })); y += 44; }
  else y += 20;
  objects.push(textObj(m, y, w - m * 2, titleH, a.title, titleSize, ink, 'HEADLINE')); y += titleH + 14;
  if (a.subtitle) {
    const dh = Math.ceil(Math.max(1, Math.ceil((a.subtitle.length * 21 * 0.5) / (w - m * 2))) * 21 * 1.3);
    objects.push(textObj(m, y, w - m * 2, dh, a.subtitle, 21, ink, 'DECK', { fontWeight: 400, opacity: 0.78, lineHeight: 1.3 })); y += dh + 14;
  }
  const by = bylineText(a);
  if (by) { objects.push(textObj(m, y, w - m * 2, 20, by, 13, ink, 'LABEL', { fontWeight: 600, opacity: 0.6, fontFamily: 'Inter, system-ui, sans-serif' })); y += 30; }
  objects.push(rectObj(m, y, w - m * 2, 2, ink, 'RULE')); y += 18;
  // The ground rect was oversized for the unshift above; clamp it to the real height.
  objects[0] = { ...objects[0], h: y };
  objects[1] = { ...objects[1], w, h: 10 };
  return { objects, w, h: y };
}

// ── Doc builder ───────────────────────────────────────────────────────────────

export interface BuildOptions {
  docId?: string;
  ownerId?: string;
  template?: TemplateLike | null;
  now?: number;
}

const blockKindFor = (b: ArticleBlockLike): TelaBlock['kind'] => (b.type === 'HEADING' ? 'h2' : 'p');

export function buildArticleTelaDoc(a: ArticleLike, opts: BuildOptions = {}): TelaDoc {
  const now = opts.now ?? Date.now();
  const docId = opts.docId || `article:${a.id || 'draft'}`;
  const frames: TelaFrame[] = []; const devices: Record<string, TelaDevice> = {};
  let y = 0;
  const add = (f: Omit<TelaFrame, 'x' | 'y' | 'kind' | 'preset'>) => { frames.push({ ...f, kind: 'SCREEN', preset: 'FREE', x: 0, y }); y += f.h + 24; };

  // masthead
  const tpl = opts.template || null;
  const page = tpl ? openerPage(tpl) : undefined;
  let mast: { objects: TelaVectorObject[]; w: number; h: number };
  if (tpl && page) {
    let built: TelaVectorObject[] = [];
    try { built = page.build(); } catch { built = []; }
    mast = built.length ? { objects: fillTemplateObjects(built, a), w: tpl.width, h: tpl.height } : builtInMasthead(a, tpl.palette);
  } else mast = builtInMasthead(a, tpl?.palette || []);
  const mid = `${docId}:masthead`;
  devices[mid] = { id: mid, type: 'VECTOR', name: 'Masthead', width: mast.w, height: mast.h, objects: mast.objects } as TelaDevice;
  add({ id: `${docId}:f:masthead`, w: mast.w, h: mast.h, deviceIds: [mid], label: 'Masthead' });

  // cover photo (template image slots hold placeholder art; the real cover is its own media frame)
  if (a.coverImage) {
    const cid = `${docId}:cover`;
    devices[cid] = { id: cid, type: 'MEDIA', kind: 'IMAGE', name: a.coverCredit ? `Cover. ${a.coverCredit}` : 'Cover', src: a.coverImage, mimeType: '', size: 0, width: ARTICLE_FRAME_W, height: 405 } as TelaMediaDevice;
    add({ id: `${docId}:f:cover`, w: ARTICLE_FRAME_W, h: 405, deviceIds: [cid], label: 'Cover' });
  }

  // body: split on media blocks
  let seg: TelaBlock[] = []; let segN = 0;
  const flush = () => {
    if (!seg.length) return;
    const id = `${docId}:body${++segN}`;
    devices[id] = { id, type: 'WRITER', mode: 'DOCUMENT', blocks: seg } as TelaDevice;
    add({ id: `${docId}:f:body${segN}`, w: ARTICLE_FRAME_W, h: estimateWriterHeight(seg), deviceIds: [id], label: `Story ${segN}` });
    seg = [];
  };
  let mediaN = 0;
  for (const b of a.blocks) {
    if (isMediaBlock(b)) {
      if (!b.content) continue;
      flush();
      const id = `${docId}:media${++mediaN}`;
      const kind = b.type === 'IMAGE' ? 'IMAGE' : b.type === 'AUDIO' ? 'AUDIO' : 'VIDEO';
      const h = kind === 'IMAGE' ? 405 : kind === 'AUDIO' ? 140 : 405;
      const md: TelaMediaDevice = { id, type: 'MEDIA', kind, name: b.caption || `${kind.toLowerCase()} ${mediaN}`, src: b.content, mimeType: '', size: 0, width: ARTICLE_FRAME_W, height: h };
      devices[id] = md;
      add({ id: `${docId}:f:media${mediaN}`, w: ARTICLE_FRAME_W, h, deviceIds: [id], label: b.caption || 'Media' });
      if (b.caption) {
        seg.push({ id: `${b.id}:cap`, kind: 'p', text: `<em>${escInline(b.caption)}</em>` });
      }
      continue;
    }
    const text = b.content.trim();
    if (!text) continue;
    const tb: TelaBlock = { id: b.id, kind: blockKindFor(b), text: escInline(text).replace(/\n/g, '<br>') };
    if (b.type === 'QUOTE') { tb.textRole = 'QUOTE'; tb.text = `<em>“${escInline(text.replace(/^["“]|["”]$/g, ''))}”</em>${b.caption ? ` — ${escInline(b.caption)}` : ''}`; }
    seg.push(tb);
  }
  flush();

  return {
    id: docId, ownerId: opts.ownerId || '', title: a.title || 'Untitled article', frames, devices,
    createdAt: now, updatedAt: now,
    ...(tpl ? { templatePreset: { schemaVersion: 1 as const, templateId: tpl.id, status: 'available' as const } } : {}),
  };
}

/** Read-only snapshot for a legacy blocks-only article. Deterministic id so it never collides with a real doc. */
export function legacyArticleSnapshot(a: ArticleLike & { id: string }): TelaDoc {
  return buildArticleTelaDoc(a, { docId: `legacy:${a.id}`, ownerId: '', now: a.timestamp || 0 });
}

/**
 * `articlePlainText` joins non-media blocks with a blank line. Style/claim offsets index into that
 * string; this maps an offset range back to the block (and range inside it) so a fix can be applied
 * to the block content. Returns null when the range crosses a block boundary.
 */
export function locateInBlocks(blocks: ReadonlyArray<ArticleBlockLike>, start: number, end: number): { blockId: string; start: number; end: number } | null {
  let pos = 0;
  for (const b of blocks) {
    if (isMediaBlock(b)) continue;
    const raw = b.content;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lead = raw.indexOf(trimmed);
    const from = pos; const to = pos + trimmed.length;
    if (start >= from && end <= to) return { blockId: b.id, start: start - from + lead, end: end - from + lead };
    pos = to + 2;
  }
  return null;
}
