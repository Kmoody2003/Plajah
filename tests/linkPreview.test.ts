import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBlockedIp, isBlockedHostname, checkUrlShape, resolveRedirect, isHtmlContentType,
  parseLinkMeta, cleanText, decodeEntities, TtlLru,
} from '../services/linkPreviewCore';

test('isBlockedIp: private / loopback / link-local / metadata / reserved v4', () => {
  for (const ip of ['127.0.0.1', '127.1.2.3', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '0.0.0.0', '100.64.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '192.0.0.8']) assert.equal(isBlockedIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '93.184.216.34', '100.63.255.255']) assert.equal(isBlockedIp(ip), false, ip);
});

test('isBlockedIp: v6 loopback, ULA, link-local, mapped/NAT64/6to4 embedding', () => {
  for (const ip of ['::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1',
    '::ffff:10.0.0.1', '::ffff:169.254.169.254', '64:ff9b::7f00:1', '2002:7f00:1::1', '2001:db8::1', '[::1]']) assert.equal(isBlockedIp(ip), true, ip);
  for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']) assert.equal(isBlockedIp(ip), false, ip);
  assert.equal(isBlockedIp('not-an-ip'), true);
});

test('isBlockedHostname', () => {
  for (const h of ['localhost', 'foo.localhost', 'metadata.google.internal', 'x.internal', 'printer.local', 'intranet', '127.0.0.1', '[::1]', 'LOCALHOST.'])
    assert.equal(isBlockedHostname(h), true, h);
  for (const h of ['example.com', 'www.nytimes.com', 'sub.domain.co.uk', '8.8.8.8']) assert.equal(isBlockedHostname(h), false, h);
});

test('checkUrlShape: scheme, credentials, port, host; numeric-IP obfuscation is normalised by URL', () => {
  assert.equal(checkUrlShape('https://example.com/a?b=1').ok, true);
  assert.equal(checkUrlShape('http://example.com:8080/').ok, true);
  for (const u of ['ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'gopher://x.com', 'https://user:pw@example.com',
    'http://example.com:22', 'http://localhost/', 'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://0177.0.0.1/',
    'http://[::1]/', 'http://169.254.169.254/latest/meta-data/', 'http://metadata.google.internal/', 'not a url', '', 'http://' + 'a'.repeat(3000) + '.com'])
    assert.equal(checkUrlShape(u).ok, false, u);
});

test('resolveRedirect re-validates each hop (relative ok, private target refused)', () => {
  const from = new URL('https://example.com/a/b');
  const ok = resolveRedirect(from, '/c');
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.url.toString(), 'https://example.com/c');
  assert.equal(resolveRedirect(from, 'http://169.254.169.254/').ok, false);
  assert.equal(resolveRedirect(from, 'http://localhost:8080/admin').ok, false);
  assert.equal(resolveRedirect(from, 'file:///etc/passwd').ok, false);
  assert.equal(resolveRedirect(from, undefined).ok, false);
});

test('isHtmlContentType', () => {
  assert.equal(isHtmlContentType('text/html; charset=utf-8'), true);
  assert.equal(isHtmlContentType('application/xhtml+xml'), true);
  assert.equal(isHtmlContentType('application/json'), false);
  assert.equal(isHtmlContentType('image/png'), false);
  assert.equal(isHtmlContentType(undefined), false);
});

const PAGE = `<!doctype html><html><head>
<title>Fallback &amp; Title</title>
<meta property="og:title" content="Big &quot;News&quot; &#8212; Today">
<meta property="og:description" content="  A   long
 description with <b>tags</b> &hellip; ">
<meta property="og:image" content="/img/hero.jpg">
<meta property="og:site_name" content="The Daily">
<meta name="twitter:title" content="TW title">
<link rel="shortcut icon" href="/fav.png">
</head><body>x</body></html>`;

test('parseLinkMeta: og wins, entities decoded, relative image/favicon resolved, text sanitised', () => {
  const p = parseLinkMeta(PAGE, 'https://news.example.com/story/1');
  assert.equal(p.title, 'Big "News" — Today');
  assert.equal(p.description, 'A long description with tags …');
  assert.equal(p.image, 'https://news.example.com/img/hero.jpg');
  assert.equal(p.siteName, 'The Daily');
  assert.equal(p.favicon, 'https://news.example.com/fav.png');
  assert.equal(p.url, 'https://news.example.com/story/1');
});

test('parseLinkMeta: falls back to twitter:*, <title>, default favicon and host siteName', () => {
  const a = parseLinkMeta('<title>Just a Title</title><meta name="twitter:description" content="tw desc"><meta name="twitter:image" content="https://cdn.x.com/i.png">', 'https://www.site.org/p');
  assert.equal(a.title, 'Just a Title');
  assert.equal(a.description, 'tw desc');
  assert.equal(a.image, 'https://cdn.x.com/i.png');
  assert.equal(a.siteName, 'site.org');
  assert.equal(a.favicon, 'https://www.site.org/favicon.ico');
  const b = parseLinkMeta('<meta name="twitter:title" content="TT">', 'https://a.com/');
  assert.equal(b.title, 'TT');
});

test('parseLinkMeta: attribute order / single quotes / unquoted, <base href>, hostile image schemes dropped', () => {
  const html = `<base href="https://cdn.example.org/assets/">
<meta content='Single Q' property='og:title'>
<meta property=og:image content=pics/a.png>
<link href="ico.png" rel="icon">`;
  const p = parseLinkMeta(html, 'https://example.com/x');
  assert.equal(p.title, 'Single Q');
  assert.equal(p.image, 'https://cdn.example.org/assets/pics/a.png');
  assert.equal(p.favicon, 'https://cdn.example.org/assets/ico.png');
  for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'ftp://x/y.png', 'https://u:p@evil.com/a.png'])
    assert.equal(parseLinkMeta(`<meta property="og:image" content="${bad}">`, 'https://example.com/').image, '', bad);
});

test('cleanText: strips tags/control chars, truncates with ellipsis; decodeEntities numeric', () => {
  assert.equal(cleanText('<script>x</script>hi\u0000there', 50), 'x hi there');
  const t = cleanText('a'.repeat(500), 200);
  assert.equal(t.length, 200);
  assert.ok(t.endsWith('…'));
  assert.equal(cleanText(undefined, 10), '');
  assert.equal(decodeEntities('&#x41;&#66;&amp;&unknown;'), 'AB&&unknown;');
});

test('TtlLru: expiry, recency eviction, size cap', () => {
  const c = new TtlLru<number>(2, 1000);
  c.set('a', 1, 0); c.set('b', 2, 0);
  assert.equal(c.get('a', 10), 1);          // a is now most recent
  c.set('c', 3, 20);                         // evicts b (least recent)
  assert.equal(c.get('b', 21), undefined);
  assert.equal(c.get('a', 21), 1);
  assert.equal(c.get('c', 21), 3);
  assert.equal(c.get('a', 1001), undefined); // a expired (set at 0, ttl 1000)
  assert.equal(c.get('c', 1019), 3);
  assert.equal(c.get('c', 1021), undefined);
  assert.ok(c.size <= 2);
});
