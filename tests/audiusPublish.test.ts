// Publishing a release to Audius, against a fake Audius network (storage node + write API).
// Run: npx tsx --test --experimental-test-module-mocks tests/audiusPublish.test.ts
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const NODE = 'https://node.test';

// tus: "uploads" instantly, reporting half then full progress.
mock.module('tus-js-client', {
  namedExports: {
    Upload: class {
      url = '';
      constructor(private file: Blob, private o: any) {}
      start() {
        const id = `up${++uploads}`;
        lastMeta.push(this.o.metadata);
        this.o.onProgress?.(50, 100);
        this.o.onProgress?.(100, 100);
        this.url = `${NODE}/files/${id}`;
        setTimeout(() => this.o.onSuccess(), 0);
      }
    },
  },
});
let uploads = 0;
const lastMeta: any[] = [];

// Fake timers are awkward with the poll loop; shrink setTimeout delays instead.
const realSetTimeout = globalThis.setTimeout;
(globalThis as any).setTimeout = (fn: any, _ms?: number, ...a: any[]) => realSetTimeout(fn, 0, ...a);

interface World { tokensSeen: string[]; rejectUpload?: string; pollsPerUpload: Map<string, number> }
function installFetch(w: World) {
  (globalThis as any).fetch = async (input: any, init: any = {}) => {
    const url = String(input);
    const json = (b: any, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (url === 'https://api.audius.co/health_check') return json({ data: { network: { content_nodes: [{ endpoint: NODE }] } } });
    if (url.startsWith('https://api.audius.co') && !url.includes('/v1/')) return json({ data: ['https://api.audius.co'] });
    if (url.startsWith('https://files.test/')) return new Response(new Blob(['x'], { type: url.endsWith('.jpg') ? 'image/jpeg' : 'audio/mpeg' }));
    const poll = /\/uploads\/(up\d+)$/.exec(url);
    if (poll) {
      const id = poll[1];
      if (w.rejectUpload === id) return new Response('unsupported audio format', { status: 422 });
      const n = (w.pollsPerUpload.get(id) || 0) + 1;
      w.pollsPerUpload.set(id, n);
      if (n === 1) return json({ status: 'busy', transcode_progress: 0.4 });
      return json({ status: 'done', orig_file_cid: `orig-${id}`, orig_filename: 'f', results: { '320': `cid-${id}` }, probe: { format: { duration: '61.4' } } });
    }
    if (/\/v1\/users\//.test(url)) return json({ data: { user_id: 42 } });
    if (init.method === 'POST' && /\/v1\/(tracks|playlists)\?/.test(url)) {
      w.tokensSeen.push(String(init.headers?.Authorization));
      const body = JSON.parse(init.body);
      if (url.includes('/tracks')) {
        assert.ok(body.track_cid?.startsWith('cid-'), 'track_cid comes from results[320]');
        return json({ track_id: `T${w.tokensSeen.length}` });
      }
      assert.equal(body.is_album, true);
      return json({ playlist_id: 'P1' });
    }
    if (/\/v1\/(tracks|playlists)\//.test(url)) return json({ data: null });
    throw new Error(`unexpected fetch ${url}`);
  };
}

const album = (n: number): any => ({
  id: 'a1', title: 'Record', coverImage: 'https://files.test/cover.jpg',
  tracks: Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `Song ${i}`, url: `https://files.test/s${i}.mp3` })),
});

test('every write asks for a fresh token, progress moves within a track, and an album is made', async () => {
  const { publishAlbumToAudius } = await import('../services/audiusService');
  const w: World = { tokensSeen: [], pollsPerUpload: new Map() };
  installFetch(w);
  let calls = 0;
  const getToken = async () => `tok${++calls}`;
  const events: any[] = [];
  const res = await publishAlbumToAudius(album(3), getToken, 'hashU', (d, t, c) => events.push([d, t, c?.phase, c?.fraction]), 'me');
  assert.deepEqual(res.failed, []);
  assert.equal(res.error, undefined);
  assert.equal(res.published.length, 3);
  assert.equal(res.albumId, 'P1');
  // 3 track writes + 1 album write, each with its own freshly fetched token.
  assert.deepEqual(w.tokensSeen, ['Bearer tok1', 'Bearer tok2', 'Bearer tok3', 'Bearer tok4']);
  assert.ok(events.some(e => e[0] === 0 && e[2] === 'upload' && e[3] === 0.5), 'upload progress inside track 1');
  assert.ok(events.some(e => e[0] === 1 && e[2] === 'processing' && e[3] === 0.4), 'transcode progress inside track 2');
  assert.deepEqual(events.at(-1).slice(0, 2), [3, 3]);
  // userId rides on audio uploads only, like the SDK.
  assert.ok(lastMeta.some(m => m.template === 'audio' && m.userId === '42'));
  assert.ok(lastMeta.filter(m => m.template === 'img_square').every(m => !('userId' in m)));
});

test('a file the storage node rejects fails fast with its reason, and no album is made', async () => {
  const { publishAlbumToAudius } = await import('../services/audiusService');
  const w: World = { tokensSeen: [], pollsPerUpload: new Map(), rejectUpload: `up${uploads + 3}` }; // cover, song0, song1 → reject song1
  installFetch(w);
  const res = await publishAlbumToAudius(album(3), async () => 'tok', 'hashU');
  assert.equal(res.published.length, 2);
  assert.equal(res.failed.length, 1);
  assert.match(res.failed[0], /^Song 1: Audius couldn't process .*unsupported audio format/);
  assert.equal(res.albumId, undefined, 'no partial album');
});

test('an expired sign-in stops the run instead of failing every song', async () => {
  const { publishAlbumToAudius } = await import('../services/audiusService');
  const w: World = { tokensSeen: [], pollsPerUpload: new Map() };
  installFetch(w);
  const res = await publishAlbumToAudius(album(3), async () => { throw new Error('Your Audius sign-in expired. Reconnect Audius with upload permission and try again.'); }, 'hashU');
  assert.equal(res.published.length, 0);
  assert.equal(res.failed.length, 1, 'stopped after the first refusal');
  assert.match(res.error!, /sign-in expired/);
});

test('a retry skips songs already on Audius', async () => {
  const { publishAlbumToAudius } = await import('../services/audiusService');
  const w: World = { tokensSeen: [], pollsPerUpload: new Map() };
  installFetch(w);
  const res = await publishAlbumToAudius(album(2), async () => 'tok', 'hashU', undefined, 'me', { t0: 'OLD0' });
  assert.deepEqual(res.published.map(p => p.trackId), ['OLD0', 'T1']);
  assert.equal(res.albumId, 'P1');
});
