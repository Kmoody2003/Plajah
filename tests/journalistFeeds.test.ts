import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRss, buildAtom, buildAmpLiteHtml, buildAppleNewsArticle, buildEmailIssue, publishable, xmlEscape, newsArticleJsonLd, type FeedArticle, type FeedMeta,
} from '../services/journalist/feedGenerators';
import { appendNotice } from '../services/journalist/correctionLog';
import {
  buildArticleTelaDoc, articlePlainText, articleBodyHtml, templatesForKind, openerPage, fillTemplateObjects, telaDocPlainText, estimateWriterHeight, legacyArticleSnapshot, apDate,
  type TemplateLike, type ArticleLike,
} from '../services/journalist/articleTela';
import type { TelaVectorObject } from '../types';

const meta: FeedMeta = { title: 'The Eastside Dispatch', link: 'https://plajah.com/@eastside', feedUrl: 'https://plajah.com/feeds/eastside.rss', description: 'Local news & more', authorName: 'Ada Reporter' };
const notice = appendNotice([], { label: 'CORRECTION', text: 'The mayor’s name is Lee, not Li.', byUid: 'u', byName: 'Ed', at: Date.UTC(2026, 9, 9) });
const art = (o: Partial<FeedArticle> = {}): FeedArticle => ({
  id: 'a1', title: 'Council votes to close Eastside library', subtitle: 'The 5-4 vote ends a 90-year run', url: 'https://plajah.com/?type=article&id=a1',
  authorName: 'Ada Reporter', publishedAt: Date.UTC(2026, 9, 8, 12), bodyHtml: '<p>The council voted Tuesday.</p><h2>Reaction</h2><p>Residents were upset.</p><blockquote>&quot;We will fight&quot;<footer>Pat Lee</footer></blockquote><figure><img src="https://img.test/a.jpg?x=1&amp;y=2" alt=""><figcaption>Library exterior</figcaption></figure>',
  bodyText: 'The council voted Tuesday. Reaction. Residents were upset.', category: 'Local', tags: ['library'], coverImage: 'https://img.test/cover.jpg', isPublic: true, ...o,
});

test('xmlEscape handles the five entities and strips control chars', () => {
  assert.equal(xmlEscape(`<a href="x">Tom & 'Jerry'</a>\u0001`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;');
});

test('publishable drops embargoed and private articles, sorts newest first', () => {
  const now = Date.UTC(2026, 9, 8);
  const list = publishable([art({ id: 'old', publishedAt: 1 }), art({ id: 'emb', embargoUntil: now + 1000 }), art({ id: 'priv', isPublic: false }), art({ id: 'new', publishedAt: 5 })], now);
  assert.deepEqual(list.map(a => a.id), ['new', 'old']);
});

test('RSS 2.0 is well-formed and carries corrections, escapes titles, hides embargoed', () => {
  const xml = buildRss(meta, [art({ title: 'Cats & dogs <live>', notices: notice }), art({ id: 'secret', embargoUntil: Date.now() + 1e9 })]);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/);
  assert.match(xml, /<title>Cats &amp; dogs &lt;live&gt;<\/title>/);
  assert.match(xml, /<guid isPermaLink="false">plajah-article-a1<\/guid>/);
  assert.match(xml, /Corrections and updates/);
  assert.ok(!xml.includes('plajah-article-secret'));
  assert.match(xml, /<atom:link href="https:\/\/plajah\.com\/feeds\/eastside\.rss" rel="self"/);
  assert.equal((xml.match(/<item>/g) || []).length, 1);
  assertBalanced(xml);
});

test('RSS CDATA survives a literal ]]> in the body', () => {
  const xml = buildRss(meta, [art({ bodyHtml: '<p>a ]]> b</p>' })]);
  assert.ok(!/<content:encoded><!\[CDATA\[[^\]]*\]\]>[^<]*b/.test(xml) || xml.includes(']]]]><![CDATA[>'));
  assert.match(xml, /\]\]\]\]><!\[CDATA\[>/);
});

test('RSS marks retractions in the title and paywalled items carry only the summary', () => {
  const ret = appendNotice([], { label: 'RETRACTION', text: 'Retracted because the source recanted.', byUid: 'u', byName: 'Ed' });
  assert.match(buildRss(meta, [art({ notices: ret })]), /\[Retracted\] Council votes/);
  const paid = buildRss(meta, [art({ paywalled: true })]);
  assert.ok(!paid.includes('Residents were upset'));
  assert.match(paid, /Continue reading on Plajah/);
});

test('Atom 1.0 has required elements', () => {
  const xml = buildAtom(meta, [art({ updatedAt: Date.UTC(2026, 9, 9) })]);
  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  for (const tag of ['<id>', '<title>', '<updated>', '<author>', '<entry>', '<published>', '<link rel="alternate"']) assert.ok(xml.includes(tag), tag);
  assert.match(xml, /<updated>2026-10-09T00:00:00\.000Z<\/updated>\n    <author>/);
  assert.match(xml, /type="html">&lt;p&gt;The council voted/);
  assertBalanced(xml);
});

test('AMP-lite page: canonical, JSON-LD NewsArticle, corrections, no scripts except ld+json', () => {
  const html = buildAmpLiteHtml(art({ notices: notice, disclosures: { aiAssisted: true, aiNote: 'Aria drafted the timeline.', sponsored: false, affiliateLinks: false, conflictOfInterest: false } }));
  assert.match(html, /<link rel="canonical" href="https:\/\/plajah\.com/);
  assert.match(html, /"@type":"NewsArticle"/);
  assert.match(html, /"@type":"CorrectionComment"/);
  assert.match(html, /AI disclosure: Aria drafted the timeline/);
  assert.equal((html.match(/<script/g) || []).length, 1);
  assert.ok(!/<script>/.test(html));
  const evil = buildAmpLiteHtml(art({ title: '</script><script>alert(1)' }));
  assert.ok(!evil.includes('</script><script>alert'));
  assert.ok(evil.includes(String.fromCharCode(92) + "u003c/script"));
  assert.equal((evil.match(/<script/g) || []).length, 1);
});

test('Apple News Format: required fields and component mapping', () => {
  const anf = buildAppleNewsArticle(art({ notices: notice }));
  assert.equal(anf.version, '1.7'); assert.equal(anf.identifier, 'plajah-a1'); assert.equal(anf.language, 'en');
  assert.ok(anf.layout.columns > 0 && anf.layout.width > 0);
  const roles = anf.components.map(c => c.role);
  assert.deepEqual(roles.slice(0, 3), ['title', 'intro', 'byline']);
  for (const r of ['header', 'heading2', 'quote', 'photo', 'body']) assert.ok(roles.includes(r), r);
  assert.equal((anf.components.find(c => c.role === 'photo') as any).URL, 'https://img.test/a.jpg?x=1&y=2');
  assert.ok(anf.components.some(c => /^Correction:/.test(String(c.text))));
  for (const c of anf.components) if (c.textStyle) assert.ok(anf.componentTextStyles[c.textStyle as string], String(c.textStyle));
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(anf)));
});

test('Email issue: subject, preheader, inline-styled html, unsubscribe + postal address placeholders', () => {
  const e = buildEmailIssue(art({ notices: notice }), { publicationName: 'The Eastside Dispatch' });
  assert.equal(e.subject, 'Council votes to close Eastside library');
  assert.match(e.html, /\{\{unsubscribe\}\}/); assert.match(e.html, /\{\{postal_address\}\}/);
  assert.match(e.html, /Corrections and updates/);
  assert.match(e.text, /^Council votes/);
  const real = buildEmailIssue(art(), { publicationName: 'X', unsubscribeUrl: 'https://u.test/?t=1&b=2', postalAddress: '1 Main St, Detroit MI' });
  assert.match(real.html, /href="https:\/\/u\.test\/\?t=1&amp;b=2"/); assert.ok(!real.html.includes('{{'));
});

// ── Tela bridge ─────────────────────────────────────────────────────────────

const mkObj = (role: TelaVectorObject['templateRole'], text: string): TelaVectorObject => ({ id: `o_${role}`, kind: 'TEXT', x: 0, y: 0, w: 100, h: 30, fill: '#000', stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, text, templateRole: role });
const tpl = (id: string, group: string): TemplateLike => ({
  id, name: id, group, tags: [], palette: ['#fff', '#111', '#c00', '#999'], width: 816, height: 1056,
  pages: [{ label: '1 · COVER', build: () => [] }, { label: '2 · FEATURE OPENER', build: () => [mkObj('HEADLINE', 'PLACEHOLDER HEAD'), mkObj('DECK', 'placeholder deck'), mkObj('BODY', 'lorem ipsum'), mkObj('LABEL', 'LABEL')] }],
});

const article: ArticleLike & { id: string } = {
  id: 'a1', title: 'Council votes to close library', subtitle: 'A 5-4 vote', authorName: 'Ada Reporter', category: 'Local', timestamp: Date.UTC(2026, 9, 8),
  coverImage: 'https://img.test/cover.jpg',
  blocks: [
    { id: 'b1', type: 'TEXT', content: 'The council voted Tuesday.' }, { id: 'b2', type: 'HEADING', content: 'Reaction' },
    { id: 'b3', type: 'IMAGE', content: 'https://img.test/a.jpg', caption: 'Library exterior' },
    { id: 'b4', type: 'QUOTE', content: 'We will fight', caption: 'Pat Lee' }, { id: 'b5', type: 'TEXT', content: '' },
    { id: 'b6', type: 'AUDIO', content: 'https://img.test/a.mp3' }, { id: 'b7', type: 'TEXT', content: 'Last paragraph <b>& more</b>.' },
  ],
};

test('template feature detection finds ARTICLE/MAGAZINE/CATALOG only when present', () => {
  const gallery = [tpl('pub:news-1', 'NEWSLETTER'), tpl('pub:mag-1', 'MAGAZINE')];
  assert.deepEqual(templatesForKind(gallery, 'ARTICLE'), []);
  assert.deepEqual(templatesForKind(gallery, 'CATALOG'), []);
  assert.equal(templatesForKind(gallery, 'MAGAZINE').length, 1);
  const later = [...gallery, tpl('pub:article-1', 'ARTICLE'), { ...tpl('pub:x', 'OTHER'), tags: ['article'] }];
  assert.equal(templatesForKind(later, 'ARTICLE').length, 2);
});

test('openerPage prefers a feature opener', () => { assert.match(openerPage(tpl('t', 'ARTICLE'))!.label, /FEATURE OPENER/); });

test('fillTemplateObjects fills headline/deck/label by role and drops body placeholders', () => {
  const out = fillTemplateObjects([mkObj('HEADLINE', 'X'), mkObj('DECK', 'y'), mkObj('BODY', 'z'), mkObj('LABEL', 'l')], article);
  assert.equal(out.find(o => o.templateRole === 'HEADLINE')!.text, article.title);
  assert.equal(out.find(o => o.templateRole === 'DECK')!.text, 'A 5-4 vote');
  assert.ok(!out.some(o => o.templateRole === 'BODY'));
  assert.match(out.find(o => o.templateRole === 'LABEL')!.text!, /Local .* By Ada Reporter/);
  assert.ok(!fillTemplateObjects([mkObj('DECK', 'y')], { ...article, subtitle: '' }).some(o => o.templateRole === 'DECK'));
});

test('buildArticleTelaDoc: masthead + cover + writer segments split at media, ids resolve', () => {
  const doc = buildArticleTelaDoc(article, { docId: 'article:a1', ownerId: 'u1', template: tpl('pub:article-1', 'ARTICLE'), now: 1 });
  assert.equal(doc.id, 'article:a1'); assert.equal(doc.templatePreset?.templateId, 'pub:article-1');
  const kinds = doc.frames.map(f => doc.devices[f.deviceIds[0]].type);
  assert.deepEqual(kinds, ['VECTOR', 'MEDIA', 'WRITER', 'MEDIA', 'WRITER', 'MEDIA', 'WRITER']);
  for (const f of doc.frames) for (const id of f.deviceIds) assert.ok(doc.devices[id], id);
  assert.equal(new Set(doc.frames.map(f => f.id)).size, doc.frames.length);
  const text = telaDocPlainText(doc);
  assert.ok(text.includes('The council voted Tuesday.') && text.includes('Reaction') && text.includes('Last paragraph <b>& more</b>.'));
  assert.ok(text.includes('We will fight'));
  const writer = doc.devices[doc.frames[2].deviceIds[0]] as any;
  assert.equal(writer.blocks.find((b: any) => b.id === 'b2').kind, 'h2');
  assert.ok(doc.frames.every(f => f.h > 0 && f.w > 0));
  const vec = doc.devices[doc.frames[0].deviceIds[0]] as any;
  assert.equal(vec.objects.find((o: any) => o.templateRole === 'HEADLINE').text, article.title);
  assert.deepEqual(vec.objects.map((o: any) => o.id), [...new Set(vec.objects.map((o: any) => o.id))]);
});

test('user text is escaped inside Writer blocks (no HTML injection)', () => {
  const doc = buildArticleTelaDoc({ ...article, blocks: [{ id: 'x', type: 'TEXT', content: '<img src=x onerror=alert(1)> & co' }] }, { docId: 'd' });
  const w = Object.values(doc.devices).find(d => d.type === 'WRITER') as any;
  assert.ok(!w.blocks[0].text.includes('<img'));
  assert.match(w.blocks[0].text, /&lt;img/);
});

test('no template -> built-in masthead; empty media is skipped; legacy snapshot is deterministic', () => {
  const doc = buildArticleTelaDoc({ ...article, coverImage: undefined, blocks: [{ id: 'm', type: 'IMAGE', content: '' }, { id: 't', type: 'TEXT', content: 'Hi there reader.' }] }, { docId: 'd', now: 1 });
  assert.deepEqual(doc.frames.map(f => doc.devices[f.deviceIds[0]].type), ['VECTOR', 'WRITER']);
  assert.ok(!doc.templatePreset);
  const a = JSON.stringify(legacyArticleSnapshot(article)); const b = JSON.stringify(legacyArticleSnapshot(article));
  assert.equal(a.replace(/"(txt|rect)_[a-z0-9]+"/g, '"id"'), b.replace(/"(txt|rect)_[a-z0-9]+"/g, '"id"'));
  assert.equal(legacyArticleSnapshot(article).id, 'legacy:a1');
});

test('plain text / html / height helpers', () => {
  assert.equal(articlePlainText(article.blocks), 'The council voted Tuesday.\n\nReaction\n\nWe will fight\n\nLast paragraph <b>& more</b>.');
  const html = articleBodyHtml(article.blocks);
  assert.match(html, /<h2>Reaction<\/h2>/); assert.match(html, /<figcaption>Library exterior<\/figcaption>/); assert.match(html, /&lt;b&gt;&amp; more/);
  const short = estimateWriterHeight([{ id: '1', kind: 'p', text: 'hi' }]);
  const long = estimateWriterHeight(Array.from({ length: 30 }, (_, i) => ({ id: String(i), kind: 'p' as const, text: 'word '.repeat(120) })));
  assert.ok(long > short * 10);
  assert.equal(apDate(Date.UTC(2026, 9, 8)), 'Oct. 8, 2026'); assert.equal(apDate(Date.UTC(2026, 2, 1)), 'March 1, 2026');
});

function assertBalanced(xml: string) {
  const stack: string[] = [];
  const stripped = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  for (const m of stripped.matchAll(/<(\/?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>/g)) {
    if (m[4] === '/') continue;
    if (m[1] === '/') { assert.equal(stack.pop(), m[2], `unbalanced </${m[2]}>`); } else stack.push(m[2]);
  }
  assert.deepEqual(stack, []);
}

import { locateInBlocks } from '../services/journalist/articleTela';
import { checkStyle } from '../services/journalist/styleChecker';

test('locateInBlocks maps a style issue back to the right block and offsets', () => {
  const blocks = [
    { id: 'a', type: 'HEADING' as const, content: 'Budget vote' },
    { id: 'img', type: 'IMAGE' as const, content: 'https://x/y.jpg' },
    { id: 'b', type: 'TEXT' as const, content: '  The council hired 5 officers on Tuesday.  ' },
    { id: 'c', type: 'TEXT' as const, content: 'Senator Smith objected.' },
  ];
  const text = articlePlainText(blocks);
  const issue = checkStyle(text).issues.find(i => i.rule === 'numbers')!;
  const loc = locateInBlocks(blocks, issue.start, issue.end)!;
  assert.equal(loc.blockId, 'b');
  assert.equal(blocks[2].content.slice(loc.start, loc.end), '5');
  const titles = checkStyle(text).issues.find(i => i.rule === 'titles')!;
  const l2 = locateInBlocks(blocks, titles.start, titles.end)!;
  assert.equal(l2.blockId, 'c'); assert.equal(blocks[3].content.slice(l2.start, l2.end), 'Senator');
  assert.equal(locateInBlocks(blocks, 5, 40), null);   // crosses a boundary
});
