// openstaxImport — bring an OpenStax textbook onto Plajah as a natively readable book.
//
// Policy this implements (Plajah, Aug 2026): textbooks are NEVER part of Plajah+, are NEVER
// charged for, and are free to every account on the platform. That posture is what makes the
// CC BY-NC-SA titles safe to host — NonCommercial restricts commercial use, not hosting, and a
// textbook that sits entirely outside the paid tier is not commercial use. The licence gate
// still refuses to let NC material into a paid course; hosting and selling are separate
// questions and only one of them is open.
//
// Shape: books live in `albums` with type 'BOOK' (see syncPublicDomainAsset). A 328-page
// textbook cannot be inlined — Firestore documents cap at 1 MB — so the full text goes to
// Firebase Storage and the album carries ONE TXT chapter pointing at it, exactly like
// /api/admin/seed-classic-books does for Gutenberg. BookReader then fetches that file and
// derives its own chapter list from the `Chapter N` headings this module emits.
//
// The upstream API, verified working:
//   /rex/release.json                                  → archiveUrl + bookId → defaultVersion
//   /apps/cms/api/v2/pages/?type=books.Book            → slug → cnx_id
//   {archive}/contents/{bookId}@{ver}.json             → licence + table of contents
//   {archive}/contents/{bookId}@{ver}:{pageUuid}.json  → one page of HTML

import type { License } from './oerLicenseGate';

const OPENSTAX = 'https://openstax.org';

export interface OpenStaxBookRef {
  slug: string;
  title: string;
  bookId: string;
  version: string;
  archiveUrl: string;
  license: License;
  licenseUrl: string;
}

export interface OpenStaxPage {
  id: string;
  title: string;
  /** Top-level chapter number this page belongs to, or null for front/back matter. */
  chapterNumber: number | null;
  chapterTitle: string | null;
}

// ── Licence ───────────────────────────────────────────────────────────────────

/** Map a Creative Commons URL to our licence enum. Order matters — `by-nc-sa` also
 *  contains `by-nc`, and `by-nc` also contains `by`, so the most specific must win. */
export function licenseFromCcUrl(url: string): License | null {
  if (!url) return null;
  if (/by-nc-sa/i.test(url)) return 'CC-BY-NC-SA';
  if (/by-nc/i.test(url)) return 'CC-BY-NC';
  if (/by-sa/i.test(url)) return 'CC-BY-SA';
  if (/licenses\/by\//i.test(url)) return 'CC-BY';
  if (/publicdomain|\/zero\//i.test(url)) return 'PD';
  return null;
}

// ── HTML → readable text ──────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…',
  times: '×', divide: '÷', deg: '°', plusmn: '±', le: '≤', ge: '≥', ne: '≠',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Convert one OpenStax page of HTML into clean reading text.
 *
 * BookReader renders plain text (no dangerouslySetInnerHTML), which is also the safer choice —
 * nothing from a third-party fetch reaches the DOM as markup. So structure is preserved through
 * blank lines and headings rather than tags.
 *
 * OpenStax pages open with a `/* STYLING_FOR_DEVS *\/` <style> block; leaving it in would put
 * CSS at the top of every chapter, so style/script are dropped wholesale before anything else.
 */
export function htmlToReadableText(html: string): string {
  if (!html) return '';
  let s = html;

  // Drop non-content elements entirely, including their contents.
  s = s.replace(/<(style|script|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  // HTML comments (OpenStax leaves developer notes in the markup).
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // Images carry meaning in a textbook — keep the alt text rather than losing the figure.
  s = s.replace(/<img\b[^>]*?alt=["']([^"']+)["'][^>]*>/gi, '\n[Figure: $1]\n');
  s = s.replace(/<img\b[^>]*>/gi, '');
  // Headings and block elements become paragraph breaks.
  s = s.replace(/<\/(h[1-6]|p|div|section|li|tr|figure|figcaption|blockquote)>/gi, '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  // List items get a marker so enumerated steps stay legible as prose.
  s = s.replace(/<li\b[^>]*>/gi, '• ');
  // Table cells separated so rows don't run together into one word.
  s = s.replace(/<\/t[dh]>/gi, '\t');
  // Everything else: strip the tag, keep the text.
  s = s.replace(/<[^>]+>/g, '');

  s = decodeEntities(s);

  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Table of contents ─────────────────────────────────────────────────────────

interface TreeNode { id?: string; title?: string; contents?: TreeNode[] }

/**
 * Flatten the ToC to leaf pages, tagging each with the top-level chapter it sits under.
 * The chapter tagging is what lets buildBookText emit `Chapter N` headings that BookReader's
 * own splitter recognises — without it the whole textbook reads as one undifferentiated blob.
 */
export function flattenToc(tree: TreeNode): OpenStaxPage[] {
  const pages: OpenStaxPage[] = [];
  const clean = (t?: string) => htmlToReadableText(t ?? '').replace(/\s+/g, ' ').trim();

  const walk = (node: TreeNode, depth: number, chapter: { number: number; title: string } | null) => {
    for (const child of node.contents ?? []) {
      const title = clean(child.title);
      if (child.contents?.length) {
        // Chapters are NOT always top-level. Prealgebra nests chapter → page, but Biology for
        // AP Courses nests unit → chapter → page, and "Unit 1 …" is not a chapter. So match on
        // the title at any depth and let the innermost match win, rather than trusting position:
        // keying off depth alone gave Biology zero chapters and turned 5 MB into one blob.
        const match = matchChapterTitle(title);
        const inherited = match
          ? { number: match.number, title }
          // A top-level container that isn't a chapter (Preface, Appendix) starts no chapter;
          // deeper ones keep whatever chapter encloses them.
          : depth === 0 ? null : chapter;
        walk(child, depth + 1, inherited);
      } else if (child.id) {
        pages.push({
          id: child.id.replace(/@.*$/, ''),
          title,
          chapterNumber: chapter?.number ?? null,
          chapterTitle: chapter?.title ?? null,
        });
      }
    }
  };

  walk(tree, 0, null);
  return pages;
}

/** "Chapter 4 Cell Structure" or "1 Whole Numbers" → a chapter. "Unit 2 The Cell" → not one. */
function matchChapterTitle(title: string): { number: number } | null {
  const explicit = /^Chapter\s+(\d+)\b/i.exec(title);
  if (explicit) return { number: Number(explicit[1]) };
  const bare = /^(\d+)\s+\S/.exec(title);
  return bare ? { number: Number(bare[1]) } : null;
}

/**
 * Assemble the full-book text file.
 *
 * Emits `Chapter N — Title` headings in the exact form BookReader's CHAPTER_RE matches
 * (`/^(?:CHAPTER|Chapter|...)\s+(?:\d+|[IVXLCDM]+)...$/m`), so the reader rebuilds the real
 * table of contents from the text alone and no reader change is needed.
 *
 * The attribution header is required by every CC licence and is deliberately part of the text
 * itself — a header in the album record could be dropped by a future UI, but this travels with
 * the content wherever it is read, printed, or exported.
 */
export function buildBookText(
  book: OpenStaxBookRef,
  pages: Array<OpenStaxPage & { text: string }>,
): string {
  const out: string[] = [];

  out.push(book.title);
  out.push('');
  out.push(`Source: OpenStax (Rice University) — ${OPENSTAX}/books/${book.slug}`);
  out.push(`Licence: ${book.license} — ${book.licenseUrl}`);
  out.push('Access this book for free at openstax.org.');
  out.push('Hosted on Plajah Academia at no cost. Plajah does not charge for textbooks.');
  if (book.license.includes('NC')) {
    out.push('NonCommercial: this text may not be used for commercial purposes.');
  }
  if (book.license.includes('SA')) {
    out.push('ShareAlike: adaptations must be shared under the same licence.');
  }
  out.push('');
  out.push('');

  let lastChapter: number | null | undefined;
  for (const page of pages) {
    if (page.chapterNumber !== lastChapter) {
      lastChapter = page.chapterNumber;
      if (page.chapterNumber !== null) {
        out.push('');
        out.push(chapterHeading(page.chapterNumber, page.chapterTitle));
        out.push('');
      }
    }
    if (page.title) { out.push(disguiseFalseHeadings(page.title)); out.push(''); }
    if (page.text) { out.push(disguiseFalseHeadings(page.text)); out.push(''); }
  }

  return out.join('\n').replace(/\n{4,}/g, '\n\n\n').trim() + '\n';
}

/** "Chapter 3 — Motion". OpenStax titles already carry their own number ("Chapter 3 Motion",
 *  or "3 Motion" for units), so strip it or the heading reads "Chapter 3 — Chapter 3 Motion". */
export function chapterHeading(number: number, rawTitle: string | null): string {
  const title = (rawTitle ?? '')
    .replace(/^Chapter\s+\d+\s*[:.—-]?\s*/i, '')
    .replace(/^\d+\s*[:.—-]?\s*/, '')
    .trim();
  return `Chapter ${number}${title ? ` — ${title}` : ''}`;
}

/**
 * BookReader rebuilds the table of contents by matching `^Chapter N…` at the start of a LINE —
 * and textbook prose is full of sentences like "Chapter 1 reviews arithmetic operations…".
 * Left alone, those parse as headings: Elementary Algebra produced 175 "chapters" instead of 10,
 * and the reader's contents list became unusable.
 *
 * A single leading space defeats the anchor (the regex allows no whitespace before the keyword)
 * while being invisible in rendered prose — the reader trims paragraphs anyway. Only body text
 * is treated this way; the headings emitted above are never touched.
 */
export function disguiseFalseHeadings(text: string): string {
  const KEYWORD = '(?:CHAPTER|Chapter|PART|Part|BOOK|Book|VOLUME|Volume|ACT|Act|SECTION|Section)';
  const SAME_LINE = new RegExp(`^${KEYWORD}\\s+(?:\\d+|[IVXLCDM]+)\\b`);
  const KEYWORD_ALONE = new RegExp(`^${KEYWORD}\\s*$`);
  const STARTS_WITH_NUMBER = /^(?:\d|[IVXLCDM]+\b)/;

  const lines = text.split('\n');
  return lines
    .map((line, i) => {
      if (SAME_LINE.test(line)) return ` ${line}`;
      // The reader's `\s+` spans newlines, so a bare "Volume" sitting above "1 liter (L) = …"
      // in a unit-conversion table also parses as a heading. Look past blank lines to catch it.
      if (KEYWORD_ALONE.test(line)) {
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length && STARTS_WITH_NUMBER.test(lines[j].trim())) return ` ${line}`;
      }
      return line;
    })
    .join('\n');
}

// ── Fetching ──────────────────────────────────────────────────────────────────

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Plajah-Academia/1.0 (OER ingest)' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Resolve a book slug to its current id, version, archive path and — critically — its
 *  licence, read from OpenStax rather than assumed from the publisher name. */
export async function resolveBook(slug: string): Promise<OpenStaxBookRef> {
  const release = await getJson(`${OPENSTAX}/rex/release.json`);
  const cms = await getJson(`${OPENSTAX}/apps/cms/api/v2/pages/?type=books.Book&fields=title,slug,cnx_id&limit=300`);
  const entry = cms.items.find((b: any) => b.meta?.slug === slug);
  if (!entry) throw new Error(`No OpenStax book with slug "${slug}".`);

  const version = release.books?.[entry.cnx_id]?.defaultVersion;
  if (!version) throw new Error(`No published version for "${slug}" (${entry.cnx_id}).`);

  const contents = await getJson(`${OPENSTAX}${release.archiveUrl}/contents/${entry.cnx_id}@${version}.json`);
  const licenseUrl = contents.license?.url ?? '';
  const license = licenseFromCcUrl(licenseUrl);
  if (!license) throw new Error(`Unrecognised licence for "${slug}": ${licenseUrl || '(none)'}`);

  return {
    slug,
    title: contents.title ?? entry.title,
    bookId: entry.cnx_id,
    version,
    archiveUrl: release.archiveUrl,
    license,
    licenseUrl,
  };
}

export async function fetchToc(book: OpenStaxBookRef): Promise<OpenStaxPage[]> {
  const contents = await getJson(`${OPENSTAX}${book.archiveUrl}/contents/${book.bookId}@${book.version}.json`);
  return flattenToc(contents.tree ?? {});
}

export async function fetchPageText(book: OpenStaxBookRef, pageId: string): Promise<string> {
  const url = `${OPENSTAX}${book.archiveUrl}/contents/${book.bookId}@${book.version}:${pageId}.json`;
  const page = await getJson(url);
  return htmlToReadableText(page.content ?? '');
}
