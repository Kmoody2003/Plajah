// Book content fetching with an IndexedDB cache.
//
// Why this exists: letting epub.js (or any reader library) fetch its own URL
// gives us no retry, no dedup, no caching and no error surface — a single
// failed request (rate limit, StrictMode double-mount race, flaky network)
// permanently wedges the reader with a blank page. All book bytes flow
// through here instead:
//   - in-flight dedup: concurrent requests for the same URL share one fetch
//   - retry with backoff for transient upstream failures
//   - IndexedDB cache so a book opens instantly every time after the first
//   - download progress callback for real loading UI
//   - magic-byte validation so corrupt payloads fail loudly, not blankly

const DB_NAME = 'plajah-book-cache';
const DB_VERSION = 2;
const STORE = 'content';
const MAX_CACHE_BYTES = 250 * 1024 * 1024; // ~250 MB of cached books
const FETCH_TIMEOUT_MS = 8_500;
const RETRY_DELAYS_MS = [0, 400];

interface CacheRecord {
  url: string;
  buffer: ArrayBuffer;
  size: number;
  lastAccess: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE)) {
        db.deleteObjectStore(STORE);
      }
      const store = db.createObjectStore(STORE, { keyPath: 'url' });
      store.createIndex('lastAccess', 'lastAccess');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
  // If opening fails (private mode, quota), don't poison future attempts.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
};

const looksLikeZip = (buf: ArrayBuffer): boolean => {
  if (buf.byteLength < 4) return false;
  const b = new Uint8Array(buf.slice(0, 2));
  return b[0] === 0x50 && b[1] === 0x4b; // "PK"
};

const looksLikeHtmlError = (buf: ArrayBuffer): boolean => {
  if (buf.byteLength === 0) return true;
  if (looksLikeZip(buf)) return false;
  const sample = new TextDecoder().decode(buf.slice(0, 4096)).trimStart().toLowerCase();
  // Always reject the Plajah SPA shell (index.html) or Vite dev shell regardless of size
  if (
    sample.includes('id="pj-boot"') ||
    sample.includes('<title>plajah') ||
    sample.includes('plajah-audius-oauth') ||
    sample.includes('/@vite/client') ||
    sample.includes('<div id="root"') ||
    sample.startsWith('{"error')
  ) {
    return true;
  }
  // Small HTML pages (< 24 KB) without Project Gutenberg markers are upstream 404/403/502 pages
  if (buf.byteLength < 24_576 && (sample.startsWith('<!doctype') || sample.startsWith('<html'))) {
    if (!sample.includes('project gutenberg') && !sample.includes('standard ebooks')) {
      return true;
    }
  }
  return false;
};

const idbGet = async (url: string): Promise<CacheRecord | null> => {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(url);
      req.onsuccess = () => {
        const rec = req.result as CacheRecord | undefined;
        if (rec) {
          if (looksLikeHtmlError(rec.buffer)) {
            store.delete(url);
            resolve(null);
            return;
          }
          rec.lastAccess = Date.now();
          store.put(rec); // refresh LRU stamp
          resolve(rec);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

const idbPut = async (rec: CacheRecord): Promise<void> => {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    void evictIfNeeded();
  } catch {
    /* cache is best-effort */
  }
};

const evictIfNeeded = async (): Promise<void> => {
  try {
    const db = await openDb();
    const records: Array<{ url: string; size: number; lastAccess: number }> = await new Promise((resolve) => {
      const out: Array<{ url: string; size: number; lastAccess: number }> = [];
      const tx = db.transaction(STORE, 'readonly');
      const cursorReq = tx.objectStore(STORE).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const v = cursor.value as CacheRecord;
          out.push({ url: v.url, size: v.size, lastAccess: v.lastAccess });
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      cursorReq.onerror = () => resolve(out);
    });
    let total = records.reduce((s, r) => s + r.size, 0);
    if (total <= MAX_CACHE_BYTES) return;
    records.sort((a, b) => a.lastAccess - b.lastAccess);
    const doomed: string[] = [];
    for (const r of records) {
      if (total <= MAX_CACHE_BYTES) break;
      doomed.push(r.url);
      total -= r.size;
    }
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      doomed.forEach(url => store.delete(url));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* best-effort */
  }
};

export const clearBookCache = async (): Promise<void> => {
  parsedChaptersMemCache.clear();
  formattedTextMemCache.clear();
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* nothing to clear */
  }
};

const proxied = (url: string): string =>
  url.startsWith('http') ? `/api/proxy?url=${encodeURIComponent(url)}` : url;

export const extractGutenbergId = (url: string): number | null => {
  const decoded = (() => {
    try { return decodeURIComponent(url); } catch { return url; }
  })();
  const m =
    decoded.match(/\/ebooks\/(\d+)\b/i) ||
    decoded.match(/\/cache\/epub\/(\d+)\/pg\d+/i) ||
    decoded.match(/\/files\/(\d+)\/\1/i) ||
    decoded.match(/books\/classics\/(\d+)\//i) ||
    decoded.match(/\bpg(\d+)\.(?:txt|epub)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Build an ordered list of fetch targets (proxied and CORS-direct mirrors) so
 * classic books load reliably whether served behind server.ts, Cloud Run, or standalone Vite.
 */
const buildCandidateFetchUrls = (url: string, expectZip?: boolean): string[] => {
  const candidates: string[] = [];
  const pushUnique = (u: string) => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };

  // Signed vault files (paid books) are served by our own API with CORS; a proxy hop would only fail.
  if (url.includes('/api/books/') && url.includes('/file?')) return [url];

  const gid = extractGutenbergId(url);

  // Firebase Storage URLs support CORS natively — try direct only if it's not an unseeded classic stub,
  // or keep it after Gutenberg cache if we know the Gutenberg ID.
  const isUnseededClassicStorage = url.includes('firebasestorage.googleapis.com') && url.includes('books%2Fclassics%2F');

  if (gid && !expectZip) {
    // Fastest Gutenberg static mirror first (~250ms), followed by epub cache TXT
    pushUnique(proxied(`https://www.gutenberg.org/files/${gid}/${gid}-0.txt`));
    pushUnique(proxied(`https://www.gutenberg.org/cache/epub/${gid}/pg${gid}.txt`));
    pushUnique(proxied(`https://www.gutenberg.org/files/${gid}/${gid}.txt`));
    pushUnique(proxied(`https://www.gutenberg.org/ebooks/${gid}.txt.utf-8`));
    pushUnique(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.gutenberg.org/cache/epub/${gid}/pg${gid}.txt`)}`);
  } else if (gid && expectZip) {
    pushUnique(proxied(`https://www.gutenberg.org/cache/epub/${gid}/pg${gid}.epub`));
    pushUnique(proxied(`https://www.gutenberg.org/ebooks/${gid}.epub.noimages`));
    pushUnique(proxied(`https://www.gutenberg.org/ebooks/${gid}.epub.images`));
  }

  if (!isUnseededClassicStorage) {
    pushUnique(proxied(url));
  }

  if (isUnseededClassicStorage) {
    pushUnique(url);
    pushUnique(proxied(url));
  } else if (url.startsWith('http')) {
    pushUnique(url);
  }

  return candidates;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const fetchRawWithProgress = async (
  targetUrl: string,
  onProgress?: (loaded: number, total: number | null) => void,
  externalSignal?: AbortSignal,
): Promise<ArrayBuffer> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
  try {
    const response = await fetch(targetUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const total = Number(response.headers.get('content-length')) || null;
    if (!response.body || !onProgress) {
      const buf = await response.arrayBuffer();
      onProgress?.(buf.byteLength, buf.byteLength);
      return buf;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
    const out = new Uint8Array(loaded);
    let offset = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
    return out.buffer;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
};

const validateBuffer = (buf: ArrayBuffer, expectZip?: boolean): ArrayBuffer => {
  if (buf.byteLength === 0) throw new Error('Empty response');
  if (looksLikeHtmlError(buf)) throw new Error('Upstream returned an error or shell page');
  if (expectZip && !looksLikeZip(buf)) throw new Error('Not a valid EPUB (zip) payload');
  return buf;
};

const inflight = new Map<string, Promise<ArrayBuffer>>();

export interface FetchBookOptions {
  onProgress?: (loaded: number, total: number | null) => void;
  /** Expect a zip container (EPUB). Non-zip payloads are rejected. */
  expectZip?: boolean;
  /** Bypass the cache and refetch. */
  refresh?: boolean;
}

export const fetchBookBinary = async (url: string, opts: FetchBookOptions = {}): Promise<ArrayBuffer> => {
  if (!url || !url.trim()) throw new Error('Empty book URL');

  const gid = extractGutenbergId(url);
  // Vault links carry a fresh expiry/signature on every open; cache the file under its stable path.
  const vaultKey = url.includes('/api/books/') && url.includes('/file?') ? url.replace(/[?&](exp|sig)=[^&]*/g, '') : null;
  const canonicalCacheKey = vaultKey || (gid && !opts.expectZip ? `gutenberg-txt-${gid}` : url);

  if (!opts.refresh) {
    const cached = (await idbGet(canonicalCacheKey)) || (canonicalCacheKey !== url ? await idbGet(url) : null);
    if (cached && (!opts.expectZip || looksLikeZip(cached.buffer)) && !looksLikeHtmlError(cached.buffer)) {
      opts.onProgress?.(cached.size, cached.size);
      return cached.buffer;
    }
  }

  const existing = inflight.get(canonicalCacheKey) || inflight.get(url);
  if (existing) return existing;

  const candidates = buildCandidateFetchUrls(url, opts.expectZip);

  const job = (async () => {
    let lastErr: unknown;
    // Race the top 2 fast candidates in parallel first so whichever mirror responds fastest wins immediately!
    if (candidates.length >= 2) {
      const raceControllers = [new AbortController(), new AbortController()];
      try {
        const winner = await Promise.any(
          candidates.slice(0, 2).map((cand, idx) =>
            fetchRawWithProgress(cand, idx === 0 ? opts.onProgress : undefined, raceControllers[idx].signal).then(buf => {
              validateBuffer(buf, opts.expectZip);
              // Abort the other racer
              raceControllers.forEach((c, otherIdx) => { if (otherIdx !== idx) c.abort(); });
              return buf;
            })
          )
        );
        const now = Date.now();
        void idbPut({ url: canonicalCacheKey, buffer: winner, size: winner.byteLength, lastAccess: now });
        if (canonicalCacheKey !== url && !vaultKey) {
          void idbPut({ url, buffer: winner, size: winner.byteLength, lastAccess: now });
        }
        return winner;
      } catch (e) {
        lastErr = e;
      }
    }

    // Fallback sequential pass through remaining candidates if the initial parallel race failed
    for (const delay of RETRY_DELAYS_MS) {
      if (delay) await sleep(delay);
      for (const candidateUrl of candidates) {
        try {
          const buf = validateBuffer(await fetchRawWithProgress(candidateUrl, opts.onProgress), opts.expectZip);
          const now = Date.now();
          void idbPut({ url: canonicalCacheKey, buffer: buf, size: buf.byteLength, lastAccess: now });
          if (canonicalCacheKey !== url && !vaultKey) {
            void idbPut({ url, buffer: buf, size: buf.byteLength, lastAccess: now });
          }
          return buf;
        } catch (e) {
          lastErr = e;
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Download failed');
  })();

  inflight.set(canonicalCacheKey, job);
  try {
    return await job;
  } finally {
    inflight.delete(canonicalCacheKey);
  }
};

export const fetchBookText = async (url: string, opts: FetchBookOptions = {}): Promise<string> => {
  const buf = await fetchBookBinary(url, opts);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!text.trim()) throw new Error('Empty text content');
  if (
    text.includes('id="pj-boot"') ||
    (text.includes('Plajah') && text.length < 15000 && /v\d+\.\d+\.\d+/.test(text))
  ) {
    throw new Error('Invalid book text (SPA shell detected)');
  }
  return text;
};

export interface ParsedChapter {
  title: string;
  body?: string;
  pages: string[][];
}

// In-memory caches so opening a prefetched or previously opened book takes 0ms
const parsedChaptersMemCache = new Map<string, ParsedChapter[]>();
const formattedTextMemCache = new Map<string, string>();

const cacheKeysFor = (urlOrId: string): string[] => {
  const keys = [urlOrId];
  const gid = extractGutenbergId(urlOrId) || (/^\d+$/.test(urlOrId.trim()) ? parseInt(urlOrId.trim(), 10) : null);
  if (gid) keys.unshift(`gid:${gid}`);
  return keys;
};

export const getCachedParsedChapters = (urlOrId?: string | null): ParsedChapter[] | null => {
  if (!urlOrId) return null;
  for (const k of cacheKeysFor(urlOrId)) {
    const hit = parsedChaptersMemCache.get(k);
    if (hit && hit.length > 0) return hit;
  }
  return null;
};

export const getCachedFormattedText = (urlOrId?: string | null): string | null => {
  if (!urlOrId) return null;
  for (const k of cacheKeysFor(urlOrId)) {
    const hit = formattedTextMemCache.get(k);
    if (hit) return hit;
  }
  return null;
};

export const stripHtmlToText = (value: string): string =>
  value
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|section|article)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const WORD_NUM_PATTERN =
  '(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY|THIRTY|FORTY|FIFTY|FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH)(?:[\\s-]+(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE))?';

const HEADING_LINE_RE = new RegExp(
  `^\\s*((?:(?:CHAPTER|Chapter|PART|Part|BOOK|Book|VOLUME|Volume|ACT|Act|SCENE|Scene|SECTION|Section|LETTER|Letter|STAVE|Stave|CANTO|Canto|ADVENTURE|Adventure)\\s+(?:\\d+|[IVXLCDM]+|${WORD_NUM_PATTERN})|[IVXLCDM]+\\.)(?:[.:—\\-]\\s*[^\\n]{0,80})?)\\s*$`,
  'gm'
);

/** Fast O(n) zero-allocation word counter */
const countWordsFast = (s: string): number => {
  let count = 0;
  let inWord = false;
  for (let i = 0, len = s.length; i < len; i++) {
    const code = s.charCodeAt(i);
    const isSpace = code <= 32 || code === 160;
    if (!isSpace) {
      if (!inWord) {
        count++;
        inWord = true;
      }
    } else {
      inWord = false;
    }
  }
  return count;
};

/**
 * Clean Project Gutenberg plain-text formatting conventions:
 * - `_italicized words_` -> `italicized words`
 * - `=bold words=` -> `bold words`
 * - `[Illustration]` or `[Illustration: ...]` -> removed
 * - `[Transcriber's Note: ...]` / `Transcriber's Note:` preambles -> removed
 * - Horizontal underscore dividers `_____` -> `· · ·`
 */
export const cleanGutenbergMarkup = (input: string): string => {
  return input
    // Remove [Illustration...] and [Transcriber's Note...] blocks
    .replace(/\[\s*(?:Illustration|Transcriber's\s+Note|Editor's\s+Note|Footnote|Pg\s+\d+|Page\s+\d+)[^\]]*\]/gi, '')
    // Convert runs of 3+ underscores used as scene breaks into clean ellipsis breaks
    .replace(/_{3,}/g, '\n\n* * *\n\n')
    // Strip Project Gutenberg _italic_ wrappers (both single words and multi-word phrases)
    .replace(/\b_([^_\n]+?)_\b/g, '$1')
    .replace(/(^|[\s"“‘'(\[—-])_([^_\n]+?)_(?=[\s"”’').,!?:;\]—-]|$)/gm, '$1$2')
    // Catch any remaining stray leading/trailing underscores on words (e.g. _word or word_)
    .replace(/(^|[\s"“‘'(\[—-])_+(?=\w)/gm, '$1')
    .replace(/(?<=\w)_+(?=[\s"”’').,!?:;\]—-]|$)/gm, '')
    // Strip Project Gutenberg =bold= wrappers
    .replace(/(^|[\s"“‘'(\[—-])=([^=\n]+?)=(?=[\s"”’').,!?:;\]—-]|$)/gm, '$1$2');
};

export const formatReadableText = (value: string): string => {
  let text = value.trimStart().startsWith('<') ? stripHtmlToText(value) : value;
  if (text.indexOf('\r') !== -1) {
    text = text.replace(/\r\n?/g, '\n');
  }

  // Fast index scan for Project Gutenberg start/end markers before regex
  const upperSlice = text.slice(0, 18000).toUpperCase();
  const startIdx = upperSlice.indexOf('*** START OF ');
  if (startIdx !== -1) {
    const lineEnd = text.indexOf('\n', startIdx);
    if (lineEnd !== -1) text = text.slice(lineEnd + 1);
  }

  const tailOffset = Math.max(0, text.length - 32000);
  const tailUpper = text.slice(tailOffset).toUpperCase();
  const endIdx = tailUpper.indexOf('*** END OF ');
  if (endIdx !== -1) {
    text = text.slice(0, tailOffset + endIdx);
  }

  // Strip Project Gutenberg plain-text underscores (_italics_), =bold=, and [Illustration] tags
  text = cleanGutenbergMarkup(text);

  // Ensure chapter/part/act headings are isolated by blank lines before paragraph wrapping
  text = text.replace(HEADING_LINE_RE, '\n\n$1\n\n');

  const rawBlocks = text.split(/\n{2,}/);
  const outBlocks: string[] = [];
  for (let i = 0, len = rawBlocks.length; i < len; i++) {
    const b = rawBlocks[i].replace(/\s+/g, ' ').trim();
    if (!b) continue;
    // Skip standalone "Produced by..." or "Transcriber's Note" boilerplate blocks at the very start
    if (
      outBlocks.length < 3 &&
      /^(?:produced by|transcriber['’]?s note|online distributed proofreading|this ebook is for the use of)/i.test(b)
    ) {
      continue;
    }
    outBlocks.push(b);
  }
  return outBlocks.join('\n\n');
};

/** Split an oversized paragraph into ~180-word chunks along sentence boundaries without expensive regex backtracking. */
const splitLongParagraph = (para: string, maxWords = 200): string[] => {
  const totalWords = countWordsFast(para);
  if (totalWords <= maxWords) return [para];

  // Fast sentence split on '. ', '! ', '? '
  const sentences = para.split(/(?<=[.!?]["'”’)]*)\s+/);
  if (sentences.length <= 1) {
    const words = para.split(/\s+/);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += maxWords) {
      chunks.push(words.slice(i, i + maxWords).join(' '));
    }
    return chunks;
  }
  const out: string[] = [];
  let cur: string[] = [];
  let curWords = 0;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const sw = countWordsFast(s);
    if (cur.length > 0 && curWords + sw > maxWords) {
      out.push(cur.join(' '));
      cur = [];
      curWords = 0;
    }
    cur.push(s);
    curWords += sw;
  }
  if (cur.length > 0) out.push(cur.join(' '));
  return out;
};

/**
 * Split a formatted TXT book into chapters and paginate each one into true book-sized pages (~220 words / max 5 paragraphs per page).
 */
export const parseChaptersFromText = (fullText: string, cacheKey?: string): ParsedChapter[] => {
  if (cacheKey) {
    const cached = getCachedParsedChapters(cacheKey);
    if (cached) return cached;
  }

  const PAGE_WORDS = 220;
  const PAGE_MAX_PARAS = 5;
  const CHAPTER_RE = new RegExp(
    `^((?:(?:CHAPTER|Chapter|PART|Part|BOOK|Book|VOLUME|Volume|ACT|Act|SCENE|Scene|SECTION|Section|LETTER|Letter|STAVE|Stave|CANTO|Canto|ADVENTURE|Adventure)\\s+(?:\\d+|[IVXLCDM]+|${WORD_NUM_PATTERN})|[IVXLCDM]+\\.)(?:[.:—\\-]\\s*[^\\n]{0,90})?)\\s*$`,
    'gm'
  );

  const parts = fullText.split(CHAPTER_RE);
  const raw: Array<{ title: string; body: string }> = [];

  if (parts[0] && parts[0].trim().length > 400) {
    raw.push({ title: 'Preface & Opening', body: parts[0].trim() });
  }

  for (let i = 1; i + 1 < parts.length; i += 2) {
    const heading = parts[i].replace(/\s+/g, ' ').trim();
    const body = (parts[i + 1] || '').trim();
    raw.push({ title: heading, body });
  }

  if (raw.length === 0) {
    raw.push({ title: 'Chapter 1', body: fullText });
  }

  const filtered = raw.filter(ch => {
    const t = ch.title.toLowerCase();
    const b = ch.body.trim();
    if (b.length < 120) return false;
    const isToc = t.includes('contents') || (t.match(/chapter/gi) || []).length > 1;
    const isLegal = t.includes('terms of use') || t.includes('general terms') || t.includes('gutenberg-tm') || t.includes('license');
    return !isToc && !isLegal;
  });

  const finalChapters = filtered.length > 0 ? filtered : [{ title: 'Chapter 1', body: fullText }];

  const result = finalChapters.map((ch, idx) => {
    const rawParas = ch.body.split('\n\n').map(p => p.trim()).filter(p => p.length > 1);
    let chapterTitle = ch.title;
    if (
      rawParas.length > 1 &&
      rawParas[0].length <= 65 &&
      !/[.!?]$/.test(rawParas[0]) &&
      !/^["'“‘]/.test(rawParas[0])
    ) {
      const sub = rawParas.shift()!;
      if (!chapterTitle.toLowerCase().includes(sub.toLowerCase())) {
        chapterTitle = `${chapterTitle}: ${sub}`;
      }
    }

    const paras = rawParas.flatMap(p => splitLongParagraph(p, PAGE_WORDS));
    const pages: string[][] = [];
    let currentPage: string[] = [];
    let currentWords = 0;

    for (let i = 0; i < paras.length; i++) {
      const p = paras[i];
      const pw = countWordsFast(p);
      if (
        currentPage.length > 0 &&
        (currentWords + pw > PAGE_WORDS || currentPage.length >= PAGE_MAX_PARAS)
      ) {
        pages.push(currentPage);
        currentPage = [];
        currentWords = 0;
      }
      currentPage.push(p);
      currentWords += pw;
    }
    if (currentPage.length > 0 || pages.length === 0) {
      pages.push(currentPage);
    }

    return { title: chapterTitle || `Chapter ${idx + 1}`, body: ch.body, pages };
  });

  if (cacheKey) {
    for (const k of cacheKeysFor(cacheKey)) {
      parsedChaptersMemCache.set(k, result);
    }
  }

  return result;
};

const inflightParse = new Map<string, Promise<{ formatted: string; chapters: ParsedChapter[] }>>();

export const fetchAndParseBookChapters = async (
  url: string,
  fallbackUrl?: string
): Promise<{ formatted: string; chapters: ParsedChapter[] }> => {
  const cachedChapters = getCachedParsedChapters(url) || (fallbackUrl ? getCachedParsedChapters(fallbackUrl) : null);
  const cachedFormatted = getCachedFormattedText(url) || (fallbackUrl ? getCachedFormattedText(fallbackUrl) : null);
  if (cachedChapters && cachedFormatted) {
    return { formatted: cachedFormatted, chapters: cachedChapters };
  }

  const gid = extractGutenbergId(url) || (fallbackUrl ? extractGutenbergId(fallbackUrl) : null);
  const dedupKey = gid ? `gid:${gid}` : url;
  const existing = inflightParse.get(dedupKey);
  if (existing) return existing;

  const job = (async () => {
    let rawText: string;
    try {
      rawText = await fetchBookText(url);
    } catch (err) {
      if (fallbackUrl && fallbackUrl !== url) {
        rawText = await fetchBookText(fallbackUrl);
      } else {
        throw err;
      }
    }
    const formatted = formatReadableText(rawText);
    const chapters = parseChaptersFromText(formatted, url);
    for (const k of cacheKeysFor(url)) {
      formattedTextMemCache.set(k, formatted);
      parsedChaptersMemCache.set(k, chapters);
    }
    if (fallbackUrl) {
      for (const k of cacheKeysFor(fallbackUrl)) {
        formattedTextMemCache.set(k, formatted);
        parsedChaptersMemCache.set(k, chapters);
      }
    }
    return { formatted, chapters };
  })();

  inflightParse.set(dedupKey, job);
  try {
    return await job;
  } finally {
    inflightParse.delete(dedupKey);
  }
};

/** Fire-and-forget background prefetch & parse so clicking a book card opens in 0ms */
export const prefetchBookContent = (url?: string | null): void => {
  if (!url || !url.trim()) return;
  if (getCachedParsedChapters(url)) return;
  void fetchAndParseBookChapters(url).catch(() => { /* silent background warm-up */ });
};


