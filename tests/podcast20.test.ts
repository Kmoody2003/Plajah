import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';

import { generatePodcastRSS, PODCAST_DIRECTORIES, enclosureInfo, trackPubDate } from '../services/podcastRSSService';
import { podcastGuidFor, sha1Hex, uuidv5 } from '../services/podcast20/guid';
import { xmlEsc, cdata } from '../services/podcast20/xml';
import { isLightningAddress, isNodePubkey, isGeoUri, validatePodcast20Settings } from '../services/podcast20/validate';
import { buildChaptersDoc, normalizeChapters } from '../services/podcast20/chapters';
import { cuesFromTimedLines, toSrt, toVtt, toJsonTranscript } from '../services/podcast20/transcript';
import { albumFeedBlock, trackFeedBlock } from '../services/podcast20/access';
import { renderPublicFeed } from '../services/podcast20/feed';
import { authHeaders, notifyPodcastIndex } from '../services/podcast20/podcastIndex';
import { createPodcast20Router } from '../routes/podcast20';

const NODE = '03ae9f91a0cb8ff43840e3c322c4c61f019d8c1c3cea15a25cfc425ac605e61a4a';
const NOW = Date.UTC(2026, 10, 10);

function album(o: Record<string, any> = {}): any {
  return {
    id: 'alb1', ownerId: 'u1', title: 'Grace & "Truth" <Sermons>', artist: "O'Neil", description: 'Weekly sermons',
    coverImage: 'https://cdn.plajah.com/c.jpg?a=1&b=2', createdAt: Date.UTC(2026, 0, 1), themeColor: '#000',
    type: 'MUSIC', subType: 'PODCAST', isPublic: true,
    tracks: [
      { id: 't1', title: 'Ep 1', artist: 'X', url: 'https://firebasestorage.googleapis.com/v0/b/x/o/audio%2Fep1.m4a?alt=media&token=abc', duration: 120,
        podcastMetadata: { episodeNumber: 1, seasonNumber: 2, showTitle: 'S' }, kind: 'PODCAST', fileSize: 12345, publishedAt: Date.UTC(2026, 1, 2),
        timeCodedLyrics: [{ time: 0, text: 'Welcome' }, { time: 4.5, text: 'Today -> grace' }] },
      { id: 't2', title: 'Members only', artist: 'X', url: 'https://x/2.mp3', isPaywalled: true, kind: 'PODCAST', podcastMetadata: { episodeNumber: 2, showTitle: 'S' } },
      { id: 't3', title: 'Cover song', artist: 'X', url: 'https://x/3.mp3', trackMeta: { rights: { writing: 'sole', source: 'cover', deal: 'none' } } },
      { id: 't4', title: 'Future', artist: 'X', url: 'https://x/4.mp3', kind: 'PODCAST', releaseDate: NOW + 86_400_000 },
    ],
    ...o,
  };
}

// ── guid / xml ─────────────────────────────────────────────────────────────
test('podcast:guid matches the spec example', () => {
  assert.equal(podcastGuidFor('https://mp3s.nashownotes.com/pc20rss.xml'), '917393e3-1b1e-5cef-ace4-edaa54e1f810');
  assert.equal(podcastGuidFor('http://mp3s.nashownotes.com/pc20rss.xml/'), '917393e3-1b1e-5cef-ace4-edaa54e1f810');
  assert.equal(sha1Hex('abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  // RFC 4122 DNS namespace example: uuidv5('python.org', DNS)
  assert.equal(uuidv5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'), '886313e1-3b8a-5372-9b90-0c9aee199e5d');
});

test('xml escaping covers attributes, quotes and CDATA terminators', () => {
  assert.equal(xmlEsc(`a&b<c>"d'`), 'a&amp;b&lt;c&gt;&quot;d&apos;');
  assert.equal(xmlEsc('bad\u0001char'), 'badchar');
  assert.equal(cdata('x]]>y'), '<![CDATA[x]]]]><![CDATA[>y]]>');
});

// ── existing generator keeps working ───────────────────────────────────────
test('generatePodcastRSS without podcast20 stays a plain feed, now escaped and typed', () => {
  const xml = generatePodcastRSS(album(), { siteUrl: 'https://plajah.com/?a=1&b=2' });
  assert.ok(!xml.includes('<podcast:guid>'));
  assert.ok(xml.includes('<link>https://plajah.com/?a=1&amp;b=2</link>'));
  assert.ok(xml.includes('href="https://cdn.plajah.com/c.jpg?a=1&amp;b=2"'));
  assert.ok(xml.includes('type="audio/mp4" length="12345"'), 'enclosure type/length from track data');
  assert.ok(xml.includes(new Date(Date.UTC(2026, 1, 2)).toUTCString()), 'per-track pubDate');
  assert.ok(xml.includes('<title>Grace &amp; &quot;Truth&quot; &lt;Sermons&gt;</title>'));
  assert.ok(PODCAST_DIRECTORIES.length >= 6);
});

test('enclosure + pubDate helpers', () => {
  assert.deepEqual(enclosureInfo({ url: 'https://x/a.mp3' } as any), { type: 'audio/mpeg', length: 0 });
  assert.deepEqual(enclosureInfo({ url: 'https://x/a', mimeType: 'audio/ogg', sizeBytes: '99' } as any), { type: 'audio/ogg', length: 99 });
  assert.equal(trackPubDate({ createdAt: 5000 } as any, { createdAt: { seconds: 1700000000 } } as any), 1700000000 * 1000);
  assert.equal(trackPubDate({ createdAt: 1700000000000 } as any, {} as any), 1700000000000);
});

// ── validation ─────────────────────────────────────────────────────────────
test('lightning address / node pubkey / geo formats', () => {
  assert.ok(isNodePubkey(NODE));
  assert.ok(!isNodePubkey('04' + NODE.slice(2)));
  assert.ok(!isNodePubkey(NODE.slice(0, 60)));
  assert.ok(isLightningAddress('pastor@getalby.com'));
  assert.ok(!isLightningAddress('pastor@localhost'));
  assert.ok(!isLightningAddress('no-at-sign.com'));
  assert.ok(isGeoUri('geo:30.2672,-97.7431'));
  assert.ok(!isGeoUri('geo:130,0'));
});

test('value splits must sum to 100 and addresses must be valid', () => {
  const good = validatePodcast20Settings({
    value: { recipients: [
      { name: 'Host', type: 'lnaddress', address: 'host@getalby.com', split: 90 },
      { name: 'Guest', type: 'node', address: NODE.toUpperCase().replace(/^03/, '03'), split: 10, customKey: '696969', customValue: 'abc' },
    ] },
  });
  assert.ok(good.ok, good.errors.join('; '));
  assert.equal(good.value.value?.recipients[1].address, NODE.toLowerCase());
  assert.equal(good.value.value?.method, 'keysend');

  const bad = validatePodcast20Settings({ value: { recipients: [
    { name: 'A', type: 'lnaddress', address: 'a@getalby.com', split: 60 },
    { name: 'B', type: 'node', address: 'nothex', split: 30 },
  ] } });
  assert.ok(!bad.ok);
  assert.ok(bad.errors.some(e => /add up to 100/.test(e)));
  assert.ok(bad.errors.some(e => /66-character hex/.test(e)));
});

test('validation never injects a Plajah recipient and drops server bookkeeping', () => {
  const v = validatePodcast20Settings({ guid: 'x', ownerId: 'evil', value: { recipients: [{ name: 'Me', type: 'lnaddress', address: 'me@strike.me', split: 100 }] } });
  assert.ok(v.ok);
  assert.equal(v.value.value?.recipients.length, 1);
  assert.equal((v.value as any).guid, undefined);
  assert.equal((v.value as any).ownerId, undefined);
});

test('episode extras must belong to the album; funding must be https; live items checked', () => {
  const v = validatePodcast20Settings({
    funding: [{ url: 'http://insecure.example/give' }],
    episodes: { nope: { chapters: [{ startTime: 0, title: 'x' }] } },
    liveItems: [{ title: 'Sunday', status: 'soon', start: 1, streamUrl: 'https://live.plajah.com/a.m3u8' }],
  }, { trackIds: ['t1'] });
  assert.ok(!v.ok);
  assert.ok(v.errors.some(e => /Funding/.test(e)));
  assert.ok(v.errors.some(e => /not on this album/.test(e)));
  assert.ok(v.errors.some(e => /status/.test(e)));
});

// ── chapters / transcripts ─────────────────────────────────────────────────
test('chapters: owner chapters, sorted, deduped, clamped; mix cue sheet fallback', () => {
  assert.deepEqual(normalizeChapters([{ startTime: 30, title: 'B' }, { startTime: 0, title: 'A' }, { startTime: 30, title: 'dup' }, { startTime: 999 }], 120).map(c => c.title), ['A', 'B']);
  const a = album();
  const doc = buildChaptersDoc(a, a.tracks[0], { episodes: { t1: { chapters: [{ startTime: 10, title: 'Intro' }] } } });
  assert.equal(doc?.version, '1.2.0');
  assert.equal(doc?.chapters[0].title, 'Intro');
  assert.equal(buildChaptersDoc(a, a.tracks[0], {}), null);
  const mix = { subType: 'MIX', mixMeta: { cueSheet: [{ time: 60, title: 'Song', artist: 'DJ' }] }, tracks: [{ id: 'm', duration: 3600 }] };
  assert.equal(buildChaptersDoc(mix, mix.tracks[0] as any)?.chapters[0].title, 'DJ - Song');
});

test('transcripts: VTT, SRT and JSON from timed lyrics', () => {
  const cues = cuesFromTimedLines([{ time: 4.5, text: 'two' }, { time: 0, text: 'one <b>' }], 6);
  assert.deepEqual(cues.map(c => [c.start, c.end]), [[0, 4.5], [4.5, 6]]);
  const vtt = toVtt(cues);
  assert.ok(vtt.startsWith('WEBVTT\n\n00:00:00.000 --> 00:00:04.500\none &lt;b&gt;'));
  assert.ok(toSrt(cues).startsWith('1\n00:00:00,000 --> 00:00:04,500\none <b>'));
  assert.equal(toJsonTranscript(cues).segments[1].body, 'two');
});

// ── access ─────────────────────────────────────────────────────────────────
test('access: private, paywalled, removed, unreleased and non-podcast albums have no public feed', () => {
  assert.equal(albumFeedBlock(album(), null, NOW), null);
  assert.equal(albumFeedBlock(album({ isPrivate: true }), null, NOW), 'private');
  assert.equal(albumFeedBlock(album({ isPublic: false }), null, NOW), 'private');
  assert.equal(albumFeedBlock(album({ isPaywalled: true }), null, NOW), 'paywalled');
  assert.equal(albumFeedBlock(album({ moderationStatus: 'removed' }), null, NOW), 'removed');
  assert.equal(albumFeedBlock(album({ releaseDate: NOW + 1000 }), null, NOW), 'unreleased');
  assert.equal(albumFeedBlock(album({ isDraft: true }), null, NOW), 'draft');
  const music = album({ subType: undefined, tracks: [{ id: 's', url: 'https://x/s.mp3' }] });
  assert.equal(albumFeedBlock(music, null, NOW), 'not_a_feed');
  assert.equal(albumFeedBlock(music, { enabled: true }, NOW), null);
  const a = album();
  assert.deepEqual(a.tracks.map((t: any) => trackFeedBlock(a, t, NOW)), [null, 'paywalled', 'rights_held', 'unreleased']);
});

// ── full feed ──────────────────────────────────────────────────────────────
test('public feed: podcast:* tags present, held/paid/unreleased episodes absent', () => {
  const settings = {
    guid: '917393e3-1b1e-5cef-ace4-edaa54e1f810',
    medium: 'podcast' as const, locked: true, lockedOwner: 'pastor@church.org',
    funding: [{ url: 'https://plajah.com/give?c=1&x=2', label: 'Give' }],
    persons: [{ name: 'Rev. Ann', role: 'host', group: 'cast' }],
    location: { name: 'Austin, TX', geo: 'geo:30.2672,-97.7431', osm: 'R113314' },
    txt: [{ purpose: 'verify', value: 'S6lpp-7ZCn8-dZfGc-OoyVG' }],
    podroll: [{ feedGuid: '917393e3-1b1e-5cef-ace4-edaa54e1f810', feedUrl: 'https://mp3s.nashownotes.com/pc20rss.xml' }],
    value: { type: 'lightning' as const, method: 'keysend' as const, suggested: '0.00000005000', recipients: [
      { name: 'Ann', type: 'lnaddress' as const, address: 'ann@getalby.com', split: 95 },
      { name: 'Guest', type: 'node' as const, address: NODE, split: 5 },
    ] },
    liveItems: [{ id: 'sun', title: 'Sunday Live', status: 'live' as const, start: NOW, streamUrl: 'https://live.plajah.com/s.m3u8', contentLinks: [{ href: 'https://plajah.com/onair/sun' }] }],
    episodes: { t1: {
      chapters: [{ startTime: 0, title: 'Intro' }], soundbites: [{ startTime: 10, duration: 30, title: 'Best bit' }],
      socialInteract: { uri: 'https://plajah.com/ap/notes/abc', protocol: 'activitypub' as const, accountId: '@ann@plajah.com' },
      seasonName: 'Romans',
    } },
  };
  const r = renderPublicFeed('alb1', album({ license: 'CC_BY' }), settings, 'https://plajah.com', NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  const x = r.xml;
  assert.equal(r.trackCount, 1);
  for (const needle of [
    '<podcast:guid>917393e3-1b1e-5cef-ace4-edaa54e1f810</podcast:guid>',
    '<podcast:medium>podcast</podcast:medium>',
    '<podcast:locked owner="pastor@church.org">yes</podcast:locked>',
    '<podcast:funding url="https://plajah.com/give?c=1&amp;x=2">Give</podcast:funding>',
    '<podcast:person role="host" group="cast">Rev. Ann</podcast:person>',
    '<podcast:location geo="geo:30.2672,-97.7431" osm="R113314">Austin, TX</podcast:location>',
    '<podcast:license url="https://creativecommons.org/licenses/by/4.0/">cc-by-4.0</podcast:license>',
    '<podcast:txt purpose="verify">',
    '<podcast:remoteItem feedGuid="917393e3-1b1e-5cef-ace4-edaa54e1f810"',
    '<podcast:value type="lightning" method="keysend" suggested="0.00000005000">',
    '<podcast:valueRecipient name="Ann" type="lnaddress" address="ann@getalby.com" split="95"/>',
    `address="${NODE}" split="5"/>`,
    '<podcast:liveItem status="live" start="2026-11-10T00:00:00.000Z">',
    '<podcast:contentLink href="https://plajah.com/onair/sun">',
    '<podcast:season name="Romans">2</podcast:season>',
    '<podcast:episode>1</podcast:episode>',
    '<podcast:chapters url="https://plajah.com/podcast/alb1/chapters/t1.json" type="application/json+chapters"/>',
    '<podcast:transcript url="https://plajah.com/podcast/alb1/transcript/t1.vtt" type="text/vtt" rel="captions"/>',
    '<podcast:transcript url="https://plajah.com/podcast/alb1/transcript/t1.srt" type="application/x-subrip" rel="captions"/>',
    '<podcast:soundbite startTime="10" duration="30">Best bit</podcast:soundbite>',
    '<podcast:socialInteract uri="https://plajah.com/ap/notes/abc" protocol="activitypub" accountId="@ann@plajah.com" priority="1"/>',
    '<atom:link href="https://plajah.com/podcast/alb1/feed.xml" rel="self"',
  ]) assert.ok(x.includes(needle), `missing ${needle}`);
  assert.ok(!x.includes('Members only'));
  assert.ok(!x.includes('Cover song'));
  assert.ok(!x.includes('<title>Future</title>'));
  assert.ok(!/plajah.*fee="true"/.test(x));
});

test('feed with no settings derives guid from the feed URL and adds no value block', () => {
  const r = renderPublicFeed('alb1', album(), null, 'https://plajah.com', NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(r.xml.includes(`<podcast:guid>${podcastGuidFor('https://plajah.com/podcast/alb1/feed.xml')}</podcast:guid>`));
  assert.ok(!r.xml.includes('<podcast:value'));
  assert.ok(!r.xml.includes('<podcast:chapters'));
  assert.ok(r.xml.includes('t1.vtt'), 'timed lyrics still give a transcript');
});

// ── Podcast Index ──────────────────────────────────────────────────────────
test('podcast index: no-op without keys; signed pubnotify with keys', async () => {
  assert.deepEqual(await notifyPodcastIndex('https://plajah.com/podcast/a/feed.xml', { creds: null }), { ok: false, skipped: 'not_configured' });
  const h = authHeaders({ key: 'K', secret: 'S' }, 1700000000);
  assert.equal(h.Authorization, sha1Hex('KS1700000000'));
  const calls: string[] = [];
  const fetchImpl = async (url: string) => { calls.push(url); return { ok: true, status: 200, json: async () => (url.includes('pubnotify') ? { status: 'false', description: 'Feed not found' } : { status: 'true', description: 'added' }) }; };
  const r = await notifyPodcastIndex('https://plajah.com/podcast/a/feed.xml', { creds: { key: 'K', secret: 'S' }, fetchImpl, addIfMissing: true });
  assert.ok(r.ok && r.added);
  assert.ok(calls[0].startsWith('https://api.podcastindex.org/api/1.0/hub/pubnotify?url=https%3A%2F%2Fplajah.com'));
  assert.ok(calls[1].includes('/add/byfeedurl?url='));
});

// ── router ─────────────────────────────────────────────────────────────────
async function withServer(fn: (base: string, store: Map<string, any>, pings: string[]) => Promise<void>) {
  const store = new Map<string, any>([['albums/alb1', album()], ['albums/priv', album({ isPrivate: true })]]);
  const pings: string[] = [];
  const app = express();
  app.use(createPodcast20Router({
    fsGet: async p => (store.has(p) ? structuredClone(store.get(p)) : null),
    fsSet: async (p, d) => { store.set(p, structuredClone(d)); return true; },
    verifyIdToken: async t => (t === 'tok-u1' ? 'u1' : t === 'tok-u2' ? 'u2' : null),
    notify: async (url) => { pings.push(url); return { ok: true }; },
    podcastIndexConfigured: () => true,
    base: 'https://plajah.com',
    now: () => NOW,
  }));
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try { await fn(base, store, pings); } finally { server.close(); }
}

test('routes: feed, chapters, transcripts, owner settings', async () => {
  await withServer(async (base, store, pings) => {
    const feed = await fetch(`${base}/podcast/alb1/feed.xml`);
    assert.equal(feed.status, 200);
    assert.match(feed.headers.get('content-type') || '', /application\/rss\+xml/);
    assert.equal((await fetch(`${base}/podcast/priv/feed.xml`)).status, 404);
    assert.equal((await fetch(`${base}/podcast/nope/feed.xml`)).status, 404);

    const vtt = await fetch(`${base}/podcast/alb1/transcript/t1.vtt`);
    assert.equal(vtt.status, 200);
    assert.ok((await vtt.text()).startsWith('WEBVTT'));
    assert.equal((await fetch(`${base}/podcast/alb1/transcript/t2.vtt`)).status, 404, 'paywalled track is not exposed');
    assert.equal((await fetch(`${base}/podcast/alb1/chapters/t1.json`)).status, 404, 'no chapters yet');

    assert.equal((await fetch(`${base}/api/podcast20/alb1/settings`)).status, 401);
    assert.equal((await fetch(`${base}/api/podcast20/alb1/settings`, { headers: { Authorization: 'Bearer tok-u2' } })).status, 403);

    const bad = await fetch(`${base}/api/podcast20/alb1/settings`, {
      method: 'PUT', headers: { Authorization: 'Bearer tok-u1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { value: { recipients: [{ name: 'A', type: 'lnaddress', address: 'a@getalby.com', split: 50 }] } } }),
    });
    assert.equal(bad.status, 400);

    const put = await fetch(`${base}/api/podcast20/alb1/settings`, {
      method: 'PUT', headers: { Authorization: 'Bearer tok-u1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { medium: 'podcast', episodes: { t1: { chapters: [{ startTime: 0, title: 'Open' }] } },
        value: { recipients: [{ name: 'A', type: 'lnaddress', address: 'a@getalby.com', split: 100 }] } } }),
    });
    assert.equal(put.status, 200);
    const body = await put.json() as any;
    assert.equal(body.feedStatus, 'public');
    assert.equal(body.guid, podcastGuidFor('https://plajah.com/podcast/alb1/feed.xml'));
    assert.deepEqual(pings, ['https://plajah.com/podcast/alb1/feed.xml']);
    assert.equal(store.get('podcast20Feeds/alb1').ownerId, 'u1');
    assert.equal(store.get('podcast20Feeds/alb1').podcastIndexNotifiedAt, NOW);

    const ch = await fetch(`${base}/podcast/alb1/chapters/t1.json`);
    assert.equal(ch.status, 200);
    assert.match(ch.headers.get('content-type') || '', /application\/json\+chapters/);
    assert.equal(((await ch.json()) as any).chapters[0].title, 'Open');

    const xml = await (await fetch(`${base}/podcast/alb1/feed.xml`)).text();
    assert.ok(xml.includes('<podcast:valueRecipient name="A" type="lnaddress" address="a@getalby.com" split="100"/>'));
    assert.ok(xml.includes('chapters/t1.json'));
  });
});
