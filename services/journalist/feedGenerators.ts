// Syndication + export generators. PURE string builders (no I/O) shared by the server route
// (routes/articleFeeds.ts) and the client (export buttons), and unit-tested in
// tests/journalistFeeds.test.ts.
//
// Honest scope:
//   - RSS 2.0 and Atom 1.0 are standards-shaped; we have not run them through an external validator.
//   - "AMP-lite" is a fast, script-free static HTML page with JSON-LD. It is NOT validated AMP
//     (no amp-boilerplate); Google no longer requires AMP for Top Stories.
//   - Apple News Format output is a well-formed ANF document, but nothing is submitted to Apple:
//     that needs an Apple News Publisher channel and API credentials we do not have.
//   - Email HTML is table-based with inline styles. Sending (consent, unsubscribe, postal address)
//     is the campaigns / email service's job; this only renders the message.

import type { ArticleDisclosures, ArticleNotice } from './types';
import { NOTICE_LABELS, noticesToHtml, noticeToPlainText, isRetracted, sortForDisplay } from './correctionLog';
import { articleBodyHtml, articlePlainText } from './articleTela';

export interface FeedArticle {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  authorName: string;
  authorId?: string;
  publishedAt: number;
  updatedAt?: number;
  bodyHtml: string;
  bodyText: string;
  category?: string;
  tags?: string[];
  coverImage?: string;
  coverCredit?: string;
  notices?: ArticleNotice[];
  disclosures?: Partial<ArticleDisclosures>;
  /** If set and in the future, the article is embargoed and must not appear in any feed. */
  embargoUntil?: number;
  /** Subscriber-only: feeds carry the summary, not the body. */
  paywalled?: boolean;
  isPublic?: boolean;
}

export interface FeedMeta {
  title: string;
  link: string;
  feedUrl: string;
  description: string;
  language?: string;
  /** Used as the Atom author / RSS managingEditor name. */
  authorName?: string;
  updatedAt?: number;
}

export const xmlEscape = (s: string): string =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const cdata = (s: string): string => `<![CDATA[${s.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
const htmlEsc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Only public, non-embargoed articles go out. Newest first. */
export function publishable(articles: ReadonlyArray<FeedArticle>, now = Date.now()): FeedArticle[] {
  return articles
    .filter(a => a.isPublic !== false && !(a.embargoUntil && a.embargoUntil > now))
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

const summaryOf = (a: FeedArticle): string => {
  const base = (a.subtitle || a.bodyText || '').replace(/\s+/g, ' ').trim();
  return base.length > 280 ? `${base.slice(0, 277).replace(/\s+\S*$/, '')}...` : base;
};
const headlineOf = (a: FeedArticle): string => (isRetracted(a.notices) ? `[Retracted] ${a.title}` : a.title);
const disclosureLines = (d?: Partial<ArticleDisclosures>): string[] => {
  if (!d) return [];
  const out: string[] = [];
  if (d.aiAssisted) out.push(`AI disclosure: ${d.aiNote || 'AI tools were used in producing this article.'}`);
  if (d.sponsored) out.push(`Sponsored content${d.sponsorName ? ` (${d.sponsorName})` : ''}.`);
  if (d.affiliateLinks) out.push('This article contains affiliate links; the publisher may earn a commission.');
  if (d.conflictOfInterest) out.push(`Conflict of interest: ${d.conflictNote || 'the author disclosed a relationship relevant to this story.'}`);
  return out;
};
const disclosuresHtml = (d?: Partial<ArticleDisclosures>): string => {
  const l = disclosureLines(d);
  return l.length ? `<aside class="disclosures"><ul>${l.map(x => `<li>${htmlEsc(x)}</li>`).join('')}</ul></aside>` : '';
};

/** Full body for syndication: body + disclosures + correction log (so a feed reader sees corrections too). */
export function fullBodyHtml(a: FeedArticle): string {
  if (a.paywalled) return `<p>${htmlEsc(summaryOf(a))}</p><p><a href="${htmlEsc(a.url)}">Continue reading on Plajah</a></p>`;
  return `${noticesToHtml(a.notices)}${a.bodyHtml}${disclosuresHtml(a.disclosures)}`;
}

const rfc822 = (ms: number) => new Date(ms).toUTCString();
const iso = (ms: number) => new Date(ms).toISOString();

// ── RSS 2.0 ───────────────────────────────────────────────────────────────────

export function buildRss(meta: FeedMeta, input: ReadonlyArray<FeedArticle>, now = Date.now()): string {
  const items = publishable(input, now);
  const last = Math.max(meta.updatedAt || 0, ...items.map(a => a.updatedAt || a.publishedAt), 0) || now;
  const body = items.map(a => `    <item>
      <title>${xmlEscape(headlineOf(a))}</title>
      <link>${xmlEscape(a.url)}</link>
      <guid isPermaLink="false">plajah-article-${xmlEscape(a.id)}</guid>
      <pubDate>${rfc822(a.publishedAt)}</pubDate>
      <dc:creator>${xmlEscape(a.authorName)}</dc:creator>
${a.category ? `      <category>${xmlEscape(a.category)}</category>\n` : ''}${(a.tags || []).map(t => `      <category>${xmlEscape(t)}</category>\n`).join('')}      <description>${cdata(summaryOf(a))}</description>
      <content:encoded>${cdata(fullBodyHtml(a))}</content:encoded>
${a.coverImage ? `      <enclosure url="${xmlEscape(a.coverImage)}" length="0" type="image/jpeg"/>\n` : ''}    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(meta.title)}</title>
    <link>${xmlEscape(meta.link)}</link>
    <description>${xmlEscape(meta.description)}</description>
    <language>${xmlEscape(meta.language || 'en-us')}</language>
    <lastBuildDate>${rfc822(last)}</lastBuildDate>
    <generator>Plajah</generator>
    <atom:link href="${xmlEscape(meta.feedUrl)}" rel="self" type="application/rss+xml"/>
${body}
  </channel>
</rss>
`;
}

// ── Atom 1.0 ──────────────────────────────────────────────────────────────────

export function buildAtom(meta: FeedMeta, input: ReadonlyArray<FeedArticle>, now = Date.now()): string {
  const items = publishable(input, now);
  const last = Math.max(meta.updatedAt || 0, ...items.map(a => a.updatedAt || a.publishedAt), 0) || now;
  const entries = items.map(a => `  <entry>
    <title>${xmlEscape(headlineOf(a))}</title>
    <id>tag:plajah.com,2026:article:${xmlEscape(a.id)}</id>
    <link rel="alternate" type="text/html" href="${xmlEscape(a.url)}"/>
    <published>${iso(a.publishedAt)}</published>
    <updated>${iso(a.updatedAt || a.publishedAt)}</updated>
    <author><name>${xmlEscape(a.authorName)}</name></author>
${a.category ? `    <category term="${xmlEscape(a.category)}"/>\n` : ''}    <summary type="text">${xmlEscape(summaryOf(a))}</summary>
    <content type="html">${xmlEscape(fullBodyHtml(a))}</content>
  </entry>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${xmlEscape(meta.title)}</title>
  <subtitle>${xmlEscape(meta.description)}</subtitle>
  <id>${xmlEscape(meta.feedUrl)}</id>
  <link rel="self" type="application/atom+xml" href="${xmlEscape(meta.feedUrl)}"/>
  <link rel="alternate" type="text/html" href="${xmlEscape(meta.link)}"/>
  <updated>${iso(last)}</updated>
  <author><name>${xmlEscape(meta.authorName || meta.title)}</name></author>
  <generator>Plajah</generator>
${entries}
</feed>
`;
}

// ── JSON-LD + AMP-lite HTML ───────────────────────────────────────────────────

export function newsArticleJsonLd(a: FeedArticle, publisherName = 'Plajah'): Record<string, unknown> {
  const corrections = sortForDisplay(a.notices).filter(n => n.label === 'CORRECTION' || n.label === 'CLARIFICATION' || n.label === 'RETRACTION');
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title.slice(0, 110),
    ...(a.subtitle ? { description: a.subtitle } : {}),
    datePublished: iso(a.publishedAt),
    dateModified: iso(a.updatedAt || a.publishedAt),
    author: [{ '@type': 'Person', name: a.authorName }],
    publisher: { '@type': 'Organization', name: publisherName },
    mainEntityOfPage: a.url,
    ...(a.coverImage ? { image: [a.coverImage] } : {}),
    ...(a.paywalled ? { isAccessibleForFree: false } : {}),
    ...(corrections.length ? { correction: corrections.map(n => ({ '@type': 'CorrectionComment', text: n.text, datePublished: iso(n.at) })) } : {}),
  };
}

export function buildAmpLiteHtml(a: FeedArticle, publisherName = 'Plajah'): string {
  const ld = JSON.stringify(newsArticleJsonLd(a, publisherName)).replace(/</g, '\\u003c');
  const desc = summaryOf(a);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${htmlEsc(headlineOf(a))}</title>
<meta name="description" content="${htmlEsc(desc)}">
<link rel="canonical" href="${htmlEsc(a.url)}">
<meta property="og:type" content="article"><meta property="og:title" content="${htmlEsc(a.title)}"><meta property="og:description" content="${htmlEsc(desc)}">
${a.coverImage ? `<meta property="og:image" content="${htmlEsc(a.coverImage)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<script type="application/ld+json">${ld}</script>
<style>body{font:18px/1.6 Georgia,serif;max-width:42rem;margin:0 auto;padding:1rem;color:#16130f;background:#fbf8f2}h1{font-size:2rem;line-height:1.15}.dek{font-size:1.15rem;opacity:.75}.by{font:600 .8rem system-ui;opacity:.6;text-transform:uppercase;letter-spacing:.08em}img{max-width:100%;height:auto}figcaption{font:.8rem system-ui;opacity:.7}.corrections{border-left:4px solid #b3261e;background:#fff;padding:.5rem 1rem;margin:1rem 0;font:.9rem system-ui}.disclosures{font:.8rem system-ui;opacity:.75;border-top:1px solid #ccc;margin-top:2rem}blockquote{border-left:3px solid #b3261e;margin-left:0;padding-left:1rem;font-style:italic}@media (prefers-color-scheme:dark){body{background:#14110d;color:#f2ede4}.corrections{background:#1d1914}}</style>
</head><body><article>
${a.category ? `<p class="by">${htmlEsc(a.category)}</p>` : ''}<h1>${htmlEsc(headlineOf(a))}</h1>${a.subtitle ? `<p class="dek">${htmlEsc(a.subtitle)}</p>` : ''}
<p class="by">By ${htmlEsc(a.authorName)} &middot; <time datetime="${iso(a.publishedAt)}">${htmlEsc(new Date(a.publishedAt).toISOString().slice(0, 10))}</time>${a.updatedAt && a.updatedAt > a.publishedAt ? ` &middot; Updated <time datetime="${iso(a.updatedAt)}">${htmlEsc(new Date(a.updatedAt).toISOString().slice(0, 10))}</time>` : ''}</p>
${a.coverImage ? `<figure><img src="${htmlEsc(a.coverImage)}" alt="">${a.coverCredit ? `<figcaption>${htmlEsc(a.coverCredit)}</figcaption>` : ''}</figure>` : ''}
${fullBodyHtml(a)}
</article></body></html>
`;
}

// ── Apple News Format ─────────────────────────────────────────────────────────

export interface AppleNewsDocument {
  version: string;
  identifier: string;
  title: string;
  language: string;
  layout: { columns: number; width: number; margin: number; gutter: number };
  components: Array<Record<string, unknown>>;
  componentTextStyles: Record<string, Record<string, unknown>>;
  metadata: Record<string, unknown>;
}

export function buildAppleNewsArticle(a: FeedArticle): AppleNewsDocument {
  const comps: Array<Record<string, unknown>> = [];
  comps.push({ role: 'title', text: headlineOf(a), textStyle: 'titleStyle' });
  if (a.subtitle) comps.push({ role: 'intro', text: a.subtitle, textStyle: 'introStyle' });
  comps.push({ role: 'byline', text: `By ${a.authorName}`, textStyle: 'bylineStyle' });
  if (a.coverImage) comps.push({ role: 'header', layout: { minimumHeight: '40vh' }, style: { fill: { type: 'image', URL: a.coverImage, fillMode: 'cover', verticalAlignment: 'center' } } });
  const sorted = sortForDisplay(a.notices);
  for (const n of sorted) comps.push({ role: 'body', text: `${NOTICE_LABELS[n.label].heading}: ${n.text}`, textStyle: 'noticeStyle' });
  if (a.paywalled) {
    comps.push({ role: 'body', text: summaryOf(a), textStyle: 'bodyStyle' });
  } else {
    // bodyHtml carries h2, p, blockquote, figure. Map each top-level element to an ANF component.
    const re = /<(h2|p|blockquote|figure)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(a.bodyHtml))) {
      const inner = m[2];
      if (m[1] === 'figure') {
        const img = /<img[^>]*src="([^"]+)"/.exec(inner);
        const cap = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(inner);
        if (img) comps.push({ role: 'photo', URL: img[1].replace(/&amp;/g, '&'), ...(cap ? { caption: cap[1].replace(/<[^>]+>/g, '') } : {}) });
      } else if (m[1] === 'h2') comps.push({ role: 'heading2', text: inner.replace(/<[^>]+>/g, ''), format: 'html', textStyle: 'headingStyle' });
      else if (m[1] === 'blockquote') comps.push({ role: 'quote', text: inner.replace(/<footer>[\s\S]*?<\/footer>/, '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, ''), textStyle: 'quoteStyle' });
      else comps.push({ role: 'body', text: inner, format: 'html', textStyle: 'bodyStyle' });
    }
  }
  for (const line of disclosureLines(a.disclosures)) comps.push({ role: 'body', text: line, textStyle: 'noticeStyle' });
  return {
    version: '1.7',
    identifier: `plajah-${a.id}`,
    title: a.title,
    language: 'en',
    layout: { columns: 7, width: 1024, margin: 60, gutter: 20 },
    components: comps,
    componentTextStyles: {
      default: { fontName: 'Georgia', fontSize: 18, lineHeight: 26, textColor: '#16130f' },
      titleStyle: { fontName: 'Georgia-Bold', fontSize: 40, lineHeight: 46 },
      introStyle: { fontName: 'Georgia-Italic', fontSize: 20, lineHeight: 28 },
      bylineStyle: { fontName: 'HelveticaNeue-Medium', fontSize: 13, textColor: '#6b6258' },
      headingStyle: { fontName: 'Georgia-Bold', fontSize: 26, lineHeight: 32 },
      bodyStyle: { fontName: 'Georgia', fontSize: 18, lineHeight: 26 },
      quoteStyle: { fontName: 'Georgia-Italic', fontSize: 22, lineHeight: 30 },
      noticeStyle: { fontName: 'HelveticaNeue', fontSize: 14, textColor: '#b3261e' },
    },
    metadata: {
      authors: [a.authorName], datePublished: iso(a.publishedAt), dateModified: iso(a.updatedAt || a.publishedAt),
      canonicalURL: a.url, excerpt: summaryOf(a), keywords: a.tags || [], ...(a.coverImage ? { thumbnailURL: a.coverImage } : {}),
    },
  };
}

// ── Email (Substack-style) ────────────────────────────────────────────────────

export interface EmailRender { subject: string; preheader: string; html: string; text: string }

export function buildEmailIssue(a: FeedArticle, opts: { publicationName: string; unsubscribeUrl?: string; postalAddress?: string; omitFooter?: boolean }): EmailRender {
  const pre = summaryOf(a);
  const body = fullBodyHtml(a)
    .replace(/<h2>/g, '<h2 style="font:700 22px/1.3 Georgia,serif;margin:28px 0 8px">')
    .replace(/<p>/g, '<p style="margin:0 0 16px">')
    .replace(/<blockquote>/g, '<blockquote style="margin:20px 0;padding-left:16px;border-left:3px solid #b3261e;font-style:italic">')
    .replace(/<img /g, '<img style="max-width:100%;height:auto" ');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea">
<div style="display:none;max-height:0;overflow:hidden">${htmlEsc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" style="max-width:600px;background:#fff;font:17px/1.6 Georgia,serif;color:#16130f"><tr><td style="padding:32px 28px">
<p style="font:700 12px system-ui;letter-spacing:.14em;text-transform:uppercase;color:#b3261e;margin:0 0 12px">${htmlEsc(opts.publicationName)}</p>
<h1 style="font:700 32px/1.15 Georgia,serif;margin:0 0 8px">${htmlEsc(headlineOf(a))}</h1>
${a.subtitle ? `<p style="font-size:19px;opacity:.75;margin:0 0 12px">${htmlEsc(a.subtitle)}</p>` : ''}
<p style="font:600 12px system-ui;opacity:.6;margin:0 0 20px">By ${htmlEsc(a.authorName)} &middot; ${htmlEsc(new Date(a.publishedAt).toISOString().slice(0, 10))}</p>
${body}
<p style="margin-top:28px"><a href="${htmlEsc(a.url)}" style="color:#b3261e">Read on Plajah</a></p>
</td></tr></table>
${opts.omitFooter ? '' : `<p style="font:12px/1.5 system-ui;color:#6b6258;max-width:560px">${opts.unsubscribeUrl ? `<a href="${htmlEsc(opts.unsubscribeUrl)}">Unsubscribe</a> ` : '{{unsubscribe}} '}${opts.postalAddress ? `&middot; ${htmlEsc(opts.postalAddress)}` : '{{postal_address}}'}</p>`}
</td></tr></table></body></html>`;
  const text = [headlineOf(a), a.subtitle || '', `By ${a.authorName}`, '', ...sortForDisplay(a.notices).map(noticeToPlainText), a.paywalled ? summaryOf(a) : a.bodyText, '', ...disclosureLines(a.disclosures), '', `Read online: ${a.url}`].filter((x, i, arr) => x !== '' || arr[i - 1] !== '').join('\n');
  return { subject: a.title, preheader: pre, html, text };
}

// ── Firestore article record -> FeedArticle (shared by the feed routes and the client) ──

export const toMs = (v: any): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const t = Date.parse(v); return isNaN(t) ? 0 : t; }
  if (v && typeof v === 'object') {
    if (typeof v.toMillis === 'function') return v.toMillis();
    const s = v.seconds ?? v._seconds;
    if (typeof s === 'number') return s * 1000 + Math.floor((v.nanoseconds ?? v._nanoseconds ?? 0) / 1e6);
  }
  return 0;
};

export function feedArticleFromRecord(id: string, d: Record<string, any>, base: string): FeedArticle {
  const blocks = Array.isArray(d.blocks) ? d.blocks : [];
  return {
    id,
    title: String(d.title || 'Untitled'),
    subtitle: d.subtitle || undefined,
    url: `${base}/?type=article&id=${encodeURIComponent(id)}`,
    authorName: String(d.authorName || 'Plajah author'),
    authorId: d.authorId,
    publishedAt: toMs(d.publishedAt) || toMs(d.timestamp) || 0,
    updatedAt: toMs(d.modifiedAt) || undefined,
    bodyHtml: typeof d.bodyHtml === 'string' && d.bodyHtml ? d.bodyHtml : articleBodyHtml(blocks),
    bodyText: typeof d.bodyText === 'string' && d.bodyText ? d.bodyText : articlePlainText(blocks),
    category: d.category && d.category !== 'Article' ? String(d.category) : undefined,
    tags: Array.isArray(d.tags) ? d.tags.map(String) : undefined,
    coverImage: d.coverImage || undefined,
    notices: Array.isArray(d.notices) ? d.notices : undefined,
    disclosures: d.disclosures && typeof d.disclosures === 'object' ? d.disclosures : undefined,
    embargoUntil: toMs(d.embargoUntil) || undefined,
    paywalled: d.access === 'SUBSCRIBERS' || d.access === 'PAID',
    isPublic: d.isPublic !== false,
  };
}
